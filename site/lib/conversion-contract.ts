import { HttpError } from "./http.ts";
import { parseDocument } from "./ldraw/model.ts";
import { LEGO_COLOR_CATALOGS } from "./lego-color-catalog.ts";

export const CONVERSION_SCHEMA_VERSION = 1 as const;
export const CONVERSION_LIMITS = { ldrBytes: 5 * 1024 * 1024, placements: 2500, bodyBytes: 2 * 5 * 1024 * 1024 + 64 * 1024 } as const;
export type InputUpAxis = "x" | "y" | "z" | "unspecified";
export type ConversionSettings = { targetSizeStuds?: number; targetParts?: number; inputUpAxis: InputUpAxis; colorMode?: "source"; sourceGlbSha256?: string; paletteVersion?: string };
export type ConversionRequestInput = { schemaVersion: 1; settings: ConversionSettings };
export type ColorSummary = { mode: "source"; method: "surface-base-color-to-palette-v1"; paletteVersion: string; sourceHasColor: true; usedColorCodes: number[]; limitations: ["palette-approximation", "one-color-per-part", "materials-not-reproduced"] };
export type ConversionResultInput = { schemaVersion: 1 | 2; sourceObjSha256: string; sourceGlbSha256?: string; settingsSha256: string; ldr: string; producer?: { name: string; version: string }; colorSummary?: ColorSummary };
export type LdrInspection = { placements: number; parts: Record<string, number>; partCount: number; stepCount: number; hasSteps: boolean };

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "A JSON object is required."); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, keys: string[]) { if (Object.keys(value).some(key => !keys.includes(key))) throw new HttpError(400, "The conversion payload contains unsupported fields."); }
function sha(value: unknown, field: string) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new HttpError(400, `${field} must be a SHA-256 hash.`); return value; }
export function parseConversionRequest(value: unknown): ConversionRequestInput {
  const root = object(value); exactKeys(root, ["schemaVersion", "settings"]); if (root.schemaVersion !== CONVERSION_SCHEMA_VERSION) throw new HttpError(400, "Unsupported conversion schema version.");
  const settings = object(root.settings); exactKeys(settings, ["targetSizeStuds", "targetParts", "inputUpAxis"]);
  if ((settings.targetParts !== undefined) === (settings.targetSizeStuds !== undefined)) throw new HttpError(400, "Choose exactly one explicit piece target or legacy stud size.");
  if (!(["x", "y", "z", "unspecified"] as string[]).includes(settings.inputUpAxis as string)) throw new HttpError(400, "inputUpAxis is invalid.");
  if (settings.targetParts !== undefined) {
    if (typeof settings.targetParts !== "number" || !Number.isInteger(settings.targetParts) || settings.targetParts < 100 || settings.targetParts > 2200) throw new HttpError(400, "targetParts must be an integer from 100 through 2200.");
    if (settings.inputUpAxis === "unspecified") throw new HttpError(400, "Confirm an upright axis before piece-target conversion.");
    return { schemaVersion: 1, settings: { targetParts: settings.targetParts, inputUpAxis: settings.inputUpAxis as InputUpAxis } };
  }
  if (typeof settings.targetSizeStuds !== "number" || !Number.isInteger(settings.targetSizeStuds) || settings.targetSizeStuds < 4 || settings.targetSizeStuds > 48) throw new HttpError(400, "targetSizeStuds must be an integer from 4 through 48.");
  return { schemaVersion: 1, settings: { targetSizeStuds: settings.targetSizeStuds, inputUpAxis: settings.inputUpAxis as InputUpAxis } };
}
export function parseConversionResult(value: unknown): ConversionResultInput {
  const root = object(value);
  if (root.schemaVersion !== 1 && root.schemaVersion !== 2) throw new HttpError(400, "Unsupported conversion schema version.");
  exactKeys(root, ["schemaVersion", "sourceObjSha256", "settingsSha256", "ldr", "producer", ...(root.schemaVersion === 2 ? ["sourceGlbSha256", "colorSummary"] : [])]);
  if (typeof root.ldr !== "string") throw new HttpError(400, "ldr must be text."); if (new TextEncoder().encode(root.ldr).byteLength > CONVERSION_LIMITS.ldrBytes) throw new HttpError(413, "The LDraw result exceeds the supported size."); if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(root.ldr)) throw new HttpError(422, "The LDraw result contains unsupported control characters.");
  let producer: ConversionResultInput["producer"];
  if (root.producer !== undefined) { const item = object(root.producer); exactKeys(item, ["name", "version"]); if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 120 || typeof item.version !== "string" || !item.version.trim() || item.version.length > 120) throw new HttpError(400, "producer must have a bounded name and version."); producer = { name: item.name, version: item.version }; }
  let colorSummary: ColorSummary | undefined;
  if (root.schemaVersion === 2) {
    const summary = object(root.colorSummary);
    exactKeys(summary, ["mode", "method", "paletteVersion", "sourceHasColor", "usedColorCodes", "limitations"]);
    const catalog = typeof summary.paletteVersion === "string" ? LEGO_COLOR_CATALOGS[summary.paletteVersion] : undefined;
    if (summary.mode !== "source" || summary.method !== "surface-base-color-to-palette-v1" || summary.sourceHasColor !== true || !catalog) throw new HttpError(422, "The converter returned an unsupported color palette.");
    const codes = summary.usedColorCodes;
    if (!Array.isArray(codes) || !codes.length || codes.length > catalog.codes.length || codes.some((code, i) => !Number.isInteger(code) || !catalog.codes.includes(code) || (i > 0 && code <= codes[i - 1]))) throw new HttpError(422, "The converter returned invalid LEGO colors.");
    const limits = ["palette-approximation", "one-color-per-part", "materials-not-reproduced"];
    if (JSON.stringify(summary.limitations) !== JSON.stringify(limits)) throw new HttpError(422, "The converter returned invalid color limitations.");
    const refs = parseDocument("result.ldr", root.ldr).references;
    for (const ref of refs) {
      const part = ref.name.endsWith(".dat") ? ref.name.slice(0,-4) : "";
      if (!/^(0|[1-9]\d*)$/.test(ref.color) || !catalog.parts[part]?.includes(Number(ref.color))) throw new HttpError(422, "The result contains an unsupported manufactured part and color combination.");
    }
    const actual = [...new Set(refs.map(ref => Number(ref.color)))].sort((a,b) => a-b);
    if (JSON.stringify(actual) !== JSON.stringify(codes)) throw new HttpError(422, "The model colors do not match the converter color summary.");
    colorSummary = summary as ColorSummary;
  }
  return { schemaVersion: root.schemaVersion, sourceObjSha256: sha(root.sourceObjSha256, "sourceObjSha256"), settingsSha256: sha(root.settingsSha256, "settingsSha256"), ldr: root.ldr, producer, ...(root.schemaVersion === 2 ? { sourceGlbSha256: sha(root.sourceGlbSha256, "sourceGlbSha256"), colorSummary } : {}) };
}
export function inspectRootLdr(ldr: string): LdrInspection {
  if (/^\s*0\s+(?:FILE|NOFILE|!TEXMAP|!DATA|!LPE|CLEAR)\b/im.test(ldr)) throw new HttpError(422, "Packed, embedded, texture, or custom-geometry LDraw results are not supported.");
  let document: ReturnType<typeof parseDocument>;
  try { document = parseDocument("converter-result.ldr", ldr); } catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "The LDraw result is invalid."); }
  if (document.geometryLines || document.customColors.length || document.references.some(ref => !ref.name.endsWith(".dat") || ref.name.includes("/"))) throw new HttpError(422, "The LDraw result must contain only official root .dat part placements.");
  if (!document.references.length) throw new HttpError(422, "The LDraw result has no part placements.");
  if (document.references.length > CONVERSION_LIMITS.placements) throw new HttpError(413, "The LDraw result has too many placements.");
  const parts: Record<string, number> = {};
  for (const ref of document.references) parts[ref.name] = (parts[ref.name] ?? 0) + 1;
  const groups = new Set(document.references.map(ref => ref.step));
  return { placements: document.references.length, parts, partCount: Object.keys(parts).length, stepCount: document.stepMarkers ? groups.size : 0, hasSteps: document.stepMarkers > 0 };
}
