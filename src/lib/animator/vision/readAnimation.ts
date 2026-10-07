// READING SOMEONE'S ANIMATION (SPEC-0017 "50-50", round 4). Arthur: "It has to understand where this animation is
// going. Where is the floor? How big is the stick figure? Maybe it's not a stick figure. He should not levitate."
// Before the engine finishes or improves an animation it reads ALL the drawn frames like an animator would:
//  1. each frame: a stick figure (findStickFigure), an effect drawing (readDrawing: lightning, explosion…), both, or
//     neither (missed);
//  2. LIMB IDENTITY: an arm stays the same arm from frame to frame (never swaps with the other arm), same for legs;
//  3. ONE size (the middle of the drawn sizes) and THE FLOOR = where the figure STOOD (the grounded frames — 90% of
//     animations start on the ground), never the feet of an airborne frame;
//  4. what the figure is doing in each frame (standing, crouch, take-off, up, top, down, landing, walking, running)
//     and, in plain words, where the animation is going next.
import { readDrawnFigure, looksAirborne, type JointPick, type ReadFigure } from "../moves/fromDrawing.ts";
import { PROPORTIONS, type Facing, type Point } from "../rig.ts";
import { readDrawing } from "./drawingKind.ts";
import type { FoundFigure, InkImage, ReadDrawing } from "./types.ts";

export type ReadFrame = { frame: number; img: InkImage }; // frame = 0-based start of each drawn span, oldest first
export type AnimFigure = { frame: number; fig: ReadFigure; found: FoundFigure };
export type Phase = "standing" | "anticipation" | "takeoff" | "rising" | "top" | "falling" | "landing" | "walking" | "running" | "moving" | "unknown";
export type AnimationRead = {
  floor: number; height: number; // page y of the floor (where the figure STOOD); the figure's size
  figures: AnimFigure[]; // limbs matched frame to frame (an arm never swaps with the other arm)
  missed: number[]; // frames where nothing was found: no figure and no effect drawing
  effects: { frame: number; read: ReadDrawing }[]; // frames that are (or also contain) an effect drawing (readDrawing)
  phases: { frame: number; phase: Phase }[]; // what the figure is doing in each drawn frame (frames with a figure)
  going: string; // plain words: "a hop: standing → crouch (anticipation) → legs extended (take-off) → next: up, then down"
  // Which way the body travels across the drawn frames in page x (1 = right, -1 = left, 0 = it barely moves) and how
  // fast (heights per second, never negative). Read from the BODY's middle (head, neck, hip, knees, feet), not the hip
  // alone: a crouch pushes the hips back while the body stays over its feet — that is not going backwards.
  travel?: { dir: -1 | 0 | 1; speed: number };
};

const EFFECT_KINDS = new Set(["explosion", "airExplosion", "fire", "water", "lightning", "ice", "smoke"]);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (v: number[]) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ARMS: [JointPick, JointPick][] = [["lElbow", "rElbow"], ["lHand", "rHand"]];
const LEGS: [JointPick, JointPick][] = [["lKnee", "rKnee"], ["lFoot", "rFoot"]];

// ---- 2. Limb identity ------------------------------------------------------------------------------------------
// How far `next`'s limbs are from `prev`'s (each limb measured from its own root — neck for arms, hip for legs — so
// the body moving across the page doesn't count), as drawn or with the two limbs swapped.
function limbCost(prev: ReadFigure, next: ReadFigure, pairs: [JointPick, JointPick][], root: JointPick, swapped: boolean) {
  const p = prev.joints, n = next.joints;
  const rel = (j: Record<JointPick, Point>, k: JointPick) => ({ x: j[k].x - j[root].x, y: j[k].y - j[root].y });
  let c = 0;
  for (const [a, b] of pairs) {
    c += dist(rel(p, a), rel(n, swapped ? b : a)) + dist(rel(p, b), rel(n, swapped ? a : b));
  }
  return c;
}
// LIMB IDENTITY (Arthur saw arms crossing in Make better): `next`'s arms are swapped (and, separately, its legs) when
// that makes them follow `prev` better — an arm never jumps to the other arm's place between two frames. Front view
// is left alone: there the limb further left on the page IS the left one (readDrawnFigure), so it can't swap.
export function matchLimbs(prev: ReadFigure, next: ReadFigure): ReadFigure {
  if (next.facing === "front" || prev.facing === "front") return next;
  const swapArms = limbCost(prev, next, ARMS, "neck", true) < limbCost(prev, next, ARMS, "neck", false) - 1e-6;
  const swapLegs = limbCost(prev, next, LEGS, "hip", true) < limbCost(prev, next, LEGS, "hip", false) - 1e-6;
  if (!swapArms && !swapLegs) return next;
  const j = { ...next.joints }, pose = { ...next.pose };
  if (swapArms) {
    [j.lElbow, j.lHand, j.rElbow, j.rHand] = [j.rElbow, j.rHand, j.lElbow, j.lHand];
    [pose.lShoulder, pose.rShoulder, pose.lElbow, pose.rElbow] = [pose.rShoulder, pose.lShoulder, pose.rElbow, pose.lElbow];
  }
  if (swapLegs) {
    [j.lKnee, j.lFoot, j.rKnee, j.rFoot] = [j.rKnee, j.rFoot, j.lKnee, j.lFoot];
    [pose.lHip, pose.rHip, pose.lKnee, pose.rKnee] = [pose.rHip, pose.lHip, pose.rKnee, pose.lKnee];
  }
  return { ...next, pose, joints: j };
}

