// EVERYTHING HAS A CAUSE, part 2 (Arthur's review rules 15 and 18, Oct 12–14): broad rules the engine applies to EVERY scene
// after the moves are built — the real motion decides, never a guessed time or a drawing made for one scene.
// 1. A THING THAT SINKS IS GONE: a thrown / dropped thing that comes down on WATER (a `water` background piece, or a lake /
//    pond / pool / river prop) splashes and is gone under the surface — never lying on top of the water — with ripples
//    spreading where it went in (a splash on the thing's landing: index.ts then removes it after that picture).
// 2. A PLANTED THING IS CARRIED AND PLACED: a flag / sign / stake / stick standing at a spot appears only when the hand that
//    carried it pushes it into the ground (the hand's lowest moment over that spot), exactly where the hand put it; the
//    carried copy ends right then (it travels in the hand, then stays — never teleports). A planted thing that appears
//    during the scene with no carried copy gets one, in the hand of the figure that reaches that spot.
// 3. PAINT APPEARS WHERE THE BRUSH MOVES: a `paint` effect (a canvas, a wall, a board) shows exactly the path of the
//    painter's brush hand over it so far, stroke by stroke (the brush off the canvas = a new stroke); layers: the body,
//    then the canvas and its paint, then the painting forearm + the held brush in front of the canvas.
// 4. A COVER COVERS ONLY THOSE BEHIND IT (hiding behind a bush / box / wall): a front prop that a `depth: "behind"` figure
//    hides behind is made big enough to hide the body but the top of the head still shows (you can tell someone hides),
//    and every other figure passing in front of it is drawn over it.
import { addBuiltHook, type FrameCharacter, type Scene, type SceneFrames } from "../engine.ts";
import { clamp } from "./random.ts";
import type { Anchor, EffectContext, EffectParams, EffectRecipe, EffectTrack, Point, Shape } from "./types.ts";
import { objectLanding } from "./index.ts";

type FxScene = Scene & { effects?: EffectTrack[]; background?: { pieces?: { kind: string; params?: Record<string, unknown> }[] } };
type Part = { shape?: string; x?: number; y?: number; w?: number; h?: number };
const nameOf = (e: EffectTrack) => String(e.params?.name ?? e.params?.symbol ?? "");
const isFixed = (a: Anchor): a is Point => "x" in a && !("character" in a) && !("object" in a);
const handOf = (e: EffectTrack) => ("character" in e.anchor && /Hand$/.test(String(e.anchor.joint)) ? (e.anchor as { character: string; joint: "lHand" | "rHand" }) : undefined);
// (a prop's half-width and height above its foot, from its parts, in px)
function propBox(e: EffectTrack, H: number) {
  const S = Number(e.params?.size ?? 0.5) * H, parts = (Array.isArray(e.params?.parts) ? e.params!.parts : []) as Part[];
  if (!parts.length) return { half: 0.5 * S, top: S, S };
  const half = Math.max(...parts.map((p) => Math.abs(p.x ?? 0) + Math.abs(p.w ?? 0.3) / 2)) * S;
  const bottom = Math.max(...parts.map((p) => (p.y ?? 0) + Math.abs(p.h ?? 0.3) / 2)), top = Math.min(...parts.map((p) => (p.y ?? 0) - Math.abs(p.h ?? 0.3) / 2));
  return { half, top: (bottom - top) * S, S };
}

const WATERY = /\b(lake|pond|pool|river|sea|ocean|water|puddle|stream)\b/i;
const PLANTED = /\b(flag|banner|sign|signpost|stake|stick|pole|post|marker|cross|spear)\b/i;
const PAINTER = /\b(brush|paintbrush|pen|pencil|chalk|marker|crayon|roller|quill)\b/i;

// 2. When the carrying hand plants the thing at spot x: the hand's lowest moment within reach of x (from `from`).
export function plantTime(built: SceneFrames, who: string, joint: "lHand" | "rHand", x: number, H: number, from = 0): { t: number; x: number } | undefined {
  let best: { i: number; y: number } | undefined, near: { i: number; d: number } | undefined;
  for (let i = Math.max(0, Math.floor(from * built.fps)); i < built.frames.length; i += 1) {
    const c = built.frames[i].find((f) => f.id === who);
    if (!c) continue;
    const h = c.skeleton[joint], d = Math.abs(h.x - x);
    if (d < 0.35 * H && (!best || h.y > best.y + 0.5)) best = { i, y: h.y };
    if (!near || d < near.d) near = { i, d };
  }
  const i = best?.i ?? near?.i;
  if (i === undefined) return undefined;
  return { t: i / built.fps, x: built.frames[i].find((f) => f.id === who)!.skeleton[joint].x };
}

