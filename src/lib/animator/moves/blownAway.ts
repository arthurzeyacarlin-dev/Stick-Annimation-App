import type { CharacterKey } from "../engine.ts";
import { monotoneTangents, sampleChannel } from "../easing.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, POSE_KEYS, STAND, withPose, type Facing, type PoseAngles, type PoseKey } from "../rig.ts";
import { FALL_GRAVITY, FALLEN_BACK, FALLEN_FORWARD, getUp, hipHeight, slideAfter } from "./fall.ts";
import { HURT_STYLE_AT } from "./hit.ts";
import { HARD_LANDING_SKID, landOnBack } from "./liftSlam.ts";
import { STYLE_CHANGES } from "./styles.ts";
import { beatSeconds, beatsToKeys, forwardSign, lerpPose, type Beat, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { armFromWorld, feetOf, placedBeatsToKeys, plantedLegs, type PlacedBeat } from "./punch.ts";
import { chainMoves } from "./sit.ts";
import { safePose } from "./squat.ts";

// SPEC-0017 Phase 2C: BLOWN AWAY by an explosion (Arthur, 2026-10-06: a grenade goes off close by and "he gets
// a knockback. It should look unintentional"; his drawing: airborne in a C shape, the hips/back leading away
// from the blast, the head forward-down, both arms and both legs (knees bent) trailing toward the blast).
//
// HOW TO CALL IT (library id "blownAway"):
//   { move: "blownAway", params: { from: { x: 900, y: 880 }, strength: 1 } }
//   - from: the blast point, stage px ({ x, y }; y left out = on the ground). A number = stage x on the
//     ground. A string = a figure's id ("b"; "b.rHand" = that figure's hand): the planner turns it into
//     the point where that figure / joint is when the move starts.
//   - strength: how big the blast is (0.3 a small bang .. 1 a grenade (default) .. 2 a big bomb).
//   - getUp: false = it stays lying there (default true: lies still `seconds`, then struggles up, hurt).
//   - seconds: how long it lies still before getting up (default 1).
//   - page / groundY: filled by the planner (the page's edges in stage x, the floor's stage y).
//   Time it to the blast with a sync on the mark "blast" (= "launch"), e.g.
//     sync: { mark: "blast", at: "<thrower>.<move><n>.<mark>", offset: 0.6 }.
//   Marks: thrown — `blast` = `launch` (the blast hits: the move starts there), `fastFrom`/`fastTo` (the
//   FAST SPAN of the launch), `peak` (top of the flight), `land` (the hard landing), `still` (lying still),
//   `sag`, `up`, `steady` + `ready` (struggling up, standing hurt; only with getUp). A weak or far blast only
//   startles or staggers: `blast` = `launch`, `react`, `watch`, `ready` (blastReaction() tells which).
//
// THE RULES (lengths in body heights, H):
// - STRENGTH AND DISTANCE: the push = strength / (1 + (distance / BLAST_REACH)^2), distance from the blast
//   to the hips. A push of THROWN_AT or more throws the body; STAGGER_AT.. a stagger; less a flinch. So a
//   stronger blast knocks people back from farther away; weak or far = only a flinch.
// - AWAY FROM THE BLAST: always away from it (left or right on the page) and up a bit. NEVER TURNED ROUND
//   (Arthur: "him standing at the explosion and getting blown away"): facing the blast it is thrown backward,
//   folded over; its back to the blast, thrown forward, back arched. Either way it tumbles back onto its back.
// - A BALLISTIC ARC: a very fast launch (the blast's shove lasts PUSH_SECONDS: the FAST SPAN — the first
//   pictures move a lot), slowing as it rises to the top, then falling faster and faster (earth gravity,
//   FALL_GRAVITY, the same as every fall), a little air drag on the way. Its speed grows with the push.
// - ON THE PAGE (off the page only on purpose): the flight and the skid are cut down so it lands on the page.
// - THE C (involuntary, no tidy poses): the hips shoved away first, the chest folded over, the head forward-down
//   and the arms and legs (knees bent) trailing toward the blast; over the top it tips back, limbs flung up.
// - A HARD LANDING on the back: the shared one Arthur passed for the slam (liftSlam.ts hardBackLanding): full
//   speed into the floor, a hit-stop, one small bounce and jolt, the back arches and eases straight, the limbs
//   flop with weight; it skids on (friction). Then HURT AFTER A BIG HIT (struggleUp): it lies still, struggles up
//   (sits up, sags back, tries again, wobbly knees) and stands hurt; the planner keeps the hurt style after it.
// - A WEAK OR FAR BLAST is a STARTLE (flinched, below): hands up fast but visibly, down slowly, still watching.

export type BlastPoint = { x: number; y?: number };
export type BlownAwayParams = {
  from?: BlastPoint | number | string;
  strength?: number;
  getUp?: boolean;
  seconds?: number;
  groundY?: number;
  page?: { left: number; right: number };
};
export type BlastReaction = "thrown" | "stagger" | "flinch";

export const BLAST_REACH = 0.9; // H: at this distance a blast pushes half as hard as right at it
export const THROWN_AT = 0.33;
export const STAGGER_AT = 0.15;
const LAUNCH_SPEED = 4.4; // H/s: launch speed for a push of 1 (a grenade at the feet): about 3 H of flight
const LAUNCH_ANGLE = 36; // degrees above the ground (more for a blast from below the hips)
const DRAG = 2.5; // s: air drag time (the forward speed fades a little in the air)
export const PUSH_SECONDS = 0.06; // the blast's shove: from standing to full speed
const STEP = 1 / 96; // keys through the flight
const STAGE = { left: 1920 * 0.04, right: 1920 * 0.96 }; // the page when the planner doesn't say
const LYING_REACH = 0.55; // H: lying on the back, the head reaches this far past the hips

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The blast's push on a figure whose hips are `dx` px across and `dy` px up from it (x height `h`).
export function blastPush(strength: number, dx: number, dy: number, h: number) {
  const d = Math.hypot(dx, dy) / h;
  return Math.max(0, strength) / (1 + (d / BLAST_REACH) ** 2);
}
export const blastReaction = (push: number): BlastReaction => (push >= THROWN_AT ? "thrown" : push >= STAGGER_AT ? "stagger" : "flinch");

// A pose from world directions (degrees from straight down, + toward the way it faces): the torso's lean, the
// head's tilt, each arm (upper arm, forearm) and each leg (thigh, shin).
function body(lean: number, head: number, la: [number, number], ra: [number, number], ll: [number, number], rl: [number, number]): PoseAngles {
  return safePose({
    ...withPose(STAND, { lean, head }),
    ...armFromWorld(lean, "l", { upper: la[0], fore: la[1] }),
    ...armFromWorld(lean, "r", { upper: ra[0], fore: ra[1] }),
    lHip: ll[0] + lean, lKnee: ll[0] - ll[1], rHip: rl[0] + lean, rKnee: rl[0] - rl[1],
  });
}

// HANDS NEVER THROUGH THE FLOOR: an arm whose hand would be below the body's lowest point turns up, a little at
// a time, until the hand clears it (the engine keeps the body on the floor; hands are the move's job).
function handsOffFloor(pose: PoseAngles): PoseAngles {
  let out = pose;
  for (const side of ["l", "r"] as const) {
    for (let i = 0; i < 40; i += 1) {
      const s = forwardKinematics(out, "right", { x: 0, y: 0 }, 1, "normal", false);
      const floor = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + HEAD_RADIUS.normal);
      if (Math.max(s[`${side}Hand`].y, s[`${side}Elbow`].y) < floor - 0.015) break;
      // (Toward pointing up, the short way: forward arms turn on forward and up, back arms back and up.)
      const world = out[`${side}Shoulder`] - out.lean;
      const turn = world >= 0 ? 5 : -5;
      out = safePose({ ...out, [`${side}Shoulder`]: out[`${side}Shoulder`] + turn, [`${side}Elbow`]: Math.max(0, out[`${side}Elbow`] - 2) });
    }
  }
  return out;
}

