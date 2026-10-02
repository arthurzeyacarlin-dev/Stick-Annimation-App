import { emptySource, type DashboardReceipt, type DashboardSnapshot, type DashboardSourceSnapshot } from
  "../ai-dashboard/dashboardContract.ts";
import type { AccountUsageEvent, AccountUsageRow } from "./accountUsageStore.ts";

type Attempt = { id: string; surface: "project_ai" | "guidance_assistant"; kind: AccountUsageEvent["operationKind"];
  observed: AccountUsageRow | null; terminal: AccountUsageEvent["outcome"] | null; dispatched: boolean };
const sourceFor = (surface: Attempt["surface"]) => surface === "project_ai" ? "project" : "assistant";

export function projectAccountUsage(rows: AccountUsageRow[], readAt: number, gap: boolean): DashboardSnapshot {
  const project = emptySource("ready");
  const assistant = emptySource("ready");
  const source = (surface: Attempt["surface"]): DashboardSourceSnapshot => surface === "project_ai" ? project : assistant;
  const attempts = new Map<string, Attempt>();
  for (const row of rows) {
    const event = row.event;
    if (event.surface !== "project_ai" && event.surface !== "guidance_assistant") continue;
    const attempt = attempts.get(row.attemptId) ?? { id: row.attemptId, surface: event.surface,
      kind: event.operationKind, observed: null, terminal: null, dispatched: false };
    if (attempt.surface !== event.surface) { source(attempt.surface).state = "partial"; continue; }
    if (event.stage === "dispatched") attempt.dispatched = true;
    if (event.stage === "terminal") attempt.terminal = event.outcome ?? "failed";
    if (event.stage === "provider_observed" && (!attempt.observed ||
      (event.usageQuality === "observed" && attempt.observed.event.usageQuality !== "observed") ||
      (event.totalTokens !== null && event.totalTokens !== undefined && attempt.observed.event.totalTokens == null))) {
      attempt.observed = row;
    }
    attempts.set(row.attemptId, attempt);
  }
  for (const attempt of attempts.values()) {
    const target = source(attempt.surface);
    if (attempt.terminal === "failed" || attempt.terminal === "timeout") target.failed++;
    else if (attempt.terminal === "cancelled") target.cancelled++;
    else if (!attempt.terminal) target.pending++;
    const observed = attempt.observed;
    if (!observed) {
      if (attempt.dispatched && attempt.terminal) {
        target.state = "partial";
        target.issues.push("A dispatched AI attempt has unknown provider usage.");
      }
      continue;
    }
    const event = observed.event;
    const at = event.finishedAt ?? observed.recordedAt;
    if (!Number.isSafeInteger(at) || at <= 0 || at > readAt) {
      target.state = "partial"; target.issues.push("A usage receipt has an invalid time."); continue;
    }
    const receipt: DashboardReceipt = {
      id: observed.eventId, source: sourceFor(attempt.surface), at,
      inputTokens: event.inputTokens ?? null, outputTokens: event.outputTokens ?? null,
      totalTokens: event.totalTokens ?? null, estimatedCostUsd: event.estimatedCostUsd ?? null,
      priceDate: event.pricingVersion ?? null, model: event.returnedModel ?? event.requestedModel ?? null,
      reasoning: event.reasoning ?? null, toolCalls: event.toolCalls ?? 0,
    };
    if (receipt.totalTokens === null && attempt.kind !== "dictation") {
      target.state = "partial"; target.issues.push("A provider did not report token usage.");
    }
    if (event.transportAttemptCoverage === "sdk_aggregate_unknown" ||
      event.transportAttemptCoverage === "application_attempt_only") {
      target.state = "partial";
      const issue = "Provider-internal retries are not independently measured; known usage is shown, but total usage may be higher.";
      if (!target.issues.includes(issue)) target.issues.push(issue);
    }
    target.receipts.push(receipt);
  }
  if (gap) {
    for (const target of [project, assistant]) {
      target.state = "partial";
      target.issues.push("Some account usage may not have been recorded. Previous confirmed records are intact.");
    }
  }
  return { project, assistant, readAt };
}
