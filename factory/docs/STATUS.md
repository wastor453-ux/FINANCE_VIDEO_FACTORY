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
`npm ci` ok (259 packages); 60/63 tests pass on Muse (ffmpeg 8.1.2); doctor: 17 verified, 0 failed, 1 unverified; YouTube Data API ok via query auth; Gemini key valid and TTS model listed; `voices --search Koda` returned one voice (`en-us-koda`). Earlier run (2026-10-26) findings below are superseded except the GitHub token host problem.

### Earlier run
Node 24.22.1, ffmpeg 8.1.2, Python 3.12.3, git 2.43; the three secrets are set (validity of YouTube/GitHub tokens separate); the Gemini key is valid (60 models listed) and `gemini-3.1-flash-tts-preview` is in the list; github.com and npm reachable; `www.googleapis.com` and `generativelanguage.googleapis.com` HEAD probes timed out; the YouTube Data API call from the factory's header method timed out (a query-param call returned 200); the unfiltered voice list (50) did not contain Koda; **a git push was refused because the GitHub token is registered for api.github.com only**.

## Voice tool (built from Google's documented call; tested against a fake client only)
`factory/tools/synthesize.py`: single-speaker Interactions API call (`speech_metadata` style, `speech_config` voice id, WAV 24 kHz), text rules (no stage directions, only `<short pause>`/`<long pause>`), retries, silent/short-clip rejection, per-scene WAVs + schema-valid manifest, and a 3-way style audition (`empty` / owner's style / short). **Never run against the live service**: whether the Koda id is accepted in `speech_config`, and how it sounds, is unknown until the first sample. Model default is now `gemini-3.8-flash-tts` (documented as the current studio model); its ID still has to be confirmed as listed for this key.

## Built, not exercised
Skills end to end; `ffx voices` (request shape unverified); `render-factory.yml` on GitHub; Remotion `SystemCheck` composition and `npm ci` with the carried-over lockfile (never run here).

## Pending (in order)
1. Koda is FOUND (`en-us-koda`, prebuilt library voice, male, low pitch). Still to do: write the TTS client from Google's exact request example, synthesize a 20 s sample, and have the owner listen (accent listed as Inland Southern, persona young influencer).
2. YouTube works from Muse via query-param auth (doctor 2026-10-27). Header auth still untested there; a real `discover` run on the 7 channels is the next proof.
3. Motion components for every mode in `config/visual_modes.json` (charts, KPI card, A/B cards, flows, kinetic type), each inspected frame by frame, plus a showcase composition.
4. Transcript tool (captions chain + audio transcription fallback); needs Muse network.
5. Run the first voice sample (Muse), pick the style variant by ear. Then word-level timing for frame-accurate sync (the TTS API returns audio only, so timing needs alignment, e.g. transcribing our own narration).
6. Scene-plan generator, sound-effect library and music source (license-tracked).
7. Thumbnail composer (character reference image still needs to be placed in the project) and title/description/tags/chapters generator.
8. Run-state tool that records gates in code, not only in the skills.
9. Weekly schedule in Muse, cost tracking.
10. One supervised dry run, then the first production week. Not started.

## Decisions waiting on the owner
Where the project lives on GitHub (new repo recommended); GitHub token host fix or OAuth; channel name, logo and end-card text (stay configurable); final visual identity (current colours are sampled from the reference sheets and marked WORKING_DEFAULT_NOT_FINAL).
