// ORIGINAL KEY POSES (SPEC-0017 Phase 2C): a new way of sitting, standing, fighting or celebrating that
// nobody drew, made by RULES and remembered by name so a move can use it again ("sit like the Thinker",
// "fight in Crane stance").
//
// inventPose(kind, seed, look?) picks, from the seed, a few simple choices — how far apart the feet are,
// how low the hips, how much the chest leans, the head, and an ARM RULE (hands on the knees, hugging the
// shins, a hand on the chin, hands on the hips, a boxer's guard, a karate chamber, arms up in a V...) — and
// then the engine's own body rules place everything: the legs reach the floor where the feet are planted
// (squat.ts onFeet), the hands reach their targets (squat.ts handAt), the hips go where the weight is over
// the feet (balance.ts balancedHips), and the joints stay inside the rig's limits. A pose that still breaks
// a rule (poseProblems) is thrown away and the next choice from the same seed is tried, so every seed gives
// one good pose, always the same one.
//
// REMEMBERING (rememberPose / poseNamed) is in memory only for now: SPEC-0017's storage note says
// remembering across saves must use places the project already saves, and no saved fields are added.
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, jointRange, JOINT_LIMITS, PROPORTIONS, STAND, withPose, type PoseAngles } from "../rig.ts";
import { rand } from "../effects/random.ts";
import { balancedHips, BALANCE_MARGIN, supportOf, TOE, weightAhead } from "./balance.ts";
import { armFromWorld, GUARD, HIGH_HANDS, LOOSE, worldArm, type WorldArm } from "./punch.ts";
import { handAt, HIP_FOLD, onFeet, safePose } from "./squat.ts";

export type PoseKind = "sit" | "fight" | "stand" | "victory";
export const POSE_KINDS: readonly PoseKind[] = ["sit", "fight", "stand", "victory"];
export type NamedPose = { name: string; kind: PoseKind; pose: PoseAngles; rule?: string };

// Sitting on the floor: the hips this far above it (the same as sit.ts SEAT_HEIGHT; a test checks), and a
// hand resting on the floor this far above it.
export const SIT_SEAT = 0.012;
const HAND_CLEAR = 0.012;
const LEG = PROPORTIONS.thigh + PROPORTIONS.shin;
// The bottom reaches this far behind the hips (it holds the body up too, sitting).
const BOTTOM_BACK = 0.07;

// The body at height 1, hips at (0, 0), facing right, y DOWN (as the rig draws it).
const bodyOf = (pose: PoseAngles) => forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false);
type Body = ReturnType<typeof bodyOf>;
type P = { x: number; y: number };

// One hand placed at a point (hips frame, y down).
function handTo(pose: PoseAngles, side: "l" | "r", target: P): PoseAngles {
  const neck = bodyOf(pose).neck;
  return handAt(pose, side, target.x - neck.x, target.y - neck.y);
}
const world = (pose: PoseAngles, side: "l" | "r", arm: WorldArm): PoseAngles => ({ ...pose, ...armFromWorld(pose.lean, side, arm) });
const mid = (a: P, b: P, k = 0.5): P => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// ---- Arm rules -----------------------------------------------------------------------------------
// `r(i)` is the seed's i-th number in 0..1. An arm rule sets the arms of a pose whose legs are placed.
type R = (i: number) => number;
type ArmRule = { id: string; title: string; lean: [number, number]; head: [number, number]; arms: (pose: PoseAngles, r: R, floorY: number) => PoseAngles; handsOnFloor?: ("l" | "r")[] };
const span = (r: R, i: number, [a, b]: readonly [number, number]) => a + (b - a) * r(i);

