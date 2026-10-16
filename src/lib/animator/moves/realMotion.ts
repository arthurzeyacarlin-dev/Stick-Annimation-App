// REAL MOTION (SPEC-0025, Phase 1 — Oct 15): the body moves like a real person because KIMODO (NVIDIA's text → human-motion AI,
// trained on 700 h of motion capture) made the motion. Kimodo is the ACTOR; this move is the TRANSLATOR: its 3D joints → our
// stick rig's joint ANGLES, frame by frame (24 fps), seen from the side.
// - Angles, not positions: bone lengths always come from our rig, so the head is ALWAYS on the neck and nothing stretches.
// - The lowest body point rests on the ground (lift), so a fallen body lies ON the floor — never floats, never sinks.
// - It joins smoothly: the first 0.3 s blend from the pose the figure was in, and it starts where the figure stands.
// - Motions come from the MOTION LIBRARY (made by Kimodo and saved — instant and free on repeat); live Kimodo on a rented
//   graphics card (diamond-review/kimodo/kimodo_modal.py) fills the library for new sentences.
import type { CharacterKey } from "../engine.ts";
import { clampPose, HEAD_RADIUS, PROPORTIONS, STAND, type PoseAngles } from "../rig.ts";
import { forwardKinematics } from "../pose.ts";
import type { MoveOutput, MoveSettings, Stance } from "./motion.ts";
import { findMotion, type KimodoClip, type KimodoFrame } from "../kimodo/library.ts";

export type RealMotionParams = { motion?: string; prompt?: string; seconds?: number; timeMap?: [number, number][]; stage?: StageView };
// ONE 3D STAGE, ONE CAMERA (Session A3, Oct 16 — Arthur: "it's 3D motion that looks 2D"): people made together (make_clips.py duet)
// share one 3D stage — the first at stage z = 0 facing +z, the second S metres away facing back — and ONE camera, turned `theta`
// off the pure side view, flattens everything at the very end. The whole stage is sized once (standing height → H): Kimodo's own
// bone lengths, reach, spacing, facing and contact stay exactly as made; only the look (head circle, lines) is ours.
export type StageView = { originX: number; S: number; side: number; floor: number; theta: number; scale: number };

export const REAL_MOTION_ABOUT =
  "REAL human motion (made by Kimodo, learned from real people): `motion` = a short sentence of what the body does (\"trips and falls flat\", \"sweeps the floor with a broom\", \"digs with a shovel\", \"throws and catches a ball\", \"boxes: jabs, hooks, blocks\"), `seconds` (optional). Use it for falls, tool work, kneeling, fights and other big body moves.";

const DEG = 180 / Math.PI;
const MAX_TURN = 25; // degrees per picture (24 fps)
const BLEND_IN = 0.3; // seconds: from the figure's own pose into the real motion
type V3 = [number, number, number];

// The side view: forward = perpendicular to the hips' left→right line at the start (turned to the side the hands are on —
// a boxer's guard, a catcher's hands — or the way the body travels), up = y. Returns (forward, up) per joint.
function sideView(frames: KimodoFrame[]): { f: (p: V3) => number; h0: V3 } {
  const at = (fr: KimodoFrame, k: string) => fr[k] as V3;
  const L = at(frames[0], "LeftLeg"), R = at(frames[0], "RightLeg"), h0 = at(frames[0], "Hips");
  let fx = -(R[2] - L[2]), fz = R[0] - L[0];
  const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
  const along = (p: V3) => (p[0] - h0[0]) * fx + (p[2] - h0[2]) * fz;
  const last = frames[frames.length - 1], travel = along(at(last, "Hips"));
  // (FACING = WHERE THE HANDS ARE in the first second — a guard, a punch, a catch — only when the hands don't say, the way the body
  // travels. Oct 16: a boxer who staggers BACKWARD was turned around by "travel" and walked into his opponent.)
  const early = frames.slice(0, Math.min(frames.length, 24));
  const hands = early.reduce((s, fr) => s + along([(at(fr, "LeftHand")[0] + at(fr, "RightHand")[0]) / 2, 0, (at(fr, "LeftHand")[2] + at(fr, "RightHand")[2]) / 2]) - along(at(fr, "Hips")), 0) / early.length;
  const sign = Math.abs(hands) > 0.08 ? Math.sign(hands) : Math.abs(travel) > 0.3 ? Math.sign(travel) : Math.sign(hands) || 1;
  return { f: (p) => sign * along(p), h0 };
}

