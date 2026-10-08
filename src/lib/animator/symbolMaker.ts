// ORIGINAL SYMBOLS (SPEC-0017 Phase 2C): "the engine builds new props from simple shapes (circles, lines,
// polygons) and names them ('Spike', 'Box', 'Bat'). They become normal Library symbols."
//
// Like the moves and the effects, a symbol is made by RULES, never a drawn picture:
// - built-in RECIPES (spike, box, tree, bat, rock, star, sword, shield, torch) put a few simple shapes
//   together (a crate = a square, a frame and planks; a torch = a handle, a cup and a flame);
// - the GENERIC builder takes a list of simple PARTS (circle, rect, triangle, polygon, line, star) with a
//   color, place, size and turn, so the AI can describe a prop nobody taught it ("a lollipop" = a stick
//   and a circle on top);
// - inventSymbol(name, seed) combines parts by simple rules (a handle + a head, a body + details, a stack,
//   a ring + spokes) for fun originals nobody described.
// The same request (and seed) always gives the same shapes. Shapes are effects/types.ts Shapes in the
// symbol's own box: x right, y down, from (0, 0) to (width, height); draw them with effects/draw.ts
// drawShapes. animation/animatorSceneSymbolsV1.ts turns a made symbol into a normal Library symbol.
import { clamp, mixColor, rand } from "./effects/random.ts";
import { ICE_CRYSTAL_ASPECT, ICE_SPIKE_ASPECT, iceCrumbShapes, iceCrystalShapes, iceSpikeShapes } from "./effects/iceCrystal.ts";
import { LASER_EYE_SIZE, laserEyeShapes } from "./effects/laserEye.ts";
import { LEAF_ASPECT, leafShapes, RAINDROP_ASPECT, raindropShapes } from "./effects/backgroundSymbols.ts";
import { HANDCUFFS_ASPECT, HANDCUFFS_SIZE, handcuffsShapes } from "./effects/handcuffs.ts";
import { CAP_ASPECT, CAP_SIZE, CHIP, GRENADE_ASPECT, GRENADE_SIZE, grenadeShapes, militaryCapShapes, PEBBLE_ASPECT, PEBBLE_SIZE, pebbleShapes, PLANK, woodChipShapes, woodPlankShapes } from "./effects/explosion.ts";
import { WEAPON_SYMBOL_ACROSS, weaponAspect, weaponShapes } from "./effects/weapons.ts";
import type { Shape } from "./effects/types.ts";

export type SymbolPartShape = "circle" | "rect" | "triangle" | "polygon" | "line" | "star";

// One simple part. Places and sizes are fractions of the symbol's size (its height): x 0..1 across the
// box's width, y 0..1 down, both the part's middle. `size` = diameter / width; `h` = height (rect,
// triangle; default = size); a line goes from (x, y) to (x2, y2) (or is `size` long, turned by `rotation`).
export type SymbolPart = {
  shape: SymbolPartShape;
  x?: number;
  y?: number;
  size?: number;
  h?: number;
  x2?: number;
  y2?: number;
  rotation?: number; // degrees, clockwise
  sides?: number; // polygon (3..12); star points (4..12)
  points?: number[]; // polygon: its own corners [x0, y0, x1, y1, ...] (fractions), instead of `sides`
  color?: string;
  outline?: string | false; // default: a darker shade of the color; false = none
  width?: number; // line thickness (fraction of size)
};

export type SymbolRequest = {
  name: string;
  kind?: string; // a recipe id (spike, box, tree, bat, rock, star, sword, shield, torch); default: from the name
  color?: string;
  color2?: string;
  size?: number; // height in stage units (default 100)
  seed?: number;
  parts?: SymbolPart[]; // the generic builder (used when given)
  aspect?: number; // generic builder: box width / height (default: fitted to the parts)
};

export type MadeSymbol = { name: string; shapes: Shape[]; width: number; height: number };

const DEFAULT_SIZE = 100;
const shade = (color: string, k = 0.45) => mixColor(color, "#000000", k);
const tint = (color: string, k = 0.35) => mixColor(color, "#ffffff", k);
const flat = (pts: [number, number][]) => pts.flatMap(([x, y]) => [x, y]);

// ---- Built-in recipes --------------------------------------------------------------------------
// Each draws inside its own box (w x h, in stage units, h = size).
type RecipeKnobs = { size: number; seed: number; color?: string; color2?: string };
type Recipe = { about: string; aspect: number; draw: (k: RecipeKnobs, w: number, h: number) => Shape[] };

const line = (S: number) => S * 0.03;

