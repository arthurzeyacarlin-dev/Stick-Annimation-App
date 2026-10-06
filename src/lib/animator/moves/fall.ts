import type { FootContact } from "../engine.ts";
import { GRAVITY } from "../objectMoves.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, PROPORTIONS, STAND, withPose, type PoseAngles } from "../rig.ts";
import { amplitudeOf, beatSeconds, beatsToKeys, lerpPose, windUp, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { chainMoves } from "./sit.ts";
import { footAt, handAt, levelFeet, onFeet, placeBeats, safePose, type PlacedBeat } from "./squat.ts";
import { RAMP_SCALE } from "./styles.ts";
import { landOnBack } from "./liftSlam.ts";

// SPEC-0017 Phase 2: falling down and getting back up (Arthur's round-4 review: "you gotta understand
// where the weight is going").
//
// A fall is worked out from a few physical RULES, not drawn by hand, so the engine can make falls it was
// never shown (any speed, any start pose, either way):
// - MOMENTUM: a moving body (the planner passes `speed`, the forward hip speed when the fall starts) keeps
//   going. There is no stop and no wobble: the trip happens mid-stride.
// - THE TRIP: the foot that is on the floor gets caught and stays put. The body pivots over it like an
//   upside-down pendulum (its forward speed swings it over, gravity pulls it on) while the chest pitches
//   forward faster than the legs and the arms fling forward. Once the hips are RELEASE degrees past the
//   foot, the foot is pulled off the floor.
// - GRAVITY: from there the body flies freely (GRAVITY, scaled with the figure's height) until the hands
//   hit the floor; the arms give way and the chest and face hit (the face plant).
// - FRICTION: hitting the floor costs FRICTION x the downward speed in forward speed; whatever speed is
//   left slides the body along the floor, slowing at FRICTION x gravity, until it stops.
// - Standing still there is no momentum, so a short loss of balance comes first (a sway the other way,
//   the engine's anticipation rule, then over the toes), which pitches the body over at a stumbling
//   speed. A robot has no anticipation: it just tips.
// - Falling back (a slip): the feet shoot forward, nothing holds the body up, so it falls freely onto its
//   bottom and the back slams down straight after (never resting sitting up); a moving body slides on its
//   back in the direction it was going.
// Getting up hurts: slowly (the hurt timing, whatever the style, except a robot): pushing up, onto the
// hands and knees, one foot forward with a hand on that knee, and up. From the back: sit up (only passing
// through sitting) and roll forward onto a knee, then the same. "up" (nearly standing) is the flow point.

export type FallDirection = "forward" | "back";
// speed: forward hip speed (px/s) when the fall starts (0 or missing = standing still).
export type FallParams = { direction?: FallDirection; speed?: number };
export type FallAndGetUpParams = FallParams & { seconds?: number; low?: boolean };
export const FALL_DEFAULTS = { direction: "forward" as FallDirection, seconds: 1 };

// ---- Physical rules (lengths in body heights, times in seconds) ----

export const FALL_GRAVITY = GRAVITY / 300; // gravity in body heights per s² (GRAVITY is for a 300 px figure)
const G = FALL_GRAVITY;
export const FRICTION = 0.5; // a body sliding on the floor: friction force = this x its weight
const STUMBLE = 0.5; // body heights per s: how fast losing balance standing still pitches the body over
const RELEASE = 35; // degrees: a caught foot is pulled off the floor once the hips are this far past it
const PITCH = 22; // degrees: how far the chest pitches ahead of the legs when the foot is caught
const HAND_CLEAR = 0.012; // a hand on the floor stays this far above it (x height), never through it
const CARRY_ON = 0.5; // the first hit (the hands, or the bottom) stops only half the body's downward speed: the
// chest or the back carries on with the rest and slams into the floor
const ARM_SPEED = 500; // degrees per second: the fastest the arms swing (a quick trip leaves them half way)
const TORSO_SPEED = 400; // degrees per second: the fastest the chest pitches over
const LEG_SPEED = 450; // degrees per second: the fastest a free leg swings

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// THE TRIP, step by step (lengths in body heights; the hips measured from the caught foot: forward, up).
// The foot on the floor is caught and stays put. The leg between it and the hips holds the body up: it
// doesn't get shorter than it started, so a slow body swings over the foot like an upside-down pendulum
// (only the speed across the leg survives the leg taking the weight; gravity pulls it on over). A fast
// body (a run) is going too fast for the leg to hold it on that circle: it flies on, falling under
// gravity, the knee straightening behind it. The foot is pulled off the floor once the hips are RELEASE
// degrees past it or the leg can't reach it any more; then the body falls freely until the hips are down
// to `landing` (the hands hit the floor). Returns when the foot lets go (`trip`), the hips' path (`at`)
// and their speeds at the hit.
export function tripAndFall(foot: { x: number; y: number }, speed: number, landing: number) {
  let x = -foot.x, h = foot.y, vx = Math.max(speed, 0.05), vh = 0, t = 0;
  const dt = 1 / 4000;
  const path: { t: number; x: number; h: number }[] = [{ t, x, h }];
  // ROLLING OVER IT FIRST: a foot planted out in front of the hips (a heel strike at a run) isn't caught
  // yet: the leg carries the hips over it the way every stride does (keeping their speed and height, the
  // knee giving a little), and it is caught when the hips are over it. (A stiff leg out in front would
  // stop a running body dead, like a pole.)
  if (x < 0) {
    const over = -x / vx;
    for (let s = dt; s < over; s += dt) path.push({ t: s, x: x + vx * s, h });
    t = over; x = 0;
  }
  const start = Math.hypot(x, h);
  const longest = Math.max(start, 0.998 * (PROPORTIONS.thigh + PROPORTIONS.shin));
  // A leg that is already straight can't let the hips move away from the foot: only the speed across it counts.
  if (start >= 0.998 * (PROPORTIONS.thigh + PROPORTIONS.shin)) {
    const ux = x / start, uh = h / start, out = vx * ux;
    if (out > 0) { vx -= out * ux; vh -= out * uh; }
  }
  let caught = true;
  let trip = { t, x, h };
  while (h > landing && t < 3) {
    vh -= G * dt; x += vx * dt; h += vh * dt; t += dt;
    if (caught) {
      const d = Math.hypot(x, h);
      if (d < start) {
        // The leg takes the weight: back onto its length, and no more speed into it.
        const ux = x / d, uh = h / d;
        x = ux * start; h = uh * start;
        const into = vx * ux + vh * uh;
        vx -= into * ux; vh -= into * uh;
      }
      if (Math.atan2(x, h) >= rad(RELEASE) || Math.hypot(x, h) > longest + 1e-6) { caught = false; trip = { t, x, h }; }
    }
    path.push({ t, x, h });
  }
  if (caught) trip = { t, x, h };
  const at = (time: number) => path[Math.min(path.length - 1, Math.max(0, Math.round(time / dt)))];
  return { trip, impact: { t, x, h, vx, vh: -vh }, at };
}

// Seconds to fall from height `from` to `to` starting with downward speed `down` (gravity).
export const dropSeconds = (from: number, to: number, down: number) => {
  const d = Math.max(0, from - to);
  return (-down + Math.sqrt(down * down + 2 * G * d)) / G;
};

// Hitting the floor with forward speed `forward` and downward speed `down`: the hit itself costs FRICTION x
// the downward speed; the rest slides along the floor, slowing down at FRICTION x gravity until it stops.
export function slideAfter(forward: number, down: number) {
  const speed = Math.max(0, forward - FRICTION * Math.max(0, down));
  const a = FRICTION * G;
  const seconds = speed / a, distance = (speed * speed) / (2 * a);
  return { speed, seconds, distance, at: (t: number) => (t >= seconds ? distance : speed * t - 0.5 * a * t * t) };
}

// ---- Body geometry (x height, hips at 0, y down, facing right) ----

const bodyOf = (pose: PoseAngles) => forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
// How high the hips are when the body rests on its lowest point (the engine's rule: feet, knees, hips,
// neck and the bottom of the head count; hands don't).
export function hipHeight(pose: PoseAngles) {
  const s = bodyOf(pose);
  return Math.max(0, s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.neck.y, s.head.y + HEAD_RADIUS.normal);
}
// The same leaving the head out: whatever the head's size (or a neck), the floor is never higher than
// this, so hands and elbows put on the floor from here never go through it.
function floorBelow(pose: PoseAngles) {
  const s = bodyOf(pose);
  return Math.max(0, s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.neck.y);
}

// The same pose with a hand on the floor `ahead` (x height) in front of the hips, the hips `height` above
// the floor (default: resting on the body's lowest point).
function handOnFloor(pose: PoseAngles, side: "l" | "r", ahead: number, height = floorBelow(pose), clear = HAND_CLEAR): PoseAngles {
  const s = bodyOf(pose);
  return handAt(pose, side, ahead - s.neck.x, height - clear - s.neck.y);
}

// An arm lying along the floor (lying down): the elbow on the floor, the upper arm pointing forward (+1)
// or back (-1) from the shoulder, the forearm flat (raise > 0 lifts the hand a little).
function armOnFloor(pose: PoseAngles, side: "l" | "r", way: 1 | -1, raise = 0, clear = HAND_CLEAR): PoseAngles {
  const s = bodyOf(pose);
  const room = floorBelow(pose) - clear - s.neck.y; // how far below the shoulder the floor is
  const upperAbs = way * deg(Math.acos(clamp(room / PROPORTIONS.upperArm, -1, 1))); // from straight down
  const foreAbs = way * (90 + raise);
  return { ...pose, [`${side}Shoulder`]: upperAbs + pose.lean, [`${side}Elbow`]: foreAbs - upperAbs } as PoseAngles;
}

// Legs given as absolute directions (degrees from straight down, forward +) and knee bends.
const legs = (pose: PoseAngles, l: [number, number], r: [number, number]): PoseAngles =>
  ({ ...pose, lHip: l[0] + pose.lean, lKnee: l[1], rHip: r[0] + pose.lean, rKnee: r[1] });
// Arms given as absolute directions of the upper arms and elbow bends.
const arms = (pose: PoseAngles, l: [number, number], r: [number, number]): PoseAngles =>
  ({ ...pose, lShoulder: l[0] + pose.lean, lElbow: l[1], rShoulder: r[0] + pose.lean, rElbow: r[1] });

// LYING FLAT: the torso tilted (face down: way +1, on the back: -1) just short of flat, so that with the
// hips on the floor the head (turned `head` degrees from the torso) rests on the floor too.
function lyingLean(way: 1 | -1, head: number) {
  let lo = 40, hi = 90;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    const s = bodyOf(withPose(STAND, { lean: way * mid, head }));
    if (s.head.y + HEAD_RADIUS.normal > 0) hi = mid; else lo = mid;
  }
  return way * lo;
}

