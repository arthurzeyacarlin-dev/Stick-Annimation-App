import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import {
  DEFAULT_DEV_AI_TIME_RANGE,
  DEV_AI_COST_DASHBOARD_ROUTE,
  DEV_AI_TIME_RANGE_VALUES,
  getDevAiDashboardData,
  isDevAiCostDashboardEnabledForRequestHost,
  isDevAiTimeRange,
  type DevAiCostLogEntry,
  type DevAiTimeRange,
} from "@/src/lib/ai/devAiCostDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

type ForecastScenarioKey = "current" | "2x" | "3x";

type ForecastScenario = {
  key: ForecastScenarioKey;
  label: string;
  multiplier: number;
  estimatedCostUsd: number;
  estimatedTotalTokens: number;
  requestCount: number;
};

type SelectedBucketDetails = {
  key: string;
  label: string;
  shortLabel: string;
  estimatedCostUsd: number;
  requestCount: number;
  estimatedTotalTokens: number;
  isCurrent: boolean;
  selectionMode: "default" | "explicit";
  entries: DevAiCostLogEntry[];
};

type ForecastDriverRow = {
  id: string;
  prompt: string;
  reasoning: string;
  model: string;
  baseTokens: number;
  baseCostUsd: number;
  projectedTokens: number;
  projectedCostUsd: number;
};

type ReasonInsight = {
  key: string;
  title: string;
  detail: string;
  suggestion: string;
  score: number;
};

type InsightTone = "sky" | "amber" | "red";

type CostInsightResult = {
  reasons: ReasonInsight[];
  suggestions: string[];
  tone: InsightTone;
};

type ChartRgbColor = {
  red: number;
  green: number;
  blue: number;
};

const PANEL_CLASSES =
  "rounded-2xl border border-sky-500/20 bg-slate-900/80 p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.06),0_24px_60px_rgba(37,99,235,0.12)] backdrop-blur";

const SUMMARY_CARD_CLASSES =
  "rounded-2xl border border-sky-500/20 bg-slate-900/80 p-5 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_18px_40px_rgba(14,165,233,0.08)]";

const CONTROL_BUTTON_CLASSES =
  "rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-sky-400/35 hover:text-slate-50";

const BUCKET_TABLE_PROMPT_PREVIEW_LENGTH = 80;
const FORECAST_DRIVER_ROW_LIMIT = 10;

const CHART_SCALE_MIN_CEILING_BY_RANGE: Record<DevAiTimeRange, number> = {
  minutes: 1,
  hours: 1,
  days: 1,
  weeks: 1,
  months: 1,
};

const CHART_COST_SEVERITY_THRESHOLDS_USD = {
  lime: 0.25,
  yellow: 0.5,
  orange: 0.75,
  red: 1,
} as const;

const CHART_COST_COLOR_STOPS: Array<{ cost: number; color: ChartRgbColor }> = [
  { cost: 0, color: { red: 34, green: 197, blue: 94 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.lime, color: { red: 163, green: 230, blue: 53 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.yellow, color: { red: 250, green: 204, blue: 21 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.orange, color: { red: 249, green: 115, blue: 22 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.red, color: { red: 239, green: 68, blue: 68 } },
];

const FORECAST_BAR_COLORS: Record<ForecastScenarioKey, ChartRgbColor> = {
  current: { red: 56, green: 189, blue: 248 },
  "2x": { red: 59, green: 130, blue: 246 },
  "3x": { red: 37, green: 99, blue: 235 },
};

const getFirstSearchParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

const formatInteger = (value: number) => new Intl.NumberFormat("en-US").format(Math.round(value));

const formatEstimatedCost = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  }).format(value);

const formatTimestampDate = (value: string) => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(parsedDate);
};

const formatTimestampTime = (value: string) => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
  }).format(parsedDate);
};

const toLabel = (value: string | null) =>
  value ? value.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) : "Other";

const truncatePrompt = (value: string, maxLength = 140) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;

const shouldShowChartLabel = (index: number, bucketCount: number) => {
  if (bucketCount <= 8) {
    return true;
  }

  const step = bucketCount <= 24 ? 3 : 6;
  return index === 0 || index === bucketCount - 1 || index % step === 0;
};

const getTimeRangeButtonLabel = (value: DevAiTimeRange) => {
  switch (value) {
    case "minutes":
      return "Minutes";
    case "hours":
      return "Hours";
    case "days":
      return "Days";
    case "weeks":
      return "Weeks";
    case "months":
    default:
      return "Months";
  }
};

const getSummaryCardNote = (label: string) => {
  switch (label) {
    case "Estimated cost today":
    case "Requests today":
    case "Estimated tokens today":
      return "Since local midnight";
    case "Estimated cost this week":
    case "Requests this week":
    case "Estimated tokens this week":
      return "Local calendar week";
    case "Estimated cost this month":
    case "Requests this month":
    case "Estimated tokens this month":
      return "Local calendar month";
    default:
      return null;
  }
};

const formatChartScaleCost = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.1 ? 3 : 2,
    maximumFractionDigits: value > 0 && value < 0.1 ? 3 : 2,
  }).format(value);

const getChartScaleStepUsd = (maxBucketCostUsd: number) => {
  if (maxBucketCostUsd <= 2) {
    return 0.25;
  }

  if (maxBucketCostUsd <= 4) {
    return 0.5;
  }

  if (maxBucketCostUsd <= 10) {
    return 1;
  }

  if (maxBucketCostUsd <= 20) {
    return 2;
  }

  return 5;
};

const roundUpToStep = (value: number, step: number) => Math.ceil((value + Number.EPSILON) / step) * step;

const getChartVisualMaxCostUsd = (timeRange: DevAiTimeRange, maxBucketCostUsd: number) => {
  if (maxBucketCostUsd <= 0) {
    return 0;
  }

  const minCeiling = CHART_SCALE_MIN_CEILING_BY_RANGE[timeRange];
  if (maxBucketCostUsd <= minCeiling) {
    return minCeiling;
  }

  return Math.max(minCeiling, roundUpToStep(maxBucketCostUsd, getChartScaleStepUsd(maxBucketCostUsd)));
};

const getGenericChartVisualMaxCostUsd = (maxBucketCostUsd: number, minCeiling = 0.25) => {
  if (maxBucketCostUsd <= 0) {
    return 0;
  }

  if (maxBucketCostUsd <= minCeiling) {
    return minCeiling;
  }

  return Math.max(minCeiling, roundUpToStep(maxBucketCostUsd, getChartScaleStepUsd(maxBucketCostUsd)));
};

