import assert from "node:assert/strict";
import { test } from "node:test";
import { autoRepair, bodyGoesToThing, lawProblems, strikesReachThings } from "./claudeAnimator.ts";

// TOUCH MEANS TOUCH + A STRIKE HAS A TARGET (Arthur, Oct 14: "the stick figure holding the match has to actually hit it";
// "they're just kicking thin air… too much space"). The body goes to the thing — never the thing to the hand.
const ground = { background: { pieces: [{ kind: "sky" }, { kind: "ground" }] } };
const kneelKeys = [{ pose: { lean: 30, lHip: 95, lKnee: 120, rHip: 50, rKnee: 125, rShoulder: 50 }, feet: "both", hold: 0.3 }, { pose: { lean: 40, lHip: 100, lKnee: 125, rHip: 55, rKnee: 130, rShoulder: 55 }, feet: "both", hold: 0.9 }, { pose: { lean: 20 }, feet: "both", hold: 1.5 }];
const lighting = (x: number, fireX: number) => ({ id: "t", title: "light", height: 300, groundY: 900, ...ground,
  characters: [{ id: "a", name: "Camper", x, facing: "right", look: { color: "#fff" }, actions: [{ move: "walk", params: { distance: 160 } }, { move: "custom", params: { name: "kneel and light", keys: kneelKeys } }] }],
  effects: [{ kind: "prop", start: -1.5, end: 5, anchor: { character: "a", joint: "rHand" }, params: { name: "match", size: 0.08, parts: [{ shape: "line", x: 0, y: 0.5, w: 0, h: -1 }] } },
    { kind: "fire", start: 2, end: 8, anchor: { x: fireX, y: 875 }, cause: { character: "a", joint: "rHand" }, params: { size: 0.3 } }] });

test("the camper is placed at the fire and the match touches it; the fire stays where it was", () => {
  for (const [x, fx] of [[760, 1110], [500, 1150], [900, 1010]]) {
    const plan = lighting(x, fx), out = bodyGoesToThing(plan) as ReturnType<typeof lighting>;
    assert.equal((out.effects[1].anchor as { x: number }).x, fx, "the fire never moves");
    assert.ok(!lawProblems(out, "lights the campfire with a match").some((p) => /never reaches the thing/.test(p)), `touches at ${x}→${fx}`);
  }
});

test("REACHING LOW = THE KNEEL: a hand that must touch something on the floor kneels (one knee down) instead of a held deep squat", () => {
  const out = bodyGoesToThing(lighting(760, 1110)) as ReturnType<typeof lighting>;
  const keys = (out.characters[0].actions[1].params as { keys: { kneel?: unknown; rHand?: unknown }[] }).keys;
  assert.ok(keys.some((k) => k.kneel), "the key at the touch kneels");
  assert.ok(!lawProblems(out, "lights the campfire with a match").some((p) => /never reaches the thing/.test(p)), "and still touches");
});

const bag = (x: number) => ({ kind: "prop", start: -1.5, end: 60, anchor: { x, y: 685 }, params: { name: "kick bag", size: 0.6, hangs: true, parts: [{ shape: "round", x: 0, y: 0, w: 0.4, h: 0.9 }] } });
test("a kick at a bag that is too far is made from kicking distance (the figure moves, the bag stays)", () => {
  const plan = { id: "k", title: "kick bag", height: 260, groundY: 880, ...ground, characters: [{ id: "a", name: "A", x: 300, facing: "right", look: { color: "#000" }, actions: [{ move: "kick", params: { height: "high" } }] }], effects: [bag(700)] };
  const out = strikesReachThings(plan) as typeof plan;
  assert.ok(out.characters[0].x > 300);
  assert.equal(out.effects[0].anchor.x, 700);
  assert.ok(!lawProblems(out, "kicks the bag").some((p) => /thin air/.test(p)));
});

test("a strike at someone holding a pad out is made at the pad, at its height", () => {
  const plan = { id: "p", title: "pads", height: 300, groundY: 900, ...ground,
    characters: [{ id: "a", name: "Student", x: 780, facing: "right", look: { color: "#00f" }, actions: [{ move: "guard", params: { seconds: 0.5 } }, { move: "kick", params: { height: "mid", target: "b" } }] },
      { id: "b", name: "Coach", x: 1030, facing: "left", look: { color: "#000" }, actions: [{ move: "getHit", params: { from: "a", result: "block" } }] }],
    effects: [{ kind: "prop", start: -1.5, end: 60, anchor: { character: "b", joint: "lHand" }, params: { name: "pad", size: 0.22, parts: [{ shape: "round", x: 0, y: 0, w: 0.4, h: 0.7 }] } }] };
  const out = autoRepair(plan, "kicks into the pads the coach holds up", null).plan as typeof plan;
  const kick = out.characters[0].actions[1].params as { holdOut?: number };
  assert.ok((kick.holdOut ?? 0) > 0.05);
  const probs = lawProblems(out, "kicks into the pads the coach holds up");
  assert.ok(!probs.some((p) => /thin air|fist or foot is/.test(p)), probs.join(" / "));
});

// CAREFUL MOVES DON'T WIND UP (laws carefulWindUp, Arthur Oct 14): a fast lean-back right before kneeling is flagged; the engine's
// own kneel (no wind-up) is not.
test("the law flags a backward jerk right before a careful kneel, and passes a straight kneel", () => {
  const plan = (keys: unknown[]) => ({ id: "w", title: "kneel", height: 300, groundY: 900, ...ground,
    characters: [{ id: "a", name: "Girl", x: 700, facing: "right", look: { color: "#000" }, actions: [{ move: "custom", params: { name: "kneel down", keys } }] }] });
  const kneel = { pose: { lean: 40, lHip: 100, lKnee: 115, rHip: 40, rKnee: 120 }, kneel: true, hold: 1 };
  const jerk = lawProblems(plan([{ pose: { lean: -25, head: -20 }, at: 0.2 }, { ...kneel, at: 1.0 }]), "she kneels down");
  assert.ok(jerk.some((p) => /jerks back/.test(p)), jerk.join(" / "));
  const calm = lawProblems(plan([kneel]), "she kneels down");
  assert.ok(!calm.some((p) => /jerks back/.test(p)), calm.join(" / "));
});
