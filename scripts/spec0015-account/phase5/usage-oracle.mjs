import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

process.env.SPEC0015_ACCOUNT_USAGE_DB_NAME = "phase5-oracle.sqlite";
process.env.DIAMOND_USAGE_JOURNAL_PATH = path.resolve(".local/spec0015-phase3/phase5-oracle-journal.ndjson");
const { withAccountUsageOwner, readAccountUsageRows } = await import("../../../src/lib/account-usage/accountUsageStore.ts");
const { projectAccountUsage } = await import("../../../src/lib/account-usage/accountUsageProjection.ts");
const { recordUsageEvent } = await import("../../../src/lib/usage-journal/usageJournalRuntime.ts");
const { assistantDispatchedEvent, assistantProviderObservedEvent, projectDispatchedEvent,
  projectProviderObservedEvent, dictationAcceptedEvent, dictationDispatchedEvent,
  dictationProviderObservedEvent, dictationTerminalEvent } = await import("../../../src/lib/usage-journal/usageJournalEvents.ts");
const { DiamondAssistantJobService } = await import("../../../src/lib/assistant/assistantJobService.ts");
const { AiAnimatorJobService } = await import("../../../src/lib/ai/aiAnimatorJobService.ts");
const { AI_ANIMATOR_MODEL } = await import("../../../src/lib/ai/aiAnimatorContract.ts");
const { ASSISTANT_MODEL } = await import("../../../src/lib/assistant/assistantContracts.ts");
const { fixtureRequest, fixtureResult } = await import("../../spec0012-assistant/phase2Fixtures.ts");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const ownerA = `phase5-oracle-a-${randomUUID()}`;
const ownerB = `phase5-oracle-b-${randomUUID()}`;
const assistantRequest = fixtureRequest({ message: "synthetic account usage proof" });
const animatorRequest = { jobId: randomUUID(), turnId: randomUUID(), message: "synthetic account usage proof",
  reasoningLevel: "medium", recentConversation: [], workspace: { projectId: randomUUID(), projectTitle: "oracle",
    projectGeneration: 1, totalLayers: 1, authoredFrameCount: 2, timelineFps: 12, activeTool: "Brush" } };
const assistantJobs = new DiamondAssistantJobService(async request => {
  await sleep(12); // Detached work must retain admission owner even while the other account runs.
  recordUsageEvent(assistantDispatchedEvent(request, Date.now(), "conversation", ASSISTANT_MODEL));
  recordUsageEvent(assistantProviderObservedEvent(request, { operationKind: "conversation", returnedModel: ASSISTANT_MODEL,
    responseId: `fixture_${request.jobId}`, inputTokens: 200, outputTokens: 150, totalTokens: 350,
    toolCalls: 0, estimatedCostUsd: .0022, pricingVersion: "synthetic-oracle" }));
  return fixtureResult(request);
}, 1000, 0, recordUsageEvent);
const animatorJobs = new AiAnimatorJobService(async request => {
  await sleep(5);
  recordUsageEvent(projectDispatchedEvent(request, Date.now(), AI_ANIMATOR_MODEL));
  recordUsageEvent(projectProviderObservedEvent(request, { requestedModel: AI_ANIMATOR_MODEL,
    returnedModel: AI_ANIMATOR_MODEL, responseId: `fixture_${request.jobId}`,
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCostUsd: .00044 },
    pricingVersion: "synthetic-oracle" }));
  return { reply: { intent: "conversation", reply: "Synthetic reply", focusedQuestion: null, planSummary: null },
    requestedModel: AI_ANIMATOR_MODEL, providerModel: AI_ANIMATOR_MODEL,
    responseId: `fixture_${request.jobId}`, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120,
      estimatedCostUsd: .00044 }, latencyMs: 1, promptDigest: "0".repeat(64) };
}, recordUsageEvent);

withAccountUsageOwner(ownerA, () => assistantJobs.submit(assistantRequest, ownerA));
withAccountUsageOwner(ownerB, () => animatorJobs.submit(animatorRequest, ownerB));
await sleep(30);
equal(assistantJobs.get(assistantRequest.jobId, assistantRequest.sessionId, ownerA)?.status, "done", "Assistant job completed");
equal(animatorJobs.get(animatorRequest.jobId, animatorRequest.workspace.projectId, ownerB)?.status, "done", "Animator job completed");
const a = readAccountUsageRows(ownerA);
const b = readAccountUsageRows(ownerB);
equal(a.rows.length, 4, "A has only its Assistant accepted/dispatched/observed/terminal events");
equal(b.rows.length, 4, "B has only its Animator accepted/dispatched/observed/terminal events");
check(a.rows.every(row => row.event.surface === "guidance_assistant"), "No B project event leaked to A");
check(b.rows.every(row => row.event.surface === "project_ai"), "No A Assistant event leaked to B");
const aSnapshot = projectAccountUsage(a.rows, a.readAt, a.gap);
const bSnapshot = projectAccountUsage(b.rows, b.readAt, b.gap);
equal(aSnapshot.assistant.receipts[0]?.totalTokens, 350, "A Assistant token bar is attributed");
equal(aSnapshot.project.receipts.length, 0, "A has no B project bar");
equal(bSnapshot.project.receipts[0]?.totalTokens, 120, "B Project token bar is attributed");
equal(bSnapshot.assistant.receipts.length, 0, "B has no A Assistant bar");
equal(aSnapshot.assistant.state, "partial", "Assistant transport coverage is marked partial");
equal(bSnapshot.project.state, "partial", "Project AI SDK retry coverage is marked partial");
check(aSnapshot.assistant.issues.some(issue => issue.includes("Provider-internal retries")), "Assistant retry limitation is explicit");
check(bSnapshot.project.issues.some(issue => issue.includes("Provider-internal retries")), "Project AI retry limitation is explicit");

