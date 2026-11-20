import React from "react";
import { useLook, withAlpha } from "../style/StyleContext";
import { eased, lerp } from "../motion/math.mjs";
import { strongestSeries } from "../motion/color.mjs";

/** Shared premium stage for scenes built after the charts: parallax glow layers, perspective wrapper with settle tilt and camera push, glass style. All values come from the pack's `scene` section. */
export function useGlass() {
  const l = useLook(), sc = l.pack.scene, c = l.color, S = c.series;
  const shadow = sc.glass.shadow.map(([x, y, b, o]: number[]) => `${x}px ${y}px ${b}px ${withAlpha(strongestSeries(c).fill, o)}`).join(",") + `, inset 0 1px 0 ${c.surface}`;
  const glass: React.CSSProperties = { background: `linear-gradient(145deg, ${withAlpha(c.surface, 0.94)}, ${withAlpha(c.surface, 0.7)})`, border: `${sc.glass.borderPx}px solid ${withAlpha(c.surface, 0.95)}`, borderRadius: l.px(sc.glass.radiusAtReference), boxShadow: shadow };
  /** front cards: nearly opaque so the back plate behind them never shows through */
  const solid: React.CSSProperties = { ...glass, boxSizing: "border-box", background: `linear-gradient(145deg, ${withAlpha(c.surface, 0.99)}, ${withAlpha(c.surface, 0.95)})` };
  return { glass, solid, shadow };
}

export const Stage: React.FC<{ frame: number; settle: number; camP: number; exit: number; title?: string; titleP?: number; children: React.ReactNode }> = ({ settle, camP, exit, title, titleP = 1, children }) => {
  const l = useLook(), sc = l.pack.scene, c = l.color, S = c.series, tilt = sc.chartTiltScale;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: exit }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.far * camP}px)`, background: `radial-gradient(ellipse 900px 700px at 8% 0%, ${withAlpha(S[0].fill, 0.3)}, transparent), radial-gradient(ellipse 800px 650px at 100% 100%, ${withAlpha(c.lavender, 0.2)}, transparent)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.mid * camP}px)`, background: `radial-gradient(circle 260px at 70% 12%, ${withAlpha(c.cyan, 0.14)}, transparent)` }} />
      {title ? <div style={{ position: "absolute", left: 150, top: 96, opacity: titleP, transform: `translate3d(0, ${lerp(36, 0, titleP)}px, 0)`, fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.title, letterSpacing: "-0.02em", color: c.ink, whiteSpace: "nowrap" }}>{title}</div> : null}
      <div style={{ position: "absolute", inset: 0, perspective: sc.perspectivePx, perspectiveOrigin: `${sc.perspectiveOriginPct[0]}% ${sc.perspectiveOriginPct[1]}%` }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `scale(${1 + sc.cameraPushScale * camP}) rotateX(${sc.settleTiltDeg.x * tilt}deg) rotateY(${lerp(sc.entryTiltDegY * tilt, sc.settleTiltDeg.y * tilt, settle)}deg)` }}>{children}</div>
      </div>
    </div>
  );
};

export const exitOf = (l: ReturnType<typeof useLook>, ev: { exitFrame?: number } | undefined, frame: number) =>
  !ev || ev.exitFrame === undefined ? 1 : 1 - eased(l.pack, "exit", frame, ev.exitFrame - Math.round(l.pack.motion.durationSec.clean_wipe[0] * l.fps), ev.exitFrame);

/** Source line for diagram and list scenes (same tile the charts use); text comes from beat.content.source. */
export const SourceTile: React.FC<{ text: string; p: number; exit: number }> = ({ text, p, exit }) => {
  const l = useLook(), sc = l.pack.scene, { glass } = useGlass();
  return <div style={{ position: "absolute", left: 170, top: 940, ...glass, borderRadius: 26, padding: "20px 30px", fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, color: l.color.inkSecondary, whiteSpace: "nowrap", opacity: p * exit, transform: `translateZ(${sc.layerZ.tile}px)` }}>{text}</div>;
};
