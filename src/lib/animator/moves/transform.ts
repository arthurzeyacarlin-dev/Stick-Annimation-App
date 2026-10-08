// SPEC-0017 TRANSFORM (Arthur, 2026-10-07: "a stick figure turns into a car and drives to the moon" — "it has to
// learn what a car looks like and what a stick figure looks like, and somehow MORPH it smoothly").
// The effect `transform` on a figure (anchor = its hip): ANTICIPATION (the figure crouches, squashing down and out),
// then the figure's lines squash flat toward the floor and spread toward the symbol's outline while the SYMBOL
// (a Library symbol: symbolMaker.ts PLACED_SYMBOLS, e.g. "car") grows in its place with a small overshoot and a
// sparkle puff; the figure is GONE after the morph (buildScene → morphFigures) and the symbol takes over at the same
// spot. Then it MOVES along `path` (each leg eases in and out, tilting toward where it goes). `back: true` = the
// reverse (the symbol shrinks away and the figure grows back up). `prop` = a still symbol (a moon in the sky).
import { addBuiltHook, type FrameCharacter, type Scene, type SceneFrames } from "../engine.ts";
import type { EffectContext, EffectParams, EffectRecipe, EffectTrack, Shape } from "../effects/types.ts";
import { PLACED_SYMBOLS, placedSymbol } from "../symbolMaker.ts";
import { hitWobble, type ThingHit } from "./hitThings.ts";

export const MORPH_SECONDS = 0.8;
const CROUCH_END = 0.3, GONE_AT = 0.75, GROW_FROM = 0.35, GROW_TO = 0.85;
const smooth = (u: number) => { const k = Math.min(1, Math.max(0, u)); return k * k * (3 - 2 * k); };

// The placed symbol's name for "car" / "Car" / a kind ("moon").
export function symbolName(into: unknown): string | undefined {
  const want = String(into ?? "").trim().toLowerCase();
  if (!want) return undefined;
  for (const [name, { kind }] of Object.entries(PLACED_SYMBOLS)) if (name.toLowerCase() === want || kind === want) return name;
  return undefined;
}

// How the figure is squashed at morph share u (0..1): null = gone.
export function figureSquash(u: number): { sx: number; sy: number } | null {
  if (u < CROUCH_END) { const k = smooth(u / CROUCH_END); return { sx: 1 + 0.1 * k, sy: 1 - 0.18 * k }; }
  if (u < GONE_AT) { const k = smooth((u - CROUCH_END) / (GONE_AT - CROUCH_END)); return { sx: 1.1 + 0.5 * k, sy: 0.82 - 0.67 * k }; }
  return null;
}

const morphOf = (track: EffectTrack) => Math.min(Number(track.params?.morph ?? MORPH_SECONDS), track.end - track.start);

// The figures with their morphs applied (called at the end of engine.ts buildScene): squashed toward the floor under
// their middle during a morph, and left out of the pictures while they are a symbol.
export function morphFigures(scene: Scene, built: SceneFrames): SceneFrames {
  const tracks = ((scene as { effects?: EffectTrack[] }).effects ?? []).filter((e) => e.kind === "transform" && "character" in e.anchor);
  if (tracks.length === 0) return built;
  const groundY = scene.groundY;
  const frames = built.frames.map((characters, i) => {
    const t = i / built.fps;
    const out: FrameCharacter[] = [];
    for (const c of characters) {
      const own = tracks.filter((e) => (e.anchor as { character: string }).character === c.id).sort((a, b) => a.start - b.start);
      let hidden = false, squash: { sx: number; sy: number } | null = { sx: 1, sy: 1 };
      for (const e of own) {
        if (t < e.start - 1e-9) break;
        const back = e.params?.back === true, morph = morphOf(e);
        if (t <= e.start + morph + 1e-9) { const u = (t - e.start) / morph; squash = figureSquash(back ? 1 - u : u); hidden = false; break; }
        hidden = !back; squash = hidden ? null : { sx: 1, sy: 1 };
      }
      if (hidden || !squash) continue;
      if (squash.sx === 1 && squash.sy === 1) { out.push(c); continue; }
      const pts = Object.values(c.skeleton), cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const skeleton = Object.fromEntries(Object.entries(c.skeleton).map(([j, p]) => [j, { x: cx + (p.x - cx) * squash!.sx, y: groundY + (p.y - groundY) * squash!.sy }])) as typeof c.skeleton;
      out.push({ ...c, skeleton, headRadius: c.headRadius * Math.sqrt(squash.sx * squash.sy) });
    }
    return out;
  });
  return { ...built, frames };
}

