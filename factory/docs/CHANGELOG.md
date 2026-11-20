# Changelog

## Patch 36 (style kits + colour roles)
- Style kits (`config/kits/*.json`, `lib/kits.mjs`): a kit is a validated overlay on the base style pack (lead colour order, background, tilt, corner radius, motion feel). Five kits: pale-glass (identity), mint-fresh, lavender-calm, crisp-blue, deep-focus. Every colour still comes from the base pack's boards; a kit passes all pack gates (contrast, motion limits, provenance, backgrounds).
- Art director step one: `chooseKit` picks the kit from the design file's brief (topic, mood) with locks, bans and a penalty for repeating the last video's kit; reason logged. `plan-compile --kit <id|auto>` writes `style.packId` and a style decision into `<out>.decisions.json`; `lint-plan` and `plan_props.mjs` resolve a kit by id. `ffx kit-check` validates kits and refuses two identical ones.
- Colour roles (bug found by rendering kits): the line-chart pill and the step chips used fixed series slots with white text, so a kit that reordered series gave pale pills with white text. Text on a fill is now `textOn()` (ink or surface, whichever reads better over the whole fill) and emphasis colours use `strongestSeries()`. A test fails if any component uses `color: c.surface`, a fixed `S[5]`, or a fixed check-mark colour, and sweeps every kit for text contrast.
- Not yet: dark and cream kits, background recipes (the ChatGPT handoff adoption plan, steps B onward).

## Patch 35 (second test video + line chart planner rule)
- Found by the second video: the planner had no rule for `line_chart`, so a renderable mode could not be planned. Added: axes_in, then line_draw from its cue (after the axes), then the end-value pill when there is room.
- `tests/fixtures/pay_b/` (script, voice, timings, design): a different topic and tone (surprise repair, 24% card, order of steps) that uses all eight renderable modes. Numbers are invented and word timing is synthetic (see `_note`). It is test data only.
- `tests/fixture_b.test.mjs`: every general rule must hold for BOTH videos (compile, schema, lint, determinism, variety, no look dominates), and a guard fails if a renderable mode cannot be planned.
- Known and reported, not hidden: with fast narration some events start a few frames after their word (sequential steps cannot overlap), so lint warns about low-confidence anchors (27% / 20% on this fixture, limit 15%). Warnings, not errors.

## Patch 34 (4 new layouts, step 3 of PRODUCTION_SYSTEM_V2 begins)
- DiagramScene variants, chosen by the art director from the registry (beat.variant): process_flow `default` (cards in a row), `vertical` (steps on a numbered rail), `chevron` (joined strip, 3-5 items); annotation_callout `default` (quote card), `banner` (full-width band), `spotlight` (accent block + card). Same events, same timing; only the drawing differs.
- Registry `fits.minItems/maxItems` checked against content items by the selector and by lint.
- Coverage now: hero_number 5, process_flow 3, annotation_callout 3; still below 3: line_chart, bar_chart, causal_diagram, action_checklist, risks_grid.
- Compiling S01-S03 now spreads the looks (banner/spotlight/vertical/chevron appear); stills checked in the harness, real-Remotion stills to be checked by Muse.

## Patch 33 (variant registry + art director, step 1 of PRODUCTION_SYSTEM_V2)
- `config/registry/variants.json`: every layout variant of every renderable mode is a registry entry (id, mode, status verified/draft, fits, auto rule, mood, density, cost). The five hero variants moved here from `motion_recipes.json`; other modes have one `default` entry each, so coverage reports them as below the target of 3.
- `lib/registry.mjs`: `validateRegistry`, `chooseVariant` (art director step two: hard fit, mood match, variety, no repeat in a row, share budget, seeded tie-break, reason logged), `coverage`.
- Planner uses the registry; `plan-compile` also writes `<out>.decisions.json` (one decision with reason per beat). Design file may carry `seed` and `brief {mood, shareBudget}`; `variant` in a beat still locks a choice.
- Lint: variants come from the registry; a draft variant is rejected in production plans.
- `ffx registry-check`: validates the registry against visual modes and components, prints coverage (LOW is a report, not a failure).
- Output of the S01-S03 compile is unchanged by this patch (same variants as patch 32).

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

