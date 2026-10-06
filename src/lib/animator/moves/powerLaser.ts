// LASER EYES (SPEC-0017 Phase 2C extras, 2026-10-06 — Arthur's little sister asked for it): a POWER like the fire
// blast (powers.ts): an ordinary body move whose marks time the effect tracks (effects/laser.ts).
// Arthur's rules hold: ANTICIPATION (the head dips, chin down, the fists pull back and the knees soften while the
// eyes glow — the charge), the ACTION (the head snaps up to the target and the beams shoot out), the body reacts
// AWAY from the energy (a small RECOIL: the head is pushed back, a slight lean back, the knees soften more), then he
// braces and holds while beaming (the head following the hit spot if it sweeps), the beams cut off, the eyes fade
// and he stands. WEIGHT and EARTH GRAVITY: the feet stay planted, the knees take the push. No unneeded poses.
// The EYES (gaze.ts): he looks at what he zaps — the head turns most of the way toward the hit spot, the eyes the rest.
import type { CharacterKey } from "../engine.ts";
import { EYE_FADE, LASER_REACH } from "../effects/laser.ts";
import type { Anchor, EffectParams, EffectTrack, Point } from "../effects/types.ts";
import { HEAD_RADIUS, JOINT_LIMITS, STAND, withPose, type Facing, type PoseAngles } from "../rig.ts";
import { eyesOf, headToward, lookTarget, type LookTarget } from "./gaze.ts";
import { beatSeconds, forwardSign, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import type { ScenePlan } from "./plan.ts";
import { armOf, armReach, feetOf, isRobot, placedBeatsToKeys, plantedLegs, powerOf, recoverBeats, windKind, type PlacedBeat } from "./punch.ts";

// LASER EYES: `target` (a character id) — `at: "body"` (default with a target) hits its chest, `at: "ground"` the
// ground just in front of it; with no target it hits the ground `distance` px ahead (default LASER_DISTANCE x
// height). `sweep` = px the hit spot slides along the ground while it beams (forward +, back -), `seconds` = how
// long the beams are on (default 1). `color` = the glow (default red), `color2` = the core (default white).
// `aim` (filled in by the planner) = where the hit spot is from the eyes (gaze.ts LookTarget), so the head aims there.
export type LaserEyesParams = { target?: string; at?: "body" | "ground"; distance?: number; sweep?: number; seconds?: number; color?: string; color2?: string; aim?: LookTarget };

// The ground hit with no target: this far ahead of the hips (x height). With a target and `at: "ground"`: this far
// in front of it (x height).
export const LASER_DISTANCE = 1.8;
export const IN_FRONT_OF = 0.6;
// The middle of the two eyes on the face (an `onHead` anchor: x head radius toward the face, and up the head): a
// little toward the facing side, at eye height. The two eyes sit SIDE BY SIDE on one level line round it (Arthur:
// "one dot on the left, one on the right"), EYE_GAP x head radius apart. They float: placed on top of the head,
// filled or hollow alike.
export const EYE_FORWARD = 0.42;
export const EYE_UP = 0.15;
export const EYE_GAP = 0.55;
// The scorch mark stays this long after the beams stop (seconds; effectively to the end of the scene).
const SCORCH_STAYS = 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Beat seconds that come out as exactly `seconds` whatever the style or speed.
const exactly = (seconds: number, settings: MoveSettings) => seconds / Math.max(1e-6, beatSeconds("hold", 1, settings));

// Both arms putting the hands at the given spots (from the shoulder; x height, facing right, +y down).
const hands = (lean: number, l: Point, r: Point): Partial<PoseAngles> => {
  const a = armReach(lean, l), b = armReach(lean, r);
  return { ...armOf("l", a.shoulder, a.elbow), ...armOf("r", b.shoulder, b.elbow) };
};
// Where the hips are from the shoulder for a lean (to put a fist "by the hip").
const hipFrom = (lean: number): Point => ({ x: 0.3 * Math.sin((lean * Math.PI) / 180), y: 0.3 * Math.cos((lean * Math.PI) / 180) });
const byHip = (lean: number, l: Point, r: Point) => { const p = hipFrom(lean); return hands(lean, { x: p.x + l.x, y: p.y + l.y }, { x: p.x + r.x, y: p.y + r.y }); };

// Where the hit spot is from the eyes when nobody filled `aim` in: the ground `distance` px ahead (facing right).
function defaultAim(distance: number | undefined, height: number): LookTarget {
  const eyes = eyesOf(STAND, "right", 0, height, 0);
  return lookTarget(eyes, { x: Number(distance ?? LASER_DISTANCE * height), y: 0 }, "right");
}

export function laserEyes(start: Stance, params: LaserEyesParams, settings: MoveSettings): MoveOutput {
  const power = Math.min(1.5, powerOf(settings));
  const robot = isRobot(settings);
  const feet0 = feetOf(start.pose);
  const aim0 = params.aim ?? defaultAim(params.distance, settings.height);
  const aim1: LookTarget = { ahead: aim0.ahead + Number(params.sweep ?? 0), up: aim0.up };
  // The head that looks at the hit spot (the eyes do the rest), plus `extra` degrees (+ = chin down).
  const look = (lean: number, aim: LookTarget, extra = 0) => clamp(headToward({ ...STAND, lean }, aim, 0.9) + extra, JOINT_LIMITS.head[0], JOINT_LIMITS.head[1]);
  // ANTICIPATION (the charge): the head dips — chin down — the shoulders round a little, the fists pull back by the
  // hips, the knees soften. The eyes glow while it holds there a moment.
  const dipLean = 5 + 2 * power;
  const dip = plantedLegs(withPose(STAND, { lean: dipLean, head: look(dipLean, aim0, 18 + 5 * power), ...byHip(dipLean, { x: -0.06, y: -0.01 }, { x: -0.09, y: -0.02 }) }), feet0, -0.01, 0.03 + 0.01 * power);
  const charge = plantedLegs(withPose(dip, { head: Math.min(JOINT_LIMITS.head[1], dip.head + 2), lean: dipLean + 1 }), feet0, -0.01, 0.035 + 0.01 * power);
  // ACTION: the head snaps up to the target (a touch past it) and the beams shoot; the fists come in by the sides.
  const fire = plantedLegs(withPose(STAND, { lean: 1, head: look(1, aim0, -3), ...byHip(1, { x: 0.02, y: -0.01 }, { x: -0.01, y: 0 }) }), feet0, 0, 0.025);
  // RECOIL (the body reacts away from the energy): the head is pushed back, a slight lean back, the hips give back,
  // the knees soften; the arms swing forward a little to balance.
  const recoilLean = -3 - 2 * power;
  const recoil = plantedLegs(withPose(STAND, { lean: recoilLean, head: look(recoilLean, aim0, -8 - 3 * power), ...byHip(recoilLean, { x: 0.07, y: -0.03 }, { x: 0.04, y: -0.02 }) }), feet0, -0.02 * power, 0.045);
  // BRACE and HOLD while beaming: leaning in a little, knees soft, eyes on the hit spot (following it if it sweeps).
  const brace = plantedLegs(withPose(STAND, { lean: 2, head: look(2, aim0), ...byHip(2, { x: 0.03, y: -0.01 }, { x: 0, y: 0 }) }), feet0, -0.008, 0.035);
  const held = withPose(brace, { head: look(2, aim1) });
  const beam = Math.min(4, Math.max(0.4, Number(params.seconds ?? 1)));
  const recoilKind = robot ? "settle" : "follow";
  const used = beatSeconds(recoilKind, 0.13, settings) + beatSeconds("settle", 0.16, settings);
  // (From a pose with an arm far away — up high after a wave — the arms take longer to come down to the hips, so
  // they never whip round: the dip lasts longer the further they go.)
  const turn = (d: number) => Math.abs((((d % 360) + 540) % 360) - 180);
  const armTravel = Math.max(...(["l", "r"] as const).map((s) => turn(dip[`${s}Shoulder`] - start.pose[`${s}Shoulder`]) + 0.5 * Math.abs(dip[`${s}Elbow`] - start.pose[`${s}Elbow`])));
  const dipSeconds = (robot ? 0.2 : 0.3) * Math.max(1, armTravel / 70);
  const beats: PlacedBeat[] = [
    { kind: windKind(settings), pose: dip, seconds: dipSeconds, at: -0.01, name: "dip" },
    { kind: "hold", pose: charge, seconds: robot ? 0.15 : 0.22, at: -0.01 },
    { kind: "action", pose: fire, seconds: 0.07, at: 0, name: "release" },
    { kind: recoilKind, pose: recoil, seconds: 0.13, at: -0.02 * power, name: "recoil" },
    { kind: "settle", pose: brace, seconds: 0.16, at: -0.008, name: "brace" },
    { kind: "hold", pose: held, seconds: exactly(Math.max(0.1, beam - used), settings), at: -0.008, name: "end" },
    ...recoverBeats({ pose: held, at: -0.008 }, feet0, STAND, 0.6),
  ];
  const out = placedBeatsToKeys(start, beats, settings);
  const m = out.marks;
  // The eyes start to glow a third of the way into the dip; the beams reach their target just after the release.
  m.charge = start.t + 0.35 * (m.dip - start.t);
  m.hit = m.release + LASER_REACH;
  return out;
}

// ---- Where it hits --------------------------------------------------------------------------------

type KeysOf = (id: string) => readonly CharacterKey[] | undefined;
// Where a figure's hips are, and which way it faces, at a time (from its keys; else where the plan puts it).
function placeAt(plan: ScenePlan, id: string, t: number, keysOf?: KeysOf): { x: number; facing: Facing } {
  const c = plan.characters.find((ch) => ch.id === id);
  const keys = keysOf?.(id);
  if (!keys || keys.length === 0) return { x: c?.x ?? 960, facing: c?.facing ?? "right" };
  let facing: Facing = c?.facing ?? "right";
  for (const k of keys) { if (k.t > t + 1e-9) break; facing = k.facing ?? facing; }
  if (t <= keys[0].t) return { x: keys[0].x, facing };
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i].t >= t) { const a = keys[i - 1], b = keys[i], u = (t - a.t) / Math.max(1e-9, b.t - a.t); return { x: a.x + (b.x - a.x) * u, facing }; }
  }
  return { x: keys[keys.length - 1].x, facing };
}

