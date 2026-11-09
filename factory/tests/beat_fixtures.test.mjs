import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../lib/schema.mjs";
import { loadStylePack } from "../lib/style.mjs";
import { lintPlanV2 } from "../lib/plan-v2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));

for (const name of ["hero", "kpi", "line", "bar"]) test(`component fixture beat_${name} is a valid, lint-clean one-beat plan`, () => {
  const b = rj(`tests/fixtures/beat_${name}.json`);
  const plan = { schema_version: "2.0", fps: 30, width: 1920, height: 1080, totalFrames: b.endFrame, style: { packId: pack.id, background: pack.backgrounds.default }, scenes: [{ id: "S01", startFrame: b.startFrame, endFrame: b.endFrame, beats: [b] }] };
  assert.deepEqual(validate(rj("schemas/scene_plan_v2.schema.json"), plan), []);
  const r = lintPlanV2(plan, { recipes: rj("config/motion_recipes.json"), modes: rj("config/visual_modes.json"), pack });
  assert.deepEqual(r.errors, []);
});

import { beatProps } from "../tools/beat_props.mjs";
test("beat_props embeds pack, beat and background as data URL", () => {
  const p = beatProps(path.join(ROOT, "tests/fixtures/beat_kpi.json"), path.join(ROOT, "config/styles/owner-pale-glass"));
  assert.equal(p.pack.id, "owner-pale-glass"); assert.equal(p.beat.id, "B2"); assert.match(p.bgDataUrl, /^data:image\/png;base64,/);
});
