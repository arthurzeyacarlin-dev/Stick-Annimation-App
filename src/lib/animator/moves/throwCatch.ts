import type { FrameCharacter, ObjectHand } from "../engine.ts";
import { flightTime, GRAVITY } from "../objectMoves.ts";
import { defaultApex, GRIP, heldCenter } from "../objects.ts";
import { DEFAULT_STYLE, PROPORTIONS, STAND, withPose, type Facing, type Point, type PoseAngles } from "../rig.ts";
import { beatSeconds, windUp, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import {
  actionSecondsFor, WHIP_ARM, WINDUP_CAP, blendPose, actionThrough, aimArm, armFromWorld, armOf, armReach, backLegDrop, chainLength, feetOf, fightFeet, handPoint,
  isRobot, pathLength, plantedLegs, worldArm, powerOf, recoverBeats, ROBOT_WINDUP, stanceAt, standingSkeleton, stepPose, unitBody, windKind, windupSecondsFor,
  stepBeats, type Feet, type PlacedBeat, placedBeatsToKeys, type WorldArm,
} from "./punch.ts";

// SPEC-0017 Phase 2 Round B: throwing and catching a basketball (reworked after Arthur's review,
// 2026-10-04).
//
// HOLDING: the ball is held IN THE HANDS in front of the chest/belly — the back (r) hand behind and
// under it, the front (l) hand on the far side, arms bent forward — never up by the face. The engine
// puts a ball held in "hands" between the hands (objects.ts heldCenter); the poses below put the hands
// exactly one grip apart on opposite sides of the ball, so it sits right in them.
//
// THROW (Arthur drew it): the hands bring the ball up in front of the shoulder; there the throwing (r)
// hand is behind the ball, pointing at it, the other hand on its far side — the moment the ball goes
// into the throwing hand alone (mark "oneHand": the planner switches the ball to "rHand" here, and it
// sits in exactly the same place either way, so nothing jumps). WIND-UP, the opposite way: the front foot
// steps forward (wide stance, front knee bent), the body leans back, the throwing arm swings far back and
// up holding the ball (behind the head, arm nearly straight — the same strike rule as the punch:
// cockedArm), the other arm points at the catcher. Then the arm whips forward FAST over the top, the
// elbow leading and the forearm snapping through, and lets go going forward and up (mark "release" =
// the hand's fastest moment) -> follow-through, slowing (the FLOW pose) -> only when nothing follows:
// the arm comes down, the front foot steps back, and the figure settles into the plain standing pose
// (arms down, relaxed) — it never stands there with its arm hanging out.
//
// WHICH THROW (Arthur, round 4: "If you're doing far distance and you need to really throw, that's when
// overhand's useful. If it's short distance, you should do like an uppercut"): worked out from the body
// and physics, not from a list — see `needsOverhand` below. A short pass is an UNDERHAND toss: the ball
// goes into the throwing hand low in front of the belly, swings down past the hip and back (knees
// dipping), then forward and UP like a pendulum, and leaves the hand in front at about belly height,
// rising; the hand follows through up in front.
//
// CATCH (Arthur, round 4: "He has to be ready. And then when he's ready, his arms go out. He grabs it"):
// from whatever pose the figure is in (normally the plain standing pose, breathing while it waits) ->
// READY: the hands come up in front of the chest, elbows bent, open, facing the ball (mark "ready"; it
// takes a reaction time plus the time to raise the hands, so when the director starts the catch so that
// its "catch" mark meets the ball, the hands come up about when the thrower lets go) -> REACH: the arms
// go out to meet the ball (mark "catch") -> ABSORB: the ball comes in to the chest, the knees give a
// little -> held at the chest (mark "secured", the FLOW pose: a throw can start straight from here) ->
// settle into HOLD_BALL (stepping the feet together first if they were apart).

export { handPoint };
export const BALL_HAND = "rHand" as const;

// A basketball's radius (x height: a 48 px ball on a 300 px figure) and how far each hand sits from its
// centre when holding it (the engine's grip: objects.ts GRIP).
export const BALL_RADIUS = 0.08;
const HOLD = BALL_RADIUS * GRIP;
const DEG = 180 / Math.PI;
const dirOf = (degrees: number): Point => ({ x: Math.sin(degrees / DEG), y: Math.cos(degrees / DEG) });

// Both hands on the ball, on opposite sides of its centre (from the shoulder; x height, facing right,
// +y down): `axis` is the direction from the back (r) hand to the front (l) hand (degrees: 90 = forward,
// 180 = up). `spread` > 1 opens the hands wider (waiting for the ball).
export function bothHands(lean: number, center: Point, axis: number, spread = 1): Partial<PoseAngles> {
  const d = dirOf(axis), reach = HOLD * spread;
  const r = armReach(lean, { x: center.x - d.x * reach, y: center.y - d.y * reach });
  const l = armReach(lean, { x: center.x + d.x * reach, y: center.y + d.y * reach });
  return { ...armOf("r", r.shoulder, r.elbow), ...armOf("l", l.shoulder, l.elbow) };
}

// The ball in the throwing (r) hand: the hand behind it, the forearm pointing at its centre (where the
// engine holds a ball in one hand). With `helper`, the other hand is on the far side of the ball too.
function throwingHand(lean: number, arm: WorldArm, helper: boolean): Partial<PoseAngles> {
  const out = armFromWorld(lean, "r", arm);
  if (!helper) return out;
  const hand = { x: 0.16 * Math.sin(arm.upper / DEG) + 0.15 * Math.sin(arm.fore / DEG), y: 0.16 * Math.cos(arm.upper / DEG) + 0.15 * Math.cos(arm.fore / DEG) };
  const f = dirOf(arm.fore);
  const l = armReach(lean, { x: hand.x + 2 * HOLD * f.x, y: hand.y + 2 * HOLD * f.y });
  return { ...out, ...armOf("l", l.shoulder, l.elbow) };
}

// Standing, holding the ball in both hands in front of the chest and belly, arms bent forward.
const HOLD_CENTER: Point = { x: 0.17, y: 0.15 };
export const HOLD_BALL: PoseAngles = withPose(STAND, { head: 4, ...bothHands(0, HOLD_CENTER, 140) });
// Ready to catch: hands up in front of the chest, elbows bent, open a little wider than the ball (the
// front hand higher), the body leaning in a touch.
const READY_CENTER: Point = { x: 0.17, y: 0.08 };
export const READY_POSE: PoseAngles = withPose(STAND, { lean: 3, head: 2, ...bothHands(3, READY_CENTER, 150, 1.15) });
// Arms out to meet the ball, in front at about shoulder height, the hands closing on it (where they are
// when it arrives).
const CATCH_CENTER: Point = { x: 0.25, y: -0.02 };
export const CATCH_POSE: PoseAngles = withPose(STAND, { lean: 3, head: 4, ...bothHands(3, CATCH_CENTER, 150) });

// `distance`: px to the catcher, hip to hip (the director measures it from where the two figures stand).
// `overhand`: leave it out and the engine picks (needsOverhand); true or false forces one kind.
// `handOff`: false = always throw, even to someone right next to you; true = hand it over (the planner
// keeps a pass the kind it first worked out, so it never flips between tries). `bounce`: a bounce pass (the
// flight is the planner's and the engine's job; the throw itself is the same). `to`: the catcher's id, or
// "away" = nobody catches it (the planner sends it flying off the page). `until` (a hand-off; the planner
// fills it in): the moment the taker's hands are on the ball — the giver holds it out at least until then.
// `handOverHold` (the planner's ONE WAY ROUND, plan.ts): base seconds the throwing arm holds its follow-through
// before the next move takes it on.
export type ThrowParams = { distance: number; overhand?: boolean; handOff?: boolean; bounce?: boolean; to?: string; until?: number; handOverHold?: number };
export const THROW_DEFAULTS = { distance: 500 } as const;
// `handOff`: the giver is this close (px, hip to hip) and hands it over (the planner fills it in, with
// `handOffRise`: how much higher (x height) than usual the giver holds it, so the hands meet on it).
export type CatchParams = { handOff?: number; handOffRise?: number };
export const CATCH_DEFAULTS: CatchParams = {};

// ---- Which throw: underhand or overhand ---------------------------------------------------------
//
// THE RULE (taught, not a list of answers): throw overhand only when the ball NEEDS more speed than an
// underhand swing can comfortably give it.
// 1. The speed the ball needs. It flies from the thrower's hand to the catcher's hands: the distance
//    between the figures less about an arm's length in front of each (HANDS_REACH). The engine flies it
//    on its own arc (objects.ts defaultApex: the top about a quarter of the way across above the hands,
//    i.e. thrown up at about 45 degrees, the slowest way to get that far) under its own gravity
//    (objectMoves.ts GRAVITY). Sideways the ball must cover the gap in the flight time; upward it must
//    rise to the top: together, `launchSpeed`.
// 2. The speed an underhand swing can give: the arm swings from the shoulder like a pendulum, nearly
//    straight (arm length = upper arm + forearm), at a comfortable swing rate, and the step and the lean
//    forward add a little: UNDERHAND_TOP_SPEED, in body heights per second (about 3.8, i.e. about 6.7 m/s
//    for a 1.75 m person; an overhand whip reaches two to three times that).
// Speeds are compared in body heights per second, so the rule works for any figure size and distance.
// (Gravity is the engine's own, in stage px, the same for every figure: a small figure needs the
// overhand sooner than a big one, because its arm is shorter next to the same flight.)
const ARM = PROPORTIONS.upperArm + PROPORTIONS.forearm;
// A comfortable underhand arm swing: radians per second at the bottom of the swing (about 630 deg/s).
const UNDERHAND_SWING = 11;
// What the step and the lean forward add to the hand's speed (body heights per second).
const BODY_DRIVE = 0.4;
export const UNDERHAND_TOP_SPEED = ARM * UNDERHAND_SWING + BODY_DRIVE;
// The ball leaves the thrower's hand, and is caught, about an arm's length in front of each figure.
const HANDS_REACH = 2 * ARM;

// The speed (px/s) a ball must be thrown at to fly `gap` px on the engine's arc under `gravity` (px/s²).
export function launchSpeed(gap: number, gravity = GRAVITY) {
  const across = Math.max(0, gap), apex = defaultApex({ x: 0, y: 0 }, { x: across, y: 0 });
  return Math.hypot(across / flightTime(0, 0, apex, gravity), Math.sqrt(2 * gravity * apex));
}
// Does a throw to a catcher `distance` px away (hip to hip) need the overhand, for a figure `height` px tall?
export const needsOverhand = (distance: number, height: number) =>
  launchSpeed(distance - HANDS_REACH * height) / height > UNDERHAND_TOP_SPEED;
// From how far away (px, hip to hip) a figure `height` px tall throws overhand.
export function overhandFrom(height: number) {
  let lo = 0, hi = 50 * height;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (needsOverhand(mid, height)) hi = mid; else lo = mid; }
  return hi;
}
// ---- Hand-off: too close to throw ----------------------------------------------------------------
//
// THE REACH RULE (Arthur, round 6: "if they're that close, that's basically giving someone the ball ...
// 'here, catch' a few feet away — boom, that's going to hurt"): if the two can meet half way — each holds
// the ball out in front at chest height with both hands, arms nearly straight, after at most one small
// step — nobody throws: the giver holds it out, the receiver reaches and takes it with both hands, and the
// ball changes hands right there (no flight). Worked out from the arm length, so it scales with the body:
// about 0.9 body heights apart (hip to hip) or closer for anyone.
const OFFER_LEAN = 6;
const OFFER_DROP = 0.015;
const OFFER_Y = 0.08; // the ball, below the shoulder (chest height)
const OFFER_GRIP = 55; // each hand this many degrees round from straight behind the ball (both on the near side)
const OFFER_STRAIGHT = 0.95; // arms nearly straight at the furthest
const DEG_R = Math.PI / 180;
// The shoulder, in front of the hips, for a body leaning `lean`.
const shoulderAhead = (lean: number) => PROPORTIONS.torso * Math.sin(lean * DEG_R);
// How far in front of its shoulder a figure can hold the ball out (x height): both hands within reach.
const OFFER_REACH = HOLD * Math.cos(OFFER_GRIP * DEG_R) + Math.sqrt((OFFER_STRAIGHT * ARM) ** 2 - (OFFER_Y + HOLD * Math.sin(OFFER_GRIP * DEG_R)) ** 2);
// One small step: the front foot goes forward this much (x height), the hips half as far.
const OFFER_STEP = 0.24;
export const handOffWithin = (height: number) => 2 * (shoulderAhead(OFFER_LEAN) + OFFER_REACH + OFFER_STEP / 2) * height;
const handsOffer = (lean: number, center: Point): Partial<PoseAngles> => {
  const back = HOLD * Math.cos(OFFER_GRIP * DEG_R), side = HOLD * Math.sin(OFFER_GRIP * DEG_R);
  const r = armReach(lean, { x: center.x - back, y: center.y + side }), l = armReach(lean, { x: center.x - back, y: center.y - side });
  return { ...armOf("r", r.shoulder, r.elbow), ...armOf("l", l.shoulder, l.elbow) };
};
// A taker steps in as far as it needs to get its hands on the ball, up to one full step (the giver may
// hold it out a little further than half way, if the taker has moved since).
const TAKE_STEP = 0.4;
// The pose holding the ball out to someone `distance` px away (it meets them half way), and the step
// (the front foot goes forward at most `step`, x height).
function offerPose(distance: number, height: number, feet0: Feet, step = OFFER_STEP, rise = 0) {
  const half = distance / 2 / height;
  const shift = Math.min(step / 2, Math.max(0, half - shoulderAhead(OFFER_LEAN) - OFFER_REACH));
  const feet: Feet = { r: feet0.r, l: feet0.l + 2 * shift };
  // (Feet wide apart — a long step, or still in a throw's stance — the hips go as low as the legs need,
  // and the hands hold the ball that much higher: it is always at the same height, so the giver's and the
  // taker's hands meet on it.)
  const drop = Math.max(OFFER_DROP, backLegDrop(feet, shift), backLegDrop({ r: feet.l, l: feet.l }, shift));
  const center = { x: half - shift - shoulderAhead(OFFER_LEAN), y: OFFER_Y - (drop - OFFER_DROP) - rise };
  const pose = plantedLegs(withPose(STAND, { lean: OFFER_LEAN, head: 6, ...handsOffer(OFFER_LEAN, center) }), feet, shift, drop);
  return { pose, shift, feet };
}
const OFFER_SECONDS = 0.45;
const GIVE_WAIT = 0.3; // held out, still, until the other one has it
// A taker who is free takes the ball this long after it is held out (it sees it, reaches, takes it).
export const HANDOFF_SHOWN = GIVE_WAIT;
// The least time the ball is held out still before it changes hands.
const MIN_SHOWN = 0.1;
// Both have their hands on it for a moment: the giver lets go just after the taker has it (the taker's
// hands hold still that long: takeBall), so on every frame someone is holding it.
const BOTH_HOLD = 0.06;

