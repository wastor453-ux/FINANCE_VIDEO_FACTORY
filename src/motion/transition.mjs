// Pure scene-transition styles. p is eased progress 0..1 of the transition window (from the pack's ease-in-out).
// Returns CSS style objects for the outgoing and incoming beat wrappers; no DOM, no clocks, no randomness.
// Outgoing is the beat being left (kept visible through the window), incoming is the new beat.

const FEATHER = 220; // px of soft edge on the wipe (design choice, softness only)

export const TRANSITIONS = ["clean_wipe", "card_to_chart_zoom", "shape_mask"];

export function transitionStyles(type, p, width = 1920, height = 1080) {
  const q = Math.min(1, Math.max(0, p));
  switch (type) {
    case "clean_wipe": {
      // the outgoing beat is wiped away left to right with a soft edge; the incoming beat is already underneath
      const x = q * (width + FEATHER) - FEATHER;
      const mask = `linear-gradient(to right, transparent ${x}px, black ${x + FEATHER}px)`;
      return { outgoing: { zIndex: 2, WebkitMaskImage: mask, maskImage: mask }, incoming: { zIndex: 1 } };
    }
    case "card_to_chart_zoom": {
      // zoom through: the old scene grows and fades while the new one settles in from slightly smaller
      return {
        outgoing: { zIndex: 1, opacity: 1 - q, transform: `scale(${1 + 0.18 * q})`, transformOrigin: "50% 50%" },
        incoming: { zIndex: 2, opacity: q, transform: `scale(${0.92 + 0.08 * q})`, transformOrigin: "50% 50%" },
      };
    }
    case "shape_mask": {
      // circular reveal of the new scene from the centre, large enough to cover the corners at q = 1
      const r = q * Math.hypot(width, height) / 2 * 1.02;
      return { outgoing: { zIndex: 1 }, incoming: { zIndex: 2, clipPath: `circle(${r}px at 50% 50%)` } };
    }
    default:
      throw new Error(`unknown transition "${type}"`);
  }
}

/** The outgoing beat must stay on screen until the transition ends: extend its end and drop the exits that were set to its old end. */
export function extendBeat(beat, toFrame) {
  if (toFrame <= beat.endFrame) return beat;
  return {
    ...beat, endFrame: toFrame,
    events: beat.events.map((e) => { if (e.exitFrame !== beat.endFrame) return e; const { exitFrame, ...rest } = e; return rest; }),
  };
}
