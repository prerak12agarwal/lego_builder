# Architecture

Owner: Architect. Purpose: system design, contracts and decision rationale. Product intent lives in [Product](Product.md); phase gates and open direction live in [Roadmap](Roadmap.md).

## Status and engineering principles

Hosting on ChatGPT Sites is a confirmed founder preference. The architecture below adapts to that preference but does not describe deployed software. The tracked baseline has no application or converter implementation. Promote proposals to accepted decisions with rationale and evidence during implementation. Dependency manifests and lockfiles will own exact versions; this document should not repeat them.

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

These are starting choices to evaluate, not claims of compatibility or installed dependencies. Verify current primary documentation and licensing when adopting them.

| Layer | Proposal | Reason / reconsider when |
| --- | --- | --- |
| Web app | TypeScript, React, Sites-compatible Vinext starter | Align with the available Sites starter and Worker runtime; verify the starter at implementation rather than assuming arbitrary Next.js server compatibility. |
| 3D UI | Three.js with React Three Fiber | Interactive part rendering and camera control; prove performance using representative models. |
| Styling | CSS design tokens; select component approach after UI references | Keep visual decisions centralized and avoid premature brand commitments. |
| Geometry worker | External asynchronous generation service; Python if custom geometry work is needed | Keep GPU/native-library and long-running computation outside the Sites request handler. Provider and hosting remain open. |
| Persistence | Sites D1 for metadata; Sites R2 for private image/model artifacts | Use the platform's logical bindings; separate transactional state from large files. |
| Background work | External durable job execution plus application job metadata | Long generation tasks must survive browser disconnects; do not assume a Sites request itself supplies a durable queue. |
| Quality | TypeScript test runner, Python tests, browser end-to-end tests | Verify contracts, geometry and complete user journeys; select tools with the actual scaffold. |
| Delivery | GitHub pull requests and CI; ChatGPT Sites for web hosting | Preserve the partner GitHub workflow; resolve Sites source/deployment integration during setup. |

Image-to-3D provider, authentication configuration and completion/recovery mechanism remain open for the reconstruction workstream. Prefer one managed inference API initially; custom GPU hosting and model training are outside this proposal. LDraw is confirmed as the MVP geometry/interchange foundation; broader catalog coverage and external identifier mappings still require validation. Evaluate reconstruction on the agreed benchmark, data retention, licensing, export access, latency and total cost. The engineering agents' language models are separate from this runtime provider decision.

### Sites deployment boundary

Planning basis: installed Sites building/hosting guidance inspected on 2026-09-13. It describes a Cloudflare Workers-compatible server build, logical D1/R2 bindings and HTTP-based access to external services; raw TCP connections are unsupported. Re-read the applicable Sites guidance at implementation because platform capabilities may change.

Proposed split: Sites serves the UI and lightweight authenticated API; an external asynchronous service performs reconstruction and expensive brick fitting. Do not assume Sites supplies GPU execution, an arbitrary Python server, or unlimited background processing. Prove an authenticated submit/status/result round trip before enabling real reconstruction. If the founders require every component to run solely inside Sites, treat that as an additional constraint requiring a feasibility decision.

Use the Sites manifest and migration files as the eventual deployment source of truth; keep secrets in managed runtime values. Keep GitHub as the partners' canonical collaboration repository. If Sites requires a separate source remote, name and manage it explicitly without replacing GitHub origin, and publish only a reviewed revision. Source synchronization and deployment are not configured by these documents.

## Image reconstruction workstream — proposed design

Confirmed output: an ordinary reconstructed 3D model suitable for later LEGO conversion, with fast delivery and generation as design priorities. The following implementation choices remain proposed. Start with one image, one managed provider and one geometry-first quality preset. Defer multiview fusion, texture refinement, provider switching UI and automatic LEGO generation. Use a narrow submit/status/result adapter, not a general inference platform. Product owns the upload and preview acceptance criteria; Roadmap owns scope and approval gates.

### Minimal flow and durable ownership

