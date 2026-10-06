import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, JOINT_LIMITS, type Facing, type JointName, type PoseAngles, type Point } from "../rig.ts";

// SPEC-0017 Phase 2 round 7: EYES (Arthur: "Stick figures, even though they don't visually have it,
// have eyes"). A figure looks where it is going (walking left, its eyes are on the left: its facing),
// and when there is something to look at — the person it waves to or high-fives, throws to, catches
// from or punches, the spot it stomps on, its own hurt leg — it looks AT it: up when it is high, down
// when it is low. The eyes aren't drawn, so the head shows the look: it tilts back to look up and
// forward to look down, as far as a neck naturally goes (rig.ts head limits); the eyes do the rest.
// With nobody and nothing to look at, the figure looks where it faces.
//
// How a move uses it: the planner hands a move a LOOK TARGET (`look` param: where the thing is from the
// figure's eyes, in its own view) when there is one; the move turns the head with `lookToward` /
// `headToward` on the key poses where it should be looking (and may aim other parts too: a wave goes
// up toward someone high, down toward someone low).

// Where something is from the figure's eyes, in the figure's own view (px): `ahead` = how far in front
// (the way it faces; negative = behind it), `up` = how far higher (negative = lower).
export type LookTarget = { ahead: number; up: number };

const DEG = 180 / Math.PI;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

// How the head shares a look with the (undrawn) eyes: the head turns most of the way, the eyes the rest.
export const HEAD_SHARE = 0.8;
// The neck's natural range: the head tilts back (negative) or forward (positive) at most this far
// relative to the body (rig.ts JOINT_LIMITS.head).
export const NECK_RANGE = JOINT_LIMITS.head;

// How far above level the target is from the eyes (degrees: + up, - down). Something behind the figure
// counts by how far it is, whichever side: looking behind is a look-back or a turn, not a head tilt.
export function gazeElevation(look: LookTarget): number {
  return Math.atan2(look.up, Math.max(Math.abs(look.ahead), 1)) * DEG;
}

// The head angle (relative to the body, as in a pose) that turns the face toward the target. A level
// head (looking straight ahead) is one that undoes the body's lean (head = -lean); looking up tilts it
// back from there, looking down tilts it forward; never past the neck's natural range.
export function headToward(pose: PoseAngles, look: LookTarget, share = HEAD_SHARE): number {
  return clamp(-pose.lean - share * gazeElevation(look), NECK_RANGE[0], NECK_RANGE[1]);
}

// The same pose looking at the target. `amount` (0..1) = how far the head has turned to it (0 = the
// pose's own head), so a move can turn the head to the target over a few beats.
export function lookToward(pose: PoseAngles, look: LookTarget | undefined, amount = 1): PoseAngles {
  if (!look) return pose;
  const head = pose.head + (headToward(pose, look) - pose.head) * clamp(amount, 0, 1);
  return { ...pose, head };
}

// A look target between two points on the stage (y grows downward), for a figure facing `facing`.
export function lookTarget(eyes: Point, target: Point, facing: Facing): LookTarget {
  return { ahead: (target.x - eyes.x) * (facing === "left" ? -1 : 1), up: eyes.y - target.y };
}

// The head angle that looks from `from` (the eyes, stage px) at `target` (stage px) for this pose and
// facing — the brief's `lookAt(pose, from, target)`.
export function lookAt(pose: PoseAngles, from: Point, target: Point, facing: Facing, share = HEAD_SHARE): number {
  return headToward(pose, lookTarget(from, target, facing), share);
}

// Where a figure's eyes are (the middle of its head, stage px) for a pose, standing the way the engine
// stands a body: its lowest point (feet, knees, hips, neck or the bottom of the head) `lift` above the
// ground. Works for a figure standing, sitting, lying or in the air (a jump), so a figure can look at
// someone wherever they are.
export function eyesOf(pose: PoseAngles, facing: Facing, hipX: number, height: number, groundY: number, lift = 0): Point {
  const body = forwardKinematics(pose, facing, { x: hipX, y: 0 }, height, "normal", false);
  const radius = HEAD_RADIUS.normal * height;
  const lowest = Math.max(body.lFoot.y, body.rFoot.y, body.lKnee.y, body.rKnee.y, body.hip.y, body.neck.y, body.head.y + radius);
  return { x: body.head.x, y: body.head.y + groundY - lift - lowest };
}

// Looking at something of its own or right by it, worked out from the pose alone (no stage needed): a
// part of its own body (`"lKnee"`: the hurt knee it sits holding; `"rFoot"`: the foot it is about to
// stomp with) or a spot near it, in x height units: `ahead` in front of the hips, `up` above the floor
// under them (up 0 = the floor: the spot a stomp lands on). `amount` as in lookToward.
export function lookAtOwn(pose: PoseAngles, spot: JointName | { ahead: number; up: number }, amount = 1): PoseAngles {
  const body = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  const floor = Math.max(body.lFoot.y, body.rFoot.y, body.lKnee.y, body.rKnee.y, body.hip.y);
  const target = typeof spot === "string" ? body[spot] : { x: spot.ahead, y: floor - spot.up };
  return lookToward(pose, { ahead: target.x - body.head.x, up: body.head.y - target.y }, amount);
}
