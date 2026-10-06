// WATER recipes (SPEC-0017 Phase 2C): rules, not drawings. Water is heavy: it shoots out, arcs down under
// gravity, breaks into a few small teardrop droplets and splashes or spreads where it meets the ground (never below it). Every
// recipe obeys the knobs (color, color2 = foam/highlights, size, speed, direction, intensity, turbulence,
// spread, seed), so "green water" or "a slow purple wave" comes from knobs alone. Stateless seeded
// particles: the same moment always gives the same shapes, at any frame rate.
import { clamp, lifeOf, mixColor, rand, smooth, wobble } from "./random.ts";
import { PLACED_SYMBOLS, placedSymbol } from "../symbolMaker.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

const WATER = "#2f8fff";
const FOAM = "#bfe6ff";
const DEG = Math.PI / 180;
const GRAVITY = 4; // x figure height, px/s²

type Knobs = { color: string; color2: string; size: number; speed: number; dir: number; intensity: number; turbulence: number; spread: number; seed: number };

function knobs(p: EffectParams, def: { size: number; direction: number; spread: number; turbulence?: number }): Knobs {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    color: typeof p.color === "string" ? p.color : WATER,
    color2: typeof p.color2 === "string" ? p.color2 : FOAM,
    size: Math.max(0.005, num(p.size, def.size)),
    speed: clamp(num(p.speed, 1), 0.1, 5),
    dir: num(p.direction, def.direction) * DEG,
    intensity: clamp(num(p.intensity, 1), 0, 3),
    turbulence: clamp(num(p.turbulence, def.turbulence ?? 0.3), 0, 1),
    spread: clamp(num(p.spread, def.spread), 0, 360),
    seed: num(p.seed, 1),
  };
}

// Nothing below the ground: circles sit on it, lines and polygons are flattened onto it.
export function keepAboveGround(shapes: Shape[], groundY: number): Shape[] {
  for (const s of shapes) {
    if (s.kind === "circle") s.y = Math.min(s.y, groundY - s.r);
    else if (s.kind === "rect") s.h = Math.max(0, Math.min(s.h, groundY - s.y));
    else if (s.kind === "symbol") { // a placed symbol: its turned box sits on the ground
      const made = placedSymbol(s), a = ((s.rotation ?? 0) * Math.PI) / 180;
      s.y = Math.min(s.y, groundY - ((Math.abs(made.width * Math.sin(a)) + Math.abs(made.height * Math.cos(a))) / 2) * (s.scale ?? 1));
    } else {
      const pad = s.kind === "line" ? s.width / 2 : s.stroke ? (s.width ?? 2) / 2 : 0;
      for (let i = 1; i < s.points.length; i += 2) s.points[i] = Math.min(s.points[i], groundY - pad);
    }
  }
  return shapes;
}

const lighter = (c: string, u: number) => mixColor(c, "#ffffff", u);

// DRAWABLE BY HAND (Arthur): every water drop is the SAME simple shape — one small flat teardrop in the water
// color (the shield's blue #2f8fff by default), round end first, point trailing behind its motion. No streaks,
// no dots of foam, no highlights: one shape per drop, and only a few drops.
const dropR = (h: number, u: number) => h * 0.016 * (0.85 + 0.3 * u); // small: ~5 px on a 300 px figure

function droplet(out: Shape[], p: Point, v: Point, r: number, k: Knobs, alpha = 1) {
  if (alpha <= 0.01 || r < 0.5) return;
  const sp = Math.hypot(v.x, v.y);
  const back = sp > 1e-6 ? Math.atan2(-v.y, -v.x) : -Math.PI / 2; // the point trails behind (a still drop points up)
  // STILL THINGS ARE SYMBOLS: the drop keeps its look and only moves and turns, so it is the "Water droplet"
  // Library symbol (symbolMaker.ts droplet: the teardrop, point up), turned to point behind its motion. Its box
  // runs from the round end (r before the middle) to the point (2.3 r behind), so the box middle is 0.65 r back.
  const made = PLACED_SYMBOLS["Water droplet"].size / 3.3; // the made drop's round-end radius
  out.push({ kind: "symbol", name: "Water droplet", x: p.x + Math.cos(back) * r * 0.65, y: p.y + Math.sin(back) * r * 0.65, scale: r / made, rotation: ((back + Math.PI / 2) * 180) / Math.PI, color: k.color, alpha });
}

