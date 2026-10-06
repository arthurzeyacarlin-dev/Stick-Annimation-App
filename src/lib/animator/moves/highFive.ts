import { clampPose, DEFAULT_STYLE, PROPORTIONS, STAND, withPose, type PoseAngles, type Point } from "../rig.ts";
import { beatSeconds, windUp, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { lookToward, type LookTarget } from "./gaze.ts";
import {
  actionSecondsFor, actionThrough, armReach, atLeast, blendArm, feetOf, worldArm, isRobot, pathLength, placedBeatsToKeys, plantedLegs, powerOf, recoverBeats, ROBOT_WINDUP, STAND_HIP, unitBody,
  windKind, windupSecondsFor, type Feet, type PlacedBeat, type WorldArm,
} from "./punch.ts";

// SPEC-0017 Phase 2 Round B: high-five, built on the Phase 1 two-figure high-five Arthur approved, with
// the wind-up Arthur drew (reviews 2026-10-04 and round 6): WIND-UP the opposite way — the knees dip, the
// body leans a little BACK and the slapping arm goes up BEHIND the head: the hand comes in to the chest
// and up past the ear, the elbow going back and up behind the head, the forearm standing up (it never
// goes up in front of the face or curls over the top of the head, and never swings out toward the
// partner) while the lead foot steps in; the other arm hangs bent in front -> the hand swings forward
// and up FAST into the slap, the elbow passing up by the head -> the palms press together for a moment
// -> a little bounce apart -> the arm goes back down the way it came up (behind the head, past the ear,
// hand to the chest: never a whole circle, never a windmill) — the FLOW pose: the next move can start
// here -> only when nothing follows: the foot steps back to where the move started, stand.
//
// The slap follows the CONTACT RULE below (Arthur's review, 2026-10-04: "their hands aren't exactly
// touching" — the forearms crossed in an X): the forearm stands up nearly straight and the two hands
// meet tip to tip, side by side, just touching at the midpoint between the two figures' starting hips.
// The timing never depends on the distance, so `highFiveSlapOffset(settings)` tells a director when the
// slap is.
//
// HIGH-FIVE PACE (Arthur, round 7: "When they go to high five it's really slow. A high five should be
// the same pace as the walking, a normal pace"): the whole wind-up — hand to the chest, the step in,
// cocked — takes about ONE WALKING STEP of the same mood and speed, the slap is a quick swing, and the
// arm comes back down just as briskly. Mood, speed and energy stretch or shrink it the way they stretch
// the walk's steps (motion.ts beatSeconds uses the same style and speed tempo as the gait), and the
// POWER of the mood (punch.ts powerOf: energy x style) sets how hard it is: "A happy mood: they slap
// fast. A mad mood: stomping, almost marching steps to the person, then a really hard slap" — the
// harder, the deeper the wind-up (knees dip, leaning back), the harder the lead foot stamps down as it
// steps in, the faster the swing and the bigger the bounce apart. A natural mood is in between.
//
// EYES (gaze.ts): the figure looks at its partner (the planner's `look`, or the partner straight ahead
// at `partnerDistance`) while it winds up, at the hands as they meet, then at the partner again.

// ---- THE CONTACT RULE (Arthur, 2026-10-04) ----------------------------------------------------------
// When two body parts touch — hand to hand in a high-five; later hand to ball, fist to target, foot to
// target — they touch with the ENDS of the limbs: the hand is the very end of the forearm, the foot the
// very end of the shin. Figures are drawn with round-ended lines `thickness` px wide, so two ends just
// TOUCH when their points are half of one line plus half of the other apart (`touchGap`). Points on top
// of each other would draw the hands inside each other, and points that pass each other make the limbs
// cross (an X). So touching limbs meet tip to tip and never pass through or cross each other: on every
// frame their lines stay at least `touchGap` apart (`limbDistance`) and never cross (`limbsCross`).

// How far apart (px) two limb-end points are when their round drawn ends just touch.
export const touchGap = (thicknessA: number, thicknessB = thicknessA) => (thicknessA + thicknessB) / 2;

const side = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
// Do limb a (a1 -> a2) and limb b (b1 -> b2) cross each other (an X)? Ends that only touch don't count.
export function limbsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = side(b1, b2, a1), d2 = side(b1, b2, a2), d3 = side(a1, a2, b1), d4 = side(a1, a2, b2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const toSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const k = length2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy);
};
// How close two limbs' centre lines come (px; 0 when they cross). Their drawn lines overlap when this
// is less than the `touchGap` of their two thicknesses.
export function limbDistance(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (limbsCross(a1, a2, b1, b2)) return 0;
  return Math.min(toSegment(a1, b1, b2), toSegment(a2, b1, b2), toSegment(b1, a1, a2), toSegment(b2, a1, a2));
}

// ---- High-five ----------------------------------------------------------------------------------

