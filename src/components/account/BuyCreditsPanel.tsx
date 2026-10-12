"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { topUpPacksFor, type TopUpPackId } from "@/src/lib/account/plans";
import { goToStripe, postBilling, takeCheckoutReturn, TEST_CARD_NOTE, useBillingMode } from "./billingClient";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./Billing.module.css";

// SPEC-0020 Phase 9: "Buy extra credits" for the AI Dashboard (/credits). Members with a paid plan can buy.
// A pack opens Stripe's page; coming back with /credits?topup=done&session_id=… adds the credits (once).
const number = (value: number) => value.toLocaleString("en-US");

export function BuyCreditsPanel() {
  const { status } = useAccountPlan();
  const mode = useBillingMode();
  const [busy, setBusy] = useState<TopUpPackId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe's page (the address is cleaned right away, and adding credits is safe to repeat).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const back = takeCheckoutReturn("topup");
      if (!back) return;
      if (back.result === "canceled" || !back.sessionId) { setNotice("No payment was made."); return; }
      setNotice("Adding your credits…");
      postBilling<{ status: { kind: string; credits: number } }>("/api/account/billing/complete", { sessionId: back.sessionId })
        .then(({ status: result }) => {
          setNotice(`${number(result.credits)} extra credits added.`);
          window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
        })
        .catch((problem: unknown) => {
          setNotice(null);
          setError(problem instanceof Error ? problem.message : "Your credits couldn't be added. Try again.");
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const buy = async (pack: TopUpPackId) => {
    if (busy || mode !== "test") return;
    setBusy(pack);
    setError(null);
    try {
      const { url } = await postBilling<{ url: string }>("/api/account/billing/topup", { pack });
      goToStripe(url);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That pack couldn't be bought. Try again.");
      setBusy(null);
    }
  };

  const member = Boolean(status && status.plan !== "trial" && !status.locked && status.billingStatus === "active");
  const paymentProblem = Boolean(status?.paymentProblem);
  const canBuy = member && !paymentProblem && mode === "test";
  const packs = status ? topUpPacksFor(status.plan) : [];

  // Arthur (Phase 9 review): each plan shows its own three packs (the biggest = half its monthly credits).
  return (
    <section className={styles.panel} aria-labelledby="buy-credits-heading">
      <h2 id="buy-credits-heading" className={styles.heading}>Buy extra credits</h2>
      {member && <p className={styles.text}>Ran out before your refill? Buy extra AI credits for your plan. They stay until you use them.</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      {canBuy && <p className={styles.testMode} role="note">{TEST_CARD_NOTE}</p>}
      {packs.length > 0 && <div className={styles.packGrid}>
        {packs.map((pack) => (
          <button key={pack.id} type="button" className={styles.pack} disabled={!canBuy || busy !== null} onClick={() => void buy(pack.id)}
            aria-label={`Buy ${number(pack.credits)} extra credits for ${pack.price}`}>
            <strong>{busy === pack.id ? "Opening Stripe…" : `${number(pack.credits)} credits`}</strong>
            <span className={styles.packPrice}>{pack.price}</span>
          </button>
        ))}
      </div>}
      {!status ? null : paymentProblem ? (
        <p className={styles.text}>Your last payment didn&apos;t go through. Update your card in Manage plan, then you can buy extra credits.</p>
      ) : !member ? (
        <p className={styles.text}>Extra credits are for plan members. <Link href="/plans" prefetch={false} className={styles.link}>Choose a plan</Link></p>
      ) : mode === "off" ? <p className={styles.text}>Payments open soon.</p> : null}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  );
}
