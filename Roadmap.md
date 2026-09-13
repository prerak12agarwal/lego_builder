# Roadmap

Owner: Product. Purpose: enduring context, delivery sequence, and release gates.

## Context and source of truth

Turn one or more photos of an item into a recognizable LEGO-brick model that users can inspect in 3D, source parts for, and assemble using step-by-step instructions.

| Document | Owns |
| --- | --- |
| [Roadmap](Roadmap.md) | Why, phases, dependencies, release gates, unresolved direction |
| [Product](Product.md) | User experience, features, acceptance criteria, design decisions |
| [Architecture](Architecture.md) | System boundaries, data contracts, engineering decisions |
| [Agent guide](AGENTS.md) | Roles, handoffs, collaboration and documentation rules |

Use Git history for changes, issues/PRs for task progress, and executable code/tests for implemented behavior. Do not duplicate a changing task backlog here. Phase completion requires linked evidence, not elapsed time. No release dates or budgets are committed yet.

## Decision vocabulary

- Confirmed: explicitly requested or accepted by the founders.
- Proposed: a working recommendation that can change without implying a broken commitment.
- Open: a consequential choice needing evidence or founder input.
- Implemented: backed by code and verification; link the evidence when making this claim.

Confirmed scope: photo input; interactive brick model; brick shopping list; assembly instructions. Initial baseline (2026-09-13): documentation only; no application or generation pipeline exists. This baseline is historical, not a live progress report.

## First-release boundary

Confirmed audience: nostalgic adults interested in LEGO who cannot design a model from scratch. Confirmed immediate input scope: a limited set of simple objects from one clear photo. Multiple-image reconstruction is deferred until after the unified single-image workflow. Confirmed hosting preference: ChatGPT Sites.

Confirmed configuration: a complexity slider with up to five levels. Product F6 owns the proposed labels, piece-count presentation and user behavior; Architecture owns the versioned preset contract. Object examples are pending founder input.

Proposed implementation boundary: compact, static display objects, a restricted catalog of ordinary bricks/plates, a limited color palette, and a small model size. Explain that hidden surfaces are inferred. Favor recognizable, buildable approximations and guided choices over expert modeling controls. Exact supported categories, photo count and fidelity targets remain open.

### Immediate MVP milestone

The initial slice built a local converter from a clean `OBJ` or `STL` model to a LEGO-brick assembly. The current shared exterior workflow accepts OBJ geometry and broadens part fitting while preserving that baseline. Both start with known 3D geometry to isolate the central engineering risk: turning a target shape into a valid, recognizable and buildable arrangement of real parts.

The established baseline exports validated canonical placements, LDraw, exact inventory, a preview, bottom-up order and a validation report. The general exterior workflow exports a canonical digital candidate, LDraw, exact inventory, a preview and explicit validation states; unverified grouping is not an assembly order. LDraw is the shared geometry/interchange foundation, with versioned supported fitting families and manufactured-color evidence. BrickLink Studio remains the compatibility and inspection baseline; live sourcing is later enrichment.

The first development slice uses the supplied house, cat and airplane meshes in `references/3d-objects/`. The cat is the solid-mesh baseline, although its tail and limbs still challenge bottom-up placement. The house probes open or inconsistently wound input, while the airplane probes thin sections and spans near or beyond the immediate support boundary. The house `OBJ` and `STL` are one shape used to check input-format parity. Product F0 defines how successes, rejections, derived inputs and manual repairs are reported. These three shapes start the benchmark; they do not replace the ten-shape P0 exit set.

Confirmed shared workflow: accept OBJ geometry of different subjects, recover the exterior while ignoring enclosed internal detail, fit real LEGO parts and export LDraw. The current Cybertruck OBJ and gray Cybertruck images are the immediate quality benchmark, targeting about 2,000 required pieces; the architecture must also run the general path on a cat, bottle and other shapes without vehicle-specific names. The team owns exterior recovery from imperfect input. Useful vehicle and surface-shaping parts include slopes, wedges, tiles, wheels and tires. Hidden structure may support the model inside its envelope; external stands remain excluded. Product F0 owns the exact reference cues and piece-count interpretation.

The initial rectangular implementation handoff is an engineering prototype; its source-acceptance benchmark does not establish general exterior input limits or the P0 exit. The full benchmark, Studio import and physical-build gates remain required for buildability claims.

Photo reconstruction and the consumer web app remain outside this converter milestone. Their separately gated implementation may proceed in the canonical workshop without claiming that P0 has passed. The sample workbench uses explicitly labeled sample data and does not satisfy P0–P4 exit gates. Full account management, pricing and automated purchasing remain deferred; owner-private job listing and recovery are included because paid processing must survive refresh and return visits. This preserves the long-term product promise without weakening the mesh-to-brick exit gate.

