import React from "react";
import { useCurrentFrame } from "remotion";
import { useLook, withAlpha } from "../style/StyleContext";
import { Beat, local } from "./common";
import { Stage, useGlass, exitOf, SourceTile } from "./stage";
import { eased, lerp } from "../motion/math.mjs";
import { textOn } from "../motion/color.mjs";
import { findEvent } from "./common";

/**
 * Modes action_checklist and risks_grid. Content: beat.content = { headline?, items: [{label, sub?, tone?}] } (labels are checked against the narration by lint).
 *  action_checklist : one tilted glass panel, one row per item; each row slides in and its check mark draws on the item's own cue.
 *  risks_grid       : 2-4 glass cards; the icon carries the meaning (eye = watch, bar = stop, check = allow), colour never alone.
 * Events: one checklist_build per item with params.item (and params.words); camera_push. A single event without params.item staggers all items. Frame-pure.
 */
export const ListScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const l = useLook(), frame = useCurrentFrame(), sc = l.pack.scene, c = l.color, S = c.series, { glass, solid } = useGlass();
  const content: any = (beat as any).content;
  if (!content || !Array.isArray(content.items) || content.items.length === 0) throw new Error(`${beat.id}: mode ${beat.mode} needs beat.content.items`);
  const items: any[] = content.items, n = items.length;
  const evs: Record<number, any> = {};
  for (const e of beat.events.filter((x) => x.recipe === "checklist_build" && typeof x.params?.item === "number")) evs[e.params.item] = local(beat, e);
  const perItem = Object.keys(evs).length > 0;
  const single = findEvent(beat, "checklist_build");
  const build = perItem ? evs[0] : single;
  if (!build) throw new Error(`${beat.id}: no checklist_build event`);
  if (perItem) for (let i = 0; i < n; i++) if (!evs[i]) throw new Error(`${beat.id}: item ${i} has no checklist_build event (params.item)`);
  const cam = findEvent(beat, "camera_push"), camP = cam ? eased(l.pack, cam.ease, frame, cam.startFrame, cam.endFrame) : 0;
  const first = perItem ? Math.min(...Object.values(evs).map((e: any) => e.startFrame)) : build.startFrame;
  const exit = exitOf(l, build, frame);
  const settle = eased(l.pack, build.ease, frame, first - Math.round(l.fps * 0.5), first + Math.round(l.fps * 0.1));
  const title = content.headline ?? beat.onScreenText[0];
  const titleP = eased(l.pack, "ease-out", frame, Math.max(0, first - Math.round(l.fps * 0.45)), first);
  const dur = build.endFrame - build.startFrame, win = dur * 0.6, off = n > 1 ? (dur - win) / (n - 1) : 0;
  const prog = (i: number) => perItem ? eased(l.pack, evs[i].ease, frame, evs[i].startFrame, evs[i].endFrame) : eased(l.pack, build.ease, frame, build.startFrame + i * off, build.startFrame + i * off + win);

  let body: React.ReactNode;
  if (beat.mode === "action_checklist") {
    const panel = { x: 150, y: 300, w: 1620 }, rowH = Math.min(150, 560 / n), h = 70 + n * rowH, fs = n <= 3 ? l.size.subtitle : l.size.subtitle - 8;
    body = (<>
      <div style={{ position: "absolute", left: panel.x + 40, top: panel.y - 26, width: panel.w, height: h, ...glass, opacity: 0.5 * prog(0) * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
      <div style={{ position: "absolute", left: panel.x, top: panel.y, width: panel.w, height: h, ...solid, opacity: Math.min(1, prog(0) * 3) * exit, transform: `translateZ(${sc.layerZ.main}px)` }}>
        {items.map((it, i) => {
          const p = prog(i), ck = Math.max(0, (p - 0.35) / 0.65), col = S[i % S.length], top = 35 + i * rowH;
          return (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top, height: rowH, display: "flex", alignItems: "center", gap: 40, padding: "0 64px", opacity: p, transform: `translate3d(${lerp(-60, 0, p)}px, 0, 0)` }}>
              <svg width={88} height={88} viewBox="0 0 88 88" style={{ flex: "none", overflow: "visible" }}>
                <circle cx={44} cy={44} r={40} fill={withAlpha(col.fill, 0.14)} stroke={col.stroke} strokeWidth={4} />
                <circle cx={44} cy={44} r={40 * lerp(0.4, 1, ck)} fill={`url(#ck${i}-${beat.id})`} opacity={ck} />
                <defs><linearGradient id={`ck${i}-${beat.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={col.fill} /><stop offset="1" stopColor={col.stroke} /></linearGradient></defs>
                <path d="M26 45 L39 58 L63 32" fill="none" stroke={textOn([col.fill, col.stroke], c)} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, ck * 1.3)} />
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fs, lineHeight: 1.1, letterSpacing: "-0.02em", color: c.ink }}>{it.label}</div>
                {it.sub ? <div style={{ fontFamily: l.font.body, fontWeight: 500, fontSize: l.size.label, color: c.inkSecondary }}>{it.sub}</div> : null}
              </div>
              {i < n - 1 ? <div style={{ position: "absolute", left: 64, right: 64, bottom: 0, height: 2, background: withAlpha(c.inkSecondary, 0.12) }} /> : null}
            </div>
          );
        })}
      </div>
    </>);
  } else {
    const cols = n === 2 ? 2 : n === 3 ? 3 : 2, rows = Math.ceil(n / cols), gap = 44, area = { x: 150, y: 300, w: 1620, h: 600 };
    const cw = (area.w - gap * (cols - 1)) / cols, ch = (area.h - gap * (rows - 1)) / rows * (rows === 1 ? 0.72 : 1);
    const iconSize = 84, fs = cols === 3 ? l.size.subtitle - 12 : l.size.subtitle - 4;
    const icon = (tone: string, col: any, p: number) => {
      const stroke = tone === "stop" ? c.flow.loss.stroke : tone === "allow" ? c.flow.gain.stroke : col.stroke, fill = tone === "stop" ? c.flow.loss.fill : tone === "allow" ? c.flow.gain.fill : col.fill;
      return (
        <svg width={iconSize} height={iconSize} viewBox="0 0 88 88" style={{ flex: "none", transform: `scale(${lerp(0.6, 1, p)})`, overflow: "visible" }}>
          <circle cx={44} cy={44} r={40} fill={withAlpha(fill, 0.16)} stroke={stroke} strokeWidth={4} />
          {tone === "stop" ? <rect x={24} y={38} width={40} height={12} rx={6} fill={stroke} />
            : tone === "allow" ? <path d="M26 45 L39 58 L63 32" fill="none" stroke={stroke} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            : <g fill="none" stroke={stroke} strokeWidth={6} strokeLinecap="round"><path d="M20 44 Q44 20 68 44 Q44 68 20 44 Z" /><circle cx={44} cy={44} r={8} fill={stroke} /></g>}
        </svg>
      );
    };
    body = (<>
      {items.map((it, i) => {
        const p = prog(i), col = S[i % S.length], tone = it.tone ?? "watch", cx = area.x + (i % cols) * (cw + gap), cy = area.y + Math.floor(i / cols) * (ch + gap);
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: cx + 24, top: cy - 18, width: cw, height: ch, ...glass, opacity: 0.45 * p * exit, transform: `translateZ(${sc.layerZ.back}px) rotateZ(1.2deg)` }} />
            <div style={{ position: "absolute", left: cx, top: cy, width: cw, height: ch, ...solid, padding: "36px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: p * exit, transform: `translateZ(${sc.layerZ.main + (i % 2) * 30}px) translate3d(0, ${lerp(48, 0, p)}px, 0)` }}>
              {icon(tone, col, p)}
              <div>
                <div style={{ fontFamily: l.font.display, fontWeight: 700, fontSize: fs, lineHeight: 1.1, letterSpacing: "-0.02em", color: c.ink, textWrap: "balance" as any }}>{it.label}</div>
                {it.sub ? <div style={{ marginTop: 10, fontFamily: l.font.body, fontWeight: 600, fontSize: l.size.label, color: tone === "stop" ? c.flow.loss.text : c.inkSecondary }}>{it.sub}</div> : null}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </>);
  }
  return <Stage frame={frame} settle={settle} camP={camP} exit={exit} title={title} titleP={titleP}>{body}{content.source ? <SourceTile text={content.source} p={prog(n - 1)} exit={exit} /> : null}</Stage>;
};
