// ICE recipes (SPEC-0017 Phase 2C, Arthur 2026-10-06: "ice should be like cool ice: a stick figure lifts up his
// hand and an ice mountain appears, or he can throw ice crystals"). Rules, not drawings:
// - ICE GROWS small → big ("from least to biggest") straight UP OUT OF THE GROUND, quickly, with a little overshoot,
//   holds, then CRACKS (dark crack lines, a little shiver) and SHATTERS into pieces that fall under earth gravity,
//   land and fade, with a little frost mist (smoke rules — wavy, rising, fading — but white and pale blue).
// - THROWN CRYSTALS fly from the hand to the target, spinning, with a faint frost streak behind, and shatter on the
//   hit (small pieces, a frost puff, a quick icy crack-star, a thin cold light on the ground when near it).
// STILL THINGS ARE SYMBOLS (Arthur: the spikes "all look basically the same"): every spike is the "Ice spike" Library
// symbol — growing is its placement scaling up; sized, slightly turned and flipped per spike — every thrown crystal or
// big falling chunk is an "Ice crystal" and every little falling bit an "Ice crumb" (iceCrystal.ts). Only what changes
// shape is drawn: the cracks (strokes over the spikes), the shatter flash, the mist. DRAWABLE BY HAND, NOT TOO
// SIMPLE: a spike is a jagged outline in a few flat light blues with a lit face, a ridge, a facet line and a white
// highlight — never hundreds of tiny pieces.
// Knobs: color = the ice, color2 = its dark edge (outlines, cracks), size, speed, seed (+ per recipe below).
// Stateless and seeded: the same moment always gives the same shapes, at 8, 12 or 24 pictures a second. Nothing
// goes below the ground.
import { clamp, lerp, mixColor, rand, smooth } from "./random.ts";
import { groundLight } from "./groundLight.ts";
import { FROST, ICE, ICE_DEEP, ICE_SPIKE, ICE_SPIKE_ASPECT } from "./iceCrystal.ts";
import { wavyOutline } from "./smoke.ts";
import { keepAboveGround } from "./water.ts";
import { PLACED_SYMBOLS } from "../symbolMaker.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

const GRAVITY = 4; // x figure height, px/s² (the same earth gravity as the water drops)
// How fast an ice row runs along the ground toward its target (x height per second), and how fast thrown crystals fly.
export const ICE_RUN_SPEED = 3.5;
export const ICE_FLY_SPEED = 5;
// A spike grows in GROW_SECONDS; it cracks for CRACK_SECONDS before it shatters; its pieces are gone FALL_SECONDS later.
export const GROW_SECONDS = 0.18;
export const CRACK_SECONDS = 0.25;
export const FALL_SECONDS = 0.9;
// A thrown crystal's pieces and puff are gone this long after its hit.
export const HIT_SECONDS = 0.75;
// Crystals thrown together leave the hand this far apart (seconds).
export const SHARD_STAGGER = 0.06;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
type Knobs = { color: string; color2: string; size: number; speed: number; seed: number };
function knobs(p: EffectParams, size: number): Knobs {
  return {
    color: typeof p.color === "string" ? p.color : ICE,
    color2: typeof p.color2 === "string" ? p.color2 : ICE_DEEP,
    size: Math.max(0.02, num(p.size, size)),
    speed: clamp(num(p.speed, 1), 0.1, 5),
    seed: num(p.seed, 3),
  };
}

// A spike pops up quickly and a little too far, then settles back (an overshoot of about 8%).
const popUp = (u: number) => { const v = clamp(u, 0, 1) - 1; return 1 + 2.2 * v * v * v + 1.2 * v * v; };

