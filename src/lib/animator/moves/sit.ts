import type { CharacterKey } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { STAND, withPose, type PoseAngles } from "../rig.ts";
import { headToward } from "./gaze.ts";
import { amplitudeOf, beatsToKeys, lerpPose, windUp, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { feetAhead, fromHere, handAt, onFeet as plant, placeBeats, safePose, standOrigin, type PlacedBeat } from "./squat.ts";

// SPEC-0017 Phase 2: sitting down on the floor (no chair) and standing back up.
// Sitting down: chest up and a little back, a breath in (anticipation: the opposite way of going down,
// the engine's windUp rule) -> lower into a deep squat with the
// arms forward for balance -> sit back, the back hand reaching down behind -> the bottom touches down
// softly -> settle upright, knees up. Standing up: rock back a little, arms drawing back (anticipation) ->
// swing the arms forward and rock the hips up off the floor and over the feet (action) -> rise out of the
// squat, slowing down (follow-through) -> settle standing.
// The feet stay planted where the figure stood the whole time, so the moves chain (sit down, ..., stand up).
// Everything is worked out from where the feet really are (not from the hips), so sitting down also
// starts well from a crouch or a landing. Standing up flows: "up" (nearly standing, still rising) is
// where another move can take over straight away.

// Where things are, x figure height, relative to the standing hips (forward +, up +).
const SEAT_HEIGHT = 0.012; // hips this far above the floor when sitting (the bottom rests on it)
const FEET_AHEAD = 0.42; // the front foot this far in front of the hips when sitting (knees up)
const HAND_CLEAR = 0.012; // a hand resting on the floor stays this far above it (never through it)

// Planted feet, forward of the "standing spot" (where the hips are when standing in STAND over them).
type Feet = { l: number; r: number };
const feetFrom = (pose: PoseAngles, origin: number): Feet => {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  return { l: s.lFoot.x - origin, r: s.rFoot.x - origin };
};
// Where a start pose's standing spot is (forward of its hips) and its feet, from that spot.
const groundOf = (pose: PoseAngles) => {
  const origin = standOrigin(pose);
  return { origin, feet: feetFrom(pose, origin) };
};
// Sitting on the floor already: the bottom down (the hips within a little of the lowest foot), the chest up.
function isSitting(pose: PoseAngles) {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  return Math.max(s.lFoot.y, s.rFoot.y) < 0.05 && Math.abs(pose.lean) < 45;
}
const FEET = feetFrom(STAND, 0);
// Hips when sitting (forward of the standing spot): the front foot FEET_AHEAD in front of them.
const seatX = (feet: Feet) => Math.max(feet.l, feet.r) - FEET_AHEAD;
const SEAT_X = seatX(FEET);

// A pose with the hips at (x, height) and both feet flat on the floor where they are planted (the lean
// is reduced if the hips would fold too far).
const onFeet = (pose: PoseAngles, x: number, height: number, feet: Feet = FEET) => plant(pose, feet, x, height);

// Neck, head and knee positions of a pose with its hips at (x, height) (x height, up +).
function joints(pose: PoseAngles, x: number, height: number) {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  const at = (p: { x: number; y: number }) => ({ x: x + p.x, y: height - p.y });
  return { neck: at(s.neck), head: at(s.head), lKnee: at(s.lKnee) };
}

// A hand placed at a point (x height, up +), for a pose with its hips at (x, height).
function handTo(pose: PoseAngles, side: "l" | "r", x: number, height: number, target: { x: number; y: number }) {
  const { neck } = joints(pose, x, height);
  return handAt(pose, side, target.x - neck.x, neck.y - target.y);
}

// A pose on the way between sitting and squatting: hips at (x, height), both feet planted, arms as given,
// the far hand reaching down behind toward the floor (`reach` = how far above it).
function between(x: number, height: number, lean: number, arms: Partial<PoseAngles>, reach?: number, feet: Feet = FEET): PoseAngles {
  const pose = onFeet(withPose(STAND, { lean, head: -8, ...arms }), x, height, feet);
  return safePose(reach === undefined ? pose : handTo(pose, "r", x, height, { x: x - 0.11, y: HAND_CLEAR + reach }));
}

// A sitting pose: hips on the floor, both feet planted, the near hand resting on the near knee and the far
// hand on the floor beside and behind the hips. `lean` tilts the chest (back -, forward +).
function seated(lean: number, head = 4, shoulders = 0, feet: Feet = FEET): PoseAngles {
  const x = seatX(feet);
  const legs = onFeet(withPose(STAND, { lean, head }), x, SEAT_HEIGHT, feet);
  const { lKnee } = joints(legs, x, SEAT_HEIGHT);
  const nearHand = handTo(legs, "l", x, SEAT_HEIGHT, { x: lKnee.x - 0.01, y: lKnee.y + 0.03 });
  const pose = handTo(nearHand, "r", x, SEAT_HEIGHT, { x: x - 0.11, y: HAND_CLEAR });
  return safePose({ ...pose, lShoulder: pose.lShoulder + shoulders, rShoulder: pose.rShoulder + shoulders / 2 });
}

// EYES ON THE INJURY (Arthur, round 7: "When he sat down he should at least be looking at where he got
// hurt"). A hurt figure sitting down (after a fall, or in the hurt style) doesn't sit up tall: it
// stretches its legs out, leans over the hurt spot, holds it with both hands and LOOKS AT IT (gaze.ts: the
// head turns to the spot, as far as a neck goes; the eyes do the rest). A trip lands on the knees, so the
// hurt spot is the near knee. (The legs go out so the chest can lean over them: with the knees up, the
// hips can't fold that far.) `lean` tilts the chest (forward +), `rub` slides the far hand down the shin
// (rubbing the knee). Before standing up it draws its feet back in.
export type HurtSpot = "knee";
const LEGS_OUT = { l: 0.455, r: 0.445 }; // hurt, the feet this far in front of the sitting hips (legs nearly straight)
function hurtSeated(feet: Feet = FEET, lean = 24, rub = 0): PoseAngles {
  const x = seatX(feet);
  const legs = onFeet(withPose(STAND, { lean }), x, SEAT_HEIGHT, { l: x + LEGS_OUT.l, r: x + LEGS_OUT.r });
  const { lKnee } = joints(legs, x, SEAT_HEIGHT);
  const held = handTo(handTo(legs, "l", x, SEAT_HEIGHT, { x: lKnee.x + 0.005, y: lKnee.y + 0.025 }), "r", x, SEAT_HEIGHT, { x: lKnee.x + 0.03, y: lKnee.y - 0.05 - rub });
  // The head turns to look at the knee (twice: turning the head moves the eyes a little).
  let pose = safePose(held);
  for (let i = 0; i < 2; i += 1) {
    const { head } = joints(pose, x, SEAT_HEIGHT);
    pose = safePose({ ...pose, head: headToward(pose, { ahead: 1000 * (lKnee.x - head.x), up: 1000 * (lKnee.y - head.y) }) });
  }
  return pose;
}
export const SEATED_HURT: PoseAngles = hurtSeated();
// After a beat that moves the feet (contacts []), a moment with them down again where they are now. (The
// next move's first key replaces a move's last key, feet down: without this the feet would count as down
// all through the beat that moves them, and the hips would slide instead.)
const feetDown = (beat: PlacedBeat): PlacedBeat => ({ kind: "hold", seconds: 0.08, pose: beat.pose, at: beat.at });
// Between sitting with the far hand on the floor behind and holding the knee (either way): the far hand
// comes up off the floor and over, half way, never through the floor. Beats `a` -> `b`, the feet free.
function handOver(a: PoseAngles, b: PlacedBeat, seconds: number): PlacedBeat[] {
  const x = seatX(FEET);
  const half = safePose(handTo(lerpPose(a, b.pose, 0.5), "r", x, SEAT_HEIGHT, { x: x + 0.08, y: 0.15 }));
  return [{ kind: "settle", seconds: seconds / 2, pose: half, at: b.at, contacts: [] }, { ...b, seconds: seconds / 2, contacts: [] }, feetDown(b)];
}
const hurtOf = (params: SitParams, settings: MoveSettings): HurtSpot | undefined =>
  params.hurt ? "knee" : settings.style === "hurt" ? "knee" : undefined;

// The pose sitDown ends in and standUp starts from (facing-relative): sitting on the floor, knees up, feet
// flat where the figure was standing, chest upright, near hand on the knee, far hand on the floor. The
// hips are 0.42 x height behind the front foot (about 0.41 x height behind where they were standing).
export const SEATED: PoseAngles = seated(-6);
// How far forward of the standing hips the seated hips are (x height; negative = behind).
export const SEATED_HIPS = SEAT_X;

// The deep squat both moves pass through, over the feet, arms forward to balance the hips going back.
const SQUAT_X = -0.07, SQUAT_HEIGHT = 0.17;
const lowSquat = (feet: Feet = FEET) => onFeet(withPose(STAND, { lean: 34, head: -14, lShoulder: 84, rShoulder: 74, lElbow: 16, rElbow: 20 }), SQUAT_X, SQUAT_HEIGHT, feet);
// The path between the squat and the floor: hips going back and down (sitting) or up and forward
// (standing), the chest as far forward as the hips allow.
const PATH = [{ x: -0.15, height: 0.13 }, { x: -0.27, height: 0.065 }];

// hurt: sitting down hurt (the planner sets it after a fall; the hurt style is always hurt): it leans over
// the hurt spot, holds it and looks at it (EYES ON THE INJURY).
export type SitParams = { seconds?: number; hurt?: HurtSpot | boolean };
// Arthur (2026-10-04): no needless resting; a short sit by default.
export const SIT_DEFAULTS = { seconds: 1.2 };

// Sit down on the floor. Ends in SEATED (not standing; hurt: SEATED_HURT): follow it with standUp. Mark:
// "seated". Works from any start pose with both feet planted (standing, a landing crouch, a squat on its
// way up, crouching part of the way up from a fall). Already sitting (GO FROM WHERE YOU ARE: a body that
// sat up from lying on its back), it only settles into the sitting pose.
export function sitDown(start: Stance, params: SitParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const { origin, feet } = groundOf(start.pose);
  const hurt = hurtOf(params, settings);
  const sitting = (lean: number, head: number, shoulders: number) => hurt ? hurtSeated(feet) : seated(lean, head, shoulders, feet);
  if (isSitting(start.pose)) {
    const settle: PlacedBeat = { kind: "settle", seconds: 0.5, pose: sitting(-6, 4, 0), at: (origin + seatX(feet)) * H, name: "seated" };
    return beatsToKeys(start, placeBeats(handOver(start.pose, settle, 0.6), settings), settings);
  }
  const squatPose = lowSquat(feet);
  // Anticipation, the engine's rule: the opposite way of going down and back: chest up and a little
  // back, hips a little forward, knees straightening, arms a little back (a breath in). Shorter (and the
  // lowering quicker) when it starts part of the way down already, e.g. from a landing crouch.
  const ready = windUp(start.pose, squatPose, 0.12 * amplitudeOf(settings), { lean: 0.15 });
  const forward = { lShoulder: 74, lElbow: 24 };
  const beats: PlacedBeat[] = [
    // (The hips stay over the planted feet.)
    { kind: "anticipation", seconds: fromHere(0.3, start.pose, squatPose, 0.5), pose: ready, at: feetAhead(start.pose) - feetAhead(ready) },
    // Lowering with control: speeds up gently and slows into the bottom of the squat.
    { kind: "action", seconds: fromHere(0.8, start.pose, squatPose), pose: squatPose, at: origin + SQUAT_X, ease: "smooth" },
    // Sitting back: the near arm stays forward for balance, the far hand reaches down behind.
    { kind: "action", seconds: 0.3, pose: between(PATH[0].x, PATH[0].height, 20, forward, 0.1, feet), at: origin + PATH[0].x, ease: "smooth" },
    { kind: "action", seconds: 0.3, pose: between(PATH[1].x, PATH[1].height, 12, forward, 0.03, feet), at: origin + PATH[1].x, ease: "smooth" },
    // The bottom touches down softly.
    { kind: "follow", seconds: 0.3, pose: seated(4, -2, 14, feet), at: origin + seatX(feet) },
    // Settle: sit up tall (hurt: lean over the hurt knee, hold it and look at it).
    { kind: "settle", seconds: 0.5, pose: sitting(-6, 4, 0), at: origin + seatX(feet), name: "seated" },
  ];
  if (hurt) beats.push(...handOver(beats[beats.length - 2].pose, beats.pop()!, 0.6));
  return beatsToKeys(start, placeBeats(beats.map((beat) => ({ ...beat, at: beat.at * H })), settings), settings);
}

// Stand up from sitting (start.pose should be SEATED, e.g. the end of sitDown). Mark: "up" (back up,
// nearly standing and still rising: the flow point). Ends standing in STAND.
export function standUp(start: Stance, _params: Record<string, unknown>, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const { origin, feet } = groundOf(start.pose);
  const swing = { lShoulder: 96, rShoulder: 88, lElbow: 16, rElbow: 20 };
  const beats: PlacedBeat[] = [
    // Anticipation (the opposite way): rock back a little, arms drawing back, ready to throw the weight forward.
    { kind: "anticipation", seconds: 0.45, pose: seated(-14, 6, -30, feet), at: seatX(feet) },
    // Action: the arms swing forward and the hips rock up off the floor and forward over the feet.
    { kind: "action", seconds: 0.28, pose: between(PATH[1].x, PATH[1].height, 20, swing, undefined, feet), at: PATH[1].x, ease: "smooth" },
    { kind: "action", seconds: 0.22, pose: between(PATH[0].x, PATH[0].height, 26, swing, undefined, feet), at: PATH[0].x, ease: "smooth" },
    { kind: "action", seconds: 0.22, pose: lowSquat(feet), at: SQUAT_X, ease: "smooth" },
    // Follow-through: rising out of the squat, slowing down as the legs straighten.
    { kind: "follow", seconds: 0.45, pose: onFeet(withPose(STAND, { lean: 16, head: -6, lShoulder: 40, rShoulder: 30, lElbow: 20, rElbow: 22 }), -0.03, 0.36, feet), at: -0.03 },
    // Back up: nearly standing, still rising ("up", the flow point) ...
    { kind: "settle", seconds: 0.26, pose: onFeet(withPose(STAND, { lean: 5, head: -3, lShoulder: 18, rShoulder: 8, lElbow: 16, rElbow: 14 }), -0.01, 0.44, feet), at: -0.01, name: "up" },
    // ... then (only when nothing follows straight away) standing tall and settling into the stand.
    { kind: "settle", seconds: 0.2, pose: withPose(STAND, { lean: -2, head: -2, lShoulder: 10, rShoulder: 0 }), at: 0, recover: true },
    { kind: "settle", seconds: 0.28, pose: STAND, at: 0, recover: true },
  ];
  // The places above are measured from the standing spot; standUp starts from the seated hips.
  return beatsToKeys(start, placeBeats(beats.map((beat) => ({ ...beat, at: (beat.at + origin) * H })), settings), settings);
}

// Sitting still: slow breaths (the chest rises and falls a little), ending back in the seated pose it
// started in. Breathing isn't sped up by the style or speed: it takes exactly `seconds`. Hurt, it breathes
// over its knee, still looking at it, the far hand rubbing it.
function breathe(start: Stance, seconds: number, settings: MoveSettings, hurt?: HurtSpot): MoveOutput {
  if (seconds <= 0) return { keys: [], end: start, marks: {} };
  const breaths = Math.max(1, Math.round(seconds / 3)); // a calm breath takes about 3 seconds
  const feet = groundOf(start.pose).feet;
  const inhale = hurt ? hurtSeated(feet, 21, 0.03) : seated(-7.5, 2, 3, feet);
  const beats: Beat[] = [];
  for (let i = 0; i < breaths; i += 1) {
    beats.push({ kind: "hold", seconds: (0.45 * seconds) / breaths, pose: inhale }, { kind: "hold", seconds: (0.55 * seconds) / breaths, pose: start.pose });
  }
  return beatsToKeys(start, beats, { ...settings, style: "natural", speed: "normal" });
}

// Chain moves: each one starts where the last ended (its first key replaces the last one's final key).
// The chain's flow point is the last part's (e.g. sit = sit down + breathe + stand up: flows when up).
export function chainMoves(start: Stance, parts: ((from: Stance) => MoveOutput)[]): MoveOutput {
  let at = start;
  const keys: CharacterKey[] = [];
  const marks: Record<string, number> = {};
  let flow: MoveOutput["flow"];
  for (const part of parts) {
    const out = part(at);
    let base = keys.length;
    for (const [i, key] of out.keys.entries()) {
      if (keys.length && Math.abs(keys[keys.length - 1].t - key.t) < 1e-6) {
        keys[keys.length - 1] = { ...key };
        if (i === 0) base -= 1;
      } else keys.push(key);
    }
    Object.assign(marks, out.marks);
    flow = out.flow ? { keys: base + out.flow.keys, stance: out.flow.stance } : undefined;
    at = out.end;
  }
  return { keys, end: at, marks, flow };
}

// Sit down on the floor, stay sitting for `seconds` (breathing gently), and stand back up.
// Marks: "seated", "up".
export function sit(start: Stance, params: SitParams, settings: MoveSettings): MoveOutput {
  const seconds = Math.max(0, params.seconds ?? SIT_DEFAULTS.seconds);
  const hurt = hurtOf(params, settings);
  return chainMoves(start, [
    (from) => sitDown(from, params, settings),
    (from) => breathe(from, seconds, settings, hurt),
    // (Hurt, the legs were stretched out: it draws its feet back in under it, ready to get up.)
    (from) => {
      if (!hurt) return { keys: [], end: from, marks: {} };
      return beatsToKeys(from, placeBeats(handOver(from.pose, { kind: "settle", seconds: 0.4, pose: seated(-2, 2, 0), at: 0 }, 0.5), settings), settings);
    },
    (from) => standUp(from, {}, settings),
  ]);
}