// Giving: hold the ball out (a small step if needed), wait for the other's hands (mark "release" = they
// have it), let go, arms down, step back, stand.
// THE CONTACT RULE (Arthur, round 7: "the ball just stayed in mid-air, and he thinks he's holding it"): the
// giver's hands stay on the ball, held out still, until the taker's hands are on it too (`until`, from the
// planner, or — not known yet — when someone starting from a stand right now could take it); only then do
// they let go and drop. The ball goes straight from hands to hands: it never floats between them.
function handOff(start: Stance, distance: number, settings: MoveSettings, until?: number, wait = GIVE_WAIT): MoveOutput {
  const feet0 = feetOf(start.pose);
  const o = offerPose(distance, settings.height, feet0);
  const out = { ...o.pose, head: 3 };
  const letGo = withPose(o.pose, { lean: 2, ...armFromWorld(2, "r", { upper: 20, fore: 60 }), ...armFromWorld(2, "l", { upper: 24, fore: 64 }) });
  const reach: PlacedBeat[] = o.shift > 0.005
    ? stepBeats({ pose: start.pose, at: 0 }, feet0, o.feet, { pose: o.pose, at: o.shift }, OFFER_SECONDS, { name: "offer" })
    : [{ kind: "settle", pose: o.pose, seconds: OFFER_SECONDS, at: 0, name: "offer" }];
  const beats: PlacedBeat[] = [
    ...reach,
    { kind: "hold", pose: out, seconds: wait, at: o.shift, name: "release" },
    { kind: "settle", pose: letGo, seconds: 0.3, at: o.shift },
    ...recoverBeats({ pose: letGo, at: o.shift }, o.feet, STAND),
  ];
  const given = placedBeatsToKeys(start, beats, settings);
  // The giver keeps holding it out until the other one has it: exactly when their hands are on it
  // (`until`, from the planner), or — not known yet — when someone starting from a stand right now could
  // take it (they see it offered, raise their hands and reach: takeBall). So the ball never floats.
  const letGoAt = until !== undefined ? Math.max(given.marks.offer + MIN_SHOWN, until + BOTH_HOLD) : Math.max(given.marks.release, start.t + takeOffset(distance, settings));
  const off = letGoAt - given.marks.release;
  return Math.abs(off) > 1e-4 && wait === GIVE_WAIT ? handOff(start, distance, settings, until, Math.max(0.02, wait + off / Math.max(1e-6, beatSeconds("hold", 1, settings)))) : given;
}
// Seconds from the start of a take (from the plain stand) until the hands are on the ball.
const takeOffset = (distance: number, settings: MoveSettings) => takeBall(anyStance(STAND), distance, settings).marks.catch;
// Taking: hands up (ready), reach out to the ball held out half way (a small step if needed; mark
// "catch" = the hands are on it), take it, bring it in to the chest, step back.
function takeBall(start: Stance, distance: number, settings: MoveSettings, rise = 0): MoveOutput {
  const feet0 = feetOf(start.pose);
  const o = offerPose(distance, settings.height, feet0, TAKE_STEP, rise);
  const ready = readyPose(feet0);
  const secured = plantedLegs(withPose(HOLD_BALL, { lean: 1 }), o.feet, o.shift * 0.6, OFFER_DROP);
  const reach: PlacedBeat[] = o.shift > 0.005
    ? stepBeats({ pose: ready, at: 0 }, feet0, o.feet, { pose: o.pose, at: o.shift }, 0.4, { name: "catch" })
    : [{ kind: "settle", pose: o.pose, seconds: 0.4, at: 0, name: "catch" }];
  const beats: PlacedBeat[] = [
    { kind: "settle", pose: ready, seconds: REACTION_SECONDS + handsTravel(start.pose, ready) / RAISE_SPEED, at: 0, name: "ready" },
    ...reach,
    { kind: "hold", pose: { ...o.pose, head: 3 }, seconds: 0.12, at: o.shift },
    { kind: "settle", pose: secured, seconds: 0.32, at: o.shift * 0.6, name: "secured" },
    ...recoverBeats({ pose: secured, at: o.shift * 0.6 }, o.feet, HOLD_BALL),
  ];
  return placedBeatsToKeys(start, beats, settings);
}
// Is a pass this far (px, hip to hip) a hand-off?
export const isHandOff = (params: Partial<ThrowParams>, height: number) =>
  params.handOff !== false && params.to !== "away" && !params.bounce && (params.handOff === true || (params.distance ?? THROW_DEFAULTS.distance) <= handOffWithin(height));

