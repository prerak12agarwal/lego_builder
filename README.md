# LEGO Builder

A local, deterministic research converter from closed OBJ/STL meshes to assemblies of twelve verified rectangular LEGO brick/plate families. It exports one canonical placement revision, LDraw, an exact parts list, a schematic preview, bottom-up placement order and validation diagnostics. Photo reconstruction and the consumer web application remain future work.

Successful automated checks establish the restricted geometry/connector rules only. BrickLink Studio imports, recognizable resemblance, physical stability and assembly must still be reviewed; the P0 release gate is not complete.

## Install and run

Requires Python 3.11 or newer. Run from the repository root:

```sh
python3.11 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
.venv/bin/python -m lego_builder --help
.venv/bin/python -m lego_builder convert references/3d-objects/cat/12221_Cat_v1_l3.obj --size 8 --up z --output outputs/cat-8
```

The supplied cat at size 8 is a verified automated-success example (29 parts); the supplied airplane at size 12 also succeeds (43 parts). Both retain structural risk warnings and still need Studio/physical review. The supplied objects are real feasibility inputs; other sizes may fail and return diagnostics. A new output directory is required for every run, preventing an unsuccessful run from leaving stale successful artifacts. Exit status is `0` for an automated-valid candidate and `2` for a rejected conversion or command error.

`--size` sets the longest physical source dimension in studs, from 4 to 48; a separate 180,000-cell bound can reject large volumetric models. `--up` explicitly selects the source upright axis (`x`, `y` or `z`; default `z`). Supplied cat and airplane are Z-up; house OBJ is Y-up and house STL is Z-up. Source translation, proper rotation, isotropic physical scaling and plate-grid scaling are recorded. All output uses verified Red (LDraw 4 / BrickLink 5). Material/texture references are ignored and never loaded.

The executable CLI is the source of truth for command options. Outputs are staged and validated before a directory is published. Existing directories are never overwritten.

## Inspect a result

A successful candidate contains:

| File | Contents |
| --- | --- |
| `model.json` | Immutable canonical placements, catalog identity, source checksum, normalization matrix and algorithm settings |
| `model.ldr` | LDraw type-1 references and one `STEP` per placement; load in Studio or another complete LDraw viewer |
| `bom.json`, `bom.csv` | Exact quantities grouped by catalog part and color, carrying the same revision |
| `sequence.json` | Bottom-up placement IDs, each introduced once; inspect positions in `model.json` |
| `preview.html` | Standalone local isometric inspection with simplified bodies and studs, per-part hover labels and inventory |
| `validation.json` | Required checks, attempted seam repairs, timings, unsupported conditions and structural risk metrics |

Open `preview.html` in a browser. It needs no server or network connection. The preview is a schematic and is not the future interactive consumer viewer or a complete printable instruction manual. Root LDraw geometry is retained for attribution/provenance; the complete recursive rendering library is external. See [catalog provenance](lego_builder/data/README.md).

Recheck a result after copying or inspecting it:

```sh
.venv/bin/python -m lego_builder validate outputs/cat-8
```

This rechecks canonical content integrity, allowed parts/colors/orientations, collisions, stud/socket support, connectedness, insertion order, JSON/CSV BOM, sequence and LDraw transforms. It does not re-read the source mesh or re-establish voxel coverage. A failed run contains only `validation.json`, with a category and actionable diagnostic; no successful LDraw, inventory or model is published.

## Implemented boundary

Coordinates use integer stud units in X/Y and plate units in Z at each part's lower corner. Yaw is 0° or 90°. The catalog defines analytic rectangular body envelopes and stud-grid mating sites. A part above the base plane must connect to an earlier part directly below its underside. Separate parts may rest on the table during early steps, but the final assembly must be one connection graph. Side contact is never accepted as a stud connection.

The solver deterministically covers target cells with known parts, favors cross-layer bridges and reaches otherwise unsupported target cells where a legal part can bridge them. It tries a bounded reverse seam retile and a plate-only retile if needed, followed by an exact-cover search for unsupported cells (25,000 nodes / depth 250). It rejects unresolved gaps, collisions, floats and disconnected assemblies. Conservative triangle-box intersection preserves every intersected surface cell and fills enclosed grid cells, thickening features by up to one cell and filling internal voids. It does not add support columns, a platform, hollowing, substitute hulls or silently remove occupied target cells. Risk counts flag single-stud support, partially supported parts and repeated seams; they are not a force/clutch/tipping simulation.

Inputs are bounded to 80 MiB and 300,000 triangles. Closed, consistently wound finite meshes are required; coincident vertices are merged. Open, degenerate and zero-volume meshes fail with diagnostics. Arbitrary self-intersection detection and safe repair of complex topology are outside this prototype. Input licensing is unresolved for the supplied third-party reference assets; generated procedural fixtures are clearly labeled and distinct from them.

## Verify and benchmark

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m benchmarks.run --output outputs/benchmark --sizes 8 12 16 24
```

A [recorded 44-candidate run](benchmarks/results/README.md) produced 26 automated-valid candidates and 18 diagnostic-only failures, with both supplied cat and airplane successes.

The benchmark attempts all three original supplied OBJs and a house STL parity case, plus seven generated clean fixtures (cube, tower, sphere, cylinder, steps, arch, pyramid): ten distinct shapes and one alternate encoding, at four default sizes. It preserves each failure report and writes `summary.json` / `summary.csv` with real statuses, counts, runtimes, repairs and structural risks. The harness exits unsuccessfully if no original supplied OBJ succeeds. Matching a voxel target exactly is not evidence of perceptual resemblance to the original continuous surface; benchmark silhouette/voxel overlap metrics are labeled accordingly. Inspect source and output together and record manual resemblance, Studio imports and physical builds before release.

Tests independently exercise asymmetric LDraw transforms, proper rotations, altered BOM/revisions/steps, unknown parts/colors, collisions, unsupported and disconnected placements, valid later bridging of base components, deterministic fitting, anisotropic normalization, diagnostic-only failures, resource limits and atomic publication behavior.

## Product and collaboration

- [Roadmap](Roadmap.md): scope, delivery phases and release gates.
- [Product](Product.md): user outcomes, acceptance criteria and reference decisions.
- [Architecture](Architecture.md): geometry, schema and pipeline contracts.
- [AGENTS](AGENTS.md): engineering roles and branch/review policy.
- [References](references/README.md): source assets, visual references and provenance boundary.

Keep `main` stable. Work on short-lived feature branches and use partner-reviewed pull requests. Commit and push are owned by the primary integrator; role agents hand off edits and verification evidence.
