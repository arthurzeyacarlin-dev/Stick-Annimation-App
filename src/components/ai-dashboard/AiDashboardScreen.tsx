"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiUsageChart } from "./AiUsageChart";
import { creditMeterPercent } from "../../lib/ai-dashboard/creditMeter";
import { buildBuckets, creditMeterColor, intervalSpec } from "../../lib/ai-dashboard/dashboardAggregation";
import { type DashboardFilter, type DashboardInterval, type DashboardSnapshot } from "../../lib/ai-dashboard/dashboardContract";
import { subscribeDashboardChanges } from "../../lib/ai-dashboard/dashboardSources";
import { useAccountSession } from "../account/AccountSessionProvider";
import { useAccountPlan } from "../account/useAccountPlan";
import Link from "next/link";
import { ACCOUNT_PLANS, AI_ACTION_LABELS, CYCLE_WORD, isAiActionKind, type AccountPlanStatus } from "../../lib/account/plans";
import styles from "./AiDashboard.module.css";
import { BuyCreditsPanel } from "../account/BuyCreditsPanel";
import { ManagePlanButton } from "../account/ManagePlanButton";
import { creditsText } from "../../lib/account/credits";

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

/** The plan's warnings, most serious first. Outlined boxes are the only non-clickable boxes (Arthur: warnings stand out). */
function PlanWarnings({ plan, trial }: { plan: AccountPlanStatus; trial: boolean }) {
  const refill = plan.refillsAt ?? plan.windowEnd;
  return <>
    {plan.aiLocked && <p className={styles.exhausted} role="alert">
      A payment on your account is being checked by your bank, so the AI waits until that&apos;s settled. Your projects are safe.
    </p>}
    {plan.paymentProblem && <p className={styles.exhausted} role="alert">
      Your last payment didn&apos;t go through — update your card in Manage plan and this {CYCLE_WORD}&apos;s credits come right away. Extra pack credits still work. Your projects are safe.
    </p>}
    {plan.waitingForPayment && !plan.paymentProblem && <p className={styles.warning} role="status">
      This {CYCLE_WORD}&apos;s credits come the moment your payment goes through (usually within a minute).
    </p>}
    {plan.creditsLeft === 0 && !plan.waitingForPayment && <p className={styles.exhausted} role="status">{trial
      ? "Out of credits — choose a plan to keep animating. Your projects are safe."
      : `Out of credits — they refill on ${longDay(refill)}, or buy an extra pack.`}</p>}
    {plan.low && <p className={styles.warning} role="status">Almost out: only {creditsText(plan.creditsLeft)} left.</p>}
    {plan.cancelAtPeriodEnd && <p className={styles.warning} role="status">{plan.interval === "year"
      ? "Your plan won't renew. It ends when your paid year is over; you can use your credits until then."
      : `Your plan ends on ${longDay(refill)}. You can use your credits until then, and you won't be charged again.`}</p>}
  </>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysUntil = (at: number) => Math.max(0, Math.ceil((at - Date.now()) / DAY_MS));
const inDays = (days: number) => days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${number(days)} days`;

/** The dashboard's header (Arthur 2026-10-27): one glowing dotted box — on the trial the days left big, on a plan when
 *  it refills; credits left with the fading bar; the bright plan button. Same look for the trial and every plan. */
function PlanHero({ plan, byKind }: { plan: AccountPlanStatus; byKind: { animator: number; assistant: number; lines: [string, number][] } }) {
  const trial = plan.plan === "trial";
  const refill = plan.refillsAt ?? plan.windowEnd;
  const days = trial ? plan.trialDaysLeft ?? 0 : daysUntil(refill);
  const left = plan.creditsLeft;
  const usedPercent = creditMeterPercent(plan.creditsUsed, plan.creditsTotal, plan.topUpCredits);
  const tone = left === 0 ? "out" : plan.low ? "low" : "ok";
  const price = trial ? "" : plan.interval === "year" ? `$${ACCOUNT_PLANS[plan.plan].yearlyUsd} a year` : ACCOUNT_PLANS[plan.plan].price;
  const ending = !trial && plan.cancelAtPeriodEnd;
  const headline = trial ? `${plural(days, "day", "days")} left` : ending ? `Plan ends ${inDays(days)}` : `Refills ${inDays(days)}`;
  return <>
    <section className={styles.trialHero} aria-labelledby="dashboard-heading">
      <div className={styles.trialMain}>
        <p className={styles.trialBadge}><span aria-hidden="true" />{trial ? "Free trial" : `${plan.label} plan`}</p>
        <h2 id="dashboard-heading" className={styles.trialDays}>{headline}</h2>
        {trial
          ? <p className={styles.trialEnds}>Your free trial ends <time dateTime={new Date(plan.windowEnd).toISOString()}>{longDay(plan.windowEnd)}</time>. Your projects stay safe either way.</p>
          : <p className={styles.trialEnds}>{price} · {creditsText(ACCOUNT_PLANS[plan.plan].credits)} every {CYCLE_WORD} · {ending ? "ends" : "refills"} <time dateTime={new Date(refill).toISOString()}>{longDay(refill)}</time></p>}
        <div className={styles.heroActions}>
          <Link href="/plans" className={`${styles.trialCta} da-super`}>{trial ? "Choose a plan" : "Change plan"}</Link>
          {!trial && !plan.locked && <ManagePlanButton returnTo="/credits" className={`${styles.heroOutline} da-btn-outline`} />}
        </div>
      </div>
      <div className={styles.trialCredits} data-tone={tone}>
        <p className={styles.trialCreditsLabel}>Credits</p>
        <p className={styles.trialCreditsBig}><strong>{left.toLocaleString("en-US")}</strong> <span>of {creditsText(plan.creditsTotal + plan.topUpCredits)} left</span></p>
        <div className={styles.trialBar} role="meter" aria-valuemin={0} aria-valuemax={plan.creditsTotal + plan.topUpCredits} aria-valuenow={left}
          aria-valuetext={`${creditsText(left)} left`} aria-label={`${creditsText(left)} left`}>
          <i data-testid="credit-meter-fill" style={{ width: `${100 - usedPercent}%`, backgroundColor: creditMeterColor(usedPercent), color: creditMeterColor(usedPercent) }} />
        </div>
        <div className={styles.trialBarLabels}><span>Used so far: {creditsText(plan.creditsUsed)}</span><span>{plan.topUpCredits > 0 ? `incl. ${creditsText(plan.topUpCredits)} from packs` : `${creditsText(plan.creditsTotal)} total`}</span></div>
      </div>
    </section>
    <section className={styles.stats} aria-label="Your credits">
      <div><strong>{creditsText(plan.creditsUsed)}</strong><span>{trial ? "Used in your trial" : `Used this ${CYCLE_WORD}`}</span></div>
      <div><strong>{creditsText(byKind.animator)}</strong><span>AI Animator</span></div>
      <div><strong>{creditsText(byKind.assistant)}</strong><span>Help Assistant</span></div>
    </section>
    {byKind.lines.length > 0 && <section className={styles.kinds} aria-label="Where your credits went">
      <h3>Where your credits went</h3>
      <dl>{byKind.lines.map(([kind, credits]) => <div key={kind}><dt>{isAiActionKind(kind) ? AI_ACTION_LABELS[kind] : kind}</dt><dd>{creditsText(credits)}</dd></div>)}</dl>
    </section>}
    <PlanWarnings plan={plan} trial={trial} />
  </>;
}

function EmptyUsage({ filter }: { filter: DashboardFilter | null }) {
  return <div className={styles.emptyUsage}>
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" />
    </svg>
    <strong>{filter === "assistant" ? "No Help Assistant credits used here yet" : filter === "project" ? "No AI Animator credits used here yet" : "No credits used yet"}</strong>
    <span>{filter ? "Nothing in this time range. Try another view or a longer Group by." : "Your credits line shows up here once you start animating with the AI Animator."}</span>
  </div>;
}

export function AiDashboardScreen() {
  const account = useAccountSession();
  const ownerId = account?.id ?? null;
  const { status: plan, failed: planFailed } = useAccountPlan();
  const [real, setReal] = useState<{ ownerId: string; snapshot: DashboardSnapshot } | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>("combined");
  const [interval, setInterval] = useState<DashboardInterval>("quarter");
  const [readError, setReadError] = useState(false);
  // SPEC-0022 Phase 2: the chart reads the SAME credit list as the bar and "credits used" (Arthur: they must agree).
  const [creditEvents, setCreditEvents] = useState<{ at: number; credits: number; kind: string }[]>([]);
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
  const creditsUsedNow = plan?.creditsUsed;
  useEffect(() => {
    let live = true;
    void fetch("/api/account/credit-use", { cache: "no-store" }).then((res) => res.ok ? res.json() : null)
      .then((value: { events?: { at: number; credits: number; kind: string }[] } | null) => { if (live && value?.events) setCreditEvents(value.events); })
      .catch(() => {});
    return () => { live = false; };
  }, [creditsUsedNow, snapshot?.readAt]);
  const now = snapshot ? Math.max(snapshot.readAt, ...creditEvents.map((event) => event.at)) : 0;
  const complete = !!snapshot && !readError && [snapshot.project.state, snapshot.assistant.state].every((state) => state === "ready" || state === "absent");
  const allReceipts = useMemo(() => creditEvents.map((event, index) => ({
    id: `credit-${event.at}-${index}`, source: event.kind === "assistant" ? "assistant" as const : "project" as const, at: event.at, inputTokens: null, outputTokens: null, totalTokens: event.credits,
    estimatedCostUsd: null, priceDate: null, model: null, reasoning: null, toolCalls: 0,
  })), [creditEvents]);
  const roof = plan ? Math.max(1, plan.creditsTotal) : 1;
  const refillAt = plan?.windowStart;
  const buckets = useMemo(() => buildBuckets(allReceipts, interval, filter, now, roof, refillAt), [allReceipts, interval, filter, now, roof, refillAt]);
  const issues = snapshot ? [...snapshot.project.issues, ...snapshot.assistant.issues] : [];
  const partial = !!snapshot && !complete;

  // Arthur (2026-10-27): one header for the trial and every plan (PlanHero), the numbers split by AI Animator and Help
  // Assistant, the chart, then the extra-credit packs for plan members.
  // Show / Group by stay visible once there is any usage, so an empty view (like Assistant) can be switched back.
  const noUsageAtAll = !!snapshot && !partial && allReceipts.length === 0;
  // (Nov 20) every AI spend has its own line ("Where your credits went"): new animation, add-on, change, look, chat, Help, voice typing, drawing AI
  const thisCycle = creditEvents.filter((event) => event.kind !== "test" && (!plan || event.at >= plan.windowStart));
  const perKind = new Map<string, number>();
  for (const event of thisCycle) perKind.set(event.kind, (perKind.get(event.kind) ?? 0) + event.credits);
  const byKind = {
    animator: thisCycle.filter((event) => ["animation", "addon", "edit", "look", "chat", "simple", "big"].includes(event.kind)).reduce((t, event) => t + event.credits, 0),
    assistant: perKind.get("assistant") ?? 0,
    lines: [...perKind].filter(([, credits]) => credits > 0).sort((a, b) => b[1] - a[1]),
  };

  return (
    <main className={styles.main}>
      <div className={styles.content}>
        {plan ? <PlanHero plan={plan} byKind={byKind} /> : <section className={styles.top} aria-labelledby="dashboard-heading">
          <p className={styles.eyebrow}>AI Dashboard</p>
          <h2 id="dashboard-heading" className={styles.headline}>{planFailed ? "Your credits couldn't be read. Try again in a moment." : "Loading your credits"}</h2>
        </section>}

        <section className={styles.chartCard} aria-labelledby="usage-heading">
          <div className={styles.cardHeading}><h3 id="usage-heading">Credits over time</h3></div>
          <div className={styles.controls} style={noUsageAtAll ? { display: "none" } : undefined}><fieldset><legend>Show</legend><div className={styles.segmented}>{filters.map((option) =>
            <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div></fieldset>
            <fieldset><legend>Group by</legend><div className={styles.segmented}>{intervals.map((option) =>
              <button type="button" key={option.value} aria-pressed={interval === option.value} onClick={() => setInterval(option.value)}>{option.label}</button>)}</div></fieldset></div>
          {readError && <p className={styles.partial} role="alert">Couldn&apos;t update your credits. The numbers may be out of date; it tries again by itself.</p>}
          {issues.length > 0 && <div className={styles.partial} role="status"><strong>Some of your credit use couldn&apos;t be read.</strong><ul>{[...new Set(issues)].map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          {snapshot && buckets.length === 0 && !partial ? <EmptyUsage filter={noUsageAtAll ? null : filter} /> : snapshot && <AiUsageChart key={`${filter}-${interval}`} buckets={buckets} filter={filter} complete={complete} capacity={intervalSpec[interval].count} roof={roof} />}
          {!noUsageAtAll && <p className={styles.chartNote}>The line climbs with the credits your AI use takes and drops back to zero when your credits refill. Its color matches the bar above.</p>}
        </section>

        {plan && plan.plan !== "trial" && <div className={styles.extraCredits}><BuyCreditsPanel /></div>}

      </div>
    </main>
  );
}
