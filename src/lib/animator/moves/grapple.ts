import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, withPose, type Facing, type PoseAngles, type Point, type Skeleton } from "../rig.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { actionSeconds, armFromWorld, backLegDrop, blendPose, feetOf, fightFeet, guardAt, guardPose, isRobot, legReach, other, placedBeatsToKeys, plantedLegs, STAND_HIP, windKind, type PlacedBeat, type Side } from "./punch.ts";
import { getUp } from "./fall.ts";
import { fightSteps, GET_UP_PACE, HOP_BACK, HOP_LEGS, HOP_RISE, hopAirLegs, hopLandBeats, hopTakeOff, hopTopAt, realSeconds, RISE_FIRST } from "./hit.ts";
import { chainMoves } from "./sit.ts";
import { footAt, handAt, onFeet, safePose } from "./squat.ts";
import { onTheGround } from "./turn.ts";
import { groundPunchApproach, groundPunchStandAt } from "./groundPunch.ts";
import { liftApproach, liftStandAt } from "./liftSlam.ts";

// SPEC-0017 Phase 2 round 9: GROUND FIGHTING — two-figure moves for when one fighter is down (Arthur,
// round 8: "if he's on the floor something's got to happen ... the standing one stomps on the one on the
// floor"). Built from the same rules as every strike (anticipation the opposite way, a fast action, a
// heavy follow-through) plus two contact rules for two bodies:
// - GRABS AND STRIKES TOUCH: a foot that stomps on a body lands ON that body (its torso or the arms
//   covering it), within a line's width — worked out from where the other body really lies (the planner
//   passes it in as `other`), never a guessed spot.
// - THE ONE BELOW REACTS ON THE HIT: the one lying down sees it coming (head up, looking at the foot),
//   covers (knees pulled up, forearms over the chest and face) just before the foot lands, and is driven
//   flat into the floor the moment it lands (the planner times it to the attacker's `stomp`).
// Poses are facing-relative and in body heights (x height): forward = +x, y grows downward, floor at 0.

// Where the other figure is, as the planner sees it at the start of the move: its hips `dx` (x height)
// in front of this figure's hips (negative = behind), whether it faces the same way or the opposite way,
// its pose, and how high its lowest point is off the floor (x height).
export type Other = { dx: number; facing: "same" | "opposite"; pose: PoseAngles; lift?: number };

const HEAD_R = HEAD_RADIUS.normal;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: Point, b: Point, k: number): Point => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// The other figure's joints in this figure's frame (x height, facing right, floor at y = 0), resting on
// its lowest point the way the engine rests a body (feet, knees, hips, neck, bottom of the head).
export function otherBody(o: Other): Skeleton {
  const view: Facing = o.facing === "same" ? "right" : "left";
  const s = forwardKinematics(o.pose, view, { x: o.dx, y: 0 }, 1, "normal", false);
  const lowest = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + HEAD_R);
  const shift = -(o.lift ?? 0) - lowest;
  const out = {} as Skeleton;
  for (const [name, p] of Object.entries(s) as [keyof Skeleton, Point][]) out[name] = { x: p.x, y: p.y + shift };
  return out;
}

// Is the other figure down on the floor (lying, sitting, kneeling)?
export const isDown = (o: Other | undefined) => Boolean(o && onTheGround(o.pose));

// ---- STOMP DOWN (on someone lying on the floor) -------------------------------------------------------

// Where a stomp lands on a body lying on the floor: on the belly / lower chest (a bit up the torso from
// the hips), on top of the line (the foot rests on the body, it doesn't go into it).
export const STOMP_ON = 0.4; // share of the way from the hips to the neck
const ON_TOP = 0.012; // x height: the foot rests this far above the body's centre line (about a line's width)
export function stompSpot(o: Other): Point {
  const s = otherBody(o);
  const p = mix(s.hip, s.neck, STOMP_ON);
  return { x: p.x, y: p.y - ON_TOP };
}

// How far apart the standing foot and the stomped spot are (x height): the stomping foot lands this far
// in front of the standing foot — a strong, balanced stomp, the hips coming down between the two.
export const STOMP_REACH = 0.24;
// Where this figure's hips should stand (forward of where they are now, x height) to stomp on `o` from
// its standing pose: the planner walks it there first (GO TO WHERE THEY LIE).
// Where the standing foot goes (x height, forward of this figure's hips now): STOMP_REACH behind the spot.
export const stompStandAt = (o: Other) => stompSpot(o).x - STOMP_REACH;
export function stompApproach(start: PoseAngles, o: Other): number {
  const feet = feetOf(start);
  const stay: Side = feet.l >= feet.r ? "r" : "l";
  return stompSpot(o).x - STOMP_REACH - feet[stay];
}

export type StompDownParams = { other?: Other; size?: number };

