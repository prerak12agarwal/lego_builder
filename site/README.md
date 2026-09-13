# LEGO Builder workshop

The canonical workshop combines the original public sample and local LDraw test bench with private single-photo reconstruction and LEGO conversion at `/build`.

- `/`: hand-authored Little house, matching sample parts/CSV and eight sample steps.
- `/?view=admin`: browser-local LDraw/MPD inspection, with bounded official part retrieval.
- `/build?new=1`: new photo upload; an existing active job is recovered before another submission.
- `/build`: recover the latest saved job and the previous ready result. Saved job and conversion links retain their immutable IDs.

The photo pipeline uses the existing fal-hosted TRELLIS adapter, private GLB/OBJ/manifest storage, and authenticated Python converter. It returns actual LDraw for inspection; missing authored steps are never invented and buildability is unverified. The old `reconstruction-site/` deployment and its data remain separate and unchanged. No history is copied between Sites; their authenticated user IDs differ.

## Runtime and private access

The public shell and Admin importer need no sign-in. Every model API checks trusted Sites identity, an explicit server-side `PILOT_USER_IDS` allowlist, and record ownership. Missing allowlist fails closed. `GET /api/session` reveals only the signed-in caller's Site-specific ID for configuration; it does not grant access. Never use a workspace account ID or the old Site's identity as the new Site ID.

Enable `DB` and `BUCKET` in the workshop's existing hosting manifest. Apply the migrations recorded in `drizzle/meta/_journal.json`; they create private reconstruction jobs and conversion requests. Do not reset an existing database or copy legacy records.

Manage server-only `FAL_KEY`, `RECONSTRUCTION_PROVIDER=fal`, `CONVERTER_URL`, `CONVERTER_TOKEN` and `PILOT_USER_IDS` through Sites. Secrets are never in the repository or client bundle. An unavailable converter preserves the saved OBJ and manual handoff. The existing converter's temporary tunnel depends on its running host.

## Local development and checks

Use Node 24. Configure the Sites portable execution profile, then use `npm run install:ci`, `npm run dev`, `npm run typecheck`, `npm test` and `npm run build`. Local `.env.local` may allow `local_seedy` for the starter's loopback-only test sign-in; this value is never a hosted fallback.

For a fresh local database, build and apply the two SQL files with the installed Wrangler CLI using `dist/server/wrangler.json` and `.wrangler/state`. Follow the existing journal and do not replay migrations against existing state.

Tests cover the sample, importer, ownership, quotas, idempotency, immutable source/result links, cleanup races and pilot access. Synthetic fixtures are not a production success path. Live reconstruction and physical buildability require separate evidence.

## Source and publication

GitHub is the collaboration source: use a feature branch and partner-reviewed PR into main. Publish a clean Site-only snapshot to the existing project ID in `.openai/hosting.json`; keep private environment and runtime state out of the source commit/archive. GitHub merges do not deploy Sites.

Product acceptance and contracts live in the parent Product.md, Roadmap.md and Architecture.md. Earlier pilot evidence remains under `reconstruction-site/test/`; workshop integration evidence is under `test/workshop-evidence.md`.
