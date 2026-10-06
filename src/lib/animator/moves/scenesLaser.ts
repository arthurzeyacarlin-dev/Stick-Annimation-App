import type { ScenePlan } from "./plan.ts";

// LASER EYES review scene (SPEC-0017 Phase 2C extras, 2026-10-06; Arthur's little sister asked for it): the laserEyes
// power (powerLaser.ts) on a 1920-wide page.

const HEIGHT = 300;
const GROUND = 900;
const STAGE = 1920;
const RED = "#e2461c";
const BLUE = "#2a6fdb";

// Red stands, charges (head dips, eyes glow) and zaps the ground in front of Blue; the beams sweep toward Blue,
// burning a scorch line. Blue sees it coming at his feet and hops back out of the way. Red stands a moment while
// the scorch cools and the last smoke rises.
export function laserEyesPlan(): ScenePlan {
  return {
    id: "powers-laser-eyes", title: "Laser eyes", height: HEIGHT, groundY: GROUND, stageWidth: STAGE,
    characters: [
      { id: "red", name: "Red", x: 640, facing: "right", look: { color: RED }, actions: [
        { move: "wait", params: { seconds: 0.5 } },
        { move: "laserEyes", params: { target: "blue", at: "ground", sweep: 110, seconds: 1.2 } },
        { move: "wait", params: { seconds: 1 } },
      ] },
      { id: "blue", name: "Blue", x: 1300, facing: "left", look: { color: BLUE }, actions: [
        { move: "jump", params: { distance: -120, height: 0.14 }, sync: { mark: "takeoff", at: "red.laserEyes1.hit", offset: 0.6 } },
      ] },
    ],
  };
}
