import { createHash } from "node:crypto";
import {
  AI_ANIMATOR_REASONING_EFFORT,
  AI_ANIMATOR_MODEL,
  isAiAnimatorTerminalStatus,
  type AiAnimatorJobEvent,
  type AiAnimatorJobSnapshot,
  type AiAnimatorProviderResult,
  type AiAnimatorRequest,
} from "./aiAnimatorContract.ts";
import {
  noUsageEventRecorder, projectAcceptedEvent, projectTerminalEvent, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";

type Provider = (request: AiAnimatorRequest, options: { signal: AbortSignal }) => Promise<AiAnimatorProviderResult>;
type InternalJob = AiAnimatorJobSnapshot & { ownerId: string; abortController: AbortController };

const SERVER_DEADLINE_MS = 90_000;
const emptyUsage = { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null };
const promptDigest = (message: string) => createHash("sha256").update(message).digest("hex");
const usageIdentity = (job: InternalJob) => ({
  jobId: job.jobId, turnId: job.turnId, reasoningLevel: job.reasoningLevel, workspace: { projectId: job.projectId },
});

const publicSnapshot = (job: InternalJob): AiAnimatorJobSnapshot => {
  const { abortController: _abortController, ownerId: _ownerId, ...snapshot } = job;
  void _abortController;
  void _ownerId;
  return structuredClone(snapshot);
};

export class AiAnimatorJobService {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly provider: Provider;
  private readonly recordUsage: UsageEventRecorder;

  constructor(provider: Provider, recordUsage: UsageEventRecorder = noUsageEventRecorder) {
    this.provider = provider;
    this.recordUsage = recordUsage;
  }

  private meter(event: Parameters<UsageEventRecorder>[0]) { try { this.recordUsage(event); } catch { /* Best-effort observation only. */ } }

  submit(request: AiAnimatorRequest, ownerId = "legacy-local-owner") {
    const existing = this.jobs.get(request.jobId);
    if (existing) {
      if (existing.ownerId !== ownerId) throw Object.assign(new Error("This AI Animator job is not available to this account."), { status: 403 });
      return publicSnapshot(existing);
    }
    const workspaceActiveJob = [...this.jobs.values()].find(
      (job) => job.ownerId === ownerId && job.projectId === request.workspace.projectId && !isAiAnimatorTerminalStatus(job.status),
    );
    if (workspaceActiveJob) {
      throw Object.assign(new Error("This workspace already has an active AI Animator request."), { status: 409 });
    }
    const environmentActiveCount = [...this.jobs.values()].filter((job) => job.ownerId === ownerId && !isAiAnimatorTerminalStatus(job.status)).length;
    if (environmentActiveCount >= 2) {
      throw Object.assign(new Error("AI Animator is busy. Try again after an active request finishes."), { status: 429 });
    }

    const now = new Date().toISOString();
    const event: AiAnimatorJobEvent = { sequence: 1, status: "thinking", createdAt: now };
    const job: InternalJob = {
      version: 1,
      ownerId,
      jobId: request.jobId,
      turnId: request.turnId,
      projectId: request.workspace.projectId,
      projectGeneration: request.workspace.projectGeneration,
      reasoningLevel: request.reasoningLevel,
      intent: null,
      status: "thinking",
      lastSequence: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      telemetry: {
        model: AI_ANIMATOR_MODEL,
        effort: AI_ANIMATOR_REASONING_EFFORT[request.reasoningLevel],
        outcome: "active",
        latencyMs: null,
        promptDigest: promptDigest(request.message),
        usage: emptyUsage,
      },
      events: [event],
      abortController: new AbortController(),
    };
    this.jobs.set(job.jobId, job);
    this.meter(projectAcceptedEvent(request, Date.parse(now)));
    void this.run(job, request);
    return publicSnapshot(job);
  }

  get(jobId: string, projectId: string, ownerId = "legacy-local-owner") {
    const job = this.jobs.get(jobId);
    return job && job.ownerId === ownerId && job.projectId === projectId ? publicSnapshot(job) : null;
  }

  cancel(jobId: string, projectId: string, ownerId = "legacy-local-owner") {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== ownerId || job.projectId !== projectId) {
      return null;
    }
    if (isAiAnimatorTerminalStatus(job.status)) {
      return publicSnapshot(job);
    }
    job.abortController.abort();
    this.append(job, { status: "cancelled" });
    job.completedAt = job.updatedAt;
    job.telemetry = { ...job.telemetry, outcome: "cancelled", latencyMs: Date.now() - Date.parse(job.createdAt) };
    this.meter(projectTerminalEvent(usageIdentity(job), "cancelled", Date.parse(job.completedAt)));
    return publicSnapshot(job);
  }

  private append(job: InternalJob, event: Omit<AiAnimatorJobEvent, "sequence" | "createdAt">) {
    const createdAt = new Date().toISOString();
    const nextEvent: AiAnimatorJobEvent = {
      ...event,
      sequence: job.lastSequence + 1,
      createdAt,
    };
    job.events.push(nextEvent);
    job.status = nextEvent.status;
    job.lastSequence = nextEvent.sequence;
    job.updatedAt = createdAt;
  }

  private async run(job: InternalJob, request: AiAnimatorRequest) {
    const timeout = setTimeout(() => job.abortController.abort(), SERVER_DEADLINE_MS);
    try {
      const result = await this.provider(request, { signal: job.abortController.signal });
      if (isAiAnimatorTerminalStatus(job.status)) {
        return;
      }
      if (result.requestedModel !== AI_ANIMATOR_MODEL || result.providerModel !== AI_ANIMATOR_MODEL) {
        throw new Error("AI Animator provider identity did not match gpt-5.6-terra.");
      }
      if (result.reply.intent === "create-animation" || result.reply.intent === "edit-animation") {
        this.append(job, { status: "planning" });
        result.reply = {
          ...result.reply,
          reply: `${result.reply.reply.trim()}\n\nNo animation was changed. Animation creation and editing arrive in later phases.`,
        };
      }
      this.append(job, {
        status: "done",
        reply: result.reply,
        provider: {
          requestedModel: result.requestedModel,
          providerModel: result.providerModel,
          responseId: result.responseId,
          usage: result.usage,
          latencyMs: result.latencyMs,
          promptDigest: result.promptDigest,
        },
      });
      job.intent = result.reply.intent;
      job.completedAt = job.updatedAt;
      job.telemetry = {
        ...job.telemetry,
        outcome: "succeeded",
        latencyMs: result.latencyMs,
        promptDigest: result.promptDigest,
        usage: result.usage,
      };
      this.meter(projectTerminalEvent(request, "succeeded", Date.parse(job.completedAt)));
    } catch (error) {
      if (isAiAnimatorTerminalStatus(job.status)) {
        return;
      }
      const wasAborted = job.abortController.signal.aborted;
      this.append(job, {
        status: "failed",
        errorCode: wasAborted ? "deadline_exceeded" : "provider_failed",
        errorMessage: wasAborted
          ? "Terra did not finish within 90 seconds. No animation changed. You can try again."
          : `${error instanceof Error ? error.message : "Terra could not complete the request."} No animation changed.`,
      });
      job.completedAt = job.updatedAt;
      job.telemetry = {
        ...job.telemetry,
        outcome: "failed",
        latencyMs: Date.now() - Date.parse(job.createdAt),
      };
      this.meter(projectTerminalEvent(request, wasAborted ? "timeout" : "failed", Date.parse(job.completedAt)));
    } finally {
      clearTimeout(timeout);
    }
  }
}
