import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type OpenAI from "openai";
import { ASSISTANT_SEARCH_LIMITS, validateProviderResult, validateSearchReceipt } from "../../src/lib/assistant/assistantContracts.ts";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { buildAssistantResponseRequest, createAssistantProvider, type AssistantResponseRequest } from "../../src/lib/assistant/assistantProvider.ts";
import { decideAssistantSearch } from "../../src/lib/assistant/assistantSearchPolicy.ts";
import { fixtureRequest, fixtureResult } from "./phase2Fixtures.ts";
import { responseFixture, searchProviderResult, searchRequest, youtubeAnswer, youtubePrompt, youtubeSource } from "./phase4Fixtures.ts";

const output = resolve("output/spec-0012/phase-4/oracle"); mkdirSync(output, { recursive: true });
const assertions: string[] = []; const check = (value: unknown, label: string) => { assert.ok(value, label); assertions.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions.push(label); };
const wait = (ms: number) => new Promise(resolveWait => setTimeout(resolveWait, ms));

equal(decideAssistantSearch(fixtureRequest({ message: "Hi, who are you?" })).mode, "local", "greeting stays local");
equal(decideAssistantSearch(fixtureRequest({ message: "Where do I export my animation?" })).mode, "local", "internal export guidance stays local");
equal(decideAssistantSearch(fixtureRequest({ message: "How does squash and stretch help animation?" })).mode, "local", "stable animation education stays local");
equal(decideAssistantSearch(fixtureRequest({ message: "Can the Assistant search the web?" })).mode, "local", "a capability question is answered locally without using search");
const required = decideAssistantSearch(searchRequest());
equal(required, { mode: "required", topic: "current YouTube Shorts requirements", publicQuery: youtubePrompt }, "implicit current YouTube prompt deterministically requires search");
equal(decideAssistantSearch(fixtureRequest({ message: "What is the maximum YouTube Shorts length?" })).mode, "required", "public platform fact requires search without the word search");
equal(decideAssistantSearch(fixtureRequest({ message: "Compare current YouTube, Instagram, and Reddit video rules" })).topic, "current YouTube, Instagram, and Reddit information", "visible search topic truthfully names every platform in a multi-platform request");
assert.throws(() => decideAssistantSearch(fixtureRequest({ message: "Search my localhost project at http://127.0.0.1:3000/private" })), /private or local data/i); assertions.push("private/local search projection is rejected");
const mediaDecision = decideAssistantSearch(fixtureRequest({ message: "What are the current requirements discussed at https://youtube.com/watch?v=public-video?" }));
equal(mediaDecision.mode, "required", "public YouTube URL routes to indexed-text search without media access");
check(mediaDecision.publicQuery === "What are the current requirements discussed at youtube.com", "public URL projection strips its path and query before provider transport");

const localBody = buildAssistantResponseRequest(fixtureRequest({ message: "Hi, who are you?" })).body;
equal(localBody.tools, [], "local request serializes an empty tools list"); equal(localBody.store, false, "local request disables provider storage");
check(!Object.hasOwn(localBody, "max_tool_calls"), "local request omits max_tool_calls instead of serializing zero");
const searchBody = buildAssistantResponseRequest(searchRequest()).body;
equal(searchBody.tools, [{ type: "web_search", search_context_size: "low" }], "search request offers only current hosted web_search");
equal(searchBody.tool_choice, "required", "eligible current public question forces a tool call"); equal(searchBody.max_tool_calls, 2, "search caps built-in calls at two");
equal(searchBody.include, ["web_search_call.action.sources"], "search captures official action source metadata"); equal(searchBody.parallel_tool_calls, false, "parallel tool calls are disabled");
equal(searchBody.store, false, "search request disables provider storage");
check(typeof searchBody.instructions === "string" && searchBody.instructions.includes("untrusted content") && /claim to have watched/.test(searchBody.instructions), "search instructions preserve prompt-injection and inaccessible-media boundaries");

const ceilingReceipt = { topic: "current public information", toolCalls: 2, processedSourceCount: 8, actions: [{ type: "search" as const, queries: ["a".repeat(256), "b".repeat(256)] }, { type: "open_page" as const, url: "https://example.com/page" }], sources: Array.from({ length: 6 }, (_, index) => ({ title: `Source ${index + 1}`, url: `https://example.com/${index + 1}` })) };
validateSearchReceipt(ceilingReceipt); assertions.push("two-tool/eight-processed/six-displayed/512-query ceilings accept their exact boundary");
assert.throws(() => validateSearchReceipt({ ...ceilingReceipt, sources: [...ceilingReceipt.sources, { title: "Source 7", url: "https://example.com/7" }] })); assertions.push("seventh displayed source fails closed");
assert.throws(() => validateSearchReceipt({ ...ceilingReceipt, actions: [{ type: "search", queries: ["q".repeat(513)] }, ceilingReceipt.actions[1]] })); assertions.push("513th query character fails closed");

