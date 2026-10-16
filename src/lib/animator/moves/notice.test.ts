import assert from "node:assert/strict";
import { test } from "node:test";
import { getHit } from "./hit.ts";
import { startStance, TEST_HEIGHT } from "./testkit.ts";
import { othersNotice } from "../claude/claudeAnimator.ts";
import { LAW_KINDS } from "../laws/kinds.ts";

// FIGURES NOTICE AND REACT (Arthur, Oct 14: "if he turns and sees it's a grenade, he has to start running").
const settings = { height: TEST_HEIGHT, style: "natural" as const, speed: "normal" as const, energy: 0.6 };

test("a hit from behind throws the body FORWARD, a hit from the front throws it back", () => {
  for (const power of [0.4, 1.0]) {
    const behind = getHit(startStance("right"), { power, fromBehind: true }, settings);
    const front = getHit(startStance("right"), { power }, settings);
    const leanAt = (out: typeof behind) => Math.max(...out.keys.map((k) => k.pose.lean)), backAt = (out: typeof behind) => Math.min(...out.keys.map((k) => k.pose.lean));
    assert.ok(leanAt(behind) > 8, `from behind the chest lurches forward (power ${power})`);
    assert.ok(backAt(front) < -6, `from the front the chest snaps back (power ${power})`);
    // (it never moves back INTO the hit: the hips stay where they were or go forward)
    assert.ok(Math.min(...behind.keys.map((k) => k.x)) >= 960 - 2, "hips never move back into the hit");
  }
});

const base = (actions: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  id: "n", height: 250, groundY: 900, ...extra,
  characters: [
    { id: "a", name: "Red", x: 560, facing: "right", look: { color: "#e02424" }, actions: [{ move: "wave", params: { times: 1 } }] },
    { id: "b", name: "Blue", x: 1000, facing: "right", look: { color: "#2563eb" }, actions: [{ move: "wait", params: { seconds: 0.4 } }, { move: "getHit", params: { power: 0.8 }, sync: { mark: "hit", at: "a.wave1.up", offset: 0.3 } }] },
    { id: "c", name: "Green", x: 1400, facing: "right", look: { color: "#16a34a" }, actions },
  ],
});

test("a bystander facing away from a hit turns to look at it", () => {
  const out = othersNotice(base([{ move: "wave", params: { times: 4 } }]) as Record<string, unknown>);
  const green = (out.characters as { id: string; actions: { move: string; params?: Record<string, unknown> }[] }[]).find((c) => c.id === "c")!;
  const turn = green.actions.find((a) => a.move === "turn");
  assert.ok(turn, "Green turns");
  assert.equal(turn!.params?.to, "left");
  assert.ok(green.actions.filter((a) => a.move === "wave").every((a) => Number(a.params?.times) < 4), "the wave is cut short");
});

test("a figure near an explosion turns away and runs", () => {
  const plan = { id: "x", height: 250, groundY: 900, characters: [
    { id: "s", name: "Sam", x: 900, facing: "left", look: { color: "#4d7c0f" }, actions: [{ move: "wave", params: { times: 6 } }] },
    { id: "t", name: "Tom", x: 300, facing: "right", look: { color: "#555" }, actions: [{ move: "wait", params: { seconds: 2 } }] },
  ], effects: [{ kind: "explosion", start: 1.5, end: 2.5, anchor: { x: 700, y: 900 } }] };
  const out = othersNotice(plan as Record<string, unknown>);
  const sam = (out.characters as { id: string; actions: { move: string; params?: Record<string, unknown> }[] }[]).find((c) => c.id === "s")!;
  assert.ok(sam.actions.some((a) => a.move === "run"), "Sam runs");
  assert.equal(sam.actions.find((a) => a.move === "turn")?.params?.to, "right", "away from the blast");
});

test("the new laws have kinds", () => {
  assert.equal(LAW_KINDS.hitFelt !== undefined, true);
  assert.equal(LAW_KINDS.facesWhoItGreets, "taste");
});