// A landed drop: one small flat splat on the ground for a moment (same color, one shape).
function splat(out: Shape[], x: number, groundY: number, rx: number, k: Knobs, alpha: number) {
  if (rx < 0.5 || alpha <= 0.01) return;
  const pts: number[] = [];
  for (let j = 0; j <= 8; j += 1) { const a = Math.PI + (j / 8) * Math.PI; pts.push(x + Math.cos(a) * rx, groundY + Math.sin(a) * rx * 0.3); }
  out.push({ kind: "poly", points: pts, fill: k.color, alpha: 0.8 * alpha });
}

// Foam: ONE puffy blob (a round middle and 3 bumps, squashed flat) in the foam color, instead of many dots.
function foam(out: Shape[], x: number, y: number, rx: number, ry: number, k: Knobs, alpha: number, seed: number, t: number) {
  if (rx < 1 || alpha <= 0.01) return;
  const cs = [{ x: 0, y: 0, r: 0.7 }];
  for (let j = 0; j < 3; j += 1) {
    const a = -Math.PI / 2 + (j - 1) * 1.1 + (rand(seed, j, 1) - 0.5) * 0.3;
    const br = 0.5 * (0.85 + 0.3 * rand(seed, j, 2)) * (1 + 0.08 * wobble(seed, j, t, 3));
    cs.push({ x: Math.cos(a) * (1 - br), y: Math.sin(a) * (1 - br), r: br });
  }
  const pts: number[] = [];
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
    let best = 0;
    for (const c of cs) { const b = c.x * ux + c.y * uy, q = b * b - (c.x * c.x + c.y * c.y - c.r * c.r); if (q >= 0) best = Math.max(best, b + Math.sqrt(q)); }
    pts.push(x + ux * best * rx, y + uy * best * ry);
  }
  out.push({ kind: "poly", points: pts, fill: k.color2, alpha });
}

// A flat puddle/splat sitting ON the ground (a half ellipse), centered at x.
function puddle(out: Shape[], x: number, groundY: number, rx: number, ry: number, k: Knobs, alpha: number) {
  if (rx < 0.5 || alpha <= 0.01) return;
  const pts: number[] = [];
  for (let j = 0; j <= 12; j += 1) {
    const a = Math.PI + (j / 12) * Math.PI;
    pts.push(x + Math.cos(a) * rx, groundY + Math.sin(a) * ry);
  }
  out.push({ kind: "poly", points: pts, fill: k.color, alpha: 0.8 * alpha });
  out.push({ kind: "line", points: [x - rx * 0.6, groundY - ry * 0.55, x + rx * 0.2, groundY - ry * 0.75], stroke: lighter(k.color2, 0.3), width: Math.max(1.5, ry * 0.3), alpha: 0.7 * alpha });
}

// Drops thrown from `at` (one-off or continuous), falling under gravity; on the ground they leave a quick splat.
// `bornOk(b)` decides if a drop born at time b exists (continuous splashes); `once` = one burst at t = 0.
function sprayDrops(out: Shape[], ctx: EffectContext, k: Knobs, o: { at: Point; ts: number; count: number; life: number; dir: number; spread: number; speed: [number, number]; salt: number; once?: boolean; bornOk?: (b: number) => boolean }) {
  const G = GRAVITY * ctx.height;
  for (let i = 0; i < o.count; i += 1) {
    let age: number, n: number;
    if (o.once) { n = 0; age = o.ts - rand(k.seed + o.salt, i, 3) * 0.08; }
    else {
      const L = o.life * (0.75 + 0.5 * rand(k.seed + o.salt, i, 7));
      const life = lifeOf(o.ts, i, o.count, L, k.seed + o.salt);
      if (o.bornOk && !o.bornOk(life.bornAt)) continue;
      n = life.n; age = life.u * L;
    }
    if (age < 0) continue;
    const s = k.seed + o.salt + n * 131;
    const ang = o.dir + (rand(s, i, 1) - 0.5) * o.spread;
    const sp = o.speed[0] + (o.speed[1] - o.speed[0]) * rand(s, i, 2);
    const vx = Math.cos(ang) * sp, vy0 = Math.sin(ang) * sp;
    const x = o.at.x + vx * age, y = o.at.y + vy0 * age + 0.5 * G * age * age;
    const r = dropR(ctx.height, rand(s, i, 4));
    if (y > ctx.groundY - r) {
      // landed: a small splat for a moment where it hit, then it's gone
      const dy = ctx.groundY - o.at.y;
      const hit = vy0 * vy0 + 2 * G * dy >= 0 ? (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * dy)) / G : age;
      const since = age - hit;
      if (since < 0.15 && since >= 0) splat(out, o.at.x + vx * hit, ctx.groundY, r * (1.4 + 4 * since), k, 1 - since / 0.15);
      continue;
    }
    droplet(out, { x, y }, { x: vx, y: vy0 + G * age }, r, k, o.once ? 1 - smooth((age - 0.7) / 0.5) : 1);
  }
}

