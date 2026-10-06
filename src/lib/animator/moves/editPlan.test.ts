import assert from "node:assert/strict";
import test from "node:test";
import { buildScene, type Scene } from "../engine.ts";
import { applyEdits, describeEdit, EditError, fpsOf, unchangedByCharacter, unchangedUntil, withFps, type PlanEdit } from "./editPlan.ts";
import { blockBlockHitPlan, reactionsOnTime } from "./fightScene.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type ScenePlan } from "./plan.ts";
import { parkourPlan } from "./scenes2c.ts";
import { findTest, type TestLook } from "./tests.ts";
import { effectsTestScenes } from "./tests2c.ts";

// SPEC-0017 Phase 2C: EDITING A MADE ANIMATION — change one thing, remake only that.

const LOOK: TestLook = { style: "natural", speed: "normal", energy: 0.5, direction: 1 };
// Review plans (tests.ts): the jab-punch-kick combo (one figure), and Blue punching Red 3 times (Red blocks
// two, the 3rd almost knocks him over).
const combo = () => findTest("fight")!.plan(LOOK);
const fight = () => blockBlockHitPlan();
const build = (plan: ScenePlan) => planToScene(plan, LIBRARY);

// Every key of every character before `t` is the same in both scenes.
function sameKeysBefore(a: Scene, b: Scene, t: number) {
  for (const c of a.characters) {
    const d = b.characters.find((x) => x.id === c.id)!;
    const before = (s: typeof c) => JSON.stringify(s.keys.filter((k) => k.t < t - 1e-9));
    assert.equal(before(d), before(c), `${c.id}: keys before ${t.toFixed(3)} s changed`);
  }
}
// How far Red is knocked back by the 3rd hit, and how long he takes to get his guard back.
function reaction(scene: ReturnType<typeof build>) {
  const red = scene.characters.find((c) => c.id === "a")!.keys, hit = scene.marks["a.getHit3.hit"];
  const x0 = red.filter((k) => k.t <= hit + 1e-9).at(-1)!.x;
  return { push: Math.max(...red.filter((k) => k.t >= hit).map((k) => Math.abs(k.x - x0))), recover: scene.marks["a.getHit3.ready"] - hit };
}
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

test("make the punch stronger: its power goes up, the reaction is bigger, everything before the punch is identical", () => {
  const plan = fight(), old = build(plan);
  const edited = applyEdits(plan, [{ kind: "stronger", action: { character: "Blue", move: "punch", nth: 3 } }]);
  const now = build(edited);
  assert.ok(now.power["b.strike3"] > old.power["b.strike3"] + 0.05, `power ${old.power["b.strike3"].toFixed(2)} -> ${now.power["b.strike3"].toFixed(2)}`);
  for (const k of ["b.strike1", "b.strike2"]) assert.equal(now.power[k], old.power[k], `${k} unchanged`);
  assert.ok((now.hurt.a ?? 0) > (old.hurt.a ?? 0), "it hurts Red more");
  const [r0, r1] = [reaction(old), reaction(now)];
  assert.ok(r1.push > r0.push + 2, `knocked back further: ${r0.push.toFixed(1)} -> ${r1.push.toFixed(1)} px`);
  assert.ok(r1.recover > r0.recover, `takes longer to recover: ${r0.recover.toFixed(2)} -> ${r1.recover.toFixed(2)} s`);
  assert.ok(reactionsOnTime(now), "Red's reaction still lands on the punch");
  // REMAKE ONLY THAT: the 3rd punch starts where the 2nd one ends (its `back` mark). Before it, every key is
  // the same; Blue is the same right up to it; Red only from his last key before his (later) reaction.
  const start = old.marks["b.punch2.back"];
  sameKeysBefore(old, now, start);
  const by = unchangedByCharacter(old, now);
  assert.ok(by.b >= start - 1e-9, `Blue identical until ${by.b.toFixed(3)} s (punch starts ${start.toFixed(3)} s)`);
  const until = unchangedUntil(old, now);
  assert.ok(until > old.marks["a.getHit2.hit"] && until <= old.marks["b.punch3.windup"], `remade only after t = ${until.toFixed(3)} s`);
});

