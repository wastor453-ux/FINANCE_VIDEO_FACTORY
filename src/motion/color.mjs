// Colour roles chosen from the actual colours, never from a fixed slot: text on a fill is whichever of ink / surface reads better,
// and an emphasis pill uses the strongest series colour of the loaded pack. This is what lets any kit reorder or change its series safely.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function luminance(hex) { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255); }
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

/** Text colour (ink or surface of the pack) that reads best over ALL the given background colours (worst case wins). */
export function textOn(bgs, c) {
  const list = Array.isArray(bgs) ? bgs : [bgs], worst = (t) => Math.min(...list.map((b) => contrast(t, b)));
  return worst(c.ink) >= worst(c.surface) ? c.ink : c.surface;
}
/** Series entry with the highest contrast against the card surface (the pack's strongest colour). */
export function strongestSeries(c) { return [...c.series].sort((a, b) => contrast(b.fill, c.surface) - contrast(a.fill, c.surface))[0]; }
