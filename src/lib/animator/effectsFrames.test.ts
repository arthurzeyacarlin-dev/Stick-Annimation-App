import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_PIECES, EFFECTS } from "./effects/index.ts";
import type { EffectTrack } from "./effects/types.ts";
import { buildScene, type Scene } from "./engine.ts";
import { DEFAULT_STYLE, STAND } from "./rig.ts";
import { centerAnimation } from "./stageFit.ts";

// SPEC-0017 Phase 2C: effects drawn into the AI layer's pictures, and a background on its own layer.

// Node has no canvas: a recording stand-in (the same approach as objects.test.ts).
const calls: string[] = [];
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (target, name: string) => name in target ? target[name] : (...args: number[]) => {
    calls.push(`${name}(${args.map((a) => Math.round(a)).join(",")})`);
    if (name === "createLinearGradient") return { addColorStop: () => undefined };
    return name === "getImageData" ? { data: new Uint8ClampedArray(args[2] * args[3] * 4) } : undefined;
  },
  set: (target, name: string, value) => { target[name] = value; return true; },
});
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(width: number, height: number) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4); }
}
const g = globalThis as unknown as Record<string, unknown>;
g.ImageData = TestImageData;
g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx; } };
const { rasterizeFrames, rasterizeShapeFrames, sceneEffectLayers, shapesStageBox } = await import("./toFrames.ts");

// Fake recipes (the real ones are being written by other helpers): a dot that grows, at the anchor; a sky
// rectangle and a drifting cloud for the background.
EFFECTS["test-dot"] = { id: "test-dot", about: "test", draw: (c, p) => [{ kind: "circle", x: c.at.x, y: c.at.y, r: 10 + c.t * 20, fill: p.color ?? "#ff0000", glow: 6 }] };
BACKGROUND_PIECES["test-sky"] = { id: "test-sky", about: "test", draw: (_piece, _t, stage) => [{ kind: "rect", x: 0, y: 0, w: stage.width, h: stage.groundY, fill: "#102040", fill2: "#304080" }] };
BACKGROUND_PIECES["test-cloud"] = { id: "test-cloud", about: "test", draw: (_piece, t) => [{ kind: "circle", x: 300 + t * 40, y: 150, r: 50, fill: "#ffffff" }] };

const GROUND = 900;
const still = (extra: Partial<Scene & { effects: EffectTrack[]; background: { pieces: { kind: string }[] } }> = {}): Scene => ({
  id: "fx", title: "Effects", durationSec: 1, groundY: GROUND,
  characters: [{ id: "a", name: "a", facing: "right", height: 300, style: DEFAULT_STYLE, keys: [{ t: 0, x: 960, pose: STAND, contacts: ["lFoot", "rFoot"] }] }],
  ...extra,
} as Scene);
const map = { scale: 1, offsetX: 0, offsetY: 0 };
const record = <T,>(run: () => T) => { calls.length = 0; const result = run(); return { result, calls: calls.slice() }; };

test("a scene with an effect track draws the effect into the same pictures (back, figures, front)", () => {
  const scene = still({ effects: [
    { kind: "test-dot", start: 0, end: 1, anchor: { character: "a", joint: "rHand" }, params: { color: "#00ff00" } },
    { kind: "test-dot", start: 0, end: 1, anchor: { x: 200, y: 200 }, layer: "back" },
  ] });
  const built = buildScene(scene, 12);
  const centered = centerAnimation(built.frames, 1920);
  const layers = sceneEffectLayers(scene, built, centered.shift);
  assert.equal(layers.effects?.length, built.frames.length, "one entry per picture");
  assert.equal(layers.background, undefined, "no background asked for");
  // The front dot follows the (centered) hand; the fixed back dot slides with the animation.
  const hand = centered.frames[0][0].skeleton.rHand;
  const front = layers.effects![0].front[0], back = layers.effects![0].back[0];
  assert.ok(front.kind === "circle" && Math.abs(front.x - hand.x) < 1e-9 && Math.abs(front.y - hand.y) < 1e-9);
  assert.ok(back.kind === "circle" && Math.abs(back.x - (200 + centered.shift.x)) < 1e-9 && Math.abs(back.y - (200 + centered.shift.y)) < 1e-9);

  const { result: raster, calls: drawn } = record(() => rasterizeFrames(centered.frames, 1920, 1080, map, centered.objects, { effects: layers.effects }));
  // The figure is still, but the dots grow: every picture is drawn (no holds).
  assert.ok(raster.every((r) => !r.hold), "growing effect: no holds");
  // The picture's box grows to hold the far-away back dot.
  const first = raster[0].bitmap!;
  assert.ok(first.width > 1920 / 2, `picture box covers the back dot (width ${first.width})`);
  // Draw order in a picture: the back dot, then the figure (its head arc), then the front dot.
  const one = record(() => rasterizeFrames(centered.frames.slice(0, 1), 1920, 1080, map, undefined, { effects: layers.effects!.slice(0, 1) })).calls;
  const arcs = one.map((c, i) => [c, i] as const).filter(([c]) => c.startsWith("arc("));
  assert.equal(arcs.length, 3, "back dot, head, front dot");
  assert.ok(arcs[0][0].startsWith(`arc(${Math.round(back.x)},${Math.round(back.y)},10,`), arcs[0][0]);
  assert.ok(arcs[2][0].startsWith(`arc(${Math.round(front.x)},${Math.round(front.y)},10,`), arcs[2][0]);
  assert.ok(one.filter((c) => c.startsWith("fill(")).length >= 2, "both dots are filled");
  assert.ok(drawn.some((c) => c.startsWith("getImageData(")));
});

