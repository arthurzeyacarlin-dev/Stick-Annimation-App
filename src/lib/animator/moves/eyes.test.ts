import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { JOINT_LIMITS, STAND, withPose } from "../rig.ts";
import { gazeElevation, headToward, lookTarget, lookToward } from "./gaze.ts";
import { highFive } from "./highFive.ts";
import { LIBRARY } from "./library.ts";
import type { MoveSettings } from "./motion.ts";
import { planToScene, type CharacterPlan, type ScenePlan } from "./plan.ts";
import { allSettings, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { makeTestScene } from "./tests.ts";
import { wave } from "./wave.ts";

// SPEC-0017 Phase 2 round 7 (helper G): EYES, RUN FROM THE LOOK, HIGH-FIVE PACE.

const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const plan = (title: string, characters: CharacterPlan[]): ScenePlan => ({ id: title, title, height: TEST_HEIGHT, groundY: TEST_GROUND, characters });
// How far the face is turned above level (degrees; + = looking up) for a pose in a side view.
const faceUp = (pose: { lean: number; head: number }) => -(pose.lean + pose.head);
const keyAt = <K extends { t: number }>(keys: K[], t: number): K => keys.reduce((best, k) => (Math.abs(k.t - t) < Math.abs(best.t - t) ? k : best), keys[0]);

test("gaze: a level look undoes the lean; up tilts the head back, down forward; never past the neck's range; mirrored facing left", () => {
  const pose = withPose(STAND, { lean: 12 });
  assert.equal(headToward(pose, { ahead: 300, up: 0 }), -12, "level: head = -lean");
  assert.ok(headToward(pose, { ahead: 300, up: 150 }) < -12 && headToward(pose, { ahead: 300, up: -150 }) > -12, "up = back, down = forward");
  for (const up of [-5000, 5000]) {
    const head = headToward(pose, { ahead: 10, up });
    assert.ok(head >= JOINT_LIMITS.head[0] && head <= JOINT_LIMITS.head[1], `neck range (${head})`);
  }
  assert.deepEqual(lookTarget({ x: 500, y: 600 }, { x: 300, y: 500 }, "left"), { ahead: 200, up: 100 });
  assert.ok(Math.abs(gazeElevation({ ahead: 100, up: 100 }) - 45) < 1e-9);
  assert.deepEqual(lookToward(pose, undefined), pose, "nothing to look at: the pose's own head");
});

test("wave: looks at whoever it waves to and waves up toward someone high, down toward someone low; body rules hold", () => {
  for (const settings of allSettings()) for (const facing of ["right", "left"] as const) {
    const start = startStance(facing);
    const level = wave(start, { look: { ahead: 400, up: 0 } }, settings);
    const high = wave(start, { look: { ahead: 300, up: 400 } }, settings);
    const low = wave(start, { look: { ahead: 300, up: -250 } }, settings);
    const name = `${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    for (const [out, label] of [[level, "level"], [high, "high"], [low, "low"]] as const) assertNatural(sceneOfKeys(out.keys, facing), `${name} ${label}`);
    const up = (out: typeof level) => keyAt(out.keys, out.marks.up).pose;
    assert.ok(faceUp(up(high)) > faceUp(up(level)) + 10 && faceUp(up(low)) < faceUp(up(level)) - 10, `${name}: looks up / down`);
    // The waving hand is higher for someone high, lower for someone low (mid-wave).
    const hand = (out: typeof level) => {
      const frame = buildScene(sceneOfKeys(out.keys, facing), 24).frames[Math.round(((out.marks.up + out.marks.down) / 2) * 24)][0].skeleton;
      return frame[facing === "right" ? "lHand" : "rHand"].y;
    };
    assert.ok(hand(high) < hand(level) - 2 && hand(low) > hand(level) + 2, `${name}: waves up / down (${hand(high).toFixed(0)} ${hand(level).toFixed(0)} ${hand(low).toFixed(0)})`);
  }
});

test("wave in a scene: looks down at a friend sitting on the floor, turns to a friend behind it first", () => {
  const sitting = planToScene(plan("wave down", [
    { id: "a", x: 800, facing: "right", actions: [{ move: "wave", params: { to: "b" }, sync: { mark: "up", at: "b.sit1.seated", offset: 0.2 } }] },
    { id: "b", x: 1050, facing: "left", actions: [{ move: "sit", params: { seconds: 3 } }] },
  ]), LIBRARY);
  const a = sitting.characters[0].keys;
  assert.ok(faceUp(keyAt(a, sitting.marks["a.up"]).pose) < -8, `looks down at the sitting friend (${faceUp(keyAt(a, sitting.marks["a.up"]).pose).toFixed(0)})`);
  assertNatural(sitting, "wave at a sitting friend");
  const behind = planToScene(plan("wave behind", [
    { id: "a", x: 1100, facing: "right", actions: [{ move: "wave", params: { to: "b" } }] },
    { id: "b", x: 700, facing: "right", actions: [{ move: "stand", params: { seconds: 3 } }] },
  ]), LIBRARY);
  assert.equal(keyAt(behind.characters[0].keys, behind.marks["a.up"]).facing, "left", "turned to the friend behind before waving");
  assertNatural(behind, "wave to someone behind");
});

test("high-five: eyes on the partner while winding up, on the hands at the slap", () => {
  for (const facing of ["right", "left"] as const) {
    const out = highFive(startStance(facing), { partnerDistance: 240 }, NATURAL);
    const cocked = keyAt(out.keys, out.marks.cocked).pose, slap = keyAt(out.keys, out.marks.slap).pose;
    assert.ok(Math.abs(faceUp(cocked)) < 3, `${facing}: looks level at the partner while cocked (${faceUp(cocked).toFixed(1)})`);
    assert.ok(faceUp(slap) > 0, `${facing}: looks up at the hands at the slap (${faceUp(slap).toFixed(1)})`);
  }
});

test("HIGH-FIVE PACE: the wind-up is about a walking step of the same mood; happy slaps fast, angry fastest, hardest and deepest", () => {
  const WALK_STEP = 0.52;
  const tempo: Record<string, number> = { natural: 1, happy: 0.85, angry: 0.8, sneaky: 1.5, tired: 1.3, heavy: 1.3, hurt: 1.35, robot: 1.1 };
  const run = (style: MoveSettings["style"], energy = 0.5) => highFive(startStance("right"), { partnerDistance: 240 }, { ...NATURAL, style, energy });
  const natural = run("natural"), happy = run("happy"), angry = run("angry");
  // (Before round 7 the natural hands met 1.48 s after the start, about three walking steps.)
  assert.ok(natural.marks.touch <= 0.9, `natural: hands meet ${natural.marks.touch.toFixed(2)} s after the start`);
  assert.ok(happy.marks.touch < natural.marks.touch - 0.08 && angry.marks.touch < happy.marks.touch, `happy ${happy.marks.touch.toFixed(2)} / angry ${angry.marks.touch.toFixed(2)} sooner than natural`);
  assert.ok(angry.marks.touch - angry.marks.cocked <= natural.marks.touch - natural.marks.cocked, "angry swing at least as quick");
  const hips = (out: typeof natural) => buildScene(sceneOfKeys(out.keys), 120).frames[Math.round(out.marks.cocked * 120)][0].skeleton.hip.y;
  assert.ok(hips(angry) > hips(natural) + 2, `angry stamps down deeper (${(hips(angry) - hips(natural)).toFixed(1)} px)`);
  for (const style of Object.keys(tempo) as MoveSettings["style"][]) {
    const out = run(style);
    const steps = out.marks.cocked / (WALK_STEP * tempo[style]);
    assert.ok(steps <= 1.75, `${style}: wind-up ${out.marks.cocked.toFixed(2)} s = ${steps.toFixed(2)} walking steps`);
  }
});

test("RUN FROM THE LOOK: sneak, look back, run away — the run starts the moment the look is over, from the look; never turns forward first", () => {
  for (const style of ["natural", "angry", "tired", "robot"] as const) {
    // (A test scene is a planned scene: it has the plan's marks.)
    const scene = makeTestScene("sneakRun", { style, speed: "normal", energy: 0.5, direction: 1 }, 1920) as ReturnType<typeof planToScene>;
    const keys = scene.characters[0].keys;
    const go = scene.marks["a.go"];
    assert.ok(go !== undefined && scene.marks["a.back"] === undefined, `${style}: hands over at go, no turn back`);
    const look = keyAt(keys, go);
    // Right after the look, the body is already starting the run (the hips move forward within a few
    // frames at 12 fps), and the head is still turned back while it does: it turns forward as it runs.
    const after = keys.filter((k) => k.t > go + 1e-6 && k.t <= go + 0.5);
    assert.ok(after.some((k) => k.x > look.x + 20), `${style}: running within half a second of the look`);
    const soon = keyAt(keys, go + 0.1);
    assert.ok(soon.pose.head < look.pose.head + 6 && soon.pose.head < -15, `${style}: head still turned back as it sets off (${soon.pose.head.toFixed(0)})`);
    // Never back to the plain front-facing stand in between.
    assert.ok(!keys.some((k) => k.t > go && k.t < go + 0.4 && Math.abs(k.pose.head - STAND.head) < 2 && Math.abs(k.pose.lean - STAND.lean) < 2), `${style}: no stand between look and run`);
    assertNatural(scene, `sneak/look/run ${style}`);
  }
});

test("gaze: looking at its own body or the floor in front (a hurt knee, the spot a stomp lands)", async () => {
  const { lookAtOwn } = await import("./gaze.ts");
  const standing = lookAtOwn(STAND, { ahead: 0.3, up: 0 });
  assert.ok(faceUp(standing) < -20, `looks down at the floor in front (${faceUp(standing).toFixed(0)})`);
  const sitting = withPose(STAND, { lean: 10, lHip: 85, rHip: 80, lKnee: 70, rKnee: 30 });
  assert.ok(faceUp(lookAtOwn(sitting, "lKnee")) < faceUp(sitting), "looks down at the knee");
  assert.deepEqual(lookAtOwn(STAND, "head", 0), STAND, "amount 0 = its own head");
});

test("high-five with someone behind (`with`): turns to them first, then the hands meet tip to tip", () => {
  const scene = planToScene(plan("high-five behind", [
    { id: "a", x: 840, facing: "left", actions: [{ move: "highFive", params: { partnerDistance: 240, with: "b" } }] },
    { id: "b", x: 1080, facing: "left", actions: [{ move: "highFive", params: { partnerDistance: 240 }, sync: { mark: "slap", at: "a.highFive1.slap" } }] },
  ]), LIBRARY);
  assert.equal(keyAt(scene.characters[0].keys, scene.marks["a.slap"]).facing, "right", "turned to the partner");
  const built = assertNatural(scene, "high-five behind");
  const [ca, cb] = built.frames[Math.round(scene.marks["a.slap"] * 24)];
  assert.ok(Math.hypot(ca.skeleton.lHand.x - cb.skeleton.lHand.x, ca.skeleton.lHand.y - cb.skeleton.lHand.y) < 9 && Math.abs(ca.skeleton.lHand.x - cb.skeleton.lHand.x) > 5, "hands meet tip to tip");
});
