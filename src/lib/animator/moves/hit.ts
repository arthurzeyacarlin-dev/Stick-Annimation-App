import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, JOINT_LIMITS, POSE_KEYS, PROPORTIONS, STAND, withPose, type PoseAngles } from "../rig.ts";
import { fall } from "./fall.ts";
import { lookAtOwn } from "./gaze.ts";
import { kick, type KickParams } from "./kick.ts";
import { beatSeconds, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { GRAVITY } from "./jump.ts";
import { actionSeconds, armFromWorld, atLeast, backLegDrop, blendArm, blendPose, feetOf, fightFeet, GUARD, guardAt, isRobot, stanceArms, type GuardLook, legOf, other, placedBeatsToKeys, plantedLegs, powerOf, ROBOT_WINDUP, stanceAt, STAND_HIP, stepPose, windKind, worldArm, type Feet, type PlacedBeat, type WorldArm } from "./punch.ts";
import { footPlanter } from "./planted.ts";
import { naturalWalkPace } from "./gait.ts";
import { chainMoves } from "./sit.ts";
import { STYLE_CHANGES } from "./styles.ts";
import { stand, stepInto } from "./turn.ts";
import { footAt, handAt as handTo, safePose } from "./squat.ts";

// SPEC-0017 Phase 2 (Arthur, 2026-10-05: "When they get hit, they get hurt, get back up... Small hits barely
// hurt. Big hits hurt fast, and recovery takes longer and longer"). Getting hit, worked out from RULES,
// not drawn: the planner tells the move how hard the hit was (`power`, measured from the attacker's real
// wind-up and strike, see plan.ts STRIKE POWER) and how hurt the figure already is (`hurt` 0..1, the
// DAMAGE rule). From those two numbers the engine picks the reaction and its timing:
// - SMALL hit: a FLINCH. The head snaps back, the chest goes back a little over the planted feet, the
//   guard comes straight back. Barely a moment.
// - MEDIUM hit: a STAGGER. A bigger snap, then the weight goes back so far that the back foot has to step
//   back to catch it (twice for a harder hit), the arms flung forward; then back into the guard.
// - BIGGER hit: ALMOST FALLS, CATCHES ITSELF (round 7): stumbles back, teeters on the back foot (front foot
//   up, arms flailing), steps back down under itself, guard back. No fall.
// - BIG hit: KNOCKED DOWN. A hard snap, one stagger step, the legs go and the body falls on its back
//   (fall.ts, the way it was hit: backward), stays down, then gets up slowly (it hurt) — if the page has
//   room behind it to fall (ROOM TO FALL); otherwise it almost falls instead.
// - BLOCKED (round 7, only when the plan says so): forearms up in front of the face, a small push back.
// A hurt body is shaken more easily (a smaller hit counts as bigger), stays down longer, takes longer to
// get its guard back, and stands more and more bent over (the slumped guard). When the damage is full,
// a knock-down is the end: it stays down (out).
// Feet: planted feet never move; a stagger STEPS (one foot at a time) — the body goes the way it was hit.
// FLOW: getting the guard back after a flinch or a stagger is the recovery: the next hit of a combo can
// land before it is over (the planner starts the next reaction from there).

// What a hit does (the director may ask for one; otherwise the engine picks it from the power):
// "block" = the guard stops it; "hit" = it lands (the engine picks the reaction from the power);
// "stagger", "catch" (almost falls, catches itself), "knockdown" = that reaction; "grab" = it catches the
// incoming fist in both hands (Arthur's picture 72: "black grabbed and stopped the dash punch"); "parry" =
// the lead forearm pushes the punch aside (no damage) and it is ready to strike back fast.
export type HitResult = "block" | "hit" | "stagger" | "catch" | "knockdown" | "grab" | "parry";
export type GetHitParams = {
  from?: string; // who hits (the planner times the reaction to their next hit and fills `power`)
  power?: number; // how hard the hit was (about 0.3 a quick jab .. 1.5 a full overhand or high kick)
  hurt?: number; // how hurt the figure was before the hit, 0..1
  after?: number; // how hurt it is after the hit, 0..1 (sets the posture it ends in)
  seconds?: number; // extra time lying down after a knock-down
  stayDown?: boolean; // F11 PRESS THE ADVANTAGE: a knock-down that stays lying (a ground move — coverUp, kipUp, getUp — follows)
  result?: HitResult;
  // Room (px) behind the figure to the edge of the page (the planner fills it when it knows the page):
  // a knock-down needs room to fall; with too little, it almost falls and catches itself instead.
  room?: number;
  // K11 GET UP CLEAR: where the attacker stands (x height, from this figure, forward +) while it gets up
  // (the planner fills it from `from`), so a knocked-down figure gets up clear of them.
  other?: { dx: number; facing: "same" | "opposite"; pose: PoseAngles; lift?: number };
};

export type Reaction = "block" | "flinch" | "stagger" | "catch" | "knockdown" | "grab" | "parry";
// How shaken the body is by a hit: a hurt body is shaken more easily.
export const shakeOf = (power: number, hurt: number) => Math.max(0, power) * (1 + 0.7 * clamp01(hurt));
export const STAGGER_AT = 0.7;
export const CATCH_AT = 1.25;
export const KNOCKDOWN_AT = 1.5;
export function reactionFor(power: number, hurt: number): Reaction {
  const shake = shakeOf(power, hurt);
  return shake >= KNOCKDOWN_AT ? "knockdown" : shake >= CATCH_AT ? "catch" : shake >= STAGGER_AT ? "stagger" : "flinch";
}
// The reaction a hit gets: the one asked for, or (not asked, or "hit") the one its power gives.
export function reactionOf(params: GetHitParams): Reaction {
  const asked = params.result;
  if (asked === "block" || asked === "stagger" || asked === "catch" || asked === "knockdown" || asked === "grab" || asked === "parry") return asked;
  return reactionFor(Math.max(0, Number(params.power ?? 0.5)), clamp01(Number(params.hurt ?? 0)));
}

// The widest a staggering stance gets (x height, back foot to front foot).
const MAX_STANCE = 0.42;
const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const LEG = PROPORTIONS.thigh + PROPORTIONS.shin;

// How much lower than standing tall the hips must be for both planted legs to reach their feet.
function legsDrop(feet: Feet, at: number, straight = 0.985) {
  let drop = 0.01;
  for (const foot of [feet.l, feet.r]) {
    const h = foot - at, length = LEG * straight;
    drop = Math.max(drop, STAND_HIP - Math.sqrt(Math.max(0, length * length - h * h)));
  }
  return drop;
}

// The same, with the legs as straight as `straight` (no minimum bend): standing tall.
function tallDrop(feet: Feet, at: number, straight: number) {
  const length = LEG * straight;
  return Math.max(0.001, ...[feet.l, feet.r].map((foot) => STAND_HIP - Math.sqrt(Math.max(0, length * length - (foot - at) ** 2))));
}

// THE SLUMPED GUARD: a fighter's guard, more and more bent over as it gets hurt (Arthur: "he'd be
// slouching his back from all that pain"): the back bends forward, the head hangs, the hands drop toward
// the belly, the knees give. `hurt` 0 = the plain guard. Feet stay where they are (`feet`, from the hips
// at the start), the hips `at`.
// LOOSE CARTOON STANCE (Arthur, round 8: "No guard stance all the time... sometimes hands not even up,
// hands lifted or around the chest, to throw a barrage"): between exchanges the fists rest loose around
// the chest, not up at the chin like a boxer; a block or a strike brings them up.
// FIGHT LOOK (round 9): the stance is LOOSE by default (hands around the chest), the boxer's guard only for
// `look` "realistic" (punch.ts LOOSE / GUARD); either way the hands sink toward the belly as it gets hurt.
const BEATEN_ARMS: Record<"l" | "r", WorldArm> = { l: { upper: 10, fore: 81 }, r: { upper: 2, fore: 70 } };
export function slumpedGuard(feet: Feet, hurt: number, at = guardAt(feet), look?: GuardLook): PoseAngles {
  const h = clamp01(hurt);
  const base = stanceArms(look);
  const lean = base.lean + 22 * h;
  const upper = withPose(base, {
    lean, head: base.head + 14 * h,
    ...armFromWorld(lean, "l", blendArm(worldArm(base, "l"), BEATEN_ARMS.l, h)),
    ...armFromWorld(lean, "r", blendArm(worldArm(base, "r"), BEATEN_ARMS.r, h)),
  });
  // STAND UP STRAIGHT (Arthur, round 13): waiting, the knees are nearly straight under the hips — only a
  // real boxing guard (asked for: "realistic") sits a little into its knees; hurt sags them a bit more.
  return plantedLegs(upper, feet, at, legsDrop(feet, at) + (look === "realistic" ? 0.012 : 0.004) + 0.025 * h);
}

// The head and chest snapping back from a hit of `k` (0..1.5), hips at `at` over the planted `feet`.
// ARMS FLUNG BY THE HIT (Arthur, round 8, his favourite drawing: "making a zigzag with his arms"; and the
// big one "looks like he's screaming"; never both arms straight up over the head): the hit throws the
// chest back and the arms are thrown the opposite ways — the ZIGZAG: one arm flung UP, bent (the elbow out
// in front, the forearm up), the other flung DOWN and BACK, bent (the elbow behind, the forearm forward).
// A bigger hit flings them further, to the SCREAM: one arm up and over, the other thrown out wide behind.
// Which arm goes up is the hit's (`up`); a small hit only starts the zigzag. (The arm thrown behind
// flicks its forearm back over the top, the short way: angles above 180 are up-and-back.)
function snapped(from: PoseAngles, feet: Feet, at: number, k: number, up: "l" | "r" = "l"): PoseAngles {
  const lean = from.lean - (7 + 12 * k);
  const down = other(up);
  const a = worldArm(from, up), b = worldArm(from, down);
  const f = clamp01(0.25 + 0.6 * k), s = clamp01((k - 0.9) / 0.5);
  const mix = (x: number, zig: number, scream: number) => x + (zig + (scream - zig) * s - x) * f;
  const upper = withPose(from, {
    lean, head: Math.max(-30, from.head - (14 + 16 * k)),
    ...armFromWorld(lean, up, { upper: mix(a.upper, 100, 128), fore: mix(a.fore, 182, 205) }),
    ...armFromWorld(lean, down, { upper: mix(b.upper, -45, -92), fore: mix(b.fore, 38, 242) }),
  });
  return plantedLegs(upper, feet, at, legsDrop(feet, at) + 0.01);
}
// (The snap is as quick as the body allows: hands flung far take a moment longer — the speed limit for
// hands, as for every strike.)
const snapSeconds = (seconds: number, from: PoseAngles, to: PoseAngles, settings: MoveSettings) =>
  Math.max(seconds, ...(["lHand", "rHand"] as const).map((joint) => actionSeconds(seconds, from, to, joint, settings)));
// Which arm a hit flings up: it changes from hit to hit (how hard the hit was decides it), so two hits in
// a row don't look the same.
const upArm = (power: number): "l" | "r" => (Math.round(power * 37) % 2 === 0 ? "l" : "r");

export function getHit(start: Stance, params: GetHitParams, settings: MoveSettings): MoveOutput {
  const power = Math.max(0, Number(params.power ?? 0.5));
  const hurt = clamp01(Number(params.hurt ?? 0));
  const after = clamp01(Number(params.after ?? hurt));
  let kind = reactionOf(params);
  const shake = shakeOf(power, hurt);
  // It takes longer to get the guard back the more it hurts (Arthur: "recovery takes longer and longer").
  const slow = 1 + 1.6 * after;
  const feet0 = feetOf(start.pose);
  const at0 = 0;
  const k = Math.min(1.5, shake);

  if (kind === "block") return blocked(start, feet0, k, after, slow, settings);
  if (kind === "grab") return grabbed(start, feet0, k, after, slow, settings);
  if (kind === "parry") return parried(start, feet0, after, settings);

  // ROOM TO FALL (round 7: the whole animation stays on the page): a reaction that throws the body back
  // needs room behind it on the page. A knocked-down body is thrown back as far as the hit drives it if
  // there is room, less if there is less; with no room to fall at all it almost falls and catches itself;
  // with no room for that, it staggers; with no room for that, it flinches.
  const room = params.room === undefined ? Infinity : Math.max(0, Number(params.room));
  const fits = (out: MoveOutput) => room === Infinity || reachBehind(out, start, settings) <= room;
  if (kind === "knockdown") {
    const push = (0.22 + 0.16 * Math.min(1.5, shake)) * settings.height;
    let down: MoveOutput | null = knockedDown(start, params, settings, feet0, shake, k, after, push);
    const over = reachBehind(down, start, settings) - room;
    if (over > 0) down = over < push ? knockedDown(start, params, settings, feet0, shake, k, after, push - over) : null;
    if (down) return down;
    kind = "catch";
  }
  if (kind === "catch") {
    const out = almostFalls(start, feet0, Math.max(k, CATCH_AT), after, slow, settings);
    if (fits(out)) return out;
    kind = "stagger";
  }
  if (kind === "stagger") {
    // STAGGER: the snap, then the back foot steps back to catch the weight (and the front foot follows for
    // a harder hit). Each step is longer the harder the hit.
    const { beats, feet: feetNow } = stumble(start, feet0, shake, k, after, shake >= 0.85 ? 2 : 1, false, settings);
    const readyAt = guardAt(feetNow);
    beats.push({ kind: "settle", pose: slumpedGuard(feetNow, after, readyAt, settings.guard), seconds: 0.35 * slow, at: readyAt, name: "ready", recover: true });
    const out = marked(placedBeatsToKeys(start, beats, settings), start.t, kind);
    if (fits(out)) return out;
    kind = "flinch";
  }
  const back = -(0.018 + 0.03 * k);
  const beats: PlacedBeat[] = [
    { kind: "action", ease: "out", pose: snapped(start.pose, feet0, at0 + back, k, upArm(power)), seconds: snapSeconds(0.08, start.pose, snapped(start.pose, feet0, at0 + back, k, upArm(power)), settings), at: at0 + back, name: "react" },
    { kind: "hold", pose: snapped(start.pose, feet0, at0 + back * 0.9, k * 0.85, upArm(power)), seconds: 0.06 * slow, at: at0 + back * 0.9 },
    { kind: "settle", pose: slumpedGuard(feet0, after, at0, settings.guard), seconds: 0.28 * slow, at: at0, name: "ready", recover: true },
  ];
  return marked(placedBeatsToKeys(start, beats, settings), start.t, "flinch");
}

// The snap and the stumbling steps back of a stagger (or the one stumble of a knock-down).
function stumble(start: Stance, feet0: Feet, shake: number, k: number, after: number, steps: number, falling: boolean, settings: MoveSettings) {
  const stepLength = 0.1 + 0.11 * Math.min(1.4, shake);
  const beats: PlacedBeat[] = [];
  const snapAt = -0.04 - 0.03 * k;
  const up = upArm(shake);
  const snap = snapped(start.pose, feet0, snapAt, k, up);
  beats.push({ kind: "action", ease: "out", pose: snap, seconds: snapSeconds(0.09, start.pose, snap, settings), at: snapAt, name: "react" });
  let feetNow: Feet = feet0, poseNow = snap, atNow = snapAt;
  let previous: "l" | "r" = "l";
  for (let i = 0; i < steps; i += 1) {
    // The back foot (r) steps back first, then the front (l) foot follows (same stance, further back).
    // (Knocked down: the front foot stumbles back beside the back one, and the legs go from there.)
    // (Feet already wide apart: the front foot steps back first, so the legs can always reach.)
    const width = feetNow.l - feetNow.r;
    // (Never the back foot twice in a row while the feet are already wide: that spread the legs into a
    // split, the knee through the floor. The back foot steps again only after the front one followed.)
    const side: "l" | "r" = !falling && previous === "l" && width + stepLength <= MAX_STANCE ? "r" : "l";
    previous = side;
    const move = side === "r" ? stepLength : Math.min(stepLength * 0.85, Math.max(0.03, width - 0.14));
    const to: Feet = falling ? { r: feetNow.r, l: feetNow.r + 0.03 } : { ...feetNow, [side]: feetNow[side] - move };
    const landAt = falling ? (to.l + to.r) / 2 - 0.02 : stanceAt(to, side === "r" ? 0.35 : 0.45);
    const land = snapped(slumpedGuard(to, after * 0.5, landAt, settings.guard), to, landAt, k * (0.7 - 0.25 * i), up);
    const airAt = (atNow + landAt) / 2;
    const air = stepPose(blendPose(poseNow, land, 0.5), feetNow, to, airAt, Math.max(0.02, legsDrop(feetNow, airAt) + 0.01), side, 0.035);
    beats.push(
      { kind: "action", ease: "smooth", pose: air, seconds: 0.11, at: airAt, contacts: [`${other(side)}Foot`] },
      { kind: "follow", pose: land, seconds: 0.1, at: landAt },
    );
    feetNow = to; poseNow = land; atNow = landAt;
  }
  return { beats, feet: feetNow };
}

// KNOCKED DOWN: the legs go, the body falls back (the way it was hit, thrown back `push` px) and lies
// still; then (unless it is the end) it gets up slowly and its guard comes back, slumped.
function knockedDown(start: Stance, params: GetHitParams, settings: MoveSettings, feet0: Feet, shake: number, k: number, after: number, push: number): MoveOutput {
  const out = after >= 1;
  // (CARTOON FIGHTS, round 8: "fell down from a strong hit, got up, punch, punch": a fighter who isn't
  // beaten doesn't lie there long, and springs back up quicker the less hurt it is.)
  // (FAST GET-UP IN A FIGHT, round 11: only a short beat on the floor — longer only when badly hurt;
  // GET-UP PACE, round 12: a beat lying still before it starts to get up.)
  const lie = Math.max(0, Number(params.seconds ?? 0)) + GET_UP_PACE.lie + 0.6 * after * after;
  const sway = placedBeatsToKeys(start, stumble(start, feet0, shake, k, after, 1, true, settings).beats, settings);
  const parts: ((from: Stance) => MoveOutput)[] = [
    () => sway,
    // The hit's momentum carries the body back as it falls (the feet don't shoot forward at the other
    // fighter: the body is driven away from them).
    (from) => pushedBack(fall(from, { direction: "back" }, settings), push * -(from.facing === "left" ? -1 : 1)),
    (from) => stand(from, { seconds: out ? 0.6 : params.stayDown ? 0.1 : lie }, settings),
  ];
  if (!out && !params.stayDown) {
    // FAST GET-UP IN A FIGHT (fightGetUp), clear of whoever stands there (getUpRoom).
    parts.push((from) => fightGetUp(from, after, getUpRoom(start, from, params.other, after, settings), settings));
  }
  const chained = chainMoves(start, parts);
  const result = marked(chained, start.t, "knockdown");
  if (out) result.marks.out = chained.end.t;
  else result.marks.ready = chained.end.t;
  delete result.flow;
  return result;
}

// FAST GET-UP IN A FIGHT (K11, Arthur, round 10: "his arms push it up hard — 'boom' — you should be able
// to see that push. When he gets pushed up, then his legs extend out so he's back in fighting mode, and he
// gets his hands out a little"; "In the middle of a fight he needs to freak out like 'oh no, he's going to
// attack me'"). From lying on the back: sit up, both hands planted flat on the floor behind the hips
// (elbows bent: loaded), the front foot planted -> (GET UP CLEAR: someone standing close? it scoots back
// on its hands and feet first) -> BOOM: the arms straighten hard, the hips come off the floor, the back
// leg swings under -> the legs extend into the loose fighting stand, the hands off the floor and out a
// little. About 2 s fresh (GET_UP_PACE); slower the more it hurts (never the slow get-up of a lone fall).
const GET_UP = { hands: 0.15, front: 0.3, sitLean: -50, boomLean: -55, boomHigh: 0.12, boomAhead: 0.05, clear: 0.012 };
// GET-UP PACE (U12, Arthur, round 12: "He gets up too fast. He kicks his legs unbelievably fast at the same
// time he gets up. It needs to be two or three times slower ... my sister would say 'what is he doing?'"):
// the base seconds of each part of BOTH fight get-ups (fightGetUp here, kipUp in grapple.ts), ONE THING
// AFTER ANOTHER, never two at once: a beat lying still -> (someone close: the knees draw up, then the legs
// push it back along the floor — a slow, steady push, not a kick) -> it sits up onto its hands -> loads the
// arms -> BOOM, the arms push HARD (the only quick part: the push you see) -> the legs come under it -> it
// stands, hands out a little. About 2 s from lying still to standing when fresh (1.8-2.5 s); the mood and
// speed stretch it (and the hurt `pace`), the same at every fps. The slow parts are settle beats so a high
// energy never hurries them (energy only sharpens the push).
// NO SLIDE, BACK HOP (G13, Arthur, round 12: "he slides his feet too much — he almost looks like he's sliding
// down a mountain ... the ground has FRICTION ... instead of going up forward or straight up, he gets up
// BACKWARDS: a little hop backwards ... so his spine leans backwards ... to get some space between them";
// "when he's in the squat ... he does that part a little too fast"): no scoot any more — whatever touches
// the floor stays put while it touches it; the space comes from the rise: out of the crouch it pushes off
// and HOPS back (HOP_BACK, the spine leaning back), lands on both feet and settles (hopAir, hopLand, a
// slower stand).
// (Round 13 review, Arthur: rising "hypersonic fast" -> twice as slow (push, land); "remove that delay" before
// the push back -> no crouched pause: it flows from rising straight into the hop.)
// (Round 15: hopPush 0.12 + hopAir 0.16 split into load 0.1, the leg push 0.08 and the rise 0.1: same total.)
export const GET_UP_PACE = { lie: 0.3, sitUp: 0.5, load: 0.2, push: 0.28, land: 0.44, legsUnder: 0.4, hopPush: 0.1, hopExtend: 0.08, hopAir: 0.18, hopLand: 0.21, squash: 0.08, stand: 0.45 };
// How far (x height) the back hop carries it: at least `min`, more (up to `max`) when someone is close.
// (Arthur, round 13: "it has to get up FIRST, then push itself back a little" and "reduce the lean behind
// him by 2x": the hop starts from nearly standing (RISE_FIRST: knees only a little bent) and the spine leans
// back only a few degrees.)
export const HOP_BACK = { min: 0.3, max: 0.46, lean: -6, landLean: -2.5, lift: 0.13 }; // (lift: round 15, Arthur: the feet-together moment "only visible for one frame" -> a higher hop, longer in the air) // (round 13: "dashes back twice as much")
export const RISE_FIRST = 0.035; // x height: how far the hips are still below standing as the back hop pushes off
// THE HOP IS A JUMP (H15, Arthur, round 15: "If you hop without anticipation it looks like you're floating,
// because they can't see your legs push ... his legs are just bent and then he goes airborne somehow ... Your
// legs need to EXTEND: they're already bent, now straighten them and put them a little together, so the
// viewer can see he hopped back"): LOAD (knees bent) -> PUSH (hopTakeOff: the legs straighten FAST while both
// feet are still planted where they stand; the hips rise) -> AIR (hopAirLegs: the feet leave the floor and
// come a little together under the body, legs fairly straight; the lift rises quickly) -> LAND (feet apart,
// knees give) -> settle. FRICTION: the feet only move toward each other once they are off the floor.
// (Round 15, Arthur: "put them a bit closer together so it looks like he pushed": in the air the feet come in
// to about a fifth of the stance width — the push reads.)
export const HOP_LEGS = { back: 0.005, straight: 0.993, together: 0.2, ahead: 0.02, airDrop: 0.012, touch: 0.03, touchLift: 0.012 };
// The take-off key: both legs as straight as the planted `feet` let them be, the hips at `at` (same origin).
export function hopTakeOff(pose: PoseAngles, feet: Feet, at: number): PoseAngles {
  const drop = Math.max(backLegDrop(feet, at, HOP_LEGS.straight), backLegDrop({ l: feet.l, r: feet.l }, at, HOP_LEGS.straight));
  return safePose(plantedLegs(pose, feet, at, drop));
}
// In the air: the feet a little together (`together` x the stance width), just ahead of the hips (trailing the
// hop back), legs fairly straight.
export function hopAirLegs(pose: PoseAngles, feet: Feet): PoseAngles {
  const half = ((feet.l - feet.r) * HOP_LEGS.together) / 2;
  return safePose(plantedLegs(pose, { l: HOP_LEGS.ahead + half, r: HOP_LEGS.ahead - half }, 0, HOP_LEGS.airDrop));
}
// Where the hips are at the top of the hop: the same speed back all the way through the air (no hanging).
// EARTH GRAVITY (round 15, Arthur: "he hops back way too fast — it looks like gravity on Jupiter. It's gravity on
// Earth; he has strong legs for Earth's gravity"): the time in the air comes from how high the hop goes and
// gravity (jump.ts GRAVITY) — up sqrt(2 x lift / g), down the same (hopAir 0.141 s, hopLand 0.141 + the touch-down)
// — never from the mood or energy: gravity is the same for everyone. realSeconds gives a beat that long in real
// time whatever its kind would otherwise make of it.
export const HOP_RISE = Math.sqrt((2 * HOP_BACK.lift) / GRAVITY);
export const realSeconds = (kind: "action" | "settle", seconds: number, settings: MoveSettings) => (seconds * seconds) / Math.max(1e-3, beatSeconds(kind, seconds, settings));
export const hopTopAt = (takeOffAt: number, landAt: number) => takeOffAt + ((landAt - takeOffAt) * GET_UP_PACE.hopAir) / (GET_UP_PACE.hopAir + GET_UP_PACE.hopLand - HOP_LEGS.touch);
// LAND, NO SKID: the travel back ends just above the floor (`touchLift`), the feet apart and the legs still
// long (`touch`); then the feet come straight down and the knees give (`landed`). (`k` stretches the seconds.)
export function hopLandBeats(touch: PoseAngles, landed: PoseAngles, at: number, k: number, height: number, name?: string): PlacedBeat[] {
  return [
    // (The feet stay together through most of the fall — the pose eases IN — and only spread just before they land.)
    { kind: "settle", ease: "in", xEase: "linear", liftEase: "in", pose: touch, seconds: (GET_UP_PACE.hopLand - HOP_LEGS.touch) * k, at, contacts: [], lift: HOP_LEGS.touchLift * height },
    { kind: "settle", ease: "out", liftEase: "linear", pose: landed, seconds: HOP_LEGS.touch * k, at, ...(name ? { name } : {}) },
  ];
}
const unitOf = (pose: PoseAngles) => forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
// Both hands flat on the floor at `x` (x height, same origin as the hips' `hipsX`), the hips `high` above it.
function handsOnFloor(pose: PoseAngles, hipsX: number, high: number, x: number): PoseAngles {
  const s = unitOf(pose), dy = high - GET_UP.clear - s.neck.y;
  return safePose(handTo(handTo(pose, "l", x + 0.012 - hipsX - s.neck.x, dy), "r", x - 0.012 - hipsX - s.neck.x, dy));
}
function fightGetUp(from: Stance, after: number, back: number, settings: MoveSettings): MoveOutput {
  const pace = 1 + 0.5 * clamp01(after); // (GET-UP PACE: the base is already slow; hurt adds up to half again)
  const F = fightFeet(feetOf(STAND)), g = guardAt(F);
  const X = GET_UP.front - (F.l - g); // where the hips stand before the hop (x height, from the lying hips)
  // NO SLIDE (friction): it gets up where it lies; the room it needs comes from the back hop (and, if
  // someone is still too close after it, fighting steps back — lifted and placed, never slid).
  const hop = Math.min(HOP_BACK.max, Math.max(HOP_BACK.min, back)), more = Math.max(0, back - hop);
  // Sitting up on the floor, knees up: the front foot planted ahead, the back foot loose nearer, hands behind.
  const sitBody = (lean: number, head: number) => footAt(footAt(withPose(STAND, { lean, head }), "l", GET_UP.front, 0.006), "r", 0.19, 0.004);
  const sit = handsOnFloor(sitBody(GET_UP.sitLean, 18), 0, 0.006, -GET_UP.hands);
  const loaded = handsOnFloor(sitBody(GET_UP.sitLean - 6, 22), 0, 0.006, -GET_UP.hands);
  // BOOM: arms straight, hips up off the floor over the hands and the front foot, the back leg swinging under.
  const high = GET_UP.boomHigh, ahead = GET_UP.boomAhead;
  const boomBody = footAt(footAt(withPose(STAND, { lean: GET_UP.boomLean, head: 6 }), "l", GET_UP.front - ahead, high), "r", GET_UP.front - (F.l - F.r) - ahead, high - 0.05);
  const boom = handsOnFloor(boomBody, ahead, high, -GET_UP.hands);
  // The legs extend: up into a low fighting crouch (hands coming off the floor, out a little), then the
  // BACK HOP: it pushes off, the spine leaning back away from the other, in the air a moment, lands on both
  // feet `hop` further back (knees giving) and settles into the stand.
  const arms = stanceArms(settings.guard);
  const crouch = safePose(plantedLegs(withPose(arms, { lean: 18, head: -4 }), F, g - 0.03, 0.09));
  // (Nearly standing — as high as the planted feet let the hips be, knees only a little bent to push.)
  // (LOAD straight up over where it crouched; THE HOP IS A JUMP: the take-off key straightens the legs on the
  // planted feet, then in the air the feet come a little together.)
  const pushOff = safePose(plantedLegs(withPose(arms, { lean: 4, head: 2 }), F, g - 0.03, backLegDrop(F, g - 0.03) + RISE_FIRST));
  const takeOff = hopTakeOff(withPose(arms, { lean: -1, head: 4 }), F, g - 0.03 - HOP_LEGS.back);
  const air = hopAirLegs(withPose(arms, { lean: HOP_BACK.lean, head: 8 }), F);
  const touch = safePose(plantedLegs(withPose(arms, { lean: HOP_BACK.landLean, head: 6 }), F, g, backLegDrop(F, g)));
  const landed = safePose(plantedLegs(withPose(arms, { lean: HOP_BACK.landLean, head: 4 }), F, g, 0.07));
  const ready = slumpedGuard(F, after, g, settings.guard);
  // (On the way up the hands lift off the floor while they move back and plant again: no hand slides.
  // The feet too: they come in through the air, then plant.)
  const risingBody = footAt(footAt(withPose(STAND, { lean: (from.pose.lean + GET_UP.sitLean) / 2, head: 20 }), "l", GET_UP.front + 0.08, 0.04), "r", 0.3, 0.04);
  // (GET-UP PACE: sitting up is one steady movement — slow out of lying, even through the middle, easing
  // into the sit — not a jerk at every picture.)
  const P = GET_UP_PACE, sitUp = P.sitUp * pace;
  const beats: PlacedBeat[] = [{ kind: "settle", ease: "in", pose: handsOnFloor(risingBody, 0, 0.04, 0.03), seconds: 0.4 * sitUp, at: 0, contacts: [] }];
  for (const u of [1 / 3, 2 / 3]) beats.push({ kind: "settle", ease: "linear", pose: handsOnFloor(blendPose(risingBody, sitBody(GET_UP.sitLean, 18), u), 0, 0.006 + 0.034 * (1 - u), 0.03 - u * (0.03 + GET_UP.hands)), seconds: 0.2 * sitUp, at: 0, contacts: [] });
  beats.push(
    { kind: "settle", ease: "out", pose: sit, seconds: 0.2 * sitUp, at: 0, contacts: [] },
    { kind: windKind(settings), pose: loaded, seconds: P.load * pace, at: 0, contacts: ["lFoot"] },
    { kind: "action", ease: "out", pose: boom, seconds: P.push * pace, at: ahead, contacts: ["lFoot"], name: "push" },
    { kind: "settle", ease: "smooth", pose: crouch, seconds: P.legsUnder * pace, at: X - 0.03, name: "up", contacts: ["lFoot", "rFoot"] },
    { kind: "settle", ease: "smooth", pose: pushOff, seconds: P.hopPush * pace, at: X - 0.03, contacts: ["lFoot", "rFoot"] },
    { kind: "action", ease: "in", pose: takeOff, seconds: P.hopExtend * pace, at: X - 0.03 - HOP_LEGS.back, contacts: ["lFoot", "rFoot"], name: "takeOff" },
    { kind: "action", ease: "smooth", xEase: "linear", liftEase: "out", pose: air, seconds: realSeconds("action", HOP_RISE, settings), at: hopTopAt(X - 0.03 - HOP_LEGS.back, X - hop), contacts: [], lift: HOP_BACK.lift * settings.height, name: "hop" },
    ...hopLandBeats(touch, landed, X - hop, pace, settings.height),
    { kind: "hold", pose: landed, seconds: P.squash * pace, at: X - hop }, // (the landing squash, held a moment)
    { kind: "settle", pose: ready, seconds: P.stand * pace, at: X - hop, recover: true },
  );
  const up = placedBeatsToKeys(from, beats, settings);
  return more > 0.02 ? chainMoves(from, [() => up, (f) => fightSteps(f, -more * settings.height, settings)]) : up;
}
// GET UP CLEAR (K11, round 11: getting up over its feet put it nose to nose with the attacker): how far
// (x height) a knocked-down figure scoots back before it gets up, so it stands at fighting distance from
// the other (`o`, from the start hips) and no part of them overlaps on the way up.
function getUpRoom(start: Stance, lying: Stance, o: GetHitParams["other"], after: number, settings: MoveSettings): number {
  if (!o) return 0;
  const way = start.facing === "left" ? -1 : 1;
  const lyingAt = ((lying.x - start.x) * way) / settings.height;
  const F = fightFeet(feetOf(STAND)), g = guardAt(F);
  const standAt = lyingAt + GET_UP.front - (F.l - g);
  const them = forwardKinematics(o.pose, o.facing === "same" ? "right" : "left", { x: o.dx, y: 0 }, 1, "normal", false);
  const theirFront = Math.min(...Object.entries(them).map(([n, p]) => p.x - (n === "head" ? HEAD_RADIUS.normal : 0)));
  const myFront = Math.max(...Object.entries(unitOf(slumpedGuard(F, after, g, settings.guard))).map(([n, p]) => p.x + (n === "head" ? HEAD_RADIUS.normal : 0)));
  const most = Math.min(o.dx - FIGHT_GAP, theirFront - PERSONAL_SPACE / 2 - myFront, theirFront - 0.05 - GET_UP.front + (standAt - lyingAt));
  // (the third: the sitting front foot stays clear of their feet too)
  return Math.min(0.8, Math.max(0, standAt - most));
}

// How far (px) behind where it started a move takes any part of the body (the head's edge included).
function reachBehind(out: MoveOutput, start: Stance, settings: MoveSettings): number {
  const way = start.facing === "left" ? -1 : 1;
  let most = 0;
  for (const key of out.keys) {
    const s = forwardKinematics(key.pose, start.facing, { x: key.x, y: 0 }, settings.height, "normal", false);
    for (const [name, p] of Object.entries(s)) most = Math.max(most, (start.x - p.x) * way + (name === "head" ? HEAD_RADIUS.normal * settings.height : 0));
  }
  return most;
}

// BLOCK (roadmap V1): the guard stops the punch. The forearms come up in front of the face just before it
// lands (the fighter sees it coming) and the chin tucks in behind them; the blow pushes the whole body
// back a little over its planted feet (the head barely moves: the arms took it); then the guard comes
// back. Marks: `hit` (the fist meets the arms; the move starts a moment before), `block`, `ready`.
function blocked(start: Stance, feet0: Feet, k: number, after: number, slow: number, settings: MoveSettings): MoveOutput {
  const push = -(0.035 + 0.025 * Math.min(1.5, k));
  const up = blockPose(start.pose, feet0, 0, after, 0);
  const pushed = blockPose(start.pose, feet0, push, after, 5 + 6 * k);
  const beats: PlacedBeat[] = [
    { kind: "action", ease: "smooth", pose: up, seconds: 0.13, at: 0, name: "raise" },
    { kind: "action", ease: "out", pose: pushed, seconds: 0.07, at: push, name: "react" },
    { kind: "hold", pose: pushed, seconds: 0.06, at: push },
    { kind: "settle", pose: slumpedGuard(feet0, after, 0, settings.guard), seconds: 0.26 * slow, at: 0, name: "ready", recover: true },
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  const hit = out.marks.raise ?? start.t;
  return { ...out, marks: { ...out.marks, hit, block: hit } };
}

// PARRY (round 12, Arthur: "Blue gets his arm, pushes it out of the way, and then he quickly kicks him,
// punches him"): the fighter sees the punch coming and, just as it arrives, the LEAD forearm meets the
// punching arm at the wrist from the side, where a block meets it (ARMS_AHEAD in front of the face), and
// SWEEPS it aside: the hand pushes on up and across, in front of the face (never round the outside of the
// head), while the chest leans back off the line and the chin tucks, so the fist goes past the head. No
// damage, no push back; the guard is back at once (mark `ready` early) and the back hand stays at the
// chin, so the counter comes fast. Marks `hit` (forearm on the wrist), `parry`, `ready`.
function parried(start: Stance, feet0: Feet, after: number, settings: MoveSettings): MoveOutput {
  const meet = parryPose(start.pose, feet0, 0, after, 0);
  const swept = parryPose(start.pose, feet0, -0.02, after, 1);
  const beats: PlacedBeat[] = [
    { kind: "action", ease: "smooth", pose: meet, seconds: 0.12, at: 0, name: "raise" },
    { kind: "action", ease: "out", pose: swept, seconds: 0.09, at: -0.02, name: "react" },
    { kind: "settle", pose: slumpedGuard(feet0, after, 0, settings.guard), seconds: 0.18, at: 0, name: "ready", recover: true },
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  const hit = out.marks.raise ?? start.t;
  return { ...out, marks: { ...out.marks, hit, parry: hit } };
}
// The lead (l) forearm across the punch's wrist (`sweep` 0: where the fist stops, about ARMS_AHEAD in
// front of the face, chin high) or pushed on up and across in front of the face (`sweep` 1, the chest
// leaning back off the line); the back hand stays at the chin.
function parryPose(from: PoseAngles, feet: Feet, at: number, hurt: number, sweep: number): PoseAngles {
  const lean = GUARD.lean + 6 + 10 * clamp01(hurt) - 9 * sweep;
  const lead = sweep > 0 ? handAt(0.075, 0.16) : armThrough(ARMS_AHEAD + 0.025, 0.005);
  const upper = withPose(from, {
    lean, head: GUARD.head + 8 + 6 * sweep,
    ...armFromWorld(lean, "l", lead),
    ...armFromWorld(lean, "r", handAt(0.07, 0.03)),
  });
  return plantedLegs(upper, feet, at, legsDrop(feet, at) + 0.015);
}
// The arm (world angles) whose FOREARM crosses the point `fwd` in front of and `up` above the shoulder (x
// the figure's height), nearly upright (the hand above the point, the elbow below): a forearm across a
// punch's wrist. (The most upright forearm the upper arm can reach it with; else the hand on the point.)
function armThrough(fwd: number, up: number): WorldArm {
  const a = PROPORTIONS.upperArm, b = PROPORTIONS.forearm;
  for (const fore of [165, 158, 172, 150, 142, 135]) {
    const r = (fore * Math.PI) / 180, dx = Math.sin(r), dy = -Math.cos(r);
    const dot = fwd * dx + up * dy, disc = dot * dot - (fwd * fwd + up * up) + a * a;
    if (disc < 0) continue;
    for (const s of [(dot + Math.sqrt(disc)) / b, (dot - Math.sqrt(disc)) / b]) {
      if (s < 0.45 || s > 0.92) continue;
      const ex = fwd - s * b * dx, ey = up - s * b * dy;
      const upper = (Math.atan2(ex, -ey) * 180) / Math.PI;
      if (fore - upper >= 25 && fore - upper <= 150) return { upper, fore };
    }
  }
  return handAt(fwd, up);
}
// Forearms up in front of the face, elbows forward, chin tucked; `back` = how far the blow tips it back.
function blockPose(from: PoseAngles, feet: Feet, at: number, hurt: number, back: number): PoseAngles {
  const lean = GUARD.lean + 6 + 10 * clamp01(hurt) - back;
  const upper = withPose(from, {
    lean, head: GUARD.head + 12 - 0.5 * back,
    ...armFromWorld(lean, "l", { upper: 80, fore: 176 }),
    ...armFromWorld(lean, "r", { upper: 70, fore: 170 }),
  });
  return plantedLegs(upper, feet, at, legsDrop(feet, at) + 0.015);
}

// GRAB (round 10, Arthur's picture 72: "blue dashed, but black grabbed and stopped the dash punch"): the
// fighter sees the fist coming and catches it in BOTH HANDS: the hands come forward together to where the
// fist will be (in front of the face, where a block meets it) just before it lands, so they are really on
// it; the fist's weight pushes the hands in a little and the body back over its planted feet (the eyes on
// the fist); then it lets go back into the guard. (The puncher still pulls his fist back as after any
// punch — he is not yet held and stopped dead — so the hands only hold it for a moment.) Marks `hit`,
// `grab`, `ready`.
function grabbed(start: Stance, feet0: Feet, k: number, after: number, slow: number, settings: MoveSettings): MoveOutput {
  const push = -(0.03 + 0.02 * Math.min(1.5, k));
  const reach = grabPose(start.pose, feet0, 0, after, 0, 0);
  const caught = grabPose(start.pose, feet0, push, after, 4 + 5 * k, 1);
  const beats: PlacedBeat[] = [
    { kind: "action", ease: "smooth", pose: reach, seconds: 0.14, at: 0, name: "raise" },
    { kind: "action", ease: "out", pose: caught, seconds: 0.08, at: push, name: "react" },
    { kind: "hold", pose: caught, seconds: 0.04, at: push },
    { kind: "settle", pose: slumpedGuard(feet0, after, 0, settings.guard), seconds: 0.3 * slow, at: 0, name: "ready", recover: true },
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  const hit = out.marks.raise ?? start.t;
  return { ...out, marks: { ...out.marks, hit, grab: hit } };
}
// Both hands on the fist, where a blocked or grabbed fist stops (ARMS_AHEAD in front of the face, about
// chin high): one hand over it, one under it (elbows forward and down); `give` 0..1 = how far the fist's
// weight has pushed the hands in, `back` = how far it tips the body back.
function grabPose(from: PoseAngles, feet: Feet, at: number, hurt: number, back: number, give: number): PoseAngles {
  const lean = GUARD.lean + 4 + 10 * clamp01(hurt) - back;
  const fwd = ARMS_AHEAD - 0.005 - 0.015 * give;
  const upper = withPose(from, {
    lean, head: GUARD.head + 6 - 0.5 * back,
    ...armFromWorld(lean, "l", handAt(fwd, 0.06)),
    ...armFromWorld(lean, "r", handAt(fwd, 0.03)),
  });
  return plantedLegs(upper, feet, at, legsDrop(feet, at) + 0.015);
}
// The arm (world angles, the elbow bending its usual way) that puts the hand `fwd` in front of and `up`
// above the shoulder (x the figure's height).
function handAt(fwd: number, up: number): WorldArm {
  const a = PROPORTIONS.upperArm, b = PROPORTIONS.forearm;
  const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, Math.hypot(fwd, up)));
  const deg = (v: number) => (Math.acos(Math.min(1, Math.max(-1, v))) * 180) / Math.PI;
  const bend = 180 - deg((a * a + b * b - d * d) / (2 * a * b));
  const upper = (Math.atan2(fwd, -up) * 180) / Math.PI - deg((a * a + d * d - b * b) / (2 * a * d));
  return { upper, fore: upper + bend };
}

// ALMOST FALLS, CATCHES ITSELF (roadmap V1; round 9, Arthur's drawing of being "almost knocked over":
// "for any stick figure, whether on the right or left side"). A big hit throws the body OFF BALANCE:
// - THE POSE IT REACHES (THROWN OFF BALANCE): the head and chest thrown BACK, past the hips; one arm flung
//   UP over the head (the elbow thrown up in front of the face, the forearm over the top of the head), the
//   other's elbow flung BACK at shoulder height (the hand by the chest); standing on the bent BACK leg, the front leg straight out in
//   front with its foot off the floor. (Both arms are up, but never both straight up.)
// - THE WAY INTO IT is a chain, each part a moment after the one before (OVERLAPPING ACTION): the hit SNAPS
//   THE HEAD back first (the chest only starts to go, the hand on the flung side comes up to the face);
//   the BODY FOLLOWS (the chest goes back, the weight onto the back foot, the front foot leaves the floor); the ARMS FLY
//   UP last, lagging behind the body, so they are still going up as it tips back onto the back foot and
//   teeters there. Every part keeps going the one way it set off: no arm changes its mind on the way
//   (no flailing, nothing round in circles).
// - STRAIGHT LINE, CLOSE TO THE HEAD (Arthur, round 10: "the arm bends weird and tries to go around the
//   head again... go in a STRAIGHT LINE, not around the head; don't be afraid to get closer to the head"):
//   the flung-up hand goes the short straight way from the chest, up past the face, over the head — and
//   back down the same way — never swung out on a straight arm round the outside of the head. The ELBOW
//   KEEPS BENDING THE WAY IT BENDS all the way (it never flips to the other side on the way: a flip means
//   the arm straightens out, and the hand sweeps round wide).
// - ALMOST FALLS = A CATCHING STEP BACK (Arthur, round 11: "If he almost fell down he would do that current
//   pose, but then he would take a step backwards: the leg that is in the air steps behind him. And that
//   pose should stay a little less time so it's faster, like he's almost losing balance"): thrown into the
//   teeter FAST, it hangs there a little longer than any other pose (longer for a harder hit) but only a
//   moment — never stuck on one foot — then the LIFTED leg swings BACK past the standing foot and PLANTS
//   BEHIND it (a longer step for a harder hit), the weight falling back onto it (the knees give); the arms
//   come down the way they went up, into the loose (slumped) stance over the new feet. No fall. The
//   standing foot never slides; the stepping foot lifts and plants. Marks `react`, `teeter`, `caught`,
//   `ready`. Everything is in the figure's own forward/back (whichever foot is in front), so it works
//   facing either way.
const FLUNG_UP: WorldArm = { upper: 150, fore: 228 };
const FLUNG_BACK: WorldArm = { upper: -78, fore: 58 };
function almostFalls(start: Stance, feet0: Feet, k: number, after: number, slow: number, settings: MoveSettings): MoveOutput {
  // (Hit again while an arm is still up from the last hit: that arm is the one flung up again.)
  const raised = (side: "l" | "r") => worldArm(start.pose, side).upper;
  let up = upArm(k);
  if (raised(other(up)) > 90 && raised(other(up)) > raised(up) + 40) up = other(up);
  const down = other(up);
  const hard = clamp01((k - CATCH_AT) / (KNOCKDOWN_AT - CATCH_AT));
  const a0 = worldArm(start.pose, up), b0 = worldArm(start.pose, down);
  // (In the snap an arm only gets part of the way — the arms lag behind the head — so it never whips
  // round in one picture.)
  const lag = (from: WorldArm, to: WorldArm, most = 60) => {
    const d = Math.max(Math.abs(to.upper - from.upper), Math.abs(to.fore - from.fore));
    return blendArm(from, to, d > most ? most / d : 1);
  };
  // The body (lean, head; the arms as world directions: `u` the arm flung up, `d` the other) over feet
  // `feet`, hips at `at`.
  const body = (feet: Feet, at: number, lean: number, head: number, u: WorldArm, d: WorldArm, drop: number) =>
    plantedLegs(withPose(start.pose, { lean, head, ...armFromWorld(lean, up, u), ...armFromWorld(lean, down, d) }), feet, at, drop);
  // 0. The head snaps back; the chest only starts to go; the flung-up hand comes to the face (elbow
  // forward, bent more: the hand in front of the chin), the other elbow starts back.
  const snapAt = -0.02 - 0.015 * k;
  const snapLean = start.pose.lean - 6;
  const snap = body(feet0, snapAt, snapLean, Math.max(-30, -26 - 4 * hard), lag(a0, { upper: Math.max(a0.upper + 30, 70), fore: Math.max(a0.fore + 50, 190) }), lag(b0, { upper: Math.min(b0.upper, -8), fore: 138 }), legsDrop(feet0, snapAt) + 0.012);
  // (Which foot is in front: after one catching step the other foot leads, so a second almost-fall
  // stands on whichever foot is behind.)
  const front: "l" | "r" = feet0.l >= feet0.r ? "l" : "r", rear = other(front);
  const standX = feet0[rear];
  const only = { l: standX, r: standX };
  // 1. Thrown straight back onto the back foot (it stays planted), FAST: the front foot leaves the floor,
  // the chest goes back; the arm going up rises still bent, the hand up past the forehead (close by it),
  // the other elbow goes back — the arms a moment behind the body.
  // (The hips never come forward of where the hit threw them: feet close together, it tips back over the heel.)
  const at2 = Math.min(standX + 0.06, snapAt - 0.015);
  // (Standing on the BENT back leg — a stiff straight leg reads as up on tiptoe.)
  const teeterDrop = legsDrop(only, at2) + 0.028;
  // (The lifted foot goes up and OUT in front, the front leg `straight` (nearly straight) out, as in
  // Arthur's drawing — however close together the feet were.)
  const off = (at: number, lean: number, head: number, u: WorldArm, d: WorldArm, lift: number, straight: number) => {
    const v = STAND_HIP - teeterDrop - lift;
    const out = Math.max(0.12, Math.sqrt(Math.max(0, (LEG * straight) ** 2 - v * v)));
    const lifted = { ...feet0, [front]: Math.max(feet0[front], at + out) } as Feet;
    return stepPose(body(feet0, at, lean, head, u, d, teeterDrop), lifted, lifted, at, teeterDrop, front, lift);
  };
  const tipAt = snapAt + 0.6 * (at2 - snapAt);
  const tip = off(tipAt, -15 - 2 * hard, -20, { upper: 118, fore: 220 }, { upper: -52, fore: 88 }, 0.045, 0.93);
  // 2. Thrown off balance: teetering back over the bent back leg, the front leg straight out with its
  // foot up, the head and chest thrown back past the hips, the arms flung up (the pose above).
  const teeter = off(at2, -22 - 3 * hard, -12, FLUNG_UP, FLUNG_BACK, 0.07, 0.975);
  // (A moving hold: it hangs there, still tipping a little, the arms still drifting up. ALMOST LOSING
  // BALANCE: a little longer than any other pose, but only a moment; a harder hit hangs a touch longer.)
  const hang = off(at2 - 0.01, -24 - 3 * hard, -13, { upper: FLUNG_UP.upper + 3, fore: FLUNG_UP.fore + 2 }, { upper: FLUNG_BACK.upper - 5, fore: FLUNG_BACK.fore - 2 }, 0.075, 0.975);
  const hangSeconds = 0.08 + 0.06 * hard;
  // 3. THE CATCHING STEP BACK: the lifted leg swings back past the standing foot (in the air as it passes
  // it) and plants BEHIND it, a longer step for a harder hit; the weight falls back onto it, the knees
  // give; the arms come down the way they went up (the flung-up hand back down past the face, the other
  // forward again).
  const step = 0.2 + 0.06 * hard;
  const to3 = { [rear]: standX, [front]: standX - step } as Feet;
  const at3 = standX - 0.55 * step;
  const land3 = body(to3, at3, -9 - 2 * hard, -5, { upper: 85, fore: 200 }, { upper: -14, fore: 116 }, legsDrop(to3, at3) + 0.04);
  const air3At = (at2 + at3) / 2;
  // (The foot half way is right beside the standing foot: `from` is set so the half-way spot is there.)
  const passing = { [rear]: standX, [front]: 2 * standX - to3[front] } as Feet;
  const air3 = stepPose(blendPose(hang, land3, 0.5), passing, to3, air3At, Math.max(teeterDrop, legsDrop(only, air3At) + 0.02), front, 0.06);
  const readyAt = (to3.l + to3.r) / 2;
  const stand: FootContact[] = [rear === "l" ? "lFoot" : "rFoot"];
  const beats: PlacedBeat[] = [
    { kind: "action", ease: "out", pose: snap, seconds: snapSeconds(0.08, start.pose, snap, settings), at: snapAt, name: "react" },
    { kind: "action", ease: "out", pose: tip, seconds: 0.07, at: tipAt, contacts: stand },
    { kind: "follow", pose: teeter, seconds: 0.08, at: at2, contacts: stand, name: "teeter" },
    { kind: "hold", pose: hang, seconds: hangSeconds, at: at2 - 0.01, contacts: stand },
    { kind: "action", ease: "smooth", pose: air3, seconds: 0.1, at: air3At, contacts: stand },
    { kind: "action", ease: "smooth", pose: land3, seconds: 0.09, at: at3, name: "caught" },
    { kind: "settle", pose: slumpedGuard(to3, after, readyAt, settings.guard), seconds: 0.42 * slow, at: readyAt, name: "ready", recover: true },
  ];
  return marked(placedBeatsToKeys(start, beats, settings), start.t, "catch");
}
type FootContact = "lFoot" | "rFoot";
// NATURAL STAND (Arthur, round 11: "unless specifically told to make a guard stance, no guard stance... the
// legs are in a specific stance the entire time"): a default fighter (FIGHT LOOK loose / high) waits with
// its feet in a natural relaxed stand — about under the hips, a small natural stagger — not the wide
// fighting stance. A strike still steps into the stance it needs; only `guard: "realistic"` waits in it.
export const NATURAL_FEET: Feet = { l: 0.04, r: -0.04 };
const spreadOf = (pose: PoseAngles) => { const f = feetOf(pose); return f.l - f.r; };
// In the stance it waits in (realistic: the fighting stance; otherwise the natural stand)?
export const readyFeet = (pose: PoseAngles, look?: GuardLook) => look === "realistic" ? spreadOf(pose) >= 0.2 : spreadOf(pose) > -0.05 && spreadOf(pose) < 0.17;
// Feet it can hold its guard on for a moment without stepping (a wide stance is fine inside a combo).
export const canSettle = (pose: PoseAngles, look?: GuardLook) => look === "realistic" ? spreadOf(pose) >= 0.2 : spreadOf(pose) > -0.05;
// The pose to STEP INTO to wait (realistic: the fighting stance; otherwise the natural stand).
export const standReadyPose = (pose: PoseAngles, hurt: number, look?: GuardLook): PoseAngles =>
  look === "realistic" ? fightReadyPose(pose, hurt, look) : slumpedGuard(NATURAL_FEET, hurt, guardAt(NATURAL_FEET), look);

// WALK OVER, NOT THE BOXER SHUFFLE (Arthur, round 11: "you're doing guard-stance steps. No. They should
// just walk over with their hands up a little — their hands not going left, right, left, right"): a default
// fighter (not `guard: "realistic"`) moves to its spot with ordinary walking steps — one foot passes the
// other, front or back — the hands held where they are (no arm swing), and ends in the NATURAL STAND.
function walkSteps(start: Stance, distance: number, settings: MoveSettings): MoveOutput {
  const feet0 = feetOf(start.pose);
  const d = distance / settings.height, dir = d < 0 ? -1 : 1;
  const goal: Feet = { l: d + NATURAL_FEET.l, r: d + NATURAL_FEET.r };
  // (The foot that ends furthest the way it goes takes the last long step; the other one comes up beside it.)
  const lead: "l" | "r" = dir > 0 ? "l" : "r", trail = other(lead);
  const from = dir > 0 ? Math.max(feet0.l, feet0.r) : Math.min(feet0.l, feet0.r);
  const span = (goal[lead] - from) * dir;
  // RIGHT GAIT FOR THE DISTANCE (round 14, Arthur: "walking fast looks weird"): ordinary steps at a natural
  // walking pace — a natural stride at most, each step as long as a natural walk's (a short step a little
  // quicker) — never a sped-up walk. A very short way is one or two calm steps.
  const pace = naturalWalkPace(settings.style, settings.speed, settings.energy);
  const n = span > 0.02 ? Math.max(1, Math.ceil(span / pace.stepLength - 1e-9)) : 0;
  const spots: { side: "l" | "r"; x: number }[] = [];
  for (let i = 1; i <= n; i += 1) spots.push({ side: (n - i) % 2 === 0 ? lead : trail, x: from + (goal[lead] - from) * (i / n) });
  if (!n) spots.push({ side: lead, x: goal[lead] });
  spots.push({ side: trail, x: goal[trail] });
  const drop = (feet: Feet, at: number) => legsDrop(feet, at) + 0.012;
  // (Real seconds, whatever the settings' tempo: a step of `length` x height.)
  const stepSeconds = (length: number) => pace.stepSeconds * (0.65 + 0.35 * Math.min(1, length / pace.stepLength));
  const air = (kind: "action" | "settle", real: number) => atLeast(kind, 0.01, real, settings);
  const beats: PlacedBeat[] = [];
  let feet = feet0, at = 0, pose = start.pose;
  spots.forEach((spot, i) => {
    if (Math.abs(feet[spot.side] - spot.x) < 0.01) return;
    const real = stepSeconds(Math.abs(spot.x - feet[spot.side]) / 2);
    const to = { ...feet, [spot.side]: spot.x } as Feet;
    const at1 = i === spots.length - 1 ? guardAt(to) : (to.l + to.r) / 2;
    const land = plantedLegs(start.pose, to, at1, drop(to, at1));
    const mid = (at + at1) / 2;
    // (Mid-step only the standing foot holds the hips up: their height is worked out from it alone — from
    // both feet still wide apart, the standing knee was pushed down to the floor.)
    const standing = feet[other(spot.side)];
    const lifted = stepPose(blendPose(pose, land, 0.5), feet, to, mid, Math.min(drop(feet, mid), drop({ l: standing, r: standing }, mid)), spot.side, 0.045);
    beats.push(
      { kind: "action", ease: "smooth", pose: lifted, seconds: air("action", 0.55 * real), at: mid, contacts: [`${other(spot.side)}Foot`] },
      { kind: i === spots.length - 1 ? "settle" : "action", ease: "smooth", pose: land, seconds: air(i === spots.length - 1 ? "settle" : "action", 0.45 * real), at: at1 },
    );
    feet = to; at = at1; pose = land;
  });
  if (!beats.length) beats.push({ kind: "settle", pose: start.pose, seconds: 0.05, at: 0 });
  return placedBeatsToKeys(start, beats, settings);
}

// FIGHTING STEPS (fights: PERSONAL SPACE, back to its spot): `distance` px, + forward, - back. Going back,
// the back foot steps first and the front foot follows; going forward, the front foot first and the back
// foot follows — always into the same stance, the guard up. More than about a sixth of the height takes
// more than one step. Each foot is in the air long enough to be seen even at 12 frames a second.
export function fightSteps(start: Stance, distance: number, settings: MoveSettings): MoveOutput {
  if (settings.guard !== "realistic") return walkSteps(start, distance, settings);
  const feet0 = feetOf(start.pose);
  const front: "l" | "r" = feet0.l >= feet0.r ? "l" : "r", rear = other(front);
  const dir = distance < 0 ? -1 : 1;
  const first = dir < 0 ? rear : front, second = other(first);
  const total = Math.abs(distance) / settings.height;
  // (Small steps: a step that opened the stance much wider would drop the hips into a lunge.)
  const steps = Math.max(1, Math.ceil(total / 0.15 - 1e-9)), d = (dir * total) / steps;
  const drop = (feet: Feet, at: number) => legsDrop(feet, at) + 0.012;
  const air = (seconds: number) => atLeast("action", seconds, 0.09, settings);
  const beats: PlacedBeat[] = [];
  let feet = feet0, at = 0, pose = start.pose;
  for (let i = 0; i < steps; i += 1) {
    const to1 = { ...feet, [first]: feet[first] + d } as Feet;
    const at1 = at + 0.45 * d, to2: Feet = { l: feet.l + d, r: feet.r + d }, at2 = at + d;
    const land1 = plantedLegs(start.pose, to1, at1, drop(to1, at1));
    const air1 = stepPose(blendPose(pose, land1, 0.5), feet, to1, (at + at1) / 2, drop(feet, (at + at1) / 2), first, 0.03);
    const land2 = plantedLegs(start.pose, to2, at2, drop(to2, at2));
    const air2 = stepPose(blendPose(land1, land2, 0.5), to1, to2, (at1 + at2) / 2, drop(to1, (at1 + at2) / 2), second, 0.03);
    beats.push(
      { kind: "action", ease: "smooth", pose: air1, seconds: air(0.08), at: (at + at1) / 2, contacts: [`${second}Foot`] },
      { kind: "action", ease: "smooth", pose: land1, seconds: air(0.06), at: at1 },
      { kind: "action", ease: "smooth", pose: air2, seconds: air(0.07), at: (at1 + at2) / 2, contacts: [`${first}Foot`] },
      { kind: i === steps - 1 ? "settle" : "action", ease: "smooth", pose: land2, seconds: air(0.07), at: at2 },
    );
    feet = to2; at = at2; pose = land2;
  }
  return placedBeatsToKeys(start, beats, settings);
}
export const stepBack = (start: Stance, distance: number, settings: MoveSettings) => fightSteps(start, -Math.abs(distance), settings);

// ---- Fight space (the planner's fight rules, plan.ts) ------------------------------------------------

// FIGHTING DISTANCE (x height, hip to hip): where two fighters who walk up to each other stand to fight —
// inside a straight punch's reach. PERSONAL SPACE: a strike never brings them closer than this (hips
// apart), so their heads and bodies never overlap or go through each other — still close enough for an
// uppercut (close = uppercut: the punch picks it).
export const FIGHT_GAP = 0.5;
export const PERSONAL_SPACE = 0.3;
// ...and their heads (eyes, x height) never come closer than two heads' width and a little.
export const HEAD_SPACE = 2 * HEAD_RADIUS.normal + 0.02;
// How much further forward (x height) a fighter's head hangs in its slumped guard than in a fresh one.
export const slumpReach = (hurt: number) => (PROPORTIONS.torso + PROPORTIONS.neck) * (Math.sin(((GUARD.lean + 22 * clamp01(hurt)) * Math.PI) / 180) - Math.sin((GUARD.lean * Math.PI) / 180));
// Fighters the plan starts closer than this (x height: within an overhand's reach) keep that distance:
// the plan put them there.
export const IN_RANGE = 0.75;
// A blocked hit counts as this much of its power (DAMAGE grows with power to the fourth: almost nothing).
export const BLOCKED = 0.4;
// A punch at a fighter who blocks lands on its forearms, this much (x height) in front of its face.
export const ARMS_AHEAD = 0.1;
// Who fights in a plan: anyone who takes a hit or strikes at someone.
export const isFighter = (actions: readonly { move: string; params?: Record<string, unknown> }[]) =>
  actions.some((a) => a.move === "getHit" || a.move === "coverUp" || a.move === "slammed" || ((a.move === "punch" || a.move === "kick" || a.move === "stompDown" || a.move === "groundPunch" || a.move === "liftSlam") && typeof a.params?.target === "string"));
// The library's "block" and "almostFall" are getHit with that result (so they count as hits taken).
const HIT_ALIASES: Record<string, HitResult> = { block: "block", almostFall: "catch" };
export function asGetHit<A extends { move: string; params?: Record<string, unknown> }>(action: A): A {
  const result = HIT_ALIASES[action.move];
  return result ? { ...action, move: "getHit", params: { ...action.params, result } } : action;
}

// ARRIVE IN THE GUARD (Arthur, round 7: the walk-in ended with a heavy step, then a stamp into the guard):
// a walk into a fight doesn't stop, stand up and then stamp its front foot forward into the fighting
// stance. Its last step lands IN the stance (front foot forward, the feet a stance apart, both down) and
// the hands come up into the guard over the last steps. `walk(d)` makes a walk of d px; the walk is cut on
// the landing that leaves the hips (once settled in the guard) nearest `distance` px on.
// HANDS UP, NO ARM SWING (round 11, Arthur: "walk over with their hands up a little — their hands not going
// left, right, left, right"): a default fighter (not `guard: "realistic"`) holds its hands up a little
// for the whole walk, from its first step; `stop` (nothing to strike next): it just walks there and stops
// in its natural stand (NATURAL STAND) — no landing in a fighting stance.
export function walkIntoGuard(walk: (distance: number) => MoveOutput, start: Stance, distance: number, settings: MoveSettings, stop = false): MoveOutput {
  // (Too short a way for a walk at all — a gait of no steps — it is a step or two in place.)
  if (Math.abs(distance) < 0.06 * settings.height) return fightSteps(start, distance, settings);
  if (settings.guard !== "realistic") {
    const held = (out: MoveOutput) => holdHandsUp(out, start, settings);
    if (stop) return held(walk(distance));
    const out = walkIntoStance(walk, start, distance, settings);
    return held(out);
  }
  return walkIntoStance(walk, start, distance, settings);
}
// (The walk's arms are replaced by the stance's — blended in over its first quarter second, then held.)
function holdHandsUp(out: MoveOutput, start: Stance, settings: MoveSettings): MoveOutput {
  const stance = stanceArms(settings.guard);
  const arms = ["lShoulder", "rShoulder", "lElbow", "rElbow"] as const;
  const keys = out.keys.map((k) => {
    const w = smooth01((k.t - start.t) / 0.25);
    if (w <= 0) return k;
    const pose = { ...k.pose };
    for (const name of arms) pose[name] = k.pose[name] + (stance[name] - k.pose[name]) * w;
    return { ...k, pose };
  });
  const last = keys[keys.length - 1];
  const flow = out.flow ? { ...out.flow, stance: { ...out.flow.stance, pose: keys[Math.max(0, out.flow.keys - 1)].pose } } : undefined;
  return { ...out, keys, end: { ...out.end, pose: last.pose }, ...(flow ? { flow } : {}) };
}
function walkIntoStance(walk: (distance: number) => MoveOutput, start: Stance, distance: number, settings: MoveSettings): MoveOutput {
  const H = settings.height, way = start.facing === "left" ? -1 : 1;
  const goal = start.x + way * distance;
  // The landing (both feet down, the lead foot a stance in front) whose settled guard is nearest the goal.
  const landing = (keys: MoveOutput["keys"]) => {
    let at = -1, off = Infinity;
    keys.forEach((k, i) => {
      if (i === 0 || (k.contacts ?? []).length < 2 || (k.lift ?? 0) > 1e-3) return;
      const f = feetOf(k.pose);
      // (A real fighting stance: not a long stride — a strike from a stance that wide can't keep its feet.)
      if (f.l - f.r < 0.2 || f.l - f.r > 0.38) return;
      const e = (k.x + way * guardAt(f) * H - goal) * way;
      // (Never past its spot toward the other one — the other walks up too, and they would end up on top of
      // each other (PERSONAL SPACE); short of it is fine: the guard steps in the rest of the way.)
      if (e > 0.03 * H) return;
      if (Math.abs(e) < Math.abs(off)) { off = e; at = i; }
    });
    return { at, off };
  };
  // (The walk is made a little longer and cut on that landing; its length is tuned until the landing is
  // where it should be.)
  // (Where the hips really are: planted feet put them there, planted.ts.)
  const planted = (d: number) => { const out = walk(d); return { ...out, keys: footPlanter(H)(out.keys) }; };
  // (A walk's steps depend on its length: try lengths a little past the goal, keep the best, then refine.)
  let extra = 0, full = planted(distance), { at: best, off } = { at: -1, off: Infinity };
  const consider = (more: number) => {
    const tryFull = planted(distance + more), tryLanding = landing(tryFull.keys);
    if (tryLanding.at >= 0 && Math.abs(tryLanding.off) < Math.abs(off)) { extra = more; full = tryFull; best = tryLanding.at; off = tryLanding.off; }
  };
  for (let more = 0.1; more <= 1.4 + 1e-9 && Math.abs(off) > 0.015 * H; more += 0.1) consider(more * H);
  for (let i = 0; i < 3 && best >= 0 && Math.abs(off) > 0.015 * H; i += 1) consider(Math.max(0.05 * H - distance, extra - off));
  // (No landing near enough: a plain walk, and the guard steps into its stance after it.)
  if (best < 0 || Math.abs(off) > 0.2 * H) return walk(distance);
  const end = full.keys[best];
  const from = Math.max(start.t, end.t - 0.45);
  const keys = full.keys.slice(0, best + 1).map((k) => {
    const w = smooth01((k.t - from) / Math.max(1e-6, end.t - from));
    if (w <= 0) return k;
    const pose = { ...k.pose };
    const stance = stanceArms(settings.guard); // (loose by default: FIGHT LOOK)
    for (const name of ["lean", "head", "lShoulder", "rShoulder", "lElbow", "rElbow"] as const) pose[name] = k.pose[name] + (stance[name] - k.pose[name]) * w;
    return { ...k, pose };
  });
  const last = keys[keys.length - 1];
  return { keys, end: { t: last.t, x: last.x, facing: start.facing, pose: last.pose }, marks: { arrived: last.t } };
}
const smooth01 = (v: number) => { const u = Math.min(1, Math.max(0, v)); return u * u * (3 - 2 * u); };

// Shift a fall's flight and landing by `dx` px: from the moment no foot is on the floor until the impact
// the hips drift there (fast at first, slowing), and everything after stays shifted.
function pushedBack(out: MoveOutput, dx: number): MoveOutput {
  const lift = out.keys.findIndex((k) => (k.contacts ?? []).length === 0);
  if (lift < 1) return out;
  // (Only once no foot is on the floor: a planted foot never slides.)
  const t0 = out.keys[lift].t, t1 = Math.max(t0 + 1e-3, out.marks.impact ?? out.end.t);
  const keys = out.keys.map((k) => {
    if (k.t <= t0) return k;
    const u = Math.min(1, (k.t - t0) / (t1 - t0));
    return { ...k, x: k.x + dx * (1 - (1 - u) * (1 - u)) };
  });
  return { ...out, keys, end: { ...out.end, x: out.end.x + dx } };
}


const marked = (out: MoveOutput, t: number, kind: Reaction): MoveOutput => ({ ...out, marks: { ...out.marks, hit: t, [kind]: t } });

// ---- Stomp ----------------------------------------------------------------------------------------

// STOMP (Arthur: "the red stick figure just walks and does a giant stomp and it makes everything
// exciting"; round 9, a mad stomp after a get-up: "it seems like he's not really mad and hits the floor
// with his feet; looks like he's skipping or struggling to walk"). A stomp is a STRIKE WITH THE FOOT,
// straight DOWN on a spot, so the strike rules hold:
// - EYES ON THE SPOT all the way through (the head tipped down at where the foot lands).
// - ANTICIPATION the opposite way, UP: the weight goes onto the standing leg, then the knee comes up HIGH
//   (the shin hanging under it, the foot cocked over the spot) and the body rises tall on the standing
//   leg — LEANING IN over the spot, never back (leaning back with the arms thrown up and out is a prance or
//   a skip). The fists come up TIGHT to the chest, elbows back: tension. It hangs there a moment.
// - ACTION: the foot SLAMS straight down, as fast as the body allows, and the fists are driven DOWN by the
//   hips at the same moment (arms almost straight), the chest pitching down into it.
// - IMPACT: the body stops dead on the planted feet — a JOLT (the head and shoulders jerk down past and
//   recoil up a little: a small shake), the knees give only a little (a deep two-knee landing reads as
//   landing from a hop) and both feet stay planted: no hop, no dip onto one leg (that is a limp).
// - Then up again — or, when another stomp follows, straight into it from there: the same beats every
//   time, so repeated stomps keep one rhythm.
// MOODS change it (the stomp's power is the mood's power, powerOf): angry and irritated stomp hardest,
// hunched in, fists tight; natural or heavy a little less; a HAPPY figure stamps for joy (chest up,
// fists pumped up by the shoulders, then pumped down, a bounce in the recoil); a ROBOT stomps stiff (no
// lean, straight arms swinging stiffly against the leg, even speed, no give, no shake); tired, sad or
// hurt bodies stamp small and weak, arms hanging. The standing foot never moves; the stomping foot
// lands back where it was. Marks `windup`, `stomp`.
export type StompParams = { size?: number };
// The stomp's arm shapes per mood (world directions; [the stomping side's arm, the other arm]).
type StompArms = { lift: [WorldArm, WorldArm]; slam: [WorldArm, WorldArm] };
const MAD_ARMS: StompArms = { lift: [{ upper: -42, fore: 96 }, { upper: -30, fore: 104 }], slam: [{ upper: -26, fore: -2 }, { upper: -16, fore: 4 }] };
const LOOSE_ARMS: StompArms = { lift: [{ upper: 6, fore: 20 }, { upper: -4, fore: 10 }], slam: [{ upper: -4, fore: 4 }, { upper: 2, fore: 8 }] };
const JOY_ARMS: StompArms = { lift: [{ upper: 62, fore: 172 }, { upper: 48, fore: 160 }], slam: [{ upper: 22, fore: 108 }, { upper: 14, fore: 100 }] };
const ROBOT_ARMS: StompArms = { lift: [{ upper: -24, fore: -24 }, { upper: 24, fore: 24 }], slam: [{ upper: 0, fore: 0 }, { upper: 0, fore: 0 }] };
// How tight (mad) the fists are per mood (0 = arms hanging loose, 1 = fists tight at the chest).
const STOMP_TIGHT: Partial<Record<MoveSettings["style"], number>> = { angry: 1, irritated: 0.9, heavy: 0.8, natural: 0.75, sneaky: 0.5, tired: 0.1, sad: 0, hurt: 0.15 };
const mixArms = (a: StompArms, b: StompArms, k: number): StompArms => ({
  lift: [blendArm(a.lift[0], b.lift[0], k), blendArm(a.lift[1], b.lift[1], k)],
  slam: [blendArm(a.slam[0], b.slam[0], k), blendArm(a.slam[1], b.slam[1], k)],
});
export function stomp(start: Stance, params: StompParams, settings: MoveSettings): MoveOutput {
  const size = Math.min(1.3, Math.max(0.5, Number(params.size ?? 1)));
  const style = settings.style, robot = isRobot(settings), happy = style === "happy";
  // How hard: the figure's power (energy and mood) x the size asked for.
  const p = Math.min(1.5, Math.max(0.4, size * powerOf(settings)));
  const tight = STOMP_TIGHT[style] ?? 0.75;
  const arms = robot ? ROBOT_ARMS : happy ? JOY_ARMS : mixArms(LOOSE_ARMS, MAD_ARMS, tight);
  const feet = feetOf(start.pose);
  // Stomp with the front foot (the one further forward); stand on the other.
  const front: "l" | "r" = feet.l >= feet.r ? "l" : "r";
  const stay = other(front);
  const only: Feet = { l: feet[stay], r: feet[stay] };
  // Posture: the mood's own lean, then leaning IN over the spot (a happy one stays chest up; a robot
  // stays straight up).
  const base = robot ? 0 : happy ? -3 : 0.6 * (STYLE_CHANGES[style].lean ?? 0) + 6 * tight;
  const pitch = robot ? 0 : happy ? 6 : 3 + 3 * p * Math.max(0.4, tight);
  // EYES ON THE SPOT: where the foot comes down (a happy one looks up from it more).
  // THE SPOT: in front of the standing foot (where the front foot is, or a short step ahead of the
  // standing foot when the feet are together: it stomps ON something, not on the spot it stands on).
  // Repeated stomps land on the same spot.
  const spot = Math.max(feet[front], feet[stay] + 0.1);
  const landFeet = { ...feet, [front]: spot } as Feet;
  const eyes = (pose: PoseAngles, at: number) => lookAtOwn(pose, { ahead: spot - at + 0.02, up: 0 }, happy ? 0.55 : 1);
  const body = (lean: number, a: [WorldArm, WorldArm]) => withPose(start.pose, { lean, ...armFromWorld(lean, front, a[0]), ...armFromWorld(lean, stay, a[1]) });
  // 1. The weight onto the standing leg, the fists starting up.
  const overStay = feet[stay] + 0.22 * Math.max(0, feet[front] - feet[stay]);
  const shift = eyes(plantedLegs(body(base * 0.6, [blendArm(worldArm(start.pose, front), arms.lift[0], 0.35), blendArm(worldArm(start.pose, stay), arms.lift[1], 0.35)]), feet, overStay, tallDrop(feet, overStay, robot ? 0.999 : 0.995) + 0.003), overStay);
  // 2. Knee UP high (thigh forward and up, the shin hanging under it), up tall on the standing leg.
  const kneeUp = (thigh: number, lean: number, a: [WorldArm, WorldArm]) => {
    const standing = plantedLegs(body(lean, a), only, overStay, tallDrop(only, overStay, robot ? 0.999 : 0.997), stay);
    const hip = Math.min(JOINT_LIMITS.lHip[1] - 2, thigh + lean);
    return eyes(withPose(standing, legOf(front, hip, Math.min(JOINT_LIMITS.lKnee[1], hip - lean + 8))), overStay);
  };
  const thigh = 52 + 36 * p;
  const lift = kneeUp(thigh, base, arms.lift);
  // (A moving hold: it hangs at the top, the knee still creeping up.)
  const hang = kneeUp(thigh + (robot ? 0 : 5), base + (robot ? 0 : 1), arms.lift);
  // 3. The slam: the foot down on the spot, the weight onto it, the fists driven down, the chest pitching
  // in; then the jolt past it and the small recoil (a robot: none).
  const slamAt = feet[stay] + 0.6 * (spot - feet[stay]);
  const give = robot ? 0 : 0.002 + 0.006 * p;
  const planted = (lean: number, a: [WorldArm, WorldArm], drop: number) => eyes(plantedLegs(body(lean, a), landFeet, slamAt, tallDrop(landFeet, slamAt, robot ? 0.999 : 0.995) + drop), slamAt);
  const slam = planted(base + pitch, arms.slam, give);
  const jolt = planted(base + pitch + 2.5 * p, arms.slam.map((a) => ({ upper: a.upper - 4 * p, fore: a.fore - 6 * p })) as [WorldArm, WorldArm], give + 0.004 * p);
  const recoil = planted(base + pitch - (robot ? 0 : happy ? 6 : 3), arms.slam.map((a) => ({ upper: a.upper + 3, fore: a.fore + (happy ? 14 : 6) })) as [WorldArm, WorldArm], Math.max(0, give - (happy ? 0.006 : 0.003)));
  // 4. Back to its rest, the feet staying where they are now.
  const moved = Math.abs(spot - feet[front]) > 1e-3;
  const restAt = moved ? feet[stay] + 0.5 * (spot - feet[stay]) : 0;
  const rest = moved ? plantedLegs(start.pose, landFeet, restAt, tallDrop(landFeet, restAt, 0.995)) : start.pose;
  const wind = windKind(settings);
  const beats: PlacedBeat[] = [
    { kind: wind, pose: shift, seconds: 0.14 * (robot ? ROBOT_WINDUP : 1), at: overStay },
    { kind: wind, pose: lift, seconds: (0.24 + 0.08 * p) * (robot ? ROBOT_WINDUP : 1), at: overStay, contacts: [`${stay}Foot`], lift: 0, name: "windup" },
    { kind: "hold", pose: hang, seconds: 0.1, at: overStay, contacts: [`${stay}Foot`] },
    // (As fast as the body allows: the speed limit for hands and feet, as for every strike.)
    { kind: "action", pose: slam, seconds: Math.max(...(["lHand", "rHand", "lFoot", "rFoot"] as const).map((joint) => actionSeconds(0.09, hang, slam, joint, settings))), at: slamAt, name: "stomp" },
    // (Each part of the jolt lasts a picture or more, so the shake is seen even at 12 a second.)
    { kind: "follow", pose: jolt, seconds: 0.1, at: slamAt },
    { kind: robot ? "hold" : "settle", pose: recoil, seconds: 0.12, at: slamAt },
    { kind: "hold", pose: recoil, seconds: 0.1, at: slamAt },
    { kind: "settle", pose: rest, seconds: 0.42, at: restAt, recover: true },
  ];
  return placedBeatsToKeys(start, beats, settings);
}

// ---- Fight rules the planner uses (plan.ts) ----------------------------------------------------------

// STRIKE POWER (Arthur: "How do you know it's a strong hit? If it had a lot of anticipation and it went,
// hit him"). Measured from the strike the attacker REALLY threw (its keys and marks), never from a label:
// - how far the fist or foot travels from the end of the wind-up to the hit (x the limb's length: a big
//   wind-up pulls it far back, so it has far to go — an overhand or a kick, not a jab);
// - how long the wind-up took (anticipation, from when the fist or foot starts going back; up to a second
//   counts);
// - how hard the body can hit right now (energy and style: angry hits harder, hurt or tired softer);
// - STRIKE WEIGHT (round 9): what hits. A leg weighs about three times an arm, so a foot carries more into
//   the hit than a fist moving the same way. DAMAGE grows with power to the fourth, so a kick's power
//   counts the fourth root of that weight (3^(1/4), about 1.32 times): the hurt it does grows with the
//   limb's weight. (So a kick hits at least as hard as a punch with the same wind-up, however short the
//   kick's own wind-up is.)
// Measured (300 px figures, round 9, in a plan): natural jab or cross about 0.67, power punch 1.16, low
// kick 1.16, mid kick 1.49, high kick 1.73; angry about 15% harder (capped at 2).
const ARM_LENGTH = PROPORTIONS.upperArm + PROPORTIONS.forearm;
export const LEG_WEIGHT = 3 ** 0.25;
export function strikePowerOf(out: MoveOutput, start: Stance, settings: MoveSettings): number {
  const m = out.marks;
  if (m.hit === undefined || m.windup === undefined) return 0;
  const from = Math.max(start.t, m.shift ?? m.guard ?? start.t);
  // Where a hand or foot is (x height, forward +), facing-independent.
  const way = start.facing === "left" ? -1 : 1;
  const spot = (k: MoveOutput["keys"][number], joint: "lHand" | "rHand" | "lFoot" | "rFoot") => {
    const p = forwardKinematics(k.pose, "right", { x: (way * k.x) / settings.height, y: 0 }, 1, "normal", false)[joint];
    return p;
  };
  const keys = out.keys.filter((k) => k.t >= m.windup - 1e-6 && k.t <= m.hit + 1e-6);
  let best = 0, joint: "lHand" | "rHand" | "lFoot" | "rFoot" = "rHand";
  for (const j of ["lHand", "rHand", "lFoot", "rFoot"] as const) {
    let length = 0;
    for (let i = 1; i < keys.length; i += 1) { const a = spot(keys[i - 1], j), b = spot(keys[i], j); length += Math.hypot(b.x - a.x, b.y - a.y); }
    if (length > best) { best = length; joint = j; }
  }
  // The wind-up starts where that hand or foot starts going back (after any step in to get in range).
  const before = out.keys.filter((k) => k.t >= from - 1e-6 && k.t <= m.windup + 1e-6);
  const furthest = before.reduce((a, k) => (spot(k, joint).x > spot(a, joint).x ? k : a), before[0] ?? out.keys[0]);
  const anticipation = Math.min(1, Math.max(0, m.windup - Math.max(from, furthest.t)));
  const foot = joint.endsWith("Foot");
  const reach = best / (foot ? LEG : ARM_LENGTH);
  return Math.min(2, (foot ? LEG_WEIGHT : 1) * 1.4 * (0.5 + 0.5 * powerOf(settings)) * (0.25 * reach + 0.6 * anticipation));
}

// DAMAGE (Arthur: "If he got hit with a very strong punch 10 times... he'd be slouching his back from all
// that pain. If he got hit 20–25 times by little hits, he's just fine"): each hit adds DAMAGE x power⁴ to
// how hurt the figure is (0 fine .. 1 beaten). To the fourth power (round 7: jabs now measure about 0.57),
// so a big hit (power 1.3) adds about 0.19 and a quick jab (0.57) about 0.007: three or four big hits leave
// a fighter slumped, about six beat it (well before ten); 25 little ones barely mark it.
export const DAMAGE = 0.065;
export const takeDamage = (hurt: number, power: number) => Math.min(1, clamp01(hurt) + DAMAGE * Math.min(1.6, Math.max(0, power)) ** 4);

// A hurt fighter moves like it (Arthur: "Big hits: they hurt fast, and recovery takes longer and
// longer"): less energy, and past half-hurt the hurt style (slower, weaker, bent).
export const HURT_STYLE_AT = 0.55;
// (HURT FIGHTS HARDER, round 16, Arthur: "hurt fights harder", "no more walking ... get there fast": in a
// fight the hurt look — a slow limp, every jog and run two to three times slower — only comes when it is
// nearly beaten (`styleAt`, the planner's QUICK_UNTIL_HURT); before that the damage shows in the slumped
// guard and the lower energy, and it still gets in there fast.)
export function hurtSettings(settings: MoveSettings, hurt: number, styleGiven: boolean, styleAt = HURT_STYLE_AT): MoveSettings {
  const h = clamp01(hurt);
  return { ...settings, energy: settings.energy * (1 - 0.45 * h), style: !styleGiven && h >= styleAt && settings.style !== "robot" ? "hurt" : settings.style };
}

// The pose a fighter waits in: its (slumped) guard, in its fighting stance (stepping into it if needed).
// (NATURAL STAND, round 11: a default fighter's feet stay where they are — a wide stance inside a combo, its
// natural stand between exchanges — and only crossed feet are put in the natural stand; standReadyPose is
// the pose it STEPS into to wait.)
export function fightReadyPose(pose: PoseAngles, hurt: number, look?: GuardLook): PoseAngles {
  const feet = feetOf(pose);
  if (look !== "realistic") return slumpedGuard(canSettle(pose, look) ? feet : NATURAL_FEET, hurt, undefined, look);
  return feet.l - feet.r >= 0.2 ? slumpedGuard(feet, hurt, undefined, look) : slumpedGuard(fightFeet(feetOf(STAND)), hurt, undefined, look);
}

// How far in front of the hips (px) a kick's foot reaches at the hit, from this stance.
export function kickReach(start: Stance, params: KickParams, settings: MoveSettings): number {
  const out = kick({ ...start, t: 0, x: 0, facing: "right" }, params, settings);
  const key = out.keys.find((k) => Math.abs(k.t - (out.marks.hit ?? -1)) < 1e-6) ?? out.keys[out.keys.length - 1];
  return forwardKinematics(key.pose, "right", { x: key.x, y: 0 }, settings.height, "normal", false).lFoot.x;
}

// GUARD: stand in the fighting stance with the hands up (slumped as hurt), breathing, for `seconds`.
// `guard: "realistic"` stands in a real boxing guard (FIGHT LOOK; the default is the loose stance).
// HANDS DOWN WHILE THE OTHER IS DOWN (Arthur, round 9: "when the other is down/staggering for ~3 s, the
// standing one lowers his hands"): with `relax` and a long enough wait, the fighter lets its hands sink to
// its belly and hips (no one to defend against), breathes, and brings them back up just before it goes in.
// How low and how quick are a little different every time (never the same twice).
export type GuardParams = { seconds?: number; hurt?: number; guard?: GuardLook; relax?: boolean };
export const RELAX_AFTER = 1.2;
export function relaxedPose(ready: PoseAngles, k = 1): PoseAngles {
  const lower = (side: "l" | "r", arm: WorldArm) => armFromWorld(ready.lean, side, blendArm(worldArm(ready, side), arm, clamp01(k)));
  return { ...ready, head: ready.head - 4 * k, ...lower("l", { upper: 8, fore: 42 }), ...lower("r", { upper: -2, fore: 30 }) };
}
export function guardUp(start: Stance, params: GuardParams, settings: MoveSettings): MoveOutput {
  const look = params.guard ?? settings.guard;
  // NATURAL STAND (round 11): a default fighter not yet in its natural stand (feet wide after a strike)
  // first steps into it, then waits there; only `guard: "realistic"` waits in the fighting stance.
  if (look !== "realistic" && !readyFeet(start.pose, look)) {
    const step = stepInto(start, standReadyPose(start.pose, clamp01(Number(params.hurt ?? 0)), look), settings);
    const left = Math.max(0, Number(params.seconds ?? 0.5) - (step.end.t - start.t));
    return chainMoves(start, [() => step, (from) => holdGuard(from, { ...params, seconds: left }, settings)]);
  }
  return holdGuard(start, params, settings);
}
function holdGuard(start: Stance, params: GuardParams, settings: MoveSettings): MoveOutput {
  const hurt = clamp01(Number(params.hurt ?? 0));
  const look = params.guard ?? settings.guard;
  const ready = fightReadyPose(start.pose, hurt, look);
  const feet = feetOf(start.pose);
  const seconds = Math.max(0, Number(params.seconds ?? 0.5));
  if (params.relax && seconds >= RELAX_AFTER && canSettle(start.pose, look)) {
    const jitter = (seconds * 7.31) % 1; // (a different wait gives a slightly different look and pace)
    const down = 0.42 + 0.15 * jitter, up = 0.3 + 0.1 * (1 - jitter);
    const relaxed = relaxedPose(ready, 0.8 + 0.2 * jitter);
    return chainMoves(start, [
      (from) => placedBeatsToKeys(from, [{ kind: "settle", pose: relaxed, seconds: down, at: guardAt(feetOf(from.pose)), name: "relax" }], settings),
      (from) => stand(from, { seconds: Math.max(0, seconds - down - up) }, settings),
      (from) => placedBeatsToKeys(from, [{ kind: "settle", pose: ready, seconds: up, at: guardAt(feetOf(from.pose)), name: "ready" }], settings),
    ]);
  }
  // NO UNNECESSARY KEY POSES (round 9, Arthur: "a busy cartoon fight", not two fighters standing about): a
  // fighter already in its guard doesn't settle into it again (that was a still third of a second, more when
  // hurt, every time the plan said "guard") — it only holds it for `seconds`, breathing.
  const already = canSettle(start.pose, look) && POSE_KEYS.every((name) => Math.abs(start.pose[name] - ready[name]) < 2);
  const parts: ((from: Stance) => MoveOutput)[] = [
    ...(already ? [] : [canSettle(start.pose, look)
      ? (from: Stance) => placedBeatsToKeys(from, [{ kind: "settle", pose: ready, seconds: 0.3, at: guardAt(feet) - 0 }], settings)
      : (from: Stance) => stepInto(from, ready, settings)]),
    (from) => stand(from, { seconds }, settings),
  ];
  return chainMoves(start, parts);
}
