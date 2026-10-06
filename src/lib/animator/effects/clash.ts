// ELEMENTS MEETING (SPEC-0017 Phase 2C extras, ELEMENTAL FIGHTS, 2026-10-06): what happens where two powers meet —
// rules, not drawings, like every effect recipe (types.ts). The fight's rules (moves/elements.ts) decide WHEN and
// WHERE elements meet; these recipes draw it:
// - "clash": two streams meeting head-on (a laser beam and an ice stream, fire and water...): each stream shoots out
//   of its source and they meet; where they meet there is a CLASH POINT — a hot white flash, sparks, steam (gray and
//   light gray, like FIRE MEETS WATER) and shards — that slides back and forth as each side pushes (`push`), toward
//   the weaker side; then it BURSTS (`burst`): a flash, a ring, a big cloud of steam and shards flying out and
//   falling. The streams themselves are drawn by their own recipes when there are any (fire, water, laser), only
//   ending at the clash point instead of at a target.
// - "iceCracks": a laser (or fire) hitting ice: cracks spread out from the hit spot, branching, growing.
// - "iceShatter": ice breaking (an ice wall, a thrown crystal zapped mid-air): a quick white flash, pieces of ice
//   ("Ice crystal" symbols — STILL THINGS ARE SYMBOLS) thrown out, tumbling, falling with gravity, landing and fading,
//   and a little frost mist.
// DRAWABLE BY HAND, NOT TOO SIMPLE: a few layered flat colors with zigzag, wavy outlines that change every picture.
// Stateless and seeded: the same moment and knobs always give the same shapes, at 8, 12 or 24 pictures a second.
// Nothing below the ground.
import { RECIPES as FIRE } from "./fire.ts";
import { groundLight } from "./groundLight.ts";
import { RECIPES as LASER } from "./laser.ts";
import { clamp, lerp, lifeOf, mixColor, rand, smooth, wobble } from "./random.ts";
import { wavyOutline } from "./smoke.ts";
import { RECIPES as WATER } from "./water.ts";
import { PLACED_SYMBOLS } from "../symbolMaker.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

// FIRE MEETS WATER (and every hot thing meeting a cold one): steam is gray and light gray, never dark gray.
export const STEAM_GRAY = "#9c9c9c";
export const STEAM_LIGHT = "#d9d9d9";
// The ice colors (the same as effects/iceCrystal.ts): the ice, its dark edge (outlines, cracks), the pale frost.
export const ICE = "#86cdf3";
export const ICE_DEEP = "#2b6cb0";
export const FROST = "#e8f7ff";

export type Element = "laser" | "ice" | "fire" | "water";
// Each element's main color and its light/hot second color (a power's own `color`/`color2` win).
export const ELEMENT_COLORS: Record<Element, [string, string]> = {
  laser: ["#ff2638", "#fff2f2"],
  ice: [ICE, FROST],
  fire: ["#ff5a12", "#ffd23a"],
  water: ["#2a8cff", "#d8f0ff"],
};
export const isElement = (v: unknown): v is Element => v === "laser" || v === "ice" || v === "fire" || v === "water";
// Hot meets cold or wet → steam; anything meeting ice → shards; fire → embers.
export const makesSteam = (a: Element, b: Element) => (a === "laser" || a === "fire") !== (b === "laser" || b === "fire") || (a === "fire" && b === "fire");
export const makesShards = (a: Element, b: Element) => a === "ice" || b === "ice";

const TAU = Math.PI * 2;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

// ---- Little pieces every recipe here uses -------------------------------------------------------------

