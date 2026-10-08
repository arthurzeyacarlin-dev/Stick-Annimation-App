// THUNDERSTORM (Arthur, 2026-10-07: "the background needs to be dark (dark gray / gray) for a thunderstorm; more rain;
// lightning twice as often; some far away, some close"). One background piece that is the whole storm, so rain +
// lightning are never put on a white page again: a DARK GRAY sky over the whole page, HEAVY slanted rain, and lightning
// at seeded random times about every 1–2 s (`every`, average seconds): FAR strikes small, thin and faint, ending on
// the horizon behind everything with a dim glow in the sky; NEAR strikes big and bright down to the ground with a white
// FLASH of the whole sky (flickering twice). Pure: the same `t` gives the same storm at 8, 12 or 24 pictures a second.
import { rain } from "./backgrounds.ts";
import { RECIPES as LIGHTNING } from "./lightning.ts";
import { clamp, mixColor, rand } from "./random.ts";
import type { BackgroundPiece, BackgroundRecipe, Shape } from "./types.ts";

type Stage = { width: number; groundY: number; height: number };
type Params = NonNullable<BackgroundPiece["params"]>;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const BLEED = 1200;
const BOLT = 0.9; // seconds one strike lasts (lightning.ts at speed 1)
const bolt = LIGHTNING.find((r) => r.id === "lightning")!;

// The strikes: when each starts, near or far, and where (stage x).
export function stormStrikes(p: Params, s: Stage, until: number) {
  const seed = num(p.seed, 1) * 7.31 + 900, every = clamp(num(p.every, 1.4), 0.4, 6), near = clamp(num(p.near, 0.4), 0, 1);
  const out: { t: number; near: boolean; x: number; seed: number }[] = [];
  for (let k = 0, t = 0.35 + 0.4 * rand(seed, 0, 1); t < until && k < 200; k += 1, t += every * (0.65 + 0.7 * rand(seed, k, 2))) {
    const isNear = rand(seed, k, 3) < near;
    const x = (0.08 + 0.84 * rand(seed, k, 4)) * s.width;
    out.push({ t, near: isNear, x: isNear ? awayFromPeople(x, p, s) : x, seed: Math.floor(seed + k * 17) });
  }
  return out;
}

// LIGHTNING STRIKES AWAY FROM PEOPLE (unless the story says it hits someone): a near bolt never comes down through a
// figure that doesn't react — it lands at least `gap` (about a figure height) to the side with more room.
// `avoid` = where the figures stand (stage x), filled in by the planner; `gap` in stage pixels.
function awayFromPeople(x: number, p: Params, s: Stage) {
  const people = Array.isArray(p.avoid) ? (p.avoid as unknown[]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : [];
  const gap = num(p.gap, 0.9 * s.height);
  for (let pass = 0; pass < 3; pass += 1) {
    const hit = people.find((q) => Math.abs(q - x) < gap);
    if (hit === undefined) return x;
    const left = hit - gap, right = hit + gap;
    x = (x < hit && left > 0.05 * s.width) || right > 0.95 * s.width ? left : right;
  }
  return x;
}

// The planner's half: tells every storm where the figures stand (a storm the plan aims at someone keeps its `avoid`).
export function stormsAvoid(pieces: BackgroundPiece[], xs: number[], figureHeight: number): BackgroundPiece[] {
  return pieces.map((pc) => (pc.kind === "thunderstorm" && pc.params?.avoid === undefined ? { ...pc, params: { ...pc.params, avoid: xs, gap: 0.9 * figureHeight } } : pc));
}

const fade = (shapes: Shape[], k: number): Shape[] => shapes.map((sh) => ({ ...sh, alpha: (sh.alpha ?? 1) * k }) as Shape);

function thunderstorm(p: Params, t: number, s: Stage): Shape[] {
  const H = s.height, top = str(p.color, "#2b2f36"), low = str(p.color2, "#565d68");
  const x = -BLEED, w = s.width + 2 * BLEED, horizon = s.groundY - 0.45 * H;
  const out: Shape[] = [
    { kind: "rect", x, y: -BLEED, w, h: BLEED + 1, fill: top },
    { kind: "rect", x, y: 0, w, h: s.groundY + 4, fill: top, fill2: low },
  ];
  const strikes = stormStrikes(p, s, t + 0.01).filter((k) => t >= k.t && t < k.t + BOLT);
  const boltColor = str(p.boltColor, "#dfe8ff");
  // far strikes first (behind the rain), then the rain, then near strikes and the flash
  for (const k of strikes.filter((q) => !q.near)) {
    const u = t - k.t;
    out.push({ kind: "rect", x, y: 0, w, h: horizon, fill: mixColor(top, "#ffffff", 0.25), alpha: 0.18 * clamp(1 - u / 0.35, 0, 1) });
    out.push(...fade(bolt.draw({ t: u, duration: BOLT, fps: 24, at: { x: k.x, y: horizon }, height: H * 0.45, groundY: horizon, stageWidth: s.width }, { color: boltColor, color2: "#ffffff", intensity: 0.6, size: 0.8, seed: k.seed }), 0.5));
  }
  out.push(...rain({ intensity: num(p.intensity, 1.3), wind: num(p.wind, 0.35), speed: num(p.speed, 1), seed: p.seed, color: str(p.rainColor, "#a9b8c9"), color2: "#d3dde8" } as Params, t, s));
  for (const k of strikes.filter((q) => q.near)) {
    const u = t - k.t, flash = Math.max(clamp(1 - Math.abs(u - 0.2) / 0.1, 0, 1), 0.7 * clamp(1 - Math.abs(u - 0.42) / 0.08, 0, 1));
    if (flash > 0) out.push({ kind: "rect", x, y: -BLEED, w, h: BLEED + s.groundY + 4, fill: "#f2f5ff", alpha: 0.45 * flash });
    out.push(...bolt.draw({ t: u, duration: BOLT, fps: 24, at: { x: k.x, y: s.groundY }, height: H, groundY: s.groundY, stageWidth: s.width }, { color: boltColor, color2: "#ffffff", intensity: 1.3, size: 1.4, seed: k.seed }));
  }
  return out;
}

export const STORM: BackgroundRecipe[] = [{
  id: "thunderstorm",
  about: "a whole THUNDERSTORM (use it instead of sky + rain + lightning): dark gray sky over the page, heavy slanted rain with splashes, lightning at random times about every 1-2 s — far strikes small and faint on the horizon, near ones big and bright with a white flash. `every` = average seconds between strikes (1.4), `near` = share that are close (0.4), `intensity` = rain (1.3), `wind`, `color`/`color2` = sky top/horizon, `boltColor`, `seed`. Add `ground` after it.",
  draw: (pc, t, s) => thunderstorm(pc.params ?? {}, t, s),
}];
