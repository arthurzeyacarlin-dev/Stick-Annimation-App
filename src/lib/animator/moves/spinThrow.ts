import { buildScene, type CharacterKey } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { DEFAULT_STYLE, HEAD_RADIUS, PROPORTIONS, STAND, withPose, type Facing, type PoseAngles, type Point } from "../rig.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { beatSeconds, forwardSign, lerpPose } from "./motion.ts";
import { armFromWorld, feetOf, placedBeatsToKeys, plantedLegs, STAND_HIP, isRobot, type PlacedBeat } from "./punch.ts";
import { keepLying, otherBody, isDown, type Other } from "./grapple.ts";
import { handAt, safePose } from "./squat.ts";
import { FALLEN_BACK } from "./fall.ts";

// SPEC-0017 Phase 2 round 14: GRAB, SPIN, THROW (Arthur: "grab the stick figure and spin, spin, spin, and
// throw him somewhere"). A two-figure special attack on someone STANDING close in front: the attacker
// steps in, bends a little and grabs the waist with both hands, pulls him up off his feet and SPINS on the
// spot (in the side view he turns to face wherever the held one is; the held one swings round him from
// his front to his back and round again, almost two turns, getting faster), then LETS GO as the held one
// swings round to the front: he flies off forward (a short arc through the air), lands on his back, slides
// and jolts, and lies there; the thrower follows through and settles back into his stance. Rules:
// - THE HELD BODY GOES WHERE THE HANDS ARE: from the grab to the release the held one's hips are exactly
//   at the thrower's real hands every moment (worked out from the thrower's keys, never guessed), feet
//   off the floor, never into it.
// - A SPIN IS SEEN FROM THE SIDE: out at the sides the held body is flung out (head back, legs trailing);
//   passing in front of / behind the thrower it is small and tucked (it points at us), so turning to face
//   the other way never makes a limb jump.
// - LET GO WHERE IT FLIES THE RIGHT WAY: released as it swings round past him to the front, moving forward.
// Poses are facing-relative and in body heights (x height): forward = +x, y grows downward, floor at 0.

const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;
const HEAD_R = HEAD_RADIUS.normal;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const flip = (f: Facing): Facing => (f === "left" ? "right" : "left");

// Hip to hip (x height) when the hands are on the waist; how far out (hips to hands) the held one swings
// at the sides, and how much of that the thrower leans the other way (they turn round a shared middle).
const GRAB_GAP = 0.26;
const SWING = 0.2;
const COUNTER = 0.06;
// How high (x height) the waist is held while spinning.
const HELD_H = 0.62;
// The whole turn (radians): almost two turns, let go 70 degrees before the held one is straight out in
// front — just as it swings round past him toward the front, moving forward fast (so it flies forward).
const SPIN_ANGLE = 4 * Math.PI - (70 * Math.PI) / 180;
const STEP = 1 / 48;

export type SpinThrowParams = { other?: Other; size?: number };

// Where the thrower's spin is at time s (0..1 of the spin): the angle — it gets going over the first
// RAMP of the time, then spins at full speed until it lets go.
const RAMP = 0.3;
const RAMPED = 1 / (1 - RAMP / 2);
const angleAt = (s: number) => { const u = clamp(s, 0, 1); return SPIN_ANGLE * RAMPED * (u < RAMP ? (u * u) / (2 * RAMP) : u - RAMP / 2); };
// SPIN SPEED (radians a second at full speed): never so quick that a flung foot jumps too far between
// pictures, or the arms turn more than they may in one picture at 8 fps.
const spinSpeed = (h: number) => Math.min(6.5, (0.8 * 2880) / ((SWING + 0.55) * h));

