import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { frameToSamples, voiceTimeline, buildMixArgs, runMix } from "../lib/mix.mjs";
import { assemble, writeChunkMeta, sha256File } from "../lib/assemble.mjs";
import { qaVideo, parseBlack, parseFreeze, parseSilence, parseLoudness, sampleFrames } from "../lib/qa.mjs";
import { probe } from "../lib/media.mjs";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0;
// In CI FFX_REQUIRE_FFMPEG=1 turns "ffmpeg missing" into a failure instead of a silent skip.
const SKIP = !HAVE_FFMPEG && !process.env.FFX_REQUIRE_FFMPEG;
const W = 320, H = 180, FPS = 30, TOTAL = 150; // 5.0 s
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ffx-test-"));
const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};

/** Synthetic "render": a numbered test pattern, cut into independently encoded chunks like Remotion would. */
function makeChunks(dir, size = 60) {
  const full = path.join(dir, "full.mp4");
  ff(["-f", "lavfi", "-i", `testsrc2=size=${W}x${H}:rate=${FPS}`, "-frames:v", String(TOTAL), "-pix_fmt", "yuv420p", "-c:v", "libx264", "-g", "30", full]);
  const chunks = [];
  for (let id = 0, s = 0; s < TOTAL; s += size, id++) {
    const e = Math.min(s + size - 1, TOTAL - 1);
    const out = path.join(dir, `chunk_${id}.mp4`);
    ff(["-i", full, "-vf", `trim=start_frame=${s}:end_frame=${e + 1},setpts=PTS-STARTPTS`, "-r", String(FPS), "-pix_fmt", "yuv420p", "-c:v", "libx264", "-g", "30", out]);
    chunks.push({ chunk_id: id, start: s, end: e });
  }
  return chunks;
}
const tone = (file, f, sec, amp = 0.3) => ff(["-f", "lavfi", "-i", `sine=f=${f}:d=${sec}:r=48000`, "-af", `volume=${amp}`, "-ar", "48000", file]);

// ---------- pure helpers ----------
test("frameToSamples is exact at 30 fps and never truncates at 29.97", () => {
  assert.equal(frameToSamples(30, 30), 48000);
  assert.equal(frameToSamples(1, 30), 1600);
  assert.equal(frameToSamples(30000, 30000 / 1001), 48048000); // exactly 1001 s of audio for 30000 NTSC frames
});

test("voiceTimeline honours startMs and falls back to back-to-back placement", () => {
  const tl = voiceTimeline({ scenes: [{ sceneId: "a", file: "a.wav", durationMs: 2000 }, { sceneId: "b", file: "b.wav", durationMs: 1000 }, { sceneId: "c", file: "c.wav", durationMs: 500, startMs: 5000 }] });
  assert.deepEqual(tl.map((t) => t.startSamples), [0, 96000, 240000]);
});

test("QA parsers read ffmpeg detector output", () => {
  assert.deepEqual(parseBlack("[blackdetect @ 0x1] black_start:1.5 black_end:2.2 black_duration:0.7"), [{ start: 1.5, end: 2.2, duration: 0.7 }]);
  assert.equal(parseFreeze("lavfi.freezedetect.freeze_start: 3.2\nlavfi.freezedetect.freeze_duration: 6.1")[0].duration, 6.1);
  assert.equal(parseSilence("silence_start: 4.0\nsilence_end: 7.5 | silence_duration: 3.5")[0].duration, 3.5);
  assert.equal(parseSilence("silence_start: 4.0")[0].open, true);
  assert.deepEqual(parseLoudness("    I:         -16.2 LUFS\n  True peak:\n    Peak:       -2.1 dBFS"), { integratedLufs: -16.2, truePeakDbfs: -2.1 });
});

test("sampleFrames covers every scene start, middle and end and respects the cap", () => {
  const scenes = [{ startFrame: 0, endFrame: 60 }, { startFrame: 60, endFrame: 150 }];
  const f = sampleFrames(150, scenes);
  assert.ok(f.includes(2) && f.includes(30) && f.includes(57) && f.includes(62) && f.includes(105) && f.includes(147));
  assert.ok(sampleFrames(100000, null).length <= 36);
});

test("mix refuses missing inputs instead of silently skipping them", { skip: SKIP }, () => {
  const d = tmp();
  assert.throws(() => buildMixArgs({ voice: { scenes: [{ sceneId: "a", file: "nope.wav", durationMs: 1000 }] }, voiceDir: d, sound: { events: [] }, fps: FPS, totalFrames: TOTAL, outFile: path.join(d, "o.wav") }), /mix input missing/);
});

