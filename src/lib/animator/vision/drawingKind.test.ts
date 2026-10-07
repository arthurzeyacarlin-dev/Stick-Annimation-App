// What is this drawing? (vision/drawingShape.ts + drawingKind.ts) — synthetic drawings rendered here, plus Arthur's
// own bad mushroom-cloud explosion (fixtures/arthur-explosion.json, decoded once from his PNG at 1/2 scale).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { drawingFeatures, readDrawingWith } from "./drawingShape.ts";
import { arthurExplosion } from "./fixtures/arthurExplosion.ts";
import type { FoundFigure, InkImage } from "./types.ts";

const W = 400, H = 400;
type RGB = [number, number, number];
const BLACK: RGB = [20, 20, 20], ORANGE: RGB = [240, 140, 30], RED: RGB = [200, 40, 30], YELLOW: RGB = [250, 225, 40], BLUE: RGB = [30, 90, 230], CYAN: RGB = [120, 220, 245], GREY: RGB = [150, 150, 150];
function canvas() { return new Uint8ClampedArray(W * H * 4); }
function stroke(d: Uint8ClampedArray, pts: number[][], width: number, c: RGB) {
  const r = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + r)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= r) d.set([...c, 255], (y * W + x) * 4);
      }
  }
}
const ring = (cx: number, cy: number, r: (a: number) => number, n = 90) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r(a), cy + Math.sin(a) * r(a)]; });
const img = (data: Uint8ClampedArray): InkImage => ({ width: W, height: H, data, x0: 100, y0: 50, scale: 1 });
const none = () => null;

function mushroom(c1: RGB, c2: RGB) {
  const d = canvas();
  stroke(d, ring(200, 120, (a) => 95 + 14 * Math.sin(7 * a)), 6, c1); // lumpy cloud
  stroke(d, ring(165, 125, () => 28), 5, c2); stroke(d, ring(235, 120, () => 25), 5, c2); // loops inside
  stroke(d, [[182, 215], [180, 345]], 6, c1); stroke(d, [[218, 215], [220, 345]], 6, c1); // the stem
  stroke(d, [[90, 350], [310, 352]], 6, c2); // ground line
  return d;
}