// ---- Throwing it away ---------------------------------------------------------------------------
// Nobody catches it (`to: "away"`): thrown as far as it goes — up at 45 degrees (the furthest angle) at
// an overhand's speed (about twice the underhand swing's) — it arcs high over anyone in front and flies on
// under gravity off the page (about 2600 px before it would come down, for a 300 px figure).
export const AWAY_SPEED = 2 * UNDERHAND_TOP_SPEED;
export const AWAY_ANGLE = 45;

// The kind of throw for these params: `overhand` if the params say, otherwise the rule.
// (Throwing it away is always a big overhand.)
export const throwsOverhand = (params: Partial<ThrowParams>, height: number) =>
  params.overhand ?? (params.to === "away" || needsOverhand(params.distance ?? THROW_DEFAULTS.distance, height));

// Base beat seconds (natural, normal speed). The wind-up and release may be stretched by throwTiming.
const THROW_SECONDS = { gather: 0.24, windup: 0.5, release: 0.13, follow: 0.3 } as const;
// After the follow-through the arms drop, relaxed, before the front foot steps back.
const ARMS_DOWN_SECONDS = 0.28;
const MAX_THROW_POWER = 1.5;
// (The release pose itself already has the hand trailing the elbow, so no extra whip key is needed.)
const USE_WHIP = false;

