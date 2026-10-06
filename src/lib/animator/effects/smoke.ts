// SMOKE recipes (SPEC-0017 Phase 2C): rules, not drawings. SMOKE IS NOT CLOUDS (Arthur, round 3: "actual smoke
// coming from the ground, then fading away when it got to a certain height. It looked like a volcano"): smoke
// keeps coming out of its source as one wavy column, rises, widens and drifts with the wind, and its pieces
// stretch and BREAK APART into wavy wisps that get lighter and more see-through and fade by a certain height.
// DRAWABLE BY HAND (about a minute and a half a picture): roughly 8–30 flat shapes in 3 flat shades (darker low,
// lighter high), each a WAVY, irregular outline that changes a little every picture — never hundreds of circles,
// never a few round cloud puffs (round puffs are only for a blue-sky background).
// Every recipe obeys the knobs (color = young smoke, color2 = old smoke, size, speed, direction, intensity,
// turbulence, spread, seed, wind), so purple or green smoke comes from knobs alone. Stateless and seeded: the same
// moment always gives the same shapes, at any frame rate. Never below the ground.
import { clamp, mixColor, rand, smooth, wobble } from "./random.ts";
import type { EffectContext, EffectParams, EffectRecipe, Point, Shape } from "./types.ts";

const SMOKE = "#6b6b6b";
const SMOKE_OLD = "#cfcfcf";
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

type Knobs = { color: string; color2: string; size: number; speed: number; dir: number; intensity: number; turbulence: number; spread: number; seed: number; wind: number };

function knobs(p: EffectParams, def: { size: number; direction: number; spread: number; wind: number }): Knobs {
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    color: typeof p.color === "string" ? p.color : SMOKE,
    color2: typeof p.color2 === "string" ? p.color2 : SMOKE_OLD,
    size: Math.max(0.005, num(p.size, def.size)),
    speed: clamp(num(p.speed, 1), 0.1, 5),
    dir: num(p.direction, def.direction) * DEG,
    intensity: clamp(num(p.intensity, 1), 0, 3),
    turbulence: clamp(num(p.turbulence, 0.5), 0, 1),
    spread: clamp(num(p.spread, def.spread), 0, 360),
    seed: num(p.seed, 1),
    wind: clamp(num(p.wind, def.wind), -2, 2),
  };
}

// The 3 flat shades, young → old: color (dark), halfway, color2 (light).
const shadesOf = (k: Knobs) => [k.color, mixColor(k.color, k.color2, 0.5), k.color2] as const;

// A WAVY outline, the way a hand draws a bit of smoke: an oval rx × ry turned `ang`, its edge pushed in and out by
// a few uneven bulges and ripples (never a ring of even round bumps: that is a cloud). The bulges drift round with
// time, so the outline is a little different in every picture (but the same moment always gives the same outline).
// `taper` 0..1 pulls the back end (the −x side before turning) into a thinner trailing tail, and `curl` −1..1 bends
// that tail up or down: a wisp curling away.
export function wavyOutline(x: number, y: number, rx: number, ry: number, ang: number, seed: number, t: number, turb: number, taper = 0, curl = 0): number[] {
  const n = clamp(Math.round(22 + 0.3 * Math.max(rx, ry)), 24, 48);
  const amp = 0.6 + 0.6 * turb;
  const waves = [2, 3, 5, 9].map((f, k) => ({
    f: f + Math.floor(rand(seed, k, 31) * 2),
    a: [0.07, 0.11, 0.06, 0.015][k] * amp * (0.7 + 0.6 * rand(seed, k, 35)),
    p: rand(seed, k, 32) * TAU,
    w: (2 + 3 * rand(seed, k, 33)) * (rand(seed, k, 34) < 0.5 ? -1 : 1),
  }));
  const c = Math.cos(ang), s = Math.sin(ang), pts: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const th = (i / n) * TAU;
    let f = 1 + 0.012 * amp * wobble(seed, i, t, 2.2);
    for (const w of waves) f += w.a * Math.sin(w.f * th + w.p + w.w * t);
    let lx = Math.cos(th) * rx * f, ly = Math.sin(th) * ry * f;
    const back = Math.max(0, -Math.cos(th));
    if (taper > 0) { lx *= 1 + 0.6 * taper * back; ly *= 1 - 0.55 * taper * back; }
    if (curl !== 0) ly += curl * back * back * rx * 0.45;
    pts.push(x + lx * c - ly * s, y + lx * s + ly * c);
  }
  return pts;
}

