import assert from "node:assert/strict";
import { test } from "node:test";
import { bubbles } from "./bubbles.ts";
import type { EffectContext, EffectParams, Point, Shape } from "./types.ts";

// BUBBLES knobs an edit can change (Arthur, 2026-10-07: "bigger bubbles, fewer bubbles, and just floating around,
// not coming and disappearing" = the SAME animation, edited: size, count, motion).

const H = 300;
const ctx = (t: number, duration = 6, at: Point = { x: 960, y: 500 }): EffectContext => ({ t, duration, fps: 12, at, height: H, groundY: 900, stageWidth: 1920 });
type Poly = Extract<Shape, { kind: "poly" }>;
// One see-through fill per bubble ring.
const rings = (shapes: Shape[]) => shapes.filter((s): s is Poly => s.kind === "poly");
const middle = (s: Poly): Point => { const xs = s.points.filter((_, i) => i % 2 === 0), ys = s.points.filter((_, i) => i % 2 === 1); return { x: xs.reduce((a, v) => a + v, 0) / xs.length, y: ys.reduce((a, v) => a + v, 0) / ys.length }; };
const radius = (s: Poly) => { const c = middle(s); return Math.max(...s.points.filter((_, i) => i % 2 === 0)) - c.x; };
const draw = (t: number, p: EffectParams) => bubbles(ctx(t), p);

test("float: the SAME bubbles stay the whole time, wandering near where they were blown, never popping", () => {
  const p: EffectParams = { motion: "float", count: 4 };
  for (const t of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    const shapes = draw(t, p);
    assert.equal(rings(shapes).length, 4, `t=${t}: all 4 bubbles still there`);
    // no pop drops (tiny circles away from a ring): only each ring's one shine dot
    assert.equal(shapes.filter((s) => s.kind === "circle").length, 4, `t=${t}: no popping`);
    for (const r of rings(shapes)) assert.ok(Math.abs(middle(r).y - 500) < 0.6 * H, `t=${t}: floats near its spot, not flying away`);
  }
  // they do move (wander), slowly
  const a = rings(draw(2, p)).map(middle), b = rings(draw(3, p)).map(middle);
  assert.ok(a.some((m, i) => Math.hypot(m.x - b[i].x, m.y - b[i].y) > 3), "they wander");
});

test("rise (default) still drifts up and pops; count and size are knobs", () => {
  const risen = rings(draw(2, { seed: 3 })).map(middle);
  assert.ok(risen.some((m) => m.y < 500 - 0.1 * H), "default bubbles drift up");
  assert.ok(rings(draw(3, { count: 3, motion: "float" })).length === 3);
  const small = Math.max(...rings(draw(2, { motion: "float", size: 0.05 })).map(radius));
  const big = Math.max(...rings(draw(2, { motion: "float", size: 0.1 })).map(radius));
  assert.ok(big > 1.8 * small, `bigger size = bigger bubbles (${small} -> ${big})`);
});