// `thickness`: this figure's line width in px (default: the standard figure's). The hand point stops
// half a line short of the midpoint; the partner's stops half of its own line short on the other side,
// so the two round hand ends just touch.
// `handOver` (the planner fills it in when another move follows straight on: ONE WAY ROUND below): "up" =
// the move hands over right after the bounce, the slapping arm still up; "down" (default) = the arm goes
// back down behind the head the way it came first.
// `handOverHold`: base seconds the arm stays at the hand-over before the next move takes it on.
export type HighFiveParams = { partnerDistance: number /* hip-to-hip px between the two figures at the start */; thickness?: number; look?: LookTarget; handOver?: "up" | "down"; handOverHold?: number };
export const HIGH_FIVE_DEFAULTS = { partnerDistance: 240, thickness: DEFAULT_STYLE.thickness } as const;

const SLAP_HEIGHT = 0.94; // the hands like to meet about the top of the head (hand height above the ground, x height)
const SLAP_TOP = 0.96; // ...and no higher, unless the partner is so near that the forearm must stand up straighter
const LOWEST_SLAP = 0.84; // for a far partner the hands meet a little lower (about head height), reaching further
const SLAP_LEAN = 7, SLAP_HEAD = -14; // leaning in, looking up at the hands (Phase 1)
const MAX_LEAN = 16; // a partner further than the longest step: the body leans further in, up to this
const STEP_DROP = 0.02; // knees soft while the feet are apart (x height)
const MAX_STEP = 0.22; // the hips move in at most this far (x height); the stance is then 2x this wide
const MIN_STEP = 0.03; // a step shorter than this is just a weight shift (both feet stay down)
// The palms come together from opposite sides: at the slap the forearm stands up nearly straight (hand
// up, not pointing at the partner), leaning PALM_TILT degrees toward the partner — so the two forearms
// make a narrow V with the hands touching at its top. Never less than MIN_TILT: the forearms then can't
// lie along each other or cross below the hands.
const PALM_TILT = 20;
const MIN_TILT = 8;
// A robot's straight arm leans in as far as a straight arm must to reach the spot: at most this much.
const STRAIGHT_TILT = 50;

const UPPER_ARM = PROPORTIONS.upperArm, FOREARM = PROPORTIONS.forearm;
const ARM_REACH = (UPPER_ARM + FOREARM) * 0.995;
const LEG = PROPORTIONS.thigh + PROPORTIONS.shin, TORSO = PROPORTIONS.torso;
const DEG = 180 / Math.PI;

// How much lower than standing tall the hips are with the feet planted at `legs` and the hips at `at`
// (x height): the knees stay soft, and in a wide stance the hips sink until both legs reach the ground
// (so the hands are planned as high as the engine really shows them).
const dropFor = (legs: Feet, at: number) =>
  Math.max(STEP_DROP, ...[legs.l, legs.r].map((foot) => STAND_HIP - Math.sqrt(Math.max(0, (LEG * 0.985) ** 2 - (foot - at) ** 2))));

// How far the forearm leans toward the partner (degrees from straight up) for arm angles on a body
// leaning `lean`.
const forearmTilt = (lean: number, shoulder: number, elbow: number) => 180 - (shoulder - lean + elbow);

// How far short of the midpoint a hand point stops (x height): half of this figure's line (`own`), and
// half of the standard figure's line (`standard`).
type Short = { own: number; standard: number };

// The slapping arm. `x` is how far the midpoint is in front of the shoulder (x height). The height of
// the hands is chosen so that the standard figure's forearm stands up the way the palm rule wants
// (closest to PALM_TILT, no higher than SLAP_TOP; a very near partner gets the hands higher, a far one
// lower, the arm reaching further), and every figure uses that height — so partners meet side by side
// whatever their line thickness. Then the hand point stops half its own line short of the midpoint.
function slapArm(lean: number, x: number, short: Short, neckHeight: number) {
  const options: { tilt: number; height: number }[] = [];
  const reach = x - short.standard;
  const top = neckHeight + Math.sqrt(Math.max(0, ARM_REACH * ARM_REACH - reach * reach));
  for (let i = 0; i <= 120 && top >= LOWEST_SLAP; i += 1) {
    const height = LOWEST_SLAP + ((top - LOWEST_SLAP) * i) / 120;
    const arm = armReach(lean, { x: reach, y: neckHeight - height });
    options.push({ tilt: forearmTilt(lean, arm.shoulder, arm.elbow), height });
  }
  const good = options.filter((o) => o.height <= SLAP_TOP + 1e-9 && o.tilt >= MIN_TILT);
  const best = good.length > 0
    ? good.reduce((pick, o) => (Math.abs(o.tilt - PALM_TILT) < Math.abs(pick.tilt - PALM_TILT) ? o : pick))
    : options.find((o) => o.height > SLAP_TOP && o.tilt >= MIN_TILT) ?? options[options.length - 1];
  // (Out of reach — further than highFiveMaxDistance — the arm reaches straight toward the spot.)
  const height = best?.height ?? LOWEST_SLAP;
  return { ...armReach(lean, { x: x - short.own, y: neckHeight - height }), height };
}