export const SYMBOL_RECIPES: Record<string, Recipe> = {
  spike: {
    about: "a row of sharp metal spikes on a base plate (a trap)",
    aspect: 1.2,
    draw: ({ size: S, seed, color = "#9aa3ad", color2 = "#5b6470" }, w, h) => {
      const lw = line(S), pad = lw;
      const count = 3 + Math.floor(rand(seed, 1) * 3); // 3..5 spikes
      const baseH = h * 0.18, spikeW = (w - 2 * pad) / count;
      const out: Shape[] = [{ kind: "rect", x: pad, y: h - pad - baseH, w: w - 2 * pad, h: baseH, fill: color2, stroke: shade(color2), width: lw }];
      for (let i = 0; i < count; i += 1) {
        const x0 = pad + i * spikeW, tip = pad + (h - 2 * pad - baseH) * (0.05 + 0.25 * rand(seed, i, 2));
        out.push({ kind: "poly", points: [x0, h - pad - baseH, x0 + spikeW / 2, tip, x0 + spikeW, h - pad - baseH], fill: color, stroke: shade(color), width: lw });
        out.push({ kind: "line", points: [x0 + spikeW / 2, tip + lw * 2, x0 + spikeW * 0.38, h - pad - baseH - lw], stroke: tint(color, 0.6), width: lw * 0.6 });
      }
      return out;
    },
  },
  box: {
    about: "a wooden crate: a square with a frame and planks",
    aspect: 1,
    draw: ({ size: S, seed, color = "#b07a3c", color2 }, w, h) => {
      const lw = line(S), pad = lw, frame = S * 0.12, dark = color2 ?? shade(color, 0.3);
      const x0 = pad, y0 = pad, x1 = w - pad, y1 = h - pad;
      const out: Shape[] = [{ kind: "rect", x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: color, stroke: shade(color), width: lw }];
      // planks (horizontal lines), a little uneven per seed
      for (let i = 1; i < 4; i += 1) {
        const y = y0 + ((y1 - y0) * i) / 4 + (rand(seed, i, 3) - 0.5) * S * 0.02;
        out.push({ kind: "line", points: [x0 + frame, y, x1 - frame, y], stroke: shade(color, 0.25), width: lw * 0.6 });
      }
      // the frame and the cross brace
      out.push({ kind: "rect", x: x0, y: y0, w: x1 - x0, h: frame, fill: dark, stroke: shade(color), width: lw * 0.7 });
      out.push({ kind: "rect", x: x0, y: y1 - frame, w: x1 - x0, h: frame, fill: dark, stroke: shade(color), width: lw * 0.7 });
      out.push({ kind: "rect", x: x0, y: y0, w: frame, h: y1 - y0, fill: dark, stroke: shade(color), width: lw * 0.7 });
      out.push({ kind: "rect", x: x1 - frame, y: y0, w: frame, h: y1 - y0, fill: dark, stroke: shade(color), width: lw * 0.7 });
      const flip = rand(seed, 9) < 0.5;
      out.push({ kind: "line", points: flip ? [x0 + frame, y0 + frame, x1 - frame, y1 - frame] : [x1 - frame, y0 + frame, x0 + frame, y1 - frame], stroke: dark, width: frame * 0.8 });
      // nails
      for (const [nx, ny] of [[x0, y0], [x1 - frame, y0], [x0, y1 - frame], [x1 - frame, y1 - frame]]) out.push({ kind: "circle", x: nx + frame / 2, y: ny + frame / 2, r: frame * 0.15, fill: "#3a3a3a" });
      return out;
    },
  },
  tree: {
    about: "a tree: a brown trunk and a round green top made of a few circles",
    aspect: 0.8,
    draw: ({ size: S, seed, color = "#3f9b45", color2 = "#7a5230" }, w, h) => {
      const lw = line(S), cx = w / 2;
      const trunkW = w * 0.18, trunkTop = h * 0.5;
      const out: Shape[] = [{ kind: "poly", points: [cx - trunkW / 2, h - lw, cx - trunkW * 0.35, trunkTop, cx + trunkW * 0.35, trunkTop, cx + trunkW / 2, h - lw], fill: color2, stroke: shade(color2), width: lw }];
      const r = w * 0.22;
      const blobs = [[0, 0.33], [-0.22, 0.42], [0.22, 0.42], [-0.12, 0.22], [0.12, 0.22]].map(([dx, dy], i) => ({
        x: cx + (dx + (rand(seed, i, 4) - 0.5) * 0.06) * w,
        y: h * dy + (rand(seed, i, 5) - 0.5) * 0.04 * h,
        r: r * (0.85 + 0.3 * rand(seed, i, 6)),
      }));
      for (const b of blobs) {
        // keep each blob inside the box
        const rr = Math.min(b.r, b.x - lw, w - lw - b.x, b.y - lw);
        out.push({ kind: "circle", x: b.x, y: b.y, r: rr, fill: color, stroke: shade(color), width: lw });
      }
      for (const [i, b] of blobs.slice(0, 3).entries()) out.push({ kind: "circle", x: b.x - b.r * 0.3, y: b.y - b.r * 0.3, r: b.r * 0.25, fill: tint(color, 0.3), alpha: 0.6 + 0.2 * rand(seed, i, 7) });
      return out;
    },
  },
  bat: {
    about: "a baseball bat: a thin handle with a knob, widening to a round barrel",
    aspect: 0.3,
    draw: ({ size: S, color = "#c99a5b", color2 = "#333333" }, w, h) => {
      const lw = line(S), cx = w / 2, knobR = w * 0.3, barrel = w * 0.42, handle = w * 0.14;
      const top = lw + barrel, bottom = h - lw - knobR * 2;
      const out: Shape[] = [
        { kind: "poly", points: [cx - handle, bottom, cx - handle, h * 0.6, cx - barrel, h * 0.25, cx - barrel, top, cx, lw, cx + barrel, top, cx + barrel, h * 0.25, cx + handle, h * 0.6, cx + handle, bottom], fill: color, stroke: shade(color), width: lw },
        { kind: "circle", x: cx, y: h - lw - knobR, r: knobR - lw / 2, fill: color, stroke: shade(color), width: lw },
      ];
      // grip tape
      for (let i = 0; i < 4; i += 1) { const y = bottom - (i + 0.5) * h * 0.05; out.push({ kind: "line", points: [cx - handle, y + h * 0.015, cx + handle, y - h * 0.015], stroke: color2, width: lw }); }
      out.push({ kind: "line", points: [cx - barrel * 0.45, h * 0.12, cx - barrel * 0.45, h * 0.32], stroke: tint(color, 0.5), width: lw });
      return out;
    },
  },
  rock: {
    about: "a rock: a lumpy grey shape (different lumps for each seed) with a crack",
    aspect: 1.3,
    draw: ({ size: S, seed, color = "#8c8c88" }, w, h) => {
      const lw = line(S), cx = w / 2, cy = h * 0.55, rx = w / 2 - lw * 1.5, ry = h * 0.45 - lw * 1.5;
      const n = 9;
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i += 1) {
        const a = Math.PI + (i / (n - 1)) * Math.PI; // the top half: left → over → right
        const k = 0.78 + 0.22 * rand(seed, i, 8);
        pts.push([cx + Math.cos(a) * rx * (0.9 + 0.1 * rand(seed, i, 9)), Math.min(h - lw, cy + Math.sin(a) * ry * k)]);
      }
      pts.push([w - lw * 1.5, h - lw * 1.5], [lw * 1.5, h - lw * 1.5]); // flat bottom on the ground
      const out: Shape[] = [{ kind: "poly", points: flat(pts), fill: color, stroke: shade(color), width: lw }];
      const crackX = cx + (rand(seed, 3, 10) - 0.5) * w * 0.3;
      out.push({ kind: "line", points: [crackX, h * 0.35, crackX + w * 0.05, h * 0.5, crackX - w * 0.02, h * 0.62], stroke: shade(color, 0.35), width: lw * 0.7 });
      out.push({ kind: "circle", x: cx - rx * 0.4, y: cy - ry * 0.35, r: Math.min(rx, ry) * 0.12, fill: tint(color, 0.4), alpha: 0.7 });
      return out;
    },
  },
  star: {
    about: "a five-pointed star with a shine",
    aspect: 1,
    draw: ({ size: S, color = "#f6c945" }, w, h) => {
      const lw = line(S);
      return [
        { kind: "poly", points: starPoints(w / 2, h * 0.53, h * 0.47 - lw, h * 0.2, 5, 0), fill: color, stroke: shade(color, 0.35), width: lw },
        { kind: "poly", points: starPoints(w / 2, h * 0.53, h * 0.18, h * 0.08, 5, 0), fill: tint(color, 0.5), alpha: 0.8 },
      ];
    },
  },
  sword: {
    about: "a sword: a pointed blade, a cross-guard, a grip and a round pommel",
    aspect: 0.4,
    draw: ({ size: S, color = "#cfd6de", color2 = "#7a4b2a" }, w, h) => {
      const lw = line(S), cx = w / 2, blade = w * 0.14, guardY = h * 0.68, gripEnd = h * 0.88, pommel = w * 0.12;
      return [
        { kind: "poly", points: [cx - blade, guardY, cx - blade, h * 0.14, cx, lw, cx + blade, h * 0.14, cx + blade, guardY], fill: color, stroke: shade(color), width: lw },
        { kind: "line", points: [cx, h * 0.12, cx, guardY - lw], stroke: shade(color, 0.2), width: lw * 0.6 },
        { kind: "rect", x: lw, y: guardY, w: w - 2 * lw, h: h * 0.05, fill: "#c9a227", stroke: shade("#c9a227"), width: lw },
        { kind: "rect", x: cx - w * 0.08, y: guardY + h * 0.05, w: w * 0.16, h: gripEnd - guardY - h * 0.05, fill: color2, stroke: shade(color2), width: lw },
        { kind: "circle", x: cx, y: h - lw - pommel, r: pommel, fill: "#c9a227", stroke: shade("#c9a227"), width: lw },
      ];
    },
  },
  shield: {
    about: "a shield: a pointed-bottom shield with a rim, a stripe and a round boss",
    aspect: 0.8,
    draw: ({ size: S, seed, color = "#2f5fb3", color2 = "#e8e8e8" }, w, h) => {
      const lw = line(S) * 1.5, p = lw;
      const outline = [p, p, w - p, p, w - p, h * 0.5, w / 2, h - p, p, h * 0.5];
      const inner = [w * 0.14, h * 0.1, w * 0.86, h * 0.1, w * 0.86, h * 0.48, w / 2, h * 0.86, w * 0.14, h * 0.48];
      const out: Shape[] = [
        { kind: "poly", points: outline, fill: color2, stroke: shade(color2, 0.6), width: lw },
        { kind: "poly", points: inner, fill: color, stroke: shade(color), width: lw * 0.6 },
      ];
      if (rand(seed, 2) < 0.5) out.push({ kind: "line", points: [w / 2, h * 0.11, w / 2, h * 0.85], stroke: color2, width: w * 0.08 });
      else out.push({ kind: "line", points: [w * 0.15, h * 0.3, w * 0.85, h * 0.3], stroke: color2, width: w * 0.08 });
      out.push({ kind: "circle", x: w / 2, y: h * 0.38, r: w * 0.11, fill: "#c9a227", stroke: shade("#c9a227"), width: lw * 0.6 });
      return out;
    },
  },
  torch: {
    about: "a torch: a wooden handle, a metal cup and a flame on top",
    aspect: 0.45,
    draw: ({ size: S, seed, color = "#ff7a1a", color2 = "#ffd84a" }, w, h) => {
      const lw = line(S), cx = w / 2, cupTop = h * 0.42, cupW = w * 0.36;
      const flame = (k: number, i: number): number[] => {
        const fw = (w / 2 - lw) * k, base = cupTop + h * 0.02, top = lw + (1 - k) * h * 0.18;
        const lean = (rand(seed, i, 11) - 0.5) * fw * 0.5;
        return [cx - fw, base, cx - fw * 0.85, base - h * 0.14, cx - fw * 0.3 + lean, base - h * 0.24, cx + lean, top, cx + fw * 0.45 + lean, base - h * 0.22, cx + fw * 0.85, base - h * 0.12, cx + fw, base];
      };
      return [
        { kind: "poly", points: [cx - w * 0.1, cupTop + h * 0.08, cx - w * 0.06, h - lw, cx + w * 0.06, h - lw, cx + w * 0.1, cupTop + h * 0.08], fill: "#7a4b2a", stroke: shade("#7a4b2a"), width: lw },
        { kind: "poly", points: flame(1, 1), fill: color, stroke: shade(color, 0.2), width: lw * 0.5, glow: S * 0.08 },
        { kind: "poly", points: flame(0.55, 2), fill: color2 },
        { kind: "poly", points: [cx - cupW / 2, cupTop, cx + cupW / 2, cupTop, cx + cupW * 0.35, cupTop + h * 0.1, cx - cupW * 0.35, cupTop + h * 0.1], fill: "#6d6d6d", stroke: shade("#6d6d6d"), width: lw },
      ];
    },
  },
  // STILL THINGS ARE SYMBOLS: the pieces the effect and background recipes place as Library symbols
  // (PLACED_SYMBOLS below), so their look is defined once, here.
  droplet: {
    about: "a water drop: one small flat teardrop, round end down and its point up (turn it so the point trails behind its motion)",
    aspect: 2 / 3.3,
    draw: ({ color = "#2f8fff" }, w, h) => {
      const r = Math.min(w / 2, h / 3.3), cx = w / 2, cy = h - r, back = -Math.PI / 2;
      const points = [cx + Math.cos(back) * r * 2.3, cy + Math.sin(back) * r * 2.3];
      for (let j = 0; j <= 8; j += 1) { const a = back + 0.7 + (j / 8) * (2 * Math.PI - 1.4); points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      return [{ kind: "poly", points, fill: color }];
    },
  },
  bulb: {
    about: "a light bulb: see-through round glass, a neck and a screw base (light drawn under it shows through)",
    aspect: 0.8,
    draw: ({ size: S, color = "#eef2f5", color2 = "#9a9a9a" }) => {
      const g = bulbGlass(S), lw = S * 0.04, r = g.r, top = g.y - r * 1.55;
      return [
        { kind: "poly", points: [g.x - r * 0.42, g.y - r * 0.85, g.x + r * 0.42, g.y - r * 0.85, g.x + r * 0.5, g.y - r * 0.55, g.x - r * 0.5, g.y - r * 0.55], fill: "#cfcfcf" },
        { kind: "rect", x: g.x - r * 0.45, y: top, w: r * 0.9, h: r * 0.72, fill: "#8a8a8a", stroke: "#555555", width: lw * 0.5 },
        { kind: "line", points: [g.x - r * 0.45, top + r * 0.24, g.x + r * 0.45, top + r * 0.24], stroke: "#5c5c5c", width: lw * 0.5 },
        { kind: "line", points: [g.x - r * 0.45, top + r * 0.48, g.x + r * 0.45, top + r * 0.48], stroke: "#5c5c5c", width: lw * 0.5 },
        { kind: "circle", x: g.x, y: g.y, r, fill: color, stroke: color2, width: lw, alpha: 0.55 },
        { kind: "circle", x: g.x - r * 0.38, y: g.y - r * 0.38, r: r * 0.2, fill: "#ffffff", alpha: 0.7 },
      ];
    },
  },
  onespike: {
    about: "one sharp metal spike on its strip of base (side by side they make a row of spikes)",
    aspect: 0.81,
    draw: ({ size: S, color = "#a7b0bb", color2 = "#4b5563" }, w, h) => {
      const b = spikeBody(S), base = h - b.pad, tipX = w / 2, tipY = b.pad;
      return [
        { kind: "rect", x: b.pad, y: base - b.height * 0.11, w: w - 2 * b.pad, h: b.height * 0.11, fill: color2 },
        { kind: "poly", points: [b.pad, base, w - b.pad, base, tipX, tipY], fill: color, stroke: color2, width: 2 * b.pad },
        { kind: "poly", points: [b.pad + b.width * 0.2, base - b.height * 0.067, tipX - b.height * 0.022, base - b.height * 0.067, tipX - b.height * 0.022, tipY + b.height * 0.15], fill: mixColor(color, "#ffffff", 0.55), alpha: 0.7 },
      ];
    },
  },
  crystal: {
    about: "an ice crystal: a faceted shard like a cut gem, point up — light blue and white faces, facet lines, a highlight (effects/iceCrystal.ts; color = the ice, color2 = its dark edge)",
    aspect: ICE_CRYSTAL_ASPECT,
    draw: ({ size: S, color, color2 }, w, h) => iceCrystalShapes(S, w, h, color, color2),
  },
  icespike: {
    about: "an ice spike: one jagged ice shard standing on its base, leaning a little right (flip it to lean left) — broken shelves down its sides, a lit face, a facet line, a white highlight (effects/iceCrystal.ts; color = the ice, color2 = its dark edge)",
    aspect: ICE_SPIKE_ASPECT,
    draw: ({ size: S, color, color2 }, w, h) => iceSpikeShapes(S, w, h, color, color2),
  },
  icecrumb: {
    about: "an ice crumb: a little crystal chip, the small bits shattering ice throws off (effects/iceCrystal.ts; color = the ice, color2 = its dark edge)",
    aspect: 1,
    draw: ({ size: S, color, color2 }, w, h) => iceCrumbShapes(S, w, h, color, color2),
  },
  lasereye: {
    about: "a glowing laser eye: a white-hot dot in a soft colored glow (effects/laserEye.ts; color = the glow, color2 = the middle)",
    aspect: 1,
    draw: ({ size: S, color, color2 }, w, h) => laserEyeShapes(S, w, h, color, color2),
  },
  raindrop: {
    about: "a falling raindrop: a long thin streak, its tail pointing up and a round head at the bottom with a glint (effects/backgroundSymbols.ts; color = the streak, color2 = the glint)",
    aspect: RAINDROP_ASPECT,
    draw: ({ color, color2 }, w, h) => raindropShapes(w, h, color, color2),
  },
  leaf: {
    about: "a leaf: a pointed oval with a darker middle vein and stem (effects/backgroundSymbols.ts; color = the leaf, color2 = the vein)",
    aspect: LEAF_ASPECT,
    draw: ({ size: S, color, color2 }, w, h) => leafShapes(S, w, h, color, color2),
  },
  handcuffs: {
    about: "handcuffs as worn, seen from the side: two narrow metal bands standing across the wrists (the forearm runs through them along the box), each with a hinge bump, joined underneath by a two-link chain (effects/handcuffs.ts; color = the steel, color2 = its dark edge)",
    aspect: HANDCUFFS_ASPECT,
    draw: ({ size: S, color, color2 }, w, h) => handcuffsShapes(S, w, h, color, color2),
  },
  grenade: {
    about: "a hand grenade: an olive-green oval body with a segmented (pineapple) grid, a shadow side and a highlight, the metal fuse on top, the spoon lever down its side and the pin ring (effects/explosion.ts; color = the body, color2 = its dark edge and grooves)",
    aspect: GRENADE_ASPECT,
    draw: ({ size: S, color, color2 }, w, h) => grenadeShapes(S, w, h, color, color2),
  },
  militarycap: {
    about: "a military cap worn on a head, seen from the side: a flat-topped olive crown with seams, a darker band and a short stiff peak pointing forward (right; flip it for left) (effects/explosion.ts; color = the cloth, color2 = its dark edge)",
    aspect: CAP_ASPECT,
    draw: ({ size: S, color, color2 }, w, h) => militaryCapShapes(S, w, h, color, color2),
  },
  // DEBRIS ARE SYMBOLS (explosions: they keep their shape while they fly; effects/explosion.ts).
  car: { about: "a car facing right: a red body with a hood, a cabin with two windows, two black wheels with hubs, a headlight (color = the body, color2 = the windows)", aspect: 2.2, draw: ({ size: S, color = "#e04040", color2 = "#bfe6ff" }, w, h) => {
    const lw = line(S), wr = h * 0.2, by = h * 0.78 - wr * 0.6;
    return [
      { kind: "poly", points: [w * 0.04, by, w * 0.04, h * 0.45, w * 0.3, h * 0.42, w * 0.38, h * 0.12, w * 0.68, h * 0.12, w * 0.8, h * 0.42, w * 0.96, h * 0.48, w * 0.97, by], fill: color, stroke: shade(color), width: lw },
      { kind: "poly", points: [w * 0.4, h * 0.18, w * 0.52, h * 0.18, w * 0.52, h * 0.4, w * 0.34, h * 0.4], fill: color2, stroke: shade(color), width: lw * 0.7 },
      { kind: "poly", points: [w * 0.56, h * 0.18, w * 0.66, h * 0.18, w * 0.75, h * 0.4, w * 0.56, h * 0.4], fill: color2, stroke: shade(color), width: lw * 0.7 },
      { kind: "circle", x: w * 0.93, y: h * 0.53, r: h * 0.05, fill: "#ffe680", stroke: shade(color), width: lw * 0.5 },
      ...[0.24, 0.76].flatMap((f): Shape[] => [{ kind: "circle", x: w * f, y: h - wr - lw, r: wr, fill: "#222222", stroke: "#000000", width: lw }, { kind: "circle", x: w * f, y: h - wr - lw, r: wr * 0.45, fill: "#bbbbbb" }]),
    ];
  } },
  moon: { about: "a full moon: a pale yellow-gray disc with a soft rim and craters (color = the moon, color2 = the craters)", aspect: 1, draw: ({ size: S, color = "#f2ecc8", color2 = "#d6cfa4" }, w, h) => [
    { kind: "circle", x: w / 2, y: h / 2, r: h * 0.46, fill: color, stroke: shade(color, 0.25), width: line(S) },
    ...[[0.36, 0.38, 0.1], [0.62, 0.3, 0.06], [0.58, 0.64, 0.12], [0.3, 0.66, 0.05]].map(([x, y, r]): Shape => ({ kind: "circle", x: w * x, y: h * y, r: h * r, fill: color2, stroke: shade(color2, 0.15), width: line(S) * 0.5 })),
  ] },
  plank: { about: "a broken wooden plank lying along x: a board with a dark edge, grain lines, a nail hole, one end square and one splintered (color = the wood, color2 = its edge)", aspect: PLANK.aspect, draw: ({ size: S, color, color2 }, w, h) => woodPlankShapes(S, w, h, color, color2) },
  woodchip: { about: "a small wood chip: a splinter pointed at both ends with a grain line (color = the wood, color2 = its edge)", aspect: CHIP.aspect, draw: ({ size: S, color, color2 }, w, h) => woodChipShapes(S, w, h, color, color2) },
  pebble: { about: "a pebble: a rough gray-brown stone with a shadow and a highlight (color = the stone, color2 = its edge)", aspect: PEBBLE_ASPECT, draw: ({ size: S, color, color2 }, w, h) => pebbleShapes(S, w, h, color, color2) },
  // HELD WEAPONS (effects/weapons.ts; moves/weapons.ts the weapon table): lying along x, butt left, tip right.
  heldsword: { about: "a held sword lying along x (pommel left, point right): round pommel, a wrapped grip, a crossguard standing across, a straight steel blade with a fuller and a bright highlight, tapering to the point", aspect: weaponAspect("sword"), draw: ({ size: S, color, color2 }, w, h) => weaponShapes("sword", S, w, h, color, color2) },
  bamboostick: { about: "a bamboo fighting stick lying along x: a long pale-green/tan rod with dark node rings", aspect: weaponAspect("bambooStick"), draw: ({ size: S, color, color2 }, w, h) => weaponShapes("bambooStick", S, w, h, color, color2) },
  woodenstick: { about: "a wooden fighting stick lying along x: a long brown rod with a highlight and a little grain", aspect: weaponAspect("woodenStick"), draw: ({ size: S, color, color2 }, w, h) => weaponShapes("woodenStick", S, w, h, color, color2) },
  metalbat: { about: "a metal bat lying along x: knob and taped handle at the left, widening to a round steel-gray barrel", aspect: weaponAspect("metalBat"), draw: ({ size: S, color, color2 }, w, h) => weaponShapes("metalBat", S, w, h, color, color2) },
  baseballbat: { about: "a wooden baseball bat lying along x: knob and handle at the left, widening to a round barrel", aspect: weaponAspect("baseballBat"), draw: ({ size: S, color, color2 }, w, h) => weaponShapes("baseballBat", S, w, h, color, color2) },
};
export const SYMBOL_RECIPE_IDS = Object.keys(SYMBOL_RECIPES);

