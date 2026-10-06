import { forwardKinematics } from "../pose.ts";
import { clampPose, PROPORTIONS, STAND, withPose, type PoseAngles } from "../rig.ts";
import { amplitudeOf, beatSeconds, beatsToKeys, lerpPose, windUp, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";

// SPEC-0017 Phase 2: squat (down and back up), plus small helpers shared by the body moves
// (jump, sit, fall) for bodies whose feet stay planted while the hips move.

// ---- Shared helpers ----

// How far in front of the hips the feet are in a pose (average of both feet, x height, facing-relative).
export const feetAhead = (pose: PoseAngles) => {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  return (s.lFoot.x + s.rFoot.x) / 2;
};

// Where the hips must be (forward px from the start hips) so the feet stay at `feet` (forward px from the
// start hips). Used on every planted key, so the hips shift back when the knees go forward (weight stays
// over the feet) and the planted feet never have to slide.
export const hipsOver = (feet: number, pose: PoseAngles, height: number) => feet - feetAhead(pose) * height;

// Where the hips would be standing (in STAND) over this pose's feet, forward of this pose's hips (x height).
// Moves that are worked out from "the standing spot" use it, so they also start well from a crouch (a
// landing, a squat on its way up) where the hips are not over the feet the way they are standing.
export const standOrigin = (pose: PoseAngles) => feetAhead(pose) - feetAhead(STAND);

// Where the body's weight is (centre of mass), forward of the hips (x height, facing-relative). Shares of
// the body's weight: head 8%, torso 46%, each upper arm 3%, each forearm and hand 2.5%, each thigh 10%,
// each shin and foot 6%. A body standing still keeps this over its feet.
export function centerOfMass(pose: PoseAngles) {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  const mid = (a: { x: number }, b: { x: number }) => (a.x + b.x) / 2;
  return 0.08 * s.head.x + 0.46 * mid(s.hip, s.neck)
    + 0.03 * (mid(s.neck, s.lElbow) + mid(s.neck, s.rElbow)) + 0.025 * (mid(s.lElbow, s.lHand) + mid(s.rElbow, s.rHand))
    + 0.1 * (mid(s.hip, s.lKnee) + mid(s.hip, s.rKnee)) + 0.06 * (mid(s.lKnee, s.lFoot) + mid(s.rKnee, s.rFoot));
}

// Base seconds for a beat from pose `from` to pose `to`, stretched if needed so that (with these
// settings) no joint has to move faster than `speed` body heights per second on average. A move that
// starts from an unusual pose (another move's flow pose) may have further to go; this keeps it from
// jumping across the screen.
export function pacedSeconds(kind: Beat["kind"], seconds: number, from: PoseAngles, to: PoseAngles, settings: MoveSettings, speed = 4) {
  const unit = beatSeconds(kind, 1, settings);
  return unit > 1e-6 ? Math.max(seconds, travel(from, to) / speed / unit) : seconds;
}

// How far the body has to move from one pose to another: the furthest any joint goes (x height, with the
// hips held still, so folding legs count as the feet coming up).
export function travel(from: PoseAngles, to: PoseAngles) {
  const a = forwardKinematics(from, "right", { x: 0, y: 0 }, 1, "normal", false);
  const b = forwardKinematics(to, "right", { x: 0, y: 0 }, 1, "normal", false);
  return Math.max(...(Object.keys(a) as (keyof typeof a)[]).map((j) => Math.hypot(b[j].x - a[j].x, b[j].y - a[j].y)));
}

// Seconds for a beat that usually starts from standing, shortened when the body is already part of the
// way there (e.g. going down from a landing crouch: "you go down, pick it up", no slow-motion). Never
// less than `least` x the usual time.
export const fromHere = (seconds: number, from: PoseAngles, to: PoseAngles, least = 0.4) =>
  seconds * Math.min(1, Math.max(least, travel(from, to) / Math.max(1e-6, travel(STAND, to))));

// How far below the hips each foot is in a pose (x height): [left, right].
export const feetDrop = (pose: PoseAngles) => {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  return [s.lFoot.y, s.rFoot.y] as const;
};

// The same pose with both feet at the same height, so feet that land or plant together both touch the
// ground (the engine pins a foot where it first plants). The higher foot's knee opens a little; if that
// can't reach, the lower foot's knee bends a little instead.
export function levelFeet(pose: PoseAngles): PoseAngles {
  const [l, r] = feetDrop(pose);
  if (Math.abs(l - r) < 1e-6) return pose;
  const high = l < r ? "l" : "r", low = high === "l" ? "r" : "l";
  const target = Math.max(l, r);
  // A foot is lowest when its shin hangs straight down (knee bend = the thigh's forward angle); bending
  // the knee more than that only raises it.
  const lowest = (side: "l" | "r") => Math.min(150, Math.max(0, pose[`${side}Hip`] - pose.lean));
  const drop = (side: "l" | "r", k: number) => feetDrop({ ...pose, [`${side}Knee`]: k })[side === "l" ? 0 : 1];
  // Find the knee bend in [lo, hi] (where the foot's drop only falls) that gives the drop `want`.
  const solve = (side: "l" | "r", lo: number, hi: number, want: number) => {
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (drop(side, mid) >= want) lo = mid; else hi = mid;
    }
    return { ...pose, [`${side}Knee`]: lo } as PoseAngles;
  };
  const knee = pose[`${high}Knee`];
  const from = Math.min(knee, lowest(high));
  if (drop(high, from) >= target) return solve(high, from, knee, target);
  const other = high === "l" ? r : l;
  return solve(low, Math.max(pose[`${low}Knee`], lowest(low)), 150, other);
}

