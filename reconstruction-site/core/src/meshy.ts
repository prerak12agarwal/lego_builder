import { ReconstructionProviderError, safeMessage } from "./errors.ts";

const ENDPOINT = "https://api.meshy.ai/openapi/v1/image-to-3d";
export type MeshyStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
export interface MeshyTask { id: string; status: MeshyStatus; modelUrls?: { glb?: string }; raw: Record<string, unknown>; }
export interface MeshyClientOptions { apiKey: string; fetch: typeof globalThis.fetch; }
function readTask(raw: unknown): MeshyTask {
  if (!raw || typeof raw !== "object") throw new ReconstructionProviderError("Provider returned an invalid task");
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : typeof record.result === "string" ? record.result : undefined;
  const status = record.status;
  if (!id || (status !== undefined && !["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED", "CANCELED"].includes(status as string))) throw new ReconstructionProviderError("Provider returned an invalid task");
  const urls = record.model_urls as Record<string, unknown> | undefined;
  return { id, status: (status ?? "PENDING") as MeshyStatus, modelUrls: urls ? { glb: typeof urls.glb === "string" ? urls.glb : undefined } : undefined, raw: record };
}
export class MeshyImageTo3DClient {
  private readonly options: MeshyClientOptions;
  constructor(options: MeshyClientOptions) { this.options = options; if (!options.apiKey) throw new ReconstructionProviderError("Provider API key is missing"); }
  private async request(path: string, init?: RequestInit): Promise<MeshyTask> {
    let response: Response;
    try { response = await this.options.fetch(`${ENDPOINT}${path}`, { ...init, headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } }); }
    catch { throw new ReconstructionProviderError("Provider request could not be completed", undefined, true); }
    const body = await response.text();
    let parsed: unknown; try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
    if (!response.ok) {
      const detail = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).message ?? (parsed as Record<string, unknown>).error : undefined;
      throw new ReconstructionProviderError(safeMessage(typeof detail === "string" ? detail : `Provider request failed (${response.status})`), response.status, response.status === 408 || response.status === 429 || response.status >= 500);
    }
    return readTask(parsed);
  }
  create(imageDataUri: string) { return this.request("", { method: "POST", body: JSON.stringify({ image_url: imageDataUri, ai_model: "meshy-t2", model_type: "smart-topology", should_texture: false, target_polycount: 4000, target_formats: ["glb"] }) }); }
  get(id: string) { return this.request(`/${encodeURIComponent(id)}`); }
  /** Meshy exposes deletion, not a separate cancel operation; callers should persist cancellation first. */
  async cancel(id: string): Promise<void> {
    let response: Response;
    try { response = await this.options.fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${this.options.apiKey}` } }); }
    catch { throw new ReconstructionProviderError("Provider deletion could not be completed", undefined, true); }
    if (!response.ok) throw new ReconstructionProviderError(`Provider deletion failed (${response.status})`, response.status, response.status === 408 || response.status === 429 || response.status >= 500);
  }
}
