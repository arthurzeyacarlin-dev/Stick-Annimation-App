// Shared shapes for the Phase 3 bench page and its dev-only API route (the director contract: director/direct.ts).
import type { DirectProgress, DirectResult, DirectStage } from "@/src/lib/animator/director/direct";
import type { DirectedPlan } from "@/src/lib/animator/director/repair";

export type BenchStage = DirectStage;
export type BenchProgress = DirectProgress;
export type BenchPlan = DirectedPlan;
export type BenchResult = DirectResult;

export type BenchProvider = "stub" | "terra" | "luna" | "claude";
// THE AI ANIMATOR'S AI = LUNA (Arthur, 2026-10-07). Round 1 Terra vs Luna: Luna won (same quality, ~10× cheaper).
// Round 2, a BLIND TEST Luna vs Claude Haiku 4.5: a tie on Arthur's ratings, Luna 2.7× cheaper → Luna. The page now
// runs only Luna ("one AI model"). (The page still shows two answers side by side, blind, when this lists two.)
export const BENCH_MODELS = ["luna"] as const;
export type BenchModel = (typeof BENCH_MODELS)[number];
export const MODEL_NAME: Record<BenchProvider, string> = { stub: "Pretend answer", terra: "Terra", luna: "Luna", claude: "Claude" };
// MONEY (Arthur, 2026-10-07): the bench stops at $0.50 spent in total, and one bench run at $0.30.
export const BENCH_RUN_BUDGET_USD = 3.0; // (the spec's run budget)
export const BENCH_TOTAL_CAP_USD = 5.0; // (Arthur, 2026-10-07: back to the spec's $5 hard cap)
// The most one Terra call may cost (the director's pre-send check refuses anything above it), and the most one bench
// prompt may cost: Terra's plan + Terra's ONE review call = 2 calls.
export const BENCH_CALL_MAX_USD = 0.04;
export const BENCH_PROMPT_WORST_USD = 2 * BENCH_CALL_MAX_USD;
// STOP BEFORE THE CAP: a real prompt starts only when even its worst case still fits under both limits.
export function benchBudgetBlock(runUsd: number, totalUsd: number): string | null {
  if (totalUsd + BENCH_PROMPT_WORST_USD > BENCH_TOTAL_CAP_USD + 1e-9) return `Stopped before the cap: spent $${totalUsd.toFixed(2)} of $${BENCH_TOTAL_CAP_USD.toFixed(2)} in total (one more prompt could cost up to $${BENCH_PROMPT_WORST_USD.toFixed(2)}).`;
  if (runUsd + BENCH_PROMPT_WORST_USD > BENCH_RUN_BUDGET_USD + 1e-9) return `Stopped before the run budget: this run spent $${runUsd.toFixed(2)} of $${BENCH_RUN_BUDGET_USD.toFixed(2)} (one more prompt could cost up to $${BENCH_PROMPT_WORST_USD.toFixed(2)}).`;
  return null;
}

export type SpendRun = { at: string; runId: string; promptId: string; provider: BenchProvider; ok: boolean; costUsd: number; ms: number; repairs: number; reviewed: boolean };
export type SpendLedger = { totalUsd: number; runs: SpendRun[] };
export type BenchRating = "good" | "ok" | "bad";
export type RatingEntry = { promptId: string; rating: BenchRating; at: string; provider?: BenchProvider; note?: string };
export type RatingsFile = { ratings: RatingEntry[] };

// One line of the streamed answer (newline-delimited JSON).
export type BenchLine =
  | ({ type: "progress" } & BenchProgress)
  | { type: "result"; result: BenchResult; spend: { runUsd: number; totalUsd: number } }
  | { type: "error"; message: string };