// A jagged STAR of light (a hand-drawn "kaboom" flash): `n` points, uneven, re-drawn every picture.
function jaggedStar(c: Point, rOut: number, rIn: number, n: number, seed: number, t: number, turn = 0): number[] {
  const pts: number[] = [];
  const tick = Math.floor(t * 24); // (a new zigzag about every picture at 24 fps, the same at any frame rate)
  for (let i = 0; i < 2 * n; i += 1) {
    const a = turn + (i * Math.PI) / n + 0.25 * (rand(seed, i, tick) - 0.5);
    const r = i % 2 === 0 ? rOut * (0.65 + 0.55 * rand(seed, i, tick + 7)) : rIn * (0.8 + 0.4 * rand(seed, i, tick + 13));
    pts.push(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
  }
  return pts;
}

// One shard of ice: the "Ice crystal" Library symbol when the app has it (STILL THINGS ARE SYMBOLS), else a small
// faceted gem drawn here (a light face, a deep face, its dark outline). `size` = its height in px.
export function iceShard(x: number, y: number, size: number, rotation: number, alpha = 1, color = ICE, color2 = ICE_DEEP): Shape[] {
  const made = PLACED_SYMBOLS["Ice crystal"];
  if (made) return [{ kind: "symbol", name: "Ice crystal", x, y, scale: size / made.size, rotation, alpha, color, color2 }];
  const a = (rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), w = size * 0.55;
  const P = (px: number, py: number) => [x + (px - 0.5) * w * c - (py - 0.5) * size * s, y + (px - 0.5) * w * s + (py - 0.5) * size * c];
  const top = P(0.56, 0), right = P(1, 0.31), lowRight = P(0.84, 0.74), bottom = P(0.43, 1), lowLeft = P(0.1, 0.68), left = P(0, 0.33), mid = P(0.5, 0.52);
  const lw = Math.max(1, size * 0.05);
  return [
    { kind: "poly", points: [...top, ...left, ...lowLeft, ...bottom, ...mid], fill: mixColor(color, "#ffffff", 0.5), alpha },
    { kind: "poly", points: [...top, ...right, ...lowRight, ...bottom, ...mid], fill: mixColor(color, color2, 0.3), alpha },
    { kind: "poly", points: [...top, ...right, ...lowRight, ...bottom, ...lowLeft, ...left], stroke: color2, width: lw, alpha },
  ];
}

// A puff of STEAM: a wavy flat shape (never a round cloud puff) that is born at `o`, rises, drifts, grows, gets
// lighter and fades out; `u` = how far through its life (0..1).
function steamWisp(o: Point, u: number, size: number, seed: number, i: number, t: number, drift: number, h: number): Shape | null {
  if (u < 0 || u > 1) return null;
  const x = o.x + drift * h * u + 0.08 * h * wobble(seed, i, t, 2), y = o.y - h * (0.55 * u + 0.15 * u * u);
  const r = size * h * (0.45 + 1.1 * Math.sqrt(u));
  const alpha = (0.85 * smooth(u / 0.12)) * (1 - smooth((u - 0.45) / 0.55));
  if (alpha <= 0.01) return null;
  return { kind: "poly", points: wavyOutline(x, y, r * 1.25, r * 0.8, 0.3 * wobble(seed, i + 3, t, 1), seed + i * 17, t, 0.7, 0.35, -0.4), fill: mixColor(STEAM_GRAY, STEAM_LIGHT, 0.25 + 0.75 * u), alpha };
}

// Short bright streaks thrown out of `o` (a burst at age `t`, or a steady spray when `steady`), falling with gravity.
function sparks(o: Point, t: number, opt: { count: number; life: number; speed: number; dir: number; spread: number; width: number; colors: string[]; core: string; seed: number; steady: boolean; groundY: number; gravity: number }): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < opt.count; i += 1) {
    let age: number, key: number;
    if (opt.steady) {
      const l = lifeOf(t, i, opt.count, opt.life, opt.seed);
      if (l.bornAt < -1e-9) continue;
      age = l.u * opt.life; key = i * 7 + l.n * 131;
    } else { age = t - rand(opt.seed, i, 40) * 0.05; key = i; }
    const life = opt.life * lerp(0.6, 1.3, rand(opt.seed, key, 41));
    if (age < 0 || age > life) continue;
    const a = ((opt.dir + (rand(opt.seed, key, 42) - 0.5) * opt.spread) * Math.PI) / 180;
    const v = opt.speed * lerp(0.45, 1.25, rand(opt.seed, key, 43));
    const at = (s: number) => ({ x: o.x + Math.cos(a) * v * s, y: o.y + Math.sin(a) * v * s + 0.5 * opt.gravity * s * s });
    const head = at(age);
    if (head.y > opt.groundY) continue;
    const tail = at(Math.max(0, age - 0.045));
    const fade = 1 - (age / life) ** 2;
    const pts = [tail.x, Math.min(tail.y, opt.groundY), head.x, head.y];
    out.push({ kind: "line", points: pts, stroke: opt.colors[key % opt.colors.length], width: opt.width * 2.4, alpha: 0.55 * fade, glow: 8 });
    out.push({ kind: "line", points: pts, stroke: opt.core, width: opt.width, alpha: fade, glow: 4 });
  }
  return out;
}

// A piece of something thrown out of `o` with velocity (vx, vy) (px/s) at age `a` under gravity `g`: it flies, lands
// on the ground (bounces a little, slides, stops). Where it is and how far it has turned.
function thrown(o: Point, vx: number, vy: number, a: number, g: number, groundY: number, r: number, spin: number) {
  const floor = groundY - r;
  // (time it lands: o.y + vy t + g t²/2 = floor)
  const disc = vy * vy + 2 * g * Math.max(0, floor - o.y);
  const land = (-vy + Math.sqrt(Math.max(0, disc))) / Math.max(1e-6, g);
  if (o.y >= floor || a <= land) {
    const s = o.y >= floor ? 0 : a;
    return { x: o.x + vx * s, y: Math.min(floor, o.y + vy * s + 0.5 * g * s * s), turn: spin * s, landed: o.y >= floor };
  }
  // after landing: a small bounce, then sliding to a stop (friction)
  const after = a - land, x0 = o.x + vx * land;
  const bounce = Math.abs(vy + g * land) * 0.22, hop = Math.max(0, bounce * after - 0.5 * g * after * after);
  const slide = (vx * 0.35) * (1 - Math.exp(-4 * after)) / 4;
  return { x: x0 + slide, y: floor - hop, turn: spin * land + spin * 0.3 * (1 - Math.exp(-4 * after)) / 4, landed: true };
}

