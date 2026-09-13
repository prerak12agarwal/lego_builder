import { ReconstructionError } from "./errors.ts";
import { inspectTextureImage, TEXTURE_LIMITS } from "./texture-image.ts";

export interface GlbLimits { maxBytes?: number }
const DEFAULT_LIMITS = { maxBytes: 16 * 1024 * 1024, maxVertices: 25_000, maxTriangles: 50_000 };
const MAX_VERTICES = DEFAULT_LIMITS.maxVertices, MAX_TRIANGLES = DEFAULT_LIMITS.maxTriangles;
type Json = Record<string, any>;
type Vec3 = [number, number, number];
export interface MeshStats { vertexCount: number; triangleCount: number; bounds: { min: Vec3; max: Vec3 } }
export interface PreparedMesh {
  obj: string;
  glb: Uint8Array;
  geometry: { positions: Float32Array; indices: Uint32Array };
  textureImages: Array<{ bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" }>;
  stats: MeshStats;
  manifest: {
    version: 1; format: "obj"; sourceFormat: "glb"; transformsBaked: true;
    axes: "provider-native"; physicalScale: "unknown"; converterEligibility: "unchecked";
    validation: "strict-glb-appearance-v2";
    appearance: { status: "preserved" | "absent"; glbTransforms: "authored" };
    stats: MeshStats;
  };
}
function fail(message: string): never { throw new ReconstructionError(message, "INVALID_GLB"); }
function object(value: unknown, name: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`Invalid ${name}`);
  return value as Json;
}
function checkedObject(value: unknown, name: string, allowUnlit = false): Json {
  const result = object(value, name);
  if (result.extensions !== undefined) {
    const extensions = object(result.extensions, `${name} extensions`);
    for (const [key, payload] of Object.entries(extensions)) {
      if (!allowUnlit || key !== "KHR_materials_unlit" || Object.keys(object(payload, "unlit extension")).length) {
        fail(`Unsupported ${name} extension`);
      }
    }
  }
  return result;
}
function array(value: unknown, name: string): any[] {
  if (!Array.isArray(value)) fail(`Invalid ${name}`);
  return value;
}
function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`Invalid ${name}`);
  return value;
}
function integer(value: unknown, name: string): number {
  const result = number(value, name);
  if (!Number.isSafeInteger(result) || result < 0) fail(`Invalid ${name}`);
  return result;
}
function vector(value: unknown, size: number, name: string): number[] {
  const result = array(value, name);
  if (result.length !== size) fail(`Invalid ${name}`);
  return result.map(item => number(item, name));
}
function unit(value: unknown, name: string): number {
  const result = number(value, name);
  if (result < 0 || result > 1) fail(`Invalid ${name}`);
  return result;
}
function enumValue(value: unknown, allowed: readonly unknown[], name: string): any {
  if (!allowed.includes(value)) fail(`Invalid ${name}`);
  return value;
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function matrixMultiply(a: number[], b: number[]): number[] {
  const result = Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return result;
}
function determinant3(m: number[]): number {
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
}
function nodeMatrix(node: Json): number[] {
  let matrix: number[];
  if (node.matrix !== undefined) {
    if ([node.translation, node.rotation, node.scale].some(value => value !== undefined)) fail("Node matrix and TRS are mutually exclusive");
    matrix = vector(node.matrix, 16, "node matrix");
    if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) fail("Node matrix must be affine");
    // glTF matrices must decompose to TRS. Shear would be lost by GLTFLoader's decomposition.
    const lengths = [0, 4, 8].map(offset => Math.hypot(matrix[offset], matrix[offset + 1], matrix[offset + 2]));
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
      const dot = [0, 1, 2].reduce((sum, k) => sum + matrix[a * 4 + k] * matrix[b * 4 + k], 0);
      if (!Number.isFinite(dot) || Math.abs(dot) > 1e-7 * lengths[a] * lengths[b]) fail("Node matrix cannot contain shear");
    }
  } else {
    const t = node.translation === undefined ? [0, 0, 0] : vector(node.translation, 3, "translation");
    const s = node.scale === undefined ? [1, 1, 1] : vector(node.scale, 3, "scale");
    const q = node.rotation === undefined ? [0, 0, 0, 1] : vector(node.rotation, 4, "rotation");
    if (Math.abs(Math.hypot(...q) - 1) > 1e-6) fail("Node rotation must be a unit quaternion");
    const [x, y, z, w] = q, xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z, wx = w*x, wy = w*y, wz = w*z;
    matrix = [(1-2*(yy+zz))*s[0], 2*(xy+wz)*s[0], 2*(xz-wy)*s[0], 0,
      2*(xy-wz)*s[1], (1-2*(xx+zz))*s[1], 2*(yz+wx)*s[1], 0,
      2*(xz+wy)*s[2], 2*(yz-wx)*s[2], (1-2*(xx+yy))*s[2], 0, ...t, 1];
  }
  if (!matrix.every(Number.isFinite) || !Number.isFinite(determinant3(matrix)) || Math.abs(determinant3(matrix)) < 1e-12) fail("Invalid node transform");
  return matrix;
}
function transform(m: number[], x: number, y: number, z: number): Vec3 {
  const point: Vec3 = [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
  if (!point.every(value => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) fail("Invalid transformed vertex");
  return point;
}
function makeGlb(json: Json, binary: Uint8Array): Uint8Array {
  const source = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(source.length / 4) * 4, binarySize = Math.ceil(binary.length / 4) * 4;
  const output = new Uint8Array(28 + jsonSize + binarySize), view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonSize); output.set(source, 20);
  view.setUint32(20 + jsonSize, binarySize, true); view.setUint32(24 + jsonSize, 0x004e4942, true);
  output.set(binary, 28 + jsonSize);
  return output;
}
/** Creates a compact, self-contained GLB from already validated baked geometry. */
export function createGeometryGlb(geometry: { positions: Float32Array; indices: Uint32Array }): Uint8Array {
  if (!geometry.positions.length || geometry.positions.length % 3 || !geometry.indices.length || geometry.indices.length % 3 || geometry.positions.some(value => !Number.isFinite(value))) fail("Invalid geometry");
  const vertices = geometry.positions.length / 3;
  if (vertices > MAX_VERTICES || geometry.indices.length / 3 > MAX_TRIANGLES || geometry.indices.some(value => value >= vertices)) fail("Mesh resource limit exceeded");
  const binary = new Uint8Array(geometry.positions.byteLength + geometry.indices.byteLength);
  binary.set(new Uint8Array(geometry.positions.buffer, geometry.positions.byteOffset, geometry.positions.byteLength));
  binary.set(new Uint8Array(geometry.indices.buffer, geometry.indices.byteOffset, geometry.indices.byteLength), geometry.positions.byteLength);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let row = 0; row < geometry.positions.length; row += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], geometry.positions[row + axis]);
      max[axis] = Math.max(max[axis], geometry.positions[row + axis]);
    }
  }
  return makeGlb({
    asset: { version: "2.0", generator: "LEGO Builder geometry export" }, buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: geometry.positions.byteLength }, { buffer: 0, byteOffset: geometry.positions.byteLength, byteLength: geometry.indices.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: vertices, type: "VEC3", min, max }, { bufferView: 1, componentType: 5125, count: geometry.indices.length, type: "SCALAR" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  }, binary);
}

