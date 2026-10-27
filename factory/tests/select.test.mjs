import test from "node:test";
import assert from "node:assert/strict";
import { selectWinner, median, viewsPerHour, engagementRate } from "../lib/select.mjs";

const NOW = "2026-10-25T00:00:00Z";
const cfg = { minLongFormSec: 360, minAgeHours: 24, maxAgeDays: 10, ageFloorHours: 12, minBaselineVideos: 3, weights: { outlier: 0.6, engagement: 0.25, reach: 0.15 } };
const hoursAgo = (h) => new Date(new Date(NOW).getTime() - h * 3600_000).toISOString();
let n = 0;
const vid = (channelId, ageH, views, o = {}) => ({ videoId: `v${++n}`, channelId, channelTitle: channelId, title: `t${n}`, publishedAt: hoursAgo(ageH), durationSec: 600, viewCount: views, likeCount: views * 0.04, commentCount: views * 0.004, liveBroadcastContent: "none", ...o });

// A small channel whose newest video massively beats its own norm must beat a huge channel having a normal week.
function fixture() {
  const small = [vid("small", 30, 90_000)]; // candidate: 3000 vph
  for (let i = 1; i <= 4; i++) small.push(vid("small", 24 * (i + 2), 6000 * 24 * (i + 2) / 24)); // baseline ~250 vph
  const big = [vid("big", 30, 600_000)]; // 20000 vph, but normal for this channel
  for (let i = 1; i <= 4; i++) big.push(vid("big", 24 * (i + 2), 500_000)); // baseline ~ 7000..4000 vph
  return [...small, ...big];
}

test("median handles odd, even and empty", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

test("winner is the video that most outperforms ITS OWN channel, not the biggest channel", () => {
  const res = selectWinner(fixture(), cfg, NOW);
  assert.equal(res.winner.channelId, "small");
  assert.ok(res.winner.metrics.outlierVsChannelBaseline > 5);
  assert.equal(res.winner.metrics.baselineSource, "channel_peers");
});

test("selection is deterministic", () => {
  const data = fixture();
  const a = selectWinner(data, cfg, NOW);
  const b = selectWinner([...data].reverse(), cfg, NOW); // input order must not matter either
  assert.deepEqual(a.winner, b.winner);
  assert.deepEqual(a.runnersUp, b.runnersUp);
});

test("ineligible: seen, short, live, too new, too old, missing views", () => {
  const base = fixture();
  const seenId = base[0].videoId;
  const extras = [
    vid("x", 40, 1e6, { durationSec: 59 }),
    vid("x", 40, 1e6, { liveBroadcastContent: "live" }),
    vid("x", 5, 1e6),
    vid("x", 24 * 30, 1e6),
    vid("x", 40, NaN),
  ];
  const res = selectWinner([...base, ...extras], cfg, NOW, new Set([seenId]));
  const byId = Object.fromEntries(res.evaluated.map((e) => [e.videoId, e]));
  assert.deepEqual(byId[seenId].ineligibleReasons, ["already_seen"]);
  assert.match(byId[extras[0].videoId].ineligibleReasons.join(), /shorter_than_360s/);
  assert.match(byId[extras[1].videoId].ineligibleReasons.join(), /live_or_upcoming/);
  assert.match(byId[extras[2].videoId].ineligibleReasons.join(), /younger_than_24h/);
  assert.match(byId[extras[3].videoId].ineligibleReasons.join(), /older_than_10d/);
  assert.match(byId[extras[4].videoId].ineligibleReasons.join(), /view_count_unavailable/);
  assert.notEqual(res.winner.videoId, seenId);
});

test("no eligible candidate -> winner null with an explanation (never a silent pick)", () => {
  const res = selectWinner([vid("a", 2, 100)], cfg, NOW);
  assert.equal(res.winner, null);
  assert.match(res.note, /No eligible candidate/);
});

test("channel with too few peers falls back to the global baseline and says so", () => {
  const res = selectWinner([vid("lonely", 40, 50_000), ...fixture()], cfg, NOW);
  const lonely = res.evaluated.find((e) => e.channelId === "lonely");
  assert.equal(lonely.metrics.baselineSource, "global_fallback");
});

test("age floor stops brand-new videos winning on a tiny denominator", () => {
  assert.equal(viewsPerHour({ viewCount: 1200, publishedAt: hoursAgo(1) }, NOW, 12), 100);
});

test("hidden likes are flagged and engagement does not crash", () => {
  const v = vid("a", 40, 1000, { likeCount: NaN });
  assert.equal(engagementRate(v), 0.004);
  const res = selectWinner([v, ...fixture()], cfg, NOW);
  assert.equal(res.evaluated.find((e) => e.videoId === v.videoId).metrics.likesHidden, true);
});
