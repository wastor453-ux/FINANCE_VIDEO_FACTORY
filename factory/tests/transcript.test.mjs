import test from "node:test";
import assert from "node:assert/strict";
import { parseVtt, parseSrt, segmentsToText, wordCount, distinctiveTitleWords, validateTranscript } from "../lib/transcript.mjs";

const SIMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello and welcome back to the channel.

00:00:04.500 --> 00:00:08.200
Today we're talking about seven proven ways.
`;

// Real YouTube auto-captions are "rolling": consecutive cues repeat/extend the prior line, carry
// <c> word-timing tags, and sometimes an inline timestamp tag mid-cue. Not a synthetic edge case --
// this is what yt-dlp --write-auto-sub actually produces.
const ROLLING_VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.080 --> 00:00:02.500
hey what's up <c>everyone</c> welcome back

00:00:02.500 --> 00:00:05.000
hey what's up everyone welcome back
to the channel

00:00:05.000 --> 00:00:08.000
to the channel today we're going to talk
about <00:00:06.500>money
`;

const SIMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello and welcome back to the channel.

2
00:00:04,500 --> 00:00:08,200
Today we're talking about seven proven ways.
`;

test("parseVtt: simple cues with hours-omitted timestamps", () => {
  const segs = parseVtt(SIMPLE_VTT);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].startMs, 1000);
  assert.equal(segs[0].endMs, 4000);
  assert.equal(segs[0].text, "Hello and welcome back to the channel.");
  assert.equal(segs[1].startMs, 4500);
});

test("parseVtt: strips <c> tags and inline timestamp tags, drops exact-duplicate rolling cues", () => {
  const segs = parseVtt(ROLLING_VTT);
  // cue 1 and cue 2 overlap/repeat text but are not IDENTICAL (cue 2 adds "to the channel"), so both kept;
  // tags are stripped either way
  assert.ok(segs.every((s) => !s.text.includes("<")), "no raw tag characters should remain");
  assert.ok(segs.some((s) => s.text.includes("welcome back")));
  assert.ok(segs.some((s) => s.text.includes("money")), "inline timestamp tag text must still be captured");
});

test("parseVtt: identical consecutive cues are deduped", () => {
  const dupe = `WEBVTT

00:00:01.000 --> 00:00:02.000
same text here

