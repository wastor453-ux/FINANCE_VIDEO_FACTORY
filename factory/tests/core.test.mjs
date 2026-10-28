import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../lib/schema.mjs";
import { planChunks, verifyCoverage, audioSegment, framesToMicros } from "../lib/chunks.mjs";
import { verifyProbe, parseRate } from "../lib/media.mjs";
import { parseIsoDuration, createClient } from "../lib/youtube.mjs";
import { lintScenePlan, lintScript } from "../lib/lint.mjs";
import { localChecks } from "../lib/doctor.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const F = path.join(here, "..");
const rj = (p) => JSON.parse(fs.readFileSync(path.join(F, p), "utf8"));
const modeSchema = JSON.parse(fs.readFileSync(path.join(F, "config/visual_modes.json"), "utf8"));

// ---------- schema validator ----------
test("validator: types, required, enum, pattern, nested paths", () => {
  const s = { type: "object", required: ["a"], properties: { a: { type: "integer", minimum: 1 }, b: { enum: ["x", "y"] }, c: { type: "string", pattern: "^z" } } };
  assert.deepEqual(validate(s, { a: 2, b: "x", c: "zed" }), []);
  assert.match(validate(s, {}).join(), /missing required property "a"/);
  assert.match(validate(s, { a: 1.5 }).join(), /expected integer/);
  assert.match(validate(s, { a: 0 }).join(), /below minimum/);
  assert.match(validate(s, { a: 1, b: "q" }).join(), /one of/);
  assert.match(validate(s, { a: 1, c: "nope" }).join(), /\$\.c: does not match/);
});

test("validator: anyOf, $ref and additionalProperties=false", () => {
  const s = { definitions: { n: { type: "number" } }, type: "object", additionalProperties: false, properties: { v: { $ref: "#/definitions/n" } }, anyOf: [{ required: ["v"] }, { required: ["w"] }] };
  assert.deepEqual(validate(s, { v: 1 }), []);
  assert.match(validate(s, { v: "x" }).join(), /expected number/);
  assert.match(validate(s, { q: 1 }).join(), /unexpected property "q"/);
  assert.match(validate(s, {}).join(), /anyOf/);
});

// ---------- every schema and config parses ----------
test("all schemas are valid JSON with schema_version and a title", () => {
  const files = fs.readdirSync(path.join(F, "schemas")).filter((f) => f.endsWith(".schema.json"));
  assert.equal(files.length, 12); // 11 pipeline-stage artifacts + run_state (per-run lifecycle tracking)
  for (const f of files) {
    const s = rj(`schemas/${f}`);
    assert.ok(s.title, f);
    assert.ok(s.required.includes("schema_version"), f);
  }
});

test("config: 7 channels, no hard-coded brand, voice/model status reflects live confirmation", () => {
  const ch = rj("config/channels.json").channels;
  assert.equal(ch.length, 7);
  assert.ok(ch.every((c) => /^@[A-Za-z0-9_.-]+$/.test(c.handle)));
  const brand = rj("config/brand.json");
  assert.equal(brand.channelName, null);
  assert.equal(brand.thumbnail.character.aiGenerated, true);
  assert.deepEqual(brand.thumbnail.character.neverIn, ["video"]);
  const voice = rj("config/voice.json");
  assert.equal(voice.voice.status, "CONFIRMED_BY_OWNER_2026-10-27"); // owner picked sample_user by ear
  assert.equal(voice.voice.id, "en-us-koda");
  assert.equal(voice.model.id, "gemini-3.8-flash-tts");
  assert.equal(voice.model.status, "CONFIRMED_LIVE_2026-10-27"); // 3.8 id listed + used live by Muse
  assert.equal(voice.request.styleVariants.chosenVariant === undefined, true); // chosenVariant lives one level up, not inside styleVariants
  assert.equal(voice.request.chosenVariant, "user");
  assert.equal(voice.style, voice.request.styleVariants.user); // production style must match the owner's chosen variant
  const p = rj("config/pipeline.json");
  assert.ok(p.forbidden_without_explicit_approval.includes("production_render"));
  assert.ok(p.forbidden_without_explicit_approval.includes("publish_or_upload"));
  assert.equal(p.secrets.youtubeAuthMode, "query"); // header mode failed live (HTTP 400); query verified
});

// ---------- chunks (fixes the legacy truncation risk) ----------
test("planChunks covers the range exactly and rejects bad input", () => {
  const c = planChunks(0, 1499, 600);
  assert.deepEqual(c.map((x) => [x.start, x.end]), [[0, 599], [600, 1199], [1200, 1499]]);
  assert.throws(() => planChunks(10, 5, 600), /end must be/);
  assert.throws(() => planChunks(0, 10, 0), /size/);
  assert.throws(() => planChunks(0, 1.5, 10), /integer/);
});

