// BACKGROUND recipes (SPEC-0017 Phase 2C): sky, sun, clouds, ground, hills, trees, grass, spikes, pit, water, and the
// MOVING BACKGROUNDS rain and waterfall (plus wind for trees and grass). Registered in index.ts. Each piece is a
// RECIPE with knobs (colors, x, y, w, h, count, size, speed, wind, seed) — never a drawn picture — so the engine can
// mix new backgrounds nobody described. `t` = scene seconds: moving parts (clouds, swaying trees, rain, falling
// water, waves, twinkling stars) move with it, and the same `t` always gives the same shapes.
// Positions are stage px; `size` is x the figure's height (like every effect knob).
import { PLACED_SYMBOLS, spikeBody } from "../symbolMaker.ts";
import { clamp, lerp, mixColor, rand, wobble } from "./random.ts";
import { wavyOutline } from "./smoke.ts";
import type { BackgroundPiece, BackgroundRecipe, Point, Shape } from "./types.ts";

type Stage = { width: number; groundY: number; height: number };
type Params = NonNullable<BackgroundPiece["params"]>;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const seedOf = (p: Params, own: number) => num(p.seed, 1) * 7.31 + own;
// Wrap v into [lo, lo + span).
const wrap = (v: number, lo: number, span: number) => lo + ((((v - lo) % span) + span) % span);
// The page is the 16:9 stage (1920 x 1080, y down from its top edge; the ground line is usually at 900).
const pageBottom = (s: Stage) => Math.max((s.width * 9) / 16, s.groundY + 60);
const flat = (ps: Point[]) => ps.flatMap((p) => [p.x, p.y]);

// How far the sky and ground reach past the page edges (stage px).
const BLEED = 1200;
// BACKGROUNDS FILL THE PAGE (Arthur, 2026-10-06: "Backgrounds should always fill up the canvas, not cut off like
// that"): every scenery BAND (sky, hills, ground, water, grass, rain) covers the whole page and reaches past both its
// edges when no `x`/`w` is given — on any page shape, when the app slides the scene (centering, camera) or zooms it
// out — with the same shape inside the page as before. A side given by `x` or `w` stays exactly where it was put.
// (The page is 0..width, or width wide around the stage middle 960: both are covered.)
const STAGE_MIDDLE = 960;
const WEATHER_BLEED = 340; // rain and grass: enough past the edges for any slide, fewer shapes than BLEED
const bandEnds = (s: Stage, bleed: number) => ({ left: Math.min(0, STAGE_MIDDLE - s.width / 2) - bleed, right: Math.max(s.width, STAGE_MIDDLE + s.width / 2) + bleed });
// How many extra samples of `step` reach the band's ends past x0 … x0 + w (0 on a side that was given).
const bleedSteps = (p: Params, s: Stage, x0: number, w: number, step: number) => {
  const ends = bandEnds(s, BLEED);
  return { before: p.x === undefined ? Math.ceil(Math.max(0, x0 - ends.left) / step) : 0, after: p.w === undefined ? Math.ceil(Math.max(0, ends.right - (x0 + w)) / step) : 0 };
};

// SKY: a gradient (top → horizon). `time` day / sunset / night / overcast / storm (or color/color2), stars at night
// (`stars`).
const SKIES: Record<string, [string, string]> = { day: ["#5fb4f0", "#d4eefc"], sunset: ["#5b4b8a", "#ffb36b"], night: ["#0b1030", "#2b3a78"], overcast: ["#8693a2", "#c9d1da"], storm: ["#3b4451", "#7f8b98"] };
function sky(p: Params, t: number, s: Stage): Shape[] {
  const time = str(p.time, "day");
  const [c1, c2] = SKIES[time] ?? SKIES.day;
  const y = num(p.y, 0), h = num(p.h, s.groundY + 4 - y);
  // (BLEED: past every page edge — the app slides the background with the centered animation, and the page
  // must never show an empty strip: a solid band of the top color above, and wider than the page.)
  const bx = p.x === undefined ? -BLEED : num(p.x, 0), bw = p.w === undefined ? s.width + 2 * BLEED : num(p.w, s.width);
  const out: Shape[] = [{ kind: "rect", x: bx, y, w: bw, h, fill: str(p.color, c1), fill2: str(p.color2, c2) }, { kind: "rect", x: bx, y: y - BLEED, w: bw, h: BLEED + 1, fill: str(p.color, c1) }];
  if (p.stars ?? time === "night") {
    const seed = seedOf(p, 11), n = Math.round(num(p.count, 70));
    for (let i = 0; i < n; i += 1) {
      const sx = num(p.x, 0) + rand(seed, i, 1) * num(p.w, s.width), sy = y + Math.pow(rand(seed, i, 2), 1.4) * h * 0.75;
      const r = 1.2 + 2 * rand(seed, i, 3);
      out.push({ kind: "circle", x: sx, y: sy, r, fill: "#fffbe6", alpha: clamp(0.65 + 0.35 * wobble(seed, i, t, 1.5), 0.15, 1), glow: r * 2 });
    }
  }
  return out;
}

// SUN (or MOON with `moon: true`): a round disc with a soft glow that breathes slowly. x/y = centre, `size` = radius.
function sun(p: Params, t: number, s: Stage): Shape[] {
  const moon = p.moon === true;
  const x = num(p.x, s.width * 0.8), y = num(p.y, s.groundY - 620), r = num(p.size, moon ? 0.3 : 0.38) * s.height;
  const color = str(p.color, moon ? "#f4f1de" : "#ffd84a"), glow = str(p.color2, moon ? "#cfd8ff" : "#fff3a8");
  const breathe = 1 + 0.04 * Math.sin(t * 1.3 * num(p.speed, 1));
  const out: Shape[] = [3, 2.2, 1.6].map((k, i) => ({ kind: "circle" as const, x, y, r: r * k * breathe, fill: glow, alpha: 0.1 + 0.08 * i }));
  out.push({ kind: "circle", x, y, r, fill: color, glow: r * 0.6 });
  if (moon) for (const [dx, dy, k] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12]]) out.push({ kind: "circle", x: x + dx * r, y: y + dy * r, r: k * r, fill: mixColor(color, "#9a9a8a", 0.35), alpha: 0.6 });
  return out;
}

