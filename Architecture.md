# Architecture

Owner: Architect. Purpose: system design, contracts and decision rationale. Product intent lives in [Product](Product.md); phase gates and open direction live in [Roadmap](Roadmap.md).

## Status and engineering principles

Hosting on ChatGPT Sites is a confirmed founder preference. The reconstruction pilot has application and geometry-processing source in [reconstruction-site](reconstruction-site/package.json), one successful [local live bottle conversion](reconstruction-site/test/live-evidence.md), and a successful owner-private [Sites publication](https://lego-builder-image-to-3d.dragonjjk.chatgpt.site). Hosted runtime validation remains pending; the mesh-to-LEGO converter remains planned. Dependency manifests and lockfiles own exact versions. Keep local test evidence distinct from hosted release claims and design intent.

The full product's core artifact is a structured assembly of real parts, each with a position, orientation and color. A surface mesh is the output of the separately confirmed image-reconstruction workstream and an intermediate input to the LEGO pipeline. Derive all three LEGO user outputs from the same validated model revision. Keep probabilistic reconstruction separate from deterministic catalog, geometry and inventory validation.

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

## Image reconstruction workstream — pilot contract

Confirmed output and implementation direction: build a workable image-to-ordinary-mesh pilot, with fast delivery and generation as priorities. The implemented slice accepts one image and uses one configured provider and preset; a real bottle upload-to-saved-mesh flow has passed locally. Multiview fusion, texture refinement, provider switching UI and automatic LEGO generation remain deferred. Product owns upload and preview acceptance criteria; Roadmap owns scope and release gates. Hosted release and broader fidelity claims require additional evidence.

### Minimal flow and durable ownership

1. **Authorize and upload:** authenticate before accepting private files or starting billable work. Prefer Sites' dispatch-owned Sign in with ChatGPT and server-side identity helpers over a new account system; API routes reject missing identity. Prove the trusted server identity boundary; never accept a browser-supplied owner ID or trust equivalent headers on a directly exposed origin. Sign-in identifies a user; the hosting access policy or an explicit allowlist separately restricts a private pilot. The server authorizes project access, validates a bounded image upload, strips unnecessary metadata and stores the normalized provider input privately in R2. Record its checksum and transformation provenance. Send the bounded input server-to-server as a base64 data URI supported by the [TRELLIS API](https://fal.ai/models/fal-ai/trellis/api), avoiding an image URL blocked by private Sites sign-in.
2. **Submit:** resolve provider/model/settings on the server, enforce quotas and reserve a durable job in D1 before the outbound request. Use fal's queued REST API for `fal-ai/trellis`, authenticated with the server-only `FAL_KEY`. Persist the returned request ID for status and result retrieval. Return the application job ID promptly; do not hold the browser request open for inference.
3. **Observe and recover:** the provider owns asynchronous inference. The [workspace](reconstruction-site/app/workspace.tsx) polls through authorized reconciliation requests and can reopen a persisted job or pending submission key. Inference can continue while the browser is closed, but the pilot does not collect results autonomously. Users must return promptly, while provider assets remain available. An expired/unavailable result becomes a failed job with an explanatory message; the input remains, and collection never automatically submits replacement inference.
4. **Collect and validate:** on an authorized reconciliation request, retrieve completed files server-side into private R2 storage before provider URLs expire. Bound downloaded bytes, parsing/normalization work and request duration; checkpoint recoverable collection in D1 and prevent concurrent collectors with an expiring lease or equivalent atomic claim. Retry collection without submitting inference again. Mark success only after required files and reports are stored and the artifact reference is published transactionally. Reject or defer artifacts exceeding tested Worker limits; a long-lived background task is not a pilot dependency.
5. **Inspect and export:** serve the stored GLB through an owner-authorized application route or verified expiring read path to a client-side viewer with orbit, zoom and reset. Apply the same ownership checks to source images, status, manifests and exports. Expose an explicit converter-handoff status and a geometry export. The reconstructed mesh has no catalog parts, brick count, inventory or instructions.

This request-driven collection is an explicit pilot limitation relative to the earlier autonomous-collection proposal. Installed Sites 0.1.70 guidance documents private-Site sign-in and D1/R2, but no verified private webhook exemption, scheduler, queue or alarm deployment path. Workers compatibility alone does not establish one. Confirm fal's applicable result and asset retention before promising a recovery window; the earlier Meshy candidate's retention policy does not apply to TRELLIS. Autonomous ingestion remains a release gap until an authenticated completion mechanism is proven.

The pilot's persistent contract is the [D1 job schema](reconstruction-site/db/schema.ts), created by the [initial migration](reconstruction-site/drizzle/0000_same_gunslinger.sql): owner, submission key, normalized-input checksum, provider/task IDs, state, timestamps, collection lease and result manifest. Private R2 objects use the job ID plus artifact kind. The manifest adds source/provider-GLB/export checksums, fixed generation settings, preprocessing and validator versions, baked-transform metadata and geometry statistics. There is no project table, immutable request-settings snapshot or completed-result content cache yet. Freeze settings while unresolved requests exist, or add a versioned request snapshot before supporting configuration changes. The planned richer `ReconstructionRequest`/`ReconstructionArtifact` entities below remain separate from canonical LEGO `ModelRevision`; the pilot always reports converter eligibility as `unchecked`.

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

The flow below describes the full photo-based product. Reconstruction source covers image input through checked mesh export, with one successful local live test. Hosted acceptance remains pending. The mesh-to-assembly MVP beginning at normalization and discretization remains planned.

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

Record important choices as short decisions: ID, status, context, choice, alternatives, consequences, evidence and revisit trigger. Accepted: A1 canonical LEGO revision as source of truth; A3 restricted LDraw-based initial catalog; A6 local mesh-to-brick conversion as its own validation milestone; A7 a separate image-upload-to-ordinary-mesh workstream that can proceed before converter completion; A8 fal-hosted original TRELLIS (`fal-ai/trellis`) as the MVP reconstruction provider. A7 supersedes A6's former exclusive delivery ordering, not its LEGO release gates. Source-backed pilot contracts: A2 provider-owned asynchronous generation with request-driven collection; A4 an explicitly configured adapter, D1 jobs and checked R2 artifacts. Richer immutable request/project contracts and the broader A5 stack remain proposed. Hosted validation, provider data-control verification, durable purge and autonomous collection remain open release gaps; the local bottle test establishes only its recorded scope. Update contracts and their tests in the same PR as contract changes.
