---
name: ffx-scene-plan
description: Turn approved narration and exact scene durations into a frame-accurate motion-graphics plan using the visual mode vocabulary. Use after ffx-voice; ends at gate G3 with ffx-sound-design.
---

# Scene plan

Input: script.json + voice_manifest.json. Output: `scene_plan.json` (schema `scene_plan`) at 1920x1080, 30 fps.

## Method
1. Scene frames come from voice durations: `startFrame = round(startMs*fps/1000)`; scenes are contiguous; `totalFrames` = last endFrame (a short outro may exceed narration by <= 0.5 s).
2. For every scene choose ONE mode from `factory/config/visual_modes.json` by what the narration needs to explain (trend -> line_chart, A vs B -> compare_ab, mechanism -> causal_diagram, allocation -> donut_allocation, key stat -> hero_number, ...). Write a `purpose` sentence that says what the viewer should understand. No decoration for its own sake.
3. Variety rule: never three identical modes in a row; vary rhythm between dense (data) and breathing (typography/imagery) scenes.
4. Data: every on-screen number is a `dataPoint` with `source` + `asOf`, or `illustrative: true` with assumptions listed. The schema rejects anything else.
5. Events: place count-ups, line draw-ons, highlights on the frame where the narrated word is spoken. Until the alignment tool exists use scene-relative estimates from word position and mark them `estimated`; replace with measured timing after alignment.
6. Transitions: use the grammar from the motion reference sheet (diagram morph for related concepts, clean wipe for new sections, card-to-chart zoom for detail). Typical durations 0.3-1.0 s, eased, no whip pans.
7. Text: max 90 characters per line, readable at phone size, inside the 80 px safe area.
8. The thumbnail character never appears (`usesCharacter` must be false or absent).

Validate: `ffx lint-plan scene_plan.json --voice voice_manifest.json` must print PLAN OK.
