import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { doorsSwing, placeSpot, pushesFromCustom, thingKind } from "./pushPlan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";

// MOVING THINGS — PUSHING IS WALKING (Arthur, Oct 15: the wheelbarrow / heavy box pusher moonwalked and the thing never moved).

const H = TEST_HEIGHT;
const pushKeys = [
  { pose: { lean: 30, lShoulder: 60, rShoulder: 60, lElbow: 40, rElbow: 40, lHip: 25, rHip: -22 }, rHand: { x: 0.4, y: 0.5 }, lHand: { x: 0.4, y: 0.5 }, dx: 40 },
  { pose: { lean: 30, lHip: -22, rHip: 25 }, rHand: { x: 0.4, y: 0.5 }, lHand: { x: 0.4, y: 0.5 }, dx: 40 },
];
const shot = (thing: string, name: string, keys = pushKeys) => ({
  height: H, groundY: TEST_GROUND,
  characters: [{ id: "a", x: 400, facing: "right", actions: [{ move: "custom", params: { name, repeat: 4, keys } }] }],
  effects: [{ kind: "prop", start: 0, end: 60, anchor: { character: "a", joint: "rHand" }, params: { name: thing, parts: [] } }],
});

test("a thing's name says how it moves: rolls / slides / hinge / surface", () => {
  assert.equal(thingKind("wheelbarrow full of soil"), "rolls");
  assert.equal(thingKind("shopping cart"), "rolls");
  assert.equal(thingKind("heavy cardboard box"), "slides");
  assert.equal(thingKind("closed front door"), "hinge");
  assert.equal(thingKind("kitchen counter"), "surface");
  assert.equal(thingKind("a cloud"), undefined);
});

test("a custom push of a wheelbarrow / cart / box in the hand that travels forward becomes a real walk, arms kept on the thing", () => {
  for (const [thing, name] of [["wheelbarrow full of soil", "pushes the wheelbarrow across the yard"], ["heavy box", "pushes the heavy box across the floor"], ["shopping cart", "wheels the cart down the aisle"], ["pram", "drives the pram along"]]) {
    const out = pushesFromCustom(shot(thing, name)) as { characters: { actions: { move: string; params: { distance: number; pushing: Record<string, number> } }[] }[] };
    const a = out.characters[0].actions[0];
    assert.equal(a.move, "walk", thing);
    assert.equal(a.params.distance, 320);
    assert.ok(a.params.pushing.lean > 5 && a.params.pushing.lean <= 22, "leans in, not tipping over");
    assert.equal(a.params.pushing.lShoulder, a.params.pushing.rShoulder, "both hands on the handle");
  }
});

test("not a push: no thing in the hand, a push on the spot, or a push of a wall stay the AI's own keys", () => {
  const still = pushKeys.map((k) => ({ ...k, dx: 0 }));
  assert.equal((pushesFromCustom(shot("wheelbarrow", "pushes the wheelbarrow", still)) as { characters: { actions: { move: string }[] }[] }).characters[0].actions[0].move, "custom");
  assert.equal((pushesFromCustom(shot("wall", "pushes the wall")) as { characters: { actions: { move: string }[] }[] }).characters[0].actions[0].move, "custom");
  assert.equal((pushesFromCustom(shot("box", "waves hello")) as { characters: { actions: { move: string }[] }[] }).characters[0].actions[0].move, "custom");
});

test("a pushing walk goes FORWARD (never a moonwalk): the hips and the hands travel the distance, the hands stay in front at one height", () => {
  const plan: ScenePlan = { id: "t", title: "t", height: H, groundY: TEST_GROUND, characters: [{ id: "a", x: 400, facing: "right", actions: [{ move: "walk", params: { distance: 320, pushing: { lean: 22, head: -6, lShoulder: 30, rShoulder: 30, lElbow: 50, rElbow: 50 } } }] }] };
  const built = buildScene(planToScene(plan, LIBRARY), 24);
  const first = built.frames[0][0].skeleton, last = built.frames[built.frames.length - 1][0].skeleton;
  assert.ok(last.hip.x - first.hip.x > 280, `the body goes forward (${last.hip.x - first.hip.x})`);
  let back = 0;
  const mid = built.frames.slice(10, -2);
  for (let i = 1; i < mid.length; i += 1) back = Math.min(back, mid[i][0].skeleton.rHand.x - mid[i - 1][0].skeleton.rHand.x);
  assert.ok(back > -0.01 * H, `the hands (and the thing) never go backwards (${back})`);
  for (const f of mid) {
    const s = f[0].skeleton;
    assert.ok(s.rHand.x > s.hip.x + 0.15 * H, "hands out in front on the thing");
    assert.ok(Math.abs(s.rHand.x - s.lHand.x) < 2 && Math.abs(s.rHand.y - s.lHand.y) < 2, "both hands together on the handle");
  }
});

