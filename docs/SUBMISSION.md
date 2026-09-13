# Submission and demo

GitHub repository: https://github.com/prerak12agarwal/lego_builder

Public Workshop demo: https://lego-builder-workshop.dragonjjk.chatgpt.site/

Canonical image/OBJ/LDraw workspace: https://lego-builder-workshop.dragonjjk.chatgpt.site/build

Legacy private pilot (retains its existing jobs): https://lego-builder-image-to-3d.dragonjjk.chatgpt.site/

The workshop source now combines the public sample workbench and local LDraw importer with the private image/OBJ/LDraw workflow at `/build`. New workshop jobs use its own DB/BUCKET; legacy pilot jobs remain on the old Site. Generation requires sign-in and an explicit server-side pilot allowlist. The hosted image-to-OBJ-to-LDraw run and rollout details are recorded in [Workshop publication evidence](workshop-publication.md). GitHub merges do not deploy Sites or the converter automatically.

## Repository components

- `reconstruction-site/`: retained legacy pilot and earlier regression/live evidence.
- `lego_builder/`: real general OBJ exterior converter and authenticated HTTP adapter.
- `site/`: canonical workshop, private photo reconstruction and saved OBJ, converter requests/results, model/parts/steps, public sample and independent LDraw importer.
- `examples/cybertruck/model.ldr`: verified digital candidate, 2,069 pieces. `examples/generic/` records four geometry-only inputs.

## Runtime configuration

1. Deploy `Dockerfile.converter` from the repository root to a Python/Docker host with HTTPS ingress. Set a strong secret `CONVERTER_TOKEN`. The process binds `PORT` (default 8080); `/health` must return 200. Do not paste secrets into GitHub.
2. Publish the current `site/` source using the workshop's existing Sites project. Enable its `DB`/`BUCKET` bindings and configure `FAL_KEY` plus the intended owner's Site-specific `PILOT_USER_IDS`. Preserve the legacy Site and saved data. Apply outstanding migrations through the established migration mechanism; do not recreate/reset the database. Required migrations are recorded in `site/drizzle/meta/_journal.json`.
3. Set server-only Sites variables `CONVERTER_URL=https://<converter-host>/convert` and `CONVERTER_TOKEN` to the same secret. These must never use `NEXT_PUBLIC_` names. `RECONSTRUCTION_PROVIDER=fal` and `FAL_KEY` remain the existing image-generation settings.
4. Keep the workshop public. Approved pilot operators must be explicitly enrolled through server-managed `PILOT_USER_IDS`; public access or sign-in alone must not grant paid generation access.
5. Run one real image through reconstruction, click Convert to LEGO, download the returned LDR and confirm the Model and Parts views open. Reopening the saved request should preserve the same result. Confirm the converter-authored draft steps, per-step parts and full final-step count. The browser never invents missing steps; physical buildability remains unverified.

Container commands, from the repository root:

```sh
docker build -f Dockerfile.converter -t lego-converter .
docker run --rm -p 8080:8080 --env CONVERTER_TOKEN lego-converter
```

Set `CONVERTER_TOKEN` securely in the host environment before running. Put the service behind HTTPS; the Sites adapter rejects insecure URLs. Railway built the container from the committed converter source. The Python adapter and draft instruction exporter also pass the local suite; hosted evidence is separate.

## Managed converter host

The Python processor runs as service **converter** in the **lego-builder-converter** project in Jacob's existing Railway Hobby workspace. Its managed endpoint is https://converter-production-5f85.up.railway.app/convert and its version is readable at /health. It replaces the temporary Cloudflare tunnel for the canonical Workshop. The legacy Site and its configuration remain separate.

One replica is capped at 2 vCPU and 4 GB RAM, with idle sleep enabled. These limits are not a billing cap; usage is metered within the existing Railway plan. No persistent volume is needed: successful jobs and files remain in Sites D1/R2. The credential is stored only in Railway and the Workshop's managed environment, never in source or deploy archives. The Sites call allows 240 seconds, including startup headroom above the 180-second worker deadline.

To deploy a reviewed converter commit, use an isolated archive containing only tracked converter source and public part data:

```sh
converter_stage=$(mktemp -d)
git archive HEAD pyproject.toml Dockerfile.converter .dockerignore lego_builder | tar -x -C "$converter_stage"
railway up "$converter_stage" --path-as-root --detach --project eec02e14-fed4-4f07-b626-95b27b0c5819 --service e89b8d6f-be63-4c7a-bce1-ed44e640c298 --environment c9605e78-e39b-4558-8107-5cf92388a8f3
```

Use Railway's deployment status/logs to verify completion and /health to verify the intended algorithm. Runtime credentials and service settings persist across these deployments. Do not upload the entire repository working directory or local environment files. Existing immutable LDR results are preserved; use a new conversion request from their saved OBJ for updated instructions, with no new TRELLIS generation.

## Manual fallback if the processor is unavailable

Use the published image workspace to generate and download an actual OBJ, convert that file locally, and supply its LDR using the saved handoff tools or the public Workshop's Admin test bench. This demonstrates real components with a manual middle step, not an automatic hosted pipeline.

```sh
.venv/bin/python -m lego_builder convert-obj downloaded.obj --target-parts 2000 --up y --output outputs/submission-model
```

Confirm the source up axis. In the unified workspace choose a new piece-target handoff matching the conversion settings; legacy stud-size requests remain manual and are not silently reinterpreted. Retain the source filename/hash when describing the demo. Do not substitute the committed Cybertruck or another fixture as output of a newly uploaded photo.
