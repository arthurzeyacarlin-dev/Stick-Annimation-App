import { buildScene, type CharacterKey } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { DEFAULT_STYLE, HEAD_RADIUS, PROPORTIONS, STAND, withPose, type Facing, type PoseAngles, type Point, type Skeleton } from "../rig.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { beatSeconds, forwardSign, lerpPose } from "./motion.ts";
import { armFromWorld, feetOf, placedBeatsToKeys, plantedLegs, STAND_HIP, windKind, type PlacedBeat } from "./punch.ts";
import { keepLying, otherBody, isDown, type Other } from "./grapple.ts";
import { handAt, safePose } from "./squat.ts";
import { GRAVITY } from "../objectMoves.ts";
import { hipHeight } from "./fall.ts";

// SPEC-0017 Phase 2 round 12: LIFT AND SLAM (Arthur: "Red went over, grabbed his waist or his spine, lifted
// him up, and slammed him on the ground hard"). A two-figure ground attack on someone lying on the back:
// the attacker bends down over the body, both hands grab the waist, straightens up lifting it off the floor
// (held up in front of the chest, upright, legs dangling), a short wind-up higher, then SLAMS it down hard
// onto its back in front of him, follows through bent over, lets go and stands. Rules:
// - THE HELD BODY GOES WHERE THE HANDS ARE: from the grab to the slam, the lifted body's hips are exactly
//   at the attacker's hands at every moment (worked out from the attacker's real keys, never guessed); it
//   never goes into the floor (the higher it is held, the more upright it hangs) or into the attacker.
// - THE SLAM IS A HARD FALL: the body lands flat on its back as it lay, jolts (legs up, shoulders curl) and
//   slams back down, then lies there hurt.
// Poses are facing-relative and in body heights (x height): forward = +x, y grows downward, floor at 0.

const HEAD_R = HEAD_RADIUS.normal;
const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const flip = (f: Facing): Facing => (f === "left" ? "right" : "left");
const RAD = Math.PI / 180;

// Where the hand grabs: the nearest foot (ankle) of the body lying there.
export function liftGrabSpot(o: Other): Point {
  const s = otherBody(o);
  return s.lFoot.x <= s.rFoot.x ? { ...s.lFoot } : { ...s.rFoot };
}
// The hips stand this far behind the foot they grab (x height): bent right over it.
export const LIFT_REACH = 0.3;
// Where the hips should go (forward of here, x height) / where the front foot lands, to grab `o`.
export const liftApproach = (_start: PoseAngles, o: Other) => liftGrabSpot(o).x - LIFT_REACH;
export const liftStandAt = (o: Other) => liftGrabSpot(o).x - LIFT_REACH + 0.12;

export type LiftSlamParams = { other?: Other; size?: number };

// THE SWING (Arthur: "like a baseball bat you swing"): seconds for the arm to go from forward-low up over
// the head, and from over the head down to the slam. HEAVY (Arthur: "a human weighs 100 pounds ... he
// needs to basically DROP him, but still hold him"): the heave starts slow and gathers speed, never stops
// at the top (no holding him up), and GRAVITY DOES THE SLAM: the way down is short and keeps speeding up.
// (Up to the top, never so fast that the swung body's head, far out from the shoulder, jumps too far
// between pictures.)
// PACING (Arthur: "lift him up slowly, but not too slow — like a JOGGING pace ... then FASTER than running
// fast — he's heavy, he literally wants to let go").
// FAST (Arthur, round 15-16: "twice as fast when he's lifting him up"; the slam at the old speed looked
// "like on the moon ... you gotta hit and slam hard, from the weight"): a short grip beat, a quick haul and
// up-swing, then the slam. EARTH GRAVITY (Arthur, round 16: "Right when it's at the top, right when it starts
// falling down, it should accelerate fast until he's almost at the bottom ... We're not on moon gravity"):
// HEAVY THINGS SPEED UP FAST (round 16: "acceleration needs to go fast ... when he's getting closer and closer
// to the ground, that's when he needs to be at top speed"): NO STOP AT THE TOP — the up-swing flows straight
// into the slam at the speed it had (momentum), already speeding up as it goes over; top speed comes within
// 1/12 s and is held from high up all the way down into the impact. Top to impact in 3/12 s (at 12 fps: one
// big gap, then two bigger equal ones). That is a FAST SPAN (engine.ts
// fastSpans): the far end of the swung body crosses big gaps between pictures; the rest keeps the joint-step
// rule. YANKED DOWN with it (knees deep, torso pitched forward), so the hand gets low without the arm
// going round so far: grab to impact the arm turns under 300 degrees (the windmill rule) though it takes
// barely more than a second.
const GRIP_SECONDS = 0.2; // a beat with the grip set before the fast haul
const SLAM_ACCEL = 1 / 12; // seconds it speeds up from the top (from the up-swing's speed) to top speed, held to the impact
const UP_SECONDS = 0.6;
const GRID = 12; // pictures a second the top and the impact are lined up with
const SLAM_TICKS = 3; // the slam lasts this many twelfths of a second
const HAUL_SECONDS = 0.25; // THE HAUL IS A STRAIN: quick but heavy, knees bent, leaning back against the load
const STEP = 1 / 48;
const START_ANGLE = -35; // degrees above forward-horizontal where the swing starts (hand at the waist)
const SLAM_HAND = 0.26; // x height: how high the hand holds the foot when the body hits the floor
// Yanked down at the impact: torso pitched this far forward (degrees), hips this much lower (x height), the
// arm straight (share of its full length).
const END_LEAN = 82, END_DROP = 0.24, R_END = 0.99;

