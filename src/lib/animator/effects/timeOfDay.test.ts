import assert from "node:assert/strict";
import { test } from "node:test";
import { LIBRARY } from "../moves/library.ts";
import { planToScene, type ScenePlan } from "../moves/plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "../moves/testkit.ts";
import { placeSky } from "./ground.ts";
import type { BackgroundSpec } from "./types.ts";

// THE SKY SHOWS THE TIME OF DAY (Arthur, 2026-10-07): the moon / night words = a dark night sky, the sun = a day sky,
// space = black with stars; a page colour the user asked for is never touched; figures stay readable.
const planOf = (extra: Partial<ScenePlan>): ScenePlan => ({
  id: "s", title: "scene", height: TEST_HEIGHT, groundY: TEST_GROUND,
  characters: [{ id: "a", x: 500, facing: "right", actions: [{ move: "walk", params: { distance: 200 } }] }], ...extra,
});
type WithBg = { background?: BackgroundSpec };
const bgOf = (plan: ScenePlan) => (planToScene(plan, LIBRARY) as unknown as WithBg).background;
const skyOf = (plan: ScenePlan) => bgOf(plan)?.pieces.find((p) => p.kind === "sky")?.params;
const moonProp = { kind: "prop", start: 0, end: 4, anchor: { x: 1500, y: 200 }, params: { symbol: "moon", size: 0.4 } };
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

test("a moon prop on a plain page = a dark night sky with stars", () => {
  const sky = skyOf(planOf({ title: "car drives to the moon", effects: [moonProp] }));
  assert.equal(sky?.time, "night");
  assert.equal(sky?.stars, true);
  assert.ok(lum(String(sky?.color)) < 0.02, "the top is dark");
});

test("night words make it night; the sun makes it day; space is black", () => {
  assert.equal(skyOf(planOf({ title: "a walk at midnight" }))?.time, "night");
  assert.equal(skyOf(planOf({ title: "park", background: { pieces: [{ kind: "sun" }, { kind: "trees" }] } }))?.time, "day");
  assert.equal(skyOf(planOf({ title: "park", background: { pieces: [{ kind: "sky" }, { kind: "sun", params: { moon: true } }] } }))?.time, "night");
  assert.equal(skyOf(planOf({ title: "astronaut floating in outer space" }))?.color, "#000000");
  assert.equal(skyOf(planOf({ title: "a plain walk" })), undefined, "no clue = the plain page");
});

test("a page colour the user asked for, a storm, or a sky the AI coloured stays as it is", () => {
  assert.equal(bgOf(planOf({ title: "midnight", canvasColor: "#ffeecc", effects: [moonProp] })), undefined);
  assert.equal(placeSky({ pieces: [{ kind: "thunderstorm" }] }, "night storm")?.pieces.some((p) => p.kind === "sky"), false);
  assert.equal(placeSky({ pieces: [{ kind: "sky", params: { time: "sunset" } }] }, "moon")?.pieces[0].params?.time, "sunset");
});

test("figures stay readable: the night sky lightens toward the ground at least as much as the storm's", () => {
  const storm = lum("#565d68");
  for (const title of ["midnight", "outer space"]) assert.ok(lum(String(skyOf(planOf({ title }))?.color2)) >= storm * 0.6, title);
  const night = skyOf(planOf({ title: "midnight" }));
  assert.ok(lum(String(night?.color2)) >= storm, "night horizon at least the storm's");
});
