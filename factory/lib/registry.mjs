// Variant registry + art director (variant selection). Pure functions, deterministic: same inputs and seed give the same choice,
// and every choice returns the reason. Looks are never chosen inside components; they are entries in config/registry/variants.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY_PATH = path.join(HERE, "../config/registry/variants.json");
const STATUSES = ["verified", "draft"];

export function loadRegistry(file = DEFAULT_REGISTRY_PATH) { return JSON.parse(fs.readFileSync(file, "utf8")); }

/** Structural check of the registry: returns error strings. `modeIds` = modes in config/visual_modes.json, `renderable` = components.json modes. */
export function validateRegistry(reg, { modeIds, renderable } = {}) {
  const errs = [], seen = new Set();
  if (!Array.isArray(reg.variants) || !reg.variants.length) return ["registry has no variants"];
  for (const v of reg.variants) {
    const k = `${v.mode}/${v.id}`;
    if (!v.id || !v.mode) { errs.push(`entry without id or mode: ${JSON.stringify(v)}`); continue; }
    if (seen.has(k)) errs.push(`duplicate variant ${k}`); seen.add(k);
    if (!STATUSES.includes(v.status)) errs.push(`${k}: status must be one of ${STATUSES.join(", ")}`);
    if (!v.label) errs.push(`${k}: label missing`);
    if (typeof v.fits !== "object" || v.fits === null) errs.push(`${k}: fits missing`);
    if (modeIds && !modeIds.has(v.mode)) errs.push(`${k}: unknown visual mode`);
    if (renderable && v.status === "verified" && !renderable[v.mode]) errs.push(`${k}: verified, but mode ${v.mode} has no renderer in components.json`);
  }
  return errs;
}

export const variantsOf = (reg, mode, { includeDraft = false } = {}) => reg.variants.filter((v) => v.mode === mode && (includeDraft || v.status === "verified"));
const isPct = (dp) => !!dp && dp.unit === "%" && Number(dp.value) >= 0 && Number(dp.value) <= 100;

/** Hard fit of one variant to the first data point; returns an error string or null. */
export function fitError(v, dp, nItems) {
  if (v.fits?.needsPercent && !isPct(dp)) return `variant ${v.id} shows a proportion, so the figure must be a percentage between 0 and 100`;
  if (v.fits?.needsSeries && !dp?.series) return `variant ${v.id} needs a series on the data point`;
  const n = dp?.series?.length; if (n !== undefined && v.fits?.maxSeries && n > v.fits.maxSeries) return `variant ${v.id} takes at most ${v.fits.maxSeries} series points`;
  if (nItems !== undefined && v.fits?.minItems && nItems < v.fits.minItems) return `variant ${v.id} needs at least ${v.fits.minItems} content items, has ${nItems}`;
  if (nItems !== undefined && v.fits?.maxItems && nItems > v.fits.maxItems) return `variant ${v.id} takes at most ${v.fits.maxItems} content items, has ${nItems}`;
  return null;
}
const autoOk = (v, dp) => !v.auto || ((v.auto.series === undefined || v.auto.series === !!dp?.series) && (v.auto.percent === undefined || v.auto.percent === isPct(dp)));
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * Art director, step two: pick the variant for one beat. Returns { variant|null, reason, candidates }.
 * history = { count: {mode/id: uses}, last: {mode: id}, modeTotal: {mode: n} } (mutated by the caller through `record`).
 * brief  = { mood: [tags], shareBudget: 0..1 } from the style brief. seed makes ties differ per run and stay repeatable.
 */
export function chooseVariant(reg, { mode, dp, nItems, beatId, history, brief = {}, seed = "", locked, banned = [] }) {
  const all = variantsOf(reg, mode);
  if (!all.length) return { variant: null, reason: "mode has no verified variants", candidates: [] };
  if (locked) { const v = all.find((x) => x.id === locked); if (!v) throw new Error(`${beatId}: locked variant "${locked}" is not a verified variant of ${mode}`); const e = fitError(v, dp, nItems); if (e) throw new Error(`${beatId}: ${e}`); return { variant: v.id, reason: "set by the design file", candidates: [v.id] }; }
  const ok = all.filter((v) => !banned.includes(`${mode}/${v.id}`) && !fitError(v, dp, nItems) && autoOk(v, dp));
  if (!ok.length) throw new Error(`${beatId}: no verified ${mode} variant fits this data`);
  if (all.length === 1) return { variant: null, reason: "single variant (default look)", candidates: [ok[0].id] };
  const last = history.last[mode], total = history.modeTotal[mode] ?? 0;
  const scored = ok.map((v, i) => {
    const uses = history.count[`${mode}/${v.id}`] ?? 0, parts = {};
    parts.mood = 2 * (v.mood ?? []).filter((m) => (brief.mood ?? []).includes(m)).length;
    parts.variety = -3 * uses;
    parts.repeat = ok.length > 1 && v.id === last ? -100 : 0;
    parts.share = brief.shareBudget && total >= 3 && (uses + 1) / (total + 1) > brief.shareBudget ? -20 : 0;
    const score = parts.mood + parts.variety + parts.repeat + parts.share;
    return { v, score, parts, tie: seed ? hash(`${seed}|${beatId}|${v.id}`) : i };
  }).sort((a, b) => b.score - a.score || a.tie - b.tie);
  const w = scored[0];
  return { variant: w.v.id, reason: `score ${w.score} (${Object.entries(w.parts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "tie, registry order"})`, candidates: scored.map((s) => `${s.v.id}:${s.score}`) };
}
export const newHistory = () => ({ count: {}, last: {}, modeTotal: {} });
export function record(history, mode, id) { if (!id) return; history.count[`${mode}/${id}`] = (history.count[`${mode}/${id}`] ?? 0) + 1; history.last[mode] = id; history.modeTotal[mode] = (history.modeTotal[mode] ?? 0) + 1; }

/** Coverage: verified variants per mode against the registry's minimum. */
export function coverage(reg, modeIds) {
  const min = reg.minVerifiedPerMode ?? 3;
  return [...modeIds].map((m) => { const n = variantsOf(reg, m).length; return { mode: m, verified: n, draft: variantsOf(reg, m, { includeDraft: true }).length - n, ready: n >= min }; });
}