// THE FLIGHT POSES, in the figure's own facing (+ = the way it faces). It is never turned round: whichever way it
// faces, the C is relative to the blast — the hips lead away from it, the head and limbs trail toward it.
// FACING THE BLAST (thrown backward): the chest folds over toward the blast, head forward-down, arms reaching
// and legs (knees bent) trailing toward it; over the top it tumbles back and lands on its back.
// ITS BACK TO THE BLAST (thrown forward): the back arches (hips shoved forward), head back, arms and shins
// trailing back toward the blast; it tumbles on back, the legs swinging forward, and lands on its back, feet first.
type FlightPoses = { JOLT: PoseAngles; C: PoseAngles; TOP: PoseAngles; FALLING: PoseAngles; IMPACT: PoseAngles };
const BACKWARD: FlightPoses = {
  // The hips shoved back first, the chest and legs left behind (the C starts).
  JOLT: body(20, 22, [62, 88], [42, 72], [32, 0], [16, -10]),
  // THE C (Arthur's drawing).
  C: body(36, 28, [96, 118], [78, 102], [76, 36], [62, 22]),
  // Over the top: still the C (folded at the hips, head down), tumbling back a little.
  TOP: body(16, 26, [106, 132], [88, 114], [94, 52], [80, 38]),
  // Falling: tumbled on back, the C opening, the limbs flung up toward the blast.
  FALLING: body(-40, 14, [138, 164], [118, 146], [118, 74], [104, 58]),
  // Hitting the floor flat on the back at full speed, legs still up (the shared hard landing takes it from here).
  IMPACT: handsOffFloor(body(-74, 20, [128, 156], [110, 140], [112, 70], [100, 56])),
};
const FORWARD: FlightPoses = {
  JOLT: body(-14, -20, [-55, -75], [-35, -60], [-20, -60], [-8, -45]),
  C: body(-28, -26, [-112, -138], [-92, -122], [-16, -95], [-8, -80]),
  TOP: body(-46, -20, [-135, -160], [-115, -145], [8, -70], [18, -56]),
  // (The arms flail on over the top — kept unwrapped, the short way — so they land toward the feet like the slam's.)
  FALLING: body(-64, -6, [-172, -194], [-158, -182], [55, -10], [64, 5]),
  IMPACT: handsOffFloor(body(-76, 10, [-232, -212], [-246, -224], [88, 40], [96, 50])),
};
export const BLOWN_POSES = { BACKWARD, FORWARD };

