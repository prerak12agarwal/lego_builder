# Architecture

Owner: Architect. Purpose: system design, contracts and decision rationale. Product intent lives in [Product](Product.md); phase gates and open direction live in [Roadmap](Roadmap.md).

## Status and engineering principles

Hosting on ChatGPT Sites is a confirmed founder preference. The architecture below adapts to that preference but does not describe deployed software. The initial repository has no application stack. Promote other proposals to accepted decisions with rationale and evidence during implementation. Dependency manifests and lockfiles will own exact versions; this document should not repeat them.

The core artifact is a structured assembly of real parts, each with a position, orientation and color. A generated image or a surface mesh is an intermediate representation, not the deliverable. Derive all user outputs from the same immutable model revision and carry its validation state into each artifact. Keep reconstruction separate from deterministic catalog, geometry and inventory validation. A digital candidate is distinct from an assembly whose construction has been validated.

## Current general OBJ exterior generation decision

Founder-approved direction: accept OBJ geometry of arbitrary object categories, recover the exterior without requiring users to repair the source, and produce a detailed interpretation using real LEGO parts and LDraw export. The same general pipeline must handle a cat, bottle, vehicle or unfamiliar shape without requiring a filename, object name or semantic group convention. Interior fidelity is unnecessary; useful internal structure may be synthesized inside the inferred exterior. Preserve the source and add no external stand or rescue support. Approximately 2,000 required pieces, with a working target range of 1,800–2,200, guides scale exploration rather than permitting artificial count padding. Broad input handling does not establish uniformly impressive resemblance or physical buildability for every shape.

This extension is implemented separately from the established rectangular path in `lego_builder/generic.py`; the [four-subject benchmark](examples/generic/README.md) records the current approximation and limits. The source-derived Cybertruck fitter below remains a specialized helper and evaluation artifact; it cannot stand in for the general converter or be silently substituted for an unfamiliar source. Both paths use the native LDraw assembly, catalog, renderer and export boundaries below. Existing rectangular validation retains its original meaning. Six-view depth reconstruction, general curved-surface fitting and mechanical validation described as possible extensions below are not implemented.

### General exterior recovery and fitting

**Intake and resource bounds.** Read finite, nonempty OBJ surface geometry independently of names and face winding. Triangulate supported faces and omit individually unusable or zero-area faces with counts; reject malformed references or a source with no usable surface. Bound input bytes, faces, grid allocation, triangle–cell work and fitting attempts before expensive work. Open edges, overlapping surfaces, disconnected components and inconsistent winding are diagnostics rather than blanket source rejections. Preserve the original checksum, source bounds, selected up axis and full source-to-model transform. Do not follow arbitrary material or texture paths; geometry remains usable without materials, and color transfer requires explicit palette and manufactured part-color evidence.

**Exterior target.** Rasterize triangles conservatively on a stud/plate grid without relying on inside/outside queries against the raw mesh. A bounded local morphological closing followed by a padded outside flood can infer an envelope across small gaps. Record the closing radius, raster tolerance, added cells and reconstruction method; closing changes geometry and must not be described as exact recovery. Derive the target boundary from the inferred envelope rather than retaining every source face, so enclosed seats, walls and other internal interfaces do not become exterior detail. Keep thin surface occupancy when there is no enclosed volume to fill. Source units and resolution bound the meaning of small gaps; do not silently replace a difficult shape with its convex hull.

