import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStylePack, validateStylePack, resolveGeometry } from "../lib/style.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const DIR = path.join(ROOT, "config/styles/owner-pale-glass");
const clone = (o) => structuredClone(o);

test("the owner's style pack loads and passes every gate", () => {
  const { pack, problems } = loadStylePack(DIR);
  assert.deepEqual(problems, []);
  assert.equal(pack.id, "owner-pale-glass");
  assert.equal(pack.backgrounds.items.length, 6);
});

test("every colour in the pack traces to a board sample (no typed colours); both printed and observed values are kept", () => {
  const { pack } = loadStylePack(DIR);
  const prov = pack.provenance.values;
  assert.ok(Object.keys(prov).length >= 18);
  for (const v of Object.values(prov)) { assert.match(v.used, /^#[0-9A-F]{6}$/); assert.ok(v.board && v.region && v.observed); }
  assert.ok(prov["brand.navy"].declared && prov["brand.navy"].deltaE > 0, "printed label and pixels both recorded");
  assert.ok(Object.values(pack.provenance.boards).every((h) => /^[0-9a-f]{64}$/.test(h)));
});

test("gate catches: low-contrast text, untraceable colour, bad background, overshoot easing, long element move, tiny type", () => {
  const { pack } = loadStylePack(DIR);
  const cases = [
    [(p) => { p.color.inkSecondary = "#CCCCCC"; }, /inkSecondary/],
    [(p) => { p.color.primary = "#FF00FF"; p.color.series[0].fill = "#FF00FF"; }, /no board provenance/],
    [(p) => { p.backgrounds.items[0].file = "assets/nope.png"; }, /file missing/],
    [(p) => { p.motion.easing["ease-out"] = [0, 0, 0.3, 1.4]; }, /overshoots/],
    [(p) => { p.motion.durationSec.line_draw = [0.5, 3]; }, /within 1.5 s/],
    [(p) => { p.type.videoScalePx.body = 30; }, /phone-legibility/],
    [(p) => { p.color.series[1].fill = p.color.series[0].fill; }, /identical|not all different/],
  ];
  for (const [mutate, re] of cases) { const p = clone(pack); mutate(p); assert.match(validateStylePack(p, DIR).join(" | "), re); }
});

test("gain and loss never rely on red and differ in lightness", () => {
  const { pack } = loadStylePack(DIR);
  const hue = (hex) => { const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  for (const k of ["gain", "loss", "lossAlt"]) { const h = hue(pack.color.flow[k].fill); assert.ok(h > 150 && h < 290, `${k} hue ${h} must be in the cool range (no red/orange)`); }
});

test("geometry is stored as ratios of the measured board and resolved per frame width", () => {
  const { pack } = loadStylePack(DIR);
  const g = resolveGeometry(pack, 1920);
  assert.ok(g.cardRadiusPx >= 9 && g.cardRadiusPx <= 13);
  assert.equal(resolveGeometry(pack, 1536).cardRadiusPx, Math.round(pack.geometry.cardRadiusAtReference));
  assert.ok(resolveGeometry(pack, 3840).cardRadiusPx > g.cardRadiusPx);
});

test("NO HARD-CODED LOOK: renderer sources and the pack loader contain no colour literals", () => {
  const files = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?|mjs|css)$/.test(e.name)) files.push(p); } };
  walk(path.join(ROOT, "..", "src")); files.push(path.join(ROOT, "lib/style.mjs"));
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(|hsla?\(/g)) if (!/^HEX/.test(text.slice(Math.max(0, m.index - 10), m.index))) hits.push(`${path.relative(ROOT, f)}: ${m[0]}`);
  }
  // lib/style.mjs holds one regex describing the hex FORMAT, which is allowed
  const real = hits.filter((h) => !/lib\/style\.mjs/.test(h));
  assert.deepEqual(real, [], "colour values belong in a style pack, not in code");
});
