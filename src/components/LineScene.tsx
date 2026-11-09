import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook, withAlpha } from "../style/StyleContext";
import { Beat, appear, findEvent, unitParts } from "./common";
import { eased, formatNumber, decimalsOf, lerp } from "../motion/math.mjs";
import { lineDomain, plotPoints, compact } from "../motion/chart.mjs";
import { smoothPath } from "./KpiCard";

/**
 * Modes line_chart (and later compound growth, inflation, debt payoff): a large tilted glass panel with a drawn line.
 * Events: axes_in (grid and labels), line_draw (line + fill + end marker), pill_in (end-value callout), camera_push (camera + parallax).
 * Data: one point per x position (label, value, unit, source, asOf). Frame-pure.
 */
export const LineScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame(), sc = l.pack.scene, c = l.color, S = c.series, fps = l.fps;
  const axes = findEvent(beat, "axes_in"), line = findEvent(beat, "line_draw")!, pill = findEvent(beat, "pill_in"), cam = findEvent(beat, "camera_push");
  const stagger = Math.round(sc.staggerSec * fps);
  const step = (i: number) => eased(l.pack, line.ease, frame, line.startFrame - Math.round(fps * 0.5) + i * stagger, line.startFrame - Math.round(fps * 0.5) + Math.round(fps * 0.6) + i * stagger);
  const settle = step(0), axesP = axes ? appear(l, axes, frame) : 1, pillP = appear(l, pill, frame);
  const drawn = eased(l.pack, line.ease, frame, line.startFrame, line.endFrame);
  const camP = cam ? eased(l.pack, cam.ease, frame, cam.startFrame, cam.endFrame) : 0;
  const exitFrame = line.exitFrame, exit = exitFrame === undefined ? 1 : 1 - eased(l.pack, "exit", frame, exitFrame - Math.round(l.pack.motion.durationSec.clean_wipe[0] * fps), exitFrame);

  const d0 = beat.data[0], { prefix, suffix } = unitParts(d0.unit);
  const values = beat.data.map((d) => Number(d.value)), domain = lineDomain(values);
  const panel = { x: 150, y: 235, w: 1620, h: 640 }, box = { x: 130, y: 96, w: 1380, h: 424 };
  const pts = plotPoints(values, domain, box), path = smoothPath(pts), last = pts[pts.length - 1];
  const area = `${path} L${last[0]} ${box.y + box.h} L${pts[0][0]} ${box.y + box.h} Z`;
  const gid = `ls-${beat.id}`, every = Math.ceil(beat.data.length / 6);
  const decLast = decimalsOf(values[values.length - 1]), lastText = `${prefix}${formatNumber(values[values.length - 1], decLast)}${suffix}`;

  const shadow = sc.glass.shadow.map(([x, y, b, o]: number[]) => `${x}px ${y}px ${b}px ${withAlpha(S[5].fill, o)}`).join(",") + `, inset 0 1px 0 ${c.surface}`;
  const glass: React.CSSProperties = { background: `linear-gradient(145deg, ${withAlpha(c.surface, 0.94)}, ${withAlpha(c.surface, 0.7)})`, border: `${sc.glass.borderPx}px solid ${withAlpha(c.surface, 0.95)}`, borderRadius: l.px(sc.glass.radiusAtReference), boxShadow: shadow };
  const rise = (i: number): React.CSSProperties => { const s = step(i); return { opacity: s * exit, transform: `translate3d(0, ${lerp(36, 0, s)}px, 0)` }; };
  const tilt = sc.chartTiltScale;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: exit }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.far * camP}px)`, background: `radial-gradient(ellipse 900px 700px at 8% 0%, ${withAlpha(S[0].fill, 0.3)}, transparent), radial-gradient(ellipse 800px 650px at 100% 100%, ${withAlpha(c.lavender, 0.2)}, transparent)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.mid * camP}px)`, background: `radial-gradient(circle 260px at 70% 12%, ${withAlpha(c.cyan, 0.14)}, transparent)` }} />

      {beat.onScreenText[0] ? <div style={{ position: "absolute", left: 150, top: 96, ...rise(0), fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.title, letterSpacing: "-0.02em", color: c.ink, whiteSpace: "nowrap" }}>{beat.onScreenText[0]}</div> : null}

      <div style={{ position: "absolute", inset: 0, perspective: sc.perspectivePx, perspectiveOrigin: `${sc.perspectiveOriginPct[0]}% ${sc.perspectiveOriginPct[1]}%` }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `scale(${1 + sc.cameraPushScale * camP}) rotateX(${sc.settleTiltDeg.x * tilt}deg) rotateY(${lerp(sc.entryTiltDegY * tilt, sc.settleTiltDeg.y * tilt, settle)}deg)` }}>
          <div style={{ position: "absolute", left: panel.x + 40, top: panel.y - 30, width: panel.w, height: panel.h, ...glass, opacity: 0.5 * step(0) * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
          <div style={{ position: "absolute", left: panel.x, top: panel.y, width: panel.w, height: panel.h, ...glass, transformStyle: "preserve-3d", ...rise(1), transform: `translateZ(${sc.layerZ.main}px) translate3d(0, ${lerp(36, 0, step(1))}px, 0)` }}>
            <div style={{ position: "absolute", left: 40, top: 26, fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, letterSpacing: "0.14em", textTransform: "uppercase", color: c.inkSecondary, opacity: axesP }}>{d0.unit}</div>
            <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={panel.w} height={panel.h} viewBox={`0 0 ${panel.w} ${panel.h}`}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={S[0].fill} stopOpacity={0.3} /><stop offset="1" stopColor={S[0].fill} stopOpacity={0} /></linearGradient>
                <linearGradient id={`${gid}-f`} gradientUnits="userSpaceOnUse" x1={box.x + drawn * box.w - 90} x2={box.x + drawn * box.w} y1="0" y2="0"><stop offset="0" stopColor={c.surface} /><stop offset="1" stopColor={c.surface} stopOpacity={0} /></linearGradient>
                <mask id={`${gid}-m`} maskUnits="userSpaceOnUse" x={0} y={0} width={panel.w} height={panel.h}><rect x={0} y={0} width={Math.max(0, box.x + drawn * box.w - 90)} height={panel.h} fill={c.surface} /><rect x={Math.max(0, box.x + drawn * box.w - 90)} y={0} width={90} height={panel.h} fill={`url(#${gid}-f)`} /></mask>
              </defs>
              <g opacity={axesP}>
                {domain.ticks.map((t: number) => { const y = box.y + (1 - (t - domain.lo) / (domain.hi - domain.lo)) * box.h; return (
                  <g key={t}><line x1={box.x} x2={box.x + box.w} y1={y} y2={y} stroke={c.inkSecondary} strokeOpacity={0.16} strokeWidth={1.5} />
                    <text x={box.x - 24} y={y + 10} textAnchor="end" fontFamily={l.font.body} fontWeight={500} fontSize={l.size.caption} fill={c.inkSecondary}>{compact(t)}</text></g>); })}
                {beat.data.map((d, i) => (i % every === 0 && (beat.data.length - 1 - i === 0 || beat.data.length - 1 - i > every / 2)) || i === beat.data.length - 1 ? <text key={i} x={pts[i][0]} y={box.y + box.h + 56} textAnchor="middle" fontFamily={l.font.body} fontWeight={500} fontSize={l.size.caption} fill={c.inkSecondary}>{d.label}</text> : null)}
              </g>
              <path d={area} fill={`url(#${gid})`} mask={`url(#${gid}-m)`} />
              <path d={path} fill="none" stroke={S[0].fill} strokeWidth={12} opacity={0.3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} strokeLinecap="round" />
              <path d={path} fill="none" stroke={S[0].stroke} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} />
              <g opacity={drawn > 0.98 ? 1 : 0}><circle cx={last[0]} cy={last[1]} r={24} fill={S[0].fill} opacity={0.25} /><circle cx={last[0]} cy={last[1]} r={10} fill={S[0].stroke} stroke={c.surface} strokeWidth={4} /></g>
            </svg>
            <div style={{ position: "absolute", left: last[0], top: last[1] - 92, opacity: pillP, transform: `translate3d(-50%, ${lerp(10, 0, pillP)}px, 0)`, padding: "12px 30px", borderRadius: 999, background: S[5].fill, color: c.surface, fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.subtitle * 0.8, whiteSpace: "nowrap", boxShadow: `0 14px 30px -10px ${withAlpha(S[5].fill, 0.5)}` }}>{lastText}</div>
          </div>
          {d0.source || d0.illustrative ? (
            <div style={{ position: "absolute", left: panel.x + 20, top: panel.y + panel.h + 8, ...glass, borderRadius: 26, padding: "20px 30px", fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, color: c.inkSecondary, whiteSpace: "nowrap", opacity: pillP * exit, transform: `translateZ(${sc.layerZ.tile}px)` }}>{d0.illustrative ? "Illustrative example" : `Source: ${d0.source} · ${d0.asOf}`}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
