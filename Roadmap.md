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

Defer arbitrary-object guarantees, moving mechanisms, unrestricted manual brick editing, collaborative editing inside the app, marketplace checkout, and photorealistic accuracy. Collaboration between the two developers is required now; multiplayer product features are a separate choice.

## Delivery phases

| Phase | Build and learn | Exit evidence |
| --- | --- | --- |
| P0 — Define and de-risk | Agree audience, representative objects, acceptable approximation, part scope and generation budget. Evaluate image reconstruction and a small brick conversion experiment. | Agreed benchmark inputs, documented failures, chosen initial approach and measurable quality/cost/time targets. |
| P1 — Brick foundation | Define the canonical brick model; use hand-authored fixtures to build the viewer, parts aggregation, connection checks and instruction playback. | The same fixture produces matching viewer, inventory and instructions; invalid fixtures fail validation. Clearly label fixtures as demonstrations. |
| P2 — Image conversion | Upload/preprocess images, reconstruct approximate geometry, fit allowed bricks, validate results, run generation asynchronously. | Real images produce traceable model revisions on the agreed benchmark; failures and uncertain geometry are visible; measured cost and timing satisfy P0 targets. |
| P3 — Complete user journey | Connect project flow, configuration, progress/recovery, model inspection, parts export, instructions, persistence and access control. | A user completes upload → generate → inspect → export → follow instructions; revisions stay consistent through retries and changes. |
| P4 — Physical pilot | Acquire parts and build representative models; test instructions with a person who did not design them; fix stability and sourcing gaps. | Physical build results and usability findings recorded; no unresolved release-blocking defects; scope claims match evidence. |
| P5 — Broaden deliberately | Add object categories, better packing, more parts, regional sourcing, printable instructions or richer editing according to evidence. | Each expansion has benchmark coverage and does not regress existing buildability, cost or usability gates. |

P1 can use fixtures while P0 research runs, but successful fixture playback is not evidence of image conversion. Product UI exploration can proceed independently of the reconstruction provider. Later phases depend on validated earlier contracts.

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
| Q1 | Fidelity expectation; audience resolved | Confirmed: nostalgic adults unable to design from scratch. Proposed: recognizable stylized builds | P0 exit |
| Q2 | Exact categories/photo count; general scope resolved | Confirmed: limited simple objects from a few images | P0 exit |
| Q3 | Inference provider/budget; hosting resolved | Confirmed: ChatGPT Sites. External generation approach and spending remain open | Paid integration/deployment |
| Q4 | Part universe and purchasing region | Ordinary bricks/plates; exact part/color inventory first | Catalog selection |
| Q5 | Calibrated complexity ranges, size limits and acceptable generation wait | Up to five slider levels confirmed (Product F6); calibrate piece ranges and effort on representative objects and novice trials | P0 exit |
| Q6 | Accounts and business model | Private projects; defer billing and public gallery | Persistence and launch scope |
| Q7 | Exact theme, typography and brand; references received | Product's reference register and design translation own the direction; R2 and R7 are the founder's favorites | Visual implementation |

## Keeping this useful

Update this document only when context, phase dependencies, gates or directional decisions change. Resolve questions in place with rationale and an issue/PR reference; do not maintain contradictory answers elsewhere. Record implementation detail in Architecture and feature acceptance criteria in Product. Move lengthy historical decisions into linked records when needed, rather than growing this file into a diary.
