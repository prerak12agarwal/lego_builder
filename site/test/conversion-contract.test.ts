import test from "node:test";
import assert from "node:assert/strict";
import { CONVERSION_LIMITS, inspectRootLdr, parseConversionRequest, parseConversionResult } from "../lib/conversion-contract.ts";
import { HttpError, readLimited } from "../lib/http.ts";

const placement = "1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat";
test("converter request is bounded and canonical", () => {
  assert.deepEqual(parseConversionRequest({ schemaVersion: 1, settings: { targetSizeStuds: 16, inputUpAxis: "y" } }), { schemaVersion: 1, settings: { targetSizeStuds: 16, inputUpAxis: "y" } });
  assert.throws(() => parseConversionRequest({ schemaVersion: 1, settings: { targetSizeStuds: 3, inputUpAxis: "y" } }), HttpError);
});
test("root LDR inspection preserves only nonempty authored groups", () => {
  const result = inspectRootLdr(`0 STEP\n${placement}\n0 STEP\n0 ROTSTEP\n${placement}`);
  assert.equal(result.placements, 2); assert.equal(result.hasSteps, true); assert.equal(result.stepCount, 2);
  assert.equal(inspectRootLdr(placement).hasSteps, false);
});
test("root LDR rejects packed files, primitives and non-flat references", () => {
  for (const value of [`0 FILE model.ldr\n${placement}`, "3 16 0 0 0 1 0 0 0 1 0 0", "1 16 0 0 0 1 0 0 0 1 0 0 0 sub/model.dat"]) assert.throws(() => inspectRootLdr(value), HttpError);
});
test("result hashes and producer are bounded", () => {
  const digest = "a".repeat(64);
  assert.equal(parseConversionResult({ schemaVersion: 1, sourceObjSha256: digest, settingsSha256: digest, ldr: placement, producer: { name: "test", version: "1" } }).producer?.name, "test");
  assert.throws(() => parseConversionResult({ schemaVersion: 1, sourceObjSha256: "bad", settingsSha256: digest, ldr: placement }), HttpError);
});
test("a normal escaped 5 MiB LDR fits the JSON envelope while decoded oversize is rejected", async () => {
  const digest = "a".repeat(64), ldr = "0 x\n".repeat(CONVERSION_LIMITS.ldrBytes / 4), body = JSON.stringify({ schemaVersion: 1, sourceObjSha256: digest, settingsSha256: digest, ldr });
  assert.ok(new TextEncoder().encode(body).byteLength > CONVERSION_LIMITS.ldrBytes); assert.doesNotThrow(() => parseConversionResult(JSON.parse(body))); await readLimited(new Response(body).body, CONVERSION_LIMITS.bodyBytes);
  assert.throws(() => parseConversionResult({ schemaVersion: 1, sourceObjSha256: digest, settingsSha256: digest, ldr: `${ldr}x` }), HttpError);
  assert.throws(() => parseConversionResult({ schemaVersion: 1, sourceObjSha256: digest, settingsSha256: digest, ldr: `${placement}\u0000` }), HttpError);
});
test("colored results bind exact GLB identity and catalog color summary to the LDR",()=>{
  const digest="a".repeat(64), summary={mode:"source",method:"surface-base-color-to-palette-v1",paletteVersion:"source-solid-palette-v1",sourceHasColor:true,usedColorCodes:[1,4],limitations:["palette-approximation","one-color-per-part","materials-not-reproduced"]};
  const input={schemaVersion:2,sourceObjSha256:digest,sourceGlbSha256:digest,settingsSha256:digest,ldr:`${placement.replace("1 16 ","1 1 ").replace("3001.dat","3004.dat")}\n0 STEP\n${placement.replace("1 16 ","1 4 ").replace("3001.dat","3004.dat")}`,colorSummary:summary};
  assert.deepEqual(parseConversionResult(input).colorSummary?.usedColorCodes,[1,4]);
  for(const mutation of [{sourceGlbSha256:"bad"},{schemaVersion:1},{colorSummary:{...summary,usedColorCodes:[4]}},{colorSummary:{...summary,usedColorCodes:[4,1]}},{colorSummary:{...summary,sourceHasColor:false}},{colorSummary:{...summary,limitations:[]}}]) assert.throws(()=>parseConversionResult({...input,...mutation}));
  assert.throws(()=>parseConversionRequest({schemaVersion:1,settings:{targetParts:2000,inputUpAxis:"y",sourceGlbSha256:digest}}),/unsupported fields/);
  assert.throws(()=>parseConversionResult({...input,colorSummary:{...summary,paletteVersion:"not-a-real-palette"}}),/unsupported color palette/);
  assert.throws(()=>parseConversionResult({...input,ldr:input.ldr.replaceAll("3004.dat","9999.dat")}),/unsupported manufactured/);
  assert.throws(()=>parseConversionResult({...input,ldr:input.ldr.replaceAll("3004.dat","3039.dat")}),/unsupported manufactured/);
  assert.throws(()=>parseConversionResult({...input,colorSummary:{...summary,usedColorCodes:[511]},ldr:placement.replace("1 16 ","1 511 ")}),/invalid LEGO colors/);
});
