import io, json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import hosted_transcript as H  # noqa: E402


class Resp:
    def __init__(self, body): self.b = body
    def read(self): return json.dumps(self.b).encode()
    def __enter__(self): return self
    def __exit__(self, *a): return False


class T(unittest.TestCase):
    def test_millisecond_and_second_items(self):
        self.assertEqual(H.cue_times({"offset": 1500, "duration": 2500}), (1.5, 4.0))
        self.assertEqual(H.cue_times({"start": 3.0, "dur": 2.0}), (3.0, 5.0))
        self.assertEqual(H.cue_times({"start": 3.0}), (3.0, 5.0))

    def test_srt_format_and_blank_text_skipped(self):
        srt = H.to_srt([{"offset": 0, "duration": 1000, "text": "Hello"}, {"offset": 1000, "duration": 500, "text": "  "}, {"offset": 3723456, "duration": 1000, "text": "Late"}])
        self.assertIn("00:00:00,000 --> 00:00:01,000\nHello", srt)
        self.assertIn("01:02:03,456 --> 01:02:04,456\nLate", srt)
        self.assertNotIn("\n2\n", srt.replace("\n1\n", "\n"))  # the blank cue is dropped

    def test_fetch_sends_key_as_header_only_and_encodes_the_id(self):
        seen = {}
        def opener(req, timeout):
            seen["url"], seen["h"], seen["t"] = req.full_url, dict(req.header_items()), timeout
            return Resp({"content": []})
        H.fetch_subtitles("abc DEF&x=1", "SECRETKEY", opener)
        self.assertNotIn("SECRETKEY", seen["url"]); self.assertEqual(seen["h"]["X-api-key"], "SECRETKEY")
        self.assertIn("videoId=abc+DEF%26x%3D1", seen["url"])

    def test_main_without_key_and_with_empty_content(self):
        os.environ.pop("TRANSCRIPT_API_KEY", None)
        self.assertEqual(H.main(["--video-id", "x", "--out-dir", tempfile.mkdtemp()]), 2)
        os.environ["TRANSCRIPT_API_KEY"] = "K"
        old = H.fetch_subtitles
        try:
            H.fetch_subtitles = lambda *a, **k: {"content": []}
            self.assertEqual(H.main(["--video-id", "x", "--out-dir", tempfile.mkdtemp()]), 1)
            H.fetch_subtitles = lambda *a, **k: {"content": [{"offset": 0, "duration": 1000, "text": "Hi there"}]}
            d = tempfile.mkdtemp()
            self.assertEqual(H.main(["--video-id", "x", "--out-dir", d]), 0)
            self.assertTrue(os.path.exists(os.path.join(d, "transcript.srt")))
        finally:
            H.fetch_subtitles = old; os.environ.pop("TRANSCRIPT_API_KEY", None)

    def test_language_is_requested_and_checked(self):
        seen = {}
        def opener(req, timeout):
            seen["url"] = req.full_url; return Resp({"content": [], "lang": "en"})
        H.fetch_subtitles("vid", "K", opener)
        self.assertIn("lang=en", seen["url"])
        H.check_language({"lang": "en"}); H.check_language({"lang": "en-US"}); H.check_language({})  # no lang field: nothing to check
        with self.assertRaisesRegex(ValueError, "bn"):
            H.check_language({"lang": "bn", "availableLangs": ["bn", "en"]})
        os.environ["TRANSCRIPT_API_KEY"] = "K"
        old = H.fetch_subtitles
        try:
            H.fetch_subtitles = lambda *a, **k: {"lang": "bn", "content": [{"offset": 0, "duration": 1000, "text": "x"}]}
            self.assertEqual(H.main(["--video-id", "x", "--out-dir", tempfile.mkdtemp()]), 1)  # refused, not written as an English transcript
        finally:
            H.fetch_subtitles = old; os.environ.pop("TRANSCRIPT_API_KEY", None)


if __name__ == "__main__":
    unittest.main()
