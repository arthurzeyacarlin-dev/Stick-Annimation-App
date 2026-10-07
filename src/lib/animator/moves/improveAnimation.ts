// MAKE MY ANIMATION BETTER (Arthur, 2026-10-07: "works exactly the same as clean up" — it must CLEAN UP FIRST, then the
// engine checks the animation like an animator — "uh-oh, it ain't smooth", "uh-oh, it's floating" — and FIXES what is
// wrong, so the result is clearly different whenever something is wrong; a good animation stays (nearly) the same).
// Each check is a general rule, MEASURED on the cleaned-up pictures, and fixed only when it fails:
// - FLOATING: a stretch off the floor that is too slow for a jump (gravity would have pulled it down long before) is a
//   figure standing on air -> put down on the floor (the floor = where the figure stood).
// - CHOPPY: a joint jumping further in one picture than a running pace allows (a hand or foot may go at strike speed)
//   -> in-between pictures are added (the frame count grows) and the drawings become key poses brought to life
//   pose to pose (ease, anticipation, overshoot and settle, planted feet — round 2's path).
// - HOLDS THEN JUMPS (drawn on twos/threes or key poses only) -> pose-to-pose motion (round 2's path).
// - JITTER -> smoothed; SLIDING FEET -> planted (round 2's motion pass).
// The look (solid or hollow head, colour, thickness) and the SIZE are what they drew (clean-up keeps them).
import { buildScene } from "../engine.ts";
import type { CharacterKey, Scene } from "../engine.ts";
import type { Facing, Point, PoseAngles, Skeleton } from "../rig.ts";
import { cleanUpScene, improveMotionScene, readDrawnFigure, type DrawnLook, type JointPick, type ReadFigure } from "./fromDrawing.ts";
import { boneLengths, clampPose, HEAD_RADIUS } from "../rig.ts";
import { forwardKinematics } from "../pose.ts";
import { solveTwoBone } from "../ik.ts";
import { unwrapAngles } from "../easing.ts";
const lookOf = (f: ReadFigure): DrawnLook => ({ color: f.style.color, thickness: f.style.thickness, headFilled: f.style.headFilled, headRadius: HEAD_RADIUS[f.style.headSize] * f.height });

type DrawnKey = { frame: number; fig: ReadFigure };
// `read` = what the eyes read of the whole animation (vision/readAnimation.ts AnimationRead: its floor, size and
// limb-matched figures); `floor` / `height` override. Left out, they are worked out here.
type Opts = { fps: number; frameCount: number; floor?: number; height?: number; read?: { floor: number; height: number; figures?: readonly { frame: number; fig: ReadFigure }[] } };

const RUN_PACE = 4; // body heights per second: a running figure's body joints move no faster than this
const MAX_STEP = 0.3; // ... and never more than this (x the height) in one picture, or the eye loses the motion
const STRIKE = 2.5; // a hand or foot may move this many times faster (a punch, a kick)
const GRAVITY = 5.6; // body heights per second squared (9.8 m/s^2 for a 1.75 m figure)
const JOINTS = ["head", "neck", "hip", "lElbow", "rElbow", "lKnee", "rKnee", "lHand", "rHand", "lFoot", "rFoot"] as const;
const LIMBS = new Set(["lHand", "rHand", "lFoot", "rFoot"]);

export const bodyStepLimit = (fps: number) => Math.min(RUN_PACE / fps, MAX_STEP);
const skeletons = (scene: Scene, fps: number): Skeleton[] => buildScene(scene, fps).frames.map((f) => f[0].skeleton);

// The worst per-picture step, as a multiple of what is allowed (1 = right at the limit).
export function choppiness(frames: readonly Skeleton[], fps: number, height: number) {
  const lim = bodyStepLimit(fps) * height;
  let worst = 0, jumps = 0;
  for (let i = 1; i < frames.length; i++) {
    let w = 0;
    for (const j of JOINTS) {
      const d = Math.hypot(frames[i][j].x - frames[i - 1][j].x, frames[i][j].y - frames[i - 1][j].y);
      w = Math.max(w, d / (LIMBS.has(j) ? STRIKE * lim : lim));
    }
    if (w > 1.15) jumps++;
    worst = Math.max(worst, w);
  }
  return { worst, jumps };
}