// The "Light bulb" glass in its own box (size = the box height): its middle and radius.
export function bulbGlass(size: number) {
  const w = size * 0.8, lw = size * 0.04, r = (size - lw) / 2.55;
  return { w, h: size, r, x: w / 2, y: size - lw / 2 - r };
}
// The "Spike" body (the triangle, outline included) in its own box: `pad` all round, 0.8 as wide as tall.
export function spikeBody(size: number) {
  const pad = size * 0.025, height = size - 2 * pad;
  return { pad, height, width: size * 0.81 - 2 * pad };
}

// ---- Placed symbols (STILL THINGS ARE SYMBOLS) ---------------------------------------------------
// The named symbols effect and background recipes place with "symbol" shapes (effects/types.ts SymbolShape):
// a recipe and the size it is made at (stage units; a placement's `scale` is x this). The app adds each to
// the Library once (animation/animatorSceneSymbolsV1.ts) and places it once per picture.
export const PLACED_SYMBOLS: Record<string, { kind: string; size: number }> = {
  "Light bulb": { kind: "bulb", size: 100 },
  "Water droplet": { kind: "droplet", size: 33 }, // a round end of radius 10
  Spike: { kind: "onespike", size: 100 },
  "Ice crystal": { kind: "crystal", size: 60 },
  "Ice spike": { kind: "icespike", size: 100 },
  "Ice crumb": { kind: "icecrumb", size: 24 },
  "Laser eye": { kind: "lasereye", size: LASER_EYE_SIZE },
  Raindrop: { kind: "raindrop", size: 100 },
  Leaf: { kind: "leaf", size: 40 },
  Handcuffs: { kind: "handcuffs", size: HANDCUFFS_SIZE },
  Grenade: { kind: "grenade", size: GRENADE_SIZE },
  "Military cap": { kind: "militarycap", size: CAP_SIZE },
  "Wooden crate": { kind: "box", size: 100 }, // (before it breaks; then its pieces fly as Wood planks and chips)
  "Wood plank": { kind: "plank", size: PLANK.size },
  "Wood chip": { kind: "woodchip", size: CHIP.size },
  Pebble: { kind: "pebble", size: PEBBLE_SIZE },
  Car: { kind: "car", size: 100 }, // (moves/transform.ts: a figure turns into it)
  Moon: { kind: "moon", size: 100 },
  // (Held weapons, effects/weapons.ts: made WEAPON_SYMBOL_ACROSS px across.)
  Sword: { kind: "heldsword", size: WEAPON_SYMBOL_ACROSS },
  "Bamboo stick": { kind: "bamboostick", size: WEAPON_SYMBOL_ACROSS },
  "Wooden stick": { kind: "woodenstick", size: WEAPON_SYMBOL_ACROSS },
  "Metal bat": { kind: "metalbat", size: WEAPON_SYMBOL_ACROSS },
  "Baseball bat": { kind: "baseballbat", size: WEAPON_SYMBOL_ACROSS },
};
const placedCache = new Map<string, MadeSymbol>();
// The made symbol a "symbol" shape refers to (the same name and colors always give the same symbol).
export function placedSymbol(shape: { name: string; color?: string; color2?: string }): MadeSymbol {
  const key = JSON.stringify([shape.name, shape.color ?? null, shape.color2 ?? null]);
  let made = placedCache.get(key);
  if (!made) {
    const known = PLACED_SYMBOLS[shape.name];
    made = makeSymbol({ name: shape.name, kind: known?.kind, size: known?.size, color: shape.color, color2: shape.color2 });
    placedCache.set(key, made);
  }
  return made;
}

