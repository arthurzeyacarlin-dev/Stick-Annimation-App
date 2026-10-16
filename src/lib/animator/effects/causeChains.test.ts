// CAUSE CHAINS (Arthur, Oct 14): prepare → act → CONTACT → small effect → big effect. Lighting is a strike with a spark first;
// a thing held out to be struck is held upright in both hands by a braced holder; the tool's TIP (not the hand) touches.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScene } from "../engine.ts";
import { makeEffectsTestScene } from "../moves/tests2c.ts";
import { heldTip, type EffectTrack } from "./index.ts";
import { CHAIN_GAP } from "./causes.ts";
import { heldToBeStruck } from "../claude/claudeAnimator.ts";

type Plan = Parameters<typeof makeEffectsTestScene>[0];
const MATCH = { kind: "prop", start: -1, end: 20, anchor: { character: "a", joint: "rHand" }, params: { name: "match", size: 0.1, parts: [{ shape: "line", x: 0, y: 0.5, w: 0, h: -1, color: "#c08a4a" }, { shape: "circle", x: 0, y: -0.5, w: 0.3, h: 0.3, color: "#b91c1c" }] } };
const plan = (effects: unknown[]) => ({ id: "t", title: "t", height: 300, groundY: 900, pace: "natural", characters: [{ id: "a", name: "A", x: 500, facing: "right", look: { color: "#222222" }, actions: [{ move: "walk", params: { distance: 500 } }, { move: "stand", params: { seconds: 2 } }] }], effects }) as unknown as Plan;

test("LIGHTING IS A STRIKE: a small spark at the contact, then the flame catches just after it", () => {
  const sc = makeEffectsTestScene(plan([MATCH, { kind: "fire", start: 0, end: 20, anchor: { x: 1060, y: 770 }, cause: { character: "a", joint: "rHand" }, params: { size: 0.2 } }]), 1920);
  buildScene(sc, 24);
  const fx = (sc as { effects?: EffectTrack[] }).effects ?? [];
  const spark = fx.find((e) => e.kind === "sparks"), fire = fx.find((e) => e.kind === "fire")!;
  assert.ok(spark, "a spark is added at the contact");
  assert.deepEqual(spark!.anchor, fire.anchor, "the spark is at the spot the match touches");
  assert.ok(Math.abs(fire.start - spark!.start - CHAIN_GAP) < 1e-6 && CHAIN_GAP <= 0.15, `the flame catches right after the spark (${spark!.start} → ${fire.start})`);
  assert.ok(Number(spark!.params?.size) <= 0.6 && spark!.end - spark!.start <= 0.4, "a small, short spark");
});

test("THE TOOL'S TIP TOUCHES: heldTip is the far end of the held match, not the hand", () => {
  const sc = makeEffectsTestScene(plan([MATCH]), 1920), built = buildScene(sc, 24);
  const chars = built.frames[0], hand = chars[0].skeleton.rHand;
  const tip = heldTip([MATCH as unknown as EffectTrack], "a", "rHand", chars, 300, 900, 1920, 0)!;
  const d = Math.hypot(tip.x - hand.x, tip.y - hand.y);
  assert.ok(d > 0.04 * 300 && d < 0.12 * 300, `the tip is about a match length from the hand (${d.toFixed(1)} px)`);
  assert.deepEqual(heldTip([], "a", "rHand", chars, 300, 900), hand, "no tool → the hand itself");
});

test("HELD TO BE STRUCK: a board held out for a punch is held UPRIGHT in BOTH hands by a braced holder", () => {
  const p = { height: 260, groundY: 880, characters: [
    { id: "t", x: 1100, facing: "left", actions: [{ move: "custom", params: { keys: [{ pose: { lShoulder: 80, rShoulder: 75 }, hold: 4 }, { pose: { lHip: 5 } }] } }] },
    { id: "s", x: 760, facing: "right", actions: [{ move: "punch", params: { target: "t" } }] }],
    effects: [{ kind: "prop", start: 0, end: 5, anchor: { character: "t", joint: "lHand" }, params: { name: "wooden board", size: 0.35, parts: [{ shape: "rect", x: 0, y: 0, w: 1, h: 0.12 }] } }] };
  const out = heldToBeStruck(p);
  const board = (out.effects as { anchor: { with?: string }; params: { upright?: boolean; parts: { w: number; h: number }[] } }[])[0];
  assert.equal(board.anchor.with, "rHand", "between both hands");
  assert.ok(board.params.upright && board.params.parts[0].h > board.params.parts[0].w, "turned upright, facing the striker");
  const keys = ((out.characters as { actions: { params: { keys: { pose: Record<string, number> }[] } }[] }[])[0].actions[0].params.keys);
  assert.ok(keys[0].pose.lHip > 0 && keys[0].pose.rHip < 0, "a braced stance, feet apart");
  assert.equal(keys[1].pose.lHip, 5, "a key that sets its own legs keeps them");
  // nobody strikes → untouched
  const calm = { ...p, characters: [p.characters[0]] };
  assert.equal(heldToBeStruck(calm), calm);
});