const SIT_RULES: ArmRule[] = [
  { id: "knees", title: "Hands on knees", lean: [-4, 10], head: [-4, 8], arms: (p, r) => {
    const b = bodyOf(p);
    return handTo(handTo(p, "l", { x: b.lKnee.x - 0.005, y: b.lKnee.y - 0.03 }), "r", { x: b.rKnee.x - 0.025 - 0.02 * r(30), y: b.rKnee.y - 0.025 });
  } },
  { id: "hug", title: "Knee hug", lean: [10, 24], head: [-10, 2], arms: (p, r) => {
    const b = bodyOf(p);
    const shin = (side: "l" | "r", k: number) => { const s = mid(side === "l" ? b.lKnee : b.rKnee, side === "l" ? b.lFoot : b.rFoot, k); return { x: s.x + 0.035, y: s.y }; };
    return handTo(handTo(p, "l", shin("l", 0.3 + 0.2 * r(30))), "r", shin("r", 0.35 + 0.2 * r(31)));
  } },
  { id: "leanBack", title: "Lean back", lean: [-18, -8], head: [2, 12], handsOnFloor: ["l", "r"], arms: (p, r, floorY) => {
    const y = floorY - HAND_CLEAR;
    return handTo(handTo(p, "l", { x: -0.1 - 0.04 * r(30), y }), "r", { x: -0.14 - 0.04 * r(31), y });
  } },
  { id: "thinker", title: "Thinker", lean: [12, 22], head: [4, 14], arms: (p, r) => {
    const b = bodyOf(p), hr = HEAD_RADIUS.normal;
    const chin = { x: b.head.x + hr * (0.75 + 0.2 * r(30)), y: b.head.y + hr * 1.05 };
    return handTo(handTo(p, "l", chin), "r", { x: b.rKnee.x - 0.02, y: b.rKnee.y - 0.03 });
  } },
  { id: "lazy", title: "Lazy", lean: [-12, -2], head: [-2, 10], handsOnFloor: ["r"], arms: (p, r, floorY) => {
    const b = bodyOf(p);
    return handTo(handTo(p, "l", mid(b.hip, b.lKnee, 0.45 + 0.2 * r(30))), "r", { x: -0.12 - 0.04 * r(31), y: floorY - HAND_CLEAR });
  } },
  { id: "lap", title: "Hands in lap", lean: [-2, 8], head: [0, 10], arms: (p, r) => {
    const b = bodyOf(p);
    const lap = (k: number) => { const q = mid(b.hip, b.lKnee, k); return { x: q.x, y: q.y - 0.035 }; };
    return handTo(handTo(p, "l", lap(0.5 + 0.15 * r(30))), "r", lap(0.35 + 0.15 * r(31)));
  } },
];

// Fighting arms, as the world sees them (upper arm and forearm direction, 0 = down, 90 = forward).
const jitter = (arm: WorldArm, r: R, i: number, k = 12): WorldArm => ({ upper: arm.upper + (r(i) - 0.5) * k, fore: arm.fore + (r(i + 1) - 0.5) * k * 1.4 });
const FIGHT_RULES: ArmRule[] = [
  { id: "boxer", title: "Boxer", lean: [3, 10], head: [3, 9], arms: (p, r) => world(world(p, "l", jitter(worldArm(GUARD, "l"), r, 30)), "r", jitter(worldArm(GUARD, "r"), r, 32)) },
  { id: "loose", title: "Loose", lean: [2, 8], head: [0, 6], arms: (p, r) => world(world(p, "l", jitter(worldArm(LOOSE, "l"), r, 30)), "r", jitter(worldArm(LOOSE, "r"), r, 32)) },
  { id: "high", title: "High hands", lean: [2, 8], head: [0, 6], arms: (p, r) => world(world(p, "l", jitter(worldArm(HIGH_HANDS, "l"), r, 30)), "r", jitter(worldArm(HIGH_HANDS, "r"), r, 32)) },
  { id: "karate", title: "Karate", lean: [-2, 5], head: [0, 6], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [62, 80]), fore: span(r, 31, [82, 98]) }), "r", { upper: span(r, 32, [-48, -30]), fore: span(r, 33, [62, 80]) }) },
  { id: "lowLead", title: "Low lead", lean: [4, 12], head: [4, 10], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [0, 12]), fore: span(r, 31, [40, 62]) }), "r", { upper: span(r, 32, [30, 44]), fore: span(r, 33, [140, 158]) }) },
  { id: "crane", title: "Crane", lean: [-3, 3], head: [-4, 4], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [118, 138]), fore: span(r, 31, [150, 168]) }), "r", { upper: span(r, 32, [96, 116]), fore: span(r, 33, [138, 156]) }) },
];

