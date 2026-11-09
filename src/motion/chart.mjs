// Pure chart geometry: nice axis ticks and value->pixel scales. No DOM, no randomness.

/** "Nice" tick values covering [min,max] with about `count` ticks (1/2/2.5/5 x 10^n steps). */
export function niceTicks(min, max, count = 4) {
  if (!(max > min)) { max = min + 1; }
  const raw = (max - min) / count, pow = 10 ** Math.floor(Math.log10(raw)), f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, ticks = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1], step };
}

/** Value domain for a line chart: starts at zero unless the data sits in a narrow band far from it. */
export function lineDomain(values) {
  const mn = Math.min(...values), mx = Math.max(...values);
  const lo = mn >= 0 && mn / (mx || 1) < 0.6 ? 0 : mn - (mx - mn) * 0.15;
  return niceTicks(lo, mx + (mx - lo) * 0.04, 4);
}

/** Pixel positions of points inside a plot box. */
export function plotPoints(values, domain, box) {
  const n = values.length;
  return values.map((v, i) => [box.x + (n === 1 ? 0.5 : i / (n - 1)) * box.w, box.y + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * box.h]);
}

/** Compact axis label: 12,000 -> 12K, 1,500,000 -> 1.5M (no unit symbol; the unit is shown once). */
export function compact(v) {
  const a = Math.abs(v), t = (x) => String(Math.round(x * 10) / 10);
  return a >= 1e9 ? t(v / 1e9) + "B" : a >= 1e6 ? t(v / 1e6) + "M" : a >= 1e3 ? t(v / 1e3) + "K" : t(v);
}

/** Bar domain always starts at zero. */
export function barDomain(values) { return niceTicks(0, Math.max(...values) * 1.06, 4); }

/** Slots for n bars inside a box: bar width is a share of the slot; returns x, width per bar. */
export function barSlots(n, box, share = 0.56) {
  const slot = box.w / n, w = slot * share;
  return Array.from({ length: n }, (_, i) => ({ x: box.x + i * slot + (slot - w) / 2, w, cx: box.x + i * slot + slot / 2 }));
}

/** Path of a bar with rounded top corners only; radius is capped so short bars stay valid. */
export function roundedTopRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
}
