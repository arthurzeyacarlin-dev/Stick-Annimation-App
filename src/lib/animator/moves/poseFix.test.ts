import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { HEAD_RADIUS, STAND, STAND_FRONT, type Facing, type Point, type PoseAngles, type Skeleton } from "../rig.ts";
import { cleanUpScene, JOINT_PICKS, readDrawnFigure, type DrawnLook, type JointPick, type ReadFigure } from "./fromDrawing.ts";
import { fixPose, namePose } from "./poseFix.ts";

const H = 300;
const PICKS = JOINT_PICKS.map((p) => p.joint);
const LOOK: DrawnLook = { color: "#2563eb", thickness: 6, headFilled: true, headRadius: HEAD_RADIUS.normal * H };
const drawn = (pose: PoseAngles, facing: Facing, x = 700, floor = 820) => {
  const s = forwardKinematics(pose, facing, { x, y: 0 }, H, "normal", false);
  const dy = floor - Math.max(s.lFoot.y, s.rFoot.y);
  for (const p of Object.values(s)) p.y += dy;
  return Object.fromEntries(PICKS.map((j) => [j, { ...s[j] }])) as Record<JointPick, Point>;
};
const read = (pose: PoseAngles, facing: Facing) => readDrawnFigure(drawn(pose, facing), LOOK, { height: H, facing });
const feetMid = (j: Record<JointPick, Point>) => (j.lFoot.x + j.rFoot.x) / 2;
const footY = (j: Record<JointPick, Point>) => Math.max(j.lFoot.y, j.rFoot.y);
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(1)} vs ${b.toFixed(1)}`);
const pairOf = (p: PoseAngles, a: "Shoulder" | "Elbow" | "Hip" | "Knee") => [p[`l${a}`], p[`r${a}`]].sort((x, y) => x - y);

// Arthur: "I drew a stick figure that's standing, but he's leaning, limping — but he ain't hurt."
const LIMPING: PoseAngles = { lean: 15, head: 6, lShoulder: 28, rShoulder: -22, lElbow: 30, rElbow: 2, lHip: 9, rHip: -7, lKnee: 20, rKnee: 2 };
test("a LEANING, LIMPING stand becomes a proper stand: upright, legs even and straight, arms neat, feet where drawn", () => {
  for (const facing of ["right", "left"] as Facing[]) {
    const fig = read(LIMPING, facing);
    const r = fixPose(fig);
    assert.equal(r.kind, "stand");
    assert.ok(r.changed, `${facing}: changed`);
    const p = r.fig.pose;
    near(p.lean, 0, 0.5, `${facing} spine upright`);
    near(p.head, 0, 0.5, `${facing} head`);
    near(p.lKnee, p.rKnee, 0.5, `${facing} knees even`);
    assert.ok(p.lKnee <= 4, `${facing}: knees straight (${p.lKnee})`);
    near(p.lHip + p.rHip, STAND.lHip + STAND.rHip, 0.5, `${facing} legs symmetric`);
    assert.deepEqual(pairOf(p, "Shoulder"), pairOf(STAND, "Shoulder"), `${facing}: arms neat`);
    // Weight over the feet: the feet stay where they were drawn (the hips moved over them), on the same floor.
    near(feetMid(r.fig.joints), feetMid(fig.joints), 0.03 * H, `${facing} feet where drawn`);
    near(footY(r.fig.joints), footY(fig.joints), 0.02 * H, `${facing} on the floor`);
    near(r.fig.joints.neck.x, r.fig.joints.hip.x, 0.01 * H, `${facing} body over the hips`);
    // Size, look, facing kept.
    assert.equal(r.fig.height, fig.height);
    assert.deepEqual(r.fig.style, fig.style);
    assert.equal(r.fig.facing, facing);
  }
  // Front view: a stand leaning to one side, legs uneven.
  const fig = read({ ...STAND_FRONT, lean: 12, lShoulder: 30, rShoulder: 4, lHip: 14, rHip: 4, lKnee: 14 }, "front");
  const r = fixPose(fig);
  assert.equal(r.kind, "stand");
  near(r.fig.pose.lean, 0, 0.5, "front upright");
  near(r.fig.pose.lHip, r.fig.pose.rHip, 0.5, "front legs even");
  near(r.fig.pose.lKnee, 0, 0.5, "front knees straight");
  near(feetMid(r.fig.joints), feetMid(fig.joints), 0.03 * H, "front feet where drawn");
});

// Arthur: "It looks like a crouching pose, anticipation for a hop — it needs to look like that."
test("a SLOPPY crouch becomes the engine's clean anticipation crouch: knees and hips bent evenly, back over the feet, arms back", () => {
  for (const facing of ["right", "left"] as Facing[]) {
    const sloppy: PoseAngles = { lean: 18, head: -4, lShoulder: -25, rShoulder: -58, lElbow: 8, rElbow: 34, lHip: 62, rHip: 86, lKnee: 92, rKnee: 120 };
    const fig = read(sloppy, facing);
    const r = fixPose(fig);
    assert.equal(r.kind, "anticipation crouch");
    assert.ok(r.changed);
    const p = r.fig.pose;
    near(p.lHip, p.rHip, 0.5, "hips even");
    near(p.lKnee, p.rKnee, 0.5, "knees even");
    near(p.lKnee, 105, 1, "knees bent like the passed crouch");
    near(p.lean, 28, 0.5, "back like the passed crouch");
    assert.ok(Math.max(p.lShoulder, p.rShoulder) < -35, "arms back");
    near(feetMid(r.fig.joints), feetMid(fig.joints), 0.03 * H, `${facing} feet where drawn`);
    near(footY(r.fig.joints), footY(fig.joints), 0.02 * H, `${facing} on the floor`);
  }
});

test("NEVER WORSE: a kick, a punch and a run stride stay as drawn; an arm raised high on a stand stays raised", () => {
  const actions: [string, PoseAngles, Facing][] = [
    ["kick", { lean: -15, head: 5, lShoulder: -40, rShoulder: 50, lElbow: 30, rElbow: 40, lHip: 95, rHip: -5, lKnee: 10, rKnee: 12 }, "right"],
    ["punch", { lean: 12, head: -5, lShoulder: 88, rShoulder: -20, lElbow: 4, rElbow: 120, lHip: 25, rHip: -15, lKnee: 20, rKnee: 10 }, "left"],
    ["run stride", { lean: 14, head: 0, lShoulder: -50, rShoulder: 55, lElbow: 85, rElbow: 90, lHip: 45, rHip: -25, lKnee: 20, rKnee: 70 }, "right"],
    ["handstand-ish", { lean: 170, head: 0, lShoulder: 0, rShoulder: 0, lElbow: 0, rElbow: 0, lHip: 0, rHip: 0, lKnee: 0, rKnee: 0 }, "right"],
  ];
  for (const [name, pose, facing] of actions) {
    const fig = read(pose, facing);
    const r = fixPose(fig);
    assert.equal(r.changed, false, `${name} (read as ${r.kind}) must stay as drawn`);
    assert.equal(r.fig, fig);
  }
  // Waving: a stand with one arm raised high — the legs/spine get tidied, the raised arm is MEANT and stays.
  const wave = read({ ...STAND, lean: 8, lShoulder: 165, lElbow: 25, lKnee: 14 }, "right");
  const r = fixPose(wave);
  assert.equal(r.kind, "arm up / wave");
  assert.ok(r.changed);
  near(Math.max(r.fig.pose.lShoulder, r.fig.pose.rShoulder), Math.max(wave.pose.lShoulder, wave.pose.rShoulder), 0.5, "raised arm kept");
  near(r.fig.pose.lean, 0, 0.5, "spine upright");
  assert.equal(namePose(read({ ...STAND, lShoulder: 165, lElbow: 25 }, "right").pose, "right").ref.kind, "arm up / wave");
  assert.equal(namePose(read(STAND, "right").pose, "right").ref.kind, "stand");
});

const skels = (keys: { frame: number; fig: ReadFigure }[], fps: number, frameCount: number): Skeleton[] => buildScene(cleanUpScene(keys, { fps, frameCount }), fps).frames.map((f) => f[0].skeleton);
test("clean-up uses it: a held limping stand comes out upright on every picture, same count, the hold stays a hold", () => {
  for (const fps of [8, 12, 24]) {
    const frames = 6;
    const fig = read(LIMPING, "right");
    const s = skels([{ frame: 0, fig }], fps, frames);
    assert.equal(s.length, frames);
    for (const k of s) near(k.neck.x, k.hip.x, 0.01 * H, `${fps}: upright`);
    for (let i = 1; i < s.length; i++) assert.ok(PICKS.every((j) => Math.hypot(s[i][j].x - s[0][j].x, s[i][j].y - s[0][j].y) < 0.01), `${fps}: hold broken at ${i}`);
    near(feetMid(s[0] as unknown as Record<JointPick, Point>), feetMid(fig.joints), 0.03 * H, `${fps}: feet where drawn`);
  }
});

test("an ARM RISING over the animation is the move, not a sloppy stand: every drawing keeps its arm", () => {
  const fps = 12, n = 8;
  const keys = Array.from({ length: n }, (_, i) => ({ frame: i, fig: read({ ...STAND, lShoulder: 10 + 20 * (i / (n - 1)) }, "right") }));
  const s = skels(keys, fps, n);
  keys.forEach((k, i) => {
    const kp = k.fig.joints;
    near(Math.hypot(s[i].lHand.x - s[i].neck.x, s[i].lHand.y - s[i].neck.y), Math.hypot(kp.lHand.x - kp.neck.x, kp.lHand.y - kp.neck.y), 0.03 * H, `picture ${i}`);
    const reach = (sk: Record<string, Point>) => Math.max(sk.lHand.x, sk.rHand.x) - sk.neck.x;
    near(reach(s[i]), reach(kp), 0.03 * H, `picture ${i} hand reach`);
  });
});
