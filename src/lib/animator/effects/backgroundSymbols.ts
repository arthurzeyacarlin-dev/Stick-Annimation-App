// The Library symbols the MOVING BACKGROUND pieces place (STILL THINGS ARE SYMBOLS: a raindrop and a blown leaf
// keep their look from picture to picture and only move or turn). Their look is defined here; symbolMaker.ts
// registers them ("Raindrop", "Leaf") like the other placed symbols. Shapes are in the symbol's own box: x right,
// y down, from (0, 0) to (w, h).
import { mixColor } from "./random.ts";
import type { Shape } from "./types.ts";

// A RAINDROP: a long thin streak, its point (tail) at the top and its round head at the bottom, with a little
// glint on the head. Turned to its slant when placed (the head leads, the tail trails behind its fall).
export const RAINDROP_ASPECT = 0.12;
export function raindropShapes(w: number, h: number, color = "#bcd2e8", color2 = "#f3f8fd"): Shape[] {
  const cx = w / 2, r = w * 0.4, cy = h - r - w * 0.06;
  const points = [cx, h * 0.02, cx + r * 0.3, h * 0.45, cx + r * 0.8, cy - r * 1.4];
  for (let j = 0; j <= 6; j += 1) { const a = (j / 6) * Math.PI; points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  points.push(cx - r * 0.8, cy - r * 1.4, cx - r * 0.3, h * 0.45);
  return [
    { kind: "poly", points, fill: color, alpha: 0.85 },
    { kind: "line", points: [cx - r * 0.25, cy - r * 1.5, cx - r * 0.25, cy - r * 0.1], stroke: color2, width: r * 0.45, alpha: 0.9 },
  ];
}

// A LEAF: a pointed oval (point at the top, stem at the bottom) with a darker middle vein and stem.
export const LEAF_ASPECT = 0.6;
export function leafShapes(S: number, w: number, h: number, color = "#5aa646", color2?: string): Shape[] {
  const vein = color2 ?? mixColor(color, "#000000", 0.35), cx = w / 2, top = h * 0.04, bottom = h * 0.8;
  const left: number[] = [], right: number[] = [];
  for (let j = 0; j <= 10; j += 1) {
    const u = j / 10, y = top + u * (bottom - top), half = w * 0.46 * Math.pow(Math.sin(Math.PI * u), 0.75) * (1 - 0.25 * u);
    left.push(cx - half, y);
    right.unshift(cx + half, y); // (the right side, bottom to top)
  }
  return [
    { kind: "poly", points: [...left, ...right], fill: color, stroke: vein, width: S * 0.02 },
    { kind: "line", points: [cx, top + h * 0.08, cx, h * 0.97], stroke: vein, width: S * 0.035 },
  ];
}
