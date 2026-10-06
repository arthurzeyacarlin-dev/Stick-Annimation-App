import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { LIBRARY } from "./library.ts";
import type { EffectScene } from "../effects/index.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { POWER_MOVES, powerEffects } from "./powers.ts";
import { fireBlastPlan, sisterTestPlan, teleportPlan, waterShieldPlan } from "./scenesPowers.ts";
import { allSettings, armPathProblems, assertNatural, sceneOfKeys, startStance } from "./testkit.ts";

// POWERS (SPEC-0017 Phase 2C, powers.ts): body move + effect.
const sceneOf = (plan: ScenePlan) => planToScene(plan, LIBRARY) as ReturnType<typeof planToScene> & EffectScene;

test("power moves are in the library", () => {
  for (const id of POWER_MOVES) assert.ok(LIBRARY[id], id);
});

test("power moves keep the body rules at 8/12/24 fps in every style, speed and energy", () => {
  const cases: [string, Record<string, unknown>][] = [["fireBlast", { distance: 600 }], ["waterShield", { seconds: 1.2 }], ["teleport", { distance: 500 }], ["teleport", { distance: -400 }]];
  for (const [id, params] of cases) for (const settings of allSettings()) for (const facing of ["right", "left"] as const) {
    const out = LIBRARY[id].run(startStance(facing, 960), params, settings);
    const label = `${id} ${JSON.stringify(params)} ${settings.style}/${settings.speed}/${settings.energy} ${facing}`;
    const scene = { ...sceneOfKeys(out.keys, facing), marks: Object.fromEntries(Object.entries(out.marks).map(([k, v]) => [`a.${id}1.${k}`, v])) };
    assertNatural(scene, label);
    // (8 fps: the same rules, the joint step scaled like 12 vs 24.)
    const b8 = buildScene(scene, 8);
    for (const r of b8.report.characters) {
      assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label}@8: body rules`);
      assert.ok(r.maxJointStepPx < 360, `${label}@8: joint jumped ${r.maxJointStepPx.toFixed(0)}`);
    }
    assert.deepEqual(armPathProblems(buildScene(scene, 24).frames, 24), [], label);
  }
});

test("power moves have their marks, in order", () => {
  const settings = { height: 300, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  const order: Record<string, string[]> = { fireBlast: ["windup", "release", "end"], waterShield: ["raise", "hold", "release"], teleport: ["crouch", "vanish", "appear", "end"] };
  for (const [id, names] of Object.entries(order)) {
    const m = LIBRARY[id].run(startStance(), id === "teleport" ? { distance: 500 } : {}, settings).marks;
    for (const n of names) assert.ok(Number.isFinite(m[n]), `${id}: mark ${n}`);
    for (let i = 1; i < names.length; i += 1) assert.ok(m[names[i]] >= m[names[i - 1]], `${id}: ${names[i - 1]} before ${names[i]}`);
  }
  // ANTICIPATION before the action: the fire blast winds up for a real moment before the release.
  const fb = LIBRARY.fireBlast.run(startStance(), {}, settings).marks;
  assert.ok(fb.windup >= 0.25 && fb.release - fb.windup >= 0.1, "fire blast anticipation");
});

test("powerEffects gives tracks at the marks", () => {
  const scene = sceneOf(fireBlastPlan());
  const m = scene.marks;
  const fx = scene.effects ?? [];
  const stream = fx.find((e) => e.kind === "fireStream")!;
  assert.ok(stream && Math.abs(stream.start - m["red.fireBlast1.release"]) < 1e-9 && Math.abs(stream.end - m["red.fireBlast1.end"]) < 1e-9, "fire from release to end");
  assert.equal((stream.params ?? {}).color, "#ff5a12", "colors pass through");
  const burst = fx.find((e) => e.kind === "fireBurst")!;
  assert.ok(burst && burst.start > stream.start && burst.start <= stream.end, "the burst when the stream arrives");
  const shield = sceneOf(waterShieldPlan());
  const ws = (shield.effects ?? []).find((e) => e.kind === "waterShield")!;
  assert.ok(ws && Math.abs(ws.start - shield.marks["blue.waterShield1.hold"]) < 1e-9 && Math.abs(ws.end - shield.marks["blue.waterShield1.release"]) < 1e-9, "shield from hold to release");
  assert.deepEqual({ character: (ws.anchor as { character: string }).character, joint: (ws.anchor as { joint: string }).joint }, { character: "blue", joint: "hip" });
  const tp = sceneOf(teleportPlan());
  const kinds = (tp.effects ?? []).map((e) => `${e.kind}@${e.start.toFixed(3)}`);
  for (const k of [1, 2]) for (const mark of ["vanish", "appear"]) assert.ok(kinds.includes(`flash@${tp.marks[`a.teleport${k}.${mark}`].toFixed(3)}`), `teleport ${k} ${mark} flash`);
  // A teleport is QUICK: a short flash at each spot, never a dust cloud (Arthur: "not fire, explosion or ice
  // crystals; it's quick").
  assert.ok(!(tp.effects ?? []).some((e) => e.kind === "smokeBurst"), "no smoke cloud");
  for (const e of tp.effects ?? []) assert.ok(e.kind === "flash" && e.end - e.start <= 0.16, `${e.kind} is a quick flash (${(e.end - e.start).toFixed(2)} s)`);
  // The flash at the start spot is bright as the body goes (the jump is just after it starts).
  for (const k of [1, 2]) assert.ok(tp.marks[`a.teleport${k}.appear`] - tp.marks[`a.teleport${k}.vanish`] < 0.08, `teleport ${k}: flash covers the jump`);
  // (The same tracks again from the marks alone.)
  assert.equal(powerEffects(fireBlastPlan(), m).length, fx.length);
});

test("sister's test: the shield is up before the fire arrives, the fire hits the shield, Blue holds", () => {
  const scene = sceneOf(sisterTestPlan());
  const m = scene.marks;
  const fx = scene.effects ?? [];
  const burst = fx.find((e) => e.kind === "fireBurst")!;
  const stream = fx.find((e) => e.kind === "fireStream")!;
  assert.ok(m["blue.waterShield1.hold"] < m["red.fireBlast1.release"], "shield up before the fire comes out");
  assert.ok(m["blue.waterShield1.hold"] < burst.start - 0.2, "shield up well before the fire arrives");
  assert.ok(m["blue.waterShield1.release"] > burst.end - 0.35, "shield stays up until the fire is done");
  assert.ok(stream.target && "character" in stream.target && stream.target.character === "blue" && stream.target.joint === "hip", "aimed at the shield round Blue");
  assert.ok(Math.abs(m["blue.waterShield1.pushed"] - burst.start) < 0.3, "Blue is pushed back as the fire hits");
  assert.ok(fx.some((e) => e.kind === "smokeBurst"), "steam where fire meets water");
  const built = assertNatural(scene, "sister's test");
  // Blue never goes down: the hips stay up and the feet stay put.
  const blue = built.frames.map((f) => f.find((c) => c.id === "blue")!);
  for (const c of blue) assert.ok(c.skeleton.hip.y < scene.groundY - 0.35 * 300, "Blue stays standing");
  assert.ok(Math.abs(blue[blue.length - 1].skeleton.hip.x - blue[0].skeleton.hip.x) < 10, "Blue holds his spot");
});

test("teleport ends at the new x; the jump is inside its fast span", () => {
  const scene = sceneOf(teleportPlan());
  const keys = scene.characters[0].keys;
  assert.ok(Math.abs(keys[keys.length - 1].x - 760) < 1, `ends at 760 (${keys[keys.length - 1].x.toFixed(1)})`);
  const firstEnd = scene.marks["a.teleport1.end"];
  const at = keys.find((k) => Math.abs(k.t - firstEnd) < 1e-6)!;
  assert.ok(Math.abs(at.x - 1360) < 1, `first teleport ends at 1360 (${at.x.toFixed(1)})`);
  for (const fps of [8, 12, 24]) {
    const b = buildScene(scene, fps);
    assert.ok(b.report.characters[0].maxFastStepPx > 300, `${fps}: the jump is in the fast span`);
    assert.ok(b.report.characters[0].maxJointStepPx < (fps === 24 ? 120 : 240), `${fps}: smooth outside it`);
  }
});

test("teleporting back keeps facing; no turn", () => {
  // Arthur: "for teleportation you don't need to turn around — you can teleport wherever you want."
  const scene = sceneOf(teleportPlan());
  const keys = scene.characters[0].keys;
  assert.ok(keys.every((k) => (k.facing ?? "right") === "right"), "faces right the whole time, even teleporting back left");
  assert.ok(!Object.keys(scene.marks).some((m) => /turn/i.test(m)), "no turn in the scene");
  // (The second teleport takes as long as the first, after the 0.4 s wait: no time spent turning.)
  const first = scene.marks["a.teleport1.end"], second = scene.marks["a.teleport2.end"] - first - 0.4;
  assert.ok(Math.abs(second - first) < 0.05, `goes straight back (${first.toFixed(2)} s, then ${second.toFixed(2)} s)`);
  // The move itself never turns, whichever way it goes and whichever way the figure faces.
  const settings = { height: 300, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
  for (const facing of ["right", "left"] as const) for (const distance of [500, -500]) {
    const out = LIBRARY.teleport.run(startStance(facing, 960), { distance }, settings);
    assert.equal(out.end.facing, facing, `${facing} ${distance}: ends facing ${facing}`);
    assert.ok(out.keys.every((k) => (k.facing ?? facing) === facing), `${facing} ${distance}: never turns`);
  }
  // A plan facing left that teleports right (behind it): the planner adds no turn either.
  const left = sceneOf({ id: "tp-left", title: "Teleport behind", height: 300, groundY: 900, stageWidth: 1920, characters: [{ id: "a", name: "A", x: 1300, facing: "left", actions: [{ move: "teleport", params: { to: 1500 } }] }] });
  const lk = left.characters[0].keys;
  assert.ok(lk.every((k) => (k.facing ?? "left") === "left"), "still faces left");
  assert.ok(Math.abs(lk[lk.length - 1].x - 1500) < 1, "and is there");
});
