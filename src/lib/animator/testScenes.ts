import type { CharacterKey, Scene, SceneCharacter } from "./engine.ts";
import { forwardKinematics } from "./pose.ts";
import { DEFAULT_STYLE, STAND, STAND_FRONT, withPose, type CharacterStyle, type PoseAngles } from "./rig.ts";

// SPEC-0017 Phase 1: hand-written test scenes (no AI). Temporary review list; removed in Phase 5 cleanup.

const GROUND = 900;
const HEIGHT = 380;
const BOTH: ("lFoot" | "rFoot")[] = ["lFoot", "rFoot"];

const character = (id: string, name: string, facing: SceneCharacter["facing"], keys: CharacterKey[], options?: { height?: number; style?: Partial<CharacterStyle> }): SceneCharacter => ({
  id, name, facing, height: options?.height ?? HEIGHT, style: { ...DEFAULT_STYLE, ...options?.style }, keys,
});

// A full jump: crouch (anticipation) -> push off -> arc through the air -> land -> absorb -> stand.
function jumpKeys(x0: number, travel: number, timeScale = 1, delay = 0): CharacterKey[] {
  const at = (t: number) => delay + t * timeScale;
  const keys: CharacterKey[] = [
    { t: at(0), x: x0, pose: STAND, contacts: BOTH },
    { t: at(0.3), x: x0 - 8, pose: withPose(STAND, { lean: 28, head: -12, lShoulder: -45, rShoulder: -55, lElbow: 22, rElbow: 18, lHip: 76, rHip: 72, lKnee: 106, rKnee: 104 }), contacts: BOTH },
    { t: at(0.52), x: x0 + 10, pose: withPose(STAND, { lean: 12, head: -6, lShoulder: 150, rShoulder: 140, lElbow: 14, rElbow: 18, lHip: 4, rHip: 2, lKnee: 6, rKnee: 4 }), contacts: BOTH, xEase: "linear", liftEase: "out" },
    { t: at(0.8), x: x0 + 10 + travel / 2, lift: 150, pose: withPose(STAND, { lean: 6, head: -4, lShoulder: 120, rShoulder: 110, lElbow: 30, rElbow: 34, lHip: 58, rHip: 50, lKnee: 72, rKnee: 66 }), xEase: "linear", liftEase: "in" },
    { t: at(1.06), x: x0 + 10 + travel, lift: 0, pose: withPose(STAND, { lean: 10, lShoulder: 60, rShoulder: 50, lElbow: 20, rElbow: 24, lHip: 22, rHip: 18, lKnee: 26, rKnee: 22 }), contacts: BOTH },
    { t: at(1.26), x: x0 + 4 + travel, pose: withPose(STAND, { lean: 30, head: -14, lShoulder: 28, rShoulder: 16, lElbow: 34, rElbow: 30, lHip: 72, rHip: 70, lKnee: 98, rKnee: 96 }), contacts: BOTH },
    { t: at(1.55), x: x0 + 10 + travel, pose: withPose(STAND, { lean: 4, lKnee: 10, rKnee: 8, lHip: 8, rHip: 4 }), contacts: BOTH },
    { t: at(1.9), x: x0 + 10 + travel, pose: STAND, contacts: BOTH },
  ];
  return keys;
}

const holdUntil = (keys: CharacterKey[], t: number): CharacterKey[] => {
  const last = keys[keys.length - 1];
  return last.t >= t ? keys : [...keys, { ...last, t }];
};

const jumpScene: Scene = {
  id: "jump", title: "Jump", durationSec: 2.0, groundY: GROUND,
  characters: [character("a", "Jumper", "right", holdUntil(jumpKeys(800, 220), 2.0))],
};

const waveScene: Scene = (() => {
  const up = (elbow: number, shoulder = 145, head = 6): PoseAngles => withPose(STAND_FRONT, { rShoulder: shoulder, rElbow: elbow, head, lean: -3, lShoulder: 12 });
  const keys: CharacterKey[] = [
    { t: 0, x: 960, pose: STAND_FRONT, contacts: BOTH },
    { t: 0.35, x: 960, pose: withPose(STAND_FRONT, { rShoulder: 4, rElbow: 4 }), contacts: BOTH },
    { t: 0.9, x: 960, pose: up(30), contacts: BOTH },
    { t: 1.15, x: 960, pose: up(4, 150), contacts: BOTH },
    { t: 1.4, x: 960, pose: up(62, 140), contacts: BOTH },
    { t: 1.65, x: 960, pose: up(4, 150), contacts: BOTH },
    { t: 1.9, x: 960, pose: up(62, 140), contacts: BOTH },
    { t: 2.15, x: 960, pose: up(22, 146), contacts: BOTH },
    { t: 2.7, x: 960, pose: withPose(STAND_FRONT, { rShoulder: 30, rElbow: 18 }), contacts: BOTH },
    { t: 3.2, x: 960, pose: STAND_FRONT, contacts: BOTH },
  ];
  return { id: "wave", title: "Wave", durationSec: 3.2, groundY: GROUND, characters: [character("a", "Waver", "front", keys)] };
})();

