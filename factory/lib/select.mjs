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

/**
 * For each channel, the one video that is eligible to WIN this week: its single most recent
 * long-form, non-live upload, regardless of how many other videos were fetched for that channel.
 * Shorts are skipped when looking for "latest" (a channel can post shorts between long-form
 * uploads; we want their latest long-form, not their latest upload of any length). A channel
 * whose only recent output is shorts therefore has no candidate this week -- not an older one.
 * This does NOT affect the channel-baseline peer pool (computed separately in selectWinner),
 * which intentionally still looks at a channel's recent history to judge whether its latest is
 * an outlier -- only which single video is ALLOWED to be the winner.
 */
export function latestLongFormPerChannel(videos, cfg) {
  const byChannel = new Map();
  for (const v of videos) {
    if (!(v.durationSec >= cfg.minLongFormSec)) continue;
    if (v.liveBroadcastContent && v.liveBroadcastContent !== "none") continue;
    const cur = byChannel.get(v.channelId);
    if (!cur || new Date(v.publishedAt).getTime() > new Date(cur.publishedAt).getTime()) byChannel.set(v.channelId, v);
  }
  return new Set([...byChannel.values()].map((v) => v.videoId));
}

export function eligibility(v, cfg, now, seenIds, latestIds) {
  const reasons = [];
  if (seenIds.has(v.videoId)) reasons.push("already_seen");
  if (v.liveBroadcastContent && v.liveBroadcastContent !== "none") reasons.push("live_or_upcoming");
  if (!(v.durationSec >= cfg.minLongFormSec)) reasons.push(`shorter_than_${cfg.minLongFormSec}s`);
  else if (latestIds && !latestIds.has(v.videoId)) reasons.push("not_channels_latest_long_form_upload");
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

  // Same age-decay reasoning as the per-channel baseline below: bound the global fallback too,
  // so a channel with too few peers doesn't get compared against a pool skewed by old videos.
  const baselineMaxAgeDaysGlobal = cfg.baselineMaxAgeDays ?? cfg.maxAgeDays;
  const globalVph = median(rated.filter((v) => { const h = ageHours(v.publishedAt, now); return h >= cfg.minAgeHours && h <= baselineMaxAgeDaysGlobal * 24; }).map((v) => v.vph));
  const globalEng = median(rated.map((v) => v.eng).filter((e) => e > 0));

  // Candidates competing for the win are restricted to each channel's single latest long-form
  // upload (owner's explicit requirement, 2026-10-28): we compare "what's new this week per
  // channel", not every recent video from every channel. Older or non-latest videos are still
  // used below as baseline peers -- they inform whether the latest is an outlier, they just can't
  // win themselves.
  const latestIds = latestLongFormPerChannel(rated, cfg);

  const evaluated = rated.map((v) => {
    const reasons = eligibility(v, cfg, now, seenIds, latestIds);
    // baseline: this channel's OTHER mature long-form videos, bounded in age.
    // vph (views / hours-since-publish) decays over a video's life by construction, so an
    // unbounded peer set (including videos from months ago) drags the baseline down and makes
    // ANY recent candidate look like a huge outlier for that reason alone, not real performance.
    // baselineMaxAgeDays keeps peers roughly comparable in age to the candidates we actually score.
    const baselineMaxAgeDays = cfg.baselineMaxAgeDays ?? cfg.maxAgeDays;
    const peers = rated.filter(
      (p) =>
        p.channelId === v.channelId &&
        p.videoId !== v.videoId &&
        p.durationSec >= cfg.minLongFormSec &&
        ageHours(p.publishedAt, now) >= cfg.minAgeHours &&
        ageHours(p.publishedAt, now) <= baselineMaxAgeDays * 24
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