function starPoints(cx: number, cy: number, outer: number, inner: number, n: number, rotation: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 2 * n; i += 1) {
    const a = ((rotation - 90) * Math.PI) / 180 + (i * Math.PI) / n, r = i % 2 === 0 ? outer : inner;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

// ---- The generic builder: parts → shapes ---------------------------------------------------------
const turnPts = (pts: number[], cx: number, cy: number, deg: number) => {
  if (!deg) return pts;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) { const dx = pts[i] - cx, dy = pts[i + 1] - cy; out.push(cx + dx * c - dy * s, cy + dx * s + dy * c); }
  return out;
};

// One part in a box of `S` (the symbol's size), its fractions turned into stage units.
function partShapes(part: SymbolPart, S: number, palette: string[], i: number): Shape[] {
  const color = part.color ?? palette[i % palette.length];
  const stroke = part.outline === false ? undefined : part.outline ?? shade(color);
  const lw = line(S);
  const x = (part.x ?? 0.5) * S, y = (part.y ?? 0.5) * S, size = clamp(part.size ?? 0.3, 0.01, 4) * S, h = clamp(part.h ?? part.size ?? 0.3, 0.01, 4) * S;
  const rot = part.rotation ?? 0;
  switch (part.shape) {
    case "circle": return [{ kind: "circle", x, y, r: size / 2, fill: color, stroke, width: lw }];
    case "rect": return [{ kind: "poly", points: turnPts([x - size / 2, y - h / 2, x + size / 2, y - h / 2, x + size / 2, y + h / 2, x - size / 2, y + h / 2], x, y, rot), fill: color, stroke, width: lw }];
    case "triangle": return [{ kind: "poly", points: turnPts([x, y - h / 2, x + size / 2, y + h / 2, x - size / 2, y + h / 2], x, y, rot), fill: color, stroke, width: lw }];
    case "star": return [{ kind: "poly", points: starPoints(x, y, size / 2, size / 4.5, Math.round(clamp(part.sides ?? 5, 4, 12)), rot), fill: color, stroke, width: lw }];
    case "polygon": {
      if (part.points && part.points.length >= 6) return [{ kind: "poly", points: turnPts(part.points.map((v) => v * S), x, y, rot), fill: color, stroke, width: lw }];
      const n = Math.round(clamp(part.sides ?? 6, 3, 12)), pts: number[] = [];
      for (let k = 0; k < n; k += 1) { const a = ((rot - 90) * Math.PI) / 180 + (2 * Math.PI * k) / n; pts.push(x + (Math.cos(a) * size) / 2, y + (Math.sin(a) * size) / 2); }
      return [{ kind: "poly", points: pts, fill: color, stroke, width: lw }];
    }
    case "line": {
      const width = clamp(part.width ?? 0.05, 0.005, 1) * S;
      const pts = part.x2 !== undefined || part.y2 !== undefined
        ? [x, y, (part.x2 ?? part.x ?? 0.5) * S, (part.y2 ?? part.y ?? 0.5) * S]
        : turnPts([x, y - size / 2, x, y + size / 2], x, y, rot);
      return [{ kind: "line", points: pts, stroke: color, width }];
    }
  }
  return [];
}

