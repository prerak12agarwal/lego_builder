import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { HttpError, checkOrigin } from "../lib/http.ts";

// Substitute only platform bindings; exercise the real server and identity helpers.
const platformUrl = "data:text/javascript," + encodeURIComponent(`
  export const env = {};
  let currentHeaders = new Headers();
  export async function headers() { return currentHeaders; }
  export function setHeaders(value) { currentHeaders = value; }
  export function redirect() { throw new Error("Unexpected browser redirect from API authorization"); }
`);
const platform = await import(platformUrl) as {
  env: Record<string, unknown>;
  setHeaders(value: Headers): void;
};
register("data:text/javascript," + encodeURIComponent(`
  import { existsSync } from "node:fs";
  export function resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers" || specifier === "next/headers" || specifier === "next/navigation") {
      return { url: ${JSON.stringify(platformUrl)}, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const candidate = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  }
`), import.meta.url);
const { authorized } = await import("../lib/server.ts");

function reset(userId?: string) {
  for (const key of Object.keys(platform.env)) delete platform.env[key];
  platform.setHeaders(new Headers(userId ? {
    "oai-authenticated-user-id": userId,
    "oai-authenticated-user-email": `${userId}@example.test`,
  } : {}));
}

test("new signed-in users reach the actual workflow boundary without enrollment", async () => {
  for (const userId of ["new-account-a", "unrelated-account-b"]) {
    for (const obsoleteAllowlist of [undefined, "old-owner-only"]) {
      reset(userId);
      platform.env.DB = {};
      platform.env.BUCKET = {};
      if (obsoleteAllowlist) platform.env.PILOT_USER_IDS = obsoleteAllowlist;
      const result = await authorized();
      assert.equal(result.user.userId, userId);
      assert.ok(result.jobs);
      assert.ok(result.conversions);
    }
  }
});

test("anonymous and incomplete identities fail before any storage access", async () => {
  for (const headers of [{}, { "oai-authenticated-user-id": "id-only" }, { "oai-authenticated-user-email": "email-only@example.test" }]) {
    reset();
    platform.setHeaders(new Headers(headers as Record<string, string>));
    Object.defineProperty(platform.env, "DB", {
      configurable: true, enumerable: true,
      get() { throw new Error("Anonymous request accessed storage"); },
    });
    await assert.rejects(authorized(), (error: unknown) => error instanceof HttpError && error.status === 401);
  }
});

test("signed-in users still receive unavailable status when storage is missing", async () => {
  for (const available of [[], ["DB"], ["BUCKET"]]) {
    reset("new-account-c");
    for (const key of available) platform.env[key] = {};
    await assert.rejects(authorized(), (error: unknown) => error instanceof HttpError && error.status === 503);
  }
});

test("signed-in eligibility does not relax mutation Origin checks", () => {
  const url = "https://workshop.example/api/jobs";
  checkOrigin(new Request(url, { method: "POST", headers: { Origin: "https://workshop.example" } }));
  for (const origin of [null, "https://other.example", "null"]) {
    const headers = origin ? { Origin: origin } : undefined;
    assert.throws(() => checkOrigin(new Request(url, { method: "POST", headers })), (error: unknown) => error instanceof HttpError && error.status === 403);
  }
});
