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
