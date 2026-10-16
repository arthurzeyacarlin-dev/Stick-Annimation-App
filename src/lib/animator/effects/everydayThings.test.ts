// EVERY NAMED THING HAS A PICTURE (Oct 15, "sometimes there's broken symbols"): a thing named by a plain word is drawn as what it is,
// at a believable size, standing on the floor — never nothing, never a random gizmo, never a 3-figure-long sword or a half-sunk crate.
import test from "node:test";
import assert from "node:assert/strict";
import { EFFECTS } from "./index.ts";
import { EVERYDAY, everydayThing, withEverydayPicture } from "./everydayThings.ts";
import { believableRange, believableSize } from "../moves/believableSize.ts";
import { makeSymbol, placedSymbol, placedSymbolName, shapeBounds } from "../symbolMaker.ts";
import type { EffectTrack, Shape } from "./types.ts";

const H = 200, G = 270;
const draw = (params: Record<string, unknown>, at = { x: 240, y: G }) => {
  const e = believableSize({ kind: "prop", start: 0, end: 1, anchor: at, params } as EffectTrack);
  return { e, shapes: EFFECTS.prop.draw({ t: 0.3, duration: 1, fps: 24, at, height: H, groundY: G, stageWidth: 360 }, e.params ?? {}) as Shape[] };
};
// (a placed symbol's drawn box, in stage px)
const symbolBox = (s: Extract<Shape, { kind: "symbol" }>) => { const m = placedSymbol(s), k = s.scale ?? 1; return { w: m.width * k, h: m.height * k, top: s.y - (m.height * k) / 2, bottom: s.y + (m.height * k) / 2 }; };

const EVERYDAY_NAMES = ["Ball", "Basketball", "Soccer ball", "Broom", "Shovel", "Rake", "Mop", "Bucket", "Watering can", "Jug", "Cup", "Glass",
  "Book", "Box", "Crate", "Chair", "Table", "Desk", "Bench", "Door", "Gate", "Ladder", "Skateboard", "Bike", "Car", "Tree", "House",
  "Campfire", "Stove", "Frying pan", "Phone", "Flashlight", "Sword", "Shield", "Punching bag", "Hoop", "Rock", "Torch",
  "Umbrella", "Backpack", "Lantern", "Candle", "Present", "Fishing rod", "Hammer", "Wrench", "Flag", "Pillow", "Hat", "Kite", "Balloon", "Bottle",
  "Plate", "Bowl", "Guitar", "Bed", "Couch", "Trash can", "Barrel", "Tent", "Fence", "Axe", "Pizza", "Apple", "Cake", "Laptop", "TV"];

test("every everyday thing named by a plain word is drawn (never nothing)", () => {
  for (const name of EVERYDAY_NAMES) {
    assert.ok(draw({ symbol: name }).shapes.length > 0, `${name} drawn`);
    assert.ok(draw({ name: name.toLowerCase() }).shapes.length > 0, `${name} by its name only`);
  }
});

test("the head noun (the last words) decides what a thing is", () => {
  assert.equal(everydayThing("basketball hoop")?.id, "basketballHoop");
  assert.equal(everydayThing("Basketball")?.id, "basketball");
  assert.equal(everydayThing("soccer ball")?.id, "soccerBall");
  assert.equal(everydayThing("big red ball")?.id, "ball");
  assert.equal(everydayThing("stone bench")?.id, "bench");
  assert.equal(everydayThing("kitchen chair")?.id, "chair");
  assert.equal(everydayThing("wateringCan")?.id, "wateringCan");
  assert.equal(everydayThing("zorblax"), null);
  assert.equal(placedSymbolName("stone bench"), undefined); // (not a rock)
  assert.equal(placedSymbolName("oak tree"), "Oak tree");
  assert.equal(placedSymbolName("crate"), "Crate");
});

test("a picture the AI wrote (its parts, its size) is never replaced", () => {
  const parts = [{ shape: "circle", x: 0, y: 0, w: 1, h: 1, color: "#00ff00" }];
  assert.equal(withEverydayPicture({ name: "ball", parts, size: 0.3 }, () => false).parts, parts);
  assert.equal(withEverydayPicture({ symbol: "ball", size: 0.3 }, () => false).size, 0.3);
  assert.equal(withEverydayPicture({ symbol: "Moon" }, (n) => placedSymbolName(n) !== undefined).parts, undefined);
});

