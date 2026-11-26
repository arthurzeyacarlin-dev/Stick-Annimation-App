// (dad + Arthur, Nov 26) where a hand fix goes, from the plan's own timings. Run: node --test src/lib/ai/v1Animator/v1HandFix.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { changedStepRange, handFixPlace, handFixWords } from "./v1HandFix.ts";

const steps = [{ text: "a", seconds: 3 }, { text: "b", seconds: 2.5 }, { text: "c", seconds: 5 }, { text: "d", seconds: 2.5 }, { text: "e", seconds: 2 }];

test("the place: seconds from the step timings, frames at the timeline's pictures per second (1 = the first frame)", () => {
  assert.deepEqual(handFixPlace(steps, 2, 2, 24), { fromS: 5.5, toS: 10.5, fromFrame: 133, toFrame: 252, firstStep: 3, lastStep: 3 });
  assert.deepEqual(handFixPlace(steps, 1, 3, 12), { fromS: 3, toS: 13, fromFrame: 37, toFrame: 156, firstStep: 2, lastStep: 4 });
  assert.deepEqual(handFixPlace(steps, 0, 0, 0), { fromS: 0, toS: 3, fromFrame: null, toFrame: null, firstStep: 1, lastStep: 1 }, "fps unknown: times only");
});

test("which steps an edit changes (only adding at the end = none)", () => {
  assert.deepEqual(changedStepRange(steps, [steps[0], { text: "B!", seconds: 2.5 }, steps[2], steps[3], steps[4]]), [1, 1]);
  assert.deepEqual(changedStepRange(steps, [...steps, { text: "f", seconds: 2 }]), null);
  assert.deepEqual(changedStepRange(steps, [steps[0], steps[1], { text: "x", seconds: 1 }, steps[2], steps[3], steps[4]]), [2, 4], "a step put in between moves the ones after it");
});

test("the words: exactly where, how, and what the AI makes again", () => {
  const fix = { ...handFixPlace(steps, 2, 2, 24), recommend: "remake" as const, remake: { whole: true, firstStep: 3, lastStep: 3, seconds: 15 } };
  const words = handFixWords(fix);
  assert.equal(words.where, "Step 3: about 5.5–10.5 s, frames about 133–252.");
  assert.match(words.how[0], /opens frame 133 with the Eraser and Onion skin on/);
  assert.match(words.how[1], /Eraser.*Brush/);
  assert.equal(words.remake, "Remake the whole animation with this change: this makes the whole 15-second animation again.");
  assert.equal(handFixWords({ ...fix, remake: { whole: false, firstStep: 3, lastStep: 4, seconds: 15 } }).remake, "Make steps 3–4 again with this change: the rest stays as it is.");
});
