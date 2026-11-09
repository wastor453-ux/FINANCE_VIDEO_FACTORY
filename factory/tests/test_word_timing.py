import os, sys, tempfile, unittest, wave, json
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import word_timing as W

SR = 24000

def make_wav(segments, total_ms):
    """segments: list of (startMs, endMs) of loud tone; the rest is near-silence."""
    x = np.random.RandomState(1).normal(0, 0.0005, int(SR * total_ms / 1000)).astype(np.float32)
    for a, b in segments:
        t = np.arange(int(SR * a / 1000), int(SR * b / 1000))
        x[t] += 0.3 * np.sin(2 * np.pi * 220 * t / SR)
    p = tempfile.mktemp(suffix=".wav")
    with wave.open(p, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return p

def aw(word, s, e): return {"word": word, "startMs": s, "endMs": e}

class AlignTests(unittest.TestCase):
    def test_exact_words_keep_asr_times(self):
        out = W.align(["Hello", "there", "friend"], [aw("Hello", 0, 400), aw("there,", 500, 900), aw("friend.", 1000, 1500)])
        self.assertEqual([o["startMs"] for o in out], [0, 500, 1000])
        self.assertTrue(all(o["source"] == "asr" for o in out))

    def test_digits_and_percent_are_interpolated_inside_neighbours(self):
        script = "spent fifty seven percent of the time".split()
        asr = [aw("spent", 0, 300), aw("57", 300, 1100), aw("%", 1100, 1500), aw("of", 1500, 1600), aw("the", 1600, 1700), aw("time", 1700, 2000)]
        out = W.align(script, asr)
        self.assertEqual(len(out), 7)
        mid = out[1:3]  # "fifty seven" (digits); "percent" matches the ASR "%"
        self.assertTrue(all(o["source"] == "interp" for o in mid))
        self.assertGreaterEqual(mid[0]["startMs"], 300); self.assertLessEqual(mid[-1]["endMs"], 1100)
        self.assertEqual(out[4]["startMs"], 1500)

    def test_misheard_word_gets_its_slot(self):
        out = W.align("one big deal today".split(), [aw("one", 0, 200), aw("bag", 200, 600), aw("deal", 600, 900), aw("today", 900, 1300)])
        self.assertEqual((out[1]["startMs"], out[1]["endMs"]), (200, 600))

    def test_missing_asr_word_never_leaves_its_neighbours(self):
        out = W.align("a b c d".split(), [aw("a", 0, 100), aw("d", 900, 1000)])
        self.assertGreaterEqual(out[1]["startMs"], 100); self.assertLessEqual(out[2]["endMs"], 900)
        self.assertEqual(len(out), 4)

    def test_empty_asr_gives_zero_width_not_crash(self):
        out = W.align("a b".split(), [])
        self.assertEqual(len(out), 2)

class RefineTests(unittest.TestCase):
    def test_trailing_silence_is_trimmed_and_output_is_monotonic(self):
        p = make_wav([(100, 500), (1500, 1900)], 2200)
        x, sr = W.read_wav(p); m = W.speech_mask(x, sr)
        words = [{"startMs": 0, "endMs": 1400, "source": "asr"}, {"startMs": 1400, "endMs": 2200, "source": "asr"}]
        W.refine(words, m, 2200)
        self.assertLess(words[0]["endMs"], 600); self.assertGreater(words[0]["endMs"], 450)
        self.assertGreaterEqual(words[1]["startMs"], 1450)
        self.assertLessEqual(words[1]["endMs"], 2000)
        self.assertTrue(words[1]["startMs"] >= words[0]["endMs"])

    def test_check_passes_good_timing_and_flags_a_word_over_silence(self):
        p = make_wav([(100, 500), (1500, 1900)], 2000)
        x, sr = W.read_wav(p); m = W.speech_mask(x, sr)
        good = [{"startMs": 100, "endMs": 500, "source": "asr"}, {"startMs": 1500, "endMs": 1900, "source": "asr"}]
        self.assertTrue(W.check(good, m, 2000)["pass"])
        bad = [{"startMs": 100, "endMs": 500, "source": "asr"}, {"startMs": 700, "endMs": 1300, "source": "asr"}]
        r = W.check(bad, m, 2000)
        self.assertEqual(r["silentWords"], 1); self.assertFalse(r["pass"])

class GapClaimTests(unittest.TestCase):
    def test_speech_the_asr_left_in_a_gap_is_claimed_by_the_neighbour(self):
        p = make_wav([(100, 900), (1200, 1600)], 1800)   # word 1 really ends at 900, ASR said 500
        x, sr = W.read_wav(p); m = W.speech_mask(x, sr)
        words = [{"startMs": 100, "endMs": 500, "source": "asr"}, {"startMs": 1200, "endMs": 1600, "source": "asr"}]
        W.refine(words, m, 1800)
        self.assertGreaterEqual(words[0]["endMs"], 880)
        self.assertEqual(W.check(words, m, 1800)["gapSpeechMs"], 0)
        self.assertLessEqual(words[0]["endMs"], words[1]["startMs"])

class EndToEnd(unittest.TestCase):
    def test_cli_align_with_saved_asr(self):
        p = make_wav([(0, 400), (500, 900), (1000, 1500)], 1600)
        d = tempfile.mkdtemp()
        tf, af, of = (os.path.join(d, n) for n in ("t.txt", "a.json", "o.json"))
        with open(tf, "w") as f:
            f.write("Hello there friend")
        with open(af, "w") as f:
            json.dump({"words": [aw("Hello", 0, 480), aw("there", 480, 1000), aw("friend", 1000, 1600)]}, f)
        rc = W.main(["align", "--audio", p, "--text-file", tf, "--asr-json", af, "--out", of])
        with open(of) as f:
            res = json.load(f)
        self.assertEqual(rc, 0)
        self.assertEqual([w["word"] for w in res["words"]], ["Hello", "there", "friend"])
        self.assertLessEqual(res["words"][0]["endMs"], 450)

if __name__ == "__main__":
    unittest.main()
