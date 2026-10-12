"use client";

import Link from "next/link";
import { useAccountPlan } from "@/src/components/account/useAccountPlan";
import { TestPlanControls } from "@/src/components/ai-dashboard/TestPlanControls";

// SPEC-0020 Phase 2 + 9 (development only): pretend clock, plan switch, credits, refill timing, pretend AI use and
// payment problems, so every state can be tried without waiting, paying or calling the AI. The same buttons sit at
// the bottom of the AI Dashboard (development only).

const number = (value: number) => value.toLocaleString("en-US");

export function TestPlanSwitch() {
  const { status, refresh } = useAccountPlan();
  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px", background: "var(--da-page)", color: "var(--da-text)", font: "14px/1.55 system-ui, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 18 }}>
        <div>
          <p style={{ margin: 0, color: "var(--da-label)", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>TEST CONTROLS — not real. Nothing is charged and no AI runs.</p>
          <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>Plans and credits</h1>
          <p style={{ margin: 0, color: "var(--da-text-3)" }}>Developer only. <Link href="/" style={{ color: "var(--da-link)" }}>Back to Home</Link> · <Link href="/credits" style={{ color: "var(--da-link)" }}>AI Dashboard</Link></p>
        </div>
        <p style={{ margin: 0, padding: "12px 0", borderTop: "1px solid var(--da-line)", borderBottom: "1px solid var(--da-line)" }}>
          {status ? <>
            <strong>{status.label}</strong>{status.interval === "year" ? " · Yearly" : ""} · {number(status.creditsLeft)} credits left ({number(status.planCreditsLeft)} of {number(status.creditsTotal)} plan + {number(status.topUpCredits)} extra)
            {status.trialDaysLeft !== null ? ` · ${status.trialDaysLeft} days left` : ""}
            {status.paymentProblem ? status.aiLocked ? " · PAYMENT FAILED (AI waits)" : " · PAYMENT FAILED (warning)" : ""}
            {status.locked ? ` · LOCKED (${status.lockReason === "plan_ended" ? "plan ended" : "trial ended"})` : ""}
          </> : "Loading…"}
        </p>
        <TestPlanControls onChanged={refresh} />
      </div>
    </main>
  );
}
