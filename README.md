# LEGO Builder

Turn photos of an item into an interactive LEGO-brick model, a matching parts list, and step-by-step assembly instructions.

## Current build target

The LEGO conversion MVP accepts a clean `OBJ` or `STL` file and aims to produce a buildable model made from real catalog parts. It must export an LDraw model and an exact bill of materials that can be inspected in BrickLink Studio. The separately approved [image reconstruction pilot](reconstruction-site/README.md) implements photo upload, fal TRELLIS generation, neutral 3D preview, and GLB/OBJ downloads. A mesh preview does not establish LEGO conversion or buildability. See the Roadmap for the independent workstream and unchanged converter release gates.

The [integration workspace](reconstruction-site/README.md) connects real photo reconstruction, saved converter handoffs and LDraw model/parts/instruction inspection in one application. Prerak's converter execution is deferred: a ready mesh waits for the converter, while the owner can supply an LDraw file through the documented result interface to test the receiving side. A manually supplied result does not establish image conversion or buildability. The original [Sites UI preview](site/README.md) remains available as a separate sample-driven design prototype.

Start with the project documents:

- [Roadmap.md](Roadmap.md): context, delivery phases, release gates and open direction.
- [Architecture.md](Architecture.md): proposed stack, system design and engineering contracts.
- [Product.md](Product.md): features, pages, UX and reference-led design decisions.
- [site/README.md](site/README.md): UI preview, development commands and publication boundary.
- [AGENTS.md](AGENTS.md): Product, Architect, Developer and QA roles and collaboration rules.
- [research/image_to_brick_model_research.docx](research/image_to_brick_model_research.docx): research behind the selected conversion approach and tool choices.
- [agents/](agents/): detailed role briefs; runnable project configurations live in `.codex/agents/`.
- [references/](references/): shared UI inspiration, generated concept mockups, and candidate 3D input fixtures.

These documents distinguish proposals from confirmed requirements and implemented behavior. The [pilot README](reconstruction-site/README.md) contains executable setup and verification commands.

## Collaboration

Keep `main` stable. Work on short-lived personal or feature branches, publish changes through pull requests and have the other partner review before merging. When both partners need to edit the same section, use one active editor and one reviewer rather than making overlapping changes at the same time. The complete standing workflow is in [AGENTS.md](AGENTS.md#standing-branch-and-review-policy).