// A foot resting on the floor in two pictures in a row that moves along it is sliding.
export function slidingFeet(frames: readonly Skeleton[], groundY: number, height: number) {
  let slides = 0;
  for (let i = 1; i < frames.length; i++) for (const f of ["lFoot", "rFoot"] as const) {
    const a = frames[i - 1][f], b = frames[i][f];
    if (groundY - a.y <= 0.01 * height && groundY - b.y <= 0.01 * height && Math.abs(b.x - a.x) > 0.008 * height) slides++;
  }
  return slides;
}

// FLOATING: the floor is where the figure stood (the lower part of the drawings); a stretch off it that is lower than a
// jump of that length would be (gravity: apex = g T^2 / 8) is standing on air — those drawings come down to the floor.
function grounded(keys: readonly DrawnKey[], fps: number): { keys: DrawnKey[]; floated: number } {
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  if (sorted.length < 3) return { keys: sorted, floated: 0 };
  const H = sorted.map((k) => k.fig.height).sort((a, b) => a - b)[sorted.length >> 1];
  const low = sorted.map((k) => Math.max(...Object.values(k.fig.joints).map((p) => p.y)));
  const floor = low.slice().sort((a, b) => a - b)[Math.min(low.length - 1, Math.floor(low.length * 0.75))];
  const lift = low.map((y) => floor - y);
  const out = sorted.map((k) => ({ ...k }));
  let floated = 0;
  for (let i = 0; i < sorted.length;) {
    if (lift[i] < 0.02 * H) { i++; continue; }
    let e = i;
    while (e + 1 < sorted.length && lift[e + 1] >= 0.02 * H) e++;
    const t0 = i > 0 ? sorted[i - 1].frame : sorted[i].frame, t1 = e + 1 < sorted.length ? sorted[e + 1].frame : sorted[e].frame;
    const T = (t1 - t0) / fps, peak = Math.max(...lift.slice(i, e + 1));
    if (peak < 0.5 * (GRAVITY * T * T / 8) * H) {
      for (let k = i; k <= e; k++) {
        const dy = lift[k];
        out[k] = { frame: sorted[k].frame, fig: { ...sorted[k].fig, joints: Object.fromEntries(Object.entries(sorted[k].fig.joints).map(([n, p]) => [n, { x: p.x, y: p.y + dy }])) as ReadFigure["joints"] } };
        floated++;
      }
    }
    i = e + 1;
  }
  return { keys: out, floated };
}