// The ball in the throwing hand at the gather: in front of the shoulder, the hand behind and under it.
const GATHER_ARM: WorldArm = { upper: 2, fore: 118 };
// OVERHAND, BEHIND THE HEAD (Arthur, round 6: "the engine always tries to go around the head ... the
// elbow can go behind his head, in 2D it makes it look 3D"). The arm never sweeps out straight and round
// the head (no windmill): the elbow stays bent and close to the head the whole way.
// - RISE: the ball comes up in front of the face, the elbow lifting in front (both hands still on it);
// - COCKED (the wind-up): the elbow goes up and back BEHIND the head (about head height, just behind
//   it — drawn behind the head, like a real arm out to the side), the forearm points up, the ball sits
//   above and behind the head; the figure holds it there a moment (the loaded spring), leaning back,
//   the other arm pointing at the catcher. A softer throw raises the elbow a little less.
// - LAG: the elbow leads forward over the head while the forearm lays back (the ball dips behind the
//   head) — then the forearm snaps through: it lets go above the head, a little in front, going forward.
// The upper arm turns forward→up→back-up in the wind-up, then back over the top and down in front:
// never a full circle.
const RISE_OVER: WorldArm = { upper: 110, fore: 185 };
const cockOver = (k: number): WorldArm => ({ upper: -(115 + 20 * Math.min(1, k)), fore: -155 });
const LAG_OVER: WorldArm = { upper: -175, fore: -130 };
const RELEASE_OVER: WorldArm = { upper: -205, fore: -185 };
const FOLLOW_OVER: WorldArm = { upper: 78, fore: 100 };
// How long the cocked pose is held (x the wind-up's own time), so the eye catches it.
const COCK_HOLD = 0.15;
const GATHER_SETTLE = 0.06;
// Underhand ("like an uppercut", Arthur): the ball goes into the throwing hand low in front of the belly
// (the other hand still on its far side), comes down by the hip, swings back behind the hip with the arm
// nearly straight, then forward and up like a pendulum; it leaves the hand in front at about belly
// height, still rising (about 45-55 degrees up: the engine's lob), and the hand follows through up in front.
// (On the way down both hands still hold it: the whole hold turns back about the shoulder, so the ball
// stays between the hands — no jump when it goes into the throwing hand — until the other hand lets go.)
const UNDER_GATHER: WorldArm = { upper: -6, fore: 100 };
const UNDER_PULL: WorldArm = { upper: UNDER_GATHER.upper - 28, fore: UNDER_GATHER.fore - 28 };
const underBack = (k: number): WorldArm => { const upper = -(36 + 14 * Math.min(1, k)); return { upper, fore: upper + 12 }; };
const RELEASE_UNDER: WorldArm = { upper: 55, fore: 66 };
const FOLLOW_UNDER: WorldArm = { upper: 104, fore: 122 };

