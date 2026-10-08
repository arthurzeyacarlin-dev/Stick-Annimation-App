import { createHash } from "node:crypto";
import {
  AI_ANIMATOR_REASONING_EFFORT,
  AI_ANIMATOR_MODEL,
  isAiAnimatorProviderModel,
  isAiAnimatorTerminalStatus,
  type AiAnimatorJobEvent,
  type AiAnimatorJobSnapshot,
  type AiAnimatorProviderResult,
  type AiAnimatorRequest,
} from "./aiAnimatorContract.ts";
import {
  noUsageEventRecorder, projectAcceptedEvent, projectTerminalEvent, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";
import { SharedJobWriter, watchSharedCancellation, type SharedJobRow, type SharedJobStore } from "../ai-jobs/sharedJobStore.ts";

type Provider = (request: AiAnimatorRequest, options: { signal: AbortSignal }) => Promise<AiAnimatorProviderResult>;
type InternalJob = AiAnimatorJobSnapshot & { ownerId: string; abortController: AbortController };

const SERVER_DEADLINE_MS = 90_000;
// Online: a stored job still "active" this long after it started belongs to a server copy that was
// stopped (the route's maxDuration is 120 s), so it no longer blocks new requests and reads as gone.
export const AI_ANIMATOR_SHARED_STALE_MS = 150_000;
const SHARED_KIND = "ai-animator" as const;
type TerminalUsageEvent = Parameters<UsageEventRecorder>[0];
export type AiAnimatorJobServiceOptions = { cancelCheckMs?: number };
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

  private readonly writers = new Map<string, SharedJobWriter>();
  private readonly cancelCheckMs: number;

  constructor(provider: Provider, recordUsage: UsageEventRecorder = noUsageEventRecorder, options: AiAnimatorJobServiceOptions = {}) {
    this.provider = provider;
    this.recordUsage = recordUsage;
    this.cancelCheckMs = options.cancelCheckMs ?? 2000;
  }

  /**
   * Records a state change. Locally (no shared store) the final usage event is recorded at once, as before.
   * Online the snapshot is saved first and the final usage event is recorded only if this server copy's
   * save won (another copy may already have cancelled the job and recorded that instead).
   */
  private sync(job: InternalJob, terminalEvent?: TerminalUsageEvent) {
    const writer = this.writers.get(job.jobId);
    if (!writer) { if (terminalEvent) this.meter(terminalEvent); return; }
    void writer.save(publicSnapshot(job), !isAiAnimatorTerminalStatus(job.status))
      .then((stored) => { if (stored && terminalEvent) this.meter(terminalEvent); });
  }

  /** Another server copy finished (cancelled) this job: stop the AI call and show the stored result. */
  private adoptShared(job: InternalJob, row: SharedJobRow) {
    if (isAiAnimatorTerminalStatus(job.status)) return;
    job.abortController.abort();
    if (row.snapshot && typeof row.snapshot === "object") Object.assign(job, structuredClone(row.snapshot));
  }

  private createJob(request: AiAnimatorRequest, ownerId: string): InternalJob {
    const now = new Date().toISOString();
    const event: AiAnimatorJobEvent = { sequence: 1, status: "thinking", createdAt: now };
    return {
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
  }

  private applyCancel(job: InternalJob): TerminalUsageEvent {
    job.abortController.abort();
    this.append(job, { status: "cancelled" });
    job.completedAt = job.updatedAt;
    job.telemetry = { ...job.telemetry, outcome: "cancelled", latencyMs: Date.now() - Date.parse(job.createdAt) };
    return projectTerminalEvent(usageIdentity(job), "cancelled", Date.parse(job.completedAt));
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

    const job = this.createJob(request, ownerId);
    this.jobs.set(job.jobId, job);
    this.meter(projectAcceptedEvent(request, Date.parse(job.createdAt)));
    void this.run(job, request);
    return publicSnapshot(job);
  }

  /**
   * Online version of submit: the job lives in the shared store so any server copy can answer polls
   * and cancels. `work` finishes when the AI call is over and its result is saved; the route hands it
   * to Next's after() so the server keeps running it after the 202 reply.
   */
  async submitShared(store: SharedJobStore, request: AiAnimatorRequest, ownerId: string):
    Promise<{ snapshot: AiAnimatorJobSnapshot; work: Promise<void> }> {
    const done = Promise.resolve();
    const existingSnapshot = async () => {
      const existing = await store.get(SHARED_KIND, request.jobId);
      if (!existing) return null;
      if (existing.ownerId !== ownerId) throw Object.assign(new Error("This AI Animator job is not available to this account."), { status: 403 });
      return existing.snapshot as AiAnimatorJobSnapshot;
    };
    const known = await existingSnapshot();
    if (known) return { snapshot: known, work: done };
    const active = await store.listActive(SHARED_KIND, ownerId, AI_ANIMATOR_SHARED_STALE_MS);
    if (active.some((job) => job.scopeId === request.workspace.projectId)) {
      throw Object.assign(new Error("This workspace already has an active AI Animator request."), { status: 409 });
    }
    if (active.length >= 2) {
      throw Object.assign(new Error("AI Animator is busy. Try again after an active request finishes."), { status: 429 });
    }
    const job = this.createJob(request, ownerId);
    const inserted = await store.insert({
      kind: SHARED_KIND, jobId: job.jobId, ownerId, scopeId: job.projectId, fingerprint: null, active: true, snapshot: publicSnapshot(job),
    });
    if (!inserted) {
      // The same job id was stored a moment ago (a repeated submit): answer with that job.
      const raced = await existingSnapshot();
      if (raced) return { snapshot: raced, work: done };
      throw Object.assign(new Error("AI Animator could not start the request."), { status: 409 });
    }
    this.jobs.set(job.jobId, job);
    const writer = new SharedJobWriter(store, SHARED_KIND, job.jobId, () => {
      void store.get(SHARED_KIND, job.jobId).then((row) => { if (row) this.adoptShared(job, row); }).catch(() => {});
    });
    this.writers.set(job.jobId, writer);
    this.meter(projectAcceptedEvent(request, Date.parse(job.createdAt)));
    const stopWatching = watchSharedCancellation(store, SHARED_KIND, job.jobId, (row) => this.adoptShared(job, row), this.cancelCheckMs);
    const work = this.run(job, request)
      .catch(() => {})
      .then(() => { stopWatching(); return writer.settled(); })
      .finally(() => { this.writers.delete(job.jobId); this.jobs.delete(job.jobId); });
    return { snapshot: publicSnapshot(job), work };
  }

  /** Online poll: reads the shared store, so it works whichever server copy is doing the work. */
  async getShared(store: SharedJobStore, jobId: string, projectId: string, ownerId: string) {
    const row = await store.get(SHARED_KIND, jobId);
    if (!row || row.ownerId !== ownerId || row.scopeId !== projectId) return null;
    if (row.active && Date.now() - row.createdAt > AI_ANIMATOR_SHARED_STALE_MS) return null;
    return row.snapshot as AiAnimatorJobSnapshot;
  }

  /** Online cancel: works from any server copy. The copy doing the work stops its AI call within seconds. */
  async cancelShared(store: SharedJobStore, jobId: string, projectId: string, ownerId: string) {
    if (this.jobs.has(jobId)) {
      const snapshot = this.cancel(jobId, projectId, ownerId);
      await this.writers.get(jobId)?.settled();
      return snapshot ? await this.getShared(store, jobId, projectId, ownerId) ?? snapshot : null;
    }
    const row = await store.get(SHARED_KIND, jobId);
    if (!row || row.ownerId !== ownerId || row.scopeId !== projectId) return null;
    if (!row.active) return row.snapshot as AiAnimatorJobSnapshot;
    if (Date.now() - row.createdAt > AI_ANIMATOR_SHARED_STALE_MS) return null;
    const job: InternalJob = { ...(structuredClone(row.snapshot) as AiAnimatorJobSnapshot), ownerId, abortController: new AbortController() };
    const terminalEvent = this.applyCancel(job);
    if (await store.update(SHARED_KIND, jobId, { snapshot: publicSnapshot(job), active: false })) {
      this.meter(terminalEvent);
      return publicSnapshot(job);
    }
    // The job finished on its own server copy a moment earlier: show that result.
    return (await store.get(SHARED_KIND, jobId))?.snapshot as AiAnimatorJobSnapshot | undefined ?? null;
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
    this.sync(job, this.applyCancel(job));
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
      if (result.requestedModel !== AI_ANIMATOR_MODEL || !isAiAnimatorProviderModel(result.providerModel)) {
        throw new Error(`AI Animator provider identity did not match ${AI_ANIMATOR_MODEL}.`);
      }
      if (result.reply.intent === "create-animation" || result.reply.intent === "edit-animation") {
        this.append(job, { status: "planning" });
        this.sync(job);
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
      this.sync(job, projectTerminalEvent(request, "succeeded", Date.parse(job.completedAt)));
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
      this.sync(job, projectTerminalEvent(request, wasAborted ? "timeout" : "failed", Date.parse(job.completedAt)));
    } finally {
      clearTimeout(timeout);
    }
  }
}
