import { AI_ACTION_CREDITS, CREDIT_RATES, creditsForCostUsd, PAID_CHANGE_MAX_CREDITS } from "../../account/plans.ts";
import type { AiCreditGate } from "../../account/aiCredits.ts";
import type { UsageEventRecorder } from "../../usage-journal/usageJournalEvents.ts";
import type { UsageJournalEventInput, UsageOutcome } from "../../usage-journal/usageJournalContract.ts";
import type { V1EngineRunEnd, V1UsageHooks } from "./v1AnimatorCore.ts";

// THE AI ANIMATOR'S USAGE METER (Nov 2, Arthur: "it needs to be measured... just record calls, not break how it animates").
// The SAME two stores the Help Assistant uses, so the AI Dashboard shows both the same way:
//   1. credits (account_credit_use_v1 via the AiCreditGate: the bar, "Used this month", the chart): checked before a paid action
//      (with what the account's other runs already hold), spent once it really happened. (Nov 20, money) a chat turn = 15; a finished
//      run = EXACTLY the price its card showed (v1Price.ts, carried on the run), on its own dashboard line. Failed / refused / cancelled = free
//      (dad, Nov 26: but the real AI money of a stopped or failed run, and of a gate picture still waiting, counts toward the limits).
//   2. usage records (recordUsageEvent -> the account usage store the Dashboard reads, under the owner): the chat turns already record
//      in their generators; here every engine run records what it REALLY spent, failed or not: the Claude director's calls (the delta of
//      the shared Claude ledger during the run, without the chat brain's own lines, which are recorded by the chat turn) and the
//      Kimodo calls of the run's report (operation kind animation_job, provider "kimodo"; Kimodo has no price in any book -> cost unknown).
// Nothing here changes how anything animates: it only reads the run's end (report + times) and writes records.

export type ClaudeLedgerCall = { at?: string; who?: string; model?: string; usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
export type ClaudeSpend = { calls: number; inputTokens: number; outputTokens: number; usd: number; model: string | null };

/** The Claude calls booked in the shared ledger between two times (ms), without the lines of `exceptWho` (recorded elsewhere). */
export function claudeSpendBetween(ledger: unknown, fromMs: number, toMs: number, exceptWho: string | null): ClaudeSpend {
  const calls = typeof ledger === "object" && ledger !== null && Array.isArray((ledger as { calls?: unknown }).calls)
    ? (ledger as { calls: ClaudeLedgerCall[] }).calls : [];
  const spend: ClaudeSpend = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, model: null };
  for (const c of calls) {
    const at = typeof c?.at === "string" ? Date.parse(c.at) : NaN;
    if (!Number.isFinite(at) || at < fromMs || at > toMs || (exceptWho !== null && c.who === exceptWho)) continue;
    const u = c.usage ?? {};
    spend.calls++;
    spend.inputTokens += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    spend.outputTokens += u.output_tokens ?? 0;
    spend.usd += typeof c.usd === "number" && Number.isFinite(c.usd) ? c.usd : 0;
    spend.model = typeof c.model === "string" ? c.model : spend.model;
  }
  spend.usd = +spend.usd.toFixed(5);
  return spend;
}

/** What a finished run is charged: its card's locked price. A run without one (never through a card) is charged its own seconds. */
export function v1RunCharge(run: Pick<V1EngineRunEnd, "price" | "report" | "kind">): { credits: number; kind: "animation" | "addon" | "edit" | "look" } {
  if (run.price) return run.price;
  const seconds = Math.max(0, run.report?.lengthS ?? 0);
  return { credits: Math.ceil(CREDIT_RATES.perSecond * seconds), kind: run.kind === "create" ? "animation" : "edit" };
}

const outcomeOf = (status: V1EngineRunEnd["status"]): UsageOutcome =>
  status === "done" || status === "refused" ? "succeeded" : status === "cancelled" ? "cancelled" : "failed";