00:00:02.000 --> 00:00:03.000
same text here
`;
  const segs = parseVtt(dupe);
  assert.equal(segs.length, 1);
});

test("parseSrt: comma decimal separator and numbered blocks", () => {
  const segs = parseSrt(SIMPLE_SRT);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].startMs, 1000);
  assert.equal(segs[1].endMs, 8200);
  assert.equal(segs[1].text, "Today we're talking about seven proven ways.");
});

test("segmentsToText joins and normalizes whitespace; wordCount counts words", () => {
  const segs = parseVtt(SIMPLE_VTT);
  const text = segmentsToText(segs);
  assert.equal(text, "Hello and welcome back to the channel. Today we're talking about seven proven ways.");
  assert.equal(wordCount(text), 14);
  assert.equal(wordCount(""), 0);
});

test("distinctiveTitleWords: lowercases, drops short words and stopwords, de-dupes", () => {
  const words = distinctiveTitleWords("7 Proven Ways to Make Money With AI (No Experience)");
  assert.ok(words.includes("proven"));
  assert.ok(words.includes("money"));
  assert.ok(words.includes("experience"));
  assert.ok(!words.includes("to")); // too short
  assert.ok(!words.includes("with")); // stopword
});

test("validateTranscript: passes a transcript that genuinely meets all three bars", () => {
  const longText = Array.from({ length: 210 }, (_, i) => `word${i}`).join(" ");
  // title's distinctive words are: proven, ways, make, money, experience (5) -- all must appear
  const segments = [{ startMs: 0, endMs: 595_000, text: `${longText} proven ways make money experience` }];
  const res = validateTranscript({ segments, videoDurationSec: 600, title: "7 Proven Ways to Make Money With AI (No Experience)" });
  assert.equal(res.ok, true);
  assert.equal(res.matchesVideoDuration, true);
  assert.ok(res.wordCount >= 200);
  assert.deepEqual(res.notes, []);
});

test("validateTranscript: fails and explains when too short, duration mismatched, and off-topic", () => {
  const segments = [{ startMs: 0, endMs: 5000, text: "a few words only" }];
  const res = validateTranscript({ segments, videoDurationSec: 600, title: "7 Proven Ways to Make Money With AI (No Experience)" });
  assert.equal(res.ok, false);
  assert.equal(res.matchesVideoDuration, false);
  assert.ok(res.wordCount < 200);
  assert.ok(res.notes.some((n) => n.includes("word count")));
  assert.ok(res.notes.some((n) => n.includes("last caption")));
  assert.ok(res.notes.some((n) => n.includes("distinctive title words")));
});

test("validateTranscript: language mismatch is reported", () => {
  const longText = Array.from({ length: 210 }, (_, i) => `word${i}`).join(" ");
  const segments = [{ startMs: 0, endMs: 595_000, text: `${longText} proven ways make money experience` }];
  const res = validateTranscript({ segments, videoDurationSec: 600, title: "7 Proven Ways to Make Money With AI (No Experience)", expectedLanguage: "en", actualLanguage: "es" });
  assert.equal(res.ok, false);
  assert.ok(res.notes.some((n) => n.includes("language mismatch")));
});

test("validateTranscript: a title with very few distinctive words only requires what's available", () => {
  const longText = Array.from({ length: 210 }, (_, i) => `word${i}`).join(" ");
  const segments = [{ startMs: 0, endMs: 595_000, text: `${longText} gold` }];
  const res = validateTranscript({ segments, videoDurationSec: 600, title: "Gold" }); // 1 distinctive word
  assert.equal(res.titleWordsNeeded, 1);
  assert.equal(res.titleWordsFound, 1);
});

import { scoreScript } from "../lib/script-quality.mjs";
const mk = (narr, extra = {}) => ({ scenes: narr.map((n, i) => ({ id: `S${String(i + 1).padStart(2, "0")}`, beat: "x", narration: n, claims: [] })), ...extra });
test("script-score: stiff, staged, unpaid-promise script fails; natural spoken script passes", () => {
  const stiff = mk(Array(8).fill("Here is the part that matters. That is the whole game. We do not know what it is. Let us dive in and I will walk you through it, and you will see that it is not just money, but freedom."));
  const bad = scoreScript(stiff);
  assert.equal(bad.verdict, "FAIL");
  assert.ok(bad.findings.some((f) => f.rule === "stiff-spoken-english"));
  assert.ok(bad.findings.some((f) => f.rule === "stock-phrase"));
  const good = scoreScript(mk([
    "Most people I know chase the wrong thing. They don't need a startup. They need one paying customer.",
    "Here's what I'd do. Pick a boring local business, fix one small problem, and send them the result for free. It's quick. You'll know within a week if it works.",
    "Why does that work? Because they've already got customers and they're too busy to learn new tools. That's your opening, and it won't last forever.",
    "So don't wait for a perfect plan. Make three samples today. If nobody answers, change the sample, not the idea.",
    "Okay, that's it for the plan. This is education, not financial advice, and your results will vary. Start small and check the rules where you live.",
  ]));
  assert.equal(good.verdict, "PASS", JSON.stringify(good.findings));
});
test("script-score: promise ledger and stale statistics are enforced", () => {
  const s = mk(["I'll show you seven ways to earn, and at the end I'll give you a simple test.", "Ways one to seven go here and they're short.", "More here, it's fine.", "Still more here, don't worry.", "That's all, you're done."]);
  assert.ok(scoreScript(s).findings.some((f) => f.rule === "promise-ledger-missing"));
  s.promises = [{ text: "a simple test", paidOffIn: ["S01"] }];
  assert.ok(scoreScript(s).findings.some((f) => f.rule === "promise-unpaid"));
  s.promises = [{ text: "a simple test", paidOffIn: ["S05"] }];
  assert.ok(!scoreScript(s).findings.some((f) => f.rule === "promise-unpaid"));
  s.scenes[1].claims = [{ id: "C1", text: "x", sourceIds: ["a"], dataYear: 2024 }];
  assert.ok(scoreScript(s, { now: new Date("2026-10-30") }).findings.some((f) => f.rule === "stale-statistic"));
});

test("script-score: system rules (no creator credit, persona, hook, pronoun, picks, legal)", () => {
  const rules = (sc, o) => scoreScript(sc, o).findings.map((f) => f.rule);
  const s = mk(["Mark Tilbury's video runs through seven ways. You'll get the list.", "This one is mine. He puts the price high.", "I'd start with photos.", "Break the rules and the client pays the price.", "I'd pick reviews. That's it."]);
  s.sources = [{ id: "v", title: "x", url: "https://www.youtube.com/watch?v=1" }];
  s.scenes[1].claims = [{ id: "C1", text: "x", sourceIds: ["v"], sourceKind: "attributed" }];
  const r = rules(s, { creatorNames: ["Mark Tilbury"] });
  for (const k of ["source-creator-named", "video-cited-as-source", "attributed-claim", "hook-announces-contents", "invented-persona", "dangling-pronoun", "multiple-recommendations", "legal-claim-unsourced"]) assert.ok(r.includes(k), k);
  const ok = rules(mk(["Thirty-six million small businesses can't keep up with new tools.", "Mara runs a bakery. She doesn't have time for software."]), { creatorNames: ["Mark Tilbury"] });
  for (const k of ["source-creator-named", "dangling-pronoun", "invented-persona", "hook-announces-contents"]) assert.ok(!ok.includes(k), k);
});

import { creditCard, rentVsBuy, paycheckFlow } from "./fixtures/script_fixtures.mjs";
import { readFileSync } from "node:fs";
const pipeline = JSON.parse(readFileSync(new URL("../config/pipeline.json", import.meta.url), "utf8"));
const modeIds = new Set(JSON.parse(readFileSync(new URL("../config/visual_modes.json", import.meta.url), "utf8")).modes.map((m) => m.id));
const modeFamilies = new Map(JSON.parse(readFileSync(new URL("../config/visual_modes.json", import.meta.url), "utf8")).modes.map((m) => [m.id, m.family]));
const opts = { structure: pipeline.script, modeIds, modeFamilies, creatorNames: ["Mark Tilbury"], now: new Date("2026-11-01") };
test("script structure gate: three different topics pass; each rule fires when broken", () => {
  for (const [name, f] of Object.entries({ creditCard, rentVsBuy, paycheckFlow })) {
    const r = scoreScript(f, opts);
    assert.equal(r.verdict, "PASS", `${name}: ${JSON.stringify(r.findings)}`);
  }
  const rules = (s) => scoreScript(s, opts).findings.map((f) => f.rule);
  const clone = () => JSON.parse(JSON.stringify(creditCard));
  let s = clone(); delete s.hookType; assert.ok(rules(s).includes("hook-type-missing"));
  s = clone(); s.scenes[1].beats = []; assert.ok(rules(s).includes("beats-missing"));
  s = clone(); s.scenes[1].narration += " extra"; assert.ok(rules(s).includes("beats-differ-from-scene"));
  s = clone(); s.scenes[1].beats[0].narration = Array(60).fill("word").join(" "); s.scenes[1].narration = s.scenes[1].beats.map((b) => b.narration).join(" "); assert.ok(rules(s).includes("beat-too-long"));
  s = clone(); s.scenes[0].beats[0].visualIntent = "fancy_unknown"; assert.ok(rules(s).includes("beat-visual-intent"));
  s = clone(); s.scenes[0].beats[1].narration = "You'll also get a quick look at how it snowballs over a full year."; s.scenes[0].narration = s.scenes[0].beats.map((b) => b.narration).join(" "); assert.ok(rules(s).includes("hook-announces-contents"));
  s = clone(); s.rehookBeat = "B01"; assert.ok(rules(s).includes("rehook-misplaced"));
  delete (s = clone()).rehookBeat; assert.ok(rules(s).includes("rehook-missing"));
  assert.ok(scoreScript(clone(), { ...opts, recentHookTypes: ["curiosity_gap", "curiosity_gap"] }).findings.some((f) => f.rule === "hook-type-repeated"));
  s = clone(); s.scenes[1].narration = s.scenes[1].beats[0].narration = "As you can see on the screen, the balance grows by twenty percent a year and that is right now."; assert.ok(rules(s).includes("narration-describes-visual"));
});
test("script structure gate: claim evidence and wording checks", () => {
  const rules = (s) => scoreScript(s, opts).findings.map((f) => f.rule);
  const s = JSON.parse(JSON.stringify(rentVsBuy));
  s.scenes[1].claims = [{ id: "X1", text: "NAR says 81% of buyers rated photos useful", sourceIds: ["ex"], sourceKind: "primary" }];
  assert.ok(rules(s).includes("claim-quote-missing"));
  s.scenes[1].claims[0].sourceQuote = "Buyers rated listing photos as the most useful feature.";
  assert.ok(rules(s).includes("claim-number-not-in-quote"));
  s.scenes[1].claims[0].sourceQuote = "81% of buyers rated listing photos as the most useful feature.";
  assert.ok(!rules(s).includes("claim-number-not-in-quote"));
  s.scenes[1].narration = "The rest read them every time, and you can check that.";
  assert.ok(rules(s).includes("absolute-wording-with-claim"));
  const t = JSON.parse(JSON.stringify(rentVsBuy));
  t.scenes[2].narration += " If those rules break, the client pays the price.";
  assert.ok(rules(t).includes("legal-claim-not-supported"));
});

import { fitScore, itemsFrom } from "../lib/fit.mjs";
test("topic fit: varied number-driven topics pass; cards-only and single-idea topics fail", () => {
  const modes = JSON.parse(readFileSync(new URL("../config/visual_modes.json", import.meta.url), "utf8")).modes;
  for (const [n, f] of Object.entries({ creditCard, rentVsBuy, paycheckFlow })) {
    const r = fitScore(itemsFrom(f, pipeline.script.wpm), modes, pipeline.fit);
    assert.ok(r.pass, `${n}: ${JSON.stringify(r)}`);
  }
  const cards = { motionFit: { beats: ["kpi_card", "annotation_callout", "action_checklist", "risks_grid", "hook_question", "line_chart"].map((mode) => ({ beat: mode, mode })) } };
  const bad = fitScore(itemsFrom(cards), modes, pipeline.fit);
  assert.equal(bad.pass, false); assert.ok(bad.reasons.some((x) => x.includes("below")));
  const oneIdea = { motionFit: { beats: ["line_chart", "compound_growth", "debt_payoff", "inflation_power"].map((mode) => ({ beat: mode, mode })) } };
  const r1 = fitScore(itemsFrom(oneIdea), modes, pipeline.fit);
  assert.equal(r1.pass, false); assert.ok(r1.reasons.some((x) => x.includes("story type")));
  assert.throws(() => itemsFrom({}, 175));
});

test("script gate v3: chart needs data, repeated phrases, paraphrased legal claims", () => {
  const rules = (sc) => scoreScript(sc, opts).findings.map((f) => f.rule);
  const clone = () => JSON.parse(JSON.stringify(rentVsBuy));
  let s = clone(); s.scenes[3].beats[0].narration = "Plot both paths over time and watch them move apart."; s.scenes[3].beats[0].data = undefined; s.scenes[3].narration = s.scenes[3].beats.map((b) => b.narration).join(" ");
  assert.ok(rules(s).includes("chart-without-data"));
  s = clone(); s.scenes[3].beats[0].data = { claimId: "NOPE" }; assert.ok(rules(s).includes("beat-data-claim-unknown"));
  s = clone(); s.scenes[5].beats[1].narration += " If you run the numbers on your own rent, price and move date you will see it clearly."; s.scenes[5].narration = s.scenes[5].beats.map((b) => b.narration).join(" ");
  s.scenes[4].beats[0].narration += " If you run the numbers on your own rent, price and move date you will see it clearly."; s.scenes[4].narration = s.scenes[4].beats.map((b) => b.narration).join(" ");
  assert.ok(rules(s).includes("repeated-phrase"));
  s = clone(); s.scenes[5].beats[0].narration += " If it goes wrong, the buyer is the one left holding the bill."; s.scenes[5].narration = s.scenes[5].beats.map((b) => b.narration).join(" ");
  assert.ok(rules(s).includes("legal-claim-not-supported"));
  const cards = JSON.parse(JSON.stringify(creditCard)); // a chart beat without data counts as support in topic fit
  const fam = new Map(JSON.parse(readFileSync(new URL("../config/visual_modes.json", import.meta.url), "utf8")).modes.map((m) => [m.id, m.family]));
  assert.ok(fam.get("line_chart") === "chart");
  const items = itemsFrom({ scenes: [{ beats: [{ narration: "It grows a lot over time.", visualIntent: "line_chart" }, { narration: "It grows by ten percent a year.", visualIntent: "line_chart" }] }] }, 175);
  assert.deepEqual(items.map((i) => i.hasData), [false, true]);
});

// ---- voice layer: tags, delivery, sources read aloud (AI Studio research, 2026-11-02) ----
import { spoken, plainScript } from "../lib/tags.mjs";
const REG = new Set(["hook", "analysis", "conversational", "risk", "outro"]);
const TAGS = ["<short pause>", "<long pause>", "<breath>", "<sigh>"];
const withNarr = (fn) => { const s = structuredClone(creditCard); s.scenes = s.scenes.map((sc, i) => fn(sc, i)); return s; };
const vfind = (r, rule) => r.findings.filter((f) => f.rule === rule);
const vopts = { ...opts, allowedTags: TAGS, registerIds: REG };

test("spoken(): tags are not words and spacing is repaired", () => {
  assert.equal(spoken("Pay it <short pause> now, <breath> not later."), "Pay it now, not later.");
  assert.equal(plainScript({ scenes: [{ narration: "A <sigh> b.", beats: [{ narration: "x <long pause> y" }] }] }).scenes[0].beats[0].narration, "x y");
});
test("tags: allowed tags do not change the score; unknown tags and bracket directions are P0", () => {
  const base = scoreScript(creditCard, vopts);
  const tagged = withNarr((sc, i) => i === 1 ? { ...sc, narration: sc.narration.replace(/\. /, ". <short pause> ") } : sc);
  assert.equal(scoreScript(tagged, vopts).score, base.score);
  const bad = withNarr((sc, i) => i === 1 ? { ...sc, narration: "<whisper> " + sc.narration + " [dramatic pause]" } : sc);
  const r = scoreScript(bad, vopts);
  assert.equal(vfind(r, "tag-unknown")[0].severity, "P0"); assert.equal(vfind(r, "stage-direction")[0].severity, "P0");
});
test("tags: adjacent tags, overuse and too many sighs are flagged", () => {
  const adj = withNarr((sc, i) => i === 1 ? { ...sc, narration: "<breath> <short pause> " + sc.narration } : sc);
  assert.equal(vfind(scoreScript(adj, vopts), "tags-adjacent").length, 1);
  const over = withNarr((sc, i) => i === 1 ? { ...sc, narration: sc.narration.split(". ").join(". <short pause> <sigh> ".replace("> <", "> x <")) } : sc);
  assert.ok(vfind(scoreScript(over, vopts), "tag-overuse").length >= 1);
});
test("delivery: unknown register flagged; all-same delivery is a P2 on long scripts", () => {
  const unk = withNarr((sc, i) => i === 0 ? { ...sc, delivery: "dramatic" } : sc);
  assert.equal(vfind(scoreScript(unk, vopts), "delivery-unknown").length, 1);
  const flat = structuredClone(creditCard); while (flat.scenes.length < 8) flat.scenes.push({ ...flat.scenes[flat.scenes.length - 1], id: `S${String(flat.scenes.length + 1).padStart(2, "0")}` });
  assert.equal(vfind(scoreScript(flat, vopts), "delivery-flat").length, 1);
  const varied = structuredClone(flat); varied.scenes.forEach((s, i) => { s.delivery = i === 0 ? "hook" : i % 2 ? "analysis" : "conversational"; });
  assert.equal(vfind(scoreScript(varied, vopts), "delivery-flat").length, 0);
});
test("source-read-aloud: reading a report or publication aloud is P1; a plain punchline is not", () => {
  const bad = withNarr((sc, i) => i === 1 ? { ...sc, narration: "That figure comes from a forecast it published in twenty twenty-five. " + sc.narration } : sc);
  assert.equal(vfind(scoreScript(bad, vopts), "source-read-aloud").length, 1);
  assert.equal(vfind(scoreScript(withNarr((sc) => sc), vopts), "source-read-aloud").length, 0);
});

// ---- dashes (read aloud as "minus") and quote matching ----
test("dash-in-narration: em dash, spaced hyphen and minus sign are P1; hyphenated words are P2; clean text is not flagged", () => {
  const bad = structuredClone(creditCard);
  bad.scenes[1].narration = "Pay it now — then wait. It costs five - six percent, so take -5 off.";
  const r = scoreScript(bad, vopts);
  assert.equal(r.findings.filter((f) => f.rule === "dash-in-narration" && f.severity === "P1").length, 1);
  const comp = structuredClone(creditCard); comp.scenes[2].narration = "This is a year-over-year change. " + comp.scenes[2].narration;
  assert.equal(scoreScript(comp, vopts).findings.filter((f) => f.rule === "hyphenated-word" && f.severity === "P2").length, 1);
  assert.equal(scoreScript(creditCard, vopts).findings.filter((f) => /dash|hyphen/.test(f.rule)).length, 0);
});
test("hyphenated number words are not flagged; digit ranges and minus signs are", () => {
  const nums = structuredClone(creditCard);
  nums.scenes[1].narration = "Twenty-one percent of the seventy-fifth group saw a thirty-six hundred dollar bill. " + nums.scenes[1].narration;
  assert.equal(scoreScript(nums, vopts).findings.filter((f) => /dash|hyphen/.test(f.rule)).length, 0);
  const range = structuredClone(creditCard);
  range.scenes[1].narration = "Most land at 5-6 percent. " + range.scenes[1].narration;
  assert.equal(scoreScript(range, vopts).findings.filter((f) => f.rule === "dash-in-narration").length, 1);
});
test("claim numbers match the source quote even when $ or thousands commas differ", () => {
  const s = structuredClone(creditCard);
  const c = { id: "CX1", text: "The median family holds $27,900 in the account.", sourceIds: ["ex"], sourceKind: "primary", dataYear: 2026, sourceQuote: "Median value 27900" };
  s.scenes[0].claims = [...(s.scenes[0].claims || []), c];
  assert.equal(scoreScript(s, opts).findings.filter((f) => f.rule === "claim-number-not-in-quote").length, 0);
  c.sourceQuote = "Median value 31,000";
  assert.equal(scoreScript(s, opts).findings.filter((f) => f.rule === "claim-number-not-in-quote").length, 1);
});
