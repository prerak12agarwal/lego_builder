# Automatic converter integration QA

Independent review on 2026-09-13, branch `codex/demo-unification`, base `1b6bba0` with the combined integration edits. The reviewer did not implement the service, application adapter or viewer. This is local integration evidence, not hosted end-to-end or physical-build certification.

## Actual conversion and complete geometry import

`tests/test_demo_integration.py` sends the repository's explicitly procedural bottle OBJ over loopback HTTP to the authenticated Python service. The service invokes the real generic converter in its bounded subprocess; the test passes that actual response through the application's TypeScript request/result contracts, then through `createPartTransport`, `servePart` and `importLDraw`. The upstream geometry-fetch substitute throws if called.

Observed result: **2,021 placements, 20 part types, 65 resolved geometry dependencies, zero external requests**. Imported part counts exactly match the receiving parser. Source and canonical settings hashes match across Python and TypeScript. The result has no authored steps; both receiver and importer preserve that state with zero instruction groups. No sample LDraw is substituted for the converter output. The bottle remains a geometry fixture, not evidence of image reconstruction.

## Checks and findings

- Independent integration tests: **3 passed**, including missing/wrong credentials, source/settings hash mismatches, legacy settings rejected by the automatic service, unconfirmed axis rejection, busy-service backpressure, request-byte limits, real conversion, legacy request readability, ambiguous settings rejection and the 2,500-placement receiver cap.
- Combined service and initial integration run: **14 passed**. Service tests cover worker timeout/isolation, malformed contracts and HTTP handling. The final expanded graph test passed separately after bundled geometry transport was integrated.
- Reconstruction application suite rerun independently: **49 passed**. This includes owner isolation, source hash gates, immutable results, deletion/publication races, legacy hash preservation and adapter failures.
- Reconstruction application typecheck rerun independently: **passed**. The primary integrator separately reported a passing production build; this reviewer did not rerun that build.
- Found a deployment-relevant redirect regression: the initial converter client used `redirect: "error"`, which the existing Worker transport evidence identifies as unsupported. Developer changed it to `manual`; source inspection and the passing redirect regression confirm 3xx responses cannot publish success.

Loopback tests require execution permission outside the filesystem/network sandbox; the initial sandboxed attempt failed at socket binding before application execution. The permitted rerun passed. No paid provider calls, private uploads, Git mutations or deployment actions were performed by this review.

## Practical limits and recommendation

**Pass for local HTTP conversion, receiving contracts and complete bundled dependency import.** No open blocking defect was found within those tested boundaries. The test resolves the full renderer input graph; it does not draw a browser WebGL frame or establish hosted Sites identity/storage behavior.

Actual photo-derived OBJ through the hosted service, configured HTTPS ingress, target-Site publication and browser rendering still require deployment evidence. A supplied/manual LDraw receipt remains distinct from an authenticated converter result. Conversion requests retain the saved OBJ after failure; the synchronous demo path is not a durable background execution queue. No geometry, connection, instructions or physical-build guarantee follows solely from HTTP success or complete library resolution.

## Reproduction

From the repository root:

```sh
.venv/bin/python -m pytest tests/test_service.py tests/test_demo_integration.py -q
```

From `reconstruction-site`:

```sh
npm test
npm run typecheck
```

The cross-language test needs the repository's Node runtime and Python environment. All source fixtures and temporary conversions are local; no image provider is contacted.
