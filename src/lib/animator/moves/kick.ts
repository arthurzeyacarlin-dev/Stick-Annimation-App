import { STAND, withPose, type PoseAngles } from "../rig.ts";
import { lookAtOwn, lookToward, type LookTarget } from "./gaze.ts";
import { beatSeconds, windUp, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import {
  actionSeconds, blendPose, actionThrough, armFromWorld, armOf, feetOf, fightFeet, GUARD, guardAt, guardPose, isRobot, legReach, plantedLegs, powerOf, recoverBeats, ROBOT_WINDUP,
  solveAngle, unitBody, windKind, windupSeconds, worldArm, type PlacedBeat, placedBeatsToKeys,
} from "./punch.ts";

// SPEC-0017 Phase 2 Round B: front kick (reworked after Arthur's review, 2026-10-04).
// The weight shifts onto the standing (back, r) foot -> WIND-UP the opposite way: the kicking leg swings
// BACK (thigh behind the body, knee bent) while the body leans FORWARD to balance it, arms out -> the leg
// swings forward FAST (speeding up all the way) and snaps straight at the target height while the body
// leans back -> the shin folds back (slowing down) -> the foot comes down in front, in the fighting
// stance with the hands up: the FLOW pose (a punch or another kick can start straight from here) ->
// only when nothing follows, the front foot steps back and the figure stands. The standing foot never
// moves.
// EYES (round 8): the figure looks where the kick goes — from the weight shift until the foot comes back
// down: at the one it kicks (`look`, handed over by the planner: where their face is), or, kicking at
// nothing, at the spot its foot hits (down for a low kick, about level for a high one).

// `look`: where the one it kicks is (gaze.ts LookTarget); the planner sets it when there is someone.
// `arriving`: straight out of a walk, jog or run (the planner sets it: STRIKE OUT OF THE STRIDE).
export type KickParams = { height?: "low" | "mid" | "high"; look?: LookTarget; arriving?: boolean };
export const KICK_DEFAULTS: Required<Omit<KickParams, "look" | "arriving">> = { height: "mid" };

// Per height: where the foot is at the hit (above the ground, x height) and how far the body leans
// back at the hit to balance it.
const KICK_SHAPES = {
  low: { foot: 0.2, lean: -5 },
  mid: { foot: 0.5, lean: -12 },
  high: { foot: 0.8, lean: -20 },
} as const;

// KICK PACE (Arthur, round 8: "the kick takes a little long, it's weird"). The wind-up is as big as the
// kick's power needs, no bigger: the leg swings back until the foot is COCK_BACK behind the hip (x height,
// at full power; less for a weaker, tired kick) and about knee-high (COCK_DROP below the hip, lower for a
// low kick). The wind-up's speed rule (slow next to the strike, windupSeconds) then sets its time from how
// far the foot really travels, so a smaller back-swing is a quicker wind-up AND a shorter strike — the
// kick's pace follows its size, power and mood instead of a fixed time. (It used to swing the foot up to
// hip height far behind: about 0.65 s of wind-up, a kick twice as long as a cross.)
const COCK_BACK = 0.2;
const COCK_DROP = 0.18; // the cocked foot sits this far below the hip (x height), a little more for low kicks

export function kick(start: Stance, params: KickParams, settings: MoveSettings): MoveOutput {
  const { height, look, arriving } = { ...KICK_DEFAULTS, ...params };
  const shape = KICK_SHAPES[height];
  const power = Math.min(1.6, powerOf(settings));
  const robot = isRobot(settings);
  const feet0 = feetOf(start.pose);
  // The kicking (l) foot lands in front, in the fighting stance; the standing (r) foot never moves.
  const stance = fightFeet(feet0);
  const standing = (pose: PoseAngles, at: number, drop: number) => plantedLegs(pose, feet0, at, drop, "r");
  const overFoot = feet0.r + 0.03; // hips just in front of the standing foot while on one leg

  // Weight shift: both feet still down, the hips move over the standing foot, knees soften, the hands come
  // up (or stay up, after a punch).
  const handsUp = blendPose(start.pose, GUARD, 0.6);
  const shift = plantedLegs(withPose(STAND, { lean: 2, head: 4, ...armOf("r", handsUp.rShoulder, handsUp.rElbow), ...armOf("l", handsUp.lShoulder, handsUp.lElbow) }), feet0, overFoot, 0.022);

  // HIT: the leg straight with the foot at the target height; the hips push forward into it and the body
  // leans back to balance it; the arms swing the other way (back-side arm forward).
  const hitAt = overFoot + 0.02 * power;
  const hitFor = (thigh: number) => standing(withPose(STAND, {
    lean: shape.lean - 3 * power, head: 0, lHip: thigh, lKnee: 4,
    ...armOf("r", 48, 70), ...armOf("l", -38, 30),
  }), hitAt, 0.025);
  const hit = hitFor(solveAngle(20, 130, shape.foot, hitFor, (pose) => -unitBody(pose).lFoot.y));

  // WIND-UP, the opposite way (windUp rule): the body leans forward (it leans back in the kick), the hips
  // sink back a little, and the kicking leg swings BACK — the mirror image of the kick: the foot behind
  // the hip instead of in front, knee bent.
  const body = windUp(shift, hit, 0.5, { lean: 0.75 * Math.min(1.3, Math.max(0.8, power)) });
  const windAt = overFoot - 0.012 * power;
  const back = legReach(body.lean, { x: -COCK_BACK * Math.min(1, 0.6 + 0.35 * power), y: height === "low" ? COCK_DROP + 0.08 : COCK_DROP });
  // Arms out for balance: the mirror image of what they do in the kick (the front arm goes back there).
  const arms = { ...armFromWorld(body.lean, "l", worldArm(hit, "r")), ...armFromWorld(body.lean, "r", worldArm(hit, "l")) };
  const windup = standing(withPose(body, { ...arms, lHip: back.hip, lKnee: Math.max(back.knee, 55) }), windAt, 0.03);

  // Retract: the shin folds back as the leg slows down, the arms start to come up.
  const retract = standing(withPose(blendPose(hit, GUARD, 0.35), { lean: shape.lean * 0.5, lHip: hit.lHip * 0.75, lKnee: 105 }), hitAt - 0.005, 0.03);

  // Land: the foot comes down in front, in the fighting stance, hands up (the FLOW pose).
  const landAt = guardAt(stance);
  // (A strike ends with the hands up — for a loose fighter only halfway, like a punch: FIGHT LOOK.)
  const up = guardPose(stance, landAt, "realistic");
  const land = settings.guard === "realistic" ? up : blendPose(up, guardPose(stance, landAt, settings.guard), 0.5);

  // EYES: on the one it kicks, or on the spot the foot hits (from the start hips, x height; above the floor).
  const struck = unitBody(hit);
  const spot = { ahead: hitAt + struck.lFoot.x - struck.hip.x, up: -struck.lFoot.y };
  const eyesOn = (pose: PoseAngles, at: number, amount = 1) => (look ? lookToward(pose, look, amount) : lookAtOwn(pose, { ahead: spot.ahead - at, up: spot.up }, amount));

  const hitSeconds = actionSeconds(0.13, windup, hit, "lFoot", settings);
  const kind = windKind(settings);
  const lift = robot ? ROBOT_WINDUP : 1;
  // STRIKE OUT OF THE STRIDE (round 11, Arthur: "right when he stops jogging, his leg should lift up and
  // kick him"): arriving from a walk, jog or run, the stride's last landing already put the weight on the
  // standing foot (planted in front) with the kicking leg behind — no weight shift and no standing still:
  // the momentum carries the hips on over the standing foot as the back leg comes straight up into the
  // wind-up (a little quicker: it is already on its way back).
  const beats: PlacedBeat[] = [
    ...(arriving ? [] : [{ kind, pose: eyesOn(shift, overFoot), seconds: 0.24 * lift, at: overFoot, name: "shift" }]),
    { kind, pose: eyesOn(windup, windAt), seconds: (arriving ? 0.8 : 1) * windupSeconds(0.32 * lift, arriving ? start.pose : shift, windup, hit, "lFoot", beatSeconds("action", hitSeconds, settings), settings, kind), at: windAt, contacts: ["rFoot"], name: "windup" },
    ...actionThrough([{ pose: eyesOn(hit, hitAt), at: hitAt, contacts: ["rFoot"], name: "hit" }], { pose: eyesOn(windup, windAt), at: windAt }, "lFoot", hitSeconds, settings),
    { kind: robot ? "settle" : "follow", pose: eyesOn(retract, hitAt - 0.005, 0.7), seconds: actionSeconds(0.16, hit, retract, "lFoot", settings, robot ? "settle" : "follow"), at: hitAt - 0.005, contacts: ["rFoot"] },
    { kind: "settle", pose: land, seconds: 0.3, at: landAt, name: "land" },
    ...recoverBeats({ pose: land, at: landAt }, stance, STAND),
  ];
  return placedBeatsToKeys(start, beats, settings);
}
