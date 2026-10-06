// THE ICE CRYSTAL (SPEC-0017 Phase 2C, Arthur 2026-10-06: "a giant ice crystal is used like a water droplet — turn
// it into an ice symbol"). STILL THINGS ARE SYMBOLS: a crystal keeps its look and only moves, turns and changes size,
// so it is ONE Library symbol ("Ice crystal", symbolMaker.ts PLACED_SYMBOLS) placed once per picture — the pieces of
// a shattered ice mountain and the crystals a figure throws (effects/ice.ts) are all this one symbol.
// DRAWABLE BY HAND, NOT TOO SIMPLE: a faceted shard like a cut gem, point up — four flat faces (a light one, the ice
// color, a deeper one), a dark outline with its ridge line, and a white highlight. Seven simple shapes.
import { mixColor } from "./random.ts";
import type { Shape } from "./types.ts";

// The ice colors every ice recipe shares: ICE = the ice itself (light blue), ICE_DEEP = its dark edge (outlines,
// shaded faces, cracks), FROST = the pale mist.
export const ICE = "#86cdf3";
export const ICE_DEEP = "#2b6cb0";
export const FROST = "#e8f7ff";

// The shard in its own box (w = 0.55 x h): `color` = the ice, `color2` = its dark edge. Recolored by the knobs.
export const ICE_CRYSTAL_ASPECT = 0.55;
export function iceCrystalShapes(size: number, w: number, h: number, color = ICE, color2 = ICE_DEEP): Shape[] {
  const lw = size * 0.035, p = lw * 0.75;
  const P = (x: number, y: number): [number, number] => [x * w, y * h];
  const top = P(0.56, 0), right = P(1, 0.31), lowRight = P(0.84, 0.74), bottom = P(0.43, 1), lowLeft = P(0.1, 0.68), left = P(0, 0.33), mid = P(0.5, 0.52);
  // (Pull every corner in by the outline's half width, so the shard stays inside its box.)
  const inset = ([x, y]: [number, number]): [number, number] => [p + (x * (w - 2 * p)) / w, p + (y * (h - 2 * p)) / h];
  const [T, R, LR, B, LL, L, M] = [top, right, lowRight, bottom, lowLeft, left, mid].map(inset);
  const poly = (...pts: [number, number][]) => pts.flat();
  const light = mixColor(color, "#ffffff", 0.62), deep = mixColor(color, color2, 0.42);
  return [
    { kind: "poly", points: poly(T, L, M), fill: light }, // the lit face (light from the top left)
    { kind: "poly", points: poly(T, R, M), fill: color },
    { kind: "poly", points: poly(L, LL, B, M), fill: mixColor(color, light, 0.35) },
    { kind: "poly", points: poly(M, R, LR, B), fill: deep }, // the shaded face
    { kind: "poly", points: poly(T, R, LR, B, LL, L), stroke: color2, width: lw }, // the outline (facet edges meet it)
    { kind: "line", points: [...poly(T, M), ...poly(M, B)], stroke: mixColor(color2, color, 0.35), width: lw * 0.55 }, // the ridge
    { kind: "line", points: [T[0] - w * 0.1, T[1] + h * 0.14, L[0] + w * 0.16, L[1] + h * 0.02], stroke: "#ffffff", width: lw * 0.9, alpha: 0.95 }, // the highlight
  ];
}

