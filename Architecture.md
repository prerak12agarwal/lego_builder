# Architecture

Owner: Architect. Purpose: system design, contracts and decision rationale. Product intent lives in [Product](Product.md); phase gates and open direction live in [Roadmap](Roadmap.md).

## Status and engineering principles

Hosting on ChatGPT Sites is a confirmed founder preference. The consumer UI preview and browser-local LDraw inspection are implemented in [site/](site/) using the Sites-compatible Vinext starter, React and TypeScript. The reconstruction pilot has application and geometry-processing source in [reconstruction-site](reconstruction-site/package.json), one successful [local live bottle conversion](reconstruction-site/test/live-evidence.md), and a successful owner-private [Sites publication](https://lego-builder-image-to-3d.dragonjjk.chatgpt.site). Its source now also includes a durable manual converter handoff and unified mesh/LDraw workspace; local independent QA passes for this deferred-converter slice; see the [pipeline evidence](reconstruction-site/test/pipeline-evidence.md). Publication of the integrated source is pending. Hosted runtime validation remains pending. Prerak's mesh-to-LEGO converter source is under separate review in [PR #5](https://github.com/prerak12agarwal/lego_builder/pull/5), not integrated into the applications. Dependency manifests and lockfiles own exact versions. Keep local test evidence distinct from hosted release claims and design intent.

The full product's core artifact is a structured assembly of real parts, each with a position, orientation and color. A surface mesh is the output of the separately confirmed image-reconstruction workstream and an intermediate input to the LEGO pipeline. Derive all three LEGO user outputs from the same validated model revision. Keep probabilistic reconstruction separate from deterministic catalog, geometry and inventory validation.

## Independent UI implementation track

The founders requested the overall interface on ChatGPT Sites while converter validation remains a separate prerequisite for real generation. This track implements the consumer journey using explicitly labeled hand-authored sample data. It does not establish mesh conversion, image reconstruction, physical validation or the production service architecture.

The UI uses a canvas-based projection of rectangular brick geometry for its sample viewer; Three.js is used separately for imported LDraw geometry. A single immutable sample revision supplies placements, inventory and instruction membership. All displayed assembly subsets and exported quantities derive from that revision. Uploaded photos remain temporary browser-local previews and are never associated with the sample as generated output. Generation remains visibly unavailable until a real adapter and validation pipeline exist. Accounts, persistent storage, external providers and pricing remain deferred. The fixture checks cover occupied-grid collisions, full footprint support, one final vertical-connection component, matching inventory and exactly-once step coverage. Initial instruction layers may be loose before subsequent layers join them. These checks do not establish catalog compatibility, insertion feasibility or physical stability.

### Browser-local LDraw inspection boundary

Product F7 adds a separate `ImportedRevision` graph in `site/lib/ldraw/`, without converting arbitrary LDraw coordinates into the solver’s validated stud/plate grid. Exact LDU affine transforms, effective colors, stable placement IDs and root-authored step membership drive all imported views and inventory. Nested model transforms and inherited colors are composed; nested callouts and ROTSTEP camera orientation remain unsupported and disclosed.

Before rendering, parse and bound the complete dependency graph, reject cycles, invalid references, singular/nonfinite transforms and missing geometry, then pack resolved files for the pinned Three.js LDrawLoader. The synthetic root references flattened leaf parts; one root child per placement is required and checked. Renderer callbacks alone are not evidence of completeness. Internal primitives/subparts are geometry dependencies, never extra inventory pieces. Explicit root matrices preserve affine placement; shared geometry is released when its imported revision is replaced.

The browser reads the local file and keeps it in session memory. `/api/ldraw-part` accepts only constrained `.dat` names and requests fixed paths on `https://library.ldraw.org/library/official/`; it accepts no arbitrary URL or user file body. Responses are size-bounded and cacheable; unavailable libraries fail imports. Official color configuration is bundled with source attribution. Imported custom part blocks stay browser-local. No provider keys, persistence or paid service is added. Existing owner-private Sites access is preserved; the navigation label does not confer an application role.

Executable limits in `lib/ldraw/model.ts` bound input size, placements, dependency depth/count/bytes, expanded geometry and import duration. STEP/ROTSTEP boundaries are not generated when absent: the UI displays the required missing-step popup and leaves the full model available. Files with unsupported texture/data/model-level primitive semantics fail rather than displaying incomplete success. Inspection does not validate collisions, connections, catalog color legality, insertion feasibility or physical stability, and does not advance solver release gates.

## Current MVP architecture decision

The LEGO conversion milestone remains a local, deterministic `OBJ`/`STL`-to-brick converter. The founders have also confirmed a separate image-upload-to-ordinary-3D-model workstream, with both quick delivery and low generation latency as priorities. Reconstruction can proceed independently; joining the two pipelines still requires the converter's validation gates. The converter's source mesh is input, not its final artifact; the validated placement list is the source of truth for the exported LEGO model, inventory, preview and placement order.

Use LDraw as the initial geometry and interchange foundation. Build a versioned local catalog containing only a curated set of common rectangular bricks and plates, with each entry's geometry, footprint, height, legal orientations, connector locations, supported colors and provenance. Do not search the complete LEGO catalog in the first solver: that expands the search space without proving the core method.

BrickLink and Rebrickable are enrichment sources for explicit identifier mappings, color validity, availability and later pricing. They are not the canonical geometry source. BrickLink Studio is the external compatibility baseline: import generated LDraw files there for visual inspection, parts-list comparison and manual instruction experiments. The MVP does not depend on extracting Studio's internal library or automating its desktop interface.

### MVP pipeline

1. **Ingest:** load one triangulated `OBJ` or `STL`; validate that it is non-empty, finite and suitable for voxelization.
2. **Normalize:** repair only safe mesh defects, choose an upright axis, center the mesh and scale its longest requested dimension to studs. Record every transform.
3. **Discretize:** voxelize on an anisotropic grid of one stud horizontally by one plate vertically. Evaluate a small set of target sizes rather than assuming one scale preserves the object's identity.
4. **Create target:** retain occupied cells and optional surface-color samples. For the first implementation, allow solid output; hollowing is an optimization only after connectivity is reliable.
5. **Fit parts:** begin with 1-by-1 coverage, then merge cells into allowed larger bricks and plates. Prefer fewer common parts, staggered seams and overlap between adjacent layers. Use greedy merging as a baseline and beam search or randomized restarts only when measurements justify them.
6. **Repair:** build a base-up connection graph, reject collisions and floating components, rotate or split weak seams, and add concealed supports where allowed.
7. **Sequence:** order placements bottom-up and reject steps that require a later part to pass through existing geometry. Advanced subassemblies are outside the first implementation.
8. **Validate and export:** emit the canonical placement model, LDraw `.ldr` or `.mpd`, bill of materials, preview, placement sequence and machine-readable validation report. Import release candidates into BrickLink Studio and physically build representative outputs.

### Initial solver objective and hard constraints

Optimize a weighted score over shape coverage, silhouette difference from reference views, part count, unique part-color lots, weak seams and unsupported detail. Keep the weights versioned with each result so comparisons are meaningful.

The following are hard failures: unknown catalog part or color, disallowed orientation, placement collision, disconnected or floating component, unsupported placement under the declared MVP rules, bill-of-material mismatch, malformed LDraw export or blocked bottom-up insertion. A candidate that fails a hard constraint may be retained for diagnostics but cannot be labelled successful.

### MVP outputs and reproducibility

Each run records the input checksum, normalized transform, grid dimensions, target size, catalog version, allowed palette, algorithm version, objective weights and random seed. The canonical placement file uses integer stud/plate coordinates and stable part identifiers. The bill of materials and LDraw export are derived from this file rather than calculated independently.

The MVP command-line and on-disk schemas belong in executable code once scaffolded. Avoid freezing a CLI syntax in this planning document before the implementation exists.

## Provisional stack

The reconstruction pilot uses the source-linked choices below. Broader LEGO pipeline components remain proposals. Verify current primary documentation and licensing when adopting additional components.

| Layer | Proposal | Reason / reconsider when |
| --- | --- | --- |
| Web app | TypeScript, React, Sites-compatible Vinext starter | Present in the [application manifest](reconstruction-site/package.json); validate hosted runtime separately. |
| 3D UI | Direct Three.js with OrbitControls and GLTFLoader | Implemented in the [mesh viewer](reconstruction-site/app/model-viewer.tsx); React Three Fiber is not required by this pilot. |
| Styling | CSS design tokens; select component approach after UI references | Keep visual decisions centralized and avoid premature brand commitments. |
| Geometry worker | External asynchronous generation service; Python if custom geometry work is needed | Keep GPU/native-library and long-running computation outside the Sites request handler. Provider and hosting remain open. |
| Persistence | Sites D1 for metadata; Sites R2 for private image/model artifacts | Use the platform's logical bindings; separate transactional state from large files. |
| Background work | Provider-owned inference; D1 job metadata and request-driven collection for the pilot | Inference continues after browser disconnect; application artifact collection requires a later authenticated request. Autonomous collection remains a release gap. |
| Quality | TypeScript test runner, Python tests, browser end-to-end tests | Verify contracts, geometry and complete user journeys; select tools with the actual scaffold. |
| Delivery | GitHub pull requests and CI; ChatGPT Sites for web hosting | Preserve the partner GitHub workflow; resolve Sites source/deployment integration during setup. |

The selected MVP provider is fal-hosted original TRELLIS (`fal-ai/trellis`). The server-side key has completed one real queued bottle generation and local result ingestion; the pricing API separately accepted it. The [job service](reconstruction-site/lib/jobs.ts) enables generation only for explicit `RECONSTRUCTION_PROVIDER=fal` configuration and a nonempty key; it has no automatic paid fallback. The [fal adapter](reconstruction-site/core/src/fal.ts) owns queued REST calls and fixed settings. Custom GPU hosting and model training are outside this pilot. LDraw remains the proposed converter's confirmed geometry/interchange foundation. The engineering agents' language models are separate from this runtime provider decision.

### Sites deployment boundary

Planning basis: installed Sites building/hosting guidance inspected on 2026-09-13. It describes a Cloudflare Workers-compatible server build, logical D1/R2 bindings and HTTP-based access to external services; raw TCP connections are unsupported. Re-read the applicable Sites guidance at implementation because platform capabilities may change.

Proposed split: Sites serves the UI and lightweight authenticated API; an external asynchronous service performs reconstruction and expensive brick fitting. Do not assume Sites supplies GPU execution, an arbitrary Python server, or unlimited background processing. Prove an authenticated submit/status/result round trip before enabling real reconstruction. If the founders require every component to run solely inside Sites, treat that as an additional constraint requiring a feasibility decision.

The [Sites manifest](reconstruction-site/.openai/hosting.json) and migration files are the deployment source of truth; secrets use managed runtime values. GitHub remains the partners' canonical collaboration repository. The private pilot uses a separate Sites source checkout without replacing GitHub origin. Sites version 1 published successfully from source commit `079f2e7964e7b60c8d956a4ef188aeb36b1e7070` with environment revision 1. This proves publication, not hosted inference or identity/storage behavior. Partner review remains required before merging the feature branch into `main`.

The independent UI source and its own Sites manifest remain under [site/](site/). Its publication uses a separate source snapshot rooted at that directory, with a per-command credential; it does not replace GitHub origin or publish the repository’s internal reference assets. The integration reuses the existing reconstruction Site and its private database/storage, with its unified workspace source under `reconstruction-site`; it does not migrate the separate sample UI Site's identities or artifacts. Source integration does not itself update either hosted application.

## Image reconstruction workstream — pilot contract

Confirmed output and implementation direction: build a workable image-to-ordinary-mesh pilot, with fast delivery and generation as priorities. The implemented slice accepts one image and uses one configured provider and preset; a real bottle upload-to-saved-mesh flow has passed locally. Multiview fusion, texture refinement, provider switching UI and automatic LEGO generation remain deferred. Product owns upload and preview acceptance criteria; Roadmap owns scope and release gates. Hosted release and broader fidelity claims require additional evidence.

### Minimal flow and durable ownership

1. **Authorize and upload:** authenticate before accepting private files or starting billable work. Prefer Sites' dispatch-owned Sign in with ChatGPT and server-side identity helpers over a new account system; API routes reject missing identity. Prove the trusted server identity boundary; never accept a browser-supplied owner ID or trust equivalent headers on a directly exposed origin. Sign-in identifies a user; the hosting access policy or an explicit allowlist separately restricts a private pilot. The server authorizes project access, validates a bounded image upload, strips unnecessary metadata and stores the normalized provider input privately in R2. Record its checksum and transformation provenance. Send the bounded input server-to-server as a base64 data URI supported by the [TRELLIS API](https://fal.ai/models/fal-ai/trellis/api), avoiding an image URL blocked by private Sites sign-in.
2. **Submit:** resolve provider/model/settings on the server, enforce quotas and reserve a durable job in D1 before the outbound request. Use fal's queued REST API for `fal-ai/trellis`, authenticated with the server-only `FAL_KEY`. Persist the returned request ID for status and result retrieval. Return the application job ID promptly; do not hold the browser request open for inference.
3. **Observe and recover:** the provider owns asynchronous inference. The [workspace](reconstruction-site/app/workspace.tsx) polls through authorized reconciliation requests and can reopen a persisted job or pending submission key. Inference can continue while the browser is closed, but the pilot does not collect results autonomously. Users must return promptly, while provider assets remain available. An expired/unavailable result becomes a failed job with an explanatory message; the input remains, and collection never automatically submits replacement inference.
4. **Collect and validate:** on an authorized reconciliation request, retrieve completed files server-side into private R2 storage before provider URLs expire. Bound downloaded bytes, parsing/normalization work and request duration; checkpoint recoverable collection in D1 and prevent concurrent collectors with an expiring lease or equivalent atomic claim. Retry collection without submitting inference again. Mark success only after required files and reports are stored and the artifact reference is published transactionally. Reject or defer artifacts exceeding tested Worker limits; a long-lived background task is not a pilot dependency.
5. **Inspect and export:** serve the stored GLB through an owner-authorized application route or verified expiring read path to a client-side viewer with orbit, zoom and reset. Apply the same ownership checks to source images, status, manifests and exports. Expose an explicit converter-handoff status and a geometry export. The reconstructed mesh has no catalog parts, brick count, inventory or instructions.

This request-driven collection is an explicit pilot limitation relative to the earlier autonomous-collection proposal. Installed Sites 0.1.70 guidance documents private-Site sign-in and D1/R2, but no verified private webhook exemption, scheduler, queue or alarm deployment path. Workers compatibility alone does not establish one. Confirm fal's applicable result and asset retention before promising a recovery window; the earlier Meshy candidate's retention policy does not apply to TRELLIS. Autonomous ingestion remains a release gap until an authenticated completion mechanism is proven.

The pilot's persistent contract is the [D1 job schema](reconstruction-site/db/schema.ts), created by the [initial migration](reconstruction-site/drizzle/0000_same_gunslinger.sql): owner, submission key, normalized-input checksum, provider/task IDs, state, timestamps, collection lease and result manifest. Private R2 objects use the job ID plus artifact kind. The manifest adds source/provider-GLB/export checksums, fixed generation settings, preprocessing and validator versions, baked-transform metadata and geometry statistics. There is no project table, immutable reconstruction-request settings snapshot or completed-result content cache yet; the new conversion requests separately freeze downstream settings. Freeze reconstruction settings while unresolved requests exist, or add a versioned request snapshot before supporting configuration changes. The planned richer `ReconstructionRequest`/`ReconstructionArtifact` entities below remain separate from canonical LEGO `ModelRevision`; the pilot always reports converter eligibility as `unchecked`.

Executable limits live in [application limits](reconstruction-site/lib/limits.ts), [PNG validation](reconstruction-site/lib/png.ts) and [GLB processing](reconstruction-site/core/src/glb.ts). The browser accepts JPG/PNG up to 10 MiB and 40 megapixels, then produces PNG at most 1,024 pixels per edge. The server independently caps this upload at 6 MiB and validates PNG structure, checksums, bounded decompression and scanlines. GLB ingestion caps files at 16 MiB, JSON metadata at 1 MiB, vertices at 25,000 and triangles at 50,000. These conservative caps follow local memory calibration; they are not a measured hosted-runtime capacity guarantee.

### Retry, cancellation and private-file rules

The schema enforces one active job per owner and unique owner/submission keys. The [job service](reconstruction-site/lib/jobs.ts) binds a key to the normalized-image checksum and rejects different bytes under the same key. A single insert serializes reservation and rolling 24-hour quotas: five job attempts per owner and twenty site-wide, including failed/deleted rows. At the listed $0.02 inference price, twenty accepted submissions represent at most $0.40 of listed inference charges through this path, excluding unrelated account activity and hosting/storage. Collection has one site-wide lease for 90 seconds to limit simultaneous parsing and memory use. Explicit regeneration creates a new job; no content cache or automatic inference retry is present.

Ambiguous submissions become `unknown` and keep their active reservation. The user must check fal request history before removing that job and explicitly retrying; a timeout is not proof that inference was never started. Reads and collection can retry without another inference submission. State/lease checks reject stale publication. Removal writes a `deleted` tombstone first, hides artifacts, attempts remote cancellation and deletes known R2 objects; late completions preserve the tombstone and attempt cleanup again. Cancellation is best effort and does not promise a refund. There is no autonomous purge worker: failed cleanup or a terminated process can leave inaccessible R2 bytes requiring an explicit retry or operator cleanup. Keep that gap separate from immediate access revocation.

The [server boundary](reconstruction-site/lib/server.ts) requires Sites identity; every job/source/export lookup is owner-scoped. Site access policy must separately enforce the intended private workspace. Local development identity simulation is not hosted authorization evidence. Download routes send private, no-store responses. Provider downloads allow HTTPS `fal.media` hosts only, forbid redirects and enforce byte/time limits; the protected CDN path requests a short-lived server-side storage token. Parsing rejects external resources and unsupported geometry features rather than fetching them.

The actual local Worker transport rejected fetch `redirect: "error"` synchronously before a network call. Outbound provider/storage requests therefore use `redirect: "manual"` and fail closed on redirect responses; never follow an unvalidated destination. This runtime distinction is covered by the [redirect regression](reconstruction-site/test/jobs-regression.test.ts) and [live smoke-test evidence](reconstruction-site/test/live-evidence.md).

The job service requests fal lifecycle expiry of 86,400 seconds with default ACL `forbid`, and sends `X-Fal-Store-IO: 0`. These are requested provider controls, not independent proof of CDN privacy, universal deletion or a guaranteed availability window; verify actual live asset access and applicable provider policy. Application source and normalized result objects remain in R2 until removal; provider originals are hashed during ingestion rather than retained in R2. Tombstones remain in D1 for race handling and quota accounting. A scheduled purge/retention mechanism is not implemented.

### Geometry contract and LEGO handoff

The [GLB processor](reconstruction-site/core/src/glb.ts) derives a self-contained geometry-only GLB and triangulated OBJ from the same checked mesh, discarding provider appearance. The [viewer](reconstruction-site/app/model-viewer.tsx) applies a neutral material. The manifest records checksums, counts, bounds, validator identity, `transformsBaked`, provider-native axes and unknown physical scale. Normalization here means baking supported scene transforms and correcting winding under reflections; it does not infer upright orientation or physical dimensions. Viewer-only centering/scaling leaves exports unchanged. Color transfer and STL export are deferred.

Implemented checks cover GLB structure, embedded resources, finite nonempty triangle geometry, accessors/index bounds, scene transforms and resource limits. Animations, skins, morphs, compressed geometry and external references are rejected; embedded material metadata may be accepted and discarded. Degenerate-face, component, manifold/closed-surface and voxelization-suitability checks remain future converter gates. The processor therefore reports `converterEligibility: unchecked`; a displayed export is prepared input with compatibility unverified, not a watertight or buildable-model guarantee.

Normalize the exported frame explicitly and bake scene transforms consistently. A file's declared coordinate units do not establish an object's real dimensions from a photo. Upright orientation is inferred until confirmed; physical scale remains unknown until a later converter request supplies target dimensions in studs or an explicit measured scale. Camera framing and decorative staging must not modify stored geometry. LEGO placements, inventory and instructions continue to obey the canonical revision invariants below.

### Verification, performance and rollout

The [bottle smoke test](reconstruction-site/test/live-evidence.md) passed actual browser upload → fal queue → local D1/R2 collection → Three.js preview and authenticated download. It produced 1,656 vertices and 2,220 triangles within the implemented caps; stored-ready arrived 64.966 seconds after submission. This is one observation, excluding input preparation and cold developer compilation, not a service target or representative latency distribution. Downloaded GLB/OBJ hashes matched the manifest, and parsing the GLB reproduced the OBJ exactly. Local reload recovered the same ready job, source and downloads without another generation; viewer controls were exercised.

Retain adversarial coverage for duplicate/concurrent and ambiguous submits, provider failure/expiry, unauthorized source/artifact access, lease recovery, deletion during collection, corrupt output and unchecked converter eligibility. Hosted identity/storage and representative maximum-size runtime behavior remain unverified. Fixtures do not substitute for live reconstruction evidence.

Validate the selected provider with a small image benchmark. Measure upload/preprocessing, provider queue/inference, collection/validation, time to interactive preview, failure rate and total cost per usable result including retries. A neutral geometry handoff and one default preset reduce initial application scope; they do not imply that TRELLIS skips its own texture processing or guarantee latency. Set numeric latency, artifact-size and cost budgets from evidence, not marketing claims. A texture pass or alternate provider is justified only by a measured fidelity or latency gap.

Selected provider: fal-hosted original TRELLIS (`fal-ai/trellis`). The adapter requests `mesh_simplify: 0.98` and `texture_size: 512`; this does not guarantee a particular output triangle count. Its [model page](https://fal.ai/models/fal-ai/trellis) lists $0.02 per generation with no subscription required. The bottle result establishes compatibility for that observed output only. Billing totals, provider ACL/deletion guarantees, broader object fidelity and hosted latency remain unvalidated.

The [core tests](reconstruction-site/core/test/core.test.ts), [geometry regressions](reconstruction-site/test/core-regression.test.ts) and [job regressions](reconstruction-site/test/jobs-regression.test.ts) total 25 passing tests, covering geometry, mocked provider transport, idempotency, owner isolation, collection leases, redirect rejection and deletion races. Typecheck and build also passed through the [manifest scripts](reconstruction-site/package.json). The synthetic job tests do not establish hosted D1/R2 race behavior or provider CDN guarantees. Local QA memory measurements guide caps but do not replace representative Worker tests.

The pilot is published privately with the implemented quotas and server-only key. The initial D1 schema is supplied as a migration; apply later schema changes through new migrations and preserve existing job/tombstone rows. Hosted access/storage checks, durable failed-cleanup recovery and representative resource-limit behavior remain release gaps. Local test records and private generated bytes are not migrated to the hosted database. The mesh-to-brick converter remains separate and requires geometry, catalog, instruction and physical-build evidence before any buildability claim.

## Processing flow

### Implemented manual handoff and inspection boundary

The founders have requested a connected single-image → TRELLIS mesh → Prerak's Python converter → `.ldr` → model and authored-step workspace. Their latest direction is to implement the surrounding pipeline now while leaving Prerak's changing converter code untouched. Reuse the existing reconstruction Sites application, identity boundary, D1 database and R2 bucket; bring the reusable LDraw workspace into that application. No new Python host, paid service or automatic conversion is selected. The current delivery provides a durable converter handoff and owner-supplied result inspection while awaiting that future adapter.

The [reconstruction jobs](reconstruction-site/lib/jobs.ts) save checked geometry-only OBJ and its checksum manifest. The new [conversion service](reconstruction-site/lib/conversions.ts) persists handoffs and owner-supplied LDR results, while the [pipeline workspace](reconstruction-site/components/pipeline-workspace.tsx) connects the saved mesh, handoff tools and [assembly workspace](reconstruction-site/components/assembly-workspace.tsx) in that same application. The assembly workspace verifies downloaded bytes and metadata, resolves real part geometry and displays model, parts and authored steps. The original sample app and local test bench remain separate under `site/`. No Python invocation or validated LEGO revision publication is implemented.

Prerak's converter remains a separate workstream. Do not import, invoke or couple the surrounding implementation to its current CLI or on-disk schema. Its future adapter consumes the versioned handoff and returns LDraw; converter execution, measured mesh compatibility and validation evidence remain outstanding. Current reconstruction exports have provider-native axes, unknown physical scale and no MTL/texture or color transfer.

The [converter handoff protocol](reconstruction-site/docs/converter-handoff.md), [payload checks](reconstruction-site/lib/conversion-contract.ts) and [routes](reconstruction-site/app/api/jobs/[id]/conversion/route.ts) own wire syntax, limits and examples. The durable meanings are:

| Boundary | Contract |
| --- | --- |
| Create/reopen | Owner-authenticated submission accepts versioned settings using the existing bounded `Idempotency-Key` pattern; reads reopen the latest request or recover by submission key. Check Origin on mutations. Only a ready, nondeleted reconstruction owned by that user may supply the source. Never accept an owner, storage key or arbitrary source URL from the client. |
| Request snapshot | Persist random request ID, parent job ID, owner, submission key, source OBJ SHA-256, canonical settings JSON/hash, creation time and state. Initial settings record bounded target dimensions in studs and the requested input up-axis, which may remain explicitly unspecified. These bounds are not calibrated build-size or complexity claims. The first automatic handoff uses stable key `handoff-${sourceJobId}`; an explicit new attempt gets a new UUID. The same owner/key replays an identical parent/source/settings request and rejects a conflicting one, preserving earlier results. Creation atomically bounds live handoffs per source, while accepted keys remain replayable at the limit; the executable conversion service owns that limit. |
| Downloadable handoff | Return versioned request metadata and relative authenticated OBJ/manifest download paths. Preserve original mesh bytes/checksum. Users can pass downloaded artifacts to the eventual converter; this delivery does not dispatch scripts. |
| Submit supplied result | Receive bounded LDR plus the source/settings hashes and optional producer metadata through the owner session. Validate echoed hashes against the immutable request; compute result hashes server-side. Producer attribution and the claimed source association are supplied metadata, not proof a converter ran. |
| Structural acceptance | Bound request bytes and decoded LDR size; parse finite nonsingular transforms, supported color syntax, flat root `.dat` placements and STEP membership under the existing import limits. Derive inventory and cumulative steps from those placements, never supplied counts or validation flags. Referenced geometry must resolve completely before the browser displays a successful model. Catalog legality, collisions, connectivity and physical buildability remain unverified. Missing steps retain the existing explicit warning; do not invent them. |
| Immutable saved result | Store private LDR under a request/lease-specific object key and its server-generated manifest in D1. Derive stable inspection artifact identity from request ID and LDR checksum. Publish `result_available` only after required object writes and an atomic state comparison succeed; identical result retries return the existing artifact, conflicting replacements return 409. Separate writer keys prevent stale writers from overwriting a newer publication. This identity is a persisted inspection artifact, not a validated canonical LEGO revision. |
| Workspace | Load saved owner-authorized LDR into the reused importer/viewer and verify its checksum, placement count and authored-step metadata. Replace random session identity with the saved inspection artifact identity for model, inventory, steps and CSV. Keep stored results available on import/dependency failure and provide reopening/retry. Show manual supplied-result provenance and unverified buildability. An accepted upload is not evidence of complete rendering. |

The receiving API accepts flat root part placements; explicit `0 STEP` boundaries provide instructions. Root `ROTSTEP` boundaries are supported without applying their camera rotations. Packed submodels and custom geometry accepted by some local test-bench paths are outside this receiving contract. Every placement must appear exactly once in the ordered steps, and the final cumulative step must equal the full model. Without authored boundaries the existing missing-step warning applies; the viewer does not invent a sequence. Confirm converter output fits the executable [import limits](reconstruction-site/lib/ldraw/model.ts), currently 5 MiB and 2,500 placements plus bounded dependency complexity, before selecting target sizes. Part-library resolution is an additional availability dependency.

The additive [conversion migration](reconstruction-site/drizzle/0002_magical_slyde.sql) introduces `conversion_requests` without changing reconstruction state semantics. Its [schema](reconstruction-site/db/schema.ts) stores the request snapshot, result checksum/artifact ID, result manifest, timestamps and publication lease, with owner/parent lookup and a unique owner/submission-key index. Persistent states include `awaiting_converter`, the internal leased `publishing` state, `result_available` and `deleted`; publishing means receiving supplied bytes, not running Python. Rejected submissions do not replace an existing result. Reopening or retrying these operations never submits TRELLIS. The migration preserves reconstruction rows, tombstones and downloads and requires application to the existing hosted database during deployment.

All result/file routes enforce parent and request ownership and reject deleted parents. Removal revokes parent access before downstream cleanup. Required deletion semantics are durable tombstones with discoverable object keys and repeatable cleanup, including failed writes or deletion racing an active publication. Deleted requests retain only inaccessible cleanup keys for repeatable removal. Independent regressions cover failed cleanup and deletion racing a blocked write; no autonomous cleanup worker is implemented. The browser uses its existing authenticated session. A bearer-token machine endpoint is deferred until access through the private Sites dispatcher is proven; do not expose a direct unauthenticated origin as a workaround.

For this delivery, verify handoff hashes/settings, duplicate and conflicting requests/results, wrong-owner access, wrong source/settings hashes, malformed/oversized LDR, missing steps/dependencies, reload recovery and deletion/write races. Exercise a clearly labeled supplied LDraw fixture through storage, full-model view, inventory and all authored steps. This tests the surrounding pipeline only. When the real converter adapter is added, test actual prepared TRELLIS OBJ → converter → LDR and compare canonical placements, inventory, ordered membership and validation evidence. Publishing a validated `ModelRevision` still requires those checks; the inspection artifact does not weaken that contract. Studio compatibility and physical builds remain separate release evidence.

### Full product flow

The flow below describes the full photo-based product. Reconstruction source covers image input through checked mesh export, with one successful local live test. Hosted acceptance remains pending. The separate converter implements the local mesh-to-assembly path under review; connecting and validating the full flow remains outstanding.

1. Validate uploads, strip unnecessary metadata, normalize images, record checksums and establish object framing.
2. Reconstruct approximate geometry and appearance using one or more images; record uncertain or inferred regions.
3. Normalize orientation and requested dimensions. Discretize geometry into an internal occupancy representation.
4. Fit a restricted set of parts and valid colors. Optimize resemblance, connectivity, piece count and sourcing feasibility under explicit constraints.
5. Validate placements, collisions, connector compatibility and support. Reject or flag unresolvable output rather than silently publishing it.
6. Construct a feasible assembly sequence, checking insertion access and intermediate support; introduce subassemblies only when supported and verified.
7. Persist a versioned model and validation report; derive render data, inventory and instruction artifacts from it.

The browser calls the application API. The API authorizes access and creates durable jobs. Workers read private inputs and write versioned artifacts. The browser receives job status through polling initially; streaming is optional later. Keep provider credentials and privileged storage access server-side.

## Canonical domain contracts

| Entity | Required meaning |
| --- | --- |
| Project | ID, owner/access boundary, title, input references, selected revision |
| Source image | ID, project, private object key, checksum, media properties, optional view label |
| Reconstruction request/artifact | Separate immutable mesh provenance, private files and eligibility contract defined above; never a LEGO placement revision |
| Generation request | Source IDs, target dimensions, complexity preset ID/version and resolved constraints, part/palette constraints, algorithm settings, idempotency key |
| Job | ID, request ID, stage, state, attempts, lease, timestamps, error category, cancellation state |
| Model revision | Immutable ID, schema version, catalog version, source/request provenance, units and axes, placements, validation references |
| Placement | Stable instance ID, catalog part ID, color ID, grid position, permitted orientation |
| Catalog entry | Stable part ID, geometry, connector definitions, valid orientations, supported colors, provenance/license |
| Instruction plan | Model revision ID, ordered steps, placed instance IDs, camera guidance and optional subassembly dependencies |
| Parts inventory | Model revision ID, catalog version, exact counts grouped by part and color |
| Validation report | Model revision ID, validator version, checks/results, warnings, unsupported conditions and physical-test references if any |

Use integer coordinates in a declared grid: proposed horizontal unit is one stud and vertical unit one plate, with an explicit rendering conversion. Document origin and axes in the schema before sharing fixtures. Collision volumes and connector geometry must account for real part shapes; bounding-box overlap alone cannot distinguish legal connections. Restrict initial orientations and part types instead of implying support for all LEGO geometries.

Schema validation should reject unknown IDs, invalid colors/orientations and incompatible versions. Keep external marketplace identifiers in explicit mappings; internal IDs must not assume every vendor shares the same numbering. Pin catalog provenance to revisions. No AI-generated part IDs enter a validated inventory without catalog lookup.

## Invariants and revisions

### Complexity presets

Product F6 owns the user-facing slider behavior. Resolve its selected preset server-side through a versioned configuration containing at most five enabled levels: stable ID, label, target piece range, optional hard cap, detail settings and permitted assembly techniques. Persist both the preset version and resolved constraints in the generation request so later tuning cannot change an existing revision's meaning. Reject unknown, disabled or incompatible presets; do not trust client-supplied limits.

Treat target ranges as optimization goals and hard caps as validation constraints. Return target-versus-actual count in the result; a miss must be surfaced according to F6, while a hard-cap violation fails validation. Reuse eligible reconstruction artifacts when generating another complexity revision, but rerun brick fitting and all dependent validation, inventory and instruction generation. Include resolved complexity constraints in job deduplication/cache keys so different selections cannot return the wrong result.

Keep complexity distinct from dimensions and supplier cost. Price estimates derive from a documented estimation method or the actual parts inventory with coverage metadata, never a fixed price assigned to a level. Validate ordinal effort/detail expectations on benchmark builds rather than asserting that piece count alone measures difficulty. Executable preset configuration will own calibrated numeric values; no brick thresholds are established yet.

### Shared output guarantees

- Inventory quantities equal placement counts by part and color; spare parts, if offered, are separately labeled.
- Every placement is introduced exactly once in instructions; the final assembly equals the model revision.
- Each assembly step respects supported connection, access and intermediate-support rules. Mere graph connectivity does not establish physical strength or constructibility.
- Render transforms derive from canonical coordinates, never an independent UI copy.
- Configuration changes create a new generation request/revision. Old shopping lists, instructions and progress remain tied to their original revision.
- Publish outputs atomically only after required validation passes. Draft previews must be explicitly labeled.
- Store schema/algorithm/provider versions and relevant seeds/settings for traceability. Do not promise reproducibility from a changing external provider.

## Jobs, recovery and API boundaries

The pilot's executable [job routes](reconstruction-site/app/api/jobs/route.ts), [job lifecycle route](reconstruction-site/app/api/jobs/[id]/route.ts) and [artifact route](reconstruction-site/app/api/jobs/[id]/files/[kind]/route.ts) own submission/recovery lookup, status/reconciliation/removal and owner-scoped downloads. Mutating routes check origin and require identity. Full project management, LEGO revision APIs and separate cancellation controls remain future work.

The implemented reconstruction lifecycle is `submitting` → `queued` → `generating` → `collecting` → `ready`, with `failed`, unresolved `unknown` and removal tombstone `deleted` states. Provider status can skip intermediate stages. Recovery follows the pilot contract above; stage labels never invent percentages. Future LEGO generation may use a different executable lifecycle while retaining the canonical revision invariant.

Keep a known-good fixture path available for development without paid generation. Fixtures and mocked outputs must be visibly marked; they do not satisfy the image-to-model milestone.

## Parts sourcing and export

Use LDraw geometry and its license/provenance metadata to build the versioned local MVP catalog. Start with approximately 8–12 common rectangular brick and plate families and expand only after benchmark evidence identifies a useful gap. Generate stud and anti-stud connector definitions analytically for this restricted set; evaluate richer connector metadata separately before broadening the catalog.

Maintain explicit mappings between internal catalog IDs, LDraw filenames, BrickLink IDs and Rebrickable IDs. Verify mappings and part-color combinations rather than assuming numbering systems agree. Start with a machine-readable inventory export and readable parts table. Add BrickLink-compatible wanted-list export only after validating its current format and terms. Live price and stock lookups are optional later adapters with region, currency, timestamp and missing-data states; missing prices are not zero. Replacement parts require regenerating and revalidating the assembly, not just editing the shopping list.

## Operational requirements

Enforce project access checks on every API and artifact request, private storage and expiring download links. Validate content rather than trusting file extensions; configure upload/size limits, generation quotas and server-side timeouts. Avoid logging raw photos, credentials or signed URLs. Define retention/deletion behavior including derived artifacts and provider retention before launch.

Record job/revision correlation IDs, stage timing, failure categories and per-result generation cost. Establish actual performance and cost budgets during P0. Use instanced rendering and measured mesh reuse where beneficial; test representative maximum models on agreed devices. Provide a usable failure state when 3D rendering is unavailable.

## Verification and change control

Use valid and deliberately invalid fixtures for catalog, collision, connection, inventory and instruction tests. Test retry/cancellation races and authorization boundaries. Exercise upload-to-instructions flows in the browser, then physically assemble representative results before claiming buildability.

Record important choices as short decisions: ID, status, context, choice, alternatives, consequences, evidence and revisit trigger. Accepted: A1 canonical LEGO revision as source of truth; A3 restricted LDraw-based initial catalog; A6 local mesh-to-brick conversion as its own validation milestone; A7 a separate image-upload-to-ordinary-mesh workstream that can proceed before converter completion; A8 fal-hosted original TRELLIS (`fal-ai/trellis`) as the MVP reconstruction provider; A9 connect image upload, TRELLIS, Prerak's Python conversion and LDraw model/step display. A9's surrounding pipeline is approved for implementation with a durable manual handoff/result boundary on the existing reconstruction Site; Prerak's converter and its execution host remain outside this delivery. A7 supersedes A6's former exclusive delivery ordering, not its LEGO release gates. Source-backed pilot contracts: A2 provider-owned asynchronous generation with request-driven collection; A4 an explicitly configured adapter, D1 jobs and checked R2 artifacts. Richer immutable request/project contracts and the broader A5 stack remain proposed. Hosted validation, provider data-control verification, durable purge and autonomous collection remain open release gaps; the local bottle test establishes only its recorded scope. Update contracts and their tests in the same PR as contract changes.
