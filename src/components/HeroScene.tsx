import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook, withAlpha } from "../style/StyleContext";
import { Beat, appear, findEvent, unitParts } from "./common";
import { eased, countValue, formatNumber, decimalsOf, lerp } from "../motion/math.mjs";
import { smoothPath } from "./KpiCard";

/**
 * Mode hero_number, premium staged version: big figure on the left, a tilted glass panel with the chart on the right,
 * floating callout and source tile at different depths, parallax background, slow camera push.
 * Driven by the plan's events: count_up (figure + chart draw + settle), pill_in (callout, chips), camera_push (camera + parallax).
 * Everything is a pure function of the frame (no CSS animation, no clocks, no randomness).
 */
export const HeroScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame(), sc = l.pack.scene, c = l.color, S = c.series, fps = l.fps;
  const up = findEvent(beat, "count_up")!, pill = findEvent(beat, "pill_in"), cam = findEvent(beat, "camera_push");
  const d = beat.data[up.params?.dataRef ?? 0], dec = decimalsOf(d.value), { prefix, suffix } = unitParts(d.unit);
  const series: number[] | undefined = d.series;
  const stagger = Math.round(sc.staggerSec * fps);
  const step = (i: number) => eased(l.pack, up.ease, frame, up.startFrame + i * stagger, up.endFrame + i * stagger);
  const settle = step(0), t = eased(l.pack, up.ease, frame, up.startFrame, up.endFrame);
  const pillP = appear(l, pill, frame), camP = cam ? eased(l.pack, cam.ease, frame, cam.startFrame, cam.endFrame) : 0;
  const exit = up.exitFrame === undefined ? 1 : 1 - eased(l.pack, "exit", frame, up.exitFrame - Math.round(l.pack.motion.durationSec.clean_wipe[0] * fps), up.exitFrame);
  const shown = `${prefix}${formatNumber(countValue(Number(d.value), t, dec), dec)}${suffix}`;
  const full = `${prefix}${formatNumber(Number(d.value), dec)}${suffix}`;
  // largest pack type size that keeps the final figure inside its column
  const colW = 880, sizeFor = (n: number) => Math.min(l.size.megaNumber, Math.max(l.size.display, colW / (n * 0.62)));
  const numSize = sizeFor(full.length * 1.0);

  const shadow = (a: number[][]) => a.map(([x, y, b, o]) => `${x}px ${y}px ${b}px ${withAlpha(S[5].fill, o)}`).join(",") + `, inset 0 1px 0 ${c.surface}`;
  const glass: React.CSSProperties = { background: `linear-gradient(145deg, ${withAlpha(c.surface, 0.94)}, ${withAlpha(c.surface, 0.7)})`, border: `${sc.glass.borderPx}px solid ${withAlpha(c.surface, 0.95)}`, borderRadius: l.px(sc.glass.radiusAtReference), boxShadow: shadow(sc.glass.shadow) };
  const layer = (i: number, extra: React.CSSProperties): React.CSSProperties => { const s = step(i); return { position: "absolute", opacity: s * exit, transformStyle: "preserve-3d", ...extra, transform: `${extra.transform ?? ""} translate3d(0, ${lerp(36, 0, s)}px, 0)` }; };

  const W = 520, H = 230, pad = 10; let path = "", area = "", last: [number, number] = [0, 0];
  if (series) {
    const lo = Math.min(...series), hi = Math.max(...series);
    const pts: [number, number][] = series.map((v, i) => [pad + (i / (series.length - 1)) * (W - 2 * pad), pad + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * pad)]);
    path = smoothPath(pts); last = pts[pts.length - 1]; area = `${path} L${last[0]} ${H} L${pts[0][0]} ${H} Z`;
  }
  const drawn = eased(l.pack, up.ease, frame, up.startFrame + stagger, up.endFrame + stagger);
  const gid = `hs-${beat.id}`;
  const px = (v: number) => v; // layout is authored in 1920x1080 video pixels; only radius/border use board-reference scaling

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: exit }}>
      {/* parallax background layers (far moves most) */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.far * camP}px)`, background: `radial-gradient(ellipse 900px 700px at 8% 0%, ${withAlpha(S[0].fill, 0.3)}, transparent), radial-gradient(ellipse 800px 650px at 100% 100%, ${withAlpha(c.lavender, 0.2)}, transparent)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: -160, right: -160, transform: `translateX(${sc.parallaxPx.mid * camP}px)`, background: `radial-gradient(circle 260px at 48% 22%, ${withAlpha(c.cyan, 0.14)}, transparent)` }} />
      {series ? (
        <svg style={{ position: "absolute", left: px(640), top: px(520), opacity: 0.5, transform: `translateX(${sc.parallaxPx.mid * 1.6 * camP}px)`, filter: `blur(${px(6)}px)` }} width={px(1500)} height={px(520)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={area} fill={S[0].fill} opacity={0.2} />
        </svg>
      ) : null}

      {/* headline block */}
      <div style={{ position: "absolute", left: px(150), top: px(230), whiteSpace: "nowrap", opacity: step(0) * exit, transform: `translate3d(${lerp(-px(40), 0, step(0))}px, 0, 0) scale(${1 + sc.cameraPushScale * camP * 0.5})`, transformOrigin: "left center" }}>
        <div style={{ fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.label, letterSpacing: "0.16em", textTransform: "uppercase", color: c.inkSecondary }}>{d.label}</div>
        <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: numSize, lineHeight: 1, letterSpacing: "-0.035em", fontVariantNumeric: "tabular-nums", marginTop: px(10), background: `linear-gradient(180deg, ${c.ink} 40%, ${S[5].fill})`, WebkitBackgroundClip: "text", color: "transparent", filter: `drop-shadow(0 ${px(20)}px ${px(28)}px ${withAlpha(S[5].fill, 0.2)})` }}>{shown}</div>
        <div style={{ display: "flex", gap: px(16), marginTop: px(32), alignItems: "center", opacity: pillP, transform: `translateY(${lerp(px(10), 0, pillP)}px)` }}>
          {d.delta ? <Chip look={l} tone="gain" d={d} /> : null}
          {d.illustrative ? <div style={{ ...glass, borderRadius: 999, padding: `${px(14)}px ${px(26)}px`, fontFamily: l.font.body, fontWeight: 500, fontSize: l.size.caption, color: c.inkSecondary, boxShadow: "none" }}>Illustrative example</div> : null}
        </div>
      </div>

      {/* 3D stage */}
      <div style={{ position: "absolute", inset: 0, perspective: sc.perspectivePx, perspectiveOrigin: `${sc.perspectiveOriginPct[0]}% ${sc.perspectiveOriginPct[1]}%` }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `scale(${1 + sc.cameraPushScale * camP}) rotateX(${sc.settleTiltDeg.x}deg) rotateY(${lerp(sc.entryTiltDegY, sc.settleTiltDeg.y, settle)}deg)` }}>
          <div style={{ ...layer(1, { left: px(1040), top: px(250), width: px(640), height: px(470), transform: `translateZ(${sc.layerZ.back}px) rotateZ(3deg)` }), ...glass, opacity: 0.55 * step(1) * exit }} />
          <div style={{ ...layer(2, { left: px(1000), top: px(300), width: px(700), height: px(500), padding: px(46), boxSizing: "border-box", transform: `translateZ(${sc.layerZ.main}px)` }), ...glass }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: l.font.body }}>
              <div style={{ fontWeight: 600, fontSize: l.size.label, color: c.ink }}>{d.label}</div>
              {d.delta?.window ? <div style={{ fontWeight: 600, fontSize: l.size.caption * 0.8, letterSpacing: "0.14em", textTransform: "uppercase", color: c.inkSecondary }}>{d.delta.window}</div> : null}
            </div>
            {series ? (
              <svg style={{ position: "absolute", left: px(46), top: px(130), overflow: "visible" }} width={px(608)} height={px(300)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={S[0].fill} stopOpacity={0.34} /><stop offset="1" stopColor={S[0].fill} stopOpacity={0} /></linearGradient>
                  <clipPath id={`${gid}-c`}><rect x={0} y={-H} width={pad + drawn * (W - 2 * pad)} height={H * 3} /></clipPath>
                </defs>
                <path d={area} fill={`url(#${gid})`} clipPath={`url(#${gid}-c)`} />
                <path d={path} fill="none" stroke={S[0].fill} strokeWidth={7} opacity={0.35} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} strokeLinecap="round" />
                <path d={path} fill="none" stroke={S[0].stroke} strokeWidth={4.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} />
                <g opacity={drawn > 0.98 ? 1 : 0}><circle cx={last[0]} cy={last[1]} r={18} fill={S[0].fill} opacity={0.25} /><circle cx={last[0]} cy={last[1]} r={8} fill={S[0].stroke} stroke={c.surface} strokeWidth={3.5} /></g>
              </svg>
            ) : (
              <div style={{ position: "absolute", left: px(46), bottom: px(60), fontFamily: l.font.display }}>{d.delta ? <Chip look={l} tone="gain" d={d} big /> : null}</div>
            )}
          </div>
          {series && d.callout ? (
            <div style={{ ...layer(3, { left: px(1500), top: px(250), padding: `${px(20)}px ${px(34)}px`, transform: `translateZ(${sc.layerZ.near}px)` }), ...glass, borderRadius: 999, fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.subtitle * 0.8, color: c.ink, opacity: pillP * exit, whiteSpace: "nowrap" }}>{d.callout.text}</div>
          ) : null}
          {d.source ? (
            <div style={{ ...layer(4, { left: px(1010), top: px(830), padding: `${px(22)}px ${px(32)}px`, transform: `translateZ(${sc.layerZ.tile}px)` }), ...glass, borderRadius: px(26), fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, color: c.inkSecondary, opacity: pillP * exit, whiteSpace: "nowrap" }}>Source: {d.source} · {d.asOf}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const Chip: React.FC<{ look: ReturnType<typeof useLook>; tone: "gain"; d: any; big?: boolean }> = ({ look: l, d, big }) => {
  const up = d.delta.value >= 0, t = up ? l.color.flow.gain : l.color.flow.loss, size = big ? l.size.title : l.size.body;
  const tri = up ? "M0 10 L5 0 L10 10 Z" : "M0 0 L10 0 L5 10 Z";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.3, padding: big ? 0 : "14px 26px", borderRadius: 999, background: big ? "none" : withAlpha(l.color.surface, 0.9), border: big ? "none" : `1.5px solid ${l.color.surface}`, boxShadow: big ? "none" : `0 10px 28px -10px ${withAlpha(l.color.series[5].fill, 0.3)}`, fontFamily: l.font.body, fontWeight: 600, fontSize: size, color: t.text, fontVariantNumeric: "tabular-nums" }}>
      <svg width={size * 0.6} height={size * 0.55} viewBox="0 0 10 10"><path d={tri} fill={t.fill} stroke={t.stroke} strokeWidth={0.6} /></svg>
      <span>{up ? "+" : "−"}{Math.abs(d.delta.value)}{d.delta.unit}</span>
      {d.delta.window && !big ? <span style={{ fontWeight: 500, color: l.color.inkSecondary }}>{d.delta.window}</span> : null}
    </div>
  );
};
