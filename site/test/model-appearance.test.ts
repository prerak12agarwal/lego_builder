import test from "node:test";
import assert from "node:assert/strict";
import { MeshBasicMaterial, MeshStandardMaterial, Texture, DoubleSide } from "three";
import { baseColorMaterial } from "../lib/model-appearance.ts";

test("base-color preview preserves texture, factor, vertex colors and alpha without changing the source material", () => {
  const map = new Texture(), alphaMap = new Texture();
  const source = new MeshStandardMaterial({ map, color: 0x069d9f, metalness: 1, roughness: 1, vertexColors: true, transparent: true, opacity: .6, alphaTest: .2, alphaMap, side: DoubleSide });
  const preview = baseColorMaterial(source) as MeshBasicMaterial;
  assert.ok(preview instanceof MeshBasicMaterial);
  assert.equal(preview.map, map); assert.equal(preview.alphaMap, alphaMap);
  assert.deepEqual(preview.color, source.color); assert.notEqual(preview.color, source.color);
  for (const key of ["vertexColors", "transparent", "opacity", "alphaTest", "side", "depthWrite"] as const) assert.equal(preview[key], source[key]);
  assert.equal(preview.toneMapped, false);
  assert.equal(source.metalness, 1); assert.equal(source.roughness, 1); assert.equal(source.map, map);
});