// How far in front of the shoulder the hand is (x height) when the forearm leans PALM_TILT and the hand
// is at SLAP_HEIGHT: where the hand likes to be, so the hips step in the rest of the way.
function comfortReach(neckHeight: number) {
  const up = SLAP_HEIGHT - neckHeight;
  const upper = Math.acos(Math.min(1, Math.max(-1, (up - FOREARM * Math.cos(PALM_TILT / DEG)) / UPPER_ARM)));
  return UPPER_ARM * Math.sin(upper) + FOREARM * Math.sin(PALM_TILT / DEG);
}

// The body at the slap, before the arm: the hips stepped in `step` (x height), leaning `lean`. The lead
// foot lands as far in front of the hips as the back foot is behind them. Also where the shoulder ends
// up (forward of the hips, and its height above the ground).
function slapBody(feet: Feet, step: number, lean: number) {
  const legs = { l: step > 0 ? feet.r + 2 * step : feet.l, r: feet.r };
  const pose = plantedLegs(withPose(STAND, { lean, head: SLAP_HEAD, rShoulder: -14, rElbow: 16 }), legs, step, dropFor(legs, step));
  const body = unitBody(pose);
  return { legs, pose, neckX: body.neck.x - body.hip.x, neckHeight: -body.neck.y };
}

// Where the hand likes to be at the slap, in front of the shoulder (x height): the arm that puts the hand
// at SLAP_HEIGHT with the forearm leaning PALM_TILT when standing tall (upper arm a little above level).
const COMFORT_REACH = comfortReach(slapBody(feetOf(STAND), 0, SLAP_LEAN).neckHeight);

// The step in and the slap pose for a partner distance (x height). The hips step in until the hand can
// reach the midpoint comfortably; past the longest step the body leans further in. The hand point stops
// half the line thickness before the midpoint.
function slapPlan(partner: number, feet: Feet, short: Short, mood: HighFiveMood) {
  const middle = partner / 2; // where the hands meet, from the starting hips
  const shoulderAhead = (lean: number) => TORSO * Math.sin(lean / DEG);
  let step = Math.min(MAX_STEP, Math.max(0, middle - shoulderAhead(SLAP_LEAN) - COMFORT_REACH));
  if (step < MIN_STEP) step = 0;
  const lean = Math.min(MAX_LEAN, Math.max(SLAP_LEAN, Math.asin(Math.min(1, (middle - step - COMFORT_REACH) / TORSO)) * DEG)) + mood.hunch;
  let { legs, pose, neckX, neckHeight } = slapBody(feet, step, lean);
  let arm = slapArm(lean, middle - step - neckX, short, neckHeight);
  // STIFF ARM (a robot): the hands meet at the same spot, but the arm stays straight: the hips step in
  // just as far as a straight arm needs to reach the spot (as straight as the longest step allows).
  if (mood.straight) {
    const target = { x: middle - short.own, y: arm.height };
    let pick = { step, gap: Infinity };
    for (let i = 0; i <= 60; i += 1) {
      const s = (MAX_STEP * i) / 60, body = slapBody(feet, s, lean);
      const reach = Math.hypot(target.x - s - body.neckX, target.y - body.neckHeight);
      const gap = reach <= ARM_REACH ? ARM_REACH - reach : 10 * (reach - ARM_REACH);
      if (gap < pick.gap) pick = { step: s, gap };
    }
    // (Only when a straight arm really fits there — reaching the spot, leaning in no more than
    // STRAIGHT_TILT — otherwise, e.g. a partner very close, it slaps like anyone, palm up.)
    const s1 = pick.step < MIN_STEP ? 0 : pick.step, b1 = slapBody(feet, s1, lean);
    const a1 = armReach(lean, { x: target.x - s1 - b1.neckX, y: b1.neckHeight - target.y });
    const tilt = forearmTilt(lean, a1.shoulder, a1.elbow);
    if (pick.gap < 0.01 && tilt >= MIN_TILT && tilt <= STRAIGHT_TILT) {
      step = s1;
      ({ legs, pose, neckX, neckHeight } = b1);
      arm = { ...a1, height: target.y };
    }
  }
  const slap = withPose(pose, { lShoulder: arm.shoulder, lElbow: arm.elbow });
  return { step, legs, slap };
}