// ---- The streams -------------------------------------------------------------------------------------

type StreamOpt = { color: string; color2: string; size: number; seed: number; gap?: number; cut?: number };

// A LASER BEAM from `from` to `to`: a straight hot beam (it IS light) drawn the hand-drawn way — a wavy glowing tube
// round it whose ripples run along it toward the front, the beam in the laser's color, a white-hot core, and a hot
// spot where it leaves the eyes. Its width flickers a little every picture.
export function laserBeam(from: Point, to: Point, t: number, h: number, o: StreamOpt): Shape[] {
  const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy);
  if (L < 2) return [];
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const W = o.size * h * (1 + 0.14 * wobble(o.seed, 1, t, 30));
  const n = clamp(Math.round(L / 22), 6, 70), top: number[] = [], bottom: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const s = i / n, d = s * L;
    const ripple = 0.32 * Math.sin((d / (0.11 * h)) * TAU - t * 38) + 0.18 * wobble(o.seed, i, t, 14);
    const w = W * (1.7 + ripple) * (0.55 + 0.45 * smooth(s * 6));
    top.push(from.x + ux * d + nx * w, from.y + uy * d + ny * w);
    bottom.push(from.x + ux * d - nx * w, from.y + uy * d - ny * w);
  }
  const back: number[] = [];
  for (let i = bottom.length - 2; i >= 0; i -= 2) back.push(bottom[i], bottom[i + 1]);
  return [
    { kind: "poly", points: [...top, ...back], fill: o.color, alpha: 0.32, glow: 18 },
    { kind: "line", points: [from.x, from.y, to.x, to.y], stroke: o.color, width: W * 1.15, alpha: 0.95, glow: 10 },
    { kind: "line", points: [from.x, from.y, to.x, to.y], stroke: o.color2, width: Math.max(1.5, W * 0.42), alpha: 1 },
    { kind: "circle", x: from.x, y: from.y, r: W * 1.5, fill: o.color2, alpha: 0.9, glow: 12 },
  ];
}

// AN ICE STREAM from `from` (the hands) to `to`: a cone of frost widening toward the front, two flat layers (pale frost
// outside, the ice color inside) with jagged ZIGZAG edges (ice, not smoke) that change every picture, and ice
// crystals flying along it, tumbling.
export function iceStream(from: Point, to: Point, t: number, h: number, o: StreamOpt): Shape[] {
  const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy);
  if (L < 2) return [];
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const W0 = o.size * h;
  const tick = Math.floor(t * 24);
  const cone = (k: number, layer: number): number[] => {
    const n = clamp(Math.round(L / 26), 5, 50), top: number[] = [], bottom: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      const s = i / n, d = s * L, half = W0 * k * (0.55 + 1.3 * s) * (1 + 0.08 * wobble(o.seed, i + layer * 50, t, 6));
      const zig = i === 0 || i === n ? 1 : i % 2 === 0 ? 1.12 : 0.78;
      const j1 = 0.85 + 0.3 * rand(o.seed + layer, i, tick), j2 = 0.85 + 0.3 * rand(o.seed + layer, i + 99, tick);
      top.push(from.x + ux * d + nx * half * zig * j1, from.y + uy * d + ny * half * zig * j1);
      bottom.push(from.x + ux * d - nx * half * (2 - zig) * j2, from.y + uy * d - ny * half * (2 - zig) * j2);
    }
    const back: number[] = [];
    for (let i = bottom.length - 2; i >= 0; i -= 2) back.push(bottom[i], bottom[i + 1]);
    return [...top, ...back];
  };
  const out: Shape[] = [
    { kind: "poly", points: cone(1.25, 0), fill: o.color2, alpha: 0.7, glow: 10 },
    { kind: "poly", points: cone(0.72, 1), fill: o.color, alpha: 0.85 },
    { kind: "line", points: [from.x, from.y, from.x + ux * L * 0.97, from.y + uy * L * 0.97], stroke: "#ffffff", width: Math.max(1.5, W0 * 0.25), alpha: 0.8 },
  ];
  // crystals riding the stream (each lives one trip from the hands to the front)
  const N = clamp(Math.round(L / (0.45 * h)), 2, 7), life = clamp(L / (3.4 * h), 0.12, 0.8);
  for (let i = 0; i < N; i += 1) {
    const { n, u } = lifeOf(t, i, N, life, o.seed + 5);
    const d = u * L, side = (rand(o.seed, i, n * 3 + 1) - 0.5) * W0 * 1.4 * (0.5 + s01(u));
    out.push(...iceShard(from.x + ux * d + nx * side, from.y + uy * d + ny * side, h * (0.055 + 0.03 * rand(o.seed, i, n * 3 + 2)), 360 * rand(o.seed, i, n * 3) + 540 * u, 1, ICE, ICE_DEEP));
  }
  return out;
}
const s01 = (u: number) => clamp(u, 0, 1);

