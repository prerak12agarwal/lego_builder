# Local MVP evidence

`mvp-v1.json` and `mvp-v1.csv` record an actual local benchmark of ten distinct shapes plus the supplied house STL alternate encoding, at 8, 12, 16 and 24 studs. JSON includes source checksums, catalog hash/version, sampler and algorithm version. Timing is this machine's observation, not a performance guarantee. The files are unmodified public-harness summary outputs. The pinned environment and command below reproduce the run; output directories are intentionally ignored and must be regenerated locally.

```sh
.venv/bin/python -m benchmarks.run --output outputs/benchmark-final-trace --sizes 8 12 16 24
```

**26 of 44 candidates passed automated validation; 18 were correctly retained as diagnostic-only failures.** Both original supplied OBJ successes were found by bounded plate exact-cover retile after greedy attempts failed:

| Supplied source | Result | Pieces / lots | Single-stud / partially supported parts |
| --- | --- | --- | --- |
| Cat, 8 studs | Pass; 112 occupied cells | 29 / 5 | 2 / 5 |
| Airplane, 12 studs | Pass; 188 occupied cells | 43 / 6 | 7 / 12 |
| Cat, 12/16/24 studs | Rejected: no valid shape-only assembly found | — | — |
| Airplane, 8/16/24 studs | Rejected: no valid shape-only assembly found | — | — |
| House OBJ and STL, all four sizes | Rejected: degenerate/non-watertight source geometry | — | — |

The seven procedural shapes are explicitly labeled clean fixtures, not reconstructions or replacements for supplied inputs. Cube, tower, cylinder, steps and pyramid pass at all four sizes; sphere passes at 12 only; arch passes at 8, 12 and 16. Different scales discretize features differently; larger is not automatically feasible.

No added support geometry or manual repairs were used. Conservative triangle-box sampling can thicken features by up to one cell and closes/fills enclosed grid voids. The reported voxel/silhouette overlaps compare to that discrete target, **not** to a human resemblance rating or exact continuous surface. The original source checksums remain recorded and unchanged.

All 26 successful result sets were subsequently rechecked against the final canonical, JSON BOM, CSV BOM, sequence and LDraw validators. All 18 failed directories were checked to contain only `validation.json`. This confirms automated consistency, not sufficient physical strength or real assembly usability. Studio import, full visual resemblance review and two difficult physical builds remain unverified P0 release gates; independent QA evidence is maintained separately.