// ---- Ice symbol placements (Library symbols: "Ice crystal", "Ice spike", "Ice crumb") ----------------------
type IceSymbol = "Ice crystal" | "Ice spike" | "Ice crumb";
const recolor = (k: Knobs) => ({ ...(k.color !== ICE ? { color: k.color } : {}), ...(k.color2 !== ICE_DEEP ? { color2: k.color2 } : {}) });
// `tall` = the height of its box in stage px.
function placeIce(out: Shape[], name: IceSymbol, x: number, y: number, tall: number, rotation: number, k: Knobs, alpha = 1) {
  if (alpha <= 0.01 || tall < 1) return;
  out.push({ kind: "symbol", name, x, y, scale: tall / PLACED_SYMBOLS[name].size, rotation, alpha, ...recolor(k) });
}
const crystal = (out: Shape[], x: number, y: number, tall: number, rotation: number, k: Knobs, alpha = 1) => placeIce(out, "Ice crystal", x, y, tall, rotation, k, alpha);

// A falling piece (an Ice crystal chunk or an Ice crumb): thrown from p0 with velocity v at age 0, under gravity; it
// lands on the ground and stays there, fading from `fadeFrom` to `fadeTo` seconds. Spins `spin` degrees a second
// until it lands.
function piece(out: Shape[], o: { name?: IceSymbol; p0: Point; v: Point; tall: number; rot0: number; spin: number; age: number; fadeFrom: number; fadeTo: number }, k: Knobs, ctx: EffectContext) {
  if (o.age < 0) return;
  const G = GRAVITY * ctx.height, rest = ctx.groundY - o.tall * 0.42;
  // when it reaches the ground (it is never below it)
  const dy = rest - o.p0.y;
  const land = dy <= 0 ? 0 : (-o.v.y + Math.sqrt(o.v.y * o.v.y + 2 * G * dy)) / G;
  const a = Math.min(o.age, land);
  const slide = o.age > land ? o.v.x * 0.06 * (1 - Math.exp(-(o.age - land) / 0.05)) : 0; // a little skid, then still
  const x = o.p0.x + o.v.x * a + slide, y = Math.min(rest, o.p0.y + o.v.y * a + 0.5 * G * a * a);
  const alpha = 1 - smooth((o.age - o.fadeFrom) / Math.max(0.01, o.fadeTo - o.fadeFrom));
  placeIce(out, o.name ?? "Ice crystal", x, y, o.tall, o.rot0 + o.spin * a, k, alpha);
}

// A bit of FROST MIST: smoke's wavy outline, pale, rising a little and fading (u: 0..1 of its life).
function mist(out: Shape[], x: number, y: number, rx: number, u: number, k: Knobs, seed: number, ts: number, alpha: number, n = 0) {
  if (u < 0 || u > 1 || alpha <= 0.01) return;
  const grow = 0.55 + 0.75 * smooth(u * 1.4), a = alpha * (1 - smooth((u - 0.25) / 0.75));
  if (a <= 0.01) return;
  const fill = n % 2 === 0 ? mixColor(k.color, "#ffffff", 0.62) : FROST;
  out.push({ kind: "poly", points: wavyOutline(x, y, rx * grow, rx * 0.38 * grow, 0, seed, ts, 0.7, 0.3, 0), fill, alpha: a });
}

// ---- iceSpikes: the ice mountain -------------------------------------------------------------------------
// A spike: base middle x, full height H (and about how wide W), the way it leans (sign: + = right; the "Ice spike"
// symbol leans right, so a left-leaning one is flipped), a slight turn (degrees), when it starts growing.
type Spike = { x: number; H: number; W: number; lean: number; turn: number; born: number; main: boolean; seed: number };

