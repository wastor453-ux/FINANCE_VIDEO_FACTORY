import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildCameraKeys, cameraAt, backgroundAt, motionReport } from "../../src/motion/life.mjs";
import { loadKits, loadPackById } from "../lib/kits.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffx = (...a) => spawnSync("node", [path.join(ROOT, "bin/ffx.mjs"), ...a], { encoding: "utf8" });
const F = (n) => path.join(ROOT, "tests/fixtures/pay_b", n), D = fs.mkdtempSync(path.join(os.tmpdir(), "life-"));
const planFor = (kit) => { const out = path.join(D, `${kit}.json`); const r = ffx("plan-compile", "--script", F("script.json"), "--voice", F("voice.json"), "--design", F("design.json"), "--timings", F("timings.json"), "--kit", kit, "--out", out); assert.equal(r.status, 0, r.stderr); return JSON.parse(fs.readFileSync(out, "utf8")); };

test("camera is deterministic and continuous across beat boundaries (no reset, no jump)", () => {
  const { pack } = loadPackById(ROOT, "pale-glass"), life = pack.scene.life, plan = planFor("pale-glass"), keys = buildCameraKeys(plan, life);
  assert.deepEqual(keys, buildCameraKeys(plan, life));
  const b = plan.scenes.flatMap((s) => s.beats);
  for (let i = 1; i < b.length; i++) { const f = b[i].startFrame, a = cameraAt(f - 1, keys, life, plan.fps, "s"), c = cameraAt(f, keys, life, plan.fps, "s"); assert.ok(Math.abs(a.x - c.x) < 2 && Math.abs(a.zoom - c.zoom) < 0.002, `jump at ${b[i].id}`); }
  assert.deepEqual(cameraAt(100, keys, life, 30, "s"), cameraAt(100, keys, life, 30, "s"));
});

test("every kit passes the motion gate (speed limits and no dead stretches) on the fixture video", () => {
  for (const k of loadKits(ROOT).kits) { const { pack } = loadPackById(ROOT, k.id), mr = motionReport(planFor(k.id), pack.scene.life); assert.deepEqual(mr.problems, [], `${k.id} ${JSON.stringify(mr.stats)}`); }
});

test("the gate really catches a dead camera and a too-fast one", () => {
  const { pack } = loadPackById(ROOT, "pale-glass"), plan = planFor("pale-glass");
  const dead = { ...pack.scene.life, panPx: 0, zoomMax: 0, rollDeg: 0, handheldPx: 0, handheldRollDeg: 0 };
  assert.ok(motionReport(plan, dead).problems.some((p) => p.startsWith("dead motion")));
  const fast = { ...pack.scene.life, amp: 1.5, panPx: 90, zoomMax: 0.08, rollDeg: 1.2 };
  assert.ok(motionReport(plan, fast).problems.length > 0);
});

test("background follows the camera slower than the foreground and stays over-scaled", () => {
  const { pack } = loadPackById(ROOT, "pale-glass"), life = pack.scene.life, plan = planFor("pale-glass"), keys = buildCameraKeys(plan, life);
  for (let f = 0; f < plan.totalFrames; f += 7) { const c = cameraAt(f, keys, life, 30, "s"), bg = backgroundAt(f, c, life, 30, "s"); assert.ok(bg.scale >= 1.09); assert.ok(Math.abs(bg.x) <= life.bgDriftPx + life.panPx * life.bgFollow + 1); }
});

test("a bad life section is rejected by the pack gates", () => {
  const { pack } = loadPackById(ROOT, "pale-glass");
  const { validateStylePack } = awaitedStyle;
  const bad = structuredClone(pack); bad.scene.life.panPx = 200; bad.scene.life.bgScale = 1.0;
  const probs = validateStylePack(bad, path.join(ROOT, "config/styles/owner-pale-glass"));
  assert.ok(probs.some((p) => p.includes("scene.life")));
});
import * as awaitedStyle from "../lib/style.mjs";
