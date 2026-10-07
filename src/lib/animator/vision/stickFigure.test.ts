import assert from "node:assert/strict";
import { test } from "node:test";
import { readDrawnFigure, type JointPick } from "../moves/fromDrawing.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, STAND_FRONT, type Facing, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import { findStickFigure } from "./stickFigure.ts";
import type { InkImage } from "./types.ts";

// Synthetic drawings: lines with thickness, rings and discs painted into an RGBA picture (no canvas needed).
type Pic = { w: number; h: number; data: Uint8ClampedArray };
const pic = (w: number, h: number): Pic => ({ w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const INK = [30, 60, 200];
const put = (p: Pic, x: number, y: number) => { if (x < 0 || y < 0 || x >= p.w || y >= p.h) return; const o = (y * p.w + x) * 4; p.data[o] = INK[0]; p.data[o + 1] = INK[1]; p.data[o + 2] = INK[2]; p.data[o + 3] = 255; };
function line(p: Pic, a: Point, b: Point, th: number) {
  const r = th / 2, vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1;
  for (let y = Math.floor(Math.min(a.y, b.y) - r); y <= Math.ceil(Math.max(a.y, b.y) + r); y += 1) for (let x = Math.floor(Math.min(a.x, b.x) - r); x <= Math.ceil(Math.max(a.x, b.x) + r); x += 1) {
    const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2));
    if (Math.hypot(a.x + vx * u - x, a.y + vy * u - y) <= r) put(p, x, y);
  }
}
function circle(p: Pic, c: Point, rad: number, th: number, filled: boolean) {
  const R = rad + th / 2;
  for (let y = Math.floor(c.y - R); y <= Math.ceil(c.y + R); y += 1) for (let x = Math.floor(c.x - R); x <= Math.ceil(c.x + R); x += 1) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (filled ? d <= R : Math.abs(d - rad) <= th / 2) put(p, x, y);
  }
}
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const jig = (q: Point, s: number) => ({ x: q.x + (rand() * 2 - 1) * s, y: q.y + (rand() * 2 - 1) * s });