// THE ICE SPIKE (Arthur, 2026-10-06: the mountain's spikes "all look basically the same", so each spike is a Library
// symbol). One jagged shard standing on its base, leaning a little to the right (flip it to lean left): a few broken
// SHELVES down each side, the lit face left of the ridge, a facet line, a white highlight, a dark outline. An ice
// mountain is many "Ice spike" placements: each grows by scaling up, sized, slightly turned and flipped.
// ICE_SPIKE: its corners in a unit box (x 0..1 across, y 0..1 down, the base on y = 1); `outline` is the whole shape.
export const ICE_SPIKE_ASPECT = 0.48;
export const ICE_SPIKE = (() => {
  type P = { x: number; y: number };
  const bl = { x: 0, y: 1 }, br = { x: 1, y: 1 }, tip = { x: 0.62, y: 0 };
  // (in the unit box a step "out" is measured in widths, so the shelves stick out the same on any spike)
  const edge = (from: P, out: number, a: number, b: number): P[] => {
    const at = (f: number, push: number) => ({ x: from.x + (tip.x - from.x) * f - out * push, y: from.y + (tip.y - from.y) * f });
    return [at(a, 0.09), at(a + 0.05, -0.02), at(b, 0.06), at(b + 0.04, -0.01)];
  };
  const left = edge(bl, 1, 0.3, 0.64), right = edge(br, -1, 0.27, 0.6);
  const ridgeBase = { x: 0.55, y: 1 }, ridgeMid = { x: 0.6, y: 0.5 };
  const outline = [bl, ...left, tip, ...right.slice().reverse(), br];
  const along = (a: P, b: P, f: number) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  return {
    outline, tip, ridge: [tip, ridgeMid, ridgeBase], lit: [bl, ...left, tip, ridgeMid, ridgeBase],
    facet: [ridgeMid, along(br, tip, 0.34)],
    highlight: [0.5, 0.86].map((f) => { const q = along(bl, tip, f); return { x: q.x + 0.13 * (1 - f), y: q.y }; }),
  };
})();
export function iceSpikeShapes(size: number, w: number, h: number, color = ICE, color2 = ICE_DEEP): Shape[] {
  const lw = size * 0.012, p = lw * 0.75;
  // (the unit box → this box, pulled in by the outline's half width so it stays inside)
  const pts = (list: { x: number; y: number }[]) => list.flatMap((q) => [p + q.x * (w - 2 * p), p + q.y * (h - 2 * p)]);
  const edge = mixColor(color2, color, 0.4);
  return [
    { kind: "poly", points: pts(ICE_SPIKE.outline), fill: mixColor(color, color2, 0.12) },
    { kind: "poly", points: pts(ICE_SPIKE.lit), fill: mixColor(color, "#ffffff", 0.58) },
    { kind: "line", points: pts(ICE_SPIKE.ridge), stroke: edge, width: lw * 0.6, alpha: 0.8 },
    { kind: "line", points: pts(ICE_SPIKE.facet), stroke: edge, width: lw * 0.5, alpha: 0.7 },
    { kind: "line", points: pts(ICE_SPIKE.highlight), stroke: "#ffffff", width: lw * 0.9, alpha: 0.9 },
    { kind: "poly", points: pts(ICE_SPIKE.outline), stroke: color2, width: lw },
  ];
}

// THE ICE CRUMB: a little crystal chip (the small bits a shattering spike or crystal throws off) — an uneven
// five-sided chip with a lit face and an outline. Four shapes.
export function iceCrumbShapes(size: number, w: number, h: number, color = ICE, color2 = ICE_DEEP): Shape[] {
  const lw = size * 0.06, p = lw * 0.75;
  const pts = (list: [number, number][]) => list.flatMap(([x, y]) => [p + x * (w - 2 * p), p + y * (h - 2 * p)]);
  const chip: [number, number][] = [[0.38, 0], [0.92, 0.22], [1, 0.7], [0.5, 1], [0, 0.62]];
  return [
    { kind: "poly", points: pts(chip), fill: mixColor(color, color2, 0.25) },
    { kind: "poly", points: pts([[0.38, 0], [0.55, 0.5], [0, 0.62]]), fill: mixColor(color, "#ffffff", 0.6) },
    { kind: "poly", points: pts([[0.38, 0], [0.92, 0.22], [0.55, 0.5]]), fill: color },
    { kind: "poly", points: pts(chip), stroke: color2, width: lw },
  ];
}
