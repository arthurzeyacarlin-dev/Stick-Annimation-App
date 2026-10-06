// LIGHTNING recipes (SPEC-0017 Phase 2C). Registered in index.ts.
//
// "lightning": a bolt from the top of the page down to the target (or straight down to the ground at the anchor).
// Its shape is made by a RULE, not drawn: the line from sky to target is split again and again, each middle point
// pushed sideways by a seeded random amount (midpoint displacement), and branches split off the same way. Its
// timing: a faint leader zig-zags down first, then the bright strike (white core + colored glow), it flickers
// (re-strikes 1–2 times with a slightly different shape), then fades. The ground flashes and sparks fly where it
// hits.
// "sparks": small bright sparks that fly out of the anchor and fall (impacts, electric hands).
//
// Every shape is worked out from (seed, t) alone, so it is the same at any frame rate.
import { clamp, lerp, lifeOf, mixColor, rand } from "./random.ts";
import { groundLight } from "./groundLight.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const flat = (pts: Point[], groundY: number) => pts.flatMap((p) => [p.x, Math.min(p.y, groundY)]);

// The upper half of an ellipse sitting on the ground (a light pool / flash that never goes below the ground).
export function dome(cx: number, groundY: number, rx: number, ry: number, steps = 14): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = Math.PI + (Math.PI * i) / steps;
    pts.push(cx + Math.cos(a) * rx, groundY + Math.sin(a) * ry);
  }
  return pts;
}

// A jagged line from a to b: split each piece in two and push the middle point sideways (seeded), `depth` times.
// The first splits push less (the bolt keeps heading for its end), the small ones more (sharp zig-zags).
// A middle point that would go below the ground is pushed the other way instead (a bolt never digs in).
function jag(a: Point, b: Point, depth: number, rough: number, seed: number, key: number, groundY = Infinity): Point[] {
  let pts = [a, b];
  for (let level = 0; level < depth; level += 1) {
    const next: Point[] = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const p = pts[i], q = pts[i + 1];
      const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
      const push = (rand(seed, key * 977 + level * 131 + i, 3) - 0.5) * 2 * len * rough * (level === 0 ? 0.35 : level === 1 ? 0.6 : 1);
      const mid = (k: number) => ({ x: (p.x + q.x) / 2 - (dy / len) * push * k, y: (p.y + q.y) / 2 + (dx / len) * push * k });
      let m = mid(1);
      if (m.y > groundY - 2) m = mid(-1);
      if (m.y > groundY - 2) m = mid(0);
      next.push(m, q);
    }
    pts = next;
  }
  return pts;
}

// One channel of the bolt: its points, how deep a branch it is (0 = main), which channel it grows from and where.
type Channel = { pts: Point[]; level: number; parent: number; from: number; key: number };

// The bolt's channels: the main one (sky → end) and its branches (and their branches), all from the seed.
function boltChannels(start: Point, end: Point, seed: number, turbulence: number, spreadDeg: number, branchiness: number, groundY: number): Channel[] {
  const rough = 0.16 + 0.3 * turbulence;
  const out: Channel[] = [{ pts: jag(start, end, 6, rough, seed, 1, groundY), level: 0, parent: -1, from: 0, key: 1 }];
  const grow = (pi: number, count: number, level: number) => {
    const parent = out[pi], n = parent.pts.length;
    for (let b = 0; b < count; b += 1) {
      const key = parent.key * 31 + b + 7;
      const at = Math.floor(n * lerp(0.12, 0.75, rand(seed, key, 11)));
      const p = parent.pts[at], q = parent.pts[Math.min(n - 1, at + 3)];
      const heading = Math.atan2(q.y - p.y, q.x - p.x);
      const side = rand(seed, key, 12) < 0.5 ? -1 : 1;
      const turn = side * ((spreadDeg * Math.PI) / 180) * lerp(0.45, 1, rand(seed, key, 13));
      const restLen = Math.hypot(parent.pts[n - 1].x - p.x, parent.pts[n - 1].y - p.y);
      const len = restLen * lerp(0.22, 0.5, rand(seed, key, 14)) * (level === 1 ? 1 : 0.7);
      const tip = { x: p.x + Math.cos(heading + turn) * len, y: Math.min(groundY - 4, p.y + Math.sin(heading + turn) * len) };
      out.push({ pts: jag(p, tip, level === 1 ? 4 : 3, rough * 1.1, seed, key, groundY), level, parent: pi, from: at, key });
      if (level < 2) grow(out.length - 1, rand(seed, key, 15) < 0.6 * branchiness ? 1 : 0, level + 1);
    }
  };
  grow(0, Math.round(lerp(2, 5, rand(seed, 2, 16)) * branchiness), 1);
  return out;
}