// The farthest apart (hip to hip, px) two figures of this height can start and still meet hands: the
// longest step, leaning in as far as it goes, the arm reaching out at the lowest slap height.
export const highFiveMaxDistance = (height: number) => {
  const { neckX, neckHeight } = slapBody(feetOf(STAND), MAX_STEP, MAX_LEAN);
  const up = LOWEST_SLAP - neckHeight;
  return 2 * (MAX_STEP + neckX + Math.sqrt(ARM_REACH * ARM_REACH - up * up)) * height * 0.98;
};

// The slapping arm on its way up (world angles: 0 = down, 90 = forward, 180 = up, -90 = back). The ARM
// BEHIND THE HEAD rule (rig.ts): the elbow goes BACK and up, the hand comes up the short way past the
// ear, so the forearm crosses the upper arm (bend past 180) and stands up behind the head:
// first the elbow bends a little back with the hand pulled in to the chest (it never swings out toward
// the partner) ->
const RAISE: WorldArm = { upper: -25, fore: 115 };
// -> the elbow back at shoulder height, the forearm standing up, the hand by the back of the head
// (Arthur's first wind-up drawing) ->
const ELBOW_BACK_UP: WorldArm = { upper: -80, fore: 168 };
// -> cocked (Arthur's round-6 drawing): the elbow up BEHIND the head, the forearm straight up.
const COCKED_ARM: WorldArm = { upper: -150, fore: 176 };
// On the way back down after the slap: the elbow back up behind the head, then the same way down.
const AFTER_ARM: WorldArm = { upper: -140, fore: 182 };
// Waiting at the hand-over (ONE WAY ROUND), the hand sinks from the chest toward the belly.
const SINKING_ARM: WorldArm = { upper: -12, fore: 80 };
// The other arm hangs bent in front while the slapping arm winds up.
const OTHER_ARM: WorldArm = { upper: 10, fore: 62 };

// MOODS (Arthur, round 8). The walk up is the gait's; this is how the high-five itself looks:
// - ROBOT: "keeping its arms straight: go around behind its head, high five, go back around, and come
//   back". Stiff, every beat at an even speed that starts and stops dead (a
//   robot's beats are all linear); the arm goes up behind the head, slaps with the arm STRAIGHT (when a
//   straight arm fits the meeting spot), goes back round behind the head and comes back down the way it
//   went; the other arm hangs straight and stiff. (On the way up and down behind the head the elbow stays
//   bent, the hand by the ear: a straight arm swung round there carries the hand round the outside of
//   the head further than the arm-path rule allows — and swung up the front instead it reaches out across
//   a close partner's arm. Arthur to decide.)
// - MAD (angry, irritated a little): "stomping a little, arms out, back hunched a little ... clap hard":
//   hunched forward, the other arm held out from the body, bent, elbow back (out behind, never reaching
//   toward the partner, whose free arm is out there too), pulled back harder as the hands meet;
//   the hard slap itself (stamp, deeper wind-up, faster swing) comes from the mood's power (hardOf).
// - HAPPY: "a lot of energy": chest up, the other arm flung back and up as the hands meet (joy), and the
//   hands bounce apart further.
// - Tired, sad, hurt: a little slumped, the other arm hanging, a small bounce.
type HighFiveMood = { straight: boolean; hunch: number; otherArm: WorldArm; slapOther?: WorldArm; bounce: number; arms: { raise: WorldArm; back: WorldArm; cocked: WorldArm; after: WorldArm; fold: WorldArm; sink: WorldArm } };
const BENT_ARMS = { raise: RAISE, back: ELBOW_BACK_UP, cocked: COCKED_ARM, after: AFTER_ARM, fold: RAISE, sink: SINKING_ARM };
const straight = (upper: number): WorldArm => ({ upper, fore: upper });
const MOODS = {
  natural: { straight: false, hunch: 0, otherArm: OTHER_ARM, bounce: 1, arms: BENT_ARMS },
  robot: { straight: true, hunch: 0, otherArm: straight(3), slapOther: straight(-4), bounce: 0.6, arms: BENT_ARMS },
  angry: { straight: false, hunch: 6, otherArm: { upper: -28, fore: 55 }, slapOther: { upper: -38, fore: 40 }, bounce: 1.15, arms: BENT_ARMS },
  irritated: { straight: false, hunch: 4, otherArm: { upper: -22, fore: 50 }, slapOther: { upper: -30, fore: 35 }, bounce: 1.05, arms: BENT_ARMS },
  happy: { straight: false, hunch: -3, otherArm: { upper: 6, fore: 45 }, slapOther: { upper: -45, fore: -5 }, bounce: 1.4, arms: BENT_ARMS },
  slumped: { straight: false, hunch: 5, otherArm: { upper: 4, fore: 24 }, bounce: 0.7, arms: BENT_ARMS },
} satisfies Record<string, HighFiveMood>;
const moodOf = (settings: MoveSettings): HighFiveMood =>
  isRobot(settings) ? MOODS.robot
  : settings.style === "angry" ? MOODS.angry
  : settings.style === "irritated" ? MOODS.irritated
  : settings.style === "happy" ? MOODS.happy
  : settings.style === "tired" || settings.style === "sad" || settings.style === "hurt" ? MOODS.slumped
  : MOODS.natural;

