// (Nov 13, Arthur: "the gate should TALK to me about what will be animated" - and "whatever the gate says, if I okay it, is what is made")
// THE CARD IS THE ORDER ($0, fixtures only): a card line = the step's own sentence, as Sonnet wrote it, with its seconds - exactly what the
// animator is sent for that step (kimodo/wan.py card). Never his words copied back, never a separate "brief".
import assert from "node:assert/strict";
import { test } from "node:test";
import { createV1Animator, type Spawner, type V1LunaCall } from "./v1AnimatorCore.ts";
import { v1EngineConfig } from "./v1EngineCli.ts";
import { lunaInstructions, normalizeV1LunaTurn, readEngineWords, readLunaBook } from "./v1LunaBook.ts";
import { ANSWERS, fakeLuna, fakeSpawner, makeTestRoot, playEngineOk, until } from "./__fixtures__/v1TestRoot.ts";

test("a new animation's card = Sonnet's own sentence for every step, with its seconds; the colour and the project's frame rate always show", async () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  const raw = structuredClone(ANSWERS.create_jacks_flip_steps) as { kimodoSteps: { text: string; seconds: number; brief?: string }[]; colour?: string | null };
  raw.kimodoSteps.forEach((s, i) => { s.brief = `A PROMISE NOBODY SENT ${i}`; }); raw.colour = null;   // (a brief that says something else never reaches the card; he named no colour)
  ANSWERS.gate_is_order = raw;
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "gate_is_order");
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: fakeSpawner((c) => playEngineOk(c.args)).spawn as Spawner, gate: true });
  const out = await animator.turn({ ownerId: "o", projectId: "p", animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [], projectFps: 12 });
  assert.ok(out.ok && out.gate && !out.started, JSON.stringify(out));
  const steps = out.ok ? out.turn.kimodoSteps! : [], lines = out.ok ? out.gate!.lines : [];
  assert.deepEqual(lines, [...steps.map((s) => `${s.text.trim()} (${s.seconds} s)`), "12 fps"], "one line for every step that will be made: its own sentence, then its seconds");
  assert.ok(steps.length >= 2 && !lines.some((l) => /A PROMISE NOBODY SENT/.test(l)));
  assert.match(out.ok ? out.gate!.colour ?? "" : "", /^#[0-9a-f]{6}$/i, "the colour he will be is on the card even when he named none");
});

// (Nov 13, Arthur: Version 1 = WITH OBJECTS) the book says it ONCE: things are drawn; "not drawn" is only for a second figure, effects and backgrounds
test("the instructions are System B's: things are drawn, one capability list, no old 'draw it yourself' line for things", () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const book = readLunaBook(config.lunaBook), text = lunaInstructions(book, readEngineWords(config.engineBook));
  assert.doesNotMatch(text, /mime[sd]?\b|isn't drawn by the AI|NOT drawn by the animator|draw it on its own layer|he can draw it on its own layer|ONLY THE STICK FIGURE|VERSION 1 SCOPE/);
  assert.match(text, /THINGS ARE DRAWN, AND ONLY WHAT YOU NAME/);
  assert.match(text, /Everything that is not on CANNOT is YES/);
  assert.match(book.capability, /any things they use/);   // (Nov 14: as many stick figures as the user asks for)
  assert.ok(!book.capabilities.cannot.some((l) => /Two or more stick figures/.test(l)) && book.capabilities.can.some((l) => /as many as the user asks for/.test(l)) && !book.capabilities.cannot.some((l) => /^Effects/.test(l)) && book.capabilities.can.some((l) => /^Effects he asks for/.test(l)) && book.capabilities.cannot.some((l) => /^Backgrounds/.test(l)));   // (Nov 20 night, Arthur: magic is one of his tests - the effects he names are drawn, flat)
});

