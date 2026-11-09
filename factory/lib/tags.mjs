// Voice-layer markers (<short pause>, <breath>, ...) live inside narration text but are not words:
// every script check (word counts, timing, rhythm, fit) works on the spoken words only.
export const TAG_RE = /<[^<>]*>/g;
export const spoken = (t) => String(t ?? "").replace(TAG_RE, " ").replace(/\s+/g, " ").replace(/\s+([,.?!;:])/g, "$1").trim();
export function plainScript(script) {
  const s = structuredClone(script);
  for (const sc of s.scenes || []) {
    if (typeof sc.narration === "string") sc.narration = spoken(sc.narration);
    for (const b of sc.beats || []) if (typeof b.narration === "string") b.narration = spoken(b.narration);
  }
  return s;
}
export function tagsIn(t) { return String(t ?? "").match(TAG_RE) || []; }
