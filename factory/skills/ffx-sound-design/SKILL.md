---
name: ffx-sound-design
description: Plan sound effects, music bed and ducking that match what is happening on screen. Use together with ffx-scene-plan; part of gate G3.
---

# Sound design

- Every sound has a `reason` tied to a visual event (count-up tick-roll, chart draw swell, card pop, transition whoosh, subtle impact on key stat). No sound without a reason; no ticking loops under narration.
- Hierarchy: narration first. Music bed at `musicBedDb` (default -24 dB) with ducking of at least 4 dB under speech and 150-300 ms eased ramps. One-shots never land on top of key spoken words.
- Density cap: at most 5 one-shots in any 1 s window; do not repeat the same asset twice in a row (rotate pools).
- Align hits to the frame of the visual event; a transition sound should peak one frame before the cut.
- Sources: synthesized or CC0/licence-checked assets only; record each licence in `sound_plan`.
- Tooling: `ffx mix-audio` places events and mixes; `ffx qa-video` checks loudness, silence and peaks on the final file. Sound effects are original or CC0 files stored under the run's `sfx/` folder; record each file's origin and license in `sound_plan`.
- Validate with `ffx validate sound_plan`.

## Mixing
Once the user approves the sound plan, `node factory/bin/ffx.mjs mix-audio ...` places narration and every SFX event at exact sample offsets (frame -> samples at 48 kHz), ducks the music bed under narration with a side-chain compressor (`depthDb` selects the compressor ratio, so the real depth is approximate), and loudness-normalises the result to the target in `config/pipeline.json`. Listen to it before G4; the loudness number does not tell you whether it sounds good.
