"""Bounded embedded glTF base-color sampling, independent of material file paths.

Texture pixels are sRGB; factors and vertex colors are linear. The mapping uses
D65 CIELAB distance to a reviewed solid-color palette, with stable code tie breaks.
"""
from __future__ import annotations
import io
import json
from pathlib import Path
import struct
import warnings
import numpy as np
import trimesh
from PIL import Image
from .mesh import ConversionError

MAX_GLB_BYTES = 16 * 1024 * 1024
PALETTE_VERSION = "source-solid-palette-v1"
METHOD = "surface-base-color-to-palette-v1"
LIMITATIONS = ["palette-approximation", "one-color-per-part", "materials-not-reproduced"]


def fail(message):
    raise ConversionError("invalid_source_color", message)


def integer(value):
    if type(value) is not int or value < 0:
        fail("Invalid nonnegative integer in color source.")
    return value


def obj(value):
    if not isinstance(value, dict): fail("Invalid color source object.")
    return value


def arr(value):
    if not isinstance(value, list): fail("Invalid color source array.")
    return value


def ref(items, index):
    index = integer(index)
    if index >= len(items): fail("Color source index exceeds resource.")
    return obj(items[index])


def vector(value, length):
    if not isinstance(value, list) or len(value) != length or any(type(v) not in (int, float) for v in value):
        fail("Invalid source color vector.")
    result = np.asarray(value, dtype=float)
    if not np.isfinite(result).all(): fail("Nonfinite source color vector.")
    return result


def no_duplicates(pairs):
    out = {}
    for key, value in pairs:
        if key in out: fail("Duplicate GLB JSON key.")
        out[key] = value
    return out


def srgb_to_linear(value):
    value = np.asarray(value, dtype=float)
    return np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)


def linear_to_lab(value):
    xyz = np.asarray(value) @ np.array([[.4124564,.3575761,.1804375],[.2126729,.7151522,.0721750],[.0193339,.1191920,.9503041]]).T
    xyz /= [.95047, 1, 1.08883]
    f = np.where(xyz > (6/29)**3, np.cbrt(xyz), xyz/(3*(6/29)**2)+4/29)
    return np.stack([116*f[...,1]-16, 500*(f[...,0]-f[...,1]), 200*(f[...,1]-f[...,2])], axis=-1)


def color_evidence():
    path = Path(__file__).parent / "data" / "source-color-evidence.json"
    evidence = json.loads(path.read_text())
    return evidence


def palette():
    evidence = color_evidence()
    available = {(r["part_id"], r["ldraw_color"]) for r in evidence["lot_evidence"] if r["status"] == "verified"}
    legacy = json.loads((Path(__file__).parent / "data" / "vehicle-color-evidence.json").read_text())
    available.update((r["part_id"], r["ldraw_color"]) for r in legacy["lot_evidence"] if r["status"] == "verified")
    colors = sorted(evidence["color_mappings"], key=lambda r: r["ldraw_color"])
    # A reviewed 1x1 plate guarantees that every quantized cell can be fitted.
    colors = [r for r in colors if ("3024", r["ldraw_color"]) in available]
    if not colors: fail("No reviewed solid-color palette is available.")
    codes = np.array([r["ldraw_color"] for r in colors], dtype=np.int16)
    rgb = np.array([[int(r["rgb"].lstrip("#")[i:i+2], 16)/255 for i in (0,2,4)] for r in colors])
    return codes, linear_to_lab(srgb_to_linear(rgb)), available


