#!/usr/bin/env node
// Build the props file for the Video composition from a v2 plan and its style pack:
//   node plan_props.mjs <scene_plan.json> <stylePackDir | kit id> [out.json]
// Embeds the pack and only the backgrounds the plan uses (as data URLs), so the render needs nothing outside the committed props file.
// The same file is used for local checks and for the GitHub render job (propsFile, listed in inputHashes).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStylePack } from "../lib/style.mjs";
import { loadPackById } from "../lib/kits.mjs";
const FACTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function planProps(planFile, packDir) {
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  if (plan.schema_version !== "2.0") throw new Error("plan_props needs a v2 plan");
  // packDir is a style pack directory, or the id of a style kit (resolved over its base pack; backgrounds come from the base pack's assets)
  const { pack, dir, problems } = fs.existsSync(path.join(packDir, "style.json")) ? { ...loadStylePack(packDir), dir: packDir } : loadPackById(FACTORY, packDir);
  if (problems.length) throw new Error(`style pack problems: ${problems.join("; ")}`);
  if (plan.style.packId !== pack.id) throw new Error(`plan wants style pack "${plan.style.packId}", but ${packDir} resolves to "${pack.id}"`);
  const ids = new Set([plan.style.background, ...plan.scenes.flatMap((s) => s.beats.map((b) => b.background).filter(Boolean))]);
  const backgrounds = {};
  for (const id of ids) {
    const bg = pack.backgrounds.items.find((b) => b.id === id);
    if (!bg) throw new Error(`background "${id}" is not in the style pack`);
    backgrounds[id] = `data:image/png;base64,${fs.readFileSync(path.join(dir, bg.file)).toString("base64")}`;
  }
  return { plan, pack, backgrounds };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [planFile, dir, out] = process.argv.slice(2);
  if (!planFile || !dir) { console.error("usage: plan_props.mjs <scene_plan.json> <stylePackDir | kit id> [out.json]"); process.exit(2); }
  const json = JSON.stringify(planProps(planFile, dir));
  if (out) fs.writeFileSync(out, json); else process.stdout.write(json);
}
