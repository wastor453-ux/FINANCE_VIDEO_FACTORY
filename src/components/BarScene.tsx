import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook, withAlpha } from "../style/StyleContext";
import { Beat, appear, findEvent, unitParts } from "./common";
import { eased, formatNumber, decimalsOf, lerp } from "../motion/math.mjs";
import { barDomain, barSlots, roundedTopRect } from "../motion/chart.mjs";

/**
 * Modes bar_chart (and later stacked / scenario comparison): tilted glass panel, one rounded bar per data point, series colours by slot.
 * Events: axes_in (grid and labels), bar_rise (bars grow with a short overlap, value labels follow each bar), legend_in (source tile), camera_push.
 * Frame-pure.
 */
export const BarScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame(), sc = l.pack.scene, c = l.color, S = c.series, fps = l.fps;
  const axes = findEvent(beat, "axes_in"), rise = findEvent(beat, "bar_rise")!, tile = findEvent(beat, "legend_in"), cam = findEvent(beat, "camera_push");
  const stagger = Math.round(sc.staggerSec * fps);
  const step = (i: number) => eased(l.pack, rise.ease, frame, rise.startFrame - Math.round(fps * 0.5) + i * stagger, rise.startFrame - Math.round(fps * 0.5) + Math.round(fps * 0.6) + i * stagger);
  const settle = step(0), axesP = axes ? appear(l, axes, frame) : 1, tileP = tile ? appear(l, tile, frame) : axesP;
  const camP = cam ? eased(l.pack, cam.ease, frame, cam.startFrame, cam.endFrame) : 0;
  const exit = rise.exitFrame === undefined ? 1 : 1 - eased(l.pack, "exit", frame, rise.exitFrame - Math.round(l.pack.motion.durationSec.clean_wipe[0] * fps), rise.exitFrame);

  const n = beat.data.length, d0 = beat.data[0], { prefix, suffix } = unitParts(d0.unit);
  const values = beat.data.map((d) => Number(d.value)), domain = barDomain(values);
  const panel = { x: 150, y: 235, w: 1620, h: 640 }, box = { x: 130, y: 110, w: 1380, h: 410 }, slots = barSlots(n, box);
  // each bar's own 0..1 progress: windows of 70% of the event, offset so the last bar finishes with the event
  const dur = rise.endFrame - rise.startFrame, win = dur * 0.7, off = n > 1 ? (dur - win) / (n - 1) : 0;
  const prog = (i: number) => eased(l.pack, rise.ease, frame, rise.startFrame + i * off, rise.startFrame + i * off + win);
  const yOf = (v: number) => box.y + (1 - (v - domain.lo) / (domain.hi - domain.lo)) * box.h;
  const radius = Math.min(18, slots[0].w * 0.16);

  const shadow = sc.glass.shadow.map(([x, y, b, o]: number[]) => `${x}px ${y}px ${b}px ${withAlpha(S[5].fill, o)}`).join(",") + `, inset 0 1px 0 ${c.surface}`;
  const glass: React.CSSProperties = { background: `linear-gradient(145deg, ${withAlpha(c.surface, 0.94)}, ${withAlpha(c.surface, 0.7)})`, border: `${sc.glass.borderPx}px solid ${withAlpha(c.surface, 0.95)}`, borderRadius: l.px(sc.glass.radiusAtReference), boxShadow: shadow };
  const rr = (i: number): React.CSSProperties => { const s = step(i); return { opacity: s * exit, transform: `translate3d(0, ${lerp(36, 0, s)}px, 0)` }; };
  const tilt = sc.chartTiltScale, gid = `bs-${beat.id}`;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: exit }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.far * camP}px)`, background: `radial-gradient(ellipse 900px 700px at 8% 0%, ${withAlpha(S[0].fill, 0.3)}, transparent), radial-gradient(ellipse 800px 650px at 100% 100%, ${withAlpha(c.lavender, 0.2)}, transparent)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.mid * camP}px)`, background: `radial-gradient(circle 260px at 70% 12%, ${withAlpha(c.cyan, 0.14)}, transparent)` }} />
      {beat.onScreenText[0] ? <div style={{ position: "absolute", left: 150, top: 96, ...rr(0), fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.title, letterSpacing: "-0.02em", color: c.ink, whiteSpace: "nowrap" }}>{beat.onScreenText[0]}</div> : null}

      <div style={{ position: "absolute", inset: 0, perspective: sc.perspectivePx, perspectiveOrigin: `${sc.perspectiveOriginPct[0]}% ${sc.perspectiveOriginPct[1]}%` }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `scale(${1 + sc.cameraPushScale * camP}) rotateX(${sc.settleTiltDeg.x * tilt}deg) rotateY(${lerp(sc.entryTiltDegY * tilt, sc.settleTiltDeg.y * tilt, settle)}deg)` }}>
          <div style={{ position: "absolute", left: panel.x + 40, top: panel.y - 30, width: panel.w, height: panel.h, ...glass, opacity: 0.5 * step(0) * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
          <div style={{ position: "absolute", left: panel.x, top: panel.y, width: panel.w, height: panel.h, ...glass, opacity: step(1) * exit, transform: `translateZ(${sc.layerZ.main}px) translate3d(0, ${lerp(36, 0, step(1))}px, 0)` }}>
            <div style={{ position: "absolute", left: 40, top: 26, fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, letterSpacing: "0.14em", textTransform: "uppercase", color: c.inkSecondary, opacity: axesP }}>{d0.unit}</div>
            <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={panel.w} height={panel.h} viewBox={`0 0 ${panel.w} ${panel.h}`}>
              <defs>
                {beat.data.map((_, i) => { const s = S[i % S.length]; return <linearGradient key={i} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.fill} /><stop offset="1" stopColor={s.stroke} stopOpacity={0.9} /></linearGradient>; })}
              </defs>
              <g opacity={axesP}>
                {domain.ticks.map((t: number) => { const y = yOf(t); return (
                  <g key={t}><line x1={box.x} x2={box.x + box.w} y1={y} y2={y} stroke={c.inkSecondary} strokeOpacity={0.16} strokeWidth={1.5} />
                    <text x={box.x - 24} y={y + 10} textAnchor="end" fontFamily={l.font.body} fontWeight={500} fontSize={l.size.caption} fill={c.inkSecondary}>{formatNumber(t, 0)}</text></g>); })}
                {beat.data.map((d, i) => <text key={i} x={slots[i].cx} y={box.y + box.h + 56} textAnchor="middle" fontFamily={l.font.body} fontWeight={500} fontSize={l.size.caption} fill={c.inkSecondary}>{d.label}</text>)}
              </g>
              {values.map((v, i) => {
                const p = prog(i), h = (box.y + box.h - yOf(v)) * p, top = box.y + box.h - h, dec = decimalsOf(v), done = Math.max(0, (p - 0.85) / 0.15);
                return (
                  <g key={i}>
                    <path d={roundedTopRect(slots[i].x, top, slots[i].w, h, radius)} fill={`url(#${gid}-${i})`} />
                    <text x={slots[i].cx} y={top - 22} textAnchor="middle" fontFamily={l.font.display} fontWeight={700} fontSize={l.size.body} fill={c.ink} opacity={done} style={{ fontVariantNumeric: "tabular-nums" }}>{prefix}{formatNumber(v, dec)}{suffix}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          {d0.source || d0.illustrative ? (
            <div style={{ position: "absolute", left: panel.x + 20, top: panel.y + panel.h + 8, ...glass, borderRadius: 26, padding: "20px 30px", fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, color: c.inkSecondary, whiteSpace: "nowrap", opacity: tileP * exit, transform: `translateZ(${sc.layerZ.tile}px)` }}>{d0.illustrative ? "Illustrative example" : `Source: ${d0.source} · ${d0.asOf}`}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
