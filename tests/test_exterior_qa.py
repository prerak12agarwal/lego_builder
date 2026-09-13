"""Independent QA regressions for the source-fitted Cybertruck vertical slice."""
from collections import Counter
from copy import deepcopy
import base64
import csv
import hashlib
import json
from pathlib import Path
import zlib

import numpy as np
import pytest

from lego_builder.assembly import (
    SCHEMA,
    inventory,
    ldraw_text,
    publish_candidate,
    revision,
    validate_candidate,
    validate_component_index,
    validate_csv,
    validate_roundtrip,
)
from lego_builder.exterior import read_exterior
from lego_builder.ldraw_library import LDrawLibrary
from lego_builder.render import preview_data
from lego_builder.vehicle import fit_cybertruck


REFERENCE = Path(__file__).parents[1] / "references" / "3d-objects" / "cybertruck.obj"
EXPECTED_SOURCE_SHA256 = "7c147bef624baf9c278da9d8701c6f7fb8b13438cc2b7d6c37f68c316f12436a"


def _write_library(root):
    (root / "parts" / "s").mkdir(parents=True)
    (root / "p").mkdir()
    (root / "LDConfig.ldr").write_text(
        "0 Color definitions\n"
        "0 !COLOUR Black CODE 0 VALUE #05131D EDGE #595959\n"
        "0 !COLOUR Light_Bluish_Gray CODE 71 VALUE #A0A5A9 EDGE #333333\n"
    )
    (root / "CAreadme.txt").write_text("LDraw attribution fixture\n")
    (root / "p" / "qa-triangle.dat").write_text(
        "0 qa primitive\n0 BFC CERTIFY CCW\n3 16 0 0 0 20 0 0 0 0 20\n"
    )
    (root / "parts" / "s" / "qa-nested.dat").write_text(
        "0 qa subpart\n0 BFC INVERTNEXT\n"
        "1 16 0 0 0 1 0 0 0 1 0 0 0 1 qa-triangle.dat\n"
    )
    # 3024/black is present in the repository's reviewed part/color evidence.
    (root / "parts" / "3024.dat").write_text(
        "0 Plate 1 x 1 QA fixture\n0 !LDRAW_ORG Part\n"
        "0 Author: QA Fixture\n0 !LICENSE Redistributable under CC BY 4.0\n"
        "1 16 0 0 0 1 0 0 0 1 0 0 0 1 s/qa-nested.dat\n"
    )
    return LDrawLibrary(root)


def _candidate(*, color=0, part_id="3024"):
    model = {
        "schema_version": SCHEMA,
        "algorithm_version": "qa-fixture-v1",
        "status": "digital_candidate",
        "constraints": {
            "target_parts": 2000,
            "target_band": [1800, 2200],
            "target_tolerance": 0.1,
            "max_output_parts": 10000,
        },
        "provenance": {"source": {"sha256": "qa-source"}},
        "placements": [
            {
                "id": "p00001",
                "part_id": part_id,
                "color": color,
                "position_ldu": [10, -8, 20],
                "rotation": [0, 0, 1, 0, 1, 0, -1, 0, 0],
                "component": "qa exterior",
            }
        ],
    }
    model["revision_id"] = revision(model)
    return model


