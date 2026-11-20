import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook, withAlpha } from "../style/StyleContext";
import { Beat, findEvent, local } from "./common";
import { Stage, useGlass, exitOf, SourceTile } from "./stage";
import { eased, lerp } from "../motion/math.mjs";
import { textOn } from "../motion/color.mjs";

/**
 * Modes process_flow, causal_diagram, annotation_callout. Content comes from beat.content = { headline?, items: [{label, sub?, mark?}] } (labels are checked against the narration by lint).
 *  process_flow   : 2-5 glass step cards in a row, numbered, connected by arrows that draw in.
 *  causal_diagram : causes stacked on the left converge on one effect card on the right.
 *  annotation_callout : one statement on a glass card; the marked phrase is highlighted by a sweep.
 * Events: one process_flow_build (or flow_arrows) event PER item, with params.item = index, so each step can appear on the word that names it
 *   (a single event without params.item staggers all items across its window); callout_in appears the callout card, highlight sweeps the marked phrase; camera_push. Frame-pure.
 */
export const DiagramScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame(), sc = l.pack.scene, c = l.color, S = c.series, gl = useGlass(), glass: React.CSSProperties = { ...gl.glass, boxSizing: "border-box" }, solid = gl.solid;
  const content: any = (beat as any).content;
  if (!content || !Array.isArray(content.items) || content.items.length === 0) throw new Error(`${beat.id}: mode ${beat.mode} needs beat.content.items`);
  const items: any[] = content.items, n = items.length;
  const isItem = (e: any) => (e.recipe === "process_flow_build" || e.recipe === "flow_arrows") && typeof e.params?.item === "number";
  const itemEvs: Record<number, any> = {};
  for (const e of beat.events.filter(isItem)) itemEvs[e.params.item] = local(beat, e);
  const callIn = beat.mode === "annotation_callout" ? findEvent(beat, "callout_in") : undefined;
  const build = callIn ?? findEvent(beat, "process_flow_build") ?? findEvent(beat, "flow_arrows") ?? Object.values(itemEvs)[0];
  if (!build) throw new Error(`${beat.id}: no build event (process_flow_build / flow_arrows per item, or callout_in)`);
  const perItem = Object.keys(itemEvs).length > 0;
  if (perItem) for (let i = 0; i < n; i++) if (!itemEvs[i]) throw new Error(`${beat.id}: item ${i} has no build event (params.item)`);
  const hi = findEvent(beat, "highlight"), reveal = findEvent(beat, "text_reveal_line"), cam = findEvent(beat, "camera_push");
  const camP = cam ? eased(l.pack, cam.ease, frame, cam.startFrame, cam.endFrame) : 0;
  const firstStart = perItem ? Math.min(...Object.values(itemEvs).map((e: any) => e.startFrame)) : build.startFrame;
  const exit = exitOf(l, build, frame);
  const settle = eased(l.pack, build.ease, frame, firstStart - Math.round(l.fps * 0.5), firstStart + Math.round(l.fps * 0.1));
  const title = content.headline ?? beat.onScreenText[0];
  const titleP = eased(l.pack, "ease-out", frame, Math.max(0, firstStart - Math.round(l.fps * 0.45)), firstStart);
  const dur = build.endFrame - build.startFrame, win = dur * 0.6, off = n > 1 ? (dur - win) / (n - 1) : 0;
  const prog = (i: number) => perItem ? eased(l.pack, itemEvs[i].ease, frame, itemEvs[i].startFrame, itemEvs[i].endFrame) : eased(l.pack, build.ease, frame, build.startFrame + i * off, build.startFrame + i * off + win);
  // arrow into item i: draws first, then the node settles (per-item) or follows the stagger
  const arrowP = (i: number) => perItem ? Math.min(1, prog(i) * 1.7) : eased(l.pack, build.ease, frame, build.startFrame + i * off, build.startFrame + i * off + win * 0.5);
  const nodeP = (i: number) => perItem && i > 0 ? Math.max(0, (prog(i) - 0.3) / 0.7) : prog(i);

  const chip = (i: number, size: number, p: number): React.ReactNode => (
    <div style={{ width: size, height: size, borderRadius: size, background: `linear-gradient(145deg, ${S[i % S.length].fill}, ${S[i % S.length].stroke})`, color: textOn([S[i % S.length].fill, S[i % S.length].stroke], c), fontFamily: l.font.display, fontWeight: 700, fontSize: size * 0.5, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 16px ${withAlpha(S[i % S.length].stroke, 0.35)}`, transform: `scale(${lerp(0.6, 1, p)})` }}>{i + 1}</div>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, p: number, key: string, color: string) => {
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI, head = 18, len = Math.hypot(x2 - x1, y2 - y1), t = Math.min(1, Math.max(0, p));
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len, ex = x1 + (x2 - x1) * t - ux * head * 1.2 * t, ey = y1 + (y2 - y1) * t - uy * head * 1.2 * t;
    return (
      <g key={key} opacity={t > 0 ? 1 : 0}>
        <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color} strokeWidth={5} strokeLinecap="round" />
        <g transform={`translate(${x1 + (x2 - x1) * t},${y1 + (y2 - y1) * t}) rotate(${ang})`} opacity={Math.min(1, t * 4)}>
          <polygon points={`${-head * 1.2},${-head * 0.7} 0,0 ${-head * 1.2},${head * 0.7}`} fill={color} />
        </g>
      </g>
    );
  };

  const calloutText = (text: string, mark: string | undefined, at: number, sweep: number): React.ReactNode => {
    const parts = at < 0 ? [{ t: text, m: false }] : [{ t: text.slice(0, at), m: false }, { t: mark!, m: true }, { t: text.slice(at + mark!.length), m: false }];
    const total = text.split(/\s+/).filter(Boolean).length; let k = 0;
    return parts.map((part, pi) => {
      const toks = part.t.split(/(\s+)/), nodes = toks.map((tok, ti) => {
        if (/^\s*$/.test(tok)) return tok;
        const idx = k++, w = reveal ? eased(l.pack, reveal.ease, frame, reveal.startFrame + Math.round(idx * (reveal.endFrame - reveal.startFrame) / Math.max(1, total) * 0.6), reveal.startFrame + Math.round(idx * (reveal.endFrame - reveal.startFrame) / Math.max(1, total) * 0.6) + Math.round((reveal.endFrame - reveal.startFrame) * 0.5)) : 1;
        return <span key={ti} style={{ display: "inline-block", opacity: w, transform: `translate3d(0, ${lerp(14, 0, w)}px, 0)` }}>{tok}</span>;
      });
      return part.m ? <span key={pi} style={{ backgroundImage: `linear-gradient(${withAlpha(S[1].fill, 0.45)}, ${withAlpha(S[1].fill, 0.45)})`, backgroundRepeat: "no-repeat", backgroundSize: `${sweep * 100}% 38%`, backgroundPosition: "0 88%", borderRadius: 6 }}>{nodes}</span> : <React.Fragment key={pi}>{nodes}</React.Fragment>;
    });
  };
  const fitSize = (text: string, inner: number) => [l.size.display, l.size.title, l.size.subtitle + 8, l.size.subtitle].find((z) => Math.ceil(text.length * 0.53 * z / inner) <= (z >= l.size.title ? 2 : 3)) ?? l.size.subtitle;
  const variant: string = (beat as any).variant ?? "default";

  let body: React.ReactNode = null;
  if (beat.mode === "process_flow" && variant === "vertical") {
    const gy = 22, rh = Math.min(150, (560 - (n - 1) * gy) / n), H = n * rh + (n - 1) * gy, top = 330 + (560 - H) / 2, railX = 250, cx = 360, cw = 1300, fs = rh >= 140 ? l.size.subtitle : l.size.body + 2, showSub = rh >= 120, cy = (i: number) => top + i * (rh + gy) + rh / 2;
    body = (<>
      <div style={{ position: "absolute", left: cx + 36, top: top - 24, width: cw, height: H + 48, ...glass, opacity: 0.45 * nodeP(0) * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
      {items.map((it, i) => { const p = nodeP(i); return (
        <div key={i} style={{ position: "absolute", left: cx, top: top + i * (rh + gy), width: cw, height: rh, ...solid, padding: "0 48px", opacity: p * exit, transform: `translateZ(${sc.layerZ.main + (i % 2) * 24}px) translate3d(${lerp(70, 0, p)}px, 0, 0)`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fs, lineHeight: 1.12, letterSpacing: "-0.01em", color: c.ink }}>{it.label}</div>
          {it.sub && showSub ? <div style={{ fontFamily: l.font.body, fontWeight: 500, fontSize: l.size.caption, lineHeight: 1.25, color: c.inkSecondary }}>{it.sub}</div> : null}
        </div>); })}
      {items.map((_, i) => <div key={`c${i}`} style={{ position: "absolute", left: railX - 30, top: cy(i) - 30, transform: `translateZ(${sc.layerZ.tile}px)`, opacity: nodeP(i) * exit }}>{chip(i, 60, nodeP(i))}</div>)}
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", transform: `translateZ(${sc.layerZ.tile}px)` }} width={1920} height={1080} viewBox="0 0 1920 1080">
        {items.slice(1).map((_, i) => arrow(railX, cy(i) + 40, railX, cy(i + 1) - 40, arrowP(i + 1) * exit, `v${i}`, S[i % S.length].stroke))}
      </svg>
    </>);
  } else if (beat.mode === "process_flow" && variant === "chevron") {
    const notch = 56, join = 14, top = 360, h = 340, sw = (1620 + (n - 1) * (notch - join)) / n, fs = n <= 3 ? l.size.subtitle : l.size.body + 2;
    const poly = (first: boolean) => first ? `polygon(0 0, ${sw - notch}px 0, ${sw}px 50%, ${sw - notch}px 100%, 0 100%)` : `polygon(0 0, ${sw - notch}px 0, ${sw}px 50%, ${sw - notch}px 100%, 0 100%, ${notch}px 50%)`;
    body = (<>
      {items.map((it, i) => { const p = nodeP(i), x = 150 + i * (sw - notch + join); return (
        <div key={i} style={{ position: "absolute", left: x, top, width: sw, height: h, opacity: p * exit, transform: `translateZ(${sc.layerZ.main + (n - i) * 6}px) translate3d(${lerp(-70, 0, p)}px, 0, 0)`, filter: `drop-shadow(0 20px 28px ${withAlpha(S[i % S.length].stroke, 0.22)})` }}>
          <div style={{ width: sw, height: h, boxSizing: "border-box", clipPath: poly(i === 0), background: `linear-gradient(160deg, ${withAlpha(c.surface, 0.98)} 35%, ${withAlpha(S[i % S.length].fill, 0.32)})`, padding: `34px ${notch + 14}px 34px ${i === 0 ? 40 : notch + 24}px`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            {chip(i, 64, p)}
            <div>
              <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fs, lineHeight: 1.12, letterSpacing: "-0.01em", color: c.ink, textWrap: "balance" as any }}>{it.label}</div>
              {it.sub && n <= 4 ? <div style={{ marginTop: 10, fontFamily: l.font.body, fontWeight: 500, fontSize: l.size.caption, lineHeight: 1.25, color: c.inkSecondary }}>{it.sub}</div> : null}
            </div>
          </div>
        </div>); })}
    </>);
  } else if (beat.mode === "process_flow") {
    const gap = 120, area = { x: 150, y: 340, w: 1620 }, cw = (area.w - gap * (n - 1)) / n, ch = 360, fs = n <= 3 ? l.size.subtitle + 8 : n === 4 ? l.size.subtitle : l.size.body + 4;
    body = (<>
      <div style={{ position: "absolute", left: area.x + 36, top: area.y - 24, width: area.w, height: ch + 60, ...glass, opacity: 0.45 * nodeP(0) * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
      {items.map((it, i) => { const p = nodeP(i), x = area.x + i * (cw + gap); return (
        <div key={i} style={{ position: "absolute", left: x, top: area.y, width: cw, height: ch, ...solid, padding: "40px 36px", justifyContent: "space-between", opacity: p * exit, transform: `translateZ(${sc.layerZ.main + (i % 2) * 30}px) translate3d(0, ${lerp(44, 0, p)}px, 0)`, display: "flex", flexDirection: "column", gap: 22 }}>
          {chip(i, 80, p)}
          <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fs, textWrap: "balance" as any, lineHeight: 1.12, letterSpacing: "-0.01em", color: c.ink }}>{it.label}</div>
          {it.sub ? <div style={{ fontFamily: l.font.body, fontWeight: 500, fontSize: l.size.caption, lineHeight: 1.3, color: c.inkSecondary }}>{it.sub}</div> : null}
        </div>); })}
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", transform: `translateZ(${sc.layerZ.tile}px)` }} width={1920} height={1080} viewBox="0 0 1920 1080">
        {items.slice(1).map((_, i) => arrow(area.x + i * (cw + gap) + cw + 14, area.y + ch / 2, area.x + (i + 1) * (cw + gap) - 14, area.y + ch / 2, arrowP(i + 1) * exit, `a${i}`, S[i % S.length].stroke))}
      </svg>
    </>);
  } else if (beat.mode === "causal_diagram") {
    const causes = items.slice(0, -1), effect = items[n - 1], k = Math.max(1, causes.length);
    const ch = Math.min(170, (520 - (k - 1) * 28) / k), top0 = 330 + (520 - (k * ch + (k - 1) * 28)) / 2, cw = 640, ex = 1060, ew = 700, eh = 420, ey = 330 + (520 - eh) / 2;
    const pe = prog(n - 1);  // arrows converge as the effect card arrives
    body = (<>
      <div style={{ position: "absolute", left: ex + 36, top: ey - 22, width: ew, height: eh + 40, ...glass, opacity: 0.45 * pe * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
      {causes.map((it, i) => { const p = prog(i); return (
        <div key={i} style={{ position: "absolute", left: 150, top: top0 + i * (ch + 28), width: cw, height: ch, ...solid, padding: "0 34px", opacity: p * exit, transform: `translateZ(${sc.layerZ.main}px) translate3d(${lerp(-50, 0, p)}px, 0, 0)`, display: "flex", alignItems: "center", gap: 24 }}>
          {chip(i, 68, p)}<div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.subtitle - 4, lineHeight: 1.12, color: c.ink }}>{it.label}</div>
        </div>); })}
      <div style={{ position: "absolute", left: ex, top: ey, width: ew, height: eh, ...solid, background: `linear-gradient(145deg, ${withAlpha(c.surface, 0.96)}, ${withAlpha(S[1].fill, 0.22)})`, padding: "44px 48px", opacity: pe * exit, transform: `translateZ(${sc.layerZ.tile}px) scale(${lerp(0.94, 1, pe)})`, display: "flex", flexDirection: "column", gap: 20, justifyContent: "center" }}>
        <div style={{ fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.caption, letterSpacing: "0.14em", textTransform: "uppercase", color: S[1].text }}>Result</div>
        <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: l.size.title, lineHeight: 1.08, letterSpacing: "-0.02em", color: c.ink }}>{effect.label}</div>
        {effect.sub ? <div style={{ fontFamily: l.font.body, fontWeight: 500, fontSize: l.size.caption, color: c.inkSecondary }}>{effect.sub}</div> : null}
      </div>
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", transform: `translateZ(${sc.layerZ.main}px)` }} width={1920} height={1080} viewBox="0 0 1920 1080">
        {causes.map((_, i) => arrow(150 + cw + 14, top0 + i * (ch + 28) + ch / 2, ex - 14, ey + eh / 2 + (i - (k - 1) / 2) * 34, Math.min(1, Math.max(0, pe * 1.6 - i * 0.12)) * exit, `c${i}`, S[i % S.length].stroke))}
      </svg>
    </>);
  } else {
    const it = items[0], text: string = it.label, inner = variant === "banner" ? 1500 : variant === "spotlight" ? 890 : 1460 - 180, fit = fitSize(text, inner), mark: string | undefined = it.mark, at = mark ? text.indexOf(mark) : -1, p = eased(l.pack, build.ease, frame, build.startFrame, build.endFrame);
    const sweep = at >= 0 ? (hi ? eased(l.pack, hi.ease, frame, hi.startFrame, hi.endFrame) : 1) : 0;
    if (variant === "banner") body = (<>
      <div style={{ position: "absolute", left: 0, top: 360, width: 1920, height: 400, ...solid, borderRadius: 0, background: `linear-gradient(90deg, ${withAlpha(S[0].fill, 0.22)}, ${withAlpha(c.surface, 0.97)} 45%)`, opacity: p * exit, transform: `translateZ(${sc.layerZ.main}px) translate3d(${lerp(-120, 0, p)}px, 0, 0)` }} />
      <div style={{ position: "absolute", left: 150, top: 410, width: 10, height: 300, borderRadius: 5, background: `linear-gradient(${S[0].fill}, ${S[0].stroke})`, opacity: exit, transform: `translateZ(${sc.layerZ.tile}px) scaleY(${p})`, transformOrigin: "50% 0" }} />
      <div style={{ position: "absolute", left: 210, top: 360, width: 1500, height: 400, display: "flex", alignItems: "center", transform: `translateZ(${sc.layerZ.tile}px)`, opacity: exit }}>
        <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fit, lineHeight: 1.16, letterSpacing: "-0.02em", color: c.ink }}>{calloutText(text, mark, at, sweep)}</div>
      </div>
    </>);
    else if (variant === "spotlight") body = (<>
      <div style={{ position: "absolute", left: 150, top: 330, width: 520, height: 520, borderRadius: 40, background: `linear-gradient(150deg, ${S[0].fill}, ${S[0].stroke})`, boxShadow: `0 30px 60px ${withAlpha(S[0].stroke, 0.35)}`, opacity: p * exit, transform: `translateZ(${sc.layerZ.back + 40}px) translate3d(${lerp(-80, 0, p)}px, 0, 0)`, display: "flex", alignItems: "center", justifyContent: "center", color: withAlpha(c.surface, 0.92), fontFamily: l.font.display, fontWeight: 700, fontSize: 420, lineHeight: 1 }}><span style={{ marginTop: 120 }}>“</span></div>
      <div style={{ position: "absolute", left: 700, top: 330, width: 1070, height: 520, ...solid, padding: "0 90px", opacity: p * exit, transform: `translateZ(${sc.layerZ.main}px) translate3d(0, ${lerp(44, 0, p)}px, 0)`, display: "flex", alignItems: "center" }}>
        <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fit, lineHeight: 1.16, letterSpacing: "-0.02em", color: c.ink }}>{calloutText(text, mark, at, sweep)}</div>
      </div>
    </>);
    else body = (<>
      <div style={{ position: "absolute", left: 230 + 40, top: 330 - 30, width: 1460, height: 520, ...glass, opacity: 0.45 * p * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
      <div style={{ position: "absolute", left: 230, top: 330, width: 1460, height: 520, ...solid, padding: "0 90px", opacity: p * exit, transform: `translateZ(${sc.layerZ.main}px) translate3d(0, ${lerp(44, 0, p)}px, 0)`, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 40, top: 36, fontFamily: l.font.display, fontWeight: 700, fontSize: 150, lineHeight: 1, color: withAlpha(S[0].fill, 0.35) }}>“</div>
        <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fit, lineHeight: 1.16, letterSpacing: "-0.02em", color: c.ink }}>
          {calloutText(text, mark, at, sweep)}
        </div>
      </div>
    </>);
  }

  return <Stage frame={frame} settle={settle} camP={camP} exit={exit} title={title} titleP={titleP}>{body}{content.source ? <SourceTile text={content.source} p={prog(n - 1)} exit={exit} /> : null}</Stage>;
};
