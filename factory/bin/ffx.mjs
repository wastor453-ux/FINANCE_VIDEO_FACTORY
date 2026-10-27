#!/usr/bin/env node
// ffx — Finance Video Factory command line. Zero dependencies (Node >= 20).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../lib/schema.mjs";
import { createClient } from "../lib/youtube.mjs";
import { selectWinner } from "../lib/select.mjs";
import { planChunks, verifyCoverage, audioSegment } from "../lib/chunks.mjs";
import { probe, verifyProbe } from "../lib/media.mjs";
import { lintScenePlan, lintScript } from "../lib/lint.mjs";
import { runMix } from "../lib/mix.mjs";
import { assemble, writeChunkMeta } from "../lib/assemble.mjs";
import { qaVideo } from "../lib/qa.mjs";
import { checkJob } from "../lib/job.mjs";
import { searchVoices } from "../lib/voices.mjs";
import { localChecks, onlineChecks, liveChecks, summarize } from "../lib/doctor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n"); };
const cfg = () => readJson(path.join(ROOT, "config/pipeline.json"));

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith("--")) flags[k] = true; else { flags[k] = nxt; i++; }
    } else pos.push(argv[i]);
  }
  return { pos, flags };
}

const HELP = `ffx <command>
  doctor [--online] [--live]        capability audit (VERIFIED / FAILED / UNVERIFIED), never prints secrets
  validate <schema> <file>          validate an artifact against factory/schemas/<schema>.schema.json
  discover --out <file>             fetch recent uploads of all channels (needs YouTube key in env)
  select --in <discovery.json> --out <selection.json> [--seen state/seen_videos.json] [--now ISO]
  mark-seen --selection <file> --seen <file>   record ALL evaluated videos as seen (after the winner is approved)
  lint-plan <scene_plan.json> [--voice voice_manifest.json]   schema + cross-checks (modes, gaps, sources, sync)
  lint-script <script.json>         schema + claim/source rules
  plan-chunks --start N --end N [--size N]     print the chunk matrix as JSON
  verify-media <file> --frames N [--audio] [--width W --height H --fps F]
  audio-segment --start N --end N [--fps F]    exact ffmpeg -ss/-t values for a frame range
  voices --search NAME [--type T]   search the Gemini voice library (read-only; prints raw matches for a human to confirm)
  check-job <job.json> [--root D]   preflight a render job: schema, approval, safe paths, input hashes, chunk plan (never renders)
  chunk-meta --dir D --id N --start N --end N  write the hash sidecar for a rendered chunk (used by the render workflow)
  assemble --chunks D --job job.json --out D [--audio mix.wav]   verify chunks (hash + ffprobe + coverage), concat, mux audio
  mix-audio --voice voice_manifest.json --voice-dir D --sound sound_plan.json --sfx-dir D --frames N --out mix.wav [--music file]
  qa-video <file> --frames N --out-dir D [--plan scene_plan.json] [--no-audio] [--human-reviewed]   QA on the real master + contact sheet`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  const c = cfg();

  switch (cmd) {
    case "doctor": {
      const voice = readJson(path.join(ROOT, "config/voice.json"));
      let rows = localChecks(c);
      if (flags.online || flags.live) rows = rows.concat(await onlineChecks());
      if (flags.live) rows = rows.concat(await liveChecks(c, voice));
      console.log(JSON.stringify({ at: new Date().toISOString(), summary: summarize(rows), rows }, null, 2));
      process.exit(rows.some((r) => r.status === "FAILED") ? 1 : 0);
      break;
    }
    case "validate": {
      const [name, file] = pos;
      if (!name || !file) throw new Error("usage: ffx validate <schema> <file>");
      const schema = readJson(path.join(ROOT, "schemas", `${name}.schema.json`));
      const errors = validate(schema, readJson(file));
      if (errors.length) { console.error(`INVALID (${errors.length}):\n  - ${errors.join("\n  - ")}`); process.exit(1); }
      console.log(`VALID ${name}: ${file}`);
      break;
    }
    case "discover": {
      const key = process.env[c.secrets.youtubeApiKeyEnv];
      const client = createClient({ apiKey: key, authMode: process.env.YOUTUBE_AUTH_MODE || c.secrets.youtubeAuthMode || "header" });
      const handles = readJson(path.join(ROOT, "config/channels.json")).channels.map((x) => x.handle);
      const res = await client.discover(handles, c.selection.perChannelFetch);
      const out = { schema_version: "1.0", fetchedAt: new Date().toISOString(), ...res };
      writeJson(flags.out || "discovery.json", out);
      console.log(`discovered ${res.videos.length} videos from ${res.channels.length}/${handles.length} channels; failures: ${res.failures.length}; quota units: ${res.quotaUnitsUsed}`);
      process.exit(res.failures.length ? 2 : 0); // non-zero: partial discovery must be seen by a human
      break;
    }
    case "select": {
      const disc = readJson(flags.in);
      const seenFile = flags.seen;
      const seen = new Set(seenFile && fs.existsSync(seenFile) ? readJson(seenFile).videoIds : []);
      const now = flags.now || new Date().toISOString();
      const result = selectWinner(disc.videos, c.selection, now, seen);
      const out = { schema_version: "1.0", selectedAt: now, discoveryFailures: disc.failures || [], config: c.selection, ...result };
      writeJson(flags.out || "selection.json", out);
      console.log(result.winner ? `winner: ${result.winner.channelTitle} — ${result.winner.title} (score ${result.winner.score})` : "NO ELIGIBLE WINNER");
      process.exit(result.winner ? 0 : 3);
      break;
    }
    case "mark-seen": {
      const sel = readJson(flags.selection);
      const seenFile = flags.seen;
      const prev = fs.existsSync(seenFile) ? readJson(seenFile).videoIds : [];
      const all = [...new Set([...prev, ...sel.evaluated.map((e) => e.videoId)])].sort();
      writeJson(seenFile, { schema_version: "1.0", updatedAt: new Date().toISOString(), videoIds: all });
      console.log(`seen set now has ${all.length} videos`);
      break;
    }
    case "lint-plan": {
      const plan = readJson(pos[0]);
      const errs = validate(readJson(path.join(ROOT, "schemas/scene_plan.schema.json")), plan);
      const voice = flags.voice ? readJson(flags.voice) : null;
      const probs = errs.length ? errs : lintScenePlan(plan, readJson(path.join(ROOT, "config/visual_modes.json")), voice, c.video.fps);
      if (probs.length) { console.error(`PLAN PROBLEMS (${probs.length}):\n  - ${probs.join("\n  - ")}`); process.exit(1); }
      console.log("PLAN OK");
      break;
    }
    case "lint-script": {
      const sc = readJson(pos[0]);
      const errs = validate(readJson(path.join(ROOT, "schemas/script.schema.json")), sc);
      const probs = errs.length ? errs : lintScript(sc);
      if (probs.length) { console.error(`SCRIPT PROBLEMS (${probs.length}):\n  - ${probs.join("\n  - ")}`); process.exit(1); }
      console.log("SCRIPT OK");
      break;
    }
    case "plan-chunks": {
      const size = Number(flags.size ?? c.render.chunkFrames);
      console.log(JSON.stringify({ chunk: planChunks(Number(flags.start), Number(flags.end), size) }));
      break;
    }
    case "verify-media": {
      const file = pos[0];
      const exp = { width: Number(flags.width ?? c.video.width), height: Number(flags.height ?? c.video.height), fps: Number(flags.fps ?? c.video.fps), frames: Number(flags.frames), audio: !!flags.audio, audioSampleRate: flags["sample-rate"] ? Number(flags["sample-rate"]) : undefined };
      if (!Number.isFinite(exp.frames)) throw new Error("--frames is required");
      const res = verifyProbe(probe(file), exp);
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.pass ? 0 : 1);
      break;
    }
    case "audio-segment": {
      console.log(JSON.stringify(audioSegment(Number(flags.start), Number(flags.end), Number(flags.fps ?? c.video.fps))));
      break;
    }
    case "voices": {
      const key = process.env[c.secrets.geminiApiKeyEnv];
      const res = await searchVoices({ apiKey: key, search: flags.search, type: flags.type });
      console.log(JSON.stringify(res, null, 2));
      break;
    }
    case "check-job": {
      const job = readJson(pos[0]);
      const res = checkJob(job, { schema: readJson(path.join(ROOT, "schemas/render_job.schema.json")), root: path.resolve(flags.root ?? "."), pipeline: c });
      console.log(JSON.stringify({ ...res, composition: job.composition, jobId: job.jobId, commit: job.commit, propsFile: job.propsFile ?? null, audioFile: job.audioFile ?? null, planFile: job.planFile ?? null }, null, 2));
      process.exit(res.ok ? 0 : 1);
      break;
    }
    case "chunk-meta": {
      const m = writeChunkMeta(flags.dir, { chunk_id: Number(flags.id), start: Number(flags.start), end: Number(flags.end) });
      console.log(JSON.stringify(m));
      break;
    }
    case "assemble": {
      const job = readJson(flags.job);
      const rep = assemble({ chunkDir: flags.chunks, job: { startFrame: job.startFrame, endFrame: job.endFrame, chunkFrames: job.chunkFrames }, video: { width: Number(job.width ?? c.video.width), height: Number(job.height ?? c.video.height), fps: Number(job.fps ?? c.video.fps) }, outDir: flags.out, audioFile: flags.audio });
      console.log(JSON.stringify(rep, null, 2));
      break;
    }
    case "mix-audio": {
      const built = runMix({ voice: readJson(flags.voice), voiceDir: flags["voice-dir"], sound: flags.sound ? readJson(flags.sound) : { events: [], musicBedDb: -24, ducking: { depthDb: 8, rampSec: 0.4 } }, sfxDir: flags["sfx-dir"], musicFile: flags.music, fps: Number(flags.fps ?? c.video.fps), totalFrames: Number(flags.frames), outFile: flags.out, targetLufs: c.audio.targetLufs, truePeakDbfs: c.audio.truePeakDbfs });
      console.log(JSON.stringify({ out: flags.out, durationSec: built.durationSec, inputs: built.inputs.length }));
      break;
    }
    case "qa-video": {
      const plan = flags.plan ? readJson(flags.plan) : null;
      const rep = qaVideo({ file: pos[0], frames: Number(flags.frames), fps: Number(flags.fps ?? c.video.fps), width: Number(flags.width ?? c.video.width), height: Number(flags.height ?? c.video.height), outDir: flags["out-dir"], scenes: plan?.scenes, audio: !flags["no-audio"], humanReviewed: !!flags["human-reviewed"], thresholds: { lufsTarget: c.audio.targetLufs, truePeakMax: c.audio.truePeakDbfs + 0.5 } });
      const problems = validate(readJson(path.join(ROOT, "schemas/qa_report.schema.json")), rep);
      if (problems.length) throw new Error("qa_report failed its own schema: " + problems.join("; "));
      console.log(JSON.stringify({ verdict: rep.verdict, failed: rep.unresolved.length, needsHuman: rep.needsHuman.length, report: path.join(flags["out-dir"], "qa_report.json"), contactSheet: rep.contactSheet }, null, 2));
      process.exit(rep.verdict === "fail" ? 1 : 0);
      break;
    }
    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error(`ffx error: ${e.message}`); process.exit(1); });
export { verifyCoverage };
