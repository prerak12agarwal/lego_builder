# TRELLIS color-preservation QA

## Scope and tested state

Independent QA reviewed the completed Workshop appearance-preservation change on `codex/trellis-color`, based on `907f1eedc033a633304d9c23d35d9985991639d1` plus the uncommitted combined implementation. The review covers the ordinary reconstructed-mesh preview and downloads only. It does not cover color transfer to the geometry-only OBJ, Python converter, LEGO parts, inventory, or instructions.

The product implementation reviewed had these SHA-256 fingerprints:

- `site/core/src/glb.ts`: `872fff8cf1387592b25555314e25e90f3f7dd31390e2b342d5fca0f2461ed67f`
- `site/core/src/texture-image.ts`: `64a9c64433c49b8fdecca0bf28bae19cbd63ae2e6faa26769ed065a8ffdd996a`
- `site/lib/jobs.ts`: `a501c7c234c769342bb13095c3e9707134bf9fb86e6fae4e48534ecf195d37ec`
- `site/app/model-viewer.tsx`: `3cf8a4cd7c33596a84eea660d22f329f565cdbd4523aebd72082d5ba1c353717`
- `site/app/build/workspace.tsx`: `34cec197dc2fb7458f0be2a657235c7ba18a73f0cc78d8febc8c5a9c04388d8a`
- `site/components/pipeline-workspace.tsx`: `9be6d380b9252fa0d38d8ec25afdc6fc1dd5141f328013110d63fa676ff0ee52`
- `site/lib/limits.ts`: `1e1ef1ffadb237a513f973d604d40fe5cada4f8f634f3552f316ea18fd08eb49`

The implementation and regression tests were read against Product F1/F8 and the accepted Architecture appearance contract. The review traced the selected-scene graph and canonical index remapping, material/texture/image reachability, numeric and transform checks, image limits and parsing, job publication order, owner-gated artifacts, manifest hashes, viewer material fallback and cleanup, and the separate GLB/OBJ download meanings.

## Independent results

No P1 or P2 defects were found.

- `npm test` passed all 96 tests. This includes selected-scene/resource remapping, supported PBR slots and vertex colors, authored white material handling, transformed/reflected scenes, hostile extensions and references, finite/range checks, texture amplification limits, PNG inflation and CRC failures, JPEG structural bounds, owner isolation, leases/deletion races, collection-before-ready, artifact hashes, canonical re-export, and no paid resubmission on reopen/download.
- `npm run typecheck` passed.
- `git diff --check` passed at the reviewed state.
- The source synthetic fixture `/tmp/lego-color-qa.glb` (`1aebe3a983eb80469a28f037fa2c7518a6af59eb21ce88f1ff2e9a6cc89153cc`) canonicalized to `/tmp/lego-color-qa-canonical.glb` (`7cba033f3d03419dd9046aed5621ac9a78c15ff838a0434ebd99512bebacc750`). It retained its exact 79-byte PNG (`97e0abf9bf56fcd5a69cc4a3ac7fd7a9c757f3d337ac6b4f0ca64689bcb4ec82`), reported `appearance.status: preserved`, and reproduced the same OBJ and bounds after canonical revalidation.
- The explicitly QA-derived TRELLIS sample `/tmp/trellis-color-derived-qa.glb` (`a9baeaf3c7300e8edcb7d1ce4c73aaff7033f73b9b202d555a8e507797e4cf57`) passed canonicalization at 19,476 vertices and 7,043 triangles. Its one 4,716,400-byte, 2048-pixel-edge PNG retained SHA-256 `28119af231e9c1614a5d3313defb563ef29ec896686b3d77651c0499928c64c7`; bounded streaming inflation passed. Revalidating the saved canonical GLB reproduced the same OBJ and bounds. This derivative keeps every twentieth triangle for bounded QA and is evidence of compatibility with retained provider output, not a new inference or a quality benchmark.
- In the local browser fixture, the canonical synthetic cube visibly rendered distinct red, green, blue, and yellow areas. Pointer-accessible rotate, zoom in, and fit/reset controls changed the view and retained color. Focusing the canvas and pressing an arrow key panned the view, with a visible focus indicator and the canvas text alternative exposed. The fixture identified itself as synthetic rather than generated output.
- Source review confirmed the viewer keeps authored materials, texture maps, alpha behavior, and vertex colors; applies the neutral material only to primitives without a material or `COLOR_0`; generates normals only when absent; blocks non-blob resource resolution; converts texture load failure to the recoverable preview error; and de-duplicates geometry, material, texture, and bitmap disposal across failure, replacement, stopped loads, and unmount.
- Source and job tests confirmed embedded image validation completes before R2 artifact publication and the D1 ready transition. Saved GLB, OBJ, manifest, provider GLB, and normalized source hashes retain distinct meanings. Reopen and artifact download paths do not call provider submission. Private artifact reads remain owner-scoped, while deletion and lease races cannot publish a ready result after ownership is revoked.
- The Workshop labels an appearance-bearing artifact as a color GLB and the converter input as a geometry-only OBJ. Absent and legacy appearance states have separate text. The change does not alter the converter's `objSha256` binding or claim color in LEGO output.

The primary agent separately reported that the Sites production build passed after removing the temporary `/color-qa` page and API fixture, and that the resulting route list excludes them. That build result is supporting integration evidence rather than an independently rerun QA check.

## Limits and recommendation

No new paid TRELLIS inference was run. The retained TRELLIS-derived texture is useful compatibility evidence, but it does not establish source-photo color fidelity, hidden-surface accuracy, general object quality, hosted storage behavior, provider retention guarantees, latency, cost, or a newly deployed colored result. Browser inspection used the synthetic texture fixture; a malformed-texture browser failure was not independently repeated after the temporary route was removed, although the failure branch and cleanup were reviewed and malformed appearance is covered before ready for PNG collection. No physical build was performed, and this change provides no LEGO buildability evidence.

Release recommendation: **pass for publication of the scoped Workshop appearance-preservation change**, with the limits above kept explicit. Do not describe this as colored LEGO conversion, verified physical buildability, exact color recovery, or a new live provider-generation result.
