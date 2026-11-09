import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStylePack } from "../lib/style.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "..", "src");
const src = fs.readFileSync(path.join(SRC, "style/fonts.ts"), "utf8");
const ctx = fs.readFileSync(path.join(SRC, "style/StyleContext.tsx"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "package.json"), "utf8"));
const slug = (f) => f.toLowerCase().replace(/ /g, "-");

test("fonts.ts imports a fontsource css file for every bundled family and weight, and each package is a dependency", () => {
  const table = { "Plus Jakarta Sans": [500, 600, 700, 800], Inter: [400, 500, 600, 700] };
  for (const [name, weights] of Object.entries(table)) for (const w of weights) assert.ok(src.includes(`@fontsource/${slug(name)}/latin-${w}.css`), `${name} ${w} not imported`);
  for (const m of src.matchAll(/@fontsource\/([a-z-]+)\//g)) assert.ok(pkg.dependencies[`@fontsource/${m[1]}`], `@fontsource/${m[1]} missing from package.json`);
});
test("the style pack's fonts are all bundled, and the provider imports fonts and fails on missing faces", () => {
  const { pack } = loadStylePack(path.join(ROOT, "config/styles/owner-pale-glass"));
  for (const f of [pack.type.display, pack.type.body]) assert.ok(src.includes(`"${f}"`) || src.includes(`  ${f}:`), `${f} not bundled`);
  assert.match(ctx, /from "\.\/fonts"/); assert.match(ctx, /delayRender/); assert.match(ctx, /cancelRender/);
  assert.doesNotMatch(ctx, /\.fonts\.check\(/, "must not rely on fonts.check (true when no face matches)");
});
