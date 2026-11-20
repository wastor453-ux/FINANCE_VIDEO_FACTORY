import test from "node:test";
import assert from "node:assert/strict";
import { transitionStyles, extendBeat, TRANSITIONS } from "../../src/motion/transition.mjs";

test("every transition has sane endpoints and no NaN", () => {
  for (const t of TRANSITIONS) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const s = transitionStyles(t, p);
      assert.ok(!JSON.stringify(s).includes("NaN"), `${t} ${p}`);
    }
  }
  assert.equal(transitionStyles("card_to_chart_zoom", 0).outgoing.opacity, 1);
  assert.equal(transitionStyles("card_to_chart_zoom", 1).incoming.opacity, 1);
  assert.equal(transitionStyles("card_to_chart_zoom", 1).outgoing.opacity, 0);
  assert.match(transitionStyles("shape_mask", 0).incoming.clipPath, /circle\(0px/);
  const full = parseFloat(transitionStyles("shape_mask", 1).incoming.clipPath.match(/circle\(([\d.]+)px/)[1]);
  assert.ok(full >= Math.hypot(1920, 1080) / 2, "circle covers the corners");
  assert.throws(() => transitionStyles("diagram_morph", 0.5));
  assert.equal(transitionStyles("clean_wipe", 7).outgoing.maskImage, transitionStyles("clean_wipe", 1).outgoing.maskImage, "p is clamped");
});

test("extendBeat keeps the beat on screen and drops exits at the old end", () => {
  const b = { endFrame: 180, events: [{ id: "a", exitFrame: 180 }, { id: "b", exitFrame: 150 }, { id: "c" }] };
  const e = extendBeat(b, 200);
  assert.equal(e.endFrame, 200);
  assert.equal("exitFrame" in e.events[0], false);
  assert.equal(e.events[1].exitFrame, 150);
  assert.equal(extendBeat(b, 170), b);
});
