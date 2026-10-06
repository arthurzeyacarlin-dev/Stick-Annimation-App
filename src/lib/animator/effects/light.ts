// LIGHT recipes (SPEC-0017 Phase 2C). Registered in index.ts.
//
// "flicker": a flickering light bulb hanging at the anchor — the bulb (glass, filament, screw base, cord) and its
//   light, whose brightness follows a seeded rule: mostly on with a faint buzz, sudden dips, now and then a short
//   blackout. The ground under it is lit while it is on.
// "glow": a steady soft aura around the anchor, gently pulsing (powered-up hands).
// "flash": a quick burst of light at the anchor (a growing bright ball and rays, ~0.15 s, then fading): teleports,
//   impacts.
// Nothing goes below the ground: round lights are kept above it, and light on the ground is a dome sitting on it.
import { bulbGlass, PLACED_SYMBOLS } from "../symbolMaker.ts";
import { clamp, lerp, lifeOf, mixColor, rand, wobble } from "./random.ts";
import { groundLight } from "./groundLight.ts";
import type { EffectContext, EffectParams, EffectRecipe, Shape } from "./types.ts";

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

// The biggest radius a light centered at y may have without reaching below the ground.
const aboveGround = (r: number, y: number, groundY: number) => Math.max(0, Math.min(r, groundY - y));

// How bright the bulb is at time t (0 = off, 1 = full). Time is cut into short slots; each slot's seeded dice
// decide: on (with a faint buzz), a stuttering dip, or a blackout. `turbulence` = how often it misbehaves.
export function flickerBrightness(t: number, params: EffectParams): number {
  const seed = num(params.seed, 1), speed = Math.max(0.05, num(params.speed, 1));
  const turb = clamp(num(params.turbulence, 0.5), 0, 1);
  const slot = 0.15 / speed;
  const n = Math.floor(t / slot);
  if (n === 0) return 0.95; // it starts on
  const dice = rand(seed, n, 1);
  const black = 0.03 + 0.1 * turb, dip = 0.08 + 0.25 * turb;
  if (dice < black) return 0.03; // a short blackout
  if (dice < black + dip) {
    // a stutter: a few quick dips inside the slot
    const sub = Math.floor(t / (slot / 3));
    return rand(seed, sub, 2) < 0.55 ? lerp(0.15, 0.4, rand(seed, sub, 3)) : 0.85;
  }
  return clamp(0.92 + 0.07 * wobble(seed, 3, t, 30 * speed), 0, 1); // on, with a buzz
}

