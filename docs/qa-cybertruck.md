# Cybertruck exterior vertical-slice QA

## Recommendation

The Cybertruck output is suitable as an **exported digital exterior candidate**. It is not a buildability-verified assembly. Collision, connectivity, clutch engagement, stability, insertion order and physical assembly remain unevaluated, and the component index is not build instructions.

This review covers the source-specific Cybertruck path. It does not broaden the established rectangular converter's claims.

## Candidate reviewed

- Working branch: `codex/obj-to-lego-mvp`
- Source: `references/3d-objects/cybertruck.obj`, 17,697,677 bytes, SHA-256 `7c147bef624baf9c278da9d8701c6f7fb8b13438cc2b7d6c37f68c316f12436a`
- Tested working-tree base commit: `69bd61eac37d4fed9efdf4f7ec94fce9e1c0c2e0` plus the uncommitted integrated Cybertruck/generic changes listed by `git status`
- Candidate bundle: `examples/cybertruck`
- Candidate revision: `f172ee1f380d411589f1aedcdfc46fee58170d5df7f238ab1273fb0cd4c12751`
- Resolved design settings used to reproduce it: 64 studs long, part `45982` tires, three-stud maximum side tiles
- Result: 2,069 physical placements, 45 part/color lots, 23 root part IDs and 140 recursively resolved LDraw source files
- Preview: renderer `ldraw-webgl-instanced-v2`, 2,069 instances, 22,200 unique triangles and 663,510 instanced triangles using actual LDraw geometry
- Final QA suite: 15 focused checks passed in 0.89 seconds; 94 combined checks passed in 4.89 seconds after final generic benchmark integration

## Evidence

| Area | Independent check | Result |
| --- | --- | --- |
| Source preservation | Hashed the original before fitting, fitted the real file, and reread it afterward | Pass; bytes and expected SHA-256 unchanged |
| Exterior cleanup | Inspected the 31 OBJ groups and provenance | Pass; body, glazing, trim, lights and four wheels retained; sphere, steering wheel, dashboard and six seat groups explicitly discarded with face counts |
| Source-driven fit | Compared canonical front/rear body and axle values with transformed source-group bounds; regenerated from the same settings | Pass; dimensions and axle positions match the source-derived groups and regeneration is deterministic |
| Count and scope | Counted canonical placements and component labels | Pass; 2,069 is within 1,800–2,200, and no stand, plinth or support-column component exists |
| Canonical transforms | Checked every placement ID and rotation | Pass; 2,069 unique stable IDs, finite orthonormal rotations, determinants from `0.9999999989` to `1.0000000007` |
| Catalog geometry | Ran recursive resolution against `outputs/ldraw-library/ldraw` and compared catalog roots with placement IDs | Pass; all roots resolve to solid official part geometry and every root/dependency source has a SHA-256 and attribution record |
| Part/color evidence | Inspected every catalog entry used by the BOM | Pass at the catalog-evidence level; all 45 used lots bind a `verified` manufactured combination. Seller stock, quantities and mechanical compatibility are outside this evidence |
| Artifact identity | Recomputed the model revision and independently parsed LDraw, JSON BOM, CSV BOM and component index | Pass; one revision across artifacts, 2,069 type-1 placements, BOM totals 2,069, and each placement occurs exactly once in the component index |
| Tamper rejection | Injected LDraw type 2/3 geometry, malformed rows, stale/duplicate revision headers, invalid colors/parts, nonrigid transforms and stale preview content | Pass after fixes; validation rejects each case |
| Failure isolation | Forced catalog and preview publication failures | Pass after fix; no public result directory or staging directory remains |
| Renderer transform | Decoded packed preview vertices/matrices and compared `R * local + translation` with the canonical placement | Pass; renderer uses the canonical row-major transform and rejects a stale canonical revision |
| Visual exterior review | Rendered actual official LDraw geometry from three-quarter, side, front and top viewpoints and inspected `examples/cybertruck/front-three-quarter.png` | Pass for a digital exterior candidate: long low wedge, angular stainless shell, continuous dark windshield/side glazing, open bed, large tires, angular arches, lower trim and thin front/rear light bars are visible. Fine panel continuity remains approximate |
| Studio import | Inspected `examples/cybertruck/studio-import.png`; QA did not operate Studio | BrickLink Studio 2.26.8 completed import of the exact `model.ldr` path and displayed 2,069 total parts with no missing-part dialog. This is compatibility/count evidence, not collision or connection validation |
| Physical evidence | Read the candidate validation states | Pending; no physical build was performed |

The candidate model SHA-256 reviewed was `5ea82e47534486cf3160b0bb0cfdae6805ee90d84b3818d06238cab589a912cb`; its LDraw SHA-256 was `a7f02ab1c59eb08a51b39c32040d5f212240911ef2377d6ff16036528f2aa82a`.

## Defects challenged

Three artifact-integrity defects were found and covered by regressions:

1. LDraw validation previously ignored added type 2–5 geometry and did not require the exact canonical revision header. It now accepts only comments and canonical type-1 rows, requires one matching revision header, and rejects added or malformed geometry.
2. Candidate files and the preview were previously written directly into the public output directory. Publication now stages the complete bundle and renames it only after catalog, artifact and preview generation succeeds.
3. The renderer previously displayed a model after canonical content changed without reminting its revision. It now recomputes and verifies the canonical revision before producing preview data.

The canonical model now binds the target of 2,000 parts, target band `[1800, 2200]`, tolerance `0.1` and hard output cap of 10,000 into its revision. Validation rejects missing or inconsistent target constraints and reports the canonical values rather than separate defaults. Catalog evidence hashing is scoped to the selected part/color proof records, so unrelated future evidence does not invalidate this candidate.

## Commands

```sh
.venv/bin/python -m pytest -q tests/test_exterior_qa.py
.venv/bin/python -m pytest -q
.venv/bin/lego-builder validate examples/cybertruck --library outputs/ldraw-library/ldraw
```

The physical release gate remains open until representative collision/connection review and physical assembly evidence exist. Those missing checks must remain visible rather than inheriting the digital artifact pass.
