// LASER EYES recipes (SPEC-0017 Phase 2C extras, 2026-10-06 — Arthur's little sister asked for it). Registered in
// index.ts; the body move and its timing are moves/powerLaser.ts.
//
// "laserEyes": the eyes and the beams. Anchored at the middle of the two eyes ON THE FACE (an `onHead` anchor: the
// front of the head at eye height, turning with the head), aimed at the target. The eyes glow first (the charge:
// two small bright dots side by side at eye height that grow and flicker), then TWO thin beams shoot out side by side to the target — a white-hot core in
// a colored glow (default red; any color by the knobs) that flickers a little in width — hold (the hit spot may
// slide along the ground: a sweep), then the beams cut off (the back end leaves the eyes and runs out to the
// target) and the eyes fade. Each eye is a placed SYMBOL ("Laser eye"): in the app the heads are Library symbols
// placed ON TOP of each picture, so anything drawn inside the head in the picture is hidden — a placed effect
// symbol in front sits above the heads (DrawingWorkspace applyAnimatorScene), so the glowing eyes always show.
// "laserHit": where the beams hit — sparks (a few short strokes flying up and back), a scorch mark (a dark streak
// on the ground with a glowing line in it that cools: white-hot, orange, deep red, then just dark), a little smoke
// (gray and light gray wavy wisps rising, breaking apart and fading — SMOKE IS NOT CLOUDS) and a thin, dim line of
// light on the ground (groundLight) while the beams hit it.
// DRAWABLE BY HAND, NOT TOO SIMPLE: clean bright lines with a glow, a few short strokes, a dark streak with a hot
// line, a few wavy gray wisps — about a minute and a half a picture. Stateless and seeded: the same moment always
// gives the same shapes, at any frame rate. Never below the ground.
import { groundLight } from "./groundLight.ts";
import { LASER_CORE, LASER_EYE_SYMBOL, LASER_RED } from "./laserEye.ts";
import { dome } from "./lightning.ts";
import { clamp, lerp, lifeOf, mixColor, rand, smooth, wobble } from "./random.ts";
import { wavyOutline } from "./smoke.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

export { LASER_CORE, LASER_EYE_SIZE, LASER_EYE_SYMBOL, LASER_RED, laserEyeShapes } from "./laserEye.ts";
// Seconds for the beams to reach their target, and (cutting off) for their back end to leave the eyes and get there.
export const LASER_REACH = 0.05;
export const LASER_CUT = 0.06;
// Seconds the eyes take to fade after the beams cut off.
export const EYE_FADE = 0.3;
// The colored beam's thickness (x figure height); the white core is thinner, the glow round it wider.
export const LASER_WIDTH = 0.011;
// The ground light under the hit: a thin band (x figure height).
export const LASER_GROUND_LIGHT = 0.02;

const SCORCH = "#2a211d";
const SMOKE_GRAY = "#9c9c9c", SMOKE_LIGHT = "#d9d9d9";
const HOT = "#fff3bd", WARM = "#ff9a2a", EMBER = "#b3261e";

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

// How far (px) the hit spot has slid along the ground at time t (own clock): `sweep` px from `sweepFrom` to `sweepTo`.
export function sweepAt(p: EffectParams, t: number): number {
  const sweep = num(p.sweep, 0);
  if (!sweep) return 0;
  const a = num(p.sweepFrom, 0), b = Math.max(a + 1e-3, num(p.sweepTo, a + 0.5));
  return sweep * smooth((t - a) / (b - a));
}

