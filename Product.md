# Product

Owner: Product. Purpose: user-facing behavior, feature acceptance and design direction. Delivery ordering is in [Roadmap](Roadmap.md); implementation contracts are in [Architecture](Architecture.md).

## Product promise

A user photographs an item, generates a LEGO-brick interpretation, inspects it in 3D, obtains an exact parts list and follows instructions to build that same model. The three outputs must agree. Photos cannot establish every hidden surface; communicate approximation and let the user judge the result before buying parts.

The confirmed audience is nostalgic adults who enjoy LEGO but cannot design models from scratch. The immediate unified release supports a limited set of simple objects from one clear image; multiple-image reconstruction is later scope. Help users succeed through guided photo capture, useful defaults and approachable instructions; do not assume knowledge of brick identifiers or modeling tools. Exact object categories and fidelity targets remain open in Roadmap Q1–Q2. Product success means a user can obtain and assemble a recognizable model, with clear limitations and manageable effort. A visually appealing preview alone is insufficient.

## Current MVP boundary

The confirmed immediate milestone is a developer-facing OBJ-to-LEGO converter, not the web app. Its shared workflow accepts an OBJ of an arbitrary subject, extracts the exterior and fits real LEGO parts; it must not require Cybertruck-specific names or substitute a vehicle template for another object. Interior detail is outside the target. The result includes an LDraw model and exact bill of materials. Input acceptance, exterior resemblance and mechanical assembly verification are separate outcomes. The earlier clean OBJ/STL rectangular converter remains available as a regression baseline.

The earlier rectangular baseline targets solid, static, mostly upright forms without large unsupported overhangs. The shared exterior workflow expands input acceptance beyond that baseline; it must report fidelity and unresolved mechanics for thin or disconnected features. The source model supplies the observed geometry. Image capture, image-to-3D reconstruction, accounts, persistence, purchasing and the consumer browser experience remain outside this milestone.

The established rectangular baseline requires repeatable, recognizable, catalog-valid connected assemblies with a valid bottom-up order. The shared exterior workflow can deliver explicitly unverified digital candidates under F0 while mechanical work remains open; export success alone does not meet resemblance or buildability criteria. The photo, conversion and consumer-interface work retain separate evidence gates while being combined into one workshop journey.

## Unified workshop Site