// WIND-UP, the opposite way (windUp rule): the body leans a little BACK (it leans in for the slap) and
// the slapping arm goes up and back behind the head, elbow bent.
// An arm given by its world angles with the bend exactly fore - upper (no wrapping): how far round the
// bend has turned is the path (a held-up hand may run the bend past 180 and 360: rig.ts).
const armAcross = (pose: PoseAngles, a: WorldArm, side: "l" | "r" = "l") => withPose(pose, side === "l" ? { lShoulder: a.upper + pose.lean, lElbow: a.fore - a.upper } : { rShoulder: a.upper + pose.lean, rElbow: a.fore - a.upper });
// The same look of a bend, counted the same way round as `near` (it differs by whole turns).
const sameTurnAs = (bend: number, near: number) => bend + 360 * Math.round((near - bend) / 360);
// `hard`: how hard the slap is (hardOf): a harder slap winds up deeper and stamps the lead foot down.
function windupPlan(partner: number, feet: Feet, short: Short, hard = 1, mood: HighFiveMood = MOODS.natural) {
  const plan = slapPlan(partner, feet, short, mood);
  const body = windUp(withPose(STAND, { lean: 0, head: 0 }), plan.slap, 0.5, { lean: 0.6 * hard });
  // Cocked: the lead foot is down (stamped down: the knees give more, the harder the slap), leaning back
  // a little, the hand behind the head.
  const stamp = STAMP * Math.max(0, hard - 1);
  const cocked = plantedLegs(armAcross(armAcross(withPose(plan.slap, { lean: body.lean, head: body.head - 8 }), mood.arms.cocked), mood.otherArm, "r"), plan.legs, plan.step * 0.9, dropFor(plan.legs, plan.step * 0.9) + (plan.step > 0 ? stamp : stamp / 2));
  // The slap's bend counted on from the cocked arm's (the arm straightens up over the head into it).
  // (The other arm: swung back a little at the slap, or — mad, happy, robot — held where the mood holds it.)
  const slap = armAcross(withPose(plan.slap, { lElbow: sameTurnAs(plan.slap.lElbow, cocked.lElbow + 60) }), mood.slapOther ?? worldArm(plan.slap, "r"), "r");
  return { ...plan, slap, body, cocked, feet, hard, mood };
}
// The wind-up's three poses: the hand comes in to the chest (elbow bent, so it never swings out toward
// the partner), goes up past the ear with the elbow back while the lead foot steps in, and ends cocked
// with the elbow up behind the head.
function windupPoses(plan: ReturnType<typeof windupPlan>) {
  const { feet, step, body, cocked } = plan;
  const stepping = step > 0;
  // Ready: weight settles, knees dip, the elbow bends (hand in to the chest), the body starts to lean back.
  const { mood } = plan;
  const ready = plantedLegs(armAcross(armAcross(withPose(STAND, { lean: body.lean * 0.5, head: -4 }), mood.arms.raise), blendArm({ upper: 4, fore: 30 }, mood.otherArm, mood === MOODS.natural ? 0 : 0.6), "r"), feet, -0.01, 0.03 * plan.hard);
  // Step: the lead knee lifts and swings forward; the hand goes up past the ear, the elbow back.
  const stepPose = plantedLegs(armAcross(armAcross(withPose(STAND, { lean: body.lean * 0.8, head: -8, ...(stepping ? { lHip: 38, lKnee: 46 } : {}) }), mood.arms.back), blendArm({ upper: 8, fore: 50 }, mood.otherArm, mood === MOODS.natural ? 0 : 0.8), "r"), feet, step * 0.45, 0.025, stepping ? "r" : undefined);
  return [ready, stepPose, cocked] as const;
}