class ColorSurface:
    def __init__(self, triangles, colors, uvs, materials):
        self.triangles = np.asarray(triangles, dtype=float)
        self.colors = np.asarray(colors, dtype=float)
        self.uvs = np.asarray(uvs, dtype=float)
        self.materials = materials

    def sample(self, face_ids, barycentric):
        """Sample continuous triangle interiors, not a vertex-baked texture."""
        face_ids = np.asarray(face_ids, dtype=int)
        barycentric = np.asarray(barycentric, dtype=float)
        result = np.einsum('ij,ijk->ik', barycentric, self.colors[face_ids])
        for material_id in sorted({self.materials[i][0] for i in face_ids}):
            mask = np.array([self.materials[i][0] == material_id for i in face_ids])
            _, factor, texture = self.materials[face_ids[np.flatnonzero(mask)[0]]]
            result[mask] *= factor[:3]
            if texture is not None:
                image, wrap_s, wrap_t, nearest = texture
                uv = np.einsum('ij,ijk->ik', barycentric[mask], self.uvs[face_ids[mask]])
                result[mask] *= sample_texture(image, uv, wrap_s, wrap_t, nearest)
        return np.clip(result, 0, 1)

    def cell_colors(self, shell, metadata):
        codes, labs, available = palette()
        matrix = np.asarray(metadata["source_to_grid_matrix"])
        triangles = self.triangles @ matrix[:3,:3].T + matrix[:3,3]
        # Distances use physical stud/plate proportions, not anisotropic cell units.
        triangles *= [20,20,8]
        mesh = trimesh.Trimesh(vertices=triangles.reshape(-1,3), faces=np.arange(len(triangles)*3).reshape(-1,3), process=False)
        cells = np.argwhere(shell)
        result = np.full(shell.shape, -1, dtype=np.int16)
        # Bounded chunks avoid large nearest-triangle candidate allocations.
        for start in range(0, len(cells), 256):
            block = cells[start:start+256]
            points = (block + .5) * [20,20,8]
            closest, _, faces = trimesh.proximity.closest_point(mesh, points)
            barycentric = trimesh.triangles.points_to_barycentric(triangles[faces], closest)
            barycentric = np.clip(barycentric,0,1)
            barycentric /= barycentric.sum(axis=1)[:,None]
            lab = linear_to_lab(self.sample(faces,barycentric))
            selected = codes[np.argmin(((lab[:,None,:]-labs[None,:,:])**2).sum(axis=2), axis=1)]
            result[tuple(block.T)] = selected
        metadata["source_color"] = {"mode":"source", "method":METHOD, "paletteVersion":PALETTE_VERSION,
            "sourceHasColor":True, "usedColorCodes":sorted(int(v) for v in np.unique(result[shell])),
            "limitations":LIMITATIONS, "sampling":"nearest continuous source triangle at shell cell centers; barycentric base color; D65 CIELAB nearest reviewed solid color"}
        metadata["warnings"][-1] = "Interior mesh interfaces are removed where enclosed; source base colors are approximated by solid LEGO colors."
        return result, available


def sample_texture(image, uv, wrap_s=10497, wrap_t=10497, nearest=False):
    # glTF UV origin is the image's upper left, matching decoded row zero.
    height, width = image.shape[:2]
    def index(values, length, mode):
        if mode == 33071: return np.clip(values, 0, length-1)
        if mode == 10497: return values % length
        if mode == 33648:
            folded = values % (2*length)
            return np.where(folded < length, folded, 2*length-1-folded)
        fail("Unsupported texture wrap mode.")
    if nearest:
        x = index(np.floor(uv[:,0]*width).astype(np.int64),width,wrap_s)
        y = index(np.floor(uv[:,1]*height).astype(np.int64),height,wrap_t)
        return srgb_to_linear(image[y,x,:3]/255)
    # Hardware filtering interpolates sRGB-decoded linear texels.
    xy = uv * [width,height] - .5
    low = np.floor(xy).astype(np.int64); frac = xy-low
    result = np.zeros((len(uv),3))
    for dx in (0,1):
        for dy in (0,1):
            x=index(low[:,0]+dx,width,wrap_s); y=index(low[:,1]+dy,height,wrap_t)
            weight=(frac[:,0] if dx else 1-frac[:,0])*(frac[:,1] if dy else 1-frac[:,1])
            result += srgb_to_linear(image[y,x,:3]/255)*weight[:,None]
    return result


