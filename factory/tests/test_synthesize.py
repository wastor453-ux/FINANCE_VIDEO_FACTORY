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
        r = S.build_request("gemini-3.8-flash-tts", "en-us-enzo", "Hello there.", "calm", 24000)
        self.assertEqual(r["model"], "gemini-3.8-flash-tts")
        item = r["input"][0]["content"][0]
        self.assertEqual(r["input"][0]["type"], "user_input")
        self.assertEqual(item, {"type": "text", "text": "Hello there.", "annotations": [{"type": "speech_metadata", "style": "calm"}]})
        self.assertEqual(r["response_format"], {"type": "audio", "mime_type": "audio/wav", "sample_rate": 24000})
        self.assertEqual(r["generation_config"], {"speech_config": [{"voice": "en-us-enzo"}]})

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
        r = S.make_samples(c, CFG, "A short sample sentence for the owner.", d, ["empty", "short", "documentary"], sleep=nosleep)
        self.assertEqual([x["variant"] for x in r["samples"]], ["empty", "short", "documentary"])
        styles = [(call["input"][0]["content"][0].get("annotations") or [{}])[0].get("style", "") for call in c.calls]
        self.assertEqual(styles[0], ""); self.assertEqual(styles[1], CFG["request"]["styleVariants"]["short"]); self.assertTrue(styles[2])
        with self.assertRaises(S.TtsError):
            S.make_samples(c, CFG, "Hi there friend.", d, ["nope"], sleep=nosleep)

    def test_config_is_consistent(self):
        self.assertEqual(CFG["voice"]["id"], "en-us-enzo")
        self.assertEqual(CFG["temperature"], 0.8)
        self.assertIn("gemini-3.8", CFG["model"]["id"])
        self.assertEqual(CFG["output"]["sampleRateHz"], 24000)

    def test_config_tags_and_per_scene_delivery(self):
        allowed = CFG["request"]["inlineTags"]
        self.assertEqual(S.check_text("Pay it. <breath> Then <short pause> wait. <sigh> Done.", 1800, allowed), [])
        self.assertTrue(S.check_text("Pay it. <whisper> now.", 1800, allowed))
        self.assertTrue(S.check_text("Pay it. [pause] now.", 1800, allowed))
        job = {"scenes": []}
        self.assertEqual(S.scene_style(CFG, job, {"sceneId": "S01"}), CFG["style"])  # default stays the approved documentary style
        hook = S.scene_style(CFG, job, {"sceneId": "S01", "delivery": "hook"})
        self.assertTrue(hook.startswith(CFG["request"]["registers"]["prefix"])); self.assertIn("Engaged", hook)
        self.assertEqual(S.scene_style(CFG, job, {"sceneId": "S01", "delivery": "hook", "style": "x"}), "x")
        with self.assertRaises(S.TtsError): S.scene_style(CFG, job, {"sceneId": "S01", "delivery": "nope"})

    def test_episode_uses_each_scenes_style(self):
        c = FakeClient([tone_wav(1500)])
        with tempfile.TemporaryDirectory() as d:
            job = {"scenes": [{"sceneId": "S01", "text": "Hello there friend.", "delivery": "hook"}, {"sceneId": "S02", "text": "Second scene text."}]}
            m = S.make_episode(c, CFG, job, d, nosleep)
        styles = [x["input"][0]["content"][0]["annotations"][0]["style"] for x in c.calls]
        self.assertIn("Engaged", styles[0]); self.assertEqual(styles[1], CFG["style"])
        self.assertEqual(m["scenes"][0]["style"], styles[0])

    def test_samples_accept_configured_tags(self):
        c = FakeClient([tone_wav(1500)])
        with tempfile.TemporaryDirectory() as d:
            r = S.make_samples(c, CFG, "Look at this. <breath> It works.", d, ["short"], sleep=nosleep)
        self.assertEqual(len(r["samples"]), 1)

    def test_fallback_tags_equal_config_and_script_schema_enum_equals_registers(self):
        self.assertEqual(S.ALLOWED_TAGS, set(CFG["request"]["inlineTags"]))
        sch = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "schemas", "script.schema.json")))
        enum = sch["properties"]["scenes"]["items"]["properties"]["delivery"]["enum"]
        self.assertEqual(sorted(enum), sorted(CFG["request"]["registers"]["byId"]))
        rules = " ".join(CFG["styleRules"])
        self.assertIn("<breath>", rules); self.assertNotIn("identical for every request", rules)

    # ---- sanitizer, temperature, single take (merged from the AI Studio update, hardened) ----
    def test_sanitize_removes_every_dash_and_hyphen(self):
        raw = "Twenty-one percent \u2014 up from fifteen - twenty. It's a one-on-one deal, -5 percent."
        out = S.sanitize_spoken_text(raw)
        for ch in "-\u2013\u2014": self.assertNotIn(ch, out)
        self.assertIn("Twenty one percent", out); self.assertIn("one on one", out)
        self.assertEqual(S.sanitize_spoken_text(""), "")

    def test_requests_are_sanitized_and_temperature_is_sent_only_when_configured(self):
        c = FakeClient([tone_wav(1500)])
        S.synthesize_scene(c, "m", "v", "Twenty-one percent.", "", sleep=nosleep, temperature=0.8)
        sent = c.calls[0]
        self.assertEqual(sent["input"][0]["content"][0]["text"], "Twenty one percent.")
        self.assertEqual(sent["generation_config"]["temperature"], 0.8)
        self.assertNotIn("temperature", S.build_request("m", "v", "Hi.", "")["generation_config"])
        self.assertEqual(S.request_temperature(CFG), 0.8)
        self.assertIsNone(S.request_temperature({"temperature": 0.8, "request": {}}))

    def _master(self, scene_ms, pause_ms=1200):
        """A fake episode: tone per scene separated by silence, like a single take with <long pause>."""
        rate = 24000
        def w(ms, silent):
            return tone_wav(ms, silent=silent)
        parts = []
        for i, ms in enumerate(scene_ms):
            parts.append(("tone", ms))
            if i < len(scene_ms) - 1: parts.append(("quiet", pause_ms))
        frames = b""
        for kind, ms in parts:
            with wave.open(io.BytesIO(w(ms, kind == "quiet"))) as r: frames += r.readframes(r.getnframes())
        buf = io.BytesIO()
        with wave.open(buf, "wb") as o:
            o.setnchannels(1); o.setsampwidth(2); o.setframerate(rate); o.writeframes(frames)
        return buf.getvalue()

    def test_single_take_cuts_at_the_scene_pauses(self):
        master = self._master([4000, 6000, 5000])
        job = {"scenes": [{"sceneId": "S01", "text": "one two three four"}, {"sceneId": "S02", "text": "one two three four five six"}, {"sceneId": "S03", "text": "one two three four five"}]}
        with tempfile.TemporaryDirectory() as d:
            c = FakeClient([master])
            m = S.make_episode(c, CFG, job, d, nosleep, single_take=True)
            self.assertEqual(len(c.calls), 1)                       # ONE request for the whole episode
            self.assertEqual(m["mode"], "single_take")
            self.assertEqual([x["sceneId"] for x in m["scenes"]], ["S01", "S02", "S03"])
            for got, want in zip(m["scenes"], [4000, 6000, 5000]):
                self.assertAlmostEqual(got["durationMs"], want, delta=1500)  # pause is split between neighbours
            self.assertTrue(os.path.exists(os.path.join(d, "episode_master_raw.wav")))
            self.assertIn("<long pause>", c.calls[0]["input"][0]["content"][0]["text"])
            c2 = FakeClient([RuntimeError("must not be called")])    # resume: the raw master is reused, no second paid request
            m2 = S.make_episode(c2, CFG, job, d, nosleep, single_take=True)
            self.assertEqual(c2.calls, []); self.assertEqual(len(m2["scenes"]), 3)

    def test_single_take_refuses_an_untrusted_cut_instead_of_slicing_mid_word(self):
        job = {"scenes": [{"sceneId": "S01", "text": "one two three four"}, {"sceneId": "S02", "text": "one two three four"}]}
        no_pause = tone_wav(8000)                                    # no silence anywhere
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(S.TtsError, "per-scene mode"):
                S.make_episode(FakeClient([no_pause]), CFG, job, d, nosleep, single_take=True)
        # a pause far from where the word share says the boundary must be
        with self.assertRaises(S.TtsError):
            S.choose_split_points([(1000, 1500)], [100, 100], 100000)

    def test_single_take_size_limit(self):
        job = {"scenes": [{"sceneId": "S01", "text": "word " * 3000}, {"sceneId": "S02", "text": "word " * 3000}]}
        cfg = json.loads(json.dumps(CFG)); cfg["chunking"]["singleTakeMaxChars"] = 1000; cfg["chunking"]["maxCharsPerRequest"] = 99999
        with self.assertRaisesRegex(S.TtsError, "single take is"):
            S.make_episode(FakeClient([tone_wav(1000)]), cfg, job, tempfile.mkdtemp(), nosleep, single_take=True)

    def test_per_scene_resume_reuses_valid_clips(self):
        job = {"scenes": [{"sceneId": "S01", "text": "First scene text."}, {"sceneId": "S02", "text": "Second scene text."}]}
        with tempfile.TemporaryDirectory() as d:
            S.make_episode(FakeClient([tone_wav(1500)]), CFG, job, d, nosleep)
            c = FakeClient([tone_wav(1500)])
            S.make_episode(c, CFG, job, d, nosleep)
            self.assertEqual(c.calls, [])


if __name__ == "__main__":
    unittest.main()
