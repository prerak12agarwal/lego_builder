# Converter handoff (manual return path)

The site creates an immutable, owner-scoped request with `POST /api/jobs/:sourceJobId/conversion`. It requires an `Idempotency-Key` and this JSON body:

```json
{"schemaVersion":1,"settings":{"targetSizeStuds":16,"inputUpAxis":"y"}}
```

`targetSizeStuds` is an integer from 4 through 48. `inputUpAxis` is `x`, `y`, `z`, or `unspecified`. Reusing a key with the same source/settings replays its request; a changed source or setting gets `409`. A fresh key is an explicit new conversion attempt, including when an earlier result has missing authored steps.

Each saved mesh has at most ten live conversion handoffs, including awaiting and completed results. This limit is atomic across concurrent requests. Replays remain available at the limit; use an existing handoff or delete the source model when it is no longer needed before creating another attempt.

`GET /api/jobs/:sourceJobId/conversion/:requestId/handoff` returns the immutable request plus authenticated, relative paths for its checked OBJ and source manifest. The source hash comes from the ready reconstruction manifest, never from a client URL. These paths require the same signed-in owner and are intended for a human-operated local wrapper while the converter is being optimized.

The wrapper returns its output with `POST /api/jobs/:sourceJobId/conversion/:requestId/result`:

```json
{"schemaVersion":1,"sourceObjSha256":"…","settingsSha256":"…","ldr":"0 generated\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n","producer":{"name":"partner-converter","version":"pending"}}
```

The echoed hashes must match the handoff. A byte-identical replay is safe; a different LDR cannot replace an available result. Decoded LDraw text is bounded to 5 MiB and 2,500 placements. The JSON transport envelope is independently bounded to 10 MiB plus 64 KiB so normal JSON escaping of newlines, quotes, and backslashes fits; unsupported control characters are rejected. The site accepts only root `.dat` placement lines and comments, checks numeric transforms and simple numeric color syntax, derives part and step counts, and saves the result as **inspection-only**. It does not manufacture steps; a result without `0 STEP` remains available with `hasSteps: false`. It does not establish catalog validity, structural correctness, physical buildability, or converter compatibility.

`GET /api/jobs/:sourceJobId/conversion` returns the latest live request (or accepts `?request=<Idempotency-Key>` for recovery). `GET /api/jobs/:sourceJobId/conversion/:requestId/artifact` returns the stored LDR with private no-store headers.

There is deliberately no bearer-token or machine-dispatch endpoint yet. Private Sites identity and the current Origin-checked browser route remain the only verified interoperability boundary. A future server-side dispatcher must use a separately approved authentication scheme, fetch authenticated OBJ/manifest bytes, preserve these hash echoes, and add task/lease/result-collection semantics without treating a client BOM or success claim as authoritative.
