import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "./tests2c.ts";
import { steadyHandOf } from "./plan.ts";

// STEADY IN THE HAND (Oct 14, the torch run): a torch / cup / lantern held in one hand is carried steady through a walk or run —
// that arm stays bent with the hand out in front (a small bob only), the other arm swings.
// THE SWINGING FOOT ARRIVES WHERE IT LANDS: no swing foot leaps onto its landing spot in one picture (a run's stopping step).

const torch = { kind: "prop", start: -1.5, end: 60, anchor: { character: "a", joint: "rHand" }, params: { name: "torch", size: 0.5, parts: [{ shape: "line", x: 0, y: 0.15, w: 0, h: -0.62, color: "#6b4226" }] }, layer: "front" };
const plan = (kind: string, effects: unknown[]) => ({ id: "t", title: "t", height: 300, groundY: 900, characters: [{ id: "a", name: "A", x: 260, facing: "right", actions: [{ move: kind, params: { distance: 1200 } }] }], effects });
const build = (p: unknown) => buildScene(makeEffectsTestScene(p as never, 1920) as never, 24);
// how far a hand goes back and forth relative to the shoulder (px) over the middle of the trip
const handRange = (b: ReturnType<typeof build>, hand: "lHand" | "rHand") => {
  const n = b.frames.length, xs = b.frames.slice(Math.round(n * 0.3), Math.round(n * 0.7)).map((f) => f[0].skeleton[hand].x - f[0].skeleton.neck.x);
  return Math.max(...xs) - Math.min(...xs);
};

test("steadyHandOf: a torch / cup prop or a flame in the hand counts; a ball or a sword does not", () => {
  assert.equal(steadyHandOf([torch as never], "a", 0), "r");
  assert.equal(steadyHandOf([{ ...torch, params: { name: "cup of coffee" } } as never], "a", 0), "r");
  assert.equal(steadyHandOf([{ kind: "fire", start: 0, end: 5, anchor: { character: "a", joint: "lHand" } } as never], "a", 0), "l");
  assert.equal(steadyHandOf([{ ...torch, params: { name: "sword" } } as never], "a", 0), undefined);
  assert.equal(steadyHandOf([torch as never], "b", 0), undefined);
});

for (const kind of ["run", "walk", "jog"]) {
  test(`${kind} with a torch in the right hand: that arm is steady, the other still swings`, () => {
    const free = build(plan(kind, [])), held = build(plan(kind, [torch]));
    const swingFree = handRange(free, "rHand"), swingHeld = handRange(held, "rHand"), other = handRange(held, "lHand");
    assert.ok(swingHeld < 0.35 * swingFree, `torch hand steady (${swingHeld.toFixed(0)} px vs ${swingFree.toFixed(0)} px swinging)`);
    assert.ok(other > 0.7 * handRange(free, "lHand"), "the other arm still swings");
  });
}

for (const kind of ["run", "jog", "walk"]) {
  test(`${kind} that stops: no foot leaps onto its landing spot (smooth law)`, () => {
    const b = build(plan(kind, [])), H = 300;
    for (const foot of ["lFoot", "rFoot"] as const) {
      const v = b.frames.map((f, i) => (i ? Math.hypot(f[0].skeleton[foot].x - b.frames[i - 1][0].skeleton[foot].x, f[0].skeleton[foot].y - b.frames[i - 1][0].skeleton[foot].y) * 24 / H : 0));
      for (let i = 2; i < v.length - 1; i += 1) assert.ok(!(v[i] > 1.2 && v[i] > 3 * Math.max(v[i - 1], v[i + 1], 0.15)), `${foot} pops at ${(i / 24).toFixed(2)} s`);
    }
  });
}