// ---- 1. Each frame -------------------------------------------------------------------------------------------
// A figure counts when the eye is sure enough and it has a figure's proportions (a small head); when the drawing is
// ALSO an effect (lightning, an explosion…), the figure must explain a fair share of the ink to count as well.
function figureIn(read: ReadDrawing): FoundFigure | null {
  const f = read.figure;
  if (!f) return null;
  const j = f.joints, tall = Math.max(1, Math.max(j.lFoot.y, j.rFoot.y) - j.head.y);
  const headR = f.look.headRadius ?? dist(j.head, j.neck) * 0.8;
  if (headR / tall >= 0.25) return null;
  if (read.kind === "stickFigure") return f;
  if (f.explained >= 0.85 && f.confidence >= 0.35) return f; // (it explains all the ink: a scribbly figure, not an effect)
  if (EFFECT_KINDS.has(read.kind)) return f.confidence >= 0.55 && f.explained >= 0.3 ? f : null;
  return f.confidence >= 0.35 ? f : null;
}

// The picture with the found figure's lines (and head) rubbed out — what is left is the rest of the drawing.
function withoutFigure(img: InkImage, fig: FoundFigure): InkImage {
  const data = new Uint8ClampedArray(img.data);
  const pad = (fig.look.thickness * 0.5 + 4) * img.scale;
  const px = (q: Point) => ({ x: (q.x - img.x0) * img.scale, y: (q.y - img.y0) * img.scale });
  const rub = (inside: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(img.height - 1, Math.ceil(y1)); y += 1) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(img.width - 1, Math.ceil(x1)); x += 1) {
      if (inside(x, y)) { const o = (y * img.width + x) * 4; data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = 0; }
    }
  };
  const j = fig.joints;
  for (const [a, b] of BONE_PAIRS) {
    const A = px(j[a]), B = px(j[b]), vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy || 1;
    rub((x, y) => { const u = Math.max(0, Math.min(1, ((x - A.x) * vx + (y - A.y) * vy) / L2)); return Math.hypot(A.x + vx * u - x, A.y + vy * u - y) <= pad; }, Math.min(A.x, B.x) - pad, Math.min(A.y, B.y) - pad, Math.max(A.x, B.x) + pad, Math.max(A.y, B.y) + pad);
  }
  const c = px(j.head), R = (fig.look.headRadius ?? dist(j.head, j.neck)) * img.scale + pad;
  rub((x, y) => Math.hypot(x - c.x, y - c.y) <= R, c.x - R, c.y - R, c.x + R, c.y + R);
  return { ...img, data };
}
const BONE_PAIRS: [JointPick, JointPick][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"], ["neck", "head"]];

// ---- 4. Phases -------------------------------------------------------------------------------------------------
// The legs' stretch: hip-to-foot distance / the leg's full length (standing ≈ 1, a crouch ≈ 0.75 or less).
const legStretch = (f: ReadFigure) => {
  const L = (PROPORTIONS.thigh + PROPORTIONS.shin) * f.height, j = f.joints;
  return (dist(j.hip, j.lFoot) + dist(j.hip, j.rFoot)) / (2 * L);
};
// Which foot is in front (+1 the l foot, -1 the r foot, 0 together) in the way the figure faces.
const frontFoot = (f: ReadFigure, H: number) => {
  const d = (f.joints.lFoot.x - f.joints.rFoot.x) * (f.facing === "left" ? -1 : 1);
  return Math.abs(d) < 0.08 * H ? 0 : Math.sign(d);
};
const AIR: readonly Phase[] = ["rising", "top", "falling"];
// The lowest drawn foot (page y): where the figure's feet are, as drawn.
const footY = (f: ReadFigure) => Math.max(f.joints.lFoot.y, f.joints.rFoot.y);

// Walking / running (read BEFORE limb identity, without trusting which leg the eye called which): frames on (or
// barely off) the floor whose hips travel the same way steadily, the feet apart in most of them. Speed from the
// drawn frame numbers: 1.3 heights a second or more = running.
function travelSpans(figs: ReadFigure[], frames: number[], floor: number, H: number, fps: number): ("walking" | "running" | null)[] {
  const n = figs.length, hipX = figs.map((f) => f.joints.hip.x), up = figs.map((f) => floor - footY(f));
  const travel: ("walking" | "running" | null)[] = new Array(n).fill(null);
  let s = 0;
  while (s < n - 2) {
    let e = s;
    const sign = Math.sign(hipX[s + 1] - hipX[s]);
    while (e + 1 < n && Math.sign(hipX[e + 1] - hipX[e]) === sign && Math.abs(hipX[e + 1] - hipX[e]) > 0.04 * H && up[e + 1] <= 0.25 * H) e += 1;
    if (e - s >= 2 && up[s] <= 0.25 * H) {
      const apart = figs.slice(s, e + 1).filter((f) => Math.abs(f.joints.lFoot.x - f.joints.rFoot.x) > 0.12 * H).length;
      const speed = Math.abs(hipX[e] - hipX[s]) / Math.max(1e-6, (frames[e] - frames[s]) / fps);
      if (apart * 2 >= e - s + 1 && speed >= 0.2 * H) for (let k = s; k <= e; k += 1) travel[k] = speed >= 1.3 * H ? "running" : "walking";
      s = Math.max(e, s + 1);
    } else s += 1;
  }
  return travel;
}
// In a walk or run the legs TAKE TURNS (the drawings of a stride look alike, so the eye can't tell which leg is
// which): the front foot alternates from one feet-apart drawing to the next, and the front arm is the one opposite
// the front leg.
function alternate(f: ReadFigure, wantFront: number, H: number): ReadFigure {
  const j = { ...f.joints }, pose = { ...f.pose };
  if (frontFoot(f, H) === -wantFront) {
    [j.lKnee, j.lFoot, j.rKnee, j.rFoot] = [j.rKnee, j.rFoot, j.lKnee, j.lFoot];
    [pose.lHip, pose.rHip, pose.lKnee, pose.rKnee] = [pose.rHip, pose.lHip, pose.rKnee, pose.lKnee];
  }
  const arm = (j.lHand.x - j.rHand.x) * (f.facing === "left" ? -1 : 1);
  if (Math.abs(arm) > 0.08 * H && Math.sign(arm) === wantFront) {
    [j.lElbow, j.lHand, j.rElbow, j.rHand] = [j.rElbow, j.rHand, j.lElbow, j.lHand];
    [pose.lShoulder, pose.rShoulder, pose.lElbow, pose.rElbow] = [pose.rShoulder, pose.lShoulder, pose.rElbow, pose.lElbow];
  }
  return { ...f, pose, joints: j };
}

function readPhases(figs: ReadFigure[], travel: ("walking" | "running" | null)[], floor: number, H: number): Phase[] {
  const n = figs.length, eps = 0.02 * H;
  const up = figs.map((f) => floor - footY(f));
  const hipY = figs.map((f) => f.joints.hip.y), hipX = figs.map((f) => f.joints.hip.x);
  const stretch = figs.map(legStretch);
  const air = figs.map((f, i) => up[i] > 0.06 * H || (looksAirborne(f) && up[i] > 0.02 * H));
  // Standing reference: the hip height above the floor and the leg stretch of the first upright grounded frame.
  const firstStand = figs.findIndex((f, i) => !air[i] && stretch[i] > 0.88);
  const standHip = firstStand >= 0 ? floor - hipY[firstStand] : (PROPORTIONS.thigh + PROPORTIONS.shin) * H * 0.97;
  const standStretch = firstStand >= 0 ? stretch[firstStand] : 0.97;
  const crouched = (i: number) => stretch[i] < standStretch - 0.1 || floor - hipY[i] < standHip * 0.86;

  const out: Phase[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = i > 0 ? out[i - 1] : undefined;
    if (travel[i]) { out.push(travel[i]!); continue; }
    const vBefore = i > 0 ? hipY[i] - hipY[i - 1] : undefined, vAfter = i + 1 < n ? hipY[i + 1] - hipY[i] : undefined;
    // Take-off: the legs extend after a crouch (the hips go up), still on the floor or just off it.
    if (prev === "anticipation" && vBefore !== undefined && vBefore < -0.04 * H && stretch[i] > stretch[i - 1] + 0.05 && up[i] <= 0.2 * H) { out.push("takeoff"); continue; }
    if (air[i]) {
      if (vBefore !== undefined && vBefore > eps) out.push("falling");
      else if (vAfter !== undefined && vAfter > eps) out.push("top");
      else if ((vBefore !== undefined && vBefore < -eps) || (vAfter !== undefined && vAfter < -eps)) out.push("rising");
      else out.push("top");
      continue;
    }
    // Back on the floor after being in the air: landing (and still landing while the knees stay bent).
    if (prev && (AIR.includes(prev) || prev === "takeoff" && air[i - 1] || (prev === "landing" && crouched(i)))) { out.push("landing"); continue; }
    if (crouched(i)) { out.push(prev === "landing" || prev === "takeoff" ? "landing" : "anticipation"); continue; }
    const upright = stretch[i] > standStretch - 0.1;
    // (Standing up from a landing moves the hips UP — that is still standing; moving = going somewhere.)
    if (i > 0 && Math.abs(hipX[i] - hipX[i - 1]) > 0.06 * H || i > 0 && !upright && Math.abs(hipY[i] - hipY[i - 1]) > 0.06 * H) { out.push("moving"); continue; }
    out.push(upright ? "standing" : "unknown");
  }
  return out;
}

const WORDS: Record<Phase, string> = {
  standing: "standing", anticipation: "crouch (anticipation)", takeoff: "legs extended (take-off)", rising: "going up", top: "at the top",
  falling: "coming down", landing: "landing (knees bend)", walking: "walking", running: "running", moving: "moving", unknown: "something else",
};
const NEXT: Record<Phase, string> = {
  standing: "stays standing", anticipation: "legs extend (take-off), up, then down onto the floor", takeoff: "up, then down onto the floor",
  rising: "up to the top, then down onto the floor", top: "down onto the floor, then a dip to land", falling: "down onto the floor, then a dip to land",
  landing: "settles into a stand on the floor", walking: "keeps walking the same way", running: "keeps running the same way", moving: "settles into a stand", unknown: "settles into a stand",
};

function goingWords(phases: Phase[], effects: AnimationRead["effects"], maxUp: number, H: number): string {
  const seq = phases.filter((p, i) => i === 0 || p !== phases[i - 1]);
  const extra = effects.length ? `; also ${[...new Set(effects.map((e) => e.read.kind))].join(", ")} (frame${effects.length > 1 ? "s" : ""} ${effects.map((e) => e.frame + 1).join(", ")})` : "";
  if (!seq.length) return effects.length ? `no stick figure — an effect drawing: ${[...new Set(effects.map((e) => e.read.kind))].join(", ")}${extra.replace(/^; also [^(]*/, " ")}`.trim() : "nothing I can read yet";
  const jumpy = seq.some((p) => p === "takeoff" || AIR.includes(p) || p === "landing") || seq[seq.length - 1] === "anticipation";
  const kind = jumpy ? (maxUp > 0.5 * H ? "a jump" : "a hop") : seq.includes("running") ? "a run" : seq.includes("walking") ? "a walk" : seq.every((p) => p === "standing") ? "standing still" : "a move";
  const last = seq[seq.length - 1];
  return `${kind}: ${seq.map((p) => WORDS[p]).join(" → ")} → next: ${NEXT[last]}${extra}`;
}

// ---- 3. Size and floor, and the whole read --------------------------------------------------------------------
export function readAnimation(frames: readonly ReadFrame[], o: { fps?: number } = {}): AnimationRead {
  const fps = o.fps ?? 12;
  const sorted = frames.slice().sort((a, b) => a.frame - b.frame);
  const missed: number[] = [];
  const effects: AnimationRead["effects"] = [];
  const raw: { frame: number; found: FoundFigure; fig: ReadFigure }[] = [];
  for (const f of sorted) {
    let read: ReadDrawing;
    try { read = readDrawing(f.img); } catch { missed.push(f.frame); continue; }
    const found = figureIn(read);
    // A figure with effect lines: WHAT the effect is is read from the ink the figure doesn't explain (the figure's
    // own lines would make a bolt look like fire).
    if (found && found.explained < 0.85 && read.kind !== "stickFigure") {
      try { const rest = readDrawing(withoutFigure(f.img, found)); if (EFFECT_KINDS.has(rest.kind)) read = { ...rest, figure: found }; } catch { /* keep the whole read */ }
    }
    const isEffect = EFFECT_KINDS.has(read.kind) && !(found && found.explained >= 0.85);
    if (isEffect) effects.push({ frame: f.frame, read });
    if (found) raw.push({ frame: f.frame, found, fig: readDrawnFigure(found.joints, found.look) });
    else if (!isEffect) missed.push(f.frame);
  }
  if (!raw.length) return { floor: NaN, height: NaN, figures: [], missed, effects, phases: [], going: goingWords([], effects, 0, 1) };

  // ONE size (the middle of the drawn sizes) and ONE facing (the most common) for the whole animation.
  const height = median(raw.map((r) => r.fig.height));
  const count = new Map<Facing, number>();
  for (const r of raw) count.set(r.fig.facing, (count.get(r.fig.facing) ?? 0) + 1);
  const facing = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let figs = raw.map((r) => readDrawnFigure(r.fig.joints, r.found.look, { height, facing }));

  // THE FLOOR: where the figure stood — the lowest drawn foot. The first frame is normally on the ground: the floor is
  // the lowest foot of the frames standing at that level (a wobble of a few % of the height). A first frame clearly in
  // the air: the floor is the lowest grounded frame; none at all: a hop's height below it.
  const feet = figs.map(footY);
  let floor: number;
  if (!looksAirborne(figs[0])) {
    floor = Math.max(...feet.filter((g, i) => !looksAirborne(figs[i]) && Math.abs(g - feet[0]) <= 0.08 * height));
  } else {
    const grounded = feet.filter((_, i) => !looksAirborne(figs[i]));
    floor = grounded.length ? Math.max(...grounded) : feet[0] + 0.35 * height;
  }
  const frameNos = raw.map((r) => r.frame);
  const travel = travelSpans(figs, frameNos, floor, height, fps);
  // Limb identity, frame after frame (in a walk or run: the legs take turns).
  let lastFront = 0;
  for (let i = 0; i < figs.length; i += 1) {
    if (travel[i] && i > 0 && travel[i - 1]) {
      if (lastFront && frontFoot(figs[i], height) !== 0) figs[i] = alternate(figs[i], -lastFront, height);
      else if (frontFoot(figs[i], height) === 0) figs[i] = matchLimbs(figs[i - 1], figs[i]);
    } else if (i > 0) figs[i] = matchLimbs(figs[i - 1], figs[i]);
    const ff = frontFoot(figs[i], height);
    if (ff) lastFront = ff;
  }
  const phases = readPhases(figs, travel, floor, height);
  const maxUp = Math.max(0, ...figs.map((f) => floor - footY(f)));
  figs = figs.map((f) => ({ ...f }));
  // TRAVEL: the straight line that best fits the body's middle over time (least squares).
  const mid = figs.map((f) => { const j = f.joints; return (j.head.x + j.neck.x + j.hip.x + j.lKnee.x + j.rKnee.x + j.lFoot.x + j.rFoot.x) / 7; });
  const ts = frameNos.map((fr) => fr / fps);
  let goes: NonNullable<AnimationRead["travel"]> = { dir: 0, speed: 0 };
  if (figs.length >= 2) {
    const mt = ts.reduce((a, b) => a + b, 0) / ts.length, mx = mid.reduce((a, b) => a + b, 0) / mid.length;
    const num = ts.reduce((a, t, i) => a + (t - mt) * (mid[i] - mx), 0), den = ts.reduce((a, t) => a + (t - mt) ** 2, 0);
    const slope = den > 0 ? num / den : 0; // page px per second
    const across = Math.abs(slope) * (ts[ts.length - 1] - ts[0]);
    const speed = Math.abs(slope) / height;
    goes = across > 0.06 * height && speed > 0.15 ? { dir: slope > 0 ? 1 : -1, speed } : { dir: 0, speed };
  }
  return {
    travel: goes,
    floor, height,
    figures: raw.map((r, i) => ({ frame: r.frame, fig: figs[i], found: { ...r.found, joints: figs[i].joints } })),
    missed, effects,
    phases: raw.map((r, i) => ({ frame: r.frame, phase: phases[i] })),
    going: goingWords(phases, effects, maxUp, height),
  };
}
