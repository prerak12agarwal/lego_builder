import test from "node:test";
import assert from "node:assert/strict";
import { requirePilotUser } from "../lib/pilot-access.ts";
import { HttpError } from "../lib/http.ts";

test("public workshop private operations fail closed without an approved identity", () => {
  for (const configured of [undefined, "", "  ,  ", "other-user", "owner-prefix"]) {
    assert.throws(() => requirePilotUser("owner", configured), (error: unknown) => error instanceof HttpError && error.status === 403);
  }
  assert.throws(() => requirePilotUser("", ""), HttpError);
});

test("pilot access accepts exact Site IDs only, including a trimmed multi-user list", () => {
  requirePilotUser("site-owner", "site-owner");
  requirePilotUser("site-partner", " site-owner, site-partner ");
  assert.throws(() => requirePilotUser("site", "site-owner,site-partner"), HttpError);
  assert.throws(() => requirePilotUser("SITE-OWNER", "site-owner"), HttpError);
});
