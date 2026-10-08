import { ASSISTANT_LIMITS, CATALOG_VERSION, AssistantError, insist, stableJson, validateProviderResult, validateRequest, validateSnapshot, type AssistantRequest, type JobSnapshot, type ProviderResult } from "./assistantContracts.ts";
import {
  assistantAcceptedEvent, assistantTerminalEvent, noUsageEventRecorder, type UsageEventRecorder,
} from "../usage-journal/usageJournalEvents.ts";
import { SharedJobWriter, sharedFingerprint, watchSharedCancellation, type SharedJobRow, type SharedJobStore } from "../ai-jobs/sharedJobStore.ts";

export const ASSISTANT_FINALIZING_MS = 3000;
// Online: a stored answer still "active" this long after it started belongs to a stopped server copy
// (the route's maxDuration is 120 s; the answer deadline is 55 s).
export const ASSISTANT_SHARED_STALE_MS = 120_000;
const SHARED_KIND = "assistant" as const;
type TerminalUsageEvent = Parameters<UsageEventRecorder>[0];
const ASSISTANT_JOB_EVENT_LIMIT = 8;
export type AssistantProviderActivity = { type: "search-start"; topic: string } | { type: "search-end" };
export type AssistantProviderOptions = { signal: AbortSignal; onActivity?: (activity: AssistantProviderActivity) => void };
export type AssistantProvider = (request: AssistantRequest, options: AssistantProviderOptions) => Promise<ProviderResult>;
type Job = { ownerId: string; request: AssistantRequest; fingerprint: string; snapshot: JobSnapshot; controller: AbortController; timer: ReturnType<typeof setTimeout> | null };
export class DiamondAssistantJobService {
  private jobs = new Map<string, Job>();
  private provider: AssistantProvider;
  private deadline: number;
  private finalizingMs: number;
  private recordUsage: UsageEventRecorder;
  constructor(provider: AssistantProvider, deadline: number = ASSISTANT_LIMITS.deadlineMs, finalizingMs: number = ASSISTANT_FINALIZING_MS,
    recordUsage: UsageEventRecorder = noUsageEventRecorder) {
    this.provider = provider; this.deadline = deadline; this.finalizingMs = finalizingMs; this.recordUsage = recordUsage;
  }
  private meter(event: Parameters<UsageEventRecorder>[0]) { try { this.recordUsage(event); } catch { /* Best-effort observation only. */ } }
  private writers = new Map<string, SharedJobWriter>();
  /** How often an online job checks for a Cancel made on another server copy. */
  cancelCheckMs = 2000;
  /**
   * Records a state change. Locally (no shared store) the final usage event is recorded at once, as before.
   * Online the snapshot is saved first; the final usage event is recorded only if this copy's save won.
   */
  private sync(job: Job, terminalEvent?: TerminalUsageEvent) {
    const writer = this.writers.get(job.request.jobId);
    if (!writer) { if (terminalEvent) this.meter(terminalEvent); return; }
    void writer.save(job.snapshot, this.active(job)).then(stored => { if (stored && terminalEvent) this.meter(terminalEvent); });
  }
  /** Another server copy already finished (cancelled) this answer: stop the AI call and show the stored result. */
  private adoptShared(job: Job, row: SharedJobRow) {
    if (!this.active(job)) return;
    if (row.snapshot && typeof row.snapshot === "object") job.snapshot = structuredClone(row.snapshot) as JobSnapshot;
    this.finishTimer(job); job.controller.abort();
  }
  private createJob(request: AssistantRequest, fingerprint: string, ownerId: string): Job {
    const snapshot: JobSnapshot = { schema: "diamond-assistant-job/v1", jobId: request.jobId, sessionId: request.sessionId, turnId: request.turnId, reasoning: request.reasoningLevel, catalogVersion: CATALOG_VERSION, status: "thinking", events: [{ sequence: 1, at: Date.now(), status: "thinking" }], result: null, error: null };
    return { ownerId, request, fingerprint, snapshot, controller: new AbortController(), timer: null };
  }
  private cancelledTombstone(request: AssistantRequest): JobSnapshot {
    const now = Date.now();
    return { schema: "diamond-assistant-job/v1", jobId: request.jobId, sessionId: request.sessionId, turnId: request.turnId, reasoning: request.reasoningLevel, catalogVersion: CATALOG_VERSION, status: "cancelled", events: [{ sequence: 1, at: now, status: "thinking" }, { sequence: 2, at: now, status: "cancelled" }], result: null, error: "Answer cancelled before submission. Your message is saved." };
  }
  private start(job: Job) {
    this.meter(assistantAcceptedEvent(job.request, job.snapshot.events[0].at));
    job.timer = setTimeout(() => this.fail(job, "This answer timed out. Your message is saved. Send again when you are ready.", "timeout"), this.deadline);
    return this.run(job);
  }
  private active(job: Job) { return job.snapshot.status === "thinking" || job.snapshot.status === "searching" || job.snapshot.status === "finalizing"; }
  submit(input: unknown, ownerId = "legacy-local-owner"): JobSnapshot {
    const request = validateRequest(input); const fingerprint = stableJson(request); const existing = this.jobs.get(request.jobId);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new AssistantError("conflict", "This request is not available to this account.");
      if (existing.fingerprint !== fingerprint) throw new AssistantError("conflict", "This request identity already belongs to a different message.");
      return structuredClone(existing.snapshot);
    }
    const active = [...this.jobs.values()].filter(job => job.ownerId === ownerId && this.active(job));
    if (active.some(job => job.request.sessionId === request.sessionId)) throw new AssistantError("conflict", "This chat already has an active answer.");
    if (active.length >= ASSISTANT_LIMITS.activeJobs) throw new AssistantError("capacity", "Two Assistant answers are already running. Wait or cancel one, then try again.");
    // Bounded server memory. Do not evict identities and accidentally permit duplicate paid submissions.
    if (this.jobs.size >= 500) throw new AssistantError("capacity", "This review server has reached its request limit. Restart it before starting more answers.");
    const job = this.createJob(request, fingerprint, ownerId); this.jobs.set(request.jobId, job);
    void this.start(job); return structuredClone(job.snapshot);
  }
  /**
   * Online version of submit: the answer lives in the shared store so any server copy can answer polls
   * and cancels. `work` finishes when the answer is over and saved; the route hands it to Next's after().
   */
  async submitShared(store: SharedJobStore, input: unknown, ownerId: string): Promise<{ snapshot: JobSnapshot; work: Promise<void> }> {
    const request = validateRequest(input); const fingerprint = sharedFingerprint(stableJson(request)); const done = Promise.resolve();
    const known = async () => {
      const existing = await store.get(SHARED_KIND, request.jobId); if (!existing) return null;
      if (existing.ownerId !== ownerId) throw new AssistantError("conflict", "This request is not available to this account.");
      if (existing.fingerprint !== fingerprint) throw new AssistantError("conflict", "This request identity already belongs to a different message.");
      return existing.snapshot as JobSnapshot;
    };
    const existing = await known(); if (existing) return { snapshot: existing, work: done };
    const active = await store.listActive(SHARED_KIND, ownerId, ASSISTANT_SHARED_STALE_MS);
    if (active.some(job => job.scopeId === request.sessionId)) throw new AssistantError("conflict", "This chat already has an active answer.");
    if (active.length >= ASSISTANT_LIMITS.activeJobs) throw new AssistantError("capacity", "Two Assistant answers are already running. Wait or cancel one, then try again.");
    const job = this.createJob(request, fingerprint, ownerId);
    if (!await store.insert({ kind: SHARED_KIND, jobId: request.jobId, ownerId, scopeId: request.sessionId, fingerprint, active: true, snapshot: job.snapshot })) {
      const raced = await known(); if (raced) return { snapshot: raced, work: done };
      throw new AssistantError("conflict", "This request identity is already in use.");
    }
    this.jobs.set(request.jobId, job);
    const writer = new SharedJobWriter(store, SHARED_KIND, request.jobId, () => {
      void store.get(SHARED_KIND, request.jobId).then(row => { if (row) this.adoptShared(job, row); }).catch(() => {});
    });
    this.writers.set(request.jobId, writer);
    const stopWatching = watchSharedCancellation(store, SHARED_KIND, request.jobId, row => this.adoptShared(job, row), this.cancelCheckMs);
    const snapshot = structuredClone(job.snapshot);
    const work = this.start(job).catch(() => {})
      .then(() => { stopWatching(); return writer.settled(); })
      .finally(() => { this.finishTimer(job); this.writers.delete(request.jobId); this.jobs.delete(request.jobId); });
    return { snapshot, work };
  }
  /** Online poll: reads the shared store, so it works whichever server copy is doing the work. */
  async getShared(store: SharedJobStore, jobId: string, sessionId: string, ownerId: string) {
    const row = await store.get(SHARED_KIND, jobId);
    if (!row || row.ownerId !== ownerId || row.scopeId !== sessionId) return null;
    if (row.active && Date.now() - row.createdAt > ASSISTANT_SHARED_STALE_MS) return null;
    return row.snapshot as JobSnapshot;
  }
  /** Online cancel (same rules as cancelRequest), from any server copy. */
  async cancelRequestShared(store: SharedJobStore, input: unknown, ownerId: string): Promise<JobSnapshot> {
    const request = validateRequest(input);
    if (this.jobs.has(request.jobId)) {
      const snapshot = this.cancelRequest(input, ownerId); await this.writers.get(request.jobId)?.settled();
      return (await store.get(SHARED_KIND, request.jobId))?.snapshot as JobSnapshot | undefined ?? snapshot;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await store.get(SHARED_KIND, request.jobId);
      if (row) {
        if (row.ownerId !== ownerId) throw new AssistantError("conflict", "This answer is not available to this account.");
        const stored = row.snapshot as JobSnapshot;
        if (row.scopeId !== request.sessionId || stored.turnId !== request.turnId || stored.reasoning !== request.reasoningLevel) throw new AssistantError("conflict", "Cancellation identity does not match this answer.");
        if (!row.active) return stored;
        // The answer is running on another server copy (or its copy stopped): write the cancellation here.
        const job: Job = { ownerId, request, fingerprint: row.fingerprint ?? "", snapshot: structuredClone(stored), controller: new AbortController(), timer: null };
        const writer = new SharedJobWriter(store, SHARED_KIND, request.jobId, () => {}); this.writers.set(request.jobId, writer);
        try { this.transition(job, "cancelled", null, "Answer cancelled. Your message is saved."); await writer.settled(); }
        finally { this.writers.delete(request.jobId); }
        return writer.wasRefused ? (await store.get(SHARED_KIND, request.jobId))?.snapshot as JobSnapshot ?? job.snapshot : structuredClone(job.snapshot);
      }
      // A cancellation tombstone wins even if an in-flight POST has not reached any server yet.
      const snapshot = this.cancelledTombstone(request); const now = snapshot.events[0].at;
      if (await store.insert({ kind: SHARED_KIND, jobId: request.jobId, ownerId, scopeId: request.sessionId, fingerprint: sharedFingerprint(stableJson(request)), active: false, snapshot })) {
        this.meter(assistantAcceptedEvent(request, now)); this.meter(assistantTerminalEvent(request, "cancelled", now));
        return structuredClone(snapshot);
      }
    }
    throw new AssistantError("capacity", "The server cannot record this cancellation. Wait for the answer deadline.");
  }
  private finishTimer(job: Job) { if (job.timer) { clearTimeout(job.timer); job.timer = null; } }
  private fail(job: Job, error: string, outcome: "failed" | "timeout" = "failed") {
    if (!this.active(job)) return;
    const safe = error.slice(0, 240);
    const event = { sequence: job.snapshot.events.length + 1, at: Date.now(), status: "failed" as const };
    const candidate: JobSnapshot = { ...job.snapshot, status: "failed", result: null, error: safe, events: [...job.snapshot.events, event] };
    try { validateSnapshot(candidate, job.request); job.snapshot = candidate; }
    catch {
      // Non-terminal transitions always reserve this final slot. This fallback keeps a
      // malformed provider lifecycle from leaving the user in permanent activity.
      job.snapshot = { ...candidate, events: [...job.snapshot.events.slice(0, ASSISTANT_JOB_EVENT_LIMIT - 1), { sequence: ASSISTANT_JOB_EVENT_LIMIT, at: Date.now(), status: "failed" }] };
    }
    this.finishTimer(job); job.controller.abort();
    this.sync(job, assistantTerminalEvent(job.request, outcome, event.at));
  }
  private transition(job: Job, status: JobSnapshot["status"], result: ProviderResult | null = null, error: string | null = null, topic?: string) {
    if (!this.active(job) || job.snapshot.status === status) return;
    const terminal = status === "done" || status === "failed" || status === "cancelled";
    if (!terminal && job.snapshot.events.length >= ASSISTANT_JOB_EVENT_LIMIT - 1) {
      this.fail(job, "The assistant reported too many activity changes. Your message is saved. You can try again explicitly."); return;
    }
    const event = status === "searching" ? { sequence: job.snapshot.events.length + 1, at: Date.now(), status, topic } : { sequence: job.snapshot.events.length + 1, at: Date.now(), status };
    const candidate: JobSnapshot = { ...job.snapshot, status, result, error, events: [...job.snapshot.events, event] };
    validateSnapshot(candidate, job.request); job.snapshot = candidate;
    if (!this.active(job)) {
      this.finishTimer(job);
      this.sync(job, status === "done" ? assistantTerminalEvent(job.request, "succeeded", event.at)
        : status === "cancelled" ? assistantTerminalEvent(job.request, "cancelled", event.at) : undefined);
    } else this.sync(job);
  }
  private async run(job: Job) {
    try {
      const options: AssistantProviderOptions = { signal: job.controller.signal };
      Object.defineProperty(options, "onActivity", { enumerable: false, value: (activity: AssistantProviderActivity) => {
        if (!this.active(job)) return;
        if (activity.type === "search-start" && job.snapshot.status === "thinking") this.transition(job, "searching", null, null, activity.topic);
        else if (activity.type === "search-end" && job.snapshot.status === "searching") this.transition(job, "thinking");
      } });
      const result = structuredClone(await this.provider(job.request, options));
      if (!this.active(job)) return;
      validateProviderResult(result);
      insist(result.usage.reasoning === job.request.reasoningLevel);
      insist(job.snapshot.status !== "searching", "output", "Current public information could not be verified. Your message is saved.");
      this.transition(job, "finalizing");
      if (!this.active(job) || job.snapshot.status !== "finalizing") return;
      await new Promise<void>(resolve => {
        const signal = job.controller.signal;
        const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, this.finalizingMs);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
      if (!this.active(job) || job.controller.signal.aborted) return;
      this.transition(job, "done", result);
    } catch (error) {
      if (!this.active(job)) return;
      const safe = error instanceof AssistantError && ["configuration", "output", "input", "privacy", "search", "network"].includes(error.code) ? error.message : "The assistant could not complete this answer. Your message is saved. You can try again explicitly.";
      this.fail(job, safe);
    }
  }
  get(jobId: string, sessionId: string, ownerId = "legacy-local-owner") { const job = this.jobs.get(jobId); return job?.ownerId === ownerId && job.request.sessionId === sessionId ? structuredClone(job.snapshot) : null; }
  cancel(jobId: string, sessionId: string, ownerId = "legacy-local-owner") {
    const job = this.jobs.get(jobId); if (!job || job.ownerId !== ownerId || job.request.sessionId !== sessionId) return null;
    if (this.active(job)) { this.transition(job, "cancelled", null, "Answer cancelled. Your message is saved."); job.controller.abort(); }
    return structuredClone(job.snapshot);
  }
  cancelRequest(input: unknown, ownerId = "legacy-local-owner") {
    const request = validateRequest(input); const existing = this.jobs.get(request.jobId);
    if (existing) {
      if (existing.ownerId !== ownerId) throw new AssistantError("conflict", "This answer is not available to this account.");
      if (existing.request.sessionId !== request.sessionId || existing.request.turnId !== request.turnId || existing.request.reasoningLevel !== request.reasoningLevel) throw new AssistantError("conflict", "Cancellation identity does not match this answer.");
      return this.cancel(request.jobId, request.sessionId, ownerId)!;
    }
    if (this.jobs.size >= 500) throw new AssistantError("capacity", "The server cannot record this cancellation. Wait for the answer deadline.");
    // A cancellation tombstone wins even if an in-flight POST has not reached this server yet.
    const snapshot = this.cancelledTombstone(request); const now = snapshot.events[0].at;
    this.jobs.set(request.jobId, { ownerId, request, fingerprint: stableJson(request), snapshot, controller: new AbortController(), timer: null });
    this.meter(assistantAcceptedEvent(request, now)); this.meter(assistantTerminalEvent(request, "cancelled", now));
    return structuredClone(snapshot);
  }
}
