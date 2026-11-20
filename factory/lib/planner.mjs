// Planner: compiles an approved script + voice word timing + a per-beat DESIGN file into a scene plan v2.
// Creative choices (visual mode, on-screen labels, which spoken words cue each step, chart numbers taken from verified claims)
// live in the design file and are checked by `ffx lint-plan`; everything mechanical (frames, anchors, events, holds, transitions) is computed here.
// Deterministic: same inputs, same plan. Nothing is guessed: an unknown cue phrase or a beat with no design is an error, never a silent fallback.

import { loadRegistry, chooseVariant, newHistory, record } from "./registry.mjs";
const norm = (t) => t.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
export const TRANSITION_CYCLE = ["clean_wipe", "card_to_chart_zoom", "shape_mask"];
const TRANSITION_SEC = { clean_wipe: 0.5, card_to_chart_zoom: 0.6, shape_mask: 0.6 };

/** Flatten a scene's narration into tokens with timing, split per beat; throws when script words and timing words disagree. */
export function alignScene(scriptScene, voiceScene, timing) {
  const words = timing.words;
  const beats = []; let k = 0;
  for (const b of scriptScene.beats) {
    const toks = b.narration.split(/\s+/).filter(Boolean);
    const slice = words.slice(k, k + toks.length);
    if (slice.length !== toks.length) throw new Error(`${b.id}: narration has ${toks.length} words but only ${slice.length} timed words are left in ${scriptScene.id}`);
    toks.forEach((t, i) => { if (norm(t).join("") !== norm(slice[i].word).join("")) throw new Error(`${b.id}: word ${i} "${t}" does not match timing word "${slice[i].word}"`); });
    beats.push({ id: b.id, toks, words: slice.map((w, i) => ({ ...w, index: k + i, absMs: Math.round(voiceScene.startMs + w.startSec * 1000), endAbsMs: Math.round(voiceScene.startMs + w.endSec * 1000) })) });
    k += toks.length;
  }
  if (k !== words.length) throw new Error(`${scriptScene.id}: timing has ${words.length} words, script beats use ${k}`);
  return beats;
}

/** Find a cue phrase inside a beat's words (first occurrence). */
export function findCue(beatWords, phrase, where) {
  const want = norm(phrase); if (!want.length) throw new Error(`${where}: empty cue`);
  const have = beatWords.map((w) => norm(w.word).join(""));
  for (let i = 0; i + want.length <= have.length; i++) if (want.every((x, j) => have[i + j] === x.replace(/\s/g, ""))) return beatWords[i];
  throw new Error(`${where}: cue "${phrase}" is not spoken in this beat`);
}

