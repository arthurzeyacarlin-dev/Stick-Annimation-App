import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, type Facing, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import { cleanUpScene, JOINT_PICKS, readDrawnFigure, type DrawnLook, type JointPick } from "./fromDrawing.ts";
import { choppiness, improveAnimation, slidingFeet } from "./improveAnimation.ts";

const H = 300;
const PICKS = JOINT_PICKS.map((p) => p.joint);
const LOOK: DrawnLook = { color: "#16a34a", thickness: 5, headFilled: false, headRadius: HEAD_RADIUS.normal * H };
const drawn = (pose: PoseAngles, facing: Facing, x = 700, floor = 820) => {
  const s = forwardKinematics(pose, facing, { x, y: 0 }, H, "normal", false);
  const dy = floor - Math.max(s.lFoot.y, s.rFoot.y);
  for (const p of Object.values(s)) p.y += dy;
  return Object.fromEntries(PICKS.map((j) => [j, { ...s[j] }])) as Record<JointPick, Point>;
};
const keysOf = (frames: Record<JointPick, Point>[]) => frames.map((j, frame) => ({ frame, fig: readDrawnFigure(j, LOOK) }));
const skels = (scene: Parameters<typeof buildScene>[0], fps: number) => buildScene(scene, fps).frames.map((f) => f[0].skeleton);
const diff = (a: Skeleton, b: Skeleton) => Math.max(...PICKS.map((j) => Math.hypot(a[j].x - b[j].x, a[j].y - b[j].y)));
// (f) Different from the clean-up whenever something was wrong: more pictures, or a picture 3% of the height apart.
const differs = (a: Skeleton[], b: Skeleton[]) => a.length !== b.length || a.some((s, i) => diff(s, b[i]) > 0.03 * H);
const sameLook = (scene: ReturnType<typeof improveAnimation>["scene"]) => {
  const c = scene.characters[0];
  assert.equal(c.style.headFilled, false);
  assert.equal(c.style.color, LOOK.color);
  assert.equal(c.style.thickness, LOOK.thickness);
  assert.ok(Math.abs(c.height - H) < 0.02 * H, `size kept: ${c.height}`);
};
const FPS = [8, 12, 24];

test("(a) a choppy punch drawn on ONES (3 drawings) gets in-between pictures and no joint jumps past the pace", () => {
  const guard: PoseAngles = { ...STAND, lShoulder: 60, lElbow: 110, rShoulder: 50, rElbow: 110 };
  const wind: PoseAngles = { ...guard, lean: -10, lShoulder: -20, lElbow: 130, lHip: 30, lKnee: 50, rKnee: 40 };
  const punch: PoseAngles = { lean: 15, head: -5, lShoulder: 90, rShoulder: -20, lElbow: 4, rElbow: 120, lHip: 35, rHip: -20, lKnee: 20, rKnee: 10 };
  const frames = [drawn(guard, "right", 700), drawn(wind, "right", 690), drawn(punch, "right", 700 + 0.45 * H)];
  for (const fps of FPS) {
    const keys = keysOf(frames);
    const clean = skels(cleanUpScene(keys, { fps, frameCount: 3 }), fps);
    const { scene, fixes } = improveAnimation(keys, { fps, frameCount: 3 });
    const better = skels(scene, fps);
    const b = choppiness(clean, fps, H), a = choppiness(better, fps, H);
    assert.ok(b.worst > 1.15, `${fps}: the drawing itself should be choppy (${b.worst.toFixed(2)})`);
    assert.ok(better.length > 3, `${fps}: in-betweens added (${better.length} pictures)`);
    assert.ok(a.worst < b.worst && a.worst <= 1.35, `${fps}: still jumps ${a.worst.toFixed(2)}x the pace (was ${b.worst.toFixed(2)}x)`);
    assert.ok(fixes.some((f) => /choppy/.test(f) && /in-between/.test(f)), `${fps}: ${fixes.join(" | ")}`);
    assert.ok(differs(better, clean));
    sameLook(scene);
  }
});