// (Nov 13, ONE operation: the animator's pictures are never redrawn) his colour is a free tint; a different line thickness or head is A NEW
// TAKE: the edit's card says so and shows a new animation's price - never an edit that is accepted and changes nothing
test("(Nov 22, Arthur: \"you can change the animation, but not how it looks\") a look or colour change of an animated thing is never run: he is told plainly", async () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) }), { book, words } = books();
  ANSWERS.look_hollow = { intent: "edit", say: "I'll give him a hollow head.", blocks: null, ops: [{ op: "style", style: { hollowHead: true, glow: null, pen: null }, removeGlow: null }] };
  ANSWERS.look_red = { intent: "edit", say: "I'll make him red.", blocks: null, ops: [{ op: "colour", colour: "#dc2626" }] };
  const { luna } = fakeLuna((r) => normalizeV1LunaTurn(r, words, book), "create_jacks_flip_steps", "look_hollow", "look_red");
  const animator = createV1Animator({ config: () => config, books, luna: luna as V1LunaCall, spawn: fakeSpawner((c) => playEngineOk(c.args)).spawn as Spawner, gate: true });
  const me = { ownerId: "o", projectId: "p" }, made = await animator.turn({ ...me, animationId: null, message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [] });
  assert.ok(made.ok && made.gate); const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok && go.animation); const id = go.ok && go.animation ? go.animation.animationId : "";
  await until(() => animator.get(me.ownerId, me.projectId, id)!.versions[0].status === "done");
  const hollow = await animator.turn({ ...me, animationId: id, message: "give him a hollow head", recentConversation: [] });
  assert.ok(hollow.ok && !hollow.gate && !hollow.started && /can't be changed/.test(hollow.turn.say), JSON.stringify(hollow).slice(0, 300));
  const red = await animator.turn({ ...me, animationId: id, message: "make him red", recentConversation: [] });
  assert.ok(red.ok && !red.gate && !red.started && /can't be changed/.test(red.turn.say), "a colour of an animated thing stays too");
  assert.equal(animator.get(me.ownerId, me.projectId, id)!.versions.length, 1, "nothing was made");
});

// (Nov 13) NO LENGTH CAPS on his words: a long sentence, a long piece, a long "not drawn" list are never refused, cut or dropped
test("(Nov 13) a very long story is read whole: 40 steps, a 5,000-letter sentence, 12 not-drawn things", () => {
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const book = readLunaBook(config.lunaBook), words = readEngineWords(config.engineBook);
  const moves = Array.from({ length: 40 }, (_, i) => `does move number ${i + 1} with a great deal of extra detail about exactly how he does it and why, ${"very ".repeat(12)}carefully`);
  const heard = moves.join(", then ") + ".";
  const raw = { ...(structuredClone(ANSWERS.create_jacks_flip_steps) as Record<string, unknown>), heard, blocks: [{ sentence: moves.map((m) => `A person ${m}.`).join(" "), parts: null }],
    kimodoSteps: moves.map((m) => ({ text: `A person ${m}.`, brief: m, seconds: 3, travels: false, airborne: false, changed: true })), askedDetails: moves.map((m, i) => ({ said: (i ? "then " : "") + m, step: i + 1 })),
    notDrawn: Array.from({ length: 12 }, (_, i) => `Thing ${i + 1}`) };
  const turn = normalizeV1LunaTurn(raw, words, book);
  assert.ok(turn && heard.length > 5000, "the answer is read, not refused for its length");
  assert.equal(turn!.kimodoSteps!.length, 40); assert.equal(turn!.heard, heard); assert.equal(turn!.notDrawn!.length, 12);
});

// (Nov 13, Arthur: "objects animated alone without a stick figure") the AI's noFigure reaches the plan the engine reads; the page is then
// fitted by everything that moves (never a still camera fitted by a first picture that is empty)
test("(Nov 13) things alone: noFigure goes from the AI's answer into the plan, and no still camera is set; with him in it, nothing changes", async () => {
  const { planFromCreate } = await import("./v1AnimatorCore.ts");
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const book = readLunaBook(config.lunaBook), words = readEngineWords(config.engineBook);
  const raw = { ...(structuredClone(ANSWERS.create_jacks_flip_steps) as Record<string, unknown>), noFigure: true };
  const alone = normalizeV1LunaTurn(raw, words, book), withHim = normalizeV1LunaTurn(ANSWERS.create_jacks_flip_steps, words, book);
  assert.ok(alone && alone.noFigure === true && withHim && withHim.noFigure === undefined);
  const a = planFromCreate(alone!, book, words, "a ball bounces"), b = planFromCreate(withHim!, book, words, "jumping jacks");
  assert.ok(a!.noFigure === true && a!.camera === undefined, JSON.stringify({ noFigure: a!.noFigure, camera: a!.camera }));
  assert.equal(b!.noFigure, undefined);
  assert.match(lunaInstructions(book, words), /NO STICK FIGURE/);
  assert.match(book.capability, /things moving on their own/);
});