test("each everyday thing's default size is believable next to a person", () => {
  for (const t of EVERYDAY) {
    const ys = t.parts.flatMap((p) => p.shape === "line" ? [p.y, p.y + p.h] : [p.y - (p.shape === "circle" ? p.w : p.h) / 2, p.y + (p.shape === "circle" ? p.w : p.h) / 2]);
    const tall = (Math.max(...ys) - Math.min(...ys)) * t.size;
    const r = believableRange(t.id.replace(/([A-Z])/g, " $1"));
    if (r && Number.isFinite(r[1])) assert.ok(tall >= 0.5 * r[0] && tall <= 2 * r[1], `${t.id} ${tall.toFixed(3)} vs ${r}`);
    assert.ok(tall > 0.02 && tall < 2.2, `${t.id} readable: ${tall}`);
  }
});

test("a symbol placed at the floor stands on it (never half sunk)", () => {
  for (const name of ["Box", "Crate", "Rock", "Car"]) {
    const s = draw({ symbol: name }).shapes.find((q) => q.kind === "symbol") as Extract<Shape, { kind: "symbol" }>;
    assert.ok(s, name);
    assert.ok(Math.abs(symbolBox(s).bottom - G) < 1, `${name} bottom ${symbolBox(s).bottom} on ${G}`);
  }
  // (one up in the air keeps its place)
  const up = draw({ symbol: "Rock" }, { x: 240, y: 40 }).shapes[0] as Extract<Shape, { kind: "symbol" }>;
  assert.equal(up.y, 40);
});

test("a long lying thing is never drawn longer than 1.2 figures by reading its size as its thickness", () => {
  for (const name of ["Sword", "Baseball bat", "Wooden stick"]) {
    const s = draw({ symbol: name, size: 0.5 }).shapes.find((q) => q.kind === "symbol") as Extract<Shape, { kind: "symbol" }>;
    assert.ok(symbolBox(s).w <= 1.2 * H + 1, `${name} ${symbolBox(s).w}`);
  }
});

test("a tree with no size is taller than the figure; recipe things get their typical size", () => {
  const s = draw({ symbol: "Tree" }).shapes.find((q) => q.kind === "symbol") as Extract<Shape, { kind: "symbol" }>;
  assert.ok(symbolBox(s).h > H, `tree ${symbolBox(s).h}`);
  const parts = draw({ symbol: "Ladder" }).shapes;
  const b = shapeBounds(parts);
  assert.ok(b.maxY - b.minY > H, "a ladder is taller than the figure");
  assert.ok(Math.abs(b.maxY - G) < 3, "and stands on the floor");
});

test("making a Library symbol named like an everyday thing draws that thing, never a random invented gizmo", () => {
  const ball = makeSymbol({ name: "Ball" });
  assert.ok(ball.shapes.some((s) => s.kind === "circle" && s.fill === "#e02424"), "a red ball");
  const ladder = makeSymbol({ name: "Ladder", size: 100 });
  assert.ok(ladder.height > ladder.width, "a ladder stands tall");
  assert.deepEqual(makeSymbol({ name: "Broom", seed: 1 }).shapes, makeSymbol({ name: "Broom", seed: 7 }).shapes);
});

test("a bucket / bag / watering can carried in one hand hangs below the hand by its handle; a cup stays in the palm", () => {
  const hand = { x: 150, y: 165 };
  const held = (name: string) => {
    const e = believableSize({ kind: "prop", start: 0, end: 1, anchor: { character: "a", joint: "rHand" }, params: { name } } as EffectTrack);
    return shapeBounds(EFFECTS.prop.draw({ t: 0.3, duration: 1, fps: 24, at: hand, height: H, groundY: G, stageWidth: 360, facing: "right", forearm: { x: 0.6, y: 0.8 } }, e.params ?? {}) as Shape[]);
  };
  for (const name of ["bucket", "watering can"]) { const b = held(name); assert.ok(Math.abs(b.minY - hand.y) < 6 && b.maxY > hand.y + 20, `${name} hangs: ${b.minY}..${b.maxY}`); }
  const cup = held("cup");
  assert.ok(cup.minY < hand.y && cup.maxY > hand.y, "a cup is in the palm");
});
