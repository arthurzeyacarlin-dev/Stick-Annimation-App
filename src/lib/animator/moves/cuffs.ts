import { buildScene, type CharacterKey, type FootContact, type Scene } from "../engine.ts";
import { monotoneTangents, sampleChannel, unwrapAngles, type Ease } from "../easing.ts";
import { handcuffsAt, HANDCUFFS_WIDTH } from "../effects/handcuffs.ts";
import type { EffectTrack } from "../effects/types.ts";
import { forwardKinematics, translateSkeleton } from "../pose.ts";
import { DEFAULT_STYLE, headRadius, JOINT_LIMITS, POSE_KEYS, PROPORTIONS, STAND, type Facing, type PoseAngles, type PoseKey, type Point, type Skeleton } from "../rig.ts";
import { buildGait } from "./gait.ts";
import { beatsToKeys, BOTH_FEET, forwardSign, type MoveOutput, type MoveSettings, type Stance } from "./motion.ts";
import { armReach, blendPose, feetOf, placedBeatsToKeys, plantedLegs, stepPose, type Feet, type PlacedBeat, type Side } from "./punch.ts";
import type { CharacterPlan, ScenePlan } from "./plan.ts";

// HANDCUFFS AND A POLICE ESCORT (SPEC-0017 Phase 2C extras, 2026-10-06 — asked for by Arthur's little sister).
// Arthur: "The stick figure with handcuffs has its hands behind its back — it can't swing its arms left and right
// because it has handcuffs. The police stick figure behind it has to hold its hands so it doesn't try to escape."
//
// CUFFED (a character option, `cuffed: true`, or `cuffed: { from: seconds }` from a moment on): both hands stay
// TOGETHER BEHIND THE BACK in every move — standing, walking, turning, sitting: the wrists touch at the lower back,
// the elbows bent back; the arms never swing. The body balances with its torso instead (it leans in a little more,
// head a little down) and takes shorter, slower steps. It can struggle (`tug`): a lunge forward that yanks the
// cuffed arms up behind it, and it is pulled back — the hands stay together the whole time. The "Handcuffs"
// Library symbol (effects/handcuffs.ts) sits on its wrists in every picture, turned with the forearms.
// Nothing here changes how an uncuffed figure moves: every rule below only touches cuffed figures and escorts.
//
// ESCORT (`escort`, `partner` = the cuffed one): the police walks RIGHT BEHIND the prisoner (ESCORT_GAP), in step
// (its legs take the prisoner's steps, so same pace, same rhythm), one hand HOLDING THE CUFFS (on the chain, every
// picture), the other hand on the prisoner's upper arm by the shoulder. Both hands are worked out from where the
// prisoner really is in every picture, so they never leave the cuffs or the arm, and never go through a body. When
// the prisoner tugs, the police is pulled forward a little, then leans back and pulls it back (a tighter grip: the
// holding arm bends as the prisoner comes back).

// ---- The cuffed pose -------------------------------------------------------------------------------
// Side view: upper arms back and down, elbows bent back, forearms meeting at the small of the back (the hands about
// 0.06 x height behind the back line, 0.065 above the hips). Both arms the same: seen from the side the wrists overlap.
export const CUFFED_ARMS = { shoulder: -51, elbow: 77 } as const;
// Facing the viewer: the arms go down and in behind the hips (the hands hidden behind the body, close together).
export const CUFFED_ARMS_FRONT = { shoulder: 2, elbow: 2 } as const;
// THE BODY BALANCES INSTEAD: a cuffed figure leans in a little more and hangs its head a little (degrees).
export const CUFF_LEAN = 3;
export const CUFF_HEAD = 4;
// Cuffed from a moment on: the hands go behind the back over this long (seconds).
const CUFF_IN = 0.35;
// How long before a turn's view switch the cuffed arms still hold the old view's pose (seconds: between pictures).
const VIEW_HOLD = 0.004;
// How far behind the prisoner the police walks: hip to hip, x height (right behind, with a clear gap between its
// chest and the prisoner's cuffed elbows — about half a body width — and its holding arm still bent to the cuffs).
export const ESCORT_GAP = 0.28;
// The police leans in a little over its prisoner (degrees more lean), reaching forward to the cuffs.
const POLICE_LEAN = 7;
// The holding arm is never stretched past this share of its full length (the police leans in to reach instead).
const REACH = 0.97;
// Where the shoulder hand goes: this far down the prisoner's upper arm from its shoulder.
const SHOULDER_GRIP = 0.3;
// Grabbing hold (when the police was doing something else before) and letting go (something follows): seconds.
const GRAB = 0.3;
// The police's hands are worked out this many times a second (8, 10, 12, 15, 24, 30, 40 and 60 fps pictures land
// exactly on one; any other picture falls between two that are a hundred-and-twentieth of a second apart).
const HOLD_FPS = 120;