export function compilePlan({ script, voice, timings, design, pack, recipes, scenes: only, blockedWords = [], registry = loadRegistry() }) {
  const history = newHistory(), decisions = [], brief = design.brief ?? {};
  const fps = pack.motion.fps ?? 30, lead = pack.motion.leadFrames, frame = (ms) => Math.round((ms * fps) / 1000);
  const notes = [], errors = []; let curScene = "";
  const ids = only ?? script.scenes.map((s) => s.id);
  const originMs = voice.scenes.find((s) => s.sceneId === ids[0]).startMs;
  const rel = (ms) => ms - originMs;
  const tByScene = new Map(timings.map((t) => [t.sceneId, t]));
  const dur = (name, sec) => { const r = recipes.recipes[name]; const rg = r.packKey ? pack.motion.durationSec[r.packKey] : r.sec; return Math.min(rg[1], Math.max(rg[0], sec)); };
  const df = (name, sec) => Math.round(dur(name, sec) * fps);
  const hold = (name) => Math.ceil(recipes.recipes[name].holdAfterSec * fps);

  // 1. align every beat to its spoken words
  const sceneBeats = ids.map((id) => {
    const sc = script.scenes.find((s) => s.id === id), vs = voice.scenes.find((s) => s.sceneId === id), tm = tByScene.get(id);
    if (!sc || !vs || !tm) throw new Error(`${id}: missing in script, voice manifest or word timings`);
    return { sc, vs, beats: alignScene(sc, vs, tm) };
  });

  // 2. scene boundaries: a scene's visuals start early enough that its entry transition ends as the first word is cued
  const sceneStart = [], wordFrame = (w) => frame(rel(w.absMs));
  sceneBeats.forEach((s, i) => {
    if (i === 0) { sceneStart.push(0); return; }
    const type = TRANSITION_CYCLE[(i - 1) % TRANSITION_CYCLE.length], d = Math.round(TRANSITION_SEC[type] * fps);
    const prevEnd = frame(rel(sceneBeats[i - 1].beats.at(-1).words.at(-1).endAbsMs)), want = wordFrame(s.beats[0].words[0]) - lead - d;
    const b = Math.max(want, prevEnd + 2);
    if (b > want) notes.push(`${s.sc.id}: only ${want - prevEnd + d - 2} frames of silence before the first word, entry transition overlaps the first cue`);
    sceneStart.push(b);
  });
  const lastV = sceneBeats.at(-1).vs, totalFrames = frame(rel(lastV.startMs + lastV.durationMs));
  const outScenes = [];

  sceneBeats.forEach((s, si) => {
    const sStart = sceneStart[si], sEnd = si + 1 < sceneBeats.length ? sceneStart[si + 1] : totalFrames;
    const starts = s.beats.map((b, bi) => bi === 0 ? sStart : wordFrame(b.words[0]) - lead);
    const beats = s.beats.map((b, bi) => {
      const d = design.beats[b.id], at = (m) => `${b.id}: ${m}`;
      if (!d) { errors.push(at("no design for this beat")); return null; }
      const start = starts[bi], end = bi + 1 < starts.length ? starts[bi + 1] : sEnd;
      try { return buildBeat({ b, d, start, end, si, bi }); } catch (e) { errors.push(e.message); return null; }
    });
    outScenes.push({ id: s.sc.id, startFrame: sStart, endFrame: sEnd, beats: beats.filter(Boolean) });
  });
  if (errors.length) { const e = new Error(`planner: ${errors.length} problem(s):\n- ${errors.join("\n- ")}`); e.problems = errors; throw e; }

  function anchorOf(w, role) {
    const blocked = blockedWords.some((x) => x.sceneId === curScene && Math.abs(x.startSec - w.startSec) < 0.05 && norm(x.word).join("") === norm(w.word).join(""));
    const ok = !blocked; // interpolated number words were checked clean in the timing report; only listed words are distrusted
    return { wordIndex: w.index, word: w.word.replace(/[^\w'’$%-]/g, ""), startMs: Math.round(rel(w.absMs)), confidence: ok ? "ok" : "low", ...(ok ? {} : { fallback: true }) };
  }

  function buildBeat({ b, d, start, end, si, bi }) {
    curScene = sceneBeats[si].sc.id;
    const at = (m) => `${b.id}: ${m}`, len = end - start;
    const cue = (phrase, label) => { const w = findCue(b.words, phrase, at(label)); return { w, frame: Math.max(start, wordFrame(w) - lead) }; };
    const evs = []; let n = 0; const id = () => `e${++n}`;
    const push = (recipe, role, s0, s1, holdTo, extra = {}) => evs.push({ id: id(), recipe, role, startFrame: s0, endFrame: s1, holdUntilFrame: holdTo, exitFrame: end, ease: recipes.recipes[recipe].ease, ...extra });
    // place an event so it finishes and holds before the beat ends (late cues are pulled earlier, never dropped)
    const place = (recipe, c, seconds, minStart = start) => {
      const d1 = df(recipe, seconds), h = hold(recipe); let s0 = Math.max(c.frame, minStart);
      if (s0 + d1 + h > end) { const pulled = Math.max(minStart, end - d1 - h); if (pulled < s0) notes.push(at(`${recipe} cue "${c.w.word}" pulled ${s0 - pulled} frames earlier to leave ${(h / fps).toFixed(1)} s of hold`)); s0 = pulled; }
      if (s0 + d1 + h > end) throw new Error(at(`beat is too short (${len} frames) for ${recipe} plus its hold`));
      return [s0, s0 + d1];
    };
    const items = d.content?.items ?? [];
    const sequential = (recipe, role, secs, extraFor, list = items, minStart = start) => {
      const readH = recipes.recipes[recipe].readsText ? Math.max(...list.map((it) => Math.ceil((recipes.limits.readSecPerWord * norm(`${it.label} ${it.sub ?? ""}`).length + recipes.limits.readSecBase) * fps))) : 0;
      const h = Math.max(hold(recipe), readH), cues = list.map((_, i) => cue(d.cues?.[i] ?? (() => { throw new Error(at(`item ${i} needs a cue phrase`)); })(), `item ${i}`));
      const lo = df(recipe, 0), nominal = df(recipe, secs);
      // try the nominal move length first; if the steps would have to start noticeably before their spoken cue, use the shortest allowed move
      const attempt = (d1) => {
        const latest = []; for (let i = list.length - 1; i >= 0; i--) latest[i] = Math.min(end - d1 - h, i + 1 < list.length ? latest[i + 1] - d1 : Infinity);
        let floor = minStart; const starts = [];
        for (let i = 0; i < list.length; i++) { if (latest[i] < floor) return null; const s0 = Math.min(Math.max(cues[i].frame, floor), latest[i]); starts.push(s0); floor = s0 + d1; }
        return { d1, starts, pull: Math.max(...starts.map((s0, i) => cues[i].frame - s0), 0) };
      };
      let r = attempt(nominal); if (!r || r.pull > 8) { const r2 = attempt(lo); if (r2 && (!r || r2.pull < r.pull)) r = r2; }
      if (!r) throw new Error(at(`beat is too short (${len} frames) for ${list.length} sequential steps plus the ${(h / fps).toFixed(1)} s hold`));
      list.forEach((it, i) => {
        if (r.starts[i] < cues[i].frame) notes.push(at(`${recipe} item ${i} starts ${cues[i].frame - r.starts[i]} frames before its cue "${cues[i].w.word}" to fit the beat`));
        push(recipe, role, r.starts[i], r.starts[i] + r.d1, end, { params: { item: i, ...(extraFor ? extraFor(it) : {}) }, anchor: anchorOf(cues[i].w) });
      });
    };
    const mode = d.mode;
    if (mode === "process_flow") sequential("process_flow_build", "primary", 1.0);
    else if (mode === "causal_diagram") sequential("flow_arrows", "primary", 1.0);
    else if (mode === "action_checklist" || mode === "risks_grid") sequential("checklist_build", "primary", 0.7, (it) => ({ words: norm(`${it.label} ${it.sub ?? ""}`).length }));
    else if (mode === "annotation_callout") {
      const it = items[0], c = cue(d.cues?.[0] ?? "", "callout reveal");
      const [r0, r1] = place("text_reveal_line", c, 0.5);
      const w = norm(it.label).length, readNeed = Math.ceil((recipes.limits.readSecPerWord * w + recipes.limits.readSecBase) * fps);
      const cardStart = Math.max(start, r0 - df("callout_in", 0.3));
      push("callout_in", "secondary", cardStart, cardStart + df("callout_in", 0.3), end, {});
      push("text_reveal_line", "primary", r0, r1, Math.min(end, Math.max(r1 + readNeed, r1 + 1)), { params: { words: w }, anchor: anchorOf(c.w) });
      if (it.mark) { const m = cue(d.markCue ?? it.mark, "highlight"), [h0, h1] = place("highlight", m, 0.6, r1); push("highlight", "secondary", h0, h1, end, { anchor: anchorOf(m.w) }); }
    } else if (mode === "bar_chart") {
      const a0 = start + 2, a1 = a0 + df("axes_in", 0.4);
      push("axes_in", "secondary", a0, a1, end, {});
      sequential("bar_rise", "primary", 0.7, () => ({}), d.data, a1);
      const last = evs.filter((e) => e.recipe === "bar_rise").at(-1), g0 = last.endFrame, g1 = g0 + df("legend_in", 0.4);
      if (g1 < end) push("legend_in", "secondary", g0, g1, end, {});
    } else if (mode === "line_chart") {
      const a0 = start + 2, a1 = a0 + df("axes_in", 0.4);
      push("axes_in", "secondary", a0, a1, end, {});
      const c = cue(d.cues?.[0] ?? "", "line draw"), [l0, l1] = place("line_draw", c, 1.2, a1);
      push("line_draw", "primary", l0, l1, end, { anchor: anchorOf(c.w) });
      const pd = df("pill_in", 0.3); if (l1 + pd + hold("pill_in") <= end) push("pill_in", "secondary", l1, l1 + pd, end, {});
    } else if (mode === "hero_number") {
      const c = cue(d.cues?.[0] ?? "", "count up"), [u0, u1] = place("count_up", c, 0.8); push("count_up", "primary", u0, u1, end, { anchor: anchorOf(c.w) });
      if (d.data?.[0]?.delta) { const [p0, p1] = [u1, u1 + df("pill_in", 0.3)]; push("pill_in", "secondary", p0, p1, end, {}); }
    } else throw new Error(at(`mode "${mode}" has no planner rule yet`));

    // anchors must describe the real start: an event moved away from its spoken word is reported as a low-confidence (fallback) anchor
    for (const e of evs) if (e.anchor?.confidence === "ok" && Math.abs(e.startFrame - (Math.round((e.anchor.startMs * fps) / 1000) - lead)) > 1) { e.anchor.confidence = "low"; e.anchor.fallback = true; }
    // camera push: starts with the beat, unless a long static stretch needs it more (nothing may stay still longer than the limit)
    if (len >= 2 * fps) {
      const cap = recipes.limits.maxSecBetweenEventStarts * fps, marks = [start, ...evs.map((e) => e.startFrame).sort((x, y) => x - y), end];
      const gaps = []; for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > cap) gaps.push([marks[i - 1], marks[i]]);
      const maxLen = Math.round(6 * fps); let c0 = start;
      if (gaps.length) { c0 = Math.max(start, gaps[0][0]); if (gaps.at(-1)[1] - c0 > maxLen) notes.push(at(`a static stretch of ${((gaps.at(-1)[1] - c0) / fps).toFixed(1)} s cannot be covered by one camera push; the beat needs more cues`)); }
      const c1 = Math.min(end, c0 + maxLen); if (c1 - c0 >= 2 * fps) push("camera_push", "secondary", c0, c1, c1, { exitFrame: end });
    }
    // layout variant: chosen by the art director from the variant registry (design file may lock one); the reason is logged
    const dp0 = d.data?.[0], pick = chooseVariant(registry, { mode, dp: dp0, nItems: d.content?.items?.length, beatId: b.id, history, brief, seed: design.seed ?? "", locked: d.variant });
    const variant = pick.variant; record(history, mode, variant);
    decisions.push({ beat: b.id, mode, variant: variant ?? "default", reason: pick.reason, candidates: pick.candidates });
    const beat = { id: b.id, startFrame: start, endFrame: end, mode, purpose: d.purpose ?? b.id, usesCharacter: false, onScreenText: d.title ? [d.title] : [], data: d.data ?? [], events: evs, ...(variant ? { variant } : {}) };
    if (d.content) beat.content = d.content;
    if (bi === 0 && si > 0) { const type = TRANSITION_CYCLE[(si - 1) % TRANSITION_CYCLE.length]; beat.transitionIn = { type, startFrame: start, endFrame: start + Math.round(TRANSITION_SEC[type] * fps) }; }
    return beat;
  }

  const plan = { schema_version: "2.0", fps, width: 1920, height: 1080, totalFrames, style: { packId: pack.id, background: design.background ?? pack.backgrounds.default }, scenes: outScenes };
  return { plan, notes, decisions };
}