For severely open triangle soups, a bounded alternative may use first and last surface depths along three axes (six opposing views) to constrain the inferred envelope. Such depth reconstruction is an approximation: it can bridge missing surfaces or lose cavities that the selected views do not observe. Keep its identity and inferred regions in provenance and measure the result against source views. Visible concavities remain exterior evidence; an opening that exposes interior surfaces is inherently ambiguous without additional semantic information. The converter owns that inference and reports limitations rather than requiring the user to supply a perfectly closed source. Signed-distance or containment methods requiring a well-defined solid must not be applied to raw broken geometry as though their signs were reliable. Depth/silhouette carving and the solid assumptions of signed distance are distinguished in the official [Open3D carving](https://www.open3d.org/docs/release/tutorial/geometry/voxelization.html#voxel-carving) and [distance-query](https://www.open3d.org/docs/release/tutorial/geometry/distance_queries.html) documentation.

**Geometry-driven parts.** Fit the inferred exterior using a shared part-family search, starting with deterministic bricks and plates, then useful exposed tiles and slopes where measured surface direction and catalog geometry match. Surface patches, curvature and local profiles may guide family retrieval; source filenames and object labels do not define the general algorithm. An exterior shell may omit the inferred interior and include useful ties or ribs; record shell thickness and structural policy. A solid rectangular interpretation is a baseline approximation, not evidence that broad-library surface fitting has been completed. Replace a rectangular region with a slope only when its actual profile and proper orientation fit the intended surface; the part's bounding prism is not its solid geometry. No missing detail may be replaced by an unrelated template, and no hidden fill or needless fragmentation may inflate the piece count.

Explore a bounded set of resolutions using actual fitted counts, exterior error and useful structure. Record requested and actual count, scale, attempted sizes and selection criteria. The target band can remain unmet when geometry or computational limits prevent an appropriate result. Keep recovered occupancy, fitted placement geometry and source-view comparisons separate so coverage of a discretized target is not misreported as perfect source resemblance.

**Output and validation separation.** Generic generation produces the same native LDraw canonical placements as the specialized fitter. Catalog resolution, supported physical part-color combinations, proper rigid transforms, exact inventory and export consistency remain mandatory. Input acceptance does not certify mechanics: a completed visual candidate may report disconnected or unsupported pieces, while an assembly with untested joints remains unverified. Support-aware fitting should attempt legal structure, but bounded solver failure must not be disguised as a malformed source or a validated build. Explicit failures and unperformed checks remain visible; only assemblies that pass the applicable checks receive corresponding validated claims. General artifact descriptions and validation messages must identify the selected algorithm instead of hardcoding a vehicle description.

**Verification and migration.** Test closed and open shapes, thin surfaces, enclosed internal faces, renamed and ungrouped copies, malformed inputs and work limits. Renaming or regrouping identical geometry must not change geometric placements under the same settings, although source provenance and thus revision identity can change. Adding fully enclosed internal faces should not introduce visible details. Distinct source silhouettes must produce distinct source-derived candidates; compare cat, bottle and vehicle outputs through the same public general entry point and render exact library meshes. Preserve the old reader, grid schema and tests; add the general pipeline behind explicit algorithm identity rather than changing the meaning of archived models. The command-line entry point and executable schemas own exact names and options.

### Source-derived vehicle fit

The immediate implementation may use a vehicle-specific fitter guided by the supplied mesh's named body, glazing, trim, light and wheel groups. Record that customization in the algorithm identity and result description; it is not evidence of arbitrary-object conversion. Extract dimensions, wheel centers/radii, roof and window bounds, and relevant surface directions from actual referenced vertices. Retain the selected source groups, excluded interior groups, cleanup operations, source checksum and source-to-model transform as provenance. Invalid individual triangles may be omitted from exterior recovery with counts; source holes and disconnected components are diagnostics rather than an automatic rejection. Missing expected groups or insufficient exterior evidence require an explicit failure or declared fallback, never an unrelated generic vehicle presented as a conversion.

Fit an exterior shell with a recognizable roof profile, dark glazing, wheel openings, wheels, trim and lights. Preserve observable shape features while allowing material thickness and concealed chassis, cross-members and panel attachments to be designed for the LEGO interpretation. The earlier requirement to occupy every cell of a filled source volume does not apply to this shell design. Measure exterior silhouette and source landmark differences independently from brick count. Original interiors are not target occupancy, and extra buried pieces must not be inserted to inflate the count.

Start scale exploration near 55–65 studs long, then resolve the requested piece range through actual shell, structure and detail fitting. Source bounds indicate approximately 22 studs width, 19 studs height and 9 studs tire diameter at 60 studs length; these are scale estimates, not predetermined placement geometry or a validated count. Include requested and actual dimensions/counts in each result. Prefer useful common part sizes and repeatable construction over artificially fragmenting invisible structure.

### Catalog and geometric representation

Use a broad indexed LDraw geometry library to retrieve useful bricks, plates, tiles, slopes, wedges, transparent elements and wheel-related parts. Separate the searchable geometry library from the subset whose connector and assembly behavior has been checked. Resolve recursive type-1 references, local transformations and inherited colors consistently; pin every used root/dependency file by checksum and preserve source attribution. Inventory uses physical part instances: an assembly shortcut containing both a tire and rim must not be counted as one physical piece or counted again alongside its children.

The first vehicle implementation can select a bounded useful subset from this library while retaining a path to broader retrieval. Prefer established stud-mounted slopes/wedges and compatible wheel components. Full rotations also allow angled panel and wheel assemblies, but a visually aligned panel is not proof of a legal attachment. Store component membership and any intended attachment relationships separately from verified connector results. Future connector coverage should assess existing metadata such as the LDCad shadow library, including its licensing and coverage, rather than assuming LDraw surface geometry alone defines legal joints.

### Native LDraw canonical contract and renderer boundary

Use a distinct native-LDraw model schema for this path. Each placement has a stable instance ID, catalog part ID, LDraw color ID, `position_ldu` translation and row-major nine-value `rotation`. Coordinates use LDraw units and negative Y upward. Rotation matrices must be finite and proper rigid transforms: orthonormal within a declared tolerance and determinant positive one. Reflection, scale and shear are not permitted part placements. Parts retain their official local origins; do not apply rectangular lower-corner offsets to the new schema. Persist precision/quantization rules, catalog and algorithm identities, source-derived parameters and the resolved piece target with the model.

The geometry renderer consumes the exact same placements as export. For each local library vertex, apply `world = rotation * local + position_ldu`; LDraw type-1 export emits those same matrix and translation values. Resolve geometry through the catalog's explicit filename mapping. The renderer must not insert decorative geometry, substitute smoothed panels or recolor parts that differ from the canonical artifact. A display ground or lighting is presentation only and is excluded from the model, inventory and construction artifacts. Use actual library meshes for the vehicle preview and show the revision and candidate state alongside it.

Compute the immutable revision from deterministic canonical content, excluding only the revision field itself and non-model execution measurements such as runtime. Bind requested piece count, tolerance, resolved target band and hard output cap explicitly; missing constraints are invalid rather than supplied by mutable defaults. Exact inventory, LDraw, preview data and any placement manifest reference that revision. Module boundaries are: source feature extraction and generation produce the canonical model; catalog/geometry resolution supplies part meshes; rendering and export consume it without redesigning it. Executable schemas and functions own final field names, commands and catalog formats.

### Candidate publication, verification and migration

An exportable digital candidate must pass deterministic identity, finite/proper transform, resolvable part/geometry, supported part-color, exact inventory and LDraw round-trip checks. Mechanical checks are separate named results with states such as passed, failed or not evaluated. In particular, collision, connection, insertion order, strength and Studio/physical inspection must not inherit a pass from the rectangular validator. A generated grouping or placement manifest may support inspection; label it as a draft rather than validated build instructions when assembly feasibility is unverified. Known defects and unmet checks remain visible in the report and preview.

This milestone distinguishes an exported digital candidate from a buildability-verified assembly and reports unverified assembly checks explicitly. This does not relax hard invalid-part, malformed-transform or artifact-consistency checks. Keep the old grid schema, reader, converter and tests intact. Dispatch by schema instead of reinterpreting existing integer grid placements as LDraw coordinates. No database migration is involved; the new schema/catalog/algorithm identities create new revisions and old outputs retain their original meaning. Independent QA checks the new artifacts and claims before handoff, with physical assembly evidence still required for buildability claims.

## Established rectangular MVP path

The established local, deterministic `OBJ`/`STL`-to-brick converter remains available as the restricted mesh-to-assembly baseline. Its source mesh is test input, not the final artifact; the validated placement list is the source of truth for the exported model, inventory, preview and placement order. The contracts below describe that path, including its intentionally stricter source gate and rectangular catalog.

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

### Accepted local implementation contracts

The initial implementation uses Python with NumPy, SciPy and Trimesh for local geometry processing, with pytest for verification. Exact dependencies and commands belong in the implementation manifest and README. This is the accepted implementation of A6, not a hosted service or a claim that the P0 release gate has passed.

**Mesh intake and scale.** Preserve supplied references. Read geometry locally without requiring material images or following arbitrary material paths; the initial palette is uniform and texture transfer is deferred. Record source SHA-256, original bounds, selected up axis, orientation matrix, translation, scale and safe repairs. Only deterministic cleanup such as duplicate/degenerate removal, coincident-vertex welding and consistently orienting faces is implicit; local triangle/quad hole repair must be recorded. Reject remaining open, non-manifold, non-finite, zero-volume or ambiguous solid inputs with diagnostics. Do not silently replace a source with its convex hull, discard components, or seal large openings. Multiple closed components can be voxelized as a solid union if all are retained; final assembly connectivity still decides validity. Source orientation is an explicit setting, not inferred from a filename.

Scale the longest physical dimension, including the vertical dimension, to the requested stud length before applying the anisotropic grid conversion. One horizontal cell is 20 LDraw units and one vertical cell is 8; a vertical stud length therefore spans 2.5 plate layers. The accepted initial sampler marks cells intersecting source triangles using the separating-axis triangle–box test, then fills enclosed cells on the discrete grid. Clip candidates to the rounded normalized bounds and use a versioned numerical tolerance; record the sampler in each result. This conservative approximation retains thin connections that interior-cell-center sampling can erase, but can thicken features, close narrow openings or fill enclosed voids. It is not exact continuous-mesh fidelity. The triangle–box method follows the geometric test described by [Akenine-Möller](https://fileadmin.cs.lth.se/cs/Personal/Tomas_Akenine-Moller/pubs/tribox.pdf); implementation batching and limits belong in executable code. Bound input faces, target dimensions, grid allocation and triangle–cell candidates before expensive work. Surface rasterization and fill do not make an open or ambiguous input suitable; mesh intake remains a separate gate. Trimesh likewise cautions that containment-based filling can be meaningless for non-watertight meshes ([voxel API](https://trimesh.org/trimesh.voxel.creation.html)).

**Canonical placement and catalog.** Use a non-negative integer lower corner `(x, y, z)`, with horizontal `x/y` in studs and `z` upward in plates; cell indices refer to half-open body volumes. A part has a catalog-defined unrotated horizontal footprint and height of one or three plates. Permit only upright yaw of zero or ninety degrees. Analytic connectors sit at stud-cell centers on the top and underside mating planes. For these exact rectangular families, disjoint body cells plus compatible top/underside mating model legal stud engagement without treating the studs as colliding bodies. This restricted geometry model does not establish compatibility for other part types.

Pin the approximately 8–12 selected official LDraw part files with source URL, checksum, author/license metadata and verified dimensions; record recursive geometry dependencies if redistributing or rendering them. Include narrow three- and four-stud spans at plate height as well as brick height: thin target regions exposed a fitting gap that taller parts cannot address. The executable catalog owns the exact selected IDs and version. A simplified preview may draw analytic bodies and studs but must say that it is schematic. Supported part-color combinations need independent catalog evidence; the presence of a color in LDraw's color configuration alone does not prove a physical part exists in that color. Begin with a small verified uniform palette. Keep physical supplier IDs explicit and distinct from LDraw color IDs.

**LDraw mapping.** Official LDraw is right-handed with negative Y upward, 20 units per stud, 24 per brick and 8 per plate ([format specification](https://www.ldraw.org/article/218.html)). The curated standard brick/plate parts have their local origin at the center of the top body plane; for example [3001.dat](https://library.ldraw.org/library/official/parts/3001.dat) and [3020.dat](https://library.ldraw.org/library/official/parts/3020.dat). For an oriented footprint `dx × dy` and height `h`, map the canonical lower corner to LDraw translation `(20*(x+dx/2), -8*(z+h), 20*(y+dy/2))`, with an identity or proper ninety-degree Y rotation. Verify per-part origins instead of assuming this convention for future catalog extensions. LDraw descriptions order dimensions as Z then X, so the familiar “2 × 4” part has unrotated X extent four studs ([library specification](https://www.ldraw.org/article/512.html)). Export type-1 part references, never an OBJ surface disguised as an LDraw assembly; step markers follow the canonical placement sequence.

**Fitting, repair and assembly.** Retain the target occupancy separately from the fitted model. Begin with deterministic complete coverage and greedy rectangular merges, using a stable candidate order. Prefer cross-layer overlap and staggered seams; use a bounded set of alternate scan directions, orientations or splits to repair disconnected seam patterns. Record attempts and before/after connectivity rather than promising repair always succeeds. The current founder-selected mode is shape-only: no stand, base, support column or other rescue geometry is added outside the shape-derived target. Reject a target that cannot be fitted into a valid assembly under the bounded solver; do not silently delete unsupported details or move individual feet to make it pass.

Each non-ground placement must mate with at least one top stud of an already placed part at its underside plane. Ground placements may rest on the table during assembly; the completed stud-connection graph must be one component. Side contact is not a connection. Independently check collisions, catalog/orientation validity, bottom-up insertion access and exact instruction membership. This conservative discrete assembly model leaves clutch strength, torque, tipping and human hand access unverified; weak support and persistent seams remain reported risks even when the graph passes.

**Artifacts, failure and evidence.** Canonical serialization and revision identity depend on input, resolved settings, catalog/algorithm versions and placements, excluding runtime/timestamps. Derive LDraw, bill of materials, sequence and preview from that revision. Validate the exported round trip and inventory rather than merely checking a serializer against its own output. Publish a completed bundle only after automated hard constraints pass; failures return a nonzero status and diagnostic report, with any retained preview/model clearly marked as a draft. Existing output directories must not retain a stale successful artifact after a failed rerun.

The benchmark harness records each input and size, input rejection or validation failure, part/lot counts, elapsed time, repair attempts and discrete occupancy/silhouette metrics. Distinguish target-grid fit from resemblance to the original continuous mesh and from human recognizability. Report Studio import and physical build checks as pending until independently performed. Source references are candidate fixtures, not a completed ten-object benchmark. No persistent database migration is needed; future incompatible canonical/catalog schemas require new version identifiers and explicit readers rather than reinterpretation of old files.

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

Use the Sites manifest and migration files as the eventual deployment source of truth; keep secrets in managed runtime values. Keep GitHub as the partners' canonical collaboration repository. If Sites requires a separate source remote, name and manage it explicitly without replacing GitHub origin, and publish only a reviewed revision. Source synchronization and deployment are not configured by these documents.

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
