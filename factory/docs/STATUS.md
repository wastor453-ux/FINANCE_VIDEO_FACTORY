# Status (honest ledger)

TESTED = automated tests ran and passed here. BUILT = written, never run against the real thing. PLANNED = not started. A green test run never means a video exists or looks good.

## Done and tested (synthetic data; 63 tests)
| Area | Evidence / note |
|---|---|
| Schema validator + 11 artifact schemas | rejects bare numbers: every figure needs `source` + `asOf`, or `illustrative` |
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

## Pending (in order)
1. Re-run a real `discover` on all 7 channels now that the REST path bug is fixed and query-mode auth is verified.
2. Motion components for every mode in `config/visual_modes.json` (charts, KPI card, A/B cards, flows, kinetic type), each inspected frame by frame, plus a showcase composition.
3. Transcript tool (captions chain + audio transcription fallback); needs Muse network.
4. Word-level timing for frame-accurate sync (the TTS API returns audio only, so timing needs alignment, e.g. transcribing our own narration).
5. Scene-plan generator, sound-effect library and music source (license-tracked).
6. Thumbnail composer (character reference image still needs to be placed in the project) and title/description/tags/chapters generator.
7. Run-state tool that records gates in code, not only in the skills.
8. Weekly schedule in Muse, cost tracking.
9. One supervised dry run, then the first production week. Not started.

## Decisions waiting on the owner
Channel name, logo and end-card text (stay configurable); final visual identity (current colours are sampled from the reference sheets and marked WORKING_DEFAULT_NOT_FINAL).

## Resolved
Repo hosting: live at `github.com/wastor453-ux/FINANCE_VIDEO_FACTORY`, pushed via Git Data API (snapshot commit `c26f02a3`). YouTube auth mode: query (verified working; header mode fails live, root cause not investigated further since a working alternative exists). Voice: Koda, `en-us-koda`, model `gemini-3.8-flash-tts`, style = the full "user" variant — owner-confirmed 2026-10-27.