// STOMP DOWN: stamp on someone lying on the floor. ANTICIPATION the opposite way (down -> up): the weight
// goes onto the back foot, the knee comes up HIGH over the body (the chest rising and leaning back a
// little over the standing leg, both arms rising), it hangs a moment, then the ACTION: the foot drives
// straight down onto the body, fast, the hips dropping into it, the chest coming forward over it and the
// arms whipping down; the weight stays pressed into it a moment (FOLLOW-THROUGH), then the foot comes off
// and steps back down beside the standing foot. The standing foot never moves. EYES: it looks at the spot
// it stomps on all the way through. With nobody lying in front (`other` missing or standing), it stomps
// the floor just in front. Marks `windup` (knee at the top), `stomp` (the foot lands on the body).
export function stompDown(start: Stance, params: StompDownParams, settings: MoveSettings): MoveOutput {
  const size = clamp(Number(params.size ?? 1), 0.5, 1.3) * (0.8 + 0.3 * clamp(settings.energy, 0, 1));
  const feet = feetOf(start.pose);
  const o = params.other && isDown(params.other) ? params.other : undefined;
  // It stands on the foot that is down nearest the spot to stand on (STOMP_REACH behind the spot) and
  // stomps with the other: feet together, the back foot stays and the front one stomps; arriving mid-
  // stride (ARRIVE INTO IT), the front foot just landed is the one it stands on and the back leg swings
  // straight up into the knee lift.
  const standOn = o ? stompStandAt(o) : feet.r;
  const stay: Side = Math.abs(feet.l - feet.r) < 0.06 ? (feet.l >= feet.r ? "r" : "l") : Math.abs(feet.l - standOn) < Math.abs(feet.r - standOn) ? "l" : "r";
  const front = other(stay);
  // (Mid-stride, the weight is already going onto the front foot: no separate shift first.)
  const striding = Math.abs(feet.l - feet.r) >= 0.12;
  // The spot: on the body, or the floor just in front. Never further than a strong stomp reaches.
  const spot0 = o ? stompSpot(o) : { x: feet[stay] + STOMP_REACH, y: 0 };
  const spot = { x: clamp(spot0.x, feet[stay] + 0.1, feet[stay] + 0.36), y: Math.min(0, Math.max(-0.12, spot0.y)) };
  const up = -spot.y; // how high the spot is off the floor
  // A pose with the standing leg planted on its spot and the arms set (world angles), hips `at`, `hipH` up.
  const body = (lean: number, head: number, at: number, hipH: number, frontArm: { upper: number; fore: number }, backArm: { upper: number; fore: number }) => {
    const base = withPose(STAND, { lean, head, ...armFromWorld(lean, front, frontArm), ...armFromWorld(lean, stay, backArm) });
    const leg = legReach(lean, { x: feet[stay] - at, y: hipH });
    return { ...base, [`${stay}Hip`]: leg.hip, [`${stay}Knee`]: leg.knee } as PoseAngles;
  };
  const withFoot = (pose: PoseAngles, at: number, hipH: number, foot: Point) => {
    const leg = legReach(pose.lean, { x: foot.x - at, y: hipH + foot.y });
    return safePose({ ...pose, [`${front}Hip`]: leg.hip, [`${front}Knee`]: leg.knee } as PoseAngles);
  };
  // EYES on the spot: the head tips down toward it (the body's lean counted).
  const looking = (pose: PoseAngles, at: number, hipH: number) => {
    const s = forwardKinematics(pose, "right", { x: at, y: -hipH }, 1, "normal", false);
    const elevation = (Math.atan2(spot.y - s.head.y, Math.max(0.05, spot.x - s.head.x)) * 180) / Math.PI; // + = below
    return { ...pose, head: clamp(-pose.lean + 0.8 * elevation, -30, 30) };
  };
  const tall = STAND_HIP;
  // 1. Weight onto the standing foot (a small sink: the start of the rise).
  const shiftAt = feet[stay] + 0.3 * (feet[front] - feet[stay]);
  const shift = looking(withFoot(body(3, 0, shiftAt, tall - 0.015, { upper: 20, fore: 40 }, { upper: -15, fore: 10 }), shiftAt, tall - 0.015, { x: feet[front], y: 0 }), shiftAt, tall - 0.015);
  // 2. Knee up high over the spot, chest rising and leaning back over the standing leg, arms rising.
  const liftAt = feet[stay] + 0.04;
  const kneeFoot = { x: spot.x - 0.03, y: -(up + 0.26 + 0.1 * size) };
  const lifted = looking(withFoot(body(-5 * size, 0, liftAt, tall, { upper: 95 + 20 * size, fore: 140 + 20 * size }, { upper: -60 - 20 * size, fore: -30 - 20 * size }), liftAt, tall, kneeFoot), liftAt, tall);
  // 3. The slam: the foot on the body, the hips dropping between the feet, the chest over it, arms down hard.
  const slamAt = feet[stay] + 0.55 * (spot.x - feet[stay]);
  const deep = tall - (0.05 + 0.035 * size);
  const slam = looking(withFoot(body(10 * size, 0, slamAt, deep, { upper: 25, fore: 70 }, { upper: -35, fore: -5 }), slamAt, deep, spot), slamAt, deep);
  // 4. Pressed into it a moment (the weight carries on down a little).
  const pressH = deep - 0.012;
  const press = looking(withFoot(body(12 * size, 0, slamAt + 0.01, pressH, { upper: 20, fore: 60 }, { upper: -30, fore: 0 }), slamAt + 0.01, pressH, spot), slamAt + 0.01, pressH);
  // 5. The foot comes off the body, up and back toward its own spot, the hips rising.
  // (It ends standing over the standing foot: as it started, or — arriving mid-stride — in a stand.)
  const endPose = striding ? STAND : start.pose;
  const endAt = striding ? feet[stay] - feetOf(STAND)[stay] : 0;
  const endFoot = endAt + feetOf(endPose)[front];
  const offAt = (slamAt + endAt) / 2;
  const off = withFoot(body(3, 10, offAt, tall - 0.02, { upper: 15, fore: 40 }, { upper: -10, fore: 15 }), offAt, tall - 0.02, { x: (spot.x + endFoot) / 2, y: -(up + 0.07) });
  const one: PlacedBeat["contacts"] = [`${stay}Foot`];
  const slamSeconds = Math.max(...(["lFoot", "rFoot", "lHand", "rHand"] as const).map((joint) => actionSeconds(0.11, lifted, slam, joint, settings)));
  const beats: PlacedBeat[] = [
    // (A robot has no ease-in wind-up, but still lifts its knee: at an even speed.)
    ...(striding ? [] : [{ kind: windKind(settings), pose: shift, seconds: 0.16, at: shiftAt }]),
    { kind: windKind(settings), pose: lifted, seconds: 0.36, at: liftAt, contacts: one, name: "windup" },
    { kind: "hold", pose: lifted, seconds: 0.1, at: liftAt, contacts: one },
    { kind: "action", pose: slam, seconds: slamSeconds, at: slamAt, contacts: one, name: "stomp" },
    { kind: isRobot(settings) ? "hold" : "follow", pose: press, seconds: 0.14, at: slamAt + 0.01, contacts: one },
    { kind: "settle", pose: off, seconds: 0.26, at: offAt, contacts: one },
    { kind: "settle", pose: endPose, seconds: 0.3, at: endAt },
  ];
  return placedBeatsToKeys(start, beats, settings);
}

