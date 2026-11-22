// (Nov 2 app round, PLAN_EDIT_SPEED_NOV2 + DESTROY holes 3-5) EDITS KEEP SIZE + ONE honest length line. $0, no AI calls.
// LABELLED FIXTURES: Arthur's real Nov 2 animation (out/app-v1/52e33d0b.../9c1306dc...): v2 block b1 = 5.75 s, his v3 message, and the rewrite
// Sonnet wrote for it (6 actions -> a 30 s block, 825 pictures). The other sentences are hand-written labelled cases.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { V1Plan } from "./v1AnimatorContract.ts";
import { applyV1Ops, editLength, honestLength, stripLengths } from "./v1AnimatorCore.ts";
import { actionCount, actionPieces, askedForMore } from "./v1EditSize.ts";
import { lunaInstructions, readEngineWords, readLunaBook, serverWord } from "./v1LunaBook.ts";
import { REAL_ENGINE_BOOK, REAL_LUNA_BOOK } from "./__fixtures__/v1TestRoot.ts";

const real = readLunaBook(REAL_LUNA_BOOK), words = readEngineWords(REAL_ENGINE_BOOK);
// (Nov 3 one-take round) these tests prove the parts path, now behind long_scenes.one_take_always: run with it off (v1PartA.test.ts = on)
const book = { ...real, longScenes: { ...real.longScenes, oneTakeAlways: false } };
const g = book.editSize;

// FIXTURE (real, Nov 2): Arthur's animation 9c1306dc, version 2 -> his message -> the AI's v3 rewrite
const V2: V1Plan = { contract: "v1-blocks", colour: "blue", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "A stick figure sees something floating, tries to grab it, but misses.", seed_bump: 0 }] };
const ARTHUR_V3_MESSAGE = "This good figure just lifts his arm up and looks up there. I want him to look like he's genuinely trying to get something. That dot. That I'll animate later.";
const SONNET_V3_REWRITE = "A stick figure sees something floating, stretches up on his toes, jumps and grabs for it with both hands again and again, trying hard to get it, but misses.";
const V2_SECONDS = { b1: 5.75 };

test("actions are counted by the book: a repeat is ONE action with a count", () => {
  assert.equal(actionCount(V2.blocks[0].sentence, g), 3);
  assert.equal(actionCount(SONNET_V3_REWRITE, g), 6);
  assert.ok(actionPieces(SONNET_V3_REWRITE, g).includes("grabs for it with both hands again and again"), "'again and again' stays inside its action");
  assert.equal(actionCount("A stick figure jumps for it three times.", g), 1);
  assert.equal(actionCount("A stick figure jumps over and over.", g), 1);
});

test("Arthur's v3 rewrite (6 actions, he did not ask for more) -> the AI is re-asked ONCE with the book's words", () => {
  assert.equal(askedForMore(ARTHUR_V3_MESSAGE, g), false);
  const r = applyV1Ops(V2, [{ op: "rewrite", block: "b1", sentence: SONNET_V3_REWRITE }], book, words, { message: ARTHUR_V3_MESSAGE, retried: false });
  assert.ok("error" in r);
  if ("error" in r) { assert.match(r.error, /HOW he does it, not HOW MANY/); assert.match(r.error, /had 3 actions/); assert.match(r.error, /have 6/); assert.match(r.error, new RegExp(`at most ${g.maxBeats}`)); }
});

test("the AI insists after its one re-ask -> split: the part keeps max_beats actions, the rest is a NEW part right after (nothing dropped)", () => {
  const r = applyV1Ops(V2, [{ op: "rewrite", block: "b1", sentence: SONNET_V3_REWRITE }], book, words, { message: ARTHUR_V3_MESSAGE, retried: true });
  assert.ok("plan" in r);
  if ("plan" in r) {
    assert.equal(r.plan.blocks.length, 2);
    assert.equal(actionCount(r.plan.blocks[0].sentence, g), g.maxBeats);
    assert.equal(r.plan.blocks[0].id, "b1"); assert.equal(r.plan.blocks[1].id, "b2");
    assert.ok(r.plan.blocks[1].sentence.startsWith(g.newPartSubject));
    const all = r.plan.blocks.map((b) => b.sentence).join(" ");
    for (const piece of actionPieces(SONNET_V3_REWRITE, g).slice(1)) assert.ok(all.includes(piece), `kept: ${piece}`);
  }
});

test("the user asked for MORE -> rewrite + a new part straight away (no re-ask)", () => {
  const msg = "make him try more: add a stretch and more jumps";
  assert.equal(askedForMore(msg, g), true);
  const r = applyV1Ops(V2, [{ op: "rewrite", block: "b1", sentence: SONNET_V3_REWRITE }], book, words, { message: msg, retried: false });
  assert.ok("plan" in r && r.plan.blocks.length === 2);
});