const flicker: EffectRecipe = {
  id: "flicker",
  about: "A flickering light bulb hanging at the anchor (glass, filament, screw base, cord up to the top of the page): its light (`color`, default warm #ffe9a8) is mostly on with a faint buzz, with sudden dips and now and then a short blackout (`turbulence` = how often, `seed` = a different pattern, `speed`); the ground under it is lit when it is on. `size` = how big the light is, `intensity` = how bright, `cord: false` = no cord.",
  draw(ctx: EffectContext, p: EffectParams): Shape[] {
    const color = str(p.color, "#ffe9a8"), hot = str(p.color2, "#fff6d8");
    const size = num(p.size, 1), intensity = clamp(num(p.intensity, 1), 0, 2);
    const b = flickerBrightness(ctx.t, p) * intensity;
    const r = ctx.height * 0.05 * Math.max(0.5, Math.min(2, size)); // the glass
    const x = ctx.at.x, y = Math.min(ctx.at.y, ctx.groundY - r * 1.05); // a bulb never sinks into the ground
    const shapes: Shape[] = [];
    // The light: a big soft circle, a brighter middle, a faint cone down and a pool on the ground.
    const R = aboveGround(ctx.height * 0.95 * size, y, ctx.groundY);
    const drop = ctx.groundY - y;
    if (b > 0.05) {
      if (drop > r * 2) {
        const pool = Math.max(ctx.height * 0.35, drop * 0.55) * size;
        shapes.push({ kind: "poly", points: [x - r, y + r, x + r, y + r, x + pool, ctx.groundY, x - pool, ctx.groundY], fill: color, alpha: 0.07 * b });
        shapes.push(...groundLight(x, ctx.groundY, pool * 1.1, ctx.height * 0.02, color, 0.2 * b, hot)); // LIGHT ON THE GROUND: thin and dim
      }
      shapes.push({ kind: "circle", x, y, r: R, fill: color, alpha: 0.13 * b, glow: 40 });
      shapes.push({ kind: "circle", x, y, r: R * 0.5, fill: color, alpha: 0.18 * b, glow: 30 });
      shapes.push({ kind: "circle", x, y, r: Math.min(R, r * 2.2), fill: hot, alpha: 0.35 * b, glow: 20 });
    }
    // The bulb. STILL THINGS ARE SYMBOLS: the bulb itself (see-through glass, neck, screw base) keeps its look, so
    // it is the "Light bulb" Library symbol, placed last (on top); the light under it shows through the glass. The
    // cord (its length), the lit glass and the filament (their brightness) change, so they stay drawn.
    const baseTop = y - r * 1.55, on = clamp(b, 0, 1);
    if (p.cord !== false) shapes.push({ kind: "line", points: [x, baseTop, x, Math.min(baseTop, 0)], stroke: "#333333", width: Math.max(1.5, r * 0.12) });
    if (on > 0.05) shapes.push({ kind: "circle", x, y, r, fill: hot, alpha: 0.9 * on, glow: 25 * on });
    const fil = mixColor("#7a5a3a", "#ff9d2e", on);
    shapes.push({ kind: "line", points: [x - r * 0.3, y - r * 0.6, x - r * 0.3, y, x - r * 0.15, y - r * 0.2, x, y, x + r * 0.15, y - r * 0.2, x + r * 0.3, y, x + r * 0.3, y - r * 0.6], stroke: fil, width: Math.max(1, r * 0.08), glow: 8 * on });
    const glass = bulbGlass(PLACED_SYMBOLS["Light bulb"].size), k = r / glass.r; // the made bulb → this size
    shapes.push({ kind: "symbol", name: "Light bulb", x, y: y + (glass.h / 2 - glass.y) * k, scale: k });
    return shapes;
  },
};

const glow: EffectRecipe = {
  id: "glow",
  about: "A steady soft glow (aura) around the anchor, pulsing gently — for powered-up hands or a glowing object. `color` (default sky blue #7fd4ff) with a bright `color2` middle (default white); `size` = how big, `intensity` = how bright, `speed` = how fast it pulses; a few small motes drift up out of it. Fades in and out at the ends.",
  draw(ctx: EffectContext, p: EffectParams): Shape[] {
    const color = str(p.color, "#7fd4ff"), core = str(p.color2, "#ffffff");
    const size = num(p.size, 1), intensity = clamp(num(p.intensity, 1), 0, 2), speed = Math.max(0.05, num(p.speed, 1));
    const seed = num(p.seed, 1);
    const env = Math.min(1, ctx.t / 0.2, Math.max(0, ctx.duration - ctx.t) / 0.2 + (ctx.duration <= 0 ? 1 : 0));
    const pulse = 1 + 0.08 * Math.sin(ctx.t * Math.PI * 2 * 0.9 * speed) + 0.03 * wobble(seed, 1, ctx.t, 3 * speed);
    const a = clamp(intensity * env, 0, 1.5);
    if (a <= 0.01) return [];
    const { x, y } = ctx.at;
    const R = ctx.height * 0.13 * size * pulse;
    const shapes: Shape[] = [];
    for (const [f, al] of [[1, 0.12], [0.68, 0.2], [0.42, 0.32]] as const) shapes.push({ kind: "circle", x, y, r: aboveGround(R * f, y, ctx.groundY), fill: color, alpha: al * a, glow: 30 });
    shapes.push({ kind: "circle", x, y, r: aboveGround(R * 0.2, y, ctx.groundY), fill: core, alpha: 0.7 * a, glow: 16 });
    // Motes drifting up out of the glow.
    const count = Math.round(5 * clamp(intensity, 0.4, 2));
    for (let i = 0; i < count; i += 1) {
      const l = lifeOf(ctx.t, i, count, 0.9 / speed, seed + 7);
      if (l.bornAt < -1e-9) continue;
      const k = i * 13 + l.n * 101;
      const ang = rand(seed, k, 1) * Math.PI * 2;
      const mx = x + Math.cos(ang) * R * 0.6 * rand(seed, k, 2) + Math.sin(l.u * 5 + k) * R * 0.1;
      const my = y + Math.sin(ang) * R * 0.4 - l.u * R * 1.3;
      if (my > ctx.groundY) continue;
      shapes.push({ kind: "circle", x: mx, y: my, r: Math.max(1, ctx.height * 0.008 * size), fill: core, alpha: a * Math.sin(Math.PI * l.u), glow: 8 });
    }
    return shapes;
  },
};