// ---- COVER UP (lying on the back, under a stomp) ------------------------------------------------------

export type CoverUpParams = { other?: Other };

// Legs given as world angles of the thighs and knee bends.
const legsOf = (lean: number, l: [number, number], r: [number, number]) => ({ lHip: l[0] + lean, lKnee: l[1], rHip: r[0] + lean, rKnee: r[1] });

// Arms given as world angles (from straight down, forward +) on a body leaning `lean`.
type WorldArm = { upper: number; fore: number };
const armsOf = (lean: number, l: WorldArm, r: WorldArm) => ({ ...armFromWorld(lean, "l", l), ...armFromWorld(lean, "r", r) });

// LYING IS LYING (Arthur, round 10: "if he's laying down, he's laying down"): a body lying on its back
// stays ON the floor — hips, back and head down. Only the arms (and the head a touch, the eyes) come up;
// a leg bends only with its foot flat on the floor (knee up) or up in the air. A foot or knee reaching
// below the line the back lies on would prop the whole body up off the floor (it LEVITATES): such a leg
// is bent instead so its foot is flat on the floor where it was.
const HEEL = 0.009; // x height: a lying heel may sit this far below the hips' line (the resting heel)
export function keepLying(pose: PoseAngles): PoseAngles {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  const floor = Math.max(s.hip.y, s.neck.y, s.head.y + HEAD_R) + HEEL;
  let out = pose;
  for (const side of ["l", "r"] as const) {
    const foot = s[`${side}Foot`], knee = s[`${side}Knee`];
    if (foot.y <= floor && knee.y <= floor) continue;
    const leg = legReach(pose.lean, { x: Math.max(0.12, foot.x - s.hip.x), y: floor - HEEL - s.hip.y });
    out = { ...out, [`${side}Hip`]: leg.hip, [`${side}Knee`]: leg.knee } as PoseAngles;
  }
  return out;
}
// How high (x height) a lying pose's hips, neck and head sit above the floor when the engine rests it
// on its lowest point: all near 0 when it lies on the floor.
export function lyingHeights(pose: PoseAngles) {
  const s = restingBody(pose, 0);
  return { hip: -s.hip.y, neck: -s.neck.y, head: -(s.head.y + HEAD_R) };
}