// CLOUDS: `count` cartoon clouds (overlapping circles on a flat bottom), drifting at `speed` (1 ≈ 18 px/s,
// negative = leftward) and wrapping round the page. y/h = the band they float in, `size` = cloud width x height.
function clouds(p: Params, t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 23), n = Math.round(num(p.count, 4)), speed = num(p.speed, 1) * 18;
  const top = num(p.y, s.groundY - 760), band = num(p.h, 260), x0 = num(p.x, 0), span = num(p.w, s.width);
  const color = str(p.color, "#ffffff"), shade = str(p.color2, "#dbe7f3");
  const out: Shape[] = [];
  for (let i = 0; i < n; i += 1) {
    const w = num(p.size, 1.2) * s.height * (0.75 + 0.5 * rand(seed, i, 1));
    const cy = top + rand(seed, i, 2) * band;
    // Each cloud has its own pace; it leaves one side and comes back on the other.
    const cx = wrap(x0 + ((i + rand(seed, i, 3) * 0.7) / n) * span + speed * (0.7 + 0.6 * rand(seed, i, 4)) * t, x0 - w, span + 2 * w);
    const puffs: [number, number, number][] = [[-0.32, 0, 0.2], [-0.1, -0.12, 0.28], [0.15, -0.08, 0.24], [0.34, 0.02, 0.18]];
    for (const [layer, dy] of [[shade, 0.05 * w], [color, 0]] as const) {
      out.push({ kind: "rect", x: cx - 0.42 * w, y: cy + dy - 0.02 * w, w: 0.84 * w, h: 0.17 * w, fill: layer });
      puffs.forEach(([dx, py, r], k) => out.push({ kind: "circle", x: cx + dx * w, y: cy + dy + py * w - 0.02 * w, r: r * w * (0.9 + 0.2 * rand(seed, i, 10 + k)), fill: layer }));
    }
  }
  return out;
}

// GROUND: a grass band from the ground line down (`h` deep), with a light top edge.
function ground(p: Params, _t: number, s: Stage): Shape[] {
  const y = num(p.y, s.groundY), x = p.x === undefined ? -BLEED : num(p.x, 0), w = p.w === undefined ? s.width + 2 * BLEED : num(p.w, s.width), h = num(p.h, pageBottom(s) - y);
  const color = str(p.color, "#5cb85c"), deep = str(p.color2, mixColor(color, "#2d4a1e", 0.55));
  return [
    { kind: "rect", x, y, w, h, fill: color, fill2: deep },
    ...(p.h === undefined ? [{ kind: "rect" as const, x, y: y + h - 1, w, h: BLEED, fill: deep }] : []),
    { kind: "rect", x, y, w, h: 9, fill: mixColor(color, "#ffffff", 0.35) },
  ];
}

// HILLS: rolling hills behind, two layers (far = lighter and taller, near = `color`). `h` = how high they rise,
// `count` = bumps across the page. They stand still, and roll on past both page edges (BACKGROUNDS FILL THE PAGE).
function hills(p: Params, _t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 37), base = num(p.y, s.groundY) + 2, x0 = num(p.x, 0), w = num(p.w, s.width), h = num(p.h, 1.7 * s.height);
  const color = str(p.color, "#79c26f"), far = str(p.color2, mixColor(color, "#e8f6ff", 0.45)), bumps = num(p.count, 3);
  const more = bleedSteps(p, s, x0, w, w / 64);
  const layer = (k: number, height: number, fill: string): Shape => {
    const pts: Point[] = [{ x: x0 - (more.before * w) / 64, y: base }];
    const ph1 = 6.283 * rand(seed, k, 1), ph2 = 6.283 * rand(seed, k, 2), b = bumps * (k === 0 ? 0.8 : 1.2);
    for (let i = -more.before; i <= 64 + more.after; i += 1) {
      const u = i / 64, a = u * b * 6.283;
      const v = 0.55 + 0.3 * Math.sin(a + ph1) + 0.15 * Math.sin(2.3 * a + ph2);
      pts.push({ x: x0 + u * w, y: base - height * clamp(v, 0.08, 1) });
    }
    pts.push({ x: x0 + w + (more.after * w) / 64, y: base });
    return { kind: "poly", points: flat(pts), fill };
  };
  return [layer(0, h, far), layer(1, h * 0.6, color)];
}

