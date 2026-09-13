import { hash, HttpError, readLimited } from "./http.ts";
import { runConverter, converterConfigured, type ConverterBindings } from "./converter-client.ts";
import { inspectRootLdr, parseConversionResult, type ColorSummary, type ConversionRequestInput, type ConversionResultInput, type ConversionSettings } from "./conversion-contract.ts";

type Bindings = { DB: D1Database; BUCKET: R2Bucket } & ConverterBindings;
type Parent = { id: string; owner: string; state: string; manifest: string | null };
type Row = { id: string; source_job_id: string; owner: string; request_key: string; settings: string; settings_hash: string; source_obj_sha256: string; state: string; created_at: number; updated_at: number; lease: string | null; lease_until: number; ldr_hash: string | null; revision_hash: string | null; result: string | null };
export type ConversionView = { id: string; sourceJobId: string; settings: ConversionSettings; settingsSha256: string; sourceObjSha256: string; state: "awaiting_converter" | "result_available" | "deleted"; createdAt: number; updatedAt: number; ldrSha256: string | null; revisionSha256: string | null; inspection: ReturnType<typeof inspectRootLdr> | null; producer: { name: string; version: string } | null; colorSummary: ColorSummary | null };

export function settingsJson(settings: ConversionSettings) { return JSON.stringify(settings.colorMode === "source" ? { colorMode: "source", inputUpAxis: settings.inputUpAxis, sourceGlbSha256: settings.sourceGlbSha256, targetParts: settings.targetParts } : settings.targetParts !== undefined ? { inputUpAxis: settings.inputUpAxis, targetParts: settings.targetParts } : { inputUpAxis: settings.inputUpAxis, targetSizeStuds: settings.targetSizeStuds }); }
function sourceAppearance(parent: Parent): string | null {
  if (!parent.manifest) return null;
  const manifest = JSON.parse(parent.manifest);
  if (manifest.appearance?.status !== "preserved") return null;
  if (typeof manifest.glbSha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.glbSha256)) throw new HttpError(409, "The saved model has no verified color checksum.");
  return manifest.glbSha256;
}
function base64(bytes: Uint8Array) {
  const chunks: string[] = [];
  // Multiples of three keep each chunk's Base64 padding at the final boundary.
  for (let i = 0; i < bytes.length; i += 24576) chunks.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24576))));
  return chunks.join("");
}
function sourceHash(parent: Parent) {
  if (parent.state !== "ready" || !parent.manifest) throw new HttpError(409, "The mesh must be ready before it can be handed to a converter.");
  let manifest: unknown; try { manifest = JSON.parse(parent.manifest); } catch { throw new HttpError(409, "The mesh manifest is unavailable."); }
  const value = (manifest as { objSha256?: unknown }).objSha256;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new HttpError(409, "The mesh manifest has no verified OBJ checksum.");
  return value;
}
type StoredResult = { inspection?: ReturnType<typeof inspectRootLdr>; producer?: { name: string; version: string } | null; colorSummary?: ColorSummary; artifactKey?: string; cleanupKeys?: string[] };
function resultData(row: Pick<Row, "result">) { return row.result ? JSON.parse(row.result) as StoredResult : null; }
export function publicConversion(row: Row): ConversionView {
  const result = resultData(row);
  const state: ConversionView["state"] = row.state === "result_available" ? "result_available" : row.state === "deleted" ? "deleted" : "awaiting_converter";
  return { id: row.id, sourceJobId: row.source_job_id, settings: JSON.parse(row.settings), settingsSha256: row.settings_hash, sourceObjSha256: row.source_obj_sha256, state, createdAt: row.created_at, updatedAt: row.updated_at, ldrSha256: row.ldr_hash, revisionSha256: row.revision_hash, inspection: result?.inspection ?? null, producer: result?.producer ?? null, colorSummary: result?.colorSummary ?? null };
}

