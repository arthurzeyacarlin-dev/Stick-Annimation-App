import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEV_AI_COST_DASHBOARD_ROUTE = "/dev/ai-costs";
export const DEV_AI_COST_PRICING_REFERENCE_URL = "https://openai.com/api/pricing/";
export const DEV_AI_TIME_RANGE_VALUES = ["minutes", "hours", "days", "weeks", "months"] as const;
export const DEFAULT_DEV_AI_TIME_RANGE = "days";

export type DevAiTimeRange = (typeof DEV_AI_TIME_RANGE_VALUES)[number];
export type DevAiUsageSource = "none" | "estimated" | "mixed" | "actual";

export type DevAiCostLogEntry = {
  id: string;
  requestId: string;
  timestamp: string;
  workspaceType: string | null;
  taskType: string | null;
  reasoningLevel: string | null;
  modelNames: string[];
  initialModel: string | null;
  selectedModel: string | null;
  fallbackModelUsed: boolean;
  escalatedFromDefault: boolean;
  escalatedTo: string | null;
  escalationReason: string | null;
  complexityTier: string | null;
  prompt: string;
  searchUsed: boolean | null;
  success: boolean;
  statusCode: number | null;
  failureMessage: string | null;
  durationMs: number | null;
  modelCallCount: number;
  actualModelCallCount: number;
  usageSource: DevAiUsageSource;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  actualTotalTokens: number | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedRequestCostUsd: number;
};

export type DevAiDashboardFilters = {
  query?: string | null;
  timeRange?: DevAiTimeRange | null;
  workspaceType?: string | null;
  taskType?: string | null;
  selectedBucketKey?: string | null;
  ignoreBaseline?: boolean | null;
};

export type DevAiDashboardData = {
  logFilePath: string;
  availableWorkspaceTypes: string[];
  availableTaskTypes: string[];
  appliedFilters: {
    query: string;
    timeRange: DevAiTimeRange;
    workspaceType: string;
    taskType: string;
  };
  summary: {
    costTodayUsd: number;
    costWeekUsd: number;
    costMonthUsd: number;
    tokensToday: number;
    tokensWeek: number;
    tokensMonth: number;
    requestsToday: number;
    requestsWeek: number;
    requestsMonth: number;
  };
  lifetime: {
    totalCostUsd: number;
    totalTokens: number;
    totalRequests: number;
  };
  baseline: {
    startedAt: string | null;
  };
  chart: {
    timeRange: DevAiTimeRange;
    title: string;
    totalCostUsd: number;
    totalRequests: number;
    activeBucketCount: number;
    maxBucketCostUsd: number;
    largestRequest: DevAiCostLogEntry | null;
    buckets: Array<{
      key: string;
      label: string;
      shortLabel: string;
      estimatedCostUsd: number;
      requestCount: number;
      estimatedTotalTokens: number;
      isCurrent: boolean;
    }>;
    selectedBucket:
      | {
          key: string;
          label: string;
          shortLabel: string;
          estimatedCostUsd: number;
          requestCount: number;
          estimatedTotalTokens: number;
          isCurrent: boolean;
          selectionMode: "default" | "explicit";
          entries: DevAiCostLogEntry[];
        }
      | null;
  };
  filteredEntryCount: number;
  entries: DevAiCostLogEntry[];
  historyEntries: DevAiCostLogEntry[];
};

type DevAiModelCallUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  input_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
} | null;

type DevAiModelCallInput = {
  model: string;
  prompt?: string | null;
  instructions?: string | null;
  outputText?: string | null;
  usage?: DevAiModelCallUsage | unknown;
};

type DevAiRequestModelCall = {
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  hasActualUsage: boolean;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  actualTotalTokens: number | null;
};

type DevAiRequestScope = {
  modelCalls: DevAiRequestModelCall[];
};