// TREES: `count` trees (a trunk plus round or pine leaves; `shape` round / pine / mixed) that sway a little
// (`speed`, `sway`). Spread over x ± w/2 (default: across the page), standing on the ground line.
// In the WIND (`wind`, see below) they BEND: the foot never moves and a point moves more the higher it is (more than
// in step with its height), leaning downwind, swaying, bending further in each gust as it passes; the leaf clumps
// rustle on their own (more at the top) and now and then a leaf blows off (`leaves` per tree, 0 = none).
function trees(p: Params, t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 41), n = Math.round(num(p.count, 3)), base = num(p.y, s.groundY) + 2;
  const span = num(p.w, s.width * 0.9), cx = num(p.x, s.width / 2), shape = str(p.shape, "mixed");
  const leaves = str(p.color, "#3f9b4a"), trunk = str(p.color2, "#7a4a24"), sway = num(p.sway, 1), speed = num(p.speed, 1);
  const wind = num(p.wind, 0);
  const out: Shape[] = [], blown: Shape[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = cx - span / 2 + ((i + 0.5 + (rand(seed, i, 1) - 0.5) * 0.6) / n) * span;
    const H = num(p.size, 1.5) * s.height * (0.8 + 0.4 * rand(seed, i, 2));
    const pine = shape === "pine" || (shape === "mixed" && rand(seed, i, 3) < 0.45);
    if (wind) { windyTree(out, blown, p, { seed, i, x, base, H, pine, leaves, trunk, sway, speed, wind }, t, s); continue; }
    const dx = sway * 0.035 * H * wobble(seed, i, t, 0.9 * speed); // the top moves, the foot stays
    const lean = (y: number) => x + dx * ((base - y) / H); // how far a point at height y has swayed
    const tw = 0.08 * H, th = pine ? 0.3 * H : 0.5 * H;
    out.push({ kind: "poly", points: [x - tw / 2, base, x + tw / 2, base, lean(base - th) + tw * 0.35, base - th, lean(base - th) - tw * 0.35, base - th], fill: trunk });
    const shade = mixColor(leaves, "#000000", 0.18), light = mixColor(leaves, "#ffffff", 0.18);
    if (pine) {
      for (let k = 0; k < 3; k += 1) {
        const yb = base - th + 0.05 * H - k * 0.2 * H, half = (0.3 - 0.06 * k) * H, tip = yb - 0.36 * H;
        out.push({ kind: "poly", points: [lean(yb) - half, yb, lean(yb) + half, yb, lean(tip), tip], fill: k === 0 ? shade : leaves });
      }
    } else {
      const cy = base - 0.68 * H, r = 0.22 * H, cx2 = lean(cy);
      for (const [ox, oy, k, c] of [[-0.6, 0.25, 0.8, shade], [0.6, 0.25, 0.8, shade], [0, 0, 1.05, leaves], [-0.35, -0.45, 0.75, leaves], [0.4, -0.35, 0.7, light]] as const)
        out.push({ kind: "circle", x: cx2 + ox * r, y: cy + oy * r, r: k * r, fill: c });
    }
  }
  return [...out, ...blown];
}

// ---- MOVING BACKGROUNDS (SPEC-0017 Phase 2C extras, 2026-10-06) ------------------------------------------------
// Arthur: "teach the engine how to animate backgrounds — rain, trees moving in the wind, a waterfall". WIND is one
// knob shared by rain, trees and grass: `wind` −1..1 (+ blows to the right, − to the left; the size = how strong).
// Motion is SMOOTH: every position is a smooth function of t (seeded waves and gusts), so each picture follows
// from the one before at any frame rate. What keeps its look and only moves (a raindrop, a blown leaf) is a
// Library symbol (STILL THINGS ARE SYMBOLS); what changes shape (bending trees, grass, splashes, falling water,
// foam, mist) is drawn — a few layered flat colors with wavy outlines that change every picture.

// GUSTS: how hard the wind blows at time t at stage x: 0 (a lull) .. about 1 (a strong gust). Smooth seeded bumps
// every few seconds that TRAVEL downwind across the page (a tree downwind bends a moment after one upwind).
const GUST_TRAVEL = 650; // stage px a gust travels per second
const windSeed = (p: Params) => num(p.seed, 1) * 7.31 + 500; // one scene → the same gusts for every piece
export function gustAt(seed: number, t: number, x = 0, wind = 1): number {
  const tt = t - (wind >= 0 ? x : -x) / GUST_TRAVEL, period = 3.4, k0 = Math.floor(tt / period);
  let g = 0;
  for (let k = k0 - 1; k <= k0 + 1; k += 1) {
    const centre = (k + 0.5 + 0.5 * (rand(seed, k, 61) - 0.5)) * period, half = period * (0.32 + 0.18 * rand(seed, k, 62));
    const u = (tt - centre) / half;
    if (Math.abs(u) < 1) g += (0.45 + 0.55 * rand(seed, k, 63)) * 0.5 * (1 + Math.cos(Math.PI * u));
  }
  return Math.min(1.2, g);
}

// A tree in the WIND (trees with `wind`): it bends from the foot — how far a point moves = the top's shift x (its
// height / the tree's height)^1.6, so the foot never moves and the crown moves most — and its leaf clumps rustle.
type WindyTree = { seed: number; i: number; x: number; base: number; H: number; pine: boolean; leaves: string; trunk: string; sway: number; speed: number; wind: number };
const CLUMPS = [[-0.6, 0.25, 0.8, 0], [0.6, 0.25, 0.8, 0], [0, 0, 1.05, 1], [-0.35, -0.45, 0.75, 1], [0.4, -0.35, 0.7, 2]] as const;
function windyTree(out: Shape[], blown: Shape[], p: Params, tr: WindyTree, t: number, s: Stage) {
  const { seed, i, x, base, H, pine, wind, speed } = tr;
  // How far the top is pushed at time `at`: a lean downwind, a sway, and more in each gust.
  const topShift = (at: number) => H * (tr.sway * 0.035 * wobble(seed, i, at, 0.9 * speed)
    + wind * (0.1 + 0.12 * gustAt(windSeed(p), at, x, wind) + 0.03 * wobble(seed, i + 50, at, 1.3 * speed)));
  const D = topShift(t);
  const bend = (y: number, d = D) => x + d * clamp((base - y) / H, 0, 1.2) ** 1.6;
  const rustle = (k: number, y: number) => Math.abs(wind) * 0.012 * H * wobble(seed, i * 17 + k, t, 2.4 * speed) * clamp((base - y) / H, 0, 1);
  const tw = 0.08 * H, th = pine ? 0.3 * H : 0.5 * H;
  // The trunk: a tapering bent band; its two foot corners never move.
  const left: number[] = [], right: number[] = [];
  for (let j = 0; j <= 4; j += 1) {
    const y = base - (j / 4) * th, half = (tw / 2) * (1 - 0.3 * (j / 4));
    left.push(bend(y) - half, y);
    right.unshift(bend(y) + half, y);
  }
  out.push({ kind: "poly", points: [...left, ...right], fill: tr.trunk });
  const shade = mixColor(tr.leaves, "#000000", 0.18), light = mixColor(tr.leaves, "#ffffff", 0.18), fills = [shade, tr.leaves, light];
  let crown: Point;
  if (pine) {
    for (let k = 0; k < 3; k += 1) {
      const yb = base - th + 0.05 * H - k * 0.2 * H, half = (0.3 - 0.06 * k) * H, tip = yb - 0.36 * H;
      out.push({ kind: "poly", points: [bend(yb) - half, yb, bend(yb) + half, yb, bend(tip) + rustle(k, tip), tip], fill: k === 0 ? shade : tr.leaves });
    }
    crown = { x: 0, y: base - th - 0.25 * H };
  } else {
    const cy = base - 0.68 * H, r = 0.22 * H;
    CLUMPS.forEach(([ox, oy, k, c], j) => {
      const y = cy + oy * r;
      out.push({ kind: "circle", x: bend(y) + ox * r + rustle(j, y), y: y + 0.3 * rustle(j + 9, y), r: k * r * (1 + 0.02 * wobble(seed, i * 5 + j, t, 1.7 * speed)), fill: fills[c] });
    });
    crown = { x: 0, y: cy - 0.2 * r };
  }
  // Now and then a leaf blows off the downwind side of the crown.
  const slots = Math.max(0, Math.round(num(p.leaves, 1)));
  const dir = wind > 0 ? 1 : -1, reach = (pine ? 0.18 : 0.2) * H;
  if (slots) blown.push(...blownLeaves(seed + i * 11, slots, wind, H, s, t, (at, r) => ({ x: bend(crown.y, topShift(at)) + dir * reach * (0.4 + 0.6 * r), y: crown.y + (r - 0.5) * 0.25 * H }), mixColor(tr.leaves, "#ffffff", 0.08), shade));
}

