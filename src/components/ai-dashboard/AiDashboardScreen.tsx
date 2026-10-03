"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiUsageChart } from "./AiUsageChart";
import { buildBuckets, currentWeekTotals, intervalSpec, nextUtcWeek, summarizeReceipts, windowStart } from "../../lib/ai-dashboard/dashboardAggregation";
import { TEST_WEEKLY_TOKENS, type DashboardFilter, type DashboardInterval, type DashboardSnapshot } from "../../lib/ai-dashboard/dashboardContract";
import { subscribeDashboardChanges } from "../../lib/ai-dashboard/dashboardSources";
import { useAccountSession } from "../account/AccountSessionProvider";
import styles from "./AiDashboard.module.css";

const filters: { value: DashboardFilter; label: string }[] = [
  { value: "combined", label: "All" }, { value: "project", label: "AI Animator" }, { value: "assistant", label: "Assistant" },
];
const intervals: { value: DashboardInterval; label: string }[] = [
  { value: "minute", label: "1 min" }, { value: "quarter", label: "15 min" }, { value: "hour", label: "Hour" },
  { value: "day", label: "Day" }, { value: "week", label: "Week" },
];
const number = (value: number) => value.toLocaleString("en-US");
const utc = (value: number) => new Date(value).toISOString().replace(".000Z", "Z");
const resetDay = (value: number) => new Date(value).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const plural = (count: number, one: string, many: string) => `${number(count)} ${count === 1 ? one : many}`;

