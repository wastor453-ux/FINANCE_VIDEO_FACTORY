---
name: ffx-render-dispatch
description: Prepare and, only after explicit approval, dispatch the chunked GitHub render for the approved plan. Use at gate G4. Never dispatch without the user's explicit authorization.
---

# Render dispatch (gate G4)

Dispatching costs runner minutes and is irreversible, so it has two independent locks and you must not skip either.

## 1. Prepare (free, allowed without asking)
1. Build the final audio first: `node factory/bin/ffx.mjs mix-audio --voice voice_manifest.json --voice-dir <dir> --sound sound_plan.json --sfx-dir <dir> [--music <file>] --frames <N> --out <mix.wav>`. The GitHub render only muxes this finished file.
2. Commit the render inputs (props/scene plan JSON and the mix) to the working branch. Do NOT commit competitor transcripts or raw run data.
3. Write `jobs/<jobId>.json` (schema `render_job`): composition, `commit` = the exact code commit to render, frame range, `chunkFrames`, `crf`, `propsFile`, `audioFile`, `planFile`, and `inputHashes` (SHA-256 of every input; `sha256sum`). Leave `approvedByUser` out until step 3.
4. Preflight, which never renders: `node factory/bin/ffx.mjs check-job jobs/<jobId>.json --root .` (use `--root` on a checkout of the job's commit). Fix every problem it prints. Also run the Remotion bundle check (`npm run check:bundle`).

## 2. Show the user
Composition, frames and duration, chunk count, `concurrency`, estimated runner minutes, repo, commit, and the list of hashed inputs. State plainly that the estimate is unmeasured until the first real run.

## 3. Stop and ask
"Authorize this production render? (yes/no)". Only after a clear yes **in this conversation**: add `"approvedByUser": true` and `"approvedAt": "<ISO time>"` to the job file, commit it, then dispatch `render-factory.yml` with `job_file=jobs/<jobId>.json` and `confirm=RENDER`. A yes for one job does not cover another job, a re-run with changed inputs, or a later week.

## 4. Monitor
Re-run a failed chunk only. Any checksum, coverage, frame-count or input-hash failure: stop and report the exact message; never patch around it. The workflow produces `master-<jobId>` (master.mp4, assemble_report.json, qa_report.json, contact_sheet.png). Hand over to `ffx-assemble-qa`.

Runner reality: public repos use the standard 4 vCPU / 16 GB / 14 GB runner. Concurrency per job is a config value, not a measured optimum; record the first real run's duration in the run record.
