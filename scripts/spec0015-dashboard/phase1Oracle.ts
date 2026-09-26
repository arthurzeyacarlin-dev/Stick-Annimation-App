import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { buildBuckets, colorForPercent, currentWeekTotals, nextUtcWeek, utcWeekStart, windowStart } from "../../src/lib/ai-dashboard/dashboardAggregation.ts";
import { TEST_WEEKLY_TOKENS, type DashboardReceipt, type DashboardSource, type DashboardInterval, type DashboardFilter } from "../../src/lib/ai-dashboard/dashboardContract.ts";

type Fixture = {
  schema: string; frozenNow: string; sharedTestCap: number;
  receipts: { source: DashboardSource; at: string; tokens: number }[];
  quarterExpectations: { start: string; combined: number; project: number; assistant: number }[];
};
const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0015-dashboard/phase1.json", "utf8")) as Fixture;
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };
const now = Date.parse(fixture.frozenNow);
check(fixture.schema === "spec0015-dashboard-phase1/v2", "fixture schema");
check(fixture.sharedTestCap === TEST_WEEKLY_TOKENS && now === Date.parse("2026-09-21T00:30:00Z"), "fixture cap and clock");
check(fixture.receipts.length === 17, "independent internal fixture receipts");
const rows: DashboardReceipt[] = fixture.receipts.map((receipt, index) => ({
  id: `fixture-${index}`, source: receipt.source, at: Date.parse(receipt.at), totalTokens: receipt.tokens,
  inputTokens: receipt.tokens, outputTokens: 0, estimatedCostUsd: null, priceDate: null,
  model: null, reasoning: null, toolCalls: 0,
}));
const combined = buildBuckets(rows, "quarter", "combined", now);
const project = buildBuckets(rows, "quarter", "project", now);
const assistant = buildBuckets(rows, "quarter", "assistant", now);
check(combined.length === 16 && project.length === 5 && assistant.length === 12, "only active selected-source quarter-hour intervals plot");
check(JSON.stringify(combined.map((bar) => bar.start)) === JSON.stringify(fixture.quarterExpectations.map((row) => Date.parse(row.start))),
  "actual active intervals alone form chronological series");
for (const expected of fixture.quarterExpectations) {
  const start = Date.parse(expected.start);
  const bar = combined.find((item) => item.start === start)!;
  check(bar.combinedTokens === expected.combined, `Combined cumulative ${expected.start}`);
  check(bar.projectTokens === expected.project && bar.assistantTokens === expected.assistant, `source cumulative ${expected.start}`);
  const spent = start === Date.parse("2026-09-21T00:00:00Z") ? 100 :
    start < Date.parse("2026-09-20T20:15:00Z") ? 1000 : 500;
  check(bar.intervalSelectedTokens === spent, `interval spend ${expected.start}`);
  check(bar.selectedTokens === bar.combinedTokens, `selected cumulative ${expected.start}`);
}
check(combined.at(-1)!.intervalSelectedTokens === 100 && combined.at(-1)!.selectedTokens === 100,
  "Project and Assistant receipts in one interval aggregate into one bar");
check(combined.at(-1)!.sincePreviousSelectedTokens === null && combined.at(-1)!.firstInWeek,
  "first post-reset bar omits previous-week comparison");
check(combined[0].sincePreviousSelectedTokens === null && combined[1].sincePreviousSelectedTokens === 1000,
  "first plotted bar has no comparison, next active bar compares in-week consumption");
check(combined.at(-2)!.resetAfter && combined.at(-2)!.selectedTokens === 10000 && combined.at(-2)!.color === "#ff0000",
  "historical exhaustion and reset boundary");
check(combined.at(-1)!.color.startsWith("#2") && combined.at(-1)!.selectedPercent === 1,
  "first post-reset bar small blue");
check(currentWeekTotals(rows, now).combinedTokens === 100 && currentWeekTotals(rows, now).projectTokens === 80,
  "pinned Combined total independent of filtered bars");
check(colorForPercent(10) === "#3b82f6" && colorForPercent(20) === "#0ea5e9" && colorForPercent(30) === "#22c55e" &&
  colorForPercent(40) === "#a3d93d" && colorForPercent(50) === "#eab308" && colorForPercent(75) === "#f97316" &&
  colorForPercent(100) === "#ff0000", "approved blue-to-red progression");