// The blast point in stage px (x, y) — y = the floor if not known.
function blastPoint(from: BlownAwayParams["from"], start: Stance, groundY: number | undefined): { x: number; y: number | undefined } {
  if (typeof from === "number" && Number.isFinite(from)) return { x: from, y: undefined };
  if (from && typeof from === "object" && Number.isFinite(from.x)) return { x: from.x, y: Number.isFinite(from.y) ? from.y : undefined };
  // (No blast point: just in front of the figure.)
  return { x: start.x + forwardSign(start.facing) * 0.3, y: groundY };
}

// The flight: where the hips are (x along the flight, h above the floor, in H) at time s after the blast.
// Lands when the hips are down to `landH` (where they are lying on the back at the impact).
function flightPath(speed: number, angle: number, h0: number, landH: number) {
  const g = FALL_GRAVITY;
  const vx0 = speed * Math.cos((angle * Math.PI) / 180), vy0 = speed * Math.sin((angle * Math.PI) / 180);
  // The shove: speeding up evenly from 0 to full speed over PUSH_SECONDS (half the distance at full speed).
  const x1 = 0.5 * vx0 * PUSH_SECONDS, h1 = h0 + 0.5 * vy0 * PUSH_SECONDS;
  const at = (s: number) => {
    if (s <= PUSH_SECONDS) { const k = s / PUSH_SECONDS; return { x: x1 * k * k, h: h0 + (h1 - h0) * k * k, vx: vx0 * k, vy: vy0 * k }; }
    const u = s - PUSH_SECONDS;
    const fade = Math.exp(-u / DRAG);
    return { x: x1 + vx0 * DRAG * (1 - fade), h: h1 + vy0 * u - 0.5 * g * u * u, vx: vx0 * fade, vy: vy0 - g * u };
  };
  const peak = PUSH_SECONDS + vy0 / g;
  let land = peak;
  while (at(land).h > landH && land < 5) land += 1 / 2000;
  return { at, peak, land, vx0, vy0 };
}