export type CuffedOption = boolean | { from?: number };
// When a character is cuffed from (seconds), or undefined if never.
export const cuffedFrom = (c: { cuffed?: CuffedOption }): number | undefined =>
  c.cuffed === true ? 0 : c.cuffed && typeof c.cuffed === "object" ? Math.max(0, Number(c.cuffed.from ?? 0) || 0) : undefined;

// Arms behind the back (both together) on a pose, for its view.
export function cuffedArms(pose: PoseAngles, facing: Facing, arms: { shoulder: number; elbow: number } = facing === "front" ? CUFFED_ARMS_FRONT : CUFFED_ARMS): PoseAngles {
  return { ...pose, lShoulder: arms.shoulder, rShoulder: arms.shoulder, lElbow: arms.elbow, rElbow: arms.elbow };
}
// The whole cuffed posture: arms behind, a little more lean (the legs turned with it, so the feet stay put), head
// a little down. A body lying or bent far over only gets the arms.
export function cuffedPose(pose: PoseAngles, facing: Facing): PoseAngles {
  const arms = cuffedArms(pose, facing);
  if (facing === "front" || Math.abs(pose.lean) > 45) return arms;
  // (The legs turn with the lean only as far as the hips can bend: a deep sit leans in less.)
  const d = Math.max(0, Math.min(CUFF_LEAN, JOINT_LIMITS.lHip[1] - Math.max(pose.lHip, pose.rHip), JOINT_LIMITS.lean[1] - pose.lean));
  return { ...arms, lean: pose.lean + d, lHip: pose.lHip + d, rHip: pose.rHip + d, head: Math.min(JOINT_LIMITS.head[1], pose.head + CUFF_HEAD) };
}

