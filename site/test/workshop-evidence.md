# Unified workshop independent QA handoff

Date: 2026-09-13 (Asia/Singapore)

Tested branch/revision: `codex/unified-workshop`, base `4d67b462bf43cd368e4b3acf21d0a220bc7682da`, with the uncommitted combined implementation present in the shared checkout. QA made no product-source changes. The only QA-authored file is this evidence record.

## Release recommendation

**Conditional pass for publishing the controlled single-image pilot source.** The source-level navigation, privacy, ownership, artifact-integrity, converter-boundary, LDraw consistency, and recovery checks reviewed here have no open functional defect after the primary fixed the Admin navigation regression found during this review. The production build completes and the full site test suite passes.

Do not describe hosted image-to-LEGO completion as verified until an approved Site-specific user ID is added to `PILOT_USER_IDS` and one hosted run proves workshop upload -> TRELLIS -> saved OBJ -> configured converter -> saved LDR -> Model/Parts/Instructions on the canonical workshop origin. Physical buildability, BrickLink Studio compatibility, source resemblance, representative latency/cost, and multi-image conversion remain unverified. Multiple images are explicitly deferred by founder direction.

## Finding resolved during QA

### Medium — Admin browser-local import was lost when switching to the sample

- Reproduction in the initial combined tree: open `/?view=admin`, import an LDR, select **Sample workbench**, then select **Admin test bench**.
- Expected: Product F7 says the import survives navigation within the page.
- Actual: the new navigation used ordinary root anchors, causing a full document reload and discarding the browser-local imported model.
- Impact: a previously accepted Admin workflow regressed while merging the real `/build` route.
- Resolution checked: `WorkshopNavigation` now accepts an in-page sample/Admin navigation callback. `SampleWorkbench` keeps `AdminTestBench` mounted while hidden and updates the root URL with `history.replaceState`. Modified clicks retain native link behavior. `/build` remains a deliberate full-route transition.
- Evidence locations: `site/components/workshop-shell.tsx`, `site/components/sample-workbench.tsx`.

No other reproducible product-code defect was identified within the bounded source review and synthetic checks.

## Acceptance/evidence map

- Canonical routes: `/` retains the public sample; `/?view=admin` retains the browser-local importer; `/build?new=1` is the real one-photo entry; `/build`, `?job=...`, `?request=...`, and `?conversion=...` recover saved stages on the same origin. Production build route inventory includes all of these pages and APIs.
- Recovery: `/build` resolves the latest non-deleted job and latest ready job. Explicit job/request/conversion IDs are kept in same-origin URLs. The active-job guard and request idempotency avoid duplicate TRELLIS submission; converter retries reuse the saved OBJ.
- Privacy: every config/job/file/conversion route calls `authorized()`, which requires trusted Sites identity, exact membership in server-side `PILOT_USER_IDS`, and D1/R2 availability before record access. Queries bind the authenticated owner. State-changing routes also call `checkOrigin`. `/api/session` is the documented narrow exception: it reveals only the signed-in caller's Site-specific identity and touches neither private model storage nor provider/converter configuration. `/api/ldraw-part` is intentionally public and resolves only bounded official LDraw paths.
- Secret/destination control: fal and converter credentials stay in Worker bindings. The browser cannot provide an owner, R2 key, callback, or converter URL. The converter client accepts only a configured HTTPS URL without credentials/query/fragment and does not follow redirects.
- Integrity: normalized source, OBJ manifest hash, immutable settings hash, converter echo hashes, LDR hash, and revision hash remain linked. R2 publication uses a lease/CAS boundary; deletion tombstones parent/child rows before cleanup. Owner-isolation, publication/deletion races, request caps, stale publishers, and mismatched hashes are covered by passing tests.
- LDraw consistency: the server rejects packed/custom geometry, bounds the file at 5 MiB and 2,500 placements, and records placement/part/step inspection metadata. The browser rehashes and reimports the exact saved LDR, checks metadata equality, derives inventory from the same placements, preserves nonempty authored `STEP`/`ROTSTEP` groups, and does not invent missing steps. The bundled official subset avoids runtime upstream dependence for the verified converter dependency graph while the existing bounded official fallback remains available.
- Truthful claims: the UI labels the photo mesh approximate, scale unknown, LEGO compatibility/buildability unchecked, and supplied LDraw unverified. Model/Parts/Instructions remain locked until an actual LDR result exists. Missing authored steps produce a dialog and no instruction sequence.

## Commands and results

From `site/` on the final reviewed tree:

- `npm run typecheck` — passed.
- `npm test` — passed, 76/76 tests.
- `npm run build` — passed. The route manifest includes `/`, `/build`, config/session/jobs, all conversion routes, private artifact routes, and the public LDraw part resolver. Build emitted a non-failing large-chunk warning.
- `npm run lint` — failed with 9 errors and 5 warnings. Existing Admin files account for three React-hook errors and two warnings. Newly copied/integrated scope also contains a synchronous sign-in-path state update in `app/build/workspace.tsx`, a render-time transport ref initialization in `components/assembly-workspace.tsx`, four `no-explicit-any` errors in copied `core/src/fal.ts` and `core/src/glb.ts`, plus hook/image/unused-variable warnings. These did not prevent typecheck, tests, or production build, but lint is not clean and should not be reported as passing.
- `git diff --check` — passed.

The repository's Python integration command could not be rerun in this QA environment because the system `python3` has no `pytest` module and there is no local `.venv`. Existing independent evidence in `docs/qa-demo-integration.md` records the real loopback Python service run: 2,021 placements, 20 part types, 65 resolved dependencies, zero external part requests, with matching source/settings hashes. This review treats that as prior evidence, not as a fresh run.

## Untested limits

- No paid fal request was made in this review.
- No hosted D1/R2 owner flow, Sites sign-in return, or allowlisted caller was exercised by QA.
- No live HTTPS converter/tunnel availability or hosted timeout/recovery behavior was exercised.
- No browser WebGL frame, touch device, screen reader, or cross-browser viewport matrix was exercised; source-level keyboard labels, text fallbacks, status/alert regions, and reduced-motion CSS were inspected.
- No physical model, structural stability, source resemblance, Studio import, catalog purchasing validity, or complete authored instructions were certified.
- Legacy jobs from the separate image-to-3D Site are intentionally not migrated and remain available only on that legacy origin.

## Primary-agent browser evidence received after source review

The primary agent reports a passing local browser check at desktop 1280 px and mobile/default 516 px: `/build` returned to the intended path after sign-in, authenticated `/api/config` returned 200 with `configured: true` against the newly migrated local database, and the empty project state rendered. The tracked `step-test.ldr` opened in Admin as 2 pieces, 2 lots, and 2 authored steps; switching Admin -> Sample -> Admin retained that model after the callback fix. This corroborates the resolved regression, but it is attributed primary-agent evidence rather than an independently repeated browser session.

## Primary browser verification

- Checked the combined /build page at desktop 1280px and the default narrow 516px viewport. Original workshop sidebar styling is preserved.
- Local sign-in returned to /build?new=1; authenticated config reported reconstruction configured with fresh D1 tables.
- Imported the explicit step-test.ldr fixture: 2 pieces, 2 lots and 2 authored steps. Navigated Admin → Sample → Admin and retained the same import.
- No paid reconstruction was submitted during these local checks. Hosted service variables were confirmed present, and the existing converter health endpoint returned 200.
- Hosted account access and provider/converter use remain a separate post-publication check. Multiple-image support is deferred.
