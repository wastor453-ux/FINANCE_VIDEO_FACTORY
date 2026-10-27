// Cross-artifact lint rules that JSON Schema cannot express.

/** @returns {string[]} problems (empty = clean) */
export function lintScenePlan(plan, modeSchema, voiceManifest, fps = 30) {
  const problems = [];
  const modeIds = new Set(modeSchema.modes.map((m) => m.id));
  const scenes = plan.scenes;

  scenes.forEach((s, i) => {
    if (!modeIds.has(s.mode)) problems.push(`${s.id}: unknown visual mode "${s.mode}"`);
    if (s.endFrame <= s.startFrame) problems.push(`${s.id}: endFrame must be > startFrame`);
    const prev = scenes[i - 1];
    if (i === 0 && s.startFrame !== 0) problems.push(`${s.id}: first scene must start at frame 0`);
    if (prev && s.startFrame !== prev.endFrame) problems.push(`${s.id}: starts at ${s.startFrame} but previous scene ends at ${prev.endFrame} (gap or overlap)`);
    for (const e of s.events) {
      if (e.frame < s.startFrame || e.frame >= s.endFrame) problems.push(`${s.id}: event "${e.type}" at frame ${e.frame} is outside the scene [${s.startFrame}, ${s.endFrame})`);
    }
    if (s.usesCharacter) problems.push(`${s.id}: the thumbnail character must never appear inside the video`);
    if (s.onScreenText.some((t) => t.length > 90)) problems.push(`${s.id}: on-screen text line over 90 chars is unreadable on mobile`);
  });

  if (scenes.length && plan.totalFrames !== scenes[scenes.length - 1].endFrame)
    problems.push(`totalFrames ${plan.totalFrames} != last scene endFrame ${scenes[scenes.length - 1].endFrame}`);

  const ids = scenes.map((s) => s.id);
  if (new Set(ids).size !== ids.length) problems.push("scene ids are not unique");

  // consecutive repetition makes a video feel templated
  for (let i = 2; i < scenes.length; i++) {
    if (scenes[i].mode === scenes[i - 1].mode && scenes[i].mode === scenes[i - 2].mode)
      problems.push(`${scenes[i].id}: mode "${scenes[i].mode}" used three scenes in a row`);
  }

  if (voiceManifest) {
    const vIds = voiceManifest.scenes.map((s) => s.sceneId);
    for (const id of ids) if (!vIds.includes(id)) problems.push(`${id}: no voiceover file in voice manifest`);
    for (const id of vIds) if (!ids.includes(id)) problems.push(`${id}: voiceover exists but scene is missing in plan`);
    const planMs = Math.round((plan.totalFrames / fps) * 1000);
    if (Math.abs(planMs - voiceManifest.totalMs) > (2 / fps) * 1000 + 500)
      problems.push(`plan length ${planMs}ms differs from narration ${voiceManifest.totalMs}ms by more than a 0.5s outro allowance`);
  }
  return problems;
}

/** Script rule: every claim must cite at least one declared source; numbers in narration need a claim. */
export function lintScript(script) {
  const problems = [];
  const sourceIds = new Set(script.sources.map((s) => s.id));
  for (const sc of script.scenes) {
    for (const c of sc.claims) {
      for (const id of c.sourceIds) if (!sourceIds.has(id)) problems.push(`${sc.id}/${c.id}: cites unknown source "${id}"`);
    }
    const hasDigitsOrMoney = /\d|\b(percent|million|billion|thousand|dollars?)\b/i.test(sc.narration);
    if (hasDigitsOrMoney && sc.claims.length === 0) problems.push(`${sc.id}: narration contains figures but declares no claims/sources`);
    if (/guaranteed (returns?|profit)|can'?t lose|risk[- ]free returns?/i.test(sc.narration)) problems.push(`${sc.id}: forbidden guaranteed-return language`);
  }
  return problems;
}
