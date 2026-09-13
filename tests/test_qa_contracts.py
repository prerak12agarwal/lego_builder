"""Independent QA regressions for canonical artifacts and failure honesty."""

import copy
import hashlib
import json

import pytest
import trimesh

from benchmarks.run import main as benchmark_main
from lego_builder.cli import convert
from lego_builder.core import digest, load_catalog, new_model, validate
from lego_builder.export import ldraw, preview, validate_ldraw


def placement(pid="p1", part="3001", position=None, yaw=0, color=4):
    return {
        "id": pid,
        "part_id": part,
        "position": position or [0, 0, 0],
        "yaw": yaw,
        "color": color,
    }


def remint(model):
    model["revision_id"] = digest(
        {key: value for key, value in model.items() if key != "revision_id"}
    )
    return model


@pytest.fixture
def catalog():
    return load_catalog()


@pytest.mark.parametrize(
    ("field", "value", "expected_error"),
    [
        ("algorithm_version", "unknown-algorithm", "algorithm_version"),
        (
            "units",
            {"xy": "meter", "z": "meter", "origin": "upper", "z_axis": "down"},
            "canonical_units",
        ),
    ],
)
def test_reminted_incompatible_canonical_metadata_is_rejected(
    catalog, field, value, expected_error
):
    model = new_model([placement()], catalog, {})
    model[field] = value
    report = validate(remint(model), catalog)
    assert not report["passed"]
    assert expected_error in report["errors"]


def test_catalog_specific_orientation_is_enforced(catalog):
    restricted = copy.deepcopy(catalog)
    next(part for part in restricted["parts"] if part["id"] == "3001")[
        "orientations"
    ] = [0]
    model = new_model([placement(yaw=90)], restricted, {})
    assert "invalid_orientation:p1" in validate(model, restricted)["errors"]


@pytest.mark.parametrize("model", [[], {"placements": [None]}])
def test_malformed_canonical_structure_returns_a_validation_error(catalog, model):
    report = validate(model, catalog)
    assert report["passed"] is False
    assert report["errors"] == ["invalid_model_structure"]


@pytest.mark.parametrize(
    "tamper",
    [
        lambda text, revision: text.replace(
            f"0 Revision {revision}", "0 Revision wrong-revision"
        ),
        lambda text, revision: text.replace("0 STEP\n", "", 1),
        lambda text, revision: text + "2 4 0 0 0 10 0 0\n",
        lambda text, revision: text + "malformed non-comment row\n",
    ],
)
def test_ldraw_roundtrip_rejects_revision_sequence_and_geometry_injection(
    catalog, tamper
):
    model = new_model([placement()], catalog, {})
    altered = tamper(ldraw(model, catalog), model["revision_id"])
    with pytest.raises(ValueError):
        validate_ldraw(altered, model, catalog)


def test_preview_omits_studs_covered_by_later_parts(catalog):
    model = new_model(
        [
            placement(part="3024"),
            placement("p2", part="3024", position=[0, 0, 1]),
        ],
        catalog,
        {},
    )
    markup = preview(model, catalog)
    assert markup.count("<ellipse") == 1


def test_repeated_conversion_has_identical_canonical_artifacts(tmp_path):
    source = tmp_path / "box.stl"
    trimesh.creation.box(extents=[4, 3, 2.4]).export(source)
    first, second = tmp_path / "first", tmp_path / "second"

    first_report = convert(source, first, 8)
    second_report = convert(source, second, 8)
    assert first_report["passed"] and second_report["passed"]

    for name in (
        "model.json",
        "model.ldr",
        "bom.json",
        "bom.csv",
        "sequence.json",
        "preview.html",
    ):
        assert (first / name).read_bytes() == (second / name).read_bytes()

    stored_first = json.loads((first / "validation.json").read_text())
    stored_second = json.loads((second / "validation.json").read_text())
    stored_first.pop("runtime_seconds")
    stored_second.pop("runtime_seconds")
    assert stored_first == stored_second


def test_failed_setting_still_records_the_ingested_source_checksum(tmp_path):
    source = tmp_path / "box.obj"
    trimesh.creation.box().export(source)
    report = convert(source, tmp_path / "invalid-size", size=1)

    assert report["passed"] is False
    assert report["errors"] == ["invalid_size"]
    assert report["run_metadata"]["input_sha256"] == hashlib.sha256(
        source.read_bytes()
    ).hexdigest()


def test_benchmark_retains_every_supplied_and_procedural_attempt(tmp_path):
    output = tmp_path / "benchmark"
    assert benchmark_main(["--output", str(output), "--sizes", "4"]) in (0, 2)
    summary = json.loads((output / "summary.json").read_text())

    assert summary["complete"] is True
    assert summary["total_candidates"] == 11
    assert len(summary["cases"]) == 11
    assert {case["case"] for case in summary["cases"]} == {
        "supplied-cat",
        "supplied-airplane",
        "supplied-house",
        "supplied-house-stl-parity",
        "procedural-cube",
        "procedural-tower",
        "procedural-sphere",
        "procedural-cylinder",
        "procedural-steps",
        "procedural-arch",
        "procedural-pyramid",
    }
    for case in summary["cases"]:
        report = output / case["report"]
        assert report.is_file(), case
        assert json.loads(report.read_text())["passed"] is case["passed"]
