"""Actual embedded source appearance through fitting, inventory and draft steps."""
import base64
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import struct
import numpy as np
import pytest
from PIL import Image
import trimesh
from lego_builder.source_color import read_glb_colors, sample_texture, palette, srgb_to_linear, linear_to_lab
from lego_builder.generic import fit_shell, generate_obj
from lego_builder.assembly import inventory, ldraw_text, validate_candidate, publish_candidate
from lego_builder.ldraw_library import LDrawLibrary
from lego_builder.mesh import ConversionError
from lego_builder.service import validate_request, canonical_settings_hash, convert_payload, RequestError


def pack_glb(doc, binary):
    doc['buffers']=[{'byteLength':len(binary)}]
    meta=json.dumps(doc,separators=(',',':')).encode(); meta+=b' '*((-len(meta))%4)
    binary+=b'\0'*((-len(binary))%4)
    return struct.pack('<III',0x46546c67,2,28+len(meta)+len(binary))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(binary),0x004e4942)+binary


def fixture_glb(*, mutate=None, reflected=False, vertex_color=False):
    # Twelve large cube triangles; blue at every UV corner, red in their interior.
    mesh=trimesh.creation.box(); positions=mesh.triangles.reshape(-1,3).astype('<f4')
    uv=np.tile([[0,0],[1,0],[0,1]],(12,1)).astype('<f4')
    pixels=np.zeros((12,12,3),dtype=np.uint8); pixels[:]=[0,0,255]; pixels[2:7,2:7]=[255,0,0]
    stream=io.BytesIO(); Image.fromarray(pixels).save(stream,format='PNG'); png=stream.getvalue()
    binary=positions.tobytes()+uv.tobytes()+png
    doc={'asset':{'version':'2.0'},'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':positions.nbytes}, {'buffer':0,'byteOffset':positions.nbytes,'byteLength':uv.nbytes}, {'buffer':0,'byteOffset':positions.nbytes+uv.nbytes,'byteLength':len(png)}],
         'accessors':[{'bufferView':0,'componentType':5126,'count':36,'type':'VEC3'},{'bufferView':1,'componentType':5126,'count':36,'type':'VEC2'}],
         'images':[{'bufferView':2,'mimeType':'image/png'}],'textures':[{'source':0,'sampler':0}],'samplers':[{'wrapS':33071,'wrapT':33071,'magFilter':9728}],
         'materials':[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],
         'meshes':[{'primitives':[{'attributes':{'POSITION':0,'TEXCOORD_0':1},'material':0}]}],
         'nodes':[{'mesh':0,'translation':[2,3,4],'scale':[-1,1,1] if reflected else [1,1,1]}], 'scenes':[{'nodes':[0]}],'scene':0}
    if vertex_color:
        while len(binary)%4:binary+=b'\0'
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':36*3*4})
        binary+=np.tile([.5,.25,1],(36,1)).astype('<f4').tobytes()
        doc['accessors'].append({'bufferView':3,'componentType':5126,'count':36,'type':'VEC3'})
        doc['meshes'][0]['primitives'][0]['attributes']['COLOR_0']=2
    out=positions.copy(); out*=doc['nodes'][0]['scale']; out+=[2,3,4]
    faces=np.arange(36).reshape(-1,3)
    if reflected:faces=faces[:,[0,2,1]]
    obj=''.join('v '+' '.join(str(float(v)) for v in p)+'\n' for p in out)+''.join('f '+' '.join(str(v+1) for v in f)+'\n' for f in faces)
    if mutate:mutate(doc)
    return pack_glb(doc,binary),obj.encode()


def payload(glb,obj):
    sha=hashlib.sha256(glb).hexdigest(); settings={'inputUpAxis':'y','targetParts':100,'colorMode':'source','sourceGlbSha256':sha}
    return {'schemaVersion':2,'obj':obj.decode(),'glbBase64':base64.b64encode(glb).decode(),'sourceObjSha256':hashlib.sha256(obj).hexdigest(),
            'sourceGlbSha256':sha,'settingsSha256':canonical_settings_hash(settings),'settings':settings}


@pytest.mark.parametrize('reflected',[False,True])
def test_interior_texture_color_survives_transformed_reflected_triangles(reflected):
    glb,obj=fixture_glb(reflected=reflected)
    surface=read_glb_colors(glb,obj)
    # UV center differs from every corner; vertex-only color baking fails this.
    values=surface.sample([0,0,0,0],np.array([[1,0,0],[0,1,0],[0,0,1],[1/3]*3]))
    assert np.allclose(values[:3],[[0,0,1]]*3)
    assert np.allclose(values[3],[1,0,0])