const FIRE_STREAM = FIRE.find((r) => r.id === "fireStream")!;
const LASER_EYES = LASER.find((r) => r.id === "laserEyes");
const WATER_STREAM = WATER.find((r) => r.id === "waterStream")!;

// The stream of one element from `from` to `to` (its front: where it meets the other one). Fire and water are drawn
// by their own recipes (fire.ts fireStream, water.ts waterStream); a laser and an ice stream here.
export function streamOf(element: Element, ctx: EffectContext, from: Point, to: Point, t: number, o: StreamOpt): Shape[] {
  // (Laser eyes: their own recipe — two beams from the glowing eyes — shooting at once and cut off at `cut`.)
  if (element === "laser") return LASER_EYES
    ? LASER_EYES.draw({ ...ctx, t, duration: t + 10, at: from, target: to }, { color: o.color, color2: o.color2, fireAt: 0, cutAt: o.cut ?? t + 10, ...(o.gap !== undefined ? { gap: o.gap } : {}), seed: o.seed })
    : laserBeam(from, to, t, ctx.height, o);
  if (element === "ice") return iceStream(from, to, t, ctx.height, o);
  // (Their own recipes, told the stream runs on for a long time so it never tails off before the clash ends.)
  const c: EffectContext = { ...ctx, t, duration: t + 10, at: from, target: to };
  if (element === "fire") return FIRE_STREAM.draw(c, { color: o.color, color2: o.color2, reach: 0.08, size: o.size * 0.8, seed: o.seed });
  return WATER_STREAM.draw(c, { color: o.color, color2: o.color2, size: o.size, seed: o.seed });
}

// ---- clash ----------------------------------------------------------------------------------------------

// Where the clash point is at time t: `push` = [t0, u0, t1, u1, ...] (seconds into the clash, and how far along from
// the anchor to the target: 0 = at the anchor, 1 = at the target), eased from key to key, with a small struggle.
export function clashU(push: readonly number[], t: number, seed = 1): number {
  const keys: [number, number][] = [];
  for (let i = 0; i + 1 < push.length; i += 2) keys.push([push[i], push[i + 1]]);
  if (keys.length === 0) keys.push([0, 0.5]);
  let u = keys[keys.length - 1][1];
  if (t <= keys[0][0]) u = keys[0][1];
  else for (let i = 1; i < keys.length; i += 1) if (t <= keys[i][0]) { const [t0, u0] = keys[i - 1], [t1, u1] = keys[i]; u = lerp(u0, u1, smooth((t - t0) / Math.max(1e-6, t1 - t0))); break; }
  return clamp(u + 0.012 * wobble(seed, 77, t, 9), 0.05, 0.95);
}