check(utcWeekStart(now) === Date.parse("2026-09-21T00:00:00Z") && nextUtcWeek(now) === Date.parse("2026-09-28T00:00:00Z"),
  "Monday UTC reset bounds");
const expectedCounts: Record<DashboardInterval, number> = { minute: 1, quarter: 16, hour: 7, day: 2, week: 2 };
for (const [interval, count] of Object.entries(expectedCounts) as [DashboardInterval, number][]) {
  const bars = buildBuckets(rows, interval, "combined", now);
  check(bars.length === count, `${interval} active count`);
  check(bars.every((bar, index) => index === 0 || bar.start > bars[index - 1].start), `${interval} chronological`);
  check(bars.every((bar) => bar.intervalSelectedTokens > 0), `${interval} no idle duplicate tail`);
  check(bars.at(-1)!.selectedTokens === 100, `${interval} final cumulative includes earlier same-week receipts`);
  check(bars[0].start >= windowStart(interval, now), `${interval} time horizon`);
}
for (const filter of ["combined", "project", "assistant"] as DashboardFilter[]) {
  check(buildBuckets([], "quarter", filter, now).length === 0, `${filter} empty has no bars`);
}
check(buildBuckets(rows, "minute", "project", now).length === 0, "unrelated source cannot create bar");
const zeroOnly = { ...rows[0], id: "zero-only", at: Date.parse("2026-09-21T00:20:00Z"), totalTokens: 0 };
check(JSON.stringify(buildBuckets([...rows, zeroOnly], "quarter", "combined", now).map((bar) => bar.start)) ===
  JSON.stringify(combined.map((bar) => bar.start)), "zero-token-only interval cannot add an idle-height bar");
const unrelated = { ...rows[0], id: "unrelated", source: "assistant" as const,
  at: Date.parse("2026-09-20T19:00:00Z"), totalTokens: 7 };
check(JSON.stringify(buildBuckets([...rows, unrelated], "quarter", "project", now).map((bar) => bar.start)) ===
  JSON.stringify(project.map((bar) => bar.start)), "unrelated Assistant chat cannot add a Project activity bar");
const sameInterval = { ...rows[0], id: "same-interval", at: Date.parse("2026-09-20T18:55:00Z"), totalTokens: 13 };
const aggregated = buildBuckets([...rows, sameInterval], "quarter", "project", now);
check(aggregated.length === project.length && aggregated[0].intervalSelectedTokens === 1013,
  "multiple selected-source receipts in one interval remain one bar");
check(project.at(-1)!.selectedTokens === 80 && assistant.at(-1)!.selectedTokens === 20,
  "source contributions use shared denominator");
const advance = buildBuckets(rows, "quarter", "combined", now + 60_000);
check(JSON.stringify(advance.map((bar) => bar.start)) === JSON.stringify(combined.map((bar) => bar.start)),
  "idle clock advance creates no bar");
const later = buildBuckets(rows, "quarter", "combined", now + 16 * 60_000);
check(later.length === 15 && later.at(-1)!.start === combined.at(-1)!.start,
  "crossing idle interval creates no new tail");
const future = buildBuckets([...rows, { ...rows[0], id: "future", at: now + 60_000, totalTokens: 9000 }], "quarter", "combined", now);
check(future.at(-1)!.combinedTokens === 100, "future receipt cannot inflate preview");
const boundary = buildBuckets([...rows, { ...rows[0], id: "boundary", at: Date.parse("2026-09-21T00:00:00Z"), totalTokens: 5 }], "quarter", "combined", now);
check(boundary.at(-2)!.selectedTokens === 10000 && boundary.at(-1)!.selectedTokens === 105,
  "Monday boundary belongs to new week");
const over = buildBuckets([...rows, { ...rows[0], id: "over", at: Date.parse("2026-09-20T23:50:00Z"), totalTokens: 2000 }], "quarter", "combined", now);
check(over.at(-2)!.selectedPercent === 120 && over.at(-2)!.color === "#ff0000", "over-cap numeric truth");
mkdirSync("output/spec0015/phase1", { recursive: true });
writeFileSync("output/spec0015/phase1/oracle.json", JSON.stringify({ pass: true, checks, fixtureReceipts: rows.length, frozenNow: fixture.frozenNow }, null, 2));
console.log(`SPEC-0015 Phase 1 oracle PASS (${checks} checks)`);
