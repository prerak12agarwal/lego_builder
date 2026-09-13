"""Canonical full-transform LDraw candidates, without a mechanical success claim."""
from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import os
import tempfile
import numpy as np

SCHEMA = "lego-builder-ldraw-model-v1"


def revision(model):
    value = {k: v for k, v in model.items() if k not in ("revision_id", "runtime_seconds")}
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def inventory(model):
    counts = Counter((p["part_id"], p["color"]) for p in model["placements"])
    return {"revision_id": model["revision_id"], "total_parts": len(model["placements"]),
            "items": [{"part_id": part, "color": color, "quantity": count} for (part, color), count in sorted(counts.items())]}


def ldraw_text(model):
    name = " ".join(str(model.get("name", "LEGO exterior digital candidate")).split())
    out = ["0 " + name, "0 !LEGO_BUILDER_REVISION " + model["revision_id"],
           "0 Mechanical connections and assembly order are not verified."]
    current = None
    for p in model["placements"]:
        if p.get("component") != current:
            current = p.get("component")
            if current:
                out.append("0 // " + " ".join(str(current).split()))
        numbers = p["position_ldu"] + p["rotation"]
        out.append("1 " + str(p["color"]) + " " + " ".join(format(x, ".9g") for x in numbers) + " " + p["part_id"] + ".dat")
    return "\n".join(out) + "\n"


def validate_roundtrip(text, model):
    records = []
    revisions = []
    for line in text.splitlines():
        values = line.split()
        if values and values[0] not in ("0", "1"):
            raise ValueError("LDraw contains noncanonical geometry or malformed rows")
        if values[:2] == ["0", "!LEGO_BUILDER_REVISION"]:
            revisions.append(values[2:])
        if values and values[0] == "1":
            if len(values) != 15:
                raise ValueError("Malformed LDraw placement")
            records.append((int(values[1]), np.array(list(map(float, values[2:14]))), values[14]))
    if revisions != [[model["revision_id"]]]:
        raise ValueError("LDraw revision header is missing, duplicated or stale")
    if len(records) != len(model["placements"]):
        raise ValueError("LDraw placement count differs from canonical assembly")
    for record, p in zip(records, model["placements"]):
        if record[0] != p["color"] or record[2] != p["part_id"] + ".dat" or not np.allclose(record[1], p["position_ldu"] + p["rotation"], rtol=0, atol=1e-5):
            raise ValueError("LDraw transform or part/color differs from canonical assembly")


def validate_csv(text, model):
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames != ["part_id", "ldraw_color", "quantity"]:
        raise ValueError("Unexpected CSV inventory header")
    rows = [{"part_id": r["part_id"], "color": int(r["ldraw_color"]), "quantity": int(r["quantity"])} for r in reader]
    if rows != inventory(model)["items"]:
        raise ValueError("CSV inventory differs from canonical assembly")


def validate_component_index(index, model):
    if index.get("revision_id") != model["revision_id"]:
        raise ValueError("Component index has stale revision")
    ids = [p for group in index["groups"] for p in group["placement_ids"]]
    if Counter(ids) != Counter(p["id"] for p in model["placements"]):
        raise ValueError("Component index omits or duplicates placements")
    owner = {p["id"]: p.get("component", "assembly") for p in model["placements"]}
    if any(owner[p] != group["component"] for group in index["groups"] for p in group["placement_ids"]):
        raise ValueError("Component membership differs from canonical assembly")


def validate_candidate(model, ldraw=None, bom=None):
    errors = []
    if model.get("schema_version") != SCHEMA:
        errors.append("wrong_schema")
    if model.get("revision_id") != revision(model):
        errors.append("revision_hash_mismatch")
    constraints = model.get("constraints", {})
    target = constraints.get("target_parts")
    band = constraints.get("target_band")
    tolerance = constraints.get("target_tolerance")
    output_cap = constraints.get("max_output_parts")
    valid_constraints = (type(output_cap) is int and 1 <= output_cap <= 10000
                         and type(target) is int and 1 <= target <= output_cap
                         and isinstance(band, list) and len(band) == 2
                         and all(type(n) is int for n in band)
                         and 0 <= band[0] <= target <= band[1] <= output_cap
                         and type(tolerance) in (int, float) and 0 <= tolerance <= 1
                         and band == [int(target*(1-tolerance)), min(output_cap, int(target*(1+tolerance)))])
    if not valid_constraints:
        errors.append("invalid_or_missing_piece_target_constraints")
    if not model["placements"]:
        errors.append("empty_assembly")
    if type(output_cap) is int and len(model["placements"]) > output_cap:
        errors.append("hard_output_piece_limit_exceeded")
    ids, transforms = set(), set()
    for p in model["placements"]:
        if p["id"] in ids:
            errors.append("duplicate_placement_id")
        ids.add(p["id"])
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", p["part_id"]):
            errors.append("invalid_part_identifier")
        r = np.asarray(p["rotation"], dtype=float)
        t = np.asarray(p["position_ldu"], dtype=float)
        if r.size != 9 or t.shape != (3,) or not np.isfinite(r).all() or not np.isfinite(t).all():
            errors.append("invalid_transform")
            continue
        r = r.reshape(3, 3)
        if not np.allclose(r.T @ r, np.eye(3), atol=1e-6) or abs(np.linalg.det(r)-1) > 1e-6:
            errors.append("nonrigid_or_reflected_transform")
        key = (p["part_id"], *np.round(t, 5), *np.round(r.flatten(), 5))
        if key in transforms:
            errors.append("duplicate_identical_placement")
        transforms.add(key)
    if bom is not None and bom != inventory(model):
        errors.append("inventory_mismatch")
    if ldraw is not None:
        try:
            validate_roundtrip(ldraw, model)
        except ValueError as exc:
            errors.append(str(exc))
    return {"artifact_checks_passed": not errors, "errors": sorted(set(errors)),
            "revision_id": model["revision_id"], "status": "digital_candidate",
            "total_parts": len(model["placements"]), "target_parts": target, "target_band": band, "max_output_parts": output_cap,
            "target_band_met": valid_constraints and band[0] <= len(model["placements"]) <= band[1],
            "mechanical_checks": {k: "not_evaluated" for k in ("collision", "connectivity", "clutch_engagement", "stability", "insertion_order", "physical_build")},
            "studio_import": "not_evaluated",
            "limitations": ["Digital exterior reconstruction; part connections and assembly need engineering review", "Manufactured part/color evidence is bound to the catalog; seller stock and quantity availability are not verified", "Sequence groups are an assembly index, not validated instructions"]}


