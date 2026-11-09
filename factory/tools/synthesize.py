#!/usr/bin/env python3
"""Gemini TTS narration for the Finance Video Factory.

Calls follow the request shape in Google's "Text-to-speech generation (TTS)" page for the Gemini 3.8 TTS
models (Interactions API): `client.interactions.create(model=..., input=[user_input/text + speech_metadata
annotation], response_format={"type": "audio", ...}, generation_config={"speech_config": [{"voice": ...}]})`
and the audio is `interaction.output_audio.data` (base64 WAV, 24 kHz mono 16-bit by default).

Two ways to narrate an episode:
- per scene (default): one request per scene, resume-safe (a valid clip on disk is never re-requested). Each scene may use
  its own delivery register.
- single take (--single-take): the whole script in ONE request for a steady voice, then cut at the pauses between scenes.
  One style for the whole episode (registers are not used). A cut that cannot be proven right fails loudly instead of
  slicing mid-word. STATUS: not yet verified at full episode length against the live service; run the 3-scene check
  in docs/STATUS.md first.

Text is sanitized before every request: hyphens and dashes are removed because the model's number normalizer can read
them aloud as "minus". The script gate also flags them so the writer fixes the source text.

Usage:
  python3 factory/tools/synthesize.py sample --text "..." --out DIR [--variants empty,user,short]
  python3 factory/tools/synthesize.py episode --job tts_job.json --out DIR [--single-take]
The API key is read from the environment (GEMINI_API_KEY, backup GEMINI_API_KEY_2) and is never printed or written.
"""
import argparse
import array
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

# Fallback only; config/voice.json request.inlineTags is the source of truth (a test keeps the two equal).
ALLOWED_TAGS = {"<short pause>", "<long pause>", "<breath>", "<sigh>"}
# Anything that looks like a stage direction must not be in the spoken text (it would be read aloud).
STAGE_DIRECTION = re.compile(r"\[[^\]]*\]|\([^)]*(pause|whisper|sigh|laugh|slow|fast|tone)[^)]*\)", re.I)


class TtsError(Exception):
    pass


def load_config(path=CONFIG):
    with open(path, encoding="utf8") as f:
        return json.load(f)


