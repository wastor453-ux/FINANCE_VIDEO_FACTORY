---
name: ffx-voice
description: Generate the Enzo narration with Gemini TTS (single take or scene by scene), verify it, and produce the voice manifest. Use after the script is approved at gate G2 (G2 needs no voice sample; the voice is fixed in config).
---

# Voice

Settings come only from `config/voice.json` (model, voice id, style variants, output format). Install once: `pip install "google-genai>=2.25.0"`. The key is read from `GEMINI_API_KEY`; never print or store it.

## 1. Audition (ONLY when the owner asks to change the voice or style; not part of any gate)
`python3 factory/tools/synthesize.py sample --text "<the first 2-3 sentences of the approved hook>" --out <run>/voice_sample --variants empty,user,short`
This renders the same sentence three ways (no style, the owner's style line, a short style). Give the owner the three files and ask which to keep, and whether Koda's delivery fits a calm, authoritative, neutral-American financial narrator. The library lists Koda with an Inland Southern accent and a young influencer persona; if it does not fit by ear, propose other library voices (`ffx voices --search <name>`), do not force it with style text. Record the choice in `config/voice.json` (style variant, voice id) only after the owner agrees.

## 2. Episode
The voice is Enzo (`en-us-enzo`, temperature 0.8) from `config/voice.json`; the key is `GEMINI_API_KEY` with backup `GEMINI_API_KEY_2`, never printed. Two modes:
- **Single take (preferred for a steady voice):** `python3 factory/tools/synthesize.py episode --job tts_job.json --out <run>/voice --single-take` sends the whole script in ONE request (scenes joined with `<long pause>`), then cuts at the pauses into `S01.wav`... A cut that cannot be proven right fails with a clear error and nothing is sliced mid-word; then use per-scene mode. One style for the whole episode (registers unused). **UNVERIFIED at full length:** before the first full episode, run the 3-scene check in docs/STATUS.md. The raw master is kept (`episode_master_raw.wav`) and reused on a retry.
- **Per scene (fallback):** the same command without `--single-take`; resume-safe, each scene may use its `delivery` register.
Text is sanitized (hyphens and dashes removed) before every request. Each request has a hard wall-clock limit (120 s per scene, 600 s single take); a timeout moves to the backup key.

Job file:
Write `tts_job.json`: `{ "scenes": [ { "sceneId": "...", "text": "...", "delivery": "<the scene's delivery from script.json, if any>" } ] }` (the style comes from `config/voice.json`: a scene with `delivery` gets prefix + that register, a scene without gets the approved documentary style; an explicit `style` on a scene overrides both), then `python3 factory/tools/synthesize.py episode --job tts_job.json --out <run>/voice`. The tool refuses text that contains bracketed stage directions or unsupported tags, splits nothing for you (keep each scene under `maxCharsPerRequest`), retries transient errors, rejects silent or too-short clips, writes one WAV per scene and `voice_manifest.json` (`approved: false`).

## Writing narration text for this model
- Plain spoken English with contractions and natural rhythm. Numbers are written as people say them.
- Pauses and breaths: commas, dashes, ellipses, or the tags in `request.inlineTags` (`<short pause>`, `<long pause>`, `<breath>`, `<sigh>`). `<breath>` and `<sigh>` and the per-scene registers are UNVERIFIED by ear: after the first episode that uses them, give the owner a short clip of a tagged sentence and a scene per register to confirm; remove anything the model reads aloud or that sounds wrong. Emphasis: capitalise the word, sparingly.
- No `[pause]`, no `(whispering)`, no sound-effect tags: the text is read verbatim.

## 3. Verify (do not skip)
`ffx validate voice_manifest <run>/voice/voice_manifest.json`; listen to at least the hook, one number-heavy scene and the close; check pacing is 140-200 wpm (Enzo about 180) and report the measured rate so `script.wpm` can be updated; confirm every scene file decodes and none is silent. Set `approved: true` only after the owner has listened to the hook, a number-heavy scene and the close. Audio is 24 kHz mono; `ffx mix-audio` resamples to 48 kHz.
