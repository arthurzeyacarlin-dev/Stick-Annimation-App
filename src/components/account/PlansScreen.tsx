"use client";

import { useEffect, useState } from "react";
import { ACCOUNT_PLANS, CYCLE_WORD, NO_TRIAL_MESSAGE, PAID_PLAN_IDS, PLAN_CYCLE, type BillingInterval, type PaidPlanId } from "@/src/lib/account/plans";
import { creditsText, dollarsText } from "@/src/lib/account/credits";
import { billingDay, canPay, forgetCheckoutReturn, postBilling, takeCheckoutReturn, useBillingInfo } from "./billingClient";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./PlansScreen.module.css";
import { BackButton } from "@/src/components/ui/BackButton";
import { PaymentDialog, type PaymentFor } from "./PaymentDialog";
import { normalizeCode, offerFromCodes, offerLine, offerMoney, offerPrice } from "@/src/lib/account/offerDisplay";
import { saveCode, useCodeCheck, useSavedOffer } from "./offerCode";
import { SalesRecap } from "./SalesRecap";
import { betaDeadlineLine } from "@/src/lib/account/salesCopy";

// The plans page. "Choose" opens Stripe's own page (cards are typed there, never here); coming back with
// ?checkout=done&session_id=… checks with Stripe, which applies the plan exactly once. Nov 21 (Arthur: "Diamond Animator is what
// you see, behind the scenes it's Stripe"): someone who already pays switches RIGHT AWAY, cancels, keeps or changes the card here;
// only typing a new card opens Stripe's secure card page. Everything is in credits; the only money shown is what is paid or
// given back.
// Nov 21 (Arthur): the plans are NOT equally important. Basic is the plainest, Pro stands out, Creator looks the most
// powerful. Only the plan you have (or the free trial) gets the white outline. The points match the website.
const PLAN_POINTS: Record<PaidPlanId, string[]> = {
  starter: ["Type an idea and watch it move in minutes", "Every tool: AI Animator, drawing, the timeline", "Export MP4 videos to share anywhere"],
  creator: ["Everything in Basic", "Room to try, tweak and try again until it looks exactly right", "2.5 times the credits of Basic"],
  studio: ["Everything in Pro", "Big scenes, series, a whole channel", "5 times the credits of Basic", "Be first: new features before everyone else"],
};
const PLAN_FOR: Record<PaidPlanId, string> = { starter: "For getting started", creator: "For regular animators", studio: "For big projects" };
const PLAN_BADGE: Partial<Record<PaidPlanId, string>> = { creator: "Most popular", studio: "Most power" };
const PLAN_TIER: Record<PaidPlanId, string> = { starter: "1", creator: "2", studio: "3" };
const usd = (value: number) => (Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`);
const cycleName = PLAN_CYCLE === "week" ? "Weekly" : "Monthly";

export function PlansScreen() {
  const { status } = useAccountPlan();
  const [factsVersion, setFactsVersion] = useState(0);
  const billing = useBillingInfo(factsVersion);
  const mode = billing.mode;
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(PLAN_CYCLE);
  const [busy] = useState<PaidPlanId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState({ first50: "", youtube: "" });
  // SPEC-0031: a code from a link (?code=) or typed before goes into its own box by itself; the prices show it.
  const { saved } = useSavedOffer();
  const [filledFrom, setFilledFrom] = useState("");
  if (saved && saved.code !== filledFrom) {
    setFilledFrom(saved.code);
    setCodes((now) => ({ ...now, [saved.offer]: now[saved.offer] || saved.code }));
  }
  const first50Ok = useCodeCheck(codes.first50) === "first50";
  const youtubeOk = useCodeCheck(codes.youtube) === "youtube";
  const [switchTo, setSwitchTo] = useState<{ plan: PaidPlanId; interval: BillingInterval } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payFor, setPayFor] = useState<PaymentFor | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const refreshAll = () => { setFactsVersion((value) => value + 1); window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT)); };

  // Back from Stripe's card page (Change card).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const back = takeCheckoutReturn("card");
      if (!back) return;
      if (back.result === "canceled" || !back.sessionId) { setNotice("No card was changed."); return; }
      setNotice("Saving your new card");
      postBilling<{ paymentProblem: boolean }>("/api/account/billing/card-done", { sessionId: back.sessionId })
        .then((result) => {
          setNotice(result.paymentProblem ? "Your new card is saved, but the payment still didn't go through. Try another card." : "Your new card is saved. Every payment uses it from now on.");
          forgetCheckoutReturn("card");
          refreshAll();
        })
        .catch((problem: unknown) => { setNotice(null); setError(problem instanceof Error ? problem.message : "Your new card couldn't be saved. Try again."); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Nov 21 (Arthur: "You never see Stripe"): a new card is typed in the app's own card dialog.
  const changeCard = () => { if (!actionBusy) { setError(null); setPayFor({ kind: "card" }); } };
  const setCancelled = async (cancel: boolean) => {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      const result = await postBilling<{ cancelAtPeriodEnd: boolean; endsAt: number | null }>("/api/account/billing/cancel", { cancel });
      setNotice(result.cancelAtPeriodEnd && result.endsAt
        ? `Your plan is cancelled. It keeps working until ${billingDay(result.endsAt)}, and you won't be charged again.`
        : "Your plan keeps going. Nothing else changed.");
      setCancelOpen(false);
      refreshAll();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That didn't work. Nothing changed. Try again.");
    } finally {
      setActionBusy(false);
    }
  };

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

  const choose = async (plan: PaidPlanId, interval: BillingInterval = billingInterval) => {
    if (!canPay(mode) || busy) return;
    // Already paying: switch right away, here (a preview first, nothing changes until "Switch now").
    if (payingNow) { setError(null); setSwitchTo({ plan, interval }); return; }
    // First plan: paid in the app's own card dialog (Nov 21: never a payment company's page).
    setError(null);
    if (first50Ok) saveCode(codes.first50); else if (youtubeOk) saveCode(codes.youtube);
    setPayFor({ kind: "plan", plan, interval, codes: { first50: codes.first50.trim() || undefined, youtube: codes.youtube.trim() || undefined } });
  };

  const lead = !status ? " "
    : status.lockReason === "trial_ended" ? "Your free trial has ended. Pick a plan to keep animating. Your projects are safe."
    : status.lockReason === "plan_ended" ? "Your plan has ended. Pick a plan to keep animating. Your projects are safe."
    : status.lockReason === "no_trial" ? NO_TRIAL_MESSAGE
    : status.emailConfirmNeeded ? "Confirm your email address to start your free trial (the code is in the email we sent you), or pick a plan now."
    : status.aiLocked ? "A payment on your account is being checked by your bank, so the AI waits until that's settled. Your projects are safe."
    : status.paymentProblem ? `Your last payment didn't go through. Use Change card on your plan below and this ${CYCLE_WORD}'s credits come right away.`
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
        <header className={styles.head}>
          <div className={styles.headWords}>
            <p className={styles.lead}>{lead}</p>
            <h1 className={styles.title}>Choose your plan</h1>
            {facts && <p className={styles.facts}>{facts}</p>}
            {billing.notice && !notice && <p className={styles.notice} role="status">{billing.notice}</p>}
            {notice && <p className={styles.notice} role="status">{notice}</p>}
            {mode === "test" && <p className={styles.testMode}>Test mode: no real money is taken. Pay with the test card 4242 4242 4242 4242, any future date, any 3 numbers.</p>}
          </div>
          <div className={styles.intervals} role="group" aria-label={`Show prices for paying ${cycleName.toLowerCase()} or yearly`}>
            <button type="button" className={styles.interval} aria-pressed={billingInterval === PLAN_CYCLE} onClick={() => setBillingInterval(PLAN_CYCLE)}>{cycleName}</button>
            <button type="button" className={styles.interval} aria-pressed={billingInterval === "year"} onClick={() => setBillingInterval("year")}>Yearly <span>2 months free</span></button>
          </div>
        </header>

        {!payingNow && (first50Ok || youtubeOk) && <p className={styles.applied} role="status">
          <span aria-hidden="true">◆</span> {first50Ok ? "Beta price" : "YouTube price"} applied: <strong>{first50Ok ? normalizeCode(codes.first50) : normalizeCode(codes.youtube)}</strong> · {offerLine(first50Ok ? "first50" : "youtube")}
          {first50Ok && youtubeOk && billingInterval !== "year" && ` Plus your YouTube code: 30% off your first ${CYCLE_WORD}.`}
          {first50Ok && status?.plan === "trial" && !status.locked && <><br /><strong>{betaDeadlineLine(status.trialEndsAt ?? status.windowEnd)}</strong></>}
        </p>}
        {!payingNow && canPay(mode) && <DiscountCodes codes={codes} setCodes={setCodes} />}

        {status?.plan === "trial" && !status.locked && <div className={styles.trialCard}>
          <span className={styles.trialName}>Free trial</span>
          <span className={styles.yoursBadge}>Your plan</span>
          <span className={styles.trialMakes}>{ACCOUNT_PLANS.trial.about}</span>
          <span className={styles.trialFacts}>{status.creditsLeft.toLocaleString("en-US")} of {creditsText(status.creditsTotal)} left · ends {billingDay(status.windowEnd)}</span>
        </div>}

        <div className={styles.plans}>
          {PAID_PLAN_IDS.map((id) => {
            const plan = ACCOUNT_PLANS[id];
            const current = payingNow && status?.plan === id;
            // Arthur: your own plan always shows what YOU pay (each cycle or yearly), never the other price.
            const shownInterval = current ? status?.interval ?? PLAN_CYCLE : billingInterval;
            const price = shownInterval === "year" ? `${usd(plan.yearlyUsd)} a year` : `${usd(plan.monthlyUsd)} a ${CYCLE_WORD}`;
            const amount = usd(shownInterval === "year" ? plan.yearlyUsd : plan.monthlyUsd);
            const deal = current || payingNow ? null : offerPrice(id, shownInterval, offerFromCodes({ first50: first50Ok, youtube: youtubeOk }, shownInterval));
            const body = (
              <>
                <span className={styles.planTop}>
                  <span className={styles.planName}>{plan.label}</span>
                  {current ? <span className={styles.yoursBadge}>Your plan</span> : deal ? <span className={`${styles.badge} ${styles.dealBadge}`}>{deal.badge}</span> : PLAN_BADGE[id] && <span className={styles.badge}>{PLAN_BADGE[id]}</span>}
                </span>
                <span className={styles.planFor}>{PLAN_FOR[id]}</span>
                <span className={styles.price}>{deal && <s className={styles.was} aria-label={`was ${amount}`}>{amount}</s>}<strong>{deal ? offerMoney(deal.firstCents) : amount}</strong><small>{shownInterval === "year" ? "a year" : `a ${CYCLE_WORD}`}</small></span>
                {deal && <span className={styles.dealThen}>{deal.then}</span>}
                <span className={styles.allowance}><strong>{creditsText(plan.credits)}</strong><small>every {CYCLE_WORD}</small><small className={styles.allowanceMakes}>{plan.about}</small></span>
                <ul>{PLAN_POINTS[id].map((point) => <li key={point}>{point}</li>)}</ul>
              </>
            );
            if (current) {
              return (
                <div key={id} id="manage" className={`${styles.plan} ${styles.current}`} data-plan={id} data-tier={PLAN_TIER[id]}>
                  {body}
                  <span className={styles.yours}>{status?.cancelAtPeriodEnd
                    ? `Cancelled · works until ${billingDay(status.refillsAt ?? status.windowEnd)}`
                    : `You pay ${status?.interval === "year" ? "yearly" : cycleName.toLowerCase()}`}</span>
                  <div className={styles.planActions}>
                    {status && status.interval !== billingInterval && !status.cancelAtPeriodEnd && canPay(mode) &&
                      <button type="button" className={`${styles.manage} ${styles.managePrimary}`} disabled={actionBusy} onClick={() => void choose(id, billingInterval)}>
                        Switch to {billingInterval === "year" ? "yearly" : cycleName.toLowerCase()}
                      </button>}
                    {status?.cancelAtPeriodEnd
                      ? <button type="button" className={`${styles.manage} ${styles.managePrimary}`} disabled={actionBusy} onClick={() => void setCancelled(false)}>Keep my plan</button>
                      : null}
                    <button type="button" className={styles.manage} disabled={actionBusy || !canPay(mode)} onClick={() => void changeCard()}>{actionBusy ? "Opening" : "Change card"}</button>
                    {!status?.cancelAtPeriodEnd && <button type="button" className={styles.manageQuiet} disabled={actionBusy} onClick={() => setCancelOpen(true)}>Cancel plan</button>}
                  </div>
                </div>
              );
            }
            const label = mode === "off" ? "Not available right now"
              : busy === id ? "Opening"
              : payingNow ? `Switch to ${plan.label}`
              : `Choose ${plan.label}`;
            return (
              // Nov 21 (Arthur): the card itself never lights up; only its button, when the pointer is on the button.
              // Buttons by level: Basic = outline, Pro = gray, Creator = blue.
              <div key={id} data-plan={id} data-tier={PLAN_TIER[id]} className={styles.plan}>
                {body}
                <button type="button" className={`${styles.choose} ${id === "starter" ? styles.chooseOutline : id === "creator" ? styles.chooseGray : styles.chooseBlue}`}
                  disabled={!canPay(mode) || busy !== null} onClick={() => void choose(id)}
                  aria-label={`${label}, ${deal ? `beta price ${offerMoney(deal.firstCents)}${shownInterval === "year" ? " a year" : ` a ${CYCLE_WORD}`}, ${deal.then}` : price}, ${creditsText(plan.credits)} every ${CYCLE_WORD}`}>{label}</button>
              </div>
            );
          })}
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        {/* SPEC-0031: the mini sales page (what you get, what animators say, the promises). Words: salesCopy.ts. */}
        <div className={styles.recapWrap}><SalesRecap /></div>
        <p className={`${styles.note} ${styles.recapNote}`}>Credits refill every {CYCLE_WORD} on the day your plan started, once that payment goes through. Leftovers don&apos;t roll over; extra packs never expire. A switch happens right away with the new plan&apos;s full credits.</p>
      </div>
      {payFor && <PaymentDialog payFor={payFor} onClose={() => setPayFor(null)} onDone={(words) => { setPayFor(null); setNotice(words); refreshAll(); }} />}
      {switchTo && status && <SwitchDialog target={switchTo} current={status.label} onClose={() => setSwitchTo(null)}
        onDone={(words) => { setSwitchTo(null); setNotice(words); refreshAll(); }} />}
      {cancelOpen && status && <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" aria-labelledby="cancel-title" onClick={(event) => { if (event.target === event.currentTarget) setCancelOpen(false); }}>
        <div className={styles.dialog}>
          <h2 id="cancel-title" className={styles.dialogTitle}>Cancel your {status.label} plan?</h2>
          <p className={styles.dialogText}>It keeps working until {billingDay(status.refillsAt ?? status.windowEnd)}, with the credits you have now. After that it stops and you&apos;re never charged again. Your projects stay safe.</p>
          <div className={styles.dialogButtons}>
            <button type="button" className={styles.dialogDanger} disabled={actionBusy} onClick={() => void setCancelled(true)}>{actionBusy ? "Cancelling" : "Cancel plan"}</button>
            <button type="button" className={styles.dialogPlain} disabled={actionBusy} onClick={() => setCancelOpen(false)}>Keep my plan</button>
          </div>
        </div>
      </div>}
    </main>
  );
}

