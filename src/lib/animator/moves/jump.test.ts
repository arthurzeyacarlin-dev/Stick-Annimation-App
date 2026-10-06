import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type CharacterKey, type Scene } from "../engine.ts";
import { forwardKinematics } from "../pose.ts";
import { STAND, type Facing } from "../rig.ts";
import { jump } from "./jump.ts";
import { LIBRARY } from "./library.ts";
import type { MoveSettings, Stance } from "./motion.ts";
import { BASE_MOVES, fitPlanToPage, planToScene, type Action } from "./plan.ts";
import { footPlanter } from "./planted.ts";
import { allSettings, armPathProblems, assertNatural, sceneOfKeys, startStance, TEST_GROUND, TEST_HEIGHT } from "./testkit.ts";
import { STYLE_CHANGES } from "./styles.ts";

// SPEC-0017 Phase 2: the RUNNING JUMP (Arthur's momentum rule: a body keeps going the way its weight is
// going). A jump after a run takes off from the run at speed: no stop, no deep standing crouch. A run
// straight after it goes on from the landing at speed (RUN ON). Arthur's parkour test (round 7): "he runs,
// jumps in the air, lands, runs, jumps, lands, runs, jumps, lands... then he's tired".

const NATURAL: MoveSettings = { height: TEST_HEIGHT, style: "natural", speed: "normal", energy: 0.5 };
const FACINGS: Facing[] = ["right", "left"];
const sign = (facing: Facing) => (facing === "left" ? -1 : 1);

// What the planner does: a run built a little longer and cut at its distance the moment a foot comes
// down (still at full speed), then the jump starting from that key with its speed.
function runThenJump(settings: MoveSettings, facing: Facing, distance = 600, jumpParams: Record<string, number> = {}, speed?: number) {
  const start: Stance = { ...startStance(facing, facing === "left" ? 1500 : 300), t: 0 };
  const full = BASE_MOVES.run.run(start, { distance: distance + 2.5 * 1.05 * settings.height }, settings);
  const dir = sign(facing), goal = start.x + dir * distance;
  let cut = Math.max(1, full.keys.findIndex((k) => (k.x - goal) * dir >= 0));
  while (cut < full.keys.length - 2 && !((full.keys[cut].contacts ?? []).length > 0 && (full.keys[cut - 1].contacts ?? []).length === 0)) cut += 1;
  const run = full.keys.slice(0, cut + 1);
  const end = run[run.length - 1], before = run[run.length - 2];
  const v = speed ?? Math.abs(end.x - before.x) / (end.t - before.t);
  const out = jump({ t: end.t, x: end.x, facing, pose: end.pose }, { ...jumpParams, speed: v }, settings);
  const first = out.keys[0];
  const keys: CharacterKey[] = [...run.slice(0, -1), { ...end, ease: first.ease, xEase: first.xEase, liftEase: first.liftEase }, ...out.keys.slice(1)];
  return { keys: footPlanter(settings.height)(keys), out, v, runEnd: end };
}

// One figure doing `actions` through the planner.
const planned = (settings: MoveSettings, facing: Facing, actions: Action[]) => planToScene({
  id: "t", title: "t", height: settings.height, groundY: TEST_GROUND,
  characters: [{ id: "a", x: facing === "left" ? 1700 : 200, facing, style: settings.style, speed: settings.speed, energy: settings.energy, actions }],
}, LIBRARY);
const keysOf = (scene: Scene) => scene.characters[0].keys;
const armsOk = (scene: Scene, label: string) => {
  for (const fps of [12, 24]) assert.deepEqual(armPathProblems(buildScene(scene, fps).frames, fps), [], `${label}@${fps}: arm paths`);
};
// The hips keep moving forward (never stop or go back) from `from` to `to` seconds.
function keepsGoing(keys: CharacterKey[], facing: Facing, from: number, to: number, label: string) {
  const span = keys.filter((k) => k.t >= from - 1e-9 && k.t <= to + 1e-9);
  for (let i = 1; i < span.length; i += 1) assert.ok((span[i].x - span[i - 1].x) * sign(facing) > 0, `${label}: hips stopped or went back at ${span[i].t.toFixed(2)}s`);
}
// Where a foot is on the stage in a key (px).
const footX = (key: CharacterKey, foot: "lFoot" | "rFoot", facing: Facing) => key.x + forwardKinematics(key.pose, facing, { x: 0, y: 0 }, TEST_HEIGHT, "normal", false)[foot].x;

