---
name: ffx-analyze
description: Deeply analyze the source transcript: hook, structure, promise, argument, pacing, evidence, weaknesses. Use after ffx-transcript; produces the brief for the script.
---

# Analyze

Produce `analysis.json` (schema `analysis`). Cover:
- **coreTopic / viewerPromise**: what the viewer was promised in the first 30 s and whether it was delivered.
- **hook**: technique (curiosity gap, shocking number, story, contrarian claim) and first-seconds pattern.
- **structure**: ordered beats with purpose and approximate share of runtime.
- **corePoints**: the 3-8 ideas that carry the video.
- **claimsToVerify**: every figure or factual claim made, because we will not trust the source blindly.
- **weaknesses**: vague claims, missing evidence, filler, weak close.
- **improvementPlan**: concrete ways our version is stronger (clearer mechanism, worked example, honest risks, better visual explanation).

- **promiseLedger**: every promise the source makes (in title, thumbnail text and hook) and whether and where it pays off. Our script must not repeat an unpaid promise.
- **voiceNotes**: how the speaker actually talks (contractions, rhythm, humor, asides) so our script can sound human without copying lines.
- **freshness**: the date of the source video and which of its facts or figures could be out of date today.
- **originalityPlan**: which of the source's ideas we keep, reorder, drop, or replace with our own, so the script does not mirror the source's list in its order. The source and its creator are never named or credited in our script.
- **motionFit**: `{share, beats:[{beat, mode, seconds}]}`: for each beat of the source idea, the visual mode in `config/visual_modes.json` that would show it and its approximate seconds. Then run `ffx fit-score runs/<runId>/analysis.json`. The score is the share of runtime shown by real charts and diagrams (supporting cards count 0.3) and needs at least two story types. If it fails, do not write the script: report the reasons to the owner. If the topic is a list or a screen-recording demo, look for an angle our modes can show (one comparison with numbers, a process flow). If none exists, the run is skipped and the next best channel is considered (owner decision 2026-11-01).

Keep the same topic and viewer promise; do not decide wording yet. Never copy sentences; paraphrase ideas only.

## Story analysis (optional fields, research only)
Besides facts, record why the source holds attention, so our own script has tension: `beliefShift` (what the viewer wrongly believes at the start and what they believe at the end), `curiosityLoops` (questions planted early and answered later, with where), and `friction` (the real obstacle, risk or failure rate; honest friction builds trust). These guide our structure; the script never copies the source's examples or wording. Propose a motion graphic only where numbers or a comparison explain the point better than words; a beat that is simply a spoken statement stays without a chart.
