"""Independent HTTP-to-TypeScript contract checks; no paid providers or user data."""
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import subprocess
import threading

import pytest

from lego_builder import service

ROOT = Path(__file__).resolve().parents[1]
TOKEN = "independent-local-test-token"


@pytest.fixture
def http_service():
    server = service.ConverterServer(("127.0.0.1", 0), TOKEN)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def payload(obj, target=100):
    settings = {"targetParts": target, "inputUpAxis": "y"}
    return {"schemaVersion": 1, "obj": obj,
            "sourceObjSha256": hashlib.sha256(obj.encode()).hexdigest(),
            "settingsSha256": service.canonical_settings_hash(settings), "settings": settings}


def post(server, value, auth=TOKEN):
    connection = http.client.HTTPConnection(*server.server_address, timeout=195)
    headers = {"Content-Type": "application/json"}
    if auth is not None:
        headers["Authorization"] = "Bearer " + auth
    try:
        connection.request("POST", "/convert", json.dumps(value).encode(), headers)
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


def test_authentication_and_pinned_hashes_fail_before_conversion(http_service):
    value = payload("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
    assert post(http_service, value, auth=None) == (401, {"error": "unauthorized"})
    assert post(http_service, value, auth="wrong") == (401, {"error": "unauthorized"})
    assert post(http_service, {**value, "sourceObjSha256": "0" * 64}) == (422, {"error": "source_hash_mismatch"})
    assert post(http_service, {**value, "settingsSha256": "0" * 64}) == (422, {"error": "settings_hash_mismatch"})
    invalid = {**value, "settings": {"targetParts": 100, "inputUpAxis": "unspecified"}}
    assert post(http_service, invalid)[0] == 400
    legacy = {**value, "settings": {"targetSizeStuds": 24, "inputUpAxis": "y"}}
    assert post(http_service, legacy)[0] == 400


def test_service_backpressure_and_request_caps(http_service, monkeypatch):
    value = payload("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
    http_service.conversion_slot.acquire()
    try:
        assert post(http_service, value) == (429, {"error": "converter_busy"})
    finally:
        http_service.conversion_slot.release()
    monkeypatch.setattr(service, "MAX_REQUEST_BYTES", 20)
    assert post(http_service, value) == (413, {"error": "request_size_limit"})


def test_real_bottle_obj_http_result_passes_partner_receiver(http_service):
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node runtime needed to exercise the real TypeScript receiver")
    # This procedural bottle is explicitly a geometry fixture, not image reconstruction.
    obj = (ROOT / "benchmarks/fixtures/water_bottle.obj").read_text()
    request = payload(obj, target=2000)
    status, result = post(http_service, request)
    assert status == 200, result
    assert result["sourceObjSha256"] == request["sourceObjSha256"]
    assert result["settingsSha256"] == request["settingsSha256"]
    contract = (ROOT / "reconstruction-site/lib/conversion-contract.ts").as_uri()
    conversions = (ROOT / "reconstruction-site/lib/conversions.ts").as_uri()
    importer = (ROOT / "reconstruction-site/lib/ldraw/import.ts").as_uri()
    part_service = (ROOT / "reconstruction-site/lib/ldraw/part-service.ts").as_uri()
    transport = (ROOT / "reconstruction-site/lib/ldraw/transport.ts").as_uri()
    colors = str(ROOT / "reconstruction-site/public/ldraw/LDConfig.ldr")
    script = f"""
      import assert from 'node:assert/strict';
      import {{ readFileSync }} from 'node:fs';
      import {{ createHash }} from 'node:crypto';
      import {{ parseConversionRequest, parseConversionResult, inspectRootLdr }} from {json.dumps(contract)};
      import {{ settingsJson }} from {json.dumps(conversions)};
      import {{ importLDraw }} from {json.dumps(importer)};
      import {{ servePart }} from {json.dumps(part_service)};
      import {{ createPartTransport }} from {json.dumps(transport)};
      const input = JSON.parse(readFileSync(0, 'utf8'));
      const request = parseConversionRequest({{schemaVersion:1, settings:input.settings}});
      const actualHash = createHash('sha256').update(settingsJson(request.settings)).digest('hex');
      assert.equal(actualHash, input.result.settingsSha256);
      const result = parseConversionResult(input.result);
      const inspection = inspectRootLdr(result.ldr);
      assert.ok(inspection.placements > 0 && inspection.placements <= 2500);
      assert.equal(inspection.hasSteps, false);
      assert.equal(inspection.stepCount, 0);
      assert.deepEqual(parseConversionRequest({{schemaVersion:1,settings:{{targetSizeStuds:24,inputUpAxis:'unspecified'}}}}).settings, {{targetSizeStuds:24,inputUpAxis:'unspecified'}});
      assert.throws(() => parseConversionRequest({{schemaVersion:1,settings:{{targetParts:2000,targetSizeStuds:24,inputUpAxis:'y'}}}}));
      const row = '1 71 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\\n';
      assert.throws(() => inspectRootLdr(row.repeat(2501)));
      let externalRequests = 0;
      const partTransport = createPartTransport({{fetch: async (url) =>
        servePart(new Request(new URL(url, 'https://test.invalid')), async () => {{
          externalRequests++; throw Error('External geometry fetch forbidden in this test');
        }})
      }});
      const revision = await importLDraw('actual-service-result.ldr', result.ldr,
        readFileSync({json.dumps(colors)}, 'utf8'), partTransport, new AbortController().signal);
      assert.equal(externalRequests, 0);
      assert.equal(revision.placements.length, inspection.placements);
      assert.equal(revision.hasSteps, false);
      assert.equal(revision.steps.length, 0);
      assert.ok(revision.dependencyCount > 0);
      const partCounts = {{}};
      for (const piece of revision.placements) {{
        const name = piece.part.split('/').at(-1);
        partCounts[name] = (partCounts[name] ?? 0) + 1;
      }}
      assert.deepEqual(partCounts, inspection.parts);
      console.log(JSON.stringify({{...inspection, dependencyCount:revision.dependencyCount, externalRequests}}));
    """
    completed = subprocess.run([node, "--experimental-transform-types", "--input-type=module", "-e", script],
                               input=json.dumps({"settings": request["settings"], "result": result}),
                               capture_output=True, text=True, timeout=30, check=True)
    inspection = json.loads(completed.stdout)
    assert inspection["placements"] == sum(line.startswith("1 ") for line in result["ldr"].splitlines())
    print("HTTP bottle and complete bundled import:", json.dumps(inspection, sort_keys=True))
