import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { StyleProvider } from "./style/StyleContext";
import { BeatView } from "./components/BeatView";
import { eased } from "./motion/math.mjs";
import { buildCameraKeys, cameraAt, cameraTransform, backgroundAt, backgroundTransform } from "./motion/life.mjs";
import { extendBeat, transitionStyles } from "./motion/transition.mjs";

export interface VideoProps { plan: any; pack: any; backgrounds: Record<string, string> }

/** Wraps one beat; during a transition window it applies the outgoing or incoming style (pure function of the frame). */
const Layer: React.FC<{ pack: any; plan: any; trans?: any; role: "outgoing" | "incoming" | "plain"; children: React.ReactNode }> = ({ pack, plan, trans, role, children }) => {
  const frame = useCurrentFrame();
  let style: React.CSSProperties = {};
  if (trans && role !== "plain") {
    const p = eased(pack, trans.ease ?? "ease-in-out", frame, trans.startFrame, trans.endFrame);
    if (frame >= trans.startFrame && frame <= trans.endFrame) style = transitionStyles(trans.type, p, plan.width, plan.height)[role] as React.CSSProperties;
    else if (role === "incoming" && frame < trans.startFrame) style = { opacity: 0 };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/** Whole-plan composition: background, then every beat as a <Sequence> at its planned frames, with transitions between beats. Same code path for previews, local checks and the GitHub render. */
export const Video: React.FC<VideoProps> = ({ plan, pack, backgrounds }) => {
  const frame = useCurrentFrame(), life = pack.scene.life, seed = String(plan.seed ?? plan.style.packId);
  const keys = React.useMemo(() => buildCameraKeys(plan, life), [plan, life]);
  const cam = cameraAt(frame, keys, life, plan.fps, seed), bg = backgroundAt(frame, cam, life, plan.fps, seed);
  const bgFor = (id: string) => backgrounds[id];
  const beats: any[] = plan.scenes.flatMap((s: any) => s.beats);
  const tr = (b: any) => (b.transitionIn && b.transitionIn.type !== "none" ? { ...b.transitionIn, ease: "ease-in-out" } : undefined);
  return (
    <StyleProvider pack={pack} fps={plan.fps} width={plan.width}>
      <AbsoluteFill style={{ backgroundColor: pack.color.canvas, overflow: "hidden" }}>
        <AbsoluteFill style={{ backgroundImage: `url(${bgFor(plan.style.background)})`, backgroundSize: "cover", transform: backgroundTransform(bg) }} />
        <AbsoluteFill style={{ transform: cameraTransform(cam) }}>
        {beats.map((b, i) => {
          const next = beats[i + 1], tin = tr(b), tout = next ? tr(next) : undefined;
          const view = tout ? extendBeat(b, tout.endFrame) : b;
          const role = tout ? "outgoing" : tin ? "incoming" : "plain";
          return (
            <React.Fragment key={b.id}>
              {/* the beat is mounted only while it is visible: its own span plus an outgoing tail */}
              <Visible from={tin ? tin.startFrame : b.startFrame} to={view.endFrame}>
                <Layer pack={pack} plan={plan} trans={tout ?? tin} role={role as any}>
                  <Sequence from={b.startFrame} durationInFrames={view.endFrame - b.startFrame}>
                    {b.background && b.background !== plan.style.background ? <AbsoluteFill style={{ backgroundImage: `url(${bgFor(b.background)})`, backgroundSize: "cover" }} /> : null}
                    <BeatView beat={view} />
                  </Sequence>
                </Layer>
              </Visible>
            </React.Fragment>
          );
        })}
        </AbsoluteFill>
      </AbsoluteFill>
    </StyleProvider>
  );
};

const Visible: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};
