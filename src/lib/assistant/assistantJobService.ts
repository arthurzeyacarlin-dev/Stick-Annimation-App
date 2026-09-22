import { ASSISTANT_LIMITS, CATALOG_VERSION, AssistantError, exactKeys, insist, stableJson, validateAnswer, validateUsage, validateRequest, validateSnapshot, type AssistantRequest, type JobSnapshot, type ProviderResult } from "./assistantContracts.ts";

export const ASSISTANT_FINALIZING_MS = 3000;
export type AssistantProvider = (request: AssistantRequest, options: { signal: AbortSignal }) => Promise<ProviderResult>;
type Job = { request: AssistantRequest; fingerprint: string; snapshot: JobSnapshot; controller: AbortController; timer: ReturnType<typeof setTimeout> | null };
export class DiamondAssistantJobService {
  private jobs = new Map<string, Job>();
  private provider: AssistantProvider;
  private deadline: number;
  private finalizingMs: number;
  constructor(provider: AssistantProvider, deadline: number = ASSISTANT_LIMITS.deadlineMs, finalizingMs: number = ASSISTANT_FINALIZING_MS) { this.provider = provider; this.deadline = deadline; this.finalizingMs = finalizingMs; }
  private active(job: Job) { return job.snapshot.status === "thinking" || job.snapshot.status === "finalizing"; }
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
    job.timer = setTimeout(() => { this.transition(job, "failed", null, "This answer timed out. Your message is saved. Send again when you are ready."); job.controller.abort(); }, this.deadline);
    void this.run(job); return structuredClone(job.snapshot);
  }
  private transition(job: Job, status: JobSnapshot["status"], result: ProviderResult | null = null, error: string | null = null) {
    if (!this.active(job) || job.snapshot.status === status) return;
    const candidate: JobSnapshot = { ...job.snapshot, status, result, error, events: [...job.snapshot.events, { sequence: job.snapshot.events.length + 1, at: Date.now(), status }] };
    validateSnapshot(candidate, job.request); job.snapshot = candidate;
    if (!this.active(job) && job.timer) { clearTimeout(job.timer); job.timer = null; }
  }
  private async run(job: Job) {
    try {
      const result = structuredClone(await this.provider(job.request, { signal: job.controller.signal }));
      if (!this.active(job)) return;
      // Thinking owns the entire provider call and complete validation. The validated answer
      // stays private during the authorized final presentation hold; only Done publishes it.
      insist(exactKeys(result, ["reply", "usage"])); validateAnswer(result.reply); validateUsage(result.usage);
      insist(result.usage.reasoning === job.request.reasoningLevel);
      this.transition(job, "finalizing");
      await new Promise<void>(resolve => {
        const signal = job.controller.signal;
        const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
        const timer = setTimeout(finish, this.finalizingMs);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
      // The original deadline remains armed during this hold. Cancel/deadline always win
      // over its late completion, and duplicate submissions never restart the hold.
      if (!this.active(job) || job.controller.signal.aborted) return;
      this.transition(job, "done", result);
    } catch (error) {
      if (!this.active(job)) return;
      const safe = error instanceof AssistantError && ["configuration", "output", "input"].includes(error.code) ? error.message : "Terra could not complete this answer. Your message is saved. You can try again explicitly.";
      this.transition(job, "failed", null, safe.slice(0, 240));
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