function clash(ctx: EffectContext, p: EffectParams): Shape[] {
  if (!ctx.target) return [];
  const h = ctx.height, seed = num(p.seed, 1), t = ctx.t;
  const left: Element = isElement(p.left) ? p.left : "laser", right: Element = isElement(p.right) ? p.right : "ice";
  const lc = { color: str(p.leftColor, ELEMENT_COLORS[left][0]), color2: str(p.leftColor2, ELEMENT_COLORS[left][1]) };
  const rc = { color: str(p.rightColor, ELEMENT_COLORS[right][0]), color2: str(p.rightColor2, ELEMENT_COLORS[right][1]) };
  const push = Array.isArray(p.push) ? (p.push as number[]) : [0, 0.5];
  const reach = clamp(num(p.reach, 0.12), 0.02, 1);
  const burst = clamp(num(p.burst, ctx.duration - 0.8), reach, ctx.duration);
  const cut = clamp(num(p.cut, burst), reach, burst);
  const size = num(p.size, 1);
  const gapL = typeof p.leftGap === "number" ? p.leftGap : undefined, gapR = typeof p.rightGap === "number" ? p.rightGap : undefined;
  const A = ctx.at, B = ctx.target;
  const at = (u: number): Point => ({ x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u) });
  // (The burst happens at a fixed spot — where they last met — whatever the bodies do next.)
  const fixed: Point = typeof p.burstX === "number" && typeof p.burstY === "number" ? { x: p.burstX, y: p.burstY } : at(clashU(push, cut, seed));
  const steam = makesSteam(left, right), shards = makesShards(left, right);
  const out: Shape[] = [];
  const mix = mixColor(lc.color, rc.color, 0.5);
  const width = (e: Element) => (e === "laser" ? 0.022 : e === "ice" ? 0.05 : 0.06) * size;
  // THE CLASH POINT (while they push, and swelling once the streams stop): light on the ground under it, a glow, two
  // jagged stars of light (the two colors) and a white-hot one, sparks spraying out (mostly up and out, falling),
  // steam rising off it where hot meets cold, shards breaking off where there is ice.
  const point = (P: Point, met: number, swell: number) => {
    const tc = Math.max(0, t - reach), big = 1 + 0.9 * swell;
    out.push(...groundLight(P.x, ctx.groundY, h * 0.9 * big, h * 0.03, mix, (0.16 + 0.1 * swell) * met, "#ffffff"));
    out.push({ kind: "circle", x: P.x, y: P.y, r: h * 0.13 * big * (1 + 0.15 * wobble(seed, 2, t, 12 + 20 * swell)) * met, fill: mix, alpha: 0.22 * met, glow: 24 });
    out.push({ kind: "poly", points: jaggedStar(P, h * 0.17 * big * met, h * 0.07 * big * met, 6, seed + 11, t, 0.4), fill: lc.color, alpha: 0.85 });
    out.push({ kind: "poly", points: jaggedStar(P, h * 0.15 * big * met, h * 0.06 * big * met, 7, seed + 12, t, 0), fill: rc.color, alpha: 0.85 });
    out.push({ kind: "poly", points: jaggedStar(P, h * 0.11 * big * met, h * 0.045 * big * met, 5, seed + 13, t, 0.2), fill: "#ffffff", alpha: 0.95, glow: 14 });
    out.push(...sparks(P, tc, { count: 14, life: 0.32, speed: h * 1.7 * big, dir: -90, spread: 200, width: Math.max(1, h * 0.006), colors: [lc.color, rc.color, lc.color2], core: "#ffffff", seed: seed + 21, steady: true, groundY: ctx.groundY, gravity: h * 6 }));
    if (steam) for (let i = 0; i < 7; i += 1) {
      const l = lifeOf(tc, i, 7, 1.1, seed + 31);
      if (l.bornAt < -1e-9) continue;
      const w = steamWisp({ x: P.x + (rand(seed, i, l.n) - 0.5) * 0.12 * h, y: P.y }, l.u, 0.07, seed + 33, i + l.n * 11, t, (rand(seed, i, l.n + 5) - 0.5) * 0.5, h);
      if (w) out.push(w);
    }
    if (shards) for (let i = 0; i < 5; i += 1) {
      const l = lifeOf(tc, i, 5, 0.6, seed + 41);
      if (l.bornAt < -1e-9) continue;
      const key = i * 13 + l.n * 7, side = rand(seed, key, 1) < 0.5 ? -1 : 1;
      const q = thrown(P, side * h * lerp(0.4, 1.1, rand(seed, key, 2)), -h * lerp(0.8, 1.8, rand(seed, key, 3)), l.u * 0.6, h * 8, ctx.groundY, h * 0.03, side * 500);
      out.push(...iceShard(q.x, q.y, h * lerp(0.045, 0.08, rand(seed, key, 4)), 360 * rand(seed, key, 5) + q.turn, 1 - smooth((l.u - 0.75) / 0.25)));
    }
  };
  if (t < cut) {
    // 1) THE STREAMS shoot out of their sources and meet; then each runs from its source to the clash point.
    const P = at(clashU(push, t, seed));
    const grow = smooth(t / reach);
    const lf = { x: lerp(A.x, P.x, grow), y: lerp(A.y, P.y, grow) }, rf = { x: lerp(B.x, P.x, grow), y: lerp(B.y, P.y, grow) };
    out.push(...streamOf(left, ctx, A, lf, t, { ...lc, size: width(left), seed, gap: gapL }));
    out.push(...streamOf(right, ctx, B, rf, t, { ...rc, size: width(right), seed: seed + 3, gap: gapR }));
    const met = smooth((t - reach * 0.85) / 0.08);
    if (met > 0) point(P, met, 0);
  } else if (t < burst) {
    // 2) THE SWELL: the streams stop (what is left of them flies into the point and is gone in a moment) and the
    // clash point, left on its own, swells and flickers faster and faster — then it bursts.
    const a = t - cut, P0 = at(clashU(push, cut, seed)), k = smooth(a / 0.12);
    const P = { x: lerp(P0.x, fixed.x, k), y: lerp(P0.y, fixed.y, k) };
    const gone = 1 - smooth(a / 0.1);
    const u = clashU(push, cut, seed), back = smooth(a / 0.1);
    // (a laser cuts off its own way — the back of the beams runs out to the point, the eyes fade)
    if (left === "laser") out.push(...streamOf(left, ctx, A, P, t, { ...lc, size: width(left), seed, gap: gapL, cut }));
    else if (gone > 0) out.push(...streamOf(left, ctx, at(u * back), P, t, { ...lc, size: width(left) * gone, seed }));
    if (right === "laser") out.push(...streamOf(right, ctx, B, P, t, { ...rc, size: width(right), seed: seed + 3, gap: gapR, cut }));
    else if (gone > 0) out.push(...streamOf(right, ctx, at(lerp(1, u, back)), P, t, { ...rc, size: width(right) * gone, seed: seed + 3 }));
    point(P, 1, smooth(a / Math.max(0.05, burst - cut)));
  } else {
    // 3) THE BURST where they last met: a flash, a ring, a big cloud of steam rolling out and up, shards (ice)
    // thrown out in arcs, landing and fading, and sparks.
    const a = t - burst;
    const P = fixed;
    if (cut >= burst - 1e-6) {
      // (no swell: the streams snap off right here)
      const gone = 1 - smooth(a / 0.1), u = clashU(push, burst, seed), back = smooth(a / 0.1);
      if (gone > 0) {
        out.push(...streamOf(left, ctx, at(u * back), P, t, { ...lc, size: width(left) * gone, seed }));
        out.push(...streamOf(right, ctx, at(lerp(1, u, back)), P, t, { ...rc, size: width(right) * gone, seed: seed + 3 }));
      }
    }
    const flash = smooth(a / 0.08) * (1 - smooth((a - 0.1) / 0.3));
    out.push(...groundLight(P.x, ctx.groundY, h * 1.4, h * 0.04, mix, 0.3 * flash + 0.06 * (1 - smooth((a - 0.4) / 0.6)), "#ffffff"));
    if (flash > 0.01) {
      const R = h * (0.3 + 0.45 * smooth(a / 0.15));
      // (a jagged flash, never a round disc)
      out.push({ kind: "poly", points: jaggedStar(P, R, R * 0.42, 8, seed + 51, t, 0.2), fill: lc.color2, alpha: 0.9 * flash, glow: 20 });
      out.push({ kind: "poly", points: jaggedStar(P, R * 0.8, R * 0.34, 7, seed + 53, t, 0.5), fill: rc.color, alpha: 0.7 * flash });
      out.push({ kind: "poly", points: jaggedStar(P, R * 0.6, R * 0.26, 7, seed + 52, t, 0), fill: "#ffffff", alpha: flash });
    }
    const ring = 1 - smooth(a / 0.45);
    if (ring > 0.01) out.push({ kind: "poly", points: wavyOutline(P.x, P.y, h * (0.25 + 2.2 * a), h * (0.18 + 1.2 * a), 0, seed + 61, t, 0.4), stroke: mixColor(mix, "#ffffff", 0.5), width: h * 0.012 * ring, alpha: 0.8 * ring });
    // the steam cloud: wavy flat lumps thrown out round the point, slowing, rising, growing, lighter and gone
    if (steam || num(p.smoke, 0) > 0) for (let i = 0; i < 11; i += 1) {
      const dir = -Math.PI / 2 + (rand(seed, i, 71) - 0.5) * Math.PI * 1.7, sp = h * lerp(0.7, 1.6, rand(seed, i, 72));
      const go = (1 - Math.exp(-3.2 * a)) / 3.2;
      const o = { x: P.x + Math.cos(dir) * sp * go, y: Math.min(ctx.groundY - 0.05 * h, P.y + Math.sin(dir) * sp * go * 0.7) };
      const u = clamp(a / lerp(1.2, 1.9, rand(seed, i, 73)), 0, 1);
      const w = steamWisp(o, u, 0.11 + 0.05 * rand(seed, i, 74), seed + 75, i, t, (rand(seed, i, 76) - 0.5) * 0.4, h);
      if (w) out.push(w);
    }
    const n = shards ? 14 : 0;
    for (let i = 0; i < n; i += 1) {
      const dir = -Math.PI / 2 + (rand(seed, i, 81) - 0.5) * Math.PI * 1.5, sp = h * lerp(1.2, 3, rand(seed, i, 82));
      const q = thrown(P, Math.cos(dir) * sp, Math.sin(dir) * sp, a, h * 9, ctx.groundY, h * 0.03, (rand(seed, i, 83) - 0.5) * 1400);
      const fade = 1 - smooth((a - (ctx.duration - burst) * 0.65) / ((ctx.duration - burst) * 0.35 + 1e-6));
      if (fade > 0.01) out.push(...iceShard(q.x, q.y, h * lerp(0.05, 0.12, rand(seed, i, 84)), 360 * rand(seed, i, 85) + q.turn, fade));
    }
    out.push(...sparks(P, a, { count: 18, life: 0.45, speed: h * 2.6, dir: -90, spread: 300, width: Math.max(1, h * 0.007), colors: [lc.color, rc.color], core: "#ffffff", seed: seed + 91, steady: false, groundY: ctx.groundY, gravity: h * 7 }));
  }
  return keepAbove(out, ctx.groundY);
}