// The spikes: a ROW from the anchor to the target (small near the caster, biggest at the target), or one MOUNTAIN
// (small outer spikes first, the biggest in the middle last).
function layoutSpikes(ctx: EffectContext, p: EffectParams, k: Knobs): { spikes: Spike[]; dir: number } {
  const h = ctx.height, tall = k.size * h;
  const dir = ctx.target ? (ctx.target.x >= ctx.at.x ? 1 : -1) : Math.cos((num(p.direction, 0) * Math.PI) / 180) >= 0 ? 1 : -1;
  const spikes: Spike[] = [];
  const add = (x: number, H: number, lean: number, born: number, main: boolean, i: number) =>
    spikes.push({ x, H, W: H * ICE_SPIKE_ASPECT, lean, turn: Math.sign(lean) * 2.5 * rand(k.seed, i, 3), born, main, seed: k.seed * 31 + i });
  const mountain = p.shape === "mountain" || !ctx.target;
  if (mountain) {
    const cx = ctx.target ? ctx.target.x : ctx.at.x;
    const at = (d: number) => cx + d * h;
    // biggest in the middle; two either side leaning out; the small outer ones grow first
    add(at(-0.42 * k.size), tall * 0.42, -0.32, 0, true, 1);
    add(at(0.44 * k.size), tall * 0.45, 0.3, 0.04, true, 2);
    add(at(-0.22 * k.size), tall * 0.72, -0.18, 0.08, true, 3);
    add(at(0.24 * k.size), tall * 0.78, 0.16, 0.11, true, 4);
    add(at(0.01 * k.size), tall * 1.12, 0.04 * dir, 0.15, true, 5);
    return { spikes, dir };
  }
  const x0 = ctx.at.x, x1 = ctx.target!.x, span = Math.abs(x1 - x0);
  const n = Math.round(clamp(num(p.count, span / (0.27 * h) + 1), 3, 7));
  const reach = Math.max(0.05, num(p.reach, span / (ICE_RUN_SPEED * h)));
  for (let i = 0; i < n; i += 1) {
    const u = i / (n - 1);
    const H = tall * (0.26 + 0.74 * u ** 1.25) * (0.92 + 0.16 * rand(k.seed, i, 1));
    const x = lerp(x0, x1, u) + (rand(k.seed, i, 2) - 0.5) * 0.06 * h * (i > 0 && i < n - 1 ? 1 : 0);
    // (most lean toward the target; now and then one is flipped the other way, so the row is not all alike)
    add(x, H, dir * (0.1 + 0.1 * rand(k.seed, i, 4)) * (i > 0 && i < n - 1 && rand(k.seed, i, 7) < 0.3 ? -1 : 1), reach * u, true, i);
    // a smaller shard leaning out of the bigger spikes' feet (more for the big one at the end)
    if (u >= 0.45) add(x - dir * H * 0.2, H * (0.42 + 0.12 * rand(k.seed, i, 5)), -dir * (0.28 + 0.12 * rand(k.seed, i, 6)), reach * u + 0.04, false, 20 + i);
    if (i === n - 1) add(x + dir * H * 0.22, H * 0.5, dir * 0.34, reach * u + 0.07, false, 40 + i);
  }
  return { spikes, dir };
}

// A spike is the "Ice spike" Library symbol, placed standing on the ground: `v` = how far it has grown (1 = full
// size; it grows by SCALING UP), flipped to lean left, turned a little, its base's lower corner on the ground.
function spikePlacement(s: Spike, v: number, g: number, dx: number, k: Knobs): Extract<Shape, { kind: "symbol" }> {
  const S = PLACED_SYMBOLS["Ice spike"].size, w = S * ICE_SPIKE_ASPECT, scale = (s.H * Math.max(0, v)) / S;
  const r = (s.turn * Math.PI) / 180, sin = Math.sin(r), cos = Math.cos(r);
  // (the base's middle at (x, ground), then lifted so its lower corner sits on the ground)
  return { kind: "symbol", name: "Ice spike", x: s.x + dx + (S / 2) * sin * scale, y: g - ((S / 2) * cos + (w / 2) * Math.abs(sin)) * scale, scale, rotation: s.turn, ...(s.lean < 0 ? { flipX: true } : {}), ...recolor(k) };
}

