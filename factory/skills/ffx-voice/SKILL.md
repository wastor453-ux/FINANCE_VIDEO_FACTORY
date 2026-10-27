---
name: ffx-voice
description: Generate the Koda narration with Gemini TTS scene by scene, verify it, and produce the voice manifest. Use after the script passes fact-check; the sample is part of gate G2.
---

# Voice

Settings come only from `config/voice.json` (model, voice id, style variants, output format). Install once: `pip install "google-genai>=2.25.0"`. The key is read from `GEMINI_API_KEY`; never print or store it.

## 1. Audition first (cost: a few seconds of audio)
`python3 factory/tools/synthesize.py sample --text "<the first 2-3 sentences of the approved hook>" --out <run>/voice_sample --variants empty,user,short`
This renders the same sentence three ways (no style, the owner's style line, a short style). Give the owner the three files and ask which to keep, and whether Koda's delivery fits a calm, authoritative, neutral-American financial narrator. The library lists Koda with an Inland Southern accent and a young influencer persona; if it does not fit by ear, propose other library voices (`ffx voices --search <name>`), do not force it with style text. Record the choice in `config/voice.json` (style variant, voice id) only after the owner agrees.

## 2. Episode
Write `tts_job.json`: `{ "scenes": [ { "sceneId": "...", "text": "..." } ], "style": "<chosen string>" }`, then `python3 factory/tools/synthesize.py episode --job tts_job.json --out <run>/voice`. The tool refuses text that contains bracketed stage directions or unsupported tags, splits nothing for you (keep each scene under `maxCharsPerRequest`), retries transient errors, rejects silent or too-short clips, writes one WAV per scene and `voice_manifest.json` (`approved: false`).

## Writing narration text for this model
- Plain spoken English with contractions and natural rhythm. Numbers are written as people say them.
- Pauses: commas, dashes, ellipses, or `<short pause>` / `<long pause>` where the script marks a beat. Emphasis: capitalise the word, sparingly.
- No `[pause]`, no `(whispering)`, no sound-effect tags: the text is read verbatim.

## 3. Verify (do not skip)
`ffx validate voice_manifest <run>/voice/voice_manifest.json`; listen to at least the hook, one number-heavy scene and the close; check pacing is 110-190 wpm; confirm every scene file decodes and none is silent. Set `approved: true` only after the owner approves the sample and the full read (gate G2). Audio is 24 kHz mono; `ffx mix-audio` resamples to 48 kHz.