// Where the two eyes are, and where each beam ends, at time t: the eyes sit SIDE BY SIDE on one level line at eye
// height, `gap` px apart (Arthur: "one dot on the left, one on the right" — never stacked), and the two beams leave
// them side by side, parallel, to the target. `hit` = the target (slid by the sweep). Exported for the tests.
export function laserGeometry(ctx: EffectContext, p: EffectParams, t = ctx.t) {
  const h = ctx.height, mid = ctx.at;
  let hit: Point;
  if (ctx.target) hit = { x: ctx.target.x + sweepAt(p, t), y: ctx.target.y };
  else {
    const a = (num(p.direction, 0) * Math.PI) / 180, L = num(p.length, 1.8 * h);
    hit = { x: mid.x + Math.cos(a) * L, y: mid.y + Math.sin(a) * L };
  }
  const dx = hit.x - mid.x, dy = hit.y - mid.y, L = Math.max(1, Math.hypot(dx, dy)), ux = dx / L, uy = dy / L;
  const half = num(p.gap, 0.03 * h) / 2;
  const eyes: Point[] = [{ x: mid.x - half, y: mid.y }, { x: mid.x + half, y: mid.y }];
  const ends = eyes.map((eye) => {
    let end = { x: hit.x + (eye.x - mid.x), y: hit.y };
    // (A beam that would go into the ground stops on it; one aimed at the ground goes all the way down to it.)
    if ((end.y > ctx.groundY || hit.y >= ctx.groundY - 0.5) && eye.y < ctx.groundY && end.y > eye.y) {
      const k = (ctx.groundY - eye.y) / (end.y - eye.y);
      end = { x: eye.x + (end.x - eye.x) * k, y: ctx.groundY };
    }
    return end;
  });
  return { eyes, ends, hit, dir: { x: ux, y: uy } };
}

// When the beams shoot and cut off (own clock), and how far out the front and back of each beam are (0..1).
export function beamSpan(ctx: EffectContext, p: EffectParams, t = ctx.t) {
  const fireAt = clamp(num(p.fireAt, Math.min(0.4, ctx.duration * 0.3)), 0, ctx.duration);
  const cutAt = clamp(num(p.cutAt, ctx.duration - EYE_FADE), fireAt, ctx.duration);
  const front = t < fireAt ? 0 : clamp((t - fireAt) / LASER_REACH, 0, 1);
  const back = t < cutAt ? 0 : clamp((t - cutAt) / LASER_CUT, 0, 1);
  return { fireAt, cutAt, front, back, on: front > 0 && back < 1 };
}

const laserEyes: EffectRecipe = {
  id: "laserEyes",
  about: "Laser eyes: anchored on the face (an `onHead` anchor at the front of the head at eye height), aimed at the target. The eyes glow first (the charge, until `fireAt` s: two small bright dots SIDE BY SIDE at eye height, `gap` px apart — placed \"Laser eye\" symbols, so they show on top of filled and hollow heads alike — that grow and flicker), then TWO thin parallel beams shoot from the eye dots to the target (use layer \"top\": the beams start at the eye dots and are drawn over the head) (white-hot core `color2`, colored glow `color`, default red #ff2626; they flicker a little in width), a small bright flare where they hit; `sweep` px slides the hit spot along the ground between `sweepFrom` and `sweepTo` s; at `cutAt` s the beams cut off (the back end runs out to the target) and the eyes fade. Knobs: color, color2, size (beam thickness, 1 = 0.011 x height), gap (px between the eyes), seed. Pair it with laserHit where the beams land.",
  draw(ctx, p) {
    const h = ctx.height, t = ctx.t, seed = num(p.seed, 3);
    const color = str(p.color, LASER_RED), core = str(p.color2, LASER_CORE);
    const span = beamSpan(ctx, p);
    const { eyes, ends } = laserGeometry(ctx, p);
    const out: Shape[] = [];
    // THE BEAMS: a wide soft glow, the colored beam, the white-hot core (both beams' glows first, cores on top).
    if (span.on) {
      const fresh = 1 - smooth((t - span.fireAt) / 0.12); // a little fatter as they shoot out
      const beams = eyes.map((eye, i) => {
        const end = ends[i];
        const w = LASER_WIDTH * h * num(p.size, 1) * (1 + 0.13 * wobble(seed, i, t, 17) + 0.06 * Math.sin(t * 61 + i * 2.1)) * (1 + 0.3 * fresh);
        const a = { x: lerp(eye.x, end.x, span.back), y: lerp(eye.y, end.y, span.back) };
        const b = { x: lerp(eye.x, end.x, span.front), y: lerp(eye.y, end.y, span.front) };
        return { points: [a.x, a.y, b.x, b.y], w, end, reached: span.front >= 1 };
      });
      for (const B of beams) out.push({ kind: "line", points: B.points, stroke: color, width: B.w * 2.7, alpha: 0.28, glow: 18 });
      for (const B of beams) out.push({ kind: "line", points: B.points, stroke: color, width: B.w * 1.5, alpha: 0.95, glow: 8 });
      for (const B of beams) out.push({ kind: "line", points: B.points, stroke: core, width: Math.max(1, B.w * 0.55), alpha: 1, glow: 3 });
      // a small bright flare where each beam hits (a little dome on the ground, or a ball of light in the air)
      for (const [i, B] of beams.entries()) {
        if (!B.reached) continue;
        const r = B.w * (2.4 + 0.5 * wobble(seed, 20 + i, t, 23));
        if (B.end.y >= ctx.groundY - 1) {
          out.push({ kind: "poly", points: dome(B.end.x, ctx.groundY, r * 1.3, r), fill: color, alpha: 0.6, glow: 14 });
          out.push({ kind: "poly", points: dome(B.end.x, ctx.groundY, r * 0.65, r * 0.5), fill: core });
        } else {
          out.push({ kind: "circle", x: B.end.x, y: B.end.y, r, fill: color, alpha: 0.55, glow: 14 });
          out.push({ kind: "circle", x: B.end.x, y: B.end.y, r: r * 0.45, fill: core });
        }
      }
    }
    // THE EYES: they grow and flicker as the charge builds, flare as the beams shoot, hold, then fade (shrink) away.
    let s: number;
    if (t < span.fireAt) { const u = span.fireAt > 0 ? t / span.fireAt : 1; s = lerp(0.45, 0.9, smooth(u)) * (1 + 0.12 * u * wobble(seed, 7, t, 21)); }
    else if (t < span.cutAt) s = 1 + 0.3 * (1 - smooth((t - span.fireAt) / 0.1)) + 0.06 * wobble(seed, 8, t, 19);
    else s = 1 - smooth((t - span.cutAt) / EYE_FADE);
    if (s >= 0.15) for (const eye of eyes) out.push({ kind: "symbol", name: LASER_EYE_SYMBOL, x: eye.x, y: Math.min(eye.y, ctx.groundY), scale: (h / 300) * s, color, color2: core });
    return out;
  },
};

