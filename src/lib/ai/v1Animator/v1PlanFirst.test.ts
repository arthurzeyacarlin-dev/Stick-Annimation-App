import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createV1Animator, honestLength, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { lunaInstructions, lunaTurnSchema, normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// Nov 2 (Arthur): PLAN FIRST + honest length + capabilities. TEST FIXTURES ONLY (labelled hand-written answers) + the REAL books in a
// temp root. $0: no AI call, no Kimodo.
const books = () => {
  const { lx, env } = makeTestRoot();
  return { env, book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const ME = { ownerId: "owner-1", projectId: "project-1" };
const setup = (...keys: string[]) => {
  const b = books();
  const config = v1EngineConfig(b.env)!;
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, b.words, b.book), ...keys);
  const animator = createV1Animator({ config: () => config, books: () => ({ book: b.book, words: b.words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  return { ...b, animator, calls };
};

test("book + instructions: capabilities (CAN / CANNOT / KNOWN WEAK), plan first, the new examples; schema has requestedSeconds + storyPlan", () => {
  const { book, words } = books();
  const text = lunaInstructions(book, words);
  for (const head of ["CAPABILITIES", "CAN:", "CANNOT"]) assert.ok(text.includes(head), head);
  assert.ok(book.capabilities.cannot.length >= 2 && !text.includes("KNOWN WEAK"));   // (Nov 17, Arthur: "H3 is the camera" - cuts and scene changes left CANNOT)   // (Nov 13: no weak moves are listed any more - the only limit is the animator)   // (Nov 7) the weak list shrinks as Wan takes the hard moves
  assert.match(text, /ANY LENGTH/); // (Nov 13, Arthur: zero roadblocks) any length is made whole, at once
  assert.doesNotMatch(text, /PART BY PART|never make it at once/);
  assert.doesNotMatch(text, /Shall I start part 1\?/);
  assert.doesNotMatch(text, /\{block_seconds\}|\{min_seconds\}/);
  const users = book.longScenes.examples.map((e) => (e as { user: string }).user);
  assert.ok(users.some((u) => /city with his friends/.test(u)) && !users.some((u) => /2 minute story/.test(u)), "(Nov 13) no example teaches part by part any more");
  // (Nov 13, Version 1 = with objects) what cannot be made is said as 'not drawn' for three things only; a thing he uses is drawn
  assert.match(text, /Everything that is not on CANNOT is YES/);
  assert.match(text, /Never tell the user to draw a thing themselves/);
  const schema = JSON.stringify(lunaTurnSchema(words, book));
  assert.match(schema, /"requestedSeconds"/);
  assert.match(schema, /"storyPlan"/);
});

test("(Nov 13, Arthur: zero roadblocks) a 45 second story is made at once, whole - no length guard", async () => {
  const { animator, calls } = setup("create_detailed_45s");
  const a = await animator.turn({ ...ME, animationId: null, message: "a 45 second story: he looks around for a buzz, swats twice, then claps and checks his hands", recentConversation: [] });
  assert.ok(a.ok && a.started && a.turn.intent === "create", "any length is made");
  assert.equal(calls.length, 1, "one engine run");
});

test("(Nov 13, Arthur: zero roadblocks) a 2 minute create is animated at once - never turned into a guided plan", async () => {
  const { animator, calls } = setup("plan_mosquito_rushed_create");
  const a = await animator.turn({ ...ME, animationId: null, message: "make a 2 minute story of a stick figure catching a mosquito and killing it", recentConversation: [] });
  assert.ok(a.ok && a.started && a.turn.intent === "create");
  assert.equal(calls.length, 1);
});

test("server guard: no storyPlan -> the book's plan words; the AI's own clarify plan passes through", async () => {
  const { book } = books();
  const t = normalizeV1LunaTurn(ANSWERS.plan_mosquito_rushed_no_plan, books().words, book)!;
  assert.equal(t.requestedSeconds, 120);
  const { animator, calls } = setup("plan_mosquito_clarify");
  const a = await animator.turn({ ...ME, animationId: null, message: "make a 2 minute story of a stick figure catching a mosquito", recentConversation: [] });
  assert.ok(a.ok && !a.started && a.turn.intent === "clarify" && /draw the mosquito/.test(a.turn.say));
  assert.doesNotMatch(a.ok ? a.turn.say : "", /animation run|runs\b/, "(Nov 13) any length is fine: no talk of parts, runs or cost");
  assert.equal(calls.length, 0);
});

test("agreed plan -> 'yes' makes part 1 (create, says its length); 'next part' = append; a NEW long story after a result plans again", async () => {
  const { animator, calls } = setup("plan_mosquito_clarify", "plan_mosquito_yes_part1", "plan_next_part", "plan_mosquito_rushed_create");
  const a = await animator.turn({ ...ME, animationId: null, message: "2 minute mosquito story", recentConversation: [] });
  assert.ok(a.ok && !a.started);
  const b = await animator.turn({ ...ME, animationId: null, message: "yes, start", recentConversation: [] });
  assert.ok(b.ok && b.started && b.turn.intent === "create");
  assert.match(b.ok ? b.turn.say : "", /made as one part/);
  assert.equal(calls.length, 1);
  const id = b.ok && b.animation ? b.animation.animationId : "";
  await until(() => animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  const c = await animator.turn({ ...ME, animationId: id, message: "next part", recentConversation: [] });
  assert.ok(c.ok && c.started && c.turn.intent === "edit");
  await until(() => animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done");
  assert.equal(animator.get(ME.ownerId, ME.projectId, id)!.versions[1].plan.blocks.length, 2);
  const d = await animator.turn({ ...ME, animationId: null, message: "another 2 minute story", recentConversation: [] });
  assert.ok(d.ok && d.started && d.turn.intent === "create", "(Nov 13) a NEW 2-minute create after a result is made at once too");
  assert.equal(calls.length, 3);
});

test("'two seconds long' = one short block made right away, saying the shortest part honestly (book min_seconds)", async () => {
  const { animator, calls, book } = setup("create_two_seconds");
  const a = await animator.turn({ ...ME, animationId: null, message: "make him jump, two seconds long", recentConversation: [] });
  assert.ok(a.ok && a.started && a.turn.intent === "create");
  assert.equal(calls.length, 1);
  assert.ok((a.ok ? a.turn.say : "").includes(`about ${book.longScenes.minSeconds} seconds`));
  assert.match(a.ok ? a.turn.say : "", /shorter than the shortest part/);
  // (Nov 2, Fable audit) the AI's own guessed length is taken out; only the server's honest line stays
  assert.doesNotMatch(honestLength({ intent: "create", say: "I'll make him wave. This part is about 10 seconds." }, book), /10 seconds/);
});

test("'in the city with his friends' = honest clarify, nothing made", async () => {
  const { animator, calls } = setup("clarify_city_friends");
  const a = await animator.turn({ ...ME, animationId: null, message: "a stick figure in the city with his friends", recentConversation: [] });
  assert.ok(a.ok && !a.started && a.turn.intent === "clarify");
  assert.match(a.ok ? a.turn.say : "", /one stick figure/);
  assert.equal(calls.length, 0);
});
