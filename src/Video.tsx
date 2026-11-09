import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { StyleProvider } from "./style/StyleContext";
import { BeatView } from "./components/BeatView";

export interface VideoProps { plan: any; pack: any; backgrounds: Record<string, string> }

/** Whole-plan composition: background, then every beat as a <Sequence> at its planned frames. Same code path for previews, local checks and the GitHub render. */
export const Video: React.FC<VideoProps> = ({ plan, pack, backgrounds }) => {
  const bgFor = (id: string) => backgrounds[id];
  return (
    <StyleProvider pack={pack} fps={plan.fps} width={plan.width}>
      <AbsoluteFill style={{ backgroundColor: pack.color.canvas, backgroundImage: `url(${bgFor(plan.style.background)})`, backgroundSize: "cover" }}>
        {plan.scenes.flatMap((s: any) => s.beats).map((b: any) => (
          <Sequence key={b.id} from={b.startFrame} durationInFrames={b.endFrame - b.startFrame}>
            {b.background && b.background !== plan.style.background ? <AbsoluteFill style={{ backgroundImage: `url(${bgFor(b.background)})`, backgroundSize: "cover" }} /> : null}
            <BeatView beat={b} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </StyleProvider>
  );
};
