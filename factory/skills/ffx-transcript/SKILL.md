---
name: ffx-transcript
description: Obtain and validate the transcript of the approved winner video using permitted sources with a transcription fallback. Use after G1.
---

# Transcript

`ffx transcript` (factory/lib/transcript.mjs) parses and validates an already-obtained caption/transcript file and writes a schema-valid `transcript.json`. It does **not** fetch captions or call any transcription API itself -- that part is a resilient chain you run first, stopping at the first source that works:

**Proven NOT to work from the Muse workspace (2026-10-30, real run on `hriu0irRcpE`) -- do not use or retry them:** `yt-dlp` (captions or audio: HTTP 429 and "Sign in to confirm you're not a bot") and `youtube-transcript-api` (`IpBlocked`: YouTube blocks cloud-provider IPs). Whisper on YouTube audio is also out, because the audio download goes through the same refused fetch. Never use cookies, proxies or any other way around the block. The official `captions.download` API works only for the video's owner.

Chain, stopping at the first source that works:
1. **Hosted transcript API** (third-party dependency; primary when `TRANSCRIPT_API_KEY` is set; owner-approved Supadata connector, only the public video id is sent): `python3 factory/tools/hosted_transcript.py --video-id <id> --out-dir runs/<runId>/transcript_work`, then validate with `--source hosted_transcript_api --srt runs/<runId>/transcript_work/transcript.srt`. Fast (seconds) and not affected by YouTube datacenter blocks; it can still fail or be rate limited, then use the next source.
2. **Gemini video understanding** (fallback): `python3 factory/tools/gemini_transcript.py --video-id <id> --out-dir runs/<runId>/transcript_work`. Google fetches the public video on its own side, so our IP never touches YouTube; it uses the same `GEMINI_API_KEY` as the voice. Google documents it as a preview feature (free, public videos only, up to 8 hours of YouTube video per day on the free tier, limits may change). The output is a model transcription, not YouTube's caption file -- fine for analysis, since the script is rewritten from scratch. Use `--source gemini_video_understanding --srt <out-dir>/transcript.srt`. Status: tested against a fake client only until its first live run; record the live result in STATUS.md.
3. **Ask the user to paste or attach a transcript** (plain text, no real timestamps -- that's fine, see `--manual` below). Use `--source manual`.

Whichever source works, hand its output to the tool:
```
node factory/bin/ffx.mjs transcript --video-id <id> --title "<winner's title>" --duration-sec <video's durationSec> --source gemini_video_understanding|hosted_transcript_api|manual --language en [--vtt cap.vtt | --srt cap.srt | --manual pasted.txt] --out runs/<runId>/transcript.json
```
`--vtt`/`--srt` parse real per-cue timestamps (including messy rolling auto-captions -- tags are stripped, exact-duplicate consecutive cues deduped). `--manual` wraps the whole pasted text as a single segment spanning the full video duration, since there's no real per-line timing for pasted text; that's honest, not a bug.

## Rules
- The official API `captions.download` works only for the video's owner; do not pretend it works.
- Never bypass an access block, login wall or rate limit. If a source is refused, note it (in your own words, when telling the user/orchestrator) and move to the next source or ask the user.
- The tool validates before accepting: word count >= 200, last caption timestamp within 10% of the video's real duration, and at least `min(5, available)` distinctive title words appear in the text (`language` is recorded and compared against `--expected-language` if you pass it, but not auto-detected). It exits 1 and still writes the file (marked `validated: false`) on failure -- inspect `validation.notes`, try the next source in the chain, or ask the user; never treat a failed-validation file as usable.
- Storage: the transcript is a private working file (`storage: private_workspace_only`). Never commit it, never publish it, never quote it verbatim in the script.
- Schema: `ffx validate transcript runs/<runId>/transcript.json`. Record it: `run-set-stage runs/<runId> transcript VERIFIED --note "<source used>, N words"`.
