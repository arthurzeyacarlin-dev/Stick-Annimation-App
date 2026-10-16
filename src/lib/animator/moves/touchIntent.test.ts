// THE ENGINE READS A TOUCH (moves/declareContacts.ts readTouches / touchIntents): a custom move whose words say it touches a thing
// or a partner, or whose key says `touch`, declares the contact — the solver (contacts.ts) then puts the hand on it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readTouches, touchIntents } from "./declareContacts.ts";
import { makeEffectsTestScene } from "./tests2c.ts";
import { buildScene } from "../engine.ts";
import { autoRepair, tidyPlan } from "../claude/claudeAnimator.ts";
import { worldAt } from "../world.ts";

const stove = { kind: "prop", start: -1, end: 30, anchor: { x: 1000, y: 790 }, layer: "back", params: { name: "hot stove", size: 0.6, parts: [{ shape: "rect", x: 0, y: 0.25, w: 1, h: 0.5, color: "#cfd4da" }, { shape: "rect", x: 0, y: -0.02, w: 1, h: 0.06, color: "#ef4444" }] } };
const put = { move: "custom", params: { name: "puts her hand down on the counter without looking", keys: [{ pose: { lean: 10, head: -15, rShoulder: 50, rElbow: 20, lShoulder: -5, lElbow: 10 }, hold: 1.6 }] } };
const shake = { move: "custom", params: { name: "handshake", keys: [{ pose: { rShoulder: 55, rElbow: 30 } }, { pose: { rShoulder: 45, rElbow: 30 }, hold: 0.15 }, { pose: { rShoulder: 58, rElbow: 30 }, hold: 0.15 }, { pose: { rShoulder: -6, rElbow: 10 } }] } };
const H = 300;

test("TOUCH WORDS + A NAMED THING: 'puts her hand on the stove' → rHand on the stove's drawn top for the key's hold", () => {
  const plan = { height: H, characters: [{ id: "w", x: 520, actions: [{ move: "walk", params: { distance: 300 } }, { ...put, params: { ...put.params, name: "puts her hand down on the stove" } }] }], effects: [stove] };
  const [t] = readTouches(plan);
  assert.deepEqual({ figure: t.figure, n: t.n, joint: t.joint, keys: t.keys, target: t.target }, { figure: "w", n: 1, joint: "rHand", keys: [{ j: 0, hold: 1.6 }], target: { prop: 0, point: "top" } });
  const c = touchIntents(plan, { "w.custom1.k1": 2.5 });
  assert.equal(c.length, 1); assert.ok(Math.abs(c[0].from - 2.5) < 1e-9 && Math.abs(c[0].to - 4.1) < 1e-9);
});

test("NO THING NAMED: the nearest thing close by is the touched one; a far thing is not (a 'holds a pose' never grabs a tree)", () => {
  const near = { height: H, characters: [{ id: "w", x: 700, actions: [put] }], effects: [stove] };
  assert.deepEqual(readTouches(near)[0]?.target, { prop: 0, point: "top" });
  const far = { height: H, characters: [{ id: "w", x: 700, actions: [{ move: "custom", params: { name: "holds a proud pose", keys: [{ pose: { rShoulder: 60 }, hold: 1 }] } }] }], effects: [{ ...stove, anchor: { x: 1900, y: 790 } }] };
  assert.equal(readTouches(far).length, 0);
  assert.equal(readTouches({ height: H, characters: [{ id: "w", x: 700, actions: [{ move: "custom", params: { name: "robot dance", keys: [{ pose: { rShoulder: 60 }, hold: 1 }] } }] }], effects: [stove] }).length, 0, "no touch words = no touch");
});

test("A PARTNER TOUCH: two custom 'handshake's → each rHand on the other's rHand (the solver meets them in the middle), over the held keys", () => {
  const plan = { height: H, characters: [{ id: "a", x: 900, actions: [shake] }, { id: "b", x: 760, actions: [shake] }] };
  const ts = readTouches(plan);
  assert.deepEqual(ts.map((t) => [t.figure, t.joint, t.target]), [["a", "rHand", { figure: "b", joint: "rHand" }], ["b", "rHand", { figure: "a", joint: "rHand" }]]);
  const c = touchIntents(plan, { "a.custom1.k1": 1, "a.custom1.k2": 1.3, "a.custom1.k3": 1.6, "a.custom1.k4": 2, "b.custom1.k1": 1, "b.custom1.k2": 1.3, "b.custom1.k3": 1.6, "b.custom1.k4": 2 });
  assert.equal(c.length, 2); assert.ok(c[0].from === 1 && Math.abs(c[0].to - 1.75) < 1e-9, `k1..k3+hold (${c[0].from}..${c[0].to})`);
});

test("THE KEY SAYS `touch`: touch: 'b.neck' and touch: 'stove' are read as declared; a foot kick lands with the foot", () => {
  const plan = { height: H, characters: [{ id: "a", x: 900, actions: [{ move: "custom", params: { name: "greets", keys: [{ pose: { rShoulder: 40 }, hold: 0.3, touch: "b.neck" }] } }] }, { id: "b", x: 760, actions: [] }], effects: [stove] };
  assert.deepEqual(readTouches(plan)[0].target, { figure: "b", joint: "neck" });
  const kick = { height: H, characters: [{ id: "a", x: 900, actions: [{ move: "custom", params: { name: "kicks the stove", keys: [{ pose: { rHip: 60, rKnee: 10 }, hold: 0.2 }] } }] }], effects: [stove] };
  assert.deepEqual([readTouches(kick)[0].joint, readTouches(kick)[0].target], ["rFoot", { prop: 0, point: "near" }]);
});

test("END TO END (the whole family: hand on a thing): tidy + repair + build puts the hand ON the stove's drawn top within 3 px at the first touch", () => {
  const raw = { id: "t", title: "t", height: H, groundY: 900, pace: "natural", characters: [{ id: "w", name: "W", x: 520, facing: "right", look: { color: "#222222" }, actions: [{ move: "walk", params: { distance: 300 } }, { ...put, params: { ...put.params, name: "puts her hand down on the stove" } }, { move: "stand", params: { seconds: 1.5 } }] }], effects: [stove] };
  const plan = autoRepair(tidyPlan(raw as never), "puts her hand on the hot stove", null).plan;
  const scene = makeEffectsTestScene(plan as never, 1920), built = buildScene(scene, 24);
  const rep = (built.contacts ?? [])[0] as { reachable: boolean; worstMissPx: number; firstTouch?: number } | undefined;
  assert.ok(rep, "a contact was declared from the words");
  assert.ok(rep!.reachable, "the body went to the stove (within reach)");
  const i = Math.round((rep!.firstTouch ?? scene.contacts![0].from) * 24), hand = built.frames[i].find((c) => c.id === "w")!.skeleton.rHand;
  const th = worldAt(scene, built, i).thing(0)!, q = th.nearestSurfacePoint(hand);
  assert.ok(Math.hypot(q.x - hand.x, q.y - hand.y) <= 3, `hand on the drawn stove at the first touch (gap ${Math.hypot(q.x - hand.x, q.y - hand.y).toFixed(1)} px)`);
});
