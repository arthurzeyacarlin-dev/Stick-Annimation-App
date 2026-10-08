import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { buildEffectFrames, EFFECTS, type EffectScene } from "../effects/index.ts";
import type { SymbolShape } from "../effects/types.ts";
import { PLACED_SYMBOLS, placedSymbol } from "../symbolMaker.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { alongPath, figureSquash, MORPH_SECONDS, symbolName } from "./transform.ts";

// SPEC-0017 TRANSFORM (Arthur's card "a stick figure turns into a car and drives to the moon").
// The plan shape Terra writes: the figure stands, a `transform` effect on its hip turns it into the car (which then
// drives right and flies up), and a `prop` moon waits in the sky.
export const CAR_TO_MOON: ScenePlan = {
  id: "car", title: "Car to the moon", height: TEST_HEIGHT, groundY: TEST_GROUND,
  characters: [{ id: "a", x: 400, facing: "right", actions: [{ move: "stand", params: { seconds: 5.2 } }] }],
  effects: [
    { kind: "transform", start: 0.8, end: 5.2, anchor: { character: "a", joint: "hip" }, params: { into: "car", size: 0.45, path: [{ t: 1.6, dx: 600, dy: 0 }, { t: 3.4, dx: 1100, dy: -520 }] } },
    { kind: "prop", start: 0, end: 5.2, anchor: { x: 1560, y: TEST_GROUND - 640 }, params: { symbol: "moon", size: 0.6 } },
  ],
};

const symbolsIn = (shapes: readonly { kind: string }[], name: string) => shapes.filter((s): s is SymbolShape => s.kind === "symbol" && (s as SymbolShape).name === name);

test("transform: car and moon are Library symbols; the effects are registered with lessons", () => {
  assert.equal(symbolName("car"), "Car");
  assert.equal(symbolName("Moon"), "Moon");
  assert.ok(PLACED_SYMBOLS.Car && PLACED_SYMBOLS.Moon);
  const car = placedSymbol({ name: "Car" });
  assert.ok(car.width > car.height * 1.8 && car.shapes.length >= 6, "a car is long, with body, cabin, windows and two wheels");
  assert.ok(EFFECTS.transform && EFFECTS.prop && EFFECTS.transform.about.includes("into"));
});

test("transform: figure crouches (anticipation), squashes, is gone; the car forms on the same spot and drives with ease at 8/12/24 fps", () => {
  const scene = planToScene(CAR_TO_MOON, LIBRARY) as EffectScene;
  for (const fps of [8, 12, 24]) {
    const built = buildScene(scene, fps);
    const fx = buildEffectFrames(scene, built);
    const start = 0.8, gone = start + MORPH_SECONDS * 0.75;
    const at = (t: number) => Math.round(t * fps);
    // Before: the figure is there, unsquashed. During the crouch: shorter. After the morph: gone.
    const standing = built.frames[at(0.5)][0];
    assert.ok(standing, `@${fps}: figure there before`);
    const height = (f: (typeof built.frames)[number][number]) => Math.max(...Object.values(f.skeleton).map((p) => TEST_GROUND - p.y));
    const crouch = built.frames[at(start + MORPH_SECONDS * 0.3)][0];
    assert.ok(crouch && height(crouch) < height(standing) * 0.9, `@${fps}: crouches first`);
    for (let i = Math.ceil((gone + 1e-6) * fps); i < built.frames.length; i += 1) assert.equal(built.frames[i].length, 0, `@${fps}: figure gone at picture ${i}`);
    // The car appears where the figure stood (on the floor) and is whole by the end of the morph.
    const after = at(start + MORPH_SECONDS) + 1;
    const car = symbolsIn(fx[after].front, "Car")[0];
    assert.ok(car, `@${fps}: car after the morph`);
    assert.ok(Math.abs(car.x - standing.skeleton.hip.x) < 60, `@${fps}: same spot (${car.x.toFixed(0)} vs ${standing.skeleton.hip.x.toFixed(0)})`);
    assert.equal(symbolsIn(fx[at(0.5)].front, "Car").length, 0, `@${fps}: no car before`);
    // It moves along the path: right first, then up into the sky toward the moon; ends where the path ends.
    const last = symbolsIn(fx[at(start + MORPH_SECONDS + 3.4) + 1].front, "Car")[0]; // (just after the path ends)
    assert.ok(last && Math.abs(last.x - (standing.skeleton.hip.x + 1100)) < 15 && Math.abs(last.y - (TEST_GROUND - car.scale! * placedSymbol({ name: "Car" }).height / 2 - 520)) < 2, `@${fps}: reaches the moon`);
    assert.ok(symbolsIn(fx[after].front, "Moon").length === 1, `@${fps}: moon in the sky`);
  }
  // Ease in/out: slow at the ends of each leg, fastest in the middle.
  const path = [{ t: 1.6, dx: 600, dy: 0 }, { t: 3.4, dx: 1100, dy: -520 }];
  const speed = (s: number) => Math.hypot(alongPath(path, s + 0.02).dx - alongPath(path, s).dx, alongPath(path, s + 0.02).dy - alongPath(path, s).dy);
  assert.ok(speed(0) < speed(0.8) * 0.2 && speed(1.58) < speed(0.8) * 0.2, "drive eases in and out");
  assert.ok(alongPath(path, 2.5).rotation < -5, "tilts nose-up while flying up");
  assert.equal(figureSquash(0.9), null);
});

test("transform back: the symbol shrinks away and the figure grows back", () => {
  const plan: ScenePlan = { ...CAR_TO_MOON, effects: [
    { kind: "transform", start: 0.5, end: 1.6, anchor: { character: "a", joint: "hip" }, params: { into: "car", morph: 0.8 } },
    { kind: "transform", start: 2, end: 2.8, anchor: { character: "a", joint: "hip" }, params: { into: "car", back: true } },
  ] };
  const scene = planToScene(plan, LIBRARY) as EffectScene;
  const built = buildScene(scene, 12);
  assert.equal(built.frames[Math.round(1.8 * 12)].length, 0, "gone while a car");
  assert.equal(built.frames[Math.round(3.5 * 12)].length, 1, "back as a figure");
});
