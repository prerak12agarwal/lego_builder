import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { Jobs, publicJob } from "../lib/jobs.ts";
import { HttpError, hash } from "../lib/http.ts";
import { validateGlbAndExportObj } from "../core/src/glb.ts";

class Statement {
  private values: unknown[] = [];
  constructor(private statement: ReturnType<DatabaseSync["prepare"]>) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values as SQLInputValue[]) as T | undefined) ?? null; }
  async run() { return this.statement.run(...this.values as SQLInputValue[]); }
}

class D1 {
  database = new DatabaseSync(":memory:");
  constructor() {
    this.database.exec(readFileSync(new URL("../drizzle/0000_same_gunslinger.sql", import.meta.url), "utf8"));
  }
  prepare(sql: string) { return new Statement(this.database.prepare(sql)); }
  row(id?: string) {
    return id
      ? this.database.prepare("SELECT * FROM reconstruction_jobs WHERE id = ?").get(id) as Record<string, unknown>
      : this.database.prepare("SELECT * FROM reconstruction_jobs ORDER BY created_at LIMIT 1").get() as Record<string, unknown>;
  }
  insert(values: Partial<Record<string, unknown>>) {
    const defaults = { id: crypto.randomUUID(), owner: "owner-a", request_key: crypto.randomUUID(), fingerprint: "hash", provider: "fal-ai/trellis", task: "task-1", state: "queued", created_at: Date.now(), updated_at: Date.now(), checked_at: 0, lease: null, lease_until: 0, message: null, manifest: null };
    const row = { ...defaults, ...values };
    this.database.prepare(`INSERT INTO reconstruction_jobs
      (id,owner,request_key,fingerprint,provider,task,state,created_at,updated_at,checked_at,lease,lease_until,message,manifest)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
    return row.id as string;
  }
}

class R2 {
  values = new Map<string, Uint8Array | string>();
  async put(key: string, value: Uint8Array | string) { this.values.set(key, value); }
  async get(key: string) {
    const value = this.values.get(key);
    return value === undefined ? null : { body: new Response(value as BodyInit).body };
  }
  async delete(keys: string | string[]) { for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(kind), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(red = 20) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1); view.setUint32(4, 1);
  header.set([8, 6, 0, 0, 0], 8);
  const compressed = new Uint8Array(deflateSync(new Uint8Array([0, red, 40, 60, 255])));
  const chunks = [chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(8 + chunks.reduce((sum, value) => sum + value.length, 0));
  out.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8; for (const value of chunks) { out.set(value, offset); offset += value.length; }
  return out;
}

function fixtureGlb() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2]);
  const binary = new Uint8Array(positions.byteLength + indices.byteLength);
  binary.set(new Uint8Array(positions.buffer)); binary.set(new Uint8Array(indices.buffer), positions.byteLength);
  let json = new TextEncoder().encode(JSON.stringify({asset:{version:"2.0"},buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:indices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3"},{bufferView:1,componentType:5125,count:3,type:"SCALAR"}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0}));
  json = new Uint8Array([...json, ...Array((4-json.length%4)%4).fill(0x20)]);
  const out = new Uint8Array(12+8+json.length+8+binary.length), data = new DataView(out.buffer);
  data.setUint32(0,0x46546c67,true); data.setUint32(4,2,true); data.setUint32(8,out.length,true);
  data.setUint32(12,json.length,true); data.setUint32(16,0x4e4f534a,true); out.set(json,20);
  data.setUint32(20+json.length,binary.length,true); data.setUint32(24+json.length,0x004e4942,true); out.set(binary,28+json.length);
  return out;
}

function glb(json: unknown, binary: Uint8Array) {
  let text = new TextEncoder().encode(JSON.stringify(json)); text = new Uint8Array([...text, ...Array((4 - text.length % 4) % 4).fill(0x20)]);
  const padded = new Uint8Array([...binary, ...Array((4 - binary.length % 4) % 4).fill(0)]), out = new Uint8Array(28 + text.length + padded.length), view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true); view.setUint32(12, text.length, true); view.setUint32(16, 0x4e4f534a, true); out.set(text, 20); view.setUint32(20 + text.length, padded.length, true); view.setUint32(24 + text.length, 0x004e4942, true); out.set(padded, 28 + text.length); return out;
}

function texturedGlb(image = png()) {
  const positions = new Float32Array([0,0,0,1,0,0,0,1,0]), indices = new Uint16Array([0,1,2]), uv = new Float32Array([0,0,1,0,0,1]);
  const binary = new Uint8Array(68 + image.length); binary.set(new Uint8Array(positions.buffer)); binary.set(new Uint8Array(indices.buffer), 36); binary.set(new Uint8Array(uv.buffer), 44); binary.set(image, 68);
  return glb({ asset:{version:"2.0"}, buffers:[{byteLength:binary.length}], bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6},{buffer:0,byteOffset:44,byteLength:24},{buffer:0,byteOffset:68,byteLength:image.length}], accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3"},{bufferView:1,componentType:5123,count:3,type:"SCALAR"},{bufferView:2,componentType:5126,count:3,type:"VEC2"}], images:[{bufferView:3,mimeType:"image/png"}], textures:[{source:0}], materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}], meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:2},indices:1,material:0}]}], nodes:[{mesh:0}], scenes:[{nodes:[0]}], scene:0 }, binary);
}

function setup(fetcher: typeof fetch) {
  const db = new D1(), bucket = new R2();
  const jobs = new Jobs({ DB: db as never, BUCKET: bucket as never, FAL_KEY: "test-key", RECONSTRUCTION_PROVIDER: "fal" }, fetcher);
  return { db, bucket, jobs };
}

test("concurrent idempotent submissions create one job and one provider request", async () => {
  let submissions = 0;
  const redirects: (RequestRedirect | undefined)[] = [];
  const { db, jobs } = setup(async (input, init) => {
    redirects.push(init?.redirect);
    if (String(input).endsWith("fal-ai/trellis")) { submissions++; return Response.json({ request_id: "task-1" }); }
    throw new Error(`unexpected fetch ${input}`);
  });
  const bytes = png(), key = "same-request-key-1";
  const [first, second] = await Promise.all([jobs.create("owner-a", key, bytes), jobs.create("owner-a", key, bytes)]);
  assert.equal(first.id, second.id);
  assert.equal(submissions, 1);
  assert.deepEqual(redirects, ["manual"]);
  assert.equal(db.database.prepare("SELECT count(*) count FROM reconstruction_jobs").get()!.count, 1);
});

test("a second active request for one owner is rejected before provider submission", async () => {
  let submissions = 0;
  const { jobs } = setup(async () => { submissions++; return Response.json({ request_id: `task-${submissions}` }); });
  await jobs.create("owner-a", "active-request-001", png());
  await assert.rejects(() => jobs.create("owner-a", "active-request-002", png()), (error: unknown) => error instanceof HttpError && error.status === 429);
  assert.equal(submissions, 1);
});

test("idempotency key reuse with different image is rejected without another charge", async () => {
  let submissions = 0;
  const { jobs } = setup(async () => { submissions++; return Response.json({ request_id: "task-1" }); });
  await jobs.create("owner-a", "image-bound-key-01", png(20));
  await assert.rejects(() => jobs.create("owner-a", "image-bound-key-01", png(21)), (error: unknown) => error instanceof HttpError && error.status === 409);
  assert.equal(submissions, 1);
});

test("ambiguous provider submission stays unresolved and idempotent", async () => {
  let submissions = 0;
  const { jobs } = setup(async () => { submissions++; throw new TypeError("simulated network loss"); });
  const first = await jobs.create("owner-a", "ambiguous-key-01", png());
  const second = await jobs.create("owner-a", "ambiguous-key-01", png());
  assert.equal(first.state, "unknown");
  assert.equal(second.id, first.id);
  assert.equal(submissions, 1);
});

test("deletion during provider submission tombstones the job and cancels the late task", async () => {
  let release!: () => void, cancelCalls = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let submitted!: () => void;
  const entered = new Promise<void>(resolve => { submitted = resolve; });
  const { db, bucket, jobs } = setup(async (input, init) => {
    if (init?.method === "PUT") { cancelCalls++; return Response.json({}); }
    submitted(); await waiting; return Response.json({ request_id: "late-task" });
  });
  const creating = jobs.create("owner-a", "delete-in-flight-1", png());
  await entered;
  const id = db.row().id as string;
  await jobs.remove("owner-a", id);
  release();
  const result = await creating;
  assert.equal(result.state, "deleted");
  assert.equal(cancelCalls, 1);
  assert.equal(bucket.values.size, 0);
  assert.equal(db.row(id).task, "late-task");
});

test("the global collection lease allows only one provider reconciliation at a time", async () => {
  let release!: () => void, entered!: () => void, statusCalls = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const { db, jobs } = setup(async (input) => {
    const url = String(input);
    if (!url.endsWith("/status")) throw new Error(`unexpected fetch ${url}`);
    statusCalls++; entered(); await waiting;
    return Response.json({ status: "IN_PROGRESS" });
  });
  const firstId = db.insert({ owner: "owner-a", task: "task-a" });
  const secondId = db.insert({ owner: "owner-b", task: "task-b" });
  const first = jobs.refresh("owner-a", firstId);
  await started;
  const second = await jobs.refresh("owner-b", secondId);
  assert.equal(second.state, "queued");
  assert.equal(statusCalls, 1);
  release();
  assert.equal((await first).state, "generating");
});

test("deletion during collection prevents publication and removes partial artifacts", async () => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let downloadStarted!: () => void;
  const entered = new Promise<void>(resolve => { downloadStarted = resolve; });
  const model = fixtureGlb();
  const { db, bucket, jobs } = setup(async (input, init) => {
    const url = String(input);
    if (init?.method === "PUT") return Response.json({});
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (url.endsWith("/requests/task-1")) return Response.json({ model_mesh: { url: "https://cdn.fal.media/model.glb" } });
    if (url === "https://cdn.fal.media/model.glb") { downloadStarted(); await waiting; return new Response(model); }
    throw new Error(`unexpected fetch ${url}`);
  });
  const id = db.insert({});
  bucket.values.set(`${id}/source`, png());
  const refreshing = jobs.refresh("owner-a", id);
  await entered;
  await jobs.remove("owner-a", id);
  release();
  assert.equal((await refreshing).state, "deleted");
  assert.equal(db.row(id).state, "deleted");
  assert.equal(bucket.values.size, 0);
});

test("deletion plus a storage failure during publication cannot leave private artifacts orphaned", async () => {
  class FailingR2 extends R2 {
    glbStarted!: () => void;
    releaseGlb!: () => void;
    entered = new Promise<void>(resolve => { this.glbStarted = resolve; });
    waiting = new Promise<void>(resolve => { this.releaseGlb = resolve; });
    override async put(key: string, value: Uint8Array | string) {
      if (key.endsWith("/glb")) { this.glbStarted(); await this.waiting; }
      if (key.endsWith("/obj")) throw new Error("simulated R2 interruption");
      await super.put(key, value);
    }
  }
  const db = new D1(), bucket = new FailingR2(), model = fixtureGlb();
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (url.endsWith("/requests/task-1")) return Response.json({ model_mesh: { url: "https://cdn.fal.media/model.glb" } });
    if (url === "https://cdn.fal.media/model.glb") return new Response(model);
    throw new Error(`unexpected fetch ${url}`);
  };
  const jobs = new Jobs({ DB: db as never, BUCKET: bucket as never, FAL_KEY: "test-key", RECONSTRUCTION_PROVIDER: "fal" }, fetcher as typeof fetch);
  const id = db.insert({});
  bucket.values.set(`${id}/source`, png());
  const refreshing = jobs.refresh("owner-a", id);
  await bucket.entered;
  await jobs.remove("owner-a", id);
  bucket.releaseGlb();
  assert.equal((await refreshing).state, "deleted");
  assert.equal(db.row(id).state, "deleted");
  assert.deepEqual([...bucket.values.keys()], []);
});

test("provider mesh URL allowlist blocks SSRF locations before download", async () => {
  let internalFetches = 0;
  const { db, jobs } = setup(async (input) => {
    const url = String(input);
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (url.endsWith("/requests/task-1")) return Response.json({ model_mesh: { url: "https://127.0.0.1/model.glb" } });
    internalFetches++; return new Response(fixtureGlb());
  });
  const id = db.insert({});
  const result = await jobs.refresh("owner-a", id);
  assert.equal(result.state, "failed");
  assert.equal(result.message, "The provider returned an unsupported model location.");
  assert.equal(internalFetches, 0);
});

test("provider redirects are not followed to an unvalidated mesh location", async () => {
  const calls: { url: string; redirect: RequestRedirect | undefined }[] = [];
  const { db, bucket, jobs } = setup(async (input, init) => {
    const url = String(input);
    calls.push({ url, redirect: init?.redirect });
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (url.endsWith("/requests/task-1")) return Response.json({ model_mesh: { url: "https://cdn.fal.media/model.glb" } });
    if (url === "https://cdn.fal.media/model.glb") return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } });
    throw new Error(`unexpected fetch ${url}`);
  });
  const id = db.insert({});
  const result = await jobs.refresh("owner-a", id);
  assert.equal(result.state, "queued");
  assert.match(String(result.message), /could not be collected yet/i);
  assert.equal(bucket.values.size, 0);
  assert.equal(calls.some(call => call.url.includes("127.0.0.1")), false);
  assert.deepEqual(calls.map(call => call.redirect), ["manual", "manual", "manual"]);
});

test("malformed provider mesh URL is a terminal unsupported-result failure", async () => {
  const { db, jobs } = setup(async (input) => {
    const url = String(input);
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (url.endsWith("/requests/task-1")) return Response.json({ model_mesh: { url: "not a URL" } });
    throw new Error(`unexpected fetch ${url}`);
  });
  const id = db.insert({});
  const result = await jobs.refresh("owner-a", id);
  assert.equal(result.state, "failed");
  assert.match(String(result.message), /(?:invalid|unsupported) model location/i);
});

test("malformed normalized PNG is rejected before a provider call", async () => {
  let calls = 0;
  const { jobs } = setup(async () => { calls++; return Response.json({ request_id: "unexpected" }); });
  await assert.rejects(() => jobs.create("owner-a", "invalid-image-001", new Uint8Array([137,80,78,71,13,10,26,10])), (error: unknown) => error instanceof HttpError && error.status === 400);
  assert.equal(calls, 0);
});

test("another owner cannot read, delete, or download a job", async () => {
  const { db, bucket, jobs } = setup(async () => { throw new Error("provider must not be called"); });
  const id = db.insert({ owner: "owner-a", state: "ready", manifest: JSON.stringify({ stats: { triangleCount: 1, bounds: { min: [0,0,0], max: [1,1,0] } } }) });
  bucket.values.set(`${id}/glb`, fixtureGlb());
  await assert.rejects(() => jobs.get("owner-b", id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(() => jobs.remove("owner-b", id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(() => jobs.artifact("owner-b", id, "glb"), (error: unknown) => error instanceof HttpError && error.status === 404);
  assert.equal(db.row(id).state, "ready");
  assert.equal(bucket.values.has(`${id}/glb`), true);
});

test("collection preserves checked texture bytes and reopens without another provider submission", async () => {
  const model = texturedGlb(), sourceTexture = png(); let providerCalls = 0;
  const { db, bucket, jobs } = setup(async input => {
    const url = String(input);
    if (url.endsWith("/status")) { providerCalls++; return Response.json({ status: "COMPLETED" }); }
    if (url.endsWith("/requests/task-1")) { providerCalls++; return Response.json({ model_mesh: { url: "https://cdn.fal.media/model.glb" } }); }
    if (url === "https://cdn.fal.media/model.glb") { providerCalls++; return new Response(model); }
    throw Error(`unexpected ${url}`);
  });
  const id = db.insert({}); bucket.values.set(`${id}/source`, png());
  assert.equal((await jobs.refresh("owner-a", id)).state, "ready");
  const manifest = JSON.parse(String(bucket.values.get(`${id}/manifest`)));
  const saved = bucket.values.get(`${id}/glb`) as Uint8Array, obj = bucket.values.get(`${id}/obj`) as string;
  assert.equal(manifest.glbSha256, await hash(saved)); assert.equal(manifest.objSha256, await hash(new TextEncoder().encode(obj)));
  assert.equal(manifest.appearance.status, "preserved"); assert.ok(saved.some((value, index) => sourceTexture.length <= saved.length - index && sourceTexture.every((byte, offset) => saved[index + offset] === byte)));
  assert.equal(validateGlbAndExportObj(saved).obj, obj);
  assert.equal((await jobs.refresh("owner-a", id)).state, "ready");
  await jobs.artifact("owner-a", id, "glb"); assert.equal(providerCalls, 3);
  assert.equal(publicJob(db.row(id) as never).appearance, "preserved");
  assert.equal(publicJob({ ...db.row(id), manifest: null } as never).appearance, "legacy");
  assert.equal((await jobs.get("owner-a", id)).state, "ready"); assert.equal(db.row(id).manifest !== null, true);
});

test("corrupt embedded PNG fails collection before publishing any ready artifact", async () => {
  const bad = png(); bad[45] ^= 0xff; const model = texturedGlb(bad);
  const { db, bucket, jobs } = setup(async input => {
    const url = String(input);
    if (url.endsWith("/status")) return Response.json({ status: "COMPLETED" });
    if (url.endsWith("/requests/task-1")) return Response.json({ model_mesh: { url: "https://cdn.fal.media/model.glb" } });
    if (url === "https://cdn.fal.media/model.glb") return new Response(model);
    throw Error(`unexpected ${url}`);
  });
  const id = db.insert({}); bucket.values.set(`${id}/source`, png());
  assert.equal((await jobs.refresh("owner-a", id)).state, "failed");
  assert.equal(bucket.values.has(`${id}/glb`), false); assert.equal(bucket.values.has(`${id}/obj`), false); assert.equal(bucket.values.has(`${id}/manifest`), false);
});