def test_vertex_factor_texture_multiply_in_linear_space():
    glb,obj=fixture_glb(vertex_color=True,mutate=lambda d:d['materials'][0]['pbrMetallicRoughness'].update(baseColorFactor=[.5,.5,.5,1]))
    surface=read_glb_colors(glb,obj)
    assert np.allclose(surface.sample([0],[[1/3]*3]),[[.25,0,0]])


def test_texture_orientation_wrap_and_linear_filtering():
    pixels=np.array([[[255,0,0],[0,255,0]],[[0,0,255],[255,255,255]]],dtype=np.uint8)
    assert np.allclose(sample_texture(pixels,np.array([[.25,.25],[.25,.75]]),nearest=True),[[1,0,0],[0,0,1]])
    assert np.allclose(sample_texture(pixels,np.array([[1.25,.25]]),10497,10497,True),[[1,0,0]])
    assert np.allclose(sample_texture(pixels,np.array([[1.25,.25]]),33648,10497,True),[[0,1,0]])
    assert np.allclose(sample_texture(pixels,np.array([[.5,.25]]),33071,33071),[[.5,.5,0]])


@pytest.mark.parametrize('mutate',[
    lambda d:d['buffers'].append({'uri':'https://example.test/private'}),
    lambda d:d['images'][0].update(uri='file:///etc/passwd'),
    lambda d:d['images'][0].update(uri='data:image/png;base64,a'),
    lambda d:d['images'][0].update(mimeType='image/jpeg'),
    lambda d:d['materials'][0].update(alphaMode='BLEND'),
    lambda d:d['materials'][0].update(extensions={'KHR_texture_transform':{}}),
    lambda d:d['nodes'][0].update(children=[0]),
    lambda d:d['nodes'][0].update(scale=[0,1,1]),
    lambda d:d['accessors'][1].update(count=1000000),
])
def test_untrusted_source_resources_fail_closed(mutate):
    # buffers are installed by pack_glb after mutations, so create one for test.
    def edit(d):
        d['buffers']=[];mutate(d)
        if d['buffers']:d['extras']={'unsafe':d['buffers']}
    glb,obj=fixture_glb(mutate=edit)
    with pytest.raises(ConversionError):read_glb_colors(glb,obj)


def test_geometry_mismatch_and_bad_image_fail_closed():
    glb,obj=fixture_glb()
    with pytest.raises(ConversionError,match='geometry differ'):read_glb_colors(glb,obj.replace(b'v 1.5',b'v 9.5',1))
    at=glb.index(b'\x89PNG')
    broken=glb[:at]+b'NOT!'+glb[at+4:]
    with pytest.raises(ConversionError):read_glb_colors(broken,obj)


def test_source_hash_contract_and_repeated_hash_binding():
    glb,obj=fixture_glb(); p=payload(glb,obj)
    assert validate_request(json.dumps(p).encode())[1]==obj
    p['sourceGlbSha256']='0'*64
    with pytest.raises(RequestError,match='invalid_settings'):validate_request(json.dumps(p).encode())
    p['settings']['sourceGlbSha256']='0'*64
    with pytest.raises(RequestError,match='source_glb_hash_mismatch'):validate_request(json.dumps(p).encode())
    p=payload(glb,obj);p['glbBase64']='???'
    with pytest.raises(RequestError,match='invalid_glb_base64'):validate_request(json.dumps(p).encode())


def test_palette_is_deterministic_and_every_color_has_manufactured_fallback():
    codes,labs,available=palette("source-solid-palette-v1")
    assert codes.tolist()==[0,1,2,4,14,15,71,72]
    assert all(('3024',int(c)) in available for c in codes)
    assert np.array_equal(np.argmin(((labs[:,None]-labs[None,:])**2).sum(axis=2),axis=1),np.arange(8))


def test_palette_versions_keep_legacy_codes_and_expand_v2_only():
    legacy,_,_=palette("source-solid-palette-v1")
    current,_,available=palette("source-solid-palette-v2")
    assert legacy.tolist()==[0,1,2,4,14,15,71,72]
    assert len(current)==26 and set(legacy).issubset(current)
    assert all(("3024",int(code)) in available for code in current)
    with pytest.raises(ConversionError,match="palette"):palette("not-a-palette")