// A LEAF BLOWS OFF now and then: the "Leaf" Library symbol (it keeps its look and only moves) leaves the crown,
// is carried off downwind, flutters, tumbles and sinks; one that reaches the ground skids along it, off the page.
const LEAF_SIZE = PLACED_SYMBOLS.Leaf?.size ?? 40;
function blownLeaves(seed: number, slots: number, wind: number, H: number, s: Stage, t: number, from: (at: number, r: number) => Point, color: string, color2: string): Shape[] {
  const out: Shape[] = [], dir = wind > 0 ? 1 : -1, strength = clamp(Math.abs(wind), 0.25, 1.5), ground = s.groundY - 0.01 * H, LIFE = 8;
  for (let j = 0; j < slots; j += 1) {
    const every = (3.2 + 2.4 * rand(seed, j, 81)) / strength;
    for (let n = Math.floor((t - LIFE) / every) - 1; n <= Math.floor(t / every); n += 1) {
      const born = (n + 0.8 * rand(seed, j * 131 + n, 82)) * every, a = t - born;
      if (a < 0 || a > LIFE) continue;
      const r = (k: number) => rand(seed, j * 131 + n, k);
      const p0 = from(born, r(80));
      const vx = dir * strength * H * (0.8 + 0.5 * r(83)), sink = H * (0.16 + 0.08 * r(84)), ph = 6.283 * r(85);
      const landAt = Math.max(0, (ground - p0.y) / sink), air = Math.min(a, landAt);
      // (the flutter starts gently and dies away as the leaf comes down onto the ground)
      const flutter = Math.min(1, air * 2) * clamp((ground - (p0.y + sink * air)) / (0.08 * H), 0, 1);
      const x = p0.x + vx * air + 0.05 * H * Math.sin(1.9 * air + ph) * flutter + 0.35 * vx * Math.max(0, a - landAt);
      const y = p0.y + sink * air + 0.05 * H * Math.sin(2.7 * air + 2 * ph) * flutter;
      if (x < -200 || x > s.width + 200) continue;
      const spin = (r(86) < 0.5 ? -1 : 1) * (200 + 160 * r(87));
      out.push({ kind: "symbol", name: "Leaf", x, y, scale: (0.055 * H) / LEAF_SIZE, rotation: spin * air + 30 * Math.sin(2.2 * air + ph) + 0.25 * spin * Math.max(0, a - landAt), color, color2 });
    }
  }
  return out;
}

// GRASS: `count` tufts along the ground line (spread over x ± w/2, default across the page), each a few pointed
// blades drawn as one shape (two greens, `color` and `color2`); `size` = tuft height x figure height. Still unless
// there is `wind`: then every blade bends downwind — the tip the most, the root never — sways, and bends further
// as each gust passes over it.
function grass(p: Params, t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 71), n = Math.max(1, Math.round(num(p.count, 16))), base = num(p.y, s.groundY);
  const span = num(p.w, s.width * 1.04), x0 = num(p.x, s.width / 2) - span / 2, tall = num(p.size, 0.11) * s.height;
  const color = str(p.color, "#3d8a37"), color2 = str(p.color2, mixColor(color, "#ffffff", 0.2)), wind = num(p.wind, 0), speed = num(p.speed, 1);
  // Across the page (no `w`): more tufts, just as far apart, on past both edges (BACKGROUNDS FILL THE PAGE).
  const ends = bandEnds(s, WEATHER_BLEED), gap = span / n;
  const first = p.w === undefined ? -1 - Math.ceil(Math.max(0, x0 - ends.left) / gap) : 0, last = p.w === undefined ? n + Math.ceil(Math.max(0, ends.right - x0 - span) / gap) : n - 1;
  const out: Shape[] = [];
  for (let i = first; i <= last; i += 1) {
    const x = x0 + ((i + 0.5 + (rand(seed, i, 1) - 0.5) * 0.8) / n) * span, y = base + 2 + rand(seed, i, 2) * 0.03 * s.height;
    const h = tall * (0.7 + 0.6 * rand(seed, i, 3)), blades = 3 + Math.floor(rand(seed, i, 4) * 3), wide = h * (0.55 + 0.35 * rand(seed, i, 5));
    // How far the tip leans, x the tuft's height.
    const lean = wind ? wind * (0.22 + 0.3 * gustAt(windSeed(p), t, x, wind)) + Math.abs(wind) * 0.09 * wobble(seed, i, t, 2.2 * speed) : 0;
    const bent = (bx: number, up: number) => bx + lean * h * (up / h) ** 2;
    const pts: number[] = [x - wide / 2, y];
    for (let b = 0; b < blades; b += 1) {
      const u = (b + 0.5) / blades, up = h * (0.65 + 0.35 * rand(seed, i * 7 + b, 6)) * (1 - 0.35 * Math.abs(u - 0.5));
      pts.push(bent(x - wide / 2 + u * wide + (u - 0.5) * wide * 0.9, up), y - up); // a blade's tip (the outer ones splay out)
      if (b < blades - 1) pts.push(bent(x - wide / 2 + ((b + 1) / blades) * wide, 0.28 * h), y - 0.28 * h); // between two blades
    }
    pts.push(x + wide / 2, y);
    out.push({ kind: "poly", points: pts, fill: i % 2 ? color : color2 });
  }
  return out;
}

