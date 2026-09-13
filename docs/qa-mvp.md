# OBJ/STL-to-LEGO MVP QA evidence

## Recommendation

Pass for partner review as an **engineering prototype**. Do not describe this branch as P0-complete, release-ready, or proven buildable. BrickLink Studio imports, full human resemblance review, and representative physical builds remain required release evidence.

No open P0/P1/P2 implementation defect was found in the final QA pass. Structural risk is still material: the automated connector model establishes only the declared rectangular stud/socket, collision, connectedness, and bottom-up insertion rules. It does not establish clutch strength, torque, tipping resistance, hand access, or real assembly success.

## Tested state

- Branch: `codex/obj-to-lego-mvp`
- Git base: `aa51cabcca55b7967b7ad9249d73c14a0c41af74`
- Working tree: uncommitted combined Product, Architecture, Developer, and QA changes
- QA timestamp: 2026-09-13 13:04:47 +08
- Python: 3.11.15
- Implementation/test/evidence content fingerprint: `dfa3723805e45feb90d3959c946bfe4ae76a3aeef64c026f4281ae9b91ad2bdb` (SHA-256 of the sorted per-file SHA-256 manifest under `lego_builder/`, `benchmarks/`, and `tests/`, excluding caches and `.DS_Store`)

The four supplied source files have no Git diff. Final observed SHA-256 values:

| Source | SHA-256 |
| --- | --- |
| Cat OBJ | `0de7714a0f30f7bc735a5419e0ceb5f7d2cb12eabcf017a80d0a9cc797e057de` |
| Airplane OBJ | `f682b80659503adc5d2d5daf4a9ea920a7f7b19db72db6e9bffaf16e9c6f314c` |
| House OBJ | `c02592525dd1222da0183f27d75859106ef09f54be12e1d11333f696f4334cb3` |
| House STL | `49beb796c1a3653d1ce37f25409944252a687929fb1bd4626cd99d6ba9b4a313` |

## Automated evidence

- `.venv/bin/python -m pytest -q`: **37 passed in 3.31 seconds**.
- `.venv/bin/python -m compileall -q lego_builder benchmarks tests`: passed.
- `git diff --check`: passed.
- The primary agent's final wheel build passed; its archive contained all twelve catalog root `.dat` files and attribution material. Wheel SHA-256: `1ab42061c05a65513b3649489e4b7e8e56bbde55c9a21bb896db2041cde1ed72`.
- The retained 44-candidate benchmark snapshot is byte-identical to `outputs/benchmark-final-trace/summary.json` and `summary.csv`.
- QA independently revalidated all 26 successful benchmark directories against the current canonical, JSON BOM, CSV BOM, sequence, and LDraw validators. All 18 rejected directories contained only `validation.json`.
- QA independently converted the original cat at 8 studs and airplane at 12 studs. Their canonical model, LDraw, JSON/CSV BOM, sequence, and preview were byte-identical to the retained benchmark outputs.
- Repeated conversion tests establish deterministic canonical artifacts; only runtime metadata may differ.
- Focused QA tests cover incompatible/reminted canonical metadata, catalog-specific orientations, malformed model structure, LDraw revision/STEP/extra-geometry tampering, covered preview studs, failed-run checksum traceability, deterministic bundles, and retention of every benchmark attempt.

## Supplied-source outcomes

| Attempt | Automated outcome | Parts / lots | Structural risk counts | Manual/added supports |
| --- | --- | --- | --- | --- |
| Cat, 8 studs | Pass under declared analytic rules | 29 / 5 | 2 single-stud; 5 partially supported | 0 / 0 |
| Airplane, 12 studs | Pass under declared analytic rules | 43 / 6 | 7 single-stud; 12 partially supported | 0 / 0 |
| Cat, 12/16/24 studs | Rejected: no valid bounded shape-only assembly | — | — | 0 / 0 |
| Airplane, 8/16/24 studs | Rejected: no valid bounded shape-only assembly | — | — | 0 / 0 |
| House OBJ/STL, all four sizes | Rejected: degenerate/non-watertight input | — | — | 0 / 0 |

The full benchmark produced 26 automated-valid candidates and 18 diagnostic-only failures across ten distinct shapes plus the house STL parity encoding at 8, 12, 16, and 24 studs. All attempts record source checksum/format, catalog and algorithm identity, palette, transform status, result, runtime, and resemblance-review status. Failed candidates remain visible and never publish nominally successful model artifacts.

## Visual evidence and limits

The initial preview rendered internal/covered surfaces and produced false holes and protrusions. The final renderer culls covered studs and internal faces; a regression test protects that behavior. Offline PNG renders of the final cat and airplane previews show coherent exterior geometry without the earlier false topology.

The cat output is a very coarse, two-stud-thick side-on animal silhouette: raised head/neck, torso, legs, and tail are visible, while paired legs merge and ears/face detail disappear. The airplane output shows a coarse fuselage, wings, raised tail, and squared nose, while rounded surfaces, engines, and fine detail disappear. These observations are useful preliminary resemblance evidence only. No accepted fidelity threshold exists, and the remaining successful procedural previews have not received a full manual resemblance review.

The preview was rendered to PNG offline for inspection; browser rendering was not exercised because the available browser environment blocked local `file:` navigation. BrickLink Studio was not installed or run. No model was physically assembled.

## Defects resolved during QA

- P1: preview painter ordering and hidden surface rendering invented visible topology. Fixed with exterior-only patches, covered-stud culling, and depth sorting.
- P1: reminted models with incompatible algorithm/units could validate. Fixed with explicit canonical metadata checks.
- P1: LDraw replay ignored revision/STEP divergence and injected geometry. Fixed with structural LDraw validation.
- P1: benchmark failures lacked enough versioned run metadata to compare catalog/algorithm outcomes. Fixed in per-run reports and public benchmark rows.
- P2: orientation validation ignored catalog-specific legal orientations. Fixed.
- P2: malformed canonical JSON structures produced tracebacks. Fixed with structural diagnostics and exit status 2.
- P2: CSV inventory was published but not independently replay-validated. Fixed and reported as `csv_inventory`.
- P2: valid inputs rejected for invalid settings lost the already-computed source checksum. Fixed.

## Remaining gates

- Import every release candidate into BrickLink Studio and record missing-part, transform, and inventory results.
- Physically build at least two difficult representative outputs and record stability, insertion, and instruction findings.
- Complete human source-to-output resemblance reviews and agree on a fidelity threshold.
- Treat single-stud and partial-support metrics as unresolved physical risks until those builds exist.