// SPIN THROW (attacker). Marks `grab` (both hands on the waist), `spin` (off the floor, turning),
// `release` (lets go), `ready` (back in the stance).
export function spinThrow(start: Stance, params: SpinThrowParams, settings: MoveSettings): MoveOutput {
  const h = settings.height;
  const way = forwardSign(start.facing === "front" ? "right" : start.facing);
  const facing0: Facing = start.facing === "front" ? "right" : start.facing;
  const feet = feetOf(start.pose);
  const o = params.other && !isDown(params.other) ? params.other : undefined;
  const waist: Point = o ? otherBody(o).hip : { x: 0.5, y: -STAND_HIP };
  const step = clamp(waist.x - GRAB_GAP, 0, 0.45);
  const front = feet.l >= feet.r ? "l" : "r", back = front === "l" ? "r" : "l";
  const feet1 = { ...feet, [front]: feet[front] + step };
  const lo = Math.min(feet1.l, feet1.r), hi = Math.max(feet1.l, feet1.r);
  // A pose on feet `fs`, hips `at` and `hipH` up, both hands at `hand` (x height, from the start hips).
  const body = (fs: typeof feet, lean: number, at: number, hipH: number, hand: Point) => {
    let pose = plantedLegs(withPose(STAND, { lean, head: -8 }), fs, at, STAND_HIP - hipH);
    const neck = forwardKinematics(pose, "right", { x: at, y: -hipH }, 1, "normal", false).neck;
    pose = handAt(pose, "l", hand.x - neck.x + 0.012, hand.y - neck.y);
    pose = handAt(pose, "r", hand.x - neck.x - 0.012, hand.y - neck.y);
    return safePose(pose);
  };
  // The grab: the least bend that reaches the waist.
  let g = { lean: 20, at: (lo + hi) / 2, hipH: STAND_HIP - 0.05, score: Infinity };
  for (let lean = 0; lean <= 45; lean += 5) for (let drop = 0.02; drop <= 0.2; drop += 0.02) for (let at = lo; at <= hi + 1e-9; at += 0.02) {
    const hipH = STAND_HIP - drop;
    const neck = { x: at + PROPORTIONS.torso * Math.sin((lean * Math.PI) / 180), y: -hipH - PROPORTIONS.torso * Math.cos((lean * Math.PI) / 180) };
    const d = Math.hypot(waist.x - neck.x, waist.y - neck.y);
    const score = (d <= ARM * 0.95 ? 0 : 10 + d) + 2 * drop + lean / 200 + Math.abs(waist.x - at - GRAB_GAP) / 3;
    if (score < g.score) g = { lean, at, hipH, score };
  }
  const beats: PlacedBeat[] = [];
  if (step > 0.03) {
    // STEP IN: the front foot lifts and lands closer; hands come up toward the waist.
    let lifted = plantedLegs(withPose(STAND, { lean: 10, head: -6, ...armFromWorld(10, "l", { upper: 40, fore: 70 }), ...armFromWorld(10, "r", { upper: 35, fore: 65 }) }), feet, 0.4 * step, 0.04, back);
    lifted = { ...lifted, [`${front}Hip`]: 45, [`${front}Knee`]: 50 } as PoseAngles;
    beats.push({ kind: "action", ease: "smooth", pose: safePose(lifted), seconds: 0.16, at: 0.4 * step, contacts: [back === "l" ? "lFoot" : "rFoot"] });
    beats.push({ kind: "action", ease: "smooth", pose: body(feet1, g.lean * 0.6, (g.at + 0.4 * step) / 2, g.hipH + 0.02, { x: waist.x - 0.06, y: waist.y - 0.04 }), seconds: 0.14, at: (g.at + 0.4 * step) / 2 });
  }
  const grabbed = body(feet1, g.lean, g.at, g.hipH, waist);
  beats.push({ kind: "action", ease: "smooth", pose: grabbed, seconds: 0.12, at: g.at, name: "grab" });
  beats.push({ kind: "hold", pose: grabbed, seconds: 0.08, at: g.at });
  const first = placedBeatsToKeys(start, beats, settings);
  const keys = first.keys.slice();
  const tGrab = first.end.t;
  // THE SPIN (world px): both turn round a middle point; the held waist starts where it stood.
  const victimX = start.x + way * waist.x * h;
  const cx = victimX - way * (SWING - COUNTER) * h;
  const spinPose = (theta: number) => {
    const c = Math.abs(Math.cos(theta));
    const lean = -4 - 8 * c;
    let pose = plantedLegs(withPose(STAND, { lean, head: -6 }), { l: -0.035, r: 0.035 }, 0, 0.04);
    const hipH = STAND_HIP - 0.04;
    const neck = forwardKinematics(pose, "right", { x: 0, y: -hipH }, 1, "normal", false).neck;
    // (Passing in front/behind, the arms hang straight down holding the waist low in front of the hips, so
    // turning round never flips an arm over; out at the sides they hold it up and out. The hands stay in
    // close a while either side of a pass, so the arms turn smoothly.)
    const w = c * c;
    const low = { x: neck.x + 0.02, y: neck.y + ARM * 0.97 };
    const hand = { x: low.x + (SWING - low.x) * w, y: low.y + (-HELD_H - low.y) * w };
    pose = handAt(pose, "l", hand.x - neck.x + 0.012, hand.y - neck.y);
    pose = handAt(pose, "r", hand.x - neck.x - 0.012, hand.y - neck.y);
    return safePose(pose);
  };
  const spinKey = (t: number, theta: number): CharacterKey => {
    const c = Math.cos(theta);
    return { t, pose: spinPose(theta), x: cx - way * COUNTER * h * c, lift: 0, contacts: [], facing: c >= 0 ? facing0 : flip(facing0), ease: "linear", xEase: "linear", liftEase: "linear" };
  };
  const T = Math.max((SPIN_ANGLE * RAMPED) / spinSpeed(h), 1.6 * beatSeconds("action", 1.1, settings));
  const pull = 0.24;
  const tSpin = tGrab + pull;
  keys.push({ ...spinKey(tSpin, 0), ease: "linear" });
  keys[keys.length - 2] = { ...keys[keys.length - 2], ease: "smooth", xEase: "smooth" };
  const n = Math.ceil(T / STEP);
  for (let i = 1; i <= n; i += 1) keys.push(spinKey(tSpin + (T * i) / n, angleAt(i / n)));
  const tRelease = tSpin + T;
  // LET GO: follow through toward the throw, a stumbling step from the spin, back into the stance.
  const relX = keys[keys.length - 1].x;
  const follow = safePose(withPose(STAND, { lean: 18, head: -4, ...armFromWorld(18, "l", { upper: 80, fore: 85 }), ...armFromWorld(18, "r", { upper: 65, fore: 75 }), lHip: 10, rHip: -6, lKnee: 12, rKnee: 8 }));
  const robot = isRobot(settings);
  const after = placedBeatsToKeys({ t: tRelease, x: relX, facing: facing0, pose: keys[keys.length - 1].pose }, [
    { kind: robot ? "hold" : "follow", pose: follow, seconds: 0.18, at: 0.08, contacts: [] },
    { kind: "settle", pose: start.pose, seconds: 0.5, at: 0.12, name: "ready" },
  ], settings);
  for (const k of after.keys.slice(1)) keys.push({ ...k, facing: facing0, lift: 0 });
  return {
    keys,
    end: { ...after.end, facing: facing0 },
    marks: { grab: first.marks.grab, spin: tSpin, release: tRelease, ready: after.marks.ready, up: after.marks.ready },
  };
}

