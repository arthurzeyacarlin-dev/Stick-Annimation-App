import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createV1SonnetTurnGenerator, sonnetCostUsd, V1_SONNET_TOOL, type FetchLike, type LedgerIO } from "./generateV1SonnetTurn.ts";
import { askFailedWords, isV1Effort, lunaInstructions, readEngineWords, readLunaBook, readSonnetBrain, readSonnetEffort, resolveV1Effort, v1Brain } from "../ai/v1Animator/v1LunaBook.ts";
import { engineEnv, v1EngineConfig } from "../ai/v1Animator/v1EngineCli.ts";
import { makeTestRoot } from "../ai/v1Animator/__fixtures__/v1TestRoot.ts";

// TEST FIXTURES ONLY (hand-written, labelled): fake Anthropic answers fed through the REAL normaliser. A fake fetch + an in-memory
// ledger: $0, no AI call, the real shared ledger file is never touched.
const FIXTURE = {
  _label: "TEST FIXTURES ONLY - hand-written Sonnet tool answers, never real model output",
  create_flip: { intent: "create", say: "I'll make him do a few jumping jacks and then a front flip.\n\nOnce it's on the canvas, you could make him blue or add a bow at the end.", blocks: [{ sentence: "A stick figure does a few jumping jacks and then a front flip." }], colour: null, ops: null },
  thanks: { intent: "conversation", say: "Thank you, that's really kind! I'm glad you like how he moves.\n\nWant to try adding a next part, like a big jump or a bow?", blocks: null, colour: null, ops: null },
  get_up_after_flip: { intent: "edit", say: "He already lands on his feet after the flip, so I'll have him turn around and do another front flip.\n\nAfter that you could make it a backflip instead.", blocks: null, colour: null, ops: [{ op: "append", sentence: "A stick figure turns around and does another front flip." }] },
};
const sentences = (say: string) => say.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;