// The box a list of shapes covers (strokes and line widths included).
export function shapeBounds(shapes: readonly Shape[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const see = (x: number, y: number, pad: number) => { minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad); minY = Math.min(minY, y - pad); maxY = Math.max(maxY, y + pad); };
  for (const s of shapes) {
    if (s.kind === "symbol") { // its box, turned any way
      const made = placedSymbol(s), half = (Math.hypot(made.width, made.height) / 2) * (s.scale ?? 1);
      see(s.x, s.y, half);
      continue;
    }
    const stroke = s.kind === "line" ? s.width / 2 : s.stroke ? (s.width ?? 2) / 2 : 0;
    if (s.kind === "circle") { see(s.x, s.y, s.r + stroke); continue; }
    if (s.kind === "rect") { see(s.x, s.y, stroke); see(s.x + s.w, s.y + s.h, stroke); continue; }
    for (let i = 0; i + 1 < s.points.length; i += 2) see(s.points[i], s.points[i + 1], stroke);
  }
  return { minX, minY, maxX, maxY };
}

const moveShape = (s: Shape, dx: number, dy: number): Shape =>
  s.kind === "circle" || s.kind === "rect" || s.kind === "symbol" ? { ...s, x: s.x + dx, y: s.y + dy } : { ...s, points: s.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };

// Parts → a symbol whose box fits them (a small margin all round).
function fromParts(name: string, parts: readonly SymbolPart[], S: number, palette: string[], aspect?: number): MadeSymbol {
  const shapes = parts.flatMap((part, i) => partShapes(part, S, palette, i));
  if (!shapes.length) throw new Error("symbol_parts_empty");
  const b = shapeBounds(shapes), margin = S * 0.02;
  let width = b.maxX - b.minX + 2 * margin, height = b.maxY - b.minY + 2 * margin;
  let dx = margin - b.minX, dy = margin - b.minY;
  if (aspect && aspect > 0) { // widen or heighten the box to the asked shape, the parts in the middle
    const want = Math.max(width, height * aspect);
    dx += (want - width) / 2; width = want;
    const wantH = Math.max(height, width / aspect);
    dy += (wantH - height) / 2; height = wantH;
  }
  return { name, shapes: shapes.map((s) => moveShape(s, dx, dy)), width, height };
}

// ---- Making a symbol ---------------------------------------------------------------------------
const PALETTE = ["#e4572e", "#2f5fb3", "#3f9b45", "#f6c945", "#8e44ad", "#17a2b8", "#ff7a1a", "#d63384", "#7a4b2a", "#9aa3ad"];

const recipeFor = (request: SymbolRequest) => {
  const id = (request.kind ?? request.name).trim().toLowerCase();
  if (SYMBOL_RECIPES[id]) return id;
  // "Crate" / "Baseball bat" / "Spike trap"...: a recipe word in the name.
  const words = id.split(/[^a-z]+/);
  const alias: Record<string, string> = { crate: "box", boulder: "rock", stone: "rock", spikes: "spike", trap: "spike", blade: "sword", flame: "torch" };
  for (const word of words) { if (SYMBOL_RECIPES[word]) return word; if (alias[word]) return alias[word]; }
  return undefined;
};