// RAIN: slanted streaks falling from `y` (default: above the page) to the ground — each one the "Raindrop" Library
// symbol (a drop keeps its look and only moves), turned to its slant. `intensity` 0.2 drizzle … 1 storm (how many,
// how long and how fast), `wind` slants them (gusts a little more), `size` = streak length x figure height,
// `speed`. Where a drop hits the ground (across x … x + w, default the whole page and past it) a little SPLASH is drawn: a crown of
// water that jumps up and drops back, and a flat ring that spreads and fades. A darker sky is the sky piece's job
// (`time: "storm"` or "overcast").
const RAINDROP_SIZE = PLACED_SYMBOLS.Raindrop?.size ?? 100;
const SPLASH = 0.26; // seconds a splash lasts
function rain(p: Params, t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 83), H = s.height, I = clamp(num(p.intensity, 0.6), 0.05, 1.5), wind = clamp(num(p.wind, 0.25), -1.5, 1.5);
  const top = num(p.y, s.groundY - 0.5 * H - 660), speed = num(p.speed, 1), ends = bandEnds(s, WEATHER_BLEED);
  // Where drops land: x … x + w, or (without them) the whole page and on past its edges (BACKGROUNDS FILL THE PAGE).
  const x0 = p.x === undefined ? ends.left : num(p.x, 0), w = (p.w === undefined ? ends.right : x0 + num(p.w, s.width)) - x0;
  const color = str(p.color, "#bcd2e8"), color2 = str(p.color2, "#e6f0fa");
  const L = num(p.size, 0.13 + 0.12 * Math.min(1, I)) * H, fall = (2 + I) * H * Math.max(0.1, speed);
  const deepest = s.groundY + 0.1 * H, slantMost = Math.atan(Math.abs(wind) * 0.75);
  // Drops land past the downwind edge too, or the top corner on that side would be empty.
  const reach = (deepest - top) * Math.tan(slantMost), spanAll = w + reach, from = wind >= 0 ? x0 : x0 - reach;
  const n = Math.max(1, Math.round(num(p.count, (8 + 40 * Math.min(I, 1.2)) * (spanAll / Math.max(1, s.width))))); // (as thick on any page)
  const drops: Shape[] = [], splashes: Shape[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = fall * (0.9 + 0.2 * rand(seed, i, 1)), cycle = (deepest - top) / v + SPLASH + 0.15 * rand(seed, i, 2);
    const age = t + rand(seed, i, 3) * cycle, life = Math.floor(age / cycle), a = age - life * cycle;
    const r = (k: number) => rand(seed, i * 977 + life, k);
    // Each drop falls in a straight line, slanted by the wind when it started (so gusts slant some more).
    const slant = Math.atan(wind * (0.45 + 0.3 * gustAt(windSeed(p), t - a, x0 + w / 2, wind)));
    const land = s.groundY + r(4) * 0.1 * H, xLand = from + r(5) * spanAll, falling = (land - top) / v;
    if (a < falling) {
      const hx = xLand - (land - top - v * a) * Math.tan(slant), hy = top + v * a; // its head
      drops.push({ kind: "symbol", name: "Raindrop", x: hx - (L / 2) * Math.sin(slant), y: hy - (L / 2) * Math.cos(slant), scale: L / RAINDROP_SIZE, rotation: (-slant * 180) / Math.PI, color, color2 });
    } else if (a < falling + SPLASH && xLand >= x0 && xLand <= x0 + w) {
      splashes.push(...splash(xLand, land, (a - falling) / SPLASH, H, color2, r(6)));
    }
  }
  return [...splashes, ...drops];
}

// A SPLASH where a drop hits the ground (u = 0 → 1 through it): a crown of water that jumps up and drops back, and
// a flat ring that spreads and fades.
function splash(x: number, y: number, u: number, H: number, color: string, r: number): Shape[] {
  const ring = (0.025 + 0.06 * u) * H * (0.85 + 0.3 * r), ringPts: number[] = [];
  for (let j = 0; j <= 12; j += 1) { const a = (j / 12) * 2 * Math.PI; ringPts.push(x + Math.cos(a) * ring, y + Math.sin(a) * ring * 0.28); }
  const out: Shape[] = [{ kind: "line", points: ringPts, stroke: color, width: Math.max(1.5, 0.008 * H), alpha: 0.85 * (1 - u) }];
  if (u < 0.75) {
    const up = 0.075 * H * Math.sin((Math.PI * u) / 0.75) * (0.8 + 0.4 * r), b = 0.016 * H, o = 0.03 * H * u + 0.006 * H;
    out.push({ kind: "poly", points: [x - b, y, x - b - o, y - up, x - 0.35 * b, y - 0.35 * up, x + (r - 0.5) * b, y - 0.8 * up, x + 0.35 * b, y - 0.35 * up, x + b + o, y - up * (0.85 + 0.3 * r), x + b, y], fill: color, alpha: 0.9 });
  }
  return out;
}