// Lying on the belly: legs straight back along the floor (knees a little bent, so the feet are just up),
// the head turned `head` from the torso, both arms stretched forward along the floor (the far hand a
// little up).
function proneWith(head: number, knees: [number, number] = [8, 18]): PoseAngles {
  const lean = lyingLean(1, head);
  const body = legs(withPose(STAND, { lean, head }), [-90, knees[0]], [-90, knees[1]]);
  // (A little more room under the arms: going from one lying pose to another they never dip through the floor.)
  return safePose(armOnFloor(armOnFloor(body, "l", 1, 0, 2.5 * HAND_CLEAR), "r", 1, 16, 2.5 * HAND_CLEAR));
}
export const FALLEN_FORWARD: PoseAngles = proneWith(-24, [2, 6]);

// Lying on the back: the near leg straight along the floor (resting on its heel, so the hips are just off
// the floor), the far knee up (foot flat on the floor), the chin `head` toward the chest, both arms lying
// along the body (the far one bent a little).
function supineWith(head: number, farFoot = 0.36): PoseAngles {
  const lean = lyingLean(-1, head);
  const body = legs(withPose(STAND, { lean, head }), [89, 0], [89, 0]);
  const kneeUp = footAt(body, "r", farFoot, floorBelow(body));
  return safePose(armOnFloor(armOnFloor(kneeUp, "l", 1, 6), "r", 1, 24));
}
export const FALLEN_BACK: PoseAngles = supineWith(22);

// The foot that is on the floor in a pose (the lower one; standing on both, the front one), and which
// feet are on the floor.
function feetDown(pose: PoseAngles) {
  const s = bodyOf(pose);
  const floor = hipHeight(pose);
  const down = { l: s.lFoot.y > floor - 0.01, r: s.rFoot.y > floor - 0.01 };
  const caught: "l" | "r" = Math.abs(s.lFoot.y - s.rFoot.y) < 0.01 ? (s.lFoot.x >= s.rFoot.x ? "l" : "r") : s.lFoot.y > s.rFoot.y ? "l" : "r";
  return { down, caught, foot: caught === "l" ? s.lFoot : s.rFoot };
}

