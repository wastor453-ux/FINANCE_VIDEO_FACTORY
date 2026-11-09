import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bezier, progress, eased, envelope, countValue, formatNumber, decimalsOf, scaleRef } from "../../src/motion/math.mjs";
import { loadStylePack } from "../lib/style.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));

test("every pack easing starts at 0, ends at 1, never overshoots and never goes backwards", () => {
  for (const [name, c] of Object.entries(pack.motion.easing)) {
    const f = bezier(c); assert.equal(f(0), 0); assert.equal(f(1), 1);
    let prev = 0; for (let i = 1; i <= 200; i++) { const y = f(i / 200); assert.ok(y >= 0 && y <= 1 + 1e-6, `${name} overshoot at ${i}`); assert.ok(y >= prev - 1e-6, `${name} goes backwards at ${i}`); prev = y; }
  }
});
test("linear curve is the identity; progress clamps; same frame gives same value", () => {
  assert.ok(Math.abs(bezier([0, 0, 1, 1])(0.37) - 0.37) < 1e-5);
  assert.equal(progress(-5, 0, 10), 0); assert.equal(progress(15, 0, 10), 1); assert.equal(progress(5, 0, 10), 0.5);
  assert.equal(eased(pack, "ease-out", 7, 0, 20), eased(pack, "ease-out", 7, 0, 20));
});
test("ease-out moves most of the way early (fast start, soft landing)", () => { assert.ok(eased(pack, "ease-out", 5, 0, 20) > 0.4); assert.ok(eased(pack, "ease-out", 10, 0, 20) > 0.7); });
test("envelope: hidden, in, held, out", () => {
  const ev = { ease: "ease-out", startFrame: 10, endFrame: 30, holdUntilFrame: 60, exitFrame: 80 };
  assert.equal(envelope(pack, ev, 0, 10), 0); assert.equal(envelope(pack, ev, 45, 10), 1); assert.equal(envelope(pack, ev, 80, 10), 0);
  assert.ok(envelope(pack, ev, 75, 10) < 1 && envelope(pack, ev, 75, 10) > 0);
  assert.equal(envelope(pack, { ...ev, exitFrame: undefined }, 500, 10), 1);
});
test("number formatting and count-up", () => {
  assert.equal(formatNumber(12480, 2), "12,480.00"); assert.equal(formatNumber(-1234567), "-1,234,567"); assert.equal(formatNumber(0.5, 1), "0.5");
  assert.equal(countValue(12480, 0.5), 6240); assert.equal(countValue(12.4, 1, 1), 12.4); assert.equal(decimalsOf(12.4), 1); assert.equal(decimalsOf(100), 0);
});
test("reference lengths scale with frame width", () => { assert.ok(Math.abs(scaleRef(pack, 8.5, 1920) - 10.625) < 1e-9); });