// WATERFALL: water pours over a cliff edge and falls into a pool on the ground. `x` = the middle of the falling
// water, `w` its width, `y` the lip it pours over (default 1.7 figure heights up); the cliff (`rock` color) stands
// behind and runs off the page on `side` "right" (default) or "left". The falling water is a sheet with wavy edges
// and lighter and darker BANDS that keep moving down (faster as they fall); at the bottom FOAM churns (wavy white
// blobs) and MIST rises and fades (wavy, like smoke — never round cloud puffs); RIPPLES spread across the pool
// (`pool` = its half-width x w). `speed` = how fast it pours, `color` water, `color2` foam.
function waterfall(p: Params, t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 97), H = s.height, x = num(p.x, s.width * 0.7), w = num(p.w, 0.55 * H), lip = num(p.y, s.groundY - 1.7 * H);
  const ground = s.groundY, drop = Math.max(10, ground - lip), speed = num(p.speed, 1), dir = str(p.side, "right") === "left" ? -1 : 1;
  const color = str(p.color, "#4ea8de"), foam = str(p.color2, "#f4fbff"), rock = str(p.rock, "#7d7064");
  const deep = mixColor(color, "#0b2545", 0.3), out: Shape[] = [];
  // THE CLIFF (still): a rough rock face with a notch the water pours through, a shadowed edge, two ledges and
  // grass along its top. It runs off the page on its side.
  const near = x - dir * (w / 2 + 0.3 * H), far = dir > 0 ? Math.max(x + w / 2 + 1.5 * H, bandEnds(s, BLEED / 2).right) : Math.min(x - w / 2 - 1.5 * H, bandEnds(s, BLEED / 2).left);
  const top = lip - 0.06 * H, jag = (k: number) => (rand(seed, k, 1) - 0.5) * 0.06 * H;
  const face: Point[] = [{ x: near - dir * 0.25 * H, y: ground }];
  for (let k = 1; k <= 4; k += 1) face.push({ x: near - dir * 0.25 * H * (1 - k / 4) + jag(k), y: ground - (k / 4) * (ground - top) });
  face.push({ x: x - dir * (w / 2 + 0.04 * H), y: top + jag(5) * 0.5 }, { x: x - dir * w * 0.45, y: lip + 0.01 * H }, { x: x + dir * w * 0.45, y: lip + 0.01 * H }, { x: x + dir * (w / 2 + 0.04 * H), y: top + jag(6) * 0.5 });
  for (let k = 1; k <= 3; k += 1) face.push({ x: x + dir * (w / 2 + (k / 3) * (Math.abs(far - x) - w / 2)), y: top + jag(6 + k) });
  face.push({ x: far, y: ground });
  out.push({ kind: "poly", points: flat(face), fill: rock });
  out.push({ kind: "poly", points: flat([face[0], face[1], face[2], face[3], face[4], { x: face[4].x + dir * 0.12 * H, y: face[4].y + 0.05 * H }, { x: face[0].x + dir * 0.2 * H, y: ground }]), fill: mixColor(rock, "#000000", 0.25) });
  for (const [k, f] of [[0, 0.38], [1, 0.68]] as const) {
    const y = top + f * (ground - top), a = x + dir * (w / 2 + 0.1 * H), b = x + dir * (w / 2 + 0.1 * H + (0.7 + 0.4 * rand(seed, k, 3)) * H);
    out.push({ kind: "poly", points: [a, y, b, y + jag(20 + k), b - dir * 0.08 * H, y + 0.035 * H, a + dir * 0.05 * H, y + 0.03 * H], fill: mixColor(rock, "#ffffff", 0.18) });
  }
  out.push({ kind: "poly", points: flat([...face.slice(4, -1).map((q) => ({ x: q.x, y: q.y - 0.012 * H })), ...face.slice(4, -1).reverse().map((q) => ({ x: q.x, y: q.y + 0.04 * H }))].filter((q) => Math.abs(q.x - x) > w * 0.46)), fill: "#4f9a45" });
  // THE POOL (still) on the ground, and RIPPLES spreading out across it from where the water lands.
  const prx = num(p.pool, 1.7) * w, pry = 0.1 * H, py = ground + 0.05 * H;
  const ellipse = (rx: number, ry: number, n = 16) => Array.from({ length: n + 1 }, (_, j) => [x + Math.cos((j / n) * 2 * Math.PI) * rx, py + Math.sin((j / n) * 2 * Math.PI) * ry]).flat();
  out.push({ kind: "poly", points: ellipse(prx, pry), fill: mixColor(color, "#0b2545", 0.15) });
  for (let k = 0; k < 3; k += 1) {
    const u = (t * 0.45 * speed + k / 3) % 1, rx = lerp(0.6 * w, 0.95 * prx, u);
    out.push({ kind: "line", points: ellipse(rx, rx * (pry / prx), 14), stroke: mixColor(color, "#ffffff", 0.55), width: Math.max(1.5, 0.01 * H), alpha: 0.75 * (1 - u) });
  }
  // THE FALLING WATER: a darker back sheet and the front sheet, their edges waving down the fall.
  const edge = (side: number, y: number, k: number) => {
    const f = (y - lip) / drop;
    return x + side * (w / 2) * (1 + 0.12 * f) * k + 0.025 * H * (0.3 + f) * Math.sin(((y - lip) / (0.35 * H)) * 6.283 - t * 5 * speed + side * 1.7 + 6.283 * rand(seed, side + 2, 1));
  };
  const ys = Array.from({ length: 9 }, (_, j) => lip + (j / 8) * drop);
  for (const [k, fill] of [[1.08, deep], [0.94, color]] as const) out.push({ kind: "poly", points: [...ys.flatMap((y) => [edge(-1, y, k), y]), ...[...ys].reverse().flatMap((y) => [edge(1, y, k), y])], fill });
  // BANDS of lighter and darker water moving down, speeding up as they fall (they stretch).
  const BANDS = 7;
  for (let b = 0; b < BANDS; b += 1) {
    const across = 0.1 + 0.8 * ((b + 0.6 * rand(seed, b, 4)) / BANDS), len = 0.3 + 0.25 * rand(seed, b, 5), dark = b % 3 === 1;
    const s1 = (((t * speed * (0.6 + 0.15 * rand(seed, b, 6)) + (b + 0.4 * rand(seed, b, 7)) / BANDS * 2.3) % 1) + 1) % 1 * (1 + len), s0 = s1 - len;
    const f0 = clamp(s0, 0, 1) ** 1.5, f1 = clamp(s1, 0, 1) ** 1.5;
    if (f1 - f0 < 0.02) continue;
    const bw = w * (dark ? 0.1 : 0.06 + 0.06 * rand(seed, b, 8)), sideA: number[] = [], sideB: number[] = [];
    for (let j = 0; j <= 4; j += 1) {
      const f = lerp(f0, f1, j / 4), y = lip + f * drop, xl = edge(-1, y, 0.94), xr = edge(1, y, 0.94), mid = xl + across * (xr - xl), half = (bw / 2) * Math.min(1, 0.25 + j / 2) * (1 + 0.6 * f);
      sideA.push(mid - half, y);
      sideB.unshift(mid + half, y);
    }
    out.push({ kind: "poly", points: [...sideA, ...sideB], fill: dark ? mixColor(color, "#0b2545", 0.22) : mixColor(color, "#ffffff", 0.6), alpha: 0.9 });
  }
  // THE LIP: the water rolling over the edge, a light curve that ripples a little.
  out.push({ kind: "line", points: Array.from({ length: 7 }, (_, j) => [x - w / 2 + (j / 6) * w, lip + 0.012 * H - 0.025 * H * Math.sin((Math.PI * j) / 6) + 0.006 * H * wobble(seed, j, t, 3 * speed)]).flat(), stroke: mixColor(color, "#ffffff", 0.6), width: Math.max(2, 0.025 * H) });
  // FOAM churning where it lands: wavy blobs (a light blue-gray layer under a white one), never round puffs.
  for (const [layer, fill, k] of [[0, mixColor(foam, color, 0.35), 1.15], [1, foam, 0.85]] as const) {
    for (let b = 0; b < 4; b += 1) {
      const R = 0.1 * H * k * (b === 1 || b === 2 ? 1.2 : 0.9) * (1 + 0.12 * wobble(seed, 50 + b + 4 * layer, t, 2.2 * speed));
      const bx = x + (b - 1.5) * w * 0.42 + 0.025 * H * wobble(seed, 40 + b + 4 * layer, t, 1.5 * speed), by = ground - 0.015 * H + 0.015 * H * wobble(seed, 60 + b, t, 1.8 * speed);
      out.push({ kind: "poly", points: wavyOutline(bx, by, R, R * 0.75, 0, seed + 70 + 13 * b + 31 * layer, t * 1.6 * speed, 1).map((v, j) => (j % 2 ? Math.min(v, ground + 0.04 * H) : v)), fill });
    }
  }
  // MIST rising off the foam: pale wavy wisps (smoke.ts wavyOutline, a trailing tail) that drift out to the sides,
  // grow and fade low down — like smoke, never round cloud puffs.
  for (let m = 0; m < 3; m += 1) {
    const life = 2.2, a0 = t * speed + (m / 3 + 0.2 * rand(seed, m, 11)) * life, k = Math.floor(a0 / life), u = a0 / life - k;
    const r = (q: number) => rand(seed, m * 53 + k, q), R = (0.08 + 0.1 * u) * H, side = r(2) < 0.5 ? -1 : 1;
    const mx = x + side * (w * (0.2 + 0.25 * r(1)) + 0.25 * H * u), my = ground - 0.08 * H - u * 0.35 * H;
    out.push({ kind: "poly", points: wavyOutline(mx, my, R * 1.3, R * 0.65, side > 0 ? -0.35 : Math.PI + 0.35, seed + 90 + m * 7 + k, t * speed, 0.8, 0.5, 0.3), fill: "#ffffff", alpha: 0.4 * Math.sin(Math.PI * u) });
  }
  return out;
}

