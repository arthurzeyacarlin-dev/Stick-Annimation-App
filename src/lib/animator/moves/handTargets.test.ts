// HAND TARGETS (moves/custom.ts reachHands): a custom key's rHand / lHand { x: forward from the hips, y: up from the floor } (x height)
// puts that hand exactly there — the engine bends the arm.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "./tests2c.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
const H = 300, G = 900;
const handAtEnd = (facing: "left" | "right", key: Record<string, unknown>, joint: "rHand" | "lHand") => {
  const plan = { id: "t", title: "t", height: H, groundY: G, pace: "natural", characters: [{ id: "a", name: "A", x: 900, facing, look: { color: "#222222" }, actions: [{ move: "custom", params: { name: "reach", keys: [{ ...key, feet: "both", hold: 1 }] } }] }] } as unknown as Plan;
  const built = buildScene(makeEffectsTestScene(plan, 1920), 24), c = built.frames[built.frames.length - 1][0];
  return { hand: c.skeleton[joint], hip: c.skeleton.hip, floor: Math.max(c.skeleton.lFoot.y, c.skeleton.rFoot.y) };
};

test("a hand target puts the hand exactly there (forward from the hips, up from the floor), either facing", () => {
  for (const facing of ["right", "left"] as const) for (const [x, y] of [[0.25, 0.85], [0.2, 0.6], [0.1, 1.0], [0.45, 0.7]]) {
    const { hand, hip, floor } = handAtEnd(facing, { rHand: { x, y } }, "rHand"), dir = facing === "right" ? 1 : -1;
    assert.ok(Math.abs((hand.x - hip.x) * dir - x * H) < 0.04 * H, `${facing} x ${x}: ${((hand.x - hip.x) * dir / H).toFixed(2)}`);
    assert.ok(Math.abs(floor - hand.y - y * H) < 0.04 * H, `${facing} y ${y}: ${((floor - hand.y) / H).toFixed(2)}`);
  }
  const l = handAtEnd("right", { lHand: { x: 0.2, y: 0.9 } }, "lHand");
  assert.ok(Math.abs(l.hand.x - l.hip.x - 0.2 * H) < 0.04 * H && Math.abs(l.floor - l.hand.y - 0.9 * H) < 0.04 * H, "the left hand too");
});