type PathPoint = { t: number; dx: number; dy: number };
const pathOf = (params: EffectParams): PathPoint[] => (Array.isArray(params.path) ? params.path : [])
  .map((p) => ({ t: Number((p as PathPoint).t), dx: Number((p as PathPoint).dx ?? 0), dy: Number((p as PathPoint).dy ?? 0) }))
  .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.dx) && Number.isFinite(p.dy))
  .sort((a, b) => a.t - b.t);

// Where the symbol is `s` seconds after the morph (each leg eases in and out) and its tilt (toward where it goes).
export function alongPath(path: PathPoint[], s: number): { dx: number; dy: number; rotation: number } {
  let from = { t: 0, dx: 0, dy: 0 };
  for (const to of path) {
    if (s <= to.t) {
      const k = (s - from.t) / Math.max(1e-6, to.t - from.t), e = smooth(k);
      const angle = (Math.atan2(to.dy - from.dy, Math.abs(to.dx - from.dx) || 1e-6) * 180) / Math.PI * Math.sign(to.dx - from.dx || 1);
      const tilt = Math.max(-40, Math.min(40, angle)) * Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
      return { dx: from.dx + (to.dx - from.dx) * e, dy: from.dy + (to.dy - from.dy) * e, rotation: Math.abs(to.dy - from.dy) > 1 ? tilt : 0 };
    }
    from = to;
  }
  return { dx: from.dx, dy: from.dy, rotation: 0 };
}

const sparkles = (x: number, y: number, r: number, k: number, color: string): Shape[] => {
  if (k <= 0 || k >= 1) return [];
  const out: Shape[] = [], fade = 1 - k;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.3, d = r * (0.4 + 0.9 * k), s = r * 0.12 * fade + 2;
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.7;
    out.push({ kind: "poly", points: [px, py - s, px + s * 0.3, py - s * 0.3, px + s, py, px + s * 0.3, py + s * 0.3, px, py + s, px - s * 0.3, py + s * 0.3, px - s, py, px - s * 0.3, py - s * 0.3], fill: color, alpha: fade });
  }
  out.push({ kind: "circle", x, y, r: r * (0.5 + 0.6 * k), fill: "#ffffff", alpha: 0.35 * fade });
  return out;
};

function drawTransform(ctx: EffectContext, params: EffectParams): Shape[] {
  const name = symbolName(params.into);
  if (!name) return [];
  const made = placedSymbol({ name, color: params.color, color2: params.color2 });
  const scale = (Number(params.size ?? 0.45) * ctx.height) / made.height; // size = the symbol's height x the figure's
  const w = made.width * scale, h = made.height * scale;
  const morph = Math.min(Number(params.morph ?? MORPH_SECONDS), ctx.duration), back = params.back === true;
  const x0 = ctx.at.x, y0 = ctx.groundY - h / 2; // on the floor where the figure stood
  const out: Shape[] = [];
  let grow = 1, alpha = 1, move = { dx: 0, dy: 0, rotation: 0 };
  if (ctx.t < morph) {
    const u = back ? 1 - ctx.t / morph : ctx.t / morph;
    const k = Math.min(1, Math.max(0, (u - GROW_FROM) / (GROW_TO - GROW_FROM)));
    if (k <= 0) grow = 0;
    else { const c = 1.7; grow = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); alpha = Math.min(1, k / 0.5); } // a small overshoot
    out.push(...sparkles(x0, ctx.groundY - h * 0.6, Math.max(w, h) * 0.7, (ctx.t / morph - 0.3) / 0.7, String(params.sparkle ?? "#ffe27a")));
  } else if (!back) move = alongPath(pathOf(params), ctx.t - morph);
  else return out;
  const flip = ctx.facing === "left";
  if (grow > 0) out.unshift({ kind: "symbol", name, x: x0 + move.dx, y: y0 + move.dy, scale: scale * Math.max(0.05, grow), rotation: flip ? -move.rotation : move.rotation, ...(flip ? { flipX: true } : {}), ...(alpha < 1 ? { alpha } : {}), ...(params.color ? { color: String(params.color) } : {}), ...(params.color2 ? { color2: String(params.color2) } : {}) });
  return out;
}