// One Kimodo frame → our pose angles (side view, facing right; our angle rules are in pose.ts forwardKinematics).
function poseOf(fr: KimodoFrame, f: (p: V3) => number): PoseAngles {
  const P = (k: string) => ({ x: f(fr[k] as V3), y: -(fr[k] as V3)[1] }); // screen: x forward, y down
  const downAngle = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.x - a.x, b.y - a.y) * DEG; // 0 = straight down, +90 = forward
  const hip = P("Hips"), neck = P("Neck1"), headTop = P("HeadEnd");
  const lean = Math.atan2(neck.x - hip.x, -(neck.y - hip.y)) * DEG;
  const headDir = Math.atan2(headTop.x - neck.x, -(headTop.y - neck.y)) * DEG;
  const arm = (s: "Left" | "Right") => { const up = downAngle(neck, P(`${s}ForeArm`)), lo = downAngle(P(`${s}ForeArm`), P(`${s}Hand`)); return { shoulder: up + lean, elbow: lo - up }; };
  const leg = (s: "Left" | "Right") => { const th = downAngle(hip, P(`${s}Shin`)), sh = downAngle(P(`${s}Shin`), P(`${s}Foot`)); return { hip: th + lean, knee: th - sh }; };
  const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
  const la = arm("Left"), ra = arm("Right"), ll = leg("Left"), rl = leg("Right");
  return clampPoseKeep({ lean: wrap(lean), head: wrap(headDir - lean), lShoulder: wrap(la.shoulder), rShoulder: wrap(ra.shoulder), lElbow: Math.abs(wrap(la.elbow)), rElbow: Math.abs(wrap(ra.elbow)), lHip: wrap(ll.hip), rHip: wrap(rl.hip), lKnee: Math.abs(wrap(ll.knee)), rKnee: Math.abs(wrap(rl.knee)) });
}
const clampPoseKeep = (p: PoseAngles) => p; // (clamped once, after the smoothing below, so a limit never makes a jump)

// How side-on each limb part is in this frame (1 = fully across the camera, 0 = pointing straight at it): the 3D length vs
// the length the camera sees. A part pointing at the camera has a shaky side-view angle.
function visibility(fr: KimodoFrame, f: (p: V3) => number): Record<string, number> {
  const seen = (a: string, b: string) => { const A = fr[a] as V3, B = fr[b] as V3, full = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) || 1; return Math.hypot(f(B) - f(A), B[1] - A[1]) / full; };
  return { lShoulder: seen("Neck1", "LeftForeArm"), rShoulder: seen("Neck1", "RightForeArm"), lElbow: seen("LeftForeArm", "LeftHand"), rElbow: seen("RightForeArm", "RightHand"),
    lHip: seen("Hips", "LeftShin"), rHip: seen("Hips", "RightShin"), lKnee: seen("LeftShin", "LeftFoot"), rKnee: seen("RightShin", "RightFoot"), lean: seen("Hips", "Neck1"), head: seen("Neck1", "HeadEnd") };
}

// 3D → 2D WITHOUT POPS (Oct 15): angles are unwrapped (never a 360° flip) and, where a part points at the camera (its side
// view is short and shaky), its angle follows the previous picture smoothly instead of jumping — weighted by how side-on it is.
function smoothPoses(raw: PoseAngles[], vis: Record<string, number>[]): PoseAngles[] {
  const out: PoseAngles[] = [];
  raw.forEach((p, i) => {
    if (!i) { out.push(p); return; }
    const prev = out[i - 1], next = {} as Record<string, number>;
    for (const k of Object.keys(p)) {
      let a = (p as Record<string, number>)[k]; const b = (prev as Record<string, number>)[k];
      while (a - b > 180) a -= 360; while (a - b < -180) a += 360; // (the short way round)
      const w = Math.max(0.2, Math.min(1, ((vis[i][k] ?? 1) - 0.25) / 0.45)); // (side-on ≥ 70% → follow fully; pointing at the camera → 20%)
      // (no joint turns more than MAX_TURN° in one picture — faster than any real punch — so a side-view flip never shows)
      next[k] = b + Math.max(-MAX_TURN, Math.min(MAX_TURN, (a - b) * w));
    }
    out.push(next as PoseAngles);
  });
  return out.map((p) => clampPose(p).pose);
}

