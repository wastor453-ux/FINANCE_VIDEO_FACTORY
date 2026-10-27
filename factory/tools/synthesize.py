#!/usr/bin/env python3
"""Gemini TTS narration for the Finance Video Factory.

Calls follow the request shape in Google's "Text-to-speech generation (TTS)" page for the Gemini 3.8 TTS
models (Interactions API): `client.interactions.create(model=..., input=[user_input/text + speech_metadata
annotation], response_format={"type": "audio", ...}, generation_config={"speech_config": [{"voice": ...}]})`
and the audio is `interaction.output_audio.data` (base64 WAV, 24 kHz mono 16-bit by default).

STATUS: the call shape is taken from the docs and covered by tests against a fake client. It has NOT yet been
run against the live service; the first real call is the 20-second sample. The Koda voice id is passed in
`speech_config` exactly like a prebuilt voice name; that is the documented pattern, to be confirmed by that call.

Usage:
  python3 factory/tools/synthesize.py sample --text "..." --out DIR [--variants empty,user,short]
  python3 factory/tools/synthesize.py episode --job tts_job.json --out DIR
The API key is read from the environment (GEMINI_API_KEY) by the SDK and is never printed or written.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import wave
import io

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "..", "config", "voice.json")

ALLOWED_TAGS = {"<short pause>", "<long pause>"}
# Anything that looks like a stage direction must not be in the spoken text (it would be read aloud).
STAGE_DIRECTION = re.compile(r"\[[^\]]*\]|\([^)]*(pause|whisper|sigh|laugh|slow|fast|tone)[^)]*\)", re.I)


class TtsError(Exception):
    pass


def load_config(path=CONFIG):
    with open(path, encoding="utf8") as f:
        return json.load(f)


def check_text(text, max_chars):
    """Return a list of problems with a scene's spoken text (empty list = OK)."""
    problems = []
    if not text or not text.strip():
        problems.append("text is empty")
        return problems
    if len(text) > max_chars:
        problems.append(f"text is {len(text)} chars; limit is {max_chars}. Split the scene")
    if STAGE_DIRECTION.search(text):
        problems.append("text contains a bracketed stage direction; the text field is spoken verbatim. Use style or <short pause>")
    for tag in re.findall(r"<[^>]*>", text):
        if tag not in ALLOWED_TAGS:
            problems.append(f"tag {tag} is not allowed (only {', '.join(sorted(ALLOWED_TAGS))}); sound effects are never requested from the voice")
    return problems


def build_request(model, voice, text, style, sample_rate=24000):
    """The exact keyword arguments for client.interactions.create (kept pure so tests can assert them)."""
    item = {"type": "text", "text": text}
    if style:
        item["annotations"] = [{"type": "speech_metadata", "style": style}]
    return {
        "model": model,
        "input": [{"type": "user_input", "content": [item]}],
        "response_format": {"type": "audio", "mime_type": "audio/wav", "sample_rate": sample_rate},
        "generation_config": {"speech_config": [{"voice": voice}]},
    }


def wav_info(data):
    """(duration_ms, sample_rate, channels, rms) of WAV bytes; raises TtsError if it is not a decodable WAV."""
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise TtsError("returned audio has no RIFF/WAVE header (unexpected format)")
    try:
        with wave.open(io.BytesIO(data)) as w:
            n, rate, ch, width = w.getnframes(), w.getframerate(), w.getnchannels(), w.getsampwidth()
            raw = w.readframes(n)
    except wave.Error as e:
        raise TtsError(f"WAV does not decode: {e}")
    if width != 2:
        raise TtsError(f"expected 16-bit audio, got {width * 8}-bit")
    import array
    a = array.array("h")
    a.frombytes(raw[: len(raw) - (len(raw) % 2)])
    rms = (sum(x * x for x in a) / max(1, len(a))) ** 0.5
    return round(n * 1000 / rate), rate, ch, rms


