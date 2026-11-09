// Script structure rules (v2): beats, hook type, retention map, claim evidence.
// Written from the research in the script dossier (hook timing, one idea per beat, interrupt spacing,
// mid-point re-hook, split long scenes). Pure functions; returns findings in the same shape as script-quality.
// All thresholds come from config/pipeline.json -> script (never hard-coded per topic).

import { beatHasData } from "./fit.mjs";
export const HOOK_TYPES = ["curiosity_gap", "stakes", "bold_claim", "empathy_mirror", "specific_promise", "in_media_res", "pattern_interrupt"];

const words = (t) => t.split(/\s+/).filter(Boolean).length;
const sentences = (t) => t.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
const norm = (t) => t.replace(/\s+/g, " ").trim();
const NUM_WORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion percent dollars".split(" ");
const hasNumber = (t) => /\d/.test(t) || t.toLowerCase().split(/[^a-z]+/).some((w) => NUM_WORDS.includes(w));
const SCREEN_DESCRIBING = /\b(?:as you can see|on (?:the|your) screen|you can see (?:here|that)|look at (?:this|the) (?:chart|graph|number)|this (?:chart|graph|slide) shows|the (?:chart|graph) (?:above|below|here) shows)\b/i;
const ANNOUNCES = /\b(?:you'?ll also get|you will (?:also )?get|in this video|in this list|by the end of this)\b/i;
const ABSOLUTES = /\b(?:every time|always|everyone|everybody|nobody|never fails?|all of them|without exception|the rest (?:read|do|are|say))\b/i;
const LEGAL = /\b(?:liable|liability|illegal|lawsuit|sue[sd]?|penalt(?:y|ies)|pays? the price|a fine|fines|holding the bill|left with the bill|on the hook|responsible for the)\b/i;
const LEGAL_CLAIM = /liab|penalt|fine|enforce|responsib|held|fined|illegal|violat/i;

/** @param cfg config/pipeline.json -> script  @param opts {modeIds:Set, recentHookTypes:string[]} */
export function structureFindings(script, cfg, opts = {}) {
  const out = [];
  const families = opts.modeFamilies || new Map();
  const add = (severity, rule, detail, scene) => out.push({ severity, rule, detail, ...(scene ? { scene } : {}) });
  const wpm = cfg.wpm, secOf = (n) => (n / wpm) * 60;
  const scenes = script.scenes || [];

  // Hook type, recorded and rotated
  if (!HOOK_TYPES.includes(script.hookType)) add("P0", "hook-type-missing", `script.hookType must be one of: ${HOOK_TYPES.join(", ")}`);
  else {
    const recent = (opts.recentHookTypes || []).slice(-2);
    if (recent.length === 2 && recent.every((t) => t === script.hookType)) add("P1", "hook-type-repeated", `hook type "${script.hookType}" was used in each of the last two videos; pick a different one`);
  }

  // Beats everywhere
  const beatsByScene = scenes.map((s) => s.beats || []);
  scenes.forEach((s, i) => { if (!beatsByScene[i].length) add("P0", "beats-missing", `scene has no beats; write each scene as 4-${cfg.beatMaxSec} s beats, one idea each`, s.id); });
  if (out.some((f) => f.rule === "beats-missing")) return out;

  let t = 0;
  const timeline = []; // {scene, beat, start, end, text, intent}
  scenes.forEach((s, i) => {
    const joined = norm(beatsByScene[i].map((b) => b.narration).join(" "));
    if (joined !== norm(s.narration)) add("P0", "beats-differ-from-scene", "the beats joined together must equal the scene narration exactly (the beats are the source for timing and visuals)", s.id);
    beatsByScene[i].forEach((b) => {
      const w = words(b.narration), dur = secOf(w);
      timeline.push({ scene: s.id, beat: b, start: t, end: t + dur, dur });
      if (dur > cfg.beatMaxSec) add("P1", "beat-too-long", `${b.id}: about ${dur.toFixed(0)} s (${w} words); split it (max ${cfg.beatMaxSec} s, one idea per beat)`, s.id);
      if (dur < cfg.beatMinSec) add("P2", "beat-too-short", `${b.id}: about ${dur.toFixed(0)} s; merge with a neighbour (min ${cfg.beatMinSec} s)`, s.id);
      if (opts.modeIds && !opts.modeIds.has(b.visualIntent)) add("P1", "beat-visual-intent", `${b.id}: visualIntent "${b.visualIntent}" is not a defined visual mode`, s.id);
      if (families.get(b.visualIntent) === "chart" && !beatHasData(b)) add("P1", "chart-without-data", `${b.id}: chart mode "${b.visualIntent}" but the beat has no numbers to draw; use a diagram or support mode, or give the beat real data`, s.id);
      if (b.data?.claimId && !(s.claims || []).some((c) => c.id === b.data.claimId)) add("P1", "beat-data-claim-unknown", `${b.id}: data.claimId "${b.data.claimId}" is not a claim of this scene`, s.id);
      if (SCREEN_DESCRIBING.test(b.narration)) add("P1", "narration-describes-visual", `${b.id}: narration describes the screen; it should add meaning the picture cannot`, s.id);
      for (const sent of sentences(b.narration)) if (words(sent) > cfg.maxSentenceWords) add("P2", "sentence-too-long-to-breathe", `${b.id}: a ${words(sent)}-word sentence; split it`, s.id);
      t += dur;
    });
  });
  const total = t;

  // Repeated visual idea three beats in a row hurts variety
  for (let i = 2; i < timeline.length; i++) if (timeline[i].beat.visualIntent && timeline[i].beat.visualIntent === timeline[i - 1].beat.visualIntent && timeline[i].beat.visualIntent === timeline[i - 2].beat.visualIntent) add("P2", "visual-repetition", `${timeline[i].beat.id}: the same visual mode three beats in a row`, timeline[i].scene);

  // Hook: promise or tension inside the first N seconds, not an announcement, not too long
  const hookBeats = timeline.filter((x) => x.scene === scenes[0].id);
  const hookDur = hookBeats.reduce((a, x) => a + x.dur, 0);
  if (hookDur > cfg.hookMaxTotalSec) add("P1", "hook-too-long", `hook scene is about ${hookDur.toFixed(0)} s (max ${cfg.hookMaxTotalSec} s)`, scenes[0].id);
  if (hookBeats[0] && hookBeats[0].dur > cfg.hookFirstBeatMaxSec) add("P1", "hook-first-beat-slow", `the first beat takes about ${hookBeats[0].dur.toFixed(0)} s; the tension or promise must land inside ${cfg.hookFirstBeatMaxSec} s`, scenes[0].id);
  if (ANNOUNCES.test(scenes[0].narration)) add("P1", "hook-announces-contents", "hook announces what the video contains", scenes[0].id);

  // Interrupts: a number, a question or a flagged beat at least every N seconds
  const isInterrupt = (x) => x.beat.interrupt === true || /\?/.test(x.beat.narration) || hasNumber(x.beat.narration);
  let last = 0;
  for (const x of timeline) { if (isInterrupt(x)) last = x.end; else if (x.end - last > cfg.interruptMaxSec) { add("P1", "no-interrupt-gap", `no number, question or flagged interrupt for over ${cfg.interruptMaxSec} s up to ${x.beat.id}`, x.scene); last = x.end; } }

  // Mid-point re-hook
  const rb = timeline.find((x) => x.beat.id === script.rehookBeat);
  if (!rb) add("P1", "rehook-missing", "set script.rehookBeat to the beat id that re-hooks the viewer near the middle");
  else { const pos = rb.start / total; if (pos < cfg.rehookWindow[0] || pos > cfg.rehookWindow[1]) add("P1", "rehook-misplaced", `re-hook at ${(pos * 100).toFixed(0)}% of runtime; expected ${cfg.rehookWindow[0] * 100}-${cfg.rehookWindow[1] * 100}%`, rb.scene); }

  // Claim evidence: exact quote beside every primary claim; numbers in the claim must be in the quote
  for (const s of scenes) for (const c of s.claims || []) {
    if (c.sourceKind === "primary" && !c.sourceQuote) { add("P1", "claim-quote-missing", `${c.id}: record the source's exact line in sourceQuote`, s.id); continue; }
    if (c.sourceKind === "primary") {
      const quote = c.sourceQuote.replace(/[$,\s]/g, ""); // currency symbols and thousands commas do not have to match: tables often print 27,900 where the claim says $27,900
      for (const n of (c.text.match(/\$?\d[\d,.]*%?/g) || []).map((x) => x.replace(/[$,\s]/g, "").replace(/\.$/, ""))) if (n.length >= 2 && !quote.includes(n)) add("P1", "claim-number-not-in-quote", `${c.id}: "${n}" is in the claim but not in the quoted source line`, s.id);
    }
  }
  // Absolutes next to sourced claims, and legal statements need a claim about liability itself
  for (const s of scenes) {
    if ((s.claims || []).length && ABSOLUTES.test(s.narration)) add("P1", "absolute-wording-with-claim", `"${s.narration.match(ABSOLUTES)[0]}" next to a sourced claim; the narration may say more than the source does`, s.id);
    if (LEGAL.test(s.narration) && !(s.claims || []).some((c) => LEGAL_CLAIM.test(c.text))) add("P1", "legal-claim-not-supported", "legal or penalty statement; no claim in this scene is about liability or penalties", s.id);
  }
  return out;
}