// Lying on the back, under someone about to stomp: it SEES IT COMING (eyes on the foot: the chin a touch
// up) and BRACES in one smooth move — no wiggle, nothing lifts off the floor: the fists come up over the
// chest and face, the knees come up with the feet flat on the floor. The moment the foot lands (mark
// `hit`, timed by the planner to the attacker's `stomp`) it is DRIVEN FLAT exactly as it lay (so the foot
// lands where it was aimed: on the belly), the arms crushed in onto the chest. THE IMPACT: the body
// FOLDS around the hit (shoulders and legs curling up, the belly the low point: the stomach dented), the
// legs JOLT up off the floor and SLAM back down onto it (like a hard fall's impact), and it lies there,
// hurt, hands on the belly, then lies back as it lay (mark `down`). In a side view an arm of a body lying
// on its back can't bend its elbow up off the floor with the hand low on the belly (the rig's elbow
// range), so the guard is the fists up over the chest, elbows by the body: they never go into the floor.
export function coverUp(start: Stance, _params: CoverUpParams, settings: MoveSettings): MoveOutput {
  const p0 = start.pose;
  const none: PlacedBeat["contacts"] = [];
  if (p0.lean > -50) {
    // Not lying on its back: just a held breath where it is, so a plan that asks never breaks.
    return placedBeatsToKeys(start, [{ kind: "hold", pose: p0, seconds: 0.3, at: 0, name: "hit", contacts: none }, { kind: "hold", pose: p0, seconds: 0.2, at: 0, name: "down", contacts: none }], settings);
  }
  const lean = p0.lean;
  // Sees it: the eyes on the foot (the chin a touch up), the back still flat on the floor.
  const see = withPose(p0, { head: p0.head + 4 });
  // Braced: fists up over the chest and face, knees up (feet flat on the floor), back and head down.
  const cover = keepLying(safePose(withPose(p0, { head: p0.head + 4, ...armsOf(lean, { upper: 118, fore: 200 }, { upper: 108, fore: 190 }), ...legsOf(lean, [130, 120], [138, 125]) })));
  // Driven flat: the body exactly as it lay, the arms crushed in onto the chest.
  const flat = safePose(withPose(p0, { head: p0.head - 6, ...armsOf(lean, { upper: 95, fore: 232 }, { upper: 92, fore: 225 }) }));
  // Folded round the hit: the shoulders curl up a little off the floor and the legs jolt up (the belly
  // the low point), the head bouncing forward.
  const foldLean = lean + 9;
  const fold = keepLying(safePose(withPose(flat, { lean: foldLean, head: p0.head + 6, ...armsOf(foldLean, { upper: 96, fore: 228 }, { upper: 92, fore: 222 }), ...legsOf(foldLean, [150, 70], [158, 85]) })));
  // Slammed back down: legs and back flat on the floor again, hard.
  const slammed = keepLying(safePose(withPose(flat, { head: p0.head - 2, lHip: p0.lHip, lKnee: p0.lKnee, rHip: p0.lHip, rKnee: p0.lKnee })));
  // Hurt: lying there, hands on the belly, one knee coming up (foot flat on the floor).
  const hurt = keepLying(safePose(withPose(p0, { head: p0.head + 2, ...armsOf(lean, { upper: 92, fore: 150 }, { upper: 88, fore: 140 }), ...legsOf(lean, [89, 0], [125, 100]) })));
  const robot = isRobot(settings);
  const beats: PlacedBeat[] = [
    { kind: "hold", pose: see, seconds: 0.12, at: 0, contacts: none, name: "sees" },
    { kind: "action", ease: "smooth", pose: cover, seconds: 0.3, at: 0, contacts: none, name: "covered" },
    { kind: "hold", pose: cover, seconds: 0.08, at: 0, contacts: none },
    { kind: "action", pose: flat, seconds: 0.08, at: 0, contacts: none, name: "hit" },
    { kind: robot ? "hold" : "follow", pose: fold, seconds: 0.1, at: 0, contacts: none, name: "fold" },
    { kind: "action", pose: slammed, seconds: 0.09, at: 0, contacts: none, name: "slam" },
    { kind: "settle", pose: hurt, seconds: 0.35, at: 0, contacts: none },
    // (A FIGHT IS NO BREAK, round 14: hurt a moment, not lying about — the next thing comes quickly.)
    { kind: "hold", pose: hurt, seconds: 0.12, at: 0, contacts: none },
    { kind: "settle", pose: p0, seconds: 0.35, at: 0, contacts: none, name: "down" },
  ];
  return placedBeatsToKeys(start, beats, settings);
}

