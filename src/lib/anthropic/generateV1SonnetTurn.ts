import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { AiAnimatorRequest, AiAnimatorUsage } from "../ai/aiAnimatorContract.ts";
import { lunaInstructions, lunaTurnContent, lunaTurnSchema, normalizeV1LunaTurn, resolveV1Effort, type SonnetBrain, type SonnetEffortBook, type V1EffortLevel, type V1ViewerRule } from "../ai/v1Animator/v1LunaBook.ts";
import type { V1LunaBooks, V1LunaRequest } from "../openai/generateV1LunaTurn.ts";
import type { V1KimodoStep, V1LunaTurn } from "../ai/v1Animator/v1AnimatorContract.ts";
import { partialSay } from "../ai/v1Animator/v1TurnLive.ts";
import {
  noUsageEventRecorder, projectDispatchedEvent, projectProviderObservedEvent, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";

// AI ANIMATOR VERSION 1: ONE chat turn written by SONNET (switch DIAMOND_V1_BRAIN=sonnet; default stays Luna, unchanged).
// The SAME book words (lunaInstructions), the SAME turn schema (lunaTurnSchema, given as the ONE tool's input_schema) and the
// SAME normaliser as Luna -> the same V1LunaTurn. The model, prices and ledger come from the book (brains.sonnet).
// Money: every call is booked into the SHARED Claude ledger the director uses (harness-phase4/review/claude-spend.json, {who, usd, ...});
// when total >= CLAUDE_TEST_BUDGET_USD - margin, NO call is made and the user gets plain words (failure "budget").
// The key comes ONLY from process.env.ANTHROPIC_API_KEY (no key file is ever read here). Tests pass a fake fetch ($0).

export const V1_SONNET_TOOL = "diamond_v1_turn";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const PRICING_VERSION = "book-brains-sonnet-v1";
const CACHE_WRITE_X = 2; // (prompt caching, 1-hour cache: a cache write costs 2 x input, a cache read 0.1 x input)
const CACHE_READ_X = 0.1;

type Env = Record<string, string | undefined>;
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown>; body?: ReadableStream<Uint8Array> | null; headers?: { get(name: string): string | null } }>;
// (Nov 17, Part 2: "his words appear as he writes them") what the turn tells the panel while it is still being written
export type V1SonnetLive = (patch: { say?: string; searching?: string[]; phase?: "thinking" | "searching" | "finalizing" }) => void;   // (Nov 22) phase = what he is really doing now
export type LedgerIO = { read(path: string): unknown; write(path: string, data: unknown): void };
export type V1SonnetBooks = V1LunaBooks & { brain: SonnetBrain; effort?: SonnetEffortBook | null }; // effort: the book's "effort" section (absent = low)
export type V1SonnetOutcome =
  | { ok: true; turn: V1LunaTurn; usage: AiAnimatorUsage; providerModel: string; responseId: string | null; latencyMs: number; promptDigest: string; effort?: V1EffortLevel }
  | { ok: false; failure: "unreachable" | "bad_answer" | "budget"; usage: AiAnimatorUsage | null; detail: string };

type Ledger = { total?: number; calls?: { who?: string; usd?: number }[]; [k: string]: unknown };
const fileLedger: LedgerIO = {
  read: (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null),
  write: (path, data) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(data, null, 1)); renameSync(tmp, path); },   // (Nov 7: the checker saved through the same .tmp name at the same moment - each writer its own)
};
const asLedger = (v: unknown): Ledger => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Ledger) : { total: 0, calls: [] });

type AnthropicUsage = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
export const sonnetCostUsd = (u: AnthropicUsage, brain: Pick<SonnetBrain, "priceIn" | "priceOut">) =>
  ((u.input_tokens ?? 0) * brain.priceIn + (u.cache_creation_input_tokens ?? 0) * brain.priceIn * CACHE_WRITE_X
    + (u.cache_read_input_tokens ?? 0) * brain.priceIn * CACHE_READ_X + (u.output_tokens ?? 0) * brain.priceOut) / 1_000_000;
/** (Dad, Nov 26) "The cold-cache rulebook load is never charged to a user": the cost as if the cache were warm (the tokens WRITTEN to
 *  the cache priced like a cache read). The real cost (sonnetCostUsd) is what we pay and what the ledger and the limits count. */