// ---- waterStream ---------------------------------------------------------------------------------------
function waterStream(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, { size: 0.06, direction: 0, spread: 50 });
  const h = ctx.height, G = GRAVITY * h;
  const ts = ctx.t * k.speed, T = Math.max(0.05, ctx.duration * k.speed);
  const at = { x: ctx.at.x, y: Math.min(ctx.at.y, ctx.groundY - 1) };
  const tail = Math.min(0.35, T * 0.25); // the last water still flies after the tap closes
  const stopAt = T - tail;
  const rise = Math.min(0.3, T * 0.25);
  const power = 3.4 * h * (0.6 + 0.4 * k.intensity);
  // Aim: an arc that lands on the target, or straight out along `direction` until the ground.
  let vx: number, vy: number, endTau: number;
  const target = ctx.target ? { x: ctx.target.x, y: Math.min(ctx.target.y, ctx.groundY) } : undefined;
  if (target) {
    const dx = target.x - at.x, dy = target.y - at.y;
    const Tt = clamp(Math.hypot(dx, dy) / power, 0.08, 1.2);
    vx = dx / Tt; vy = (dy - 0.5 * G * Tt * Tt) / Tt; endTau = Tt;
  } else {
    vx = Math.cos(k.dir) * power; vy = Math.sin(k.dir) * power;
    const dy = ctx.groundY - at.y;
    endTau = (-vy + Math.sqrt(vy * vy + 2 * G * dy)) / G;
  }
  const end = { x: at.x + vx * endTau, y: at.y + vy * endTau + 0.5 * G * endTau * endTau };
  const onGround = end.y >= ctx.groundY - 2;
  const w0 = k.size * h * (0.7 + 0.3 * Math.min(1.5, k.intensity));
  // Water that left the nozzle at time e is at "flight time" tau = ts - e. Thickness follows the tap.
  const flow = (e: number) => (e < 0 || e > stopAt ? 0 : smooth(e / rise) * smooth((stopAt - e) / 0.15));
  const thick = (e: number) => (e < 0 || e > stopAt ? 0 : 0.35 + 0.65 * flow(e)); // the jet's head is round from the start
  const pos = (tau: number) => {
    const e = ts - tau;
    const vyT = vy + G * tau, sp = Math.hypot(vx, vyT) || 1;
    const wig = k.turbulence * w0 * 0.9 * wobble(k.seed, 0, e * 2.5, 3) * Math.min(1, tau * 5);
    return { x: at.x + vx * tau - (vyT / sp) * wig, y: at.y + vy * tau + 0.5 * G * tau * tau + (vx / sp) * wig, nx: -vyT / sp, ny: vx / sp };
  };
  const out: Shape[] = [];
  // the puddle where it lands (spreads while water keeps arriving)
  const firstHit = endTau, landed = ts - firstHit;
  if (onGround && landed > 0) {
    const arriving = Math.min(landed, stopAt);
    puddle(out, end.x + Math.sign(vx) * w0, ctx.groundY, Math.min(0.45 * h, w0 * 2 + 0.6 * h * arriving) * (0.5 + 0.5 * Math.min(1.5, k.intensity)), Math.min(0.05 * h, 3 + w0 * 0.35), k, 1 - smooth((landed - stopAt - 0.4) / 0.6));
  }
  // the jet itself: a coherent body from the nozzle to its front (it grows out, then its back leaves the hand)
  const tauMin = Math.max(0, ts - stopAt), tauMax = Math.min(ts, endTau);
  if (tauMax > tauMin + 1e-4) {
    const n = 18, left: number[] = [], right: number[] = [], core: number[] = [];
    for (let j = 0; j <= n; j += 1) {
      const tau = tauMin + ((tauMax - tauMin) * j) / n;
      const q = pos(tau), w = w0 * thick(ts - tau) * (1 + 0.7 * (tau / endTau)) * (j === 0 && tauMin > 0 ? 0.4 : 1);
      const up = q.ny < 0 ? 1 : -1; // the side of the jet that faces up gets the highlight
      left.push(q.x + q.nx * w * 0.5, q.y + q.ny * w * 0.5);
      right.unshift(q.y - q.ny * w * 0.5); right.unshift(q.x - q.nx * w * 0.5);
      core.push(q.x + q.nx * w * 0.22 * up, q.y + q.ny * w * 0.22 * up);
    }
    out.push({ kind: "poly", points: [...left, ...right], fill: k.color, stroke: mixColor(k.color, "#000000", 0.12), width: 1.5, alpha: 0.92 });
    out.push({ kind: "line", points: core, stroke: lighter(k.color2, 0.25), width: Math.max(1.5, w0 * 0.22), alpha: 0.85 });
    if (ts < endTau) { // the round head of the jet while it is still flying out
      const q = pos(tauMax), w = w0 * thick(ts - tauMax) * (1 + 0.7 * (tauMax / endTau));
      out.push({ kind: "circle", x: q.x, y: q.y, r: w * 0.62, fill: k.color, alpha: 0.95 });
    }
  }
  // droplets breaking off the jet
  const nd = Math.round(8 * (0.4 + 0.6 * k.intensity)); // a few drops, not a spray of dots
  for (let i = 0; i < nd; i += 1) {
    const L = 0.35 + 0.3 * rand(k.seed, i, 21);
    const life = lifeOf(ts, i, nd, L, k.seed + 7);
    const e = life.bornAt, age = life.u * L, s = k.seed + life.n * 17;
    if (flow(e) < 0.2 || age < 0.06 || age > endTau * 1.05) continue;
    const kick = (rand(s, i, 22) - 0.5) * 0.35 * power * (0.4 + k.turbulence), along = 1 + (rand(s, i, 23) - 0.5) * 0.12;
    const sp0 = Math.hypot(vx, vy) || 1;
    const dvx = vx * along - (vy / sp0) * kick, dvy = vy * along + (vx / sp0) * kick;
    const x = at.x + dvx * age, y = at.y + dvy * age + 0.5 * G * age * age;
    if (y > ctx.groundY - 2) continue;
    droplet(out, { x, y }, { x: dvx, y: dvy + G * age }, dropR(h, rand(s, i, 24)), k, flow(e));
  }
  // where it hits: water splashes back up and out (continuous while water arrives), with foam
  if (landed > 0 && landed < stopAt + 0.3) {
    const back = Math.atan2(-(vy + G * endTau), -vx); // straight back along the jet
    const splashDir = onGround ? -Math.PI / 2 + (vx > 0 ? 0.35 : -0.35) : (back - Math.PI / 2) * 0.5;
    sprayDrops(out, ctx, k, { at: { x: end.x, y: Math.min(end.y, ctx.groundY - 2) }, ts, count: Math.round(6 * (0.4 + 0.6 * k.intensity)), life: 0.45, dir: splashDir, spread: (k.spread + 60) * DEG, speed: [0.6 * h, 1.5 * h], salt: 31, bornOk: (b) => b - firstHit > 0 && b - firstHit < stopAt });
    const foamU = Math.min(1, landed / 0.12) * (1 - smooth((landed - stopAt) / 0.3));
    foam(out, end.x, Math.min(end.y, ctx.groundY) - w0 * 0.5 * foamU, w0 * 1.6 * foamU, w0 * 0.9 * foamU, k, 0.9 * foamU, k.seed + 41, ts);
  }
  return keepAboveGround(out, ctx.groundY);
}

