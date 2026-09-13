import { ReconstructionError } from "./errors.ts";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export type ImageKind = "png" | "jpeg";
export interface ValidatedImage { kind: ImageKind; width: number; height: number; bytes: number; }

function fail(message: string): never { throw new ReconstructionError(message, "INVALID_IMAGE"); }
function u16(b: Uint8Array, i: number) { return (b[i] << 8) | b[i + 1]; }
function u32(b: Uint8Array, i: number) { return ((b[i] * 0x1000000) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]) >>> 0; }
function dimensions(width: number, height: number): { width: number; height: number } {
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) fail("Image dimensions are unsupported");
  return { width, height };
}

function png(bytes: Uint8Array) {
  if (bytes.length < 24 || u32(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") fail("Invalid PNG header");
  return dimensions(u32(bytes, 16), u32(bytes, 20));
}
function jpeg(bytes: Uint8Array) {
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i++] !== 0xff) fail("Invalid JPEG marker");
    while (bytes[i] === 0xff) i++;
    const marker = bytes[i++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= bytes.length) break;
    const length = u16(bytes, i);
    if (length < 2 || i + length > bytes.length) fail("Invalid JPEG segment");
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (length < 8) fail("Invalid JPEG dimensions");
      return dimensions(u16(bytes, i + 5), u16(bytes, i + 3));
    }
    i += length;
  }
  fail("JPEG has no supported image dimensions");
}

/** Checks genuine PNG/JPEG structure enough to bound upload work. Callers should normalize accepted images to PNG. */
export function validateImageInput(bytes: Uint8Array): ValidatedImage {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail("Image must be no more than 10 MB");
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { kind: "png", ...png(bytes), bytes: bytes.length };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "jpeg", ...jpeg(bytes), bytes: bytes.length };
  fail("Only PNG and JPEG images are supported");
}