// Beats whose length is set by physics (gravity, friction) take exactly that long, whatever the style or
// speed setting: base seconds that the style's timing turns back into `seconds`.
function physical(kind: Beat["kind"], seconds: number, settings: MoveSettings) {
  const unit = beatSeconds(kind, 1, settings);
  return unit > 1e-6 ? seconds / unit : 0;
}

// Wobble share: standing still, the body first loses its balance; the faster it is already going, the
// less of that there is (none from a stumbling speed up).
const wobbleShare = (speed: number) => clamp(1 - speed / STUMBLE, 0, 1);

// ---- Falling ----

// Fall down (forward onto the face and belly, or back onto the back). Ends lying (FALLEN_FORWARD or
// FALLEN_BACK), not standing: follow it with getUp. Marks: "impact" (first hit on the floor), "down"
// (lying still). `speed` = forward hip speed (px/s) at the start. With no direction it falls the way it is
// going (forward).
export function fall(start: Stance, params: FallParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const speed = Math.max(0, Number(params.speed ?? 0)) / H; // body heights per second
  const direction = params.direction ?? FALL_DEFAULTS.direction;
  const back = direction === "back" ? fallBack(start.pose, speed, settings) : undefined;
  const beats = back ? back.beats : fallForward(start.pose, speed, settings);
  const out = beatsToKeys(start, placeBeats(beats.map((b) => ({ ...b, at: b.at * H, lift: (b.lift ?? 0) * H })), settings), settings);
  // It starts on the feet that are really on the floor (a run hands over mid-stride, one foot up).
  const { down } = feetDown(start.pose);
  const contacts: FootContact[] = [...(down.l ? ["lFoot" as const] : []), ...(down.r ? ["rFoot" as const] : [])];
  out.keys[0] = { ...out.keys[0], contacts };
  if (!back) return out;
  // LANDINGS DEPEND ON THE FALL: the back has hit — the shared landing, scaled by how fast it hit.
  // (It slides on along the floor through the landing, as far as friction lets it — the landing's own skid is off.)
  const land = landOnBack(out.end, FALLEN_BACK, 1, settings, { speed: back.landing.speed, skid: 0, front: FALLEN_FORWARD, seconds: back.landing.seconds[0] + back.landing.seconds[1] });
  const sign = start.facing === "left" ? -1 : 1, t0 = out.end.t;
  const slideX = (t: number) => sign * back.landing.slid(t - t0) * H;
  const last = out.keys.length - 1;
  out.keys[last] = { ...out.keys[last], ease: land.keys[0].ease, xEase: land.keys[0].xEase, liftEase: land.keys[0].liftEase };
  const keys = [...out.keys, ...land.keys.slice(1).map((k) => ({ ...k, x: k.x + slideX(k.t) }))];
  // (Lying still until the old settle would have ended: a fight's timing stays the same.)
  const until = out.end.t + back.landing.seconds[0] + back.landing.seconds[1];
  if (land.end.t < until - 1e-6) keys.push({ ...keys[keys.length - 1], t: until, x: land.end.x + slideX(until), ease: undefined, xEase: undefined, liftEase: undefined });
  else if (land.end.t < until + 1e-6) keys[keys.length - 1] = { ...keys[keys.length - 1], t: until };
  const endT = land.end.t < until + 1e-6 ? until : land.end.t;
  const end = { ...land.end, t: endT, x: land.end.x + slideX(endT) };
  return { keys, end, marks: { ...out.marks, down: endT } };
}