type DevAiRequestUsageSummary = {
  modelNames: string[];
  modelCallCount: number;
  actualModelCallCount: number;
  usageSource: DevAiUsageSource;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  actualTotalTokens: number | null;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedRequestCostUsd: number;
};

type DevAiPricingConfig = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

type ChartBucket = {
  key: string;
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
  estimatedCostUsd: number;
  requestCount: number;
  estimatedTotalTokens: number;
  isCurrent: boolean;
};

type TimeRangeConfig = {
  timeRange: DevAiTimeRange;
  title: string;
  start: Date;
  buildBucketStart: (offset: number) => Date;
  buildBucketEnd: (start: Date) => Date;
  bucketCount: number;
  labelForBucket: (bucketStart: Date) => string;
  shortLabelForBucket: (bucketStart: Date) => string;
};

const DEV_AI_COST_LOG_DIRECTORY_PATH = path.join(process.cwd(), ".local", "ai-cost-dashboard");
const DEV_AI_COST_LOG_FILE_PATH = path.join(DEV_AI_COST_LOG_DIRECTORY_PATH, "requests.jsonl");
const DEV_AI_COST_BASELINE_FILE_PATH = path.join(DEV_AI_COST_LOG_DIRECTORY_PATH, "baseline.json");
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MAX_VISIBLE_RECENT_ENTRIES = 60;
const requestScopeStorage = new AsyncLocalStorage<DevAiRequestScope>();

const DEV_AI_PRICING_BY_MODEL: Record<string, DevAiPricingConfig> = {
  "gpt-5.2": {
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  "gpt-5.3-chat-latest": {
    inputUsdPerMillion: 1.75,
    cachedInputUsdPerMillion: 0.175,
    outputUsdPerMillion: 14,
  },
  "gpt-5.4": {
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 15,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeOptionalString = (value: unknown) => {
  const normalizedValue = normalizeString(value);
  return normalizedValue.length > 0 ? normalizedValue : null;
};

const normalizeBoolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);

const normalizeNumber = (value: unknown, fallback = 0) => (isFiniteNumber(value) ? value : fallback);

const normalizeNullableNumber = (value: unknown) => (isFiniteNumber(value) ? value : null);

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => normalizeString(item))
        .filter((item): item is string => item.length > 0)
    : [];

const estimateTokenCountFromText = (...values: Array<string | null | undefined>) => {
  const totalLength = values.reduce((sum, value) => {
    if (typeof value !== "string" || value.length === 0) {
      return sum;
    }

    return sum + value.length;
  }, 0);

  return totalLength > 0 ? Math.ceil(totalLength / 4) : 0;
};

const getPricingConfigForModel = (model: string) =>
  DEV_AI_PRICING_BY_MODEL[model] ?? DEV_AI_PRICING_BY_MODEL["gpt-5.4"];

const calculateEstimatedCostUsd = ({
  model,
  inputTokens,
  cachedInputTokens,
  outputTokens,
}: {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}) => {
  const pricingConfig = getPricingConfigForModel(model);
  const normalizedCachedInputTokens = Math.max(Math.min(cachedInputTokens, inputTokens), 0);
  const uncachedInputTokens = Math.max(inputTokens - normalizedCachedInputTokens, 0);

  return (
    (uncachedInputTokens / 1_000_000) * pricingConfig.inputUsdPerMillion +
    (normalizedCachedInputTokens / 1_000_000) * pricingConfig.cachedInputUsdPerMillion +
    (outputTokens / 1_000_000) * pricingConfig.outputUsdPerMillion
  );
};

const dedupeStrings = (values: string[]) => [...new Set(values)];

const normalizeHost = (requestHost: string | null | undefined) => {
  if (typeof requestHost !== "string") {
    return null;
  }

  const trimmedHost = requestHost.trim().toLowerCase();
  if (!trimmedHost) {
    return null;
  }

  if (trimmedHost.startsWith("[")) {
    const closingBracketIndex = trimmedHost.indexOf("]");
    return closingBracketIndex >= 0 ? trimmedHost.slice(0, closingBracketIndex + 1) : trimmedHost;
  }

  return trimmedHost.split(":")[0] ?? null;
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
const addHours = (value: Date, amount: number) => new Date(value.getTime() + amount * 3_600_000);
const addDays = (value: Date, amount: number) => {
  const nextValue = new Date(value);
  nextValue.setDate(nextValue.getDate() + amount);
  return nextValue;
};
const addWeeks = (value: Date, amount: number) => addDays(value, amount * 7);
const addMonths = (value: Date, amount: number) => new Date(value.getFullYear(), value.getMonth() + amount, 1);

const fullMinuteFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const shortMinuteFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const fullHourFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
});

const shortHourFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
});

const fullDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const shortDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const fullMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

const getTimeRangeConfig = (timeRange: DevAiTimeRange, now = new Date()): TimeRangeConfig => {
  switch (timeRange) {
    case "minutes": {
      const start = addMinutes(floorToMinute(now), -59);
      return {
        timeRange,
        title: "Last 60 minutes",
        start,
        buildBucketStart: (offset) => addMinutes(start, offset),
        buildBucketEnd: (bucketStart) => addMinutes(bucketStart, 1),
        bucketCount: 60,
        labelForBucket: (bucketStart) => fullMinuteFormatter.format(bucketStart),
        shortLabelForBucket: (bucketStart) => shortMinuteFormatter.format(bucketStart),
      };
    }
    case "hours": {
      const start = addHours(floorToHour(now), -23);
      return {
        timeRange,
        title: "Last 24 hours",
        start,
        buildBucketStart: (offset) => addHours(start, offset),
        buildBucketEnd: (bucketStart) => addHours(bucketStart, 1),
        bucketCount: 24,
        labelForBucket: (bucketStart) => fullHourFormatter.format(bucketStart),
        shortLabelForBucket: (bucketStart) => shortHourFormatter.format(bucketStart),
      };
    }
    case "days": {
      const start = addDays(startOfDay(now), -29);
      return {
        timeRange,
        title: "Last 30 days",
        start,
        buildBucketStart: (offset) => addDays(start, offset),
        buildBucketEnd: (bucketStart) => addDays(bucketStart, 1),
        bucketCount: 30,
        labelForBucket: (bucketStart) => fullDayFormatter.format(bucketStart),
        shortLabelForBucket: (bucketStart) => shortDayFormatter.format(bucketStart),
      };
    }
    case "weeks": {
      const start = addWeeks(startOfWeek(now), -11);
      return {
        timeRange,
        title: "Last 12 weeks",
        start,
        buildBucketStart: (offset) => addWeeks(start, offset),
        buildBucketEnd: (bucketStart) => addWeeks(bucketStart, 1),
        bucketCount: 12,
        labelForBucket: (bucketStart) => `Week of ${fullDayFormatter.format(bucketStart)}`,
        shortLabelForBucket: (bucketStart) => shortDayFormatter.format(bucketStart),
      };
    }
    case "months":
    default: {
      const start = addMonths(startOfMonth(now), -11);
      return {
        timeRange: "months",
        title: "Last 12 months",
        start,
        buildBucketStart: (offset) => addMonths(start, offset),
        buildBucketEnd: (bucketStart) => addMonths(bucketStart, 1),
        bucketCount: 12,
        labelForBucket: (bucketStart) => fullMonthFormatter.format(bucketStart),
        shortLabelForBucket: (bucketStart) => shortMonthFormatter.format(bucketStart),
      };
    }
  }
};

const normalizeTimestamp = (value: unknown) => {
  const normalizedValue = normalizeString(value);
  return normalizedValue.length > 0 ? normalizedValue : new Date(0).toISOString();
};

