import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { lunaInstructions, lunaTurnInput, lunaTurnSchema, normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

// Nov 2 (Arthur): the AI is a STORY GUIDE + the $0 speed op + silent Undo. TEST FIXTURES ONLY: the labelled hand-written answers in
// __fixtures__ + the REAL books (copied into a temp root). $0, no AI call, no Kimodo.
const books = () => {
  const { lx, env } = makeTestRoot();
  return { env, book: readLunaBook(join(lx, "v1k", "luna-book.json")), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")) };
};
const ME = { ownerId: "owner-1", projectId: "project-1" };

test("story guide: the book has both example conversations, and BOTH brains read them (lunaInstructions)", () => {
  const { book, words } = books();
  const users = book.storyGuide.examples.map((e) => (e as { user: string }).user);
  assert.deepEqual(users, ["I'll draw the dot", "make him swat at a mosquito"]);   // (Nov 13: the plan-first example left with the length limits)
  const text = lunaInstructions(book, words); // (generateV1LunaTurn.ts and generateV1SonnetTurn.ts both send exactly this)
  assert.match(text, /STORY GUIDE:/);
  assert.ok(text.includes("I'll draw the dot") && text.includes("make him swat at a mosquito"));
  assert.match(text, /never one part at a time/, "(Nov 2 eve) long stories are made whole");
  assert.doesNotMatch(text, /\{block_seconds\}/, "the part length is filled in from the book");
  for (const e of book.storyGuide.examples) assert.doesNotMatch((e as { say: string }).say, /Version 1 can(no|')t/i, "never dismissive about what the user draws");
  // (Nov 13, Version 1 = with objects) a thing he uses is never a reason to refuse, and never the user's to draw
  assert.ok(book.refuse.when.some((line) => /NEVER a refusal - THINGS/.test(line)));
});

test("story guide fixtures: the dot story = create the FIRST part (figure only); 'I'll draw the dot' = a warm conversation, nothing made", async () => {
  const { book, words, env } = books();
  const story = normalizeV1LunaTurn(ANSWERS.guided_dot_story, words, book);
  assert.equal(story?.intent, "create");
  assert.equal(story?.blocks?.length, 1, "one short part first");
  assert.doesNotMatch(story?.blocks?.[0].sentence ?? "", /dot/i, "the sentence is his body only; the user draws the dot");
  const drawIt = normalizeV1LunaTurn(ANSWERS.guided_i_draw_dot, words, book);
  assert.equal(drawIt?.intent, "conversation");
  const config = v1EngineConfig(env)!;
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "guided_dot_story", "guided_i_draw_dot");
  const animator = createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const a = await animator.turn({ ...ME, animationId: null, message: "a stick figure trying to catch a floating dot, about a minute", recentConversation: [] });
  assert.ok(a.ok && a.started && a.turn.intent === "create");
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  const b = await animator.turn({ ...ME, animationId: id, message: "I'll draw the dot", recentConversation: [] });
  assert.ok(b.ok && !b.started && b.turn.intent === "conversation");
  assert.equal(calls.length, 1, "welcoming the user's idea never runs the engine");
});

test("speed op: in the schema + ops list; $0, no engine run, no new version; 1 = no override; Luna is told the speed", async () => {
  const { book, words, env } = books();
  assert.ok(book.editOps.includes("speed"));
  assert.match(JSON.stringify(lunaTurnSchema(words, book)), /"speed"/);
  assert.deepEqual(normalizeV1LunaTurn(ANSWERS.edit_faster, words, book)?.ops, [{ op: "speed", speed: 1.5 }]);
  assert.equal(normalizeV1LunaTurn({ intent: "edit", say: "x", ops: [{ op: "speed", speed: book.speed.max * 2 }] }, words, book), null, "out of range = a bad answer");
  assert.ok(book.editExamples.some((e) => JSON.stringify(e).includes('"op":"speed"')), "the book has speed examples");
  assert.ok(book.editRules.some((r) => /Never say you can't change his speed/.test(r)));
  const config = v1EngineConfig(env)!;
  const { spawn, calls } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna, inputs } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "create_jacks_flip", "edit_faster", "edit_normal_speed");
  const animator = createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const a = await animator.turn({ ...ME, animationId: null, message: "jacks then a front flip", recentConversation: [] });
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  const faster = await animator.turn({ ...ME, animationId: id, message: "make him faster", recentConversation: [] });
  assert.ok(faster.ok && !faster.started && faster.animation?.speed === 1.5 && faster.animation.versions.length === 1);
  assert.equal(inputs[1].playback?.speed, 1, "Luna is told his speed now");
  assert.match(lunaTurnInput(book, { message: "x", recentConversation: [], current: null, checkerSaid: null, playback: { fps: 24, engineFps: 24, speed: 1.5 } }), /currentAnimation/);
  const normal = await animator.turn({ ...ME, animationId: id, message: "normal speed again", recentConversation: [] });
  assert.ok(normal.ok && normal.animation && !("speed" in normal.animation), "speed 1 = no override");
  assert.equal(calls.length, 1, "speed never runs the engine (no new Kimodo call)");
});

test("undo / redo are silent: no chat line is saved for them", async () => {
  const { book, words, env } = books();
  const config = v1EngineConfig(env)!;
  const { spawn } = fakeSpawner((call) => playEngineOk(call.args));
  const { luna } = fakeLuna((raw) => normalizeV1LunaTurn(raw, words, book), "create_jacks_flip", "edit_tinier");
  const animator = createV1Animator({ config: () => config, books: () => ({ book, words }), luna: luna as V1LunaCall, spawn: spawn as Spawner });
  const a = await animator.turn({ ...ME, animationId: null, message: "jacks then a front flip", recentConversation: [] });
  const id = a.ok && a.animation ? a.animation.animationId : "";
  await until(() => animator.get(ME.ownerId, ME.projectId, id)!.versions[0].status === "done");
  await animator.turn({ ...ME, animationId: id, message: "make him tinier", recentConversation: [] });
  await until(() => animator.get(ME.ownerId, ME.projectId, id)!.versions[1]?.status === "done");
  assert.ok(animator.undo(ME.ownerId, ME.projectId, id).ok);
  assert.ok(animator.redo(ME.ownerId, ME.projectId, id).ok);
  assert.equal(animator.latest(ME.ownerId, ME.projectId).lines.some((l) => l.kind === "note"), false);
});
