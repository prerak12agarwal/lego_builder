import { ReconstructionError } from "./errors.ts";

// A 2048-square RGBA image consumes 16 MiB before mipmaps. Both decoded images
// and renderer texture instances share this pixel budget in the GLB validator.
export const TEXTURE_LIMITS = {
  images: 8, textures: 16, materials: 64, primitives: 256,
  edge: 2048, bytes: 8 * 1024 * 1024, pixels: 2048 * 2048,
} as const;

function fail(message: string): never {
  throw new ReconstructionError(message, "INVALID_GLB");
}

type ImageInfo = { width: number; height: number };
type PngInfo = ImageInfo & { channels: number; compressed: Uint8Array[] };
const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  crcTable[index] = value;
}
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function checkDimensions(width: number, height: number): void {
  if (!width || !height || width > TEXTURE_LIMITS.edge || height > TEXTURE_LIMITS.edge || width * height > TEXTURE_LIMITS.pixels) {
    fail("Embedded image exceeds resource limit");
  }
}
function checkSize(bytes: Uint8Array): void {
  if (bytes.length > TEXTURE_LIMITS.bytes) fail("Embedded image exceeds resource limit");
}
function paddingOnly(bytes: Uint8Array, offset: number): boolean {
  return bytes.length - offset <= 3 && bytes.subarray(offset).every(value => value === 0 || value === 32);
}

function inspectPng(bytes: Uint8Array): PngInfo {
  checkSize(bytes);
  if (bytes.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    fail("Unsupported embedded PNG signature");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const compressed: Uint8Array[] = [];
  let offset = 8, width = 0, height = 0, channels = 0, ended = false;
  const seenMetadata = new Set<string>();
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) fail("Malformed embedded PNG chunk");
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) {
      fail("Embedded PNG checksum mismatch");
    }
    if (kind === "IHDR") {
      if (offset !== 8 || length !== 13) fail("Malformed embedded PNG header");
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      checkDimensions(width, height);
      if (body[8] !== 8 || ![2, 6].includes(body[9]) || body[10] || body[11] || body[12]) {
        fail("Only noninterlaced 8-bit RGB or RGBA texture PNGs are supported");
      }
      channels = body[9] === 2 ? 3 : 4;
    } else if (!channels) {
      fail("Embedded PNG must start with IHDR");
    } else if (kind === "IDAT") {
      compressed.push(body);
    } else if (kind === "IEND") {
      if (length || !compressed.length) fail("Malformed embedded PNG end");
      offset += length + 12;
      ended = true;
      break;
    } else {
      // These fixed-size metadata chunks cannot contain compressed payloads.
      const fixedLength: Record<string, number> = { sRGB: 1, gAMA: 4, cHRM: 32, pHYs: 9 };
      if (compressed.length || fixedLength[kind] !== length || seenMetadata.has(kind)) {
        fail("Unsupported embedded PNG metadata");
      }
      if (kind === "sRGB" && body[0] > 3) fail("Invalid embedded PNG rendering intent");
      if (kind === "gAMA" && view.getUint32(offset + 8) === 0) fail("Invalid embedded PNG gamma");
      if (kind === "pHYs" && body[8] > 1) fail("Invalid embedded PNG units");
      seenMetadata.add(kind);
    }
    offset += length + 12;
  }
  if (!ended || !paddingOnly(bytes, offset)) fail("Malformed embedded PNG end");
  return { width, height, channels, compressed };
}

function inspectJpeg(bytes: Uint8Array): ImageInfo {
  checkSize(bytes);
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) fail("Unsupported embedded JPEG signature");
  let offset = 2, width = 0, height = 0, components = 0, scans = 0, ended = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) fail("Malformed embedded JPEG marker");
    while (offset < bytes.length && bytes[offset] === 255) offset++;
    if (offset >= bytes.length) fail("Truncated embedded JPEG marker");
    const marker = bytes[offset++];
    if (marker === 217) { ended = true; break; }
    if (marker === 0 || marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) fail("Unsupported embedded JPEG marker");
    if (offset + 2 > bytes.length) fail("Truncated embedded JPEG segment");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) fail("Truncated embedded JPEG segment");
    const isFrame = marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker);
    if (isFrame) {
      if (![192, 194].includes(marker) || width || length < 8 || bytes[offset + 2] !== 8) fail("Unsupported embedded JPEG frame");
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      components = bytes[offset + 7];
      if (![1, 3].includes(components) || length !== 8 + 3 * components) fail("Unsupported embedded JPEG components");
      checkDimensions(width, height);
      for (let index = 0; index < components; index++) {
        const sampling = bytes[offset + 9 + index * 3];
        if (!(sampling >> 4) || (sampling >> 4) > 4 || !(sampling & 15) || (sampling & 15) > 4) fail("Invalid embedded JPEG sampling");
      }
    } else if (marker === 218) {
      if (!width || length < 6) fail("Invalid embedded JPEG scan");
      const count = bytes[offset + 2];
      if (!count || count > components || length !== 6 + count * 2 || ++scans > 64) fail("Invalid embedded JPEG scan");
      offset += length;
      // Entropy data contains stuffed FF00 bytes and restart markers; the next
      // real marker must still be parsed so truncation/second frames fail.
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const start = offset++;
        while (offset < bytes.length && bytes[offset] === 255) offset++;
        if (offset >= bytes.length) fail("Truncated embedded JPEG scan");
        if (bytes[offset] === 0 || (bytes[offset] >= 208 && bytes[offset] <= 215)) { offset++; continue; }
        offset = start;
        break;
      }
      continue;
    } else if (![196, 219, 221, 254].includes(marker) && !(marker >= 224 && marker <= 239)) {
      fail("Unsupported embedded JPEG segment");
    }
    offset += length;
  }
  if (!ended || !width || !height || !scans || !paddingOnly(bytes, offset)) fail("Truncated embedded JPEG image");
  return { width, height };
}

/** Structural checks performed before any browser image allocation. */
export function inspectTextureImage(bytes: Uint8Array, mime: unknown): ImageInfo {
  if (mime === "image/png") { const { width, height } = inspectPng(bytes); return { width, height }; }
  if (mime === "image/jpeg") return inspectJpeg(bytes);
  return fail("Unsupported embedded image MIME type");
}

/** Worker-compatible bounded PNG inflation; never buffers decoded image pixels. */
export async function validateTextureImageData(bytes: Uint8Array, mime: unknown): Promise<void> {
  if (mime !== "image/png") { inspectTextureImage(bytes, mime); return; }
  const image = inspectPng(bytes);
  const rowBytes = image.width * image.channels + 1;
  const expected = rowBytes * image.height;
  const input = new Blob(image.compressed as BlobPart[]).stream();
  const reader = input.pipeThrough(new DecompressionStream("deflate")).getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > expected - total) fail("Embedded PNG inflation exceeds declared dimensions");
      let filterOffset = (rowBytes - total % rowBytes) % rowBytes;
      while (filterOffset < value.length) {
        if (value[filterOffset] > 4) fail("Invalid embedded PNG scanline filter");
        filterOffset += rowBytes;
      }
      total += value.byteLength;
    }
    if (total !== expected) fail("Truncated embedded PNG pixels");
  } catch (cause) {
    await reader.cancel().catch(() => {});
    if (cause instanceof ReconstructionError) throw cause;
    fail("Malformed embedded PNG compressed pixels");
  } finally {
    reader.releaseLock();
  }
}
