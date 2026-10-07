import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { cleanUpScene, comeTrueScene, drawnHeight, finishScene, improveAnimationScene, readDrawnFigure, type ReadFigure } from "../moves/fromDrawing.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, type Facing, type Point, type PoseAngles } from "../rig.ts";
import { findStickFigure } from "./stickFigure.ts";
import type { InkImage } from "./types.ts";

// SIZE IS KEPT (Arthur, 50-50 round 3: "When I draw big stick figures, twice as big as a normal one, the engine has
// to continue with that big stick figure — finishing, come true, anything. If it's really tiny, the engine's figure
// is tiny, not three times bigger."). Drawings from tiny (90 px) to huge (800 px), thin and thick lines, hollow and
// filled heads go through the eye (findStickFigure) and every tool; the engine's figure must be the drawn size
// (within 10%), its head in proportion and its line as thick as the drawn one.
type Pic = { w: number; h: number; data: Uint8ClampedArray };
const INK = [20, 20, 20];
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
const BONES = [["hip", "neck"], ["neck", "lElbow"], ["lElbow", "lHand"], ["neck", "rElbow"], ["rElbow", "rHand"], ["hip", "lKnee"], ["lKnee", "lFoot"], ["hip", "rKnee"], ["rKnee", "rFoot"]] as const;
// The drawing sits in a page picture with its feet on y = 900 (page space, scale 1).
function drawFigure(pose: PoseAngles, facing: Facing, H: number, th: number, filled: boolean, hipX = 960): InkImage {
  const s = forwardKinematics(pose, facing, { x: 0, y: 0 }, H, "normal", false);
  const r = HEAD_RADIUS.normal * H;
  const xs = Object.values(s).map((q) => q.x), ys = Object.values(s).map((q) => q.y);
  const m = 30 + th + r;
  const ox = m - Math.min(...xs), oy = m - Math.min(...ys);
  for (const q of Object.values(s)) { q.x += ox; q.y += oy; }
  const w = Math.ceil(Math.max(...xs) - Math.min(...xs) + 2 * m), h = Math.ceil(Math.max(...ys) - Math.min(...ys) + 2 * m);
  const p: Pic = { w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
  for (const [a, b] of BONES) line(p, s[a], s[b], th);
  circle(p, s.head, r, th, filled);
  const footY = Math.max(s.lFoot.y, s.rFoot.y);
  return { width: w, height: h, data: p.data, x0: hipX - s.hip.x, y0: 900 - footY, scale: 1 };
}

const POSES: [string, PoseAngles, Facing][] = [
  ["stand", STAND, "right"],
  ["stride", { lean: 8, head: 0, lShoulder: 40, rShoulder: -35, lElbow: 70, rElbow: 60, lHip: 35, rHip: -20, lKnee: 15, rKnee: 60 }, "right"],
  ["punch", { lean: 12, head: -5, lShoulder: 88, rShoulder: -20, lElbow: 4, rElbow: 120, lHip: 25, rHip: -15, lKnee: 20, rKnee: 10 }, "left"],
];
const SIZES = [90, 150, 300, 600, 800];

// KNOWN EYE GAP (not size): a side-view figure standing with its legs drawn on top of each other is sometimes not
// found at all (90 px with a 3 px line; 300 px with an 11 px line and a filled head). Those are listed, not sized.
const missed: string[] = [];
function read(pose: PoseAngles, facing: Facing, H: number, th: number, filled: boolean, hipX?: number): ReadFigure | null {
  const found = findStickFigure(drawFigure(pose, facing, H, th, filled, hipX));
  if (!found) { missed.push(`${H}px th ${th} ${filled ? "filled" : "hollow"} ${pose === STAND ? "stand" : "pose"}`); return null; }
  return readDrawnFigure(found.joints, found.look);
}

// The engine figure's size in every built picture: its bones' lengths / their share of the height (the same
// measure as the drawing), its head radius and its line thickness.
function checkScene(label: string, scene: ReturnType<typeof comeTrueScene>, H: number, th: number) {
  const built = buildScene(scene, 12);
  assert.ok(built.frames.length > 0, `${label}: no frames`);
  for (const [i, f] of built.frames.entries()) {
    const c = f[0];
    if (!c) continue;
    const h = drawnHeight(c.skeleton);
    assert.ok(Math.abs(h - H) <= 0.1 * H, `${label} frame ${i}: engine figure ${h.toFixed(0)} px tall, drawn ${H}`);
    const r = c.headRadius / h;
    assert.ok(r >= HEAD_RADIUS.small * 0.99 && r <= HEAD_RADIUS.large * 1.01, `${label} frame ${i}: head ${c.headRadius.toFixed(1)} out of proportion`);
    assert.ok(Math.abs(c.style.thickness - th) <= Math.max(1.5, 0.25 * th), `${label} frame ${i}: line ${c.style.thickness.toFixed(1)}, drawn ${th}`);
  }
}

for (const H of SIZES) {
  test(`size kept: ${H} px drawings stay ${H} px through the eye and every tool`, () => {
    for (const thick of [false, true]) for (const filled of [false, true]) {
      const th = Math.max(2, Math.round(thick ? H * 0.035 : H * 0.012));
      for (const [name, pose, facing] of POSES) {
        const label = `${H}px ${thick ? "thick" : "thin"} ${filled ? "filled" : "hollow"} ${name}`;
        const fig = read(pose, facing, H, th, filled);
        if (!fig) continue;
        assert.ok(Math.abs(fig.height - H) <= 0.1 * H, `${label}: read ${fig.height.toFixed(0)} px tall`);
        assert.ok(Math.abs(HEAD_RADIUS[fig.style.headSize] * fig.height - HEAD_RADIUS.normal * H) <= 0.2 * HEAD_RADIUS.normal * H + th, `${label}: head size ${fig.style.headSize}`);
        checkScene(`${label} come true`, comeTrueScene(fig), H, th);
        // An earlier drawing a little behind (the finish reads where it was going and where the floor is).
        const before = read(POSES[1][1], facing, H, th, filled, 960 - (facing === "left" ? -1 : 1) * 0.15 * H);
        if (!before) continue;
        for (const choice of ["keepGoing", "walkOff"]) checkScene(`${label} finish ${choice}`, finishScene(fig, choice, { previous: [{ frame: 0, fig: before }, { frame: 6, fig }], fps: 12 }), H, th);
        const keys = [{ frame: 0, fig: before }, { frame: 6, fig }];
        checkScene(`${label} clean up`, cleanUpScene(keys, { fps: 12, frameCount: 12 }), H, th);
        checkScene(`${label} make better`, improveAnimationScene(keys, { fps: 12, frameCount: 12 }), H, th);
      }
    }
  });
}

test("size kept: the eye finds (almost) every drawing it sizes", () => {
  assert.ok(missed.length <= 3, `not found: ${missed.join("; ")}`);
});
