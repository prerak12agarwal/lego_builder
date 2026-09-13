import test from "node:test";
import assert from "node:assert/strict";
import { ReconstructionError } from "../core/src/errors.ts";
import { createGeometryGlb, validateGlbAndExportObj } from "../core/src/glb.ts";

function glb(json: Record<string, unknown>, binary: Uint8Array) {
  const encoder = new TextEncoder();
  let encoded = encoder.encode(JSON.stringify(json));
  encoded = new Uint8Array([...encoded, ...Array((4 - encoded.length % 4) % 4).fill(0x20)]);
  const padded = new Uint8Array([...binary, ...Array((4 - binary.length % 4) % 4).fill(0)]);
  const out = new Uint8Array(12 + 8 + encoded.length + 8 + padded.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, encoded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(encoded, 20);
  view.setUint32(20 + encoded.length, padded.length, true);
  view.setUint32(24 + encoded.length, 0x004e4942, true);
  out.set(padded, 28 + encoded.length);
  return out;
}

function triangle(node: Record<string, unknown> = {}) {
  const binary = new Uint8Array(42);
  const view = new DataView(binary.buffer);
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((position, index) =>
    position.forEach((value, axis) => view.setFloat32(index * 12 + axis * 4, value, true)));
  view.setUint16(36, 0, true);
  view.setUint16(38, 1, true);
  view.setUint16(40, 2, true);
  return glb({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 42 }],
    bufferViews: [{ byteOffset: 0, byteLength: 36 }, { byteOffset: 36, byteLength: 6 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0, ...node }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }, binary);
}

test("reflected node transforms preserve a valid one-based OBJ face", () => {
  const prepared = validateGlbAndExportObj(triangle({ scale: [-1, 1, 1] }));
  assert.deepEqual([...prepared.geometry.indices], [0, 2, 1]);
  assert.match(prepared.obj, /^f 1 3 2$/m);
  assert.doesNotMatch(prepared.obj, /^f .*\b0\b/m);
});

test("node traversal rejects excessive depth deterministically", () => {
  const raw = triangle();
  const jsonLength = new DataView(raw.buffer).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(raw.slice(20, 20 + jsonLength)).trim());
  json.nodes = Array.from({ length: 66 }, (_, index) => index === 65 ? { mesh: 0 } : { children: [index + 1] });
  json.scenes = [{ nodes: [0] }];
  assert.throws(() => validateGlbAndExportObj(glb(json, raw.slice(28 + jsonLength))), /Node graph exceeds resource limit/);
});

test("neutral GLB rejects non-finite coordinates", () => {
  assert.throws(() => createGeometryGlb({
    positions: new Float32Array([0, 0, 0, Infinity, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  }), /Invalid geometry/);
});

test("malformed extension metadata is classified as invalid GLB", () => {
  const raw = triangle();
  const jsonLength = new DataView(raw.buffer).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(raw.slice(20, 20 + jsonLength)).trim());
  json.extensionsUsed = { malicious: true };
  assert.throws(
    () => validateGlbAndExportObj(glb(json, raw.slice(28 + jsonLength))),
    (error: unknown) => error instanceof ReconstructionError && error.code === "INVALID_GLB",
  );
});