const STAND_RULES: ArmRule[] = [
  { id: "relaxed", title: "Relaxed", lean: [-2, 4], head: [-4, 6], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [4, 12]), fore: span(r, 31, [14, 30]) }), "r", { upper: span(r, 32, [-8, 0]), fore: span(r, 33, [4, 16]) }) },
  { id: "hips", title: "Hands on hips", lean: [-4, 2], head: [-6, 2], arms: (p, r) => {
    const b = bodyOf(p);
    return handTo(handTo(p, "l", { x: b.hip.x + 0.02, y: b.hip.y - 0.03 - 0.02 * r(30) }), "r", { x: b.hip.x - 0.01, y: b.hip.y - 0.03 });
  } },
  { id: "crossed", title: "Arms crossed", lean: [-4, 2], head: [-4, 4], arms: (p, r) => {
    const n = bodyOf(p).neck;
    return handTo(handTo(p, "l", { x: n.x + 0.1 + 0.02 * r(30), y: n.y + 0.11 }), "r", { x: n.x + 0.08, y: n.y + 0.09 + 0.02 * r(31) });
  } },
  { id: "behind", title: "Hands behind back", lean: [-1, 5], head: [-2, 6], arms: (p, r) => {
    const b = bodyOf(p);
    return handTo(handTo(p, "l", { x: b.hip.x - 0.07, y: b.hip.y - 0.04 - 0.03 * r(30) }), "r", { x: b.hip.x - 0.06, y: b.hip.y - 0.06 });
  } },
  { id: "chin", title: "Hand on chin", lean: [0, 6], head: [2, 10], arms: (p, r) => {
    const b = bodyOf(p), hr = HEAD_RADIUS.normal;
    return handTo(handTo(p, "l", { x: b.head.x + hr * (0.8 + 0.2 * r(30)), y: b.head.y + hr * 1.05 }), "r", { x: b.neck.x + 0.09, y: b.neck.y + 0.2 });
  } },
  { id: "pockets", title: "Hands in pockets", lean: [-3, 3], head: [-4, 6], arms: (p) => {
    const b = bodyOf(p);
    return handTo(handTo(p, "l", { x: b.hip.x + 0.035, y: b.hip.y + 0.02 }), "r", { x: b.hip.x + 0.02, y: b.hip.y + 0.02 });
  } },
];

const VICTORY_RULES: ArmRule[] = [
  { id: "v", title: "V for victory", lean: [-10, -2], head: [-18, -8], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [148, 165]), fore: span(r, 31, [150, 172]) }), "r", { upper: span(r, 32, [140, 158]), fore: span(r, 33, [142, 165]) }) },
  { id: "pump", title: "Fist pump", lean: [-6, 2], head: [-14, -4], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [150, 168]), fore: span(r, 31, [176, 194]) }), "r", { upper: span(r, 32, [-6, 6]), fore: span(r, 33, [60, 90]) }) },
  { id: "flex", title: "Flex", lean: [-4, 2], head: [-10, 0], arms: (p, r) => world(world(p, "l", { upper: span(r, 30, [82, 96]), fore: span(r, 31, [166, 182]) }), "r", { upper: span(r, 32, [74, 90]), fore: span(r, 33, [158, 174]) }) },
  { id: "trophy", title: "Trophy lift", lean: [-8, -2], head: [-18, -10], arms: (p, r) => {
    const n = bodyOf(p).neck;
    const top = { x: n.x + 0.04 + 0.03 * r(30), y: n.y - 0.27 };
    return handTo(handTo(p, "l", top), "r", { x: top.x - 0.03, y: top.y + 0.01 });
  } },
];

const RULES: Record<PoseKind, ArmRule[]> = { sit: SIT_RULES, fight: FIGHT_RULES, stand: STAND_RULES, victory: VICTORY_RULES };
export const poseRules = (kind: PoseKind) => RULES[kind].map((rule) => ({ id: rule.id, title: rule.title }));