test("running jump (run -> jump): body rules and arm paths in every style/speed/energy, both directions, 12 and 24 fps; no stop before the take-off; lands and stands", () => {
  for (const settings of allSettings()) for (const facing of FACINGS) {
    const label = `run>jump/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const scene = planned(settings, facing, [{ move: "run", params: { distance: 500 } }, { move: "jump" }]);
    assertNatural(scene, label);
    armsOk(scene, label);
    const m = scene.marks;
    for (const name of ["takeoff", "top", "land"]) assert.ok(m[`a.jump1.${name}`] !== undefined, `${label}: mark ${name}`);
    assert.ok(m["a.jump1.takeoff"] < m["a.jump1.top"] && m["a.jump1.top"] < m["a.jump1.land"], `${label}: marks in order`);
    // MOMENTUM: from the run's last steps through the take-off the hips never stop.
    keepsGoing(keysOf(scene), facing, m["a.run1.arrived"] - 0.3, m["a.jump1.takeoff"], label);
    const last = keysOf(scene)[keysOf(scene).length - 1];
    assert.deepEqual(last.pose, STAND, `${label}: ends standing`);
    assert.deepEqual([...(last.contacts ?? [])].sort(), ["lFoot", "rFoot"], `${label}: ends on both feet`);
  }
});

test("parkour rhythm (run -> jump -> run -> jump -> run): body rules and arm paths in every style/speed/energy, both directions, 12 and 24 fps; never stops from the first take-off to the last landing", () => {
  const actions: Action[] = [{ move: "run", params: { distance: 400 } }, { move: "jump" }, { move: "run", params: { distance: 200 } }, { move: "jump" }, { move: "run", params: { distance: 300 } }];
  for (const settings of allSettings()) for (const facing of FACINGS) {
    const label = `parkour/${settings.style}/${settings.speed}/${settings.energy}/${facing}`;
    const scene = planned(settings, facing, actions);
    assertNatural(scene, label);
    armsOk(scene, label);
    const m = scene.marks;
    assert.ok(m["a.jump1.land"] < m["a.jump2.takeoff"] && m["a.jump2.takeoff"] < m["a.jump2.land"], `${label}: both jumps, in order`);
    // (Robot, sneaky and heavy runs hold still a moment after each landing — their style — so for them
    // only the jumps themselves are checked: take-off to landing and into the run.)
    if (!(STYLE_CHANGES[settings.style].hold ?? 0)) keepsGoing(keysOf(scene), facing, m["a.jump1.takeoff"], m["a.jump2.land"], label);
    for (const k of [1, 2]) keepsGoing(keysOf(scene), facing, m[`a.jump${k}.takeoff`], m[`a.jump${k}.runOn`], `${label}: jump ${k}`);
  }
});

test("run on: a jump straight into a run lands into the run's stride at speed (the landing brakes but the hips stay above half the flying speed, no standing pose), and the run stops at its end", () => {
  for (const speed of ["slow", "normal", "fast"] as const) for (const facing of FACINGS) {
    const label = `runOn/${speed}/${facing}`;
    const scene = planned({ ...NATURAL, speed }, facing, [{ move: "run", params: { distance: 400 } }, { move: "jump" }, { move: "run", params: { distance: 400 } }]);
    const keys = keysOf(scene), m = scene.marks;
    assert.ok(m["a.jump1.runOn"] > m["a.jump1.land"], `${label}: the run takes over after the landing`);
    const after = keys.filter((k) => k.t >= m["a.jump1.land"] - 1e-9 && k.t <= m["a.jump1.runOn"] + 0.3);
    const speeds = after.slice(1).map((k, i) => Math.abs(k.x - after[i].x) / (k.t - after[i].t));
    const flying = (keys.find((k) => k.t >= m["a.jump1.top"])!.x - keys.find((k) => k.t >= m["a.jump1.takeoff"])!.x) / (m["a.jump1.top"] - m["a.jump1.takeoff"]);
    assert.ok(Math.min(...speeds) > 0.5 * Math.abs(flying), `${label}: slowest ${Math.min(...speeds).toFixed(0)} px/s (flying ${Math.abs(flying).toFixed(0)} px/s)`);
    for (const k of after) assert.notDeepEqual(k.pose, STAND, `${label}: no standing pose after the landing`);
    assert.deepEqual(keys[keys.length - 1].pose, STAND, `${label}: the run stops at its end`);
  }
});

// (Round 8, Arthur: "what makes it truly unnatural is he's just slowing down at the jump". The flight used
// to be a little slower than the run; now it never is.)
// NO SLOW-DOWN (round 8, Arthur rated the parkour 10/10 but: "what makes it truly unnatural is he's just
// slowing down at the jump"). From the run's last steps through the gather, the take-off, the flight and
// the landing into the next run, the hips never go slower than the run itself does in its own strides
// (a run is slowest the moment a foot lands; the jump may not dip below that).
test("no slow-down at the jump: run -> jump -> run, the hips never go slower than the runs' own slowest moments, gather to run-on (natural, every speed, both directions, 24 fps)", () => {
  for (const speed of ["slow", "normal", "fast"] as const) for (const facing of FACINGS) {
    const label = `noSlowDown/${speed}/${facing}`;
    const scene = planned({ ...NATURAL, speed }, facing, [{ move: "run", params: { distance: 500 } }, { move: "jump" }, { move: "run", params: { distance: 500 } }]);
    const m = scene.marks, fps = 24;
    const hips = buildScene(scene, fps).frames.map((f) => f[0].skeleton.hip.x);
    const speeds = hips.map((x, i) => ({ t: i / fps, v: i ? (x - hips[i - 1]) * fps * sign(facing) : 0 }));
    const during = (a: number, b: number) => speeds.filter((s) => s.t > a + 1e-9 && s.t <= b + 1e-9).map((s) => s.v);
    // The run's own strides at full speed, before the gather (two strides' worth).
    const cruise = Math.min(...during(m["a.jump1.takeoff"] - 1.0, m["a.jump1.takeoff"] - 0.5));
    // Gather, take-off and flight: never slower than the run coming in.
    const jumping = during(m["a.jump1.takeoff"] - 0.5, m["a.jump1.land"]);
    assert.ok(Math.min(...jumping) >= 0.97 * cruise, `${label}: slowest ${Math.min(...jumping).toFixed(0)}px/s before the landing, the run's own slowest ${cruise.toFixed(0)}px/s`);
    // Landing into the next run: never slower than the slower of the two runs. (When the next run is
    // slower than the run-up, the landing eases down to its speed.)
    const next = Math.min(...during(m["a.jump1.runOn"] + 0.3, m["a.jump1.runOn"] + 0.8));
    const landing = during(m["a.jump1.land"], m["a.jump1.runOn"] + 0.2);
    assert.ok(Math.min(...landing) >= 0.97 * Math.min(cruise, next), `${label}: slowest ${Math.min(...landing).toFixed(0)}px/s landing, the runs' own slowest ${cruise.toFixed(0)} / ${next.toFixed(0)}px/s`);
  }
});