// Where a point of the "Ice spike" symbol's unit box (iceCrystal.ts ICE_SPIKE: x 0..1 across, y 0..1 down) is on the
// stage for a placed spike: the spike's outline (for the shatter flash, for tests) and its cracks.
export function iceSpikePoint(placed: Extract<Shape, { kind: "symbol" }>, u: number, v: number): Point {
  const S = PLACED_SYMBOLS["Ice spike"].size, w = S * ICE_SPIKE_ASPECT, p = S * 0.012 * 0.75, scale = placed.scale ?? 1;
  let x = p + u * (w - 2 * p) - w / 2;
  const y = p + v * (S - 2 * p) - S / 2;
  if (placed.flipX) x = -x;
  const r = ((placed.rotation ?? 0) * Math.PI) / 180;
  return { x: placed.x + (x * Math.cos(r) - y * Math.sin(r)) * scale, y: placed.y + (x * Math.sin(r) + y * Math.cos(r)) * scale };
}
export const iceSpikeOutline = (placed: Extract<Shape, { kind: "symbol" }>): number[] => ICE_SPIKE.outline.flatMap((q) => { const s = iceSpikePoint(placed, q.x, q.y); return [s.x, s.y]; });
const flat = (pts: Point[]) => pts.flatMap((q) => [q.x, q.y]);
const along = (a: Point, b: Point, f: number): Point => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) });

// The spike: its "Ice spike" placement, and its CRACKS while it cracks (c 0..1) — drawn strokes over the symbol
// (they change as they grow): from a point in the middle, one jagged line runs up and out toward one edge and one
// down toward the other, staying inside the spike (it narrows toward the tip).
function drawSpike(out: Shape[], s: Spike, v: number, c: number, k: Knobs, ctx: EffectContext, dx: number) {
  if (v <= 0.01) return;
  const placed = spikePlacement(s, v, ctx.groundY, dx, k);
  out.push(placed);
  if (!(c > 0 && s.main)) return;
  const lw = Math.max(1.5, 0.009 * ctx.height);
  const f0 = 0.32 + 0.16 * rand(s.seed, 8, 9), toward = rand(s.seed, 9, 9) < 0.5 ? -1 : 1;
  const mid = (f: number) => ({ x: 0.5 + (ICE_SPIKE.tip.x - 0.5) * f, y: 1 - f }), hw = (f: number) => 0.5 * (1 - f);
  for (const side of [-1, 1]) {
    const path: Point[] = [mid(f0)];
    for (let j = 1; j <= 3; j += 1) {
      const f = f0 + (side > 0 ? 0.075 : -0.065) * j, zig = (j % 2 ? 0.14 : -0.1) * (0.6 + 0.8 * rand(s.seed, j, side + 13));
      path.push({ x: mid(f).x + toward * side * hw(f) * (0.75 * (j / 3) + zig * (j < 3 ? 1 : 0)), y: mid(f).y });
    }
    const stage = path.map((q) => iceSpikePoint(placed, q.x, q.y));
    const shown: Point[] = [stage[0]];
    const total = stage.slice(1).reduce((sum, q, j) => sum + Math.hypot(q.x - stage[j].x, q.y - stage[j].y), 0);
    let left = total * clamp(c * (side > 0 ? 1.15 : 1), 0, 1);
    for (let j = 1; j < stage.length && left > 0; j += 1) {
      const d = Math.hypot(stage[j].x - stage[j - 1].x, stage[j].y - stage[j - 1].y), f = Math.min(1, left / Math.max(1e-6, d));
      shown.push(along(stage[j - 1], stage[j], f));
      left -= d;
    }
    out.push({ kind: "line", points: flat(shown), stroke: k.color2, width: lw * 0.85, alpha: 0.95 });
  }
}