export class Conversions {
  constructor(private env: Bindings) {}
  configured() { return converterConfigured(this.env); }
  async run(owner: string, sourceJobId: string, id: string) {
    const row = await this.row(owner, sourceJobId, id);
    const parent = await this.parent(owner, sourceJobId), pinned = sourceHash(parent);
    if (row.state === "result_available") return row;
    if (!this.configured()) throw new HttpError(503, "LEGO conversion is not configured. Your mesh remains available to download.");
    const settings = JSON.parse(row.settings) as ConversionSettings;
    if (settings.targetParts === undefined || settings.targetSizeStuds !== undefined || settings.inputUpAxis === "unspecified") throw new HttpError(409, "This legacy handoff uses stud dimensions. Save a new piece-target request to run the converter.");
    const source = await this.env.BUCKET.get(`${sourceJobId}/obj`);
    if (!source) throw new HttpError(404, "The saved OBJ is unavailable.");
    const bytes = await readLimited(source.body, 16 * 1024 * 1024);
    if (pinned !== row.source_obj_sha256 || await hash(bytes) !== row.source_obj_sha256) throw new HttpError(409, "The saved OBJ no longer matches this conversion request.");
    let obj: string; try { obj = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new HttpError(422, "The saved OBJ is not valid UTF-8."); }
    const geometryInput = { obj, sourceObjSha256: row.source_obj_sha256, settingsSha256: row.settings_hash, settings: { targetParts: settings.targetParts, inputUpAxis: settings.inputUpAxis } };
    let result: ConversionResultInput;
    if (settings.colorMode === "source") {
      const glbHash = sourceAppearance(parent);
      if (!glbHash || glbHash !== settings.sourceGlbSha256) throw new HttpError(409, "The saved colors no longer match this conversion request.");
      const appearance = await this.env.BUCKET.get(`${sourceJobId}/glb`);
      if (!appearance) throw new HttpError(404, "The saved color model is unavailable.");
      const glb = await readLimited(appearance.body, 16 * 1024 * 1024);
      if (await hash(glb) !== glbHash) throw new HttpError(409, "The saved colors no longer match this conversion request.");
      result = await runConverter(this.env, { ...geometryInput, schemaVersion: 2, glbBase64: base64(glb), sourceGlbSha256: glbHash, settings: { ...geometryInput.settings, colorMode: "source", sourceGlbSha256: glbHash } });
    } else result = await runConverter(this.env, { ...geometryInput, schemaVersion: 1 });
    return this.acceptResult(owner, sourceJobId, id, result);
  }
  private async parent(owner: string, sourceJobId: string) { const parent = await this.env.DB.prepare("SELECT id, owner, state, manifest FROM reconstruction_jobs WHERE id = ? AND owner = ?").bind(sourceJobId, owner).first<Parent>(); if (!parent || parent.state === "deleted") throw new HttpError(404, "This model was not found."); return parent; }
  private async row(owner: string, sourceJobId: string, id: string) { const row = await this.env.DB.prepare("SELECT * FROM conversion_requests WHERE id = ? AND source_job_id = ? AND owner = ?").bind(id, sourceJobId, owner).first<Row>(); if (!row || row.state === "deleted") throw new HttpError(404, "This conversion request was not found."); return row; }
  async findRequest(owner: string, sourceJobId: string, key: string) { await this.parent(owner, sourceJobId); const row = await this.env.DB.prepare("SELECT * FROM conversion_requests WHERE owner = ? AND source_job_id = ? AND request_key = ?").bind(owner, sourceJobId, key).first<Row>(); return row && row.state !== "deleted" ? row : null; }
  async latest(owner: string, sourceJobId: string) { await this.parent(owner, sourceJobId); return this.env.DB.prepare("SELECT * FROM conversion_requests WHERE owner = ? AND source_job_id = ? AND state != 'deleted' ORDER BY created_at DESC LIMIT 1").bind(owner, sourceJobId).first<Row>(); }
  async latestResult(owner: string, sourceJobId: string) { await this.parent(owner, sourceJobId); return this.env.DB.prepare("SELECT * FROM conversion_requests WHERE owner = ? AND source_job_id = ? AND state = 'result_available' ORDER BY updated_at DESC LIMIT 1").bind(owner, sourceJobId).first<Row>(); }
  async create(owner: string, sourceJobId: string, requestKey: string, input: ConversionRequestInput) {
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) throw new HttpError(400, "A conversion submission identifier is required.");
    const parent = await this.parent(owner, sourceJobId), objHash = sourceHash(parent);
    const glbHash = input.settings.targetParts !== undefined ? sourceAppearance(parent) : null;
    const settings = settingsJson(glbHash ? { ...input.settings, colorMode: "source", sourceGlbSha256: glbHash } : input.settings), settingsHash = await hash(new TextEncoder().encode(settings));
    const old = await this.findRequest(owner, sourceJobId, requestKey);
    if (old) {
      // An existing idempotency key must keep its original geometry-only recipe.
      const originalSettingsHash = await hash(new TextEncoder().encode(settingsJson(input.settings)));
      if ((old.settings_hash !== settingsHash && old.settings_hash !== originalSettingsHash) || old.source_obj_sha256 !== objHash) throw new HttpError(409, "This conversion submission identifier was used for different source or settings.");
      return old;
    }
    const now = Date.now(), id = crypto.randomUUID();
    const inserted = await this.env.DB.prepare(`INSERT OR IGNORE INTO conversion_requests (id,source_job_id,owner,request_key,settings,settings_hash,source_obj_sha256,state,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,'awaiting_converter',?,? WHERE EXISTS (SELECT 1 FROM reconstruction_jobs WHERE id = ? AND owner = ? AND state = 'ready')
        AND (SELECT COUNT(*) FROM conversion_requests WHERE owner = ? AND source_job_id = ? AND state != 'deleted') < 10 RETURNING *`)
      .bind(id, sourceJobId, owner, requestKey, settings, settingsHash, objHash, now, now, sourceJobId, owner, owner, sourceJobId).first<Row>();
    if (inserted) return inserted;
    const raced = await this.findRequest(owner, sourceJobId, requestKey); if (raced && raced.settings_hash === settingsHash && raced.source_obj_sha256 === objHash) return raced;
    const live = await this.env.DB.prepare("SELECT COUNT(*) AS count FROM conversion_requests WHERE owner = ? AND source_job_id = ? AND state != 'deleted'").bind(owner, sourceJobId).first<{ count: number }>();
    if ((live?.count ?? 0) >= 10) throw new HttpError(429, "This mesh already has ten saved conversion handoffs. Use an existing handoff, or delete this source model when it is no longer needed.");
    throw new HttpError(409, "The mesh is no longer available for conversion.");
  }
  async handoff(owner: string, sourceJobId: string, id: string) {
    const row = await this.row(owner, sourceJobId, id); await this.parent(owner, sourceJobId);
    return { schemaVersion: JSON.parse(row.settings).colorMode === "source" ? 2 : 1, request: publicConversion(row), artifacts: { obj: `/api/jobs/${encodeURIComponent(sourceJobId)}/files/obj`, glb: `/api/jobs/${encodeURIComponent(sourceJobId)}/files/glb`, objBundle: `/api/jobs/${encodeURIComponent(sourceJobId)}/files/obj-bundle`, manifest: `/api/jobs/${encodeURIComponent(sourceJobId)}/files/manifest` } };
  }
  async acceptResult(owner: string, sourceJobId: string, id: string, input: ConversionResultInput) {
    input = parseConversionResult(input);
    let row = await this.row(owner, sourceJobId, id); sourceHash(await this.parent(owner, sourceJobId));
    if (input.sourceObjSha256 !== row.source_obj_sha256 || input.settingsSha256 !== row.settings_hash) throw new HttpError(409, "The result does not match this immutable conversion request.");
    const settings = JSON.parse(row.settings) as ConversionSettings;
    if (settings.colorMode === "source" ? input.schemaVersion !== 2 || input.sourceGlbSha256 !== settings.sourceGlbSha256 : input.schemaVersion !== 1) throw new HttpError(409, "The result does not match this request's source colors.");
    const ldrHash = await hash(new TextEncoder().encode(input.ldr)), revisionHash = await hash(new TextEncoder().encode(`${row.id}:${ldrHash}`));
    if (row.state === "result_available") { if (row.ldr_hash === ldrHash) return row; throw new HttpError(409, "A different result cannot replace an immutable conversion result."); }
    const inspection = inspectRootLdr(input.ldr), lease = crypto.randomUUID(), now = Date.now();
    const claimed = await this.env.DB.prepare("UPDATE conversion_requests SET state = 'publishing', lease = ?, lease_until = ?, updated_at = ? WHERE id = ? AND owner = ? AND source_job_id = ? AND (state = 'awaiting_converter' OR (state = 'publishing' AND lease_until < ?)) RETURNING *")
      .bind(lease, now + 90_000, now, id, owner, sourceJobId, now).first<Row>();
    if (!claimed) { row = await this.row(owner, sourceJobId, id); if (row.state === "result_available" && row.ldr_hash === ldrHash) return row; throw new HttpError(409, "This conversion request is being published or is no longer available."); }
    // The lease is part of the key: an interrupted writer can never overwrite a later CAS winner.
    const key = `${sourceJobId}/conversions/${id}/${lease}.ldr`;
    try {
      await this.env.BUCKET.put(key, input.ldr, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
      const result = JSON.stringify({ inspection, producer: input.producer ?? null, colorSummary: input.colorSummary, artifactKey: key });
      const published = await this.env.DB.prepare(`UPDATE conversion_requests SET state = 'result_available', ldr_hash = ?, revision_hash = ?, result = ?, lease = NULL, lease_until = 0, updated_at = ?
        WHERE id = ? AND owner = ? AND source_job_id = ? AND state = 'publishing' AND lease = ? AND EXISTS (SELECT 1 FROM reconstruction_jobs WHERE id = ? AND owner = ? AND state = 'ready') RETURNING *`)
        .bind(ldrHash, revisionHash, result, Date.now(), id, owner, sourceJobId, lease, sourceJobId, owner).first<Row>();
      if (!published) { await this.env.BUCKET.delete(key).catch(() => {}); throw new HttpError(409, "The source model was removed before this result could be published."); }
      return published;
    } catch (error) {
      await this.env.BUCKET.delete(key).catch(() => {});
      await this.env.DB.prepare("UPDATE conversion_requests SET state = 'awaiting_converter', lease = NULL, lease_until = 0, updated_at = ? WHERE id = ? AND state = 'publishing' AND lease = ?").bind(Date.now(), id, lease).run();
      throw error;
    }
  }
  async artifact(owner: string, sourceJobId: string, id: string) {
    const row = await this.row(owner, sourceJobId, id); if (row.state !== "result_available") throw new HttpError(404, "The LDraw result is not available."); sourceHash(await this.parent(owner, sourceJobId));
    const key = resultData(row)?.artifactKey; if (!key) throw new HttpError(404, "The LDraw result is not available."); const object = await this.env.BUCKET.get(key); if (!object) throw new HttpError(404, "The LDraw result is not available.");
    return new Response(object.body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename=lego-builder-${id}.ldr` } });
  }
  async removeForSource(owner: string, sourceJobId: string) {
    const rows = await this.env.DB.prepare("SELECT id, state, lease, result FROM conversion_requests WHERE owner = ? AND source_job_id = ?").bind(owner, sourceJobId).all<{ id: string; state: string; lease: string | null; result: string | null }>();
    const staged = rows.results.map(row => {
      const stored = resultData(row) ?? {}, keys = new Set(stored.cleanupKeys ?? []);
      if (stored.artifactKey) keys.add(stored.artifactKey);
      if (row.state === "publishing" && row.lease) keys.add(`${sourceJobId}/conversions/${row.id}/${row.lease}.ldr`);
      return { id: row.id, result: { cleanupKeys: [...keys] }, keys: [...keys] };
    });
    const now = Date.now();
    for (const row of staged) await this.env.DB.prepare("UPDATE conversion_requests SET state = 'deleted', lease = NULL, lease_until = 0, result = ?, updated_at = ? WHERE id = ? AND owner = ? AND source_job_id = ?").bind(JSON.stringify(row.result), now, row.id, owner, sourceJobId).run();
    const keys = staged.flatMap(row => row.keys);
    try {
      if (keys.length) await this.env.BUCKET.delete(keys);
    } catch {
      // Deleted rows are never publicly readable. Retained cleanupKeys make a later DELETE retry safe.
    }
  }
}