function keepAboveGround(shapes: Shape[], groundY: number): Shape[] {
  for (const s of shapes) {
    if (s.kind === "circle") s.y = Math.min(s.y, groundY - s.r);
    else if (s.kind === "rect") s.h = Math.max(0, Math.min(s.h, groundY - s.y));
    else if (s.kind !== "symbol") {
      const pad = s.kind === "line" ? s.width / 2 : s.stroke ? (s.width ?? 2) / 2 : 0;
      for (let i = 1; i < s.points.length; i += 2) s.points[i] = Math.min(s.points[i], groundY - pad);
    }
  }
  return shapes;
}

// ---- smoke --------------------------------------------------------------------------------------------
const LIFE = 2.3; // seconds a bit of smoke lives (at speed 1): by then it has risen to its height and faded out
const COLUMN = 0.9; // seconds: smoke younger than this is still one connected column with its source
const DARK_TILL = 0.38, MID_TILL = 0.64, SPLIT_AT = 0.55; // when (in its life 0..1) a bit gets lighter (on average) / tears apart
const END = 0.9; // seconds: at the end the source stops first, and the last smoke rises, gets lighter and fades out

function smoke(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, { size: 0.12, direction: -90, spread: 25, wind: 0.35 });
  const h = ctx.height, turb = k.turbulence;
  const ts = ctx.t * k.speed, T = Math.max(0.1, ctx.duration * k.speed);
  const stopAt = Math.max(T * 0.5, T - END - 0.1);
  const endF = smooth((T - ts) / END); // 1 → 0 over the last moments: everything still in the air thins away
  const shades = shadesOf(k), [dark] = shades;
  // The dark and middle grays never sit at a fixed height: a slow, seeded swell of the whole plume (plus each puff's
  // own timing) makes them reach higher, then lower, then higher again, like real smoke.
  const swellOf = (j: number, sp: number) => clamp(0.55 * Math.sin(ts * sp + TAU * rand(k.seed, j, 21)) + 0.6 * wobble(k.seed, 21 + j, ts * sp * 0.4, 1), -1, 1);
  const swell = swellOf(0, 2.4), swell2 = swellOf(1, 2.1);
  const column = COLUMN * (1 + 0.4 * swell);
  const onGround = ctx.at.y >= ctx.groundY - 0.05 * h;
  // How much smoke comes out at time b: it builds up at the start and tails off at the end.
  const strength = (b: number) => (b < 0 || b > stopAt ? 0 : smooth(b / 0.5 + 0.15) * smooth((stopAt - b) / 0.35));
  // Where the bit of smoke that came out `a` seconds ago (at b = ts − a) is now: it goes along `direction` at a
  // steady pace that slows a little (smoke sideways also floats up), and the wind carries it more and more;
  // turbulence sways the column. `lat` pushes a bit to one side of the column, `dj` turns its direction a little.
  const at = (a: number, b: number, lat = 0, dj = 0): Point => {
    const d = k.dir + dj, ux = Math.cos(d), uy = Math.sin(d);
    const along = h * (0.81 * a - 0.064 * a * a + 0.15 * (1 - Math.exp(-a / 0.25)));
    const float = 0.15 * h * a * a * (1 + Math.sin(k.dir));
    const sway = turb * 0.14 * h * wobble(k.seed, 3, b * 0.9 + 0.15 * ts, 1) * smooth(a / 1.05);
    const side = lat * 0.15 * h * (0.27 + a) + sway;
    return { x: ctx.at.x + ux * along - uy * side + k.wind * 0.3 * h * a ** 1.5, y: ctx.at.y + uy * along + ux * side - float };
  };
  // How wide the smoke is at age a: narrow where it comes out, wider and wider as it rises (a cone, like a volcano).
  const width = (a: number, b: number) => k.size * h * (0.75 + 2.4 * (a / LIFE)) * (0.7 + 0.3 * strength(b));
  const out: Shape[] = [];
  const items: { u: number; draw: () => void }[] = [];

  // THE COLUMN: one wavy shape from the source up to where the smoke starts to billow. Its bumps ride up with the
  // smoke. It grows out of the source at the start, and lifts off it when the smoke stops.
  const aBot = Math.max(0, ts - stopAt), aTop = Math.min(ts, column);
  if (aTop - aBot > 0.04) {
    items.push({
      u: (column / LIFE) * 0.95,
      draw: () => {
        const S = 20, sideA: number[] = [], sideB: number[] = [];
        let top = { c: ctx.at as Point, tx: 0, ty: -1, w: 0 }, bot = top;
        for (let j = 0; j <= S; j += 1) {
          const a = aBot + ((aTop - aBot) * j) / S, b = ts - a;
          const c = at(a, b), c2 = at(a + 0.04, b - 0.04);
          let tx = c2.x - c.x, ty = c2.y - c.y;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl; ty /= tl;
          let w = 0.9 * width(a, b);
          if (onGround && aBot === 0) w *= 1 + 0.5 * (1 - smooth(a / 0.2)); // it spreads out a little where it leaves the ground
          const wave = (ph: number) => 1 + (0.5 + 0.6 * turb) * (0.2 * Math.sin(b * 11 + ph) + 0.08 * Math.sin(b * 19 + 2 * ph) + 0.06 * Math.sin(b * 31 + 3 * ph)) + 0.02 * wobble(k.seed, j + 40 * ph, ts, 2);
          const wa = w * wave(1 + k.seed), wb = w * wave(4 + k.seed);
          sideA.push(c.x - ty * wa, c.y + tx * wa);
          sideB.push(c.x + ty * wb, c.y - tx * wb);
          if (j === 0) bot = { c, tx, ty, w };
          if (j === S) top = { c, tx, ty, w };
        }
        // a wavy round cap on top, then down the other side, then the bottom (flat on the ground, or round)
        const cap = (e: typeof top, from: number, sign: number, steps: number) => {
          const pts: number[] = [];
          for (let q = 1; q < steps; q += 1) {
            const al = from + (q / steps) * Math.PI, rr = e.w * (1 + 0.1 * Math.sin(3 * al + ts * 2.5 + k.seed));
            const nx = -e.ty * Math.cos(al) + sign * e.tx * Math.sin(al), ny = e.tx * Math.cos(al) + sign * e.ty * Math.sin(al);
            pts.push(e.c.x + nx * rr, e.c.y + ny * rr);
          }
          return pts;
        };
        const backB: number[] = [];
        for (let j = sideB.length - 2; j >= 0; j -= 2) backB.push(sideB[j], sideB[j + 1]);
        const points = [...sideA, ...cap(top, 0, 1, 7), ...backB];
        if (!(onGround && aBot === 0)) points.push(...cap(bot, Math.PI, 1, 7));
        out.push({ kind: "poly", points, fill: dark, alpha: endF });
        // its rounded, billowing head (the first smoke out leads the way up)
        const hr = top.w * 1.25;
        out.push({ kind: "poly", points: wavyOutline(top.c.x, top.c.y - 0.15 * hr, hr * 1.1, hr * 0.9, 0, k.seed + 3, ts, turb), fill: dark, alpha: endF });
      },
    });
  }

  // BILLOWS AND WISPS: bits of smoke that keep coming up the column, billow out on its sides, swell, get lighter,
  // then tear into 2–3 wavy wisps that pull apart, drift and fade by the top.
  const N = clamp(Math.round(15 * (0.6 + 0.4 * k.intensity)), 5, 22);
  for (let i = 0; i < N; i += 1) {
    const age0 = ts + ((i + 0.5 * rand(k.seed, i, 9)) / N) * LIFE, n = Math.floor(age0 / LIFE);
    const u = (age0 - n * LIFE) / LIFE, a = u * LIFE, b = ts - a;
    if (a < 0.12 || b < 0 || b > stopAt) continue;
    const st = strength(b);
    if (st < 0.03) continue;
    const s = k.seed + n * 53 + i;
    const lat = (i % 2 ? 1 : -1) * (0.35 + 0.5 * rand(s, i, 3)), dj = (rand(s, i, 1) - 0.5) * k.spread * DEG * 0.6;
    const c = at(a, b, lat, dj);
    const r = width(a, b) * (0.8 + 0.3 * rand(s, i, 4));
    // 3 flat shades by height — where each puff turns lighter swells up and down — (and one or two steps lighter
    // while it thins away at the end)
    const darkTill = DARK_TILL + 0.14 * swell + 0.07 * (2 * rand(s, i, 11) - 1);
    const midTill = Math.max(darkTill + 0.1, MID_TILL + 0.08 * swell2 + 0.05 * (2 * rand(s, i, 12) - 1));
    const shade = u < darkTill ? 0 : u < midTill ? 1 : 2;
    const fill = shades[Math.min(2, shade + (endF < 0.4 ? 2 : endF < 0.75 ? 1 : 0))];
    const alpha = (shade < 2 ? 1 : 0.8) * (1 - smooth((u - 0.7) / 0.3)) * smooth(st * 4) * endF;
    if (alpha < 0.03) continue;
    const roll = rand(s, i, 5) * Math.PI + (i % 2 ? 1 : -1) * 0.5 * a; // billows roll as they rise
    items.push({
      u,
      draw: () => {
        if (u < SPLIT_AT) return void out.push({ kind: "poly", points: wavyOutline(c.x, c.y, r * 1.08, r * 0.92, roll, s, ts, turb), fill, alpha });
        // tearing apart: 2–3 ragged wisps pull away from each other (mostly sideways and up), drift with the wind,
        // curl and thin out
        const sp = smooth((u - SPLIT_AT) / 0.3), m = rand(s, i, 6) < 0.35 ? 3 : 2;
        const downwind = k.wind > 0.05 ? 0 : k.wind < -0.05 ? Math.PI : rand(s, i, 8) < 0.5 ? 0 : Math.PI;
        for (let j = 0; j < m; j += 1) {
          const phi = -Math.PI / 2 + (j - (m - 1) / 2) * 1.8 + (rand(s, j, 7) - 0.5) * 0.7;
          const d = r * (0.4 + 1.2 * sp);
          const x = c.x + Math.cos(phi) * d + k.wind * 0.1 * h * sp, y = c.y + Math.sin(phi) * d * 0.7 - 0.05 * h * sp;
          const rr = r * (0.58 - 0.12 * sp);
          const ang = downwind + (rand(s, j, 9) - 0.5) * 0.8 + turb * 0.4 * wobble(s, j, ts * 0.6, 1);
          const curl = (rand(s, j, 10) < 0.5 ? -1 : 1) * 0.6 * sp;
          out.push({ kind: "poly", points: wavyOutline(x, y, rr * (1 + 0.35 * sp), rr * (0.9 - 0.1 * sp), ang, s + 7 * (j + 1), ts, turb, 0.25 * sp, curl), fill, alpha });
        }
      },
    });
  }
  // oldest (highest, palest) behind, youngest in front
  items.sort((p1, p2) => p2.u - p1.u).forEach((q) => q.draw());
  return keepAboveGround(out, ctx.groundY);
}

