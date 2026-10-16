// EVERYTHING HAS A CAUSE, part 2 (effects/causedThings.ts): a stone that sinks is gone, a flag is carried and planted, paint
// appears where the brush moves, a cover hides only those behind it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { BACKGROUND_PIECES, buildEffectFrames, type EffectTrack } from "./index.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
const H = 300;
const run = (plan: unknown) => { const scene = makeEffectsTestScene(plan as Plan, 1920); const built = buildScene(scene, 24); return { scene, built, effects: (scene as { effects?: EffectTrack[] }).effects ?? [], fx: buildEffectFrames(scene as never, built) }; };
const fig = (actions: unknown[], extra: Record<string, unknown> = {}) => ({ id: "a", name: "A", x: 500, facing: "right", look: { color: "#222222" }, actions, ...extra });

test("A THING THAT SINKS IS GONE: a stone thrown into the lake splashes, ripples and is not drawn after it goes in", () => {
  const { built, effects } = run({ id: "t", title: "t", height: H, groundY: 900, pace: "natural", characters: [fig([{ move: "throw", params: { object: "stone", distance: 600 } }, { move: "stand", params: { seconds: 2 } }])], objects: [{ id: "stone", look: { kind: "ball", size: 24, color: "#777777", filled: true, thickness: 3, detail: "plain" }, heldBy: "a" }], background: { pieces: [{ kind: "water", params: { x: 1150, w: 700 } }] } });
  assert.ok(effects.some((e) => e.kind === "splash" && (e.anchor as { landing?: boolean }).landing), "a splash where it goes in");
  assert.ok(effects.some((e) => e.kind === "ripples"), "ripples");
  const lastFrame = built.objects[built.objects.length - 1];
  assert.ok(!lastFrame.some((o) => o.id === "stone"), "no stone lying on the water at the end");
});

test("A PLANTED THING IS CARRIED AND PLACED: the planted flag appears when the carrying hand pushes it in, where the hand is; the carried one ends then", () => {
  const flag = { size: 0.6, parts: [{ shape: "line", x: 0, y: 0, w: 0, h: -1, color: "#6b4226" }, { shape: "rect", x: 0.2, y: -0.4, w: 0.4, h: 0.25, color: "#dc2626" }] };
  const { effects, built } = run({ id: "t", title: "t", height: H, groundY: 900, pace: "natural", characters: [fig([{ move: "walk", params: { distance: 400 } }, { move: "custom", params: { name: "plant", keys: [{ pose: { lean: 30, rShoulder: 60, rElbow: 10, lHip: 40, lKnee: 60 }, feet: "both", hold: 0.5 }, { pose: { lean: 0 }, hold: 1 }] } }])], effects: [{ kind: "prop", start: -1.5, end: 60, anchor: { character: "a", joint: "rHand" }, params: { name: "flag", ...flag } }, { kind: "prop", start: -1.5, end: 60, anchor: { x: 1000, y: 900 }, params: { name: "flag", ...flag } }] });
  const held = effects.find((e) => e.kind === "prop" && "character" in e.anchor)!, planted = effects.find((e) => e.kind === "prop" && "x" in e.anchor)!;
  assert.ok(planted.start > 1, `not standing there before it is carried in (${planted.start})`);
  assert.ok(held.end < planted.start && planted.start - held.end < 1 / built.fps, "the carried flag ends when the planted one appears (never both, never none)");
  assert.equal(planted.layer, "back", "the planter stands in front of it");
  const hand = built.frames[Math.round(planted.start * built.fps)][0].skeleton.rHand;
  assert.ok(Math.abs(hand.x - (planted.anchor as { x: number }).x) < 2, "planted where the hand put it");
});

