# Architecture

Owner: Architect. Purpose: system design, contracts and decision rationale. Product intent lives in [Product](Product.md); phase gates and open direction live in [Roadmap](Roadmap.md).

## Status and engineering principles

Hosting on ChatGPT Sites is a confirmed founder preference. The consumer UI preview is implemented in [site/](site/) using the Sites-compatible Vinext starter, React and TypeScript. The converter and production service contracts below remain design targets. Promote other proposals to accepted decisions with rationale and evidence during implementation. Dependency manifests and lockfiles will own exact versions; this document should not repeat them.

The core artifact is a structured assembly of real parts, each with a position, orientation and color. A generated image or a surface mesh is an intermediate representation, not the deliverable. Derive all three user outputs from the same validated model revision. Keep probabilistic reconstruction separate from deterministic catalog, geometry and inventory validation.

## Independent UI implementation track

The founders requested the overall interface on ChatGPT Sites while converter validation remains a separate prerequisite for real generation. This track implements the consumer journey using explicitly labeled hand-authored sample data. It does not establish mesh conversion, image reconstruction, physical validation or the production service architecture.

The UI uses a canvas-based projection of rectangular brick geometry for its sample viewer; the proposed Three.js stack remains a later production choice. A single immutable sample revision supplies placements, inventory and instruction membership. All displayed assembly subsets and exported quantities derive from that revision. Uploaded photos remain temporary browser-local previews and are never associated with the sample as generated output. Generation remains visibly unavailable until a real adapter and validation pipeline exist. Accounts, persistent storage, external providers and pricing remain deferred. The fixture checks cover occupied-grid collisions, full footprint support, one final vertical-connection component, matching inventory and exactly-once step coverage. Initial instruction layers may be loose before subsequent layers join them. These checks do not establish catalog compatibility, insertion feasibility or physical stability.

## Current MVP architecture decision

The immediate implementation target is a local, deterministic `OBJ`/`STL`-to-brick converter. It proves mesh-to-buildable-assembly before image reconstruction or production web integration. Its source mesh is test input, not the final artifact; the validated placement list is the source of truth for the exported model, inventory, preview and placement order.

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

Image-to-3D provider, authentication approach, queue product and GPU hosting remain open for the later photo-based product. LDraw is confirmed as the MVP geometry/interchange foundation; broader catalog coverage and external identifier mappings still require validation. Evaluate reconstruction adapters on the agreed benchmark, data retention, licensing, export access, latency and total cost. The engineering agents' language models are separate from this runtime provider decision.

### Sites deployment boundary

Planning basis: installed Sites building/hosting guidance inspected on 2026-09-13. It describes a Cloudflare Workers-compatible server build, logical D1/R2 bindings and HTTP-based access to external services; raw TCP connections are unsupported. Re-read the applicable Sites guidance at implementation because platform capabilities may change.

Proposed split: Sites serves the UI and lightweight authenticated API; an external asynchronous service performs reconstruction and expensive brick fitting. Do not assume Sites supplies GPU execution, an arbitrary Python server, or unlimited background processing. Prove an authenticated submit/status/result round trip before integrating the inference service in P2. If the founders require every component to run solely inside Sites, treat that as an additional constraint requiring a feasibility decision.

Use the Sites manifest and migration files as the eventual deployment source of truth; keep secrets in managed runtime values. Keep GitHub as the partners' canonical collaboration repository. If Sites requires a separate source remote, name and manage it explicitly without replacing GitHub origin, and publish only a reviewed revision. The UI source remains under `site/` in the GitHub feature branch. Sites publication uses a separate source snapshot rooted at that directory, with a per-command credential; it does not replace GitHub origin or publish the repository’s internal reference assets. Recreate that snapshot from the reviewed `site/` source for each publication.

## Processing flow

The flow below describes the later photo-based product. The current MVP implements the mesh-to-assembly subset defined above; it begins at normalization and discretization rather than image upload or reconstruction.

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

Record important choices as short decisions: ID, status, context, choice, alternatives, consequences, evidence and revisit trigger. Accepted for the current MVP: A1 canonical revision as source of truth; A3 restricted LDraw-based initial catalog; A6 local mesh-to-brick conversion before image reconstruction. Still proposed for the later product: A2 asynchronous generation; A4 provider adapters; A5 provisional stack above. Keep these here until separate decision records are warranted. Update contracts and their tests in the same PR as contract changes.