// ---- TUG: the cuffed figure tries to break free -------------------------------------------------------
// AN ESCAPE ATTEMPT IS SUDDEN (Arthur, round 2: "they stop and then Red tugs — it looks planned"): the prisoner's own
// sudden idea, in the middle of walking — no stop first and no wind-up anyone could see coming. Straight out of the
// stride it bursts forward: the free foot lunges a long step ahead, the body pitches forward and the cuffed arms are
// yanked up behind it (the police still has the cuffs). Then it is pulled back (by the police, who reacts AFTER it
// starts: ESCORT), the front foot is dragged and steps back beside the other, and it settles to walk on. One foot
// (the pivot: the one on the ground when it starts) never moves, so a figure walking in step behind it can keep it
// too. (After a walk the planner hands over mid-stride: plan.ts TAKES_MOMENTUM.)
export type TugParams = { speed?: number };
export const TUG_ABOUT = "A CUFFED figure suddenly tries to break free — in the middle of a walk (put it straight after a walk: no stop, no wind-up): it lunges a long step forward, body pitched, cuffed arms yanked up behind, is pulled back, steps back and walks on with the next walk. Its escort reacts by itself, after it starts. Marks `escape`, `pull`, `yanked`, `settled`.";
// When each part happens (seconds after the escape starts) and where the hips are (x height, forward of the start).
export const ESCAPE = { burst: 0.16, pull: 0.3, strain: 0.38, yanked: 0.54, stepBack: 0.68, settled: 0.86 };
// (Measured from the pivot foot, which may be ahead of the hips or behind them when it starts: the lunge always goes
// forward of where the body is, the pull back always ends a little behind the pivot foot.)
const LUNGE = { peak: 0.12, most: 0.18, landAhead: 0.19, back: -0.09, reach: 0.16 };
// Which foot stays put (the pivot: the one down, or the front one if both are) and which one lunges.
export function escapeFeet(pose: PoseAngles): { pivot: Side; free: Side } {
  const s = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false), f = feetOf(pose);
  const both = Math.abs(s.lFoot.y - s.rFoot.y) < 0.006;
  const pivot: Side = both ? (f.l >= f.r ? "l" : "r") : s.lFoot.y > s.rFoot.y ? "l" : "r";
  return { pivot, free: pivot === "l" ? "r" : "l" };
}
const armsAt = (shoulder: number, elbow: number) => ({ lShoulder: shoulder, rShoulder: shoulder, lElbow: elbow, rElbow: elbow });
export function tug(start: Stance, _params: TugParams, settings: MoveSettings): MoveOutput {
  // (Its own timing, whatever the walking pace or mood: an escape attempt is quick.)
  const s: MoveSettings = { height: settings.height, style: "natural", speed: "normal", energy: 0.5 };
  const p0 = start.pose, facing = start.facing;
  if (facing === "front") return beatsToKeys(start, [{ kind: "hold", seconds: 0.6, pose: p0, name: "settled" }], s);
  const f = feetOf(p0), { pivot, free } = escapeFeet(p0);
  const stand = feetOf(STAND);
  // (Never so far forward of the pivot foot that the leg behind can't reach it.)
  const peak = Math.min(f[pivot] + LUNGE.reach, Math.max(0, f[pivot]) + LUNGE.peak, LUNGE.most), burst = 0.6 * peak, back = f[pivot] + LUNGE.back;
  const ahead = { ...f, [free]: peak + LUNGE.landAhead } as Feet;
  const endAt = f[pivot] - stand[pivot], end = { [pivot]: f[pivot], [free]: endAt + stand[free] } as Feet;
  const pose = (lean: number, head: number, arms: ReturnType<typeof armsAt>) => ({ ...p0, lean, head, ...arms });
  const onPivot = [`${pivot}Foot` as FootContact];
  const beats: PlacedBeat[] = [
    // Straight out of the stride: the free foot lunges forward, the body pitches, the arms are yanked up behind.
    { kind: "action", ease: "out", xEase: "linear", seconds: ESCAPE.burst, at: burst, pose: stepPose(pose(12, -4, armsAt(-56, 68)), f, ahead, burst, 0.02, free, 0.05), contacts: onPivot },
    { kind: "action", ease: "smooth", seconds: ESCAPE.pull - ESCAPE.burst, at: peak, pose: plantedLegs(pose(22, -6, armsAt(-63, 57)), ahead, peak, 0.04), name: "pull" },
    // Straining against the grip...
    { kind: "hold", seconds: ESCAPE.strain - ESCAPE.pull, at: peak + 0.005, pose: plantedLegs(pose(24, -7, armsAt(-64, 56)), ahead, peak + 0.005, 0.042) },
    // ...yanked back: the body snaps upright and a little past, the front foot jerked up off the floor...
    { kind: "action", ease: "out", seconds: ESCAPE.yanked - ESCAPE.strain, at: back, pose: stepPose(pose(-5, 6, armsAt(CUFFED_ARMS.shoulder, CUFFED_ARMS.elbow)), ahead, end, back, 0.03, free, 0.05), contacts: onPivot, name: "yanked" },
    // ...and put down again beside the pivot foot; it settles to walk on.
    { kind: "settle", seconds: ESCAPE.stepBack - ESCAPE.yanked, at: (back + endAt) / 2, pose: plantedLegs(pose(0, 3, armsAt(CUFFED_ARMS.shoulder, CUFFED_ARMS.elbow)), end, (back + endAt) / 2, 0.015) },
    { kind: "settle", seconds: ESCAPE.settled - ESCAPE.stepBack, at: endAt, pose: cuffedArms(STAND, facing), name: "settled" },
  ];
  const out = placedBeatsToKeys(start, beats, s);
  return { ...out, marks: { ...out.marks, escape: start.t } };
}

// ---- ESCORT -----------------------------------------------------------------------------------------
type TugSpan = { from: number; pull: number; yanked: number; to: number };
// A REACTION COMES AFTER ITS CAUSE (Arthur, round 2): the police didn't expect the escape, so it reacts this long
// after it starts (seconds; a person's reaction time) — until then it just walks on.
export const POLICE_REACTS = 0.2;
export type EscortParams = { partner?: string; gap?: number; seconds?: number; partnerKeys?: CharacterKey[]; tugs?: TugSpan[] };
export const ESCORT_ABOUT = "Police: walk right behind `partner` (the cuffed one; default: the cuffed figure), in step, one hand holding the cuffs, the other on its shoulder, while the partner moves (or `seconds`). Give the partner the moves; on its escape attempt the police reacts by itself about 0.2 s later. Marks `hold`, `react`, `letGo`.";
// Placeholder arms while the escort is worked out (the hands go on the cuffs and the shoulder once everyone is placed).
const HOLD_ARMS = { near: { shoulder: 18, elbow: 40 }, far: { shoulder: 35, elbow: 95 } };
const holdArms = (pose: PoseAngles, facing: Facing): PoseAngles => {
  const near = facing === "left" ? "r" : "l", far = near === "l" ? "r" : "l";
  return { ...pose, [`${near}Shoulder`]: HOLD_ARMS.near.shoulder, [`${near}Elbow`]: HOLD_ARMS.near.elbow, [`${far}Shoulder`]: HOLD_ARMS.far.shoulder, [`${far}Elbow`]: HOLD_ARMS.far.elbow } as PoseAngles;
};