## Patch 27 — QA report for silent renders (found by the first GitHub test render)
- `qa-video --no-audio` wrote no `audioReview`, so the report failed its own schema and the workflow's assemble job failed after a correct render. It now records `audioReview: {skipped: true, reason}` and adds an `audio_not_checked` item for the human review. New test runs the CLI exactly as the workflow does.
- `.gitignore` gains `build/`, `__pycache__/`, `*.pyc`.

## Patch 28 - scene transitions (clean_wipe, card_to_chart_zoom, shape_mask)
- `src/motion/transition.mjs`: pure transition styles + `extendBeat` (outgoing beat stays on screen until the transition ends).
- `src/Video.tsx`: beats wrapped in layers that apply outgoing/incoming style inside the transition window (pack ease-in-out).
- `config/components.json` lists renderable `transitions`; `ffx lint-plan --renderable` rejects others (diagram_morph needs shared elements, not supported).
- Lint: transition must start at the beat's startFrame, end inside its beat, not on the first beat, and last within the style pack's duration range.
- Demo plan now uses card_to_chart_zoom (D2) and clean_wipe (D3). Tests: 194 node + 53 python.

## Patch 29 - diagram scenes (process_flow, causal_diagram, annotation_callout)
- `src/components/DiagramScene.tsx` + `stage.tsx` (shared stage: parallax glow, tilt, camera push). One component, three modes; registered in `config/components.json`.
- Content lives in `beat.content = { headline?, items: [{label, sub?, mark?}] }` (schema + `config/motion_recipes.json` modes.*.content min/max). Each item can appear on its own event (`params.item`) so steps land on the word that names them; a single event staggers all items.
- Lint: item count per mode, label length, mark inside label, per-item events cover every item once and in order, and with `--script` every label must be traceable to the beat's narration (60% of its words spoken) so nothing is invented on screen.
- Callout: primary event `text_reveal_line` (word-by-word reveal), `callout_in` card, `highlight` sweep.
- Fix: skills_cli retention test no longer depends on today's date.
- New fixtures beat_flow / beat_causal / beat_callout (from Dan Martell beats S02B2, S04B2, S04B5). Tests: 198 node + 53 python.

## Patch 29b - Root fixes found by real Remotion
- `BeatPreview` length now comes from the beat (`beat.endFrame`) instead of a fixed 180 frames (beats longer than 6 s could not be stilled at their last frames).
- `Video` `calculateMetadata` handles a null plan, so `npx remotion compositions` works. Regression test reads Root.tsx. Tests: 199 node + 53 python.

