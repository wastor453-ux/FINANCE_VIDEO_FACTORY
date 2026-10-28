---
name: ffx-transcript
description: Obtain and validate the transcript of the approved winner video using permitted sources with a transcription fallback. Use after G1.
---

# Transcript

Resilient chain; stop at the first source that passes validation, and record which one was used:
1. YouTube captions via a caption library or `yt-dlp --skip-download --write-auto-sub` (only if the network allows it and the access is not blocked).
2. Audio route: obtain the audio permitted by the environment and transcribe with Gemini audio understanding or Whisper.
3. Ask the user to paste or attach a transcript.

## Rules
- The official API `captions.download` works only for the video's owner; do not pretend it works.
- Never bypass an access block, login wall or rate limit. If a source is refused, log it in `validation.notes` and move to the next source or ask the user.
- Validate before use: language matches, word count >= 200, last timestamp is within 10% of the video duration, and 5 distinctive title words appear. Write the result to `validation`.
- Storage: the transcript is a private working file (`storage: private_workspace_only`). Never commit it, never publish it, never quote it in the script.
- Schema: `ffx validate transcript runs/<runId>/transcript.json`. Record it: `run-set-stage runs/<runId> transcript VERIFIED --note "<source used>"`.