// ARMS REST ON THE FLOOR, NEVER THROUGH IT — and never prop the body up: the body lies where it lies; an arm that would reach
// under the floor swings up toward level until the hand rests on it, like a hand flat beside a body lying down. (Done before the
// smoothing, so it can never make a jump.)
function restArmsOnFloor(pose: PoseAngles, lift: number, H: number): PoseAngles {
  const posed = { ...pose }, r = HEAD_RADIUS.normal * H;
  for (const side of ["l", "r"] as const) {
    for (let step = 0; step < 24; step += 1) {
      const sk = forwardKinematics(posed, "right", { x: 0, y: 0 }, H);
      const ground = Math.max(sk.lFoot.y, sk.rFoot.y, sk.lKnee.y, sk.rKnee.y, sk.hip.y, sk.neck.y, sk.head.y + r) + lift;
      if (Math.max(sk[`${side}Hand`].y, sk[`${side}Elbow`].y) <= ground - 2) break;
      const key = `${side}Shoulder` as const, a = posed[key] - posed.lean;
      posed[key] += (a >= 0 ? 1 : -1) * 4;
      posed[`${side}Elbow` as const] = Math.max(0, posed[`${side}Elbow` as const] - 3);
    }
  }
  return posed;
}

const lerpPose = (a: PoseAngles, b: PoseAngles, u: number): PoseAngles => Object.fromEntries(Object.keys(b).map((k) => [k, (a as Record<string, number>)[k] + ((b as Record<string, number>)[k] - (a as Record<string, number>)[k]) * u])) as PoseAngles;