withAccountUsageOwner(ownerA, () => recordUsageEvent(assistantDispatchedEvent(assistantRequest, Date.now(), "conversation", ASSISTANT_MODEL)));
equal(readAccountUsageRows(ownerA).rows.length, 4, "Duplicate event key is idempotent");
const dictationId = randomUUID();
withAccountUsageOwner(ownerA, () => {
  recordUsageEvent(dictationAcceptedEvent(dictationId, Date.now()));
  recordUsageEvent(dictationDispatchedEvent(dictationId, Date.now()));
  recordUsageEvent(dictationProviderObservedEvent(dictationId, "provider-headers", {
    returnedModel: null, providerRequestId: "synthetic", seconds: 2, estimatedCostUsd: .00012, complete: false }));
  recordUsageEvent(dictationProviderObservedEvent(dictationId, "provider-body", {
    returnedModel: null, providerRequestId: "synthetic", seconds: 2, estimatedCostUsd: .00012, complete: true }));
  recordUsageEvent(dictationTerminalEvent(dictationId, "succeeded", Date.now()));
});
const dictationSnapshot = projectAccountUsage(readAccountUsageRows(ownerA).rows, Date.now(), false);
equal(readAccountUsageRows(ownerA).rows.length, 9, "Dictation stores one owner-scoped attempt with two observations");
equal(dictationSnapshot.assistant.receipts.length, 2, "Dictation contributes one receipt, not two");
check(dictationSnapshot.assistant.receipts.some(receipt => receipt.totalTokens === null &&
  receipt.estimatedCostUsd === .00012), "Dictation has observed cost but no invented token bar");
const store = globalThis.diamondAccountUsageV1;
const realDatabase = store.database;
store.database = { prepare() { throw new Error("synthetic write failure"); } };
withAccountUsageOwner(ownerA, () => recordUsageEvent(assistantDispatchedEvent(fixtureRequest(), Date.now(), "conversation", ASSISTANT_MODEL)));
store.database = realDatabase;
check(readAccountUsageRows(ownerA).gap, "Write failure creates a visible coverage gap without throwing into AI");
equal(projectAccountUsage(readAccountUsageRows(ownerA).rows, Date.now(), true).assistant.state, "partial", "Gap is not displayed as zero/complete");
const restart = spawnSync(process.execPath, ["--input-type=module", "-e",
  `const {readAccountUsageRows}=await import('./src/lib/account-usage/accountUsageStore.ts');
   process.stdout.write(JSON.stringify({a:readAccountUsageRows(process.argv[1]).gap,b:readAccountUsageRows(process.argv[2]).gap}));`,
  ownerA, ownerB], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
equal(restart.status, 0, "Fresh process reads the account usage database");
equal(JSON.parse(restart.stdout), { a: true, b: false }, "Coverage gap survives process restart without bleeding to B");

const started = performance.now();
for (let index = 0; index < 50; index++) withAccountUsageOwner(ownerB, () => recordUsageEvent({
  eventKey: "accepted", operationRef: `latency-${index}`, attemptRef: `latency-${index}`, originRef: "synthetic",
  surface: "guidance_assistant", operationKind: "conversation", stage: "accepted", environment: "local_instance",
  acceptedAt: Date.now(),
}));
const averageWriteMs = (performance.now() - started) / 50;
check(averageWriteMs < 20, "Average synchronous local usage write remains below 20 ms in this run");
const databaseFile = path.resolve(".local/spec0015-phase3/phase5-oracle.sqlite");
check(fs.statSync(databaseFile).mode & 0o077 ? false : true, "Account usage database is private 0600");
check(!fs.readFileSync(databaseFile).includes(Buffer.from("synthetic account usage proof")), "Usage database contains no prompt text");
process.stdout.write(JSON.stringify({ status: "PASS", checks, averageWriteMs: Number(averageWriteMs.toFixed(2)),
  ownerAEvents: a.rows.length, ownerBEvents: b.rows.length, realProviderCalls: 0 }) + "\n");
