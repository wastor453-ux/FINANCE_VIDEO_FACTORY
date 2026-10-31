# Status (honest ledger)

TESTED = automated tests ran and passed here. BUILT = written, never run against the real thing. PLANNED = not started. A green test run never means a video exists or looks good.

## Done and tested (synthetic data unless noted; 88 tests)
| Area | Evidence / note |
|---|---|
| Schema validator + 12 artifact schemas (incl. `run_state`) | rejects bare numbers: every figure needs `source` + `asOf`, or `illustrative` |
| Run lifecycle (`run-init`/`run-set-stage`/`run-approve`/`run-archive`/`run-cleanup`) | per-video isolated folders, gate tracking, archive + 15-day retention — see dedicated section below |
| Transcript parsing/validation (`ffx transcript`) | VTT/SRT/manual parsing incl. real rolling-caption shape, 3-part validation — see dedicated section below |
| Winner selection | outlier vs the channel's own baseline; seen-video memory; synthetic data only |
| YouTube client | header or query auth, retries on timeout/5xx, never retries 4xx, key scrubbed from errors; **mocked, no real call yet** |
| Doctor | honest VERIFIED / FAILED / UNVERIFIED rows; retries a network timeout once |
| Chunk maths, job preflight (`check-job`) | exact integers, approval + safe paths + input hashes |
| Audio mix (`mix-audio`) | exact-sample SFX placement (measured: frame 105 -> 3.500 s), -16.0 LUFS on synthetic audio, `.m4a` output; ducking depth approximate |
| Assembly (`assemble`) | per-chunk hash + ffprobe, coverage, lossless join, exact-length audio mux (AAC copied, encoded once) |
| Final-video QA (`qa-video`) | decode, black/blank frames, silence, loudness, contact sheet; verdict is never `pass` without human review |
| Render workflow contract | `render-factory.yml` parsed and contract-tested; typed `RENDER` + approved job file |

## Verified by the Muse agent on 2026-10-27 (relayed output)
`npm ci` ok (259 packages); 63/63 tests pass on Muse (ffmpeg 8.1.2) after the v2 rebuild; doctor: 18 verified, 0 failed, 1 unverified, `gemini-3.8-flash-tts` listed with both alternatives. First live TTS sample generated and verified (3 style variants, 24 kHz mono WAV, non-silent, hashes recorded) — see Voice section below.

**Repo hosting resolved.** GitHub push: the GitHub App's MCP integration (`push-files`) kept returning `403 Resource not accessible by integration` on tree-create even after the app's Contents permission was confirmed read-write, repository access set to all repos, and the OAuth token refreshed — the installation token itself wasn't carrying write access for this repo, root cause unconfirmed. Worked around by using the Git Data API directly with the separately-registered GitHub token (which does have push/admin on the repo) to push a 75-file snapshot commit (`c26f02a3`, parent `b856aa27`, the repo's auto-created empty `README.md` overwritten, 4 generated `.pyc` files omitted). Verified by a recursive tree read matching all 75 blob SHAs. This is a **single snapshot commit, not the local bundle's 3-commit history** (`087d145` etc.) — the local clone has no upstream and will diverge from GitHub; that's expected and not a blocker. The MCP `push-files` route is still broken and would likely fail again if used for a future push — use the Git Data API / token route instead.

**YouTube auth mode switched to query.** A live re-test (2026-10-27, header mode only, no `YOUTUBE_AUTH_MODE` override) returned `youtube_data_api: FAILED, HTTP 400` via header auth, while a query-mode control run with the same key in the same window returned `VERIFIED`. The 400 doesn't by itself distinguish "Google rejects the header form" from "the Secure Vault surrogate wasn't swapped into the header" — not investigated further. `config/pipeline.json` → `secrets.youtubeAuthMode` is now `"query"` (was `"header"`); code default in `youtube.mjs` is unchanged at `"header"` and is overridden by this config value. Reversible in one line.

### Earlier run (2026-10-26, superseded except where noted above)
Node 24.22.1, ffmpeg 8.1.2, Python 3.12.3, git 2.43; the Gemini key is valid (60 models listed) and `gemini-3.1-flash-tts-preview` is in the list; github.com and npm reachable; `www.googleapis.com` and `generativelanguage.googleapis.com` HEAD probes timed out; the unfiltered voice list (50) did not contain Koda.

