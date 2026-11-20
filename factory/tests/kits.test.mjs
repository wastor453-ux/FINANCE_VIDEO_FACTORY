import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadKits, resolveKit, loadPackById, chooseKit, validateKit } from "../lib/kits.mjs";
import { loadStylePack, validateStylePack } from "../lib/style.mjs";
import { planProps } from "../tools/plan_props.mjs";
import { validate } from "../lib/schema.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffx = (...a) => spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), ...a], { encoding: "utf8" });
const K = loadKits(ROOT), { pack: base } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
const F = (n) => path.join(ROOT, "tests/fixtures/pay_b", n);

test("every kit resolves to a full style pack that passes all pack gates (contrast, motion limits, provenance, backgrounds)", () => {
  assert.ok(K.kits.length >= 5);
  for (const k of K.kits) { const r = loadPackById(ROOT, k.id); assert.deepEqual(r.problems, [], k.id); assert.equal(r.pack.id, k.id); assert.deepEqual(validateKit(k, base), [], k.id); }
});

test("kits really look different: lead colour, background, depth and motion are not all the same", () => {
  const sigs = new Set(K.kits.map((k) => { const p = loadPackById(ROOT, k.id).pack; return JSON.stringify([p.color.series[0].id, p.backgrounds.default, p.scene.settleTiltDeg, p.scene.glass.radiusAtReference, p.motion.durationSec.line_draw]); }));
  assert.equal(sigs.size, K.kits.length);
  assert.equal(ffx("kit-check").status, 0);
});

test("a kit can only reorder or pick board colours; a bad overlay is caught by the pack gates, not trusted", () => {
  const bad = resolveKit(base, { schema: "ffx-style-kit/1", id: "t-bad", base: base.id, label: "x", mood: ["a"], topics: ["b"], overrides: { color: { ink: "#9DB7E0" }, scene: { settleTiltDeg: { x: 40, y: -10 } } } });
  const p = validateStylePack(bad, path.join(ROOT, "config/styles/owner-pale-glass")).join("\n");
  assert.match(p, /ink on surface/); assert.match(p, /settle tilt exceeds limit/);
  assert.throws(() => resolveKit(base, { schema: "ffx-style-kit/1", id: "t", base: base.id, seriesOrder: ["orange"] }), /unknown series/);
  assert.throws(() => resolveKit(base, { schema: "nope", id: "t" }), /unknown schema/);
  assert.ok(validateKit({ id: "t", label: "x", base: base.id, mood: ["a"], topics: ["b"], background: { default: "nope" } }, base).some((e) => /not in the base pack/.test(e)));
  assert.throws(() => loadPackById(ROOT, "no-such-kit"), /no style pack or kit/);
});

test("art director step one: topic and mood pick the kit, locks and bans win, recent kit is avoided, same input same kit", () => {
  const pick = (b, o) => chooseKit(K, b, o);
  assert.equal(pick({ topic: "credit card debt", mood: ["serious"] }).kit, "crisp-blue");
  assert.equal(pick({ topic: "emergency fund savings", mood: ["friendly"] }).kit, "mint-fresh");
  assert.equal(pick({ topic: "retirement planning", mood: ["calm"] }).kit, "lavender-calm");
  assert.equal(pick({ topic: "salary negotiation", mood: ["executive"] }).kit, "deep-focus");
  assert.equal(pick({ topic: "zzz" }).kit, K.index.default);
  assert.match(pick({ topic: "zzz" }).reason, /default kit/);
  assert.equal(pick({ topic: "credit card debt" }, { locked: "mint-fresh" }).kit, "mint-fresh");
  assert.notEqual(pick({ topic: "credit card debt", mood: ["serious"] }, { banned: ["crisp-blue"] }).kit, "crisp-blue");
  assert.equal(pick({ mood: ["calm"] }, { recent: ["mint-fresh"] }).kit, "lavender-calm"); // a tie on mood moves away from the last video
  assert.equal(pick({ topic: "saving", mood: ["calm"] }, { recent: ["mint-fresh"] }).kit, "mint-fresh"); // a strong topic match still wins
  assert.deepEqual(pick({ topic: "debt" }, { seed: "w46" }), pick({ topic: "debt" }, { seed: "w46" }));
  assert.throws(() => pick({}, { locked: "nope" }), /does not exist/);
  assert.throws(() => pick({}, { banned: K.kits.map((k) => k.id) }), /every kit is banned/);
});

