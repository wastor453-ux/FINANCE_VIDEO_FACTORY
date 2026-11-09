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
1. **Plan**: one sentence viewer promise; choose the hook type; list every promise the hook will make (`promises`) and which scene pays each off; mark where the mid-point re-hook goes.
2. **Draft in beats** (see Structure below), writing to be heard, not read.
3. **Self-audit aloud**: read each beat as a person would say it. Mark anything stiff, staged or template-like.
4. **Rewrite whole scenes** (not phrase patches) when a scene has two or more tells.
5. **Gate**: `ffx script-score runs/<runId>/script.json` must pass (score 80+ and no P0). Fix and rerun; report the final score honestly. The owner's bar for a finished script is 85+ on the rubric in `docs/SCRIPT_RUBRIC.md`.
6. On owner approval of G2: `ffx hook-record runs/<runId>/script.json` so the next videos rotate hook types.

## Structure (script v2, from the research in the script dossier)
- **Hook type** (`script.hookType`): one of curiosity_gap, stakes, bold_claim, empathy_mirror, specific_promise, in_media_res, pattern_interrupt. Finance explainers usually fit curiosity_gap, specific_promise, empathy_mirror, bold_claim or stakes. Do not use the same type three videos in a row (the gate reads `state/hook_history.json`).
- **Beats**: every scene has `beats`, each 4 to 15 seconds of speech (`config/pipeline.json` -> `script`), one idea per beat, with `id`, `narration`, and `visualIntent` (a mode id from `config/visual_modes.json`), plus optional `emphasis`, `onScreenText` and `interrupt`. The scene `narration` must equal its beats joined together. The beats are what the scene planner animates, so a beat is something that can be shown.
- **A chart needs numbers.** A beat whose `visualIntent` is a chart mode (bar, line, donut, waterfall, compound growth, and so on) must show real numbers: either the narration contains them, or the beat has `data: {claimId}` pointing to a claim of the scene (a sourced figure or a labeled worked example). Otherwise use a diagram or a supporting mode. Decorative charts are what make a video a slideshow, and the topic-fit score counts them as support.
- **Narration adds meaning the picture cannot.** Never describe the screen ("as you can see"). Do not read on-screen text word for word.
- **Hook**: the first beat lands the promise or tension within about 12 seconds; the whole hook scene is under 45 seconds. No greeting, no topic statement, no list of contents ("you'll also get...").
- **Retention map**: something new (a number, a question or a flagged `interrupt` beat) at least every 90 seconds; a re-hook beat near the middle (`script.rehookBeat`, 35-65% of runtime); open loops paid off through the promise ledger.
- **Evidence**: every primary claim records `sourceQuote`, the source's exact line. Every number in the claim must appear in that quote. Narration must not claim more than the quote (watch "every time", "always", "everyone", "the rest").
- **Legal and liability statements** need a claim that is itself about liability or penalties.
- **Rate**: the gate times beats at `script.wpm` words per minute. Replace that default with the measured rate from the voice manifest when available.

## Spoken American voice
- **Contract everything a person would.** "That's", "don't", "it's", "I'll", "let's", "you're", "here's". Zero contractions is the clearest sign of machine-written English. Aim for 85%+ (the gate flags below 75% and fails below 50%). Never "let us" or "I shall".
- Short, common words. "Use", not "utilize". "Start", not "commence".
- Vary sentence length on purpose: some 3-6 words, most 10-20, a few long ones. Never ten sentences in the same shape.
- Talk to one person ("you"). Concrete nouns, names, numbers and small scenes beat abstractions.
- Opinion and a little personality are fine (dry humor, a real preference). Do not stage it.
- Numbers as words for TTS ("three point five percent"); clean numerals live on screen.
- **No hyphens or dashes in narration.** The voice model can read them aloud as "minus". Use a comma, an ellipsis, a `<short pause>`, or words; write compound numbers and words with spaces ("twenty one", "year over year"). No minus signs: say "take away four hundred thousand", never "five fifty minus four hundred". The gate flags dashes (`dash-in-narration`) and hyphenated words (`hyphenated-word`); the TTS tool also strips them, so the source text should already be clean.

## Hook (first 20-30 s)
Front-load the most compelling concrete thing: a number, a story beat or a tension the viewer feels. Deliver the title's promise immediately. No "hey guys", no "in this video", no announcing what you will cover. Every promise made in the hook is recorded in `promises` and paid off by a real scene.

