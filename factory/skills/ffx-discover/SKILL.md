---
name: ffx-discover
description: Fetch the latest long-form uploads and performance data for the 7 configured channels via the YouTube Data API v3. Use at the start of each weekly run.
---

# Discover

- Command: `node factory/bin/ffx.mjs discover --out runs/_staging/discovery.json` (key from env; Muse injects it from Secure Vault). `_staging/` is used because no run folder exists yet at this point -- the winner (and therefore the run's unique id) isn't known until after ffx-select and gate G1. ffx-orchestrator copies this file into `runs/<runId>/` once `run-init` creates the folder.
- Method: `GET .../channels` (forHandle) -> uploads playlist -> `GET .../playlistItems` -> `GET .../videos`. These are the real REST resource paths (no ".list" suffix -- that's the RPC method name from Google's docs, not a URL path). Never the `search` resource (separate, larger quota). Expect ~3 quota units per channel.
- Exit code 2 means partial discovery: show the user which channels failed and why before continuing. Never silently proceed with fewer channels.
- Verify: `ffx validate discovery runs/_staging/discovery.json`.
- Respect the API terms; use the API only, no scraping of pages for metrics.