// ---- The body rules a key pose must keep --------------------------------------------------------
// The floor is where the lowest foot is. Returns what is wrong (empty = a good pose).
export function poseProblems(pose: PoseAngles, kind: PoseKind): string[] {
  const out: string[] = [];
  for (const key of Object.keys(JOINT_LIMITS) as (keyof typeof JOINT_LIMITS)[]) {
    const [lo, hi] = jointRange(pose, key);
    if (pose[key] < lo - 1e-6 || pose[key] > hi + 1e-6) out.push(`${key} ${pose[key].toFixed(1)} outside ${lo}..${hi}`);
  }
  const b = bodyOf(pose);
  const floor = Math.max(b.lFoot.y, b.rFoot.y);
  // Feet down: both feet on the floor.
  if (Math.abs(b.lFoot.y - b.rFoot.y) > 2e-3) out.push(`a foot is off the floor (${(b.lFoot.y - b.rFoot.y).toFixed(3)})`);
  // Nothing through the floor (the head too); a knee never touches it.
  for (const j of ["hip", "neck", "lElbow", "rElbow", "lHand", "rHand"] as const) if (b[j].y > floor + 1e-6) out.push(`${j} through the floor`);
  if (b.head.y + HEAD_RADIUS.normal > floor + 1e-6) out.push("head through the floor");
  for (const j of ["lKnee", "rKnee"] as const) if (b[j].y > floor - 0.02) out.push(`${j} on the floor`);
  // No limb through the body: the hips never fold the thighs into the chest; no hand or elbow inside the
  // head; a sitting body keeps its chest up.
  for (const side of ["l", "r"] as const) {
    if (pose[`${side}Hip`] > HIP_FOLD + 1e-6) out.push(`${side} thigh folded into the chest`);
    for (const j of [`${side}Hand`, `${side}Elbow`] as const) if (Math.hypot(b[j].x - b.head.x, b[j].y - b.head.y) < HEAD_RADIUS.normal * 0.95) out.push(`${j} through the head`);
  }
  const hips = floor - b.hip.y; // hips above the floor
  const weight = weightAhead(pose);
  if (kind === "sit") {
    if (hips > SIT_SEAT + 0.006 || hips < SIT_SEAT - 0.006) out.push(`hips not on the floor (${hips.toFixed(3)} above it)`);
    if (Math.abs(pose.lean) > 45) out.push("lying, not sitting");
    // Balanced: the weight between the bottom (and any hand on the floor behind) and the front toes.
    const handsDown = (["lHand", "rHand"] as const).filter((j) => b[j].y > floor - HAND_CLEAR - 0.006).map((j) => b[j].x);
    const back = Math.min(-BOTTOM_BACK, ...handsDown), front = Math.max(b.lFoot.x, b.rFoot.x) + TOE;
    if (Math.min(weight - back, front - weight) < BALANCE_MARGIN - 1e-6) out.push(`not balanced (weight ${weight.toFixed(3)} outside ${back.toFixed(3)}..${front.toFixed(3)})`);
  } else {
    if (hips < 0.36) out.push(`not standing up (hips ${hips.toFixed(3)})`);
    const s = supportOf([b.lFoot.x, b.rFoot.x]);
    if (Math.min(weight - s.back, s.front - weight) < BALANCE_MARGIN - 1e-6) out.push(`not balanced (weight ${weight.toFixed(3)} outside ${s.back.toFixed(3)}..${s.front.toFixed(3)})`);
  }
  return out;
}

// ---- Inventing -----------------------------------------------------------------------------------
const STAND_BODY = bodyOf(STAND);
const SIT_FEET = { l: STAND_BODY.lFoot.x, r: STAND_BODY.rFoot.x }; // planted where it stood

const KIND_SALT: Record<PoseKind, number> = { sit: 1, fight: 2, stand: 3, victory: 4 };
const chooseRule = (kind: PoseKind, r: R, look?: string) => {
  const rules = RULES[kind];
  if (look) {
    const key = look.trim().toLowerCase();
    const alias: Record<string, string> = { realistic: "boxer", guard: "boxer", relaxed: kind === "fight" ? "loose" : "relaxed" };
    const want = alias[key] ?? key;
    const found = rules.find((rule) => rule.id.toLowerCase() === want || rule.title.toLowerCase().includes(want));
    if (found) return found;
  }
  return rules[Math.floor(r(1) * rules.length) % rules.length];
};