Confirmed founder direction: [the original workshop Site](https://lego-builder-workshop.dragonjjk.chatgpt.site/) is the canonical consumer destination. Bring the existing real single-image reconstruction and LEGO-conversion journey from the separate pilot into this Site while preserving the workshop's established visual language: navy navigation, cobalt controls, a pale model stage, and connected Model, Parts and Instructions views. The supplied generated mockups remain the intended design direction; their sample content and unverified counts are not product facts.

The public shell, examples, hand-authored sample workbench and browser-local Admin LDraw inspection remain available without sign-in. During the controlled pilot, starting provider-backed generation, accessing private artifacts, resuming a saved job and removing a job require both the Sites identity used to establish ownership and membership in the site-owner-managed pilot allowlist. The sign-in transition returns an approved user to the intended new-project or saved-project context. Provider keys and converter credentials never reach the browser.

The hand-authored sample remains a separate named workbench. Its rendered placements, parts quantities, exports and step membership must agree, and it must never appear as the result of a user's photo. The Admin importer remains browser-session-local and keeps its existing behavior under F7. UI completion does not establish image conversion, source resemblance or physical buildability.

The earlier [image-to-3D pilot](https://lego-builder-image-to-3d.dragonjjk.chatgpt.site/) remains available as a legacy application. Consolidation does not migrate, copy or delete its existing jobs or artifacts. New jobs started from the canonical workshop use that Site's owner-checked persistent storage; a legacy pilot job continues to be recovered through the legacy pilot unless a later migration is separately approved and verified.

## Pages and user journey

Routes below describe conceptual screens, not frozen URL paths.

| Screen | User needs and primary action | Required states |
| --- | --- | --- |
| Welcome / start | Understand supported objects and see clearly labeled examples; start a project | First visit, sample preview, unsupported scope explanation |
| Projects | Find private saved jobs and resume the latest durable stage without repeating completed paid work | Signed out, empty, loading, populated, active, failed reconstruction, failed conversion, ready, access denied |
| New project / photos | Start the real single-image flow; choose, preview, replace or remove one supported photo before generation | Signed out at paid action, upload progress, invalid/oversized file, interrupted upload, missing input |
| Build configuration | Choose complexity on a stepped slider (F6), review expected piece count and size; generate | Defaults, unavailable level, invalid combination, estimated versus actual quantities/cost |
| Generation | Understand the current stage and recover if needed | Queued, processing, cancel requested, failed with retry, complete |
| Model workspace | Rotate, zoom and pan; inspect dimensions, piece count, confidence/validation notes; open parts or instructions | Loading, ready, warnings, draft preview, renderer unavailable |
| Parts | See exact quantities by part/color and export a shopping list | Filter/search, unavailable mapping, unknown price, export failure |
| Instructions | Follow one manageable step at a time and resume progress | First step, active step, last step, saved progress, revision mismatch |

Model, Parts and Instructions may be tabs in a shared project workspace rather than disconnected pages. Keep project name, revision and validation state visible across all three. The public shell and local tools do not grant access to private jobs; authenticated project access is limited to the owner. Public sharing and checkout are not initial requirements.

## Feature acceptance criteria

### F0 — 3D model to brick assembly MVP

#### Shared OBJ exterior workflow

Confirmed by the founder: OBJ is the input format for the shared workflow. A cat, bottle, vehicle or other subject goes through the same exterior recovery, part fitting and LDraw export boundaries. The Cybertruck is the current design and test case, not a restriction on supported object names.

- Accept nonempty, finite OBJ surface geometry within documented resource limits, including imperfect topology. Do not require an object name, filename, semantic grouping, material file or watertight source.
- Ignore surfaces enclosed inside the recovered exterior. Adding a fully enclosed interior mesh to a closed test shape must not change its recovered exterior. Preserve the original and report inferred closure, thickness and unresolved openings; do not promise recovery of missing visible information.
- Generate actual catalog part placements from the supplied geometry, with no substituted sample model. Reuse the same canonical native LDraw representation, library resolution, inventory, preview and export checks across subjects.
- Resolve a requested approximate piece count through geometry scale and useful part fitting, recording target versus actual count and dimensions. Surface shaping and recognizability matter independently of count. No hidden count padding or external support stand is permitted.
- Use suitable parts from the broad library through supported fitting strategies. A subject-specific surface optimizer may refine the result when its prerequisites are explicit; the general path must remain usable without it. Geometry-specific optimizers must not imply universal support for every construction technique.
- Evaluate the shared path on the supplied cat, the Cybertruck, a clearly labeled procedural bottle and a distinct additional shape. Include renamed/ungrouped input and enclosed-interior invariance cases. Record likeness and part-count misses rather than treating file creation as sufficient visual acceptance.
- A bounded input can produce an approximate digital candidate while assembly checks remain unresolved. Carry those states into every artifact; no render or file export establishes physical buildability. Invalid part IDs, unsupported manufactured colors, malformed transforms and inconsistent artifacts remain hard failures.

#### Established rectangular baseline

- Accept a valid `OBJ` or `STL` mesh, a target longest dimension in studs and a supported palette selection. Reject unreadable, empty or structurally unsuitable meshes with a useful reason.
- Normalize the input orientation and scale, then discretize it on a grid whose horizontal unit is one stud and vertical unit is one plate. Keep the chosen scale and transform in the output metadata.
- Use only parts, colors and orientations present in the versioned MVP catalog. The general P0 baseline starts with common rectangular bricks and plates; the confirmed Cybertruck vertical slice below adds a curated set of real vehicle, surface-shaping and connection parts without implying universal part support.
- Produce a connected assembly with no collisions, floating parts or unsupported placements under the MVP rules. Stagger weak seams where possible and produce a valid bottom-up placement order.
- Keep the assembly shape-derived. Do not add a plinth, stand, support column or other external structure solely to make an otherwise unsupported result pass validation. Reject the attempt with an actionable reason when the discretized target cannot produce a connected, bottom-up assembly under the selected size and catalog.
- Export an LDraw `.ldr` or `.mpd` file, an exact machine-readable bill of materials grouped by part and color, a preview and a validation report. Inventory totals must equal the exported placements.
- Import every release candidate into BrickLink Studio without missing-part or malformed-model errors. Physically build a small representative sample before describing the converter as producing buildable models.
- Compare candidates at more than one target size when useful and report resemblance, part count, unique lots, validation failures, runtime and any manual repairs. Do not hide failed candidates.
- Given the same mesh, catalog version, palette, target size and solver settings, repeated runs must produce the same canonical placements, bill of materials, placement sequence and validation result. Incidental run metadata may differ.

#### F0 established rectangular benchmark handling

The founder-supplied models in `references/3d-objects/` are the first development benchmark, not a promise that every file is within the supported-object boundary. Run the canonical `OBJ` for the house, cat and airplane through the same public converter path. Also run the house `STL` as a format-parity case; because it represents the same object, it does not count as a fourth benchmark shape.

- Treat the cat as the initial solid-mesh baseline because the supplied geometry is watertight and consistently wound, while recognizing that its tail and limbs still challenge bottom-up placement. Treat the house as an input-quality challenge because the supplied geometry is open and inconsistently wound. Treat the airplane as a boundary challenge because thin wings and unsupported spans may fall outside the initial rectangular-brick catalog. These labels guide evaluation and do not predetermine pass or failure.
- Preserve the supplied files unchanged. If a mesh needs cleanup, orientation hints or object selection, store the derived input separately and report every intervention; a manually repaired derivative cannot be presented as an automatic conversion of the original.
- For each source/target-size attempt, record input format, catalog and solver versions, chosen transform and palette, success or rejection reason, resemblance review, part count, unique lots, validator results, runtime and manual intervention. Keep failed attempts in the benchmark report.
- A successful attempt must produce the complete F0 output set and pass deterministic validation. A supported input that fails conversion is a defect; a structurally unsuitable input must fail with an actionable reason rather than emit a nominally successful model.
- For the first implementation slice, run every supplied candidate unchanged and exercise at least two target sizes across the set. An end-to-end, no-repair success from the supplied set remains the objective, but do not force unsuitable geometry to pass. If every supplied candidate is rejected, use an explicitly labeled controlled valid fixture to prove the output pipeline and report successful conversion of an original supplied model as still outstanding. This is development evidence only. The broader P0 exit still requires the ten-shape benchmark, BrickLink Studio checks and physical builds in Roadmap.
- Until Studio import and physical-build evidence exist, describe outputs as engineering prototypes or catalog-validated assemblies. Do not describe them as proven buildable models or release-ready instructions.

#### F0 Cybertruck vertical slice

Confirmed: build an exterior-focused LEGO interpretation from the current `references/3d-objects/cybertruck.obj`, targeting about 2,000 required pieces and an attractive LDraw model. The converter owns source cleanup needed to recover the exterior; the user is not expected to repair the mesh.

- Preserve the original source and create any sanitized or reconstructed exterior as a derived input. Report discarded geometry and repairs. Broken, open or degenerate interior geometry may be ignored; do not claim interior fidelity.
- Interpret “about 2,000 pieces” as a proposed target band of 1,800–2,200 required parts for this slice. Count only parts that form the visible model or provide useful hidden structure. Do not add hidden fill merely to reach the band. If the strongest design falls outside it, report the exact count and quality tradeoff rather than padding or mislabeling it.
- Use a versioned Cybertruck catalog drawn from real LEGO-compatible LDraw parts and valid colors. It may include bricks, plates, slopes, wedges, curved slopes, tiles, brackets or other legal connection parts, transparent window elements, light elements, wheels, tires and axles. Each included family must contribute to the exterior treatment, wheel assembly or useful structure; broad catalog access is not a requirement to use arbitrary parts.
- Match the founder-supplied gray Cybertruck references at minimum from front three-quarter, rear three-quarter and side views. Preserve the long low wedge silhouette; smooth faceted hood, windshield and roof planes; dark continuous window band; open bed profile; large real tires; black angular wheel arches and lower trim; and thin front and rear light bars. Favor clean tiled or sloped surfaces over voxel-like stepping where catalog geometry permits.
- Interior detail, opening panels, steering, suspension, drivetrain and motorization are outside this slice. The wheels may be static. Hidden internal structure is permitted when it connects and supports the model, stays within the intended vehicle envelope and appears in the canonical placements, bill of materials and sequence.
- Do not add an external display stand, plinth or shape-changing support. The assembly must remain self-supporting under the applicable checks.
- Deliver the `.ldr`, exact bill of materials, multi-angle preview and validation report from the same canonical revision. Review exterior resemblance against the reference features above, not piece count alone. BrickLink Studio import remains required before calling the digital artifact compatible; physical-build evidence remains required before calling it proven buildable.

Cybertruck reference translation, approved by the founder in the current task. These are founder-supplied evaluation references with unknown authorship/source; treat them as internal reference material rather than project-created or redistributable artwork:

| ID | Repository reference | View | Accepted cues |
| --- | --- | --- | --- |
| C1 | [Front three-quarter](references/cybertruck-exterior/front-three-quarter.png) | Front three-quarter | Shallow pointed hood, broad faceted windshield, dark glazing, crisp silver body planes, black angular front arches, large tires and narrow front lighting |
| C2 | [Rear three-quarter](references/cybertruck-exterior/rear-three-quarter.png) | Rear three-quarter | Open bed, descending roof/bed rails, full-width red rear light bar, flat tailgate, black rear bumper and angular rear arches |
| C3 | [Side](references/cybertruck-exterior/side.png) | Side | Low continuous wedge profile, long dark window band, straight beltline, balanced axle placement, large tires and restrained silver/black color blocking |

### F0 non-goals

These exclusions apply to the local converter milestone; the separately approved F1 photo pilot and unified workshop track retain their own scope.

- No photo upload or image-to-3D reconstruction.
- No web interface, user accounts, saved projects or background-job system.
- No promise to support every LEGO part, color, object or advanced construction technique.
- No universal guarantee that messy meshes or other vehicle categories can be reconstructed automatically because this Cybertruck slice succeeds.
- No live pricing, stock lookup, automatic purchasing or polished consumer instructions.

### F1 — Photo input and configuration

- The immediate workshop flow accepts exactly one image of one object and shows a visible preview with actionable validation errors. Multiple-image reconstruction is deferred until after the single-image consolidation is complete and separately validated.
- Explain how to choose one useful angle, keep the full object visible and use a plain background. Do not imply that additional photos affect the current result.
- Let the user review photos and configuration before starting generation.
- Present model dimensions with units. Explain that smaller models lose detail and piece limits can affect resemblance.
- Publish supported file, size and piece limits from application configuration, not duplicated hard-coded copy.

#### Approved quick MVP — single photo to reusable mesh

Confirmed for the accelerated image workstream: build a focused web flow that turns one user-supplied image into an ordinary reconstructed 3D mesh intended for the F0 LEGO converter. This is the existing functionality being consolidated into the workshop under F8. It is an upstream input stage, not a finished LEGO result. A numeric latency target remains open pending a representative benchmark.

Confirmed provider direction for this MVP: use the fal-hosted original TRELLIS model, `fal-ai/trellis`. Key configuration, funded execution and one successful local bottle inference have been verified. That observation does not establish quality or latency for other objects or hosted operation.

The MVP journey is upload → generate → inspect → reuse:

1. The user chooses one clear photo of a single object. The upload surface previews the selected image, explains the quick-baseline constraints, and lets the user replace or remove it before generation.
2. Generate starts real reconstruction and shows only provider-backed states such as uploading, queued, reconstructing, preparing preview, failed, and ready. The user can retry a failed attempt without selecting the image again while that input remains available.
3. Ready opens an interactive mesh preview with orbit, zoom, pan, fit-to-view, and camera reset. It identifies the result as an approximate reconstructed mesh and exposes obvious warnings such as missing or uncertain hidden surfaces.
4. The successful mesh is preserved as a reusable artifact with its source association and generation status. The user can download it in a format targeted by the F0 input contract. The later LEGO conversion step should consume that same artifact rather than reconstructing the image again, once compatibility has been validated.

Acceptance criteria for this MVP:

- A supported image starts a real image-to-3D request and either returns a renderable mesh artifact or a truthful failure; samples, static models, and decorative renders never appear as successful user generation.
- The MVP accepts exactly one photo per generation. Multiview input is later scope; the interface does not imply that additional images influence this result.
- Before generation, guidance asks for one isolated, fully visible, well-lit object on a plain or uncluttered background. Unsupported files and configured size limits produce actionable errors before paid processing begins.
- Progress text reflects known job state and does not claim a percentage or stage the provider cannot report. Jobs and results are private to the authorized user. After refresh or close and reopen, that user can return through the job link within the configured retention window.
- Pilot recovery is request-driven: provider generation may continue while the site is closed, and reopening the job asks for and stores the latest provider state or result. The pilot does not claim autonomous result collection while nobody is using it. Production readiness still requires reliable server-side completion collection, expiry, and recovery behavior.
- The ready state renders the returned neutral reconstructed mesh itself and provides its format, approximate bounds when available, and a download/reuse action. Handoff is a prepared geometry-only `OBJ` plus manifest, with a `GLB` available for the browser preview. The same artifact identifier is reserved for downstream converter handoff; converter eligibility is reported separately and is not claimed until that ingest path is validated.
- The first preview uses neutral shading to make geometry legible. Preserve the source association and source-photo hash. The pilot retains the normalized source image privately until removal, but does not retain the user's original uploaded bytes or provider color/texture metadata; color fidelity remains deferred.
- Mouse, touch, and keyboard users can reach upload, generate, retry, download/reuse, fit-to-view, and reset controls. Essential status and limitations are available as text outside the 3D canvas, and reduced-motion preferences are respected.
- A failed or unusable result retains the input when possible and recommends a concrete recovery action: use a clearer background, include the whole object, improve lighting, simplify the subject, or retry a provider failure.
- Generated meshes are described as approximate geometry with inferred hidden surfaces and unknown real-world scale. They carry no catalog validity, structural stability, parts, instructions, or buildability claim until the separate F0 converter and its validators succeed.

MVP non-goals are LEGO brick fitting, parts lists, assembly instructions, new account-management UI, a project-library experience, manual mesh editing, texture generation, color-fidelity claims, arbitrary-object guarantees, provider-specific advanced controls, live pricing, and purchasing. Existing Sites identity plus minimum private job and artifact storage are in scope for secure generation and recovery. Hosted runtime validation, production retention verification, generation timeout, and acceptable generalized quality, latency and cost thresholds remain pending.

Implementation status from current `reconstruction-site` source inspection:

- Present in source: single JPG/PNG selection and browser normalization using centrally configured limits; real TRELLIS submission states; private per-user jobs; centralized per-user and site-wide daily pilot quotas; one unresolved job per user; idempotent submission recovery that blocks an unknown submit from becoming a duplicate paid request; saved job links; a link back to the prior ready result; and reuse of a saved source photo.
- Present in source: a neutral interactive preview with pointer rotation/zoom, fit-to-view controls and keyboard panning; private `GLB`, `OBJ`, and manifest downloads; triangle count, returned bounds, unknown physical scale, and unchecked LEGO compatibility labels.
- Present in source: the normalized source image and result files remain private until the user removes the job. Removal deletes app files and attempts provider cancellation for unfinished work, while warning that cancellation may still be charged. Requests to fal ask for private output access, no provider input/output storage, and 24-hour provider output expiry; these are requested provider controls, not verified deletion guarantees.
- Verified for one local live bottle run: the actual browser upload reached fal TRELLIS, stored a ready job in 64.966 seconds, rendered the neutral bottle mesh, supported rotate and fit-to-view, and recovered the same job after refresh without another generation. This is one observation, not a median, service target, or arbitrary-object quality result.
- The live result contained 1,656 vertices and 2,220 triangles. The downloaded `GLB` was 47,176 bytes and the `OBJ` was 138,010 bytes; both hashes matched the manifest, and reparsing the downloaded `GLB` reproduced the downloaded `OBJ` exactly. Evidence is recorded in [the bottle smoke test](reconstruction-site/test/live-evidence.md).
- Verification also passed 25 synthetic checks, type checking and the production build. The owner-private [pilot site](https://lego-builder-image-to-3d.dragonjjk.chatgpt.site) published successfully as version 1. Hosted inference and identity/storage behavior remain untested, as do broader object quality, repeated latency, provider retention guarantees, real-world scale and downstream converter suitability. The local bottle result is not copied into the hosted site's separate storage.

### F2 — Generation and recovery

- Show meaningful stages and allow the user to leave and resume a saved job.
- Never present a fixture or decorative generated image as successful photo conversion.
- On failure, explain whether the user should retry, simplify the object or change the photos. Preserve usable inputs.
- A failed regeneration leaves the previous successful revision accessible.
- Display uncertainty and validation limitations before the user relies on a parts list.

### F3 — Interactive model

- Support rotate/orbit, zoom, pan, fit-to-view and reset camera with discoverable controls.
- Show actual bricks, physical dimensions, piece count and color summary from the selected revision.
- Provide touch and keyboard-accessible alternatives to essential pointer actions, with textual information outside the canvas.
- Selection/highlighting and layer isolation are useful extensions; advanced brick editing and exploded views are later scope unless needed for instructions.

### F4 — Parts list

- Show part identity, human-readable name, color, quantity and an identifiable thumbnail or equivalent visual cue.
- Inventory totals exactly match the selected model revision. Separate optional spares from required counts.
- Offer a downloadable machine-readable list. Supplier links/exports are added only where mappings are verified.
- Distinguish exact quantities from estimated prices and stock. Display region/currency/time when price data exists.
- Warn when the user is looking at an older revision; preserve its inventory for users who already bought those parts.

### F5 — Assembly instructions

- Show required parts and quantities for each step, newly added bricks highlighted, and a useful camera angle with optional rotation/reset.
- Provide previous/next and direct step navigation; display position in the sequence.
- De-emphasize existing bricks without relying on color alone to indicate new parts.
- Store progress against the model revision; do not carry step numbers blindly into a regenerated model.
- The last step reconstructs the full model exactly, with no omitted or duplicate placements.
- Printable/downloadable illustrated instructions are a proposed later extension; interactive instructions are core scope.

Confirmed for the unified pipeline prototype: the converter authors deterministic draft layer steps for its generated digital candidate. These steps make the generated model navigable from lower layers upward; they do not establish connection access, intermediate support, stability or physical buildability.

- Label these results **Draft instructions** and state in text that the automated order and physical buildability are unverified. Do not describe them as validated assembly instructions or hide failed or unevaluated mechanical checks.
- Bind the draft sequence to the same immutable revision as Model and Parts. Every placement appears in exactly one nonempty step, per-step quantities derive from those placements, and the final cumulative step equals the full displayed model and exact parts total.
- The converter writes explicit step boundaries before publishing the LDraw result. The browser preserves and displays supplied boundaries; it does not infer a sequence from an unsequenced result.
- If draft-sequence generation or membership validation fails, keep any valid Model and Parts available, leave Instructions unavailable with the existing missing-steps explanation, and do not present the connected pipeline as complete.
- The browser-local Admin importer retains F7 behavior for arbitrary files: missing authored boundaries remain missing and never trigger generated draft steps.

### F6 — Complexity selection

Confirmed: users select complexity with a slider offering no more than five levels, expressed through difficulty labels or brick counts. Proposed first implementation uses five discrete stops with both friendly labels and an estimated piece-count range. This avoids asking novice builders to interpret a bare number. The exact ranges will be calibrated against the first supported objects; do not present invented counts as tested limits.

| Level | Proposed label | Intended experience |
| --- | --- | --- |
| 1 | Very easy | Simplified silhouette and few details; shortest, most approachable build |
| 2 | Easy | Recognizable shape with a few characteristic details; proposed default |
| 3 | Medium | Balanced detail and assembly effort |
| 4 | Hard | More detail and a longer, more involved build |
| 5 | Very hard | Most detailed build supported within the validated catalog and model limits |

- Place the slider before Generate and make every stop selectable by keyboard, touch and pointer. Announce the selected label and estimated piece range; also allow clicking a labeled stop.
- Moving the slider updates the configuration summary; generation starts only when the user selects Generate. Do not launch paid processing for every slider movement.
- Complexity guides detail, target piece range and assembly effort. More pieces alone do not establish greater difficulty; consider connection techniques, small parts and instruction demands when validating level labels. Higher levels never relax buildability checks or introduce unsupported techniques.
- Keep dimensions visible and treat size separately from complexity. If a combination is infeasible, explain it and offer a valid level or size; never silently change the user's choice. Explain any object-specific unavailable level rather than generating a knowingly invalid build.
- Before generation, show estimated piece ranges when calibrated, otherwise say the count will be determined during generation. After generation, show the exact required piece count from the validated model. Counts include all required parts, including plates and any real base, but exclude decorative staging and optional spares.
- If the generated result misses the advertised target range, identify the mismatch and offer regeneration or explicit acceptance of the actual count; do not label it as meeting the chosen range. A configured hard piece cap must never be exceeded in a successful result.
- Show estimated purchase cost only when supported by pricing data, with currency, region, freshness and stated shipping/tax coverage. Otherwise show cost as unavailable. Complexity is not a fixed price or spending guarantee.
- Changing complexity after generation creates a new revision on regeneration. Keep the existing model, inventory, instructions and saved progress attached to the previous revision until the new one is ready and selected.
- Calibrate each enabled level using representative objects and novice build trials. Test slider accessibility, infeasible combinations, target-range misses, hard caps and revision consistency.

An optional count-only label presentation can reuse the same five presets later; a separate continuous count slider or arbitrary exact-count input is not required for the first version. Preset labels, counts and defaults belong in one versioned application configuration once implemented, not repeated in UI components and documentation.

### F7 — Admin LDraw inspection

Implemented in the original workshop UI at the founder’s request and retained in the unified Site. Admin test bench accepts a browser-local `.ldr` or packed `.mpd`, loads real referenced part geometry and exposes Model, Parts and Instructions for that single imported revision. The existing sample remains a separate named workbench.

- Successful import replaces the previous local inspection model; failure or cancellation retains it. Imports survive navigation within this page, but are not saved across reloads. Files are not uploaded to storage; only public dependency names are requested through the official part resolver.
- Preserve root `STEP` / `ROTSTEP` groups. Each instruction step shows cumulative placements and highlights the new pieces, with previous/next and direct step selection. The final step and parts CSV must match the full imported model exactly.
- **Founder decision:** if the main model has no step boundaries, show a popup explaining that assembly steps are missing. Full Model and Parts remain available. Do not infer, generate or fabricate assembly order.
- Packed submodels can be displayed as assemblies in their parent step. Surface that nested instruction callouts and authored camera rotations are not implemented. Omit empty boundaries with an import note.
- Large imports can wait for the official part library and retry temporary failures, with visible waiting status and cancellation. Public geometry is cached to speed subsequent imports; uploaded models remain session-local.
- Reject missing dependencies, malformed transforms, unsupported model geometry or exhausted import limits with an actionable message. Never silently substitute sample geometry or accept a partial model.
- Label imported geometry and order as supplied, with physical buildability unverified. Embedded custom parts are identified; inventory is not a purchasing-validity claim.
- Founder-approved access: the consumer shell, sample workbench and Admin LDraw test bench are public without login. “Admin” is the test-tool label, not an authorization role. Imported files remain browser-session-local. Real generation and private project recovery use the authenticated boundary in F8.

### F8 — Unified image-to-build pipeline

Confirmed founder direction: make the original workshop URL the complete consumer solution by connecting its New project and My projects journeys to the existing single-image TRELLIS reconstruction, generic Python OBJ conversion and the LDraw workspace. Retain each completed stage and its provenance. A configured converter runs against the real saved OBJ; absent configuration or failed execution leaves the mesh available with a truthful state. The automatic demo extends the implemented manual handoff rather than substituting an uploaded fixture for real conversion. Multiple-image reconstruction is explicitly deferred until after this single-image workflow is integrated and reviewed.

Acceptance criteria:

- Visiting the canonical workshop without signing in exposes the established navigation, visual style, hand-authored sample and browser-local Admin inspection. Selecting New project opens the real one-photo workflow on a same-origin workshop route rather than the former session-only photo mockup. A user is asked to sign in only before starting paid reconstruction or opening owner-private project data, and an approved pilot user returns to the intended context afterward.
- My projects is the minimum recovery surface for jobs created on the canonical workshop. After sign-in, an approved pilot user can reopen the current/latest job and the prior ready job when one exists, with enough stage and status context to avoid repeating paid work. Opening an item resumes its recorded stage and artifact identities; an empty state leads to New project. This slice does not promise a browsable history or full project-library experience.
- A supported image creates one traceable pipeline job under the existing per-user and site-wide quotas. The interface reports truthful stages for image preparation, TRELLIS reconstruction, awaiting brick conversion, conversion, validation and viewer preparation, and identifies which completed stage failed with an actionable retry path.
- The real prepared `OBJ` and manifest associated with the successful TRELLIS result are retained as the downstream handoff. The normalized source image and its checksum, mesh handoff and any later LDraw result remain associated through stable identifiers and integrity metadata; retrying a stage cannot silently mix artifacts from different attempts.
- When no converter is connected, the ordinary user flow stops in an explicit awaiting-converter state. It preserves the mesh and offers its legitimate preview/download actions, but does not unlock a brick model, parts list or instructions as generated output. An owner-only receiver may exercise those result surfaces with a manually supplied file only when the interface labels it as unverified integration tooling rather than image conversion.
- The result boundary receives a genuine converter response for the retained mesh without requiring another paid reconstruction. The connected pipeline prototype is complete only when that response contains a parseable `.ldr` revision with converter-authored draft steps and evidence that step membership and final-model equality satisfy F5. A result with missing or inconsistent steps may still expose a valid Model and Parts as an incomplete output, using the F7 missing-steps message, but is not presented as a complete instructed workflow.
- The model workspace renders the bricks from that `.ldr`, derives its parts inventory from the same revision and preserves every authored `STEP` / `ROTSTEP` group for direct, previous and next navigation. The final step reconstructs the full displayed model and its placement count matches the parts total.
- Closing or refreshing the site does not create duplicate paid TRELLIS work or lose a recorded successful stage. The authorized user can resume the job within the configured retention window. Awaiting conversion and failed downstream attempts retain the reusable mesh, and a converter retry does not repeat TRELLIS unless the user explicitly starts a new reconstruction.
- Input, intermediate and result artifacts remain private to the authorized user and follow explicit retention and removal behavior. Provider and converter credentials remain server-side.
- Every new workshop job and derived conversion request is written through the canonical Site's owner-checked D1/R2 boundary. Job, configuration, file and conversion operations reject users outside the approved pilot allowlist and enforce owner access where a record exists. Browser requests cannot choose an owner, object key, callback URL or converter destination. State-changing requests enforce the authenticated owner and accepted workshop Origin. Public sample and Admin-local activity does not create private server records or invoke a paid provider.
- The integrated upload, status, model, parts and step controls meet the keyboard, touch, text-fallback and reduced-motion expectations of F1, F3 and F5.
- Completion of this integration does not by itself establish resemblance, structural stability or physical buildability. F0 validation, BrickLink Studio import, benchmark and physical-build gates remain required for those claims.

Present in the current `reconstruction-site` source: a ready TRELLIS mesh automatically creates and persists an owner-scoped awaiting-converter request; the saved request URL, `OBJ` checksum, settings checksum and handoff document preserve the source/result association; and a later result receiver accepts a matching immutable root `.ldr`. A received file opens in the same consumer workspace with the brick model, derived parts CSV and nonempty authored `STEP` / `ROTSTEP` groups. Missing steps produce a warning and no inferred instructions. A later pending request does not hide the prior saved result. See the [pipeline workspace](reconstruction-site/components/pipeline-workspace.tsx), [result workspace](reconstruction-site/components/assembly-workspace.tsx) and [conversion boundary](reconstruction-site/lib/conversions.ts).

The `site/` source now integrates the real single-image workflow at `/build` within the original workshop shell. New project enters generation; My projects recovers current/latest and prior ready jobs. The sample and Admin tools remain public, while model operations require approved Sites identity and owner checks. Local combined tests, type checking, production build and browser navigation passed; [workshop integration QA](site/test/workshop-evidence.md) records source checks. Converter-authored draft layer steps and the Workshop draft label are implemented; [independent QA](docs/qa-draft-instructions.md) verifies consistency. The published Workshop and authenticated Railway processor completed one approved bottle run with 2,137 pieces, 21 part/color lots and 160 draft steps; the final step and Parts total match, and the saved result survives refresh. [Hosted evidence](docs/workshop-publication.md) records the deployed revisions and bounded live verification.

Approved automatic extension: run the existing generic OBJ converter through a bounded authenticated HTTPS Python service configured only on the Sites server. New requests use approximately 2,000 target pieces with a visible resolved Y-up default; preserve legacy 4–48-stud handoffs without silently changing their settings. The returned source/settings hashes must match, and the result must meet the 2,500-placement and 5 MiB LDraw limits. The converter authors the draft layer boundaries defined in F5; membership validation permits the complete connected pipeline prototype while mechanical and physical-build evidence remain explicitly unverified. A generated digital candidate without valid authored steps remains inspectable through Model and Parts but is not a complete instructed workflow. Deployment, project access and an actual image-derived OBJ-to-LDraw run remain separate acceptance evidence; local manual-receiver tests do not satisfy them.

Integration non-goals are arbitrary-object guarantees, manual mesh or brick editing, live pricing or purchasing, public sharing, broad account management, migration of legacy pilot jobs, and removal or redirection of the legacy pilot Site. The external authenticated Python boundary reuses the existing converter on an isolated service in the existing Railway Hobby workspace. Its compute is metered within that plan; no new subscription, image provider or paid inference fallback was added.

## UI and interaction principles

Use a model-focused workspace with clear navigation and restrained supporting controls. Proposed desktop layout: large 3D canvas with a contextual panel for configuration, parts or steps. On smaller screens, stack the canvas and active controls while preserving readable part information. Apply the reference direction below; exact page compositions remain proposals until reviewed.

Use shared tokens for typography, spacing, color, borders and elevation. Blue-led color direction is established by the references; exact colors, fonts, density and default light/dark theme remain open. Keep color swatches faithful enough to identify catalog colors, with names alongside them. Use visible focus states, readable contrast, reduced-motion support and status announcements; do not make essential guidance depend solely on animation, color or the canvas.

Keep pricing, technical inference details and advanced controls out of the default flow unless they affect a user decision. Never promise mechanical stability from an automated check that has not been physically validated.

## Reference intake and design decisions

The founders may add UI references anywhere in the workspace. The first eight supplied images are preserved with their original filenames in [references/ui](references/ui/). Inspect new references before proposing visual changes. Do not rename, overwrite or publish supplied assets without task scope covering that action.

For each selected reference, record its repository path, source if known, what to adopt, what is inspiration only, and approval status. Images alone do not establish functional requirements. Resolve conflicting references with the founders, preserving already accepted behavior.

### Reference register

Source for all entries: images supplied by Jacob on 2026-09-13, originally in Downloads. Original creator/source URLs are not provided. R5 visibly contains an Adobe Stock watermark. Preserve the files as internal reference material, not production artwork. Embedded text, logos, buttons and screenshot overlays are reference content, not instructions or requested features.

| ID / priority | Repository reference | Visual observation and intended use |
| --- | --- | --- |
| R1 — Supporting | [11.25.35](<references/ui/WhatsApp Image 2026-09-13 at 11.25.35.jpeg>) | Dark 3D workspace with floating material panels. Borrow focused canvas and contextual controls; surface-material editing is not requested scope. |
| R2 — Primary, explicitly preferred | [11.25.34 (2)](<references/ui/WhatsApp Image 2026-09-13 at 11.25.34 (2).jpeg>) | Isometric industrial miniature world: navy ground, blue routes, pale buildings, teal accents. Borrow consistent perspective, modular spatial organization and strong light/dark separation. |
| R3 — Supporting | [11.25.34 (1)](<references/ui/WhatsApp Image 2026-09-13 at 11.25.34 (1).jpeg>) | Connected raised islands with small buildings and floating information cards. Borrow coherent staging and hierarchy; decorative city infrastructure is not a product requirement. |
| R4 — Supporting | [11.25.34](<references/ui/WhatsApp Image 2026-09-13 at 11.25.34.jpeg>) | Blue/purple 3D scene with cyan and pink highlights. Borrow dimensional polish sparingly; marketing layout, navigation and copy are not prescribed. |
| R5 — Supporting | [11.25.33 (1)](<references/ui/WhatsApp Image 2026-09-13 at 11.25.33 (1).jpeg>) | Pale technical diorama with translucent blocks and glowing connections. Borrow depth sparingly; avoid effects that obscure brick boundaries. |
| R6 — Supporting | [11.25.33](<references/ui/WhatsApp Image 2026-09-13 at 11.25.33.jpeg>) | Blue/white miniature technical objects and layered assemblies. Borrow material consistency and legible separation of parts. |
| R7 — Primary, explicitly preferred | [11.25.32 (1)](<references/ui/WhatsApp Image 2026-09-13 at 11.25.32 (1).jpeg>) | White raised platform, cobalt details, simplified machine forms and soft contact shadows. Borrow tactile miniature scale, restrained color and clear object staging. |
| R8 — Supporting | [11.25.32](<references/ui/WhatsApp Image 2026-09-13 at 11.25.32.jpeg>) | Playful miniature room with arcade machine, pastel props and sectional architecture. Borrow nostalgia and approachable object detail; pink/purple is not the primary palette. |

### Design translation

Confirmed preference: R2 and R7 take priority over the other images. Our working interpretation is a tactile, isometric miniature workshop with crisp modular forms, layered bases, soft shadows and restrained blue accents. It should feel inviting to an adult returning to LEGO. This interpretation guides implementation; it does not imply approval of an exact mockup.

R2 supplies spatial composition and a possible dark backdrop; R7 supplies object treatment and a possible light backdrop. They do not settle the default theme or require shipping both themes. Proposed first treatment: pale neutral model stage with cobalt controls and navy supporting text/navigation; keep the final choice open for the first visual review.

- Start the model at a useful three-quarter/isometric-style view, with rotation and camera reset available. Instructions may choose another angle when connections would otherwise be hidden.
- Use the actual brick assembly as the visual focal point. Keep its catalog colors independent of the interface palette; a blue interface must not recolor the user's model blue.
- A raised display platform may ground the model visually. If decorative, distinguish it from required bricks and exclude it from inventory/instructions; a real build base must be represented in the canonical model.
- Use small, readable contextual panels inspired by R1. Keep essential controls visible and large enough for novice users; do not copy its tiny labels.
- Carry the same staging into project thumbnails and step views. Use a simpler, flatter table for parts purchasing where scanning matters more than decorative depth.
- Photo upload should feel like placing references beside a workbench. Generation can use restrained assembly motion, but animation must not imply real progress beyond known job state.
- Keep movement purposeful, respect reduced-motion preferences and preserve clear brick edges under lighting. Text and navigation remain ordinary accessible UI, not perspective-distorted objects inside the scene.

### Visual review criteria

Review the first implementation against R2 and R7 together: consistent three-quarter staging, tactile forms, soft grounding shadows, restrained blue hierarchy, readable controls and a dominant user model. Confirm the start/upload, viewer, parts and instruction experiences remain easy to use on desktop and mobile. Treat extra glow, city scenery, elaborate glass effects or pastel room styling as secondary inspiration, not mandatory additions. This is a design review checklist, not evidence of a completed UI.

### Generated concept mockups

The following AI-generated screens translate the approved reference direction into a connected journey. The founder confirmed these screens as the intended design direction for the Sites UI. They remain reference artifacts, not implemented UI or pixel-perfect requirements:

- [Upload and complexity](references/mockups/upload-and-complexity.png)
- [Interactive model workspace](references/mockups/model-workspace.png)
- [Build instructions](references/mockups/build-instructions.png)

Use them to evaluate hierarchy, staging, novice guidance, and consistency across the journey. Product acceptance criteria and subsequent founder decisions take precedence where a mockup differs.

| Decision | Status | Direction / evidence |
| --- | --- | --- |
| D1 — Three connected outputs | Confirmed | User request: interactive model, parts list, instructions |
| D2 — Model-focused workspace | Implemented for UI preview | Sample canvas plus contextual controls and connected Model / Parts / Instructions views in [site/](site/) |
| D3 — Visual identity | References confirmed; execution proposed | R2 and R7 are the founder's primary references. Design translation above owns the interpretation; exact theme, palette tokens and typography remain open |
| D4 — First-release audience/object scope | Confirmed boundary | Nostalgic adults who cannot design from scratch; immediate consolidation supports limited simple objects from one clear image. Multiple-image reconstruction is deferred. Roadmap Q1–Q2 owns remaining scope choices |
| D5 — Complexity control | Confirmed control; presets proposed | Stepped slider with up to five levels; F6 owns labels, estimates and behavior |
| D6 — Canonical consumer Site | Implemented and published; single-photo prototype verified | The original workshop URL owns the public shell and all new authenticated generation/recovery. The earlier image-to-3D Site remains a legacy store with no migration in this slice |

## Maintenance

Use stable feature IDs in issues, PRs and tests. Change acceptance criteria alongside changed behavior; link implementation evidence instead of copying component names and route inventories here. Remove superseded proposals or mark their replacement. Update design decisions when references are accepted, not every time an asset is added. QA checks the affected criteria and reports both passing evidence and untested limits.
