import test from "node:test";
import assert from "node:assert/strict";
import { selectWinner, median, viewsPerHour, engagementRate, latestLongFormPerChannel } from "../lib/select.mjs";

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

// Found 2026-10-27 against real discovery data: vph (views / hours-since-publish) decays with age
// by construction, so an unbounded peer set (including videos from months back) drags a channel's
// baseline down and makes ANY recent upload look like a huge outlier for that reason alone -- not
// because it's actually unusual. baselineMaxAgeDays bounds peer age so this can't happen silently.
test("old peers don't drag the baseline down and inflate a merely-normal new video into a fake outlier", () => {
  // simulate the pre-fix behavior explicitly (no effective peer-age ceiling), vs. the fix (45 days)
  const cfgUnbounded = { ...cfg, baselineMaxAgeDays: 99999 };
  const cfgBounded = { ...cfg, baselineMaxAgeDays: 45 };
  const candidate = vid("ch", 27, 20_000); // ~740 vph, 27h old -- a normal, not-exceptional upload
  // peers: three recent (comparable vph), several ancient (vph has decayed hard by months out)
  const recentPeers = [vid("ch", 240, 120_000), vid("ch", 480, 220_000), vid("ch", 360, 180_000)]; // ~500, ~458, ~500 vph
  const ancientPeers = [ // all older than the 45-day bound; vph has decayed to single digits
    vid("ch", 1500, 15_000), vid("ch", 1800, 10_000), vid("ch", 2000, 12_000), vid("ch", 2200, 8_000), vid("ch", 2500, 10_000),
  ];
  const data = [candidate, ...recentPeers, ...ancientPeers, ...fixture()];
  const unbounded = selectWinner(data, cfgUnbounded, NOW); // old behavior: ancient peers drag the median down
  const bounded = selectWinner(data, cfgBounded, NOW); // fixed: ancient peers excluded
  const u = unbounded.evaluated.find((e) => e.videoId === candidate.videoId);
  const b = bounded.evaluated.find((e) => e.videoId === candidate.videoId);
  assert.equal(u.metrics.baselineSource, "channel_peers");
  assert.equal(b.metrics.baselineSource, "channel_peers");
  // unbounded: median baseline dragged down by the 3 ancient (low-vph) peers
  assert.ok(u.metrics.baselineViewsPerHour < 20, u.metrics.baselineViewsPerHour);
  assert.ok(u.metrics.outlierVsChannelBaseline > 30, u.metrics.outlierVsChannelBaseline); // falsely huge
  // bounded: ancient peers excluded, baseline reflects the two recent (comparable) peers instead
  assert.ok(b.metrics.baselineViewsPerHour > 400, b.metrics.baselineViewsPerHour);
  assert.ok(b.metrics.outlierVsChannelBaseline < 2, b.metrics.outlierVsChannelBaseline); // honestly unremarkable
});

// Owner's requirement, 2026-10-28: only a channel's single LATEST long-form upload may win --
// an older long-form video from the same channel can't win even if it would have scored higher,
// and a channel whose latest upload is a short (not its latest long-form) is correctly skipped
// for "latest" purposes rather than falling back to an even-older long-form video.
test("only a channel's single latest long-form upload can win, even if an older one scored higher", () => {
  const newer = vid("c", 30, 50_000); // ~1666 vph, modest
  const older = vid("c", 60, 400_000); // ~6666 vph, would clearly outscore `newer` under the old rule
  const peers = [vid("c", 240, 60_000), vid("c", 480, 70_000), vid("c", 720, 80_000)]; // baseline peers, same channel
  const res = selectWinner([newer, older, ...peers, ...fixture()], cfg, NOW);
  const newerEval = res.evaluated.find((e) => e.videoId === newer.videoId);
  const olderEval = res.evaluated.find((e) => e.videoId === older.videoId);
  assert.equal(newerEval.eligible, true);
  assert.equal(olderEval.eligible, false);
  assert.match(olderEval.ineligibleReasons.join(), /not_channels_latest_long_form_upload/);
  // sanity: the older video really would have scored higher on the old unrestricted rule
  assert.ok(olderEval.score > newerEval.score, "fixture setup check: older should score higher pre-restriction");
});

test("a channel whose latest upload is a short still competes with its latest LONG-FORM upload, not an even-older one", () => {
  const short = vid("c", 10, 500_000, { durationSec: 45 }); // newest overall, but a short
  const latestLong = vid("c", 30, 50_000); // newest LONG-FORM -- this is the one that should be eligible
  const olderLong = vid("c", 200, 50_000); // older long-form -- must not be eligible
  const peers = [vid("c", 400, 60_000), vid("c", 600, 70_000), vid("c", 800, 80_000)];
  const latestIds = latestLongFormPerChannel([short, latestLong, olderLong, ...peers], cfg);
  assert.ok(latestIds.has(latestLong.videoId));
  assert.ok(!latestIds.has(olderLong.videoId));
  assert.ok(!latestIds.has(short.videoId)); // shorts are never in the long-form "latest" set at all
});
