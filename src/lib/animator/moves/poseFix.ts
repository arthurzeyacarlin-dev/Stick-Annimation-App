// WHAT POSE IS THIS? (SPEC-0017 50-50, round 6, Arthur 2026-10-07: "I drew a stick figure that's standing, but he's
// leaning, limping — but he ain't hurt... It looks like a broken standing pose — change it to a standing pose." / "It
// looks like a crouching pose, anticipation for a hop — it needs to look like that.")
// After clean-up neatens the lines, the engine LOOKS at each drawing and names it by the nearest pose it already knows
// (the poses Arthur passed: stand, jump anticipation crouch, take-off, airborne tuck, landing, walk and run contact and
// passing, punch wind-up and strike, kick, arm up / wave, sit). A clearly-that-kind-but-sloppy drawing is made proper:
// - SLOPPY joints (within SLOPPY_DEG of the reference) go to the reference; joints far off are MEANT (an arm raised to
//   wave while standing stays raised) and are kept;
// - the legs of a stand or crouch are made EVEN (the same bend on both; a stand keeps its drawn stance width);
// - BALANCE: the body is put over its feet — the feet stay where they were drawn, the hips move a little — and the
//   spine stands up, unless the neighbouring drawings show it moving that way (a lean into a move is kept).
// NEVER WORSE: a drawing that matches nothing well (an unusual action pose), an action pose (kick, punch, run, walk,
// wave...), a figure in the air or one that is travelling is left exactly as drawn. Size, look, spot and facing kept.
import { forwardKinematics } from "../pose.ts";
import { clampPose, handUp, HEAD_RADIUS, STAND, STAND_FRONT, withPose, type Facing, type PoseAngles, type PoseKey, type Skeleton } from "../rig.ts";
import type { JointPick, ReadFigure } from "./fromDrawing.ts";

export const SLOPPY_DEG = 25; // a joint this close to the named pose is sloppiness, not meaning
const MATCH_DEG = 30; // a stand/crouch's spine and legs must all be this close to be "that kind"
const TRAVEL_PART = 0.12; // hips moving more than this (x height) between the neighbours = travelling (walk/run), keep
const HIP_SHIFT_MAX = 0.15;
const MOVING_DEG = 0.2; // a joint strictly on its way from the drawing before to the one after is an in-between
const STATIC_DEG = 8; // a joint that travels less than this over the animation is held: its offset is sloppiness
const ANIMATED_PART = 0.25; // an animated joint is tidied by at most this part of its travel // the hips move at most this (x height) to put the body over its feet

