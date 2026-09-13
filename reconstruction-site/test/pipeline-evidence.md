# Deferred-converter pipeline QA evidence

## Tested scope and revision

- Branch: `codex/pipeline-integration`.
- Git base: `8db5c172adf29c3f33c84f4cfa86c52e78dcaa14`; tested with the uncommitted combined pipeline working tree on 2026-09-13 (Asia/Singapore).
- Scope: retained TRELLIS mesh to owner-scoped converter handoff, immutable supplied-LDraw receipt, stored artifact recovery/removal, and model/parts/root-step inspection. Prerak's converter, a machine dispatcher, deployment, Studio import, and physical buildability were outside this run.
- The existing real bottle job `94019fe7-7dc6-4e14-bec5-bc6f478eabeb` was reopened only to verify its stored mesh and automatic awaiting handoff. It did not receive an LDraw fixture, was not deleted, and no new paid generation was submitted.

## Independent automated evidence

From `reconstruction-site`:

```text
npm test
44 tests passed, 0 failed

npm run typecheck
passed
```

The suite uses in-memory SQLite and a fake R2 adapter for conversion persistence; it does not touch the local preview database or private stored blobs. It covers request/hash idempotency, wrong-owner and tombstone rejection, an atomic ten-attempt per-source cap, immutable and replayed results, publication lease recovery, internal-state masking, failed R2/D1 publication, source deletion during publication, failed cleanup retry, and a blocked-put deletion race. Contract cases cover request/settings bounds, malformed and oversized payloads, JSON envelope overhead near 5 MiB, unsafe control characters, flat-root restrictions, finite nonsingular transforms, placement limits, and producer/hash bounds.

`qa-pipeline-steps.test.ts` adds independent parity checks between saved inspection metadata and the browser importer. Leading, middle, and trailing empty boundaries are omitted consistently; `STEP` and `ROTSTEP` nonempty groups retain exactly-once placement membership; final cumulative placement and inventory totals match; and an LDR without boundaries remains inspectable without fabricated instructions.

The original `site` LDraw/assembly tests also passed 15/15. Its separate typecheck could not run because that workspace does not currently have `tsc` installed; the copied reconstruction-site code is covered by the passing reconstruction-site typecheck.

`npm run lint` still reports six errors and two warnings in pre-existing `app/workspace.tsx`, `core/src/fal.ts`, and `core/src/glb.ts` rules. The newly added pipeline, assembly, and LDraw viewer files are lint-clean. Lint is not listed among this pilot's required README checks, but the baseline debt remains visible.

## Browser evidence

The primary agent performed browser checks while QA independently reviewed source and tests:

- The real saved bottle restored its existing mesh and entered `awaiting_converter` with saved handoff `6b7c1c82...`; no provider request was created.
- At a 390 by 844 viewport, document and panel widths remained within the viewport (`390` and `358` CSS pixels respectively), with no horizontal overflow.
- A temporary, explicitly labeled inspection-only page exercised the actual `AssemblyWorkspace` and official LDraw geometry without attaching data to the real job. The stepped fixture rendered two `3001` parts, one red and one yellow. Parts showed matching quantities; instruction navigation reached step 2 of 2 with 2 of 2 placed and Next disabled.
- A no-step fixture produced the explicit missing-steps dialog and unavailable-instructions panel while leaving model/parts inspection available.
- The temporary page and both fixture files were removed before final checks.

This browser evidence validates the receiving UI with supplied fixtures only. It is not evidence that TRELLIS output passed through Prerak's converter or that the displayed assembly is structurally valid or buildable.

## Findings and disposition

QA reported these release-relevant defects before fixes:

1. Failed downstream deletion could erase the only random R2 key and orphan a private LDR. A second write/delete race could recreate the object after cleanup. Deleted rows now retain only inaccessible cleanup keys, and regressions cover failed deletion plus the blocked-put race.
2. The JSON request envelope rejected valid near-limit LDR text because escaping overhead exceeded its cap. The envelope is now bounded at twice the decoded 5 MiB limit plus metadata overhead, while decoded LDR remains capped at 5 MiB and unsafe controls are rejected.
3. The internal `publishing` lease state leaked outside the documented public state union. Public reads now report it as `awaiting_converter`.
4. Conversion results were unbounded across fresh request keys. Creation now atomically limits a source to ten nondeleted handoffs, returns actionable `429` responses for fresh requests at the cap, and still replays accepted idempotency keys.
5. Pipeline stage text stayed at “ready to receive” after a supplied result. The parent workspace now receives result status and labels the manual LDraw receipt without claiming that Python ran.
6. Run instructions omitted the additive conversion migration. The reconstruction README now distinguishes new-database initialization from applying only `0002_magical_slyde.sql` to an existing saved database.

All six were rechecked in source and by the applicable automated/browser evidence above.

## Remaining limits and recommendation

The local surrounding pipeline is suitable for review and for connecting a future adapter to the documented handoff/result contract. No open P1 or P2 defect remains from this QA pass. Final recommendation: **pass for the deferred-converter integration slice**. The primary agent completed the production build and combined-diff review after this QA run; the build passed. Trailing whitespace was then normalized in the copied static color library and the same file copied into the build output; no executable source changed. The final quota-error UI adjustment passed typecheck and preserves the accepted handoff on definite rejection.

Hosted migration, owner identity, D1/R2 behavior, cross-origin rejection, official-library availability at representative scale, and result rendering in the deployed Site remain unverified. Actual prepared TRELLIS OBJ to Prerak converter to LDR, validation evidence, Studio compatibility, resemblance, inventory legality, stability, and a physical build remain required before any end-to-end conversion or buildability claim.