Defer arbitrary-object guarantees, moving mechanisms, unrestricted manual brick editing, collaborative editing inside the app, marketplace checkout, and photorealistic accuracy. The immediate converter is shape-only: it does not add stands, plinths or external support structures to rescue unsupported geometry. Collaboration between the two developers is required now; multiplayer product features are a separate choice.

## Delivery phases

| Phase | Build and learn | Exit evidence |
| --- | --- | --- |
| P0 — Mesh-to-brick MVP | Retain the ten-shape release benchmark and established rectangular baseline. Exercise general OBJ exterior recovery and broader supported part fitting across distinct subjects. Implement normalization, discretization, fitting, applicable structural and sequence validation, LDraw export and exact inventory; distinguish digital candidates from validated assemblies. Test several target sizes and compare with BrickLink Studio Sculpture where practical. | Every released candidate imports into BrickLink Studio and has matching placements and inventory, valid catalog IDs/colors/orientations, no collisions or floating components, and a feasible MVP placement order. Record resemblance, parts, unique lots, runtime, validator failures and manual repairs for every candidate; physically build at least two difficult outputs. |
| P1 — Brick foundation and tools | Harden the canonical model and catalog, add deliberately invalid fixtures, improve solver search and structural checks, and build only the preview/inspection tooling needed to evaluate conversion results. | The same canonical revision produces matching preview, inventory and sequence; invalid fixtures fail the correct checks; the solver materially improves on the selected baseline for buildability, control or useful variants. |
| P2 — Image conversion | Upload/preprocess images, reconstruct approximate geometry, reduce it to the same target representation used by P0, then run the proven fitter and validators asynchronously. | Real images produce traceable model revisions on the agreed benchmark; failures and uncertain geometry are visible; measured cost and timing satisfy established targets. |
| P3 — Complete user journey | Connect project flow, configuration, progress/recovery, model inspection, parts export, instructions, persistence and access control. | A user completes upload → generate → inspect → export → follow instructions; revisions stay consistent through retries and changes. |
| P4 — Physical pilot | Acquire parts and build representative models; test instructions with a person who did not design them; fix stability and sourcing gaps. | Physical build results and usability findings recorded; no unresolved release-blocking defects; scope claims match evidence. |
| P5 — Broaden deliberately | Add object categories, better packing, more parts, regional sourcing, printable instructions or richer editing according to evidence. | Each expansion has benchmark coverage and does not regress existing buildability, cost or usability gates. |

P1 hardening can begin as the P0 converter stabilizes, but successful fixture conversion is not evidence of image conversion. Product UI exploration can proceed independently of the reconstruction provider. Later phases depend on validated earlier contracts.

For the immediate milestone, implementation order is: catalog and canonical placement schema; mesh normalization and voxelization; simple layer-based fitter; inventory and LDraw export; collision/connectivity/seam checks; placement sequence; benchmark harness; Studio imports and physical builds. Attractive previews from either workstream do not count as converter evidence.

### Approved quick photo-to-mesh MVP

Confirmed direction: the first image-stage output is an ordinary reconstructed 3D mesh intended for the existing mesh-to-LEGO converter, not a finished LEGO model. The current integration remains single-image; multiple-image reconstruction is deferred until after consolidation. No numeric generation target is approved; a representative benchmark is still pending.

Confirmed MVP provider direction: use the fal-hosted original TRELLIS model, `fal-ai/trellis`. Key configuration and one funded local bottle inference are verified. This single result does not establish hosted behavior, general output quality or latency.

Approved MVP scope is a narrow single-image upload → real generation → interactive neutral `GLB` preview → reusable geometry-only `OBJ` and manifest handoff. A successful result must be the user's returned mesh, with inferred hidden surfaces and unknown real-world scale disclosed. Actual converter compatibility requires validation. Failures, uncertain geometry, and provider limitations remain visible. Minimum private per-user jobs and artifact storage support secure processing and recovery, while full account management and project-library UX remain outside this slice.

Pilot exception: provider generation may continue after the user closes the site, but result collection occurs only when the user requests the job again by reopening or refreshing it. Autonomous background collection is not part of this pilot. Production readiness retains the stronger gate for reliable server-side completion collection, expiry, and recovery within the approved retention policy.

Current implementation status: source exists for normalized single-image upload, private per-user jobs, centralized pilot quotas, duplicate-submit protection, request-driven reopen recovery, saved source reuse, prior-ready navigation, neutral interactive preview, and private `GLB`/`OBJ`/manifest downloads with bounds and unknown-scale disclosure. App files are retained until user removal. Provider requests ask for private access, no fal input/output storage, and 24-hour output expiry; unfinished cancellation may still be charged.