test("running jump: a faster run jumps further; the flight keeps the run's speed (never slower, at most a little faster)", () => {
  const flight = (speed: number) => {
    const { out } = runThenJump(NATURAL, "right", 600, {}, speed);
    const take = out.keys.find((k) => k.t === out.marks.takeoff)!, land = out.keys.find((k) => k.t === out.marks.land)!;
    return { d: land.x - take.x, vx: (land.x - take.x) / (out.marks.land - out.marks.takeoff) };
  };
  let previous = 0;
  for (const speed of [300, 500, 700, 1000]) {
    const { d, vx } = flight(speed);
    assert.ok(d > previous + 20, `${speed}px/s jumps ${d.toFixed(0)}px (more than ${previous.toFixed(0)})`);
    assert.ok(vx >= speed - 0.5 && vx < 1.12 * speed, `${speed}px/s: flight speed ${vx.toFixed(0)}`);
    previous = d;
  }
});

// (Round 8: a shorter `distance` than the speed gives used to slow the body down in the air; now MOMENTUM
// wins: the jump is as long as its speed gives, and only a longer one is made exact, by a harder push.)
const jumpLength = (keys: CharacterKey[], out: ReturnType<typeof jump>, facing: Facing) => {
  const takeAt = keys.findIndex((k) => Math.abs(k.t - out.marks.takeoff) < 1e-9);
  let at = takeAt - 1;
  while (at > 0 && (keys[at].contacts ?? []).length !== 1) at -= 1;
  const before = keys[at], land = keys.find((k) => Math.abs(k.t - out.marks.land) < 1e-9)!;
  const foot = (before.contacts ?? [])[0];
  assert.ok(foot, `${facing}: on one foot before the take-off`);
  const from = footX(before, foot, facing);
  return Math.min(...(["lFoot", "rFoot"] as const).map((f) => (footX(land, f, facing) - from) * sign(facing)));
};
test("running jump: a shorter `distance` than the speed gives doesn't slow the body down (MOMENTUM: it jumps what the speed gives, flying at the run's speed)", () => {
  for (const facing of FACINGS) {
    const free = runThenJump(NATURAL, facing, 600);
    const natural = jumpLength(free.keys, free.out, facing);
    for (const asked of [0.5 * natural, natural - 40]) {
      const { keys, out, v } = runThenJump(NATURAL, facing, 600, { distance: asked });
      const got = jumpLength(keys, out, facing);
      assert.ok(Math.abs(got - natural) < 1, `${facing}: asked ${asked.toFixed(0)}px, jumped ${got.toFixed(1)}px (the speed gives ${natural.toFixed(1)}px)`);
      const take = out.keys.find((k) => k.t === out.marks.takeoff)!, land = out.keys.find((k) => k.t === out.marks.land)!;
      const vx = Math.abs(land.x - take.x) / (out.marks.land - out.marks.takeoff);
      assert.ok(vx >= v - 0.5, `${facing}: flight ${vx.toFixed(0)}px/s, run ${v.toFixed(0)}px/s`);
    }
  }
});