// 3. The brush's path over the canvas: strokes of [t, x, y, ...] (t from the effect's start), a new stroke each time the
// brush comes back onto the canvas.
export function brushTrail(built: SceneFrames, who: string, joint: "lHand" | "rHand", box: { x: number; y: number; w: number; h: number }, start: number, end: number): number[][] {
  const strokes: number[][] = [];
  let cur: number[] | undefined;
  for (let i = Math.max(0, Math.ceil(start * built.fps)); i <= Math.min(built.frames.length - 1, Math.floor(end * built.fps)); i += 1) {
    const c = built.frames[i].find((f) => f.id === who);
    const tip = c ? brushTip(c, joint) : undefined;
    const on = tip && Math.abs(tip.x - box.x) <= box.w / 2 && Math.abs(tip.y - box.y) <= box.h / 2;
    if (!on) { cur = undefined; continue; }
    if (!cur) strokes.push((cur = []));
    cur.push(+(i / built.fps - start).toFixed(4), Math.round(tip.x), Math.round(tip.y));
  }
  return strokes.filter((s) => s.length >= 6);
}
// (the brush's tip: a little past the hand, along the forearm)
function brushTip(c: FrameCharacter, joint: "lHand" | "rHand"): Point {
  const h = c.skeleton[joint], e = c.skeleton[joint === "rHand" ? "rElbow" : "lElbow"], L = Math.hypot(h.x - e.x, h.y - e.y) || 1, ext = 0.45 * c.headRadius;
  return { x: h.x + ((h.x - e.x) / L) * ext, y: h.y + ((h.y - e.y) / L) * ext };
}

// One figure drawn as plain lines (to draw it again over a cover it walks in front of).
function figureLines(c: FrameCharacter): number[] {
  const s = c.skeleton, seg = (a: Point, b: Point) => [a.x, a.y, b.x, b.y].map((v) => Math.round(v));
  return [...seg(s.hip, s.neck), ...seg(s.neck, s.lElbow), ...seg(s.lElbow, s.lHand), ...seg(s.neck, s.rElbow), ...seg(s.rElbow, s.rHand), ...seg(s.hip, s.lKnee), ...seg(s.lKnee, s.lFoot), ...seg(s.hip, s.rKnee), ...seg(s.rKnee, s.rFoot)];
}

