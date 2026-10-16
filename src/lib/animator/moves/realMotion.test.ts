// REAL MOTION (SPEC-0025 Phase 1): Kimodo's motion on our rig — the head is always on the neck (bones from the rig), nothing goes
// under the floor (hands included), it starts where the figure stands and flows (no pops), and a fall ends lying on the floor.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "./tests2c.ts";
import { findMotion } from "../kimodo/library.ts";

const H = 240, G = 900;
const run = (motion: string, facing: "left" | "right" = "right") => {
  const plan = { id: "t", title: "t", height: H, groundY: G, pace: "natural", characters: [{ id: "a", name: "A", x: 900, facing, look: { color: "#111111" }, actions: [{ move: "realMotion", params: { motion } }] }], effects: [] };
  return buildScene(makeEffectsTestScene(plan as never, 1920), 24);
};

test("a sentence finds its saved Kimodo motion by its words", () => {
  assert.equal(findMotion("trips over a rock and falls").id, "fall");
  assert.equal(findMotion("sweeps the porch").id, "sweep");
  assert.equal(findMotion("digs a hole with a shovel").id, "dig");
  assert.equal(findMotion("throws the ball to his friend").id, "throw-catch");
  assert.equal(findMotion("they punch each other").id, "box");
});

test("real motion: head on the neck every picture, nothing under the floor, starts where the figure stands, no pops", () => {
  for (const m of ["trips and falls flat", "sweeps", "digs", "boxes"]) for (const facing of ["right", "left"] as const) {
    const b = run(m, facing), sk = b.frames.map((f) => f[0].skeleton);
    assert.ok(Math.abs(sk[0].hip.x - 900) < 2, `${m}: starts at its spot`);
    for (const s of sk) {
      const neckHead = Math.hypot(s.head.x - s.neck.x, s.head.y - s.neck.y);
      assert.ok(neckHead < 0.2 * H, `${m}: head on the neck (${neckHead.toFixed(1)})`);
      for (const j of Object.values(s)) assert.ok(j.y <= G + 1.5, `${m}: nothing under the floor (${j.y.toFixed(1)})`);
    }
    for (let i = 1; i < sk.length; i++) for (const j of ["lHand", "rHand", "head"] as const) {
      const d = Math.hypot(sk[i][j].x - sk[i - 1][j].x, sk[i][j].y - sk[i - 1][j].y);
      assert.ok(d < 0.35 * H, `${m} ${facing}: ${j} jumps ${d.toFixed(0)} px at picture ${i}`);
    }
  }
});

test("a real fall ends lying on the floor", () => {
  const b = run("trips and falls flat"), s = b.frames[b.frames.length - 1][0].skeleton;
  assert.ok(G - s.head.y < 0.15 * H && G - s.hip.y < 0.15 * H, "head and hips down near the floor");
});
