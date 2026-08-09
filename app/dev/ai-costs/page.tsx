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
  type DevAiTimeRange,
} from "@/src/lib/ai/devAiCostDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

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

const formatTimestampDateTime = (value: string) => {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
};

const toLabel = (value: string | null) =>
  value ? value.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) : "Other";

const truncatePrompt = (value: string, maxLength = 140) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;

const BUCKET_TABLE_PROMPT_PREVIEW_LENGTH = 80;

const shouldShowChartLabel = (index: number, bucketCount: number) => {
  if (bucketCount <= 8) {
    return true;
  }

  const step = bucketCount <= 24 ? 3 : 6;
  return index === 0 || index === bucketCount - 1 || index % step === 0;
};

const CHART_SCALE_MIN_CEILING_BY_RANGE: Record<DevAiTimeRange, number> = {
  minutes: 1,
  hours: 1,
  days: 1,
  weeks: 1,
  months: 1,
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

const CHART_COST_SEVERITY_THRESHOLDS_USD = {
  lime: 0.25,
  yellow: 0.5,
  orange: 0.75,
  red: 1,
} as const;

type ChartRgbColor = {
  red: number;
  green: number;
  blue: number;
};

const CHART_COST_COLOR_STOPS: Array<{ cost: number; color: ChartRgbColor }> = [
  { cost: 0, color: { red: 34, green: 197, blue: 94 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.lime, color: { red: 163, green: 230, blue: 53 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.yellow, color: { red: 250, green: 204, blue: 21 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.orange, color: { red: 249, green: 115, blue: 22 } },
  { cost: CHART_COST_SEVERITY_THRESHOLDS_USD.red, color: { red: 239, green: 68, blue: 68 } },
];

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

const getChartBarStateClasses = ({
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
      return "Since local midnight";
    case "Requests this week":
    case "Estimated cost this week":
      return "Local calendar week";
    case "Requests this month":
    case "Estimated cost this month":
      return "Local calendar month";
    case "Estimated tokens today":
      return "Since local midnight";
    case "Estimated tokens this week":
      return "Local calendar week";
    case "Estimated tokens this month":
      return "Local calendar month";
    default:
      return null;
  }
};

const SUMMARY_CARD_CLASSES =
  "rounded-2xl border border-sky-500/20 bg-slate-900/80 p-5 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_18px_40px_rgba(14,165,233,0.08)]";

const CONTROL_BUTTON_CLASSES =
  "rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-sky-400/35 hover:text-slate-50";

const buildDashboardHref = ({
  query,
  timeRange,
  workspaceType,
  taskType,
  bucketKey,
}: {
  query: string;
  timeRange: DevAiTimeRange;
  workspaceType: string;
  taskType: string;
  bucketKey?: string;
}) => {
  const searchParams = new URLSearchParams();

  if (query) {
    searchParams.set("q", query);
  }
  if (timeRange !== DEFAULT_DEV_AI_TIME_RANGE) {
    searchParams.set("range", timeRange);
  }
  if (workspaceType) {
    searchParams.set("workspace", workspaceType);
  }
  if (taskType) {
    searchParams.set("task", taskType);
  }
  if (bucketKey) {
    searchParams.set("bucket", bucketKey);
  }

  const serializedSearchParams = searchParams.toString();
  return serializedSearchParams.length > 0
    ? `${DEV_AI_COST_DASHBOARD_ROUTE}?${serializedSearchParams}`
    : DEV_AI_COST_DASHBOARD_ROUTE;
};

export default async function DevAiCostDashboardPage({
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
  const query = getFirstSearchParam(resolvedSearchParams.q).trim();
  const timeRangeParam = getFirstSearchParam(resolvedSearchParams.range).trim();
  const workspaceType = getFirstSearchParam(resolvedSearchParams.workspace).trim();
  const taskType = getFirstSearchParam(resolvedSearchParams.task).trim();
  const selectedBucketKey = getFirstSearchParam(resolvedSearchParams.bucket).trim();
  const timeRange = isDevAiTimeRange(timeRangeParam) ? timeRangeParam : DEFAULT_DEV_AI_TIME_RANGE;
  const dashboardData = await getDevAiDashboardData({
    query: query || null,
    timeRange,
    workspaceType: workspaceType || null,
    taskType: taskType || null,
    selectedBucketKey: selectedBucketKey || null,
  });
  const explicitSelectedBucket =
    dashboardData.chart.selectedBucket?.selectionMode === "explicit" ? dashboardData.chart.selectedBucket : null;
  const chartScaleMaxCostUsd = getChartVisualMaxCostUsd(
    dashboardData.appliedFilters.timeRange,
    dashboardData.chart.maxBucketCostUsd,
  );
  const chartScaleLabels = getChartScaleLabels(chartScaleMaxCostUsd);
  const chartGuideLinePercents = chartScaleLabels
    .map((item) => item.bottomPercent)
    .filter((bottomPercent) => bottomPercent > 0 && bottomPercent < 100);
  const selectedBucketSeverityStyle = explicitSelectedBucket
    ? getSeverityZoneStyle(explicitSelectedBucket.estimatedCostUsd, "strong")
    : undefined;
  const activeRequestBuckets = dashboardData.chart.buckets.filter((bucket) => bucket.requestCount > 0);
  const closeDetailsHref = buildDashboardHref({
    query: dashboardData.appliedFilters.query,
    timeRange: dashboardData.appliedFilters.timeRange,
    workspaceType: dashboardData.appliedFilters.workspaceType,
    taskType: dashboardData.appliedFilters.taskType,
  });
  const chartWindowExplanation = `Summary cards use local calendar totals. The chart shows ${dashboardData.chart.title.toLowerCase()}.`;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_38%),linear-gradient(180deg,#020617_0%,#020617_48%,#030712_100%)] text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-sky-500/20 bg-slate-900/80 p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.06),0_24px_60px_rgba(37,99,235,0.12)] backdrop-blur">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">AI Cost Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">Private local cost monitor for AI Animator usage</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-sky-200/60">
            Estimated cost only. Local development only.
          </p>
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

          <section className="rounded-2xl border border-sky-500/15 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${DEV_AI_COST_DASHBOARD_ROUTE}/lifetime`} className={CONTROL_BUTTON_CLASSES}>
                View cost forecast
              </Link>
            </div>

            {dashboardData.baseline.startedAt ? (
              <p className="mt-3 text-sm text-slate-300">
                Baseline active since {formatTimestampDateTime(dashboardData.baseline.startedAt)}. Summary cards and chart now
                count from that point forward.
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No custom baseline yet. Summary cards and chart currently include the full local dashboard history.
              </p>
            )}
          </section>
        </section>

        <section className="rounded-2xl border border-sky-500/20 bg-slate-900/80 p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_18px_40px_rgba(14,165,233,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Cost over time</h2>
              <p className="mt-1 text-sm text-slate-300">{dashboardData.chart.title}</p>
              <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-300">
                <span>Visible range cost: {formatEstimatedCost(dashboardData.chart.totalCostUsd)}</span>
                <span>Visible range requests: {formatInteger(dashboardData.chart.totalRequests)}</span>
                <span>{formatInteger(dashboardData.chart.activeBucketCount)} active buckets</span>
                <span>
                  Largest single request:{" "}
                  {dashboardData.chart.largestRequest
                    ? formatEstimatedCost(dashboardData.chart.largestRequest.estimatedRequestCostUsd)
                    : "n/a"}
                </span>
              </div>
              {dashboardData.chart.largestRequest ? (
                <p className="mt-2 max-w-4xl text-sm text-slate-400">
                  Spike prompt: {truncatePrompt(dashboardData.chart.largestRequest.prompt, 110)}
                </p>
              ) : null}
              {explicitSelectedBucket ? (
                <p className="mt-2 text-sm text-sky-100/85">
                  Viewing bucket: {explicitSelectedBucket.label}. Details are shown below.
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-400">Click a bar to inspect that time bucket.</p>
              <p className="mt-2 text-sm text-slate-400">{chartWindowExplanation}</p>
              {dashboardData.chart.totalRequests > 0 && dashboardData.chart.totalCostUsd === 0 ? (
                <p className="mt-2 text-sm text-sky-200/75">
                  Requests in this view resolved locally without a model call, so estimated cost stayed at $0.00.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {DEV_AI_TIME_RANGE_VALUES.map((value) => {
                const href = buildDashboardHref({
                  query: dashboardData.appliedFilters.query,
                  timeRange: value,
                  workspaceType: dashboardData.appliedFilters.workspaceType,
                  taskType: dashboardData.appliedFilters.taskType,
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
                      const shouldShowBucketLabel = hasActivity || bucket.isCurrent || shouldShowChartLabel(index, dashboardData.chart.buckets.length);
                      const isSelectedBucket = explicitSelectedBucket?.key === bucket.key;
                      const bucketColor = getInterpolatedChartBarColor(bucket.estimatedCostUsd);
                      const bucketBarStyle = getChartBarHeightStyle({
                        bucketCost: bucket.estimatedCostUsd,
                        visualMaxBucketCostUsd: chartScaleMaxCostUsd,
                      });
                      const bucketHref = buildDashboardHref({
                        query: dashboardData.appliedFilters.query,
                        timeRange: dashboardData.appliedFilters.timeRange,
                        workspaceType: dashboardData.appliedFilters.workspaceType,
                        taskType: dashboardData.appliedFilters.taskType,
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
                                className={`relative z-10 w-[80%] transition-all duration-200 ${getChartBarStateClasses({
                                  bucketCost: bucket.estimatedCostUsd,
                                  isSelectedBucket,
                                  isCurrentBucket: bucket.isCurrent,
                                })}`}
                                style={{
                                  ...bucketBarStyle,
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
        </section>

        {explicitSelectedBucket ? (
          <section className="rounded-2xl border border-sky-500/20 bg-slate-900/80 p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_18px_40px_rgba(14,165,233,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-50">Bucket details</h2>
                <p className="mt-1 text-sm text-slate-300">{explicitSelectedBucket.label}</p>
                <p className="mt-2 text-sm text-slate-400">You are viewing the bucket you clicked.</p>
              </div>
              <Link
                href={closeDetailsHref}
                className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm font-medium text-slate-300 hover:border-sky-400/35 hover:text-slate-50"
              >
                Close details
              </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="border border-sky-500/15 bg-slate-950/70 px-4 py-3" style={selectedBucketSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/60">Cost</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatEstimatedCost(explicitSelectedBucket.estimatedCostUsd)}
                </p>
              </div>
              <div className="border border-sky-500/15 bg-slate-950/70 px-4 py-3" style={selectedBucketSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/60">Requests</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatInteger(explicitSelectedBucket.requestCount)}
                </p>
              </div>
              <div className="border border-sky-500/15 bg-slate-950/70 px-4 py-3" style={selectedBucketSeverityStyle}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100/60">Tokens</p>
                <p className="mt-2 text-2xl font-semibold text-slate-50">
                  {formatInteger(explicitSelectedBucket.estimatedTotalTokens)}
                </p>
              </div>
            </div>

            {explicitSelectedBucket.entries.length > 0 ? (
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
                    {explicitSelectedBucket.entries.map((entry) => (
                      <tr
                        key={`${explicitSelectedBucket.key}-${entry.id}`}
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
                        <td className="px-4 py-4 align-top text-slate-300">
                          {entry.modelNames.length > 0 ? entry.modelNames.join(", ") : "Local only"}
                        </td>
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
        ) : (
          <section className="rounded-2xl border border-sky-500/20 bg-slate-900/80 p-6 shadow-[0_0_0_1px_rgba(56,189,248,0.05),0_18px_40px_rgba(14,165,233,0.08)]">
            <h2 className="text-lg font-semibold text-slate-50">Chart overview</h2>
            <p className="mt-2 text-sm text-slate-300">Visible range requests: {formatInteger(dashboardData.chart.totalRequests)}</p>
            <p className="mt-1 text-sm text-slate-300">Visible range cost: {formatEstimatedCost(dashboardData.chart.totalCostUsd)}</p>
            <p className="mt-1 text-sm text-slate-300">Active buckets: {formatInteger(dashboardData.chart.activeBucketCount)}</p>
            {activeRequestBuckets.length > 0 ? (
              <p className="mt-2 text-sm text-slate-300">
                Active bucket counts:{" "}
                {activeRequestBuckets.map((bucket) => `${bucket.shortLabel} (${formatInteger(bucket.requestCount)})`).join(", ")}
              </p>
            ) : null}
            <p className="mt-4 text-sm text-slate-400">Click a bar to inspect that time bucket.</p>
            <p className="mt-2 text-sm text-slate-400">{chartWindowExplanation}</p>
          </section>
        )}
      </div>
    </main>
  );
}