export const sonnetWarmCostUsd = (u: AnthropicUsage, brain: Pick<SonnetBrain, "priceIn" | "priceOut">) =>
  sonnetCostUsd({ ...u, cache_creation_input_tokens: 0, cache_read_input_tokens: (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) }, brain);

// (Dad, Nov 26) THE RULEBOOK CACHE (Sonnet's ~55,000-token book, kept 1 hour). Only ONE cold load at a time: when the cache is cold (or
// unknown) the first call loads it and calls starting at the same moment wait a few seconds for it (they then read it for a tenth of
// the price) - never long: after COLD_WAIT_MS they go anyway. Every call that wrote or read it keeps it warm for its hour.
export const COLD_WAIT_MS = 8_000;
const CACHE_LIFE_MS = 55 * 60 * 1000;   // (its life is 1 hour from the last use; a little margin)
type CacheState = { warmUntil: number; loading: Promise<void> | null; lastTouch: number };
const cacheHolder = globalThis as typeof globalThis & { diamondSonnetCache?: CacheState };
export const sonnetCacheState = (): CacheState => (cacheHolder.diamondSonnetCache ??= { warmUntil: 0, loading: null, lastTouch: 0 });
const noteCacheUse = (u: AnthropicUsage, now = Date.now()) => {
  if ((u.cache_creation_input_tokens ?? 0) > 0 || (u.cache_read_input_tokens ?? 0) > 0) { const c = sonnetCacheState(); c.warmUntil = now + CACHE_LIFE_MS; c.lastTouch = now; }
};
/** Before a call: wait (a few seconds at most) while another call is loading a cold cache. Returns a release function when THIS call
 *  is the one loading it (call it once the answer has started), else null. */
async function coldLoadTurn(now = Date.now()): Promise<(() => void) | null> {
  const c = sonnetCacheState();
  if (now < c.warmUntil) return null;
  if (c.loading) { await Promise.race([c.loading, new Promise((r) => setTimeout(r, COLD_WAIT_MS))]); return null; }
  let release!: () => void;
  const mine: Promise<void> = new Promise<void>((done) => { release = () => { if (c.loading === mine) c.loading = null; done(); }; });
  c.loading = mine;
  return release;
}

// The budget the director obeys: CLAUDE_TEST_BUDGET_USD (book default), minus the book's margin. null = there is room.
export function sonnetBudgetRefusal(ledger: unknown, brain: SonnetBrain, env: Env): string | null {
  const cap = Number(env.CLAUDE_TEST_BUDGET_USD ?? brain.budgetDefaultUsd);
  const total = Number(asLedger(ledger).total ?? 0);
  return Number.isFinite(cap) && total < cap - brain.budgetMarginUsd ? null : `the Claude test budget ($${cap}) is nearly used ($${total.toFixed(2)}): no AI call made`;
}

// book the money in the SHARED ledger (read again now, so the director's newer lines are kept)
function bookSpend(io: LedgerIO, brain: SonnetBrain, u: AnthropicUsage, usd: number, who: string = brain.ledgerWho) {
  try {
    const L = asLedger(io.read(brain.ledger));
    L.total = +(Number(L.total ?? 0) + usd).toFixed(4);
    (L.calls ??= []).push({ at: new Date().toISOString(), model: brain.model, usage: u, usd: +usd.toFixed(5), who } as never);
    io.write(brain.ledger, L);
  } catch { /* the call is made; a ledger write error must not lose the answer */ }
}

const usageIdentity = (request: Pick<V1LunaRequest, "jobId" | "turnId" | "message" | "recentConversation" | "projectId">): AiAnimatorRequest => ({
  jobId: request.jobId, turnId: request.turnId, message: request.message, reasoningLevel: "low", recentConversation: request.recentConversation,
  workspace: { projectId: request.projectId, projectTitle: "", projectGeneration: 0, totalLayers: 0, authoredFrameCount: 0, timelineFps: 0, activeTool: "" },
});

