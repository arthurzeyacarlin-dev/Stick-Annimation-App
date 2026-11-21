"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { topUpPacksFor, type TopUpPackId } from "@/src/lib/account/plans";
import { creditsText } from "@/src/lib/account/credits";
import { canPay, forgetCheckoutReturn, postBilling, takeCheckoutReturn, useBillingMode } from "./billingClient";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./Billing.module.css";
import { PaymentDialog } from "./PaymentDialog";

// "Buy extra credits" on the AI Dashboard (/credits). Members with a paid plan buy one of their plan's 3 packs.
// Nov 21 (Arthur: "You never see Stripe"): paid in the app's own card dialog; the server checks it and adds the credits once.

const PACK_NAMES = ["Top-up", "Boost", "Power pack"] as const;

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

  const buy = (pack: TopUpPackId) => {
    if (busy || !canPay(mode)) return;
    setError(null);
    setNotice(null);
    setBusy(pack);
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
        {packs.map((pack, index) => (
          // Nov 21 (Arthur): the packs aren't equal either: the small top-up is plain, the biggest pack looks the most powerful.
          // Nov 21 (Arthur): the card never lights up; only its button. Buttons by level: outline, gray, blue (like the plans).
          <div key={pack.id} className={styles.pack} data-tier={String(index + 1)}>
            <span className={styles.packTop}>
              <span className={styles.packName}>{PACK_NAMES[index]}</span>
              {index === packs.length - 1 && <span className={styles.packBadge}>Most credits</span>}
            </span>
            <span className={styles.packCredits}><strong>{pack.credits.toLocaleString("en-US")}</strong><small>credits</small></span>
            <span className={styles.packNote}>{status && status.creditsTotal > 0 ? `About ${Math.max(1, Math.round((pack.credits / status.creditsTotal) * 100))}% of your ${status.label} refill · never expire` : "Never expire"}</span>
            <button type="button" className={`${styles.packBuy} ${index === 0 ? styles.packBuyOutline : index === packs.length - 1 ? styles.packBuyBlue : styles.packBuyGray}`}
              disabled={!canBuy || busy !== null} onClick={() => buy(pack.id)} aria-label={`Buy ${creditsText(pack.credits)} for ${pack.price}`}>
              {`Buy for ${pack.price}`}
            </button>
          </div>
        ))}
      </div>}
      {!status ? null : paymentProblem ? (
        <p className={styles.text}>Your last payment didn&apos;t go through. Update your card in Manage plan, then you can buy a pack.</p>
      ) : !member ? (
        <p className={styles.text}>Extra packs are for plan members. <Link href="/plans" prefetch={false} className={styles.link}>Choose a plan</Link></p>
      ) : mode === "off" ? <p className={styles.text}>Buying packs isn&apos;t available right now.</p> : null}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {busy && <PaymentDialog payFor={{ kind: "pack", pack: busy }} onClose={() => setBusy(null)}
        onDone={(words) => { setBusy(null); setNotice(words); window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT)); }} />}
    </section>
  );
}