// ---- KIP-UP (a quick get-up from the back) -------------------------------------------------------------

// NO LIMB THROUGH ANOTHER BODY (round 9: "Blue rises right inside Black's guard"): getting up next to
// someone, every line of the body (arms, legs, torso, the head's circle) stays at least this far (x height,
// a line's width and a bit) from every line of theirs — on the way up and in the guard it ends in.
export const BODY_CLEAR = 0.04;
// How far a kip-up can carry the hips back from where they lay (x height): the rock back onto the
// shoulders and the roll up over the hips.
export const KIP_REACH = 0.4;
// How far it can scoot back on its back first to make space (x height) — LYING IS LYING: the hips and
// back stay on the floor while the feet push (no floating). (Round 10: Arthur wants no sliding on the
// back at all; a real roll-away get-up is not built yet, so the scoot stays only where it must.)
export const SCOOT_MAX = 0.5;
export type KipUpParams = { other?: Other };

const SEGMENTS: [keyof Skeleton, keyof Skeleton][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];
const toSegment = (p: Point, a: Point, b: Point) => {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
  const k = clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + k * (b.x - a.x)), p.y - (a.y + k * (b.y - a.y)));
};
const segmentsGap = (a1: Point, a2: Point, b1: Point, b2: Point) => {
  const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x), d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
  const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x), d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(toSegment(a1, b1, b2), toSegment(a2, b1, b2), toSegment(b1, a1, a2), toSegment(b2, a1, a2));
};
// The smallest gap between two bodies' lines (the heads as circles), in the skeletons' units.
export function bodyGap(a: Skeleton, b: Skeleton, headA: number, headB = headA): number {
  let best = Math.hypot(a.head.x - b.head.x, a.head.y - b.head.y) - headA - headB;
  for (const [p, q] of SEGMENTS) {
    best = Math.min(best, toSegment(b.head, a[p], a[q]) - headB, toSegment(a.head, b[p], b[q]) - headA);
    for (const [r, t] of SEGMENTS) best = Math.min(best, segmentsGap(a[p], a[q], b[r], b[t]));
  }
  return best;
}
// A pose's joints (x height, facing right, hips at `at`), resting its lowest point `lift` above the floor.
function restingBody(pose: PoseAngles, at: number, lift = 0): Skeleton {
  const s = forwardKinematics(pose, "right", { x: at, y: 0 }, 1, "normal", false);
  const lowest = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + HEAD_R);
  const out = {} as Skeleton;
  for (const [name, p] of Object.entries(s) as [keyof Skeleton, Point][]) out[name] = { x: p.x, y: p.y - lowest - lift };
  return out;
}

