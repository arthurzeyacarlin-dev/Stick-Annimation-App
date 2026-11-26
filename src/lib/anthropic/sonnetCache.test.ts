// (Dad, Nov 26) Sonnet's rulebook cache: the cold load is never charged to a user, only ONE cold load at a time, and the keep-warm check.
// TEST FIXTURES ONLY: a pretend Anthropic API that keeps a pretend cache (the first request that reaches it writes the cached prefix, later
// ones with the SAME prefix bytes read it). $0, no AI call. Run: node --test src/lib/anthropic/sonnetCache.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import {
  COLD_WAIT_MS, createV1SonnetTurnGenerator, KEEP_WARM_EVERY_MS, KEEP_WARM_WHO, sonnetCacheState, sonnetCostUsd, sonnetKeepWarm, sonnetKeepWarmOn, sonnetWarmCostUsd,
  V1_SONNET_TOOL, v1SonnetRequestBody, type FetchLike, type LedgerIO,
} from "./generateV1SonnetTurn.ts";
import { readEngineWords, readLunaBook, readSonnetBrain } from "../ai/v1Animator/v1LunaBook.ts";
import { makeTestRoot } from "../ai/v1Animator/__fixtures__/v1TestRoot.ts";

const ANSWER = { intent: "conversation", say: "Hi! Tell me what he should do.", blocks: null, colour: null, ops: null };
const setup = () => {
  const { root, lx } = makeTestRoot();
  const bookPath = join(lx, "v1k", "luna-book.json");
  return { books: { book: readLunaBook(bookPath), words: readEngineWords(join(lx, "v1k", "passed_engine_book.json")), brain: readSonnetBrain(bookPath, root, {}) },
    env: { ANTHROPIC_API_KEY: "test-not-a-key", CLAUDE_TEST_BUDGET_USD: "40" } };
};
const memLedger = (start: unknown = { total: 0, calls: [] }) => {
  let data = JSON.parse(JSON.stringify(start));
  const io: LedgerIO = { read: () => JSON.parse(JSON.stringify(data)), write: (_p, d) => { data = d; } };
  return { io, data: () => data as { total: number; calls: { who: string; usd: number; usage: Record<string, number> }[] } };
};
/** The cached prefix of a request = its tools + system (the cache mark sits on the system text). */
const prefixOf = (body: Record<string, unknown>) => JSON.stringify({ tools: body.tools, system: body.system, model: body.model });
/** A pretend API with a pretend cache: a prefix becomes readable `ready` ms after the first request carrying it arrives. */
function cachingApi(opts: { ready?: number; delay?: number } = {}) {
  const cache = new Map<string, number>(), log: { kind: "write" | "read"; prefix: string; body: Record<string, unknown> }[] = [];
  const fetch: FetchLike = async (_url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>, prefix = prefixOf(body), now = Date.now();
    const at = cache.get(prefix);
    const read = at !== undefined && now >= at;
    if (at === undefined) cache.set(prefix, now + (opts.ready ?? 0));
    log.push({ kind: read ? "read" : "write", prefix, body });
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    const usage = read ? { input_tokens: 30, cache_read_input_tokens: 55000, output_tokens: 1 } : { input_tokens: 30, cache_creation_input_tokens: 55000, output_tokens: 1 };
    return { ok: true, status: 200, json: async () => ({ id: "msg", model: "claude-sonnet-5-5", content: [{ type: "tool_use", name: V1_SONNET_TOOL, input: ANSWER }], usage }) };
  };
  return { fetch, log };
};
const resetCache = () => { const c = sonnetCacheState(); c.warmUntil = 0; c.loading = null; c.lastTouch = 0; };
const ask = (turnId: string) => ({ jobId: turnId, turnId, projectId: "p", message: "hi", recentConversation: [], current: null, checkerSaid: null });

test("the cold rulebook load is never charged to a user: the warm cost prices the written cache like a read", () => {
  const { books } = setup();
  const cold = { input_tokens: 300, cache_creation_input_tokens: 55000, output_tokens: 6300 };
  const warm = { input_tokens: 300, cache_read_input_tokens: 55000, output_tokens: 6300 };
  assert.ok(sonnetCostUsd(cold, books.brain) > sonnetCostUsd(warm, books.brain) + 0.3, "a cold load costs us ~$0.33 more");
  assert.equal(sonnetWarmCostUsd(cold, books.brain), sonnetCostUsd(warm, books.brain));
  assert.equal(sonnetWarmCostUsd(warm, books.brain), sonnetCostUsd(warm, books.brain), "a warm answer is charged what it cost");
});

test("a real turn says both numbers: what we paid (estimatedCostUsd) and what a user may be charged (warmCostUsd)", async () => {
  resetCache();
  const { books, env } = setup();
  const { fetch } = cachingApi();
  const out = await createV1SonnetTurnGenerator({ fetch, ledger: memLedger().io, env })(ask("t1"), books);
  assert.ok(out.ok);
  assert.ok(out.ok && out.usage.estimatedCostUsd! > out.usage.warmCostUsd! + 0.3, "the first turn wrote the cache: we pay the load, the user never does");
});

