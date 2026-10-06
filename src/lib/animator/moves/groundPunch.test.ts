import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { distanceToBody } from "./grapple.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { armPathProblems, assertNatural, TEST_HEIGHT } from "./testkit.ts";
import { MOVE_STYLES, type MoveStyle } from "./styles.ts";

// GROUND PUNCH (groundPunch.ts): Blue goes to Red lying on his back, hops up, fist cocked high, comes
// down with gravity and punches ON Red's chest as he lands; Red covers up and is driven flat on it.
export const groundPunchPlan = (style: MoveStyle, gap = 380, aFacing: "right" | "left" = "right"): ScenePlan => ({
  id: "gp", title: "gp", height: TEST_HEIGHT, groundY: 900,
  characters: [
    { id: "a", x: 960 + (aFacing === "right" ? -1 : 1) * gap / 2, facing: aFacing, style, energy: 0.6, actions: [{ move: "wait", params: { seconds: 1.3 } }, { move: "groundPunch", params: { target: "b" } }] },
    { id: "b", x: 960 + (aFacing === "right" ? 1 : -1) * gap / 2, facing: aFacing === "right" ? "left" : "right", style, energy: 0.5, actions: [{ move: "fallDown", params: { direction: "back" } }, { move: "coverUp", params: { from: "a" } }, { move: "kipUp" }] },
  ],
});

// How far A's fists (the nearer one) are from B's body (torso and arms) from the landing through 0.1 s.
export function fistContact(scene: ReturnType<typeof planToScene>, fps: number) {
  const built = buildScene(scene, fps);
  const t = scene.marks["a.groundPunch1.stomp"];
  let off = 0;
  for (let i = Math.ceil(t * fps - 1e-6); i <= Math.floor((t + 0.1) * fps + 1e-6); i += 1) {
    const frame = built.frames[i];
    const a = frame.find((c) => c.id === "a")!.skeleton, b = frame.find((c) => c.id === "b")!.skeleton;
    off = Math.max(off, Math.min(distanceToBody(a.lHand, b), distanceToBody(a.rHand, b)));
  }
  return { built, off };
}

test("ground punch: Blue hops in the air and his fist lands ON Red's body as he lands; Red covers up on it (every mood, both ways, 8/12/24 fps)", () => {
  for (const style of MOVE_STYLES) for (const facing of ["right", "left"] as const) {
    const scene = planToScene(groundPunchPlan(style, 380, facing), LIBRARY);
    const label = `${style}/${facing}`;
    assertNatural(scene, label);
    assert.ok(scene.marks["a.groundPunch1.stomp"] !== undefined, `${label}: the punch happens`);
    assert.ok(Math.abs(scene.marks["b.coverUp1.hit"] - scene.marks["a.groundPunch1.stomp"]) < 1e-6, `${label}: Red reacts when the fist lands`);
    // In the air between the hop and the landing (both feet off the floor at the top).
    for (const fps of [8, 12, 24]) {
      const { built, off } = fistContact(scene, fps);
      assert.ok(off <= 7, `${label}@${fps}: the fist lands ${off.toFixed(1)} px off Red's body`);
      assert.deepEqual(armPathProblems(built.frames, fps, 2400 / fps), [], `${label}@${fps}: arm paths`);
      for (const r of built.report.characters) {
        assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label}@${fps}: body rules (${JSON.stringify(r)})`);
        assert.ok(r.maxJointStepPx < 2880 / fps, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)} px`);
      }
      const top = built.frames[Math.round(scene.marks["a.groundPunch1.top"] * fps)].find((c) => c.id === "a")!.skeleton;
      assert.ok(900 - Math.max(top.lFoot.y, top.rFoot.y) > 0.05 * TEST_HEIGHT, `${label}@${fps}: off the floor at the top of the hop`);
      // ANTICIPATION: the punching fist is up over the head at the top of the hop.
      assert.ok(Math.min(top.lHand.y, top.rHand.y) < top.head.y, `${label}@${fps}: a fist is up over the head at the top`);
    }
  }
});

// RUNNING HAMMER STRIKE (round 15, Arthur: "how do I get there as fast as I can? ... running ... he could hop,
// and it should be a HAMMER STRIKE with his hand"): from far away Blue runs in and hops straight off a landing
// with the run's speed (no plant, crouch, hop), both fists high over his head, and they come down ON Red.
test("ground punch run in: a running hop off the stride, both fists up over the head, landing ON the body (every mood, both ways, 8/12/24 fps)", () => {
  for (const style of MOVE_STYLES) for (const facing of ["right", "left"] as const) {
    const scene = planToScene(groundPunchPlan(style, 900, facing), LIBRARY);
    const label = `run-in ${style}/${facing}`;
    assertNatural(scene, label);
    const stomp = scene.marks["a.groundPunch1.stomp"];
    assert.ok(stomp !== undefined, `${label}: the punch happens`);
    assert.ok(Math.abs(scene.marks["b.coverUp1.hit"] - stomp) < 1e-6, `${label}: Red reacts when the fists land`);
    for (const fps of [8, 12, 24]) {
      const { built, off } = fistContact(scene, fps);
      assert.ok(off <= 7, `${label}@${fps}: the fist lands ${off.toFixed(1)} px off Red's body`);
      assert.deepEqual(armPathProblems(built.frames, fps, 2400 / fps), [], `${label}@${fps}: arm paths`);
      for (const r of built.report.characters) {
        assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label}@${fps}: body rules (${JSON.stringify(r)})`);
        assert.ok(r.maxJointStepPx < 2880 / fps, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)} px`);
      }
      const top = built.frames[Math.round(scene.marks["a.groundPunch1.top"] * fps)].find((c) => c.id === "a")!.skeleton;
      assert.ok(Math.min(top.lHand.y, top.rHand.y) < top.head.y, `${label}@${fps}: a fist is up over the head at the top`);
      // NO STOP (an upbeat mood runs in): the hips keep going fast through the gather, the hop and the landing.
      if (style === "natural" || style === "angry" || style === "happy") {
        const hipX = (t: number) => built.frames[Math.round(t * fps)].find((c) => c.id === "a")!.skeleton.hip.x;
        const speed = Math.abs(hipX(stomp) - hipX(stomp - 0.6)) / (Math.round(stomp * fps) - Math.round((stomp - 0.6) * fps)) * fps;
        assert.ok(speed > 1.2 * TEST_HEIGHT, `${label}@${fps}: the hips only go ${(speed / TEST_HEIGHT).toFixed(2)} heights/s into the strike`);
        // HAMMER: both fists up over the head at the top, both on the body at the landing.
        assert.ok(Math.max(top.lHand.y, top.rHand.y) < top.head.y, `${label}@${fps}: both fists up over the head at the top`);
        const hit = built.frames[Math.ceil(stomp * fps - 1e-6)].find((c) => c.id === "a")!.skeleton, b = built.frames[Math.ceil(stomp * fps - 1e-6)].find((c) => c.id === "b")!.skeleton;
        assert.ok(Math.max(distanceToBody(hit.lHand, b), distanceToBody(hit.rHand, b)) <= 7, `${label}@${fps}: both fists land on Red`);
      }
    }
  }
});