interface Accessor {
  canonical: number; start: number; count: number; component: number;
  components: number; size: number; stride: number; normalized: boolean;
}
/** Validate the selected scene and rebuild only its reachable, supported resource graph. */
export function validateGlbAndExportObj(bytes: Uint8Array, suppliedLimits: GlbLimits = {}): PreparedMesh {
  const limits = { ...DEFAULT_LIMITS, ...suppliedLimits };
  if (bytes.byteLength < 20 || bytes.byteLength > limits.maxBytes) fail("GLB size is unsupported");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength) fail("Invalid GLB header");
  let offset = 12, json: Json | undefined, binary: Uint8Array | undefined;
  while (offset + 8 <= bytes.length) {
    const length = header.getUint32(offset, true), type = header.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 || offset + length > bytes.length) fail("Invalid GLB chunk");
    const chunk = bytes.subarray(offset, offset + length);
    offset += length;
    if (type === 0x4e4f534a) {
      if (json || binary) fail("Invalid GLB JSON chunk order");
      if (length > 1024 * 1024) fail("GLB metadata limit exceeded");
      try { json = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(chunk)), "GLB JSON"); }
      catch { fail("Invalid GLB JSON"); }
    } else if (type === 0x004e4942) {
      if (!json || binary) fail("Invalid GLB binary chunk order");
      binary = chunk;
    } else fail("Unsupported GLB chunk");
  }
  if (offset !== bytes.length || !json || !binary) fail("GLB must contain JSON and binary chunks");
  checkedObject(json, "root");
  for (const declaration of ["extensionsUsed", "extensionsRequired"]) {
    if (!array(json[declaration] ?? [], declaration).every(value => value === "KHR_materials_unlit")) fail("GLB uses unsupported resources");
  }
  if (json.animations !== undefined || json.skins !== undefined) fail("GLB uses unsupported resources");
  const asset = checkedObject(json.asset, "asset");
  if (asset.version !== "2.0" || (asset.minVersion !== undefined && asset.minVersion !== "2.0")) fail("Unsupported glTF version");
  const buffers = array(json.buffers, "buffers");
  if (buffers.length !== 1) fail("GLB must have one embedded buffer");
  const buffer = checkedObject(buffers[0], "buffer"), declaredLength = integer(buffer.byteLength, "buffer byteLength");
  if (buffer.uri !== undefined || !declaredLength || declaredLength > binary.length || binary.length - declaredLength > 3) fail("GLB must have one embedded buffer");
  const bin = binary.subarray(0, declaredLength), data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const source = (key: string): any[] => array(json![key] ?? [], key);
  const sourceViews = source("bufferViews"), sourceAccessors = source("accessors"), sourceNodes = source("nodes"), sourceMeshes = source("meshes");
  const sourceMaterials = source("materials"), sourceTextures = source("textures"), sourceImages = source("images"), sourceSamplers = source("samplers");
  const canonical: Json = {
    asset: { version: "2.0", generator: "LEGO Builder checked appearance export" },
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], meshes: [], nodes: [], scenes: [], scene: 0,
  };
  const outputViews: Json[] = canonical.bufferViews, outputAccessors: Json[] = canonical.accessors;
  const outputMeshes: Json[] = canonical.meshes, outputNodes: Json[] = canonical.nodes;
  const outputMaterials: Json[] = [], outputTextures: Json[] = [], outputImages: Json[] = [], outputSamplers: Json[] = [];
  const binaryParts: Array<{ offset: number; bytes: Uint8Array }> = [];
  let binaryLength = 0;
  const viewCache = new Map<number, { canonical: number; start: number; length: number; stride?: number }>();
  function retainView(id: unknown, image = false) {
    const index = integer(id, "bufferView index");
    const candidate = checkedObject(sourceViews[index], "bufferView");
    if (integer(candidate.buffer ?? 0, "bufferView buffer") !== 0) fail("Buffer view references an unsupported buffer");
    const start = integer(candidate.byteOffset ?? 0, "bufferView offset"), length = integer(candidate.byteLength, "bufferView length");
    if (!length || start + length > declaredLength || !Number.isSafeInteger(start + length)) fail("Accessor exceeds declared binary buffer");
    const stride = candidate.byteStride === undefined ? undefined : integer(candidate.byteStride, "bufferView stride");
    if (stride !== undefined && (stride < 4 || stride > 252 || stride % 4)) fail("Invalid bufferView stride");
    if (candidate.target !== undefined) enumValue(candidate.target, [34962, 34963], "bufferView target");
    if (image && (stride !== undefined || candidate.target !== undefined)) fail("Invalid image bufferView");
    const cached = viewCache.get(index);
    if (cached) return cached;
    // Keep each view's internal accessor offsets, but drop all unreferenced binary regions.
    const newOffset = Math.ceil(binaryLength / 4) * 4;
    if (newOffset + length > limits.maxBytes) fail("Canonical binary resource limit exceeded");
    const out: Json = { buffer: 0, byteOffset: newOffset, byteLength: length };
    if (stride !== undefined) out.byteStride = stride;
    if (candidate.target !== undefined) out.target = candidate.target;
    const result = { canonical: outputViews.length, start, length, stride };
    outputViews.push(out); viewCache.set(index, result);
    binaryParts.push({ offset: newOffset, bytes: bin.subarray(start, start + length) });
    binaryLength = newOffset + length;
    return result;
  }
  const accessorCache = new Map<number, Accessor>();
  function access(id: unknown): Accessor {
    const index = integer(id, "accessor index"), cached = accessorCache.get(index);
    if (cached) return cached;
    const candidate = checkedObject(sourceAccessors[index], "accessor");
    if (candidate.sparse !== undefined || candidate.bufferView === undefined) fail("Sparse or detached accessors are unsupported");
    const view = retainView(candidate.bufferView);
    const localOffset = integer(candidate.byteOffset ?? 0, "accessor offset"), count = integer(candidate.count, "accessor count");
    const component = integer(candidate.componentType, "component type");
    enumValue(candidate.type, ["SCALAR", "VEC2", "VEC3", "VEC4"], "accessor type");
    const components = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[candidate.type] ?? 0;
    const size = ({ 5121: 1, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[component] ?? 0;
    if (!count || count > MAX_TRIANGLES * 3 || !components || !size) fail("Unsupported accessor shape or resource limit");
    if (candidate.normalized !== undefined && typeof candidate.normalized !== "boolean") fail("Invalid accessor normalized flag");
    const normalized = candidate.normalized === true;
    if (normalized && ![5121, 5123].includes(component)) fail("Unsupported normalized accessor component");
    const stride = view.stride ?? size * components;
    const end = localOffset + (count - 1) * stride + size * components;
    if (stride < size * components || stride % size || localOffset % size || (view.start + localOffset) % size || end > view.length || !Number.isSafeInteger(end)) fail("Accessor exceeds binary buffer or alignment");
    for (const key of ["min", "max"]) {
      if (candidate[key] === undefined) continue;
      const bounds = vector(candidate[key], components, `accessor ${key}`);
      if (component !== 5126 && bounds.some(value => !Number.isInteger(value) || value < 0 || value > (component === 5121 ? 255 : component === 5123 ? 65535 : 4294967295))) fail("Invalid accessor bounds");
    }
    if (candidate.min && candidate.max && candidate.min.some((value: number, axis: number) => value > candidate.max[axis])) fail("Invalid accessor bounds");
    const out: Json = { bufferView: view.canonical, byteOffset: localOffset, componentType: component, count, type: candidate.type };
    if (candidate.normalized !== undefined) out.normalized = normalized;
    const result = { canonical: outputAccessors.length, start: view.start + localOffset, count, component, components, size, stride, normalized };
    outputAccessors.push(out); accessorCache.set(index, result);
    return result;
  }
  function componentValue(accessor: Accessor, row: number, column: number): number {
    const at = accessor.start + row * accessor.stride + column * accessor.size;
    if (accessor.component === 5126) return data.getFloat32(at, true);
    if (accessor.component === 5125) return data.getUint32(at, true);
    if (accessor.component === 5123) return data.getUint16(at, true);
    return data.getUint8(at);
  }
  function attribute(id: unknown, count: number | undefined, semantic: string): Accessor {
    const item = access(id);
    if (count !== undefined && item.count !== count) fail("Attribute count does not match positions");
    if (item.start % 4 || item.stride % 4) fail("Invalid vertex attribute alignment");
    const float = item.component === 5126 && !item.normalized;
    const normalizedInteger = [5121, 5123].includes(item.component) && item.normalized;
    if (semantic === "POSITION" && (!float || item.components !== 3 || item.count > MAX_VERTICES)) fail("Positions must be nonempty float32 VEC3");
    if (semantic === "NORMAL" && (!float || item.components !== 3)) fail("Unsupported normal attribute");
    if (semantic === "TANGENT" && (!float || item.components !== 4)) fail("Unsupported tangent attribute");
    if (semantic.startsWith("TEXCOORD_") && (!(float || normalizedInteger) || item.components !== 2)) fail("Unsupported texture coordinate attribute");
    if (semantic === "COLOR_0" && (!(float || normalizedInteger) || ![3, 4].includes(item.components))) fail("Unsupported color attribute");
    const min = Array(item.components).fill(Infinity), max = Array(item.components).fill(-Infinity);
    for (let row = 0; row < item.count; row++) {
      for (let column = 0; column < item.components; column++) {
        const value = componentValue(item, row, column);
        if (!Number.isFinite(value)) fail("Non-finite attribute value");
        if (semantic === "COLOR_0" && float && (value < 0 || value > 1)) fail("Invalid vertex color value");
        if (semantic === "TANGENT" && column === 3 && value !== -1 && value !== 1) fail("Invalid tangent handedness");
        min[column] = Math.min(min[column], value); max[column] = Math.max(max[column], value);
      }
    }
    // Never trust supplied POSITION bounds used by browser framing and culling.
    if (semantic === "POSITION") Object.assign(outputAccessors[item.canonical], { min, max });
    return item;
  }
  const textureImages: PreparedMesh["textureImages"] = [];
  const imageCache = new Map<number, { canonical: number; pixels: number }>();
  let imageBytes = 0, imagePixels = 0, gpuPixels = 0;
  function retainImage(id: unknown) {
    const index = integer(id, "image index"), cached = imageCache.get(index);
    if (cached) return cached;
    if (outputImages.length >= TEXTURE_LIMITS.images) fail("Embedded images exceed resource limit");
    const candidate = checkedObject(sourceImages[index], "image");
    if (candidate.uri !== undefined || candidate.bufferView === undefined) fail("GLB image must be embedded");
    const mimeType = enumValue(candidate.mimeType, ["image/png", "image/jpeg"], "image MIME type") as "image/png" | "image/jpeg";
    const view = retainView(candidate.bufferView, true);
    imageBytes += view.length;
    if (imageBytes > TEXTURE_LIMITS.bytes) fail("Embedded images exceed resource limit");
    const payload = bin.subarray(view.start, view.start + view.length);
    const { width, height } = inspectTextureImage(payload, mimeType);
    const pixels = width * height;
    imagePixels += pixels;
    if (width > TEXTURE_LIMITS.edge || height > TEXTURE_LIMITS.edge || imagePixels > TEXTURE_LIMITS.pixels) fail("Embedded images exceed resource limit");
    const result = { canonical: outputImages.length, pixels };
    imageCache.set(index, result);
    outputImages.push({ bufferView: view.canonical, mimeType });
    textureImages.push({ bytes: payload, mimeType });
    return result;
  }
  const samplerCache = new Map<number, { canonical: number; key: string }>();
  function retainSampler(id: unknown) {
    const index = integer(id, "sampler index"), cached = samplerCache.get(index);
    if (cached) return cached;
    if (outputSamplers.length >= TEXTURE_LIMITS.textures) fail("Sampler resource limit exceeded");
    const candidate = checkedObject(sourceSamplers[index], "sampler"), out: Json = {};
    if (candidate.magFilter !== undefined) out.magFilter = enumValue(candidate.magFilter, [9728, 9729], "magFilter");
    if (candidate.minFilter !== undefined) out.minFilter = enumValue(candidate.minFilter, [9728, 9729, 9984, 9985, 9986, 9987], "minFilter");
    for (const key of ["wrapS", "wrapT"]) if (candidate[key] !== undefined) out[key] = enumValue(candidate[key], [33071, 33648, 10497], key);
    const result = { canonical: outputSamplers.length, key: JSON.stringify([out.magFilter ?? 9729, out.minFilter ?? 9987, out.wrapS ?? 10497, out.wrapT ?? 10497]) };
    outputSamplers.push(out); samplerCache.set(index, result);
    return result;
  }
  const textureCache = new Map<number, { canonical: number; image: ReturnType<typeof retainImage>; samplerKey: string }>();
  const gpuInstances = new Set<string>();
  function retainTexture(id: unknown, colorSpace: "srgb" | "linear") {
    const index = integer(id, "texture index");
    let result = textureCache.get(index);
    if (!result) {
      if (outputTextures.length >= TEXTURE_LIMITS.textures) fail("Texture resource limit exceeded");
      const candidate = checkedObject(sourceTextures[index], "texture");
      if (candidate.uri !== undefined || candidate.source === undefined) fail("Unsupported texture source");
      const image = retainImage(candidate.source);
      const sampler = candidate.sampler === undefined ? undefined : retainSampler(candidate.sampler);
      const out: Json = { source: image.canonical };
      if (sampler) out.sampler = sampler.canonical;
      result = { canonical: outputTextures.length, image, samplerKey: sampler?.key ?? JSON.stringify([9729, 9987, 10497, 10497]) };
      outputTextures.push(out); textureCache.set(index, result);
    }
    // RGBA plus a complete mip chain costs at most 16/3 bytes per budgeted pixel.
    const key = `${result.image.canonical}:${result.samplerKey}:${colorSpace}`;
    if (!gpuInstances.has(key)) {
      gpuInstances.add(key); gpuPixels += result.image.pixels;
      if (gpuInstances.size > TEXTURE_LIMITS.textures || gpuPixels > TEXTURE_LIMITS.pixels) fail("GPU texture resource limit exceeded");
    }
    return result.canonical;
  }
  const materialCache = new Map<number, { canonical: number; uvs: Set<number> }>();
  let hasUnlit = false;
  function retainMaterial(id: unknown) {
    const index = integer(id, "material index"), cached = materialCache.get(index);
    if (cached) return cached;
    if (outputMaterials.length >= TEXTURE_LIMITS.materials) fail("Material resource limit exceeded");
    const candidate = checkedObject(sourceMaterials[index], "material", true), out: Json = {}, uvs = new Set<number>();
    function slot(value: unknown, colorSpace: "srgb" | "linear", kind = "texture") {
      const input = checkedObject(value, `${kind} slot`);
      const texCoord = integer(input.texCoord ?? 0, "texture coordinate");
      if (texCoord > 1) fail("Unsupported texture coordinate set");
      uvs.add(texCoord);
      const result: Json = { index: retainTexture(input.index, colorSpace) };
      if (input.texCoord !== undefined) result.texCoord = texCoord;
      if (kind === "normal" && input.scale !== undefined) result.scale = number(input.scale, "normal texture scale");
      if (kind === "occlusion" && input.strength !== undefined) result.strength = unit(input.strength, "occlusion strength");
      return result;
    }
    if (candidate.pbrMetallicRoughness !== undefined) {
      const pbr = checkedObject(candidate.pbrMetallicRoughness, "PBR material"), target: Json = {};
      if (pbr.baseColorFactor !== undefined) target.baseColorFactor = vector(pbr.baseColorFactor, 4, "baseColorFactor").map(value => unit(value, "baseColorFactor"));
      for (const key of ["metallicFactor", "roughnessFactor"]) if (pbr[key] !== undefined) target[key] = unit(pbr[key], key);
      if (pbr.baseColorTexture !== undefined) target.baseColorTexture = slot(pbr.baseColorTexture, "srgb");
      if (pbr.metallicRoughnessTexture !== undefined) target.metallicRoughnessTexture = slot(pbr.metallicRoughnessTexture, "linear");
      out.pbrMetallicRoughness = target;
    }
    if (candidate.normalTexture !== undefined) out.normalTexture = slot(candidate.normalTexture, "linear", "normal");
    if (candidate.occlusionTexture !== undefined) out.occlusionTexture = slot(candidate.occlusionTexture, "linear", "occlusion");
    if (candidate.emissiveTexture !== undefined) out.emissiveTexture = slot(candidate.emissiveTexture, "srgb");
    if (candidate.emissiveFactor !== undefined) out.emissiveFactor = vector(candidate.emissiveFactor, 3, "emissiveFactor").map(value => unit(value, "emissiveFactor"));
    if (candidate.alphaMode !== undefined) out.alphaMode = enumValue(candidate.alphaMode, ["OPAQUE", "MASK", "BLEND"], "alpha mode");
    if (candidate.alphaCutoff !== undefined) {
      out.alphaCutoff = number(candidate.alphaCutoff, "alpha cutoff");
      if (out.alphaCutoff < 0) fail("Invalid alpha cutoff");
    }
    if (candidate.doubleSided !== undefined) {
      if (typeof candidate.doubleSided !== "boolean") fail("Invalid doubleSided");
      out.doubleSided = candidate.doubleSided;
    }
    if (candidate.extensions?.KHR_materials_unlit !== undefined) {
      out.extensions = { KHR_materials_unlit: {} }; hasUnlit = true;
    }
    const result = { canonical: outputMaterials.length, uvs };
    outputMaterials.push(out); materialCache.set(index, result);
    return result;
  }
  interface Primitive { position: Accessor; indices: number[] }
  const meshCache = new Map<number, { canonical: number; primitives: Primitive[] }>();
  let authoredAppearance = false, primitiveCount = 0, checkedVertices = 0, checkedTriangles = 0;
  function retainMesh(id: unknown) {
    const index = integer(id, "mesh index"), cached = meshCache.get(index);
    if (cached) return cached;
    const candidate = checkedObject(sourceMeshes[index], "mesh");
    if (candidate.weights !== undefined) fail("Unsupported morph weights");
    const primitives: Primitive[] = [], outputPrimitives: Json[] = [];
    for (const value of array(candidate.primitives, "mesh primitives")) {
      if (++primitiveCount > TEXTURE_LIMITS.primitives) fail("Primitive resource limit exceeded");
      const primitive = checkedObject(value, "primitive");
      if ((primitive.mode ?? 4) !== 4 || primitive.targets !== undefined) fail("Only triangle primitives without morph targets are supported");
      const attributes = object(primitive.attributes, "primitive attributes"), outputAttributes: Json = {};
      for (const semantic of Object.keys(attributes)) {
        if (!["POSITION", "NORMAL", "TANGENT", "COLOR_0", "TEXCOORD_0", "TEXCOORD_1"].includes(semantic)) fail("Unsupported primitive attribute");
      }
      const position = attribute(attributes.POSITION, undefined, "POSITION");
      checkedVertices += position.count;
      if (checkedVertices > MAX_VERTICES) fail("Mesh resource limit exceeded");
      outputAttributes.POSITION = position.canonical;
      for (const [semantic, accessor] of Object.entries(attributes)) {
        if (semantic !== "POSITION") outputAttributes[semantic] = attribute(accessor, position.count, semantic).canonical;
      }
      if (attributes.COLOR_0 !== undefined) authoredAppearance = true;
      const out: Json = { attributes: outputAttributes, mode: 4 };
      if (primitive.material !== undefined) {
        const material = retainMaterial(primitive.material);
        for (const uv of material.uvs) if (attributes[`TEXCOORD_${uv}`] === undefined) fail("Material texture requires missing UV attribute");
        out.material = material.canonical; authoredAppearance = true;
      }
      const indices: number[] = [];
      if (primitive.indices === undefined) {
        if (position.count % 3) fail("Unindexed positions must form triangles");
        checkedTriangles += position.count / 3;
        if (checkedTriangles > MAX_TRIANGLES) fail("Mesh resource limit exceeded");
        for (let i = 0; i < position.count; i++) indices.push(i);
      } else {
        const item = access(primitive.indices);
        const sourceAccessor = sourceAccessors[integer(primitive.indices, "indices")];
        const sourceView = sourceViews[integer(sourceAccessor.bufferView, "indices bufferView")];
        if (item.components !== 1 || ![5121, 5123, 5125].includes(item.component) || item.normalized || item.count % 3 || sourceView.byteStride !== undefined) fail("Indices must be unsigned triangle indices");
        checkedTriangles += item.count / 3;
        if (checkedTriangles > MAX_TRIANGLES) fail("Mesh resource limit exceeded");
        for (let i = 0; i < item.count; i++) indices.push(componentValue(item, i, 0));
        out.indices = item.canonical;
      }
      if (indices.some(value => value >= position.count)) fail("Index exceeds position count");
      primitives.push({ position, indices }); outputPrimitives.push(out);
    }
    if (!primitives.length) fail("Mesh contains no primitives");
    const result = { canonical: outputMeshes.length, primitives };
    outputMeshes.push({ primitives: outputPrimitives }); meshCache.set(index, result);
    return result;
  }
  const lines = ["# LEGO Builder prepared geometry-only OBJ", "# source: validated GLB; physical scale unknown"];
  const positions: number[] = [], outputIndices: number[] = [], min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let vertices = 0, triangles = 0, renderedPrimitives = 0;
  const visitedNodes = new Set<number>();
  function visit(id: unknown, parent: number[], depth: number): number {
    const index = integer(id, "node index");
    if (visitedNodes.has(index)) fail("Cyclic or multiply parented node graph");
    if (depth > 64 || visitedNodes.size >= 1024) fail("Node graph exceeds resource limit");
    visitedNodes.add(index);
    const node = checkedObject(sourceNodes[index], "node"), out: Json = {};
    if (node.skin !== undefined || node.weights !== undefined || node.camera !== undefined) fail("Unsupported node resource");
    const local = nodeMatrix(node), world = matrixMultiply(parent, local);
    if (!world.every(Number.isFinite) || !Number.isFinite(determinant3(world)) || Math.abs(determinant3(world)) < 1e-12) fail("Invalid node transform");
    for (const key of ["matrix", "translation", "rotation", "scale"]) if (node[key] !== undefined) out[key] = [...node[key]];
    const canonicalIndex = outputNodes.length;
    outputNodes.push(out);
    if (node.mesh !== undefined) {
      const mesh = retainMesh(node.mesh); out.mesh = mesh.canonical;
      for (const { position, indices } of mesh.primitives) {
        if (++renderedPrimitives > TEXTURE_LIMITS.primitives) fail("Rendered primitive resource limit exceeded");
        if (vertices + position.count > MAX_VERTICES || triangles + indices.length / 3 > MAX_TRIANGLES) fail("Mesh resource limit exceeded");
        const base = vertices, reflected = determinant3(world) < 0;
        for (let row = 0; row < position.count; row++) {
          const point = transform(world, componentValue(position, row, 0), componentValue(position, row, 1), componentValue(position, row, 2));
          positions.push(...point);
          for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]); }
          lines.push(`v ${point[0]} ${point[1]} ${point[2]}`);
        }
        for (let row = 0; row < indices.length; row += 3) {
          const a = base + indices[row], b = base + indices[row + (reflected ? 2 : 1)], c = base + indices[row + (reflected ? 1 : 2)];
          outputIndices.push(a, b, c); lines.push(`f ${a + 1} ${b + 1} ${c + 1}`);
        }
        vertices += position.count; triangles += indices.length / 3;
      }
    }
    if (node.children !== undefined) out.children = array(node.children, "node children").map(child => visit(child, world, depth + 1));
    return canonicalIndex;
  }
  const scenes = source("scenes"), sceneIndex = integer(json.scene ?? 0, "scene index");
  const scene = checkedObject(scenes[sceneIndex], "scene");
  canonical.scenes = [{ nodes: array(scene.nodes ?? [], "scene nodes").map(root => visit(root, IDENTITY, 0)) }];
  if (!vertices || !triangles) fail("GLB contains no triangles");
  for (const [key, values] of Object.entries({ materials: outputMaterials, textures: outputTextures, images: outputImages, samplers: outputSamplers })) {
    if (values.length) canonical[key] = values;
  }
  if (hasUnlit) canonical.extensionsUsed = ["KHR_materials_unlit"];
  const retainedBinary = new Uint8Array(binaryLength);
  for (const part of binaryParts) retainedBinary.set(part.bytes, part.offset);
  canonical.buffers[0].byteLength = binaryLength;
  const glb = makeGlb(canonical, retainedBinary);
  if (glb.length > limits.maxBytes) fail("Canonical GLB exceeds resource limit");
  const stats: MeshStats = { vertexCount: vertices, triangleCount: triangles, bounds: { min, max } };
  return {
    obj: lines.join("\n") + "\n", glb, textureImages,
    geometry: { positions: new Float32Array(positions), indices: new Uint32Array(outputIndices) }, stats,
    manifest: { version: 1, format: "obj", sourceFormat: "glb", transformsBaked: true, axes: "provider-native", physicalScale: "unknown", converterEligibility: "unchecked", validation: "strict-glb-appearance-v2", appearance: { status: authoredAppearance ? "preserved" : "absent", glbTransforms: "authored" }, stats },
  };
}