test("a rewrite that changes HOW (same size or within the cap) passes the guard untouched; no guard = exactly as before", () => {
  const how = "A stick figure sees something floating, jumps hard to grab it with both hands three times, but misses.";
  const r = applyV1Ops(V2, [{ op: "rewrite", block: "b1", sentence: how }], book, words, { message: ARTHUR_V3_MESSAGE, retried: false });
  assert.ok("plan" in r && r.plan.blocks.length === 1 && r.plan.blocks[0].sentence === how);
  const old = applyV1Ops(V2, [{ op: "rewrite", block: "b1", sentence: SONNET_V3_REWRITE }], book, words);
  assert.ok("plan" in old && old.plan.blocks.length === 1, "callers without the guard (pure tests) behave as before");
});

test("the edit reply says the part's length ONCE: a rewrite keeps its length as made", () => {
  const say = "I'll make him really try to reach it. It will be about 30 seconds long.";
  const out = editLength(say, [{ op: "rewrite", block: "b1", sentence: "A stick figure sees something floating, jumps hard to grab it three times, but misses." }], V2, V2_SECONDS, ARTHUR_V3_MESSAGE, book);
  assert.equal(out, `I'll make him really try to reach it. ${serverWord(book, "edit_length_kept", { i: 1, seconds: 6 })}`);
  const app = editLength("I'll add a wave.", [{ op: "append", sentence: "A stick figure waves." }], V2, V2_SECONDS, "then he waves", book);
  assert.equal(app, `I'll add a wave. ${serverWord(book, "edit_length_new", { seconds: book.longScenes.blockSeconds })}`);
  assert.equal(editLength("Blue it is.", [{ op: "colour", colour: "blue" }], V2, V2_SECONDS, "make him blue", book), "Blue it is.");
});

test("ONE honest length line: the seen contradiction ('about 10 seconds in all' + '2 parts of about 10 seconds each') cannot happen", () => {
  // FIXTURE (seen Nov 2, labelled): the AI said a total, the server added a per-part line that doubled it
  const turn = { intent: "create" as const, say: "I'll make him do a front flip, then point. That's about 10 seconds in all.\n\nNext you could add a wave.",
    blocks: [{ sentence: "A stick figure does a front flip, then points forward.", parts: ["A stick figure does a front flip.", "A stick figure points forward."] }] };
  const out = honestLength(turn, book);
  assert.doesNotMatch(out, /10 seconds in all/);
  assert.equal((out.match(/second/g) ?? []).length <= 1, true, out);
  assert.doesNotMatch(out, /2 parts/, "(Nov 2 night) ONE TAKE: 2 actions are one take, said as one part");
  assert.match(out, /Next you could add a wave\./, "the idea paragraph stays");
  // the user gave a total -> the one line carries it
  const withTotal = honestLength({ ...turn, requestedSeconds: 8 }, book);
  assert.doesNotMatch(withTotal, /made in \d+ parts/); // (Nov 2 night) 8 s, 2 actions = ONE take // (Nov 2, Fable audit) no guessed seconds before it is made
  // a single part: the AI's wrong length sentence is replaced, a MOVE's own seconds stay
  const one = honestLength({ intent: "create", say: "I'll make him point and hold it for 2 seconds. This part is about 25 seconds long.", blocks: [{ sentence: "A stick figure points." }] }, book);
  assert.equal(one, `I'll make him point and hold it for 2 seconds. ${serverWord(book, "length_said", { seconds: book.longScenes.blockSeconds })}`);
  assert.equal(stripLengths("In the second part he runs.", book), "In the second part he runs.");
});

// (Nov 4 PM12, live: 10 Kimodo steps = 21.8 s made as ONE piece, but the chat said "It is made in 2 parts" - counted the old way)
test("the parts line counts the chat AI's Kimodo steps the way the engine makes them", () => {
  const steps = Array.from({ length: 10 }, (_, i) => ({ text: `A person does move ${i + 1}.`, seconds: 2.2, travels: false }));
  const turn = { intent: "create" as const, say: "I'll make all ten moves.", blocks: [{ sentence: "x", parts: steps.map((s) => s.text) }], kimodoSteps: steps };
  assert.doesNotMatch(honestLength(turn, book), /parts/);
  const long = Array.from({ length: Math.floor(book.longScenes.stepsTakeMaxS / 2.2) + 1 }, (_, i) => ({ text: `A person does move ${i + 1}.`, seconds: 2.2, travels: false }));   // (Nov 11) just past the book's limit for one part
  assert.doesNotMatch(honestLength({ ...turn, kimodoSteps: long }, book), /parts/, "(Nov 13, Arthur: ONE operation, any length) a long animation is one part too");
});

test("the book teaches it: EDITS KEEP SIZE + the edit length line are in the instructions, numbers filled", () => {
  const text = lunaInstructions(book, words);
  assert.match(text, /EDITS KEEP SIZE/);
  assert.match(text, new RegExp(`At most ${g.maxBeats} actions in one part`));
  assert.match(text, /a new part is as long as its own steps, at most 15 seconds/);
  assert.doesNotMatch(text, /\{max_beats\}|\{block_seconds\}/);
});
