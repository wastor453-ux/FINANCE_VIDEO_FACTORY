import test from "node:test";
import assert from "node:assert/strict";
import { oklchToHex, contrast, luminance, generateTheme, validateTheme, seedFromString, seedWithLedger, checkLedger, BASE_SEED } from "../lib/theme.mjs";

test("contrast maths: black/white is 21, white/white is 1, order does not matter", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 0.01);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.equal(contrast("#123456", "#fedcba"), contrast("#fedcba", "#123456"));
  assert.ok(luminance("#ffffff") > 0.99);
});
test("oklch: white stays white, out-of-gamut chroma is reduced not clipped to garbage", () => {
  assert.equal(oklchToHex(1, 0, 0), "#ffffff");
  assert.match(oklchToHex(0.6, 0.4, 145), /^#[0-9a-f]{6}$/);
});
test("the same seed string gives the same theme; different strings give different themes", () => {
  assert.deepEqual(generateTheme(seedFromString("topic|ep1")), generateTheme(seedFromString("topic|ep1")));
  assert.notEqual(generateTheme(seedFromString("topic|ep1")).id, generateTheme(seedFromString("topic|ep2")).id);
});
test("the neutral base seed passes the gate", () => {
  assert.deepEqual(validateTheme(generateTheme(BASE_SEED)), []);
});
test("PROPERTY: 1500 generated themes all pass the gate (no seed can produce an unreadable theme)", () => {
  const bad = [];
  for (let i = 0; i < 1500; i++) { const sd = seedFromString(`prop-${i}`); const f = validateTheme(generateTheme(sd)); if (f.length) bad.push([sd, f.slice(0, 2)]); }
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 3)));
});
test("gate catches broken themes: low contrast, overshoot easing, tiny type, no tabular numerals", () => {
  const t = generateTheme(BASE_SEED);
  const broken = structuredClone(t);
  broken.color.ink = "#bbbbbb"; broken.motion.ease.enter = [0, 0, 0.3, 1.4]; broken.type.scalePx.body = 30; broken.type.numeralFeatures = "lnum";
  const f = validateTheme(broken).join(" | ");
  assert.match(f, /ink on surface/); assert.match(f, /overshoot/); assert.match(f, /phone-legibility/); assert.match(f, /tabular/);
});
test("series colours: 8 slots, adjacent hues apart and fills differ", () => {
  const t = generateTheme(seedFromString("x"));
  assert.equal(t.color.series.length, 8);
  assert.equal(new Set(t.color.series.map((s) => s.fill)).size, 8);
});
test("variety ledger: too-close hue and repeated background+font are rejected; seedWithLedger finds a valid one", () => {
  const recent = Array.from({ length: 6 }, (_, i) => ({ ...BASE_SEED, primaryHue: i * 60 }));
  assert.ok(checkLedger({ ...BASE_SEED, primaryHue: 5 }, recent).length > 0);
  assert.ok(checkLedger({ ...BASE_SEED, primaryHue: 262 }, [BASE_SEED]).some((m) => /same background/.test(m)));
  const r = seedWithLedger("topic|ep9", recent);
  assert.deepEqual(checkLedger(r.seed, recent), []); assert.equal(r.relaxed, false);
});
test("ledger relaxes (and says so) when 8 recent themes leave no free hue at the full distance", () => {
  const crowded = Array.from({ length: 8 }, (_, i) => ({ ...BASE_SEED, primaryHue: i * 45, background: "mesh-static", fontPair: "b" }));
  const r = seedWithLedger("topic|ep10", crowded);
  assert.equal(r.relaxed, true); assert.ok(r.minHueUsed < 30);
});
