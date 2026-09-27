import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI_ANIMATOR_MODEL, type AiAnimatorProviderResult, type AiAnimatorRequest } from "../../src/lib/ai/aiAnimatorContract.ts";
import { AiAnimatorJobService } from "../../src/lib/ai/aiAnimatorJobService.ts";
import { ASSISTANT_MODEL, CATALOG_VERSION, type AssistantRequest, type ProviderResult } from "../../src/lib/assistant/assistantContracts.ts";
import { wavHeader } from "../../src/lib/assistant/assistantDictationContract.ts";
import { DiamondAssistantJobService } from "../../src/lib/assistant/assistantJobService.ts";
import { buildAssistantResponseRequest, createAssistantProvider } from "../../src/lib/assistant/assistantProvider.ts";
import { AssistantTranscriptionService } from "../../src/lib/assistant/assistantTranscriptionService.ts";
import { createAiAnimatorReplyGenerator } from "../../src/lib/openai/generateAiAnimatorReply.ts";
import type { UsageJournalEventInput } from "../../src/lib/usage-journal/usageJournalContract.ts";

const output = resolve("output/spec0015/phase2/runtime");
mkdirSync(output, { recursive: true });
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
const waitFor = async (test: () => boolean, message: string) => {
  for (let attempt = 0; attempt < 100; attempt++) { if (test()) { checks++; return; } await new Promise((resolve) => setTimeout(resolve, 2)); }
  assert.fail(message);
};
const contentSentinel = "PRIVATE-RUNTIME-CONTENT-MUST-NOT-ENTER-JOURNAL";
const projectRequest: AiAnimatorRequest = {
  jobId: "project-runtime-job", turnId: "project-runtime-turn", message: contentSentinel, reasoningLevel: "medium",
  recentConversation: [{ role: "user", content: contentSentinel }],
  workspace: { projectId: "project-runtime-origin", projectTitle: contentSentinel, projectGeneration: 1, totalLayers: 2,
    authoredFrameCount: 3, timelineFps: 12, activeTool: "brush" },
};
const projectResponse = (model: string = AI_ANIMATOR_MODEL) => ({
  id: "response-project-runtime", model, output_text: JSON.stringify({ intent: "conversation", reply: "Safe reply",
    focusedQuestion: null, planSummary: null }), usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
});
const assistantRequest: AssistantRequest = {
  schema: "diamond-assistant-request/v1", jobId: "assistantjobruntime", sessionId: "assistantsessionruntime",
  turnId: "assistantturnruntime", message: "Hello Terra", reasoningLevel: "medium", recentConversation: [],
  catalogVersion: CATALOG_VERSION, clientSessionRevision: 1,
};
const assistantResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "response-assistant-runtime", status: "completed", model: ASSISTANT_MODEL,
  output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text",
    text: JSON.stringify({ answer: "Safe answer", title: "Safe title" }), annotations: [], logprobs: [] }] }],
  usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 }, ...overrides,
});
const completedStream = (response: unknown) => ({
  async *[Symbol.asyncIterator]() { yield { type: "response.completed", response }; },
});
const assistantProviderResult: ProviderResult = {
  reply: { answer: "Safe answer", title: "Safe title" },
  usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100, estimatedCostUsd: 0.0004, priceDate: "2026-09-22",
    responseId: "response-assistant-runtime", latencyMs: 2, model: ASSISTANT_MODEL, reasoning: "medium", toolCalls: 0 },
};
const projectProviderResult: AiAnimatorProviderResult = {
  reply: { intent: "conversation", reply: "Safe reply", focusedQuestion: null, planSummary: null },
  requestedModel: AI_ANIMATOR_MODEL, providerModel: AI_ANIMATOR_MODEL, responseId: "response-project-runtime",
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCostUsd: 0.00044 }, latencyMs: 2,
  promptDigest: "0".repeat(64),
};