// The kip-up's poses: it gets up WHERE IT LIES (NO SLIDE: the ground has friction, nothing touching the
// floor moves along it), lands crouched on both feet and HOPS BACK `hop` (x height; more, up to HOP_BACK.max,
// when the one `near` is close) into its guard. `clear` = the closest it comes to them (x height, its own
// frame) on the way up.
function kipPath(p0: PoseAngles, near: Skeleton | undefined) {
  const f0 = fightFeet(feetOf(STAND));
  // FAST GET-UP IN A FIGHT (Arthur: "his arms push it up hard — 'boom' — you should be able to SEE that
  // push. When he gets pushed up, his legs extend out so he's back in fighting mode, and he gets his hands
  // out a little"): sitting up, hands planted behind the hips (elbows bent: the anticipation), then the
  // arms straighten FAST and throw the chest and hips up off the floor over the feet, which come in under
  // it; it lands crouched on both feet, hops back and rises into its loose fighting stand, hands out a little.
  const hands = (pose: PoseAngles, hipX: number, hipH: number, handX: number) => {
    const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
    const dy = hipH - s.neck.y - 0.012, dx = handX - hipX - s.neck.x;
    return safePose(handAt(handAt(pose, "l", dx + 0.01, dy), "r", dx - 0.01, dy));
  };
  const layout = (hop: number, shift = 0) => {
    const hipX = -shift;
    const center0 = (f0.l + f0.r) / 2;
    const base = hipX + FEET_AHEAD - center0;
    const f = { l: f0.l + base, r: f0.r + base };
    const upAt = guardAt(f);
    const guard = guardPose(f, upAt);
    const handX = hipX - 0.1;
    // 1. Posted: sitting up leaning back, hands planted behind the hips, elbows bent, feet planted.
    const postH = 0.02;
    const post = hands(onFeet(withPose(STAND, { lean: -50, head: 34 }), f, hipX, postH), hipX, postH, handX);
    // 2. BOOM: the arms straight, the hips thrown up off the floor and forward toward the feet.
    const boomX = hipX + 0.08, boomH = 0.17;
    const boom = hands(onFeet(withPose(STAND, { lean: -22, head: 22 }), f, boomX, boomH), boomX, boomH, handX);
    // 3. Landed crouched on both feet, chest forward over them, the hands coming out a little in front.
    const landAt = upAt - 0.03;
    const handsOut = armsOf(22, { upper: 45, fore: 85 }, { upper: 35, fore: 75 });
    const crouch = plantedLegs(withPose(guard, { lean: 22, head: -10, ...handsOut }), f, landAt, 0.14);
    // 4. BACK HOP: it pushes off, the spine leaning back away from them, in the air a moment (the feet
    // trailing a little forward), lands on both feet `hop` further back, knees giving, and settles.
    // (Nearly standing — as high as the planted feet let the hips be, knees only a little bent to push.)
    // (LOAD straight up over where it landed; THE HOP IS A JUMP (hit.ts): the take-off key straightens the
    // legs on the planted feet, then in the air the feet come a little together.)
    const pushOff = safePose(plantedLegs(withPose(guard, { lean: 4, head: 4 }), f, landAt, backLegDrop(f, landAt) + RISE_FIRST));
    const takeAt = landAt - HOP_LEGS.back;
    const takeOff = hopTakeOff(withPose(guard, { lean: -1, head: 6 }), f, takeAt);
    const air = hopAirLegs(withPose(guard, { lean: HOP_BACK.lean, head: 8 }), f);
    const touch = safePose(plantedLegs(withPose(guard, { lean: HOP_BACK.landLean, head: 6 }), f, upAt, backLegDrop(f, upAt)));
    const landed = safePose(plantedLegs(withPose(guard, { lean: HOP_BACK.landLean, head: 4 }), f, upAt, 0.07));
    const standAt = upAt - hop;
    const airAt = hopTopAt(takeAt, standAt);
    // (0. Sitting up first with the arms where they were: swung straight back from lying, the elbows went
    // through the floor.)
    // (BLOCKED — someone standing over its legs — it first pushes back `shift` along the floor: the old
    // scoot, kept only for this case; a lift-and-place crawl back is not built yet.)
    const pushed = keepLying(safePose(withPose(p0, { ...legsOf(p0.lean, [140 - 120 * shift, 130 - 220 * shift], [130 - 120 * shift, 125 - 220 * shift]) })));
    const sit = safePose({ ...post, ...armsFrom(p0) });
    // (NO SLIDE: the legs draw in through the air — the heels lift off the floor, come in, then plant —
    // they never drag along it.)
    const lying = forwardKinematics(p0, "right", { x: 0, y: 0 }, 1, "normal", false);
    const half = blendPose(p0, sit, 0.5);
    const drawIn = safePose(footAt(footAt(half, "l", f.l, -0.06), "r", f.r, -0.05)); // (right above where they plant: they come straight down)
    // (FRICTION: the feet first come straight UP off the floor where they lie, then move in — moving while
    // still touching it, they slid.)
    const liftFeet = safePose(footAt(footAt(half, "l", lying.lFoot.x, -0.035), "r", lying.rFoot.x, -0.035));
    return { shift, pushed, f, upAt, drawIn, liftFeet, pushOff, takeOff, takeAt, touch, guard, landAt, crouch, post, boom, hipX, boomX, sit, air, airAt, landed, standAt, hop };
  };
  // The closest it comes to the one near it over the whole get-up (the poses on the way between too).
  const closest = (hop: number, shift = 0) => {
    if (!near) return Infinity;
    const l = layout(hop, shift);
    const path: [PoseAngles, number, number][] = [shift > 0 ? [l.pushed, -shift, 0] : [p0, 0, 0], [l.sit, l.hipX, 0], [l.post, l.hipX, 0], [l.boom, l.boomX, 0.03], [l.crouch, l.landAt, 0], [l.pushOff, l.landAt, 0], [l.takeOff, l.takeAt, 0], [l.air, l.airAt, HOP_BACK.lift], [l.touch, l.standAt, HOP_LEGS.touchLift], [l.landed, l.standAt, 0], [l.guard, l.standAt, 0]];
    let best = Infinity;
    for (let i = 1; i < path.length; i += 1) for (let k = i === 1 ? 1 : 0; k <= 4; k += 1) {
      const [pa, ax, al] = path[i - 1], [pb, bx, bl] = path[i];
      const u = k / 4;
      best = Math.min(best, bodyGap(restingBody(blendPose(pa, pb, u), ax + (bx - ax) * u, al + (bl - al) * u), near, HEAD_R));
    }
    return best;
  };
  // The hop: the least (HOP_BACK.min) when its guard clears them by then, else further (up to HOP_BACK.max).
  let pick = HOP_BACK.max;
  const shift = 0;
  for (let hop = HOP_BACK.min; hop <= HOP_BACK.max + 1e-9; hop += 0.02) {
    if (!near || bodyGap(restingBody(layout(hop).guard, layout(hop).standAt), near, HEAD_R) >= BODY_CLEAR + 0.03) { pick = hop; break; }
  }
  // (NO SLIDING, ever (Arthur, round 13): it never pushes itself back along the floor with its legs — the one
  // standing over it steps off first (STEP OFF), and the planner has it lie still until they have.)
  const l = layout(pick, shift);
  return { l, clear: closest(pick, shift) };
}
// (Just the arm angles of a pose: the arms kept as they are while the body moves.)
const armsFrom = (pose: PoseAngles) => ({ lShoulder: pose.lShoulder, lElbow: pose.lElbow, rShoulder: pose.rShoulder, rElbow: pose.rElbow });
const FEET_AHEAD = 0.3; // x height: sitting up to push, the feet are planted this far in front of the hips