// LIFT AND SLAM (attacker). Marks `grab` (hand on the ankle), `lift` (legs hauled up, back still on the
// floor), `heave` (pulled in close, the hand by his head), `windup` (the body high overhead: he turns round), `slam` = `stomp` (the body hits the floor;
// also "<id>.groundHit<k>"), `release` (lets go), `up`; `fastFrom`/`fastTo` = the top and the impact (the
// slam's fast span). Ends facing the other way (he turned round).
export function liftSlam(start: Stance, params: LiftSlamParams, settings: MoveSettings): MoveOutput {
  const h = settings.height;
  const facing0: Facing = start.facing === "front" ? "right" : start.facing;
  const way = forwardSign(facing0);
  const feet = feetOf(start.pose);
  const lo = Math.min(feet.l, feet.r), hi = Math.max(feet.l, feet.r);
  const mid = (lo + hi) / 2;
  const o = params.other && isDown(params.other) ? params.other : undefined;
  const grab = o ? liftGrabSpot(o) : { x: hi + LIFT_REACH - 0.1, y: -0.02 };
  // A pose on the planted feet (x in the ORIGINAL facing frame; `turned` = facing the other way), hips
  // `at` and `hipH` up, the right hand at `hand` (or at `angle`/`r` from the neck), the left arm loose (w).
  const posed = (turned: boolean, lean: number, at: number, hipH: number, w: number, hand: Point | { angle: number; r: number }, free = { upper: 25 * w, fore: 50 * w }) => {
    const sx = turned ? -1 : 1;
    let pose = plantedLegs(withPose(STAND, { lean, head: -8 * w, ...armFromWorld(lean, "l", free) }), { l: sx * feet.l, r: sx * feet.r }, sx * at, STAND_HIP - hipH);
    const neck = forwardKinematics(pose, "right", { x: sx * at, y: -hipH }, 1, "normal", false).neck;
    const world = "angle" in hand ? { x: sx * neck.x + hand.r * Math.cos(hand.angle * RAD), y: neck.y - hand.r * Math.sin(hand.angle * RAD) } : hand;
    pose = handAt(pose, "r", sx * world.x - neck.x, world.y - neck.y);
    return { pose: safePose(pose), hand: world };
  };
  // Bent right over a spot on the floor: the shallowest squat that reaches it.
  const over = (spot: Point) => {
    let best: { lean: number; at: number; hipH: number; score: number } | undefined;
    for (let lean = 40; lean <= 85; lean += 5) for (let drop = 0.04; drop <= 0.3; drop += 0.02) {
      const hipH = STAND_HIP - drop;
      const at = clamp(spot.x - LIFT_REACH, lo - 0.04, hi + 0.04);
      const neck = { x: at + PROPORTIONS.torso * Math.sin(lean * RAD), y: -hipH - PROPORTIONS.torso * Math.cos(lean * RAD) };
      const d = Math.hypot(spot.x - neck.x, spot.y - neck.y);
      const score = (d <= ARM * 0.97 ? 0 : 10 + d) + 2 * drop + Math.abs(lean - 65) / 100;
      if (!best || score < best.score) best = { lean, at, hipH, score };
    }
    return best!;
  };
  const tall = STAND_HIP - 0.02;
  const R = ARM * 0.95;
  const R_TOP = 0.1; // x height: neck to hand when pulled in (elbow folded, the hand by the head)
  const HEAVE = 67; // degrees above forward where the hand is pulled in closest
  // 1. Bending down over the foot; 2. the hand on the ankle; 3. HAULED: standing up, the legs pulled up
  // to his waist (the back still on the floor).
  const g = over(grab);
  const reach = posed(false, g.lean, g.at, g.hipH + 0.02, 1, { x: grab.x, y: grab.y - 0.06 }).pose;
  const grabbed = posed(false, g.lean, g.at, g.hipH, 1, grab).pose;
  // 5./6. Where the slam ends: the hand SLAM_HAND up, as far down the arc as the bent-over neck allows.
  const bent = posed(true, END_LEAN, mid, tall - END_DROP, 1, { angle: 180, r: R_END * ARM }, { upper: 60, fore: 80 });
  const neckH = -forwardKinematics(bent.pose, "right", { x: -mid, y: -(tall - END_DROP) }, 1, "normal", false).neck.y;
  const endAngle = 180 + Math.asin(clamp((neckH - SLAM_HAND) / (R_END * ARM), -0.3, 1)) / RAD;
  const swingAt = (theta: number, turned: boolean) => {
    // Leaning back as the arm goes up over the head (he turns round there), bending into the slam after.
    const u = turned ? clamp((theta - 90) / (endAngle - 90), 0, 1) : clamp((theta - START_ANGLE) / (90 - START_ANGLE), 0, 1);
    // (Heavy: leaning back against the load with the knees bent on the way up, straightening as he heaves;
    // PULLED DOWN WITH IT on the way down, bending at the knees and hips as the body hits.)
    const lean = turned ? 18 + (END_LEAN - 18) * u : -8 - 10 * u;
    const hipH = turned ? tall - END_DROP * u : tall - 0.1 * (1 - u);
    const w = turned ? u : 1 - u;
    // PULLED IN CLOSE (heavy: no holding him up at arm's length): on the way up the elbow folds and the
    // hand passes right by the head, so the arm never loops round the outside of it; it is straight again
    // right overhead, where he turns round (a folded arm can't turn round without its elbow jumping).
    const near = clamp(1 - (Math.abs(theta - HEAVE) - 5) / 18, 0, 1);
    const r0 = turned ? R + (R_END * ARM - R) * u : R;
    const r = r0 - (r0 - R_TOP) * near * near * (3 - 2 * near);
    // (Yanked down low, the free arm swings out forward with the slam, clear of the floor.)
    return posed(turned, lean, mid, hipH, w, { angle: theta, r }, turned ? { upper: 25 + 35 * u, fore: 50 + 30 * u } : undefined);
  };
  const hauled = swingAt(START_ANGLE, false).pose;
  const first = placedBeatsToKeys(start, [
    { kind: windKind(settings), pose: reach, seconds: 0.4, at: g.at },
    { kind: "action", ease: "smooth", pose: grabbed, seconds: 0.12, at: g.at, name: "grab" },
    { kind: "hold", pose: grabbed, seconds: GRIP_SECONDS, at: g.at },
    { kind: "action", ease: "smooth", pose: hauled, seconds: HAUL_SECONDS, at: mid, name: "lift" },
  ], settings);
  const keys = first.keys.slice();
  const key = (t: number, turned: boolean, pose: PoseAngles): CharacterKey => ({ t, pose, x: start.x + way * mid * h, lift: 0, contacts: ["lFoot", "rFoot"], facing: turned ? flip(facing0) : facing0, ease: "linear", xEase: "linear", liftEase: "linear" });
  // 4. THE SWING UP: the arm sweeps from the waist up over the head, the body flying up off the floor.
  // (THE TOP AND THE IMPACT ON THE PICTURE GRID: the top is moved (a hair) onto a 1/12 s tick and the slam
  // lasts a whole number of twelfths, so at 12 and 24 fps a picture shows the very top and the very impact.)
  const tLift = first.end.t;
  const tTop = Math.max(tLift + 0.2, Math.round((tLift + UP_SECONDS) * GRID) / GRID);
  const upSeconds = tTop - tLift;
  const tSlam = (Math.round(tTop * GRID) + SLAM_TICKS) / GRID;
  const slamSeconds = tSlam - tTop;
  const nUp = Math.ceil(upSeconds / STEP);
  const UP_EASE = 1.0; // (one steady sweep up — an easing-in would make the top too fast for the body rules)
  for (let i = 1; i <= nUp; i += 1) keys.push(key(tLift + (upSeconds * i) / nUp, false, swingAt(START_ANGLE + (90 - START_ANGLE) * (i / nUp) ** UP_EASE, false).pose));
  keys[keys.length - 1] = { ...keys[keys.length - 1], t: tTop };
  const tHeave = tLift + upSeconds * ((HEAVE - START_ANGLE) / (90 - START_ANGLE)) ** (1 / UP_EASE);
  // 5. HE TURNS ROUND (facing the other way, the body overhead), and 6. SLAMS it down in front of him.
  const nDown = Math.ceil(slamSeconds / STEP);
  // (The speed is the speed you SEE: measured along the path of the swung body's head — the leg out along
  // the arm, the torso bowing back from it as it leaves the top (slammed's BOW) — so its steps really grow,
  // then really stay the same.)
  const LEG_LEN = 0.45, TORSO_LEN = 0.35;
  const arc = [{ theta: 90, len: 0 }];
  let prevEnd: Point | undefined;
  for (let j = 0; j <= 120; j += 1) {
    const theta = 90 + ((endAngle - 90) * j) / 120;
    const hd = swingAt(theta, true).hand;
    const bow = theta + BOW * clamp((theta - 90) / 30, 0, 1);
    const p = { x: hd.x + LEG_LEN * Math.cos(theta * RAD) + TORSO_LEN * Math.cos(bow * RAD), y: hd.y - LEG_LEN * Math.sin(theta * RAD) - TORSO_LEN * Math.sin(bow * RAD) };
    if (prevEnd) arc.push({ theta, len: arc[arc.length - 1].len + Math.hypot(p.x - prevEnd.x, p.y - prevEnd.y) });
    prevEnd = p;
  }
  const thetaAlong = (f: number) => {
    const want = f * arc[arc.length - 1].len;
    const j = Math.max(1, arc.findIndex((a) => a.len >= want - 1e-12));
    const a = arc[j - 1], b = arc[j];
    return a.theta + (b.theta - a.theta) * clamp((want - a.len) / Math.max(1e-12, b.len - a.len), 0, 1);
  };
  // (Speeds along the head's path, x height a second: over the top at the up-swing's own speed, then top speed.)
  const total = arc[arc.length - 1].len;
  const v0 = ((90 - START_ANGLE) / upSeconds) * (arc[1].len / (arc[1].theta - 90));
  const vTop = Math.max(v0, (total - (SLAM_ACCEL * v0) / 2) / (slamSeconds - SLAM_ACCEL / 2));
  const along = (t: number) => { const a = Math.min(t, SLAM_ACCEL); return v0 * a + ((vTop - v0) * a * a) / (2 * SLAM_ACCEL) + vTop * Math.max(0, t - SLAM_ACCEL); };
  for (let i = 0; i <= nDown; i += 1) {
    // HEAVY THINGS SPEED UP FAST: it goes over the top at the up-swing's speed (no stop), speeds up for
    // SLAM_ACCEL seconds, then holds top speed into the floor; the whole slam is a FAST SPAN (see below).
    const theta = thetaAlong(along((slamSeconds * i) / nDown) / total);
    const k = swingAt(theta, true);
    keys.push(key(i === nDown ? tSlam : tTop + (slamSeconds * i) / nDown + (i === 0 ? 1e-3 : 0), true, k.pose));
  }
  // 7. THE WEIGHT CARRIES THROUGH (Arthur, round 16: "he just stays at this squatting pose for three frames.
  // No. From all that weight, he should move a little"; "a little left, right, stop" — never a squat
  // bounce): never frozen in the crouch, he SWAYS with the weight, as if it pulls him, not on purpose: the
  // hips and torso sway FORWARD (toward where the body landed), then BACK about 3x less, then still, the
  // feet planted and the hips at the same height (the knees only give a little), the arms swinging along
  // a beat behind. Then he lets go and stands (facing the way he turned). In REAL seconds, whatever the mood
  // (gravity is the same for everyone).
  const last = keys[keys.length - 1].pose;
  // (In this deep crouch the hips can't go back of where they hit without rising, so he settles a little
  // forward of there: forward to the peak, back to where he hit (a third of the peak, back of where he
  // settles), then still. x height the hips are set forward of the feet; the legs give only part of it.)
  const SWAY = 0.09, SWAY_REST = 0.045;
  const sway = (d: number, k: number, lower = 0) => posed(true, END_LEAN + 3 * k, mid - d, tall - END_DROP - lower, 1, { angle: endAngle + 4 * k, r: R_END * ARM }, { upper: 60 + 8 * k, fore: 80 + 10 * k }).pose;
  const swayOn = sway(SWAY, 1, -0.004), swayBack = sway(0, -1 / 3), still = sway(SWAY_REST, 0.25);
  // THE JOLT (round 16: "it just looks stiff ... something has to happen to the red stick figure"): the
  // instant the body hits, the jolt pops him up a little (hips and chest lift, the arms recoil up), for a
  // picture or two at 12 fps, then he drops back into the sway. Feet planted.
  const POP = 0.025; // x height the hips pop up with the jolt (barely: "just enough so that it looks natural")
  const pop = posed(true, END_LEAN - 5, mid - 0.03, tall - END_DROP + POP, 1, { angle: endAngle - 7, r: R_END * ARM }, { upper: 74, fore: 96 }).pose;
  const real = (kind: "action" | "settle", seconds: number) => (seconds * seconds) / Math.max(1e-3, beatSeconds(kind, seconds, settings));
  const off = safePose(plantedLegs(withPose(STAND, { lean: 30, head: -10, ...armFromWorld(30, "l", { upper: 30, fore: 40 }), ...armFromWorld(30, "r", { upper: 55, fore: 50 }) }), { l: -feet.l, r: -feet.r }, -mid, 0.08));
  const end = safePose(plantedLegs(withPose(STAND, { lean: 0, head: 0 }), { l: -feet.l, r: -feet.r }, -mid, 0.01));
  const after = placedBeatsToKeys({ t: tSlam, x: start.x + way * mid * h, facing: flip(facing0), pose: last }, [
    { kind: "action", ease: "out", pose: pop, seconds: real("action", 0.07), at: 0 },
    { kind: "action", ease: "out", pose: swayOn, seconds: real("action", 0.15), at: SWAY },
    { kind: "settle", pose: swayBack, seconds: real("settle", 0.16), at: 0 },
    { kind: "settle", pose: still, seconds: real("settle", 0.14), at: SWAY_REST },
    { kind: "settle", pose: off, seconds: 0.3, at: 0, name: "release" },
    { kind: "settle", pose: end, seconds: 0.4, at: 0, name: "up" },
  ], settings);
  for (const k of after.keys.slice(1)) keys.push({ ...k, facing: flip(facing0) });
  return {
    keys,
    end: { ...after.end, facing: flip(facing0) },
    // (FAST SPAN, engine.ts fastSpans: from the top to the impact it moves far between pictures.)
    marks: { ...first.marks, heave: tHeave, windup: tTop, fastFrom: tTop, slam: tSlam, stomp: tSlam, fastTo: tSlam, release: after.marks.release, up: after.marks.up },
  };
}