export function improveAnimation(keys0: readonly DrawnKey[], o: Opts): { scene: Scene; fixes: string[] } {
  if (!keys0.length) throw new Error("improveAnimationScene needs at least one drawn frame");
  const fixes: string[] = [];
  // 0. ONE ARM STAYS ONE ARM: limbs matched drawing to drawing (an arm never swaps with the other arm: no crossing).
  const m = matchedKeys(o.read?.figures?.length === keys0.length ? o.read.figures : keys0, o.height ?? o.read?.height);
  // JUMPS: up off the floor and back down = one gravity arc, standing ON the floor before and after.
  const jump = jumpScene(m.keys, o);
  if (jump) {
    if (m.swapped) fixes.push(`Kept each arm and leg the same one in every picture (${m.swapped} picture${m.swapped > 1 ? "s" : ""} had them swapped — they would cross)`);
    return neverWorse(m.keys, o, jump.scene, [...fixes, ...jump.fixes], true);
  }
  // (KNOWN GAP, round 4: limb matching is used for jumps only so far — the older motion pass below gets the drawings
  // as they came.)
  const keys = keys0.slice();
  // 1. Clean up first (neat lines, one size and facing, one floor, their look) — what the checks look at.
  const clean = cleanUpScene(keys, o);
  const H = clean.characters[0].height;
  const before = skeletons(clean, o.fps);
  // 2. FLOATING -> down onto the floor.
  const g = grounded(keys, o.fps);
  if (g.floated) fixes.push(`Brought the figure down to the floor in ${g.floated} picture${g.floated > 1 ? "s" : ""} (it was floating)`);
  // 3. The motion pass (jitter smoothed, even spacing, planted feet; held key poses brought to life pose to pose).
  const fps = o.fps;
  let frameCount = o.frameCount, work = g.keys;
  let scene = improveMotionScene(work, { fps, frameCount });
  // 4. CHOPPY -> in-between pictures: the drawings are spread out (each becomes a key pose held a few pictures) until
  // no joint jumps further in one picture than the pace allows; the motion pass then brings the key poses to life.
  // (Drawings already held as key poses are re-timed by the motion pass itself; this is for drawings on ONES.)
  const chop = choppiness(skeletons(scene, fps), fps, H);
  if (chop.worst > 1.15 && keys.length > 1 && longestHold(before) < 3) {
    // k pictures for every drawn one; the new pictures are in-betweens of the drawings around them, EASED out of the
    // first drawing and into the last (real starts and stops), even in the middle (never slowing mid-motion).
    const k = Math.min(8, Math.max(2, Math.ceil(chop.worst * 1.4)));
    const sorted = g.keys.slice().sort((a, b) => a.frame - b.frame);
    const ease = (u: number) => u * u * (3 - 2 * u);
    const last = sorted.length - 1;
    work = [];
    sorted.forEach((d, i) => {
      work.push({ frame: d.frame * k, fig: d.fig });
      if (i === last) return;
      const e = sorted[i + 1], span = (e.frame - d.frame) * k;
      for (let f = 1; f < span; f++) {
        let u = f / span;
        if (i === 0 && last === 1) u = ease(u);
        else if (i === 0) u = (ease(0.5 + u / 2) - 0.5) * 2; // out of the first drawing slowly, then at speed
        else if (i === last - 1) u = ease(u / 2) * 2; // at speed, then slowing into the last drawing
        const joints = Object.fromEntries(Object.entries(d.fig.joints).map(([n, p]) => { const q = e.fig.joints[n as keyof typeof e.fig.joints]; return [n, { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }]; })) as ReadFigure["joints"];
        work.push({ frame: d.frame * k + f, fig: readDrawnFigure(joints, lookOf(d.fig), { facing: d.fig.facing, height: d.fig.height }) });
      }
    });
    frameCount = (o.frameCount - 1) * k + 1;
    scene = improveMotionScene(work, { fps, frameCount });
    fixes.push(`Smoothed ${chop.jumps} choppy jump${chop.jumps > 1 ? "s" : ""} (added ${frameCount - o.frameCount} in-between pictures, easing in and out)`);
  }
  const after = skeletons(scene, fps);
  // What else the motion pass fixed (measured, so the list only says what really changed).
  const heldBefore = longestHold(before), heldAfter = longestHold(after);
  if (!fixes.some((f) => f.startsWith("Smoothed")) && heldBefore >= 3 && heldAfter < heldBefore) fixes.push(`Brought the key poses to life (in-betweens, ease, wind-ups and settles instead of ${heldBefore} frozen pictures then a jump)`);
  const slideBefore = slidingFeet(before, clean.groundY, H), slideAfter = slidingFeet(after, scene.groundY, H);
  if (slideBefore > 0 && slideAfter < slideBefore) fixes.push("Planted the feet (they were sliding)");
  const shakeBefore = shake(before), shakeAfter = shake(after);
  if (!fixes.length && shakeBefore > 0 && shakeAfter < 0.8 * shakeBefore) fixes.push("Smoothed out the wobbles (the lines were shaking)");
  // UNEVEN SPACING (bunched pictures then a jump): the motion pass evened it out — a real change, so it is kept.
  if (!fixes.length && after.length === before.length && before.some((b, i) => JOINTS.some((j) => Math.hypot(b[j].x - after[i][j].x, b[j].y - after[i][j].y) > 0.03 * H))) fixes.push("Evened out the timing (no more bunched pictures then a jump)");
  // A good animation stays as it was drawn (cleaned up): nothing measured wrong -> the clean-up itself.
  if (!fixes.length) return { scene: { ...clean, id: "make-better", title: "My animation, made better" }, fixes: ["Looks good already"] };
  return neverWorse(keys, o, { ...scene, durationSec: Math.max(0, (frameCount - 1) / fps) }, fixes);
}

export function improveAnimationScene(keys: readonly DrawnKey[], o: Opts): Scene {
  return improveAnimation(keys, o).scene;
}