test("a scene without effects is drawn exactly as before", () => {
  const scene = still();
  const built = buildScene(scene, 12);
  const centered = centerAnimation(built.frames, 1920);
  assert.deepEqual(sceneEffectLayers(scene, built, centered.shift), {}, "nothing to add");
  const before = record(() => rasterizeFrames(centered.frames, 1920, 1080, map, centered.objects));
  // Empty effect lists (an effect outside its time, or a recipe that draws nothing yet) change nothing either.
  const empty = built.frames.map(() => ({ back: [], front: [] }));
  const withEmpty = record(() => rasterizeFrames(centered.frames, 1920, 1080, map, centered.objects, { effects: empty }));
  assert.deepEqual(withEmpty.calls, before.calls);
  assert.deepEqual(withEmpty.result, before.result);
  // An effect id with no recipe draws nothing: the scene is still drawn as before.
  const unknown = still({ effects: [{ kind: "no-such-effect", start: 0, end: 1, anchor: { x: 0, y: 0 } }] });
  assert.deepEqual(sceneEffectLayers(unknown, buildScene(unknown, 12), centered.shift), {});
  // Effects never change the figures.
  assert.deepEqual(buildScene(still({ effects: [{ kind: "test-dot", start: 0, end: 1, anchor: { x: 0, y: 0 } }] }), 12).frames, built.frames);
});

test("a background scene gives its own layer's pictures (still parts held, moving parts redrawn)", () => {
  const sky = still({ background: { pieces: [{ kind: "test-sky" }] } });
  const built = buildScene(sky, 12);
  const layers = sceneEffectLayers(sky, built, { x: 0, y: 0 });
  assert.equal(layers.effects, undefined, "no effects in the figure layer");
  assert.equal(layers.background?.length, built.frames.length);
  const { result: pictures, calls: drawn } = record(() => rasterizeShapeFrames(layers.background!, 1920, 1080, map));
  assert.equal(pictures.length, built.frames.length);
  assert.ok(!pictures[0].hold && pictures[0].bitmap!.width === 1920, "the sky covers the stage width");
  assert.ok(pictures.slice(1).every((p) => p.hold), "a still background is one picture, then holds");
  assert.ok(drawn.some((c) => c.startsWith("fillRect(0,0,1920,900)")), "the sky is drawn");

  const cloudy = still({ background: { pieces: [{ kind: "test-sky" }, { kind: "test-cloud" }] } });
  const moving = sceneEffectLayers(cloudy, buildScene(cloudy, 12), { x: 10, y: -20 });
  const cloud = moving.background![0][1];
  assert.ok(cloud.kind === "circle" && cloud.x === 310 && cloud.y === 130, "slid with the animation");
  assert.ok(rasterizeShapeFrames(moving.background!, 1920, 1080, map).every((p) => !p.hold), "a drifting cloud: every picture drawn");
  // Memory guard: when every new page-sized picture would be too much, the moving parts are redrawn only
  // every few pictures (still a picture where it stops).
  const everyPicture = moving.background!.length * 1920 * 1080 * 4;
  const guarded = rasterizeShapeFrames(moving.background!, 1920, 1080, map, { maxBytes: everyPicture / 4 });
  const drawnCount = guarded.filter((p) => !p.hold).length;
  assert.ok(drawnCount <= Math.ceil(moving.background!.length / 4) + 1 && drawnCount >= 2, `redrawn ${drawnCount} times`);
  assert.ok(!guarded[0].hold && !guarded.at(-1)!.hold, "first and last pictures are drawn");
  // An empty background picture is an empty frame, not an error.
  assert.equal(rasterizeShapeFrames([[]], 1920, 1080, map)[0].bitmap!.width >= 0, true);
  assert.ok(!Number.isFinite(shapesStageBox([]).left));
});
