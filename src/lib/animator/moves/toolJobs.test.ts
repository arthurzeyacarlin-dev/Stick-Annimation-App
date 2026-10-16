// TOOL JOBS (Arthur, Oct 15: "We mastered stick figures; now they must master TOOLS"): a two-hand grip keeps the body upright and
// in reach, a long two-hand tool is drawn through both hands without ever jumping, a long floor tool is real size with its head
// on the floor (a sliding one) and never sunk into it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardKinematics } from "../pose.ts";
import { PROPORTIONS, STAND } from "../rig.ts";
import { reachHands, twoHandGrip, TOOL_JOB_CHEST, TOOL_JOB_LEAN } from "./custom.ts";
import { EFFECTS, forearmOf, toolWorkers } from "../effects/index.ts";
import { MIN_FLOOR_TOOL } from "./transform.ts";

const sweepKey = { pose: { ...STAND, lean: 25 }, rHand: { x: 0.45, y: 0.75 }, lHand: { x: 0.56, y: 0.58 } }; // (the H03 far stroke)

test("a far two-hand grip never topples the body: lean ≤ TOOL_JOB_LEAN, both hands within reach, the tool angle kept", () => {
  const pose = reachHands(sweepKey.pose, sweepKey);
  assert.ok(pose.lean <= TOOL_JOB_LEAN + 1e-9, `lean ${pose.lean}`);
  const g = twoHandGrip(sweepKey.pose, sweepKey.rHand, sweepKey.lHand)!;
  assert.ok(g, "the grip is moved");
  assert.ok(Math.max(g.r.y, g.l.y) <= TOOL_JOB_CHEST + 1e-9, "a tool pointing down to the floor is worked from chest height");
  assert.ok(Math.abs((g.r.x - g.l.x) - (0.45 - 0.56)) < 1e-9 && Math.abs((g.r.y - g.l.y) - (0.75 - 0.58)) < 1e-9, "both hands move together");
  const b = forwardKinematics(pose, "right", { x: 0, y: 0 }, 1, "normal", false), arm = PROPORTIONS.upperArm + PROPORTIONS.forearm;
  assert.ok(Math.hypot(b.rHand.x - b.neck.x, b.rHand.y - b.neck.y) <= arm + 1e-6);
});

test("one-hand reaches and hands far apart are not a tool grip", () => {
  assert.equal(twoHandGrip(STAND, { x: 0.6, y: 0.8 }, undefined), undefined);
  assert.equal(twoHandGrip(STAND, { x: 0.6, y: 0.8 }, { x: -0.4, y: 0.8 }), undefined);
});

test("a named two-hand tool is held in both hands whatever move works it", () => {
  const scene = { effects: [{ kind: "prop", start: 0, end: 5, anchor: { character: "a", joint: "rHand" }, params: { name: "broom" } }, { kind: "prop", start: 0, end: 5, anchor: { character: "b", joint: "rHand" }, params: { name: "cup" } }] } as never;
  const w = toolWorkers(scene);
  assert.ok(w.has("a") && !w.has("b"));
});

test("the shaft turns smoothly from along the forearm to through the other hand (no jump as the hands part)", () => {
  const sk = (ox: number, oy: number) => [{ id: "a", facing: "right", skeleton: { rHand: { x: 100, y: 100 }, rElbow: { x: 70, y: 80 }, lHand: { x: 100 + ox, y: 100 + oy }, lElbow: { x: 60, y: 110 } } }] as never;
  const anchor = { character: "a", joint: "rHand" } as never;
  let prev = forearmOf(anchor, sk(1, 0), true)!;
  for (let k = 1; k <= 60; k += 1) {
    const f = forearmOf(anchor, sk(0.8 * k, 0.7 * k), true)!;
    assert.ok(Math.hypot(f.x - prev.x, f.y - prev.y) < 0.2, `step ${k}`);
    prev = f;
  }
  assert.ok(prev.y > 0.6, "far apart: down through the lower hand");
});

const drawHeld = (name: string, hand: { x: number; y: number }, forearm: { x: number; y: number }) => {
  const parts = [{ shape: "line", x: 0, y: -0.15, w: 0, h: 0.9 }, { shape: "rect", x: 0, y: 0.8, w: 0.3, h: 0.14 }];
  const shapes = EFFECTS.prop.draw({ t: 0, duration: 5, fps: 24, at: hand, height: 300, groundY: 900, stageWidth: 1920, facing: "right", forearm } as never, { name, size: 0.5, parts } as never);
  const ys = shapes.flatMap((s) => ("points" in s ? (s.points as number[]).filter((_, i) => i % 2) : "h" in s ? [(s as { y: number }).y, (s as { y: number; h: number }).y + (s as { h: number }).h] : [(s as { y: number }).y]));
  return Math.max(...ys);
};
test("a long floor tool is real size: a broom held at chest height reaches the floor; never sunk into it", () => {
  const chest = { x: 700, y: 900 - 0.68 * 300 };
  assert.ok(Math.abs(drawHeld("broom", chest, { x: 0.6, y: 0.8 }) - 900) < 0.04 * 300, "the head rests on the floor");
  assert.ok(drawHeld("broom", { x: 700, y: 900 - 0.4 * 300 }, { x: 0, y: 1 }) <= 900 + 0.02 * 300, "a low hand: the broom is not sunk");
  assert.ok(drawHeld("shovel", { x: 700, y: 900 - 0.4 * 300 }, { x: 0, y: 1 }) <= 900 + 0.1 * 300, "a shovel bites a blade's depth at most");
  assert.ok(MIN_FLOOR_TOOL >= 0.8);
});