export function escort(start: Stance, params: EscortParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const partnerKeys = (params.partnerKeys ?? []).slice().sort((a, b) => a.t - b.t);
  const holdPose = holdArms(start.pose, start.facing);
  // (It starts leaning in over its prisoner already, the legs turned with the lean so the feet stay put.)
  const leaning = { ...start.pose, lean: start.pose.lean + POLICE_LEAN, lHip: start.pose.lHip + POLICE_LEAN, rHip: start.pose.rHip + POLICE_LEAN };
  const first: CharacterKey = { t: start.t, x: start.x, pose: start.facing === "front" ? start.pose : holdArms(leaning, start.facing), contacts: BOTH_FEET, facing: start.facing, lift: 0 };
  // Nobody to escort (or told nothing about them): it just stands ready, its hands out to hold on.
  const lastT = partnerKeys.length ? partnerKeys[partnerKeys.length - 1].t : start.t;
  const until = Math.min(lastT, params.seconds !== undefined ? start.t + Math.max(0, Number(params.seconds)) : Infinity);
  if (!partnerKeys.length || until <= start.t + 1e-3 || start.facing === "front") {
    const seconds = Math.max(0.6, Number(params.seconds ?? 1));
    const out = beatsToKeys(start, [{ kind: "settle", seconds, pose: holdPose }], { ...settings, speed: "normal" });
    return { ...out, marks: { hold: start.t, letGo: out.end.t } };
  }
  const gap = Number(params.gap ?? ESCORT_GAP) * H;
  const keys: CharacterKey[] = [first];
  let from = start.t;
  // Partner keys from `t` on, as the police's (behind it by the gap, in step, a little more upright).
  const facingOf = (k: CharacterKey) => k.facing ?? start.facing;
  const behind = (k: CharacterKey) => k.x - forwardSign(facingOf(k)) * gap;
  // Not right behind it yet: walk up first (only forward, the way the prisoner faces; it must already face that way).
  const partnerAt = sampler(partnerKeys);
  const dir = forwardSign(start.facing), off = (partnerAt(start.t).x - forwardSign(facingOf(partnerKeys[0])) * gap - start.x) * dir;
  if (off > 0.04 * H && facingOf(partnerKeys[0]) === start.facing) {
    const walk = buildGait({ kind: "walk", startX: start.x, distance: off, direction: dir as 1 | -1, height: H, startT: start.t, style: settings.style, speed: settings.speed, energy: settings.energy });
    const stopped = walk.keys.slice(0, -1);
    for (const k of stopped.slice(1)) keys.push(k);
    from = keys[keys.length - 1].t;
  }
  const tugs = params.tugs ?? [], reacts: number[] = [];
  const inTug = (t: number) => tugs.find((s) => t > s.from + 1e-6 && t < s.to - 1e-6);
  const copy = (k: CharacterKey): CharacterKey => {
    const lean = POLICE_LEAN;
    const pose = { ...k.pose, lean: k.pose.lean + lean, lHip: k.pose.lHip + lean, rHip: k.pose.rHip + lean };
    return { ...k, x: behind(k), pose: holdArms(pose, facingOf(k)), facing: facingOf(k) };
  };
  for (const k of partnerKeys) {
    if (k.t <= from + 1e-4 || k.t > until + 1e-6 || inTug(k.t)) continue;
    keys.push(copy(k));
    // THE ESCAPE ATTEMPT: the police didn't see it coming. It walks on for a moment (its next step coming down), and
    // only POLICE_REACTS later does it react: that foot digs in short, it grips the cuffs, leans back and pulls the
    // prisoner back (knees bent, heels in); then its front foot steps back beside the other (the same pivot foot as
    // the prisoner's, so the two end a gap apart again) and it walks on with the prisoner.
    const tugHere = tugs.find((s) => Math.abs(s.from - k.t) < 1e-6);
    if (tugHere) {
      const base = keys[keys.length - 1], f = feetOf(base.pose), way = forwardSign(facingOf(base)), view = facingOf(base);
      const { pivot, free } = escapeFeet(base.pose), stand = feetOf(STAND);
      const walked = 0.08, dug = { ...f, [free]: walked + 0.1 } as Feet, endAt = f[pivot] - stand[pivot], end = { [pivot]: f[pivot], [free]: endAt + stand[free] } as Feet;
      const key = (t: number, pose: PoseAngles, hips: number, contacts: FootContact[] = BOTH_FEET): CharacterKey =>
        ({ t, x: base.x + way * hips * H, pose: holdArms(pose, view), contacts, facing: view, lift: 0 });
      const lean = (d: number) => ({ ...base.pose, lean: base.pose.lean + d });
      const t0 = tugHere.from, react = t0 + POLICE_REACTS;
      // (Hips: still going on forward until it reacts — slowing, a walking step's worth — then back, behind both feet:
      // heels dug in.)
      const pulling = walked - 0.02, pulled = walked - 0.05;
      if (react < tugHere.yanked && tugHere.yanked + 0.1 < tugHere.to) {
        keys.push(
          key(t0 + 0.65 * POLICE_REACTS, stepPose(lean(0), f, dug, walked * 0.68, 0.005, free, 0.035), walked * 0.68, [`${pivot}Foot` as FootContact]),
          key(react, plantedLegs(lean(0), dug, walked, 0.015), walked),
          key((react + tugHere.yanked) / 2 + 0.03, plantedLegs(lean(-5), dug, pulling, 0.035), pulling),
          key(tugHere.yanked, plantedLegs(lean(-8), dug, pulled, 0.035), pulled),
          key((tugHere.yanked + tugHere.to) / 2, stepPose(lean(-3), dug, end, (endAt + pulled) / 2, 0.012, free, 0.03), (endAt + pulled) / 2, [`${pivot}Foot` as FootContact]),
        );
        reacts.push(react);
      }
    }
  }
  const last = keys[keys.length - 1];
  const marks: Record<string, number> = { hold: from, letGo: last.t };
  reacts.forEach((t, i) => { marks[i === 0 ? "react" : `react${i + 1}`] = t; });
  return { keys, end: { t: last.t, x: last.x, facing: last.facing ?? start.facing, pose: last.pose }, marks };
}