## Patch 30 - checklist and risk grid (action_checklist, risks_grid)
- `src/components/ListScene.tsx`: action_checklist (one tilted glass panel, rows slide in, check mark draws on each item's cue) and risks_grid (2-4 cards; icon carries meaning: eye = watch, bar = stop, check = allow; colour is never the only signal).
- Content: `beat.content.items[{label, sub?, tone?}]` (tone: watch | stop | allow); per-item `checklist_build` events with `params.item` and `params.words`.
- Front cards in DiagramScene/ListScene are now near-opaque (`useGlass().solid`): the back plate no longer shows through as a lighter rectangle (found in Muse's real stills).
- No `timeline` component: in the Dan Martell script the "timeline" beats are not timelines (brief contents, a book citation); the planner should choose another mode from the content.
- Tests: registry guard (every renderable mode has an implementation and a fixture). 202 node + 53 python.

## Patch 31 - planner (script + word timing + beat design -> scene plan v2)
- `lib/planner.mjs` + `ffx plan-compile`: aligns each beat's narration to the word timing, finds each cue phrase in the spoken words, builds events (process_flow, causal_diagram, callout, checklist, risks_grid, bar_chart per bar, hero_number), holds, camera push placement, scene boundaries that finish the entry transition at the first cue, and rotating entry transitions. Deterministic; errors instead of guessing (missing design, unspoken cue, word mismatch, beat too short).
- Design file (`docs/BEAT_DESIGN.md`) carries the creative choices; fixtures `tests/fixtures/dan/*_s01_s03.json` are the real Dan Martell run S01-S03 (20 beats) and compile to a plan with 0 lint errors (`--script --renderable`).
- `BarScene`: one `bar_rise` event per bar (`params.item`), so each bar rises when its number is spoken; lint checks coverage and order. Axes appear with the beat.
- `HeroScene`: without a series it no longer shows an empty chart panel: percentages get a ring gauge of the same value, other figures stand alone, centred.
- Anchors of events moved away from their word are reported low-confidence/fallback instead of claiming a match.
- Tests: planner.test.mjs (7). 210 node + 53 python.

## Patch 32 - source tile optional, percentage forms, layout variants (first step)
- `scene.sourceTag` in the style pack ("off" by default): no "Source: ..." tile under figures and charts unless the pack or a data point (`showSource`) turns it on. Sources belong in the video description.
- `beat.variant` + `modes.<mode>.variants` in motion_recipes.json (allowed, needsPercent, needsSeries, rotate). hero_number now has panel (with a series), number, ring, waffle (10x10 icon array), bar. Lint checks the variant fits the data; the planner rotates a mode's variants so neighbouring beats differ, unless the design names one.
- Tests: 212 node + 53 python.

## Patch 37 - dark navy and warm cream kits, background recipes
- New kits `deep-navy` and `warm-cream`; colours sampled from the pixels of board R1 (`config/styles/boards/R1_colour_expansion.png`), series stroke/text derived to meet contrast.
- Background recipes: `config/backgrounds/recipes.json` (12 topic atmospheres from palette tokens), `tools/render_bg.py` renders deterministic 1920x1080 PNGs into `config/kits/assets/`; kits list `background.recipes` and get `background.items`.
- `lib/kits.mjs`: kit background items override the base pack's; kit-check accepts recipe defaults.
- New test `tests/test_kit_provenance.py` (python3 -m unittest tests.test_kit_provenance): sampled colours match the board, recipe PNGs are current, ink contrast on backgrounds >= 7.

## Patch 38 - life layer (continuous camera)
- `src/motion/life.mjs`: one virtual camera for the whole video (not per beat): seeded keys per beat (push in on hero/callout/line/ring beats, gentle pull on others), Catmull-Rom path that never stops at a key, tiny handheld wobble, background that follows at a fraction plus slow drift. Speed limiter shrinks moves (never timing) if a plan would exceed limits.
- Pack: `scene.life` in owner-pale-glass (authored) with limits; kits scale it with `scene.life.amp` (deep-focus 0.7, lavender 0.8, cream 0.85, crisp 1.25). Pack gates check sizes and background over-scale.
- `src/Video.tsx`: background layer + camera layer wrap all beats; transitions unchanged.
- Motion gate: `ffx motion-check <plan>` and inside `lint-plan` (too fast, or dead stretch under the minimum average speed over 3 s).
- Tests: `tests/life.test.mjs` (determinism, continuity at beat cuts, every kit passes, gate catches dead and too-fast, bad life section rejected). 241 JS tests.

## Patch 39 - no empty screens
- Found in the real GitHub clip (patch 38): a beat whose first visible element waits for a late spoken cue left about 0.9 s of blank background. Planner now keeps the previous beat up and moves the cut to just before that element (events, holds and scene/transition frames updated, beats stay contiguous); a note says what moved.
- New lint error in `lint-plan`: a beat may not start empty for more than `scene.life.limits.maxEmptySec` (0.6 s in the pack).
- Camera speed limiter budgets more for the handheld wobble (a kit at amp 1.25 measured 39 px/s against the 38 limit).
- Test added to `tests/life.test.mjs`. 242 JS tests.

## Patch 40 - life inside the scene
- Cards float: `useGlass` (stage.tsx) adds the CSS `translate` property per layer, so no scene component changed; back plates move against the front card for depth. Glass sheen sweeps once per beat (`scene.life.sheen`), colour from the surface (light kits) or ink (dark kits).
- Camera pushes toward the beat's main item: key origin from `scene.life.focus` per mode, interpolated so it never jumps.
- Pack gates: float size/period and sheen limits; kits scale float with `amp`. New test for origin range, float within limits, sheen window. 243 JS tests.