const parseEntryTimestamp = (entry: DevAiCostLogEntry) => {
  const parsedDate = new Date(entry.timestamp);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeUsageSource = (value: unknown): DevAiUsageSource => {
  switch (value) {
    case "estimated":
    case "mixed":
    case "actual":
      return value;
    case "none":
    default:
      return "none";
  }
};

const normalizeBaselineTimestamp = (value: unknown) => {
  const normalizedValue = normalizeOptionalString(value);
  if (!normalizedValue) {
    return null;
  }

  const parsedTimestamp = new Date(normalizedValue);
  return Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp.toISOString();
};

const normalizeDevAiCostLogEntry = (value: unknown, lineNumber: number): DevAiCostLogEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  const requestId = normalizeOptionalString(value.requestId) ?? normalizeOptionalString(value.id) ?? `log-${lineNumber}`;
  const estimatedInputTokens = Math.max(normalizeNumber(value.estimatedInputTokens), 0);
  const estimatedOutputTokens = Math.max(normalizeNumber(value.estimatedOutputTokens), 0);
  const estimatedTotalTokens = Math.max(
    normalizeNumber(value.estimatedTotalTokens, estimatedInputTokens + estimatedOutputTokens),
    0,
  );

  return {
    id: normalizeOptionalString(value.id) ?? requestId,
    requestId,
    timestamp: normalizeTimestamp(value.timestamp),
    workspaceType: normalizeOptionalString(value.workspaceType),
    taskType: normalizeOptionalString(value.taskType),
    reasoningLevel: normalizeOptionalString(value.reasoningLevel),
    modelNames: dedupeStrings(normalizeStringArray(value.modelNames)),
    initialModel: normalizeOptionalString(value.initialModel),
    selectedModel: normalizeOptionalString(value.selectedModel),
    fallbackModelUsed: normalizeBoolean(value.fallbackModelUsed),
    escalatedFromDefault: normalizeBoolean(value.escalatedFromDefault),
    escalatedTo: normalizeOptionalString(value.escalatedTo),
    escalationReason: normalizeOptionalString(value.escalationReason),
    complexityTier: normalizeOptionalString(value.complexityTier),
    prompt: normalizeString(value.prompt),
    searchUsed: typeof value.searchUsed === "boolean" ? value.searchUsed : null,
    success: normalizeBoolean(
      value.success,
      normalizeNullableNumber(value.statusCode) != null ? normalizeNumber(value.statusCode) < 400 : false,
    ),
    statusCode: normalizeNullableNumber(value.statusCode),
    failureMessage: normalizeOptionalString(value.failureMessage),
    durationMs: normalizeNullableNumber(value.durationMs),
    modelCallCount: Math.max(normalizeNumber(value.modelCallCount), 0),
    actualModelCallCount: Math.max(normalizeNumber(value.actualModelCallCount), 0),
    usageSource: normalizeUsageSource(value.usageSource),
    actualInputTokens: normalizeNullableNumber(value.actualInputTokens),
    actualOutputTokens: normalizeNullableNumber(value.actualOutputTokens),
    actualTotalTokens: normalizeNullableNumber(value.actualTotalTokens),
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedRequestCostUsd: Math.max(normalizeNumber(value.estimatedRequestCostUsd), 0),
  };
};

const matchesQuery = (entry: DevAiCostLogEntry, query: string) =>
  query.length === 0 || entry.prompt.toLowerCase().includes(query.toLowerCase());

const matchesValueFilter = (entryValue: string | null, filterValue: string) =>
  filterValue.length === 0 || entryValue === filterValue;

