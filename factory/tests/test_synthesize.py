import base64, io, json, os, sys, tempfile, unittest, wave, struct, math
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import synthesize as S  # noqa: E402


def tone_wav(ms=1500, rate=24000, amp=8000, silent=False):
    n = int(rate * ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", 0 if silent else int(amp * math.sin(2 * math.pi * 220 * i / rate))) for i in range(n)))
    return buf.getvalue()


class FakeClient:
    """Records every call; behaves like client.interactions.create(...).output_audio.data."""
    def __init__(self, outputs):
        self.calls, self.outputs = [], list(outputs)
        self.interactions = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(kw)
        out = self.outputs.pop(0) if len(self.outputs) > 1 else self.outputs[0]
        if isinstance(out, Exception):
            raise out
        return SimpleNamespace(output_audio=SimpleNamespace(data=base64.b64encode(out).decode()))


CFG = S.load_config()
nosleep = lambda s: None


class Tests(unittest.TestCase):
    def test_request_shape_matches_documented_call(self):
        r = S.build_request("gemini-3.8-flash-tts", "en-us-koda", "Hello there.", "calm", 24000)
        self.assertEqual(r["model"], "gemini-3.8-flash-tts")
        item = r["input"][0]["content"][0]
        self.assertEqual(r["input"][0]["type"], "user_input")
        self.assertEqual(item, {"type": "text", "text": "Hello there.", "annotations": [{"type": "speech_metadata", "style": "calm"}]})
        self.assertEqual(r["response_format"], {"type": "audio", "mime_type": "audio/wav", "sample_rate": 24000})
        self.assertEqual(r["generation_config"], {"speech_config": [{"voice": "en-us-koda"}]})

    def test_empty_style_sends_no_annotation(self):
        item = S.build_request("m", "v", "Hi.", "")["input"][0]["content"][0]
        self.assertNotIn("annotations", item)

    def test_text_rules(self):
        self.assertEqual(S.check_text("A calm sentence, with a <short pause> and a <long pause> here.", 1800), [])
        self.assertTrue(S.check_text("", 1800))
        self.assertTrue(any("stage direction" in p for p in S.check_text("[pause 300ms] Hello", 1800)))
        self.assertTrue(any("stage direction" in p for p in S.check_text("Hello (whispering) there", 1800)))
        self.assertTrue(any("not allowed" in p for p in S.check_text("Big win <applause>", 1800)))
        self.assertTrue(any("not allowed" in p for p in S.check_text("Ha <laugh>", 1800)))
        self.assertTrue(any("limit is 10" in p for p in S.check_text("x" * 11, 10)))

    def test_clip_validation(self):
        c = FakeClient([tone_wav(1500)])
        data, info = S.synthesize_scene(c, "m", "v", "Hello.", "", sleep=nosleep)
        self.assertEqual(info["durationMs"], 1500); self.assertEqual(info["sampleRateHz"], 24000)
        with self.assertRaisesRegex(S.TtsError, "silent"):
            S.synthesize_scene(FakeClient([tone_wav(1500, silent=True)]), "m", "v", "Hello.", "", retries=0, sleep=nosleep)
        with self.assertRaisesRegex(S.TtsError, "only 200 ms"):
            S.synthesize_scene(FakeClient([tone_wav(200)]), "m", "v", "Hello.", "", retries=0, sleep=nosleep)
        with self.assertRaisesRegex(S.TtsError, "RIFF"):
            S.synthesize_scene(FakeClient([b"\x00\x01raw-pcm-not-wav" * 100]), "m", "v", "Hello.", "", retries=0, sleep=nosleep)

    def test_retries_transient_errors_then_reports_real_message(self):
        c = FakeClient([RuntimeError("503 unavailable"), tone_wav(1200)])
        _, info = S.synthesize_scene(c, "m", "v", "Hello.", "", retries=2, sleep=nosleep)
        self.assertEqual(len(c.calls), 2)
        bad = FakeClient([RuntimeError("quota exceeded")])
        with self.assertRaisesRegex(S.TtsError, "after 3 attempts.*quota exceeded"):
            S.synthesize_scene(bad, "m", "v", "Hello.", "", retries=2, sleep=nosleep)

    def test_episode_writes_files_and_a_schema_shaped_manifest(self):
        d = tempfile.mkdtemp()
        job = {"style": "calm", "gapMs": 200, "scenes": [{"sceneId": "s1", "text": "First scene text."}, {"sceneId": "s2", "text": "Second scene text."}]}
        c = FakeClient([tone_wav(2000), tone_wav(1000)])
        m = S.make_episode(c, CFG, job, d, sleep=nosleep)
        self.assertEqual([s["startMs"] for s in m["scenes"]], [0, 2200])
        self.assertEqual(m["totalMs"], 3200)
        self.assertFalse(m["approved"])
        self.assertEqual(m["voice"], CFG["voice"]["id"]); self.assertEqual(m["model"], CFG["model"]["id"])
        self.assertTrue(all(os.path.getsize(os.path.join(d, s["file"])) > 1000 for s in m["scenes"]))
        self.assertEqual(c.calls[0]["input"][0]["content"][0]["annotations"][0]["style"], "calm")
        json.dump(m, open(os.path.join(d, "voice_manifest.json"), "w"))
        self.manifest_path = os.path.join(d, "voice_manifest.json")
        print("MANIFEST", self.manifest_path)

    def test_episode_refuses_bad_text_before_calling_the_api(self):
        c = FakeClient([tone_wav(1000)])
        with self.assertRaisesRegex(S.TtsError, "not ready for narration"):
            S.make_episode(c, CFG, {"scenes": [{"sceneId": "s1", "text": "[pause] hi"}]}, tempfile.mkdtemp(), sleep=nosleep)
        self.assertEqual(c.calls, [])

    def test_samples_use_each_style_variant(self):
        d = tempfile.mkdtemp()
        c = FakeClient([tone_wav(1500)])
        r = S.make_samples(c, CFG, "A short sample sentence for the owner.", d, ["empty", "user", "short"], sleep=nosleep)
        self.assertEqual([x["variant"] for x in r["samples"]], ["empty", "user", "short"])
        styles = [(call["input"][0]["content"][0].get("annotations") or [{}])[0].get("style", "") for call in c.calls]
        self.assertEqual(styles[0], ""); self.assertEqual(styles[1], CFG["style"]); self.assertTrue(styles[2])
        with self.assertRaises(S.TtsError):
            S.make_samples(c, CFG, "Hi there friend.", d, ["nope"], sleep=nosleep)

    def test_config_is_consistent(self):
        self.assertEqual(CFG["voice"]["id"], "en-us-koda")
        self.assertIn("gemini-3.8", CFG["model"]["id"])
        self.assertEqual(CFG["output"]["sampleRateHz"], 24000)


if __name__ == "__main__":
    unittest.main()
