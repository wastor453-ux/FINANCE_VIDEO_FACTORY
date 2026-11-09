import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { validate } from "../lib/schema.mjs";
import { loadStylePack } from "../lib/style.mjs";
import { lintPlanV2 } from "../lib/plan-v2.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const schema = rj("schemas/scene_plan_v2.schema.json"), recipes = rj("config/motion_recipes.json"), modes = rj("config/visual_modes.json");
const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
const base = () => rj("tests/fixtures/plan_v2_valid.json");
const lint = (p, extra = {}) => lintPlanV2(p, { recipes, modes, pack, ...extra });
const beat = (p, i) => p.scenes[0].beats[i];
const expectErr = (p, re, extra) => { const r = lint(p, extra); assert.ok(r.errors.some((e) => re.test(e)), `expected ${re}, got ${JSON.stringify(r.errors)}`); };

test("valid fixture passes schema and lint with no errors or warnings", () => {
  assert.deepEqual(validate(schema, base()), []);
  const r = lint(base()); assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, []);
});
test("every visual mode has a recipe entry, and every listed recipe exists", () => {
  for (const m of modes.modes) assert.ok(recipes.modes[m.id], `mode ${m.id} missing`);
  for (const [id, m] of Object.entries(recipes.modes)) for (const r of m.recipes) assert.ok(recipes.recipes[r], `${id} lists unknown recipe ${r}`);
  for (const r of recipes.alwaysAllowed) assert.ok(recipes.recipes[r]);
  for (const e of Object.values(recipes.recipes)) assert.ok(recipes.easings.includes(e.ease));
  for (const [k, r] of Object.entries(recipes.recipes)) if (r.packKey) assert.ok(pack.motion.durationSec[r.packKey], `${k} packKey`);
});
test("schema rejects unknown fields and wrong version", () => {
  const p = base(); p.scenes[0].beats[0].extra = 1; assert.ok(validate(schema, p).length);
  const q = base(); q.schema_version = "1.0"; assert.ok(validate(schema, q).length);
});

