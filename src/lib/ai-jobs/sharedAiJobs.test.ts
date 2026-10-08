// Online AI jobs across server copies: two service objects (= two Vercel instances) share one fake
// store (= one Postgres table). Run: node --test src/lib/ai-jobs/sharedAiJobs.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { MemorySharedJobStore } from "./sharedJobStore.ts";
import { AiAnimatorJobService } from "../ai/aiAnimatorJobService.ts";
import { AI_ANIMATOR_MODEL, type AiAnimatorProviderResult, type AiAnimatorRequest } from "../ai/aiAnimatorContract.ts";
import { DiamondAssistantJobService } from "../assistant/assistantJobService.ts";
import { AssistantTranscriptionService } from "../assistant/assistantTranscriptionService.ts";
import type { UsageJournalEventInput } from "../usage-journal/usageJournalContract.ts";
import { fixtureRequest, fixtureResult } from "../../../scripts/spec0012-assistant/phase2Fixtures.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const usageLog = () => { const events: UsageJournalEventInput[] = []; return { events, record: (event: UsageJournalEventInput) => { events.push(event); return true; } }; };
const terminals = (events: UsageJournalEventInput[]) => events.filter((event) => event.stage === "terminal");

// ---------- AI Animator ----------
let counter = 0;
const animatorRequest = (projectId = "project-a"): AiAnimatorRequest => ({
  jobId: `job-${++counter}`, turnId: `turn-${counter}`, message: "Make him wave", reasoningLevel: "medium", recentConversation: [],
  workspace: { projectId, projectGeneration: 1 } as AiAnimatorRequest["workspace"],
});
const animatorResult = (): AiAnimatorProviderResult => ({
  reply: { intent: "conversation", reply: "Hello!", focusedQuestion: null, planSummary: null },
  requestedModel: AI_ANIMATOR_MODEL, providerModel: AI_ANIMATOR_MODEL, responseId: "resp_1",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }, latencyMs: 5, promptDigest: "d",
});
const gatedProvider = () => {
  const releases: Array<() => void> = []; let sawAbort = false;
  const provider = (_request: AiAnimatorRequest, { signal }: { signal: AbortSignal }) => new Promise<AiAnimatorProviderResult>((resolve, reject) => {
    releases.push(() => resolve(animatorResult()));
    signal.addEventListener("abort", () => { sawAbort = true; reject(new Error("aborted")); }, { once: true });
  });
  return { provider, release: () => releases.splice(0).forEach((release) => release()), aborted: () => sawAbort };
};

test("AI Animator: a poll on another server copy sees Thinking, then the finished reply", async () => {
  const store = new MemorySharedJobStore(); const usage = usageLog(); const gate = gatedProvider();
  const a = new AiAnimatorJobService(gate.provider, usage.record, { cancelCheckMs: 5 });
  const b = new AiAnimatorJobService(gate.provider, usage.record, { cancelCheckMs: 5 });
  const request = animatorRequest();
  const { snapshot, work } = await a.submitShared(store, request, "owner-1");
  assert.equal(snapshot.status, "thinking");
  assert.equal((await b.getShared(store, request.jobId, "project-a", "owner-1"))?.status, "thinking");
  gate.release(); await work;
  const done = await b.getShared(store, request.jobId, "project-a", "owner-1");
  assert.equal(done?.status, "done");
  assert.deepEqual(done?.events.map((event) => event.status), ["thinking", "done"]);
  assert.equal(done?.events.at(-1)?.reply?.reply, "Hello!");
  assert.deepEqual(terminals(usage.events).map((event) => event.outcome), ["succeeded"], "one final usage event");
  assert.equal(usage.events.filter((event) => event.stage === "accepted").length, 1);
});

test("AI Animator: Cancel on another server copy wins, stops the AI call, and records usage once", async () => {
  const store = new MemorySharedJobStore(); const usage = usageLog(); const gate = gatedProvider();
  const a = new AiAnimatorJobService(gate.provider, usage.record, { cancelCheckMs: 5 });
  const b = new AiAnimatorJobService(gate.provider, usage.record, { cancelCheckMs: 5 });
  const request = animatorRequest();
  const { work } = await a.submitShared(store, request, "owner-1");
  const cancelled = await b.cancelShared(store, request.jobId, "project-a", "owner-1");
  assert.equal(cancelled?.status, "cancelled");
  await work;
  assert.equal(gate.aborted(), true, "the copy doing the work aborted its AI call");
  assert.equal((await a.getShared(store, request.jobId, "project-a", "owner-1"))?.status, "cancelled");
  assert.deepEqual(terminals(usage.events).map((event) => event.outcome), ["cancelled"]);
});