test("a closed door swapped for an open one at the same spot becomes ONE door that swings open over 0.5 s (no picture swap)", () => {
  const closed = { kind: "prop", start: -1.5, end: 3, anchor: { x: 900, y: 900 }, params: { name: "closed red door", size: 1, parts: [{ shape: "rect", x: 0, y: 0, w: 0.4, h: 1, color: "#b91c1c" }, { shape: "circle", x: 0.13, y: 0, w: 0.05, h: 0.05, color: "#facc15" }] } };
  const open = { kind: "prop", start: 3, end: 60, anchor: { x: 900, y: 900 }, params: { name: "open door swung inward", size: 1, parts: [{ shape: "rect", x: 0, y: 0, w: 0.4, h: 1, color: "#1f2937" }, { shape: "rect", x: 0.17, y: 0, w: 0.06, h: 1, color: "#b91c1c" }] } };
  const out = doorsSwing({ height: H, effects: [closed, open] }) as { effects: { start: number; end: number; params: { name: string; hinge?: boolean; parts: { x: number; w: number; color: string }[] } }[] };
  const doors = out.effects.filter((e) => e.params.name === "closed red door").sort((a, b) => a.start - b.start);
  assert.ok(doors.length >= 10, "in-between pictures of the swing");
  for (let i = 1; i < doors.length; i += 1) assert.ok(Math.abs(doors[i].start - doors[i - 1].end) < 1e-6, "one door all the way through, no gap");
  const panels = doors.slice(1).map((d) => d.params.parts.find((q) => q.color === "#b91c1c")!);
  for (let i = 1; i < panels.length; i += 1) assert.ok(panels[i].w <= panels[i - 1].w + 1e-9, "the panel turns away: narrower and narrower");
  const last = doors[doors.length - 1];
  assert.ok(Math.abs(last.start - 3.5) < 1e-6 && last.end === 60, "then the AI's open door, from 0.5 s after");
  assert.ok(doors.slice(0, -1).every((d) => d.params.hinge), "the closed door and the swing are never stretched to the end");
  assert.ok(Math.abs(panels[panels.length - 2].x - 0.17) < 0.01, "ends on the open door's edge strip");
  // (no pair, no change)
  assert.equal((doorsSwing({ height: H, effects: [closed] }) as { effects: unknown[] }).effects.length, 1);
});

test("PUT IT DOWN: a custom 'puts the book on the table' lets go at the lowest hand key and the book rests on the table's drawn top", () => {
  const plan = { id: "t", title: "t", height: H, groundY: TEST_GROUND,
    characters: [{ id: "k", x: 800, facing: "right", actions: [{ move: "custom", params: { name: "puts the book on the table", keys: [
      { pose: { lean: 10, rShoulder: 60, rElbow: 30 }, rHand: { x: 0.45, y: 0.6 } }, { pose: { lean: 15, rShoulder: 50, rElbow: 20 }, rHand: { x: 0.5, y: 0.47 }, hold: 0.3 }, { pose: { lean: 0, rShoulder: -6, rElbow: 10 } }] } }, { move: "stand", params: { seconds: 1 } }] }],
    objects: [{ id: "book", look: { kind: "box", size: 30, color: "#dc2626", filled: true, thickness: 3, detail: "plain", weight: "light" }, heldBy: "k" }],
    effects: [{ kind: "prop", start: -1.5, end: 60, anchor: { x: 800 + 0.62 * H, y: TEST_GROUND }, params: { name: "wooden table", size: 0.45, parts: [{ shape: "rect", x: 0, y: -0.45, w: 1.2, h: 0.1, color: "#a16207" }, { shape: "rect", x: -0.5, y: 0.05, w: 0.08, h: 0.9 }, { shape: "rect", x: 0.5, y: 0.05, w: 0.08, h: 0.9 }] } }] } as unknown as ScenePlan;
  const scene = planToScene(plan, LIBRARY);
  const book = scene.objects!.find((o) => o.id === "book")!;
  assert.ok(!book.segments.some((g) => g.mode === "held" && g.to > scene.durationSec - 0.5), "no longer in the hand at the end");
  const built = buildScene(scene, 24);
  const last = built.objects[built.objects.length - 1].find((o) => o.id === "book")!;
  const top = TEST_GROUND - 0.45 * H; // (the table stands on the floor: its parts are 1 unit tall, size 0.45)
  assert.ok(Math.abs(last.y + 15 - top) < 0.05 * H, `rests on the table top (${last.y + 15} vs ${top})`);
  assert.ok(last.x > 800 + 0.62 * H - 0.3 * H && last.x < 800 + 0.62 * H + 0.3 * H, "on the table, not beside it");
  let jump = 0;
  for (let i = 1; i < built.objects.length; i += 1) { const a = built.objects[i - 1].find((o) => o.id === "book"), b = built.objects[i].find((o) => o.id === "book"); if (a && b) jump = Math.max(jump, Math.hypot(b.x - a.x, b.y - a.y)); }
  assert.ok(jump < 0.12 * H, `nothing jumps (${jump.toFixed(1)} px)`);
});

test("PUT IT DOWN only where it can: no surface named or the hand far from it = the thing stays in the hand", () => {
  assert.equal(placeSpot({ height: H, groundY: TEST_GROUND, effects: [] }, "puts the book on the table", [{ t: 0, pose: {}, x: 0 }, { t: 1, pose: {}, x: 0 }], () => ({ x: 500, y: 800 }), 15), undefined);
  assert.equal(placeSpot({ height: H, groundY: TEST_GROUND, effects: [{ kind: "prop", anchor: { x: 1500, y: TEST_GROUND }, params: { name: "table", size: 0.45, parts: [{ shape: "rect", x: 0, y: 0, w: 1, h: 1 }] } }] }, "puts the book on the table", [{ t: 0, pose: {}, x: 0 }, { t: 1, pose: {}, x: 0 }], () => ({ x: 500, y: 800 }), 15), undefined);
  assert.equal(placeSpot({ height: H, effects: [] }, "waves at the table", [], () => undefined, 15), undefined);
});
