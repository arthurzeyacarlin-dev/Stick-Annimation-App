import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { ballLook, boxLook } from "../objects.ts";
import { LIBRARY } from "./library.ts";
import { fitPlanToPage, type Action, type ScenePlan } from "./plan.ts";
import type { MoveStyle } from "./styles.ts";
import { heldContactProblems } from "./testkit.ts";
import { makeSurpriseScene } from "./tests.ts";

// HOLDING THROUGH EVERY MOVE (Arthur, round 8: "As long as you're visually holding it — as if you're
// holding a bat, a gun, a plate with food — visually it should be holding it"). A figure that starts out
// holding something does any move: on every frame it holds the thing, the thing touches the holding
// hand(s) (both hands for a two-handed hold). Every size: a small ball, a basketball, a big box. A fall
// lets go to catch the body: the thing drops, bounces or slides, and ends lying still on the floor.

const MOVES: [string, Action[]][] = [
  ["walk", [{ move: "walk", params: { distance: 300 } }]],
  ["run", [{ move: "run", params: { distance: 500 } }]],
  ["turn", [{ move: "turn" }]],
  ["look back", [{ move: "lookBack" }]],
  ["jump", [{ move: "jump" }]],
  ["jump forward", [{ move: "jump", params: { distance: 200 } }]],
  ["squat", [{ move: "squat" }]],
  ["sit", [{ move: "sit" }]],
  ["punch", [{ move: "punch" }]],
  ["kick", [{ move: "kick", params: { height: "high" } }]],
  ["wave", [{ move: "wave" }]],
  ["stomp", [{ move: "stomp" }]],
  ["guard", [{ move: "guard", params: { seconds: 1 } }]],
  ["catch breath", [{ move: "catchBreath" }]],
  ["running jump", [{ move: "run", params: { distance: 400 } }, { move: "jump" }, { move: "run", params: { distance: 300 } }]],
  ["walk, sit", [{ move: "walk", params: { distance: 300 } }, { move: "sit" }]],
  ["turn, sit", [{ move: "turn" }, { move: "sit" }]],
  ["wave, sit", [{ move: "wave" }, { move: "sit" }]],
];
const FALLS: [string, Action[]][] = [
  ["fall", [{ move: "fall" }]],
  ["slip back", [{ move: "fall", params: { direction: "back" } }]],
  ["run, trip", [{ move: "run", params: { distance: 400 } }, { move: "fall" }]],
  ["fall down, get up, sit", [{ move: "fallDown" }, { move: "getUp" }, { move: "sit" }]],
];
const THINGS = [ballLook("basketball"), ballLook("ball", { size: 24 }), boxLook({ size: 80 })];
const LOOKS: { style: MoveStyle; width: number; facing: "left" | "right" }[] = [
  { style: "natural", width: 1920, facing: "right" }, { style: "angry", width: 608, facing: "left" }, { style: "sad", width: 1080, facing: "right" },
];

const holdingPlan = (actions: Action[], look: (typeof THINGS)[number], o: (typeof LOOKS)[number]): ScenePlan => ({
  id: "holding", title: "holding", height: 300, groundY: 900,
  characters: [{ id: "a", x: 960, facing: o.facing, style: o.style, speed: o.style === "angry" ? "fast" : "normal", energy: 0.5, actions }],
  objects: [{ id: "thing", look, heldBy: "a" }],
});

test("holding: whatever the move, size or mood, a held thing touches the holding hand(s) on every frame", () => {
  for (const [name, actions] of [...MOVES, ...FALLS]) for (const look of THINGS) for (const o of LOOKS) {
    const scene = fitPlanToPage(holdingPlan(actions, look, o), LIBRARY, o.width);
    for (const fps of [12, 24]) {
      const { problems } = heldContactProblems(scene, buildScene(scene, fps));
      assert.deepEqual(problems, [], `${name}, ${look.kind} ${look.size}px, ${o.style} @${fps}`);
    }
  }
});

test("holding: moves that don't need the hands keep the thing in both hands; a turn or a wave hands it back to both hands after", () => {
  for (const [name, actions] of MOVES) {
    const scene = fitPlanToPage(holdingPlan([...actions, { move: "squat" }], ballLook("basketball"), LOOKS[0]), LIBRARY, 1920);
    const last = scene.objects![0].segments!.at(-1)!;
    assert.ok(last.mode === "held" && last.joint === "hands", `${name}: held in both hands at the end (${JSON.stringify(last)})`);
  }
});

test("holding: a fall lets go to catch the body; the thing keeps the body's speed, drops and ends lying still on the floor", () => {
  for (const [name, actions] of FALLS) for (const look of THINGS) {
    const scene = fitPlanToPage(holdingPlan(actions, look, LOOKS[0]), LIBRARY, 1920);
    const segments = scene.objects![0].segments!;
    const drop = segments.find((s) => s.mode === "flight" && s.drop);
    assert.ok(drop && drop.mode === "flight", `${name}: dropped`);
    assert.ok(!segments.some((s) => s.mode === "held" && s.from > drop.from), `${name}: nobody holds it after the drop`);
    const built = buildScene(scene, 24);
    const at = (i: number) => built.objects[i].find((p) => p.id === "thing")!;
    const n = built.objects.length, end = at(n - 1), before = at(n - 2);
    assert.ok(Math.abs(end.y - (900 - look.size / 2)) < 0.5, `${name} ${look.kind}: lies on the floor (${end.y.toFixed(1)})`);
    assert.ok(Math.hypot(end.x - before.x, end.y - before.y) < 0.01, `${name} ${look.kind}: lies still at the end`);
    // (It falls: never higher than where the hands let go of it, a bit above for a bounce at most.)
    const f0 = Math.round(drop.from * 24);
    for (let i = f0; i < n; i += 1) assert.ok(at(i).y >= at(f0).y - 1, `${name} ${look.kind}: thrown up at ${(i / 24).toFixed(2)}s`);
  }
});

test("holding: the random combo 'pass the ball once, turn around, sit down' keeps the ball on the sitter's hands", () => {
  const scene = makeSurpriseScene(11624919, { style: "natural", speed: "normal", energy: 0.5, direction: 1 }, 1080 * (9 / 16));
  for (const fps of [12, 24]) assert.deepEqual(heldContactProblems(scene, buildScene(scene, fps)).problems, [], `@${fps}`);
});
