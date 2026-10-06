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
          // (The track picks a distance the steps cover at their natural length, up to 1500 / 1000 / 700 px.)
          const keys = scene.characters[0].keys, planned = Math.abs(keys[keys.length - 1].x - keys[0].x);
          const track = move === "run" ? 1500 : move === "jog" ? 1000 : 700;
          assert.ok(Math.abs(Math.abs(last.hip.x - first.hip.x) - planned) < 2 && planned <= track && planned >= 0.6 * track, `${label}: travelled ${Math.abs(last.hip.x - first.hip.x).toFixed(0)}px of ${planned.toFixed(0)}`);
          assert.ok(Math.abs(Math.max(last.lFoot.y, last.rFoot.y) - scene.groundY) < 0.5, `${label}: ends standing`);
          assert.ok(Math.sign(last.hip.x - first.hip.x) === direction, `${label}: walks the chosen way`);
        }
      }
    });
  }
}

// (Round 10, Arthur: "jogging, you're actually airborne a little": a jog has a short, low hop, a run a clear one.)
test("a run leaves the ground (flight), a jog only briefly and low, a walk never", () => {
  const air = (move: "walk" | "jog" | "run") => {
    const scene = makeMoveTestScene({ move, style: "natural", speed: "normal", energy: 0.5, direction: 1 });
    return buildScene(scene, 24).frames.filter(([c]) => Math.max(c.skeleton.lFoot.y, c.skeleton.rFoot.y) < scene.groundY - 2).length;
  };
  assert.equal(air("walk"), 0);
  assert.ok(air("jog") >= 4 && air("jog") < air("run"), `jog ${air("jog")} pictures in the air, run ${air("run")}`);
  assert.ok(air("run") >= 4);
  // The jog's hop: each one well under half a second, the feet just off the floor.
  const scene = makeMoveTestScene({ move: "jog", style: "natural", speed: "normal", energy: 0.5, direction: 1 });
  const frames = buildScene(scene, 24).frames.map(([c]) => c.skeleton);
  let longest = 0, run = 0, highest = 0;
  for (const k of frames) {
    const off = Math.min(scene.groundY - k.lFoot.y, scene.groundY - k.rFoot.y);
    if (off > 2) { run += 1; highest = Math.max(highest, off); } else run = 0;
    longest = Math.max(longest, run);
  }
  assert.ok(longest / 24 < 0.5, `a jog hop lasts ${(longest / 24).toFixed(2)} s`);
  assert.ok(highest < 0.08 * 300, `the jog's lower foot rises ${highest.toFixed(0)} px in the air`);
});

