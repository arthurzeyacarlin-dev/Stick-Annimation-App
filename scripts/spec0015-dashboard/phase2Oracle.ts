import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseUsageJournalSummary, type UsageJournalEventInput } from "../../src/lib/usage-journal/usageJournalContract.ts";
import {
  assistantAcceptedEvent, assistantProviderObservedEvent, dictationProviderObservedEvent, projectAcceptedEvent,
  projectProviderObservedEvent,
} from "../../src/lib/usage-journal/usageJournalEvents.ts";
import { UsageJournalStore, type UsageJournalPolicy } from "../../src/lib/usage-journal/usageJournalStore.ts";
import { USAGE_JOURNAL_POLICY, USAGE_JOURNAL_RETENTION_DAYS } from "../../src/lib/usage-journal/usageJournalRuntime.ts";

type Fixture = {
  schema: string; productRetentionDays: number; retentionTestDays: number; queueLimit: number; batchSize: number; maxFileBytes: number;
  writeRetryLimit: number; writeRetryDelayMs: number; frozenNow: string;
};
const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0015-dashboard/phase2.json", "utf8")) as Fixture;
assert.equal(fixture.schema, "spec0015-dashboard-phase2-test-fixture/v1");
assert.equal(fixture.productRetentionDays, 90);
assert.equal(USAGE_JOURNAL_RETENTION_DAYS, 90);
assert.equal(USAGE_JOURNAL_POLICY.retentionDays, 90);
const scratch = mkdtempSync(join(tmpdir(), "spec0015-phase2-oracle-"));
const output = resolve("output/spec0015/phase2");
mkdirSync(output, { recursive: true });
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
const baseNow = Date.parse(fixture.frozenNow);
const policy: UsageJournalPolicy = {
  retentionDays: fixture.retentionTestDays, maxFileBytes: fixture.maxFileBytes, queueLimit: fixture.queueLimit,
  batchSize: fixture.batchSize, writeRetryLimit: fixture.writeRetryLimit, writeRetryDelayMs: fixture.writeRetryDelayMs,
};
const event = (overrides: Partial<UsageJournalEventInput> = {}): UsageJournalEventInput => ({
  eventKey: "accepted", operationRef: "operation-alpha", attemptRef: "attempt-alpha", originRef: "do-not-persist-origin",
  surface: "project_ai", operationKind: "conversation", stage: "accepted", environment: "local_test", acceptedAt: baseNow,
  ...overrides,
});

