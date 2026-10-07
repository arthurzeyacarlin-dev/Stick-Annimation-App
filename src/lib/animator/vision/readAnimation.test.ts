import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, type Facing, type Point, type PoseAngles } from "../rig.ts";
import { readDrawnFigure } from "../moves/fromDrawing.ts";
import { matchLimbs, readAnimation, type ReadFrame } from "./readAnimation.ts";
import type { InkImage } from "./types.ts";

// READING SOMEONE'S ANIMATION (Arthur, round 4: "It has to understand where this animation is going. Where is the
// floor? How big is the stick figure? Maybe it's not a stick figure. He should not levitate."). Frames are RENDERED
// from engine poses into pictures (lines + a ring head), some of them HORRIBLE (wobbly lines, double strokes, ends that
// overshoot), and read back through the real eye (findStickFigure / readDrawing).
const FLOOR = 900, H = 300, TH = 6;
type Pic = { w: number; h: number; data: Uint8ClampedArray };
const put = (p: Pic, x: number, y: number) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= p.w || y >= p.h) return; const o = (y * p.w + x) * 4; p.data[o] = 20; p.data[o + 1] = 20; p.data[o + 2] = 20; p.data[o + 3] = 255; };
function seg(p: Pic, a: Point, b: Point, th: number) {
  const r = th / 2, vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1;
  for (let y = Math.floor(Math.min(a.y, b.y) - r); y <= Math.ceil(Math.max(a.y, b.y) + r); y += 1) for (let x = Math.floor(Math.min(a.x, b.x) - r); x <= Math.ceil(Math.max(a.x, b.x) + r); x += 1) {
    const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2));
    if (Math.hypot(a.x + vx * u - x, a.y + vy * u - y) <= r) put(p, x, y);
  }
}
// A line; horrible = wobbly (a wave across it), ends overshooting, and drawn twice a little apart.
function line(p: Pic, a: Point, b: Point, th: number, horrible: number, seed: number) {
  const passes = horrible ? 2 : 1;
  for (let k = 0; k < passes; k += 1) {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux;
    const over = horrible * 0.05 * L, off = k * horrible * 3;
    const A = { x: a.x - ux * over * (k + 0.5) + nx * off, y: a.y - uy * over * (k + 0.5) + ny * off };
    const B = { x: b.x + ux * over + nx * off, y: b.y + uy * over + ny * off };
    const n = 12;
    let prev = A;
    for (let i = 1; i <= n; i += 1) {
      const t = i / n, w = horrible * 0.035 * L * Math.sin(t * Math.PI * 2 * (1.3 + 0.4 * k) + seed);
      const q = { x: A.x + (B.x - A.x) * t + nx * w, y: A.y + (B.y - A.y) * t + ny * w };
      seg(p, prev, q, th);
      prev = q;
    }
  }
}
function ring(p: Pic, c: Point, rad: number, th: number, horrible: number) {
  const n = 48;
  let prev: Point | null = null;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2, r = rad * (1 + horrible * 0.12 * Math.sin(3 * a + 1));
    const q = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    if (prev) seg(p, prev, q, th);
    prev = q;
  }
}
const BONES = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]] as const;
type Shot = { pose: PoseAngles; facing?: Facing; up?: number; x?: number; swap?: boolean };
// The figure drawn with its LOWEST foot `up` (x the height) above the floor, its hip at page x `x`.
function drawFrame(s: Shot, horrible = 0): InkImage {
  const facing = s.facing ?? "right";
  const k = forwardKinematics(s.pose, facing, { x: 0, y: 0 }, H, "normal", false) as unknown as Record<string, Point>;
  if (s.swap) [k.lElbow, k.lHand, k.rElbow, k.rHand, k.lKnee, k.lFoot, k.rKnee, k.rFoot] = [k.rElbow, k.rHand, k.lElbow, k.lHand, k.rKnee, k.rFoot, k.lKnee, k.lFoot];
  const footY = Math.max(k.lFoot.y, k.rFoot.y);
  const dx = (s.x ?? 960), dy = FLOOR - (s.up ?? 0) * H - footY;
  // The picture: page x 560..1360, y 200..1000 (scale 1).
  const x0 = 560, y0 = 200, w = 800, h = 800;
  const p: Pic = { w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
  const at = (q: Point) => ({ x: q.x + dx - x0, y: q.y + dy - y0 });
  BONES.forEach(([a, b], i) => line(p, at(k[a]), at(k[b]), TH, horrible, i * 1.7));
  ring(p, at(k.head), HEAD_RADIUS.normal * H, TH, horrible);
  return { width: w, height: h, data: p.data, x0, y0, scale: 1 };
}
const blank = (): InkImage => ({ width: 400, height: 400, data: new Uint8ClampedArray(400 * 400 * 4).fill(255), x0: 760, y0: 500, scale: 1 });
function lightning(): InkImage {
  const w = 400, h = 400, p: Pic = { w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
  const pts = [[200, 30], [160, 120], [235, 160], [165, 255], [240, 295], [190, 385]];
  for (let i = 0; i + 1 < pts.length; i += 1) seg(p, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, 7);
  return { width: w, height: h, data: p.data, x0: 760, y0: 500, scale: 1 };
}

// Poses (side view, facing right).
const CROUCH: PoseAngles = { lean: 22, head: -5, lShoulder: -40, rShoulder: -50, lElbow: 20, rElbow: 25, lHip: 75, rHip: 70, lKnee: 115, rKnee: 110 };
const EXTEND: PoseAngles = { lean: 8, head: 0, lShoulder: 150, rShoulder: 140, lElbow: 10, rElbow: 15, lHip: -5, rHip: -10, lKnee: 4, rKnee: 6 };
const RISE: PoseAngles = { lean: 5, head: 0, lShoulder: 140, rShoulder: 130, lElbow: 15, rElbow: 15, lHip: 10, rHip: -5, lKnee: 20, rKnee: 15 };
const TUCK: PoseAngles = { lean: 5, head: 0, lShoulder: 90, rShoulder: 80, lElbow: 30, rElbow: 30, lHip: 100, rHip: 95, lKnee: 120, rKnee: 115 };
const FALL: PoseAngles = { lean: 0, head: 0, lShoulder: 100, rShoulder: 90, lElbow: 20, rElbow: 20, lHip: 25, rHip: 15, lKnee: 35, rKnee: 30 };
const LAND: PoseAngles = { lean: 18, head: 0, lShoulder: 40, rShoulder: 30, lElbow: 30, rElbow: 30, lHip: 60, rHip: 55, lKnee: 95, rKnee: 90 };
const frames = (shots: Shot[], horrible = 0, step = 2): ReadFrame[] => shots.map((s, i) => ({ frame: i * step, img: drawFrame(s, horrible) }));
const phasesOf = (r: ReturnType<typeof readAnimation>) => r.phases.map((p) => p.phase);

test("a hop drawn in 3 frames: standing → anticipation → take-off; the floor is the standing feet; going up then down", () => {
  const r = readAnimation(frames([{ pose: STAND }, { pose: CROUCH }, { pose: EXTEND }]), { fps: 12 });
  assert.equal(r.figures.length, 3, `found ${r.figures.length} of 3 (missed ${r.missed})`);
  assert.deepEqual(phasesOf(r), ["standing", "anticipation", "takeoff"], r.going);
  assert.ok(Math.abs(r.floor - FLOOR) <= 0.03 * H, `floor ${r.floor.toFixed(0)}, drawn ${FLOOR}`);
  assert.ok(Math.abs(r.height - H) <= 0.12 * H, `height ${r.height.toFixed(0)}, drawn ${H}`);
  assert.match(r.going, /hop/);
  assert.match(r.going, /up/);
  assert.match(r.going, /down/);
});

const JUMP: Shot[] = [
  { pose: STAND }, { pose: CROUCH }, { pose: EXTEND }, { pose: RISE, up: 0.35 }, { pose: TUCK, up: 0.85 }, { pose: FALL, up: 0.4 }, { pose: LAND }, { pose: STAND },
];
const JUMP_PHASES = ["standing", "anticipation", "takeoff", "rising", "top", "falling", "landing", "standing"];
test("a full jump: every phase right, the floor where it stood (never an airborne frame's feet)", () => {
  const r = readAnimation(frames(JUMP), { fps: 12 });
  assert.equal(r.figures.length, JUMP.length, `missed ${r.missed}`);
  assert.deepEqual(phasesOf(r), JUMP_PHASES, r.going);
  assert.ok(Math.abs(r.floor - FLOOR) <= 0.03 * H, `floor ${r.floor.toFixed(0)}, drawn ${FLOOR}`);
  assert.match(r.going, /jump/);
});

test("a full jump drawn HORRIBLY (wobbly, double strokes, overshooting ends) still reads", () => {
  const r = readAnimation(frames(JUMP, 1), { fps: 12 });
  assert.ok(r.figures.length >= JUMP.length - 1, `found ${r.figures.length} of ${JUMP.length} (missed ${r.missed})`);
  assert.ok(Math.abs(r.floor - FLOOR) <= 0.06 * H, `floor ${r.floor.toFixed(0)}, drawn ${FLOOR}`);
  assert.ok(Math.abs(r.height - H) <= 0.2 * H, `height ${r.height.toFixed(0)}, drawn ${H}`);
  const got = phasesOf(r), want = r.figures.map((f) => JUMP_PHASES[f.frame / 2]);
  const right = got.filter((p, i) => p === want[i]).length;
  assert.ok(right >= want.length - 1, `phases ${got.join(",")} vs ${want.join(",")}`);
  assert.match(r.going, /jump|hop/);
});

test("a run: hips travel steadily, feet taking turns → running", () => {
  const A: PoseAngles = { lean: 15, head: 0, lShoulder: -45, rShoulder: 50, lElbow: 80, rElbow: 80, lHip: 40, rHip: -30, lKnee: 30, rKnee: 70 };
  const B: PoseAngles = { ...A, lShoulder: 50, rShoulder: -45, lHip: -30, rHip: 40, lKnee: 70, rKnee: 30 };
  const shots = [0, 1, 2, 3, 4].map((i) => ({ pose: i % 2 ? B : A, x: 760 + i * 0.25 * H }));
  const r = readAnimation(frames(shots, 0, 2), { fps: 12 });
  assert.equal(r.figures.length, 5, `missed ${r.missed}`);
  assert.ok(phasesOf(r).every((p) => p === "running"), phasesOf(r).join(","));
  assert.match(r.going, /run/);
  // The legs TAKE TURNS (the drawings of a stride look alike): the front foot alternates drawing to drawing.
  const front = r.figures.map((f) => Math.sign(f.fig.joints.lFoot.x - f.fig.joints.rFoot.x));
  assert.ok(front.every((v, i) => i === 0 || v === -front[i - 1]), `front foot ${front.join(",")}`);
});

test("limbs keep their identity: arms/legs swapped in alternate frames are matched back", () => {
  const P: PoseAngles = { lean: 5, head: 0, lShoulder: 70, rShoulder: -40, lElbow: 20, rElbow: 60, lHip: 35, rHip: -25, lKnee: 10, rKnee: 50 };
  const r = readAnimation(frames([0, 1, 2, 3].map((i) => ({ pose: P, swap: i % 2 === 1 }))), { fps: 12 });
  assert.equal(r.figures.length, 4, `missed ${r.missed}`);
  const first = r.figures[0].fig.joints;
  for (const f of r.figures.slice(1)) {
    const j = f.fig.joints;
    assert.ok(Math.hypot(j.lHand.x - first.lHand.x, j.lHand.y - first.lHand.y) < 0.08 * H, `frame ${f.frame}: the l hand jumped to the other arm`);
    assert.ok(Math.hypot(j.lFoot.x - first.lFoot.x, j.lFoot.y - first.lFoot.y) < 0.08 * H, `frame ${f.frame}: the l foot jumped to the other leg`);
    assert.ok(Math.abs(f.fig.pose.lShoulder - r.figures[0].fig.pose.lShoulder) < 15, `frame ${f.frame}: shoulder angle swapped`);
  }
});

test("matchLimbs on its own: swaps the arms and legs of a swapped copy, leaves a matching one alone", () => {
  const P: PoseAngles = { lean: 0, head: 0, lShoulder: 80, rShoulder: -30, lElbow: 10, rElbow: 40, lHip: 30, rHip: -20, lKnee: 5, rKnee: 40 };
  const sk = forwardKinematics(P, "right", { x: 960, y: 600 }, H, "normal", false) as unknown as Record<string, Point>;
  const look = { color: "#141414", thickness: 6, headFilled: false, headRadius: HEAD_RADIUS.normal * H };
  const joints = { head: sk.head, neck: sk.neck, hip: sk.hip, lElbow: sk.lElbow, lHand: sk.lHand, rElbow: sk.rElbow, rHand: sk.rHand, lKnee: sk.lKnee, lFoot: sk.lFoot, rKnee: sk.rKnee, rFoot: sk.rFoot };
  const a = readDrawnFigure(joints, look, { facing: "right", height: H });
  const swapped = readDrawnFigure({ ...joints, lElbow: sk.rElbow, lHand: sk.rHand, rElbow: sk.lElbow, rHand: sk.lHand, lKnee: sk.rKnee, lFoot: sk.rFoot, rKnee: sk.lKnee, rFoot: sk.lFoot }, look, { facing: "right", height: H });
  const m = matchLimbs(a, swapped);
  assert.deepEqual(m.joints.lHand, a.joints.lHand);
  assert.deepEqual(m.joints.rFoot, a.joints.rFoot);
  assert.ok(Math.abs(m.pose.lShoulder - a.pose.lShoulder) < 1 && Math.abs(m.pose.rKnee - a.pose.rKnee) < 1);
  assert.equal(matchLimbs(a, a), a);
});

test("an effect frame is in `effects`, a blank frame is in `missed`, the figure frames still read", () => {
  const list: ReadFrame[] = [{ frame: 0, img: drawFrame({ pose: STAND }) }, { frame: 2, img: lightning() }, { frame: 4, img: blank() }, { frame: 6, img: drawFrame({ pose: STAND }) }];
  const r = readAnimation(list, { fps: 12 });
  assert.deepEqual(r.effects.map((e) => [e.frame, e.read.kind]), [[2, "lightning"]]);
  assert.deepEqual(r.missed, [4]);
  assert.deepEqual(r.figures.map((f) => f.frame), [0, 6]);
  assert.match(r.going, /lightning/);
});

test("a hop drawn HORRIBLY in 3 frames still reads as a hop", () => {
  const r = readAnimation(frames([{ pose: STAND }, { pose: CROUCH }, { pose: EXTEND }], 1), { fps: 12 });
  assert.equal(r.figures.length, 3, `missed ${r.missed}, effects ${r.effects.map((e) => e.read.kind)}`);
  assert.deepEqual(phasesOf(r), ["standing", "anticipation", "takeoff"], r.going);
  assert.ok(Math.abs(r.floor - FLOOR) <= 0.05 * H, `floor ${r.floor.toFixed(0)}`);
  assert.match(r.going, /hop.*up.*down/);
});

test("a figure WITH effect lines (a yellow lightning bolt beside it) is both a figure and an effect", () => {
  const img = drawFrame({ pose: STAND, x: 800 });
  const d = img.data, Y = [250, 225, 40];
  const pts = [[600, 100], [540, 220], [640, 270], [550, 400], [650, 450], [580, 600]];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    for (let y = Math.min(ay, by) - 4; y <= Math.max(ay, by) + 4; y += 1) for (let x = Math.min(ax, bx) - 4; x <= Math.max(ax, bx) + 4; x += 1) {
      const u = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      if (Math.hypot(ax + vx * u - x, ay + vy * u - y) <= 4) { const o = (y * img.width + x) * 4; d[o] = Y[0]; d[o + 1] = Y[1]; d[o + 2] = Y[2]; d[o + 3] = 255; }
    }
  }
  const r = readAnimation([{ frame: 0, img }]);
  assert.equal(r.figures.length, 1, `missed ${r.missed}`);
  assert.deepEqual(r.effects.map((e) => e.read.kind), ["lightning"]);
  assert.deepEqual(r.missed, []);
});

test("travel: a hop forward goes right, a hop straight up goes nowhere, a backward hop goes left", () => {
  const xs = (d: number[]) => JUMP.map((sh, i) => ({ ...sh, x: 960 + d[i] }));
  const fwd = readAnimation(frames(xs([0, 0, 8, 40, 85, 130, 165, 165])), { fps: 12 });
  assert.equal(fwd.travel?.dir, 1, JSON.stringify(fwd.travel));
  assert.ok((fwd.travel?.speed ?? 0) > 0.3, JSON.stringify(fwd.travel));
  const still = readAnimation(frames(xs([0, 0, 0, 0, 0, 0, 0, 0])), { fps: 12 });
  assert.equal(still.travel?.dir, 0, JSON.stringify(still.travel));
  const back = readAnimation(frames(xs([0, 0, -8, -40, -85, -130, -165, -165])), { fps: 12 });
  assert.equal(back.travel?.dir, -1, JSON.stringify(back.travel));
  // A 3-frame hop that has not left the floor yet (the crouch pushes the hips back): not going backwards.
  const hop = readAnimation(frames([{ pose: STAND }, { pose: CROUCH }, { pose: EXTEND }]), { fps: 12 });
  assert.notEqual(hop.travel?.dir, -1, JSON.stringify(hop.travel));
});

test("nothing drawn: no figure, nothing read, no crash", () => {
  const r = readAnimation([{ frame: 0, img: blank() }]);
  assert.deepEqual(r.missed, [0]);
  assert.equal(r.figures.length, 0);
  assert.equal(typeof r.going, "string");
});
