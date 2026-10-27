---
name: ffx-package
description: Prepare the title, description, tags, chapters and delivery package. Use after QA passes. Never publishes or uploads.
---

# Package

- Title <= 100 characters, specific and honest, matching the thumbnail promise.
- Description: summary, chapters (>= 3, `m:ss`), sources list with links, disclaimer, no unverifiable promises.
- Tags: relevant, not stuffed. Chapters derived from scene starts.
- `package.json` must have `published: false` and `qaVerdict: "pass"`; the schema enforces both.
- Deliver the folder: final mp4, thumbnail, package.json, qa_report.json, sources list. The user uploads, or explicitly authorizes upload separately.