// ---- laserHit -----------------------------------------------------------------------------------------

// A few short strokes flying out of `from` (up and back toward the shooter, `back` = its side: -1 left, 1 right),
// falling with gravity; hot (near white) when they fly out, the laser's color as they cool.
function spark(out: Shape[], from: Point, age: number, life: number, phi: number, v: number, back: number, color: string, h: number, g: number) {
  if (age < 0 || age > life) return;
  const G = 7 * h, dx = back * Math.sin(phi), dy = -Math.cos(phi);
  const at = (s: number) => ({ x: from.x + dx * v * s, y: from.y + dy * v * s + 0.5 * G * s * s });
  const head = at(age);
  if (head.y > g) return; // it has landed
  const tail = at(Math.max(0, age - 0.045)), u = age / life;
  out.push({ kind: "line", points: [tail.x, Math.min(tail.y, g), head.x, head.y], stroke: mixColor(HOT, color, Math.min(1, u * 0.9)), width: Math.max(1.2, 0.0075 * h), alpha: 1 - u * u, glow: 6 });
}

// The last moment (≤ until) the hit spot X(s) was within `reach` px of x (X slides one way, smoothly).
function lastHotAt(x: number, X: (s: number) => number, until: number, reach: number): number {
  const now = X(until), sd = Math.sign(now - X(0));
  if (Math.abs(x - now) <= reach || sd === 0) return until;
  const goal = x + sd * reach; // where the spot was when it left x behind
  if ((X(0) - goal) * sd >= 0) return 0;
  let lo = 0, hi = until;
  for (let i = 0; i < 24; i += 1) { const m = (lo + hi) / 2; if ((X(m) - goal) * sd < 0) lo = m; else hi = m; }
  return hi;
}

