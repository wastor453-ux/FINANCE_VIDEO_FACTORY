// Winner selection: deterministic, explainable, fair across channels of different size.
// Pure functions only (no I/O) so the logic is unit-testable and auditable.

export function median(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function ageHours(publishedAt, now) {
  return (new Date(now).getTime() - new Date(publishedAt).getTime()) / 3_600_000;
}

/** views per hour with a floor on age so brand-new videos cannot dominate on tiny denominators */
export function viewsPerHour(v, now, floorHours) {
  return v.viewCount / Math.max(ageHours(v.publishedAt, now), floorHours);
}

/** (likes + comments) / views; likes may be hidden => comments only, flagged */
export function engagementRate(v) {
  if (!v.viewCount) return 0;
  const likes = Number.isFinite(v.likeCount) ? v.likeCount : 0;
  const comments = Number.isFinite(v.commentCount) ? v.commentCount : 0;
  return (likes + comments) / v.viewCount;
}

export function eligibility(v, cfg, now, seenIds) {
  const reasons = [];
  if (seenIds.has(v.videoId)) reasons.push("already_seen");
  if (v.liveBroadcastContent && v.liveBroadcastContent !== "none") reasons.push("live_or_upcoming");
  if (!(v.durationSec >= cfg.minLongFormSec)) reasons.push(`shorter_than_${cfg.minLongFormSec}s`);
  const age = ageHours(v.publishedAt, now);
  if (!(age >= cfg.minAgeHours)) reasons.push(`younger_than_${cfg.minAgeHours}h`);
  if (age > cfg.maxAgeDays * 24) reasons.push(`older_than_${cfg.maxAgeDays}d`);
  if (!Number.isFinite(v.viewCount)) reasons.push("view_count_unavailable");
  return reasons;
}

/**
 * @param videos   all fetched videos (recent uploads of every channel; used for baselines AND candidates)
 * @param cfg      config/pipeline.json -> selection
 * @param now      ISO timestamp (injected for determinism)
 * @param seenIds  Set of previously discovered videoIds
 */
export function selectWinner(videos, cfg, now, seenIds = new Set()) {
  const w = cfg.weights;
  const rated = videos.map((v) => ({
    ...v,
    vph: Number.isFinite(v.viewCount) ? viewsPerHour(v, now, cfg.ageFloorHours) : NaN,
    eng: engagementRate(v),
  }));

  const globalVph = median(rated.filter((v) => ageHours(v.publishedAt, now) >= cfg.minAgeHours).map((v) => v.vph));
  const globalEng = median(rated.map((v) => v.eng).filter((e) => e > 0));

  const evaluated = rated.map((v) => {
    const reasons = eligibility(v, cfg, now, seenIds);
    // baseline: this channel's OTHER mature long-form videos in the window
    const peers = rated.filter(
      (p) =>
        p.channelId === v.channelId &&
        p.videoId !== v.videoId &&
        p.durationSec >= cfg.minLongFormSec &&
        ageHours(p.publishedAt, now) >= cfg.minAgeHours
    );
    const usePeers = peers.length >= cfg.minBaselineVideos;
    const baselineVph = usePeers ? median(peers.map((p) => p.vph)) : globalVph;
    const baselineSource = usePeers ? "channel_peers" : "global_fallback";
    const outlier = v.vph / baselineVph;
    const engRatio = globalEng > 0 && v.eng > 0 ? v.eng / globalEng : 1;
    const reach = v.vph / globalVph;
    const score =
      w.outlier * Math.log(Math.max(outlier, 0.01)) +
      w.engagement * Math.log(Math.max(engRatio, 0.01)) +
      w.reach * Math.log(Math.max(reach, 0.01));
    return {
      videoId: v.videoId,
      channelId: v.channelId,
      channelTitle: v.channelTitle,
      title: v.title,
      eligible: reasons.length === 0,
      ineligibleReasons: reasons,
      metrics: {
        viewsPerHour: round(v.vph),
        engagementRate: round(v.eng, 5),
        outlierVsChannelBaseline: round(outlier),
        baselineViewsPerHour: round(baselineVph),
        baselineSource,
        likesHidden: !Number.isFinite(v.likeCount),
      },
      score: round(score, 4),
    };
  });

  const ranked = evaluated
    .filter((e) => e.eligible && Number.isFinite(e.score))
    .sort((a, b) => b.score - a.score || (a.videoId < b.videoId ? -1 : 1));

  return {
    winner: ranked[0] || null,
    runnersUp: ranked.slice(1, 4),
    evaluated,
    note: ranked.length ? null : "No eligible candidate this week; widen window or skip the week.",
  };
}

function round(x, d = 3) {
  return Number.isFinite(x) ? Number(x.toFixed(d)) : null;
}
