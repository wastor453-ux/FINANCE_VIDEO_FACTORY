import React from "react";
import { useLook } from "../style/StyleContext";
import { eased } from "../motion/math.mjs";

export interface Ev { id: string; recipe: string; startFrame: number; endFrame: number; holdUntilFrame: number; exitFrame?: number; ease: string; params?: any }
export interface Beat { id: string; startFrame: number; endFrame: number; mode: string; data: any[]; onScreenText: string[]; events: Ev[] }

/** Event frames are absolute in the plan; inside a <Sequence from={beat.startFrame}> the clock is beat-local. */
export const local = (beat: Beat, ev: Ev): Ev => ({ ...ev, startFrame: ev.startFrame - beat.startFrame, endFrame: ev.endFrame - beat.startFrame, holdUntilFrame: ev.holdUntilFrame - beat.startFrame, exitFrame: ev.exitFrame === undefined ? undefined : ev.exitFrame - beat.startFrame });
export const findEvent = (beat: Beat, recipe: string): Ev | undefined => { const e = beat.events.find((x) => x.recipe === recipe); return e && local(beat, e); };

/** 0..1 appearance of an element for an event, including the exit; exit window comes from the pack's clean_wipe-class duration. */
export function appear(look: ReturnType<typeof useLook>, ev: Ev | undefined, frame: number): number {
  if (!ev) return 1;
  const p = look.pack, fps = look.fps;
  const inP = eased(p, ev.ease, frame, ev.startFrame, ev.endFrame);
  if (ev.exitFrame === undefined) return inP;
  const exitLen = Math.round(p.motion.durationSec.clean_wipe[0] * fps);
  return inP * (1 - eased(p, "exit", frame, ev.exitFrame - exitLen, ev.exitFrame));
}

export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => { const l = useLook(); return <div style={{ ...l.card, ...style }}>{children}</div>; };

/** Small caps label used for section labels on the boards. */
export const Label: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size, color }) => { const l = useLook(); return <div style={{ fontFamily: l.font.body, fontWeight: 600, fontSize: size ?? l.size.caption, letterSpacing: "0.12em", textTransform: "uppercase", color: color ?? l.color.inkSecondary }}>{children}</div>; };

/** Gain/loss glyph: colour is never the only signal (triangle + sign). */
export const Delta: React.FC<{ value: number; unit?: string; window?: string; size: number }> = ({ value, unit = "%", window, size }) => {
  const l = useLook(), up = value >= 0, t = up ? l.color.flow.gain : l.color.flow.loss;
  const tri = up ? "M0 10 L5 0 L10 10 Z" : "M0 0 L10 0 L5 10 Z";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: size * 0.3, fontFamily: l.font.display, fontWeight: 700, fontSize: size, color: t.text, fontVariantNumeric: "tabular-nums" }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 10 10" style={{ alignSelf: "center" }}><path d={tri} fill={t.fill} stroke={t.stroke} strokeWidth={0.8} /></svg>
      <span>{up ? "+" : "−"}{Math.abs(value)}{unit}</span>
      {window ? <span style={{ fontWeight: 500, fontSize: size * 0.7, color: l.color.inkSecondary }}>({window})</span> : null}
    </div>
  );
};

/** Source + as-of label; illustrative data is labelled as such (trust rules). */
export const SourceTag: React.FC<{ d: any; size: number }> = ({ d, size }) => {
  const l = useLook(); const text = d.illustrative ? "Illustrative example" : `Source: ${d.source} · As of ${d.asOf}`;
  return <div style={{ ...l.card, display: "inline-block", padding: `${size * 0.45}px ${size * 0.9}px`, borderRadius: size * 2, fontFamily: l.font.body, fontWeight: 500, fontSize: size, color: l.color.inkSecondary }}>{text}</div>;
};

/** Unit-aware value text: currency prefix, percent suffix. */
export function unitParts(unit: string): { prefix: string; suffix: string } {
  const map: Record<string, [string, string]> = { USD: ["$", ""], "%": ["", "%"], years: ["", " years"], months: ["", " months"] };
  const m = map[unit]; return m ? { prefix: m[0], suffix: m[1] } : { prefix: "", suffix: unit ? ` ${unit}` : "" };
}
