import assert from "node:assert/strict";
import test from "node:test";
import { fillInFight } from "./followUp.ts";
import { LIBRARY } from "./library.ts";
import { planToScene, type Action, type ScenePlan } from "./plan.ts";

// FILL IN A VAGUE FIGHT (round 11): "he fell down, now I have an advantage... then red is supposed to block,
// or move out of the way, or get hit again, or strike back".
const fight = (fillIn: boolean): ScenePlan => ({
  id: "vague", title: "A fight", height: 300, groundY: 900, ...(fillIn ? { fillIn } : {}),
  characters: [
    { id: "a", name: "Blue", x: 760, facing: "right", style: "angry", energy: 0.8, actions: [{ move: "walk", params: { to: "b" } }, { move: "kick", params: { target: "b", height: "high" } }] },
    { id: "b", name: "Red", x: 1160, facing: "left", style: "natural", energy: 0.6, actions: [{ move: "getHit", params: { from: "a", result: "knockdown" } }] },
  ],
});
const strikes = (actions: Action[]) => actions.filter((x) => x.move === "punch" || x.move === "kick" || x.move === "stompDown").length;

test("a vague fight with a knock-down gets a follow-up: the attacker presses, the other answers", () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const before = fight(true);
    const after = fillInFight(before, seed * 7919);
    const [a, b] = after.characters;
    // The attacker comes back at the one it put down (a stomp while it lies there, or another strike once it's up), or the other strikes back.
    assert.ok(a.actions.length > before.characters[0].actions.length || b.actions.length > before.characters[1].actions.length, `seed ${seed}: nothing added`);
    assert.ok(strikes(a.actions) + strikes(b.actions) >= 2, `seed ${seed}: no second exchange`);
    assert.ok(after.title.length > before.title.length);
    // The engine plans it: every added hit is answered on time, and a stomp lands while the other is down.
    const scene = planToScene(after, LIBRARY);
    if (scene.marks["a.groundHit1"] !== undefined) {
      assert.ok(scene.marks["a.groundHit1"] > scene.marks["b.getHit1.down"] - 1e-6 && scene.marks["a.groundHit1"] < scene.marks["b.getHit1.up"], `seed ${seed}: the stomp lands while he lies there`);
    }
    for (const [name, t] of Object.entries(scene.marks)) {
      const m = /^(\w)\.getHit(\d+)\.hit$/.exec(name);
      if (m) assert.ok(Math.abs(scene.marks[`${m[1] === "a" ? "b" : "a"}.strike${m[2]}.hit`] - t) < 1e-3, `seed ${seed}: ${name} on its strike`);
    }
  }
});

test("a detailed fight (no fillIn) is left exactly as the user wrote it", () => {
  const plan = fight(false);
  assert.equal(fillInFight(plan, 7919), plan);
});