def catalog_for_model(model, library):
    """Resolve every real part recursively and pin exact source geometry/colors."""
    evidence_path = Path(__file__).parent/"data"/"vehicle-color-evidence.json"
    evidence_raw = evidence_path.read_bytes()
    evidence = json.loads(evidence_raw)
    reviewed = {(r["part_id"], r["ldraw_color"]): r for r in evidence["lot_evidence"] if r["status"] == "verified"}
    ids = sorted({p["part_id"] for p in model["placements"]})
    manifest = library.manifest(ids)
    manifest.pop("library_root", None)
    parts = {}
    for part_id in ids:
        info = library.part_info(part_id)
        geometry = library.geometry(part_id)
        if not geometry.triangle_count:
            raise ValueError(f"Part has no solid display geometry: {part_id}")
        source_text = library.resolve(part_id).read_text(errors="replace")
        if not re.search(r"^0 !LDRAW_ORG Part(?: |$)", source_text, re.MULTILINE):
            raise ValueError(f"Assembly root is not an official standalone Part: {part_id}")
        color_ids = sorted({p["color"] for p in model["placements"] if p["part_id"] == part_id})
        for color in color_ids:
            if color not in {0, 36, 47, 71, 72}:
                raise ValueError(f"Color outside exterior palette: {color}")
            library.color(color)
            if (part_id, color) not in reviewed:
                raise ValueError(f"Manufactured part/color combination has no reviewed evidence: {part_id}/{color}")
        geometry_hash = hashlib.sha256(json.dumps({name: rec["sha256"] for name, rec in sorted(geometry.sources.items())},sort_keys=True).encode()).hexdigest()
        parts[part_id] = {"name": info["name"], "filename": part_id+".dat", "geometry_sha256": geometry_hash,
                          "bounds_ldu": geometry.bounds.tolist(), "colors": color_ids,
                          "manufactured_color_availability": "cataloged_combination_verified",
                          "color_evidence": [reviewed[part_id,c] for c in color_ids]}
    selected_evidence = [record for part in parts.values() for record in part["color_evidence"]]
    manifest["color_evidence_sha256"] = hashlib.sha256(json.dumps(selected_evidence, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    manifest["color_evidence_scope"] = "used_part_color_records"
    manifest["parts"] = parts
    return manifest


def publish_candidate(output, model, library=None, *, allow_unpinned_draft=False, preview_writer=None):
    """Publish the complete bundle atomically; errors leave no result directory."""
    output = Path(output)
    if output.exists():
        raise FileExistsError(f"Output already exists: {output}")
    model = dict(model)
    if library is None and not allow_unpinned_draft:
        raise ValueError("A resolved official LDraw library is required to publish a candidate")
    if library is not None:
        model["catalog"] = catalog_for_model(model, library)
    model["revision_id"] = revision(model)
    bom = inventory(model)
    ldr = ldraw_text(model)
    report = validate_candidate(model, ldr, bom)
    report["catalog_checks"] = "passed" if library is not None else "not_checked_diagnostic_draft"
    if library is None:
        report["status"] = "unpinned_diagnostic_draft"
    if not report["artifact_checks_passed"]:
        raise ValueError(report["errors"])
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["part_id", "ldraw_color", "quantity"])
    writer.writerows((p["part_id"], p["color"], p["quantity"]) for p in bom["items"])
    validate_csv(stream.getvalue(), model)
    components = list(dict.fromkeys(p.get("component", "assembly") for p in model["placements"]))
    index = {"revision_id": model["revision_id"], "status": "component_index_not_validated_build_order", "groups": [{"component": c, "placement_ids": [p["id"] for p in model["placements"] if p.get("component", "assembly") == c]} for c in components]}
    validate_component_index(index, model)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="."+output.name+"-staging-", dir=output.parent) as temporary:
        stage = Path(temporary)
        for filename, value in (("model.json", model), ("bom.json", bom), ("sequence.json", index)):
            (stage/filename).write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False)+"\n")
        (stage/"model.ldr").write_text(ldr)
        (stage/"bom.csv").write_text(stream.getvalue())
        if preview_writer is not None:
            report["preview"] = preview_writer(model, library, stage/"preview.html")
        (stage/"validation.json").write_text(json.dumps(report, indent=2, sort_keys=True, allow_nan=False)+"\n")
        if output.exists():
            raise FileExistsError(f"Output appeared during publication: {output}")
        os.rename(stage, output)
    return model, report