// ---- SLAMMED (the one swung by the foot and slammed) ---------------------------------------------------

// The attacker as the planner knows it: its keys (stage px), facing, height, and when it grabs and slams.
export type Carrier = { keys: CharacterKey[]; facing: Facing; height: number; grab: number; slam: number; lift?: number };
export type SlammedParams = { from?: string; carrier?: Carrier; other?: Other };
const SAMPLE = 1 / 96;
const LEGS_UP = 75; // degrees the legs rise toward the hand before the hips leave the floor
const BOW = 25; // degrees the swung body stays bent at the hips (never stiff as a stick)

// The lowest point of a pose below its hips (px, y down).
function belowHips(pose: PoseAngles, facing: Facing, height: number) {
  const s = forwardKinematics(pose, facing, { x: 0, y: 0 }, height, "normal", false);
  return Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + HEAD_R * height);
}

// AIR RESISTANCE (Arthur: "his arms trail behind him, his back is bent, not stiff as stone"): a body
// flying through the air drags its free limbs BEHIND the way it moves and bows against it. `dx, dy` is
// the way the hips move (facing-relative, y down, any length); `amount` 0..1 how fast. The free arms
// and the free leg turn toward pointing opposite the motion, the head and legs bow back from it.
export function dragPose(pose: PoseAngles, dx: number, dy: number, amount: number, held: "l" | "r" | null = null): PoseAngles {
  const a = clamp(amount, 0, 1);
  if (a <= 0 || Math.hypot(dx, dy) < 1e-9) return pose;
  // World angle (0 = down, +90 = forward) of "opposite the motion".
  const back = Math.atan2(-dx, -dy) / RAD;
    const out: PoseAngles = { ...pose };
  const wrap = (d: number) => ((((d % 360) + 540) % 360) - 180);
  for (const side of ["l", "r"] as const) {
    const sh = `${side}Shoulder` as const, el = `${side}Elbow` as const;
    const target = armFromWorld(pose.lean, side, { upper: back, fore: back + 15 }) as Record<string, number>;
    out[sh] = (pose[sh] as number) + wrap(target[sh] - (pose[sh] as number)) * 0.3 * a;
    out[el] = (pose[el] as number) + wrap(target[el] - (pose[el] as number)) * 0.3 * a;
    if (side !== held) {
      const hp = `${side}Hip` as const;
      out[hp] = (out[hp] as number) * (1 - 0.3 * a) + 20 * a * Math.sign(-dx || 1);
    }
  }
  out.head = pose.head + 25 * a * Math.sign(dx || 1) * -1;
  return safePose(out);
}

