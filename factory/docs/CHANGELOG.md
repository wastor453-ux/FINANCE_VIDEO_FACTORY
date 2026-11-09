# Changelog

## 2026-11-05
- Hosted transcript: requests and REQUIRES the language (`--lang`, default en). Supadata once returned Bengali captions when none was asked for; a wrong-language result is now refused, never written as an English transcript.
- `script.wpm` 169 (measured on a full 12-scene episode: 1,766 words in 628.5 s) replaces 180 (one short clip), and `script.targetWords` is 1,700 to 2,500 (10 to 15 minutes). A 180 wpm plan made the script about 7% too short.

## 2026-11-04b
- Script gate: hyphenated number words ("twenty-one") and ordinals are no longer flagged (the TTS tool turns them into two words safely); digit ranges like "5-6" are now P1 `dash-in-narration` (likely spoken as "minus"). Found when the live W45 script lost 8 points to harmless number words.

## 2026-11-04 (clean release, merges the AI Studio update of 2026-11-03)
- Voice: Enzo (`en-us-enzo`), temperature 0.8, podcaster-style identity. Koda archived. Temperature is sent only when `request.sendTemperature` is true (unverified field).
- TTS tool: removes hyphens and dashes before every request ("minus" bug); single-take mode (`--single-take`) with proven cuts (longest pauses, checked against the word share; an untrusted cut fails loudly instead of slicing mid-word); resume (valid clips and the raw master are never paid for twice); hard wall-clock limit per request with backup-key failover (120 s per scene, 600 s single take).
- Script gate: new rules `dash-in-narration` (P1) and `hyphenated-word` (P2); claim numbers match their source quote ignoring `$` and thousands commas (fixes the false mismatch at the validator, quotes stay exact).
- Script skill: 10 to 15 minute target, 1,750 to 1,900 words, 180 wpm, 85% contractions, no hyphens or dashes, conversational arithmetic.
- Transcript: hosted Supadata connector (`hosted_transcript.py`, `TRANSCRIPT_API_KEY`) is the first source; Gemini video understanding is the fallback. Doctor lists the key.
- Discovery: 30 uploads per channel (Shorts no longer crowd out long-form uploads).
- Config: `script.wpm` 180, `script.targetWords`, `video.targetMinutes` 8 to 18 (target 10 to 15).
- Housekeeping: test key replaced by an obviously fake value; voice-lab experiment tools moved out of the production tree; STATUS.md rewritten.

## Patch 19 (style packs)
- The channel look is now DATA: `config/styles/<id>/` (style.json + background assets), built from the owner's reference boards by `tools/style_pack.py` (extract: numeric sampling with provenance; bake: background tiles; build: roles). `lib/style.mjs` loads and validates a pack (`ffx style-check <dir>`).
- Removed the owner palette that patch 18 had typed into `lib/theme.mjs`; the theme generator is now an optional generated-family tool only.
- New test fails if any colour literal appears in `src/` or in the pack loader.
- Known limits: the six backgrounds are cut from 505x195 px board tiles (approximate, orbs/data tiles slightly stretched); type family is identified by eye (UNVERIFIED).

## Patch 20 — scene plan v2 + motion vocabulary + plan lint
- `config/motion_recipes.json`: 25 typed recipes (duration from the style pack or vocabulary, hold, heavy, primary-capable), limits, and all 21 visual modes mapped to allowed recipes and data shape.
- `schemas/scene_plan_v2.schema.json`: scenes > beats > events, strict fields, word anchors with confidence.
- `lib/plan-v2.mjs` `lintPlanV2`: contiguity, vocabulary, durations, move cap, easing, holds and read time, heavy overlap, concurrency, dead air, anchors (lead frames), number-to-data match, repetition, style pack, optional voice/script cross-checks.
- `ffx lint-plan` selects v2 by `schema_version "2.0"` (v1 unchanged); `--script`, `--style` flags.
- Tests: `plan_v2.test.mjs` (valid fixture + one mutation test per rule).

