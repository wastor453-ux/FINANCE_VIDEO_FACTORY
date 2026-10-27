import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validate } from "../lib/schema.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const F = path.join(here, "..");
const HAVE_PY = spawnSync("python3", ["--version"]).status === 0;

test("TTS tool (Python): request shape, text rules, retries, manifest — against a fake client", { skip: !HAVE_PY, timeout: 120000 }, () => {
  const r = spawnSync("python3", ["-m", "unittest", "-v", "test_synthesize"], { cwd: here, encoding: "utf8", env: { ...process.env, PYTHONPATH: here } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /Ran 9 tests/);
});

test("the manifest the TTS tool writes passes the voice_manifest schema", { skip: !HAVE_PY, timeout: 60000 }, () => {
  const script = `
import sys, json, tempfile, os
sys.path.insert(0, ${JSON.stringify(path.join(F, "tools"))}); sys.path.insert(0, ${JSON.stringify(here)})
import synthesize as S
from test_synthesize import FakeClient, tone_wav
d = tempfile.mkdtemp()
m = S.make_episode(FakeClient([tone_wav(1500)]), S.load_config(), {"scenes": [{"sceneId": "hook", "text": "Hello there."}]}, d, sleep=lambda s: None)
print(json.dumps(m))`;
  const r = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const schema = JSON.parse(fs.readFileSync(path.join(F, "schemas/voice_manifest.schema.json"), "utf8"));
  const problems = validate(schema, JSON.parse(r.stdout));
  assert.deepEqual(problems, []);
});

test("the CLI refuses to run without a key or SDK and never prints a key", { skip: !HAVE_PY }, () => {
  const env = { ...process.env }; delete env.GEMINI_API_KEY; delete env.GOOGLE_API_KEY;
  const r = spawnSync("python3", [path.join(F, "tools/synthesize.py"), "sample", "--text", "hi", "--out", os.tmpdir()], { encoding: "utf8", env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GEMINI_API_KEY is not set/);
});
