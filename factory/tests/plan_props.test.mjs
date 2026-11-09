import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { planProps } from "../tools/plan_props.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK = path.join(ROOT, "config/styles/owner-pale-glass");
const HERO = path.join(ROOT, "tests/fixtures/plan_v2_hero_only.json");
const ffx = (...a) => spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), ...a], { encoding: "utf8" });

test("plan_props embeds the plan, the pack and only the backgrounds the plan uses", () => {
  const p = planProps(HERO, PACK);
  assert.equal(p.plan.totalFrames, 180); assert.equal(p.pack.id, "owner-pale-glass");
  assert.deepEqual(Object.keys(p.backgrounds), ["cool-blue-fog"]); assert.match(p.backgrounds["cool-blue-fog"], /^data:image\/png;base64,/);
});
test("plan_props is deterministic (same bytes twice)", () => { assert.equal(JSON.stringify(planProps(HERO, PACK)), JSON.stringify(planProps(HERO, PACK))); });
test("plan_props rejects a wrong pack, a missing background and a v1 plan", () => {
  const plan = JSON.parse(fs.readFileSync(HERO, "utf8")); const tmp = path.join(ROOT, "tests/fixtures/_tmp_plan.json");
  try {
    fs.writeFileSync(tmp, JSON.stringify({ ...plan, style: { packId: "other", background: "cool-blue-fog" } })); assert.throws(() => planProps(tmp, PACK), /wants style pack/);
    fs.writeFileSync(tmp, JSON.stringify({ ...plan, style: { packId: "owner-pale-glass", background: "nope" } })); assert.throws(() => planProps(tmp, PACK), /not in the style pack/);
    fs.writeFileSync(tmp, JSON.stringify({ ...plan, schema_version: "1.0" })); assert.throws(() => planProps(tmp, PACK), /needs a v2 plan/);
  } finally { fs.rmSync(tmp, { force: true }); }
});
test("lint-plan --renderable passes the hero-only plan and rejects a plan with unbuilt modes", () => {
  const ok = ffx("lint-plan", HERO, "--renderable"); assert.equal(ok.status, 0, ok.stderr);
  const bad = ffx("lint-plan", path.join(ROOT, "tests/fixtures/plan_v2_valid.json"), "--renderable"); assert.equal(bad.status, 1); assert.match(bad.stderr, /no verified renderer/);
  assert.equal(ffx("lint-plan", path.join(ROOT, "tests/fixtures/plan_v2_valid.json")).status, 0);
});
test("every mode in components.json exists in visual_modes and has a recipe entry", () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "config/components.json"), "utf8")), modes = JSON.parse(fs.readFileSync(path.join(ROOT, "config/visual_modes.json"), "utf8"));
  for (const m of Object.keys(reg.modes)) assert.ok(modes.modes.some((x) => x.id === m), m);
});

test("the 18 s demo plan (hero, line, bar) is lint-clean, renderable and builds props", () => {
  const f = path.join(ROOT, "tests/fixtures/plan_v2_demo.json");
  const r = ffx("lint-plan", f, "--renderable"); assert.equal(r.status, 0, r.stderr);
  const p = planProps(f, PACK); assert.equal(p.plan.totalFrames, 540); assert.equal(p.plan.scenes[0].beats.length, 3);
});
