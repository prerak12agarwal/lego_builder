"""Bounded, source-agnostic OBJ exterior reconstruction with real LDraw parts.

The algorithm reads geometry only. No filenames, object names, materials, animal
or vehicle templates select geometry. This is an approximate digital sculpture,
not a proof of physical assembly or universal artistic quality.
"""
from __future__ import annotations
import hashlib
import io
import math
from pathlib import Path
import numpy as np
from scipy import ndimage
import trimesh
from .assembly import SCHEMA, revision
from .mesh import ConversionError, surface_voxels, MAX_BYTES, MAX_FACES

ALGORITHM = "generic-exterior-shell-v1"
MAX_GRID_CELLS = 500_000
MAX_OUTPUT_PARTS = 10_000
# Actual LDraw local X is the long dimension for these rectangular parts.
RECTANGLES = [("3001",4,2,3),("3003",2,2,3),("3010",4,1,3),("3622",3,1,3),
              ("3004",2,1,3),("3005",1,1,3),("3020",4,2,1),("3021",3,2,1),
              ("3022",2,2,1),("3710",4,1,1),("3623",3,1,1),("3023",2,1,1),("3024",1,1,1)]
TILES = [("87079",4,2),("26603",3,2),("3068b",2,2),("2431",4,1),
         ("63864",3,1),("3069b",2,1),("3070b",1,1)]
YAW = [np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]]) for a in (0,math.pi/2,math.pi,3*math.pi/2)]


