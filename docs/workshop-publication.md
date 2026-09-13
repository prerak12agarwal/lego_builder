# Unified Workshop hosted verification

> Historical deployment evidence for Workshop version 7. The pilot-account restriction below describes that version; the current policy permits every signed-in ChatGPT user to use their own private workflow. See [current access verification](qa-signed-in-access.md). The original bottle-run evidence is retained unchanged.

Verified 2026-09-13 on the canonical Workshop origin. This live follow-up supplements the independent [workshop source review](../site/test/workshop-evidence.md) and [draft instruction review](qa-draft-instructions.md).

## Published state

- Canonical site: https://lego-builder-workshop.dragonjjk.chatgpt.site/
- Site source commit: `ba5a7cd7340d12d9538966a57679f12f727768f7` (separate Sites source mirror).
- Saved version 7: `appgprj_6aa626cee4708191bc97cf9a9146f60b~appgver_e474a9ffbed481918b0f7fa2d1be6fc9`.
- Deployment: `appgdep_6aa66ca0e0688191872de355428782ed`, succeeded with runtime environment revision 10.
- GitHub implementation: `d8389769a3d7cc65ade4233706882dfeacf0e800`.
- Public sample/Admin access is preserved. Private reconstruction uses trusted sign-in, the configured Site-specific pilot account and owner-scoped D1/R2 storage. No account identifier or credential is recorded here.
- The live page recognized the provider/converter configuration. An anonymous request with spoofed identity headers remained unauthorized.

## Managed Python execution

- The canonical Workshop uses `https://converter-production-5f85.up.railway.app/convert`, replacing its temporary quick-tunnel dependency.
- Isolated Railway project `lego-builder-converter`, service `converter`, uses the existing Hobby workspace. Deployment `d069297f-58b3-4fe0-a2b3-a850b4ac17c6` succeeded from the committed converter files at the GitHub revision above.
- The deployed Docker service has one replica, a maximum of 2 vCPU/4 GB, idle sleep, `/health` readiness and no persistent volume. Sites D1/R2 retains the durable jobs and files. Unrelated Railway projects and workspace billing limits were unchanged; compute remains metered on the existing plan.
- `/health` returned HTTP 200 and version `generic-exterior-shell-v2-draft-layers`. Unauthenticated `/convert` returned HTTP 401. The real Workshop conversion returned HTTP 200; Railway recorded 1,427 ms for that request, which is not an end-to-end generation benchmark.
- Both platforms hold the shared authentication token only in managed runtime settings. Deployment/update instructions are in [SUBMISSION.md](SUBMISSION.md).

## Approved live bottle run

Jacob explicitly approved one upload of the existing bottle reference to the Workshop and fal.ai and one paid TRELLIS generation.

- Submitted through the main Workshop UI, with no sample or manual LDraw substitute.
- TRELLIS generated a mesh with 2,320 triangles. The Workshop saved GLB, OBJ and manifest and displayed the actual mesh.
- Convert to LEGO reused the retained OBJ with a 2,000-piece target and Y-up. The updated converter was tested through a new conversion request without a second TRELLIS generation; the earlier immutable result was preserved.
- The authenticated Railway converter returned its real LDR. The Workshop persisted it and rendered the brick bottle after complete part-library resolution.
- The result contains 2,137 placements, 21 part/color lots and 160 converter-authored draft steps. Summing the Parts table quantities gave exactly 2,137.
- Instructions showed the explicit draft/buildability warning. Step 1 added 28 pieces; Next reached step 2 with 3 new pieces and 31 cumulative pieces; Previous returned to step 1. Direct navigation to step 160 showed 2 newly added pieces and 2,137 of 2,137 placed, with Next disabled.

- Refreshing the saved job/conversion URL recovered the same 2,137-piece model, 21 lots and 160 draft steps without resubmitting reconstruction.

## Source verification and limits

Independent QA passed 111 Python tests, 76 Site tests and TypeScript checking. The final Site production build and diff whitespace checks passed. Lint still reports 9 errors and 5 warnings in existing/copied source, as recorded in the source review; lint is not claimed to pass.

This establishes a connected single-photo pipeline prototype with consistent digital draft steps. Connection access, intermediate support, strength, physical buildability, source resemblance and BrickLink Studio compatibility remain unverified. Multiple-image reconstruction is deferred. One bottle run does not establish general output quality, concurrency capacity, latency or cost. Idle-sleep cold starts have not been separately benchmarked, and public LDraw geometry availability remains a rendering dependency.
