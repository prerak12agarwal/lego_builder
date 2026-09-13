# Submission and demo

GitHub repository: https://github.com/prerak12agarwal/lego_builder

Public Workshop demo: https://lego-builder-workshop.dragonjjk.chatgpt.site/

Unified image/OBJ/LDraw workspace: https://lego-builder-image-to-3d.dragonjjk.chatgpt.site/

The Workshop is the public sample workbench and LDraw import tool. The partner reports the unified workspace is published privately. Its latest Python-service connection must be published/configured before claiming a hosted automatic image-to-LEGO run. GitHub merges do not deploy Sites. This account could open the public Workshop but could not access either Sites project's publishing controls.

## Repository components

- `reconstruction-site/`: unified photo reconstruction, saved OBJ, conversion request, Python service call, stored LDraw, model/parts inspection. Uses the existing fal integration, D1 and R2.
- `lego_builder/`: real general OBJ exterior converter and authenticated HTTP adapter.
- `site/`: original public Workshop and independent LDraw import test bench, including the partner's rate-limit reliability fix.
- `examples/cybertruck/model.ldr`: verified digital candidate, 2,069 pieces. `examples/generic/` records four geometry-only inputs.

## Final publication checklist for the Site owner

1. Deploy `Dockerfile.converter` from the repository root to a Python/Docker host with HTTPS ingress. Set a strong secret `CONVERTER_TOKEN`. The process binds `PORT` (default 8080); `/health` must return 200. Do not paste secrets into GitHub.
2. Publish the current `reconstruction-site/` source using its existing Sites project. Preserve its `DB`/`BUCKET` bindings, existing `FAL_KEY`, authentication and saved data. Apply outstanding migrations through the established migration mechanism; do not recreate/reset the database. Required migrations are recorded in `reconstruction-site/drizzle/meta/_journal.json`.
3. Set server-only Sites variables `CONVERTER_URL=https://<converter-host>/convert` and `CONVERTER_TOKEN` to the same secret. These must never use `NEXT_PUBLIC_` names. `RECONSTRUCTION_PROVIDER=fal` and `FAL_KEY` remain the existing image-generation settings.
4. Give judges access to the unified Site if it remains private. Do not assume the public Workshop's audience applies to the separate reconstruction Site.
5. Run one real image through reconstruction, click Convert to LEGO, download the returned LDR and confirm the Model and Parts views open. Reopening the saved request should preserve the same result. No authored steps are invented; physical buildability remains unverified.

Container commands, from the repository root:

```sh
docker build -f Dockerfile.converter -t lego-converter .
docker run --rm -p 8080:8080 --env CONVERTER_TOKEN lego-converter
```

Set `CONVERTER_TOKEN` securely in the host environment before running. Put the service behind HTTPS; the Sites adapter rejects insecure URLs. The container definition is supplied; it was not built here because the local Docker daemon was stopped. The actual Python HTTP adapter was exercised locally with real OBJ conversion.

## Honest fallback if the Python host is not ready

Use the published image workspace to generate and download an actual OBJ, convert that file locally, and supply its LDR using the saved handoff tools or the public Workshop's Admin test bench. This demonstrates real components with a manual middle step, not an automatic hosted pipeline.

```sh
.venv/bin/python -m lego_builder convert-obj downloaded.obj --target-parts 2000 --up y --output outputs/submission-model
```

Confirm the source up axis. In the unified workspace choose a new piece-target handoff matching the conversion settings; legacy stud-size requests remain manual and are not silently reinterpreted. Retain the source filename/hash when describing the demo. Do not substitute the committed Cybertruck or another fixture as output of a newly uploaded photo.