// What the planner tells an escort (plan.ts): who its prisoner is, the prisoner's keys and tugs. null = wait: the
// prisoner isn't worked out yet (`done` = the figures that are).
export function escortParams(plan: ScenePlan, id: string, params: Record<string, unknown>, keysOf: Map<string, CharacterKey[]>, done: Set<string> | undefined, marks: Record<string, number>): Record<string, unknown> | null {
  const named = typeof params.partner === "string" ? params.partner : undefined;
  const partner = named ?? plan.characters.find((c) => c.id !== id && cuffedFrom(c as { cuffed?: CuffedOption }) !== undefined)?.id;
  if (!partner || partner === id || !plan.characters.some((c) => c.id === partner)) return params;
  if (done && !done.has(partner)) return null;
  const keys = keysOf.get(partner);
  if (!keys?.length) return params;
  const tugs: TugSpan[] = [];
  for (let k = 1; marks[`${partner}.tug${k}.pull`] !== undefined; k += 1) {
    const m = (n: string) => marks[`${partner}.tug${k}.${n}`];
    if ([m("escape"), m("yanked"), m("settled")].every(Number.isFinite)) tugs.push({ from: m("escape"), pull: m("pull"), yanked: m("yanked"), to: m("settled") });
  }
  return { ...params, partner, partnerKeys: keys.slice(), tugs };
}

// ---- Before and after building (plan.ts planToScene) ----------------------------------------------
// Before: the Handcuffs symbol on every cuffed figure's wrists (an effect track: the symbol follows the left hand,
// turned square across the left forearm — both hands are together); a figure cuffed from the start walks with
// shorter, slower steps (its own speed if the plan gives one); an escort that starts the scene starts right
// behind its prisoner, facing the same way. A plan with nobody cuffed and no escort comes back unchanged.
export function cuffsPlan(plan: ScenePlan): ScenePlan {
  const cuffed = plan.characters.filter((c) => cuffedFrom(c as { cuffed?: CuffedOption }) !== undefined);
  const escorts = plan.characters.filter((c) => c.actions[0]?.move === "escort");
  if (!cuffed.length && !escorts.length) return plan;
  const characters = plan.characters.map((c): CharacterPlan => {
    let out = c;
    if (cuffedFrom(c as { cuffed?: CuffedOption }) === 0 && c.speed === undefined) out = { ...out, speed: "slow" };
    const first = c.actions[0];
    if (first?.move === "escort") {
      const named = typeof first.params?.partner === "string" ? first.params.partner : undefined;
      const partner = plan.characters.find((p) => p.id !== c.id && (named ? p.id === named : cuffedFrom(p as { cuffed?: CuffedOption }) !== undefined));
      if (partner && partner.facing !== "front") out = { ...out, facing: partner.facing, x: partner.x - forwardSign(partner.facing) * Number(first.params?.gap ?? ESCORT_GAP) * plan.height };
    }
    return out;
  });
  const tracks: EffectTrack[] = cuffed.map((c) => ({ kind: "handcuffs", start: cuffedFrom(c as { cuffed?: CuffedOption })!, end: 1e6, anchor: { character: c.id, joint: "lHand" }, target: { character: c.id, joint: "lElbow" }, params: { size: HANDCUFFS_WIDTH } }));
  return { ...plan, characters, ...(tracks.length ? { effects: [...(plan.effects ?? []), ...tracks] } : {}) };
}

