"use client";

import { useEffect, useState } from "react";
import { ACCOUNT_PLANS, PAID_PLAN_IDS, type BillingInterval, type PaidPlanId } from "@/src/lib/account/plans";
import { goToStripe, postBilling, takeCheckoutReturn, useBillingMode } from "./billingClient";
import { ManagePlanButton } from "./ManagePlanButton";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./PlansScreen.module.css";
import { BackButton } from "@/src/components/ui/BackButton";

// SPEC-0020 Phase 9: the plans page with Stripe payments in TEST MODE (no real money). "Choose" opens Stripe's own
// page (cards are typed there, never here); coming back with ?checkout=done&session_id=… applies the new plan.
// Someone who already pays switches or cancels in "Manage plan" (Stripe's page) so there's never a second plan.
// (The old Phase 2 "choosing switches right away" shortcut is gone from here; the /dev/plan test page keeps it.)
const PLAN_POINTS = ["AI Animator and Help Assistant", "All drawing and animation tools", "Export videos to share anywhere"];
const PLAN_FOR: Record<PaidPlanId, string> = { starter: "For getting started", creator: "For regular animators", studio: "For big projects" };
const number = (value: number) => value.toLocaleString("en-US");
const usd = (value: number) => (Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`);
export function PlansScreen() {
  const { status } = useAccountPlan();
  const mode = useBillingMode();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState<PaidPlanId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe's page (the address is cleaned right away; applying the plan is safe to repeat).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const back = takeCheckoutReturn("checkout");
      if (!back) return;
      if (back.result === "canceled" || !back.sessionId) { setNotice("No payment was made."); return; }
      setNotice("Getting your plan ready");
      postBilling<{ status: { kind: string; label?: string; credits: number } }>("/api/account/billing/complete", { sessionId: back.sessionId })
        .then(({ status: result }) => {
          setNotice(result.kind === "plan" && result.label
            ? `You're on ${result.label}! ${number(result.credits)} credits are ready.`
            : `${number(result.credits)} extra credits added.`);
          window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
        })
        .catch((problem: unknown) => {
          setNotice(null);
          setError(problem instanceof Error ? problem.message : "Your plan couldn't be set up. Try again.");
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const payingNow = Boolean(status && status.plan !== "trial" && (status.billingStatus === "active" || status.billingStatus === "past_due"));

  const choose = async (plan: PaidPlanId) => {
    if (mode !== "test" || busy) return;
    setBusy(plan);
    setError(null);
    try {
      const { url } = await postBilling<{ url: string }>("/api/account/billing/checkout", { plan, interval: billingInterval });
      goToStripe(url);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That plan couldn't be chosen. Try again.");
      setBusy(null);
    }
  };

  const lead = !status ? " "
    : status.lockReason === "trial_ended" ? "Your free trial has ended. Pick a plan to keep animating. Your projects are safe."
    : status.lockReason === "plan_ended" ? "Your plan has ended. Pick a plan to keep animating. Your projects are safe."
    : status.paymentProblem ? "Your last payment didn't go through. Update your card in Manage plan to keep animating."
    : status.plan === "trial" ? "You're on the free trial."
    : status.cancelAtPeriodEnd ? `You're on the ${status.label} plan. It ends at the end of this billing period.`
    : `You're on the ${status.label} plan.`;

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <BackButton href="/">Back to Home</BackButton>
        <header className={styles.head}>
          <div className={styles.headWords}>
            <p className={styles.lead}>{lead}</p>
            <h1 className={styles.title}>Choose your plan</h1>
            {notice && <p className={styles.notice} role="status">{notice}</p>}
          </div>
          <div className={styles.intervals} role="group" aria-label="Show prices for paying monthly or yearly">
            <button type="button" className={styles.interval} aria-pressed={billingInterval === "month"} onClick={() => setBillingInterval("month")}>Monthly</button>
            <button type="button" className={styles.interval} aria-pressed={billingInterval === "year"} onClick={() => setBillingInterval("year")}>Yearly <span>2 months free</span></button>
          </div>
        </header>

        <div className={styles.plans}>
          {PAID_PLAN_IDS.map((id) => {
            const plan = ACCOUNT_PLANS[id];
            const current = payingNow && status?.plan === id;
            // Arthur: your own plan always shows what YOU pay (monthly or yearly), never the other price.
            const shownInterval = current ? status?.interval ?? "month" : billingInterval;
            const price = shownInterval === "month" ? `${usd(plan.monthlyUsd)} a month` : `${usd(plan.yearlyUsd)} a year`;
            const amount = usd(shownInterval === "month" ? plan.monthlyUsd : plan.yearlyUsd);
            const body = (
              <>
                <span className={styles.planTop}>
                  <span className={styles.planName}>{plan.label}</span>
                  {id === "creator" && <span className={styles.badge}>Most popular</span>}
                </span>
                <span className={styles.planFor}>{PLAN_FOR[id]}</span>
                <span className={styles.price}><strong>{amount}</strong><small>{shownInterval === "month" ? "a month" : "a year"}</small></span>
                <span className={styles.allowance}><strong>{number(plan.credits)} AI credits</strong><small>every month</small></span>
                <ul>{PLAN_POINTS.map((point) => <li key={point}>{point}</li>)}</ul>
              </>
            );
            if (current) {
              return (
                <div key={id} className={`${styles.plan} ${styles.current}`}>
                  {body}
                  <span className={styles.yours}>Your plan · you pay {status?.interval === "year" ? "yearly" : "monthly"}</span>
                  <ManagePlanButton returnTo="/plans" className={styles.manage} />
                </div>
              );
            }
            const label = mode === "off" ? "Not available right now"
              : busy === id ? "Opening Stripe"
              : payingNow ? `Switch to ${plan.label}`
              : `Choose ${plan.label}`;
            return (
              <button key={id} type="button" data-plan={id} className={`${styles.plan}${id === "creator" ? ` ${styles.popular}` : ""}`}
                disabled={mode !== "test" || busy !== null} onClick={() => void choose(id)}
                aria-label={`${label}, ${price}, ${number(plan.credits)} AI credits every month`}>
                {body}
                <span className={`${styles.choose}${id === "creator" ? ` ${styles.choosePrimary}` : ""}`}>{label}</span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        <ul className={styles.promises}>
          <li><strong>Cancel any time</strong><span>Change or stop your plan in Manage plan.</span></li>
          <li><strong>Refills every month</strong><span>Your AI credits come back on the day your plan started.</span></li>
          <li><strong>Secure payment</strong><span>You pay on Stripe&apos;s page. We never see your card.</span></li>
        </ul>
      </div>
    </main>
  );
}
