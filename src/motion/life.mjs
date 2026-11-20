// "Life layer": one continuous virtual camera for the whole video (not per beat), plus slow background drift and a tiny handheld wobble.
// Pure functions of (plan, pack.scene.life, frame): same input, same output. Every number comes from the style pack (`scene.life`); kits scale it with `amp`.
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Camera keys: one per beat (at its middle), plus the first and last frame. Push modes move in, overview modes pull back; direction and size are seeded per beat id. */
export function buildCameraKeys(plan, life) {
  const beats = plan.scenes.flatMap((s) => s.beats), amp = life.amp ?? 1, keys = [];
  const total = plan.totalFrames ?? (beats.length ? beats[beats.length - 1].endFrame : 1);
  const push = new Set(life.pushModes ?? []);
  beats.forEach((b, i) => {
    const r = rng(hashStr(`${plan.style?.packId}|${plan.seed ?? ""}|${b.id}`)), mid = Math.round((b.startFrame + b.endFrame) / 2);
    const inward = push.has(b.mode), dir = i % 2 ? -1 : 1;
    keys.push({ f: mid, zoom: 1 + amp * (inward ? life.zoomMax * (0.65 + 0.35 * r()) : life.zoomMax * 0.2 * r()),
      x: dir * amp * life.panPx * (0.5 + 0.5 * r()), y: (r() - 0.5) * 2 * amp * life.panPx * 0.45, roll: (r() - 0.5) * 2 * amp * life.rollDeg });
  });
  if (!keys.length) return [{ f: 0, zoom: 1, x: 0, y: 0, roll: 0 }, { f: total, zoom: 1, x: 0, y: 0, roll: 0 }];
  const first = { ...keys[0], f: 0, zoom: 1 + (keys[0].zoom - 1) * 0.3, x: -keys[0].x * 0.5, y: 0 }, last = { ...keys[keys.length - 1], f: Math.max(total, keys[keys.length - 1].f + 1) };
  return limitKeys([first, ...keys, last], life, plan.fps ?? 30);
}

/** Speed limiter: if the seeded path would move faster than the pack limits (short beats, high amp), shrink the move size, never the timing. */
function limitKeys(keys, life, fps) {
  const L = life.limits, end = keys[keys.length - 1].f, hh = life.handheldPx * (life.amp ?? 1) * 0.9;
  const rate = (get) => { let m = 0, p = get(0); for (let f = 1; f <= end; f++) { const v = get(f); m = Math.max(m, Math.abs(v - p) * fps); p = v; } return m; };
  const ch = (k) => (f) => hermite(keys, k, f);
  const pan = Math.max(rate(ch("x")), rate(ch("y"))), zoom = rate(ch("zoom")), roll = rate(ch("roll"));
  const sp = Math.min(1, (L.maxPxPerSec * 0.8 - hh * 0.5) / Math.max(pan, 1e-6)), sz = Math.min(1, (L.maxZoomPerSec * 0.8) / Math.max(zoom, 1e-9)), sr = Math.min(1, (L.maxRollDegPerSec * 0.8) / Math.max(roll, 1e-9));
  return keys.map((k) => ({ ...k, x: k.x * sp, y: k.y * sp, zoom: 1 + (k.zoom - 1) * sz, roll: k.roll * sr }));
}

/** Hermite spline through the keys with Catmull-Rom tangents (smooth, never stops at a key). */
function hermite(keys, key, f) {
  if (f <= keys[0].f) return keys[0][key]; const n = keys.length; if (f >= keys[n - 1].f) return keys[n - 1][key];
  let i = 0; while (keys[i + 1].f <= f) i++;
  const k0 = keys[i], k1 = keys[i + 1], h = k1.f - k0.f, u = (f - k0.f) / h;
  const m = (j) => (j <= 0 || j >= n - 1 ? 0 : (keys[j + 1][key] - keys[j - 1][key]) / (keys[j + 1].f - keys[j - 1].f));
  const m0 = m(i) * h, m1 = m(i + 1) * h;
  return (2 * u ** 3 - 3 * u ** 2 + 1) * k0[key] + (u ** 3 - 2 * u ** 2 + u) * m0 + (-2 * u ** 3 + 3 * u ** 2) * k1[key] + (u ** 3 - u ** 2) * m1;
}

