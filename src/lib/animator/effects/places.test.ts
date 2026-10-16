import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_PIECES } from "./index.ts";
import { EVERYDAY } from "./everydayThings.ts";
import { placeSky } from "./ground.ts";
import { PLACES, placeOf, standingThing, timeOf } from "./places.ts";
import type { Shape } from "./types.ts";

// BACKGROUNDS MADE FROM THE WORDS (Arthur, Oct 16): a story that names a place gets that whole place, every place reads as itself
// (its ground / floor, its sky / wall, a few things that belong there), nothing floats, night is dark, and a word that names no
// place draws nothing.
const STAGE = { width: 1920, groundY: 900, height: 300 };
const draw = (params: Record<string, unknown>) => BACKGROUND_PIECES.place.draw({ kind: "place", params }, 0, STAGE);
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
// the shape that fills the page just below the ground line (the ground / floor)
const floorOf = (shapes: Shape[]) => shapes.find((s) => s.kind === "rect" && s.y === STAGE.groundY && s.h > 300) as Extract<Shape, { kind: "rect" }> | undefined;

test("every place in the book draws a full place: a floor at the ground line, a sky or a back wall above it, and things", () => {
  for (const place of PLACES) {
    const shapes = draw({ place: place.id });
    assert.ok(shapes.length > 15, `${place.id} draws a real place`);
    assert.ok(floorOf(shapes), `${place.id} has its ground / floor from the ground line down`);
    // the top of the page is covered (a sky or the room's wall), never the blank page
    assert.ok(shapes.some((s) => s.kind === "rect" && s.y <= 0 && s.y + s.h >= STAGE.groundY - 10 && s.w >= STAGE.width), `${place.id} has a sky or a wall`);
  }
});

test("a place is found from a whole sentence, and words that only sound like a place draw nothing", () => {
  assert.equal(placeOf("a man cooks dinner in the kitchen")?.id, "kitchen");
  assert.equal(placeOf("two boxers fight in a boxing ring")?.id, "boxingRing");
  assert.equal(placeOf("two ninjas fight on a city rooftop at night")?.id, "rooftop");
  assert.equal(placeOf("a man walks down a street at night")?.id, "street");
  for (const words of ["he gives her a ring", "the knight swings his sword", "a man stands in court", "a man waves", "a fight"]) assert.equal(placeOf(words), null, words);
  assert.deepEqual(draw({ place: "a man waves" }), []);
});

test("the time comes from the words (night, sunset, morning), else the place's usual time", () => {
  assert.equal(timeOf("a walk in the park at night", placeOf("park")), "night");
  assert.equal(timeOf("fishing at the lake at sunset", placeOf("lake")), "sunset");
  assert.equal(timeOf("kids at the campsite", placeOf("campsite")), "night");
  assert.equal(timeOf("kids at the campsite in the morning", placeOf("campsite")), "day");
});

test("NIGHT IS DARK: the same place at night has a darker ground and a dark sky; an indoor room at night stays lit but dimmer", () => {
  for (const id of ["park", "street", "beach", "kitchen"]) {
    const day = floorOf(draw({ place: id, time: "day" }))!, night = floorOf(draw({ place: id, time: "night" }))!;
    assert.ok(lum(String(night.fill)) < lum(String(day.fill)) - 25, `${id}: the ground is darker at night`);
  }
  const sky = draw({ place: "park", time: "night" })[0] as Extract<Shape, { kind: "rect" }>;
  assert.ok(lum(String(sky.fill)) < 40, "the night sky is dark");
});

test("NOTHING FLOATS: every everyday thing stands with its lowest point exactly on the ground line (mirrored too)", () => {
  for (const thing of EVERYDAY) for (const flip of [false, true]) {
    const shapes = standingThing(thing.id, 900, STAGE.groundY, STAGE.height, undefined, flip);
    const ys = shapes.flatMap((s) => (s.kind === "poly" || s.kind === "line" ? s.points.filter((_, i) => i % 2 === 1) : []));
    assert.ok(Math.abs(Math.max(...ys) - STAGE.groundY) < 2, `${thing.id} stands on the ground (lowest ${Math.max(...ys).toFixed(1)})`);
  }
});

test("THE PLACE IN THE WORDS IS DRAWN: a story naming a place with no background gets it; anything else is left alone", () => {
  assert.equal(placeSky(undefined, "a man cooks dinner in the kitchen")?.pieces[0].kind, "place");
  assert.equal(placeSky(undefined, "a man walks down a street at night")?.pieces[0].params?.time, "night");
  assert.equal(placeSky(undefined, "a plain walk"), undefined, "no place word = the plain page");
  assert.equal(placeSky(undefined, "a man cooks in the kitchen", [], "#ffeecc"), undefined, "a page color the user asked for wins");
  const own = { pieces: [{ kind: "sky" }, { kind: "trees" }] };
  assert.ok(!placeSky(own, "a walk in the park")?.pieces.some((p) => p.kind === "place"), "pieces the AI wrote are kept");
  // a place piece the AI wrote takes the time from the words, and gets no second sky
  const bg = placeSky({ pieces: [{ kind: "place", params: { place: "street" } }, { kind: "rain" }] }, "a man runs home at midnight");
  assert.equal(bg?.pieces[0].params?.time, "night");
  assert.ok(!bg?.pieces.some((p) => p.kind === "sky"));
});

test("a named place knows if it is a room: a thing hung 'onWall' in a kitchen hangs on its wall, in a park it does not", async () => {
  const { isIndoors } = await import("../laws/backWall.ts");
  assert.equal(isIndoors({ background: { pieces: [{ kind: "place", params: { place: "kitchen" } } as never] } }), true);
  assert.equal(isIndoors({ background: { pieces: [{ kind: "place", params: { place: "a walk in the park" } } as never] } }), false);
});

test("FIGURES STAND OUT: a dark figure on a dark scene gets a light outline; its color and every other figure stay the same", async () => {
  const { buildScene } = await import("../engine.ts");
  const { makeEffectsTestScene } = await import("../moves/tests2c.ts");
  const halos = (title: string) => {
    const plan = { id: "t", title, height: 240, groundY: 900, pace: "natural", effects: [], characters: [
      { id: "b", name: "Black", x: 800, facing: "right", look: { color: "#111111" }, actions: [{ move: "wave" }] },
      { id: "r", name: "Red", x: 1100, facing: "left", look: { color: "#c0392b" }, actions: [{ move: "wave" }] }] };
    const f = buildScene(makeEffectsTestScene(plan as never, 1920), 24).frames[0];
    return f.map((c) => `${c.style.color}:${c.style.halo ?? "-"}`).join(" ");
  };
  assert.equal(halos("Two boxers in a boxing ring"), "#111111:#cfd6e4 #c0392b:-");
  assert.equal(halos("Two friends in the park at night"), "#111111:#cfd6e4 #c0392b:-");
  assert.equal(halos("Two friends in the park"), "#111111:- #c0392b:-");
  assert.equal(halos("Two friends wave"), "#111111:- #c0392b:-");
});
