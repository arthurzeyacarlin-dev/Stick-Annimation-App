// ONE WORLD (Oct 15 deep audit). Ten places each worked out "where is that thing" with their own private maths — and they
// disagreed with the picture: the hot stove was DRAWN at y 801–900 but the hazard box said 700–880, so a hand was "burned
// by hot air". Rule: THE WORLD IS WHAT IS DRAWN. `worldAt(scene, built, i)` runs the very same recipe draw the renderer
// runs (effects/index.ts buildEffectFrames: same ctx, same params) for picture i and reads each thing's shapes back as an
// outline: its box, the top of it at any x, the nearest surface point to any point, and whether a point is inside it.
// The figures' FINAL skeletons and the objects' final positions sit next to the things, so every checker, consequence,
// law and solver asks this one place and they all agree with the picture. Cached per built scene and picture.
// Family: every "where is it" question — hazards, hits, surfaces to tumble over, walls to bounce off, hands put ON things.
import { anchorAt, EFFECTS, forearmOf, fromToolHead, glideOffset, shiftShapes, thingGlides, toolHeads, toolWorkers, type EffectTrack, type Point, type Shape } from "./effects/index.ts";
import type { FrameCharacter, FrameObject, Scene, SceneFrames } from "./engine.ts";
import { placedSymbol } from "./symbolMaker.ts";
import { setPropTargetResolver } from "./contacts.ts";

export type WorldBox = { left: number; right: number; top: number; bottom: number };
export type WorldThing = {
  id: string; // `prop<index>` — the track's index in scene.effects
  index: number;
  kind: string;
  name: string;
  box: WorldBox;
  shapes: readonly Shape[];
  topAt: (x: number) => number; // the top of the drawn outline at x (the box top when nothing is drawn at that x)
  nearestSurfacePoint: (p: Point) => Point;
  contains: (p: Point) => boolean;
};
export type World = { things: WorldThing[]; figures: readonly FrameCharacter[]; objects: readonly FrameObject[]; t: number; thing: (index: number) => WorldThing | undefined };

const cache = new WeakMap<object, Map<number, World>>(); // keyed on the frames array, so a solver mid-build shares the cache

// The box round the drawn shapes (strokes included, see-through shapes skipped; a symbol by its made box).
export function shapesBox(shapes: readonly Shape[]): WorldBox | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  const see = (x: number, y: number, pad = 0) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; left = Math.min(left, x - pad); right = Math.max(right, x + pad); top = Math.min(top, y - pad); bottom = Math.max(bottom, y + pad); };
  for (const s of shapes) {
    if ((s as { alpha?: number }).alpha === 0) continue;
    if (s.kind === "symbol") {
      let w = 0, h = 0;
      try { const made = placedSymbol(s); w = made.width * (s.scale ?? 1); h = made.height * (s.scale ?? 1); } catch { /* an unknown symbol: a point */ }
      const half = s.rotation ? Math.hypot(w, h) / 2 : 0;
      if (half) see(s.x, s.y, half); else { see(s.x - w / 2, s.y - h / 2); see(s.x + w / 2, s.y + h / 2); }
      continue;
    }
    const stroke = s.kind === "line" ? s.width / 2 : s.stroke ? (s.width ?? 2) / 2 : 0;
    if (s.kind === "circle") { see(s.x, s.y, s.r + stroke); continue; }
    if (s.kind === "rect") { see(s.x, s.y, stroke); see(s.x + s.w, s.y + s.h, stroke); continue; }
    for (let i = 0; i + 1 < s.points.length; i += 2) see(s.points[i], s.points[i + 1], stroke);
  }
  return left <= right ? { left, right, top, bottom } : null;
}