const getSummaryForEntries = (entries: DevAiCostLogEntry[], now = new Date()) => {
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  let costTodayUsd = 0;
  let costWeekUsd = 0;
  let costMonthUsd = 0;
  let tokensToday = 0;
  let tokensWeek = 0;
  let tokensMonth = 0;
  let requestsToday = 0;
  let requestsWeek = 0;
  let requestsMonth = 0;

  for (const entry of entries) {
    const timestamp = parseEntryTimestamp(entry);
    if (!timestamp) {
      continue;
    }

    if (timestamp >= todayStart) {
      costTodayUsd += entry.estimatedRequestCostUsd;
      tokensToday += entry.estimatedTotalTokens;
      requestsToday += 1;
    }
    if (timestamp >= weekStart) {
      costWeekUsd += entry.estimatedRequestCostUsd;
      tokensWeek += entry.estimatedTotalTokens;
      requestsWeek += 1;
    }
    if (timestamp >= monthStart) {
      costMonthUsd += entry.estimatedRequestCostUsd;
      tokensMonth += entry.estimatedTotalTokens;
      requestsMonth += 1;
    }
  }

  return {
    costTodayUsd,
    costWeekUsd,
    costMonthUsd,
    tokensToday,
    tokensWeek,
    tokensMonth,
    requestsToday,
    requestsWeek,
    requestsMonth,
  };
};

const getLifetimeTotalsForEntries = (entries: DevAiCostLogEntry[]) => ({
  totalCostUsd: entries.reduce((sum, entry) => sum + entry.estimatedRequestCostUsd, 0),
  totalTokens: entries.reduce((sum, entry) => sum + entry.estimatedTotalTokens, 0),
  totalRequests: entries.length,
});

const buildChartBuckets = (entries: DevAiCostLogEntry[], config: TimeRangeConfig, now = new Date()) => {
  const buckets: ChartBucket[] = Array.from({ length: config.bucketCount }, (_, index) => {
    const start = config.buildBucketStart(index);
    const end = config.buildBucketEnd(start);
    return {
      key: `${config.timeRange}-${start.toISOString()}`,
      label: config.labelForBucket(start),
      shortLabel: config.shortLabelForBucket(start),
      start,
      end,
      estimatedCostUsd: 0,
      requestCount: 0,
      estimatedTotalTokens: 0,
      isCurrent: now >= start && now < end,
    };
  });

  for (const entry of entries) {
    const timestamp = parseEntryTimestamp(entry);
    if (!timestamp || timestamp < config.start) {
      continue;
    }

    const matchingBucket = buckets.find((bucket) => timestamp >= bucket.start && timestamp < bucket.end);
    if (!matchingBucket) {
      continue;
    }

    matchingBucket.estimatedCostUsd += entry.estimatedRequestCostUsd;
    matchingBucket.requestCount += 1;
    matchingBucket.estimatedTotalTokens += entry.estimatedTotalTokens;
  }

  return buckets;
};

const getLatestEntries = (entries: DevAiCostLogEntry[]) =>
  [...entries]
    .sort((leftEntry, rightEntry) => {
      const leftTimestamp = parseEntryTimestamp(leftEntry)?.getTime() ?? 0;
      const rightTimestamp = parseEntryTimestamp(rightEntry)?.getTime() ?? 0;
      return rightTimestamp - leftTimestamp;
    })
    .slice(0, MAX_VISIBLE_RECENT_ENTRIES);

export const isDevAiTimeRange = (value: string | null | undefined): value is DevAiTimeRange =>
  typeof value === "string" && DEV_AI_TIME_RANGE_VALUES.includes(value as DevAiTimeRange);

export const isDevAiCostDashboardEnabledForRequestHost = (requestHost: string | null | undefined) => {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  const normalizedHost = normalizeHost(requestHost);
  return normalizedHost != null && LOCALHOST_HOSTS.has(normalizedHost);
};

export const startDevAiCostRequestScope = () => {
  requestScopeStorage.enterWith({
    modelCalls: [],
  });
};

