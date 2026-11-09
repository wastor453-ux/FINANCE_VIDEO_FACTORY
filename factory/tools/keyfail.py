"""Backup-key failover for the Gemini SDK. Keys come from env var names in config/pipeline.json (secrets block).
Key values are never printed, logged or written; only 'key 1' / 'key 2' is reported."""
import json, os, sys, threading

HERE = os.path.dirname(os.path.abspath(__file__))
FAILOVER_MARKERS = ("429", "401", "403", "500", "502", "503", "504", "resource_exhausted", "quota", "rate limit", "api key not valid",
                    "api key expired", "api_key_invalid", "permission_denied", "unavailable", "deadline", "timed out", "timeout", "overloaded")


def key_names():
    try:
        s = json.load(open(os.path.join(HERE, "..", "config", "pipeline.json")))["secrets"]
    except Exception:  # noqa: BLE001
        s = {}
    return s.get("geminiApiKeyEnv", "GEMINI_API_KEY"), s.get("geminiApiKeyEnvBackup", "GEMINI_API_KEY_2")


def gemini_keys(env=None):
    env = os.environ if env is None else env
    main, backup = key_names()
    keys = [env.get(main) or env.get("GOOGLE_API_KEY"), env.get(backup)]
    return [k for i, k in enumerate(keys) if k and k not in keys[:i]]


def is_failover_error(exc):
    return any(m in f"{type(exc).__name__} {exc}".lower() for m in FAILOVER_MARKERS)


def call_with_deadline(fn, seconds, **kw):
    """Run fn(**kw) in a daemon thread; raise TimeoutError('timed out ...') if it has not returned after `seconds`.
    The SDK's own timeout did not stop calls that hung for 20 minutes, so the wall clock is enforced here.
    An abandoned call keeps running in its thread but can no longer block the pipeline (daemon: never blocks exit)."""
    box = {}
    def work():
        try: box["r"] = fn(**kw)
        except BaseException as e:  # noqa: BLE001
            box["e"] = e
    t = threading.Thread(target=work, daemon=True); t.start(); t.join(seconds)
    if t.is_alive(): raise TimeoutError(f"timed out after {seconds} s (call abandoned)")
    if "e" in box: raise box["e"]
    return box["r"]


class _Interactions:
    def __init__(self, owner): self.o = owner

    def create(self, **kw):
        o = self.o
        while True:
            try:
                fn = o.clients[o.active].interactions.create
                return call_with_deadline(fn, o.deadline, **kw) if o.deadline else fn(**kw)
            except Exception as e:  # noqa: BLE001
                if is_failover_error(e) and o.active < len(o.clients) - 1:
                    o.active += 1
                    print(f"gemini: switching to backup key {o.active + 1} of {len(o.clients)} ({type(e).__name__})", file=sys.stderr)
                    continue
                raise


class FailoverClient:
    """Drop-in for client.interactions.create(...). Sticky: after a switch, later calls keep the working key."""
    def __init__(self, clients, deadline=None):
        if not clients: raise ValueError("no Gemini API key")
        self.clients, self.active, self.deadline = list(clients), 0, deadline
        self.interactions = _Interactions(self)


def make_client(genai, env=None, deadline=None, **client_kw):
    return FailoverClient([genai.Client(api_key=k, **client_kw) for k in gemini_keys(env)], deadline)