// The top of the drawn outline at x: the highest point of any shape that covers that x.
function topOfShapesAt(shapes: readonly Shape[], x: number, fallback: number): number {
  let top = Infinity;
  for (const s of shapes) {
    if ((s as { alpha?: number }).alpha === 0) continue;
    if (s.kind === "circle") { const dx = x - s.x; if (Math.abs(dx) <= s.r) top = Math.min(top, s.y - Math.sqrt(s.r * s.r - dx * dx)); continue; }
    if (s.kind === "rect") { const l = Math.min(s.x, s.x + s.w), r = Math.max(s.x, s.x + s.w); if (x >= l && x <= r) top = Math.min(top, Math.min(s.y, s.y + s.h)); continue; }
    if (s.kind === "symbol") { const b = shapesBox([s]); if (b && x >= b.left && x <= b.right) top = Math.min(top, b.top); continue; }
    const pts = s.points, n = pts.length / 2;
    if (n < 2) continue;
    const closed = s.kind !== "line";
    for (let k = 0; k < (closed ? n : n - 1); k += 1) {
      const ax = pts[2 * k], ay = pts[2 * k + 1], bx = pts[(2 * ((k + 1) % n))], by = pts[2 * ((k + 1) % n) + 1];
      if ((x < Math.min(ax, bx)) || (x > Math.max(ax, bx))) continue;
      const y = ax === bx ? Math.min(ay, by) : ay + ((x - ax) / (bx - ax)) * (by - ay);
      top = Math.min(top, y - (s.kind === "line" ? s.width / 2 : 0));
    }
  }
  return Number.isFinite(top) ? top : fallback;
}

