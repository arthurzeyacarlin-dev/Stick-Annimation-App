"use client";

import Link from "next/link";
import { ACCOUNT_PLAN_CHANGED_EVENT } from "@/src/components/account/useAccountPlan";
import { AI_ACTION_CREDITS, refillDay, type AccountPlanStatus } from "@/src/lib/account/plans";
import { creditsText } from "@/src/lib/account/credits";

// AI Animator V1 — the out-of-credits card (Nov 3, Arthur). It sits just above the message box while the account has
// fewer credits than one chat message costs, and goes away by itself after a refill (useAccountPlan reads the balance
// again every 15 s, on focus, and right after a refusal for credits). Not dismissable. A locked account (trial or plan
// ended, payment problem) has its own message instead. Both links open the AI Dashboard (/credits).
// Rules: only the two links get button boxes; the words stay plain; the canvas is never touched.

export const V1_CREDITS_PAGE = "/credits";

export type V1OutOfCreditsView = {
  title: string;
  line: string;
  next: string | null; // (trial) what to do next, said plainly
  links: { label: string; href: string }[];
};

const creditsWord = (count: number) => `${creditsText(count)} left`;

/** The card's words, or null when it must not show (balance unknown, enough for a chat message, or the account is locked). */
export function v1OutOfCreditsView(status: AccountPlanStatus | null): V1OutOfCreditsView | null {
  if (!status || status.locked || status.aiLocked) return null;
  const left = Math.max(0, Math.floor(status.creditsLeft));
  if (left >= AI_ACTION_CREDITS.chat) return null;
  const trial = status.plan === "trial";
  return {
    title: status.waitingForPayment ? "Your credits are on their way" : status.creditsLeft > 0 ? "Not enough credits to keep animating" : "You're out of credits",
    line: trial
      ? `${creditsWord(left)} · free trial ends on ${refillDay(status.trialEndsAt ?? status.windowEnd)}`
      : status.waitingForPayment
        ? status.paymentProblem ? `${creditsWord(left)} · your last payment didn't go through: update your card in Manage plan` : `${creditsWord(left)} · they come the moment your payment goes through`
        : `${creditsWord(left)} · refills on ${refillDay(status.refillsAt ?? status.windowEnd)}`,
    next: trial ? "Choose a plan to keep animating." : null,
    links: [{ label: "See my usage", href: V1_CREDITS_PAGE }, { label: trial ? "Choose a plan" : "Buy a pack", href: trial ? "/plans" : V1_CREDITS_PAGE }],
  };
}

/** Ask every useAccountPlan on the page to read the plan + credits again now (after a refusal for credits). */
export function announceAccountPlanChanged(target: Pick<EventTarget, "dispatchEvent"> | null = typeof window === "undefined" ? null : window) {
  target?.dispatchEvent(new Event(ACCOUNT_PLAN_CHANGED_EVENT));
}

export function V1OutOfCreditsCard({ view }: { view: V1OutOfCreditsView }) {
  return (
    <section className="v1-card v1-out" aria-label="Out of credits" data-v1-out-of-credits="">
      <div className="v1-out-words">
        <strong>{view.title}</strong>
        <span>{view.line}</span>
        {view.next && <span>{view.next}</span>}
      </div>
      <div className="v1-actions">
        {view.links.map((link) => <Link key={link.label} href={link.href}>{link.label}</Link>)}
      </div>
    </section>
  );
}
