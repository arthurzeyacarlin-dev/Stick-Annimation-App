// ICE POWERS (SPEC-0017 Phase 2C, Arthur 2026-10-06: "a stick figure lifts up his hand and an ice mountain appears,
// or he can throw ice crystals"). Like the other powers (powers.ts) each is a body move PLUS an effect timed by the
// move's marks; powers.ts lists them in POWER_MOVES and calls iceParams / iceArrival / iceEffects from here.
// - ICE MOUNTAIN (iceMountain): ANTICIPATION — a small crouch, the casting hand pulled DOWN and BACK by the hip, eyes
//   on the ground in front — then the hand sweeps forward and LIFTS UP (the body rising with it) and the ice grows out
//   of the ground timed to the hand: a row of jagged spikes running along the ground, small to big, to the target
//   (or one big mountain). The hand stays up while the ice stands; bringing it down cracks the ice, and when it is
//   down the ice shatters (effects/ice.ts iceSpikes).
// - ICE THROW (iceThrow): a sidearm throw — the weight goes back onto the back foot with the throwing hand drawn back
//   behind the hip and the other hand aiming, then the front foot steps in, the weight drives forward and the hand
//   whips through, releasing the crystals in front of the chest, and follows through down and across; then he steps
//   back and stands. The crystals fly to the target and shatter (effects/ice.ts iceShards); a water shield they hit
//   pushes its holder back a little (iceArrival → waterShield's `impactAt`).
// The body obeys the same rules as every move (anticipation, weight, earth gravity, the body rules, no unneeded poses).
// (powers.ts and this file import each other: only functions use the other's exports, never the top level.)
import type { CharacterKey } from "../engine.ts";
import { CRACK_SECONDS, FALL_SECONDS, GROW_SECONDS, HIT_SECONDS, ICE_RUN_SPEED, SHARD_STAGGER, shardTravel } from "../effects/ice.ts";
import type { Anchor, EffectParams, EffectTrack } from "../effects/types.ts";
import { STAND, withPose, type Facing, type PoseAngles, type Point } from "../rig.ts";
import { beatSeconds, forwardSign, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import type { ScenePlan } from "./plan.ts";
import { SHIELD_FORWARD, SHIELD_RADIUS, SHIELD_UP } from "./powers.ts";
import {
  armOf, armReach, atLeast, backLegDrop, blendPose, feetOf, handPoint, isRobot, placedBeatsToKeys, plantedLegs, powerOf, recoverBeats, STAND_HIP, stepPose, windKind, type Feet, type PlacedBeat,
} from "./punch.ts";

export const ICE_MOVES = new Set<string>(["iceMountain", "iceThrow"]);

// ---- Sizes (x the figure's height) -------------------------------------------------------------------
// The ice row starts on the ground this far in front of the caster's hips (clear of his front foot).
export const ICE_AHEAD = 0.4;
// With no target and no distance: one mountain this far in front.
const MOUNTAIN_AHEAD = 1.05;
// The thrown crystals fly at chest height; with no target they land on the ground this far ahead.
export const THROW_HEIGHT = 0.68;
const THROW_DISTANCE = 2.4;
// How long the mountain takes to come up when it is one mountain (its biggest spike starts last; effects/ice.ts).
const MOUNTAIN_REACH = 0.15;

// Both hands at spots from the shoulder (x height, facing right, +y down).
const hands = (lean: number, l: Point, r: Point): Partial<PoseAngles> => {
  const a = armReach(lean, l), b = armReach(lean, r);
  return { ...armOf("l", a.shoulder, a.elbow), ...armOf("r", b.shoulder, b.elbow) };
};
// Beat seconds that come out as exactly `seconds` whatever the style or speed.
const exactly = (seconds: number, settings: MoveSettings) => seconds / Math.max(1e-6, beatSeconds("hold", 1, settings));

// How long the ice row takes to run from in front of the caster to a target `reachPx` away (hip to hip).
export const iceReachSeconds = (reachPx: number, height: number) => Math.max(0.05, (Math.abs(reachPx) - ICE_AHEAD * height) / (ICE_RUN_SPEED * height));

// ICE MOUNTAIN: `target` (a character id) — the ice runs along the ground to it — or `distance` px ahead; with
// neither, one big mountain in front (`shape: "mountain"` makes one mountain at the target too). `seconds` = how long
// the ice stands once it is all up (default 1). (`reachPx`: filled in by the planner from the target.)
export type IceMountainParams = { target?: string; distance?: number; seconds?: number; shape?: "row" | "mountain"; reachPx?: number; color?: string; color2?: string };

export function iceMountain(start: Stance, params: IceMountainParams, settings: MoveSettings): MoveOutput {
  const power = Math.min(1.5, powerOf(settings));
  const robot = isRobot(settings);
  const feet0 = feetOf(start.pose);
  // ANTICIPATION (input behind and below): a small crouch leaning in over the ground in front, the casting hand pulled
  // down and back by the hip, the other hand out low in front for balance, eyes on the ground where the ice will come up.
  const windLean = 10 + 4 * power;
  const crouch = plantedLegs(withPose(STAND, { lean: windLean, head: 12, ...hands(windLean, { x: -0.12, y: 0.28 }, { x: 0.13, y: 0.22 }) }), feet0, -0.01, 0.06 + 0.03 * power);
  // THE LIFT (output in front and up): the hand sweeps forward past the knee and up, palm up, as the knees straighten and
  // the chest lifts; at `release` it passes chest height going up — the first spike bursts out of the ground.
  const mid = plantedLegs(withPose(STAND, { lean: 5, head: 4, ...hands(5, { x: 0.27, y: 0.08 }, { x: 0.07, y: 0.25 }) }), feet0, 0.008, 0.03);
  const liftLean = -2 - 2 * power;
  const lifted = plantedLegs(withPose(STAND, { lean: liftLean, head: -6, ...hands(liftLean, { x: 0.19, y: -0.2 }, { x: -0.03, y: 0.26 }) }), feet0, 0.012, 0.012);
  // holding it up (breathing: small)
  const breathe = plantedLegs(withPose(STAND, { lean: liftLean + 1, head: -5, ...hands(liftLean + 1, { x: 0.192, y: -0.192 }, { x: -0.025, y: 0.265 }) }), feet0, 0.012, 0.016);
  // THE HAND COMES DOWN: the ice cracks while it comes down and shatters as it gets there.
  const lower = plantedLegs(withPose(STAND, { lean: 2, head: 2, ...hands(2, { x: 0.1, y: 0.26 }, { x: 0.03, y: 0.27 }) }), feet0, 0.004, 0.01);
  const shape = params.shape ?? (params.target === undefined && params.distance === undefined ? "mountain" : "row");
  const reachPx = Number(params.reachPx ?? params.distance ?? 0);
  const reach = shape === "mountain" ? MOUNTAIN_REACH : iceReachSeconds(reachPx, settings.height);
  const stand = Math.min(5, Math.max(0.3, Number(params.seconds ?? 1)));
  const liftS = atLeast("action", 0.12, 0.1, settings);
  // (The hand stays up until the last spike is up and has stood `seconds`.)
  const up = Math.max(0.2, reach + GROW_SECONDS + stand - beatSeconds("action", liftS, settings));
  const holdBeats: PlacedBeat[] = [];
  for (let left = up, i = 0; left > 1e-3; i += 1) {
    const s = Math.min(left, 0.6);
    holdBeats.push({ kind: "hold", pose: i % 2 === 0 ? breathe : lifted, seconds: exactly(s, settings), at: 0.012 });
    left -= s;
  }
  holdBeats[holdBeats.length - 1] = { ...holdBeats[holdBeats.length - 1], name: "end" };
  const beats: PlacedBeat[] = [
    { kind: windKind(settings), pose: crouch, seconds: robot ? 0.22 : 0.38, at: -0.01, name: "windup" },
    { kind: "action", pose: mid, seconds: atLeast("action", 0.1, 0.09, settings), at: 0.008, name: "release" },
    { kind: "action", pose: lifted, seconds: liftS, at: 0.012, name: "lift" },
    ...holdBeats,
    { kind: "settle", pose: lower, seconds: exactly(CRACK_SECONDS, settings), at: 0.004, name: "shatter" },
    { kind: "settle", pose: STAND, seconds: 0.35, at: 0, recover: true },
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  // `reach`: when the ice gets to the target (its biggest spike starts to grow).
  out.marks.reach = out.marks.release + reach;
  return out;
}

// ICE THROW: `target` (a character id: its water shield if it holds one then, else its chest) or `distance` px ahead
// (the crystals come down on the ground there); `count` crystals (default 3). (`hitPx`: filled in by the planner.)
export type IceThrowParams = { target?: string; distance?: number; count?: number; hitPx?: number; color?: string; color2?: string };

export function iceThrow(start: Stance, params: IceThrowParams, settings: MoveSettings): MoveOutput {
  const power = Math.min(1.5, powerOf(settings));
  const robot = isRobot(settings);
  const feet0 = feetOf(start.pose);
  // ANTICIPATION (input behind): the weight goes back over the back foot — hips back, knees bent, leaning back — the
  // throwing (back) hand drawn back behind the hip at belt height, the front hand out at the target (aiming).
  const windLean = -5 - 4 * power;
  const windAt = -0.035 * power;
  const windup = plantedLegs(withPose(STAND, { lean: windLean, head: 2, ...hands(windLean, { x: 0.22, y: 0.02 }, { x: -0.2, y: 0.17 }) }), feet0, windAt, 0.045 + 0.02 * power);
  // THE STEP AND THROW: the front foot steps in (a lunge), the weight drives forward, the hand whips through past the
  // hip and lets the crystals go in front of the chest (`release`), the front hand pulled in to the chest.
  const throwFeet: Feet = { r: feet0.r, l: feet0.r + 0.32 + 0.04 * power };
  const throwAt = feet0.r + 0.6 * (throwFeet.l - throwFeet.r);
  const throwLean = 9 + 4 * power;
  const thrown = plantedLegs(withPose(STAND, { lean: throwLean, head: -2, ...hands(throwLean, { x: 0.06, y: 0.2 }, { x: 0.29, y: 0.03 }) }), throwFeet, throwAt, backLegDrop(throwFeet, throwAt) + 0.03);
  const midAt = (windAt + throwAt) / 2;
  const mid = stepPose(withPose(blendPose(windup, thrown, 0.5), hands((windLean + throwLean) / 2, { x: 0.12, y: 0.12 }, { x: 0.02, y: 0.22 })), feet0, throwFeet, midAt, 0.05, "l", 0.05);
  // FOLLOW-THROUGH: the hand carries on forward and down across the body, the chest over the front knee.
  const followAt = throwAt + 0.02;
  const follow = plantedLegs(withPose(STAND, { lean: throwLean + 6, head: 0, ...hands(throwLean + 6, { x: 0.02, y: 0.21 }, { x: 0.22, y: 0.19 }) }), throwFeet, followAt, backLegDrop(throwFeet, followAt) + 0.04);
  const settleAt = throwAt;
  const settle = plantedLegs(withPose(STAND, { lean: 4, head: 0, ...hands(4, { x: 0.1, y: 0.24 }, { x: 0.08, y: 0.25 }) }), throwFeet, settleAt, backLegDrop(throwFeet, settleAt) + 0.02);
  const beats: PlacedBeat[] = [
    { kind: windKind(settings), pose: windup, seconds: robot ? 0.22 : 0.36, at: windAt, name: "windup" },
    { kind: "action", pose: mid, seconds: atLeast("action", 0.1, 0.09, settings), at: midAt, contacts: ["rFoot"] },
    { kind: "action", pose: thrown, seconds: atLeast("action", 0.08, 0.075, settings), at: throwAt, name: "release" },
    { kind: robot ? "settle" : "follow", pose: follow, seconds: 0.18, at: followAt },
    { kind: "settle", pose: settle, seconds: 0.3, at: settleAt, name: "end" },
    ...recoverBeats({ pose: settle, at: settleAt }, throwFeet, STAND),
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  // `hit`: when the first crystal hits (its target's shield then braces for it).
  const hitPx = Number(params.hitPx ?? params.distance ?? THROW_DISTANCE * settings.height);
  out.marks.hit = out.marks.release + shardTravel(hitPx, settings.height);
  return out;
}

// ---- The planner's hooks (powers.ts) ---------------------------------------------------------------------

type KeysOf = (id: string) => readonly CharacterKey[] | undefined;

// Each ice action (and water shield) in the plan, with its number and marks.
function actionsOf(plan: ScenePlan, marks: Record<string, number>, moves: readonly string[]) {
  const out: { id: string; move: string; params: Record<string, unknown>; mark: (name: string) => number | undefined }[] = [];
  for (const c of plan.characters) {
    const count: Record<string, number> = {};
    for (const a of c.actions) {
      count[a.move] = (count[a.move] ?? 0) + 1;
      if (!moves.includes(a.move)) continue;
      const k = count[a.move], move = a.move;
      out.push({ id: c.id, move, params: a.params ?? {}, mark: (name) => marks[`${c.id}.${move}${k}.${name}`] });
    }
  }
  return out;
}
const targetOf = (plan: ScenePlan, params: Record<string, unknown>) => (typeof params.target === "string" ? plan.characters.find((c) => c.id === params.target) : undefined);
const hasShield = (plan: ScenePlan, id: string) => !!plan.characters.find((c) => c.id === id)?.actions.some((a) => a.move === "waterShield");

// Where the crystals hit a figure, from its hips (x height, its facing; +y down): the near edge of its water shield at
// THROW_HEIGHT, or its chest.
function hitSpot(shielded: boolean, theirDir: number, myDir: number): Point {
  if (!shielded) return { x: -myDir * 0.03, y: -(THROW_HEIGHT - STAND_HIP) };
  const rise = THROW_HEIGHT - (STAND_HIP + SHIELD_UP);
  const across = Math.sqrt(Math.max(0, SHIELD_RADIUS ** 2 - rise ** 2));
  return { x: theirDir * SHIELD_FORWARD - myDir * across, y: -(SHIELD_UP + rise) };
}

// From the plan's spots: how far the ice row runs (hip to hip) and how far the crystals fly (hand to hit).
export function iceParams(plan: ScenePlan, characterId: string, move: string, params: Record<string, unknown>): Record<string, unknown> {
  const me = plan.characters.find((c) => c.id === characterId), them = targetOf(plan, params);
  if (!me || !them) return params;
  const h = plan.height, myDir = them.x >= me.x ? 1 : -1;
  if (move === "iceMountain" && params.reachPx === undefined) return { ...params, reachPx: Math.abs(them.x - me.x) };
  if (move === "iceThrow" && params.hitPx === undefined) {
    const spot = hitSpot(hasShield(plan, them.id), them.facing === "left" ? -1 : 1, myDir);
    return { ...params, hitPx: Math.max(0.2 * h, Math.abs(them.x + spot.x * h - (me.x + myDir * 0.3 * h))) };
  }
  return params;
}

// When the first crystal thrown at `who` hits it (scene seconds), if it is known yet.
export function iceArrival(plan: ScenePlan, marks: Record<string, number>, who: string): number | undefined {
  for (const p of actionsOf(plan, marks, ["iceThrow"])) if (p.params.target === who && p.mark("hit") !== undefined) return p.mark("hit");
  return undefined;
}

// Where a figure's hips are, and which way it faces, at a time (from its keys; else where the plan puts it); and its
// key at exactly that time, if it has one.
function placeAt(plan: ScenePlan, id: string, t: number, keysOf?: KeysOf): { x: number; facing: Facing; key?: CharacterKey } {
  const c = plan.characters.find((ch) => ch.id === id);
  const keys = keysOf?.(id);
  if (!keys || keys.length === 0) return { x: c?.x ?? 960, facing: c?.facing ?? "right" };
  let facing: Facing = c?.facing ?? "right";
  for (const k of keys) { if (k.t > t + 1e-9) break; facing = k.facing ?? facing; }
  const key = keys.find((k) => Math.abs(k.t - t) < 1e-6);
  if (key) return { x: key.x, facing, key };
  if (t <= keys[0].t) return { x: keys[0].x, facing };
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i].t >= t) { const a = keys[i - 1], b = keys[i], u = (t - a.t) / Math.max(1e-9, b.t - a.t); return { x: a.x + (b.x - a.x) * u, facing }; }
  }
  return { x: keys[keys.length - 1].x, facing };
}
const dirOf = (facing: Facing) => (facing === "left" ? -1 : 1);

