# Product

Owner: Product. Purpose: user-facing behavior, feature acceptance and design direction. Delivery ordering is in [Roadmap](Roadmap.md); implementation contracts are in [Architecture](Architecture.md).

## Product promise

A user photographs an item, generates a LEGO-brick interpretation, inspects it in 3D, obtains an exact parts list and follows instructions to build that same model. The three outputs must agree. Photos cannot establish every hidden surface; communicate approximation and let the user judge the result before buying parts.

The confirmed audience is nostalgic adults who enjoy LEGO but cannot design models from scratch. The first release supports a limited set of simple objects from a few images. Help users succeed through guided photo capture, useful defaults and approachable instructions; do not assume knowledge of brick identifiers or modeling tools. Exact object categories and fidelity targets remain open in Roadmap Q1–Q2. Product success means a user can obtain and assemble a recognizable model, with clear limitations and manageable effort. A visually appealing preview alone is insufficient.

## Current MVP boundary

The confirmed immediate milestone is a developer-facing 3D-model converter, not the web app. Given one clean `OBJ` or `STL` model of a simple real-world object, it produces a LEGO-brick interpretation made only from an approved catalog of real parts. The result must include an LDraw model and an exact bill of materials and must open correctly in BrickLink Studio.

For this milestone, a simple object is one solid, static, mostly upright form without thin articulated parts, moving mechanisms or large unsupported overhangs. Start with controlled fixtures such as a bottle, vase, simple toy or simplified animal form. The source model is assumed to have already resolved the ambiguity of photographs; image capture, image-to-3D reconstruction, accounts, persistence, purchasing and the browser experience are outside this milestone.

The MVP is successful when a developer can run the same input and settings and receive a recognizable, catalog-valid, connected assembly that can be built from the bottom up. A good-looking render by itself is not success.

## Pages and user journey

Routes below describe conceptual screens, not frozen URL paths.

| Screen | User needs and primary action | Required states |
| --- | --- | --- |
| Welcome / start | Understand supported objects and see clearly labeled examples; start a project | First visit, sample preview, unsupported scope explanation |
| Projects | Find saved work and resume a particular revision | Empty, loading, populated, failed generation, access denied |
| New project / photos | Upload one or more views of the same item; review, reorder, label or remove photos | Upload progress, invalid/oversized file, interrupted upload, missing input |
| Build configuration | Choose complexity on a stepped slider (F6), review expected piece count and size; generate | Defaults, unavailable level, invalid combination, estimated versus actual quantities/cost |
| Generation | Understand the current stage and recover if needed | Queued, processing, cancel requested, failed with retry, complete |
| Model workspace | Rotate, zoom and pan; inspect dimensions, piece count, confidence/validation notes; open parts or instructions | Loading, ready, warnings, draft preview, renderer unavailable |
| Parts | See exact quantities by part/color and export a shopping list | Filter/search, unavailable mapping, unknown price, export failure |
| Instructions | Follow one manageable step at a time and resume progress | First step, active step, last step, saved progress, revision mismatch |

Model, Parts and Instructions may be tabs in a shared project workspace rather than disconnected pages. Keep project name, revision and validation state visible across all three. Accounts/access screens depend on Roadmap Q6; public sharing and checkout are not initial requirements.

## Feature acceptance criteria

### F0 — 3D model to brick assembly MVP

- Accept a valid `OBJ` or `STL` mesh, a target longest dimension in studs and a supported palette selection. Reject unreadable, empty or structurally unsuitable meshes with a useful reason.
- Normalize the input orientation and scale, then discretize it on a grid whose horizontal unit is one stud and vertical unit is one plate. Keep the chosen scale and transform in the output metadata.
- Use only parts, colors and orientations present in the versioned MVP catalog. The initial catalog is restricted to common rectangular bricks and plates; slopes, Technic elements, flexible parts and arbitrary-angle or sideways construction are deferred.
- Produce a connected assembly with no collisions, floating parts or unsupported placements under the MVP rules. Stagger weak seams where possible and produce a valid bottom-up placement order.
- Export an LDraw `.ldr` or `.mpd` file, an exact machine-readable bill of materials grouped by part and color, a preview and a validation report. Inventory totals must equal the exported placements.
- Import every release candidate into BrickLink Studio without missing-part or malformed-model errors. Physically build a small representative sample before describing the converter as producing buildable models.
- Compare candidates at more than one target size when useful and report resemblance, part count, unique lots, validation failures, runtime and any manual repairs. Do not hide failed candidates.

### F0 non-goals

- No photo upload or image-to-3D reconstruction.
- No web interface, user accounts, saved projects or background-job system.
- No promise to support every LEGO part, color, object or advanced construction technique.
- No live pricing, stock lookup, automatic purchasing or polished consumer instructions.

### F1 — Photo input and configuration

- The long-term product accepts one or more images; the first release guides users to provide a few views. Set the required minimum after reconstruction testing. Show visible previews and actionable validation errors.
- Explain helpful viewpoints, plain backgrounds and the need to photograph the same item; do not promise that more images always resolve reconstruction errors.
- Let the user review photos and configuration before starting generation.
- Present model dimensions with units. Explain that smaller models lose detail and piece limits can affect resemblance.
- Publish supported file, size and piece limits from application configuration, not duplicated hard-coded copy.

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

The following AI-generated screens translate the approved reference direction into a connected journey. They are discussion artifacts, not implemented UI or pixel-perfect requirements:

- [Upload and complexity](references/mockups/upload-and-complexity.png)
- [Interactive model workspace](references/mockups/model-workspace.png)
- [Build instructions](references/mockups/build-instructions.png)

Use them to evaluate hierarchy, staging, novice guidance, and consistency across the journey. Product acceptance criteria and subsequent founder decisions take precedence where a mockup differs.

| Decision | Status | Direction / evidence |
| --- | --- | --- |
| D1 — Three connected outputs | Confirmed | User request: interactive model, parts list, instructions |
| D2 — Model-focused workspace | Proposed | Canvas plus contextual controls; validate with references |
| D3 — Visual identity | References confirmed; execution proposed | R2 and R7 are the founder's primary references. Design translation above owns the interpretation; exact theme, palette tokens and typography remain open |
| D4 — First-release audience/object scope | Confirmed boundary | Nostalgic adults who cannot design from scratch; limited simple objects from a few images. Roadmap Q1–Q2 owns remaining scope choices |
| D5 — Complexity control | Confirmed control; presets proposed | Stepped slider with up to five levels; F6 owns labels, estimates and behavior |

## Maintenance

Use stable feature IDs in issues, PRs and tests. Change acceptance criteria alongside changed behavior; link implementation evidence instead of copying component names and route inventories here. Remove superseded proposals or mark their replacement. Update design decisions when references are accepted, not every time an asset is added. QA checks the affected criteria and reports both passing evidence and untested limits.