// Timing. The slap always comes the same time after the start, whatever the partner distance (so two
// figures' slaps can be lined up), yet the slap itself is never so fast that the hand jumps across the
// screen in one frame, and the wind-up is always slow next to it: a longer swing takes a little longer
// and its wind-up is a little shorter, so they add up the same.
// HIGH-FIVE PACE: the wind-up is about one walking step (gait.ts: a natural walking step is 0.52 s),
// shared between its three parts (ready, step, cocked) by how far the hand goes in each, so the hand
// moves at one even, slow pace; the slap is a quick swing. (Before round 7 the wind-up took 0.83 s of
// base time and the swing 0.2 s: about two and a half walking steps before the hands met.)
const WALK_STEP_SECONDS = 0.52;
const WINDUP_SECONDS = WALK_STEP_SECONDS;
const SLAP_SECONDS = 0.11;
// After the slap, the bounce apart and the arm going back down the way it came up (base seconds).
const AFTER_SECONDS = { bounce: 0.12, over: 0.13, back: 0.12, fold: 0.13, robotBounce: 0.08 } as const;
const STEP_BACK_SECONDS = 0.55; // only when nothing follows: the foot steps back, stand
const ROBOT_STOP = 0.1; // a robot's dead stop at the top of its wind-up (base seconds; its walk holds 0.1 s too)
// How hard the slap is: the mood's power (energy x style, punch.ts powerOf: natural 1, happy a bit
// more, angry 1.25 and up, tired or hurt about half), kept inside a natural range.
const hardOf = (settings: MoveSettings) => Math.min(1.6, Math.max(0.7, powerOf(settings)));
// How much deeper the knees give when a hard slap stamps the lead foot down (x height, per unit of
// extra power) and how much further the hands bounce apart.
const STAMP = 0.06;
// The press: the hands stay together for at least one frame of the slowest frame rate (12 fps), with
// the `slap` mark in its middle, so the frame nearest the slap always shows the hands touching.
const PRESS_SECONDS = 1 / 12;
// How far the hand travels in each part of the wind-up (x height): the arm's own path, and the hips
// carrying it forward as the lead foot steps in (they move at the same time, roughly across each other).
function windupParts(plan: ReturnType<typeof windupPlan>) {
  const poses = [STAND, ...windupPoses(plan)], ats = [0, -0.01, plan.step * 0.45, plan.step * 0.9];
  return poses.slice(1).map((pose, i) => Math.max(1e-3, Math.hypot(pathLength(poses[i], pose, "lHand"), ats[i + 1] - ats[i])));
}
function slapTiming(plan: ReturnType<typeof windupPlan>, settings: MoveSettings) {
  const kind = windKind(settings), k = isRobot(settings) ? ROBOT_WINDUP : 1;
  const strike = pathLength(plan.cocked, plan.slap, "lHand");
  // (A harder slap swings faster: the same swing in less time, never faster than the speed limit.)
  const slap = beatSeconds("action", actionSecondsFor(SLAP_SECONDS / Math.sqrt(plan.hard), strike, settings), settings);
  const windBase = WINDUP_SECONDS * k;
  const wind = beatSeconds(kind, windupSecondsFor(windBase, windupParts(plan).reduce((a, b) => a + b, 0), strike, slap, settings, kind, 3), settings);
  return { slap, wind, kind };
}
function timingFor(partner: number, short: Short, settings: MoveSettings) {
  const feet = feetOf(STAND);
  // (The shared total is worked out for the standard figure, so it is the same for every figure.)
  const standard = { own: short.standard, standard: short.standard };
  const hard = hardOf(settings);
  const mood = moodOf(settings);
  const all = [0.4, 0.6, 0.8, highFiveMaxDistance(1)].map((d) => slapTiming(windupPlan(d, feet, standard, hard, mood), settings));
  const total = Math.max(...all.map((t) => t.wind + t.slap));
  const own = slapTiming(windupPlan(partner, feet, short, hard, mood), settings);
  // Seconds as beat lengths (before style and speed): the wind-up's three beats share what is left, by
  // how far the hand goes in each (an even, slow pace).
  const unit = beatSeconds(own.kind, 1, settings);
  const windBase = (total - own.slap) / unit;
  const lengths = windupParts(windupPlan(partner, feet, short, hard, mood));
  const share = lengths.reduce((a, b) => a + b, 0);
  const press = atLeast("hold", 0.06, PRESS_SECONDS, settings);
  return { wind: lengths.map((length) => (length / share) * windBase), slap: own.slap / beatSeconds("action", 1, settings), kind: own.kind, press };
}