// A ROBOT THROWS STIFF (Arthur, round 8: "robots don't feel weight ... When he throws, the right arm goes
// behind him, around his head, and throws"): the throwing arm stays STRAIGHT — down and back behind the
// body, up round behind the head, over the top and out — at even speeds (a robot's beats are linear), no
// whip and no lag. Underhand it is a straight-arm pendulum. (Its catch has no give: a robot has no
// follow-through, so the hands stop dead on the ball and bring it in.)
const stiffArm = (upper: number): WorldArm => ({ upper, fore: upper });
// (Overhand, a robot has no follow-through: once it lets go, the straight arm goes BACK round over the
// head and down behind — "go back around, and come back", as in its high-five — so it never swings
// round the head in a whole circle.)
const STIFF = { back: stiffArm(-55), cocked: stiffArm(-135), release: stiffArm(-205), follow: stiffArm(-222), backOver: stiffArm(-130), underBack: stiffArm(-50), underRelease: stiffArm(58), underFollow: stiffArm(110) } as const;

// The throw's key poses for one throw kind and strength `k` (about 0.4 to 1.5), from feet `feet0`.
function throwPoses(overhand: boolean, k: number, feet0: Feet, robot = false) {
  // (Only the overhand goes stiff: a robot's underhand toss is already a nearly straight pendulum.)
  const stiff = robot && overhand;
  const feet = fightFeet(feet0); // the front foot steps forward: wide stance
  const body = Math.max(0.7, k); // even a soft throw leans back and forward a little
  const windAt = stanceAt(feet, 0.5), releaseAt = stanceAt(feet, 0.62 + 0.04 * body), followAt = stanceAt(feet, 0.68 + 0.05 * body);
  const legsAt = (pose: PoseAngles, at: number, extra = 0.01) => plantedLegs(pose, feet, at, backLegDrop(feet, at) + extra);
  const gatherBody = withPose(STAND, { lean: 2, head: 2 });
  const gather = plantedLegs(withPose(gatherBody, throwingHand(2, overhand ? GATHER_ARM : UNDER_GATHER, true)), feet0, 0, 0.025);

  const release = legsAt(withPose(STAND, { lean: (overhand ? 9 : 5) * body, head: overhand ? 0 : -4, ...armOf("l", 18, 40) }), releaseAt);
  Object.assign(release, armFromWorld(release.lean, "r", stiff ? (overhand ? STIFF.release : STIFF.underRelease) : overhand ? RELEASE_OVER : RELEASE_UNDER));
  const follow = legsAt(withPose(STAND, { lean: (overhand ? 15 : 6) * body, head: 2, ...armOf("l", overhand ? -15 : 4, overhand ? 30 : 20) }), followAt);
  Object.assign(follow, armFromWorld(follow.lean, "r", stiff ? (overhand ? STIFF.follow : STIFF.underFollow) : overhand ? FOLLOW_OVER : FOLLOW_UNDER));

  // WIND-UP, the opposite way (windUp rule): the body leans back, the throwing arm swings back — overhand
  // far back and up, nearly straight, the ball behind the head (the strike rule, cockedArm); underhand
  // down and back behind the hip, the knees dipping so the body can rise into the toss — and the other
  // arm points at the catcher.
  const lean = windUp(gatherBody, release, 0.5, { lean: 0.9 * body }).lean;
  // Overhand = Arthur's drawing: arms pass, the arm goes straight back, the forearm folds up so the ball
  // sits above and behind the head; the other arm points straight at the catcher.
  const cock = stiff ? (overhand ? { arm: STIFF.cocked, via: STIFF.back } : { arm: STIFF.underBack, via: undefined })
    : overhand ? { arm: cockOver(k), via: RISE_OVER } : { arm: underBack(k), via: undefined };
  const aim = aimArm(lean, { x: 1, y: -0.12 }, 0.99);
  const windup = legsAt(withPose(STAND, { lean, head: -3, ...armOf("l", aim.shoulder, aim.elbow), ...armFromWorld(lean, "r", cock.arm) }), windAt, overhand ? 0.02 : 0.02 + 0.02 * Math.min(1, k));
  // Overhand: held cocked a moment, sinking a touch further back (never a dead freeze).
  const loaded = overhand ? legsAt(withPose(windup, { lean: windup.lean - 2 * body, ...armFromWorld(windup.lean - 2 * body, "r", cock.arm) }), windAt, 0.03) : null;
  // On the way back: the front foot is in the air (stepping forward) and both hands still carry the
  // ball (so it is in both hands just after "oneHand" too: no jump, whenever the switch happens):
  // overhand in to the chest, the elbow leading back; underhand down by the belly.
  const pullArm = cock.via ?? UNDER_PULL;
  const pullBody = blendPose(gather, windup, 0.5);
  const pullAt = windAt / 2;
  // (Stiff: the ball is already in the throwing hand alone as the straight arm swings back behind.)
  const pull = stepPose(withPose(pullBody, throwingHand(pullBody.lean, pullArm, !stiff)), feet0, feet, pullAt, (0.025 + backLegDrop(feet, windAt)) / 2, "l");
  // (The overhand goes straight from the rise up over the head into the cocked arm: no reach straight
  // back at shoulder height on the way.)
  const backAt = (pullAt + windAt) / 2;
  const back: PoseAngles | null = null;
  // Overhand: the elbow leads forward over the head, the ball lagging behind the head, then the forearm
  // snaps through.
  const lagBody = blendPose(loaded ?? windup, release, 0.45);
  const lag = overhand && !stiff ? legsAt(withPose(lagBody, armFromWorld(lagBody.lean, "r", LAG_OVER)), windAt + (releaseAt - windAt) * 0.3) : null;
  const whipBody = blendPose(windup, release, 0.7);
  const whip = overhand && USE_WHIP ? legsAt(withPose(whipBody, armFromWorld(whipBody.lean, "r", WHIP_ARM)), windAt + (releaseAt - windAt) * 0.62) : null;
  // After the follow-through: the same stance, both arms hanging down relaxed (as in the plain stand).
  const relaxed = withPose(follow, { lean: follow.lean * 0.5, ...armFromWorld(follow.lean * 0.5, "r", worldArm(STAND, "r")), ...armFromWorld(follow.lean * 0.5, "l", worldArm(STAND, "l")) });
  // (Stiff overhand: after its short even carry-through, the straight arm goes back round over the head.)
  const backOver = stiff && overhand ? withPose(follow, armFromWorld(follow.lean, "r", STIFF.backOver)) : null;
  return { feet, gather, pull, pullAt, back, backAt, windup, loaded, windAt, lag, lagAt: windAt + (releaseAt - windAt) * 0.3, whip, whipAt: windAt + (releaseAt - windAt) * 0.62, release, releaseAt, follow, followAt, backOver, relaxed: legsAt(relaxed, followAt) };
}

