import { forwardKinematics } from "../pose.ts";
import { STAND, withPose, type PoseAngles, type Point } from "../rig.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { actionSeconds, armFromWorld, armReach, feetOf, isRobot, legReach, other, placedBeatsToKeys, powerOf, STAND_HIP, windKind, type PlacedBeat, type Side } from "./punch.ts";
import { isDown, stompSpot, type Other } from "./grapple.ts";
import { safePose } from "./squat.ts";

// GROUND PUNCH (N12, round 12; Arthur: "He sprints a little ... and then instead of dashing, he hops in the
// air, gets his arm up, gravity pulls him down, and then he punches the stick figure (lying on the floor).
// It's still the same thing as a stomp, but now he's hopping in the air and hitting with his hand.")
// A GROUND ATTACK like stompDown (the planner walks it to where the target lies, tells it how they lie:
// `other`; its landing `stomp` is "<id>.groundHit<k>", so the one lying covers up on it). Built from the
// same rules as every strike:
// - ANTICIPATION THE OPPOSITE WAY: down before up (a crouch on the push foot, arms swung back), then the
//   HOP: the push leg drives, the body goes up, the punching arm comes forward and UP over the head (the
//   fist cocked high above / behind the head at the top), the other arm reaches toward the target;
// - GRAVITY: up slowing, a moment at the top, down faster and faster; the fist comes down with the body;
// - HIT = LANDING: the front foot lands and the back knee drops to the floor as the fist lands ON the
//   lying body's chest/belly (stompSpot: worked out from how it really lies), the chest pitched over it;
// - FOLLOW-THROUGH: pressed in a moment, then it stands back up beside the body, feet together.
// RUNNING HAMMER STRIKE (round 15, Arthur: "how do I get there as fast as I can? ... running, like
// parkour ... when he runs he could hop, and it should be a HAMMER STRIKE with his hand"): run into it (the
// planner hands over on a landing, with the run's `speed`), it carries the speed: no stop, no deep crouch,
// a quick gather on the landing foot, a long hop forward and up (the hips keep going at about the run's
// speed), BOTH fists raised high over the head in the air, and both come down hard together ON the body as
// it lands on one knee beside it. From a stand (no speed) it is the hop-punch above.
// ARM PATH: the punching arm goes up the FRONT way and comes back down the same way (never round the
// back, never round the head). The planted foot never slides. Poses in body heights, facing right.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DEG = Math.PI / 180;
const THIGH = 0.23, SHIN = 0.23, TORSO = 0.3, ARM = 0.31;

// The kneel at the hit: chest pitched over the body, the back knee on the floor, the front foot under it.
const KNEEL_LEAN = 55;
const KNEEL_THIGH = -55; // the back thigh's world angle (knee down behind the hips)
const KNEEL_HIP = THIGH * Math.cos(KNEEL_THIGH * DEG); // hips this high (x height) with that knee on the floor
const HOP = 0.32; // x height: how far the hips fly from the push to the landing (natural)
const PUSH_AHEAD = 0.12; // the hips are this far past the push foot as it leaves the floor
const RUN_HOP = 0.3; // x height: a RUNNING hop flies this much further (the planner pushes off further back)
// How far (x height) the fist lands in front of the hips at the kneel (shoulder lean + arm reaching down).
function reachAhead(spotUp: number) {
  const sx = TORSO * Math.sin(KNEEL_LEAN * DEG), sy = KNEEL_HIP + TORSO * Math.cos(KNEEL_LEAN * DEG) - spotUp;
  return sx + Math.sqrt(Math.max(0.05 ** 2, (0.93 * ARM) ** 2 - sy * sy));
}
// Where the push foot should be (x height, forward of the hips now) to hop onto `o`: the planner walks there.
export const groundPunchStandAt = (o: Other, running = false) => { const s = stompSpot(o); return s.x - reachAhead(-s.y) - HOP - (running ? RUN_HOP : 0) - PUSH_AHEAD; };
export function groundPunchApproach(start: PoseAngles, o: Other): number {
  const feet = feetOf(start);
  return groundPunchStandAt(o) - Math.max(feet.l, feet.r);
}

// speed: the run's speed when it hands over (px/s, filled in by the planner): a RUNNING HAMMER STRIKE.
export type GroundPunchParams = { other?: Other; size?: number; speed?: number };

// Where a pose's joint is (x height) from its hips.
const jointOf = (pose: PoseAngles, joint: "lFoot" | "rFoot" | "lKnee" | "rKnee") => {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  return { x: s[joint].x - s.hip.x, y: s[joint].y - s.hip.y };
};
// A leg from its thigh's world angle and shin's world angle.
const legAngles = (lean: number, thigh: number, shin: number) => ({ hip: thigh + lean, knee: clamp(thigh - shin, 0, 150) });