def synthesize_scene(client, model, voice, text, style, sample_rate=24000, retries=2, sleep=time.sleep, min_ms=500, min_rms=30.0):
    """One validated narration clip. Retries transient failures; a silent or too-short clip is an error."""
    last = None
    for attempt in range(retries + 1):
        if attempt:
            sleep(1.5 * 2 ** (attempt - 1))
        try:
            interaction = client.interactions.create(**build_request(model, voice, text, style, sample_rate))
            data = base64.b64decode(interaction.output_audio.data)
            ms, rate, ch, rms = wav_info(data)
            if ms < min_ms:
                raise TtsError(f"clip is only {ms} ms long")
            if rms < min_rms:
                raise TtsError(f"clip is silent (rms {rms:.1f})")
            return data, {"durationMs": ms, "sampleRateHz": rate, "channels": ch, "rms": round(rms, 1)}
        except Exception as e:  # noqa: BLE001 - reported with the real message, never swallowed
            last = e
    raise TtsError(f"synthesis failed after {retries + 1} attempts: {type(last).__name__}: {last}")


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def make_episode(client, cfg, job, out_dir, sleep=time.sleep):
    """Synthesize every scene and return a voice_manifest dict (schema: voice_manifest). approved is always False here."""
    model = job.get("model") or cfg["model"]["id"]
    voice = job.get("voice") or cfg["voice"]["id"]
    style = job["style"] if "style" in job else cfg["style"]
    max_chars = cfg["chunking"]["maxCharsPerRequest"]
    gap_ms = int(job.get("gapMs", 200))
    os.makedirs(out_dir, exist_ok=True)
    problems = []
    for s in job["scenes"]:
        problems += [f'{s["sceneId"]}: {p}' for p in check_text(s["text"], max_chars)]
    if problems:
        raise TtsError("script text not ready for narration:\n  " + "\n  ".join(problems))
    scenes, cursor = [], 0
    for s in job["scenes"]:
        data, info = synthesize_scene(client, model, voice, s["text"], style, cfg["output"]["sampleRateHz"], cfg["chunking"]["retries"], sleep)
        name = f'{s["sceneId"]}.wav'
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(data)
        scenes.append({"sceneId": s["sceneId"], "file": name, "durationMs": info["durationMs"], "sha256": sha256_bytes(data), "startMs": cursor})
        cursor += info["durationMs"] + gap_ms
    total = scenes[-1]["startMs"] + scenes[-1]["durationMs"]
    return {
        "schema_version": "1.0", "provider": cfg["provider"], "model": model, "voice": voice, "style": style,
        "temperature": cfg.get("temperature"), "sampleRateHz": cfg["output"]["sampleRateHz"],
        "scenes": scenes, "totalMs": total, "approved": False,
    }


def make_samples(client, cfg, text, out_dir, variants, sleep=time.sleep):
    """Same text rendered with different style strings so the owner can choose by ear."""
    model, voice = cfg["model"]["id"], cfg["voice"]["id"]
    styles = cfg["request"]["styleVariants"]
    problems = check_text(text, cfg["chunking"]["maxCharsPerRequest"])
    if problems:
        raise TtsError("; ".join(problems))
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for v in variants:
        if v not in styles:
            raise TtsError(f"unknown style variant '{v}' (have: {', '.join(styles)})")
        data, info = synthesize_scene(client, model, voice, text, styles[v], cfg["output"]["sampleRateHz"], cfg["chunking"]["retries"], sleep)
        path = os.path.join(out_dir, f"sample_{v}.wav")
        with open(path, "wb") as f:
            f.write(data)
        out.append({"variant": v, "style": styles[v], "file": path, "durationMs": info["durationMs"], "sha256": sha256_bytes(data)})
    return {"model": model, "voice": voice, "samples": out}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s1 = sub.add_parser("sample")
    s1.add_argument("--text", required=True)
    s1.add_argument("--out", required=True)
    s1.add_argument("--variants", default="empty,user,short")
    s2 = sub.add_parser("episode")
    s2.add_argument("--job", required=True)
    s2.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("synthesize: GEMINI_API_KEY is not set", file=sys.stderr)
        return 2
    try:
        from google import genai  # google-genai >= 2.25.0
    except ImportError:
        print('synthesize: install the SDK first:  pip install "google-genai>=2.25.0"', file=sys.stderr)
        return 2
    cfg = load_config()
    client = genai.Client()
    try:
        if args.cmd == "sample":
            res = make_samples(client, cfg, args.text, args.out, [v.strip() for v in args.variants.split(",") if v.strip()])
        else:
            with open(args.job, encoding="utf8") as f:
                job = json.load(f)
            res = make_episode(client, cfg, job, args.out)
            with open(os.path.join(args.out, "voice_manifest.json"), "w", encoding="utf8") as f:
                json.dump(res, f, indent=2)
    except TtsError as e:
        print(f"synthesize: {e}", file=sys.stderr)
        return 1
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
