import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyV1Ops, createV1Animator, friendlyV1Label, friendlyV1Report, planFromCreate, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import type { V1Plan } from "./v1AnimatorContract.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { lunaInstructions, lunaTurnSchema, normalizeV1LunaTurn, readEngineWords, readLunaBook, readSonnetBrain } from "./v1LunaBook.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineHang } from "./__fixtures__/v1TestRoot.ts";
import { createV1SonnetTurnGenerator, sonnetTurnOrLuna, type FetchLike } from "../../anthropic/generateV1SonnetTurn.ts";
import { v1Paragraphs, v1WorkWord } from "../../../components/workspace/ai/v1/v1AnimatorController.ts";

// Nov 2 polish (Arthur's asks 1-7). TEST FIXTURES ONLY: the labelled hand-written answers in __fixtures__ + the REAL books. $0, no AI call.
const books = () => {
  const { lx, env, root } = makeTestRoot();
  return { lx, env, root, book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const ME = { ownerId: "owner-1", projectId: "project-1" };

// (Nov 10, Arthur: like a pro app) the book now asks for a headline + bullets; the old plain-paragraph helper is still checked as it was
test("ask 1: plain paragraphs still split cleanly; the book asks for a headline + bullets", () => {
  assert.deepEqual(v1Paragraphs("I'll make him **wave**.\n\nYou could make him blue."), ["I'll make him wave.", "You could make him blue."]);
  assert.deepEqual(v1Paragraphs("## Done\n- one\n\n\n  next idea  "), ["Done one", "next idea"]);
  assert.deepEqual(v1Paragraphs("One line only."), ["One line only."]);
  // (the <p> rendering is checked in components/workspace/ai/v1/v1Animator.test.ts, which can load the .tsx view)
  const { book, words } = books();
  assert.match(lunaInstructions(book, words), /line 1 is a short headline starting with '## '/);
});

test("ask 2: a single still pose -> still on the turn + the version -> the work word is 'Drawing', else 'Animating'", async () => {
  const { book, words, env } = books();
  const turn = normalizeV1LunaTurn(ANSWERS.create_still_standing, words, book);
  assert.equal(turn?.still, true);
  assert.equal(normalizeV1LunaTurn(ANSWERS.create_jacks_flip, words, book)?.still, undefined);
  const config = v1EngineConfig(env)!;
  const { spawn } = fakeSpawner(() => playEngineHang());
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "create_still_standing");
  const animator = createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const out = await animator.turn({ ...ME, animationId: null, message: "make one stick figure standing", recentConversation: [] });
  assert.ok(out.ok && out.animation);
  if (!out.ok || !out.animation) return;
  assert.equal(out.animation.versions[0].still, true);
  assert.equal(v1WorkWord(out.animation), "Drawing");
  assert.equal(v1WorkWord({ ...out.animation, versions: out.animation.versions.map((v) => ({ ...v, still: undefined })) }), "Animating");
  animator.cancel(ME.ownerId, ME.projectId, out.animation.animationId);
});

test("ask 3: part colours (spine = body) + 'really tiny' at create land on the first plan; partColours edit = the complete set (Nov 5); colour clears parts", () => {
  const { book, words } = books();
  const turn = normalizeV1LunaTurn(ANSWERS.create_part_colours_tiny, words, book)!;
  const plan = planFromCreate(turn, book, words)!;
  assert.deepEqual(plan.partColours, { head: "#facc15", arms: "#facc15", body: "#2563eb", legs: "#16a34a" });
  assert.equal(plan.size, 0.35, "tiny is not lost at create (same scale as the size op)");
  assert.equal(plan.colour, book.defaultColour);
  const edit = normalizeV1LunaTurn(ANSWERS.edit_part_colours, words, book)!;
  assert.deepEqual(edit.ops, [{ op: "partColours", partColours: { body: "#2563eb", legs: "#16a34a" } }]);
  const base: V1Plan = { contract: "v1-blocks", colour: "#dc2626", look: "neckless", mirror: false, partColours: { head: "#facc15" }, blocks: [{ id: "b1", sentence: "A stick figure runs forward.", seed_bump: 0 }] };
  const after = applyV1Ops(base, edit.ops!, book, words);
  assert.ok("plan" in after);
  if (!("plan" in after)) return;
  assert.deepEqual(after.plan.partColours, { body: "#2563eb", legs: "#16a34a" });   // (Nov 5) the op is the complete set: what it leaves out is gone
  assert.deepEqual(after.plan.blocks, base.blocks, "his moves stay exactly the same");
  const black = applyV1Ops(after.plan, [{ op: "colour", colour: "#111111" }], book, words);
  assert.ok("plan" in black && black.plan.partColours === undefined && black.plan.colour === "#111111");
  const schema = JSON.stringify(lunaTurnSchema(words, book));
  assert.ok(schema.includes('"partColours"') && schema.includes('"still"'));
  const text = lunaInstructions(book, words);
  assert.match(text, /'spine', 'torso', 'chest' or 'back' = body/);
  assert.match(text, /never refuse a colour/);
  assert.ok(book.editOps.includes("partColours") && JSON.stringify(book.editExamples).includes('"op":"partColours"'));
});

test("ask 6: the Claude budget refuses a Sonnet turn -> Luna answers the same turn (no budget words for chat); other failures stay Sonnet's", async () => {
  const { book, words, root, lx } = books();
  const brain = readSonnetBrain(join(lx, "v1k", "luna-book.json"), root, {});
  const neverCalled: FetchLike = async () => { throw new Error("no AI call may be made over the budget"); };
  const sonnet = createV1SonnetTurnGenerator({ fetch: neverCalled, ledger: { read: () => ({ total: 999 }), write: () => {} }, env: { ANTHROPIC_API_KEY: "test-not-a-key", CLAUDE_TEST_BUDGET_USD: "25" } });
  const request = { jobId: "j", turnId: "t", projectId: "p", message: "make one stick figure standing", recentConversation: [], current: null, checkerSaid: null };
  let lunaAsked = 0;
  const luna = async () => { lunaAsked += 1; return { ok: true as const, turn: normalizeV1LunaTurn(ANSWERS.create_still_standing, words, book)! }; };
  const r = await sonnetTurnOrLuna(() => sonnet(request, { book, words, brain }), luna);
  assert.equal(r.brain, "luna");
  assert.ok(r.out.ok && "turn" in r.out && r.out.turn.intent === "create");
  assert.equal(lunaAsked, 1);
  const unreachable = await sonnetTurnOrLuna(async () => ({ ok: false as const, failure: "unreachable" as const, usage: null, detail: "x" }), luna);
  assert.equal(unreachable.brain, "sonnet");
  assert.equal(lunaAsked, 1);
  // (Nov 2, Arthur: Sonnet ONLY) the server must NOT fall back to Luna any more
  assert.doesNotMatch(readFileSync(new URL("./v1AnimatorServer.ts", import.meta.url), "utf8"), /sonnetTurnOrLuna\(/, "no Luna fallback in the server");
});

test("ask 7: the LISTEN rule (every named action, in order, halfway / midway kept as timing words) is in the book for create + edit", () => {
  const { book, words } = books();
  const text = lunaInstructions(book, words);
  assert.match(text, /LISTEN: every action the user names must appear in the block sentence, in the user's order/);
  assert.match(text, /LISTEN \(rewrite and append\)/);
  assert.ok(text.includes("A stick figure runs, and halfway across he hops into the air, then keeps running."));
  assert.ok(text.includes("midway"));
});

test("mosquito: the book tells the plan for things he interacts with + 'not in V1, not drawn: X' becomes the friendly book line", () => {
  const { book, words } = books();
  const text = lunaInstructions(book, words);
  assert.match(text, /swats at a mosquito buzzing around his head/);   // (Nov 13, Version 1 = with objects: the mosquito is drawn)
  assert.match(text, /make him swat at a mosquito/);
  const line = book.serverWords.not_drawn_label;
  assert.ok(line && line.includes("{words}"));
  assert.equal(friendlyV1Label("not in V1, not drawn: something appearing nearby (no objects in V1)", line),
    "Something appearing nearby isn't drawn \u2014 you can draw it yourself on its own layer.");
  assert.equal(friendlyV1Label("not drawn: a mosquito", line), "A mosquito isn't drawn \u2014 you can draw it yourself on its own layer.");
  assert.equal(friendlyV1Label("held a little longer", line), "held a little longer");
  // (FIXTURE report shape: only the labels matter here)
  const r = friendlyV1Report({ labels: ["not in V1, not drawn: a ball"], blocks: [{ labels: ["not drawn: a door"] }] } as never, book);
  assert.doesNotMatch(JSON.stringify(r), /not in V1|not drawn:/);
});