def read_obj(path):
    """Accept finite triangle soups; discard only degenerate/coincident geometry."""
    path=Path(path)
    if path.suffix.lower() != ".obj":
        raise ConversionError("unsupported_format","Generic exterior conversion accepts OBJ geometry.")
    if not path.is_file():
        raise ConversionError("input_missing","OBJ file does not exist.")
    if path.stat().st_size>MAX_BYTES:
        raise ConversionError("resource_limit","OBJ exceeds the 80 MiB input limit.")
    raw=path.read_bytes()
    source={"name":path.name,"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
    try:
        text=raw.decode("utf-8-sig")
        lines=[]
        for line in text.splitlines():
            fields=line.split()
            if fields and fields[0] == "v":
                if len(fields)<4 or not np.isfinite(np.asarray(fields[1:4],dtype=float)).all():
                    raise ValueError("Nonfinite or incomplete OBJ vertex")
                lines.append(" ".join(fields[:4]))
            elif fields and fields[0] == "f":
                # Strip UV/normal indices as well as every external material path.
                lines.append("f "+" ".join(token.split('/')[0] for token in fields[1:]))
        mesh=trimesh.load(io.BytesIO("\n".join(lines).encode()),file_type="obj",force="mesh",process=False)
        if not isinstance(mesh,trimesh.Trimesh) or not len(mesh.faces):
            raise ValueError("No triangle faces")
        if len(mesh.faces)>MAX_FACES:
            raise ConversionError("resource_limit","OBJ exceeds 300,000 triangulated faces.",source)
        if not np.isfinite(mesh.vertices).all():
            raise ValueError("Nonfinite mesh vertices")
        original_vertices, original_faces=len(mesh.vertices),len(mesh.faces)
        mesh.merge_vertices()
        valid=mesh.nondegenerate_faces()
        degenerate=int((~valid).sum())
        mesh.update_faces(valid)
        unique=mesh.unique_faces()
        duplicates=int((~unique).sum())
        mesh.update_faces(unique)
        mesh.remove_unreferenced_vertices()
        if not len(mesh.faces) or np.ptp(mesh.vertices,axis=0).max()<=1e-9:
            raise ValueError("No usable finite surface remains")
        source.update({"original_vertices":original_vertices,"original_triangles":original_faces,
                       "vertices":len(mesh.vertices),"triangles":len(mesh.faces),"bounds":mesh.bounds.tolist(),
                       "watertight":bool(mesh.is_watertight),"winding_consistent":bool(mesh.is_winding_consistent),
                       "repairs":{"degenerate_triangles_removed":degenerate,"duplicate_triangles_removed":duplicates,
                                  "merged_or_unused_vertices_removed":original_vertices-len(mesh.vertices)},
                       "materials_and_group_names":"ignored; no external paths opened"})
        return mesh,source
    except ConversionError:
        raise
    except (ValueError,TypeError,IndexError,UnicodeError,KeyError) as exc:
        raise ConversionError("invalid_mesh",f"Cannot parse OBJ geometry: {exc}",source) from exc


def envelope(mesh, source, size, up="y", closing_cells=1):
    if up not in ("x","y","z"):
        raise ConversionError("invalid_axis","Up axis must be x, y or z.")
    if closing_cells not in (0,1):
        raise ConversionError("invalid_closing","Bounded closing supports zero or one cell.")
    # Internal X/Y horizontal, Z up; preserve handedness.
    rotations={"z":np.eye(3),"y":np.array([[1,0,0],[0,0,-1],[0,1,0]]),"x":np.array([[0,0,-1],[0,1,0],[1,0,0]])}
    r=rotations[up];v=mesh.vertices@r.T;minimum=v.min(0);extent=np.ptp(v,axis=0)
    scale=float(size)/float(extent.max());axes=np.array([scale,scale,scale/.4])
    vertex_grid=(v-minimum)*axes
    dimensions=np.maximum(1,np.ceil(vertex_grid.max(0)-1e-9).astype(int))
    count=int(np.prod(dimensions))
    if count>MAX_GRID_CELLS:
        raise ConversionError("resource_limit",f"Candidate grid exceeds {MAX_GRID_CELLS:,} cells.",{"size":size,"cells":count})
    grid_mesh=trimesh.Trimesh(vertices=vertex_grid,faces=mesh.faces,process=False)
    raster=surface_voxels(grid_mesh,dimensions)
    if not raster.any():
        raise ConversionError("empty_voxel_target","No source surface intersects the bounded grid.")
    # Existing raster helper also fills closed cavities. Padding distinguishes exterior
    # air from enclosed cells; union preserves thin open sheets/tails under closing.
    padded=np.pad(raster,2)
    closed=ndimage.binary_closing(padded,structure=np.ones((3,3,3))) if closing_cells else padded.copy()
    closed|=padded
    inferred=ndimage.binary_fill_holes(closed)[2:-2,2:-2,2:-2]
    # Material within one brick-height of the exterior is useful shell thickness.
    distance=ndimage.distance_transform_edt(np.pad(inferred,1),sampling=(20,20,8))[1:-1,1:-1,1:-1]
    shell=inferred & (distance<=24.000001)
    _,components=ndimage.label(shell)
    source_to_grid=np.eye(4);source_to_grid[:3,:3]=np.diag(axes)@r;source_to_grid[:3,3]=-minimum*axes
    # Canonical LDraw is X right, -Y up, +Z horizontal.
    grid_to_ldraw=np.array([[20,0,0,-dimensions[0]*10],[0,0,-8,0],[0,20,0,-dimensions[1]*10],[0,0,0,1]],float)
    # This mapping has determinant +1 after removal of physical unit scaling.
    meta={"source":source,"algorithm_version":ALGORITHM,"up_axis":up,"longest_dimension_studs":size,
          "source_to_grid_matrix":source_to_grid.tolist(),"source_to_ldraw_matrix":(grid_to_ldraw@source_to_grid).tolist(),
          "grid_dimensions":dimensions.tolist(),"voxel_pitch_ldu":[20,20,8],"source_raster_cells":int(raster.sum()),
          "inferred_solid_cells":int(inferred.sum()),"shell_cells":int(shell.sum()),"shell_components_6_connected":int(components),
          "exterior_extraction":{"method":"triangle-box SAT, padded exterior flood-fill, bounded morphological closing",
             "closing_radius_cells":closing_cells,"closing_added_or_filled_cells":int((inferred&~raster).sum()),
             "interior_shell_cells_removed":int((inferred&~shell).sum()),"shell_material_depth_ldu":24,
             "thin_surface_voxels_preserved":True,"convex_hull_used":False,"semantic_templates_used":False},
          "warnings":["The exterior envelope is inferred from sampled geometry; a one-cell closing may bridge small gaps.",
                      "Open sheets and separate source components can remain mechanically disconnected.",
                      "Interior mesh interfaces are removed where enclosed; source textures/materials are ignored."]}
    return shell,inferred,raster,meta


def fit_shell(shell, inferred, metadata):
    remaining=shell.copy();nx,ny,nz=shell.shape
    placements=[];covered=np.zeros_like(shell)
    def add(part,x,y,z,w,d,h,yaw=0,component="exterior shell",origin_shift=None):
        # z is the bottom layer; standard bricks/plates have top-origin and +Y body.
        point=np.array([(x+w/2-nx/2)*20,-(z+h)*8,(y+d/2-ny/2)*20])
        if origin_shift is not None:point+=origin_shift
        placements.append({"id":f"p{len(placements)+1:06d}","part_id":part,"color":71,
                           "position_ldu":np.round(point,7).tolist(),"rotation":np.round(YAW[yaw].reshape(9),9).tolist(),"component":component})
        if covered[x:x+w,y:y+d,z:z+h].any():
            raise RuntimeError("Overlapping reserved part envelopes")
        covered[x:x+w,y:y+d,z:z+h] |= remaining[x:x+w,y:y+d,z:z+h]
        remaining[x:x+w,y:y+d,z:z+h]=False
    heights=np.where(inferred,np.arange(nz)[None,None,:]+1,0).max(2)
    slope_count=0
    # Genuine 3039 slopes trim fully occupied exposed 2x2x3 boundary blocks.
    # The 45-degree face slopes toward local -Z; root origin is +10LDU from
    # footprint center in local Z (actual bounds -30..10).
    for x in range(nx-1):
        for y in range(ny-1):
            h=int(heights[x:x+2,y:y+2].min())
            if h<3 or not np.all(heights[x:x+2,y:y+2]==h):continue
            if not remaining[x:x+2,y:y+2,h-3:h].all():continue
            candidates=[]
            if y>0 and heights[x:x+2,y-1].max()<=h-2:candidates.append(0)
            if x>0 and heights[x-1,y:y+2].max()<=h-2:candidates.append(1)
            if y+2<ny and heights[x:x+2,y+2].max()<=h-2:candidates.append(2)
            if x+2<nx and heights[x+2,y:y+2].max()<=h-2:candidates.append(3)
            if candidates:
                yaw=candidates[0]
                add("3039",x,y,h-3,2,2,3,yaw,"source-aligned slope shoulders",YAW[yaw]@np.array([0,0,10]))
                slope_count+=1
    # Uppermost exposed plate cells receive smooth tiles instead of studs.
    above=np.pad(inferred[:,:,1:],((0,0),(0,0),(0,1)),constant_values=False)
    exposed=remaining & ~above
    tile_shapes=[]
    for part,w,d in TILES:
        tile_shapes.append((part,w,d,0))
        if w!=d:tile_shapes.append((part,d,w,1))
    tile_shapes.sort(key=lambda p:(-p[1]*p[2],p[0],p[3]))
    for z in range(nz):
        for x,y in np.argwhere(exposed[:,:,z]):
            x,y=int(x),int(y)
            if not remaining[x,y,z]:continue
            for part,w,d,yaw in tile_shapes:
                if x+w<=nx and y+d<=ny and exposed[x:x+w,y:y+d,z].all() and remaining[x:x+w,y:y+d,z].all():
                    add(part,x,y,z,w,d,1,yaw,"smooth exposed top tiles");break
    shapes=[]
    for part,w,d,h in RECTANGLES:
        shapes.append((part,w,d,h,0))
        if w!=d:shapes.append((part,d,w,h,1))
    shapes.sort(key=lambda p:(-p[1]*p[2]*p[3],-p[3],p[0],p[4]))
    # Complete the useful shell. No below-model plinth or target-count fill exists.
    for z in range(nz):
        for x,y in np.argwhere(remaining[:,:,z]):
            x,y=int(x),int(y)
            if not remaining[x,y,z]:continue
            for part,w,d,h,yaw in shapes:
                if x+w<=nx and y+d<=ny and z+h<=nz and remaining[x:x+w,y:y+d,z:z+h].all():
                    add(part,x,y,z,w,d,h,yaw);break
    if remaining.any():raise RuntimeError("Generic shell coverage invariant failed")
    # Projection compares the final covered shell with the input triangle raster,
    # not a self-comparison advertised as perceptual/source equivalence.
    metadata["fitting"]={"strategy":"bounded slope shoulders, smooth exposed tiles, greedy shell bricks/plates",
                         "part_count":len(placements),"slope_count":slope_count,"covered_shell_cells":int(covered.sum()),
                         "rectangular_cell_coverage":1.0,"reserved_cell_overlap_count":0,"added_support_or_padding_cells":0,
                         "note":"Slope geometry removes material within its reserved rectangular envelope; cell coverage is bookkeeping, not exact solid geometry equality."}
    return placements,covered


def continuous_source_distance(mesh, metadata, inferred, sample_limit=512):
    """Sample exterior envelope faces against original continuous triangles."""
    points=[]
    for axis in range(3):
        for sign in (-1,1):
            shifted=np.roll(inferred,-sign,axis=axis)
            edge=[slice(None)]*3;edge[axis]=-1 if sign>0 else 0;shifted[tuple(edge)]=False
            cells=np.argwhere(inferred & ~shifted).astype(float)+.5
            cells[:,axis]+=sign*.5
            points.append(cells)
    samples=np.concatenate(points)
    if len(samples)>sample_limit:samples=samples[np.linspace(0,len(samples)-1,sample_limit,dtype=int)]
    dimensions=np.array(metadata["grid_dimensions"])
    native=np.column_stack([(samples[:,0]-dimensions[0]/2)*20,-samples[:,2]*8,(samples[:,1]-dimensions[1]/2)*20])
    matrix=np.array(metadata["source_to_ldraw_matrix"])
    source_mesh=trimesh.Trimesh(vertices=mesh.vertices@matrix[:3,:3].T+matrix[:3,3],faces=mesh.faces,process=False)
    _,distances,_=trimesh.proximity.closest_point(source_mesh,native)
    return {"sample_count":len(samples),"median_ldu":float(np.median(distances)),"p95_ldu":float(np.quantile(distances,.95)),
            "maximum_ldu":float(distances.max()),"pitch_ldu":[20,20,8],
            "method":"Deterministic exposed envelope face samples to nearest original continuous input triangle",
            "scope":"Inferred exterior envelope fidelity; not final part-surface or perceptual accuracy. One LDU is0.4mm."}


def generate_obj(path,target_parts=2000,up="y",closing_cells=1,max_trials=5):
    if type(target_parts) is not int or not 100<=target_parts<=MAX_OUTPUT_PARTS:
        raise ConversionError("invalid_piece_target","Target parts must be an integer from100 to10,000.")
    if type(max_trials) is not int or not 1<=max_trials<=8:
        raise ConversionError("invalid_search_limit","Generic search supports1–8 bounded trials.")
    mesh,source=read_obj(path)
    trials=[];best=None;size=32;seen=set()
    for attempt in range(max_trials):
        if size in seen:break
        seen.add(size)
        try:
            shell,inferred,raster,metadata=envelope(mesh,source,size,up,closing_cells)
            placements,covered=fit_shell(shell,inferred,metadata)
        except ConversionError as exc:
            if exc.code!="resource_limit" or size<=12:raise
            trials.append({"size_studs":size,"error":exc.code,"message":str(exc)})
            size=max(12,int(size*.8));continue
        count=len(placements)
        metadata["silhouette_iou_to_source_triangle_raster"]={}
        for axis,name in enumerate(("yz","xz","xy")):
            a,b=np.any(covered,axis=axis),np.any(raster,axis=axis)
            metadata["silhouette_iou_to_source_triangle_raster"][name]=float((a&b).sum()/max(1,(a|b).sum()))
        metadata["source_fidelity_note"]="Orthographic silhouettes against source triangle raster at the selected pitch; not a continuous-surface or perceptual resemblance score."
        trial={"size_studs":size,"part_count":count,"shell_cells":int(shell.sum()),"slope_count":metadata["fitting"]["slope_count"],"within_output_cap":count<=MAX_OUTPUT_PARTS}
        trials.append(trial)
        error=abs(count-target_parts)
        if count<=MAX_OUTPUT_PARTS and (best is None or error<best[0]):best=(error,placements,metadata,inferred)
        if .9*target_parts<=count<=min(1.1*target_parts,MAX_OUTPUT_PARTS):break
        scale_target=min(target_parts,MAX_OUTPUT_PARTS*.98)
        proposed=int(round(size*math.sqrt(scale_target/max(count,1))))
        proposed=max(12,min(96,proposed))
        if proposed==size:proposed=size+(1 if count<target_parts else -1)
        size=proposed
    if best is None:raise ConversionError("resource_limit","No candidate fit within bounded generic resources.",{"trials":trials})
    _,placements,metadata,inferred=best
    metadata["continuous_source_distance"]=continuous_source_distance(mesh,metadata,inferred)
    metadata["count_search"]={"requested_parts":target_parts,"actual_parts":len(placements),"max_trials":max_trials,"trials":trials,"deterministic":True}
    constraints={"target_parts":target_parts,"target_band":[int(target_parts*(1-.1)),min(MAX_OUTPUT_PARTS,int(target_parts*(1+.1)))],"target_tolerance":.1,"max_output_parts":MAX_OUTPUT_PARTS,"max_grid_cells":MAX_GRID_CELLS}
    model={"schema_version":SCHEMA,"algorithm_version":ALGORITHM,"status":"digital_candidate","name":"Generic OBJ exterior sculpture",
           "constraints":constraints,"provenance":metadata,"placements":placements}
    model["revision_id"]=revision(model)
    return model


def convert_obj(path, output, library_path, target_parts=2000, up="y", closing_cells=1):
    """CLI orchestration with failure diagnostics and atomic successful bundles."""
    import json
    import os
    import tempfile
    from .assembly import publish_candidate
    from .ldraw_library import LDrawLibrary
    from .render import write_preview
    output=Path(output)
    if output.exists():raise FileExistsError(f"Output already exists: {output}")
    library=LDrawLibrary(library_path)
    try:
        model=generate_obj(path,target_parts,up,closing_cells)
    except ConversionError as exc:
        report={"status":"conversion_failed","artifact_checks_passed":False,"errors":[exc.code],
                "message":str(exc),"details":exc.details,"request":{"input_name":Path(path).name,"target_parts":target_parts,"up_axis":up,"closing_cells":closing_cells},
                "model_produced":False}
        output.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="."+output.name+"-diagnostic-",dir=output.parent) as temporary:
            stage=Path(temporary);(stage/"validation.json").write_text(json.dumps(report,indent=2,sort_keys=True)+"\n")
            if output.exists():raise FileExistsError(f"Output appeared during publication: {output}")
            os.rename(stage,output)
        return report
    _,report=publish_candidate(output,model,library,preview_writer=write_preview)
    return report
