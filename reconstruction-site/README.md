# LEGO Builder — image reconstruction pilot

A private, single-photo workflow backed by fal-hosted original TRELLIS (`fal-ai/trellis`). Generates a neutral GLB, geometry-only OBJ and provenance manifest from the same checked mesh. It does not generate LEGO bricks, instructions or a physical-scale measurement.

## Run locally

Requires Node 24 (Node 22.13+ for the app) and npm. From this directory:

```sh
npm run install:ci
cp .env.example .env.local
```

Set `FAL_KEY` in `.env.local`; keep `RECONSTRUCTION_PROVIDER=fal`. Keys, uploads, database state and generated artifacts must not be committed. Local sign-in is a starter-provided test identity and is only appropriate for loopback development. Hosted sign-in uses Sites identity; every model operation checks the owner on the server.

Build once and initialize the local database:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_same_gunslinger.sql
npm run dev -- --hostname 127.0.0.1 --port 5187
```

Apply the initial migration only to a new database. Later migrations are append-only; do not reset saved jobs during upgrades. The app uses D1 binding `DB` and R2 binding `BUCKET`. Production settings are managed as Sites environment variables, with `FAL_KEY` marked secret.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests use explicit synthetic images/meshes, SQLite as a D1 test adapter and fake R2/provider responses. They verify geometry, reflection, invalid input, ownership, duplicate submissions, cancellation races and incomplete-publication cleanup. These fixtures are never a production success path. A real provider test is separately required to establish reconstruction quality and latency.

## Pilot boundaries

- Input, quota and retention-request settings: `lib/limits.ts`; parser limits: `core/src/glb.ts`.
- One active job per owner; rolling 24-hour user/site submission quotas. Daily caps include failed local submissions to stay conservative about spend.
- An idempotency key is bound to the normalized image hash. Uncertain submission reserves the active slot and never resubmits automatically. Check fal history before removing an uncertain job and manually creating another.
- Reopening the saved job link resumes provider polling and result collection. No scheduler runs collection while the browser is closed. Return promptly before provider assets expire.
- fal is asked not to retain JSON inputs/outputs, to expire output files after 24 hours, and to forbid anonymous access on supported v3 CDN files. Older CDN hosts may not support the ACL. URLs and credentials are not exposed to the browser; app copies are private. Do not equate these requested controls with a verified provider deletion guarantee.
- App photo/model bytes remain in R2 until removed. Removal persists a tombstone, requests provider cancellation where applicable, and deletes app blobs. fal cancellation may fail or still incur charges; no background purge/reconciliation guarantee is claimed. Minimal job metadata remains for idempotency and quota accounting.
- GLB ingestion is bounded to the supported static, embedded triangle subset. Unsupported models fail truthfully. The low-detail preset requests `mesh_simplify=0.98` and `texture_size=512`; textures are discarded in exported geometry.
- Rendering is not LEGO-converter eligibility. Meshes retain provider coordinates with transforms baked; units are unknown. The manifest records hashes, bounds, counts and unchecked converter eligibility.

Implementation decisions and product acceptance are owned by the parent repository's Architecture.md, Product.md and Roadmap.md.