function fallForward(from: PoseAngles, speed: number, settings: MoveSettings): PlacedBeat[] {
  const beats: PlacedBeat[] = [];
  const wobble = wobbleShare(speed);
  let pose0 = from, x0 = 0;
  // ---- Standing still: a short loss of balance first (the opposite way, then over the toes) ----
  if (wobble > 0.02) {
    const { caught, foot } = feetDown(from);
    const stay = (pose: PoseAngles) => foot.x - bodyOf(pose)[`${caught}Foot`].x; // the feet don't move
    // Tipping over the toes: the whole body leans a few degrees forward over its feet, the arms coming up.
    // A body already moving a little loses its balance only a little: the sway and tip are as much
    // smaller as they are shorter (scaled by `wobble`), so the arms never move faster than at a stand.
    const fullTip = withPose(from, { lean: from.lean + 10, head: from.head - 8, lHip: from.lHip + 4, rHip: from.rHip + 4, lShoulder: from.lShoulder + 40, rShoulder: from.rShoulder + 25, lElbow: from.lElbow + 20, rElbow: from.rElbow + 20 });
    const tip = levelFeet(lerpPose(from, fullTip, wobble));
    // Before it (the opposite way): a sway back, the arms swinging back.
    const sway = windUp(from, tip, 0.4 * amplitudeOf(settings), { lean: 0.5 * wobble, only: ["lShoulder", "rShoulder", "lElbow", "rElbow"] });
    beats.push({ kind: "anticipation", seconds: 0.16 * wobble, pose: sway, at: stay(sway) });
    beats.push({ kind: "action", seconds: 0.14 * wobble, pose: tip, at: stay(tip), ease: "smooth" });
    pose0 = tip;
    x0 = stay(tip);
  }
  // ---- The trip: the foot on the floor is caught (see tripAndFall) ----
  const { caught, foot } = feetDown(pose0);
  const free = caught === "l" ? "r" : "l";
  const footX = x0 + foot.x; // where the caught foot is (from the start hips)
  // Hands first: the body nearly flat, arms reaching down and forward for the floor, legs trailing.
  const reaching = legs(withPose(STAND, { lean: 76, head: -12 }), caught === "l" ? [-72, 14] : [-48, 46], caught === "l" ? [-48, 46] : [-72, 14]);
  // The fall, if the hips are `landing` high when the body hits the floor.
  const plan = (landing: number) => {
    const path = tripAndFall(foot, Math.max(speed, STUMBLE), landing);
    const tT = path.trip.t;
    // When the foot lets go: the caught leg stretched back to it, the chest pitched forward ahead of the
    // legs (as fast as a body can pitch), the arms flung forward (as far as they can swing by then), the
    // free leg swinging through under the body to try to step.
    const legTurn = deg(Math.atan2(path.trip.x, path.trip.h) - Math.atan2(-foot.x, foot.y));
    const leanT = Math.min(62, pose0.lean + Math.min(legTurn + PITCH, TORSO_SPEED * tT));
    const flung = arms(withPose(pose0, { lean: leanT, head: -22 }), caught === "l" ? [105, 28] : [70, 34], caught === "l" ? [70, 34] : [105, 28]);
    const swingThrough = legsToward(pose0, footAt(armsToward(pose0, flung, tT), free, 0.12, Math.min(0.33, path.trip.h - 0.05)), tT, [free]);
    const trip = safePose(footAt(swingThrough, caught, -path.trip.x, path.trip.h));
    // The arms reach for the floor as fast as arms can swing; the body comes down onto the hands wherever
    // they have got to (or onto the knees, if the hands aren't down yet).
    const flight = path.impact.t - tT;
    const impact = safePose(armsToward(trip, handOnFloor(handOnFloor(reaching, "l", 0.5, landing), "r", 0.53, landing), flight));
    const s = bodyOf(impact);
    const hits = Math.max(hipHeight(impact), Math.max(s.lHand.y, s.rHand.y, s.lElbow.y, s.rElbow.y) + 2.5 * HAND_CLEAR);
    return { path, tT, trip, flight, impact, hits };
  };
  // Where the hips are when the body hits: try a height, see where the hands got to by then, and again.
  let hI = 0.18, fallen = plan(hI);
  for (let i = 0; i < 8 && Math.abs(fallen.hits - hI) > 1e-4; i += 1) { hI = fallen.hits; fallen = plan(hI); }
  const { path, tT, trip, flight, impact } = fallen;
  // (A foot that can't be held at all, e.g. a straight leg at a run, lets go at once: no beat for that.)
  // ARMS GO THE WAY THEY ARE FLUNG: an arm that turns more than about half a turn against the body
  // between two keys would be drawn turning the short way round instead (backwards, over the head: a
  // windmill). A trip from a walk can ask that much (the arm swung back, the body pitching forward while
  // the arm is flung forward), so the trip then gets a key half way, on the same physical path.
  const turns = Math.max(Math.abs(trip.lShoulder - pose0.lShoulder), Math.abs(trip.rShoulder - pose0.rShoulder));
  const tripKeys = tT > 0.03 ? (turns > 150 ? [0.5, 1] : [1]) : [];
  let tDone = 0;
  for (const f of tripKeys) {
    const p = f === 1 ? path.trip : path.at(f * tT);
    const pose = f === 1 ? trip : safePose(footAt(lerpPose(pose0, trip, f), caught, -p.x, p.h));
    beats.push({ kind: "action", seconds: physical("action", f * tT - tDone, settings), pose, at: footX + p.x, lift: Math.max(0, p.h - hipHeight(pose)), contacts: [`${caught}Foot`], ease: "smooth" });
    tDone = f * tT;
  }
  // ---- Flying: the foot is pulled off the floor; gravity brings the body down ----
  // Two in-between keys pin the hips to the gravity arc (the arms reach for the floor, never through it).
  let before = trip;
  for (const f of [1 / 3, 2 / 3]) {
    const p = path.at(tT + f * flight);
    // The arms swing on from where they really are (never faster than ARM_SPEED), as far as the floor allows.
    const body = lerpPose(trip, impact, f);
    const want = lerpPose(trip, impact, Math.min(1, 1.6 * f)); // where the arms are heading (stage directions)
    const aim = { ...body, lShoulder: want.lShoulder - want.lean + body.lean, rShoulder: want.rShoulder - want.lean + body.lean, lElbow: want.lElbow, rElbow: want.rElbow };
    const reach = armsToward(before, aim, flight / 3);
    const pose = armsAbove(armsToward(before, body, 0), reach, p.h);
    beats.push({ kind: "action", seconds: physical("action", flight / 3, settings), pose, at: footX + p.x, lift: Math.max(0, p.h - hipHeight(pose)), contacts: [], ease: "smooth", xEase: "linear" });
    before = pose;
  }
  const xI = footX + path.impact.x;
  beats.push({ kind: "action", seconds: physical("action", flight / 3, settings), pose: impact, at: xI, lift: Math.max(0, hI - hipHeight(impact)), contacts: [], ease: "in", xEase: "linear", liftEase: "in", name: "impact" });
  // ---- The arms give, the chest and face hit; the body slides on and stops ----
  // The hands' hit costs some forward speed (friction); the arms only stop half of the fall (CARRY_ON), so
  // the chest slams into the floor (costing more forward speed); then it slides to a stop.
  const onHands = slideAfter(path.impact.vx, path.impact.vh);
  const chest = dropSeconds(hI, 0, CARRY_ON * path.impact.vh);
  const onChest = slideAfter(Math.max(0, onHands.speed - FRICTION * G * chest), CARRY_ON * path.impact.vh + G * chest);
  const xStop = xI + onHands.at(chest) + onChest.distance;
  const plant = proneWith(10, [4, 10]); // face in the floor, arms stretched forward along it
  // On the way down, the hands are kept on the floor (they slide, they never go through it).
  const handsAt = (pose: PoseAngles) => { const s = bodyOf(pose); return { l: s.lHand.x, r: s.rHand.x }; };
  const hi = handsAt(impact), hp = handsAt(plant);
  let tPrev = 0;
  for (const f of [1 / 3, 2 / 3]) {
    const tM = f * chest, hM = Math.max(0, hI - CARRY_ON * path.impact.vh * tM - 0.5 * G * tM * tM);
    const between = lerpPose(impact, plant, f);
    // (The hands a little higher if an elbow would be nearly on the floor: the arm sweeping on from here
    // must not dip it through.)
    const handsDown = (clear: number) => safePose(handOnFloor(handOnFloor(between, "l", hi.l + (hp.l - hi.l) * f, hM, clear), "r", hi.r + (hp.r - hi.r) * f, hM, clear));
    let down = handsDown(2 * HAND_CLEAR);
    for (let clear = 3 * HAND_CLEAR; clear <= 8 * HAND_CLEAR && hM - Math.max(bodyOf(down).lElbow.y, bodyOf(down).rElbow.y) < 2.5 * HAND_CLEAR; clear += HAND_CLEAR) down = handsDown(clear);
    beats.push({ kind: "action", seconds: physical("action", tM - tPrev, settings), pose: down, at: xI + onHands.at(tM), lift: Math.max(0, hM - hipHeight(down)), contacts: [], ease: "in", xEase: "smooth", liftEase: "in" });
    tPrev = tM;
  }
  beats.push({ kind: "action", seconds: physical("action", chest - tPrev, settings), pose: plant, at: xI + onHands.at(chest), contacts: [], ease: "in", xEase: "smooth", liftEase: "in" });
  // The lower legs swing up from the hit (follow-through) while it slides on.
  const legsUp = withPose(plant, { lKnee: 36, rKnee: 52 });
  if (onChest.seconds > 0.05) {
    beats.push({ kind: "settle", seconds: physical("settle", onChest.seconds, settings), pose: legsUp, at: xStop, contacts: [] });
  } else {
    beats.push({ kind: "follow", seconds: 0.12, pose: legsUp, at: xStop, contacts: [] });
  }
  // Lying there: the legs come down, the head turns up a little.
  beats.push({ kind: "settle", seconds: 0.32, pose: FALLEN_FORWARD, at: xStop, contacts: [], name: "down" });
  return beats;
}

