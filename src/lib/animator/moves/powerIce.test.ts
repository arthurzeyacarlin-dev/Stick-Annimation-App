import assert from "node:assert/strict";
import test from "node:test";
import { buildScene } from "../engine.ts";
import { CRACK_SECONDS, iceSpikeOutline } from "../effects/ice.ts";
import { buildEffectFrames, type EffectScene, type Shape } from "../effects/index.ts";
import { JOINTS, type Point } from "../rig.ts";
import { centerAnimation } from "../stageFit.ts";
import { sceneEffectLayers } from "../toFrames.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { ICE_MOVES } from "./powerIce.ts";
import { POWER_MOVES } from "./powers.ts";
import { iceMountainPlan, iceThrowPlan } from "./scenesIce.ts";
import { effectsTestScenes, makeEffectsTestScene } from "./tests2c.ts";
import { allSettings, armPathProblems, assertNatural, sceneOfKeys, startStance } from "./testkit.ts";

// ICE POWERS (SPEC-0017 Phase 2C, powerIce.ts): "a stick figure lifts up his hand and an ice mountain appears, or he
// can throw ice crystals" (Arthur, 2026-10-06).
const H = 300;
const sceneOf = (plan: ScenePlan) => planToScene(plan, LIBRARY) as ReturnType<typeof planToScene> & EffectScene;
const NATURAL = { height: H, style: "natural" as const, speed: "normal" as const, energy: 0.5 };
// A spike is an "Ice spike" Library symbol placement: its outline on the stage.
const spikeBodies = (shapes: readonly Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "symbol" }> => s.kind === "symbol" && s.name === "Ice spike").map((s) => ({ points: iceSpikeOutline(s) }));
const crystals = (shapes: readonly Shape[]) => shapes.filter((s): s is Extract<Shape, { kind: "symbol" }> => s.kind === "symbol" && s.name === "Ice crystal");
// The falling pieces of a shattered spike: Ice crystal chunks and Ice crumbs.
const pieces = (shapes: readonly Shape[]) => shapes.filter((s) => s.kind === "symbol" && (s.name === "Ice crystal" || s.name === "Ice crumb"));
const insidePoly = (p: Point, pts: number[]) => {
  let inside = false;
  for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
    const [xi, yi, xj, yj] = [pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

test("the ice powers are power moves in the library", () => {
  for (const id of ICE_MOVES) { assert.ok(LIBRARY[id], id); assert.ok(POWER_MOVES.has(id), id); }
  assert.deepEqual([...ICE_MOVES], ["iceMountain", "iceThrow"]);
});

test("ice powers keep the body rules at 8/12/24 fps in every style, speed and energy, both ways", () => {
  const cases: [string, Record<string, unknown>][] = [["iceMountain", { distance: 700 }], ["iceMountain", {}], ["iceThrow", { distance: 600 }]];
  for (const [id, params] of cases) for (const settings of allSettings()) for (const facing of ["right", "left"] as const) {
    const out = LIBRARY[id].run(startStance(facing, 960), params, settings);
    const label = `${id} ${JSON.stringify(params)} ${settings.style}/${settings.speed}/${settings.energy} ${facing}`;
    const scene = { ...sceneOfKeys(out.keys, facing), marks: Object.fromEntries(Object.entries(out.marks).map(([k, v]) => [`a.${id}1.${k}`, v])) };
    assertNatural(scene, label);
    const b8 = buildScene(scene, 8);
    for (const r of b8.report.characters) {
      assert.ok(r.maxBoneErrorPx <= 0.5 && r.maxFootDriftPx <= 1 && r.belowGroundFrames === 0, `${label}@8: body rules`);
      assert.ok(r.maxJointStepPx < 360, `${label}@8: joint jumped ${r.maxJointStepPx.toFixed(0)}`);
    }
    assert.deepEqual(armPathProblems(buildScene(scene, 24).frames, 24), [], label);
    // EARTH GRAVITY: a power never lifts the body off the ground (both feet planted, the throw steps one at a time).
    assert.ok(out.keys.every((k) => (k.contacts ?? ["lFoot", "rFoot"]).length >= 1 && (k.lift ?? 0) === 0), `${label}: on the ground`);
  }
});

test("ice powers have their marks, in order; anticipation before the action", () => {
  const order: Record<string, string[]> = { iceMountain: ["windup", "release", "lift", "end", "shatter"], iceThrow: ["windup", "release", "hit"] };
  for (const [id, names] of Object.entries(order)) {
    const m = LIBRARY[id].run(startStance(), { distance: 700 }, NATURAL).marks;
    for (const n of names) assert.ok(Number.isFinite(m[n]), `${id}: mark ${n}`);
    for (let i = 1; i < names.length; i += 1) assert.ok(m[names[i]] > m[names[i - 1]], `${id}: ${names[i - 1]} before ${names[i]}`);
    assert.ok(m.windup >= 0.25 && m.release - m.windup >= 0.08, `${id}: a real wind-up before the action`);
  }
  const m = LIBRARY.iceMountain.run(startStance(), { distance: 700 }, NATURAL).marks;
  assert.ok(m.reach > m.release && m.reach < m.end, "the ice reaches the target while the hand is up");
  assert.ok(Math.abs(m.shatter - m.end - CRACK_SECONDS) < 1e-6, "it cracks while the hand comes down and shatters as it gets there");
});

test("ICE MOUNTAIN: the hand goes down and back first, then lifts up in front — and the ice grows timed to it", () => {
  const scene = sceneOf(iceMountainPlan());
  const m = scene.marks;
  const built = buildScene(scene, 24);
  const red = (t: number) => built.frames[Math.round(t * 24)].find((c) => c.id === "red")!.skeleton;
  const rel = (t: number) => { const s = red(t); return { x: s.lHand.x - s.hip.x, y: s.lHand.y - s.neck.y }; };
  const start = rel(0.2), wind = rel(m["red.iceMountain1.windup"]), up = rel(m["red.iceMountain1.lift"]);
  assert.ok(wind.x < start.x - 0.08 * H, `the casting hand pulled back behind the hips first (${JSON.stringify({ start, wind })})`);
  assert.ok(red(m["red.iceMountain1.windup"]).lHand.y > red(0.2).lHand.y + 0.03 * H, "and down (lower than standing)");
  assert.ok(up.y < -0.08 * H && up.x > 0.1 * H, `then up in front, above the shoulder (${JSON.stringify(up)})`);
  // The crouch: the hips go down in the wind-up (knees bend), and come up with the lift.
  const hipY = (t: number) => red(t).hip.y;
  assert.ok(hipY(m["red.iceMountain1.windup"]) > hipY(0.2) + 0.03 * H && hipY(m["red.iceMountain1.lift"]) < hipY(m["red.iceMountain1.windup"]) - 0.03 * H, "crouch, then rise");
  // The ice starts as the hand comes up: the track starts at `release` and the first spike is out of the ground
  // before the hand is at the top.
  const ice = scene.effects!.find((e) => e.kind === "iceSpikes")!;
  assert.ok(Math.abs(ice.start - m["red.iceMountain1.release"]) < 1e-9, "the ice starts at the release");
  const fx = buildEffectFrames(scene, built);
  const firstSpike = fx.findIndex((f) => spikeBodies(f.front).length > 0) / 24;
  assert.ok(firstSpike > m["red.iceMountain1.release"] - 1e-9 && firstSpike <= m["red.iceMountain1.lift"] + 1 / 24, `first spike at ${firstSpike.toFixed(2)} s, as the hand lifts`);
  assert.ok(red(m["red.iceMountain1.release"] + 2 / 24).lHand.y < red(m["red.iceMountain1.release"]).lHand.y - 0.05 * H, "the hand is going up then");
  // The shatter comes as the hand gets down.
  const shatter = m["red.iceMountain1.shatter"];
  assert.ok(rel(shatter).y > 0.2 * H, "the hand is down at the shatter");
  const firstPiece = fx.findIndex((f) => pieces(f.front).length > 0) / 24;
  assert.ok(firstPiece >= shatter - 1e-9 && firstPiece <= shatter + 1 / 24 + 1e-9, "pieces from the shatter on");
});

test("ICE MOUNTAIN scene: the ice runs along the ground to where Blue stood; Blue jumps back in time and nobody is ever inside the ice", () => {
  const scene = sceneOf(iceMountainPlan());
  const m = scene.marks;
  assert.ok(m["blue.jump1.takeoff"] < m["red.iceMountain1.reach"] && m["blue.jump1.takeoff"] > m["red.iceMountain1.release"], "Blue sees it coming and jumps just before it reaches him");
  const ice = scene.effects!.find((e) => e.kind === "iceSpikes")!;
  assert.ok("x" in ice.target! && Math.abs(ice.target.x - 1360) < 0.05 * H, "to Blue's spot");
  assert.ok("x" in ice.anchor && Math.abs(ice.anchor.x - (560 + 0.4 * H)) < 0.05 * H, "from just in front of Red");
  for (const fps of [8, 12, 24]) {
    const built = buildScene(scene, fps), fx = buildEffectFrames(scene, built);
    fx.forEach((f, i) => {
      const bodies = spikeBodies(f.front);
      for (const c of built.frames[i]) for (const name of JOINTS) {
        const p = c.skeleton[name];
        assert.ok(!bodies.some((b) => insidePoly(p, b.points)), `${fps} fps, ${(i / fps).toFixed(2)} s: ${c.id}.${name} inside the ice`);
      }
    });
    // Every frame rate sees the ice grow, stand and shatter.
    const withSpikes = fx.filter((f) => spikeBodies(f.front).length > 0).length, withPieces = fx.filter((f) => pieces(f.front).length > 0).length;
    assert.ok(withSpikes >= 1.5 * fps && withPieces >= 0.4 * fps, `${fps} fps: ${withSpikes} pictures of ice, ${withPieces} of pieces`);
  }
  const blue = buildScene(scene, 12).frames.map((f) => f.find((c) => c.id === "blue")!.skeleton.hip.x);
  assert.ok(blue[blue.length - 1] - blue[0] > 0.8 * H, "Blue ends well back from where the ice came up");
});

test("ICE CRYSTALS scene: the shield is up before the crystals come, they leave Red's hand, hit the shield's edge and shatter; Blue is pushed back a little and holds", () => {
  const scene = sceneOf(iceThrowPlan());
  const m = scene.marks;
  const shards = scene.effects!.find((e) => e.kind === "iceShards")!;
  assert.ok(Math.abs(shards.start - m["red.iceThrow1.release"]) < 1e-9, "the crystals leave at the release");
  assert.ok(Math.abs(shards.start + Number(shards.params!.travel) - m["red.iceThrow1.hit"]) < 1e-9, "the first hits at `hit`");
  assert.ok(m["blue.waterShield1.hold"] < m["red.iceThrow1.release"], "shield up before the throw");
  assert.ok(m["blue.waterShield1.release"] > m["red.iceThrow1.hit"] + 0.5, "and still up after the hits");
  assert.ok(shards.target && "character" in shards.target && shards.target.character === "blue" && shards.target.joint === "hip", "aimed at the shield round Blue");
  assert.ok(Math.abs(m["blue.waterShield1.pushed"] - m["red.iceThrow1.hit"]) < 0.3, "Blue is pushed back as they hit");
  const built = buildScene(scene, 24), fx = buildEffectFrames(scene, built);
  // The first crystal leaves from Red's throwing hand.
  const i0 = Math.ceil(m["red.iceThrow1.release"] * 24 - 1e-9);
  const hand = built.frames[i0].find((c) => c.id === "red")!.skeleton.rHand;
  const c0 = crystals(fx[i0].front);
  assert.ok(c0.length >= 1 && Math.hypot(c0[0].x - hand.x, c0[0].y - hand.y) < 0.2 * H, "from the hand");
  // At the hit it is at the shield's near edge (about 0.65 x height in front of Blue's hips), never inside Blue.
  const iHit = Math.floor(m["red.iceThrow1.hit"] * 24 + 1e-9);
  const blueHip = built.frames[iHit].find((c) => c.id === "blue")!.skeleton.hip;
  const lead = crystals(fx[iHit].front).reduce((a, b) => (a.x > b.x ? a : b));
  assert.ok(blueHip.x - lead.x > 0.45 * H && blueHip.x - lead.x < 0.85 * H, `at the shield's edge (${(blueHip.x - lead.x).toFixed(0)} px in front of Blue)`);
  const after = assertNatural(scene, "ice crystals");
  const blue = after.frames.map((f) => f.find((c) => c.id === "blue")!);
  for (const c of blue) assert.ok(c.skeleton.hip.y < scene.groundY - 0.35 * H, "Blue stays standing");
  assert.ok(Math.abs(blue[blue.length - 1].skeleton.hip.x - blue[0].skeleton.hip.x) < 10, "Blue holds his spot");
  // Every frame rate sees the crystals fly and shatter.
  for (const fps of [8, 12, 24]) {
    const f = buildEffectFrames(scene, buildScene(scene, fps));
    assert.ok(f.filter((p) => pieces(p.front).length > 0).length >= 0.5 * fps, `${fps} fps`);
  }
});

test("both ice scenes are in the Effects (2C) list and stay on the page (figures and ice) on 16:9, 1:1 and 9:16 pages", () => {
  const entries = effectsTestScenes().filter((e) => e.id === "iceMountain" || e.id === "iceCrystals");
  assert.deepEqual(entries.map((e) => e.label), ["Ice mountain", "Ice crystals"]);
  for (const entry of entries) for (const stageWidth of [1920, 1080, (1080 * 9) / 16]) {
    const scene = makeEffectsTestScene(entry.plan!, stageWidth) as EffectScene;
    const built = buildScene(scene, 12);
    const centered = centerAnimation(built.frames, stageWidth, built.objects);
    const left = 960 - stageWidth / 2, right = 960 + stageWidth / 2;
    // (The ice only: the water shield is its own effect.)
    const layers = sceneEffectLayers({ ...scene, effects: scene.effects!.filter((e) => e.kind.startsWith("ice")) } as EffectScene, built, centered.shift);
    layers.effects!.forEach((f, i) => {
      for (const s of [...f.back, ...f.front]) {
        const pts = s.kind === "symbol" || s.kind === "circle" || s.kind === "rect" ? [s.x, s.y] : s.points;
        for (let k = 0; k + 1 < pts.length; k += 2) assert.ok(pts[k] >= left - 1 && pts[k] <= right + 1, `${entry.id} (${stageWidth.toFixed(0)}) ${(i / 12).toFixed(2)} s: ${s.kind} at x ${pts[k].toFixed(0)} off the page`);
      }
      for (const c of centered.frames[i]) for (const name of JOINTS) assert.ok(c.skeleton[name].x >= left && c.skeleton[name].x <= right, `${entry.id}: ${c.id}.${name} off the page`);
    });
  }
});