// SPIKES: a row of `count` sharp triangles centred on `x`, standing ON the ground (things to jump over). `size` =
// a spike's height x the figure's height; each is 0.8 as wide as it is tall.
export function spikeRow(p: Params, s: Stage) {
  const n = Math.max(1, Math.round(num(p.count, 3))), tall = num(p.size, 0.2) * s.height, wide = tall * 0.8;
  const base = num(p.y, s.groundY), left = num(p.x, s.width / 2) - (n * wide) / 2;
  const tips: Point[] = Array.from({ length: n }, (_, i) => ({ x: left + (i + 0.5) * wide, y: base - tall }));
  return { left, right: left + n * wide, base, tall, wide, tips };
}
// STILL THINGS ARE SYMBOLS: every spike is the "Spike" Library symbol (symbolMaker.ts onespike: the spike on its
// strip of base), placed once per spike, so more can be added by hand later; side by side the strips make the base.
function spikes(p: Params, _t: number, s: Stage): Shape[] {
  const row = spikeRow(p, s);
  const color = str(p.color, "#a7b0bb"), edge = str(p.color2, "#4b5563");
  const k = row.tall / spikeBody(PLACED_SYMBOLS.Spike.size).height; // the made spike's body → this row's size
  return row.tips.map((tip) => ({ kind: "symbol", name: "Spike", x: tip.x, y: row.base - row.tall / 2, scale: k, color, color2: edge }));
}

// PIT: a gap in the ground centred on `x`, `w` wide and `h` deep: dark, cut into the ground band (put it after
// "ground"), with dirt walls.
function pit(p: Params, _t: number, s: Stage): Shape[] {
  const w = num(p.w, 0.9 * s.height), x = num(p.x, s.width / 2) - w / 2, y = num(p.y, s.groundY), h = num(p.h, pageBottom(s) - y);
  const dark = str(p.color, "#1c1410"), dirt = str(p.color2, "#6b4a2f");
  return [
    { kind: "rect", x, y: y - 1, w, h, fill: mixColor(dark, "#3b2a1e", 0.4), fill2: dark },
    { kind: "rect", x, y: y - 1, w: 7, h, fill: dirt },
    { kind: "rect", x: x + w - 7, y: y - 1, w: 7, h, fill: dirt },
    { kind: "rect", x: x - 3, y: y - 2, w: 6, h: 10, fill: mixColor(dirt, "#ffffff", 0.2) },
    { kind: "rect", x: x + w - 3, y: y - 2, w: 6, h: 10, fill: mixColor(dirt, "#ffffff", 0.2) },
  ];
}