// `to` with its arms (their directions on the stage, and the elbows) only as far from `from`'s as they can
// swing in `seconds` (ARM_SPEED).
function armsToward(from: PoseAngles, to: PoseAngles, seconds: number): PoseAngles {
  const a = { l: from.lShoulder - from.lean, r: from.rShoulder - from.lean }, b = { l: to.lShoulder - to.lean, r: to.rShoulder - to.lean };
  const most = Math.max(Math.abs(b.l - a.l), Math.abs(b.r - a.r), Math.abs(to.lElbow - from.lElbow), Math.abs(to.rElbow - from.rElbow));
  const k = most > 1e-9 ? Math.min(1, (ARM_SPEED * seconds) / most) : 1;
  return {
    ...to,
    lShoulder: to.lean + a.l + (b.l - a.l) * k, rShoulder: to.lean + a.r + (b.r - a.r) * k,
    lElbow: from.lElbow + (to.lElbow - from.lElbow) * k, rElbow: from.rElbow + (to.rElbow - from.rElbow) * k,
  };
}

// `to` with the given legs (their directions on the stage, and the knees) only as far from `from`'s as they
// can swing in `seconds` (LEG_SPEED).
function legsToward(from: PoseAngles, to: PoseAngles, seconds: number, sides: ("l" | "r")[]): PoseAngles {
  const out = { ...to };
  for (const side of sides) {
    const hip = `${side}Hip` as const, knee = `${side}Knee` as const;
    const a = from[hip] - from.lean, b = to[hip] - to.lean;
    const most = Math.max(Math.abs(b - a), Math.abs(to[knee] - from[knee]));
    const k = most > 1e-9 ? Math.min(1, (LEG_SPEED * seconds) / most) : 1;
    out[hip] = to.lean + a + (b - a) * k;
    out[knee] = from[knee] + (to[knee] - from[knee]) * k;
  }
  return out;
}

// The arms of `pose`, moved toward those of `reach` as far as they can go without a hand or elbow going
// through the floor while the hips are `height` above it.
function armsAbove(pose: PoseAngles, reach: PoseAngles, height: number): PoseAngles {
  const ok = (p: PoseAngles) => {
    const s = bodyOf(p);
    const floor = Math.min(height, floorBelow(p) + Math.max(0, height - hipHeight(p)));
    return Math.max(s.lHand.y, s.rHand.y, s.lElbow.y, s.rElbow.y) <= floor - HAND_CLEAR;
  };
  const withArms = (k: number) => ({ ...pose, lShoulder: pose.lShoulder + (reach.lShoulder - pose.lShoulder) * k, rShoulder: pose.rShoulder + (reach.rShoulder - pose.rShoulder) * k, lElbow: pose.lElbow + (reach.lElbow - pose.lElbow) * k, rElbow: pose.rElbow + (reach.rElbow - pose.rElbow) * k });
  if (ok(withArms(1))) return withArms(1);
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(withArms(mid))) lo = mid; else hi = mid;
  }
  return withArms(lo);
}

function fallBack(from: PoseAngles, speed: number, settings: MoveSettings): { beats: PlacedBeat[]; landing: { speed: number; slid: (dt: number) => number; seconds: [number, number] } } {
  const beats: PlacedBeat[] = [];
  const wobble = wobbleShare(speed);
  const h0 = hipHeight(from);
  // The slip: the front foot shoots forward along the floor, the chest tips back, the arms fly up.
  const start = bodyOf(from);
  const frontL = start.lFoot.x >= start.rFoot.x;
  const legsBy = (pose: PoseAngles, front: [number, number], back: [number, number]) => legs(pose, frontL ? front : back, frontL ? back : front);
  // Nothing holds the body up: the hips fall freely onto the floor. Moving, they keep their forward speed;
  // standing still, they drop a little back (the feet go forward, the body back).
  const vx = speed > 0 ? speed : 0;
  const back = -0.12 * wobble; // standing still the bottom lands this far behind where the hips were
  const fallTime = dropSeconds(h0, 0, 0);
  const xAt = (t: number) => vx * t + back * (t / fallTime);
  const tSlip = 0.3 * fallTime, tAir = 0.68 * fallTime;
  const hSlip = h0 - 0.5 * G * tSlip * tSlip, hAir = h0 - 0.5 * G * tAir * tAir;
  // The chest tips back no faster than a body can pitch (TORSO_SPEED): from a crouch (low hips, a short
  // fall) it is still on its way back when the bottom hits, and the back slam finishes it.
  const leanBy = (fromLean: number, want: number, seconds: number) => fromLean + clamp(want - fromLean, -TORSO_SPEED * seconds, TORSO_SPEED * seconds);
  const slipLean = (pre: PoseAngles) => leanBy(pre.lean, -18, tSlip);
  const slipPose = (lean: number) => legsBy(arms(withPose(STAND, { lean, head: 14 }), [120, 30], [95, 40]), [26, 2], [-10, 50]);
  // Standing still (no momentum): the weight tips forward first (the opposite way), arms dropping back —
  // a small sway (a few degrees, never a big pitch forward, even from a crouch), and as much smaller as it
  // is shorter when the body is already moving a little (`wobble`).
  if (wobble > 0.02) {
    const slip = slipPose(slipLean(from));
    const tipLean = Math.min(0.6, 10 / Math.max(8, Math.abs(slip.lean - from.lean))) * wobble;
    const tip = windUp(from, slip, 0.3 * amplitudeOf(settings) * wobble, { lean: tipLean, only: ["lShoulder", "rShoulder", "lElbow", "rElbow"] });
    beats.push({ kind: "anticipation", seconds: 0.18 * wobble, pose: tip, at: 0 });
  }
  // (Arms and legs only get as far as they can swing in the time.)
  const pre = beats.length ? beats[beats.length - 1].pose : from;
  const slip = slipPose(slipLean(pre));
  const slipping = legsToward(pre, armsToward(pre, slip, tSlip), tSlip, ["l", "r"]);
  beats.push({ kind: "action", seconds: physical("action", tSlip, settings), pose: slipping, at: xAt(tSlip), lift: Math.max(0, hSlip - hipHeight(slipping)), contacts: [], ease: "smooth", xEase: "linear" });
  // In the air: legs up in front, arms up and forward. Then the bottom hits (still leaning back, moving).
  const airBody = legsBy(arms(withPose(STAND, { lean: leanBy(slip.lean, -40, tAir - tSlip), head: 20 }), [140, 30], [120, 36]), [100, 20], [86, 30]);
  const air = legsToward(slipping, armsToward(slipping, airBody, tAir - tSlip), tAir - tSlip, ["l", "r"]);
  beats.push({ kind: "action", seconds: physical("action", tAir - tSlip, settings), pose: air, at: xAt(tAir), lift: Math.max(0, hAir - hipHeight(air)), contacts: [], ease: "smooth", xEase: "linear" });
  // (This beat speeds up into the hit, ending about twice as fast as its average: half the time counts.)
  const bottom = legsBy(arms(withPose(STAND, { lean: leanBy(air.lean, -64, (fallTime - tAir) / 2), head: 24 }), [150, 26], [128, 32]), [112, 20], [100, 8]);
  const xB = xAt(fallTime);
  beats.push({ kind: "action", seconds: physical("action", fallTime - tAir, settings), pose: bottom, at: xB, contacts: [], ease: "in", xEase: "linear", liftEase: "in", name: "impact" });
  // The back slams down straight after (the bottom's hit stops only half the fall: CARRY_ON), legs still
  // up, chin tucked; the body slides on in the direction it was going.
  const slide = slideAfter(vx, G * fallTime);
  const slam = dropSeconds(-bodyOf(bottom).neck.y, 0, CARRY_ON * G * fallTime);
  const slammed = safePose(legs(supineWith(28), [118, 40], [104, 30])); // arms flopped down along the body
  beats.push({ kind: "action", seconds: physical("action", slam, settings), pose: slammed, at: xB + slide.at(slam), contacts: [], ease: "in", xEase: "smooth" });
  // LANDINGS DEPEND ON THE FALL (liftSlam.ts landOnBack, called by fall()): the back hits at this speed; the
  // shared landing (scaled by it: a normal fall barely bounces) lets the legs drop, slides on, and lies still on
  // the back, taking at least as long as the legs' drop and the settle did before (`seconds`).
  const forward = Math.max(0, slide.speed - FRICTION * G * slam), downward = CARRY_ON * G * fallTime + G * slam;
  const settleSeconds: [number, number] = [slide.seconds > slam + 0.05 ? beatSeconds("settle", physical("settle", slide.seconds - slam, settings), settings) : beatSeconds("follow", 0.22, settings), beatSeconds("settle", 0.35, settings)];
  // (`slid(dt)`: how much further it has slid dt after the back hit, x height — it slides on through the landing.)
  return { beats, landing: { speed: Math.hypot(forward, downward), slid: (dt: number) => slide.at(slam + Math.max(0, dt)) - slide.at(slam), seconds: settleSeconds } };
}

