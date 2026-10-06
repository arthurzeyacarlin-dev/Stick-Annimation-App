// SPEC-0017 Phase 2C extras: MOVING BACKGROUNDS review scenes (Effects (2C) test panel, review only). Each is a
// SCENE PLAN: one figure just standing (breathing) on the ground, and a background made of recipe pieces whose
// moving parts the engine animates (effects/backgrounds.ts: rain, trees and grass in the wind, waterfall).
import { DEFAULT_STYLE } from "../rig.ts";
import type { ScenePlan } from "./plan.ts";

const GROUND = 900, HEIGHT = 300;
const standing = (id: string, title: string, x: number, facing: "left" | "right", seconds: number): ScenePlan => ({
  id, title, height: HEIGHT, groundY: GROUND,
  characters: [{ id: "a", name: "Hero", x, facing, look: { color: DEFAULT_STYLE.color }, actions: [{ move: "stand", params: { seconds } }] }],
});

// RAINY, WINDY DAY: a dark stormy sky with still gray clouds, green hills; trees on both sides bending in the wind
// (gusts sweep across from left to right, a leaf blows off now and then), grass tufts bending, and rain slanting
// down and splashing on the ground. The figure stands in the middle.
export function rainyWindyDayPlan(): ScenePlan {
  const wind = 0.7;
  return {
    ...standing("fx-rainy-windy-day", "Rainy, windy day", 960, "right", 4),
    background: { seed: 4, pieces: [
      { kind: "sky", params: { time: "storm" } },
      { kind: "clouds", params: { count: 2, speed: 0, y: 400, h: 60, size: 0.9, color: "#6f7a87", color2: "#5b6572" } },
      { kind: "hills", params: { h: 230, color: "#4f7f4a", color2: "#6f8f80" } },
      { kind: "ground", params: { color: "#4a8040" } },
      { kind: "trees", params: { x: 330, w: 560, count: 2, size: 1.2, shape: "round", color: "#3c8a45", wind } },
      { kind: "trees", params: { x: 1640, w: 300, count: 1, size: 1.35, shape: "pine", color: "#357f3f", wind } },
      { kind: "grass", params: { count: 10, size: 0.13, wind, color: "#3a7a33" } },
      { kind: "rain", params: { intensity: 0.6, wind } },
    ] },
  };
}

// WATERFALL: a sunny day; a waterfall pours over a rocky cliff on the right into a pool, foaming and misting at the
// bottom, ripples spreading; still grass. The figure stands on the left of the pool, facing the waterfall.
export function waterfallPlan(): ScenePlan {
  return {
    ...standing("fx-waterfall", "Waterfall", 960, "right", 4),
    background: { seed: 6, pieces: [
      { kind: "sky", params: { time: "day" } },
      { kind: "clouds", params: { count: 3, speed: 0, y: 390, h: 70, size: 0.8 } },
      { kind: "hills", params: { h: 220 } },
      { kind: "ground" },
      { kind: "trees", params: { x: 420, w: 420, count: 2, size: 1.2, shape: "pine", sway: 0 } },
      { kind: "waterfall", params: { x: 1400, w: 180, y: GROUND - 520 } },
      { kind: "grass", params: { count: 14 } },
    ] },
  };
}
