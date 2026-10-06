// HANDCUFFS (SPEC-0017 Phase 2C extras, 2026-10-06 — Arthur's little sister: "the engine has to know how to create a
// symbol for handcuffs"). STILL THINGS ARE SYMBOLS: the cuffs keep their look and only move and turn with the wrists,
// so they are ONE Library symbol ("Handcuffs", symbolMaker.ts PLACED_SYMBOLS) placed once per picture on a cuffed
// figure's wrists (moves/cuffs.ts adds the "handcuffs" track for every `cuffed` figure).
// WORN, NOT HELD (Arthur's sister, round 2: "they look like handcuffs someone is holding"): each cuff is a closed metal
// band WRAPPED AROUND A WRIST — the forearm passes through it — so from the side it is a narrow band standing across
// the wrist just above the hand, with its little hinge / ratchet bump. The two cuffs sit right next to each other
// (the wrists together behind the back), joined under the wrists by a very short chain of two links. Snug and small;
// steel gray with a dark edge and a light highlight. Drawn unfilled, so the arm shows through the band.
import { mixColor } from "./random.ts";
import type { EffectRecipe, Point, Shape } from "./types.ts";

// The metal colors: `color` = the steel, `color2` = its dark edge.
export const STEEL = "#9ea6b0";
export const STEEL_DARK = "#3f454d";

// The cuffs in their own box: x ALONG the forearm, y ACROSS it (the box height = the size). The forearm runs through
// the middle (y = 0.5); the chain hangs below it.
export const HANDCUFFS_ASPECT = 1.25;
// Made at this size (stage units, the box height); a placement's `scale` is x this.
export const HANDCUFFS_SIZE = 40;
// The parts, in fractions of the size (x along the forearm from the box's left edge, y across from its top): the two
// bands (middle, half length along / across the forearm) and the chain's ends and its low middle.
export const HANDCUFFS_PARTS = {
  bands: [{ x: 0.36, y: 0.5, rx: 0.1, ry: 0.36 }, { x: 0.89, y: 0.5, rx: 0.1, ry: 0.36 }],
  chain: { from: { x: 0.36, y: 0.8 }, mid: { x: 0.625, y: 0.88 }, to: { x: 0.89, y: 0.8 } },
} as const;

const oval = (cx: number, cy: number, rx: number, ry: number, turn = 0, n = 16): number[] => {
  const out: number[] = [], c = Math.cos(turn), s = Math.sin(turn);
  for (let i = 0; i < n; i += 1) { const a = (i / n) * 2 * Math.PI, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push(cx + x * c - y * s, cy + x * s + y * c); }
  return out;
};
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 8): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) { const a = a0 + ((a1 - a0) * i) / n; out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return out;
};

export function handcuffsShapes(size: number, _w: number, _h: number, color = STEEL, color2 = STEEL_DARK): Shape[] {
  const S = size, lw = S * 0.045, band = S * 0.1;
  const light = mixColor(color, "#ffffff", 0.75);
  const out: Shape[] = [];
  // The chain first (under the bands): two small links from under one cuff to under the other.
  const { from, mid, to } = HANDCUFFS_PARTS.chain;
  for (const [a, b] of [[from, mid], [mid, to]] as const) {
    const cx = ((a.x + b.x) / 2) * S, cy = ((a.y + b.y) / 2) * S, len = Math.hypot((b.x - a.x) * S, (b.y - a.y) * S);
    const turn = Math.atan2((b.y - a.y) * S, (b.x - a.x) * S);
    out.push({ kind: "poly", points: oval(cx, cy, len * 0.55, S * 0.055, turn), stroke: color2, width: S * 0.045 + lw });
    out.push({ kind: "poly", points: oval(cx, cy, len * 0.55, S * 0.055, turn), stroke: color, width: S * 0.045 });
  }
  // Each cuff: a narrow band standing across the wrist (dark edge, steel, a highlight down its front), and the hinge /
  // ratchet bump on top.
  for (const b of HANDCUFFS_PARTS.bands) {
    const cx = b.x * S, cy = b.y * S, rx = b.rx * S, ry = b.ry * S;
    out.push({ kind: "rect", x: cx - S * 0.075, y: cy - ry - S * 0.1, w: S * 0.15, h: S * 0.12, fill: color, stroke: color2, width: lw });
    out.push({ kind: "poly", points: oval(cx, cy, rx, ry), stroke: color2, width: band + 2 * lw });
    out.push({ kind: "poly", points: oval(cx, cy, rx, ry), stroke: color, width: band });
    out.push({ kind: "line", points: arc(cx, cy, rx, ry, -0.75 * Math.PI, -0.3 * Math.PI), stroke: light, width: band * 0.45 });
  }
  return out;
}

// WHERE THE CUFFS ARE in a picture, from the hand and the elbow of the cuffed (left) arm: the box lies along the
// forearm, its middle a little up the forearm from the hand (so the cuff nearer the hand sits just above it), turned
// so the chain hangs on the lower side. `chain` = the middle of the chain (where an escort holds the cuffs).
// `size` = the cuffs' size across the wrist, x the figure's height.
export const HANDCUFFS_ACROSS = 0.055;
export const WRIST_IN = 0.032; // x height: from the end of the hand up the forearm to the middle of the cuffs
export function handcuffsAt(hand: Point, elbow: Point, height: number, size = HANDCUFFS_ACROSS) {
  const dx = hand.x - elbow.x, dy = hand.y - elbow.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // Along the forearm; turned half round if that would hang the chain upward.
  let rotation = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (Math.cos((rotation * Math.PI) / 180) < 0) rotation += 180;
  const across = size * height, scale = across / HANDCUFFS_SIZE;
  const x = hand.x - ux * WRIST_IN * height, y = hand.y - uy * WRIST_IN * height;
  // A point of the box (fractions) in stage px.
  const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const at = (p: { x: number; y: number }) => {
    const bx = (p.x - HANDCUFFS_ASPECT / 2) * across, by = (p.y - 0.5) * across;
    return { x: x + bx * c - by * s, y: y + bx * s + by * c };
  };
  return { x, y, rotation, scale, across, at, chain: at(HANDCUFFS_PARTS.chain.mid) };
}

// The effect recipe that places the symbol on the wrists: `anchor` = the hand, `target` = the elbow.
export const HANDCUFFS_WIDTH = HANDCUFFS_ACROSS; // (the size knob: across the wrist, x height)
export const RECIPES: EffectRecipe[] = [{
  id: "handcuffs",
  about: "the Handcuffs symbol worn on a cuffed figure's wrists — added by itself for every `cuffed` figure (never add it by hand)",
  draw: (ctx, params) => {
    const hand = ctx.at, elbow = ctx.target ?? { x: hand.x, y: hand.y - 1 };
    const p = handcuffsAt(hand, elbow, ctx.height, Number(params.size ?? HANDCUFFS_ACROSS));
    return [{ kind: "symbol", name: "Handcuffs", x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, ...(typeof params.color === "string" ? { color: params.color } : {}), ...(typeof params.color2 === "string" ? { color2: params.color2 } : {}) }];
  },
}];