type SwitchPreview = { plan: PaidPlanId; interval: BillingInterval; label: string; credits: number; chargeCents: number;
  refundCents: number; paidCents: number; feeCents: number; creditsPaidFor: number; unusedCredits: number; packCredits: number };

/** Switching plans (Nov 21, Arthur: "If I want to switch right now, I want that to be possible. I don't want it scheduled."):
 *  first exactly what happens (what is paid today, the new credits, what comes back), then one button. Nothing changes before it. */
function SwitchDialog({ target, current, onClose, onDone }: {
  target: { plan: PaidPlanId; interval: BillingInterval }; current: string; onClose: () => void; onDone: (words: string) => void;
}) {
  const [preview, setPreview] = useState<SwitchPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");   // (Nov 22) a switch that charges the saved card needs the account's password
  useEffect(() => {
    let alive = true;
    postBilling<{ preview: SwitchPreview }>("/api/account/billing/switch", { plan: target.plan, interval: target.interval })
      .then((result) => { if (alive) setPreview(result.preview); })
      .catch((error: unknown) => { if (alive) setProblem(error instanceof Error ? error.message : "The switch couldn't be worked out. Nothing changed. Try again."); });
    return () => { alive = false; };
  }, [target.plan, target.interval]);
  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { switched } = await postBilling<{ switched: { label: string; credits: number; paidCents: number; refundCents: number } }>(
        "/api/account/billing/switch", { plan: target.plan, interval: target.interval, confirm: true, password });
      onDone(`You're on ${switched.label}! ${creditsText(switched.credits)} are ready.${switched.refundCents > 0 ? ` ${dollarsText(switched.refundCents)} of your last payment is on its way back to your card.` : ""}`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The switch didn't happen. Nothing changed. Try again.");
      setBusy(false);
    }
  };
  const nextPayment = (() => {
    const date = new Date();
    if (target.interval === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
    else if (target.interval === "week") date.setUTCDate(date.getUTCDate() + 7);
    else date.setUTCMonth(date.getUTCMonth() + 1);
    return billingDay(date.getTime());
  })();
  const label = ACCOUNT_PLANS[target.plan].label;
  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" aria-labelledby="switch-title" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className={styles.dialog}>
        <h2 id="switch-title" className={styles.dialogTitle}>Switch from {current} to {label} now?</h2>
        {!preview && !problem && <p className={styles.dialogText}>Working out the price</p>}
        {preview && <>
          <dl className={styles.switchFacts}>
            <div><dt>You pay today</dt><dd>{dollarsText(preview.chargeCents)}</dd></div>
            <div><dt>You get</dt><dd>{creditsText(preview.credits)}, starting today</dd></div>
            <div><dt>Next payment</dt><dd>{nextPayment}</dd></div>
            {preview.refundCents > 0 && <div><dt>Back to your card</dt><dd>{dollarsText(preview.refundCents)}</dd></div>}
          </dl>
          {/* Dad, Nov 26: a switch gives back only the unused part of the old payment (never the used credits). */}
          {preview.refundCents > 0 && <p className={styles.dialogText}>From your {current} payment: you paid {dollarsText(preview.paidCents)} for {creditsText(preview.creditsPaidFor)} and {creditsText(preview.unusedCredits)} are still unused, so that part of the payment comes back, minus the same part of the {dollarsText(preview.feeCents)} card fee: {dollarsText(preview.refundCents)}. Refunds reach your card in about 5 to 10 days.</p>}
          {preview.unusedCredits <= 0 && preview.paidCents > 0 && <p className={styles.dialogText}>You already used the credits of your {current} payment, so nothing of it comes back.</p>}
          {preview.packCredits > 0 && <p className={styles.dialogText}>Your {creditsText(preview.packCredits)} from packs stay.</p>}
          <p className={styles.dialogText}>It&apos;s paid with the card you already use. If the card is declined, nothing changes.</p>
          {preview.chargeCents > 0 && <label className={styles.dialogLabel}>Your Diamond Animator password
            <input className={styles.dialogInput} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" maxLength={256}
              onKeyDown={(event) => { if (event.key === "Enter" && password && !busy) void confirm(); }} />
            <span className={styles.dialogHint}>For your safety, paying with your saved card always asks for your password.</span>
          </label>}
        </>}
        {problem && <p role="alert" className={styles.error}>{problem}</p>}
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.dialogPrimary} disabled={!preview || busy || (preview.chargeCents > 0 && !password)} onClick={() => void confirm()}>
            {busy ? "Switching" : preview ? `Switch now · pay ${dollarsText(preview.chargeCents)}` : "Switch now"}
          </button>
          <button type="button" className={styles.dialogPlain} disabled={busy} onClick={onClose}>Not now</button>
        </div>
      </div>
    </div>
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
