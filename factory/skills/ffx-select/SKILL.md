---
name: ffx-select
description: Compare newly discovered videos fairly and recommend one evidence-backed winner. Use after ffx-discover; ends at approval gate G1.
---

# Select

- Command: `ffx select --in discovery.json --seen state/seen_videos.json --out selection.json`.
- Logic (see lib/select.mjs): eligible = long-form (>= 6 min), not live, 24 h to 10 d old, not seen before. Score = outlier vs the channel's own recent baseline (weight 0.6), engagement (0.25), absolute reach (0.15), all on a log scale. Small channels can therefore beat big ones.
- Present to the user: winner, 3 runners-up, the metrics that explain the pick, and any caveats (hidden likes, fallback baselines, failed channels).
- G1: wait for approval or a manual pick. Only after approval run `ffx mark-seen --selection selection.json --seen state/seen_videos.json`.
- Also check topic fit: skip a winner whose topic is breaking news that will be stale, or which needs claims we cannot source; offer the first runner-up instead.