// When the row cracks and shatters (seconds since the start, at speed 1): from the knobs, else just in time for the
// pieces to be gone by the end.
function spikeTimes(p: EffectParams, T: number) {
  const shatter = clamp(num(p.shatter, num(p.crack, T - FALL_SECONDS - CRACK_SECONDS) + CRACK_SECONDS), 0.05, T);
  const crack = clamp(num(p.crack, shatter - CRACK_SECONDS), 0, shatter);
  return { crack, shatter };
}

function iceSpikes(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, 0.85);
  const h = ctx.height, g = ctx.groundY;
  const ts = ctx.t * k.speed, T = Math.max(0.1, ctx.duration * k.speed);
  const { crack, shatter } = spikeTimes(p, T);
  const { spikes } = layoutSpikes(ctx, p, k);
  const out: Shape[] = [];
  // the frost on the ground under it: a thin, dim cold light while the ice stands
  const xs = spikes.map((s) => s.x), lo = Math.min(...xs), hi = Math.max(...xs);
  const grown = smooth((ts - Math.min(...spikes.map((s) => s.born))) / 0.3) * (1 - smooth((ts - shatter) / 0.6));
  out.push(...groundLight((lo + hi) / 2, g, (hi - lo) / 2 + 0.25 * h, 0.02 * h, mixColor(k.color, "#ffffff", 0.35), 0.3 * grown));
  // a puff of frost mist at each spike's foot as it bursts out of the ground
  for (const [i, s] of spikes.entries()) if (s.main) mist(out, s.x, g - 0.03 * h, 0.12 * h + s.W * 0.5, (ts - s.born) / 0.55, k, s.seed, ts, 0.5, i);
  if (ts < shatter) {
    // the spikes, biggest first (behind), smaller ones in front
    const c = smooth((ts - crack) / CRACK_SECONDS);
    for (const s of [...spikes].sort((a, b) => b.H - a.H)) {
      const v = popUp((ts - s.born) / GROW_SECONDS);
      if (ts < s.born) continue;
      const shiver = c > 0 ? 0.006 * h * c * Math.sin(ts * 95 + s.seed) : 0;
      drawSpike(out, s, v, c, k, ctx, shiver);
    }
    return keepAboveGround(out, g);
  }
  // SHATTER: a quick pale flash of each spike's shape, then its pieces (Ice crystals) fly out, fall, land and fade,
  // and frost mist rolls up from where it stood.
  const a = ts - shatter;
  if (a < 0.09) for (const s of spikes) out.push({ kind: "poly", points: iceSpikeOutline(spikePlacement(s, 1, g, 0, k)), fill: mixColor(k.color, "#ffffff", 0.6), alpha: 0.75 * (1 - a / 0.09), glow: 14 });
  for (const [i, s] of spikes.entries()) if (s.main) {
    mist(out, s.x - 0.1 * s.W, g - 0.06 * h - 0.12 * h * smooth(a / FALL_SECONDS), s.W * 0.82 + 0.1 * h, a / FALL_SECONDS, k, s.seed + 1, ts, 0.6, i);
    if (s.H > 0.45 * h) mist(out, s.x + 0.2 * s.W, g - 0.12 * h - 0.2 * h * smooth(a / FALL_SECONDS), s.W * 0.6 + 0.06 * h, (a - 0.05) / FALL_SECONDS, k, s.seed + 2, ts, 0.45, i + 1);
  }
  // The pieces: a big spike breaks into a chunk or two (Ice crystals) and little chips (Ice crumbs); a small one into
  // chips only. They fly out, fall, land and fade.
  for (const s of spikes) {
    const chunks = s.main ? (s.H > 0.55 * h ? 2 : s.H > 0.3 * h ? 1 : 0) : 0, count = chunks + (s.main ? 2 : 1);
    for (let j = 0; j < count; j += 1) {
      const f = 0.08 + (0.78 * (j + 0.5)) / count, r = (q: number) => rand(s.seed, j, q), chunk = j % 2 === 0 && j / 2 < chunks;
      const tall = chunk ? clamp(s.H * 0.34 * (0.8 + 0.4 * r(21)), 0.08 * h, 0.2 * h) : clamp(s.H * 0.16 * (0.8 + 0.4 * r(21)), 0.035 * h, 0.08 * h);
      const lean = s.lean > 0 ? ICE_SPIKE.tip.x - 0.5 : 0.5 - ICE_SPIKE.tip.x; // (the symbol's own lean, x its width)
      const p0 = { x: s.x + lean * s.W * f + (r(22) - 0.5) * 0.3 * s.W * (1 - f), y: g - s.H * f };
      const v = { x: (r(23) - 0.5) * 1.3 * h + Math.sign(s.lean) * 0.2 * h, y: -(0.25 + 0.65 * r(24)) * h * (0.5 + 0.5 * f) };
      piece(out, { name: chunk ? "Ice crystal" : "Ice crumb", p0, v, tall, rot0: s.turn + (r(25) - 0.5) * 50, spin: (r(26) - 0.5) * 700, age: a - 0.01 * j, fadeFrom: 0.45, fadeTo: FALL_SECONDS - 0.05 }, k, ctx);
    }
  }
  return keepAboveGround(out, g);
}

