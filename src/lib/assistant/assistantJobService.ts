import { ASSISTANT_LIMITS, CATALOG_VERSION, AssistantError, insist, stableJson, validateProviderResult, validateRequest, validateSnapshot, type AssistantRequest, type JobSnapshot, type ProviderResult } from "./assistantContracts.ts";

export const ASSISTANT_FINALIZING_MS = 3000;
const ASSISTANT_JOB_EVENT_LIMIT = 8;
export type AssistantProviderActivity = { type: "search-start"; topic: string } | { type: "search-end" };
export type AssistantProviderOptions = { signal: AbortSignal; onActivity?: (activity: AssistantProviderActivity) => void };
export type AssistantProvider = (request: AssistantRequest, options: AssistantProviderOptions) => Promise<ProviderResult>;
type Job = { request: AssistantRequest; fingerprint: string; snapshot: JobSnapshot; controller: AbortController; timer: ReturnType<typeof setTimeout> | null };
export class DiamondAssistantJobService {
  private jobs = new Map<string, Job>();
  private provider: AssistantProvider;
  private deadline: number;
  private finalizingMs: number;
  constructor(provider: AssistantProvider, deadline: number = ASSISTANT_LIMITS.deadlineMs, finalizingMs: number = ASSISTANT_FINALIZING_MS) { this.provider = provider; this.deadline = deadline; this.finalizingMs = finalizingMs; }
  private active(job: Job) { return job.snapshot.status === "thinking" || job.snapshot.status === "searching" || job.snapshot.status === "finalizing"; }
  submit(input: unknown): JobSnapshot {
    const request = validateRequest(input); const fingerprint = stableJson(request); const existing = this.jobs.get(request.jobId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new AssistantError("conflict", "This request identity already belongs to a different message.");
      return structuredClone(existing.snapshot);
    }
    const active = [...this.jobs.values()].filter(job => this.active(job));
    if (active.some(job => job.request.sessionId === request.sessionId)) throw new AssistantError("conflict", "This chat already has an active answer.");
    if (active.length >= ASSISTANT_LIMITS.activeJobs) throw new AssistantError("capacity", "Two Assistant answers are already running. Wait or cancel one, then try again.");
    // Bounded server memory. Do not evict identities and accidentally permit duplicate paid submissions.
    if (this.jobs.size >= 500) throw new AssistantError("capacity", "This review server has reached its request limit. Restart it before starting more answers.");
    const snapshot: JobSnapshot = { schema: "diamond-assistant-job/v1", jobId: request.jobId, sessionId: request.sessionId, turnId: request.turnId, reasoning: request.reasoningLevel, catalogVersion: CATALOG_VERSION, status: "thinking", events: [{ sequence: 1, at: Date.now(), status: "thinking" }], result: null, error: null };
    const job: Job = { request, fingerprint, snapshot, controller: new AbortController(), timer: null }; this.jobs.set(request.jobId, job);
    job.timer = setTimeout(() => this.fail(job, "This answer timed out. Your message is saved. Send again when you are ready."), this.deadline);
    void this.run(job); return structuredClone(job.snapshot);
  }
  private finishTimer(job: Job) { if (job.timer) { clearTimeout(job.timer); job.timer = null; } }
  private fail(job: Job, error: string) {
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
  }
  private transition(job: Job, status: JobSnapshot["status"], result: ProviderResult | null = null, error: string | null = null, topic?: string) {
    if (!this.active(job) || job.snapshot.status === status) return;
    const terminal = status === "done" || status === "failed" || status === "cancelled";
    if (!terminal && job.snapshot.events.length >= ASSISTANT_JOB_EVENT_LIMIT - 1) {
      this.fail(job, "Terra reported too many activity changes. Your message is saved. You can try again explicitly."); return;
    }
    const event = status === "searching" ? { sequence: job.snapshot.events.length + 1, at: Date.now(), status, topic } : { sequence: job.snapshot.events.length + 1, at: Date.now(), status };
    const candidate: JobSnapshot = { ...job.snapshot, status, result, error, events: [...job.snapshot.events, event] };
    validateSnapshot(candidate, job.request); job.snapshot = candidate;
    if (!this.active(job)) this.finishTimer(job);
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
      const safe = error instanceof AssistantError && ["configuration", "output", "input", "privacy", "search", "network"].includes(error.code) ? error.message : "Terra could not complete this answer. Your message is saved. You can try again explicitly.";
      this.fail(job, safe);
    }
  }
  get(jobId: string, sessionId: string) { const job = this.jobs.get(jobId); return job?.request.sessionId === sessionId ? structuredClone(job.snapshot) : null; }
  cancel(jobId: string, sessionId: string) {
    const job = this.jobs.get(jobId); if (!job || job.request.sessionId !== sessionId) return null;
    if (this.active(job)) { this.transition(job, "cancelled", null, "Answer cancelled. Your message is saved."); job.controller.abort(); }
    return structuredClone(job.snapshot);
  }
  cancelRequest(input: unknown) {
    const request = validateRequest(input); const existing = this.jobs.get(request.jobId);
    if (existing) {
      if (existing.request.sessionId !== request.sessionId || existing.request.turnId !== request.turnId || existing.request.reasoningLevel !== request.reasoningLevel) throw new AssistantError("conflict", "Cancellation identity does not match this answer.");
      return this.cancel(request.jobId, request.sessionId)!;
    }
    if (this.jobs.size >= 500) throw new AssistantError("capacity", "The server cannot record this cancellation. Wait for the answer deadline.");
    // A cancellation tombstone wins even if an in-flight POST has not reached this server yet.
    const now = Date.now();
    const snapshot: JobSnapshot = { schema: "diamond-assistant-job/v1", jobId: request.jobId, sessionId: request.sessionId, turnId: request.turnId, reasoning: request.reasoningLevel, catalogVersion: CATALOG_VERSION, status: "cancelled", events: [{ sequence: 1, at: now, status: "thinking" }, { sequence: 2, at: now, status: "cancelled" }], result: null, error: "Answer cancelled before submission. Your message is saved." };
    this.jobs.set(request.jobId, { request, fingerprint: stableJson(request), snapshot, controller: new AbortController(), timer: null });
    return structuredClone(snapshot);
  }
}
