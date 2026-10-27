// Chunk planning and coverage verification for the GitHub chunked render.
// Frame/second maths uses exact integers (no truncation): audio offsets are expressed
// in microseconds derived from frames, so a 1-frame error can never hide in rounding.

export function planChunks(start, end, size) {
  for (const [n, v] of [["start", start], ["end", end], ["size", size]]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${n} must be a non-negative integer`);
  }
  if (size < 1) throw new Error("size must be >= 1");
  if (end < start) throw new Error("end must be >= start");
  const chunks = [];
  let id = 0;
  for (let s = start; s <= end; s += size, id++) {
    chunks.push({ chunk_id: id, start: s, end: Math.min(s + size - 1, end) });
  }
  return chunks;
}

/** Throws unless chunk metas are contiguous, ordered and cover exactly [start, end]. */
export function verifyCoverage(metas, start, end, size) {
  if (!metas.length) throw new Error("no chunk metadata found");
  const sorted = [...metas].sort((a, b) => a.chunk_id - b.chunk_id);
  let expectedStart = start;
  sorted.forEach((m, i) => {
    if (m.chunk_id !== i) throw new Error(`chunk ids not contiguous: expected ${i}, got ${m.chunk_id}`);
    const expectedEnd = Math.min(expectedStart + size - 1, end);
    if (m.start !== expectedStart || m.end !== expectedEnd)
      throw new Error(`coverage gap/overlap at chunk ${i}: got ${m.start}-${m.end}, expected ${expectedStart}-${expectedEnd}`);
    expectedStart = m.end + 1;
  });
  if (expectedStart !== end + 1) throw new Error(`coverage ends at ${expectedStart - 1}, expected ${end}`);
  return true;
}

/** frames -> integer microseconds, rounded to nearest (never truncated). */
export function framesToMicros(frames, fps) {
  if (!(fps > 0)) throw new Error("fps must be > 0");
  return Math.round((frames * 1_000_000) / fps);
}

/** microseconds -> ffmpeg time string with 6 decimals */
export function microsToTime(us) {
  return (us / 1_000_000).toFixed(6);
}

/** Audio segment matching a frame range [start, end] inclusive. */
export function audioSegment(startFrame, endFrame, fps) {
  const startUs = framesToMicros(startFrame, fps);
  const endUs = framesToMicros(endFrame + 1, fps);
  return { start: microsToTime(startUs), duration: microsToTime(endUs - startUs), frames: endFrame - startFrame + 1 };
}