def sanitize_spoken_text(text):
    """Remove hyphens and dashes before TTS (read aloud as 'minus'): dashes become commas, hyphenated words become two words."""
    if not text:
        return text
    text = re.sub(r"[\u2013\u2014]", ", ", text)        # en/em dash -> comma
    text = re.sub(r"\s+-+\s+", ", ", text)                # spaced hyphen(s) -> comma
    text = re.sub(r"(?<=\w)-+(?=\w)", " ", text)         # twenty-one -> twenty one
    text = text.replace("-", " ")                           # any remaining hyphen (e.g. a leading minus sign)
    text = re.sub(r",(\s*,)+", ",", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def check_text(text, max_chars, allowed=None):
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
        if tag not in (allowed or ALLOWED_TAGS):
            problems.append(f"tag {tag} is not allowed (only {', '.join(sorted(allowed or ALLOWED_TAGS))}); sound effects are never requested from the voice")
    return problems


def build_request(model, voice, text, style, sample_rate=24000, temperature=None):
    """The exact keyword arguments for client.interactions.create (kept pure so tests can assert them)."""
    item = {"type": "text", "text": text}
    if style:
        item["annotations"] = [{"type": "speech_metadata", "style": style}]
    gen = {"speech_config": [{"voice": voice}]}
    if temperature is not None:
        gen["temperature"] = temperature  # UNVERIFIED field name for the Interactions API; see request.sendTemperature in voice.json
    return {
        "model": model,
        "input": [{"type": "user_input", "content": [item]}],
        "response_format": {"type": "audio", "mime_type": "audio/wav", "sample_rate": sample_rate},
        "generation_config": gen,
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


def synthesize_scene(client, model, voice, text, style, sample_rate=24000, retries=2, sleep=time.sleep, min_ms=500, min_rms=30.0, temperature=None):
    """One validated narration clip. Retries transient failures; a silent or too-short clip is an error."""
    last = None
    for attempt in range(retries + 1):
        if attempt:
            sleep(1.5 * 2 ** (attempt - 1))
        try:
            interaction = client.interactions.create(**build_request(model, voice, sanitize_spoken_text(text), style, sample_rate, temperature))
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


def scene_style(cfg, job, scene):
    """Style for one scene: explicit style > delivery register (prefix + register) > job style > config style."""
    if scene.get("style"):
        return scene["style"]
    reg = cfg.get("request", {}).get("registers", {})
    if scene.get("delivery"):
        if scene["delivery"] not in reg.get("byId", {}):
            raise TtsError(f'{scene["sceneId"]}: unknown delivery "{scene["delivery"]}" (have: {", ".join(reg.get("byId", {}))})')
        return f'{reg.get("prefix", "").strip()} {reg["byId"][scene["delivery"]]}'.strip()
    return job["style"] if "style" in job else cfg["style"]


def request_temperature(cfg):
    """Temperature to send, or None. Sent only when voice.json request.sendTemperature is true (field name unverified)."""
    return cfg.get("temperature") if cfg.get("request", {}).get("sendTemperature") else None


def find_silences(wav_data, floor_rms=350, win_ms=50, min_ms=250):
    """[(center_ms, duration_ms)] for every near-silent stretch of at least min_ms."""
    with wave.open(io.BytesIO(wav_data), "rb") as w:
        rate = w.getframerate()
        a = array.array("h")
        a.frombytes(w.readframes(w.getnframes()))
    win = max(1, int(rate * win_ms / 1000))
    out, start = [], None
    n = len(a) // win
    for k in range(n + 1):
        quiet = False
        if k < n:
            seg = a[k * win:(k + 1) * win]
            quiet = (sum(x * x for x in seg) / len(seg)) ** 0.5 < floor_rms
        if quiet and start is None:
            start = k
        elif not quiet and start is not None:
            dur = (k - start) * win_ms
            if dur >= min_ms:
                out.append((int((start * win_ms) + dur / 2), dur))
            start = None
    return out


def choose_split_points(silences, scene_words, total_ms, tolerance=0.08):
    """Pick the (scenes-1) longest pauses, in time order, and prove each sits where the word share says its scene boundary should be.
    Raises TtsError instead of returning a cut that could land mid-sentence."""
    need = len(scene_words) - 1
    if need <= 0:
        return []
    if len(silences) < need:
        raise TtsError(f"found {len(silences)} pauses but need {need} scene boundaries; use per-scene mode")
    picked = sorted(sorted(silences, key=lambda x: -x[1])[:need])
    total_words = max(1, sum(scene_words))
    run = 0
    for i, (ms, dur) in enumerate(picked):
        run += scene_words[i]
        expected = total_ms * run / total_words
        if abs(ms - expected) > tolerance * total_ms:
            raise TtsError(f"pause for boundary {i + 1} is at {ms / 1000:.0f}s but the word share expects about {expected / 1000:.0f}s; cut not trusted, use per-scene mode")
    return [ms for ms, _ in picked]


def slice_wav(wav_data, split_points_ms):
    """Cut a WAV at the given millisecond offsets; returns one WAV (bytes) per segment."""
    with wave.open(io.BytesIO(wav_data), "rb") as w:
        params, frames = w.getparams(), w.readframes(w.getnframes())
    bpm = params.framerate * params.sampwidth * params.nchannels / 1000
    frame_bytes = params.sampwidth * params.nchannels
    cuts = [0] + [int(ms * bpm) // frame_bytes * frame_bytes for ms in split_points_ms] + [len(frames)]
    out = []
    for lo, hi in zip(cuts, cuts[1:]):
        buf = io.BytesIO()
        with wave.open(buf, "wb") as o:
            o.setparams(params)
            o.writeframes(frames[lo:hi])
        out.append(buf.getvalue())
    return out


def _scene_names(job):
    return [s["sceneId"] for s in job["scenes"]]


def make_episode(client, cfg, job, out_dir, sleep=time.sleep, single_take=False):
    """Synthesize the episode and return a voice_manifest dict (schema: voice_manifest). approved is always False here."""
    model = job.get("model") or cfg["model"]["id"]
    voice = job.get("voice") or cfg["voice"]["id"]
    style = job["style"] if "style" in job else cfg["style"]
    temp = request_temperature(cfg)
    max_chars = cfg["chunking"]["maxCharsPerRequest"]
    rate, retries = cfg["output"]["sampleRateHz"], cfg["chunking"]["retries"]
    gap_ms = int(job.get("gapMs", 200))
    single_take = single_take or bool(job.get("singleTake"))
    if not job.get("scenes"):
        raise TtsError("job has no scenes")
    os.makedirs(out_dir, exist_ok=True)
    problems = []
    for s in job["scenes"]:
        problems += [f'{s["sceneId"]}: {p}' for p in check_text(s["text"], max_chars, cfg["request"].get("inlineTags"))]
    if problems:
        raise TtsError("script text not ready for narration:\n  " + "\n  ".join(problems))

    scenes, cursor = [], 0
    if single_take:
        texts = [sanitize_spoken_text(s["text"]) for s in job["scenes"]]
        master = " <long pause> ".join(texts)
        cap = cfg["chunking"].get("singleTakeMaxChars", 25000)
        if len(master) > cap:
            raise TtsError(f"single take is {len(master)} chars; limit is {cap}. Use per-scene mode or split the episode in two takes")
        raw_path = os.path.join(out_dir, "episode_master_raw.wav")
        if os.path.exists(raw_path):  # resume: never pay twice for a valid master
            with open(raw_path, "rb") as f:
                master_wav = f.read()
            ms_total = wav_info(master_wav)[0]
        else:
            master_wav, info = synthesize_scene(client, model, voice, master, style, rate, retries, sleep, temperature=temp)
            ms_total = info["durationMs"]
            with open(raw_path, "wb") as f:
                f.write(master_wav)
        words = [len(t.replace("<long pause>", " ").replace("<short pause>", " ").split()) for t in texts]
        cuts = choose_split_points(find_silences(master_wav), words, ms_total)
        for sid, chunk in zip(_scene_names(job), slice_wav(master_wav, cuts)):
            ms, r, ch, rms = wav_info(chunk)
            name = f"{sid}.wav"
            with open(os.path.join(out_dir, name), "wb") as f:
                f.write(chunk)
            scenes.append({"sceneId": sid, "file": name, "style": style, "durationMs": ms, "sha256": sha256_bytes(chunk), "startMs": cursor})
            cursor += ms + gap_ms
        total = cursor - gap_ms
    else:
        for s in job["scenes"]:
            name = f'{s["sceneId"]}.wav'
            path = os.path.join(out_dir, name)
            st = scene_style(cfg, job, s)
            data = None
            if os.path.exists(path):  # resume: reuse a valid clip already on disk
                with open(path, "rb") as f:
                    old = f.read()
                try:
                    ms, r, ch, rms = wav_info(old)
                    if ms >= 500 and rms >= 30.0:
                        data, info = old, {"durationMs": ms}
                except TtsError:
                    pass
            if data is None:
                data, info = synthesize_scene(client, model, voice, s["text"], st, rate, retries, sleep, temperature=temp)
                with open(path, "wb") as f:
                    f.write(data)
            scenes.append({"sceneId": s["sceneId"], "file": name, "style": st, "durationMs": info["durationMs"], "sha256": sha256_bytes(data), "startMs": cursor})
            cursor += info["durationMs"] + gap_ms
        total = scenes[-1]["startMs"] + scenes[-1]["durationMs"]
    return {
        "schema_version": "1.0", "provider": cfg["provider"], "model": model, "voice": voice, "style": style,
        "temperature": cfg.get("temperature"), "temperatureSent": temp is not None, "mode": "single_take" if single_take else "per_scene",
        "sampleRateHz": rate, "scenes": scenes, "totalMs": total, "approved": False,
    }


def make_samples(client, cfg, text, out_dir, variants, sleep=time.sleep):
    """Same text rendered with different style strings so the owner can choose by ear."""
    model, voice = cfg["model"]["id"], cfg["voice"]["id"]
    styles = cfg["request"]["styleVariants"]
    problems = check_text(text, cfg["chunking"]["maxCharsPerRequest"], cfg["request"].get("inlineTags"))
    if problems:
        raise TtsError("; ".join(problems))
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for v in variants:
        if v not in styles:
            raise TtsError(f"unknown style variant '{v}' (have: {', '.join(styles)})")
        data, info = synthesize_scene(client, model, voice, text, styles[v], cfg["output"]["sampleRateHz"], cfg["chunking"]["retries"], sleep, temperature=request_temperature(cfg))
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
    s2.add_argument("--single-take", action="store_true", help="whole script in one request, cut at the pauses between scenes")
    args = ap.parse_args(argv)
    if not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
        print("synthesize: GEMINI_API_KEY is not set", file=sys.stderr)
        return 2
    sys.path.insert(0, HERE)
    from proxy_env import clean_no_proxy
    clean_no_proxy()  # bracketed IPv6 no_proxy entries crash httpx before any call
    try:
        from google import genai  # google-genai >= 2.25.0
    except ImportError:
        print('synthesize: install the SDK first:  pip install "google-genai>=2.25.0"', file=sys.stderr)
        return 2
    cfg = load_config()
    from keyfail import make_client
    # Hard wall-clock limit per request (the SDK's own timeout did not stop calls that hung for 20 minutes).
    # A single take is one long request, so it gets a longer limit; a timeout moves to the backup key.
    dl = cfg["chunking"].get("singleTakeDeadlineSec", 600) if (args.cmd == "episode" and args.single_take) else cfg["chunking"].get("deadlineSec", 120)
    client = make_client(genai, deadline=dl)
    try:
        if args.cmd == "sample":
            res = make_samples(client, cfg, args.text, args.out, [v.strip() for v in args.variants.split(",") if v.strip()])
        else:
            with open(args.job, encoding="utf8") as f:
                job = json.load(f)
            res = make_episode(client, cfg, job, args.out, single_take=args.single_take)
            with open(os.path.join(args.out, "voice_manifest.json"), "w", encoding="utf8") as f:
                json.dump(res, f, indent=2)
    except TtsError as e:
        print(f"synthesize: {e}", file=sys.stderr)
        return 1
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
