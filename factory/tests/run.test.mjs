import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isoWeek, makeRunId, newRunState, setStage, approveGate, isComplete, markArchived, isExpired, daysSince, STAGE_STATUSES, GATES } from "../lib/run.mjs";
import { validate } from "../lib/schema.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const runStateSchema = JSON.parse(fs.readFileSync(path.join(here, "..", "schemas", "run_state.schema.json"), "utf8"));

test("isoWeek matches known ISO-8601 week numbers", () => {
  assert.deepEqual(isoWeek(new Date("2026-01-01T00:00:00Z")), { year: 2026, week: 1 }); // Jan 1, 2026 is a Thursday -> week 1
  assert.deepEqual(isoWeek(new Date("2026-10-27T00:00:00Z")), { year: 2026, week: 44 }); // today, independently verifiable
  // 2020 has an ISO week 53; Jan 1 2021 (a Friday) still belongs to it, under the 2020 ISO year
  assert.deepEqual(isoWeek(new Date("2020-12-31T00:00:00Z")), { year: 2020, week: 53 });
  assert.deepEqual(isoWeek(new Date("2021-01-01T00:00:00Z")), { year: 2020, week: 53 });
});

test("isoWeek is internally consistent: every day in the same Mon-Sun week gets the same number", () => {
  const mon = isoWeek(new Date("2026-10-19T12:00:00Z"));
  const sun = isoWeek(new Date("2026-10-25T12:00:00Z"));
  assert.deepEqual(mon, sun);
  const nextMon = isoWeek(new Date("2026-10-26T12:00:00Z"));
  assert.notDeepEqual(mon, nextMon);
});

test("makeRunId is unique per channel+video and never collides on a same-week retry", () => {
  const now = "2026-10-27T18:30:00Z";
  const a = makeRunId({ now, channelHandle: "@WhiteBoardFinance", videoId: "xxoqWfPAhhY" });
  const b = makeRunId({ now, channelHandle: "@WhiteBoardFinance", videoId: "zzzzzzzz" }); // retry, different video
  assert.notEqual(a, b);
  assert.match(a, /^\d{4}-W\d{2}-whiteboardfinance-xxoqWfPA$/);
});

test("makeRunId slugifies handles and strips the leading @", () => {
  const id = makeRunId({ now: "2026-10-27T00:00:00Z", channelHandle: "@Erin_Talks.Money!", videoId: "abc12345" });
  assert.match(id, /erin-talks-money-abc12345$/);
  assert.ok(!id.includes("@"));
});

test("newRunState initializes every known stage PENDING and every gate unapproved", () => {
  const s = newRunState({ runId: "x", channelHandle: "@a", videoId: "v1", title: "T", createdAt: "2026-10-27T00:00:00Z" });
  assert.ok(Object.keys(s.stages).length >= 10);
  assert.ok(Object.values(s.stages).every((st) => st.status === "PENDING"));
  for (const g of GATES) assert.equal(s.gates[g].approved, false);
  assert.equal(s.archived, null);
});

test("setStage updates one stage without touching the others; rejects unknown stage/status", () => {
  let s = newRunState({ runId: "x", channelHandle: "@a", videoId: "v1", title: "T", createdAt: "2026-10-27T00:00:00Z" });
  s = setStage(s, "discover", "VERIFIED", "70 videos, 0 failures", "2026-10-27T18:32:04Z");
  assert.equal(s.stages.discover.status, "VERIFIED");
  assert.equal(s.stages.discover.note, "70 videos, 0 failures");
  assert.equal(s.stages.select.status, "PENDING"); // untouched
  assert.throws(() => setStage(s, "not_a_stage", "VERIFIED"), /unknown stage/);
  assert.throws(() => setStage(s, "discover", "NOT_A_STATUS"), /unknown status/);
  for (const st of STAGE_STATUSES) assert.doesNotThrow(() => setStage(s, "discover", st));
});

test("approveGate records who/when and requires a name; rejects unknown gate", () => {
  let s = newRunState({ runId: "x", channelHandle: "@a", videoId: "v1", title: "T", createdAt: "2026-10-27T00:00:00Z" });
  s = approveGate(s, "G1", "owner", "approved WhiteBoard Finance winner", "2026-10-27T19:00:00Z");
  assert.equal(s.gates.G1.approved, true);
  assert.equal(s.gates.G1.by, "owner");
  assert.equal(s.gates.G2.approved, false); // untouched
  assert.throws(() => approveGate(s, "G1", null), /who approved/);
  assert.throws(() => approveGate(s, "G9", "owner"), /unknown gate/);
});

test("isComplete is true only once every gate is approved", () => {
  let s = newRunState({ runId: "x", channelHandle: "@a", videoId: "v1", title: "T", createdAt: "2026-10-27T00:00:00Z" });
  assert.equal(isComplete(s), false);
  for (const g of GATES) s = approveGate(s, g, "owner");
  assert.equal(isComplete(s), true);
});

test("a real run_state -- including the video id's mixed case preserved in runId -- passes its own schema at every lifecycle point", () => {
  const now = "2026-10-27T18:30:00Z";
  const runId = makeRunId({ now, channelHandle: "@WhiteBoardFinance", videoId: "xxoqWfPAhhY" }); // mixed-case id on purpose
  let s = newRunState({ runId, channelHandle: "@WhiteBoardFinance", videoId: "xxoqWfPAhhY", title: "T", createdAt: now });
  assert.deepEqual(validate(runStateSchema, s), []);
  s = setStage(s, "discover", "VERIFIED", "70 videos");
  assert.deepEqual(validate(runStateSchema, s), []);
  for (const g of GATES) s = approveGate(s, g, "owner");
  assert.deepEqual(validate(runStateSchema, s), []);
  s = markArchived(s, "2026-11-05T00:00:00Z", "archive/" + runId);
  assert.deepEqual(validate(runStateSchema, s), []);
});

test("archive + retention: a run is deletable only once retentionDays have passed since archiving", () => {
  let s = newRunState({ runId: "x", channelHandle: "@a", videoId: "v1", title: "T", createdAt: "2026-10-01T00:00:00Z" });
  s = markArchived(s, "2026-10-01T00:00:00Z", "archive/x");
  assert.equal(s.archived.path, "archive/x");
  assert.equal(daysSince("2026-10-01T00:00:00Z", "2026-10-10T00:00:00Z"), 9);
  assert.equal(isExpired(s.archived.at, "2026-10-10T00:00:00Z", 15), false); // 9 days: not yet
  assert.equal(isExpired(s.archived.at, "2026-10-16T00:00:00Z", 15), true); // 15 days: now
  assert.equal(isExpired(s.archived.at, "2026-10-20T00:00:00Z", 15), true); // 19 days: well past
});