// The longest a throw's wind-up may get (x its base time): energy makes the whip quicker and the
// wind-up a little longer, so a lively throw gets a shorter cap and a lazy, low-energy one a longer one —
// the wind-up always stays clearly slower than the throw.
const windupCap = (settings: MoveSettings) => {
  const e = Math.min(1, Math.max(0, settings.energy));
  return WINDUP_CAP * (1.3 - 0.6 * e) / (0.85 + 0.3 * e);
};

// How long the wind-up and the whip to the release take. They are set by the biggest possible throw
// (so the hand never jumps across the screen in one frame, and the wind-up stays slow next to the
// whip) and are the same for every distance, both throw kinds and any start pose, so a director can
// time a pass with `releaseOffset(settings)`.
function throwTiming(settings: MoveSettings, overhand: boolean) {
  const feet = feetOf(HOLD_BALL);
  const kind = windKind(settings);
  let release: number = THROW_SECONDS.release, windup: number = THROW_SECONDS.windup * (isRobot(settings) ? ROBOT_WINDUP : 1);
  // (Each kind of throw has its own timing: an overhand whip covers a short arc fast; an underhand swing
  // a long one.)
  const all = [0.4, 1, MAX_THROW_POWER].map((k) => throwPoses(overhand, k, feet, isRobot(settings)));
  for (const p of all) release = Math.max(release, actionSecondsFor(THROW_SECONDS.release, ballTravel([p.loaded ?? p.windup, ...(p.lag ? [p.lag] : []), ...(p.whip ? [p.whip] : []), p.release]) / BALL_SPEED_SHARE, settings));
  for (const p of all) {
    const wind = chainLength([p.gather, p.pull, ...(p.back ? [p.back] : []), p.windup], BALL_HAND);
    windup = Math.max(windup, windupSecondsFor(THROW_SECONDS.windup * (isRobot(settings) ? ROBOT_WINDUP : 1), wind, strikeLength(p), beatSeconds("action", release, settings), settings, kind, 2, windupCap(settings)));
  }
  // A ROBOT'S STIFF OVERHAND swings its straight arm back and round behind the head at ONE EVEN SPEED
  // (ROBOT_ARM_SPEED); then the throw itself, out over the top, as fast as any throw (the ball needs the
  // speed) but still even. Behind, round and out is nearly a whole turn, so at that pace it never turns
  // more than the body rule's 300 degrees in a second.
  if (isRobot(settings) && overhand) {
    const p = all[1], unit = Math.max(1e-6, beatSeconds("settle", 1, settings));
    const back = armSwing(p.gather, p.pull), up = armSwing(p.pull, p.windup);
    return { release, windup: (back + up) / ROBOT_ARM_SPEED / unit, kind, share: back / Math.max(1e-6, back + up) } as const;
  }
  return { release, windup, kind, share: undefined } as const;
}
// How far (degrees) the throwing arm turns from one pose to the next: the upper arm or the forearm,
// whichever turns more.
const armSwing = (a: PoseAngles, b: PoseAngles) => {
  const wa = worldArm(a, "r"), wb = worldArm(b, "r"), turn = (x: number) => Math.abs(((x % 360) + 540) % 360 - 180);
  return Math.max(turn(wb.upper - wa.upper), turn(wb.fore - wa.fore));
};
const ROBOT_ARM_SPEED = 200; // degrees per second
const strikeLength = (p: ReturnType<typeof throwPoses>) => chainLength([p.loaded ?? p.windup, ...(p.lag ? [p.lag] : []), ...(p.whip ? [p.whip] : []), p.release], BALL_HAND);
// How far the ball itself travels in the throwing hand (it sits past the hand, so it moves faster than
// the hand does). The ball is kept a little under the hands' speed limit (BALL_SPEED_SHARE), so it never
// jumps across the screen either (at most about 70 px a frame at 24 fps for a 300 px figure).
const BALL_SPEED_SHARE = 0.82;
function ballTravel(poses: PoseAngles[], steps = 24) {
  let length = 0, previous: Point | null = null;
  for (let i = 0; i < poses.length - 1; i += 1) for (let j = i === 0 ? 0 : 1; j <= steps; j += 1) {
    const s = unitBody(blendPose(poses[i], poses[i + 1], j / steps));
    const f = Math.hypot(s.rHand.x - s.rElbow.x, s.rHand.y - s.rElbow.y) || 1;
    const c = { x: s.rHand.x + ((s.rHand.x - s.rElbow.x) / f) * HOLD, y: s.rHand.y + ((s.rHand.y - s.rElbow.y) / f) * HOLD };
    if (previous) length += Math.hypot(c.x - previous.x, c.y - previous.y);
    previous = c;
  }
  return length;
}

