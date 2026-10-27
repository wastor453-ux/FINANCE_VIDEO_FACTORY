---
name: ffx-script
description: Write an original, human-sounding American-English voiceover script with a professional hook from the approved analysis. Use after ffx-analyze; ends at gate G2 with ffx-voice.
---

# Script

## Contract
Same core topic and viewer promise as the source, but our own structure, examples, wording and visuals-friendly pacing. It must not be a transcript copy and must not drift into an unrelated topic. Record how it differs in `originalityNote`.

## Craft rules
- Hook in the first 20 s: one concrete tension or number, then the promise. No "hey guys", no "in this video".
- Spoken English: contractions, short sentences, one idea each, natural transitions. Read it aloud; cut anything you would not say.
- Structure follows the story system in the reference sheets: hook, real problem, define, mechanism, worked example, data, scenarios, risks, action steps, close.
- Numbers in narration are written as words for TTS ("three point five percent"); clean numerals live only on screen.
- Target runtime from config (8-14 min; ~150 words per minute); each scene is 15-60 s.
- Include the disclaimer beat; never promise returns; label hypotheticals as hypothetical.
- Each scene lists `claims`, each with `sourceIds` pointing to `sources` (official filings, BLS, FRED, central banks, regulators, original research). No source, no claim.

## Check
`ffx lint-script runs/<week>/script.json` must print SCRIPT OK. Then run ffx-fact-check.
