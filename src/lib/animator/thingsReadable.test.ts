import assert from "node:assert/strict";
import test from "node:test";
import type { Scene } from "./engine.ts";
import { effectFitBounds, propFit } from "./stageFit.ts";
import { partsInPropUnits, type ScenePlan } from "./moves/plan.ts";
import { hangsOnBackWall, isIndoors } from "./laws/backWall.ts";
import type { EffectTrack } from "./effects/types.ts";

const plan = { height: 300, groundY: 900 } as unknown as ScenePlan;
const prop = (params: Record<string, unknown>, anchor: Record<string, number> = { x: 980, y: 900 }) => ({ kind: "prop", start: 0, end: 5, anchor, layer: "back", params }) as unknown as EffectTrack;
const width = (e: EffectTrack) => {
  const ps = e.params!.parts as { x: number; w: number }[], S = Number(e.params!.size) * 300;
  return (Math.max(...ps.map((p) => p.x + Math.abs(p.w) / 2)) - Math.min(...ps.map((p) => p.x - Math.abs(p.w) / 2))) * S;
};

// 1. THINGS LOOK LIKE WHAT THEY ARE (Arthur, Oct 15: the skateboard he trips over was a "little tiny black thing")
test("a skateboard written in its own units with one long deck stays skateboard-sized (never a 10 px speck)", () => {
  const board = prop({ name: "skateboard", size: 0.045, parts: [{ shape: "round", x: 0, y: -0.2, w: 10, h: 0.6 }, { shape: "circle", x: -3.2, y: 0.35, w: 1.2, h: 1.1 }, { shape: "circle", x: 3.2, y: 0.35, w: 1.2, h: 1.1 }] });
  const out = partsInPropUnits(board, plan);
  assert.ok(width(out) > 0.35 * 300 && width(out) < 0.8 * 300, `a skateboard is about half a figure long (${width(out).toFixed(0)} px)`);
});
test("the family: a plank, a bench, a rope on the ground written with one long part keep their size", () => {
  for (const [name, size, parts] of [
    ["wooden plank", 0.05, [{ shape: "rect", x: 0, y: 0, w: 16, h: 1 }]],
    ["park bench", 0.1, [{ shape: "rect", x: 0, y: -0.5, w: 12, h: 1 }, { shape: "rect", x: -5, y: 0.5, w: 0.6, h: 2 }, { shape: "rect", x: 5, y: 0.5, w: 0.6, h: 2 }]],
    ["bench with a back (a near tie: in pixels it would be a 12 px speck)", 0.08, [{ shape: "rect", x: 0, y: -1, w: 12, h: 1 }, { shape: "rect", x: 0, y: -3, w: 12, h: 0.8 }, { shape: "rect", x: -5, y: 0.5, w: 0.6, h: 2 }, { shape: "rect", x: 5, y: 0.5, w: 0.6, h: 2 }]],
    ["rope lying on the ground", 0.02, [{ shape: "rect", x: 0, y: 0, w: 20, h: 1 }]],
  ] as const) {
    const e = prop({ name, size, parts }), out = partsInPropUnits(e, plan);
    assert.deepEqual(out.params!.parts, e.params!.parts, `${name}: read in its own units, untouched`);
  }
});
test("Luna's things written in pixels are still read as pixels (a 300 px punching bag, a box from its spot)", () => {
  const bag = prop({ name: "punching bag", size: 1, parts: [{ shape: "ellipse", x: 950, y: 735, w: 90, h: 300 }, { shape: "line", x: 950, y: 585, w: 0, h: 150 }] });
  const out = partsInPropUnits(bag, plan);
  assert.ok((out.params!.parts as { h: number }[])[0].h < 2, "the bag's height comes back in its own units");
  const box = prop({ name: "box", size: 0.3, parts: [{ shape: "rect", x: 0, y: -45, w: 90, h: 90 }] });
  assert.ok(Math.abs((partsInPropUnits(box, plan).params!.parts as { w: number }[])[0].w - 1) < 0.01, "a 90 px box at size 0.3 is 1 unit wide");
});

// 2. THINGS ON WALLS HANG ON THE WALL (G01 window, G02 poster, G04 button panel, G10 chalkboard were called "floating")
test("a window / poster / chalkboard / button panel onWall hangs on the back wall; a rock onWall in the open air with no pit does not", () => {
  const room = { background: { pieces: [{ kind: "sky" }, { kind: "ground" }] } };
  const park = { background: { pieces: [{ kind: "sky" }, { kind: "hills" }, { kind: "trees" }, { kind: "ground" }] } };
  assert.equal(isIndoors(room), true, "a plain backdrop and a floor: a room");
  assert.equal(isIndoors(park), false, "hills and trees: outdoors");
  for (const name of ["office window", "poster on the wall", "chalkboard", "elevator call button panel", "wall clock", "floor number display", "picture frame"])
    assert.equal(hangsOnBackWall(park, prop({ name, onWall: true }), false), true, `${name} hangs on a wall even outdoors (a building's face)`);
  assert.equal(hangsOnBackWall(room, prop({ name: "ledge", onWall: true }), false), true, "indoors, anything onWall is on the room's wall");
  assert.equal(hangsOnBackWall(park, prop({ name: "rock ledge", onWall: true }), false), false, "a rock in the open air still floats");
  assert.equal(hangsOnBackWall(room, prop({ name: "poster", onWall: true }), true), false, "a thing down in a pit must touch the pit's own wall");
  assert.equal(hangsOnBackWall(room, prop({ name: "skateboard" }), false), false, "not onWall: not on a wall");
});