const setup = (env: Record<string, string | undefined> = {}) => {
  const { root, lx } = makeTestRoot();
  const bookPath = join(lx, "v1k", "luna-book.json");
  const brain = readSonnetBrain(bookPath, root, {});
  return { root, books: { book: readLunaBook(bookPath), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")), brain }, env: { ANTHROPIC_API_KEY: "test-not-a-key", CLAUDE_TEST_BUDGET_USD: "40", ...env } };
};
const memLedger = (start: unknown) => {
  const files: Record<string, unknown> = {};
  const io: LedgerIO = { read: (p) => (p in files ? JSON.parse(JSON.stringify(files[p])) : start), write: (p, d) => { files[p] = d; } };
  return { io, files };
};
const fakeFetch = (input: unknown, sent: Record<string, unknown>[], extra: Record<string, unknown> = {}): FetchLike => async (_url, init) => {
  sent.push({ ...JSON.parse(init.body), headers: init.headers });
  return { ok: true, status: 200, json: async () => ({ id: "msg_fixture", model: "claude-sonnet-5-5", content: [{ type: "text", text: "ok" }, { type: "tool_use", name: V1_SONNET_TOOL, input }], usage: { input_tokens: 400, cache_read_input_tokens: 4000, output_tokens: 150 }, ...extra }) };
};
const request = { jobId: "j", turnId: "t", projectId: "p", message: "a stick figure does a few jumping jacks and then a front flip", recentConversation: [], current: null, checkerSaid: null };

test("Sonnet turn: ONE tool call (auto + 'call the tool') with the book's schema + instructions, parsed into the same V1LunaTurn, booked in the shared ledger", async () => {
  const { books, env } = setup();
  const sent: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const { io, files } = memLedger({ total: 10, calls: [{ who: "PM v10 director", usd: 10 }] });
  const out = await createV1SonnetTurnGenerator({ fetch: fakeFetch(FIXTURE.create_flip, sent), ledger: io, env, recorder: (e) => { events.push(e as never); return true; } })(request, books);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(out.turn, { intent: "create", say: FIXTURE.create_flip.say, blocks: FIXTURE.create_flip.blocks, colour: null });
  const body = sent[0] as { model: string; tool_choice: unknown; tools: { name: string; input_schema: unknown }[]; system: { text: string }[]; headers: Record<string, string> };
  assert.equal(body.model, "claude-sonnet-5-5", "the model comes from the book");
  assert.deepEqual(body.tool_choice, { type: "auto" }, "Sonnet 5.5 refuses a forced tool_choice (400): asked once, the supported way");
  assert.equal(sent.length, 1, "ONE request");
  assert.equal(body.tools.length, 2);   // (Nov 14) his answer tool + the provider's own web search
  assert.deepEqual(body.tools[1], { type: "web_search_20250305", name: "web_search", max_uses: 2 });
  assert.match(JSON.stringify(body.tools[0].input_schema), /"rewrite"/);
  assert.ok(body.system[0].text.startsWith(`${lunaInstructions(books.book, books.words)}\n\nINTERNET SEARCH: `) && body.system[0].text.endsWith(`\n\nAnswer ONLY by calling the ${V1_SONNET_TOOL} tool exactly once.`), "the same instructions as Luna + when to search + 'call the tool'");
  assert.equal(body.headers["x-api-key"], "test-not-a-key");
  assert.ok(body.headers["anthropic-version"]);
  const ledger = files[books.brain.ledger] as { total: number; calls: { who: string; usd: number }[] };
  const usd = sonnetCostUsd({ input_tokens: 400, cache_read_input_tokens: 4000, output_tokens: 150 }, books.brain);
  assert.equal(ledger.calls.length, 2, "the director's lines are kept");
  assert.equal(ledger.calls[1].who, books.brain.ledgerWho);
  assert.ok(Math.abs(ledger.total - (10 + usd)) < 1e-3);
  assert.ok(events.length === 2 && events.every((e) => e.provider === "anthropic"), "dispatched + provider-observed, as Anthropic");
});

test("budget used up -> NO call, plain words; no key -> no call", async () => {
  const { books, env } = setup({ CLAUDE_TEST_BUDGET_USD: "25" });
  const sent: Record<string, unknown>[] = [];
  const { io } = memLedger({ total: 24.6, calls: [] });
  const out = await createV1SonnetTurnGenerator({ fetch: fakeFetch(FIXTURE.thanks, sent), ledger: io, env })(request, books);
  assert.equal(out.ok, false);
  assert.equal(sent.length, 0, "never calls when the budget is used up");
  if (!out.ok) assert.equal(out.failure, "budget");
  assert.match(askFailedWords(books.book, "budget"), /budget is used up/);
  const noKey = await createV1SonnetTurnGenerator({ fetch: fakeFetch(FIXTURE.thanks, sent), ledger: memLedger({ total: 0 }).io, env: {} })(request, books);
  assert.ok(!noKey.ok && sent.length === 0);
});

test("never a forced tool call (Sonnet 5.5 refuses it): asked ONCE with auto; a missing tool call is a bad answer", async () => {
  const { books, env } = setup();
  const sent: string[] = [];
  const once: FetchLike = async (_u, init) => {
    sent.push(JSON.parse(init.body).tool_choice.type);
    return { ok: true, status: 200, json: async () => ({ model: "claude-sonnet-5-5", content: [{ type: "tool_use", name: V1_SONNET_TOOL, input: FIXTURE.thanks }], usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
  const out = await createV1SonnetTurnGenerator({ fetch: once, ledger: memLedger({ total: 0 }).io, env })(request, books);
  assert.deepEqual(sent, ["auto"]);
  assert.ok(out.ok && out.turn.intent === "conversation");
  const none: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "hi" }], usage: {} }) });
  const bad = await createV1SonnetTurnGenerator({ fetch: none, ledger: memLedger({ total: 0 }).io, env })(request, books);
  assert.ok(!bad.ok && bad.failure === "bad_answer");
});

