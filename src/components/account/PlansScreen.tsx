"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCOUNT_PLANS, PAID_PLAN_IDS, type AccountPlanId } from "@/src/lib/account/plans";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "./useAccountPlan";
import styles from "./PlansScreen.module.css";

// SPEC-0020 Phase 2: the plans page. Real payments (Stripe, set up by dad) arrive in SPEC-0020 Phase 5.
// Until then, in the test copy (development) "Choose" switches the plan with no payment — loudly labeled;
// anywhere else the buttons say payments open soon and do nothing.
const TEST_MODE = process.env.NODE_ENV === "development";
const PLAN_POINTS: Record<(typeof PAID_PLAN_IDS)[number], string[]> = {
  starter: ["300 AI credits every month", "About 10 AI Animator messages a day", "All drawing and animation tools"],
  creator: ["1,200 AI credits every month", "About 40 AI Animator messages a day", "Most popular"],
  studio: ["3,000 AI credits every month", "About 100 AI Animator messages a day", "For big projects"],
};
const number = (value: number) => value.toLocaleString("en-US");

export function PlansScreen() {
  const router = useRouter();
  const { status } = useAccountPlan();
  const [busy, setBusy] = useState<AccountPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (plan: AccountPlanId) => {
    if (!TEST_MODE || busy) return;
    setBusy(plan);
    setError(null);
    try {
      const response = await fetch("/api/dev/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: plan }) });
      if (!response.ok) throw new Error("plan_switch_failed");
      window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
      router.push("/credits");
      router.refresh();
    } catch {
      setError("That plan couldn't be chosen. Try again.");
      setBusy(null);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <p className={styles.eyebrow}>Plans</p>
        <h1 className={styles.title}>Choose your plan</h1>
        <p className={styles.lead}>
          {status?.locked ? "Your free trial has ended. Pick a plan to keep animating. Your projects are safe."
            : status ? `You're on ${status.plan === "trial" ? "the free trial" : `the ${status.label} plan`}.` : " "}
        </p>
        {TEST_MODE && <p className={styles.testMode} role="note"><strong>Test mode:</strong> choosing a plan here switches it right away with no payment. Real payments open later (SPEC-0020 Phase 5).</p>}
        <div className={styles.plans}>
          {PAID_PLAN_IDS.map((id) => {
            const plan = ACCOUNT_PLANS[id];
            const current = status?.plan === id;
            return (
              <button key={id} type="button" className={`${styles.plan}${id === "creator" ? ` ${styles.popular}` : ""}${current ? ` ${styles.current}` : ""}`}
                disabled={!TEST_MODE || current || busy !== null} onClick={() => void choose(id)} aria-label={`${current ? "Your plan" : "Choose"} ${plan.label}, ${plan.price}, ${number(plan.credits)} AI credits every month`}>
                <span className={styles.planName}>{plan.label}</span>
                <span className={styles.price}>{plan.price}</span>
                <ul>{PLAN_POINTS[id].map((point) => <li key={point}>{point}</li>)}</ul>
                <span className={styles.choose}>{current ? "Your plan" : busy === id ? "Choosing…" : TEST_MODE ? `Choose ${plan.label}` : "Payments open soon"}</span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={styles.note}>1 credit = 1 message to the AI Animator that gets an answer. Credits refill every month on the day your plan started.</p>
      </div>
    </main>
  );
}
