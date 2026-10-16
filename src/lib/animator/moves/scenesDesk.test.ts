import assert from "node:assert/strict";
import { test } from "node:test";
import { deskTypingPlan } from "./scenesDesk.ts";
import { lawProblems, tidyPlan } from "../claude/claudeAnimator.ts";

// Seats and held things keep working (a seated move sits ON the chair; a mug in the hand never hangs on a chain or snaps to the
// floor): the hand-checked desk scene passes every broken law.
test("a figure sits at a desk, types and sips from a held mug — no broken law", () => {
  const words = "a stick figure at his desk, working, typing, and drinking from a mug";
  assert.deepEqual(lawProblems(tidyPlan(deskTypingPlan() as unknown as Record<string, unknown>), words, null).filter((x) => x.startsWith("LAW ")), []);
});