const laserHit: EffectRecipe = {
  id: "laserHit",
  about: "Where laser beams hit (the anchor; it starts when they arrive): a burst of sparks then a few more while they keep hitting (short strokes flying up and back toward `back`: -1 = the shooter is on the left... 1 = on the right, falling, hot white cooling to `color`), and on the ground a SCORCH mark (a dark streak along the ground with a glowing line in it that cools white-hot → orange → deep red → dark), a little smoke (gray and light gray wavy wisps rising, breaking apart and fading) and a thin, dim line of light on the ground while they hit. `sweep` px slides the hit spot along the ground between `sweepFrom` and `sweepTo` s (the scorch follows it); at `cutAt` s the beams stop (the sparks and the light stop, the scorch cools and keeps smoking a moment). The scorch mark stays until the effect ends. Knobs: color, seed.",
  draw(ctx, p) {
    const h = ctx.height, g = ctx.groundY, t = ctx.t, seed = num(p.seed, 5);
    const color = str(p.color, LASER_RED), back = num(p.back, -1) < 0 ? -1 : 1;
    const cutAt = clamp(num(p.cutAt, ctx.duration), 0, ctx.duration);
    const onGround = ctx.at.y >= g - 0.03 * h;
    const y0 = onGround ? g : ctx.at.y;
    const X = (s: number) => ctx.at.x + (onGround ? sweepAt(p, Math.min(s, cutAt)) : 0);
    const tn = Math.min(t, cutAt), xNow = X(tn);
    const on = t <= cutAt ? 1 : 1 - smooth((t - cutAt) / 0.12); // the beams hitting (the light dies with them)
    const out: Shape[] = [];
    if (onGround) {
      // LIGHT ON THE GROUND: a thin, dim band under the hit spot while the beams hit.
      if (on > 0.01) out.push(...groundLight(xNow, g, 0.3 * h, LASER_GROUND_LIGHT * h, color, 0.24 * on * (0.85 + 0.15 * wobble(seed, 40, t, 15)), LASER_CORE));
      // THE SCORCH: a dark streak lying on the ground along where the beams went (rough top, rounded ends) ...
      const reach = 0.04 * h, e = reach * smooth(t / 0.15);
      const lo = Math.min(ctx.at.x, xNow) - e, hi = Math.max(ctx.at.x, xNow) + e;
      const fade = 1 - smooth((t - (ctx.duration - 0.5)) / 0.5);
      if (hi - lo > 2 && fade > 0.01) {
        const step = 0.02 * h, xs = [lo];
        for (let x = Math.ceil(lo / step) * step; x < hi; x += step) if (x > lo + 1) xs.push(x);
        xs.push(hi);
        const top: number[] = [];
        for (const x of xs) {
          const taper = Math.sqrt(clamp(Math.min(x - lo, hi - x) / Math.max(1, e), 0, 1));
          top.push(x, g - 0.017 * h * taper * (0.65 + 0.7 * rand(seed, Math.round(x / step), 61)));
        }
        out.push({ kind: "poly", points: [...top, hi, g, lo, g], fill: SCORCH, alpha: 0.92 * fade });
        // ... with a glowing line in it that cools: white-hot where the beams are, orange, deep red, then dark.
        const heat = (x: number) => { const age = t - lastHotAt(x, X, tn, reach); return age < 0.15 ? 0 : age < 0.5 ? 1 : age < 1.1 ? 2 : 3; };
        const tones = [{ stroke: HOT, glow: 10, alpha: 1 }, { stroke: mixColor(WARM, color, 0.2), glow: 8, alpha: 0.95 }, { stroke: mixColor(EMBER, color, 0.2), glow: 4, alpha: 0.85 }];
        const lineY = (x: number) => g - 0.007 * h - 0.003 * h * rand(seed, Math.round(x / step), 62);
        let run: number[] = [], tone = -1;
        const flush = () => { if (tone >= 0 && tone < 3 && run.length >= 4) out.push({ kind: "line", points: run, width: Math.max(1.2, 0.008 * h), ...tones[tone], alpha: tones[tone].alpha * fade }); };
        for (const x of xs) {
          const k = heat(x), pt = [x, lineY(x)];
          if (k !== tone) { flush(); run = run.length >= 2 ? [...run.slice(-2), ...pt] : pt; tone = k; } else run.push(...pt);
        }
        flush();
      }
    }
    // A LITTLE SMOKE: wavy gray wisps born off the hot spot (while the beams hit, and a moment after as it cools),
    // rising, stretching and widening, getting lighter, tearing in two and fading by about half a body high.
    const every = 0.17, life = 1.5, until = cutAt + 0.6;
    const wisps: { a: number; draw: () => void }[] = [];
    for (let k = Math.max(0, Math.floor((t - life) / every) - 1); k * every <= Math.min(t, until); k += 1) {
      const born = k * every + rand(seed, k, 71) * every * 0.5;
      const a = (t - born) / life;
      if (born < 0.06 || born > until || a < 0 || a >= 1) continue;
      const strength = born <= cutAt ? 1 : 1 - (born - cutAt) / 0.6;
      const fromX = X(born) + (rand(seed, k, 72) - 0.5) * 0.05 * h;
      const s = seed + k * 13;
      const wind = (rand(seed, 3, 73) - 0.5) * 0.12 * h;
      const cx = fromX + 0.03 * h * wobble(s, 1, t * 0.8, 1) * a + wind * a;
      const cy = y0 - 0.02 * h - 0.45 * h * Math.pow(a, 0.9);
      const long = 0.035 * h + 0.05 * h * a, short = 0.016 * h + 0.028 * h * a;
      const ang = -Math.PI / 2 + 0.35 * wobble(s, 2, t * 0.7, 1);
      const fill = a < 0.33 ? SMOKE_GRAY : a < 0.66 ? mixColor(SMOKE_GRAY, SMOKE_LIGHT, 0.5) : SMOKE_LIGHT;
      const alpha = 0.9 * smooth(a / 0.1) * (1 - smooth((a - 0.55) / 0.45)) * strength;
      if (alpha < 0.03) continue;
      wisps.push({ a, draw: () => {
        const curl = (rand(s, 0, 74) < 0.5 ? -1 : 1) * 0.5 * a;
        if (a < 0.5) return void out.push({ kind: "poly", points: wavyOutline(cx, cy, long, short, ang, s, t, 0.6, 0.5, curl), fill, alpha });
        const sp = smooth((a - 0.5) / 0.35);
        for (const side of [-1, 1]) {
          const ox = side * (0.01 * h + 0.035 * h * sp), oy = -0.01 * h * sp * (side > 0 ? 1 : 0.4);
          out.push({ kind: "poly", points: wavyOutline(cx + ox, cy + oy, long * 0.7, short * (0.75 - 0.15 * sp), ang + side * 0.3 * sp, s + 7 * (side + 2), t, 0.6, 0.5 * (0.5 + sp), side * 0.6 * sp), fill, alpha });
        }
      } });
    }
    wisps.sort((p1, p2) => p2.a - p1.a).forEach((w) => w.draw()); // oldest (highest, palest) behind
    // SPARKS: a burst as the beams first hit, then a few at a time while they keep hitting.
    for (let i = 0; i < 7; i += 1) {
      spark(out, { x: X(0), y: y0 - 1 }, t - rand(seed, i, 81) * 0.03, 0.32 * lerp(0.8, 1.3, rand(seed, i, 82)), lerp(-0.6, 1.25, rand(seed, i, 83)), h * lerp(1.4, 2.4, rand(seed, i, 84)), back, color, h, g);
    }
    const N = 6, sl = 0.28;
    for (let i = 0; i < N; i += 1) {
      const L = lifeOf(t, i + 10, N, sl, seed);
      if (L.bornAt < 0.03 || L.bornAt > cutAt) continue;
      const key = i * 7 + L.n * 131;
      spark(out, { x: X(L.bornAt), y: y0 - 1 }, L.u * sl, sl, lerp(-0.5, 1.2, rand(seed, key, 85)), h * lerp(1.1, 2, rand(seed, key, 86)), back, color, h, g);
    }
    // nothing below the ground
    for (const s of out) if (s.kind === "poly" || s.kind === "line") for (let j = 1; j < s.points.length; j += 2) s.points[j] = Math.min(s.points[j], g);
    return out;
  },
};

export const RECIPES: EffectRecipe[] = [laserEyes, laserHit];