export function realMotion(start: Stance, params: RealMotionParams, settings: MoveSettings): MoveOutput {
  const H = settings.height;
  const clip: KimodoClip = findMotion(String(params?.motion ?? params?.prompt ?? ""));
  let frames = clip.frames;
  const want = Number(params?.seconds);
  if (Number.isFinite(want) && want > 0.5) frames = frames.slice(0, Math.max(2, Math.round(want * clip.fps)));
  const { f } = sideView(frames);
  // scale: the person's standing height (head top above the lowest foot, first frame) = our figure height H
  const yOf = (fr: KimodoFrame, k: string) => (fr[k] as V3)[1];
  const floor = Math.min(...frames.map((fr) => Math.min(yOf(fr, "LeftFoot"), yOf(fr, "RightFoot"))));
  const tall = Math.max(0.5, yOf(frames[0], "HeadEnd") - Math.min(yOf(frames[0], "LeftFoot"), yOf(frames[0], "RightFoot")));
  const s = H / tall, dir = start.facing === "left" ? -1 : 1;
  const d3 = (fr: KimodoFrame, a: string, b: string) => { const A = fr[a] as V3, B = fr[b] as V3; return Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]); };
  const avg = (a: string, b: string) => frames.reduce((t, fr) => t + d3(fr, a, b), 0) / frames.length;
  const boneLen3: Record<string, number> = {};
  for (const [a, b] of [["Hips", "Neck1"], ["Neck1", "HeadEnd"], ["Neck1", "LeftForeArm"], ["LeftForeArm", "LeftHand"], ["Neck1", "RightForeArm"], ["RightForeArm", "RightHand"], ["Hips", "LeftShin"], ["LeftShin", "LeftFoot"], ["Hips", "RightShin"], ["RightShin", "RightFoot"]]) boneLen3[`${a}>${b}`] = avg(a, b);
  const legScale = ((PROPORTIONS.thigh + PROPORTIONS.shin) * H) / ((boneLen3["Hips>LeftShin"] + boneLen3["LeftShin>LeftFoot"] + boneLen3["Hips>RightShin"] + boneLen3["RightShin>RightFoot"]) / 2);
  const x0 = f(frames[0].Hips as V3);
  const lifts = frames.map((fr) => Math.max(0, (Math.min(...Object.keys(fr).filter((k) => k !== "HeadEnd").map((k) => yOf(fr, k))) - floor) * s));
  const smooth = smoothPoses(frames.map((fr, i) => restArmsOnFloor(poseOf(fr, f), lifts[i], H)), frames.map((fr) => visibility(fr, f)));
  // (THE DIRECTOR'S CLOCK, Oct 16: `timeMap` = [clip second, scene second from the start] pairs, set by kimodo/director.ts so this
  // person's real moments — a head snapping back, a block, a fist pump — land exactly on the other person's. Only WHEN each real
  // picture is shown changes, gently (between 0.6x and 1.7x speed); the poses are Kimodo's. Pictures before 0 are left out.)
  const tm = Array.isArray(params?.timeMap) ? (params.timeMap as [number, number][]).filter((p) => Array.isArray(p) && p.length === 2).sort((a, b) => a[0] - b[0]) : [];
  const warp = (c: number) => {
    if (!tm.length) return c;
    if (c <= tm[0][0]) return tm[0][1] + (c - tm[0][0]);
    for (let k = 1; k < tm.length; k += 1) if (c <= tm[k][0]) return tm[k - 1][1] + ((c - tm[k - 1][0]) * (tm[k][1] - tm[k - 1][1])) / (tm[k][0] - tm[k - 1][0] || 1);
    return tm[tm.length - 1][1] + (c - tm[tm.length - 1][0]);
  };
  // (THE EASE-IN STARTS WHEN THIS PERSON'S CLIP REALLY STARTS — a clip the director starts late, so its hit lines up, eases in
  // from there, never already 70% done on its first picture: Oct 16 uppercut hand pop)
  const tOf = (i: number) => start.t + warp(clip.times[i] ?? i / clip.fps); // (the picture's TRUE time — kimodo/library.ts)
  const tFirst = Math.max(start.t, tOf(0));
  const st = params?.stage as StageView | undefined;
  // (stage → screen: the person's own Kimodo frame (x, y, z) → the stage → the camera. u = across the picture, d = depth)
  const onStage = (v: V3) => { const X = st!.side >= 0 ? v[0] : -v[0], Z = st!.side >= 0 ? v[2] : st!.S - v[2], c = Math.cos(st!.theta), sn = Math.sin(st!.theta);
    return { x: st!.originX + (Z * c + X * sn) * st!.scale, h: (v[1] - st!.floor) * st!.scale, d: -Z * sn + X * c }; };
  const keys0: (CharacterKey | null)[] = frames.map((fr, i) => {
    const t = tOf(i);
    if (t < start.t - 1e-6) return null;
    if (st) {
      const u = Math.min(1, (t - tFirst) / BLEND_IN), ease = u * u * (3 - 2 * u);
      const J = (k: string) => { const q = onStage(fr[k] as V3); return [q.x, q.h]; };
      const real = { w: ease, d: onStage(fr.Hips as V3).d, j: { hip: J("Hips"), neck: J("Neck1"), headTop: J("HeadEnd"), lElbow: J("LeftForeArm"), lHand: J("LeftHand"), rElbow: J("RightForeArm"), rHand: J("RightHand"), lKnee: J("LeftShin"), lFoot: J("LeftFoot"), rKnee: J("RightShin"), rFoot: J("RightFoot") } };
      return { t, real, pose: lerpPose(start.pose ?? STAND, smooth[i], ease), x: real.j.hip[0], lift: 0, facing: start.facing, ease: "linear", xEase: "linear", liftEase: "linear" } as CharacterKey;
    }
    const u = Math.min(1, (t - tFirst) / BLEND_IN), ease = u * u * (3 - 2 * u);
    const pose = lerpPose(start.pose ?? STAND, smooth[i], ease);
    const lowest = Math.min(...Object.keys(fr).filter((k) => k !== "HeadEnd").map((k) => yOf(fr, k)));
    const lift = lifts[i], sk = forwardKinematics(pose, "right", { x: 0, y: 0 }, H), r = HEAD_RADIUS.normal * H;
    // (the tiny leftover after smoothing: lift so no hand or elbow is ever under the floor)
    const body = Math.max(sk.lFoot.y, sk.rFoot.y, sk.lKnee.y, sk.rKnee.y, sk.hip.y, sk.neck.y, sk.head.y + r);
    const arms = Math.max(sk.lHand.y, sk.rHand.y, sk.lElbow.y, sk.rElbow.y) + 1;
    const posed = pose;
    // THE REAL POSITIONS RIDE ALONG (Oct 15 PASS-THROUGH: Arthur saw our angle translation make Kimodo worse — the engine
    // draws these exact joints instead, see applyRealMotion): stage x, height above the floor (px), blend-in weight.
    // SAME SIZE AS THE FIGURE (Oct 16, Arthur: "they walk, then slightly get taller, then they look like Kimodo"): each bone of
    // Kimodo's person gets OUR figure's bone length, keeping Kimodo's real direction AND its real foreshortening (a bone pointing
    // at the camera still looks shorter). The hips ride Kimodo's real path, scaled by leg length. Kimodo's motion is untouched.
    const SX = (k: string) => f(fr[k] as V3), SY = (k: string) => yOf(fr, k);
    const hipJ = [start.x + dir * (SX("Hips") - x0) * legScale, (SY("Hips") - floor) * legScale];
    const bone = (from: number[], a: string, b: string, ours: number) => { const l3 = boneLen3[`${a}>${b}`] || 1; return [from[0] + dir * (SX(b) - SX(a)) * (ours / l3), from[1] + (SY(b) - SY(a)) * (ours / l3)]; };
    const neckJ = bone(hipJ, "Hips", "Neck1", PROPORTIONS.torso * H);
    const arm = (side: "Left" | "Right") => { const e = bone(neckJ, "Neck1", `${side}ForeArm`, PROPORTIONS.upperArm * H); return [e, bone(e, `${side}ForeArm`, `${side}Hand`, PROPORTIONS.forearm * H)]; };
    const leg = (side: "Left" | "Right") => { const k = bone(hipJ, "Hips", `${side}Shin`, PROPORTIONS.thigh * H); return [k, bone(k, `${side}Shin`, `${side}Foot`, PROPORTIONS.shin * H)]; };
    const [lE, lHd] = arm("Left"), [rE, rHd] = arm("Right"), [lK, lF] = leg("Left"), [rK, rF] = leg("Right");
    const real = { w: ease, j: { hip: hipJ, neck: neckJ, headTop: bone(neckJ, "Neck1", "HeadEnd", 2 * HEAD_RADIUS.normal * H), lElbow: lE, lHand: lHd, rElbow: rE, rHand: rHd, lKnee: lK, lFoot: lF, rKnee: rK, rFoot: rF } };
    return { t, real, pose: posed, x: start.x + dir * (f(fr.Hips as V3) - x0) * s, lift: Math.max(lift, arms - body), facing: start.facing, ease: "linear", xEase: "linear", liftEase: "linear" } as CharacterKey;
  });
  const keys = keys0.filter((k): k is CharacterKey => k !== null);
  const end = keys[keys.length - 1];
  return { keys, end: { t: end.t, x: end.x, facing: start.facing, pose: end.pose }, marks: { done: end.t, start: start.t } };
}

