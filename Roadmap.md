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

Confirmed audience: nostalgic adults interested in LEGO who cannot design a model from scratch. Confirmed input scope: a limited set of simple objects photographed from a few views. Confirmed hosting preference: ChatGPT Sites.

Confirmed configuration: a complexity slider with up to five levels. Product F6 owns the proposed labels, piece-count presentation and user behavior; Architecture owns the versioned preset contract. Object examples are pending founder input.

Proposed implementation boundary: compact, static display objects, a restricted catalog of ordinary bricks/plates, a limited color palette, and a small model size. Explain that hidden surfaces are inferred. Favor recognizable, buildable approximations and guided choices over expert modeling controls. Exact supported categories, photo count and fidelity targets remain open.

### Immediate MVP milestone

Confirmed: the team will first build and evaluate a local converter from a clean `OBJ` or `STL` model to a LEGO-brick assembly. This milestone starts with known 3D geometry so the team can isolate the central engineering risk: turning a target shape into a valid, recognizable and buildable arrangement of real parts.

The milestone outputs are a validated canonical placement model, LDraw `.ldr` or `.mpd` export, exact bill of materials, preview, bottom-up placement sequence and validation report. LDraw is the working geometry/interchange foundation; a restricted local catalog is used during solving; BrickLink Studio is the compatibility and inspection baseline. BrickLink/Rebrickable mappings and live sourcing are enrichment work, not prerequisites for the first successful conversion.

Defer photo reconstruction, the consumer web app, accounts, persistence, pricing and automated purchasing until this milestone passes its exit gate. This changes delivery order, not the long-term product promise.

Defer arbitrary-object guarantees, moving mechanisms, unrestricted manual brick editing, collaborative editing inside the app, marketplace checkout, and photorealistic accuracy. Collaboration between the two developers is required now; multiplayer product features are a separate choice.

## Delivery phases

| Phase | Build and learn | Exit evidence |
| --- | --- | --- |
| P0 — Mesh-to-brick MVP | Select 10 simple benchmark meshes and a versioned catalog of approximately 8–12 common brick/plate families. Implement normalization, anisotropic voxelization, part fitting, connection/seam repair, bottom-up sequencing, validation, LDraw export and bill-of-material generation. Test several target sizes and compare with BrickLink Studio Sculpture where practical. | Every released candidate imports into BrickLink Studio and has matching placements and inventory, valid catalog IDs/colors/orientations, no collisions or floating components, and a feasible MVP placement order. Record resemblance, parts, unique lots, runtime, validator failures and manual repairs for every candidate; physically build at least two difficult outputs. |
| P1 — Brick foundation and tools | Harden the canonical model and catalog, add deliberately invalid fixtures, improve solver search and structural checks, and build only the preview/inspection tooling needed to evaluate conversion results. | The same canonical revision produces matching preview, inventory and sequence; invalid fixtures fail the correct checks; the solver materially improves on the selected baseline for buildability, control or useful variants. |
| P2 — Image conversion | Upload/preprocess images, reconstruct approximate geometry, reduce it to the same target representation used by P0, then run the proven fitter and validators asynchronously. | Real images produce traceable model revisions on the agreed benchmark; failures and uncertain geometry are visible; measured cost and timing satisfy established targets. |
| P3 — Complete user journey | Connect project flow, configuration, progress/recovery, model inspection, parts export, instructions, persistence and access control. | A user completes upload → generate → inspect → export → follow instructions; revisions stay consistent through retries and changes. |
| P4 — Physical pilot | Acquire parts and build representative models; test instructions with a person who did not design them; fix stability and sourcing gaps. | Physical build results and usability findings recorded; no unresolved release-blocking defects; scope claims match evidence. |
| P5 — Broaden deliberately | Add object categories, better packing, more parts, regional sourcing, printable instructions or richer editing according to evidence. | Each expansion has benchmark coverage and does not regress existing buildability, cost or usability gates. |

P1 hardening can begin as the P0 converter stabilizes, but successful fixture conversion is not evidence of image conversion. Product UI exploration can proceed independently of the reconstruction provider. Later phases depend on validated earlier contracts.

For the immediate milestone, implementation order is: catalog and canonical placement schema; mesh normalization and voxelization; simple layer-based fitter; inventory and LDraw export; collision/connectivity/seam checks; placement sequence; benchmark harness; Studio imports and physical builds. Do not begin photo reconstruction merely because the converter produces attractive previews.

## Quality and release gates

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
| Q2 | Exact categories/photo count; general scope resolved | Confirmed: limited simple objects from a few images | P2 benchmark selection |
| Q3 | Inference provider/budget; hosting resolved | Confirmed: ChatGPT Sites. External generation approach and spending remain open | Paid integration/deployment |
| Q4 | Part universe and purchasing region | Immediate MVP: versioned LDraw-based catalog of approximately 8–12 common rectangular brick/plate families; exact part/color inventory first. Region remains open | Catalog expansion or sourcing integration |
| Q5 | Calibrated complexity ranges, size limits and acceptable generation wait | Calibrate mesh sizes and practical part limits during P0; up to five consumer slider levels remain confirmed for later UI work | P0 exit for converter limits; P3 for slider ranges |
| Q6 | Accounts and business model | Private projects; defer billing and public gallery | Persistence and launch scope |
| Q7 | Exact theme, typography and brand; references received | Product's reference register and design translation own the direction; R2 and R7 are the founder's favorites | Visual implementation |

## Keeping this useful

Update this document only when context, phase dependencies, gates or directional decisions change. Resolve questions in place with rationale and an issue/PR reference; do not maintain contradictory answers elsewhere. Record implementation detail in Architecture and feature acceptance criteria in Product. Move lengthy historical decisions into linked records when needed, rather than growing this file into a diary.