export const recordDevAiModelCall = ({ model, prompt, instructions, outputText, usage }: DevAiModelCallInput) => {
  const scope = requestScopeStorage.getStore();
  if (!scope) {
    return;
  }

  const estimatedInputTokens = estimateTokenCountFromText(prompt ?? null, instructions ?? null);
  const estimatedOutputTokens = estimateTokenCountFromText(outputText ?? null);
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;

  const usageRecord = isRecord(usage) ? usage : null;
  const inputTokens = usageRecord ? normalizeNullableNumber(usageRecord.input_tokens) : null;
  const outputTokens = usageRecord ? normalizeNullableNumber(usageRecord.output_tokens) : null;
  const totalTokens =
    usageRecord && normalizeNullableNumber(usageRecord.total_tokens) != null
      ? normalizeNullableNumber(usageRecord.total_tokens)
      : inputTokens != null || outputTokens != null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null;

  const cachedTokens =
    usageRecord &&
    isRecord(usageRecord.input_tokens_details) &&
    normalizeNullableNumber(usageRecord.input_tokens_details.cached_tokens) != null
      ? normalizeNullableNumber(usageRecord.input_tokens_details.cached_tokens)
      : 0;

  const costInputTokens = inputTokens ?? estimatedInputTokens;
  const costOutputTokens = outputTokens ?? estimatedOutputTokens;
  const estimatedCostUsd = calculateEstimatedCostUsd({
    model,
    inputTokens: costInputTokens,
    cachedInputTokens: cachedTokens ?? 0,
    outputTokens: costOutputTokens,
  });

  scope.modelCalls.push({
    model,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedCostUsd,
    hasActualUsage: inputTokens != null || outputTokens != null || totalTokens != null,
    actualInputTokens: inputTokens,
    actualOutputTokens: outputTokens,
    actualTotalTokens: totalTokens,
  });
};

export const getCurrentDevAiRequestUsageSummary = (): DevAiRequestUsageSummary => {
  const scope = requestScopeStorage.getStore();
  const modelCalls = scope?.modelCalls ?? [];
  if (modelCalls.length === 0) {
    return {
      modelNames: [],
      modelCallCount: 0,
      actualModelCallCount: 0,
      usageSource: "none",
      actualInputTokens: null,
      actualOutputTokens: null,
      actualTotalTokens: null,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedRequestCostUsd: 0,
    };
  }

  let estimatedInputTokens = 0;
  let estimatedOutputTokens = 0;
  let estimatedTotalTokens = 0;
  let estimatedRequestCostUsd = 0;
  let actualModelCallCount = 0;
  let actualInputTokens = 0;
  let actualOutputTokens = 0;
  let actualTotalTokens = 0;
  let hasAnyActualInputTokens = false;
  let hasAnyActualOutputTokens = false;
  let hasAnyActualTotalTokens = false;

  for (const modelCall of modelCalls) {
    estimatedInputTokens += modelCall.estimatedInputTokens;
    estimatedOutputTokens += modelCall.estimatedOutputTokens;
    estimatedTotalTokens += modelCall.estimatedTotalTokens;
    estimatedRequestCostUsd += modelCall.estimatedCostUsd;

    if (modelCall.hasActualUsage) {
      actualModelCallCount += 1;
    }
    if (modelCall.actualInputTokens != null) {
      actualInputTokens += modelCall.actualInputTokens;
      hasAnyActualInputTokens = true;
    }
    if (modelCall.actualOutputTokens != null) {
      actualOutputTokens += modelCall.actualOutputTokens;
      hasAnyActualOutputTokens = true;
    }
    if (modelCall.actualTotalTokens != null) {
      actualTotalTokens += modelCall.actualTotalTokens;
      hasAnyActualTotalTokens = true;
    }
  }

  return {
    modelNames: dedupeStrings(modelCalls.map((modelCall) => modelCall.model)),
    modelCallCount: modelCalls.length,
    actualModelCallCount,
    usageSource:
      actualModelCallCount === 0 ? "estimated" : actualModelCallCount === modelCalls.length ? "actual" : "mixed",
    actualInputTokens: hasAnyActualInputTokens ? actualInputTokens : null,
    actualOutputTokens: hasAnyActualOutputTokens ? actualOutputTokens : null,
    actualTotalTokens: hasAnyActualTotalTokens ? actualTotalTokens : null,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedRequestCostUsd,
  };
};