const same = (a: Skeleton, b: Skeleton) => JOINTS.every((j) => Math.hypot(a[j].x - b[j].x, a[j].y - b[j].y) < 0.5);
function longestHold(frames: readonly Skeleton[]) {
  let run = 1, most = 1;
  for (let i = 1; i < frames.length; i++) { run = same(frames[i], frames[i - 1]) ? run + 1 : 1; most = Math.max(most, run); }
  return frames.length ? most : 0;
}
// Shaking: how much each joint's path zig-zags (its second difference), summed.
function shake(frames: readonly Skeleton[]) {
  let s = 0;
  for (let i = 1; i + 1 < frames.length; i++) for (const j of JOINTS) {
    const ax = frames[i][j].x - frames[i - 1][j].x, bx = frames[i + 1][j].x - frames[i][j].x;
    const ay = frames[i][j].y - frames[i - 1][j].y, by = frames[i + 1][j].y - frames[i][j].y;
    if (ax * bx + ay * by < 0) s += Math.hypot(bx - ax, by - ay);
  }
  return s;
}

// ---- One arm stays one arm --------------------------------------------------------------------------------------
const PAIRS: [JointPick, JointPick][][] = [[["lElbow", "rElbow"], ["lHand", "rHand"]], [["lKnee", "rKnee"], ["lFoot", "rFoot"]]];
const rel = (j: Record<JointPick, Point>, k: JointPick) => ({ x: j[k].x - j.hip.x, y: j[k].y - j.hip.y });
const d2 = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
// Swaps the arms (and, separately, the legs) of `next` when that makes them follow `prev` (each limb nearest where it was).
export function matchJoints(prev: Record<JointPick, Point>, next: Record<JointPick, Point>, strict = 0): { joints: Record<JointPick, Point>; swapped: boolean } {
  const j = { ...next };
  let swapped = false;
  for (const pair of PAIRS) {
    const straight = pair.reduce((s, [a, b]) => s + d2(rel(j, a), rel(prev, a)) + d2(rel(j, b), rel(prev, b)), 0);
    const crossed = pair.reduce((s, [a, b]) => s + d2(rel(j, b), rel(prev, a)) + d2(rel(j, a), rel(prev, b)), 0);
    if (strict ? crossed < 0.5 * straight && straight > strict : crossed < 0.8 * straight) { for (const [a, b] of pair) [j[a], j[b]] = [j[b], j[a]]; swapped = true; }
  }
  return { joints: j, swapped };
}
const lookOfFig = (f: ReadFigure, H: number): DrawnLook => ({ color: f.style.color, thickness: f.style.thickness, headFilled: f.style.headFilled, headRadius: HEAD_RADIUS[f.style.headSize] * H + (f.style.neck ? 0.06 * H : 0) });
function matchedKeys(keys: readonly DrawnKey[], height?: number): { keys: DrawnKey[]; swapped: number } {
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  let swapped = 0;
  const out: DrawnKey[] = [];
  for (const k of sorted) {
    const prev = out[out.length - 1];
    if (!prev) { out.push(k); continue; }
    const m = matchJoints(prev.fig.joints, k.fig.joints, 0.15 * (height ?? k.fig.height));
    if (!m.swapped) { out.push(k); continue; }
    swapped++;
    out.push({ frame: k.frame, fig: readDrawnFigure(m.joints, lookOfFig(k.fig, k.fig.height), { facing: k.fig.facing === "front" ? undefined : k.fig.facing, height: height ?? k.fig.height }) });
  }
  return { keys: out, swapped };
}

// ---- Jumps ------------------------------------------------------------------------------------------------------
// A HOP / JUMP (Arthur: "it made my animation WORSE — levitating, sliding, crossing arms"): the floor is where the
// figure stood (its lowest drawn feet, or the read's floor); drawings whose feet are a hair off it (under a tenth of
// the height) are STANDING and go down onto it; a stretch whose feet go clearly up (a tenth of the height or more)
// between standing drawings is the air: the hips fly ONE gravity arc (a parabola: constant pull down) from the
// take-off drawing to the landing drawing through the highest point they drew, sideways at a steady speed. On the
// floor every foot is PLANTED on its spot (the legs bend to reach it: no sliding), the drawn crouch (anticipation) and
// the landing dip are kept (the hip height over the feet is theirs), and the poses are their drawings (limbs matched),
// in-betweened on arcs (angles), held key poses eased in and out. One size, one facing, their look.
const AIR = 0.1; // feet this far above the floor (x the height) at the top = a jump; less = standing on air
const footLow = (j: Record<JointPick, Point>) => Math.max(j.lFoot.y, j.rFoot.y);
const lowestOf = (s: Skeleton, r: number) => Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + r);
export function floorOf(keys: readonly DrawnKey[]) { return Math.max(...keys.map((k) => footLow(k.fig.joints))); }

