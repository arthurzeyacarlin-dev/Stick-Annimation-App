import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardKinematics } from "../pose.ts";
import { POSE_KEYS } from "../rig.ts";
import { forgetPoses, inventPose, poseNamed, poseProblems, POSE_KINDS, rememberPose, SIT_SEAT } from "./poseMaker.ts";
import { guardUp } from "./hit.ts";
import { sit, SEAT_HEIGHT } from "./sit.ts";
import { assertNatural, sceneOfKeys, startStance, TEST_HEIGHT } from "./testkit.ts";
import type { MoveSettings } from "./motion.ts";

const settings: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };

test("invented poses keep the body rules: joint limits, balanced, feet down (sit: hips on the floor)", () => {
  assert.equal(SIT_SEAT, SEAT_HEIGHT, "the same seat height as sit.ts");
  for (const kind of POSE_KINDS) for (let seed = 1; seed <= 40; seed += 1) {
    const made = inventPose(kind, seed);
    assert.equal(made.kind, kind);
    assert.ok(made.name.length > 3);
    assert.deepEqual(poseProblems(made.pose, kind), [], `${made.name}`);
    const b = forwardKinematics(made.pose, "right", { x: 0, y: 0 }, 1, "normal", false);
    const floor = Math.max(b.lFoot.y, b.rFoot.y);
    if (kind === "sit") assert.ok(Math.abs(floor - SIT_SEAT) < 0.006, `${made.name}: hips on the floor`);
    else assert.ok(floor > 0.36, `${made.name}: standing`);
  }
});

test("different seeds give different poses; the same seed the same pose; `look` picks the arm rule", () => {
  for (const kind of POSE_KINDS) {
    const poses = Array.from({ length: 8 }, (_, i) => inventPose(kind, i + 1).pose);
    for (let i = 1; i < poses.length; i += 1) assert.ok(POSE_KEYS.some((k) => Math.abs(poses[i][k] - poses[i - 1][k]) > 1), `${kind} seeds ${i} and ${i + 1} differ`);
    assert.deepEqual(inventPose(kind, 3), inventPose(kind, 3));
  }
  assert.equal(inventPose("sit", 5, "thinker").rule, "thinker");
  assert.equal(inventPose("fight", 5, "crane").rule, "crane");
  assert.equal(inventPose("fight", 5, "realistic").rule, "boxer");
});

test("a remembered pose comes back by name (in memory)", () => {
  forgetPoses();
  const made = inventPose("sit", 11, "hug");
  rememberPose("Cozy Hug", made);
  assert.deepEqual(poseNamed("cozy hug")?.pose, made.pose);
  assert.equal(poseNamed("Cozy Hug")?.kind, "sit");
  assert.equal(poseNamed("nobody"), undefined);
  const copy = poseNamed("Cozy Hug")!; copy.pose.lean = 99;
  assert.notEqual(poseNamed("Cozy Hug")!.pose.lean, 99, "callers can't change the remembered pose");
});

test("sit with a remembered style sits in it and keeps the body rules; no style = unchanged", () => {
  forgetPoses();
  const plain = sit(startStance(), {}, settings);
  assert.deepEqual(sit(startStance(), { style: "never remembered" }, settings), plain, "unknown style = the usual sit");
  for (const [i, look] of ["thinker", "hug", "leanBack", "lazy", "knees", "lap"].entries()) {
    const made = inventPose("sit", 20 + i, look);
    rememberPose(`Style ${look}`, made);
    const out = sit(startStance(), { style: `Style ${look}`, seconds: 1.5 }, settings);
    const seated = out.keys.find((k) => Math.abs(k.t - out.marks.seated) < 1e-6)!;
    // The upper body is the remembered one (the legs re-planted where the feet stand).
    for (const key of ["lean", "head", "lShoulder", "rShoulder", "lElbow", "rElbow"] as const) assert.ok(Math.abs(seated.pose[key] - made.pose[key]) < 1.5, `${look}: ${key} ${seated.pose[key]} vs ${made.pose[key]}`);
    assertNatural(sceneOfKeys(out.keys), `sit style ${look}`);
  }
});

test("guard with a remembered fighting style waits in it and keeps the body rules", () => {
  forgetPoses();
  const plain = guardUp(startStance(), { seconds: 1 }, settings);
  assert.deepEqual(guardUp(startStance(), { seconds: 1, style: "unknown" }, settings), plain);
  for (const look of ["crane", "karate", "lowLead"]) {
    const made = inventPose("fight", 8, look);
    rememberPose(look, made);
    const out = guardUp(startStance(), { seconds: 1, style: look }, settings);
    const last = out.keys[out.keys.length - 1].pose;
    assert.ok(Math.abs(last.lean - made.pose.lean) < 0.5, `${look}: lean ${last.lean} vs ${made.pose.lean}`);
    assertNatural(sceneOfKeys(out.keys), `guard style ${look}`);
  }
});