// The same pose with both legs swung forward (+) or back (-) together until the feet are `ahead` (x height)
// in front of the hips: e.g. feet trailing behind at a long jump's take-off. The swing is kept within
// `maxSwing` degrees, so a request that's too big just gets as close as it can.
export function withFeetAhead(pose: PoseAngles, ahead: number, maxSwing = 30): PoseAngles {
  const swung = (d: number) => safePose({ ...pose, lHip: pose.lHip + d, rHip: pose.rHip + d });
  let lo = -maxSwing, hi = maxSwing;
  if (feetAhead(swung(lo)) >= ahead) return swung(lo);
  if (feetAhead(swung(hi)) <= ahead) return swung(hi);
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (feetAhead(swung(mid)) < ahead) lo = mid; else hi = mid;
  }
  return swung((lo + hi) / 2);
}

// A knee never touches the floor in a crouch: each shin keeps pointing down from the knee to the foot
// (at most `maxBack` degrees back from straight down), so the foot, not the knee, stays the lowest point.
export const shinsDown = (pose: PoseAngles, maxBack = 62): PoseAngles => ({
  ...pose,
  lKnee: Math.min(pose.lKnee, Math.max(0, pose.lHip - pose.lean + maxBack)),
  rKnee: Math.min(pose.rKnee, Math.max(0, pose.rHip - pose.lean + maxBack)),
});

// Two-bone reach in angle space: the angles (down = 0, forward = +) of the upper and lower bone that put
// the end at (dx, dy) from the root (x height, y down). `bendBack` picks the knee-style bend (lower bone
// turned back); otherwise elbow-style (turned forward/up).
function reach2(dx: number, dy: number, upper: number, lower: number, bendBack: boolean) {
  const d = Math.min(upper + lower - 1e-6, Math.max(Math.abs(upper - lower) + 1e-6, Math.hypot(dx, dy)));
  const toTarget = (Math.atan2(dx, dy) * 180) / Math.PI;
  const inner = (Math.acos((upper * upper + d * d - lower * lower) / (2 * upper * d)) * 180) / Math.PI;
  const bend = (Math.acos((upper * upper + lower * lower - d * d) / (2 * upper * lower)) * 180) / Math.PI; // angle at the joint
  const a = bendBack ? toTarget + inner : toTarget - inner;
  return { upper: a, turn: 180 - bend };
}

// The same pose with one foot placed at (dx, dy) from the hips (x height, y down; facing-relative):
// thigh and knee angles solved so the leg reaches exactly there (knee bending the natural way).
export function footAt(pose: PoseAngles, side: "l" | "r", dx: number, dy: number): PoseAngles {
  const { upper, turn } = reach2(dx, dy, PROPORTIONS.thigh, PROPORTIONS.shin, true);
  return { ...pose, [`${side}Hip`]: upper + pose.lean, [`${side}Knee`]: turn } as PoseAngles;
}

// The same pose with both feet flat on the floor on planted spots `feet` (x height, forward of some
// origin) while the hips are at (x, height) from that origin (height = above the floor). The hips only
// fold so far: when the thighs point up steeply (hips low and behind the feet) the chest can't lean as
// far forward, so the lean is reduced to fit.
export const HIP_FOLD = 128; // degrees: how far the hips fold (just inside the rig's 130 limit)
export function onFeet(pose: PoseAngles, feet: { l: number; r: number }, x: number, height: number): PoseAngles {
  const placed = footAt(footAt(pose, "l", feet.l - x, height), "r", feet.r - x, height);
  const over = Math.max(placed.lHip, placed.rHip) - HIP_FOLD;
  return over > 1e-9 ? onFeet({ ...pose, lean: pose.lean - over }, feet, x, height) : placed;
}