// A re-strike takes a slightly new path: each channel's inner points nudged sideways (its ends stay put, and a
// branch moves with the point it grows from, so it stays joined on).
function restrikePaths(channels: Channel[], seed: number, strike: number, amount: number): Point[][] {
  const out: Point[][] = [];
  channels.forEach((ch, c) => {
    const shift = ch.parent < 0 ? { x: 0, y: 0 } : { x: out[ch.parent][ch.from].x - channels[ch.parent].pts[ch.from].x, y: out[ch.parent][ch.from].y - channels[ch.parent].pts[ch.from].y };
    const last = ch.pts.length - 1;
    out[c] = ch.pts.map((p, i) => {
      if (i === 0 || (i === last && ch.level === 0)) return { x: p.x + shift.x, y: p.y + shift.y };
      const r = (k: number) => rand(seed, ch.key * 53 + i + strike * 7919, k) - 0.5;
      return { x: p.x + shift.x + r(21) * amount, y: p.y + shift.y + r(22) * amount * 0.4 };
    });
  });
  return out;
}

// The bolt's clock (seconds at speed 1; squeezed if the effect is shorter): leader, strikes with dim gaps, fade.
export function lightningPhases(duration: number, params: EffectParams) {
  const seed = num(params.seed, 1);
  const total = 0.9;
  const k = Math.max(1e-3, Math.min(1 / Math.max(0.05, num(params.speed, 1)), duration > 0 ? duration / total : 1));
  const restrikes = rand(seed, 5, 30) < 0.5 ? 1 : 2;
  const strikes: Array<[number, number, number]> = [[0.1, 0.2, 1]]; // [from, to, brightness]
  strikes.push([0.26, 0.36, 0.9]);
  if (restrikes >= 2) strikes.push([0.41, 0.49, 0.8]);
  const fadeFrom = strikes[strikes.length - 1][1];
  return { k, leaderEnd: 0.1 * k, strikes: strikes.map(([a, b, s]) => [a * k, b * k, s] as [number, number, number]), fadeFrom: fadeFrom * k, end: total * k };
}

type SparkOptions = { count: number; life: number; speed: number; dir: number; spread: number; width: number; color: string; core: string; seed: number; burst: boolean; groundY: number; gravity: number };

// Small bright sparks flying out of `o` and falling (burst = all at once; otherwise born again and again).
function sparkShapes(o: Point, t: number, opt: SparkOptions): Shape[] {
  const shapes: Shape[] = [];
  for (let i = 0; i < opt.count; i += 1) {
    let age: number, life: number, key: number;
    if (opt.burst) {
      age = t - rand(opt.seed, i, 40) * 0.04;
      life = opt.life * lerp(0.6, 1.4, rand(opt.seed, i, 41));
      key = i;
    } else {
      const l = lifeOf(t, i, opt.count, opt.life, opt.seed);
      if (l.bornAt < -1e-9) continue; // not born yet (nothing before the effect starts)
      age = l.u * opt.life;
      key = i * 7 + l.n * 131;
      life = opt.life * lerp(0.6, 1, rand(opt.seed, key, 41));
    }
    if (age < 0 || age > life) continue;
    const a = ((opt.dir + (rand(opt.seed, key, 42) - 0.5) * opt.spread) * Math.PI) / 180;
    const v = opt.speed * lerp(0.45, 1.25, rand(opt.seed, key, 43));
    const at = (s: number) => ({ x: o.x + Math.cos(a) * v * s, y: o.y + Math.sin(a) * v * s + 0.5 * opt.gravity * s * s });
    const head = at(age);
    if (head.y > opt.groundY) continue; // it has landed
    const tail = at(Math.max(0, age - 0.04));
    const fade = 1 - (age / life) ** 2;
    const pts = [tail.x, Math.min(tail.y, opt.groundY), head.x, head.y];
    shapes.push({ kind: "line", points: pts, stroke: opt.color, width: opt.width * 2.2, alpha: fade * 0.5, glow: 8 });
    shapes.push({ kind: "line", points: pts, stroke: opt.core, width: opt.width, alpha: fade, glow: 4 });
  }
  return shapes;
}