const getChartBarHeightStyle = ({
  bucketCost,
  visualMaxBucketCostUsd,
}: {
  bucketCost: number;
  visualMaxBucketCostUsd: number;
}) => {
  if (bucketCost <= 0 || visualMaxBucketCostUsd <= 0) {
    return { height: "0%" };
  }

  const ratio = Math.min(bucketCost / visualMaxBucketCostUsd, 1);
  return {
    height: `${Math.min(ratio * 100, 100)}%`,
  };
};

const getChartScaleLabels = (maxBucketCostUsd: number) => {
  if (maxBucketCostUsd <= 0) {
    return [{ label: formatChartScaleCost(0), bottomPercent: 0 }];
  }

  const step = getChartScaleStepUsd(maxBucketCostUsd);
  const labels: Array<{ label: string; bottomPercent: number }> = [];

  for (let value = maxBucketCostUsd; value > 0; value = Number((value - step).toFixed(4))) {
    const normalizedValue = Number(value.toFixed(4));
    labels.push({
      label: formatChartScaleCost(normalizedValue),
      bottomPercent: (normalizedValue / maxBucketCostUsd) * 100,
    });
  }

  labels.push({ label: formatChartScaleCost(0), bottomPercent: 0 });
  return labels;
};

const interpolateNumber = (start: number, end: number, ratio: number) => start + (end - start) * ratio;

const getInterpolatedChartBarColor = (bucketCost: number) => {
  if (bucketCost <= 0) {
    return CHART_COST_COLOR_STOPS[0]?.color ?? { red: 34, green: 197, blue: 94 };
  }

  const lastStop = CHART_COST_COLOR_STOPS[CHART_COST_COLOR_STOPS.length - 1];
  if (bucketCost >= lastStop.cost) {
    return lastStop.color;
  }

  for (let index = 1; index < CHART_COST_COLOR_STOPS.length; index += 1) {
    const previousStop = CHART_COST_COLOR_STOPS[index - 1];
    const currentStop = CHART_COST_COLOR_STOPS[index];
    if (bucketCost > currentStop.cost) {
      continue;
    }

    const stopRange = currentStop.cost - previousStop.cost;
    const ratio = stopRange <= 0 ? 0 : (bucketCost - previousStop.cost) / stopRange;
    return {
      red: Math.round(interpolateNumber(previousStop.color.red, currentStop.color.red, ratio)),
      green: Math.round(interpolateNumber(previousStop.color.green, currentStop.color.green, ratio)),
      blue: Math.round(interpolateNumber(previousStop.color.blue, currentStop.color.blue, ratio)),
    };
  }

  return lastStop.color;
};

const toRgbCss = (color: ChartRgbColor) => `rgb(${color.red} ${color.green} ${color.blue})`;

const toRgbAlphaCss = (color: ChartRgbColor, alpha: number) => `rgb(${color.red} ${color.green} ${color.blue} / ${alpha})`;

const getSeverityZoneStyle = (
  costUsd: number,
  emphasis: "soft" | "strong" = "soft",
): CSSProperties | undefined => {
  if (costUsd <= 0) {
    return undefined;
  }

  const color = getInterpolatedChartBarColor(costUsd);
  const severityProgress = Math.min(costUsd / CHART_COST_SEVERITY_THRESHOLDS_USD.red, 1);
  const borderAlpha = emphasis === "strong"
    ? interpolateNumber(0.18, 0.44, severityProgress)
    : interpolateNumber(0.14, 0.28, severityProgress);
  const backgroundAlpha = emphasis === "strong"
    ? interpolateNumber(0.03, 0.13, severityProgress)
    : interpolateNumber(0.02, 0.08, severityProgress);
  const accentAlpha = emphasis === "strong"
    ? interpolateNumber(0.36, 0.84, severityProgress)
    : interpolateNumber(0.26, 0.62, severityProgress);

  return {
    borderColor: toRgbAlphaCss(color, borderAlpha),
    backgroundColor: toRgbAlphaCss(color, backgroundAlpha),
    boxShadow: `inset 3px 0 0 ${toRgbAlphaCss(color, accentAlpha)}`,
  };
};

const getSeverityTextStyle = (costUsd: number): CSSProperties | undefined =>
  costUsd > 0
    ? {
        color: toRgbCss(getInterpolatedChartBarColor(costUsd)),
      }
    : undefined;

const getChartBarShadow = ({
  color,
  isSelectedBucket,
  isCurrentBucket,
}: {
  color: ChartRgbColor;
  isSelectedBucket: boolean;
  isCurrentBucket: boolean;
}) => {
  const colorGlow = `0 0 16px rgb(${color.red} ${color.green} ${color.blue} / 0.18)`;

  if (isSelectedBucket) {
    return `0 0 24px rgba(255,255,255,0.16), 0 0 34px rgba(56,189,248,0.28), ${colorGlow}`;
  }

  if (isCurrentBucket) {
    return `0 0 18px rgba(56,189,248,0.18), ${colorGlow}`;
  }

  return colorGlow;
};

const getRealChartBarStateClasses = ({
  bucketCost,
  isSelectedBucket,
  isCurrentBucket,
}: {
  bucketCost: number;
  isSelectedBucket: boolean;
  isCurrentBucket: boolean;
}) => {
  if (bucketCost <= 0) {
    return "";
  }

  return isSelectedBucket
    ? "z-10 border border-white/95 ring-2 ring-white/95 outline outline-2 outline-white/85"
    : isCurrentBucket
      ? "ring-1 ring-white/30"
      : "group-hover:brightness-110 group-hover:ring-1 group-hover:ring-white/40";
};

const getForecastBarStateClasses = (isSelectedScenario: boolean) =>
  isSelectedScenario
    ? "z-10 border border-white/95 ring-2 ring-white/95 outline outline-2 outline-white/85"
    : "group-hover:brightness-110 group-hover:ring-1 group-hover:ring-white/40";

const getForecastBarShadow = (color: ChartRgbColor, isSelectedScenario: boolean) => {
  const colorGlow = `0 0 18px rgb(${color.red} ${color.green} ${color.blue} / 0.24)`;
  return isSelectedScenario
    ? `0 0 22px rgba(255,255,255,0.18), 0 0 32px rgba(59,130,246,0.28), ${colorGlow}`
    : colorGlow;
};

const floorToMinute = (value: Date) => {
  const nextValue = new Date(value);
  nextValue.setSeconds(0, 0);
  return nextValue;
};

const floorToHour = (value: Date) => {
  const nextValue = new Date(value);
  nextValue.setMinutes(0, 0, 0);
  return nextValue;
};

const startOfDay = (value: Date) => {
  const nextValue = new Date(value);
  nextValue.setHours(0, 0, 0, 0);
  return nextValue;
};