export function highFive(start: Stance, params: HighFiveParams, settings: MoveSettings): MoveOutput {
  const partner = (params.partnerDistance ?? HIGH_FIVE_DEFAULTS.partnerDistance) / settings.height;
  const short: Short = { own: (params.thickness ?? HIGH_FIVE_DEFAULTS.thickness) / 2 / settings.height, standard: HIGH_FIVE_DEFAULTS.thickness / 2 / settings.height };
  const feet = feetOf(start.pose);
  const hard = hardOf(settings);
  const mood = moodOf(settings);
  const plan = windupPlan(partner, feet, short, hard, mood);
  const { step, legs } = plan;
  // EYES: on the partner while winding up (the planner's look target, or the partner straight ahead),
  // on the hands as they meet, then on the partner again.
  const H = settings.height;
  const partnerLook: LookTarget = params.look ?? { ahead: partner * H, up: 0 };
  const slapBody = unitBody(plan.slap);
  const handsLook: LookTarget = { ahead: (slapBody.lHand.x - slapBody.head.x) * H, up: (slapBody.head.y - slapBody.lHand.y) * H };
  const slap = lookToward(plan.slap, handsLook), cocked = lookToward(plan.cocked, partnerLook);
  const [ready, stepPose] = windupPoses(plan).map((pose, i) => lookToward(pose, partnerLook, i === 0 ? 0.6 : 1));
  // While the lead foot is in the air only the back foot is planted.
  const air = step > 0 ? (["rFoot"] as const) : undefined;
  // Bounce apart: after the press the hand pops back up and away (the forearm tips back) and the body
  // rocks back a little (the FLOW pose). Touching limbs always come apart first, so even a robot (no
  // follow-through) pulls its hand back before the arm comes down.
  const slapBend = ((slap.lElbow % 360) + 540) % 360 - 180; // the slap's bend as it looks (-180..180)
  // (A harder slap bounces further apart.)
  // (A robot's straight arm just tips back, still straight; a happy one pops further apart.)
  const bounce = lookToward(plantedLegs(withPose(slap, { lShoulder: slap.lShoulder + 10 * hard * mood.bounce, lElbow: slap.lElbow + (mood.straight ? 0 : Math.min(28 * hard * mood.bounce, 150 - slapBend)), lean: 2 + mood.hunch, head: -8 }), legs, step - 0.02, dropFor(legs, step - 0.02)), handsLook);
  // Back down the way it came up (never on round in a whole circle): the elbow back up behind the head
  // -> the elbow back, the hand by the back of the head -> the hand down past the ear to the chest (the
  // FLOW pose) — so on the way down the hand stays close to the body and never swings out toward the
  // partner.
  const otherDown = mood === MOODS.natural ? { upper: worldArm(slap, "r").upper * 0.5, fore: worldArm(slap, "r").upper * 0.5 + 20 } : mood.otherArm;
  const lowered = (a: WorldArm, at: number) => lookToward(plantedLegs(armAcross(armAcross(withPose(slap, { lean: 1 + mood.hunch, head: -2 }), a), otherDown, "r"), legs, at, dropFor(legs, at)), partnerLook);
  const over = lowered(mood.arms.after, step - 0.025), back = lowered(mood.arms.back, step - 0.03);
  const fold = lowered(mood.arms.fold, step - 0.03);

  // A robot winds up too, just shorter and at an even speed.
  const timing = timingFor(partner, short, settings);
  const kind = timing.kind;
  const up = params.handOver === "up";
  const recover = recoverBeats({ pose: fold, at: step - 0.03 }, legs, STAND, STEP_BACK_SECONDS);
  recover[recover.length - 1].name = "back";
  const beats: PlacedBeat[] = [
    { kind, pose: ready, seconds: timing.wind[0], at: -0.01, name: "ready" },
    { kind, pose: stepPose, seconds: timing.wind[1], at: step * 0.45, contacts: air ? [...air] : undefined },
    { kind, pose: cocked, seconds: timing.wind[2], at: step * 0.9, name: "cocked" },
    // (A ROBOT stops dead at the top for a moment before it swings — when it stops, it stops — as its
    // walk holds still after each step.)
    ...(isRobot(settings) ? [{ kind: "hold" as const, pose: cocked, seconds: ROBOT_STOP, at: step * 0.9 }] : []),
    // The hand swings forward and up FAST, speeding up until the hands touch.
    ...actionThrough([{ pose: slap, at: step, name: "touch" }], { pose: cocked, at: step * 0.9 }, "lHand", timing.slap, settings),
    // The palms press together, stopped dead against each other (the slap is the middle of the press).
    { kind: "hold", pose: slap, seconds: timing.press / 2, at: step, name: "slap" },
    { kind: "hold", pose: slap, seconds: timing.press / 2, at: step },
    { kind: isRobot(settings) ? "settle" : "follow", pose: bounce, seconds: isRobot(settings) ? AFTER_SECONDS.robotBounce : AFTER_SECONDS.bounce, at: step - 0.02 },
    // (ONE WAY ROUND: handing over with the arm up, the way back down is only for when nothing follows.)
    { kind: "settle", pose: over, seconds: AFTER_SECONDS.over, at: step - 0.025, recover: up || undefined },
    { kind: "settle", pose: back, seconds: AFTER_SECONDS.back, at: step - 0.03, recover: up || undefined },
    { kind: "settle", pose: fold, seconds: AFTER_SECONDS.fold, at: step - 0.03, recover: up || undefined },
    ...recover,
  ];
  // (ONE WAY ROUND: a hand-over that would still turn the arm too far in one second waits there a moment.)
  const hold = Math.max(0, Number(params.handOverHold ?? 0));
  // (Up: the hands stay up a moment after the bounce. Down: the hand sinks slowly from the chest toward the
  // belly — on the way the next move takes it, never a dead freeze.)
  if (hold > 0) beats.splice(beats.findIndex((b) => b.pose === (up ? bounce : fold)) + 1, 0, up
    ? { kind: "hold", pose: bounce, seconds: hold, at: step - 0.02 }
    : { kind: "settle", pose: lowered(mood.arms.sink, step - 0.03), seconds: hold, at: step - 0.03 });
  return placedBeatsToKeys(start, beats, settings);
}

