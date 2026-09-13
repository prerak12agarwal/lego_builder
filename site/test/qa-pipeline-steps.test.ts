import test from "node:test";
import assert from "node:assert/strict";
import { inspectRootLdr } from "../lib/conversion-contract.ts";
import { importLDraw } from "../lib/ldraw/import.ts";
import { importedInventory } from "../lib/ldraw/model.ts";

const colors = "0 !COLOUR Red CODE 4 VALUE #C91A09 EDGE #333333\n0 !COLOUR Yellow CODE 14 VALUE #F2CD37 EDGE #333333";
const part = "0 QA brick\n0 !LDRAW_ORG Part\n3 16 0 0 0 20 0 0 0 20 0";
const placement = (color = 4, x = 0) => `1 ${color} ${x} 0 0 1 0 0 0 1 0 0 0 1 3001.dat`;
const load = (ldr: string) => importLDraw(
  "model.ldr",
  ldr,
  colors,
  async () => ({ path: "parts/3001.dat", text: part }),
  new AbortController().signal,
);

test("saved inspection metadata matches imported nonempty STEP and ROTSTEP groups", async () => {
  const ldr = [
    "0 QA stepped result",
    "0 STEP", // Empty leading group must be omitted.
    placement(4, 0),
    "0 STEP",
    "0 ROTSTEP 0 90 0 REL", // Empty middle group must be omitted.
    placement(14, 20),
    placement(4, 40),
    "0 STEP", // Empty trailing group must be omitted.
  ].join("\n");

  const inspection = inspectRootLdr(ldr);
  const model = await load(ldr);

  assert.equal(inspection.placements, model.placements.length);
  assert.equal(inspection.stepCount, model.steps.length);
  assert.equal(inspection.hasSteps, model.hasSteps);
  assert.deepEqual(model.steps.map(step => step.placementIds.length), [1, 2]);
  assert.equal(model.steps.flatMap(step => step.placementIds).length, model.placements.length);
  assert.equal(new Set(model.steps.flatMap(step => step.placementIds)).size, model.placements.length);
  assert.equal(importedInventory(model.placements).reduce((total, lot) => total + lot.quantity, 0), model.placements.length);
  assert.ok(model.warnings.some(warning => warning.includes("Empty step boundaries")));
  assert.ok(model.warnings.some(warning => warning.includes("ROTSTEP")));
});

test("missing root boundaries remain inspectable without invented instructions", async () => {
  const ldr = ["0 QA result without steps", placement(), placement(14, 20)].join("\n");
  const inspection = inspectRootLdr(ldr);
  const model = await load(ldr);

  assert.equal(inspection.hasSteps, false);
  assert.equal(inspection.stepCount, 0);
  assert.equal(model.hasSteps, false);
  assert.deepEqual(model.steps, []);
  assert.equal(model.placements.length, 2);
});
