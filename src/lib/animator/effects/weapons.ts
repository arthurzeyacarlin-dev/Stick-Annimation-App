// HELD WEAPONS, CLASH SPARKS AND DULL HITS (SPEC-0017 Phase 2C extras, 2026-10-06 — Arthur: "two stick figures fight
// with swords"). STILL THINGS ARE SYMBOLS: a weapon keeps its look and only moves and turns with the hand, so it is
// ONE Library symbol ("Sword", "Bamboo stick", "Wooden stick", "Metal bat", "Baseball bat") placed once per picture
// along the holding forearm, the grip in the hand (moves/weapons.ts: the weapon table).
// CLASH SPARKS (Arthur: "when swords hit each other on a strong hit, a little yellow spark at the exact contact
// point... so it feels like metal"): a few short bright yellow/white streaks flying out of the contact point and a
// tiny white flash, gone in about a fifth of a second; on a light hit a smaller one — but EVERY clash shows one (Arthur, review 10). Not fire.
// A DULL HIT (wood on wood or metal): a little gray-brown dust and a chip or two, no sparks.
import { WEAPONS, weaponLine, weaponOf, type WeaponKind } from "../moves/weapons.ts";
import { clamp, mixColor, rand } from "./random.ts";
import type { EffectRecipe, Shape } from "./types.ts";

// The symbols are made this many stage px ACROSS (the box height); the box is `1 / across` times longer.
export const WEAPON_SYMBOL_ACROSS = 24;
export const weaponAspect = (kind: WeaponKind) => 1 / WEAPONS[kind].across;

const flat = (pts: [number, number][]) => pts.flatMap(([x, y]) => [x, y]);

// The weapon lying along x (butt at the left, tip at the right), y across, in a box w x h (h = the size).
export function weaponShapes(kind: WeaponKind, S: number, w: number, h: number, color?: string, color2?: string): Shape[] {
  const lw = Math.max(0.8, S * 0.05), my = h / 2;
  const dark = (c: string, k = 0.45) => mixColor(c, "#000000", k), light = (c: string, k = 0.6) => mixColor(c, "#ffffff", k);
  if (kind === "sword") {
    const steel = color ?? "#d5dbe2", gold = "#c9a227", grip = color2 ?? "#5a3a22";
    const g0 = 0.035 * w, g1 = 0.19 * w, guard = 0.2 * w, b0 = 0.215 * w, b1 = 0.92 * w;
    const out: Shape[] = [
      // the grip, wrapped (a few diagonal turns of the wrap)
      { kind: "rect", x: g0, y: my - 0.16 * h, w: g1 - g0, h: 0.32 * h, fill: grip, stroke: dark(grip), width: lw },
      // the blade: straight edges tapering to the point, a dark edge line
      { kind: "poly", points: flat([[b0, my - 0.2 * h], [b1, my - 0.17 * h], [w - lw, my], [b1, my + 0.17 * h], [b0, my + 0.2 * h]]), fill: steel, stroke: dark(steel, 0.5), width: lw },
      // the fuller (the groove down the middle) and the bright highlight along the top edge
      { kind: "line", points: [b0 + 0.02 * w, my + 0.02 * h, 0.72 * w, my + 0.02 * h], stroke: dark(steel, 0.25), width: 0.06 * h },
      { kind: "line", points: [b0 + 0.02 * w, my - 0.1 * h, 0.9 * w, my - 0.09 * h], stroke: "#ffffff", width: 0.07 * h, alpha: 0.9 },
      // the crossguard, standing across the blade
      { kind: "rect", x: guard - 0.012 * w, y: 0.05 * h, w: 0.028 * w, h: 0.9 * h, fill: gold, stroke: dark(gold), width: lw },
      // the round pommel
      { kind: "circle", x: g0, y: my, r: 0.22 * h, fill: gold, stroke: dark(gold), width: lw },
    ];
    for (let k = 1; k < 5; k += 1) { const x = g0 + ((g1 - g0) * k) / 5; out.splice(1, 0, { kind: "line", points: [x - 0.012 * w, my - 0.15 * h, x + 0.012 * w, my + 0.15 * h], stroke: dark(grip, 0.3), width: lw * 0.8 }); }
    return out;
  }
  if (kind === "bambooStick" || kind === "woodenStick") {
    const wood = color ?? (kind === "bambooStick" ? "#c8b45a" : "#9b6b3d"), r = 0.42 * h;
    const out: Shape[] = [
      { kind: "poly", points: flat([[lw, my - r], [w - lw, my - r * 0.9], [w - lw, my + r * 0.9], [lw, my + r]]), fill: wood, stroke: dark(wood), width: lw },
      { kind: "line", points: [2 * lw, my - r * 0.45, w - 2 * lw, my - r * 0.4], stroke: light(wood, 0.35), width: 0.12 * h },
    ];
    // bamboo: the nodes (rings); a wooden stick: a little grain
    if (kind === "bambooStick") for (let k = 1; k < 5; k += 1) { const x = (w * k) / 5; out.push({ kind: "line", points: [x, my - r * 1.08, x, my + r * 1.08], stroke: dark(wood, 0.35), width: lw * 1.6 }); }
    else out.push({ kind: "line", points: [0.2 * w, my + r * 0.3, 0.55 * w, my + r * 0.35, 0.8 * w, my + r * 0.2], stroke: dark(wood, 0.3), width: lw * 0.7 });
    return out;
  }
  // bats: a thin handle with a knob, widening to a round barrel; metal (with grip tape) or wood
  const metal = kind === "metalBat", body = color ?? (metal ? "#a9b1ba" : "#c99a5b"), tape = color2 ?? "#2b2b2b";
  const out: Shape[] = [
    { kind: "poly", points: flat([[0.04 * w, my - 0.15 * h], [0.35 * w, my - 0.16 * h], [0.6 * w, my - 0.38 * h], [w - 0.06 * h, my - 0.44 * h], [w - lw, my], [w - 0.06 * h, my + 0.44 * h], [0.6 * w, my + 0.38 * h], [0.35 * w, my + 0.16 * h], [0.04 * w, my + 0.15 * h]]), fill: body, stroke: dark(body), width: lw },
    { kind: "line", points: [0.4 * w, my - 0.12 * h, 0.95 * w, my - 0.28 * h], stroke: light(body, 0.55), width: 0.08 * h, alpha: 0.85 },
    { kind: "circle", x: 0.035 * w, y: my, r: 0.24 * h, fill: metal ? tape : body, stroke: dark(body), width: lw },
  ];
  if (metal) out.splice(1, 0, { kind: "rect", x: 0.05 * w, y: my - 0.17 * h, w: 0.25 * w, h: 0.34 * h, fill: tape, stroke: dark(tape), width: lw });
  return out;
}