// ---- waterShield ---------------------------------------------------------------------------------------
function waterShield(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, { size: 0.65, direction: -90, spread: 360, turbulence: 0.4 });
  const h = ctx.height, G = GRAVITY * h, g = ctx.groundY;
  const ts = ctx.t * k.speed, T = Math.max(0.1, ctx.duration * k.speed);
  const c = ctx.at, R = k.size * h;
  const form = Math.min(0.55, T * 0.3), burst = Math.min(0.6, T * 0.3), burstAt = T - burst;
  const out: Shape[] = [];
  const top = c.y - R;
  const amp = 0.008 + 0.02 * k.turbulence;
  const bv = ts > burstAt ? (ts - burstAt) / burst : 0;
  const grow = 1 + 0.1 * smooth(bv * 2);
  const radius = (th: number) => R * grow * (1 + amp * (0.6 * Math.sin(6 * th + 4.2 * ts) + 0.4 * Math.sin(11 * th - 5.3 * ts + 1) + 0.5 * wobble(k.seed, 3, ts + th, 2)));
  const domeAlpha = 1 - smooth(bv * 2.4);
  if (domeAlpha > 0.01) {
    // forming: walls climb from the ground faster than the water level fills in behind them
    const fill = ts < form ? smooth(ts / form) : 1;
    const walls = ts < form ? smooth(ts / (form * 0.7)) : 1;
    const levelY = g - fill * (g - top + R * 0.1);
    const wallY = g - walls * (g - top + R * 0.1);
    const N = 56, ring: Point[] = [];
    for (let j = 0; j < N; j += 1) {
      const th = -Math.PI / 2 + (j / N) * Math.PI * 2;
      const r = radius(th);
      ring.push({ x: c.x + Math.cos(th) * r, y: Math.min(g, c.y + Math.sin(th) * r) });
    }
    // the body: dome ∩ below the rising water level (with a wavy surface while it fills)
    const body: number[] = [];
    for (const q of ring) {
      const surf = levelY + (fill < 1 ? Math.sin(q.x * 0.06 + ts * 14) * R * 0.03 : 0);
      body.push(q.x, Math.max(q.y, Math.min(g, surf)));
    }
    out.push({ kind: "poly", points: body, fill: k.color, alpha: 0.4 * domeAlpha });
    // rim: the dome's outline above the ground, up to the climbing walls; a brighter inner edge
    const rimRuns = (scale: number): number[][] => {
      const runs: number[][] = [];
      let run: number[] = [];
      for (let j = 0; j <= N; j += 1) {
        const th = -Math.PI / 2 + (j / N) * Math.PI * 2, r = radius(th) * scale;
        const x = c.x + Math.cos(th) * r, y = c.y + Math.sin(th) * r;
        if (y <= g - 1 && y >= wallY) run.push(x, y);
        else { if (run.length >= 4) runs.push(run); run = []; }
      }
      if (run.length >= 4) runs.push(run);
      return runs;
    };
    for (const run of rimRuns(1)) out.push({ kind: "line", points: run, stroke: mixColor(k.color, k.color2, 0.35), width: Math.max(3, R * 0.03), alpha: 0.95 * domeAlpha, glow: 10 });
    for (const run of rimRuns(0.94)) out.push({ kind: "line", points: run, stroke: k.color2, width: Math.max(1.5, R * 0.012), alpha: 0.5 * domeAlpha });
    if (fill >= 1) {
      // shimmer: highlight streaks sliding round the dome, a shine spot, little bubbles rising
      for (let s = 0; s < 3; s += 1) {
        const th0 = -Math.PI * (0.25 + 0.25 * s) + ts * (s % 2 ? -0.5 : 0.8) * (0.6 + 0.4 * rand(k.seed, s, 51)), len = (0.22 + 0.12 * rand(k.seed, s, 52)) * Math.PI;
        const pts: number[] = [];
        for (let j = 0; j <= 8; j += 1) {
          const th = th0 + (j / 8) * len, r = radius(th) * (0.8 - 0.04 * s);
          const y = c.y + Math.sin(th) * r;
          if (y < g - R * 0.15) pts.push(c.x + Math.cos(th) * r, y);
        }
        if (pts.length >= 4) out.push({ kind: "line", points: pts, stroke: lighter(k.color2, 0.3), width: Math.max(2, R * (0.035 - 0.008 * s)), alpha: (0.55 + 0.25 * Math.sin(ts * 3 + s)) * domeAlpha });
      }
      out.push({ kind: "circle", x: c.x - R * 0.42, y: c.y - R * 0.55, r: R * 0.06, fill: lighter(k.color2, 0.6), alpha: 0.85 * domeAlpha });
      out.push({ kind: "circle", x: c.x - R * 0.28, y: c.y - R * 0.68, r: R * 0.03, fill: lighter(k.color2, 0.6), alpha: 0.8 * domeAlpha });
      for (let i = 0; i < 7; i += 1) {
        const life = lifeOf(ts, i, 7, 1.4, k.seed + 3), s = k.seed + life.n * 11;
        const bx = c.x + (rand(s, i, 61) - 0.5) * R * 1.3 + wobble(s, i, ts, 3) * R * 0.04;
        const by = g - life.u * (g - top) * 0.85;
        if (Math.hypot(bx - c.x, by - c.y) < R * 0.9 && by < g - 4) out.push({ kind: "circle", x: bx, y: by, r: R * (0.015 + 0.015 * rand(s, i, 62)), stroke: lighter(k.color2, 0.4), width: 1.5, alpha: 0.7 * domeAlpha });
      }
    } else {
      // spray off the rising edges while it forms
      for (let i = 0; i < 4; i += 1) {
        const side = i % 2 ? 1 : -1, yy = Math.max(wallY, top);
        const dyc = clamp((yy - c.y) / R, -1, 1), xx = c.x + side * Math.sqrt(1 - dyc * dyc) * R;
        const a = (ts * 6 + rand(k.seed, i, 71)) % 1;
        droplet(out, { x: xx + side * a * R * 0.15, y: yy - a * R * 0.12 + a * a * R * 0.2 }, { x: side * R * 0.15, y: -R * 0.12 + 2 * a * R * 0.2 }, dropR(h, rand(k.seed, i, 72)) * (1 - 0.4 * a), k, 0.9 * (1 - a));
      }
    }
  }
  if (bv > 0) {
    // the burst: a ring flash and the whole surface breaking into drops that fly out and fall
    const a = ts - burstAt;
    out.push({ kind: "line", points: Array.from({ length: 25 }, (_, j) => { const th = -Math.PI + (j / 24) * Math.PI; return [c.x + Math.cos(th) * R * (1 + 0.35 * bv), Math.min(g, c.y + Math.sin(th) * R * (1 + 0.35 * bv))]; }).flat(), stroke: k.color2, width: 3, alpha: 0.8 * (1 - smooth(bv * 1.6)) });
    const n = Math.round(16 * (0.5 + 0.5 * k.intensity)); // a few drops, not a spray of dots
    for (let i = 0; i < n; i += 1) {
      const th = -Math.PI * (0.02 + 0.96 * rand(k.seed, i, 81));
      const y0 = Math.min(g - 4, c.y + Math.sin(th) * R), x0 = c.x + Math.cos(th) * R;
      const sp = R * (1 + 1.6 * rand(k.seed, i, 82));
      const vx = Math.cos(th) * sp, vy = Math.sin(th) * sp - R * 0.6 * rand(k.seed, i, 83);
      const x = x0 + vx * a, y = y0 + vy * a + 0.5 * G * a * a, r = dropR(h, rand(k.seed, i, 84));
      if (y > g - r) {
        const hit = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * G * (g - y0)))) / G, since = a - hit;
        if (since >= 0 && since < 0.15) splat(out, x0 + vx * hit, g, r * (1.4 + 4 * since), k, 1 - since / 0.15);
        continue;
      }
      droplet(out, { x, y }, { x: vx, y: vy + G * a }, r, k, 1);
    }
  }
  return keepAboveGround(out, g);
}