/** The usage records of one engine run: one attempt for the Claude director (when it called), one for Kimodo (when it called). */
export function v1EngineRunEvents(run: V1EngineRunEnd, claude: ClaudeSpend, pricingVersion: string): UsageJournalEventInput[] {
  const base = (part: string, eventKey: string, stage: UsageJournalEventInput["stage"]): UsageJournalEventInput => ({
    eventKey, operationRef: run.runId, attemptRef: `${run.runId}:${part}`, originRef: run.projectId,
    surface: "project_ai", operationKind: "animation_job", stage, environment: "local_instance",
  });
  const outcome = outcomeOf(run.status), events: UsageJournalEventInput[] = [];
  if (claude.calls > 0) {
    events.push(
      { ...base("director", "dispatched", "dispatched"), provider: "anthropic", requestedModel: claude.model, dispatchedAt: run.startedAtMs,
        reconciliationState: "pending", transportAttemptCoverage: "single_dispatch" },
      { ...base("director", "provider-observed", "provider_observed"), provider: "anthropic", requestedModel: claude.model, returnedModel: claude.model,
        inputTokens: claude.inputTokens, outputTokens: claude.outputTokens, totalTokens: claude.inputTokens + claude.outputTokens, toolCalls: claude.calls,
        estimatedCostUsd: claude.usd, usageQuality: "observed", pricingVersion, finishedAt: run.finishedAtMs, reconciliationState: "pending",
        transportAttemptCoverage: "single_dispatch" },
      { ...base("director", "terminal", "terminal"), finishedAt: run.finishedAtMs, outcome },
    );
  }
  const kimodo = run.report?.kimodoCalls ?? 0;
  if (kimodo > 0) {
    events.push(
      { ...base("kimodo", "dispatched", "dispatched"), provider: "kimodo", requestedModel: "kimodo", dispatchedAt: run.startedAtMs,
        reconciliationState: "pending", transportAttemptCoverage: "single_dispatch" },
      { ...base("kimodo", "provider-observed", "provider_observed"), provider: "kimodo", requestedModel: "kimodo", returnedModel: "kimodo",
        toolCalls: kimodo, estimatedCostUsd: null, usageQuality: "partial", pricingVersion, finishedAt: run.finishedAtMs,
        reconciliationState: "pending", transportAttemptCoverage: "single_dispatch" },
      { ...base("kimodo", "terminal", "terminal"), finishedAt: run.finishedAtMs, outcome },
    );
  }
  return events;
}

/** (dad, Nov 26) What the shared fal ledger (ltx-effects/seedance/spend.json, booked BEFORE each H3 request) says was spent between
 *  two times (ms), in dollars. Its times are the engine machine's local time, to the second. */
export function falSpendBetween(ledger: unknown, fromMs: number, toMs: number): number {
  const calls = typeof ledger === "object" && ledger !== null && Array.isArray((ledger as { calls?: unknown }).calls)
    ? (ledger as { calls: { at?: unknown; usd?: unknown }[] }).calls : [];
  let usd = 0;
  for (const c of calls) {
    const at = typeof c?.at === "string" ? Date.parse(c.at) : NaN;
    if (!Number.isFinite(at) || at < fromMs - 1000 || at > toMs + 1000) continue;
    usd += typeof c.usd === "number" && Number.isFinite(c.usd) ? c.usd : 0;   // (a refund line is negative: an H3 request fal refused)
  }
  return Math.max(0, +usd.toFixed(5));
}

/** (dad, Nov 26) A run that was stopped or failed is free for the person, but the AI money it really spent counts toward the
 *  daily limit and the trials' hourly limit: what fal and Claude booked during the run, never more than its card's price (other
 *  runs at the same time book into the same ledgers, so the price is the most this run can have spent). */
export function stoppedRunCost(run: Pick<V1EngineRunEnd, "price" | "report" | "kind">, falUsd: number, claudeUsd: number): number {
  const real = Math.ceil(Math.max(0, falUsd + claudeUsd) * 100 - 1e-9);
  return Math.max(0, Math.min(real, v1RunCharge(run).credits));
}

export type V1UsageMeterDeps = {
  credits: AiCreditGate;
  /** (dad, Nov 26) the shared fal ledger (null when it can't be read: nothing is counted). */
  readFalLedger?: () => unknown;
  recorder: UsageEventRecorder; // recordUsageEvent (account usage store + journal)
  withOwner: <T>(ownerId: string, action: () => T) => T; // withAccountUsageOwner
  readLedger: () => { ledger: unknown; exceptWho: string | null }; // the shared Claude ledger + the chat brain's own `who`
  pricingVersion: string;
};