// Seconds from the start of a high-five to the slap (the same for any partner distance), so a
// director can start two figures at the right moments: both slaps must land at the same time.
export function highFiveSlapOffset(settings: MoveSettings): number {
  const out = highFive({ t: 0, x: 0, facing: "right", pose: STAND }, HIGH_FIVE_DEFAULTS, settings);
  return out.marks.slap;
}

// ---- ONE WAY ROUND (Arthur, round 8: after a high-five "the arm turns a full circle") ---------------
// After the slap the arm is up in front, having gone up BEHIND the head (its elbow bend carried on past
// 360: rig.ts ARM BEHIND THE HEAD). Going back down the way it came is right when the arm goes down next;
// but if the next move wants that arm up in front again (a wave), going down behind and then up the front
// swings it round a whole circle. So when another move follows straight on, the planner tries both
// hand-overs — the arm still up after the bounce, or back down at the chest — and keeps the one whose arm
// turns LEAST in any one second, counting the high-five and the next move together (`armTurn`). The
// upper arm and the forearm both count, so an elbow bend carried past 360 that the next move would have
// to spin back round (rig.ts: a lowered hand only bends the normal way) rules the "up" hand-over out.
export const ARM_TURN_WINDOW = 1; // seconds (the body rule: never more than about 300 degrees round in a second)
export const ARM_TURN_MAX = 260; // degrees in ARM_TURN_WINDOW the planner aims to stay under (a margin inside the body rule)
const wrap180 = (d: number) => ((d % 360) + 540) % 360 - 180;
// How far (degrees) the arm turns at most in any `window` seconds (`most`), and in all (`total`).
export function armTurn(keys: { t: number; pose: PoseAngles }[], side: "l" | "r" = "l", window = ARM_TURN_WINDOW): { most: number; total: number } {
  // Looked at 24 times a second the way the engine shows it: each key to key eased smoothly, the shoulder
  // the short way, the elbow by its plain numbers, then kept inside the body's bend limits (an elbow bend
  // still counted past 180 when the hand has come down is pulled back in: a pop, which counts as a spin).
  const S = `${side}Shoulder` as const, E = `${side}Elbow` as const;
  const step = 1 / 24, ts: number[] = [], us: number[] = [], fs: number[] = [];
  let total = 0, shoulder = keys[0]?.pose[S] ?? 0;
  for (let i = 1; i < keys.length; i += 1) {
    const a = keys[i - 1].pose, b = keys[i].pose;
    const from = shoulder, to = shoulder + wrap180(b[S] - a[S]);
    shoulder = to;
    const span = keys[i].t - keys[i - 1].t, n = Math.max(1, Math.ceil(span / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k += 1) {
      const u = k / n, e = u * u * (3 - 2 * u);
      const pose = clampPose({ ...a, lean: a.lean + (b.lean - a.lean) * e, [S]: from + (to - from) * e, [E]: a[E] + (b[E] - a[E]) * e }).pose;
      const upper = pose[S] - pose.lean, fore = upper + pose[E];
      if (ts.length) {
        // (Counted on from the last look, the short way: a pop shows as the jump it is.)
        const lastU = us[us.length - 1], lastF = fs[fs.length - 1];
        us.push(lastU + wrap180(upper - lastU)); fs.push(lastF + wrap180(fore - lastF));
        total += Math.abs(us[us.length - 1] - lastU) + Math.abs(fs[fs.length - 1] - lastF);
      } else { us.push(upper); fs.push(fore); }
      ts.push(keys[i - 1].t + span * u);
    }
  }
  let most = 0;
  for (let i = 0; i < ts.length; i += 1) {
    // (A spin — more than SPIN_STEP in one look — is as bad as a whole turn.)
    if (i > 0 && Math.max(Math.abs(us[i] - us[i - 1]), Math.abs(fs[i] - fs[i - 1])) > SPIN_STEP) return { most: Infinity, total };
    for (let j = i + 1; j < ts.length && ts[j] - ts[i] <= window + 1e-9; j += 1) most = Math.max(most, Math.abs(us[j] - us[i]), Math.abs(fs[j] - fs[i]));
  }
  return { most, total };
}
const SPIN_STEP = 90; // degrees in a 24th of a second (the body rule allows at most 100)
// Does arm path `a` turn less than `b`: less in its worst second (by more than a few degrees), or about
// the same there and less in all (no needless swinging back and forth)?
export const turnsLess = (a: { most: number; total: number }, b: { most: number; total: number }) =>
  a.most < b.most - 5 || (Math.abs(a.most - b.most) <= 5 && a.total < b.total);
