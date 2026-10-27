// Chunk verification + assembly. The GitHub workflow calls this instead of embedding shell in YAML,
// so exactly the same logic is unit-tested here.
//
// Per chunk: sidecar metadata, SHA-256, AND an ffprobe of the chunk itself (resolution, fps,
// decoded frame count == its frame range). Then coverage, lossless concat, master verification,
// and finally an exact-length audio mux.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyCoverage, framesToMicros, microsToTime } from "./chunks.mjs";
import { probe, verifyProbe } from "./media.mjs";

export function sha256File(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1 << 20);
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

/** Write the sidecar a render job produces next to chunk_<id>.mp4 */
export function writeChunkMeta(dir, chunk) {
  const mp4 = path.join(dir, `chunk_${chunk.chunk_id}.mp4`);
  if (!fs.existsSync(mp4) || fs.statSync(mp4).size === 0) throw new Error(`chunk ${chunk.chunk_id}: output missing or empty`);
  const meta = { chunk_id: chunk.chunk_id, start: chunk.start, end: chunk.end, bytes: fs.statSync(mp4).size, sha256: sha256File(mp4) };
  fs.writeFileSync(path.join(dir, `chunk_${chunk.chunk_id}.meta.json`), JSON.stringify(meta, null, 2));
  return meta;
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.slice(0, 4).join(" ")}… failed: ${(r.stderr || "").trim().slice(-600)}`);
}

/**
 * @param o.chunkDir   folder with chunk_<id>.mp4 + chunk_<id>.meta.json
 * @param o.job        { startFrame, endFrame, chunkFrames }
 * @param o.video      { width, height, fps }
 * @param o.audioFile  optional finished mix (from `ffx mix-audio`)
 * @returns report { pass, steps[] }  — throws on the first failure with a specific message
 */
export function assemble(o) {
  const { chunkDir, job, video, outDir, audioFile } = o;
  const steps = [];
  const ok = (name, detail) => steps.push({ name, status: "pass", detail });
  fs.mkdirSync(outDir, { recursive: true });

  const metaFiles = fs.readdirSync(chunkDir).filter((f) => /^chunk_\d+\.meta\.json$/.test(f));
  const metas = metaFiles.map((f) => JSON.parse(fs.readFileSync(path.join(chunkDir, f), "utf8")));
  verifyCoverage(metas, job.startFrame, job.endFrame, job.chunkFrames);
  ok("coverage", `${metas.length} contiguous chunks cover frames ${job.startFrame}-${job.endFrame}`);

  const sorted = [...metas].sort((a, b) => a.chunk_id - b.chunk_id);
  for (const m of sorted) {
    const file = path.join(chunkDir, `chunk_${m.chunk_id}.mp4`);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`chunk ${m.chunk_id}: video missing or empty`);
    if (sha256File(file) !== m.sha256) throw new Error(`chunk ${m.chunk_id}: SHA-256 mismatch (corrupted in transit?)`);
    const res = verifyProbe(probe(file), { width: video.width, height: video.height, fps: video.fps, frames: m.end - m.start + 1, audio: false });
    if (!res.pass) throw new Error(`chunk ${m.chunk_id}: ${res.checks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.detail}`).join("; ")}`);
  }
  ok("chunks", `${sorted.length} chunks passed hash + ffprobe (resolution, fps, frame count)`);

  const list = path.join(outDir, "concat.txt");
  fs.writeFileSync(list, sorted.map((m) => `file '${path.resolve(chunkDir, `chunk_${m.chunk_id}.mp4`).replace(/'/g, "'\\''")}'\n`).join(""));
  const silent = path.join(outDir, "master_video.mp4");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", silent]);

  const totalFrames = job.endFrame - job.startFrame + 1;
  const vres = verifyProbe(probe(silent), { width: video.width, height: video.height, fps: video.fps, frames: totalFrames, audio: false });
  if (!vres.pass) throw new Error(`assembled video failed: ${vres.checks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.detail}`).join("; ")}`);
  const dec = spawnSync("ffmpeg", ["-v", "error", "-i", silent, "-f", "null", "-"], { encoding: "utf8" });
  if (dec.status !== 0 || dec.stderr.trim()) throw new Error(`assembled video does not decode cleanly: ${dec.stderr.trim().slice(0, 400)}`);
  ok("assembled_video", `${totalFrames} frames, decodes cleanly`);

  let finalFile = silent;
  if (audioFile) {
    finalFile = path.join(outDir, "master.mp4");
    const dur = microsToTime(framesToMicros(totalFrames, video.fps));
    ffmpeg(["-i", silent, "-i", audioFile, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", ...(/\.(m4a|aac)$/i.test(audioFile) ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "256k", "-ar", "48000"]), "-t", dur, "-movflags", "+faststart", finalFile]);
    const fres = verifyProbe(probe(finalFile), { width: video.width, height: video.height, fps: video.fps, frames: totalFrames, audio: true, audioSampleRate: 48000 });
    if (!fres.pass) throw new Error(`muxed master failed: ${fres.checks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.detail}`).join("; ")}`);
    ok("audio_mux", `audio muxed to exactly ${dur}s; A/V drift within 2 frames`);
  } else {
    ok("audio_mux", "skipped (no audio file supplied)");
  }
  const report = { pass: true, file: finalFile, frames: totalFrames, steps };
  fs.writeFileSync(path.join(outDir, "assemble_report.json"), JSON.stringify(report, null, 2));
  return report;
}