const cases = [
  ["wrong style pack", (p) => { p.style.packId = "other"; }, /style pack/],
  ["unknown background", (p) => { p.style.background = "nope"; }, /unknown background/],
  ["scene gap", (p) => { p.scenes[0].startFrame = 5; }, /first scene must start at frame 0/],
  ["beat gap", (p) => { beat(p, 1).startFrame = 160; }, /gap or overlap/],
  ["totalFrames mismatch", (p) => { p.totalFrames = 800; }, /totalFrames/],
  ["duplicate beat id", (p) => { beat(p, 1).id = "S01-B1"; }, /beat ids are not unique/],
  ["unknown mode", (p) => { beat(p, 0).mode = "wow"; }, /unknown visual mode/],
  ["unknown recipe", (p) => { beat(p, 0).events[0].recipe = "sparkle"; }, /unknown recipe/],
  ["recipe not allowed in mode", (p) => { beat(p, 0).events.push({ id: "e9", recipe: "bar_rise", role: "secondary", startFrame: 60, endFrame: 80, holdUntilFrame: 110, exitFrame: 150, ease: "ease-out" }); }, /not allowed in mode/],
  ["too slow move", (p) => { const e = beat(p, 2).events[1]; e.endFrame = 400; e.holdUntilFrame = 450; }, /line_draw lasts/],
  ["too fast move", (p) => { const e = beat(p, 3).events[1]; e.endFrame = 595; e.holdUntilFrame = 640; }, /bar_rise lasts/],
  ["unknown easing", (p) => { beat(p, 0).events[0].ease = "bounce"; }, /unknown easing/],
  ["linear on non-linear recipe", (p) => { beat(p, 0).events[0].ease = "linear"; }, /linear easing/],
  ["hold too short", (p) => { const e = beat(p, 1).events[0]; e.holdUntilFrame = 190; }, /must stay visible/],
  ["text read time", (p) => { beat(p, 0).events[0].params.words = 20; }, /to read/],
  ["text words missing", (p) => { delete beat(p, 0).events[0].params; }, /params\.words/],
  ["no primary", (p) => { beat(p, 3).events[1].role = "secondary"; }, /at least one primary/],
  ["non-primary recipe as primary", (p) => { beat(p, 2).events[0].role = "primary"; }, /cannot be a primary/],
  ["frame order", (p) => { const e = beat(p, 0).events[0]; e.holdUntilFrame = 20; }, /frames must satisfy/],
  ["event after beat end", (p) => { beat(p, 0).events[0].exitFrame = 400; }, /frames must satisfy/],
  ["anchor drift", (p) => { beat(p, 1).events[0].anchor.startMs = 9000; }, /calls for/],
  ["low anchor without fallback flag", (p) => { beat(p, 1).events[0].anchor.confidence = "low"; }, /fallback/],
  ["number not in data", (p) => { beat(p, 1).onScreenText = ["35% of income"]; }, /no matching data point/],
  ["too little data", (p) => { beat(p, 2).data = beat(p, 2).data.slice(0, 2); }, /at least 3/],
  ["too much data", (p) => { const d = { label: "x", value: 1, unit: "%", illustrative: true }; for (let i = 0; i < 6; i++) beat(p, 1).data.push(d); }, /at most/],
  ["character in video", (p) => { beat(p, 0).usesCharacter = true; }, /character/],
  ["long text line", (p) => { beat(p, 0).onScreenText = ["w".repeat(95)]; }, /over 90/],
  ["heavy overlap", (p) => { const e = beat(p, 2).events; e.push({ id: "e9", recipe: "line_draw", role: "secondary", startFrame: 360, endFrame: 385, holdUntilFrame: 415, exitFrame: 570, ease: "ease-out" }); }, /heavy events/],
  ["dead air", (p) => { const b = beat(p, 0); b.endFrame = 400; p.scenes[0].beats[1].startFrame = 400; }, /no new event/],
  ["three same modes", (p) => { for (let i = 0; i < 3; i++) { const b = beat(p, i === 2 ? 3 : i); } beat(p, 1).mode = "hook_question"; beat(p, 2).mode = "hook_question"; }, /three beats in a row/],
  ["unknown transition", (p) => { beat(p, 1).transitionIn = { type: "spin" }; }, /unknown transition/],
];
for (const [name, mut, re] of cases) test(`rule: ${name}`, () => { const p = base(); mut(p); expectErr(p, re); });

test("four moving elements at once is rejected", () => {
  const p = base(); const b = beat(p, 2);
  for (const id of ["e4", "e5", "e6"]) b.events.push({ id, recipe: "pill_in", role: "secondary", startFrame: 352, endFrame: 364, holdUntilFrame: 395, exitFrame: 570, ease: "ease-out" });
  expectErr(p, /move at the same time/);
});
test("voice manifest cross-check", () => {
  const ok = { totalMs: 25000, scenes: [{ sceneId: "S01" }] };
  assert.deepEqual(lint(base(), { voice: ok }).errors, []);
  expectErr(base(), /no voiceover/, { voice: { totalMs: 25000, scenes: [{ sceneId: "S02" }] } });
  expectErr(base(), /differs from narration/, { voice: { totalMs: 60000, scenes: [{ sceneId: "S01" }] } });
});
test("script cross-check", () => {
  const sc = { scenes: [{ id: "S01", beats: ["S01-B1", "S01-B2", "S01-B3", "S01-B4"].map((id) => ({ id })) }] };
  assert.deepEqual(lint(base(), { script: sc }).errors, []);
  sc.scenes[0].beats.pop(); expectErr(base(), /not in script scene/, { script: sc });
});
test("ffx lint-plan detects v2 and returns exit codes", () => {
  const f = path.join(ROOT, "tests/fixtures/plan_v2_valid.json");
  const ok = spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), "lint-plan", f], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /PLAN OK \(v2\)/);
  const bad = base(); bad.scenes[0].beats[0].mode = "wow";
  const tmp = path.join(ROOT, "tests/fixtures/_plan_v2_bad.json"); fs.writeFileSync(tmp, JSON.stringify(bad));
  try { const r = spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), "lint-plan", tmp], { encoding: "utf8" }); assert.equal(r.status, 1); assert.match(r.stderr, /unknown visual mode/); } finally { fs.unlinkSync(tmp); }
});