## Voice tool — first live sample generated (2026-10-27)
`factory/tools/synthesize.py`: single-speaker Interactions API call (`speech_metadata` style, `speech_config` voice id, WAV 24 kHz), text rules (no stage directions, only `<short pause>`/`<long pause>`), retries, silent/short-clip rejection, per-scene WAVs + schema-valid manifest, and a 3-way style audition (`empty` / owner's style / short). Model `gemini-3.8-flash-tts`, voice `en-us-koda`.

Live result: `pip install` needed a temp venv (externally-managed-environment error) and `NO_PROXY` needed its bracketed IPv6 entries stripped before the SDK would initialize. Three 8-9s samples generated and independently verified (24 kHz mono 16-bit, matching SHA-256, non-silent):
- `sample_empty` (no style) — 7960ms
- `sample_user` (owner's exact style line) — 8000ms
- `sample_short` ("calm, authoritative, measured pace") — 9120ms

**Resolved 2026-10-27:** owner picked `sample_user` (the full style line) by ear — it reads as the intended authoritative calm financial-advisor delivery despite the library's own Inland-Southern/young-influencer description. Recorded in `config/voice.json`: `voice.status` and `model.status` now `CONFIRMED_*`, `request.chosenVariant: "user"`. `make_episode()` already defaults to `cfg["style"]` (the top-level style string, which equals the "user" variant), so no code change was needed — production synthesis calls will already use the confirmed voice/style with no extra flag.

## Built, not exercised
Skills end to end; `ffx voices` (request shape unverified); `render-factory.yml` on GitHub; Remotion `SystemCheck` composition and `npm ci` with the carried-over lockfile (never run here).

## Bug found and fixed 2026-10-27: wrong YouTube REST paths
The first real `discover` run (Muse, 7 channels) returned 0 videos, all 7 failing `HTTP 404`. `factory/lib/youtube.mjs` was calling `channels.list`, `playlistItems.list`, `videos.list` -- those are the RPC method names from Google's own docs/API Explorer, not real REST paths. The real paths are the bare resource names: `GET /youtube/v3/channels`, `/playlistItems`, `/videos`. `doctor.mjs`'s own probe already used the correct bare path, which is why doctor verified `youtube_data_api` while the actual discover code 404'd -- two different code paths, only one of them right. The existing test suite didn't catch this because `clients.test.mjs`/`core.test.mjs`'s mock matched `.endsWith("channels.list")` etc., i.e. it was asserting the bug's own (wrong) path, not the real one.

Fixed: the three `call(...)` sites in `youtube.mjs` now use the bare resource names. The test mock in `core.test.mjs` now matches the real paths and asserts (`assert.ok(!u.pathname.endsWith(".list"))`) that no call ever uses the RPC-style suffix again, so this exact regression can't silently pass again. Verified the guard actually works by reintroducing the bug and confirming the test fails, then restoring the fix (63/63 pass). `doctor.mjs`'s log wording and the `ffx-discover` skill doc were also corrected to stop describing the wrong path. **Still not proven: a real discover run against the live API with the corrected code** -- that's next.

## First real discover + select run (2026-10-27), recomputed 2026-10-28
Live `discover` on all 7 channels: 70 videos, 0 failures, 21 quota units, passed `ffx validate discovery`. First `selectWinner()` run (baseline-age fix only) picked WhiteBoard Finance's "The Only Money Plan..." at 2.34 -- superseded below.

**Owner requirement (2026-10-28): a channel can only win with its single latest long-form upload**, not any older long-form video even if it scores higher, and not a short. See `latestLongFormPerChannel()` in `select.mjs` and the `ffx-select` skill doc. Re-running selection on the same discovery file with both fixes (baseline-age bound + latest-only) now gives a different winner: **Mark Tilbury — "7 Proven Ways to Make Money With AI (No Experience)"** (score 2.1052, 15.4x its own baseline, global-fallback baseline since only 2 eligible peers). Runners-up: WhiteBoard Finance "The Only Money Plan..." (1.24), Humphrey Yang "You're Probably On Track to Be a Millionaire" (0.73), Graham Stephan "An Urgent Warning For ALL Investors" (0.70). Dan Martell has **zero** eligible candidates this week -- every recent upload is a short. Erin Talks Money's latest long-form is under 24h old and excluded by the age floor (will reconsider next week if still unclaimed). **Still not approved by the owner (gate G1) — this is a selection, not a committed pick.**

## Bug found and fixed (2026-10-27): channel-baseline age bias in selection
Investigating the WhiteBoard win surfaced a second, independent problem (not the REST-path bug below): the channel baseline (`baselineViewsPerHour`) is the median views-per-hour of a channel's other eligible long-form videos, with no upper bound on how old those peers can be. Views-per-hour (cumulative views / hours-since-publish) decays by construction over a video's life, so an unbounded peer set — including videos from months back — drags the baseline down and makes **any** recent upload look like a huge outlier for that reason alone, not because it's actually unusual. Traced exactly for the WhiteBoard case: the winning video was 27 hours old (709.5 vph); its baseline (18.2 vph) was the median of 8 peers ranging from Oct 18 down to Jul 23, several of them down to single-digit vph purely from age. That produced a reported "38.95x outlier," most of which was a comparison artifact.

Fixed in `config/pipeline.json` → `selection.baselineMaxAgeDays` (45, independently configurable from `maxAgeDays` which bounds candidates) and `select.mjs`: both the per-channel peer filter and the global fallback median now exclude peers older than this bound. A new regression test (`select.test.mjs`) builds a synthetic channel with 3 recent peers and 5 ancient ones and asserts the old behavior would have produced a false >30x outlier while the fixed behavior produces a correctly unremarkable <2x. **Not yet re-run against the live discovery data** — the 2026-10-27 selection above was computed before this fix landed in the delivered zip; re-running `select` on the same discovery file with the fix in place is the next step before G1 approval.

## Run-lifecycle system: one isolated folder per video, with archive + 15-day retention
Built: `node factory/bin/ffx.mjs run-init --channel @handle --video id --title "T"` creates `runs/<runId>/` (id = ISO week + channel + video id, e.g. `2026-W44-whiteboardfinance-xxoqWfPA` — collision-resistant across retries/re-runs). Every stage's artifact for that video lives inside it; `run-set-stage` and `run-approve` record stage status and gate approvals (G1-G5) in `run_state.json`, not just in conversation history. `run-archive` moves a run to `archive/<runId>/` once every gate is approved (refuses otherwise unless `--force`, so a half-finished run can't be swept away). `run-cleanup` deletes archived runs past `retention.retentionDays` (15, in `config/pipeline.json`); `--dry-run` previews first. This is what makes the weekly system reusable without ever touching the engine (`lib/`, `skills/`, `config/`, `schemas/`) — each week's data is fully isolated and self-cleaning. `runs/`, `archive/`, and `state/` (cross-run seen-video memory, which intentionally survives archiving) are all gitignored; none of this ever reaches the public repo.

Verified three ways: unit tests on the pure logic (`run.test.mjs`, 10 tests — id generation, stage/gate transitions, archive/retention math); a full CLI-level integration test (`skills_cli.test.mjs` — spawns the real `ffx` binary through init → set-stage → approve → archive-refused-while-incomplete → archive → cleanup-kept-before-window → cleanup-deleted-after-window, in a temp directory); and a manual end-to-end run by hand with real file-system side effects observed directly (archive move confirmed, deletion confirmed). **Not yet used in a real weekly run** — discover/select currently still write to `runs/_staging/` before a winner exists; once G1 is approved for a real winner, `run-init` + the staging-to-run-folder copy needs to happen for the first time outside a test.

## G1 approved (2026-10-29): winner locked in
A fresh `discover` (not the Oct 27 one -- ages/eligibility shift daily, so selection was re-run on same-day data) + `select` confirmed **Mark Tilbury — "7 Proven Ways to Make Money With AI (No Experience)"** (score 2.0486, 14.3x global-fallback baseline). Owner approved. Run folder created: `runs/2026-W44-marktilbury-hriu0irR/`, staging discovery/selection files copied in (hash-verified), both stages marked VERIFIED, G1 approved by owner, `mark-seen` run (70 video IDs now in `state/seen_videos.json`, including the winner) -- this is the run-lifecycle system's first real (non-test) use. One flagged-but-not-blocking caveat: this topic leans on strategy/anecdote more than official statistics (BLS/FRED-style sourcing), so the fact-check stage may need more "illustrative" labels than a budgeting/data-heavy topic would.

Noted in passing: a stray empty `factory/state/seen_videos.json` exists in Muse's workspace. It isn't shipped by this project (not in git, not referenced by any skill or the CLI) and isn't read by anything -- the real, permanent seen-memory is the project-root `state/seen_videos.json`. Safe to delete; harmless if left alone.

## Transcript tool built (2026-10-29)
`factory/lib/transcript.mjs` + `ffx transcript` CLI command. Deliberately thin: it parses (VTT or SRT, including messy real-world "rolling" YouTube auto-captions with `<c>` tags and inline timestamp tags -- stripped and exact-duplicate consecutive cues deduped) or wraps (`--manual`, plain pasted text as one full-duration segment) an **already-obtained** transcript, then validates it: word count >= 200, last caption within 10% of real video duration, at least `min(5, available)` distinctive title words present. It does not fetch captions or call a transcription API itself -- that external step (see the 2026-10-30 section below for what actually works) is unverifiable from here without network/these tools, so rather than guess at an untested subprocess/API shape, the tool's contract is "hand me whatever text you got, honestly, and I'll validate and format it correctly." (Update 2026-10-30: the yt-dlp and whisper doctor checks were removed -- see below.)

Tested: 10 unit tests on the pure parse/validate logic (synthetic VTT including the rolling-caption shape, SRT, manual-text wrapping, all three validation failure modes with their exact notes) + 1 CLI-level integration test (real `ffx transcript` invocations for vtt/srt/manual, a schema-valid pass, an honest failure that still writes the file marked `validated: false`, and a refusal when no input is given at all). **Not yet exercised against a real video's actual captions** -- that's the next step, using the approved winner above.

## Transcript sources: what failed and what replaced it (2026-10-30)
Real run in Muse on `hriu0irRcpE` (youtube.com itself reachable, doctor green): `yt-dlp` got HTTP 429 then LOGIN_REQUIRED ("Sign in to confirm you're not a bot"); `youtube-transcript-api` raised `IpBlocked` (cloud-provider IP). Both are removed from the skill, schema source list, CLI and `ffx doctor`; Whisper-on-YouTube-audio is removed too (same refused download). No cookies, proxies or bypasses are used.
Replacement: `factory/tools/gemini_transcript.py` -- Gemini video understanding with the YouTube URL (fetched on Google's side, same key as the voice). Request shape is from Google's docs and tested against a fake client; **not yet run live** -- that first call is the verification. Documented caveats: preview feature, public videos only, free tier 8 h of YouTube video/day, limits may change; output is a model transcription. Fallbacks: an owner-approved hosted transcript API (none configured; Supadata's free tier lists 100 requests/month, unverified here), then a human paste. Known gap: Muse's bundle has no `transcript` command (stale vs this repo) -- re-sync before use.

## Gemini transcript route verified live (2026-10-30)
Run in Muse on `hriu0irRcpE`: 424 cues, 5,011 words, last cue at 1,582 s of 1,584 s; `ffx transcript` -> VALID (5011 words, duration match ok, 5/5 title words); transcript stage VERIFIED. First attempt failed only on a local sandbox setting (bracketed IPv6 entries in lowercase `no_proxy` crash httpx); `tools/proxy_env.py` now drops just those entries before the Gemini SDK is used, in both `gemini_transcript.py` and `synthesize.py`. The transcript is Gemini's transcription of the audio, not YouTube's caption file.

## Pending (in order)
1. (done 2026-10-30) Transcript via Gemini verified live.
2. Analyze stage (hook/structure/core points from the transcript).
3. Script + fact-check stage (gate G2, along with a voice sample).
4. Motion components for every mode in `config/visual_modes.json` (charts, KPI card, A/B cards, flows, kinetic type), each inspected frame by frame, plus a showcase composition.
5. Word-level timing for frame-accurate sync (the TTS API returns audio only, so timing needs alignment, e.g. transcribing our own narration).
6. Scene-plan generator, sound-effect library and music source (license-tracked).
7. Thumbnail composer (character reference image still needs to be placed in the project) and title/description/tags/chapters generator.
8. Weekly schedule in Muse, cost tracking.
9. One supervised dry run, then the first production week. Not started.

## Decisions waiting on the owner
Channel name, logo and end-card text (stay configurable); final visual identity (current colours are sampled from the reference sheets and marked WORKING_DEFAULT_NOT_FINAL).

## Resolved
Repo hosting: live at `github.com/wastor453-ux/FINANCE_VIDEO_FACTORY`, pushed via Git Data API (snapshot commit `c26f02a3`). YouTube auth mode: query (verified working; header mode fails live, root cause not investigated further since a working alternative exists). Voice: Koda, `en-us-koda`, model `gemini-3.8-flash-tts`, style = the full "user" variant — owner-confirmed 2026-10-27. YouTube REST path bug (see above). Run-lifecycle / per-video isolation + retention (see above). Channel-baseline age bias and latest-per-channel selection rules (see above). **G1: Mark Tilbury "7 Proven Ways to Make Money With AI (No Experience)" approved 2026-10-29.**