const flash: EffectRecipe = {
  id: "flash",
  about: "A quick burst of light at the anchor: a bright ball that grows fast with rays shooting out (~0.15 s at speed 1), then fades — for teleports and impacts. `color` (default white-gold #fff3b0) with a white `color2` middle; `size` = how big, `intensity` = how bright, `spread` = how many rays (default 10), `speed`.",
  draw(ctx: EffectContext, p: EffectParams): Shape[] {
    const color = str(p.color, "#fff3b0"), core = str(p.color2, "#ffffff");
    const size = num(p.size, 1), intensity = clamp(num(p.intensity, 1), 0, 2), speed = Math.max(0.05, num(p.speed, 1));
    const seed = num(p.seed, 1);
    const burst = 0.15 / speed, fade = 0.25 / speed;
    const t = ctx.t;
    if (t > burst + fade) return [];
    const grow = 0.35 + 0.65 * Math.min(1, t / burst); // already bright on the first picture
    const a = intensity * (t < burst ? 1 : (1 - (t - burst) / fade) ** 2);
    if (a <= 0.01) return [];
    const { x, y } = ctx.at;
    const R = ctx.height * 0.45 * size * grow;
    const shapes: Shape[] = [];
    shapes.push({ kind: "circle", x, y, r: aboveGround(R, y, ctx.groundY), fill: color, alpha: 0.35 * a, glow: 40 });
    shapes.push({ kind: "circle", x, y, r: aboveGround(R * 0.55, y, ctx.groundY), fill: color, alpha: 0.6 * a, glow: 25 });
    shapes.push({ kind: "circle", x, y, r: aboveGround(R * 0.28 * (t < burst ? 1 : 1 - (t - burst) / fade), y, ctx.groundY), fill: core, alpha: Math.min(1, a), glow: 20 });
    // Rays: thin bright spikes out of the middle, longest at the end of the burst.
    const rays = Math.max(4, Math.round(num(p.spread, 10)));
    for (let i = 0; i < rays; i += 1) {
      const ang = ((i + (rand(seed, i, 1) - 0.5) * 0.6) / rays) * Math.PI * 2;
      const len = R * lerp(1.1, 1.9, rand(seed, i, 2));
      const x1 = x + Math.cos(ang) * R * 0.2, y1 = y + Math.sin(ang) * R * 0.2;
      let x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      if (y2 > ctx.groundY) { const u = (ctx.groundY - y) / (y2 - y); if (u <= 0.2) continue; x2 = x + (x2 - x) * u; y2 = ctx.groundY; }
      shapes.push({ kind: "line", points: [x1, Math.min(y1, ctx.groundY), x2, y2], stroke: color, width: Math.max(1, ctx.height * 0.012 * size), alpha: 0.8 * a, glow: 12 });
    }
    // Light on the ground, if the flash is near it.
    const drop = ctx.groundY - y;
    if (drop < ctx.height * 1.2) shapes.push(...groundLight(x, ctx.groundY, R * 1.6, ctx.height * 0.02, color, 0.175 * a * (1 - drop / (ctx.height * 1.2))));
    return shapes;
  },
};

export const RECIPES: EffectRecipe[] = [flicker, glow, flash];