// ---- Getting up ----

// low: GET UP ONLY AS FAR AS NEEDED (Arthur, round 7: "You're hurt, you've got to sit down: get up a
// little and sit, not stand up and then sit"). When the next move goes straight back down (sitting), the
// planner asks for a low get-up: it stops part of the way up and the next move goes on from there — from
// the belly, crouching over both feet with a hand on the knee; from the back, sitting up (it is sitting
// already). "up" is where it stops.
export type GetUpParams = { direction?: FallDirection; low?: boolean };

// It hurt: getting up is slow whatever the style (the hurt timing). A robot doesn't hurt.
// (A style that is slower still, e.g. sneaky, keeps its own timing.)
const hurtTiming = (settings: MoveSettings): MoveSettings => {
  if (RAMP_SCALE[settings.style] === 0) return settings;
  const hurt: MoveSettings = { ...settings, style: "hurt" };
  return beatSeconds("action", 1, settings) > beatSeconds("action", 1, hurt) ? settings : hurt;
};

// The near hand resting on the near knee.
function handOnKnee(pose: PoseAngles) {
  const s = bodyOf(pose);
  return handAt(pose, "l", s.lKnee.x + 0.01 - s.neck.x, s.lKnee.y - 0.035 - s.neck.y);
}

// The end of getting up from the belly: half-kneeling (near foot planted at `footX`, far knee down, the
// near hand on the near knee) -> a moment there -> push up on that leg, the hand pressing on the knee ->
// nearly standing ("up") -> standing. Low: from the half-kneel the far foot comes in beside the near one,
// crouching over both feet, the hand still on the knee ("up": it stops there).
function riseFromKnee(footX: number, low = false): PlacedBeat[] {
  // Half-kneeling: the far thigh upright, its shin flat on the floor behind the knee.
  const halfBase = legs(withPose(STAND, { lean: 26, head: 4, rShoulder: 10, rElbow: 24 }), [0, 0], [-4, 86]);
  const kneeDown = bodyOf(halfBase).rKnee.y;
  const half = safePose(handOnKnee(footAt(halfBase, "l", 0.25, kneeDown)));
  // Pushing up on the near leg, the far foot on its toes behind.
  const pushBase = withPose(STAND, { lean: 30, head: -2, rShoulder: 14, rElbow: 26 });
  const push = safePose(handOnKnee(footAt(footAt(pushBase, "l", 0.13, 0.37), "r", -0.24, 0.37)));
  const at = (pose: PoseAngles) => footX - bodyOf(pose).lFoot.x;
  const kneel: PlacedBeat[] = [
    { kind: "action", seconds: 0.3, pose: half, at: at(half), contacts: ["lFoot"], ease: "smooth" },
    { kind: "hold", seconds: 0.12, pose: withPose(half, { head: 10 }), at: at(half), contacts: ["lFoot"] },
  ];
  if (low) {
    const crouch = crouchOver(CROUCH.x, CROUCH.height);
    return [...kneel, { kind: "action", seconds: 0.4, pose: crouch, at: at(crouch), ease: "smooth", name: "up" }];
  }
  return [
    ...kneel,
    { kind: "action", seconds: 0.4, pose: push, at: at(push), contacts: ["lFoot"], ease: "smooth" },
    { kind: "settle", seconds: 0.25, pose: TALL, at: at(TALL), name: "up" },
    { kind: "settle", seconds: 0.25, pose: STAND, at: at(STAND), recover: true },
  ];
}
// Crouching over both feet (set the way they stand: STAND_FEET, from the standing spot), the hips at (x,
// height) from that spot, the near hand on the near knee.
const crouchOver = (x: number, height: number, head = -2) =>
  safePose(handOnKnee(onFeet(withPose(STAND, { lean: 34, head, rShoulder: 40, rElbow: 30 }), STAND_FEET, x, height)));
