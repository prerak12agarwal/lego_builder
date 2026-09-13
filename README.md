# LEGO Builder

Turn photos of an item into an interactive LEGO-brick model, a matching parts list, and step-by-step assembly instructions.

## Current build target

The immediate MVP deliberately starts one step later than the long-term product: it accepts a clean `OBJ` or `STL` file and converts it into a buildable model made from real catalog parts. It must export an LDraw model and an exact bill of materials that can be inspected in BrickLink Studio. Photo reconstruction and the web app are deferred until this converter is proven.

Start with the project documents:

- [Roadmap.md](Roadmap.md): context, delivery phases, release gates and open direction.
- [Architecture.md](Architecture.md): proposed stack, system design and engineering contracts.
- [Product.md](Product.md): features, pages, UX and reference-led design decisions.
- [AGENTS.md](AGENTS.md): Product, Architect, Developer and QA roles and collaboration rules.
- [research/image_to_brick_model_research.docx](research/image_to_brick_model_research.docx): research behind the selected conversion approach and tool choices.

These documents distinguish proposals from confirmed requirements and implemented behavior. Consult code, manifests and CI for executable setup once the app is scaffolded.