// (Nov 13, live: "I couldn't reach the AI Animator" about 6 times in a day, mostly on the first message after a server start - the log said
// only "fetch failed") A NETWORK ERROR = fetch itself threw, so no answer came back at all (an API error is an answer; the deadline is an
// abort): the same request is sent again quietly, twice at most, before the user is ever told. An abort is never tried again.
const NET_RETRIES = 2, NET_WAIT_MS = 400;
const quietRetry = (post: FetchLike): FetchLike => async (url, init) => {
  for (let left = NET_RETRIES; ; left -= 1) {
    try { return await post(url, init); } catch (error) {
      if (left <= 0 || init.signal?.aborted) throw error;
      await new Promise((r) => setTimeout(r, NET_WAIT_MS));
    }
  }
};
// what the network said, with its own reason (fetch's message is only "fetch failed": the reason is in its cause), for the server log
const netDetail = (error: unknown) => {
  const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
  return `${error instanceof Error ? error.message : "unreachable"}${cause ? ` (${cause.code ?? cause.message ?? "no reason given"})` : ""}`.slice(0, 300);
};

// (Nov 17, Part 2) THE STREAMED ANSWER: the provider sends the same answer in pieces (server-sent events). The pieces are put back
// together into exactly the message a plain call returns ({ id, model, content, usage, stop_reason }), so everything after it is
// unchanged; on the way, the say text written so far is reported. An answer that is not a stream (an error, a test) is read as before.
type Block = Record<string, unknown> & { type?: string; partial?: string };
async function readAnswer(res: Awaited<ReturnType<FetchLike>>, live: V1SonnetLive | null): Promise<Record<string, unknown>> {
  const streamed = live && res.ok && res.body && /event-stream/.test(res.headers?.get("content-type") ?? "");
  if (!streamed) return (await res.json()) as Record<string, unknown>;
  const msg: Record<string, unknown> = { content: [] as Block[] };
  const blocks = msg.content as Block[];
  const searching: string[] = [];
  let lastSay = "";
  const onEvent = (e: Record<string, unknown>) => {
    const i = Number(e.index);
    if (e.type === "message_start" && e.message && typeof e.message === "object") Object.assign(msg, e.message, { content: blocks });
    else if (e.type === "content_block_start") {
      blocks[i] = { ...(e.content_block as Block) };
      // (Nov 22, Arthur: "is he even doing any of that?") the panel says what he REALLY does, like the Help Assistant: thinking,
      // searching the web, or writing his answer (finalizing). Only reported; the answer itself is unchanged.
      const kind = blocks[i].type;
      if (kind === "thinking" || kind === "redacted_thinking") live!({ phase: "thinking" });
      else if (kind === "server_tool_use") live!({ phase: "searching" });
      else if (kind === "tool_use" || kind === "text") live!({ phase: "finalizing" });
    }
    else if (e.type === "content_block_delta" && blocks[i]) {
      const d = e.delta as Record<string, unknown>, b = blocks[i];
      if (d.type === "text_delta") b.text = `${b.text ?? ""}${d.text ?? ""}`;
      else if (d.type === "thinking_delta") b.thinking = `${b.thinking ?? ""}${d.thinking ?? ""}`;
      else if (d.type === "signature_delta") b.signature = `${b.signature ?? ""}${d.signature ?? ""}`;
      else if (d.type === "citations_delta") b.citations = [...((b.citations as unknown[]) ?? []), d.citation];
      else if (d.type === "input_json_delta") {
        b.partial = `${b.partial ?? ""}${d.partial_json ?? ""}`;
        if (b.type === "tool_use" && b.name === V1_SONNET_TOOL) { const say = partialSay(b.partial); if (say !== lastSay) { lastSay = say; live!({ say }); } }
      }
    } else if (e.type === "content_block_stop" && blocks[i]) {
      const b = blocks[i];
      if (typeof b.partial === "string") { try { b.input = b.partial ? JSON.parse(b.partial) : {}; } catch { b.input = {}; } delete b.partial; }
      if (b.type === "server_tool_use" && b.name === "web_search" && typeof (b.input as { query?: unknown })?.query === "string") { searching.push(String((b.input as { query: string }).query)); live!({ searching: [...searching] }); }
    } else if (e.type === "message_delta") {
      const d = (e.delta ?? {}) as Record<string, unknown>;
      if ("stop_reason" in d) msg.stop_reason = d.stop_reason;
      if (e.usage && typeof e.usage === "object") msg.usage = { ...((msg.usage as object) ?? {}), ...(e.usage as object) };
    } else if (e.type === "error") throw new Error(`stream error: ${JSON.stringify(e.error ?? e).slice(0, 200)}`);
  };
  const reader = res.body!.getReader(), text = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? text.decode() : text.decode(value, { stream: true });
    for (let cut = buf.indexOf("\n\n"); cut >= 0; cut = buf.indexOf("\n\n")) {
      const data = buf.slice(0, cut).split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      buf = buf.slice(cut + 2);
      if (data) onEvent(JSON.parse(data) as Record<string, unknown>);
    }
    if (done) break;
  }
  msg.content = blocks.filter(Boolean);
  return msg;
}

