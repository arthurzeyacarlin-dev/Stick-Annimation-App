import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey } from "../engine.ts";
import { STAND } from "../rig.ts";
import { bearWeight, custom, WEIGHT_GIVE, type CustomKey, type CustomParams } from "./custom.ts";
import { NEVER_TAUGHT } from "./customExamples.ts";
import { LIBRARY } from "./library.ts";
import { PRINCIPLES } from "./lessons.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { MOVE_SPEEDS, MOVE_STYLES } from "./styles.ts";

// SPEC-0017 Phase 3: ORIGINAL MOVES — moves nobody taught the engine, written the way the AI writes them (a few rough
// key poses, no timing), must come out as real animation: timed, anticipated, eased, followed through, feet planted.

const SET = { height: TEST_HEIGHT, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
const planOf = (params: CustomParams, before: { move: string; params?: Record<string, unknown> }[] = []): ScenePlan => ({
  id: "c", title: "custom", height: TEST_HEIGHT, groundY: TEST_GROUND,
  characters: [{ id: "a", x: 500, facing: "right", actions: [...before, { move: "custom", params: params as Record<string, unknown> }] }],
});
const runOf = (params: CustomParams) => custom({ t: 0, x: 500, facing: "right", pose: STAND }, params, SET);

test("five never-taught moves build with the body rules at 8, 12 and 24 fps", () => {
  for (const [name, params] of Object.entries(NEVER_TAUGHT)) {
    const scene = planToScene(planOf(params), LIBRARY);
    assert.ok(scene.durationSec > 0.5, `${name}: has length`);
    for (const fps of [8, 12, 24]) {
      const r = buildScene(scene, fps).report.characters[0];
      assert.ok(r.maxBoneErrorPx <= 0.5, `${name}@${fps}: bones ${r.maxBoneErrorPx.toFixed(2)}`);
      assert.ok(r.maxFootDriftPx <= 1, `${name}@${fps}: foot slid ${r.maxFootDriftPx.toFixed(2)}`);
      assert.equal(r.belowGroundFrames, 0, `${name}@${fps}: through the floor`);
    }
  }
});

// The pose distance between keys (sum of angle changes).
const gap = (a: CharacterKey, b: CharacterKey) => Object.keys(a.pose).reduce((s, k) => s + Math.abs(a.pose[k as keyof typeof a.pose] - b.pose[k as keyof typeof b.pose]), 0);

test("an anticipation key (a move the other way) comes before the biggest change", () => {
  // (The robot dance needs none from the engine: its own key before the biggest change already goes the other way.)
  for (const name of ["dab", "kata"]) {
    const out = runOf(NEVER_TAUGHT[name]);
    // Some key between the start and k1.. moves AGAINST the next key's change in the shoulders.
    const found = out.keys.some((k, i) => {
      if (i === 0 || i + 1 >= out.keys.length) return false;
      const p = out.keys[i - 1], n = out.keys[i + 1];
      return (["lShoulder", "rShoulder", "lHip", "rHip"] as const).some((j) => (k.pose[j] - p.pose[j]) * (n.pose[j] - k.pose[j]) < -4 && Math.abs(n.pose[j] - k.pose[j]) > 30);
    });
    assert.ok(found, `${name}: an anticipation key`);
  }
  // The dab: the wind-up comes before the hit, at a walking pace (not a snap), and the hit is quick.
  const dab = runOf(NEVER_TAUGHT.dab);
  const hit = dab.marks.hit;
  assert.ok(hit > 0.25 && hit < 0.8, `dab hits at ${hit}`);
  const windEnd = dab.keys.filter((k) => k.t < hit - 1e-6).at(-1)!;
  assert.ok(windEnd.t > 0.12 && hit - windEnd.t <= 0.3, "wind-up then a quick strike");
  assert.ok(windEnd.pose.lShoulder < STAND.lShoulder, "the arm goes back before it goes up");
});

test("eased starts and stops: the body is (nearly) still at holds", () => {
  const params = NEVER_TAUGHT.robotDance;
  const scene = planToScene(planOf(params), LIBRARY);
  const fps = 24;
  const frames = buildScene(scene, fps).frames.map((f) => f[0].skeleton);
  const speed = (i: number) => Math.max(...(Object.keys(frames[i]) as (keyof (typeof frames)[0])[]).map((j) => Math.hypot(frames[i + 1][j].x - frames[i][j].x, frames[i + 1][j].y - frames[i][j].y)));
  const out = runOf(params);
  // In the middle of each hold the body barely moves; between holds it moves much faster.
  let peak = 0;
  for (let i = 0; i + 1 < frames.length; i += 1) peak = Math.max(peak, speed(i));
  for (let n = 1; n <= 4; n += 1) {
    const holdMid = out.marks[`k${n}`] + (n < 4 ? 0.3 : 0.4) / 2 + 0.3;
    const i = Math.min(frames.length - 2, Math.round(holdMid * fps));
    assert.ok(speed(i) < 0.15 * peak, `hold ${n}: ${speed(i).toFixed(1)} px/frame vs peak ${peak.toFixed(1)}`);
  }
  // The very first picture eases out of the stand.
  assert.ok(speed(0) < 0.6 * Math.max(speed(1), speed(2), speed(3), speed(4)), "eases out of the start (speeds up)");
});

test("a strike overshoots past its pose and settles back", () => {
  for (const name of ["dab", "kata"]) {
    const out = runOf(NEVER_TAUGHT[name]);
    const i = out.keys.findIndex((k) => Math.abs(k.t - out.marks.hit) < 1e-6);
    const hitKey = out.keys[i], over = out.keys[i + 1], settle = out.keys[i + 2], before = out.keys[i - 1];
    assert.equal(hitKey.ease, "out", `${name}: slows down past the hit`);
    assert.equal(before.ease, "in", `${name}: speeds up into the hit`);
    const j = name === "dab" ? "lShoulder" : "rHip";
    const dir = Math.sign(hitKey.pose[j] - before.pose[j]);
    assert.ok(dir * (over.pose[j] - hitKey.pose[j]) > 0.5, `${name}: goes past (${before.pose[j].toFixed(0)} -> ${hitKey.pose[j].toFixed(0)} -> ${over.pose[j].toFixed(0)})`);
    assert.ok(Math.abs(settle.pose[j] - hitKey.pose[j]) < 0.5 + Math.abs(over.pose[j] - hitKey.pose[j]) / 3, `${name}: settles back`);
  }
});

test("missing `at`: bigger changes take longer; given `at`s are kept", () => {
  const small = runOf({ keys: [{ pose: { head: 10 }, hold: 0.2 }] });
  const big = runOf({ keys: [{ pose: { lShoulder: 170, rShoulder: 170 }, hold: 0.2 }] });
  assert.ok(small.marks.k1 >= 0.15 && small.marks.k1 < 0.45, `small change at ${small.marks.k1}`);
  // (both arms from down to straight up: ~340 degrees of joint change, ~1.2 s at a human speed + the wind-up)
  assert.ok(big.marks.k1 > small.marks.k1 + 0.1 && big.marks.k1 < 1.8, `big change at ${big.marks.k1}`);
  const timed = runOf({ keys: [{ pose: { lShoulder: 90 }, at: 0.5 }, { pose: { lShoulder: 170 }, at: 1.2, hold: 0.2 }] });
  assert.ok(Math.abs(timed.marks.k1 - 0.5) < 1e-6 && Math.abs(timed.marks.k2 - 1.2) < 1e-6, "the AI's times are kept");
  // Slow speed takes longer than fast.
  const slow = custom({ t: 0, x: 0, facing: "right", pose: STAND }, { keys: [{ pose: { lShoulder: 170 } }] }, { ...SET, speed: "slow" });
  const fast = custom({ t: 0, x: 0, facing: "right", pose: STAND }, { keys: [{ pose: { lShoulder: 170 } }] }, { ...SET, speed: "fast" });
  assert.ok(slow.marks.k1 > fast.marks.k1, "speed changes the timing");
});

test("in the air: gravity times the jump and the landing dips", () => {
  const out = runOf(NEVER_TAUGHT.victory);
  const air = out.keys.filter((k) => (k.lift ?? 0) > 0);
  assert.ok(air.length >= 1, "goes up");
  const top = air.reduce((a, b) => ((a.lift ?? 0) >= (b.lift ?? 0) ? a : b));
  const takeoff = out.keys[out.keys.indexOf(air[0]) - 1];
  const up = top.t - takeoff.t, expected = Math.sqrt((2 * 45) / (5.6 * TEST_HEIGHT));
  assert.ok(Math.abs(up - expected) < 0.02, `rise ${up.toFixed(3)} s ~ ${expected.toFixed(3)} s`);
  assert.equal(takeoff.liftEase, "out", "slows on the way up");
  assert.equal(top.liftEase, "in", "speeds up on the way down");
  const land = out.marks.land;
  const dip = out.keys.find((k) => k.t > land + 1e-6)!;
  const landKey = out.keys.find((k) => Math.abs(k.t - land) < 1e-6)!;
  assert.ok(dip.pose.lKnee > landKey.pose.lKnee + 5, "the landing dips");
  // A crouch before the take-off.
  assert.ok(takeoff.pose.lKnee > 20, "crouches before going up");
});

test("unknown or broken angles never break the body", () => {
  const out = runOf({ keys: [{ pose: { lKnee: 999, rElbow: -500, lean: Number.NaN, nose: 40 } as never }, { pose: "nope" as never }, {} as CustomKey, { pose: { lShoulder: 720 } }] });
  const scene = planToScene(planOf({ keys: [{ pose: { lKnee: 999, rElbow: -500 } }, { pose: { lShoulder: 720 } }] }), LIBRARY);
  for (const fps of [8, 12, 24]) {
    const r = buildScene(scene, fps).report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `broken@${fps}`);
  }
  for (const k of out.keys) for (const v of Object.values(k.pose)) assert.ok(Number.isFinite(v));
  assert.ok(runOf({}).keys.length >= 2, "no keys = it just stands");
});

