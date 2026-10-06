// FIRE recipes (SPEC-0017 Phase 2C). Rules, not drawings: fire RISES, NARROWS to a point, FLICKERS and cools as it
// goes (yellow → orange → red → fading gray smoke). Every recipe takes the shared knobs (color, color2, size, speed,
// direction, intensity, turbulence, spread, seed), so blue fire, green fire or a purple fire stream is just a
// different mix of knobs on the same rules.
// DRAWABLE BY HAND, NOT TOO SIMPLE (Arthur, round 3): every fire is drawn like his favorite, the standing flame —
// a few layered flat shapes (red outside, orange, yellow inside) whose outlines are rough ZIGZAGS that change every
// picture, a little glow, little flames breaking off and fading to gray smoke: about a minute and a half to draw one
// picture by hand. Never hundreds of circles; never spears, diamonds or plain puffs. One rule draws every moving
// fire shape (flameOutline): point it any way, stretch it long (a blast) or keep it small (a chunk).
// Particles are seeded and stateless (random.ts), so a flame looks the same at 8, 12 and 24 fps.
import { clamp, lerp, lifeOf, mixColor, rand, smooth, wobble } from "./random.ts";
import { groundLight } from "./groundLight.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

// The 4 flat fire colors (default): red (outside), orange (main), yellow (inside / hottest), gray (smoke).
export const FIRE_RED = "#e53b1c", FIRE_ORANGE = "#ff8a1f", FIRE_YELLOW = "#ffd23f", FIRE_SMOKE = "#9a9a9a";

type Knobs = { color: string; color2: string; red: string; gray: string; speed: number; intensity: number; turbulence: number; seed: number };

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const deg = (d: number) => (d * Math.PI) / 180;