function jumpScene(keys: readonly DrawnKey[], o: Opts): { scene: Scene; fixes: string[] } | null {
  if (keys.length < 3) return null;
  // (Key poses held several pictures each are brought to life pose to pose — anticipation, landing dip — by the motion
  // pass; this is for jumps drawn on ones/twos.)
  // (Drawings repeated unchanged on following frames are ONE key pose held: counted once.)
  const distinct = keys.filter((k, i) => i === 0 || Object.keys(k.fig.joints).some((n) => d2(k.fig.joints[n as JointPick], keys[i - 1].fig.joints[n as JointPick]) > 0.5));
  const gaps = distinct.slice(1).map((k, i) => k.frame - distinct[i].frame).sort((a, b) => a - b);
  if (distinct.length < 3 || gaps[gaps.length >> 1] > 2) return null;
  const count = new Map<Facing, number>();
  for (const k of keys) count.set(k.fig.facing, (count.get(k.fig.facing) ?? 0) + 1);
  const facing = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const H = o.height ?? o.read?.height ?? keys.map((k) => k.fig.height).sort((a, b) => a - b)[keys.length >> 1];
  const F = o.floor ?? o.read?.floor ?? floorOf(keys);
  const look = lookOfFig(keys[0].fig, H);
  const figs = keys.map((k) => readDrawnFigure(k.fig.joints, look, { facing, height: H }));
  const style = figs[0].style, r = HEAD_RADIUS[style.headSize] * H, neck = style.neck === true;
  const frames = keys.map((k) => k.frame);
  const lift = figs.map((f) => F - footLow(f.joints));
  // The air: the first stretch of drawings clearly up, with standing drawings before and after it.
  let s = -1, e = -1;
  for (let i = 1; i < figs.length - 1 && s < 0; i++) if (lift[i] >= AIR * H) { s = i; e = i; while (e + 1 < figs.length && lift[e + 1] >= AIR * H) e++; }
  if (s < 0 || e + 1 >= figs.length) return null;
  // (ONE hop: feet clearly up again later = a run's strides or several hops — the older motion pass handles those.)
  if (lift.slice(e + 1).some((l) => l >= AIR * H)) return null;
  // (A HOP takes off from both feet and lands on both — a running stride pushes off one foot with the other up.)
  const bothDown = (i: number) => F - Math.min(figs[i].joints.lFoot.y, figs[i].joints.rFoot.y) < 0.08 * H;
  if (!bothDown(s - 1) || !bothDown(e + 1)) return null;
  const iA = s - 1, iL = e + 1; // the take-off drawing and the landing drawing (on the floor)
  const fps = o.fps, N = o.frameCount;
  // Poses: their angles (unwrapped), the pencil's shake smoothed (a drawing a few degrees off the line through its
  // neighbours, never the take-off, the top or the landing).
  const names = Object.keys(figs[0].pose) as (keyof PoseAngles)[];
  const ch = names.map((k) => unwrapAngles(figs.map((f) => f.pose[k])));
  let peakI = s;
  for (let i = s; i <= e; i++) if (figs[i].joints.hip.y < figs[peakI].joints.hip.y) peakI = i;
  const fixed = new Set([0, iA, iL, peakI, figs.length - 1]);
  for (let pass = 0; pass < 2; pass++) for (const c of ch) {
    const next = c.slice();
    for (let i = 1; i < c.length - 1; i++) {
      if (fixed.has(i)) continue;
      const w = (frames[i] - frames[i - 1]) / Math.max(1e-9, frames[i + 1] - frames[i - 1]);
      const off = c[i] - (c[i - 1] + (c[i + 1] - c[i - 1]) * w);
      if (Math.abs(off) < 8) next[i] = c[i] - 0.6 * off;
    }
    c.splice(0, c.length, ...next);
  }
  const at = (vals: readonly number[], f: number) => {
    if (f <= frames[0]) return vals[0];
    if (f >= frames[frames.length - 1]) return vals[vals.length - 1];
    let k = 0;
    while (frames[k + 1] < f) k++;
    const span = frames[k + 1] - frames[k];
    let u = (f - frames[k]) / span;
    if (span > 1) u = u * u * (3 - 2 * u); // a held key pose: eased out of it and into the next
    return vals[k] + (vals[k + 1] - vals[k]) * u;
  };
  const poseAt = (f: number) => clampPose(Object.fromEntries(names.map((k, c) => [k, at(ch[c], f)])) as PoseAngles).pose;
  const fk = (pose: PoseAngles, hip: Point) => forwardKinematics(pose, facing, hip, H, style.headSize, neck);
  // On the floor: the hips at their drawn height over the feet, the lower foot on the floor.
  const standHipY = (pose: PoseAngles) => { const sk = fk(pose, { x: 0, y: 0 }); return F - Math.max(sk.lFoot.y, sk.rFoot.y); };
  // Hip x: the drawn path (a hair of wobble smoothed), steady in the air.
  const xs = figs.map((f) => f.joints.hip.x);
  const tA = frames[iA], tL = frames[iL];
  const bones = boneLengths(H), reach = (bones.thigh + bones.shin) * 0.995;
  const kneeDir = (side: "l" | "r"): Point => (facing === "right" ? { x: 1, y: 0 } : facing === "left" ? { x: -1, y: 0 } : { x: side === "l" ? -1 : 1, y: 0 });
  const lock: Partial<Record<"lFoot" | "rFoot", Point>> = {};
  const got: { pose: PoseAngles; hip: Point }[] = [];
  let floated = 0;
  // 1. On the floor (every picture outside the air), in order so planted feet carry over.
  for (let f = 0; f < N; f++) {
    if (f > tA && f < tL) { for (const ft of ["lFoot", "rFoot"] as const) delete lock[ft]; got.push({ pose: poseAt(f), hip: { x: 0, y: 0 } }); continue; }
    let pose = poseAt(f);
    let hip: Point = { x: at(xs, f), y: standHipY(pose) };
    // (Both feet planted: the hips stay over them — a hip drifting away would stretch the legs out.)
    if (lock.lFoot && lock.rFoot) { const mid = (lock.lFoot.x + lock.rFoot.x) / 2; hip = { x: Math.max(mid - 0.08 * H, Math.min(mid + 0.08 * H, hip.x)), y: hip.y }; }
    // PLANTED FEET: each foot on the floor keeps its spot until it lifts; the legs bend to reach it.
    const sk = fk(pose, hip);
    const targets: Partial<Record<"lFoot" | "rFoot", Point>> = {};
    for (const ft of ["lFoot", "rFoot"] as const) {
      if (F - sk[ft].y > 0.03 * H) { delete lock[ft]; continue; }
      if (!lock[ft]) lock[ft] = { x: sk[ft].x, y: F }; // (never moved while it stays down: that is sliding)
      targets[ft] = lock[ft];
    }
    for (const t of Object.values(targets)) if (t && Math.abs(t.x - hip.x) < reach) hip = { x: hip.x, y: Math.max(hip.y, t.y - Math.sqrt(reach * reach - (t.x - hip.x) ** 2)) };
    const j = fk(pose, hip) as unknown as Record<JointPick, Point>;
    for (const [ft, t] of Object.entries(targets) as ["lFoot" | "rFoot", Point][]) {
      const side = ft === "lFoot" ? "l" : "r";
      const sol = solveTwoBone(hip, t, bones.thigh, bones.shin, kneeDir(side));
      j[`${side}Knee`] = sol.mid; j[ft] = sol.end;
    }
    if (Object.keys(targets).length) pose = readDrawnFigure(j, look, { facing, height: H }).pose;
    const drawnHere = keys.find((k) => k.frame === f);
    if (drawnHere && Math.abs(F - footLow(drawnHere.fig.joints)) > 0.01 * H) floated++;
    got.push({ pose, hip });
  }
  // 2. The air: ONE parabola for the hips from the take-off picture's hips to the landing picture's, through the top
  // they drew (measured from the floor they drew), sideways at a steady speed.
  const yA = got[tA].hip.y, yL = got[tL].hip.y;
  const yP = Math.min(...figs.slice(s, e + 1).map((f) => f.joints.hip.y)) + (F - floorOf(keys));
  if (!(yP < yA - 0.02 * H && yP < yL - 0.02 * H)) return null;
  const sa = Math.sqrt(yA - yP), sl = Math.sqrt(yL - yP);
  const tP = tA + ((tL - tA) * sa) / (sa + sl), a = (yA - yP) / ((tP - tA) ** 2);
  for (let f = tA + 1; f < tL; f++) got[f].hip = { x: got[tA].hip.x + ((got[tL].hip.x - got[tA].hip.x) * (f - tA)) / (tL - tA), y: yP + a * (f - tP) ** 2 };
  const out: CharacterKey[] = got.map(({ pose, hip }, f) => ({ t: f / fps, pose, x: hip.x, lift: Math.max(0, F - lowestOf(fk(pose, hip), r)), contacts: [], ease: "linear", xEase: "linear", liftEase: "linear" }));
  const scene: Scene = { id: "make-better", title: "My animation, made better", durationSec: Math.max(0, (N - 1) / fps), groundY: F, characters: [{ id: "drawn", name: "Drawn figure", facing, height: H, style, keys: out }] };
  const fixes = ["Made the jump one smooth gravity arc (up, over the top and down at the speed gravity gives), landing back on the floor"];
  if (floated) fixes.push(`Stood the figure ON the floor in ${floated} picture${floated > 1 ? "s" : ""} (it was floating or sinking)`);
  fixes.push("Planted the feet on the floor before the take-off and after the landing (no sliding)");
  return { scene, fixes };
}

