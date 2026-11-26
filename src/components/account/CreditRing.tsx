"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import { creditsText } from "@/src/lib/account/credits";
import type { AccountPlanStatus } from "@/src/lib/account/plans";
import { creditsLeftPercent } from "@/src/lib/ai-dashboard/creditMeter";
import { useAccountPlan } from "./useAccountPlan";
import styles from "./CreditRing.module.css";

// Arthur, Nov 21: the AI Dashboard's credits circle, small, everywhere you use AI (the Help Assistant, the AI Animator, the
// top bar), like the usage circle in Claude. It is full while you have at least your plan's credits (after a refill or a
// pack) and empties as you use them. Pointing at it shows the numbers; clicking it opens the AI Dashboard.

/** Nov 21 (Arthur): clicking the circle inside a project opens the AI Dashboard ON TOP of the project (Home listens for
 *  this and keeps the project open, so "Back" returns to it exactly as it was). Anywhere else it is a normal link. */
export const OPEN_AI_DASHBOARD_EVENT = "diamond-open-ai-dashboard";
const openDashboardInPlace = (event: MouseEvent) => {
  const ask = new CustomEvent(OPEN_AI_DASHBOARD_EVENT, { cancelable: true });
  window.dispatchEvent(ask);
  if (ask.defaultPrevented) event.preventDefault();
};

const shortDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function creditRingLines(status: AccountPlanStatus): [string, string, string] {
  const trial = status.plan === "trial";
  const refill = status.refillsAt ?? status.windowEnd;
  return [
    `${creditsText(status.creditsLeft)} left`,
    `of ${status.creditsTotal.toLocaleString("en-US")} ${trial ? "on your free trial" : `on ${status.label}`}${status.topUpCredits > 0 ? ` · ${creditsText(status.topUpCredits)} extra` : ""}`,
    trial ? `Trial ends ${shortDay(status.windowEnd)}` : status.cancelAtPeriodEnd ? `Plan ends ${shortDay(refill)}` : `Refills ${shortDay(refill)}`,
  ];
}

/** The circle itself, from a plan status the caller already has (no fetching). `link` = false inside another link. */
export function CreditRingView({ status, size = 20, showNumber = false, link = true, tip = "above", className }: {
  status: AccountPlanStatus; size?: number; showNumber?: boolean; link?: boolean; tip?: "above" | "below"; className?: string;
}) {
  const pathname = usePathname();
  const percent = creditsLeftPercent(status.creditsLeft, status.creditsTotal);
  const tone = status.creditsLeft === 0 ? "out" : status.low ? "low" : "ok";
  const [first, second, third] = creditRingLines(status);
  const body = <>
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={styles.svg}>
      <circle className={styles.track} cx="12" cy="12" r="9" />
      <circle className={styles.value} cx="12" cy="12" r="9" pathLength={100} strokeDasharray={`${percent} 100`} data-full={percent >= 100 ? "true" : "false"} />
    </svg>
    {showNumber && <span className={styles.number}>{status.creditsLeft.toLocaleString("en-US")}</span>}
    <span className={styles.tip} data-side={tip} role="tooltip"><strong>{first}</strong><span>{second}</span><span>{third}</span></span>
  </>;
  const shared = { className: `${styles.ring}${className ? ` ${className}` : ""}`, "data-tone": tone } as const;
  // From the Help Assistant the dashboard gets "Back" to it (?back=/assistant); from a project, Home opens it on top.
  const href = pathname === "/assistant" ? "/credits?back=%2Fassistant" : "/credits";
  return link
    ? <Link href={href} prefetch={false} onClick={openDashboardInPlace} {...shared} aria-label={`${first}, ${second}. ${third}. Open the AI Dashboard`}>{body}</Link>
    : <span {...shared} aria-label={`${first}, ${second}`}>{body}</span>;
}

/** The circle for a chat box: reads the plan itself and checks again right after an answer finishes (`busy` goes false). */
export function CreditRing({ busy = false, ...props }: { busy?: boolean; size?: number; showNumber?: boolean; tip?: "above" | "below"; className?: string }) {
  const { status, refresh } = useAccountPlan();
  const wasBusy = useRef(busy);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (!finished) return;
    const timer = window.setTimeout(() => void refresh(), 600);
    return () => window.clearTimeout(timer);
  }, [busy, refresh]);
  if (!status) return null;
  return <CreditRingView status={status} {...props} />;
}
