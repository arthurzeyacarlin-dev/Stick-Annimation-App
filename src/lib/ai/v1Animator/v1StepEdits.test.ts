// (Nov 15, Arthur's own test: "I want TV Man Titan to do a backflip" deleted 593 of his 623 pictures) AN EDIT NAMES ONLY THE CHANGE:
// the new step list is the SAVED steps with only the named change put in. TEST FIXTURES ONLY ($0, no engine run).
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { applyStepEdits, editTruthLines, keepTiming, keepUnchanged, stepsEdit, withAskedTiming } from "./v1AnimatorCore.ts";
import { readLunaBook } from "./v1LunaBook.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";
import type { V1KimodoStep, V1Plan } from "./v1AnimatorContract.ts";

const { lx } = makeTestRoot();
const book = readLunaBook(join(lx, "v1k", "luna-book.json"));
// a 13-step fight like his (words and seconds of every step differ)
const saved: V1KimodoStep[] = Array.from({ length: 13 }, (_, i) => ({ text: `The green stick figure does move number ${i + 1}.`, seconds: 1 + (i % 4) * 0.5, travels: false, airborne: false, changed: false }));
const base = { contract: "v1-blocks", colour: "#16a34a", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: saved.map((s) => s.text).join(" "), seed_bump: 0, steps: saved }] } as V1Plan;
const nw = (text: string, more: Partial<V1KimodoStep> = {}): V1KimodoStep => ({ text, seconds: 1.5, travels: false, airborne: false, changed: true, ...more });
const list = (named: V1KimodoStep[], remove: number[] = []) => { const out = applyStepEdits(saved, named, remove); assert.ok(Array.isArray(out)); return out as V1KimodoStep[]; };
const key = (s: V1KimodoStep) => `${s.text}|${s.seconds}`;
// the list as it reaches the engine: through the app's own edit functions, unchanged
const engineSteps = (steps: V1KimodoStep[]) => keepTiming(withAskedTiming(stepsEdit(keepUnchanged(steps, saved), base, base, [], book), base, base), base).blocks.flatMap((b) => b.steps ?? []);
const untouched = (steps: V1KimodoStep[]) => saved.filter((s) => steps.some((g) => key(g) === key(s))).length;

test("his backflip: a step added at the end keeps all 13 saved steps, in order, word for word and second for second", () => {
  const out = list([nw("TV Man Titan does one backflip.", { after: 13 })]);
  assert.equal(out.length, 14);
  assert.deepEqual(out.slice(0, 13).map(key), saved.map(key));
  assert.equal(out[13].text, "TV Man Titan does one backflip.");
  assert.ok(!("after" in out[13]) && !("step" in out[13]), "the place is not carried into the plan");
  assert.deepEqual(engineSteps(out).slice(0, 13).map(key), saved.map(key), "and so they reach the engine");
});
test("what happened to him can no longer be said: the AI's list holding ONLY the new step is an add-on, never the whole animation", () => {
  const out = list([nw("TV Man Titan does one backflip.", { after: 13 })]);
  assert.equal(untouched(engineSteps(out)), 13);
  assert.equal(untouched(engineSteps([nw("TV Man Titan does one backflip.")])), 0, "(the old way, kept here as the record: his copy WAS the animation)");
});
test("a change in the middle touches that step only; a new step at the very start and one in the middle touch none", () => {
  const mid = list([nw("The blue stick figure does a spinning kick.", { step: 5 })]);
  assert.equal(mid.length, 13); assert.equal(mid[4].text, "The blue stick figure does a spinning kick."); assert.equal(untouched(engineSteps(mid)), 12);
  const start = list([nw("They bow to each other.")]);                       // step 0, after 0 = before the first step
  assert.equal(start[0].text, "They bow to each other."); assert.deepEqual(start.slice(1).map(key), saved.map(key));
  const between = list([nw("A cartwheel.", { after: 3 }), nw("A second cartwheel.", { after: 3 })]);
  assert.deepEqual(between.slice(3, 5).map((s) => s.text), ["A cartwheel.", "A second cartwheel."]); assert.equal(untouched(engineSteps(between)), 13);
});
test("a step is taken out only when it is named; several changes at once touch only what they name", () => {
  const out = list([], [7]);
  assert.equal(out.length, 12); assert.ok(!out.some((s) => s.text === saved[6].text)); assert.equal(untouched(engineSteps(out)), 12);
  const both = list([nw("A cartwheel.", { after: 3 }), nw("TV Man Titan stomps.", { step: 11 })], [2]);
  assert.equal(both.length, 13); assert.equal(untouched(engineSteps(both)), 11);
});
test("(Nov 19 eve) a colour change of a step is the SAVED step plus the colour: the AI's re-typed words and seconds are not used", () => {
  const out = list([nw("The orange stick figure does move number 4.", { step: 4, seconds: 9, look: "colour #16a34a to #f97316" })]);
  assert.equal(out[3].text, saved[3].text); assert.equal(out[3].seconds, saved[3].seconds); assert.equal(out[3].look, "colour #16a34a to #f97316");
});
test("A LOOK IS NEVER A NEW TAKE: every step given a look with its words kept = the same seed (live, Nov 15: the next seed told the engine 'redo it all' and bought his whole fight again)", () => {
  const looked = list(saved.map((s, i) => nw(s.text, { step: i + 1, look: "colour #1a1aaa to #dc2626" })));
  const plan = stepsEdit(keepUnchanged(looked, saved), base, base, [], book);
  assert.equal(plan.blocks.length, 1); assert.equal(plan.blocks[0].seed_bump, base.blocks[0].seed_bump, "the seed stays: the engine redraws the pictures, it does not make them again");
  assert.deepEqual(plan.blocks[0].steps?.map((s) => [s.text, s.seconds]), saved.map((s) => [s.text, s.seconds]));
  // a change of a step's seconds with its words kept is still a new take of that part, as before
  const retimed = stepsEdit(keepUnchanged(list([nw(saved[4].text, { step: 5, seconds: 9 })]), saved), base, base, [], book);
  assert.ok(retimed.blocks.some((b) => b.edit_from_beat !== undefined || b.seed_bump > base.blocks[0].seed_bump));
});
test("a number that is no saved step, or nothing left, cannot be applied (it is said, nothing is guessed)", () => {
  assert.deepEqual(applyStepEdits(saved, [nw("x", { step: 14 })]), { error: "step_number" });
  assert.deepEqual(applyStepEdits(saved, [nw("x", { after: 99 })]), { error: "step_number" });
  assert.deepEqual(applyStepEdits(saved, [], [0]), { error: "step_number" });
  assert.deepEqual(applyStepEdits(saved.slice(0, 1), [], [1]), { error: "nothing_left" });
});
test("the card's truth is counted by the app", () => {
  assert.deepEqual(editTruthLines(saved, [nw("TV Man Titan does one backflip.", { after: 13 })]), ["All 13 steps you have stay exactly as they are."]);
  assert.deepEqual(editTruthLines(saved, [nw("A spinning kick.", { step: 5 })], [7]), [`Step 5 changes. It was: ${saved[4].text}`, `Step 7 is taken out: ${saved[6].text}`, "The other 11 of your 13 steps stay exactly as they are."]);
  assert.deepEqual(editTruthLines(saved, [nw("x", { step: 4, look: "colour #16a34a to #f97316" })]), [], "a look-only edit has its own line");
});