const lightning: EffectRecipe = {
  id: "lightning",
  about: "A lightning bolt from the top of the page down to the target (or straight down to the ground at the anchor): a faint leader zig-zags down, then a bright strike (white core `color2`, glow `color`, default classic yellow #ffe14d — purple only when `color` says so, e.g. #a64dff), it flickers with 1–2 re-strikes, then fades (about 0.9 s at speed 1); jagged with branches (`turbulence` = how jagged, `spread` = branch angle, `intensity` = brightness and branches, `seed` = a different bolt); the ground flashes and sparks fly at the impact. `from: \"anchor\"` shoots it from the anchor (a hand) to the target instead of from the sky; `direction` tilts a sky bolt with no target. `size` = thickness.",
  draw(ctx: EffectContext, p: EffectParams): Shape[] {
    const seed = num(p.seed, 1);
    const color = str(p.color, "#ffe14d"), core = str(p.color2, "#ffffff");
    const size = num(p.size, 1), intensity = clamp(num(p.intensity, 1), 0, 2);
    const turbulence = clamp(num(p.turbulence, 0.5), 0, 1), spread = num(p.spread, 35);
    const ph = lightningPhases(ctx.duration, p);
    const t = ctx.t;
    if (t > ph.end || intensity <= 0) return [];
    // Where it starts and ends.
    let end: Point, start: Point;
    if (ctx.target) {
      end = { x: ctx.target.x, y: Math.min(ctx.target.y, ctx.groundY) };
      start = p.from === "anchor" ? ctx.at : { x: end.x + (rand(seed, 3, 31) - 0.5) * ctx.height * 0.6, y: -10 };
    } else {
      end = { x: ctx.at.x, y: ctx.groundY };
      const dir = (num(p.direction, 90) * Math.PI) / 180;
      const len = (ctx.groundY + 10) / Math.max(0.2, Math.sin(dir));
      start = { x: end.x - Math.cos(dir) * len, y: -10 };
    }
    const channels = boltChannels(start, end, seed, turbulence, spread, clamp(0.6 + 0.4 * intensity, 0.3, 1.4), ctx.groundY);
    const w = ctx.height * 0.02 * size;
    const shapes: Shape[] = [];

    // 1) The leader: faint, thin, zig-zagging down (it has not reached the end yet).
    if (t < ph.leaderEnd) {
      const mainN = channels[0].pts.length - 1;
      const mainCut = (0.15 + 0.8 * (t / ph.leaderEnd)) * mainN;
      for (const ch of channels) {
        // a branch's leader starts when the main leader passes the point it grows from (level-2 ones: their branch)
        const from = ch.level === 0 ? 0 : ch.level === 1 ? ch.from : channels[ch.parent].from;
        if (ch.level > 0 && from > mainCut) continue;
        const cut = ch.level === 0 ? Math.floor(mainCut) : Math.floor((ch.pts.length - 1) * clamp((mainCut - from) / (mainN * 0.35), 0, 1));
        if (cut < 1) continue;
        shapes.push({ kind: "line", points: flat(ch.pts.slice(0, cut + 1), ctx.groundY), stroke: color, width: Math.max(1, w * (ch.level ? 0.18 : 0.3)), alpha: 0.45 * Math.min(1, intensity), glow: 6 });
      }
      return shapes;
    }

    // 2) Which strike (or dim gap between strikes, or the fade) is it?
    let bright = 0, strike = ph.strikes.findIndex(([a, b]) => t >= a && t < b);
    const lit = strike >= 0;
    let fadeU = 0;
    if (lit) bright = ph.strikes[strike][2];
    else if (t >= ph.fadeFrom) { fadeU = clamp((t - ph.fadeFrom) / (ph.end - ph.fadeFrom), 0, 1); bright = 0.55 * (1 - fadeU) ** 2; strike = ph.strikes.length - 1; }
    else { bright = 0.22; strike = Math.max(0, ph.strikes.findIndex(([a]) => a > t) - 1); }
    bright *= Math.min(1.3, intensity);
    if (bright <= 0.01) return [];

    // 3) The bolt: every channel drawn as a wide colored halo, a colored glow and a white-hot core.
    const paths = strike > 0 ? restrikePaths(channels, seed, strike, ctx.height * 0.05) : channels.map((c) => c.pts);
    const hidden: boolean[] = [];
    channels.forEach((ch, c) => {
      // a re-strike lights a slightly different set of branches (a branch's own branches go dark with it)
      hidden[c] = ch.level > 0 && strike > 0 && (hidden[ch.parent] || rand(seed, ch.key * 7 + strike, 50) < 0.3);
      if (hidden[c]) return;
      const thin = ch.level === 0 ? 1 : ch.level === 1 ? 0.5 : 0.3;
      const pf = flat(paths[c], ctx.groundY);
      const bw = w * thin * (1 - 0.5 * fadeU);
      shapes.push({ kind: "line", points: pf, stroke: color, width: bw * 4.5, alpha: 0.22 * bright, glow: 30 });
      shapes.push({ kind: "line", points: pf, stroke: color, width: bw * 2.2, alpha: 0.75 * bright, glow: 16 });
      shapes.push({ kind: "line", points: pf, stroke: lit ? core : mixColor(core, color, 0.4), width: Math.max(1, bw), alpha: Math.min(1, bright * 1.1), glow: 8 });
    });

    // 4) The impact: a flash where it hits (a dome of light on the ground, or a ball of light in the air) and sparks.
    const flashA = clamp(bright, 0, 1);
    if (ctx.groundY - end.y < ctx.height * 0.15) {
      // LIGHT ON THE GROUND: a thin, dim band along the ground (a reflection), never a thick dome or a white disc.
      shapes.push(...groundLight(end.x, ctx.groundY, ctx.height * 1.4 * size, ctx.height * 0.04, color, 0.18 * flashA, core));
    } else {
      const r = Math.min(ctx.height * 0.16 * size, Math.max(0, ctx.groundY - end.y));
      shapes.push({ kind: "circle", x: end.x, y: end.y, r, fill: color, alpha: 0.35 * flashA, glow: 30 });
      shapes.push({ kind: "circle", x: end.x, y: end.y, r: r * 0.45, fill: core, alpha: 0.85 * flashA, glow: 16 });
    }
    shapes.push(...sparkShapes(end, t - ph.strikes[0][0], {
      count: Math.round(14 * Math.max(0.3, intensity)), life: 0.45 * ph.k, speed: (ctx.height * 2.2) / ph.k, dir: -90, spread: 170,
      width: Math.max(1, w * 0.35), color, core, seed: seed + 101, burst: true, groundY: ctx.groundY, gravity: (ctx.height * 9) / (ph.k * ph.k),
    }));
    return shapes;
  },
};

