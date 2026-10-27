---
name: ffx-thumbnail
description: Design the video thumbnail with the permanent AI-generated male character, based on the final concept. Use after the script is approved; thumbnail only, never in the video.
---

# Thumbnail

- Character: the owner's permanent AI-generated fictional male identity (reference image path from `config/brand.json`). Keep face, hair, skin tone and wardrobe consistent. He appears in thumbnails only.
- Concept: one idea, one emotion, one big number or short phrase (<= 4 words), high contrast, readable at 160 px wide. Produce 3 distinct concepts and recommend one with reasoning.
- Use the light/clean visual identity so thumbnail and video feel like one brand; branding values come from config only.
- Truthfulness: no fake numbers, no misleading imagery, no guaranteed-return language.
- Tooling: image generation tool available in Muse for the character/background; compose text and layout deterministically (HTML/Remotion still) so edits are exact. If the image tool refuses a prompt, rephrase safely rather than retrying blindly.
- Deliver 1280x720 PNG/JPG under 2 MB plus the layered source. Ask the user which concept to finalize.