// (Nov 13, live, twice: the card said "no stick figure" but the engine's plan had no such mark - he stood beside the ball. Root: the dev
// server's runner had been created before the code change and kept the old code - v1AnimatorServer.ts now says so in its log.)
// THE WHOLE APP CHAIN ($0), with the REAL Sonnet call code (generateV1SonnetTurn.ts: the request with its answer schema, the answer read
// and normalised) and a recorded answer in the shape Sonnet sends: the answer -> the gate card -> Animate -> the plan file the engine is
// started with. (The HTTP route around it only adds the login, credits and usage records, which a test must never write.)
test("(Nov 13) things alone, the real chain: Sonnet is ASKED for noFigure, its answer reaches the plan file the engine is started with, after the gate card and Animate", async () => {
  const { readFileSync } = await import("node:fs");
  const { createV1SonnetTurnGenerator, V1_SONNET_TOOL } = await import("../../anthropic/generateV1SonnetTurn.ts");
  const { readSonnetBrain } = await import("./v1LunaBook.ts");
  const { env } = makeTestRoot({ oneTake: true }), config = v1EngineConfig({ ...env, DIAMOND_ENGINE_ALLOW_KIMODO: "1" })!;
  const books = () => ({ book: readLunaBook(config.lunaBook), words: readEngineWords(config.engineBook) });
  // TEST FIXTURE (hand-written, labelled): the tool answer Sonnet sends for "A ball bounces." - never real model output
  const answer = { ...(structuredClone(ANSWERS.create_jacks_flip_steps) as Record<string, unknown>), noFigure: true, colour: null };
  const sent: { tools: { input_schema: { required: string[]; properties: Record<string, { type?: string }> } }[] }[] = [];
  const fetchSonnet = async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ id: "msg_fixture", model: "claude-sonnet-5-5", content: [{ type: "tool_use", name: V1_SONNET_TOOL, input: answer }], usage: { input_tokens: 10, output_tokens: 10 } }) }; };
  const ask = createV1SonnetTurnGenerator({ fetch: fetchSonnet as never, ledger: { read: () => ({ total: 0, calls: [] }), write: () => {} }, env: { ANTHROPIC_API_KEY: "test-not-a-key", CLAUDE_TEST_BUDGET_USD: "40" } });
  const luna: V1LunaCall = async (input) => { const out = await ask({ jobId: "j", turnId: "t", projectId: input.projectId, message: input.message, recentConversation: input.recentConversation, current: input.current ?? null, checkerSaid: null } as never,
    { ...books(), brain: readSonnetBrain(config.lunaBook, config.root, {}) }); return out.ok ? { ok: true, turn: out.turn } : { ok: false, failure: out.failure, detail: out.detail }; };
  const spawner = fakeSpawner((c) => playEngineOk(c.args));
  const animator = createV1Animator({ config: () => config, books, luna, spawn: spawner.spawn as Spawner, gate: true });
  const me = { ownerId: "o", projectId: "p" }, out = await animator.turn({ ...me, animationId: null, message: "A ball bounces.", recentConversation: [] });
  const schema = sent[0].tools[0].input_schema;
  assert.ok(schema.required.includes("noFigure") && schema.properties.noFigure.type === "boolean", "Sonnet is asked for noFigure on every answer: a plain true / false, never left out");
  assert.ok(out.ok && out.gate && !out.started && out.turn.noFigure === true, JSON.stringify(out).slice(0, 300));
  const go = animator.confirm(me.ownerId, me.projectId); assert.ok(go.ok && go.animation);
  await until(() => spawner.calls.length > 0);
  const plan = JSON.parse(readFileSync(spawner.calls[0].args[1], "utf8")) as { noFigure?: boolean; camera?: string };
  assert.equal(plan.noFigure, true, "the engine's plan file says: no stick figure");
  assert.equal(plan.camera, undefined, "and no still camera (it would be fitted by a first picture that is empty)");
});
