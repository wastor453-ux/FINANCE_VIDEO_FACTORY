import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkJob, isSafeRelPath } from "../lib/job.mjs";
import { sha256File } from "../lib/assemble.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const F = path.join(here, "..");
const REPO = path.join(F, "..");
const schema = JSON.parse(fs.readFileSync(path.join(F, "schemas/render_job.schema.json"), "utf8"));
const pipeline = JSON.parse(fs.readFileSync(path.join(F, "config/pipeline.json"), "utf8"));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ffx-job-"));
  fs.mkdirSync(path.join(root, "jobs/x"), { recursive: true });
  fs.writeFileSync(path.join(root, "jobs/x/props.json"), '{"scenes":[]}');
  fs.writeFileSync(path.join(root, "jobs/x/mix.wav"), "RIFFfake-audio-bytes");
  const job = {
    schema_version: "1.0", jobId: "2026-W44", composition: "FinanceEpisode", repo: "OWNER/REPO",
    ref: "factory/v1", commit: "a".repeat(40), startFrame: 0, endFrame: 1799, chunkFrames: 600, crf: 18,
    propsFile: "jobs/x/props.json", audioFile: "jobs/x/mix.wav",
    inputHashes: { "jobs/x/props.json": sha256File(path.join(root, "jobs/x/props.json")), "jobs/x/mix.wav": sha256File(path.join(root, "jobs/x/mix.wav")) },
    approvedByUser: true, approvedAt: "2026-10-26T12:00:00+05:00",
  };
  return { root, job };
}
const check = (job, root) => checkJob(job, { schema, root, pipeline });

test("a fully approved job passes and produces the chunk matrix and defaults", () => {
  const { root, job } = fixture();
  const r = check(job, root);
  assert.equal(r.ok, true, r.problems.join("; "));
  assert.equal(r.matrix.chunk.length, 3);
  assert.deepEqual(r.video, { width: 1920, height: 1080, fps: 30 });
  assert.equal(r.concurrency, pipeline.render.concurrencyPerJob);
  assert.equal(r.totalFrames, 1800);
});

test("a job without the user's approval is rejected", () => {
  const { root, job } = fixture();
  assert.equal(check({ ...job, approvedByUser: false }, root).ok, false);
  const { approvedByUser, ...noFlag } = job;
  assert.match(check(noFlag, root).problems.join(), /approvedByUser/);
  const { approvedAt, ...noTime } = job;
  assert.match(check(noTime, root).problems.join(), /approvedAt/);
});

test("an input changed after approval is caught by its hash", () => {
  const { root, job } = fixture();
  fs.writeFileSync(path.join(root, "jobs/x/props.json"), '{"scenes":[1]}');
  assert.match(check(job, root).problems.join(), /input changed since approval: jobs\/x\/props\.json/);
});

test("missing or empty inputs are caught", () => {
  const { root, job } = fixture();
  fs.writeFileSync(path.join(root, "jobs/x/mix.wav"), "");
  assert.match(check(job, root).problems.join(), /missing or empty: jobs\/x\/mix\.wav/);
});

test("unsafe paths are rejected everywhere", () => {
  for (const bad of ["../etc/passwd", "/abs/path", "a/../b", "a//b", "a b", "a;rm -rf", "$(whoami)", ""]) assert.equal(isSafeRelPath(bad), false, bad);
  for (const good of ["jobs/x/mix.wav", "public/audio/a-b_c.1.wav"]) assert.equal(isSafeRelPath(good), true, good);
  const { root, job } = fixture();
  const r = check({ ...job, audioFile: "../outside.wav" }, root);
  assert.match(r.problems.join(), /safe repo-relative path/);
  const r2 = check({ ...job, inputHashes: { ...job.inputHashes, "../x": "b".repeat(64) } }, root);
  assert.match(r2.problems.join(), /not a safe repo-relative path/);
});

test("audio and props must be covered by inputHashes; frame range must be ordered", () => {
  const { root, job } = fixture();
  const { ["jobs/x/mix.wav"]: _drop, ...hashes } = job.inputHashes;
  assert.match(check({ ...job, inputHashes: hashes }, root).problems.join(), /audioFile .* must be listed in inputHashes/);
  assert.match(check({ ...job, startFrame: 10, endFrame: 5 }, root).problems.join(), /endFrame must be >= startFrame/);
});

// ---------- workflow contract ----------
const wf = fs.readFileSync(path.join(REPO, ".github/workflows/render-factory.yml"), "utf8");

/** Extract the text of every `run:` block (block scalars and one-liners). */
function runBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    if (m[2] && m[2] !== "|" && m[2] !== ">") { blocks.push(m[2]); continue; }
    const indent = m[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() && l.search(/\S/) <= indent) break;
      body.push(l);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

test("workflow: no GitHub expression is interpolated into shell code (injection-safe)", () => {
  const blocks = runBlocks(wf);
  assert.ok(blocks.length >= 8, "found run blocks");
  for (const b of blocks) assert.doesNotMatch(b, /\$\{\{/, `expression inside a run block:\n${b.slice(0, 200)}`);
});

test("workflow: requires typed confirmation and the validated job file before rendering", () => {
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /\[ "\$CONFIRM" = "RENDER" \]/);
  assert.match(wf, /ffx\.mjs check-job/);
  assert.match(wf, /jobs\/\*\.json\) ;; \*\) echo "job_file must be jobs/);
  assert.match(wf, /needs: plan/);
  assert.match(wf, /needs: \[plan, render-chunk\]/);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(wf, /contents: write|pull_request_target|secrets\./);
});

test("workflow: chunks are fingerprinted, assembled and QA'd by the tested tools", () => {
  for (const cmd of ["chunk-meta", "assemble", "qa-video"]) assert.match(wf, new RegExp(`ffx\\.mjs ${cmd}`));
  assert.match(wf, /npm ci/);
  assert.match(wf, /max-parallel: 10/);
  assert.match(wf, /fail-fast: false/);
  assert.match(wf, /if-no-files-found: error/);
  assert.doesNotMatch(wf, /amix|-shortest|bc /, "legacy audio-mux hazards must not return");
});
