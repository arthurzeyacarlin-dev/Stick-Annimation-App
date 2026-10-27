"use client";

import { useEffect, useState } from "react";

// SPEC-0020 Phase 9: small browser helpers for Stripe billing (test mode). The browser never sees the Stripe key:
// it only asks the app's own /api/account/billing/* routes, which answer with a Stripe page address to go to.
export type BillingMode = "test" | "off";

/** "test" when payments run in Stripe test mode, "off" when they aren't set up yet, null while loading. */
export function useBillingMode() {
  const [mode, setMode] = useState<BillingMode | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/account/plan", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { billing?: { mode?: string } } | null) => { if (alive) setMode(body?.billing?.mode === "test" ? "test" : "off"); })
      .catch(() => { if (alive) setMode("off"); });
    return () => { alive = false; };
  }, []);
  return mode;
}

/** POSTs to a billing route; returns its JSON or throws an Error whose message is safe to show. */
export async function postBilling<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new Error("The app couldn't reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || "Something went wrong. Try again in a moment.");
  return data;
}

/** Reads (and then removes) the ?<flag>=done|canceled&session_id=… that Stripe's page sends people back with. */
export function takeCheckoutReturn(flag: "checkout" | "topup"): { result: "done" | "canceled"; sessionId: string | null } | null {
  const params = new URLSearchParams(window.location.search);
  const result = params.get(flag);
  if (result !== "done" && result !== "canceled") return null;
  const sessionId = params.get("session_id");
  params.delete(flag);
  params.delete("session_id");
  const query = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  return { result, sessionId };
}

/** Goes to Stripe's page (only ever an https address on stripe.com). */
export function goToStripe(url: string) {
  const target = new URL(url);
  if (target.protocol !== "https:" || !(target.hostname === "stripe.com" || target.hostname.endsWith(".stripe.com"))) {
    throw new Error("The payment page address looked wrong, so it wasn't opened. Try again.");
  }
  window.location.assign(target.toString());
}
