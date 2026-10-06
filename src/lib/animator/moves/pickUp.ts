import type { FrameCharacter, ObjectHand } from "../engine.ts";
import { GRIP, heldCenter } from "../objects.ts";
import { forwardKinematics, translateSkeleton } from "../pose.ts";
import { DEFAULT_STYLE, PROPORTIONS, STAND, withPose, type Facing, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import { amplitudeOf, beatsToKeys, forwardSign, lerpPose, windUp, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { centerOfMass, feetAhead, footAt, fromHere, handAt, HIP_FOLD, hipsOver, onFeet, placeBeats, safePose, type PlacedBeat } from "./squat.ts";
import type { MoveStyle } from "./styles.ts";
import { BALL_RADIUS, HOLD_BALL } from "./throwCatch.ts";

// SPEC-0017 Phase 2b: picking something up off the ground (Arthur, 2026-10-04: "you go down, pick it
// up" — no stopping to stand and look first).
//
// A small weight shift the opposite way (anticipation: chest up and back, arms back a little) -> bend
// down with natural lifting form (hips back, knees bend, back leans forward; the weight stays over the
// feet) while the hand(s) reach for the object on the ground in front (mark "grab": the hands close on
// it) -> a moment to grip it -> rise, the legs driving, bringing it up in front of the knees (mark
// "twoHands": both hands on it from here) to the chest (mark "up": back up, the flow point) -> settle
// holding it at the chest in HOLD_BALL, so a throw can follow. Both feet stay planted the whole time. No
// pose here is drawn by hand for one case: the bend is worked out from where the object is (reach,
// size), the body's balance and the bend limits.
//
// HOLDING (the same as throwCatch.ts): in one hand the object sits just past the hand along the forearm;
// in both hands ("hands") it sits BETWEEN them, the back (r) hand on its near side and the front (l) hand
// on its far side, each one grip from its centre. On the floor the far side is out of reach, so the
// object is TAKEN in one hand's grip (`grabJoint`: with hand "hands", the default, both hands come down
// on its near side together; with "rHand"/"lHand" one hand takes it and the other rests on the knee),
// and on the way up the other hand goes to its far side (mark "twoHands"), where both grips put it in
// exactly the same place. The planner: object on the ground at `grabPoint(...)`; held by
// `grabJoint(params)` from "grab"; held by "hands" from "twoHands".

export type PickUpParams = {
  object?: string; // the object's id (for the planner: who holds what when)
  reach?: number; // px in front of the toes (the front foot) where the object's centre lies on the ground
  hand?: ObjectHand; // "hands" (default), "rHand" or "lHand"
  size?: number; // the object's size (ball diameter / box side), px; default 0.16 x height (a basketball)
  arriving?: boolean; // straight from a walk or run (the planner sets it): the braking was the wind-up
};
export const PICK_UP_DEFAULTS = { reach: 0.25, hand: "hands" as ObjectHand, size: 0.16 }; // reach and size x height

// The pose pickUp ends in: standing, holding the object in both hands at the chest (throwCatch's
// HOLD_BALL, so a throw can start straight from it). For an object of another size, see pickUpEnd.
export const PICK_UP_END: PoseAngles = HOLD_BALL;

// How far each style bends its back (degrees of lean at the bottom; the rest is done with the knees):
// a tired body bends lazily from the back, a heavy or careful (hurt) one squats more and keeps its back
// straighter, an angry one snatches it.
const STYLE_LEAN: Record<MoveStyle, number> = { natural: 52, robot: 48, sneaky: 44, tired: 60, happy: 52, angry: 56, heavy: 46, hurt: 40, sad: 58, irritated: 54 };

const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;
const STRETCH = 0.9; // the reaching arm is this straight at the grab (elbow a little soft)...
const MAX_STRETCH = 0.97; // ...or, for an object at the edge of reach, nearly straight
const LOWEST_HIPS = 0.17; // hips never lower than this above the floor (x height): knees stay in range
// Balance: the body's weight (centre of mass) is kept over the feet: ideally this far in front of the
// middle of the feet (the ball of the foot), never further than the toes.
const WEIGHT = 0.06, MAX_WEIGHT = 0.11;
const CLEAR = 0.025; // the object stays at least this far from the legs (x height)
const LEG = (PROPORTIONS.thigh + PROPORTIONS.shin) * 0.998;

type Feet = { l: number; r: number };
const sideOf = (hand: ObjectHand): "l" | "r" => (hand === "lHand" ? "l" : "r");

// Joints of a pose with its hips at (x, height) (x height, facing right; y UP from the floor).
function jointsAt(pose: PoseAngles, x: number, height: number) {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
  const out = {} as Record<keyof Skeleton, Point>;
  for (const [name, p] of Object.entries(s) as [keyof Skeleton, Point][]) out[name] = { x: x + p.x, y: height - p.y };
  return out;
}

// One hand on the object, its centre exactly at `center`: the engine holds an object in one hand just
// past the hand along the forearm (objects.ts heldCenter), so the hand sits on its surface, GRIP x its
// radius back from the centre along the forearm. With `helper`, the other hand goes on the far side
// (diametrically opposite), so the object is between the hands too: holding it in one hand or in both
// puts it in exactly the same place. `stretch` = how straight the arm(s) are (1 = straight).
function oneHandOn(pose: PoseAngles, x: number, height: number, side: "l" | "r", radius: number, center: Point, helper = false, rounds = 24) {
  const neck = jointsAt(pose, x, height).neck; // (the arms don't move the neck)
  let out = pose, dir = { x: 0.5, y: -0.87 }, stretch = 0; // forearm direction guess: down and forward
  for (let i = 0; i < rounds; i += 1) {
    const target = { x: center.x - dir.x * GRIP * radius, y: center.y - dir.y * GRIP * radius };
    stretch = Math.hypot(target.x - neck.x, target.y - neck.y) / ARM;
    out = handAt(out, side, target.x - neck.x, neck.y - target.y);
    const j = jointsAt(out, x, height);
    const fx = j[`${side}Hand`].x - j[`${side}Elbow`].x, fy = j[`${side}Hand`].y - j[`${side}Elbow`].y;
    const length = Math.hypot(fx, fy) || 1;
    dir = { x: fx / length, y: fy / length };
  }
  if (helper) {
    const far = { x: center.x + dir.x * GRIP * radius, y: center.y + dir.y * GRIP * radius };
    stretch = Math.max(stretch, Math.hypot(far.x - neck.x, far.y - neck.y) / ARM);
    out = handAt(out, side === "l" ? "r" : "l", far.x - neck.x, neck.y - far.y);
  }
  return { pose: out, stretch };
}

// Both hands on the object, on opposite sides of its centre: the back (r) hand at centre - axis x grip,
// the front (l) hand at centre + axis x grip (axis in degrees: 90 = forward, 180 = up; `spread` > 1
// opens the hands wider, before they close on it). The engine holds it exactly midway between them.
function handsOn(pose: PoseAngles, x: number, height: number, radius: number, center: Point, axis: number, spread = 1) {
  const neck = jointsAt(pose, x, height).neck;
  const d = { x: Math.sin((axis * Math.PI) / 180), y: -Math.cos((axis * Math.PI) / 180) }; // (y up)
  const g = GRIP * radius * spread;
  const back = { x: center.x - d.x * g, y: center.y - d.y * g }, front = { x: center.x + d.x * g, y: center.y + d.y * g };
  const out = handAt(handAt(pose, "r", back.x - neck.x, neck.y - back.y), "l", front.x - neck.x, neck.y - front.y);
  return { pose: out, stretch: Math.max(Math.hypot(back.x - neck.x, back.y - neck.y), Math.hypot(front.x - neck.x, front.y - neck.y)) / ARM };
}

// The joint that holds the object from the "grab" mark until "twoHands" (then: "hands").
export const grabJoint = (params: PickUpParams): "lHand" | "rHand" => (params.hand === "lHand" ? "lHand" : "rHand");

// Taking it: the grabbing hand on the object (one grip from its centre, the forearm pointing at it);
// for a two-handed grab the other hand comes down beside it (the same arm angles).
function grabWith(pose: PoseAngles, x: number, height: number, hand: ObjectHand, radius: number, center: Point, rounds = 24) {
  const side = sideOf(hand);
  const one = oneHandOn(pose, x, height, side, radius, center, false, rounds);
  if (hand !== "hands") return one;
  const other = side === "l" ? "r" : "l";
  return { ...one, pose: { ...one.pose, [`${other}Shoulder`]: one.pose[`${side}Shoulder`], [`${other}Elbow`]: one.pose[`${side}Elbow`] } as PoseAngles };
}

// The body's weight in front of the middle of the feet (x height).
const weightAhead = (pose: PoseAngles, x: number, feet: Feet) => x + centerOfMass(pose) - (feet.l + feet.r) / 2;

// Halving search for where `f` (growing with x) reaches `target`, between lo and hi.
function solve(lo: number, hi: number, target: number, f: (x: number) => number, rounds = 26) {
  for (let i = 0; i < rounds; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > target) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Hips placed (x) so the weight is over the feet (WEIGHT ahead of their middle), for a body at hip height
// `height`; `arms` sets the arms for each try (they shift the weight too). Legs bend to the planted feet.
function balanced(base: PoseAngles, feet: Feet, height: number, arms: (pose: PoseAngles, x: number) => PoseAngles) {
  const at = (x: number) => safePose(arms(safePose(onFeet(base, feet, x, height)), x));
  const x = solve(Math.min(feet.l, feet.r) - 0.35, Math.max(feet.l, feet.r) + 0.1, WEIGHT, (x) => weightAhead(at(x), x, feet));
  return { x, pose: at(x) };
}

// Nearest distance from a point to a bone (segment a-b).
function toSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}
// How far the object at `center` is from the legs (thighs and shins) of a pose with its hips at (x, height).
function legClearance(pose: PoseAngles, x: number, height: number, center: Point, radius: number) {
  const j = jointsAt(pose, x, height);
  return Math.min(...([["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]] as const).map(([a, b]) => toSegment(center, j[a], j[b]))) - radius;
}

type Bend = { pose: PoseAngles; x: number; height: number; center: Point; stretch: number };

// One try at the bottom of the pick-up for a lean and hip height: legs on the planted feet (null if they
// can't reach them or the hips would fold past their limit), the hips back as far as balance allows
// (moved forward only if the hips would fold too far), the reaching arm(s) on the object, and the free
// hand (one-handed) resting on the front thigh just above the knee.
function bendAt(start: PoseAngles, feet: Feet, center: Point, radius: number, hand: ObjectHand, lean: number, height: number): Bend | null {
  const base = withPose(start, { lean, head: -12 });
  const legs = (x: number) => {
    if (Math.hypot(feet.l - x, height) > LEG || Math.hypot(feet.r - x, height) > LEG) return null;
    const p = footAt(footAt(base, "l", feet.l - x, height), "r", feet.r - x, height);
    return Math.max(p.lHip, p.rHip) > HIP_FOLD || Math.max(p.lKnee, p.rKnee) > 148 ? null : p;
  };
  const free = hand === "hands" ? null : sideOf(hand) === "l" ? "r" : "l";
  const front = feet.l >= feet.r ? "l" : "r";
  const dressed = (p: PoseAngles, x: number) => {
    const reached = grabWith(p, x, height, hand, radius, center, 4);
    let out = reached.pose;
    if (free) {
      const j = jointsAt(out, x, height);
      const knee = j[`${front}Knee`];
      const on = { x: knee.x + (j.hip.x - knee.x) * 0.15, y: knee.y + (j.hip.y - knee.y) * 0.15 + 0.012 };
      out = handAt(out, free, on.x - j.neck.x, j.neck.y - on.y);
    }
    return { pose: out, stretch: reached.stretch };
  };
  // Balance first (legs as they'd be, even if folded too far), then forward if the hips fold too far.
  const raw = (x: number) => footAt(footAt(base, "l", feet.l - x, height), "r", feet.r - x, height);
  let x = solve(Math.min(feet.l, feet.r) - LEG + 0.01, Math.max(feet.l, feet.r) + 0.1, WEIGHT, (x) => weightAhead(dressed(raw(x), x).pose, x, feet));
  for (let i = 0; i < 80 && !legs(x); i += 1) x += 0.005;
  const placed = legs(x);
  if (!placed) return null;
  const { pose, stretch } = dressed(placed, x);
  if (weightAhead(pose, x, feet) > MAX_WEIGHT) return null;
  const exact = grabWith(pose, x, height, hand, radius, center); // (the grabbing arm exactly on it)
  return { pose: safePose(exact.pose), x, height, center, stretch: Math.max(stretch, exact.stretch) };
}

// The bottom of the pick-up: natural lifting form (hips back, knees bent, back leaning forward about as
// far as the style leans), the weight over the feet, the hand(s) on the object (its centre at `center`).
// The hips go only as low as they must for the arm to reach with the elbow a little soft. If the style's
// lean can't reach it, the nearest lean that can is used. Null: out of reach without stepping.
function bendTo(start: PoseAngles, feet: Feet, center: Point, radius: number, hand: ObjectHand, lean: number): Bend | null {
  const s0 = jointsAt(start, 0, 0);
  const top = Math.min(-Math.min(s0.lFoot.y, s0.rFoot.y) - 0.01, LEG - 0.01);
  for (const tilt of [0, 4, -4, 8, -8, 12, -12, 16]) {
    const l = Math.min(62, Math.max(28, lean + tilt));
    const at = (h: number) => bendAt(start, feet, center, radius, hand, l, h);
    // Highest hips that still reach (the arm STRETCH straight): come down from standing height...
    let above = top, found: Bend | null = null, closest: Bend | null = null;
    for (let h = top; h >= LOWEST_HIPS - 1e-9; h -= 0.01) {
      const b = at(h);
      if (b && (!closest || b.stretch < closest.stretch)) closest = b;
      if (b && b.stretch <= STRETCH) { found = b; break; }
      above = h;
    }
    if (found) {
      // ...then pin it down between the last height that didn't reach and the first that did.
      let lo = found.height, hi = above;
      for (let i = 0; i < 14; i += 1) {
        const mid = (lo + hi) / 2, b = at(mid);
        if (b && b.stretch <= STRETCH) { lo = mid; found = b; } else hi = mid;
      }
      return found;
    }
    if (closest && closest.stretch <= MAX_STRETCH) return closest;
  }
  return null;
}

// The object's place on the ground and the bend that reaches it. The object is moved from `reach` only
// if it must be: out to where it doesn't touch the legs, or in to where the body can reach it without
// stepping (about 0.3 x height in front of the toes for a basketball).
// (Worked out once per start pose, object, hand, style and height: pickUp and grabPoint share it.)
const PLANS = new Map<string, ReturnType<typeof makeGrabPlan>>();
function grabPlan(start: PoseAngles, feet: Feet, params: PickUpParams, settings: MoveSettings) {
  const key = JSON.stringify([start, feet, params.reach, params.size, params.hand, settings.style, settings.height]);
  let plan = PLANS.get(key);
  if (!plan) {
    if (PLANS.size > 500) PLANS.clear();
    PLANS.set(key, (plan = makeGrabPlan(start, feet, params, settings)));
  }
  return plan;
}
function makeGrabPlan(start: PoseAngles, feet: Feet, params: PickUpParams, settings: MoveSettings) {
  const H = settings.height;
  const radius = Math.max(0.01, (params.size ?? PICK_UP_DEFAULTS.size * H) / 2 / H);
  const hand = params.hand ?? PICK_UP_DEFAULTS.hand;
  const lean = STYLE_LEAN[settings.style];
  const toe = Math.max(feet.l, feet.r);
  const want = Math.max(radius + 0.01, (params.reach ?? PICK_UP_DEFAULTS.reach * H) / H);
  const bendFor = (reach: number) => bendTo(start, feet, { x: toe + reach, y: radius }, radius, hand, lean);
  const clear = (b: Bend | null) => b !== null && legClearance(b.pose, b.x, b.height, b.center, radius) >= CLEAR;
  let reach = want, bend = bendFor(want);
  if (bend && !clear(bend)) {
    // Too close: it would touch the legs. Move it out just far enough.
    let lo = want, hi = want + 0.25;
    for (let i = 0; i < 14; i += 1) { const mid = (lo + hi) / 2; if (clear(bendFor(mid))) hi = mid; else lo = mid; }
    reach = hi; bend = bendFor(hi);
  }
  if (!bend) {
    // Too far: bring it in to the farthest spot the body can reach.
    let lo = radius + 0.01, hi = want;
    for (let i = 0; i < 14; i += 1) { const mid = (lo + hi) / 2; if (bendFor(mid)) lo = mid; else hi = mid; }
    reach = lo; bend = bendFor(lo);
  }
  if (!bend) throw new Error("pickUp: the object can't be reached");

  // Rising with it: half way up, the object comes up in front of the knees (never through them), the
  // back straightening as the legs drive, both hands on it (a one-handed grab brings the other hand to
  // its far side here: "twoHands"); then back up, nearly standing, the object at the chest.
  const s0 = jointsAt(start, 0, 0);
  const standHeight = -Math.min(s0.lFoot.y, s0.rFoot.y, s0.lKnee.y, s0.rKnee.y); // (y up: the lowest point)
  const liftHeight = bend.height + 0.5 * (standHeight - bend.height);
  const liftBase = withPose(bend.pose, { lean: 0.55 * bend.pose.lean, head: -8 });
  const lifted = balanced(liftBase, feet, liftHeight, (pose, x) => {
    const j = jointsAt(pose, x, liftHeight);
    const knee = j.lKnee.x >= j.rKnee.x ? j.lKnee : j.rKnee;
    return oneHandOn(pose, x, liftHeight, sideOf(hand), radius, { x: knee.x + radius + CLEAR + 0.03, y: knee.y + 0.03 }, true).pose;
  });
  // Back up: the object at the chest, a little lower and closer in than HOLD_BALL (still coming up).
  const up = balanced(withPose(STAND, { lean: 5, head: -2 }), feet, standHeight - 0.012, (pose, x) => {
    const neck = jointsAt(pose, x, standHeight - 0.012).neck;
    return handsOn(pose, x, standHeight - 0.012, radius, { x: neck.x + HOLD_GRIP.center.x - 0.01, y: neck.y + HOLD_GRIP.center.y - 0.02 }, HOLD_GRIP.axis - 5).pose;
  });
  return { bend, radius, hand, reach, lifted, up };
}

// HOLD_BALL's grip, measured from it (the ball's centre from the neck, and the back-to-front hand axis),
// so an object of another size is held at the chest the same way.
const HOLD_GRIP = (() => {
  const j = jointsAt(HOLD_BALL, 0, 0);
  const center = { x: (j.lHand.x + j.rHand.x) / 2 - j.neck.x, y: (j.lHand.y + j.rHand.y) / 2 - j.neck.y };
  const axis = (Math.atan2(j.lHand.x - j.rHand.x, -(j.lHand.y - j.rHand.y)) * 180) / Math.PI;
  return { center, axis };
})();
// The pose pickUp ends in for this object: PICK_UP_END (= HOLD_BALL) for a basketball-sized object, else
// the same hold with the hands one grip from the centre of this object.
export function pickUpEnd(params: PickUpParams, height: number): PoseAngles {
  const radius = (params.size ?? PICK_UP_DEFAULTS.size * height) / 2 / height;
  if (Math.abs(radius - BALL_RADIUS) < 1e-9) return PICK_UP_END;
  const neck = jointsAt(HOLD_BALL, 0, 0).neck;
  return safePose(handsOn(HOLD_BALL, 0, 0, radius, { x: neck.x + HOLD_GRIP.center.x, y: neck.y + HOLD_GRIP.center.y }, HOLD_GRIP.axis).pose);
}

// Pick an object up off the ground in front. Marks: "grab" (the hand(s) on it, gripping: held by grabJoint),
// "twoHands" (held in both hands from here), "up" (back up holding it: the flow point). Ends standing in
// pickUpEnd(params) (= PICK_UP_END, HOLD_BALL, for a basketball), holding it at the chest. Side view.
export function pickUp(start: Stance, params: PickUpParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const s0 = jointsAt(start.pose, 0, 0);
  const { bend, lifted, up } = grabPlan(start.pose, { l: s0.lFoot.x, r: s0.rFoot.x }, params, settings);
  const end = pickUpEnd(params, H);
  const feet = feetAhead(start.pose) * H;
  // On the way from half up to back up, keeping the arms exactly as they hold it at half way up.
  const carry = (k: number) => withPose(lerpPose(lifted.pose, up.pose, k), { lShoulder: lifted.pose.lShoulder, rShoulder: lifted.pose.rShoulder, lElbow: lifted.pose.lElbow, rElbow: lifted.pose.rElbow });
  const lerpX = (k: number) => hipsOver(feet, carry(k), H);

  // Anticipation, the engine's rule: a small weight shift the opposite way of bending down (chest up and
  // back, arms a little back) — small and quick, so it flows straight into going down.
  const ready = windUp(start.pose, bend.pose, 0.1 * amplitudeOf(settings), { lean: 0.15 });
  // Most of the way down (the bend goes on smoothly through it).
  const reaching = lerpPose(ready, bend.pose, 0.6);
  // (Quicker when it starts part of the way down already, e.g. from a landing crouch.)
  const down = fromHere(1, start.pose, bend.pose, 0.5);
  const placed: PlacedBeat[] = [
    // (Arriving from a walk or run, the braking steps were the wind-up: it goes straight down.)
    ...(params.arriving ? [] : [{ kind: "anticipation" as const, seconds: 0.22 * down, pose: ready, at: hipsOver(feet, ready, H) }]),
    // Bending down and reaching: speeds up and slows into the touch.
    { kind: "action", seconds: 0.34 * down, pose: reaching, at: hipsOver(feet, reaching, H), ease: "smooth" },
    { kind: "action", seconds: 0.21 * down, pose: bend.pose, at: bend.x * H, ease: "smooth" },
    // Gripping it, a moment, hands still ("grab" in the middle of it: the hand is on it a little before
    // and after, so an object picked up on the nearest frame never jumps).
    { kind: "hold", seconds: 0.05, pose: bend.pose, at: bend.x * H, name: "grab" },
    { kind: "hold", seconds: 0.05, pose: bend.pose, at: bend.x * H },
    // Rising: the legs drive, speeding up out of the bottom; then slowing into standing.
    { kind: "action", seconds: 0.26, pose: lifted.pose, at: lifted.x * H, ease: "smooth" },
    // Both hands on it: for a moment the arms keep this hold while the body goes on rising ("twoHands" in
    // the middle of it: one hand's grip and both hands' put the object in the same place all through
    // it, so switching on the nearest frame never moves it).
    { kind: "settle", seconds: 0.06, pose: carry(0.12), at: lerpX(0.12), name: "twoHands" },
    { kind: "settle", seconds: 0.06, pose: carry(0.24), at: lerpX(0.24) },
    { kind: "settle", seconds: 0.24, pose: up.pose, at: up.x * H, name: "up" },
    // (Only when nothing follows straight away.)
    { kind: "settle", seconds: 0.3, pose: end, at: hipsOver(feet, end, H), recover: true },
  ];
  return beatsToKeys(start, placeBeats(placed, settings), settings);
}

// Where the object's centre must be on the stage (resting on the ground: y = groundY - size / 2) for a
// pickUp with these settings, so the hand(s) take it exactly at the "grab" mark. The planner puts the
// object there; it may be nudged from `reach` if the body can't reach that spot without stepping, or the
// object would touch the legs.
export function grabPoint(start: Stance, params: PickUpParams, settings: MoveSettings, groundY: number): Point {
  const H = settings.height;
  const s0 = jointsAt(start.pose, 0, 0);
  const { bend } = grabPlan(start.pose, { l: s0.lFoot.x, r: s0.rFoot.x }, params, settings);
  // (The bend is measured from the start hips, forward +, and up from the floor.)
  return { x: start.x + forwardSign(start.facing) * bend.center.x * H, y: groundY - bend.center.y * H };
}

// Where a pose's hand(s) hold an object (its centre) on the stage, the way the engine draws it.
export function heldPoint(pose: PoseAngles, facing: Facing, hipX: number, height: number, groundY: number, hand: ObjectHand, size: number): Point {
  const body = forwardKinematics(pose, facing, { x: hipX, y: 0 }, height, "normal", false);
  const lowest = Math.max(body.lFoot.y, body.rFoot.y, body.lKnee.y, body.rKnee.y);
  const skeleton = translateSkeleton(body, 0, groundY - lowest);
  const character: FrameCharacter = { id: "", skeleton, style: DEFAULT_STYLE, headRadius: 0, facing };
  return heldCenter(character, hand, size / 2);
}