const CROUCH = { x: -0.07, height: 0.17 };
// Nearly standing, still a little bent over (it hurts).
const TALL = levelFeet(withPose(STAND, { lean: 8, head: 6, lShoulder: 20, rShoulder: 4, lElbow: 26, rElbow: 18, lHip: 10, rHip: 4, lKnee: 12, rKnee: 10 }));

// Get up from a fall (start.pose should be FALLEN_FORWARD or FALLEN_BACK; the direction is read from the
// pose if not given). Ends standing. Mark: "up" (back up, nearly standing: the flow point).
export function getUp(start: Stance, params: GetUpParams, settings: MoveSettings): MoveOutput {
  const direction = params.direction ?? (start.pose.lean > 20 ? "forward" : "back");
  const H = settings.height;
  const timing = hurtTiming(settings);
  const robot = RAMP_SCALE[settings.style] === 0;
  const low = params.low === true;
  const beats = direction === "back" ? upFromBack(start.pose, low) : upFromFront(start.pose, robot, low);
  return beatsToKeys(start, placeBeats(beats.map((beat) => ({ ...beat, at: beat.at * H, lift: (beat.lift ?? 0) * H })), timing), timing);
}

// ELBOWS BY THE NECK (Arthur, round 7, his drawing of a body lying face down: "Right now the elbow is
// above his head. That is physically impossible... it looks like something from a horror movie. The
// elbow should be right around his neck"). Lying face down, a body gets up the way a push-up starts: the
// hands flat on the floor UNDER THE CHEST, the elbows bent beside the body (in 3D they go out to the
// sides; in a side view that reads as the elbow pointing up and back, just behind the neck), then it
// pushes straight up. An elbow never goes up over the head.
// Getting the hands there: in a side view an arm can't get shorter, so a hand in front of the shoulder
// with its elbow up always puts the elbow over the head. So the hands don't slide back under the face:
// first the ELBOWS slide back along the floor to under the shoulders, which props the chest up on the
// forearms (the face comes off the floor; the arm turns under the shoulder, low, never over the head);
// then the hands come back under the chest while the chest sinks onto them (down before up: the
// anticipation rule) and the elbows rise up and back beside the neck; then the push.
const UNDER_CHEST = 0.085; // the hands push from this far behind the lying shoulders (x height)
const PROP_CLEAR = 2.5 * HAND_CLEAR; // propped on the forearms, the elbows are this far off the floor
const SET_SINK = 4; // degrees: setting the hands, the chest sinks back to this far off flat (just off the floor)
// Propped on the forearms: the shoulders just high enough for the upper arms to stand straight down
// under them, elbows on the floor, forearms flat on the floor in front.
const PROP_LEAN = deg(Math.acos((PROPORTIONS.upperArm + PROP_CLEAR) / PROPORTIONS.torso));

// From lying on the belly: the elbows slide back under the shoulders, the chest coming up onto the
// forearms -> the hands come back under the chest, the chest sinking onto them, elbows up by the neck,
// head down -> push the chest straight up, knees on the floor -> a moment there, head hanging -> rock back
// onto the knees (hands and knees, the hands staying where they are) -> one foot forward, hand on that
// knee -> up.
function upFromFront(from: PoseAngles, robot: boolean, low = false): PlacedBeat[] {
  const lying = bodyOf(from);
  const handsX = lying.neck.x - UNDER_CHEST; // where the hands push from (from the lying hips)
  // Both hands on the floor at `at` (from the lying hips), `clear` above it, for a pose with its hips at `x`.
  const hands = (pose: PoseAngles, x: number, clear = HAND_CLEAR, at = handsX) => {
    const s = bodyOf(pose), floor = floorBelow(pose) - clear;
    return safePose(handAt(handAt(pose, "l", at - x + 0.015 - s.neck.x, floor - s.neck.y), "r", at - x - 0.015 - s.neck.x, floor - s.neck.y));
  };
  const flatLegs = (pose: PoseAngles) => legs(pose, [-90, from.lKnee], [-90, from.rKnee]);
  // Propped on the forearms (and half way there: the elbows on the floor all the way back).
  const propAt = (lean: number, head: number) => safePose(armOnFloor(armOnFloor(flatLegs(withPose(from, { lean, head })), "l", 1, 0, PROP_CLEAR), "r", 1, 10, PROP_CLEAR));
  const prop = propAt(PROP_LEAN, robot ? from.head : -10);
  const propMid = propAt((from.lean + PROP_LEAN) / 2, robot ? from.head : (from.head - 10) / 2);
  // Hands set under the chest, the chest just off the floor, head down (and half way there: the hands
  // just off the floor, half way back).
  const setBody = flatLegs(withPose(from, { lean: from.lean - SET_SINK, head: robot ? from.head : Math.min(30, from.head + 18) }));
  const set = hands(setBody, 0);
  const propHands = bodyOf(prop).lHand.x;
  const setMid = hands(lerpPose(prop, setBody, 0.5), 0, 2.5 * HAND_CLEAR, (propHands + handsX) / 2);
  // Pushed up from the knees: knees on the floor (shins flat behind them), the hips lifted, the chest up
  // over the hands. The body stays straight from the knees to the shoulders, as low as it must be for the
  // arms to reach the hands nearly straight.
  const pressFor = (thigh: number) => {
    const body = legs(withPose(STAND, { lean: 70, head: -8 }), [thigh, thigh + 90], [thigh + 4, thigh + 94]);
    const hips = lying.lKnee.x - bodyOf(body).lKnee.x; // the knees stay where they were
    const s = bodyOf(body);
    return { body, hips, reach: Math.hypot(handsX - hips - s.neck.x, floorBelow(body) - s.neck.y) };
  };
  let pressing = pressFor(-46);
  for (let thigh = -48; thigh >= -80 && pressing.reach > 0.92 * (PROPORTIONS.upperArm + PROPORTIONS.forearm); thigh -= 2) pressing = pressFor(thigh);
  const { body: pressBody, hips: pressHips } = pressing;
  const press = hands(pressBody, pressHips);
  // On hands and knees: thighs nearly upright, shins flat behind, back nearly level, the hands where they
  // pushed from (under the chest is where a body on hands and knees has them).
  const foursBody = legs(withPose(STAND, { lean: 74, head: 8 }), [8, 98], [4, 94]);
  const foursHips = handsX - (bodyOf(foursBody).neck.x - 0.02);
  const fours = hands(foursBody, foursHips);
  // Half way between two poses, the hands put back on the floor (a little higher), so they never dip through it.
  const mid = (a: PoseAngles, b: PoseAngles, x: number) => hands(lerpPose(a, b, 0.5), x, 2.5 * HAND_CLEAR);
  const kneeX = foursHips + bodyOf(fours).lKnee.x; // the near knee on the floor
  // (A robot has no wind-up, but still has to get its hands under it: plain beats, head not dropped.)
  const prep = robot ? "settle" : "anticipation";
  return [
    { kind: "action", seconds: 0.16, pose: propMid, at: 0, contacts: [], ease: "smooth" },
    { kind: "action", seconds: 0.16, pose: prop, at: 0, contacts: [], ease: "smooth" },
    { kind: prep, seconds: 0.12, pose: setMid, at: 0, contacts: [] },
    { kind: prep, seconds: 0.12, pose: set, at: 0, contacts: [] },
    { kind: "action", seconds: 0.18, pose: mid(set, press, pressHips / 2), at: pressHips / 2, contacts: [], ease: "smooth" },
    { kind: "action", seconds: 0.22, pose: press, at: pressHips, contacts: [], ease: "smooth" },
    // Hurt: a moment up on the arms, head hanging.
    { kind: "hold", seconds: 0.12, pose: withPose(press, { head: 22 }), at: pressHips, contacts: [] },
    { kind: "action", seconds: 0.18, pose: mid(press, fours, (pressHips + foursHips) / 2), at: (pressHips + foursHips) / 2, contacts: [], ease: "smooth" },
    { kind: "action", seconds: 0.22, pose: fours, at: foursHips, contacts: [], ease: "smooth" },
    // The near foot steps forward under the chest; the near hand goes to that knee.
    ...riseFromKnee(kneeX + 0.3, low),
  ];
}

