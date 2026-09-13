"""Run four geometries through the exact shared OBJ exterior converter.

The Cybertruck input is copied unchanged to an ignored work directory under a
neutral filename. No semantic vehicle fitter or template is called by this
harness. Commit only small labeled procedural fixtures and generated bundles.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import shutil
import time

from lego_builder.assembly import (
    inventory, revision, validate_candidate, validate_component_index,
    validate_csv, validate_roundtrip,
)
from lego_builder.generic import ALGORITHM, convert_obj

ROOT = Path(__file__).resolve().parents[1]
IMPLEMENTATION_FILES = (
    "lego_builder/generic.py", "lego_builder/assembly.py",
    "lego_builder/ldraw_library.py", "lego_builder/render.py",
    "lego_builder/mesh.py", "lego_builder/data/vehicle-color-evidence.json",
)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n")


def implementation_hashes():
    return {name: sha256(ROOT / name) for name in IMPLEMENTATION_FILES}


def placement_hash(model):
    """Ignore IDs/group labels/order when comparing actual assembly geometry."""
    records = [{key: p[key] for key in ("part_id", "color", "position_ldu", "rotation")} for p in model["placements"]]
    records.sort(key=lambda record: json.dumps(record, sort_keys=True, separators=(",", ":")))
    return hashlib.sha256(json.dumps(records, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def verify_bundle(folder, source_hash, target):
    model = json.loads((folder / "model.json").read_text())
    bom = json.loads((folder / "bom.json").read_text())
    plan = json.loads((folder / "sequence.json").read_text())
    report = json.loads((folder / "validation.json").read_text())
    assert model["revision_id"] == revision(model), "stale canonical revision"
    assert model["algorithm_version"] == ALGORITHM, "a different converter produced this assembly"
    assert model["provenance"]["source"]["sha256"] == source_hash, "source checksum changed"
    assert bom == inventory(model), "JSON inventory mismatch"
    validate_csv((folder / "bom.csv").read_text(), model)
    validate_roundtrip((folder / "model.ldr").read_text(), model)
    validate_component_index(plan, model)
    checks = validate_candidate(model, (folder / "model.ldr").read_text(), bom)
    assert checks["artifact_checks_passed"] and report["artifact_checks_passed"], "artifact validation failed"
    assert report["revision_id"] == model["revision_id"], "validation report revision mismatch"
    assert model["revision_id"] in (folder / "preview.html").read_text(), "preview revision mismatch"
    assert .9 * target <= len(model["placements"]) <= 1.1 * target, "outside target count band"
    assert model["provenance"]["fitting"]["reserved_cell_overlap_count"] == 0, "reserved grid envelopes overlap"
    return model, report


def readme(summary):
    lines = [
        "# Generic OBJ exterior examples", "",
        "These four bundles were produced by the same `lego_builder.generic.convert_obj` function with a 2,000-part target and a ±10% band. They are gray digital sculptures derived from each input's geometry. No object-name routing, animal template, vehicle template, padded base, or source-specific panel fitter is invoked.", "",
        "Reproduce from the repository root after installing the project. Choose new output/work directories; existing results are never overwritten:", "",
        "```sh", ".venv/bin/python -m benchmarks.exterior --output outputs/generic-reproduction --work-dir outputs/generic-reproduction-work", "```", "",
        "The committed bundles were generated with `--output examples/generic --work-dir outputs/generic-benchmark-work`. The default library is the bundled official LDraw subset in `lego_builder/data/parts-library`. The harness exits with failure if a conversion fails, the count misses 1,800–2,200 parts, source hashes or artifact checks disagree, reserved grid envelopes overlap, or distinct input geometries produce identical placement sets.", "",
        "| Case | Source / up axis | Parts / lots | Runtime (s) | Reserved-cell overlaps | Continuous envelope distance median / p95 (LDU) | Raster silhouette IoU XY / XZ / YZ |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in summary["cases"]:
        if not row["passed"]:
            lines.append(f"| {row['case']} | {row['source_kind']} / {row['up_axis']} | Failed | {row['runtime_seconds']:.2f} | — | — | — |")
            continue
        distance = row["continuous_source_distance"]
        silhouette = row["silhouette_iou_to_source_triangle_raster"]
        lines.append(f"| [{row['case']}]({row['case']}/preview.html) | {row['source_kind']} / {row['up_axis']} | {row['part_count']} / {row['unique_lots']} | {row['runtime_seconds']:.2f} | {row['reserved_cell_overlap_count']} | {distance['median_ldu']:.2f} / {distance['p95_ldu']:.2f} | {silhouette['xy']:.4f} / {silhouette['xz']:.4f} / {silhouette['yz']:.4f} |")
    lines.extend([
        "", "The cat is the original supplied OBJ. The bottle is a locally generated revolved shape. The rounded fixture is an ellipsoid-like procedural object; its historical filename `rounded_vase.obj` does not imply a hollow vase or a source scan. Both small procedural inputs are explicitly labeled in `benchmarks/fixtures`.", "",
        "The Cybertruck input is copied byte-for-byte from the original supplied OBJ into the ignored benchmark work directory as `neutral_object.obj`; its checksum is verified against the original. The large source is never copied into these tracked examples. This demonstrates that the shared call uses geometry under a neutral filename. The generic Cybertruck sculpture is separate from `examples/cybertruck`, which uses the explicitly source-specific panel fitter and richer vehicle detailing.", "",
        "Each bundle contains canonical placements, matching LDraw, JSON/CSV inventory, a component index, validation report and an interactive actual-part preview. `sequence.json` is a component index, not verified building instructions. `summary.json` binds every result to its canonical revision, placement-set fingerprint, source hash, algorithm, implementation file hashes and catalog dependency hashes. `summary.csv` provides the same case measurements for comparison.", "",
        "Metrics have different scopes. **Reserved-cell overlap** is the fitter's rectangular-envelope bookkeeping; it is not a full triangle collision or physical connection test. **Raster silhouette IoU** compares covered shell projections with sampled source-triangle projections at the selected grid pitch. **Continuous distance** samples inferred exterior-envelope faces against nearest original continuous input triangles; it does not measure the final LEGO surfaces. A slope can remove material inside its reserved rectangular envelope. None of these metrics establishes perceptual resemblance, universal artistic quality, clutch engagement, connectivity, strength or feasible assembly.", "",
        "The envelope uses conservative triangle-box sampling and bounded one-cell closing; small gaps may close and enclosed voids can fill. All assumptions, repairs, inferred cells, count-search attempts and fidelity scope are recorded in each model's provenance. Model colors ignore source materials. Studio imports and physical builds remain unverified.", "",
        f"Run outcome: **{sum(row['passed'] for row in summary['cases'])}/4 case checks passed**. Distinct placement sets: **{summary['distinct_placement_sets']}**. Implementation unchanged during the run: **{summary['implementation_unchanged']}**.", "",
    ])
    return "\n".join(lines)


def run(output, work_dir, library, target_parts=2000):
    output, work_dir, library = Path(output), Path(work_dir), Path(library)
    if output.exists() or work_dir.exists():
        raise FileExistsError("Choose new benchmark output and work directories")
    if output.resolve() == work_dir.resolve() or work_dir.resolve().is_relative_to(output.resolve()):
        raise ValueError("Work directory must stay outside the tracked result directory")
    if target_parts != 2000:
        raise ValueError("This fixed acceptance benchmark requires a 2,000-part target")
    output.mkdir(parents=True)
    work_dir.mkdir(parents=True)
    original_vehicle = ROOT / "references/3d-objects/cybertruck.obj"
    neutral = work_dir / "neutral_object.obj"
    shutil.copyfile(original_vehicle, neutral)
    if sha256(neutral) != sha256(original_vehicle):
        raise ValueError("Neutral-name copy changed the source bytes")
    cases = [
        ("cat", ROOT / "references/3d-objects/cat/12221_Cat_v1_l3.obj", "z", "original supplied cat OBJ", "references/3d-objects/cat/12221_Cat_v1_l3.obj"),
        ("bottle", ROOT / "benchmarks/fixtures/water_bottle.obj", "z", "procedural revolved bottle", "benchmarks/fixtures/water_bottle.obj"),
        ("rounded", ROOT / "benchmarks/fixtures/rounded_vase.obj", "y", "procedural rounded ellipsoid", "benchmarks/fixtures/rounded_vase.obj"),
        ("cybertruck", neutral, "y", "original supplied OBJ under neutral filename", "references/3d-objects/cybertruck.obj"),
    ]
    initial_hashes = implementation_hashes()
    rows = []
    for name, source, up, kind, reference in cases:
        started = time.perf_counter()
        before = sha256(source)
        row = {"case": name, "source_kind": kind, "source_reference": reference,
               "input_name": source.name, "source_sha256": before, "up_axis": up,
               "target_parts": target_parts, "target_band": [1800, 2200],
               "algorithm_version": ALGORITHM, "passed": False, "errors": []}
        try:
            report = convert_obj(source, output / name, library, target_parts, up, 1)
            if not report.get("artifact_checks_passed"):
                raise ValueError(report.get("errors", ["conversion_failed"]))
            model, report = verify_bundle(output / name, before, target_parts)
            provenance = model["provenance"]
            row.update({"passed": True, "revision_id": model["revision_id"], "placement_sha256": placement_hash(model),
                        "part_count": len(model["placements"]), "unique_lots": len(inventory(model)["items"]),
                        "catalog_source_hashes": {name: info["sha256"] for name, info in sorted(model["catalog"]["sources"].items())},
                        "reserved_cell_overlap_count": provenance["fitting"]["reserved_cell_overlap_count"],
                        "continuous_source_distance": provenance["continuous_source_distance"],
                        "silhouette_iou_to_source_triangle_raster": provenance["silhouette_iou_to_source_triangle_raster"],
                        "fitting": provenance["fitting"], "count_search": provenance["count_search"],
                        "source_provenance": provenance["source"], "source_to_ldraw_matrix": provenance["source_to_ldraw_matrix"],
                        "exterior_extraction": provenance["exterior_extraction"],
                        "mechanical_checks": report["mechanical_checks"],
                        "studio_import": report["studio_import"]})
        except (AssertionError, OSError, ValueError, RuntimeError) as exc:
            row["errors"].append(f"{type(exc).__name__}: {exc}")
        if sha256(source) != before:
            row["passed"] = False
            row["errors"].append("Source changed during conversion")
        row["runtime_seconds"] = round(time.perf_counter() - started, 4)
        rows.append(row)
        print(f"{name}: {'PASS' if row['passed'] else 'FAIL'}; parts={row.get('part_count', 'none')}; seconds={row['runtime_seconds']}", flush=True)
        write_json(output / "summary.json", {"complete": False, "cases": rows})
    successful = [row for row in rows if row["passed"]]
    duplicates = []
    for index, a in enumerate(successful):
        for b in successful[index+1:]:
            if a["source_sha256"] != b["source_sha256"] and a["placement_sha256"] == b["placement_sha256"]:
                duplicates.append([a["case"], b["case"]])
    unchanged = initial_hashes == implementation_hashes()
    summary = {"benchmark": "generic-four-obj-exterior-v1", "complete": True,
               "converter": "lego_builder.generic.convert_obj", "algorithm_version": ALGORITHM,
               "target_parts": 2000, "target_band": [1800, 2200], "closing_cells": 1,
               "implementation_sha256": initial_hashes, "implementation_unchanged": unchanged,
               "cases": rows, "identical_placements_across_distinct_sources": duplicates,
               "distinct_placement_sets": len({row["placement_sha256"] for row in successful}),
               "passed": len(successful) == 4 and not duplicates and unchanged,
               "metrics_scope": "Continuous distances concern inferred envelope samples, raster IoU concerns sampled projections, reserved-cell overlaps concern grid bookkeeping; none imply final-part collision freedom or physical buildability."}
    write_json(output / "summary.json", summary)
    with (output / "summary.csv").open("w", newline="") as stream:
        keys = list(dict.fromkeys(key for row in rows for key in row))
        writer = csv.DictWriter(stream, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, sort_keys=True) if isinstance(value, (dict, list)) else value for key, value in row.items()})
    (output / "README.md").write_text(readme(summary))
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("outputs/generic-exterior-benchmark"))
    parser.add_argument("--work-dir", type=Path, default=Path("outputs/generic-exterior-benchmark-work"))
    parser.add_argument("--library", type=Path, default=ROOT / "lego_builder/data/parts-library")
    args = parser.parse_args(argv)
    try:
        summary = run(args.output, args.work_dir, args.library)
    except (OSError, ValueError) as exc:
        parser.exit(2, f"Benchmark failed: {exc}\n")
    return 0 if summary["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