test("one figure: the 2nd punch of the jab-punch-kick, stronger, is remade from its own start", () => {
  const plan = combo(), old = build(plan);
  const now = build(applyEdits(plan, [{ kind: "stronger", action: { move: "punch", nth: 2 } }]));
  assert.ok(now.power["a.strike2"] > old.power["a.strike2"], "stronger");
  assert.equal(now.power["a.strike1"], old.power["a.strike1"], "the jab is the same");
  const start = old.marks["a.punch1.back"];
  assert.ok(unchangedUntil(old, now) >= start - 1e-9, `remade only after t = ${unchangedUntil(old, now).toFixed(3)} s (punch 2 starts ${start.toFixed(3)} s)`);
  sameKeysBefore(old, now, start);
});

test("slower: the scene gets longer (one figure and two); faster: shorter", () => {
  for (const plan of [combo(), fight()]) {
    const old = build(plan);
    const slow = build(applyEdits(plan, [{ kind: "slower" }]));
    const fast = build(applyEdits(plan, [{ kind: "faster" }]));
    assert.ok(slow.durationSec > old.durationSec + 0.2, `${plan.id}: ${old.durationSec.toFixed(2)} -> ${slow.durationSec.toFixed(2)} s`);
    assert.ok(fast.durationSec < old.durationSec, `${plan.id}: faster ${fast.durationSec.toFixed(2)} s`);
    assert.ok(reactionsOnTime(slow) && reactionsOnTime(fast));
  }
  // Just one punch slower: it lands later, and only from where it starts.
  const plan = fight(), old = build(plan);
  const now = build(applyEdits(plan, [{ kind: "slower", action: { character: "Blue", move: "punch", nth: 2 } }]));
  assert.ok(now.marks["b.punch2.hit"] > old.marks["b.punch2.hit"]);
  sameKeysBefore(old, now, old.marks["b.punch1.back"]);
});

test("make Red blue: only the color changes (identical keys)", () => {
  const plan = fight(), old = build(plan);
  const edited = applyEdits(plan, [{ kind: "color", character: "Red", color: "#2563eb" }]);
  const now = build(edited);
  assert.equal(now.characters[0].style.color, "#2563eb");
  assert.deepEqual({ ...now.characters[0].style, color: old.characters[0].style.color }, old.characters[0].style, "nothing else in his look");
  assert.deepEqual(now.characters[1].style, old.characters[1].style, "Blue untouched");
  for (let i = 0; i < old.characters.length; i += 1) assert.deepEqual(now.characters[i].keys, old.characters[i].keys);
  assert.equal(unchangedUntil(old, now), old.durationSec);
  assert.deepEqual(now.marks, old.marks);
});

test("replace punch -> kick: Blue kicks, and Red's reaction is still on time", () => {
  const plan = fight(), old = build(plan);
  const edited = applyEdits(plan, [{ kind: "replace", action: { character: "Blue", move: "punch", nth: 3 }, move: "kick", params: { height: "mid" } }]);
  assert.deepEqual(edited.characters[1].actions[4], { move: "kick", params: { target: "a", height: "mid" } }, "the punch's own params (technique, hand) go; the target stays");
  const now = build(edited);
  assert.ok(now.marks["b.kick1.hit"] !== undefined && now.marks["b.punch3.hit"] === undefined);
  assert.ok(reactionsOnTime(now));
  assert.ok(Math.abs(now.marks["a.getHit3.hit"] - now.marks["b.kick1.hit"]) < 1e-6, "Red reacts the moment the kick lands");
  sameKeysBefore(old, now, old.marks["b.punch2.back"]);
});

