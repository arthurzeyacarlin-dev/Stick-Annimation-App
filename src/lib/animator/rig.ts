// SPEC-0017 stick-figure rig: joints, proportions, bend limits and style.
// Poses are stored as angles (degrees) so bones can never change length.

export type Facing = "left" | "right" | "front";

export type Point = { x: number; y: number };

export const JOINTS = ["hip", "neck", "head", "lElbow", "lHand", "rElbow", "rHand", "lKnee", "lFoot", "rKnee", "rFoot"] as const;
export type JointName = (typeof JOINTS)[number];
export type Skeleton = Record<JointName, Point>;

// Side view (facing right): angles grow toward the front. "Down the parent bone" is 0.
// - lean: torso tilt from vertical (forward +)
// - head: head tilt relative to the torso
// - shoulders/hips: upper arm / thigh relative to the torso's downward line (forward +)
// - elbows: forearm bends forward/up (+ only); knees: shin bends backward (+ only)
// Front view: lean tilts sideways; limbs swing outward (+) on their own side.
export const POSE_KEYS = ["lean", "head", "lShoulder", "rShoulder", "lElbow", "rElbow", "lHip", "rHip", "lKnee", "rKnee"] as const;
export type PoseKey = (typeof POSE_KEYS)[number];
export type PoseAngles = Record<PoseKey, number>;

// Fractions of the character's height. Standing height = thigh + shin + torso + neck + head diameter = 1.0.
export const PROPORTIONS = { torso: 0.3, neck: 0.1, upperArm: 0.16, forearm: 0.15, thigh: 0.23, shin: 0.23 } as const;
export const HEAD_RADIUS = { small: 0.055, normal: 0.07, large: 0.09 } as const;
export type HeadSize = keyof typeof HEAD_RADIUS;

// Shoulders turn freely (full circle). Everything else is clamped to these ranges.
export const JOINT_LIMITS: Record<Exclude<PoseKey, "lShoulder" | "rShoulder">, readonly [number, number]> = {
  lean: [-35, 70],
  head: [-30, 30],
  lElbow: [0, 150],
  rElbow: [0, 150],
  lHip: [-45, 130],
  rHip: [-45, 130],
  lKnee: [0, 150],
  rKnee: [0, 150],
};

// Look of a figure. The classic stick figure (Arthur, 2026-10-04) is the default: a solid head sitting
// right on top of the body, no neck. A hollow head and a neck are options ("neck" off when missing).
export type CharacterStyle = { color: string; thickness: number; headSize: HeadSize; headFilled: boolean; neck?: boolean };
export const DEFAULT_STYLE: CharacterStyle = { color: "#111111", thickness: 7, headSize: "normal", headFilled: true, neck: false };

export const STAND: PoseAngles = { lean: 0, head: 0, lShoulder: 8, rShoulder: -6, lElbow: 14, rElbow: 10, lHip: 3, rHip: -3, lKnee: 3, rKnee: 3 };
export const STAND_FRONT: PoseAngles = { lean: 0, head: 0, lShoulder: 14, rShoulder: 14, lElbow: 6, rElbow: 6, lHip: 9, rHip: 9, lKnee: 0, rKnee: 0 };

export const boneLengths = (height: number) => ({
  torso: PROPORTIONS.torso * height,
  neck: PROPORTIONS.neck * height,
  upperArm: PROPORTIONS.upperArm * height,
  forearm: PROPORTIONS.forearm * height,
  thigh: PROPORTIONS.thigh * height,
  shin: PROPORTIONS.shin * height,
});

export const headRadius = (height: number, size: HeadSize) => HEAD_RADIUS[size] * height;

export const clampPose = (pose: PoseAngles): { pose: PoseAngles; clamped: number } => {
  let clamped = 0;
  const next = { ...pose };
  for (const key of Object.keys(JOINT_LIMITS) as (keyof typeof JOINT_LIMITS)[]) {
    const [min, max] = JOINT_LIMITS[key];
    const value = Math.min(max, Math.max(min, pose[key]));
    if (Math.abs(value - pose[key]) > 1e-6) clamped += 1;
    next[key] = value;
  }
  return { pose: next, clamped };
};

export const withPose = (base: PoseAngles, changes: Partial<PoseAngles>): PoseAngles => ({ ...base, ...changes });
