// Run lifecycle: one unique, self-contained project folder per weekly video.
// Pure functions only (no fs here) so the logic is unit-testable; the CLI layer in bin/ffx.mjs
// does the actual file I/O. This is the thing that makes "one reusable system, many weekly runs"
// real in code instead of only described in a skill's prose: every run gets its own folder,
// a run_state.json records every stage's status and every gate's approval, and a run can be
// archived and later deleted on a retention clock without ever touching the engine (lib/, skills/,
// config/, schemas/) that produced it.

export const STAGE_STATUSES = ["PENDING", "IN_PROGRESS", "VERIFIED", "FAILED", "UNVERIFIED", "NEEDS_HUMAN"];
export const GATES = ["G1", "G2", "G3", "G4", "G5"];
const STAGE_ORDER = [
  "doctor", "discover", "select", "transcript", "analyze", "script", "fact_check",
  "voice", "scene_plan", "sound_design", "render_dispatch", "assemble_qa", "thumbnail", "package",
];

function slugify(s) {
  return String(s).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "x";
}

/** ISO-8601 week number (Monday-start, week 1 contains the year's first Thursday). */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return { year: d.getUTCFullYear(), week };
}

/**
 * Builds the unique, human-readable, collision-resistant run folder name for one video.
 * Not just the week number: tying it to the channel and video id means two runs can never
 * collide even on a retry or a re-run of the same week, and the name alone documents what's inside.
 */
export function makeRunId({ now, channelHandle, videoId }) {
  const { year, week } = isoWeek(new Date(now));
  const w = String(week).padStart(2, "0");
  const ch = slugify(channelHandle);
  const vid = String(videoId || "pending").slice(0, 8);
  return `${year}-W${w}-${ch}-${vid}`;
}

export function newRunState({ runId, channelHandle, videoId, title, createdAt }) {
  const stages = {};
  for (const s of STAGE_ORDER) stages[s] = { status: "PENDING", at: null, note: null };
  const gates = {};
  for (const g of GATES) gates[g] = { approved: false, at: null, by: null, note: null };
  return {
    schema_version: "1.0",
    runId,
    createdAt,
    channel: { handle: channelHandle || null, videoId: videoId || null, title: title || null },
    stages,
    gates,
    archived: null,
  };
}

export function setStage(state, stageName, status, note, at) {
  if (!(stageName in state.stages)) throw new Error(`unknown stage "${stageName}" (known: ${Object.keys(state.stages).join(", ")})`);
  if (!STAGE_STATUSES.includes(status)) throw new Error(`unknown status "${status}" (known: ${STAGE_STATUSES.join(", ")})`);
  return { ...state, stages: { ...state.stages, [stageName]: { status, at: at || new Date().toISOString(), note: note || null } } };
}

export function approveGate(state, gate, by, note, at) {
  if (!(gate in state.gates)) throw new Error(`unknown gate "${gate}" (known: ${GATES.join(", ")})`);
  if (!by) throw new Error("gate approval requires who approved it (--by)");
  return { ...state, gates: { ...state.gates, [gate]: { approved: true, at: at || new Date().toISOString(), by, note: note || null } } };
}

/** True once every gate that applies up to and including G5 has been approved -- i.e. safe to archive. */
export function isComplete(state) {
  return GATES.every((g) => state.gates[g]?.approved === true);
}

export function markArchived(state, archivedAt, archivePath) {
  return { ...state, archived: { at: archivedAt, path: archivePath } };
}

/** Whole days since an ISO timestamp, as of `now` (also ISO). */
export function daysSince(isoTimestamp, now) {
  return (new Date(now).getTime() - new Date(isoTimestamp).getTime()) / 86_400_000;
}

export function isExpired(archivedAtIso, now, retentionDays) {
  return daysSince(archivedAtIso, now) >= retentionDays;
}
