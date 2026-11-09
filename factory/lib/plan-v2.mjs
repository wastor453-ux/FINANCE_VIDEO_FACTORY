// Scene plan v2 lint: scenes > beats > typed events, checked against the motion vocabulary
// (config/motion_recipes.json), the visual modes, the active style pack and (optionally) the voice manifest and script.
// Pure function: returns { errors, warnings }. Errors block G3; warnings are reported to the owner.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Duration range in seconds for a recipe: from the style pack when it has a packKey, else from the vocabulary. */
export function recipeRange(recipe, pack) {
  if (recipe.packKey) { const r = pack?.motion?.durationSec?.[recipe.packKey]; if (!r) throw new Error(`style pack has no motion.durationSec.${recipe.packKey}`); return r; }
  return recipe.sec;
}

export function lintPlanV2(plan, ctx) {
  const { recipes: V, modes, pack, voice, script, renderable } = ctx;
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  const fps = plan.fps, lim = V.limits, lead = pack.motion.leadFrames;
  const modeIds = new Set(modes.modes.map((m) => m.id));
  const bgIds = new Set(pack.backgrounds.items.map((b) => b.id));

  if (plan.style.packId !== pack.id) E(`plan uses style pack "${plan.style.packId}" but the loaded pack is "${pack.id}"`);
  if (!bgIds.has(plan.style.background)) E(`unknown background "${plan.style.background}"`);

  const scenes = plan.scenes, beatIds = [];
  const allBeats = [];
  scenes.forEach((s, i) => {
    if (s.endFrame <= s.startFrame) E(`${s.id}: endFrame must be after startFrame`);
    if (i === 0 && s.startFrame !== 0) E(`${s.id}: first scene must start at frame 0`);
    if (i > 0 && s.startFrame !== scenes[i - 1].endFrame) E(`${s.id}: starts at ${s.startFrame} but the previous scene ends at ${scenes[i - 1].endFrame}`);
    s.beats.forEach((b, j) => {
      allBeats.push({ scene: s, beat: b });
      beatIds.push(b.id);
      if (j === 0 && b.startFrame !== s.startFrame) E(`${b.id}: first beat must start with its scene (${s.startFrame})`);
      if (j > 0 && b.startFrame !== s.beats[j - 1].endFrame) E(`${b.id}: gap or overlap with the previous beat`);
      if (j === s.beats.length - 1 && b.endFrame !== s.endFrame) E(`${b.id}: last beat must end with its scene (${s.endFrame})`);
    });
  });
  if (new Set(scenes.map((s) => s.id)).size !== scenes.length) E("scene ids are not unique");
  if (new Set(beatIds).size !== beatIds.length) E("beat ids are not unique");
  if (plan.totalFrames !== scenes[scenes.length - 1].endFrame) E(`totalFrames ${plan.totalFrames} != last scene endFrame ${scenes[scenes.length - 1].endFrame}`);

  const primaryOf = [];
  for (const { scene, beat: b } of allBeats) {
    const at = (m) => `${b.id}: ${m}`;
    if (b.endFrame <= b.startFrame) { E(at("endFrame must be after startFrame")); continue; }
    if (!modeIds.has(b.mode)) E(at(`unknown visual mode "${b.mode}"`));
    if (renderable && !renderable[b.mode]) E(at(`mode "${b.mode}" has no verified renderer yet (config/components.json), so this plan cannot be rendered`));
    const modeV = V.modes[b.mode];
    if (!modeV) E(at(`mode "${b.mode}" has no entry in motion_recipes.json`));
    if (b.background && !bgIds.has(b.background)) E(at(`unknown background "${b.background}"`));
    if (b.transitionIn && !V.transitions.includes(b.transitionIn.type)) E(at(`unknown transition "${b.transitionIn.type}"`));
    if (b.usesCharacter) E(at("the thumbnail character must never appear inside the video"));
    if (b.onScreenText.some((t) => t.length > 90)) E(at("on-screen text line over 90 characters"));
    if (modeV) {
      if (b.data.length < (modeV.minData ?? 0)) E(at(`mode ${b.mode} needs at least ${modeV.minData} data point(s), has ${b.data.length}`));
      if (modeV.maxData !== undefined && b.data.length > modeV.maxData) E(at(`mode ${b.mode} takes at most ${modeV.maxData} data points, has ${b.data.length}`));
    }
    // every number on screen must be backed by a data point
    const dataNums = new Set(b.data.flatMap((d) => String(d.value).replace(/[$,%\s]/g, "").split(/[^0-9.]+/).filter(Boolean)));
    for (const t of b.onScreenText) for (const n of (t.replace(/[$,]/g, "").match(/\d+(\.\d+)?/g) || [])) if (!dataNums.has(n)) E(at(`number "${n}" in on-screen text "${t}" has no matching data point (source and as-of date required)`));

    const allowed = new Set([...(modeV?.recipes || []), ...V.alwaysAllowed]);
    const heavy = [], moving = [], starts = [], cover = [];
    let primaryRecipe = null, hasPrimary = false;
    const ids = new Set();
    for (const ev of b.events) {
      const ea = (m) => `${b.id}/${ev.id}: ${m}`;
      if (ids.has(ev.id)) E(ea("duplicate event id")); ids.add(ev.id);
      const rc = V.recipes[ev.recipe];
      if (!rc) { E(ea(`unknown recipe "${ev.recipe}" (not in the motion vocabulary)`)); continue; }
      if (!allowed.has(ev.recipe)) E(ea(`recipe ${ev.recipe} is not allowed in mode ${b.mode}`));
      const exit = ev.exitFrame ?? ev.holdUntilFrame;
      if (ev.startFrame < b.startFrame) E(ea("starts before its beat"));
      if (!(ev.endFrame > ev.startFrame && ev.holdUntilFrame >= ev.endFrame && exit >= ev.holdUntilFrame && exit <= b.endFrame)) E(ea(`frames must satisfy start < end <= holdUntil <= exit <= beat end (${ev.startFrame}, ${ev.endFrame}, ${ev.holdUntilFrame}, ${exit}, ${b.endFrame})`));
      const dur = (ev.endFrame - ev.startFrame) / fps, [lo, hi] = recipeRange(rc, pack);
      if (dur < lo - 1 / fps || dur > hi + 1 / fps) E(ea(`${ev.recipe} lasts ${dur.toFixed(2)} s, allowed ${lo}-${hi} s`));
      if (!rc.exemptFromMoveCap && dur > V.limits.maxMoveSec + 1 / fps) E(ea(`element move ${dur.toFixed(2)} s exceeds ${V.limits.maxMoveSec} s`));
      if (!V.easings.includes(ev.ease)) E(ea(`unknown easing "${ev.ease}" (custom curves are not allowed)`));
      else if (ev.ease === "linear" && rc.ease !== "linear") E(ea("linear easing is only for linear recipes (timeline marker, ambient)"));
      const hold = (ev.holdUntilFrame - ev.endFrame) / fps;
      if (hold < rc.holdAfterSec - 1 / fps) E(ea(`${ev.recipe} must stay visible ${rc.holdAfterSec} s after it settles, has ${hold.toFixed(2)} s`));
      if (rc.readsText) {
        if (!ev.params?.words) E(ea("text events must declare params.words"));
        else { const need = lim.readSecPerWord * ev.params.words + lim.readSecBase; if (hold < need - 1 / fps) E(ea(`${ev.params.words} words need ${need.toFixed(1)} s to read, hold is ${hold.toFixed(2)} s`)); }
      }
      if (ev.params?.dataRef !== undefined && ev.params.dataRef >= b.data.length) E(ea(`dataRef ${ev.params.dataRef} is outside this beat's data`));
      if (ev.role === "primary") { hasPrimary = true; if (!rc.primaryCapable) E(ea(`${ev.recipe} cannot be a primary event`)); else if (!primaryRecipe) primaryRecipe = ev.recipe; }
      if (ev.role === "ambient" && !rc.ambient) E(ea("only ambient recipes may have role ambient"));
      if (rc.ambient && ev.role !== "ambient") E(ea("ambient recipes must have role ambient"));
      if (ev.anchor) {
        if (ev.anchor.confidence === "ok") { const want = Math.round((ev.anchor.startMs * fps) / 1000) - lead; if (Math.abs(ev.startFrame - want) > 1) E(ea(`starts at frame ${ev.startFrame} but anchor word "${ev.anchor.word ?? ev.anchor.wordIndex}" calls for ${want} (${lead} frames before the word)`)); }
        else if (!ev.anchor.fallback) E(ea("a low-confidence anchor must be marked fallback: true so it is reported"));
      }
      const isCameraOrAmbient = rc.family === "camera" || rc.family === "ambient";
      if (rc.heavy) heavy.push(ev);
      if (!rc.ambient && !isCameraOrAmbient) moving.push(ev);
      if (!rc.ambient) starts.push(ev.startFrame);
      if (isCameraOrAmbient) cover.push([ev.startFrame, ev.endFrame]);
    }
    if (!hasPrimary) E(at("a beat needs at least one primary event"));
    primaryOf.push(primaryRecipe);
    heavy.sort((x, y) => x.startFrame - y.startFrame);
    for (let i = 1; i < heavy.length; i++) if (heavy[i].startFrame < Math.max(...heavy.slice(0, i).map((h) => h.endFrame))) E(at(`heavy events ${heavy[i - 1].id} and ${heavy[i].id} overlap (two attention-holding moves at once)`));
    // concurrency of simultaneously moving elements
    const edges = moving.flatMap((e) => [[e.startFrame, 1], [e.endFrame, -1]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let cur = 0, peak = 0; for (const [, d] of edges) { cur += d; peak = Math.max(peak, cur); }
    if (peak > lim.maxConcurrentMoves) E(at(`${peak} elements move at the same time (max ${lim.maxConcurrentMoves})`));
    // something must change or move at least every maxSecBetweenEventStarts
    const marks = [b.startFrame, ...starts.sort((p, q) => p - q), b.endFrame], cap = lim.maxSecBetweenEventStarts * fps;
    for (let i = 1; i < marks.length; i++) {
      const gap = marks[i] - marks[i - 1]; if (gap <= cap) continue;
      const covered = cover.some(([s0, s1]) => s0 <= marks[i - 1] + 1 && s1 >= marks[i] - 1);
      if (!covered) (gap > cap * 1.6 ? E : W)(at(`${(gap / fps).toFixed(1)} s with no new event, camera move or ambient motion (frames ${marks[i - 1]}-${marks[i]})`));
    }
  }

  // anchors: share of low-confidence per scene
  for (const s of scenes) {
    const anchored = s.beats.flatMap((b) => b.events.filter((e) => e.anchor));
    if (anchored.length >= 4) { const low = anchored.filter((e) => e.anchor.confidence !== "ok").length / anchored.length; if (low > lim.lowConfidenceShareWarn) W(`${s.id}: ${(low * 100).toFixed(0)}% of anchors are low confidence (limit ${lim.lowConfidenceShareWarn * 100}%)`); }
  }
  // repetition rules
  for (let i = 2; i < allBeats.length; i++) {
    const [a, b, c] = [allBeats[i - 2].beat, allBeats[i - 1].beat, allBeats[i].beat];
    if (a.mode === b.mode && b.mode === c.mode) E(`${c.id}: mode "${c.mode}" used in three beats in a row`);
    if (primaryOf[i] && primaryOf[i] === primaryOf[i - 1] && primaryOf[i] === primaryOf[i - 2]) E(`${c.id}: primary recipe "${primaryOf[i]}" used in three beats in a row`);
    const t = [a, b, c].map((x) => x.transitionIn?.type);
    if (t[0] && t[0] !== "none" && t[0] === t[1] && t[1] === t[2]) E(`${c.id}: transition "${t[0]}" used three times in a row`);
  }
  const trans = allBeats.map((x) => x.beat.transitionIn?.type).filter((t) => t && t !== "none");
  if (trans.length >= lim.transitionShareMinCount) { const counts = {}; trans.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); for (const [t, n] of Object.entries(counts)) if (n / trans.length > lim.transitionMaxShare) W(`transition "${t}" is ${(n / trans.length * 100).toFixed(0)}% of all transitions (limit ${lim.transitionMaxShare * 100}%)`); }

  if (voice) {
    const vIds = voice.scenes.map((s) => s.sceneId);
    for (const s of scenes) if (!vIds.includes(s.id)) E(`${s.id}: no voiceover file in the voice manifest`);
    for (const id of vIds) if (!scenes.some((s) => s.id === id)) E(`${id}: voiceover exists but the scene is missing in the plan`);
    const planMs = Math.round((plan.totalFrames / fps) * 1000);
    if (Math.abs(planMs - voice.totalMs) > (2 / fps) * 1000 + 500) E(`plan length ${planMs} ms differs from narration ${voice.totalMs} ms by more than a 0.5 s outro allowance`);
  }
  if (script) {
    const sb = new Map(script.scenes.map((s) => [s.id, new Set((s.beats || []).map((b) => b.id))]));
    for (const s of scenes) { const want = sb.get(s.id); if (!want) { E(`${s.id}: scene is not in the script`); continue; } for (const b of s.beats) if (!want.has(b.id)) E(`${b.id}: beat is not in script scene ${s.id}`); for (const id of want) if (!s.beats.some((b) => b.id === id)) E(`${s.id}: script beat ${id} has no plan beat`); }
  }
  return { errors, warnings };
}
