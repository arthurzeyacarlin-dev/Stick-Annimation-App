import {
  TEST_WEEKLY_TOKENS,
  type DashboardBucket, type DashboardFilter, type DashboardInterval,
  type DashboardReceipt,
} from "./dashboardContract.ts";

const minute = 60_000;
const day = 86_400_000;
export const intervalSpec: Record<DashboardInterval, { duration: number; count: number }> = {
  minute: { duration: minute, count: 24 },
  quarter: { duration: 15 * minute, count: 24 },
  hour: { duration: 60 * minute, count: 24 },
  day: { duration: day, count: 14 },
  week: { duration: 7 * day, count: 8 },
};

export const utcWeekStart = (time: number) => {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
};

export const nextUtcWeek = (time: number) => utcWeekStart(time) + 7 * day;

const colorStops = [
  { percent: 0, rgb: [37, 99, 235] },
  { percent: 10, rgb: [59, 130, 246] },
  { percent: 20, rgb: [14, 165, 233] },
  { percent: 30, rgb: [34, 197, 94] },
  { percent: 40, rgb: [163, 217, 61] },
  { percent: 50, rgb: [234, 179, 8] },
  { percent: 75, rgb: [249, 115, 22] },
  { percent: 100, rgb: [255, 0, 0] },
];

export function colorForPercent(value: number): string {
  const percent = Math.max(0, Math.min(100, value));
  const upperIndex = colorStops.findIndex((stop) => stop.percent >= percent);
  if (upperIndex <= 0) return "#2563eb";
  const lower = colorStops[upperIndex - 1];
  const upper = colorStops[upperIndex];
  const blend = (percent - lower.percent) / (upper.percent - lower.percent);
  const rgb = lower.rgb.map((component, index) => Math.round(component + (upper.rgb[index] - component) * blend));
  return `#${rgb.map((component) => component.toString(16).padStart(2, "0")).join("")}`;
}

export const validReceipt = (receipt: DashboardReceipt, now: number) =>
  Number.isSafeInteger(receipt.at) && receipt.at > 0 && receipt.at <= now &&
  Number.isSafeInteger(receipt.totalTokens) && (receipt.totalTokens as number) >= 0;

export function windowStart(interval: DashboardInterval, now: number): number {
  const { duration, count } = intervalSpec[interval];
  const currentStart = interval === "week" ? utcWeekStart(now) : Math.floor(now / duration) * duration;
  return currentStart - (count - 1) * duration;
}

export function currentWeekTotals(receipts: DashboardReceipt[], now: number) {
  const start = utcWeekStart(now);
  const projectTokens = receipts.filter((receipt) => validReceipt(receipt, now) && receipt.at >= start && receipt.source === "project")
    .reduce((total, receipt) => total + (receipt.totalTokens as number), 0);
  const assistantTokens = receipts.filter((receipt) => validReceipt(receipt, now) && receipt.at >= start && receipt.source === "assistant")
    .reduce((total, receipt) => total + (receipt.totalTokens as number), 0);
  return { projectTokens, assistantTokens, combinedTokens: projectTokens + assistantTokens };
}

export function buildBuckets(receipts: DashboardReceipt[], interval: DashboardInterval, filter: DashboardFilter, now: number): DashboardBucket[] {
  if (now <= 0) return [];
  const { duration } = intervalSpec[interval];
  const firstStart = windowStart(interval, now);
  const currentStart = interval === "week" ? utcWeekStart(now) : Math.floor(now / duration) * duration;
  const safe = receipts.filter((receipt) => validReceipt(receipt, now));
  const activeStarts = [...new Set(safe.filter((receipt) => (receipt.totalTokens as number) > 0 &&
      (filter === "combined" || receipt.source === filter))
    .map((receipt) => interval === "week" ? utcWeekStart(receipt.at) : Math.floor(receipt.at / duration) * duration)
    .filter((start) => start >= firstStart && start <= currentStart))].sort((a, b) => a - b);
  return activeStarts.map((start, index) => {
    const end = start + duration;
    const isCurrent = start === currentStart;
    const sampleAt = isCurrent ? now : end;
    const weekStart = utcWeekStart(isCurrent ? now : end - 1);
    const sampleExclusive = isCurrent ? now + 1 : end;
    let projectTokens = 0;
    let assistantTokens = 0;
    let intervalSelectedTokens = 0;
    for (const receipt of safe) {
      if (receipt.at >= start && receipt.at < sampleExclusive && (filter === "combined" || receipt.source === filter))
        intervalSelectedTokens += receipt.totalTokens as number;
      if (receipt.at >= weekStart && receipt.at < sampleExclusive) {
        if (receipt.source === "project") projectTokens += receipt.totalTokens as number;
        else assistantTokens += receipt.totalTokens as number;
      }
    }
    const combinedTokens = projectTokens + assistantTokens;
    const selectedTokens = filter === "project" ? projectTokens : filter === "assistant" ? assistantTokens : combinedTokens;
    const selectedPercent = selectedTokens / TEST_WEEKLY_TOKENS * 100;
    const previous = index > 0 ? activeStarts[index - 1] : null;
    const firstInWeek = previous === null || utcWeekStart(previous) !== utcWeekStart(start);
    const previousSelectedTokens = firstInWeek ? null : filter === "project" ?
      safe.filter((receipt) => receipt.source === "project" && receipt.at >= weekStart && receipt.at < previous! + duration)
        .reduce((total, receipt) => total + (receipt.totalTokens as number), 0) :
      filter === "assistant" ? safe.filter((receipt) => receipt.source === "assistant" && receipt.at >= weekStart && receipt.at < previous! + duration)
        .reduce((total, receipt) => total + (receipt.totalTokens as number), 0) :
        safe.filter((receipt) => receipt.at >= weekStart && receipt.at < previous! + duration)
          .reduce((total, receipt) => total + (receipt.totalTokens as number), 0);
    return {
      start, end, sampleAt, projectTokens, assistantTokens, combinedTokens, selectedTokens,
      intervalSelectedTokens, sincePreviousSelectedTokens: previousSelectedTokens === null ? null : selectedTokens - previousSelectedTokens,
      firstInWeek,
      selectedPercent, combinedPercent: combinedTokens / TEST_WEEKLY_TOKENS * 100,
      color: colorForPercent(selectedPercent), resetAfter: index < activeStarts.length - 1 && utcWeekStart(activeStarts[index + 1]) !== utcWeekStart(start), isCurrent,
    };
  });
}

export function summarizeReceipts(receipts: DashboardReceipt[], start: number, end: number) {
  const visible = receipts.filter((receipt) => receipt.at >= start && receipt.at <= end);
  return visible.reduce((summary, receipt) => {
    if (receipt.totalTokens !== null) summary.total += receipt.totalTokens;
    else summary.unknownTotals++;
    if (receipt.inputTokens !== null) summary.input += receipt.inputTokens;
    else summary.unknownInput++;
    if (receipt.outputTokens !== null) summary.output += receipt.outputTokens;
    else summary.unknownOutput++;
    if (receipt.estimatedCostUsd !== null) summary.cost += receipt.estimatedCostUsd;
    else summary.unknownCost++;
    summary.toolCalls += receipt.toolCalls;
    summary.receipts++;
    return summary;
  }, { total: 0, input: 0, output: 0, cost: 0, toolCalls: 0, receipts: 0, unknownTotals: 0, unknownInput: 0, unknownOutput: 0, unknownCost: 0 });
}
