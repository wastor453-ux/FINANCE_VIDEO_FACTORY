# Status (rewritten 2026-11-04)

What is built, what is only assumed, and what is still missing. Update this file whenever a stage changes.

## Built and tested (offline: 106 JS tests, 39 Python tests against fake clients)
| Stage | Skill / tool | State |
|---|---|---|
| 0 Doctor | `ffx doctor [--online --live]` | Live-verified: YouTube key, Gemini key, TTS model, backup keys |
| 1 Discover | `ffx discover` (30 uploads per channel, key failover) | Live-verified |
| 2 Select | `ffx select` (channel-baseline outlier score, seen-video memory, 24 h age floor) | Live-verified; baseline falls back to global when a channel has fewer than 3 mature peers |
| 3 Transcript | `hosted_transcript.py` (Supadata, needs TRANSCRIPT_API_KEY) then Gemini video understanding then manual; validated by `ffx transcript` | Hosted source used live on one video; parsing units (ms offsets) assumed, covered by unit tests |
| 4 Analyze | `ffx-analyze` + `ffx fit-score` (topic-fit gate, bar 0.55) | Used live |
| 5 Script + fact-check | `ffx-script`, `ffx script-score` (bar 85, no P0), `ffx-fact-check` | Used live; rubric in SCRIPT_RUBRIC.md |
| 6 Voice | `synthesize.py` (Enzo, temperature 0.8, per scene or `--single-take`) | See "Unverified" |

Gates: G1 winner, G2 script, G3 scene plan, G4 render authorization, G5 final video. Only the owner approves a gate.

## Unverified (needs one live check each, in this order)
1. `generation_config.temperature` is accepted by the Interactions API (`request.sendTemperature`; set false if rejected).
2. Single take at full length. Google's documented limits (input about 8,192 tokens; one response about 8.5 minutes of audio; one page says 5,000 characters per job) may be smaller than a 10 to 15 minute episode (about 11,000 to 12,000 characters). **3-scene check first:** render 3 real scenes as a single take, confirm one file, the right duration, and clean cuts; then a 6 minute take; then the full episode. If the service truncates or refuses, use per-scene mode (resume-safe) or two takes.
3. `<breath>` and `<sigh>` tags and the per-scene registers sound right (registers apply only in per-scene mode).
4. Enzo's library entry. (Pace is now measured on a full episode: 169 wpm.)

## Style (patch 19)
The owner look lives in `config/styles/owner-pale-glass/` (style pack built from the five boards, validated by `ffx style-check`). `config/design_tokens.json` and `src/tokens.ts` are legacy and will be replaced by the pack loader when components are built.

## Not built yet
Scene plan with frame-accurate motion recipes and a motion event list (G3), sound design synthesized from motion events, render dispatch (GitHub chunked Remotion render), assemble and QA, thumbnail, packaging. Word-level timing of narration is also missing; the scene planner needs it for exact motion starts.

## Rules that never change
Our own script, never copied, named or credited from researched videos. Topics must suit motion graphics (fit gate). No SFX library; sound is synthesized from motion events. Never write a key value anywhere. No render, upload or merge without explicit owner approval.
