import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook, withAlpha } from "../style/StyleContext";
import { Beat, Card, Delta, SourceTag, appear, findEvent, unitParts } from "./common";
import { eased, countValue, formatNumber, decimalsOf, lerp } from "../motion/math.mjs";

/** Smooth path through points (Catmull-Rom -> cubic). Pure geometry. */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Mode hero_number with a data series: KPI card (label, big value, delta, sparkline). Events: count_up (number and sparkline draw together, one move), pill_in. */
export const KpiCard: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame();
  const up = findEvent(beat, "count_up")!, line = up, pill = findEvent(beat, "pill_in");
  const d = beat.data[up.params?.dataRef ?? 0], dec = decimalsOf(d.value), { prefix, suffix } = unitParts(d.unit);
  const W = l.px(830), chartW = l.px(330), chartH = l.px(170), series: number[] = d.series ?? [];
  const lo = Math.min(...series), hi = Math.max(...series), pad = 6;
  const pts: [number, number][] = series.map((v, i) => [pad + (i / (series.length - 1)) * (chartW - 2 * pad), pad + (1 - (v - lo) / (hi - lo || 1)) * (chartH - 2 * pad)]);
  const path = smoothPath(pts), area = `${path} L${pts[pts.length - 1][0]} ${chartH} L${pts[0][0]} ${chartH} Z`;
  const cardIn = appear(l, { ...up, endFrame: up.startFrame + Math.round(l.fps * 0.4) }, frame);
  const t = eased(l.pack, up.ease, frame, up.startFrame, up.endFrame), drawn = eased(l.pack, line.ease, frame, line.startFrame, line.endFrame);
  const pillIn = appear(l, pill, frame), s = l.color.series[0], last = pts[pts.length - 1];
  const gid = `kpi-${beat.id}`;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: l.px(28), alignItems: "center", justifyContent: "center" }}>
      <Card style={{ width: W, padding: l.px(48), opacity: cardIn, transform: `translateY(${lerp(l.px(14), 0, cardIn)}px)`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.label, color: l.color.ink, marginBottom: l.px(6) }}>{d.label}</div>
          <div style={{ fontFamily: l.font.display, fontWeight: 800, fontSize: l.size.display, lineHeight: 1.05, color: l.color.ink, fontVariantNumeric: "tabular-nums" }}>{prefix}{formatNumber(countValue(Number(d.value), t, dec), dec)}{suffix}</div>
          <div style={{ marginTop: l.px(18), opacity: pillIn, transform: `translateY(${lerp(l.px(8), 0, pillIn)}px)` }}>
            {d.delta ? <Delta value={d.delta.value} unit={d.delta.unit} window={d.delta.window} size={l.size.body} /> : null}
          </div>
        </div>
        <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} style={{ overflow: "visible" }}>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.fill} stopOpacity={0.28} /><stop offset="1" stopColor={s.fill} stopOpacity={0} /></linearGradient></defs>
          <path d={area} fill={`url(#${gid})`} opacity={drawn} />
          <path d={path} fill="none" stroke={s.stroke} strokeWidth={l.px(3.5)} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} />
          <circle cx={last[0]} cy={last[1]} r={l.px(6)} fill={s.stroke} stroke={l.color.surface} strokeWidth={l.px(2)} opacity={drawn > 0.98 ? 1 : 0} />
        </svg>
      </Card>
      <div style={{ opacity: pillIn }}><SourceTag d={d} size={l.size.caption} /></div>
    </div>
  );
};