test("verifyCoverage detects gaps, overlaps, missing chunks and short coverage", () => {
  const good = planChunks(0, 1499, 600);
  assert.equal(verifyCoverage(good, 0, 1499, 600), true);
  assert.throws(() => verifyCoverage([good[0], good[2]], 0, 1499, 600), /not contiguous/);
  assert.throws(() => verifyCoverage([good[0], { ...good[1], start: 590 }, good[2]], 0, 1499, 600), /gap\/overlap/);
  assert.throws(() => verifyCoverage(good.slice(0, 2), 0, 1499, 600), /coverage ends/);
  assert.throws(() => verifyCoverage([], 0, 10, 5), /no chunk/);
});

test("audioSegment rounds to the nearest microsecond and never truncates", () => {
  assert.equal(framesToMicros(1, 30), 33333);
  const seg = audioSegment(1, 30, 30); // frames 1..30 = exactly 1 second
  assert.equal(seg.duration, "1.000000");
  assert.equal(seg.start, "0.033333");
  assert.equal(audioSegment(0, 8999, 30).duration, "300.000000"); // exactly 5 minutes
  assert.equal(audioSegment(0, 29, 30).frames, 30);
});

// ---------- media verification ----------
const goodInfo = () => ({
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "30/1", nb_read_frames: "900" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", duration: "30.0" },
  ],
  format: { duration: "30.0" },
});
const exp = { width: 1920, height: 1080, fps: 30, frames: 900, audio: true, audioSampleRate: 48000 };

test("verifyProbe passes a correct file", () => assert.equal(verifyProbe(goodInfo(), exp).pass, true));
test("verifyProbe fails wrong resolution, fps, frame count, missing audio", () => {
  const i = goodInfo(); i.streams[0].width = 1280;
  assert.equal(verifyProbe(i, exp).pass, false);
  const j = goodInfo(); j.streams[0].r_frame_rate = "25/1";
  assert.match(JSON.stringify(verifyProbe(j, exp)), /"fps".*fail/s);
  const k = goodInfo(); k.streams[0].nb_read_frames = "899";
  assert.match(JSON.stringify(verifyProbe(k, exp).checks.find((c) => c.name === "frame_count")), /fail/);
  const m = goodInfo(); m.streams.pop();
  assert.equal(verifyProbe(m, exp).pass, false);
});
test("verifyProbe: audio drift above 2 frames fails, 0.5s legacy tolerance no longer passes", () => {
  const i = goodInfo(); i.streams[1].duration = "30.4";
  assert.equal(verifyProbe(i, exp).checks.find((c) => c.name === "audio_video_duration").status, "fail");
  const j = goodInfo(); j.streams[1].duration = "30.05";
  assert.equal(verifyProbe(j, exp).checks.find((c) => c.name === "audio_video_duration").status, "pass");
});
test("fractional frame rates parse exactly", () => {
  assert.ok(Math.abs(parseRate("30000/1001") - 29.97003) < 1e-4);
  assert.ok(Number.isNaN(parseRate("1/0")));
});

// ---------- YouTube client with a mocked fetch ----------
test("parseIsoDuration", () => {
  assert.equal(parseIsoDuration("PT12M30S"), 750);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("P1DT1S"), 86401);
  assert.ok(Number.isNaN(parseIsoDuration("garbage")));
});

function mockYouTube({ failHandle } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, search: u.search, key: opts.headers["x-goog-api-key"] });
    const json = (o, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(o) });
    // Real YouTube Data API v3 REST paths are the bare resource names (no ".list" suffix -- that's
    // the RPC method name from Google's docs, not a URL path). A mock that matched "channels.list"
    // would pass against a client bug that 404s against the real API, so this asserts the real path
    // AND that no call ever uses the RPC-style ".list" suffix.
    assert.ok(!u.pathname.endsWith(".list"), `REST path must not end in ".list": ${u.pathname}`);
    if (u.pathname.endsWith("/channels")) {
      const h = u.searchParams.get("forHandle");
      if (h === failHandle) return json({ items: [] });
      return json({ items: [{ id: `UC_${h}`, snippet: { title: h }, contentDetails: { relatedPlaylists: { uploads: `UU_${h}` } } }] });
    }
    if (u.pathname.endsWith("/playlistItems")) return json({ items: [{ contentDetails: { videoId: `v_${u.searchParams.get("playlistId")}` } }] });
    if (u.pathname.endsWith("/videos")) {
      return json({ items: u.searchParams.get("id").split(",").map((id) => ({ id, snippet: { channelId: "c", channelTitle: "T", title: "t", publishedAt: "2026-10-20T00:00:00Z", liveBroadcastContent: "none" }, contentDetails: { duration: "PT10M" }, statistics: { viewCount: "1000", commentCount: "5" } })) });
    }
    return json({ error: "x" }, 404);
  };
  return { fetchImpl, calls };
}

test("youtube discover: key only in header, 3 quota units per channel, failures reported not dropped", async () => {
  const { fetchImpl, calls } = mockYouTube({ failHandle: "@bad" });
  const client = createClient({ apiKey: "SECRET123", fetchImpl });
  const res = await client.discover(["@good", "@bad"], 10);
  assert.equal(res.channels.length, 1);
  assert.equal(res.videos.length, 1);
  assert.equal(res.failures.length, 1);
  assert.equal(res.failures[0].handle, "@bad");
  assert.ok(calls.every((c) => !c.search.includes("SECRET123") && c.key === "SECRET123"));
  assert.equal(res.quotaUnitsUsed, 4); // good: channels+playlist+videos = 3, bad: channels = 1
  assert.ok(Number.isNaN(res.videos[0].likeCount), "hidden likes are NaN, never silently 0");
});

