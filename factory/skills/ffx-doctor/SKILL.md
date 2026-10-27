---
name: ffx-doctor
description: Audit what this environment can really do (tools, network, keys, models, voice) before any run or when something fails. Reports VERIFIED / FAILED / UNVERIFIED and never prints secrets.
---

# Doctor

1. `node factory/bin/ffx.mjs doctor --online` (no keys needed) then, once keys exist in the environment, `... doctor --live`.
2. Report each row honestly. A reachable host proves nothing about a key; a set variable proves nothing about validity. Only `--live` rows with VERIFIED prove access.
3. `--live` checks: YouTube key (1 quota unit), Gemini key, that `config/voice.json` model ID appears in the model list, and that voice "Koda" appears in the voice library. If any is FAILED, update `config/voice.json` with the corrected value only after the user confirms.
4. Never echo, log or store key values. If a value appears in output, stop and tell the user to rotate that key.
5. Output: a table plus the single most important next action.