// The skid after the hard landing (x height): friction from the speed at the impact, at least the slam's little one.
const skidOf = (vx: number, vy: number) => clamp(slideAfter(vx, -vy).distance, HARD_LANDING_SKID, 0.25);

// How far (H) the whole throw carries the hips: the flight and the skid after it.
function travelOf(speed: number, angle: number, h0: number) {
  const f = flightPath(speed, angle, h0, hipHeight(BACKWARD.IMPACT));
  const end = f.at(f.land);
  return end.x + skidOf(end.vx, end.vy);
}

// HURT AFTER A BIG HIT: how hurt (0..1, the planner's damage scale) a blast leaves the figure. Thrown: at least
// the hurt style's own threshold (HURT_STYLE_AT), more the closer and bigger the blast; a stagger hurts a little
// (never the hurt style); a flinch not at all.
export function blastHurt(push: number): number {
  const kind = blastReaction(push);
  if (kind === "thrown") return clamp(HURT_STYLE_AT + 0.4 * (push - THROWN_AT) / (1 - THROWN_AT), HURT_STYLE_AT, 0.95);
  if (kind === "stagger") return 0.1 + 0.25 * (push - STAGGER_AT) / (THROWN_AT - STAGGER_AT);
  return 0;
}

// The blast's push on a figure standing at `start` (the planner uses it for the damage).
export function pushOn(start: Stance, params: BlownAwayParams, height: number) {
  const blast = blastPoint(params.from, start, params.groundY);
  const h0 = hipHeight(start.pose);
  const above = blast.y === undefined || params.groundY === undefined ? h0 * height : h0 * height - (params.groundY - blast.y);
  return { push: blastPush(Math.max(0, Number(params.strength ?? 1)), start.x - blast.x, above, height), blast, above, h0 };
}

export function blownAway(start: Stance, params: BlownAwayParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const facing0: Facing = start.facing === "front" ? "right" : start.facing;
  const { push, blast, above, h0 } = pushOn(start, params, H);
  const across = start.x - blast.x;
  // AWAY FROM THE BLAST (left or right on the page); right on top of it: backward.
  const away = Math.abs(across) > 1e-6 ? Math.sign(across) : -forwardSign(facing0);
  let kind = blastReaction(push);
  // ON THE PAGE: the room from the hips to the page's edge the way it flies (less the lying body's reach).
  const page = params.page ?? STAGE;
  const room = ((away > 0 ? page.right - start.x : start.x - page.left) / H) - LYING_REACH;
  if (kind === "thrown") {
    // (A blast from below the hips throws it up more steeply.)
    const angle = LAUNCH_ANGLE + clamp((above / H) * 12, 0, 14);
    let speed = LAUNCH_SPEED * Math.sqrt(Math.min(push, 2.5));
    for (let i = 0; i < 12 && travelOf(speed, angle, h0) > room; i += 1) speed *= Math.sqrt(Math.max(0.05, room / travelOf(speed, angle, h0))) * 0.995;
    // (No room to fly at all: a stagger instead.)
    if (travelOf(speed, angle, h0) > room + 1e-6 || speed < 1.6) kind = "stagger";
    else return thrown(start, params, settings, facing0, away, speed, angle, h0, push);
  }
  return flinched(start, settings, facing0, away, push, kind, blast, params.groundY);
}

