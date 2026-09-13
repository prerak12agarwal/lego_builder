"""Semantic exterior intake for the explicitly specialized Cybertruck slice.

This reader never loads MTL paths. It preserves the input, reports discarded faces,
and makes no claim that the open source is a solid or that other vehicles fit.
"""
from pathlib import Path
import hashlib
import numpy as np
from scipy.spatial import ConvexHull

INTERIOR_PREFIXES = ("Seat", "Dash", "Steering", "Sphere")


def read_exterior(path, length_studs=60):
    path = Path(path)
    if not 40 <= length_studs <= 90:
        raise ValueError("Exterior length must be 40–90 studs")
    raw = path.read_bytes()
    vertices, groups = [], {}
    group = "ungrouped"
    rejected = 0
    for line in raw.decode("utf-8-sig").splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == "v":
            point = list(map(float, words[1:4]))
            if len(point) != 3 or not np.isfinite(point).all():
                raise ValueError("OBJ contains invalid/nonfinite vertices")
            vertices.append(point)
        elif words[0] in ("o", "g"):
            group = " ".join(words[1:])
        elif words[0] == "f":
            rec = groups.setdefault(group, {"indices": set(), "faces": 0})
            ids = []
            for token in words[1:]:
                index = int(token.split("/")[0])
                index = index - 1 if index > 0 else len(vertices) + index
                if index < 0 or index >= len(vertices):
                    raise ValueError("OBJ face references an unavailable vertex")
                ids.append(index)
            rec["faces"] += 1
            if len(set(ids)) < 3:
                rejected += 1
            else:
                rec["indices"].update(ids)
    verts = np.asarray(vertices, dtype=float)
    if len(verts) < 3 or "Body_Shell_Cube.001" not in groups:
        raise ValueError("Cybertruck fitting requires the named Body_Shell_Cube.001 source group")
    body = verts[sorted(groups["Body_Shell_Cube.001"]["indices"])]
    span = np.ptp(body[:, 2])
    if span <= 0:
        raise ValueError("Exterior body has no longitudinal extent")
    selected = {name: rec for name, rec in groups.items() if not name.startswith(INTERIOR_PREFIXES)}
    selected_ids = sorted(set().union(*(r["indices"] for r in selected.values())))
    bounds = np.array([verts[selected_ids].min(0), verts[selected_ids].max(0)])
    scale = length_studs * 20 / span
    center = (bounds[0] + bounds[1]) / 2
    # Ground the source's lowest tire point at native LDraw y=0.
    matrix = np.diag([scale, -scale, -scale, 1.0])
    matrix[:3, 3] = [-center[0]*scale, bounds[0, 1]*scale, center[2]*scale]
    transformed = verts @ matrix[:3, :3].T + matrix[:3, 3]
    points = {name: transformed[sorted(rec["indices"])] for name, rec in selected.items()}
    provenance = {
        "source": {"name": path.name, "sha256": hashlib.sha256(raw).hexdigest(),
                   "vertex_count": len(verts), "face_count": sum(r["faces"] for r in groups.values()),
                   "original_bounds": [verts.min(0).tolist(), verts.max(0).tolist()]},
        "source_to_ldraw_matrix": matrix.tolist(), "length_studs": length_studs,
        "specialization": "named-group Cybertruck exterior panel reconstruction; not a general mesh converter",
        "exterior_groups": [{"name": n, "faces": r["faces"], "vertices": len(r["indices"])} for n, r in selected.items()],
        "discarded_groups": [{"name": n, "faces": r["faces"], "reason": "interior detail outside exterior scope"} for n, r in groups.items() if n not in selected],
        "repairs": ["Ignored source interiors and MTL references", "Reconstructed open exterior as fitted LEGO panel subassemblies", "Snapped panel footprints to LEGO stud dimensions; tire size selected from catalog"],
        "degenerate_index_faces_ignored": rejected,
    }
    return points, provenance


def hull2(points):
    points = np.asarray(points, dtype=float)
    return points[ConvexHull(points).vertices]


def inside_polygon(points, polygon):
    """Convex hull membership including its boundary."""
    points, polygon = np.asarray(points), np.asarray(polygon)
    delta = np.roll(polygon, -1, axis=0) - polygon
    rel = points[..., None, :] - polygon
    cross = delta[:, 0]*rel[..., 1] - delta[:, 1]*rel[..., 0]
    return np.all(cross >= -1e-7, axis=-1) | np.all(cross <= 1e-7, axis=-1)