// ---------- real ffmpeg round trip ----------
test("chunks -> assemble -> mix -> mux -> QA works end to end on synthetic media", { skip: SKIP, timeout: 120000 }, () => {
  const d = tmp();
  const chunks = makeChunks(d);
  for (const c of chunks) writeChunkMeta(d, c);

  // audio: two narration scenes (4 s), one sfx hit at frame 60, a quiet music bed
  tone(path.join(d, "s1.wav"), 440, 2);
  tone(path.join(d, "s2.wav"), 330, 2);
  tone(path.join(d, "hit.wav"), 880, 0.15, 0.5);
  tone(path.join(d, "bed.wav"), 110, 6, 0.4);
  const voice = { scenes: [{ sceneId: "s1", file: "s1.wav", durationMs: 2000 }, { sceneId: "s2", file: "s2.wav", durationMs: 2000 }] };
  const sound = { musicBedDb: -24, events: [{ frame: 60, sfx: "hit", pool: "hit", gainDb: -12 }], ducking: { depthDb: 8, rampSec: 0.3 } };
  const mix = path.join(d, "mix.wav");
  runMix({ voice, voiceDir: d, sound, sfxDir: d, musicFile: path.join(d, "bed.wav"), fps: FPS, totalFrames: TOTAL, outFile: mix, targetLufs: -16, truePeakDbfs: -1.5 });
  const mi = probe(mix);
  assert.ok(Math.abs(Number(mi.format.duration) - 5) < 0.01, `mix duration ${mi.format.duration}`);

  const rep = assemble({ chunkDir: d, job: { startFrame: 0, endFrame: TOTAL - 1, chunkFrames: 60 }, video: { width: W, height: H, fps: FPS }, outDir: path.join(d, "out"), audioFile: mix });
  assert.equal(rep.pass, true);
  assert.deepEqual(rep.steps.map((s) => s.name), ["coverage", "chunks", "assembled_video", "audio_mux"]);

  const qa = qaVideo({ file: rep.file, fps: FPS, frames: TOTAL, width: W, height: H, outDir: path.join(d, "qa"), scenes: [{ startFrame: 0, endFrame: 60 }, { startFrame: 60, endFrame: 150 }], thresholds: { lufsTarget: -16, lufsTol: 2.5 } });
  const failed = qa.technical.filter((c) => c.status === "fail");
  assert.deepEqual(failed, [], JSON.stringify(failed));
  assert.equal(qa.verdict, "needs_human", "automation alone must never certify a video as passed");
  assert.ok(qa.frameReview.length >= 6 && qa.frameReview.every((f) => f.status === "pass"));
  assert.ok(qa.contactSheet && fs.existsSync(qa.contactSheet));
  assert.ok(qa.needsHuman.some((n) => n.kind === "visual_design_review"));
  assert.equal(qaVideo({ file: rep.file, fps: FPS, frames: TOTAL, width: W, height: H, outDir: path.join(d, "qa2"), humanReviewed: true, thresholds: { lufsTol: 2.5 } }).verdict, "pass");
});

test("assemble rejects a corrupted chunk, a missing chunk and a chunk whose frame range is wrong", { skip: SKIP, timeout: 120000 }, () => {
  const d = tmp();
  const chunks = makeChunks(d);
  for (const c of chunks) writeChunkMeta(d, c);
  const run = (dir) => assemble({ chunkDir: dir, job: { startFrame: 0, endFrame: TOTAL - 1, chunkFrames: 60 }, video: { width: W, height: H, fps: FPS }, outDir: path.join(dir, "o") });

  // missing chunk
  const d1 = tmp();
  for (const f of fs.readdirSync(d)) if (!f.startsWith("chunk_1.") && f.startsWith("chunk_")) fs.copyFileSync(path.join(d, f), path.join(d1, f));
  assert.throws(() => run(d1), /not contiguous|coverage/);

  // corrupted bytes
  const d2 = tmp();
  for (const f of fs.readdirSync(d)) if (f.startsWith("chunk_")) fs.copyFileSync(path.join(d, f), path.join(d2, f));
  const victim = path.join(d2, "chunk_1.mp4");
  const buf = fs.readFileSync(victim);
  buf[Math.floor(buf.length / 2)] ^= 0xff;
  fs.writeFileSync(victim, buf);
  assert.throws(() => run(d2), /SHA-256 mismatch/);

  // metadata says frames 60-119 but the file really holds a different number (hash is honest, ffprobe is not)
  const d3 = tmp();
  for (const f of fs.readdirSync(d)) if (f.startsWith("chunk_")) fs.copyFileSync(path.join(d, f), path.join(d3, f));
  ff(["-i", path.join(d, "chunk_1.mp4"), "-frames:v", "40", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(d3, "chunk_1.mp4")]);
  const meta = JSON.parse(fs.readFileSync(path.join(d3, "chunk_1.meta.json"), "utf8"));
  meta.sha256 = sha256File(path.join(d3, "chunk_1.mp4"));
  fs.writeFileSync(path.join(d3, "chunk_1.meta.json"), JSON.stringify(meta));
  assert.throws(() => run(d3), /chunk 1: .*frame_count/);
});

test("QA fails a video with a long black section and flags a flat frame", { skip: SKIP, timeout: 60000 }, () => {
  const d = tmp();
  const f = path.join(d, "black.mp4");
  ff(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${FPS}`, "-f", "lavfi", "-i", "sine=f=300:r=48000", "-frames:v", String(TOTAL), "-t", "5", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-ar", "48000", f]);
  const qa = qaVideo({ file: f, fps: FPS, frames: TOTAL, width: W, height: H, outDir: path.join(d, "qa"), thresholds: { lufsTol: 30 } });
  assert.equal(qa.verdict, "fail");
  assert.ok(qa.technical.find((c) => c.name === "no_black_frames" && c.status === "fail"));
  assert.ok(qa.frameReview.some((x) => x.status === "fail" && /flat\/blank/.test(x.issue)));
});

test("QA reports a wrong frame count rather than trusting the file exists", { skip: SKIP, timeout: 60000 }, () => {
  const d = tmp();
  const f = path.join(d, "short.mp4");
  ff(["-f", "lavfi", "-i", `testsrc2=size=${W}x${H}:rate=${FPS}`, "-f", "lavfi", "-i", "sine=f=300:r=48000", "-frames:v", "90", "-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-ar", "48000", f]);
  const qa = qaVideo({ file: f, fps: FPS, frames: TOTAL, width: W, height: H, outDir: path.join(d, "qa"), thresholds: { lufsTol: 30 } });
  assert.equal(qa.verdict, "fail");
  assert.ok(qa.technical.find((c) => c.name === "frame_count" && c.status === "fail"));
});
