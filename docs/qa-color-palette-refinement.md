# Color preview and palette refinement

Scope: `codex/color-preview-palette`, based on `7cee6ca`. This pass reuses private supplied GLBs and does not purchase another TRELLIS reconstruction. Evaluation assets and the temporary browser fixture are outside the repository.

## Observed source and conversion

The supplied water-toy GLB contains an embedded base-color texture, a white material factor, roughness 1 and an omitted metallic factor (glTF default 1). Its texture still contains the white, teal and orange regions. A metallic material without environment reflections can obscure these colors. The viewer now defaults to unlit base color with normal sRGB display conversion; optional Studio lighting adds a locally generated reflection environment. Neither presentation edits stored GLB bytes or the texture sampled by conversion.

At target 2,000 pieces, Y-up, the same paired OBJ/GLB reproduces the previous v1 result exactly: 1,981 placements, including 158 yellow and 27 red placements, with no teal or orange palette entry. The v2 candidate has 1,902 placements, 18 colors, 142 part/color lots and 74 draft groups. It includes 97 Dark Turquoise, 12 Medium Azure and 104 Orange placements. It uses 20 part designs, including nine 3039 slopes. The bounded 15068 curve rule is supported and tested but this particular candidate does not select it.

The 26-color catalog records 557 observed manufactured combinations across the 22 fitting designs, with a verified 3024 fallback in every color. It retains the separate frozen v1 catalog. These catalog observations establish manufactured combinations, not seller stock or physical buildability.

## Verification

- Site tests: 108 passed; TypeScript checks passed. Tests cover preserved preview texture/factors/alpha, immutable source materials, expanded and legacy palette validation, request-version mismatch rejection and legacy idempotency hashes.
- Final combined Python suite: 140 passed. The full pass initially had 136 passing tests and one existing HTTP fixture timeout. Its client allowed three seconds for a real conversion. The specific real-conversion test now allows 60 seconds; production timeouts remain unchanged. The service suite then passed all 11 tests.
- Updated source-color suite: 24 passed, including real worker calls for omitted version, explicit v1 and explicit v2. Generic fitting suite: 19 passed, including actual bundled 15068 geometry in all four yaw orientations and unavailable/mixed-color rejection. Other tests passed in the full run.
- Supplied candidate publication checks passed. LDR, inventory and draft groups derive from the same placements; the browser loaded 1,902 placements and 74 groups successfully.
- Local browser used the actual PipelineWorkspace, ModelViewer and AssemblyWorkspace with the supplied model and real locally generated LDR. Clearly labeled fixture responses replaced only private storage/network access. Source Colors and Studio lighting both displayed white, teal and orange regions. The brick viewer displayed corresponding distinct regions; Parts search showed the 97 teal pieces.
- Tab path Model → Instructions (step 2) → Mesh → Instructions retained step 2. Parts search “Turquoise” survived Parts → Mesh → Model → Parts. Counters stayed at one LDR fetch, 66 part requests and zero conversion POSTs. Temporary fixture code and private bytes were removed before the production build.

## Limits

The wider palette still maps shaded texture regions to individual solid colors; gray-blue handles can acquire blue shades. It does not perform photo-to-surface reprojection, exposure correction or texture segmentation. The earlier cat texture contains genuinely dark pixels, so removing preview reflections cannot recover missing light colors. Exact photographic reproduction, hidden-surface fidelity, arbitrary curved/hinged fitting and mechanically validated instructions remain outside this pass.

Independent QA on the combined candidate passed the generic/source suites (43 tests), service suite (11 tests), catalog parity and diff checks. It verified both retained candidates' LDR/BOM totals, revision identities, catalog legality and exactly-once instruction membership. No release-blocking code defect was found in that review; physical assembly and hosted behavior were not claimed by this local review.

## Generation-limit follow-up

The founder also requested removal of the canonical Workshop’s five-generation per-person limit. The owner/day count predicate and UI limit message were removed. The same atomic reservation still enforces the site-wide rolling 20-attempt budget and the existing unique active-job constraint. Added regression checks admit a sixth generation after five completed jobs and allow exactly one of two competing requests for the final site-wide slot. Existing active-job and duplicate-request tests remain. No live paid generation was submitted for testing.