function streamFactory(response: OpenAI.Responses.Response, search: boolean, captured: AssistantResponseRequest[]) {
  return () => ({ create: async (body: AssistantResponseRequest) => {
    captured.push(structuredClone(body));
    return { async *[Symbol.asyncIterator]() {
      if (search) {
        yield { type: "response.output_item.added", item: response.output[0], output_index: 0, sequence_number: 0 } as OpenAI.Responses.ResponseStreamEvent;
        yield { type: "response.web_search_call.in_progress", item_id: "search_call_0", output_index: 0, sequence_number: 1 } as OpenAI.Responses.ResponseStreamEvent;
        yield { type: "response.web_search_call.searching", item_id: "search_call_0", output_index: 0, sequence_number: 2 } as OpenAI.Responses.ResponseStreamEvent;
        yield { type: "response.web_search_call.completed", item_id: "search_call_0", output_index: 0, sequence_number: 3 } as OpenAI.Responses.ResponseStreamEvent;
      }
      yield { type: "response.output_text.delta", content_index: 0, delta: "{", item_id: "message_fixture", logprobs: [], output_index: search ? 1 : 0, sequence_number: 4 } as OpenAI.Responses.ResponseStreamEvent;
      yield { type: "response.completed", response, sequence_number: 5 } as OpenAI.Responses.ResponseStreamEvent;
    } };
  } });
}

const originalKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "phase4-fixture-key";
try {
  const searchCaptured: AssistantResponseRequest[] = []; const activities: unknown[] = []; const fixture = responseFixture();
  const searchProvider = createAssistantProvider(streamFactory(fixture.response, true, searchCaptured));
  const searchResult = await searchProvider(searchRequest(), { signal: new AbortController().signal, onActivity: activity => activities.push(activity) });
  validateProviderResult(searchResult); equal(searchResult.reply.answer, youtubeAnswer, "search provider returns the cited answer");
  equal(searchResult.usage.toolCalls, 1, "actual completed web call is recorded in usage"); equal(searchResult.search?.processedSourceCount, 1, "actual source metadata is captured");
  equal(activities, [{ type: "search-start", topic: "current YouTube Shorts requirements" }, { type: "search-end" }, { type: "finalizing" }], "real stream events drive truthful search and output-finalizing activity");
  equal(searchCaptured.length, 1, "one eligible attempt creates exactly one Responses request");

  const localRaw = JSON.stringify({ answer: "I’m Diamond Animator’s guidance Assistant. I can explain the app without seeing or changing your projects.", title: "Meet the Assistant" });
  const localResponse = { ...fixture.response, output: [{ id: "message_local", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: localRaw, annotations: [] }] }], usage: { ...fixture.response.usage, input_tokens: 200, output_tokens: 100, total_tokens: 300 } } as unknown as OpenAI.Responses.Response;
  const localCaptured: AssistantResponseRequest[] = []; const localProvider = createAssistantProvider(streamFactory(localResponse, false, localCaptured));
  const localResult = await localProvider(fixtureRequest({ message: "Hi, who are you?" }), { signal: new AbortController().signal });
  equal(localResult.usage.toolCalls, 0, "local provider result records zero tools"); check(!localResult.search && !localResult.reply.citations, "local provider result has no search metadata or citations");
  check(!Object.hasOwn(localCaptured[0], "max_tool_calls"), "transport receives no local max_tool_calls property");

  for (const [label, malformed] of [
    ["missing citations", responseFixture({ annotations: false })],
    ["forged citation", responseFixture({ sourceUrl: "https://example.com/forged" })],
    ["private citation", responseFixture({ sourceUrl: "https://localhost/private" })],
    ["unsupported media claim", responseFixture({ answer: "I watched the YouTube video and confirmed the current requirement." })],
    ["too many tool calls", responseFixture({ webCalls: ASSISTANT_SEARCH_LIMITS.toolCalls + 1 })],
  ] as const) {
    const provider = createAssistantProvider(streamFactory(malformed.response, true, []));
    await assert.rejects(() => provider(searchRequest(), { signal: new AbortController().signal }), /(?:citation|source|media|tool|verified|limit)/i, label); assertions.push(`${label} fails closed`);
  }

  const tenActionSources = [youtubeSource, ...Array.from({ length: 9 }, (_, index) => `https://example.com/source-${index + 2}`)];
  const boundedFixture = responseFixture({ actionSourceUrls: tenActionSources }); const boundedProvider = createAssistantProvider(streamFactory(boundedFixture.response, true, [])); const boundedResult = await boundedProvider(searchRequest(), { signal: new AbortController().signal });
  equal(boundedResult.search?.processedSourceCount, 8, "hosted source metadata is normalized only through the eight-record processing ceiling");
  const outsideFixture = responseFixture({ sourceUrl: tenActionSources[8], actionSourceUrls: tenActionSources }); const outsideProvider = createAssistantProvider(streamFactory(outsideFixture.response, true, []));
  await assert.rejects(() => outsideProvider(searchRequest(), { signal: new AbortController().signal }), /forged search citation/i); assertions.push("citation outside the bounded processed source set fails closed");

  let failedCalls = 0;
  const failedProvider = createAssistantProvider(() => ({ create: async () => { failedCalls++; return { async *[Symbol.asyncIterator]() { yield { type: "response.failed", response: { status: "failed" }, sequence_number: 1 } as OpenAI.Responses.ResponseStreamEvent; } }; } }));
  await assert.rejects(() => failedProvider(searchRequest(), { signal: new AbortController().signal }), /could not finish/i); equal(failedCalls, 1, "provider failure makes one request and never retries");

  let timeoutCalls = 0;
  const timeoutProvider = createAssistantProvider(() => ({ create: async (_body, options) => { timeoutCalls++; return { async *[Symbol.asyncIterator]() {
    yield { type: "response.web_search_call.in_progress", item_id: "search_timeout", output_index: 0, sequence_number: 1 } as OpenAI.Responses.ResponseStreamEvent;
    await new Promise<void>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } }; } }), 5);
  await assert.rejects(() => timeoutProvider(searchRequest(), { signal: new AbortController().signal }), /search deadline/i); equal(timeoutCalls, 1, "search deadline aborts one request with no retry");
} finally { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; }

