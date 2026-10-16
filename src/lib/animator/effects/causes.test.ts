// EVERYTHING HAS A CAUSE (effects/causes.ts): lit when the match touches, bursts when the fireball arrives, smoke as a flame
// goes out, a hole that grows with each dig.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene, type SceneFrames } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { BACKGROUND_PIECES, type EffectTrack } from "./index.ts";
import { digTimes } from "./causes.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
const base = (effects: unknown[], actions: unknown[] = [{ move: "walk", params: { distance: 500 } }, { move: "stand", params: { seconds: 2 } }]) => ({ id: "t", title: "t", height: 300, groundY: 900, pace: "natural", characters: [{ id: "a", name: "A", x: 500, facing: "right", look: { color: "#222222" }, actions }], effects }) as unknown as Plan;
const run = (plan: Plan) => { const scene = makeEffectsTestScene(plan, 1920); const built = buildScene(scene, 24); return { effects: (scene as { effects?: EffectTrack[] }).effects ?? [], built }; };

test("LIT BY SOMETHING: a fire with a cause starts when the hand holding the match reaches it, and grows in", () => {
  const plan = base([{ kind: "prop", start: 0, end: 10, anchor: { character: "a", joint: "rHand" }, params: { name: "match", size: 0.1, parts: [{ shape: "line", x: 0, y: 0, w: 0, h: -0.5, color: "#a0522d" }] } }, { kind: "fire", start: 0, end: 10, anchor: { x: 1060, y: 770 }, cause: { character: "a", joint: "rHand" }, params: { size: 0.2 } }]);
  const { effects, built } = run(plan);
  const fire = effects.find((e) => e.kind === "fire")!;
  assert.ok(fire.start > 0.8, `not burning before the match arrives (start ${fire.start})`);
  const i = Math.round(fire.start * built.fps), hand = built.frames[i][0].skeleton.rHand;
  assert.ok(Math.hypot(hand.x - (fire.anchor as { x: number }).x, hand.y - (fire.anchor as { y: number }).y) <= 0.3 * 300 + 30, "the match touches it when it starts");
  assert.equal(fire.params?.grow, 1.2, "a fire just lit grows slowly");
});

test("A BURST WHERE A FIREBALL LANDS starts when the fireball ARRIVES, never before", () => {
  const plan = base([{ kind: "fireball", start: 0.5, end: 1.6, anchor: { character: "a", joint: "rHand" }, target: { x: 1500, y: 780 } }, { kind: "explosion", start: 0.6, end: 2.2, anchor: { x: 1500, y: 800 } }], [{ move: "stand", params: { seconds: 3 } }]);
  const ex = run(plan).effects.find((e) => e.kind === "explosion")!;
  assert.ok(Math.abs(ex.start - 1.6) < 0.05, `explosion at arrival (${ex.start})`);
  assert.ok(Math.abs(ex.end - ex.start - 1.6) < 0.05, "keeps its length");
});

test("A FLAME THAT GOES OUT SMOKES: smoke rises from the flame's top as it shrinks, sized to the flame", () => {
  const plan = base([{ kind: "fire", start: -1.5, end: 1.5, anchor: { x: 900, y: 700 }, params: { size: 0.06 } }], [{ move: "stand", params: { seconds: 4 } }]);
  const smoke = run(plan).effects.find((e) => e.kind === "smoke")!;
  assert.ok(smoke, "smoke added");
  assert.ok(smoke.start < 1.5 && smoke.start > 0.4, `starts while the flame shrinks (${smoke.start})`);
  assert.ok((smoke.anchor as { y: number }).y < 700, "from the top of the flame");
  assert.ok(Number(smoke.params?.size) < 0.05, "a small flame makes a thin wisp");
  // a fire that burns to the end makes no smoke of its own
  assert.ok(!run(base([{ kind: "fire", start: -1.5, end: 30, anchor: { x: 900, y: 700 } }])).effects.some((e) => e.kind === "smoke"));
});