addBuiltHook((scene0, built) => {
  const scene = scene0 as FxScene;
  if ((built as { camera?: unknown }).camera || !scene.effects?.length && !scene.background?.pieces?.length) return built;
  const H = scene.characters[0]?.height ?? 300, g = scene.groundY, last = (built.frames.length - 1) / built.fps;
  let effects = [...(scene.effects ?? [])];

  // 1. A THING THAT SINKS IS GONE
  const waters: [number, number][] = [];
  for (const q of scene.background?.pieces ?? []) if (q.kind === "water") { const w = Number(q.params?.w ?? 1e5), x = q.params?.x === undefined ? 960 : Number(q.params.x); waters.push([x - w / 2, x + w / 2]); } // (x = the middle)
  for (const e of effects) if (e.kind === "prop" && isFixed(e.anchor) && WATERY.test(nameOf(e))) { const b = propBox(e, H), x = e.anchor.x; waters.push([x - b.half, x + b.half]); }
  if (waters.length) {
    const ids = [...new Set(built.objects.flatMap((f) => f.map((o) => o.id)))];
    for (const id of ids) {
      if (effects.some((e) => (e.anchor as { object?: string; landing?: boolean }).object === id && (e.anchor as { landing?: boolean }).landing)) continue;
      const flew = built.objects.some((f) => f.some((o) => o.id === id && o.y < g - 0.15 * H));
      const land = flew ? objectLanding(built, id, g) : undefined;
      if (!land || land.y < g - 1 || land.t >= last - 1e-6 || !waters.some(([a, b]) => land.x >= a && land.x <= b)) continue;
      // (the plan's own splash / ripples right there ride on the landing; else a splash and ripples are added)
      let has = false;
      effects = effects.map((e) => {
        if ((e.kind !== "splash" && e.kind !== "ripples") || !isFixed(e.anchor) || Math.abs(e.anchor.x - land.x) > 0.6 * H) return e;
        has = true;
        return { ...e, anchor: { object: id, landing: true } };
      });
      if (!has) effects.push({ kind: "splash", start: 0, end: 0.9, anchor: { object: id, landing: true }, params: { size: 0.3 }, layer: "front" });
      if (!effects.some((e) => e.kind === "ripples" && (e.anchor as { object?: string }).object === id)) effects.push({ kind: "ripples", start: 0, end: 2.5, anchor: { object: id, landing: true }, params: { size: 0.5 }, layer: "back" });
    }
  }

  // 2. A PLANTED THING IS CARRIED AND PLACED
  for (const f of effects.filter((e) => e.kind === "prop" && isFixed(e.anchor) && PLANTED.test(nameOf(e)))) {
    const word = nameOf(f).match(PLANTED)![1].toLowerCase(), spot = f.anchor as Point;
    let held = effects.find((e) => e.kind === "prop" && handOf(e) && new RegExp(`\\b${word}`, "i").test(nameOf(e)));
    // (standing there from the start of the scene — the film's start or a story's cut — is scenery: nobody plants it)
    const sceneStarts = [0, ...((built as { camera?: { cuts?: number[] } }).camera?.cuts ?? []).map((i) => i / built.fps)];
    if (!held && sceneStarts.some((t0) => f.start <= t0 + 0.3)) continue;
    let carrier = held ? handOf(held)! : undefined;
    if (!carrier) {
      // (appears during the scene with no carried copy: the figure whose hand comes nearest to that spot carries it)
      let best: { c: string; j: "lHand" | "rHand"; d: number } | undefined;
      for (const fr of built.frames) for (const c of fr) for (const j of ["rHand", "lHand"] as const) { const d = Math.abs(c.skeleton[j].x - spot.x); if (!best || d < best.d) best = { c: c.id, j, d }; }
      if (!best || best.d > 0.6 * H) continue;
      carrier = { character: best.c, joint: best.j };
    }
    const p = plantTime(built, carrier.character, carrier.joint, spot.x, H, held ? Math.max(0, held.start) : 0);
    if (!p) continue;
    // (one flag at a time: the carried one is gone in the very picture the planted one appears; the planted one stands just
    // behind the planter — the figure is drawn in front of it)
    const planted: EffectTrack = { ...f, start: p.t, anchor: { ...spot, x: Math.round(p.x) }, layer: "back" }, off = p.t - 0.5 / built.fps;
    if (!held) { held = { kind: "prop", start: -1.5, end: off, anchor: { ...carrier }, params: { ...f.params, letGo: true }, layer: "front" }; effects.push(held); }
    else effects = effects.map((e) => (e === held ? { ...e, end: off } : e));
    effects = effects.map((e) => (e === f ? planted : e));
  }

  // 3. PAINT APPEARS WHERE THE BRUSH MOVES
  effects = effects.flatMap((e) => {
    if (e.kind !== "paint" || !isFixed(e.anchor)) return [e];
    const brush = effects.find((q) => q.kind === "prop" && handOf(q) && PAINTER.test(nameOf(q)) && (!e.params?.by || handOf(q)!.character === e.params.by));
    const cause = e.cause && "character" in e.cause ? (e.cause as { character: string; joint: string }) : undefined;
    const who = String(e.params?.by ?? cause?.character ?? (brush ? handOf(brush)!.character : scene.characters[0]?.id ?? ""));
    const joint = ((cause && /Hand$/.test(cause.joint) ? cause.joint : brush && handOf(brush)!.character === who ? handOf(brush)!.joint : "rHand") as "lHand" | "rHand");
    const box = { x: e.anchor.x, y: e.anchor.y, w: Number(e.params?.w ?? 0.5) * H, h: Number(e.params?.h ?? 0.4) * H };
    // (THE CANVAS NEVER HIDES ITS PAINTER: its near edge stays just past the painter's hips, so only the reaching arm crosses it)
    const p0 = built.frames[Math.max(0, Math.ceil(e.start * built.fps))]?.find((f) => f.id === who);
    if (p0) {
      const dir = Math.sign(box.x - p0.skeleton.hip.x) || 1, near = box.x - dir * box.w / 2, least = p0.skeleton.hip.x + dir * 0.06 * H;
      if ((near - least) * dir < 0) box.x += least - near;
    }
    const start = Math.max(0, e.start), end = Math.min(last, e.end);
    const trail = brushTrail(built, who, joint, box, start, end);
    const arm: number[] = [];
    let style: FrameCharacter["style"] | undefined;
    for (let i = Math.ceil(start * built.fps); i <= Math.floor(end * built.fps); i += 1) {
      const c = built.frames[i]?.find((f) => f.id === who);
      if (c) style = c.style;
      const s = c?.skeleton, el = s?.[joint === "rHand" ? "rElbow" : "lElbow"], h = s?.[joint];
      arm.push(...(el && h ? [el.x, el.y, h.x, h.y].map((v) => Math.round(v)) : [NaN, NaN, NaN, NaN]).map((v) => (Number.isFinite(v) ? v : -99999)));
    }
    return [{ ...e, start, anchor: { x: box.x, y: box.y }, params: { ...e.params, w: box.w / H, h: box.h / H, trail, arm, armStart: start, fps: built.fps, armColor: style?.color ?? "#111111", armWidth: style?.thickness ?? 7 } }];
  });
  // (the brush in the painter's hand is drawn after the painting: in front of the canvas)
  for (const p of effects.filter((e) => e.kind === "paint")) {
    const i = effects.indexOf(p), j = effects.findIndex((q) => q.kind === "prop" && handOf(q) && PAINTER.test(nameOf(q)));
    if (j >= 0 && j < i) { effects.splice(i, 1); effects.splice(j, 0, p); }
  }

  // 4. A COVER COVERS ONLY THOSE BEHIND IT
  const hiders = new Set(built.frames.flatMap((f) => f.filter((c) => (c.z ?? 0) < 0).map((c) => c.id)));
  if (hiders.size) {
    const over: EffectTrack[] = [];
    effects = effects.map((e) => {
      if (e.kind !== "prop" || !isFixed(e.anchor) || (e.layer ?? "front") !== "front" || Math.abs(e.anchor.y - g) > 0.15 * H) return e;
      const b = propBox(e, H), x = e.anchor.x;
      const hidden = built.frames.flatMap((f) => f.filter((c) => hiders.has(c.id) && Math.abs(c.skeleton.hip.x - x) < b.half));
      if (!hidden.length) return e;
      // BIG ENOUGH, NOT TOO BIG: its top reaches the middle of the hider's head at the deepest crouch (the body is hidden,
      // the top of the head shows) — never higher than that (rising up, the hider peeks over it)
      const head = Math.max(...hidden.map((c) => c.skeleton.head.y)), want = g - head;
      const size = Number(e.params?.size ?? 0.5) * clamp(want / Math.max(1, b.top), 0.7, 2.5);
      const nb = propBox({ ...e, params: { ...e.params, size } }, H);
      // FIGURES IN FRONT ARE IN FRONT: everyone else passing in front of it is drawn again over it
      for (const c0 of scene.characters) {
        if (hiders.has(c0.id)) continue;
        const lines: number[][] = built.frames.map((f) => { const c = f.find((q) => q.id === c0.id); return c && Math.abs(c.skeleton.hip.x - x) < nb.half + 0.3 * H ? [...figureLines(c), Math.round(c.skeleton.head.x), Math.round(c.skeleton.head.y), Math.round(c.headRadius)] : []; });
        if (!lines.some((l) => l.length)) continue;
        const st = built.frames.flatMap((f) => f.filter((q) => q.id === c0.id))[0]?.style;
        over.push({ kind: "figureOver", start: 0, end: last + 0.01, anchor: { x: 0, y: 0 }, params: { lines, fps: built.fps, color: st?.color ?? "#111111", width: st?.thickness ?? 7, headFilled: st?.headFilled !== false }, layer: "front" });
      }
      return { ...e, params: { ...e.params, size: +size.toFixed(3) } };
    });
    effects.push(...over);
  }
  scene.effects = effects;
  return built;
});

