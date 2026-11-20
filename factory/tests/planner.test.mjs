import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validate } from "../lib/schema.mjs";
import { loadStylePack } from "../lib/style.mjs";
import { lintPlanV2 } from "../lib/plan-v2.mjs";
import { compilePlan, alignScene, findCue } from "../lib/planner.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
const recipes = rj("config/motion_recipes.json"), modes = rj("config/visual_modes.json"), reg = rj("config/components.json");
const inputs = () => ({ script: rj("tests/fixtures/dan/script_s01_s03.json"), voice: rj("tests/fixtures/dan/voice_s01_s03.json"), timings: rj("tests/fixtures/dan/timings_s01_s03.json"), design: rj("tests/fixtures/dan/design_s01_s03.json"), pack, recipes });
const lint = (plan, script) => lintPlanV2(plan, { recipes, modes, pack, script, renderable: reg.modes, renderableTransitions: reg.transitions });

test("Dan Martell S01-S03: compiled plan is schema-valid and lint-clean with --script and --renderable", () => {
  const { plan } = compilePlan(inputs());
  assert.deepEqual(validate(rj("schemas/scene_plan_v2.schema.json"), plan), []);
  const r = lint(plan, inputs().script);
  assert.deepEqual(r.errors, []);
  assert.equal(plan.scenes.flatMap((s) => s.beats).length, 20);
});

test("compiling is deterministic", () => {
  assert.equal(JSON.stringify(compilePlan(inputs()).plan), JSON.stringify(compilePlan(inputs()).plan));
});

test("every anchored event starts at its spoken word minus the lead (or is reported as low confidence)", () => {
  const { plan } = compilePlan(inputs());
  const fps = plan.fps;
  for (const s of plan.scenes) for (const b of s.beats) for (const e of b.events) if (e.anchor?.confidence === "ok") assert.ok(Math.abs(e.startFrame - (Math.round((e.anchor.startMs * fps) / 1000) - pack.motion.leadFrames)) <= 1, `${b.id}/${e.id}`);
});

test("scenes cover the whole timeline with no gap and entry transitions only on scene starts", () => {
  const { plan } = compilePlan(inputs());
  plan.scenes.forEach((s, i) => { if (i) assert.equal(s.startFrame, plan.scenes[i - 1].endFrame); s.beats.forEach((b, j) => assert.equal(Boolean(b.transitionIn), i > 0 && j === 0, b.id)); });
  assert.equal(plan.totalFrames, plan.scenes.at(-1).endFrame);
});

test("planner refuses instead of guessing: missing design, unknown cue, word mismatch, beat too short", () => {
  let i = inputs(); delete i.design.beats.S01B3; assert.throws(() => compilePlan(i), /S01B3: no design/);
  i = inputs(); i.design.beats.S01B5.cues[0] = "nonexistent phrase"; assert.throws(() => compilePlan(i), /cue "nonexistent phrase" is not spoken/);
  i = inputs(); i.timings[0].words[3].word = "wrong"; assert.throws(() => alignScene(i.script.scenes[0], i.voice.scenes[0], i.timings[0]), /does not match timing word/);
  i = inputs(); i.design.beats.S01B6.mode = "donut_allocation"; assert.throws(() => compilePlan(i), /no planner rule yet/);
});

test("a blocked timing word gives a low-confidence fallback anchor; unblocked is ok", () => {
  const i = inputs(), w = i.timings[0].words[0]; // "You", the cue of S01B1's first event
  const anchorOf = (blocked) => compilePlan({ ...i, blockedWords: blocked, scenes: ["S01"] }).plan.scenes[0].beats[0].events.find((e) => e.anchor?.wordIndex === 0).anchor;
  assert.equal(anchorOf([]).confidence, "ok");
  const a = anchorOf([{ sceneId: "S01", word: w.word, startSec: w.startSec }]);
  assert.equal(a.confidence, "low"); assert.equal(a.fallback, true);
});

test("CLI plan-compile writes a plan that lint-plan accepts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-"));
  const out = path.join(dir, "plan.json"), f = (n) => path.join(ROOT, "tests/fixtures/dan", n);
  let r = spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), "plan-compile", "--script", f("script_s01_s03.json"), "--voice", f("voice_s01_s03.json"), "--timings", f("timings_s01_s03.json"), "--design", f("design_s01_s03.json"), "--scenes", "S01,S02,S03", "--out", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  r = spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), "lint-plan", out, "--script", f("script_s01_s03.json"), "--style", path.join(ROOT, "config/styles/owner-pale-glass"), "--renderable"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PLAN OK/);
});

test("variants: hero figures rotate through proportion forms, a single non-percentage stands alone, design can override, lint checks fit", () => {
  const { plan } = compilePlan(inputs());
  const v = Object.fromEntries(plan.scenes.flatMap((s) => s.beats).filter((b) => b.mode === "hero_number").map((b) => [b.id, b.variant]));
  assert.deepEqual(v, { S02B5: "number", S03B1: "waffle", S03B3: "ring" });
  const i = inputs(); i.design.beats.S03B1.variant = "bar";
  assert.equal(compilePlan(i).plan.scenes[2].beats[0].variant, "bar");
  const bad = compilePlan(inputs()).plan, hero = bad.scenes[1].beats.find((b) => b.id === "S02B5");
  hero.variant = "waffle"; assert.ok(lint(bad, inputs().script).errors.some((e) => /must be a percentage/.test(e)));
  hero.variant = "panel"; assert.ok(lint(bad, inputs().script).errors.some((e) => /needs a series/.test(e)));
  hero.variant = "spiral"; assert.ok(lint(bad, inputs().script).errors.some((e) => /unknown variant/.test(e)));
});

test("source tiles are a style-pack setting (off by default), overridable per data point", () => {
  assert.equal(pack.scene.sourceTag, "off");
  for (const f of ["components/HeroScene.tsx", "components/BarScene.tsx", "components/LineScene.tsx"]) assert.match(fs.readFileSync(path.join(ROOT, "../src", f), "utf8"), /showSource \?\? [a-z]+\.sourceTag === "on"/, f);
});
