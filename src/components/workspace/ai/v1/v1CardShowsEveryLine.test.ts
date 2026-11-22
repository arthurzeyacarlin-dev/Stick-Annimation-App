// (Nov 13, live: a 9-move story's card lost "and finally takes a big bow" - the page cut every card to 8 lines) THE CARD SHOWS EVERY LINE it is
// sent: the move lines, the not-drawn list. Only a question's options keep their own room (4). $0, no AI call.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readV1Turn } from "./v1AnimatorController.ts";

test("the card keeps all 12 lines and all 10 not-drawn things; a question keeps at most 4 options", () => {
  const lines = Array.from({ length: 12 }, (_, i) => `move ${i + 1} (2 s)`), notDrawn = Array.from({ length: 10 }, (_, i) => `Thing ${i + 1}`);
  const got = readV1Turn({ turn: { say: "ok", intent: "create", questions: [{ text: "Which one?", options: ["a", "b", "c", "d", "e", "f"] }] }, gate: { credits: 35, lines, notDrawn, colour: "#111111" } });
  assert.deepEqual(got?.gate?.lines, lines, "every line, the last one too");
  assert.deepEqual(got?.gate?.notDrawn, notDrawn);
  assert.equal(got?.questions[0].options.length, 4);
});
