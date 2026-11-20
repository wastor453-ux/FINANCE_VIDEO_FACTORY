# Beat design file (input to `ffx plan-compile`)

The planner turns an approved script + voice word timing into a scene plan. The **creative choices** are written once per beat in a design file;
the planner computes every frame, anchor, event, hold and transition. `ffx lint-plan --script --renderable` judges the result.

```
ffx plan-compile --script script.json --voice voice_manifest.json [--timings word_timings.json] --design beat_design.json --out scene_plan.json
ffx lint-plan scene_plan.json --script script.json --voice voice_manifest.json --renderable
```

## File
```json
{ "schema_version": "1.0", "run": "<run id>", "beats": { "S01B3": { ... }, ... } }
```
Every script beat needs an entry (a missing one is an error, never a guess). Fields per beat:

| field | meaning |
|---|---|
| `mode` | a mode listed in `config/components.json` (today: hero_number, line_chart, bar_chart, process_flow, causal_diagram, annotation_callout, action_checklist, risks_grid) |
| `purpose` | one line: what this beat must make the viewer understand |
| `title` | optional heading shown top-left (never a source line; never a number without data) |
| `content.items[]` | `{label, sub?, mark?, tone?}` for diagram/list modes. Labels come from the narration: 60% of their words must be spoken in the beat (lint). Max 8 words / 44 chars. `mark` is a phrase inside the label to highlight. `tone`: watch / stop / allow (risks_grid) |
| `cues[]` | one spoken phrase per item (or per bar / the count-up / the text reveal): the visual starts 4 frames before the first word of the first occurrence of that phrase in the beat. A phrase that is not spoken is an error |
| `markCue` | spoken phrase that triggers the highlight sweep (callout) |
| `data[]` | for charts and hero numbers: `{label, value, unit, source, asOf, claimId}`; every value must appear in the cited verified claim (lint) |

## Choosing the mode (the script's `visualIntent` is only a hint)
- A number the narrator says, with a verified claim: `hero_number` (one figure; a percentage gets a ring) or `bar_chart` (2+ values; one bar per spoken number, each rising on its own cue).
- Steps, a sequence, "A then B then C": `process_flow` (2-5 steps). Parts that lead to one result: `causal_diagram`, but only when the narrator names the result **last**.
- One idea to land, or a rule: `annotation_callout` (one short label, one highlighted phrase).
- Things to do / takeaways: `action_checklist`. Things to watch or never do: `risks_grid` (tone stop for hard limits).
- If the intent has no renderer (timeline, compare_ab, stacked_breakdown, hook_question...), pick the closest mode above from what the narrator says; do not leave it.
- Never three beats in a row with the same mode; vary.

## Rules the planner enforces
Cues keep their order; each step needs its hold (1 s, or the reading time); a late cue is moved earlier and reported as a NOTE; an anchor whose event had to move is reported as low confidence.
Camera push starts with the beat unless a long static stretch needs it. Each scene after the first starts early enough that its entry transition (clean wipe, card-to-chart zoom, shape mask in rotation) ends as the first word is cued.
Words listed in `--blocked` (timing words known to sit on pauses) become low-confidence fallback anchors.