// ---- iceShards: thrown crystals ---------------------------------------------------------------------------
// `count` crystals leave the hand (the anchor) SHARD_STAGGER apart and fly to the target (spread a little up and
// down), each its own `travel` seconds (default: the distance at ICE_FLY_SPEED).
export const shardTravel = (distancePx: number, height: number) => Math.max(0.08, Math.abs(distancePx) / (ICE_FLY_SPEED * height));

function iceShards(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, 0.2);
  const h = ctx.height, g = ctx.groundY;
  const ts = ctx.t * k.speed;
  const count = Math.round(clamp(num(p.count, 3), 1, 6));
  const from = ctx.at;
  const dirAng = (num(p.direction, 0) * Math.PI) / 180;
  const to0 = ctx.target ?? { x: from.x + Math.cos(dirAng) * 2.5 * h, y: from.y + Math.sin(dirAng) * 2.5 * h };
  const dir = to0.x >= from.x ? 1 : -1;
  const tall = k.size * h;
  const out: Shape[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = (q: number) => rand(k.seed, i, q);
    const to = { x: to0.x - dir * (r(1) * 0.04 * h), y: Math.min(g - 0.03 * h, to0.y + (i - (count - 1) / 2) * 0.09 * h + (r(2) - 0.5) * 0.03 * h) };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const travel = Math.max(0.05, num(p.travel, shardTravel(dist, h)));
    const age = ts - i * SHARD_STAGGER;
    if (age < 0) continue;
    const size = tall * (0.85 + 0.3 * r(3));
    if (age < travel) {
      // FLYING: a flat arc (a little up, then down), spinning, a faint frost streak behind it
      const u = age / travel, arc = 0.08 * dist * 4 * u * (1 - u);
      const at = (q: number) => ({ x: lerp(from.x, to.x, q), y: lerp(from.y, to.y, q) - 0.08 * dist * 4 * q * (1 - q) });
      const pos = { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) - arc };
      const back = at(Math.max(0, u - Math.min(u, (0.45 * h) / Math.max(1, dist))));
      const ang = Math.atan2(pos.y - back.y, pos.x - back.x), nx = -Math.sin(ang), ny = Math.cos(ang), wd = size * 0.22;
      if (Math.hypot(pos.x - back.x, pos.y - back.y) > 2) {
        out.push({ kind: "poly", points: [pos.x + nx * wd, pos.y + ny * wd, back.x, back.y, pos.x - nx * wd, pos.y - ny * wd], fill: FROST, alpha: 0.5 });
        out.push({ kind: "line", points: [pos.x, pos.y, lerp(pos.x, back.x, 0.6), lerp(pos.y, back.y, 0.6)], stroke: mixColor(k.color, "#ffffff", 0.3), width: Math.max(1.5, size * 0.06), alpha: 0.6 });
      }
      crystal(out, pos.x, pos.y, size, (r(4) - 0.5) * 60 + dir * 760 * age, k);
      continue;
    }
    // THE HIT: the crystal shatters — a quick icy crack-star (light blue, glowing), a frost puff, small crystal pieces
    // bouncing back off the hit and falling, and a thin cold light on the ground if it hit near it.
    const since = age - travel;
    if (since > HIT_SECONDS) continue;
    if (since < 0.12) {
      const f = since / 0.12;
      for (let j = 0; j < 5; j += 1) {
        const a = (dir > 0 ? Math.PI : 0) + (j - 2) * 0.6 + (r(10 + j) - 0.5) * 0.3; // a fan back toward the thrower
        const l0 = 0.025 * h, l1 = (0.07 + 0.06 * r(20 + j)) * h * (0.6 + 0.4 * f);
        out.push({ kind: "line", points: [to.x + Math.cos(a) * l0, to.y + Math.sin(a) * l0, to.x + Math.cos(a) * l1, to.y + Math.sin(a) * l1], stroke: mixColor(k.color, "#ffffff", 0.25), width: Math.max(1.5, 0.012 * h), alpha: 1 - f, glow: 8 });
      }
    }
    mist(out, to.x - dir * 0.03 * h, to.y, 0.15 * h, since / 0.5, k, k.seed + i * 7, ts, 0.65, i);
    for (let j = 0; j < 3; j += 1) {
      const q = (n: number) => rand(k.seed + 17, i * 5 + j, n);
      piece(out, { name: "Ice crumb", p0: { x: to.x - dir * 0.02 * h, y: to.y }, v: { x: -dir * (0.25 + 0.6 * q(1)) * h, y: -(0.2 + 0.7 * q(2)) * h }, tall: size * (0.4 + 0.2 * q(3)), rot0: q(4) * 360, spin: (q(5) - 0.5) * 900, age: since, fadeFrom: 0.35, fadeTo: HIT_SECONDS - 0.05 }, k, ctx);
    }
    if (to.y > g - 0.35 * h) out.push(...groundLight(to.x, g, 0.3 * h * (0.6 + 0.4 * smooth(since / 0.15)), 0.02 * h, mixColor(k.color, "#ffffff", 0.35), 0.42 * (1 - smooth(since / 0.5))));
  }
  return keepAboveGround(out, g);
}