export function makeSymbol(request: SymbolRequest): MadeSymbol {
  const name = request.name.trim();
  if (!name) throw new Error("symbol_name_required");
  const S = clamp(Number.isFinite(request.size) ? request.size! : DEFAULT_SIZE, 8, 1000);
  const seed = Number.isFinite(request.seed) ? request.seed! : 1;
  if (request.parts?.length) {
    const palette = request.color ? [request.color, request.color2 ?? shade(request.color, 0.3)] : PALETTE;
    return fromParts(name, request.parts, S, palette, request.aspect);
  }
  const id = recipeFor(request);
  if (!id) return inventSymbol(name, seed, { size: S, color: request.color, color2: request.color2 });
  const recipe = SYMBOL_RECIPES[id];
  const width = S * recipe.aspect, height = S;
  return { name, shapes: recipe.draw({ size: S, seed, color: request.color, color2: request.color2 }, width, height), width, height };
}

// ---- Inventing an original ---------------------------------------------------------------------
// Simple rules that make a prop out of parts. The seed picks the rule, the shapes, the colors and the
// proportions, so every seed is a different thing (and the same seed always the same one).
const HEADS: SymbolPartShape[] = ["circle", "star", "triangle", "polygon", "rect"];
const BODIES: SymbolPartShape[] = ["circle", "rect", "polygon", "triangle"];

