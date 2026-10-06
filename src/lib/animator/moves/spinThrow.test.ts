import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { armPathProblems, TEST_HEIGHT } from "./testkit.ts";
import type { MoveStyle } from "./styles.ts";

// GRAB, SPIN, THROW (spinThrow.ts): A grabs B (standing a fighting step away), spins him round and throws
// him; B flies off, lands on his back and kips up.
export const spinPlan = (style: MoveStyle, aFacing: "right" | "left" = "right", gap = 170): ScenePlan => ({
  id: "st", title: "st", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: 960 + (aFacing === "right" ? -1 : 1) * (gap / 2 + 250), facing: aFacing, style, energy: 0.6, actions: [{ move: "wait", params: { seconds: 0.5 } }, { move: "spinThrow", params: { target: "b" } }] },
    { id: "b", x: 960 + (aFacing === "right" ? -1 : 1) * (250 - gap / 2), facing: aFacing === "right" ? "left" : "right", style, energy: 0.5, actions: [{ move: "spunThrown", params: { from: "a" } }, { move: "kipUp" }] },
  ],
});

test("grab, spin, throw: registered, the held waist stays in the hands from grab to release, thrown away, body rules at 8/12/24 fps, both directions", () => {
  assert.ok(LIBRARY.spinThrow && LIBRARY.spunThrown);
  for (const style of ["natural", "angry"] as MoveStyle[]) for (const facing of ["right", "left"] as const) {
    const scene = planToScene(spinPlan(style, facing), LIBRARY);
    const label = `${style} ${facing}`;
    const grab = scene.marks["a.spinThrow1.grab"], spin = scene.marks["a.spinThrow1.spin"], release = scene.marks["a.spinThrow1.release"];
    assert.ok(grab !== undefined && spin > grab && release > spin + 1, `${label}: marks`);
    assert.ok(Math.abs(scene.marks["b.spunThrown1.grab"] - grab) < 1e-6, `${label}: B is grabbed when A grabs`);
    assert.ok(scene.marks["b.spunThrown1.land"] > release && scene.marks["b.kipUp1.up"] !== undefined, `${label}: lands, then kips up`);
    const way = facing === "right" ? 1 : -1;
    for (const fps of [8, 12, 24]) {
      const built = buildScene(scene, fps);
      let worst = 0, crossings = 0, last = 0;
      built.frames.forEach((frame, i) => {
        const t = i / fps;
        const A = frame.find((c) => c.id === "a")!.skeleton, B = frame.find((c) => c.id === "b")!.skeleton;
        if (t >= spin && t <= release) {
          const hand = { x: (A.lHand.x + A.rHand.x) / 2, y: (A.lHand.y + A.rHand.y) / 2 };
          worst = Math.max(worst, Math.hypot(hand.x - B.hip.x, hand.y - B.hip.y));
          const side = Math.sign(B.hip.x - A.hip.x);
          if (last && side && side !== last) crossings += 1;
          if (side) last = side;
          // (Off the floor: the feet never touch while it swings round.)
          assert.ok(Math.max(B.lFoot.y, B.rFoot.y) < 900 - 2, `${label} ${fps} fps: B's feet off the floor while spun at ${t.toFixed(2)}`);
        }
      });
      assert.ok(worst <= 3, `${label} ${fps} fps: hands ${worst.toFixed(1)} px off the waist`);
      assert.ok(crossings >= 2, `${label} ${fps} fps: swung round (${crossings} passes)`);
      // Thrown AWAY: B ends further from A than when grabbed, on the side it started.
      const endFrame = built.frames[built.frames.length - 1];
      const A = endFrame.find((c) => c.id === "a")!.skeleton, B = endFrame.find((c) => c.id === "b")!.skeleton;
      assert.ok((B.hip.x - A.hip.x) * way > 0.9 * TEST_HEIGHT, `${label} ${fps} fps: thrown away (${((B.hip.x - A.hip.x) * way).toFixed(0)} px)`);
      for (const r of built.report.characters) {
        assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label} ${fps} fps ${r.id}: body rules ${JSON.stringify(r)}`);
        assert.ok(r.maxJointStepPx < 2880 / fps, `${label} ${fps} fps ${r.id}: joint jump ${r.maxJointStepPx.toFixed(0)}`);
      }
      assert.deepEqual(armPathProblems(built.frames, fps), [], `${label} ${fps} fps: arm paths`);
    }
  }
});
