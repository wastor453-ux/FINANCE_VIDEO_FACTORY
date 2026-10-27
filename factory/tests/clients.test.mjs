import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "../lib/youtube.mjs";
import { searchVoices } from "../lib/voices.mjs";
import { onlineChecks, liveChecks } from "../lib/doctor.mjs";
import { runMix } from "../lib/mix.mjs";
import { probe } from "../lib/media.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const F = path.join(here, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(F, "config/pipeline.json"), "utf8"));
const voiceCfg = JSON.parse(fs.readFileSync(path.join(F, "config/voice.json"), "utf8"));
const KEY = "AIzaSyFAKEKEYFORTESTS000000000000000";
const ok = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj), json: async () => obj });
const resp = (status, body = "{}") => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body) });
const noSleep = async () => {};

test("YouTube header mode sends the key in a header and never in the URL", async () => {
  const seen = [];
  const c = createClient({ apiKey: KEY, fetchImpl: async (u, o) => { seen.push({ url: String(u), headers: o.headers }); return ok({ items: [{ id: "UC1", snippet: { title: "T" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] }); } });
  await c.resolveChannel("@x");
  assert.equal(seen[0].headers["x-goog-api-key"], KEY);
  assert.ok(!seen[0].url.includes(KEY));
});

test("YouTube query mode sends ?key= and no key header; errors never contain the key", async () => {
  const seen = [];
  const c = createClient({ apiKey: KEY, authMode: "query", retries: 0, fetchImpl: async (u, o) => { seen.push({ url: String(u), headers: o.headers }); return resp(403, `{"error":"bad key ${KEY}"}`); } });
  await assert.rejects(c.resolveChannel("@x"), (e) => { assert.ok(!e.message.includes(KEY)); assert.match(e.message, /HTTP 403/); return true; });
  assert.ok(seen[0].url.includes(`key=${KEY}`));
  assert.equal(seen[0].headers["x-goog-api-key"], undefined);
  assert.throws(() => createClient({ apiKey: KEY, authMode: "cookie" }), /authMode/);
});

test("YouTube retries timeouts and 5xx, but never retries a 4xx", async () => {
  let n = 0;
  const flaky = createClient({ apiKey: KEY, sleep: noSleep, fetchImpl: async () => { n++; if (n === 1) throw Object.assign(new Error("The operation was aborted due to timeout"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }); if (n === 2) return resp(503); return ok({ items: [{ id: "UC1", snippet: { title: "T" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] }); } });
  assert.equal((await flaky.resolveChannel("@x")).channelId, "UC1");
  assert.equal(n, 3);
  let m = 0;
  const bad = createClient({ apiKey: KEY, sleep: noSleep, fetchImpl: async () => { m++; return resp(400, "{}"); } });
  await assert.rejects(bad.resolveChannel("@x"), /HTTP 400/);
  assert.equal(m, 1);
  const dead = createClient({ apiKey: KEY, sleep: noSleep, retries: 1, fetchImpl: async () => { throw new Error(`boom ${KEY}`); } });
  await assert.rejects(dead.resolveChannel("@x"), (e) => { assert.ok(!e.message.includes(KEY)); assert.match(e.message, /after 2 attempts/); return true; });
});

test("doctor: a single network timeout is retried; a persistent one is FAILED with the real reason", async () => {
  const calls = {};
  const rows = await onlineChecks(async (u) => { const h = new URL(u).host; calls[h] = (calls[h] || 0) + 1; if (h === "www.youtube.com" && calls[h] === 1) throw new Error("timeout"); if (h === "github.com") throw Object.assign(new Error("x"), { cause: { code: "ETIMEDOUT" } }); return { status: 200 }; });
  assert.equal(rows.find((r) => r.name === "www.youtube.com").status, "VERIFIED");
  assert.match(rows.find((r) => r.name === "www.youtube.com").detail, /2nd attempt/);
  const gh = rows.find((r) => r.name === "github.com");
  assert.equal(gh.status, "FAILED");
  assert.match(gh.detail, /ETIMEDOUT/);
});

test("doctor live: unlisted voice is UNVERIFIED (not FAILED); model check and youtube auth mode are reported", async () => {
  const env = { YOUTUBE_API_KEY: "yt-key", GEMINI_API_KEY: "gm-key", YOUTUBE_AUTH_MODE: "query" };
  const urls = [];
  const rows = await liveChecks(cfg, voiceCfg, env, async (u) => {
    const s = String(u); urls.push(s);
    if (s.includes("/youtube/")) return ok({ items: [{ id: "UC" }] });
    if (s.includes("/models")) return ok({ models: [{ name: `models/${voiceCfg.model.id}` }] });
    return ok({ voices: [{ name: "voices/Kore" }] });
  });
  assert.ok(urls.find((u) => u.includes("/youtube/")).includes("key=yt-key"));
  assert.equal(rows.find((r) => r.name === "youtube_data_api").status, "VERIFIED");
  assert.match(rows.find((r) => r.name === "youtube_data_api").detail, /via query auth/);
  assert.equal(rows.find((r) => r.name === "tts_model_id").status, "VERIFIED");
  assert.match(rows.find((r) => r.name === "tts_model_alternatives").detail, /gemini-3\.1-flash-tts-preview: NOT listed/);
  const v = rows.find((r) => r.name === "tts_voice");
  assert.equal(v.status, "UNVERIFIED");
  assert.match(v.detail, /ffx voices --search Koda/);
});

test("voice search builds the filtered request, hides the key and returns raw matches", async () => {
  let seen;
  const r = await searchVoices({ apiKey: KEY, search: "Koda", type: "prompted", fetchImpl: async (u, o) => { seen = { u: new URL(u), h: o.headers }; return ok({ voices: [{ name: "voices/abc", displayName: "Koda" }] }); } });
  assert.equal(seen.u.searchParams.get("search"), "Koda");
  assert.equal(seen.u.searchParams.get("type"), "prompted");
  assert.ok(!String(seen.u).includes(KEY));
  assert.equal(r.count, 1);
  await assert.rejects(searchVoices({ apiKey: KEY, search: "x", fetchImpl: async () => resp(401, `denied ${KEY}`) }), (e) => { assert.ok(!e.message.includes(KEY)); return true; });
});

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0;
const SKIP = !HAVE_FFMPEG && !process.env.FFX_REQUIRE_FFMPEG;
test("mix can be written as AAC .m4a (fits GitHub's file limit) with the exact duration", { skip: SKIP, timeout: 60000 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-m4a-"));
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=2:r=48000", path.join(d, "v.wav")]);
  const out = path.join(d, "mix.m4a");
  runMix({ voice: { scenes: [{ sceneId: "a", file: "v.wav", durationMs: 2000 }] }, voiceDir: d, sound: { events: [] }, fps: 30, totalFrames: 90, outFile: out });
  const info = probe(out);
  assert.equal(info.streams[0].codec_name, "aac");
  assert.ok(Math.abs(Number(info.format.duration) - 3) < 0.06, info.format.duration);
});