test("walk then an original move chains smoothly (no pop at the join)", () => {
  const scene = planToScene(planOf(NEVER_TAUGHT.dab, [{ move: "walk", params: { distance: 250 } }]), LIBRARY);
  for (const fps of [8, 12, 24]) {
    const built = buildScene(scene, fps);
    const r = built.report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `walk+dab@${fps}`);
    assert.ok(r.maxJointStepPx < (fps === 8 ? 300 : fps === 12 ? 240 : 120), `walk+dab@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)} px`);
  }
  const keys = scene.characters[0].keys;
  const hips = keys.map((k) => k.x);
  assert.ok(hips[hips.length - 1] > 500 + 200, "it walked first");
});

test("tiptoe travels by stepping: a planted foot never slides", () => {
  const scene = planToScene(planOf(NEVER_TAUGHT.tiptoe), LIBRARY);
  const keys = scene.characters[0].keys;
  assert.ok(keys[keys.length - 1].x - keys[0].x > 100, `moved ${(keys[keys.length - 1].x - keys[0].x).toFixed(0)} px forward`);
});

test("lessons: one ORIGINAL MOVES principle", () => {
  assert.ok(PRINCIPLES.some((p) => p.startsWith("ORIGINAL MOVES (custom)")));
  assert.ok(LIBRARY.custom && LIBRARY.custom.about.includes("keys"));
});

