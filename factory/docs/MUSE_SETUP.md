# Setting up Muse

## Verified by Muse (2026-10-26)
Workspace `/home/hatch/workspace`; Node 24.22.1, Python 3.12.3, ffmpeg 8.1.2, git 2.43, gh 2.102; skills folder `~/workspace/custom-skills/`; keys come from the Secure Vault as env vars; Gemini key valid; TTS model `gemini-3.1-flash-tts-preview` listed.

## Known blockers (from Muse's doctor run)
- **GitHub push refused.** The token is registered only for `api.github.com`, so git over `github.com` is not authenticated. Fix: reconnect the token with `github.com` added as a host, or complete the GitHub OAuth flow.
- **YouTube Data API timed out** with the header method. Set `YOUTUBE_AUTH_MODE=query` and re-run the doctor. The key is then sent as `?key=` and is scrubbed from all output.
- **Koda not found** in the unfiltered 50-voice list. Run `node factory/bin/ffx.mjs voices --search Koda`, then `--type prompted` and `--type replicated`. Show the raw result to the owner before writing any ID into `config/voice.json`.

## One-time steps
1. Fix the GitHub token host (above). Prefer a fine-grained token limited to the project repository: Contents RW, Actions RW, Pull requests RW, Metadata R.
2. Clone the project into `~/workspace/finance-video-factory/`, run `npm ci`, then `bash factory/bin/install-muse.sh` (copies the 16 `ffx-*` skills into `~/workspace/custom-skills/`).
3. Add the line in `docs/AGENTS_SNIPPET.md` to `~/AGENTS.md`.
4. Run `node factory/bin/ffx.mjs doctor --online --live` and send the table back.

Per-run data lives in `~/workspace/finance-video-factory/runs/<year>-W<week>/` (git-ignored).

## Put the project on GitHub (new repo; recommended)
1. On github.com create a **new public repository** `finance-video-factory` with no README, licence or .gitignore.
2. Make sure Muse's token can reach it (fine-grained token: add this repository; Contents RW, Actions RW, Pull requests RW, Metadata R) and that git over `github.com` is authenticated.
3. In Muse: unzip or `git clone finance-video-factory.bundle finance-video-factory`, `cd` into it, `git remote add origin https://github.com/<owner>/finance-video-factory.git`, `git push -u origin main`. Do not push anything else. Never commit keys, transcripts or run data (`.gitignore` blocks them).

## First voice sample (a few seconds of audio; not a production render)
`pip install "google-genai>=2.25.0"` then
`node factory/bin/ffx.mjs doctor --online --live` (the 3.8 model IDs should show as listed), then
`python3 factory/tools/synthesize.py sample --out runs/voice_sample --text "Most people do not lose money in one big mistake. They lose it slowly, in small decisions they never question."`
Send back the JSON it prints and the three WAV files for the owner to listen to.