// ---- iceStream ------------------------------------------------------------------------------------------

// An ICE STREAM from the anchor (the hands) to the target: the front shoots out (`reach` s to get there), holds,
// and at the end the back leaves the hands and runs out to the target.
function iceStreamRecipe(ctx: EffectContext, p: EffectParams): Shape[] {
  const h = ctx.height, seed = num(p.seed, 1);
  const to = ctx.target ?? { x: ctx.at.x + Math.cos((num(p.direction, 0) * Math.PI) / 180) * 2.4 * h, y: ctx.at.y + Math.sin((num(p.direction, 0) * Math.PI) / 180) * 2.4 * h };
  const reach = clamp(num(p.reach, 0.25), 0.03, 2), tail = Math.min(0.2, ctx.duration * 0.3);
  const front = smooth(ctx.t / reach), back = smooth((ctx.t - (ctx.duration - tail)) / tail);
  const a = { x: lerp(ctx.at.x, to.x, back), y: lerp(ctx.at.y, to.y, back) }, b = { x: lerp(ctx.at.x, to.x, front), y: lerp(ctx.at.y, to.y, front) };
  if (front <= back) return [];
  return keepAbove(iceStream(a, b, ctx.t, h, { color: str(p.color, ICE), color2: str(p.color2, FROST), size: num(p.size, 0.05), seed }), ctx.groundY);
}