1. **Authorize and upload:** authenticate before accepting private files or starting billable work. Prefer Sites' dispatch-owned Sign in with ChatGPT and server-side identity helpers over a new account system; API routes reject missing identity. Prove the trusted server identity boundary; never accept a browser-supplied owner ID or trust equivalent headers on a directly exposed origin. Sign-in identifies a user; the hosting access policy or an explicit allowlist separately restricts a private pilot. The server authorizes project access, validates a bounded image upload, strips unnecessary metadata and stores the normalized provider input privately in R2. Record its checksum and transformation provenance. A short-lived provider-readable URL grants access only to that input.
2. **Submit:** resolve provider/model/settings on the server, enforce quotas and reserve a durable job in D1 before the outbound request. Store the provider task ID as soon as received. Return the application job ID promptly; do not hold the browser request open for inference.
3. **Observe and recover:** the provider owns asynchronous inference. The browser polls application status with backoff and can resume the same job after refresh. Prefer authenticated completion callbacks plus reconciliation against provider status. Verify callback retries or provide a small approved durable reconciler so collection completes without an open tab. Browser polling and request-lifetime background work alone do not meet this requirement. Do not assume Sites offers a scheduler or queue without verifying it.
4. **Collect and validate:** retrieve completed files server-side into private application storage before provider URLs expire. A bounded, recoverable collection step validates and prepares the viewer asset and converter export. Mark success only after required files and reports are stored and the artifact reference is published transactionally. Heavy parsing, image decoding or mesh conversion that cannot fit measured Worker limits belongs in an external worker; a dedicated GPU service is not required for this step.
5. **Inspect and export:** serve the stored GLB through an authorized, expiring read path to a client-side viewer with orbit, zoom and reset. Expose an explicit converter-handoff status and a geometry export. The reconstructed mesh has no catalog parts, brick count, inventory or instructions.

Persist an immutable `ReconstructionRequest` with project/source IDs, normalized-input hash, provider/model identifier, resolved settings, preprocessing version and idempotency key. A `ReconstructionArtifact` records request/job IDs, provider task ID, returned model/version if available, private object keys and checksums, format, geometry statistics, coordinate transform, scale/orientation uncertainty and mesh-validation report version. Separate `previewReady` from converter eligibility (`unchecked`, `eligible`, `rejected`). Keep selected reconstruction and selected LEGO revision as separate project references. Reconstruction success never creates a `ModelRevision`; a later brick-generation request references the immutable reconstruction artifact and produces a new validated LEGO revision.

### Retry, cancellation and private-file rules

Use a database uniqueness constraint on owner/project plus idempotency key, bound to the complete request hash; reject key reuse with different input/settings. Reuse eligible completed results only within the authorized project and identical preprocessing/provider/model/settings identity. An explicit regenerate action creates a new request. Deduplication is not a promise that probabilistic regeneration is reproducible.

Retry bounded transient reads and collection safely. On ambiguous provider submission, reconcile using provider-supported request identity; if unavailable, record an unresolved submission for recovery instead of blindly resubmitting a potentially billed request. Make callback handling idempotent, reject stale state transitions and authenticate provider events; if signed events are unavailable, treat callbacks only as hints and confirm through the authenticated provider API. A cancellation request immediately prevents publication/selection, while remote cancellation and charges depend on provider support. Late completions cannot overwrite cancellation or a newer selected artifact. Persist deletion intent so late workers cannot recreate deleted projects or files.

Keep uploads and derived models private; authorize every job, status and artifact operation. Bound bytes, decoded pixels, parse time, vertices/faces and texture resources. Fetch only approved provider HTTPS locations, validating redirects and blocking internal-network destinations. Reject external glTF resource references, unsupported extensions and archives with unsafe paths; do not let provider metadata initiate arbitrary fetches or execution. Do not log photos, signed URLs or secrets. Provider retention/deletion, application expiry, permitted data use and spending limits must be settled before paid integration or external user uploads.

### Geometry contract and LEGO handoff

Retain the provider artifact and create a versioned, self-contained GLB for preview plus a triangulated geometry-only OBJ and manifest for converter ingest. Prefer provider exports when they pass the same checks. The manifest carries source/artifact checksums, axes, winding/handedness, applied transforms, bounding box, unknown physical scale and validation outcomes. Preserve color/texture provenance separately; OBJ geometry alone does not promise color transfer. STL can be an optional later export and must not silently erase provenance or scale information.

Validate structural decoding, finite nonempty geometry, index bounds and resource limits before browser display. Converter eligibility adds degenerate-face, component, manifold/closed-surface and voxelization-suitability checks under the converter's declared rules. Record safe repairs and retain the original; reject or explain unsupported geometry instead of silently filling large holes or removing object components. A renderable mesh may fail this gate. Until the converter exists and passes an ingest check, label the export as prepared input with compatibility unverified.

Normalize the exported frame explicitly and bake scene transforms consistently. A file's declared coordinate units do not establish an object's real dimensions from a photo. Upright orientation is inferred until confirmed; physical scale remains unknown until a later converter request supplies target dimensions in studs or an explicit measured scale. Camera framing and decorative staging must not modify stored geometry. LEGO placements, inventory and instructions continue to obey the canonical revision invariants below.

### Verification, performance and rollout

First prove one authenticated upload → real provider job → durable GLB/OBJ → preview/download path on explicitly approved test images. Include reopening after closing the tab, duplicate submit, ambiguous submit, provider failure/expiry, unauthorized access, repeated callback, cancellation/deletion during collection, corrupt output and renderable-but-ineligible geometry. Compare viewer and export geometry using the recorded transforms. A fixture path enables development but does not satisfy reconstruction acceptance.

