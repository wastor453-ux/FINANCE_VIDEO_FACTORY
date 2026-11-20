// Style packs: the channel look as DATA (config/styles/<id>/style.json + assets), read by every renderer and planner.
// This file contains no colour, font or timing values. A pack is built from reference boards by tools/style_pack.py and
// must pass validateStylePack before anything may use it.
import fs from "node:fs";
import path from "node:path";
import { contrast, luminance } from "./theme.mjs";

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function loadStylePack(dir) {
  const pack = JSON.parse(fs.readFileSync(path.join(dir, "style.json"), "utf8"));
  return { pack, dir, problems: validateStylePack(pack, dir) };
}

function pngSize(file) { const b = fs.readFileSync(file); if (b.length < 24 || b.toString("ascii", 1, 4) !== "PNG") return null; return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

/** Returns a list of problems; empty means the pack may be used. */
export function validateStylePack(pack, dir) {
  const f = [], c = pack.color || {}, g = c.gates || {};
  if (pack.schema !== "ffx-style-pack/1") f.push("unknown schema");
  for (const k of ["ink", "inkSecondary", "canvas", "surface", "border", "primary", "cyan", "teal", "lavender"]) if (!HEX.test(c[k] || "")) f.push(`color.${k} is not a #RRGGBB value`);
  if (f.length) return f;
  const need = (name, a, b, min) => { const r = contrast(a, b); if (r < min) f.push(`${name}: contrast ${r.toFixed(2)} < ${min}`); };
  need("ink on surface", c.ink, c.surface, g.inkMinContrast); need("ink on canvas", c.ink, c.canvas, g.inkMinContrast);
  need("inkSecondary on surface", c.inkSecondary, c.surface, g.textMinContrast); need("inkSecondary on canvas", c.inkSecondary, c.canvas, g.textMinContrast);
  if (!Array.isArray(c.series) || c.series.length < 5) f.push("a pack needs at least 5 chart series colours");
  for (const s of c.series || []) {
    if (!HEX.test(s.fill) || !HEX.test(s.text) || !HEX.test(s.stroke)) f.push(`series ${s.slot}: bad colour`);
    else { need(`series ${s.slot} fill vs surface`, s.fill, c.surface, g.fillMinContrast); need(`series ${s.slot} stroke vs surface`, s.stroke, c.surface, g.strokeMinContrast); need(`series ${s.slot} text vs surface`, s.text, c.surface, g.textMinContrast); }
  }
  const S = c.series || [];
  for (let i = 0; i < S.length - 1; i++) if (S[i].fill === S[i + 1].fill) f.push(`series ${S[i].slot}/${S[i + 1].slot}: identical fills`);
  if (new Set(S.map((s) => s.fill)).size !== S.length) f.push("series fills are not all different");
  for (const k of ["gain", "loss"]) { const x = c.flow?.[k]; if (!x) f.push(`flow.${k} missing`); else { need(`${k} fill vs surface`, x.fill, c.surface, g.fillMinContrast); need(`${k} stroke vs surface`, x.stroke, c.surface, g.strokeMinContrast); need(`${k} text vs surface`, x.text, c.surface, g.textMinContrast); } }
  if (c.flow?.gain && c.flow?.loss && Math.abs(luminance(c.flow.gain.fill) - luminance(c.flow.loss.fill)) < 0.03) f.push("gain and loss are too close in lightness (colour-blind risk)");
  // provenance: every non-derived colour must come from a board sample
  const used = new Set(Object.values(pack.provenance?.values || {}).map((v) => String(v.used).toUpperCase()));
  const must = [c.ink, c.inkSecondary, c.canvas, c.surface, c.border, c.primary, c.cyan, c.teal, c.lavender, ...S.map((s) => s.fill), c.flow?.gain?.fill, c.flow?.loss?.fill, c.flow?.lossAlt?.fill].filter(Boolean);
  for (const h of must) if (!used.has(h.toUpperCase()) && h.toUpperCase() !== String(c.inkSecondary).toUpperCase()) f.push(`colour ${h} has no board provenance (every colour must come from a sampled board value)`);
  if (!Object.keys(pack.provenance?.boards || {}).length) f.push("provenance lists no source boards");
  // motion: no overshoot, ranges sane
  for (const [n, e] of Object.entries(pack.motion?.easing || {})) if (e.length !== 4 || e[1] < 0 || e[1] > 1 || e[3] < 0 || e[3] > 1) f.push(`easing ${n}: invalid or overshoots`);
  for (const [n, r] of Object.entries(pack.motion?.durationSec || {})) if (!(r[0] > 0 && r[1] >= r[0] && r[1] <= 1.5)) f.push(`motion ${n}: bad duration range ${JSON.stringify(r)} (element moves must stay within 1.5 s)`);
  if (!(pack.motion?.leadFrames >= 3 && pack.motion.leadFrames <= 6)) f.push("leadFrames outside 3-6");
  const sn = pack.scene, L = sn?.limits;
  if (!sn) f.push("pack has no scene section (perspective, layers, camera)");
  else {
    if (Math.abs(sn.settleTiltDeg.x) > L.maxTiltDeg || Math.abs(sn.settleTiltDeg.y) > L.maxTiltDeg) f.push("scene settle tilt exceeds limit");
    if (Math.abs(sn.entryTiltDegY) > L.maxEntryTiltDeg) f.push("scene entry tilt exceeds limit");
    if (!(sn.cameraPushScale >= 0 && sn.cameraPushScale <= L.maxPushScale)) f.push("scene camera push exceeds limit");
    if (!(sn.staggerSec >= 0 && sn.staggerSec <= L.maxStaggerSec)) f.push("scene stagger out of range");
    if (!(sn.chartTiltScale >= 0 && sn.chartTiltScale <= L.maxChartTiltScale)) f.push("scene chart tilt scale out of range");
    const lf = sn.life, Lm = lf?.limits;
    if (!lf || !Lm) f.push("scene.life (continuous camera) missing");
    else {
      if (!(lf.amp > 0 && lf.amp <= Lm.maxAmp)) f.push("scene.life.amp out of range");
      if (!(lf.zoomMax >= 0 && lf.zoomMax <= L.maxPushScale)) f.push("scene.life.zoomMax exceeds the push limit");
      if (!(lf.panPx <= 90 && lf.rollDeg <= 1.2 && lf.handheldPx <= 8 && lf.handheldRollDeg <= 0.3)) f.push("scene.life moves exceed safe size (pan 90 px, roll 1.2 deg, handheld 8 px / 0.3 deg)");
      if (!(lf.floatPx >= 0 && lf.floatPx * (lf.amp ?? 1) <= Lm.maxFloatPx)) f.push("scene.life.floatPx exceeds the float limit");
      if (!(lf.floatPeriodSec >= 3 && lf.sheen && lf.sheen.alpha <= 0.5 && lf.sheen.durSec >= 1)) f.push("scene.life float period (>= 3 s) or sheen (alpha <= 0.5, sweep >= 1 s) out of range");
      if (!(lf.bgScale >= 1 + (lf.bgDriftPx * (lf.amp ?? 1) + lf.panPx * lf.bgFollow * (lf.amp ?? 1)) / 960)) f.push("scene.life.bgScale too small: background edges would show");
    }
    if (!["on", "off"].includes(sn.sourceTag)) f.push("scene.sourceTag must be \"on\" or \"off\"");
    if (!(sn.perspectivePx >= 1000)) f.push("scene perspective too strong (distortion)");
    if (!(sn.layerZ.back < 0 && sn.layerZ.main > sn.layerZ.back && sn.layerZ.near > sn.layerZ.main)) f.push("scene layers must be ordered back < main < near");
    if (!(sn.glass.radiusAtReference > 0 && sn.glass.shadow.length >= 2)) f.push("scene glass spec incomplete");
  }
  const sc = pack.type?.videoScalePx || {};
  if (!(sc.caption >= 28 && sc.body >= 36 && sc.heroNumber >= 56)) f.push("type scale below phone-legibility minimums");
  // backgrounds: files exist, 16:9, default is listed
  const items = pack.backgrounds?.items || [];
  if (!items.length) f.push("pack has no backgrounds");
  if (!items.some((b) => b.id === pack.backgrounds?.default)) f.push("default background is not in the list");
  if (dir) for (const b of items) {
    const p = path.join(dir, b.file);
    if (!fs.existsSync(p)) { f.push(`background ${b.id}: file missing (${b.file})`); continue; }
    const sz = pngSize(p); if (!sz || sz[0] !== 1920 || sz[1] !== 1080) f.push(`background ${b.id}: must be a 1920x1080 PNG`);
  }
  return f;
}

/** Concrete pixel values for a frame width (geometry is stored as ratios of the board it was measured on). */
export function resolveGeometry(pack, frameWidth = 1920) {
  const g = pack.geometry, k = frameWidth / g.referenceFrameWidth;
  return { cardRadiusPx: Math.round(g.cardRadiusAtReference * k), cardBorderPx: Math.max(1, Math.round(g.cardBorderAtReference * k)), shadow: { blurPx: Math.round(g.cardShadow.blurAtReference * k), yPx: Math.round(g.cardShadow.yAtReference * k), opacity: g.cardShadow.opacity }, grid: g.grid };
}