// ---- splash -------------------------------------------------------------------------------------------
function splash(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, { size: 0.5, direction: -90, spread: 130 });
  const h = ctx.height, G = GRAVITY * h, g = ctx.groundY;
  const ts = ctx.t * k.speed, T = Math.max(0.05, ctx.duration * k.speed);
  const R = k.size * h * (0.6 + 0.4 * Math.min(1.5, k.intensity));
  const at = { x: ctx.at.x, y: Math.min(ctx.at.y, g) };
  const out: Shape[] = [];
  const fade = 1 - smooth((ts - (T - 0.2)) / 0.2);
  // the ring spreading out on the water/ground
  const ringU = ts / 0.7;
  if (ringU < 1) {
    const rx = R * (0.15 + 0.9 * (1 - (1 - ringU) ** 2)), ry = rx * 0.2, cy = Math.min(at.y, g - ry - 1);
    out.push({ kind: "line", points: Array.from({ length: 29 }, (_, j) => [at.x + Math.cos((j / 28) * Math.PI * 2) * rx, cy + Math.sin((j / 28) * Math.PI * 2) * ry]).flat(), stroke: k.color2, width: Math.max(2, R * 0.03), alpha: (1 - ringU) * fade });
  }
  // the crown: a ring of spikes jumping up, then falling back
  const crownU = ts / 0.38;
  if (crownU < 1) {
    const hc = R * 0.55 * Math.sin(Math.PI * crownU), bw = R * (0.18 + 0.35 * crownU), spikes = 7, pts: number[] = [];
    pts.push(at.x - bw, at.y);
    for (let j = 0; j <= spikes * 2; j += 1) {
      const u = j / (spikes * 2), x = at.x - bw * 1.15 + u * bw * 2.3;
      const tip = j % 2 === 1;
      const hh = tip ? hc * (0.55 + 0.45 * Math.sin(Math.PI * u)) * (0.8 + 0.4 * rand(k.seed, j, 91)) : hc * 0.25 * Math.sin(Math.PI * u);
      pts.push(x + (tip ? (u - 0.5) * hc * 0.5 : 0), at.y - hh);
    }
    pts.push(at.x + bw, at.y);
    out.push({ kind: "poly", points: pts, fill: k.color, stroke: lighter(k.color2, 0.2), width: 2, alpha: 0.9 * fade });
  }
  // drops thrown up and out in arcs
  const speedTop = Math.sqrt(2 * G * R);
  sprayDrops(out, ctx, k, { at: { x: at.x, y: at.y - 2 }, ts, count: Math.round(10 * (0.5 + 0.5 * k.intensity)), life: 1, dir: k.dir, spread: k.spread * DEG, speed: [0.35 * speedTop, speedTop], salt: 5, once: true });
  // a little water left behind on the ground
  if (at.y >= g - 4) puddle(out, at.x, g, R * (0.25 + 0.35 * smooth(ts / 0.5)), R * 0.06, k, 0.8 * fade);
  return keepAboveGround(out, g);
}

