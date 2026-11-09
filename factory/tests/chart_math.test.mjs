import test from "node:test";
import assert from "node:assert/strict";
import { niceTicks, lineDomain, plotPoints, compact } from "../../src/motion/chart.mjs";

test("niceTicks gives round, evenly spaced values that cover the data", () => {
  const t = niceTicks(0, 14000, 4); assert.deepEqual(t.ticks, [0, 5000, 10000, 15000]);
  const u = niceTicks(0, 100, 4); assert.deepEqual(u.ticks, [0, 25, 50, 75, 100].slice(0, u.ticks.length)); assert.ok(u.hi >= 100);
  const w = niceTicks(40, 120, 4); assert.ok(w.lo <= 40 && w.hi >= 120);
  for (const x of [niceTicks(3.2, 9.7), niceTicks(-50, 220), niceTicks(0.001, 0.009)]) for (let i = 1; i < x.ticks.length; i++) assert.ok(Math.abs(x.ticks[i] - x.ticks[i - 1] - x.step) < x.step * 1e-6);
});
test("niceTicks survives flat data", () => { const t = niceTicks(5, 5); assert.ok(t.ticks.length >= 2 && t.hi > t.lo); });
test("lineDomain starts at zero for growth data and zooms for narrow bands", () => {
  assert.equal(lineDomain([1000, 6000, 14000]).lo, 0);
  const n = lineDomain([98, 100, 103]); assert.ok(n.lo > 50 && n.lo < 98);
});
test("plotPoints maps min to the bottom and max to the top, left to right", () => {
  const d = { lo: 0, hi: 10 }, p = plotPoints([0, 5, 10], d, { x: 100, y: 50, w: 200, h: 100 });
  assert.deepEqual(p[0], [100, 150]); assert.deepEqual(p[2], [300, 50]); assert.equal(p[1][0], 200);
});
test("compact labels", () => { assert.equal(compact(0), "0"); assert.equal(compact(12000), "12K"); assert.equal(compact(1500000), "1.5M"); assert.equal(compact(250), "250"); });

import { barDomain, barSlots, roundedTopRect } from "../../src/motion/chart.mjs";
test("bar domain starts at zero and covers the tallest bar", () => { const d = barDomain([1650, 620, 420]); assert.equal(d.lo, 0); assert.ok(d.hi >= 1650); });
test("bar slots are equal, ordered and inside the box", () => {
  const box = { x: 100, y: 0, w: 1000, h: 400 }, s = barSlots(5, box);
  assert.equal(s.length, 5); for (let i = 0; i < 5; i++) { assert.ok(s[i].x >= box.x && s[i].x + s[i].w <= box.x + box.w); if (i) assert.ok(Math.abs(s[i].cx - s[i - 1].cx - 200) < 1e-9); }
});
test("rounded-top path stays valid for tall, short and zero-height bars", () => {
  for (const h of [300, 6, 0]) { const p = roundedTopRect(10, 50, 80, h, 18); assert.ok(!/NaN/.test(p)); assert.ok(p.startsWith("M10 ")); }
  assert.match(roundedTopRect(0, 0, 40, 100, 50), /Q20 0|Q0 0/);
});