/** THE request body of a Sonnet plan turn - ONE builder, used by every real turn AND by the keep-warm check, so the cached part (tools,
 *  then the book's system text with its 1-hour cache mark) is byte for byte the same: the check really reads the cache the turns use. */
export function v1SonnetRequestBody(books: V1SonnetBooks, opts: { level: V1EffortLevel; plain: boolean; live: boolean; messages: unknown[]; maxTokens?: number; stream?: boolean }) {
  const { brain } = books;
  const tool = { name: V1_SONNET_TOOL, description: "Your whole answer for this turn: intent, say, and blocks or ops.", input_schema: lunaTurnSchema(books.words, books.book) };
  const system = lunaInstructions(books.book, books.words);
  // max_tokens = budget + the book's answer room (always > budget). Thinking tokens are output tokens: booked as today.
  const budget = opts.level === "low" || !books.effort ? 0 : books.effort.budgets[opts.level];
  // (Nov 8) Sonnet 5.5 always refuses a FORCED tool call (400), so every turn was asked twice; it is now asked once, the supported way
  // (auto + "call the tool") - byte for byte the request that answered every turn before
  // (Nov 14, Arthur: "he has to be able to search the internet ... only when he needs to ... it says exactly what he's searching") the
  // provider's own web search, used only when the story names something he does not know well enough to describe; what he searched is
  // said in his reply. A turn the provider pauses in the middle of a search is carried on from where it stopped (twice at most).
  const searchTool = { type: "web_search_20250305", name: "web_search", max_uses: 2 };
  return {
    model: brain.model,
    max_tokens: opts.maxTokens ?? (budget > 0 ? Math.max(brain.maxTokens, budget + books.effort!.answerTokens) : Math.max(brain.maxTokens, 8000)),
    // (Nov 14, found by a direct call: this model answers 400 to thinking.type "enabled" - "use thinking.type adaptive and
    // output_config.effort" - so EVERY medium / high turn was refused once and then asked again at low: Sonnet never thought at all,
    // and each message paid a wasted round trip) the thinking this model supports: adaptive, at the turn's own effort level
    // (Nov 19, Arthur: "Sonnet takes forever") a request with no effort runs this model at its DEFAULT, high: quick messages were thinking as hard as stories. Low is now said out loud
    ...(opts.plain || !books.effort ? {} : budget > 0 ? { thinking: { type: "adaptive" }, output_config: { effort: opts.level } } : { output_config: { effort: "low" } }),
    // the book's instructions are the same every turn: cached (a cache read costs a tenth); (Nov 8) kept 1 hour, not 5 minutes - the
    // first edit after a 6-minute make found the cache gone and paid the whole book again
    system: [{ type: "text", text: `${system}\n\nINTERNET SEARCH: use the web_search tool ONLY when the user's story names a thing you do not know well enough to say what it looks like (a new game item, a character, a real product, something from after your knowledge) - one or two short searches for how it LOOKS, then describe it in the step sentences from what you found, with its name kept. Never search for ordinary things or moves, and never to check yourself.\n\nAnswer ONLY by calling the ${V1_SONNET_TOOL} tool exactly once.`, cache_control: { type: "ephemeral", ttl: "1h" } }],
    // (Nov 2 final round) a canvas picture (when the turn has one) goes first as an image block: lunaTurnContent
    messages: opts.messages,
    tools: [opts.live ? { ...tool, eager_input_streaming: true } : tool, searchTool],   // (Nov 19) eager: his reply reaches the panel as it is written, not in one burst at the end
    tool_choice: { type: "auto" },
    ...((opts.stream ?? opts.live) ? { stream: true } : {}),   // (Nov 17) the same request, sent back in pieces (only when the panel is watching)
  };
}