// After: cuffed figures get their hands behind the back in every key (the tug keeps its own), then every escort's
// hands are put on its prisoner's cuffs and shoulder in every picture.
export function cuffKeys(plan: ScenePlan, built: Map<string, CharacterKey[]>, marks: Record<string, number>) {
  for (const c of plan.characters) {
    const from = cuffedFrom(c as { cuffed?: CuffedOption });
    const keys = built.get(c.id);
    if (from !== undefined && keys?.length) built.set(c.id, cuffedKeys(keys, c, from, plan, marks));
  }
  for (const c of plan.characters) {
    const holds: { from: number; to: number; partner: string }[] = [];
    let k = 0;
    for (const action of c.actions) {
      if (action.move !== "escort") continue;
      k += 1;
      const from = marks[`${c.id}.escort${k}.hold`], to = marks[`${c.id}.escort${k}.letGo`];
      const named = typeof action.params?.partner === "string" ? action.params.partner : undefined;
      const partner = plan.characters.find((p) => p.id !== c.id && (named ? p.id === named : cuffedFrom(p as { cuffed?: CuffedOption }) !== undefined));
      if (partner && Number.isFinite(from) && Number.isFinite(to) && to > from) holds.push({ from, to, partner: partner.id });
    }
    for (const hold of holds) {
      const mine = built.get(c.id), theirs = built.get(hold.partner);
      const partner = plan.characters.find((p) => p.id === hold.partner)!;
      if (mine?.length && theirs?.length) built.set(c.id, holdingKeys(plan, c, mine, partner, theirs, hold.from, hold.to));
    }
  }
}

// The tug spans of a figure (its own moves: their keys already hold the hands behind the back).
const tugSpans = (id: string, marks: Record<string, number>) => {
  const spans: [number, number][] = [];
  for (let k = 1; marks[`${id}.tug${k}.escape`] !== undefined; k += 1) {
    const a = marks[`${id}.tug${k}.escape`], b = marks[`${id}.tug${k}.settled`];
    if (Number.isFinite(a) && Number.isFinite(b)) spans.push([a, b]);
  }
  return spans;
};

function cuffedKeys(keys: CharacterKey[], c: CharacterPlan, from: number, plan: ScenePlan, marks: Record<string, number>): CharacterKey[] {
  // (Cuffed from a moment on: keys where the hands start going behind and where they are there.)
  let list = keys;
  if (from > keys[0].t + 1e-6) list = withKeysAt(keys, [from, from + CUFF_IN]);
  // (A turn switches the view at a key: the arms keep the old view's cuffed pose right up to it, so they never swing
  // round the body in the old view first — they only change, with the whole body, at the switch.)
  const switches: number[] = [];
  let view = list[0].facing ?? c.facing;
  for (let i = 1; i < list.length; i += 1) {
    const now = list[i].facing ?? view;
    if (now !== view && list[i].t > from) switches.push(list[i].t - Math.min(VIEW_HOLD, (list[i].t - list[i - 1].t) / 3));
    view = now;
  }
  if (switches.length) list = withKeysAt(list, switches);
  const tugs = tugSpans(c.id, marks);
  const look = { ...DEFAULT_STYLE, ...c.look };
  let facing = list[0].facing ?? c.facing;
  return list.map((k) => {
    facing = k.facing ?? facing;
    if (k.t < from - 1e-6 || tugs.some(([a, b]) => k.t > a + 1e-6 && k.t < b - 1e-6)) return k;
    const w = from <= keys[0].t + 1e-6 ? 1 : smooth01((k.t - from) / CUFF_IN);
    const cuffed = w >= 1 ? cuffedPose(k.pose, facing) : blendPose(k.pose, cuffedPose(k.pose, facing), w);
    // HANDS NEVER IN THE FLOOR: a body down low (sitting, lying) turns its cuffed arms up behind it until the hands
    // clear (or, if that can't, forward over it).
    let pose = cuffed;
    for (const sign of [-1, 1]) {
      pose = cuffed;
      for (let i = 0; i < 20 && handsBelow(pose, facing, k, plan, look) > 0; i += 1) pose = { ...pose, lShoulder: pose.lShoulder + 4 * sign, rShoulder: pose.rShoulder + 4 * sign };
      if (handsBelow(pose, facing, k, plan, look) <= 0) break;
    }
    return { ...k, pose };
  });
}

