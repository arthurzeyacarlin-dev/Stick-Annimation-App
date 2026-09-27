export const USAGE_JOURNAL_SCHEMA = "diamond-usage-journal/v1" as const;
export const USAGE_SUMMARY_SCHEMA = "diamond-usage-summary/v1" as const;

export type UsageSurface = "project_ai" | "guidance_assistant";
export type UsageOperationKind = "conversation" | "hosted_search" | "dictation" | "animation_job";
export type UsageStage = "accepted" | "dispatched" | "provider_observed" | "terminal" | "reconciled";
export type UsageOutcome = "active" | "succeeded" | "failed" | "cancelled" | "timeout";
export type UsageQuality = "not_dispatched" | "observed" | "partial" | "unknown" | "reconciled";
export type ReconciliationState = "not_required" | "pending" | "reconciled" | "dead_letter";
export type TransportAttemptCoverage = "not_dispatched" | "single_dispatch" | "application_attempt_only" | "sdk_aggregate_unknown";

/**
 * Content-free input accepted by the server journal. References are transformed
 * into opaque journal identifiers before they enter the queue or durable file.
 */
export type UsageJournalEventInput = {
  eventKey: string;
  operationRef: string;
  attemptRef: string;
  originRef: string;
  surface: UsageSurface;
  operationKind: UsageOperationKind;
  stage: UsageStage;
  environment: string;
  provider?: string | null;
  requestedModel?: string | null;
  returnedModel?: string | null;
  reasoning?: string | null;
  acceptedAt?: number | null;
  dispatchedAt?: number | null;
  finishedAt?: number | null;
  outcome?: UsageOutcome | null;
  usageQuality?: UsageQuality | null;
  providerResponseId?: string | null;
  providerRequestId?: string | null;
  pricingVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  toolCalls?: number | null;
  audioSeconds?: number | null;
  estimatedCostUsd?: number | null;
  reportedCostUsd?: number | null;
  reportedCostUsdTicks?: string | null;
  reconciliationState?: ReconciliationState | null;
  transportAttemptCoverage?: TransportAttemptCoverage | null;
};

export type StoredUsageEvent = {
  schema: typeof USAGE_JOURNAL_SCHEMA;
  type: "usage";
  eventId: string;
  operationId: string;
  attemptId: string;
  originId: string;
  surface: UsageSurface;
  operationKind: UsageOperationKind;
  stage: UsageStage;
  environment: string;
  provider: string | null;
  requestedModel: string | null;
  returnedModel: string | null;
  reasoning: string | null;
  acceptedAt: number | null;
  dispatchedAt: number | null;
  finishedAt: number | null;
  recordedAt: number;
  outcome: UsageOutcome | null;
  usageQuality: UsageQuality | null;
  providerResponseId: string | null;
  providerRequestId: string | null;
  pricingVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  toolCalls: number | null;
  audioSeconds: number | null;
  estimatedCostUsd: number | null;
  reportedCostUsd: number | null;
  reportedCostUsdTicks: string | null;
  reconciliationState: ReconciliationState | null;
  transportAttemptCoverage: TransportAttemptCoverage | null;
};

export type UsageJournalControlRecord = {
  schema: typeof USAGE_JOURNAL_SCHEMA;
  type: "session_start" | "coverage_gap";
  recordId: string;
  recordedAt: number;
  sessionId: string;
  reason: "process_start" | "unclean_restart" | "queue_overflow" | "write_failure";
  lostEvents: number | null;
};

export type StoredUsageJournalRecord = StoredUsageEvent | UsageJournalControlRecord;

export type UsageAggregate = {
  operations: number;
  attempts: number;
  kinds: Record<UsageOperationKind, number>;
  outcomes: Record<UsageOutcome, number>;
  quality: Record<UsageQuality, number>;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: number;
  audioSeconds: number;
  estimatedCostUsd: number;
  reportedCostUsd: number;
  unknownCostAttempts: number;
};

export type UsageProviderAggregate = UsageAggregate & {
  provider: string;
  model: string | null;
};

export type UsageJournalSummary = {
  schema: typeof USAGE_SUMMARY_SCHEMA;
  scope: "local_instance";
  coverageStartedAt: number;
  coverageThrough: number;
  retentionDays: number;
  totals: UsageAggregate;
  bySurface: Record<UsageSurface, UsageAggregate>;
  byProvider: UsageProviderAggregate[];
  health: {
    state: "ready" | "degraded" | "unavailable";
    queueDepth: number;
    droppedEvents: number;
    failedWrites: number;
    coverageGaps: number;
    lastError: string | null;
    billingReady: false;
    storage: "local_append_only_file";
    processScope: "single_process";
  };
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
const aggregate = (value: unknown): value is UsageAggregate => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<UsageAggregate>;
  const outcomeCounts = row.outcomes;
  const qualityCounts = row.quality;
  const kindCounts = row.kinds;
  return integer(row.operations) && integer(row.attempts) && integer(row.inputTokens) && integer(row.outputTokens) &&
    integer(row.totalTokens) && integer(row.toolCalls) && finite(row.audioSeconds) && finite(row.estimatedCostUsd) &&
    finite(row.reportedCostUsd) && integer(row.unknownCostAttempts) && !!kindCounts && !!outcomeCounts && !!qualityCounts &&
    ["conversation", "hosted_search", "dictation", "animation_job"].every((key) => integer(kindCounts[key as UsageOperationKind])) &&
    ["active", "succeeded", "failed", "cancelled", "timeout"].every((key) => integer(outcomeCounts[key as UsageOutcome])) &&
    ["not_dispatched", "observed", "partial", "unknown", "reconciled"].every((key) => integer(qualityCounts[key as UsageQuality]));
};

export function parseUsageJournalSummary(value: unknown): UsageJournalSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Partial<UsageJournalSummary>;
  if (summary.schema !== USAGE_SUMMARY_SCHEMA || summary.scope !== "local_instance" || !integer(summary.coverageStartedAt) ||
    !integer(summary.coverageThrough) || !integer(summary.retentionDays) || !aggregate(summary.totals) ||
    !summary.bySurface || !aggregate(summary.bySurface.project_ai) || !aggregate(summary.bySurface.guidance_assistant) ||
    !Array.isArray(summary.byProvider) || !summary.byProvider.every((row) => aggregate(row) && typeof row.provider === "string" &&
      (row.model === null || typeof row.model === "string")) || !summary.health || summary.health.billingReady !== false ||
    !["ready", "degraded", "unavailable"].includes(summary.health.state) || !integer(summary.health.queueDepth) ||
    !integer(summary.health.droppedEvents) || !integer(summary.health.failedWrites) || !integer(summary.health.coverageGaps) ||
    (summary.health.lastError !== null && typeof summary.health.lastError !== "string") ||
    summary.health.storage !== "local_append_only_file" || summary.health.processScope !== "single_process") return null;
  return summary as UsageJournalSummary;
}
