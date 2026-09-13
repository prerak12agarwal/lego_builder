import { FalTrellisClient, ReconstructionError, ReconstructionProviderError, validateGlbAndExportObj } from "../core/src/index.ts";
import { LIMITS, type JobView } from "./limits.ts";
import { HttpError, hash, readLimited } from "./http.ts";
import { validateNormalizedPng } from "./png.ts";
import { validateTextureImageData } from "../core/src/texture-image.ts";
import { exportObjBundle } from "../core/src/obj-bundle.ts";

type Bindings = { DB: D1Database; BUCKET: R2Bucket; FAL_KEY?: string; RECONSTRUCTION_PROVIDER?: string };
type Row = { id: string; owner: string; request_key: string; fingerprint: string; provider: string; task: string | null; state: string; created_at: number; updated_at: number; checked_at: number; lease: string | null; lease_until: number; message: string | null; manifest: string | null };
const active = "('submitting','queued','generating','collecting','unknown')";
const artifactKinds = { glb: "model/gltf-binary", obj: "text/plain", manifest: "application/json", source: "image/png" };
export type ArtifactKind = keyof typeof artifactKinds;

export function publicJob(row: Row): JobView {
  const manifest = row.manifest ? JSON.parse(row.manifest) : null;
  return { id: row.id, state: row.state, createdAt: row.created_at, updatedAt: row.updated_at, message: row.message, triangles: manifest?.stats?.triangleCount ?? null, bounds: manifest?.stats?.bounds ?? null, appearance: manifest?.appearance?.status ?? "legacy" };
}

