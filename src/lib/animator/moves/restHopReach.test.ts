// H62 (2026-10-07): A TIRED REST NEVER FREEZES IN A SQUAT; EVERY TAKE-OFF HAS A WIND-UP.
import test from "node:test";
import assert from "node:assert/strict";
import { buildScene } from "../engine.ts";
import { planToScene } from "./plan.ts";
import { LIBRARY } from "./library.ts";
import { crouchedOnFeet, onTheGround } from "./turn.ts";
import { STAND } from "../rig.ts";

const H = 300, G = 900;
const run = (actions: unknown[], fps = 24) => {
  const scene = planToScene({ id: "t", title: "t", height: H, groundY: G, characters: [{ id: "a", x: 300, facing: "right", actions }] } as never, LIBRARY);
  return { scene, frames: buildScene(scene, fps).frames as { skeleton: Record<string, { x: number; y: number }> }[][] };
};
const hipUp = (f: { skeleton: Record<string, { x: number; y: number }> }[]) => G - f[0].skeleton.hip.y;
const neckUp = (f: { skeleton: Record<string, { x: number; y: number }> }[]) => G - f[0].skeleton.neck.y;

test("a deep landing crouch is on its feet (it can rise), sitting is not", () => {
  const squat = { ...STAND, lHip: 95, rHip: 95, lKnee: 130, rKnee: 130, lean: 20 };
  assert.ok(onTheGround(squat) ? crouchedOnFeet(squat) : true);
  assert.equal(crouchedOnFeet({ ...STAND, lean: 80 }), false);
});

for (const [name, actions] of [
  ["run + 3 jumps + tired catchBreath 4 s", [{ move: "run", params: { distance: 600 } }, ...[1, 2, 3].map(() => ({ move: "jump", params: { height: 0.3, distance: 150 } })), { move: "catchBreath", params: { seconds: 4 }, style: "tired", speed: "normal", energy: 0.2 }]],
  ["a landing straight into a tired catchBreath", [{ move: "jump", params: { height: 0.4, distance: 200 } }, { move: "catchBreath", params: { seconds: 4 }, style: "tired", energy: 0.2 }]],
] as const) {
  test(`TIRED REST NEVER FREEZES IN A SQUAT: ${name}`, () => {
    const { frames, scene } = run(actions as unknown as unknown[]);
    const restStart = Math.round((scene.durationSec - 4.5) * 24);
    const rest = frames.slice(restStart);
    const stand = hipUp(frames[0]);
    // Bent over, knees only a little bent: the hips stay well above a deep squat for the rest.
    assert.ok(Math.min(...rest.slice(12).map(hipUp)) > 0.7 * stand, `hips sank to ${Math.min(...rest.slice(12).map(hipUp))} (stand ${stand})`);
    // It breathes (the chest moves) — never one frozen pose.
    const necks = rest.slice(12, -30).map(neckUp);
    assert.ok(Math.max(...necks) - Math.min(...necks) > 2, "the rest is frozen");
    // And it stands back up at the end.
    assert.ok(hipUp(frames[frames.length - 1]) > 0.9 * stand, "it doesn't stand back up");
  });
}

test("EVERY TAKE-OFF HAS A WIND-UP: celebrate's hop and small jumps dip visibly before leaving the ground", () => {
  for (const actions of [[{ move: "celebrate", params: { kind: "hop" } }], [{ move: "jump", params: { height: 0.05 } }], [{ move: "jump", params: { height: 0.15 } }]]) {
    const { frames } = run(actions);
    const feet = frames.map((f) => G - Math.max(f[0].skeleton.lFoot.y, f[0].skeleton.rFoot.y));
    const off = feet.findIndex((y) => y > 3);
    assert.ok(off > 0, `${actions[0].move} never leaves the ground`);
    const dip = hipUp(frames[0]) - Math.min(...frames.slice(0, off).map(hipUp));
    assert.ok(dip >= 0.05 * H, `${actions[0].move}: a ${dip.toFixed(1)} px dip before take-off is too small to see`);
  }
});

test("A STRIKE MUST REACH: three punches from far away (no target / target red) at block, block, almostFall land at striking distance", () => {
  for (const params of [{}, { target: "red" }]) {
    const plan = { id: "t", title: "t", height: H, groundY: G, characters: [
      { id: "blue", x: 500, facing: "right", actions: [1, 2, 3].map(() => ({ move: "punch", params })) },
      { id: "red", x: 1300, facing: "left", actions: [{ move: "block" }, { move: "block" }, { move: "almostFall" }] }] };
    const scene = planToScene(plan as never, LIBRARY);
    const fps = 24, frames = buildScene(scene, fps).frames as { skeleton: Record<string, { x: number; y: number }> }[][];
    for (const n of [1, 2, 3]) {
      const hit = scene.marks[`blue.strike${n}.hit`], answer = scene.marks[`red.getHit${n}.hit`];
      assert.ok(hit !== undefined && answer !== undefined && Math.abs(hit - answer) < 0.05, `punch ${n} (${JSON.stringify(params)}) isn't answered at its moment`);
      const f = frames[Math.min(frames.length - 1, Math.round(hit * fps))];
      const gap = f[1].skeleton.hip.x - f[0].skeleton.hip.x;
      assert.ok(gap < 0.8 * H, `punch ${n} (${JSON.stringify(params)}) lands from ${Math.round(gap)} px away`);
      // (and the fist really gets there: within a head of red's body)
      const fist = Math.max(f[0].skeleton.lHand.x, f[0].skeleton.rHand.x);
      assert.ok(fist > f[1].skeleton.hip.x - 0.35 * H, `punch ${n}: the fist stops ${Math.round(f[1].skeleton.hip.x - fist)} px short`);
    }
  }
});