// AN ORIGINAL SYMBOL FROM SIMPLE PARTS (Arthur, 2026-10-08: "teach the engine to create its own original symbols"):
// a thing with no built-in symbol is a prop drawn from params.parts — a short list of {shape: rect | round | circle |
// ellipse | line, x, y, w, h, color} in units of the prop's size (its height; x, y = the part's center, 0,0 = the
// prop's center, + = right / down; a line goes from x,y to x+w,y+h) — each part filled and outlined dark so it reads
// at stick-figure size. A prop whose bottom is near the floor stands ON it; one higher up hangs there. A hit prop
// reacts (hitThings.ts): it swings (hanging) or rocks (standing) by the strike's power.
type Part = { shape?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; color?: unknown };
export function partsShapes(parts: Part[], S: number, cx: number, cy: number, angle: number, px: number, py: number, outline: string): Shape[] {
  const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const turn = (x: number, y: number) => [px + (x - px) * cos - (y - py) * sin, py + (x - px) * sin + (y - py) * cos];
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const width = Math.max(2.5, 0.022 * S);
  const out: Shape[] = [];
  for (const p of parts.slice(0, 16)) {
    const x = cx + num(p.x, 0) * S, y = cy + num(p.y, 0) * S, w = Math.abs(num(p.w, 0.3)) * S, h = Math.abs(num(p.h, 0.3)) * S;
    const fill = typeof p.color === "string" ? p.color : "#9a9a9a", shape = String(p.shape ?? "rect");
    if (shape === "line") { out.push({ kind: "line", points: [...turn(x, y), ...turn(x + num(p.w, 0) * S, y + num(p.h, 0) * S)], stroke: fill === "#9a9a9a" ? outline : fill, width: Math.max(width, 0.03 * S) }); continue; }
    const pts: number[] = [];
    if (shape === "circle" || shape === "ellipse") {
      const rx = w / 2, ry = shape === "circle" ? w / 2 : h / 2;
      for (let i = 0; i < 20; i += 1) pts.push(...turn(x + rx * Math.cos((i / 20) * 2 * Math.PI), y + ry * Math.sin((i / 20) * 2 * Math.PI)));
    } else {
      const r = shape === "round" ? Math.min(w, h) * 0.3 : 0, steps = r > 0 ? 4 : 1;
      for (const [qx, qy, a0] of [[x + w / 2 - r, y - h / 2 + r, -90], [x + w / 2 - r, y + h / 2 - r, 0], [x - w / 2 + r, y + h / 2 - r, 90], [x - w / 2 + r, y - h / 2 + r, 180]])
        for (let i = 0; i < steps; i += 1) { const u = ((a0 + (90 * i) / Math.max(1, steps - 1)) * Math.PI) / 180; pts.push(...turn(qx + r * Math.cos(u), qy + r * Math.sin(u))); }
    }
    out.push({ kind: "poly", points: pts, fill, stroke: outline, width });
  }
  return out;
}