export const createV1SonnetTurnGenerator = (deps: { fetch?: FetchLike; recorder?: UsageEventRecorder; ledger?: LedgerIO; env?: Env } = {}) =>
  async (request: V1LunaRequest, books: V1SonnetBooks, options: { signal?: AbortSignal; live?: V1SonnetLive | null } = {}): Promise<V1SonnetOutcome> => {
    const live = options.live ?? null;
    const env = deps.env ?? process.env;
    const io = deps.ledger ?? fileLedger;
    const post = quietRetry(deps.fetch ?? (fetch as unknown as FetchLike));
    const recorder = deps.recorder ?? noUsageEventRecorder;
    const meter = (event: Parameters<UsageEventRecorder>[0]) => { try { recorder({ ...event, provider: "anthropic" }); } catch { /* Best-effort observation only. */ } };
    const { brain } = books;
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, failure: "unreachable", usage: null, detail: "no key: ANTHROPIC_API_KEY is not set - no AI call made" };
    let refusal: string | null;
    try { refusal = sonnetBudgetRefusal(io.read(brain.ledger), brain, env); } catch (error) { refusal = `the Claude ledger could not be read: ${String(error).slice(0, 120)}`; }
    if (refusal) return { ok: false, failure: "budget", usage: null, detail: refusal };

    const identity = usageIdentity(request);
    const startedAt = performance.now();
    // (Nov 2 final round, owner) EFFORT: low = the plain call; medium / high = extended thinking with the book's budget.
    let level = resolveV1Effort(request.effort, request.message, books.effort ?? null, !request.current);
    let carried: unknown[] = [];
    let plain = false;   // (a model that refuses the effort setting is asked once without it)
    const call = () => post(API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
      body: JSON.stringify(v1SonnetRequestBody(books, { level, plain, live: Boolean(live), messages: [{ role: "user", content: lunaTurnContent(books.book, request) }, ...carried] })),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    let status = 0;
    let body: Record<string, unknown>;
    try {
      meter(projectDispatchedEvent(identity, Date.now(), brain.model));
      // (dad, Nov 26) only ONE cold load of the rulebook at a time: the others wait a few seconds and then read it
      const release = await coldLoadTurn();
      let res: Awaited<ReturnType<FetchLike>>;
      try { res = await call(); } finally { release?.(); }
      body = await readAnswer(res, live);
      // (effort) a model that refuses extended thinking is asked once more at low, so the turn never fails for it
      if (res.status === 400 && !plain && books.effort && /thinking|budget_tokens|output_config|effort/.test(JSON.stringify(body))) { level = "low"; plain = true; res = await call(); body = await readAnswer(res, live); }
      status = res.status;
      if (!res.ok) return { ok: false, failure: "unreachable", usage: null, detail: `API ${status}: ${JSON.stringify(body).slice(0, 300)}` };
      for (let more = 0; more < 2 && body.stop_reason === "pause_turn" && Array.isArray(body.content); more += 1) {
        const before = body; carried = [...carried, { role: "assistant", content: before.content }];
        res = await call(); body = await readAnswer(res, live); status = res.status;
        if (!res.ok) return { ok: false, failure: "unreachable", usage: null, detail: `API ${status}: ${JSON.stringify(body).slice(0, 300)}` };
        body.content = [...(before.content as unknown[]), ...(Array.isArray(body.content) ? body.content : [])];
        const a = (before.usage ?? {}) as Record<string, unknown>, b = (body.usage ?? {}) as Record<string, unknown>;   // (both halves are paid)
        body.usage = Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, typeof a[k] === "number" || typeof b[k] === "number" ? Number(a[k] ?? 0) + Number(b[k] ?? 0) : b[k] ?? a[k]]));
      }
    } catch (error) {
      return { ok: false, failure: "unreachable", usage: null, detail: netDetail(error) };
    }

    const u = (body.usage ?? {}) as AnthropicUsage;
    const searched = (Array.isArray(body.content) ? (body.content as { type?: string; name?: string; input?: { query?: unknown } }[]) : [])
      .filter((c) => c.type === "server_tool_use" && c.name === "web_search" && typeof c.input?.query === "string").map((c) => String(c.input!.query).trim()).filter(Boolean);
    const usd = sonnetCostUsd(u, brain) + 0.01 * searched.length;   // (the provider's price of a search: $10 per 1,000)
    const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const outputTokens = u.output_tokens ?? null;
    // (dad, Nov 26) warmCostUsd = what a user may be charged for this answer (never the cold rulebook load; searches included)
    const usage: AiAnimatorUsage = { inputTokens, outputTokens, totalTokens: outputTokens === null ? null : inputTokens + outputTokens, estimatedCostUsd: usd,
      warmCostUsd: sonnetWarmCostUsd(u, brain) + 0.01 * searched.length };
    bookSpend(io, brain, u, usd);
    noteCacheUse(u);
    const responseId = typeof body.id === "string" ? body.id : null;
    const returnedModel = typeof body.model === "string" ? body.model : null;
    meter(projectProviderObservedEvent(identity, { requestedModel: brain.model, returnedModel, responseId, usage, pricingVersion: PRICING_VERSION }));

    const content = Array.isArray(body.content) ? (body.content as { type?: string; name?: string; input?: unknown }[]) : [];
    const used = content.find((c) => c.type === "tool_use" && c.name === V1_SONNET_TOOL);
    if (!used) return { ok: false, failure: "bad_answer", usage, detail: "no tool call in the answer" };
    const turn = normalizeV1LunaTurn(used.input, books.words, books.book);
    if (!turn) return { ok: false, failure: "bad_answer", usage, detail: `the answer did not match the V1 turn contract: ${JSON.stringify(used.input).slice(0, 4000)}` };
    if (searched.length) turn.say = `${turn.say.trimEnd()}\n- Searched the internet: ${[...new Set(searched)].join("; ")}`;   // (what he looked up is always said)
    return {
      ok: true, turn, usage, providerModel: returnedModel ?? brain.model, responseId, effort: level,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      promptDigest: createHash("sha256").update(request.message).digest("hex"),
    };
  };