test("add and remove keep every reaction on its own strike", () => {
  const plan = fight(), old = build(plan);
  // A jab after Blue's 2nd punch: Red gets a reaction for it, before the almost-fall.
  const added = applyEdits(plan, [{ kind: "add", after: { character: "Blue", move: "punch", nth: 2 }, action: { move: "punch", params: { target: "a", technique: "straight", hand: "front" } } }]);
  assert.deepEqual(added.characters[0].actions.map((a) => `${a.move}:${a.params?.result ?? ""}`), ["walk:", "getHit:block", "getHit:block", "getHit:", "getHit:catch"]);
  const a = build(added);
  assert.equal(Object.keys(a.power).length, 4);
  assert.ok(reactionsOnTime(a));
  sameKeysBefore(old, a, old.marks["b.punch2.back"]);
  // Take out the 1st punch: its block goes with it.
  const removed = applyEdits(plan, [{ kind: "remove", action: { character: "Blue", move: "punch", nth: 1 } }]);
  assert.deepEqual(removed.characters[0].actions.map((x) => `${x.move}:${x.params?.result ?? ""}`), ["walk:", "getHit:block", "getHit:catch"]);
  assert.ok(reactionsOnTime(build(removed)));
  // Taking out only a reaction would leave the next ones answering the wrong strike: asked to change the strike.
  assert.throws(() => applyEdits(plan, [{ kind: "remove", action: { character: "Red", move: "getHit", nth: 1 } }]), EditError);
});

test("rename, effects, fps: nothing else changes", () => {
  const plan = fight(), old = build(plan);
  const renamed = applyEdits(plan, [{ kind: "rename", character: "a", name: "Rocky" }]);
  assert.equal(renamed.characters[0].name, "Rocky");
  assert.equal(renamed.characters[0].id, "a", "the id stays, so every timing still finds him");
  assert.deepEqual(build(renamed).characters.map((c) => c.keys), old.characters.map((c) => c.keys));

  const withFire: ScenePlan = { ...plan, effects: [{ kind: "fire", start: 1, end: 2, anchor: { x: 900, y: 700 }, params: { color: "#ff8800", size: 0.5 } }, { kind: "smoke", start: 2, end: 3, anchor: { x: 900, y: 700 } }] };
  const blue = applyEdits(withFire, [{ kind: "color", effect: { kind: "fire" }, color: "#3b82f6" }, { kind: "bigger", effect: { kind: "fire" } }, { kind: "smaller", effect: { kind: "smoke" }, factor: 2 }]);
  assert.deepEqual(blue.effects![0].params, { color: "#3b82f6", size: 0.65 });
  assert.equal(blue.effects![1].params!.size, 0.5);
  assert.deepEqual(blue.characters, withFire.characters);

  // "Make it 8 FPS": same keys, just fewer pictures.
  const eight = withFps(plan, 8);
  assert.equal(fpsOf(eight, 24), 8);
  assert.equal(fpsOf(plan, 24), 24);
  const scene = build(eight);
  assert.equal(unchangedUntil(old, scene), old.durationSec);
  const frames = buildScene(scene, fpsOf(eight, 24));
  assert.equal(frames.fps, 8);
  assert.ok(Math.abs(frames.report.frameCount - old.durationSec * 8) <= 2, `${frames.report.frameCount} pictures`);
});

test("the original plan is never changed", () => {
  const plan = deepFreeze(fight());
  const copy = JSON.parse(JSON.stringify(plan));
  const edits: PlanEdit[] = [
    { kind: "stronger", action: { character: "Blue", move: "punch", nth: 3 } }, { kind: "slower" }, { kind: "slower", character: "Red" },
    { kind: "color", character: "Red", color: "#2563eb" }, { kind: "replace", action: { character: "Blue", move: "punch", nth: 1 }, move: "kick" },
    { kind: "add", after: { character: "Blue", nth: "last" }, action: { move: "punch", params: { target: "a" } } },
    { kind: "remove", action: { character: "Blue", move: "punch", nth: 1 } }, { kind: "rename", character: "Blue", name: "Ice" }, { kind: "fps", fps: 8 },
  ];
  const edited = applyEdits(plan, edits);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), copy);
  assert.notDeepEqual(edited, plan);
  assert.equal(edited.characters[1].name, "Ice");
});

test("picking: by name or id, nth and last; unclear picks are asked about, not guessed", () => {
  const plan = fight();
  const last = applyEdits(plan, [{ kind: "weaker", action: { move: "punch", nth: "last" } }]);
  assert.equal(last.characters[1].actions[4].energy, 0.55);
  // "Make the hit stronger" = the strike it answers.
  const hit = applyEdits(plan, [{ kind: "stronger", action: { character: "Red", move: "reaction", nth: 3 } }]);
  assert.equal(hit.characters[1].actions[4].energy, 1);
  assert.throws(() => applyEdits(plan, [{ kind: "stronger", action: { move: "punch" } }]), /3 punches: which one/);
  assert.throws(() => applyEdits(plan, [{ kind: "faster", action: { move: "walk" } }]), /both have a walk/);
  assert.throws(() => applyEdits(plan, [{ kind: "color", character: "Green", color: "#0f0" }]), /nobody called "Green"/);
  assert.throws(() => applyEdits(plan, [{ kind: "stronger", action: { character: "Blue", move: "punch", nth: 4 } }]), /only 3 punches/);
});