type Ref = { kind: string; pose: PoseAngles; fix?: "stand" | "crouch" };
const ref = (kind: string, changes: Partial<PoseAngles>, fix?: Ref["fix"]): Ref => ({ kind, pose: withPose(STAND, changes), fix });
// Side-view references (facing-agnostic angles; left-facing poses use the same numbers). Values from the passed moves:
// jump.ts (CROUCH, PUSH, TUCK, ABSORB), squat.ts, sit.ts, punch.ts, kick.ts, wave.ts, gait.ts walk/run key poses.
export const SIDE_REFS: readonly Ref[] = [
  { kind: "stand", pose: STAND, fix: "stand" },
  ref("anticipation crouch", { lean: 28, head: -12, lShoulder: -42, rShoulder: -50, lElbow: 22, rElbow: 18, lHip: 76, rHip: 72, lKnee: 106, rKnee: 104 }, "crouch"),
  ref("landing crouch", { lean: 30, head: -14, lShoulder: 36, rShoulder: 24, lElbow: 34, rElbow: 30, lHip: 72, rHip: 70, lKnee: 98, rKnee: 96 }, "crouch"),
  ref("take-off", { lean: 10, head: -8, lShoulder: 62, rShoulder: 54, lElbow: 16, rElbow: 20, lHip: 16, rHip: 14, lKnee: 24, rKnee: 22 }),
  ref("airborne tuck", { lean: 6, head: -4, lShoulder: 158, rShoulder: 148, lElbow: 26, rElbow: 30, lHip: 58, rHip: 50, lKnee: 72, rKnee: 66 }),
  ref("deep squat", { lean: 38, head: -26, lShoulder: 88, rShoulder: 78, lElbow: 12, rElbow: 16, lHip: 118, rHip: 116, lKnee: 135, rKnee: 133 }),
  ref("walk contact", { lean: 4, lShoulder: -24, rShoulder: 26, lElbow: 10, rElbow: 22, lHip: 26, rHip: -22, lKnee: 4, rKnee: 14 }),
  ref("walk passing", { lean: 4, lShoulder: 4, rShoulder: -2, lHip: 4, rHip: 30, lKnee: 4, rKnee: 52 }),
  ref("run contact", { lean: 14, head: -4, lShoulder: -50, rShoulder: 60, lElbow: 80, rElbow: 90, lHip: 42, rHip: -28, lKnee: 18, rKnee: 60 }),
  ref("run passing", { lean: 16, head: -4, lShoulder: 10, rShoulder: -14, lElbow: 90, rElbow: 90, lHip: 12, rHip: 70, lKnee: 20, rKnee: 110 }),
  ref("punch wind-up", { lean: -4, head: 4, lShoulder: 50, rShoulder: -30, lElbow: 112, rElbow: 120, lHip: 18, rHip: -14, lKnee: 10, rKnee: 8 }),
  ref("punch strike", { lean: 12, head: 4, lShoulder: 90, rShoulder: 28, lElbow: 4, rElbow: 136, lHip: 22, rHip: -18, lKnee: 12, rKnee: 6 }),
  ref("kick", { lean: -14, head: 4, lShoulder: 30, rShoulder: -30, lElbow: 30, rElbow: 30, lHip: 90, rHip: -4, lKnee: 6, rKnee: 6 }),
  ref("arm up / wave", { lean: -2, head: -6, lShoulder: 160, rShoulder: -6, lElbow: 20, rElbow: 10 }, "stand"),
  ref("sit", { lean: 4, head: -6, lShoulder: 20, rShoulder: 10, lElbow: 40, rElbow: 40, lHip: 90, rHip: 88, lKnee: 90, rKnee: 88 }),
];
export const FRONT_REFS: readonly Ref[] = [
  { kind: "stand", pose: STAND_FRONT, fix: "stand" },
  { kind: "arm up / wave", pose: withPose(STAND_FRONT, { lShoulder: 160, lElbow: 20 }), fix: "stand" },
  { kind: "star jump", pose: withPose(STAND_FRONT, { lShoulder: 150, rShoulder: 150, lHip: 30, rHip: 30 }) },
];

const wrap = (d: number) => { let a = d % 360; if (a > 180) a -= 360; if (a <= -180) a += 360; return a; };
const diff = (a: number, b: number) => Math.abs(wrap(a - b));
type Side = "l" | "r";
const armD = (p: PoseAngles, s: Side, q: PoseAngles, t: Side) => Math.min(60, diff(p[`${s}Shoulder`], q[`${t}Shoulder`])) + Math.min(60, diff(p[`${s}Elbow`], q[`${t}Elbow`])) * 0.5;
const legD = (p: PoseAngles, s: Side, q: PoseAngles, t: Side) => Math.min(60, diff(p[`${s}Hip`], q[`${t}Hip`])) + Math.min(60, diff(p[`${s}Knee`], q[`${t}Knee`]));
// Arms and legs compared as UNORDERED pairs (which drawn arm is "left" is a guess); returns the cheaper pairing.
const pair = (d: (p: PoseAngles, s: Side, q: PoseAngles, t: Side) => number, p: PoseAngles, q: PoseAngles) => {
  const same = d(p, "l", q, "l") + d(p, "r", q, "r"), swap = d(p, "l", q, "r") + d(p, "r", q, "l");
  return same <= swap ? { cost: same, swapped: false } : { cost: swap, swapped: true };
};
// How far a drawn pose is from a reference: the spine and legs count most (they say what the body is doing), the arms
// less (a waving arm on a standing body is still a stand), the head least.
export function poseDistance(p: PoseAngles, q: PoseAngles) {
  return 1.5 * Math.min(60, diff(p.lean, q.lean)) + 0.3 * Math.min(60, diff(p.head, q.head)) + pair(legD, p, q).cost + 0.4 * pair(armD, p, q).cost;
}
export function namePose(pose: PoseAngles, facing: Facing): { ref: Ref; distance: number } {
  const refs = facing === "front" ? FRONT_REFS : SIDE_REFS;
  let best = { ref: refs[0], distance: Infinity };
  for (const r of refs) { const d = poseDistance(pose, r.pose); if (d < best.distance) best = { ref: r, distance: d }; }
  return best;
}