// Can it kip up from lying in `pose` without any line of its body passing within BODY_CLEAR of `o`?
// (Someone standing right over its hips: not yet — the planner has it lie still until they step off.)
export const kipUpClear = (pose: PoseAngles, o: Other) => onTheGround(o.pose) || kipPath(pose, otherBody(o)).clear >= BODY_CLEAR;

// KIP-UP: the quick way up from lying on the back (Arthur, round 8: "the one on the floor gets up really
// quickly"; round 11: FAST GET-UP IN A FIGHT, kipPath above): with someone near it first pushes back along
// the floor with its legs, sits up onto its planted hands, the arms push it up HARD, it lands crouched on
// both feet and rises into its loose fighting stand, hands out a little. NO LIMB THROUGH ANOTHER BODY: it
// scoots as far as it needs (up to KIP_REACH) so none of its lines comes within BODY_CLEAR of theirs; if
// that isn't enough, it takes fighting steps back out of the landing. Lying face down (or not lying), it
// does the ordinary get-up instead.
export function kipUp(start: Stance, params: KipUpParams, settings: MoveSettings): MoveOutput {
  const p0 = start.pose;
  if (p0.lean > -50) return getUp(start, {}, settings);
  const H = settings.height;
  const none: PlacedBeat["contacts"] = [];
  const near = params.other && !onTheGround(params.other.pose) ? otherBody(params.other) : undefined;
  const { l } = kipPath(p0, near);
  // (The push as fast as the body allows: the speed limit for hands, feet and head, as for every strike.)
  // GET-UP PACE (hit.ts, Arthur, round 12: "two or three times slower"): every other part slow and one after
  // another — it sits up (the legs drawing in), loads the arms, BOOM, lands crouched, hops back, stands.
  // Slow parts are settle beats (energy can't hurry them). NO SLIDE (round 13): it gets up where it lies.
  const P = GET_UP_PACE;
  const limbs = ["lFoot", "rFoot", "lHand", "rHand", "head"] as const;
  const landKind = isRobot(settings) ? "settle" : "follow";
  const boomSeconds = Math.max(...limbs.map((joint) => actionSeconds(P.push, l.post, l.boom, joint, settings)));
  const landSeconds = Math.max(...limbs.map((joint) => actionSeconds(P.land, l.boom, l.crouch, joint, settings, landKind)));
  const beats: PlacedBeat[] = [
    ...(l.shift > 0 ? [{ kind: "settle" as const, ease: "smooth" as const, pose: l.pushed, seconds: 0.25 + 0.6 * l.shift, at: -l.shift, contacts: none, name: "scoot" }] : []),
    // Sitting up onto the planted hands, elbows bent (the anticipation: down before the push up). (The
    // chest comes up first with the arms still where they were — swung straight back from lying, the
    // elbows went through the floor — then the hands go back and plant.)
    { kind: "settle", ease: "in", pose: l.liftFeet, seconds: 0.08, at: l.hipX, contacts: none },
    { kind: "settle", ease: "out", pose: l.drawIn, seconds: P.sitUp / 2, at: l.hipX, contacts: none },
    { kind: "settle", ease: "out", pose: l.sit, seconds: P.sitUp / 2, at: l.hipX, contacts: none },
    { kind: windKind(settings), pose: l.post, seconds: P.load, at: l.hipX, contacts: none, name: "rock" },
    // BOOM: the arms straighten fast, the hips and chest thrown up off the floor.
    { kind: "action", pose: l.boom, seconds: boomSeconds, at: l.boomX, contacts: none, lift: 0.03 * H, name: "kip" },
    { kind: landKind, pose: l.crouch, seconds: landSeconds, at: l.landAt, contacts: ["lFoot", "rFoot"], name: "land" },
    // (A beat in the crouch, legs loading: the slower rise out of the squat Arthur asked for.)
    { kind: "settle", pose: l.crouch, seconds: !isRobot(settings) && P.legsUnder - landSeconds > 0.05 ? P.legsUnder - landSeconds : 0.05, at: l.landAt, contacts: ["lFoot", "rFoot"] },
    // BACK HOP (round 13): push off, the spine leaning back, in the air a moment, land further back.
    // (THE HOP IS A JUMP: load, the legs straighten FAST on the planted feet, the feet leave the floor — the
    // lift rising quickly — and come a little together, then land apart.)
    { kind: "settle", ease: "smooth", pose: l.pushOff, seconds: P.hopPush, at: l.landAt, contacts: ["lFoot", "rFoot"] },
    { kind: "action", ease: "in", pose: l.takeOff, seconds: P.hopExtend, at: l.takeAt, contacts: ["lFoot", "rFoot"], name: "takeOff" },
    { kind: "action", ease: "smooth", xEase: "linear", liftEase: "out", pose: l.air, seconds: realSeconds("action", HOP_RISE, settings), at: l.airAt, contacts: none, lift: HOP_BACK.lift * H, name: "hop" },
    ...hopLandBeats(l.touch, l.landed, l.standAt, 1, H, "hopLand"),
    // (A robot has no give in its knees: no squash held, no pause crouched — it just goes on.)
    { kind: "hold", pose: l.landed, seconds: isRobot(settings) ? 0.01 : P.squash, at: l.standAt },
    { kind: "settle", pose: l.guard, seconds: isRobot(settings) ? 0.8 * P.stand : P.stand, at: l.standAt, name: "up" },
  ];
  const built = placedBeatsToKeys(start, beats, settings);
  // (A FAST GET-UP IS NEVER THE SLOW ONE: whatever the mood — sneaky, sad, hurt slow every part down — it takes
  // at most 95% of the slow get-up's time; longer, the whole of it is done evenly quicker to fit.)
  const slow = getUp(start, {}, settings).end.t - start.t, took = built.end.t - start.t;
  const k = took > 0.95 * slow ? (0.95 * slow) / took : 1, at = (t: number) => start.t + (t - start.t) * k;
  const up: MoveOutput = k === 1 ? built : { ...built, keys: built.keys.map((key) => ({ ...key, t: at(key.t) })), end: { ...built.end, t: at(built.end.t) }, marks: Object.fromEntries(Object.entries(built.marks).map(([n, t]) => [n, at(t)])), ...(built.flow ? { flow: { ...built.flow, stance: { ...built.flow.stance, t: at(built.flow.stance.t) } } } : {}) };
  // Still too close in its guard (no room to hop further): short fighting steps back until the guards clear.
  if (!near) return up;
  let more = 0;
  while (more < 0.6 && bodyGap(restingBody(l.guard, l.standAt - more), near, HEAD_R) < BODY_CLEAR) more += 0.02;
  if (more <= 1e-9) return up;
  return chainMoves(start, [() => up, (from) => fightSteps(from, -more * H, settings)]);
}

