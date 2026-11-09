import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { BUNDLED_FAMILIES } from "./fonts";
import { scaleRef } from "../motion/math.mjs";

// The style pack arrives as input data (the plan names it); nothing about the look is typed in components.
export type Pack = any;
export interface Look { pack: Pack; color: any; font: { display: string; body: string }; px: (referencePx: number) => number; size: Record<string, number>; card: React.CSSProperties; fps: number }

const Ctx = createContext<Look | null>(null);

/** Pack colour at a given opacity, resolved by the browser (no colour maths or literals in code). */
export const withAlpha = (hex: string, a: number) => `color-mix(in srgb, ${hex} ${Math.round(a * 1000) / 10}%, transparent)`;

export function makeLook(pack: Pack, fps: number, width = 1920): Look {
  const g = pack.geometry, px = (v: number) => scaleRef(pack, v, width);
  const c = pack.color;
  return {
    pack, color: c, fps, px, size: pack.type.videoScalePx,
    font: { display: `'${pack.type.display}', 'Inter', sans-serif`, body: `'${pack.type.body}', sans-serif` },
    card: {
      background: c.surface, border: `${px(g.cardBorderAtReference)}px solid ${c.border}`, borderRadius: px(g.cardRadiusAtReference),
      boxShadow: `0 ${px(g.cardShadow.yAtReference)}px ${px(g.cardShadow.blurAtReference)}px ${withAlpha(c.ink, g.cardShadow.opacity)}`,
    },
  };
}

export const StyleProvider: React.FC<{ pack: Pack; fps: number; width?: number; children: React.ReactNode }> = ({ pack, fps, width, children }) => {
  const look = useMemo(() => makeLook(pack, fps, width), [pack, fps, width]);
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    // Hold the frame until the pack's fonts are loaded. A family that is not bundled, or a face that loads zero files, fails the render
    // (the browser's font "check" call is deliberately not used: it answers true when no face matches, which hides this exact failure).
    const fams: string[] = [pack.type.display, pack.type.body];
    const missing = fams.filter((f) => !BUNDLED_FAMILIES[f]);
    if (missing.length) { cancelRender(new Error(`style pack names font(s) not bundled: ${missing.join(", ")}`)); return; }
    const jobs = fams.flatMap((f) => BUNDLED_FAMILIES[f].map((w) => (document as any).fonts.load(`${w} 40px '${f}'`).then((faces: any[]) => ({ f, w, n: faces.length }))));
    Promise.all(jobs).then((rs) => {
      const bad = rs.filter((r) => r.n === 0).map((r) => `${r.f} ${r.w}`);
      if (bad.length) cancelRender(new Error(`font face(s) failed to load: ${bad.join(", ")}`)); else continueRender(handle);
    }).catch((e) => cancelRender(e));
  }, [pack]);
  return <Ctx.Provider value={look}>{children}</Ctx.Provider>;
};
export const useLook = (): Look => { const l = useContext(Ctx); if (!l) throw new Error("StyleProvider missing"); return l; };
