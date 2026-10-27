# Legacy pipeline audit (history only)

This project does **not** use the old `rendering-production` code, audio, compositions or workflows. The audit is kept as the record of why a clean rebuild was chosen and of the defects the new tools were written to avoid. Only the pinned Remotion dependency versions were carried over.

## Defects found by code reading (not reproduced by running)

Branch inspected: `repair/verified-pipeline-gates-2026-10-14` (15 commits ahead of `main`). Its 5 Node tests pass; the selector tests and bundle check could not be run in the inspection sandbox.

1. `scripts/verify-render.js` re-renders Remotion stills instead of inspecting frames of the final MP4; hard-codes 1920x1080 and the brand names "CrackIt"/"HousingBroke".
2. Chunk SHA-256 is computed on the machine that rendered the chunk, so it proves transfer integrity only; chunks are not individually probed (frame count/decodability) before `concat -c copy`.
3. Audio mux: `amix` default normalization likely lowers narration ~6 dB; `-shortest` can truncate video if the voice track is short; A/V tolerance 0.5 s (15 frames) is loose and compares duration, not sync; `bc scale=3` truncates fractional seconds (fixed in `factory/lib/chunks.mjs`, not yet wired into the workflow); FPS hard-coded to 30.
4. Workflow defaults tied to one test job (`P3Rehearsal`, `src/compiled_p3`, `vo_p3.wav`); `--concurrency=2` is unmeasured on 4 vCPU runners.
5. Public repository: anything committed (scripts, audio, thumbnails) is public. Audio is in Git LFS (free quota is small).
6. Sample script `tilbury-adapt/VO_SCRIPT.md` contains unsourced figures; it must not be reused as-is.
7. 25 experimental compositions (dark and light) live in `src/`; only the light system is the target look.

## How the new project avoids them
Per-chunk ffprobe + hash, exact frame/sample maths (no `bc` truncation), no `amix` normalisation or `-shortest` truncation, 2-frame A/V limit, job-driven composition/size/fps, QA on the real master, and no brand names in code. Each is covered by tests in `factory/tests/`.
