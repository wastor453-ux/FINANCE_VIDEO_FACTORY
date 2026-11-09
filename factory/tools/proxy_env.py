"""Make the process's no_proxy / NO_PROXY values safe for httpx (used by the google-genai SDK).

Some sandboxes set no_proxy entries such as bracketed IPv6 hosts ("[::1]"). httpx parses each entry as a URL and
fails with `httpx.InvalidURL: Invalid port: ':1]'` before any request is sent. We drop only the entries that
contain brackets; every other entry, and every proxy URL, is left exactly as it was. Keys and secrets are never read.
"""
import os


def clean_no_proxy(env=None):
    env = os.environ if env is None else env
    removed = []
    for key in ("no_proxy", "NO_PROXY"):
        val = env.get(key)
        if not val:
            continue
        parts = [p.strip() for p in val.split(",") if p.strip()]
        keep = [p for p in parts if "[" not in p and "]" not in p]
        removed += [p for p in parts if p not in keep]
        env[key] = ",".join(keep)
    return removed
