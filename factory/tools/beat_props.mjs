#!/usr/bin/env node
// Build Remotion input props for the BeatPreview composition: node beat_props.mjs <beat.json> <stylePackDir> [out.json]
// Embeds the pack and its default background (as a data URL) so a still can be rendered with --props.
import fs from "node:fs";
import path from "node:path";
import { loadStylePack } from "../lib/style.mjs";

export function beatProps(beatFile, packDir) {
  const { pack, problems } = loadStylePack(packDir);
  if (problems.length) throw new Error(`style pack problems: ${problems.join("; ")}`);
  const bg = pack.backgrounds.items.find((b) => b.id === pack.backgrounds.default);
  const png = fs.readFileSync(path.join(packDir, bg.file));
  return { pack, beat: JSON.parse(fs.readFileSync(beatFile, "utf8")), background: bg.id, bgDataUrl: `data:image/png;base64,${png.toString("base64")}` };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [beat, dir, out] = process.argv.slice(2);
  if (!beat || !dir) { console.error("usage: beat_props.mjs <beat.json> <stylePackDir> [out.json]"); process.exit(2); }
  const json = JSON.stringify(beatProps(beat, dir));
  if (out) fs.writeFileSync(out, json); else process.stdout.write(json);
}