function drawProp(ctx: EffectContext, params: EffectParams): Shape[] {
  const S = Number(params.size ?? 0.5) * ctx.height;
  const hits = Array.isArray(params.hits) ? (params.hits as ThingHit[]) : [];
  if (Array.isArray(params.parts) && params.parts.length) {
    const parts = params.parts.filter((p): p is Part => !!p && typeof p === "object");
    const bottom = Math.max(...parts.map((p) => (typeof p.y === "number" ? p.y : 0) + Math.abs(typeof p.h === "number" ? p.h : 0.3) / 2)) * S;
    const top = Math.min(...parts.map((p) => (typeof p.y === "number" ? p.y : 0) - Math.abs(typeof p.h === "number" ? p.h : 0.3) / 2)) * S;
    // (on the floor: its lowest part's bottom on the ground line, never floating just above it or sunk into it)
    const standing = ctx.at.y + bottom >= ctx.groundY - 0.25 * S;
    const cy = standing ? ctx.groundY - bottom : ctx.at.y;
    const { angle } = hitWobble(hits, ctx.t, !standing);
    // (a standing thing rocks on the edge of what touches the floor — its lowest part — never lifting off it)
    const foot = parts.reduce((a, p) => ((typeof p.y === "number" ? p.y : 0) + Math.abs(typeof p.h === "number" ? p.h : 0.3) / 2 > (typeof a.y === "number" ? a.y : 0) + Math.abs(typeof a.h === "number" ? a.h : 0.3) / 2 ? p : a));
    const edge = (Math.abs(typeof foot.x === "number" ? foot.x : 0) + Math.abs(typeof foot.w === "number" ? foot.w : 0.3) / 2) * S;
    // NOTHING FLOATS (Arthur, 2026-10-08: "it's floating — it needs a stand or to be hooked up to a chain"): a thing
    // that neither stands on the floor nor flies (a bird, a balloon, a kite, a cloud, the moon...) HANGS from something:
    // a chain from its top up out of the page, and it swings on that chain (a long chain swings it less sharply).
    const flies = params.flies === true || /bird|balloon|kite|plane|cloud|drone|ufo|ghost|butterfly|bee|star|moon|sun|planet|rocket|spaceship|fly|float|hover/i.test(String(params.symbol ?? ""));
    if (!standing && !flies && params.hangs !== false) {
      const topPart = parts.reduce((a, p) => ((typeof p.y === "number" ? p.y : 0) < (typeof a.y === "number" ? a.y : 0) ? p : a));
      const hx = ctx.at.x + (typeof topPart.x === "number" ? topPart.x : 0) * S, hy = cy + top;
      const chainTop = -0.05 * ctx.height;
      if (hy > chainTop + 0.05 * ctx.height) {
        const k = Math.min(1, (bottom - top) / Math.max(1, cy + bottom - chainTop)) * 1.6;
        const swing = angle * k, a = (swing * Math.PI) / 180;
        // (the chain's end, swung about its top by the same turn the parts get: a rigid pendulum)
        const end = [hx - (hy - chainTop) * Math.sin(a), chainTop + (hy - chainTop) * Math.cos(a)];
        const chain: Shape = { kind: "line", points: [hx, chainTop, end[0], end[1]], stroke: String(params.chainColor ?? "#4a4a4a"), width: Math.max(2, 0.012 * ctx.height) };
        // (the thing hangs from the chain's end and turns with it)
        return [chain, ...partsShapes(parts, S, ctx.at.x + (end[0] - hx), cy + (end[1] - hy), swing, end[0], end[1], String(params.outline ?? "#1f1f1f"))];
      }
    }
    const px = ctx.at.x + (standing ? (Math.sign(angle) || 1) * edge : 0), py = standing ? ctx.groundY : cy + top;
    return partsShapes(parts, S, ctx.at.x, cy, angle, px, py, String(params.outline ?? "#1f1f1f"));
  }
  const name = symbolName(params.symbol);
  if (!name) return [];
  const made = placedSymbol({ name, color: params.color, color2: params.color2 });
  const { angle } = hitWobble(hits, ctx.t, ctx.at.y + S / 2 < ctx.groundY - 0.05 * ctx.height);
  return [{ kind: "symbol", name, x: ctx.at.x, y: ctx.at.y, scale: S / made.height, ...(angle ? { rotation: angle } : {}), ...(params.color ? { color: String(params.color) } : {}) }];
}

export const RECIPES: EffectRecipe[] = [
  {
    id: "transform",
    about: "figure morphs into params.into (car), then moves on path. Anchor {character, joint:'hip'}; params {into:'car'|'moon', size: its height x the figure's (0.45), morph: s (0.8), path:[{t: s after the morph, dx, dy: px from where it formed}], back}: crouch, squash, the symbol grows in its place with sparkles, the figure is gone; then it moves along path (each leg eases, tilts up when flying). back:true = turns back into the figure",
    staysWhenGone: true,
    draw: drawTransform,
  },
  { id: "prop", about: "a still thing: params.symbol (moon, car)/params.parts at anchor x,y; size=height x figure (0.5)", draw: drawProp },
];

// The engine runs the morph after building any scene (a hook, so engine.ts never imports this file back).
addBuiltHook(morphFigures);
