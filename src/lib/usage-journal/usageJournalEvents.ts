import { AI_ANIMATOR_MODEL, type AiAnimatorRequest, type AiAnimatorUsage } from "../ai/aiAnimatorContract.ts";
import { ASSISTANT_MODEL, type AssistantRequest } from "../assistant/assistantContracts.ts";
import { TRANSCRIPTION_MODEL } from "../assistant/assistantDictationContract.ts";
import type { UsageJournalEventInput, UsageOperationKind, UsageOutcome, UsageQuality } from "./usageJournalContract.ts";

const environment = "local_instance";
type ProjectUsageIdentity = Pick<AiAnimatorRequest, "jobId" | "turnId" | "reasoningLevel"> & {
  workspace: Pick<AiAnimatorRequest["workspace"], "projectId">;
};
const quality = (values: Array<number | null | undefined>): UsageQuality => {
  const known = values.filter((value) => typeof value === "number").length;
  return known === values.length ? "observed" : known > 0 ? "partial" : "unknown";
};

const projectBase = (request: ProjectUsageIdentity, eventKey: string, stage: UsageJournalEventInput["stage"]): UsageJournalEventInput => ({
  eventKey, operationRef: request.turnId, attemptRef: request.jobId, originRef: request.workspace.projectId,
  surface: "project_ai", operationKind: "conversation", stage, environment,
});

export const projectAcceptedEvent = (request: AiAnimatorRequest, at: number): UsageJournalEventInput => ({
  ...projectBase(request, "accepted", "accepted"), reasoning: request.reasoningLevel, acceptedAt: at,
  requestedModel: AI_ANIMATOR_MODEL, transportAttemptCoverage: "not_dispatched",
});

export const projectDispatchedEvent = (request: AiAnimatorRequest, at: number, requestedModel: string): UsageJournalEventInput => ({
  ...projectBase(request, "dispatched", "dispatched"), reasoning: request.reasoningLevel, dispatchedAt: at,
  provider: "openai", requestedModel, reconciliationState: "pending", transportAttemptCoverage: "sdk_aggregate_unknown",
});

export const projectProviderObservedEvent = (request: AiAnimatorRequest, observed: {
  requestedModel: string;
  returnedModel: string | null;
  responseId: string | null;
  usage: AiAnimatorUsage;
  pricingVersion: string;
}): UsageJournalEventInput => ({
  ...projectBase(request, "provider-observed", "provider_observed"), reasoning: request.reasoningLevel,
  provider: "openai", requestedModel: observed.requestedModel, returnedModel: observed.returnedModel,
  providerResponseId: observed.responseId, inputTokens: observed.usage.inputTokens, outputTokens: observed.usage.outputTokens,
  totalTokens: observed.usage.totalTokens, estimatedCostUsd: observed.usage.estimatedCostUsd,
  usageQuality: quality([observed.usage.inputTokens, observed.usage.outputTokens, observed.usage.totalTokens]),
  pricingVersion: observed.pricingVersion, reconciliationState: "pending", transportAttemptCoverage: "sdk_aggregate_unknown",
});

export const projectTerminalEvent = (request: ProjectUsageIdentity, outcome: UsageOutcome, at: number): UsageJournalEventInput => ({
  ...projectBase(request, "terminal", "terminal"), reasoning: request.reasoningLevel, finishedAt: at, outcome,
});

const assistantBase = (request: AssistantRequest, eventKey: string, stage: UsageJournalEventInput["stage"],
  operationKind: UsageOperationKind = "conversation"): UsageJournalEventInput => ({
  eventKey, operationRef: request.turnId, attemptRef: request.jobId, originRef: request.sessionId,
  surface: "guidance_assistant", operationKind, stage, environment,
});

export const assistantAcceptedEvent = (request: AssistantRequest, at: number): UsageJournalEventInput => ({
  ...assistantBase(request, "accepted", "accepted"), reasoning: request.reasoningLevel, acceptedAt: at,
  requestedModel: ASSISTANT_MODEL, transportAttemptCoverage: "not_dispatched",
});

