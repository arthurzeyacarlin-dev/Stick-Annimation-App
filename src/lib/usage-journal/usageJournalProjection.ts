import {
  USAGE_SUMMARY_SCHEMA,
  type StoredUsageEvent,
  type StoredUsageJournalRecord,
  type UsageAggregate,
  type UsageJournalSummary,
  type UsageOperationKind,
  type UsageOutcome,
  type UsageProviderAggregate,
  type UsageQuality,
  type UsageSurface,
} from "./usageJournalContract.ts";

type Attempt = Omit<StoredUsageEvent, "eventId" | "stage" | "recordedAt" | "schema" | "type"> & {
  recordedAt: number;
  stages: Set<StoredUsageEvent["stage"]>;
};

const outcomes = (): Record<UsageOutcome, number> => ({ active: 0, succeeded: 0, failed: 0, cancelled: 0, timeout: 0 });
const quality = (): Record<UsageQuality, number> => ({ not_dispatched: 0, observed: 0, partial: 0, unknown: 0, reconciled: 0 });
const kinds = (): Record<UsageOperationKind, number> => ({ conversation: 0, hosted_search: 0, dictation: 0, animation_job: 0 });
const empty = (): UsageAggregate => ({
  operations: 0, attempts: 0, kinds: kinds(), outcomes: outcomes(), quality: quality(), inputTokens: 0, outputTokens: 0,
  totalTokens: 0, toolCalls: 0, audioSeconds: 0, estimatedCostUsd: 0, reportedCostUsd: 0, unknownCostAttempts: 0,
});
const latest = <T>(current: T | null, next: T | null) => next === null ? current : next;

function merge(events: StoredUsageEvent[]): Attempt {
  const first = events[0];
  const attempt: Attempt = {
    operationId: first.operationId, attemptId: first.attemptId, originId: first.originId, surface: first.surface,
    operationKind: first.operationKind, environment: first.environment, provider: null, requestedModel: null,
    returnedModel: null, reasoning: null, acceptedAt: null, dispatchedAt: null, finishedAt: null, outcome: null,
    usageQuality: null, providerResponseId: null, providerRequestId: null, pricingVersion: null, inputTokens: null,
    outputTokens: null, totalTokens: null, toolCalls: null, audioSeconds: null, estimatedCostUsd: null,
    reportedCostUsd: null, reportedCostUsdTicks: null, reconciliationState: null, transportAttemptCoverage: null,
    recordedAt: first.recordedAt, stages: new Set(),
  };
  for (const event of events.sort((a, b) => a.recordedAt - b.recordedAt)) {
    attempt.stages.add(event.stage);
    attempt.recordedAt = Math.max(attempt.recordedAt, event.recordedAt);
    attempt.surface = event.surface;
    if (attempt.operationKind === "conversation" || event.operationKind !== "conversation") attempt.operationKind = event.operationKind;
    attempt.environment = event.environment;
    attempt.provider = latest(attempt.provider, event.provider); attempt.requestedModel = latest(attempt.requestedModel, event.requestedModel);
    attempt.returnedModel = latest(attempt.returnedModel, event.returnedModel); attempt.reasoning = latest(attempt.reasoning, event.reasoning);
    attempt.acceptedAt = latest(attempt.acceptedAt, event.acceptedAt); attempt.dispatchedAt = latest(attempt.dispatchedAt, event.dispatchedAt);
    attempt.finishedAt = latest(attempt.finishedAt, event.finishedAt); attempt.outcome = latest(attempt.outcome, event.outcome);
    attempt.usageQuality = latest(attempt.usageQuality, event.usageQuality);
    attempt.providerResponseId = latest(attempt.providerResponseId, event.providerResponseId);
    attempt.providerRequestId = latest(attempt.providerRequestId, event.providerRequestId);
    attempt.pricingVersion = latest(attempt.pricingVersion, event.pricingVersion);
    attempt.inputTokens = latest(attempt.inputTokens, event.inputTokens); attempt.outputTokens = latest(attempt.outputTokens, event.outputTokens);
    attempt.totalTokens = latest(attempt.totalTokens, event.totalTokens); attempt.toolCalls = latest(attempt.toolCalls, event.toolCalls);
    attempt.audioSeconds = latest(attempt.audioSeconds, event.audioSeconds);
    attempt.estimatedCostUsd = latest(attempt.estimatedCostUsd, event.estimatedCostUsd);
    attempt.reportedCostUsd = latest(attempt.reportedCostUsd, event.reportedCostUsd);
    attempt.reportedCostUsdTicks = latest(attempt.reportedCostUsdTicks, event.reportedCostUsdTicks);
    attempt.reconciliationState = latest(attempt.reconciliationState, event.reconciliationState);
    attempt.transportAttemptCoverage = latest(attempt.transportAttemptCoverage, event.transportAttemptCoverage);
  }
  attempt.outcome ??= "active";
  attempt.usageQuality = attempt.reconciliationState === "reconciled" || attempt.stages.has("reconciled") ? "reconciled" :
    attempt.usageQuality ?? (attempt.stages.has("provider_observed") ? "partial" : attempt.stages.has("dispatched") ? "unknown" : "not_dispatched");
  return attempt;
}

