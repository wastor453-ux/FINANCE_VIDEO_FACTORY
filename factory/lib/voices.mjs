// Look up a voice in the Gemini voice library. The request shape (search/type query parameters) follows the
// Gemini API reference as relayed by the Muse agent; it is UNVERIFIED until a live call succeeds, so the raw
// response is returned for a human to read before anything is written to config/voice.json.
const BASE = "https://generativelanguage.googleapis.com/v1beta/voices";

export async function searchVoices({ apiKey, search, type, pageSize = 50, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  if (!apiKey) throw new Error("Gemini API key missing");
  const url = new URL(BASE);
  if (search) url.searchParams.set("search", search);
  if (type) url.searchParams.set("type", type);
  url.searchParams.set("pageSize", String(pageSize));
  const res = await fetchImpl(url, { headers: { "x-goog-api-key": apiKey, accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`voices search failed: HTTP ${res.status} ${text.split(apiKey).join("***").slice(0, 400)}`);
  const body = JSON.parse(text);
  return { requested: { search, type }, count: (body.voices || []).length, voices: body.voices || [], nextPageToken: body.nextPageToken ?? null };
}
