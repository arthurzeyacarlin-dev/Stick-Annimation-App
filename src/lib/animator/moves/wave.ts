import { handUp, STAND, STAND_FRONT, withPose, type PoseAngles } from "../rig.ts";
import { amplitudeOf, beatsToKeys, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { gazeElevation, lookToward, type LookTarget } from "./gaze.ts";
import { armOf, feetOf, isRobot, plantedLegs, type PlacedBeat, placedBeatsToKeys, recoverBeats, ROBOT_WINDUP, STYLE_POWER, windKind, type Side } from "./punch.ts";

// SPEC-0017 Phase 2 Round B: wave hello. Built on the Phase 1 hand-made wave Arthur approved as very
// natural: a small dip of the arm first (anticipation), the arm rises with a soft start and stop, the
// forearm swings back and forth (each swing a smooth pendulum, the first ones a little bigger), then
// the arm comes down and the body settles. Front view waves at the camera; side view (facing left or
// right) waves at someone in front. The arm coming down and the body settling are the return to rest
// (`recover`): if another move follows, it starts from the last swing. Started with the feet apart (e.g.
// right after a punch), the feet stay put while waving and step together at the end.
//
// EYES (round 7, gaze.ts): a figure waves at someone it is LOOKING at. Given who it waves to (`look`:
// where their face is from this figure's eyes; the planner fills it from `to` or the nearest figure in
// front), the head turns to them first (during the little dip), and the waving arm goes up toward them:
// higher for someone up high (looking up), lower and more forward for someone below (looking down).
// With nobody to wave to, it looks where it faces.

// `handOver` (the planner's ONE WAY ROUND): "down" = when another move follows, the waving arm still comes
// down first (instead of the next move starting from the arm up), so the next move can't swing it straight on round.
export type WaveParams = { times?: number; hand?: "left" | "right"; look?: LookTarget; handOver?: "up" | "down" };
export const WAVE_DEFAULTS: Required<Omit<WaveParams, "look" | "handOver">> = { times: 2, hand: "right" };

const SWING_SECONDS = 0.25; // one swing out or back (Phase 1 timing)
const SWING_SHRINK = 0.12; // each wave is this much smaller than the one before
// Aiming the wave at someone above or below (degrees the raised arm turns, x the look's angle above
// level): up to a little past straight up for someone high, down to about level-and-up for someone low.
const WAVE_AIM = { share: 0.6, up: 15, down: -30 };

export function wave(start: Stance, params: WaveParams, settings: MoveSettings): MoveOutput {
  const times = params.times ?? WAVE_DEFAULTS.times;
  // SEEN HAND: unless told which hand, a figure seen from the side waves with the hand nearer to the
  // viewer (the one drawn in front of the body), so the wave isn't hidden behind the head.
  const hand = params.hand ?? (start.facing === "front" ? WAVE_DEFAULTS.hand : start.facing === "right" ? "left" : "right");
  const count = Math.max(1, Math.round(times));
  const side: Side = hand === "left" ? "l" : "r";
  const front = start.facing === "front";
  // Bigger swings with more energy and a lively style; small ones when tired or hurt.
  const size = Math.min(1.25, amplitudeOf(settings) * Math.sqrt(STYLE_POWER[settings.style]));
  const rest = front ? STAND_FRONT : STAND;

  // Front view (Phase 1): the arm is out to the side and up; the body tilts a little away from it and
  // the head tilts toward it. `lean`/`head` tilt sideways in front view, so they flip with the hand.
  // Side view: the arm is raised forward and up toward the person in front, chin up a little.
  const tilt = side === "r" ? 1 : -1;
  // (Side view, someone to wave to: the arm aims up or down toward them, inside a natural raised range.)
  const look = front ? undefined : params.look;
  const aim = look ? Math.min(WAVE_AIM.up, Math.max(WAVE_AIM.down, WAVE_AIM.share * gazeElevation(look))) : 0;
  // ALREADY UP (round 8, ONE WAY ROUND): straight after a high-five with this hand, the arm is still up
  // in front. Then there is no rise, so no dip before it (no unnecessary key pose): it goes straight to
  // the waving spot from where it is.
  const startsUp = !front && handUp(start.pose, side);
  // (If that arm went up BEHIND the head — its elbow bend carried on past 180, rig.ts — the bend stays
  // counted on (one turn more) while it waves, and the arm comes down the way it went up: back over the
  // head, past the ear, hand to the chest. A lowered hand only bends the normal way, so coming down in
  // front would spin the forearm round.)
  const carried = startsUp && start.pose[`${side}Elbow`] > 200;
  const turns = carried ? 360 : 0;
  const up = (elbow: number, shoulder: number): PoseAngles => front
    ? withPose(STAND_FRONT, { lean: -3 * tilt, head: 6 * tilt, ...armOf(side, shoulder, elbow), ...armOf(side === "r" ? "l" : "r", 12, 6) })
    : lookToward(withPose(STAND, { lean: -2, head: -6, ...armOf(side, shoulder - 5 + aim, elbow + turns) }), look);
  const ELBOW_MID = 33, ELBOW_SWING = 29; // forearm swings between about 4 and 62 degrees (Phase 1)
  const beats: Beat[] = [
    // Anticipation: the arm dips in a touch before it rises (the opposite way; a robot too, shorter).
    // (The eyes lead: the head turns to whoever it waves to during the dip.)
    ...(startsUp ? [] : [{ kind: windKind(settings), pose: lookToward(withPose(rest, armOf(side, front ? 4 : 2, 4)), look), seconds: 0.35 * (isRobot(settings) ? ROBOT_WINDUP : 1) }]),
    { kind: "settle", pose: up(30, 145), seconds: startsUp ? 0.3 : 0.55, name: "up" },
  ];
  for (let i = 0; i < count; i += 1) {
    const swing = ELBOW_SWING * size * (1 - SWING_SHRINK * i);
    beats.push({ kind: "settle", pose: up(Math.max(2, ELBOW_MID - swing), 150), seconds: SWING_SECONDS });
    beats.push({ kind: "settle", pose: up(Math.min(100, ELBOW_MID + swing), 140), seconds: SWING_SECONDS });
  }
  // (Carried over the top, the bend is counted on past 180 — exactly fore - upper — so it unwinds the way it came.)
  const over = (upper: number, fore: number) => withPose(rest, { lean: 0, head: 0, [`${side}Shoulder`]: upper, [`${side}Elbow`]: fore - upper });
  const armDown = params.handOver === "down";
  beats.push(
    { kind: "settle", pose: up(22, 146), seconds: SWING_SECONDS },
    // Down: the hand comes down past the shoulder with the elbow a little bent, then hangs.
    ...(carried ? [
      // (Back the way it went up: the elbow back up behind the head, the hand past the ear to the chest.)
      { kind: "settle" as const, pose: over(-140, 182), seconds: 0.2, name: "down", recover: !armDown },
      { kind: "settle" as const, pose: over(-80, 168), seconds: 0.15, recover: !armDown },
      { kind: "settle" as const, pose: over(-25, 115), seconds: 0.18, recover: !armDown },
    ] : [{ kind: "settle" as const, pose: withPose(rest, { ...armOf(side, 30, 18), lean: 0, head: 0 }), seconds: 0.55, name: "down", recover: !armDown }]),
    { kind: "settle", pose: rest, seconds: 0.5, recover: true },
  );
  // Side view, feet apart at the start: the legs keep the feet where they are, then step together.
  const feet = feetOf(start.pose), restFeet = feetOf(STAND);
  if (front || (Math.abs(feet.l - restFeet.l) < 0.02 && Math.abs(feet.r - restFeet.r) < 0.02)) return beatsToKeys(start, beats, settings);
  const placed: PlacedBeat[] = beats.slice(0, -1).map((beat) => ({ ...beat, pose: plantedLegs(beat.pose, feet, 0, 0.02), at: 0 }));
  const last = placed[placed.length - 1];
  return placedBeatsToKeys(start, [...placed, ...recoverBeats({ pose: last.pose, at: 0 }, feet, STAND).map((beat) => ({ ...beat, recover: true }))], settings);
}