// TOUCH THE DRAWING, NOT ITS BOX (Oct 15, the hot pan: "near" aimed at the stove's invisible box corner — the tip of the pan
// handle's box, empty air — and the law measured the same box, so "0 px" was a lie). A point is ON a thing only when it is on or
// inside one of its DRAWN shapes, and the nearest surface point is the nearest point of a drawn shape's outline.
type Seg = [number, number, number, number, number]; // ax, ay, bx, by, half line width
function segsOf(s: Shape): { segs: Seg[]; closed: boolean } | null {
  if (s.kind === "circle" || s.kind === "symbol") return null;
  if (s.kind === "rect") { const l = Math.min(s.x, s.x + s.w), r = Math.max(s.x, s.x + s.w), t = Math.min(s.y, s.y + s.h), b = Math.max(s.y, s.y + s.h), h = s.stroke ? (s.width ?? 2) / 2 : 0; return { segs: [[l, t, r, t, h], [r, t, r, b, h], [r, b, l, b, h], [l, b, l, t, h]], closed: true }; }
  const pts = s.points, n = pts.length / 2, closed = s.kind !== "line", h = s.kind === "line" ? s.width / 2 : (s as { stroke?: string; width?: number }).stroke ? ((s as { width?: number }).width ?? 2) / 2 : 0;
  const segs: Seg[] = [];
  for (let k = 0; k < (closed ? n : n - 1); k += 1) segs.push([pts[2 * k], pts[2 * k + 1], pts[2 * ((k + 1) % n)], pts[2 * ((k + 1) % n) + 1], h]);
  return segs.length ? { segs, closed } : null;
}
function nearestOnSeg(p: Point, [ax, ay, bx, by]: Seg): Point { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / L)); return { x: ax + u * dx, y: ay + u * dy }; }
function inPoly(p: Point, segs: Seg[]): boolean { let c = false; for (const [ax, ay, bx, by] of segs) if ((ay > p.y) !== (by > p.y) && p.x < ((bx - ax) * (p.y - ay)) / (by - ay || 1e-9) + ax) c = !c; return c; }
function shapeContains(s: Shape, p: Point): boolean {
  if ((s as { alpha?: number }).alpha === 0) return false;
  if (s.kind === "circle") return Math.hypot(p.x - s.x, p.y - s.y) <= s.r + (s.stroke ? (s.width ?? 2) / 2 : 0) + 0.5;
  if (s.kind === "symbol") { const b = shapesBox([s]); return !!b && p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom; }
  const g = segsOf(s); if (!g) return false;
  if (g.closed && inPoly(p, g.segs)) return true;
  return g.segs.some((sg) => { const q = nearestOnSeg(p, sg); return Math.hypot(q.x - p.x, q.y - p.y) <= sg[4] + 0.5; });
}
function shapeNearest(s: Shape, p: Point): Point | null {
  if ((s as { alpha?: number }).alpha === 0) return null;
  if (s.kind === "circle") { const d = Math.hypot(p.x - s.x, p.y - s.y) || 1; return { x: s.x + ((p.x - s.x) / d) * s.r, y: s.y + ((p.y - s.y) / d) * s.r }; }
  if (s.kind === "symbol") { const b = shapesBox([s]); return b ? { x: Math.min(b.right, Math.max(b.left, p.x)), y: Math.min(b.bottom, Math.max(b.top, p.y)) } : null; }
  const g = segsOf(s); if (!g) return null;
  let best: Point | null = null, bd = Infinity;
  for (const sg of g.segs) { const q = nearestOnSeg(p, sg), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
  return best;
}

function thingOf(index: number, track: EffectTrack, shapes: readonly Shape[]): WorldThing | null {
  const box = shapesBox(shapes);
  if (!box) return null;
  const name = String(track.params?.name ?? track.params?.symbol ?? track.kind);
  const inBox = (p: Point) => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
  const contains = (p: Point) => inBox(p) && shapes.some((s) => shapeContains(s, p));
  const topAt = (x: number) => topOfShapesAt(shapes, x, box.top);
  const nearestSurfacePoint = (p: Point): Point => {
    // the nearest point of any DRAWN outline (a point already on a shape stays where it is)
    if (contains(p)) return p;
    let best: Point | null = null, bd = Infinity;
    for (const s of shapes) { const q = shapeNearest(s, p); if (q) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } } }
    if (best) return best;
    if (!inBox(p)) {
      // outside: the nearest point of the box, lifted to the drawn top when it sits on the top edge
      const x = Math.min(box.right, Math.max(box.left, p.x)), y = Math.min(box.bottom, Math.max(box.top, p.y));
      return y <= box.top + 1e-6 ? { x, y: topAt(x) } : { x, y };
    }
    // inside: the nearest edge — the drawn top at this x, the sides, or the bottom
    const dTop = p.y - topAt(p.x), dBottom = box.bottom - p.y, dLeft = p.x - box.left, dRight = box.right - p.x;
    const m = Math.min(dTop, dBottom, dLeft, dRight);
    if (m === dTop) return { x: p.x, y: topAt(p.x) };
    if (m === dLeft) return { x: box.left, y: p.y };
    if (m === dRight) return { x: box.right, y: p.y };
    return { x: p.x, y: box.bottom };
  };
  return { id: `prop${index}`, index, kind: track.kind, name, box, shapes, topAt, nearestSurfacePoint, contains };
}