export const RECIPES: EffectRecipe[] = [
  { id: "iceSpikes", about: "an ICE MOUNTAIN: jagged ice spikes (\"Ice spike\" Library symbols, growing by scaling up) GROW straight up out of the ground, small to big, quickly with a little overshoot — in a ROW from the anchor (a spot on the ground just in front of the caster) to the target (biggest at the target), or one big MOUNTAIN at the target/anchor (`shape: \"mountain\"`, or no target) — hold, then CRACK (`crack` s after the start) and SHATTER (`shatter` s) into Ice crystal chunks and Ice crumbs (Library symbols) that fall, land and fade, with a little white frost mist and a thin cold light on the ground. size = tallest spike x height (0.85), reach = seconds the row takes to reach the target, count = spikes in a row, color = the ice, color2 = its dark edge.", draw: iceSpikes },
  { id: "iceShards", about: "thrown ICE CRYSTALS: `count` (3) Ice crystal symbols leave the anchor (the throwing hand) a moment apart and fly to the target, spinning, a faint frost streak behind each, and SHATTER on the hit — a quick icy crack-star, a frost puff, Ice crumbs bouncing back and falling, a thin cold light on the ground when it hits near it. size = crystal height x height (0.2), travel = seconds of flight (default from the distance), color = the ice, color2 = its dark edge.", draw: iceShards },
];