// ---- smokeBurst ---------------------------------------------------------------------------------------
// A "poof": a big wavy cloud bursts out and hides the spot in under 0.2 s, in flat layers by height (a lighter lump
// peeking over the top, the middle, darker lumps low), churns for a moment, then ROLLS UP: the lumps rise and
// spread like a mushroom, get lighter, and tear into ragged wavy wisps that drift up and fade.
function smokeBurst(ctx: EffectContext, p: EffectParams): Shape[] {
  const k = knobs(p, { size: 0.6, direction: -90, spread: 360, wind: 0 });
  const h = ctx.height, g = ctx.groundY, turb = k.turbulence;
  const ts = ctx.t * k.speed, T = Math.max(0.3, ctx.duration * k.speed);
  const R = k.size * h * (0.75 + 0.25 * Math.min(1.5, k.intensity));
  const outT = 0.15; // bursts to full size in well under 0.2 s
  const out01 = 1 - (1 - clamp(ts / outT, 0, 1)) ** 3;
  const hold = Math.max(outT + 0.15, T * 0.35);
  const after = clamp((ts - hold) / Math.max(0.05, T - hold), 0, 1);
  const alpha = 1 - smooth((after - 0.45) / 0.55); // solid while it rolls up, then it fades out
  const rise0 = 0.1 * h * Math.max(0, ts - outT); // it drifts up a little while it hangs there
  const shades = shadesOf(k);
  const out: Shape[] = [];
  const cx = ctx.at.x, cy = Math.min(ctx.at.y, g - R * 0.3);
  const ux = Math.cos(k.dir), uy = Math.sin(k.dir), upA = k.dir; // "up" for this burst (direction)
  const px = -uy, py = ux; // sideways
  const drift = k.wind * 0.15 * h * after;
  // a few cartoon "poof" lines flying out at the very start
  if (ts < 0.3) {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + rand(k.seed, i, 9) * 0.4, u = clamp(ts / 0.3, 0, 1);
      const r1 = R * (0.8 + 0.6 * u), r2 = r1 + R * 0.25 * (1 - u);
      out.push({ kind: "line", points: [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2], stroke: k.color2, width: Math.max(3, R * 0.035), alpha: 0.9 * (1 - u) });
    }
  }
  // One lump at (x, y), radius r, starting shade `base` (0 dark, 1 middle, 2 light). `roll` 0..1 = how far it has
  // rolled up: it gets a shade lighter, then another, and past halfway tears into two ragged wisps drifting apart.
  const lump = (x: number, y: number, r: number, base: number, seed: number, roll: number, side: number) => {
    if (r < 1 || alpha < 0.02) return;
    const fill = shades[Math.min(2, base + (roll > 0.3 ? 1 : 0) + (roll > 0.7 ? 1 : 0))];
    const sp = smooth((roll - 0.4) / 0.4);
    if (sp < 0.5) return void out.push({ kind: "poly", points: wavyOutline(x, y, r * (1 + 0.15 * sp), r * (1 - 0.1 * sp), rand(seed, 0, 1) * Math.PI + roll * side, seed, ts, turb), fill, alpha });
    for (let q = 0; q < 2; q += 1) {
      const phi = upA + (q ? 0.8 : -0.8) + (rand(seed, q, 4) - 0.5) * 0.5, d = r * (0.3 + 0.9 * sp);
      const rr = r * 0.55, ang = upA + Math.PI / 2 + (rand(seed, q, 2) - 0.5) * 1.6 + turb * 0.4 * wobble(seed, q, ts * 0.6, 1);
      out.push({ kind: "poly", points: wavyOutline(x + Math.cos(phi) * d, y + Math.sin(phi) * d, rr * (1 + 0.25 * sp), rr * (0.88 - 0.1 * sp), ang, seed + 7 * (q + 1), ts, turb, 0.25 * sp, (rand(seed, q, 3) < 0.5 ? -1 : 1) * 0.6 * sp), fill, alpha });
    }
  };
  // the lumps round the edge (one always at the top): the darker bottom ones peek out underneath, the lighter top
  // one sits on top in front; rolling up, each rises and spreads a little (the top ones first), like a mushroom
  const M = 7, behind: (() => void)[] = [], inFront: (() => void)[] = [];
  for (let j = 0; j < M; j += 1) {
    const th = upA + (j / M) * TAU + (rand(k.seed, j, 1) - 0.5) * 0.35;
    const rel = Math.cos(th - upA), side = Math.sin(th - upA); // 1 = top, −1 = bottom; which side
    const base = rel > 0.8 ? 2 : rel < -0.5 ? 0 : 1;
    const roll = smooth((after - 0.12 * (1 - rel) * 0.5 - 0.06 * rand(k.seed, j, 5)) / 0.75);
    const d = R * 0.55 * out01 * (1 + 0.3 * roll) * (base === 0 ? 1.12 : 1);
    const rise = rise0 + R * roll * (1.1 + 0.3 * rel + 0.5 * rand(k.seed, j, 4)), outw = R * 0.35 * roll * side;
    const x = cx + Math.cos(th) * d + ux * rise + px * outw + drift + turb * R * 0.06 * wobble(k.seed, j, ts, 1.5) * after;
    const y = cy + Math.sin(th) * d * 0.9 + uy * rise + py * outw;
    const lr = R * 0.44 * (0.35 + 0.65 * out01) * (0.85 + 0.3 * rand(k.seed, j, 3)) * (1 + 0.1 * roll);
    (base === 2 ? inFront : behind).push(() => lump(x, y, lr, base, k.seed + 19 * j, roll, side));
  }
  behind.forEach((f) => f());
  // the body in the middle: hides what's inside; rolling up, it rises through the middle and tears
  const rollB = smooth((after - 0.05) / 0.75);
  const rb = R * 0.8 * (0.3 + 0.7 * out01) * (1 - 0.3 * rollB);
  const lift = rise0 + R * 1.1 * rollB;
  const bx = cx + ux * lift + drift, by = Math.min(cy + uy * lift, g - rb * 0.3);
  lump(bx, by, rb, 1, k.seed + 777, rollB, 0);
  inFront.forEach((f) => f());
  return keepAboveGround(out, g);
}

export const RECIPES: EffectRecipe[] = [
  { id: "smoke", about: "smoke that keeps coming out of the anchor (the ground, a chimney, a fire) like a volcano: one wavy dark column that rises (or goes along `direction`), widens and drifts with the wind, billows out, gets lighter, then breaks into wavy wisps that thin and fade out by a certain height; builds up then tails off. Drawn by hand: 8–30 flat shapes in 3 grays (dark low, light high), wavy outlines that change every picture — never round cloud puffs. Knobs: color = young smoke, color2 = old smoke, size = how wide (x height, 0.12), wind (sideways drift, + = right, default 0.25), turbulence = how wavy, spread, intensity, speed, seed.", draw: smoke },
  { id: "smokeBurst", about: "a quick 'poof' cloud bursting out from the anchor (not for teleports — those are a quick flash): a wavy cloud big enough to hide a figure (size = radius x height, 0.6) in under 0.2 s, in flat layers (a lighter lump on top, darker lumps low), then it rolls up and spreads like a mushroom, gets lighter and tears into ragged wavy wisps that drift up and fade. Knobs: color, color2, size, speed, intensity, turbulence, direction, wind, seed.", draw: smokeBurst },
];