def test_fitting_never_spans_color_boundary_or_unreviewed_part_color():
    shell=np.ones((4,2,3),dtype=bool);colors=np.full(shell.shape,4);colors[2:]=1
    _,_,available=palette("source-solid-palette-v1"); metadata={}
    placements,covered=fit_shell(shell,shell,metadata,colors,available)
    assert covered.all()
    assert {p['color'] for p in placements}=={1,4}
    assert all((p['part_id'],p['color']) in available for p in placements)
    assert all(p['part_id'] in ('3004','3005','3024') for p in placements)
    for p in placements:
        # A red placement lies entirely on the left; blue entirely on the right.
        assert (p['position_ldu'][0]<0)==(p['color']==4)


def test_actual_colored_candidate_keeps_ldr_inventory_and_draft_steps_consistent(tmp_path):
    glb,obj=fixture_glb(); obj_path=tmp_path/'source.obj'; glb_path=tmp_path/'source.glb'
    obj_path.write_bytes(obj);glb_path.write_bytes(glb)
    model=generate_obj(obj_path,target_parts=100,max_trials=2,source_glb=glb_path,palette_version="source-solid-palette-v1")
    assert {p['color'] for p in model['placements']}=={1,4}
    library=LDrawLibrary(Path(__file__).parents[1]/'lego_builder/data/parts-library')
    model,report=publish_candidate(tmp_path/'result',model,library)
    assert report['artifact_checks_passed']
    ldr=ldraw_text(model);bom=inventory(model)
    assert validate_candidate(model,ldr,bom)['artifact_checks_passed']
    records=Counter((line.split()[-1][:-4],int(line.split()[1])) for line in ldr.splitlines() if line.startswith('1 '))
    assert records==Counter({(r['part_id'],r['color']):r['quantity'] for r in bom['items']})
    assert sum(len(g['placement_ids']) for g in model['instruction_plan']['groups'])==len(model['placements'])
    assert ldr.rstrip().endswith('0 STEP')


@pytest.mark.parametrize("version", [None, "source-solid-palette-v1", "source-solid-palette-v2"])
def test_real_source_color_worker_contract(version):
    glb,obj=fixture_glb(); p=payload(glb,obj)
    if version is not None:
        p["settings"]["paletteVersion"] = version
        p["settingsSha256"] = canonical_settings_hash(p["settings"])
    validate_request(json.dumps(p).encode())
    response=convert_payload(p,obj,timeout=90)
    assert response['schemaVersion']==2 and response['sourceGlbSha256']==p['sourceGlbSha256']
    codes=sorted({int(line.split()[1]) for line in response['ldr'].splitlines() if line.startswith('1 ')})
    assert codes==response['colorSummary']['usedColorCodes']
    assert response['colorSummary']['paletteVersion']==(version or 'source-solid-palette-v1')
    if version != 'source-solid-palette-v2': assert codes==[1,4]
    assert response['colorSummary']['method']=='surface-base-color-to-palette-v1'


def test_oversized_decoded_texture_rejected_before_pixel_allocation():
    glb,obj=fixture_glb()
    meta_length=struct.unpack_from('<I',glb,12)[0]
    doc=json.loads(glb[20:20+meta_length]); binary=glb[28+meta_length:]
    stream=io.BytesIO();Image.new('RGB',(2049,1)).save(stream,format='PNG')
    start=doc['bufferViews'][2]['byteOffset'];image=stream.getvalue()
    doc['bufferViews'][2]['byteLength']=len(image)
    enlarged=pack_glb(doc,binary[:start]+image)
    with pytest.raises(ConversionError,match='dimensions'):read_glb_colors(enlarged,obj)


def test_settings_v2_rejects_unknown_keys_and_boolean_targets():
    glb,obj=fixture_glb()
    for field,value in [('targetParts',True),('inputUpAxis','unknown'),('colorMode','gray'),('paletteVersion','unknown'),('unknown',1)]:
        p=payload(glb,obj);p['settings'][field]=value
        with pytest.raises(RequestError,match='invalid_settings'):validate_request(json.dumps(p).encode())
    p=payload(glb,obj);p['unexpected']=1
    with pytest.raises(RequestError,match='invalid_contract'):validate_request(json.dumps(p).encode())
