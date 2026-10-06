import type { ScenePlan } from "./plan.ts";

// POWERS review scenes (SPEC-0017 Phase 2C): the power moves (powers.ts) on a 1920-wide page.

const HEIGHT = 300;
const GROUND = 900;
const STAGE = 1920;
// Fire is orange-red, water is blue.
const RED = "#e2461c";
const BLUE = "#2a6fdb";
const FIRE = { color: "#ff5a12", color2: "#ffd23a" };

// THE SISTER'S TEST (Arthur's sister): "a fire stick figure blasts fire, the blue one shields with water".
// Red does a fire blast at Blue; Blue raises a water shield in time — synced so the shield is up a little
// before Red's fire comes out (and so well before it arrives). The fire hits the shield's edge (steam where
// they meet), Blue is pushed back a little, braces, and holds.
export function sisterTestPlan(): ScenePlan {
  return {
    id: "powers-sister-test", title: "Sister's test: fire blast vs water shield", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [
      { id: "red", name: "Red", x: 560, facing: "right", look: { color: RED }, actions: [
        { move: "wait", params: { seconds: 0.6 } },
        { move: "fireBlast", params: { target: "blue", seconds: 1, ...FIRE } },
      ] },
      { id: "blue", name: "Blue", x: 1360, facing: "left", look: { color: BLUE }, actions: [
        { move: "waterShield", params: { seconds: 2.2 }, sync: { mark: "hold", at: "red.fireBlast1.release", offset: -0.3 } },
      ] },
    ],
  };
}

// One figure blasting fire across the page at nothing.
export function fireBlastPlan(): ScenePlan {
  return {
    id: "powers-fire-blast", title: "Fire blast", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [{ id: "red", name: "Red", x: 520, facing: "right", look: { color: RED }, actions: [{ move: "fireBlast", params: { distance: 800, ...FIRE } }] }],
  };
}

// Teleport across the page, then straight back — NO turning round first (Arthur: "you don't need to turn
// around — you can teleport wherever you want"): he faces right the whole time, even going back left.
export function teleportPlan(): ScenePlan {
  return {
    id: "powers-teleport", title: "Teleport", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [{ id: "a", name: "A", x: 560, facing: "right", actions: [
      { move: "teleport", params: { to: 1360 } },
      { move: "wait", params: { seconds: 0.4 } },
      { move: "teleport", params: { to: 760 } },
    ] }],
  };
}

// A water shield, alone.
export function waterShieldPlan(): ScenePlan {
  return {
    id: "powers-water-shield", title: "Water shield", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [{ id: "blue", name: "Blue", x: 960, facing: "right", look: { color: BLUE }, actions: [{ move: "waterShield", params: { seconds: 1.5 } }] }],
  };
}
