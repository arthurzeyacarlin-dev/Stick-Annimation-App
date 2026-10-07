// MAKE MY DRAWING COME TRUE — ANY DRAWING (SPEC-0017 "50-50", 2026-10-07; Arthur: "If there's an explosion, it should
// be able to create an explosion."). The engine reads what the drawing IS (vision/drawingKind.ts readDrawing) and
// plays ITS OWN effect of that kind — the passed effect recipes, never a copy of the drawing — WHERE the drawing is
// and AS BIG as it: it starts from nothing, grows into the drawn size at its biggest moment, then ends its own way.
// SIZE RULE (general, every effect): build the effect once at a known size, MEASURE its biggest picture, then scale
// the effect's size (effectHeight) so that picture matches the drawing's box, and move its anchor so it sits on the
// drawing (ground effects stand on the drawing's lowest ink). No figures.
import { buildEffectFrames } from "../effects/index.ts";
import { EXPLOSION_SECONDS } from "../effects/explosion.ts";
import type { EffectFrame, EffectTrack, Point, Shape } from "../effects/types.ts";
import { buildScene, type Scene } from "../engine.ts";
import type { DrawingKind, ReadDrawing } from "../vision/types.ts";

type Plan = { kind: EffectTrack["kind"]; seconds: number; ground: boolean; params: Record<string, unknown> };
const BASE_HEIGHT = 300;

// The engine's own effect for each kind of drawing.
function planFor(d: ReadDrawing): Plan {
  const strong = (fam: (c: string) => boolean) => d.colors.find(fam);
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const sat = (c: string) => { const [r, g, b] = rgb(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  const hue = (c: string) => { const [r, g, b] = rgb(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn || 1; let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; return h < 0 ? h + 360 : h; };
  switch (d.kind as DrawingKind) {
    case "explosion": return { kind: "explosion", seconds: EXPLOSION_SECONDS, ground: true, params: { seed: 3 } };
    case "airExplosion": return { kind: "explosion", seconds: EXPLOSION_SECONDS, ground: false, params: { seed: 3, air: true } };
    case "fire": return { kind: "fire", seconds: 3, ground: true, params: { seed: 3 } };
    case "water": { const c = strong((x) => sat(x) > 0.35 && hue(x) >= 190 && hue(x) < 260); return { kind: "splash", seconds: 1.6, ground: true, params: { seed: 3, ...(c ? { color: c } : {}) } }; }
    case "ice": { const c = strong((x) => sat(x) > 0.2 && hue(x) >= 160 && hue(x) < 250); return { kind: "iceSpikes", seconds: 3.5, ground: true, params: { shape: "mountain", seed: 3, ...(c ? { color: c } : {}) } }; }
    case "smoke": return { kind: "smoke", seconds: 3, ground: true, params: { seed: 3 } };
    case "lightning": { const c = strong((x) => sat(x) > 0.35); return { kind: "lightning", seconds: 1.5, ground: true, params: { seed: 3, from: "anchor", ...(c ? { color: c } : {}) } }; }
    default: throw new Error(`effectComesTrueScene: no engine effect for a "${d.kind}" drawing`);
  }
}

// The box of one picture's SOLID shapes (the trimmed 3%..97% of their points, so a lone flying pebble doesn't count;
// see-through shapes under `minAlpha` don't count — a cloud breaking up into faint wisps is not its biggest moment).
function pointsOf(s: Shape): number[] {
  switch (s.kind) {
    case "circle": return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
    case "poly": case "line": return s.points;
    case "rect": return [s.x, s.y, s.x + s.w, s.y + s.h];
    case "symbol": return [s.x, s.y];
    default: return [];
  }
}
export function pictureBox(f: EffectFrame, minAlpha = 0.6): { x0: number; y0: number; x1: number; y1: number } | null {
  const xs: number[] = [], ys: number[] = [];
  for (const s of [...f.back, ...f.front, ...(f.top ?? [])]) {
    if ((s.alpha ?? 1) < minAlpha) continue;
    const p = pointsOf(s);
    for (let i = 0; i + 1 < p.length; i += 2) { xs.push(p[i]); ys.push(p[i + 1]); }
  }
  if (xs.length < 2) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (a: number[], u: number) => a[Math.min(a.length - 1, Math.max(0, Math.round(u * (a.length - 1))))];
  return { x0: q(xs, 0.03), y0: q(ys, 0.03), x1: q(xs, 0.97), y1: q(ys, 0.97) };
}
// The biggest picture of an effect scene (by area) and when it is.
export function biggestPicture(scene: Scene & { effects: EffectTrack[]; effectHeight: number }, fps: number) {
  const frames = buildEffectFrames(scene, buildScene(scene, fps));
  let best: { x0: number; y0: number; x1: number; y1: number } | null = null, at = -1;
  frames.forEach((f, i) => { const b = pictureBox(f); if (b && (!best || (b.x1 - b.x0) * (b.y1 - b.y0) > (best.x1 - best.x0) * (best.y1 - best.y0))) { best = b; at = i; } });
  return { box: best as { x0: number; y0: number; x1: number; y1: number } | null, index: at, frames };
}

function sceneOf(d: ReadDrawing, p: Plan, height: number, anchor: Point, target?: Point): Scene & { effects: EffectTrack[]; effectHeight: number } {
  const effects: EffectTrack[] = [{ kind: p.kind, start: 0, end: p.seconds, anchor, ...(target ? { target } : {}), params: p.params }];
  return { id: `come-true-${d.kind}`, title: `Your ${d.kind === "airExplosion" ? "explosion" : d.kind} comes true`, durationSec: p.seconds, groundY: d.groundY, characters: [], effects, effectHeight: height };
}

export function effectComesTrueScene(d: ReadDrawing, o: { fps: number }): Scene & { effects: EffectTrack[]; effectHeight: number } {
  const p = planFor(d);
  const box = d.box, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  // LIGHTNING runs from the top of the drawn bolt to its bottom (its length is the drawing's; its size is thickness).
  if (p.kind === "lightning") return sceneOf(d, p, Math.max(60, box.h * 0.6), { x: cx, y: box.y }, { x: cx, y: d.groundY });
  // Measure at a known size, then scale (twice: effects with fixed minimum sizes aren't exactly proportional).
  const measureFps = Math.max(1, o.fps); // (measured at the scene's own frame rate: a quick splash's biggest picture depends on it)
  let height = BASE_HEIGHT;
  let anchor: Point = { x: cx, y: p.ground ? d.groundY : cy };
  for (let pass = 0; pass < 2; pass++) {
    const m = biggestPicture(sceneOf(d, p, height, anchor), measureFps).box;
    if (!m) break;
    const mw = Math.max(1, m.x1 - m.x0), mh = Math.max(1, m.y1 - m.y0);
    const k = Math.sqrt((box.w / mw) * (box.h / mh)); // match the drawing's size (both ways at once)
    // Where the measured picture sits from the anchor, scaled with it.
    const relX = (m.x0 + m.x1) / 2 - anchor.x, relY = (m.y0 + m.y1) / 2 - anchor.y;
    height *= k;
    anchor = p.ground ? { x: cx - relX * k, y: d.groundY } : { x: cx - relX * k, y: cy - relY * k };
  }
  return sceneOf(d, p, height, anchor);
}
