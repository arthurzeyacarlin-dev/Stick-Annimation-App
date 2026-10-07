// HELPING WITH SOMEONE'S OWN ANIMATION (SPEC-0017 "50-50" engine half, 2026-10-07). Arthur: the engine helps with
// the user's OWN drawing — four examples of one skill: read what they drew, keep what they meant, fix or finish only
// what they asked, match their look, always undoable. Here the user points things out by clicking (the joints of a
// stick figure they drew, a spot on the page); in Phase 3 the AI finds them itself.
// Everything is in the app's PAGE space (1080 tall, page centred on x = 960) and lands exactly where the user drew:
// these scenes are never centred or page-fitted.
import { EXPLOSION_SECONDS } from "../effects/explosion.ts";
import type { EffectTrack } from "../effects/types.ts";
import type { CharacterKey, FootContact, Scene } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { solveTwoBone } from "../ik.ts";
import { boneLengths, clampPose, DEFAULT_STYLE, HEAD_RADIUS, PROPORTIONS, STAND, STAND_FRONT, type CharacterStyle, type Facing, type HeadSize, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import { LIBRARY } from "./library.ts";
import { lerpPose, windUp } from "./motion.ts";
import { unwrapAngles } from "../easing.ts";
import { planToScene } from "./plan.ts";
import { fixPose } from "./poseFix.ts";

export type JointPick = "head" | "neck" | "hip" | "lElbow" | "lHand" | "rElbow" | "rHand" | "lKnee" | "lFoot" | "rKnee" | "rFoot";

// The order the user clicks. "One arm / the other arm" (never the figure's own left/right: confusing for kids). The
// engine works out which way the figure faces and which limb is which by itself (readDrawnFigure).
export const JOINT_PICKS: readonly { joint: JointPick; prompt: string }[] = [
  { joint: "head", prompt: "Click the middle of the head" },
  { joint: "neck", prompt: "Click the neck (where the arms start)" },
  { joint: "hip", prompt: "Click the hips (where the legs start)" },
  { joint: "lElbow", prompt: "One arm: click its elbow (the bend)" },
  { joint: "lHand", prompt: "Same arm: click its hand (the end)" },
  { joint: "rElbow", prompt: "The other arm: click its elbow" },
  { joint: "rHand", prompt: "The other arm: click its hand" },
  { joint: "lKnee", prompt: "One leg: click its knee (the bend)" },
  { joint: "lFoot", prompt: "Same leg: click its foot (the end)" },
  { joint: "rKnee", prompt: "The other leg: click its knee" },
  { joint: "rFoot", prompt: "The other leg: click its foot" },
];

export type DrawnLook = { color: string; thickness: number; headFilled: boolean; headRadius?: number };
export type ReadFigure = { pose: PoseAngles; facing: Facing; x: number; groundY: number; lift: number; height: number; style: CharacterStyle; joints: Record<JointPick, Point> };
type Sample = (x: number, y: number) => readonly [number, number, number, number] | null;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (a: number) => { let v = a % 360; if (v > 180) v -= 360; if (v <= -180) v += 360; return v; };
const median = (values: number[]) => { const s = values.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const BONES: [JointPick, JointPick][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];

// ---- The look ------------------------------------------------------------------------------------------------
// INK = a pixel the user drew: mostly opaque and not the white page.
const isInk = (p: readonly [number, number, number, number] | null) => !!p && p[3] > 100 && !(p[0] > 235 && p[1] > 235 && p[2] > 235);

// The drawn figure's look from its pixels: the line color (the most common ink along the bones), the line thickness
// (how wide the ink is across each bone), and the head (ink at its middle = filled; its radius from the edge).
export function lookFromPixels(sample: Sample, joints: Record<JointPick, Point>): DrawnLook {
  const colors = new Map<string, number>();
  const widths: number[] = [];
  for (const [a, b] of BONES) {
    const pa = joints[a], pb = joints[b], L = dist(pa, pb);
    if (L < 4) continue;
    const ux = (pb.x - pa.x) / L, uy = (pb.y - pa.y) / L, nx = -uy, ny = ux;
    for (const f of [0.3, 0.5, 0.7]) {
      const cx = pa.x + (pb.x - pa.x) * f, cy = pa.y + (pb.y - pa.y) * f;
      // (The click may be a few px off the line: find the line across the bone, then measure it.)
      let found: number | null = null;
      for (let d = 0; d <= 12 && found === null; d += 0.5) for (const s of d === 0 ? [0] : [d, -d]) if (found === null && isInk(sample(cx + nx * s, cy + ny * s))) found = s;
      if (found === null) continue;
      let lo = found, hi = found;
      while (lo - found > -40 && isInk(sample(cx + nx * (lo - 0.5), cy + ny * (lo - 0.5)))) lo -= 0.5;
      while (hi - found < 40 && isInk(sample(cx + nx * (hi + 0.5), cy + ny * (hi + 0.5)))) hi += 0.5;
      widths.push(hi - lo + 0.5);
      const p = sample(cx + nx * (lo + hi) / 2, cy + ny * (lo + hi) / 2);
      if (p && isInk(p)) { const key = `#${hex(p[0])}${hex(p[1])}${hex(p[2])}`; colors.set(key, (colors.get(key) ?? 0) + 1); }
    }
  }
  const color = [...colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_STYLE.color;
  // (Lines drawn over each other — legs together, an arm along the body — read wider, never thinner: the pen is the
  // thinnest readings that agree — the third thinnest, so one or two stray thin readings can't decide — not the middle.)
  const thin = [...widths].sort((a, b) => a - b)[Math.min(2, widths.length - 1)];
  const thickness = Math.max(1, Math.round((thin || DEFAULT_STYLE.thickness) * 2) / 2);
  // The head: ink at (and around) its middle = filled.
  const h = joints.head;
  const nearR = Math.max(3, dist(h, joints.neck) * 0.25);
  const middle = [[0, 0], [nearR, 0], [-nearR, 0], [0, nearR], [0, -nearR]].filter(([dx, dy]) => isInk(sample(h.x + dx, h.y + dy))).length;
  const headFilled = middle >= 3;
  // Its radius: out from the middle in 16 directions to the head's outer edge (filled: where the ink stops; hollow:
  // the ring's middle). The direction of the neck line is left out.
  const radii: number[] = [];
  const toNeck = Math.atan2(joints.neck.y - h.y, joints.neck.x - h.x);
  const maxR = Math.max(20, dist(h, joints.neck) * 2.5);
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * Math.PI * 2;
    if (Math.abs(wrap(deg(a - toNeck))) < 35) continue;
    const at = (r: number) => isInk(sample(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r));
    let r = 0;
    if (headFilled) { while (r < maxR && at(r + 0.5)) r += 0.5; if (r > 0) radii.push(r + 0.5 - thickness / 2); }
    else {
      while (r < maxR && !at(r)) r += 0.5;
      if (r >= maxR) continue;
      let out = r;
      while (out < maxR && at(out + 0.5)) out += 0.5;
      radii.push((r + out + 0.5) / 2);
    }
  }
  const headRadius = radii.length >= 4 ? median(radii) : undefined;
  return { color, thickness, headFilled, ...(headRadius && headRadius > 1 ? { headRadius } : {}) };
}

// ---- Reading the figure (joints -> pose) ---------------------------------------------------------------------
// One limb's two angles from its drawn joints, as forwardKinematics would draw them (side view facing right; front
// view with `side` = -1 for the screen-left limb, +1 for the screen-right one).
const sideAngle = (from: Point, to: Point, flip: number) => deg(Math.atan2(flip * (to.x - from.x), to.y - from.y));

function anglesFor(j: Record<JointPick, Point>, facing: Facing): PoseAngles {
  const flip = facing === "left" ? -1 : 1;
  const lean = deg(Math.atan2(flip * (j.neck.x - j.hip.x), -(j.neck.y - j.hip.y)));
  const headDir = deg(Math.atan2(flip * (j.head.x - j.neck.x), -(j.head.y - j.neck.y)));
  const head = wrap(headDir - lean);
  if (facing === "front") {
    // Front view: limbs swing outward (+) on their own side; arms bend +, legs bend - (forwardKinematics).
    const limb = (root: Point, mid: Point, end: Point, side: -1 | 1, bendSign: 1 | -1) => {
      const a = sideAngle(root, mid, side), b = sideAngle(mid, end, side);
      return [a, wrap(bendSign * (b - a))];
    };
    const [lShoulder, lElbow] = limb(j.neck, j.lElbow, j.lHand, -1, 1);
    const [rShoulder, rElbow] = limb(j.neck, j.rElbow, j.rHand, 1, 1);
    const [lHip, lKnee] = limb(j.hip, j.lKnee, j.lFoot, -1, -1);
    const [rHip, rKnee] = limb(j.hip, j.rKnee, j.rFoot, 1, -1);
    return { lean, head, lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee };
  }
  const arm = (mid: Point, end: Point) => { const u = sideAngle(j.neck, mid, flip), f = sideAngle(mid, end, flip); return [wrap(u + lean), wrap(f - u)]; };
  const leg = (mid: Point, end: Point) => { const u = sideAngle(j.hip, mid, flip), s = sideAngle(mid, end, flip); return [wrap(u + lean), wrap(u - s)]; };
  const [lShoulder, lElbow] = arm(j.lElbow, j.lHand);
  const [rShoulder, rElbow] = arm(j.rElbow, j.rHand);
  const [lHip, lKnee] = leg(j.lKnee, j.lFoot);
  const [rHip, rKnee] = leg(j.rKnee, j.rFoot);
  return { lean, head, lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee };
}

// WHICH WAY IT FACES: knees bend forward and hanging elbows bend forward in a side view; a front view has its legs and
// arms out on both sides with nothing bent forward or back. Votes in degrees (+ = facing right).
function facingOf(j: Record<JointPick, Point>, height: number): Facing {
  const asRight = anglesFor(j, "right");
  let vote = asRight.lKnee + asRight.rKnee;
  for (const s of ["l", "r"] as const) {
    // (Only a hanging arm: a raised arm may bend either way.)
    if (j[`${s}Hand`].y > j.neck.y + PROPORTIONS.upperArm * height * 0.5) vote += 0.6 * asRight[`${s}Elbow`];
  }
  const spread = (a: Point, b: Point, mid: number) => (a.x - mid) * (b.x - mid) < 0 && Math.min(Math.abs(a.x - mid), Math.abs(b.x - mid)) > 0.05 * height;
  const symmetric = spread(j.lFoot, j.rFoot, j.hip.x) && spread(j.lHand, j.rHand, j.neck.x);
  if (symmetric && Math.abs(vote) < 25) return "front";
  if (Math.abs(vote) >= 8) return vote > 0 ? "right" : "left";
  // (No clear bend: the way the body leans, else the way the head is off the neck, else right.)
  const lean = j.neck.x - j.hip.x;
  if (Math.abs(lean) > 0.02 * height) return lean > 0 ? "right" : "left";
  return symmetric ? "front" : "right";
}

const HEAD_SIZES = Object.keys(HEAD_RADIUS) as HeadSize[];
// How tall the drawn figure is: each bone's length / its share of the height, the middle value (one long scribbled
// bone can't change the size).
export function drawnHeight(j: Record<JointPick, Point>) {
  const share: Record<string, number> = { "hip-neck": PROPORTIONS.torso, "neck-lElbow": PROPORTIONS.upperArm, "neck-rElbow": PROPORTIONS.upperArm, "lElbow-lHand": PROPORTIONS.forearm, "rElbow-rHand": PROPORTIONS.forearm, "hip-lKnee": PROPORTIONS.thigh, "hip-rKnee": PROPORTIONS.thigh, "lKnee-lFoot": PROPORTIONS.shin, "rKnee-rFoot": PROPORTIONS.shin };
  return median(BONES.map(([a, b]) => dist(j[a], j[b]) / share[`${a}-${b}`]).filter((v) => v > 1));
}

// SIZE IS KEPT (Arthur, round 3: "twice as big stays twice as big; tiny stays tiny"): lines drawn on top of each other
// (legs together, an arm hanging along the body) make the bones read SHORT, never long. So an upright figure's size is
// also read from its span — head middle to its lowest point — against the same pose at size 1; the larger of the two
// (never more than a third above the bones) is the size.
function sizeOf(j: Record<JointPick, Point>, look: DrawnLook) {
  const bones = drawnHeight(j) || 300;
  const facing = facingOf(j, bones);
  const pose = clampPose(anglesFor(j, facing)).pose;
  const neck = look.headRadius !== undefined && dist(j.head, j.neck) - look.headRadius > 0.05 * bones + look.thickness;
  const unit = forwardKinematics(pose, facing, { x: 0, y: 0 }, 1, "normal", neck);
  const low = (s: Record<JointPick, Point>) => Math.max(...BODY_POINTS.map((k) => s[k].y));
  const unitSpan = low(unit) - unit.head.y, span = low(j) - j.head.y;
  if (!(unitSpan > 0.5)) return bones;
  const bySpan = span / unitSpan;
  return bySpan > bones && bySpan < bones * 1.34 ? bySpan : bones;
}
const BODY_POINTS: JointPick[] = ["neck", "hip", "lElbow", "lHand", "rElbow", "rHand", "lKnee", "lFoot", "rKnee", "rFoot"];

// The lowest body point, as the engine stands a body on the ground (engine.ts lowestBodyY).
const lowestY = (s: Skeleton, r: number) => Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y, s.hip.y, s.neck.y, s.head.y + r);

// Joints (page space) + look -> an engine figure that matches it, standing where it was drawn. `o.facing` / `o.height`
// force those (clean-up keeps one facing and one size over all the frames); left out, they are read from the drawing.
export function readDrawnFigure(joints: Record<JointPick, Point>, look: DrawnLook, o: { facing?: Facing; height?: number } = {}): ReadFigure {
  const j = { ...joints };
  const height = o.height ?? sizeOf(j, look);
  const facing = o.facing ?? facingOf(j, height);
  // Front view: the limb further left on the page is the figure's screen-left one.
  if (facing === "front") {
    if (j.lHand.x > j.rHand.x) [j.lElbow, j.lHand, j.rElbow, j.rHand] = [j.rElbow, j.rHand, j.lElbow, j.lHand];
    if (j.lFoot.x > j.rFoot.x) [j.lKnee, j.lFoot, j.rKnee, j.rFoot] = [j.rKnee, j.rFoot, j.lKnee, j.lFoot];
  }
  const pose = clampPose(anglesFor(j, facing)).pose;
  // The head: the size nearest the drawn one; a neck line when the head sits clearly above the neck.
  const headGap = dist(j.head, j.neck);
  const drawnR = look.headRadius ?? headGap;
  const headSize = HEAD_SIZES.reduce((best, s) => (Math.abs(HEAD_RADIUS[s] * height - drawnR) < Math.abs(HEAD_RADIUS[best] * height - drawnR) ? s : best), "normal" as HeadSize);
  const radius = HEAD_RADIUS[headSize] * height;
  // (A gap under one line's width is the pen, not a neck line — it matters on a tiny drawing.)
  const neck = look.headRadius !== undefined && headGap - radius > 0.05 * height + look.thickness;
  const style: CharacterStyle = { color: look.color, thickness: look.thickness, headSize, headFilled: look.headFilled, neck };
  // Where it stands: hip x as drawn; the floor = the lower drawn foot (never above the body's own lowest point), and
  // the lift that puts the hip exactly where it was drawn.
  const atOrigin = forwardKinematics(pose, facing, { x: 0, y: 0 }, height, headSize, neck);
  const low = lowestY(atOrigin, radius);
  const groundY = Math.max(j.lFoot.y, j.rFoot.y, j.hip.y + low);
  const lift = Math.max(0, groundY - low - j.hip.y);
  return { pose, facing, x: j.hip.x, groundY, lift, height, style, joints: j };
}

// ---- Shared scene pieces --------------------------------------------------------------------------------------
const restFor = (facing: Facing) => (facing === "front" ? STAND_FRONT : STAND);
const FEET: FootContact[] = ["lFoot", "rFoot"];
// The figure's skeleton as the engine will stand it (scene groundY, this lift).
const skeletonOf = (fig: ReadFigure, pose: PoseAngles, groundY: number, lift: number, x = fig.x, facing = fig.facing) => {
  const r = HEAD_RADIUS[fig.style.headSize] * fig.height;
  const s = forwardKinematics(pose, facing, { x, y: 0 }, fig.height, fig.style.headSize, fig.style.neck === true);
  const dy = groundY - lift - lowestY(s, r);
  for (const p of Object.values(s)) p.y += dy;
  return s;
};
// Feet resting on the floor in this pose.
const feetDown = (s: Skeleton, groundY: number, height: number) => FEET.filter((f) => groundY - s[f].y <= 0.02 * height);
const character = (fig: ReadFigure, keys: CharacterKey[], facing = fig.facing) => ({ id: "drawn", name: "Drawn figure", facing, height: fig.height, style: fig.style, keys });

// FEET ON THEIR SPOTS (NO FOOT SLIDING, general rule for every scene made from a drawing): a key is built with its hip
// at a chosen spot and every foot that is planted at that key placed EXACTLY on its floor spot (the legs re-bent to
// reach it), so where the engine plants a foot is where the key already has it — a foot never pops or slides when it
// lifts or lands. A foot with a `feet` target that is above the floor is a lifted foot put there (a step's swing).
type Body = { height: number; style: CharacterStyle; facing: Facing };
const kneeDir = (facing: Facing, side: "l" | "r"): Point => (facing === "right" ? { x: 1, y: 0 } : facing === "left" ? { x: -1, y: 0 } : { x: side === "l" ? -1 : 1, y: 0 });
function placeKey(b: Body, pose: PoseAngles, hip: Point, groundY: number, feet: Partial<Record<FootContact, Point>>) {
  const bones = boneLengths(b.height), reach = (bones.thigh + bones.shin) * 0.995;
  const h = { ...hip };
  // (A leg can't stretch: the hips come down until every target is in reach.)
  for (const f of FEET) { const t = feet[f]; if (t && Math.abs(t.x - h.x) < reach) h.y = Math.max(h.y, t.y - Math.sqrt(reach * reach - (t.x - h.x) ** 2)); }
  const s = forwardKinematics(pose, b.facing, h, b.height, b.style.headSize, b.style.neck === true);
  const out = { ...pose };
  for (const f of FEET) {
    const t = feet[f];
    if (!t) continue;
    const side = f === "lFoot" ? "l" : "r";
    const solved = solveTwoBone(h, t, bones.thigh, bones.shin, kneeDir(b.facing, side));
    const a = anglesFor({ ...(s as unknown as Record<JointPick, Point>), [`${side}Knee`]: solved.mid, [f]: solved.end }, b.facing);
    out[`${side}Hip`] = a[`${side}Hip`];
    out[`${side}Knee`] = a[`${side}Knee`];
  }
  const p = clampPose(out).pose;
  const s2 = forwardKinematics(p, b.facing, h, b.height, b.style.headSize, b.style.neck === true);
  return { pose: p, x: h.x, lift: Math.max(0, groundY - lowestY(s2, HEAD_RADIUS[b.style.headSize] * b.height)), skeleton: s2 };
}

// ---- Item 2: my drawing comes true -------------------------------------------------------------------------------
// From standing into the drawn pose: a beat standing still, ANTICIPATION (a dip and a counter-move the other way, at a
// walking pace), EASE into the pose with a small OVERSHOOT that SETTLES, then hold it to the end.
// NO FOOT SLIDING (Arthur: "the engine can't slide its feet"): the standing start is placed so one drawn foot on the
// floor (the one nearest its standing spot) is ALREADY exactly where it was drawn — it never moves; the other foot, if
// it must go somewhere else (a wide stance, a lunge, a kick), LIFTS straight up, travels in the air and is put down
// where it was drawn. Every key has its planted feet exactly on their spots (placeKey). Nothing on the floor slides.
export function comeTrueScene(fig: ReadFigure, o: { seconds?: number } = {}): Scene {
  const seconds = Math.max(1, o.seconds ?? 1.3);
  const rest = restFor(fig.facing);
  const g = fig.groundY, H = fig.height, body: Body = { height: H, style: fig.style, facing: fig.facing };
  const drawnS = skeletonOf(fig, fig.pose, g, fig.lift);
  const down = feetDown(drawnS, g, H);
  const stand0 = skeletonOf(fig, rest, g, 0);
  const anchor = down.slice().sort((a, b) => Math.abs(drawnS[a].x - stand0[a].x) - Math.abs(drawnS[b].x - stand0[b].x))[0];
  const startX = anchor ? fig.x + drawnS[anchor].x - stand0[anchor].x : fig.x;
  const standS = skeletonOf(fig, rest, g, 0, startX);
  const spotOf = (sk: Skeleton, f: FootContact) => ({ x: sk[f].x, y: Math.min(g, sk[f].y) });
  const stays = down.filter((f) => f === anchor || (Math.abs(standS[f].x - drawnS[f].x) < 0.01 * H && Math.abs(standS[f].y - drawnS[f].y) < 0.01 * H));
  const steps = FEET.filter((f) => !stays.includes(f));
  const standSpots: Partial<Record<FootContact, Point>> = { lFoot: spotOf(standS, "lFoot"), rFoot: spotOf(standS, "rFoot") };
  const staySpots: Partial<Record<FootContact, Point>> = {};
  for (const f of stays) staySpots[f] = standSpots[f];
  const k = seconds / 1.3;
  const tStill = 0.22 * k, tDip = 0.5 * k, tLift = 0.64 * k, tOver = 0.92 * k, tSettle = 1.12 * k;
  // ANTICIPATION: the knees give (the hips dip), the arms and chest go a little the OTHER way, the hips lean back.
  const counter = lerpPose(rest, fig.pose, -0.15);
  const dipHip = { x: startX - 0.05 * (fig.x - startX), y: standS.hip.y + 0.045 * H };
  const dip = placeKey(body, counter, dipHip, g, standSpots);
  const keys: CharacterKey[] = [
    { t: 0, pose: rest, x: startX, lift: 0, contacts: FEET, ease: "inOut" },
    { t: tStill, pose: rest, x: startX, lift: 0, contacts: FEET, ease: "inOut" },
    { t: tDip, pose: dip.pose, x: dip.x, lift: dip.lift, contacts: FEET },
  ];
  const overPose = clampPose(lerpPose(rest, fig.pose, 1.08)).pose;
  const overHip = { x: drawnS.hip.x + 0.06 * (drawnS.hip.x - standS.hip.x), y: drawnS.hip.y + 0.012 * H };
  if (!down.length) {
    // Nothing on the floor in the drawing (it is in the air): a jump — push straight up off both feet, then into it.
    keys.push({ t: tLift, pose: { ...lerpPose(counter, fig.pose, 0.3), lHip: rest.lHip, rHip: rest.rHip, lKnee: rest.lKnee, rKnee: rest.rKnee }, x: startX, lift: 0.05 * H, contacts: [], liftEase: "out" });
    keys.push({ t: tOver, pose: overPose, x: fig.x, lift: fig.lift * 1.06, contacts: [], ease: "inOut" });
  } else {
    // The stepping foot lifts STRAIGHT UP from where it stands, then goes to its drawn spot in the air.
    if (steps.length) {
      const swing: Partial<Record<FootContact, Point>> = { ...staySpots };
      for (const f of steps) swing[f] = { x: standS[f].x, y: g - 0.09 * H };
      const up = placeKey(body, lerpPose(counter, fig.pose, 0.3), dipHip, g, swing);
      keys.push({ t: tLift, pose: up.pose, x: up.x, lift: up.lift, contacts: stays });
    }
    const over: Partial<Record<FootContact, Point>> = { ...staySpots };
    for (const f of steps) if (down.includes(f)) over[f] = { x: drawnS[f].x, y: g - 0.05 * H };
    const ov = placeKey(body, overPose, overHip, g, over);
    keys.push({ t: tOver, pose: ov.pose, x: ov.x, lift: ov.lift, contacts: stays, ease: "inOut" });
  }
  keys.push({ t: tSettle, pose: fig.pose, x: fig.x, lift: fig.lift, contacts: down, ease: "inOut" });
  keys.push({ t: seconds, pose: fig.pose, x: fig.x, lift: fig.lift, contacts: down });
  return { id: "drawing-comes-true", title: "My drawing comes true", durationSec: seconds, groundY: g, characters: [character(fig, keys)], marks: { "drawn.comeTrue1.dip": tDip, "drawn.comeTrue1.pose": tSettle } };
}

// ---- Item 3: finish my animation ----------------------------------------------------------------------------------
export const FINISH_CHOICES: readonly { id: string; label: string }[] = [
  { id: "keepGoing", label: "Keep going (what I started)" },
  { id: "walkOff", label: "Walk off" },
  { id: "runOff", label: "Run off" },
  { id: "jump", label: "Jump" },
  { id: "punch", label: "Punch" },
  { id: "wave", label: "Wave" },
  { id: "sit", label: "Sit down" },
];

// Starts EXACTLY in the drawn pose (the first picture is the drawing) and FLOWS ON into the chosen move: the move is
// JOINED where it looks most like the drawing (a drawn stride joins the walk mid-stride, a drawn wind-up joins the punch
// at its wind-up) instead of going back to a stand and starting from still — no stop, no frozen beat (Arthur: smooth
// flow, never hold-then-snap). A foot that is down in the drawing and in the joined pose stays planted on its drawn spot
// (the move is shifted so it lands there: no slide, no stretch); a foot that must go somewhere else is lifted on the way.
// Facing the viewer and going sideways: settle into the front stand, then the view switches in an instant.
// Walk/run off go the way the figure faces (facing the viewer: toward the nearer edge) until it is off the page.
const JOIN_WINDOW = 1; // seconds of the move the drawing may join (later keys are the move's own business)
const poseKeys = (p: PoseAngles) => Object.keys(p) as (keyof PoseAngles)[];
const poseGap = (a: PoseAngles, b: PoseAngles) => {
  const d = poseKeys(a).map((k) => Math.abs(wrap(a[k] - b[k])));
  return { mean: d.reduce((s, v) => s + v, 0) / d.length, max: Math.max(...d) };
};
// previous: the drawings before the last one, oldest first — with their frame numbers ({ frame, fig } or { start, fig })
// for the true speed; bare figures are taken as one picture apart.
export type FinishOptions = { stageWidth?: number; previous?: readonly ({ frame: number; fig: ReadFigure } | { start: number; fig: ReadFigure } | ReadFigure)[]; fps?: number };
const previousFrames = (fig: ReadFigure, list: FinishOptions["previous"] = []) => {
  const out = list.map((p, i) => ("fig" in p ? { frame: "frame" in p ? p.frame : p.start, fig: p.fig } : { frame: i, fig: p }));
  return out.every((p, i) => "fig" in list[i]) ? out : [...out, { frame: out.length, fig }];
};
export function finishScene(fig: ReadFigure, choiceId: string, o: FinishOptions = {}): Scene {
  if (choiceId === "keepGoing") return keepGoingScene(fig, o);
  return finishMove(fig, choiceId, o.stageWidth ?? 1920);
}
function finishMove(fig: ReadFigure, choiceId: string, stageWidth: number, towards?: Facing): Scene {
  const g = fig.groundY, H = fig.height;
  const sideMove = choiceId !== "wave";
  const side: Facing = fig.facing !== "front" ? fig.facing : towards ?? (fig.x > stageWidth / 2 ? "right" : "left");
  const facing: Facing = sideMove ? side : fig.facing;
  const switching = facing !== fig.facing;
  const drawnS = skeletonOf(fig, fig.pose, g, fig.lift);
  const down = feetDown(drawnS, g, H);
  const reach = Math.max(H, side === "right" ? stageWidth - fig.x : fig.x) + 1.4 * H;
  const action = choiceId === "walkOff" ? { move: "walk", params: { distance: reach } }
    : choiceId === "runOff" ? { move: "run", params: { distance: reach } }
    : choiceId === "jump" ? { move: "jump", params: { distance: 0.35 * H } }
    : choiceId === "punch" ? { move: "punch", params: { distance: 0.75 * H, technique: "straight" } }
    : choiceId === "wave" ? { move: "wave", params: { times: 3 } }
    : choiceId === "sit" ? { move: "sit", params: { seconds: 1.6 } }
    : undefined;
  if (!action) throw new Error(`Unknown finish choice: ${choiceId}`);
  const offPage = choiceId === "walkOff" || choiceId === "runOff";
  const planned = planToScene({ id: "finish", title: "Finish", height: H, groundY: g, stageWidth, characters: [{ id: "drawn", x: fig.x, facing, look: fig.style, actions: [action, ...(offPage ? [] : [{ move: "stand", params: { seconds: 0.6 } }])] }] }, LIBRARY);
  const plan = planned.characters[0].keys;
  // JOIN: the key in the move's first second that is nearest the drawn pose (the move's start, a stand, if nothing is
  // clearly nearer). Turning to the side first always starts the move from its start.
  let j = 0;
  if (!switching) {
    const start = poseGap(fig.pose, plan[0].pose).mean;
    let best = start;
    plan.forEach((key, i) => {
      if (key.minFps || key.t > Math.min(JOIN_WINDOW, 0.6 * planned.durationSec)) return;
      const gap = poseGap(fig.pose, key.pose).mean;
      if (gap < best - 5) { best = gap; j = i; }
    });
  }
  const joined = plan[j], tJoin = joined.t;
  const joinedS = skeletonOf(fig, joined.pose, g, joined.lift ?? 0, joined.x, facing);
  // The planted foot: down in the drawing and in the joined pose, the one most under the body. The move is shifted
  // sideways so that foot stays exactly where it was drawn.
  const shared = down.filter((f) => switching || (joined.contacts ?? []).includes(f) || g - joinedS[f].y <= 0.02 * H);
  const anchor = shared.slice().sort((a, b) => Math.abs(drawnS[a].x - fig.x) - Math.abs(drawnS[b].x - fig.x))[0];
  const shift = anchor && !switching ? drawnS[anchor].x - joinedS[anchor].x : 0;
  const endX = joined.x + shift;
  // A longer step for a bigger change of pose; a foot that must go somewhere else is lifted half way.
  const change = poseGap(fig.pose, switching ? STAND_FRONT : joined.pose).max;
  const T = j > 0 ? Math.min(0.5, Math.max(0.15, 0.12 + change / 450)) : Math.min(0.6, Math.max(0.3, 0.25 + change / 400));
  const mid = clampPose(lerpPose(fig.pose, switching ? STAND_FRONT : joined.pose, 0.55)).pose;
  const stay: FootContact[] = anchor ? [anchor] : [];
  for (const f of FEET.filter((foot) => foot !== anchor)) {
    const target = switching ? undefined : { x: joinedS[f].x + shift, y: joinedS[f].y };
    if (down.includes(f) && target && dist(drawnS[f], target) < 0.03 * H && g - target.y <= 0.02 * H) { stay.push(f); continue; }
    if (!down.includes(f) && fig.lift > 0) continue;
    const s = f === "lFoot" ? "l" : "r";
    mid[`${s}Hip`] += 12;
    mid[`${s}Knee`] += 30;
  }
  // Joined mid-move: "smooth" timing so it flows straight through into the move; from a stand: ease in and out.
  const flow = j > 0 ? {} : { ease: "inOut" as const, xEase: "inOut" as const, liftEase: "inOut" as const };
  const keys: CharacterKey[] = [
    { t: 0, pose: fig.pose, x: fig.x, lift: fig.lift, contacts: stay, ...flow },
    { t: T * 0.5, pose: clampPose(mid).pose, x: (fig.x + endX) / 2, lift: (fig.lift + (joined.lift ?? 0)) * 0.45, contacts: stay, ...(j > 0 ? {} : { ease: "inOut" as const, xEase: "inOut" as const }) },
  ];
  if (switching) keys.push({ t: T - 0.02, pose: STAND_FRONT, x: endX, lift: 0, contacts: FEET, ease: "inOut" });
  // (Every move key says its view: the scene's figure starts in the drawn one.)
  const moveKeys = plan.slice(j).map((key) => ({ ...key, t: key.t - tJoin + T, x: key.x + shift, facing: key.facing ?? facing }));
  const marks: Record<string, number> = {};
  for (const [name, t] of Object.entries(planned.marks ?? {})) if (t >= tJoin - 1e-6) marks[name] = t - tJoin + T;
  return { id: `finish-${choiceId}`, title: `Finish: ${FINISH_CHOICES.find((c) => c.id === choiceId)?.label ?? choiceId}`, durationSec: planned.durationSec - tJoin + T, groundY: g, characters: [{ ...character(fig, [...keys, ...moveKeys], fig.facing) }], marks };
}

// KEEP GOING (Arthur: "you're halfway done, you gave up, now you want this AI to help you"): the default finish reads
// where the animation already is from the last few drawn frames and CARRIES ON with it — moving sideways fast keeps
// running that way off the page, slower keeps walking; going up finishes the jump (it rises to the top on a real
// gravity arc, falls, lands with a dip and stands); an arm being thrown forward finishes the punch and recovers;
// anything else settles into a stand with a small follow-through (the parts keep going the way they were going a
// little, then ease into the stand — feet stay planted where they were drawn). Starts exactly at the last drawn pose.
// FINISHING SOMEONE'S ANIMATION (Arthur: "90% of animations start on the ground"; "the air turned into a ground for
// him"): THE FLOOR comes from the WHOLE animation — where the feet were when the figure stood (the lowest feet of all
// the drawn frames), never the feet of an airborne last picture. Only one drawing and it is clearly in the air (knees
// up, feet tucked near the hips): it is a hop above a floor a hop's height below. NO LEVITATING: a figure above the
// floor comes down with gravity, lands with a dip and stands — never stands, walks or runs in the air. Going up, at
// the top or coming down = a hop/jump, finished as one (a sideways hop keeps its drift until it lands). Run/walk only
// when the hips move sideways STEADILY over several drawings while the figure is on the floor — never from one move.
type Reading = { kind: "run" | "walk" | "jump" | "punch" | "settle"; dir: Facing; vx: number; vy: number; ref?: ReadFigure; floor: number };
const HOP = 0.35; // a hop's height (x the figure's height) — the floor under a lone drawing that is clearly in the air
// Knees above the hips and both feet tucked up near hip height: a body that cannot be standing (a crouch or squat
// keeps its feet well below the hips).
export function looksAirborne(fig: ReadFigure) {
  const j = fig.joints, thigh = PROPORTIONS.thigh * fig.height;
  return (["l", "r"] as const).every((s) => j[`${s}Knee`].y < j.hip.y && j[`${s}Foot`].y - j.hip.y < 0.6 * thigh);
}
// The floor of the animation: the lowest feet of every drawn frame (a lone airborne drawing: a hop below it).
export function animationFloor(fig: ReadFigure, previous: FinishOptions["previous"] = []) {
  const others = previousFrames(fig, previous).filter((p) => p.fig !== fig);
  if (!others.length && looksAirborne(fig)) return fig.groundY + HOP * fig.height;
  return Math.max(fig.groundY, ...others.map((p) => p.fig.groundY));
}
export function readKeepGoing(fig: ReadFigure, o: FinishOptions = {}): Reading {
  const fps = o.fps ?? 12, H = fig.height;
  const prev = previousFrames(fig, o.previous).sort((a, b) => a.frame - b.frame);
  const floor = animationFloor(fig, o.previous);
  const same = prev.find((p) => p.fig === fig);
  const lastFrame = same ? same.frame : prev.length ? prev[prev.length - 1].frame + 1 : 0;
  const window = Math.max(2, Math.round(0.5 * fps));
  const ref = prev.find((p) => p.frame < lastFrame && lastFrame - p.frame <= window);
  const facingDir: Facing = fig.facing === "front" ? (fig.x > (o.stageWidth ?? 1920) / 2 ? "right" : "left") : fig.facing;
  const up = (p: ReadFigure) => floor - p.groundY; // how far its lowest foot is above the floor
  const inAir = up(fig) > 0.03 * H;
  if (!ref) return { kind: inAir ? "jump" : "settle", dir: facingDir, vx: 0, vy: 0, floor };
  const dt = (lastFrame - ref.frame) / fps;
  const vx = (fig.joints.hip.x - ref.fig.joints.hip.x) / dt, vy = (fig.joints.hip.y - ref.fig.joints.hip.y) / dt;
  const dir: Facing = Math.abs(vx) > 0.05 * H ? (vx > 0 ? "right" : "left") : facingDir;
  const rising = vy < -0.3 * H && ref.fig.joints.hip.y - fig.joints.hip.y > 0.03 * H;
  // Up in the air (going up, at the top or coming down) or taking off: a hop — never a run.
  if (inAir || rising) return { kind: "jump", dir, vx, vy, ref: ref.fig, floor };
  // Steady sideways travel ON THE FLOOR over several drawings (every step the same way, every drawing near the floor).
  const recent = prev.filter((p) => p.frame >= ref.frame && p.frame < lastFrame && p.fig !== fig).map((p) => p.fig).concat(fig);
  const steps = recent.slice(1).map((p, i) => p.joints.hip.x - recent[i].joints.hip.x);
  const steady = steps.length >= 2 && steps.every((d) => Math.sign(d) === Math.sign(vx) && Math.abs(d) > 0.01 * H) && recent.every((p) => up(p) <= 0.15 * H);
  if (steady && Math.abs(vx) >= 1.3 * H) return { kind: "run", dir, vx, vy, ref: ref.fig, floor };
  if (steady && Math.abs(vx) >= 0.2 * H) return { kind: "walk", dir, vx, vy, ref: ref.fig, floor };
  const f = facingDir === "left" ? -1 : 1;
  const reach = (p: ReadFigure, s: "l" | "r") => (p.joints[`${s}Hand`].x - p.joints.neck.x) * f;
  if (fig.facing !== "front" && (["l", "r"] as const).some((s) => reach(fig, s) - reach(ref.fig, s) >= 0.12 * H && reach(fig, s) >= 0.2 * H)) return { kind: "punch", dir, vx, vy, ref: ref.fig, floor };
  return { kind: "settle", dir, vx, vy, ref: ref.fig, floor };
}
function keepGoingScene(fig: ReadFigure, o: FinishOptions): Scene {
  const stageWidth = o.stageWidth ?? 1920, H = fig.height;
  const r = readKeepGoing(fig, o);
  const named = (scene: Scene): Scene => ({ ...scene, id: "finish-keepGoing", title: "Finish: Keep going" });
  if (r.kind === "run" || r.kind === "walk") return named(finishMove(fig, r.kind === "run" ? "runOff" : "walkOff", stageWidth, r.dir));
  if (r.kind === "punch") return named(finishMove(fig, "punch", stageWidth));
  const rest = restFor(fig.facing), body: Body = { height: H, style: fig.style, facing: fig.facing };
  const floor = r.floor;
  if (r.kind === "jump") {
    // A real arc: up at the speed it was going, gravity (about 5.6 heights per second per second) brings it down.
    // Already at the top or coming down (no NO LEVITATING): it falls from where it is, at the speed it was falling.
    const G = 5.6 * H, L0 = fig.lift + (floor - fig.groundY), vUp = -r.vy, v0 = Math.max(0, vUp), vDown = Math.max(0, r.vy);
    // (The HIPS fly the arc — the legs tucking up must not pull the body down.)
    const vx = r.vx, tr = v0 / G;
    const air = clampPose({ ...lerpPose(fig.pose, rest, 0.4), lKnee: 40, rKnee: 50 }).pose;
    const landPose = clampPose({ ...rest, lKnee: 20, rKnee: 20, lHip: rest.lHip + 10, rHip: rest.rHip + 10 }).pose;
    const startHipY = skeletonOf(fig, fig.pose, floor, L0).hip.y, apexHipY = startHipY - (v0 * v0) / (2 * G);
    const airS = forwardKinematics(air, fig.facing, { x: fig.x + vx * tr, y: apexHipY }, H, fig.style.headSize, fig.style.neck === true);
    const apex = Math.max(0, floor - lowestY(airS, HEAD_RADIUS[fig.style.headSize] * H));
    const landHipY = skeletonOf(fig, landPose, floor, 0).hip.y;
    const drop = Math.max(0, landHipY - apexHipY);
    const tf = Math.max(1 / 24, (Math.sqrt(vDown * vDown + 2 * G * drop) - vDown) / G);
    const xLand = fig.x + vx * (tr + tf);
    const landS = skeletonOf(fig, landPose, floor, 0, xLand);
    const spots: Partial<Record<FootContact, Point>> = { lFoot: { x: landS.lFoot.x, y: floor }, rFoot: { x: landS.rFoot.x, y: floor } };
    const tl = tr + tf;
    const dip = placeKey(body, clampPose(lerpPose(landPose, rest, -0.3)).pose, { x: xLand + 0.02 * vx * 0.2, y: landS.hip.y + 0.08 * H }, floor, spots);
    const stand = placeKey(body, rest, { x: xLand, y: landS.hip.y - 0.01 * H }, floor, spots);
    const keys: CharacterKey[] = [
      { t: 0, pose: fig.pose, x: fig.x, lift: L0, contacts: [], liftEase: tr > 0.02 ? "out" : "in", xEase: "linear" },
      ...(tr > 0.02 ? [{ t: tr, pose: air, x: fig.x + vx * tr, lift: apex, contacts: [] as FootContact[], liftEase: "in" as const, xEase: "linear" as const }] : []),
      { t: tl, pose: landPose, x: xLand, lift: 0, contacts: FEET },
      { t: tl + 0.14, pose: dip.pose, x: dip.x, lift: dip.lift, contacts: FEET, ease: "inOut" },
      { t: tl + 0.6, pose: stand.pose, x: stand.x, lift: stand.lift, contacts: FEET },
      { t: tl + 0.9, pose: stand.pose, x: stand.x, lift: stand.lift, contacts: FEET },
    ];
    return { id: "finish-keepGoing", title: "Finish: Keep going", durationSec: tl + 0.9, groundY: floor, characters: [character(fig, keys)], marks: { "drawn.keepGoing1.land": tl } };
  }
  // SETTLE: a small follow-through the way the parts were going (the upper body only), then ease into a stand.
  const g = fig.groundY, drawnS = skeletonOf(fig, fig.pose, g, fig.lift), down = feetDown(drawnS, g, H);
  const spots: Partial<Record<FootContact, Point>> = {};
  for (const f of down) spots[f] = { x: drawnS[f].x, y: Math.min(g, drawnS[f].y) };
  const follow = { ...fig.pose };
  if (r.ref) for (const k of ["lean", "head", "lShoulder", "rShoulder", "lElbow", "rElbow"] as const) follow[k] += 0.3 * wrap(fig.pose[k] - r.ref.pose[k]);
  const fo = placeKey(body, clampPose(follow).pose, drawnS.hip, g, spots);
  // The stand's hips go over the planted feet; a foot that was up comes down onto its standing spot from straight above.
  const rest0 = skeletonOf(fig, rest, g, 0, 0);
  const midX = down.length === 2 ? (spots.lFoot!.x + spots.rFoot!.x) / 2 : down.length === 1 ? spots[down[0]]!.x - rest0[down[0]].x : fig.x;
  const standH = skeletonOf(fig, rest, g, 0, midX).hip;
  const landing: Partial<Record<FootContact, Point>> = { ...spots }, above: Partial<Record<FootContact, Point>> = { ...spots };
  for (const f of FEET) if (!down.includes(f)) { landing[f] = { x: midX + rest0[f].x, y: g }; above[f] = { x: midX + rest0[f].x, y: g - 0.05 * H }; }
  const over = placeKey(body, clampPose(lerpPose(fig.pose, rest, 1.06)).pose, { x: midX, y: standH.y + 0.01 * H }, g, above);
  const stand = placeKey(body, rest, standH, g, landing);
  const keys: CharacterKey[] = [
    { t: 0, pose: fig.pose, x: fig.x, lift: fig.lift, contacts: down },
    { t: 0.22, pose: fo.pose, x: fo.x, lift: fo.lift, contacts: down, ease: "inOut" },
    { t: 0.75, pose: over.pose, x: over.x, lift: over.lift, contacts: down, ease: "inOut" },
    { t: 1.05, pose: stand.pose, x: stand.x, lift: stand.lift, contacts: FEET },
    { t: 1.5, pose: stand.pose, x: stand.x, lift: stand.lift, contacts: FEET },
  ];
  return { id: "finish-keepGoing", title: "Finish: Keep going", durationSec: 1.5, groundY: g, characters: [character(fig, keys)] };
}

// ---- Item 4: clean up my animation ---------------------------------------------------------------------------------
// The SAME poses at the SAME frames, drawn clean: one facing (the most common) and one steady size (the middle of the
// drawn sizes) for the whole run, so the figure never grows, shrinks or flips; the hip path is only smoothed where it
// wobbles a hair (under 2% of the height) — never where it really moves; the feet stand on one floor and a foot that
// stays down between two drawn frames is planted (no sliding). Skipped frames are in-betweened by the engine.
// The look is the user's own (color, line thickness, solid or hollow head) — only the lines get neat.
type DrawnKey = { frame: number; fig: ReadFigure };
type CleanRun = { frames: number[]; facing: Facing; height: number; style: CharacterStyle; figs: ReadFigure[]; floor: number; lifts: number[]; xs: number[] };
function cleanRun(keys: readonly DrawnKey[], smoothX = true): CleanRun {
  if (!keys.length) throw new Error("needs at least one drawn frame");
  const sorted = keys.slice().sort((a, b) => a.frame - b.frame);
  const count = new Map<Facing, number>();
  for (const k of sorted) count.set(k.fig.facing, (count.get(k.fig.facing) ?? 0) + 1);
  const facing = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const height = median(sorted.map((k) => k.fig.height));
  const first = sorted[0].fig;
  const look: DrawnLook = { color: first.style.color, thickness: median(sorted.map((k) => k.fig.style.thickness)), headFilled: first.style.headFilled, headRadius: HEAD_RADIUS[first.style.headSize] * height + (first.style.neck ? 0.06 * height : 0) };
  const figs = sorted.map((k) => readDrawnFigure(k.fig.joints, look, { facing, height }));
  const style = { ...figs[0].style, headSize: first.style.headSize, neck: first.style.neck === true };
  for (const f of figs) f.style = style;
  // The floor: where the body's lowest point is in the frames that stand on it (the lower quarter of the drawn ones).
  const radius = HEAD_RADIUS[style.headSize] * height;
  const own = figs.map((f) => { const s = forwardKinematics(f.pose, facing, { x: 0, y: 0 }, height, style.headSize, style.neck === true); return f.joints.hip.y + lowestY(s, radius); });
  const sortedOwn = own.slice().sort((a, b) => a - b);
  const floor = sortedOwn[Math.min(sortedOwn.length - 1, Math.floor(sortedOwn.length * 0.75))];
  // WHAT POSE IS THIS? (poseFix.ts; clean-up and make-better both come through here) each neat drawing is named by the
  // nearest passed pose; a sloppy stand or crouch is made proper (feet where drawn, body over them); action poses,
  // moving joints and unclear drawings stay exactly as drawn.
  const drawn = figs.slice();
  drawn.forEach((f, i) => { const r = fixPose(f, { prev: drawn[i - 1], next: drawn[i + 1], floor, around: drawn }); if (r.changed) { figs[i] = r.fig; own[i] = r.fig.joints.hip.y + lowestY(forwardKinematics(r.fig.pose, facing, { x: 0, y: 0 }, height, style.headSize, style.neck === true), radius); } });
  const lifts = own.map((y) => { const l = floor - y; return l < 0.02 * height ? 0 : l; });
  // The hip path: a wobble of a hair off the line through its neighbours is halved; real moves are kept.
  const frames = sorted.map((k) => k.frame);
  const raw = figs.map((f) => f.x);
  const xs = raw.map((x, i) => {
    if (i === 0 || i === raw.length - 1) return x;
    const a = frames[i - 1], b = frames[i + 1], w = (frames[i] - a) / Math.max(1e-9, b - a);
    const line = raw[i - 1] + (raw[i + 1] - raw[i - 1]) * w;
    return smoothX && Math.abs(x - line) < 0.02 * height ? (x + line) / 2 : x;
  });
  return { frames, facing, height, style, figs, floor, lifts, xs };
}
// A foot on the floor in this drawn frame and on (nearly) the same spot in the frame before or after is planted.
function plantedFeet(run: CleanRun, poses: readonly PoseAngles[]) {
  const skels = poses.map((pose, i) => skeletonOf({ ...run.figs[i], height: run.height }, pose, run.floor, run.lifts[i], run.xs[i], run.facing));
  return poses.map((_, i) => FEET.filter((foot) => {
    const onFloor = (k: number) => run.lifts[k] === 0 && run.floor - skels[k][foot].y <= 0.02 * run.height;
    if (!onFloor(i)) return false;
    const near = (k: number) => k >= 0 && k < poses.length && onFloor(k) && Math.abs(skels[k][foot].x - skels[i][foot].x) < 0.03 * run.height;
    return near(i - 1) || near(i + 1);
  }));
}
const runCharacter = (run: CleanRun, keys: CharacterKey[]) => ({ id: "drawn", name: "Drawn figure", facing: run.facing, height: run.height, style: run.style, keys });

// CLEAN-UP IS STRICTLY IN PLACE (Arthur: "should ONLY fix the drawings of the animation. Should not add frames or
// anything like that"): the same frame count, every drawing redrawn neat ON ITS OWN FRAME with ITS OWN pose and spot
// (one steady size and facing, one floor, the user's look); a frame with no drawing of its own keeps showing the
// drawing before it (an exposure), so holds stay holds (identical pictures) and nothing is in-betweened, re-timed,
// smoothed or planted differently from what they drew.
export function cleanUpScene(keys: readonly DrawnKey[], o: { fps: number; frameCount: number }): Scene {
  if (!keys.length) throw new Error("cleanUpScene needs at least one drawn frame");
  const run = cleanRun(keys, false);
  const charKeys: CharacterKey[] = [];
  run.figs.forEach((f, i) => {
    const key = { pose: f.pose, x: run.xs[i], lift: run.lifts[i], contacts: [] as FootContact[], ease: "linear" as const };
    charKeys.push({ t: run.frames[i] / o.fps, ...key });
    // (Held until the picture before the next drawing: the step between them is under a hair of a picture.)
    const next = i + 1 < run.frames.length ? run.frames[i + 1] : o.frameCount;
    if (next - run.frames[i] > 1) charKeys.push({ t: (next - 1) / o.fps + (i + 1 < run.frames.length ? 0.001 / o.fps : 0), ...key });
  });
  const durationSec = Math.max(0, (o.frameCount - 1) / o.fps);
  return { id: "clean-up", title: "Cleaned-up animation", durationSec, groundY: run.floor, characters: [runCharacter(run, charKeys)] };
}

// ---- Item 5: make my animation better (neater drawing AND better motion) -------------------------------------------
// Everything the clean-up does (neat lines, one steady size and facing, one floor, the user's own look — solid or
// hollow head, color, thickness), and the MOTION gets better too, while keeping what they meant:
// - KEY POSES stay on their frames: the first and last drawing, every turn-around (an arm that goes up and comes back,
//   the top of a jump), every start and end of a hold, every foot landing or lifting — and any drawing the path needs
//   (the motion goes through the poses they drew: an arc stays an arc).
// - JITTER goes: a drawing a few degrees off the smooth line through its neighbours (or a hair off the hip path) is
//   the pencil shaking, not the move — also when it rides on a fast move.
// - SPACING is the engine's: the other drawings are in-betweened again with even, smooth spacing that eases into and
//   out of every stop (no bunched pictures then a jump).
// - Planted feet stay put (no sliding); the same frame count, so it stays in time with everything else.
const JITTER_DEG = 7; // a drawing this far off the smooth line through its neighbours is shaking, not motion
const JITTER_PART = 0.02; // the same for the hip path (x the height)
const PATH_DEG = 12; // a drawing whose pose is further than this from the straight in-between is needed for the path
const PATH_PART = 0.04;
// (Round 2's motion pass; "make my animation better" itself — clean up first, then check like an animator — is in
// improveAnimation.ts, which uses this for the motion.)
export { improveAnimationScene, improveAnimation } from "./improveAnimation.ts";
export function improveMotionScene(keys: readonly DrawnKey[], o: { fps: number; frameCount: number }): Scene {
  if (!keys.length) throw new Error("improveMotionScene needs at least one drawn frame");
  const run = cleanRun(keys);
  const n = run.figs.length, H = run.height;
  // KEY POSES ONLY (drawn pose to pose, each held a few pictures — choppy): the ANIMATION is made, not just the lines.
  const held = keyPoseRuns(run, o.fps, o.frameCount);
  if (held.choppy) return { id: "make-better", title: "My animation, made better", durationSec: Math.max(0, (o.frameCount - 1) / o.fps), groundY: run.floor, characters: [runCharacter(run, poseToPoseKeys(run, held.runs, o.fps, o.frameCount))] };
  const names = poseKeys(run.figs[0].pose);
  // Channels: every angle (unwrapped so a full turn doesn't jump), the hip x, the lift.
  const ch: number[][] = [...names.map((k) => unwrapAngles(run.figs.map((f) => f.pose[k]))), run.xs.slice(), run.lifts.slice()];
  const jitter = [...names.map(() => JITTER_DEG), JITTER_PART * H, JITTER_PART * H];
  const pathUnit = [...names.map(() => PATH_DEG), PATH_PART * H, PATH_PART * H];
  const lineAt = (c: number[], i: number, a: number, b: number) => c[a] + (c[b] - c[a]) * ((run.frames[i] - run.frames[a]) / Math.max(1e-9, run.frames[b] - run.frames[a]));
  // 1. JITTER: a drawing a few degrees off the smooth line through its neighbours is the pencil shaking (also when
  // it rides on a fast move) — it is pulled most of the way onto that line. A real bend in the motion (more than
  // that) and the drawings of a hold are left alone. Three gentle passes, all drawings at once each time.
  const holding = (c: number[], i: number) => Math.abs(c[i] - c[i - 1]) < 1e-6 || Math.abs(c[i + 1] - c[i]) < 1e-6;
  for (let pass = 0; pass < 2; pass++) ch.forEach((c, k) => {
    const next = c.slice();
    for (let i = 1; i < n - 1; i++) {
      if (holding(c, i)) continue;
      const off = c[i] - lineAt(c, i, i - 1, i + 1);
      if (Math.abs(off) < jitter[k]) next[i] = c[i] - 0.5 * off * (1 - Math.abs(off) / jitter[k]);
    }
    ch[k] = next;
  });
  // (A lift too small to be a jump is standing on the floor.)
  ch[ch.length - 1] = ch[ch.length - 1].map((l) => (l < 0.02 * H ? 0 : l));
  const poseAt = (i: number) => clampPose(Object.fromEntries(names.map((k, c) => [k, ch[c][i]])) as PoseAngles).pose;
  const poses = Array.from({ length: n }, (_, i) => poseAt(i));
  run.xs = ch[ch.length - 2];
  run.lifts = ch[ch.length - 1];
  const contacts = plantedFeet(run, poses);
  // 2. KEY POSES.
  // (A change under half a degree, or a few thousandths of the height, is no change: reading the clicks isn't exact.)
  const deadband = [...names.map(() => 0.5), 0.003 * H, 0.003 * H];
  const sgn = (k: number, v: number) => (Math.abs(v) < deadband[k] ? 0 : Math.sign(v));
  const keep = new Set<number>([0, n - 1]);
  for (let i = 1; i < n - 1; i++) {
    const turns = ch.some((c, k) => {
      const a = sgn(k, c[i] - c[i - 1]), b = sgn(k, c[i + 1] - c[i]);
      return a * b < 0 || (a === 0) !== (b === 0);
    });
    const feet = contacts[i].join() !== contacts[i - 1].join() || contacts[i].join() !== contacts[i + 1].join();
    if (turns || feet) keep.add(i);
  }
  // ... and every drawing the path needs: one far from the straight in-between of the kept poses around it (in pose
  // space, not in time — uneven timing is the spacing the engine fixes, a bend in the path is what they drew).
  for (let changed = true; changed;) {
    changed = false;
    const kept = [...keep].sort((a, b) => a - b);
    for (let s = 0; s < kept.length - 1; s++) {
      const a = kept[s], b = kept[s + 1];
      let worst = 1, worstAt = -1;
      for (let i = a + 1; i < b; i++) {
        // Distance from this pose to the segment a..b, each channel in its own unit.
        const d = ch.map((c, k) => (c[b] - c[a]) / pathUnit[k]), p = ch.map((c, k) => (c[i] - c[a]) / pathUnit[k]);
        const dd = d.reduce((sum, v) => sum + v * v, 0);
        const u = dd > 0 ? Math.max(0, Math.min(1, p.reduce((sum, v, k) => sum + v * d[k], 0) / dd)) : 0;
        const off = Math.sqrt(p.reduce((sum, v, k) => sum + (v - u * d[k]) ** 2, 0));
        if (off > worst) { worst = off; worstAt = i; }
      }
      if (worstAt >= 0) { keep.add(worstAt); changed = true; }
    }
  }
  const charKeys: CharacterKey[] = [...keep].sort((a, b) => a - b).map((i) => ({ t: run.frames[i] / o.fps, pose: poses[i], x: run.xs[i], lift: run.lifts[i], contacts: contacts[i] }));
  const durationSec = Math.max(0, (o.frameCount - 1) / o.fps);
  return { id: "make-better", title: "My animation, made better", durationSec, groundY: run.floor, characters: [runCharacter(run, charKeys)] };
}

// MAKE MY ANIMATION BETTER FROM KEY POSES (Arthur: "it just corrects my drawing, not the actual animation"). Each
// picture shows the latest drawing at or before it; a run of pictures showing the same pose is ONE key pose held.
// Mostly held key poses (runs of 2+ pictures, at most one run per two pictures) = a pose-to-pose animation to bring to life.
type HeldRun = { s: number; e: number; k: number };
function keyPoseRuns(run: CleanRun, fps: number, frameCount: number): { runs: HeldRun[]; choppy: boolean } {
  const H = run.height, n = run.figs.length;
  const runs: HeldRun[] = [];
  const same = (a: number, b: number) => a === b || (poseGap(run.figs[a].pose, run.figs[b].pose).max < 1.5 && Math.abs(run.xs[a] - run.xs[b]) < 0.004 * H && Math.abs(run.lifts[a] - run.lifts[b]) < 0.004 * H);
  let k = 0;
  for (let f = 0; f < frameCount; f++) {
    while (k + 1 < n && run.frames[k + 1] <= f) k++;
    const last = runs[runs.length - 1];
    if (last && same(last.k, k)) last.e = f; else runs.push({ s: f, e: f, k });
  }
  void fps;
  return { runs, choppy: runs.length >= 2 && runs.some((r) => r.e > r.s) && runs.length <= 0.5 * frameCount };
}
// Pose to pose with the fundamentals: every drawn key pose ARRIVES on the frame it was first drawn (the timing is
// theirs) — with a small OVERSHOOT that SETTLES into it (a landing DIPS: weight) — then holds only until it must
// leave; before a big change an ANTICIPATION (a small move the other way, at a walking pace; a dip before going up);
// the move itself at a jogging pace (a strike — a big fast arm change — at a running pace), angles interpolated so
// limbs swing on arcs. A foot planted in both poses stays on its spot; a foot that must go somewhere else LIFTS on the
// way (a passing key with it raised); planted feet are on their spots in every key (placeKey). A hold of 0.5 s or more
// stays a hold but drifts a hair toward the next pose (a moving hold), so it never freezes dead.
function poseToPoseKeys(run: CleanRun, runs: HeldRun[], fps: number, frameCount: number): CharacterKey[] {
  const H = run.height, floor = run.floor, body: Body = { height: H, style: run.style, facing: run.facing };
  const T = Math.max(0, (frameCount - 1) / fps);
  const R = runs.map((r) => {
    const fig = run.figs[r.k], pose = fig.pose, x = run.xs[r.k], lift = run.lifts[r.k];
    const S = skeletonOf(fig, pose, floor, lift, x, run.facing);
    const down = FEET.filter((f) => lift === 0 && floor - S[f].y <= 0.02 * H);
    const spot: Partial<Record<FootContact, Point>> = {};
    for (const f of down) spot[f] = { x: S[f].x, y: Math.min(floor, S[f].y) };
    return { t: r.s / fps, pose, x, lift, down, spot, fig };
  });
  const out: CharacterKey[] = [];
  const lock: Partial<Record<FootContact, Point>> = {};
  let prev: FootContact[] = [];
  const add = (t: number, pose: PoseAngles, x: number, lift: number, plant: Partial<Record<FootContact, Point>>, dip = 0, swing: Partial<Record<FootContact, Point>> = {}, ease?: CharacterKey["ease"]) => {
    if (out.length && t <= out[out.length - 1].t + 0.004) return;
    const contacts = FEET.filter((f) => plant[f]);
    const targets: Partial<Record<FootContact, Point>> = { ...swing };
    for (const f of FEET) {
      if (!contacts.includes(f)) { delete lock[f]; continue; }
      if (!(prev.includes(f) && lock[f])) lock[f] = plant[f];
      targets[f] = lock[f];
    }
    prev = contacts;
    const nat = skeletonOf(R[0].fig, pose, floor, lift, x, run.facing);
    const k = Object.keys(targets).length ? placeKey(body, pose, { x, y: nat.hip.y + dip }, floor, targets) : { pose: clampPose(pose).pose, x, lift };
    out.push({ t, pose: k.pose, x: k.x, lift: contacts.length || Object.keys(swing).length ? k.lift : lift, contacts, ...(ease ? { ease } : {}) });
  };
  const ARMS: (keyof PoseAngles)[] = ["lShoulder", "rShoulder", "lElbow", "rElbow"];
  add(0, R[0].pose, R[0].x, R[0].lift, R[0].spot);
  let ready = 0;
  for (let i = 0; i < R.length; i++) {
    const A = R[i];
    if (i > 0) {
      const P = R[i - 1];
      const W = (i + 1 < R.length ? R[i + 1].t : T) - A.t;
      const tS = Math.min(0.14, 0.4 * W);
      const landing = P.lift > 0.02 * H && A.lift === 0;
      const over = landing ? A.pose : clampPose(lerpPose(P.pose, A.pose, 1.1)).pose;
      if (tS >= 0.5 / fps) {
        add(A.t, over, A.x + 0.05 * (A.x - P.x), A.lift, A.spot, landing ? 0.06 * H : A.lift === 0 ? 0.01 * H : 0);
        add(A.t + tS, A.pose, A.x, A.lift, A.spot, 0, {}, "inOut");
        ready = A.t + tS;
      } else { add(A.t, A.pose, A.x, A.lift, A.spot); ready = A.t; }
    }
    if (i + 1 >= R.length) { add(T, A.pose, A.x, A.lift, A.spot); break; }
    const B = R[i + 1];
    const gap = poseGap(A.pose, B.pose);
    const c = gap.max + (Math.abs(B.x - A.x) / H) * 90 + (Math.abs(B.lift - A.lift) / H) * 180;
    const strike = Math.max(...ARMS.map((k) => Math.abs(wrap(B.pose[k] - A.pose[k])))) >= 60 && B.lift === 0 && A.lift === 0;
    let M = strike ? Math.min(0.3, Math.max(0.12, 0.1 + c / 1200)) : Math.min(0.45, Math.max(0.14, 0.14 + c / 600));
    let tA = c >= 40 ? Math.min(0.28, 0.1 + c / 900) : 0;
    const room = B.t - ready;
    if (M + tA > 0.9 * room) { const k = (0.9 * room) / (M + tA); M *= k; tA *= k; }
    const D = B.t - M - tA;
    if (D - ready >= 0.4) add(D, clampPose(lerpPose(A.pose, B.pose, 0.04)).pose, A.x + 0.02 * (B.x - A.x), A.lift, A.spot);
    else add(D, A.pose, A.x, A.lift, A.spot);
    const up = B.lift > A.lift + 0.02 * H;
    // (Already crouched — the drawing IS the wind-up: only the arms go the other way and the hips sink a hair more.)
    const deep = Math.max(A.pose.lKnee, A.pose.rKnee) > 60;
    const antic = windUp(A.pose, B.pose, 0.2, deep ? { only: ["lShoulder", "rShoulder", "lElbow", "rElbow"] } : {});
    if (tA > 0) add(D + tA, clampPose(antic).pose, A.x - 0.05 * (B.x - A.x), A.lift, A.spot, up && !deep ? 0.06 * H : A.lift === 0 ? 0.015 * H : 0);
    // A foot on the floor in both poses but somewhere else: it lifts half way (the others stay planted).
    const steps = A.down.filter((f) => B.down.includes(f) && Math.abs(A.spot[f]!.x - B.spot[f]!.x) >= 0.03 * H);
    if (steps.length && M >= 0.06) {
      const plant: Partial<Record<FootContact, Point>> = {};
      for (const f of A.down) if (!steps.includes(f) && B.down.includes(f)) plant[f] = A.spot[f];
      const swing: Partial<Record<FootContact, Point>> = {};
      for (const f of steps) swing[f] = { x: (A.spot[f]!.x + B.spot[f]!.x) / 2, y: floor - 0.08 * H };
      add(B.t - M / 2, clampPose(lerpPose(A.pose, B.pose, 0.5)).pose, (A.x + B.x) / 2, 0, plant, 0, swing);
    }
  }
  return out;
}

export const DRAWING_EFFECTS: readonly { id: string; label: string; needsText?: boolean }[] = [
  { id: "fire", label: "Fire" },
  { id: "splash", label: "Water splash" },
  { id: "lightning", label: "Lightning" },
  { id: "iceMountain", label: "Ice mountain" },
  { id: "smoke", label: "Smoke" },
  { id: "explosion", label: "Explosion (ground)" },
  { id: "airExplosion", label: "Explosion (air)" },
  { id: "text", label: "Text (e.g. BOOM!)", needsText: true },
];

// An effect alone (no figures) at a page-space spot, starting at the scene's first picture (the app puts it on a new
// layer from the current frame). Ground effects (fire, smoke, ice mountain, ground explosion) stand on `groundY`
// (default: the clicked spot); lightning strikes down to the spot; the air explosion and the words are AT the spot.
// `height` = the size of a figure there (the effects' sizes are x this; default 300).
export function effectOnDrawingScene(effectId: string, at: Point, o: { fps: number; groundY?: number; height?: number; text?: string }): Scene & { effects: EffectTrack[]; effectHeight: number } {
  const groundY = o.groundY ?? at.y;
  const height = o.height ?? 300;
  const ground = { x: at.x, y: groundY };
  const spot = { x: at.x, y: at.y };
  const pick = (): [EffectTrack["kind"], number, Point, Record<string, unknown>] => {
    switch (effectId) {
      case "fire": return ["fire", 3, ground, { seed: 3 }];
      case "splash": return ["splash", 1.6, spot, { seed: 3 }];
      case "lightning": return ["lightning", 1.5, spot, { seed: 3 }];
      case "iceMountain": return ["iceSpikes", 3.5, ground, { shape: "mountain", seed: 3 }];
      case "smoke": return ["smoke", 3, ground, { seed: 3 }];
      case "explosion": return ["explosion", EXPLOSION_SECONDS, ground, { seed: 3 }];
      case "airExplosion": return ["explosion", EXPLOSION_SECONDS, spot, { seed: 3, air: true }];
      case "text": return ["text", 3, spot, { text: (o.text ?? "BOOM!").trim() || "BOOM!", style: "pop", rise: 0.2, seed: 2 }];
      default: throw new Error(`Unknown effect: ${effectId}`);
    }
  };
  const [kind, seconds, anchor, params] = pick();
  const effects: EffectTrack[] = [{ kind, start: 0, end: seconds, anchor, params }];
  return { id: `effect-${effectId}`, title: DRAWING_EFFECTS.find((e) => e.id === effectId)?.label ?? effectId, durationSec: seconds, groundY, characters: [], effects, effectHeight: height };
}
