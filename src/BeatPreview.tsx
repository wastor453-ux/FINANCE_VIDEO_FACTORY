import React from "react";
import { AbsoluteFill } from "remotion";
import { StyleProvider } from "./style/StyleContext";
import { BeatView } from "./components/BeatView";

/** Renders one beat on the pack's background. Used for board comparison stills and component checks. */
export const BeatPreview: React.FC<{ pack: any; beat: any; background?: string; bgDataUrl?: string }> = ({ pack, beat, bgDataUrl }) => (
  <StyleProvider pack={pack} fps={30}>
    <AbsoluteFill style={{ backgroundColor: pack.color.canvas, backgroundImage: bgDataUrl ? `url(${bgDataUrl})` : undefined, backgroundSize: "cover" }}>
      <BeatView beat={beat} />
    </AbsoluteFill>
  </StyleProvider>
);
