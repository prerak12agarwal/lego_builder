# Cybertruck exterior digital candidate

[Open the LDraw model](model.ldr) · [Interactive actual-part preview](preview.html) · [Parts CSV](bom.csv)

**2,069 pieces · 23 physical part types · 45 part/color lots · approximately 52.0 × 19.7 × 16.7 cm.** The source body is scaled to 64 studs; the final dimensions include the actual tires, bumpers and rotated part geometry.

![Actual LDraw geometry, front three-quarter](front-three-quarter.png)

This candidate fits the exterior groups of the founder-supplied Cybertruck OBJ and uses the supplied images as visual guidance. It omits source seats, steering wheel, dashboard and other internal groups. The result uses tiled side/hood/roof panels, dark glazing, wedge and slope pieces, brackets, real separate rims and tires, angular arches, rocker trim, an open bed and front/rear light bars. Hidden shell backing and chassis members support the design intent; no stand or external support structure is included.

This is the explicitly **source-specific panel-fitting experiment**. The [general geometry-only converter](../generic/README.md) separately processes this same OBJ and other subjects without named groups or vehicle templates. The two paths share the catalog, canonical placement contract, LDraw export, inventory and actual-part renderer.

## Reproduce

Run from the repository root with the installed project and bundled official part subset:

```sh
.venv/bin/python -m lego_builder convert-exterior references/3d-objects/cybertruck.obj --length 64 --tire 45982 --side-tile-length 3 --output outputs/cybertruck-reproduction
.venv/bin/python -m lego_builder validate outputs/cybertruck-reproduction
```

Use a new output directory. No model assets or images are uploaded by conversion. The original input remains unchanged.

- Canonical revision: `f172ee1f380d411589f1aedcdfc46fee58170d5df7f238ab1273fb0cd4c12751`
- Original OBJ SHA-256: `7c147bef624baf9c278da9d8701c6f7fb8b13438cc2b7d6c37f68c316f12436a`
- LDraw SHA-256: `a7f02ab1c59eb08a51b39c32040d5f212240911ef2377d6ff16036528f2aa82a`

## Inspection and limits

Digital checks passed for proper rigid transforms, official part geometry, evidence for the 45 manufactured part/color combinations, matching inventories, component membership and exact LDraw round-trip. BrickLink Studio 2.26.8 imported this exact file and displayed 2,069 total parts without a missing-part dialog; [import evidence](studio-import.png) records the result. This is compatibility and count evidence only.

[Side view](side.png) and [rear three-quarter view](rear-three-quarter.png) show the same canonical geometry. The front and side images are canvas PNG exports; the rear and Studio images are application screenshots. These images are actual part renders, not image-generated concept art. Attribution and exact dependency hashes are embedded in the model and preview.

The model remains a **digital exterior candidate**. Panel seams and some gaps around upper rails/arches are visible. The side glazing and faceted transitions are approximations; the supplied photographs have smoother construction. Collisions, legal connections, clutch, assembly order, stability and physical assembly remain unevaluated. Do not treat `sequence.json` as building instructions or buy parts on the assumption that this version is ready to assemble. The recorded automated `validation.json` intentionally retains unperformed checks; later manual import evidence is separately bound in `inspection.json` and the [independent QA report](../../docs/qa-cybertruck.md).
