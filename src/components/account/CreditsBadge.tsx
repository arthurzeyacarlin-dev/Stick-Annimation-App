"use client";

import { useAccountPlan } from "./useAccountPlan";
import styles from "./CreditsBadge.module.css";

// SPEC-0020 Phase 2: "◆ 142 credits" in the editor's top bar, so nobody is surprised when the AI stops at 0.
// It only shows the number (leaving the editor from here could lose unsaved work). Arthur removed the header
// version: the AI Dashboard link is already there.
const number = (value: number) => value.toLocaleString("en-US");

export function CreditsBadge() {
  const { status } = useAccountPlan();
  if (!status) return null;
  const tone = status.creditsLeft === 0 || status.locked ? styles.empty : status.low ? styles.low : "";
  const detail = status.trialDaysLeft !== null
    ? `${status.label} · ${status.trialDaysLeft === 1 ? "1 day" : `${status.trialDaysLeft} days`} left · ${number(status.creditsLeft)} of ${number(status.creditsTotal)} AI credits left`
    : `${status.label} plan · ${number(status.creditsLeft)} of ${number(status.creditsTotal)} AI credits left this month`;
  return (
    <span className={`${styles.badge} ${tone}`} title={detail} aria-label={detail} role="status">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9 7 4h10l4 5-9 11L3 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
      <span>{number(status.creditsLeft)} {status.creditsLeft === 1 ? "credit" : "credits"}</span>
    </span>
  );
}