// ---- iceCracks ------------------------------------------------------------------------------------------

// Cracks spreading out from the anchor (where a laser or fire hits ice) over the effect's time: 5-7 zigzag cracks out
// of a hot white spot, each branching part way, growing; dark ice-blue lines with a thin white edge beside them.
function iceCracks(ctx: EffectContext, p: EffectParams): Shape[] {
  const h = ctx.height, seed = num(p.seed, 1), reach = num(p.size, 0.35) * h;
  const g = smooth(ctx.t / Math.max(0.05, ctx.duration * 0.85));
  const color = str(p.color, ICE_DEEP), color2 = str(p.color2, "#ffffff");
  const from = num(p.direction, 180) * (Math.PI / 180); // where the hit comes from: the cracks run away from it
  const o = ctx.at, out: Shape[] = [];
  const main = 5 + Math.floor(rand(seed, 1, 1) * 3);
  const crack = (x: number, y: number, ang: number, len: number, segs: number, key: number): number[] => {
    const pts = [x, y];
    let cx = x, cy = y, a = ang;
    for (let s = 0; s < segs; s += 1) {
      a += (rand(seed, key, s) - 0.5) * 0.9;
      const l = (len / segs) * (0.7 + 0.6 * rand(seed, key, s + 20));
      cx += Math.cos(a) * l; cy += Math.sin(a) * l;
      pts.push(cx, Math.min(cy, ctx.groundY - 1));
    }
    return pts;
  };
  const lw = Math.max(1.2, h * 0.007);
  for (let i = 0; i < main; i += 1) {
    // (more of them run up, down and away than back toward the hit)
    const ang = from + Math.PI + (i / main - 0.5) * Math.PI * 1.7 + 0.3 * (rand(seed, i, 2) - 0.5);
    const len = reach * (0.55 + 0.45 * rand(seed, i, 3)) * smooth((g - 0.08 * i / main) / 0.85);
    if (len < 2) continue;
    const pts = crack(o.x, o.y, ang, len, 4, i * 31);
    out.push({ kind: "line", points: pts.map((v, k) => v + (k % 2 === 0 ? 1.2 : -1.2)), stroke: color2, width: lw * 0.6, alpha: 0.85 });
    out.push({ kind: "line", points: pts, stroke: color, width: lw, alpha: 0.95 });
    // a branch from part way along
    const bi = 2 + 2 * Math.floor(rand(seed, i, 4) * 2);
    if (pts.length > bi + 1 && g > 0.35) {
      const bl = len * 0.45 * smooth((g - 0.35) / 0.5);
      if (bl > 2) out.push({ kind: "line", points: crack(pts[bi], pts[bi + 1], ang + (rand(seed, i, 5) < 0.5 ? -0.8 : 0.8), bl, 3, i * 31 + 7), stroke: color, width: lw * 0.75, alpha: 0.9 });
    }
  }
  // the hot spot where it is hit (melting a little)
  const hot = Math.min(1, ctx.t / 0.06) * (1 - 0.2 * smooth(g));
  out.push({ kind: "poly", points: jaggedStar(o, h * 0.06, h * 0.03, 6, seed + 9, ctx.t), fill: color2, alpha: 0.9 * hot, glow: 12 });
  return out;
}

// ---- iceShatter -----------------------------------------------------------------------------------------

