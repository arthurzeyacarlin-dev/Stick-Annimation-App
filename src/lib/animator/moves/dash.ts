import type { CharacterKey, FootContact } from "../engine.ts";
import { PROPORTIONS, type PoseAngles } from "../rig.ts";
import { amplitudeOf, forwardSign, tempoOf, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { bodyAt, bodyPose, dropOf, GRAVITY, hermite, JOINT_SPEED, KEY_GAP, LEG, poseTrack, reachable } from "./jump.ts";
import { powerOf, worldArmAt } from "./punch.ts";
import { safePose, footAt } from "./squat.ts";
import { RAMP_SCALE } from "./styles.ts";

// DASH PUNCH (Arthur, round 9, pictures 69 and 70): "They start running. When they hit top speed, they bend
// down a lot, they hop: push their legs off the ground. Now they're dashing (airborne, body leaning far
// forward, arm going back). Their arm goes back and then it punches the other character. You're airborne
// when you dash, but when you go to punch, the same moment your front foot touches the ground. Airborne only
// under half a second, like running: a dash must not look like levitating. From all that pressure the
// dasher slows down a little after (air resistance, friction)."
// Built like the running jump (jump.ts): it takes the run's speed (the planner hands over the moment a
// foot lands; with no run before it the planner runs it up first), then:
//   GATHER on that foot: the hips roll over it and sink LOW (the wind-up goes down and back: the arms swing
//   back), then PUSH: the leg drives straight behind, the body shoots forward faster than it ran;
//   DASH (a flat gravity arc, under half a second in the air): body leaning far forward, the push leg
//   stretched out behind, the front knee lifted high;
//   COCKED IN THE AIR (Arthur, round 11, pictures 73-74: "I was expecting anticipation. Your arm ain't
//   supposed to just stick out there"): the punching fist is cocked up by the head (elbow back and a little
//   down, the fist "almost pointing at the sky, but it isn't"), the other arm reaching out at the target;
//   HIT = TOUCH-DOWN, THE SHOULDERS TWIST: "when his foot lands, his shoulders twist ... the arm behind him
//   goes in front of him, and the arm in front of him goes behind him". The cocked fist comes forward on a
//   SLIGHT arc past the head (the elbow drops by the side, the fist passes the chin) into a straight punch
//   at where the target really is (the planner's aim), the reaching arm pulls back to the ribs;
//   SLOW DOWN AND STEP: friction: the front foot skids a little, the body dips; then, leaning back up, the
//   back leg comes through and plants in front ("you can't just stop all that weight") and it settles.
// SQUASH & STRETCH (only from 20 pictures a second: engine keysAt / minFps): one squashed key just before
// the push (a deeper crouch) and one stretched key just after it (the body in one long straight line, a
// bit more lean). Bones never stretch: it is all in the pose.
export type DashParams = { distance?: number; speed?: number; targetHeight?: number };
// distance: px from the hips where the dash starts to the target's hips when the fist lands (the planner
// fills it from `target`). speed: the run's speed when it hands over (px/s, filled in by the planner).
// targetHeight: where the fist lands, x height above the floor (default: the chest of a standing figure).

type Side = "l" | "r";
type Limb = readonly [number, number];
const other = (side: Side): Side => (side === "l" ? "r" : "l");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const sides = <T,>(t: Side, forT: T, forOther: T): Record<Side, T> => (t === "l" ? { l: forT, r: forOther } : { l: forOther, r: forT });
const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;
// AT THE FACE, STRAIGHT AND LEVEL (Arthur, round 12: "punching his face in a straight direction, but an
// overhand. Punch like you always do, it's just you're airborne"): the fist lands on a standing figure's
// face (x height above the floor), the arm nearly level (as punch.ts LEVEL_UP: never pointing down at the
// chest), stopping at the front of the face.
const FACE = 0.8;
const FACE_FRONT = 0.1; // the front of the target's face is this far in front of its hips (x height)
const LEVEL_MAX = 16; // degrees: the punching arm at the hit points up at most this much (nearly level)
// HIT STOP (Arthur: "I can't see the impact ... FEEL the power"): the arm stays fully out on the face this
// long (about 2 pictures at 12 a second) while the target's head snaps back, the body still driving in.
const HIT_STOP = 0.15;
const STANCE = 0.13; // ENDS STANDING: the feet this far apart (x height), under the hips
export const MAX_AIR = 0.42; // seconds: a dash is never in the air longer (Arthur: under half a second)
const MIN_AIR = 0.3;
// A DASH IS ALWAYS REALLY AIRBORNE (round 16, Arthur: "airborne is too little ... it almost looks like a hop. It
// needs to look like the dash punch when they actually do that"): in a fight as much as alone, a dash is in the
// air at least REAL_AIR seconds (the passed dash flies 0.375 s) and its arc is never lower than the passed
// one's (DASH_AIR at natural gravity) — a quick or heavy style, tiredness, hurt or a short gap never shrink it.
// (Too little room: the planner gives it more first; if it is still short the dash flies slower, never lower.)
const REAL_AIR = 0.36;
const DASH_AIR = 0.375;
const GATHER = 0.2; // seconds on the push foot, at least (the crouch is seen)
const SQUASH_FPS = 20; // squash & stretch keys only exist from this many pictures a second

// How far (x height) a dash covers from the foot it starts on to the target's hips when the fist lands,
// at its natural speed: the planner runs up to about this far from the target before handing over.
// (`miss`: how far outside what it can cover a gap is, x height: 0 when the dash can reach it.)
export function dashSpan(settings: MoveSettings, speedPx = 2.1 * settings.height, gap?: number) {
  const v = Math.max(0.6, speedPx / settings.height), tempo = tempoOf(settings), fly = v * (RAMP_SCALE[settings.style] === 0 ? 1 : boostOf(settings));
  const around = 0.15 + 0.3 + 0.45, natural = around + fly * clamp(0.34 * tempo, MIN_AIR, MAX_AIR);
  const lo = around + Math.max(0.92 * fly * MIN_AIR, v * REAL_AIR), hi = around + 1.3 * fly * MAX_AIR; // (never slower than the run)
  return { natural, miss: gap === undefined ? 0 : Math.max(0, lo - gap, gap - hi) };
}
const boostOf = (settings: MoveSettings) => (RAMP_SCALE[settings.style] === 0 ? 1 : clamp(1.15 + 0.25 * powerOf(settings), 1.2, 1.5));

export function dashPunch(start: Stance, params: DashParams, settings: MoveSettings): MoveOutput {
  const H = settings.height, dir = forwardSign(start.facing);
  const robot = RAMP_SCALE[settings.style] === 0;
  const amp = amplitudeOf(settings), power = powerOf(settings), tempo = tempoOf(settings);
  const g = GRAVITY / (tempo * tempo);
  const limit = JOINT_SPEED / H;
  const v = clamp(Number(params.speed ?? 0) / H, 0.6, 0.6 * limit);
  const boost = boostOf(settings);

  // The foot down (the run hands over the moment it lands) is the push foot D; the other one, F, lands first.
  const s0 = bodyAt(start.pose), y0 = dropOf(start.pose);
  const foot = (side: Side) => s0[`${side}Foot`];
  const down = (["l", "r"] as const).filter((side) => foot(side).y >= y0 - 0.012).sort((a, b) => foot(b).x - foot(a).x);
  const D: Side = down[0] ?? (foot("l").x >= foot("r").x ? "l" : "r");
  const F = other(D);
  const footD = clamp(foot(D).x, -0.1, 0.3);

  // GATHER: the hips roll over the foot and sink low ("bend down a lot"), braking a little into it, then push.
  const dip = robot ? 0.05 : clamp(0.12 * (0.75 + 0.25 * amp) * (0.85 + 0.15 * power), 0.07, 0.17);
  const pB = 0.3; // the push foot leaves the floor this far behind the hips
  // (Handed over with that foot already under or behind the hips, the push still comes a crouch later: the
  // foot is then further behind at the push, the hips a little lower.)
  const xLow = Math.max(0.04, footD + 0.04), xPush = Math.max(footD + pB, xLow + 0.22);
  const pBack = Math.min(0.4, xPush - footD);
  let vFly = robot ? v : v * boost;
  // (The crouch must be seen — at least GATHER seconds on that foot, two pictures at 12 a second: a fast
  // runner brakes a little more into it, a robot keeps its speed.)
  const gatherTime = (vLow: number) => xLow / (0.5 * (v + vLow)) + (xPush - xLow) / (0.5 * (vLow + vFly));
  let vLow = robot ? v : 0.72 * v;
  if (!robot) for (let i = 0; i < 30 && gatherTime(vLow) < GATHER * Math.sqrt(tempo) && vLow > 0.3 * v; i += 1) vLow *= 0.95;
  const tLow = xLow / (0.5 * (v + vLow));
  const tPush = tLow + (xPush - xLow) / (0.5 * (vLow + vFly));
  const yLow = Math.min(y0, Math.sqrt(Math.max(0, (0.98 * LEG) ** 2 - 0.04 ** 2))) - dip;
  const toe = robot ? 0 : 0.03;
  const yPush = Math.sqrt((0.99 * LEG) ** 2 - pBack * pBack) + toe;

  // HIT = TOUCH-DOWN: the front foot lands this far ahead of the hips as the fist lands on the target.
  // (Nearly upright at the hit, as a standing punch: the shoulder high enough to punch level at the face.)
  const leanHit = robot ? 8 : 10 + 4 * amp;
  const reachF = 0.13;
  const yLand = Math.sqrt((0.975 * LEG) ** 2 - reachF ** 2);
  const R = (leanHit * Math.PI) / 180;
  const shoulder = { x: PROPORTIONS.torso * Math.sin(R), y: yLand + PROPORTIONS.torso * Math.cos(R) };
  const aimY = clamp(Number(params.targetHeight ?? FACE), 0.3, 1);
  const rise = clamp(aimY - shoulder.y, -0.97 * ARM * Math.sin((LEVEL_MAX * Math.PI) / 180), 0.97 * ARM * Math.sin((LEVEL_MAX * Math.PI) / 180));
  const along = Math.sqrt(Math.max(0.02 ** 2, (0.97 * ARM) ** 2 - rise * rise));
  const reachX = shoulder.x + along + FACE_FRONT; // hips at the hit -> the target's hips
  // How far it flies: what is left of the distance (the planner's aim), within a real dash's air time.
  const natural = vFly * clamp(0.34 * tempo, MIN_AIR, MAX_AIR);
  const asked = Number(params.distance) > 0 ? Number(params.distance) / H - reachX - xPush : natural;
  // (Never slower than a dash: a short gap is a shorter flight, a long one a longer and a little faster one.)
  const air = clamp(asked / vFly, REAL_AIR, MAX_AIR);
  vFly = clamp(asked / air, robot ? Math.min(v, asked / air) : 0.92 * vFly, robot ? v : 1.35 * vFly);
  // (Too close: NEVER PAST THE TARGET and NEVER A LITTLE HOP — it still flies its full REAL_AIR, high, just
  // slower: the gather brakes into it. The planner gives it the room first, so this is rare.)
  if (asked / air < vFly) vFly = Math.max(0.15, asked / air);
  // (THE ARC IS NEVER LOWER THAN THE PASSED DASH'S: its gravity is never lighter than what lifts a DASH_AIR
  // flight as high as it does at natural gravity — nor, for a quick style, more than half again as high.)
  const gFly = clamp(g, GRAVITY * (DASH_AIR / air) ** 2, 1.6 * GRAVITY * (DASH_AIR / air) ** 2);
  const flight = Math.max(0.05, vFly * air);
  const tLand = tPush + air;
  const xLand = xPush + flight;
  const vy0 = (yLand - yPush + 0.5 * gFly * air * air) / air;
  // The fist's trip from behind the head (BODY SPEED LIMIT: the body already flies fast, so the fist's own
  // trip is never quicker than this).
  const strike = clamp((0.16 * tempo) / (0.9 + 0.1 * power) + 0.012 * Math.max(0, vFly - 3), 0.14, 0.2);
  // ARM PATH (the arm goes back, then comes through THE SHORT WAY, like a cross: the elbow folds, the fist
  // comes in by the chest with the elbow down by the side, then straight out at the target — never over the
  // top and round, so it never windmills and never turns half a turn between two pictures, even at 8 a
  // second). The arm is all the way back (picture 69) `strike` seconds before the hit.
  // LOADED THE WHOLE WAY (Arthur, round 12: "When he's airborne, the arm that's going to attack is behind
  // him. When his left or right foot lands, the arms switch"): the fist is cocked from the push and HELD
  // through the flight; only the last `strike` seconds before the landing do the arms switch (fast, a slight
  // arc), so the loaded pose is seen for most of the dash (4+ pictures at 12 a second in a normal dash).
  const tCock = Math.max(tPush + 0.03, tLand - strike);
  const tOver = tLand - 0.45 * (tLand - tCock);
  const tTop = tPush + clamp(vy0 / gFly, 0.15 * air, Math.max(0.15 * air, tCock - tPush - 0.03));

  // SLOW DOWN AND STEP (friction; Arthur, round 11: "you can't just stop all that weight; he goes down a
  // little and comes back up ... then he takes a step forward"): the front foot skids on with the hips —
  // never into the one it hit (the hit gives them the rest of the push) — the upper body pitching on over
  // it (inertia), the hips dipping; then, leaning back up, the back leg swings through and plants in front
  // (a real step: the weight carries on a little) and the hips settle between the feet.
  const brake = (robot ? 14 : 9) * (0.9 + 0.1 * power);
  const skid = clamp((vFly * vFly) / (2 * brake), 0.03, 0.05);
  const xStop = xLand + skid, xF = xStop + reachF; // the front foot is planted from the stop
  // ENDS STANDING (Arthur, round 12, picture 75: "it looks like he's supposed to be falling, or he's doing
  // the horse pose. He needs to be standing"): ONE step — the back foot comes up under the body, a hip
  // width behind the front one — and the hips end OVER the feet, upright, knees nearly straight. (Never a
  // lunge or a half-squat with the feet out in front of the hips.)
  const step = -STANCE;
  const xEnd = xF - 0.5 * STANCE, xStepHip = lerp(xStop, xEnd, 0.6);
  const tStepGap = robot ? 0.22 : 0.3 * tempo; // the back leg's swing through
  const vOn = (xStepHip - xStop) / (HIT_STOP + tStepGap); // the weight still carrying on as it steps
  const tStop = tLand + (2 * skid) / (vFly + vOn); // (an even slow-down: friction)
  const tHeld = Math.max(tStop + 0.02, tLand + HIT_STOP); // the hit stop is over
  const tStep = tHeld + tStepGap;
  const settle = robot ? 0.3 : 0.4 * tempo;
  const tEnd = tStep + settle;

  // The hips' path: the gather on the ground, a gravity arc in the air, the skid, the step, the settle.
  const g1 = hermite(0, tLow, 0, xLow, v, vLow), g2 = hermite(tLow, tPush, xLow, xPush, vLow, vFly);
  const s1 = hermite(tLand, tStop, xLand, xStop, vFly, vOn), s2 = hermite(tStop, tStep, xStop, xStepHip, vOn, 0.6 * vOn), s3 = hermite(tStep, tEnd, xStepHip, xEnd, 0.6 * vOn, 0);
  const hipX = (t: number) => (t <= tLow ? g1(t) : t <= tPush ? g2(t) : t <= tLand ? xPush + vFly * (t - tPush) : t <= tStop ? s1(t) : t <= tStep ? s2(t) : s3(t));
  const yG1 = hermite(0, tLow, y0, yLow, 0, 0), yG2 = hermite(tLow, tPush, yLow, yPush, 0, (yPush - yLow) / Math.max(0.05, tPush - tLow));
  const fly = (t: number) => { const u = t - tPush; return yPush + vy0 * u - 0.5 * gFly * u * u; };
  const yAbs = yLand - (robot ? 0 : 0.03 * amp);
  const legUp = (dx: number, k: number) => Math.sqrt((k * LEG) ** 2 - dx * dx);
  const yStep = Math.min(yAbs + 0.01, legUp(xStepHip - xF, 0.975), legUp(xF + step - xStepHip, 0.975));
  const yStand = Math.min(legUp(xEnd - xF, 0.99), legUp(xF + step - xEnd, 0.99));
  const yS1 = hermite(tLand, tStop, yLand, yAbs, -Math.min(1, gFly * (tLand - tTop)), 0), yS2 = hermite(tStop, tStep, yAbs, yStep, 0, 0), yS3 = hermite(tStep, tEnd, yStep, yStand, 0, 0);
  const hipY = (t: number) => (t <= tLow ? yG1(t) : t <= tPush ? yG2(t) : t <= tLand ? fly(t) : t <= tStop ? yS1(t) : t <= tStep ? yS2(t) : yS3(t));

  // KEY POSES (world angles: arms [upper arm, elbow bend], legs [thigh, knee]).
  const look = (lean: number, world: number) => clamp(world - lean, -32, 28); // eyes on the target
  const P = D, G = F; // the punching arm is on the push leg's side (a cross: land on one foot, hit with the other hand)
  const leanGather = robot ? 16 : 30 + 6 * amp, leanPush = robot ? 22 : 38 + 6 * amp, leanAir = robot ? 12 : 16 + 4 * amp;
  // LOAD IT EARLY (Arthur, round 12: "lean back more and LOAD that punch more"): on the gather foot the
  // punching fist is already pulled back and up (elbow back) and the other arm comes forward; at the push
  // it is fully loaded — fist cocked by the head, the other arm straight out at the target — and it stays so.
  const gather = bodyPose(leanGather, look(leanGather, 6), sides(P, [-48, 96] as Limb, [40, 36] as Limb), sides(D, [10, 70] as Limb, [-10, 100] as Limb));
  const low = bodyPose(leanGather + 4, look(leanGather + 4, 6), sides(P, [-62, 128] as Limb, [70, 16] as Limb), sides(D, [16, 96] as Limb, [-4, 112] as Limb));
  // COCKED IN THE AIR (picture 74): the elbow back and a little down, the fist up by the head nearly pointing
  // at the sky (a raised arm turns at the shoulder: its forearm crosses the upper arm, rig.ts HAND UP), the
  // other arm straight out at the target; the front knee lifted high, the back leg stretched out behind.
  // (The elbow out behind nearly level with the shoulder, as in picture 74: the arm reads as BEHIND him.)
  // ACCELERATING ANTICIPATION (Arthur, round 12: "the anticipation needs to slowly ACCELERATE more and more
  // until his feet hit the ground"): from the push the cocked fist keeps winding further back, slowly at
  // first and faster toward the landing (an ease-in: k^2), never unloading early.
  const cockArm = (k: number): Limb => [-62 - 24 * k, 222 + 6 * k];
  // (Never a short hop now: the knees always lift as in a full dash.)
  const hop = 1;
  const airLegs = (d: Limb, f: Limb) => sides(D, [lerp(-30, d[0], hop), lerp(50, d[1], hop)] as Limb, [lerp(44, f[0], hop), lerp(50, f[1], hop)] as Limb);
  const reachOut: Limb = [94, 4]; // the other arm straight out at the target, at face height (blocking the face)
  const push = bodyPose(leanPush, look(leanPush, 0), sides(P, cockArm(0), [86, 6] as Limb), sides(D, [-leanPush + 4, 6] as Limb, [lerp(44, 64, hop), lerp(60, 96, hop)] as Limb));
  const windAt = (t: number) => ((t - tPush) / Math.max(0.05, tCock - tPush)) ** 2;
  const dash = bodyPose(leanAir, look(leanAir, -2), sides(P, cockArm(windAt(tTop)), reachOut), airLegs([-36, 72], [60, 76]));
  const target = { x: along, y: -rise }; // from the shoulder, y down: straight and level at the face
  const hitArm = worldArmAt({ x: target.x, y: target.y });
  // Held cocked while it flies (the anticipation), the front foot starting down to land.
  const cock = bodyPose(leanAir, look(leanAir, -2), sides(P, cockArm(1), reachOut), airLegs([-32, 78], [48, 54]));
  // THE SHOULDERS TWIST: the elbow drops by the side and the fist passes the chin (a slight arc, never round
  // the outside of the head), the reaching arm coming back.
  // (OVER THE SHOULDER: the fist comes over at shoulder height, by the ear, then STRAIGHT out level.)
  const over = bodyPose(lerp(leanAir, leanHit, 0.7), look(leanHit, 0), sides(P, [-4, 152] as Limb, [26, 96] as Limb), airLegs([-26, 80], [32, 24]));
  // HIT: the punch straight out at the face; the arm that reached is now behind (elbow back, fist by the ribs).
  const punchArm: Limb = [hitArm.upper, hitArm.fore - hitArm.upper];
  const hitPose = bodyPose(leanHit, look(leanHit, 0), sides(P, punchArm, [-36, 112] as Limb), sides(D, [-24, 80] as Limb, [26, 10] as Limb));
  // HIT STOP: the arm held fully out on the face, the torso and the back leg still driving forward.
  // WEIGHT (Arthur, round 13: "there's no weight reaction ... his spine leans forward a little and then bounces
  // back"): through the hit stop the body's weight carries on — the spine pitches forward over the planted
  // feet, the knees give — then it comes back up through the step.
  const impact = bodyPose(leanHit + 14, look(leanHit + 14, 0), sides(P, punchArm, [-34, 112] as Limb), sides(D, [-14, 84] as Limb, [20, 10] as Limb));
  const skidPose = bodyPose(leanHit + 9, look(leanHit + 9, 0), sides(P, punchArm, [-30, 108] as Limb), sides(D, [-20, 78] as Limb, [22, 10] as Limb));
  // THE STEP: the back leg swings through (knee forward, foot clear of the floor) and plants in front while
  // the body leans back up; the arms swing with it (the punching arm comes back, the other comes forward).
  // (The back foot comes up under the body; the punching arm comes back down, the hands end low and loose.)
  const swing = bodyPose(6, 2, sides(P, [30, 70] as Limb, [-6, 100] as Limb), sides(D, [6, 50] as Limb, [8, 10] as Limb));
  const stepPose = bodyPose(4, 2, sides(P, [18, 90] as Limb, [16, 88] as Limb), sides(D, [-6, 6] as Limb, [8, 6] as Limb));
  const ready = bodyPose(3, 2, sides(P, [8, 90] as Limb, [14, 86] as Limb), sides(D, [-8, 4] as Limb, [8, 4] as Limb));

  const anchors = [
    { t: 0, pose: start.pose }, { t: 0.6 * tLow, pose: gather }, { t: tLow, pose: low }, { t: tPush, pose: push },
    { t: tTop, pose: dash }, { t: tCock, pose: cock }, { t: tOver, pose: over }, { t: tLand, pose: hitPose },
    { t: tStop, pose: skidPose }, { t: tHeld, pose: impact }, { t: 0.5 * (tHeld + tStep), pose: swing }, { t: tStep, pose: stepPose }, { t: tEnd, pose: ready },
  ].filter((a, i, all) => i === 0 || a.t > all[i - 1].t + 0.02).sort((a, b) => a.t - b.t);
  // BODY SPEED LIMIT (as in the running jump): each limb gets only as far toward the next pose as it can in
  // the time (a fast runner's short crouch: the knee drive and the arm swing start early and catch up
  // later). The hit pose is always reached (the fist's trip is timed for it).
  const speedAt = (t: number) => Math.abs(hipX(t + 0.01) - hipX(t - 0.01)) / 0.02;
  for (let i = 1; i < anchors.length; i += 1) {
    if (anchors[i].pose === cock || anchors[i].pose === over || anchors[i].pose === hitPose || anchors[i].pose === impact) continue;
    anchors[i] = { ...anchors[i], pose: reachable(anchors[i - 1].pose, anchors[i].pose, anchors[i].t - anchors[i - 1].t, Math.max(speedAt(anchors[i].t), speedAt(anchors[i - 1].t)), limit) };
  }
  const track = poseTrack(anchors);
  const feetAt = (t: number): Partial<Record<Side, number>> => {
    if (t < tPush - 1e-9) return { [D]: footD } as Partial<Record<Side, number>>;
    if (t < tLand - 1e-9) return {};
    const front = hipX(Math.min(t, tStop)) + reachF; // (skids with the hips, then stays: xF)
    return t < tStep - 1e-9 ? ({ [F]: front } as Partial<Record<Side, number>>) : ({ [F]: xF, [D]: xF + step } as Partial<Record<Side, number>>);
  };
  const place = (pose: PoseAngles, t: number, deeper = 0) => {
    let out = pose;
    for (const [side, x] of Object.entries(feetAt(t)) as [Side, number][]) out = footAt(out, side, x - hipX(t), hipY(t) - deeper);
    return safePose(out);
  };
  // Squash (just before the push: the hips lower, leaning in more, the free knee folded tighter) and
  // stretch (just after: head, body and push leg in one long straight line, the arms straight): changes
  // of the pose the body has right then, so they show for a picture or two and never jump.
  const tSquash = tLow + 0.45 * (tPush - tLow), tStretch = tPush + Math.min(0.045, 0.25 * air);
  const squashed = (() => { const p = track(tSquash); return { ...p, lean: p.lean + 8, [`${F}Knee`]: p[`${F}Knee`] + 10 } as PoseAngles; })();
  const stretched = (() => {
    const p = track(tStretch), lean = p.lean + 10;
    return { ...p, lean, head: 0, [`${D}Hip`]: 0, [`${D}Knee`]: 0, [`${G}Elbow`]: 0, [`${F}Hip`]: p[`${F}Hip`] + 10 } as PoseAngles;
  })();
  // (A short hop has no time to show the stretch: only the squash.)
  const extra = robot ? [] : [{ t: tSquash, pose: squashed, deeper: 0.04 }, ...(hop >= 1 ? [{ t: tStretch, pose: stretched, deeper: 0 }] : [])];
  const fixedTimes = [0, 0.6 * tLow, tLow, tPush, tTop, tCock, tOver, tLand, tStop, tHeld, 0.5 * (tHeld + tStep), tStep, tEnd];
  const grid = Array.from({ length: Math.floor(tEnd / KEY_GAP) }, (_, i) => (i + 1) * KEY_GAP)
    .filter((t) => fixedTimes.every((m) => Math.abs(t - m) > 4e-3) && extra.every((e) => Math.abs(t - e.t) > 0.012));
  const times = [...new Set([...fixedTimes, ...grid])].filter((t) => t <= tEnd + 1e-9).sort((a, b) => a - b);
  const ease = robot ? "linear" as const : undefined;
  const keyAt = (t: number, pose: PoseAngles, minFps?: number, deeper = 0): CharacterKey => {
    const placed = t === 0 ? start.pose : place(pose, t, deeper);
    let contacts: Side[];
    if (t < tPush - 1e-9) contacts = [D];
    else if (t < tStop - 1e-9) contacts = []; // in the air, then skidding (the foot slides: not planted)
    else contacts = t < tStep - 1e-9 ? [F] : [F, D];
    const lift = t >= tPush - 1e-9 && t < tLand - 1e-9 ? Math.max(0, hipY(t) - dropOf(placed)) : 0;
    return { t: start.t + t, x: start.x + dir * hipX(t) * H, pose: placed, contacts: contacts.map((side) => `${side}Foot` as FootContact), facing: start.facing, lift: lift * H, ease, xEase: ease, liftEase: ease, ...(minFps ? { minFps } : {}) };
  };
  const keys: CharacterKey[] = times.map((t) => keyAt(t, track(t)));
  keys[0] = { ...keys[0], pose: start.pose, x: start.x };
  for (const e of extra) keys.push(keyAt(e.t, e.pose, SQUASH_FPS, e.deeper));
  keys.sort((a, b) => a.t - b.t);
  // (The punching arm went forward over the top: the last pose says the same angles the ordinary way round.)
  const turnBack = (a: number) => a - 360 * Math.round(a / 360);
  const lastPose = keys[keys.length - 1].pose;
  keys[keys.length - 1] = { ...keys[keys.length - 1], pose: { ...lastPose, lShoulder: turnBack(lastPose.lShoulder), rShoulder: turnBack(lastPose.rShoulder) } };
  const last = keys[keys.length - 1];
  const end: Stance = { t: last.t, x: last.x, facing: start.facing, pose: last.pose };
  const marks = { crouch: start.t + tLow, push: start.t + tPush, air: start.t + tTop, windup: start.t + tTop, land: start.t + tLand, hit: start.t + tLand, stop: start.t + tStop, step: start.t + tStep };
  return { keys, end, marks, flow: { keys: keys.length - 1, stance: end } };
}
