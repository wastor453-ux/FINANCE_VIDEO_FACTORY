// Toolchain smoke composition: proves Remotion bundles, tokens load and frame-driven animation renders.
// It is NOT a production scene and contains no brand or financial content.
import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { tokens, sec } from "./tokens";

const Title: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame, [0, sec(tokens.motionSec.count_up[1], fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        fontFamily: `${tokens.font.family}, ${tokens.font.fallback}`,
        color: tokens.color.ink,
        fontSize: 96,
        fontWeight: 700,
        opacity: t,
        transform: `translateY(${(1 - t) * 24}px)`,
      }}
    >
      {text}
    </div>
  );
};

export const SystemCheck: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: tokens.color.canvas, alignItems: "center", justifyContent: "center" }}>
    <Title text="Toolchain check" />
  </AbsoluteFill>
);