// (Nov 2, Arthur) chatting never stops: when the Claude test budget refuses a Sonnet turn (no call made), the SAME turn is answered by
// Luna instead (the same book, schema and V1LunaTurn shape), so the user never sees the budget words for chat. Any other Sonnet failure
// is said as before. (The director's own budget is not touched here.)
export async function sonnetTurnOrLuna<L extends { ok: boolean }>(
  sonnet: () => Promise<V1SonnetOutcome>, luna: () => Promise<L>,
): Promise<{ out: V1SonnetOutcome | L; brain: "sonnet" | "luna" }> {
  const first = await sonnet();
  if (!first.ok && first.failure === "budget") return { out: await luna(), brain: "luna" };
  return { out: first, brain: "sonnet" };
}

// (Nov 3 final part A, KEY 2) THE VIEWER: the SAME Sonnet (book brains.sonnet: model, budget, shared ledger, usage records) looks at a made take's
// viewer sheet (each move's PEAK picture, numbered) the way the chat sends a picture (an image block first, then the words) and answers with ONE
// forced tool: {shows_request, missing}. The instruction is the book's (viewer.instruction). Any failure = { ok: false } (the caller keeps the take).
export const V1_VIEWER_TOOL = "diamond_v1_viewer";
export type V1ViewerRequest = { jobId: string; turnId: string; projectId: string; sheet: { mediaType: "image/png"; data: string }; words: string; moves: string[]; steps?: V1KimodoStep[] };
export type V1ViewerOutcome = { ok: true; showsRequest: boolean; missing: string; fixedSteps: V1KimodoStep[] | null; usage: AiAnimatorUsage } | { ok: false; detail: string };
export const createV1SonnetViewer = (deps: { fetch?: FetchLike; recorder?: UsageEventRecorder; ledger?: LedgerIO; env?: Env } = {}) =>
  async (request: V1ViewerRequest, books: { brain: SonnetBrain; viewer: V1ViewerRule }, options: { signal?: AbortSignal } = {}): Promise<V1ViewerOutcome> => {
    const env = deps.env ?? process.env, io = deps.ledger ?? fileLedger, post = deps.fetch ?? (fetch as unknown as FetchLike);
    const meter = (event: Parameters<UsageEventRecorder>[0]) => { try { (deps.recorder ?? noUsageEventRecorder)({ ...event, provider: "anthropic" }); } catch { /* Best-effort observation only. */ } };
    const { brain, viewer } = books, key = env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, detail: "no key: ANTHROPIC_API_KEY is not set - no AI call made" };
    let refusal: string | null;
    try { refusal = sonnetBudgetRefusal(io.read(brain.ledger), brain, env); } catch (error) { refusal = `the Claude ledger could not be read: ${String(error).slice(0, 120)}`; }
    if (refusal) return { ok: false, detail: refusal };
    const identity = usageIdentity({ jobId: request.jobId, turnId: request.turnId, projectId: request.projectId, message: request.words, recentConversation: [] });
    const tool = { name: V1_VIEWER_TOOL, description: "Your verdict on the made animation.", input_schema: { type: "object", additionalProperties: false, required: ["shows_request", "missing"],
      properties: { shows_request: { type: "boolean" }, missing: { type: "string" },
        // (Nov 4 PM12, NO TELEPHONE) only when Kimodo steps were sent: the same steps with ONLY the missing move's step rewritten
        ...(request.steps?.length ? { fixed_steps: { type: ["array", "null"], items: { type: "object", additionalProperties: false, required: ["text", "seconds", "travels"],
          properties: { text: { type: "string" }, seconds: { type: "number" }, travels: { type: "boolean" } } } } } : {}) } } };
    const text = `The user's own words: ${request.words}\n\nThe moves the animator planned, in order:\n${request.moves.map((m, i) => `${i + 1}. ${m}`).join("\n") || "(not known)"}`
      + (request.steps?.length ? `\n\n${viewer.stepsFix}\nThe Kimodo steps that were sent, in order:\n${request.steps.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join("\n")}` : "");
    const call = (forced: boolean) => post(API_URL, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
      body: JSON.stringify({
        model: brain.model, max_tokens: brain.maxTokens,
        system: forced ? viewer.instruction : `${viewer.instruction}\n\nAnswer ONLY by calling the ${V1_VIEWER_TOOL} tool exactly once.`,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: request.sheet.mediaType, data: request.sheet.data } }, { type: "text", text }] }],
        tools: [tool], tool_choice: forced ? { type: "tool", name: V1_VIEWER_TOOL } : { type: "auto" },
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    let body: Record<string, unknown>;
    try {
      meter(projectDispatchedEvent(identity, Date.now(), brain.model));
      let res = await call(true);
      body = (await res.json()) as Record<string, unknown>;
      if (res.status === 400 && /tool_choice/.test(JSON.stringify(body))) { res = await call(false); body = (await res.json()) as Record<string, unknown>; }
      if (!res.ok) return { ok: false, detail: `API ${res.status}: ${JSON.stringify(body).slice(0, 300)}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message.slice(0, 300) : "unreachable" };
    }
    const u = (body.usage ?? {}) as AnthropicUsage, usd = sonnetCostUsd(u, brain);
    const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), outputTokens = u.output_tokens ?? null;
    const usage: AiAnimatorUsage = { inputTokens, outputTokens, totalTokens: outputTokens === null ? null : inputTokens + outputTokens, estimatedCostUsd: usd };
    bookSpend(io, brain, u, usd);
    meter(projectProviderObservedEvent(identity, { requestedModel: brain.model, returnedModel: typeof body.model === "string" ? body.model : null,
      responseId: typeof body.id === "string" ? body.id : null, usage, pricingVersion: PRICING_VERSION }));
    const used = (Array.isArray(body.content) ? (body.content as { type?: string; name?: string; input?: unknown }[]) : []).find((c) => c.type === "tool_use" && c.name === V1_VIEWER_TOOL);
    const answer = used?.input as { shows_request?: unknown; missing?: unknown; fixed_steps?: unknown } | undefined;
    if (!answer || typeof answer.shows_request !== "boolean") return { ok: false, detail: `no verdict in the answer: ${JSON.stringify(used?.input ?? null).slice(0, 300)}` };
    // (Nov 4 PM12) fixed steps are used only when they keep the same number of steps (only a step rewritten, never a move added or dropped)
    const fx = Array.isArray(answer.fixed_steps) ? answer.fixed_steps : null;
    const fixedSteps = fx && request.steps && fx.length === request.steps.length && fx.every((s) => s && typeof s === "object" && typeof (s as V1KimodoStep).text === "string" && (s as V1KimodoStep).text.trim() && typeof (s as V1KimodoStep).seconds === "number" && (s as V1KimodoStep).seconds > 0)
      ? fx.map((s) => ({ text: String((s as V1KimodoStep).text).trim(), seconds: (s as V1KimodoStep).seconds, travels: (s as V1KimodoStep).travels === true })) : null;
    return { ok: true, showsRequest: answer.shows_request, missing: typeof answer.missing === "string" ? answer.missing.trim().slice(0, 300) : "", fixedSteps, usage };
  };

// (Dad, Nov 26) THE KEEP-WARM CHECK: about every 55 minutes one tiny call sends exactly the cached part of a plan turn (the same builder,
// the same bytes), so the 1-hour cache never goes cold and nobody's first message pays the ~$0.35 rulebook load. Skipped when a real
// turn used the cache in the last 55 minutes. Booked in the same ledger as "keep-warm"; the Claude budget refusal applies; one line in
// the log per check. It never changes what Sonnet answers anyone: it is a separate call whose answer is thrown away.
export const KEEP_WARM_WHO = "keep-warm";
/** ONE switch: DIAMOND_SONNET_KEEP_WARM=off turns it off. It runs by itself only on the live server (DIAMOND_PUBLIC_ORIGIN set), or with
 *  DIAMOND_SONNET_KEEP_WARM=on - never on a copy by surprise. */
export const sonnetKeepWarmOn = (env: Env = process.env) => {
  const value = env.DIAMOND_SONNET_KEEP_WARM?.trim().toLowerCase();
  return value === "on" || (value !== "off" && Boolean(env.DIAMOND_PUBLIC_ORIGIN?.trim()));
};
export const KEEP_WARM_EVERY_MS = 55 * 60 * 1000;
export type KeepWarmResult = "skipped" | "hit" | "miss" | "budget" | "no-key" | "failed";
export async function sonnetKeepWarm(books: V1SonnetBooks, deps: { fetch?: FetchLike; ledger?: LedgerIO; env?: Env; now?: number; log?: (line: string) => void } = {}): Promise<KeepWarmResult> {
  const env = deps.env ?? process.env, io = deps.ledger ?? fileLedger, post = deps.fetch ?? (fetch as unknown as FetchLike), now = deps.now ?? Date.now();
  const log = deps.log ?? ((line: string) => console.info(line));
  const { brain } = books;
  const c = sonnetCacheState();
  // the last use of the cache: this process's own calls, else the ledger (after a restart)
  if (now - c.lastTouch >= KEEP_WARM_EVERY_MS) {
    try {
      const calls = asLedger(io.read(brain.ledger)).calls ?? [];
      for (let i = calls.length - 1; i >= 0 && i >= calls.length - 200; i -= 1) {
        const call = calls[i] as { who?: string; at?: string; usage?: AnthropicUsage };
        if (call.who !== brain.ledgerWho && call.who !== KEEP_WARM_WHO) continue;
        const at = Date.parse(String(call.at ?? ""));
        if (Number.isFinite(at) && ((call.usage?.cache_read_input_tokens ?? 0) > 0 || (call.usage?.cache_creation_input_tokens ?? 0) > 0)) { c.lastTouch = Math.max(c.lastTouch, at); break; }
      }
    } catch { /* unknown = check */ }
  }
  if (now - c.lastTouch < KEEP_WARM_EVERY_MS) { log(`[keep-warm] skipped: the cache was used ${Math.round((now - c.lastTouch) / 60000)} min ago`); return "skipped"; }
  const key = env.ANTHROPIC_API_KEY;
  if (!key) { log("[keep-warm] skipped: no key"); return "no-key"; }
  let refusal: string | null;
  try { refusal = sonnetBudgetRefusal(io.read(brain.ledger), brain, env); } catch { refusal = "the ledger could not be read"; }
  if (refusal) { log(`[keep-warm] skipped: ${refusal}`); return "budget"; }
  try {
    const res = await post(API_URL, {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json" },
      // the app's own live-turn request (that is how the panel asks), with a one-word message and the smallest answer the API allows
      body: JSON.stringify(v1SonnetRequestBody(books, { level: "low", plain: false, live: true, stream: false, maxTokens: 1, messages: [{ role: "user", content: "ok" }] })),
    });
    const body = (await res.json().catch(() => ({}))) as { usage?: AnthropicUsage };
    if (!res.ok) { log(`[keep-warm] failed: API ${res.status}`); return "failed"; }
    const u = body.usage ?? {};
    bookSpend(io, brain, u, sonnetCostUsd(u, brain), KEEP_WARM_WHO);
    noteCacheUse(u, now);
    const hit = (u.cache_read_input_tokens ?? 0) > 0;
    log(`[keep-warm] ${hit ? "hit" : "miss"}: read ${u.cache_read_input_tokens ?? 0}, wrote ${u.cache_creation_input_tokens ?? 0} tokens, $${sonnetCostUsd(u, brain).toFixed(4)}`);
    return hit ? "hit" : "miss";
  } catch (error) {
    log(`[keep-warm] failed: ${netDetail(error)}`);
    return "failed";
  }
}