test("running jump: a longer `distance` sets the jump's length exactly (take-off foot to the nearer landing foot) when the run's speed can make it, both directions", () => {
  for (const facing of FACINGS) for (const extra of [0, 40, 100]) {
    const free = runThenJump(NATURAL, facing, 600);
    const asked = jumpLength(free.keys, free.out, facing) + extra;
    const { keys, out } = runThenJump(NATURAL, facing, 600, { distance: asked });
    const to = jumpLength(keys, out, facing);
    assert.ok(Math.abs(to - asked) < 1, `${facing}: asked ${asked.toFixed(0)}px, jumped ${to.toFixed(1)}px`);
  }
});

test("running jump: `height` = how high the lowest foot or knee gets at the top (x figure height; natural style, energy 0.5)", () => {
  for (const height of [0.2, 0.35, 0.5]) {
    const scene = planned(NATURAL, "right", [{ move: "run", params: { distance: 500 } }, { move: "jump", params: { height } }]);
    const built = buildScene(scene, 120);
    const s = built.frames[Math.round(scene.marks["a.jump1.top"] * 120)][0].skeleton;
    const clear = TEST_GROUND - Math.max(s.lFoot.y, s.rFoot.y, s.lKnee.y, s.rKnee.y);
    assert.ok(Math.abs(clear - height * TEST_HEIGHT) < 3, `height ${height}: clears ${clear.toFixed(1)}px at the top (want ${(height * TEST_HEIGHT).toFixed(0)})`);
  }
});