test("A HOLE GROWS WITH WORK: the dig moments are the hand's low points near the pit; the pit and its pile grow at each", () => {
  // a fake digger: the hand goes down and up three times next to the pit
  const fps = 24, frames = Array.from({ length: 4 * fps }, (_, i) => { const t = i / fps, y = 700 + 80 * Math.max(0, Math.sin(Math.PI * 2 * (t - 0.25))); const p = { x: 1000, y }; return [{ id: "a", skeleton: { rHand: p, lHand: p, hip: { x: 900, y: 750 } } }]; });
  const steps = digTimes({ fps, frames } as unknown as SceneFrames, "a", "rHand", 1050, 200, 300);
  assert.equal(steps.length, 4, `four digs (${steps})`);
  const pit = BACKGROUND_PIECES.pit, stage = { width: 1920, groundY: 900, height: 300 };
  const size = (t: number) => { const s = pit.draw({ kind: "pit", params: { x: 1050, w: 200, h: 150, steps, pileSide: 1 } }, t, stage); const hole = s[0] as { points: number[] }; return { deep: Math.max(...hole.points.filter((_, i) => i % 2 === 1)) - 900, pile: s.length }; };
  const before = size(0), mid = size(steps[1] + 0.3), after = size(steps[3] + 0.3);
  assert.ok(before.deep < 0.3 * 150, `a shallow dent before digging (${before.deep})`);
  assert.ok(mid.deep > before.deep + 20 && after.deep > mid.deep + 20, `deeper at each dig (${before.deep} → ${mid.deep} → ${after.deep})`);
  assert.ok(Math.abs(size(steps[1] + 0.3).deep - size(steps[2] - 0.05).deep) < 1, "it only grows AT a dig, not by itself");
  // a plain pit is unchanged
  assert.ok(pit.draw({ kind: "pit", params: { x: 1050, w: 200, h: 150 } }, 0, stage).length > 0);
});

test("THE BODY GOES TO THE THING (Arthur, Oct 14): a spot the hand never reaches stays put — the fire and the logs never slide to the hand (claudeAnimator bodyGoesToThing moves the figure; claude/touch.test.ts)", () => {
  const plan = base([{ kind: "prop", start: -1.5, end: 60, anchor: { x: 1200, y: 900 }, params: { name: "logs", size: 0.1, parts: [{ shape: "rect", x: 0, y: 0, w: 1, h: 0.3, color: "#6b3f1f" }] } }, { kind: "fire", start: 0, end: 10, anchor: { x: 1200, y: 885 }, cause: { character: "a", joint: "rHand" } }]);
  const { effects, built } = run(plan);
  const fire = effects.find((e) => e.kind === "fire")!, logs = effects.find((e) => e.kind === "prop")!;
  const hand = built.frames[Math.round(fire.start * built.fps)][0].skeleton.rHand;
  const fx = (fire.anchor as { x: number }).x, sk = built.frames[Math.round(fire.start * built.fps)][0].skeleton;
  void hand; void sk;
  assert.equal(fx, 1200, "the fire stays where the plan put it");
  assert.equal((logs.anchor as { x: number }).x, 1200, "the logs stay too");
});

test("PUT OUT BY A BLOW: a flame goes out when the head that blows comes closest — never before", () => {
  // the figure walks up to a flame at head height; the plan ended the flame too early (1 s)
  const plan = base([{ kind: "fire", start: -1.5, end: 1.0, anchor: { x: 1060, y: 640 }, params: { size: 0.06 } }]);
  const { effects, built } = run(plan);
  const fire = effects.find((e) => e.kind === "fire")!;
  assert.ok(fire.end > 1.4, `goes out later, when the head is there (${fire.end})`);
  const head = built.frames[Math.round((fire.end - 0.8) * built.fps)][0].skeleton.head;
  assert.ok(Math.abs(head.x - 1060) < 0.4 * 300, `the head is at the flame as it shrinks (${head.x})`);
  assert.ok(effects.find((e) => e.kind === "smoke")!.start >= fire.end - 1.0, "the smoke starts as it shrinks");
});
