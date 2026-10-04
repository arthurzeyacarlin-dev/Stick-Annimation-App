import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { JOINT_LIMITS } from "../rig.ts";
import { buildGait, planGaitSteps } from "./gait.ts";
import { LIBRARY_MOVES, MOVE_SPEEDS, MOVE_STYLES, makeMoveTestScene } from "./index.ts";

// Every move x style x speed x direction x energy must obey the body rules.
for (const { id: move } of LIBRARY_MOVES) {
  for (const style of MOVE_STYLES) {
    test(`${move} / ${style}: body rules hold at every speed, energy and direction`, () => {
      for (const speed of MOVE_SPEEDS) for (const energy of [0.2, 0.5, 0.85]) for (const direction of [1, -1] as const) {
        const scene = makeMoveTestScene({ move, style, speed, energy, direction });
        const label = `${move}/${style}/${speed}/${energy}/${direction}`;
        for (const key of scene.characters[0].keys) {
          for (const [name, [lo, hi]] of Object.entries(JOINT_LIMITS)) {
            const value = key.pose[name as keyof typeof JOINT_LIMITS];
            assert.ok(value >= lo - 1e-6 && value <= hi + 1e-6, `${label}: ${name} ${value.toFixed(1)} outside ${lo}..${hi}`);
          }
        }
        for (const fps of [12, 24]) {
          const result = buildScene(scene, fps);
          const r = result.report.characters[0];
          assert.ok(r.maxBoneErrorPx <= 0.5, `${label}@${fps}: bones stretched ${r.maxBoneErrorPx}`);
          assert.ok(r.maxFootDriftPx <= 1, `${label}@${fps}: planted foot slid ${r.maxFootDriftPx}`);
          assert.equal(r.belowGroundFrames, 0, `${label}@${fps}: went through the floor`);
          // No pops: a fixed limit, raised for fast runs to ~2.5x the body's own fastest movement per frame.
          const hipSteps = result.frames.slice(1).map((frame, i) => Math.abs(frame[0].skeleton.hip.x - result.frames[i][0].skeleton.hip.x));
          const allowed = Math.max(fps === 12 ? 230 : 140, 2.5 * Math.max(...hipSteps) + 40);
          assert.ok(r.maxJointStepPx < allowed, `${label}@${fps}: a joint jumped ${r.maxJointStepPx.toFixed(0)}px in one frame (allowed ${allowed.toFixed(0)})`);
          // It really travels the distance and ends standing on the ground.
          const last = result.frames[result.frames.length - 1][0].skeleton;
          const first = result.frames[0][0].skeleton;
          // (The track picks a distance the steps cover at their natural length, up to 1500 / 700 px.)
          const keys = scene.characters[0].keys, planned = Math.abs(keys[keys.length - 1].x - keys[0].x);
          assert.ok(Math.abs(Math.abs(last.hip.x - first.hip.x) - planned) < 2 && planned <= (move === "run" ? 1500 : 700) && planned >= (move === "run" ? 900 : 420), `${label}: travelled ${Math.abs(last.hip.x - first.hip.x).toFixed(0)}px of ${planned.toFixed(0)}`);
          assert.ok(Math.abs(Math.max(last.lFoot.y, last.rFoot.y) - scene.groundY) < 0.5, `${label}: ends standing`);
          assert.ok(Math.sign(last.hip.x - first.hip.x) === direction, `${label}: walks the chosen way`);
        }
      }
    });
  }
}

test("a run leaves the ground (flight) and a walk never does", () => {
  const air = (move: "walk" | "run") => {
    const scene = makeMoveTestScene({ move, style: "natural", speed: "normal", energy: 0.5, direction: 1 });
    return buildScene(scene, 24).frames.filter(([c]) => Math.max(c.skeleton.lFoot.y, c.skeleton.rFoot.y) < scene.groundY - 2).length;
  };
  assert.equal(air("walk"), 0);
  assert.ok(air("run") >= 4);
});

test("styles really change the motion", () => {
  const hipPath = (style: (typeof MOVE_STYLES)[number]) => {
    const scene = makeMoveTestScene({ move: "walk", style, speed: "normal", energy: 0.5, direction: 1 });
    return { duration: scene.durationSec, maxLean: Math.max(...scene.characters[0].keys.map((k) => k.pose.lean)) };
  };
  const natural = hipPath("natural");
  assert.ok(hipPath("sneaky").duration > natural.duration * 1.2, "sneaky is slower");
  assert.ok(hipPath("angry").duration < natural.duration, "angry is faster");
  assert.ok(hipPath("tired").maxLean > natural.maxLean + 5, "tired slumps forward");
});