test("only ONE cold load at a time: 3 turns at the same moment = 1 cache write + 2 cache reads (the others wait a few seconds)", async () => {
  resetCache();
  const { books, env } = setup();
  const { fetch, log } = cachingApi({ ready: 30, delay: 60 });
  const generate = createV1SonnetTurnGenerator({ fetch, ledger: memLedger().io, env });
  const outs = await Promise.all(["a", "b", "c"].map((id) => generate(ask(id), books)));
  assert.ok(outs.every((o) => o.ok));
  assert.deepEqual(log.map((l) => l.kind).sort(), ["read", "read", "write"]);
  // after that the cache is known warm: nobody waits
  const t0 = Date.now();
  await generate(ask("d"), books);
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(COLD_WAIT_MS <= 10_000, "nobody is ever held for long");
});

test("a turn never waits longer than a few seconds for someone else's cold load (then it goes anyway)", async () => {
  resetCache();
  const c = sonnetCacheState();
  c.loading = new Promise(() => undefined);   // a load that never finishes
  const { books, env } = setup();
  const { fetch } = cachingApi();
  const t0 = Date.now();
  const original = setTimeout;
  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms?: number) => original(fn, ms === COLD_WAIT_MS ? 50 : ms)) as typeof setTimeout;
  try { assert.ok((await createV1SonnetTurnGenerator({ fetch, ledger: memLedger().io, env })(ask("e"), books)).ok); }
  finally { (globalThis as { setTimeout: typeof setTimeout }).setTimeout = original; c.loading = null; }
  assert.ok(Date.now() - t0 < 2000);
});

test("keep-warm: the SAME cached prefix bytes as a real (live) turn, a 1-token answer, booked as 'keep-warm', and it READS the cache", async () => {
  resetCache();
  const { books, env } = setup();
  const api = cachingApi();
  const ledger = memLedger();
  // a real live turn first (that is how the app's panel asks): it writes the cache
  const live = () => undefined;
  assert.ok((await createV1SonnetTurnGenerator({ fetch: api.fetch, ledger: ledger.io, env })(ask("real"), books, { live })).ok);
  const realBody = api.log[0].body;
  assert.equal(api.log[0].kind, "write");
  // 56 minutes later, no other turn: the check sends the same prefix and hits
  const lines: string[] = [];
  const result = await sonnetKeepWarm(books, { fetch: api.fetch, ledger: ledger.io, env, now: Date.now() + KEEP_WARM_EVERY_MS + 60_000, log: (l) => lines.push(l) });
  assert.equal(result, "hit");
  const warmBody = api.log[1].body;
  assert.equal(prefixOf(warmBody), prefixOf(realBody), "byte for byte the cached part of the real turn");
  assert.equal(warmBody.max_tokens, 1);
  assert.notEqual(JSON.stringify(warmBody.messages), JSON.stringify(realBody.messages), "its own tiny message");
  const booked = ledger.data().calls.at(-1)!;
  assert.equal(booked.who, KEEP_WARM_WHO);
  assert.ok(booked.usd < 0.02, `about $0.017 a check (was $${booked.usd})`);
  assert.match(lines.join("\n"), /\[keep-warm\] hit: read 55000/);
  // the builder is the one the real turns use
  assert.equal(prefixOf(v1SonnetRequestBody(books, { level: "low", plain: false, live: true, messages: [] })), prefixOf(realBody));
});

test("keep-warm is skipped when a real turn used the cache in the last 55 minutes (also after a restart: from the ledger)", async () => {
  resetCache();
  const { books, env } = setup();
  const api = cachingApi();
  const now = Date.now();
  const recent = { total: 1, calls: [{ who: books.brain.ledgerWho, at: new Date(now - 20 * 60_000).toISOString(), usd: 0.04, usage: { cache_read_input_tokens: 55000 } }] };
  const lines: string[] = [];
  assert.equal(await sonnetKeepWarm(books, { fetch: api.fetch, ledger: memLedger(recent).io, env, now, log: (l) => lines.push(l) }), "skipped");
  assert.equal(api.log.length, 0, "no call made");
  assert.match(lines[0], /skipped: the cache was used 20 min ago/);
  // an hour after that turn: it checks
  resetCache();
  assert.equal(await sonnetKeepWarm(books, { fetch: api.fetch, ledger: memLedger(recent).io, env, now: now + 40 * 60_000, log: () => undefined }), "miss");
});

test("keep-warm respects the Claude budget refusal and needs a key (no call either way)", async () => {
  resetCache();
  const { books } = setup();
  const api = cachingApi();
  const full = { total: 1000, calls: [] };
  assert.equal(await sonnetKeepWarm(books, { fetch: api.fetch, ledger: memLedger(full).io, env: { ANTHROPIC_API_KEY: "k", CLAUDE_TEST_BUDGET_USD: "40" }, log: () => undefined }), "budget");
  assert.equal(await sonnetKeepWarm(books, { fetch: api.fetch, ledger: memLedger().io, env: {}, log: () => undefined }), "no-key");
  assert.equal(api.log.length, 0);
});

test("keep-warm has ONE switch: on by itself only on the live server, off with DIAMOND_SONNET_KEEP_WARM=off", () => {
  assert.equal(sonnetKeepWarmOn({}), false, "a copy on a Mac never calls by surprise");
  assert.equal(sonnetKeepWarmOn({ DIAMOND_PUBLIC_ORIGIN: "https://app.diamondanimator.com" }), true);
  assert.equal(sonnetKeepWarmOn({ DIAMOND_PUBLIC_ORIGIN: "https://app.diamondanimator.com", DIAMOND_SONNET_KEEP_WARM: "off" }), false);
  assert.equal(sonnetKeepWarmOn({ DIAMOND_SONNET_KEEP_WARM: "on" }), true);
});