// ---- recipes ---------------------------------------------------------------------------------------------
// RIPPLES where something went into the water: 3 flat rings spreading out on the surface, one after another, fading.
function ripples(ctx: EffectContext, p: EffectParams): Shape[] {
  const R = Number(p.size ?? 0.5) * ctx.height, out: Shape[] = [];
  for (let k = 0; k < 3; k += 1) {
    const u = (ctx.t - 0.25 * k) / Math.max(0.3, ctx.duration - 0.5);
    if (u <= 0 || u >= 1) continue;
    const rx = R * (0.15 + 0.85 * u), ry = rx * 0.18, pts: number[] = [];
    for (let i = 0; i <= 28; i += 1) { const a = (i / 28) * Math.PI * 2; pts.push(ctx.at.x + Math.cos(a) * rx, ctx.at.y + 4 + Math.sin(a) * ry); }
    out.push({ kind: "line", points: pts, stroke: String(p.color ?? "#e6f4ff"), width: Math.max(2, 0.012 * ctx.height), alpha: 0.85 * (1 - u) });
  }
  return out;
}

// PAINT: the canvas (board: false = paint straight on a wall), the brush's strokes so far, then the painting forearm.
function paint(ctx: EffectContext, p: EffectParams): Shape[] {
  const H = ctx.height, w = Number(p.w ?? 0.5) * H, h = Number(p.h ?? 0.4) * H, out: Shape[] = [];
  const x0 = ctx.at.x - w / 2, y0 = ctx.at.y - h / 2;
  if (p.board !== false) {
    const wood = String(p.frame ?? "#8b5a2b");
    if (ctx.at.y + h / 2 < ctx.groundY - 4) for (const dx of [-0.35, 0.35]) out.push({ kind: "line", points: [ctx.at.x + dx * w, ctx.at.y, ctx.at.x + dx * w * 1.3, ctx.groundY], stroke: wood, width: Math.max(4, 0.02 * H) });
    out.push({ kind: "rect", x: x0, y: y0, w, h, fill: String(p.canvas ?? "#fbfaf4"), stroke: wood, width: Math.max(4, 0.02 * H) });
  }
  const col = String(p.color ?? "#f59e0b"), width = Number(p.width ?? 0.035) * H;
  for (const s of (Array.isArray(p.trail) ? p.trail : []) as number[][]) {
    const pts: number[] = [];
    for (let i = 0; i + 2 < s.length; i += 3) if (s[i] <= ctx.t + 1e-6) pts.push(s[i + 1], s[i + 2]);
    if (pts.length >= 4) out.push({ kind: "line", points: pts, stroke: col, width });
    else if (pts.length === 2) out.push({ kind: "circle", x: pts[0], y: pts[1], r: width / 2, fill: col });
  }
  const arm = Array.isArray(p.arm) ? (p.arm as number[]) : [], i = Math.round(ctx.t * Number(p.fps ?? 24)) * 4;
  if (arm.length > i + 3 && arm[i] > -9999) {
    const [ex, ey, hx, hy] = arm.slice(i, i + 4), near = Math.abs(hx - ctx.at.x) < w / 2 + 0.1 * H && Math.abs(hy - ctx.at.y) < h / 2 + 0.1 * H;
    if (near) out.push({ kind: "line", points: [ex, ey, hx, hy], stroke: String(p.armColor ?? "#111111"), width: Number(p.armWidth ?? 7) });
  }
  return out;
}