// The same pose with one hand placed at (dx, dy) from the neck (x height, y down; facing-relative).
export function handAt(pose: PoseAngles, side: "l" | "r", dx: number, dy: number): PoseAngles {
  const { upper, turn } = reach2(dx, dy, PROPORTIONS.upperArm, PROPORTIONS.forearm, false);
  return { ...pose, [`${side}Shoulder`]: upper + pose.lean, [`${side}Elbow`]: turn } as PoseAngles;
}

// A pose kept inside the body's bend limits.
export const safePose = (pose: PoseAngles) => clampPose(pose).pose;

// A beat whose hips are given as a place (forward px from the start hips) instead of a step.
export type PlacedBeat = Omit<Beat, "dx"> & { at: number };

// Placed beats -> ordinary beats with forward travel. Beats this style skips (a robot has no wind-up or
// follow-through) are dropped first, so the travel still adds up and the feet still don't slide.
export function placeBeats(beats: PlacedBeat[], settings: MoveSettings): Beat[] {
  let previous = 0;
  return beats
    .filter((beat) => beatSeconds(beat.kind, beat.seconds, settings) > 1e-6)
    .map(({ at, ...beat }) => {
      const dx = at - previous;
      previous = at;
      return { ...beat, dx };
    });
}

// ---- Squat ----

export type SquatParams = { depth?: number; hold?: number };
// Arthur (2026-10-04): get right back up, don't stay down like taking a break: a brief hold by default.
export const SQUAT_DEFAULTS = { depth: 1, hold: 0.15 };

// Phase 1's hand-made squat (Arthur: "very natural"): hips back and low, chest leaning over the knees,
// arms reaching forward to balance the hips going back.
const DEEP_SQUAT: PoseAngles = withPose(STAND, { lean: 38, head: -26, lShoulder: 88, rShoulder: 78, lElbow: 12, rElbow: 16, lHip: 118, rHip: 116, lKnee: 135, rKnee: 133 });

// Squat down and stand back up. depth 0..1 (1 = a full deep squat), hold = seconds at the bottom.
// Marks: "bottom" (reaches the lowest point), "up" (back up, nearly standing and still rising). The flow
// point is "up": when another move follows straight away it starts from there (no stop to stand still).
// Works from any start pose with both feet planted (a landing crouch, a guard...).
export function squat(start: Stance, params: SquatParams, settings: MoveSettings): MoveOutput {
  const depth = Math.min(1, Math.max(0, params.depth ?? SQUAT_DEFAULTS.depth));
  const hold = Math.max(0, params.hold ?? SQUAT_DEFAULTS.hold);
  const H = settings.height;
  const feet = feetAhead(start.pose) * H;
  const bottom = lerpPose(STAND, DEEP_SQUAT, depth);
  // At the bottom the weight settles: the knees sink a few degrees more. This little drop is also the
  // wind-up for the rise (down a bit before driving up).
  const sunk = safePose(withPose(bottom, { lHip: bottom.lHip + 2 * depth, rHip: bottom.rHip + 2 * depth, lKnee: bottom.lKnee + 3 * depth, rKnee: bottom.rKnee + 3 * depth }));
  // Anticipation, the engine's rule: the opposite way of going down and forward. The chest lifts and
  // tips back a little (a breath in), the knees straighten, the arms swing a little back.
  const ready = windUp(start.pose, bottom, 0.1 * amplitudeOf(settings), { lean: 0.12 });
  // Standing up is the action: quicker than going down, speeding up out of the bottom. Back up = nearly
  // standing, still rising ("up", the flow point); then (only when nothing follows) a hair past straight,
  // chest proud, and settle into the normal stand.
  const tall = withPose(STAND, { lean: -2, head: -3, lShoulder: 10, rShoulder: 2, lKnee: 3, rKnee: 3, lHip: 2, rHip: -2 });
  const rising = lerpPose(tall, sunk, 0.16);
  const placed: PlacedBeat[] = [
    { kind: "anticipation", seconds: fromHere(0.28, start.pose, bottom, 0.5), pose: ready, at: hipsOver(feet, ready, H) },
    // Lowering is controlled: it speeds up and slows down smoothly into the bottom (no drop).
    { kind: "settle", seconds: fromHere(0.45 + 0.55 * depth, start.pose, bottom), pose: bottom, at: hipsOver(feet, bottom, H), name: "bottom" },
    { kind: "hold", seconds: hold, pose: sunk, at: hipsOver(feet, sunk, H) },
    { kind: "action", seconds: 0.28 + 0.32 * depth, pose: rising, at: hipsOver(feet, rising, H), ease: "smooth", name: "up" },
    { kind: "settle", seconds: 0.2, pose: tall, at: hipsOver(feet, tall, H), recover: true },
    { kind: "settle", seconds: 0.32, pose: STAND, at: hipsOver(feet, STAND, H), recover: true },
  ];
  return beatsToKeys(start, placeBeats(placed, settings), settings);
}