test("pro-chat replies: the labelled fixture answers are 2-3 short paragraphs split by a blank line; the book asks for that, for both brains", () => {
  const { books } = setup();
  for (const a of [FIXTURE.create_flip, FIXTURE.thanks, FIXTURE.get_up_after_flip]) {
    const paragraphs = a.say.split(/\n\s*\n/);
    assert.ok(paragraphs.length >= 2 && paragraphs.length <= 3, `${paragraphs.length} paragraphs: ${a.say}`);
    assert.ok(paragraphs.every((p) => sentences(p) >= 1 && sentences(p) <= 2), `1-2 sentences per paragraph: ${a.say}`);
    assert.doesNotMatch(a.say, /\*\*|^#|^\s*[-*] /m, "no markdown");
  }
  const text = lunaInstructions(books.book, books.words);
  assert.match(text, /2 short PARAGRAPHS \(3 at most\), separated by ONE blank line/);
  assert.match(text, /Never suggest extra ideas/); // (Nov 2 eve, Fable audit: no unasked suggestions)
  assert.match(text, /no markdown/);
  assert.match(text, /thanks or a compliment gets a warm short paragraph, then a blank line/);
});

test("too literal: the end-state rule + the get-up example are in the instructions", () => {
  const { books } = setup();
  const text = lunaInstructions(books.book, books.words);
  assert.match(text, /Read where his body IS at the END of the current blocks/);
  assert.match(text, /never write a fall or any other extra move/);
  assert.match(text, /get up, turn around, do another front flip/);
  assert.ok(text.includes("A stick figure turns around and does another front flip."));
});

test("switch: default luna; sonnet -> the director gets the SAME book model (paid runs only)", () => {
  const { env } = makeTestRoot();
  assert.equal(v1Brain({}), "luna");
  assert.equal(v1Brain({ DIAMOND_V1_BRAIN: "sonnet" }), "sonnet");
  const luna = v1EngineConfig(env)!;
  assert.equal(luna.directorModel, null);
  assert.equal(engineEnv({ ...luna, cacheOnly: false }, { DIRECTOR_MODEL: "x" }).DIRECTOR_MODEL, "x", "luna = unchanged");
  const sonnet = v1EngineConfig({ ...env, DIAMOND_V1_BRAIN: "sonnet" })!;
  assert.equal(sonnet.directorModel, "claude-sonnet-5-5");
  assert.equal(engineEnv({ ...sonnet, cacheOnly: false }, {}).DIRECTOR_MODEL, "claude-sonnet-5-5");
  assert.equal(engineEnv(sonnet, {}).DIRECTOR_MODEL, undefined, "cache-only keeps the cached plans");
  assert.equal(v1EngineConfig({ ...env, DIAMOND_V1_BRAIN: "sonnet", DIAMOND_V1_SONNET_MODEL: "claude-sonnet-x" })!.directorModel, "claude-sonnet-x");
});

// (Nov 2 final round, owner) EFFORT: the request body per level. TEST FIXTURES ONLY (fake fetch, $0, no AI call).
test("effort: low = the plain call (auto + 'call the tool'); medium / high = extended thinking (book budgets) + the same", async () => {
  const { root, books, env } = setup();
  const effort = readSonnetEffort(join(root, "ltx-effects", "v1k", "luna-book.json"));
  assert.ok(effort, "the book has the effort section");
  const bodyFor = async (level: "low" | "medium" | "high" | undefined, withBook = true) => {
    const sent: Record<string, unknown>[] = [];
    const out = await createV1SonnetTurnGenerator({ fetch: fakeFetch(FIXTURE.create_flip, sent), ledger: memLedger({ total: 0 }).io, env })({ ...request, ...(level ? { effort: level } : {}) }, { ...books, ...(withBook ? { effort } : {}) });
    assert.equal(out.ok, true);
    return sent[0] as { max_tokens: number; thinking?: { type: string }; output_config?: { effort: string }; tool_choice: unknown; system: { text: string }[] };
  };
  const today = await bodyFor(undefined, false);
  for (const low of [await bodyFor("low"), await bodyFor(undefined)]) {
    const { output_config, ...rest } = low;
    assert.deepEqual(rest, today, "low (or no level sent) = the plain request");
    assert.deepEqual(output_config, { effort: "low" }, "(Nov 19) low is said out loud: with no effort this model runs at high");
    assert.equal(low.thinking, undefined);
    assert.deepEqual(low.tool_choice, { type: "auto" });
    assert.equal(low.max_tokens, Math.max(books.brain.maxTokens, 8000));
  }
  for (const level of ["medium", "high"] as const) {
    const b = await bodyFor(level);
    assert.deepEqual(b.thinking, { type: "adaptive" }, `${level}: the thinking this model supports`); assert.deepEqual(b.output_config, { effort: level }, `${level}: at the turn's own effort`);
    assert.deepEqual(b.tool_choice, { type: "auto" });
    assert.match(b.system[0].text, new RegExp(`Answer ONLY by calling the ${V1_SONNET_TOOL} tool exactly once\\.$`));
    assert.ok(b.max_tokens > effort!.budgets[level], "max_tokens > budget");
  }
  assert.ok(effort!.budgets.high > effort!.budgets.medium && effort!.budgets.low === 0);
  // the same level asked with no book section = low (today's call)
  assert.deepEqual(await bodyFor("high", false), today);
});

test("effort: AUTO is picked by the server with the book's rule; a model that refuses thinking is asked once at low", async () => {
  const { root, books, env } = setup();
  const rule = readSonnetEffort(join(root, "ltx-effects", "v1k", "luna-book.json"));
  assert.equal(resolveV1Effort("auto", "make him run, jump over a wall, then flip and finally bow", rule), "high", "several actions");
  assert.equal(resolveV1Effort("auto", "a short story about a stick figure in the park", rule), "high", "a story");
  assert.equal(resolveV1Effort("auto", "what can you make?", rule), "low", "a question");
  assert.equal(resolveV1Effort("auto", "undo", rule), "low", "a $0 op");
  assert.equal(resolveV1Effort("auto", "make him blue", rule), "low", "a colour op");
  assert.equal(resolveV1Effort("auto", "a stick figure does a backflip", rule), "medium", "one action = normal animating");
  assert.equal(resolveV1Effort("medium", "undo", rule), "medium", "a chosen level is kept");
  assert.equal(resolveV1Effort("auto", "anything", null), "low", "no book section = low");
  assert.ok(isV1Effort("auto") && !isV1Effort("max") && !isV1Effort(3));
  // auto with several actions -> thinking on in the body
  const sent: Record<string, unknown>[] = [];
  await createV1SonnetTurnGenerator({ fetch: fakeFetch(FIXTURE.create_flip, sent), ledger: memLedger({ total: 0 }).io, env })({ ...request, message: "make him run, jump, then flip and finally bow", effort: "auto" }, { ...books, effort: rule });
  assert.deepEqual((sent[0] as { thinking?: { type: string }; output_config?: { effort: string } }).output_config, { effort: rule!.auto.highLevel });
  // thinking refused (400) -> asked once more at low = the plain call
  const asked: Record<string, unknown>[] = [];
  let n = 0;
  const refuse: FetchLike = async (url, init) => {
    n += 1;
    if (n === 1) { asked.push(JSON.parse(init.body)); return { ok: false, status: 400, json: async () => ({ type: "error", error: { type: "invalid_request_error", message: "thinking is not supported for this model" } }) }; }
    return fakeFetch(FIXTURE.create_flip, asked)(url, init);
  };
  const out = await createV1SonnetTurnGenerator({ fetch: refuse, ledger: memLedger({ total: 0 }).io, env })({ ...request, effort: "high" }, { ...books, effort: rule });
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.effort, "low");
  assert.equal(asked.length, 2);
  assert.ok(asked[0].thinking && !asked[1].thinking);
  assert.deepEqual(asked[1].tool_choice, { type: "auto" });
});