// ---- SPUN AND THROWN (the one grabbed) -----------------------------------------------------------------

export type Spinner = { keys: CharacterKey[]; facing: Facing; height: number; grab: number; spin: number; release: number };
export type SpunThrownParams = { from?: string; spinner?: Spinner; distance?: number };

// Passing in front of / behind the thrower: small, tucked, arms in (nearly the same seen from either side).
const TUCK: PoseAngles = safePose({ lean: 4, head: 8, lShoulder: 4, rShoulder: -2, lElbow: 14, rElbow: 10, lHip: 38, rHip: 26, lKnee: 70, rKnee: 60 });
// Out at the side: flung out away from the thrower (head back, arms flying out, legs trailing).
const FLUNG: PoseAngles = safePose({ lean: -48, head: -20, lShoulder: -150, rShoulder: -120, lElbow: 20, rElbow: 30, lHip: -20, rHip: -40, lKnee: 30, rKnee: 15 });
// In the air after the throw: on its way over onto its back.
const AIR: PoseAngles = safePose({ lean: -70, head: 15, lShoulder: -85, rShoulder: -70, lElbow: 30, rElbow: 40, lHip: 30, rHip: 50, lKnee: 60, rKnee: 30 });
const SAMPLE = 1 / 96;
const FLIGHT = 0.44;

function belowHips(pose: PoseAngles, facing: Facing, height: number) {
  const s = forwardKinematics(pose, facing, { x: 0, y: 0 }, height, "normal", false);
  return Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + HEAD_R * height);
}