const startOfWeek = (value: Date) => {
  const nextValue = startOfDay(value);
  nextValue.setDate(nextValue.getDate() - nextValue.getDay());
  return nextValue;
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const addMinutes = (value: Date, amount: number) => new Date(value.getTime() + amount * 60_000);
const addHours = (value: Date, amount: number) => new Date(value.getTime() + amount * 60 * 60 * 1000);
const addDays = (value: Date, amount: number) => {
  const nextValue = new Date(value);
  nextValue.setDate(nextValue.getDate() + amount);
  return nextValue;
};
const addWeeks = (value: Date, amount: number) => addDays(value, amount * 7);
const addMonths = (value: Date, amount: number) => new Date(value.getFullYear(), value.getMonth() + amount, 1);

const parseTimestamp = (value: string) => {
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getTimeRangeStart = (timeRange: DevAiTimeRange, now = new Date()) => {
  switch (timeRange) {
    case "minutes":
      return addMinutes(floorToMinute(now), -59);
    case "hours":
      return addHours(floorToHour(now), -23);
    case "days":
      return addDays(startOfDay(now), -29);
    case "weeks":
      return addWeeks(startOfWeek(now), -11);
    case "months":
    default:
      return addMonths(startOfMonth(now), -11);
  }
};

const getEntriesInCurrentRange = (entries: DevAiCostLogEntry[], timeRange: DevAiTimeRange, now = new Date()) => {
  const rangeStart = getTimeRangeStart(timeRange, now);
  return entries.filter((entry) => {
    const timestamp = parseTimestamp(entry.timestamp);
    return timestamp != null && timestamp >= rangeStart;
  });
};

const getModelLabel = (entry: DevAiCostLogEntry) => (entry.modelNames.length > 0 ? entry.modelNames.join(", ") : "Local only");

const normalizeForecastScenarioKey = (value: string): ForecastScenarioKey | null => {
  if (value === "current" || value === "2x" || value === "3x") {
    return value;
  }

  return null;
};

const buildForecastPageHref = ({
  timeRange,
  bucketKey,
  forecastKey,
}: {
  timeRange: DevAiTimeRange;
  bucketKey?: string | null;
  forecastKey?: ForecastScenarioKey | null;
}) => {
  const searchParams = new URLSearchParams();

  if (timeRange !== DEFAULT_DEV_AI_TIME_RANGE) {
    searchParams.set("range", timeRange);
  }
  if (bucketKey) {
    searchParams.set("bucket", bucketKey);
  }
  if (forecastKey) {
    searchParams.set("forecast", forecastKey);
  }

  const serializedSearchParams = searchParams.toString();
  return serializedSearchParams.length > 0
    ? `${DEV_AI_COST_DASHBOARD_ROUTE}/lifetime?${serializedSearchParams}`
    : `${DEV_AI_COST_DASHBOARD_ROUTE}/lifetime`;
};

const buildForecastScenarios = (bucket: SelectedBucketDetails): ForecastScenario[] => [
  {
    key: "current",
    label: "Current",
    multiplier: 1,
    estimatedCostUsd: bucket.estimatedCostUsd,
    estimatedTotalTokens: bucket.estimatedTotalTokens,
    requestCount: bucket.requestCount,
  },
  {
    key: "2x",
    label: "2x",
    multiplier: 2,
    estimatedCostUsd: bucket.estimatedCostUsd * 2,
    estimatedTotalTokens: bucket.estimatedTotalTokens * 2,
    requestCount: bucket.requestCount * 2,
  },
  {
    key: "3x",
    label: "3x",
    multiplier: 3,
    estimatedCostUsd: bucket.estimatedCostUsd * 3,
    estimatedTotalTokens: bucket.estimatedTotalTokens * 3,
    requestCount: bucket.requestCount * 3,
  },
];

const buildForecastDriverRows = (entries: DevAiCostLogEntry[], multiplier: number): ForecastDriverRow[] =>
  [...entries]
    .map((entry) => ({
      id: entry.id,
      prompt: entry.prompt,
      reasoning: toLabel(entry.reasoningLevel),
      model: getModelLabel(entry),
      baseTokens: entry.estimatedTotalTokens,
      baseCostUsd: entry.estimatedRequestCostUsd,
      projectedTokens: entry.estimatedTotalTokens * multiplier,
      projectedCostUsd: entry.estimatedRequestCostUsd * multiplier,
    }))
    .sort(
      (leftRow, rightRow) =>
        rightRow.projectedCostUsd - leftRow.projectedCostUsd ||
        rightRow.projectedTokens - leftRow.projectedTokens,
    );

const getAverage = (value: number, count: number) => (count > 0 ? value / count : 0);

const buildCostInsights = ({
  entries,
  totalCostUsd,
  totalTokens,
  totalRequests,
  multiplier,
  baseCostUsd,
  baseTokens,
}: {
  entries: DevAiCostLogEntry[];
  totalCostUsd: number;
  totalTokens: number;
  totalRequests: number;
  multiplier: number;
  baseCostUsd: number;
  baseTokens: number;
}): CostInsightResult => {
  if (entries.length === 0 || (totalCostUsd <= 0 && totalTokens <= 0 && totalRequests <= 0)) {
    return {
      reasons: [
        {
          key: "no-activity",
          title: "No costly activity in this selection yet",
          detail: "There are no paid model calls in the current selection, so there is nothing expensive to explain yet.",
          suggestion: "Run a real AI action to populate this page with cost guidance.",
          score: 100,
        },
      ],
      suggestions: ["Run a real AI action to populate this page with cost guidance."],
      tone: "sky",
    };
  }

  const totalPromptLength = entries.reduce((sum, entry) => sum + entry.prompt.length, 0);
  const maxPromptLength = entries.reduce((highestValue, entry) => Math.max(highestValue, entry.prompt.length), 0);
  const maxTokensPerRequest = entries.reduce((highestValue, entry) => Math.max(highestValue, entry.estimatedTotalTokens), 0);
  const averageTokensPerRequest = getAverage(baseTokens, entries.length);
  const averagePromptLength = getAverage(totalPromptLength, entries.length);

  const paidEntries = entries.filter((entry) => entry.estimatedRequestCostUsd > 0);
  const paidCostUsd = paidEntries.reduce((sum, entry) => sum + entry.estimatedRequestCostUsd, 0) * multiplier;
  const paidCostShare = totalCostUsd > 0 ? paidCostUsd / totalCostUsd : 0;
  const dominantEntry =
    [...entries].sort(
      (leftEntry, rightEntry) =>
        rightEntry.estimatedRequestCostUsd - leftEntry.estimatedRequestCostUsd ||
        rightEntry.estimatedTotalTokens - leftEntry.estimatedTotalTokens,
    )[0] ?? null;
  const dominantEntryProjectedCostUsd = (dominantEntry?.estimatedRequestCostUsd ?? 0) * multiplier;
  const dominantEntryShare = totalCostUsd > 0 ? dominantEntryProjectedCostUsd / totalCostUsd : 0;

  const higherReasoningEntries = entries.filter((entry) => {
    const reasoning = (entry.reasoningLevel ?? "").toLowerCase();
    return reasoning === "medium" || reasoning === "high";
  });
  const higherReasoningCostUsd =
    higherReasoningEntries.reduce((sum, entry) => sum + entry.estimatedRequestCostUsd, 0) * multiplier;
  const higherReasoningShare = totalCostUsd > 0 ? higherReasoningCostUsd / totalCostUsd : 0;

  const generationEntries = entries.filter((entry) => {
    const taskType = (entry.taskType ?? "").toLowerCase();
    return taskType.includes("generate");
  });
  const escalatedEntries = entries.filter(
    (entry) => entry.escalatedFromDefault || entry.fallbackModelUsed || entry.escalatedTo != null,
  );
  const lowCostHealthy =
    multiplier === 1 &&
    totalCostUsd < 0.25 &&
    totalTokens < 18_000 &&
    totalRequests <= 3 &&
    higherReasoningEntries.length <= 1 &&
    paidCostShare < 0.7;

  const reasons: ReasonInsight[] = [];

  if (multiplier > 1) {
    reasons.push({
      key: "repeat-multiplier",
      title: `Repeating this bucket ${multiplier}x scales the same spend pattern`,
      detail: `${formatEstimatedCost(baseCostUsd)} becomes ${formatEstimatedCost(totalCostUsd)} and ${formatInteger(baseTokens)} tokens become ${formatInteger(totalTokens)} tokens.`,
      suggestion: "Reuse or branch from an existing result instead of rerunning the full bucket pattern.",
      score: 100,
    });
  }

  if (lowCostHealthy) {
    reasons.push({
      key: "healthy-range",
      title: "This selection is still in a normal cost range",
      detail: `${formatEstimatedCost(totalCostUsd)} across ${formatInteger(totalRequests)} requests is not unusually high yet, so the main risk is repeating it too often.`,
      suggestion: "No urgent reduction is needed yet; just watch for repeated paid runs.",
      score: 88,
    });
  }

  if (!lowCostHealthy && dominantEntry && dominantEntryShare >= 0.45 && dominantEntryProjectedCostUsd >= 0.15) {
    reasons.push({
      key: "dominant-request",
      title: "One request is doing most of the damage",
      detail: `"${truncatePrompt(dominantEntry.prompt, 72)}" accounts for ${formatEstimatedCost(dominantEntryProjectedCostUsd)} of this selection.`,
      suggestion: "Tune the single expensive prompt first; it is the fastest way to shrink this bucket.",
      score: 90 + dominantEntryShare * 10,
    });
  }

  if (escalatedEntries.length > 0) {
    reasons.push({
      key: "escalation",
      title: "Escalation pushed part of this bucket onto a pricier path",
      detail: `${formatInteger(escalatedEntries.length)} requests escalated or fell back to a more expensive path in this selection.`,
      suggestion: "Keep prompts narrower so they can stay on the cheaper default path.",
      score: 84 + Math.min(escalatedEntries.length * 4, 10),
    });
  }

  if (paidCostShare >= 0.6) {
    reasons.push({
      key: "paid-models",
      title: "Paid model usage is the main driver here",
      detail: `${Math.round(paidCostShare * 100)}% of this selection comes from paid model calls rather than local-only responses.`,
      suggestion: "Use a lighter model for drafts and save the pricier model for final passes.",
      score: 80 + paidCostShare * 18,
    });
  }

  if (higherReasoningShare >= 0.4 || higherReasoningEntries.length >= 2) {
    reasons.push({
      key: "reasoning",
      title: "Higher reasoning is adding extra cost",
      detail: `${higherReasoningEntries.length} requests use medium/high reasoning and account for ${formatEstimatedCost(higherReasoningCostUsd)}.`,
      suggestion: "Drop reasoning for cleanup, restyling, or small revisions where depth is not buying much.",
      score: 72 + higherReasoningShare * 18,
    });
  }

  if (totalTokens >= 20_000 || averageTokensPerRequest >= 5_000 || maxTokensPerRequest >= 10_000) {
    reasons.push({
      key: "tokens",
      title: "Large token payloads are driving the cost",
      detail: `${formatInteger(totalTokens)} total tokens are in play here, with ${formatInteger(maxTokensPerRequest)} on the heaviest request.`,
      suggestion: "Tighten the prompt and split a big scene into smaller passes.",
      score: 68 + Math.min(totalTokens / 10_000, 22),
    });
  }

  if (generationEntries.length >= 3 || totalRequests >= 6) {
    reasons.push({
      key: "request-burst",
      title: "Too many expensive requests are landing in one bucket",
      detail: `${formatInteger(totalRequests)} requests landed here, including ${generationEntries.length} generation-heavy requests.`,
      suggestion: "Reduce same-bucket retries and keep one good variant before generating again.",
      score: 62 + Math.min(totalRequests * 3, 18),
    });
  }

  if (averagePromptLength >= 110 || maxPromptLength >= 180) {
    reasons.push({
      key: "prompt-complexity",
      title: "Prompt scope is widening the request cost",
      detail: `Prompt size averages ${formatInteger(averagePromptLength)} characters here, with the longest prompt at ${formatInteger(maxPromptLength)} characters.`,
      suggestion: "Ask for one scene or motion change at a time instead of one large compound prompt.",
      score: 58 + Math.min(averagePromptLength / 12, 18),
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      key: "balanced-load",
      title: "This bucket is mostly a steady mix of normal usage",
      detail: `${formatInteger(totalRequests)} requests and ${formatInteger(totalTokens)} tokens make up this selection without one single extreme cost driver.`,
      suggestion: "Focus on repeat frequency before raising model quality or prompt scope.",
      score: 42,
    });
  }

  const topReasons = reasons
    .sort((leftReason, rightReason) => rightReason.score - leftReason.score)
    .slice(0, 3);

  const suggestions = Array.from(new Set(topReasons.map((reason) => reason.suggestion))).slice(0, 3);

  const tone: InsightTone = totalCostUsd >= 1 ? "red" : totalCostUsd >= 0.5 ? "amber" : "sky";

  return {
    reasons: topReasons,
    suggestions,
    tone,
  };
};

export default async function DevAiCostDashboardLifetimePage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  noStore();

  const headerStore = await headers();
  const requestHost = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!isDevAiCostDashboardEnabledForRequestHost(requestHost)) {
    notFound();
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const rangeParam = getFirstSearchParam(resolvedSearchParams.range).trim();
  const selectedBucketKey = getFirstSearchParam(resolvedSearchParams.bucket).trim();
  const selectedForecastParam = getFirstSearchParam(resolvedSearchParams.forecast).trim();
  const timeRange = isDevAiTimeRange(rangeParam) ? rangeParam : DEFAULT_DEV_AI_TIME_RANGE;

  const dashboardData = await getDevAiDashboardData({
    timeRange,
    selectedBucketKey: selectedBucketKey || null,
  });

  const selectedRealBucket = dashboardData.chart.selectedBucket
    ? ({
        ...dashboardData.chart.selectedBucket,
        entries: dashboardData.chart.selectedBucket.entries,
      } satisfies SelectedBucketDetails)
    : null;

  const selectedForecastKey = selectedRealBucket ? normalizeForecastScenarioKey(selectedForecastParam) : null;
  const forecastScenarios = selectedRealBucket ? buildForecastScenarios(selectedRealBucket) : [];
  const selectedForecastScenario =
    selectedForecastKey == null
      ? null
      : forecastScenarios.find((scenario) => scenario.key === selectedForecastKey) ?? null;

  const chartScaleMaxCostUsd = getChartVisualMaxCostUsd(
    dashboardData.appliedFilters.timeRange,
    dashboardData.chart.maxBucketCostUsd,
  );
  const chartScaleLabels = getChartScaleLabels(chartScaleMaxCostUsd);
  const chartGuideLinePercents = chartScaleLabels
    .map((item) => item.bottomPercent)
    .filter((bottomPercent) => bottomPercent > 0 && bottomPercent < 100);

  const forecastScaleMaxCostUsd = getGenericChartVisualMaxCostUsd(
    Math.max(...forecastScenarios.map((scenario) => scenario.estimatedCostUsd), 0),
    1,
  );
  const forecastScaleLabels = getChartScaleLabels(forecastScaleMaxCostUsd);
  const forecastGuideLinePercents = forecastScaleLabels
    .map((item) => item.bottomPercent)
    .filter((bottomPercent) => bottomPercent > 0 && bottomPercent < 100);

  const currentRangeEntries = getEntriesInCurrentRange(dashboardData.historyEntries, timeRange, new Date());
  const currentRangeTokens = dashboardData.chart.buckets.reduce((sum, bucket) => sum + bucket.estimatedTotalTokens, 0);

  const insightEntries = selectedRealBucket?.entries ?? currentRangeEntries;
  const insightTotalCostUsd =
    selectedForecastScenario?.estimatedCostUsd ??
    selectedRealBucket?.estimatedCostUsd ??
    dashboardData.chart.totalCostUsd;
  const insightTotalTokens =
    selectedForecastScenario?.estimatedTotalTokens ??
    selectedRealBucket?.estimatedTotalTokens ??
    currentRangeTokens;
  const insightTotalRequests =
    selectedForecastScenario?.requestCount ??
    selectedRealBucket?.requestCount ??
    dashboardData.chart.totalRequests;
  const insightMultiplier = selectedForecastScenario?.multiplier ?? 1;
  const baseInsightCostUsd = selectedRealBucket?.estimatedCostUsd ?? dashboardData.chart.totalCostUsd;
  const baseInsightTokens = selectedRealBucket?.estimatedTotalTokens ?? currentRangeTokens;

  const costInsights = buildCostInsights({
    entries: insightEntries,
    totalCostUsd: insightTotalCostUsd,
    totalTokens: insightTotalTokens,
    totalRequests: insightTotalRequests,
    multiplier: insightMultiplier,
    baseCostUsd: baseInsightCostUsd,
    baseTokens: baseInsightTokens,
  });

  const forecastDriverRows =
    selectedRealBucket && selectedForecastScenario
      ? buildForecastDriverRows(selectedRealBucket.entries, selectedForecastScenario.multiplier)
      : [];
  const visibleForecastRows = forecastDriverRows.slice(0, FORECAST_DRIVER_ROW_LIMIT);
  const hiddenForecastRows = forecastDriverRows.slice(FORECAST_DRIVER_ROW_LIMIT);

  const closeRealDetailsHref = buildForecastPageHref({
    timeRange: dashboardData.appliedFilters.timeRange,
  });
  const closeForecastDetailsHref = buildForecastPageHref({
    timeRange: dashboardData.appliedFilters.timeRange,
    bucketKey: selectedRealBucket?.key ?? null,
  });
  const isExplicitRealSelection = selectedRealBucket?.selectionMode === "explicit";
  const selectedRealSeverityStyle = selectedRealBucket
    ? getSeverityZoneStyle(selectedRealBucket.estimatedCostUsd, "strong")
    : undefined;
  const selectedForecastSeverityStyle = selectedForecastScenario
    ? getSeverityZoneStyle(selectedForecastScenario.estimatedCostUsd, "strong")
    : undefined;

  const insightToneClasses =
    costInsights.tone === "red"
      ? "border-red-400/25 bg-red-500/[0.06]"
      : costInsights.tone === "amber"
        ? "border-amber-400/25 bg-amber-500/[0.06]"
        : "border-sky-500/20 bg-slate-900/80";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_38%),linear-gradient(180deg,#020617_0%,#020617_48%,#030712_100%)] text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className={PANEL_CLASSES}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-50">AI Cost Forecast</h1>
              <p className="mt-2 text-sm text-slate-300">Deeper cost analysis and forecast preview</p>
            </div>
            <Link href={DEV_AI_COST_DASHBOARD_ROUTE} className={CONTROL_BUTTON_CLASSES}>
              Back to dashboard
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Requests today", value: formatInteger(dashboardData.summary.requestsToday) },
              { label: "Requests this week", value: formatInteger(dashboardData.summary.requestsWeek) },
              { label: "Requests this month", value: formatInteger(dashboardData.summary.requestsMonth) },
            ].map((card) => (
              <article key={card.label} className={SUMMARY_CARD_CLASSES}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/65">{card.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-50">{card.value}</p>
                {getSummaryCardNote(card.label) ? (
                  <p className="mt-2 text-xs text-slate-400">{getSummaryCardNote(card.label)}</p>
                ) : null}
              </article>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Estimated cost today", value: formatEstimatedCost(dashboardData.summary.costTodayUsd) },
              { label: "Estimated cost this week", value: formatEstimatedCost(dashboardData.summary.costWeekUsd) },
              { label: "Estimated cost this month", value: formatEstimatedCost(dashboardData.summary.costMonthUsd) },
            ].map((card) => (
              <article key={card.label} className={SUMMARY_CARD_CLASSES}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/65">{card.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-50">{card.value}</p>
                {getSummaryCardNote(card.label) ? (
                  <p className="mt-2 text-xs text-slate-400">{getSummaryCardNote(card.label)}</p>
                ) : null}
              </article>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Estimated tokens today", value: formatInteger(dashboardData.summary.tokensToday) },
              { label: "Estimated tokens this week", value: formatInteger(dashboardData.summary.tokensWeek) },
              { label: "Estimated tokens this month", value: formatInteger(dashboardData.summary.tokensMonth) },
            ].map((card) => (
              <article key={card.label} className={SUMMARY_CARD_CLASSES}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/65">{card.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-50">{card.value}</p>
                {getSummaryCardNote(card.label) ? (
                  <p className="mt-2 text-xs text-slate-400">{getSummaryCardNote(card.label)}</p>
                ) : null}
              </article>
            ))}
          </div>

          <p className="text-sm text-slate-400">
            Cards use the same calendar totals as the main dashboard. Charts use the selected range.
          </p>
        </section>

        <section className={PANEL_CLASSES}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Real usage</h2>
              <p className="mt-1 text-sm text-slate-300">Viewing: {dashboardData.chart.title}</p>
              <p className="mt-2 text-sm text-slate-400">
                {selectedRealBucket
                  ? selectedRealBucket.selectionMode === "default"
                    ? "The latest active bucket is selected by default so you can inspect it immediately."
                    : "You are viewing the bucket you clicked."
                  : "Click a real bucket to inspect it and preview the forecast."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DEV_AI_TIME_RANGE_VALUES.map((value) => {
                const href = buildForecastPageHref({
                  timeRange: value,
                });
                const isActive = dashboardData.appliedFilters.timeRange === value;

                return (
                  <Link
                    key={value}
                    href={href}
                    className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? "border-sky-400/50 bg-sky-400/15 text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.18)]"
                        : "border-slate-700 bg-slate-950/80 text-slate-300 hover:border-sky-400/35 hover:text-slate-50"
                    }`}
                  >
                    {getTimeRangeButtonLabel(value)}
                  </Link>
                );
              })}
            </div>
          </div>

          {dashboardData.chart.totalRequests > 0 ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-sky-500/15 bg-slate-950/85 p-4">
              <div className="grid gap-4 lg:grid-cols-[4.75rem_minmax(0,1fr)]">
                <div className="relative hidden h-[42rem] lg:block">
                  {chartScaleLabels.map((item) => (
                    <div
                      key={`${item.label}-${item.bottomPercent}`}
                      className="absolute right-0 translate-y-1/2 text-[11px] font-medium text-slate-400"
                      style={{ bottom: `${item.bottomPercent}%` }}
                    >
                      {item.label}
                    </div>
                  ))}
                </div>

                <div className="relative">
                  {chartGuideLinePercents.map((line) => (
                    <div
                      key={line}
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-sky-200/12"
                      style={{ bottom: `${line}%` }}
                    />
                  ))}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-sky-200/20" />

                  <div className="flex h-[42rem] items-end gap-2">
                    {dashboardData.chart.buckets.map((bucket, index) => {
                      const hasActivity = bucket.estimatedCostUsd > 0 || bucket.requestCount > 0;
                      const shouldShowBucketLabel =
                        hasActivity || bucket.isCurrent || shouldShowChartLabel(index, dashboardData.chart.buckets.length);
                      const isSelectedBucket = selectedRealBucket?.key === bucket.key;
                      const bucketColor = getInterpolatedChartBarColor(bucket.estimatedCostUsd);
                      const bucketHref = buildForecastPageHref({
                        timeRange: dashboardData.appliedFilters.timeRange,
                        bucketKey: bucket.key,
                      });

                      return (
                        <Link
                          key={bucket.key}
                          href={bucketHref}
                          className="group flex min-w-0 flex-1 flex-col justify-end"
                          title={`${bucket.label}: ${formatEstimatedCost(bucket.estimatedCostUsd)}, ${formatInteger(bucket.requestCount)} requests, ${formatInteger(bucket.estimatedTotalTokens)} tokens${bucket.isCurrent ? " (current bucket)" : ""}`}
                        >
                          <div
                            className={`relative flex h-[32rem] items-end justify-center after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-slate-800/80 ${
                              isSelectedBucket
                                ? "after:h-[2px] after:bg-white/85"
                                : bucket.isCurrent
                                  ? "after:bg-sky-300/35"
                                  : ""
                            }`}
                          >
                            {hasActivity ? (
                              <div
                                className={`relative z-10 w-[80%] transition-all duration-200 ${getRealChartBarStateClasses({
                                  bucketCost: bucket.estimatedCostUsd,
                                  isSelectedBucket,
                                  isCurrentBucket: bucket.isCurrent,
                                })}`}
                                style={{
                                  ...getChartBarHeightStyle({
                                    bucketCost: bucket.estimatedCostUsd,
                                    visualMaxBucketCostUsd: chartScaleMaxCostUsd,
                                  }),
                                  backgroundColor: toRgbCss(bucketColor),
                                  boxShadow: getChartBarShadow({
                                    color: bucketColor,
                                    isSelectedBucket,
                                    isCurrentBucket: bucket.isCurrent,
                                  }),
                                }}
                              />
                            ) : (
                              <div className="relative z-10 h-0 w-[80%]" />
                            )}
                          </div>

                          <div className="mt-2 grid h-10 grid-rows-[12px_16px] justify-items-center text-center">
                            <span
                              className={`flex h-3 items-center whitespace-nowrap text-[9px] font-semibold uppercase leading-none tracking-[0.16em] ${
                                bucket.isCurrent ? "text-sky-100" : "text-transparent"
                              }`}
                            >
                              {bucket.isCurrent ? "Now" : "\u00a0"}
                            </span>
                            <span
                              className={`flex h-4 items-end justify-center text-[10px] leading-none ${
                                isSelectedBucket ? "text-sky-100" : hasActivity ? "text-slate-300" : "text-slate-500"
                              }`}
                            >
                              {shouldShowBucketLabel ? bucket.shortLabel : "\u00a0"}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-sky-500/15 bg-slate-950/85 px-4 py-10 text-sm text-slate-400">
              No logged requests in this time view yet.
            </div>
          )}

          {selectedRealBucket ? (
            <div className="mt-6 border-t border-sky-500/10 pt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-50">Forecast preview</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    Based on {selectedRealBucket.label}. Blue bars repeat the same request mix, models, reasoning, and
                    token load.
                  </p>
                </div>
                <p className="text-sm text-slate-400">
                  {selectedForecastScenario
                    ? `Viewing ${selectedForecastScenario.label}.`
                    : "Click a blue bar to inspect the projected bucket."}
                </p>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-blue-500/20 bg-slate-950/90 p-4">
                <div className="grid gap-4 lg:grid-cols-[4.75rem_minmax(0,1fr)]">
                  <div className="relative hidden h-[16rem] lg:block">
                    {forecastScaleLabels.map((item) => (
                      <div
                        key={`${item.label}-${item.bottomPercent}`}
                        className="absolute right-0 translate-y-1/2 text-[11px] font-medium text-slate-400"
                        style={{ bottom: `${item.bottomPercent}%` }}
                      >
                        {item.label}
                      </div>
                    ))}
                  </div>

                  <div className="relative">
                    {forecastGuideLinePercents.map((line) => (
                      <div
                        key={line}
                        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-blue-200/12"
                        style={{ bottom: `${line}%` }}
                      />
                    ))}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-blue-200/20" />

                    <div className="mx-auto flex h-[16rem] max-w-2xl items-end justify-center gap-4 px-4">
                      {forecastScenarios.map((scenario) => {
                        const isSelectedScenario = selectedForecastScenario?.key === scenario.key;
                        const scenarioColor = FORECAST_BAR_COLORS[scenario.key];
                        const scenarioHref = buildForecastPageHref({
                          timeRange: dashboardData.appliedFilters.timeRange,
                          bucketKey: selectedRealBucket.key,
                          forecastKey: scenario.key,
                        });

                        return (
                          <Link
                            key={scenario.key}
                            href={scenarioHref}
                            className="group flex min-w-[5rem] flex-1 flex-col justify-end"
                            title={`${scenario.label}: ${formatEstimatedCost(scenario.estimatedCostUsd)}, ${formatInteger(scenario.requestCount)} requests, ${formatInteger(scenario.estimatedTotalTokens)} tokens`}
                          >
                            <div
                              className={`relative flex h-[11.5rem] items-end justify-center after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-blue-300/15 ${
                                isSelectedScenario ? "after:h-[2px] after:bg-white/85" : ""
                              }`}
                            >
                              <div
                                className={`relative z-10 w-[72%] transition-all duration-200 ${getForecastBarStateClasses(
                                  isSelectedScenario,
                                )}`}
                                style={{
                                  ...getChartBarHeightStyle({
                                    bucketCost: scenario.estimatedCostUsd,
                                    visualMaxBucketCostUsd: forecastScaleMaxCostUsd,
                                  }),
                                  backgroundColor: toRgbCss(scenarioColor),
                                  boxShadow: getForecastBarShadow(scenarioColor, isSelectedScenario),
                                }}
                              />
                            </div>

                            <div className="mt-3 grid h-10 grid-rows-[12px_16px] justify-items-center text-center">
                              <span
                                className={`flex h-3 items-center whitespace-nowrap text-[9px] font-semibold uppercase leading-none tracking-[0.16em] ${
                                  isSelectedScenario ? "text-white" : "text-transparent"
                                }`}
                              >
                                {isSelectedScenario ? "Selected" : "\u00a0"}
                              </span>
                              <span
                                className={`flex h-4 items-end justify-center whitespace-nowrap text-[10px] leading-none ${
                                  isSelectedScenario ? "text-blue-100" : "text-slate-300"
                                }`}
                              >
                                {scenario.label}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {selectedRealBucket ? (
          <section className={PANEL_CLASSES}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">Real bucket details</h2>
                <p className="mt-1 text-sm text-slate-300">{selectedRealBucket.label}</p>
                <p className="mt-2 text-sm text-slate-400">
                  {selectedRealBucket.selectionMode === "default"
                    ? "This is the latest active bucket in the current view."
                    : "You are viewing the bucket you clicked."}
                </p>
              </div>
              {isExplicitRealSelection ? (
                <Link href={closeRealDetailsHref} className={CONTROL_BUTTON_CLASSES}>
                  Back to latest bucket
                </Link>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="border border-sky-500/15 bg-slate-950/70 px-4 py-3" style={selectedRealSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/60">Cost</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatEstimatedCost(selectedRealBucket.estimatedCostUsd)}
                </p>
              </div>
              <div className="border border-sky-500/15 bg-slate-950/70 px-4 py-3" style={selectedRealSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/60">Requests</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatInteger(selectedRealBucket.requestCount)}
                </p>
              </div>
              <div className="border border-sky-500/15 bg-slate-950/70 px-4 py-3" style={selectedRealSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/60">Tokens</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatInteger(selectedRealBucket.estimatedTotalTokens)}
                </p>
              </div>
            </div>

            {selectedRealBucket.entries.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-sky-500/15 bg-slate-950/85">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-40" />
                    <col />
                    <col className="w-24" />
                    <col className="w-28" />
                    <col className="w-24" />
                    <col className="w-24" />
                  </colgroup>
                  <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Prompt</th>
                      <th className="px-4 py-3 font-medium">Reasoning</th>
                      <th className="px-4 py-3 font-medium">Model</th>
                      <th className="px-4 py-3 font-medium">Tokens</th>
                      <th className="px-4 py-3 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRealBucket.entries.map((entry) => (
                      <tr
                        key={`${selectedRealBucket.key}-${entry.id}`}
                        className="border-b border-slate-900 align-top text-slate-200 last:border-b-0"
                        style={getSeverityZoneStyle(entry.estimatedRequestCostUsd)}
                      >
                        <td className="whitespace-nowrap px-4 py-4 align-top text-slate-400">
                          <div className="min-w-0">
                            <div className="whitespace-nowrap">{formatTimestampDate(entry.timestamp)}</div>
                            <div className="mt-1 whitespace-nowrap text-slate-500">{formatTimestampTime(entry.timestamp)}</div>
                          </div>
                        </td>
                        <td className="min-w-0 px-4 py-4 align-top" title={entry.prompt}>
                          {entry.prompt.length > BUCKET_TABLE_PROMPT_PREVIEW_LENGTH ? (
                            <details className="group max-w-full">
                              <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
                                <div className="max-w-full break-words text-sm leading-6 text-slate-100">
                                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap group-open:hidden">
                                    {truncatePrompt(entry.prompt, BUCKET_TABLE_PROMPT_PREVIEW_LENGTH)}
                                  </span>
                                  <span className="hidden whitespace-pre-wrap break-words group-open:block">
                                    {entry.prompt}
                                  </span>
                                </div>
                                <span className="mt-2 inline-flex text-xs font-medium text-sky-200/85 transition hover:text-sky-100">
                                  <span className="group-open:hidden">See full prompt</span>
                                  <span className="hidden group-open:inline">Hide prompt</span>
                                </span>
                              </summary>
                            </details>
                          ) : (
                            <div className="max-w-full break-words text-sm leading-6 text-slate-100">{entry.prompt}</div>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-300">{toLabel(entry.reasoningLevel)}</td>
                        <td className="px-4 py-4 align-top text-slate-300">{getModelLabel(entry)}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatInteger(entry.estimatedTotalTokens)}</td>
                        <td
                          className={`whitespace-nowrap px-4 py-4 align-top font-medium ${
                            entry.estimatedRequestCostUsd > 0 ? "text-sky-100" : "text-slate-400"
                          }`}
                          style={getSeverityTextStyle(entry.estimatedRequestCostUsd)}
                        >
                          {formatEstimatedCost(entry.estimatedRequestCostUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-sky-500/15 bg-slate-950/85 px-4 py-10 text-sm text-slate-400">
                No requests landed in this bucket.
              </div>
            )}
          </section>
        ) : null}

        {selectedForecastScenario ? (
          <section className={PANEL_CLASSES}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">Forecast details</h2>
                <p className="mt-1 text-sm text-slate-300">
                  {selectedForecastScenario.label} of {selectedRealBucket?.label}
                </p>
              </div>
              <Link href={closeForecastDetailsHref} className={CONTROL_BUTTON_CLASSES}>
                Close forecast details
              </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="border border-blue-500/20 bg-slate-950/80 px-4 py-3" style={selectedForecastSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/60">Projected cost</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatEstimatedCost(selectedForecastScenario.estimatedCostUsd)}
                </p>
              </div>
              <div className="border border-blue-500/20 bg-slate-950/80 px-4 py-3" style={selectedForecastSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/60">Projected requests</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatInteger(selectedForecastScenario.requestCount)}
                </p>
              </div>
              <div className="border border-blue-500/20 bg-slate-950/80 px-4 py-3" style={selectedForecastSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/60">Projected tokens</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatInteger(selectedForecastScenario.estimatedTotalTokens)}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Projected from {selectedRealBucket?.label} with the same request mix repeated{" "}
              {selectedForecastScenario.multiplier}x.
            </p>

            {visibleForecastRows.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-blue-500/20 bg-slate-950/90">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col />
                    <col className="w-24" />
                    <col className="w-28" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col className="w-28" />
                    <col className="w-28" />
                  </colgroup>
                  <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Prompt</th>
                      <th className="px-4 py-3 font-medium">Reasoning</th>
                      <th className="px-4 py-3 font-medium">Model</th>
                      <th className="px-4 py-3 font-medium">Base tokens</th>
                      <th className="px-4 py-3 font-medium">Base cost</th>
                      <th className="px-4 py-3 font-medium">Projected tokens</th>
                      <th className="px-4 py-3 font-medium">Projected cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleForecastRows.map((row) => (
                      <tr
                        key={`${selectedForecastScenario.key}-${row.id}`}
                        className="border-b border-slate-900 align-top text-slate-200 last:border-b-0"
                        style={getSeverityZoneStyle(row.projectedCostUsd)}
                      >
                        <td className="px-4 py-4 align-top text-slate-100" title={row.prompt}>
                          <div className="max-w-full break-words text-sm leading-6">{truncatePrompt(row.prompt, 95)}</div>
                        </td>
                        <td className="px-4 py-4 align-top text-slate-300">{row.reasoning}</td>
                        <td className="px-4 py-4 align-top text-slate-300">{row.model}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatInteger(row.baseTokens)}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatEstimatedCost(row.baseCostUsd)}</td>
                        <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatInteger(row.projectedTokens)}</td>
                        <td
                          className="whitespace-nowrap px-4 py-4 align-top font-medium text-blue-100"
                          style={getSeverityTextStyle(row.projectedCostUsd)}
                        >
                          {formatEstimatedCost(row.projectedCostUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-blue-500/15 bg-slate-950/85 px-4 py-10 text-sm text-slate-400">
                No projected driver rows yet.
              </div>
            )}

            {hiddenForecastRows.length > 0 ? (
              <details className="mt-4 rounded-2xl border border-blue-500/15 bg-slate-950/80 p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-blue-100 [&::-webkit-details-marker]:hidden">
                  Show {formatInteger(hiddenForecastRows.length)} more projected rows
                </summary>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col />
                      <col className="w-24" />
                      <col className="w-28" />
                      <col className="w-24" />
                      <col className="w-24" />
                      <col className="w-28" />
                      <col className="w-28" />
                    </colgroup>
                    <tbody>
                      {hiddenForecastRows.map((row) => (
                        <tr
                          key={`${selectedForecastScenario.key}-extra-${row.id}`}
                          className="border-b border-slate-900 align-top text-slate-200 last:border-b-0"
                          style={getSeverityZoneStyle(row.projectedCostUsd)}
                        >
                          <td className="px-4 py-4 align-top text-slate-100" title={row.prompt}>
                            <div className="max-w-full break-words text-sm leading-6">{truncatePrompt(row.prompt, 95)}</div>
                          </td>
                          <td className="px-4 py-4 align-top text-slate-300">{row.reasoning}</td>
                          <td className="px-4 py-4 align-top text-slate-300">{row.model}</td>
                          <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatInteger(row.baseTokens)}</td>
                          <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatEstimatedCost(row.baseCostUsd)}</td>
                          <td className="whitespace-nowrap px-4 py-4 align-top text-slate-300">{formatInteger(row.projectedTokens)}</td>
                          <td
                            className="whitespace-nowrap px-4 py-4 align-top font-medium text-blue-100"
                            style={getSeverityTextStyle(row.projectedCostUsd)}
                          >
                            {formatEstimatedCost(row.projectedCostUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </section>
        ) : null}

        <section className={`rounded-2xl border p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.06),0_18px_40px_rgba(14,165,233,0.08)] ${insightToneClasses}`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Why this gets expensive</h2>
              <div className="mt-4 space-y-3">
                {costInsights.reasons.map((reason) => (
                  <div key={reason.key} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-100">{reason.title}</p>
                    <p className="mt-2 text-sm text-slate-300">{reason.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-50">How to lower it</h2>
              <div className="mt-4 space-y-3">
                {costInsights.suggestions.map((suggestion) => (
                  <div key={suggestion} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm text-slate-300">
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
