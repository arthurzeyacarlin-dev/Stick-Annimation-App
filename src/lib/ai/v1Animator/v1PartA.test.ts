// Nov 3 PART A (Arthur: "it should never reply with a fail"): "try again" is a new take; a still camera only when the user asks for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyV1Ops, planFromCreate } from "./v1AnimatorCore.ts";
import { join } from "node:path";
import { readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { makeTestRoot } from "./__fixtures__/v1TestRoot.ts";
import type { V1Plan, V1Version } from "./v1AnimatorContract.ts";

const plan = (blocks: V1Plan["blocks"]): V1Plan => ({ contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false, blocks });
const failed = (p: V1Plan) => ({ n: 9, status: "failed", plan: p }) as unknown as V1Version;

test("the camera is Sonnet's choice by meaning, still by default - never a word list (Nov 11, Arthur: hard-coded)", () => {
  const { lx } = makeTestRoot();
  const book = readLunaBook(join(lx, "v1k", "luna-book.json")), words = readEngineWords(join(lx, "v1k", "passed_engine_book.json"));
  const turn = { intent: "create" as const, say: "s", blocks: [{ sentence: "A stick figure hops over two spikes." }], camera: "still" as const };
  assert.equal(planFromCreate(turn, book, words, "make him leave the scene, I want him gone")!.camera, "still", "no magic words needed");
  assert.equal(planFromCreate({ ...turn, camera: undefined }, book, words, "he hops over two spikes")!.camera, "still", "still by default");
  assert.equal(planFromCreate({ ...turn, camera: "follow" as const }, book, words, "he runs a long way")!.camera, undefined, "follow when Sonnet says so");
});

// (Nov 10 editing, Arthur: "an editing system, not a destroy-your-animation system") one_take_always is OFF: an edit never merges the parts
// into one new sentence (that re-made the whole animation); a made animation is still one take, the asked length rides on the plan
test("an edit keeps the parts it does not change (never one merged re-take); a new animation is one take", () => {
  const { lx } = makeTestRoot({ oneTake: true });
  const book = readLunaBook(join(lx, "v1k", "luna-book.json")), words = readEngineWords(join(lx, "v1k", "passed_engine_book.json"));
  assert.equal(book.longScenes.oneTakeAlways, false);
  const turn = { intent: "create" as const, say: "s", requestedSeconds: 15, blocks: [{ sentence: "A stick figure runs. A stick figure does a cartwheel. A stick figure does a backflip. A stick figure kicks. A stick figure bows." }] };
  const p = planFromCreate(turn, book, words, "make a 15 second animation")!;
  assert.equal(p.blocks.length, 1, "five moves = still ONE take");
  assert.equal(p.asked_s, 15);
  const appended = applyV1Ops(p, [{ op: "append", sentence: "A stick figure waves." }], book, words);
  assert.ok("plan" in appended && appended.plan.blocks.length === 2 && appended.plan.blocks[0].sentence === p.blocks[0].sentence, "the old part stays exactly as it was");
  const moved = applyV1Ops(appended.plan, [{ op: "rewrite", block: "b2", sentence: "A stick figure bows." }], book, words);
  assert.ok("plan" in moved && moved.plan.blocks.length === 2 && moved.plan.blocks[0].sentence === p.blocks[0].sentence, "a rewrite changes only its own part");
});
