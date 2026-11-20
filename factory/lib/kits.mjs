// Style kits: a kit is a small, validated OVERLAY on a base style pack (same board-sourced colours, fonts and rules), so the channel can look
// different per video and stay original. A resolved kit IS a style pack: renderers and planners need no kit-specific code.
// `chooseKit` is the art director's step one: it picks the kit from the video's brief (topic, mood) with owner locks/bans, and logs why.
import fs from "node:fs";
import path from "node:path";
import { loadStylePack, validateStylePack } from "./style.mjs";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(a, b) { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v; return o; }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function loadKits(root) {
  const dir = path.join(root, "config/kits"), kits = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "index.json").sort()) kits.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  return { kits, index };
}

/** Kit overlay on a base pack. Colours may only be reordered or picked from the base pack (provenance stays board-sourced); everything else is a merge. */
export function resolveKit(base, kit) {
  if (kit.schema !== "ffx-style-kit/1") throw new Error(`kit ${kit.id}: unknown schema`);
  let pack = merge(base, kit.overrides ?? {});
  if (kit.seriesOrder) {
    const byId = Object.fromEntries(base.color.series.map((s) => [s.id, s]));
    const unknown = kit.seriesOrder.filter((i) => !byId[i]); if (unknown.length) throw new Error(`kit ${kit.id}: unknown series ${unknown.join(", ")}`);
    const rest = base.color.series.filter((s) => !kit.seriesOrder.includes(s.id)).map((s) => s.id);
    pack.color = { ...pack.color, series: [...kit.seriesOrder, ...rest].map((id, i) => ({ ...byId[id], slot: i + 1 })) };
  }
  if (kit.background?.items?.length) pack.backgrounds = { ...pack.backgrounds, items: kit.background.items }; // code recipes rendered to PNG (tools/render_bg.py)
  if (kit.background?.default) pack.backgrounds = { ...pack.backgrounds, default: kit.background.default };
  pack.id = kit.id; pack.name = kit.label ?? kit.id; pack.kit = { base: base.id, mood: kit.mood ?? [], topics: kit.topics ?? [] };
  return pack;
}

/** Resolve a pack by id: a base pack directory under config/styles, or a kit under config/kits. Returns { pack, dir (assets), problems }. */
export function loadPackById(root, id) {
  const styleDir = path.join(root, "config/styles", id);
  if (fs.existsSync(path.join(styleDir, "style.json"))) return loadStylePack(styleDir);
  const { kits } = loadKits(root), kit = kits.find((k) => k.id === id);
  if (!kit) throw new Error(`no style pack or kit named "${id}"`);
  const baseDir = path.join(root, "config/styles", kit.base), { pack: base, problems: bp } = loadStylePack(baseDir);
  if (bp.length) return { pack: base, dir: baseDir, problems: bp };
  const pack = resolveKit(base, kit);
  return { pack, dir: baseDir, problems: validateStylePack(pack, baseDir) };
}

/** Kit-level checks on top of the pack gates: lead colour, background and mood data must exist and make sense. */
export function validateKit(kit, base) {
  const e = [];
  for (const k of ["id", "label", "base"]) if (!kit[k]) e.push(`kit ${kit.id ?? "?"}: ${k} missing`);
  if (!Array.isArray(kit.mood) || !kit.mood.length) e.push(`kit ${kit.id}: mood tags missing`);
  if (!Array.isArray(kit.topics) || !kit.topics.length) e.push(`kit ${kit.id}: topic tags missing`);
  if (kit.background?.default && ![...(kit.background.items ?? base.backgrounds.items)].some((b) => b.id === kit.background.default)) e.push(`kit ${kit.id}: background ${kit.background.default} is not in the base pack or kit recipes`);
  return e;
}

/**
 * Art director step one. brief = { topic: "debt", mood: ["serious"] }; opts = { seed, locked, banned, recent: [kit ids of the last videos] }.
 * Score: topic match 3, mood overlap 2 each, same kit as the last video -2, and ties go to the seed (or index order). No match at all: the index default.
 */
export function chooseKit({ kits, index }, brief = {}, { seed = "", locked, banned = [], recent = [] } = {}) {
  const pool = kits.filter((k) => !banned.includes(k.id));
  if (locked) { const k = kits.find((x) => x.id === locked); if (!k) throw new Error(`locked kit "${locked}" does not exist`); return { kit: k.id, reason: "set by the owner or design file", candidates: [k.id] }; }
  if (!pool.length) throw new Error("every kit is banned");
  const topic = String(brief.topic ?? "").toLowerCase(), moods = (brief.mood ?? []).map((m) => String(m).toLowerCase());
  const scored = pool.map((k, i) => {
    const t = (k.topics ?? []).some((x) => topic && (topic.includes(x) || x.includes(topic))) ? 3 : 0, m = 2 * (k.mood ?? []).filter((x) => moods.includes(x)).length, r = recent[0] === k.id ? -2 : 0;
    return { k, score: t + m + r, parts: { topic: t, mood: m, recent: r }, tie: seed ? hash(`${seed}|${k.id}`) : i };
  }).sort((a, b) => b.score - a.score || a.tie - b.tie);
  const top = scored[0], matched = scored.some((s) => s.parts.topic || s.parts.mood);
  if (!matched) { const d = pool.find((k) => k.id === index.default) ?? pool[0]; return { kit: d.id, reason: "no topic or mood match, using the default kit", candidates: scored.map((s) => `${s.k.id}:${s.score}`) }; }
  return { kit: top.k.id, reason: `score ${top.score} (${Object.entries(top.parts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")})`, candidates: scored.map((s) => `${s.k.id}:${s.score}`) };
}
