# LEGO Builder all-signed-in access QA

## Scope and tested revision

- Branch: `codex/signed-in-workflow`
- Base HEAD: `12145fd7517b05c79e0aa9e616fbb365c59d4d24`
- Tested the combined uncommitted working tree on 2026-09-13.
- Scope: source and automated checks for the policy that every trusted Sign in with ChatGPT user can use their own private generation workflow while anonymous visitors retain the public sample/Admin tools.
- QA made no product, Site, test, Git, browser, hosting, or paid-provider changes.

## Recommendation

**Pass for deployment of the all-signed-in policy.** No open runtime defect was found. The former enrollment allowlist is removed from the shared authorization boundary, while trusted identity, storage fail-closed behavior, record ownership, same-Origin mutation checks, idempotency, and quotas remain enforced.

This recommendation covers the source revision and local automated behavior. Hosted verification should still confirm that Sites supplies and protects the trusted identity headers, an arbitrary newly signed-in account reaches `/build`, anonymous API access receives 401, and one user cannot retrieve another user's saved links. No browser, Sites tool, hosted identity, storage, or paid fal call was exercised by this QA run.

## Automated evidence

- `cd site && npm test`: **78/78 passed** in 1.90 seconds.
- `cd site && npm run typecheck`: **passed**.
- `git diff --check`: **passed**.
- The primary agent separately reported a passing production build after the final source change; QA did not rerun that build.

The four new policy tests exercise the real `authorized()` and identity helper with platform modules replaced at registration time:

1. unrelated arbitrary signed-in IDs reach the workflow with both absent and stale `PILOT_USER_IDS` values;
2. anonymous, ID-only, and email-only identities fail with 401 before a storage getter can be touched;
3. signed-in users receive 503 when either D1 or R2 is missing; and
4. matching Origin succeeds while missing, cross-origin, and `null` Origin values fail with 403.

## Route and data-boundary review

Every private config/job/file/conversion route calls `authorized()`:

- `/api/config`
- `/api/jobs` and `/api/jobs/:id`
- `/api/jobs/:id/files/:kind`
- `/api/jobs/:id/conversion`
- `/api/jobs/:id/conversion/:requestId/{handoff,artifact,run,result}`

Every state-changing route (`POST`/`DELETE`) also calls `checkOrigin(request)`. Read-only private routes rely on trusted identity and owner checks. The two intended public exceptions remain narrow: `/api/session` exposes only the current caller's own ID/display name and uses private/no-store responses, while `/api/ldraw-part` resolves bounded public official LDraw geometry and never user uploads.

The API never accepts an owner ID from the browser. Route handlers pass `user.userId` from the trusted Sites identity to `Jobs` and `Conversions`. Job reads, latest lookups, idempotency lookups, deletion, and database mutations bind that owner. Conversion parent/request/result/artifact operations bind owner together with source and request IDs. Existing tests that attempt job and conversion access as another owner pass with 404, including artifact/download paths.

## Preserved abuse controls

- Reconstruction limits remain 5 submissions per owner per rolling day and 20 site-wide, enforced inside the atomic insert.
- The partial unique index still permits only one active reconstruction job per owner.
- Existing concurrency tests pass for one-active-job enforcement and idempotent replay.
- Conversion handoffs remain capped at ten non-deleted requests per owner/source; its concurrent cap test passes.
- Same-Origin checks remain on image submission, refresh, delete, conversion creation, automatic converter run, and manual result receipt.

## Documentation finding resolved

QA found two retained historical evidence documents that still contained the former `PILOT_USER_IDS` requirement. Before this recommendation, the primary added explicit notices at the top of `docs/workshop-publication.md` and `site/test/workshop-evidence.md` stating that those passages describe the old deployment and are superseded by the all-signed-in policy, with a link to the current access evidence. Their old observations remain preserved as historical evidence rather than current operator instructions.

## Remaining limits

- The local identity tests replace only platform bindings. They cannot prove that the hosted dispatch strips spoofed `oai-authenticated-user-*` headers; that is a Sites hosting property requiring a hosted check.
- No full browser sign-in/return, saved-link recovery, cross-account session, touch/accessibility, or production D1/R2 test was run in this narrow review.
- Opening paid generation to every signed-in user increases legitimate usage exposure by design. The unchanged per-owner and global quotas bound it; billing behavior was not tested.