// From lying on the back: the arms swing back past the head (anticipation) -> sit up swinging them
// forward, knees drawn up, feet planted (only passing through sitting, no stop) -> rock on forward over the
// feet, the hips coming off the floor -> crouching over the feet, the near hand on the near knee -> push
// up on it -> up.
const STAND_FEET = { l: bodyOf(STAND).lFoot.x, r: bodyOf(STAND).rFoot.x }; // feet from the standing hips
function upFromBack(from: PoseAngles, low = false): PlacedBeat[] {
  const back = safePose(arms(withPose(from, { head: Math.max(-10, from.head - 16) }), [-150, 20], [-160, 14]));
  // The feet are planted from the sit-up on, set the way they stand, the near one 0.42 in front of the
  // lying hips; places below are from where the hips will be standing (`spot`, from the lying hips).
  const spot = 0.42 - STAND_FEET.l;
  const placed = (pose: PoseAngles, x: number, height: number) => onFeet(pose, STAND_FEET, x, height);
  const swing = { lShoulder: 96, rShoulder: 88, lElbow: 16, rElbow: 20 };
  // Sitting up: chest up and forward, knees up, arms swinging forward.
  const sitUp = safePose(placed(arms(withPose(STAND, { lean: -14, head: 8 }), [62, 20], [52, 28]), -spot, 0.012));
  // Rocking on forward over the feet, the hips coming off the floor (the path a body takes standing up
  // from the floor), arms still reaching forward.
  const rock1 = safePose(placed(withPose(STAND, { lean: 20, head: -4, ...swing }), -0.27, 0.065));
  const rock2 = safePose(placed(withPose(STAND, { lean: 26, head: -4, ...swing }), -0.15, 0.13));
  // Crouching over the feet, the near hand on the near knee; then pushing up on it.
  const crouch = crouchOver(CROUCH.x, CROUCH.height);
  const push = safePose(handOnKnee(placed(withPose(STAND, { lean: 20, head: 2, rShoulder: 16, rElbow: 26 }), -0.03, 0.34)));
  const tall = placed(TALL, -0.005, 0.445);
  const at = (x: number) => spot + x;
  const up: PlacedBeat[] = [
    { kind: "anticipation", seconds: 0.22, pose: back, at: 0, contacts: [] },
    { kind: "action", seconds: 0.38, pose: sitUp, at: 0, ease: "smooth" },
  ];
  // Low: it is sitting already: it stops there ("up"); sitting down goes on from there (sit.ts).
  if (low) return [up[0], { ...up[1], name: "up" }];
  return [
    ...up,
    { kind: "action", seconds: 0.22, pose: rock1, at: at(-0.27), ease: "smooth" },
    { kind: "action", seconds: 0.2, pose: rock2, at: at(-0.15), ease: "smooth" },
    { kind: "action", seconds: 0.2, pose: crouch, at: at(-0.07), ease: "smooth" },
    { kind: "hold", seconds: 0.12, pose: withPose(crouch, { head: 8 }), at: at(-0.07) },
    // (The far foot shifts its weight off while pushing up, and is set down again when nearly up.)
    { kind: "action", seconds: 0.42, pose: push, at: at(-0.03), contacts: ["lFoot"], ease: "smooth" },
    { kind: "settle", seconds: 0.25, pose: tall, at: at(-0.005), name: "up" },
    { kind: "settle", seconds: 0.25, pose: STAND, at: at(0), recover: true },
  ];
}

// Lying still after a fall: slow breaths (the chest rises a little), hands staying on the floor.
// Breathing isn't sped up by the style or speed: it takes exactly `seconds`.
function lieStill(start: Stance, seconds: number): MoveOutput {
  if (seconds <= 0) return { keys: [], end: start, marks: {} };
  const way = start.pose.lean > 0 ? 1 : -1;
  const inhale = withPose(start.pose, { lean: start.pose.lean - 2 * way, head: start.pose.head - 2 * way });
  const breaths = Math.max(1, Math.round(seconds / 3));
  const beats: Beat[] = [];
  for (let i = 0; i < breaths; i += 1) {
    beats.push({ kind: "hold", seconds: (0.45 * seconds) / breaths, pose: inhale, contacts: [] }, { kind: "hold", seconds: (0.55 * seconds) / breaths, pose: start.pose, contacts: [] });
  }
  return beatsToKeys(start, beats, { height: 1, style: "natural", speed: "normal", energy: 0.5 });
}

// Fall, lie still for `seconds` (breathing), and get back up (`low`: only part of the way, see getUp).
// Marks: "impact", "down", "up".
export function fallAndGetUp(start: Stance, params: FallAndGetUpParams, settings: MoveSettings): MoveOutput {
  const seconds = Math.max(0, params.seconds ?? FALL_DEFAULTS.seconds);
  return chainMoves(start, [
    (from) => fall(from, params, settings),
    (from) => lieStill(from, seconds),
    (from) => getUp(from, { direction: params.direction, low: params.low }, settings),
  ]);
}