// The world in picture i: every effect track's drawn shapes (exactly as the renderer draws them), the figures and the objects.
export function worldAt(scene: Scene, built: SceneFrames, i: number): World {
  let per = cache.get(built.frames);
  if (!per) cache.set(built.frames, (per = new Map()));
  const hit = per.get(i);
  if (hit) return hit;
  const sc = scene as Scene & { effects?: EffectTrack[]; stageWidth?: number; effectHeight?: number };
  const effects = sc.effects ?? [];
  const height = scene.characters[0]?.height ?? sc.effectHeight ?? 300, stageWidth = sc.stageWidth ?? 1920;
  const characters = built.frames[Math.min(i, built.frames.length - 1)] ?? [], objects = built.objects?.[Math.min(i, built.frames.length - 1)] ?? [];
  const t = i / built.fps;
  const things: WorldThing[] = [];
  if (effects.length) {
    const heads = toolHeads(effects, height), workers = toolWorkers(scene);
    let glides: ReturnType<typeof thingGlides> | undefined;
    effects.forEach((track, index) => {
      if (t < track.start - 1e-9 || t > track.end + 1e-9) return;
      const recipe = EFFECTS[track.kind];
      const at = fromToolHead(track, characters, heads, workers) ?? anchorAt(track.anchor, characters, objects);
      if (!recipe || !at) return;
      const target = track.target ? anchorAt(track.target, characters, objects) : undefined;
      const facing = "character" in track.anchor ? characters.find((c) => c.id === (track.anchor as { character: string }).character)?.facing : undefined;
      const forearm = forearmOf(track.anchor, characters, "character" in track.anchor && workers.has(track.anchor.character));
      let shapes: Shape[];
      try { shapes = recipe.draw({ t: t - track.start, duration: track.end - track.start, fps: built.fps, at, target, height, groundY: scene.groundY, stageWidth, ...(facing ? { facing } : {}), ...(forearm ? { forearm } : {}) } as never, track.params ?? {}); } catch { return; }
      if (!shapes.length) return;
      // (NOTHING EVER JUMPS: a thing that glides to where it is pushed is read where it is drawn, glide included)
      glides ??= thingGlides(effects, built, height, scene.groundY, stageWidth);
      const gl = glideOffset(glides.get(track), t);
      const thing = thingOf(index, track, shiftShapes(shapes, gl.x, gl.y));
      if (thing) things.push(thing);
    });
  }
  const world: World = { things, figures: characters, objects, t, thing: (index) => things.find((th) => th.index === index) };
  per.set(i, world);
  return world;
}

// The nearest thing (by surface gap) to a point in picture i, among the tracks `filter` keeps.
export function nearestThing(world: World, p: Point, filter: (th: WorldThing) => boolean = () => true): { thing: WorldThing; point: Point; gap: number } | undefined {
  let best: { thing: WorldThing; point: Point; gap: number } | undefined;
  for (const thing of world.things) {
    if (!filter(thing)) continue;
    const q = thing.nearestSurfacePoint(p), gap = thing.contains(p) ? 0 : Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || gap < best.gap) best = { thing, point: q, gap };
  }
  return best;
}

// THE SOLVER'S THING TARGETS (contacts.ts, API with the contact pass): a contact on `{prop: index, point}` is resolved here from
// the World — "top": the drawn top of the thing under the hand's x (kept a hand's width inside its ends, so the hand is ON it,
// never hanging off the edge); "near" (default): the nearest drawn surface point to the hand. Null = the thing is not drawn then.
export function propTargetPoint(scene: Scene, frames: FrameCharacter[][], fps: number, index: number, target: { prop: number; point?: "top" | "near" }, hand: Point, height: number): Point | null {
  const built = { fps, frames, objects: [], report: { frameCount: frames.length, fps, characters: [], ok: true } } as unknown as SceneFrames;
  const thing = worldAt(scene, built, index).thing(target.prop);
  if (!thing) return null;
  // "part": the part that sits ON TOP of the thing (a pan on a stove, a cake on a table) — the topmost drawn shape, at its middle
  if ((target.point as string) === "part") {
    let best: WorldBox | null = null;
    for (const s of thing.shapes) { const b = shapesBox([s]); if (b && b.right - b.left > 0.03 * height && (!best || b.top < best.top)) best = b; }
    if (best) { const inset = Math.min(0.02 * height, (best.right - best.left) / 4), x = Math.min(best.right - inset, Math.max(best.left + inset, hand.x)); return { x, y: topOfShapesAt(thing.shapes, x, best.top) }; }
  }
  if (target.point === "top") {
    const inset = Math.min(0.04 * height, (thing.box.right - thing.box.left) / 2);
    const x = Math.min(thing.box.right - inset, Math.max(thing.box.left + inset, hand.x));
    return { x, y: thing.topAt(x) };
  }
  return thing.nearestSurfacePoint(hand);
}
setPropTargetResolver(propTargetPoint); // (the contact pass asks the World for every hand-on-a-thing target)
