import { forwardKinematics } from "../pose.ts";
import { JOINT_LIMITS, JOINTS, PROPORTIONS, STAND, STAND_FRONT, withPose, type Facing, type PoseAngles, type PoseKey } from "../rig.ts";
import { beatSeconds, beatsToKeys, lerpPose, windUp, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { balancedHips } from "./balance.ts";
import { armReach, feetOf as stanceFeet, plantedLegs, type Feet } from "./punch.ts";
import { RAMP_SCALE } from "./styles.ts";

// SPEC-0017 Phase 2: turning around, looking back, and standing still (breathing).

export const restPoseFor = (facing: Facing): PoseAngles => (facing === "front" ? STAND_FRONT : STAND);

// ---- Shared helpers -------------------------------------------------------------------------

type Side = "l" | "r";
const SIDES: Side[] = ["l", "r"];
const other = (side: Side): Side => (side === "l" ? "r" : "l");
const DEG = 180 / Math.PI;
const LEG = PROPORTIONS.thigh; // thigh and shin are the same length (x height)
const ARM_KEYS: PoseKey[] = ["lShoulder", "lElbow", "rShoulder", "rElbow"];
const limit = (key: keyof typeof JOINT_LIMITS, value: number) => Math.min(JOINT_LIMITS[key][1], Math.max(JOINT_LIMITS[key][0], value));
const isRobot = (settings: MoveSettings) => RAMP_SCALE[settings.style] === 0;
// A robot has no eased wind-up, but still makes its small counter-move first: a short plain beat.
const counterKind = (settings: MoveSettings): Beat["kind"] => (isRobot(settings) ? "settle" : "anticipation");
const ROBOT_COUNTER = 0.55;
const armsOf = (pose: PoseAngles): Partial<PoseAngles> => ({ lShoulder: pose.lShoulder, lElbow: pose.lElbow, rShoulder: pose.rShoulder, rElbow: pose.rElbow });
const blendArms = (a: Partial<PoseAngles>, b: Partial<PoseAngles>, k: number): Partial<PoseAngles> => {
  const out: Partial<PoseAngles> = {};
  for (const key of ARM_KEYS) out[key] = a[key]! + (b[key]! - a[key]!) * k;
  return out;
};

// A body move never gets much quicker than natural, however lively or fast the style: a foot needs time
// to lift, swing round and land, and the chest to turn (otherwise it becomes a spin and the limbs jump
// between frames). Base seconds for a beat, so it lasts at least `floor` x its natural time (TURN_FLOOR
// for a calm move like looking back; a turn in a hurry uses HURRIED_FLOOR).
const TURN_FLOOR = 0.85;
const floored = (kind: Beat["kind"], seconds: number, settings: MoveSettings, floor = TURN_FLOOR) => {
  const unit = beatSeconds(kind, 1, settings);
  return unit > 1e-6 ? Math.max(seconds, (floor * seconds) / unit) : seconds;
};

// The way a knee points on the stage (+1 = to the right): forward in a side view, outward in the front view.
const kneeSign = (facing: Facing, side: Side) => (facing === "right" ? 1 : facing === "left" ? -1 : side === "l" ? -1 : 1);

// Where a pose's feet are (stage x from the hips, x height; + = to the right) and how high it holds the
// hips above the ground (x height), drawn the way the engine stands a body (lowest foot or knee on the ground).
function feetOf(pose: PoseAngles, facing: Facing) {
  const body = forwardKinematics(pose, facing, { x: 0, y: 0 }, 1, "normal", false);
  return { l: body.lFoot.x, r: body.rFoot.x, hip: Math.max(body.lFoot.y, body.rFoot.y, body.lKnee.y, body.rKnee.y) };
}

// ON THE GROUND: sitting, kneeling or lying means the hips are low (under about two thirds of the
// standing height), or the body is bent right over / lying (torso past 50 degrees). A lunge or a deep
// stride is still standing, however far the thigh swings.
export function onTheGround(pose: PoseAngles): boolean {
  return Math.abs(pose.lean) > 50 || feetOf(pose, "right").hip < 0.3;
}

// Thigh and knee angles that put a foot `dx` (stage x, x height) from the hips and `below` under them,
// the knee bending the natural way for the view.
function legTo(facing: Facing, side: Side, dx: number, below: number, lean: number) {
  const out = dx * kneeSign(facing, side);
  const reach = Math.min(2 * LEG, Math.max(1e-6, Math.hypot(out, below)));
  const line = Math.atan2(out, below) * DEG; // the hips-to-foot line, from straight down
  const bend = Math.acos(Math.min(1, reach / (2 * LEG))) * DEG;
  // Side views measure the thigh from the (leaning) torso; the front view from straight down.
  return { hip: limit("lHip", line + bend + (facing === "front" ? 0 : lean)), knee: limit("lKnee", 2 * bend) };
}

// How far the furthest-travelling joint moves (x height, along its path) between two key poses, each
// drawn the way the engine stands a body (lowest foot or knee on the ground) with its hips at `hip`
// (stage x, x height).
type Drawn = { pose: PoseAngles; facing: Facing; hip: number };
function travel(a: Drawn, b: Drawn, steps = 8) {
  const stand = (pose: PoseAngles, facing: Facing, hip: number) => {
    const body = forwardKinematics(pose, facing, { x: hip, y: 0 }, 1, "normal", false);
    const ground = Math.max(body.lFoot.y, body.rFoot.y, body.lKnee.y, body.rKnee.y);
    return JOINTS.map((j) => ({ x: body[j].x, y: body[j].y - ground }));
  };
  const lengths = JOINTS.map(() => 0);
  let previous = stand(a.pose, a.facing, a.hip);
  for (let i = 1; i <= steps; i += 1) {
    // In between, the body is drawn in the view it starts in (the view only switches at the end).
    const here = i === steps ? stand(b.pose, b.facing, b.hip) : stand(lerpPose(a.pose, b.pose, i / steps), a.facing, a.hip + (b.hip - a.hip) * (i / steps));
    here.forEach((point, j) => { lengths[j] += Math.hypot(point.x - previous[j].x, point.y - previous[j].y); });
    previous = here;
  }
  return Math.max(...lengths);
}

// PACE RULE: a calm body move (looking round, shifting about) never asks any joint to cover more than
// about TURN_SPEED body heights per second on average over a beat; a beat with a long reach (a wide step,
// a big weight shift, an arm swinging a long way) simply takes longer. Smooth curves peak at about 1.5x
// their average speed, so at the calm pace every joint stays under about 14 px per frame at 24 fps for a
// 300 px figure (about 20 px in a hurry, see below).
const TURN_SPEED = 0.75;
const atLeastReal = (kind: Beat["kind"], seconds: number, realSeconds: number, settings: MoveSettings) => {
  const unit = beatSeconds(kind, 1, settings);
  return unit > 1e-6 ? Math.max(seconds, realSeconds / unit) : seconds;
};

// IMPATIENCE (Arthur's review, round 4: "Humans are impatient. You got to turn around faster."): a
// person turning around, or stepping into place, is on the way somewhere, so they hurry: every beat is
// IMPATIENT times quicker and the pace rule lets the joints go IMPATIENT times the calm speed. How much
// of a hurry follows the person's speed: someone moving at slow speed is relaxed and only half in a
// hurry. A turn asked to be `slow` is careful instead: no hurry, and a little extra care (CAREFUL < 1).
const IMPATIENT = 1.5;
const CAREFUL = 0.9;
export const hurryOf = (settings: MoveSettings, slow = false) => (slow ? CAREFUL : 1 + (IMPATIENT - 1) * (settings.speed === "slow" ? 0.5 : 1));
// In a hurry, lively or fast styles may still go a little quicker: the steps down to HURRIED_FLOOR x
// their hurried time, the pace up to HURRIED_LIVELY x the hurried pace (real seconds).
const HURRIED_FLOOR = 0.75, HURRIED_LIVELY = 1.35;
// Base seconds for a beat at a hurry, given how far its furthest joint travels (x height).
function hurried(kind: Beat["kind"], seconds: number, far: number, hurry: number, settings: MoveSettings) {
  const pace = TURN_SPEED * hurry;
  const base = Math.max(seconds / hurry, far / pace);
  return atLeastReal(kind, kind === "action" ? floored("action", base, settings, HURRIED_FLOOR) : base, far / (HURRIED_LIVELY * pace), settings);
}

// A key pose described by where things are: the hips (stage x, px), the feet (stage x, px, and height
// above the ground, x height; height 0 = planted) and the upper body. The legs are worked out from the
// feet, so a planted foot is exactly where the engine will hold it.
type Spot = { x: number; up: number };
type Placement = { facing: Facing; hip: number; drop: number; feet: Record<Side, Spot>; upper: Partial<PoseAngles> & { lean: number; head: number } };
function placedPose(p: Placement, height: number): PoseAngles {
  const planted = SIDES.filter((side) => p.feet[side].up <= 0);
  // The hips stand as high as the planted legs reach, `drop` lower (soft knees).
  const tall = Math.min(...planted.map((side) => Math.sqrt(Math.max(0, (2 * LEG) ** 2 - ((p.feet[side].x - p.hip) / height) ** 2))));
  const hipHeight = tall - p.drop;
  const pose = withPose(STAND, p.upper);
  for (const side of SIDES) {
    const leg = legTo(p.facing, side, (p.feet[side].x - p.hip) / height, hipHeight - p.feet[side].up, pose.lean);
    if (side === "l") Object.assign(pose, { lHip: leg.hip, lKnee: leg.knee });
    else Object.assign(pose, { rHip: leg.hip, rKnee: leg.knee });
  }
  return pose;
}

// A beat placed by where the hips are (`at`, stage x) instead of how far they move. Beats a style skips
// (a robot has no follow-through) are dropped first, so the hips still end exactly where they should.
type PlacedBeat = Omit<Beat, "dx"> & { at: number };
function toKeys(start: Stance, beats: PlacedBeat[], settings: MoveSettings): MoveOutput {
  let x = start.x, facing = start.facing;
  const plain: Beat[] = [];
  for (const { at, ...beat } of beats) {
    if (beatSeconds(beat.kind, beat.seconds, settings) <= 1e-6) continue;
    // beatsToKeys moves the hips along the facing at the START of the beat (front counts as right).
    plain.push({ ...beat, dx: (at - x) * (facing === "left" ? -1 : 1) });
    x = at;
    facing = beat.facing ?? facing;
  }
  return beatsToKeys(start, plain, settings);
}

// ---- Turning around -------------------------------------------------------------------------
//
// THE VIEW RULE (taught to the engine; Arthur's review, 2026-10-04). A stick figure can only be drawn
// from the side (facing right or left) or from the front. Seen from the front, the figure's r arm and
// leg are drawn exactly as they are from its right-facing side, and its l arm and leg exactly as from
// its left-facing side (body upright). So the view can switch between a side and the front with NO
// visible jump at any moment when the body is upright and the OTHER side's arm and leg hang straight
// down: right <-> front needs the l arm and leg straight down, left <-> front the r ones. That straight
// leg is the one standing (the PIVOT, right under the hips); the other leg is free — it is the one
// stepping round, and it can be anywhere in its swing (lifted, knee bent) when the view switches.
//
// A TURN AROUND (Arthur, 2026-10-04: "one step to turn around, the other leg to come to your other
// leg") is two steps, like the start of a walk: one leg lifts a little and steps round while the hips
// twist past 90 degrees (the view switches to the front during that step); right when it lands, the
// other leg lifts and comes to it (the view switches to the new side during that step); then the body
// settles into the stand. Before it, a small counter-move the other way (the shoulders and arms turn
// back a little, the knees give) while the weight shifts onto the pivot foot. Quick, because people
// turning around to go somewhere are impatient (IMPATIENCE): about 0.6 s, still smooth. A quarter turn (to or from the front) is one step. Each foot lifts once and
// lands right where it stands at the end, and the hips and the standing leg are perfectly still at the
// moments the view switches, so no foot ever slides or pops (the engine re-plants the feet there).

export type TurnParams = { to?: Facing; slow?: boolean };
export const TURN_DEFAULTS = { slow: false };
export const TURN_ABOUT = "Turn to face `to` (left/right/front; default the other way) like a real person: a small counter-move as the weight shifts onto one foot, then the other leg lifts a little and steps round as the hips twist (facing the viewer for a moment), and right when it lands the first leg comes to it; settles into the stand about where it started. Two quick steps, about 0.6 s (people turning to go somewhere are impatient; a quarter turn to or from the front is one step); `slow` for a careful, unhurried turn (about 1 s). Use it before walking or running the other way; just to look behind, use `lookBack`. Marks `facingViewer` (side to side only), `turned`.";

// The leg that stands straight under the hips while the view switches between `from` and `to`.
export const pivotLegFor = (from: Facing, to: Facing): Side => (from === "right" || to === "right" ? "l" : "r");

const TURN_LIFT = 0.05; // how high the stepping foot lifts (x height): "a little"
const TURN_DIP = 0.006; // knees give this much (x height) in the counter-move and as each foot lands
const SWITCH_AT = [0.55, 0.35]; // how far through its step (side to side) the stepping foot is when the view switches
const COUNTER = 0.35; // the counter-move: x the arms' first change, the other way
const RELAX = 0.6; // raised arms come this far down toward hanging during the counter-move
const COUNTER_SINK = 0.01; // the weight shift may lower the hips this much more (x height) than the knee give

export function turn(start: Stance, params: TurnParams, settings: MoveSettings): MoveOutput {
  const to: Facing = params.to ?? (start.facing === "left" ? "right" : start.facing === "right" ? "left" : "right");
  if (to === start.facing) return { keys: beatsToKeys(start, [], settings).keys, end: start, marks: { turned: start.t } };
  const H = settings.height;
  const hurry = hurryOf(settings, params.slow);
  // Side to side passes through the front: two view switches, one step each.
  const views: Facing[] = start.facing === "front" || to === "front" ? [start.facing, to] : [start.facing, "front", to];
  const rest = restPoseFor(to);
  const from = feetOf(start.pose, start.facing), restFeet = feetOf(rest, to);
  const feet: Record<Side, Spot> = { l: { x: start.x + from.l * H, up: 0 }, r: { x: start.x + from.r * H, up: 0 } };
  // Where the feet land, and so where the hips end up. A quarter turn keeps its pivot foot where it is.
  // In a full turn the first stepping foot lands right beside the pivot foot (side by side, so on the
  // same spot seen from the side), then the pivot foot steps to stand by it: from a plain stand the body
  // ends a hair along the new way, and from a wide stance it ends over the pivot foot instead of lunging
  // there and back. (Landing exactly there also keeps the hips and both legs still while the view
  // switches, so the engine re-plants the feet exactly where they are.)
  const firstPivot = pivotLegFor(views[0], views[1]), firstStepper = other(firstPivot);
  const endX = feet[firstPivot].x - restFeet[views.length === 2 ? firstPivot : firstStepper] * H;
  const target: Record<Side, number> = { l: endX + restFeet.l * H, r: endX + restFeet.r * H };

  const beats: PlacedBeat[] = [];
  // Each beat lasts its hurried time, or longer if something has far to go (the pace rule, at the hurried
  // pace); lively and fast styles only a little quicker still (see `hurried`).
  let previous: Drawn = { pose: start.pose, facing: start.facing, hip: start.x / H };
  const add = (beat: Omit<PlacedBeat, "pose" | "seconds">, seconds: number, p: Placement | Drawn) => {
    const pose = "feet" in p ? placedPose(p, H) : p.pose;
    const here: Drawn = { pose, facing: p.facing, hip: beat.at / H };
    beats.push({ ...beat, pose, seconds: hurried(beat.kind, seconds, travel(previous, here), hurry, settings) });
    previous = here;
  };
  // The upper body at a view switch: upright, the pivot arm hanging straight down, the other arm on its way.
  const switchUpper = (view: Facing, pivot: Side, arms: Partial<PoseAngles>) => ({ ...blendArms(arms, armsOf(restPoseFor(view)), 0.5), ...(pivot === "l" ? { lShoulder: 0, lElbow: 0 } : { rShoulder: 0, rElbow: 0 }), lean: 0, head: 0 });

  // 1. Counter-move: the shoulders turn back a little (arms the other way), the torso leans back a touch,
  // the knees give, and the weight shifts over the pivot foot, as far as the other leg lets it without
  // the hips sinking much (from a wide stance the rest of the shift happens as that foot lifts). Raised
  // hands (a guard after a punch) start coming down at the same time.
  const relaxed = withPose(start.pose, blendArms(armsOf(start.pose), armsOf(restPoseFor(start.facing)), RELAX));
  const firstUpper = switchUpper(views[1], firstPivot, armsOf(relaxed));
  const counter = windUp(relaxed, withPose(relaxed, firstUpper), COUNTER, { only: ARM_KEYS, lean: 0.25 });
  const sink = from.hip - TURN_DIP - COUNTER_SINK, otherFoot = feet[other(firstPivot)].x;
  const reachX = Math.sqrt(Math.max(0, (2 * LEG) ** 2 - sink * sink)) * H;
  let hip = Math.min(otherFoot + reachX, Math.max(otherFoot - reachX, feet[firstPivot].x));
  let arms = armsOf(counter);
  add({ kind: counterKind(settings), at: hip }, 0.14 * (isRobot(settings) ? ROBOT_COUNTER : 1),
    { facing: start.facing, hip, drop: TURN_DIP, feet, upper: { ...arms, lean: counter.lean, head: counter.head } });

  views.slice(1).forEach((view, i) => {
    const pivot = pivotLegFor(views[i], view), stepper = other(pivot), last = i === views.length - 2;
    // 2. The free leg lifts and steps round; the view switches when the pivot leg stands straight
    // under the hips and the pivot arm hangs straight down.
    const swing = { x: feet[stepper].x + (target[stepper] - feet[stepper].x) * SWITCH_AT[i], up: TURN_LIFT };
    const upper = switchUpper(view, pivot, arms);
    hip = feet[pivot].x;
    add({ kind: "action", ease: "smooth", at: hip, facing: view, contacts: [`${pivot}Foot`], name: view === to ? "turned" : "facingViewer" }, i === 0 ? 0.15 : 0.1,
      { facing: view, hip, drop: 0, feet: { ...feet, [stepper]: swing } as Record<Side, Spot>, upper });
    // 3. It lands right where it will stand at the end. If another step follows, it lands beside the
    // pivot foot with the hips still resting over the pivot (both legs straight); the weight moves onto
    // it as the other foot lifts (it is the next pivot). The last step lands with the knees giving a
    // little and the hips arriving over both feet.
    feet[stepper] = { x: target[stepper], up: 0 };
    arms = blendArms(upper, armsOf(restPoseFor(view)), last ? 0.75 : 0.55);
    hip = last ? endX : hip;
    add({ kind: "action", ease: "smooth", at: hip }, i === 0 && !last ? 0.09 : 0.1,
      { facing: view, hip, drop: last ? TURN_DIP : 0, feet, upper: { ...arms, lean: 0, head: 0 } });
  });
  // 4. Settle into the plain stand for the new facing (the return to rest).
  add({ kind: "settle", at: endX, recover: true }, 0.22, { pose: rest, facing: to, hip: endX / H });
  return toKeys(start, beats, settings);
}

// ---- Looking back ---------------------------------------------------------------------------
//
// LOOKING BEHIND (Arthur's review, 2026-10-04): "If I want to look behind me I just move my head behind
// me — I wouldn't do a full 180 turn." The feet stay planted and the figure keeps facing the same way;
// only the upper body twists, about 90 degrees (more would look like a broken back). In a side view the
// shoulders turning show in the ARMS: the near shoulder goes back, so the near arm swings back behind the
// body, and the far shoulder comes forward, so the far arm swings forward across the front, both elbows a
// little bent; the head turns back as far as it comfortably goes and the torso leans back a little. A
// tiny counter-move the other way first, a smooth turn (speeds up, slows down), a short look (still
// moving a little), the same smooth turn back to the front (a hair past it), and settle.
// RUN FROM THE LOOK (Arthur, round 7: "When he turns around and sees something and gets scared, he is
// supposed to be running. The second he looks back over there, he has to be running — not turning to
// look forward first"): mark `go` is the end of the look; the planner starts a walk or run that follows
// right there, and the walk or run turns the head and shoulders forward as it gets going.

export type LookBackParams = { seconds?: number; side?: "back" };
export const LOOK_BACK_DEFAULTS = { seconds: 0.4 };
export const LOOK_BACK_ABOUT = "Look behind without turning around: feet stay planted and the facing stays; the upper body twists about 90 degrees (near arm swings back, far arm forward across, head turned back, a slight lean back), keeps looking `seconds` (default 0.4), then turns back to the front. About 1 s (slower and careful when sneaky). Followed by a walk or run (\"look back, run away\"), it doesn't turn back to the front first: the walk or run starts the moment the look is over, from the looking-back pose, and the head and shoulders turn forward during the first strides. Marks `looking`, `go` (look over), `back`.";

// How far each arm swings as the chest turns about 90 degrees (degrees): the hands end up about a
// shoulder-width behind / in front of the body, not flung out.
const LOOK_SWING = { near: -26, far: 20 };
const LOOK_ELBOW = { near: 6, far: 10 }; // the elbows bend a little more (the far forearm comes across)
const LOOK_HEAD = -24; // the head turns back (tilts back), inside its limit
const LOOK_LEAN = -4;

// The upper body twisted toward the back by `amount` (1 = fully, about 90 degrees; negative = the other
// way), from the pose it started in. The legs keep the feet where they are.
export function lookBackPose(from: PoseAngles, facing: Facing, amount: number): PoseAngles {
  if (facing === "front") {
    // Facing the viewer, the figure looks back over its right shoulder (screen right): the head turns
    // toward it, the l arm comes across the front, the r arm goes back and out.
    return withPose(from, {
      head: limit("head", from.head + 0.85 * Math.abs(LOOK_HEAD) * amount), lean: limit("lean", from.lean - 2 * amount),
      lShoulder: from.lShoulder - 0.8 * LOOK_SWING.far * amount, lElbow: limit("lElbow", from.lElbow + 2 * LOOK_ELBOW.far * Math.max(0, amount)),
      rShoulder: from.rShoulder - 0.4 * LOOK_SWING.near * amount, rElbow: limit("rElbow", from.rElbow + 2 * LOOK_ELBOW.near * Math.max(0, amount)),
    });
  }
  const near: Side = facing === "left" ? "r" : "l", far = other(near);
  const lean = limit("lean", from.lean + LOOK_LEAN * amount);
  const turned = lean - from.lean; // the thighs stay put while the torso leans: hips follow the lean
  const out = withPose(from, { lean, head: limit("head", from.head + LOOK_HEAD * amount), lHip: limit("lHip", from.lHip + turned), rHip: limit("rHip", from.rHip + turned) });
  const bend = (key: "lElbow" | "rElbow", by: number) => limit(key, from[key] + by * Math.max(0, amount));
  // Arms hang from the shoulders, which turn with the chest: they keep their angle to the ground plus the swing.
  out[`${near}Shoulder`] = from[`${near}Shoulder`] + turned + LOOK_SWING.near * amount;
  out[`${near}Elbow`] = bend(`${near}Elbow`, LOOK_ELBOW.near);
  out[`${far}Shoulder`] = from[`${far}Shoulder`] + turned + LOOK_SWING.far * amount;
  out[`${far}Elbow`] = bend(`${far}Elbow`, LOOK_ELBOW.far);
  return out;
}

export function lookBack(start: Stance, params: LookBackParams, settings: MoveSettings): MoveOutput {
  const seconds = Math.max(0, params.seconds ?? LOOK_BACK_DEFAULTS.seconds);
  const from = start.pose, facing = start.facing;
  const look = lookBackPose(from, facing, 1);
  // The look itself lasts the asked time whatever the style (only the turning is slower or quicker).
  const holdUnit = beatSeconds("hold", 1, settings);
  const beats: Beat[] = [
    // A tiny counter-move the other way first (shoulders turn forward a touch).
    { kind: counterKind(settings), seconds: 0.1 * (isRobot(settings) ? ROBOT_COUNTER : 1), pose: lookBackPose(from, facing, -0.15) },
    // Turn to look: speeds up, then slows down as the chest gets round.
    { kind: "action", ease: "smooth", seconds: floored("action", 0.24, settings), pose: look, name: "looking" },
    // Keep looking (still turning a little further, so it stays alive). Mark `go`: the look is over; a
    // walk or run that follows starts right here, from the look (RUN FROM THE LOOK, plan.ts).
    { kind: "hold", seconds: holdUnit > 1e-6 ? seconds / holdUnit : seconds, pose: lookBackPose(from, facing, 1.06), name: "go" },
    // Turn back to the front just as smoothly, a hair past it...
    { kind: "settle", seconds: floored("settle", 0.24, settings), pose: lookBackPose(from, facing, -0.05), name: "back" },
    // ...and settle into the pose it started in.
    { kind: "settle", seconds: 0.1, pose: from, recover: true },
  ];
  return beatsToKeys(start, beats, settings);
}

// ---- Catching breath, standing still --------------------------------------------------------

// Out of breath after a lot of effort (a long run, a sprint, parkour): bend over with the hands on the
// knees, breathe hard, then straighten into a tired, slightly slumped stand that keeps breathing.
// BALANCE (balance.ts; Arthur, round 8: bent over with the hips still above the feet, "it looks like he's
// supposed to be falling ... bend his legs a little, maybe put his hands on his knees"): bent over, the
// hips go BACK and the knees bend until the weight is over the middle of the feet, and the hands rest on
// the thighs just above the knees, propping the chest up. A stick figure's arms are short, so the pose is
// the least bent one whose hands reach: the back from BENT_LEAN (at most BENT_LEAN_MAX), then the knees
// (hips at most BENT_DROP_MAX lower).
// ARMS STRAIGHT (Arthur, round 8: "if he's REALLY tired he bends down, arms extended fully onto his
// knees"): a propping arm is locked straight (ARM_STRAIGHT), on every breath. Each hand rests on its own
// thigh at the spot (from the knee up to ON_THIGH_MAX of the way to the hip) where its straight arm meets
// it, so the arms stay straight as the chest lifts and sinks; the hips stay put.
// SMALL BREATHS (Arthur, round 8: "the huff and puff is a little big; humans breathe hard but only move a
// little"): each breath lifts the chest only a little (the back rises BREATH_LEAN, the head a touch);
// breathing hard shows in how QUICK the breaths are, not how big. All of it is worked out from the planted
// feet, so it holds for any stance, either way the body faces.
const BENT_LEAN = 45, BENT_LEAN_MAX = 58, BENT_HEAD = -24;
const BENT_DROP = 0.04, BENT_DROP_MAX = 0.08;
const ON_THIGH_MAX = 0.4; // a hand rests at most this far up its thigh from the knee
const BREATH_LEAN = 2.5;
const ARM_STRAIGHT = 0.995; // x the arm's length: a locked, straight propping arm (elbow bent about 10 degrees at most)
const WIDE = 0.16; // x height: feet further apart than this (a fighting stance, a long stride) step together first
const ARM_LENGTH = PROPORTIONS.upperArm + PROPORTIONS.forearm;
export const TIRED_STAND = withPose(STAND, { lean: 8, head: 8, lShoulder: 12, rShoulder: 4, lElbow: 18, rElbow: 14 });
const TIRED_DROP = 0.012; // the tired stand's knees stay a little soft (x height lower hips)

// A side-view pose with each hand resting on top of its own thigh where its straight arm meets it (as near
// the knee as that is; at most ON_THIGH_MAX up the thigh); `stretch` is the longer reach, x the arm's
// length (over ARM_STRAIGHT: even there the hand can't get to the thigh).
function handsOnThighs(pose: PoseAngles): { pose: PoseAngles; stretch: number } {
  const body = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  const out = { ...pose };
  let stretch = 0;
  for (const side of SIDES) {
    const knee = body[`${side}Knee`], thigh = { x: body.hip.x - knee.x, y: body.hip.y - knee.y };
    const length = Math.hypot(thigh.x, thigh.y) || 1;
    // On top of the thigh (a line's thickness above it), not inside it; `up` of the way from the knee.
    const spot = (up: number) => ({ x: knee.x + up * thigh.x - (thigh.y / length) * 0.012 - body.neck.x, y: knee.y + up * thigh.y + (thigh.x / length) * 0.012 - body.neck.y });
    const reach = (up: number) => Math.hypot(spot(up).x, spot(up).y) / ARM_LENGTH;
    // (Further up the thigh is nearer the shoulder: find where the straight arm meets it.)
    let lo = 0, hi = ON_THIGH_MAX;
    if (reach(lo) <= ARM_STRAIGHT) hi = lo;
    else if (reach(hi) >= ARM_STRAIGHT) lo = hi;
    for (let i = 0; i < 20 && hi - lo > 1e-4; i += 1) { const mid = (lo + hi) / 2; if (reach(mid) > ARM_STRAIGHT) lo = mid; else hi = mid; }
    const hand = spot(hi);
    stretch = Math.max(stretch, reach(hi));
    const arm = armReach(pose.lean, hand);
    if (side === "l") Object.assign(out, { lShoulder: arm.shoulder, lElbow: arm.elbow });
    else Object.assign(out, { rShoulder: arm.shoulder, rElbow: arm.elbow });
  }
  return { pose: out, stretch };
}

// The bent-over pose for planted feet (x height from the start hips, forward +), its breath in, and
// where its hips are (the weight over the middle of the feet).
function bentOver(feet: Feet) {
  type Bend = { lean: number; drop: number };
  const posed = (b: Bend, at: number, breath = 0) =>
    handsOnThighs(plantedLegs(withPose(STAND, { lean: b.lean - BREATH_LEAN * breath, head: BENT_HEAD - 1.5 * breath }), feet, at, b.drop));
  const spots = [feet.l, feet.r];
  const hipsFor = (b: Bend) => balancedHips((at) => posed(b, at).pose, spots);
  // The least bent pose whose straight arms still reach their thighs with the chest lifted: first the
  // least lean (with the knees bent as far as allowed, the easiest to reach), then the least knee bend.
  const reaches = (b: Bend, at = hipsFor(b)) => posed(b, at, 1).stretch <= ARM_STRAIGHT + 1e-6;
  let lean = BENT_LEAN_MAX;
  if (reaches({ lean: BENT_LEAN, drop: BENT_DROP_MAX })) lean = BENT_LEAN;
  else if (reaches({ lean: BENT_LEAN_MAX, drop: BENT_DROP_MAX })) {
    let lo = BENT_LEAN, hi = BENT_LEAN_MAX;
    while (hi - lo > 1) { const mid = Math.round((lo + hi) / 2); if (reaches({ lean: mid, drop: BENT_DROP_MAX })) hi = mid; else lo = mid; }
    lean = hi;
  }
  // (Arms too short for any of it: bent as far as allowed, the hands as near their thighs as they get.)
  let bend: Bend = { lean, drop: BENT_DROP_MAX };
  for (let drop = BENT_DROP; drop <= BENT_DROP_MAX + 1e-9; drop += 0.005) {
    if (reaches({ lean, drop })) { bend = { lean, drop }; break; }
  }
  const at = hipsFor(bend);
  return { pose: posed(bend, at).pose, inhale: posed(bend, at, 1).pose, at };
}

// The tired stand over the same feet (knees a little soft, weight over the middle of the feet), and its
// breath in (chest up, back straighter).
function tiredStand(feet: Feet) {
  const legs = (pose: PoseAngles, at: number) => plantedLegs(pose, feet, at, TIRED_DROP);
  const at = balancedHips((x) => legs(TIRED_STAND, x), [feet.l, feet.r]);
  const lift = 0.7 * BREATH_LEAN;
  const inhale = withPose(TIRED_STAND, { lean: TIRED_STAND.lean - lift, head: TIRED_STAND.head - 1.4, lShoulder: TIRED_STAND.lShoulder - lift, rShoulder: TIRED_STAND.rShoulder - lift });
  return { pose: legs(TIRED_STAND, at), inhale: legs(inhale, at), at };
}

// `stay`: it stays bent over (REALLY TIRED at the end of a fight, punch.ts fightRest): no standing up after.
export function catchBreath(start: Stance, params: { seconds?: number; stay?: boolean }, settings: MoveSettings): MoveOutput {
  const breaths = Math.max(2, Math.round((params.seconds ?? 2.2) / 0.62));
  // Breathing keeps its own clock.
  const timing: MoveSettings = { ...settings, speed: "normal", style: settings.style === "robot" ? "robot" : "natural" };
  // Still on the ground (knocked out, sitting, lying): it catches its breath where it is — it doesn't
  // spring up into a bent-over stand.
  if (onTheGround(start.pose)) return stand(start, { seconds: 0.62 * breaths + 1.8 }, settings);
  // Seen from the front a body can't be drawn bending toward the viewer: it stays upright (balanced over
  // both feet) and breathes hard, the shoulders heaving.
  if (start.facing === "front") {
    const heave = (amount: number) => withPose(start.pose, { lShoulder: start.pose.lShoulder + 4 * amount, rShoulder: start.pose.rShoulder + 4 * amount, head: start.pose.head });
    const beats: Beat[] = [{ kind: "settle", seconds: 0.55, pose: heave(0), name: "bentOver" }];
    for (let i = 0; i < breaths; i += 1) beats.push({ kind: "hold", seconds: 0.26 * (1 + 0.25 * i), pose: heave(1) }, { kind: "hold", seconds: 0.3 * (1 + 0.25 * i), pose: heave(0) });
    if (!params.stay) beats.push({ kind: "settle", seconds: 0.8, pose: heave(0), name: "recovered" }, { kind: "hold", seconds: 0.45, pose: heave(0.6) }, { kind: "hold", seconds: 0.55, pose: heave(0) });
    return beatsToKeys(start, beats, timing);
  }
  const H = settings.height, dir = start.facing === "left" ? -1 : 1;
  const feet = stanceFeet(start.pose);
  // FEET FIRST: still standing wide (a fighting stance, a long stride), it first steps its feet under it
  // (already slumping tiredly, not standing up tall), then bends over (bent over a wide stance the weight
  // would sit right over the back foot, the front leg stretched out).
  // (Staying bent over at the end of a fight, it bends right where its fighting stance is: no step up into
  // a stand first — NO UNNECESSARY KEY POSES; the hips still go where the weight is over the feet.)
  if (Math.abs(feet.l - feet.r) > WIDE && !params.stay) {
    const step = stepInto(start, tiredStand(stanceFeet(restPoseFor(start.facing))).pose, settings);
    const rest = catchBreath(step.end, params, settings);
    return { keys: [...step.keys, ...rest.keys.slice(1)], end: rest.end, marks: rest.marks };
  }
  const bent = bentOver(feet), up = tiredStand(feet);
  const stage = (at: number) => start.x + dir * at * H;
  const beats: PlacedBeat[] = [{ kind: "settle", seconds: 0.55, pose: bent.pose, at: stage(bent.at), name: "bentOver" }];
  // Quick, deep breaths while bent over, slowing down as they recover.
  for (let i = 0; i < breaths; i += 1) {
    const slow = 1 + 0.25 * i;
    beats.push({ kind: "hold", seconds: 0.26 * slow, pose: bent.inhale, at: stage(bent.at) }, { kind: "hold", seconds: 0.3 * slow, pose: bent.pose, at: stage(bent.at) });
  }
  if (params.stay) return toKeys(start, beats, timing);
  beats.push({ kind: "settle", seconds: 0.8, pose: up.pose, at: stage(up.at), name: "recovered" });
  beats.push({ kind: "hold", seconds: 0.45, pose: up.inhale, at: stage(up.at) }, { kind: "hold", seconds: 0.55, pose: up.pose, at: stage(up.at) });
  return toKeys(start, beats, timing);
}

export type StandParams = { seconds: number };

// Standing still, but alive: slow breathing (chest and shoulders rise and fall a little). Calmer when
// tired, quicker when angry or hurt; a robot doesn't breathe.
export function stand(start: Stance, params: StandParams, settings: MoveSettings): MoveOutput {
  // Breathe around whatever pose the figure is standing in (e.g. still holding a ball at the chest).
  const rest = start.pose;
  // On the ground (sitting, lying, kneeling) hands may be planted on the floor: just stay still.
  const down = onTheGround(rest);
  if (settings.style === "robot" || params.seconds < 0.6 || down) {
    // (Lying or sitting, the feet aren't standing on anything: nothing is planted.)
    return beatsToKeys(start, [{ kind: "hold", seconds: Math.max(0, params.seconds), pose: rest, ...(down ? { contacts: [] } : {}) }], { ...settings, speed: "normal", style: "natural" });
  }
  const breath = settings.style === "angry" || settings.style === "hurt" ? 1.6 : settings.style === "tired" ? 3.4 : 2.8; // seconds per breath
  const count = Math.max(1, Math.round(params.seconds / breath));
  const step = params.seconds / count / 2;
  const deep = settings.style === "tired" || settings.style === "hurt" ? 1.6 : 1;
  const inhale = withPose(rest, { lean: rest.lean - 1.2 * deep, head: rest.head - 1.5 * deep, lShoulder: rest.lShoulder + 3 * deep, rShoulder: rest.rShoulder + 3 * deep, lElbow: rest.lElbow + 2, rElbow: rest.rElbow + 2 });
  const beats: Beat[] = [];
  for (let i = 0; i < count; i += 1) beats.push({ kind: "settle", seconds: step, pose: inhale }, { kind: "settle", seconds: step, pose: rest });
  // Breathing keeps its own clock (style and speed don't stretch it).
  return beatsToKeys(start, beats, { ...settings, speed: "normal", style: "natural" });
}

// ---- Feet first: stepping into a new stance ---------------------------------------------------
//
// FEET FIRST (taught to the engine, 2026-10-04): planted feet never slide. So when the next move needs
// the feet somewhere else than where they are (after a fight, the feet are wide apart in the fighting
// stance; a squat or a sit-down needs them under the hips), the figure first STEPS them there, the way
// a person does without thinking: the weight shifts onto one foot, the other lifts a little and steps
// to its place, the body settles. It stands on the foot that leaves the hips the least far to go. The
// planner checks every move it is about to start (see `feetMustMove`), so this works for moves and
// combinations nobody showed the engine.

// How far (x height) a move asks its planted feet to move apart or together while both stay down at
// its start (before any foot lifts). Anything more than a little means the feet would have to slide.
export function feetMustMove(keys: readonly { pose: PoseAngles; facing?: Facing; contacts?: readonly string[]; lift?: number }[]): number {
  if (keys.length === 0) return 0;
  const view = keys[0].facing ?? "right";
  const spacing = (pose: PoseAngles) => { const f = feetOf(pose, view); return f.l - f.r; };
  const first = spacing(keys[0].pose);
  let worst = 0;
  for (const key of keys) {
    if ((key.contacts ?? ["lFoot", "rFoot"]).length < 2 || (key.lift ?? 0) > 0 || (key.facing ?? view) !== view) break;
    worst = Math.max(worst, Math.abs(spacing(key.pose) - first));
  }
  return worst;
}

// How different two poses' stances are (x height): how far apart / together the feet are.
export function stanceDifference(a: PoseAngles, b: PoseAngles, facing: Facing): number {
  const fa = feetOf(a, facing), fb = feetOf(b, facing);
  return Math.abs((fa.l - fa.r) - (fb.l - fb.r));
}

export function stepInto(start: Stance, target: PoseAngles, settings: MoveSettings, toward?: number): MoveOutput {
  const H = settings.height, facing = start.facing;
  const from = feetOf(start.pose, facing), want = feetOf(target, facing);
  const feet: Record<Side, Spot> = { l: { x: start.x + from.l * H, up: 0 }, r: { x: start.x + from.r * H, up: 0 } };
  // Stand on the foot that leaves the hips the least far to go; the other one steps. (`toward`, a stage x:
  // on its way there, the step goes that way — the hips never go back first, round 9.)
  const endFor = (side: Side) => feet[side].x - want[side] * H;
  const planted: Side = toward !== undefined
    ? ((endFor("l") - start.x) * Math.sign(toward - start.x) >= (endFor("r") - start.x) * Math.sign(toward - start.x) ? "l" : "r")
    : Math.abs(endFor("l") - start.x) <= Math.abs(endFor("r") - start.x) ? "l" : "r";
  const stepper = other(planted), endX = endFor(planted), goal = endX + want[stepper] * H;
  const beats: PlacedBeat[] = [];
  let previous: Drawn = { pose: start.pose, facing, hip: start.x / H };
  // The pace rule, as in a turn, and in the same hurry (on the way to the next move): a beat with far to
  // go takes longer.
  const add = (beat: Omit<PlacedBeat, "pose" | "seconds">, seconds: number, p: Placement | Drawn) => {
    const pose = "feet" in p ? placedPose(p, H) : p.pose;
    const here: Drawn = { pose, facing, hip: beat.at / H };
    beats.push({ ...beat, pose, seconds: hurried(beat.kind, seconds, travel(previous, here), hurryOf(settings), settings) });
    previous = here;
  };
  const upper = (k: number) => ({ ...blendArms(armsOf(start.pose), armsOf(target), k), lean: start.pose.lean + (target.lean - start.pose.lean) * k, head: start.pose.head + (target.head - start.pose.head) * k });
  // 1. The weight shifts over the standing foot (as far as the other leg lets it, knees giving a little).
  const sink = from.hip - TURN_DIP - COUNTER_SINK;
  const reachX = Math.sqrt(Math.max(0, (2 * LEG) ** 2 - sink * sink)) * H;
  let hip = Math.min(feet[stepper].x + reachX, Math.max(feet[stepper].x - reachX, feet[planted].x));
  add({ kind: "settle", at: hip }, 0.14, { facing, hip, drop: TURN_DIP, feet, upper: upper(0.3) });
  // 2. The free foot lifts a little and swings toward its place, the hips on their way.
  hip += (endX - hip) * 0.5;
  add({ kind: "action", ease: "smooth", at: hip, contacts: [`${planted}Foot`] }, 0.12,
    { facing, hip, drop: 0, feet: { ...feet, [stepper]: { x: feet[stepper].x + (goal - feet[stepper].x) * 0.55, up: TURN_LIFT * 0.8 } } as Record<Side, Spot>, upper: upper(0.6) });
  // 3. It lands where it will stand, the knees giving a little.
  feet[stepper] = { x: goal, up: 0 };
  add({ kind: "action", ease: "smooth", at: endX }, 0.1, { facing, hip: endX, drop: TURN_DIP, feet, upper: upper(0.85) });
  // 4. Settle into the stance the next move starts from.
  add({ kind: "settle", at: endX }, 0.16, { pose: target, facing, hip: endX / H });
  return toKeys(start, beats, settings);
}

// SHUFFLE (Arthur, round 5: the second punch "would take like one second"): in a fight a figure doesn't
// drop its guard and walk to close a short gap. The front foot steps in, the back foot follows, the guard
// stays up, the stance stays the same — about half a second, in the same hurry as a step into place.
export function shuffle(start: Stance, distance: number, settings: MoveSettings): MoveOutput {
  const H = settings.height, facing = start.facing, dir = facing === "left" ? -1 : 1;
  const from = feetOf(start.pose, facing);
  const feet: Record<Side, Spot> = { l: { x: start.x + from.l * H, up: 0 }, r: { x: start.x + from.r * H, up: 0 } };
  const front: Side = (feet.l.x - feet.r.x) * dir >= 0 ? "l" : "r", back = other(front);
  const d = distance * dir, x0 = start.x;
  const upper = { ...armsOf(start.pose), lean: start.pose.lean, head: start.pose.head };
  const beats: PlacedBeat[] = [];
  let previous: Drawn = { pose: start.pose, facing, hip: x0 / H };
  const add = (beat: Omit<PlacedBeat, "pose" | "seconds">, seconds: number, p: Placement | Drawn) => {
    const pose = "feet" in p ? placedPose(p, H) : p.pose;
    const here: Drawn = { pose, facing, hip: beat.at / H };
    beats.push({ ...beat, pose, seconds: hurried(beat.kind, seconds, travel(previous, here), hurryOf(settings), settings) });
    previous = here;
  };
  // 1. The front foot steps in (lifting only a little), the hips on their way.
  add({ kind: "action", ease: "smooth", at: x0 + 0.3 * d, contacts: [`${back}Foot`] }, 0.08,
    { facing, hip: x0 + 0.3 * d, drop: 0, feet: { ...feet, [front]: { x: feet[front].x + 0.55 * d, up: TURN_LIFT * 0.6 } } as Record<Side, Spot>, upper });
  feet[front] = { x: feet[front].x + d, up: 0 };
  add({ kind: "action", ease: "smooth", at: x0 + 0.6 * d }, 0.06, { facing, hip: x0 + 0.6 * d, drop: TURN_DIP, feet, upper });
  // 2. The back foot follows, back into the same stance.
  add({ kind: "action", ease: "smooth", at: x0 + 0.85 * d, contacts: [`${front}Foot`] }, 0.07,
    { facing, hip: x0 + 0.85 * d, drop: 0, feet: { ...feet, [back]: { x: feet[back].x + 0.55 * d, up: TURN_LIFT * 0.6 } } as Record<Side, Spot>, upper });
  feet[back] = { x: feet[back].x + d, up: 0 };
  add({ kind: "settle", at: x0 + d }, 0.05, { pose: start.pose, facing, hip: (x0 + d) / H });
  return toKeys(start, beats, settings);
}
