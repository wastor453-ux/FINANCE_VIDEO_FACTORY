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
- **motionFit**: for each beat, which visual mode in `config/visual_modes.json` would show it. Report the share of beats that can be shown as motion graphics; below about 70% the topic does not suit us and the owner is told.

Keep the same topic and viewer promise; do not decide wording yet. Never copy sentences; paraphrase ideas only.
