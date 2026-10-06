import { solveTwoBone } from "../ik.ts";
import { forwardKinematics, translateSkeleton } from "../pose.ts";
import { ELBOW_BACKWARD_MAX, elbowRange, HEAD_RADIUS, JOINT_LIMITS, jointRange, PROPORTIONS, STAND, withPose, type Facing, type JointName, type PoseAngles, type Point, type Skeleton } from "../rig.ts";
import { amplitudeOf, beatSeconds, beatsToKeys, lerpPose, windUp, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { balancedHips } from "./balance.ts";
import { RAMP_SCALE, type MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2 Round B: punch (reworked after Arthur's reviews, 2026-10-04; round 4: the engine
// picks the punch — uppercut, straight or overhand — from the distance, and the overhand winds up and
// strikes the way Arthur described: see THE PUNCH RULES below).
// From a fighting stance (front foot forward, hands up by the chin): a WIND-UP the opposite way, as big
// as the punch is strong, then the punch FAST, speeding up all the way into the hit, the body driving
// forward. The fist then comes back to the face (guard): that is where the next punch or kick starts
// (FLOW). Only when nothing follows does the figure step back and stand.
//
// The first half of this file holds the body helpers that the other Round B moves (kick, wave,
// highFive, throwCatch) share: where a pose puts the hands, arms and legs that reach for a spot, legs
// that keep planted feet, the fighting stance, stepping back to rest, and the timing rules.

// ---- Shared body helpers --------------------------------------------------------------------

export type Side = "l" | "r";
const DEG = 180 / Math.PI;
const rad = (degrees: number) => degrees / DEG;
const down = (degrees: number): Point => ({ x: Math.sin(rad(degrees)), y: Math.cos(rad(degrees)) });
const turn = (degrees: number) => { let a = degrees; while (a <= -180) a += 360; while (a > 180) a -= 360; return a; };
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

// Body sizes below are in "x height" units (1 = the figure's standing height), so a move looks the
// same at any size. Poses are facing-relative: worked out facing right, forward = +x, +y = down.
const THIGH = PROPORTIONS.thigh, SHIN = PROPORTIONS.shin, UPPER_ARM = PROPORTIONS.upperArm, FOREARM = PROPORTIONS.forearm;

// Where every joint is for a pose, standing on the ground the way the engine stands a body: the lowest
// foot or knee sits `lift` above groundY. (Planted feet only re-bend the knees, so hands and head match.)
export function standingSkeleton(pose: PoseAngles, facing: Facing, hipX: number, height: number, groundY: number, lift = 0): Skeleton {
  const body = forwardKinematics(pose, facing, { x: hipX, y: 0 }, height, "normal", false);
  const lowest = Math.max(body.lFoot.y, body.rFoot.y, body.lKnee.y, body.rKnee.y);
  return translateSkeleton(body, 0, groundY - lift - lowest);
}

// Where a hand is on the stage for a pose (e.g. where a ball sits, or where a slap lands).
export function handPoint(pose: PoseAngles, facing: Facing, hipX: number, height: number, groundY: number, hand: "lHand" | "rHand" = "rHand", lift = 0): Point {
  return standingSkeleton(pose, facing, hipX, height, groundY, lift)[hand];
}

// The pose at height 1, facing right, standing on y = 0 (y grows downward, so heights are -y).
export const unitBody = (pose: PoseAngles) => standingSkeleton(pose, "right", 0, 1, 0);

// How high the hips are when standing in STAND (x height).
export const STAND_HIP = -unitBody(STAND).hip.y;

export const armOf = (side: Side, shoulder: number, elbow: number): Partial<PoseAngles> =>
  side === "l" ? { lShoulder: shoulder, lElbow: elbow } : { rShoulder: shoulder, rElbow: elbow };
export const legOf = (side: Side, hip: number, knee: number): Partial<PoseAngles> =>
  side === "l" ? { lHip: hip, lKnee: knee } : { rHip: hip, rKnee: knee };
export const other = (side: Side): Side => (side === "l" ? "r" : "l");

// Blend two poses (k = 0 -> a, 1 -> b) the way the engine moves between keys: shoulders turn freely, so
// they go the shortest way round (an arm up behind the head and an arm up in front are 40 degrees apart,
// not 320).
export const blendPose = (a: PoseAngles, b: PoseAngles, k: number): PoseAngles => {
  const out = lerpPose(a, b, k);
  for (const key of ["lShoulder", "rShoulder"] as const) out[key] = a[key] + turn(b[key] - a[key]) * k;
  return out;
};

// Thigh and knee angles that put a foot `dx` in front of the hips and `hipHeight` below them, knee
// pointing forward. Used for every planted foot, so the engine's foot lock never has to stretch a leg.
export function legToward(lean: number, dx: number, hipHeight: number): { hip: number; knee: number } {
  const reach = (THIGH + SHIN) * 0.999;
  const below = Math.min(hipHeight, Math.sqrt(Math.max(0, reach * reach - dx * dx)));
  const { mid, end } = solveTwoBone({ x: 0, y: 0 }, { x: dx, y: below }, THIGH, SHIN, { x: 1, y: 0 });
  const thigh = Math.atan2(mid.x, mid.y) * DEG;
  const shin = Math.atan2(end.x - mid.x, end.y - mid.y) * DEG;
  return { hip: thigh + lean, knee: Math.max(0, thigh - shin) };
}

// Where a standing pose's feet are, from the hips (x height, forward +). A move starts with both feet
// planted here; later keys bend the legs so the feet stay on these spots.
export type Feet = { l: number; r: number };
export const feetOf = (pose: PoseAngles): Feet => {
  const body = unitBody(pose);
  return { l: body.lFoot.x - body.hip.x, r: body.rFoot.x - body.hip.x };
};

// Set the legs of `pose` so the planted feet stay put while the hips are `at` (x height) from where
// they started, `drop` lower than standing tall (knees bend). `only` limits it to one leg (kicks).
export function plantedLegs(pose: PoseAngles, feet: Feet, at: number, drop: number, only?: Side): PoseAngles {
  const out = { ...pose };
  for (const side of only ? [only] : (["l", "r"] as Side[])) {
    const leg = legToward(pose.lean, feet[side] - at, STAND_HIP - drop);
    Object.assign(out, legOf(side, clamp(leg.hip, JOINT_LIMITS.lHip[0], JOINT_LIMITS.lHip[1]), Math.min(JOINT_LIMITS.lKnee[1], leg.knee)));
  }
  return out;
}

// Where the hand is from the shoulder (x height, facing right, +y down) for arm angles on a body
// leaning `lean`.
export function handFrom(lean: number, shoulder: number, elbow: number): Point {
  const upper = shoulder - lean;
  const a = down(upper), b = down(upper + elbow);
  return { x: UPPER_ARM * a.x + FOREARM * b.x, y: UPPER_ARM * a.y + FOREARM * b.y };
}

// Arm angles that put the hand at `hand` (from the shoulder; x height, facing right, +y down) on a body
// leaning `lean`. The elbow only ever bends the natural way, never past its limit; a spot out of reach
// gets the arm pointing straight at it.
const ELBOW_MAX = JOINT_LIMITS.rElbow[1];
const ARM_MIN = Math.sqrt(UPPER_ARM ** 2 + FOREARM ** 2 + 2 * UPPER_ARM * FOREARM * Math.cos(rad(ELBOW_MAX))) + 1e-4;
export function armReach(lean: number, hand: Point): { shoulder: number; elbow: number } {
  const d = clamp(Math.hypot(hand.x, hand.y), ARM_MIN, (UPPER_ARM + FOREARM) * 0.999);
  const theta = Math.atan2(hand.x, hand.y) * DEG;
  const alpha = Math.acos(clamp((UPPER_ARM ** 2 + d * d - FOREARM ** 2) / (2 * UPPER_ARM * d), -1, 1)) * DEG;
  const upper = theta - alpha; // the elbow sits on the side that lets the forearm bend forward/up
  const elbowAt = down(upper), target = down(theta);
  const fore = Math.atan2(target.x * d - elbowAt.x * UPPER_ARM, target.y * d - elbowAt.y * UPPER_ARM) * DEG;
  return { shoulder: upper + lean, elbow: clamp(turn(fore - upper), 0, ELBOW_MAX) };
}

// Leg angles that put the foot at `foot` (from the hip; x height, facing right, +y down) on a body
// leaning `lean`, knee pointing forward. A spot further back than the hip can swing stops the thigh at
// its limit and points the shin at the spot.
export function legReach(lean: number, foot: Point): { hip: number; knee: number } {
  const d = clamp(Math.hypot(foot.x, foot.y), 0.02, (THIGH + SHIN) * 0.999);
  const theta = Math.atan2(foot.x, foot.y) * DEG;
  const alpha = Math.acos(clamp((THIGH ** 2 + d * d - SHIN ** 2) / (2 * THIGH * d), -1, 1)) * DEG;
  const hip = clamp(theta + alpha + lean, JOINT_LIMITS.lHip[0], JOINT_LIMITS.lHip[1]);
  const thigh = hip - lean, kneeAt = down(thigh);
  const shin = Math.atan2(foot.x - kneeAt.x * THIGH, foot.y - kneeAt.y * THIGH) * DEG;
  return { hip, knee: clamp(turn(thigh - shin), 0, JOINT_LIMITS.lKnee[1]) };
}

// A beat placed by where the hips are (`at`, x height from the start, forward +) instead of how far
// they move during the beat.
export type PlacedBeat = Omit<Beat, "dx"> & { at: number };
type PathBeat = Omit<PlacedBeat, "kind" | "seconds">;

// Beats -> engine keys. Beats a style skips (a robot has no follow-through) are dropped FIRST, so the
// hips' travel still adds up and the move ends exactly where it should.
export function placedBeatsToKeys(start: Stance, beats: PlacedBeat[], settings: MoveSettings): MoveOutput {
  let previous = 0;
  const kept = beats.filter((beat) => beatSeconds(beat.kind, beat.seconds, settings) > 1e-6);
  const plain: Beat[] = kept.map(({ at, ...beat }) => {
    const dx = (at - previous) * settings.height;
    previous = at;
    return { ...beat, dx };
  });
  return beatsToKeys(start, plain, settings);
}

// How hard a style hits (x the natural size of wind-ups, leans and follow-throughs).
export const STYLE_POWER: Record<MoveStyle, number> = { natural: 1, robot: 0.9, sneaky: 0.8, tired: 0.6, happy: 1.05, angry: 1.25, heavy: 1.1, hurt: 0.55, sad: 0.6, irritated: 1.15 };
// Energy and style together: about 0.45 (weak, tired) to 1.6 (angry, full energy).
export const powerOf = (settings: MoveSettings) => amplitudeOf(settings) * STYLE_POWER[settings.style];
export const isRobot = (settings: MoveSettings) => RAMP_SCALE[settings.style] === 0;

// A robot has no slow, eased wind-up, but it still winds up the opposite way first: a short, plain
// (straight, even-speed) beat (Arthur, 2026-10-04: "99% of the time" — robots too).
export const ROBOT_WINDUP = 0.55; // x the natural wind-up's base seconds
export const windKind = (settings: MoveSettings): Beat["kind"] => (isRobot(settings) ? "settle" : "anticipation");

// Base seconds for a beat, stretched if needed so that with these settings it lasts at least
// `minSeconds`.
export const atLeast = (kind: Beat["kind"], seconds: number, minSeconds: number, settings: MoveSettings) => {
  const unit = beatSeconds(kind, 1, settings);
  return unit > 1e-6 ? Math.max(seconds, minSeconds / unit) : seconds;
};

// How far a hand or foot travels (x height) going from one pose to another.
export function pathLength(from: PoseAngles, to: PoseAngles, joint: JointName, steps = 24): number {
  let length = 0;
  let previous = unitBody(from)[joint];
  for (let i = 1; i <= steps; i += 1) {
    const point = unitBody(blendPose(from, to, i / steps))[joint];
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return length;
}
// The same along a chain of poses.
export const chainLength = (poses: PoseAngles[], joint: JointName) =>
  poses.slice(1).reduce((sum, pose, i) => sum + pathLength(poses[i], pose, joint), 0);

// Speed limit for the fast part of a move: a hand or foot may reach at most this many body heights per
// second (about 90 px per frame at 24 fps for a 300 px figure), so the fastest angry punch or high kick
// still gets in-between frames instead of jumping across the screen in one frame.
export const MAX_ACTION_SPEED = 7;
export const MIN_ACTION_SECONDS = 0.075;
// How an action speeds up: the distance covered grows like time^ACTION_RAMP, so the hand or foot gets
// going quickly and is fastest at the very end (ACTION_RAMP x its average speed).
export const ACTION_RAMP = 1.6;
// (A follow-through starts at its top speed and slows down, so the same limit applies to it: 2x average.)
export const actionSecondsFor = (seconds: number, length: number, settings: MoveSettings, kind: Beat["kind"] = "action") =>
  atLeast(kind, seconds, Math.max(MIN_ACTION_SECONDS, ((kind === "action" ? ACTION_RAMP : 2) * length) / MAX_ACTION_SPEED), settings);
export const actionSeconds = (seconds: number, from: PoseAngles, to: PoseAngles, joint: JointName, settings: MoveSettings, kind: Beat["kind"] = "action") =>
  actionSecondsFor(seconds, pathLength(from, to, joint), settings, kind);

// Arthur's rule as a floor: the wind-up must be slow next to the action. A smooth wind-up peaks at
// about 1.5x its average speed and an action at ACTION_RAMP x, so this keeps the wind-up's top speed
// under about a third of the action's (WINDUP_SLOWER) even when the action had to be slowed by the speed
// limit above.
const WINDUP_SLOWER = 3.6;
// `actionSecs` is the action's real length (after style and speed); `wind` / `strike` are how far the
// hand or foot goes in each.
// A wind-up made of several smooth parts that flow into each other (`parts` > 1) peaks closer to its
// average speed (about 1.25x instead of 1.5x).
export const WINDUP_CAP = 2;
// A WIND-UP IS ALWAYS SEEN (Arthur, round 7: the jab "just bends his arm fast and punches. It should at
// least have a little anticipation"). Arthur watches at 12 pictures a second: however small, quick or
// angry the move, its wind-up lasts at least this long (2.5 pictures), so at least two pictures show the
// hand or foot on its way back before the strike. (A robot's plain wind-up too.)
export const MIN_WINDUP_SECONDS = 2.5 / 12;
export function windupSecondsFor(seconds: number, wind: number, strike: number, actionSecs: number, settings: MoveSettings, kind: Beat["kind"] = "anticipation", parts = 1, cap = Infinity) {
  // (A robot moves at even speeds: its short wind-up only has to be clearly slower than its strike.)
  const factor = kind === "anticipation" ? (WINDUP_SLOWER * (parts > 1 ? 1.25 : 1.5)) / ACTION_RAMP : 2;
  // ...but (when `cap` is given) a wind-up never drags: at most `cap` x its own base time (a big throw's
  // arm travels far, so it moves faster on the way back rather than taking forever).
  const paced = Math.min(seconds * cap, atLeast(kind, seconds, factor * (wind / Math.max(1e-6, strike)) * actionSecs, settings));
  return atLeast(kind, paced, MIN_WINDUP_SECONDS, settings);
}
export function windupSeconds(seconds: number, from: PoseAngles, windup: PoseAngles, hit: PoseAngles, joint: JointName, actionSecs: number, settings: MoveSettings, kind: Beat["kind"] = "anticipation") {
  return windupSecondsFor(seconds, pathLength(from, windup, joint), pathLength(windup, hit, joint), actionSecs, settings, kind);
}

// A wind-up that passes through in-between poses: the time is shared out by how far the hand or foot
// goes in each part, so it moves at an even, slow pace (eased at both ends).
export function windupThrough(path: PathBeat[], from: PoseAngles, joint: JointName, seconds: number, kind: Beat["kind"]): PlacedBeat[] {
  const lengths = path.map((beat, i) => Math.max(1e-3, pathLength(i === 0 ? from : path[i - 1].pose, beat.pose, joint)));
  const total = lengths.reduce((a, b) => a + b, 0);
  return path.map((beat, i) => ({ ...beat, kind, seconds: (seconds * lengths[i]) / total }));
}

// The fast part of a move (Arthur: "accelerate really fast"), through any in-between poses (a punch from
// behind the head comes down past the shoulder and the chin, then straight out). The hand or foot
// speeds up the whole way — the distance covered grows like time^ACTION_RAMP — so it gets going
// quickly and is fastest at the very end. It starts from a stop with a short eased-in piece; the rest
// is cut into pieces whose timing follows that curve. A robot moves at one even speed instead.
// `seconds` is the whole action; the last piece carries the path's last name (e.g. "hit").
// (`also`: a second joint whose travel also sets the timing, e.g. an elbow that swings further than its fist.)
export function actionThrough(path: PathBeat[], from: { pose: PoseAngles; at: number }, joint: JointName, seconds: number, settings: MoveSettings, also?: JointName): PlacedBeat[] {
  const robot = isRobot(settings);
  // Each part of the path is cut in two (so the speed keeps growing all through it); the very first
  // piece is a short start from a stop.
  const shares = robot ? [1] : [0.5, 1];
  const pieces: PathBeat[] = [];
  let before = from;
  path.forEach((beat, i) => {
    const cuts = i === 0 && !robot ? [0.22, 0.61, 1] : shares;
    for (const u of cuts) {
      pieces.push(u === 1 ? beat : { pose: blendPose(before.pose, beat.pose, u), at: before.at + (beat.at - before.at) * u, contacts: beat.contacts });
    }
    before = beat;
  });
  const lengths = pieces.map((beat, i) => Math.max(1e-4, ...[joint, ...(also ? [also] : [])].map((j) => pathLength(i === 0 ? from.pose : pieces[i - 1].pose, beat.pose, j))));
  const total = lengths.reduce((a, b) => a + b, 0);
  const p = robot ? 1 : ACTION_RAMP;
  // Times (0..1) at the end of each piece on the curve distance = time^p.
  let done = 0;
  const ends = lengths.map((length) => { done += length; return (done / total) ** (1 / p); });
  // The eased-in start piece ends at the curve's speed there, so it takes 2/p x as long as the curve says.
  const stretch = robot ? 0 : ends[0] * (2 / p - 1);
  const scale = seconds / (ends[ends.length - 1] + stretch);
  return pieces.map((beat, i): PlacedBeat => ({
    ...beat,
    kind: "action",
    seconds: scale * (i === 0 ? ends[0] + stretch : ends[i] - ends[i - 1]),
    ease: i === 0 && !robot ? "in" : "linear",
  }));
}

// Find a joint angle (between lo and hi) that makes `measure(pose)` reach `target`; measure must
// grow with the angle. Plain halving search: exact to a tiny fraction of a degree.
export function solveAngle(lo: number, hi: number, target: number, poseFor: (angle: number) => PoseAngles, measure: (pose: PoseAngles) => number): number {
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (measure(poseFor(mid)) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- Arm wind-ups -----------------------------------------------------------------------------

// Arm angles as the world sees them (upper arm and forearm directions, degrees, 0 = down, 90 = forward)
// so arm shapes can be blended while the body leans.
export type WorldArm = { upper: number; fore: number };
export const worldArm = (pose: PoseAngles, side: Side): WorldArm => {
  const upper = pose[`${side}Shoulder`] - pose.lean;
  return { upper, fore: upper + pose[`${side}Elbow`] };
};
export const armFromWorld = (lean: number, side: Side, arm: WorldArm): Partial<PoseAngles> => {
  // A raised arm may look bent either way (rig.ts elbowRange); a lowered one only the natural way.
  const [lo, hi] = elbowRange(arm.upper + lean);
  return armOf(side, arm.upper + lean, clamp(arm.fore - arm.upper, lo, hi));
};
export const blendArm = (a: WorldArm, b: WorldArm, k: number): WorldArm => ({ upper: a.upper + (b.upper - a.upper) * k, fore: a.fore + (b.fore - a.fore) * k });
export const worldArmAt = (hand: Point): WorldArm => { const a = armReach(0, hand); return { upper: a.shoulder, fore: a.shoulder + a.elbow }; };

// The arm drawn back (a jab's small wind-up): the elbow points back and a little down and the fist is
// pulled in to the chest, ready to shoot forward.
export const CHAMBER: WorldArm = { upper: -62, fore: 80 };
// On the way into (and back out of) a big wind-up the elbow leads: it points straight back with the arm
// still bent, the fist beside the chest — so the fist never drops down by the hip.
export const ELBOW_BACK: WorldArm = { upper: -105, fore: 42 };
// Coming forward again, the fist passes just under the chin before the arm straightens.
export const DRIVE: WorldArm = { upper: -12, fore: 136 };

// THE STRIKE RULE (Arthur, 2026-10-04 — three drawings: standing, the "passing" pose, the cocked pose).
// How big the wind-up is depends on the POWER of the action:
// - a small action (a jab, a weak punch): a little lean back and the fist pulls back a little along the
//   line it will travel — seen only for a moment — then it shoots straight out along that line;
// - a strong action (a hard punch, a throw): the arms pass each other (PASS_ARM: the striking elbow goes
//   back beside the body, the forearm still forward at chest height, while the other arm comes forward),
//   the arm reaches straight back at shoulder height (BACK_ARM), then the forearm folds UP (COCKED: upper
//   arm back and a little up, forearm pointing up — fist or ball above and behind the head, like a loaded
//   spring; a raised arm turns at the shoulder, so its elbow may look bent the other way, rig.ts
//   elbowRange) while the other arm points at the target and the body leans back. The strike then comes
//   over the top (OVER_ARM, the elbow leading, then WHIP_ARM, the hand lagging behind) and snaps out.
// (The throw still uses these shapes. Since Arthur's round-4 review a punch has its own rules — the
// punch section below — so a punch never windmills over the top.)
export const PASS_ARM: WorldArm = { upper: -65, fore: 75 };
export const BACK_ARM: WorldArm = { upper: -104, fore: -102 };
export const cockedShape = (rise: number): WorldArm => ({ upper: -92 - rise, fore: -172 + 0.2 * rise });
export const OVER_ARM: WorldArm = { upper: -150, fore: -140 };
export const WHIP_ARM: WorldArm = { upper: -205, fore: -165 };
// Strong enough for the full cocked wind-up (x powerOf), for a punch.
export const COCK_POWER = 0.62;

// The cocked arm for a wind-up of `depth` 0..1 (up to half: just the fist drawn back to the chest; past
// half: the strong path, ending at least half way up into the cocked shape). `vias` are the arms it
// passes through on the way (the passing pose, then straight back); `via` is the first of them.
export function cockedArm(depth: number, from: WorldArm, rise: number): { arm: WorldArm; via?: WorldArm; vias: WorldArm[] } {
  if (depth <= 0.5) return { arm: blendArm(from, CHAMBER, depth / 0.5), vias: [] };
  return { arm: blendArm(BACK_ARM, cockedShape(rise), Math.max(0.5, (depth - 0.5) / 0.5)), via: PASS_ARM, vias: [PASS_ARM, BACK_ARM] };
}

// The free arm does the opposite of what it does in the strike: it is pulled in to the chin when the
// fist lands, so in the wind-up it reaches out and points at the target (`toward`, from the shoulder).
export function aimArm(lean: number, toward: Point, straight = 0.95): { shoulder: number; elbow: number } {
  const length = Math.hypot(toward.x, toward.y) || 1;
  const reach = (UPPER_ARM + FOREARM) * straight;
  return armReach(lean, { x: (toward.x / length) * reach, y: (toward.y / length) * reach });
}

// ---- Fighting stance and stepping -------------------------------------------------------------

// Fighting stance: the front (l) foot STANCE_WIDTH in front of the back (r) foot, the hips a little
// nearer the front foot and low enough that the back leg is long (front knee bent, back leg extended).
export const STANCE_WIDTH = 0.3;
const GUARD_SHARE = 0.56;
const LEG = THIGH + SHIN;
// Guard: hands up by the chin (lead hand a little further out), chin tucked (Arthur liked it).
export const GUARD: PoseAngles = withPose(STAND, { lean: 4, head: 6, ...armOf("l", 50, 112), ...armOf("r", 28, 136) });
// FIGHT LOOK (Arthur, round 9: "no guard stance unless the user specifically asks for realistic, real-life
// MMA fighting that could educate someone"). A stick-figure fight stands LOOSE between strikes: HANDS LOW
// (Arthur, round 10: "on default their hands are like twice as low as in a real guard — that's normal for
// fight animations"): about half as high above the hips as a guard's fists, around the belly (lead hand a
// little higher and further out), the elbows down by the sides, the chin up — not fists at the face. Asked
// for higher hands, `guard: "high"` holds them at the chest (still no boxer's guard). Only `guard: "realistic"` (a character's or a move's
// setting) stands in the boxer's GUARD above. Strikes are the same either way (the free hand still comes
// up to the chin as the fist lands), and a block still raises the forearms: a block is a reaction, not a stance.
export const LOOSE: PoseAngles = withPose(STAND, { lean: 3, head: 3, ...armOf("l", 16, 87), ...armOf("r", 1, 92) });
export const HIGH_HANDS: PoseAngles = withPose(STAND, { lean: 3, head: 3, ...armOf("l", 27, 86), ...armOf("r", 13, 88) });
export type GuardLook = "loose" | "high" | "realistic";
export const stanceArms = (look?: GuardLook): PoseAngles => (look === "realistic" ? GUARD : look === "high" ? HIGH_HANDS : LOOSE);

// The back foot stays where it is; the front foot is set STANCE_WIDTH ahead of it (unless the feet are
// already about that far apart).
export const fightFeet = (feet: Feet): Feet => ({ r: feet.r, l: feet.l - feet.r >= STANCE_WIDTH * 0.8 ? feet.l : feet.r + STANCE_WIDTH });
// Hips `share` of the way from the back foot to the front foot.
export const stanceAt = (feet: Feet, share: number) => feet.r + share * (feet.l - feet.r);
// How much lower than standing tall the hips must be for the back leg to be long but not locked.
export function backLegDrop(feet: Feet, at: number, straight = 0.985) {
  const h = at - feet.r, length = LEG * straight;
  return Math.max(0.01, STAND_HIP - Math.sqrt(Math.max(0, length * length - h * h)));
}
export const guardAt = (feet: Feet) => stanceAt(feet, GUARD_SHARE);
export const guardPose = (feet: Feet, at = guardAt(feet), look?: GuardLook) => plantedLegs(stanceArms(look), feet, at, backLegDrop(feet, at) + 0.012);
// Already standing in a fighting stance with the hands up (e.g. right after another punch or a kick)?
export function inGuard(pose: PoseAngles, feet: Feet) {
  const arms = (["lShoulder", "lElbow", "rShoulder", "rElbow"] as const).every((key) => Math.abs(turn(pose[key] - GUARD[key])) < 25);
  return arms && feet.l - feet.r >= STANCE_WIDTH * 0.8 && Math.abs(pose.lean - GUARD.lean) < 12;
}

// One foot lifted in the middle of a step (the other planted): the foot is half way to its new spot,
// `lift` above the ground; the hips are at `at`, `drop` lower than standing tall.
export function stepPose(pose: PoseAngles, from: Feet, to: Feet, at: number, drop: number, side: Side, lift = 0.05): PoseAngles {
  const planted = plantedLegs(pose, from, at, drop, other(side));
  const leg = legReach(pose.lean, { x: (from[side] + to[side]) / 2 - at, y: STAND_HIP - drop - lift });
  return { ...planted, ...legOf(side, leg.hip, leg.knee) };
}
const dropOf = (pose: PoseAngles) => STAND_HIP + unitBody(pose).hip.y;
// A step into new foot spots: the foot in the air half way, then planted (two beats; `extra` goes on
// both, except that only the landing gets the name).
export function stepBeats(start: { pose: PoseAngles; at: number }, from: Feet, to: Feet, end: { pose: PoseAngles; at: number }, seconds: number, extra: Partial<PlacedBeat> = {}): PlacedBeat[] {
  const side: Side = Math.abs(to.l - from.l) >= Math.abs(to.r - from.r) ? "l" : "r";
  const at = (start.at + end.at) / 2;
  const drop = Math.max(0.015, (dropOf(start.pose) + dropOf(end.pose)) / 2);
  const air = stepPose(blendPose(start.pose, end.pose, 0.5), from, to, at, drop, side);
  return [
    { kind: "settle", pose: air, seconds: seconds * 0.45, at, contacts: [side === "l" ? "rFoot" : "lFoot"], ...extra, name: undefined },
    { kind: "settle", pose: end.pose, seconds: seconds * 0.55, at: end.at, ...extra },
  ];
}

// Back to rest, only when nothing follows (Arthur's flow rule): if the feet are apart, the front foot
// steps back beside the back one, then the body settles into `rest`. The back (r) foot stays put, so a
// move that started standing ends exactly where it started. Every beat is marked `recover`.
export function recoverBeats(from: { pose: PoseAngles; at: number }, feet: Feet, rest: PoseAngles, seconds = 0.7): PlacedBeat[] {
  const restFeet = feetOf(rest);
  const at = feet.r - restFeet.r;
  const to: Feet = { r: feet.r, l: at + restFeet.l };
  if (Math.abs(to.l - feet.l) < 0.02) return [{ kind: "settle", pose: rest, seconds: seconds * 0.6, at, recover: true }];
  return stepBeats(from, feet, to, { pose: rest, at }, seconds, { recover: true });
}

// THE END OF A FIGHT (Arthur, round 6: "he shouldn't be standing ... he should be, like, tired. And he
// shouldn't be standing there for the next five seconds"). A fight doesn't end by stepping back into a
// tall stand: the figure stays in its fighting stance — feet where the last punch or kick left them — and
// shows how much it has done: the more effort (`tired` 0..1), the lower the hands, the more the knees sag
// and the harder and quicker it breathes. It is short (a few breaths); the scene then holds the pose.
// BALANCE (balance.ts; Arthur, round 8: slumped forward over its front foot, "it looks like he's supposed
// to be falling ... just lean his back a little — not by a mile"): the back leans only a little more than
// in the guard (REST_LEAN when completely tired), the tiredness goes into the knees (REST_SAG lower
// hips), and the hips settle where the weight is over the middle of the feet.
// RESTING HANDS (Arthur, round 9: "when he's done fighting, his arms got to lower a bit more so I can
// visually see a change, so he looks like he's actually resting. His hands are still up, but not up to his
// chest: a little lower than his chest"): whatever stance it fought in (a guard at the chin or loose hands
// at the chest), resting the hands sink clearly BELOW the chest — a little tired: just under the chest;
// completely tired: the elbows hang by the sides and the hands are down at the belly — but still in front
// with the forearms pointing forward (never hanging straight down). REST_ARMS: world arms, so the rule
// holds for any fighting stance.
// SMALL BREATHS (Arthur, round 8: "the huff and puff is a little big; humans breathe hard but only move a
// little"): a breath lifts the chest a little (the back straightens a degree or two, the shoulders rise a
// few pixels) and the hands just ride along with the shoulders; breathing HARD shows in how quick the
// breaths are, not how big.
// REALLY TIRED (Arthur, round 8: "if he's REALLY tired he bends down, arms extended fully onto his knees,
// huffing and puffing"): `tired` can go past 1 — it is the effort so far over what makes a body tired
// (plan.ts). From REALLY_TIRED on (twice that effort, or a tired or hurt body that has fought a lot), the
// fight ends bent over with straight arms propped on the knees (turn.ts catchBreath, staying down) — the
// planner picks that instead of this stance.
const REST_LEAN = 6, REST_SAG = 0.006;
// (STAND UP STRAIGHT: how much lower than standing tall the hips are with the longer-reaching leg nearly straight.)
const restDrop = (feet: Feet, at: number) => Math.max(0.004, ...[feet.l, feet.r].map((foot) => STAND_HIP - Math.sqrt(Math.max(0, (LEG * 0.992) ** 2 - (foot - at) ** 2))));
// Resting arms (world angles: 0 = straight down, 90 = forward), a little tired -> completely tired. The lead
// (l) hand a little higher and further out than the rear one.
const REST_ARMS: Record<"fresh" | "spent", Record<Side, WorldArm>> = {
  fresh: { l: { upper: 18, fore: 100 }, r: { upper: 10, fore: 94 } },
  spent: { l: { upper: 8, fore: 80 }, r: { upper: 2, fore: 74 } },
};
export const REALLY_TIRED = 2;
export function fightRest(start: Stance, params: { tired?: number }, settings: MoveSettings): MoveOutput {
  const k = clamp(params.tired ?? 1, 0, 1);
  const feet = feetOf(start.pose);
  const lean = GUARD.lean + 2 + REST_LEAN * k;
  // RESTING HANDS: below the chest, lower the more tired, still in front (the lead hand a little higher).
  const restArm = (side: Side, raise: number): WorldArm => {
    const arm = blendArm(REST_ARMS.fresh[side], REST_ARMS.spent[side], k);
    return { upper: arm.upper + raise, fore: arm.fore + raise };
  };
  const arms = (raise: number) => ({ ...armFromWorld(lean, "l", restArm("l", raise)), ...armFromWorld(lean, "r", restArm("r", raise)) });
  // (The feet don't move: the hips settle over them.)
  // STAND UP STRAIGHT (Arthur, round 13: "he needs to be standing, bro"): resting, the legs are nearly
  // straight under the hips — BOTH legs, front and back (restDrop) — tired shows in the back, the head and
  // the hands; the knees give only a touch: never a half-crouch or a lunge.
  const posed = (at: number, extraLean: number, raise: number, rise: number) =>
    plantedLegs(withPose(GUARD, { lean: lean + extraLean, head: GUARD.head + 4 * k, ...arms(raise) }), feet, at, restDrop(feet, at) + 0.004 + REST_SAG * k - rise);
  // (STAND UP STRAIGHT: the hips over the middle of the feet — balanced, but never hanging over one bent leg.)
  const mid = (feet.l + feet.r) / 2;
  const at = mid + clamp(balancedHips((x) => posed(x, 0, 0, 0), [feet.l, feet.r]) - mid, -0.018, 0.018);
  const rest = posed(at, 0, 0, 0);
  // Breathing hard: the chest lifts a little (the back straightens a touch, the shoulders rise, the hands ride along).
  const inhale = posed(at, -(1 + 1.5 * k), 1 + 1.5 * k, 0.003 + 0.004 * k);
  const breaths = k >= 0.9 ? 3 : 2;
  const pace = 0.62 - 0.14 * k; // seconds per breath: quicker when more tired
  const beats: PlacedBeat[] = [{ kind: "settle", pose: rest, seconds: 0.45, at, name: "tired" }];
  for (let i = 0; i < breaths; i += 1) beats.push({ kind: "settle", pose: inhale, seconds: pace * 0.45, at }, { kind: "settle", pose: rest, seconds: pace * 0.55, at });
  // Breathing keeps its own clock.
  return placedBeatsToKeys(start, beats, { ...settings, speed: "normal", style: isRobot(settings) ? "robot" : "natural" });
}

// ---- Punch ------------------------------------------------------------------------------------

// THE PUNCH RULES (Arthur's review, round 4, 2026-10-04: "You don't always do an overhand punch... If
// someone's far, you can do an overhand. If someone's close, you can do an uppercut to their chin. You got
// to teach the engine this. It needs to be smart."). A fighter picks HOW to punch from where the target
// is, and so does the engine. Every shape below is worked out from the body (bone lengths, bend limits,
// the stance) and the target — none is a drawn frame — so the engine can throw punches it was never shown.
// - CLOSE (the target is within one arm's length of the shoulder: no room to straighten the arm):
//   UPPERCUT. Wind-up: the knees dip, the fist drops DOWN and back beside the hip. Action: the legs push,
//   the body rises and leans in, the fist scoops forward and drives UP to the chin with the elbow bent.
// - MEDIUM (a straight arm reaches it, the hips driving forward): STRAIGHT (a jab or a cross). A small
//   wind-up — a strong punch in miniature (round 8): the elbow goes back a little behind the spine, the
//   fist tucked in by the chest — then the fist goes straight to the target.
// - FAR (out of a straight arm's reach), or — when no distance is given — a big power shot with the rear
//   hand: OVERHAND with a step (see THE OVERHAND below).
// Every wind-up goes the opposite way from its action (INPUT BEHIND, OUTPUT IN FRONT, below) and grows
// with power; every punch ends back in the guard, where the next punch or kick starts (FLOW). Only when
// nothing follows does the figure stand.

// "front" = the lead hand (the l-side arm, on the side of the front foot); "back" = the rear hand (r).
// `technique`: "auto" (default) chooses by the rules above. `distance`: px, hip to hip, to the target (a
// same-size opponent facing this figure); without it, "auto" chooses by power.
// (`targetHeight`: x height above the ground, overrides `height` — e.g. the head of someone bent over.)
export type PunchTechnique = "straight" | "power" | "overhand" | "uppercut";
// `arriving`: straight out of a walk, jog or run (the planner sets it: STRIKE OUT OF THE STRIDE).
export type PunchParams = { hand?: "front" | "back"; height?: "head" | "body"; technique?: "auto" | PunchTechnique; distance?: number; targetHeight?: number; arriving?: boolean };
export const PUNCH_DEFAULTS: Required<Omit<PunchParams, "distance" | "targetHeight" | "arriving">> = { hand: "back", height: "head", technique: "auto" };

// Target heights above the ground (x height) on a same-size opponent: the middle of the head, the chin
// (the bottom front of the head, where an uppercut lands) and the chest.
export const PUNCH_HEIGHTS = (() => {
  const head = -unitBody(STAND).head.y;
  return { head, chin: head - HEAD_RADIUS.normal * Math.SQRT1_2, chest: -unitBody(STAND).neck.y - 0.1 };
})();
// Their head sits above their hips, so their face is a head's radius in front of their hips.
const FACE_AHEAD = HEAD_RADIUS.normal;
const TORSO = PROPORTIONS.torso;
const ARM = UPPER_ARM + FOREARM;
// How far the hips may drive toward the front foot at a hit (share of the stance from the back foot).
const DRIVE_MIN = 0.35, DRIVE_MAX = 0.8;
// The biggest wind-up (x a natural punch's): an angry, full-energy punch winds up a little bigger.
const MAX_SIZE = 1.25;

// Everything a punch needs to know about the body that throws it.
type PunchBody = {
  p: Side; // the punching arm
  g: Side; // the other arm
  fist: "lHand" | "rHand";
  rear: boolean; // the rear hand (more body behind it)
  power: number; // how hard (powerOf: energy and style)
  size: number; // how big the wind-up is: grows with power, up to a little past a natural punch's (1)
  height: "head" | "body";
  aim: number; // the target's height above the ground (x height)
  feet0: Feet; // where the feet are at the start
  feet: Feet; // the fighting stance
  gAt: number; // where the hips are in the guard (x height from the start)
  guard: PoseAngles;
  back: PoseAngles; // where the hands come back to after the strike (the FLOW pose)
  ready: boolean; // already in the guard (flowing from another punch or kick)
  startPose: PoseAngles;
  startAt: number;
};

function punchBody(start: Stance, params: PunchParams, settings: MoveSettings): PunchBody {
  const { hand, height } = { ...PUNCH_DEFAULTS, ...params };
  const asked = Number(params.targetHeight);
  const aim = params.targetHeight !== undefined && Number.isFinite(asked) ? clamp(asked, 0.1, 1.2) : height === "head" ? PUNCH_HEIGHTS.head : PUNCH_HEIGHTS.chest;
  const rear = hand === "back";
  const p: Side = rear ? "r" : "l";
  const power = Math.min(1.6, powerOf(settings));
  // Fighting stance: the front foot steps forward unless the figure is already in it.
  const feet0 = feetOf(start.pose);
  const feet = fightFeet(feet0);
  const gAt = guardAt(feet);
  const ready = inGuard(start.pose, feet0);
  // (A strike brings the hands up: from a loose stance the punch first raises them into the guard, then
  // winds up from there exactly as from a boxer's guard — strikes are the same in every FIGHT LOOK.)
  const guard = guardPose(feet, gAt, "realistic");
  // (...and after it, a loose fighter's hands only come HALFWAY back up: between its strikes it doesn't
  // stand in a boxer's guard — FIGHT LOOK. Still close enough to the guard that the next strike flows on.)
  const back = settings.guard === "realistic" ? guard : blendPose(guard, guardPose(feet, gAt, settings.guard), 0.5);
  return { p, g: other(p), fist: `${p}Hand` as const, rear, power, size: Math.min(MAX_SIZE, power), height, aim, feet0, feet, gAt, guard, back, ready, startPose: ready ? start.pose : guard, startAt: ready ? 0 : gAt };
}

// Legs for a pose with the hips at `at` (x height from the start) and both feet planted at `feet`: the
// back leg long but not locked, `extra` lower (the knees bend more).
const legsAt = (pose: PoseAngles, at: number, feet: Feet, extra = 0) => plantedLegs(pose, feet, at, backLegDrop(feet, at) + extra);
// How far in front of the start hips (x height) the fist is, for a pose with the hips at `at`.
const fistAhead = (b: PunchBody, pose: PoseAngles, at: number) => { const body = unitBody(pose); return at + body[b.fist].x - body.hip.x; };
// The fist from the shoulder, and arm angles that put it at a spot from the shoulder.
const fistFrom = (b: PunchBody, pose: PoseAngles) => handFrom(pose.lean, pose[`${b.p}Shoulder`], pose[`${b.p}Elbow`]);
const reachTo = (b: PunchBody, pose: PoseAngles, spot: Point) => { const a = armReach(pose.lean, spot); return withPose(pose, armOf(b.p, a.shoulder, a.elbow)); };
// STRAIGHT MEANS LEVEL (Arthur, round 6: "the most common punch with stick figures ... is a straight
// punch, not a punch up there or down there"). A straight arm at the hit never points up more than
// LEVEL_UP degrees: a target higher than that (a same-size opponent's face, seen from a lunge) is hit as
// high as a nearly level arm reaches. Punching UP is the uppercut's job.
export const LEVEL_UP = 8;
// The punching arm straight out (elbow `bend`), aimed so the fist is `height` above the ground (or as high
// as a nearly level arm reaches).
function aimStraight(b: PunchBody, body: PoseAngles, at: number, feet: Feet, height: number, bend = 2): PoseAngles {
  const aimed = (shoulder: number) => legsAt(withPose(body, armOf(b.p, shoulder, bend)), at, feet);
  const shoulderUp = -unitBody(aimed(90 + body.lean)).neck.y;
  const level = Math.min(height, shoulderUp + ARM * Math.sin(rad(LEVEL_UP)));
  return aimed(solveAngle(30, 160, level, aimed, (pose) => -unitBody(pose)[b.fist].y));
}
// The value in lo..hi at which `f` (growing) reaches `target` (an end of the range when it can't).
function solveValue(lo: number, hi: number, target: number, f: (value: number) => number): number {
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const targetHeight = (b: PunchBody) => b.aim;

// A punch worked out: the wind-up and strike paths (each ends in its named pose), the follow-through and
// where the feet are at the hit (an overhand steps in).
type Shot = {
  windPath: PathBeat[];
  strikePath: PathBeat[];
  windup: PoseAngles;
  windAt: number;
  hit: PoseAngles;
  hitAt: number;
  follow: PoseAngles;
  followAt: number;
  hitFeet: Feet;
  windBase: number; // base seconds of the wind-up (natural style, normal speed)
  strikeBase: number; // ...and of the strike
};

// A pose part way (u) from one key pose to another: the body blended, the arms set as the world sees them
// (`pArm` punching, `gArm` the other), the legs planted — or, for a step, the front foot in the air part
// way (`swing.u`) to its new spot, `swing.lift` off the ground.
type Anchor = { pose: PoseAngles; at: number; extra: number };
// The punching arm set as the world sees it, its elbow FREE (rig.ts HAND UP, ELBOW FREE): the bend is
// the forearm's turn from the upper arm as given (it may be past 180, folded across), kept in range.
function freeArm(pose: PoseAngles, side: Side, arm: WorldArm): PoseAngles {
  const out = withPose(pose, armOf(side, arm.upper + pose.lean, arm.fore - arm.upper));
  const [lo, hi] = jointRange(out, `${side}Elbow`);
  return withPose(out, armOf(side, arm.upper + pose.lean, clamp(arm.fore - arm.upper, lo, hi)));
}
function between(b: PunchBody, a: Anchor, z: Anchor, u: number, pArm: WorldArm, gArm: WorldArm, swing?: { to: Feet; u: number; lift: number }): PathBeat {
  const blended = blendPose(a.pose, z.pose, u);
  const at = a.at + (z.at - a.at) * u, extra = a.extra + (z.extra - a.extra) * u;
  const pose = freeArm(withPose(blended, armFromWorld(blended.lean, b.g, gArm)), b.p, pArm);
  if (!swing) return { pose: legsAt(pose, at, b.feet, extra), at };
  const drop = backLegDrop(b.feet, at) + extra;
  const planted = plantedLegs(pose, b.feet, at, drop, "r");
  const leg = legReach(pose.lean, { x: b.feet.l + (swing.to.l - b.feet.l) * swing.u - at, y: STAND_HIP - drop - swing.lift });
  return { pose: { ...planted, ...legOf("l", leg.hip, leg.knee) }, at, contacts: ["rFoot"] };
}

// ---- INPUT BEHIND, OUTPUT IN FRONT ----

// Arthur, round 7: "Anticipation is always the opposite direction of where the output is going. Input
// (acceleration) is always BEHIND the stick figure; output in front." Before every strike the fist (or
// foot) first goes BACK, toward and behind the body, the opposite way from where the strike will go:
// - a light (straight) punch: the elbow goes back, a little behind the spine, the opposite way from the
//   target (A LIGHT PUNCH IS A STRONG PUNCH IN MINIATURE, below);
// - a punch that comes DOWN (power / overhand): the fist goes UP and back, behind the head;
// - a punch that goes UP (uppercut): the fist drops DOWN and back, beside the hip;
// - a kick: the leg swings back behind the body.
// Only the strike itself happens in front. And the arms counter-move (Arthur: "when one arm punches,
// the other one pulls back"): while the punching fist goes back the other hand goes a little out, and
// while the fist goes out the other hand pulls back to the face — so punches thrown left, right, left,
// right look like pistons.

// "Almost touching the head": a hand pulled back to the face (the other hand, as a fist goes out) stops
// this far from the middle of the head (x the head's radius). The rear (r) hand is on the far side,
// beside the face, so it may come closer.
const FACE_TOUCH = { near: 1.25, far: 1.05 };
const touchOf = (side: Side) => HEAD_RADIUS.normal * (side === "l" ? FACE_TOUCH.near : FACE_TOUCH.far);
// Where the middle of the head is from the shoulder (x height, facing right, +y down) for a pose.
const headFrom = (pose: PoseAngles): Point => { const s = unitBody(pose); return { x: s.head.x - s.neck.x, y: s.head.y - s.neck.y }; };
// The other hand pulled back to the face: almost touching it, in front of the chin (CHIN_SIDE degrees
// from straight down toward the front, seen from the middle of the head).
const CHIN_SIDE = 55;
function handToFace(pose: PoseAngles, side: Side): Partial<PoseAngles> {
  const head = headFrom(pose), d = down(CHIN_SIDE), touch = touchOf(side);
  const a = armReach(pose.lean, { x: head.x + d.x * touch, y: head.y + d.y * touch });
  return armOf(side, a.shoulder, a.elbow);
}

// A LIGHT PUNCH IS A STRONG PUNCH IN MINIATURE (Arthur, round 8, with a drawing: "Imagine a strong punch,
// but miniature." "Input is always opposite of the output. If you're going to punch straight, the input
// should not be straight, it should be the opposite — that's why the elbow is a little behind the spine."
// "Imagine a dot floating where you have to punch: anticipation goes in the opposite direction of that
// dot, then the punch hits the bullseye — same if the dot is above his head or around his waist.")
// A jab's wind-up is the power punch's — the elbow goes back, the arm loads, the other arm stays up — only
// small: the punching ELBOW goes back the opposite way from the target, past the body line to a little
// behind the spine, the arm folded so the fist is tucked in close in front of the chest; then the fist goes
// straight to the target. It is worked out from the line from the shoulder to the target, so it works for
// any target: a target lower than the shoulder (a dot at the waist) sends the elbow up and back, a higher
// one down and back.
// The upper arm points the opposite way from that line, tipped down by MINI_TIP degrees (a level punch
// draws the elbow back and down, about 30 degrees behind straight down, as in Arthur's drawing) — a little
// less for a weak punch, a little more for a hard one — and always at least MINI_BEHIND degrees behind
// straight down, so the elbow is behind the spine.
const MINI_TIP = 60;
const MINI_BEHIND = 18;
// The forearm folds nearly as far as the elbow bends (5 degrees short): the fist tucked in.
const MINI_FOLD = ELBOW_MAX - 5;
function miniWindupArm(line: number, size: number): WorldArm {
  const upper = clamp(line - 180 + MINI_TIP - 15 * (Math.min(MAX_SIZE, size) - 1), -150, -MINI_BEHIND);
  return { upper, fore: upper + MINI_FOLD };
}
// Meanwhile the other hand stays up by the face (as in the guard), just this much further out (x height):
// it pulls back to the face as the fist goes out (the arms counter-move).
const FREE_OUT = 0.03;

// ---- Straight (jab / cross) ----

// How far the body leans into a straight punch: the rear hand has more body behind it. A jab at a far
// target leans in further, up to as far as a cross (`extra`).
const straightLean = (b: PunchBody, rear = b.rear) => GUARD.lean + (rear ? 4 + 7 * b.power : 3 + 3 * b.power);
// The hit: the hips drive forward (`share` of the stance), the body leans into it, the arm snaps
// straight at the target height and the other hand pulls back to the face (the arms counter-move).
function straightHit(b: PunchBody, share: number, extra = 0) {
  const lean = straightLean(b) + extra;
  const leaning = withPose(GUARD, { lean, head: 3 });
  const body = withPose(leaning, handToFace(leaning, b.g));
  const at = stanceAt(b.feet, share);
  return { at, pose: aimStraight(b, body, at, b.feet, targetHeight(b)) };
}

function straightShot(b: PunchBody, target: number | undefined): Shot {
  // How far the hips drive: by power, or just as far as it takes for the fist to land on the target (and
  // if that is not enough, the body leans in further).
  const landing = (s: number, extra = 0) => { const h = straightHit(b, s, extra); return fistAhead(b, h.pose, h.at); };
  const share = target === undefined
    ? Math.min(DRIVE_MAX, GUARD_SHARE + 0.13 * b.power * (b.rear ? 1 : 0.55))
    : solveValue(DRIVE_MIN, DRIVE_MAX, target, (s) => landing(s));
  const extra = target === undefined ? 0 : solveValue(0, straightLean(b, true) - straightLean(b), target, (e) => landing(share, e));
  const { at: hitAt, pose: hit } = straightHit(b, share, extra);
  // A small wind-up, but a real one, the opposite way (INPUT BEHIND; A LIGHT PUNCH IS A STRONG PUNCH IN
  // MINIATURE): the body leans back a little and the hips shift back, the punching elbow goes back the
  // opposite way from the target to a little behind the spine (the fist tucked in by the chest), and the
  // other hand goes a little out, still up by the face; then the fist goes straight to the target while
  // the other hand pulls back to the face.
  const body = windUp(b.guard, hit, 0.5, { lean: 0.8 });
  const windAt = b.gAt - 0.2 * (hitAt - b.gAt);
  const to = fistFrom(b, hit);
  const guardHand = handFrom(b.guard.lean, b.guard[`${b.g}Shoulder`], b.guard[`${b.g}Elbow`]);
  const out = armReach(body.lean, { x: guardHand.x + FREE_OUT, y: guardHand.y });
  const loaded = armFromWorld(body.lean, b.p, miniWindupArm(Math.atan2(to.x, to.y) * DEG, b.size));
  const windup = legsAt(withPose(body, { ...armOf(b.g, out.shoulder, out.elbow), ...loaded }), windAt, b.feet);
  const pulled = fistFrom(b, windup);
  const along = (u: number): PathBeat => {
    const pose = blendPose(windup, hit, u), at = windAt + (hitAt - windAt) * u;
    return { pose: legsAt(reachTo(b, pose, { x: pulled.x + (to.x - pulled.x) * u, y: pulled.y + (to.y - pulled.y) * u }), at, b.feet), at };
  };
  // Follow-through: a tiny bit further, slowing to a stop at full reach (the punch "lands").
  const followAt = hitAt + 0.006 * b.power;
  const follow = legsAt(withPose(hit, { lean: hit.lean + 2 * b.power, ...armOf(b.p, hit[`${b.p}Shoulder`] + 2, 4) }), followAt, b.feet);
  return {
    windPath: [{ pose: windup, at: windAt, name: "windup" }],
    strikePath: [along(0.35), along(0.7), { pose: hit, at: hitAt, name: "hit" }],
    windup, windAt, hit, hitAt, follow, followAt, hitFeet: b.feet, windBase: 0.16, strikeBase: 0.12,
  };
}

// ---- Uppercut (close) ----

// At the hit the forearm drives up nearly upright, tipped toward the target (world direction, 180 = up).
const UPPERCUT_FOREARM = 165;
// In the wind-up the fist hangs this far behind the shoulder's line (x height, x the wind-up's size).
const UPPERCUT_BACK = 0.04;
// How far up (share of the way) the scooping strike's path bends from forward to up.
const UPPERCUT_SCOOP = 0.35;

// The hit: the legs push (the hips rise above the guard), the body leans in, the elbow is bent and the
// fist is up at the target's chin (or chest, for a body shot); the other hand pulls back to the face.
function uppercutHit(b: PunchBody, share: number) {
  const lean = GUARD.lean + 4 + 6 * b.size;
  const leaning = withPose(GUARD, { lean, head: 0 });
  const body = withPose(leaning, handToFace(leaning, b.g));
  const at = stanceAt(b.feet, share);
  const height = b.height === "head" ? PUNCH_HEIGHTS.chin : PUNCH_HEIGHTS.chest;
  const posed = (upper: number) => legsAt(withPose(body, armFromWorld(lean, b.p, { upper, fore: UPPERCUT_FOREARM })), at, b.feet);
  // The upper arm comes up (from pointing down-forward) until the fist is at the target height.
  return { at, pose: posed(solveValue(UPPERCUT_FOREARM - ELBOW_MAX, 100, height, (upper) => -unitBody(posed(upper))[b.fist].y)) };
}

function uppercutShot(b: PunchBody, target: number | undefined): Shot {
  const k = b.size;
  // The fist lands on the chin, under the front of the face.
  const chin = target === undefined ? undefined : target + FACE_AHEAD * (1 - Math.SQRT1_2);
  const share = chin === undefined
    ? GUARD_SHARE + 0.1 * k
    : solveValue(DRIVE_MIN, DRIVE_MAX, chin, (s) => { const h = uppercutHit(b, s); return fistAhead(b, h.pose, h.at); });
  const { at: hitAt, pose: hit } = uppercutHit(b, share);
  // Wind-up, the opposite way from the action (INPUT BEHIND: the action goes UP and in, so the wind-up
  // goes DOWN and back): the knees dip, the body leans back a little and the fist drops low and back —
  // beside the hip, a little behind the shoulder's line (Arthur, round 7: "punching up, anticipation
  // down"), the arm hanging, slightly bent. All of it grows with power.
  const dip = 0.02 + 0.03 * k;
  const windAt = b.gAt - 0.1 * (hitAt - b.gAt);
  const low = { x: -UPPERCUT_BACK * k, y: (1.35 + 0.35 * Math.min(1, k)) * UPPER_ARM };
  const windup = legsAt(reachTo(b, withPose(b.guard, { lean: GUARD.lean - (2 + 3 * k) }), low), windAt, b.feet, 0.012 + dip);
  // The strike SCOOPS: from beside the hip the fist swings forward first, then drives up to the chin while
  // the legs push (its path bends from forward to up, UPPERCUT_SCOOP of the way up at the bend).
  const to = fistFrom(b, hit);
  const bend = { x: to.x, y: low.y + UPPERCUT_SCOOP * (to.y - low.y) };
  const scoop = (u: number): Point => ({
    x: (1 - u) ** 2 * low.x + 2 * u * (1 - u) * bend.x + u * u * to.x,
    y: (1 - u) ** 2 * low.y + 2 * u * (1 - u) * bend.y + u * u * to.y,
  });
  const along = (u: number): PathBeat => {
    const pose = blendPose(windup, hit, u), at = windAt + (hitAt - windAt) * u;
    return { pose: legsAt(reachTo(b, pose, scoop(u)), at, b.feet, (0.012 + dip) * (1 - u)), at };
  };
  // Follow-through: a little higher, leaning in a little more.
  const followAt = hitAt + 0.004 * b.power;
  const follow = legsAt(reachTo(b, withPose(hit, { lean: hit.lean + 1.5 * b.power }), { x: to.x + 0.01, y: to.y - 0.02 }), followAt, b.feet);
  return {
    windPath: [{ pose: windup, at: windAt, name: "windup" }],
    strikePath: [along(0.35), along(0.7), { pose: hit, at: hitAt, name: "hit" }],
    windup, windAt, hit, hitAt, follow, followAt, hitFeet: b.feet, windBase: 0.2, strikeBase: 0.12,
  };
}

// ---- Overhand (far, or a big power shot) ----

// THE OVERHAND (Arthur's description and screenshot, round 4; path fixed after his round-5 review:
// "it went around his head and then it went around his head again... You have permission for the elbow
// to go past the head, go straight, not around the head").
// WIND-UP: from the guard the punching ELBOW SWINGS DOWN AND BACK, then up behind the head, while the
// fist stays by the face, into the COCKED pose — upper arm back at about shoulder height, forearm
// slanting up and forward, the fist up behind the head — while the other arm comes forward and points
// at the target (the arms switch), the body leans back a little and the weight sinks onto the back leg.
// STRIKE: the FIST LEADS — the forearm swings the fist forward and down past the head while the elbow
// is still back — then the ELBOW COMES FORWARD UNDER THE FIST and the arm straightens at the target,
// while the pointing arm pulls back behind the body (the arms switch again), the front foot steps in and
// the body leans FORWARD onto it (the weight of the arm), like in a run.
// The hand stays up the whole time, so the elbow is free (rig.ts HAND UP, ELBOW FREE): the forearm
// crosses the upper arm (the bend passes through 180) instead of the arm swinging up straight over the
// head. No arm ever points straight up and nothing circles the head.

// An elbow is kept this many degrees short of its bend limit.
const FOLD_MARGIN = 2;
// How far the shoulder must turn (from the body's line) before a raised elbow may fold fully backward
// (worked out from rig.ts elbowRange).
const FULL_TURN = (() => {
  for (let s = 70; s < 180; s += 0.25) if (elbowRange(s)[0] <= -ELBOW_BACKWARD_MAX + 1e-6) return s;
  return 180;
})();
// An arm pointing forward may look bent backward only when it points at least this far above level, or
// while its hand is held up (rig.ts HAND UP, ELBOW FREE).
export const RAISED_ABOVE_LEVEL = 30;
// THE COCKED ARM (Arthur's screenshot): the upper arm points straight back, the elbow lifted `rise`
// degrees above the shoulder (at least so far that the shoulder turns enough for the elbow to fold fully),
// and the forearm folds up as far as the elbow goes, slanting forward: the fist is up behind the head.
export function cockedPunchArm(lean: number, rise: number): WorldArm {
  const upper = Math.min(-90 - rise, -FULL_TURN - lean);
  return { upper, fore: upper + elbowRange(upper + lean)[0] + FOLD_MARGIN };
}
// The strike, first part: the elbow drops only this much while the forearm swings the fist forward and
// down past the head, until the forearm has just crossed back over the upper arm (bent LEAD_FOLD).
const LEAD_DROP = 8;
const LEAD_FOLD = 184;
// Then the elbow comes forward under the fist: the upper arm points down and a little back, the forearm
// folded up past it so the fist is just in front of the chin.
const UNDER_ARM: WorldArm = { upper: -20, fore: 150 };
// How far through the strike (body and hips) the elbow has come under the fist, at the start of its line,
// and where on the line (share of it) the in-between poses are.
const LINE_START = 0.32;
const LINE_STEPS = [0.16, 0.32, 0.48, 0.64, 0.78, 0.9];
// An overhand's path bows up by this much (x its length) and so comes down onto the target.
const OVERHAND_ARC = 0.18;
// The pointing arm pulled back behind the body at the hit, like the back arm in a run.
const behindArm = (k: number): WorldArm => ({ upper: -(55 + 25 * k), fore: -(55 + 25 * k) + 100 });
// The hips may drive at most this far in front of the planted back foot (x height): any further and the
// back leg can only reach its foot with the hips dropping low.
const HIPS_AHEAD_MAX = DRIVE_MAX * STANCE_WIDTH;
// Into the hit the front foot steps in a little (it takes the weight); more with power.
const strikeStep = (b: PunchBody) => 0.2 * STANCE_WIDTH * b.size;
// A target further than the overhand reaches with the back foot planted: the figure first steps in (front
// foot, then back foot), up to half a stance length. Further still, it should walk closer first.
const MAX_APPROACH = 0.5 * STANCE_WIDTH;
// (A step in is never tiny: when one is needed it is at least this long, and the hips then drive a little
// less so the fist still lands on the target.)
const MIN_APPROACH = 0.15 * STANCE_WIDTH;

// The hit: the front foot has stepped in, the hips drive onto it (`share` of the stance, as far as the
// back leg allows when not given), the body leans forward, the punching arm is straight at the target
// and the other arm is back behind the body.
function overhandHit(b: PunchBody, share?: number) {
  const feet: Feet = { r: b.feet.r, l: b.feet.l + strikeStep(b) };
  const most = Math.min(DRIVE_MAX, HIPS_AHEAD_MAX / (feet.l - feet.r));
  const lean = GUARD.lean + 6 + 10 * b.size;
  const body = withPose(GUARD, { lean, head: 2, ...armFromWorld(lean, b.g, behindArm(b.size)) });
  const at = stanceAt(feet, Math.min(most, share ?? most));
  return { at, feet, lean, pose: aimStraight(b, body, at, feet, targetHeight(b)) };
}
// Where an overhand lands at the most (x height from the start hips), with the back foot planted.
const overhandReach = (b: PunchBody) => { const h = overhandHit(b); return fistAhead(b, h.pose, h.at); };

// Stepping in before an overhand at a far target: the front foot steps `travel` forward, then the back
// foot follows; the figure ends in its guard `travel` further on.
function approachBeats(b: PunchBody, travel: number): PlacedBeat[] {
  const wide: Feet = { r: b.feet.r, l: b.feet.l + travel };
  const wideAt = stanceAt(wide, 0.5);
  const widePose = guardPose(wide, wideAt, "realistic");
  const moved: Feet = { r: b.feet.r + travel, l: b.feet.l + travel };
  return [
    ...stepBeats({ pose: b.startPose, at: b.startAt }, b.feet, wide, { pose: widePose, at: wideAt }, 0.36),
    ...stepBeats({ pose: widePose, at: wideAt }, wide, moved, { pose: b.guard, at: b.gAt + travel }, 0.32),
  ];
}
// The same body, `travel` further on, in its guard.
const movedBody = (b: PunchBody, travel: number): PunchBody =>
  ({ ...b, feet: { r: b.feet.r + travel, l: b.feet.l + travel }, gAt: b.gAt + travel, startPose: b.guard, startAt: b.gAt + travel });

function overhandShot(b: PunchBody, target: number | undefined, arc = false): Shot {
  const k = b.size;
  // How far the hips drive: as far as the back leg allows, or just far enough for the fist to land on
  // the target.
  const share = target === undefined ? undefined : solveValue(DRIVE_MIN, DRIVE_MAX, target, (sh) => { const h = overhandHit(b, sh); return fistAhead(b, h.pose, h.at); });
  const { at: hitAt, feet: hitFeet, pose: hit } = overhandHit(b, share);

  // The cocked pose: weight back (hips toward the back foot and lower, the back knee bent), upright to
  // leaning back a little, the cocked arm, and the other arm pointing straight at the target.
  const windAt = stanceAt(b.feet, GUARD_SHARE - (0.12 + 0.16 * k));
  const windLean = GUARD.lean - (4 + 8 * k);
  const windExtra = 0.012 + 0.04 * k;
  const cocked = cockedPunchArm(windLean, 4 + 6 * k);
  const strikeAt = fistFrom(b, hit);
  const aim = aimArm(windLean, { x: strikeAt.x, y: Math.max(strikeAt.y, -0.04) }, 0.995);
  const windup = legsAt(withPose(b.guard, { lean: windLean, head: GUARD.head + 2, ...armFromWorld(windLean, b.p, cocked), ...armOf(b.g, aim.shoulder, aim.elbow) }), windAt, b.feet, windExtra);

  const start: Anchor = { pose: b.startPose, at: b.startAt, extra: 0.012 };
  const wound: Anchor = { pose: windup, at: windAt, extra: windExtra };
  const struck: Anchor = { pose: hit, at: hitAt, extra: 0 };
  const gStart = worldArm(b.startPose, b.g), gAim = worldArm(windup, b.g), gBack = worldArm(hit, b.g);
  // The cocked arm with its forearm turned the "across" way from the guard (fore - upper past 180).
  const pStart = worldArm(b.startPose, b.p);
  const cockedAcross: WorldArm = { upper: cocked.upper, fore: cocked.fore + 360 * Math.round((pStart.fore - cocked.fore) / 360) };
  // The elbow leads the way back and the forearm folds after it: `swing` of the upper arm's turn and
  // `fold` of the elbow's, so the forearm crosses the upper arm while the elbow points back (a chicken
  // wing, the fist by the chin) — never while the arm hangs down.
  const windArm = (swing: number, fold: number): WorldArm => {
    const upper = pStart.upper + (cockedAcross.upper - pStart.upper) * swing;
    const bend = pStart.fore - pStart.upper + (cockedAcross.fore - cockedAcross.upper - (pStart.fore - pStart.upper)) * fold;
    return { upper, fore: upper + bend };
  };
  const windPath: PathBeat[] = [
    // The punching elbow swings down and back (the fist stays by the chin); the other arm starts forward.
    between(b, start, wound, 0.4, windArm(0.55, 0.27), blendArm(gStart, gAim, 0.5)),
    // ...straight back, the fist folding up past it by the chin; the other arm is nearly pointing.
    between(b, start, wound, 0.75, windArm(0.88, 0.52), blendArm(gStart, gAim, 0.85)),
    { pose: freeArm(windup, b.p, cockedAcross), at: windAt, name: "windup" },
  ];

  // THE STRIKE (Arthur, round 6: "your fist has to go STRAIGHT to where the arrows are. That's all your arm
  // has to do"). The cocked forearm is folded ACROSS the upper arm (rig.ts HAND UP, ELBOW FREE), so on its
  // way to a straight arm the elbow bend passes 180 — the one moment the fist is at the shoulder. The fist
  // gets there FIRST, the shortest way, forward past the head while the elbow is still back; then the elbow
  // comes forward under it and the fist travels the punch's LINE: straight from the shoulder to the target
  // (or, for an overhand, arcing over and coming DOWN onto it). The body comes a little behind the arm and
  // leans forward into the hit (the weight of the arm); the pointing arm goes back (the arms switch).
  const leadUpper = cockedAcross.upper + LEAD_DROP;
  const lead: WorldArm = { upper: leadUpper, fore: leadUpper + LEAD_FOLD };
  const stepping = hitFeet.l - b.feet.l > 0.01;
  const swing = (u: number, lift: number) => (stepping ? { to: hitFeet, u, lift } : undefined);
  const gArm = (u: number) => blendArm(gAim, gBack, u);
  // Where a joint is on the stage (x height from the start hips, up = -y) for a pose with the hips at `at`.
  const onStage = (pose: PoseAngles, at: number, joint: JointName): Point => { const body = unitBody(pose); return { x: at + body[joint].x - body.hip.x, y: body[joint].y }; };
  // 1. The fist forward and down past the head to the shoulder, the elbow still back.
  const leadBeat = between(b, wound, struck, LINE_START * 0.6, lead, gArm(0.08), swing(0.15, 0.03));
  // 2. The elbow drops under the fist (the fist just in front of the shoulder): the start of the line.
  const underBeat = between(b, wound, struck, LINE_START, UNDER_ARM, gArm(LINE_START), swing(0.3, 0.045));
  const from = onStage(underBeat.pose, underBeat.at, b.fist), to = onStage(hit, hitAt, b.fist);
  // 3. Along the line, the arm straightening as it goes; an overhand's line bows up by OVERHAND_ARC x its
  // length.
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const bow = arc ? OVERHAND_ARC * length : 0;
  const onLine = (u: number): Point => ({ x: from.x + (to.x - from.x) * u + (bow * 4 * u * (1 - u) * (to.y - from.y)) / length, y: from.y + (to.y - from.y) * u - (bow * 4 * u * (1 - u) * (to.x - from.x)) / length });
  const lineBeats = LINE_STEPS.map((u) => {
    const k = LINE_START + (1 - LINE_START) * u;
    const beat = between(b, wound, struck, k, UNDER_ARM, gArm(k), swing(0.3 + 0.7 * u, 0.045 * (1 - u) + 0.01));
    const shoulder = onStage(beat.pose, beat.at, "neck"), fist = onLine(u);
    return { ...beat, pose: reachTo(b, beat.pose, { x: fist.x - shoulder.x, y: fist.y - shoulder.y }) };
  });
  const strikePath: PathBeat[] = [leadBeat, underBeat, ...lineBeats, { pose: hit, at: hitAt, name: "hit" }];
  // Follow-through: a tiny bit further, slowing to a stop at full reach.
  const followAt = hitAt + 0.006 * b.power;
  const follow = legsAt(withPose(hit, { lean: hit.lean + 2 * b.power, ...armOf(b.p, hit[`${b.p}Shoulder`] + 2, 4) }), followAt, hitFeet);
  // (The fist travels further than in a straight punch — over the head — so the strike takes a little longer.)
  return { windPath, strikePath, windup: windPath[windPath.length - 1].pose, windAt, hit, hitAt, follow, followAt, hitFeet, windBase: 0.42, strikeBase: 0.15 };
}

// ---- Choosing and throwing ----

// THE REACH RULE: where the target is decides the punch. All of it is body facts in body heights (bone
// lengths, the stance), so a figure of any size makes the same choice at the same distance in body
// heights. Reaches are where the fist can land, from the start hips (x height):
// - close: one arm's length (upper arm + forearm) in front of the shoulder in the guard — inside it the
//   arm has no room to straighten;
// - straight: a straight arm with the hips driven to the front of the stance, leaning in;
// - overhand: a straight arm with the hips driven onto the front foot, after stepping in (MAX_APPROACH).
function punchReach(b: PunchBody) {
  const close = b.gAt + TORSO * Math.sin(rad(GUARD.lean)) + ARM;
  const straight = straightHit(b, DRIVE_MAX, straightLean(b, true) - straightLean(b));
  return { close, straight: fistAhead(b, straight.pose, straight.at), overhand: overhandReach(b) + MAX_APPROACH };
}

// The punch "auto" picks, and the distances (px, hip to hip, for this figure's height) up to which a
// target counts as close (uppercut), reachable with a straight punch, and reachable at all (an overhand
// after stepping in: further away the planner should walk closer first).
// (`overhandUpTo` is the reach of the wound-up punches: "power" and "overhand" reach equally far.)
export type PunchChoice = { technique: PunchTechnique; closeUpTo: number; straightUpTo: number; overhandUpTo: number };
export function choosePunch(start: Stance, params: PunchParams, settings: MoveSettings): PunchChoice {
  return chooseFor(punchBody(start, params, settings), params, settings).choice;
}
function chooseFor(b: PunchBody, params: PunchParams, settings: MoveSettings): { choice: PunchChoice; target?: number } {
  const reach = punchReach(b);
  // Where the target's face is, from the start hips (x height).
  const distance = Number(params.distance);
  const target = params.distance === undefined || !Number.isFinite(distance) ? undefined : distance / settings.height - FACE_AHEAD;
  const asked = params.technique ?? PUNCH_DEFAULTS.technique;
  // A wound-up punch at a LOW target (more than a forearm under the shoulder, e.g. someone bent over)
  // comes over the top and down onto it: an overhand.
  const low = b.aim < -unitBody(b.guard).neck.y - FOREARM;
  const technique: PunchTechnique = asked !== "auto" ? asked
    : target === undefined ? (b.rear && b.power >= COCK_POWER ? (low ? "overhand" : "power") : "straight")
    : target <= reach.close ? "uppercut" : target <= reach.straight ? "straight" : low ? "overhand" : "power";
  const px = (x: number) => (x + FACE_AHEAD) * settings.height;
  return { choice: { technique, closeUpTo: px(reach.close), straightUpTo: px(reach.straight), overhandUpTo: px(reach.overhand) }, target };
}

export function punch(start: Stance, params: PunchParams, settings: MoveSettings): MoveOutput {
  const start0 = punchBody(start, params, settings);
  const { choice, target } = chooseFor(start0, params, settings);
  // An overhand at a target out of its reach steps in first (and ends that much further on).
  const wound = choice.technique === "power" || choice.technique === "overhand";
  const short = wound && target !== undefined ? target - overhandReach(start0) : 0;
  const travel = short > 1e-3 ? clamp(short, MIN_APPROACH, MAX_APPROACH) : 0;
  const approach = travel > 0 ? approachBeats(start0, travel) : [];
  const b = approach.length ? movedBody(start0, travel) : start0;
  const shot = choice.technique === "uppercut" ? uppercutShot(b, target) : wound ? overhandShot(b, target, choice.technique === "overhand") : straightShot(b, target);
  const robot = isRobot(settings);

  // Timing: the strike is fast (speeding up all the way into the hit, within the speed limit); the
  // wind-up is slow next to it (a small one is only seen for a moment, a big one takes its time).
  // (An overhand's elbow swings round under the fist, further than the fist goes: it sets the pace too.)
  const elbow = wound ? (`${b.p}Elbow` as const) : undefined;
  const strikePoses = [shot.windup, ...shot.strikePath.map((beat) => beat.pose)];
  // (...and the hips drive and step forward under it, which the fist's travel from the hips leaves out.)
  // (...and the body tipping forward carries the shoulder, so the arm, forward too.)
  const tip = elbow ? TORSO * Math.abs(Math.sin(rad(shot.hit.lean)) - Math.sin(rad(shot.windup.lean))) : 0;
  const strikeLength = Math.max(chainLength(strikePoses, b.fist), elbow ? chainLength(strikePoses, elbow) : 0) + (elbow ? Math.abs(shot.hitAt - shot.windAt) + tip : 0);
  const hitSeconds = actionSecondsFor(shot.strikeBase, strikeLength, settings);
  const kind = windKind(settings);
  const windLength = chainLength([b.startPose, ...shot.windPath.map((beat) => beat.pose)], b.fist);
  const windSeconds = windupSecondsFor(shot.windBase * (robot ? ROBOT_WINDUP : 1), windLength, strikeLength, beatSeconds("action", hitSeconds, settings), settings, kind);
  const stepped = Math.abs(shot.hitFeet.l - b.feet.l) > 0.01;
  const backToGuard: PlacedBeat[] = stepped
    ? stepBeats({ pose: shot.follow, at: shot.followAt }, shot.hitFeet, b.feet, { pose: b.back, at: b.gAt }, 0.42, { name: "back" })
    : [{ kind: "settle", pose: b.back, seconds: 0.18, at: b.gAt, name: "back" }]; // (round 15: a quick pull-back, so punches can follow every half second — a barrage)

  const beats: PlacedBeat[] = [];
  // Into the guard: the hands come up (and the front foot steps forward) unless already there.
  // STRIKE OUT OF THE STRIDE (round 11, Arthur: "right when he stops jogging, he should do an overhand or an
  // uppercut"): arriving from a walk, jog or run whose last step planted the front foot in a fighting
  // stance (the hands already coming up in that step), there is no settling into the guard first: the
  // wind-up goes on straight from the stride.
  const stridesIn = params.arriving === true && Math.abs(start0.feet.l - start0.feet0.l) <= 0.02;
  if (!start0.ready && !stridesIn) {
    if (Math.abs(start0.feet.l - start0.feet0.l) > 0.02) beats.push(...stepBeats({ pose: start.pose, at: 0 }, start0.feet0, start0.feet, { pose: start0.guard, at: start0.gAt }, 0.42, { name: "guard" }));
    else beats.push({ kind: "settle", pose: start0.guard, seconds: 0.3, at: start0.gAt, name: "guard" });
  }
  beats.push(
    ...approach,
    ...windupThrough(shot.windPath, b.startPose, b.fist, windSeconds, kind),
    ...actionThrough(shot.strikePath, { pose: shot.windup, at: shot.windAt }, b.fist, hitSeconds, settings, elbow),
    { kind: "follow", pose: shot.follow, seconds: 0.1, at: shot.followAt },
    // Back to the guard — the front foot steps back out after an overhand's step — the FLOW pose (the
    // next punch or kick starts from here).
    ...backToGuard,
    ...recoverBeats({ pose: b.back, at: b.gAt }, b.feet, STAND),
  );
  return placedBeatsToKeys(start, beats, settings);
}
