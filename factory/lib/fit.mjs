// Topic-fit score: how much of the video can be shown as real motion graphics (charts and diagrams)
// versus supporting cards and text. Derived from config/visual_modes.json families (no separate taxonomy).
// Input items: [{mode, seconds}]. Pure function.

// Story types a chart or diagram mode can tell. A topic needs variety, not one repeated idea.
export const STORY_TYPE = {
  line_chart: "change_over_time", compound_growth: "change_over_time", debt_payoff: "change_over_time", inflation_power: "change_over_time",
  bar_chart: "comparison", scenario_comparison: "comparison",
  donut_allocation: "part_of_whole", stacked_breakdown: "part_of_whole",
  cashflow_waterfall: "flow", process_flow: "flow", causal_diagram: "flow",
  timeline: "timeline",
};

const NUM_WORDS = "hundred thousand million billion trillion percent dollar dollars cents".split(" ");
/** True when a beat carries numbers a chart could draw (digits, number words, or an explicit beat.data). */
export const beatHasData = (b) => !!b.data || /\d/.test(b.narration || "") || (b.narration || "").toLowerCase().split(/[^a-z]+/).some((w) => NUM_WORDS.includes(w));

export function fitScore(items, modes, cfg) {
  const family = new Map(modes.map((m) => [m.id, m.family]));
  let total = 0, weighted = 0;
  const types = {}; const unknown = [];
  for (const it of items) {
    const sec = Number.isFinite(it.seconds) && it.seconds > 0 ? it.seconds : 1;
    total += sec;
    const fam = family.get(it.mode);
    if (!fam) { unknown.push(it.mode); continue; }
    // A chart needs numbers to draw. A chart mode on a beat with no data is decoration, so it counts as support.
    const substantive = fam === "diagram" || (fam === "chart" && it.hasData !== false);
    weighted += sec * (substantive ? 1 : cfg.supportWeight);
    if (substantive && STORY_TYPE[it.mode]) types[STORY_TYPE[it.mode]] = (types[STORY_TYPE[it.mode]] || 0) + sec;
  }
  const score = total ? weighted / total : 0;
  const storyTypes = Object.keys(types).filter((t) => types[t] / total >= 0.05); // a type counts when it fills 5% or more of runtime
  const reasons = [];
  if (score < cfg.minScore) reasons.push(`fit score ${score.toFixed(2)} is below ${cfg.minScore}: too much of the video would be cards and text, not charts or diagrams`);
  if (storyTypes.length < cfg.minStoryTypes) reasons.push(`only ${storyTypes.length} story type(s) (${storyTypes.join(", ") || "none"}); need ${cfg.minStoryTypes}`);
  if (unknown.length) reasons.push(`unknown visual mode(s): ${[...new Set(unknown)].join(", ")}`);
  return { score: +score.toFixed(3), storyTypes, totalSeconds: +total.toFixed(1), pass: reasons.length === 0, reasons };
}

/** Items from a v2 script (beats) or an analysis (motionFit.beats). */
import { plainScript } from "./tags.mjs";
export function itemsFrom(doc0, wpm) {
  const doc = doc0.scenes ? plainScript(doc0) : doc0;
  if (Array.isArray(doc.scenes) && doc.scenes.some((s) => s.beats?.length)) {
    return doc.scenes.flatMap((s) => (s.beats || []).map((b) => ({ mode: b.visualIntent, hasData: beatHasData(b), seconds: (b.narration.split(/\s+/).filter(Boolean).length / wpm) * 60 })));
  }
  if (doc.motionFit?.beats) return doc.motionFit.beats.map((b) => ({ mode: b.mode, seconds: b.seconds, hasData: b.hasData }));
  throw new Error("expected a v2 script with beats or an analysis with motionFit.beats");
}
