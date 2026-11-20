import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadRegistry, validateRegistry, chooseVariant, newHistory, record, coverage, variantsOf, fitError } from "../lib/registry.mjs";
import { loadStylePack } from "../lib/style.mjs";
import { lintPlanV2 } from "../lib/plan-v2.mjs";
import { compilePlan } from "../lib/planner.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const reg = loadRegistry(), modes = rj("config/visual_modes.json"), comp = rj("config/components.json"), recipes = rj("config/motion_recipes.json");
const modeIds = new Set(modes.modes.map((m) => m.id));
const pct = { value: 28, unit: "%" };
const run = (n, extra = {}) => { const h = newHistory(), out = []; for (let i = 0; i < n; i++) { const r = chooseVariant(reg, { mode: "hero_number", dp: pct, beatId: `B${i}`, history: h, ...extra }); record(h, "hero_number", r.variant); out.push(r.variant); } return out; };

test("registry file is valid and covers every renderable mode", () => {
  assert.deepEqual(validateRegistry(reg, { modeIds, renderable: comp.modes }), []);
  for (const m of Object.keys(comp.modes)) assert.ok(variantsOf(reg, m).length >= 1, m);
});

test("registry validation catches duplicates, bad status, unknown mode, verified without renderer", () => {
  const bad = { variants: [{ id: "a", mode: "hero_number", status: "verified", label: "x", fits: {} }, { id: "a", mode: "hero_number", status: "verified", label: "x", fits: {} }, { id: "b", mode: "nope", status: "ready", label: "x", fits: {} }, { id: "c", mode: "timeline", status: "verified", label: "x", fits: {} }] };
  const e = validateRegistry(bad, { modeIds: new Set(["hero_number", "timeline"]), renderable: comp.modes }).join("\n");
  for (const re of [/duplicate variant/, /status must be/, /unknown visual mode/, /no renderer/]) assert.match(e, re);
});

test("every hero variant in the registry is implemented by the component (guard against a registry that promises looks nobody draws)", () => {
  const src = fs.readFileSync(path.join(ROOT, "../src/components/HeroScene.tsx"), "utf8");
  for (const v of variantsOf(reg, "hero_number", { includeDraft: true })) assert.ok(src.includes(`"${v.id}"`), `HeroScene does not implement ${v.id}`);
});

test("every non-default variant is implemented by its mode's component, and the component renders no variant the registry does not list", () => {
  for (const v of reg.variants) {
    if (v.id === "default") continue;
    const src = fs.readFileSync(path.join(ROOT, `../src/components/${comp.modes[v.mode]}.tsx`), "utf8");
    assert.ok(src.includes(`"${v.id}"`), `${comp.modes[v.mode]} does not implement ${v.mode}/${v.id}`);
  }
  const diag = fs.readFileSync(path.join(ROOT, "../src/components/DiagramScene.tsx"), "utf8");
  for (const m of [...diag.matchAll(/variant === "(\w+)"/g)].map((x) => x[1])) assert.ok(reg.variants.some((v) => v.id === m && ["process_flow", "causal_diagram", "annotation_callout"].includes(v.mode)), `DiagramScene draws "${m}" but the registry has no such variant`);
});

test("content-count limits: chevron needs 3-5 items, so a 2-step flow never gets it", () => {
  const chev = variantsOf(reg, "process_flow").find((v) => v.id === "chevron"), h = newHistory();
  assert.match(fitError(chev, undefined, 2), /at least 3/); assert.equal(fitError(chev, undefined, 4), null);
  for (let i = 0; i < 8; i++) { const r = chooseVariant(reg, { mode: "process_flow", nItems: 2, beatId: `F${i}`, history: h }); assert.notEqual(r.variant, "chevron"); record(h, "process_flow", r.variant); }
  const seen = new Set(); const h2 = newHistory(); for (let i = 0; i < 9; i++) { const r = chooseVariant(reg, { mode: "process_flow", nItems: 3, beatId: `G${i}`, history: h2 }); seen.add(r.variant); record(h2, "process_flow", r.variant); }
  assert.deepEqual([...seen].sort(), ["chevron", "default", "vertical"]);
});

test("art director: never repeats, spreads use, is deterministic, seed changes ties but stays repeatable", () => {
  const a = run(9); assert.deepEqual(a, run(9));
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1]);
  const counts = a.reduce((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {}); assert.ok(Math.max(...Object.values(counts)) <= 4, JSON.stringify(counts));
  assert.deepEqual(run(9, { seed: "run-1" }), run(9, { seed: "run-1" }));
  assert.ok(["run-1", "run-2", "run-3", "run-4"].some((s) => JSON.stringify(run(9, { seed: s })) !== JSON.stringify(a)), "seed never changed the order");
});