// (Nov 13, live: "I couldn't reach the AI Animator" on the first message after a server start - the log said only "fetch failed")
test("a network error is tried again quietly: fetch throws once, then answers = ONE good turn, booked once; it gives up after 3 tries with the network's own reason; an abort is never tried again", async () => {
  const { books, env } = setup();
  const netError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  const failing = (times: number, sent: Record<string, unknown>[], tries: { n: number }): FetchLike => async (url, init) => {
    tries.n += 1;
    if (tries.n <= times) throw netError();
    return fakeFetch(FIXTURE.thanks, sent)(url, init);
  };
  // once, then fine: the user never hears of it
  const sent: Record<string, unknown>[] = [], tries = { n: 0 }, events: Record<string, unknown>[] = [];
  const { io, files } = memLedger({ total: 0, calls: [] });
  const out = await createV1SonnetTurnGenerator({ fetch: failing(1, sent, tries), ledger: io, env, recorder: (e) => { events.push(e as never); return true; } })(request, books);
  assert.ok(out.ok, "the turn is answered");
  assert.equal(tries.n, 2, "sent again once");
  assert.equal(sent.length, 1, "one request was answered");
  assert.equal((Object.values(files)[0] as { calls: unknown[] }).calls.length, 1, "booked once in the ledger");
  assert.equal(events.filter((e) => e.stage === "dispatched").length, 1, "one usage record for the turn");
  // the network stays down: 3 tries, then the honest failure, with the reason the network gave
  const down = { n: 0 };
  const off = await createV1SonnetTurnGenerator({ fetch: failing(99, [], down), ledger: memLedger({ total: 0, calls: [] }).io, env })(request, books);
  assert.ok(!off.ok && off.failure === "unreachable");
  assert.equal(down.n, 3);
  if (!off.ok) assert.match(off.detail, /fetch failed \(ECONNRESET\)/);
  // the deadline (an abort) is never tried again
  const stopped = { n: 0 }, abort = new AbortController(); abort.abort();
  const late = await createV1SonnetTurnGenerator({ fetch: failing(99, [], stopped), ledger: memLedger({ total: 0, calls: [] }).io, env })(request, books, { signal: abort.signal });
  assert.ok(!late.ok);
  assert.equal(stopped.n, 1);
});

