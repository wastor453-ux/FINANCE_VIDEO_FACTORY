import React from "react";
import { Composition } from "remotion";
import { SystemCheck } from "./SystemCheck";

// Production compositions are added here as their components are built and inspected
// (see factory/docs/STATUS.md). Only the toolchain check is registered today.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="SystemCheck" component={SystemCheck} durationInFrames={90} fps={30} width={1920} height={1080} />
  </>
);