const projectEvents: UsageJournalEventInput[] = [];
const projectCalls: Array<{ body: unknown; options: unknown }> = [];
const projectGenerator = createAiAnimatorReplyGenerator((() => ({ responses: { create: async (body: unknown, options: unknown) => {
  projectCalls.push({ body, options }); return projectResponse();
} } })) as never, (event) => { projectEvents.push(event); return true; });
const projectSignal = new AbortController().signal;
const projectResult = await projectGenerator(projectRequest, { signal: projectSignal });
equal(projectResult.reply.reply, "Safe reply", "Project provider result remains unchanged");
equal(projectCalls.length, 1, "Project provider request count remains one application request");
const projectBody = projectCalls[0].body as Record<string, unknown>;
equal(Object.keys(projectBody).sort(), ["input", "instructions", "max_output_tokens", "model", "reasoning", "store", "text", "tools"],
  "Project provider payload keys unchanged");
equal(projectBody.model, AI_ANIMATOR_MODEL, "Project model unchanged");
equal(projectBody.tools, [], "Project tools unchanged");
equal(projectBody.store, false, "Project provider storage remains disabled");
equal((projectCalls[0].options as { signal: AbortSignal }).signal, projectSignal, "Project abort signal unchanged");
equal(projectEvents.map((event) => event.stage), ["dispatched", "provider_observed"], "Project observation brackets provider return");
check(!JSON.stringify(projectEvents).includes(contentSentinel), "Project journal events contain no prompt/history/project-title content");

const rejectedProjectEvents: UsageJournalEventInput[] = [];
const rejectedProject = createAiAnimatorReplyGenerator((() => ({ responses: { create: async () => projectResponse("unexpected-model") } })) as never,
  (event) => { rejectedProjectEvents.push(event); return true; });
await assert.rejects(rejectedProject(projectRequest), /unexpected model/); checks++;
equal(rejectedProjectEvents.map((event) => event.stage), ["dispatched", "provider_observed"],
  "Project usage is observed before returned-model validation rejects answer");
equal(rejectedProjectEvents[1].totalTokens, 120, "Rejected Project answer retains provider usage");

const projectJobEvents: UsageJournalEventInput[] = [];
const projectJobs = new AiAnimatorJobService(async () => projectProviderResult,
  (event) => { projectJobEvents.push(event); return true; });
projectJobs.submit(projectRequest);
await waitFor(() => projectJobs.get(projectRequest.jobId, projectRequest.workspace.projectId)?.status === "done", "Project job did not finish");
equal(projectJobEvents.map((event) => `${event.stage}:${event.outcome ?? ""}`), ["accepted:", "terminal:succeeded"],
  "Project job records accepted and terminal success once");
const cancelEvents: UsageJournalEventInput[] = [];
const cancelRequest = { ...projectRequest, jobId: "project-cancel-job", turnId: "project-cancel-turn" };
const cancelJobs = new AiAnimatorJobService((_request, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
}), (event) => { cancelEvents.push(event); return true; });
cancelJobs.submit(cancelRequest); cancelJobs.cancel(cancelRequest.jobId, cancelRequest.workspace.projectId);
equal(cancelEvents.map((event) => `${event.stage}:${event.outcome ?? ""}`), ["accepted:", "terminal:cancelled"],
  "Project cancellation records terminal state without waiting for provider");
const throwingProjectJobs = new AiAnimatorJobService(async () => projectProviderResult, () => { throw new Error("telemetry offline"); });
const throwingProjectRequest = { ...projectRequest, jobId: "project-meter-fail", turnId: "project-meter-fail-turn" };
throwingProjectJobs.submit(throwingProjectRequest);
await waitFor(() => throwingProjectJobs.get(throwingProjectRequest.jobId, throwingProjectRequest.workspace.projectId)?.status === "done",
  "Project answer must survive telemetry failure");