// Tempo ramp (Arthur, 2026-10-04): no frozen ready pose; start with a small, slow step, reach full
// speed in about half a second, cruise, slow down and stand in about half a second. Robots: no ramp;
// tired / hurt / low energy: longer; lively: quicker.
// Measured from the keys: each landing starts a step; a step's speed = hip travel / step time, its arm
// swing = how far the left shoulder moves during it.
const stepsOf = (move: "walk" | "run", distance: number, style: (typeof MOVE_STYLES)[number] = "natural", energy = 0.5) => {
  const { keys, endT } = buildGait({ kind: move, startX: 0, distance, direction: 1, height: 300, style, speed: "normal", energy });
  // The first step starts when the first foot lifts; every later step at a landing.
  const firstLift = keys.find((k) => (k.contacts ?? []).length < 2)!;
  const landings = [firstLift, ...keys.filter((k, i) => i > 0 && (["lFoot", "rFoot"] as const).some((c) => k.contacts?.includes(c) && !keys[i - 1].contacts?.includes(c)))];
  const steps = landings.slice(1).map((land, i) => {
    const from = landings[i], inStep = keys.filter((k) => k.t >= from.t && k.t <= land.t);
    const range = (values: number[]) => Math.max(...values) - Math.min(...values);
    const arm = (range(inStep.map((k) => k.pose.lShoulder)) + range(inStep.map((k) => k.pose.rShoulder))) / 2;
    return { speed: (land.x - from.x) / (land.t - from.t), duration: land.t - from.t, arm, start: from.t, end: land.t };
  });
  const top = Math.max(...steps.map((s) => s.speed));
  const peak = steps.findIndex((s) => s.speed > 0.9 * top);
  const lastTop = steps.length - 1 - [...steps].reverse().findIndex((s) => s.speed > 0.9 * top);
  // Seconds from standing still to (nearly) full speed, and from full speed to standing still.
  return { keys, landings, steps, top, peak, lastTop, speedUp: steps[peak].start - keys[0].t, slowDown: endT - steps[lastTop].end };
};

for (const move of ["run", "walk"] as const) {
  test(`${move}: speeds up in about half a second, cruises, and stops in about half a second`, () => {
    const { steps, top, peak, lastTop, speedUp, slowDown } = stepsOf(move, move === "run" ? 2400 : 1000);
    assert.ok(peak >= 1, `${move}: at least one slower step before full speed`);
    assert.ok(speedUp >= 0.3 && speedUp <= 0.65, `${move}: full speed after ${speedUp.toFixed(2)}s`);
    assert.ok(slowDown >= 0.3 && slowDown <= 0.65, `${move}: stopped ${slowDown.toFixed(2)}s after full speed`);
    // (A walk's first step and its closing half-step, bringing the feet together, are a little quicker.)
    const slowShare = move === "walk" ? 0.7 : 0.6;
    assert.ok(steps[0].speed < slowShare * top && steps[steps.length - 1].speed < slowShare * top, `${move}: starts and ends slow`);
    for (let i = 1; i <= peak; i += 1) {
      assert.ok(steps[i].speed > steps[i - 1].speed, `${move}: step ${i + 1} is faster than step ${i}`);
      assert.ok(steps[i].arm >= steps[i - 1].arm - 0.5, `${move}: the arm swing grows (step ${i + 1})`);
    }
    for (let i = lastTop + 1; i < steps.length; i += 1) assert.ok(steps[i].speed < steps[i - 1].speed, `${move}: step ${i + 1} is slower than step ${i}`);
    const arms = steps.map((s) => s.arm), topArm = Math.max(...arms);
    assert.ok(arms[0] < 0.5 * topArm && arms[arms.length - 1] < 0.5 * topArm, `${move}: the arms swing small at the start and the end`);
  });
}

test("run: a slow run swings the arms only a little; they open out wide only at full speed", () => {
  const { steps, top } = stepsOf("run", 2400);
  const topArm = Math.max(...steps.map((s) => s.arm));
  for (const s of steps) if (s.speed < 0.8 * top) assert.ok(s.arm / topArm < (s.speed / top) - 0.05, `arms ${(100 * s.arm / topArm).toFixed(0)}% at ${(100 * s.speed / top).toFixed(0)}% speed`);
  const armAt = (speed: "slow" | "normal") => {
    const { keys } = buildGait({ kind: "run", startX: 0, distance: 2400, direction: 1, height: 300, style: "natural", speed, energy: 0.5 });
    return Math.max(...keys.map((k) => k.pose.lShoulder)) - Math.min(...keys.map((k) => k.pose.lShoulder));
  };
  assert.ok(armAt("slow") < 0.85 * armAt("normal"), "the Slow run swings the arms less");
});