// #rrggbb <-> hue (degrees), saturation, lightness (0..1).
function toHsl(c: string): [number, number, number] | null {
  const h = c.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const [r, g, b] = [0, 2, 4].map((j) => parseInt(n.slice(j, j + 2), 16) / 255);
  if ([r, g, b].some(Number.isNaN)) return null;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const hue = d === 0 ? 0 : max === r ? 60 * (((g - b) / d + 6) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [hue, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const C = (1 - Math.abs(2 * l - 1)) * s, hh = (((h % 360) + 360) % 360) / 60, X = C * (1 - Math.abs((hh % 2) - 1)), m = l - C / 2;
  const [r, g, b] = hh < 1 ? [C, X, 0] : hh < 2 ? [X, C, 0] : hh < 3 ? [0, C, X] : hh < 4 ? [0, X, C] : hh < 5 ? [X, 0, C] : [C, 0, X];
  return "#" + [r, g, b].map((v) => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
}

// The outside color: one more step down the fire's color ramp (yellow → orange → RED), a little darker.
// Default fire gets the exact red; blue fire gets a deeper blue, green fire a deeper teal-green.
function outsideOf(color: string, color2: string): string {
  const a = toHsl(color), b = toHsl(color2);
  if (!a || !b) return mixColor(color, "#000000", 0.2);
  const d = ((a[0] - b[0] + 540) % 360) - 180;
  return fromHsl(a[0] + clamp(d, -30, 30) * 0.9, a[1] * 0.85, a[2] * 0.9);
}

function knobs(p: EffectParams): Knobs {
  const custom = typeof p.color === "string" || typeof p.color2 === "string";
  const color = typeof p.color === "string" ? p.color : FIRE_ORANGE;
  const color2 = typeof p.color2 === "string" ? p.color2 : FIRE_YELLOW;
  return {
    color,
    color2,
    red: custom ? outsideOf(color, color2) : FIRE_RED,
    gray: FIRE_SMOKE, // what's left when it burns out
    speed: Math.max(0.1, num(p.speed, 1)),
    intensity: Math.max(0, num(p.intensity, 1)),
    turbulence: clamp(num(p.turbulence, 0.5), 0, 1.5),
    seed: num(p.seed, 7),
  };
}

// Hot → cool along a piece's life (u 0..1), in FLAT steps: yellow, orange, red, then gray smoke.
function heat(k: Knobs, u: number): string {
  return u < 0.3 ? k.color2 : u < 0.58 ? k.color : u < 0.8 ? k.red : k.gray;
}

// A FLAME TONGUE: a teardrop from a base point along angle `ang` (radians; -PI/2 = straight up), `h` long and
// `w` wide, pointed at the far end, its centre line bending `bend` px by the tip (a curl) and its edges rippling.
// (The standing flame's smooth outline — one brush shape.)
function tongue(bx: number, by: number, ang: number, h: number, w: number, bend: number, ripple: number, seed: number, i: number, t: number): number[] {
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const M = 9;
  const right: number[] = [], left: number[] = [];
  let r0 = 0;
  for (let j = 0; j <= M; j += 1) {
    const s = j / M;
    const hw = (w / 2) * Math.sin(Math.PI * Math.min(1, 0.32 + 0.68 * s)) * (1 + ripple * 0.22 * wobble(seed, i * 17 + j, t, 7));
    if (j === 0) r0 = hw;
    const off = bend * s * s + ripple * w * 0.14 * s * wobble(seed, i * 29 + j, t, 5);
    const cx = bx + ux * s * h + nx * off, cy = by + uy * s * h + ny * off;
    right.push(cx + nx * hw, cy + ny * hw);
    left.unshift(cx - nx * hw, cy - ny * hw); // (tip first, so the outline goes up one side and down the other)
  }
  // a round bottom behind the base (from the left side, around the back, to the right side)
  const bottom: number[] = [];
  for (let q = 1; q < 6; q += 1) {
    const th = (Math.PI * q) / 6;
    bottom.push(bx - nx * r0 * Math.cos(th) - ux * r0 * 0.6 * Math.sin(th), by - ny * r0 * Math.cos(th) - uy * r0 * 0.6 * Math.sin(th));
  }
  return [...right, ...left, ...bottom];
}

// How wide a flame is along its length (s: 0 at its base → 1 at its end), as 0..1 of its full width.
export const FLAME_BODY = {
  // the standing flame's teardrop: round at the bottom, widest low down, narrowing up to the points
  standing: (s: number) => Math.sin(Math.PI * Math.min(1, 0.32 + 0.68 * s)),
  // a ball of fire with its flame tail: widest at the ball (the base), narrowing along the tail
  ball: (s: number) => Math.sin(Math.PI * Math.min(1, 0.5 + 0.5 * s)),
};

// THE FLAME OUTLINE — the one rule every moving fire shape is drawn with, in the look of the standing flame Arthur
// picked ("the outline is rigid and zigzaggy … the perfect complexity"): ONE flat shape with a rough ZIGZAG
// outline — teeth of different sizes all down both sides, some big enough to be tongues licking out — and a crown
// of flame points at its end. It MOVES like fire: the teeth slide along toward the end and flicker, so the outline
// is different in every picture. Point it any way (`ang`), stretch it long (`h`) or wide (`w`), and layer it:
// red outside, orange, yellow inside. Each shape is a few dozen points, so a person can still trace it by hand.
export type FlameOutline = {
  x: number; y: number; // its base (a hand, the ground, the middle of a ball)
  ang: number; // the way it points (radians; -PI/2 = straight up, 0 = right)
  h: number; // how long
  w: number; // how wide at its widest
  body?: (s: number) => number; // its width along its length (FLAME_BODY; default: the standing flame's teardrop)
  teeth: number; // zigzag teeth down each side
  tips: number; // flame points round its end
  round: number; // its end: 0 = a crown of points (a flame standing up), 1 = a ragged round head (a blast where it hits)
  rough?: number; // how far the teeth stick out (x the half-width there; default 0.5)
  bend?: number; // px its end swings to the side (a curl; + = to the left of the way it points)
  wave?: number; // px its middle snakes (a wave running along it)
  rise?: number; // how much the side tongues and points lift UP the page (fire rises), 0..1
  flow?: number; // teeth a second sliding toward the end (default 3)
  back?: number; // how round the bottom is behind the base (x the half-width there; default 0.6; 1 = a ball)
  splash?: number; // 0..1: the head spreads out and curls back (fire hitting something)
  seed: number; t: number;
  layer?: number; // layers of one flame share `seed` (the same tongues) and differ in `layer` (their own small flicker)
};

export function flameOutline(o: FlameOutline): number[] {
  const ux = Math.cos(o.ang), uy = Math.sin(o.ang), nx = -uy, ny = ux;
  const body = o.body ?? FLAME_BODY.standing;
  const rough = o.rough ?? 0.5, flow = o.flow ?? 3, bend = o.bend ?? 0, wave = o.wave ?? 0, rise = o.rise ?? 0, splash = clamp(o.splash ?? 0, 0, 1);
  const K = Math.max(1, Math.round(o.teeth)), T = Math.max(1, Math.round(o.tips)), h = Math.max(1, o.h);
  const { seed, t } = o;
  const fs = seed + 101 * (o.layer ?? 0); // (the small flicker of this layer)
  const hw = (s: number) => (o.w / 2) * Math.max(0, body(clamp(s, 0, 1)));
  const mid = (s: number) => bend * s * s + wave * Math.sin(2 * Math.PI * (s * 1.3 - t * 1.1)) * Math.sin(Math.PI * Math.min(1, s));
  // a point `s` along it, `side` px out from its middle line, lifted `lift` px up the page
  const at = (s: number, side: number, lift = 0) => [o.x + ux * s * h + nx * (mid(s) + side), o.y + uy * s * h + ny * (mid(s) + side) - lift];
  // where the end starts: a round head as wide as the body there, or a crown over the top fifth
  const rHead = o.round * hw(1) * (1 + 0.15 * splash);
  const sEnd = o.round > 0 ? clamp(1 - rHead / h, 0.25, 0.97) : 0.78;
  const rc = o.round > 0 ? rHead : hw(sEnd);
  const out: number[] = [];
  // the teeth down one side (sg = +1 / -1): valleys and points, sliding toward the end as time goes on
  const tf = t * flow, ph = tf - Math.floor(tf), base = Math.floor(tf);
  const Δ = sEnd / K;
  const sidePts = (sg: number) => {
    const pts: number[][] = [];
    const win = (s: number) => smooth(s / 0.1) * smooth((sEnd - s) / (Δ * 0.9));
    const grow = (s: number) => 0.3 + 0.7 * smooth(s / Math.max(0.2, sEnd * 0.6)); // small teeth near the base (the hand)
    // which way this side faces: up the page (+1), down (-1) or sideways (0). Fire rises: the tongues on the upper
    // side are bigger and lick up; the lower side stays smaller and only leans along the flow.
    const up = clamp(-sg * ny, -1, 1);
    for (let j = -1; j <= K; j += 1) {
      // one tooth: a notch, a shoulder, then its point leaning toward the end (a tongue of flame), each one its own
      // size, width and spacing, flickering
      const id = (j - base) * 2 + (sg > 0 ? 0 : 1);
      const s0 = (j + ph + 0.45 * (rand(seed, id, 5) - 0.5)) * Δ, wd = Δ * (0.55 + 0.75 * rand(seed, id, 6));
      const a = rough * (0.1 + 1.05 * Math.pow(rand(seed, id, 1), 2.2)) * (1 + 0.35 * wobble(fs, id, t, 8)) * grow(s0)
        * (o.round > 0 ? 1 - 0.4 * smooth((s0 / sEnd - 0.6) / 0.4) : 1) * (1 + 0.3 * Math.max(0, up) - 0.6 * Math.max(0, -up));
      const tooth = [
        [s0, -rough * 0.3 * rand(fs, id, 2)],
        [s0 + wd * (0.25 + 0.2 * rand(fs, id, 7)), a * (0.25 + 0.35 * rand(fs, id, 3))],
        [s0 + wd * (0.6 + 0.3 * clamp(a / Math.max(0.1, rough), 0, 1)), a],
      ];
      for (const [s, k] of tooth) {
        if (s <= 0.01 || s >= sEnd) continue;
        const kk = k * win(s);
        pts.push([s, sg * hw(s) * (1 + kk), kk > 0 ? rise * hw(s) * kk * (up < -0.3 ? 0.3 : 1 + 0.6 * Math.max(0, up)) : 0]);
      }
    }
    pts.sort((p, q) => p[0] - q[0]);
    return [[0, sg * hw(0), 0], ...pts];
  };
  for (const [s, side, lift] of sidePts(1)) out.push(...at(s, side, lift));
  // the end, from the +side round the front to the -side
  const [cx, cy] = at(sEnd, 0), [px, py] = at(sEnd - 0.02, 0);
  let fx = cx - px, fy = cy - py; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
  const gx = -fy, gy = fx;
  if (o.round > 0) {
    // A RAGGED ROUND FRONT (a blast, a ball): a round flame front whose tongues lick UP and BACK (fire rises) — like
    // the top of the standing flame turned on its side. Low down and straight ahead it is only ragged (small
    // bumps); never long spikes sticking forward or down.
    const span = deg(84 + 26 * splash);
    let bx = -fx * 0.55, by = -1 - fy * 0.55; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl; // up and back
    for (let q = 0; q <= 2 * T; q += 1) {
      const spike = q % 2 === 1, m = (q - 1) / 2;
      const th = span * (1 - q / T) + (spike ? 0.3 * (span / T) * wobble(fs, 300 + m, t, 7) : 0);
      const dx = fx * Math.cos(th) + gx * Math.sin(th), dy = fy * Math.cos(th) + gy * Math.sin(th);
      if (!spike) { const r = rc * (0.86 + 0.12 * rand(fs, 400 + q, base)); out.push(cx + dx * r, cy + dy * r); continue; }
      const upward = smooth((-dy + 0.15) / 0.95); // 0 pointing down or level, 1 pointing up
      const len = rc * (0.07 + 0.08 * rand(seed, 500 + m, 3) + (0.25 + 0.3 * splash) * upward * (0.7 + 0.6 * rand(seed, 500 + m, 4))) * (1 + 0.25 * wobble(fs, 600 + m, t, 9));
      const b = clamp(rise * 1.3, 0, 1) * (0.3 + 0.7 * upward);
      let tx = dx * (1 - b) + bx * b, ty = dy * (1 - b) + by * b; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      out.push(cx + dx * rc + tx * len, cy + dy * rc + ty * len);
    }
  } else {
    // A CROWN of flame points (a flame standing up): the middle one tallest
    const span = deg(62), reach = Math.max(rc * 1.3, (1 - sEnd) * h);
    for (let q = 0; q <= 2 * T; q += 1) {
      const spike = q % 2 === 1, m = (q - 1) / 2;
      const th = span * (1 - q / T) + (spike ? 0.35 * (span / T) * wobble(fs, 300 + m, t, 7) : 0);
      const side = Math.abs(th) / Math.max(1e-6, span);
      const r = !spike ? rc * (0.72 + 0.2 * rand(fs, 400 + q, base)) : (rc + (reach - rc) * (1 - 0.55 * Math.pow(side, 1.3)) * (0.75 + 0.4 * rand(seed, 500 + m, 3))) * (1 + 0.22 * wobble(fs, 600 + m, t, 9));
      const lift = spike ? rise * Math.max(0, r - rc) * 0.5 : 0;
      out.push(cx + (fx * Math.cos(th) + gx * Math.sin(th)) * r, cy + (fy * Math.cos(th) + gy * Math.sin(th)) * r - lift);
    }
  }
  for (const [s, side, lift] of sidePts(-1).reverse()) out.push(...at(s, side, lift));
  // the bottom, round behind the base (a little rough too; a whole half ball for a fireball)
  const r0 = hw(0), back = o.back ?? 0.6, B = 4 + Math.round(back * K * 0.8);
  for (let q = 1; q < B; q += 1) {
    const th = (Math.PI * q) / B, jag = 1 + rough * 0.3 * (q % 2 ? 0.5 : -0.4) * (1 + 0.5 * wobble(fs, 700 + q, t, 8)) * back;
    const lat = -r0 * Math.cos(th) * jag, behind = r0 * back * Math.sin(th) * jag;
    out.push(o.x + nx * lat - ux * behind, o.y + ny * lat - uy * behind);
  }
  return out;
}

// A LITTLE FLAME of one color (a chunk breaking off, a thrown bit): a small standing flame, pointing up (leaning
// `lean` radians), with its own zigzag edge and three points.
function littleFlame(x: number, y: number, h: number, lean: number, seed: number, t: number, rough = 0.6): number[] {
  return flameOutline({ x, y, ang: -Math.PI / 2 + lean, h, w: h * 0.5, teeth: 2, tips: 3, round: 0, rough, bend: h * 0.18 * wobble(seed, 1, t, 5), flow: 4, seed, t });
}

// One rising flame bit (a lick that broke off a tongue, or an ember): where it is at time t.
// Exported so the tests can follow one particle through its life.
export function fireParticle(i: number, t: number, o: { x: number; y: number; h: number; w: number; life: number; rise: number; lean: number; turbulence: number; seed: number }) {
  const { n, u, bornAt } = lifeOf(t, i, 1, o.life, o.seed);
  const a = rand(o.seed, i, n * 5 + 1), b = rand(o.seed, i, n * 5 + 2);
  const x = o.x + (a - 0.5) * o.w + o.lean * u + o.turbulence * o.w * 0.35 * u * wobble(o.seed, i + n * 13, t, 4);
  const y = o.y - u * o.h * o.rise * (0.8 + 0.4 * b);
  return { x, y, u, n, bornAt, a, b };
}

type FlameOpts = { x: number; y: number; h: number; w: number; amp: number; t: number; seed: number; k: Knobs; lean: number; tongues: number; licks: number; embers: number; glow: boolean; yellow?: boolean };

// A whole cartoon flame in 3 flat layers: red tongues behind, orange over them, yellow in the middle; a few
// licks breaking off the top and rising, and a few ember dots. `amp` 0..1 = how built-up it is.
function flame(out: Shape[], o: FlameOpts) {
  const { k, t, seed } = o;
  const amp = clamp(o.amp, 0, 1.5);
  if (amp <= 0.02) return;
  const ts = t * k.speed;
  const H = o.h * amp, W = o.w * (0.35 + 0.65 * Math.min(1, amp));
  const turb = k.turbulence;
  // one faint warm glow around the flame (the only glow)
  if (o.glow) out.push({ kind: "circle", x: o.x + o.lean * 0.3, y: o.y - H * 0.3, r: W * 0.5 + H * 0.2, fill: k.color, alpha: 0.06 * Math.min(1, amp), glow: 40 });
  const nT = Math.max(1, Math.round(o.tongues * Math.min(1, amp * 1.3)));
  const tongues = Array.from({ length: nT }, (_, j) => {
    const f = nT === 1 ? 0 : j / (nT - 1) - 0.5; // -0.5..0.5 across the base
    const side = Math.abs(f * 2);
    const hf = (1 - 0.42 * Math.pow(side, 1.1)) * (0.88 + 0.24 * rand(seed, j, 3)) * (1 + 0.17 * (0.6 + turb) * wobble(seed, j, ts, 5));
    return {
      x: o.x + f * W * 0.62,
      ang: -Math.PI / 2 + f * 0.55,
      h: H * hf,
      w: W * (nT === 1 ? 1 : 0.6) * (1 - 0.28 * side),
      bend: o.lean * 0.6 + H * 0.2 * (0.35 + turb) * wobble(seed, j + 40, ts, 3),
    };
  });
  const layers = [
    { hs: 1.07, ws: 1.12, lift: 0, fill: k.red },
    { hs: 1, ws: 1, lift: 0, fill: k.color },
    { hs: 0.7, ws: 0.62, lift: 0.1, fill: k.color2 },
  ];
  layers.forEach((L, li) => {
    if (li === 1) licks(out, o, H, W);
    tongues.forEach((g, j) => {
      if (li === 2 && (o.yellow === false || Math.abs(j - (nT - 1) / 2) > Math.max(0.5, nT / 4))) return; // the hot yellow is only in the middle tongues
      const pts = tongue(g.x, o.y - W * L.lift, g.ang, g.h * L.hs, g.w * L.ws, g.bend * L.hs, 0.6 + turb, seed + li, j, ts);
      out.push({ kind: "poly", points: pts, fill: L.fill, alpha: 1 });
    });
  });
  // embers: a few dots floating up (yellow, cooling to orange)
  const nE = Math.round(o.embers * Math.min(1, amp) * k.intensity);
  for (let i = 0; i < nE; i += 1) {
    const p = fireParticle(i + 100, ts, { x: o.x, y: o.y - H * 0.4, h: H, w: W * 0.7, life: 1.1, rise: 1.3, lean: o.lean, turbulence: turb + 0.3, seed });
    const r = Math.max(2, o.h * 0.016) * (1 - 0.4 * p.u) * (0.7 + 0.6 * p.b);
    out.push({ kind: "circle", x: p.x, y: p.y, r, fill: p.u < 0.5 ? k.color2 : k.color, alpha: 1 - smooth((p.u - 0.6) / 0.4) });
  }
}

// Licks: small flames that break off the tongues and rise, narrowing and flickering (orange, then yellow tips).
function licks(out: Shape[], o: FlameOpts, H: number, W: number) {
  const { k, seed } = o;
  const ts = o.t * k.speed;
  const nL = Math.round(o.licks * Math.min(1, o.amp) * k.intensity);
  for (let i = 0; i < nL; i += 1) {
    const p = fireParticle(i, ts, { x: o.x, y: o.y - H * (0.5 + 0.12 * rand(seed, i, 8)), h: H, w: W * 0.45, life: 0.6, rise: 0.75, lean: o.lean, turbulence: k.turbulence, seed });
    const lh = H * 0.32 * Math.pow(1 - p.u, 0.8) * (0.6 + 0.6 * p.b);
    if (lh < 1) continue;
    const pts = tongue(p.x, p.y, -Math.PI / 2, lh, lh * 0.46, o.lean * 0.2 + lh * 0.3 * wobble(seed, i + 60, ts, 6), 0.4, seed + 9, i, ts);
    out.push({ kind: "poly", points: pts, fill: p.u < 0.35 ? k.color : k.color2, alpha: 1 - smooth((p.u - 0.45) / 0.55) });
  }
}

// Keep everything on the page: nothing below the ground, nothing off the sides.
function onPage(shapes: Shape[], ctx: EffectContext): Shape[] {
  const g = ctx.groundY, W = ctx.stageWidth;
  for (const s of shapes) {
    if (s.kind === "circle") {
      s.r = Math.max(0, Math.min(s.r, g));
      s.y = Math.min(s.y, g - s.r);
      s.x = clamp(s.x, 0, W);
    } else if (s.kind === "rect") {
      s.y = Math.min(s.y, g - s.h);
    } else if (s.kind !== "symbol") {
      for (let j = 0; j + 1 < s.points.length; j += 2) {
        s.points[j] = clamp(s.points[j], 0, W);
        s.points[j + 1] = Math.min(s.points[j + 1], g);
      }
    }
  }
  return shapes;
}

// The way something goes: toward the target, else along `direction` (degrees, 0 = right) for `length` px.
function aim(ctx: EffectContext, p: EffectParams, fallbackLength: number) {
  const from = ctx.at;
  let to: Point;
  if (ctx.target) to = ctx.target;
  else {
    const a = deg(num(p.direction, 0));
    const len = num(p.length, fallbackLength);
    to = { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
  }
  const dx = to.x - from.x, dy = to.y - from.y, L = Math.max(1, Math.hypot(dx, dy));
  return { from, to, L, ux: dx / L, uy: dy / L };
}

// Draw order like a person layering paint: gray smoke, then everything red, then orange, then yellow on top.
function byLayer(k: Knobs, shapes: Shape[]): Shape[] {
  const rank = (s: Shape) => { const f = "fill" in s ? s.fill : undefined; return f === k.gray ? 0 : f === k.red ? 1 : f === k.color ? 2 : f === k.color2 ? 3 : 4; };
  return shapes.map((s, i) => ({ s, i, r: rank(s) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.s);
}

const fire: EffectRecipe = {
  id: "fire",
  about: "A flame burning at the anchor, drawn in flat layers (red outside, orange, yellow middle): tongues that rise, narrow to points, flicker and curl, a few licks breaking off the top, a few ember dots floating up. Builds up from a small flicker and dies down at the end. Knobs: color (main, default orange #ff8a1f), color2 (middle, default yellow #ffd23f; the outside red follows them), size (flame height x figure height, default 0.35), speed (flicker), intensity, turbulence, direction (degrees; -90 = straight up, tilt it for wind), seed.",
  draw(ctx, p) {
    const k = knobs(p);
    const size = num(p.size, 0.35);
    const H = size * ctx.height * (0.75 + 0.25 * Math.min(1.5, k.intensity));
    const grow = Math.min(0.7, ctx.duration * 0.3), fade = Math.min(0.8, ctx.duration * 0.3);
    const amp = (0.16 + 0.84 * smooth(ctx.t / Math.max(0.01, grow))) * smooth((ctx.duration - ctx.t) / Math.max(0.01, fade));
    const lean = Math.cos(deg(num(p.direction, -90))) * H * 0.5;
    const out: Shape[] = [];
    flame(out, { x: ctx.at.x, y: Math.min(ctx.at.y, ctx.groundY), h: H, w: H * 0.62, amp, t: ctx.t, seed: k.seed, k, lean, tongues: 4, licks: 3, embers: 4, glow: true });
    return onPage(out, ctx);
  },
};

const fireStream: EffectRecipe = {
  id: "fireStream",
  about: "Fire shooting from the anchor (a hand) toward the target (or along `direction`, `length` px): the standing flame turned on its side — its base in the hand, a long, wide flame in flat layers (red outside, orange, yellow core from the hand) with rough zigzag edges whose tongues lick out and flicker, curling up a little (fire rises), and a ragged round head where it hits. Little flames break off its edges and tip, rise, cool and fade to gray smoke; a few orange and yellow embers fly. The front goes out first (reaching the target after `reach` seconds when given), then a steady stream, then the last of it leaves the hand and burns out at the target. Knobs: color, color2, size (thickness at the hand x height, default 0.05), speed, spread (how fast it widens, cone degrees, default 18), turbulence, intensity, seed.",
  draw(ctx, p) {
    const k = knobs(p);
    const { from, L, ux, uy } = aim(ctx, p, ctx.height * 1.4);
    const ang = Math.atan2(uy, ux), nx = -uy, ny = ux;
    const ts = ctx.t * k.speed;
    const R0 = num(p.size, 0.05) * ctx.height;
    const spread = Math.tan(deg(clamp(num(p.spread, 18), 0, 170)) / 2);
    const life = clamp(L / (900 * k.speed), 0.22, 0.75);
    const reach = clamp(num(p.reach, life * 0.9), 0.08, 3); // seconds for the front to get there
    const emitEnd = Math.max(0.05, ctx.duration - life * 0.85);
    // how far the front of the fire is, and the back of it (the back leaves the hand when it stops pouring)
    const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 1.3);
    const front = (time: number) => L * ease(time / reach);
    const backOf = (time: number) => (time <= emitEnd ? 0 : L * ease((time - emitEnd) / reach));
    // how thick the fire is, d px from the hand: narrow at the hand, widening out (wider than a standing flame)
    const thick = (d: number) => R0 * 4 + spread * d * 1.1;
    const up = (px: number) => -px * ny; // (a sideways offset that is `px` UP the page: fire rises)
    const out: Shape[] = [];
    const d1 = front(ctx.t), d0 = backOf(ctx.t), len = d1 - d0;
    const hit = smooth((ctx.t - reach * 0.92) / 0.15) * (L > d1 + 2 ? 0 : 1); // it has reached what it hits
    // THE FLAME: the standing flame on its side — red, orange over it, the yellow core from the hand
    if (len > 3) {
      const grow = smooth(ctx.t / 0.12) * (1 - smooth((ctx.t - (ctx.duration - 0.06)) / 0.06));
      const W = thick(d1) * (1 + 0.06 * wobble(k.seed, 4, ts, 11)) * grow;
      const bx = from.x + ux * d0, by = from.y + uy * d0;
      const body = (s: number) => thick(d0 + s * len) / Math.max(1, thick(d1));
      const bend = up(0.07 * len) + R0 * 1.2 * k.turbulence * wobble(k.seed, 5, ts, 3);
      const wave = W * 0.12 * (0.4 + k.turbulence);
      const teeth = clamp(Math.round(len / 45), 3, 16);
      const layers = [
        { fill: k.red, h: 1, w: 1, teeth, tips: 7, round: 1, glow: 14 },
        { fill: k.color, h: 0.94, w: 0.86, teeth, tips: 7, round: 1, glow: 0 },
        { fill: k.color2, h: 0.72, w: 0.52, teeth: Math.max(2, Math.round(teeth * 0.6)), tips: 4, round: 0.6, glow: 0 },
      ];
      layers.forEach((Ly, j) => {
        const pts = flameOutline({
          x: bx, y: by, ang, h: len * Ly.h, w: W * Ly.w, body: (s) => body(s * Ly.h), teeth: Ly.teeth, tips: Ly.tips, round: Ly.round,
          rough: 0.45 + 0.25 * k.turbulence, bend: bend * Ly.h, wave: wave * Ly.w, rise: 0.5, flow: 5 * k.speed, back: 0.6, splash: hit * (j === 2 ? 0.5 : 1), seed: k.seed + (j === 2 ? 31 : 0), layer: j, t: ts,
        });
        out.push({ kind: "poly", points: pts, fill: Ly.fill, alpha: 1, glow: Ly.glow || undefined });
      });
    }
    // LITTLE FLAMES breaking off its edges and its head: carried on a bit, rising, shrinking, cooling
    // (yellow → orange → red) and fading to gray smoke
    const N = clamp(Math.round(9 * k.intensity), 3, 16), cl = 0.55;
    for (let i = 0; i < N; i += 1) {
      const { n, u, bornAt } = lifeOf(ts, i, N, cl, k.seed);
      const b = bornAt / k.speed;
      if (b < 0.05 || b > ctx.duration) continue;
      const bf = front(b), bb = backOf(b);
      if (bf - bb < 20) continue;
      const a = rand(k.seed, i, n * 5 + 1), c = rand(k.seed, i, n * 5 + 2);
      const d = bb + (bf - bb) * (0.3 + 0.7 * Math.sqrt(a)); // more of them near the head
      const sideSign = c < 0.62 ? (ny >= 0 ? -1 : 1) : ny >= 0 ? 1 : -1; // more off the top edge
      const off = sideSign * thick(d) * 0.42 + up(0.08 * (d - bb));
      const carry = Math.min(L - d, thick(d) * 1.2) * (1 - Math.exp(-3 * u)); // carried on (not through what it hits)
      const x = from.x + ux * (d + carry) + nx * off + k.turbulence * thick(d) * 0.3 * u * wobble(k.seed, i + n * 7, ts, 3);
      const y = from.y + uy * (d + carry) + ny * off - thick(d) * 1.6 * Math.pow(u, 1.1);
      const hh = thick(d) * (0.38 + 0.22 * rand(k.seed, i, n * 5 + 3)) * (1 - 0.55 * u);
      const pts = littleFlame(x, y, hh, 0.35 * ux * (1 - u), k.seed + i * 13 + n, ts);
      out.push({ kind: "poly", points: pts, fill: heat(k, 0.12 + 0.88 * u), alpha: 1 - smooth((u - 0.8) / 0.2) });
    }
    // a few EMBERS: orange and yellow dots flying out ahead, rising
    const E = clamp(Math.round(4 * k.intensity), 2, 8);
    for (let i = 0; i < E; i += 1) {
      const { n, u, bornAt } = lifeOf(ts, i + 50, E, 0.45, k.seed);
      const b = bornAt / k.speed;
      if (b < 0.05 || b > ctx.duration) continue;
      const bf = front(b), bb = backOf(b);
      if (bf - bb < 20) continue;
      const d = bb + (bf - bb) * (0.2 + 0.8 * rand(k.seed, i + 50, n * 3 + 1)), go = Math.min(L * 1.02 - d, thick(d) * 2) * u;
      const off = (rand(k.seed, i + 50, n * 3 + 2) - 0.5) * thick(d);
      out.push({ kind: "circle", x: from.x + ux * (d + go) + nx * off, y: from.y + uy * (d + go) + ny * off - thick(d) * 1.4 * u * u, r: Math.max(2, R0 * 0.22), fill: u < 0.5 ? k.color2 : k.color, alpha: 1 - smooth((u - 0.6) / 0.4) });
    }
    return onPage(byLayer(k, out), ctx);
  },
};

const fireball: EffectRecipe = {
  id: "fireball",
  about: "A ball of fire that forms at the anchor (a hand), then flies to the target (or along `direction`, `length` px) over the effect's time: a flame shaped like a ball with a tail, in flat layers (red outside, orange, yellow middle pushed forward), its outline rough and zigzag all round and flickering, its tail pointing back and curling up (fire rises); little flames shed behind it rise, cool and fade to gray smoke, with a few embers. Knobs: color, color2, size (ball width x height, default 0.22), speed (flicker), turbulence, intensity, seed. Pair it with fireBurst at the target for the hit.",
  draw(ctx, p) {
    const k = knobs(p);
    const { from, to, ux, uy } = aim(ctx, p, ctx.height * 3);
    const R = (num(p.size, 0.22) * ctx.height) / 2;
    const ts = ctx.t * k.speed;
    const form = Math.min(0.35, ctx.duration * 0.18);
    const pos = (time: number): Point => {
      const e = clamp((time - form) / Math.max(0.05, ctx.duration - form), 0, 1);
      const bob = R * 0.15 * wobble(k.seed, 77, time * k.speed, 3);
      return { x: lerp(from.x, to.x, e) - uy * bob, y: lerp(from.y, to.y, e) + ux * bob };
    };
    const P = pos(ctx.t);
    const grow = smooth(ctx.t / Math.max(0.01, form));
    const end = smooth((ctx.duration - ctx.t) / Math.max(0.01, Math.min(0.08, ctx.duration * 0.06)));
    const flying = ctx.t > form;
    const rr = R * (0.25 + 0.75 * grow) * (0.3 + 0.7 * end);
    const out: Shape[] = [];
    // trail: little flames shed from where the ball was, rising, shrinking and cooling (orange → red → gray smoke)
    const N = Math.round(6 * Math.min(2, k.intensity));
    const life = 0.42;
    for (let i = 0; i < N; i += 1) {
      const { n, u, bornAt } = lifeOf(ts, i, N, life, k.seed);
      const b = bornAt / k.speed;
      if (b < form || b > ctx.duration) continue;
      const q = pos(b);
      const a = rand(k.seed, i, n * 3 + 1) * 2 - 1, c = rand(k.seed, i, n * 3 + 2);
      const x = q.x - uy * a * R * 0.6 - ux * u * R * 0.8 + k.turbulence * R * 0.5 * u * wobble(k.seed, i + n * 9, ts, 4);
      const y = q.y + ux * a * R * 0.6 - uy * u * R * 0.8 - u * R * 1.4;
      const hh = R * (1.3 - 0.8 * u) * (0.7 + 0.5 * c);
      out.push({ kind: "poly", points: littleFlame(x, y + hh * 0.3, hh, -0.3 * ux * (1 - u), k.seed + i * 13 + n, ts), fill: heat(k, 0.35 + 0.65 * u), alpha: 1 - smooth((u - 0.78) / 0.22) });
    }
    // a few embers
    for (let i = 0; i < 3; i += 1) {
      const { n, u, bornAt } = lifeOf(ts, i + 40, 3, 0.5, k.seed);
      const b = bornAt / k.speed;
      if (b < form || b > ctx.duration) continue;
      const q = pos(b), a = rand(k.seed, i + 40, n * 3 + 1) * 2 - 1;
      out.push({ kind: "circle", x: q.x - uy * a * R - ux * u * R * 1.5, y: q.y + ux * a * R - u * R * 2.2, r: Math.max(2, R * 0.08), fill: u < 0.5 ? k.color2 : k.color, alpha: 1 - smooth((u - 0.6) / 0.4) });
    }
    // THE BALL: a flame shaped like a ball with a tail (pointing back and curling up, since fire rises), in 3 layers:
    // red outside (with the one soft glow), orange, then the yellow middle a little forward, where it pushes
    const bx = -ux, by = -uy - 0.35, bl = Math.hypot(bx, by) || 1;
    const ang = Math.atan2(by / bl, bx / bl);
    const tl = rr * (flying ? 3.4 : 1.6);
    const layers = [
      { fill: k.red, len: 1, w: 1, fwd: 0, glow: 16, teeth: 5, tips: 4 },
      { fill: k.color, len: 0.85, w: 0.86, fwd: 0.08, glow: 0, teeth: 4, tips: 3 },
      { fill: k.color2, len: 0.55, w: 0.52, fwd: 0.24, glow: 0, teeth: 3, tips: 3 },
    ];
    layers.forEach((Lr, j) => {
      if (rr < 1) return;
      const pts = flameOutline({
        x: P.x + ux * rr * Lr.fwd, y: P.y + uy * rr * Lr.fwd, ang, h: tl * Lr.len * (1 + 0.12 * wobble(k.seed, j + 20, ts, 7)), w: 2 * rr * Lr.w, body: FLAME_BODY.ball,
        teeth: Lr.teeth, tips: Lr.tips, round: 0, rough: 0.4 + 0.25 * k.turbulence, bend: rr * 0.5 * (0.4 + k.turbulence) * wobble(k.seed, j + 30, ts, 5), rise: 0.3, flow: 5, back: 1, seed: k.seed + j * 17, t: ts,
      });
      out.push({ kind: "poly", points: pts, fill: Lr.fill, alpha: 1, glow: Lr.glow || undefined });
    });
    return onPage(byLayer(k, out), ctx);
  },
};

const fireBurst: EffectRecipe = {
  id: "fireBurst",
  about: "An impact explosion at the anchor, in flat layers: a ball of fire with a rough zigzag flame outline (red, orange, a big yellow middle that flashes then shrinks) that swells, licks up and breaks up; little flames thrown outward and up (they slow, rise, shrink and cool yellow → orange → red, then fade to gray smoke), a few orange and yellow sparks, and gray smoke rising off it. Knobs: color, color2, size (burst radius x height, default 0.45), spread (degrees of the throw around straight up, default 160), speed, intensity, turbulence, seed.",
  draw(ctx, p) {
    const k = knobs(p);
    const R = num(p.size, 0.45) * ctx.height;
    const D = Math.max(0.2, ctx.duration);
    const t = ctx.t * k.speed;
    const O = { x: ctx.at.x, y: Math.min(ctx.at.y, ctx.groundY) };
    const spread = deg(clamp(num(p.spread, 160), 10, 360));
    const out: Shape[] = [];
    // smoke: gray wisps that start a little later, drift up, grow and fade
    const M = Math.round(3 * Math.min(2, k.intensity));
    for (let i = 0; i < M; i += 1) {
      const t0 = D * (0.2 + 0.2 * rand(k.seed, i, 41));
      const su = (t - t0) / Math.max(0.05, D - t0);
      if (su <= 0 || su >= 1) continue;
      const a = -Math.PI / 2 + (rand(k.seed, i, 42) - 0.5) * spread * 0.6;
      const d = R * (0.3 + 0.4 * rand(k.seed, i, 43)) * (0.4 + 0.6 * smooth(su * 2));
      const hh = R * 0.55 * (0.6 + 0.9 * su) * (0.8 + 0.4 * rand(k.seed, i, 44));
      const x = O.x + Math.cos(a) * d + k.turbulence * R * 0.15 * wobble(k.seed, i, t, 2), y = O.y + Math.sin(a) * d - R * 0.7 * su + hh * 0.4;
      out.push({ kind: "poly", points: flameOutline({ x, y, ang: -Math.PI / 2, h: hh, w: hh * 0.8, teeth: 3, tips: 3, round: 1, rough: 0.35, flow: 1.5, seed: k.seed + 90 + i, t }), fill: k.gray, alpha: 0.55 * smooth(su * 4) * (1 - su) });
    }
    // THE FIRE BALL of the blast: a round flame licking up, swelling, then breaking up. Its yellow middle starts as
    // big as the ball (the flash) and shrinks.
    const fl = t / Math.min(0.2, D * 0.25);
    const bu = t / (D * 0.45);
    if (bu < 1) {
      const br = R * 0.55 * smooth(Math.min(1, t / Math.min(0.12, D * 0.15))) * (1 - smooth(bu));
      const y = O.y - R * 0.15 * bu, a = 1;
      const layers = [
        { fill: k.red, w: 1, h: 1, glow: 20, teeth: 5, tips: 5, alpha: a },
        { fill: k.color, w: 0.86, h: 0.92, glow: 0, teeth: 4, tips: 4, alpha: a },
        { fill: k.color2, w: 0.5 + 0.3 * (1 - smooth(fl)), h: 0.6 + 0.25 * (1 - smooth(fl)), glow: 0, teeth: 3, tips: 3, alpha: a },
      ];
      if (br > 1) layers.forEach((Ly, j) => {
        const pts = flameOutline({ x: O.x, y: y + br * 0.2, ang: -Math.PI / 2, h: br * 2.1 * Ly.h, w: br * 2 * Ly.w, body: FLAME_BODY.ball, teeth: Ly.teeth, tips: Ly.tips, round: 0, rough: 0.5 + 0.3 * k.turbulence, rise: 0.4, flow: 4, back: 1, seed: k.seed + j * 23, t });
        out.push({ kind: "poly", points: pts, fill: Ly.fill, alpha: Ly.alpha, glow: Ly.glow || undefined });
      });
    }
    // little flames thrown outward and up: fast, then slow; they rise, shrink and cool, and end as gray smoke
    const N = Math.round(7 * Math.min(2, k.intensity));
    for (let i = 0; i < N; i += 1) {
      const life = D * (0.55 + 0.35 * rand(k.seed, i, 1));
      const u = t / life;
      if (u >= 1) continue;
      const a = -Math.PI / 2 + (rand(k.seed, i, 2) - 0.5) * spread;
      const d = (R * (0.6 + 1.2 * rand(k.seed, i, 3)) * (1 - Math.exp(-4.5 * u))) / (1 - Math.exp(-4.5));
      const x = O.x + Math.cos(a) * d + k.turbulence * R * 0.12 * u * wobble(k.seed, i, t, 4);
      const y = O.y + Math.sin(a) * d - R * 0.45 * u * u;
      const hh = R * 0.36 * (0.6 + 0.8 * rand(k.seed, i, 4)) * (0.45 + 0.9 * Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.15)));
      // a little flame standing up (fire rises), leaning a little the way it was thrown
      const lean = 0.45 * Math.cos(a) * (1 - u);
      out.push({ kind: "poly", points: littleFlame(x, y + hh * 0.3, hh, lean, k.seed + i * 7, t), fill: heat(k, u), alpha: 1 - smooth((u - 0.85) / 0.15) });
    }
    // a few orange and yellow dots (sparks) flying out fast
    for (let i = 0; i < 5; i += 1) {
      const u = t / (D * 0.45 * (0.7 + 0.6 * rand(k.seed, i, 21)));
      if (u >= 1) continue;
      const a = -Math.PI / 2 + (rand(k.seed, i, 22) - 0.5) * spread * 1.1;
      const d = R * (0.9 + 0.8 * rand(k.seed, i, 23)) * (1 - Math.pow(1 - u, 2));
      out.push({ kind: "circle", x: O.x + Math.cos(a) * d, y: O.y + Math.sin(a) * d, r: Math.max(2.5, R * 0.04), fill: i % 2 ? k.color : k.color2, alpha: 1 - smooth((u - 0.6) / 0.4) });
    }
    return onPage(byLayer(k, out), ctx);
  },
};

// One flame of a burning row (wildfire): the standing flame drawn with the flame outline — red, orange over it,
// the yellow middle — its points flickering and its edges zigzag, plus now and then an ember. `amp` 0..1 = how
// built-up it is.
function rowFlame(out: Shape[], k: Knobs, x: number, y: number, h: number, amp: number, lean: number, seed: number, t: number, ember: boolean) {
  const a = clamp(amp, 0, 1.5);
  if (a <= 0.03) return;
  const ts = t * k.speed, H = h * a * (1 + 0.12 * (0.6 + k.turbulence) * wobble(seed, 1, ts, 5)), W = h * 0.9 * (0.45 + 0.55 * Math.min(1, a));
  const bend = lean * 0.6 + H * 0.18 * (0.35 + k.turbulence) * wobble(seed, 2, ts, 3);
  const layers = [
    { fill: k.red, h: 1, w: 1, s: seed, tips: 4 },
    { fill: k.color, h: 0.93, w: 0.86, s: seed, tips: 4 },
    { fill: k.color2, h: 0.62, w: 0.5, s: seed + 5, tips: 3 },
  ];
  layers.forEach((L, j) => out.push({ kind: "poly", points: flameOutline({ x, y, ang: -Math.PI / 2, h: H * L.h, w: W * L.w, teeth: 3, tips: L.tips, round: 0, rough: 0.45 + 0.25 * k.turbulence, bend: bend * L.h, rise: 0.3, flow: 3, back: 0.2, seed: L.s, layer: j, t: ts }), fill: L.fill, alpha: 1 }));
  if (ember) {
    const p = fireParticle(7, ts, { x, y: y - H * 0.5, h: H, w: W * 0.6, life: 1.1, rise: 1.3, lean, turbulence: k.turbulence + 0.3, seed });
    out.push({ kind: "circle", x: p.x, y: p.y, r: Math.max(2, h * 0.02), fill: p.u < 0.5 ? k.color2 : k.color, alpha: 1 - smooth((p.u - 0.6) / 0.4) });
  }
}

const wildfire: EffectRecipe = {
  id: "wildfire",
  about: "Fire spreading along the ground from the anchor toward the target (or `direction`: 0 = right, 180 = left; `length` px): a row of flames, each drawn like the standing flame (red, orange, yellow layers with zigzag edges and a crown of flickering points), that catch one after another; older ones die down to a gray burnt line with a few embers and gray smoke wisps; a thin dim light on the ground under the fire; it all burns out at the end. Knobs: color, color2, size (flame height x height, default 0.22), speed, intensity, turbulence, seed.",
  draw(ctx, p) {
    const k = knobs(p);
    const sgn = ctx.target ? (ctx.target.x >= ctx.at.x ? 1 : -1) : Math.cos(deg(num(p.direction, 0))) < 0 ? -1 : 1;
    let L = ctx.target ? Math.abs(ctx.target.x - ctx.at.x) : num(p.length, ctx.height * 3);
    L = Math.max(0, Math.min(L, sgn > 0 ? ctx.stageWidth - 20 - ctx.at.x : ctx.at.x - 20));
    const H = num(p.size, 0.22) * ctx.height;
    const gap = H * 1.0;
    const N = Math.max(1, Math.floor(L / gap) + 1);
    const D = ctx.duration;
    const spreadTime = D * 0.6;
    const grow = Math.min(0.4, D * 0.12), burn = Math.max(0.5, D * 0.28), die = Math.min(0.8, D * 0.2);
    const endFade = smooth((D - ctx.t) / Math.max(0.01, Math.min(0.6, D * 0.15)));
    const y = ctx.groundY;
    const out: Shape[] = [], ground: Shape[] = [];
    let burnt0 = Infinity, burnt1 = -Infinity, charredMax = 0, lit0 = Infinity, lit1 = -Infinity, litMax = 0;
    for (let i = 0; i < N; i += 1) {
      const c = N === 1 ? 0 : spreadTime * Math.pow(i / (N - 1), 0.9) + 0.06 * rand(k.seed, i, 5);
      const age = ctx.t - c;
      if (age < 0) continue;
      const x = ctx.at.x + sgn * i * gap + (rand(k.seed, i, 6) - 0.5) * gap * 0.4;
      const amp = (0.2 + 0.8 * smooth(age / grow)) * (1 - smooth((age - burn) / die)) * endFade;
      const charred = smooth((age - burn) / die);
      // where it has burnt: the burnt line along the ground, an ember dot or two, and a smoke puff rising off it
      if (charred > 0) {
        burnt0 = Math.min(burnt0, x - gap * 0.55); burnt1 = Math.max(burnt1, x + gap * 0.55); charredMax = Math.max(charredMax, charred);
        const glowLeft = (1 - smooth((age - burn - die) / 1.2)) * endFade;
        if (glowLeft > 0.02 && i % 2 === 0) ground.push({ kind: "circle", x: x + (rand(k.seed, i, 10) - 0.5) * gap, y: y - 3, r: Math.max(2, H * 0.035), fill: k.color, alpha: glowLeft * (0.6 + 0.4 * wobble(k.seed, i * 3, ctx.t, 6)) });
        const su = clamp((age - burn) / (die + 1), 0, 1);
        const lift = 0.8 + 0.9 * rand(k.seed, i, 12);
        if (su > 0 && su < 1 && i % 2 === 1) {
          const sh = H * (0.25 + 0.2 * rand(k.seed, i, 14)) * (0.6 + 1.4 * su);
          const pts = flameOutline({ x: x + H * (0.15 + 0.35 * rand(k.seed, i, 13)) * su * (wobble(k.seed, i, ctx.t, 2) + 0.5 * sgn), y: y - H * (0.25 + lift * su) + sh * 0.4, ang: -Math.PI / 2, h: sh, w: sh * 0.8, teeth: 2, tips: 3, round: 1, rough: 0.35, flow: 1.5, seed: k.seed + 90 + i, t: ctx.t });
          ground.push({ kind: "poly", points: pts, fill: k.gray, alpha: 0.35 * Math.sin(Math.PI * su) * endFade });
        }
      }
      if (amp > 0.05) { lit0 = Math.min(lit0, x - gap * 0.6); lit1 = Math.max(lit1, x + gap * 0.6); litMax = Math.max(litMax, amp); }
      rowFlame(out, k, x, y, H * (0.75 + 0.5 * rand(k.seed, i, 7)), amp, sgn * H * 0.15, k.seed + i * 11, ctx.t, i % 3 === 0);
    }
    if (charredMax > 0) ground.unshift({ kind: "line", points: [burnt0, y - 1, burnt1, y - 1], stroke: k.gray, width: Math.max(2, H * 0.06), alpha: 0.8 * charredMax * Math.max(0.3, endFade) });
    // the fire's light on the ground: a thin, dim band under what is burning (never a dome)
    if (litMax > 0) ground.push(...groundLight((lit0 + lit1) / 2, y, (lit1 - lit0) / 2, ctx.height * 0.02, k.color, 0.18 * Math.min(1, litMax)));
    return onPage([...ground, ...out], ctx);
  },
};

export const RECIPES: EffectRecipe[] = [fire, fireStream, fireball, fireBurst, wildfire];