// The hit spot: a figure's chest (an anchor that follows it), or a point on the ground.
function hitSpot(plan: ScenePlan, id: string, params: Record<string, unknown>, me: { x: number; facing: Facing }, xOf: (who: string) => number): { anchor: Anchor; point: Point; ground: boolean } {
  const h = plan.height, dir = forwardSign(me.facing);
  const target = typeof params.target === "string" && params.target !== id && plan.characters.some((c) => c.id === params.target) ? params.target : undefined;
  const ground = !target || params.at === "ground";
  if (target && !ground) {
    // (The chest: a tenth of the height below the neck of a figure standing tall.)
    const chest = plan.groundY - (eyesOf(STAND, "right", 0, h, 0).y * -1 - HEAD_RADIUS.normal * h - 0.1 * h);
    return { anchor: { character: target, joint: "neck", dy: 0.1 * h }, point: { x: xOf(target), y: chest }, ground: false };
  }
  const x = target ? xOf(target) - dir * IN_FRONT_OF * h : me.x + dir * Number(params.distance ?? LASER_DISTANCE * h);
  const point = { x, y: plan.groundY };
  return { anchor: point, point, ground: true };
}

// The planner's hook (powers.ts powerParams): where the hit spot is from the eyes, from the plan's spots, so the head
// aims at it. (A figure that walks first aims from where the plan put it; the beams always go to the real spot.)
export function laserEyesParams(plan: ScenePlan, characterId: string, params: Record<string, unknown>): Record<string, unknown> {
  if (params.aim !== undefined) return params;
  const me = plan.characters.find((c) => c.id === characterId);
  if (!me) return params;
  const xOf = (who: string) => plan.characters.find((c) => c.id === who)?.x ?? me.x;
  const spot = hitSpot(plan, characterId, params, { x: me.x, facing: me.facing }, xOf);
  const eyes = eyesOf(STAND, me.facing, me.x, plan.height, plan.groundY);
  return { ...params, aim: lookTarget(eyes, spot.point, me.facing) };
}