test("art director: data shape decides what is eligible; mood breaks ties; design lock and fit errors are enforced", () => {
  const h = newHistory();
  assert.equal(chooseVariant(reg, { mode: "hero_number", dp: { value: 30, unit: "$" }, beatId: "x", history: h }).variant, "number");
  assert.equal(chooseVariant(reg, { mode: "hero_number", dp: { value: 30, unit: "$", series: [1, 2] }, beatId: "x", history: h }).variant, "panel");
  assert.equal(chooseVariant(reg, { mode: "hero_number", dp: pct, beatId: "x", history: h, brief: { mood: ["serious"] } }).variant, "bar");
  assert.equal(chooseVariant(reg, { mode: "hero_number", dp: pct, beatId: "x", history: h, brief: { mood: ["friendly"] } }).variant, "waffle");
  assert.equal(chooseVariant(reg, { mode: "hero_number", dp: pct, beatId: "x", history: h, banned: ["hero_number/waffle", "hero_number/ring"] }).variant, "bar");
  assert.throws(() => chooseVariant(reg, { mode: "hero_number", dp: { value: 3, unit: "$" }, beatId: "x", history: h, locked: "ring" }), /percentage/);
  assert.throws(() => chooseVariant(reg, { mode: "hero_number", dp: pct, beatId: "x", history: h, locked: "spiral" }), /not a verified variant/);
  assert.equal(chooseVariant(reg, { mode: "bar_chart", dp: undefined, beatId: "x", history: h }).variant, null); // single default look
});

test("draft variants are never chosen and lint rejects them in production plans", () => {
  const r2 = JSON.parse(JSON.stringify(reg)); r2.variants.push({ id: "orbit", mode: "hero_number", status: "draft", label: "x", fits: { needsPercent: true }, auto: { series: false, percent: true } });
  assert.ok(!run(12).includes("orbit"));
  const h = newHistory(); for (let i = 0; i < 12; i++) { const r = chooseVariant(r2, { mode: "hero_number", dp: pct, beatId: `B${i}`, history: h }); record(h, "hero_number", r.variant); assert.notEqual(r.variant, "orbit"); }
  const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
  const inp = { script: rj("tests/fixtures/dan/script_s01_s03.json"), voice: rj("tests/fixtures/dan/voice_s01_s03.json"), timings: rj("tests/fixtures/dan/timings_s01_s03.json"), design: rj("tests/fixtures/dan/design_s01_s03.json"), pack, recipes };
  const plan = compilePlan(inp).plan; plan.scenes[2].beats[0].variant = "orbit";
  const res = lintPlanV2(plan, { recipes, modes, pack, script: inp.script, registry: r2 });
  assert.ok(res.errors.some((e) => /still a draft/.test(e)), res.errors.join("\n"));
});

test("compile writes one logged decision per beat with a reason; same input gives the same decisions", () => {
  const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
  const inp = { script: rj("tests/fixtures/dan/script_s01_s03.json"), voice: rj("tests/fixtures/dan/voice_s01_s03.json"), timings: rj("tests/fixtures/dan/timings_s01_s03.json"), design: rj("tests/fixtures/dan/design_s01_s03.json"), pack, recipes };
  const a = compilePlan(inp), b = compilePlan(inp);
  assert.equal(a.decisions.length, 20); assert.deepEqual(a.decisions, b.decisions);
  assert.ok(a.decisions.every((d) => d.reason && d.mode && d.variant));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-")), out = path.join(dir, "plan.json"), f = (n) => path.join(ROOT, "tests/fixtures/dan", n);
  const r = spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), "plan-compile", "--script", f("script_s01_s03.json"), "--voice", f("voice_s01_s03.json"), "--timings", f("timings_s01_s03.json"), "--design", f("design_s01_s03.json"), "--scenes", "S01,S02,S03", "--out", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "plan.decisions.json"), "utf8")).decisions.length, 20);
});

test("ffx registry-check passes and reports coverage; coverage flags modes under the target", () => {
  const r = spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), "registry-check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /registry OK/); assert.match(r.stdout, /LOW\s+line_chart/);
  const c = coverage(reg, ["hero_number", "line_chart"]); assert.deepEqual(c.map((x) => x.ready), [true, false]);
  assert.equal(fitError(variantsOf(reg, "hero_number").find((v) => v.id === "ring"), { value: 5, unit: "$" }) !== null, true);
});
