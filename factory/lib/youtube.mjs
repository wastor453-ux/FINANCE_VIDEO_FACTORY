// YouTube Data API v3 client (fetch injected for tests). Quota-lean: never uses the search resource.
// Per Google's quota table the channels / playlistItems / videos list calls cost 1 unit each.
// REST paths are the bare resource names (GET .../youtube/v3/channels, .../playlistItems, .../videos) --
// "channels.list" etc. is the RPC method name used in Google's docs/API Explorer, not a real URL path.
// Flow per channel: channels(forHandle) -> uploads playlist -> playlistItems -> videos.
// Auth: the key is sent in the x-goog-api-key header by default. `authMode: "query"` (config or YOUTUBE_AUTH_MODE)
// sends it as ?key= instead, for environments whose credential proxy only substitutes URL parameters.
// In every mode the key is scrubbed from error text and never logged. Network errors and 5xx are retried.

const BASE = "https://www.googleapis.com/youtube/v3";

export function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso || "");
  if (!m) return NaN;
  const [, d, h, mi, s] = m;
  return (Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(mi || 0) * 60) + Number(s || 0);
}

export function createClient({ apiKey, fetchImpl = globalThis.fetch, authMode = "header", retries = 2, timeoutMs = 20000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (authMode !== "header" && authMode !== "query") throw new Error(`authMode must be "header" or "query" (got "${authMode}")`);
  if (!apiKey) throw new Error("YouTube API key missing (set the env var named in config/pipeline.json -> secrets.youtubeApiKeyEnv)");
  let units = 0;

  async function call(path, params) {
    const url = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = { accept: "application/json" };
    if (authMode === "query") url.searchParams.set("key", apiKey); else headers["x-goog-api-key"] = apiKey;
    const scrub = (t) => String(t).split(apiKey).join("***");
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await sleep(500 * 2 ** (attempt - 1));
      let res, text;
      try {
        res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
        text = await res.text();
      } catch (e) {
        lastErr = new Error(`YouTube ${path} network error: ${scrub(e.cause?.code || e.message)}`);
        continue; // timeouts and resets are retried
      }
      units += 1;
      if (res.status >= 500) { lastErr = new Error(`YouTube ${path} failed: HTTP ${res.status}`); continue; }
      if (!res.ok) throw new Error(`YouTube ${path} failed: HTTP ${res.status} ${scrub(text).slice(0, 400)}`); // 4xx: do not retry
      return JSON.parse(text);
    }
    throw new Error(`${lastErr.message} (after ${retries + 1} attempts)`);
  }

  async function resolveChannel(handle) {
    const h = handle.startsWith("@") ? handle : `@${handle}`;
    const data = await call("channels", { part: "snippet,contentDetails", forHandle: h });
    const item = data.items?.[0];
    if (!item) throw new Error(`channel not found for handle ${h}`);
    return {
      handle: h,
      channelId: item.id,
      title: item.snippet.title,
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    };
  }

  async function recentUploadIds(uploadsPlaylistId, max) {
    const data = await call("playlistItems", { part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: String(Math.min(max, 50)) });
    return (data.items || []).map((i) => i.contentDetails.videoId);
  }

  async function videoDetails(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await call("videos", { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") });
      for (const v of data.items || []) {
        const st = v.statistics || {};
        out.push({
          videoId: v.id,
          channelId: v.snippet.channelId,
          channelTitle: v.snippet.channelTitle,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          liveBroadcastContent: v.snippet.liveBroadcastContent,
          durationSec: parseIsoDuration(v.contentDetails.duration),
          viewCount: st.viewCount !== undefined ? Number(st.viewCount) : NaN,
          likeCount: st.likeCount !== undefined ? Number(st.likeCount) : NaN, // hidden likes => NaN (flagged downstream)
          commentCount: st.commentCount !== undefined ? Number(st.commentCount) : NaN,
        });
      }
    }
    return out;
  }

  /** Collect recent uploads for every handle. A failing channel is reported, never silently dropped. */
  async function discover(handles, perChannel = 10) {
    const channels = [];
    const videos = [];
    const failures = [];
    for (const handle of handles) {
      try {
        const ch = await resolveChannel(handle);
        const ids = await recentUploadIds(ch.uploadsPlaylistId, perChannel);
        const details = await videoDetails(ids);
        channels.push({ ...ch, fetched: details.length });
        videos.push(...details);
      } catch (e) {
        failures.push({ handle, error: String(e.message).split(apiKey).join("***") });
      }
    }
    return { channels, videos, failures, quotaUnitsUsed: units };
  }

  return { resolveChannel, recentUploadIds, videoDetails, discover, get unitsUsed() { return units; } };
}