// ---- waves --------------------------------------------------------------------------------------------
function waves(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, { size: 0.3, direction: 0, spread: 0 });
  const h = ctx.height, G = GRAVITY * h, g = ctx.groundY;
  const ts = ctx.t * k.speed, T = Math.max(0.1, ctx.duration * k.speed);
  const sgn = Math.cos(k.dir) >= 0 ? 1 : -1;
  const Hmax = k.size * h * (0.6 + 0.4 * Math.min(1.5, k.intensity));
  const Lw = 1.7, gap = 0.6, range = 3.2 * h * (0.6 + 0.4 * Math.min(1.5, k.intensity));
  const stopAt = Math.max(0, T - 0.5);
  const X = (s: number) => ctx.at.x + sgn * s;
  const out: Shape[] = [];
  const last = Math.floor(ts / gap);
  for (let j = Math.max(0, last - 4); j <= last; j += 1) {
    const b = j * gap, a = ts - b;
    if (a < 0 || a > Lw || b > stopAt) continue;
    const strength = smooth(b / 0.4 + 0.35) * smooth((stopAt - b) / 0.6 + 0.2) * (0.8 + 0.2 * rand(k.seed, j, 1));
    const life = a / Lw;
    const H = Hmax * strength * Math.sin(Math.PI * Math.min(1, life * 1.15 + 0.08)) ** 0.7;
    if (H < 2) continue;
    const s = range * (0.15 * life + 0.85 * (1 - (1 - life) ** 1.15)); // the crest rolls out, easing a little
    const back = Math.min(s + H * 0.3, H * 5 + 0.15 * h);
    const pts: number[] = [];
    const n = 14;
    for (let q = 0; q <= n; q += 1) {
      const u = q / n, x = s - back + u * back;
      const ripple = Math.sin(x * 0.045 - ts * 7 + j) * H * 0.06 * (1 + k.turbulence) * u;
      pts.push(X(x), g - H * u ** 1.6 - ripple);
    }
    const curl = 1 + 0.15 * wobble(k.seed, j, ts, 3) * k.turbulence;
    // the breaking front: up over the lip, curl under, then down the face to the ground
    pts.push(X(s + 0.25 * H * curl), g - 1.12 * H, X(s + 0.62 * H * curl), g - 0.95 * H, X(s + 0.58 * H * curl), g - 0.68 * H, X(s + 0.3 * H), g - 0.6 * H, X(s + 0.42 * H), g - 0.3 * H, X(s + 0.66 * H), g);
    pts.push(X(s - back), g);
    const alpha = 0.92 * (1 - smooth((life - 0.75) / 0.25));
    out.push({ kind: "poly", points: pts, fill: k.color, stroke: mixColor(k.color, "#000000", 0.15), width: 2, alpha });
    // light band along the face and foam on the crest
    const band: number[] = [];
    for (let q = 4; q <= n; q += 1) { const u = q / n, x = s - back + u * back; band.push(X(x), g - H * u ** 1.6 + H * 0.16); }
    out.push({ kind: "line", points: band, stroke: mixColor(k.color, k.color2, 0.55), width: Math.max(2, H * 0.09), alpha: alpha * 0.8 });
    foam(out, X(s + H * 0.02), g - H * 1.06, H * 0.42, H * 0.16, k, alpha, k.seed + j * 7, ts);
    // spray off the crest
    for (let d = 0; d < 3; d += 1) {
      const da = (a * 1.4 + rand(k.seed, j * 13 + d, 3)) % 0.5, sx = s - H * 0.2 * rand(k.seed, j * 13 + d, 4);
      const vx = (0.4 + 0.5 * rand(k.seed, j * 13 + d, 5)) * h, vy = -(0.6 + 0.6 * rand(k.seed, j * 13 + d, 6)) * h * Math.min(1, H / (0.25 * h));
      const x = sx + vx * da, y = g - H * 1.05 + vy * da + 0.5 * G * da * da;
      if (y < g - 3 && sx - (s - back) > 0) droplet(out, { x: X(x), y }, { x: sgn * vx, y: vy + G * da }, dropR(h, rand(k.seed, j * 13 + d, 7)), k, alpha * (1 - da / 0.5));
    }
  }
  return keepAboveGround(out, g);
}

export const RECIPES: EffectRecipe[] = [
  { id: "waterStream", about: "a jet of water from the anchor (a hand) toward the target or `direction`: builds up, arcs down under gravity, drops break off, splashes/spreads where it lands, tails off. color = water, color2 = foam, size = jet thickness x height (0.06), intensity = power.", draw: waterStream },
  { id: "waterShield", about: "a see-through dome of water around the anchor (put it at a figure's hip): forms from the ground up, shimmers (ripples, sliding highlights, bubbles), bursts into falling drops at the end. size = radius x height (0.65), color2 = highlights.", draw: waterShield },
  { id: "splash", about: "an impact splash at the anchor: a crown, drops thrown up and out in arcs that fall back, a ring spreading. size = how high it throws x height (0.5), direction/spread = which way.", draw: splash },
  { id: "waves", about: "water waves rolling along the ground from the anchor in `direction` (left or right), curling and foaming at the crest, one after another. size = wave height x height (0.3).", draw: waves },
];
