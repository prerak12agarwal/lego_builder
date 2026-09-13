# LEGO Builder draft instruction QA

## Scope and tested revision

- Branch: `codex/unified-workshop`
- Base HEAD during review: `d6af1597256f06111d064c3255d0c2d112801462`
- Tested the uncommitted combined working tree shown by `git status` on 2026-09-13.
- Reviewed `lego_builder/generic.py`, `lego_builder/assembly.py`, `tests/test_generic.py`, the HTTP/TypeScript integration tests, and `site/components/assembly-workspace.tsx` read-only.
- No product, test, or repository files were edited by QA.

## Result

No open correctness defect remains in the draft-layer instruction slice after the developer fixed issues found during this review. The source slice is suitable to integrate as a **draft, mechanically unverified instruction prototype**.

This is not a hosted end-to-end release recommendation yet. The external Python converter still needs deployment with `generic-exterior-shell-v2-draft-layers`, followed by a real saved image-derived OBJ-to-LDR run through the workshop Site. The current/earlier hosted converter output without steps cannot establish this behavior. Connectivity, insertion access, stability, and physical buildability remain `not_evaluated`; no physical build was performed.

## Passing evidence

### Complete automated suites

- `/private/tmp/lego-workshop-python/bin/python -m pytest -q` with local loopback permitted: **111 passed in 42.35s**.
  - Covers generic, established rectangular/vehicle assembly candidates, converter service, real HTTP worker conversion, and Python-to-TypeScript LDraw receiving/import.
  - Updated bottle integration expects and imports nonempty draft `STEP` groups and compares final placement/parts counts.
- `cd site && npm run typecheck`: **passed**.
- `cd site && npm test`: **76 passed**.
- `git diff --check`: **passed**.

### Independent invariant probe

A controlled fully occupied `4 x 4 x 4` fitter grid produced both plate/tile-height (`1`) and brick-height (`3`) placements. For every emitted placement, QA independently recovered the bottom grid layer as:

`-position_ldu.y / 8 - catalog_part_height`

and confirmed equality with `draft_bottom_layer`. The generated plan had nonempty ordered layers `[0, 3]`, one exact `0 !LEGO_BUILDER_INSTRUCTIONS DRAFT_LAYER_V1` marker, canonical geometry unchanged, and `validate_candidate(...).artifact_checks_passed == true`.

The same exact-plan fixture rejected all independently modified serializations:

- marker removed;
- marker changed to a near-match with an extra token;
- marker duplicated;
- one required `STEP` boundary removed; and
- an adjacent empty `STEP` boundary inserted.

The test suite also rejects duplicated/omitted placement membership, self-consistent cross-layer membership swaps, reversed layer order, stale revision binding, and mechanics changed from `not_evaluated`.

### Workshop presentation

- The workshop identifies draft provenance only when a trimmed LDraw line exactly equals `0 !LEGO_BUILDER_INSTRUCTIONS DRAFT_LAYER_V1`.
- Results with that marker and real step boundaries show the count as draft and display: “Draft instructions — assembly order, connections, stability and physical buildability are unverified.”
- The browser importer continues to use explicit `STEP` / `ROTSTEP` boundaries. It does not infer missing instructions. A model without boundaries keeps Model and Parts inspectable and shows the established missing-steps state.

## Defects found and resolved during QA

1. **High — forged plan membership could pass validation.** A plan could swap placement IDs across bottom layers, recompute both revision fields, and pass candidate/LDraw validation. Validation now requires exact schema/kind/mechanics, deterministic member ordering, and exact equality with a plan rebuilt from each placement's fitter-owned `draft_bottom_layer`. Regression cases pass.
2. **Medium — empty LDraw step could pass.** An adjacent duplicated `0 STEP` was ignored when the current group was empty, contrary to the nonempty-step contract. Planned LDraw now rejects a boundary when the current group is empty, while the exporter’s ordinary trailing boundary still closes a nonempty group. Regression test passes.
3. **Test defects — updated behavior and HTTP completion.** The real bottle receiver test still expected zero steps after the feature was added, and the service test raced the handler’s post-response semaphore release. Expectations now cover positive draft steps, and the semaphore assertion waits for handler completion. Both pass in the full suite.

## Remaining limits

- The durable generic test named for mixed parts does not explicitly assert that multiple part heights occurred or independently recover true bottom layers; the independent QA probe above covers this revision. Adding those assertions would strengthen regression coverage.
- No hosted converter-v2 health/version check, unauthorized probe, cold-start run, saved production job, or live image-derived full pipeline was part of this QA run.
- No BrickLink Studio import or physical assembly was performed. Draft steps must not be described as validated assembly instructions or proof of buildability.
- Multiple-image TRELLIS reconstruction remains intentionally deferred.
