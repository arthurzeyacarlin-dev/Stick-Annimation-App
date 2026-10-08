import assert from "node:assert/strict";
import test from "node:test";
import type { Scene } from "./engine.ts";
import { effectFitBounds } from "./stageFit.ts";

// A THING PLACED IN THE SCENE IS SEEN (Luna's car to the moon, 2026-10-07): a prop at a fixed spot counts for the page fit.
test("a prop at a fixed spot (the moon) is part of what the page must show; a prop on a figure isn't", () => {
  const scene = { groundY: 900, characters: [{ height: 300 }], effects: [
    { kind: "prop", start: 0, end: 8, anchor: { x: 1550, y: 200 }, params: { symbol: "moon", size: 0.3 } },
    { kind: "prop", start: 0, end: 8, anchor: { character: "driver" }, params: { size: 0.3 } },
  ] } as unknown as Scene;
  const b = effectFitBounds(scene)!;
  assert.ok(b.right >= 1550 + 0.3 * 300 - 1e-6 && b.left <= 1550 - 0.3 * 300 + 1e-6, "the whole moon is inside");
  assert.ok(b.top <= 200 - 0.3 * 300 + 1e-6);
  assert.equal(effectFitBounds({ groundY: 900, characters: [{ height: 300 }], effects: [] } as unknown as Scene), null);
});
