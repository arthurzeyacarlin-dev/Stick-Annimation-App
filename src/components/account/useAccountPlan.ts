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
      const response = await fetch("/api/account/plan", { cache: "no-store" });
      if (!response.ok) throw new Error("plan_unavailable");
      const body = await response.json() as { schema?: string; status?: AccountPlanStatus };
      if (body.schema !== "diamond-account-plan/v1" || !body.status) throw new Error("plan_invalid");
      setStatus(body.status);
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

  return { status, failed, refresh };
}
