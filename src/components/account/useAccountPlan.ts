"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountPlanStatus } from "@/src/lib/account/plans";

// SPEC-0020 Phase 2: the signed-in account's plan and credits, kept fresh while the page is open
// (on focus, every 15 seconds while visible, and right after the test switch changes it).
export const ACCOUNT_PLAN_CHANGED_EVENT = "diamond-account-plan-changed";
const REFRESH_MS = 15_000;

export function useAccountPlan() {
  const [status, setStatus] = useState<AccountPlanStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // (Nov 20) back from Stripe's page (?portal=back or ?checkout=done): ask the server to check with Stripe right now
      const params = new URLSearchParams(window.location.search);
      const fromPortal = params.get("portal") === "back";
      const back = fromPortal || params.get("checkout") === "done" || params.get("topup") === "done";
      if (fromPortal) {
        params.delete("portal");
        const query = params.toString();
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      }
      const response = await fetch(back ? "/api/account/plan?fresh=1" : "/api/account/plan", { cache: "no-store" });
      if (!response.ok) throw new Error("plan_unavailable");
      const body = await response.json() as { schema?: string; status?: AccountPlanStatus };
      if (body.schema !== "diamond-account-plan/v1" || !body.status) throw new Error("plan_invalid");
      setStatus(body.status);
      setFailed(false);
      if (fromPortal) window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));   // once (the address is already cleaned): every other reader reads it again
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(ACCOUNT_PLAN_CHANGED_EVENT, onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(ACCOUNT_PLAN_CHANGED_EVENT, onFocus);
    };
  }, [refresh]);

  return { status, failed, refresh };
}

/** One row of "Used this month": credits spent on one kind of AI action (chat, edit, simple, big). */
export type CreditUseRow = { kind: string; credits: number; actions: number };

// SPEC-0020 Phase 9: the credits spent per AI action kind in the current window (AI Dashboard "Used this month"),
// refreshed like the plan (on focus, every 15 seconds while visible, and right after the test switch).
export function useCreditUseByKind() {
  const [rows, setRows] = useState<CreditUseRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/credit-use", { cache: "no-store" });
      if (!response.ok) throw new Error("credit_use_unavailable");
      const body = await response.json() as { schema?: string; rows?: CreditUseRow[] };
      if (body.schema !== "diamond-account-credit-use/v1" || !Array.isArray(body.rows)) throw new Error("credit_use_invalid");
      setRows(body.rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(ACCOUNT_PLAN_CHANGED_EVENT, onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(ACCOUNT_PLAN_CHANGED_EVENT, onFocus);
    };
  }, [refresh]);

  return { rows, failed, refresh };
}