/** Camera state at an absolute frame: { x, y (px), zoom, roll (deg) } = path + handheld wobble (slow sines with periods that never line up). */
export function cameraAt(frame, keys, life, fps = 30, seed = "") {
  const t = frame / fps, amp = life.amp ?? 1, ph = rng(hashStr(`hh|${seed}`));
  const wob = (period, p) => Math.sin((2 * Math.PI * t) / period + p * 6.2832);
  const hx = life.handheldPx * amp * (wob(7.3, ph()) + 0.6 * wob(3.1, ph())) / 1.6, hy = life.handheldPx * amp * (wob(9.1, ph()) + 0.6 * wob(4.3, ph())) / 1.6, hr = life.handheldRollDeg * amp * wob(11.7, ph());
  return { x: hermite(keys, "x", frame) + hx, y: hermite(keys, "y", frame) + hy, zoom: hermite(keys, "zoom", frame), roll: hermite(keys, "roll", frame) + hr };
}

/** CSS transform for the beat layer (foreground, moves with the camera). */
export const cameraTransform = (c) => `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${c.zoom.toFixed(5)}) rotate(${c.roll.toFixed(4)}deg)`;

/** Background layer: follows the camera at a fraction (depth), plus a slow drift; over-scaled so edges never show. */
export function backgroundAt(frame, cam, life, fps = 30, seed = "") {
  const t = frame / fps, amp = life.amp ?? 1, ph = rng(hashStr(`bg|${seed}`)), d = life.bgDriftPx * amp;
  const x = -cam.x * life.bgFollow + d * Math.sin((2 * Math.PI * t) / life.bgPeriodSec + ph() * 6.2832), y = -cam.y * life.bgFollow + d * 0.6 * Math.sin((2 * Math.PI * t) / (life.bgPeriodSec * 1.37) + ph() * 6.2832);
  return { x, y, scale: life.bgScale + (cam.zoom - 1) * 0.5 };
}
export const backgroundTransform = (b) => `translate3d(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px, 0) scale(${b.scale.toFixed(5)})`;

/**
 * Motion gate. Samples the camera over the whole plan and reports problems: too fast (pan, zoom, roll), or "dead" windows where the corner of the frame
 * barely moves for too long. Returns { problems, stats }.
 */
export function motionReport(plan, life) {
  const fps = plan.fps ?? 30, keys = buildCameraKeys(plan, life), L = life.limits, W = plan.width ?? 1920, H = plan.height ?? 1080, seed = String(plan.seed ?? "");
  const total = plan.totalFrames, pts = [[-W / 2, -H / 2], [W / 2, H / 2]], problems = [];
  const pos = (f) => { const c = cameraAt(f, keys, life, fps, seed); const a = (c.roll * Math.PI) / 180; return pts.flatMap(([px, py]) => [c.x + c.zoom * (px * Math.cos(a) - py * Math.sin(a)), c.y + c.zoom * (px * Math.sin(a) + py * Math.cos(a))]); };
  let maxV = 0, maxZ = 0, maxR = 0, prev = pos(0), pc = cameraAt(0, keys, life, fps, seed); const win = Math.round(fps * L.deadWindowSec), speeds = [];
  for (let f = 1; f < total; f++) {
    const p = pos(f), c = cameraAt(f, keys, life, fps, seed); let v = 0; for (let i = 0; i < p.length; i++) v = Math.max(v, Math.abs(p[i] - prev[i])); v *= fps;
    maxV = Math.max(maxV, v); maxZ = Math.max(maxZ, Math.abs(c.zoom - pc.zoom) * fps); maxR = Math.max(maxR, Math.abs(c.roll - pc.roll) * fps); speeds.push(v); prev = p; pc = c;
  }
  if (maxV > L.maxPxPerSec) problems.push(`camera too fast: ${maxV.toFixed(0)} px/s (limit ${L.maxPxPerSec})`);
  if (maxZ > L.maxZoomPerSec) problems.push(`camera zoom too fast: ${maxZ.toFixed(3)}/s (limit ${L.maxZoomPerSec})`);
  if (maxR > L.maxRollDegPerSec) problems.push(`camera roll too fast: ${maxR.toFixed(2)} deg/s (limit ${L.maxRollDegPerSec})`);
  let worst = Infinity;
  for (let s = 0; s + win <= speeds.length; s += Math.round(fps / 2)) { let m = 0; for (let k = s; k < s + win; k++) m += speeds[k]; worst = Math.min(worst, m / win); }
  if (speeds.length >= win && worst < L.minPxPerSec) problems.push(`dead motion: average ${worst.toFixed(1)} px/s over ${L.deadWindowSec} s (minimum ${L.minPxPerSec})`);
  return { problems, stats: { maxPxPerSec: +maxV.toFixed(1), maxZoomPerSec: +maxZ.toFixed(4), maxRollDegPerSec: +maxR.toFixed(3), minWindowPxPerSec: speeds.length >= win ? +worst.toFixed(1) : null } };
}