// SLAMMED: lying on its back, it is grabbed by the ankle, its legs hauled up, then it is swung up off the
// floor high overhead (the lifter turns round), and slammed down flat on its back on the other side; it
// jolts with the impact and lies there hurt (ends lying, facing the other way: follow with getUp or kipUp).
// Its foot is in the lifter's hand every moment from `grab` to `slam` (the planner passes the lifter's
// keys as `carrier`); the body points out along the lifter's arm like a swung bat, never into the floor,
// and drags its arms and free leg behind the way it flies. Marks `sees`, `grab`, `lift`, `hit` = `slam`, `down`.
export function slammed(start: Stance, params: SlammedParams, settings: MoveSettings): MoveOutput {
  const p0 = start.pose;
  const c = params.carrier;
  if (!c || p0.lean > -50 || c.slam <= start.t + 0.05) {
    return placedBeatsToKeys(start, [{ kind: "hold", pose: p0, seconds: 0.3, at: 0, name: "hit", contacts: [] }, { kind: "hold", pose: p0, seconds: 0.2, at: 0, name: "down", contacts: [] }], settings);
  }
  const h = settings.height;
  const seen = withPose(p0, { head: p0.head + 6 });
  const end = c.keys[c.keys.length - 1].t;
  const build = (keys: CharacterKey[], dur: number) => buildScene({ id: "carrier", title: "carrier", durationSec: dur, groundY: 0, characters: [{ id: "c", name: "c", facing: c.facing, height: c.height, style: DEFAULT_STYLE, keys }] }, 1 / SAMPLE).frames;
  const frames = build(c.keys, end + 0.1);
  // (Off the 1/96 s grid — the grab, the turn, the slam — the lifter is worked out at exactly that time,
  // so the hand and the foot agree at every fps, whichever picture lands there.)
  const exactAt = (t: number) => {
    const shift = Math.ceil(t / SAMPLE) * SAMPLE - t;
    const f = build(c.keys.map((k) => ({ ...k, t: k.t + shift })), end + shift + 0.1);
    return f[Math.min(f.length - 1, Math.round((t + shift) / SAMPLE))][0].skeleton;
  };
  const onGrid = (t: number) => Math.abs(t / SAMPLE - Math.round(t / SAMPLE)) < 1e-6;
  const carrierAt = (t: number) => (onGrid(t) ? frames[Math.min(frames.length - 1, Math.round(t / SAMPLE))][0].skeleton : exactAt(t));
  const way = forwardSign(c.facing);
  const face0: Facing = start.facing === "front" ? "right" : start.facing;
  const sB0 = forwardSign(face0) * way;
  // The held foot: the one nearest the hand at the grab.
  const from = Math.max(c.grab, start.t + 0.05);
  const s0 = forwardKinematics(seen, face0, { x: start.x, y: 0 }, h, "normal", false);
  const hand0 = carrierAt(from).rHand;
  const side: "l" | "r" = Math.abs(s0.lFoot.x - hand0.x) <= Math.abs(s0.rFoot.x - hand0.x) ? "l" : "r";
  // The body pointing `beta` degrees (0 = along the floor away from the lifter, 90 = straight up from the
  // hand); turned over (facing flipped) past straight up, so it always lands on its back.
  const poseAt = (beta: number, drag: { dx: number; dy: number; a: number }) => {
    const turned = beta > 90;
    const sB = turned ? -sB0 : sB0;
    // (Flat on the floor where it lay: exactly as it lay.)
    const lean = beta <= 1e-6 ? seen.lean : Math.atan2(sB * Math.cos(beta * RAD), Math.sin(beta * RAD)) / RAD;
    const k = clamp(Math.abs(lean) / Math.abs(seen.lean), 0, 1);
    const limbs: PoseAngles = { ...seen };
    for (const name of ["lShoulder", "rShoulder", "lElbow", "rElbow", "lHip", "rHip", "lKnee", "rKnee", "head"] as const) limbs[name] = (seen[name] as number) * k;
    // (Motion in this figure's own facing frame: x forward.)
    const fs = forwardSign(turned ? flip(face0) : face0);
    // (The motion is measured in the lifter's frame: `way` takes it to the stage, `fs` to this figure's.)
    const pose = dragPose({ ...limbs, lean }, drag.dx * way * fs, drag.dy, drag.a * Math.min(1, Math.abs(lean) / 30 + 0.2), side);
    return { pose, facing: turned ? flip(face0) : face0 };
  };
  const place = (pose: PoseAngles, facing: Facing, hand: Point) => {
    const s = forwardKinematics(pose, facing, { x: 0, y: 0 }, h, "normal", false);
    const foot = s[`${side}Foot`];
    return { x: hand.x - foot.x, lift: -(hand.y - foot.y + belowHips(pose, facing, h)) };
  };
  // Both legs raised  degrees toward the head side (hips bending; the held leg straightens, the free
  // one follows 70% of the way). The way "up toward the head" is worked out from the pose itself.
  const legsSign = new Map<Facing, number>();
  const raiseLegs = (pose: PoseAngles, facing: Facing, d: number): PoseAngles => {
    if (d <= 0) return pose;
    const held = `${side}Hip` as const, heldKnee = `${side}Knee` as const;
    const free = side === "l" ? "rHip" as const : "lHip" as const;
    const make = (sg: number) => safePose({ ...pose, [held]: (pose[held] as number) + sg * d, [free]: (pose[free] as number) + sg * 0.7 * d, [heldKnee]: (pose[heldKnee] as number) * Math.max(0, 1 - d / 40) });
    if (!legsSign.has(facing)) {
      const up = (sg: number) => { const s = forwardKinematics(make(sg), facing, { x: 0, y: 0 }, h, "normal", false); return s.hip.y - s[`${side}Foot`].y; };
      legsSign.set(facing, up(1) >= up(-1) ? 1 : -1);
    }
    return make(legsSign.get(facing)!);
  };
  const keys: CharacterKey[] = [{ t: start.t, pose: p0, x: start.x, lift: 0, contacts: [] }];
  const seeAt = Math.max(start.t + 0.02, c.grab - 0.25);
  if (seeAt > start.t + 0.03) keys.push({ t: seeAt, pose: p0, x: start.x, lift: 0, contacts: [] });
  keys.push({ t: Math.max(seeAt + 0.02, c.grab - 0.03), pose: seen, x: start.x, lift: 0, contacts: [] });
  let lastAngle: number | undefined, lastHip: Point | undefined, lastT = from;
  let smooth = { dx: 0, dy: 0 };
  let slamKey: CharacterKey | undefined;
  // THE TURN ON A SHARED KEY: the lifter's last key before he turns round and his first key after it are
  // keys of the swung body too (it turns over at the same instant), so no picture mixes the two sides.
  const flipAt = c.keys.findIndex((k, i) => i > 0 && k.facing !== undefined && k.facing !== (c.keys[i - 1].facing ?? c.facing) && k.t > from && k.t < c.slam);
  const shared = flipAt > 0 ? [c.keys[flipAt - 1].t, c.keys[flipAt].t] : [];
  const times = [from];
  for (let i = Math.ceil((from + 1e-6) / SAMPLE); i * SAMPLE < c.slam - 1e-6; i += 1) times.push(i * SAMPLE);
  times.push(c.slam, ...shared);
  times.sort((a, b) => a - b);
  for (let i = times.length - 1; i > 0; i -= 1) if (times[i] - times[i - 1] < 2e-4 && !shared.includes(times[i]) && times[i] !== c.slam) times.splice(i, 1);
  for (const tt of times) {
    const s = carrierAt(tt);
    const hand = s.rHand;
    // The way the lifter's arm points (degrees up from forward), unwrapped as it goes over the head.
    let arm = Math.atan2(-(hand.y - s.neck.y), (hand.x - s.neck.x) * way) / RAD;
    if (lastAngle !== undefined) arm = lastAngle + ((((arm - lastAngle) % 360) + 540) % 360 - 180);
    lastAngle = arm;
    // (Until the legs are hauled up the back stays on the floor, whichever way the bent-over arm points —
    // even with the hand behind his neck as he straightens up: the body never flips over to his side.)
    if (c.lift !== undefined && tt <= c.lift + 1e-6) { arm = clamp(arm, -90, 0); lastAngle = undefined; }
    // (Which side of the lifter's turn: it turns over exactly when he turns round.)
    const past = flipAt > 0 ? tt >= c.keys[flipAt].t - 1e-9 : arm > 90;
    const speed = (p: Point | undefined) => (p && lastHip ? Math.hypot(p.x - lastHip.x, p.y - lastHip.y) / Math.max(1e-3, tt - lastT) / (6 * h) : 0);
    // The body pointing `beta`, both legs raised `d` degrees up toward the hand (the held one straight).
    const fit = (beta: number, d: number, drag = { dx: 0, dy: 0, a: 0 }) => {
      const p = poseAt(beta, drag);
      const pose = raiseLegs(p.pose, p.facing, d);
      return { ...p, beta, d, pose, ...place(pose, p.facing, hand) };
    };
    // HAULED BY THE FOOT (Arthur's pic: "his back still flat on the floor, his legs going up to the hand"):
    // on the floor the back lies flat and the legs rise to the hand; when the legs point right up and the
    // hand is higher still, the hips come off the floor too (head and shoulders still down).
    const onFloor = (b0: number, dir: number) => {
      const f0 = fit(b0, 0);
      if (f0.lift <= 0) return { ...f0, lift: 0 };
      if (fit(b0, LEGS_UP).lift <= 0) {
        let lo2 = 0, hi2 = LEGS_UP;
        for (let i = 0; i < 30; i += 1) { const m = (lo2 + hi2) / 2; if (fit(b0, m).lift > 0) lo2 = m; else hi2 = m; }
        return fit(b0, hi2);
      }
      let lo2 = 0, hi2 = 85;
      for (let i = 0; i < 30; i += 1) { const m = (lo2 + hi2) / 2; if (fit(b0 + dir * m, LEGS_UP).lift > 0) lo2 = m; else hi2 = m; }
      return fit(b0 + dir * hi2, LEGS_UP);
    };
    // SWUNG LIKE A BAT: off the floor the body points out along the lifter's arm, the legs easing from
    // straight up to a bow (never stiff); it turns over at the lifter's turn.
    // (Right overhead it is straight for a moment, so turning over there changes nothing you can see.)
    const top = clamp(Math.abs(arm - 90) / 30, 0, 1);
    const legs = (past ? BOW : LEGS_UP - (LEGS_UP - BOW) * clamp(arm / 90, 0, 1)) * top;
    let beta = past ? Math.max(arm, 90 + 1e-4) : Math.min(arm, 90);
    let best = fit(beta, legs);
    // (While the legs are hauled up, the body stays on the floor solution: it never pops to the swung one.)
    const hauling = c.lift !== undefined && tt <= c.lift + 1e-6;
    if (best.lift < 0 || (hauling && !past)) {
      if (!past) best = onFloor(0, -1);
      else if (arm > 165) best = onFloor(180, 1);
      else {
        // NEVER INTO THE FLOOR: tilt toward straight up until the body clears it.
        let lo2 = beta, hi2 = 90 + 1e-4;
        for (let i = 0; i < 30; i += 1) { const m = (lo2 + hi2) / 2; if (fit(m, legs).lift < 0) lo2 = m; else hi2 = m; }
        beta = hi2; best = fit(beta, legs);
      }
    }
    // AIR RESISTANCE: once off the floor, the limbs trail behind the way the hips fly.
    const hip = { x: best.x, y: -best.lift };
    if (best.lift > 0.02 * h && lastHip) {
      const raw = { dx: (hip.x - lastHip.x) * way, dy: hip.y - lastHip.y };
      smooth = { dx: smooth.dx * 0.85 + raw.dx * 0.15, dy: smooth.dy * 0.85 + raw.dy * 0.15 };
      const dir = smooth;
      const a = clamp(speed(hip) * 1.5, 0, 1) * clamp(best.lift / (0.15 * h), 0, 1) * top;
      const dragged = fit(best.beta, best.d, { ...dir, a });
      if (dragged.lift >= 0) best = dragged;
    }
    lastHip = hip; lastT = tt;
    const k: CharacterKey = { t: tt, pose: best.pose, x: best.x, lift: Math.max(0, best.lift), contacts: [], facing: best.facing, ease: "linear", xEase: "linear", liftEase: "linear" };
    keys.push(k);
    slamKey = k;
  }
  const landFacing = slamKey!.facing ?? face0;
  const slamX = slamKey!.x;
  // THE IMPACT: the shared hard landing on the back (hardBackLanding, below).
  // (Which way it was flying at the impact, in its own facing frame.)
  const prevKey = keys[keys.length - 2];
  const skidWay = Math.sign(((slamKey!.x - (prevKey?.x ?? slamKey!.x)) || 1) * forwardSign(landFacing));
  // (LANDINGS DEPEND ON THE FALL: the speed it hits at — the hips' speed over the last step into the floor.)
  const hipAt = (key: CharacterKey) => ({ x: key.x / h, y: (key.lift ?? 0) / h + hipHeight(key.pose) });
  const a0 = hipAt(prevKey ?? slamKey!), a1 = hipAt(slamKey!);
  const impactSpeed = Math.hypot(a1.x - a0.x, a1.y - a0.y) / Math.max(1e-3, slamKey!.t - (prevKey?.t ?? slamKey!.t - 1));
  const after = landOnBack({ t: c.slam, x: slamX, facing: landFacing, pose: slamKey!.pose }, p0, skidWay, settings, { speed: impactSpeed });
  for (const k of after.keys.slice(1)) keys.push({ ...k, facing: landFacing });
  const liftMark = c.lift ?? (c.grab + c.slam) / 2;
  return {
    keys,
    end: { ...after.end, facing: landFacing },
    // (FAST SPAN, engine.ts fastSpans: thrown down from the top — the lifter's turn — to the impact.)
    marks: { sees: Math.max(seeAt + 0.02, c.grab - 0.03), grab: from, lift: liftMark, ...(shared.length ? { fastFrom: shared[0], fastTo: c.slam } : {}), hit: c.slam, slam: c.slam, down: after.marks.down },
  };
}