// Ice breaking at the anchor: `size` = the half-size of the ice that breaks (x height), `tall` = how tall it stood
// (x height; it is broken from the anchor up: give the anchor at its base), `count` pieces, thrown mostly along
// `direction` (degrees, the way the hit pushes) within `spread`. A quick white flash, pieces of ice tumbling out in
// arcs, falling, landing, sliding a little and fading, and a little frost mist.
function iceShatter(ctx: EffectContext, p: EffectParams): Shape[] {
  const h = ctx.height, seed = num(p.seed, 1), a = ctx.t;
  const size = num(p.size, 0.3) * h, tall = num(p.tall, 0) * h, count = clamp(Math.round(num(p.count, 12)), 3, 30);
  const dir = (num(p.direction, -90) * Math.PI) / 180, spread = (num(p.spread, 150) * Math.PI) / 180;
  const color = str(p.color, ICE), color2 = str(p.color2, ICE_DEEP);
  const c = { x: ctx.at.x, y: ctx.at.y - tall / 2 };
  const out: Shape[] = [];
  const flash = smooth(a / 0.04) * (1 - smooth((a - 0.05) / 0.18));
  if (flash > 0.01) {
    out.push({ kind: "circle", x: c.x, y: c.y, r: (size + tall * 0.3) * 1.1, fill: FROST, alpha: 0.45 * flash, glow: 26 });
    out.push({ kind: "poly", points: jaggedStar(c, size * 1.2 + tall * 0.25, size * 0.45, 7, seed + 3, a), fill: "#ffffff", alpha: 0.9 * flash });
  }
  const fadeFrom = ctx.duration * 0.6;
  for (let i = 0; i < count; i += 1) {
    const o = { x: c.x + (rand(seed, i, 1) - 0.5) * size * 1.2, y: c.y + (rand(seed, i, 2) - 0.5) * (tall * 0.9 + size * 0.6) };
    const ang = dir + (rand(seed, i, 3) - 0.5) * spread, sp = h * lerp(0.8, 2.6, rand(seed, i, 4));
    const pieceSize = h * lerp(0.05, 0.14, rand(seed, i, 5) ** 1.5) * (0.6 + 0.4 * Math.min(1, size / (0.3 * h)));
    const q = thrown(o, Math.cos(ang) * sp, Math.sin(ang) * sp - h * 0.6, a, h * 9, ctx.groundY, pieceSize * 0.3, (rand(seed, i, 6) - 0.5) * 1200);
    const fade = 1 - smooth((a - fadeFrom) / Math.max(1e-6, ctx.duration - fadeFrom));
    if (fade > 0.01) out.push(...iceShard(q.x, q.y, pieceSize, 360 * rand(seed, i, 7) + q.turn, fade, color, color2));
  }
  // frost mist where it stood, drifting and fading
  for (let i = 0; i < 4; i += 1) {
    const u = clamp(a / (0.9 + 0.3 * rand(seed, i, 9)), 0, 1), alpha = 0.55 * smooth(u / 0.1) * (1 - smooth((u - 0.3) / 0.7));
    if (alpha < 0.01) continue;
    const r = (size * 0.6 + tall * 0.15) * (0.6 + 0.8 * u);
    out.push({ kind: "poly", points: wavyOutline(c.x + (rand(seed, i, 10) - 0.5) * size, c.y + (rand(seed, i, 11) - 0.5) * tall * 0.6 - 0.15 * h * u, r * 1.3, r * 0.8, 0, seed + 20 + i, a, 0.6), fill: FROST, alpha });
  }
  return keepAbove(out, ctx.groundY);
}

// Nothing below the ground: points pushed up onto it (a symbol is placed by its middle: kept a little above it).
function keepAbove(shapes: Shape[], groundY: number): Shape[] {
  for (const s of shapes) {
    if (s.kind === "circle") s.y = Math.min(s.y, groundY - s.r);
    else if (s.kind === "symbol") s.y = Math.min(s.y, groundY - 2);
    else if (s.kind === "rect") s.h = Math.max(0, Math.min(s.h, groundY - s.y));
    else for (let i = 1; i < s.points.length; i += 2) s.points[i] = Math.min(s.points[i], groundY - (s.kind === "line" ? s.width / 2 : 0));
  }
  return shapes;
}

export const RECIPES: EffectRecipe[] = [
  { id: "clash", about: "two streams meeting head-on (put the anchor on one source — a laser's eyes, a hand — and the target on the other): each shoots out (`reach` s) and they meet at a CLASH POINT — light on the ground, a glow, jagged stars of white-hot light, sparks spraying and falling, steam (gray and light gray) where hot meets cold, ice shards breaking off — that slides back and forth as they push (`push` = [t0, u0, t1, u1...]: seconds in, and how far along from the anchor, 0..1; it moves toward the weaker side), when the streams stop (`cut` s) the point swells, then BURSTS at `burst` s (at `burstX`, `burstY` when given): a flash, a ring, a big cloud of steam and shards thrown out, falling. `left`/`right` = each side's element (laser, ice, fire, water; fire and water drawn by their own stream recipes), leftColor/leftColor2/rightColor/rightColor2, size, seed.", draw: clash },
  { id: "iceStream", about: "a stream of ice from the anchor (the hands) to the target: a cone of pale frost with the ice color inside, jagged zigzag edges that change every picture, ice crystals flying along it, tumbling. The front shoots out over `reach` s, then it holds; at the end the back leaves the hands. color, color2, size (thickness at the hands x height, 0.05), seed.", draw: iceStreamRecipe },
  { id: "iceCracks", about: "cracks spreading over ice from the anchor (where a laser or fire hits it) over the effect's time: 5-7 zigzag dark ice-blue cracks with a thin white edge, branching part way, out of a hot white spot; they run away from where the hit comes from (`direction`, degrees). size = how far they reach x height (0.35), color, color2, seed.", draw: iceCracks },
  { id: "iceShatter", about: "ice breaking at the anchor (its base): a quick white flash, `count` pieces of ice (the Ice crystal symbol) thrown out along `direction` within `spread`, tumbling, falling with gravity, landing, sliding a little and fading, and some frost mist. size = the ice's half-width x height (0.3), tall = how tall it stood x height, color, color2, seed.", draw: iceShatter },
];