export const appendDevAiCostLogEntry = async (entry: DevAiCostLogEntry) => {
  await mkdir(DEV_AI_COST_LOG_DIRECTORY_PATH, { recursive: true });
  await appendFile(DEV_AI_COST_LOG_FILE_PATH, `${JSON.stringify(entry)}\n`, "utf8");
};

const readDevAiCostLogEntries = async () => {
  try {
    const rawContents = await readFile(DEV_AI_COST_LOG_FILE_PATH, "utf8");
    return rawContents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, index) => {
        try {
          return normalizeDevAiCostLogEntry(JSON.parse(line), index + 1);
        } catch {
          return null;
        }
      })
      .filter((entry): entry is DevAiCostLogEntry => entry != null)
      .sort((leftEntry, rightEntry) => {
        const leftTimestamp = parseEntryTimestamp(leftEntry)?.getTime() ?? 0;
        const rightTimestamp = parseEntryTimestamp(rightEntry)?.getTime() ?? 0;
        return rightTimestamp - leftTimestamp;
      });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

const readDevAiDashboardBaseline = async () => {
  try {
    const rawContents = await readFile(DEV_AI_COST_BASELINE_FILE_PATH, "utf8");
    const parsedValue = JSON.parse(rawContents);
    if (!isRecord(parsedValue)) {
      return null;
    }

    return normalizeBaselineTimestamp(parsedValue.startedAt);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

export const setDevAiDashboardBaseline = async (startedAt = new Date()) => {
  await mkdir(DEV_AI_COST_LOG_DIRECTORY_PATH, { recursive: true });
  await writeFile(
    DEV_AI_COST_BASELINE_FILE_PATH,
    `${JSON.stringify({ startedAt: startedAt.toISOString() }, null, 2)}\n`,
    "utf8",
  );
};

export const getDevAiDashboardData = async (filters: DevAiDashboardFilters = {}): Promise<DevAiDashboardData> => {
  const allEntries = await readDevAiCostLogEntries();
  const baselineStartedAt = await readDevAiDashboardBaseline();
  const baselineStart = baselineStartedAt ? new Date(baselineStartedAt) : null;
  const now = new Date();
  const normalizedTimeRange = filters.timeRange && isDevAiTimeRange(filters.timeRange) ? filters.timeRange : DEFAULT_DEV_AI_TIME_RANGE;
  const normalizedQuery = normalizeString(filters.query);
  const normalizedWorkspaceType = normalizeString(filters.workspaceType);
  const normalizedTaskType = normalizeString(filters.taskType);
  const normalizedSelectedBucketKey = normalizeString(filters.selectedBucketKey);
  const shouldIgnoreBaseline = filters.ignoreBaseline === true;
  const timeRangeConfig = getTimeRangeConfig(normalizedTimeRange, now);
  const baselineEntries =
    shouldIgnoreBaseline || baselineStart == null
      ? allEntries
      : allEntries.filter((entry) => {
          const timestamp = parseEntryTimestamp(entry);
          return timestamp != null && timestamp >= baselineStart;
        });

  const filteredEntries = baselineEntries.filter((entry) => {
    if (!matchesQuery(entry, normalizedQuery)) {
      return false;
    }
    if (!matchesValueFilter(entry.workspaceType, normalizedWorkspaceType)) {
      return false;
    }
    if (!matchesValueFilter(entry.taskType, normalizedTaskType)) {
      return false;
    }

    const timestamp = parseEntryTimestamp(entry);
    return timestamp != null && timestamp >= timeRangeConfig.start;
  });

  const chartBuckets = buildChartBuckets(filteredEntries, timeRangeConfig, now);
  const activeChartBuckets = chartBuckets.filter((bucket) => bucket.estimatedCostUsd > 0 || bucket.requestCount > 0);
  const explicitlySelectedBucket =
    normalizedSelectedBucketKey.length > 0
      ? chartBuckets.find((bucket) => bucket.key === normalizedSelectedBucketKey) ?? null
      : null;
  const defaultSelectedBucket =
    activeChartBuckets.find((bucket) => bucket.isCurrent && bucket.requestCount > 0) ??
    activeChartBuckets[activeChartBuckets.length - 1] ??
    null;
  const resolvedSelectedBucket = explicitlySelectedBucket ?? defaultSelectedBucket;
  const largestRequest =
    filteredEntries.some((entry) => entry.estimatedRequestCostUsd > 0)
      ? [...filteredEntries]
          .filter((entry) => entry.estimatedRequestCostUsd > 0)
          .sort((leftEntry, rightEntry) => rightEntry.estimatedRequestCostUsd - leftEntry.estimatedRequestCostUsd)[0] ?? null
      : null;
  const selectedBucketEntries =
    resolvedSelectedBucket == null
      ? []
      : getLatestEntries(
          filteredEntries.filter((entry) => {
            const timestamp = parseEntryTimestamp(entry);
            return timestamp != null && timestamp >= resolvedSelectedBucket.start && timestamp < resolvedSelectedBucket.end;
          }),
        );

  return {
    logFilePath: DEV_AI_COST_LOG_FILE_PATH,
    availableWorkspaceTypes: dedupeStrings(
      allEntries
        .map((entry) => entry.workspaceType)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ).sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    availableTaskTypes: dedupeStrings(
      allEntries.map((entry) => entry.taskType).filter((value): value is string => typeof value === "string" && value.length > 0),
    ).sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    appliedFilters: {
      query: normalizedQuery,
      timeRange: normalizedTimeRange,
      workspaceType: normalizedWorkspaceType,
      taskType: normalizedTaskType,
    },
    summary: getSummaryForEntries(baselineEntries, now),
    lifetime: getLifetimeTotalsForEntries(allEntries),
    baseline: {
      startedAt: shouldIgnoreBaseline ? null : baselineStartedAt,
    },
    chart: {
      timeRange: normalizedTimeRange,
      title: timeRangeConfig.title,
      totalCostUsd: filteredEntries.reduce((sum, entry) => sum + entry.estimatedRequestCostUsd, 0),
      totalRequests: filteredEntries.length,
      activeBucketCount: activeChartBuckets.length,
      maxBucketCostUsd: chartBuckets.reduce(
        (highestValue, bucket) => Math.max(highestValue, bucket.estimatedCostUsd),
        0,
      ),
      largestRequest,
      buckets: chartBuckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        shortLabel: bucket.shortLabel,
        estimatedCostUsd: bucket.estimatedCostUsd,
        requestCount: bucket.requestCount,
        estimatedTotalTokens: bucket.estimatedTotalTokens,
        isCurrent: bucket.isCurrent,
      })),
      selectedBucket:
        resolvedSelectedBucket == null
          ? null
          : {
              key: resolvedSelectedBucket.key,
              label: resolvedSelectedBucket.label,
              shortLabel: resolvedSelectedBucket.shortLabel,
              estimatedCostUsd: resolvedSelectedBucket.estimatedCostUsd,
              requestCount: resolvedSelectedBucket.requestCount,
              estimatedTotalTokens: resolvedSelectedBucket.estimatedTotalTokens,
              isCurrent: resolvedSelectedBucket.isCurrent,
              selectionMode: explicitlySelectedBucket ? "explicit" : "default",
              entries: selectedBucketEntries,
            },
    },
    filteredEntryCount: filteredEntries.length,
    entries: getLatestEntries(filteredEntries),
    historyEntries: [...baselineEntries],
  };
};
