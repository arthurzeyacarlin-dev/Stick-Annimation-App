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
import { accountAiCreditGate, type AiCreditGate } from "../account/aiCredits.ts";
import { claudeChat } from "../animator/claude/claudeChat.ts";
import { claudeAnimate, CLAUDE_ANIMATOR_MODEL, ClaudeBudgetError } from "../animator/claude/claudeAnimator.ts";

// SPEC-0021 Phase 5: AI_ANIMATOR_ENGINE=claude → Claude is the chat brain AND the animator (Luna's path stays as it was).
const CLAUDE_ENGINE = () => process.env.AI_ANIMATOR_ENGINE === "claude";
const CLAUDE_DEADLINE_MS = 300_000;

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
  private readonly credits: AiCreditGate;

  // SPEC-0020 Phase 2: every account's AI credits are checked before a message starts and one credit is spent
  // when the message gets an answer (failed or stopped messages are free).
  constructor(provider: Provider, recordUsage: UsageEventRecorder = noUsageEventRecorder, credits: AiCreditGate = accountAiCreditGate) {
    this.provider = provider;
    this.recordUsage = recordUsage;
    this.credits = credits;
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
    this.credits.assertAvailable(ownerId, environmentActiveCount);

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
    void (CLAUDE_ENGINE() ? this.runClaude(job, request) : this.run(job, request));
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

  // SPEC-0021 Phase 5 — THE CLAUDE ENGINE: Claude reads the message (talk / make / edit / ask); to make or edit, Claude's animator
  // writes the plan, the laws check it, Claude fixes what broke; the plan rides on the "done" event and the workspace places it.
  // Nothing broken is ever placed: a plan that still breaks a law is refused, said in plain words, and no animation changes.
  // MEMORY: the project's current animation (its plan) is kept here, so an edit changes only what was asked.
  private readonly currentPlans = new Map<string, Record<string, unknown>>();
  private async runClaude(job: InternalJob, request: AiAnimatorRequest) {
    const timeout = setTimeout(() => job.abortController.abort(), CLAUDE_DEADLINE_MS);
    const startedAt = Date.now();
    try {
      const memoryKey = `${job.ownerId}:${job.projectId}`;
      // (the app sends the animation that is on the canvas now; the server memory is only the fallback)
      const current = request.currentAnimation ?? this.currentPlans.get(memoryKey) ?? null;
      const chat = await claudeChat(request.message, request.recentConversation, !!current, job.abortController.signal,
        (query) => { if (!isAiAnimatorTerminalStatus(job.status)) this.append(job, { status: "thinking", progress: { percent: 0, note: "Searching the internet", etaSec: null, searching: query } }); });
      if (isAiAnimatorTerminalStatus(job.status)) return;
      let reply = chat.reply, usd = chat.usage.usd, inputTokens = chat.usage.inputTokens, outputTokens = chat.usage.outputTokens;
      let animation: AiAnimatorJobEvent["animation"];
      // NO PROMISES THAT DON'T HAPPEN (Arthur, Oct 12: "it says animating and then he never animates… I don't want to see lies"):
      // a talking reply that promises to make or change something IS a request to animate — it animates.
      if (reply.intent === "conversation" && /\b(i'll|i will|let me|i'm going to|i am going to|going to|here's|here is)\s+(now\s+)?(make|animate|add|create|change|build|put|draw|redo|fix)\b/i.test(reply.reply)) reply = { ...reply, intent: current ? "edit-animation" : "create-animation" };
      if (reply.intent === "create-animation" || reply.intent === "edit-animation") {
        this.append(job, { status: "planning", progress: { percent: 5, note: chat.searches.length ? "Turning what I found into your animation" : "Getting your idea ready", etaSec: 45 } });
        const edit = reply.intent === "edit-animation" && !!current;
        const convo = request.recentConversation.slice(-6).map((m) => `${m.role === "assistant" ? "AI" : "User"}: ${m.content.slice(0, 400)}`).join("\n");
        const made = await claudeAnimate(request.message, { current: edit ? current : null, conversation: convo, research: chat.research ?? undefined, signal: job.abortController.signal,
          onProgress: (progress) => { if (!isAiAnimatorTerminalStatus(job.status)) this.append(job, { status: "planning", progress }); } });
        if (isAiAnimatorTerminalStatus(job.status)) return;
        usd += made.usage.usd; inputTokens += made.usage.inputTokens; outputTokens += made.usage.outputTokens;
        if (made.ok && made.plan) {
          this.currentPlans.set(memoryKey, made.plan);
          animation = { plan: made.plan, title: made.title, edit, rounds: made.rounds, costUsd: +made.usage.usd.toFixed(4) };
          // (the message is written AFTER the result, so it only says what really happened)
          reply = { ...reply, reply: `${edit ? "Done — I changed it" : "Done"}: "${made.title}" is on your canvas. It passed every animation law. Ctrl+Z undoes it.${made.notes ? `\n\nPlease note: ${made.notes}` : ""}` };
        } else {
          const why = made.problems.filter((x) => x.startsWith("LAW ")).slice(0, 2).map((x) => x.replace(/^LAW \w+: /, "")).join(" ");
          reply = { ...reply, reply: `I couldn't make this one without breaking an animation rule, so nothing was added — I never put a broken animation on your canvas, and this one is free. What went wrong: ${why} Try a simpler or different wording.` };
        }
      }
      const usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimatedCostUsd: +usd.toFixed(4) };
      const latencyMs = Date.now() - startedAt;
      this.append(job, {
        status: "done", reply,
        provider: { requestedModel: CLAUDE_ANIMATOR_MODEL, providerModel: CLAUDE_ANIMATOR_MODEL, responseId: null, usage, latencyMs, promptDigest: promptDigest(request.message) },
        ...(animation ? { animation } : {}),
      });
      job.intent = reply.intent;
      job.completedAt = job.updatedAt;
      job.telemetry = { ...job.telemetry, outcome: "succeeded", latencyMs, promptDigest: promptDigest(request.message), usage };
      this.meter(projectTerminalEvent(request, "succeeded", Date.parse(job.completedAt)));
      try { this.credits.spend(job.ownerId, job.jobId); } catch { /* The answer is already shown; a failed count must not break it. */ }
    } catch (error) {
      if (isAiAnimatorTerminalStatus(job.status)) return;
      const wasAborted = job.abortController.signal.aborted;
      this.append(job, {
        status: "failed",
        errorCode: wasAborted ? "deadline_exceeded" : error instanceof ClaudeBudgetError ? "budget" : "provider_failed",
        errorMessage: wasAborted ? "The AI Animator did not finish within 5 minutes. No animation changed. You can try again." : `${error instanceof Error ? error.message : "The AI Animator could not complete the request."}${error instanceof ClaudeBudgetError ? "" : " No animation changed."}`,
      });
      job.completedAt = job.updatedAt;
      job.telemetry = { ...job.telemetry, outcome: "failed", latencyMs: Date.now() - startedAt };
      this.meter(projectTerminalEvent(request, wasAborted ? "timeout" : "failed", Date.parse(job.completedAt)));
    } finally {
      clearTimeout(timeout);
    }
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
      try { this.credits.spend(job.ownerId, job.jobId); } catch { /* The answer is already shown; a failed count must not break it. */ }
    } catch (error) {
      if (isAiAnimatorTerminalStatus(job.status)) {
        return;
      }
      const wasAborted = job.abortController.signal.aborted;
      this.append(job, {
        status: "failed",
        errorCode: wasAborted ? "deadline_exceeded" : "provider_failed",
        errorMessage: wasAborted
          ? "The AI Animator did not finish within 90 seconds. No animation changed. You can try again."
          : `${error instanceof Error ? error.message : "The AI Animator could not complete the request."} No animation changed.`,
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