// HARD LANDINGS (shared, Phase 2C, Arthur 2026-10-06: "it must not repeat a mistake we already fixed"): every hard
// landing on the back — a slam (slammed, below), a blast throw (blownAway.ts) — uses these same impact rules, the
// ones Arthur passed for the slam: it hits at full speed (the move's own keys run straight into `impact`, no
// easing before contact), a hit-stop, one small bounce and jolt, the back ARCHES and eases straight over 4-5
// pictures, the limbs keep moving a little with their weight, then it lies in `p0` (a lying-on-the-back pose).
// `impact` = the stance at the moment the back hits (its pose, place, facing); `skidWay` = +1/-1, which way it
// was flying (in its own facing frame); `SKID` = how far (x height) it skids on (a slam: a little).
export const HARD_LANDING_SKID = 0.05;
// `s` (0..1, LANDINGS DEPEND ON THE FALL, landOnBack below): how big the impact is. 1 = the slam, exactly as Arthur
// passed it; smaller = a smaller fall: every pose only that share of the way from calm (the impact pose easing
// into the lying one), so the jolt, the arch and the bounce shrink with it, and it all takes a little less time.
export function hardBackLanding(impact: Stance, p0: PoseAngles, skidWay: number, settings: MoveSettings, SKID = HARD_LANDING_SKID, s = 1, timeK = 1): MoveOutput {
  // THE IMPACT (like a hard fall's): the body jolts (shoulders curl, legs fly up), slams back flat, lies hurt.
  const lean = p0.lean;
  // THE IMPACT HURTS (Arthur: "the slam should really HURT ... his body should bounce a little, and his arms
  // and legs should move a little from all that impact"; round 16: "blue visually looks like he seriously
  // got hit on the ground. Not like a little tap"): a HIT-STOP the moment the back hits (flattened hard, head
  // knocked back, arms slapped flat, held a beat so a picture shows it); then the whole body BOUNCES up off
  // the floor and SKIDS on along it the way it was flying, the arms and legs FLUNG UP hard and the head
  // snapping back; it crashes back down (the limbs still up: they lag the torso), jolts once more as they
  // flop down, and lies hurt only briefly. In REAL seconds (about 1.1 s in all, whatever the mood or
  // energy: gravity and a crash are the same for everyone — and something happens every second or two).
  // NOBODY IS STIFF (round 16: "it looks stiff ... it needs to look like he got hit. His spine needs to
  // bend"): the body BENDS all through it — at the hit the legs whip up at the hips and the head snaps back
  // (still moving through the hit-stop, never a held stick); it bounces into a gentle ARCH (see below); it
  // crashes down arched (head whipped back); the jolt is a small curl. The bounce is
  // a LITTLE one ("bounce just a little and go back just a little bit"), skidding back the way it was going.
  const s0p = impact.pose;
  const legsOf = (q: PoseAngles, up = 0) => ({ lHip: q.lHip + up, rHip: q.rHip + up, lKnee: q.lKnee, rKnee: q.rKnee });
  // (Shoulders curled up off the floor `c` degrees, the legs kept where they point in the world.)
  const curled = (q: PoseAngles, c: number): PoseAngles => ({ ...q, lean: q.lean + c, lHip: q.lHip + c, rHip: q.rHip + c });
  const squash = keepLying(safePose(withPose(p0, { head: p0.head - 20, ...armFromWorld(lean, "l", { upper: 98, fore: 100 }), ...armFromWorld(lean, "r", { upper: 94, fore: 96 }), ...legsOf(s0p, 18) })));
  const whip = keepLying(safePose(withPose(p0, { head: p0.head - 25, ...armFromWorld(lean, "l", { upper: 100, fore: 106 }), ...armFromWorld(lean, "r", { upper: 96, fore: 102 }), ...legsOf(s0p, 24) })));
  // THE BOUNCE IS A GENTLE ARCH (Arthur's drawing, round 16: "his back bent a little because of all that
  // impact and force"): the middle lifts — the hips are the highest point, the torso slopes down to the
  // neck and the head tips back toward the floor, both legs nearly straight and together sloping down to
  // the feet, the arms straight out (one along the floor past the head, one down to the floor). Modest:
  // never a hump.
  // (The torso can only go flat — the rig's lean stops at 90 — so the arch is: the head tipped back down
  // to the floor, the torso flat up at hip height, the legs sloping down. The engine rests its lowest point,
  // the back of the head, on the floor: the hips come out about 0.065 x height up. Both arms straight-ish,
  // relaxed, out and down to the floor toward the hips — never one sticking up like a pole; "past the
  // head" would break the windmill rule, as the body already turned right over in the swing.)
  // THE ARCH EASES OUT (round 16, Arthur: "you created it for only one frame... after the bounce it should be at
  // that arc, but slowly transition to a straight spine again, frame by frame, until the fourth or fifth frame —
  // a straight spine again, or a spine going a little the opposite way"; the rig's lean now goes 15 degrees past
  // flat, so the neck really dips below the hips): the arch is held at the bounce, then straightens over about
  // 0.35 s (4-5 pictures at 12 a second) — the legs keeping where they point in the world, the head coming back —
  // and ends in a small curl the other way before it lies hurt. Never levitating: the lowest point rests on the floor.
  const flatLean = Math.max(-90, lean - 20), deepLean = Math.max(-98, lean - 28);
  const archAt = (k: number) => {
    const L = flatLean + k * (deepLean - flatLean), keep = flatLean - L; // (legs keep their world direction)
    return safePose(withPose(p0, { lean: L, head: -15 * k, ...armFromWorld(L, "r", { upper: 76, fore: 80 }), ...armFromWorld(L, "l", { upper: 88, fore: 94 }), lHip: p0.lHip - 14 - keep - 7 * k, lKnee: 4, rHip: p0.lHip - 11 - keep - 7 * k, rKnee: 6 }));
  };
  const flung = archAt(1);
  const jolt = keepLying(safePose(curled(withPose(p0, { head: p0.head + 8, ...armFromWorld(lean, "l", { upper: 108, fore: 140 }), ...armFromWorld(lean, "r", { upper: 112, fore: 150 }), lHip: 98 + lean, lKnee: 15, rHip: 108 + lean, rKnee: 45 }), 3)));
  const hurt = keepLying(safePose(withPose(p0, { head: p0.head + 2, ...armFromWorld(lean, "l", { upper: 92, fore: 150 }), ...armFromWorld(lean, "r", { upper: 88, fore: 140 }), lHip: 89 + lean, lKnee: 0, rHip: 125 + lean, rKnee: 100 })));
  const real0 = (kind: "action" | "settle" | "hold", seconds: number) => (seconds * seconds) / Math.max(1e-3, beatSeconds(kind, seconds, settings));
  const real = (kind: "action" | "settle" | "hold", seconds: number) => real0(kind, s === 1 ? seconds : seconds * (0.5 + 0.5 * s) * timeK);
  // (u = how far through the landing, 0..1: where the calm pose is by then.)
  // (Shoulders turn freely: each blend takes the short way round, never an arm swung through the floor.)
  const near = (x: PoseAngles, ref: PoseAngles): PoseAngles => ({ ...x, lShoulder: x.lShoulder + 360 * Math.round((ref.lShoulder - x.lShoulder) / 360), rShoulder: x.rShoulder + 360 * Math.round((ref.rShoulder - x.rShoulder) / 360) });
  const sc = (u: number, q: PoseAngles) => (s === 1 ? q : keepLying(safePose(lerpPose(near(lerpPose(near(s0p, p0), p0, u), q), q, s))));
  return placedBeatsToKeys({ t: impact.t, x: impact.x, facing: impact.facing, pose: impact.pose }, [
    { kind: "action", ease: "out", pose: sc(0.04, squash), seconds: real("action", 0.04), at: 0, contacts: [], name: "flat" },
    { kind: "action", ease: "out", pose: sc(0.08, whip), seconds: real("action", 0.04), at: SKID * 0.15 * skidWay, contacts: [], name: "hitStop" },
    { kind: "action", ease: "out", liftEase: "out", xEase: "out", pose: sc(0.17, flung), seconds: real("action", 0.09), at: SKID * 0.7 * skidWay, lift: 0, contacts: [], name: "bounce" },
    // (Round 16, Arthur: "it almost looks like slow motion when he's at that arc" — the arch eases out over about
    // 2-3 pictures at 12 a second, not 4-5: bounce, back bent, and down again, all in a quick moment.)
    { kind: "action", ease: "inOut", xEase: "out", pose: sc(0.25, archAt(0.45)), seconds: real("action", 0.08), at: SKID * 0.9 * skidWay, lift: 0, contacts: [], name: "flung" },
    { kind: "settle", ease: "inOut", pose: sc(0.31, archAt(0.1)), seconds: real("settle", 0.07), at: SKID * skidWay, lift: 0, contacts: [], name: "jolt" },
    { kind: "settle", ease: "inOut", pose: sc(0.39, jolt), seconds: real("settle", 0.08), at: SKID * skidWay, lift: 0, contacts: [] },
    { kind: "settle", pose: sc(0.59, hurt), seconds: real("settle", 0.2), at: SKID * skidWay, contacts: [] },
    { kind: "hold", pose: sc(0.76, hurt), seconds: real("hold", 0.18), at: SKID * skidWay, contacts: [] },
    { kind: "settle", pose: p0, seconds: real("settle", 0.24), at: SKID * skidWay, contacts: [], name: "down" },
  ], settings);
}