def test_real_reference_is_preserved_and_drives_the_candidate_dimensions():
    before = REFERENCE.read_bytes()
    groups, intake = read_exterior(REFERENCE, 64)
    # Exercise the accepted final design settings rather than the diagnostic defaults.
    model = fit_cybertruck(REFERENCE, 64, "45982", 3)
    fitted = model["provenance"]["fitted_parameters"]

    assert hashlib.sha256(before).hexdigest() == EXPECTED_SOURCE_SHA256
    assert REFERENCE.read_bytes() == before
    assert model["provenance"]["source"]["sha256"] == EXPECTED_SOURCE_SHA256
    assert model["provenance"]["length_studs"] == 64
    assert model["constraints"] == {
        "target_parts": 2000,
        "target_band": [1800, 2200],
        "target_tolerance": 0.1,
        "max_output_parts": 10000,
    }
    assert np.ptp(groups["Body_Shell_Cube.001"][:, 2]) == pytest.approx(64 * 20)
    assert fitted["front_z"] == pytest.approx(groups["Body_Shell_Cube.001"][:, 2].max())
    assert fitted["rear_z"] == pytest.approx(groups["Body_Shell_Cube.001"][:, 2].min())
    wheel_centers = [
        (points.min(axis=0) + points.max(axis=0)) / 2
        for name, points in groups.items()
        if name.startswith("Wheel")
    ]
    assert fitted["front_axle_z"] == pytest.approx(max(center[2] for center in wheel_centers))
    assert fitted["rear_axle_z"] == pytest.approx(min(center[2] for center in wheel_centers))
    assert {item["name"] for item in intake["discarded_groups"]} == {
        "Sphere.001",
        "Steering_Wheel_Cylinder.003",
        "Seat_Cube.030",
        "Seat.001_Cube.031",
        "Seat.002_Cube.032",
        "Seat.003_Cube.033",
        "Seat.004_Cube.034",
        "Seat.005_Cube.035",
        "Dash_Cube.036",
    }

    assert 1800 <= len(model["placements"]) <= 2200
    assert [p["id"] for p in model["placements"]] == [
        f"p{number:05d}" for number in range(1, len(model["placements"]) + 1)
    ]
    assert all(
        word not in p["component"].casefold()
        for p in model["placements"]
        for word in ("stand", "plinth", "support column")
    )
    for placement in model["placements"]:
        rotation = np.asarray(placement["rotation"]).reshape(3, 3)
        np.testing.assert_allclose(rotation.T @ rotation, np.eye(3), atol=1e-6)
        assert np.linalg.det(rotation) == pytest.approx(1, abs=1e-6)