test("youtube errors never leak the API key", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "bad key SECRET123 rejected" });
  const client = createClient({ apiKey: "SECRET123", fetchImpl });
  await assert.rejects(() => client.resolveChannel("@x"), (e) => !e.message.includes("SECRET123") && e.message.includes("***"));
  assert.throws(() => createClient({ apiKey: "" }), /key missing/);
});

// ---------- lint rules ----------
const plan = () => ({
  schema_version: "1.0", fps: 30, width: 1920, height: 1080, totalFrames: 600,
  scenes: [
    { id: "S01", startFrame: 0, endFrame: 150, mode: "hero_number", purpose: "Open with the hook number", onScreenText: ["$1 → $2.80"], data: [{ label: "CPI", value: 2.8, unit: "USD", source: "BLS CPI-U", asOf: "2025-09" }], events: [{ frame: 10, type: "count_up" }] },
    { id: "S02", startFrame: 150, endFrame: 300, mode: "line_chart", purpose: "Show purchasing power decay", onScreenText: [], data: [{ label: "Example", value: 100, unit: "index", illustrative: true }], events: [] },
    { id: "S03", startFrame: 300, endFrame: 400, mode: "bar_chart", purpose: "Compare three savings options", onScreenText: [], data: [], events: [] },
    { id: "S04", startFrame: 400, endFrame: 500, mode: "causal_diagram", purpose: "Explain how inflation erodes cash", onScreenText: [], data: [], events: [] },
    { id: "S05", startFrame: 500, endFrame: 600, mode: "closing_composition", purpose: "Close with the takeaway", onScreenText: [], data: [], events: [] },
  ],
});
const planSchema = () => rj("schemas/scene_plan.schema.json");

test("scene plan fixture is valid; data without source/asOf or illustrative is rejected", () => {
  assert.deepEqual(validate(planSchema(), plan()), []);
  const bad = plan(); bad.scenes[0].data[0] = { label: "x", value: 1, unit: "USD" };
  assert.match(validate(planSchema(), bad).join(), /anyOf/);
  const bad2 = plan(); bad2.scenes[0].data[0].asOf = "last week";
  assert.match(validate(planSchema(), bad2).join(), /pattern/);
});

test("lintScenePlan: clean plan passes; gaps, unknown modes, character use, repeats are caught", () => {
  assert.deepEqual(lintScenePlan(plan(), modeSchema, null), []);
  const gap = plan(); gap.scenes[1].startFrame = 160;
  assert.match(lintScenePlan(gap, modeSchema, null).join(), /gap or overlap/);
  const mode = plan(); mode.scenes[2].mode = "spinning_logo";
  assert.match(lintScenePlan(mode, modeSchema, null).join(), /unknown visual mode/);
  const ch = plan(); ch.scenes[0].usesCharacter = true;
  assert.match(lintScenePlan(ch, modeSchema, null).join(), /thumbnail character/);
  const rep = plan(); rep.scenes.forEach((s) => (s.mode = "bar_chart"));
  assert.match(lintScenePlan(rep, modeSchema, null).join(), /three scenes in a row/);
  const ev = plan(); ev.scenes[0].events[0].frame = 400;
  assert.match(lintScenePlan(ev, modeSchema, null).join(), /outside the scene/);
});

test("lintScenePlan cross-checks the voice manifest", () => {
  const vm = { scenes: ["S01", "S02", "S03", "S04"].map((id) => ({ sceneId: id })), totalMs: 20000 };
  const probs = lintScenePlan(plan(), modeSchema, vm).join();
  assert.match(probs, /S05: no voiceover/);
});

test("lintScript: unknown source, figures without claims, guaranteed-return language", () => {
  const s = { sources: [{ id: "bls" }], scenes: [{ id: "S01", narration: "Prices rose 3 percent last year.", claims: [] }, { id: "S02", narration: "This is a guaranteed return.", claims: [] }, { id: "S03", narration: "Fine.", claims: [{ id: "c1", text: "x", sourceIds: ["nope"] }] }] };
  const p = lintScript(s).join("\n");
  assert.match(p, /S01: narration contains figures/);
  assert.match(p, /guaranteed-return/);
  assert.match(p, /unknown source "nope"/);
});

// ---------- doctor never leaks secret values ----------
test("doctor reports secret presence but never the value", () => {
  const cfg = rj("config/pipeline.json");
  const rows = localChecks(cfg, { YOUTUBE_API_KEY: "TOPSECRETVALUE" });
  const text = JSON.stringify(rows);
  assert.ok(!text.includes("TOPSECRETVALUE"));
  assert.equal(rows.find((r) => r.name === "youtube_api_key").status, "VERIFIED");
  assert.equal(rows.find((r) => r.name === "gemini_api_key").status, "UNVERIFIED");
});
