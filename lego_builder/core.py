"""Canonical rectangular-part contracts and deterministic assembly validation."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

SCHEMA = "lego-builder-model-v1"
ALGORITHM = "greedy-stagger-v1"
VALIDATOR = "rectangular-connectors-v1"
UNITS = {"xy": "stud", "z": "plate", "origin": "lower-corner", "z_axis": "up"}
WEIGHTS = {"volume": 1, "joined_supports": 40, "unsupported_target_cells": 20, "parts": 1}


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def load_catalog():
    root = Path(__file__).parent / "data"
    data = json.loads((root / "catalog.json").read_text())
    for part in data["parts"]:
        raw = (root / "ldraw" / "parts" / part["ldraw_file"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != part["sha256"]:
            raise ValueError(f"Catalog provenance checksum mismatch: {part['id']}")
    return data


def footprint(placement, parts):
    part = parts[placement["part_id"]]
    w, d = part["width"], part["depth"]
    return (d, w, part["height"]) if placement["yaw"] == 90 else (w, d, part["height"])


def cells(placement, parts):
    x, y, z = placement["position"]
    w, d, h = footprint(placement, parts)
    return ((i, j, k) for i in range(x, x+w) for j in range(y, y+d) for k in range(z, z+h))


def inventory(model):
    counts = Counter((p["part_id"], p["color"]) for p in model["placements"])
    return {"revision_id": model["revision_id"], "catalog_version": model["catalog_version"],
            "total_parts": len(model["placements"]),
            "lots": [{"part_id": p, "color": c, "quantity": n} for (p,c),n in sorted(counts.items())]}


def sequence(model):
    return {"revision_id": model["revision_id"], "steps": [
        {"step": n+1, "placement_id": p["id"]} for n,p in enumerate(model["placements"])]}


def new_model(placements, catalog, provenance):
    model = {"schema_version": SCHEMA, "catalog_version": catalog["version"],
             "catalog_sha256": digest(catalog), "algorithm_version": ALGORITHM,
             "units": dict(UNITS),
             "provenance": provenance, "placements": placements}
    model["revision_id"] = digest(model)
    return model


def validate(model, catalog, target=None, bom=None, plan=None):
    if not isinstance(model,dict) or not isinstance(model.get("placements"),list) or any(not isinstance(p,dict) for p in model["placements"]):
        return {"revision_id":model.get("revision_id") if isinstance(model,dict) else None,
                "validator_version":VALIDATOR,"passed":False,"errors":["invalid_model_structure"],
                "checks":["schema_and_revision"],"physical_build_verified":False,"studio_import_verified":False}
    errors = []
    parts = {p["id"]: p for p in catalog["parts"]}
    placements = model.get("placements", [])
    if model.get("algorithm_version") != ALGORITHM:
        errors.append("algorithm_version")
    if model.get("units") != UNITS:
        errors.append("canonical_units")
    if model.get("schema_version") != SCHEMA:
        errors.append("schema_version")
    if model.get("catalog_version") != catalog["version"] or model.get("catalog_sha256") != digest(catalog):
        errors.append("catalog_version_or_checksum")
    if model.get("revision_id") != digest({k:v for k,v in model.items() if k != "revision_id"}):
        errors.append("revision_checksum")
    if not placements:
        errors.append("empty_assembly")
    occupied, tops, adjacency, ids, ceilings = {}, {}, {}, set(), {}
    last_z = -1
    for p in placements:
        pid = p.get("id")
        if not isinstance(pid, str) or pid in ids:
            errors.append("duplicate_or_invalid_instance_id")
            continue
        ids.add(pid)
        adjacency[pid] = set()
        part = parts.get(p.get("part_id"))
        if part is None:
            errors.append(f"unknown_part:{pid}")
            continue
        if type(p.get("color")) is not int or p["color"] not in part["colors"]:
            errors.append(f"invalid_color:{pid}")
        if type(p.get("yaw")) is not int or p["yaw"] not in part["orientations"] or p["yaw"] not in (0,90):
            errors.append(f"invalid_orientation:{pid}")
            continue
        pos = p.get("position")
        if not isinstance(pos,list) or len(pos)!=3 or any(type(v) is not int or v<0 for v in pos):
            errors.append(f"invalid_position:{pid}")
            continue
        x,y,z = pos
        w,d,h = footprint(p,parts)
        if z < last_z:
            errors.append(f"non_bottom_up_order:{pid}")
        last_z = z
        supports = {tops[(i,j,z)] for i in range(x,x+w) for j in range(y,y+d) if (i,j,z) in tops}
        if z and not supports:
            errors.append(f"unsupported_placement:{pid}")
        for support in supports:
            adjacency[pid].add(support)
            adjacency[support].add(pid)
        # In this restricted catalog, top studs and underside stud-grid sockets coincide.
        # Body cells exclude legal stud insertion into the mating underside cavity.
        for cell in cells(p,parts):
            if cell in occupied:
                errors.append(f"collision:{pid}:{occupied[cell]}")
            occupied[cell] = pid
        # Straight downward insertion cannot cross a previously placed body.
        if any(ceilings.get((i,j),0)>z for i in range(x,x+w) for j in range(y,y+d)):
            errors.append(f"blocked_insertion:{pid}")
        for i in range(x,x+w):
            for j in range(y,y+d):
                tops[(i,j,z+h)] = pid
                ceilings[i,j] = max(ceilings.get((i,j),0),z+h)
    if adjacency:
        visited, queue = set(), [next(iter(adjacency))]
        while queue:
            p = queue.pop()
            if p not in visited:
                visited.add(p)
                queue.extend(adjacency[p]-visited)
        if len(visited)!=len(adjacency):
            errors.append("disconnected_assembly")
    if target is not None and set(occupied)!=set(target):
        errors.append("target_coverage_mismatch")
    try:
        if bom is not None and bom != inventory(model):
            errors.append("bom_mismatch")
        if plan is not None and plan != sequence(model):
            errors.append("sequence_mismatch")
    except (KeyError,TypeError):
        errors.append("invalid_artifact_placement_structure")
    return {"revision_id": model.get("revision_id"), "validator_version": VALIDATOR,
            "passed": not errors, "errors": sorted(set(errors)),
            "checks": ["schema_and_revision", "catalog_part_color_orientation", "body_collision",
                       "stud_socket_support", "global_connectedness", "bottom_up_insertion",
                       "exact_target_coverage" if target is not None else "target_coverage_not_rechecked",
                       "inventory" if bom is not None else "inventory_not_supplied",
                       "sequence" if plan is not None else "sequence_not_supplied"],
            "part_count": len(placements), "occupied_cells": len(occupied),
            "connection_edges": sum(map(len,adjacency.values()))//2,
            "physical_build_verified": False, "studio_import_verified": False,
            "warnings": ["Analytic rectangular body and stud/socket rules; no force, clutch, tipping, or physical stability simulation.",
                         "Preview bodies are analytic approximations; external LDraw library resolves detailed part geometry."]}