function thrown(start: Stance, params: BlownAwayParams, settings: MoveSettings, facing: Facing, away: number, speed: number, angle: number, h0: number, push: number): MoveOutput {
  const H = settings.height;
  const t0 = start.t;
  // NEVER TURNED ROUND: thrown as it stands — backward if it faces the blast, forward if its back is to it.
  const way = away * forwardSign(facing); // the way it flies in its own facing frame (+1 forward)
  const P = way > 0 ? FORWARD : BACKWARD;
  const f = flightPath(speed, angle, h0, hipHeight(P.IMPACT));
  // THE POSES THROUGH THE FLIGHT (seconds after the blast): the C forms in the shove and just after (fast), holds
  // through the top while it tumbles a little, opens as it falls, and the back hits the floor.
  const tC = Math.min(0.17, 0.75 * f.peak);
  const tFall = f.peak + 0.6 * (f.land - f.peak);
  const waypoints = [
    { s: 0, pose: start.pose },
    { s: PUSH_SECONDS, pose: P.JOLT },
    { s: tC, pose: P.C },
    { s: Math.max(tC + 0.05, f.peak), pose: P.TOP },
    { s: Math.max(tC + 0.1, tFall), pose: P.FALLING },
    { s: f.land, pose: P.IMPACT },
  ].filter((w, i, all) => i === 0 || i === all.length - 1 || w.s < f.land - 0.04);
  const times = waypoints.map((w) => w.s);
  const channels = Object.fromEntries(POSE_KEYS.map((k) => { const v = waypoints.map((w) => w.pose[k]); return [k, { v, tan: monotoneTangents(times, v) }]; })) as Record<PoseKey, { v: number[]; tan: number[] }>;
  const poseAt = (s: number) => safePose(Object.fromEntries(POSE_KEYS.map((k) => [k, sampleChannel(times, channels[k].v, channels[k].tan, times.map(() => undefined), s)])) as PoseAngles);
  const keys: CharacterKey[] = [{ t: t0, pose: start.pose, x: start.x, lift: 0, contacts: [], facing, ease: "linear", xEase: "linear", liftEase: "linear" }];
  // (Every key through the flight runs straight on, linear: full speed into the floor, no easing before the hit.)
  const n = Math.ceil(f.land / STEP);
  for (let i = 1; i <= n; i += 1) {
    const s = Math.min(f.land, i * STEP);
    const pose = s >= f.land ? P.IMPACT : poseAt(s);
    const p = f.at(s);
    keys.push({ t: t0 + s, pose, x: start.x + away * p.x * H, lift: Math.max(0, (p.h - hipHeight(pose)) * H), contacts: [], facing, ease: "linear", xEase: "linear", liftEase: "linear" });
  }
  const tLand = t0 + f.land;
  const hit = f.at(f.land);
  const xLand = start.x + away * hit.x * H;
  // HARD LANDINGS (liftSlam.ts hardBackLanding, the rules Arthur passed for the slam): hit-stop, one small bounce
  // and jolt, the back arches and eases straight over 4-5 pictures, the limbs flop with weight, lying on the back.
  // (LANDINGS DEPEND ON THE FALL, liftSlam.ts landOnBack: scaled by how fast it hits — a blast throw is a big hit.)
  const landing = landOnBack({ t: tLand, x: xLand, facing, pose: P.IMPACT }, FALLEN_BACK, way, settings, { speed: Math.hypot(hit.vx, hit.vy), skid: skidOf(hit.vx, hit.vy), front: FALLEN_FORWARD });
  for (const k of landing.keys.slice(1)) keys.push({ ...k, facing });
  const tStill = landing.end.t;
  // (The span starts a picture early at 8 fps: the picture before the blast and the first after it are both in.)
  const marks: Record<string, number> = { blast: t0, launch: t0, fastFrom: Math.max(0, t0 - 1 / 8), fastTo: t0 + tC, peak: t0 + f.peak, land: tLand, bounce: landing.marks.bounce, still: tStill };
  const flight: MoveOutput = { keys, end: { ...landing.end, facing }, marks };
  // LIES STILL a beat (a slow breath), then (getUp) HURT AFTER A BIG HIT: a struggle up, then a weak hurt stance.
  const hurt = blastHurt(push);
  const lie = Math.max(0.2, Number(params.seconds ?? 1));
  const parts: ((from: Stance) => MoveOutput)[] = [() => flight, (from) => lyingStill(from, lie)];
  if (params.getUp !== false) parts.push((from) => struggleUp(from, hurt, settings));
  const out = chainMoves(start, parts);
  out.marks = { ...out.marks, ...marks };
  if (params.getUp !== false) out.marks.ready = out.end.t;
  delete out.flow;
  return out;
}