// (Nov 17, Part 2) THE STREAMED ANSWER ($0, a hand-written fake stream): with a live reporter the same request asks for a stream; the pieces
// make exactly the turn a plain answer makes, and his say text is reported as it is written. Without a reporter: no stream (as before).
test("streamed answer: the same turn as a plain answer; say reported as it is written; a search is reported", async () => {
  const { books, env } = setup();
  const sent: Record<string, unknown>[] = [];
  const json = JSON.stringify(FIXTURE.create_flip);
  const pieces = [json.slice(0, 20), json.slice(20, 41), json.slice(41, 90), json.slice(90)];   // (cut anywhere, escapes included)
  const events = [
    { type: "message_start", message: { id: "msg_stream", model: "claude-sonnet-5-5", content: [], usage: { input_tokens: 400, cache_read_input_tokens: 4000, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "FIXTURE thought" } },
    { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "s1", name: "web_search", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"query\":\"FIXTURE jumping" } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: " jacks\"}" } },
    { type: "content_block_stop", index: 1 },
    { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "t1", name: V1_SONNET_TOOL, input: {} } },
    ...pieces.map((p) => ({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: p } })),
    { type: "content_block_stop", index: 2 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 150 } },
    { type: "message_stop" },
  ];
  const sse = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const bytes = new TextEncoder().encode(sse);
  const streamFetch: FetchLike = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    let at = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (at >= bytes.length) { c.close(); return; } c.enqueue(bytes.slice(at, at + 37)); at += 37; } });   // (small pieces)
    return { ok: true, status: 200, headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/event-stream; charset=utf-8" : null) }, body, json: async () => { throw new Error("a stream has no json"); } };
  };
  const says: string[] = [], searches: string[][] = [];
  const out = await createV1SonnetTurnGenerator({ fetch: streamFetch, ledger: memLedger({ total: 0 }).io, env })(request, books, { live: (p) => { if (p.say !== undefined) says.push(p.say); if (p.searching) searches.push(p.searching); } });
  assert.equal(sent[0].stream, true, "a stream is asked only when someone watches");
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.turn.say, `${FIXTURE.create_flip.say}\n- Searched the internet: FIXTURE jumping jacks`, "the same turn as a plain answer (and the search said, as before)");
  assert.deepEqual(out.turn.blocks, FIXTURE.create_flip.blocks);
  assert.equal(out.usage.outputTokens, 150, "usage = the stream's final numbers");
  assert.ok(says.length >= 2 && says.at(-1) === FIXTURE.create_flip.say && says.every((s, i) => i === 0 || s.startsWith(says[i - 1])), "say grows piece by piece to the whole say");
  assert.deepEqual(searches.at(-1), ["FIXTURE jumping jacks"]);
  const plain: Record<string, unknown>[] = [];
  await createV1SonnetTurnGenerator({ fetch: fakeFetch(FIXTURE.thanks, plain), ledger: memLedger({ total: 0 }).io, env })(request, books);
  assert.equal("stream" in plain[0], false, "nobody watching = the request exactly as before");
});
