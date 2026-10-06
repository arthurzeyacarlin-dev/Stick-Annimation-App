import type { CharacterKey, FootContact } from "../engine.ts";
import { monotoneTangents, sampleChannel } from "../easing.ts";
import { forwardKinematics } from "../pose.ts";
import { POSE_KEYS, PROPORTIONS, STAND, withPose, type PoseAngles } from "../rig.ts";
import { amplitudeOf, beatSeconds, beatsToKeys, forwardSign, lerpPose, tempoOf, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { feetAhead, footAt, hipsOver, levelFeet, placeBeats, safePose, shinsDown, withFeetAhead, type PlacedBeat } from "./squat.ts";
import { RAMP_SCALE, type MoveStyle } from "./styles.ts";

// SPEC-0017 Phase 2: jump. Built on Phase 1's hand-made jump (Arthur: "very natural"):
// CROUCH (slow wind-up the opposite way: down, knees bend, arms swing back) -> PUSH (explodes up,
// fastest as the feet leave the ground, arms swinging forward and up) -> FLIGHT (a real gravity arc:
// rises slowing down, falls speeding up) -> LAND (knees bend to soak up the weight) -> RECOVER (rises back
// to standing). The flow point is the end of the landing (knees bent, ready to go): when another move
// follows straight away it starts from there, without standing up first. Works from any start pose with
// both feet planted (it crouches from wherever the body is).

export type JumpParams = { height?: number; distance?: number; speed?: number; runOn?: RunOn };
// height: how high the feet get at the top, x figure height. distance: forward travel, px.
// speed: forward hip speed (px/s) when the jump starts (a walk or run handing over mid-stride). 0 or
// missing = the standing jump. With speed it is a RUNNING JUMP (see runningJump below).
export const JUMP_DEFAULTS = { height: 0.35, distance: 0 };
// A running jump goes a little higher than a standing one when nobody says (round 8, Arthur: "I'd like
// him to jump a bit higher"): the run-up's speed helps the push.
export const RUNNING_JUMP_HEIGHT = 0.42;

// Gravity in figure heights per second squared. Stronger than real life (about 5.6) but a little softer
// than Phase 1's hand-made jump (about 10): cartoon jumps feel better snappy.
export const GRAVITY = 8;
// How far the feet have peeled off the floor at take-off (x height, for a full-size jump).
const TOE_LIFT = 0.07;
const MIN_PUSH = 0.17; // seconds: the quickest push from the crouch to take-off

// How each style jumps (x natural): height of the jump, depth of the crouch and of the landing, size of
// the arm swing, extra forward lean. Happy also bounces once more after landing.
type JumpStyle = { height: number; crouch: number; absorb: number; arms: number; lean: number; bounce?: boolean };
const JUMP_STYLES: Record<MoveStyle, JumpStyle> = {
  natural: { height: 1, crouch: 1, absorb: 1, arms: 1, lean: 0 },
  robot: { height: 0.6, crouch: 0.4, absorb: 0.35, arms: 0.6, lean: -4 }, // (a robot skips the crouch and the soft landing)
  sneaky: { height: 0.6, crouch: 1, absorb: 1.2, arms: 0.5, lean: 6 },
  tired: { height: 0.5, crouch: 0.8, absorb: 1.15, arms: 0.45, lean: 6 },
  happy: { height: 1.2, crouch: 1, absorb: 0.75, arms: 1.1, lean: -4, bounce: true },
  angry: { height: 1.05, crouch: 1.05, absorb: 1.05, arms: 1, lean: 6 },
  heavy: { height: 0.5, crouch: 1.1, absorb: 1.35, arms: 0.7, lean: 4 },
  hurt: { height: 0.4, crouch: 0.75, absorb: 1.25, arms: 0.4, lean: 8 },
  sad: { height: 0.5, crouch: 0.8, absorb: 1.1, arms: 0.4, lean: 8 },
  irritated: { height: 0.95, crouch: 1, absorb: 1, arms: 0.9, lean: 5 },
};

// Key poses (facing-relative), from Phase 1's jump. The arms swing forward under the body during the
// push and keep rising overhead in the air (each key less than half a turn from the last, so they always
// swing the natural way, never backward over the head). At take-off the knees are still a little bent:
// the legs are pushing their fastest there, and the feet leave the ground with the body.
const CROUCH: PoseAngles = withPose(STAND, { lean: 28, head: -12, lShoulder: -42, rShoulder: -50, lElbow: 22, rElbow: 18, lHip: 76, rHip: 72, lKnee: 106, rKnee: 104 });
const PUSH: PoseAngles = withPose(STAND, { lean: 10, head: -8, lShoulder: 62, rShoulder: 54, lElbow: 16, rElbow: 20, lHip: 16, rHip: 14, lKnee: 24, rKnee: 22 });
const TUCK: PoseAngles = withPose(STAND, { lean: 6, head: -4, lShoulder: 158, rShoulder: 148, lElbow: 26, rElbow: 30, lHip: 58, rHip: 50, lKnee: 72, rKnee: 66 });
const REACH: PoseAngles = withPose(STAND, { lean: 8, head: -2, lShoulder: 80, rShoulder: 70, lElbow: 20, rElbow: 24, lHip: 26, rHip: 22, lKnee: 34, rKnee: 30 });
const ABSORB: PoseAngles = withPose(STAND, { lean: 30, head: -14, lShoulder: 36, rShoulder: 24, lElbow: 34, rElbow: 30, lHip: 72, rHip: 70, lKnee: 98, rKnee: 96 });
const RECOVER: PoseAngles = withPose(STAND, { lean: 4, lShoulder: 12, rShoulder: 0, lHip: 8, rHip: 4, lKnee: 10, rKnee: 8 });

// Arms scaled by their own amount (the body by another), so a small jump still swings its arms.
const ARM_KEYS = ["lShoulder", "rShoulder", "lElbow", "rElbow"] as const;
const scaled = (pose: PoseAngles, body: number, arms: number) => {
  const out = lerpPose(STAND, pose, body);
  for (const key of ARM_KEYS) out[key] = STAND[key] + (pose[key] - STAND[key]) * arms;
  return safePose(out);
};

// Jump up (and forward by `distance` px). Marks: "takeoff" (feet leave the ground), "top", "land".
// Flow: after the landing (see above).
export function jump(start: Stance, params: JumpParams, settings: MoveSettings): MoveOutput {
  const moving = Number(params.speed);
  if (moving > 0) return runningJump(start, params, moving, settings);
  const H = settings.height;
  const look = JUMP_STYLES[settings.style];
  const amp = amplitudeOf(settings);
  const robot = RAMP_SCALE[settings.style] === 0;
  const distance = params.distance ?? JUMP_DEFAULTS.distance;
  // Higher with energy and for lively styles; lower for heavy, tired or hurt bodies.
  const height = Math.max(0.03, (params.height ?? JUMP_DEFAULTS.height) * look.height * amp);
  const size = Math.min(1.35, 0.5 + 0.5 * (height / JUMP_DEFAULTS.height)); // how big the whole body action is
  const reach = Math.min(1, Math.abs(distance) / H) * Math.sign(distance); // a long jump leans into it

  // The wind-up goes deeper the higher the jump (and deeper for a heavy body).
  const crouch = levelFeet(shinsDown(scaled(withPose(CROUCH, { lean: CROUCH.lean + look.lean + 8 * reach }), Math.min(1.3, size * look.crouch), Math.min(1, look.arms * amp))));
  const pushArms = look.arms * (0.8 + 0.2 * amp);
  const pushBase = scaled(withPose(PUSH, { lean: PUSH.lean + look.lean / 2 + 10 * reach }), 1, pushArms);
  const tuck = scaled(TUCK, Math.min(1.2, size), Math.min(1.08, pushArms));
  const absorb = levelFeet(shinsDown(scaled(withPose(ABSORB, { lean: ABSORB.lean + look.lean }), Math.min(1.3, (0.55 + 0.45 * size) * look.absorb), look.arms)));
  const reachBase = scaled(REACH, Math.min(1.2, size), look.arms);

  // Timing. Flight time comes from gravity (a higher jump hangs longer), at the style's and speed's
  // tempo; a "hold" beat adds a tired/heavy slow-down, so take that back out to keep gravity the same.
  const rise = Math.sqrt((2 * height) / GRAVITY);
  const flightBeat = rise * (tempoOf(settings) / beatSeconds("hold", 1, settings));
  const tCrouch = beatSeconds("anticipation", 0.42, settings);
  // Even the most explosive push takes a moment (legs and arms can only move so fast).
  const pushSeconds = 0.2 * Math.max(1, MIN_PUSH / beatSeconds("action", 0.2, settings));
  const tPush = beatSeconds("action", pushSeconds, settings);
  const tFlight = 2 * rise * tempoOf(settings);
  const tAbsorb = beatSeconds("follow", 0.2, settings);

  // Forward travel, with no jolt in the forward speed: the push speeds the hips up (eased in) to the
  // flight speed, the flight keeps it, and the landing slows it down (eased out). The take-off pose's
  // feet trail behind the hips just enough to give that speed, the landing feet reach ahead just enough,
  // and the feet land exactly `distance` ahead of where they took off. (A robot moves at constant speeds.)
  const feet0 = feetAhead(start.pose) * H;
  const crouchAt = tCrouch > 0 ? hipsOver(feet0, crouch, H) : 0;
  const speedUp = robot ? 1 : 2; // end speed of an eased-in segment, x its average speed
  const absorbShare = tAbsorb > 0 ? tAbsorb / speedUp : 0; // hip travel while landing = speed x this
  const landFeet = tAbsorb > 0 ? feetAhead(absorb) * H : feetAhead(reachBase) * H;
  const k = (speedUp * (tFlight + absorbShare)) / tPush;
  const pushFeet = (landFeet + k * (feet0 - crouchAt) - distance) / (1 + k);
  const push = levelFeet(withFeetAhead(pushBase, pushFeet / H));
  const takeoffAt = hipsOver(feet0, push, H);
  const speed = (speedUp * (takeoffAt - crouchAt)) / tPush;
  const absorbAt = takeoffAt + speed * (tFlight + absorbShare);
  const landAt = takeoffAt + speed * tFlight;
  const feet1 = feet0 + distance;
  const land = levelFeet(tAbsorb > 0 ? withFeetAhead(reachBase, (feet1 - landAt) / H) : reachBase);
  // Whatever the poses couldn't give (a very long jump) is made up in the air, so the distance is exact.
  const flightEnd = tAbsorb > 0 ? landAt + (feet1 - feetAhead(absorb) * H - absorbAt) : hipsOver(feet1, land, H);

  const toe = robot ? 0 : TOE_LIFT * size * H; // a robot's stiff feet stay flat
  const beats: PlacedBeat[] = [
    // Anticipation: a slow crouch, arms swinging back.
    { kind: "anticipation", seconds: 0.42, pose: crouch, at: crouchAt },
    // Action: legs and arms explode up, the legs fastest at the moment the feet leave the ground.
    // The feet peel off the floor in the last moment of the push (like heels rising onto the toes), so
    // the body is already moving up at full speed when it leaves the ground.
    { kind: "action", seconds: pushSeconds, pose: push, at: takeoffAt, lift: toe, contacts: [], name: "takeoff" },
    // Flight: steady forward speed; the feet rise slowing down (out) and fall speeding up (in), a parabola.
    { kind: "hold", seconds: flightBeat, pose: tuck, at: (takeoffAt + flightEnd) / 2, lift: height * H, contacts: [], ease: "smooth", liftEase: "out", xEase: "linear", name: "top" },
    // Landing is the take-off backwards: the feet touch down and roll flat while the knees bend.
    { kind: "hold", seconds: flightBeat, pose: land, at: flightEnd, lift: toe, contacts: toe > 0 ? [] : undefined, ease: "smooth", liftEase: "in", xEase: "linear", name: "land" },
    // Follow-through: the knees bend to soak up the landing, slowing the body down.
    { kind: "follow", seconds: 0.2, pose: absorb, at: hipsOver(feet1, absorb, H) },
  ];
  if (look.bounce) {
    // Happy: springs straight back up into a little hop before settling.
    const pop = levelFeet(scaled(withPose(PUSH, { lean: 2, lShoulder: 96, rShoulder: 88 }), 1, 1));
    const hop = 0.06 * amp;
    const hopBeat = Math.sqrt((2 * hop) / GRAVITY) * (tempoOf(settings) / beatSeconds("hold", 1, settings));
    const soft = levelFeet(lerpPose(STAND, absorb, 0.5));
    const hopLand = levelFeet(reachBase); // straight down this time
    beats.push(
      { kind: "action", seconds: 0.16 * Math.max(1, MIN_PUSH / beatSeconds("action", 0.16, settings)), pose: pop, at: hipsOver(feet1, pop, H), lift: toe / 2, contacts: [] },
      { kind: "hold", seconds: hopBeat, pose: lerpPose(pop, tuck, 0.3), at: hipsOver(feet1, pop, H), lift: hop * H, contacts: [], ease: "smooth", liftEase: "out" },
      { kind: "hold", seconds: hopBeat, pose: hopLand, at: hipsOver(feet1, hopLand, H), lift: toe / 2, contacts: [], ease: "smooth", liftEase: "in" },
      { kind: "follow", seconds: 0.16, pose: soft, at: hipsOver(feet1, soft, H) },
    );
  }
  // Settle: rise out of the landing and ease into the normal stand (left out when a move follows).
  beats.push(
    { kind: "settle", seconds: 0.3, pose: RECOVER, at: hipsOver(feet1, RECOVER, H), recover: true },
    { kind: "settle", seconds: 0.32, pose: STAND, at: hipsOver(feet1, STAND, H), recover: true },
  );
  return beatsToKeys(start, placeBeats(beats, settings), settings);
}

// ---- Running jump (Arthur's MOMENTUM rule: a body keeps going the way its weight is going) ----
// A walk or run followed by a jump doesn't stop and crouch: it takes off from the run at speed.
// - TAKE-OFF FOOT: a moving body takes off from ONE foot: the foot that has just come down in front of
//   the hips (the planner hands over the moment a running foot lands), or else the next one to come down.
// - GATHER (the anticipation goes the opposite way of the jump: DOWN): the hips roll over the take-off
//   foot and dip (deeper the slower it goes), the free leg folds under the body, the arms swing back.
//   The hips never stop.
// - TAKE-OFF: the leg drives the body up and forward and leaves the ground behind the hips on its toes;
//   the free knee drives up; the arm on the take-off side punches forward and up, the other swings back
//   (like a running stride, only bigger).
// - NO SLOW-DOWN (round 8, Arthur: "what makes it truly unnatural is he's just slowing down at the jump"):
//   from the last steps through the take-off and the flight the hips never go slower than they came in.
//   Each push-off in the gather adds a little speed, like every push-off of the run itself (the run is
//   slowest the moment a foot lands, which is when it hands over), so the body flies at the run's own speed
//   or a touch faster. A robot keeps one speed.
// - FLIGHT: a real gravity arc (the standing jump's gravity). The forward speed carries on, so a faster
//   run jumps further. Both knees tuck up to clear what is underneath (at the top the lowest foot or knee
//   is `height` x height off the floor), then the legs reach forward for the ground; the arms come forward.
// - LANDING: both feet come down together in front of the hips and the knees bend to soak up the fall,
//   the body pitching forward (more the faster it goes). Then it either RUNS ON (a run follows: the back
//   foot is already swinging forward into the next stride while the front foot pushes off, and the run
//   takes over at its own speed: no stop, no slow-down) or brakes to a stop over its feet and stands up.
// `distance` (px): the length of the jump, from the take-off foot to where the (back) foot lands. Exact
// when the speed allows it: a harder push can stretch a jump (up to a point), but nothing can shorten it
// below what the speed gives (a body in the air can't brake; MOMENTUM wins); missing = what the speed
// gives. `runOn` (filled in by the planner): the run that follows — the pose, speed and
// planted foot of the run's push-off where it takes over.
export type RunOn = { pose: PoseAngles; speed: number; foot: "l" | "r" };
export const LEG = PROPORTIONS.thigh + PROPORTIONS.shin;
const PUSH_GAIN = 0.08; // forward speed the gather's two push-offs add together (x the speed it came in with)
const RUN_ON_AFTER = 0.09; // seconds on both feet after the bottom of the landing before the run takes over (at least)
const PITCH = 6; // degrees of extra forward lean on landing per body height per second of speed
// BODY SPEED LIMIT (the engine's rule: no joint moves more than 120 px between two pictures at 24 a
// second). A quick jump (a fast run, a fast tempo) has little time for each swing, so the arms and legs
// go only as far as they can get in that time (with a margin), never faster.
export const JOINT_SPEED = 120 * 24 * 0.8; // px per second
const SWING_PEAK = 1.35; // a smooth swing's fastest moment, x its average speed
const ARM_TURN = 900; // degrees per second (the arm-path rule: under 100 degrees a picture at 12 a second)
export const KEY_GAP = 1 / 40; // seconds between the keys this move writes
type Side = "l" | "r";
type Limb = readonly [number, number]; // angle from straight down (forward +), bend
const other = (side: Side): Side => (side === "l" ? "r" : "l");
export const bodyAt = (pose: PoseAngles) => forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
// How far below the hips the lowest foot or knee is (x height).
export const dropOf = (pose: PoseAngles) => { const s = bodyAt(pose); return Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y); };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// A smooth path from (t0, a) to (t1, b), leaving at speed m0 and arriving at speed m1 (per second).
export const hermite = (t0: number, t1: number, a: number, b: number, m0: number, m1: number) => (t: number) => {
  const h = Math.max(1e-6, t1 - t0), u = clamp((t - t0) / h, 0, 1), u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h * m1;
};
// A pose from angles seen on the screen: torso lean, head, each arm (upper arm, elbow) and leg (thigh, knee).
export const bodyPose = (lean: number, head: number, arms: Record<Side, Limb>, legs: Record<Side, Limb>): PoseAngles => safePose({
  lean, head,
  lShoulder: arms.l[0] + lean, lElbow: arms.l[1], rShoulder: arms.r[0] + lean, rElbow: arms.r[1],
  lHip: legs.l[0] + lean, lKnee: legs.l[1], rHip: legs.r[0] + lean, rKnee: legs.r[1],
});
export const legsOf = (pose: PoseAngles): Record<Side, Limb> => ({ l: [pose.lHip - pose.lean, pose.lKnee], r: [pose.rHip - pose.lean, pose.rKnee] });
export const armsOf = (pose: PoseAngles): Record<Side, Limb> => ({ l: [pose.lShoulder - pose.lean, pose.lElbow], r: [pose.rShoulder - pose.lean, pose.rElbow] });
const sides = <T,>(t: Side, forT: T, forOther: T): Record<Side, T> => (t === "l" ? { l: forT, r: forOther } : { l: forOther, r: forT });
// Each limb (and the torso) and the joints it carries.
const LIMBS = [
  { keys: ["lShoulder", "lElbow"], joints: ["lElbow", "lHand"] },
  { keys: ["rShoulder", "rElbow"], joints: ["rElbow", "rHand"] },
  { keys: ["lHip", "lKnee"], joints: ["lKnee", "lFoot"] },
  { keys: ["rHip", "rKnee"], joints: ["rKnee", "rFoot"] },
  { keys: ["lean", "head"], joints: ["neck", "head", "lElbow", "lHand", "rElbow", "rHand"] },
] as const;
// How far a limb's joints move from one pose to another (x height, hips held still): the length of the
// path each one sweeps (an arc, not a straight line), the longest one.
function limbTravel(a: PoseAngles, b: PoseAngles, joints: readonly string[], steps = 8) {
  const path: Record<string, number> = {};
  let previous = bodyAt(a) as Record<string, { x: number; y: number }>;
  for (let i = 1; i <= steps; i += 1) {
    const now = bodyAt(lerpPose(a, b, i / steps)) as Record<string, { x: number; y: number }>;
    for (const joint of joints) path[joint] = (path[joint] ?? 0) + Math.hypot(now[joint].x - previous[joint].x, now[joint].y - previous[joint].y);
    previous = now;
  }
  return Math.max(0, ...Object.values(path));
}
// The pose part of the way from `from` toward `to` that each limb can reach in `seconds` while the hips
// move at `hipSpeed` (x height per second), under the body speed limit `limit`: a limb with far to go
// gets only part of the way; the others still get there.
// (An arm also never spins faster than the arm-path rule allows: ARM_TURN degrees a second, upper arm
// or forearm.)
export function reachable(from: PoseAngles, to: PoseAngles, seconds: number, hipSpeed: number, limit: number): PoseAngles {
  const room = (Math.max(0.15 * limit, limit - hipSpeed) * seconds) / SWING_PEAK;
  const turnRoom = (ARM_TURN * seconds) / SWING_PEAK;
  const out = { ...to };
  for (const limb of LIMBS) {
    const step = { ...from };
    for (const key of limb.keys) step[key] = to[key];
    let k = Math.min(1, room / Math.max(1e-9, limbTravel(from, step, limb.joints)));
    if (limb.keys[0] === "lShoulder" || limb.keys[0] === "rShoulder") {
      const side = limb.keys[0][0] as Side;
      const upper = to[`${side}Shoulder`] - to.lean - (from[`${side}Shoulder`] - from.lean);
      const turn = Math.max(Math.abs(upper), Math.abs(upper + to[`${side}Elbow`] - from[`${side}Elbow`]));
      k = Math.min(k, turnRoom / Math.max(1e-9, turn));
    }
    if (k < 1) for (const key of limb.keys) out[key] = from[key] + (to[key] - from[key]) * k;
  }
  return out;
}
// Several poses over time, joined smoothly (the engine's own monotone curves).
export function poseTrack(anchors: { t: number; pose: PoseAngles }[]) {
  const list = anchors.filter((a, i) => i === 0 || a.t - anchors[i - 1].t > 1e-4);
  const times = list.map((a) => a.t), eases = list.map(() => undefined);
  const channels = POSE_KEYS.map((key) => {
    const values = list.map((a) => a.pose[key]);
    return { key, values, tangents: monotoneTangents(times, values) };
  });
  return (t: number) => {
    const out = {} as PoseAngles;
    for (const c of channels) out[c.key] = sampleChannel(times, c.values, c.tangents, eases, t);
    return out;
  };
}

