#!/usr/bin/env python3
"""Transcript of a public YouTube video via Gemini video understanding (Google fetches the video, not us).

Why: YouTube refuses our workspace's IP (yt-dlp: 429 + "confirm you're not a bot"; youtube-transcript-api: IpBlocked).
Gemini's YouTube-URL input is fetched on Google's side, so our IP never touches YouTube. It uses the same
GEMINI_API_KEY as the voice. Documented limits (Google "Video understanding" page): public videos only; the YouTube
URL feature is a preview (free of charge, limits may change); free tier up to 8 hours of YouTube video per day.

The result is a MODEL transcription of the audio, not YouTube's caption file. That is fine for analysis (the script is
rewritten from scratch and never quotes it), and `ffx transcript` still validates length, duration and title words.

STATUS: request shape follows the docs page (Interactions API, input part {"type": "video", "uri": URL}); covered by
tests against a fake client; NOT yet run live. The first real call on the approved winner is the verification.

Usage:
  python3 factory/tools/gemini_transcript.py --video-id ID --out-dir DIR [--model gemini-3.8-flash]
Writes DIR/transcript.srt (timed) and DIR/transcript.raw.txt (model output). Then run:
  node factory/bin/ffx.mjs transcript ... --source gemini_video_understanding --srt DIR/transcript.srt --out ...
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proxy_env import clean_no_proxy  # noqa: E402

DEFAULT_MODEL = "gemini-3.8-flash"

PROMPT = (
    "Transcribe the spoken words of this video verbatim, in English, from start to end. "
    "Output one line per sentence or short passage, each starting with its start time in [MM:SS] "
    "(use [H:MM:SS] after one hour), then the text. Spoken words only: no descriptions of visuals, no sponsor "
    "summaries, no commentary, no markdown. Do not stop early and do not summarize."
)

LINE = re.compile(r"^\s*\[(?:(\d+):)?(\d{1,2}):(\d{2})\]\s*(.+?)\s*$")


class TranscriptError(Exception):
    pass


def build_request(model, video_id):
    return {
        "model": model,
        "input": [
            {"type": "text", "text": PROMPT},
            {"type": "video", "uri": f"https://www.youtube.com/watch?v={video_id}"},
        ],
    }


def parse_lines(text):
    """[(start_ms, text)] from '[MM:SS] words' lines; lines without a timestamp are ignored."""
    out = []
    for raw in text.splitlines():
        m = LINE.match(raw)
        if not m:
            continue
        h, mi, s, words = m.groups()
        ms = ((int(h or 0) * 60 + int(mi)) * 60 + int(s)) * 1000
        out.append((ms, words))
    return out


def _ts(ms):
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, milli = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"


def to_srt(entries, tail_ms=4000):
    """SRT where each cue ends where the next starts (last one gets a short tail). Times must not go backwards."""
    cues = []
    last = -1
    for start, words in entries:
        if start < last:
            raise TranscriptError("timestamps go backwards; model output is not usable")
        last = start
        cues.append([start, None, words])
    for i, c in enumerate(cues):
        c[1] = cues[i + 1][0] if i + 1 < len(cues) else c[0] + tail_ms
        if c[1] <= c[0]:
            c[1] = c[0] + 1000
    return "".join(f"{i}\n{_ts(a)} --> {_ts(b)}\n{t}\n\n" for i, (a, b, t) in enumerate(cues, 1))


def fetch(client, model, video_id):
    try:
        interaction = client.interactions.create(**build_request(model, video_id))
    except Exception as e:  # report the real error text; never retry in a loop or work around a refusal
        raise TranscriptError(f"Gemini call failed: {type(e).__name__}: {e}")
    text = getattr(interaction, "output_text", None)
    if not text or not text.strip():
        raise TranscriptError("Gemini returned no text for this video")
    return text


def run(client, model, video_id, out_dir):
    raw = fetch(client, model, video_id)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "transcript.raw.txt"), "w", encoding="utf8") as f:
        f.write(raw)
    entries = parse_lines(raw)
    if not entries:
        raise TranscriptError("no '[MM:SS] text' lines found in the output; use transcript.raw.txt with --manual instead")
    with open(os.path.join(out_dir, "transcript.srt"), "w", encoding="utf8") as f:
        f.write(to_srt(entries))
    return {"cues": len(entries), "words": sum(len(t.split()) for _, t in entries), "lastStartMs": entries[-1][0]}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--video-id", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", args.video_id):
        print("gemini_transcript: --video-id must be an 11-character YouTube id", file=sys.stderr)
        return 2
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("gemini_transcript: GEMINI_API_KEY is not set", file=sys.stderr)
        return 2
    clean_no_proxy()
    try:
        from google import genai
    except ImportError:
        print('gemini_transcript: install the SDK first:  pip install "google-genai>=2.25.0"', file=sys.stderr)
        return 2
    try:
        res = run(genai.Client(), args.model, args.video_id, args.out_dir)
    except TranscriptError as e:
        print(f"gemini_transcript: {e}", file=sys.stderr)
        return 1
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