// ---- For the planner (plan.ts) -----------------------------------------------------------------------

// Ground attacks (the planner walks them to where the target lies and tells them how it lies: `other`;
// each one's landing is "<id>.groundHit<k>") and every ground move (attacks and the answers to them: an
// answer with `from` is timed to that attacker's next landing).
export const GROUND_ATTACKS = new Set(["stompDown", "groundPunch", "liftSlam"]);
export const GROUND_MOVES = new Set(["stompDown", "groundPunch", "coverUp", "kipUp", "liftSlam", "slammed"]);
// How far (x height, forward) the hips must go before a ground attack can reach the one lying there.
export function groundApproach(move: string, pose: PoseAngles, o: Other): number {
  return move === "stompDown" ? stompApproach(pose, o) : move === "groundPunch" ? groundPunchApproach(pose, o) : move === "liftSlam" ? liftApproach(pose, o) : 0;
}
// Where a ground attack's standing foot goes (x height, forward of the hips now).
export function groundStandAt(move: string, o: Other): number {
  return move === "stompDown" ? stompStandAt(o) : move === "groundPunch" ? groundPunchStandAt(o) : move === "liftSlam" ? liftStandAt(o) : 0;
}

// The joints that count as "the body" when something lands on it (torso and the arms covering it).
export const BODY_LINES: [keyof Skeleton, keyof Skeleton][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"]];
// How far a point is from a body's lines (stage px when the skeleton is in stage px).
export function distanceToBody(p: Point, s: Skeleton): number {
  let best = Infinity;
  for (const [a, b] of BODY_LINES) {
    const ax = s[a].x, ay = s[a].y, bx = s[b].x, by = s[b].y;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const k = clamp(((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / len2, 0, 1);
    best = Math.min(best, Math.hypot(p.x - (ax + k * (bx - ax)), p.y - (ay + k * (by - ay))));
  }
  return best;
}

