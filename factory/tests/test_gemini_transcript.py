import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import gemini_transcript as G


class FakeInteraction:
    def __init__(self, text):
        self.output_text = text


class FakeClient:
    def __init__(self, text=None, exc=None):
        self.calls = []
        outer = self

        class _I:
            def create(self, **kw):
                outer.calls.append(kw)
                if exc:
                    raise exc
                return FakeInteraction(text)

        self.interactions = _I()


SAMPLE = "[00:00] Welcome back everyone.\n[00:05] Here are seven ways.\nnoise line\n[1:02:03] Last point here.\n"


class GeminiTranscriptTests(unittest.TestCase):
    def test_request_shape(self):
        r = G.build_request("m", "hriu0irRcpE")
        self.assertEqual(r["model"], "m")
        self.assertEqual(r["input"][1], {"type": "video", "uri": "https://www.youtube.com/watch?v=hriu0irRcpE"})

    def test_parse_lines(self):
        self.assertEqual(G.parse_lines(SAMPLE), [(0, "Welcome back everyone."), (5000, "Here are seven ways."), (3723000, "Last point here.")])

    def test_srt_cues_chain_and_tail(self):
        srt = G.to_srt([(0, "a"), (5000, "b")])
        self.assertIn("00:00:00,000 --> 00:00:05,000\na", srt)
        self.assertIn("00:00:05,000 --> 00:00:09,000\nb", srt)

    def test_backwards_timestamps_rejected(self):
        with self.assertRaises(G.TranscriptError):
            G.to_srt([(5000, "a"), (1000, "b")])

    def test_run_writes_files(self):
        d = tempfile.mkdtemp()
        res = G.run(FakeClient(SAMPLE), "m", "hriu0irRcpE", d)
        self.assertEqual(res["cues"], 3)
        self.assertTrue(os.path.exists(os.path.join(d, "transcript.srt")))
        self.assertTrue(os.path.exists(os.path.join(d, "transcript.raw.txt")))

    def test_api_error_is_reported_not_retried(self):
        c = FakeClient(exc=RuntimeError("boom"))
        with self.assertRaises(G.TranscriptError):
            G.run(c, "m", "hriu0irRcpE", tempfile.mkdtemp())
        self.assertEqual(len(c.calls), 1)

    def test_empty_and_untimed_output(self):
        with self.assertRaises(G.TranscriptError):
            G.run(FakeClient("   "), "m", "hriu0irRcpE", tempfile.mkdtemp())
        with self.assertRaises(G.TranscriptError):
            G.run(FakeClient("just prose with no stamps"), "m", "hriu0irRcpE", tempfile.mkdtemp())


class ProxyEnvTests(unittest.TestCase):
    def test_only_bracketed_entries_removed(self):
        from proxy_env import clean_no_proxy
        env = {"no_proxy": "localhost,[::1],127.0.0.1,[::]", "NO_PROXY": "localhost,127.0.0.1", "HTTPS_PROXY": "http://x:1"}
        removed = clean_no_proxy(env)
        self.assertEqual(env["no_proxy"], "localhost,127.0.0.1")
        self.assertEqual(env["NO_PROXY"], "localhost,127.0.0.1")
        self.assertEqual(env["HTTPS_PROXY"], "http://x:1")
        self.assertEqual(removed, ["[::1]", "[::]"])

    def test_missing_vars_ok(self):
        from proxy_env import clean_no_proxy
        self.assertEqual(clean_no_proxy({}), [])


if __name__ == "__main__":
    unittest.main()