// ---- Never worse --------------------------------------------------------------------------------------------------
// Measured on the pictures: the result is compared with the clean-up of the same drawings; if any measure got worse,
// the clean-up is given instead (and only the fixes that really happened are said).
export type Measures = { floating: number; sliding: number; swaps: number; shake: number; bones: number; choppy: number };
const BONE_PAIRS: [keyof Skeleton, keyof Skeleton][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];
export function measure(frames: readonly Skeleton[], groundY: number, height: number, fps: number): Measures {
  const lowFoot = frames.map((s) => groundY - Math.max(s.lFoot.y, s.rFoot.y));
  // FLOATING: off the floor by more than a hair but in a stretch that never goes clearly up (not a jump).
  let floating = 0;
  for (let i = 0; i < frames.length;) {
    if (lowFoot[i] <= 0.01 * height) { i++; continue; }
    let e = i;
    while (e + 1 < frames.length && lowFoot[e + 1] > 0.01 * height) e++;
    if (Math.max(...lowFoot.slice(i, e + 1)) < AIR * height) floating += e - i + 1;
    i = e + 1;
  }
  let swaps = 0;
  // (A SWAP = the limbs jump to where the other one was: clearly nearer crossed than straight, and a real distance.)
  for (let i = 1; i < frames.length; i++) if (matchJoints(frames[i - 1] as unknown as Record<JointPick, Point>, frames[i] as unknown as Record<JointPick, Point>, 0.3 * height).swapped) swaps++;
  let bones = 0;
  for (const [a, b] of BONE_PAIRS) { const L = frames.map((s) => d2(s[a] as Point, s[b] as Point)); bones = Math.max(bones, (Math.max(...L) - Math.min(...L)) / height); }
  return { floating, sliding: slidingFeet(frames, groundY, height), swaps, shake: shake(frames) / height, bones, choppy: choppiness(frames, fps, height).worst };
}
// (KNOWN GAP, round 4: the older motion pass for non-jumps can still add foot sliding on a lunge or a walk — there
// only floating and bone length are guarded so far; `all` guards every measure.)
function neverWorse(keys: readonly DrawnKey[], o: Opts, scene: Scene, fixes: string[], all = false): { scene: Scene; fixes: string[] } {
  const clean = cleanUpScene(keys, o), H = clean.characters[0].height;
  const b = measure(skeletons(clean, o.fps), clean.groundY, H, o.fps), a = measure(skeletons(scene, o.fps), scene.groundY, H, o.fps);
  const worse = a.floating > b.floating || a.bones > b.bones + 0.01 || (all && (a.sliding > b.sliding || a.swaps > b.swaps));
  if (!worse) return { scene, fixes };
  return { scene: { ...clean, id: "make-better", title: "My animation, made better" }, fixes: ["Cleaned up the drawings (my motion fixes would have made it worse here, so I kept your motion)"] };
}