test("(c) a floating walk (4% of the height above its floor in the middle) is put down on the floor", () => {
  const A: PoseAngles = { lean: 6, head: 0, lShoulder: 30, rShoulder: -30, lElbow: 30, rElbow: 30, lHip: 25, rHip: -20, lKnee: 10, rKnee: 30 };
  const B: PoseAngles = { ...A, lShoulder: -30, rShoulder: 30, lHip: -20, rHip: 25, lKnee: 30, rKnee: 10 };
  const mix = (t: number) => Object.fromEntries(Object.keys(A).map((k) => [k, A[k as keyof PoseAngles] + (B[k as keyof PoseAngles] - A[k as keyof PoseAngles]) * t])) as PoseAngles;
  for (const fps of FPS) {
    const n = 24;
    const frames = Array.from({ length: n }, (_, i) => drawn(mix(0.5 - 0.5 * Math.cos((i / 6) * Math.PI)), "right", 600 + i * 0.03 * H, i >= 8 && i < 16 ? 820 - 0.04 * H : 820));
    const keys = keysOf(frames);
    const clean = skels(cleanUpScene(keys, { fps, frameCount: n }), fps);
    const { scene, fixes } = improveAnimation(keys, { fps, frameCount: n });
    const better = skels(scene, fps);
    const low = (s: Skeleton) => Math.max(s.lFoot.y, s.rFoot.y);
    for (let i = 8; i < 16; i++) assert.ok(scene.groundY - low(clean[i]) > 0.03 * H, `${fps}: clean-up keeps it floating at ${i}`);
    better.forEach((s, i) => assert.ok(scene.groundY - low(s) < 0.012 * H, `${fps}: picture ${i} still ${(scene.groundY - low(s)).toFixed(1)} px off the floor`));
    assert.ok(fixes.some((f) => /floor/.test(f)), `${fps}: ${fixes.join(" | ")}`);
    assert.ok(differs(better, clean));
    sameLook(scene);
  }
});

test("(d) sliding feet are planted", () => {
  for (const fps of FPS) {
    const n = 12;
    const frames = Array.from({ length: n }, (_, i) => drawn({ ...STAND, lShoulder: 10 + 4 * i }, "right", 700 + i * 0.02 * H));
    const keys = keysOf(frames);
    const cleanScene = cleanUpScene(keys, { fps, frameCount: n });
    const clean = skels(cleanScene, fps);
    const { scene, fixes } = improveAnimation(keys, { fps, frameCount: n });
    const better = skels(scene, fps);
    const before = slidingFeet(clean, cleanScene.groundY, H), after = slidingFeet(better, scene.groundY, H);
    assert.ok(before > 0 && after === 0, `${fps}: slides ${before} -> ${after}`);
    assert.ok(fixes.some((f) => /Planted the feet/.test(f)), `${fps}: ${fixes.join(" | ")}`);
    assert.ok(differs(better, clean));
  }
});

test("(e) a GOOD smooth animation stays nearly the same and says so", () => {
  for (const fps of FPS) {
    const n = 16;
    const frames = Array.from({ length: n }, (_, i) => drawn({ ...STAND, lShoulder: 10 + 60 * (0.5 - 0.5 * Math.cos((i / (n - 1)) * Math.PI)) * (fps / 24) }, "right"));
    const keys = keysOf(frames);
    const clean = skels(cleanUpScene(keys, { fps, frameCount: n }), fps);
    const { scene, fixes } = improveAnimation(keys, { fps, frameCount: n });
    const better = skels(scene, fps);
    assert.equal(better.length, clean.length);
    better.forEach((s, i) => assert.ok(diff(s, clean[i]) <= 0.02 * H, `${fps}: picture ${i} changed by ${diff(s, clean[i]).toFixed(1)} px`));
    assert.ok(fixes.length === 0 || (fixes.length === 1 && /Looks good/.test(fixes[0])), `${fps}: ${fixes.join(" | ")}`);
    sameLook(scene);
  }
});

