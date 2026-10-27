"use client";

import { useState } from "react";
import { ACCOUNT_PLANS, AI_ACTION_CREDITS } from "@/src/lib/account/plans";
import type { AccountPlanStatus } from "@/src/lib/account/plans";
import { ACCOUNT_PLAN_CHANGED_EVENT } from "@/src/components/account/useAccountPlan";
import styles from "./TestPlanControls.module.css";

// SPEC-0020 Phase 9 (development only, Arthur's request): buttons that change THIS account's local plan record so
// every state of the AI Dashboard can be seen without real AI calls or real payments. The server refuses them
// outside development (/api/dev/plan answers 404). Used on /dev/plan and at the bottom of the AI Dashboard.

type TestButton = { action: string; label: string; hint: string };
const credits = (value: number) => `${value.toLocaleString("en-US")} credits`;

export const TEST_PLAN_GROUPS: { title: string; buttons: TestButton[] }[] = [
  {
    title: "Pretend I have a plan (not a trial)",
    buttons: [
      { action: "starter", label: `${ACCOUNT_PLANS.starter.label} plan`, hint: `${credits(ACCOUNT_PLANS.starter.credits)} a month · no payment` },
      { action: "creator", label: `${ACCOUNT_PLANS.creator.label} plan`, hint: `${credits(ACCOUNT_PLANS.creator.credits)} a month · no payment` },
      { action: "studio", label: `${ACCOUNT_PLANS.studio.label} plan`, hint: `${credits(ACCOUNT_PLANS.studio.credits)} a month · no payment` },
    ],
  },
  {
    title: "Pretend buy extra credits (plan members only, like the real thing)",
    buttons: [
      { action: "buy_small", label: "Buy the small pack", hint: "Your plan's smallest · no Stripe, no money" },
      { action: "buy_medium", label: "Buy the middle pack", hint: "No Stripe, no money" },
      { action: "buy_large", label: "Buy the big pack", hint: "Half your plan's credits · no Stripe, no money" },
    ],
  },
  {
    title: "Credits",
    buttons: [
      { action: "plus_25", label: "+25 credits", hint: "Adds 25 plan credits" },
      { action: "minus_25", label: "−25 credits", hint: "Uses 25 plan credits" },
      { action: "plus_100", label: "+100 credits", hint: "Adds 100 plan credits" },
      { action: "minus_100", label: "−100 credits", hint: "Uses 100 plan credits" },
      { action: "refill_full", label: "Refill to 100%", hint: "All plan credits back" },
      { action: "no_credits", label: "Use up all credits", hint: "0 left · the AI Animator stops" },
      { action: "low_credits", label: "Only 5 left", hint: "The bar turns red" },
      { action: "clear_extra", label: "Clear extra credits", hint: "Removes bought extra credits" },
    ],
  },
  {
    title: "Refill timing",
    buttons: [
      { action: "wait_for_refill", label: "Waiting for refill", hint: "0 credits, refill in 3 days" },
      { action: "refill_now", label: "Refill now", hint: "A new month starts now · the chart drops to zero" },
      { action: "refill_tomorrow", label: "Refill tomorrow", hint: "The month ends tomorrow" },
    ],
  },
  {
    title: "Pretend AI use",
    buttons: [
      { action: "spend_chat", label: "Spend a chat", hint: `−${AI_ACTION_CREDITS.chat} credits · no AI runs` },
      { action: "spend_assistant", label: "Spend a Help Assistant answer", hint: `−${AI_ACTION_CREDITS.assistant} credit · no AI runs` },
      { action: "spend_simple", label: "Spend a simple animation", hint: `−${AI_ACTION_CREDITS.simple} credits · no AI runs` },
      { action: "spend_big", label: "Spend a big animation", hint: `−${AI_ACTION_CREDITS.big} credits · no AI runs` },
    ],
  },
  {
    title: "Payments",
    buttons: [
      { action: "payment_failed", label: "Payment failed", hint: "Warning only · the AI still works" },
      { action: "payment_failed_locked", label: "Payment failed 4 days ago", hint: "The AI Animator waits" },
      { action: "payment_fixed", label: "Payment fixed", hint: "Back to normal" },
      { action: "plan_ended", label: "Plan ended", hint: "Locks · watch and export only" },
    ],
  },
  {
    title: "Trial",
    buttons: [
      { action: "trial_new", label: "Start a new trial", hint: `Day 1 of 14 · ${credits(ACCOUNT_PLANS.trial.credits)}` },
      { action: "trial_day_13", label: "Trial day 13", hint: "2 days left" },
      { action: "trial_ended", label: "Trial ended (day 15)", hint: "Locks · watch and export only" },
    ],
  },
];

const labelFor = (action: string) => TEST_PLAN_GROUPS.flatMap(group => group.buttons).find(button => button.action === action)?.label ?? action;

/** The grouped test buttons. `goHomeWhenLocked`: after a button locks the account, go to Home to see the locked screen. */
export function TestPlanControls({ goHomeWhenLocked = false, onChanged }: { goHomeWhenLocked?: boolean; onChanged?: () => void | Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "refused" | "error"; text: string } | null>(null);
  const run = async (action: string) => {
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/dev/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => null) as { error?: string; status?: AccountPlanStatus } | null;
      if (response.status === 402 && body?.error) setResult({ kind: "refused", text: `Refused, like the real app would: “${body.error}”` });
      else if (!response.ok) throw new Error("failed");
      else setResult({ kind: "ok", text: `Done: ${labelFor(action)}.` });
      await onChanged?.();
      window.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
      if (goHomeWhenLocked && body?.status?.locked) window.location.assign("/");
    } catch {
      setResult({ kind: "error", text: "That didn't work. Try again." });
    }
    setBusy(null);
  };
  return (
    <div className={styles.groups}>
      {TEST_PLAN_GROUPS.map(group => (
        <section key={group.title} className={styles.group} aria-label={`Test: ${group.title}`}>
          <h4 className={styles.groupTitle}>{group.title}</h4>
          <div className={styles.buttons}>
            {group.buttons.map(item => (
              <button key={item.action} type="button" disabled={busy !== null} onClick={() => void run(item.action)} className={styles.button}>
                <strong>{busy === item.action ? "Working" : item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {result && <p role={result.kind === "ok" ? "status" : "alert"} className={result.kind === "ok" ? styles.ok : result.kind === "refused" ? styles.refused : styles.error}>{result.text}</p>}
    </div>
  );
}
