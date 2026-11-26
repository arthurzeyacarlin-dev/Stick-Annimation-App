"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiUsageChart } from "./AiUsageChart";
import { creditsLeftPercent } from "../../lib/ai-dashboard/creditMeter";
import { buildBuckets, intervalSpec } from "../../lib/ai-dashboard/dashboardAggregation";
import { type DashboardFilter, type DashboardInterval, type DashboardSnapshot } from "../../lib/ai-dashboard/dashboardContract";
import { subscribeDashboardChanges } from "../../lib/ai-dashboard/dashboardSources";
import { useAccountSession } from "../account/AccountSessionProvider";
import { useAccountPlan } from "../account/useAccountPlan";
import Link from "next/link";
import { ACCOUNT_PLANS, AI_ACTION_LABELS, CYCLE_WORD, creditSourceOf, isAiActionKind, type AccountPlanStatus } from "../../lib/account/plans";
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
      // (Nov 26, dad's test) a plan that is ending never refills, so it never promises a refill day
      : plan.cancelAtPeriodEnd ? "Out of credits — buy an extra pack, or choose a plan to keep animating. Your projects are safe."
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

/** "Where your credits went" (Nov 21, Arthur): pointing at a part of the bar shows what it is, like the chart's bars. */
function SplitBar({ animator, other }: { animator: number; other: number }) {
  const [hover, setHover] = useState<"animator" | "other" | null>(null);
  const spent = animator + other;
  const share = (credits: number) => (spent > 0 ? Math.round((credits / spent) * 100) : 0);
  const animatorWidth = spent > 0 ? (animator / spent) * 100 : 0;
  const parts = [
    { key: "animator" as const, label: "AI Animator", credits: animator, width: animatorWidth, left: 0 },
    { key: "other" as const, label: "Help Assistant", credits: other, width: spent > 0 ? 100 - animatorWidth : 0, left: animatorWidth },
  ];
  const shown = parts.find((part) => part.key === hover);
  return (
    <div className={styles.splitWrap} onMouseLeave={() => setHover(null)}>
      <div className={styles.splitBar}>
        {parts.map((part) => part.width > 0 && (
          <span key={part.key} className={part.key === "animator" ? styles.splitAnimator : styles.splitOther} style={{ width: `${part.width}%` }}
            data-active={hover === part.key ? "true" : "false"} tabIndex={0} role="img"
            aria-label={`${part.label}: ${creditsText(part.credits)}, ${share(part.credits)}%`}
            onMouseEnter={() => setHover(part.key)} onFocus={() => setHover(part.key)} onBlur={() => setHover(null)} />
        ))}
      </div>
      {shown && <div className={styles.splitTip} role="tooltip" style={{ left: `${Math.min(88, Math.max(12, shown.left + shown.width / 2))}%` }}>
        <strong>{shown.label}</strong>
        <span>{creditsText(shown.credits)} · {share(shown.credits)}% of what you used</span>
      </div>}
    </div>
  );
}

/** The dashboard's header (Arthur 2026-10-27): one glowing dotted box — on the trial the days left big, on a plan when
 *  it refills; credits left with the fading bar; the bright plan button. Same look for the trial and every plan. */