// LANDINGS DEPEND ON THE FALL (Arthur, 2026-10-06: "it depends on the fall"): ONE rule for every fall onto the
// body, scaled by the impact speed `speed` (body heights a second, at contact) — every fall calls landOnBack:
// - a small fall (falling over, a normal knock-down; slower than LANDING.bigFrom): the slam's landing shrunk
//   (hardBackLanding's `s`, growing with the speed cubed) — barely a bounce, a tiny jolt, a small arch, settle;
// - a big hit (a slam, a blast throw; LANDING.bigFrom..bigTo): exactly the slam's landing, as Arthur passed it;
// - a huge fall (faster than bigTo, e.g. off a skyscraper): it BOUNCES HIGH (growing smoothly to about 0.85 x
//   height), and from LANDING.flipAt up it TUMBLES over in the air (the body turns right over, about 200
//   degrees) and lands FACE DOWN (`front`, a lying-face-down pose), a smaller jolt, and settles. Below flipAt it
//   bounces up arched and crashes back down on its back (the slam's landing again).
// Bounce, arch and tumble grow smoothly with the speed; the only switch is the flip appearing at flipAt.
export const LANDING = { bigFrom: 3.5, bigTo: 12, huge: 26, flipAt: 18, bounceHuge: 0.85 };
// (The slam landing's own length, seconds: its beats added up.)
const LANDING_SECONDS = 0.04 + 0.04 + 0.09 + 0.08 + 0.07 + 0.08 + 0.2 + 0.18 + 0.24;
export const landingScale = (speed: number) => (speed >= LANDING.bigFrom ? 1 : (Math.max(0, speed) / LANDING.bigFrom) ** 3);
const smooth01 = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
// `seconds`: a small fall's landing takes no longer than this (a fall keeps its own timing).
export type LandingOptions = { speed: number; skid?: number; front?: PoseAngles; seconds?: number };
export function landOnBack(impact: Stance, p0: PoseAngles, skidWay: number, settings: MoveSettings, o: LandingOptions): MoveOutput {
  const skid = o.skid ?? HARD_LANDING_SKID;
  if (!(o.speed > LANDING.bigTo)) {
    const s = landingScale(o.speed);
    const timeK = s < 1 && o.seconds !== undefined ? Math.min(1, o.seconds / (LANDING_SECONDS * (0.5 + 0.5 * s))) : 1;
    return hardBackLanding(impact, p0, skidWay, settings, skid, s, timeK);
  }
  const h = settings.height, g = GRAVITY / 300;
  const k = smooth01((o.speed - LANDING.bigTo) / (LANDING.huge - LANDING.bigTo));
  const flip = o.speed >= LANDING.flipAt && o.front !== undefined;
  // The slam's own landing to the hit-stop and the arch it bounces into.
  const slam = hardBackLanding(impact, p0, skidWay, settings, skid, 1);
  const iStop = slam.keys.findIndex((key) => Math.abs(key.t - slam.marks.hitStop) < 1e-9);
  const iArch = slam.keys.findIndex((key) => Math.abs(key.t - slam.marks.bounce) < 1e-9);
  const keys: CharacterKey[] = slam.keys.slice(0, iStop + 1).map((key) => ({ ...key, facing: impact.facing }));
  const stop = keys[keys.length - 1], arch = slam.keys[iArch].pose;
  // THE BOUNCE: the hips fly up (bounce x height above where they lie) and come down under gravity.
  const bounce = 0.065 + (LANDING.bounceHuge - 0.065) * k;
  const hip0 = hipHeight(stop.pose);
  const up = Math.sqrt(2 * g * bounce);
  const lean0 = arch.lean;
  // TUMBLE: tucked going over, then stretched out face down (the legs flung up behind), or (no flip) arched,
  // tipping up a little and back down onto its back.
  const front = o.front ?? p0;
  const tuck = safePose(withPose(STAND, { lean: -20, head: 20, ...armFromWorld(-20, "l", { upper: 120, fore: 150 }), ...armFromWorld(-20, "r", { upper: 100, fore: 135 }), lHip: 60, rHip: 45, lKnee: 120, rKnee: 105 }));
  const over = safePose(withPose(STAND, { lean: 50, head: -10, ...armFromWorld(50, "l", { upper: 150, fore: 175 }), ...armFromWorld(50, "r", { upper: 130, fore: 160 }), lHip: 20, rHip: 5, lKnee: 70, rKnee: 90 }));
  // (Tipped past flat as it hits, the arms keep their direction on the stage: along and above the floor.)
  const tip = 100 - front.lean;
  const faceDown = safePose(withPose(front, { lean: 100, head: front.head - 6, lShoulder: front.lShoulder + tip + 6, rShoulder: front.rShoulder + tip + 6, lHip: front.lHip + 10, rHip: front.rHip + 10, lKnee: 70, rKnee: 95 }));
  const tipped = safePose(withPose(arch, { lean: lean0 + 50 * k, head: arch.head + 10 }));
  const way = flip ? [{ u: 0, pose: stop.pose }, { u: 0.12, pose: arch }, { u: 0.45, pose: tuck }, { u: 0.75, pose: over }, { u: 1, pose: faceDown }]
    : [{ u: 0, pose: stop.pose }, { u: 0.15, pose: arch }, { u: 0.5, pose: tipped }, { u: 1, pose: arch }];
  const poseAt = (u: number) => {
    let i = 0;
    while (i < way.length - 2 && u > way[i + 1].u) i += 1;
    const a = way[i], b = way[i + 1];
    return safePose(lerpPose(a.pose, b.pose, smooth01((u - a.u) / (b.u - a.u))));
  };
  const hipEnd = hipHeight(way[way.length - 1].pose);
  // Time in the air: up and back down to where the hips are lying at the next hit.
  const air = (up + Math.sqrt(Math.max(0, up * up + 2 * g * (hip0 - hipEnd)))) / g;
  const drift = skidWay * Math.max(skid, 0.3 * k) * h; // it keeps going the way it was flying
  const n = Math.ceil(air * 48);
  for (let i = 1; i <= n; i += 1) {
    const t = (air * i) / n, u = t / air, pose = i === n ? way[way.length - 1].pose : poseAt(u);
    const hipH = hip0 + up * t - 0.5 * g * t * t;
    keys.push({ t: stop.t + t, pose, x: stop.x + forwardSign(impact.facing) * drift * u, lift: i === n ? 0 : Math.max(0, (hipH - hipHeight(pose)) * h), contacts: [], facing: impact.facing, ease: "linear", xEase: "linear", liftEase: "linear" });
  }
  const land: Stance = { t: stop.t + air, x: keys[keys.length - 1].x, facing: impact.facing, pose: way[way.length - 1].pose };
  const marks: Record<string, number> = { flat: slam.marks.flat, hitStop: slam.marks.hitStop, bounce: stop.t + Math.min(air, up / g), land2: land.t };
  let tail: MoveOutput;
  if (flip) {
    // FACE DOWN: the chest and face hit, the legs slap down behind, a small jolt, it lies still.
    const real = (kind: "action" | "settle", seconds: number) => (seconds * seconds) / Math.max(1e-3, beatSeconds(kind, seconds, settings));
    const flat = keepLying(safePose(withPose(front, { head: front.head - 10, lKnee: 40, rKnee: 60 })));
    const jolt = keepLying(safePose(withPose(front, { head: front.head + 6, lKnee: 55, rKnee: 30 })));
    tail = placedBeatsToKeys(land, [
      { kind: "action", ease: "out", pose: flat, seconds: real("action", 0.06), at: 0.02 * skidWay, contacts: [] },
      { kind: "action", ease: "out", pose: jolt, seconds: real("action", 0.12), at: 0.04 * skidWay, lift: 0.03 * h, contacts: [], name: "jolt" },
      { kind: "settle", pose: flat, seconds: real("settle", 0.14), at: 0.05 * skidWay, contacts: [] },
      { kind: "settle", pose: front, seconds: real("settle", 0.45), at: 0.05 * skidWay, contacts: [], name: "down" },
    ], settings);
  } else {
    tail = hardBackLanding(land, p0, skidWay, settings, skid, 0.6);
  }
  for (const key of tail.keys.slice(1)) keys.push({ ...key, facing: impact.facing });
  return { keys, end: { ...tail.end, facing: impact.facing }, marks: { ...marks, ...tail.marks, flat: marks.flat, hitStop: marks.hitStop, bounce: marks.bounce } };
}