/** The animator core's usage hooks (v1AnimatorCore V1UsageHooks), wired to the Help Assistant's own credit gate + recorder. */
export function createV1UsageMeter(deps: V1UsageMeterDeps): V1UsageHooks {
  return {
    creditsShort(ownerId, credits, held = 0, exceptPicture = null, exceptProject = null) {
      try { deps.credits.assertAvailable(ownerId, held, credits, { exceptPicture, exceptProject }); return null; }
      catch (error) { return error instanceof Error ? error.message : String(error); }
    },
    // (Nov 22, Arthur: "as cheap as possible") an answer costs what it really cost: 1 credit per started cent (at least 1); the old
    // average (15) only when the cost is unknown
    // (dad, Nov 26) a plan answer the card's planning amount covers (the first plan + 3 changes) is NOT charged: its real cost only counts
    // toward the limits. A further change is charged its WARM cost (never the cold rulebook load), at most PAID_CHANGE_MAX_CREDITS (what
    // the card says first); whatever we paid above that counts toward the limits too.
    turnAnswered({ ownerId, projectId, turnId, costUsd, realCostUsd, free }) {
      const known = (usd: number | null | undefined) => typeof usd === "number" && Number.isFinite(usd) && usd > 0;
      const real = known(realCostUsd) ? creditsForCostUsd(realCostUsd) : known(costUsd) ? creditsForCostUsd(costUsd) : AI_ACTION_CREDITS.chat;
      const charged = free ? 0 : Math.min(PAID_CHANGE_MAX_CREDITS, known(costUsd) ? creditsForCostUsd(costUsd) : AI_ACTION_CREDITS.chat);
      if (charged > 0) { try { deps.credits.spend(ownerId, turnId, charged, "chat"); } catch { /* the answer is already shown */ } }
      // a free answer HOLDS its real cost until this project's Animate (then the card's planning amount covers it)
      if (real > charged) { try { deps.credits.noteCost?.(ownerId, free ? `plan:${projectId}:${turnId}` : `ours:${turnId}`, real - charged, free ? "pending_plan" : "cold_load"); } catch { /* best effort */ } }
    },
    engineRun(run) {
      let claude: ClaudeSpend = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, model: null };
      try { const { ledger, exceptWho } = deps.readLedger(); claude = claudeSpendBetween(ledger, run.startedAtMs, run.finishedAtMs, exceptWho); } catch { /* unreadable ledger = no Claude record */ }
      deps.withOwner(run.ownerId, () => {
        for (const event of v1EngineRunEvents(run, claude, deps.pricingVersion)) { try { deps.recorder(event); } catch { /* best effort */ } }
      });
      if (run.status === "done" && run.report) {
        const charge = v1RunCharge(run);
        try { deps.credits.spend(run.ownerId, run.runId, charge.credits, charge.kind); } catch { /* the animation is already made */ }
      } else if (run.status !== "refused") {
        // (dad, Nov 26) stopped or failed: free for the person, but its real AI money counts toward the limits
        try {
          const fal = falSpendBetween(deps.readFalLedger?.() ?? null, run.startedAtMs, run.finishedAtMs);
          const cost = stoppedRunCost(run, fal, claude.usd);
          if (cost > 0) deps.credits.noteCost?.(run.ownerId, `stopped:${run.runId}`, cost, "stopped_run");
        } catch { /* metering never breaks an animation */ }
      }
    },
    // (dad, Nov 26) a gate picture's real cost while it waits at its card (0 = animated or charged: no longer waiting)
    pictureWaiting(ownerId, pictureId, credits) {
      try { deps.credits.noteCost?.(ownerId, pictureId, Math.max(0, Math.ceil(credits)), "waiting_picture"); } catch { /* best effort */ }
    },
    planningSettled(ownerId, projectId) { try { deps.credits.settlePlanning?.(ownerId, projectId); } catch { /* best effort */ } },
    // (Nov 22) a gate picture that cost H3 money and was replaced by a new message instead of animated: its real cost, once
    pictureCharge(ownerId, runId, credits) {
      if (!(credits > 0)) return;
      try { deps.credits.spend(ownerId, runId, Math.ceil(credits), "animation"); } catch { /* the picture is already made */ }
    },
  };
}