test("PAINT APPEARS WHERE THE BRUSH MOVES: nothing before the brush touches, then only points on the brush's path, growing", () => {
  const { effects, fx, built } = run({ id: "t", title: "t", height: H, groundY: 900, pace: "natural", characters: [fig([{ move: "custom", params: { name: "paint", keys: [{ pose: { rShoulder: 60, rElbow: 30 }, feet: "both", hold: 0.3 }, { pose: { rShoulder: 100, rElbow: 20 }, feet: "both", hold: 0.2 }, { pose: { rShoulder: 70, rElbow: 60 }, feet: "both", hold: 0.2 }, { pose: { rShoulder: 120, rElbow: 10 }, feet: "both", hold: 0.5 }] } }])], effects: [{ kind: "prop", start: -1.5, end: 60, anchor: { character: "a", joint: "rHand" }, params: { name: "paintbrush", size: 0.15, parts: [{ shape: "line", x: 0, y: 0, w: 0, h: -1, color: "#8b5a2b" }] } }, { kind: "paint", start: 0, end: 60, anchor: { x: 590, y: 700 }, params: { w: 0.6, h: 0.6, color: "#facc15" } }] });
  const p = effects.find((e) => e.kind === "paint")!, trail = p.params!.trail as number[][];
  assert.ok(trail.length >= 1 && trail.flat().length >= 9, "the brush went over the canvas");
  const count = (i: number) => fx[i].front.filter((s) => s.kind === "line" && s.stroke === "#facc15").reduce((a, s) => a + (s as { points: number[] }).points.length, 0);
  assert.equal(count(0), 0, "an empty canvas at the start");
  assert.ok(count(built.frames.length - 1) > count(Math.round(built.frames.length / 3)), "the painting grows");
  assert.ok(effects.indexOf(p) < effects.findIndex((e) => e.kind === "prop" && "character" in e.anchor), "the brush is drawn in front of the canvas");
});

test("A COVER COVERS ONLY THOSE BEHIND IT: the bush hides the body but the top of the head shows; a walker in front is drawn over it", () => {
  const bush = { kind: "prop", start: -1.5, end: 60, anchor: { x: 1300, y: 900 }, layer: "front", params: { size: 0.3, parts: [{ shape: "ellipse", x: 0, y: 0, w: 1.6, h: 1, color: "#2f7d32" }] } };
  const { effects, fx } = run({ id: "t", title: "t", height: H, groundY: 900, pace: "natural", characters: [fig([{ move: "walk", params: { distance: 1100 } }]), { id: "b", name: "B", x: 1300, facing: "left", depth: "behind", look: { color: "#16a34a" }, actions: [{ move: "custom", params: { name: "crouch", startsInPose: true, keys: [{ pose: { lean: 35, lHip: 110, lKnee: 140, rHip: 100, rKnee: 145 }, hold: 4 }] } }] }], effects: [bush] });
  const b = effects.find((e) => e.kind === "prop")!;
  assert.ok(Number(b.params!.size) > 0.3, `made big enough to hide the body (${b.params!.size})`);
  assert.ok(effects.some((e) => e.kind === "figureOver"), "the walker passing in front is drawn over the bush");
  assert.ok(fx.some((f) => f.front.some((s) => s.kind === "line" && s.stroke === "#222222")), "…in the pictures where it passes");
});

test("WATER x IS ITS MIDDLE, and a pond is natural: centred on x, a level surface, an uneven rounded shore — never a box", () => {
  const shapes = BACKGROUND_PIECES.water.draw({ kind: "water", params: { x: 1000, w: 600, h: 140, seed: 3 } }, 0, { width: 1920, groundY: 900, height: H });
  const xs = shapes.flatMap((q) => ("points" in q ? q.points.filter((_, i) => i % 2 === 0) : []));
  assert.ok(Math.abs(Math.min(...xs) - 700) < 30 && Math.abs(Math.max(...xs) - 1300) < 30, `spans 700–1300 (${Math.min(...xs)}–${Math.max(...xs)})`);
  const water = shapes.filter((q) => q.kind === "poly")[1] as { points: number[] };
  const ys = water.points.filter((_, i) => i % 2 === 1), depths = ys.filter((y) => y > 901);
  assert.ok(new Set(depths.map((y) => Math.round(y / 4))).size > 8, "the shore goes down unevenly (not one flat bottom)");
  assert.ok(Math.min(...ys) >= 899, "the surface is level at the ground line");
  const sea = BACKGROUND_PIECES.water.draw({ kind: "water", params: {} }, 0, { width: 1920, groundY: 900, height: H });
  assert.ok(sea.some((q) => q.kind === "rect"), "the sea across the page keeps its straight band");
});