const assistantEvents: UsageJournalEventInput[] = [];
const assistantCalls: Array<{ body: unknown; options: unknown }> = [];
process.env.OPENAI_API_KEY = "phase2-proof-only";
const assistantProvider = createAssistantProvider(() => ({ create: async (body, options) => {
  assistantCalls.push({ body, options }); return completedStream(assistantResponse()) as never;
} }), 30_000, (event) => { assistantEvents.push(event); return true; });
const assistantController = new AbortController(); const assistantSignal = assistantController.signal;
const assistantResult = await assistantProvider(assistantRequest, { signal: assistantSignal });
equal(assistantResult.reply.answer, "Safe answer", "Assistant provider result remains unchanged");
equal(assistantCalls.length, 1, "Assistant provider request count remains one");
equal(assistantCalls[0].body, buildAssistantResponseRequest(assistantRequest).body, "Assistant provider payload is byte-for-structure unchanged");
const assistantDispatchedSignal = (assistantCalls[0].options as { signal: AbortSignal }).signal;
check(!assistantDispatchedSignal.aborted, "Assistant composite abort signal starts active");
assistantController.abort("proof-cancel");
check(assistantDispatchedSignal.aborted, "Assistant caller abort still propagates to provider transport");
equal(assistantEvents.map((event) => event.stage), ["dispatched", "provider_observed"], "Assistant observation brackets provider return");

const rejectedAssistantEvents: UsageJournalEventInput[] = [];
const rejectedAssistant = createAssistantProvider(() => ({ create: async () => completedStream(assistantResponse({ output: [] })) as never }),
  30_000, (event) => { rejectedAssistantEvents.push(event); return true; });
await assert.rejects(rejectedAssistant(assistantRequest, { signal: new AbortController().signal })); checks++;
equal(rejectedAssistantEvents.map((event) => event.stage), ["dispatched", "provider_observed"],
  "Assistant usage is observed before output validation rejects answer");
equal(rejectedAssistantEvents[1].totalTokens, 100, "Rejected Assistant answer retains provider usage");

const assistantJobEvents: UsageJournalEventInput[] = [];
const assistantJobs = new DiamondAssistantJobService(async () => assistantProviderResult, 1000, 0,
  (event) => { assistantJobEvents.push(event); return true; });
assistantJobs.submit(assistantRequest);
await waitFor(() => assistantJobs.get(assistantRequest.jobId, assistantRequest.sessionId)?.status === "done", "Assistant job did not finish");
equal(assistantJobEvents.map((event) => `${event.stage}:${event.outcome ?? ""}`), ["accepted:", "terminal:succeeded"],
  "Assistant job records accepted and terminal success once");
const throwingAssistantJobs = new DiamondAssistantJobService(async () => assistantProviderResult, 1000, 0,
  () => { throw new Error("telemetry offline"); });
const throwingAssistantRequest = { ...assistantRequest, jobId: "assistantmeterfail", turnId: "assistantmeterfailturn" };
throwingAssistantJobs.submit(throwingAssistantRequest);
await waitFor(() => throwingAssistantJobs.get(throwingAssistantRequest.jobId, throwingAssistantRequest.sessionId)?.status === "done",
  "Assistant answer must survive telemetry failure");

const wav = new Uint8Array(44 + 3200 * 2); wav.set(wavHeader(3200, 16000)); const wavView = new DataView(wav.buffer);
for (let offset = 44; offset < wav.length; offset += 2) wavView.setInt16(offset, offset % 4 ? 900 : -900, true);
const dictationEvents: UsageJournalEventInput[] = []; let transportCalls = 0; let transportShape: unknown = null;
const transcription = new AssistantTranscriptionService(async (url, init) => {
  transportCalls++; const form = init?.body as FormData;
  transportShape = { url, method: init?.method, redirect: init?.redirect, model: form.get("model"),
    responseFormat: form.get("response_format"), fileIsBlob: form.get("file") instanceof Blob,
    authorizationPresent: init?.headers != null && String((init.headers as Record<string, string>).Authorization).startsWith("Bearer ") };
  return Response.json({ text: "Safe transcript", model: "gpt-transcribe" }, { headers: { "x-request-id": "dictation-request-runtime" } });
}, () => "test-key", 1000, (event) => { dictationEvents.push(event); return true; });
const dictationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const dictationRequest = new Request("http://127.0.0.1:58540/api/diamond-assistant-transcription", {
  method: "POST", headers: { host: "127.0.0.1:58540", "content-type": "audio/wav", "x-dictation-id": dictationId,
    "content-length": String(wav.length) }, body: wav,
});
const dictationResponse = await transcription.transcribe(dictationRequest);
equal(dictationResponse.status, 200, "Dictation success response unchanged");
equal(transportCalls, 1, "Dictation transport request count remains one");
equal(transportShape, { url: "https://api.openai.com/v1/audio/transcriptions", method: "POST", redirect: "error",
  model: "gpt-transcribe", responseFormat: "json", fileIsBlob: true, authorizationPresent: true },
"Dictation endpoint, multipart fields and transport policy unchanged");
equal(dictationEvents.map((event) => `${event.stage}:${event.outcome ?? ""}`),
  ["accepted:", "dispatched:", "provider_observed:", "provider_observed:", "terminal:succeeded"],
  "Dictation observes headers/body before terminal success");