export function groundPunch(start: Stance, params: GroundPunchParams, settings: MoveSettings): MoveOutput {
  const size = clamp(Number(params.size ?? 1), 0.5, 1.3) * clamp(0.8 + 0.25 * powerOf(settings), 0.85, 1.2);
  const feet = feetOf(start.pose);
  const o = params.other && isDown(params.other) ? params.other : undefined;
  const v = Number(params.speed ?? 0) / settings.height, running = v > 0.5; // (x height per second)
  // The push foot: the front one arriving mid-stride (ARRIVE INTO IT), else the back one of a stand.
  const striding = Math.abs(feet.l - feet.r) >= 0.12;
  const stay: Side = striding ? (feet.l >= feet.r ? "l" : "r") : feet.l >= feet.r ? "r" : "l";
  const swing = other(stay);
  const pushFoot = feet[stay];
  // The spot: on the body (or the floor in front with nobody there).
  const spot0: Point = o ? stompSpot(o) : { x: pushFoot + PUSH_AHEAD + HOP + reachAhead(0), y: 0 };
  const up = clamp(-spot0.y, 0, 0.12);
  const ahead = reachAhead(up);
  // The hop: from the push to the kneel, never shorter or longer than a real hop.
  const pushX = pushFoot + PUSH_AHEAD;
  const landX = pushX + clamp(spot0.x - ahead - pushX, 0.12, running ? 1 : 0.6);
  const spot = { x: landX + ahead, y: -up };
  const punch: Side = swing; // the arm on the swing leg's side punches (the push side's arm reaches out)
  const reach = other(punch);
  // (HAMMER STRIKE: running in, the other arm goes up and comes down with the punching one: both fists.)
  const arms = (pose: PoseAngles, p: { upper: number; fore: number }, r: { upper: number; fore: number }, both = false) =>
    ({ ...pose, ...armFromWorld(pose.lean, punch, p), ...armFromWorld(pose.lean, reach, both && running ? p : r) }) as PoseAngles;
  const legs = (pose: PoseAngles, side: Side, l: { hip: number; knee: number }) => ({ ...pose, [`${side}Hip`]: l.hip, [`${side}Knee`]: l.knee }) as PoseAngles;
  // EYES on the spot (the head tips toward it, the lean counted).
  const looking = (pose: PoseAngles, at: number, hipH: number) => {
    const s = forwardKinematics(pose, "right", { x: at, y: -hipH }, 1, "normal", false);
    const elevation = Math.atan2(spot.y - s.head.y, Math.max(0.05, spot.x - s.head.x)) / DEG;
    return { ...pose, head: clamp(-pose.lean + 0.8 * elevation, -30, 30) };
  };

  // 1. GATHER: down over the push foot (the hips sink), arms swung back (the anticipation down for a hop up).
  // (Running: only a quick, shallow gather, the hips still travelling over the landing foot.)
  const lowH = STAND_HIP - (running ? 0.045 : 0.07) * size;
  const gatherAt = running ? pushFoot + 0.03 : pushFoot - 0.02;
  let gather = withPose(STAND, { lean: 12 });
  gather = legs(gather, stay, legReach(12, { x: pushFoot - gatherAt, y: lowH }));
  gather = striding ? legs(gather, swing, legReach(12, { x: -0.16, y: lowH - 0.07 })) : legs(gather, swing, legReach(12, { x: feet[swing] - gatherAt, y: lowH }));
  gather = looking(running ? arms(gather, { upper: -20, fore: -5 }, { upper: -20, fore: -5 }) : arms(gather, { upper: -40, fore: -25 }, { upper: -35, fore: -15 }), gatherAt, lowH);
  // 2. PUSH: the push leg straight behind, the swing knee driving up, the punching arm swinging forward and up.
  const pushH = STAND_HIP - 0.01;
  const pushLean = running ? 14 : 8;
  let push = withPose(STAND, { lean: pushLean });
  push = legs(push, stay, legReach(pushLean, { x: pushFoot - pushX, y: pushH }));
  push = legs(push, swing, legAngles(pushLean, 60, 0));
  push = looking(arms(push, { upper: 70, fore: 100 }, { upper: 50, fore: 70 }, true), pushX, pushH);
  // 3. TOP: in the air, the fist cocked high above / behind the head, the other arm reaching at the target.
  // (Running, the hips keep about the run's speed through the air: the top and the drop at those times.)
  const topX = pushX + (running ? 0.45 : 0.55) * (landX - pushX);
  let top = withPose(STAND, { lean: 5 });
  top = legs(legs(top, swing, legAngles(5, 65, -5)), stay, legAngles(5, -5, -70));
  top = looking(arms(top, { upper: 150 + 5 * size, fore: 180 + 10 * size }, { upper: 60, fore: 75 }, true), topX, STAND_HIP);
  // 4. DROP: gravity pulls it down, the chest pitching forward, the fist still cocked, legs reaching down.
  const dropX = pushX + (running ? 0.72 : 0.82) * (landX - pushX);
  let drop = withPose(STAND, { lean: 25 });
  drop = legs(legs(drop, swing, legAngles(25, 55, 5)), stay, legAngles(25, -25, -95));
  drop = looking(arms(drop, { upper: 155 + 5 * size, fore: 185 + 10 * size }, { upper: 50, fore: 60 }, true), dropX, STAND_HIP);
  // 5. HIT = LANDING: the kneel, the fist ON the body.
  let kneel = withPose(STAND, { lean: KNEEL_LEAN });
  kneel = legs(kneel, stay, legAngles(KNEEL_LEAN, KNEEL_THIGH, -100));
  {
    const front = Math.min(130 - KNEEL_LEAN - 2, 75);
    const knee = { x: THIGH * Math.sin(front * DEG), y: THIGH * Math.cos(front * DEG) };
    const dy = KNEEL_HIP - knee.y, dx = -Math.sqrt(Math.max(0, SHIN * SHIN - dy * dy));
    kneel = legs(kneel, swing, legAngles(KNEEL_LEAN, front, Math.atan2(dx, dy) / DEG));
  }
  const shoulder = { x: TORSO * Math.sin(KNEEL_LEAN * DEG), y: -(KNEEL_HIP + TORSO * Math.cos(KNEEL_LEAN * DEG)) };
  const fist = armReach(KNEEL_LEAN, { x: spot.x - landX - shoulder.x, y: spot.y - shoulder.y });
  kneel = { ...kneel, [`${punch}Shoulder`]: fist.shoulder, [`${punch}Elbow`]: fist.elbow, ...(running ? { [`${reach}Shoulder`]: fist.shoulder, [`${reach}Elbow`]: fist.elbow } : armFromWorld(KNEEL_LEAN, reach, { upper: -30, fore: -5 })) } as PoseAngles;
  kneel = looking(safePose(kneel), landX, KNEEL_HIP);
  // The front foot lands here and stays put from now on.
  const footX = landX + jointOf(kneel, `${swing}Foot`).x;
  // 6. PRESSED in a moment (the shoulders sink in a touch, the fist stays).
  const press = { ...kneel, head: kneel.head + 4 };
  // 7. UP AGAIN: the back knee comes up off the floor, the chest rises, the fist comes off the body.
  let rise = withPose(STAND, { lean: 22 });
  const riseH = STAND_HIP - 0.12;
  rise = legs(rise, swing, legReach(22, { x: 0.05, y: riseH }));
  rise = legs(rise, stay, legReach(22, { x: -0.14, y: riseH - 0.05 }));
  rise = looking(arms(rise, { upper: 30, fore: 55 }, { upper: -15, fore: 10 }), 0, riseH);
  const riseAt = footX - jointOf(rise, `${swing}Foot`).x;
  // 8. Standing beside the body, feet together (the back foot steps up next to the front one).
  const endAt = footX - feetOf(STAND)[swing];
  const pushContacts: PlacedBeat["contacts"] = striding ? [`${stay}Foot`] : [`${stay}Foot`, `${swing}Foot`];
  const H = settings.height;
  const lift = (running ? 1.15 : 1) * (0.1 + 0.05 * size) * H;
  // (Running: each part takes as long as the hips need at the run's speed; the flight a real running hop.)
  const air = clamp((landX - pushX) / Math.max(v, 0.5), 0.42, 0.55);
  const beats: PlacedBeat[] = [
    { kind: running ? "settle" : windKind(settings), pose: gather, seconds: running ? clamp(gatherAt / v, 0.07, 0.14) : 0.22, at: gatherAt, contacts: pushContacts },
    { kind: "action", pose: push, seconds: running ? clamp((pushX - gatherAt) / v, 0.12, 0.15) : actionSeconds(0.12, gather, push, `${punch}Hand`, settings), at: pushX, contacts: [`${stay}Foot`], name: "hop" },
    // GRAVITY: up slowing to the top, then down faster and faster.
    { kind: "settle", pose: top, seconds: running ? 0.45 * air : 0.2, at: topX, contacts: [], lift, liftEase: "out", ease: "out", name: "top" },
    { kind: "settle", pose: drop, seconds: running ? 0.27 * air : 0.1, at: dropX, contacts: [], lift: 0.55 * lift, liftEase: "in", ease: "smooth" },
    { kind: "action", pose: kneel, seconds: running ? Math.max(0.18, 0.3 * air) : actionSeconds(0.14, drop, kneel, `${punch}Hand`, settings), at: landX, contacts: [`${swing}Foot`], liftEase: "in", ...(running ? { ease: "linear" as const } : {}), name: "stomp" },
    { kind: isRobot(settings) ? "hold" : "follow", pose: press, seconds: 0.14, at: landX, contacts: [`${swing}Foot`] },
    { kind: "settle", pose: safePose(rise), seconds: 0.32, at: riseAt, contacts: [`${swing}Foot`] },
    { kind: "settle", pose: STAND, seconds: 0.3, at: endAt },
  ];
  return placedBeatsToKeys(start, beats, settings);
}
