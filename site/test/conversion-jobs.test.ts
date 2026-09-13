import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Conversions } from "../lib/conversions.ts";
import { HttpError, hash } from "../lib/http.ts";

class Statement {
  private values: unknown[] = [];
  constructor(private statement: ReturnType<DatabaseSync["prepare"]>) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return (this.statement.get(...this.values as SQLInputValue[]) as T | undefined) ?? null; }
  async run() { return this.statement.run(...this.values as SQLInputValue[]); }
  async all<T>() { return { results: this.statement.all(...this.values as SQLInputValue[]) as T[] }; }
}
class D1 {
  database = new DatabaseSync(":memory:"); failPublish = false;
  constructor() { for (const file of ["0000_same_gunslinger.sql", "0002_magical_slyde.sql"]) this.database.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8")); }
  prepare(sql: string) { if (this.failPublish && sql.includes("SET state = 'result_available'")) { this.failPublish = false; throw Error("D1 unavailable"); } return new Statement(this.database.prepare(sql)); }
  parent(id = "job-a", owner = "owner-a", state = "ready") {
    const obj = "a".repeat(64), now = Date.now();
    this.database.prepare("INSERT INTO reconstruction_jobs (id,owner,request_key,fingerprint,provider,state,created_at,updated_at,manifest) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, owner, `key-${id}`, "source", "fal", state, now, now, JSON.stringify({ objSha256: obj }));
    return { id, owner, obj };
  }
  conversion(id: string) { return this.database.prepare("SELECT * FROM conversion_requests WHERE id = ?").get(id) as Record<string, unknown>; }
}
class R2 {
  values = new Map<string, string>(); failPut = false; failDelete = false; firstPut: (() => Promise<void>) | null = null;
  async put(key: string, value: string) { if (this.failPut) throw Error("R2 unavailable"); if (this.firstPut) { const wait = this.firstPut; this.firstPut = null; await wait(); } this.values.set(key, value); }
  async get(key: string) { const value = this.values.get(key); return value === undefined ? null : { body: new Response(value).body }; }
  async delete(keys: string | string[]) { if (this.failDelete) throw Error("R2 delete unavailable"); for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key); }
}
const settings = { schemaVersion: 1 as const, settings: { targetSizeStuds: 16, inputUpAxis: "y" as const } };
const ldr = "0 test\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n0 STEP\n1 16 20 0 0 1 0 0 0 1 0 0 0 1 3001.dat";
const key = "handoff-00000001";
async function fixture() { const db = new D1(), bucket = new R2(), parent = db.parent(), conversions = new Conversions({ DB: db as unknown as D1Database, BUCKET: bucket as unknown as R2Bucket }); return { db, bucket, parent, conversions }; }
async function request(f: Awaited<ReturnType<typeof fixture>>, requestKey = key) { return f.conversions.create(f.parent.owner, f.parent.id, requestKey, settings); }
async function result(f: Awaited<ReturnType<typeof fixture>>, id: string, text = ldr) { const row = f.db.conversion(id); return f.conversions.acceptResult(f.parent.owner, f.parent.id, id, { schemaVersion: 1, sourceObjSha256: f.parent.obj, settingsSha256: row.settings_hash as string, ldr: text }); }
async function publishing(f: Awaited<ReturnType<typeof fixture>>, id: string) { for (let attempt = 0; attempt < 20; attempt++) { if (f.db.conversion(id).state === "publishing") return; await new Promise(resolve => setTimeout(resolve, 1)); } throw Error("publisher did not claim its lease"); }

test("conversion request idempotency binds source and settings while a fresh key makes a new attempt", async () => {
  const f = await fixture(), first = await request(f), replay = await request(f);
  assert.equal(replay.id, first.id);
  await assert.rejects(() => f.conversions.create(f.parent.owner, f.parent.id, key, { ...settings, settings: { ...settings.settings, targetSizeStuds: 20 } }), (error: unknown) => error instanceof HttpError && error.status === 409);
  const second = await request(f, "handoff-00000002"); assert.notEqual(second.id, first.id);
});
test("atomic per-source attempt cap admits ten concurrent fresh keys and preserves replay at the limit", async () => {
  const f = await fixture(); const keys = Array.from({ length: 12 }, (_, index) => `handoff-limit-${String(index).padStart(4, "0")}`);
  const attempts = await Promise.allSettled(keys.map(requestKey => request(f, requestKey))); const accepted = attempts.filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof request>>> => attempt.status === "fulfilled");
  assert.equal(accepted.length, 10); assert.equal(new Set(accepted.map(attempt => attempt.value.id)).size, 10);
  const rejected = attempts.filter((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"); assert.equal(rejected.length, 2); for (const attempt of rejected) assert.ok(attempt.reason instanceof HttpError && attempt.reason.status === 429);
  const replay = await request(f, keys[0]); assert.equal(replay.id, accepted[0].value.id);
});
test("conversion rows are owner scoped and a tombstoned source cannot be read or retried", async () => {
  const f = await fixture(), row = await request(f);
  await assert.rejects(() => f.conversions.handoff("owner-b", f.parent.id, row.id), (error: unknown) => error instanceof HttpError && error.status === 404);
  f.db.database.prepare("UPDATE reconstruction_jobs SET state = 'deleted' WHERE id = ?").run(f.parent.id);
  await assert.rejects(() => f.conversions.handoff(f.parent.owner, f.parent.id, row.id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(() => request(f, "handoff-00000003"), (error: unknown) => error instanceof HttpError && error.status === 404);
});
test("result requires echoed hashes and is immutable but identical replay is safe", async () => {
  const f = await fixture(), row = await request(f), stored = f.db.conversion(row.id);
  await assert.rejects(() => f.conversions.acceptResult(f.parent.owner, f.parent.id, row.id, { schemaVersion: 1, sourceObjSha256: "b".repeat(64), settingsSha256: stored.settings_hash as string, ldr }), (error: unknown) => error instanceof HttpError && error.status === 409);
  const saved = await result(f, row.id), replay = await result(f, row.id); assert.equal(replay.revision_hash, saved.revision_hash);
  await assert.rejects(() => result(f, row.id, ldr.replace("20 0 0", "40 0 0")), (error: unknown) => error instanceof HttpError && error.status === 409);
});
test("latest result remains addressable after a later handoff is awaiting conversion", async () => {
  const f = await fixture(), saved = await request(f); await result(f, saved.id); const later = await request(f, "handoff-00000004");
  assert.notEqual(later.id, saved.id); assert.equal((await f.conversions.latestResult(f.parent.owner, f.parent.id))?.id, saved.id);
});
test("an expired publisher is reclaimed and its stale object cannot overwrite the CAS winner", async () => {
  const f = await fixture(), row = await request(f); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  f.bucket.firstPut = () => gate;
  const old = result(f, row.id); await publishing(f, row.id);
  f.db.database.prepare("UPDATE conversion_requests SET lease_until = ? WHERE id = ?").run(Date.now() - 1, row.id);
  const winner = await result(f, row.id, ldr.replace("20 0 0", "40 0 0")); release();
  await assert.rejects(() => old, (error: unknown) => error instanceof HttpError && error.status === 409);
  const artifact = await f.conversions.artifact(f.parent.owner, f.parent.id, row.id); assert.equal(await artifact.text(), ldr.replace("20 0 0", "40 0 0")); assert.equal(winner.state, "result_available");
});
test("handoff masks internal publishing as awaiting_converter", async () => {
  const f = await fixture(), row = await request(f); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); f.bucket.firstPut = () => gate;
  const pending = result(f, row.id); await publishing(f, row.id); assert.equal((await f.conversions.handoff(f.parent.owner, f.parent.id, row.id)).request.state, "awaiting_converter"); release(); await pending;
});
test("source deletion during publication revokes the result and cleans its attempted object", async () => {
  const f = await fixture(), row = await request(f); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); f.bucket.firstPut = () => gate;
  const pending = result(f, row.id); await publishing(f, row.id); f.db.database.prepare("UPDATE reconstruction_jobs SET state = 'deleted' WHERE id = ?").run(f.parent.id); release();
  await assert.rejects(() => pending, (error: unknown) => error instanceof HttpError && error.status === 409); assert.equal(f.bucket.values.size, 0);
});
test("failed R2 publication returns the request to awaiting_converter without retaining a result", async () => {
  const f = await fixture(), row = await request(f); f.bucket.failPut = true;
  await assert.rejects(() => result(f, row.id)); const stored = f.db.conversion(row.id); assert.equal(stored.state, "awaiting_converter"); assert.equal(f.bucket.values.size, 0);
});
test("failed database publication removes the uploaded attempt and leaves no published result", async () => {
  const f = await fixture(), row = await request(f); f.db.failPublish = true;
  await assert.rejects(() => result(f, row.id)); const stored = f.db.conversion(row.id); assert.equal(stored.state, "awaiting_converter"); assert.equal(f.bucket.values.size, 0);
});
test("failed downstream deletion retains published and staged keys until a later cleanup succeeds", async () => {
  const f = await fixture(), saved = await request(f); await result(f, saved.id); const published = f.db.conversion(saved.id), publishedKey = JSON.parse(published.result as string).artifactKey;
  const staged = await request(f, "handoff-00000005"); f.db.database.prepare("UPDATE conversion_requests SET state = 'publishing', lease = ? WHERE id = ?").run("staged-lease", staged.id);
  const stagedKey = `${f.parent.id}/conversions/${staged.id}/staged-lease.ldr`; f.bucket.values.set(stagedKey, "partial"); f.bucket.failDelete = true;
  await f.conversions.removeForSource(f.parent.owner, f.parent.id);
  for (const id of [saved.id, staged.id]) { const row = f.db.conversion(id); assert.equal(row.state, "deleted"); const keys = JSON.parse(row.result as string).cleanupKeys as string[]; assert.ok(keys.length); }
  assert.ok(f.bucket.values.has(publishedKey)); assert.ok(f.bucket.values.has(stagedKey));
  f.bucket.failDelete = false; await f.conversions.removeForSource(f.parent.owner, f.parent.id);
  assert.equal(f.bucket.values.size, 0); const savedTombstone = JSON.parse(f.db.conversion(saved.id).result as string); assert.ok(savedTombstone.cleanupKeys.includes(publishedKey)); assert.deepEqual(Object.keys(savedTombstone), ["cleanupKeys"]); assert.deepEqual(Object.keys(JSON.parse(f.db.conversion(staged.id).result as string)), ["cleanupKeys"]); assert.ok(JSON.parse(f.db.conversion(staged.id).result as string).cleanupKeys.includes(stagedKey));
});
test("a blocked put after the first successful delete remains discoverable for retry", async () => {
  const f = await fixture(), row = await request(f); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); f.bucket.firstPut = () => gate;
  const pending = result(f, row.id); await publishing(f, row.id); await f.conversions.removeForSource(f.parent.owner, f.parent.id);
  const cleanupKey = JSON.parse(f.db.conversion(row.id).result as string).cleanupKeys[0]; f.bucket.failDelete = true; release();
  await assert.rejects(() => pending, (error: unknown) => error instanceof HttpError && error.status === 409); assert.ok(f.bucket.values.has(cleanupKey));
  f.bucket.failDelete = false; await f.conversions.removeForSource(f.parent.owner, f.parent.id); assert.equal(f.bucket.values.has(cleanupKey), false);
});

test("server run enforces owner, legacy semantics and pinned R2 source before outbound conversion", async () => {
  const f = await fixture();
  const configured = new Conversions({ DB: f.db as unknown as D1Database, BUCKET: f.bucket as unknown as R2Bucket, CONVERTER_URL: "https://converter.example/convert", CONVERTER_TOKEN: "private" });
  const legacy = await request(f);
  await assert.rejects(configured.run("other-owner",f.parent.id,legacy.id), (error: unknown) => error instanceof HttpError && error.status === 404);
  await assert.rejects(configured.run(f.parent.owner,f.parent.id,legacy.id), /legacy handoff/);
  const piece = await configured.create(f.parent.owner,f.parent.id,"pieces-request-00001",{schemaVersion:1,settings:{targetParts:2000,inputUpAxis:"y"}});
  f.bucket.values.set(`${f.parent.id}/obj`, "different source bytes");
  await assert.rejects(configured.run(f.parent.owner,f.parent.id,piece.id), /no longer matches/);
  assert.equal(f.db.conversion(piece.id).state,"awaiting_converter");
});

test("new color requests pin appearance while legacy replay and results stay immutable",async()=>{
  const f=await fixture(), pieceSettings={schemaVersion:1 as const,settings:{targetParts:2000,inputUpAxis:"y" as const}};
  const legacy=await f.conversions.create(f.parent.owner,f.parent.id,"color-request-legacy",pieceSettings);
  const glbHash="b".repeat(64);
  f.db.database.prepare("UPDATE reconstruction_jobs SET manifest = ? WHERE id = ?").run(JSON.stringify({objSha256:f.parent.obj,glbSha256:glbHash,appearance:{status:"preserved"}}),f.parent.id);
  assert.equal((await f.conversions.create(f.parent.owner,f.parent.id,"color-request-legacy",pieceSettings)).id,legacy.id);
  assert.equal(JSON.parse(f.db.conversion(legacy.id).settings as string).colorMode,undefined);
  const current=await f.conversions.create(f.parent.owner,f.parent.id,"color-request-new-1",pieceSettings),handoff=await f.conversions.handoff(f.parent.owner,f.parent.id,current.id);
  assert.equal(handoff.schemaVersion,2);assert.equal(handoff.request.settings.sourceGlbSha256,glbHash);assert.equal(handoff.request.settings.colorMode,"source");
  await assert.rejects(result(f,current.id),/source colors/);
  const output={schemaVersion:2 as const,sourceObjSha256:f.parent.obj,sourceGlbSha256:glbHash,settingsSha256:current.settings_hash,ldr:ldr.replaceAll("1 16 ","1 4 ").replaceAll("3001.dat","3004.dat"),colorSummary:{mode:"source" as const,method:"surface-base-color-to-palette-v1" as const,paletteVersion:"source-solid-palette-v1",sourceHasColor:true as const,usedColorCodes:[4],limitations:["palette-approximation","one-color-per-part","materials-not-reproduced"] as ["palette-approximation","one-color-per-part","materials-not-reproduced"]}};
  await f.conversions.acceptResult(f.parent.owner,f.parent.id,current.id,output);
  assert.deepEqual((await f.conversions.handoff(f.parent.owner,f.parent.id,current.id)).request.colorSummary?.usedColorCodes,[4]);
  await assert.rejects(f.conversions.acceptResult(f.parent.owner,f.parent.id,current.id,{...output,sourceGlbSha256:"c".repeat(64)}),/source colors/);
});

test("corrupt saved GLB is rejected before contacting the color converter",async()=>{
  const f=await fixture(),obj="v 0 0 0\n",objHash=await hash(new TextEncoder().encode(obj));
  f.db.database.prepare("UPDATE reconstruction_jobs SET manifest = ? WHERE id = ?").run(JSON.stringify({objSha256:objHash,glbSha256:"c".repeat(64),appearance:{status:"preserved"}}),f.parent.id);
  const configured=new Conversions({DB:f.db as unknown as D1Database,BUCKET:f.bucket as unknown as R2Bucket,CONVERTER_URL:"https://converter.example/convert",CONVERTER_TOKEN:"private"});
  const row=await configured.create(f.parent.owner,f.parent.id,"color-request-checksum",{schemaVersion:1,settings:{targetParts:2000,inputUpAxis:"y"}});
  f.bucket.values.set(`${f.parent.id}/obj`,obj);f.bucket.values.set(`${f.parent.id}/glb`,"corrupted");
  await assert.rejects(configured.run(f.parent.owner,f.parent.id,row.id),/saved colors no longer match/);
  assert.equal(f.db.conversion(row.id).state,"awaiting_converter");
});
