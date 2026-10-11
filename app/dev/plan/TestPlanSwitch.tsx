"use client";

import Link from "next/link";
import { useState } from "react";
import { ACCOUNT_PLAN_CHANGED_EVENT, useAccountPlan } from "@/src/components/account/useAccountPlan";

// SPEC-0020 Phase 2 (development only): pretend clock and plan switch, so the trial, the lock screen and
// "out of credits" can be tried without waiting 14 days or paying. Real plans come from payments (Phase 5).
const ACTIONS: { action: string; label: string; hint: string }[] = [
  { action: "trial_new", label: "Start a new trial", hint: "Day 1 of 14, 150 credits" },
  { action: "trial_day_13", label: "Trial day 13", hint: "2 days left" },
  { action: "trial_ended", label: "Trial ended (day 15)", hint: "The app locks" },
  { action: "low_credits", label: "Only 5 credits left", hint: "Counter turns amber" },
  { action: "no_credits", label: "Use up all credits", hint: "The AI Animator stops" },
  { action: "starter", label: "Switch to Starter", hint: "300 credits a month" },
  { action: "creator", label: "Switch to Creator", hint: "1,200 credits a month" },
  { action: "studio", label: "Switch to Studio", hint: "3,000 credits a month" },
];

const box: React.CSSProperties = { padding: 16, border: "1px solid #163058", borderRadius: 12, background: "#071120" };

export function TestPlanSwitch() {
  const { status, refresh } = useAccountPlan();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: string) => {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/dev/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error("failed");
      await refresh();
      window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
    } catch {
      setError("That didn't work. Try again.");
    }
    setBusy(null);
  };
  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px", background: "#030914", color: "#f6f9ff", font: "14px/1.55 system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
        <div>
          <p style={{ margin: 0, color: "#7895bc", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Developer only · test switch</p>
          <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>Plans and credits</h1>
          <p style={{ margin: 0, color: "#a8bddd" }}>Pretend clock for the free trial and a plan switch. Nothing is charged. <Link href="/" style={{ color: "#8cbbf3" }}>Back to Home</Link></p>
        </div>
        <div style={box}>
          {status ? (
            <span><strong>{status.label}</strong> · {status.creditsLeft.toLocaleString("en-US")} of {status.creditsTotal.toLocaleString("en-US")} credits left
              {status.trialDaysLeft !== null ? ` · ${status.trialDaysLeft} days left` : ""}{status.locked ? " · LOCKED" : ""}</span>
          ) : "Loading…"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {ACTIONS.map((item) => (
            <button key={item.action} type="button" disabled={busy !== null} onClick={() => void run(item.action)} className="dev-plan-button"
              style={{ ...box, display: "grid", gap: 2, textAlign: "left", color: "#f6f9ff", font: "inherit", cursor: "pointer" }}>
              <strong>{busy === item.action ? "Working…" : item.label}</strong>
              <span style={{ color: "#8fabd0", fontSize: 12 }}>{item.hint}</span>
            </button>
          ))}
        </div>
        {error && <p role="alert" style={{ color: "#ff8a95", margin: 0 }}>{error}</p>}
        <style>{`.dev-plan-button:hover:not(:disabled){background:#0066ff!important;border-color:#0066ff!important}.dev-plan-button:hover span{color:#fff!important}`}</style>
      </div>
    </main>
  );
}