export function AiDashboardScreen() {
  const account = useAccountSession();
  const ownerId = account?.id ?? null;
  const [real, setReal] = useState<{ ownerId: string; snapshot: DashboardSnapshot } | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>("combined");
  const [interval, setInterval] = useState<DashboardInterval>("quarter");
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = ++generation.current;
    setReading(true);
    void fetch("/api/account/usage", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("account_usage_unavailable");
      const value = await response.json() as { schema?: string; ownerId?: string; snapshot?: DashboardSnapshot };
      if (value.schema !== "diamond-account-usage/v1" || value.ownerId !== ownerId || !value.snapshot)
        throw new Error("account_usage_owner_mismatch");
      return value.snapshot;
    }).then((snapshot) => {
      if (current !== generation.current || controller.signal.aborted) return;
      setReal({ ownerId: ownerId!, snapshot }); setReadError(false); setReading(false);
    }).catch(() => {
      if (current !== generation.current || controller.signal.aborted) return;
      setReadError(true); setReading(false);
    });
  }, [ownerId]);
  useEffect(() => {
    const initialRead = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeDashboardChanges(refresh);
    const generationRef = generation;
    const abortControllerRef = abortRef;
    return () => { window.clearTimeout(initialRead); generationRef.current++; abortControllerRef.current?.abort(); unsubscribe(); };
  }, [refresh]);

  const snapshot = real?.ownerId === ownerId ? real.snapshot : null;
  const now = snapshot?.readAt ?? 0;
  const complete = !!snapshot && !readError && [snapshot.project.state, snapshot.assistant.state].every((state) => state === "ready" || state === "absent");
  const selectedSources = snapshot ? filter === "combined" ? [snapshot.project, snapshot.assistant] : [snapshot[filter]] : [];
  const allReceipts = useMemo(() => snapshot ? [...snapshot.project.receipts, ...snapshot.assistant.receipts] : [], [snapshot]);
  const selectedReceipts = selectedSources.flatMap((source) => source.receipts);
  const buckets = useMemo(() => buildBuckets(allReceipts, interval, filter, now), [allReceipts, interval, filter, now]);
  const current = useMemo(() => currentWeekTotals(allReceipts, now), [allReceipts, now]);
  const combinedPercent = current.combinedTokens / TEST_WEEKLY_TOKENS * 100;
  const summary = summarizeReceipts(selectedReceipts, windowStart(interval, now), now);
  const issues = snapshot ? [...snapshot.project.issues, ...snapshot.assistant.issues] : [];
  const partial = !!snapshot && !complete;
  const attempts = selectedSources.reduce((result, source) => ({
    failed: result.failed + source.failed, cancelled: result.cancelled + source.cancelled,
    pending: result.pending + source.pending, prior: result.prior + source.priorAttempts,
  }), { failed: 0, cancelled: 0, pending: 0, prior: 0 });
  const costSources = [...new Set(selectedReceipts.map((receipt) => receipt.priceDate ?? (receipt.source === "project" ? "AI Animator: older estimate, price date not saved" : null)).filter(Boolean))];
  const status = combinedPercent >= 100 ? "exhausted" : combinedPercent >= 90 ? "warning" : "normal";

  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="dashboard-heading">
          <div className={styles.heroTop}><div><p className={styles.eyebrow}>Your AI usage</p><h2 id="dashboard-heading">AI Dashboard</h2>
            <p className={styles.lead}>How much AI you&apos;ve used this week.</p></div></div>
          <div className={styles.testNotice}><strong>Weekly preview limit: {number(TEST_WEEKLY_TOKENS)} tokens</strong>
            <span>Just a preview. Nothing is charged and the AI keeps working.</span>
            <span className={styles.explainer}>Tokens are small pieces of text the AI reads and writes. More chatting uses more tokens.</span></div>
        </section>

        <section className={styles.previewCard} aria-labelledby="weekly-heading">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow}>Weekly preview</p><h3 id="weekly-heading">This week</h3></div>
            {snapshot && <span className={styles.period}>Resets <time dateTime={utc(nextUtcWeek(now))} title={utc(nextUtcWeek(now))}>{resetDay(nextUtcWeek(now))}</time> <small>(UTC)</small></span>}</div>
          {!snapshot ? <p role="status" className={styles.loading}>Loading your usage…</p> : partial ?
            <div role="status" className={styles.partial}><strong>Some usage couldn&apos;t be read, so the exact total isn&apos;t known.</strong><span>Everything we could read is shown below.</span></div> :
            <div className={styles.progressGrid}><div><strong>{number(current.combinedTokens)}</strong><span>tokens used</span></div>
              <div><strong>{combinedPercent.toFixed(1)}%</strong><span>of the weekly preview limit</span></div>
              <div><strong>{number(Math.max(0, TEST_WEEKLY_TOKENS - current.combinedTokens))}</strong><span>tokens left in the preview (not a real balance)</span></div></div>}
          {complete && status === "warning" && <p className={styles.warning} role="status">Almost there: 10% or less of the preview limit is left. The AI keeps working.</p>}
          {complete && status === "exhausted" && <p className={styles.exhausted} role="status">You&apos;ve reached the preview limit. It&apos;s only a preview, so the AI keeps working.</p>}
          <p className={styles.scope}>Counts the AI Animator chat, the Assistant and voice typing for this account on this computer.</p>
        </section>

        <section className={styles.chartCard} aria-labelledby="usage-heading">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow}>Running total</p><h3 id="usage-heading">Usage over time</h3></div>
            <button className={styles.refresh} type="button" onClick={refresh} disabled={reading}>{reading ? "Loading…" : "Refresh"}</button></div>
          <div className={styles.controls}><fieldset><legend>Show</legend><div className={styles.segmented}>{filters.map((option) =>
            <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div></fieldset>
            <fieldset><legend>Group by</legend><div className={styles.segmented}>{intervals.map((option) =>
              <button type="button" key={option.value} aria-pressed={interval === option.value} onClick={() => setInterval(option.value)}>{option.label}</button>)}</div></fieldset></div>
          {readError && <p className={styles.partial} role="alert">Couldn&apos;t update your usage. The numbers may be out of date, and missing data isn&apos;t zero. Try Refresh.</p>}
          {issues.length > 0 && <div className={styles.partial} role="status"><strong>Some usage couldn&apos;t be read.</strong><ul>{[...new Set(issues)].map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          {snapshot && buckets.length === 0 && !partial && <p className={styles.empty}>No AI usage to show here yet.</p>}
          {snapshot && <AiUsageChart key={`${filter}-${interval}`} buckets={buckets} filter={filter} complete={complete} capacity={intervalSpec[interval].count} />}
          <p className={styles.chartNote}>Each bar adds up your tokens so far this week. Colors change as you get closer to the limit.</p>
        </section>

        <section className={styles.summaryGrid} aria-label="Usage details">
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Tokens used</p><strong>{snapshot ? number(summary.total) : "—"}</strong><span>{filters.find((option) => option.value === filter)?.label} · in this view</span>{summary.unknownTotals > 0 && <small>{plural(summary.unknownTotals, "more request has", "more requests have")} unknown usage.</small>}</div>
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Sent to AI / Written by AI</p><strong>{snapshot ? `${number(summary.input)} / ${number(summary.output)}` : "—"}</strong><span>Tokens in this view</span>{(summary.unknownInput + summary.unknownOutput > 0) && <small>Some parts are unknown.</small>}</div>
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Estimated AI cost</p><strong>{snapshot && (summary.receipts === 0 || summary.unknownCost < summary.receipts) ? `$${summary.cost.toFixed(4)}` : "Not available"}</strong><span>Our estimate, not a bill.</span><small>{summary.unknownCost > 0 ? `${plural(summary.unknownCost, "estimate", "estimates")} unknown. ` : ""}{costSources.length > 0 ? `Prices: ${costSources.join(" · ")}` : ""}</small></div>
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Web searches</p><strong>{snapshot ? plural(summary.toolCalls, "search", "searches") : "—"}</strong><span>Web searches the AI made in this view</span><small>Voice typing has no bars, but its cost is in the estimate. Other requests: {attempts.failed} failed, {attempts.cancelled} cancelled, {attempts.pending} still running, {attempts.prior} earlier tries.</small></div>
        </section>

        <section className={styles.realPlan} aria-labelledby="real-plan-heading"><p className={styles.eyebrow}>Your plan</p><h3 id="real-plan-heading">No paid plan yet</h3>
          <div className={styles.realPlanGrid}><div><span>Real limit and what&apos;s left</span><strong>Not set up</strong></div><div><span>Refills and renewal</span><strong>Not set up</strong></div><div><span>Animation jobs</span><strong>Not available yet</strong></div></div>
          <p>The weekly preview limit above doesn&apos;t buy credits, charge you or stop the AI. No real plan or balance is connected yet.</p>
          <div className={styles.disabledActions}><button type="button" disabled>Change plan (not available)</button><button type="button" disabled>Top up (not available)</button></div>
        </section>
      </div>
    </main>
  );
}