## Patch 21 — first components (hero number, KPI card) + motion math
- `src/motion/math.mjs`: pure frame math (pack cubic-bezier easing, progress, envelope, count-up, number format).
- `src/style/StyleContext.tsx`: pack -> look (colours, geometry scaled to the frame, fonts, card). No colour literals.
- `src/components/`: `common.tsx` (Card, Label, Delta with triangle + sign, SourceTag with illustrative label), `HeroNumber.tsx`, `KpiCard.tsx` (count-up and sparkline draw as one move), `BeatView.tsx` (mode -> component).
- `BeatPreview` composition (pack + beat as input props); `tools/beat_props.mjs` builds the props.
- dataPoint gains optional `delta` and `series` (both schemas).
- Tests: motion math, fixture beats pass v2 lint, beat_props.

## Patch 22 — premium staged hero scene (replaces the flat card components)
- `src/components/HeroScene.tsx`: hero_number as a staged 3D scene (headline figure, tilted glass chart panel, floating source tile, parallax background, slow camera push). Driven by count_up / pill_in / camera_push events; frame-pure.
- Style pack gains a `scene` section (perspective, tilt, layer depth, camera push, parallax, glass spec, stagger) with limits validated by style-check; authored from the sample videos, not measured.
- (Correction: the font code was NOT in patch 22; it shipped in patch 22b.)
- BeatView routes hero_number to HeroScene; fixtures gain a camera_push event; first-version HeroNumber/KpiCard remain only for reference (KpiCard exports smoothPath).

## Patch 22b — fonts actually bundled
- `src/style/fonts.ts` imports the @fontsource css files (Plus Jakarta Sans 500-800, Inter 400-700, Playfair, Space Grotesk); `StyleProvider` holds each frame until the faces load and fails the render if a family is not bundled or a face loads no file (no reliance on `document.fonts.check`, which is true when nothing matches).
- Found by Muse's read-only diagnosis: patch 22 had no fontsource import, so frames used the fallback font.
- Test `fonts.test.mjs` keeps fonts.ts, package.json and the pack's families consistent.

## Patch 23 — whole-plan render path (same code for local checks and GitHub)
- `src/Video.tsx` + `Video` composition: renders a v2 plan (background, one `<Sequence>` per beat) from a props file; length comes from the plan.
- `tools/plan_props.mjs`: builds that props file (plan + style pack + only the backgrounds used, embedded), deterministic; the same file is the render job's `propsFile`.
- `config/components.json`: modes with a verified renderer (today: hero_number); `BeatView` renders only these; `ffx lint-plan --renderable` rejects plans using any other mode.
- Verified in my harness: Video via plan props renders pixel-identical to the BeatPreview path.
- No render speed is stored anywhere; the first real GitHub run is the measurement.

## Patch 24 — premium line chart (mode line_chart)
- `src/motion/chart.mjs`: pure axis/scale geometry (nice ticks, domain, plot points, compact labels) with tests.
- `src/components/LineScene.tsx`: tilted glass panel, grid and labels (axes_in), drawn line with fill and end marker (line_draw), end-value callout (pill_in), camera push; data labels from the plan, unit shown once.
- `config/components.json` now lists line_chart; style pack scene gains `chartTiltScale` (charts tilt less than the hero so labels stay readable).
- Fixtures `beat_line.json`, `plan_v2_line_only.json` (lint-clean, renderable).

## Patch 25 — premium bar chart + polish
- `src/components/BarScene.tsx` (mode bar_chart): tilted glass panel, rounded-top bars in series colours by slot, staggered rise inside one bar_rise event, value labels follow each bar, source/illustrative tile on legend_in.
- `chart.mjs`: barDomain, barSlots, roundedTopRect (tested).
- LineScene: the fill under the line now has a feathered leading edge (mask) instead of a hard cut.
- Fonts: Latin subsets only (smaller bundle, faster runner startup); fonts test updated.
- components.json lists bar_chart; fixtures `beat_bar.json`, `plan_v2_bar_only.json`.
