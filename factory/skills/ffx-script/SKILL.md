---
name: ffx-script
description: Write an original, human-sounding American-English voiceover script with a professional hook from the approved analysis, then pass the script-score quality gate. Use after ffx-analyze; ends at gate G2 with ffx-voice.
---

# Script

## Where these rules come from
Built after reading the strongest public writing skills, not invented from scratch: `blader/humanizer` (26 AI-writing patterns; draft, self-audit, rewrite), `conorbronsdon/avoid-ai-writing` (vocabulary tiers, rewrite-vs-patch thresholds), `timolabs-ai/claude-humanize-skill` (sentence shape and paragraph jobs), and `thecraighewitt/skills` hook-writing (front-load the most compelling thing; the hook must deliver the title's promise). Our additions are the spoken-American rules and the promise/freshness/attribution checks below, which a voiceover needs and a written article does not. Re-read those repos when upgrading this skill.

## Contract
Same core topic and viewer promise as the source, but our own structure, examples, wording and pacing. Never a transcript copy. Record how it differs in `originalityNote`.

## Originality (owner policy, 2026-10-31)
Source videos are research only. The finished video is entirely ours: our structure, examples, framework, wording and pacing. **Never name, credit, quote or link the creators or videos we researched, and never use a video as a source.** Ideas are free to share, but do not mirror the source's list or order; reorder by our own logic, drop weak items, add things the source lacks. A figure that only a creator claimed is either re-verified at a primary source or cut. The gate fails any script that names a researched creator or cites a video.

## Process (always, in this order)
1. **Plan**: one sentence viewer promise; list every promise the hook will make (`promises`), and decide which scene pays each off.
2. **Draft** by scene, writing to be heard, not read.
3. **Self-audit aloud**: read each scene as a person would say it. Mark anything stiff, staged or template-like.
4. **Rewrite whole scenes** (not phrase patches) when a scene has two or more tells.
5. **Gate**: `ffx script-score runs/<runId>/script.json` must pass (score 80+ and no P0). Fix and rerun; report the final score honestly.

## Spoken American voice
- **Contract everything a person would.** "That's", "don't", "it's", "I'll", "let's", "you're", "here's". Zero contractions is the clearest sign of machine-written English. Aim for 80%+. Never "let us" or "I shall".
- Short, common words. "Use", not "utilize". "Start", not "commence".
- Vary sentence length on purpose: some 3-6 words, most 10-20, a few long ones. Never ten sentences in the same shape.
- Talk to one person ("you"). Concrete nouns, names, numbers and small scenes beat abstractions.
- Opinion and a little personality are fine (dry humor, a real preference). Do not stage it.
- Numbers as words for TTS ("three point five percent"); clean numerals live on screen.

## Hook (first 20-30 s)
Front-load the most compelling concrete thing: a number, a story beat or a tension the viewer feels. Deliver the title's promise immediately. No "hey guys", no "in this video", no announcing what you will cover. Every promise made in the hook is recorded in `promises` and paid off by a real scene.

## Banned patterns (the gate checks these)
- AI vocabulary: delve, tapestry, landscape, leverage, robust, seamless, unlock, game-changer, pivotal, testament, realm, harness, crucial, streamline, journey, navigate (as metaphor).
- Staging: "here is the part that matters", "that is the whole game", "let us", "I will walk you through", "in the next ten minutes", "at the end of the day", "when it comes to".
- "Not X, but Y" and "The mistake was never X. The mistake was Y" contrasts used for weight.
- One-line punchlines after every paragraph; forced lists of three; the same two-word opener repeated.
- Dashes. Use plain sentences.
- Sweeping claims with no source ("cheapest customers in the world", "almost all of them").
- Closers that summarize or moralize. End on the next action, then the disclaimer.

## Claims, sources and freshness
- Each scene lists `claims` with `sourceIds` (official filings, BLS, FRED, central banks, regulators, original research). No source, no claim.
- Every statistic records `dataYear`. If it is two or more years old, look for a newer edition; if none, say the year out loud and set `dataYearNarrated: true`. Never say "latest" or "current" unless a claim records `dataYear` and you checked it is the newest edition.
- Mark `sourceKind: "secondary"` when the figure comes from a summary of a report; prefer the primary report, or say "as reported by".
- A figure only another creator claimed is re-verified at a primary source or cut. No "attributed" claims.
- Include the disclaimer beat; never promise returns; label hypotheticals as hypothetical.

## Numbers and timing
Target runtime from config (8-14 min, about 150 words per minute); each scene 15-60 s; one scene under 1,800 characters (TTS limit).

## Faceless narrator and read-aloud checklist
The channel has no on-camera host, so the narrator has no personal history: no "the test I use", "this one is mine", "my clients". Say it as a fact about the work. Before the gate, read every scene aloud and check: (1) the hook opens with a concrete number, scene or tension, not a list of contents; (2) every "he/she" has a named person in the same scene; (3) every personal pick ("I'd start with") agrees with every other one, or there is only one; (4) any legal, liability or rule statement has a cited source; (5) no sentence says more than its source does (quote the source line beside the narration in the fact-check); (6) the order of items follows the rule the script states.

## Topic fit
Only scripts whose beats map to our visual modes (`config/visual_modes.json`: charts, comparisons, flows, numbers, timelines) go ahead. If fewer than about 70% of beats can be shown as motion graphics, stop at G1/G2 and report it instead of writing around it.

## Check
1. `ffx lint-script runs/<runId>/script.json` prints SCRIPT OK.
2. `ffx script-score runs/<runId>/script.json` prints PASS (it exits 1 on a P0 or a score below 80). Save its JSON next to the script as `script_score.json`.
3. Run ffx-fact-check. Record: `run-set-stage runs/<runId> script VERIFIED --note "score N"`.
The score is a screen for measurable tells. It does not replace the aloud read-through.