// The effect tracks of one laserEyes action (powers.ts powerEffects): the eyes and beams, and the hit.
export function laserEyesEffects(plan: ScenePlan, action: { id: string; k: number; params: Record<string, unknown>; mark: (name: string) => number | undefined }, keysOf?: KeysOf): EffectTrack[] {
  const { id, k, params, mark } = action;
  const charge = mark("charge"), release = mark("release"), brace = mark("brace"), end = mark("end");
  if (charge === undefined || release === undefined || end === undefined) return [];
  const h = plan.height;
  const me = placeAt(plan, id, release, keysOf), dir = forwardSign(me.facing);
  const hitStart = release + LASER_REACH;
  const spot = hitSpot(plan, id, params, me, (who) => placeAt(plan, who, hitStart, keysOf).x);
  const look = plan.characters.find((c) => c.id === id)?.look;
  const r = HEAD_RADIUS[look?.headSize ?? "normal"] * h;
  const fx: EffectParams = {
    ...(typeof params.color === "string" ? { color: params.color } : {}),
    ...(typeof params.color2 === "string" ? { color2: params.color2 } : {}),
  };
  // The sweep (ground hits only): from when he braces until just before the beams stop.
  const sweep = spot.ground ? dir * Number(params.sweep ?? 0) : 0;
  const from = brace ?? release, to = Math.max(from + 0.1, end - 0.05);
  const sweepOn = (t0: number) => (sweep ? { sweep, sweepFrom: from - t0, sweepTo: to - t0 } : {});
  const eye: Anchor = { character: id, joint: "head", onHead: { forward: EYE_FORWARD, up: EYE_UP } };
  // (The eyes and beams are a "top" track: drawn OVER the heads — Arthur: "the laser needs to be coming out of his
  // eyes" — so the beams visibly start at the eye dots; in the app it is its own layer above the AI layer.)
  return [
    { kind: "laserEyes", start: charge, end: end + EYE_FADE, anchor: eye, target: spot.anchor, params: { ...fx, fireAt: release - charge, cutAt: end - charge, gap: EYE_GAP * r, seed: 3 + k, ...sweepOn(charge) }, layer: "top" },
    { kind: "laserHit", start: hitStart, end: end + SCORCH_STAYS, anchor: spot.anchor, params: { ...fx, cutAt: end - hitStart, back: -dir, seed: 5 + k, ...sweepOn(hitStart) }, layer: spot.ground ? "back" : "front" },
  ];
}