Choose the provider with a small identical-image benchmark before committing to it. Measure upload/preprocessing, provider queue/inference, collection/validation, time to interactive preview, failure rate and total cost per usable result including retries. Geometry-first output and one default preset reduce initial work and potential latency; neither guarantees measured performance. Set numeric latency, artifact-size and cost budgets from evidence, not marketing claims. A texture pass or alternate provider is justified only by a measured fidelity or latency gap.

First benchmark candidate: Meshy T2, geometry only, approximately 4,000 target faces, requesting only GLB and OBJ. Its [image-to-3D API](https://docs.meshy.ai/en/api/image-to-3d) supports Smart Topology T2 with a configurable face target, skipping textures and selecting export formats. These capabilities fit the narrow handoff and avoid a separate remesh stage; output quality and actual face count still require validation. The [published API pricing](https://docs.meshy.ai/en/api/pricing) is in credits and must be checked against account cost before spending. This is a proposed benchmark configuration, not provider adoption, an application latency promise or a multiview capability claim.

Roll out privately with enforced per-user/concurrent-job limits and billable generation disabled until provider, spending and data-handling choices are approved. Add versioned D1 migrations and executable schemas during implementation; there is no tracked application data to migrate today. Integrate the reviewed UI baseline when available. The mesh-to-brick converter remains a separate dependency and requires its own geometry, catalog, instruction and physical-build evidence before any buildability claim.

## Processing flow

The flow below describes the full photo-based product. The reconstruction workstream covers image input through checked mesh export; the planned mesh-to-assembly MVP begins at normalization and discretization. Neither pipeline is implemented in the tracked baseline.

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

Expose authorized operations for project management, upload initialization/completion, generation start/status/cancel, revision retrieval and artifact export. Define executable API schemas with the implementation rather than maintaining duplicate endpoint specifications here.

Proposed job lifecycle: queued → running → succeeded, failed or cancelled. Stage information describes progress within running; do not invent percentages. Deduplicate retries by request key, use bounded retry policies for transient faults, persist checkpoints and recover expired worker leases. A worker completing after cancellation must not publish its output as the current result. Regeneration must not overwrite a newer selected revision.

Keep a known-good fixture path available for development without paid generation. Fixtures and mocked outputs must be visibly marked; they do not satisfy the image-to-model milestone.

## Parts sourcing and export

Use LDraw geometry and its license/provenance metadata to build the versioned local MVP catalog. Start with approximately 8–12 common rectangular brick and plate families and expand only after benchmark evidence identifies a useful gap. Generate stud and anti-stud connector definitions analytically for this restricted set; evaluate richer connector metadata separately before broadening the catalog.

Maintain explicit mappings between internal catalog IDs, LDraw filenames, BrickLink IDs and Rebrickable IDs. Verify mappings and part-color combinations rather than assuming numbering systems agree. Start with a machine-readable inventory export and readable parts table. Add BrickLink-compatible wanted-list export only after validating its current format and terms. Live price and stock lookups are optional later adapters with region, currency, timestamp and missing-data states; missing prices are not zero. Replacement parts require regenerating and revalidating the assembly, not just editing the shopping list.

## Operational requirements

Enforce project access checks on every API and artifact request, private storage and expiring download links. Validate content rather than trusting file extensions; configure upload/size limits, generation quotas and server-side timeouts. Avoid logging raw photos, credentials or signed URLs. Define retention/deletion behavior including derived artifacts and provider retention before launch.

Record job/revision correlation IDs, stage timing, failure categories and per-result generation cost. Establish actual performance and cost budgets during P0. Use instanced rendering and measured mesh reuse where beneficial; test representative maximum models on agreed devices. Provide a usable failure state when 3D rendering is unavailable.

## Verification and change control

Use valid and deliberately invalid fixtures for catalog, collision, connection, inventory and instruction tests. Test retry/cancellation races and authorization boundaries. Exercise upload-to-instructions flows in the browser, then physically assemble representative results before claiming buildability.

Record important choices as short decisions: ID, status, context, choice, alternatives, consequences, evidence and revisit trigger. Accepted: A1 canonical LEGO revision as source of truth; A3 restricted LDraw-based initial catalog; A6 local mesh-to-brick conversion as its own validation milestone; A7 a separate image-upload-to-ordinary-mesh workstream that can proceed before converter completion. A7 supersedes A6's former exclusive delivery ordering, not its LEGO release gates. Proposed: A2 asynchronous generation; A4 one managed reconstruction adapter with separate request/artifact contracts; A5 provisional stack above. Provider selection, spending, data retention and exact recovery infrastructure remain open. Keep these here until separate decision records are warranted. Update contracts and their tests in the same PR as contract changes.