export class Jobs {
  constructor(private env: Bindings, private fetcher: typeof fetch = fetch) {}
  configured() { return this.env.RECONSTRUCTION_PROVIDER === "fal" && Boolean(this.env.FAL_KEY?.trim()); }
  private client() {
    if (!this.configured()) throw new HttpError(503, "Generation is not configured. The site owner needs to connect TRELLIS.");
    return new FalTrellisClient({ apiKey: this.env.FAL_KEY!, fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("X-Fal-Object-Lifecycle-Preference", JSON.stringify({ expiration_duration_seconds: LIMITS.providerMediaSeconds, initial_acl: { default: "forbid" } }));
      headers.set("X-Fal-Store-IO", "0");
      const response = await this.fetcher(input, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(20000) });
      const bytes = await readLimited(response.body, 256 * 1024);
      return new Response(bytes as BodyInit, { status: response.status, headers: response.headers });
    } });
  }
  async get(owner: string, id: string) {
    const row = await this.env.DB.prepare("SELECT * FROM reconstruction_jobs WHERE id = ? AND owner = ?").bind(id, owner).first<Row>();
    if (!row) throw new HttpError(404, "This model was not found.");
    return row;
  }
  async latest(owner: string) {
    return this.env.DB.prepare("SELECT * FROM reconstruction_jobs WHERE owner = ? AND state != 'deleted' ORDER BY created_at DESC LIMIT 1").bind(owner).first<Row>();
  }
  async latestReady(owner: string) {
    return this.env.DB.prepare("SELECT * FROM reconstruction_jobs WHERE owner = ? AND state = 'ready' ORDER BY created_at DESC LIMIT 1").bind(owner).first<Row>();
  }
  async findRequest(owner: string, key: string) {
    return this.env.DB.prepare("SELECT * FROM reconstruction_jobs WHERE owner = ? AND request_key = ?").bind(owner, key).first<Row>();
  }
  async create(owner: string, key: string, bytes: Uint8Array) {
    const provider = this.client();
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new HttpError(400, "A submission identifier is required.");
    await validateNormalizedPng(bytes);
    const fingerprint = await hash(bytes);
    const previous = await this.findRequest(owner, key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new HttpError(409, "This submission identifier was used for a different image.");
      return previous;
    }
    const now = Date.now(), id = crypto.randomUUID(), day = now - 86400000;
    // A single statement serializes the quota check, active reservation and idempotency claim.
    const row = await this.env.DB.prepare(`INSERT OR IGNORE INTO reconstruction_jobs
      (id, owner, request_key, fingerprint, provider, state, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'fal-ai/trellis', 'submitting', ?, ?
      WHERE (SELECT COUNT(*) FROM reconstruction_jobs WHERE owner = ? AND created_at > ?) < ?
        AND (SELECT COUNT(*) FROM reconstruction_jobs WHERE created_at > ?) < ? RETURNING *`)
      .bind(id, owner, key, fingerprint, now, now, owner, day, LIMITS.dailyPerUser, day, LIMITS.dailyTotal).first<Row>();
    if (!row) {
      const raced = await this.findRequest(owner, key);
      if (raced && raced.fingerprint === fingerprint) return raced;
      throw new HttpError(429, "You already have an unresolved generation, or the workshop has reached its daily limit. Reopen your latest job before trying again.");
    }
    try { await this.env.BUCKET.put(`${id}/source`, bytes, { httpMetadata: { contentType: "image/png" } }); }
    catch {
      await this.env.DB.prepare("UPDATE reconstruction_jobs SET state = 'failed', message = ?, updated_at = ? WHERE id = ? AND state = 'submitting'").bind("The image could not be saved. No generation was submitted.", Date.now(), id).run();
      return this.get(owner, id);
    }
    const before = await this.get(owner, id);
    if (before.state === "deleted") { await this.cleanup(id); return before; }
    let task;
    try {
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      task = await provider.create(`data:image/png;base64,${btoa(binary)}`);
    } catch (e) {
      console.error("reconstruction_submit_failed", { name: e instanceof Error ? e.name : "unknown", status: e instanceof ReconstructionProviderError ? e.status : undefined, code: e instanceof ReconstructionError ? e.code : undefined });
      const rejected = e instanceof ReconstructionProviderError && e.status && [400, 401, 402, 403, 422, 429].includes(e.status);
      await this.env.DB.prepare("UPDATE reconstruction_jobs SET state = ?, message = ?, updated_at = ? WHERE id = ? AND state = 'submitting'")
        .bind(rejected ? "failed" : "unknown", rejected ? "TRELLIS rejected the request. Check the account key, credits and image before starting a new generation." : "Submission could not be confirmed. It may have been charged. Check fal request history before removing this job and trying again.", Date.now(), id).run();
      return this.get(owner, id);
    }
    // Record the remote id even if the owner removed the job while submission was in flight.
    await this.env.DB.prepare("UPDATE reconstruction_jobs SET task = ?, state = CASE WHEN state = 'submitting' THEN 'queued' ELSE state END, updated_at = ? WHERE id = ?").bind(task.id, Date.now(), id).run();
    const saved = await this.get(owner, id);
    if (saved.state === "deleted") { await provider.cancel(task.id).catch(() => {}); await this.cleanup(id); }
    return saved;
  }
  async refresh(owner: string, id: string) {
    let row = await this.get(owner, id);
    if (row.state === "submitting" && Date.now() - row.created_at > 90000) {
      await this.env.DB.prepare("UPDATE reconstruction_jobs SET state = 'unknown', message = ? WHERE id = ? AND state = 'submitting'")
        .bind("Submission could not be confirmed. Check fal request history before trying again; a charge may have occurred.", id).run();
      return this.get(owner, id);
    }
    if (!["queued", "generating", "collecting"].includes(row.state) || !row.task) return row;
    const now = Date.now(), lease = crypto.randomUUID();
    const claimed = await this.env.DB.prepare(`UPDATE reconstruction_jobs SET lease = ?, lease_until = ?, checked_at = ?
      WHERE id = ? AND owner = ? AND state IN ('queued','generating','collecting') AND lease_until < ? AND checked_at < ?
        AND NOT EXISTS (SELECT 1 FROM reconstruction_jobs WHERE lease_until >= ?) RETURNING *`)
      .bind(lease, now + 90000, now, id, owner, now, now - 4000, now).first<Row>();
    if (!claimed) return row;
    const update = async (state: string, message: string | null = null) => {
      await this.env.DB.prepare(`UPDATE reconstruction_jobs SET state = ?, message = ?, updated_at = ? WHERE id = ? AND lease = ? AND state IN ${active}`)
        .bind(state, message, Date.now(), id, lease).run();
    };
    try {
      const task = await this.client().get(claimed.task!);
      if (task.status === "FAILED" || task.status === "CANCELED") await update("failed", "TRELLIS could not complete this model. Try a clearer view in a new generation.");
      else if (task.status === "SUCCEEDED" && task.modelUrl) {
        await update("collecting");
        const meshBytes = await this.downloadMesh(task.modelUrl);
        const prepared = validateGlbAndExportObj(meshBytes);
        for (const image of prepared.textureImages) await validateTextureImageData(image.bytes, image.mimeType);
        const glb = prepared.glb;
        const manifest = { ...prepared.manifest, id, provider: "fal-ai/trellis", settings: { mesh_simplify: 0.98, texture_size: 512 }, preprocessing: "png-1024-v1", sourceSha256: row.fingerprint, providerGlbSha256: await hash(meshBytes), glbSha256: await hash(glb), objSha256: await hash(new TextEncoder().encode(prepared.obj)), createdAt: new Date(row.created_at).toISOString() };
        row = await this.get(owner, id);
        if (row.state === "deleted" || row.lease !== lease || row.lease_until < Date.now()) return row;
        await this.env.BUCKET.put(`${id}/glb`, glb, { httpMetadata: { contentType: artifactKinds.glb } });
        await this.env.BUCKET.put(`${id}/obj`, prepared.obj, { httpMetadata: { contentType: artifactKinds.obj } });
        await this.env.BUCKET.put(`${id}/manifest`, JSON.stringify(manifest), { httpMetadata: { contentType: artifactKinds.manifest } });
        await this.env.DB.prepare("UPDATE reconstruction_jobs SET state = 'ready', manifest = ?, message = NULL, updated_at = ? WHERE id = ? AND state = 'collecting' AND lease = ? AND lease_until > ?")
          .bind(JSON.stringify(manifest), Date.now(), id, lease, Date.now()).run();
        if ((await this.get(owner, id)).state === "deleted") await this.cleanup(id);
      } else await update(task.status === "IN_PROGRESS" ? "generating" : "queued");
    } catch (e) {
      if (e instanceof ReconstructionError && !(e instanceof ReconstructionProviderError)) await update("failed", "The returned model uses unsupported or invalid geometry or textures. Try a simpler object in a clear, fully visible photo. No replacement model has been substituted.");
      else if (e instanceof ReconstructionProviderError && e.status && [400, 404, 410, 422].includes(e.status)) await update("failed", "The provider result failed or is no longer available. A new generation would be a separate paid request.");
      else if (e instanceof HttpError && [413, 422].includes(e.status)) await update("failed", e.message);
      else await update(claimed.state, "The latest result could not be collected yet. Reopen or refresh this job to try again; this does not submit another generation.");
    } finally {
      await this.env.DB.prepare("UPDATE reconstruction_jobs SET lease = NULL, lease_until = 0 WHERE id = ? AND lease = ?").bind(id, lease).run();
      // A delete can race any R2 write, including a failed partial publication.
      if ((await this.get(owner, id)).state === "deleted") await this.cleanup(id);
    }
    return this.get(owner, id);
  }
  private async downloadMesh(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new HttpError(422, "The provider returned an invalid model location."); }
    if (url.protocol !== "https:" || url.port || url.username || url.password || !/^(?:[a-z0-9-]+\.)*fal\.media$/.test(url.hostname))
      throw new HttpError(422, "The provider returned an unsupported model location.");
    const headers = new Headers();
    if (url.hostname === "v3b.fal.media") {
      const auth = await this.fetcher("https://rest.fal.ai/storage/auth/token?storage_type=fal-cdn-v3", { method: "POST", headers: { Authorization: `Key ${this.env.FAL_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiration_seconds: 120 }), redirect: "manual", signal: AbortSignal.timeout(15000) });
      const body = JSON.parse(new TextDecoder().decode(await readLimited(auth.body, 16384)));
      if (!auth.ok || typeof body.token !== "string") throw new HttpError(503, "Model download could not be authorized.");
      headers.set("Authorization", `Bearer ${body.token}`);
    }
    const response = await this.fetcher(url, { headers, redirect: "manual", signal: AbortSignal.timeout(25000) });
    if ([404, 410].includes(response.status)) throw new ReconstructionProviderError("Result expired", response.status);
    if (!response.ok) throw new HttpError(503, "Model download is temporarily unavailable.");
    return readLimited(response.body, LIMITS.meshBytes);
  }
  async remove(owner: string, id: string) {
    const row = await this.get(owner, id);
    await this.env.DB.prepare("UPDATE reconstruction_jobs SET state = 'deleted', manifest = NULL, message = NULL, updated_at = ? WHERE id = ? AND owner = ?").bind(Date.now(), id, owner).run();
    if (row.task && row.state !== "ready" && this.configured()) await this.client().cancel(row.task).catch(() => {});
    await this.cleanup(id);
  }
  private async cleanup(id: string) { await this.env.BUCKET.delete(Object.keys(artifactKinds).map(kind => `${id}/${kind}`)); }
  async artifact(owner: string, id: string, kind: string) {
    if (!Object.hasOwn(artifactKinds, kind) && kind !== "obj-bundle") throw new HttpError(404, "File not found.");
    const row = await this.get(owner, id);
    if (row.state === "deleted" || (kind !== "source" && row.state !== "ready")) throw new HttpError(404, "File is not available.");
    if (kind === "obj-bundle") {
      const manifest = row.manifest ? JSON.parse(row.manifest) : null;
      if (manifest?.appearance?.status !== "preserved") throw new HttpError(404, "This saved model has no retained color bundle.");
      const saved = await this.env.BUCKET.get(`${id}/glb`);
      if (!saved) throw new HttpError(404, "The saved color model is unavailable.");
      const bytes = await readLimited(saved.body, LIMITS.meshBytes);
      if (await hash(bytes) !== manifest.glbSha256) throw new HttpError(409, "The saved color model does not match its manifest.");
      const bundle = exportObjBundle(bytes, manifest.glbSha256);
      return new Response(bundle as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="lego-builder-${id}-textured-obj.zip"` } });
    }
    const result = await this.env.BUCKET.get(`${id}/${kind}`);
    if (!result) throw new HttpError(404, "File is not available.");
    const headers = new Headers({ "Content-Type": artifactKinds[kind as ArtifactKind], "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (kind !== "source") headers.set("Content-Disposition", `attachment; filename="lego-builder-${id}.${kind === 'manifest' ? 'json' : kind}"`);
    return new Response(result.body, { headers });
  }
}
