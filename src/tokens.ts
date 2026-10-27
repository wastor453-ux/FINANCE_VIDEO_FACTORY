// Single source of truth for colours, type and motion timings: factory/config/design_tokens.json.
// Components must read from here (never hard-code a colour, font or brand string).
import raw from "../factory/config/design_tokens.json";

export const tokens = raw;
export type Tokens = typeof raw;

/** seconds -> frames using the composition's fps (always pass fps from useVideoConfig()). */
export const sec = (seconds: number, fps: number): number => Math.round(seconds * fps);
