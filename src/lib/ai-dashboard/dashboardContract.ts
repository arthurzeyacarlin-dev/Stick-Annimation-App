export const TEST_WEEKLY_TOKENS = 10_000;

export type DashboardSource = "project" | "assistant";
export type DashboardFilter = "combined" | DashboardSource;
export type DashboardInterval = "minute" | "quarter" | "hour" | "day" | "week";
export type SourceState = "ready" | "absent" | "partial" | "unavailable";

export type DashboardReceipt = {
  id: string;
  source: DashboardSource;
  at: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  priceDate: string | null;
  model: string | null;
  reasoning: string | null;
  toolCalls: number;
};

export type DashboardSourceSnapshot = {
  state: SourceState;
  receipts: DashboardReceipt[];
  issues: string[];
  failed: number;
  cancelled: number;
  pending: number;
  priorAttempts: number;
};

export type DashboardSnapshot = {
  project: DashboardSourceSnapshot;
  assistant: DashboardSourceSnapshot;
  readAt: number;
};

export type DashboardBucket = {
  start: number;
  end: number;
  sampleAt: number;
  projectTokens: number;
  assistantTokens: number;
  combinedTokens: number;
  selectedTokens: number;
  intervalSelectedTokens: number;
  sincePreviousSelectedTokens: number | null;
  firstInWeek: boolean;
  selectedPercent: number;
  combinedPercent: number;
  color: string;
  resetAfter: boolean;
  isCurrent: boolean;
};

export const emptySource = (state: SourceState = "absent"): DashboardSourceSnapshot => ({
  state, receipts: [], issues: [], failed: 0, cancelled: 0, pending: 0, priorAttempts: 0,
});