test("a black mushroom cloud on a stem with a ground line reads as a ground explosion", () => {
  const r = readDrawingWith(img(mushroom(BLACK, BLACK)), none);
  assert.equal(r.kind, "explosion", r.reason);
  assert.ok(Math.abs(r.groundY - (50 + 355)) <= 3, `groundY ${r.groundY}`);
});
test("the same mushroom in orange and red is an explosion too", () => assert.equal(readDrawingWith(img(mushroom(ORANGE, RED)), none).kind, "explosion"));
test("a lumpy burst floating with no stem or ground is an air explosion", () => {
  const d = canvas();
  stroke(d, ring(200, 190, (a) => 110 + 22 * Math.sin(9 * a)), 6, BLACK);
  stroke(d, ring(200, 190, (a) => 50 + 12 * Math.sin(6 * a)), 5, ORANGE);
  assert.equal(readDrawingWith(img(d), none).kind, "airExplosion");
});
test("flame tongues pointing up in warm colours are fire; black tongues too", () => {
  for (const c of [ORANGE, BLACK]) {
    const d = canvas();
    stroke(d, [[110, 350], [120, 260], [145, 140], [170, 250], [200, 70], [228, 240], [255, 150], [285, 260], [290, 350], [110, 350]], 6, c);
    stroke(d, [[170, 345], [185, 270], [200, 220], [215, 280], [230, 345]], 5, c === BLACK ? BLACK : YELLOW);
    const r = readDrawingWith(img(d), none);
    assert.equal(r.kind, "fire", `${c}: ${r.reason}`);
  }
});
test("a blue splash is water", () => {
  const d = canvas();
  stroke(d, [[100, 340], [140, 330], [150, 260], [170, 320], [200, 230], [230, 320], [250, 260], [260, 330], [300, 340]], 6, BLUE);
  for (const [x, y] of [[120, 220], [280, 210], [200, 150]]) stroke(d, ring(x, y, () => 9), 5, BLUE);
  assert.equal(readDrawingWith(img(d), none).kind, "water");
});
test("a yellow zig-zag (and a black one) is lightning", () => {
  for (const c of [YELLOW, BLACK]) {
    const d = canvas();
    stroke(d, [[200, 30], [160, 120], [235, 160], [165, 255], [240, 295], [190, 385]], 7, c);
    const r = readDrawingWith(img(d), none);
    assert.equal(r.kind, "lightning", r.reason);
  }
});
test("a cluster of cyan spikes is ice", () => {
  const d = canvas();
  stroke(d, [[100, 350], [130, 200], [160, 350], [180, 120], [215, 350], [240, 180], [270, 350], [300, 240], [320, 350], [100, 350]], 5, CYAN);
  assert.equal(readDrawingWith(img(d), none).kind, "ice");
});
test("grey puffs are smoke", () => {
  const d = canvas();
  for (const [x, y, r] of [[150, 220, 55], [220, 190, 65], [280, 230, 45]]) stroke(d, ring(x, y, () => r), 6, GREY);
  assert.equal(readDrawingWith(img(d), none).kind, "smoke");
});
test("a confident stick figure (small head) wins; a 'figure' whose head is a big cloud does not", () => {
  const d = canvas();
  stroke(d, ring(200, 80, () => 25), 5, BLACK); stroke(d, [[200, 105], [200, 230]], 5, BLACK);
  stroke(d, [[200, 130], [150, 190]], 5, BLACK); stroke(d, [[200, 130], [250, 190]], 5, BLACK);
  stroke(d, [[200, 230], [165, 340]], 5, BLACK); stroke(d, [[200, 230], [235, 340]], 5, BLACK);
  const J = (head: number, foot: number) => ({ head: { x: 300, y: 50 + head }, neck: { x: 300, y: 50 + head + 30 }, hip: { x: 300, y: 280 }, lElbow: { x: 270, y: 210 }, lHand: { x: 250, y: 240 }, rElbow: { x: 330, y: 210 }, rHand: { x: 350, y: 240 }, lKnee: { x: 285, y: 330 }, lFoot: { x: 265, y: 50 + foot }, rKnee: { x: 315, y: 330 }, rFoot: { x: 335, y: 50 + foot } });
  const fig: FoundFigure = { joints: J(80, 340), look: { color: "#141414", thickness: 5, headFilled: false, headRadius: 25 }, confidence: 0.9, explained: 0.92 };
  assert.equal(readDrawingWith(img(d), () => fig).kind, "stickFigure");
  const bigHead: FoundFigure = { ...fig, joints: J(120, 352), look: { ...fig.look, headRadius: 95 } };
  assert.equal(readDrawingWith(img(mushroom(BLACK, BLACK)), () => bigHead).kind, "explosion");
});

test("Arthur's bad mushroom-cloud drawing reads as a ground explosion, boxed where he drew it", () => {
  const r = readDrawingWith(arthurExplosion(), none);
  assert.equal(r.kind, "explosion", r.reason);
  // His drawing: the cloud's left edge to the right ground line ≈ x 0..375 canvas px, the cloud top ≈ y 190, the
  // ground lines ≈ y 675 (crop pixels = page units here, offset 600, 200).
  assert.ok(Math.abs(r.box.x - 600) < 15 && Math.abs(r.box.w - 375) < 25, `box x ${r.box.x} w ${r.box.w}`);
  assert.ok(Math.abs(r.box.y - 390) < 15 && Math.abs(r.box.h - 485) < 25, `box y ${r.box.y} h ${r.box.h}`);
  assert.equal(r.groundY, r.box.y + r.box.h);
  assert.ok(r.colors.length >= 2, "keeps its main colours");
  const f = drawingFeatures(arthurExplosion())!;
  assert.ok(f.waist && f.base && f.holes >= 2, JSON.stringify({ waist: f.waist, base: f.base, holes: f.holes }));
});
test("readDrawing (with H1's stick-figure finder, when it is there) still reads Arthur's drawing as an explosion", async (t) => {
  if (!fs.existsSync(new URL("./stickFigure.ts", import.meta.url))) return t.skip("vision/stickFigure.ts not landed yet");
  const { readDrawing } = await import("./drawingKind.ts");
  assert.equal(readDrawing(arthurExplosion()).kind, "explosion");
  const d = canvas();
  stroke(d, ring(200, 80, () => 25), 5, BLACK); stroke(d, [[200, 105], [200, 230]], 5, BLACK);
  stroke(d, [[200, 130], [150, 190]], 5, BLACK); stroke(d, [[200, 130], [250, 190]], 5, BLACK);
  stroke(d, [[200, 230], [165, 340]], 5, BLACK); stroke(d, [[200, 230], [235, 340]], 5, BLACK);
  assert.equal(readDrawing(img(d)).kind, "stickFigure", "a plain stick figure is still a stick figure");
});
