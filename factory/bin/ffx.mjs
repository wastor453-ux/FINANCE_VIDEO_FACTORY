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
import { generateTheme, validateTheme, seedFromString, seedWithLedger } from "../lib/theme.mjs";
import { loadStylePack } from "../lib/style.mjs";
import { lintPlanV2 } from "../lib/plan-v2.mjs";
import { makeRunId, newRunState, setStage, approveGate, revokeGate, isComplete, markArchived, isExpired } from "../lib/run.mjs";
import { parseVtt, parseSrt, validateTranscript } from "../lib/transcript.mjs";
import { scoreScript } from "../lib/script-quality.mjs";
import { fitScore, itemsFrom } from "../lib/fit.mjs";

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
  lint-plan <scene_plan.json> [--voice voice_manifest.json] [--script script.json] [--style dir] [--renderable]   schema + cross-checks (v1 and v2 plans; v2 = scenes > beats > typed events)
  lint-script <script.json>         schema + claim/source rules
  fit-score <script.json|analysis.json>   topic-fit: share of runtime shown by real charts/diagrams (exit 1 below the bar)
  hook-record <script.json>          append the script's hookType to state/hook_history.json (run when G2 is approved)
  script-score <script.json> [--min 85] [--legacy]   AI-tell / spoken-English / promise / freshness quality gate (exit 1 below --min or on any P0)
  plan-chunks --start N --end N [--size N]     print the chunk matrix as JSON
  verify-media <file> --frames N [--audio] [--width W --height H --fps F]
  audio-segment --start N --end N [--fps F]    exact ffmpeg -ss/-t values for a frame range
  voices --search NAME [--type T]   search the Gemini voice library (read-only; prints raw matches for a human to confirm)
  check-job <job.json> [--root D]   preflight a render job: schema, approval, safe paths, input hashes, chunk plan (never renders)
  chunk-meta --dir D --id N --start N --end N  write the hash sidecar for a rendered chunk (used by the render workflow)
  assemble --chunks D --job job.json --out D [--audio mix.wav]   verify chunks (hash + ffprobe + coverage), concat, mux audio
  mix-audio --voice voice_manifest.json --voice-dir D --sound sound_plan.json --sfx-dir D --frames N --out mix.wav [--music file]
  qa-video <file> --frames N --out-dir D [--plan scene_plan.json] [--no-audio] [--human-reviewed]   QA on the real master + contact sheet
  run-init --channel @handle --video videoId [--title T] [--now ISO]   create one isolated run folder for a video (runs/<runId>/), with run_state.json
  run-set-stage <runDir> <stage> <status> [--note T]   record a stage's status in that run's run_state.json (PENDING/IN_PROGRESS/VERIFIED/FAILED/UNVERIFIED/NEEDS_HUMAN)
  theme --seed-string "topic|episode" [--recent recent_seeds.json] [--out theme.json]   generate a validated OPTIONAL generated theme family (the channel look comes from a style pack: style-check)
  style-check <styleDir>   validate a style pack (colours with provenance, contrast gates, assets, motion curves)
  run-approve <runDir> <gate> --by NAME [--note T]   record a gate approval (G1..G5) in that run's run_state.json
  run-revoke <runDir> <gate> --by NAME --reason T    undo a gate approval recorded on the wrong gate (reason is kept in the note)
  voice-approve <runDir> --by NAME [--note T]        approve the VOICEOVER (sets voice_manifest.approved; this is not a gate)
  run-status <runDir>   print a run's current stage/gate status
  run-archive <runDir> [--archive-root D] [--force]   move a run folder to the archive once every gate is approved (refuses otherwise unless --force)
  run-cleanup [--archive-root D] [--days N] [--dry-run]   delete archived run folders past the retention window; --dry-run only lists them
  transcript --video-id ID --title T --duration-sec N --source SRC --language L [--vtt F | --srt F | --manual F] --out transcript.json
    parse (vtt/srt) or wrap (manual, plain text) an already-obtained transcript, validate it (word count, duration match, title-word match), write transcript.json. Does NOT fetch captions or call any transcription API itself -- obtain the raw text first (tools/gemini_transcript.py, a hosted transcript API, or a human paste), per the ffx-transcript skill's resilient chain, then run this. Exits 1 if validation fails; never silently proceeds on a bad transcript.`;

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
      const backup = [process.env[c.secrets.youtubeApiKeyEnvBackup]].filter(Boolean);
      const client = createClient({ apiKey: key, backupKeys: backup, authMode: process.env.YOUTUBE_AUTH_MODE || c.secrets.youtubeAuthMode || "header" });
      const handles = readJson(path.join(ROOT, "config/channels.json")).channels.map((x) => x.handle);
      const res = await client.discover(handles, c.selection.perChannelFetch);
      const out = { schema_version: "1.0", fetchedAt: new Date().toISOString(), ...res };
      writeJson(flags.out || "discovery.json", out);
      console.log(`discovered ${res.videos.length} videos from ${res.channels.length}/${handles.length} channels; failures: ${res.failures.length}; quota units: ${res.quotaUnitsUsed}; key in use: ${client.keyInUse} of ${client.keyCount}`);
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
      if (plan.schema_version === "2.0") {
        const schemaErrs = validate(readJson(path.join(ROOT, "schemas/scene_plan_v2.schema.json")), plan);
        if (schemaErrs.length) { console.error(`PLAN SCHEMA PROBLEMS (${schemaErrs.length}):\n  - ${schemaErrs.join("\n  - ")}`); process.exit(1); }
        const { pack } = loadStylePack(path.resolve(flags.style || path.join(ROOT, "config/styles", plan.style.packId)));
        const res = lintPlanV2(plan, { recipes: readJson(path.join(ROOT, "config/motion_recipes.json")), modes: readJson(path.join(ROOT, "config/visual_modes.json")), pack, voice: flags.voice ? readJson(flags.voice) : null, script: flags.script ? readJson(flags.script) : null, renderable: flags.renderable ? readJson(path.join(ROOT, "config/components.json")).modes : null });
        if (res.warnings.length) console.error(`PLAN WARNINGS (${res.warnings.length}):\n  - ${res.warnings.join("\n  - ")}`);
        if (res.errors.length) { console.error(`PLAN PROBLEMS (${res.errors.length}):\n  - ${res.errors.join("\n  - ")}`); process.exit(1); }
        console.log("PLAN OK (v2)");
        break;
      }
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
    case "fit-score": {
      const doc = readJson(pos[0]);
      const modes = readJson(path.join(ROOT, "config/visual_modes.json")).modes;
      const res = fitScore(itemsFrom(doc, c.script.wpm), modes, c.fit);
      console.log(JSON.stringify(res, null, 2));
      if (!res.pass) { console.error(`TOPIC FIT: FAIL (${res.reasons.join("; ")})`); process.exit(1); }
      console.error(`TOPIC FIT: PASS (score ${res.score})`);
      break;
    }
    case "hook-record": {
      const sc = readJson(pos[0]);
      if (!sc.hookType) { console.error("script has no hookType"); process.exit(1); }
      const hp = path.join(ROOT, "..", "state", "hook_history.json");
      let h = { types: [] }; try { h = readJson(hp); } catch {}
      h.types = [...(h.types || []), sc.hookType].slice(-12);
      fs.mkdirSync(path.dirname(hp), { recursive: true }); fs.writeFileSync(hp, JSON.stringify(h, null, 2) + "\n");
      console.log(`recorded hook type ${sc.hookType}; recent: ${h.types.slice(-3).join(", ")}`);
      break;
    }
    case "script-score": {
      const sc = readJson(pos[0]);
      const creatorNames = readJson(path.join(ROOT, "config/channels.json")).channels.flatMap((x) => [x.name, x.handle.replace(/^@/, "")]);
      const histPath = path.join(ROOT, "..", "state", "hook_history.json");
      let recentHookTypes = []; try { recentHookTypes = readJson(histPath).types || []; } catch {}
      const modeIds = new Set(readJson(path.join(ROOT, "config/visual_modes.json")).modes.map((m) => m.id));
      const structure = flags.legacy ? null : c.script;
      const modeFamilies = new Map(readJson(path.join(ROOT, "config/visual_modes.json")).modes.map((m) => [m.id, m.family]));
      const voiceCfg = readJson(path.join(ROOT, "config/voice.json"));
      const allowedTags = voiceCfg.request.inlineTags;
      const registerIds = new Set(Object.keys(voiceCfg.request.registers?.byId || {}));
      const res = scoreScript(sc, { now: flags.now ? new Date(flags.now) : new Date(), creatorNames, structure, modeIds, modeFamilies, recentHookTypes, allowedTags, registerIds });
      console.log(JSON.stringify(res, null, 2));
      const min = Number(flags.min ?? c.script.passScore);
      if (res.verdict === "FAIL" || res.score < min) { console.error(`SCRIPT QUALITY: ${res.verdict} (score ${res.score}, need >= ${min} and no P0)`); process.exit(1); }
      console.error(`SCRIPT QUALITY: PASS (score ${res.score})`);
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
    case "run-init": {
      const now = flags.now || new Date().toISOString();
      const runId = makeRunId({ now, channelHandle: flags.channel, videoId: flags.video });
      const runDir = path.resolve(flags["runs-root"] || c.retention.runsDir, runId); // relative to cwd, like every other --out path in this CLI
      const statePath = path.join(runDir, "run_state.json");
      if (fs.existsSync(statePath)) throw new Error(`run already exists: ${runDir} (reuse it, don't re-init)`);
      const state = newRunState({ runId, channelHandle: flags.channel, videoId: flags.video, title: flags.title, createdAt: now });
      writeJson(statePath, state);
      console.log(JSON.stringify({ runId, runDir: path.relative(process.cwd(), runDir) }, null, 2));
      break;
    }
    case "run-set-stage": {
      const [runDir, stage, status] = pos;
      if (!runDir || !stage || !status) throw new Error("usage: ffx run-set-stage <runDir> <stage> <status> [--note T]");
      const statePath = path.join(runDir, "run_state.json");
      const next = setStage(readJson(statePath), stage, status, flags.note);
      writeJson(statePath, next);
      console.log(`${stage}: ${status}`);
      break;
    }
    case "run-approve": {
      const [runDir, gate] = pos;
      if (!runDir || !gate) throw new Error("usage: ffx run-approve <runDir> <gate> --by NAME [--note T]");
      if (!flags.by) throw new Error("--by NAME is required (who approved this gate, in the current conversation)");
      const statePath = path.join(runDir, "run_state.json");
      const next = approveGate(readJson(statePath), gate, flags.by, flags.note);
      writeJson(statePath, next);
      console.log(`${gate}: approved by ${flags.by}`);
      break;
    }
    case "theme": {
      let seed, ledger = null;
      if (flags["seed-string"]) {
        const recent = flags.recent ? readJson(flags.recent) : [];
        const r = seedWithLedger(flags["seed-string"], recent);
        seed = r.seed; ledger = { minHueUsed: r.minHueUsed, relaxed: r.relaxed };
      } else throw new Error('usage: ffx theme --seed-string "topic|episode" [--recent file] [--out theme.json]');
      const theme = generateTheme(seed);
      const problems = validateTheme(theme);
      if (problems.length) throw new Error("theme failed the gate:\n- " + problems.join("\n- "));
      if (flags.out) writeJson(flags.out, theme);
      console.log(JSON.stringify({ id: theme.id, seed, ledger, gate: "pass", out: flags.out || null }, null, 2));
      break;
    }
    case "style-check": {
      const [dir] = pos;
      if (!dir) throw new Error("usage: ffx style-check <styleDir>");
      const { pack, problems } = loadStylePack(path.resolve(dir));
      console.log(JSON.stringify({ id: pack.id, series: pack.color.series.length, backgrounds: pack.backgrounds.items.length, problems }, null, 2));
      if (problems.length) process.exit(2);
      break;
    }
    case "run-revoke": {
      const [runDir, gate] = pos;
      if (!runDir || !gate) throw new Error("usage: ffx run-revoke <runDir> <gate> --by NAME --reason T");
      const statePath = path.join(runDir, "run_state.json");
      writeJson(statePath, revokeGate(readJson(statePath), gate, flags.by, flags.reason));
      console.log(`${gate}: approval revoked`);
      break;
    }
    case "voice-approve": {
      const [runDir] = pos;
      if (!runDir || !flags.by) throw new Error("usage: ffx voice-approve <runDir> --by NAME [--note T]");
      const mp = path.join(runDir, "voice", "voice_manifest.json");
      if (!fs.existsSync(mp)) throw new Error(`no voice manifest at ${mp}`);
      const m = readJson(mp);
      writeJson(mp, { ...m, approved: true, approvedBy: flags.by, approvedAt: new Date().toISOString(), approvalNote: flags.note || null });
      console.log(`voice approved by ${flags.by} (${m.scenes?.length ?? "?"} scenes, ${m.totalMs} ms)`);
      break;
    }
    case "run-status": {
      const runDir = pos[0];
      if (!runDir) throw new Error("usage: ffx run-status <runDir>");
      const state = readJson(path.join(runDir, "run_state.json"));
      console.log(JSON.stringify(state, null, 2));
      break;
    }
    case "run-archive": {
      const runDir = pos[0];
      if (!runDir) throw new Error("usage: ffx run-archive <runDir> [--archive-root D] [--force]");
      const statePath = path.join(runDir, "run_state.json");
      const state = readJson(statePath);
      if (!isComplete(state) && !flags.force) {
        console.error(`refusing to archive: not every gate is approved yet (${Object.entries(state.gates).filter(([, g]) => !g.approved).map(([k]) => k).join(", ")}). Use --force only if you mean to archive an abandoned/skipped run.`);
        process.exit(1);
      }
      const archiveRoot = path.resolve(flags["archive-root"] || c.retention.archiveDir);
      const dest = path.join(archiveRoot, state.runId);
      if (fs.existsSync(dest)) throw new Error(`archive destination already exists: ${dest}`);
      fs.mkdirSync(archiveRoot, { recursive: true });
      fs.renameSync(path.resolve(runDir), dest);
      const archivedAt = new Date().toISOString();
      writeJson(path.join(dest, "run_state.json"), markArchived(readJson(path.join(dest, "run_state.json")), archivedAt, path.relative(process.cwd(), dest)));
      console.log(JSON.stringify({ archived: path.relative(process.cwd(), dest), archivedAt }, null, 2));
      break;
    }
    case "run-cleanup": {
      const archiveRoot = path.resolve(flags["archive-root"] || c.retention.archiveDir);
      const days = Number(flags.days ?? c.retention.retentionDays);
      const now = flags.now || new Date().toISOString();
      const entries = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];
      const deleted = [], kept = [];
      for (const e of entries) {
        const dir = path.join(archiveRoot, e.name);
        const statePath = path.join(dir, "run_state.json");
        if (!fs.existsSync(statePath)) { kept.push({ runId: e.name, reason: "no run_state.json; left alone" }); continue; }
        const state = readJson(statePath);
        if (!state.archived) { kept.push({ runId: e.name, reason: "archived field missing; left alone" }); continue; }
        if (isExpired(state.archived.at, now, days)) {
          if (!flags["dry-run"]) fs.rmSync(dir, { recursive: true, force: true });
          deleted.push({ runId: e.name, archivedAt: state.archived.at });
        } else {
          kept.push({ runId: e.name, archivedAt: state.archived.at, daysLeft: Math.ceil(days - (new Date(now) - new Date(state.archived.at)) / 86_400_000) });
        }
      }
      console.log(JSON.stringify({ dryRun: !!flags["dry-run"], retentionDays: days, deleted, kept }, null, 2));
      break;
    }
    case "transcript": {
      const { "video-id": videoId, title, source, language } = flags;
      const durationSec = Number(flags["duration-sec"]);
      if (!videoId || !title || !source || !language || !Number.isFinite(durationSec)) {
        throw new Error("usage: ffx transcript --video-id ID --title T --duration-sec N --source SRC --language L [--vtt F | --srt F | --manual F] --out transcript.json");
      }
      const validSources = ["gemini_video_understanding", "hosted_transcript_api", "manual"];
      if (!validSources.includes(source)) throw new Error(`--source must be one of: ${validSources.join(", ")}`);

      let segments;
      if (flags.vtt) segments = parseVtt(fs.readFileSync(flags.vtt, "utf8"));
      else if (flags.srt) segments = parseSrt(fs.readFileSync(flags.srt, "utf8"));
      else if (flags.manual) {
        const text = fs.readFileSync(flags.manual, "utf8").replace(/\s+/g, " ").trim();
        segments = text ? [{ startMs: 0, endMs: durationSec * 1000, text }] : [];
      } else {
        throw new Error("one of --vtt, --srt, or --manual is required (this command parses/validates an already-obtained transcript; it does not fetch one)");
      }
      if (!segments.length) throw new Error("no segments parsed from the given input -- empty or unparseable file");

      const validation = validateTranscript({ segments, videoDurationSec: durationSec, title, expectedLanguage: flags["expected-language"], actualLanguage: language });
      const out = {
        schema_version: "1.0",
        videoId,
        source,
        language,
        validated: validation.ok,
        validation,
        segments,
        storage: "private_workspace_only",
      };
      writeJson(flags.out || "transcript.json", out);
      console.log(validation.ok ? `VALID transcript: ${validation.wordCount} words, duration match ok, ${validation.titleWordsFound}/${validation.titleWordsNeeded} title words found` : `INVALID transcript:\n  - ${validation.notes.join("\n  - ")}`);
      process.exit(validation.ok ? 0 : 1);
      break;
    }
    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error(`ffx error: ${e.message}`); process.exit(1); });
export { verifyCoverage };
