// NOTE: write the mix as .m4a (AAC 256k) for jobs: a 10-minute 24-bit WAV is ~170 MB, over GitHub's 100 MB file limit.
// Final audio mix: narration (per-scene files placed on an exact timeline) + sound-design events
// + ducked music bed -> ONE loudness-normalised master WAV. Doing this before dispatch means the
// GitHub render only has to mux a finished, already-checked audio file (no amix surprises in CI).
//
// Every time is derived from integer frames/samples; nothing is truncated to milliseconds.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const SAMPLE_RATE = 48000;

/** frame -> sample offset at 48 kHz, rounded to nearest. */
export function frameToSamples(frame, fps, rate = SAMPLE_RATE) {
  return Math.round((frame * rate) / fps);
}

/** Start sample of each narration scene. Uses startMs when present, else back-to-back. */
export function voiceTimeline(voiceManifest, rate = SAMPLE_RATE) {
  let cursorMs = 0;
  return voiceManifest.scenes.map((s) => {
    const startMs = Number.isFinite(s.startMs) ? s.startMs : cursorMs;
    cursorMs = startMs + s.durationMs;
    return { sceneId: s.sceneId, file: s.file, startSamples: Math.round((startMs * rate) / 1000), endMs: cursorMs };
  });
}

/**
 * Build the ffmpeg argument list. Pure function: returns { args, inputs, durationSec }.
 * @param o.voice        voice_manifest (files resolved against o.voiceDir)
 * @param o.sound        sound_plan (events resolved against o.sfxDir; files "<sfx>.wav" unless it has an extension)
 * @param o.musicFile    optional music bed file
 * @param o.totalFrames  video length in frames (fixes the exact output duration)
 */
export function buildMixArgs(o) {
  const { voice, sound, fps, totalFrames, voiceDir, sfxDir, musicFile, outFile, targetLufs = -16, truePeakDbfs = -1.5 } = o;
  if (!voice?.scenes?.length) throw new Error("voice manifest has no scenes");
  const durationSec = (totalFrames / fps).toFixed(6);
  const inputs = [];
  const chains = [];
  const addInput = (file) => {
    if (!fs.existsSync(file)) throw new Error(`mix input missing: ${file}`);
    inputs.push(file);
    return inputs.length - 1;
  };
  const norm = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";

  // narration bus
  const tl = voiceTimeline(voice);
  const vLabels = tl.map((t, n) => {
    const i = addInput(path.resolve(voiceDir, t.file));
    chains.push(`[${i}:a]${norm},adelay=${t.startSamples}S:all=1[v${n}]`);
    return `[v${n}]`;
  });
  chains.push(vLabels.length === 1 ? `${vLabels[0]}anull[vobus]` : `${vLabels.join("")}amix=inputs=${vLabels.length}:normalize=0:duration=longest[vobus]`);

  const buses = [];
  const hasMusic = !!musicFile;
  chains.push(hasMusic ? `[vobus]asplit=2[vo_main][vo_sc]` : `[vobus]anull[vo_main]`);
  buses.push("[vo_main]");

  // sound-design bus (each event is sample-accurate and gain-staged)
  const events = [...(sound?.events || [])].sort((a, b) => a.frame - b.frame);
  if (events.length) {
    const sLabels = events.map((e, n) => {
      const f = /\.[a-z0-9]{2,4}$/i.test(e.sfx) ? e.sfx : `${e.sfx}.wav`;
      const i = addInput(path.resolve(sfxDir, f));
      chains.push(`[${i}:a]${norm},volume=${e.gainDb}dB,adelay=${frameToSamples(e.frame, fps)}S:all=1[s${n}]`);
      return `[s${n}]`;
    });
    chains.push(sLabels.length === 1 ? `${sLabels[0]}anull[sfxbus]` : `${sLabels.join("")}amix=inputs=${sLabels.length}:normalize=0:duration=longest[sfxbus]`);
    buses.push("[sfxbus]");
  }

  // music bed: loop to length, set level, duck under narration with a side-chain compressor.
  // NOTE: depthDb selects the compressor ratio (an approximation); the real depth is not guaranteed.
  if (hasMusic) {
    const m = addInput(path.resolve(musicFile));
    const ratio = Math.min(20, Math.max(2, Math.round(Math.abs(sound?.ducking?.depthDb ?? 8))));
    const release = Math.max(50, Math.round((sound?.ducking?.rampSec ?? 0.4) * 1000));
    chains.push(`[${m}:a]${norm},aloop=loop=-1:size=2147483647,atrim=0:${durationSec},asetpts=PTS-STARTPTS,volume=${sound?.musicBedDb ?? -24}dB[mus]`);
    chains.push(`[mus][vo_sc]sidechaincompress=threshold=0.02:ratio=${ratio}:attack=20:release=${release}:makeup=1[musd]`);
    buses.push("[musd]");
  }

  chains.push(
    `${buses.join("")}amix=inputs=${buses.length}:normalize=0:duration=longest,` +
      `loudnorm=I=${targetLufs}:TP=${truePeakDbfs}:LRA=11,` +
      `aresample=48000,aformat=sample_fmts=s32:channel_layouts=stereo,` +
      `apad=whole_dur=${durationSec},atrim=0:${durationSec},asetpts=PTS-STARTPTS[out]`
  );

  const args = ["-hide_banner", "-v", "error", "-y"];
  for (const f of inputs) args.push("-i", f);
  const codec = /\.m4a$/i.test(outFile) ? ["-c:a", "aac", "-b:a", "256k"] : /\.flac$/i.test(outFile) ? ["-c:a", "flac"] : ["-c:a", "pcm_s24le"];
  args.push("-filter_complex", chains.join(";"), "-map", "[out]", ...codec, "-ar", "48000", outFile);
  return { args, inputs, durationSec };
}

export function runMix(o) {
  const built = buildMixArgs(o);
  fs.mkdirSync(path.dirname(path.resolve(o.outFile)), { recursive: true });
  const r = spawnSync("ffmpeg", built.args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg mix failed: ${(r.stderr || "").trim().slice(-800)}`);
  return built;
}