test("AI Animator: a late finish cannot overwrite a cancel made elsewhere", async () => {
  const store = new MemorySharedJobStore(); const usage = usageLog(); const gate = gatedProvider();
  const a = new AiAnimatorJobService(gate.provider, usage.record, { cancelCheckMs: 60_000 }); // too slow to notice
  const b = new AiAnimatorJobService(gate.provider, usage.record);
  const request = animatorRequest();
  const { work } = await a.submitShared(store, request, "owner-1");
  await b.cancelShared(store, request.jobId, "project-a", "owner-1");
  gate.release(); await work;
  assert.equal((await b.getShared(store, request.jobId, "project-a", "owner-1"))?.status, "cancelled");
  assert.deepEqual(terminals(usage.events).map((event) => event.outcome), ["cancelled"], "no second final usage event");
});

test("AI Animator: accounts are isolated and limits count every server copy", async () => {
  const store = new MemorySharedJobStore(); const gate = gatedProvider();
  const a = new AiAnimatorJobService(gate.provider, undefined, { cancelCheckMs: 5 });
  const b = new AiAnimatorJobService(gate.provider, undefined, { cancelCheckMs: 5 });
  const first = animatorRequest("project-a");
  const { work } = await a.submitShared(store, first, "owner-1");
  assert.equal(await b.getShared(store, first.jobId, "project-a", "owner-2"), null, "other account cannot read");
  assert.equal(await b.cancelShared(store, first.jobId, "project-a", "owner-2"), null, "other account cannot cancel");
  assert.equal(await b.getShared(store, first.jobId, "project-b", "owner-1"), null, "wrong project cannot read");
  await assert.rejects(b.submitShared(store, { ...animatorRequest("project-z"), jobId: first.jobId }, "owner-2"), { status: 403 });
  await assert.rejects(b.submitShared(store, animatorRequest("project-a"), "owner-1"), { status: 409 });
  const second = await b.submitShared(store, animatorRequest("project-b"), "owner-1");
  await assert.rejects(a.submitShared(store, animatorRequest("project-c"), "owner-1"), { status: 429 });
  const repeat = await b.submitShared(store, first, "owner-1");
  assert.equal(repeat.snapshot.jobId, first.jobId, "repeating a submit returns the same job");
  gate.release(); await Promise.all([work, second.work]);
});

test("AI Animator: without a shared store everything stays in memory as before", () => {
  const gate = gatedProvider(); const service = new AiAnimatorJobService(gate.provider);
  const request = animatorRequest();
  assert.equal(service.submit(request, "owner-1").status, "thinking");
  assert.equal(service.get(request.jobId, "project-a", "owner-1")?.status, "thinking");
  assert.equal(service.cancel(request.jobId, "project-a", "owner-1")?.status, "cancelled");
});

// ---------- Assistant ----------
test("Assistant: poll and cancel work from another server copy; usage recorded once", async () => {
  const store = new MemorySharedJobStore(); const usage = usageLog();
  let aborted = false;
  // The AI never answers on its own here: only the cancel can end this answer.
  const provider = (_request: Parameters<ConstructorParameters<typeof DiamondAssistantJobService>[0]>[0], { signal }: { signal: AbortSignal }) =>
    new Promise<ReturnType<typeof fixtureResult>>((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
    });
  const a = new DiamondAssistantJobService(provider, 5_000, 1, usage.record); a.cancelCheckMs = 5;
  const b = new DiamondAssistantJobService(provider, 5_000, 1, usage.record);
  const request = fixtureRequest();
  const { snapshot, work } = await a.submitShared(store, request, "owner-1");
  assert.equal(snapshot.status, "thinking");
  assert.equal((await b.getShared(store, request.jobId, request.sessionId, "owner-1"))?.status, "thinking");
  assert.equal(await b.getShared(store, request.jobId, request.sessionId, "owner-2"), null, "other account cannot read");
  await assert.rejects(b.cancelRequestShared(store, request, "owner-2"), /not available/);
  await assert.rejects(b.submitShared(store, fixtureRequest({ sessionId: request.sessionId }), "owner-1"), /already has an active answer/);
  const cancelled = await b.cancelRequestShared(store, request, "owner-1");
  assert.equal(cancelled.status, "cancelled");
  await work;
  assert.equal(aborted, true);
  assert.equal((await a.getShared(store, request.jobId, request.sessionId, "owner-1"))?.status, "cancelled");
  assert.deepEqual(terminals(usage.events).map((event) => event.outcome), ["cancelled"]);
});