function runningJump(start: Stance, params: JumpParams, speedPx: number, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const dir = forwardSign(start.facing);
  const look = JUMP_STYLES[settings.style];
  const amp = amplitudeOf(settings);
  const robot = RAMP_SCALE[settings.style] === 0;
  const tempo = tempoOf(settings);
  const g = GRAVITY / (tempo * tempo); // the standing jump's gravity at this tempo
  const limit = JOINT_SPEED / H; // body heights per second
  const v = clamp(speedPx / H, 0.15, 0.7 * limit);
  const fast = clamp((v - 0.6) / 2, 0, 1); // 0 at a walk, 1 at a full run
  const height = Math.max(0.03, (params.height ?? RUNNING_JUMP_HEIGHT) * look.height * amp);
  const size = Math.min(1.35, 0.5 + 0.5 * (height / JUMP_DEFAULTS.height));
  const armK = look.arms * (0.8 + 0.2 * amp);
  const runOn = params.runOn && params.runOn.speed > 0 ? params.runOn : undefined;

  // Where the feet are: the lowest foot is on the floor (the planner hands over the moment a foot lands).
  const s0 = bodyAt(start.pose);
  const y0 = dropOf(start.pose);
  const footOf = (s: ReturnType<typeof bodyAt>, side: Side) => s[`${side}Foot`];
  const down = (["l", "r"] as const).filter((side) => footOf(s0, side).y >= y0 - 0.012).sort((a, b) => footOf(s0, b).x - footOf(s0, a).x);
  const front: Side = s0.lFoot.x >= s0.rFoot.x ? "l" : "r";
  // LAST TWO STEPS. The foot on the floor (D) is the step before the take-off: the hips roll over it and
  // sink (the wind-up goes down before the jump goes up), the arms swing back. Then the other foot, the
  // take-off foot T, plants in front of the hips (low, knee bent) and the jump goes up off it. With no
  // foot down (a hand-over in the air) T is the front foot coming down. F = the free leg.
  const D: Side | undefined = down[0];
  const T: Side = D !== undefined ? other(D) : front;
  const F = other(T);
  const dip = robot ? 0 : look.crouch * Math.min(1.3, size) * (0.075 - 0.035 * fast);
  const aheadT = 0.15 + 0.04 * fast; // the take-off foot plants this far in front of the hips
  const reach = (dx: number) => Math.sqrt(Math.max(0, (0.985 * LEG) ** 2 - dx * dx));
  const pD = 0.16 + 0.06 * fast; // the step before leaves the floor this far behind the hips
  const footD = D !== undefined ? footOf(s0, D).x : 0;
  // NO SLOW-DOWN: D's push-off speeds the hips up a little (v -> v1), they fly the short step at v1, and
  // the take-off push speeds them up to vOut. (A robot keeps one speed.)
  const gain = robot ? 0 : PUSH_GAIN;
  const v1 = v * (1 + gain / 2), vOut = v * (1 + gain);
  const tP = D !== undefined ? Math.max(0, footD + pD) / (0.5 * (v + v1)) : 0;
  const xP = 0.5 * (v + v1) * tP;
  // T swings through and plants: it needs the time its foot takes to come forward (a fast runner's foot
  // is far behind when D lands: a longer stride in the air).
  const swingFrom = footOf(s0, T), swingTo = { x: aheadT, y: Math.min(y0, reach(aheadT)) };
  const swingTime = (1.25 * SWING_PEAK * Math.hypot(swingTo.x - swingFrom.x, swingTo.y - swingFrom.y)) / Math.max(0.3 * limit, limit - v);
  const tA = D !== undefined ? Math.max(tP + 0.07 * fast, swingTime) : clamp((aheadT - footOf(s0, T).x) / 3, 0.08, 0.22);
  const xA = xP + v1 * (tA - tP);
  const footX = xA + aheadT;
  const bT = 0.15 + 0.07 * fast; // the take-off foot leaves the ground this far behind the hips
  const xTake = footX + bT;
  const tTake = tA + (xTake - xA) / (0.5 * (v1 + vOut)); // the plant doesn't brake: it pushes
  const tLow = tA + 0.4 * (tTake - tA);
  const yRun = Math.min(y0, reach(0.1));
  const yP = Math.min(yRun, reach(pD)) - 0.5 * dip;
  const yA = Math.min(yP, Math.min(yRun, reach(aheadT)) - 0.85 * dip);
  const toe = robot ? 0 : TOE_LIFT * size;
  const yT = Math.sqrt((0.995 * LEG) ** 2 - bT * bT) + toe;

  const head = (lean: number, world: number) => clamp(world - lean, -28, 28); // eyes: where it is going
  // FLIGHT: at the top both knees are tucked up.
  const lean0 = start.pose.lean;
  const takeLean = 8 + 2 * Math.min(v, 3) + look.lean / 2;
  const tuckArms = { l: [78 * armK, 38], r: [66 * armK, 34] } as Record<Side, Limb>;
  const tuckLean = 14 + look.lean / 2;
  const tuckOf = (k: number) => bodyPose(tuckLean, head(tuckLean, 18), tuckArms,
    sides(T, [lerp(10, Math.min(84, 66 * size), k), lerp(20, 112, k)] as Limb, [lerp(14, Math.min(92, 74 * size), k), lerp(24, 104, k)] as Limb));
  // (A low jump tucks the knees only as far as it needs to: the hips can't fly lower than they took off.)
  let tuckK = 1;
  while (tuckK > 0 && height + dropOf(tuckOf(tuckK)) < yT + 0.03) tuckK = Math.max(0, tuckK - 0.05);
  const tuck = tuckOf(tuckK);
  const yTop = Math.max(yT + 0.03, height + dropOf(tuck));
  const vy0 = Math.sqrt(2 * g * (yTop - yT));
  const up = vy0 / g;
  // LANDING: both feet together just in front of the hips (a little further to brake to a stop); the
  // front one is the foot the run goes on from.
  const LF: Side = runOn ? runOn.foot : F;
  const LB = other(LF);
  const reachF = 0.16 + 0.03 * Math.min(v, 3) + (runOn ? 0 : 0.03);
  const reachB = reachF - 0.05;
  const yLand = Math.sqrt((0.975 * LEG) ** 2 - reachF ** 2);
  const fall = Math.sqrt((2 * (yTop - yLand)) / g);
  const flight = up + fall;
  const vyLand = g * fall;
  const asked = Number(params.distance);
  const vMax = Math.max(vOut, Math.min(1.5 * vOut, 0.6 * limit));
  const vFly = asked > 0 ? clamp((asked / H - bT - reachB) / flight, vOut, vMax) : vOut; // (never slower: MOMENTUM)
  const tTop = tTake + up, tLand = tTake + flight;
  const xLand = xTake + vFly * flight;
  const feet: Record<Side, number> = LF === "l" ? { l: xLand + reachF, r: xLand + reachB } : { l: xLand + reachB, r: xLand + reachF };
  const pitch = PITCH * Math.min(vFly, 3);
  const depth = (0.07 + 0.02 * Math.min(vyLand, 3)) * look.absorb * (0.7 + 0.3 * size) * (runOn ? 1 : 1.25);
  const yAbs = yLand - depth;
  const tAbsorb = clamp((2 * depth) / Math.max(vyLand, 0.3), 0.07, 0.2);

  // After the landing: run on, or stop.
  let tEnd: number, xD: (t: number) => number, yD: (t: number) => number, tLift = Infinity, endPose: PoseAngles | null = null;
  const pr = runOn?.pose;
  // The arms reach forward for the landing; running on, they are already on their way into the run's
  // swing (one back, one forward), with time enough to get there.
  const prArms = pr ? armsOf(pr) : undefined;
  const landArms = blendArms({ l: [52 * armK, 26], r: [42 * armK, 24] }, prArms ?? { l: [0, 0], r: [0, 0] }, prArms ? 0.25 : 0);
  const absorbArms = blendArms({ l: [34 * look.arms, 40], r: [24 * look.arms, 36] }, prArms ?? { l: [0, 0], r: [0, 0] }, prArms ? 0.55 : 0);
  const armsNeed = prArms ? (SWING_PEAK * armTurn(absorbArms, prArms)) / ARM_TURN : 0;
  if (runOn && pr) {
    const sr = bodyAt(pr);
    const vr = clamp(runOn.speed / H, 0.15, 0.7 * limit);
    const xHand = feet[LF] - footOf(sr, LF).x; // the run's push-off: the front foot that far behind the hips
    const yHand = footOf(sr, LF).y;
    // NO SLOW-DOWN on the landing either: the hips go on at the flying speed, easing straight into the
    // run's (the knees soak up the fall on the way, they don't stop it), so the body needs only a short
    // moment on both feet before the run's push-off.
    tEnd = tLand + Math.max(tAbsorb + Math.max(RUN_ON_AFTER, armsNeed), (xHand - xLand) / (0.5 * (vFly + vr)));
    xD = hermite(tLand, tEnd, xLand, xHand, vFly, vr);
      const yD1 = hermite(tLand, tLand + tAbsorb, yLand, yAbs, -Math.min(vyLand, (2.5 * depth) / tAbsorb), 0);
    const yD2 = hermite(tLand + tAbsorb, tEnd, yAbs, yHand, 0, 0);
    yD = (t) => (t <= tLand + tAbsorb ? yD1(t) : yD2(t));
    // The back foot leaves the floor once the hips have passed it (not before the knees have bent).
    let lo = tLand, hi = tEnd;
    for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (xD(mid) < feet[LB] + 0.04) lo = mid; else hi = mid; }
    tLift = clamp(hi, tLand + tAbsorb, tEnd - 0.08);
    endPose = pr;
  } else {
    // Brake: the hips slow to a stop just behind the middle of the feet.
    const xStop = Math.max(xLand + 0.04, (feet.l + feet.r) / 2 - 0.03);
    tEnd = tLand + Math.max(tAbsorb, (2 * (xStop - xLand)) / vFly);
    xD = hermite(tLand, tEnd, xLand, xStop, vFly, 0);
    yD = hermite(tLand, tEnd, yLand, yAbs, -Math.min(vyLand, (2.5 * depth) / (tEnd - tLand)), 0);
  }

  // The hips' path: smooth through the steps on the ground, a gravity arc in the air.
  const yLow = Math.min(yA, Math.min(yRun, reach(footX - xA - 0.4 * (xTake - xA))) - dip);
  const ground = (points: [number, number][]) => {
    const list = points.filter((p, i) => i === 0 || p[0] - points[i - 1][0] > 1e-4);
    const times = list.map((p) => p[0]), values = list.map((p) => p[1]);
    const tangents = monotoneTangents(times, values), eases = list.map(() => undefined);
    return (t: number) => sampleChannel(times, values, tangents, eases, t);
  };
  const flyY = (t: number) => { const u = t - tTake; return yT + vy0 * u - 0.5 * g * u * u; };
  const xGround = ground([[-0.04, -0.04 * v], [0, 0], [tP, xP], [tA, xA], [tTake, xTake], [tTake + 0.04, xTake + 0.04 * vFly]]);
  const yGround = ground([[0, y0], [tP, yP], [tA, yA], [tLow, yLow], [tTake, yT], [tTake + 0.03, flyY(tTake + 0.03)]]);
  const hipX = (t: number) => (t <= tTake ? xGround(t) : t <= tLand ? xTake + vFly * (t - tTake) : xD(t));
  const hipY = (t: number) => (t <= tTake ? yGround(t) : t <= tLand ? flyY(t) : yD(t));
  const speedAt = (t: number) => (hipX(t + 0.01) - hipX(t - 0.01)) / 0.02;
  const place = (pose: PoseAngles, t: number, side: Side, fx: number, fy = 0) => footAt(pose, side, fx - hipX(t), hipY(t) - fy);

  // KEY POSES (limbs only as far as they can get in the time; planted legs are placed on their feet).
  const anchors: { t: number; pose: PoseAngles }[] = [{ t: 0, pose: start.pose }];
  const next = (t: number, target: PoseAngles) => {
    const last = anchors[anchors.length - 1];
    const pose = reachable(last.pose, target, t - last.t, Math.max(speedAt(t), speedAt(last.t)), limit);
    anchors.push({ t, pose });
    return pose;
  };
  const lowLean = Math.max(lean0, 14) + 3 + look.lean / 2;
  const backArms = sides(T, [-54 * armK, 24] as Limb, [-44 * armK, 30] as Limb);
  const upArms = sides(T, [100 * armK, 48] as Limb, [84 * armK, 42] as Limb);
  const startArms = armsOf(start.pose);
  if (D !== undefined && tP > 0.03) {
    // The step before: D still down, T coming through under the body, the arms on their way back.
    next(tP, bodyPose(lowLean, head(lowLean, 12), blendArms(startArms, backArms, 0.6), legsOf(start.pose)));
    // (T's foot on its way from behind to its spot, a little off the floor, the knee leading.)
    const k = tP / tA, from = footOf(s0, T);
    const tFoot = { x: lerp(from.x, footX, k) - xP, y: hipY(tP) - lerp(Math.max(0.03, hipY(0) - from.y), 0.03, k) };
    anchors[anchors.length - 1].pose = place(footAt(anchors[anchors.length - 1].pose, T, tFoot.x, tFoot.y), tP, D, footD);
  }
  // The take-off foot plants, low; both arms back (the wind-up).
  next(tA, bodyPose(lowLean + 2, head(lowLean + 2, 12), backArms, sides(T, [20, 20] as Limb, [-22, 40] as Limb)));
  anchors[anchors.length - 1].pose = place(anchors[anchors.length - 1].pose, tA, T, footX);
  // The free leg folds under the body as the hips pass over the foot.
  next(tLow, bodyPose(lerp(lowLean + 2, takeLean, 0.4), head(lowLean, 8), backArms, sides(T, [10, 10] as Limb, [4, 105] as Limb)));
  // TAKE-OFF: the leg straightens behind, the free knee drives up, both arms swing forward and up.
  const take = next(tTake, bodyPose(takeLean, head(takeLean, -4), upArms, sides(T, [-20, 6] as Limb, [70 * Math.min(1.1, size), 96] as Limb)));
  anchors[anchors.length - 1].pose = footAt(take, T, -bT, yT - toe);
  next(tTop, tuck);
  const landLean = 12 + 1.5 * Math.min(vFly, 3) + look.lean / 2;
  const land = footAt(footAt(bodyPose(landLean, head(landLean, 16), landArms, legsOf(tuck)), LF, reachF, yLand), LB, reachB, yLand);
  next(tLand, land);
  anchors[anchors.length - 1].pose = footAt(footAt(anchors[anchors.length - 1].pose, LF, reachF, yLand), LB, reachB, yLand);
  const absorbLean = Math.min(52, 30 + look.lean + pitch);
  const tAbs = tLand + Math.min(tAbsorb, tEnd - tLand);
  next(tAbs, bodyPose(absorbLean, head(absorbLean, 24), absorbArms, legsOf(land)));
  anchors[anchors.length - 1].pose = place(place(anchors[anchors.length - 1].pose, tAbs, LF, feet[LF]), tAbs, LB, feet[LB]);
  if (endPose) {
    // Running on: the back foot leaves the floor (still under the bent knees), folds and swings through
    // while the arms and body go into the run.
    const bottom = anchors[anchors.length - 1].pose;
    const swing = bodyPose(lerp(absorbLean, endPose.lean, 0.6), head(lerp(absorbLean, endPose.lean, 0.6), 14), armsOf(lerpPose(bottom, endPose, 0.6)),
      sides(LB, [8, 100] as Limb, legsOf(endPose)[LF]));
    const tSwing = Math.max(tLift + 0.02, tLift + 0.45 * (tEnd - tLift));
    if (tLift > tAbs + 0.01) anchors.push({ t: tLift, pose: place(place(lerpPose(bottom, swing, (tLift - tAbs) / (tSwing - tAbs)), tLift, LF, feet[LF]), tLift, LB, feet[LB]) });
    if (tSwing < tEnd - 0.03) next(tSwing, swing);
    anchors.push({ t: tEnd, pose: endPose });
  }
  const track = poseTrack(anchors);

  // The keys: every KEY_GAP seconds and at every key pose.
  const marksAt = [0, tP, tA, tLow, tTake, tTop, tLand, tAbs, tLift, tEnd].filter((t) => Number.isFinite(t) && t <= tEnd + 1e-9);
  const grid = Array.from({ length: Math.floor(tEnd / KEY_GAP) }, (_, i) => (i + 1) * KEY_GAP).filter((t) => marksAt.every((m) => Math.abs(t - m) > 4e-3));
  const times = [...new Set([...marksAt, ...grid])].filter((t) => t <= tEnd + 1e-9).sort((a, b) => a - b);
  // When the take-off leg is straight (late in the push) the foot starts to peel off the floor.
  const toeOff = (t: number) => hipY(t) - Math.sqrt(Math.max(0, (0.998 * LEG) ** 2 - (footX - hipX(t)) ** 2));
  let tToe = tTake;
  for (let t = tLow; t < tTake; t += 0.002) if (toeOff(t) > 0) { tToe = t; break; }
  const ease = robot ? "linear" as const : undefined;
  const contacts0 = down.map((side) => `${side}Foot` as FootContact);
  const keys: CharacterKey[] = times.map((t, i) => {
    let pose = track(t);
    let contacts: Side[];
    if (i === 0) return { t: start.t, x: start.x, pose: start.pose, contacts: contacts0, facing: start.facing, lift: 0, ease, xEase: ease, liftEase: ease };
    if (t < tP - 1e-9) contacts = D !== undefined ? [D] : [];
    else if (t < tA - 1e-9) contacts = [];
    else if (t < tTake - 1e-9) contacts = [T];
    else if (t < tLand - 1e-9) contacts = [];
    else if (t < tLift - 1e-9) contacts = [LF, LB];
    else contacts = [LF];
    // (Pushing off: once the leg is straight the foot is already peeling off the floor.)
    if (t >= tToe - 1e-9 && t < tTake - 1e-9) { contacts = []; pose = place(pose, t, T, footX, Math.max(0, toeOff(t))); }
    for (const side of contacts) pose = t < tP ? place(pose, t, side, footD) : side === T && t < tTake ? place(pose, t, T, footX) : place(pose, t, side, feet[side]);
    if (Math.abs(t - tTake) < 1e-9) pose = place(pose, t, T, footX, toe);
    if (endPose && Math.abs(t - tEnd) < 1e-9) pose = endPose;
    pose = safePose(pose);
    const lift = contacts.length ? 0 : Math.max(0, hipY(t) - dropOf(pose));
    return { t: start.t + t, x: start.x + dir * hipX(t) * H, pose, contacts: contacts.map((side) => `${side}Foot` as FootContact), facing: start.facing, lift: lift * H, ease, xEase: ease, liftEase: ease };
  });
  // (Running on: "runOn" = the moment the run takes over.)
  const marks: Record<string, number> = { takeoff: start.t + tTake, top: start.t + tTop, land: start.t + tLand, ...(endPose ? { runOn: start.t + tEnd } : {}) };
  const last = keys[keys.length - 1];
  const here: Stance = { t: last.t, x: last.x, facing: start.facing, pose: last.pose };
  if (endPose) return { keys, end: here, marks };

  // Stopping: rise out of the landing over the feet and ease into the normal stand (left out when a move
  // follows straight away: the flow point is the bottom of the landing).
  const feetMid = ((feet.l + feet.r) / 2 - hipX(tEnd)) * H; // px forward of the hips now
  const settle: PlacedBeat[] = [];
  if (look.bounce) settle.push(...bounceBeats(feetMid, last.pose, tuck, land, toe * H, amp, settings));
  settle.push(
    { kind: "settle", seconds: 0.3, pose: RECOVER, at: hipsOver(feetMid, RECOVER, H), recover: true },
    { kind: "settle", seconds: 0.32, pose: STAND, at: hipsOver(feetMid, STAND, H), recover: true },
  );
  const rest = beatsToKeys(here, placeBeats(settle, settings), settings);
  // (The landing's last key keeps its own easing into the rise.)
  rest.keys[0] = { ...last, ease: rest.keys[0].ease, xEase: rest.keys[0].xEase, liftEase: rest.keys[0].liftEase };
  const all = [...keys.slice(0, -1), ...rest.keys];
  const flowAt = rest.flow ? keys.length - 1 + rest.flow.keys : undefined;
  return { keys: all, end: rest.end, marks, flow: flowAt !== undefined ? { keys: flowAt, stance: { ...rest.flow!.stance } } : { keys: keys.length, stance: here } };
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const blendArms = (a: Record<Side, Limb>, b: Record<Side, Limb>, k: number): Record<Side, Limb> => ({ l: [lerp(a.l[0], b.l[0], k), lerp(a.l[1], b.l[1], k)], r: [lerp(a.r[0], b.r[0], k), lerp(a.r[1], b.r[1], k)] });
// How far the arms turn from one set to another (degrees, upper arm or forearm, the most).
const armTurn = (a: Record<Side, Limb>, b: Record<Side, Limb>) => Math.max(...(["l", "r"] as const).map((side) => Math.max(Math.abs(b[side][0] - a[side][0]), Math.abs(b[side][0] + b[side][1] - a[side][0] - a[side][1]))));