function build(kind: PoseKind, seed: number, attempt: number, look?: string): { pose: PoseAngles; rule: ArmRule } {
  const r: R = (i) => rand(seed * 1.618 + attempt * 101.3, i, KIND_SALT[kind]);
  const rule = chooseRule(kind, r, look);
  const lean = span(r, 2, rule.lean), head = span(r, 3, rule.head);
  if (kind === "sit") {
    // Knees up (feet close) .. legs nearly straight out (feet far).
    const ahead = span(r, 4, rule.id === "hug" || rule.id === "thinker" ? [0.28, 0.36] : [0.3, 0.44]);
    const x = Math.max(SIT_FEET.l, SIT_FEET.r) - ahead;
    const legs = onFeet(withPose(STAND, { lean, head }), SIT_FEET, x, SIT_SEAT);
    return { pose: safePose(rule.arms(legs, r, SIT_SEAT)), rule };
  }
  // Standing kinds: feet apart (the front foot is the near one, "l"), hips a little lower for a wider stance.
  const spread = kind === "fight" ? span(r, 4, [0.2, 0.32]) : kind === "victory" ? span(r, 4, [0.03, 0.16]) : span(r, 4, [0, 0.14]);
  const feet = { l: spread / 2, r: -spread / 2 };
  const drop = kind === "fight" ? span(r, 5, [0.015, 0.05]) : span(r, 5, [0.001, 0.006]);
  const reach = LEG * 0.985;
  // (Standing still the knees are nearly straight — STAND UP STRAIGHT; a fighting stance sits lower.)
  const height = Math.min(reach - drop, Math.sqrt(reach * reach - (spread / 2 + (kind === "fight" ? 0.07 : 0.012)) ** 2) - drop / 2);
  const make = (at: number) => safePose(rule.arms(onFeet(withPose(STAND, { lean, head }), feet, at, height), r, height));
  return { pose: make(balancedHips(make, [feet.l, feet.r])), rule };
}

// A new key pose of this kind from the seed (`look` picks an arm rule by name: "hug", "thinker", "boxer",
// "karate", "crane", "crossed", "flex"...; or a fight look "loose" / "high" / "realistic"). Always the same
// pose for the same seed; different seeds differ.
export function inventPose(kind: PoseKind, seed: number, look?: string): NamedPose {
  let first: { pose: PoseAngles; rule: ArmRule } | undefined;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const made = build(kind, seed, attempt, look);
    first ??= made;
    if (poseProblems(made.pose, kind).length === 0) return { name: `${made.rule.title} ${KIND_WORD[kind]} #${seed}`, kind, pose: made.pose, rule: made.rule.id };
  }
  // (Never seen in the tests: every seed tried finds a good pose within a few attempts.)
  throw new Error(`pose_invent_failed: ${kind} ${seed}: ${poseProblems(first!.pose, kind).join("; ")}`);
}
const KIND_WORD: Record<PoseKind, string> = { sit: "sit", fight: "stance", stand: "stand", victory: "victory" };

// ---- Remembering by name (in memory only; see the note at the top) ------------------------------
const remembered = new Map<string, NamedPose>();
const keyOf = (name: string) => name.trim().toLowerCase();
// What kind a bare pose is: feet at the hips' level = sitting; otherwise standing.
export function kindOfPose(pose: PoseAngles): PoseKind {
  const b = bodyOf(pose);
  return Math.max(b.lFoot.y, b.rFoot.y) < 0.05 && Math.abs(pose.lean) < 45 ? "sit" : "stand";
}
export function rememberPose(name: string, pose: PoseAngles | NamedPose, kind?: PoseKind): NamedPose {
  const title = name.trim();
  if (!title) throw new Error("pose_name_required");
  const angles = "pose" in pose ? (pose as NamedPose).pose : (pose as PoseAngles);
  const entry: NamedPose = { name: title, kind: kind ?? ("pose" in pose ? (pose as NamedPose).kind : kindOfPose(angles)), pose: { ...angles }, rule: "pose" in pose ? (pose as NamedPose).rule : undefined };
  remembered.set(keyOf(title), entry);
  return entry;
}
export const poseNamed = (name: string): NamedPose | undefined => {
  const entry = remembered.get(keyOf(name));
  return entry ? { ...entry, pose: { ...entry.pose } } : undefined;
};
export const rememberedPoses = () => [...remembered.values()].map((entry) => entry.name);
export const forgetPoses = () => remembered.clear();

// The named pose for a move's `style`, when it is the right kind (sit: a sitting pose; guard: a standing
// one). Unknown names give undefined: the move does its usual pose.
export function poseStyle(style: unknown, kinds: readonly PoseKind[]): PoseAngles | undefined {
  if (typeof style !== "string" || !style.trim()) return undefined;
  const entry = poseNamed(style);
  if (!entry) return undefined;
  const sitting = kindOfPose(entry.pose) === "sit";
  if (kinds.includes("sit") ? !sitting : sitting) return undefined;
  return kinds.includes(entry.kind) || (!kinds.includes("sit") && entry.kind !== "sit") ? entry.pose : undefined;
}

// How far in front of the hips the front foot is in a sitting pose (x height).
export const seatAhead = (pose: PoseAngles) => { const b = bodyOf(pose); return Math.max(b.lFoot.x, b.rFoot.x); };