def test_publication_bundle_is_exact_revision_bound_and_mechanically_honest(tmp_path):
    library = _write_library(tmp_path / "library")
    output = tmp_path / "candidate"

    def preview_writer(model, received_library, path):
        assert received_library is library
        path.write_text(model["revision_id"])
        return {"revision_id": model["revision_id"], "instances": len(model["placements"])}

    model, report = publish_candidate(output, _candidate(), library, preview_writer=preview_writer)
    disk_model = json.loads((output / "model.json").read_text())
    disk_bom = json.loads((output / "bom.json").read_text())
    disk_index = json.loads((output / "sequence.json").read_text())
    disk_report = json.loads((output / "validation.json").read_text())

    assert sorted(path.name for path in output.iterdir()) == [
        "bom.csv", "bom.json", "model.json", "model.ldr", "preview.html", "sequence.json", "validation.json"
    ]
    assert disk_model == model and model["revision_id"] == revision(model)
    assert disk_bom == inventory(model)
    assert report == disk_report and report["preview"]["revision_id"] == model["revision_id"]
    assert report["artifact_checks_passed"] and report["catalog_checks"] == "passed"
    assert set(report["mechanical_checks"].values()) == {"not_evaluated"}
    assert report["studio_import"] == "not_evaluated"
    assert model["catalog"]["parts"]["3024"]["colors"] == [0]
    assert model["catalog"]["parts"]["3024"]["manufactured_color_availability"] == "cataloged_combination_verified"
    selected_evidence = [
        evidence
        for part in model["catalog"]["parts"].values()
        for evidence in part["color_evidence"]
    ]
    expected_evidence_hash = hashlib.sha256(
        json.dumps(selected_evidence, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert model["catalog"]["color_evidence_scope"] == "used_part_color_records"
    assert model["catalog"]["color_evidence_sha256"] == expected_evidence_hash
    validate_roundtrip((output / "model.ldr").read_text(), model)
    validate_csv((output / "bom.csv").read_text(), model)
    validate_component_index(disk_index, model)
    assert Counter(row["part_id"] for row in csv.DictReader((output / "bom.csv").open())) == {"3024": 1}


@pytest.mark.parametrize(
    "mutation, match",
    [
        (lambda text, model: text.replace(model["revision_id"], "stale"), "revision"),
        (lambda text, model: text + "2 24 0 0 0 20 0 0\n", "noncanonical"),
        (lambda text, model: text + "3 16 0 0 0 20 0 0 0 20 0\n", "noncanonical"),
        (lambda text, model: text + "malformed row\n", "noncanonical"),
        (
            lambda text, model: text.replace(
                "0 Mechanical connections", f"0 !LEGO_BUILDER_REVISION {model['revision_id']}\n0 Mechanical connections"
            ),
            "revision",
        ),
    ],
)
def test_ldraw_roundtrip_rejects_stale_revision_and_extra_geometry(mutation, match):
    model = _candidate()
    with pytest.raises(ValueError, match=match):
        validate_roundtrip(mutation(ldraw_text(model), model), model)


def test_invalid_catalog_entries_and_preview_failure_leave_no_published_bundle(tmp_path):
    library = _write_library(tmp_path / "library")
    for name, model, message in (
        ("unknown", _candidate(part_id="not-a-real-part"), "Missing LDraw dependency"),
        ("color", _candidate(color=999), "Color outside exterior palette"),
    ):
        output = tmp_path / name
        with pytest.raises(ValueError, match=message):
            publish_candidate(output, model, library)
        assert not output.exists()

    output = tmp_path / "preview-failure"

    def fail_preview(*_args):
        raise RuntimeError("renderer failed")

    with pytest.raises(RuntimeError, match="renderer failed"):
        publish_candidate(output, _candidate(), library, preview_writer=fail_preview)
    assert not output.exists()
    assert not list(tmp_path.glob(".preview-failure-staging-*"))


def test_canonical_rejects_nonrigid_transform_and_revision_tampering():
    malformed = _candidate()
    malformed["placements"][0]["rotation"][0] = 2
    malformed["revision_id"] = revision(malformed)
    assert "nonrigid_or_reflected_transform" in validate_candidate(malformed)["errors"]

    stale = _candidate()
    stale["placements"][0]["color"] = 71
    assert "revision_hash_mismatch" in validate_candidate(stale)["errors"]


@pytest.mark.parametrize(
    "constraints",
    [
        None,
        {},
        {"target_parts": 2000, "target_band": [1800, 2200], "target_tolerance": 0.1},
        {"target_parts": 2000, "target_band": [1801, 2200], "target_tolerance": 0.1},
        {"target_parts": 2000, "target_band": [1800, 2200], "target_tolerance": "10%"},
    ],
)
def test_piece_target_is_revision_bound_and_validated_from_canonical_model(constraints):
    model = _candidate()
    if constraints is None:
        del model["constraints"]
    else:
        model["constraints"] = constraints
    model["revision_id"] = revision(model)
    report = validate_candidate(model)
    assert "invalid_or_missing_piece_target_constraints" in report["errors"]
    assert not report["artifact_checks_passed"]

    valid = _candidate()
    report = validate_candidate(valid)
    assert report["target_parts"] == 2000
    assert report["target_band"] == [1800, 2200]


def test_renderer_rejects_stale_revision_and_applies_same_row_major_transform(tmp_path):
    library = _write_library(tmp_path / "library")
    model = _candidate()
    data = preview_data(model, library)
    group = data["groups"][0]
    vertices = np.frombuffer(zlib.decompress(base64.b64decode(group["vertices"])), dtype="<f4").reshape(-1, 10)
    matrices = np.frombuffer(zlib.decompress(base64.b64decode(group["matrices"])), dtype="<f4").reshape(-1, 4, 4)
    webgl_matrix = matrices[0].T
    expected = np.asarray(model["placements"][0]["rotation"]).reshape(3, 3) @ vertices[0, :3] + np.asarray(
        model["placements"][0]["position_ldu"]
    )
    np.testing.assert_allclose(webgl_matrix[:3, :3] @ vertices[0, :3] + webgl_matrix[:3, 3], expected)

    model["placements"][0]["position_ldu"][0] += 20
    with pytest.raises(ValueError, match="revision"):
        preview_data(model, library)
