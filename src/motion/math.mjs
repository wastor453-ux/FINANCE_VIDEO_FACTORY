// Pure, frame-based motion math. No clocks, no randomness, no DOM: the same frame always gives the same value.
// Curves come from the style pack (motion.easing: name -> cubic-bezier [x1,y1,x2,y2]); nothing is typed here.

/** Solve a CSS cubic-bezier for y at progress x (Newton + bisection fallback). */
export function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-7) return Y(t); const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 40; i++) { const e = X(t); if (Math.abs(e - x) < 1e-7) break; if (e < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}

/** Linear progress 0..1 of `frame` between start and end (clamped). */
export const progress = (frame, start, end) => (end <= start ? (frame >= end ? 1 : 0) : Math.min(1, Math.max(0, (frame - start) / (end - start))));

/** Eased progress using a named curve from the pack. */
export function eased(pack, name, frame, start, end) {
  const c = pack.motion.easing[name]; if (!c) throw new Error(`style pack has no easing "${name}"`);
  return bezier(c)(progress(frame, start, end));
}

export const lerp = (a, b, t) => a + (b - a) * t;

/** Visibility envelope for an event: 0 before start, eased in, 1 while held, eased out over the exit window. */
export function envelope(pack, ev, frame, exitFrames) {
  const inP = eased(pack, ev.ease, frame, ev.startFrame, ev.endFrame);
  const outStart = (ev.exitFrame ?? ev.holdUntilFrame) - exitFrames;
  const outP = ev.exitFrame ? eased(pack, "exit", frame, outStart, ev.exitFrame) : 0;
  return inP * (1 - outP);
}

/** Count-up value; integers stay integers, decimals keep their precision. */
export function countValue(target, t, decimals = 0) { const v = target * t, k = 10 ** decimals; return Math.round(v * k) / k; }

/** Format with thousands separators and fixed decimals (en-US, tabular). */
export function formatNumber(v, decimals = 0) {
  const neg = v < 0, s = Math.abs(v).toFixed(decimals), [i, d] = s.split(".");
  return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? "." + d : "");
}

/** Decimals needed to show a value exactly (max 2). */
export const decimalsOf = (v) => { const s = String(v); const i = s.indexOf("."); return i < 0 ? 0 : Math.min(2, s.length - i - 1); };

/** Scale a reference-board length (px at the board width) to the video frame. */
export const scaleRef = (pack, px, frameWidth = 1920) => (px * frameWidth) / pack.geometry.referenceFrameWidth;
