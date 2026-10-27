// Render-job preflight. Runs inside the GitHub workflow BEFORE any runner time is spent on rendering,
// and locally before the user is asked to authorize a render. It never starts a render.
import fs from "node:fs";
import path from "node:path";
import { validate } from "./schema.mjs";
import { planChunks } from "./chunks.mjs";
import { sha256File } from "./assemble.mjs";

const SAFE_REL = /^[A-Za-z0-9._\-\/]+$/;

/** A repo-relative path with no traversal, no absolute root, no odd characters. */
export function isSafeRelPath(p) {
  if (typeof p !== "string" || !p || p.startsWith("/") || !SAFE_REL.test(p)) return false;
  return !p.split("/").some((part) => part === "" || part === "." || part === "..");
}

/**
 * @returns {{ok:boolean, problems:string[], matrix?:{chunk:Array}, video?:object, concurrency?:number, crf?:number}}
 */
export function checkJob(job, { schema, root, pipeline }) {
  const problems = validate(schema, job);
  if (problems.length) return { ok: false, problems };
  const p = [];
  if (job.endFrame < job.startFrame) p.push("endFrame must be >= startFrame");
  if (job.endFrame - job.startFrame + 1 > 100000) p.push("frame range exceeds 100000 frames");
  for (const key of ["propsFile", "audioFile", "planFile"]) {
    if (job[key] !== undefined && !isSafeRelPath(job[key])) p.push(`${key} must be a safe repo-relative path (got "${job[key]}")`);
  }
  if (job.audioFile && !job.inputHashes[job.audioFile]) p.push(`audioFile "${job.audioFile}" must be listed in inputHashes`);
  if (job.propsFile && !job.inputHashes[job.propsFile]) p.push(`propsFile "${job.propsFile}" must be listed in inputHashes`);
  if (!Object.keys(job.inputHashes).length) p.push("inputHashes is empty: at least the props/plan and audio inputs must be hashed");
  for (const [rel, want] of Object.entries(job.inputHashes)) {
    if (!isSafeRelPath(rel)) { p.push(`inputHashes key "${rel}" is not a safe repo-relative path`); continue; }
    const file = path.join(root, rel);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) { p.push(`input missing or empty: ${rel}`); continue; }
    const got = sha256File(file);
    if (got !== want) p.push(`input changed since approval: ${rel} (expected ${want.slice(0, 12)}…, found ${got.slice(0, 12)}…)`);
  }
  const video = { width: job.width ?? pipeline.video.width, height: job.height ?? pipeline.video.height, fps: job.fps ?? pipeline.video.fps };
  if (!(video.fps > 0) || video.width % 2 || video.height % 2) p.push("width/height must be even and fps > 0");
  if (p.length) return { ok: false, problems: p };
  const concurrency = job.concurrency ?? pipeline.render.concurrencyPerJob;
  return {
    ok: true,
    problems: [],
    matrix: { chunk: planChunks(job.startFrame, job.endFrame, job.chunkFrames) },
    video,
    concurrency,
    crf: job.crf,
    totalFrames: job.endFrame - job.startFrame + 1,
  };
}
