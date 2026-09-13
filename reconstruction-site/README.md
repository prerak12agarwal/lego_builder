# LEGO Builder — integration workspace

A private, single-photo workflow backed by fal-hosted original TRELLIS (`fal-ai/trellis`). It generates a neutral GLB, geometry-only OBJ and provenance manifest, then saves a converter handoff with immutable source/settings hashes. The same workspace displays a supplied LDraw model, its parts and its authored steps.

Python conversion is not connected in this slice. The site reports **Awaiting converter** after reconstruction; it does not substitute a brick sample. Expand **Converter handoff** to download the OBJ and request JSON, save a new attempt with size/up-axis settings, or supply an LDR result through the owner-authenticated receiver. Results are immutable inspection artifacts, not validated LEGO models. Missing authored steps produce a warning; buildability and correspondence to the source mesh remain unverified. Prerak's implementation and a machine dispatcher remain separate work. The [handoff contract](docs/converter-handoff.md) defines the receiving interface.

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
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_magical_slyde.sql
npm run dev -- --hostname 127.0.0.1 --port 5187
```

Apply those migrations only once. **For an existing reconstruction database that already has `0000`, run only the `0002_magical_slyde.sql` command** to add conversion requests; do not replay `0000` or reset stored jobs. Later migrations are append-only. Sites applies packaged migrations during hosting. The app retains D1 binding `DB` and R2 binding `BUCKET` on the existing reconstruction Site. Production settings are managed as Sites environment variables, with `FAL_KEY` marked secret.

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
- A ready mesh receives a default 2,000-piece handoff with Y-up selected. Legacy stud-size handoffs remain readable and manual. These are saved request settings, not evidence of supported build sizes or correct orientation. Explicit new attempts retain previous results and never resubmit TRELLIS.
- LDR return is limited to a flat model of official part references. The receiver checks syntax, hashes, transforms and authored-step membership; the browser resolves real LDraw geometry. Nested submodels, packed MPD, textures and custom colors are outside this result contract. The original sample site's local importer remains separate tooling.
- Saved handoff links include their request ID so reload retains the exact attempt. Removing a source job revokes all derived handoffs/results; inaccessible cleanup keys remain on tombstones so failed deletion can be retried. Cleanup still requires a request/operator retry; no autonomous purge runs.

Implementation decisions and product acceptance are owned by the parent repository's Architecture.md, Product.md and Roadmap.md.

## Connected Python converter

The current source adds an owner-authenticated Convert to LEGO action. Configure server-only `CONVERTER_URL` and `CONVERTER_TOKEN` to call `lego_builder.service` over HTTPS. Without configuration, the UI keeps the mesh and manual handoff available and does not claim conversion success. See [submission and deployment setup](../docs/SUBMISSION.md). The service is separately hosted; publishing the Sites app does not launch Python.

The generated-part geometry subset is bundled for fast inspection, preserving original LDraw author/license headers; broader imported parts use bounded, cached official-library requests. Regenerate the subset from the repository root with `python scripts/build_site_parts.py`.