export function inventParts(seed: number, palette: string[] = PALETTE): { parts: SymbolPart[]; rule: string; aspect: number } {
  const r = (i: number, k = 0) => rand(seed + 0.5, i, k + 20);
  const pick = <T,>(list: readonly T[], i: number, k = 0) => list[Math.floor(r(i, k) * list.length) % list.length];
  const c1 = pick(palette, 1), c2 = pick(palette.filter((c) => c !== c1), 2), c3 = pick(palette.filter((c) => c !== c1 && c !== c2), 3);
  const rule = pick(["handle+head", "body+details", "stack", "ring+spokes"], 0);
  const parts: SymbolPart[] = [];
  if (rule === "handle+head") { // a wand, a mace, a lollipop, a hammer...
    const head = pick(HEADS, 4), headSize = 0.3 + 0.2 * r(5), headY = 0.08 + headSize / 2;
    parts.push({ shape: "line", x: 0.5, y: headY, x2: 0.5, y2: 0.97, color: c2, width: 0.05 + 0.04 * r(6) });
    if (head === "rect") parts.push({ shape: "rect", x: 0.5, y: headY, size: headSize * 1.6, h: headSize * 0.6, color: c1 });
    else parts.push({ shape: head, x: 0.5, y: headY, size: headSize, sides: 5 + Math.floor(r(7) * 4), rotation: Math.round(r(8) * 4) * 15, color: c1 });
    if (r(9) < 0.6) parts.push({ shape: "circle", x: 0.5, y: headY, size: headSize * 0.35, color: c3 });
    if (r(10) < 0.5) parts.push({ shape: "rect", x: 0.5, y: 0.82, size: 0.12, h: 0.04, color: c3 }); // a grip band
    return { parts, rule, aspect: 0 };
  }
  if (rule === "body+details") { // a robot head, a gift, a gem, a bug...
    const body = pick(BODIES, 4), bodySize = 0.7 + 0.25 * r(5);
    parts.push({ shape: body, x: 0.5, y: 0.5, size: bodySize, h: bodySize * (0.7 + 0.4 * r(6)), sides: 5 + Math.floor(r(7) * 4), color: c1 });
    const details = 2 + Math.floor(r(8) * 3);
    const kind = pick(["dots", "stripes", "eyes"], 9);
    for (let i = 0; i < details; i += 1) {
      const u = (i + 1) / (details + 1);
      if (kind === "dots") parts.push({ shape: "circle", x: 0.3 + 0.4 * r(11 + i), y: 0.32 + 0.36 * r(21 + i), size: 0.08 + 0.06 * r(31 + i), color: c2 });
      else if (kind === "stripes") parts.push({ shape: "line", x: 0.5 - bodySize * 0.3, y: 0.5 - bodySize * 0.3 + bodySize * 0.6 * u, x2: 0.5 + bodySize * 0.3, y2: 0.5 - bodySize * 0.3 + bodySize * 0.6 * u, color: c2, width: 0.04 });
      else if (i < 2) parts.push({ shape: "circle", x: 0.38 + 0.24 * i, y: 0.42, size: 0.14, color: "#ffffff" }, { shape: "circle", x: 0.39 + 0.24 * i, y: 0.43, size: 0.06, color: "#111111", outline: false });
    }
    if (kind === "eyes") parts.push({ shape: "line", x: 0.4, y: 0.62, x2: 0.6, y2: 0.62, color: "#111111", width: 0.03 });
    return { parts, rule, aspect: 0 };
  }
  if (rule === "stack") { // a snowman, a totem, a cake...
    const count = 2 + Math.floor(r(4) * 2);
    let y = 1;
    for (let i = 0; i < count; i += 1) {
      const s = (0.42 - 0.08 * i) * (0.85 + 0.3 * r(5 + i)), shape = pick(["circle", "rect", "polygon"] as const, 8 + i);
      parts.push({ shape, x: 0.5, y: y - s / 2, size: s, h: s, sides: 6, color: i % 2 === 0 ? c1 : c2 });
      y -= s * 0.92;
    }
    parts.push({ shape: pick(["star", "triangle", "circle"] as const, 12), x: 0.5, y: y - 0.06, size: 0.14, color: c3 });
    return { parts, rule, aspect: 0 };
  }
  // ring+spokes: a wheel, a gear, a sun...
  const spokes = 4 + Math.floor(r(4) * 5), ring = 0.6 + 0.25 * r(5);
  for (let i = 0; i < spokes; i += 1) {
    const a = (2 * Math.PI * i) / spokes, len = ring * (0.65 + 0.2 * r(6));
    parts.push({ shape: "line", x: 0.5, y: 0.5, x2: 0.5 + Math.cos(a) * len, y2: 0.5 + Math.sin(a) * len, color: c2, width: 0.05 });
  }
  parts.push({ shape: r(7) < 0.5 ? "circle" : "polygon", x: 0.5, y: 0.5, size: ring, sides: spokes * 2, color: c1 });
  parts.push({ shape: "circle", x: 0.5, y: 0.5, size: ring * 0.35, color: c3 });
  return { parts, rule, aspect: 0 };
}

// A fun original: `name` (or a made-up one when blank) and parts combined by the rules above.
export function inventSymbol(name: string, seed: number, knobs: { size?: number; color?: string; color2?: string } = {}): MadeSymbol {
  const palette = knobs.color ? [knobs.color, knobs.color2 ?? shade(knobs.color, 0.3), tint(knobs.color, 0.5)] : PALETTE;
  const { parts } = inventParts(seed, palette);
  const title = name.trim() || inventedName(seed);
  return fromParts(title, parts, clamp(knobs.size ?? DEFAULT_SIZE, 8, 1000), palette);
}

const NAME_A = ["Zap", "Moon", "Fizz", "Iron", "Star", "Glow", "Thunder", "Frost", "Lucky", "Turbo"];
const NAME_B = ["Wand", "Gizmo", "Totem", "Gear", "Charm", "Badge", "Orb", "Thing", "Rattle", "Token"];
export const inventedName = (seed: number) => `${NAME_A[Math.floor(rand(seed, 1, 40) * NAME_A.length)]} ${NAME_B[Math.floor(rand(seed, 2, 41) * NAME_B.length)]}`;
