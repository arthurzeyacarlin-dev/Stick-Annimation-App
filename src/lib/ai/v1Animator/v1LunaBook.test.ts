import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { LunaBookError, lunaInstructions, lunaTurnInput, lunaTurnSchema, normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { ANSWERS, makeTestRoot } from "./__fixtures__/v1TestRoot.ts";

// TEST FIXTURES ONLY: the REAL books (copied into a temp root) + the labelled hand-written answers. $0, no AI call.
const books = () => {
  const { lx } = makeTestRoot();
  return { lx, book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const norm = (key: string) => { const { book, words } = books(); return normalizeV1LunaTurn(ANSWERS[key], words, book); };

test("the books are read by key: looks + stage words from the engine book, max blocks + defaults from Luna's", () => {
  const { book, words } = books();
  assert.equal(words.contract, "v1-blocks");
  assert.deepEqual(words.looks.sort(), ["neckless", "passed"]);
  assert.equal(typeof words.stageWords.animating, "string");
  assert.equal(book.createMaxBlocks, 1); // (Nov 2 night) ONE TAKE: the AI writes one block; the server makes more takes only past the book's one_take limits // (Nov 2 eve, Arthur: a detailed story is made whole, at once)
  assert.ok(words.looks.includes(book.defaultLook as never));
  assert.ok(book.createRules.every((r) => !r.includes("{block_seconds}")), "book {keys} are filled from the book");
});

test("a missing book key is loud", () => {
  const { lx } = books();
  const p = join(lx, "v1k", "luna-book.json");
  const b = JSON.parse(readFileSync(p, "utf8")); delete b.default_look; writeFileSync(p, JSON.stringify(b));
  assert.throws(() => readLunaBook(p), LunaBookError);
});

test("strict schema: every object lists every property as required, no extra properties; optional = nullable; enums", () => {
  const { book, words } = books();
  const schema = lunaTurnSchema(words, book);
  const walk = (s: unknown): void => {
    if (Array.isArray(s)) { s.forEach(walk); return; }
    if (!s || typeof s !== "object") return;
    const o = s as Record<string, unknown>;
    if (o.type === "object") {
      assert.equal(o.additionalProperties, false);
      assert.deepEqual([...(o.required as string[])].sort(), Object.keys(o.properties as object).sort());
    }
    Object.values(o).forEach(walk);
  };
  walk(schema);
  const props = (schema as { properties: Record<string, unknown> }).properties;
  assert.deepEqual(Object.keys(props).sort(), ["askedDetails", "blocks", "camera", "cameraMoves", "colour", "heard", "intent", "kimodoSteps", "leftward", "lookBriefs", "newThings", "noFigure", "ops", "partColours", "questions", "removeSteps", "requestedSeconds", "room", "say", "scene", "size", "start", "still", "storyPlan", "style"]);
  const text = JSON.stringify(schema);
  for (const op of ["rewrite", "append", "delete", "redo", "colour", "mirror", "look"]) assert.ok(text.includes(`"${op}"`), op);
  assert.ok(text.includes(`"maxItems":${book.createMaxBlocks}`), "create = up to the book's create.max_blocks blocks"); // (Nov 2 eve, Arthur: a detailed story is made whole, at once)
});

test("create: the user's own words in ONE block; colour only when named; a long scene = the first block + says more can be added", () => {
  const a = norm("create_jacks_flip")!;
  assert.deepEqual(a, { intent: "create", say: "I'll make him do a few jumping jacks and then a front flip.", blocks: [{ sentence: "A stick figure does a few jumping jacks and then a front flip." }], colour: null });
  const b = norm("create_blue_wave_bow")!;
  assert.equal(b.colour, "#2563eb");
  assert.ok(!/blue/i.test(b.blocks![0].sentence), "a colour never goes in the sentence");
  const c = norm("create_long_first_block")!;
  assert.equal(c.blocks!.length, 1);
  assert.match(c.say, /next part/);
  assert.equal(norm("create_two_blocks"), null, "(Nov 2 night) 2 blocks > the book's max_blocks 1 = a bad answer (one take)"); // (Nov 2 eve, Arthur: a detailed story is made whole, at once)
  assert.equal(norm("create_empty_sentence"), null);
});

test("edit ops: rewrite keeps every other word, append, colour + mirror, look, redo, delete; unknown op / look = bad answer", () => {
  const r = norm("edit_backflip")!;
  assert.deepEqual(r.ops, [{ op: "rewrite", block: "b1", sentence: "A stick figure does a few jumping jacks and then a backflip." }]);
  const before = "A stick figure does a few jumping jacks and then a front flip.".split(" "), after = (r.ops![0] as { sentence: string }).sentence.split(" ");
  assert.deepEqual(after.slice(0, 9), before.slice(0, 9), "the words not asked to change stay word for word");
  assert.deepEqual(norm("edit_next_part")!.ops, [{ op: "append", sentence: "A stick figure sits down on the floor." }]);
  assert.deepEqual(norm("edit_black_other_way")!.ops, [{ op: "colour", colour: "#111111" }, { op: "mirror" }]);
  assert.deepEqual(norm("edit_old_look")!.ops, [{ op: "look", look: "passed" }]);
  assert.deepEqual(norm("edit_redo_b1")!.ops, [{ op: "redo", block: "b1" }]);
  assert.deepEqual(norm("edit_delete_b2")!.ops, [{ op: "delete", block: "b2" }]);
  assert.equal(norm("edit_unknown_op"), null);
  assert.equal(norm("edit_bad_look"), null);
});

test("refusals keep the capability sentence; conversation / clarify pass through", () => {
  const { book } = books();
  const r = norm("refuse_two_people")!;
  assert.equal(r.intent, "refuse");
  assert.ok(r.say.includes(book.capability));
  assert.equal(norm("conversation")!.intent, "conversation");
  assert.equal(norm("clarify")!.intent, "clarify");
});

test("Luna sees the current blocks (id + sentence) and the book's rules", () => {
  const { book, words } = books();
  const input = JSON.parse(lunaTurnInput(book, { message: "make it a backflip", recentConversation: [], checkerSaid: null,
    current: { contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false, blocks: [{ id: "b1", sentence: "A stick figure jumps.", seed_bump: 2 }] } }));
  assert.deepEqual(input.currentAnimation.blocks, [{ id: "b1", sentence: "A stick figure jumps." }]);
  const text = lunaInstructions(book, words);
  for (const rule of [...book.createRules, ...book.editRules, ...book.refuse.when]) assert.ok(text.includes(rule));
  assert.ok(text.includes(book.capability));
});