function PlanHero({ plan, byKind }: { plan: AccountPlanStatus; byKind: { animator: number; assistant: number; lines: [string, number][] } }) {
  const trial = plan.plan === "trial";
  const refill = plan.refillsAt ?? plan.windowEnd;
  const days = trial ? plan.trialDaysLeft ?? 0 : daysUntil(refill);
  const left = plan.creditsLeft;
  // Nov 21 (Arthur): the ring is FULL whenever you have at least your plan's credits (after a refill or a pack).
  const leftPercent = creditsLeftPercent(left, plan.creditsTotal);
  const total = plan.creditsTotal + plan.topUpCredits;
  const spent = byKind.animator + byKind.assistant;
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
        <div className={styles.ring} role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={left} aria-valuetext={`${creditsText(left)} left`} aria-label={`${creditsText(left)} left`}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs><linearGradient id="aiRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4d94ff" /><stop offset="100%" stopColor="#0066ff" /></linearGradient></defs>
            <circle className={styles.ringTrack} cx="60" cy="60" r="52" />
            <circle className={styles.ringValue} data-testid="credit-meter-fill" cx="60" cy="60" r="52" pathLength={100} strokeDasharray={`${leftPercent} 100`} />
          </svg>
          <div><strong>{number(left)}</strong><span>left</span></div>
        </div>
        <div className={styles.ringFacts}>
          <p className={styles.trialCreditsLabel}>Credits</p>
          <dl>
            <div><dt>Total</dt><dd>{number(total)}</dd></div>
            <div><dt>Used</dt><dd>{number(plan.creditsUsed)}</dd></div>
            {plan.topUpCredits > 0 && <div><dt>Extra (packs + free)</dt><dd>{number(plan.topUpCredits)}</dd></div>}
          </dl>
        </div>
      </div>
    </section>
    <section className={styles.split} aria-label="Where your credits went">
      <div className={styles.splitHead}><h3>Where your credits went</h3><span>{creditsText(spent)}</span></div>
      <SplitBar animator={byKind.animator} other={byKind.assistant} />
      <div className={styles.splitKeys}>
        <span><i aria-hidden="true" />AI Animator <strong>{number(byKind.animator)}</strong></span>
        <span><b aria-hidden="true" />Help Assistant <strong>{number(byKind.assistant)}</strong></span>
      </div>
      {byKind.lines.length > 0 && <dl className={styles.kinds}>{byKind.lines.map(([kind, credits]) => <div key={kind}><dt>{isAiActionKind(kind) ? AI_ACTION_LABELS[kind] : kind}</dt><dd>{creditsText(credits)}</dd></div>)}</dl>}
    </section>
    <PlanWarnings plan={plan} trial={trial} />
  </>;
}

function EmptyUsage({ filter }: { filter: DashboardFilter | null }) {
  return <div className={styles.emptyUsage}>
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" />
    </svg>
    <strong>{filter === "assistant" ? "No Help Assistant credits used here yet" : filter === "project" ? "No AI Animator credits used here yet" : "No credits used yet"}</strong>
    <span>{filter ? "Nothing in this time range. Try another view or a longer Group by." : "Your credit bars show up here once you start animating with the AI Animator."}</span>
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
  // (Nov 21) the chart and the credits bar use ONE rule (creditSourceOf): Help Assistant answers and its voice typing are the
  // Assistant; everything else (chat, animations, the AI Animator's voice typing, drawing help) is the AI Animator.
  const allReceipts = useMemo(() => creditEvents.filter((event) => creditSourceOf(event.kind) !== null).map((event, index) => ({
    id: `credit-${event.at}-${index}`, source: creditSourceOf(event.kind) === "assistant" ? "assistant" as const : "project" as const, at: event.at, inputTokens: null, outputTokens: null, totalTokens: event.credits,
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
    animator: thisCycle.filter((event) => creditSourceOf(event.kind) === "animator").reduce((t, event) => t + event.credits, 0),
    assistant: thisCycle.filter((event) => creditSourceOf(event.kind) === "assistant").reduce((t, event) => t + event.credits, 0),
    lines: [...perKind].filter(([, credits]) => credits > 0).sort((a, b) => b[1] - a[1]),
  };

  const userIssues = [...new Set(issues)].filter((issue) => !/Provider-internal retries/i.test(issue));
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
          {/* (Nov 23) the always-true engineering note about provider retries is not news for a user: only real gaps are shown */}
          {userIssues.length > 0 && <div className={styles.partial} role="status"><strong>Some of your credit use couldn&apos;t be read.</strong><ul>{userIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          {snapshot && buckets.length === 0 && !partial ? <EmptyUsage filter={noUsageAtAll ? null : filter} /> : snapshot && <AiUsageChart key={`${filter}-${interval}`} buckets={buckets} filter={filter} complete={complete} capacity={intervalSpec[interval].count} roof={roof} />}
          {!noUsageAtAll && <p className={styles.chartNote}>Each bar is the credits you used in that stretch of time. Point at a bar for details.</p>}
        </section>

        {plan && plan.plan !== "trial" && <div className={styles.extraCredits}><BuyCreditsPanel /></div>}

      </div>
    </main>
  );
}