const radiusOf = (f: ReadFigure) => HEAD_RADIUS[f.style.headSize] * f.height;
const lowest = (s: Skeleton, r: number) => Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + r);
const skel = (f: ReadFigure, pose: PoseAngles, x: number) => forwardKinematics(pose, f.facing, { x, y: 0 }, f.height, f.style.headSize, f.style.neck === true);

export function fixPose(fig: ReadFigure, ctx: { prev?: ReadFigure; next?: ReadFigure; floor?: number; around?: readonly ReadFigure[] } = {}): { fig: ReadFigure; kind: string; changed: boolean } {
  const p = fig.pose, H = fig.height;
  const { ref: r } = namePose(p, fig.facing);
  const keep = (kind = r.kind) => ({ fig, kind, changed: false });
  if (!r.fix) return keep();
  const q = r.pose;
  // "Clearly that kind": the spine and every leg joint near the reference (legs as an unordered pair).
  const legs = pair(legD, p, q);
  const lt = (s: Side): Side => (legs.swapped ? (s === "l" ? "r" : "l") : s);
  const legOk = (["l", "r"] as Side[]).every((s) => diff(p[`${s}Hip`], q[`${lt(s)}Hip`]) <= MATCH_DEG && diff(p[`${s}Knee`], q[`${lt(s)}Knee`]) <= MATCH_DEG + (r.fix === "crouch" ? 10 : 0));
  if (diff(p.lean, q.lean) > MATCH_DEG || !legOk) return keep(`${r.kind} (not clear)`);
  // In the air (well off the floor) or travelling between its neighbours: a jump or a step, not a pose to tidy.
  const floor = ctx.floor ?? fig.groundY;
  const own = fig.joints.hip.y + lowest(skel(fig, p, 0), radiusOf(fig));
  if (floor - own > 0.05 * H) return keep(`${r.kind} (in the air)`);
  const nb = [ctx.prev, ctx.next].filter((n): n is ReadFigure => !!n);
  const travel = nb.length ? Math.max(...nb.map((n) => Math.abs(n.joints.hip.x - fig.joints.hip.x))) : 0;
  if (travel > TRAVEL_PART * H) return keep(`${r.kind} (moving)`);

  const out: PoseAngles = { ...p };
  // MOVING JOINTS ARE THE ANIMATION: a joint on its way between its neighbours (an in-between: the drawing before and
  // after are on either side of it) is kept as drawn — only key poses (ends, turn-arounds, holds) are tidied.
  const between = (k: PoseKey) => {
    if (!ctx.prev || !ctx.next) return false;
    const a = ctx.prev.pose[k], b = ctx.next.pose[k];
    return wrap(p[k] - a) * wrap(b - p[k]) > 0 && diff(a, b) > MOVING_DEG;
  };
  // A joint ANIMATED over the whole animation (it travels more than STATIC_DEG) is only tidied by a small part of its
  // travel: an arm that rises 20 degrees and ends 22 off the stand is the move, not a sloppy stand.
  const seq = ctx.around?.length ? ctx.around : [ctx.prev, fig, ctx.next].filter((n): n is ReadFigure => !!n);
  const spanOf = (k: PoseKey) => { const v = seq.map((n) => p[k] + wrap(n.pose[k] - p[k])); return Math.max(...v) - Math.min(...v); };
  const allowed = (k: PoseKey, target: number) => !between(k) && (spanOf(k) <= STATIC_DEG || diff(p[k], target) <= ANIMATED_PART * spanOf(k));
  const snap = (k: PoseKey, target: number, band = SLOPPY_DEG) => { if (diff(p[k], target) <= band) out[k] = target; };
  // Spine: upright (the reference), unless the neighbours show the body moving the way it leans (kept then).
  const dir = fig.facing === "left" ? -1 : 1;
  const moving = nb.some((n) => Math.sign((n === ctx.next ? 1 : -1) * (n.joints.hip.x - fig.joints.hip.x) * dir) === Math.sign(p.lean - q.lean) && Math.abs(n.joints.hip.x - fig.joints.hip.x) > 0.03 * H);
  if (!moving) snap("lean", r.fix === "stand" ? 0 : q.lean);
  snap("head", r.fix === "stand" ? 0 : q.head); // (every stand-kind pose stands the same way: no pop between them)
  // Arms: each drawn arm against its nearer reference arm; sloppy -> the reference, raised/meant -> kept.
  const arms = pair(armD, p, q);
  for (const s of ["l", "r"] as Side[]) {
    const t: Side = arms.swapped ? (s === "l" ? "r" : "l") : s;
    if (handUp(p, s)) continue; // a RAISED arm (hand up at the chest or higher) is always meant: kept as drawn
    if (diff(p[`${s}Shoulder`], q[`${t}Shoulder`]) <= SLOPPY_DEG && diff(p[`${s}Elbow`], q[`${t}Elbow`]) <= SLOPPY_DEG + 10) {
      out[`${s}Shoulder`] = q[`${t}Shoulder`];
      out[`${s}Elbow`] = q[`${t}Elbow`];
    }
  }
  // Legs EVEN: a stand keeps its stance width (the hips split evenly front and back / out to the sides) with both knees
  // as the reference; a crouch bends both legs the same (the reference's depth when the drawing is near it).
  if (fig.facing === "front") {
    const h = (p.lHip + p.rHip) / 2;
    out.lHip = out.rHip = Math.abs(h - q.lHip) <= 6 ? q.lHip : h;
    out.lKnee = out.rKnee = q.lKnee;
  } else if (r.fix === "stand") {
    const front: Side = p.lHip >= p.rHip ? "l" : "r", back: Side = front === "l" ? "r" : "l";
    const half = Math.max(Math.abs(q.lHip - q.rHip) / 2, (p[`${front}Hip`] - p[`${back}Hip`]) / 2);
    const mid = (q.lHip + q.rHip) / 2;
    out[`${front}Hip`] = mid + half;
    out[`${back}Hip`] = mid - half;
    out.lKnee = out.rKnee = (q.lKnee + q.rKnee) / 2;
  } else {
    const hip = (p.lHip + p.rHip) / 2, knee = (p.lKnee + p.rKnee) / 2;
    const qh = (q.lHip + q.rHip) / 2, qk = (q.lKnee + q.rKnee) / 2;
    out.lHip = out.rHip = diff(hip, qh) <= SLOPPY_DEG ? qh : hip;
    out.lKnee = out.rKnee = diff(knee, qk) <= SLOPPY_DEG ? qk : knee;
    if (out.lean === q.lean && (out.lHip !== qh || out.lKnee !== qk)) out.lean = p.lean; // a shallower crouch keeps its own back
  }
  for (const k of Object.keys(out) as PoseKey[]) if (diff(out[k], p[k]) > 1e-6 && !allowed(k, out[k])) out[k] = p[k];
  const pose = clampPose(out).pose;
  if ((Object.keys(pose) as PoseKey[]).every((k) => diff(pose[k], p[k]) < 0.5)) return keep();
  // BALANCE: the feet stay where they were drawn, the hips go over them (a little only).
  const drawnMid = (fig.joints.lFoot.x + fig.joints.rFoot.x) / 2;
  const s0 = skel(fig, pose, 0);
  const want = drawnMid - (s0.lFoot.x + s0.rFoot.x) / 2;
  const x = fig.x + Math.max(-HIP_SHIFT_MAX * H, Math.min(HIP_SHIFT_MAX * H, want - fig.x));
  // The new body stands on the same floor line (same lift) as the drawing.
  const s = skel(fig, pose, x);
  const dy = fig.groundY - fig.lift - lowest(s, radiusOf(fig));
  const joints = {} as Record<JointPick, ReadFigure["joints"][JointPick]>;
  for (const k of Object.keys(fig.joints) as JointPick[]) joints[k] = { x: s[k].x, y: s[k].y + dy };
  return { fig: { ...fig, pose, x, joints }, kind: r.kind, changed: true };
}