// The effects of every ice power in the plan, from the built scene's marks ("<id>.<move><k>.<mark>").
export function iceEffects(plan: ScenePlan, marks: Record<string, number>, keysOf?: KeysOf): EffectTrack[] {
  const h = plan.height, ground = plan.groundY;
  const tracks: EffectTrack[] = [];
  const colors = (params: Record<string, unknown>): EffectParams => ({
    ...(typeof params.color === "string" ? { color: params.color } : {}),
    ...(typeof params.color2 === "string" ? { color2: params.color2 } : {}),
  });
  for (const p of actionsOf(plan, marks, ["iceMountain", "iceThrow"])) {
    const them = targetOf(plan, p.params);
    if (p.move === "iceMountain") {
      const release = p.mark("release"), reach = p.mark("reach"), end = p.mark("end"), shatter = p.mark("shatter");
      if (release === undefined || reach === undefined || end === undefined || shatter === undefined) continue;
      const me = placeAt(plan, p.id, release, keysOf), dir = dirOf(me.facing);
      const anchor = { x: me.x + dir * ICE_AHEAD * h, y: ground };
      const mountain = p.params.shape === "mountain" || (!them && p.params.distance === undefined);
      // The target: where the target figure stands when the ice starts (the ice runs to that spot), or `distance` ahead.
      const to = them ? placeAt(plan, them.id, release, keysOf).x : me.x + dir * Number(p.params.distance ?? MOUNTAIN_AHEAD * h);
      tracks.push({
        kind: "iceSpikes", start: release, end: shatter + FALL_SECONDS, anchor, target: { x: to, y: ground },
        params: { ...colors(p.params), reach: reach - release, crack: end - release, shatter: shatter - release, ...(mountain ? { shape: "mountain" } : {}) },
      });
    } else {
      const release = p.mark("release"), hit = p.mark("hit");
      if (release === undefined || hit === undefined) continue;
      const me = placeAt(plan, p.id, release, keysOf), dir = dirOf(me.facing);
      // The crystals leave the throwing hand where it is at the release (a fixed spot: they fly on their own).
      const hand = me.key ? handPoint(me.key.pose, me.facing, me.key.x, h, ground, "rHand", me.key.lift ?? 0) : { x: me.x + dir * 0.3 * h, y: ground - THROW_HEIGHT * h };
      const count = Math.round(Math.min(6, Math.max(1, Number(p.params.count ?? 3))));
      let target: Anchor;
      if (them) {
        const spot = hitSpot(hasShield(plan, them.id) && shieldUp(plan, marks, them.id, hit), dirOf(placeAt(plan, them.id, hit, keysOf).facing), dir);
        target = { character: them.id, joint: "hip", dx: spot.x * h, dy: spot.y * h };
      } else target = { x: hand.x + dir * Number(p.params.distance ?? THROW_DISTANCE * h), y: ground };
      const travel = hit - release;
      tracks.push({ kind: "iceShards", start: release, end: hit + (count - 1) * SHARD_STAGGER + HIT_SECONDS, anchor: hand, target, params: { ...colors(p.params), count, travel } });
    }
  }
  return tracks;
}

// Is `who` holding a water shield up at time t (by its marks)?
function shieldUp(plan: ScenePlan, marks: Record<string, number>, who: string, t: number) {
  return actionsOf(plan, marks, ["waterShield"]).some((p) => p.id === who && (p.mark("hold") ?? Infinity) <= t + 1e-6 && t <= (p.mark("release") ?? -Infinity) + 1e-6);
}
