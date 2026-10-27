// Final-video QA on the ACTUAL rendered file (not re-rendered stills).
//
// What automation can honestly decide: structure, decodability, black/frozen/blank frames, silence,
// loudness and true peak. What it cannot: whether charts are right, text is legible and well placed,
// the design looks premium, or narration and visuals match. Those go to `needsHuman` with a
// contact sheet, and the verdict can never be "pass" until a human review is recorded.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { probe, verifyProbe } from "./media.mjs";

function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status, out: (r.stderr || "") + (r.stdout || "") };
}

export function parseBlack(text) {
  return [...text.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map((m) => ({ start: +m[1], end: +m[2], duration: +m[3] }));
}
export function parseFreeze(text) {
  const starts = [...text.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  const durs = [...text.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => +m[1]);
  return starts.map((s, i) => ({ start: s, duration: durs[i] ?? NaN }));
}
export function parseSilence(text) {
  const starts = [...text.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => +m[1]);
  const ends = [...text.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ end: +m[1], duration: +m[2] }));
  return starts.map((s, i) => ({ start: Math.max(0, s), duration: ends[i]?.duration ?? NaN, open: !ends[i] }));
}
export function parseLoudness(text) {
  const i = [...text.matchAll(/\bI:\s+(-?[\d.]+) LUFS/g)].pop();
  const tp = text.match(/True peak:\s*\n\s*Peak:\s+(-?[\d.]+) dBFS/);
  return { integratedLufs: i ? +i[1] : null, truePeakDbfs: tp ? +tp[1] : null };
}

/** Frames worth looking at: scene start+2, middle, end-2 (or an even spread without a plan). */
export function sampleFrames(totalFrames, scenes, maxFrames = 36) {
  const set = new Set();
  if (scenes?.length) {
    for (const s of scenes) {
      const len = s.endFrame - s.startFrame;
      for (const f of [s.startFrame + Math.min(2, len - 1), s.startFrame + Math.floor(len / 2), s.endFrame - Math.min(3, len)]) set.add(Math.max(0, Math.min(totalFrames - 1, f)));
    }
  } else {
    const n = Math.min(maxFrames, 12);
    for (let i = 0; i < n; i++) set.add(Math.min(totalFrames - 1, Math.floor(((i + 0.5) * totalFrames) / n)));
  }
  const all = [...set].sort((a, b) => a - b);
  if (all.length <= maxFrames) return all;
  return Array.from({ length: maxFrames }, (_, i) => all[Math.floor((i * all.length) / maxFrames)]);
}

/** Population std-dev of luma on a 160x90 downscale. Near 0 = a flat/blank frame. */
function lumaStats(png) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "scale=160:90", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const b = r.stdout;
  let sum = 0;
  for (const v of b) sum += v;
  const mean = sum / b.length;
  let sq = 0;
  for (const v of b) sq += (v - mean) ** 2;
  return { mean, std: Math.sqrt(sq / b.length) };
}

/**
 * @param o { file, fps, frames, width, height, outDir, scenes?, audio=true, humanReviewed=false, thresholds? }
 */
