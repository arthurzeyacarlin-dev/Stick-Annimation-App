"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { topUpPacksFor, type TopUpPackId } from "@/src/lib/account/plans";
import { creditsText } from "@/src/lib/account/credits";
import { canPay, forgetCheckoutReturn, goToStripe, postBilling, takeCheckoutReturn, useBillingMode } from "./billingClient";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./Billing.module.css";

// "Buy extra credits" on the AI Dashboard (/credits). Members with a paid plan can buy one of the same 3 packs (dad, Nov 17).
// A pack opens Stripe's page; coming back with /credits?topup=done&session_id=… checks with Stripe, which adds the credits once.

export function BuyCreditsPanel() {
  const { status } = useAccountPlan();
  const mode = useBillingMode();
  const [busy, setBusy] = useState<TopUpPackId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe's page (the address is cleaned right away, and checking again never adds credits twice).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const back = takeCheckoutReturn("topup");
      if (!back) return;
      if (back.result === "canceled" || !back.sessionId) { setNotice("No payment was made."); return; }
      setNotice("Adding your credits");
      postBilling<{ status: { kind: string; credits: number } }>("/api/account/billing/complete", { sessionId: back.sessionId })
        .then(({ status: result }) => {
          setNotice(`${creditsText(result.credits)} added. They never expire.`);
          forgetCheckoutReturn("topup");
          window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
        })
        .catch((problem: unknown) => {
          setNotice(null);
          setError(problem instanceof Error ? problem.message : "Your credits couldn't be added yet. Try again in a moment.");
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const buy = async (pack: TopUpPackId) => {
    if (busy || !canPay(mode)) return;
    setBusy(pack);
    setError(null);
    try {
      const { url } = await postBilling<{ url: string }>("/api/account/billing/topup", { pack });
      goToStripe(url);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That pack couldn't be bought. Nothing was charged. Try again.");
      setBusy(null);
    }
  };

  const member = Boolean(status && status.plan !== "trial" && !status.locked && status.billingStatus === "active");
  const paymentProblem = Boolean(status?.paymentProblem);
  const canBuy = member && !paymentProblem && canPay(mode);
  const packs = status ? topUpPacksFor(status.plan) : [];

  return (
    <section className={styles.panel} aria-labelledby="buy-credits-heading">
      <h2 id="buy-credits-heading" className={styles.heading}>Buy extra credits</h2>
      {member && <p className={styles.text}>Ran out before your refill? Buy an extra pack. Pack credits never expire and are used after your plan&apos;s credits.</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      {packs.length > 0 && <div className={styles.packGrid}>
        {packs.map((pack) => (
          <button key={pack.id} type="button" className={styles.pack} disabled={!canBuy || busy !== null} onClick={() => void buy(pack.id)}
            aria-label={`Buy ${creditsText(pack.credits)} for ${pack.price}`}>
            <strong>{busy === pack.id ? "Opening Stripe" : creditsText(pack.credits)}</strong>
            <span className={styles.packPrice}>{pack.price}</span>
          </button>
        ))}
      </div>}
      {!status ? null : paymentProblem ? (
        <p className={styles.text}>Your last payment didn&apos;t go through. Update your card in Manage plan, then you can buy a pack.</p>
      ) : !member ? (
        <p className={styles.text}>Extra packs are for plan members. <Link href="/plans" prefetch={false} className={styles.link}>Choose a plan</Link></p>
      ) : mode === "off" ? <p className={styles.text}>Buying packs isn&apos;t available right now.</p> : null}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  );
}
