#!/usr/bin/env python3
"""Hosted transcript fetcher (Supadata). Fetches a video's public captions through a hosted service, avoiding datacenter-IP
blocks and the cost of video understanding. Only the public video id is sent to the service.

Units: items with `offset`/`duration` are milliseconds (Supadata's format); items with `start`/`dur` or `startSec`
are seconds. Output is an SRT file (+ raw text) that `ffx transcript --source hosted_transcript_api` validates.
Key: TRANSCRIPT_API_KEY (never printed or written)."""
import argparse, json, os, sys, urllib.parse, urllib.request

URL = "https://api.supadata.ai/v1/youtube/transcript"


def fetch_subtitles(video_id, api_key, opener=urllib.request.urlopen, timeout=20, lang="en"):
    q = urllib.parse.urlencode({"videoId": video_id, "text": "false", "lang": lang})
    req = urllib.request.Request(f"{URL}?{q}", headers={"x-api-key": api_key, "User-Agent": "FinanceVideoFactory/1.0"})
    with opener(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def cue_times(item):
    """(start_sec, end_sec) of one caption item."""
    if "offset" in item:
        start = float(item["offset"]) / 1000.0
        dur = float(item.get("duration", 2000)) / 1000.0
    else:
        start = float(item.get("start", item.get("startSec", 0.0)))
        dur = float(item.get("dur", item.get("duration", 2.0)))
    return start, start + max(dur, 0.1)


def _ts(sec):
    ms = int(round(sec * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(items):
    out = []
    for i, it in enumerate(items, 1):
        a, b = cue_times(it)
        text = str(it.get("text", "")).strip()
        if text:
            out.append(f"{i}\n{_ts(a)} --> {_ts(b)}\n{text}\n")
    return "\n".join(out)


def check_language(data, want="en"):
    """The service can return another language's captions when none is asked for (it returned Bengali once). Never accept that silently."""
    got = str(data.get("lang") or "").lower()
    if got and not got.startswith(want.lower()):
        raise ValueError(f"the service returned '{got}' captions, not '{want}' (available: {data.get('availableLangs')})")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video-id", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--lang", default="en", help="caption language to request and require (default en)")
    args = ap.parse_args(argv)
    key = os.environ.get("TRANSCRIPT_API_KEY")
    if not key:
        print("hosted_transcript: TRANSCRIPT_API_KEY is not set", file=sys.stderr)
        return 2
    os.makedirs(args.out_dir, exist_ok=True)
    try:
        data = fetch_subtitles(args.video_id, key, lang=args.lang)
        check_language(data, args.lang)
        content = data.get("content") or []
        if not content:
            raise ValueError("the service returned no transcript content")
        with open(os.path.join(args.out_dir, "transcript.srt"), "w", encoding="utf-8") as f:
            f.write(to_srt(content))
        raw = " ".join(str(i.get("text", "")) for i in content)
        with open(os.path.join(args.out_dir, "transcript.raw.txt"), "w", encoding="utf-8") as f:
            f.write(raw)
        print(json.dumps({"status": "SUCCESS", "cues": len(content), "words": len(raw.split()), "lang": data.get("lang"), "lastEndSec": round(cue_times(content[-1])[1], 1)}, indent=2))
        return 0
    except Exception as e:  # noqa: BLE001 - the key is never in the message (it is only sent as a header)
        print(f"hosted_transcript error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
