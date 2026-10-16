// THE WORKING END REACHES THE WORKED THING: a floor-tool job is placed so the tool's head strokes are centered on the named pile.
import assert from "node:assert/strict";
import { test } from "node:test";
import { toolAtThing } from "./toolAtThing.ts";

const rake = (x: number, pileX: number, name = "rakes the leaves into the pile") => ({
  id: "t", height: 300, groundY: 900, characters: [{ id: "a", x, facing: "right", actions: [{ move: "custom", params: { name, repeat: 2, keys: [
    { pose: { lean: 28 }, rHand: { x: 0.55, y: 0.8 }, lHand: { x: 0.66, y: 0.63 }, feet: "both", hold: 0.1 },
    { pose: { lean: 8 }, rHand: { x: 0.1, y: 0.82 }, lHand: { x: 0.25, y: 0.69 }, feet: "both", hold: 0.15 }] } }] }],
  effects: [
    { kind: "prop", start: -1, end: 30, anchor: { character: "a", joint: "rHand" }, params: { name: "rake", size: 0.55, parts: [{ shape: "line", x: 0, y: -0.15, w: 0, h: 0.9 }, { shape: "rect", x: 0, y: 0.77, w: 0.28, h: 0.05 }] } },
    { kind: "prop", start: -1, end: 30, anchor: { x: pileX, y: 900 }, params: { name: "pile of fallen leaves", size: 0.3, parts: [{ shape: "ellipse", x: 0, y: -0.1, w: 0.9, h: 0.25 }] } },
  ],
});

test("a raker too far from the leaves is placed so the rake's head works over them", () => {
  const out = toolAtThing(rake(700, 1000)) as ReturnType<typeof rake>;
  assert.ok(out.characters[0].x > 760 && out.characters[0].x < 1000, `x ${out.characters[0].x}`);
});
test("no tool job, or no loose thing: the plan is untouched", () => {
  const p = rake(700, 1000, "waves hello");
  assert.equal(toolAtThing(p), p);
});
