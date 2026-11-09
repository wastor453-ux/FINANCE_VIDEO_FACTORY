#!/usr/bin/env python3
"""Word timing for a voiceover scene: ASR word times -> SCRIPT word times.

The scene planner needs to know when each script word is spoken. A speech
recogniser (faster-whisper) gives word times, but its words differ from the
script ("57%" vs "fifty seven percent", misheard words) and its word ends
include trailing silence. This tool:
  1. aligns ASR tokens to script tokens (difflib on normalised words),
  2. interpolates the script words the ASR missed or merged, inside the span
     between neighbouring matched words (never outside it),
  3. refines every boundary against the audio's speech mask (numpy),
  4. guarantees monotonic, non-overlapping, in-range output,
  5. offers `check`, which measures the result against the audio itself.

No network, no API key. ASR is optional: --asr-json takes a saved result, so
the alignment and the check are testable without a model.
"""
import argparse, difflib, json, re, sys, wave

import numpy as np

FRAME_MS = 10


def norm(w):
    w = w.lower().replace("%", " percent ").replace("$", " dollars ")
    w = re.sub(r"[^a-z0-9' ]+", " ", w).replace("'", "")
    return w.split()


def script_tokens(text):
    """Whitespace words of the spoken text (tags already removed by the caller)."""
    return [t for t in re.split(r"\s+", text.strip()) if t]


def read_wav(path):
    with wave.open(path, "rb") as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"expected 16-bit PCM wav, got {8*sw}-bit")
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, sr


def speech_mask(x, sr):
    """Per 10 ms frame: True where speech. Threshold adapts to the clip (noise floor vs loud speech)."""
    hop = int(sr * FRAME_MS / 1000)
    n = len(x) // hop
    if n == 0:
        return np.zeros(0, dtype=bool)
    rms = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    floor, loud = np.percentile(rms, 10), np.percentile(rms, 90)
    thr = max(floor * 3.0, loud * 0.06, 1e-4)
    m = rms > thr
    # close tiny holes (plosives) and drop tiny blips
    k = 3
    closed = m.copy()
    for i in range(len(m)):
        if not m[i] and m[max(0, i - k):i].any() and m[i + 1:i + 1 + k].any():
            closed[i] = True
    return closed


def align(script, asr):
    """script: list[str]; asr: list[{word,startMs,endMs}]. Returns list of dicts (one per script word)
    with startMs/endMs/source in 'asr' | 'interp'."""
    S = [(i, norm(t)) for i, t in enumerate(script)]
    A = [(j, norm(a["word"])) for j, a in enumerate(asr)]
    # flatten to single normalised tokens, remembering the owner
    sflat = [(i, tok) for i, ts in S for tok in ts]
    aflat = [(j, tok) for j, ts in A for tok in ts]
    sm = difflib.SequenceMatcher(a=[t for _, t in sflat], b=[t for _, t in aflat], autojunk=False)
    match = {}  # script idx -> asr idx
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            si, aj = sflat[blk.a + k][0], aflat[blk.b + k][0]
            match.setdefault(si, aj)
    n = len(script)
    out = [None] * n
    for si, aj in match.items():
        out[si] = {"startMs": asr[aj]["startMs"], "endMs": asr[aj]["endMs"], "source": "asr"}
    # interpolate unmatched runs inside the span of their matched neighbours
    i = 0
    while i < n:
        if out[i] is not None:
            i += 1
            continue
        j = i
        while j < n and out[j] is None:
            j += 1
        prev_end = out[i - 1]["endMs"] if i > 0 else None
        next_start = out[j]["startMs"] if j < n else None
        # use ASR tokens that fell between the neighbours for a better span
        pj = max((match[k] for k in range(0, i) if k in match), default=-1)
        nj = min((match[k] for k in range(j, n) if k in match), default=len(asr))
        between = asr[pj + 1:nj]
        if between:
            lo, hi = between[0]["startMs"], between[-1]["endMs"]
        else:
            lo = prev_end if prev_end is not None else (next_start if next_start is not None else 0)
            hi = next_start if next_start is not None else lo
        if prev_end is not None:
            lo = max(lo, prev_end) if between else lo
        if next_start is not None:
            hi = min(hi, next_start) if between else hi
        if hi < lo:
            hi = lo
        weights = [max(1, len(re.sub(r"\W", "", script[k]))) for k in range(i, j)]
        tot, t = float(sum(weights)), float(lo)
        for k, w in zip(range(i, j), weights):
            d = (hi - lo) * w / tot
            out[k] = {"startMs": int(round(t)), "endMs": int(round(t + d)), "source": "interp"}
            t += d
        i = j
    return out


