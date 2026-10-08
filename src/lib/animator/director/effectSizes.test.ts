import { test } from "node:test";
import assert from "node:assert/strict";
import { repairPlan } from "./repair.ts";

// EFFECT SIZES ARE IN FIGURE HEIGHTS (Luna's real runs: bubbles `size: 28` were too big to see at all; a moon
// `size: 180` filled the whole page beige). A size no figure-height value could be was meant in pixels: the engine
// turns it into figure heights (÷ the plan's figure height) and keeps it in range — for every effect and background piece.
const plan = (bubbleSize: number, moonSize: number) => ({
  id: "p", title: "Luna's night", height: 300, groundY: 900,
  characters: [{ id: "luna", x: 960, facing: "right" as const, actions: [{ move: "stand", params: { seconds: 2 } }] }],
  effects: [{ kind: "bubbles", start: 0, end: 2, anchor: { character: "luna", joint: "head" as const }, params: { size: bubbleSize } }],
  background: { pieces: [{ kind: "sun", params: { moon: true, size: moonSize } }] },
});

test("Luna's real sizes (bubbles 28, moon 180 at figure height 300) become figure heights: visible, page-sized", () => {
  const r = repairPlan(plan(28, 180) as never, 1920);
  const bubble = r.plan.effects![0].params!.size as number, moon = r.plan.background!.pieces[0].params!.size as number;
  assert.ok(Math.abs(bubble - 28 / 300) < 0.01, `bubbles ${bubble}`);
  assert.ok(Math.abs(moon - 180 / 300) < 0.01, `moon ${moon}`);
  // Page-sized: the moon's radius is now 180 px (was 54,000 px), a bubble ~28 px (was 8,400 px).
  assert.ok(moon * 300 < 1080 / 2 && bubble * 300 < 100, "fits on the page");
  assert.equal(r.repairs.filter((x) => /looks like pixels/.test(x)).length, 2, "written down as engine repairs");
});

test("normal figure-height sizes (0.3, 1.2) are untouched; an absurd size is kept inside the range", () => {
  const r = repairPlan(plan(0.3, 1.2) as never, 1920);
  assert.equal(r.plan.effects![0].params!.size, 0.3);
  assert.equal(r.plan.background!.pieces[0].params!.size, 1.2);
  assert.ok(!r.repairs.some((x) => /looks like pixels/.test(x)));
  const huge = repairPlan(plan(99999, 99999) as never, 1920);
  assert.ok((huge.plan.background!.pieces[0].params!.size as number) <= 4 && (huge.plan.effects![0].params!.size as number) <= 4);
});