// 3. FITS THE PAGE BY WHAT IS DRAWN (G09 basketball hoop: 190 px "off the page" and everyone slid left)
test("a thing built from parts counts only its drawn width for the page fit", () => {
  const hoop = { kind: "prop", anchor: { x: 1720, y: 900 }, params: { size: 1.3, parts: [{ shape: "rect", x: 0, y: 0.05, w: 0.05, h: 0.9 }, { shape: "rect", x: -0.08, y: -0.42, w: 0.3, h: 0.22 }, { shape: "rect", x: -0.27, y: -0.36, w: 0.18, h: 0.02 }] } };
  const f = propFit(hoop as never);
  assert.ok(f.right < 0.2 && f.left > -0.6, `the hoop reaches from ${f.left.toFixed(2)} to ${f.right.toFixed(2)} figure heights, as drawn`);
  const scene = { groundY: 900, characters: [{ height: 300 }], effects: [hoop] } as unknown as Scene;
  assert.ok(effectFitBounds(scene)!.right < 1920, "the hoop at x 1720 is on the page");
  assert.deepEqual(propFit({ kind: "prop", anchor: { x: 0, y: 0 }, params: { symbol: "moon", size: 0.3 } } as never), { left: -0.3, right: 0.3, top: 0.3 }, "a symbol keeps its all-round box");
});

// 4. BELIEVABLE SIZE BY NAME (the shovel in the park drawn as a tiny line)
test("a common thing drawn clearly too small or too big comes back to a believable size; a size inside the band stays as written", async () => {
  const { believableSize } = await import("./moves/believableSize.ts");
  const tall = (e: EffectTrack) => Number(e.params!.size) * 1.0; // (one-unit-tall parts: size = height × figure)
  const one = (name: string, size: number) => prop({ name, size, parts: [{ shape: "rect", x: 0, y: 0, w: 0.3, h: 1 }] });
  assert.ok(Math.abs(tall(believableSize(one("shovel", 0.05))) - 0.55) < 1e-9, "a 0.05 shovel (a tiny line) grows to 0.55 of a figure");
  assert.ok(Math.abs(tall(believableSize(one("cardboard box", 2))) - 0.45) < 1e-9, "a box twice a person's height shrinks to 0.45");
  assert.ok(Math.abs(tall(believableSize(one("ladder", 0.2))) - 1.0) < 1e-9, "a 0.2 ladder grows to a person's height");
  assert.equal(tall(believableSize(one("shovel", 0.45))), 0.45, "a kid's shovel at 0.45 is believable enough: kept (H01)");
  assert.equal(tall(believableSize(one("big toy box", 0.7))), 0.7, "a big toy box at 0.7 is inside the band: kept");
  assert.equal(tall(believableSize(one("basketball hoop", 3))), 3, "big things (hoops, trees, houses) are never shrunk");
  assert.equal(tall(believableSize(one("punching bag", 1))), 1, "a punching bag is not a small bag");
  assert.equal(tall(believableSize(one("glowing orb", 0.01))), 0.01, "an unknown thing is left as written");
  const shovel = believableSize(prop({ name: "shovel", size: 0.04, parts: [{ shape: "rect", x: 0, y: -0.6, w: 0.04, h: 0.9 }, { shape: "rect", x: 0, y: 0.04, w: 0.25, h: 0.25 }] }));
  assert.ok(Math.abs(Number(shovel.params!.size) * 1.215 - 0.55) < 1e-6, "a shovel built from parts is measured by its parts' height");
});

test("a wide fence of parts (rails 14 units, posts along them at x ±6.5) is read in its own units and draws across the yard", () => {
  const posts = [-6.5, -4.5, -2.5, -0.5, 0.5, 2.5, 4.5, 6.5].map((x) => ({ shape: "rect", x, y: 0, w: 0.12, h: 1 }));
  const fence = prop({ name: "wooden backyard fence", size: 0.4, parts: [{ shape: "rect", x: 0, y: 0, w: 14, h: 0.06 }, { shape: "rect", x: 0, y: -0.3, w: 14, h: 0.06 }, ...posts] }, { x: 960, y: 900 });
  const out = partsInPropUnits(fence, plan);
  assert.deepEqual(out.params!.parts, fence.params!.parts, "untouched: own units");
  assert.ok(width(out) > 1500, `about 1680 px wide (${width(out).toFixed(0)})`);
});
