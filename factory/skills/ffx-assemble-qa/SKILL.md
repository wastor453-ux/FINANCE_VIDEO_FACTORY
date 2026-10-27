---
name: ffx-assemble-qa
description: Verify the assembled master and prepare the evidence the user needs to approve it. Use after the render workflow finishes; ends at gate G5.
---

# Assemble and QA (gate G5)

The render workflow already ran `ffx assemble` (hash + per-chunk ffprobe + coverage + lossless join + exact-length audio mux) and `ffx qa-video` on the real master. Re-run locally if you need to: `node factory/bin/ffx.mjs qa-video master.mp4 --frames N --out-dir qa --plan scene_plan.json`.

## What the machine decides
Resolution, fps, decoded frame count, duration vs frames, audio present at 48 kHz, A/V drift <= 2 frames, clean full decode, no long black sections, no blank/flat sampled frames, no silence >= 6 s, integrated loudness within tolerance of target, true peak under ceiling.

## What it cannot decide, so it never says "pass" alone
Legibility, clipped or overlapping text, chart values and scales, brand and design consistency, narration/visual match, factual accuracy, editorial quality. `qa_report.json` therefore returns `needs_human` when every automatic check passes; `pass` exists only when the user has reviewed (`--human-reviewed`).

## Your job at G5
1. Report buckets separately: **passed**, **failed**, **unresolved**, **needs human**.
2. Show the contact sheet and 3 specific timestamps to scrub (a number reveal, a chart, a transition). List any frozen-video or silence flags with times.
3. Re-check on-screen numbers against `script.json` sources and as-of dates.
4. On any failure: fix the earlier stage, re-render only what changed (new job, new approval), re-verify. Do not edit the master by hand.
