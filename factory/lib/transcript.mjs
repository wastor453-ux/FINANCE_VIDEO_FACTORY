// Transcript acquisition support: parsing (VTT/SRT) and validation.
// Pure functions only (no I/O, no process spawning) so they're unit-testable without network,
// external tools. Fetching is done elsewhere (tools/gemini_transcript.py, a hosted API, or a human paste).

function parseTimestamp(ts) {
  // Accepts "HH:MM:SS.mmm", "MM:SS.mmm" (VTT allows omitting hours), or "HH:MM:SS,mmm" (SRT).
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(ts.trim());
  if (!m) return NaN;
  const [, h, mi, s, ms] = m;
  const msPadded = ms.padEnd(3, "0").slice(0, 3);
  return (Number(h || 0) * 3600 + Number(mi) * 60 + Number(s)) * 1000 + Number(msPadded);
}

function stripTags(s) {
  // VTT cue text can carry <c>, <b>, <i>, timestamp tags (<00:00:01.000>), and &amp;-style entities.
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses WebVTT text into {startMs, endMs, text} segments.
 * Auto-generated YouTube captions are "rolling" -- consecutive cues often repeat or extend the
 * previous cue's text word by word. Exact duplicate consecutive segments are dropped; this is a
 * light cleanup, not a full rolling-caption reconstruction.
 */
export function parseVtt(raw) {
  const lines = String(raw).replace(/\r\n/g, "\n").split("\n");
  const segments = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/.exec(line);
    if (m) {
      const [startRaw, endRaw] = line.split("-->").map((s) => s.trim().split(/\s+/)[0]);
      const startMs = parseTimestamp(startRaw);
      const endMs = parseTimestamp(endRaw);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") { textLines.push(lines[i]); i++; }
      const text = stripTags(textLines.join(" "));
      if (text && Number.isFinite(startMs) && Number.isFinite(endMs)) {
        const prev = segments[segments.length - 1];
        if (!prev || prev.text !== text) segments.push({ startMs, endMs, text });
      }
    } else {
      i++;
    }
  }
  return segments;
}

/** Parses SRT text into {startMs, endMs, text} segments. */
export function parseSrt(raw) {
  const blocks = String(raw).replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  const segments = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const tsLine = lines.find((l) => l.includes("-->"));
    if (!tsLine) continue;
    const [startRaw, endRaw] = tsLine.split("-->").map((s) => s.trim());
    const startMs = parseTimestamp(startRaw);
    const endMs = parseTimestamp(endRaw);
    const text = stripTags(lines.slice(lines.indexOf(tsLine) + 1).join(" "));
    if (text && Number.isFinite(startMs) && Number.isFinite(endMs)) segments.push({ startMs, endMs, text });
  }
  return segments;
}

export function segmentsToText(segments) {
  return segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}

export function wordCount(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

const STOPWORDS = new Set(["this","that","with","from","your","their","have","about","what","when","where","which","there","these","those","into","over","under","than","they","them","will","would","could","should","after","before","while"]);

/** Distinctive (non-trivial) words from a title: lowercase, length >= 4, not a stopword, de-duplicated. */
export function distinctiveTitleWords(title) {
  const words = String(title).toLowerCase().match(/[a-z0-9']+/g) || [];
  return [...new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.has(w)))];
}

/**
 * Validates a transcript against the rules in the ffx-transcript skill:
 * word count >= 200, last timestamp within 10% of video duration, and at least
 * min(5, available) distinctive title words appear somewhere in the transcript text.
 */
export function validateTranscript({ segments, videoDurationSec, title, expectedLanguage, actualLanguage }) {
  const notes = [];
  const text = segmentsToText(segments);
  const wc = wordCount(text);
  if (wc < 200) notes.push(`word count ${wc} is below the 200 minimum`);

  const lastEndMs = segments.length ? Math.max(...segments.map((s) => s.endMs)) : 0;
  const videoDurationMs = videoDurationSec * 1000;
  const tolerance = videoDurationMs * 0.10;
  const matchesVideoDuration = videoDurationMs > 0 && Math.abs(lastEndMs - videoDurationMs) <= tolerance;
  if (!matchesVideoDuration) notes.push(`last caption at ${Math.round(lastEndMs / 1000)}s vs video duration ${videoDurationSec}s (outside 10% tolerance)`);

  const titleWords = distinctiveTitleWords(title);
  const need = Math.min(5, titleWords.length);
  const lowerText = text.toLowerCase();
  const found = titleWords.filter((w) => lowerText.includes(w));
  const titleWordsOk = found.length >= need;
  if (!titleWordsOk) notes.push(`only ${found.length}/${need} distinctive title words found in transcript (title words: ${titleWords.join(", ") || "none"})`);

  if (expectedLanguage && actualLanguage && expectedLanguage !== actualLanguage) notes.push(`language mismatch: expected ${expectedLanguage}, got ${actualLanguage}`);

  return {
    matchesVideoDuration,
    wordCount: wc,
    titleWordsFound: found.length,
    titleWordsNeeded: need,
    ok: wc >= 200 && matchesVideoDuration && titleWordsOk && (!expectedLanguage || !actualLanguage || expectedLanguage === actualLanguage),
    notes,
  };
}