// Lying still on the back: one slow breath (the chest rises a little), nothing else moves.
function lyingStill(start: Stance, seconds: number): MoveOutput {
  const inhale = withPose(start.pose, { lean: start.pose.lean + 2, head: start.pose.head + 2 });
  const beats: Beat[] = [
    { kind: "hold", seconds: 0.45 * seconds, pose: inhale, contacts: [] },
    { kind: "hold", seconds: 0.55 * seconds, pose: start.pose, contacts: [] },
  ];
  const out = beatsToKeys(start, beats, { height: 1, style: "natural", speed: "normal", energy: 0.5 });
  out.keys[0] = { ...out.keys[0], contacts: [] };
  return out;
}

// HURT AFTER A BIG HIT (Arthur, 2026-10-06: "he should look HURT — slower, struggling, it's hard for him to
// stand, and he stands weakly afterwards"): from lying on the back, the get-up is the passed hurt get-up (fall.ts
// getUp, in the hurt style) made a struggle that grows with how hurt it is (`hurt` 0..1, HURT_STYLE_AT and up):
// it sits up, SAGS back down (the first try fails; it lies back on its elbows a moment), tries again and gets up,
// the knees WOBBLE and give as it straightens (hunched, a hand on its side), then it stands HURT: bent, the hand
// on its side (favouring it), swaying. Ends in that weak stance; the planner keeps the hurt style for what follows.
// Marks `sag`, `up`, `steady`.
export function struggleUp(start: Stance, hurt: number, settings: MoveSettings): MoveOutput {
  const k = clamp((hurt - HURT_STYLE_AT) / (1 - HURT_STYLE_AT), 0, 1);
  const robot = settings.style === "robot";
  const timing: MoveSettings = robot ? settings : { ...settings, style: "hurt", energy: Math.min(settings.energy, 0.4) };
  const calm: MoveSettings = { ...settings, style: robot ? "robot" : "natural", speed: "normal" };
  return chainMoves(start, [
    // Sits up (the hurt get-up's first part).
    (from) => getUp(from, { direction: "back", low: true }, timing),
    // THE FIRST TRY FAILS: it sags back down onto its back a little, head lolling, and stays a moment.
    (from) => {
      // (The legs stay where they lie: the hips turn back with the chest. The hands rest on the lap.)
      const d = 26 + 14 * k, lean = from.pose.lean - d;
      const sag = handsOffFloor(safePose(withPose(from.pose, { lean, head: from.pose.head + 14, lHip: from.pose.lHip - d, rHip: from.pose.rHip - d, ...armFromWorld(lean, "l", { upper: 60, fore: 120 }), ...armFromWorld(lean, "r", { upper: 50, fore: 112 }) })));
      return beatsToKeys(from, [
        { kind: "settle", pose: sag, seconds: 0.3 + 0.15 * k, name: "sag", contacts: [] },
        { kind: "hold", pose: withPose(sag, { head: sag.head + 4 }), seconds: 0.25 + 0.25 * k, contacts: [] },
      ], calm);
    },
    // Tries again: the hurt get-up from there, as far as the push up with a hand on the knee — then STRAIGHT into
    // the hurt stance (NO UNNEEDED POSES: never up to a normal stand first, never its "nearly standing" pose).
    (from) => {
      const out = getUp(from, { direction: "back" }, timing);
      const up = out.marks.up ?? out.end.t;
      const keys = out.keys.filter((k) => k.t < up - 1e-6);
      const last = keys[keys.length - 1];
      return { keys, end: { t: last.t, x: last.x, facing: from.facing, pose: last.pose }, marks: { up: last.t } };
    },
    // WOBBLY KNEES, then THE HURT STANCE with a sway.
    (from) => hurtStand(from, k, calm),
  ]);
}

