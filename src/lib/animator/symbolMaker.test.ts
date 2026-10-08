import assert from "node:assert/strict";
import { test } from "node:test";
import { inventSymbol, makeSymbol, shapeBounds, SYMBOL_RECIPE_IDS } from "./symbolMaker.ts";

const inside = (s: ReturnType<typeof makeSymbol>, label: string) => {
  const b = shapeBounds(s.shapes);
  assert.ok(s.shapes.length > 0, `${label}: has shapes`);
  assert.ok(b.minX >= -1e-6 && b.minY >= -1e-6 && b.maxX <= s.width + 1e-6 && b.maxY <= s.height + 1e-6,
    `${label}: shapes ${JSON.stringify(b)} outside its ${s.width}x${s.height} box`);
};

test("every built-in recipe draws inside its box (sizes, seeds and colors)", () => {
  assert.deepEqual(SYMBOL_RECIPE_IDS, ["spike", "box", "tree", "bat", "rock", "star", "sword", "shield", "torch", "droplet", "bulb", "onespike", "crystal", "icespike", "icecrumb", "lasereye", "raindrop", "leaf", "handcuffs", "grenade", "militarycap", "car", "moon", "plank", "woodchip", "pebble", "heldsword", "bamboostick", "woodenstick", "metalbat", "baseballbat"]);
  for (const kind of SYMBOL_RECIPE_IDS) for (const size of [20, 100, 333]) for (const seed of [1, 7, 42]) {
    const s = makeSymbol({ name: kind[0].toUpperCase() + kind.slice(1), kind, size, seed, color: seed === 7 ? "#3366cc" : undefined });
    inside(s, `${kind} ${size} ${seed}`);
    assert.ok(Math.abs(s.height - size) < 1e-9, "height = size");
  }
  // A recipe word in the name picks it ("Spike trap", "Wooden crate").
  assert.deepEqual(makeSymbol({ name: "Wooden crate", seed: 3 }).shapes, makeSymbol({ name: "Wooden crate", kind: "box", seed: 3 }).shapes);
});

test("the same request and seed give the same symbol; another seed can differ", () => {
  for (const kind of SYMBOL_RECIPE_IDS) assert.deepEqual(makeSymbol({ name: kind, kind, seed: 5 }), makeSymbol({ name: kind, kind, seed: 5 }));
  assert.notDeepEqual(makeSymbol({ name: "Rock", seed: 1 }).shapes, makeSymbol({ name: "Rock", seed: 2 }).shapes);
  assert.deepEqual(inventSymbol("Zap", 9), inventSymbol("Zap", 9));
});

test("the generic builder: a lollipop = a stick + a circle, every primitive, turned, inside its box", () => {
  const lollipop = makeSymbol({ name: "Lollipop", parts: [
    { shape: "line", x: 0.5, y: 0.45, x2: 0.5, y2: 1, color: "#eeeeee", width: 0.05 },
    { shape: "circle", x: 0.5, y: 0.25, size: 0.45, color: "#ff4fa3" },
  ] });
  assert.equal(lollipop.name, "Lollipop");
  assert.deepEqual(lollipop.shapes.map((s) => s.kind), ["line", "circle"]);
  inside(lollipop, "lollipop");
  const all = makeSymbol({ name: "Everything", parts: [
    { shape: "circle", x: 0.2, y: 0.2, size: 0.3 }, { shape: "rect", x: 0.6, y: 0.3, size: 0.4, h: 0.2, rotation: 30 },
    { shape: "triangle", x: 0.3, y: 0.7, size: 0.3, rotation: 90 }, { shape: "polygon", x: 0.8, y: 0.8, size: 0.3, sides: 6 },
    { shape: "polygon", points: [0, 0, 0.2, 0, 0.1, 0.2], x: 0.1, y: 0.1 }, { shape: "star", x: 0.5, y: 0.5, size: 0.3, sides: 7 },
    { shape: "line", x: 0.9, y: 0.2, size: 0.4, rotation: 45 },
  ] });
  assert.equal(all.shapes.length, 7);
  inside(all, "every primitive");
  // A rect part turned 30 degrees is a turned 4-corner polygon.
  const rect = all.shapes[1];
  assert.ok(rect.kind === "poly" && rect.points.length === 8 && Math.abs(rect.points[1] - rect.points[3]) > 1);
  // An asked-for box shape keeps the parts inside.
  inside(makeSymbol({ name: "Wide", aspect: 3, parts: [{ shape: "circle", size: 0.5 }] }), "aspect");
});

test("inventSymbol: different seeds give different originals, each inside its box, named", () => {
  const made = Array.from({ length: 12 }, (_, i) => inventSymbol(i % 2 ? "" : `Thing ${i}`, i + 1));
  for (const [i, s] of made.entries()) { inside(s, `invented ${i + 1}`); assert.ok(s.name.length > 1); }
  const looks = new Set(made.map((s) => JSON.stringify(s.shapes)));
  assert.equal(looks.size, made.length, "all different");
  // A name the engine has no recipe for is invented too.
  assert.deepEqual(makeSymbol({ name: "Magic gizmo", seed: 4 }), inventSymbol("Magic gizmo", 4));
});
