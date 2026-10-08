// BUBBLES (Arthur, 2026-10-07: "I expected them to MOVE AROUND and look like real bubbles — like the water shield
// bubble — not glowing pink dots"). Real soap/magic bubbles: a THIN RING (see-through, only a faint tint inside) with a
// white SHINE (a short curved streak and a dot on the upper left, like the water shield's), each one wobbling out of
// round as it floats. They are blown out round the anchor, DRIFT up and sway side to side, grow a little, and at the end
// of their life SOME POP (the ring breaks into a few tiny drops flying out) while the rest fade. Any color.
// Pure: the same moment gives the same bubbles at 8, 12 or 24 pictures a second.
import { clamp, lifeOf, mixColor, rand, wobble } from "./random.ts";
import type { EffectContext, EffectParams, EffectRecipe, Shape } from "./types.ts";

const DEFAULTS = { color: "#8fd3ff", color2: "#ffffff", size: 0.06, count: 8, spread: 0.45, speed: 1, pop: 0.5, life: 2.4 };

export function bubbles(ctx: EffectContext, p: EffectParams): Shape[] {
  const color = typeof p.color === "string" ? p.color : DEFAULTS.color;
  const shine = typeof p.color2 === "string" ? p.color2 : DEFAULTS.color2;
  const h = ctx.height, seed = Number(p.seed ?? 7), speed = Number(p.speed ?? DEFAULTS.speed);
  const R0 = Number(p.size ?? DEFAULTS.size) * h, area = Number(p.spread ?? DEFAULTS.spread) * h;
  const count = clamp(Math.round(Number(p.count ?? DEFAULTS.count)), 1, 40), popShare = clamp(Number(p.pop ?? DEFAULTS.pop), 0, 1);
  const life = Number(p.life ?? DEFAULTS.life) / Math.max(0.2, speed);
  // (`direction`: where they drift, degrees, default -90 = up.)
  const dir = ((Number(p.direction ?? -90)) * Math.PI) / 180, dx = Math.cos(dir), dy = Math.sin(dir);
  // (`motion`: "rise" = drift away, pop or fade, new ones keep coming (default); "float" = the SAME bubbles stay the
  // whole time, wandering slowly round where they were blown, no popping — "just floating around".)
  const floating = p.motion === "float";
  const t = ctx.t, out: Shape[] = [];
  // fade in over the first 0.3 s, out over the last 0.3 s of the effect
  const master = clamp(t / 0.3, 0, 1) * clamp((ctx.duration - t) / 0.3, 0, 1);
  if (master <= 0) return out;
  for (let i = 0; i < count; i += 1) {
    const L = life * (0.75 + 0.5 * rand(seed, i, 1));
    const { n, u } = floating ? { n: 0, u: 0.5 } : lifeOf(t, i, count, L, seed);
    const s = seed + n * 13 + i * 7;
    const r = R0 * (0.6 + 0.8 * rand(s, i, 2)) * (0.85 + 0.25 * Math.min(1, u * 2));
    // where it is: born somewhere round the anchor, drifting along `direction` and swaying across it
    const born = { x: ctx.at.x + (rand(s, i, 3) - 0.5) * 2 * area, y: ctx.at.y + (rand(s, i, 4) - 0.5) * area };
    const travel = u * L * h * 0.22 * speed;
    const sway = wobble(s, i, t, 1.6) * h * 0.06 + Math.sin((u * L + rand(s, i, 5) * 6) * 2.4) * h * 0.035;
    const x = floating ? born.x + wobble(s, i, t, 0.35 * speed) * area * 0.35 + sway : born.x + dx * travel - dy * sway;
    const y = floating ? born.y + wobble(s, i + 40, t, 0.3 * speed) * area * 0.25 : born.y + dy * travel + dx * sway;
    if (y + r > ctx.groundY) continue;
    const pops = !floating && rand(s, i, 6) < popShare, popAt = 0.86 + 0.08 * rand(s, i, 7);
    if (pops && u >= popAt) {
      // POP: a few tiny drops flying out from where the ring was, fading fast
      const k = clamp((u - popAt) / 0.08, 0, 1);
      if (k >= 1) continue;
      for (let j = 0; j < 6; j += 1) {
        const a = (j / 6) * Math.PI * 2 + rand(s, j, 8);
        const d = r * (1 + 1.4 * k);
        out.push({ kind: "circle", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + k * k * r * 0.6, r: Math.max(1.2, r * 0.07 * (1 - 0.5 * k)), fill: mixColor(color, "#ffffff", 0.4), alpha: 0.9 * (1 - k) * master });
      }
      continue;
    }
    const fade = clamp(u / 0.12, 0, 1) * (pops ? 1 : clamp((1 - u) / 0.2, 0, 1)) * master;
    if (fade <= 0) continue;
    // the ring: out of round, wobbling (a soap film)
    const pts: number[] = [], N = 20;
    for (let j = 0; j <= N; j += 1) {
      const a = (j / N) * Math.PI * 2;
      const rr = r * (1 + 0.07 * Math.sin(2 * a + t * 5 + rand(s, i, 9) * 6) + 0.04 * Math.sin(3 * a - t * 4));
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    out.push({ kind: "poly", points: pts.slice(0, -2), fill: color, alpha: 0.1 * fade });
    out.push({ kind: "line", points: pts, stroke: color, width: Math.max(1.5, r * 0.08), alpha: 0.85 * fade, glow: 4 });
    // the shine: a short curved streak and a dot on the upper left
    const arc: number[] = [];
    for (let j = 0; j <= 5; j += 1) { const a = Math.PI * (1.08 + 0.3 * (j / 5)); arc.push(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68); }
    out.push({ kind: "line", points: arc, stroke: shine, width: Math.max(1.5, r * 0.11), alpha: 0.85 * fade });
    out.push({ kind: "circle", x: x + r * 0.32, y: y - r * 0.45, r: Math.max(1, r * 0.08), fill: shine, alpha: 0.8 * fade });
  }
  return out;
}

export const RECIPES: EffectRecipe[] = [
  { id: "bubbles", about: "real floating bubbles (a thin see-through ring, white shine, wobbling): blown out round the anchor, drift up and sway, some pop into tiny drops. color = ring (any color, e.g. pink), color2 = shine, size = bubble radius x height (0.06), count (8), spread = area x height (0.45), pop = share that pop (0.5), direction (-90 up), speed, motion (rise = drift away and pop, new ones keep coming; float = the same bubbles stay, wandering, no popping). Put the anchor on a hand or an object to follow it.", draw: bubbles },
];
