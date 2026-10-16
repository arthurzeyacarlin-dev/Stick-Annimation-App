// ONE WORLD (world.ts): where a thing is = where it is DRAWN; the hazard box, the contact pass and the checkers all read it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "./engine.ts";
import { makeEffectsTestScene } from "./moves/tests2c.ts";
import { hazardZones } from "./effects/contactConsequence.ts";
import type { EffectTrack } from "./effects/index.ts";
import { nearestThing, shapesBox, worldAt } from "./world.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
// (a stove drawn as two rects: a body 0.5 tall centred 0.25 BELOW its anchor and a thin red top — the anchor is NOT its middle)
const stove = { kind: "prop", start: -1, end: 30, anchor: { x: 1000, y: 790 }, layer: "back", params: { name: "hot stove", size: 0.6, parts: [{ shape: "rect", x: 0, y: 0.25, w: 1, h: 0.5, color: "#cfd4da" }, { shape: "rect", x: 0, y: -0.02, w: 1, h: 0.06, color: "#ef4444" }] } };
const plan = (effects: unknown[]): Plan => ({ id: "t", title: "t", height: 300, groundY: 900, pace: "natural", characters: [{ id: "a", name: "A", x: 600, facing: "right", look: { color: "#222222" }, actions: [{ move: "stand", params: { seconds: 3 } }] }], effects } as Plan);
const run = (p: Plan) => { const scene = makeEffectsTestScene(p, 1920); return { scene, built: buildScene(scene, 24) }; };

test("WORLD = DRAWN: the stove's box is where its shapes are (standing on the ground, top ~801), not a box round its anchor", () => {
  const { scene, built } = run(plan([stove]));
  const w = worldAt(scene, built, 24), th = w.thing(0)!;
  assert.ok(th && th.name === "hot stove");
  assert.ok(Math.abs(th.topAt(1000) - 801) <= 3, `drawn top ~801 (got ${th.topAt(1000)})`);
  assert.ok(Math.abs(th.box.bottom - 900) <= 3 && Math.abs(th.box.left - 910) <= 5 && Math.abs(th.box.right - 1090) <= 5, `box ${JSON.stringify(th.box)}`);
  assert.ok(!th.contains({ x: 1000, y: 760 }), "the air above the stove is not the stove");
  assert.ok(th.contains({ x: 1000, y: 850 }));
  const p = th.nearestSurfacePoint({ x: 950, y: 740 });
  assert.ok(Math.abs(p.x - 950) < 1 && Math.abs(p.y - 801) <= 3, `nearest surface from above is the drawn top (${p.x}, ${p.y})`);
  assert.ok(worldAt(scene, built, 24) === w, "cached per picture");
  assert.equal(nearestThing(w, { x: 950, y: 740 })?.thing.index, 0);
});

test("HAZARDS READ THE WORLD: the hot stove burns where it is drawn (y 801..900), not 700..880 round its anchor", () => {
  const { scene, built } = run(plan([stove]));
  const effects = (scene as { effects?: EffectTrack[] }).effects ?? [];
  const old = hazardZones(effects, 300, 1)[0], now = hazardZones(effects, 300, 1, worldAt(scene, built, 24))[0];
  assert.ok(old.cy - old.ry < 790, "the private box reached up into the air");
  assert.ok(now.cy - now.ry >= 795 && now.cy + now.ry <= 905, `the world box is the drawn box (${now.cy - now.ry}..${now.cy + now.ry})`);
});

test("shapesBox: circles, rects, polys and lines (strokes included); see-through shapes skipped", () => {
  const b = shapesBox([{ kind: "circle", x: 10, y: 10, r: 5 }, { kind: "rect", x: 20, y: 0, w: 10, h: 4 }, { kind: "line", points: [0, 40, 50, 40], stroke: "#000", width: 2 }, { kind: "poly", points: [0, 0, 100, 0, 100, 5], alpha: 0 }])!;
  assert.deepEqual([b.left, b.right, b.top, b.bottom], [-1, 51, 0, 41]);
});
