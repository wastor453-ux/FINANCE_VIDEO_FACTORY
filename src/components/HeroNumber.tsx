import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook } from "../style/StyleContext";
import { Beat, Card, Label, Delta, SourceTag, appear, findEvent, unitParts } from "./common";
import { eased, countValue, formatNumber, decimalsOf, lerp } from "../motion/math.mjs";

/** Mode hero_number: one big count-up figure. Events: count_up (card + number), pill_in (source/as-of + delta). */
export const HeroNumber: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame();
  const up = findEvent(beat, "count_up")!, pill = findEvent(beat, "pill_in");
  const d = beat.data[up.params?.dataRef ?? 0], dec = decimalsOf(d.value), { prefix, suffix } = unitParts(d.unit);
  const cardIn = appear(l, { ...up, endFrame: up.startFrame + Math.round(l.fps * 0.4) }, frame);
  const t = eased(l.pack, up.ease, frame, up.startFrame, up.endFrame);
  const shown = formatNumber(countValue(Number(d.value), t, dec), dec);
  const pillIn = appear(l, pill, frame);
  const fade = up.exitFrame !== undefined ? appear(l, { ...up, startFrame: 0, endFrame: 1 }, frame) : 1;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: fade }}>
      <Card style={{ padding: `${l.px(48)}px ${l.px(90)}px`, minWidth: l.px(700), textAlign: "center", opacity: cardIn, transform: `translateY(${lerp(l.px(14), 0, cardIn)}px)` }}>
        <Label>{d.label}</Label>
        <div style={{ fontFamily: l.font.display, fontWeight: 800, fontSize: l.size.heroNumber, lineHeight: 1.05, color: l.color.ink, fontVariantNumeric: "tabular-nums", margin: `${l.px(10)}px 0 ${l.px(14)}px` }}>{prefix}{shown}{suffix}</div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: l.px(24), opacity: pillIn, transform: `translateY(${lerp(l.px(8), 0, pillIn)}px)` }}>
          {d.delta ? <Delta value={d.delta.value} unit={d.delta.unit} window={d.delta.window} size={l.size.body} /> : null}
          <SourceTag d={d} size={l.size.caption} />
        </div>
      </Card>
    </div>
  );
};
