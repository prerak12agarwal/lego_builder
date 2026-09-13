import { CONVERSION_LIMITS, parseConversionResult, type ConversionResultInput } from "./conversion-contract.ts";
import { HttpError, readLimited } from "./http.ts";
export type ConverterBindings = { CONVERTER_URL?: string; CONVERTER_TOKEN?: string };
export type ServiceInput = { schemaVersion: 1; obj: string; sourceObjSha256: string; settingsSha256: string; settings: { targetParts: number; inputUpAxis: "x" | "y" | "z" } };
export function converterEndpoint(env: ConverterBindings) {
  if (!env.CONVERTER_URL?.trim() || !env.CONVERTER_TOKEN?.trim()) throw new HttpError(503, "LEGO conversion is not configured. Your mesh remains available to download.");
  let url: URL; try { url = new URL(env.CONVERTER_URL); } catch { throw new HttpError(503, "The converter endpoint is not configured correctly."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new HttpError(503, "The converter requires a configured HTTPS endpoint.");
  if (url.pathname === "/") url.pathname = "/convert";
  return url.href;
}
export function converterConfigured(env: ConverterBindings) { try { converterEndpoint(env); return true; } catch { return false; } }
export async function runConverter(env: ConverterBindings, input: ServiceInput, send: typeof fetch = fetch): Promise<ConversionResultInput> {
  const endpoint = converterEndpoint(env);
  // Leave startup headroom around the converter's bounded 180-second worker.
  const control = new AbortController(); const timeout = setTimeout(() => control.abort(), 240_000);
  try {
    const response = await send(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CONVERTER_TOKEN!.trim()}` }, body: JSON.stringify(input), signal: control.signal, redirect: "manual" });
    if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? "The converter is busy. Try this saved request again shortly." : "The converter could not complete this mesh. Your OBJ remains available to download.");
    let payload: unknown; try { payload = JSON.parse(new TextDecoder().decode(await readLimited(response.body, CONVERSION_LIMITS.bodyBytes))); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(502, "The converter returned an unreadable result."); }
    const result = parseConversionResult(payload);
    if (result.sourceObjSha256 !== input.sourceObjSha256 || result.settingsSha256 !== input.settingsSha256) throw new HttpError(409, "The converter returned a result for different source or settings.");
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(504, "The converter could not be reached or timed out. Reload this saved handoff before retrying.");
  } finally { clearTimeout(timeout); }
}