test("run: no frozen ready pose: the first foot lifts right away and the arms start moving with it", () => {
  const { keys, landings } = stepsOf("run", 2400);
  assert.ok(landings[0].t <= 0.25, `first foot lifts at ${landings[0].t.toFixed(2)}s`);
  const firstStep = keys.filter((k) => k.t > landings[0].t && k.t <= landings[1].t);
  const moved = Math.max(...firstStep.flatMap((k) => (["lShoulder", "rShoulder", "lElbow", "rElbow"] as const).map((j) => Math.abs(k.pose[j] - keys[0].pose[j]))));
  assert.ok(moved > 10, "the arms move during the first step");
});

test("a robot has no speed-up or slow-down; a hurt body takes much longer; a tired one longer", () => {
  for (const move of ["run", "walk"] as const) {
    const d = move === "run" ? 2400 : 1000;
    const robot = stepsOf(move, d, "robot"), natural = stepsOf(move, d), hurt = stepsOf(move, d, "hurt"), tired = stepsOf(move, d, "tired");
    assert.ok(robot.steps[1].speed > 0.95 * robot.top && robot.steps[robot.steps.length - 3].speed > 0.95 * robot.top, `${move}: robot at full speed from the first stride to the last (then just plants its feet)`);
    assert.ok(hurt.speedUp > 1.8 * natural.speedUp && hurt.slowDown > 1.5 * natural.slowDown, `${move}: hurt takes longer (${hurt.speedUp.toFixed(2)}s vs ${natural.speedUp.toFixed(2)}s)`);
    assert.ok(hurt.landings[0].t > natural.landings[0].t + 0.2, `${move}: hurt hesitates before the first step`);
    assert.ok(tired.speedUp > 1.2 * natural.speedUp, `${move}: tired takes longer to get going`);
  }
});

test("the middle (cruise) steps repeat exactly: the speed-up and slow-down never touch them", () => {
  for (const move of ["run", "walk"] as const) {
    const distance = move === "run" ? 4000 : 1600;
    const plan = planGaitSteps(move, distance, move === "run" ? 255 : 111);
    assert.ok(plan.steps.filter((s) => s.f === 1).length >= 6, `${move}: has cruise steps`);
    const { keys, landings } = stepsOf(move, distance);
    // landings[i] ends step i (landings[0] = first lift). Compare steps i+1, i+2 with steps i+3, i+4.
    const cruise = plan.steps.map((s, i) => i).filter((i) => [-1, 0, 1, 2, 3, 4, 5].every((d) => plan.steps[i + d]?.f === 1));
    assert.ok(cruise.length > 0, `${move}: long enough to compare`);
    const a = landings[cruise[0] + 1], b = landings[cruise[0] + 3]; // two steps later: same foot, same moment
    const win = (start: typeof a) => keys.filter((k) => k.t >= start.t - 1e-9 && k.t < start.t + (b.t - a.t) - 1e-6);
    const wa = win(a), wb = win(b);
    assert.equal(wa.length, wb.length, `${move}: same keys per cycle`);
    wa.forEach((k, i) => {
      for (const name of Object.keys(k.pose) as (keyof typeof k.pose)[]) assert.ok(Math.abs(k.pose[name] - wb[i].pose[name]) < 1e-6, `${move}: ${name} repeats`);
      assert.ok(Math.abs((k.x - a.x) - (wb[i].x - b.x)) < 1e-6, `${move}: hip path repeats`);
    });
  }
});

test("energy: a lively body gets going and stops quicker, a low-energy one slower", () => {
  for (const move of ["run", "walk"] as const) {
    const d = move === "run" ? 2400 : 1000;
    const low = stepsOf(move, d, "natural", 0.2), mid = stepsOf(move, d), high = stepsOf(move, d, "natural", 0.85);
    assert.ok(high.speedUp <= mid.speedUp && mid.speedUp <= low.speedUp, `${move}: speed-up ${high.speedUp.toFixed(2)} / ${mid.speedUp.toFixed(2)} / ${low.speedUp.toFixed(2)}s`);
    assert.ok(high.slowDown <= mid.slowDown + 0.02 && mid.slowDown <= low.slowDown + 0.02, `${move}: slow-down ${high.slowDown.toFixed(2)} / ${mid.slowDown.toFixed(2)} / ${low.slowDown.toFixed(2)}s`);
    assert.ok(high.steps[0].speed / high.top > low.steps[0].speed / low.top, `${move}: a lively first step is quicker`);
  }
});