// (Arthur, round 9: "your legs and arms only switch ... when you hit the ground".) Running or jogging, the
// legs pass each other only while a foot is down (the leg in front at the push-off lands in front), and so do the arms.
test("legs and arms pass each other only while a foot is on the ground (walk, jog, run)", () => {
  for (const move of ["walk", "jog", "run"] as const) for (const style of MOVE_STYLES) for (const direction of [1, -1] as const) {
    const scene = makeMoveTestScene({ move, style, speed: "normal", energy: 0.5, direction });
    const frames = buildScene(scene, 24).frames.map(([c]) => c.skeleton);
    const up = (y: number) => scene.groundY - y > 2;
    const inAir = (k: (typeof frames)[number]) => up(k.lFoot.y) && up(k.rFoot.y);
    const order = (a: number, b: number) => Math.sign((a - b) * direction);
    for (let i = 1; i < frames.length; i += 1) {
      const [p, k] = [frames[i - 1], frames[i]];
      if (!(inAir(p) && inAir(k))) continue;
      const feet = [order(p.lFoot.x, p.rFoot.x), order(k.lFoot.x, k.rFoot.x)], hands = [order(p.lHand.x, p.rHand.x), order(k.lHand.x, k.rHand.x)];
      assert.ok(!(feet[0] && feet[1] && feet[0] !== feet[1]), `${move}/${style}/${direction}: the legs passed each other in the air at picture ${i}`);
      assert.ok(!(hands[0] && hands[1] && hands[0] !== hands[1]), `${move}/${style}/${direction}: the arms passed each other in the air at picture ${i}`);
    }
  }
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
    // (Round 4: Arthur couldn't see a run speed up, so a run takes a little longer than a walk: ~0.7 s.)
    assert.ok(speedUp >= 0.3 && speedUp <= (move === "run" ? 0.85 : 0.65), `${move}: full speed after ${speedUp.toFixed(2)}s`);
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
  // (Round 4: the arms still swing past each other from the first step, small and growing.)
  const peak = steps.findIndex((s) => s.speed > 0.9 * top);
  steps.forEach((s, i) => {
    if (s.speed < 0.8 * top) assert.ok(s.arm / topArm < (s.speed / top) + 0.05, `arms ${(100 * s.arm / topArm).toFixed(0)}% at ${(100 * s.speed / top).toFixed(0)}% speed`);
    if (i < peak) assert.ok(s.arm / topArm > 0.2, `getting going, the arms already swing (${(100 * s.arm / topArm).toFixed(0)}%)`);
  });
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
    const distance = move === "run" ? 6000 : 1600; // (long enough for a few full-size cruise steps between the speed-up and the slow-down)
    const plan = planGaitSteps(move, distance, move === "run" ? 330 : 90); // the cruise step lengths (RUN_BASE 1.1, WALK_BASE 0.3 x 300)
    assert.ok(plan.steps.filter((s) => s.f === 1).length >= 6, `${move}: has cruise steps`);
    const { keys, landings } = stepsOf(move, distance);
    // landings[i] ends step i (landings[0] = first lift). Compare steps i+1, i+2 with steps i+3, i+4.
    // (The arm swings keep growing for a step or two after the legs reach full speed: start a little later.)
    const cruise = plan.steps.map((s, i) => i).filter((i) => [-3, -2, -1, 0, 1, 2, 3, 4, 5].every((d) => plan.steps[i + d]?.f === 1));
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

// ARMS BALANCE THE LEGS (Arthur, round 4): in every style the hands pass each other every step, wide
// enough to see (even sneaky, tired or hurt), starting small and growing, then shrinking into the stand.
test("arms pass each other every step in every style, growing at the start and shrinking at the end", () => {
  for (const move of ["walk", "run"] as const) for (const style of MOVE_STYLES) {
    const scene = makeMoveTestScene({ move, style, speed: "normal", energy: 0.5, direction: 1 });
    const frames = buildScene(scene, 60).frames.map((f) => f[0].skeleton);
    const gap = frames.map((s) => s.lHand.x - s.rHand.x);
    const swings: number[] = [];
    let start = 0;
    for (let i = 1; i <= gap.length; i += 1) {
      if (i === gap.length || (Math.sign(gap[i]) !== Math.sign(gap[i - 1]) && gap[i] !== 0)) { swings.push(Math.max(...gap.slice(start, i).map(Math.abs))); start = i; }
    }
    const label = `${move} ${style}`;
    // (Standing, the hands hang about 25 px apart: leave out those still moments at either end.)
    const inner = swings.slice(swings.findIndex((w) => w > 30), swings.length - [...swings].reverse().findIndex((w) => w > 30));
    const top = Math.max(...inner);
    assert.ok(inner.length >= 4, `${label}: the hands pass each other every step (${inner.length} swings)`);
    assert.ok(top >= (move === "walk" ? 55 : 90), `${label}: swings wide (${top.toFixed(0)} px between the hands)`);
    if (style !== "robot") {
      // Growing / shrinking: before the first nearly-full swing (and after the last one) the hands already
      // pass each other in smaller swings, wider than the ~25 px they hang apart standing.
      const full = swings.map((w) => w >= 0.8 * top), first = full.indexOf(true), last = full.lastIndexOf(true);
      assert.ok(swings.slice(0, first).some((w) => w > 25), `${label}: the first swings are small (${swings.slice(0, first + 1).map((w) => w.toFixed(0)).join(", ")} of ${top.toFixed(0)})`);
      assert.ok(swings.slice(last + 1).some((w) => w > 25), `${label}: the last swings are small (${swings.slice(last).map((w) => w.toFixed(0)).join(", ")} of ${top.toFixed(0)})`);
    }
  }
});
