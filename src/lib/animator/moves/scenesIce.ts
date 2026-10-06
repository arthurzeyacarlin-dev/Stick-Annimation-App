import type { ScenePlan } from "./plan.ts";

// ICE review scenes (SPEC-0017 Phase 2C, 2026-10-06): the ice powers (powerIce.ts) on a 1920-wide page.

const HEIGHT = 300;
const GROUND = 900;
const STAGE = 1920;
const RED = "#e2461c";
const BLUE = "#2a6fdb";

// ICE MOUNTAIN: Red lifts his hand and a row of ice spikes runs along the ground toward Blue, small to big; Blue sees
// it coming and jumps back just before the biggest spike bursts up where he stood (his take-off synced to the ice's
// `reach`). Red holds the ice up a moment, brings his hand down, and the ice cracks and shatters; he stands and
// watches the pieces fall and fade (the scene lasts until they are gone).
export function iceMountainPlan(): ScenePlan {
  return {
    id: "powers-ice-mountain", title: "Ice mountain", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [
      { id: "red", name: "Red", x: 560, facing: "right", look: { color: RED }, actions: [
        { move: "wait", params: { seconds: 0.5 } },
        { move: "iceMountain", params: { target: "blue", seconds: 1 } },
        { move: "wait", params: { seconds: 0.6 } },
      ] },
      { id: "blue", name: "Blue", x: 1360, facing: "left", look: { color: BLUE }, actions: [
        { move: "jump", params: { distance: -0.9 * HEIGHT, height: 0.3 }, sync: { mark: "takeoff", at: "red.iceMountain1.reach", offset: -0.15 } },
      ] },
    ],
  };
}

// ICE CRYSTALS: Red throws ice crystals at Blue, who raises a water shield in time; the crystals hit the shield's edge
// and shatter, and Blue is pushed back a little and holds.
export function iceThrowPlan(): ScenePlan {
  return {
    id: "powers-ice-crystals", title: "Ice crystals", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [
      { id: "red", name: "Red", x: 560, facing: "right", look: { color: RED }, actions: [
        { move: "wait", params: { seconds: 0.6 } },
        { move: "iceThrow", params: { target: "blue" } },
      ] },
      { id: "blue", name: "Blue", x: 1360, facing: "left", look: { color: BLUE }, actions: [
        { move: "waterShield", params: { seconds: 1.8 }, sync: { mark: "hold", at: "red.iceThrow1.release", offset: -0.35 } },
      ] },
    ],
  };
}
