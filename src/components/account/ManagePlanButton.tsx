"use client";

import { useState } from "react";
import { goToStripe, postBilling } from "./billingClient";
import styles from "./Billing.module.css";

// SPEC-0020 Phase 9: opens Stripe's "Manage plan" page (switch plan, cancel at the end of the period, card, invoices).
// Stripe sends the person back to `returnTo` afterwards.
type ManagePlanButtonProps = { returnTo?: "/plans" | "/credits"; className?: string; children?: string; disabled?: boolean };

export function ManagePlanButton({ returnTo = "/credits", className, children = "Manage plan", disabled = false }: ManagePlanButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await postBilling<{ url: string }>("/api/account/billing/portal", { returnTo });
      goToStripe(url);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Manage plan couldn't open. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className ?? styles.button} disabled={disabled || busy} onClick={() => void open()}>
        {busy ? "Opening…" : children}
      </button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </>
  );
}
