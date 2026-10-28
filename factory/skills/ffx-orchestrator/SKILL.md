---
name: ffx-orchestrator
description: Run or resume the weekly Finance Video Factory production. Use whenever the user asks to make this week's video, resume a run, or check run status. Owns stage order, approval gates and forbidden actions.
---

# Executive producer

This is a reusable system, not a one-time build: every week it runs again from scratch and makes one new video, in its own isolated folder, without ever touching the engine (`factory/lib`, `factory/skills`, `factory/config`, `factory/schemas`) that produced it. You never skip a stage, never fabricate a stage's output, and never cross an approval gate without the user's explicit "yes".

## Run folder (private Muse workspace, NOT the public repo)
Stages 1-2 (ffx-discover, ffx-select) run before any run folder exists -- the folder's id is derived from the winner, which isn't known yet -- so their output lands in `runs/_staging/discovery.json` and `runs/_staging/selection.json`. As soon as a winner is known (gate G1), create one isolated project folder for that specific video -- never reuse a folder across different videos, and never let one week's run touch another's files:

```
node factory/bin/ffx.mjs run-init --channel <winner's @handle> --video <winner's videoId> --title "<winner's title>"
```

This prints the run's unique id (e.g. `2026-W44-whiteboardfinance-xxoqWfPA` -- tied to the ISO week, the channel, and the exact video, so a retry or a re-run of the same week can never collide) and creates `runs/<runId>/run_state.json`. Immediately copy `runs/_staging/discovery.json` and `runs/_staging/selection.json` into `runs/<runId>/`, then record both stages (`run-set-stage runs/<runId> discover VERIFIED`, `run-set-stage runs/<runId> select VERIFIED`) and approve G1. From here on, put every later stage's artifact for this video inside `runs/<runId>/` too (transcript.json, script.json, voice_manifest.json + wavs, scene_plan.json, sound_plan.json, render_job.json, qa_report.json, package.json). Secrets never go in the run folder. Competitor transcripts never leave this folder.

After every stage, record it in code -- not only by writing the artifact file, but in `run_state.json` itself:
```
node factory/bin/ffx.mjs run-set-stage runs/<runId> <stage> VERIFIED --note "<one line, e.g. 70 videos, 0 failures>"
```
(stage names: `doctor discover select transcript analyze script fact_check voice scene_plan sound_design render_dispatch assemble_qa thumbnail package`; status one of `PENDING IN_PROGRESS VERIFIED FAILED UNVERIFIED NEEDS_HUMAN`.)

After the user approves a gate in the current conversation, record that too -- this is what makes "the user approved it" a fact in the run folder instead of only a line in chat history:
```
node factory/bin/ffx.mjs run-approve runs/<runId> <gate> --by owner --note "<what was approved>"
```

Check a run's status any time with `node factory/bin/ffx.mjs run-status runs/<runId>`.

## Archive and retention (keeps the engine clean across every weekly run)
Once a video is fully done (every gate G1-G5 approved), archive its run folder -- this is what lets next week's run start on an untouched system instead of an ever-growing pile of old run data:
```
node factory/bin/ffx.mjs run-archive runs/<runId> --archive-root archive
```
This refuses to run (and tells you which gates are still unapproved) unless every gate is approved, so a half-finished run can't accidentally get swept away. It moves the whole folder under `archive/<runId>/` and timestamps it.

Archived runs are deleted automatically once 15 days old (`config/pipeline.json` -> `retention.retentionDays`):
```
node factory/bin/ffx.mjs run-cleanup --archive-root archive --days 15
```
Run this at the start of each weekly session (a `--dry-run` first is fine if you want to see what it would delete before it does). This is routine housekeeping, not something that needs the user's approval each time -- it only ever touches folders of videos that are already fully approved and archived.

## Stage order and gates
| # | Stage skill | Artifact (schema) | Gate |
|---|---|---|---|
| 0 | ffx-doctor | doctor report | none (must have no FAILED rows) |
| 1 | ffx-discover | discovery.json | none |
| 2 | ffx-select | selection.json | **G1: user approves winner** |
| 3 | ffx-transcript | transcript.json | none (validation must pass) |
| 4 | ffx-analyze | analysis.json | none |
| 5 | ffx-script + ffx-fact-check | script.json | **G2: user approves script + a 30 s voice sample** |
| 6 | ffx-voice | voice_manifest.json | (part of G2) |
| 7 | ffx-scene-plan | scene_plan.json | **G3: user approves scene plan** |
| 8 | ffx-sound-design | sound_plan.json | (part of G3) |
| 9 | ffx-render-dispatch | render_job.json | **G4: explicit render authorization** |
| 10 | ffx-assemble-qa | qa_report.json | **G5: user approves final video** |
| 11 | ffx-thumbnail, ffx-package | package.json | none; never uploads |

## Hard rules
- Forbidden without explicit approval in the current conversation: production render, publish/upload, merge a pull request. Preparing, validating and dry-running are allowed; dispatching is not.
- Every artifact must pass `node factory/bin/ffx.mjs validate <schema> <file>` before the next stage starts.
- A failed stage is reported with its real error and the options (retry, fallback, skip week). Never substitute unverified data silently.
- Keep a short status line per stage in run_state.json: VERIFIED / FAILED / UNVERIFIED / NEEDS_HUMAN.
- After each gate, restate in two lines what was approved so the record is unambiguous.

## Tone with the user
Short. Lead with what changed and what you need. Never present a plan, a passing test, or a green CI run as proof the video looks good.