One local live bottle run completed through browser upload, fal, stored ready state, neutral preview, refresh recovery and authenticated downloads in 64.966 seconds. Download hashes matched the manifest and the downloaded `GLB` reproduced the `OBJ` exactly. This is one observation, not a median or general quality claim. Twenty-five synthetic checks, type checking and the production build also passed. See [the bottle smoke test](reconstruction-site/test/live-evidence.md). Version 1 of the owner-private [pilot site](https://lego-builder-image-to-3d.dragonjjk.chatgpt.site) published successfully. Hosted inference and identity/storage, repeated latency, broader object quality, provider retention guarantees and converter suitability remain open.

This workstream may prototype the upstream portion of P2 while P0/P1 milestones and their buildability gates remain valid. It does not satisfy P2 or P3 exit evidence by itself and must not imply LEGO conversion, parts, instructions, structural validity, or physical buildability. Hosted evidence, representative quality, cost, verified privacy/retention behavior, timeout, and measured latency targets remain gates before production integration. Product F1 defines the approved MVP journey and criteria.

The canonical workshop shell remains public without login, including its hand-authored sample and founder-approved browser-local LDraw inspection (Product F7). Paid generation and private project recovery require authenticated ownership. This tooling does not satisfy converter, Studio compatibility or physical assembly release gates.

The shared exterior converter and Cybertruck design are P0 work. The shared pipeline must be implemented and exercised on different subjects during this milestone; it is not deferred until after a one-off vehicle export. Success on these fixtures does not guarantee impressive results for every possible mesh or universal use of every LEGO part. Digital candidates require LDraw, inventory and artifact checks; assembly and physical-build claims need their corresponding evidence.

### Confirmed unified pipeline integration slice

Confirmed founder direction: make [the original workshop Site](https://lego-builder-workshop.dragonjjk.chatgpt.site/) the canonical destination for the existing single-image upload, fal-hosted original TRELLIS, retained OBJ, the existing generic Python converter, private project recovery and LDraw model/parts/instructions inspection. Preserve its established workshop styling, sample workbench and local Admin LDraw inspection. Product F8 owns the acceptance criteria. Preserve the implemented manual handoff while adding an authenticated, bounded HTTPS Python execution boundary; new generic requests target about 2,000 parts, retain explicit orientation and remain distinct from legacy size-based handoffs. Multiple-image reconstruction remains deferred follow-on work.

The separate [image-to-3D pilot](https://lego-builder-image-to-3d.dragonjjk.chatgpt.site/) remains available for its existing jobs. This slice does not migrate or delete its D1/R2 records. New jobs use the canonical workshop's owner-checked D1/R2 bindings, and My projects recovers those workshop-owned jobs only. A future cross-Site migration requires its own approval, data mapping, ownership proof, rollback and verification plan.

Present in source: the existing reconstruction job and private artifact storage now persist an owner-scoped awaiting-converter request automatically for a ready mesh. Its saved URL and hashes bind the mesh, settings and immutable result slot. The owner-only receiver can accept a matching root `.ldr` and open its model, derived parts and nonempty authored steps in the same consumer workspace; missing steps stay visible and are never inferred. Prior results remain available when a new request is pending. This manual receiver validates the future adapter surface only and does not establish image conversion, canonical-model validity or buildability.

Confirmed instruction slice: the generic Python converter authors deterministic draft layer boundaries for generated results before LDraw publication. Exact membership, nonempty steps and final cumulative equality with Model and Parts are hard acceptance checks. The workshop labels the sequence as draft because connection access, intermediate support, stability and physical buildability remain unverified. Missing or inconsistent steps leave Model and Parts inspectable but keep Instructions and complete-pipeline status unavailable; the browser does not infer steps, and the Admin importer retains its existing missing-boundary behavior. The exporter and draft label are implemented with [independent consistency evidence](docs/qa-draft-instructions.md). The published Workshop completed the approved bottle pipeline with 2,137 pieces, 21 lots and 160 draft steps; Parts and the final step agree and the saved result survives refresh. [Hosted verification](docs/workshop-publication.md) records the deployed Sites and Railway revisions.

Automatic dispatch and the authenticated Railway Python service are implemented and deployed. A real saved image-derived OBJ-to-LDraw run passed on the canonical Workshop; its bounded [hosted evidence](docs/workshop-publication.md) is separate from source checks. Confirmed access policy: every signed-in ChatGPT user may generate and use the full workflow. Consolidation must prove that New project opens the real one-photo flow on the workshop origin, sign-in returns the user to the intended operation, My projects can resume only that owner’s current/latest and prior ready workshop jobs without claiming a full library, and public sample/Admin-local use cannot invoke paid work or expose private records. Existing per-user and site-wide quotas remain unchanged. The application requires server-only provider/converter configuration, access to the target workshop Sites project and persistent D1/R2 bindings owned by that project. The target workshop project is accessible, its unified `/build` source and private API boundary are implemented, and local verification passes. Source checks are recorded in [workshop integration QA](site/test/workshop-evidence.md); publication and hosted pipeline behavior are recorded in [Workshop publication evidence](docs/workshop-publication.md). That hosted run predates the all-signed-in access policy and does not establish its implementation. Earlier [pipeline QA](reconstruction-site/test/pipeline-evidence.md) covers the manual receiving slice only. The photo, source checksum, returned OBJ, settings and returned LDraw must remain linked through an actual converter run without repeating paid reconstruction.

This vertical slice advances P2 and P3 but does not reorder or waive their dependencies: the converter still has to satisfy P0/P1 validity and consistency gates, image reconstruction needs representative quality/latency/cost evidence, and physical buildability still requires P4 evidence. A connected demo with valid draft steps may be labeled as a complete pipeline prototype; it is not a validated build or complete product release until those gates pass.

## Quality and release gates

These are release gates for the complete product and validated assemblies. Development digital candidates retain their explicitly failed or unperformed checks and cannot be presented as meeting these gates.

- Every delivered model uses valid part/color combinations from a versioned catalog.
- Viewer, parts list and assembly sequence reference the exact same immutable revision.
- No overlapping placements, unexplained floating parts or omitted/duplicated instruction placements.
- Connectivity checks and simulated assembly are recorded separately from physical build evidence; neither alone proves stability.
- Unsuccessful generation does not appear as a successful model; preserve user inputs and offer actionable recovery.
- Benchmark resemblance, valid-model rate, physical-build success, instruction completion, generation latency and cost per successful result. Product owns agreed thresholds; none are asserted yet.
- Permission boundaries, upload handling, deletion and browser/device behavior are tested before external pilot use.

## Direction questions

| ID | Open decision | Working proposal | Resolve before |
| --- | --- | --- | --- |
| Q1 | Fidelity expectation; audience resolved | Confirmed: nostalgic adults unable to design from scratch. Proposed: recognizable stylized builds | Set the mesh benchmark target for P0; finalize the consumer promise before P2 exit |
| Q2 | Exact categories open; immediate photo count resolved | Confirmed immediate workshop input: one clear photo. Multiple-image reconstruction is deferred until after the single-image consolidation. The local OBJ exterior converter is independent of photo categories | Revisit after unified single-image acceptance; P2 benchmark selection |
| Q3 | Inference provider resolved for current MVP; production evidence open | Confirmed: ChatGPT Sites, a reusable ordinary mesh, and fal-hosted original TRELLIS (`fal-ai/trellis`) for the single-image MVP. Local and canonical Workshop bottle generations succeeded, including saved-result recovery; provider retention guarantees, representative quality and spending evidence remain open | Production integration or broader quality claim |
| Q4 | Part universe and purchasing region | Confirmed expansion: broad LDraw discovery, with fitting strategies and manufactured-color evidence for each supported part family. The original 8–12 rectangular families remain the legacy baseline. Region remains open | Each catalog expansion or sourcing integration |
| Q5 | Calibrated complexity ranges, size limits and acceptable generation wait | Confirmed: optimize for both delivery speed and user-visible generation speed. Proposed benchmark question: can the chosen baseline reach a median of 60 seconds or less from upload start to usable viewer, with slower jobs reported separately? This is unmeasured and not a release promise. Calibrate mesh sizes and practical part limits during P0; up to five consumer slider levels remain confirmed for later UI work | Live image latency claim; P0 exit for converter limits; P3 for slider ranges |
| Q6 | Accounts and business model | Private projects; defer billing and public gallery | Persistence and launch scope |
| Q7 | Exact theme, typography and brand; references received | Product's reference register and design translation own the direction; R2 and R7 are the founder's favorites | Visual implementation |
| Q8 | Integrated runtime provisioning, timing and recovery evidence | Accepted boundary: authenticated HTTPS Python service called by owner-authorized Sites routes, preserving source/settings hashes and completed stages. Runtime hosting, target-Site access and measured timeout/recovery behavior need deployment evidence | Hosted end-to-end claim |

## Keeping this useful

Update this document only when context, phase dependencies, gates or directional decisions change. Resolve questions in place with rationale and an issue/PR reference; do not maintain contradictory answers elsewhere. Record implementation detail in Architecture and feature acceptance criteria in Product. Move lengthy historical decisions into linked records when needed, rather than growing this file into a diary.