// PASS-THROUGH (SPEC-0025): on every picture inside a real motion, the figure IS Kimodo's motion — its real joint positions
// scaled to the figure, standing on the floor — not our angle copy. Only three things are ours: the size, the floor (nothing
// below it), and the head circle sitting ON the neck's end (the classic stick figure: no floating head). The first 0.3 s blend
// from whatever the figure was doing. Runs in buildScene before contacts and objects, so hands, held things and hits use it.
type RealKey = { t: number; real?: { w: number; j: Record<string, number[]> } };
export function applyRealMotion(scene: { groundY: number; characters: { id: string; keys: RealKey[] }[] }, frames: { id: string; skeleton: Record<string, { x: number; y: number }>; headRadius: number }[][], times: number[], fps: number): void {
  for (const c of scene.characters) {
    const reals = c.keys.filter((k) => k.real);
    if (!reals.length) continue;
    const at = new Map(reals.map((k) => [Math.round(k.t * fps), k.real!]));
    // (AFTER A REAL MOTION ENDS the figure HOLDS its last real pose until its next move starts, then flows into it over
    // 0.3 s — never a snap back to an old pose; Oct 15 every video popped at the clip's end)
    const lastReal = Math.max(...reals.map((k) => k.t)), nextT = c.keys.filter((k) => !k.real && k.t > lastReal + 1e-6).map((k) => k.t).sort((a, b) => a - b)[0] ?? Infinity;
    let held: Record<string, { x: number; y: number }> | null = null;
    // (between two real frames — the engine may stretch a figure's timing a little — the two REAL frames are blended; a
    // picture never falls back to an old pose in the middle of a real motion)
    const sorted = [...reals].sort((a, b) => a.t - b.t), firstReal = sorted[0].t;
    const realAt = (T: number) => {
      if (T < firstReal - 1e-6 || T > lastReal + 1e-6) return at.get(Math.round(T * fps));
      let k = 0; while (k + 1 < sorted.length && sorted[k + 1].t <= T) k += 1;
      const a = sorted[k], b = sorted[Math.min(sorted.length - 1, k + 1)], u = b.t > a.t ? Math.min(1, Math.max(0, (T - a.t) / (b.t - a.t))) : 0;
      const A = a.real!, Bq = b.real!;
      return { w: A.w + (Bq.w - A.w) * u, ...(typeof (A as { d?: number }).d === "number" ? { d: (A as { d?: number }).d } : {}), j: Object.fromEntries(Object.keys(A.j).map((n) => [n, [A.j[n][0] + (Bq.j[n][0] - A.j[n][0]) * u, A.j[n][1] + (Bq.j[n][1] - A.j[n][1]) * u]])) };
    };
    frames.forEach((pic, i) => {
      const real = realAt(times[i]), fig = pic.find((x) => x.id === c.id);
      if (!fig) return;
      if (!real) {
        if (!held || times[i] <= lastReal) return;
        const w = times[i] < nextT ? 1 : Math.max(0, 1 - (times[i] - nextT) / 0.3); // (hold, then let go into the next move)
        if (w <= 0) return;
        for (const k of Object.keys(held)) { const a = fig.skeleton[k], b = held[k]; fig.skeleton[k] = a ? { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w } : b; }
        return;
      }
      const P = (k: string) => ({ x: real.j[k][0], y: scene.groundY - real.j[k][1] });
      const neck = P("neck"), top = P("headTop"), r = fig.headRadius, d = Math.hypot(top.x - neck.x, top.y - neck.y) || 1;
      const sk: Record<string, { x: number; y: number }> = { hip: P("hip"), neck, head: { x: neck.x + ((top.x - neck.x) / d) * r, y: neck.y + ((top.y - neck.y) / d) * r },
        lElbow: P("lElbow"), lHand: P("lHand"), rElbow: P("rElbow"), rHand: P("rHand"), lKnee: P("lKnee"), lFoot: P("lFoot"), rKnee: P("rKnee"), rFoot: P("rFoot") };
      // (on the floor: nothing below the ground line — the lowest joint, or the head's bottom, rests on it)
      const low = Math.max(...Object.entries(sk).map(([k, p]) => p.y + (k === "head" ? r : 0)));
      const up = Math.max(0, low - scene.groundY);
      for (const k of Object.keys(sk)) {
        const a = fig.skeleton[k], b = { x: sk[k].x, y: sk[k].y - up };
        fig.skeleton[k] = a ? { x: a.x + (b.x - a.x) * real.w, y: a.y + (b.y - a.y) * real.w } : b;
      }
      held = Object.fromEntries(Object.entries(fig.skeleton).map(([k, p]) => [k, { ...p }]));
      // (ON THE STAGE: how far from the camera — whoever is nearer is drawn in front; engine.ts after markDrawOrder)
      if (typeof (real as { d?: number }).d === "number") (fig as { stageDepth?: number }).stageDepth = (real as { d?: number }).d;
    });
  }
}
