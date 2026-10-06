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
// The torso can tilt all the way to flat (90 deg forward or back), so a body can lie face down or on its back —
// and a little past flat (round 16, Arthur's drawing: a body slammed on its back BENDS, the neck dipping below the
// hips as it bounces, "his back bent a little because of all that impact"; checked: no other move asks for it).
export const JOINT_LIMITS: Record<Exclude<PoseKey, "lShoulder" | "rShoulder">, readonly [number, number]> = {
  lean: [-105, 105],
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

// ELBOW RULE (Arthur, 2026-10-04, his throw/power-punch drawing): a real arm turns at the shoulder, so
// once the upper arm is raised to about shoulder height or higher, the elbow can look bent either way
// in a side view (a cocked throwing arm: upper arm back, forearm pointing up). A lowered arm bends only
// the normal way. The backward limit grows smoothly as the arm rises, so an elbow never snaps.
export const ELBOW_BACKWARD_MAX = 120;
export function elbowRange(shoulder: number): readonly [number, number] {
  let s = shoulder % 360;
  if (s > 180) s -= 360;
  if (s <= -180) s += 360;
  const u = Math.min(1, Math.max(0, (Math.abs(s) - 70) / 40));
  return [-ELBOW_BACKWARD_MAX * u * u * (3 - 2 * u), JOINT_LIMITS.lElbow[1]];
}

// HAND UP, ELBOW FREE (Arthur's overhand review, 2026-10-04: "The engine should not be scared for the
// elbow to go across the head in the 2D... go straight, not around the head"). In a side view, while
// the hand is held up (at or above about chest height) the arm is turning at the shoulder in 3D, so on
// screen the elbow may swing past the head and the forearm may cross the upper arm: the elbow bend may
// pass THROUGH 180 (folded) instead of only through 0 (straight). A hand hanging low keeps the normal
// range above. Values past 180 are the same look as value - 360, reached the "across" way.
// ARM BEHIND THE HEAD (Arthur's high-five drawing, round 6: "the elbow can go behind his head... it's 2D
// but it makes it look 3D"): a hand raised past the ear with the elbow going up BEHIND the head crosses
// the upper arm (past 180), then straightens up behind the head and swings forward over it (past 360):
// one continuous turn of the bend, never a spin back round. So a held-up arm's bend may run on up to
// 440 (= 80 bent, reached across and over). These are no new looks (every value is the same look as
// value - 360, already allowed), only the way there. Moves go out there on purpose and come back the
// same way; continueElbows only carries a bend past ELBOW_ACROSS_AUTO when it is already out there.
export const ELBOW_FREE_RANGE = [-200, 440] as const;
export const ELBOW_ACROSS_AUTO = 260;
// The hand counts as up while it hangs less than this far (x the upper arm) below the shoulder, on a
// body that is up (not lying down: a body tipped further than UPRIGHT_LEAN keeps the normal range).
export const HAND_UP_BELOW = 0.5;
export const UPRIGHT_LEAN = 60;
export function handUp(pose: PoseAngles, side: "l" | "r"): boolean {
  if (Math.abs(pose.lean) > UPRIGHT_LEAN) return false;
  const upper = ((pose[`${side}Shoulder`] - pose.lean) * Math.PI) / 180;
  const fore = upper + (pose[`${side}Elbow`] * Math.PI) / 180;
  return Math.cos(upper) * PROPORTIONS.upperArm + Math.cos(fore) * PROPORTIONS.forearm < HAND_UP_BELOW * PROPORTIONS.upperArm;
}

// The allowed range of one angle in this pose (elbows depend on how high their arm and hand are).
export function jointRange(pose: PoseAngles, key: keyof typeof JOINT_LIMITS): readonly [number, number] {
  if (key === "lElbow") return handUp(pose, "l") ? ELBOW_FREE_RANGE : elbowRange(pose.lShoulder);
  if (key === "rElbow") return handUp(pose, "r") ? ELBOW_FREE_RANGE : elbowRange(pose.rShoulder);
  return JOINT_LIMITS[key];
}

export const clampPose = (pose: PoseAngles): { pose: PoseAngles; clamped: number } => {
  let clamped = 0;
  const next = { ...pose };
  for (const key of Object.keys(JOINT_LIMITS) as (keyof typeof JOINT_LIMITS)[]) {
    const [min, max] = jointRange(pose, key);
    const value = Math.min(max, Math.max(min, pose[key]));
    if (Math.abs(value - pose[key]) > 1e-6) clamped += 1;
    next[key] = value;
  }
  return { pose: next, clamped };
};

export const withPose = (base: PoseAngles, changes: Partial<PoseAngles>): PoseAngles => ({ ...base, ...changes });
