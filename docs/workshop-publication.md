# Unified Workshop hosted verification

Verified 2026-09-13 on the canonical Workshop origin. This supplements the bounded independent source review in site/test/workshop-evidence.md.

## Published state

- Canonical site: https://lego-builder-workshop.dragonjjk.chatgpt.site/
- Site source commit: ce516dd6bcfc706db8e00bc11dd9c9df6e346b84 (separate Sites source mirror).
- Saved version: appgprj_6aa626cee4708191bc97cf9a9146f60b~appgver_24fd56f72d7081918fb2b40ab6557cc8.
- Deployment: appgdep_6aa6650957408191bd9c19f1d6134a6d, succeeded with runtime environment revision 9.
- GitHub implementation: d6af1597256f06111d064c3255d0c2d112801462.
- Public sample/Admin access preserved. Private reconstruction uses trusted sign-in, the configured Site-specific pilot account, and owner-scoped storage. No account identifier or credential is recorded here.
- Runtime provider and converter configuration was recognized by the live page. An anonymous request with spoofed identity headers remained unauthorized.

## Approved live bottle run

Jacob explicitly approved one upload of the existing bottle reference to the Workshop and fal.ai and one paid TRELLIS generation.

- Submitted through the main Workshop UI; no sample or manual LDraw substitute.
- TRELLIS generated a mesh with 2,320 triangles. The Workshop saved GLB, OBJ and manifest and displayed the actual mesh.
- Convert to LEGO used the retained OBJ with a 2,000-piece target and Y-up. No second photo generation was needed.
- The authenticated external Python converter returned an LDR, which the Workshop persisted and opened in the brick viewer after full dependency resolution.
- The rendered revision contained 2,137 placements. The Parts tab listed 21 part/color lots; summing all displayed quantities gave exactly 2,137.
- The returned LDR had no authored STEP boundaries. The missing-step dialog and Instructions tab explicitly reported unavailable assembly steps. Therefore this proves hosted image-to-bricks and inventory integration, not a complete instructed build.

## Limits

The generic converter's lack of an assembly sequence is a confirmed gap, not a UI or deployment failure. No physical assembly, insertion order, strength, source resemblance, Studio compatibility or multi-image claim is established by this run. Converter availability continues to depend on its configured external temporary tunnel and host.