function add(target: UsageAggregate, attempt: Attempt) {
  target.attempts++;
  target.kinds[attempt.operationKind]++;
  target.outcomes[attempt.outcome ?? "active"]++;
  target.quality[attempt.usageQuality ?? "unknown"]++;
  target.inputTokens += attempt.inputTokens ?? 0; target.outputTokens += attempt.outputTokens ?? 0;
  target.totalTokens += attempt.totalTokens ?? 0; target.toolCalls += attempt.toolCalls ?? 0;
  target.audioSeconds += attempt.audioSeconds ?? 0; target.estimatedCostUsd += attempt.estimatedCostUsd ?? 0;
  target.reportedCostUsd += attempt.reportedCostUsd ?? 0;
  if (attempt.estimatedCostUsd === null && attempt.reportedCostUsd === null) target.unknownCostAttempts++;
}

export function projectUsageJournal(records: StoredUsageJournalRecord[], options: {
  retentionDays: number;
  now: number;
  queueDepth: number;
  droppedEvents: number;
  failedWrites: number;
  pendingCoverageGaps: number;
  lastError: string | null;
  unavailable: boolean;
}): UsageJournalSummary {
  const groups = new Map<string, StoredUsageEvent[]>();
  for (const record of records) if (record.type === "usage") groups.set(record.attemptId, [...(groups.get(record.attemptId) ?? []), record]);
  const attempts = [...groups.values()].map(merge);
  const totals = empty();
  const bySurface: Record<UsageSurface, UsageAggregate> = { project_ai: empty(), guidance_assistant: empty() };
  const providers = new Map<string, UsageProviderAggregate>();
  const operations = new Set<string>();
  const surfaceOperations: Record<UsageSurface, Set<string>> = { project_ai: new Set(), guidance_assistant: new Set() };
  const providerOperations = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    operations.add(attempt.operationId); surfaceOperations[attempt.surface].add(attempt.operationId);
    add(totals, attempt); add(bySurface[attempt.surface], attempt);
    if (attempt.provider) {
      const model = attempt.returnedModel ?? attempt.requestedModel;
      const key = `${attempt.provider}\u0000${model ?? ""}`;
      const row = providers.get(key) ?? { ...empty(), provider: attempt.provider, model };
      providers.set(key, row); add(row, attempt);
      const ids = providerOperations.get(key) ?? new Set<string>(); ids.add(attempt.operationId); providerOperations.set(key, ids);
    }
  }
  totals.operations = operations.size;
  for (const surface of Object.keys(bySurface) as UsageSurface[]) bySurface[surface].operations = surfaceOperations[surface].size;
  for (const [key, row] of providers) row.operations = providerOperations.get(key)?.size ?? 0;
  const persistedGaps = records.filter((record) => record.type === "coverage_gap").length;
  let coverageStartedAt = options.now;
  for (const record of records) coverageStartedAt = Math.min(coverageStartedAt, record.recordedAt);
  const degraded = options.droppedEvents > 0 || options.failedWrites > 0 || persistedGaps > 0 || options.pendingCoverageGaps > 0 || !!options.lastError;
  return {
    schema: USAGE_SUMMARY_SCHEMA, scope: "local_instance", coverageStartedAt, coverageThrough: options.now,
    retentionDays: options.retentionDays, totals, bySurface,
    byProvider: [...providers.values()].sort((a, b) => `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`)),
    health: {
      state: options.unavailable ? "unavailable" : degraded ? "degraded" : "ready", queueDepth: options.queueDepth,
      droppedEvents: options.droppedEvents, failedWrites: options.failedWrites,
      coverageGaps: persistedGaps + options.pendingCoverageGaps, lastError: options.lastError, billingReady: false,
      storage: "local_append_only_file", processScope: "single_process",
    },
  };
}