export function qaVideo(o) {
  const t = { blackMaxSec: 0.3, edgeAllowSec: 0.6, freezeHoldSec: 5, silenceReviewSec: 2.5, silenceFailSec: 6, lufsTarget: -16, lufsTol: 1.5, truePeakMax: -1.0, blankStd: 2, ...(o.thresholds || {}) };
  const technical = [];
  const needsHuman = [];
  const unresolved = [];
  const add = (name, ok, detail) => technical.push({ name, status: ok ? "pass" : "fail", detail });
  const dur = o.frames / o.fps;
  fs.mkdirSync(o.outDir, { recursive: true });

  // 1. structure (resolution, fps, frame count, A/V length)
  const v = verifyProbe(probe(o.file), { width: o.width, height: o.height, fps: o.fps, frames: o.frames, audio: o.audio !== false, audioSampleRate: o.audio !== false ? 48000 : undefined });
  for (const c of v.checks) technical.push(c);

  // 2. full decode
  const dec = ff(["-v", "error", "-i", o.file, "-f", "null", "-"]);
  add("full_decode", dec.status === 0 && !dec.out.trim(), dec.out.trim().slice(0, 200) || "decodes cleanly");

  // 3. black frames (short fades at the very start/end are allowed)
  const blk = parseBlack(ff(["-i", o.file, "-an", "-vf", "blackdetect=d=0.1:pix_th=0.10", "-f", "null", "-"]).out);
  const badBlack = blk.filter((b) => b.duration > t.blackMaxSec && !(b.start <= 0.01 && b.duration <= t.edgeAllowSec) && !(b.end >= dur - 0.05 && b.duration <= t.edgeAllowSec));
  add("no_black_frames", badBlack.length === 0, badBlack.length ? badBlack.map((b) => `${b.start.toFixed(2)}s for ${b.duration.toFixed(2)}s`).join(", ") : "none beyond edge fades");

  // 4. frozen video (a held chart is legitimate, so this is a review flag, not a failure)
  const frz = parseFreeze(ff(["-i", o.file, "-an", "-vf", `freezedetect=n=0.001:d=${t.freezeHoldSec}`, "-f", "null", "-"]).out);
  for (const z of frz) needsHuman.push({ kind: "frozen_video", at: z.start, detail: `no pixel change for ${z.duration.toFixed(1)}s from ${z.start.toFixed(1)}s — intentional hold or stuck render?` });

  // 5. audio: silence + loudness + true peak
  let audioReview;
  if (o.audio !== false) {
    const sil = parseSilence(ff(["-i", o.file, "-vn", "-af", `silencedetect=n=-50dB:d=${t.silenceReviewSec}`, "-f", "null", "-"]).out);
    const failSil = sil.filter((s) => s.duration >= t.silenceFailSec || (s.open && dur - s.start >= t.silenceFailSec));
    add("no_long_silence", failSil.length === 0, failSil.length ? failSil.map((s) => `${s.start.toFixed(1)}s`).join(", ") : `${sil.length} gap(s) over ${t.silenceReviewSec}s, none over ${t.silenceFailSec}s`);
    for (const s of sil.filter((x) => !failSil.includes(x))) needsHuman.push({ kind: "silence", at: s.start, detail: `silent for ${s.duration.toFixed(1)}s from ${s.start.toFixed(1)}s` });
    const loud = parseLoudness(ff(["-i", o.file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]).out);
    audioReview = { ...loud, silentGaps: sil.length };
    add("loudness_integrated", loud.integratedLufs !== null && Math.abs(loud.integratedLufs - t.lufsTarget) <= t.lufsTol, `${loud.integratedLufs} LUFS (target ${t.lufsTarget} ±${t.lufsTol})`);
    add("true_peak", loud.truePeakDbfs !== null && loud.truePeakDbfs <= t.truePeakMax, `${loud.truePeakDbfs} dBFS (max ${t.truePeakMax})`);
  }

  // 6. sampled frames from the real master + contact sheet
  const picks = sampleFrames(o.frames, o.scenes);
  const framesDir = path.join(o.outDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  const frameReview = [];
  picks.forEach((f, idx) => {
    const png = path.join(framesDir, `f${String(idx).padStart(3, "0")}_${f}.png`);
    const r = ff(["-v", "error", "-y", "-i", o.file, "-vf", `select=eq(n\\,${f})`, "-frames:v", "1", "-vsync", "0", png]);
    if (r.status !== 0 || !fs.existsSync(png)) {
      frameReview.push({ frame: f, status: "fail", issue: "could not extract this frame from the master" });
      return;
    }
    const s = lumaStats(png);
    if (!s) frameReview.push({ frame: f, status: "fail", issue: "extracted frame unreadable" });
    else if (s.std < t.blankStd) frameReview.push({ frame: f, status: "fail", issue: `flat/blank frame (luma std-dev ${s.std.toFixed(2)})`, file: png });
    else frameReview.push({ frame: f, status: "pass", checked: ["extractable", "non_blank"], file: png });
  });
  let contactSheet = null;
  const okPngs = frameReview.filter((x) => x.file && fs.existsSync(x.file)).map((x) => x.file);
  if (okPngs.length) {
    const cols = 4, rows = Math.ceil(okPngs.length / cols);
    contactSheet = path.join(o.outDir, "contact_sheet.png");
    const listFile = path.join(o.outDir, "sheet_inputs.txt");
    fs.writeFileSync(listFile, okPngs.map((p) => `file '${p.replace(/'/g, "'\\''")}'\nduration 1\n`).join(""));
    const r = ff(["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", `scale=480:-1,tile=${cols}x${rows}:padding=6:margin=6:color=gray`, "-frames:v", "1", contactSheet]);
    if (r.status !== 0) contactSheet = null;
  }

  needsHuman.push({ kind: "visual_design_review", detail: "Automated checks cannot judge legibility, clipping, overlap, chart values, brand consistency or narration/visual match. Review the contact sheet and scrub the video." });
  needsHuman.push({ kind: "fact_review", detail: "Confirm every on-screen number against the sources in the script's fact-check table." });
  const failed = technical.some((c) => c.status === "fail") || frameReview.some((f) => f.status === "fail");
  if (failed) unresolved.push(...technical.filter((c) => c.status === "fail").map((c) => ({ kind: "technical", check: c.name, detail: c.detail })), ...frameReview.filter((f) => f.status === "fail").map((f) => ({ kind: "frame", frame: f.frame, detail: f.issue })));
  const verdict = failed ? "fail" : o.humanReviewed ? "pass" : "needs_human";
  const report = { schema_version: "1.0", videoFile: o.file, technical, frameReview, audioReview, contactSheet, unresolved, needsHuman, verdict, generatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(o.outDir, "qa_report.json"), JSON.stringify(report, null, 2));
  return report;
}
