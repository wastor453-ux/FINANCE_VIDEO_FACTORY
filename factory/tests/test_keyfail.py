import os, sys, unittest
from types import SimpleNamespace
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import keyfail as K  # noqa: E402


def client(fn): return SimpleNamespace(interactions=SimpleNamespace(create=fn))


class T(unittest.TestCase):
    def test_keys_from_env_dedupe_and_order(self):
        self.assertEqual(K.gemini_keys({"GEMINI_API_KEY": "a", "GEMINI_API_KEY_2": "b"}), ["a", "b"])
        self.assertEqual(K.gemini_keys({"GEMINI_API_KEY": "a", "GEMINI_API_KEY_2": "a"}), ["a"])
        self.assertEqual(K.gemini_keys({}), [])

    def test_switches_on_quota_and_stays(self):
        calls = []
        c1 = client(lambda **k: (calls.append(1), (_ for _ in ()).throw(RuntimeError("429 RESOURCE_EXHAUSTED quota")))[1])
        c2 = client(lambda **k: (calls.append(2), "ok")[1])
        f = K.FailoverClient([c1, c2])
        self.assertEqual(f.interactions.create(x=1), "ok"); self.assertEqual(f.interactions.create(x=1), "ok")
        self.assertEqual(calls, [1, 2, 2])  # second call goes straight to key 2

    def test_does_not_switch_on_bad_request(self):
        def bad(**k): raise ValueError("400 invalid argument: text empty")
        f = K.FailoverClient([client(bad), client(lambda **k: "ok")])
        with self.assertRaises(ValueError): f.interactions.create()
        self.assertEqual(f.active, 0)

    def test_last_key_failure_raises(self):
        def q(**k): raise RuntimeError("503 UNAVAILABLE")
        with self.assertRaises(RuntimeError): K.FailoverClient([client(q), client(q)]).interactions.create()

    def test_switch_message_has_no_key_value(self):
        import io, contextlib
        buf = io.StringIO()
        def q(**k): raise RuntimeError("429 quota for key SECRETVALUE123")
        with contextlib.redirect_stderr(buf):
            K.FailoverClient([client(q), client(lambda **k: "ok")]).interactions.create()
        self.assertIn("backup key 2", buf.getvalue()); self.assertNotIn("SECRETVALUE123", buf.getvalue())


    def test_hard_deadline_abandons_hung_call_and_switches_key(self):
        import time
        calls = []
        def hang(**k): calls.append(1); time.sleep(5); return "late"
        f = K.FailoverClient([client(hang), client(lambda **k: "ok")], deadline=0.2)
        t0 = time.time(); self.assertEqual(f.interactions.create(), "ok"); self.assertLess(time.time() - t0, 2)
        self.assertEqual(f.active, 1)

    def test_deadline_error_is_raised_when_no_backup(self):
        import time
        f = K.FailoverClient([client(lambda **k: time.sleep(5))], deadline=0.2)
        with self.assertRaises(TimeoutError): f.interactions.create()


if __name__ == "__main__": unittest.main()