const lifecycle = new DiamondAssistantJobService(async (request, options) => {
  options.onActivity?.({ type: "search-start", topic: "current YouTube Shorts requirements" }); await wait(5);
  options.onActivity?.({ type: "search-end" }); await wait(5); options.onActivity?.({ type: "finalizing" }); await wait(5);
  return searchProviderResult(request);
}, 1000, 0);
const lifecycleRequest = searchRequest(); lifecycle.submit(lifecycleRequest); await wait(2);
equal(lifecycle.get(lifecycleRequest.jobId, lifecycleRequest.sessionId)?.status, "searching", "job exposes searching only during the actual tool interval"); await wait(6);
equal(lifecycle.get(lifecycleRequest.jobId, lifecycleRequest.sessionId)?.status, "thinking", "job returns to Thinking after search while synthesis continues"); await wait(12);
const lifecycleDone = lifecycle.get(lifecycleRequest.jobId, lifecycleRequest.sessionId)!; equal(lifecycleDone.status, "done", "job completes after output finalization");
equal(lifecycleDone.events.map(event => event.status), ["thinking", "searching", "thinking", "finalizing", "done"], "job lifecycle is monotonic and truthful");
equal(lifecycleDone.events[1].topic, "current YouTube Shorts requirements", "search event contains only the sanitized topic");

const cancelled = new DiamondAssistantJobService(async (request, options) => { options.onActivity?.({ type: "search-start", topic: "current public information" }); await new Promise<void>(() => {}); return fixtureResult(request); }, 1000, 0);
const cancelledRequest = searchRequest(); cancelled.submit(cancelledRequest); await wait(2); cancelled.cancel(cancelledRequest.jobId, cancelledRequest.sessionId);
equal(cancelled.get(cancelledRequest.jobId, cancelledRequest.sessionId)?.status, "cancelled", "cancellation ends searching immediately without retry");
const timed = new DiamondAssistantJobService(async (request, options) => { options.onActivity?.({ type: "search-start", topic: "current public information" }); await new Promise<void>(() => {}); return fixtureResult(request); }, 15, 0);
const timedRequest = searchRequest(); timed.submit(timedRequest); await wait(25); equal(timed.get(timedRequest.jobId, timedRequest.sessionId)?.status, "failed", "overall timeout terminates search without retry");

writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, limits: ASSISTANT_SEARCH_LIMITS, requestBodies: { local: localBody, search: searchBody }, realProviderCalls: 0, paidCalls: 0 }, null, 2));
console.log(JSON.stringify({ status: "PASS", assertions: assertions.length }));