// Where the weapon symbol goes in a picture: along the forearm (hand at `at`, elbow at `target`), the grip in the hand.
export function weaponPlacement(kind: WeaponKind, hand: { x: number; y: number }, elbow: { x: number; y: number }, height: number) {
  const weapon = WEAPONS[kind], line = weaponLine(hand, elbow, height, weapon);
  const scale = line.L / (weaponAspect(kind) * WEAPON_SYMBOL_ACROSS);
  return { x: line.middle.x, y: line.middle.y, rotation: line.rotation, scale };
}

const YELLOW = "#ffd23f", HOT = "#fff6c8";

export const RECIPES: EffectRecipe[] = [
  {
    id: "heldWeapon",
    about: "a held weapon (`weapon`: sword, bambooStick, woodenStick, metalBat, baseballBat — moves/weapons.ts) drawn as its Library symbol along the holding forearm, the grip in the hand: `anchor` = the holding hand, `target` = that arm's elbow (added by the weapon fight for every armed fighter)",
    draw: (ctx, params) => {
      const kind = weaponOf(params.weapon).kind, elbow = ctx.target ?? { x: ctx.at.x - 1, y: ctx.at.y };
      const p = weaponPlacement(kind, ctx.at, elbow, ctx.height);
      return [{ kind: "symbol", name: WEAPONS[kind].symbol, x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, ...(typeof params.color === "string" ? { color: params.color } : {}) }];
    },
  },
  {
    id: "clashSpark",
    about: "metal meeting metal: a cartoon CLASH SPARK at the contact point (`anchor`) — a small bright '+' star in the middle, a broken curved flash ring around it, and 4-5 thick short rays shooting out (one with an arrow tip), all yellow; it pops at full size, the rays fly a little further out and it fades, gone in about 0.2 s; `size` 1 = a strong hit (about a third of a body height across), ~0.6 = a light one (smaller, still clearly visible: every clash shows one). Never fire.",
    draw: (ctx, params) => {
      // CLASH SPARKS (Arthur, Oct 7: his drawing — "make them a little bigger, it's hard to see them ... draw cool sparks like
      // my screenshot"): thick yellow marker strokes — a '+' in the middle, a broken ring around it, rays shooting out.
      const size = clamp(Number(params.size ?? 1), 0.1, 1.5), seed = Number(params.seed ?? 1), H = ctx.height;
      const u = clamp(ctx.t / Math.max(0.01, ctx.duration), 0, 1), out: Shape[] = [];
      const R = (0.09 + 0.1 * size) * H, cx = ctx.at.x, cy = ctx.at.y;
      const turn = (rand(seed, 0, 9) - 0.5) * 0.9; // (each spark turned a little differently)
      const alpha = u < 0.5 ? 1 : clamp(1 - (u - 0.5) / 0.5, 0, 1);
      const width = Math.max(2.5, 0.12 * R);
      const at = (angle: number, r: number) => [cx + Math.cos(angle + turn) * r, cy + Math.sin(angle + turn) * r];
      const stroke = (points: number[], color = YELLOW, w = width) => out.push({ kind: "line", points, stroke: color, width: w, alpha });
      // the very first moment: a white-hot flash in the middle
      const flash = clamp(1 - ctx.t / 0.06, 0, 1);
      if (flash > 0) out.push({ kind: "circle", x: cx, y: cy, r: 0.3 * R * (0.7 + 0.3 * flash), fill: HOT, alpha: 0.8 * flash });
      // the '+' star in the middle
      const plus = 0.17 * R * (1 + 0.15 * u);
      stroke([...at(0, plus), ...at(Math.PI, plus)]);
      stroke([...at(Math.PI / 2, plus), ...at(-Math.PI / 2, plus)]);
      // the broken flash ring: a long curve over the top and a short one at the lower left (opening out a little)
      const ring = 0.42 * R * (1 + 0.25 * u);
      const arc = (from: number, to: number) => { const pts: number[] = []; for (let k = 0; k <= 8; k += 1) pts.push(...at(from + ((to - from) * k) / 8, ring)); return pts; };
      stroke(arc(Math.PI * 1.02, Math.PI * 1.88));
      stroke(arc(Math.PI * 0.62, Math.PI * 0.86));
      // the rays: thick and short, starting clear of the ring, flying a little further out as it goes
      const rays = size >= 0.5 ? 5 : 4;
      const base = [-Math.PI / 2, -0.12, Math.PI * 0.32, Math.PI * 0.97, Math.PI * 1.22];
      for (let i = 0; i < rays; i += 1) {
        const a = base[i] + (rand(seed, i, 4) - 0.5) * 0.35;
        const r0 = (0.62 + 0.25 * u) * R, r1 = r0 + (0.36 + 0.12 * rand(seed, i, 5)) * R * (1 - 0.3 * u);
        stroke([...at(a, r0), ...at(a, r1)]);
        if (i === 0) {
          // the arrow tip on the first ray
          const tip = at(a, r1), back = 0.14 * R;
          stroke([...at(a - 0.28, r1 - back), ...tip, ...at(a + 0.28, r1 - back)]);
        }
      }
      return out;
    },
  },
  {
    id: "dullHit",
    about: "wood meeting wood or metal: a little gray-brown dust puff and a chip or two at the contact point (`anchor`), no sparks; `size` like clashSpark",
    draw: (ctx, params) => {
      const size = clamp(Number(params.size ?? 1), 0.1, 1.5), seed = Number(params.seed ?? 1), H = ctx.height;
      const u = clamp(ctx.t / Math.max(0.01, ctx.duration), 0, 1), out: Shape[] = [];
      for (let i = 0; i < 4; i += 1) {
        const a = rand(seed, i, 1) * 2 * Math.PI, d = (0.01 + 0.04 * u) * H * size * (0.6 + 0.4 * rand(seed, i, 2));
        out.push({ kind: "circle", x: ctx.at.x + Math.cos(a) * d, y: ctx.at.y + Math.sin(a) * d - 0.02 * H * u * size, r: (0.008 + 0.018 * u) * H * size, fill: "#b9ab98", alpha: 0.5 * (1 - u) });
      }
      for (let i = 0; i < 2; i += 1) {
        const a = -Math.PI / 2 + (rand(seed, i, 4) - 0.5) * 2, d = 0.06 * H * size * u;
        const x = ctx.at.x + Math.cos(a) * d, y = ctx.at.y + Math.sin(a) * d + 0.08 * H * u * u * size, s = 0.008 * H * size;
        out.push({ kind: "poly", points: [x - s, y, x, y - s * 0.7, x + s, y + s * 0.3], fill: "#8a6239", alpha: 1 - u });
      }
      return out;
    },
  },
];
