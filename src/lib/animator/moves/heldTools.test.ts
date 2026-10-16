import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFECTS } from "../effects/index.ts";
import type { EffectContext } from "../effects/types.ts";

// HELD TOOLS TILT WITH THE HAND (Oct 14): a long thing in a hand is gripped at its handle and points the way the forearm points;
// a bucket hangs straight down whatever the arm does.
const SHOVEL = [{ shape: "line", x: 0, y: -0.2, w: 0, h: 0.8, color: "#8b5a2b" }, { shape: "rect", x: 0, y: 0.68, w: 0.22, h: 0.25, color: "#9ca3af" }];
const WAND = [{ shape: "line", x: 0, y: 0.5, w: 0, h: -0.7, color: "#db2777" }, { shape: "circle", x: 0, y: -0.35, w: 0.4, h: 0.4, color: "#f472b6" }];
const BUCKET = [{ shape: "rect", x: 0, y: 0.2, w: 0.5, h: 0.5, color: "#999" }];
const ctx = (forearm: { x: number; y: number }): EffectContext => ({ t: 0, duration: 2, fps: 24, at: { x: 500, y: 500 }, height: 300, groundY: 900, stageWidth: 1920, facing: "right", forearm });
const pts = (shapes: ReturnType<typeof EFFECTS.prop.draw>) => shapes.flatMap((s) => { const p = (s as { points?: number[] }).points ?? []; const o: [number, number][] = []; for (let i = 0; i + 1 < p.length; i += 2) o.push([p[i], p[i + 1]]); return o; });
// (the middle of the thing's far end: the average of its points, relative to the hand)
const reach = (shapes: ReturnType<typeof EFFECTS.prop.draw>) => { const p = pts(shapes); return { x: p.reduce((a, q) => a + q[0], 0) / p.length - 500, y: p.reduce((a, q) => a + q[1], 0) / p.length - 500 }; };

test("a held shovel points the way the forearm points, gripped near its handle end", () => {
  const forward = reach(EFFECTS.prop.draw(ctx({ x: 1, y: 0 }), { name: "shovel", size: 0.45, parts: SHOVEL }));
  assert.ok(forward.x > 40 && Math.abs(forward.y) < 20, `forearm forward → shovel sticks out forward ${JSON.stringify(forward)}`);
  const down = reach(EFFECTS.prop.draw(ctx({ x: 0.6, y: 0.8 }), { name: "shovel", size: 0.45, parts: SHOVEL }));
  assert.ok(down.x > 20 && down.y > 30, `forearm forward-down → blade forward-down ${JSON.stringify(down)}`);
  // (the hand holds the handle: the hand point is inside the thing's extent, near one end)
  const all = pts(EFFECTS.prop.draw(ctx({ x: 1, y: 0 }), { name: "shovel", size: 0.45, parts: SHOVEL }));
  assert.ok(Math.min(...all.map((q) => q[0])) < 500 && Math.min(...all.map((q) => q[0])) > 500 - 40, "a short bit of handle past the hand");
});

test("a held wand is gripped at its stick, its loop out along the arm (never a dot on the hand)", () => {
  const up = reach(EFFECTS.prop.draw(ctx({ x: 0, y: -1 }), { name: "bubble wand", size: 0.16, parts: WAND }));
  assert.ok(up.y < -12, `forearm up → wand loop up ${JSON.stringify(up)}`);
});

test("a held bucket hangs straight whatever the arm does; tilts:false keeps any thing straight", () => {
  const a = pts(EFFECTS.prop.draw(ctx({ x: 1, y: 0 }), { name: "bucket", size: 0.3, parts: BUCKET }));
  const b = pts(EFFECTS.prop.draw(ctx({ x: 0, y: 1 }), { name: "bucket", size: 0.3, parts: BUCKET }));
  assert.deepEqual(a, b);
  const c = pts(EFFECTS.prop.draw(ctx({ x: 1, y: 0 }), { name: "shovel", tilts: false, size: 0.45, parts: SHOVEL }));
  assert.ok(Math.max(...c.map((q) => q[0])) - Math.min(...c.map((q) => q[0])) < 40, "kept upright");
});

test("a carried flag, sign or torch stays upright (pole up, gripped near its bottom) whatever the arm does", () => {
  const FLAG = [{ shape: "line", x: 0, y: -0.5, w: 0, h: 1, color: "#555" }, { shape: "rect", x: 0.2, y: -0.38, w: 0.4, h: 0.25, color: "#e11d48" }];
  for (const forearm of [{ x: 0.6, y: 0.8 }, { x: 1, y: 0 }]) {
    const p = pts(EFFECTS.prop.draw(ctx(forearm), { name: "flag", size: 0.6, parts: FLAG }));
    assert.ok(Math.min(...p.map((q) => q[1])) < 500 - 100, "the flag is up above the hand");
    assert.ok(Math.max(...p.map((q) => q[1])) < 500 + 40, "only a short bit of pole below the hand");
    assert.ok(Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0])) < 0.5 * 0.6 * 300, "not turned sideways");
  }
});
