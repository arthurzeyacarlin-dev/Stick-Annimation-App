import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "./tests2c.ts";
import { tripsAtTheThing } from "./tripAtThing.ts";

// THE TRIP HAPPENS AT THE REAL CONTACT (Arthur, Oct 15: "he goes in front of the rock — he's fine; the NEXT step he trips. No, the
// rock is the cause").
const plan = (rockX: number, distance = 520, name = "rock") => ({
  id: "t", title: "t", height: 300, groundY: 900,
  characters: [{ id: "k", name: "Kid", x: 300, facing: "right", look: { color: "#ea580c" }, actions: [{ move: "run", params: { distance } }, { move: "fallDown" }, { move: "getUp" }] }],
  effects: [{ kind: "prop", start: -1, end: 30, anchor: { x: rockX, y: 900 }, layer: "back", params: { name, size: 0.07, parts: [{ shape: "round", x: 0, y: 0.1, w: 1.6, h: 0.8, color: "#78716c" }] } }],
});
const caught = (p: Record<string, unknown>) => {
  const sc = makeEffectsTestScene(p as never, 1920), b = buildScene(sc, 24), marks = sc.marks ?? {};
  const t = Math.max(...Object.entries(marks).filter(([k]) => k.startsWith("k.run1.")).map(([, v]) => v));
  const sk = b.frames[Math.round(t * 24)][0].skeleton;
  return sk.lFoot.y >= sk.rFoot.y ? sk.lFoot.x : sk.rFoot.x;
};

for (const [rockX, thing] of [[980, "rock"], [760, "banana peel"], [1150, "garden hose"]] as const) test(`a fall after a run starts where the foot meets the ${thing}`, () => {
  const out = tripsAtTheThing(plan(rockX, 520, thing)) as ReturnType<typeof plan>;
  const x = out.effects[0].anchor.x, foot = caught(out);
  assert.ok(Math.abs(x - (foot + 15)) <= 2, `the ${thing} is just in front of the caught foot (${x} vs foot ${Math.round(foot)})`);
  // (strides land in whole steps: the run is retimed to the nearest step, so the thing moves at most about half a stride)
  assert.ok(Math.abs(x - rockX) <= 0.6 * 300, `the run was retimed so the ${thing} moves less than half a stride (${rockX} → ${x})`);
});

test("no thing on the ground, or the thing behind the runner: the plan is left alone", () => {
  const p = plan(100);
  assert.equal(tripsAtTheThing(p), p);
  const none = { ...plan(900), effects: [] };
  assert.equal(tripsAtTheThing(none), none);
});
