import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { armPathProblems } from "./testkit.ts";
import { COMBO_TESTS, makeSurpriseScene, makeTestScene, SINGLE_MOVE_TESTS, type TestLook } from "./tests.ts";

// ARM PATHS (Arthur, round 6): arms never windmill and never loop round the outside of the head, in
// every review scene and in combos nobody wrote.
const looks: TestLook[] = [
  { style: "natural", speed: "normal", energy: 0.5, direction: 1 }, { style: "angry", speed: "fast", energy: 0.85, direction: -1 },
  { style: "tired", speed: "slow", energy: 0.2, direction: 1 }, { style: "robot", speed: "normal", energy: 0.5, direction: -1 },
];

test("arm paths: no windmill, nothing going around the head, in every review scene", () => {
  for (const look of looks) for (const entry of [...SINGLE_MOVE_TESTS, ...COMBO_TESTS]) {
    const problems = armPathProblems(buildScene(makeTestScene(entry.id, look, 1920), 24).frames, 24);
    assert.deepEqual(problems, [], `${entry.title} (${look.style}): ${problems.join("; ")}`);
  }
});

test("arm paths: no windmill, nothing going around the head, in random combos nobody wrote", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const look = looks[seed % looks.length];
    const scene = makeSurpriseScene(seed * 7919, look, 1920);
    const problems = armPathProblems(buildScene(scene, 24).frames, 24);
    assert.deepEqual(problems, [], `seed ${seed}: ${scene.title} (${look.style}): ${problems.join("; ")}`);
  }
});
