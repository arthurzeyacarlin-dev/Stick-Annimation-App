"use client";

import { useEffect, useState } from "react";

// Small browser helpers for Stripe billing. The browser never sees the Stripe key: it only asks the app's own
// /api/account/billing/* routes, which answer with a Stripe page address to go to.
export type BillingMode = "test" | "live" | "off";
export type BillingInfo = {
  mode: BillingMode | null;
  /** Stripe's own facts (Nov 20): the last payment that went through, when the next one is due, and any notice. */
  lastPayment: { cents: number; at: number; kind: "plan" | "pack" } | null;
  nextPaymentAt: number | null;
  notice: string | null;
};

/** Payments can be made ("test" = Stripe's test mode with fake cards; "live" = real money). */
export const canPay = (mode: BillingMode | null) => mode === "test" || mode === "live";

/** The billing mode and Stripe's facts for this account; null mode while loading. `version` re-reads them. */
export function useBillingInfo(version = 0): BillingInfo {
  const [info, setInfo] = useState<BillingInfo>({ mode: null, lastPayment: null, nextPaymentAt: null, notice: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {   // read again whenever the plan changes (a payment confirmed, back from Stripe's page)
    const again = () => setTick((value) => value + 1);
    window.addEventListener("diamond-account-plan-changed", again);
    return () => window.removeEventListener("diamond-account-plan-changed", again);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/account/plan", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { billing?: Partial<BillingInfo> & { mode?: string } } | null) => {
        if (!alive) return;
        const billing = body?.billing ?? {};
        setInfo({
          mode: billing.mode === "test" || billing.mode === "live" ? billing.mode : "off",
          lastPayment: billing.lastPayment ?? null, nextPaymentAt: billing.nextPaymentAt ?? null, notice: billing.notice ?? null,
        });
      })
      .catch(() => { if (alive) setInfo((current) => ({ ...current, mode: "off" })); });
    return () => { alive = false; };
  }, [version, tick]);
  return info;
}

/** "test", "live" or "off" (null while loading). */
export const useBillingMode = () => useBillingInfo().mode;

/** POSTs to a billing route; returns its JSON or throws an Error whose message is safe to show. */
export async function postBilling<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new Error("The app couldn't reach the server. Nothing was charged. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || "Something went wrong. Nothing was charged. Try again in a moment.");
  return data;
}

type CheckoutReturn = { result: "done" | "canceled"; sessionId: string | null };

/** Reads (and then removes) the ?<flag>=done|canceled&session_id=… that Stripe's page sends people back with.
 *  (Nov 20, live test) the app's loading screen can re-open the page right after the return, after the address was already cleaned:
 *  the return is kept for one minute in this tab's sessionStorage, so the re-opened page still confirms it and says so.
 *  Confirming twice is always safe (the server applies a payment exactly once). */
export function takeCheckoutReturn(flag: "checkout" | "topup"): CheckoutReturn | null {
  const key = `diamond-checkout-return-${flag}`;
  const params = new URLSearchParams(window.location.search);
  const result = params.get(flag);
  if (result !== "done" && result !== "canceled") {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as (CheckoutReturn & { at: number }) | null;
      window.sessionStorage.removeItem(key);
      return saved && Date.now() - saved.at < 60_000 ? { result: saved.result, sessionId: saved.sessionId } : null;
    } catch { return null; }
  }
  const sessionId = params.get("session_id");
  try { window.sessionStorage.setItem(key, JSON.stringify({ result, sessionId, at: Date.now() })); } catch { /* storage off: the first page still confirms it */ }
  params.delete(flag);
  params.delete("session_id");
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  return { result, sessionId };
}

/** The return was confirmed and said: forget it (so it is never said again). */
export function forgetCheckoutReturn(flag: "checkout" | "topup") {
  try { window.sessionStorage.removeItem(`diamond-checkout-return-${flag}`); } catch { /* nothing kept */ }
}

/** Goes to Stripe's page (only ever an https address on stripe.com). */
export function goToStripe(url: string) {
  const target = new URL(url);
  if (target.protocol !== "https:" || !(target.hostname === "stripe.com" || target.hostname.endsWith(".stripe.com"))) {
    throw new Error("The payment page address looked wrong, so it wasn't opened. Nothing was charged. Try again.");
  }
  window.location.assign(target.toString());
}

/** "November 9" (UTC, like Stripe's billing dates). */
export const billingDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