export function throwBall(start: Stance, params: ThrowParams, settings: MoveSettings): MoveOutput {
  if (isHandOff(params, settings.height)) return handOff(start, params.distance ?? THROW_DEFAULTS.distance, settings, params.until);
  const distance = params.to === "away" ? 6 * settings.height : params.distance ?? THROW_DEFAULTS.distance;
  const overhand = throwsOverhand(params, settings.height);
  // A farther throw winds up deeper and steps the weight further; energy and style add to that.
  const reach = Math.min(1.3, Math.max(0.6, distance / (3 * settings.height)));
  const k = Math.min(MAX_THROW_POWER, reach * powerOf(settings));
  const robot = isRobot(settings);
  const p = throwPoses(overhand, k, feetOf(start.pose), robot);
  const timing = throwTiming(settings, overhand);
  const strike = actionThrough([...(p.lag ? [{ pose: p.lag, at: p.lagAt }] : []), ...(p.whip ? [{ pose: p.whip, at: p.whipAt }] : []), { pose: p.release, at: p.releaseAt, name: "release" }], { pose: p.loaded ?? p.windup, at: p.windAt }, BALL_HAND, timing.release, settings);
  // The follow-through carries on from the release at about the hand's speed there, then slows down.
  const last = strike[strike.length - 1];
  const releaseSpeed = chainLength([strike.length > 1 ? strike[strike.length - 2].pose : p.loaded ?? p.windup, last.pose], BALL_HAND) / Math.max(1e-3, beatSeconds("action", last.seconds, settings));
  const followSecs = (2 * chainLength([p.release, p.follow], BALL_HAND)) / Math.max(1e-3, 0.9 * releaseSpeed);
  const followBase = followSecs / Math.max(1e-6, beatSeconds("follow", 1, settings));
  // Then the arms drop (in about a quarter of a second), never faster than the throw itself: at their
  // fastest under 70% of the hand's speed at the release (a smooth beat peaks at 1.5x its average speed);
  // a robot moves at one even speed, so its arm comes down at the speed it threw. A robot has no
  // follow-through, so its arm comes down the front way, through the follow-through pose (not back over
  // the shoulder).
  const downPath = robot ? [p.release, p.follow, ...(p.backOver ? [p.backOver] : []), p.relaxed] : [p.follow, p.relaxed];
  const drop = Math.max(chainLength(downPath, BALL_HAND), chainLength(downPath, "lHand"));
  const armsDownSecs = Math.max(beatSeconds("settle", ARMS_DOWN_SECONDS, settings), (robot ? 1 : 1.5 / 0.7) * drop / Math.max(1e-3, releaseSpeed));
  const armsDownBase = armsDownSecs / Math.max(1e-6, beatSeconds("settle", 1, settings));
  const viaShare = robot ? chainLength([p.release, p.follow], BALL_HAND) / Math.max(1e-6, chainLength(downPath, BALL_HAND)) : 0;

  const beats: PlacedBeat[] = [
    // The hands bring the ball to where it goes into the throwing hand (overhand: up in front of the
    // shoulder; underhand: low in front of the belly).
    { kind: timing.kind, pose: p.gather, seconds: THROW_SECONDS.gather * (robot ? ROBOT_WINDUP : 1), at: 0, name: "oneHand" },
    // (Overhand: the throwing hand settles under the ball for an instant before it carries it up — the
    // rise goes a new way, up in front of the face.)
    ...(overhand ? [{ kind: "hold" as const, pose: p.gather, seconds: GATHER_SETTLE, at: 0 }] : []),
    { ...windPart(p, timing, "pull"), contacts: ["rFoot"] },
    // (The swing back and the fold up share their time by how far the ball goes in each: an even pace.)
    ...(p.back ? [{ ...windPart(p, timing, "windup"), pose: p.back, at: p.backAt, seconds: windPart(p, timing, "windup").seconds * backShare(p) }] : []),
    { ...windPart(p, timing, "windup"), seconds: windPart(p, timing, "windup").seconds * (p.back ? 1 - backShare(p) : 1), name: "windup" },
    // Overhand: the cocked arm is held a moment (ball above and behind the head), so it reads.
    ...(p.loaded ? [{ kind: "hold" as const, pose: p.loaded, seconds: timing.windup * COCK_HOLD, at: p.windAt, name: "cocked" }] : []),
    ...strike,
    { kind: "follow", pose: p.follow, seconds: followBase, at: p.followAt },
    // Only when nothing follows: the arms drop and relax at once (never left hanging out after the
    // throw), the front foot steps back, and the figure settles into the plain standing pose.
    // (A robot's arm coming through to the front is its follow-through: its flow point is there, so
    // whatever comes next never has to swing the arm down from above the head.)
    ...(robot ? [{ kind: "settle" as const, pose: p.follow, seconds: armsDownBase * viaShare, at: p.followAt }] : []),
    ...(p.backOver ? [{ kind: "settle" as const, pose: p.backOver, seconds: armsDownBase * (1 - viaShare) * backOverShare(p), at: p.followAt }] : []),
    // (A robot's overhand arm goes back round and down first: its flow point is with the arm down.)
    { kind: "settle", pose: p.relaxed, seconds: armsDownBase * (1 - viaShare) * (p.backOver ? 1 - backOverShare(p) : 1), at: p.followAt, recover: p.backOver ? undefined : true },
    ...recoverBeats({ pose: p.relaxed, at: p.followAt }, p.feet, STAND),
  ];
  // ONE WAY ROUND (plan.ts): when the next move would swing the throwing arm straight on round, it holds
  // where it hands over (the follow-through: a shooter holding the follow-through) a moment first.
  const hold = Math.max(0, Number(params.handOverHold ?? 0)), handOver = beats.findIndex((b) => b.recover);
  if (hold > 0 && handOver > 0) beats.splice(handOver, 0, { kind: "hold", pose: beats[handOver - 1].pose, seconds: hold, at: beats[handOver - 1].at });
  return placedBeatsToKeys(start, beats, settings);
}

// (How the stiff arm's way back shares its time: over the head, then down behind — by how far the ball goes.)
const backOverShare = (p: ReturnType<typeof throwPoses>) => {
  if (!p.backOver) return 0;
  const a = chainLength([p.follow, p.backOver], BALL_HAND), b = chainLength([p.backOver, p.relaxed], BALL_HAND);
  return a / Math.max(1e-6, a + b);
};
const backShare = (p: ReturnType<typeof throwPoses>) => {
  if (!p.back) return 0;
  const a = chainLength([p.pull, p.back], BALL_HAND), b = chainLength([p.back, p.windup], BALL_HAND);
  return Math.min(0.75, Math.max(0.25, a / Math.max(1e-6, a + b)));
};

