import assert from "node:assert/strict";
import { test } from "node:test";
import { easeValue, monotoneTangents, sampleChannel } from "./easing.ts";
import { buildScene, frameCountFor, framesIdentical } from "./engine.ts";
import { solveTwoBone } from "./ik.ts";
import { forwardKinematics } from "./pose.ts";
import { STAND } from "./rig.ts";
import { ENGINE_TEST_SCENES } from "./testScenes.ts";

const FPS_VALUES = [12, 24];

for (const scene of ENGINE_TEST_SCENES) {
  for (const fps of FPS_VALUES) {
    test(`${scene.title} @${fps}fps: bones, feet, ground and joint steps`, () => {
      const result = buildScene(scene, fps);
      assert.equal(result.frames.length, frameCountFor(scene.durationSec, fps));
      for (const report of result.report.characters) {
        assert.ok(report.maxBoneErrorPx <= 0.5, `${report.id} bone error ${report.maxBoneErrorPx}`);
        assert.ok(report.maxFootDriftPx <= 1, `${report.id} foot drift ${report.maxFootDriftPx}`);
        assert.equal(report.belowGroundFrames, 0, `${report.id} below ground`);
        assert.equal(report.clampedAngles, 0, `${report.id} hand-written poses should already be inside the limits`);
        // No joint teleports: even the fastest arm swing moves less than ~a fifth of the stage height per frame.
        assert.ok(report.maxJointStepPx < (fps === 12 ? 230 : 160), `${report.id} joint step ${report.maxJointStepPx}`);
      }
      assert.ok(result.report.ok);
    });
  }
}

test("knees and elbows bend the right way for the facing", () => {
  for (const scene of ENGINE_TEST_SCENES) {
    for (const frame of buildScene(scene, 12).frames) {
      for (const character of frame) {
        if (character.facing === "front") continue;
        const s = character.skeleton;
        const forward = character.facing === "right" ? 1 : -1;
        for (const side of ["l", "r"] as const) {
          const hip = s.hip, knee = s[`${side}Knee`], foot = s[`${side}Foot`];
          // Knee sits on the front side of the hip->foot line (cross product sign).
          const cross = (foot.x - hip.x) * (knee.y - hip.y) - (foot.y - hip.y) * (knee.x - hip.x);
          assert.ok(cross * forward <= 1e-6 * Math.hypot(foot.x - hip.x, foot.y - hip.y) + 1, `${scene.id} ${side} knee bends backwards`);
        }
      }
    }
  }
});

test("planted feet do not slide", () => {
  const squat = ENGINE_TEST_SCENES.find((scene) => scene.id === "squat")!;
  const frames = buildScene(squat, 24).frames;
  const first = frames[0][0].skeleton;
  for (const frame of frames) {
    const s = frame[0].skeleton;
    assert.ok(Math.abs(s.lFoot.x - first.lFoot.x) <= 1 && Math.abs(s.rFoot.x - first.rFoot.x) <= 1);
  }
});

test("the jump leaves the ground and lands", () => {
  const jump = ENGINE_TEST_SCENES.find((scene) => scene.id === "jump")!;
  const frames = buildScene(jump, 24).frames;
  const highest = Math.min(...frames.map((frame) => Math.max(frame[0].skeleton.lFoot.y, frame[0].skeleton.rFoot.y)));
  assert.ok(jump.groundY - highest > 100, "feet rise more than 100px");
  const last = frames[frames.length - 1][0].skeleton;
  assert.ok(Math.abs(Math.max(last.lFoot.y, last.rFoot.y) - jump.groundY) < 0.5, "lands on the ground");
});

test("high-five hands meet in the middle", () => {
  const scene = ENGINE_TEST_SCENES.find((s) => s.id === "high-five")!;
  const frames = buildScene(scene, 24).frames;
  const closest = Math.min(...frames.map(([a, b]) => Math.hypot(a.skeleton.lHand.x - b.skeleton.lHand.x, a.skeleton.lHand.y - b.skeleton.lHand.y)));
  assert.ok(closest < 16, `hands come within ${closest.toFixed(1)}px`);
});

test("same scene gives the same frames", () => {
  const a = buildScene(ENGINE_TEST_SCENES[3], 12), b = buildScene(ENGINE_TEST_SCENES[3], 12);
  assert.ok(a.frames.every((frame, i) => framesIdentical(frame, b.frames[i])));
});

test("easing curves start at 0, end at 1 and never go backwards", () => {
  for (const ease of ["linear", "in", "out", "inOut"] as const) {
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const v = easeValue(ease, i / 100);
      assert.ok(v >= previous - 1e-12);
      previous = v;
    }
    assert.equal(easeValue(ease, 0), 0);
    assert.equal(easeValue(ease, 1), 1);
  }
  const times = [0, 1, 2, 3], values = [0, 10, 10, 30];
  const tangents = monotoneTangents(times, values);
  for (let t = 1; t <= 2; t += 0.05) assert.ok(Math.abs(sampleChannel(times, values, tangents, [], t) - 10) < 1e-9, "a hold stays still (no overshoot)");
});

test("forward kinematics keeps the rig proportions and two-bone IK keeps lengths", () => {
  const s = forwardKinematics(STAND, "right", { x: 0, y: 0 }, 400);
  assert.ok(Math.abs(Math.hypot(s.neck.x - s.hip.x, s.neck.y - s.hip.y) - 120) < 1e-9);
  const solved = solveTwoBone({ x: 0, y: 0 }, { x: 30, y: 150 }, 92, 92, { x: 1, y: 0 });
  assert.ok(Math.abs(Math.hypot(solved.mid.x, solved.mid.y) - 92) < 1e-9);
  assert.ok(Math.abs(Math.hypot(solved.end.x - solved.mid.x, solved.end.y - solved.mid.y) - 92) < 1e-9);
  assert.ok(solved.drift < 1e-6);
  assert.ok(solved.mid.x > 0, "knee points the requested way");
});
