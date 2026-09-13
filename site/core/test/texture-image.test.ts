import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { inspectTextureImage, validateTextureImageData } from "../src/texture-image.ts";

function crc(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(kind: string, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + bytes.length), view = new DataView(out.buffer);
  view.setUint32(0, bytes.length);
  out.set(new TextEncoder().encode(kind), 4); out.set(bytes, 8);
  view.setUint32(out.length - 4, crc(out.subarray(4, -4)));
  return out;
}
function png(width: number, height: number, pixels: Uint8Array, metadata: Uint8Array[] = []): Uint8Array {
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header.set([8, 6, 0, 0, 0], 8);
  const chunks = [chunk("IHDR", header), ...metadata, chunk("IDAT", deflateSync(pixels)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(8 + chunks.reduce((size, value) => size + value.length, 0));
  out.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  for (const value of chunks) { out.set(value, offset); offset += value.length; }
  return out;
}

test("validates actual PNG pixels with bounded streaming inflation", async () => {
  const bytes = png(2, 2, new Uint8Array([0,255,0,0,255,0,255,0,255,0,0,0,255,255,255,255,0,255]));
  assert.deepEqual(inspectTextureImage(bytes, "image/png"), { width: 2, height: 2 });
  await validateTextureImageData(bytes, "image/png");
  assert.throws(() => inspectTextureImage(bytes, "image/jpeg"), /signature/);
  const corrupt = bytes.slice(); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => inspectTextureImage(corrupt, "image/png"), /checksum/);
});

test("rejects forged dimensions, oversized decoded data and invalid filters", async () => {
  assert.throws(() => inspectTextureImage(png(2049, 1, new Uint8Array()), "image/png"), /resource limit/);
  const bomb = png(1, 1, new Uint8Array(2 * 1024 * 1024));
  await assert.rejects(validateTextureImageData(bomb, "image/png"), /inflation exceeds/);
  await assert.rejects(validateTextureImageData(png(1, 1, new Uint8Array(4)), "image/png"), /Truncated/);
  await assert.rejects(validateTextureImageData(png(1, 1, new Uint8Array([5,0,0,0,255])), "image/png"), /scanline filter/);
});

test("scanline filters are checked across decompression output boundaries", async () => {
  const width = 127, height = 91, row = width * 4 + 1;
  const pixels = new Uint8Array(row * height);
  await validateTextureImageData(png(width, height, pixels), "image/png");
  pixels[80 * row] = 255;
  await assert.rejects(validateTextureImageData(png(width, height, pixels), "image/png"), /scanline filter/);
});

test("rejects compressed PNG metadata and truncated image structure", () => {
  const pixels = new Uint8Array(5);
  assert.throws(() => inspectTextureImage(png(1, 1, pixels, [chunk("iCCP", new Uint8Array([0]))]), "image/png"), /metadata/);
  const bytes = png(1, 1, pixels);
  assert.throws(() => inspectTextureImage(bytes.subarray(0, -3), "image/png"), /Malformed/);
  assert.deepEqual(inspectTextureImage(png(1, 1, pixels, [chunk("sRGB", new Uint8Array([0]))]), "image/png"), {width:1,height:1});
});

test("JPEG dimensions require a complete bounded frame, scan and end marker", () => {
  // Structural fixture only: entropy decoding remains the browser's job.
  const structuralJpeg = new Uint8Array([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
  assert.deepEqual(inspectTextureImage(structuralJpeg, "image/jpeg"), {width:1,height:1});
  assert.throws(() => inspectTextureImage(structuralJpeg.subarray(0, 15), "image/jpeg"), /Truncated/);
  assert.throws(() => inspectTextureImage(structuralJpeg.subarray(0, -2), "image/jpeg"), /Truncated/);
  const excessive = structuralJpeg.slice(); excessive[9] = 16;
  assert.throws(() => inspectTextureImage(excessive, "image/jpeg"), /resource limit/);
});