export const assistantDispatchedEvent = (request: AssistantRequest, at: number, operationKind: "conversation" | "hosted_search",
  requestedModel: string): UsageJournalEventInput => ({
  ...assistantBase(request, "dispatched", "dispatched", operationKind), reasoning: request.reasoningLevel, dispatchedAt: at,
  provider: "openai", requestedModel, reconciliationState: "pending", transportAttemptCoverage: "application_attempt_only",
});

export const assistantProviderObservedEvent = (request: AssistantRequest, observed: {
  operationKind: "conversation" | "hosted_search";
  returnedModel: string | null;
  responseId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  toolCalls: number | null;
  estimatedCostUsd: number | null;
  pricingVersion: string;
}): UsageJournalEventInput => ({
  ...assistantBase(request, "provider-observed", "provider_observed", observed.operationKind), reasoning: request.reasoningLevel,
  provider: "openai", requestedModel: ASSISTANT_MODEL, returnedModel: observed.returnedModel,
  providerResponseId: observed.responseId, inputTokens: observed.inputTokens, outputTokens: observed.outputTokens,
  totalTokens: observed.totalTokens, toolCalls: observed.toolCalls, estimatedCostUsd: observed.estimatedCostUsd,
  usageQuality: quality([observed.inputTokens, observed.outputTokens, observed.totalTokens]), pricingVersion: observed.pricingVersion,
  reconciliationState: "pending", transportAttemptCoverage: "application_attempt_only",
});

export const assistantTerminalEvent = (request: AssistantRequest, outcome: UsageOutcome, at: number): UsageJournalEventInput => ({
  ...assistantBase(request, "terminal", "terminal"), reasoning: request.reasoningLevel, finishedAt: at, outcome,
});

const dictationBase = (id: string, eventKey: string, stage: UsageJournalEventInput["stage"]): UsageJournalEventInput => ({
  eventKey, operationRef: id, attemptRef: id, originRef: id, surface: "guidance_assistant", operationKind: "dictation",
  stage, environment,
});

export const dictationAcceptedEvent = (id: string, at: number): UsageJournalEventInput => ({
  ...dictationBase(id, "accepted", "accepted"), acceptedAt: at, requestedModel: TRANSCRIPTION_MODEL,
  transportAttemptCoverage: "not_dispatched",
});

export const dictationDispatchedEvent = (id: string, at: number): UsageJournalEventInput => ({
  ...dictationBase(id, "dispatched", "dispatched"), dispatchedAt: at, provider: "openai", requestedModel: TRANSCRIPTION_MODEL,
  reconciliationState: "pending", transportAttemptCoverage: "single_dispatch",
});

export const dictationProviderObservedEvent = (id: string, eventKey: "provider-headers" | "provider-body", observed: {
  returnedModel: string | null;
  providerRequestId: string | null;
  seconds: number | null;
  estimatedCostUsd: number | null;
  complete: boolean;
}): UsageJournalEventInput => ({
  ...dictationBase(id, eventKey, "provider_observed"), provider: "openai", requestedModel: TRANSCRIPTION_MODEL,
  returnedModel: observed.returnedModel, providerRequestId: observed.providerRequestId, audioSeconds: observed.seconds,
  estimatedCostUsd: observed.estimatedCostUsd, usageQuality: observed.complete ? "observed" : "partial",
  pricingVersion: "assistant-dictation-2026-09-24-v1", reconciliationState: "pending", transportAttemptCoverage: "single_dispatch",
});

export const dictationTerminalEvent = (id: string, outcome: UsageOutcome, at: number): UsageJournalEventInput => ({
  ...dictationBase(id, "terminal", "terminal"), finishedAt: at, outcome,
});

export type UsageEventRecorder = (event: UsageJournalEventInput) => boolean;
export const noUsageEventRecorder: UsageEventRecorder = () => true;
