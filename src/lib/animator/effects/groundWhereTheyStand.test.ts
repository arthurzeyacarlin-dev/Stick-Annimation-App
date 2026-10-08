import assert from "node:assert/strict";
import test from "node:test";
import { planToScene, SKY_BODY_MIN, type ScenePlan } from "../moves/plan.ts";
import { LIBRARY } from "../moves/library.ts";

// THE GROUND IS WHERE THE FIGURES STAND + A SKY BODY IS BIG ENOUGH TO READ (Arthur, 2026-10-08, Luna's car to the moon:
// "it's grassy ground, not snowy" and "the moon should be bigger for nighttime, not a little speck like a star").
const scene = (title: string, moonSize = 0.3) => planToScene({
  id: "s", title, height: 300, groundY: 900, stageWidth: 1920,
  characters: [{ id: "a", name: "A", x: 500, facing: "right", actions: [{ move: "wait", params: { seconds: 3 } }] }],
  effects: [{ kind: "prop", start: 0, end: 3, anchor: { x: 1500, y: 250 }, params: { symbol: "moon", size: moonSize } }],
} as ScenePlan, LIBRARY) as unknown as { background?: { pieces: { kind: string; params?: { color?: string; time?: string } }[] }; effects: { kind: string; params?: { size?: number } }[] };

test("a moon up in the sky = a night on Earth: grass under the figures, never the moon's gray rock", () => {
  const s = scene("Drive to the Moon");
  const ground = s.background?.pieces.find((p) => p.kind === "ground");
  assert.ok(ground, "there is a ground");
  assert.notEqual(ground!.params?.color, "#a3a3a8", "not moon rock");
  assert.match(String(ground!.params?.color), /^#4f8a3f$/i, "night grass");
  assert.ok(s.background!.pieces.some((p) => p.params?.time === "night"), "still a night sky");
});

test("standing ON the moon = the moon's gray rock", () => {
  const ground = scene("He walks on the moon").background?.pieces.find((p) => p.kind === "ground");
  assert.equal(ground?.params?.color, "#a3a3a8");
});

test("a moon or sun in the sky is drawn big enough to read; one written bigger keeps its size", () => {
  assert.equal(scene("Drive to the Moon", 0.3).effects.find((e) => e.kind === "prop")!.params!.size, SKY_BODY_MIN);
  assert.equal(scene("Drive to the Moon", 1.1).effects.find((e) => e.kind === "prop")!.params!.size, 1.1);
});
