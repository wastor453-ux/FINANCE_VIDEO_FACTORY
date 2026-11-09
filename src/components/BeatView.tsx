import React from "react";
import { Beat } from "./common";
import { HeroScene } from "./HeroScene";
import { LineScene } from "./LineScene";
import { BarScene } from "./BarScene";
import registry from "../../factory/config/components.json";

// Component name (from factory/config/components.json) -> implementation. A mode appears in the JSON only when its component is verified.
const IMPLEMENTATIONS: Record<string, React.FC<{ beat: Beat }>> = { HeroScene, LineScene, BarScene };

export const BeatView: React.FC<{ beat: Beat }> = ({ beat }) => {
  const name = (registry.modes as Record<string, string>)[beat.mode];
  const C = name ? IMPLEMENTATIONS[name] : undefined;
  if (!C) throw new Error(`no verified component for mode "${beat.mode}" yet`);
  return <C beat={beat} />;
};
