// `ffx doctor`: an honest capability audit. Every line is VERIFIED (we executed a check),
// FAILED (we executed it and it failed) or UNVERIFIED (we could not or did not test it).
// Secret VALUES are never printed, logged or written; only whether a variable is set.
import { execFileSync } from "node:child_process";

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }).toString().trim().split("\n")[0];
  } catch {
    return null;
  }
};

export function localChecks(cfg, env = process.env) {
  const rows = [];
  const add = (area, name, status, detail) => rows.push({ area, name, status, detail });

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add("runtime", "node", nodeMajor >= 20 ? "VERIFIED" : "FAILED", `v${process.versions.node} (need >= 20)`);
  for (const [name, cmd, args] of [
    ["ffmpeg", "ffmpeg", ["-version"]],
    ["ffprobe", "ffprobe", ["-version"]],
    ["python3", "python3", ["--version"]],
    ["git", "git", ["--version"]],
    ["gh", "gh", ["--version"]],
  ]) {
    const out = run(cmd, args);
    add("runtime", name, out ? "VERIFIED" : name === "gh" ? "UNVERIFIED" : "FAILED", out || "not found on PATH");
  }

  const s = cfg.secrets;
  for (const [label, key] of [["youtube_api_key", s.youtubeApiKeyEnv], ["gemini_api_key", s.geminiApiKeyEnv], ["github_token", s.githubTokenEnv]]) {
    add("secrets", label, env[key] ? "VERIFIED" : "UNVERIFIED", env[key] ? `env ${key} is set (value not shown; validity untested)` : `env ${key} not set (Muse may inject it from Secure Vault at run time)`);
  }
  return rows;
}

const HOSTS = ["www.youtube.com", "www.googleapis.com", "generativelanguage.googleapis.com", "github.com", "registry.npmjs.org"];

export async function onlineChecks(fetchImpl = globalThis.fetch) {
  const rows = [];
  for (const h of HOSTS) {
    let last;
    for (let attempt = 1; attempt <= 2; attempt++) { // one retry: a single timeout is not proof of a blocked host
      try {
        const r = await fetchImpl(`https://${h}/`, { method: "HEAD", signal: AbortSignal.timeout(15000) });
        rows.push({ area: "network", name: h, status: "VERIFIED", detail: `reachable, HTTP ${r.status}${attempt > 1 ? " (2nd attempt)" : ""}` });
        last = null;
        break;
      } catch (e) {
        last = e;
      }
    }
    if (last) rows.push({ area: "network", name: h, status: "FAILED", detail: `unreachable after 2 attempts: ${last.cause?.code || last.message}` });
  }
  return rows;
}

/** Authenticated probes: cost 1 YouTube quota unit and two read-only Gemini list calls. */
export async function liveChecks(cfg, voiceCfg, env = process.env, fetchImpl = globalThis.fetch) {
  const rows = [];
  const add = (name, status, detail) => rows.push({ area: "live_api", name, status, detail });
  const yt = env[cfg.secrets.youtubeApiKeyEnv];
  const gm = env[cfg.secrets.geminiApiKeyEnv];

  if (!yt) add("youtube_data_api", "UNVERIFIED", "no key in env");
  else {
    try {
      const mode = env.YOUTUBE_AUTH_MODE || cfg.secrets.youtubeAuthMode || "header";
      const u = new URL("https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=%40MarkTilbury");
      if (mode === "query") u.searchParams.set("key", yt);
      const r = await fetchImpl(u, { headers: mode === "query" ? {} : { "x-goog-api-key": yt }, signal: AbortSignal.timeout(20000) });
      const j = await r.json().catch(() => ({}));
      add("youtube_data_api", r.ok && j.items?.length ? "VERIFIED" : "FAILED", r.ok ? `GET /youtube/v3/channels ok via ${mode} auth (${j.items?.length || 0} item)` : `HTTP ${r.status} via ${mode} auth`);
    } catch (e) {
      add("youtube_data_api", "FAILED", `${String(e.message).split(yt).join("***")} (if this is a timeout, retry with YOUTUBE_AUTH_MODE=query)`);
    }
  }

  if (!gm) add("gemini_api", "UNVERIFIED", "no key in env");
  else {
    const hdr = { headers: { "x-goog-api-key": gm }, signal: AbortSignal.timeout(20000) };
    try {
      const r = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", hdr);
      const j = await r.json().catch(() => ({}));
      const names = (j.models || []).map((m) => String(m.name).replace(/^models\//, ""));
      add("gemini_key_valid", r.ok ? "VERIFIED" : "FAILED", r.ok ? `${names.length} models listed` : `HTTP ${r.status}`);
      if (r.ok) {
        const want = voiceCfg.model.id;
        add("tts_model_id", names.includes(want) ? "VERIFIED" : "FAILED", names.includes(want) ? `${want} is listed` : `${want} NOT in model list; TTS-like models seen: ${names.filter((n) => /tts/i.test(n)).join(", ") || "none"}`);
        const alts = voiceCfg.model.alternatives || [];
        if (alts.length) add("tts_model_alternatives", "VERIFIED", alts.map((m) => `${m}: ${names.includes(m) ? "listed" : "NOT listed"}`).join("; "));
      }
    } catch (e) {
      add("gemini_key_valid", "FAILED", e.message);
    }
    try {
      const r = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/voices", hdr);
      const j = await r.json().catch(() => ({}));
      const list = j.voices || [];
      const found = list.find((v) => JSON.stringify(v).toLowerCase().includes(voiceCfg.voice.name.toLowerCase()));
      // An unfiltered, possibly paginated list cannot prove a library voice is absent, so "not found" is UNVERIFIED, not FAILED.
      add("tts_voice", r.ok ? (found ? "VERIFIED" : "UNVERIFIED") : "FAILED", r.ok ? (found ? `voice "${voiceCfg.voice.name}" found in library` : `"${voiceCfg.voice.name}" not in the first ${list.length} listed voices; run: ffx voices --search ${voiceCfg.voice.name}`) : `HTTP ${r.status} (voices endpoint may differ; check docs)`);
    } catch (e) {
      add("tts_voice", "FAILED", e.message);
    }
  }
  return rows;
}

export function summarize(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { verified: count("VERIFIED"), failed: count("FAILED"), unverified: count("UNVERIFIED") };
}