test("Assistant: the finished answer is visible on every server copy with its stages", async () => {
  const store = new MemorySharedJobStore(); const usage = usageLog();
  const a = new DiamondAssistantJobService(async (request) => fixtureResult(request), 5_000, 1, usage.record);
  const b = new DiamondAssistantJobService(async (request) => fixtureResult(request), 5_000, 1, usage.record);
  const request = fixtureRequest();
  const { work } = await a.submitShared(store, request, "owner-1"); await work;
  const done = await b.getShared(store, request.jobId, request.sessionId, "owner-1");
  assert.deepEqual(done?.events.map((event) => event.status), ["thinking", "finalizing", "done"]);
  assert.ok(done?.result);
  assert.deepEqual(terminals(usage.events).map((event) => event.outcome), ["succeeded"]);
  const again = await b.submitShared(store, request, "owner-1");
  assert.equal(again.snapshot.status, "done", "same request is idempotent across copies");
  await assert.rejects(b.submitShared(store, { ...request, message: "Different words" }, "owner-1"), /different message/);
});

test("Assistant: a cancel that arrives first (on any copy) blocks the later submit", async () => {
  const store = new MemorySharedJobStore(); let calls = 0;
  const a = new DiamondAssistantJobService(async (request) => { calls++; return fixtureResult(request); }, 5_000, 1);
  const b = new DiamondAssistantJobService(async (request) => { calls++; return fixtureResult(request); }, 5_000, 1);
  const request = fixtureRequest();
  assert.equal((await b.cancelRequestShared(store, request, "owner-1")).status, "cancelled");
  const { snapshot, work } = await a.submitShared(store, request, "owner-1"); await work;
  assert.equal(snapshot.status, "cancelled"); assert.equal(calls, 0, "no paid call after a cancel");
});

// ---------- Dictation ----------
test("Dictation: a cancel on another server copy stops an upload in progress", async () => {
  const store = new MemorySharedJobStore(); let transportAborted = false;
  const transport = ((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { transportAborted = true; reject(new Error("aborted")); }, { once: true });
  })) as unknown as typeof fetch;
  const options = { allowRequest: () => true, sharedStore: () => store, cancelCheckMs: 5 };
  const a = new AssistantTranscriptionService(transport, () => "test-key-not-real", 5_000, undefined, options);
  const b = new AssistantTranscriptionService(transport, () => "test-key-not-real", 5_000, undefined, options);
  const id = crypto.randomUUID();
  const rate = 16000; const samples = rate / 2; const wav = new Uint8Array(44 + samples * 2); const view = new DataView(wav.buffer);
  const tag = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, wav.length - 8, true); tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(8000 * Math.sin(i / 8)), true); // a quiet tone, not silence
  const upload = a.transcribe(new Request("http://127.0.0.1:3000/api/diamond-assistant-transcription", {
    method: "POST", headers: { "content-type": "audio/wav", "x-dictation-id": id }, body: wav,
  }), "owner-1");
  await sleep(20);
  const cancel = await b.cancelShared(new Request(`http://127.0.0.1:3000/api/diamond-assistant-transcription?id=${id}`, { method: "DELETE" }), "owner-1");
  assert.equal(cancel.status, 200);
  const response = await upload;
  assert.equal(response.status, 409, JSON.stringify(await response.clone().json())); assert.equal((await response.json()).code, "cancelled");
  assert.equal(transportAborted, true);
  const tombstoneId = crypto.randomUUID();
  await b.cancelShared(new Request(`http://127.0.0.1:3000/x?id=${tombstoneId}`, { method: "DELETE" }), "owner-1");
  const late = await a.transcribe(new Request("http://127.0.0.1:3000/x", {
    method: "POST", headers: { "content-type": "audio/wav", "x-dictation-id": tombstoneId }, body: wav,
  }), "owner-1");
  assert.equal(late.status, 409); assert.equal((await late.json()).code, "cancelled", "cancel-before-upload tombstone wins across copies");
});