// The two parts of the wind-up (stepping and pulling back, then swinging back and up), sharing its time
// by how far the hand goes in each.
function windPart(p: ReturnType<typeof throwPoses>, timing: ReturnType<typeof throwTiming>, part: "pull" | "windup"): PlacedBeat {
  const a = chainLength([p.gather, p.pull], BALL_HAND), b = chainLength([p.pull, p.windup], BALL_HAND);
  const share = timing.share ?? Math.min(0.7, Math.max(0.3, a / Math.max(1e-6, a + b)));
  return part === "pull"
    ? { kind: timing.kind, pose: p.pull, seconds: timing.windup * share, at: p.pullAt }
    : { kind: timing.kind, pose: p.windup, seconds: timing.windup * (1 - share), at: p.windAt };
}

// How a catcher gets ready: a reaction time (seeing the throw and starting to move), then the hands come
// up at a calm speed; then the arms go out to the ball a little quicker.
const REACTION_SECONDS = 0.2;
const RAISE_SPEED = 1.2; // body heights per second (the hand that travels furthest)
const REACH_SPEED = 0.7; // body heights per second, slowing as the hands meet the ball (soft hands)
const ABSORB_CENTER: Point = { x: 0.2, y: 0.07 };
const readyPose = (feet: Feet) => plantedLegs(READY_POSE, feet, 0, 0.02); // knees soft
const meetPose = (feet: Feet) => plantedLegs(CATCH_POSE, feet, 0.005, 0.015);
const handsTravel = (from: PoseAngles, to: PoseAngles) => Math.max(pathLength(from, to, "lHand"), pathLength(from, to, "rHand"));

export function catchBall(start: Stance, params: CatchParams, settings: MoveSettings): MoveOutput {
  if (params.handOff !== undefined) return takeBall(start, params.handOff, settings, params.handOffRise ?? 0);
  const feet = feetOf(start.pose);
  const give = Math.min(1.4, powerOf(settings));
  // Ready: the hands come up in front of the chest, elbows bent, open, facing the ball.
  const ready = readyPose(feet);
  // Reach: the arms go out to meet the ball; the hands close on it.
  const meet = meetPose(feet);
  // Absorb: the ball's push carries the hands back toward the chest (fast at first, slowing); the body
  // rocks back a little and the knees give.
  const absorbLean = -3 * give;
  const absorb = plantedLegs(withPose(STAND, { lean: absorbLean, head: 4, ...bothHands(absorbLean, ABSORB_CENTER, 145) }), feet, -0.012 * give, 0.022 + 0.01 * give);
  // Secured: the ball brought in to the chest, the knees coming back up (the FLOW pose).
  const secured = plantedLegs(withPose(HOLD_BALL, { lean: -1, ...bothHands(-1, HOLD_CENTER, 140) }), feet, -0.006, 0.018);

  const beats: PlacedBeat[] = [
    { kind: "settle", pose: ready, seconds: REACTION_SECONDS + handsTravel(start.pose, ready) / RAISE_SPEED, at: 0, name: "ready" },
    { kind: "settle", pose: meet, seconds: Math.max(0.15, handsTravel(ready, meet) / REACH_SPEED), at: 0.005, name: "catch" },
    { kind: "follow", pose: absorb, seconds: 0.22, at: -0.012 * give },
    { kind: "settle", pose: secured, seconds: 0.26, at: -0.006, name: "secured" },
    ...recoverBeats({ pose: secured, at: -0.006 }, feet, HOLD_BALL),
  ];
  return placedBeatsToKeys(start, beats, settings);
}

const anyStance = (pose: PoseAngles): Stance => ({ t: 0, x: 0, facing: "right", pose });

// Seconds from the start of a catch (from the plain standing pose) to the moment the hands reach the ball.
export const catchOffset = (settings: MoveSettings) => catchBall(anyStance(STAND), {}, settings).marks.catch;
// Seconds from the start of a throw to the release (the same for any distance of the same kind; the kind
// follows the distance unless `overhand` is given).
export const releaseOffset = (settings: MoveSettings, params: ThrowParams = { distance: THROW_DEFAULTS.distance }) =>
  throwBall(anyStance(HOLD_BALL), params, settings).marks.release;

// Where a held ball's centre is for a pose (the engine's own rule: objects.ts heldCenter). `size` = the
// ball's diameter in px.
export function ballCenter(pose: PoseAngles, facing: Facing, hipX: number, height: number, groundY: number, joint: ObjectHand, size = BALL_RADIUS * 2 * height, lift = 0): Point {
  const skeleton = standingSkeleton(pose, facing, hipX, height, groundY, lift);
  const figure: FrameCharacter = { id: "", skeleton, style: DEFAULT_STYLE, headRadius: 0, facing };
  return heldCenter(figure, joint, size / 2);
}

// Where the ball is when a catch move's hands meet it, for a figure standing at `hipX`. A thrower aims
// here; flight time = catch time - release time.
export const catchPoint = (facing: Facing, hipX: number, height: number, groundY: number): Point =>
  ballCenter(meetPose(feetOf(STAND)), facing, hipX + 0.005 * height * (facing === "left" ? -1 : 1), height, groundY, "hands");

// Where the ball leaves the hand in a throw (in the throwing hand at the "release" mark).
export function releasePoint(start: Stance, params: ThrowParams, settings: MoveSettings, groundY: number): Point {
  const out = throwBall(start, params, settings);
  const key = out.keys.find((k) => Math.abs(k.t - out.marks.release) < 1e-9)!;
  return ballCenter(key.pose, start.facing, key.x, settings.height, groundY, BALL_HAND, undefined, key.lift ?? 0);
}

// How high above the floor (px) the ball leaves the hand in a throw like this (for timing a bounce pass).
export function releaseHeight(params: ThrowParams, settings: MoveSettings) {
  return -releasePoint(anyStance(HOLD_BALL), params, settings, 0).y;
}
