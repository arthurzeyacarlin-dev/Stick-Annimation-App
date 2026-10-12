"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiUsageChart } from "./AiUsageChart";
import { TestPlanControls } from "./TestPlanControls";
import { buildBuckets, creditMeterColor, intervalSpec, nextUtcWeek, summarizeReceipts } from "../../lib/ai-dashboard/dashboardAggregation";
import { type DashboardFilter, type DashboardInterval, type DashboardSnapshot } from "../../lib/ai-dashboard/dashboardContract";
import { subscribeDashboardChanges } from "../../lib/ai-dashboard/dashboardSources";
import { useAccountSession } from "../account/AccountSessionProvider";
import { useAccountPlan } from "../account/useAccountPlan";
import Link from "next/link";
import { ACCOUNT_PLANS, PAYMENT_GRACE_DAYS, type AccountPlanStatus } from "../../lib/account/plans";
import styles from "./AiDashboard.module.css";
import { BackButton } from "../ui/BackButton";
import { BuyCreditsPanel } from "../account/BuyCreditsPanel";
import { ManagePlanButton } from "../account/ManagePlanButton";

const filters: { value: DashboardFilter; label: string }[] = [
  { value: "combined", label: "All" }, { value: "project", label: "AI Animator" }, { value: "assistant", label: "Assistant" },
];
const intervals: { value: DashboardInterval; label: string }[] = [
  { value: "minute", label: "1 min" }, { value: "quarter", label: "15 min" }, { value: "hour", label: "Hour" },
  { value: "day", label: "Day" }, { value: "week", label: "Week" },
];
const number = (value: number) => value.toLocaleString("en-US");
const plural = (count: number, one: string, many: string) => `${number(count)} ${count === 1 ? one : many}`;
const longDay = (value: number) => new Date(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The plan's warnings, most serious first. Outlined boxes are the only non-clickable boxes (Arthur: warnings stand out). */
function PlanWarnings({ plan, trial }: { plan: AccountPlanStatus; trial: boolean }) {
  const refill = plan.refillsAt ?? plan.windowEnd;
  return <>
    {plan.paymentProblem && <p className={styles.exhausted} role="alert">
      Your last payment didn&apos;t go through — update your card in Manage plan.{" "}
      {plan.aiLocked ? "The AI Animator is waiting until it's fixed." : `The AI Animator keeps working for up to ${PAYMENT_GRACE_DAYS} days.`} Your projects are safe.
    </p>}
    {plan.creditsLeft === 0 && <p className={styles.exhausted} role="status">{trial
      ? "Out of credits — choose a plan to keep animating. Your projects are safe."
      : `Out of credits — refills on ${longDay(refill)} or buy extra credits.`}</p>}
    {plan.low && <p className={styles.warning} role="status">Almost out: only {plural(plan.creditsLeft, "credit", "credits")} left.</p>}
    {plan.cancelAtPeriodEnd && <p className={styles.warning} role="status">{plan.interval === "year"
      ? "Your plan won't renew. It ends when your paid year is over; you can use your credits until then."
      : `Your plan ends on ${longDay(refill)}. You can use your credits until then.`}</p>}
  </>;
}

export function AiDashboardScreen({ showTestControls = false }: { showTestControls?: boolean }) {
  const account = useAccountSession();
  const ownerId = account?.id ?? null;
  const { status: plan, failed: planFailed, refresh: refreshPlan } = useAccountPlan();
  const [real, setReal] = useState<{ ownerId: string; snapshot: DashboardSnapshot } | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>("combined");
  const [interval, setInterval] = useState<DashboardInterval>("quarter");
  const [readError, setReadError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = ++generation.current;
    void fetch("/api/account/usage", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("account_usage_unavailable");
      const value = await response.json() as { schema?: string; ownerId?: string; snapshot?: DashboardSnapshot };
      if (value.schema !== "diamond-account-usage/v1" || value.ownerId !== ownerId || !value.snapshot)
        throw new Error("account_usage_owner_mismatch");
      return value.snapshot;
    }).then((snapshot) => {
      if (current !== generation.current || controller.signal.aborted) return;
      setReal({ ownerId: ownerId!, snapshot }); setReadError(false);
    }).catch(() => {
      if (current !== generation.current || controller.signal.aborted) return;
      setReadError(true);
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
  const allReceipts = useMemo(() => snapshot ? [...snapshot.project.receipts, ...snapshot.assistant.receipts] : [], [snapshot]);
  const buckets = useMemo(() => buildBuckets(allReceipts, interval, filter, now), [allReceipts, interval, filter, now]);
  const issues = snapshot ? [...snapshot.project.issues, ...snapshot.assistant.issues] : [];
  const partial = !!snapshot && !complete;

  // SPEC-0020 Phase 9 (Arthur's review): back to the Phase 2 layout he liked — the refill date big at the top, the
  // plan with its buttons, every number in one plain row (credits AND tokens and cost), the credits bar, the chart.
  // Below the chart: only the extra-credit packs (Arthur: no cost lists — the AI engine will keep changing).
  const weekStart = snapshot ? nextUtcWeek(now) - WEEK_MS : 0;
  const week = summarizeReceipts(allReceipts, weekStart, now);
  const trial = plan?.plan === "trial";
  const paid = !!plan && !trial && !plan.locked;
  const usedPercent = plan && plan.creditsTotal ? Math.min(100, plan.creditsUsed / plan.creditsTotal * 100) : 0;
  const refill = plan ? plan.refillsAt ?? plan.windowEnd : 0;
  const price = plan ? (plan.interval === "year" ? `$${ACCOUNT_PLANS[plan.plan].yearlyUsd} a year` : ACCOUNT_PLANS[plan.plan].price) : "";

  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <section className={styles.top} aria-labelledby="dashboard-heading">
          <BackButton href="/">Back to Home</BackButton>
          <p className={styles.eyebrow}>AI Dashboard</p>
          <h2 id="dashboard-heading" className={styles.headline}>
            {!plan ? (planFailed ? "Your credits couldn't be read. Try again in a moment." : "Loading your credits…")
              : trial ? <>Free trial ends <time dateTime={new Date(plan.windowEnd).toISOString()}>{longDay(plan.windowEnd)}</time></>
              : plan.cancelAtPeriodEnd ? <>Plan ends <time dateTime={new Date(refill).toISOString()}>{longDay(refill)}</time></>
              : <>Next refill: <time dateTime={new Date(refill).toISOString()}>{longDay(refill)}</time></>}
          </h2>
          {plan && <div className={styles.planRow}>
            <p className={styles.planLine}><strong>{trial ? "Free trial" : `${plan.label} plan`}</strong> · {price} · {number(plan.creditsTotal)} AI credits {trial ? "for 14 days" : "every month"}{trial ? ` · ${plural(plan.trialDaysLeft ?? 0, "day", "days")} left` : ""}</p>
            <div className={styles.planActions}>
              <Link href="/plans" className={styles.planButton}>{trial ? "Choose a plan" : "Change plan"}</Link>
              {paid && <ManagePlanButton returnTo="/credits" />}
            </div>
          </div>}
        </section>

        <section className={styles.stats} aria-label="Your AI credits and usage">
          <div><strong>{plan ? number(plan.creditsLeft) : "—"}</strong><span>AI credits left{plan && plan.topUpCredits > 0 ? ` (${number(plan.topUpCredits)} extra)` : ""}</span></div>
          <div><strong>{plan ? number(plan.creditsUsed) : "—"}</strong><span>AI credits used {trial ? "in your trial" : "this month"}</span></div>
          <div><strong>{snapshot ? number(week.total) : "—"}</strong><span>AI tokens used this week</span></div>
          <div><strong>{snapshot ? `${number(week.input)} / ${number(week.output)}` : "—"}</strong><span>sent to AI / written by AI</span></div>
          <div><strong>{snapshot && (week.receipts === 0 || week.unknownCost < week.receipts) ? `$${week.cost.toFixed(4)}` : "—"}</strong><span>estimated AI cost (not a bill)</span></div>
          <div><strong>{snapshot ? number(week.toolCalls) : "—"}</strong><span>web searches</span></div>
        </section>
        {plan && <div className={styles.creditMeter} role="meter" aria-valuemin={0} aria-valuemax={plan.creditsTotal} aria-valuenow={plan.creditsUsed}
          aria-label={`${number(plan.creditsUsed)} of ${number(plan.creditsTotal)} plan credits used`}>
          <i data-testid="credit-meter-fill" style={{ width: `${usedPercent}%`, backgroundColor: creditMeterColor(usedPercent) }} />
        </div>}
        {plan && <PlanWarnings plan={plan} trial={trial} />}
        <p className={styles.scope}>The bar fills up as you use your AI credits. The Help Assistant and voice typing are free.</p>

        <section className={styles.chartCard} aria-labelledby="usage-heading">
          <div className={styles.cardHeading}><div><p className={styles.eyebrow}>Details · tokens</p><h3 id="usage-heading">Usage over time</h3></div></div>
          <div className={styles.controls}><fieldset><legend>Show</legend><div className={styles.segmented}>{filters.map((option) =>
            <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div></fieldset>
            <fieldset><legend>Group by</legend><div className={styles.segmented}>{intervals.map((option) =>
              <button type="button" key={option.value} aria-pressed={interval === option.value} onClick={() => setInterval(option.value)}>{option.label}</button>)}</div></fieldset></div>
          {readError && <p className={styles.partial} role="alert">Couldn&apos;t update your usage. The numbers may be out of date; it tries again by itself.</p>}
          {issues.length > 0 && <div className={styles.partial} role="status"><strong>Some usage couldn&apos;t be read.</strong><ul>{[...new Set(issues)].map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          {snapshot && buckets.length === 0 && !partial && <p className={styles.empty}>No AI usage to show here yet.</p>}
          {snapshot && <AiUsageChart key={`${filter}-${interval}`} buckets={buckets} filter={filter} complete={complete} capacity={intervalSpec[interval].count} />}
          <p className={styles.chartNote}>Each bar adds up the AI&apos;s tokens so far this week. Tokens are small pieces of text the AI reads and writes; they don&apos;t change your credits.</p>
        </section>

        <BuyCreditsPanel />

        {showTestControls && <details className={styles.testPanel}>
          <summary>TEST CONTROLS — not real. Nothing is charged and no AI runs.</summary>
          <p className={styles.listNote}>Developer only (hidden in the real app). These buttons change only this account&apos;s plan record on this computer.</p>
          <TestPlanControls goHomeWhenLocked onChanged={async () => { await refreshPlan(); }} />
        </details>}
      </div>
    </main>
  );
}
