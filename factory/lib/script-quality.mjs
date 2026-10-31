// Spoken-script quality gate: deterministic checks for AI-sounding writing, stiff (non-spoken) English,
// unkept promises, stale or vague claims. Pure functions, no I/O.
//
// Rule families are adapted from public writing skills (credited in skills/ffx-script/SKILL.md):
// blader/humanizer (staging, rhythm, inflation patterns), conorbronsdon/avoid-ai-writing (vocabulary tiers,
// rewrite-vs-patch thresholds), timolabs-ai/claude-humanize-skill (sentence shape, paragraph jobs),
// plus spoken-American rules of our own (contractions, "let's", short words).
// This is a screen, not a judge: it catches measurable tells. A human-style read-aloud pass is still required.

const TIER1 = ["delve", "tapestry", "landscape", "leverage", "robust", "seamless", "unlock", "game-changer", "game changer", "pivotal",
  "testament", "realm", "elevate", "harness", "crucial", "paradigm", "synergy", "holistic", "streamline", "cutting-edge", "utilize", "plethora", "myriad", "embark"];
const TIER2 = ["journey", "navigate", "ecosystem", "empower", "transformative", "revolutionize", "foster", "comprehensive", "essential", "vital", "dynamic", "innovative"];
const STOCK = [
  /\bhere is the (?:part|gap|thing|first)\b/i, /\bhere's the (?:part|gap|thing)\b/i, /\bthat is the whole (?:game|point|launch|idea)\b/i,
  /\blet us\b/i, /\bin (?:the )?(?:next|this) (?:ten|\d+) minutes\b/i, /\bi will walk you through\b/i, /\bdive (?:in|into)\b/i,
  /\bit'?s important to (?:note|remember)\b/i, /\bat the end of the day\b/i, /\bin today's\b/i, /\bwhen it comes to\b/i,
  /\bthe real (?:question|problem|secret|key)\b/i, /\bhere is the part that matters\b/i,
];
// Expanded forms an American speaker would normally contract.
const EXPANDED = /\b(?:i will|you will|we will|they will|that is|it is|there is|here is|what is|do not|does not|did not|is not|are not|was not|cannot|can not|could not|would not|should not|will not|i am|you are|we are|they are|let us|i would|you would|that would|who is|how is)\b/gi;
// Possessives ("creator's") are not contractions, so 's counts only after pronouns and a few function words.
const CONTRACTED = /\b(?:(?:it|that|there|here|what|let|who|he|she|how|where)'s)\b|\b\w+(?:'re|'ll|'d|'ve|n't|'m)\b|\b(?:gonna|wanna|gotta)\b/gi;
const NOT_BUT = [/\bnot (?:just |only |merely )?[^.?!]{2,60}[,;]? but\b/i, /\bit(?:'s| is) not [^.?!]{2,60}[,.] it(?:'s| is)\b/i, /\bthe (\w+) was never [^.?!]{2,60}\. the \1 was\b/i, /\bnever [^.?!]{2,60}\. (?:it|the \w+) (?:was|is)\b/i];
const VAGUE_SOURCE = /\b(?:the hosts? of (?:the|this) (?:source )?video|the source video|the video this idea comes from|experts say|studies show|research shows|many people|some say)\b/gi;

const COMMON_STARTERS = new Set("the this that there here these those then they you your what when where why how but and first second third fourth fifth sixth seventh next now one some most many every each after before still just only also here's".split(" "));
const words = (t) => t.split(/\s+/).filter(Boolean);
const sentences = (t) => t.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
const count = (t, re) => (t.match(re) || []).length;
const stdev = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

export function scoreScript(script, { now = new Date(), creatorNames = [] } = {}) {
  const findings = []; // {severity: "P0"|"P1"|"P2", rule, scene?, detail}
  const add = (severity, rule, detail, scene) => findings.push({ severity, rule, detail, ...(scene ? { scene } : {}) });
  const scenes = script.scenes || [];
  const all = scenes.map((s) => s.narration).join(" ");
  const nWords = words(all).length || 1;
  const per1k = (n) => (n / nWords) * 1000;

  // 1. Vocabulary
  for (const s of scenes) {
    const low = s.narration.toLowerCase();
    for (const w of TIER1) if (low.includes(w)) add("P1", "ai-vocabulary", `"${w}"`, s.id);
  }
  const t2 = TIER2.filter((w) => all.toLowerCase().includes(w));
  if (t2.length >= 3) add("P2", "ai-vocabulary-cluster", `several marketing words together: ${t2.join(", ")}`);

  // 2. Stock phrases and staging
  for (const s of scenes) for (const re of STOCK) { const m = s.narration.match(re); if (m) add("P1", "stock-phrase", `"${m[0]}"`, s.id); }
  for (const s of scenes) for (const re of NOT_BUT) { const m = s.narration.match(re); if (m) { add("P1", "not-x-but-y", `contrast framing: "${m[0].slice(0, 70)}"`, s.id); break; } }

  // 3. Spoken English: contractions
  const expanded = count(all, EXPANDED), contracted = count(all, CONTRACTED);
  const contractionRate = contracted / Math.max(1, contracted + expanded);
  if (contractionRate < 0.5 && contracted + expanded >= 10) add("P0", "stiff-spoken-english", `only ${Math.round(contractionRate * 100)}% of contractable phrases are contracted (${contracted} contracted vs ${expanded} spelled out). Americans say "that's", "don't", "let's", "I'll". Target 80%+ (keep a few spelled-out ones for emphasis).`);
  else if (contractionRate < 0.75 && contracted + expanded >= 10) add("P1", "stiff-spoken-english", `contraction rate ${Math.round(contractionRate * 100)}%, target 80%+`);

  // 4. Rhythm
  const sents = scenes.flatMap((s) => sentences(s.narration).map((t) => ({ t, scene: s.id })));
  const lens = sents.map((x) => words(x.t).length);
  const sd = stdev(lens), mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (sd < 5) add("P1", "uniform-rhythm", `sentence length varies too little (sd ${sd.toFixed(1)} words, mean ${mean.toFixed(1)}); mix very short and longer sentences`);
  const openers = {};
  for (const x of sents) { const o = words(x.t).slice(0, 2).join(" ").toLowerCase().replace(/[^a-z' ]/g, ""); openers[o] = (openers[o] || 0) + 1; }
  for (const [o, n] of Object.entries(openers)) if (n >= 6 && o.split(" ").length === 2) add("P1", "repeated-openers", `${n} sentences start with "${o}"`);
  const shortPunch = sents.filter((x, i) => words(x.t).length <= 5 && i > 0 && words(sents[i - 1].t).length >= 14).length;
  if (per1k(shortPunch) > 12) add("P2", "punchline-fragments", `${shortPunch} short punch sentences after long ones (reads as a template)`);
  let triads = 0;
  for (const x of sents) if (/\b[\w' -]{2,30}, [\w' -]{2,30},? and [\w' -]{2,30}[.?!]?$/i.test(x.t) && !/\d/.test(x.t)) triads++;
  if (per1k(triads) > 6) add("P2", "forced-triads", `${triads} three-item lists`);
  const dashes = count(all, /[—–]|--/g);
  if (dashes > 0) add("P2", "dashes", `${dashes} dash(es); spoken script should use plain punctuation`);

  // 5. Vague or unnamed attribution
  const vague = count(all, VAGUE_SOURCE);
  if (vague > 2) add("P1", "unnamed-attribution", `${vague} references to an unnamed source ("the hosts of the source video", "experts say"). Name the source once, then use its name.`);

  // 6. Promise ledger: anything the hook promises must be paid off
  const hook = scenes[0]?.narration || "";
  const promiseCues = hook.match(/\b(?:at the end|by the end|i will give you|i'll give you|i will show you|i'll show you|stay (?:till|until)|a simple test|seven|six|five|three) [^.?!]*/gi) || [];
  const ledger = Array.isArray(script.promises) ? script.promises : null;
  if (promiseCues.length && !ledger) add("P0", "promise-ledger-missing", `hook makes promises (${promiseCues.slice(0, 3).map((p) => `"${p.slice(0, 50)}"`).join("; ")}) but script.promises is missing. List each promise with the scene ids that pay it off.`);
  if (ledger) {
    const ids = new Set(scenes.map((s) => s.id));
    for (const p of ledger) {
      const paid = (p.paidOffIn || []).filter((id) => ids.has(id));
      if (!paid.length) add("P0", "promise-unpaid", `promise not paid off in any scene: "${p.text}"`);
      else if (paid.every((id) => scenes.findIndex((s) => s.id === id) === 0)) add("P0", "promise-unpaid", `promise only "paid" inside the hook itself: "${p.text}"`);
    }
  }

  // 7. Freshness of claims
  const year = now.getUTCFullYear();
  for (const s of scenes) {
    const stale = /\b(?:latest|newest|most recent|current|currently|new report|this year)\b/i.test(s.narration);
    const claims = s.claims || [];
    if (stale && claims.length && !claims.some((c) => Number.isInteger(c.dataYear))) add("P1", "freshness-unchecked", `narration says "latest/current" but no claim records dataYear; confirm it is the newest edition`, s.id);
    for (const c of claims) if (Number.isInteger(c.dataYear) && year - c.dataYear >= 2 && !c.dataYearNarrated) add("P1", "stale-statistic", `${c.id}: data from ${c.dataYear}; check for a newer edition, or say the year out loud and set dataYearNarrated: true`, s.id);
    for (const c of claims) if (c.sourceKind === "secondary") add("P2", "secondary-source", `${c.id}: relies on a secondary summary; find the primary report or say "as reported by"`, s.id);
  }

  // 8. Unsourced sweeping claims
  for (const s of scenes) { const m = s.narration.match(/\b(?:cheapest|best|biggest|most) [\w ]{2,30} in the world\b|\balmost all of them\b|\bmost of the businesses\b|\bnobody\b|\beveryone knows\b/i); if (m && !(s.claims || []).length) add("P2", "unsourced-sweeping-claim", `"${m[0]}"`, s.id); }

  // 9. System rules added 2026-10-31 (owner policy): our videos are fully our own work.
  //    Source videos are research only: never name or credit the creators we research, never cite their videos.
  const lowAll = (script.title || "").toLowerCase() + " " + all.toLowerCase();
  for (const n of creatorNames) if (n.length >= 4 && lowAll.includes(n.toLowerCase())) add("P0", "source-creator-named", `names a researched creator ("${n}"). Videos are fully our own; do not credit or mention source creators.`);
  for (const src of script.sources || []) if (/youtube\.com|youtu\.be/i.test(src.url || "")) add("P0", "video-cited-as-source", `source "${src.id}" is a video. Facts must come from primary sources (filings, regulators, original research), not another creator's video.`);
  for (const s of scenes) for (const c of s.claims || []) if (c.sourceKind === "attributed") add("P1", "attributed-claim", `${c.id}: relies on someone else's say-so. Replace it with a verified primary figure or cut it.`, s.id);

  // 10. Hook must start with something concrete, not announce the contents
  if (/\b(?:video|list|guide) (?:runs|walks|goes) through\b|\byou'?ll get\b|\bi'?ve (?:ranked|put together|made)\b|\bin this (?:video|list)\b|\blet'?s start with\b/i.test(hook)) add("P1", "hook-announces-contents", "the hook announces what the video contains instead of opening with a concrete number, scene or tension", scenes[0]?.id);

  // 11. Faceless channel: no invented personal experience
  for (const s of scenes) { const m = s.narration.match(/\b(?:the (?:test|method|system|rule) i use|this one is mine|in my experience|i'?ve (?:seen|used|built|tried|done)|when i (?:started|did|was)|my (?:own )?(?:clients?|business|agency|results?))\b/i); if (m) add("P1", "invented-persona", `"${m[0]}": the narrator has no personal history; say it as a fact about the work, not as lived experience`, s.id); }

  // 12. A pronoun must have a named antecedent in the same scene
  for (const s of scenes) { const ss = sentences(s.narration); for (let i = 0; i < ss.length; i++) if (/^(?:he|she|his|her)\b/i.test(ss[i])) { const before = ss.slice(0, i).join(" "); if (!(before.replace(/(?:^|[.?!]\s+)[A-Z][a-z]+\b(?!\s+(?:runs|owns|is|has|says|sells|works|wants|takes|opens|gets|makes|was|had)\b)/g, " ").match(/\b[A-Z][a-z]{2,}\b/g) || []).some((w) => !COMMON_STARTERS.has(w.toLowerCase()))) add("P1", "dangling-pronoun", `"${ss[i].slice(0, 40)}": no named person before it in this scene`, s.id); } }

  // 13. Our own recommendations must agree
  const picks = scenes.filter((s) => /\bi'?d (?:start with|pick|choose|go with)\b/i.test(s.narration));
  if (picks.length >= 2) add("P1", "multiple-recommendations", `scenes ${picks.map((p) => p.id).join(", ")} each give a personal pick; check they agree or keep one`);

  // 14. Legal or liability statements need a source
  for (const s of scenes) if (/\b(?:liable|liability|illegal|lawsuit|sue[sd]?|penalt(?:y|ies)|pays? the price)\b/i.test(s.narration) && !(s.claims || []).length) add("P1", "legal-claim-unsourced", "legal or liability statement with no cited source", s.id);

  // Score
  const weight = { P0: 12, P1: 5, P2: 2 };
  // Each rule costs at most 3 hits, so one repeated habit cannot zero the score on its own.
  const seen = {};
  let penalty = 0;
  for (const f of findings) { seen[f.rule] = (seen[f.rule] || 0) + 1; if (seen[f.rule] <= 3) penalty += weight[f.severity]; }
  const score = Math.max(0, 100 - penalty);
  const p0 = findings.filter((f) => f.severity === "P0").length;
  const verdict = p0 > 0 || score < 80 ? "FAIL" : "PASS";
  const rewrite = findings.length >= 8 && p0 > 0 ? "full-rewrite" : findings.length ? "targeted-edit" : "none";
  return { score, verdict, rewrite, metrics: { words: nWords, sentences: sents.length, meanSentenceWords: +mean.toFixed(1), sentenceSd: +sd.toFixed(1), contractionRate: +contractionRate.toFixed(2), contracted, expanded }, findings };
}