// How far the lower hand is under the floor (plus a hair), for a key as the engine stands it.
function handsBelow(pose: PoseAngles, facing: Facing, k: CharacterKey, plan: ScenePlan, look: typeof DEFAULT_STYLE) {
  const s = placed(pose, facing, k.x, k.lift ?? 0, plan, look);
  return Math.max(s.lHand.y, s.rHand.y) - (plan.groundY - 0.008 * plan.height);
}
function placed(pose: PoseAngles, facing: Facing, x: number, lift: number, plan: ScenePlan, look: typeof DEFAULT_STYLE): Skeleton {
  const r = headRadius(plan.height, look.headSize);
  const s = forwardKinematics(pose, facing, { x, y: 0 }, plan.height, look.headSize, look.neck === true);
  const lowest = Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + r);
  return translateSkeleton(s, 0, plan.groundY - lift - lowest);
}

// ---- The police's hands, every picture -----------------------------------------------------------
function holdingKeys(plan: ScenePlan, police: CharacterPlan, mine: CharacterKey[], prisoner: CharacterPlan, theirs: CharacterKey[], from: number, to: number): CharacterKey[] {
  const H = plan.height;
  const before = mine.some((k) => k.t < from - 1e-6), after = mine.some((k) => k.t > to + 1e-6);
  const first = Math.ceil(from * HOLD_FPS - 1e-6), last = after ? Math.floor(to * HOLD_FPS + 1e-6) : Math.ceil(to * HOLD_FPS - 1e-6);
  if (last < first) return mine;
  // Where both of them really are, picture by picture (the engine's own placing: planted feet and all).
  const character = (c: CharacterPlan, keys: CharacterKey[]) => ({ id: c.id, name: c.name ?? c.id, facing: c.facing, height: H, style: { ...DEFAULT_STYLE, ...c.look }, keys });
  const scene: Scene = { id: "escort", title: "escort", groundY: plan.groundY, durationSec: last / HOLD_FPS, characters: [character(police, mine), character(prisoner, theirs)] };
  const frames = buildScene(scene, HOLD_FPS).frames;
  const at = sampler(mine);
  const facingAt = (t: number) => { let f = police.facing; for (const k of mine) { if (k.t > t + 1e-9) break; f = k.facing ?? f; } return f; };
  const reach = (PROPORTIONS.upperArm + PROPORTIONS.forearm) * H * REACH;
  const dense: CharacterKey[] = [];
  const keyAt = (t: number, pose: PoseAngles, s: { x: number; lift: number }): CharacterKey => ({ t, x: s.x, lift: s.lift, pose, contacts: contactsAt(mine, t), facing: facingAt(t) });
  // (Grabbing hold / letting go off the picture grid: the original arms there.)
  if (before && Math.abs(first / HOLD_FPS - from) > 1e-6) { const s = at(from); dense.push(keyAt(from, s.pose, s)); }
  for (let i = first; i <= last; i += 1) {
    const t = i / HOLD_FPS, s = at(t), facing = facingAt(t), dir = forwardSign(facing);
    const frame = frames[Math.min(i, frames.length - 1)], me = frame[0].skeleton, them = frame[1].skeleton;
    // The cuffs: held by the short chain between them (where the Handcuffs symbol puts it, under the wrists).
    const cuffs = handcuffsAt(them.lHand, them.lElbow, H).chain;
    // Lean in just enough to reach the cuffs (never needed walking along; a hard tug may ask for it).
    let lean = s.pose.lean, neck = neckAt(me.hip, lean, dir, H);
    // The other hand on the upper arm by the shoulder (when the prisoner lunges away, it slides down the arm).
    const upper = them.lElbow, on = (g: number) => ({ x: them.neck.x + (upper.x - them.neck.x) * g, y: them.neck.y + (upper.y - them.neck.y) * g });
    for (let n = 0; n < 60 && (dist(neck, cuffs) > reach || dist(neck, on(0.9)) > reach); n += 1) { lean += 0.5; neck = neckAt(me.hip, lean, dir, H); }
    let g = SHOULDER_GRIP;
    while (g < 0.95 && dist(neck, on(g)) > reach) g += 0.025;
    const shoulder = on(g);
    const local = (p: Point) => ({ x: ((p.x - neck.x) * dir) / H, y: (p.y - neck.y) / H });
    const hold = armReach(lean, local(cuffs)), grip = armReach(lean, local(shoulder));
    const near = facing === "left" ? "r" : "l", far = near === "l" ? "r" : "l";
    const d = lean - s.pose.lean;
    let pose: PoseAngles = { ...s.pose, lean, lHip: s.pose.lHip + d, rHip: s.pose.rHip + d,
      [`${near}Shoulder`]: hold.shoulder, [`${near}Elbow`]: hold.elbow, [`${far}Shoulder`]: grip.shoulder, [`${far}Elbow`]: grip.elbow } as PoseAngles;
    // Grabbing hold after doing something else / letting go before the next move.
    const w = Math.min(before ? smooth01((t - from) / GRAB) : 1, after ? smooth01((to - t) / GRAB) : 1);
    if (w < 1) pose = blendPose(s.pose, pose, w);
    dense.push(keyAt(t, pose, s));
  }
  if (after && Math.abs(last / HOLD_FPS - to) > 1e-6) { const s = at(to); dense.push(keyAt(to, s.pose, s)); }
  return [...mine.filter((k) => k.t < (dense[0]?.t ?? from) - 1e-6), ...dense, ...mine.filter((k) => k.t > (dense[dense.length - 1]?.t ?? to) + 1e-6)];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const neckAt = (hip: Point, lean: number, dir: number, H: number) => ({ x: hip.x + dir * Math.sin((lean * Math.PI) / 180) * PROPORTIONS.torso * H, y: hip.y - Math.cos((lean * Math.PI) / 180) * PROPORTIONS.torso * H });
const smooth01 = (v: number) => { const u = Math.min(1, Math.max(0, v)); return u * u * (3 - 2 * u); };

// ---- Sampling keys the way the engine does (engine.ts buildScene) ---------------------------------------
type Channel = { times: number[]; values: number[]; tangents: number[]; eases: (Ease | undefined)[] };
const channel = (times: number[], values: number[], eases: (Ease | undefined)[]): Channel => ({ times, values, tangents: monotoneTangents(times, values), eases });
// Pose, hip x and lift at any time, exactly as the engine samples a figure's keys.
export function sampler(keys: readonly CharacterKey[]) {
  const sorted = keys.slice().sort((a, b) => a.t - b.t);
  const times = sorted.map((k) => k.t), eases = sorted.map((k) => k.ease);
  const poses = {} as Record<PoseKey, Channel>;
  for (const name of POSE_KEYS) {
    const raw = sorted.map((k) => k.pose[name]);
    poses[name] = channel(times, name === "lShoulder" || name === "rShoulder" ? unwrapAngles(raw) : raw, eases);
  }
  const x = channel(times, sorted.map((k) => k.x), sorted.map((k) => k.xEase));
  const lift = channel(times, sorted.map((k) => k.lift ?? 0), sorted.map((k) => k.liftEase));
  const at = (c: Channel, t: number) => sampleChannel(c.times, c.values, c.tangents, c.eases, t);
  return (t: number) => {
    const pose = {} as PoseAngles;
    for (const name of POSE_KEYS) pose[name] = at(poses[name], t);
    return { pose, x: at(x, t), lift: Math.max(0, at(lift, t)) };
  };
}
// Planted feet at time t, so that keys added between two keys keep the engine's planting exactly: at a key, its own;
// between two, the feet both of them plant.
function contactsAt(keys: readonly CharacterKey[], t: number): FootContact[] {
  const exact = keys.find((k) => Math.abs(k.t - t) < 1e-6);
  if (exact) return [...(exact.contacts ?? [])];
  const i = keys.findIndex((k) => k.t > t);
  if (i <= 0) return [...((i < 0 ? keys[keys.length - 1] : keys[0]).contacts ?? [])];
  const a = keys[i - 1].contacts ?? [], b = keys[i].contacts ?? [];
  return a.filter((f) => b.includes(f));
}
// The same keys with extra keys at `times` (sampled where they fall), for a change that starts between keys.
function withKeysAt(keys: CharacterKey[], times: number[]): CharacterKey[] {
  const at = sampler(keys);
  const facingAt = (t: number) => { let f = keys[0].facing; for (const k of keys) { if (k.t > t + 1e-9) break; f = k.facing ?? f; } return f; };
  const extra = times.filter((t) => t > keys[0].t + 1e-6 && t < keys[keys.length - 1].t - 1e-6 && !keys.some((k) => Math.abs(k.t - t) < 1e-4))
    .map((t): CharacterKey => { const s = at(t); return { t, x: s.x, lift: s.lift, pose: s.pose, contacts: contactsAt(keys, t), ...(facingAt(t) ? { facing: facingAt(t) } : {}) }; });
  return [...keys, ...extra].sort((a, b) => a.t - b.t);
}
