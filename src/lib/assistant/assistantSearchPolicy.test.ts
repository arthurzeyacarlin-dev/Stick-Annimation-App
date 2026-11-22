import test from "node:test";
import assert from "node:assert/strict";
import { decideAssistantSearch } from "./assistantSearchPolicy.ts";
import { buildAssistantResponseRequest, createAssistantProvider } from "./assistantProvider.ts";
import { ASSISTANT_MODEL, CATALOG_VERSION, type AssistantRequest, type Message } from "./assistantContracts.ts";
import { ASSISTANT_BASE_INSTRUCTIONS, ASSISTANT_SEARCH_INSTRUCTIONS } from "./assistantKnowledge.ts";

// Arthur (2026-11-03): the Help Assistant no longer waits for words like "search" or "YouTube".
// Every non-greeting turn offers web search with tool_choice "auto" and the model decides; the
// privacy check still keeps private or local data away from search. Pretend client: no paid call.
const request = (message: string, recentConversation: Message[] = []): AssistantRequest => ({ schema: "diamond-assistant-request/v1", jobId: "job-test-10000", sessionId: "session-10000", turnId: "turn-test-10000",
  message, reasoningLevel: "low", recentConversation, catalogVersion: CATALOG_VERSION, clientSessionRevision: 1 });
const said = (role: Message["role"], text: string, n: number): Message => ({ id: `message-${n}0000`, turnId: `turn-old-${n}0000`, role, text, at: n });

test("public questions without trigger words now allow search (the model decides)", () => {
  for (const message of ["Who is the Chosen One from Alan Becker?", "What does the Second Coming look like?", "Where do I export my animation?"]) {
    assert.equal(decideAssistantSearch(request(message)).mode, "auto", message);
  }
  const body = buildAssistantResponseRequest(request("Who is the Chosen One from Alan Becker?")).body;
  assert.equal(body.tool_choice, "auto");
  assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "low" }]);
});

test("search turns keep the recent conversation for follow-ups", () => {
  const history = [said("user", "Who is the Chosen One from Alan Becker?", 1), said("assistant", "A stick figure from Animator vs Animation.", 2)];
  const prepared = buildAssistantResponseRequest(request("What colour is he?", history));
  assert.equal(prepared.decision.mode, "auto");
  assert.equal(JSON.parse(prepared.input).recentConversation.length, 2);
  assert.equal(prepared.instructions, ASSISTANT_SEARCH_INSTRUCTIONS);
});

test("greetings and private data are never offered search", () => {
  assert.equal(decideAssistantSearch(request("hello")).mode, "local");
  assert.equal(decideAssistantSearch(request("Search my localhost project at http://127.0.0.1:3000/private")).mode, "local");
  assert.equal(decideAssistantSearch(request("Who made it?", [said("user", "my api key is in /Users/me/app", 1)])).mode, "local");
  assert.deepEqual(buildAssistantResponseRequest(request("hello")).body.tools, []);
});

test("instructions: search before saying 'don't know'; famous stick-figure characters are allowed", () => {
  assert.match(ASSISTANT_SEARCH_INSTRUCTIONS, /search first instead of saying you don't know/);
  assert.match(ASSISTANT_BASE_INSTRUCTIONS, /Never refuse, warn or hedge about copyright/);
  assert.doesNotMatch(ASSISTANT_SEARCH_INSTRUCTIONS, /You must use the supplied hosted web search/);
});

test("a search-offered turn that the model answers without searching is a normal answer", async () => {
  process.env.OPENAI_API_KEY ??= "test-key-not-real";
  const text = JSON.stringify({ answer: "Press F6 to add a keyframe.", title: "Keyframes" });
  const final = { id: "resp_test_1234", status: "completed", model: ASSISTANT_MODEL, usage: { input_tokens: 900, output_tokens: 50, total_tokens: 950 },
    output: [{ type: "message", content: [{ type: "output_text", text, annotations: [] }] }] };
  let sent: { tool_choice?: unknown } | null = null;
  const provider = createAssistantProvider(() => ({ create: async (body) => { sent = body; return (async function* () { yield { type: "response.completed", response: final } as never; })(); } }));
  const result = await provider(request("How do I add a keyframe?"), { signal: new AbortController().signal } as never);
  assert.equal(sent!.tool_choice, "auto");
  assert.equal(result.reply.answer, "Press F6 to add a keyframe.");
  assert.equal(result.search, undefined);
  assert.equal(result.usage.toolCalls, 0);
});