## Spoken voice (human delivery; the gate checks these)
- **Sources go on screen, not in speech.** Put the source in the beat's `onScreenText` (for example "Source: IDC, 2025") and keep the claim with its `sourceQuote` and `sourceIds` in the scene `claims`. Narration says the number as a punchline ("Thirty-six million small businesses."), never "in a forecast published in...", "according to a report", or a publication date. Gate rule `source-read-aloud`.
- **Rhythm.** Mix 3-word statements with 20-word explanations and a short question. Uniform 10-13 word sentences read as machine-made. Gate rule `uniform-rhythm`.
- **Numbers as punchlines.** Write numbers as people say them. Put `<short pause>` before a major figure, then land it plainly; repeat it once only when it is the point of the beat.
- **Delivery per scene.** Give each scene a `delivery` register: `hook` (first scene), `analysis` (mechanics and numbers), `conversational` (examples and steps), `risk` (warnings and the disclaimer), `outro`; `irony` and `downfall` only when the story truly has them. Mostly `analysis` and `conversational`; a script where every scene shares one register scores lower.
- **Inline tags** (allowed list in `config/voice.json` -> `request.inlineTags`): `<short pause>`, `<long pause>`, `<breath>`, `<sigh>`. They are rare accents: a pause before a key number or after a rhetorical question, a `<breath>` before a long sentence, a `<sigh>` at most twice per video and only for real losses. Never two tags in a row, never in square brackets or parentheses (read aloud). The gate counts words without tags.
- Never invent facts, people or quotes to sound vivid. Examples are labeled hypothetical.

## Banned patterns (the gate checks these)
- AI vocabulary: delve, tapestry, landscape, leverage, robust, seamless, unlock, game-changer, pivotal, testament, realm, harness, crucial, streamline, journey, navigate (as metaphor).
- Staging: "here is the part that matters", "that is the whole game", "let us", "I will walk you through", "in the next ten minutes", "at the end of the day", "when it comes to".
- "Not X, but Y" and "The mistake was never X. The mistake was Y" contrasts used for weight.
- One-line punchlines after every paragraph; forced lists of three; the same two-word opener repeated.
- Ellipses (...) are allowed for a real hesitation, sparingly. Dashes and hyphens are not (see "No hyphens or dashes").
- Sweeping claims with no source ("cheapest customers in the world", "almost all of them").
- Closers that summarize or moralize. End on the next action, then the disclaimer.

## Claims, sources and freshness
- Each scene lists `claims` with `sourceIds` (official filings, BLS, FRED, central banks, regulators, original research). No source, no claim.
- Every statistic records `dataYear`. If it is two or more years old, look for a newer edition; if none, say the year out loud and set `dataYearNarrated: true`. Never say "latest" or "current" unless a claim records `dataYear` and you checked it is the newest edition.
- Mark `sourceKind: "secondary"` when the figure comes from a summary of a report; prefer the primary report, or say "as reported by".
- A figure only another creator claimed is re-verified at a primary source or cut. No "attributed" claims.
- Include the disclaimer beat; never promise returns; label hypotheticals as hypothetical.

## Numbers and timing
Target runtime 10 to 15 minutes (window 8 to 18, `video.targetMinutes` in config/pipeline.json). Pace comes from `script.wpm` (169 for Enzo, measured on a full episode, including pauses). Target length `script.targetWords`: about 1,700 to 2,500 words (10 minutes = 1,690 words, 15 minutes = 2,535 words at 169 wpm). Each scene 20-75 s and under 2,000 characters. The gate times beats at `script.wpm`.

## Faceless narrator and read-aloud checklist
The channel has no on-camera host, so the narrator has no invented personal history: no "the test I use", "this one is mine", "my clients". The narrator is still an active guide, not an encyclopedia: use conversational connectives ("Look at...", "Here is the catch...", "Now picture..."), questions and short asides. Say facts as facts about the work. Before the gate, read every scene aloud and check: (1) the hook opens with a concrete number, scene or tension, not a list of contents; (2) every "he/she" has a named person in the same scene; (3) every personal pick ("I'd start with") agrees with every other one, or there is only one; (4) any legal, liability or rule statement has a cited source; (5) no sentence says more than its source does (quote the source line beside the narration in the fact-check); (6) the order of items follows the rule the script states.

## Topic fit
Run `ffx fit-score` on the analysis before writing and again on the finished script (beats carry `visualIntent` and timing). A script that fails fit goes back to the beat plan, not to the owner as a finished script.

## Check
1. `ffx lint-script runs/<runId>/script.json` prints SCRIPT OK.
2. `ffx script-score runs/<runId>/script.json` prints PASS (it exits 1 on a P0 or a score below 80). Save its JSON next to the script as `script_score.json`.
3. Run ffx-fact-check. Record: `run-set-stage runs/<runId> script VERIFIED --note "score N"`.
The score is a screen for measurable tells. It does not replace the aloud read-through.
