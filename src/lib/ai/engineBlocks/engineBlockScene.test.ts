import assert from "node:assert/strict";
import { test } from "node:test";
import { engineBlockScene, enginePrebuiltFrames, resampleEngineFrames } from "./engineBlockScene.ts";

const joint = (x: number, y: number) => ({ x, y });
const figure = (id: string, x: number) => ({
  id, facing: "right" as const, headRadius: 29, style: { color: "#dc2626", thickness: 7, headSize: "normal" as const, headFilled: true, neck: false },
  skeleton: Object.fromEntries(["hip", "neck", "head", "lElbow", "lHand", "rElbow", "rHand", "lKnee", "lFoot", "rKnee", "rFoot"].map((name, k) => [name, joint(x + k, 500 + k)])),
});

test("an ordinary scene has no prebuilt frames (it is built by the app engine exactly as before)", () => {
  assert.equal(enginePrebuiltFrames({ id: "s", title: "s", durationSec: 1, groundY: 900, characters: [] }), null);
});

test("engine pictures are resampled to the project's frame rate by nearest time, poses untouched", () => {
  const frames = Array.from({ length: 24 }, (_, i) => [figure("a", i)]);
  const at12 = resampleEngineFrames(frames as never, 24, 12);
  assert.equal(at12.length, 12);
  assert.deepEqual(at12[5][0], frames[10][0]);
  assert.equal(resampleEngineFrames(frames as never, 24, 24).length, 24);
});

test("a block becomes a scene with its finished frames and the figures' names", () => {
  const frames = Array.from({ length: 48 }, (_, i) => [figure("a", i), figure("b", 900 - i)]);
  const scene = engineBlockScene({ fps: 24, figures: [{ id: "a", name: "Red" }, { id: "b", name: "Blue" }], frames: frames as never, effects: [], lengthS: 2, video: null, continuedFromLastPose: false }, "Block 1", "engine-x", 12);
  assert.equal(scene.prebuiltFrames.frames.length, 24);
  assert.equal(scene.prebuiltFrames.fps, 12);
  assert.deepEqual(scene.characters.map((c) => c.name), ["Red", "Blue"]);
  assert.ok(enginePrebuiltFrames(scene));
});

test("next block from the last pose: the block slides so the carried figures continue exactly where they stopped", () => {
  const last = [figure("a", 100)], next = Array.from({ length: 4 }, (_, i) => [figure("a", 189 + i), figure("b", 600)]);
  const scene = engineBlockScene({ fps: 24, figures: [{ id: "a", name: "Red" }, { id: "b", name: "Blue" }], frames: next as never, effects: [], lengthS: 1, video: null, continuedFromLastPose: true }, "Block 2", "engine-y", 24, last as never);
  const first = scene.prebuiltFrames.frames[0];
  assert.deepEqual(first.find((c) => c.id === "a")!.skeleton, last[0].skeleton);
  assert.equal(first.find((c) => c.id === "b")!.skeleton.hip.x, 600 - 89); // the whole block slides by one amount
  assert.equal(engineBlockScene({ fps: 24, figures: [], frames: next as never, effects: [], lengthS: 1, video: null, continuedFromLastPose: false }, "B", "z", 24).prebuiltFrames.frames[0][0].skeleton.hip.x, 189);
});

test("effect pictures play in sync with the figures (same resampling) and carry the same slide", () => {
  const frames = Array.from({ length: 24 }, (_, i) => [figure("a", i)]);
  const pics = Array.from({ length: 24 }, (_, i) => (i >= 12 ? ({ id: i } as unknown as CanvasImageSource) : null));
  const scene = engineBlockScene({ fps: 24, figures: [], frames: frames as never, effects: [{ kind: "fireball" }], effectLayers: { fps: 24, stage: [1920, 1080], under: [], over: [] }, lengthS: 1, video: null, continuedFromLastPose: false }, "B", "z", 12, null, { under: pics, over: pics });
  assert.equal(scene.prebuiltEffectLayers!.over.length, scene.prebuiltFrames.frames.length);
  assert.equal(scene.prebuiltEffectLayers!.over[5], null);
  assert.equal(scene.prebuiltEffectLayers!.over[6], pics[12]);
  assert.deepEqual(scene.prebuiltEffectLayers!.shift, { x: 0, y: 0 });
});