// SPUN AND THROWN: standing, it is grabbed by the waist, pulled off its feet and swung round the thrower
// (its hips in the thrower's hands every moment: the planner passes the thrower's keys as `spinner`),
// let go, flies off backward through the air, lands on its back, slides and jolts, and lies there (follow
// with kipUp or getUp). Marks `grab`, `spin`, `release`, `land`, `down`, `ready`.
export function spunThrown(start: Stance, params: SpunThrownParams, settings: MoveSettings): MoveOutput {
  const p0 = start.pose;
  const c = params.spinner;
  const h = settings.height;
  if (!c || c.grab <= start.t + 0.05) {
    // (Nobody spinning it: a held breath where it is, so a plan never breaks.)
    return placedBeatsToKeys(start, [{ kind: "hold", pose: p0, seconds: 0.3, at: 0, name: "grab" }, { kind: "hold", pose: p0, seconds: 0.2, at: 0, name: "ready" }], settings);
  }
  const end = c.keys[c.keys.length - 1].t;
  const frames = buildScene({ id: "spinner", title: "spinner", durationSec: end + 0.1, groundY: 0, characters: [{ id: "c", name: "c", facing: c.facing, height: c.height, style: DEFAULT_STYLE, keys: c.keys }] }, 1 / SAMPLE).frames;
  const at = (t: number) => frames[clamp(Math.round(t / SAMPLE), 0, frames.length - 1)][0].skeleton;
  const handsAt = (t: number): Point => { const s = at(t); return { x: (s.lHand.x + s.rHand.x) / 2, y: (s.lHand.y + s.rHand.y) / 2 }; };
  const startled = safePose(withPose(p0, { head: p0.head - 8, lean: p0.lean - 4 }));
  const keys: CharacterKey[] = [{ t: start.t, pose: p0, x: start.x, lift: 0 }];
  const seeAt = Math.max(start.t + 0.02, c.grab - 0.2);
  if (seeAt > start.t + 0.03) keys.push({ t: seeAt, pose: p0, x: start.x, lift: 0 });
  keys.push({ t: c.grab, pose: startled, x: start.x, lift: 0 });
  // HELD BODY: tucked passing in front/behind, flung out at the sides; facing the thrower.
  let facing: Facing = start.facing;
  const heldKey = (t: number): CharacterKey => {
    const hand = handsAt(t), body = at(t);
    const rel = hand.x - body.hip.x;
    if (Math.abs(rel) > 1) facing = rel > 0 ? "left" : "right";
    const out = clamp(Math.abs(rel) / (SWING * h), 0, 1);
    const up = clamp((t - c.grab) / Math.max(1e-3, c.spin - c.grab), 0, 1);
    const spun = lerpPose(TUCK, FLUNG, out * out);
    let pose = up < 1 ? lerpPose(startled, spun, up * up * (3 - 2 * up)) : spun;
    // (Never into the floor: lower, it tucks up more.)
    let k = 1;
    while (k > 0 && -hand.y - belowHips(pose, facing, h) < 0) { k -= 0.1; pose = lerpPose(TUCK, pose, Math.max(0, k)); }
    return { t, pose, x: hand.x, lift: Math.max(0, -hand.y - belowHips(pose, facing, h)), contacts: [], facing, ease: "linear", xEase: "linear", liftEase: "linear" };
  };
  for (let t = c.grab + SAMPLE; t < c.release - 1e-6; t += SAMPLE) keys.push(heldKey(t));
  const rel = heldKey(c.release);
  keys.push(rel);
  // THROWN: away from the thrower (it flies backward, as it faces him), a short arc, lands on its back.
  const away = forwardSign(flip(rel.facing ?? facing));
  const dist = (params.distance ?? 1.5) * h;
  const y0 = rel.lift! + belowHips(rel.pose, rel.facing!, h);
  const landPose = FALLEN_BACK;
  const yLand = belowHips(landPose, rel.facing!, h);
  for (let i = 1; i <= Math.ceil(FLIGHT / STEP); i += 1) {
    const s = Math.min(1, (i * STEP) / FLIGHT);
    const pose = s < 0.5 ? lerpPose(rel.pose, AIR, s / 0.5) : lerpPose(AIR, landPose, (s - 0.5) / 0.5);
    const y = y0 * (1 - s) + yLand * s + 0.18 * h * 4 * s * (1 - s);
    keys.push({ t: c.release + s * FLIGHT, pose, x: rel.x + away * dist * s * (1.15 - 0.15 * s), lift: s >= 1 ? 0 : Math.max(0, y - belowHips(pose, rel.facing!, h)), contacts: [], facing: rel.facing, ease: "linear", xEase: "linear", liftEase: "linear" });
  }
  const tLand = c.release + FLIGHT;
  const xLand = rel.x + away * dist;
  // THE LANDING (like a hard fall's): slides on, jolts (shoulders curl, legs up), slams flat, lies hurt.
  const lean = landPose.lean;
  const foldLean = lean + 9;
  const fold = keepLying(safePose(withPose(landPose, { lean: foldLean, head: landPose.head + 8, ...armFromWorld(foldLean, "l", { upper: 70, fore: 110 }), ...armFromWorld(foldLean, "r", { upper: 60, fore: 100 }), lHip: 150 + foldLean, lKnee: 70, rHip: 158 + foldLean, rKnee: 85 })));
  const flat = keepLying(safePose(withPose(landPose, { head: landPose.head - 4 })));
  const tail = placedBeatsToKeys({ t: tLand, x: xLand, facing: rel.facing!, pose: landPose }, [
    { kind: "follow", pose: fold, seconds: 0.12, at: -0.18, contacts: [], xEase: "out" },
    { kind: "action", pose: flat, seconds: 0.1, at: -0.24, contacts: [] },
    { kind: "settle", pose: landPose, seconds: 0.5, at: -0.24, contacts: [], name: "down" },
  ], settings);
  for (const k of tail.keys.slice(1)) keys.push({ ...k, lift: 0, facing: rel.facing });
  return {
    keys,
    end: { ...tail.end, facing: rel.facing! },
    marks: { sees: seeAt, grab: c.grab, spin: c.spin, release: c.release, land: tLand, down: tail.marks.down, ready: tail.end.t },
  };
}
