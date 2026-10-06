import type { CharacterKey, FootContact } from "../engine.ts";
import type { Ease } from "../easing.ts";
import { clampPose, ELBOW_ACROSS_AUTO, JOINT_LIMITS, jointRange, STAND, type Facing, type PoseAngles, type PoseKey } from "../rig.ts";
import { RAMP_SCALE, SPEED_CHANGES, STYLE_CHANGES, type MoveSpeed, type MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2: the shared motion lesson every body move uses (Arthur, 2026-10-04).
// Almost every movement is: ANTICIPATION (a slow wind-up the opposite way) -> ACTION (speeds up fast
// into the hit / jump / throw) -> FOLLOW-THROUGH (slows down past the target) -> SETTLE (eases back to
// rest). Each part speeds up and slows down smoothly; the action is the fast part. A move is written as
// a short list of BEATS (target pose + what kind of beat it is); this file turns beats into engine key
// poses with the right timing and easing. No frames are ever written by hand: the engine makes every
// frame in between from these keys and its body rules.

// `guard`: how a fighter stands between strikes (punch.ts FIGHT LOOK): "loose" (the default: a cartoon
// stick-figure fight, hands low, around the belly), "high" (loose, but the hands up at the chest: when the
// user asks for higher hands) or "realistic" (a real boxing/MMA guard, hands up at the chin: only when the
// user explicitly asks for realistic or educational fighting).
export type MoveSettings = { height: number; style: MoveStyle; speed: MoveSpeed; energy: number; guard?: "loose" | "high" | "realistic" };

// Where a character is between moves: standing still on both feet.
export type Stance = { t: number; x: number; facing: Facing; pose: PoseAngles };

// What a move hands back: its key poses, where it ends, and named moments (e.g. "hit", "release",
// "land") that other characters or objects can be timed to. `flow` is where the move's own action is
// over, before it goes back to resting: when another move follows straight away (punch -> punch), the
// next move starts from there instead of from a rest pose (Arthur, 2026-10-04: no needless standing).
export type MoveOutput = { keys: CharacterKey[]; end: Stance; marks: Record<string, number>; flow?: { keys: number; stance: Stance } };

export type BeatKind =
  | "anticipation" // slow wind-up (eases in and out); deeper and a bit longer with more energy
  | "action" // the fast part: speeds up all the way into its end (the hit); faster with more energy
  | "follow" // slows down after the action (eases out)
  | "settle" // eases back toward rest (smooth)
  | "hold"; // stays (or nearly stays) in place

export type Beat = {
  kind: BeatKind;
  pose: PoseAngles; // target pose at the end of this beat (facing-relative: forward is +)
  seconds: number; // base duration (natural style, normal speed, energy 0.5)
  name?: string; // a mark for this beat's end time
  dx?: number; // forward travel during this beat, px (negative = backward)
  lift?: number; // lowest foot/knee height above the ground at the end of the beat (0 = on the ground)
  contacts?: FootContact[]; // planted feet at the end of this beat (default: both)
  ease?: Ease; // override the beat kind's easing for the angles
  xEase?: Ease;
  liftEase?: Ease;
  facing?: Facing; // turn to this facing at the end of this beat
  // Part of going back to rest at the end of the move (left out when another move follows straight on).
  recover?: boolean;
};

export const BOTH_FEET: FootContact[] = ["lFoot", "rFoot"];

// Direction of "forward" on the stage for a facing.
export const forwardSign = (facing: Facing) => (facing === "left" ? -1 : 1);

// How long things take for a style and speed (x the natural, normal-speed timing).
export function tempoOf(settings: MoveSettings) {
  const style = STYLE_CHANGES[settings.style].scale?.stepSeconds ?? 1;
  return style * SPEED_CHANGES[settings.speed].stepSeconds;
}

// How big a move is (x the natural size): energy makes wind-ups deeper and actions bigger.
export const amplitudeOf = (settings: MoveSettings) => 0.6 + 0.8 * Math.min(1, Math.max(0, settings.energy));

// Seconds for one beat.
export function beatSeconds(kind: BeatKind, seconds: number, settings: MoveSettings) {
  const e = Math.min(1, Math.max(0, settings.energy));
  const tempo = tempoOf(settings);
  const ramp = RAMP_SCALE[settings.style];
  if (ramp === 0 && (kind === "anticipation" || kind === "follow")) return 0; // a robot has no wind-up or follow-through
  // Tired / heavy / hurt bodies wind up and recover more slowly; the action itself stays quick-ish.
  const slow = ramp > 0 ? Math.sqrt(ramp) : 1;
  switch (kind) {
    case "action": return seconds * tempo * (1.3 - 0.6 * e);
    case "anticipation": return seconds * tempo * slow * (0.85 + 0.3 * e);
    case "follow": return seconds * tempo * slow;
    default: return seconds * tempo * slow;
  }
}

const KIND_EASE: Record<BeatKind, Ease> = { anticipation: "smooth", action: "in", follow: "out", settle: "smooth", hold: "smooth" };

// Blend two poses (k = 0 -> a, 1 -> b).
export const lerpPose = (a: PoseAngles, b: PoseAngles, k: number): PoseAngles => {
  const out = { ...a };
  for (const key of Object.keys(a) as PoseKey[]) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
};

// A pose made bigger or smaller around the rest pose (energy).
export const scaleFromRest = (pose: PoseAngles, k: number, rest: PoseAngles = STAND) => lerpPose(rest, pose, k);

// Turn a list of beats into key poses that start exactly at `start` and end standing.
export function beatsToKeys(start: Stance, beats: Beat[], settings: MoveSettings): MoveOutput {
  const robot = RAMP_SCALE[settings.style] === 0;
  let t = start.t, x = start.x, facing = start.facing;
  const marks: Record<string, number> = {};
  const keys: CharacterKey[] = [{ t, x, pose: start.pose, contacts: BOTH_FEET, facing, lift: 0 }];
  let flow: MoveOutput["flow"];
  for (const beat of beats) {
    const seconds = beatSeconds(beat.kind, beat.seconds, settings);
    if (seconds <= 1e-6) continue;
    if (beat.recover && !flow) {
      const here = keys[keys.length - 1];
      flow = { keys: keys.length, stance: { t: here.t, x: here.x, facing, pose: here.pose } };
    }
    const previous = keys[keys.length - 1];
    // The way the angles, travel and height change on the way INTO this beat's pose.
    previous.ease = robot ? "linear" : beat.ease ?? KIND_EASE[beat.kind];
    previous.xEase = robot ? "linear" : beat.xEase ?? previous.ease;
    previous.liftEase = robot ? "linear" : beat.liftEase ?? previous.ease;
    t += seconds;
    x += (beat.dx ?? 0) * forwardSign(facing);
    facing = beat.facing ?? facing;
    // Every pose stays inside the body's bend limits, whoever wrote it (a library move, breathing added
    // on top of a pose, or a new move the AI invents).
    // ELBOW CONTINUITY: the bend keeps going the way it was going (across, not back around).
    keys.push({ t, x, pose: continueElbows(previous.pose, clampPose(beat.pose).pose), lift: beat.lift ?? 0, contacts: beat.contacts ?? BOTH_FEET, facing });
    if (beat.name) marks[beat.name] = t;
  }
  const last = keys[keys.length - 1];
  return { keys, end: { t: last.t, x: last.x, facing, pose: last.pose }, marks, flow };
}

// ELBOW CONTINUITY (rig.ts HAND UP, ELBOW FREE): a held-up arm's elbow bend may pass through 180, so
// one look has two values (b and b - 360). When the next key's elbow is more than half a turn from this
// one's, it takes the other value — if the body allows it there — so the forearm keeps turning the way
// it was going (across the upper arm) instead of swinging all the way back round through straight.
export function continueElbows(previous: PoseAngles, pose: PoseAngles): PoseAngles {
  let out = pose;
  for (const key of ["lElbow", "rElbow"] as const) {
    const jump = out[key] - previous[key];
    if (Math.abs(jump) <= 180) continue;
    const probe = { ...out, [key]: out[key] - 360 * Math.sign(jump) };
    const [lo, hi] = jointRange(probe, key);
    // (Past ELBOW_ACROSS_AUTO only when the bend is already out there: a move took it there on purpose.)
    const top = Math.min(hi, Math.max(ELBOW_ACROSS_AUTO, previous[key]));
    if (probe[key] >= lo - 1e-9 && probe[key] <= top + 1e-9) out = probe;
  }
  return out;
}

// ANTICIPATION RULE (Arthur, 2026-10-04): a wind-up goes the OPPOSITE way from the action. Given where
// the body is (`from`) and where the action is going (`action`), the wind-up pulls every joint the
// other way by `k` x the action's own change (arms back before a punch or throw, the leg back before a
// kick, the arm back behind the head before a high-five), the torso leans against the action, and
// everything stays inside the body's bend limits. This is how the engine (and later the AI's own new
// moves) get a natural wind-up without anyone drawing it.
export function windUp(from: PoseAngles, action: PoseAngles, k = 0.45, options: { lean?: number; only?: PoseKey[] } = {}): PoseAngles {
  const out = { ...from };
  for (const key of (options.only ?? (Object.keys(from) as PoseKey[]))) {
    if (key === "lean" || key === "head") continue;
    out[key] = limit(key, from[key] - k * (action[key] - from[key]));
  }
  // The body leans away from where the action goes (a forward action -> lean back first).
  const forward = action.lean - from.lean;
  out.lean = limit("lean", from.lean - (options.lean ?? 0.6) * Math.max(Math.abs(forward), 8) * Math.sign(forward || 1));
  out.head = limit("head", from.head - 0.3 * (out.lean - from.lean));
  return out;
}

const limit = (key: PoseKey, value: number) => {
  const range = (JOINT_LIMITS as Record<string, readonly [number, number]>)[key];
  return range ? Math.min(range[1], Math.max(range[0], value)) : value;
};