test("describeEdit: a plain sentence for the chat", () => {
  assert.equal(describeEdit({ kind: "stronger", action: { character: "Red", move: "punch", nth: 2 } }), "Make Red's 2nd punch stronger.");
  assert.equal(describeEdit({ kind: "slower" }), "Make the whole scene slower.");
  assert.equal(describeEdit({ kind: "color", character: "Red", color: "blue" }), "Make Red blue.");
  assert.equal(describeEdit({ kind: "replace", action: { move: "punch", nth: "last" }, move: "kick" }), "Change the last punch into a kick.");
  assert.equal(describeEdit({ kind: "fps", fps: 8 }), "Make it 8 pictures a second (same timing, fewer pictures).");
  assert.equal(describeEdit({ kind: "bigger", effect: { kind: "fire" } }), "Make the fire bigger.");
});

// Arthur (2026-10-06): "If the user says change the background to gray or any color, use the background color in
// the Select tool Properties. For a thunderstorm the sky is dark blue but the hills stay green."
test("background color: the page's color goes on the plan (canvasColor), as #rrggbb; nothing else changes", () => {
  const plan = fight(), old = build(plan);
  const gray = applyEdits(plan, [{ kind: "backgroundColor", color: "Gray" }]);
  assert.equal(gray.canvasColor, "#6b7280");
  assert.equal((build(gray) as { canvasColor?: string }).canvasColor, "#6b7280", "the scene carries it to the app");
  assert.deepEqual(build(gray).characters, old.characters, "the figures are untouched");
  assert.deepEqual({ ...gray, canvasColor: undefined }, { ...plan, canvasColor: undefined });
  assert.equal(applyEdits(plan, [{ kind: "backgroundColor", color: "#3AF" }]).canvasColor, "#33aaff", "a short code is written out in full");
  assert.equal(applyEdits(plan, [{ kind: "backgroundColor", color: "white" }]).canvasColor, "#ffffff");
  assert.throws(() => applyEdits(plan, [{ kind: "backgroundColor", color: "sparkly" }]), /don't know the color "sparkly"/);
  assert.equal(describeEdit({ kind: "backgroundColor", color: "gray" }), "Make the page's background gray.");
  // The new plan field changes no existing scene: none of the test scenes has it, and they build without it.
  for (const entry of effectsTestScenes()) if (entry.plan) assert.ok(!("canvasColor" in planToScene(entry.plan, LIBRARY)), entry.id);
  assert.ok(!("canvasColor" in old));
});

test("sky color: only the sky changes (a thunderstorm: dark blue sky, the hills stay green)", () => {
  const plan = parkourPlan();
  const storm = applyEdits(plan, [{ kind: "skyColor", color: "dark blue" }]);
  const sky = storm.background!.pieces.find((p) => p.kind === "sky")!;
  assert.equal(sky.params!.color, "#1e2a5a");
  assert.ok(typeof sky.params!.color2 === "string" && sky.params!.color2 !== "#1e2a5a", "the horizon is a lighter mix of it");
  assert.equal(applyEdits(plan, [{ kind: "skyColor", color: "dark blue", horizon: "#445566" }]).background!.pieces[0].params!.color2, "#445566");
  storm.background!.pieces.forEach((p, i) => { if (p.kind !== "sky") assert.deepEqual(p, plan.background!.pieces[i], `${p.kind} keeps its colors`); });
  assert.deepEqual(storm.characters, plan.characters);
  assert.equal(storm.canvasColor, undefined, "the page's own color is not touched");
  assert.throws(() => applyEdits(fight(), [{ kind: "skyColor", color: "dark blue" }]), /no sky in this scene/);
  assert.equal(describeEdit({ kind: "skyColor", color: "dark blue" }), "Make the sky dark blue (everything else keeps its colors).");
});