// A FIGURE IN FRONT OF A COVER, drawn again over it (the engine's own copy of that picture's figure; see rule 4).
function figureOver(ctx: EffectContext, p: EffectParams): Shape[] {
  const all = (Array.isArray(p.lines) ? p.lines : []) as number[][], l = all[Math.round(ctx.t * Number(p.fps ?? 24))] ?? [];
  if (l.length < 39) return [];
  const color = String(p.color ?? "#111111"), width = Number(p.width ?? 7), out: Shape[] = [];
  for (let k = 0; k + 3 < 36; k += 4) out.push({ kind: "line", points: l.slice(k, k + 4), stroke: color, width });
  const [hx, hy, r] = l.slice(36, 39);
  out.push({ kind: "circle", x: hx, y: hy, r, ...(p.headFilled === false ? { stroke: color, width } : { fill: color }) });
  return out;
}

export const RECIPES: EffectRecipe[] = [
  { id: "ripples", about: "rings spreading on a water surface where something went in (added by the engine when a thrown thing lands in water); size = how far (x height, 0.5).", draw: ripples },
  { id: "paint", about: "a painting / drawing / writing on a canvas, wall or board at the anchor (its middle; w, h x height, default 0.5 x 0.4): the paint appears ONLY where the painter's brush hand moves over it, stroke by stroke (params.by = the painter's id; a brush prop in that hand); color, width (x height, 0.035); board: false = no easel canvas (a wall). Layer front: body, canvas, then the painting forearm and brush in front.", draw: paint },
  { id: "figureOver", about: "(engine only) a figure walking in front of a cover a hider is behind, drawn over it.", draw: figureOver },
];