// THE HURT STANCE (the hurt style's own lean and head, rig styles.ts, and its bent knees): hunched over, one hand
// pressed to its side, the other arm hanging, the knees soft; `k` (0..1) how badly. `sway` -1..1 leans it a little.
export function hurtStance(k: number, sway = 0): PoseAngles {
  const style = STYLE_CHANGES.hurt;
  const lean = (style.lean ?? 13) * (1 + 0.6 * k) + 3 * sway, head = (style.head ?? 14) * (1 + 0.4 * k);
  const upper = withPose(STAND, { lean, head, ...armFromWorld(lean, "l", { upper: 6, fore: 22 }), ...armFromWorld(lean, "r", { upper: -8, fore: 88 }) });
  return safePose(plantedLegs(upper, feetOf(STAND), 0.012 * sway, 0.03 + 0.03 * k));
}
function hurtStand(start: Stance, k: number, settings: MoveSettings): MoveOutput {
  const feet = feetOf(start.pose);
  // The knees give as it straightens up (a dip, a hand to the side), it catches itself, then sways a little.
  const dip = safePose(plantedLegs(withPose(hurtStance(k), { lean: hurtStance(k).lean + 8, head: hurtStance(k).head + 6 }), feet, 0.01, 0.08 + 0.05 * k));
  const beats: PlacedBeat[] = [
    { kind: "settle", pose: dip, seconds: 0.35 + 0.15 * k, at: 0.01 },
    { kind: "hold", pose: dip, seconds: 0.12 + 0.15 * k, at: 0.01 },
    { kind: "settle", pose: hurtStance(k, 1), seconds: 0.5, at: 0.012 },
    { kind: "settle", pose: hurtStance(k, -1), seconds: 0.55, at: -0.012 },
    { kind: "settle", pose: hurtStance(k), seconds: 0.4, at: 0, name: "steady" },
  ];
  return placedBeatsToKeys(start, beats, settings);
}

// A WEAK OR FAR BLAST — a STARTLE (Arthur, 2026-10-06, the far grenade: the hands went up "too fast", a snap):
// the scare raises the hands FAST but so you can see it (STARTLE.raise s, easing out: 2-3 pictures at 12 a
// second, never a one-picture snap), the shoulders hunch, the hips are shoved a little away from the blast;
// it holds a moment; then the hands come down SLOWLY (STARTLE.lower s, easing in and out) while it keeps
// WATCHING what scared it — the chest and head stay turned toward the blast (the eyes on the fireball) until
// the hands are down. Feet planted. A stagger is the same, bigger and longer. Blast behind it: it ducks
// forward, hands over the head, and comes up slowly (it can't watch behind it without turning round).
// Seconds are real seconds, whatever the mood or energy (a scare is a reflex). Marks `react` (hands up),
// `watch` (the hands start down), `ready`.
export const STARTLE = { raise: 0.2, hold: 0.25, lower: 1.2 };
function flinched(start: Stance, settings: MoveSettings, facing0: Facing, away: number, push: number, kind: BlastReaction, blast?: { x: number; y?: number }, groundY?: number): MoveOutput {
  const H = settings.height;
  const k = clamp(push / THROWN_AT, 0.15, 1) * (kind === "stagger" ? 1 : 0.7);
  const feet = feetOf(start.pose);
  // + = toward the way it faces: the shove goes `away`.
  const shove = away * forwardSign(facing0);
  const at = shove * (0.02 + 0.07 * k);
  const inFront = shove < 0;
  // WATCHING: how far down (degrees) the eyes look to see the fireball (about 0.6 x height over the blast).
  const eyes = 0.93 * H, dx = blast ? Math.abs(blast.x - start.x) : 2 * H;
  const fireball = (blast?.y !== undefined && groundY !== undefined ? groundY - blast.y : 0) + 0.6 * H;
  const look = clamp((Math.atan2(eyes - fireball, Math.max(0.3 * H, dx)) * 180) / Math.PI, -40, 40);
  // Blast in front: it leans back away from it, hunched, hands up in front of the face. Behind: ducks forward.
  const lean = inFront ? -(4 + 10 * k) : 10 + 14 * k;
  const head = inFront ? clamp(look - lean, -30, 30) : 22;
  const up = safePose(plantedLegs(body(lean, head, inFront ? [150, 205] : [110, 165], inFront ? [130, 190] : [90, 150], [0, 0], [0, 0]), feet, at, 0.02 + 0.05 * k));
  const held = safePose(plantedLegs(withPose(up, { head: up.head + (inFront ? 0 : 2) }), feet, at * 0.9, 0.02 + 0.045 * k));
  // Hands down, still watching it (chest a little toward it, the head on the fireball).
  const watchLean = inFront ? start.pose.lean + 3 : start.pose.lean + 6;
  const down = safePose(withPose(start.pose, { lean: watchLean, head: inFront ? clamp(look - watchLean, -30, 30) : start.pose.head + 8 }));
  // (Real seconds: a style's or energy's timing is taken back out, like the slam's impact.)
  const real = (kind2: "action" | "settle" | "hold", seconds: number) => (seconds * seconds) / Math.max(1e-3, beatSeconds(kind2, seconds, settings));
  const big = kind === "stagger" ? 1.25 : 1;
  const out = placedBeatsToKeys(start, [
    { kind: "action", ease: "out", pose: up, seconds: real("action", STARTLE.raise + 0.05 * k), at, name: "react" },
    { kind: "hold", pose: held, seconds: real("hold", STARTLE.hold * big), at: at * 0.9, name: "watch" },
    { kind: "settle", ease: "smooth", xEase: "smooth", pose: down, seconds: real("settle", STARTLE.lower * big), at: 0, name: "ready" },
  ], settings);
  out.marks = { ...out.marks, blast: start.t, launch: start.t };
  delete out.flow;
  return out;
}

