// Theme generator: a small seed tuple -> a complete, validated design-token set.
// Reusable for every video: components read tokens, never constants. Pure functions, no I/O.
// Colour is built in OKLCH (even lightness steps), converted to sRGB hex, gamut-clamped,
// then CHECKED (contrast, hue spacing, colour-blind separation, text size, easing). A theme that fails the gate is never used.

// ---------- colour maths ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const gamma = (v) => { v = clamp01(v); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
export function oklchToHex(L, C, h) {
  let c = C; // reduce chroma until the colour fits sRGB (keeps lightness and hue)
  for (let i = 0; i < 40 && !inGamut(oklchToLinear(L, c, h)); i++) c *= 0.93;
  const rgb = oklchToLinear(L, c, h).map(gamma);
  return "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function luminance(hex) { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255); }
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const hueDist = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
const wrap = (h) => ((h % 360) + 360) % 360;

// ---------- seeds ----------
function fnv1a(str) { let h = 0x811c9dc5; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const OPTIONS = {
  accentOffset: [40, 55, 70, 85, 100, 120],
  chromaCap: { low: 0.09, mid: 0.13, high: 0.17 },
  neutralTint: { cool: [250, 0.012], warm: [75, 0.010], none: [0, 0.0] },
  gainLoss: { "teal-amber": { gain: 185, loss: 65 }, "blue-rose": { gain: 255, loss: 10 }, classic: { gain: 150, loss: 25 } },
  fontPair: { a: { display: "Plus Jakarta Sans", body: "Inter" }, b: { display: "Manrope", body: "Inter" }, c: { display: "Fraunces", body: "Inter" } },
  palette: ["analogous", "wide"],
  background: ["fog-gradient", "mesh-static", "orbs-drift", "aurora"],
};
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const pickKey = (rnd, obj) => pickKeyFrom(rnd, Object.keys(obj));
const pickKeyFrom = (rnd, keys) => keys[Math.floor(rnd() * keys.length)];

/** Deterministic seed tuple from any string, e.g. `${topic}|${episodeId}`. Same string, same theme, forever. */
export function seedFromString(str) {
  const rnd = mulberry32(fnv1a(str));
  return {
    primaryHue: Math.floor(rnd() * 360),
    accentOffset: pick(rnd, OPTIONS.accentOffset),
    chromaCap: pickKey(rnd, OPTIONS.chromaCap),
    neutralTint: pickKey(rnd, OPTIONS.neutralTint),
    gainLoss: pickKey(rnd, OPTIONS.gainLoss),
    fontPair: pickKey(rnd, OPTIONS.fontPair),
    background: pick(rnd, OPTIONS.background),
    glassMode: "prebaked",
    palette: rnd() < 0.6 ? "analogous" : "wide",
  };
}
/** A neutral starting seed for tests and examples. The channel look comes from a style pack (lib/style.mjs), never from this generator. */
export const BASE_SEED = { primaryHue: 262, accentOffset: 55, chromaCap: "mid", neutralTint: "cool", gainLoss: "teal-amber", fontPair: "a", background: "fog-gradient", glassMode: "prebaked", palette: "analogous" };

// ---------- generator ----------
const L12 = [0.99, 0.975, 0.95, 0.92, 0.89, 0.85, 0.80, 0.72, 0.62, 0.56, 0.45, 0.28];
const C12 = [0.05, 0.1, 0.22, 0.38, 0.52, 0.68, 0.82, 0.95, 1, 1, 0.92, 0.65];
const ramp = (hue, cmax) => L12.map((L, i) => oklchToHex(L, cmax * C12[i], hue));
function toContrast(L, C, hue, against, min) { // darken until the colour reaches the contrast target
  let l = L; for (let i = 0; i < 60; i++) { const hex = oklchToHex(l, C, hue); if (contrast(hex, against) >= min) return hex; l -= 0.012; }
  return oklchToHex(l, C, hue);
}

export function generateTheme(seed) {
  const s = { ...BASE_SEED, ...seed };
  const cmax = OPTIONS.chromaCap[s.chromaCap], [nh, nc] = OPTIONS.neutralTint[s.neutralTint], gl = OPTIONS.gainLoss[s.gainLoss], fonts = OPTIONS.fontPair[s.fontPair];
  const neutral = ramp(nh, nc);
  const primary = ramp(s.primaryHue, cmax);
  const surface = "#ffffff";
  // analogous: slots stay near the primary hue (calm, premium); slot 8 is a quiet slate. wide: hues spread round the wheel.
  const ANALOGOUS = [0, -45, 40, -85, 80, -120, 115, 180];
  const series = Array.from({ length: 8 }, (_, i) => {
    const wide = s.palette === "wide";
    const hue = wrap(s.primaryHue + (wide ? i * s.accentOffset : ANALOGOUS[i]));
    const slate = !wide && i === 7;
    const L = i % 2 === 0 ? 0.60 : 0.66; // adjacent slots differ in hue AND lightness
    return { slot: i + 1, hue: Math.round(hue), fill: toContrast(L, slate ? cmax * 0.25 : cmax, hue, surface, 3), text: toContrast(0.45, cmax * 0.9, hue, surface, 4.5), soft: oklchToHex(0.95, cmax * 0.25, hue) };
  });
  // gain is the lighter mark (3:1), loss the darker mark (4.5:1): they differ in lightness as well as hue, so they stay separable for colour-blind viewers
  const mk = (hue, minFill) => ({ hue, fill: toContrast(0.62, cmax * 1.05, hue, surface, minFill), text: toContrast(0.45, cmax * 0.9, hue, surface, 4.5), soft: oklchToHex(0.95, cmax * 0.25, hue) });
  const theme = {
    schema: "ffx-theme/1",
    seed: s,
    id: (fnv1a(JSON.stringify(s)) >>> 0).toString(16).padStart(8, "0"),
    color: {
      canvas: neutral[0], canvasTint: neutral[1], surface, border: neutral[5], ink: neutral[11], inkMuted: toContrast(0.5, nc, nh, surface, 4.5),
      primary: primary[8], primaryText: toContrast(0.45, cmax * 0.9, s.primaryHue, surface, 4.5), primarySoft: primary[2],
      neutralRamp: neutral, primaryRamp: primary, series,
      gain: mk(gl.gain, 3), loss: mk(gl.loss, 4.5),
      gainLossCue: "required: up/down triangle glyph and +/- sign next to every gain or loss value (colour is never the only signal)",
    },
    type: { display: fonts.display, body: fonts.body, numerals: fonts.display, numeralFeatures: "tnum lnum", scalePx: { caption: 28, label: 32, body: 40, subtitle: 52, title: 72, display: 104, heroNumber: 160, megaNumber: 240 }, weights: [400, 500, 600, 700], lineHeight: { display: 1.1, body: 1.3 } },
    layout: { frame: [1920, 1080], marginPx: 64, columns: 12, columnPx: 120, gutterPx: 32, spacingPx: [4, 8, 16, 24, 32, 48, 64, 96, 128], cardPaddingPx: 40, cardRadiusPx: 32, chipRadiusPx: 999 },
    shadow: { ambient: "0 24px 64px rgba(16,32,68,0.08)", contact: "0 2px 6px rgba(16,32,68,0.06)" },
    glass: { mode: s.glassMode, fill: "rgba(255,255,255,0.72)", border: "rgba(255,255,255,0.7)", hairline: "rgba(16,32,68,0.06)", note: "prebaked = backdrop crop blurred once offline; live blur only for 1-2 hero cards per scene" },
    motion: {
      durMs: { micro: 200, short: 350, base: 600, long: 900, hero: 1400, draw: 2000 },
      ease: { enter: [0, 0, 0.38, 0.9], exit: [0.2, 0, 1, 0.9], move: [0.2, 0, 0, 1], settle: [0.05, 0.7, 0.1, 1], soft: [0.4, 0.14, 0.3, 1] },
      staggerMs: 80, staggerCapMs: 800, leadFrames: 4, fps: 30,
    },
    background: { recipe: s.background, hue: s.primaryHue, driftCycleSec: 24, grain: "static-png-3pct" },
  };
  return theme;
}

// ---------- gate ----------
/** Returns a list of failures; empty list = the theme may be used. */
export function validateTheme(t) {
  const f = [], c = t.color, bg = c.surface;
  const need = (name, a, b, min) => { const r = contrast(a, b); if (r < min) f.push(`${name}: contrast ${r.toFixed(2)} < ${min}`); };
  need("ink on surface", c.ink, bg, 7); need("ink on canvas", c.ink, c.canvas, 7); need("inkMuted on surface", c.inkMuted, bg, 4.5); need("inkMuted on canvas", c.inkMuted, c.canvas, 4.5); need("primaryText on surface", c.primaryText, bg, 4.5);
  const fmin = 3;
  c.series.forEach((x) => { need(`series ${x.slot} fill vs surface`, x.fill, bg, fmin); need(`series ${x.slot} text vs surface`, x.text, bg, 4.5); });
  for (let i = 0; i < c.series.length - 1; i++) {
    if (hueDist(c.series[i].hue, c.series[i + 1].hue) < 35) f.push(`series ${i + 1}/${i + 2}: hues too close`);
        if (c.series[i].fill === c.series[i + 1].fill) f.push(`series ${i + 1}/${i + 2}: identical fill`);
  }
  for (const k of ["gain", "loss"]) { need(`${k} fill vs surface`, c[k].fill, bg, fmin); need(`${k} text vs surface`, c[k].text, bg, 4.5); }
  if (hueDist(t.seed ? OPTIONS.gainLoss[t.seed.gainLoss].gain : 0, t.seed ? OPTIONS.gainLoss[t.seed.gainLoss].loss : 0) < 60) f.push("gain/loss hues too close");
  if (Math.abs(luminance(c.gain.fill) - luminance(c.loss.fill)) < 0.02) f.push("gain/loss too similar in lightness (colour-blind risk)");
  const sc = t.type.scalePx;
  if (sc.caption < 28 || sc.label < 28 || sc.body < 36 || sc.heroNumber < 56) f.push("type scale below phone-legibility minimums");
  if (!/tnum/.test(t.type.numeralFeatures)) f.push("numerals must be tabular");
  for (const [n, e] of Object.entries(t.motion.ease)) if (e[1] > 1 || e[3] > 1 || e[1] < 0 || e[3] < 0) f.push(`easing ${n}: overshoot (y outside 0..1)`);
  if (t.motion.leadFrames < 3 || t.motion.leadFrames > 6) f.push("lead frames outside 3-6");
  if (t.layout.marginPx < 64) f.push("safe margin under 64 px");
  return f;
}

/** Variety rule: a new theme must be at least minHue degrees from each of the last n themes, and must not repeat (background, font) pair back to back. */
export function checkLedger(seed, recent = [], { n = 8, minHue = 30 } = {}) {
  const f = [], last = recent.slice(-n);
  for (const r of last) if (hueDist(seed.primaryHue, r.primaryHue) < minHue) f.push(`primary hue ${seed.primaryHue} is within ${minHue}deg of a recent episode (${r.primaryHue})`);
  const prev = last[last.length - 1];
  if (prev && prev.background === seed.background && prev.fontPair === seed.fontPair) f.push("same background and font pair as the previous episode");
  return f;
}

/** Pick a seed from a string that satisfies the ledger (deterministic: tries `${str}`, `${str}#1`, ...).
 * If the hue rule cannot be met (many recent themes), the minimum hue distance is halved, then dropped, and the result says so. */
export function seedWithLedger(str, recent = [], opts = {}) {
  const base = opts.minHue ?? 30;
  for (const minHue of [base, Math.floor(base / 2), 0]) {
    for (let i = 0; i < 300; i++) { const seed = seedFromString(i === 0 ? str : `${str}#${i}`); if (!checkLedger(seed, recent, { ...opts, minHue }).length) return { seed, minHueUsed: minHue, relaxed: minHue !== base }; }
  }
  throw new Error("no seed satisfies the variety ledger");
}
