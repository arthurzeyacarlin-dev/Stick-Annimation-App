"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiUsageChart } from "./AiUsageChart";
import { buildBuckets, currentWeekTotals, intervalSpec, nextUtcWeek, summarizeReceipts, windowStart } from "../../lib/ai-dashboard/dashboardAggregation";
import { TEST_WEEKLY_TOKENS, type DashboardFilter, type DashboardInterval, type DashboardSnapshot } from "../../lib/ai-dashboard/dashboardContract";
import { readDashboardSnapshot, subscribeDashboardChanges } from "../../lib/ai-dashboard/dashboardSources";
import styles from "./AiDashboard.module.css";

const filters: { value: DashboardFilter; label: string }[] = [
  { value: "combined", label: "Combined" }, { value: "project", label: "Project AI" }, { value: "assistant", label: "Assistant" },
];
const intervals: { value: DashboardInterval; label: string }[] = [
  { value: "minute", label: "1 min" }, { value: "quarter", label: "15 min" }, { value: "hour", label: "Hour" },
  { value: "day", label: "Day" }, { value: "week", label: "Week" },
];
const number = (value: number) => value.toLocaleString("en-US");
const utc = (value: number) => new Date(value).toISOString().replace(".000Z", "Z");

export function AiDashboardScreen() {
  const [real, setReal] = useState<DashboardSnapshot | null>(null);
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
    void readDashboardSnapshot(controller.signal).then((snapshot) => {
      if (current !== generation.current || controller.signal.aborted) return;
      setReal(snapshot); setReadError(false); setReading(false);
    }).catch(() => {
      if (current !== generation.current || controller.signal.aborted) return;
      setReadError(true); setReading(false);
    });
  }, []);
  useEffect(() => {
    const initialRead = window.setTimeout(refresh, 0);
    const unsubscribe = subscribeDashboardChanges(refresh);
    const generationRef = generation;
    const abortControllerRef = abortRef;
    return () => { window.clearTimeout(initialRead); generationRef.current++; abortControllerRef.current?.abort(); unsubscribe(); };
  }, [refresh]);

  const snapshot = real;
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
  const costSources = [...new Set(selectedReceipts.map((receipt) => receipt.priceDate ?? (receipt.source === "project" ? "Project AI legacy estimate; price date not recorded" : null)).filter(Boolean))];
  const status = combinedPercent >= 100 ? "exhausted" : combinedPercent >= 90 ? "warning" : "normal";

  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <section className={styles.hero} aria-labelledby="dashboard-heading">
          <div className={styles.heroTop}><div><p className={styles.eyebrow}>Conversation usage · this browser</p><h2 id="dashboard-heading">AI Dashboard</h2>
            <p className={styles.lead}>Temporary test line based on retained conversation receipts in this browser.</p></div></div>
          <div className={styles.testNotice}><strong>10,000 recorded conversation tokens per UTC week — TEST PREVIEW</strong>
            <span>Display only. This is not a paid plan, account balance, provider bill, or AI request limit.</span></div>
        </section>

        <section className={styles.previewCard} aria-labelledby="weekly-heading">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow}>Shared weekly test line</p><h3 id="weekly-heading">Combined test progress</h3></div>
            {snapshot && <span className={styles.period}>Preview resets {utc(nextUtcWeek(now))}</span>}</div>
          {!snapshot ? <p role="status">Reading local conversation records…</p> : partial ?
            <div role="status" className={styles.partial}><strong>Partial data — combined percentage unavailable</strong><span>Readable receipts are shown below, but missing records prevent a confident remaining amount.</span></div> :
            <div className={styles.progressGrid}><div><strong>{number(current.combinedTokens)}</strong><span>combined recorded tokens this UTC week</span></div>
              <div><strong>{combinedPercent.toFixed(1)}%</strong><span>of temporary test line</span></div>
              <div><strong>{number(Math.max(0, TEST_WEEKLY_TOKENS - current.combinedTokens))}</strong><span>test tokens before line, not a real balance</span></div></div>}
          {complete && status === "warning" && <p className={styles.warning} role="status">TEST PREVIEW: 10% or less remains before this temporary line. AI continues working.</p>}
          {complete && status === "exhausted" && <p className={styles.exhausted} role="status">TEST PREVIEW exhausted. An enforced plan would wait until weekly refill. AI continues working here.</p>}
          <p className={styles.scope}>This browser only. Older or deleted records, dictation, and some failed or cancelled requests are missing; this may undercount actual provider usage.</p>
        </section>

        <section className={styles.chartCard} aria-labelledby="usage-heading">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow}>Weekly cumulative preview</p><h3 id="usage-heading">Recorded conversation usage</h3></div>
            <button className={styles.refresh} type="button" onClick={refresh} disabled={reading}>{reading ? "Reading…" : "Refresh"}</button></div>
          <div className={styles.controls}><fieldset><legend>Source</legend><div className={styles.segmented}>{filters.map((option) =>
            <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div></fieldset>
            <fieldset><legend>Interval · UTC</legend><div className={styles.segmented}>{intervals.map((option) =>
              <button type="button" key={option.value} aria-pressed={interval === option.value} onClick={() => setInterval(option.value)}>{option.label}</button>)}</div></fieldset></div>
          {readError && <p className={styles.partial} role="alert">Local records could not be refreshed. Previous results may be stale. Try Refresh.</p>}
          {issues.length > 0 && <div className={styles.partial} role="status"><strong>Some local usage is unknown.</strong><ul>{[...new Set(issues)].map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          {snapshot && buckets.length === 0 && !partial && <p className={styles.empty}>No recorded conversation usage in this view.</p>}
          {snapshot && <AiUsageChart key={`${filter}-${interval}`} buckets={buckets} filter={filter} complete={complete} capacity={intervalSpec[interval].count} />}
          <p className={styles.chartNote}>Bars show the selected source&apos;s cumulative recorded tokens against the same shared test line. Color follows usage, not source identity. Combined progress above covers both AI sources in this browser in every filter.</p>
        </section>

        <section className={styles.summaryGrid} aria-label="Recorded usage details">
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Recorded tokens</p><strong>{snapshot ? number(summary.total) : "—"}</strong><span>{filter === "combined" ? "Combined" : filter === "project" ? "Project AI" : "Assistant"} in selected time view · retained in this browser</span>{summary.unknownTotals > 0 && <small>Additional usage unknown: {summary.unknownTotals} receipt(s).</small>}</div>
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Input / output</p><strong>{snapshot ? `${number(summary.input)} / ${number(summary.output)}` : "—"}</strong><span>Recorded provider tokens in selected view</span>{(summary.unknownInput + summary.unknownOutput > 0) && <small>Some components are unknown.</small>}</div>
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Estimated provider cost</p><strong>{snapshot && (summary.receipts === 0 || summary.unknownCost < summary.receipts) ? `$${summary.cost.toFixed(4)}` : "Not available"}</strong><span>Stored estimates only; not a bill.</span><small>{summary.unknownCost > 0 ? `${summary.unknownCost} estimate(s) unknown. ` : ""}{costSources.join(" · ")}</small></div>
          <div className={styles.summaryCard}><p className={styles.eyebrow}>Other activity</p><strong>{snapshot ? `${summary.toolCalls} search call(s)` : "—"}</strong><span>Known hosted calls in selected view</span><small>Dictation is not recorded here. {attempts.failed} failed, {attempts.cancelled} cancelled, {attempts.pending} pending, {attempts.prior} earlier attempts in retained records.</small></div>
        </section>

        <section className={styles.realPlan} aria-labelledby="real-plan-heading"><p className={styles.eyebrow}>Real account and allowance</p><h3 id="real-plan-heading">No paid plan connected</h3>
          <div className={styles.realPlanGrid}><div><span>Real allowance and remaining percentage</span><strong>Not configured</strong></div><div><span>Real refill and renewal</span><strong>Not configured</strong></div><div><span>Animation jobs</span><strong>Not available yet</strong></div></div>
          <p>The temporary test line above does not buy credits, bill you, or stop AI. A real plan and authoritative balance are not connected.</p>
          <div className={styles.disabledActions}><button type="button" disabled>Change plan unavailable</button><button type="button" disabled>Top up unavailable</button></div>
        </section>
      </div>
    </main>
  );
}