// WATER: a strip (x, y = its surface, w, h) with gentle waves rolling along at `speed`, and drifting ripples. Without
// `x`/`w` it runs on past both page edges (BACKGROUNDS FILL THE PAGE).
function water(p: Params, t: number, s: Stage): Shape[] {
  const seed = seedOf(p, 53), x0 = num(p.x, 0), w = num(p.w, s.width), y = num(p.y, s.groundY), h = num(p.h, 140);
  const color = str(p.color, "#2f8fd8"), deep = str(p.color2, mixColor(color, "#0b2545", 0.55)), speed = num(p.speed, 1);
  const amp = num(p.size, 0.05) * s.height, len = 140, ph = 6.283 * rand(seed, 0, 1);
  const surf = (x: number) => y + amp * Math.sin(((x - x0) / len) * 6.283 - t * 1.6 * speed + ph) + 0.4 * amp * Math.sin(((x - x0) / (len * 0.47)) * 6.283 + t * 1.1 * speed + 2 * ph);
  const N = Math.max(8, Math.round(w / 12)), step = w / N, more = bleedSteps(p, s, x0, w, step);
  const L = x0 - more.before * step, R = x0 + w + more.after * step;
  const top: Point[] = Array.from({ length: N + 1 + more.before + more.after }, (_, j) => { const x = x0 + ((j - more.before) / N) * w; return { x, y: surf(x) }; });
  const out: Shape[] = [
    { kind: "rect", x: L, y: y + amp, w: R - L, h: h - amp, fill: color, fill2: deep },
    { kind: "poly", points: flat([...top, { x: R, y: y + 1.4 * amp + 2 }, { x: L, y: y + 1.4 * amp + 2 }]), fill: color },
    { kind: "line", points: flat(top), stroke: mixColor(color, "#ffffff", 0.55), width: 4 },
  ];
  const n = Math.round(num(p.count, Math.max(3, w / 160)));
  // Ripples drift along in each stretch: the page's own (as always), then the parts past its edges.
  for (const [from, span, k0, count] of [[x0, w, 0, n], [L, x0 - L, 1000, Math.round((n * (x0 - L)) / w)], [x0 + w, R - x0 - w, 2000, Math.round((n * (R - x0 - w)) / w)]]) {
    for (let i = k0; i < k0 + count; i += 1) {
      const rx = wrap(from + rand(seed, i, 2) * span + t * 22 * speed, from, span), ry = lerp(y + 1.4 * amp + 10, y + h - 10, 0.15 + 0.6 * rand(seed, i, 3)), rl = 18 + 30 * rand(seed, i, 4);
      if (rx + rl > from + span) continue;
      out.push({ kind: "line", points: [rx, ry, rx + rl, ry], stroke: mixColor(color, "#ffffff", 0.35), width: 3, alpha: clamp(0.6 + 0.3 * wobble(seed, i, t), 0, 1) });
    }
  }
  return out;
}

const piece = (id: string, about: string, draw: (p: Params, t: number, s: Stage) => Shape[]): BackgroundRecipe => ({ id, about, draw: (pc, t, s) => draw(pc.params ?? {}, t, s) });

export const BACKGROUNDS: BackgroundRecipe[] = [
  piece("sky", "the sky behind everything: a gradient; `time` day / sunset / night / overcast / storm (or `color` top, `color2` horizon); stars at night (`stars`, `count`).", sky),
  piece("sun", "a sun with a soft glow (`moon: true` = a moon); `x`, `y` centre, `size` radius x figure height, `color`, `color2` glow.", sun),
  piece("clouds", "`count` cartoon clouds drifting at `speed` (negative = leftward), wrapping round the page; `y`/`h` = their band, `size` = width x figure height.", clouds),
  piece("ground", "the ground: a grass band below the ground line with a light top edge; `color`, `color2` (deeper down), `h` depth.", ground),
  piece("hills", "rolling hills behind, two layers (far ones lighter); `h` how high, `count` bumps across, `color`, `color2` far layer.", hills),
  piece("trees", "`count` trees (trunk + round or pine leaves, `shape` round/pine/mixed) swaying a little; `x` ± `w`/2, `size` height x figure height. `wind` (-1..1, + blows right) BENDS them: the foot stays planted and the higher a part the more it moves, leaning downwind and swaying more in each gust, the leaf clumps rustle, and now and then a leaf blows off (`leaves` per tree, 0 = none).", trees),
  piece("grass", "`count` tufts of grass along the ground (`x` ± `w`/2, `size` tuft height x figure height, `color`, `color2`); still, or with `wind` every blade bends downwind (tips the most, roots never) and sways as gusts pass over it.", grass),
  piece("rain", "rain falling from above the page to the ground: slanted streaks (each the \"Raindrop\" symbol) and a little splash (a crown and a spreading ring) where each hits the ground; `intensity` 0.2 drizzle .. 1 storm, `wind` slants it (-1..1, gusts slant it more), `size` streak length x figure height, `speed`, `color`, `color2` splashes. Make the sky darker with sky `time: \"storm\"` or \"overcast\".", rain),
  piece("waterfall", "water pouring over a cliff edge into a pool on the ground: a sheet with wavy edges and bands moving down (faster as they fall), churning foam and rising mist at the bottom, ripples spreading in the pool; `x` middle, `w` width, `y` the lip, `side` right/left (where the cliff runs off the page), `rock` cliff color, `pool` its half-width x w, `speed`, `color` water, `color2` foam.", waterfall),
  piece("spikes", "a row of `count` sharp spikes standing on the ground at `x` (things to jump over); `size` = spike height x figure height.", spikes),
  piece("pit", "a dark gap cut into the ground at `x`, `w` wide, `h` deep (put it after ground).", pit),
  piece("water", "a strip of water (`x`, `y` surface, `w`, `h`) with gently rolling waves (`speed`, `size` wave height) and ripples.", water),
];