def read_glb_colors(raw, obj_bytes):
    """Decode only embedded bounded resources and prove geometry correspondence."""
    try:
        return _read_glb_colors(raw,obj_bytes)
    except ConversionError:
        raise
    except (ValueError, TypeError, KeyError, IndexError, OverflowError, UnicodeError, struct.error, OSError, RecursionError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ConversionError("invalid_source_color", "Malformed or unsupported embedded source appearance.") from exc


def _read_glb_colors(raw, obj_bytes):
    if len(raw)<28 or len(raw)>MAX_GLB_BYTES or struct.unpack_from('<III',raw) != (0x46546c67,2,len(raw)):
        fail("Invalid or oversized GLB.")
    chunks=[]; offset=12
    while offset+8 <= len(raw):
        length,kind=struct.unpack_from('<II',raw,offset); offset+=8
        if length%4 or offset+length>len(raw): fail("Invalid GLB chunk.")
        chunks.append((kind,raw[offset:offset+length])); offset+=length
    if offset != len(raw) or len(chunks)!=2 or [v[0] for v in chunks] != [0x4e4f534a,0x004e4942] or len(chunks[0][1])>1024*1024:
        fail("GLB must contain one JSON and one binary chunk.")
    doc=obj(json.loads(chunks[0][1].decode(),object_pairs_hook=no_duplicates)); binary=chunks[1][1]
    def safe(value,depth=0):
        if depth>64: fail("GLB metadata is too deep.")
        if isinstance(value,dict):
            if 'uri' in value or 'sparse' in value: fail("External or sparse source resources are unsupported.")
            if 'extensions' in value and set(obj(value['extensions']))-{'KHR_materials_unlit'}: fail("Unsupported GLB extension.")
            for item in value.values(): safe(item,depth+1)
        elif isinstance(value,list):
            for item in value: safe(item,depth+1)
        elif isinstance(value,float) and not np.isfinite(value): fail("Nonfinite GLB metadata.")
    safe(doc)
    if obj(doc.get('asset')).get('version')!='2.0' or doc.get('animations') or doc.get('skins'):
        fail("Unsupported GLB asset.")
    if any(e!='KHR_materials_unlit' for e in arr(doc.get('extensionsUsed',[]))+arr(doc.get('extensionsRequired',[]))): fail("Unsupported GLB extension.")
    buffers=arr(doc.get('buffers'))
    if len(buffers)!=1: fail("GLB must contain one embedded buffer.")
    buffer_length=integer(obj(buffers[0]).get('byteLength'))
    if buffer_length>len(binary) or len(binary)-buffer_length>3: fail("Invalid embedded buffer length.")
    views=arr(doc.get('bufferViews',[])); accessors=arr(doc.get('accessors',[]))
    def view_bytes(index):
        view=ref(views,index)
        if integer(view.get('buffer',0))!=0: fail("Invalid source buffer.")
        start=integer(view.get('byteOffset',0)); length=integer(view.get('byteLength'))
        if start+length>buffer_length: fail("Buffer view exceeds embedded data.")
        return view,start,length
    def access(index,semantic):
        a=ref(accessors,index); view,start,length=view_bytes(a.get('bufferView'))
        count=integer(a.get('count')); component=a.get('componentType'); n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}.get(a.get('type'))
        dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}.get(component)
        if not dtype or not n or not 0<count<=150000: fail("Unsupported or oversized accessor.")
        size=np.dtype(dtype).itemsize; stride=integer(view.get('byteStride',size*n)); local=integer(a.get('byteOffset',0))
        if stride<size*n or stride>252 or stride%size or local%size or local+(count-1)*stride+size*n>length: fail("Invalid accessor bounds.")
        normalized=a.get('normalized',False)
        if type(normalized) is not bool: fail("Invalid normalized accessor.")
        if semantic=='POSITION' and (component!=5126 or n!=3 or normalized or count>25000): fail("Unsupported positions.")
        if semantic=='indices' and (component not in (5121,5123,5125) or n!=1 or normalized): fail("Unsupported indices.")
        if semantic in ('uv','color') and not (component==5126 and not normalized or component in (5121,5123) and normalized): fail("Unsupported appearance accessor.")
        if semantic=='uv' and n!=2 or semantic=='color' and n not in (3,4): fail("Invalid appearance accessor shape.")
        out=np.ndarray((count,n),dtype=dtype,buffer=binary,offset=start+local,strides=(stride,size)).astype(float)
        if normalized: out/=(255 if component==5121 else 65535)
        if not np.isfinite(out).all() or semantic=='color' and ((out<0)|(out>1)).any() or semantic=='uv' and (abs(out)>1e6).any(): fail("Invalid appearance values.")
        return out
    images=arr(doc.get('images',[])); textures=arr(doc.get('textures',[])); materials=arr(doc.get('materials',[])); samplers=arr(doc.get('samplers',[]))
    if len(images)>8 or len(textures)>16 or len(materials)>64 or len(samplers)>16: fail("Appearance resource limit exceeded.")
    decoded=[]; pixels=0; image_bytes=0
    for image in images:
        image=obj(image); _,start,length=view_bytes(image.get('bufferView')); image_bytes+=length
        if image_bytes>8*1024*1024 or image.get('mimeType') not in ('image/png','image/jpeg'): fail("Unsupported or oversized embedded image.")
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(binary[start:start+length]),formats=['PNG','JPEG']) as im:
                w,h=im.size; pixels+=w*h
                if not 0<w<=2048 or not 0<h<=2048 or pixels>2048**2 or im.format!=('PNG' if image['mimeType']=='image/png' else 'JPEG') or getattr(im,'n_frames',1)!=1:
                    fail("Embedded image dimensions or format unsupported.")
                im.load(); decoded.append(np.asarray(im.convert('RGB')))
    def material(index,attributes,count):
        if index is None: return (-1,np.ones(4),None),np.zeros((count,2))
        m=ref(materials,index)
        if m.get('alphaMode','OPAQUE')!='OPAQUE': fail("Transparent or masked source materials are unsupported for solid-color conversion.")
        pbr=obj(m.get('pbrMetallicRoughness',{})); factor=vector(pbr.get('baseColorFactor',[1,1,1,1]),4)
        if ((factor<0)|(factor>1)).any(): fail("Invalid base color factor.")
        slot=pbr.get('baseColorTexture'); uv=np.zeros((count,2)); texture=None
        if slot is not None:
            slot=obj(slot); coord=integer(slot.get('texCoord',0))
            if coord>1: fail("Unsupported UV set.")
            uv=access(attributes.get('TEXCOORD_'+str(coord)),'uv')
            if len(uv)!=count: fail("UV and geometry counts differ.")
            tex=ref(textures,slot.get('index')); image=integer(tex.get('source'))
            if image>=len(decoded): fail("Invalid texture image index.")
            sampler={} if 'sampler' not in tex else ref(samplers,tex['sampler'])
            wraps=[sampler.get(k,10497) for k in ('wrapS','wrapT')]
            if any(w not in (10497,33071,33648) for w in wraps) or sampler.get('magFilter',9729) not in (9728,9729) or sampler.get('minFilter',9987) not in (9728,9729,9984,9985,9986,9987): fail("Unsupported texture sampler.")
            texture=(decoded[image],*wraps,sampler.get('magFilter',9729)==9728)
        return (integer(index),factor,texture),uv
    nodes=arr(doc.get('nodes',[])); meshes=arr(doc.get('meshes',[])); scenes=arr(doc.get('scenes',[]))
    if len(nodes)>1024: fail("Node graph limit exceeded.")
    triangles=[]; colors=[]; uvs=[]; face_materials=[]; vertices=0; faces=0; visits=0; primitives=0; has_color=False
    def visit(index,parent,stack):
        nonlocal vertices,faces,visits,primitives,has_color
        index=integer(index); visits+=1
        if index in stack or len(stack)>64 or visits>4096: fail("Invalid or oversized scene graph.")
        node=ref(nodes,index)
        if 'skin' in node or 'weights' in node: fail("Unsupported animated geometry.")
        if 'matrix' in node:
            if any(k in node for k in ('translation','rotation','scale')): fail("Mixed node transform representations.")
            local=vector(node['matrix'],16).reshape(4,4).T
        else:
            t=vector(node.get('translation',[0,0,0]),3); s=vector(node.get('scale',[1,1,1]),3); q=vector(node.get('rotation',[0,0,0,1]),4)
            if abs(np.linalg.norm(q)-1)>1e-5: fail("Nonunit node rotation.")
            x,y,z,w=q
            local=np.eye(4); local[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]])@np.diag(s); local[:3,3]=t
        world=parent@local; det=np.linalg.det(world[:3,:3])
        if not np.isfinite(world).all() or not np.allclose(world[3],[0,0,0,1],atol=1e-10,rtol=0) or abs(det)<1e-12: fail("Invalid scene transform.")
        if 'mesh' in node:
            mesh=ref(meshes,node['mesh'])
            if 'weights' in mesh or 'extensions' in mesh: fail("Unsupported mesh.")
            for p in arr(mesh.get('primitives')):
                p=obj(p); primitives+=1
                if primitives>256 or p.get('mode',4)!=4 or 'targets' in p or 'extensions' in p: fail("Unsupported primitives.")
                attributes=obj(p.get('attributes')); position=access(attributes.get('POSITION'),'POSITION')
                if set(attributes)-{'POSITION','NORMAL','TANGENT','COLOR_0','TEXCOORD_0','TEXCOORD_1'}: fail("Unsupported attributes.")
                idx=np.arange(len(position)) if 'indices' not in p else access(p['indices'],'indices').astype(np.int64).reshape(-1)
                if len(idx)%3 or (idx>=len(position)).any(): fail("Invalid triangle indices.")
                idx=idx.reshape(-1,3)
                if det<0: idx=idx[:,[0,2,1]]
                vertices+=len(position); faces+=len(idx)
                if vertices>25000 or faces>50000: fail("Flattened geometry resource limit exceeded.")
                transformed=position@world[:3,:3].T+world[:3,3]
                if not np.isfinite(transformed).all() or (abs(transformed)>np.finfo(np.float32).max).any(): fail("Transformed positions exceed finite float32 range.")
                color=np.ones((len(position),3)) if 'COLOR_0' not in attributes else access(attributes['COLOR_0'],'color')[:,:3]
                if len(color)!=len(position): fail("Color and geometry counts differ.")
                mat,uv=material(p.get('material'),attributes,len(position))
                has_color |= 'COLOR_0' in attributes or 'material' in p
                triangles.extend(transformed[idx]); colors.extend(color[idx]); uvs.extend(uv[idx]); face_materials.extend([mat]*len(idx))
        for child in arr(node.get('children',[])): visit(child,world,stack|{index})
    scene=ref(scenes,doc.get('scene',0))
    for root in arr(scene.get('nodes',[])): visit(root,np.eye(4),set())
    if not faces or not has_color: fail("The retained source has no authored base-color appearance.")
    # The original OBJ is an immutable geometry-only handoff, with exactly the
    # selected transformed primitive order (including reflected winding).
    obj_vertices=[]; obj_faces=[]
    for line in obj_bytes.decode('utf-8-sig').splitlines():
        f=line.split()
        if not f or f[0].startswith('#'): continue
        if f[0]=='v' and len(f)==4: obj_vertices.append([float(v) for v in f[1:]])
        elif f[0]=='f' and len(f)==4 and all(v.isdigit() for v in f[1:]): obj_faces.append([int(v)-1 for v in f[1:]])
        else: fail("Appearance pairing requires the exact prepared geometry-only OBJ.")
    if len(obj_vertices)!=vertices or len(obj_faces)!=faces or any(min(f)<0 or max(f)>=vertices for f in obj_faces): fail("Source OBJ and GLB geometry differ.")
    expected=np.asarray(obj_vertices)[obj_faces]; actual=np.asarray(triangles)
    if not np.isfinite(expected).all() or not np.allclose(expected,actual,atol=1e-9,rtol=1e-9): fail("Source OBJ and GLB geometry differ.")
    triangle_mesh=trimesh.Trimesh(vertices=actual.reshape(-1,3),faces=np.arange(len(actual)*3).reshape(-1,3),process=False)
    usable=triangle_mesh.nondegenerate_faces()
    if not usable.any(): fail("Source has no usable color surface.")
    return ColorSurface(actual[usable],np.asarray(colors)[usable],np.asarray(uvs)[usable],[m for m,keep in zip(face_materials,usable) if keep])
