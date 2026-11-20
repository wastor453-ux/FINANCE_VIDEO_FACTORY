import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../lib/schema.mjs";
import { loadStylePack } from "../lib/style.mjs";
import { lintPlanV2 } from "../lib/plan-v2.mjs";
import { compilePlan } from "../lib/planner.mjs";

// Second, independent test video (different topic and tone, all eight renderable modes). Everything general must hold for BOTH videos;
// a rule that only works on the Dan Martell fixture fails here. Numbers are invented and timing is synthetic (see _note in the files).
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
const recipes = rj("config/motion_recipes.json"), modes = rj("config/visual_modes.json"), comp = rj("config/components.json");
const FIX = {
  dan: () => ({ script: rj("tests/fixtures/dan/script_s01_s03.json"), voice: rj("tests/fixtures/dan/voice_s01_s03.json"), timings: rj("tests/fixtures/dan/timings_s01_s03.json"), design: rj("tests/fixtures/dan/design_s01_s03.json"), pack, recipes }),
  pay_b: () => ({ script: rj("tests/fixtures/pay_b/script.json"), voice: rj("tests/fixtures/pay_b/voice.json"), timings: rj("tests/fixtures/pay_b/timings.json"), design: rj("tests/fixtures/pay_b/design.json"), pack, recipes }),
};
const lint = (plan, script) => lintPlanV2(plan, { recipes, modes, pack, script, renderable: comp.modes, renderableTransitions: comp.transitions });

for (const [name, mk] of Object.entries(FIX)) {
  test(`[${name}] compiles, is schema-valid, lint-clean for rendering, and deterministic`, () => {
    const a = compilePlan(mk()), b = compilePlan(mk());
    assert.deepEqual(a.plan, b.plan); assert.deepEqual(a.decisions, b.decisions);
    assert.deepEqual(validate(rj("schemas/scene_plan_v2.schema.json"), a.plan), []);
    assert.deepEqual(lint(a.plan, mk().script).errors, []);
  });
  test(`[${name}] looks vary: neighbouring beats of one mode never share a variant, no look dominates`, () => {
    const { decisions } = compilePlan(mk()), by = {};
    for (const d of decisions) (by[d.mode] ??= []).push(d.variant);
    for (const [m, vs] of Object.entries(by)) {
      for (let i = 1; i < vs.length; i++) if (new Set(vs).size > 1) assert.notEqual(vs[i], vs[i - 1], `${m}: ${vs.join(",")}`);
      if (vs.length >= 4) assert.ok(Math.max(...Object.values(vs.reduce((o, v) => ((o[v] = (o[v] ?? 0) + 1), o), {}))) <= Math.ceil(vs.length / 2), `${m}: ${vs.join(",")}`);
    }
  });
}

test("fixture B uses every renderable mode, so no mode can be renderable but unplannable", () => {
  const used = new Set(compilePlan(FIX.pay_b()).plan.scenes.flatMap((s) => s.beats.map((b) => b.mode)));
  assert.deepEqual([...used].sort(), Object.keys(comp.modes).sort());
});

test("fixture B: the line chart is planned from its cue with axes first and every number traceable", () => {
  const { plan } = compilePlan(FIX.pay_b()), b = plan.scenes.flatMap((s) => s.beats).find((x) => x.mode === "line_chart");
  const axes = b.events.find((e) => e.recipe === "axes_in"), line = b.events.find((e) => e.recipe === "line_draw");
  assert.ok(axes.endFrame <= line.startFrame && line.role === "primary" && line.anchor?.word);
});

test("fixture B: a script number that the narrator does not say is refused", () => {
  const i = FIX.pay_b(); i.design.beats.S01B5.data[0].value = 217;
  const { plan } = compilePlan(i); assert.ok(lint(plan, i.script).errors.some((e) => /does not appear in claim F3/.test(e)));
});