const squatScene: Scene = (() => {
  const squat = withPose(STAND, { lean: 38, head: -26, lShoulder: 88, rShoulder: 78, lElbow: 12, rElbow: 16, lHip: 118, rHip: 116, lKnee: 135, rKnee: 133 });
  const keys: CharacterKey[] = [
    { t: 0, x: 960, pose: STAND, contacts: BOTH },
    { t: 0.4, x: 960, pose: STAND, contacts: BOTH },
    { t: 1.5, x: 948, pose: squat, contacts: BOTH },
    { t: 2.0, x: 947, pose: withPose(squat, { lKnee: 138, rKnee: 136, lHip: 120, rHip: 118 }), contacts: BOTH },
    { t: 3.0, x: 960, pose: STAND, contacts: BOTH },
    { t: 3.3, x: 960, pose: STAND, contacts: BOTH },
  ];
  return { id: "squat", title: "Squat and stand", durationSec: 3.3, groundY: GROUND, characters: [character("a", "Squatter", "right", keys)] };
})();

const highFiveScene: Scene = (() => {
  const stance = { lHip: 20, rHip: -14, lKnee: 6, rKnee: 8 };
  const slap = withPose(STAND, { ...stance, lean: 7, head: -14, lShoulder: 136, lElbow: 6, rShoulder: -14, rElbow: 16 });
  // Place the figure so the raised hand reaches just short of the middle of the stage.
  const handOffset = forwardKinematics(slap, "right", { x: 0, y: 0 }, HEIGHT).lHand.x;
  const slapX = 960 - 5 - handOffset;
  const startX = slapX - 32;
  const keys: CharacterKey[] = [
    { t: 0, x: startX, pose: STAND, contacts: BOTH },
    { t: 0.35, x: startX - 4, pose: withPose(STAND, { lean: 6, lKnee: 16, rKnee: 18, lHip: 12, rHip: 10, lShoulder: -32, lElbow: 26 }), contacts: BOTH },
    { t: 0.6, x: startX + 14, pose: withPose(STAND, { lean: 8, lHip: 38, lKnee: 46, rHip: -10, rKnee: 8, lShoulder: 40, lElbow: 30, rShoulder: -20 }), contacts: ["rFoot"] },
    { t: 0.82, x: slapX - 6, pose: withPose(STAND, { ...stance, lean: 6, lShoulder: 112, lElbow: 26, rShoulder: -18 }), contacts: BOTH },
    { t: 1.02, x: slapX, pose: slap, contacts: BOTH },
    { t: 1.18, x: slapX - 6, pose: withPose(slap, { lShoulder: 146, lElbow: 34, lean: 2, head: -8 }), contacts: BOTH },
    // Bring the hand back toward the body (bent elbow) so the arms don't cross on the way down.
    { t: 1.45, x: slapX - 10, pose: withPose(STAND, { ...stance, lean: 1, lShoulder: 70, lElbow: 120 }), contacts: BOTH },
    { t: 1.8, x: slapX - 10, pose: withPose(STAND, { ...stance, lShoulder: 18, lElbow: 24 }), contacts: BOTH },
    { t: 2.2, x: slapX - 10, pose: withPose(STAND, stance), contacts: BOTH },
    { t: 2.5, x: slapX - 10, pose: withPose(STAND, stance), contacts: BOTH },
  ];
  const mirrored = keys.map((key) => ({ ...key, x: 1920 - key.x }));
  return {
    id: "high-five", title: "Two figures high-five", durationSec: 2.5, groundY: GROUND,
    characters: [
      character("a", "Red", "right", keys, { style: { color: "#d23a52" } }),
      character("b", "Blue", "left", mirrored, { style: { color: "#1f5fbf" } }),
    ],
  };
})();

const fastSlowScene: Scene = (() => {
  const height = 330;
  return {
    id: "fast-slow", title: "Fast vs slow", durationSec: 2.6, groundY: GROUND,
    characters: [
      character("fast", "Fast", "right", holdUntil(jumpKeys(720, 0, 0.62), 2.6), { height }),
      character("slow", "Slow", "right", holdUntil(jumpKeys(1180, 0, 1.3), 2.6), { height }),
    ],
  };
})();

export const ENGINE_TEST_SCENES: Scene[] = [jumpScene, waveScene, squatScene, highFiveScene, fastSlowScene];
