"use client";

import { useEffect, useState } from "react";
import { ACCOUNT_PLANS, CYCLE_WORD, PAID_PLAN_IDS, PLAN_CYCLE, type BillingInterval, type PaidPlanId } from "@/src/lib/account/plans";
import { creditsText, dollarsText } from "@/src/lib/account/credits";
import { billingDay, canPay, forgetCheckoutReturn, goToStripe, postBilling, takeCheckoutReturn, useBillingInfo } from "./billingClient";
import { ManagePlanButton } from "./ManagePlanButton";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./PlansScreen.module.css";
import { BackButton } from "@/src/components/ui/BackButton";

// The plans page. "Choose" opens Stripe's own page (cards are typed there, never here); coming back with
// ?checkout=done&session_id=… checks with Stripe, which applies the plan exactly once. Someone who already pays switches or
// cancels in "Manage plan" (Stripe's page), so there's never a second plan. Everything is in credits (Arthur, Nov 20); the only
// money shown is what Stripe really charged ("Last payment $9.99 on November 9").
const PLAN_POINTS: Record<PaidPlanId, string[]> = {
  starter: ["Type an idea and watch it move in minutes", "Every tool: AI Animator, drawing and stick-figure tools, the timeline", "Export MP4 videos to share anywhere", "The Help Assistant shows you how things work"],
  creator: ["Room to try, tweak and try again until it looks exactly right", "Everything in Basic: every tool, MP4 export, the Help Assistant", "Most popular"],
  studio: ["Big scenes, series, a whole channel", "Everything in Pro", "Be first: new features before everyone else"],
};
const usd = (value: number) => (Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`);
const cycleName = PLAN_CYCLE === "week" ? "Weekly" : "Monthly";

export function PlansScreen() {
  const { status } = useAccountPlan();
  const [factsVersion, setFactsVersion] = useState(0);
  const billing = useBillingInfo(factsVersion);
  const mode = billing.mode;
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(PLAN_CYCLE);
  const [busy, setBusy] = useState<PaidPlanId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState({ first50: "", youtube: "" });

  // Coming back from Stripe's page (the address is cleaned right away; checking it again is always safe).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const back = takeCheckoutReturn("checkout");
      if (!back) return;
      if (back.result === "canceled" || !back.sessionId) { setNotice("No payment was made."); return; }
      setNotice("Getting your plan ready");
      postBilling<{ status: { kind: string; label?: string; credits: number; waitingForPayment?: boolean } }>("/api/account/billing/complete", { sessionId: back.sessionId })
        .then(({ status: result }) => {
          setNotice(result.kind === "plan" && result.label
            ? result.waitingForPayment
              ? `You're on ${result.label}! Your ${creditsText(result.credits)} come the moment your payment goes through.`
              : `You're on ${result.label}! ${creditsText(result.credits)} are ready.`
            : `${creditsText(result.credits)} added.`);
          setFactsVersion((value) => value + 1);
          forgetCheckoutReturn("checkout");
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
    if (!canPay(mode) || busy) return;
    setBusy(plan);
    setError(null);
    try {
      const { url } = await postBilling<{ url: string }>("/api/account/billing/checkout", {
        plan, interval: billingInterval, codes: { first50: codes.first50.trim() || undefined, youtube: codes.youtube.trim() || undefined },
      });
      goToStripe(url);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That plan couldn't be chosen. Nothing was charged. Try again.");
      setBusy(null);
    }
  };

  const lead = !status ? " "
    : status.lockReason === "trial_ended" ? "Your free trial has ended. Pick a plan to keep animating. Your projects are safe."
    : status.lockReason === "plan_ended" ? "Your plan has ended. Pick a plan to keep animating. Your projects are safe."
    : status.aiLocked ? "A payment on your account is being checked by your bank, so the AI waits until that's settled. Your projects are safe."
    : status.paymentProblem ? `Your last payment didn't go through. Update your card in Manage plan and this ${CYCLE_WORD}'s credits come right away.`
    : status.waitingForPayment ? `This ${CYCLE_WORD}'s credits come the moment your payment goes through (usually within a minute).`
    : status.plan === "trial" ? "You're on the free trial."
    : status.cancelAtPeriodEnd ? `You're on the ${status.label} plan. It ends on ${billingDay(status.windowEnd)} and you won't be charged again.`
    : `You're on the ${status.label} plan.`;

  const facts = [
    billing.lastPayment ? `Last payment ${dollarsText(billing.lastPayment.cents)} on ${billingDay(billing.lastPayment.at)}` : null,
    billing.nextPaymentAt ? `Next payment ${billingDay(billing.nextPaymentAt)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <BackButton href="/">Back to Home</BackButton>
        <p className={styles.eyebrow}>Plans</p>
        <h1 className={styles.title}>Choose your plan</h1>
        <p className={styles.lead}>{lead}</p>
        {facts && <p className={styles.facts}>{facts}</p>}
        {billing.notice && <p className={styles.notice} role="status">{billing.notice}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {mode === "test" && <p className={styles.testMode}>Test mode: no real money is taken. Pay with the test card 4242 4242 4242 4242, any future date, any 3 numbers.</p>}

        <p className={styles.note}>Show prices for:</p>
        <div className={styles.intervals} role="group" aria-label={`Show prices for paying ${cycleName.toLowerCase()} or yearly`}>
          <button type="button" className={styles.interval} aria-pressed={billingInterval === PLAN_CYCLE} onClick={() => setBillingInterval(PLAN_CYCLE)}>{cycleName}</button>
          <button type="button" className={styles.interval} aria-pressed={billingInterval === "year"} onClick={() => setBillingInterval("year")}>Yearly — 2 months free</button>
        </div>

        {!payingNow && canPay(mode) && <DiscountCodes codes={codes} setCodes={setCodes} />}

        <div className={styles.plans}>
          {PAID_PLAN_IDS.map((id) => {
            const plan = ACCOUNT_PLANS[id];
            const current = payingNow && status?.plan === id;
            // Arthur: your own plan always shows what YOU pay (each cycle or yearly), never the other price.
            const shownInterval = current ? status?.interval ?? PLAN_CYCLE : billingInterval;
            const price = shownInterval === "year" ? `${usd(plan.yearlyUsd)} a year` : `${usd(plan.monthlyUsd)} a ${CYCLE_WORD}`;
            const points = [`${creditsText(plan.credits)} every ${CYCLE_WORD}`, plan.about, ...PLAN_POINTS[id]];
            const body = (
              <>
                <span className={styles.planName}>{plan.label}</span>
                <span className={styles.price}>{price}</span>
                <span className={styles.saving}>{shownInterval === "year" ? "2 months free" : " "}</span>
                <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
              </>
            );
            if (current) {
              return (
                <div key={id} className={`${styles.plan} ${styles.current}`}>
                  {body}
                  <span className={styles.yours}>Your plan · you pay {status?.interval === "year" ? "yearly" : cycleName.toLowerCase()}</span>
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
                disabled={!canPay(mode) || busy !== null} onClick={() => void choose(id)}
                aria-label={`${label}, ${price}, ${creditsText(plan.credits)} every ${CYCLE_WORD}`}>
                {body}
                <span className={styles.choose}>{label}</span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        <p className={styles.note}>
          Your credits refill every {CYCLE_WORD} on the day your plan started (yearly plans refill every {CYCLE_WORD} too), once that
          {" "}{CYCLE_WORD}&apos;s payment has gone through. Leftover credits don&apos;t roll over; extra packs never expire. Every AI action
          shows its price in credits before it runs, and when your credits run out the AI stops until they refill. You can cancel any time in Manage plan.
        </p>
      </div>
    </main>
  );
}

/** The two optional discount codes (website: first 50 people, and the YouTube channel). Checked by the server with Stripe. */
function DiscountCodes({ codes, setCodes }: { codes: { first50: string; youtube: string }; setCodes: (codes: { first50: string; youtube: string }) => void }) {
  return (
    <div className={styles.codes}>
      <p className={styles.codesTitle}>Have a discount code?</p>
      <div className={styles.codeRow}>
        <label className={styles.codeField}>
          <span>First-50 code</span>
          <input type="text" value={codes.first50} onChange={(event) => setCodes({ ...codes, first50: event.target.value })}
            autoComplete="off" spellCheck={false} maxLength={40} placeholder="From your email" />
        </label>
        <label className={styles.codeField}>
          <span>YouTube code</span>
          <input type="text" value={codes.youtube} onChange={(event) => setCodes({ ...codes, youtube: event.target.value })}
            autoComplete="off" spellCheck={false} maxLength={40} placeholder="From the channel" />
        </label>
      </div>
      <p className={styles.note}>First 50: 25% off your first year. YouTube: 10% off your first {CYCLE_WORD} ({cycleName.toLowerCase()} plans). Both: 30% off your first {CYCLE_WORD}, then 25% for the rest of your first year. Type your code, then choose a plan.</p>
    </div>
  );
}