const sparks: EffectRecipe = {
  id: "sparks",
  about: "Small bright sparks flying out of the anchor and falling (for impacts or electric hands). `color` (default gold #ffd84d) with a hot `color2` core (default white); `direction` (default -90 = up) and `spread` (default 140°) aim them; `burst: true` = one burst at the start instead of a steady stream; `intensity` = how many; `speed`, `size`, `seed`.",
  draw(ctx: EffectContext, p: EffectParams): Shape[] {
    const speed = Math.max(0.05, num(p.speed, 1)), size = num(p.size, 1), intensity = clamp(num(p.intensity, 1), 0, 3);
    if (intensity <= 0) return [];
    return sparkShapes(ctx.at, ctx.t, {
      count: Math.max(1, Math.round(16 * intensity)), life: 0.55 / speed, speed: ctx.height * 1.6 * speed * size, dir: num(p.direction, -90), spread: num(p.spread, 140),
      width: Math.max(1, ctx.height * 0.008 * size), color: str(p.color, "#ffd84d"), core: str(p.color2, "#ffffff"), seed: num(p.seed, 1), burst: p.burst === true,
      groundY: ctx.groundY, gravity: ctx.height * 7 * speed * speed,
    });
  },
};

export const RECIPES: EffectRecipe[] = [lightning, sparks];