def refine(words, mask, audio_ms):
    """Pull each word's edges onto the speech mask: trim trailing silence from word ends and
    leading silence from word starts (never past the word's own midpoint), then make it monotonic."""
    nf = len(mask)

    def frame(ms):
        return min(max(int(ms // FRAME_MS), 0), max(nf - 1, 0))

    for w in words:
        s, e = w["startMs"], w["endMs"]
        if nf and e > s:
            fs, fe = frame(s), frame(e - 1)
            idx = np.nonzero(mask[fs:fe + 1])[0]
            if len(idx) == 0:
                continue  # no speech found inside this word's span: keep the ASR/interpolated time
            a, b = fs + int(idx[0]), fs + int(idx[-1])
            w["startMs"], w["endMs"] = a * FRAME_MS, (b + 1) * FRAME_MS
            w["refined"] = True
    # Claim speech the ASR left in the gaps: a word's end grows through speech that continues right after it,
    # and the next word's start grows backwards through speech right before it (split at the middle if they meet).
    for a, b in zip(words, words[1:]):
        g0, g1 = int(a["endMs"] // FRAME_MS), int(b["startMs"] // FRAME_MS)
        if g1 <= g0 or not nf:
            continue
        g1 = min(g1, nf)
        e = g0
        while e < g1 and mask[e]:
            e += 1
        st = g1
        while st > e and mask[st - 1]:
            st -= 1
        if e > g0 or st < g1:
            if e >= st:
                e = st = (g0 + g1) // 2
            a["endMs"], b["startMs"] = e * FRAME_MS, st * FRAME_MS
    prev = 0
    for w in words:
        w["startMs"] = int(min(max(w["startMs"], prev), audio_ms))
        w["endMs"] = int(min(max(w["endMs"], w["startMs"]), audio_ms))
        prev = w["endMs"]
    return words


def check(words, mask, audio_ms):
    """Measure timing against the audio itself. All numbers, no judgement beyond simple thresholds."""
    nf = len(mask)
    def frac(a, b):
        fa, fb = int(a // FRAME_MS), int(b // FRAME_MS)
        seg = mask[fa:max(fb, fa + 1)]
        return float(seg.mean()) if len(seg) else 0.0
    silent = [i for i, w in enumerate(words) if w["endMs"] - w["startMs"] >= 80 and frac(w["startMs"], w["endMs"]) < 0.3]
    gap_speech = 0
    for a, b in zip(words, words[1:]):
        g0, g1 = a["endMs"], b["startMs"]
        if g1 > g0:
            gap_speech += int(mask[int(g0 // FRAME_MS):int(g1 // FRAME_MS)].sum()) * FRAME_MS
    speech_ms = int(mask.sum()) * FRAME_MS
    last = words[-1]["endMs"] if words else 0
    # last speech frame
    idx = np.nonzero(mask)[0]
    audio_speech_end = int((idx[-1] + 1) * FRAME_MS) if len(idx) else 0
    mono = all(b["startMs"] >= a["endMs"] for a, b in zip(words, words[1:]))
    return {
        "words": len(words),
        "interpolated": sum(1 for w in words if w.get("source") == "interp"),
        "monotonic": mono,
        "silentWords": len(silent), "silentWordIdx": silent[:20],
        "gapSpeechMs": gap_speech, "speechMs": speech_ms,
        "gapSpeechShare": round(gap_speech / speech_ms, 4) if speech_ms else 0.0,
        "lastWordEndMs": last, "audioSpeechEndMs": audio_speech_end,
        "endErrorMs": abs(last - audio_speech_end), "audioMs": audio_ms,
        "pass": bool(mono and len(silent) <= max(1, len(words) // 50) and (gap_speech / speech_ms if speech_ms else 0) < 0.05 and abs(last - audio_speech_end) <= 500),
    }


def run_asr(path, model="tiny"):
    from faster_whisper import WhisperModel  # lazy: only when no --asr-json is given
    m = WhisperModel(model, device="cpu", compute_type="int8")
    segs, _ = m.transcribe(path, language="en", word_timestamps=True)
    return [{"word": w.word.strip(), "startMs": int(w.start * 1000), "endMs": int(w.end * 1000)} for s in segs for w in s.words]


def time_scene(audio, text, asr_words):
    x, sr = read_wav(audio)
    audio_ms = int(len(x) / sr * 1000)
    words = align(script_tokens(text), asr_words)
    for i, (w, t) in enumerate(zip(words, script_tokens(text))):
        w["i"], w["word"] = i, t
    refine(words, speech_mask(x, sr), audio_ms)
    return {"audioMs": audio_ms, "words": words}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("align", help="write per-word script timing for one scene")
    a.add_argument("--audio", required=True); a.add_argument("--text-file", required=True)
    a.add_argument("--asr-json", help="saved ASR result (list of words or {words:[...]}); else faster-whisper runs")
    a.add_argument("--model", default="tiny"); a.add_argument("--out", required=True)
    c = sub.add_parser("check", help="measure a timing file against the audio")
    c.add_argument("--audio", required=True); c.add_argument("--timing", required=True)
    args = ap.parse_args(argv)
    if args.cmd == "align":
        with open(args.text_file, encoding="utf8") as f:
            text = f.read()
        if args.asr_json:
            with open(args.asr_json) as f:
                d = json.load(f)
            asr = d["words"] if isinstance(d, dict) else d
        else:
            asr = run_asr(args.audio, args.model)
        res = time_scene(args.audio, text, asr)
        x, sr = read_wav(args.audio)
        res["check"] = check(res["words"], speech_mask(x, sr), res["audioMs"])
        with open(args.out, "w") as f:
            json.dump(res, f, indent=1)
        print(json.dumps(res["check"]))
        return 0 if res["check"]["pass"] else 2
    with open(args.timing) as f:
        t = json.load(f)
    x, sr = read_wav(args.audio)
    r = check(t["words"], speech_mask(x, sr), int(len(x) / sr * 1000))
    print(json.dumps(r, indent=1))
    return 0 if r["pass"] else 2


if __name__ == "__main__":
    sys.exit(main())