test("running jump: short, shallow gather (no deep standing crouch): the take-off foot is down for less time than a standing jump's crouch and push, the hips sink less than half as far; lands leaning further forward", () => {
  // (Round 7: the run's last step before the take-off foot is part of the gather — the hips sink over it
  // while it keeps running — so the gather is measured on the take-off foot itself.)
  const hipLow = (keys: CharacterKey[], until: number) => {
    const built = buildScene(sceneOfKeys(keys), 60);
    return Math.min(...built.frames.filter((_, i) => i / 60 <= until && i / 60 >= keys[0].t).map(([c]) => TEST_GROUND - c.skeleton.hip.y));
  };
  const standing = jump(startStance(), {}, NATURAL);
  const standingLean = Math.max(...standing.keys.filter((k) => k.t >= standing.marks.land).map((k) => k.pose.lean));
  const standingLow = hipLow(standing.keys, standing.marks.takeoff);
  for (const speed of [400, 700, 1000]) {
    const { out, keys } = runThenJump(NATURAL, "right", 600, {}, speed);
    const lean = Math.max(...out.keys.filter((k) => k.t >= out.marks.land).map((k) => k.pose.lean));
    assert.ok(lean > standingLean + 5, `${speed}px/s: landing lean ${lean.toFixed(0)} vs standing ${standingLean.toFixed(0)}`);
    const take = out.keys.findIndex((k) => k.t === out.marks.takeoff);
    const foot = out.keys[take - 1].contacts!;
    let first = take - 1;
    while (first > 0 && JSON.stringify(out.keys[first - 1].contacts) === JSON.stringify(foot)) first -= 1;
    const onFoot = out.marks.takeoff - out.keys[first].t;
    assert.ok(onFoot < standing.marks.takeoff - standing.keys[0].t, `${speed}px/s: on the take-off foot ${onFoot.toFixed(2)}s, shorter than a standing crouch + push`);
    // The hips sink less than half as far below the running height as a standing jump's crouch goes
    // below standing height.
    const running = keys.filter((k) => k.t >= out.keys[0].t);
    const dip = buildScene(sceneOfKeys(running), 60).frames.filter((_, i) => Math.abs(i / 60 - out.keys[0].t) < 1 / 120).map(([c]) => TEST_GROUND - c.skeleton.hip.y)[0] - hipLow(running, out.marks.takeoff);
    const standingDip = TEST_GROUND - buildScene(sceneOfKeys(standing.keys), 60).frames[0][0].skeleton.hip.y - standingLow;
    assert.ok(dip < 0.5 * standingDip, `${speed}px/s: hips sink ${dip.toFixed(0)}px (a standing crouch: ${standingDip.toFixed(0)}px)`);
  }
});

// Arthur's parkour test (round 7): "spikes here, here and here, he has to hop over them: he runs, jumps,
// lands, runs, jumps, lands... then he's tired: slower, breathing hard, maybe a hand on his knee". A wide
// shot (figures 180 px tall), so the three running jumps fit a 16:9 page.
const PARKOUR: Action[] = [
  { move: "run", params: { distance: 180 } }, { move: "jump", params: { distance: 200, height: 0.3 } },
  { move: "run", params: { distance: 120 } }, { move: "jump", params: { distance: 200, height: 0.3 } },
  { move: "run", params: { distance: 120 } }, { move: "jump", params: { distance: 200, height: 0.3 } },
  { move: "run", params: { distance: 100 }, style: "tired" }, { move: "catchBreath" },
];
test("Arthur's parkour test: run, 3 running jumps with runs between, then tired and out of breath — fits a 16:9 page, never stops from the first take-off to the last landing, ends catching its breath once", () => {
  for (const direction of [1, -1] as const) {
    const facing: Facing = direction > 0 ? "right" : "left";
    const scene = fitPlanToPage({ id: "parkour", title: "parkour", height: 180, groundY: TEST_GROUND, characters: [{ id: "a", x: 960, facing, style: "natural", speed: "normal", energy: 0.5, actions: PARKOUR }] }, LIBRARY, 1920);
    const label = `parkour/${direction}`;
    const built = assertNatural(scene, label);
    armsOk(scene, label);
    const m = scene.marks;
    for (const k of [1, 2, 3]) assert.ok(m[`a.jump${k}.takeoff`] < m[`a.jump${k}.land`], `${label}: jump ${k}`);
    assert.ok(m["a.jump1.land"] < m["a.jump2.takeoff"] && m["a.jump2.land"] < m["a.jump3.takeoff"], `${label}: jumps in order`);
    keepsGoing(keysOf(scene), facing, m["a.jump1.takeoff"], m["a.jump3.land"], label);
    assert.ok(m["a.catchBreath1.bentOver"] > m["a.jump3.land"], `${label}: catches its breath at the end`);
    assert.equal(m["a.bentOver"], m["a.catchBreath1.bentOver"], `${label}: no second catch-breath after the asked one`);
    const xs = built.frames.flatMap((f) => Object.values(f[0].skeleton).map((p) => p.x));
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 1920 * 0.92 + 1, `${label}: ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)}px wide`);
  }
});

test("standing jump unchanged: no speed, speed 0 and a missing speed give the same keys", () => {
  for (const settings of allSettings()) for (const facing of FACINGS) for (const distance of [0, 200]) {
    const a = jump(startStance(facing), { distance }, settings);
    assert.deepEqual(jump(startStance(facing), { distance, speed: 0 }, settings), a);
    assert.deepEqual(jump(startStance(facing), { distance, speed: undefined }, settings), a);
  }
});