// ---- Round 4: a FULL JUMP drawn horribly (Arthur: "it made my animation WORSE — crossing arms, levitating, sliding") ----
import { floorOf, measure } from "./improveAnimation.ts";
const STANDP: PoseAngles = { ...STAND, lShoulder: 8, rShoulder: -6, lElbow: 15, rElbow: 12 };
const CROUCH: PoseAngles = { lean: 25, head: -10, lShoulder: -35, rShoulder: -25, lElbow: 20, rElbow: 25, lHip: 70, rHip: 60, lKnee: 95, rKnee: 85 };
const TAKEOFF: PoseAngles = { lean: 10, head: 0, lShoulder: 150, rShoulder: 140, lElbow: 10, rElbow: 15, lHip: -5, rHip: -10, lKnee: 5, rKnee: 8 };
const TUCK: PoseAngles = { lean: 5, head: 0, lShoulder: 120, rShoulder: 100, lElbow: 30, rElbow: 40, lHip: 70, rHip: 60, lKnee: 90, rKnee: 80 };
const LAND: PoseAngles = { lean: 20, head: -5, lShoulder: 40, rShoulder: 30, lElbow: 30, rElbow: 35, lHip: 55, rHip: 45, lKnee: 75, rKnee: 65 };
const rough = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const swapLimbs = (j: Record<JointPick, Point>) => ({ ...j, lElbow: j.rElbow, rElbow: j.lElbow, lHand: j.rHand, rHand: j.lHand, lKnee: j.rKnee, rKnee: j.lKnee, lFoot: j.rFoot, rFoot: j.lFoot });
// [pose, feet above the floor (x H), hip x step]: stand, stand (floating), crouch, deeper, take-off, rising, top,
// falling, landing, dip, recover (floating), stand.
const JUMP: [PoseAngles, number][] = [[STANDP, 0], [STANDP, 0.05], [CROUCH, 0], [{ ...CROUCH, lKnee: 110, rKnee: 100, lHip: 80, rHip: 70 }, 0], [TAKEOFF, 0], [TUCK, 0.22], [TUCK, 0.32], [{ ...TUCK, lKnee: 40, rKnee: 35, lHip: 30, rHip: 25 }, 0.2], [LAND, 0], [{ ...LAND, lKnee: 95, rKnee: 85, lHip: 70, rHip: 60 }, 0], [STANDP, 0.05], [STANDP, 0]];
export function horribleJump(seed = 11) {
  const rnd = rough(seed);
  return JUMP.map(([pose, up], i) => {
    let j = drawn(pose, "right", 600 + i * 0.06 * H, 820 - up * H);
    j = Object.fromEntries(Object.entries(j).map(([k, p]) => [k, { x: p.x + 2 * rnd() * 0.03 * H + (/Foot/.test(k) && up === 0 ? 0.02 * H * i : 0), y: p.y + 2 * rnd() * 0.03 * H }])) as Record<JointPick, Point>;
    return i % 2 ? swapLimbs(j) : j;
  });
}
test("(r4-a) a FULL JUMP drawn roughly on ones (noise, swapped limbs, floating frames, drifting feet) becomes a good jump — never worse than the clean-up", () => {
  for (const fps of FPS) for (const seed of [11, 29, 47]) {
    const frames = horribleJump(seed), n = frames.length;
    const keys = keysOf(frames);
    const cleanScene = cleanUpScene(keys, { fps, frameCount: n });
    const clean = skels(cleanScene, fps);
    const { scene, fixes } = improveAnimation(keys, { fps, frameCount: n });
    const better = skels(scene, fps), F = scene.groundY, tag = `${fps}fps seed ${seed}`;
    assert.ok(Math.abs(F - floorOf(keys)) < 0.5, `${tag}: the floor is where it stood`);
    const low = (s: Skeleton) => F - Math.max(s.lFoot.y, s.rFoot.y);
    // Grounded pictures (before the take-off, from the landing on) stand ON the floor.
    for (const i of [0, 1, 2, 3, 4, 8, 9, 10, 11]) assert.ok(Math.abs(low(better[i])) <= 0.01 * H, `${tag}: picture ${i} is ${(low(better[i]) / H * 100).toFixed(1)}% off the floor`);
    for (const i of [5, 6, 7]) assert.ok(low(better[i]) > 0.05 * H, `${tag}: picture ${i} is in the air`);
    // One gravity arc: the hips' second difference is the same all through the air (take-off to landing).
    const hy = better.map((s) => s.hip.y), dd = [5, 6, 7].map((i) => hy[i + 1] - 2 * hy[i] + hy[i - 1]);
    assert.ok(dd.every((v) => v > 0) && Math.max(...dd) - Math.min(...dd) < 0.015 * H, `${tag}: not one gravity arc (${dd.map((v) => (v / H).toFixed(3)).join(", ")})`);
    const b = measure(clean, cleanScene.groundY, H, fps), a = measure(better, F, H, fps);
    assert.equal(a.floating, 0, `${tag}: floating`);
    assert.equal(a.sliding, 0, `${tag}: sliding`);
    assert.equal(a.swaps, 0, `${tag}: limb swaps`);
    for (const k of ["floating", "sliding", "swaps", "bones", "shake"] as const) assert.ok(a[k] <= b[k] + 1e-6, `${tag}: ${k} worse: ${b[k]} -> ${a[k]}`);
    assert.ok(fixes.some((f) => /gravity arc/.test(f)), `${tag}: ${fixes.join(" | ")}`);
    const c = scene.characters[0];
    assert.ok(c.style.color === LOOK.color && !c.style.headFilled && Math.abs(c.height - H) < 0.05 * H, `${tag}: look/size (${c.height.toFixed(0)}; the joints are ±3% noisy)`);
  }
});