try {
  const contentSentinel = "PRIVATE-CONTENT-MUST-NEVER-PERSIST";
  const projectRequest = {
    jobId: "project-job-1234", turnId: "project-turn-1234", message: contentSentinel, reasoningLevel: "medium" as const,
    recentConversation: [{ role: "user" as const, content: contentSentinel }],
    workspace: { projectId: "project-origin-1234", projectTitle: contentSentinel, projectGeneration: 1, totalLayers: 1,
      authoredFrameCount: 1, timelineFps: 12, activeTool: contentSentinel },
  };
  const assistantRequest = {
    schema: "diamond-assistant-request/v1" as const, jobId: "assistantjob1234", sessionId: "assistantsession1234",
    turnId: "assistantturn1234", message: contentSentinel, reasoningLevel: "high" as const, recentConversation: [{
      id: "messageid1234", turnId: "earlierturn1234", role: "user" as const, text: contentSentinel, at: baseNow,
    }], catalogVersion: "diamond-animator-knowledge/v1:2026-09-24" as const, clientSessionRevision: 1,
  };
  const mapped = [
    projectAcceptedEvent(projectRequest, baseNow),
    projectProviderObservedEvent(projectRequest, { requestedModel: "gpt-5.6-terra", returnedModel: "gpt-5.6-terra",
      responseId: "response-mapper", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, estimatedCostUsd: 0.000026 },
      pricingVersion: "project-estimator-v1" }),
    assistantAcceptedEvent(assistantRequest, baseNow),
    assistantProviderObservedEvent(assistantRequest, { operationKind: "hosted_search", returnedModel: "gpt-5.6-terra",
      responseId: "response-assistant-mapper", inputTokens: 1, outputTokens: 2, totalTokens: 3, toolCalls: 1,
      estimatedCostUsd: 0.010026, pricingVersion: "assistant-search-2026-09-23-v1" }),
    dictationProviderObservedEvent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "provider-body", {
      returnedModel: null, providerRequestId: "request-dictation-mapper", seconds: 1.5, estimatedCostUsd: 0.0001125, complete: true,
    }),
  ];
  check(!JSON.stringify(mapped).includes(contentSentinel), "live event mappers cannot copy prompt, history, project title or transcript content");
  check(mapped.every((row) => !Object.keys(row).some((key) => /^(?:prompt|message|reply|text|rawAudio|transcript|query|url|secret)/i.test(key))),
    "event mapper contract has no raw-content-shaped key");

  const path = join(scratch, "journal.ndjson");
  let now = baseNow;
  const journal = new UsageJournalStore({ filePath: path, policy, now: () => now, sessionId: "session-test-one" });
  check(journal.enqueue(event()), "accepted event enqueues");
  check(journal.enqueue(event()), "duplicate event is accepted idempotently");
  check(journal.enqueue(event({ eventKey: "dispatched", stage: "dispatched", dispatchedAt: now + 1,
    provider: "openai", requestedModel: "gpt-5.6-terra", pricingVersion: "project-estimator-v1",
    reconciliationState: "pending", transportAttemptCoverage: "sdk_aggregate_unknown" })), "Project dispatch enqueues");
  check(journal.enqueue(event({ eventKey: "provider-observed", stage: "provider_observed", provider: "openai",
    requestedModel: "gpt-5.6-terra", returnedModel: "gpt-5.6-terra", providerResponseId: "response-alpha",
    usageQuality: "observed", inputTokens: 100, outputTokens: 25, totalTokens: 125, estimatedCostUsd: 0.0005,
    pricingVersion: "project-estimator-v1", reconciliationState: "pending", transportAttemptCoverage: "sdk_aggregate_unknown" })),
  "provider usage enqueues before downstream terminal state");
  check(journal.enqueue(event({ eventKey: "provider-observed", stage: "provider_observed", provider: "openai",
    requestedModel: "gpt-5.6-terra", returnedModel: "gpt-5.6-terra", usageQuality: "observed",
    inputTokens: 999999, outputTokens: 999999, totalTokens: 1999998, estimatedCostUsd: 999 })),
  "conflicting duplicate event is accepted idempotently rather than overwriting first evidence");
  check(journal.enqueue(event({ eventKey: "terminal-cancelled", stage: "terminal", finishedAt: now + 2, outcome: "cancelled" })),
  "cancelled answer is independent of observed provider usage");

  check(journal.enqueue(event({ eventKey: "assistant-accepted", operationRef: "assistant-turn", attemptRef: "assistant-attempt",
    originRef: "assistant-session", surface: "guidance_assistant", acceptedAt: now })), "Assistant acceptance enqueues");
  check(journal.enqueue(event({ eventKey: "assistant-dispatched", operationRef: "assistant-turn", attemptRef: "assistant-attempt",
    originRef: "assistant-session", surface: "guidance_assistant", stage: "dispatched", operationKind: "hosted_search",
    provider: "openai", requestedModel: "gpt-5.6-terra", dispatchedAt: now + 1, transportAttemptCoverage: "application_attempt_only" })),
  "Assistant hosted-search dispatch enqueues");
  check(journal.enqueue(event({ eventKey: "assistant-provider-observed", operationRef: "assistant-turn", attemptRef: "assistant-attempt",
    originRef: "assistant-session", surface: "guidance_assistant", stage: "provider_observed", operationKind: "hosted_search",
    provider: "openai", requestedModel: "gpt-5.6-terra", returnedModel: "gpt-5.6-terra", usageQuality: "partial",
    inputTokens: 60, outputTokens: null, totalTokens: null, toolCalls: 1, estimatedCostUsd: 0.01012,
    pricingVersion: "assistant-search-2026-09-23-v1", reconciliationState: "pending" })),
  "partial provider usage survives later validation failure");
  check(journal.enqueue(event({ eventKey: "assistant-terminal-failed", operationRef: "assistant-turn", attemptRef: "assistant-attempt",
    originRef: "assistant-session", surface: "guidance_assistant", stage: "terminal", operationKind: "hosted_search",
    finishedAt: now + 3, outcome: "failed" })), "downstream failure enqueues separately");

  check(journal.enqueue(event({ eventKey: "dictation-accepted", operationRef: "dictation-id", attemptRef: "dictation-id",
    originRef: "dictation-id", surface: "guidance_assistant", operationKind: "dictation", acceptedAt: now })), "dictation acceptance enqueues");
  check(journal.enqueue(event({ eventKey: "dictation-terminal", operationRef: "dictation-id", attemptRef: "dictation-id",
    originRef: "dictation-id", surface: "guidance_assistant", operationKind: "dictation", stage: "terminal",
    finishedAt: now + 1, outcome: "failed", transportAttemptCoverage: "not_dispatched" })), "pre-dispatch dictation failure enqueues");

  check(journal.enqueue(event({ eventKey: "future-provider-accepted", operationRef: "future-provider-op", attemptRef: "future-provider-attempt",
    originRef: "future-provider-origin", surface: "guidance_assistant", acceptedAt: now })), "provider-neutral operation acceptance");
  check(journal.enqueue(event({ eventKey: "future-provider-observed", operationRef: "future-provider-op", attemptRef: "future-provider-attempt",
    originRef: "future-provider-origin", surface: "guidance_assistant", stage: "provider_observed", provider: "xai",
    requestedModel: "future-model-test", returnedModel: "future-model-test", usageQuality: "observed", inputTokens: 10,
    outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.25, reportedCostUsd: 0.2,
    reportedCostUsdTicks: "2000000000", pricingVersion: "provider-reported-test", reconciliationState: "pending",
    transportAttemptCoverage: "single_dispatch" })), "future provider-reported and estimated cost fields remain distinct");
  check(journal.enqueue(event({ eventKey: "future-provider-terminal", operationRef: "future-provider-op", attemptRef: "future-provider-attempt",
    originRef: "future-provider-origin", surface: "guidance_assistant", stage: "terminal", finishedAt: now + 1, outcome: "succeeded" })),
  "provider-neutral terminal event enqueues");

  check(journal.enqueue(event({ eventKey: "crash-accepted", operationRef: "crash-op", attemptRef: "crash-attempt",
    originRef: "crash-origin", acceptedAt: now })), "crash probe acceptance enqueues");
  check(journal.enqueue(event({ eventKey: "crash-dispatched", operationRef: "crash-op", attemptRef: "crash-attempt",
    originRef: "crash-origin", stage: "dispatched", dispatchedAt: now + 1, provider: "openai", requestedModel: "gpt-5.6-terra",
    transportAttemptCoverage: "sdk_aggregate_unknown", reconciliationState: "pending" })), "crash probe dispatch enqueues without terminal replay");
  await journal.drain();
  const summary = await journal.summary();
  check(parseUsageJournalSummary(summary) !== null, "aggregate-only summary validates");
  equal(summary.totals.operations, 5, "five logical operations");
  equal(summary.totals.attempts, 5, "duplicate event does not duplicate an attempt");
  equal(summary.totals.outcomes.cancelled, 1, "cancelled answer retained");
  equal(summary.totals.outcomes.failed, 2, "downstream and pre-dispatch failures retained");
  equal(summary.totals.outcomes.active, 1, "dispatched crash remains active rather than fabricated terminal state");
  equal(summary.totals.quality.observed, 2, "observed Project and provider-neutral attempts");
  equal(summary.totals.quality.partial, 1, "partial Assistant attempt");
  equal(summary.totals.quality.not_dispatched, 1, "dictation pre-dispatch failure");
  equal(summary.totals.quality.unknown, 1, "dispatched crash has unknown usage");
  equal(summary.totals.estimatedCostUsd, 0.26062, "estimated costs sum independently");
  equal(summary.totals.reportedCostUsd, 0.2, "provider-reported cost is not added to estimate");
  equal(summary.totals.toolCalls, 1, "hosted search belongs to parent attempt once");
  equal(summary.totals.kinds, { conversation: 3, hosted_search: 1, dictation: 1, animation_job: 0 },
    "conversation, hosted search and dictation remain distinct while animation is inactive");
  equal(summary.totals.inputTokens, 170, "conflicting duplicate cannot inflate retained token totals");
  check(summary.byProvider.some((row) => row.provider === "xai" && row.model === "future-model-test"),
    "schema accepts an arbitrary future provider/model without enabling animation jobs");
  const bytes = readFileSync(path, "utf8");
  check(!bytes.includes("operation-alpha") && !bytes.includes("attempt-alpha") && !bytes.includes("do-not-persist-origin"),
    "raw operation, attempt and origin references never enter durable bytes");
  check(!bytes.includes("promptText") && !bytes.includes("replyText") && !bytes.includes("rawAudio") && !bytes.includes("transcriptText") &&
    !bytes.includes('"url"') && !bytes.includes('"secret"') && !bytes.includes("http"),
  "journal has no content, URL or secret-shaped fields; audioSeconds remains a permitted metric");

  now += 1000;
  const restarted = new UsageJournalStore({ filePath: path, policy, now: () => now, sessionId: "session-test-two" });
  const afterRestart = await restarted.summary();
  equal(afterRestart.totals.attempts, 5, "durable attempts survive restart");
  check(afterRestart.health.coverageGaps >= 1 && afterRestart.health.state === "degraded", "unclean restart is a truthful coverage gap");

  const overflowPath = join(scratch, "overflow.ndjson");
  const scheduled: Array<() => void> = [];
  const overflow = new UsageJournalStore({ filePath: overflowPath, policy: { ...policy, queueLimit: 2, batchSize: 1 },
    now: () => baseNow, schedule: (work) => scheduled.push(work), sessionId: "session-overflow" });
  const enqueueStarted = performance.now();
  check(overflow.enqueue(event({ attemptRef: "overflow-one", eventKey: "one" })) &&
    overflow.enqueue(event({ attemptRef: "overflow-two", eventKey: "two" })), "bounded queue accepts capacity");
  equal(overflow.enqueue(event({ attemptRef: "overflow-three", eventKey: "three" })), false, "bounded queue rejects overflow without throwing");
  check(performance.now() - enqueueStarted < 25 && !existsSync(overflowPath) && scheduled.length === 1,
    "enqueue is synchronous, bounded and performs no filesystem work");
  const overflowSummary = await overflow.summary();
  equal(overflowSummary.totals.attempts, 2, "overflow does not corrupt confirmed queued events");
  check(overflowSummary.health.droppedEvents === 1 && overflowSummary.health.coverageGaps >= 1, "overflow is explicit and alertable");

  const badParent = join(scratch, "not-a-directory");
  writeFileSync(badParent, "occupied");
  const failed = new UsageJournalStore({ filePath: join(badParent, "journal.ndjson"), policy, now: () => baseNow,
    sessionId: "session-write-failure" });
  check(failed.enqueue(event({ attemptRef: "write-failure", eventKey: "write-failure" })), "write failure cannot throw into enqueue");
  await failed.drain();
  const failedSummary = await failed.summary();
  check(failedSummary.health.state === "unavailable" && failedSummary.health.failedWrites === 1 && failedSummary.totals.attempts === 0,
    "store failure changes telemetry health without inventing a confirmed event");

  const retainedPath = join(scratch, "retention.ndjson");
  let retentionNow = baseNow;
  const old = new UsageJournalStore({ filePath: retainedPath, policy, now: () => retentionNow, sessionId: "session-retention-old" });
  old.enqueue(event({ attemptRef: "expired-attempt", eventKey: "expired" })); await old.drain();
  retentionNow += 3 * 24 * 60 * 60 * 1000;
  const current = new UsageJournalStore({ filePath: retainedPath, policy, now: () => retentionNow, sessionId: "session-retention-new" });
  const retainedSummary = await current.summary();
  equal(retainedSummary.totals.attempts, 0, "records older than the injected test retention window are removed");
  equal(retainedSummary.retentionDays, fixture.retentionTestDays, "test policy is explicit and not a production choice");

  const liveRetentionPath = join(scratch, "live-retention.ndjson");
  let liveNow = baseNow;
  const liveRetention = new UsageJournalStore({ filePath: liveRetentionPath, policy, now: () => liveNow, sessionId: "session-live-retention" });
  liveRetention.enqueue(event({ attemptRef: "live-expired-attempt", eventKey: "live-expired" })); await liveRetention.drain();
  liveNow += 3 * 24 * 60 * 60 * 1000;
  equal((await liveRetention.summary()).totals.attempts, 0, "long-running store applies retention without requiring restart");

  const corruptPath = join(scratch, "corrupt.ndjson");
  const corruptBytes = "{preserve-this-corrupt-tail";
  writeFileSync(corruptPath, corruptBytes);
  const corrupt = new UsageJournalStore({ filePath: corruptPath, policy, now: () => baseNow, sessionId: "session-corrupt" });
  check(corrupt.enqueue(event({ attemptRef: "corrupt-attempt", eventKey: "corrupt" })), "corrupt store cannot throw into enqueue");
  const corruptSummary = await corrupt.summary();
  check(corruptSummary.health.state === "unavailable" && corruptSummary.totals.attempts === 0, "corrupt durable bytes are not treated as valid evidence");
  equal(readFileSync(corruptPath, "utf8"), corruptBytes, "corrupt durable bytes remain unchanged for recovery");

  const invalidPath = join(scratch, "invalid.ndjson");
  const invalid = new UsageJournalStore({ filePath: invalidPath, policy, now: () => baseNow, sessionId: "session-invalid" });
  equal(invalid.enqueue(event({ operationKind: "animation_job" })), false, "future animation kind remains reserved and inactive");
  const invalidSummary = await invalid.summary();
  check(invalidSummary.health.droppedEvents === 1 && invalidSummary.totals.attempts === 0, "inactive animation event cannot leak into totals");

  const result = { schema: "spec0015-phase2-oracle/v1", pass: true, checks, testRetentionDays: fixture.retentionTestDays,
    productRetentionConfigured: true, productRetentionDays: USAGE_JOURNAL_RETENTION_DAYS,
    scenarios: ["dedupe", "conflicting-dedupe", "restart", "crash-gap", "retention", "queue-overflow", "write-failure", "corrupt-byte-preservation",
      "provider-observed-before-validation", "cancel-after-provider", "not-dispatched", "partial", "future-provider-neutrality", "content-free-bytes"] };
  writeFileSync(join(output, "oracle.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`SPEC-0015 Phase 2 oracle PASS (${checks} checks; 90-day rolling local retention)`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
