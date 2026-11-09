import React from "react";
import { Composition } from "remotion";
import { SystemCheck } from "./SystemCheck";
import { BeatPreview } from "./BeatPreview";
import { Video } from "./Video";

// Production compositions are added here as their components are built and inspected
// (see factory/docs/STATUS.md). Only the toolchain check is registered today.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BeatPreview" component={BeatPreview} durationInFrames={180} fps={30} width={1920} height={1080} defaultProps={{ pack: null as any, beat: null as any }} />
    <Composition id="Video" component={Video} durationInFrames={30} fps={30} width={1920} height={1080}
      defaultProps={{ plan: null as any, pack: null as any, backgrounds: {} }}
      calculateMetadata={({ props }) => ({ durationInFrames: props.plan.totalFrames, fps: props.plan.fps, width: props.plan.width, height: props.plan.height })} />
    <Composition id="SystemCheck" component={SystemCheck} durationInFrames={90} fps={30} width={1920} height={1080} />
  </>
);
