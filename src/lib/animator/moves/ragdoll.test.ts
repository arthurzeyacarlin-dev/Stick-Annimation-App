import test from "node:test";
import assert from "node:assert/strict";
import { floorYUnder, simulateRagdoll, type RagdollWorld } from "./ragdoll.ts";
import { forwardKinematics, translateSkeleton } from "../pose.ts";
import { FALL_GRAVITY } from "./fall.ts";
import { JOINTS, STAND, boneLengths, headRadius, withPose, type Skeleton } from "../rig.ts";

// A FALLING BODY IS WEIGHTS ON STRINGS WITH MUSCLES: a planned (stiff) body dropping onto the ground, with a rock half-way down.
const H = 300, groundY = 900, radius = headRadius(H, "normal");
const world: RagdollWorld = { groundY, H, headRadius: radius, surfaces: [{ left: 300, right: 480, top: 150 }], pits: [], page: [0, 1920] };
const pose = withPose(STAND, { lean: 40, lShoulder: 120, rShoulder: 90, lElbow: 30, rElbow: 40, lHip: 40, rHip: 10, lKnee: 50, rKnee: 30 });
function plan() {
  const times: number[] = [], targets: Skeleton[] = [];
  const g = FALL_GRAVITY * H;
  for (let i = 0; i < 48; i += 1) {
    const t = i / 24, hipY = Math.min(groundY - 0.65 * H, groundY - 2.2 * H + 0.5 * g * t * t);
    // (the plan turns the body over as it falls, like a tumble: the limbs' lag behind that turn is the ragdoll's swing)
    times.push(t); targets.push(forwardKinematics(withPose(pose, { lean: 40 + 300 * Math.min(t, 1.2) }), "right", { x: 600 + 120 * t, y: hipY }, H, "normal", true));
  }
  return { times, targets };
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test("ragdoll keeps every bone its length (within 0.5 px) in every picture", () => {
  const { times, targets } = plan();
  const out = simulateRagdoll(targets, times, world, () => 1);
  const b = boneLengths(H);
  for (const s of out) {
    assert.ok(Math.abs(dist(s.hip, s.neck) - b.torso) < 0.5);
    assert.ok(Math.abs(dist(s.neck, s.head) - (b.neck + radius)) < 0.5);
    assert.ok(Math.abs(dist(s.neck, s.lElbow) - b.upperArm) < 0.5 && Math.abs(dist(s.lElbow, s.lHand) - b.forearm) < 0.5);
    assert.ok(Math.abs(dist(s.hip, s.rKnee) - b.thigh) < 0.5 && Math.abs(dist(s.rKnee, s.rFoot) - b.shin) < 0.5);
  }
});

test("ragdoll never puts a joint under the ground or the rock it fell on", () => {
  const { times, targets } = plan();
  const out = simulateRagdoll(targets, times, world, () => 1);
  for (const s of out) for (const j of JOINTS) {
    const r = j === "head" ? radius : 0;
    assert.ok(s[j].y + r <= groundY + 0.5, `${j} under the ground`);
    assert.ok(floorYUnder(world, s[j].x, s[j].y + r - 0.04 * H) - r >= s[j].y - 0.5, `${j} under a surface`);
  }
});

test("ragdoll falls faster and faster in the air (real gravity) and its limbs swing relative to the torso", () => {
  const { times, targets } = plan();
  const out = simulateRagdoll(targets, times, world, () => 1);
  const vy = (i: number) => out[i].hip.y - out[i - 1].hip.y;
  const mean = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i += 1) s += vy(i); return s / (b - a); };
  assert.ok(mean(2, 5) < mean(5, 8) && mean(5, 8) < mean(8, 11), "falls faster and faster");
  // (the plan holds one rigid pose: any change of the arm's angle against the torso is the ragdoll's own swing)
  const armAngle = (s: Skeleton) => Math.atan2(s.lHand.y - s.neck.y, s.lHand.x - s.neck.x) - Math.atan2(s.neck.y - s.hip.y, s.neck.x - s.hip.x);
  const angles = out.map(armAngle);
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.1, "the arm swings on its own");
});

test("ragdoll weight 0 gives back the plan exactly; the blend never breaks a bone", () => {
  const { times, targets } = plan();
  const same = simulateRagdoll(targets, times, world, () => 0);
  for (const [i, s] of same.entries()) for (const j of JOINTS) assert.ok(dist(s[j], targets[i][j]) < 0.6);
  const half = simulateRagdoll(targets, times, world, () => 0.5);
  const b = boneLengths(H);
  for (const s of half) assert.ok(Math.abs(dist(s.hip, s.lKnee) - b.thigh) < 0.5);
  void translateSkeleton;
});
