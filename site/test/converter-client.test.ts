import test from "node:test";
import assert from "node:assert/strict";
import { converterConfigured, converterEndpoint, runConverter } from "../lib/converter-client.ts";
import { parseConversionRequest } from "../lib/conversion-contract.ts";
import { settingsJson } from "../lib/conversions.ts";
const env = { CONVERTER_URL: "https://converter.example", CONVERTER_TOKEN: "server-secret" };
const input = { schemaVersion: 1 as const, obj: "v 0 0 0", sourceObjSha256: "a".repeat(64), settingsSha256: "b".repeat(64), settings: { targetParts: 2000, inputUpAxis: "y" as const } };
test("piece targets are explicit and legacy hash serialization is unchanged", () => {
  assert.equal(settingsJson({ targetParts: 2000, inputUpAxis: "y" }), '{"inputUpAxis":"y","targetParts":2000}');
  assert.equal(settingsJson({ targetSizeStuds: 24, inputUpAxis: "unspecified" }), '{"inputUpAxis":"unspecified","targetSizeStuds":24}');
  assert.deepEqual(parseConversionRequest({ schemaVersion: 1, settings: input.settings }).settings, input.settings);
  for (const settings of [{targetParts:2000,targetSizeStuds:24,inputUpAxis:"y"},{targetParts:2000,inputUpAxis:"unspecified"},{targetParts:2300,inputUpAxis:"y"}]) assert.throws(() => parseConversionRequest({schemaVersion:1,settings}));
});
test("fixed server HTTPS configuration rejects credentials and insecure URLs", () => {
  assert.equal(converterConfigured({}), false); assert.equal(converterEndpoint(env), "https://converter.example/convert");
  for (const url of ["http://localhost:8080", "https://user:pass@example.com", "https://example.com?token=secret"]) assert.equal(converterConfigured({...env,CONVERTER_URL:url}),false);
});
test("server adapter sends pinned input and bearer only to configured URL, without redirects", async () => {
  let called = false;
  const result = await runConverter(env,input,async (url,init) => {
    called = true; assert.equal(url,"https://converter.example/convert"); assert.equal(init?.redirect,"manual");
    assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer server-secret");
    assert.deepEqual(JSON.parse(init?.body as string),input);
    return Response.json({schemaVersion:1,sourceObjSha256:input.sourceObjSha256,settingsSha256:input.settingsSha256,ldr:"0 no authored steps\n1 71 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat"});
  });
  assert.ok(called); assert.equal(result.sourceObjSha256,input.sourceObjSha256); assert.ok(!JSON.stringify(result).includes("server-secret"));
});
test("redirects, mismatched result hashes and busy converter cannot publish success", async () => {
  await assert.rejects(runConverter(env,input,async () => new Response(null,{status:302,headers:{Location:"https://attacker.example"}})),/could not complete/);
  await assert.rejects(runConverter(env,input,async () => new Response(null,{status:429})),/busy/);
  await assert.rejects(runConverter(env,input,async () => Response.json({schemaVersion:1,sourceObjSha256:"c".repeat(64),settingsSha256:input.settingsSha256,ldr:"0 x"})),/different source/);
});
test("color requests cannot accept a neutral downgrade or a different GLB",async()=>{
  const colored={...input,schemaVersion:2 as const,sourceGlbSha256:"c".repeat(64),glbBase64:"fixture",settings:{...input.settings,colorMode:"source" as const,sourceGlbSha256:"c".repeat(64)}};
  const result={schemaVersion:2,sourceObjSha256:input.sourceObjSha256,sourceGlbSha256:colored.sourceGlbSha256,settingsSha256:input.settingsSha256,ldr:"1 4 0 0 0 1 0 0 0 1 0 0 0 1 3004.dat\n0 STEP\n",colorSummary:{mode:"source",method:"surface-base-color-to-palette-v1",paletteVersion:"source-solid-palette-v1",sourceHasColor:true,usedColorCodes:[4],limitations:["palette-approximation","one-color-per-part","materials-not-reproduced"]}};
  assert.equal((await runConverter(env,colored,async(_url,init)=>{assert.deepEqual(JSON.parse(String(init?.body)),colored);return Response.json(result);})).schemaVersion,2);
  await assert.rejects(runConverter(env,colored,async()=>Response.json({...result,sourceGlbSha256:"d".repeat(64)})),/different source colors/);
  await assert.rejects(runConverter(env,colored,async()=>Response.json({schemaVersion:1,sourceObjSha256:input.sourceObjSha256,settingsSha256:input.settingsSha256,ldr:result.ldr})),/different source colors/);
});
