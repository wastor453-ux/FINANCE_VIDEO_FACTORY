// Media verification. verifyProbe() is pure (takes ffprobe JSON) so it is unit-testable
// without ffmpeg; probe() shells out to ffprobe for real files.
import { execFileSync } from "node:child_process";

/** "30000/1001" | "30/1" | "29.97" -> number */
export function parseRate(r) {
  if (typeof r === "number") return r;
  const [n, d] = String(r).split("/").map(Number);
  if (!Number.isFinite(n) || (d !== undefined && (!Number.isFinite(d) || d === 0))) return NaN;
  return d === undefined ? n : n / d;
}

export function probe(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.toString());
}

/**
 * @param info ffprobe JSON (needs -count_frames so nb_read_frames exists)
 * @param exp  { width, height, fps, frames, audio: boolean, audioSampleRate?, durationTolFrames? }
 * @returns {{pass:boolean, checks:Array<{name,status,detail}>}}
 */
export function verifyProbe(info, exp) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, status: ok ? "pass" : "fail", detail });
  const streams = info.streams || [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");

  add("video_stream_present", !!v, v ? v.codec_name : "no video stream");
  if (v) {
    add("resolution", v.width === exp.width && v.height === exp.height, `${v.width}x${v.height} (expected ${exp.width}x${exp.height})`);
    const fps = parseRate(v.r_frame_rate);
    add("fps", Math.abs(fps - exp.fps) < 1e-6, `${v.r_frame_rate} (expected ${exp.fps})`);
    const frames = Number(v.nb_read_frames ?? v.nb_frames);
    add("frame_count", frames === exp.frames, `${frames} (expected ${exp.frames})`);
    const tol = (exp.durationTolFrames ?? 1) / exp.fps;
    const wantDur = exp.frames / exp.fps;
    const gotDur = Number(info.format?.duration);
    add("duration_matches_frames", Number.isFinite(gotDur) && Math.abs(gotDur - wantDur) <= tol + 1e-3, `${gotDur}s (expected ${wantDur.toFixed(3)}s ±${tol.toFixed(3)}s)`);
  }
  if (exp.audio) {
    add("audio_stream_present", !!a, a ? a.codec_name : "no audio stream");
    if (a) {
      if (exp.audioSampleRate) add("audio_sample_rate", Number(a.sample_rate) === exp.audioSampleRate, `${a.sample_rate} (expected ${exp.audioSampleRate})`);
      const aDur = Number(a.duration ?? info.format?.duration);
      const vDur = exp.frames / exp.fps;
      // 2 frames of drift is the hard limit; the legacy workflow allowed 0.5 s (15 frames)
      add("audio_video_duration", Number.isFinite(aDur) && Math.abs(aDur - vDur) <= 2 / exp.fps + 1e-3, `audio ${aDur}s vs video ${vDur.toFixed(3)}s`);
    }
  } else {
    add("no_unexpected_audio", !a, a ? "audio stream present but not expected" : "ok");
  }
  return { pass: checks.every((c) => c.status === "pass"), checks };
}
