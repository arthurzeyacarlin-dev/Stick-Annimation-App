import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { effectsTestScenes, makeEffectsTestScene } from "./tests2c.ts";

// NO FOOT SLIDING (Arthur, 2026-10-06: "never a foot slide, ever — unless the user asks for it"). In every
// Effects (2C) test scene, a foot of a standing figure that is on the floor in two pictures in a row never moves
// sideways. (Not here: the sword fight — its own test; the teleport and the camera cut, where a figure jumps.)
const SKIP = new Set(["swordFight", "teleport", "camera"]);
const LIMIT_PX = 0.5;

for (const fps of [12, 24]) {
  test(`no planted foot slides in the Effects (2C) scenes at ${fps} fps`, { todo: "not fixed yet: feet touch the floor before their step lands / after it lifts, and the knock-down fall skids" }, () => {
    const slides: string[] = [];
    for (const entry of effectsTestScenes()) {
      if (!entry.plan || SKIP.has(entry.id)) continue;
      const scene = makeEffectsTestScene(entry.plan, 1920);
      const built = buildScene(scene, fps), ground = scene.groundY;
      for (let i = 1; i < built.frames.length; i += 1) built.frames[i].forEach((now, c) => {
        const before = built.frames[i - 1][c];
        if (!before || before.id !== now.id) return;
        const height = scene.characters.find((character) => character.id === now.id)?.height ?? 300;
        // Standing or crouching (not lying or sitting on the floor).
        if (ground - before.skeleton.hip.y <= 0.38 * height || ground - now.skeleton.hip.y <= 0.38 * height) return;
        for (const foot of ["lFoot", "rFoot"] as const) {
          const a = before.skeleton[foot], b = now.skeleton[foot];
          if (Math.abs(a.y - ground) >= 2 || Math.abs(b.y - ground) >= 2) continue;
          const moved = Math.abs(b.x - a.x);
          if (moved > LIMIT_PX && moved < 300) slides.push(`${entry.id} ${now.id}.${foot} ${moved.toFixed(1)} px at ${(i / fps).toFixed(2)} s`);
        }
      });
    }
    assert.deepEqual(slides, []);
  });
}
