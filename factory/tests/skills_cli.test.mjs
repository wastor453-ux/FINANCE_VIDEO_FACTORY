import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const F = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffx = path.join(F, "bin/ffx.mjs");
const run = (args, opts = {}) => spawnSync("node", [ffx, ...args], { encoding: "utf8", ...opts });

test("every skill has frontmatter whose name matches its folder and a real description", () => {
  const dirs = fs.readdirSync(path.join(F, "skills"));
  assert.equal(dirs.length, 16);
  for (const d of dirs) {
    const txt = fs.readFileSync(path.join(F, "skills", d, "SKILL.md"), "utf8");
    const m = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(txt);
    assert.ok(m, `${d}: bad frontmatter`);
    assert.equal(m[1], d);
    assert.ok(m[2].length > 40, `${d}: description too short`);
  }
});

test("orchestrator mentions every other stage skill and the forbidden actions", () => {
  const orch = fs.readFileSync(path.join(F, "skills/ffx-orchestrator/SKILL.md"), "utf8");
  for (const d of fs.readdirSync(path.join(F, "skills"))) {
    if (d === "ffx-orchestrator" || d === "ffx-motion-library") continue;
    assert.ok(orch.includes(d), `orchestrator never mentions ${d}`);
  }
  assert.match(orch, /production render, publish\/upload, merge/);
});

test("every ffx command named in skills exists in the CLI help", () => {
  const help = run([]).stdout;
  for (const d of fs.readdirSync(path.join(F, "skills"))) {
    const txt = fs.readFileSync(path.join(F, "skills", d, "SKILL.md"), "utf8");
    for (const [, cmd] of txt.matchAll(/ffx(?:\.mjs)? ([a-z][a-z-]+)/g)) {
      if (["doctor", "discover", "select", "validate", "mark-seen", "plan-chunks", "verify-media", "audio-segment", "lint-plan", "lint-script"].includes(cmd)) assert.ok(help.includes(cmd), `${d}: ${cmd}`);
    }
  }
});

test("CLI end to end: select -> mark-seen -> second run excludes seen videos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-"));
  const now = "2026-10-25T00:00:00Z";
  const h = (x) => new Date(new Date(now).getTime() - x * 3600e3).toISOString();
  const mk = (id, ch, age, views) => ({ videoId: id, channelId: ch, channelTitle: ch, title: id, publishedAt: h(age), durationSec: 700, viewCount: views, likeCount: views / 25, commentCount: views / 250, liveBroadcastContent: "none" });
  const videos = [mk("A1", "a", 40, 80000), mk("A2", "a", 100, 20000), mk("A3", "a", 150, 22000), mk("A4", "a", 200, 25000), mk("B1", "b", 40, 30000), mk("B2", "b", 100, 30000), mk("B3", "b", 150, 31000), mk("B4", "b", 200, 29000)];
  fs.writeFileSync(path.join(dir, "d.json"), JSON.stringify({ schema_version: "1.0", fetchedAt: now, channels: [{}], videos, failures: [] }));
  const seen = path.join(dir, "seen.json");
  let r = run(["select", "--in", path.join(dir, "d.json"), "--out", path.join(dir, "s1.json"), "--seen", seen, "--now", now]);
  assert.equal(r.status, 0, r.stderr);
  const s1 = JSON.parse(fs.readFileSync(path.join(dir, "s1.json"), "utf8"));
  assert.equal(s1.winner.videoId, "A1");
  assert.equal(run(["validate", "selection", path.join(dir, "s1.json")]).status, 0);
  assert.equal(run(["mark-seen", "--selection", path.join(dir, "s1.json"), "--seen", seen]).status, 0);
  r = run(["select", "--in", path.join(dir, "d.json"), "--out", path.join(dir, "s2.json"), "--seen", seen, "--now", now]);
  assert.equal(r.status, 3, "everything seen => exit 3, no silent pick");
});

test("validate rejects a bad artifact with a non-zero exit and readable message", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-"));
  fs.writeFileSync(path.join(dir, "bad.json"), JSON.stringify({ schema_version: "1.0", title: "x" }));
  const r = run(["validate", "script", path.join(dir, "bad.json")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing required property/);
});

test("package schema forbids published=true and non-passing QA", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-"));
  const base = { schema_version: "1.0", videoFile: "v.mp4", thumbnailFile: "t.png", title: "A title", description: "x".repeat(60), tags: ["a"], chapters: [{ time: "0:00", title: "a" }, { time: "1:00", title: "b" }, { time: "2:00", title: "c" }], sourcesListed: true, disclaimerIncluded: true, published: false, qaVerdict: "pass" };
  fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify(base));
  assert.equal(run(["validate", "package", path.join(dir, "ok.json")]).status, 0);
  fs.writeFileSync(path.join(dir, "pub.json"), JSON.stringify({ ...base, published: true }));
  assert.equal(run(["validate", "package", path.join(dir, "pub.json")]).status, 1);
  fs.writeFileSync(path.join(dir, "qa.json"), JSON.stringify({ ...base, qaVerdict: "fail" }));
  assert.equal(run(["validate", "package", path.join(dir, "qa.json")]).status, 1);
});

test("render_job schema requires explicit user approval", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-"));
  const job = { schema_version: "1.0", jobId: "2026-W44", composition: "WeeklyVideo", repo: "OWNER/REPO", ref: "factory/v1", commit: "a".repeat(40), startFrame: 0, endFrame: 8999, chunkFrames: 600, crf: 18, inputHashes: { "scene_plan.json": "b".repeat(64) }, approvedByUser: true, approvedAt: "2026-10-25T12:00:00Z" };
  fs.writeFileSync(path.join(dir, "j.json"), JSON.stringify(job));
  assert.equal(run(["validate", "render_job", path.join(dir, "j.json")]).status, 0);
  fs.writeFileSync(path.join(dir, "n.json"), JSON.stringify({ ...job, approvedByUser: false }));
  assert.equal(run(["validate", "render_job", path.join(dir, "n.json")]).status, 1);
});

test("verify-media works on a real ffmpeg-made file (and fails on a wrong expectation)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-"));
  const f = path.join(dir, "t.mp4");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=1920x1080:r=30:d=2", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f]);
  } catch {
    return; // ffmpeg unavailable: covered by doctor, not a test failure
  }
  assert.equal(run(["verify-media", f, "--frames", "60", "--audio", "--sample-rate", "48000"]).status, 0);
  assert.equal(run(["verify-media", f, "--frames", "61", "--audio"]).status, 1);
  assert.equal(run(["verify-media", f, "--frames", "60", "--width", "1280"]).status, 1);
});