// For the AI's lessons (library.ts).
export const BLOWN_AWAY_ABOUT = "Blown away by a blast: `from` = blast point ({ x, y } stage px; or \"id\" / \"id.joint\"), `strength` (0.3 bang .. 1 grenade .. 2 bomb). Close: thrown away from it as it stands (never turns round) in a C, a hard landing on the back (the slam's), lies still `seconds` (1), struggles up and stands hurt (`getUp: false` = stays down). Far or weak: a STARTLE. Stronger reaches farther; lands on the page. Sync on mark `blast`. Marks `blast`, `peak`, `land`, `still`, `sag`, `up`, `ready` (startle: `react`, `watch`, `ready`).";

// THE PLANNER'S PART (plan.ts calls this for every blownAway action): the floor, the page's edges (from the
// plan's page width, with the page fit's margin), and a blast point given as a figure ("b") or one of its
// joints ("b.rHand") turned into a point: where that figure / joint is when the move starts (its keys so far).
export function blastParams(params: Record<string, unknown>, t: number, plan: { height: number; groundY: number; stageWidth?: number; characters: { id: string; x: number; facing: Facing }[] }, keysOf: (id: string) => CharacterKey[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  if (out.groundY === undefined) out.groundY = plan.groundY;
  if (out.page === undefined && plan.stageWidth !== undefined) {
    const half = (plan.stageWidth * (1 - 2 * 0.04)) / 2;
    out.page = { left: 960 - half, right: 960 + half };
  }
  if (typeof out.from === "string") {
    const [id, joint = "hip"] = out.from.split(".");
    const them = plan.characters.find((c) => c.id === id);
    const theirs = keysOf(id);
    if (!them) delete out.from;
    else if (!theirs?.length) out.from = { x: them.x, y: joint === "hip" ? undefined : plan.groundY };
    else {
      const after = theirs.findIndex((k) => k.t > t);
      const a = theirs[Math.max(0, (after < 0 ? theirs.length : after) - 1)], b = after <= 0 ? a : theirs[after];
      const k = b === a ? 0 : clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
      const pose = lerpPose(a.pose, b.pose, k), facing = a.facing ?? them.facing, x = a.x + (b.x - a.x) * k, lift = (a.lift ?? 0) + ((b.lift ?? 0) - (a.lift ?? 0)) * k;
      const s = forwardKinematics(pose, facing, { x, y: 0 }, plan.height, "normal", false);
      const low = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + HEAD_RADIUS.normal * plan.height);
      const p = (s as Record<string, { x: number; y: number }>)[joint] ?? s.hip;
      out.from = { x: p.x, y: p.y + plan.groundY - lift - low };
    }
  }
  return out;
}