test("every style and speed keeps the body rules (robot: no wind-up or follow-through)", () => {
  for (const style of MOVE_STYLES) for (const speed of MOVE_SPEEDS) for (const [name, params] of Object.entries(NEVER_TAUGHT)) {
    const plan = planOf(params);
    plan.characters[0].style = style; plan.characters[0].speed = speed;
    const r = buildScene(planToScene(plan, LIBRARY), 12).report.characters[0];
    assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${name} ${style} ${speed}: bones ${r.maxBoneErrorPx.toFixed(2)} drift ${r.maxFootDriftPx.toFixed(2)} below ${r.belowGroundFrames}`);
  }
  const robot = custom({ t: 0, x: 0, facing: "right", pose: STAND }, NEVER_TAUGHT.dab, { ...SET, style: "robot" });
  assert.ok(robot.keys.every((k, i) => i === robot.keys.length - 1 || k.ease === "linear"), "a robot moves linearly");
  assert.ok(robot.keys.length < runOf(NEVER_TAUGHT.dab).keys.length, "a robot has no wind-up or follow-through");
});

// A LIMB THAT TAKES THE BODY'S WEIGHT BENDS (Arthur, cartwheel: "the arms need to bend a little from the weight"): a hand
// down on the floor (a handstand, push-up, vault) gives at the elbow; a free hand, or one in the air, is left alone.
test("custom: a hand on the floor carries the weight, so its elbow gives; free hands are untouched", () => {
  const handstand = { ...STAND, lean: 180, lShoulder: 180, rShoulder: 180, lElbow: 0, rElbow: 0, lHip: 0, rHip: 0, lKnee: 0, rKnee: 0 };
  const carried = bearWeight(handstand, 0);
  assert.ok(carried.lElbow >= WEIGHT_GIVE && carried.rElbow >= WEIGHT_GIVE, "both planted arms bend under the body");
  assert.deepEqual(bearWeight(handstand, 0.2), handstand, "in the air nothing carries weight");
  const straightArms = { ...STAND, lElbow: 0, rElbow: 0 };
  assert.deepEqual(bearWeight(straightArms, 0), straightArms, "standing, the hanging arms are free");
});

// A BODY IS HEAVY (Arthur, cartwheel: "I can't genuinely see his arms bend"): a limb taking the weight bends CLEARLY —
// enough to see at stick-figure size — by its share of the weight (one hand alone more than two), and a landing's knees
// give clearly too, more after a bigger fall.
test("custom: weight bends planted elbows >= 30 deg (one hand more than two) and landing knees >= 25 deg", () => {
  const handstand = { ...STAND, lean: 180, lShoulder: 180, rShoulder: 180, lElbow: 0, rElbow: 0, lHip: 0, rHip: 0, lKnee: 0, rKnee: 0 };
  const two = bearWeight(handstand, 0);
  assert.ok(two.lElbow >= 30 && two.rElbow >= 30, `two planted hands bend clearly (${two.lElbow}, ${two.rElbow})`);
  const one = bearWeight({ ...handstand, rShoulder: 90 }, 0);
  assert.ok(one.lElbow > two.lElbow && one.rElbow === 0, `one hand alone bends more (${one.lElbow}) and the free arm stays (${one.rElbow})`);
  const landing = (lift: number) => {
    const out = runOf({ keys: [{ pose: { lKnee: 0, rKnee: 0 }, lift }, { pose: { lKnee: 0, rKnee: 0 } }] });
    const landKey = out.keys.find((k) => Math.abs(k.t - out.marks.land) < 1e-6)!;
    const dip = out.keys.find((k) => k.t > out.marks.land + 1e-6)!;
    return Math.min(dip.pose.lKnee, dip.pose.rKnee) - Math.max(landKey.pose.lKnee, landKey.pose.rKnee);
  };
  assert.ok(landing(30) >= 25, `a small landing's knees give clearly (${landing(30).toFixed(0)})`);
  assert.ok(landing(150) > landing(30), `a bigger landing bends more (${landing(150).toFixed(0)} vs ${landing(30).toFixed(0)})`);
});

test("JOINTS MOVE AT A HUMAN SPEED: a big pose change takes time (the superhero pose), fast is quicker, never a snap", () => {
  // (Arthur on a two-key superhero pose: "he's really fast".)
  const hero: CustomParams = { keys: [
    { pose: { lean: 0, lShoulder: 8, rShoulder: -6, lElbow: 14, rElbow: 10, lHip: 20, rHip: -20, lKnee: 20, rKnee: 20 }, hold: 0.2 },
    { pose: { lean: -8, head: -6, lShoulder: -25, rShoulder: -25, lElbow: 45, rElbow: 45, lHip: 18, rHip: -18, lKnee: 2, rKnee: 2 }, dx: 20, hold: 1.2 },
  ] };
  const into = (speed: "normal" | "fast", style: "natural" | "robot" = "natural") => {
    const out = custom({ t: 0, x: 500, facing: "right", pose: STAND }, hero, { ...SET, speed, style });
    return out.marks.k2 - out.marks.k1 - 0.2; // from the end of key 1's hold into the hero pose (wind-up included)
  };
  // (before: 0.48 s at normal speed, of which the hero change itself was 0.18 s; now ~0.9 s, the change ~0.6 s)
  assert.ok(into("normal") >= 0.85, `into the hero pose at normal speed: ${into("normal").toFixed(2)} s`);
  assert.ok(into("fast") < into("normal"), `fast is quicker (${into("fast").toFixed(2)} s)`);
  assert.ok(into("fast", "robot") >= 0.3, `a robot is snappier but still readable (${into("fast", "robot").toFixed(2)} s)`);
  const k1 = custom({ t: 0, x: 500, facing: "right", pose: STAND }, hero, SET).marks.k1;
  assert.ok(k1 >= 0.22, `the first key is reached from the stand at a human speed too (${k1.toFixed(2)} s)`);
});
