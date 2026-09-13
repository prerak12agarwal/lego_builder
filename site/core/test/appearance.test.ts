import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { validateGlbAndExportObj } from "../src/glb.ts";
import { exportObjBundle } from "../src/obj-bundle.ts";

type Json = Record<string, any>;
function encode(json: Json, binary: Uint8Array) {
  const text = new TextEncoder().encode(JSON.stringify(json)), jsonLength = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonLength + Math.ceil(binary.length / 4) * 4), data = new DataView(bytes.buffer);
  data.setUint32(0, 0x46546c67, true); data.setUint32(4, 2, true); data.setUint32(8, bytes.length, true);
  data.setUint32(12, jsonLength, true); data.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength); bytes.set(text, 20);
  data.setUint32(20 + jsonLength, bytes.length - jsonLength - 28, true); data.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(binary, 28 + jsonLength); return bytes;
}
function decode(bytes: Uint8Array) {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.length).getUint32(12, true);
  return { json: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as Json, binary: bytes.subarray(28 + length) };
}
function crc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function png(width = 1, height = 1) {
  function chunk(name: string, payload: Uint8Array) {
    const bytes = new Uint8Array(12 + payload.length), view = new DataView(bytes.buffer);
    view.setUint32(0, payload.length); bytes.set(new TextEncoder().encode(name), 4); bytes.set(payload, 8);
    view.setUint32(bytes.length - 4, crc(bytes.subarray(4, bytes.length - 4))); return bytes;
  }
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const pixels = new Uint8Array((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) { pixels[row * (width * 4 + 1) + 1 + column * 4] = 255; pixels[row * (width * 4 + 1) + 4 + column * 4] = 255; }
  return Buffer.concat([new Uint8Array([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", new Uint8Array())]);
}
function fixture(image?: Uint8Array) {
  const binary = new Uint8Array(80 + (image?.length ?? 0)), data = new DataView(binary.buffer);
  [0,0,0, 1,0,0, 0,1,0].forEach((value, i) => data.setFloat32(i * 4, value, true));
  [0,1,2].forEach((value, i) => data.setUint16(36 + i * 2, value, true));
  [0,0, 1,0, 0,1].forEach((value, i) => data.setFloat32(44 + i * 4, value, true));
  binary.set([255,0,0,255, 0,255,0,255, 0,0,255,255], 68);
  if (image) binary.set(image, 80);
  const json: Json = {
    asset: { version: "2.0" }, buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer:0, byteOffset:0, byteLength:36 }, { buffer:0, byteOffset:36, byteLength:6 }, { buffer:0, byteOffset:44, byteLength:24 }, { buffer:0, byteOffset:68, byteLength:12 }],
    accessors: [{ bufferView:0, componentType:5126, count:3, type:"VEC3" }, { bufferView:1, componentType:5123, count:3, type:"SCALAR" }, { bufferView:2, componentType:5126, count:3, type:"VEC2" }, { bufferView:3, componentType:5121, normalized:true, count:3, type:"VEC4" }],
    meshes: [{ primitives:[{ attributes:{ POSITION:0, TEXCOORD_0:2 }, indices:1 }] }], nodes: [{ mesh:0 }], scenes:[{ nodes:[0] }], scene:0,
  };
  if (image) {
    json.bufferViews.push({ buffer:0, byteOffset:80, byteLength:image.length });
    json.images = [{ bufferView:4, mimeType:"image/png" }]; json.textures = [{ source:0 }];
    json.materials = [{ pbrMetallicRoughness:{ baseColorTexture:{ index:0 } } }]; json.meshes[0].primitives[0].material = 0;
  }
  return { json, binary, run: () => validateGlbAndExportObj(encode(json, binary)) };
}

test("remaps the selected graph, discarding unused scenes/resources and nested extras", () => {
  const f = fixture(png());
  f.json.nodes.unshift({ mesh:999, extensions:{ hostile:{} } }); f.json.scene = 1;
  f.json.scenes = [{ nodes:[0] }, { nodes:[1], extras:{ uri:"https://evil.example" } }];
  f.json.meshes[0].primitives[0].extras = { hidden:"drop" };
  f.json.materials[0].pbrMetallicRoughness.extras = { hidden:"drop" };
  f.json.materials[0].pbrMetallicRoughness.baseColorTexture.extras = { hidden:"drop" };
  f.json.images.push({ uri:"data:image/png;base64,hostile" });
  f.json.accessors.push({ count:1e15, sparse:{} });
  f.json.bufferViews.push({ buffer:999, byteLength:1e15 });
  const output = f.run(), saved = decode(output.glb);
  assert.deepEqual(saved.json.scenes, [{ nodes:[0] }]); assert.equal(saved.json.scene, 0);
  assert.equal(saved.json.nodes.length, 1); assert.equal(saved.json.images.length, 1);
  assert.equal(saved.json.accessors.length, 3); assert.equal(saved.json.bufferViews.length, 4);
  assert.doesNotMatch(JSON.stringify(saved.json), /hidden|evil|hostile|extras|data:/);
  assert.equal(output.obj, validateGlbAndExportObj(output.glb).obj);
  const image = saved.json.images[0], view = saved.json.bufferViews[image.bufferView];
  assert.deepEqual(saved.binary.subarray(view.byteOffset, view.byteOffset + view.byteLength), new Uint8Array(png()));
});

test("retains every supported material slot, sampler, alpha, factors and unlit", () => {
  const f = fixture(png()); f.json.samplers = [{ magFilter:9728, minFilter:9986, wrapS:33071, wrapT:33648, extras:{ drop:true } }];
  f.json.textures[0].sampler = 0;
  f.json.materials[0] = {
    pbrMetallicRoughness:{ baseColorFactor:[0.1,0.2,0.3,0.4], metallicFactor:0.2, roughnessFactor:0.7, baseColorTexture:{ index:0 }, metallicRoughnessTexture:{ index:0 } },
    normalTexture:{ index:0, scale:0.5 }, occlusionTexture:{ index:0, strength:0.3 }, emissiveTexture:{ index:0 }, emissiveFactor:[0.2,0.3,0.4],
    alphaMode:"MASK", alphaCutoff:0.6, doubleSided:true, extensions:{ KHR_materials_unlit:{} },
  };
  const output = f.run(), saved = decode(output.glb).json;
  assert.deepEqual(saved.materials, f.json.materials);
  assert.deepEqual(saved.samplers, [{ magFilter:9728, minFilter:9986, wrapS:33071, wrapT:33648 }]);
  assert.deepEqual(saved.extensionsUsed, ["KHR_materials_unlit"]);
  assert.equal(output.manifest.appearance.status, "preserved"); assert.equal(output.textureImages.length, 1);
});

test("recognizes normalized vertex colors and authored white material as appearance", () => {
  const f = fixture(); f.json.meshes[0].primitives[0].attributes.COLOR_0 = 3;
  const output = f.run(), saved = decode(output.glb).json;
  assert.equal(output.manifest.appearance.status, "preserved");
  const color = saved.accessors[saved.meshes[0].primitives[0].attributes.COLOR_0];
  assert.equal(color.normalized, true); assert.equal(color.componentType, 5121);
  delete f.json.meshes[0].primitives[0].attributes.COLOR_0;
  assert.equal(f.run().manifest.appearance.status, "absent");
  f.json.materials = [{}]; f.json.meshes[0].primitives[0].material = 0;
  assert.equal(f.run().manifest.appearance.status, "preserved");
});

test("retains exact authored transforms and reflected OBJ order through canonical reload", () => {
  const f = fixture();
  f.json.nodes = [{ translation:[0.123456789, -2.1, 4.9], rotation:[0,0,Math.sin(0.37),Math.cos(0.37)], children:[1] }, { mesh:0, scale:[-2.3,1.7,0.6] }];
  const output = f.run(), reloaded = validateGlbAndExportObj(output.glb);
  assert.deepEqual(decode(output.glb).json.nodes, f.json.nodes);
  assert.equal(output.obj, reloaded.obj); assert.deepEqual(output.stats, reloaded.stats);
  assert.deepEqual([...output.geometry.indices], [0,2,1]);
  assert.match(output.obj, /v 0.123456789 -2.1 4.9/);
});

test("recomputes misleading position bounds and rejects malformed transform semantics", () => {
  const f = fixture(); f.json.accessors[0].min = [-999,-999,-999]; f.json.accessors[0].max = [999,999,999];
  assert.deepEqual(decode(f.run().glb).json.accessors[0].min, [0,0,0]);
  assert.deepEqual(decode(f.run().glb).json.accessors[0].max, [1,1,0]);
  const matrices = [
    { matrix:[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], translation:[0,0,0] },
    { matrix:[1,0,0,0.1, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
    { matrix:[1,0,0,0, 0.1,1,0,0, 0,0,1,0, 0,0,0,1] },
    { rotation:[0,0,0,2] }, { scale:[0,1,1] },
  ];
  for (const transform of matrices) { f.json.nodes[0] = { mesh:0, ...transform }; assert.throws(f.run, /matrix|quaternion|transform/); }
});

test("rejects undeclared extensions at every retained resource boundary", () => {
  const targets = [
    (j:Json) => j, (j:Json) => j.asset, (j:Json) => j.buffers[0], (j:Json) => j.scenes[0], (j:Json) => j.nodes[0],
    (j:Json) => j.meshes[0], (j:Json) => j.meshes[0].primitives[0], (j:Json) => j.accessors[0], (j:Json) => j.bufferViews[0],
    (j:Json) => j.materials[0], (j:Json) => j.materials[0].pbrMetallicRoughness,
    (j:Json) => j.materials[0].pbrMetallicRoughness.baseColorTexture, (j:Json) => j.textures[0], (j:Json) => j.images[0],
  ];
  for (const target of targets) { const f = fixture(png()); target(f.json).extensions = { KHR_texture_transform:{} }; assert.throws(f.run, /extension/); }
  const f = fixture(png()); f.json.samplers = [{ extensions:{ WEBGL_evil:{} } }]; f.json.textures[0].sampler = 0;
  assert.throws(f.run, /extension/);
});

test("rejects invalid attribute encodings, nonfinite payloads, references and declared bounds", () => {
  const mutations = [
    (f:ReturnType<typeof fixture>) => { f.json.accessors[0].normalized = true; },
    (f:ReturnType<typeof fixture>) => { f.json.accessors[2].normalized = true; },
    (f:ReturnType<typeof fixture>) => { f.json.accessors[1].normalized = true; },
    (f:ReturnType<typeof fixture>) => { f.json.accessors[2].count = 2; },
    (f:ReturnType<typeof fixture>) => { f.json.accessors[0].min = [null,0,0]; },
    (f:ReturnType<typeof fixture>) => { f.json.accessors[0].byteOffset = 2; },
    (f:ReturnType<typeof fixture>) => { f.json.bufferViews[0].byteStride = 14; },
    (f:ReturnType<typeof fixture>) => { new DataView(f.binary.buffer).setFloat32(0, NaN, true); },
    (f:ReturnType<typeof fixture>) => { new DataView(f.binary.buffer).setFloat32(44, Infinity, true); },
    (f:ReturnType<typeof fixture>) => { f.json.bufferViews[2].buffer = 1; },
    (f:ReturnType<typeof fixture>) => { f.json.bufferViews[2].byteOffset = f.binary.length; },
    (f:ReturnType<typeof fixture>) => { f.json.meshes[0].primitives[0].attributes.COLOR_0 = 3; delete f.json.accessors[3].normalized; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(f.run); }
  const f = fixture(); f.json.buffers[0].byteLength = 79; f.json.bufferViews[2] = { buffer:0, byteOffset:56, byteLength:24 };
  assert.throws(f.run, /declared binary buffer/);
});

test("rejects external/data images, malformed images, missing UVs and invalid material values", () => {
  for (const uri of ["https://evil.example/a.png", "data:image/png;base64,AAAA"]) {
    const f = fixture(png()); f.json.images[0].uri = uri; assert.throws(f.run, /embedded/);
  }
  const mutations = [
    (j:Json) => { delete j.meshes[0].primitives[0].attributes.TEXCOORD_0; },
    (j:Json) => { j.materials[0].pbrMetallicRoughness.metallicFactor = 1.01; },
    (j:Json) => { j.materials[0].pbrMetallicRoughness.baseColorFactor = [1,1,1,-0.1]; },
    (j:Json) => { j.materials[0].occlusionTexture = { index:0, strength:2 }; },
    (j:Json) => { j.materials[0].doubleSided = 1; },
    (j:Json) => { j.images[0].mimeType = "image/jpeg"; },
    (j:Json) => { j.textures[0].source = 999; },
    (j:Json) => { j.samplers = [{ wrapS:1 }]; j.textures[0].sampler = 0; },
  ];
  for (const mutate of mutations) { const f = fixture(png()); mutate(f.json); assert.throws(f.run); }
  const image = png(); image[image.length - 1] ^= 1; assert.throws(fixture(image).run, /PNG/);
});

test("caps texture GPU instances across color spaces and distinct sampler uses", () => {
  const image = png(2048,2048), f = fixture(image);
  assert.equal(f.run().textureImages.length, 1);
  f.json.materials[0].normalTexture = { index:0 }; assert.throws(f.run, /GPU texture resource/);
  delete f.json.materials[0].normalTexture;
  f.json.samplers = [{ wrapS:33071 }]; f.json.textures.push({ source:0, sampler:0 });
  f.json.materials[0].emissiveTexture = { index:1 }; assert.throws(f.run, /GPU texture resource/);
});

test("caps rendered primitive and material amplification", () => {
  const f = fixture(); f.json.meshes[0].primitives = Array.from({ length:257 }, () => ({ attributes:{ POSITION:0 }, indices:1 }));
  assert.throws(f.run, /Primitive resource/);
  const g = fixture(); g.json.materials = Array.from({ length:65 }, () => ({}));
  g.json.meshes[0].primitives = Array.from({ length:65 }, (_, material) => ({ attributes:{ POSITION:0 }, indices:1, material }));
  assert.throws(g.run, /Material resource/);
  const h = fixture(); h.json.nodes = Array.from({ length:257 }, () => ({ mesh:0 })); h.json.scenes[0].nodes = h.json.nodes.map((_:Json, i:number) => i);
  assert.throws(h.run, /Rendered primitive resource/);
});

test("TRELLIS adapter continues requesting the approved colored-mesh texture preset", async () => {
  const { FalTrellisClient } = await import("../src/fal.ts");
  let calls = 0;
  const client = new FalTrellisClient({ apiKey:"fixture-only", fetch:async (url, options) => {
    calls++;
    assert.equal(url, "https://queue.fal.run/fal-ai/trellis"); assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(String(options?.body)), { image_url:"data:image/png;base64,fixture", mesh_simplify:0.98, texture_size:512 });
    return new Response(JSON.stringify({ request_id:"fixture-request" }));
  } });
  assert.equal((await client.create("data:image/png;base64,fixture")).id, "fixture-request"); assert.equal(calls, 1);
});

function unzipStored(bytes: Uint8Array) {
  const files = new Map<string,Uint8Array>(), view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let at=0;
  while(view.getUint32(at,true)===0x04034b50) {
    assert.equal(view.getUint16(at+8,true),0);
    const size=view.getUint32(at+18,true), nameSize=view.getUint16(at+26,true), extra=view.getUint16(at+28,true);
    const name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameSize)), start=at+30+nameSize+extra;
    const value=bytes.subarray(start,start+size);assert.equal(crc(value),view.getUint32(at+14,true));
    assert.ok(!name.includes("..")&&!name.startsWith("/"));files.set(name,value);at=start+size;
  }
  assert.equal(view.getUint32(at,true),0x02014b50);
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
  return files;
}
test("textured OBJ ZIP retains image bytes, linked materials and flipped OBJ UVs",()=>{
  const f=fixture(png()), hash="a".repeat(64), files=unzipStored(exportObjBundle(encode(f.json,f.binary),hash));
  assert.deepEqual(files.get("textures/0.png"),new Uint8Array(png()));
  const obj=new TextDecoder().decode(files.get("model.obj")),mtl=new TextDecoder().decode(files.get("model.mtl"));
  assert.match(obj,/mtllib model.mtl/);assert.match(obj,/usemtl material_0/);assert.match(obj,/vt 0 1\nvt 1 1\nvt 0 0/);assert.match(obj,/f 1\/1 2\/2 3\/3/);
  assert.match(mtl,/map_Kd textures\/0.png/);assert.match(mtl,/Kd 0.9999999999999999/);
  assert.equal(JSON.parse(new TextDecoder().decode(files.get("manifest.json"))).sourceGlbSha256,hash);
});
test("OBJ bundle preserves reflected transformed geometry and material factor colors",()=>{
  const f=fixture();f.json.nodes[0]={mesh:0,scale:[-2,3,1],translation:[4,5,6]};f.json.materials=[{pbrMetallicRoughness:{baseColorFactor:[1,0,.21404114,1]}}];f.json.meshes[0].primitives[0].material=0;
  const files=unzipStored(exportObjBundle(encode(f.json,f.binary),"a".repeat(64)));
  const obj=new TextDecoder().decode(files.get("model.obj")), mtl=new TextDecoder().decode(files.get("model.mtl"));
  assert.match(obj,/v 4 5 6\nv 2 5 6\nv 4 8 6/);assert.match(obj,/f 1\/1 3\/3 2\/2/);
  const kd=mtl.split("\n").find(line=>line.startsWith("Kd "))!.split(" ").slice(1).map(Number);assert.ok(Math.abs(kd[0]-1)<1e-8);assert.equal(kd[1],0);assert.ok(Math.abs(kd[2]-.5)<1e-6);
});
test("OBJ bundle retains seam-specific vertex colors as an explicitly documented extension",()=>{
  const f=fixture();f.json.meshes[0].primitives[0].attributes.COLOR_0=3;
  const files=unzipStored(exportObjBundle(encode(f.json,f.binary),"a".repeat(64))), obj=new TextDecoder().decode(files.get("model.obj"));
  const rgb=obj.split("\n").filter(line=>line.startsWith("v ")).map(line=>line.split(" ").slice(4).map(Number));
  assert.equal(rgb.length,3);assert.ok(rgb[0][0]>.99&&rgb[0][1]===0);assert.ok(rgb[1][1]>.99&&rgb[1][2]===0);assert.ok(rgb[2][2]>.99&&rgb[2][0]===0);
  assert.match(new TextDecoder().decode(files.get("README.txt")),/Vertex RGB is an OBJ extension/);
});
