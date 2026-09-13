import { validateImageInput } from "../core/src/image.ts";
import { LIMITS } from "./limits.ts";
import { HttpError, readLimited } from "./http.ts";

/** Accept the bounded, metadata-free PNG produced by our browser preprocessing. */
export async function validateNormalizedPng(bytes: Uint8Array) {
  const bad = () => { throw new HttpError(400, "The image could not be read. Choose a valid JPG or PNG again."); };
  let info;
  try { info = validateImageInput(bytes); } catch { return bad(); }
  if (info.kind !== "png" || info.width > LIMITS.imageEdge || info.height > LIMITS.imageEdge) return bad();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, ended = false, channels = 0;
  const compressed: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (offset + length + 12 > bytes.length) return bad();
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(offset + 8 + length)) return bad();
    if (kind === "IHDR") {
      if (offset !== 8 || length !== 13 || bytes[offset + 16] !== 8 || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20]) return bad();
      channels = bytes[offset + 17] === 6 ? 4 : bytes[offset + 17] === 2 ? 3 : 0;
      if (!channels) return bad();
    } else if (kind === "IDAT") compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    else if (kind === "IEND") { if (length || !compressed.length) return bad(); ended = true; }
    else if (!["sRGB", "gAMA", "cHRM", "pHYs"].includes(kind)) return bad();
    offset += length + 12;
    if (ended) break;
  }
  if (!ended || offset !== bytes.length || !channels) return bad();
  const expected = (info.width * channels + 1) * info.height;
  try {
    const stream = new Blob(compressed as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate"));
    const decoded = await readLimited(stream, expected);
    if (decoded.length !== expected) return bad();
    for (let i = 0; i < decoded.length; i += info.width * channels + 1) if (decoded[i] > 4) return bad();
  } catch { return bad(); }
  return info;
}
