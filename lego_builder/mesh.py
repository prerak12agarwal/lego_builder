"""Bounded local geometry ingestion and conservative triangle-box solid voxelization."""
from __future__ import annotations
import hashlib
import io
from pathlib import Path
import numpy as np
import trimesh
from scipy import ndimage

MAX_BYTES = 80 * 1024 * 1024
MAX_FACES = 300_000
MAX_CELLS = 180_000


class ConversionError(ValueError):
    def __init__(self, code, message, details=None):
        super().__init__(message)
        self.code, self.details = code, details or {}


def ingest(path):
    path = Path(path)
    if path.suffix.lower() not in (".obj", ".stl"):
        raise ConversionError("unsupported_format", "Choose a local OBJ or STL file.")
    if not path.is_file():
        raise ConversionError("input_missing", f"Input does not exist: {path}")
    if path.stat().st_size > MAX_BYTES:
        raise ConversionError("resource_limit", "Input exceeds the 80 MiB limit.")
    raw = path.read_bytes()
    source = {"name": path.name, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
    try:
        if path.suffix.lower()==".obj":
            # Geometry only: never fetch or read OBJ material/texture references.
            text = raw.decode("utf-8-sig")
            geometry = "\n".join(line for line in text.splitlines() if line.split(maxsplit=1)[:1] in (["v"],["f"]))
            mesh = trimesh.load(io.BytesIO(geometry.encode()), file_type="obj", force="mesh", process=False)
        else:
            mesh = trimesh.load(io.BytesIO(raw), file_type="stl", force="mesh", process=False)
        if not isinstance(mesh,trimesh.Trimesh) or len(mesh.faces)==0 or len(mesh.vertices)==0:
            raise ConversionError("empty_mesh", "Input has no triangle geometry.", source)
        if len(mesh.faces)>MAX_FACES:
            raise ConversionError("resource_limit", "Input exceeds 300,000 triangles.", source)
        if not np.isfinite(mesh.vertices).all():
            raise ConversionError("nonfinite_mesh", "Mesh contains non-finite coordinates.", source)
        before = len(mesh.vertices)
        mesh.merge_vertices()
        source["safe_repairs"] = {"merged_coincident_vertices": before-len(mesh.vertices), "removed_degenerate_faces": 0}
        # Open holes and ambiguous topology are diagnostics, never silently filled.
        metrics = {"vertices": len(mesh.vertices), "triangles": len(mesh.faces),
                   "watertight": bool(mesh.is_watertight), "winding_consistent": bool(mesh.is_winding_consistent),
                   "bounds": mesh.bounds.tolist()}
        source["mesh"] = metrics
        if not mesh.nondegenerate_faces().all():
            raise ConversionError("degenerate_mesh", "Mesh has zero-area triangles; clean the source mesh first.", source)
        if not mesh.is_watertight or not mesh.is_winding_consistent:
            raise ConversionError("unsuitable_mesh", "Mesh must be closed and consistently wound. Repair holes/winding in a mesh editor, then retry; no hull replacement was applied.", source)
        if np.any(mesh.extents<=1e-9) or abs(mesh.volume)<=1e-9:
            raise ConversionError("zero_volume", "Mesh has no usable enclosed volume.", source)
        return mesh, source
    except ConversionError:
        raise
    except (ValueError,TypeError,IndexError,UnicodeError,KeyError) as exc:
        raise ConversionError("invalid_mesh", f"Cannot parse mesh geometry: {exc}", source) from exc


def voxelize(mesh, source, size, up="z"):
    if type(size) is not int or not 4<=size<=48:
        raise ConversionError("invalid_size", "Target longest dimension must be an integer from 4 to 48 studs.")
    if up not in ("x","y","z"):
        raise ConversionError("invalid_axis", "Up axis must be x, y, or z.")
    # Proper rotations preserve handedness. Canonical coordinates have Z up.
    rotations = {"z":np.eye(3), "y":np.array([[1,0,0],[0,0,-1],[0,1,0]]),
                 "x":np.array([[0,0,-1],[0,1,0],[1,0,0]])}
    rotated = mesh.vertices @ rotations[up].T
    minimum = rotated.min(axis=0)
    extent = np.ptp(rotated,axis=0)
    scale = size / float(extent.max())
    # A plate is 0.4 stud high: maintain physical proportions before grid sampling.
    axes_scale = np.array([scale,scale,scale/0.4])
    transformed = (rotated-minimum)*axes_scale
    grid_mesh = trimesh.Trimesh(vertices=transformed,faces=mesh.faces,process=False)
    dimensions = np.maximum(1,np.ceil(transformed.max(axis=0)-1e-9).astype(int))
    count = int(np.prod(dimensions))
    if count>MAX_CELLS:
        raise ConversionError("resource_limit", f"Requested grid has {count:,} cells; limit is {MAX_CELLS:,}. Try a smaller size.", {"source":source,"grid_dimensions":dimensions.tolist()})
    grid = surface_voxels(grid_mesh, dimensions)
    if not grid.any():
        raise ConversionError("empty_voxel_target", "No intersected surface cells remain at this scale. Increase target size.", {"source":source})
    occupied = np.argwhere(grid)
    shift = occupied.min(axis=0)
    occupied -= shift
    dimensions = occupied.max(axis=0)+1
    grid = np.zeros(tuple(dimensions),dtype=bool)
    grid[tuple(occupied.T)] = True
    labels, components = ndimage.label(grid)
    transform = np.eye(4)
    transform[:3,:3] = np.diag(axes_scale) @ rotations[up]
    transform[:3,3] = -minimum*axes_scale-shift
    metadata = {"source":source,"up_axis":up,"target_longest_dimension_studs":size,
                "source_to_grid_matrix":transform.tolist(),"grid_dimensions":dimensions.tolist(),
                "grid_origin_trim":shift.tolist(), "voxelizer":"triangle-box-sat-solid-fill-v1",
                "occupied_cells":int(grid.sum()),"target_components_6_connected":int(components),
                "warnings":["Intersected surface cells plus enclosed fill conservatively thicken features by up to one cell; internal voids are filled. Input self-intersections are not exhaustively detected.", "Source materials are ignored; all output parts use the verified Red palette."]}
    return grid, metadata


def surface_voxels(mesh, dimensions):
    """Triangle/AABB separating-axis rasterization, bounded before pair allocation.

    AABB coordinate-axis tests are implicit in candidate bounds. The remaining
    axes are the triangle normal and nine edge/box-axis cross products.
    Fill enclosed cells only after ingest has established a closed source mesh.
    """
    triangles = mesh.triangles
    lower = np.maximum(0, np.floor(triangles.min(axis=1)-1e-9).astype(int))
    upper = np.minimum(dimensions-1, np.floor(triangles.max(axis=1)+1e-9).astype(int))
    counts = np.prod(np.maximum(0,upper-lower+1),axis=1)
    if int(counts.sum()) > 8_000_000:
        raise ConversionError("resource_limit", "Surface rasterization exceeds 8 million face/cell pairs. Simplify the mesh or reduce size.")
    grid = np.zeros(tuple(dimensions),dtype=bool)
    chunks, face_ids, pending = [], [], 0
    def flush():
        if not chunks:
            return
        candidates = np.concatenate(chunks)
        faces = np.concatenate(face_ids)
        vertices = triangles[faces]-(candidates[:,None,:]+.5)
        valid = np.ones(len(candidates),dtype=bool)
        edges = [vertices[:,1]-vertices[:,0],vertices[:,2]-vertices[:,1],vertices[:,0]-vertices[:,2]]
        axes = [np.cross(edges[0],edges[1])]
        for edge in edges:
            axes.extend(np.cross(edge,axis) for axis in np.eye(3))
        for axis in axes:
            projections=np.einsum("nij,nj->ni",vertices,axis)
            radius=.5*np.abs(axis).sum(axis=1)
            valid &= (projections.min(axis=1)<=radius+1e-9) & (projections.max(axis=1)>=-radius-1e-9)
        grid[tuple(candidates[valid].T)]=True
        chunks.clear();face_ids.clear()
    for face,(lo,hi,count) in enumerate(zip(lower,upper,counts)):
        if count<=0:
            continue
        candidates=np.indices(hi-lo+1).reshape(3,-1).T+lo
        chunks.append(candidates);face_ids.append(np.full(len(candidates),face))
        pending+=len(candidates)
        if pending>=50_000:
            flush();pending=0
    flush()
    return ndimage.binary_fill_holes(grid)
