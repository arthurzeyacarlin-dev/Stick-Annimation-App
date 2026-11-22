import assert from "node:assert/strict";
import { test } from "node:test";
import { applyV1Ops } from "./v1AnimatorCore.ts";
import type { V1Plan } from "./v1AnimatorContract.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";

// (Nov 3 FINAL V2) the timing op: slow motion / pose holds of ONE move = only that block's timing changes ($0 re-draw, same take). $0.
function books() {
  const config = v1EngineConfig(makeTestRoot().env)!;
  return { book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) };
}
const BASE: V1Plan = { contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false,
  blocks: [{ id: "b1", sentence: "A stick figure walks around.", seed_bump: 0, beats: ["walks around"] },
    { id: "b2", sentence: "A stick figure turns around, does a cartwheel, then does a backflip.", seed_bump: 0, beats: ["turns around", "does a cartwheel", "does a backflip"] }] };

test("timing: slow motion of one move sets only that block's timing; the words and every other block stay", () => {
  const { book, words } = books();
  const r = applyV1Ops(BASE, [{ op: "timing", block: "b2", beat: 3, factor: 0.35 }], book, words);
  assert.ok("plan" in r, JSON.stringify(r));
  assert.deepEqual(r.plan.blocks[1].timing, [{ move: 2, factor: 0.35 }]);
  assert.equal(r.plan.blocks[1].sentence, BASE.blocks[1].sentence);
  assert.deepEqual(r.plan.blocks[0], BASE.blocks[0]);
});

// (Nov 10 editing, Arthur: an edit changes ONLY what he asked) a new hold keeps the move's speed; "back to normal" (hold none) clears both
test("timing: a hold keeps that move's speed; hold none clears it; a move that is not there is refused", () => {
  const { book, words } = books();
  const slow = applyV1Ops(BASE, [{ op: "timing", block: "b2", beat: 3, factor: 0.35 }], book, words) as { plan: V1Plan };
  const keys = applyV1Ops(slow.plan, [{ op: "timing", block: "b2", beat: 3, hold: "keys" }], book, words) as { plan: V1Plan };
  assert.deepEqual(keys.plan.blocks[1].timing, [{ move: 2, factor: 0.35, hold: "keys" }]);
  const back = applyV1Ops(keys.plan, [{ op: "timing", block: "b2", beat: 3, hold: "none" }], book, words) as { plan: V1Plan };
  assert.equal(back.plan.blocks[1].timing, undefined);
  assert.ok("error" in applyV1Ops(BASE, [{ op: "timing", block: "b2", beat: 9, factor: 0.5 }], book, words));
});

test("timing: a rewrite from move 3 keeps the timing of moves before it and drops the changed move's", () => {
  const { book, words } = books();
  const two = applyV1Ops(BASE, [{ op: "timing", block: "b2", beat: 2, hold: "every" }, { op: "timing", block: "b2", beat: 3, factor: 0.5 }], book, words) as { plan: V1Plan };
  const re = applyV1Ops(two.plan, [{ op: "rewrite", block: "b2", sentence: "A stick figure turns around, does a cartwheel, then does a front flip.", beat: 3 }], book, words) as { plan: V1Plan };
  assert.deepEqual(re.plan.blocks[1].timing, [{ move: 1, hold: "every" }]);
});

test("timing: the AI's answer is read loudly (a bad op is dropped, a good one kept)", () => {
  const { book, words } = books();
  const turn = normalizeV1LunaTurn({ intent: "edit", say: "Slowing the backflip.", ops: [{ op: "timing", block: "b2", beat: 3, factor: 0.35, hold: null, from: null, to: null }] }, words, book);
  assert.deepEqual(turn?.ops, [{ op: "timing", block: "b2", beat: 3, factor: 0.35, hold: null, seconds: null, from: null, to: null }]);
});

test("Nov 8 night: 'hold the flex longer' = hold still + seconds (read and applied); still without seconds is dropped", () => {
  const { book, words } = books();
  const turn = normalizeV1LunaTurn({ intent: "edit", say: "Holding the flex.", ops: [{ op: "timing", block: "b2", beat: 3, factor: null, hold: "still", seconds: 1.5, from: null, to: null }] }, words, book);
  assert.deepEqual(turn?.ops, [{ op: "timing", block: "b2", beat: 3, factor: null, hold: "still", seconds: 1.5, from: null, to: null }]);
  const bad = normalizeV1LunaTurn({ intent: "edit", say: "Holding.", ops: [{ op: "timing", block: "b2", beat: 2, factor: null, hold: "still", seconds: null, from: null, to: null }] }, words, book);
  assert.notDeepEqual(bad?.ops, [{ op: "timing", block: "b2", beat: 2, factor: null, hold: "still", seconds: null, from: null, to: null }], "a hold without seconds is never used");
});
