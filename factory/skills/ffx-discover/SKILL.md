---
name: ffx-discover
description: Fetch the latest long-form uploads and performance data for the 7 configured channels via the YouTube Data API v3. Use at the start of each weekly run.
---

# Discover

- Command: `node factory/bin/ffx.mjs discover --out runs/<week>/discovery.json` (key from env; Muse injects it from Secure Vault).
- Method: `GET .../channels` (forHandle) -> uploads playlist -> `GET .../playlistItems` -> `GET .../videos`. These are the real REST resource paths (no ".list" suffix -- that's the RPC method name from Google's docs, not a URL path). Never the `search` resource (separate, larger quota). Expect ~3 quota units per channel.
- Exit code 2 means partial discovery: show the user which channels failed and why before continuing. Never silently proceed with fewer channels.
- Verify: `ffx validate discovery runs/<week>/discovery.json`.
- Respect the API terms; use the API only, no scraping of pages for metrics.