check(!JSON.stringify(dictationEvents).includes("Safe transcript"), "Dictation journal events contain no transcript or raw audio");

const noKeyEvents: UsageJournalEventInput[] = []; let noKeyTransport = 0;
const noKey = new AssistantTranscriptionService(async () => { noKeyTransport++; throw new Error("must not dispatch"); }, () => undefined, 1000,
  (event) => { noKeyEvents.push(event); return true; });
const noKeyRequest = new Request("http://127.0.0.1:58540/api/diamond-assistant-transcription", {
  method: "POST", headers: { host: "127.0.0.1:58540", "content-type": "audio/wav", "x-dictation-id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "content-length": String(wav.length) }, body: wav.slice(),
});
equal((await noKey.transcribe(noKeyRequest)).status, 400, "Unconfigured dictation behavior unchanged");
equal(noKeyTransport, 0, "Unconfigured dictation is explicitly not dispatched");
equal(noKeyEvents.map((event) => `${event.stage}:${event.outcome ?? ""}`), ["accepted:", "terminal:failed"],
  "Unconfigured dictation remains not-dispatched telemetry");
const throwingDictation = new AssistantTranscriptionService(async () => { throw new Error("must not dispatch"); }, () => undefined, 1000,
  () => { throw new Error("telemetry offline"); });
const throwingDictationRequest = new Request("http://127.0.0.1:58540/api/diamond-assistant-transcription", {
  method: "POST", headers: { host: "127.0.0.1:58540", "content-type": "audio/wav", "x-dictation-id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "content-length": String(wav.length) }, body: wav.slice(),
});
equal((await throwingDictation.transcribe(throwingDictationRequest)).status, 400, "Dictation response survives telemetry failure");

const assistantSource = readFileSync("src/lib/assistant/assistantProvider.ts", "utf8");
check(assistantSource.includes("maxRetries: 0") && assistantSource.includes("timeout: ASSISTANT_LIMITS.deadlineMs"),
  "Assistant retry and timeout policy remains explicit");
const projectClient = readFileSync("src/lib/openai/client.ts", "utf8");
check(!projectClient.includes("maxRetries"), "Project SDK retry default remains unchanged and is labeled aggregate-unknown");
const persistedShape = JSON.stringify([...projectEvents, ...assistantEvents, ...dictationEvents]);
check(!persistedShape.includes(contentSentinel) && !persistedShape.includes("Safe transcript") && !persistedShape.includes("https://"),
  "combined live-seam telemetry contains no prompt, transcript or URL");

const receipt = { schema: "spec0015-phase2-runtime-proof/v1", pass: true, checks,
  requests: { project: projectCalls.length, assistant: assistantCalls.length, dictation: transportCalls },
  observedBeforeValidation: { project: true, assistant: true, dictation: true },
  protectedBehavior: { projectPayload: true, projectModel: true, projectTools: true, projectSdkRetriesUnchanged: true,
    assistantPayload: true, assistantModel: true, assistantTools: true, assistantRetriesZero: true,
    dictationEndpoint: true, dictationMultipart: true, dictationRequestCount: true },
  privacy: { prompt: false, reply: false, transcript: false, rawAudio: false, searchText: false, urls: false },
  network: { realProviderCalls: 0, paidCalls: 0 } };
writeFileSync(resolve(output, "runtime.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`SPEC-0015 Phase 2 runtime proof PASS (${checks} checks)`);
