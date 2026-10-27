---
name: ffx-motion-library
description: Build or extend reusable Remotion motion-graphics components (charts, KPI cards, comparisons, diagrams, kinetic type) in the light premium finance style. Use when a scene needs a component that does not exist yet.
---

# Motion library

Follow the official Remotion rules: drive everything from `useCurrentFrame()` + `interpolate()`/`spring()`; no CSS transitions or Tailwind animation classes; get `fps` from `useVideoConfig()`; keep frame subscriptions in small components.

Design rules (from the reference sheets): reusable components (KPI card, source+date label, chart legend, annotation, A/B cards, assumption tag, lower third, takeaway checklist, disclaimer strip) and 9 charts (portfolio over time, spending bars, allocation donut, waterfall, compound growth, stacked payment breakdown, debt payoff, inflation power, scenario comparison). Timings: line draw 0.5-1.0 s, bar rise 0.5-0.8 s, count-up 0.6-1.0 s, donut reveal 0.6-1.0 s, flow arrows 0.8-1.2 s; subtle easing, no bounce.

Process per component: props schema with `source`/`asOf` or `illustrative`; put the component in `src/components/`, read every colour, font and timing from `src/tokens.ts` (which reads `config/design_tokens.json`); register a demo composition in `src/Root.tsx`; render a still and a 2 s clip (Muse or Studio, not production); inspect the frames; mark the mode as built in `docs/STATUS.md`. A mode listed in `config/visual_modes.json` must not be used in a real scene plan until its component exists and has been inspected. Never hard-code brand names.