test("plan-compile --kit: the plan names the kit, lint resolves it, and the decision (with reason) is written", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-")), out = path.join(dir, "plan.json");
  const common = ["plan-compile", "--script", F("script.json"), "--voice", F("voice.json"), "--timings", F("timings.json"), "--design", F("design.json"), "--out", out];
  let r = ffx(...common, "--kit", "mint-fresh"); assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(fs.readFileSync(out, "utf8")); assert.equal(plan.style.packId, "mint-fresh"); assert.equal(plan.style.background, "glass-aurora");
  assert.deepEqual(validate(JSON.parse(fs.readFileSync(path.join(ROOT, "schemas/scene_plan_v2.schema.json"), "utf8")), plan), []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "plan.decisions.json"), "utf8")).style.kit, "mint-fresh");
  r = ffx("lint-plan", out, "--script", F("script.json"), "--renderable"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /PLAN OK/);
  const d = JSON.parse(fs.readFileSync(F("design.json"), "utf8")); d.brief = { topic: "credit card debt interest", mood: ["serious"] };
  const dfile = path.join(dir, "design.json"); fs.writeFileSync(dfile, JSON.stringify(d));
  r = ffx(...common.map((x) => (x === F("design.json") ? dfile : x)), "--kit", "auto"); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).style.packId, "crisp-blue");
  assert.match(JSON.parse(fs.readFileSync(path.join(dir, "plan.decisions.json"), "utf8")).style.reason, /topic 3, mood 2/);
  assert.notEqual(ffx(...common, "--kit", "mint-fresh", "--style", path.join(ROOT, "config/styles/owner-pale-glass")).status, 0);
  assert.notEqual(ffx(...common, "--kit", "nope").status, 0);
});

test("plan_props accepts a kit id: embeds the resolved pack and the kit's own background from the base assets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitp-")), out = path.join(dir, "plan.json");
  assert.equal(ffx("plan-compile", "--script", F("script.json"), "--voice", F("voice.json"), "--timings", F("timings.json"), "--design", F("design.json"), "--kit", "lavender-calm", "--out", out).status, 0);
  const p = planProps(out, "lavender-calm");
  assert.equal(p.pack.id, "lavender-calm"); assert.equal(p.pack.color.series[0].id, "lavender"); assert.deepEqual(Object.keys(p.backgrounds), ["lavender-horizon"]);
  assert.match(p.backgrounds["lavender-horizon"], /^data:image\/png;base64,/);
  assert.throws(() => planProps(out, "mint-fresh"), /wants style pack "lavender-calm"/);
});

test("colour roles: no component uses a fixed series slot or the surface colour for text, and every kit keeps text legible on every series colour", async () => {
  const { textOn, strongestSeries, contrast } = await import("../../src/motion/color.mjs");
  const dir = path.join(ROOT, "../src/components");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/color: c\.surface/.test(src), `${f}: text colour must come from textOn(), not c.surface`);
    assert.ok(!/S\[5\]/.test(src), `${f}: fixed series slot S[5]; use strongestSeries(c)`);
    assert.ok(!/stroke=\{c\.surface\} strokeWidth=\{8\}/.test(src), `${f}: check mark colour must come from textOn()`);
  }
  for (const k of K.kits) {
    const { pack } = loadPackById(ROOT, k.id), c = pack.color;
    for (const s of c.series) assert.ok(contrast(textOn([s.fill, s.stroke], c), s.fill) >= 3, `${k.id}/${s.id}: text on fill below 3:1`);
    const strong = strongestSeries(c); assert.ok(contrast(textOn(strong.fill, c), strong.fill) >= 4.5, `${k.id}: pill text below 4.5:1`);
  }
});
