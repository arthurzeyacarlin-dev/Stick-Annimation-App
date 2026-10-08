import assert from "node:assert/strict";
import test from "node:test";
import { BENCH_PROMPTS } from "./benchPrompts.ts";
import { missingThings } from "./namedThings.ts";
import type { DirectedPlan } from "./repair.ts";

// EVERY THING THE STORY NAMES IS IN THE SCENE (Arthur, 2026-10-08: "it clearly says ... at a punching bag").
const plan = (extra: Partial<DirectedPlan> = {}) => ({ id: "p", title: "t", height: 300, groundY: 900, characters: [{ id: "fighter", name: "Fighter", x: 700, facing: "right", actions: [] }], ...extra }) as unknown as DirectedPlan;

test("a named thing the plan never shows is found; one the plan shows (object, prop, piece) is not", () => {
  const ask = "A stick figure throws a powerful punch at a punching bag.";
  assert.deepEqual(missingThings(ask, plan()), ["punching bag"]);
  assert.deepEqual(missingThings(ask, plan({ effects: [{ kind: "prop", start: 0, end: 4, anchor: { x: 950, y: 900 }, params: { symbol: "punchingBag" } }] } as never)), []);
  assert.deepEqual(missingThings(ask, plan({ objects: [{ id: "bag", look: { kind: "box" } }] } as never)), []);
  assert.deepEqual(missingThings("He walks while holding a red umbrella.", plan()), ["umbrella"]);
});

test("figures, body parts and colours are never 'missing things'; every bench card that names its things passes when they're there", () => {
  assert.deepEqual(missingThings("A stick figure strikes a superhero pose with his fists on his hips.", plan()), []);
  assert.deepEqual(missingThings("The blue stick figure punches three times: the red one blocks the first two.", plan()), []);
  // (no bench request is flagged against a plan that contains everything it names)
  const everything = plan({ objects: [{ id: "basketball" }, { id: "energyBall" }, { id: "ball" }, { id: "umbrella" }, { id: "bag" }], effects: [{ kind: "transform", params: { into: "car" } }, { kind: "prop", params: { symbol: "moon" } }], background: { pieces: [{ kind: "spikes" }, { kind: "thunderstorm" }] } } as never);
  for (const p of BENCH_PROMPTS) assert.deepEqual(missingThings(p.text, everything), [], p.text);
});