const BONES: [keyof Skeleton, keyof Skeleton][] = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]];
type Draw = { H: number; th: number; filled: boolean; neck: boolean; scribble: boolean };
function drawFigure(pose: PoseAngles, facing: Facing, o: Draw) {
  const s = forwardKinematics(pose, facing, { x: 0, y: 0 }, o.H, "normal", o.neck);
  const r = HEAD_RADIUS.normal * o.H;
  const xs = Object.values(s).map((q) => q.x), ys = Object.values(s).map((q) => q.y);
  const m = 30 + o.th;
  const dx = m - Math.min(...xs) + r, dy = m - Math.min(...ys) + r;
  for (const q of Object.values(s)) { q.x += dx; q.y += dy; }
  const p = pic(Math.ceil(Math.max(...xs) - Math.min(...xs) + 2 * (m + r)), Math.ceil(Math.max(...ys) - Math.min(...ys) + 2 * (m + r)));
  const wob = 0.025 * o.H;
  for (const [a, b] of BONES) {
    if (!o.scribble) { line(p, s[a], s[b], o.th); continue; }
    const times = 2 + Math.floor(rand() * 2);
    for (let n = 0; n < times; n += 1) {
      const A = jig(s[a], wob * 0.6), B = jig(s[b], wob * 0.6), M = jig({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, wob * 0.5);
      // (Little gaps: the second pass leaves a small break.)
      if (n === 1) { const g = { x: M.x + (B.x - M.x) * 0.08, y: M.y + (B.y - M.y) * 0.08 }; line(p, A, M, o.th); line(p, g, B, o.th); } else { line(p, A, M, o.th); line(p, M, B, o.th); }
    }
  }
  if (o.neck) { const d = Math.hypot(s.head.x - s.neck.x, s.head.y - s.neck.y); const top = { x: s.neck.x + (s.head.x - s.neck.x) * (d - r) / d, y: s.neck.y + (s.head.y - s.neck.y) * (d - r) / d }; line(p, s.neck, top, o.th); }
  if (o.scribble) for (let n = 0; n < 2; n += 1) circle(p, jig(s.head, 0.012 * o.H), r * (1 + (rand() * 2 - 1) * 0.04), o.th, o.filled);
  else circle(p, s.head, r, o.th, o.filled);
  const img: InkImage = { width: p.w, height: p.h, data: p.data, x0: 100, y0: 50, scale: 1 };
  for (const q of Object.values(s)) { q.x += 100; q.y += 50; }
  return { img, s };
}

const POSES: [string, PoseAngles, Facing][] = [
  ["stand", STAND, "right"],
  ["stand front", STAND_FRONT, "front"],
  ["stride", { lean: 8, head: 0, lShoulder: 40, rShoulder: -35, lElbow: 70, rElbow: 60, lHip: 35, rHip: -20, lKnee: 15, rKnee: 60 }, "right"],
  ["punch", { lean: 12, head: -5, lShoulder: 88, rShoulder: -20, lElbow: 4, rElbow: 120, lHip: 25, rHip: -15, lKnee: 20, rKnee: 10 }, "left"],
  ["kick", { lean: -15, head: 5, lShoulder: -40, rShoulder: 50, lElbow: 30, rElbow: 40, lHip: 95, rHip: -5, lKnee: 10, rKnee: 12 }, "right"],
  ["crouch", { lean: 30, head: -10, lShoulder: 60, rShoulder: 45, lElbow: 50, rElbow: 40, lHip: 100, rHip: 90, lKnee: 120, rKnee: 110 }, "left"],
  ["arms up front", { lean: 0, head: 0, lShoulder: 150, rShoulder: 140, lElbow: 20, rElbow: 10, lHip: 20, rHip: 12, lKnee: 0, rKnee: 0 }, "front"],
];
const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
// Worst joint error (arms and legs compared as unordered pairs).
function worstError(j: Record<JointPick, Point>, s: Skeleton) {
  const pair = (a1: JointPick, a2: JointPick, b1: JointPick, b2: JointPick) => Math.min(Math.max(d(j[a1], s[a1]), d(j[a2], s[a2]), d(j[b1], s[b1]), d(j[b2], s[b2])), Math.max(d(j[a1], s[b1]), d(j[a2], s[b2]), d(j[b1], s[a1]), d(j[b2], s[a2])));
  return Math.max(d(j.head, s.head), d(j.neck, s.neck), d(j.hip, s.hip), pair("lElbow", "lHand", "rElbow", "rHand"), pair("lKnee", "lFoot", "rKnee", "rFoot"));
}

function runCases(scribble: boolean) {
  const fails: string[] = [];
  let worst = 0, n = 0, ok = 0;
  const okByPose: Record<string, number> = {};
  for (const [name, pose, facing] of POSES) for (const [H, th] of [[300, 5], [180, 3], [420, 9]] as const) for (const filled of [false, true]) for (const neck of [false, true]) {
    seed = 7 + n * 31;
    n += 1;
    const label = `${name} H${H} th${th} ${filled ? "filled" : "hollow"}${neck ? " neck" : ""}${scribble ? " scribble" : ""}`;
    const { img, s } = drawFigure(pose, facing, { H, th, filled, neck, scribble });
    const f = findStickFigure(img);
    const before = fails.length;
    if (!f) { fails.push(`${label}: not found`); continue; }
    const e = worstError(f.joints, s) / H;
    if (e > 0.06) fails.push(`${label}: off by ${(e * 100).toFixed(1)}% of the height`);
    if (f.look.headFilled !== filled) fails.push(`${label}: head read ${f.look.headFilled ? "filled" : "hollow"}`);
    const fig = readDrawnFigure(f.joints, f.look);
    if (!(Math.abs(fig.height - H) < 0.15 * H)) fails.push(`${label}: read height ${fig.height.toFixed(0)}`);
    if (!neck && fig.style.neck) fails.push(`${label}: a neck it never had`);
    if (fig.style.headFilled !== filled) fails.push(`${label}: style head`);
    if (fails.length === before) { ok += 1; okByPose[name] = (okByPose[name] ?? 0) + 1; worst = Math.max(worst, e); }
  }
  return { fails, worst, n, ok, okByPose };
}

// KNOWN GAPS (2026-10-07, round 2b): a NECK LINE with arms hanging close along the body ("stand", "stand front")
// puts the neck at the head's edge (7-9% off); "arms up" with a neck line, and scribbled stride/stand-front are weak.
// These floors lock in what works now; raise them as the eyes get better (never lower them).
test("findStickFigure: neat engine drawings (7 poses x 3 sizes x hollow/filled x neck/no neck)", () => {
  const r = runCases(false);
  console.log(`neat: ${r.ok}/${r.n} cases right (worst joint of those ${(r.worst * 100).toFixed(1)}% of height)`, r.okByPose);
  for (const pose of ["punch", "kick", "crouch"]) assert.equal(r.okByPose[pose], 12, `${pose}: ${r.fails.filter((f) => f.startsWith(pose + " ")).join("; ")}`);
  assert.ok((r.okByPose["arms up front"] ?? 0) >= 5, r.fails.join("\n"));
  assert.ok(r.ok >= 63, r.fails.join("\n"));
});

test("findStickFigure: scribbly drawings (every bone 2-3 times, wobble, little gaps)", () => {
  const r = runCases(true);
  console.log(`scribble: ${r.ok}/${r.n} cases right (worst joint of those ${(r.worst * 100).toFixed(1)}% of height)`, r.okByPose);
  assert.ok((r.okByPose.kick ?? 0) >= 10 && (r.okByPose.crouch ?? 0) >= 8 && (r.okByPose["arms up front"] ?? 0) >= 4, r.fails.join("\n"));
  assert.ok(r.ok >= 46, r.fails.join("\n"));
});

test("findStickFigure: plain side-view STAND (the most common drawing; arms along the body, legs together)", () => {
  for (const [H, th, scribble] of [[320, 8, false], [320, 8, true], [300, 5, false], [300, 5, true], [180, 3, false], [180, 3, true]] as const) {
    seed = 3;
    const { img, s } = drawFigure(STAND, "right", { H, th, filled: false, neck: false, scribble });
    const f = findStickFigure(img);
    assert.ok(f, `H${H}: found`);
    for (const j of ["head", "neck", "hip"] as const) assert.ok(d(f.joints[j], s[j]) < 0.06 * H, `H${H}${scribble ? " scribble" : ""} ${j} off by ${(d(f.joints[j], s[j]) / H * 100).toFixed(1)}%`);
    assert.ok(worstError(f.joints, s) < 0.06 * H, `H${H}${scribble ? " scribble" : ""}: worst ${(worstError(f.joints, s) / H * 100).toFixed(1)}%`);
    const fig = readDrawnFigure(f.joints, f.look);
    assert.equal(fig.style.neck, false);
    assert.equal(fig.style.headFilled, false);
  }
});

test("findStickFigure: a lumpy cloud or a scribble ball is not a stick figure", () => {
  // Lumpy cloud: a ring of overlapping rings with loops inside and a stem.
  const p = pic(420, 460);
  seed = 99;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) circle(p, { x: 210 + Math.cos(a) * 120, y: 180 + Math.sin(a) * 90 }, 38 + rand() * 12, 5, false);
  for (let n = 0; n < 6; n += 1) circle(p, jig({ x: 210, y: 180 }, 60), 14 + rand() * 10, 4, false);
  line(p, { x: 195, y: 270 }, { x: 190, y: 430 }, 5); line(p, { x: 225, y: 270 }, { x: 232, y: 430 }, 5);
  const cloud = findStickFigure({ width: p.w, height: p.h, data: p.data, x0: 0, y0: 0, scale: 1 });
  assert.ok(!cloud || cloud.confidence < 0.4, `cloud confidence ${cloud?.confidence}`);
  const q = pic(300, 300);
  let at = { x: 150, y: 150 };
  for (let n = 0; n < 60; n += 1) { const nx = jig({ x: 150, y: 150 }, 90); line(q, at, nx, 3); at = nx; }
  const ball = findStickFigure({ width: q.w, height: q.h, data: q.data, x0: 0, y0: 0, scale: 1 });
  assert.ok(!ball || ball.confidence < 0.4, `scribble ball confidence ${ball?.confidence}`);
});