// Happy: springs straight back up into a little hop before settling.
function bounceBeats(feet1: number, absorb: PoseAngles, tuck: PoseAngles, reachBase: PoseAngles, toe: number, amp: number, settings: MoveSettings): PlacedBeat[] {
  const H = settings.height;
  const pop = levelFeet(scaled(withPose(PUSH, { lean: 2, lShoulder: 96, rShoulder: 88 }), 1, 1));
  const hop = 0.06 * amp;
  const hopBeat = Math.sqrt((2 * hop) / GRAVITY) * (tempoOf(settings) / beatSeconds("hold", 1, settings));
  const soft = levelFeet(lerpPose(STAND, absorb, 0.5));
  const hopLand = levelFeet(reachBase); // straight down this time
  return [
    { kind: "action", seconds: 0.16 * Math.max(1, MIN_PUSH / beatSeconds("action", 0.16, settings)), pose: pop, at: hipsOver(feet1, pop, H), lift: toe / 2, contacts: [] },
    { kind: "hold", seconds: hopBeat, pose: lerpPose(pop, tuck, 0.3), at: hipsOver(feet1, pop, H), lift: hop * H, contacts: [], ease: "smooth", liftEase: "out" },
    { kind: "hold", seconds: hopBeat, pose: hopLand, at: hipsOver(feet1, hopLand, H), lift: toe / 2, contacts: [], ease: "smooth", liftEase: "in" },
    { kind: "follow", seconds: 0.16, pose: soft, at: hipsOver(feet1, soft, H) },
  ];
}
