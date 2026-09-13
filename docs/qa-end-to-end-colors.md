# End-to-end reconstructed-color QA

## Scope and tested state

Independent QA reviewed the combined colored reconstruction, portable OBJ, paired color-conversion, LDraw, inventory and draft-instruction implementation on `codex/end-to-end-colors`. The tested state is based on `13fc991a36a0c9f5e68c9ec56f9cc44a3d66814e` plus the completed working-tree implementation. Its aggregate SHA-256 over the 21 affected implementation and regression-test files is `939653676e07eb5f7a24f159a6acdae2b1aebfc3923cef5c73bc3a15a06c4179`.

Critical reviewed source fingerprints are:

- `lego_builder/source_color.py`: `bdd5f9ffc8859e6e2f5b9c17784090344fda2d86f6f0974913e511b5f79d2241`
- `site/core/src/obj-bundle.ts`: `fe6f91118735db2b7e3205ddf3fe5f5edd252c659d1926bb14ac94e141c9da62`
- `site/lib/conversion-contract.ts`: `7920a9e75c5014da9e87f143b5454d8b946cd16c9f552ba0e4dfeb8be4d05532`
- `site/lib/conversions.ts`: `377c81df96d3b8eeb04504e366ff31ce46c04bd0305b99b3cb4fca55e5174b04`
- `site/lib/jobs.ts`: `01c5a6082fffe619949f0237945094082f289d946ae9057f918decd87443a49b`

The review read the accepted Product F8, Roadmap P0/P2/P3 gates and Architecture paired-appearance, manufactured-palette and canonical-colored-revision contracts. It traced the actual source and exercised exact GLB/OBJ hash binding, geometry parity, texture and vertex-color sampling, color-space multiplication, color-aware part fitting, reviewed part/color legality, output reconciliation, legacy behavior and failure paths.

## Findings and resolution

One P1 defect was found before the final run. The Site receiver initially accepted any printable palette name and any sorted LDraw code from 0 through 511 when the supplied summary matched the LDR. A direct reproduction successfully parsed palette `not-a-real-palette`, color `511` and part `9999.dat`, which could have published an unmanufactured result before browser dependency failure.

The implementation was corrected before this recommendation. The receiver now pins `source-solid-palette-v1`, restricts its color codes to the eight reviewed source colors, validates every root LDraw part/color combination against a generated server-known table, and rejects a mismatched summary. `scripts/sync_color_catalog.mjs --check` proved the Site table matches both reviewed Python evidence files. The original adversarial payload now fails with `The converter returned an unsupported color palette.` Tests also reject code 511, part 9999 and red/blue 3039 slope lots.

No P1 or P2 defects remain open in the tested source.

## Independent results

- `/tmp/lego-workshop-python/bin/python -m pytest` passed all 132 Python tests on Python 3.12.14. The first sandboxed run passed 126 and could not bind the six localhost HTTP fixtures; rerunning with ephemeral localhost socket access passed 132/132. Coverage includes paired-v2 hashes, malformed appearance, geometry mismatch, continuous UV-interior sampling, sampler wrapping, reflected transforms, linear-space material/texture/vertex-color multiplication, resource caps, deterministic palette selection, color-boundary subdivision, reviewed lot fallback, output caps and the real service worker.
- `npm test` passed all 103 Site tests on Node 24.11.0. Coverage includes ordinary GLB retention, portable OBJ/MTL/texture ZIPs, strict colored-result receipt, neutral-downgrade rejection, wrong GLB/hash rejection, idempotency, ownership, immutable publication, deletion races, LDraw parsing, inventory and instruction consistency.
- `npm run typecheck`, `scripts/sync_color_catalog.mjs --check` and `git diff --check` passed.
- The synthetic service fixture retained exact OBJ SHA-256 `937cc599c9b01728056ce5d3ef233492d97bcc25c5eb3e5265edeb16eaba134c` and GLB SHA-256 `f57891bed65723534fbf066815c8e17fbc2822b3e8cc2f5db475d6abd724cf5d` through its paired-v2 request and response. Its resulting LDR (`df76ddc9d8c4e3cdfb6d86e5abb60958ddf8d35d0e1772f0269c7354242bc50e`) contains 430 placements, six part/color lots, blue and red codes `[1, 4]`, and 27 nonempty draft steps. LDR lots, Python inventory and final cumulative instruction membership agree exactly.
- The real TRELLIS-reference derivative used for bounded QA has source GLB SHA-256 `186f05c40465650692c0155f4e6e5705fa9cb59657a8fa8bf9c09093f1dbdf00` and exact geometry OBJ SHA-256 `4d532f4cd73a43b68f969443a4dc236faed8fc3f5078779abf586935419354a9`. It is derived from the official TRELLIS mushroom example by retaining every twentieth triangle to fit the existing cap; it is not a new inference or a generalized quality benchmark.
- That retained provider-reference appearance converted to 2,067 placements, 40 reviewed part/color lots, colors `[0, 2, 4, 14, 71, 72]`, and 50 nonempty draft steps. The LDR (`c495d6e01f435403c082f628bbc5b729ce731492147a851582be8411a4a6a46b`) matches `model.json`, JSON inventory, CSV inventory and all exactly-once instruction placement membership by part and color. Catalog validation passed and the candidate met its 1,800–2,200 target band.
- The independently inspected portable ZIP (`9cdfd77a47387fea1ea9468f27aa1b6ed10577da36e100161917bddba6002358`) contains only `model.obj`, `model.mtl`, `textures/0.png`, `README.txt` and `manifest.json`. Its 19,476 vertices and 7,043 faces match the exact geometry-only OBJ, its image bytes match the embedded GLB image, its MTL links that texture, and the manifest binds the source GLB hash.
- Source inspection and negative tests confirm malformed or mismatched appearance fails instead of silently falling back to neutral. New appearance-preserving jobs create source-color requests; legacy and appearance-absent jobs keep their prior neutral behavior. Converter retry reuses the retained reconstruction and does not submit another paid TRELLIS request.
- Primary integration browser evidence was reviewed after the source checks. A local red-center/blue-surround textured cube rendered the same two colors in the reconstructed mesh and the 430-piece LDraw result. Model, Parts and every draft step loaded from the saved LDR; the six displayed lots totaled 430, step 1 showed 67 pieces, and step 27 showed 430/430 with Next disabled. This supports the UI integration but is not hosted-deployment evidence.

## Limits and recommendation

No paid generation was run. The real retained TRELLIS derivative establishes format and algorithm compatibility, not source-photo color fidelity, hidden-surface accuracy or representative object quality. No BrickLink Studio import or physical assembly was performed. Collision, connectivity, clutch, insertion order, stability and physical buildability remain explicitly unevaluated; the UI must continue to call the sequence draft instructions and the colors approximate manufactured matches.

Release recommendation: **pass for merge and deployment of the tested integration source**. After deployment, verify that the public Workshop and configured converter report the intended revisions and run a read-only hosted smoke check. Do not claim a new live image inference, exact photographic color recovery or physical buildability from this evidence.
