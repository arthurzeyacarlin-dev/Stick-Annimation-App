"use client";

import Link from "next/link";
import styles from "./Billing.module.css";

// Nov 21 (Arthur: "I don't want them going to this other application"): Manage plan stays inside Diamond Animator. It opens your
// plan on the Plans page (switch right away, change card, cancel or keep). Stripe's own Manage plan page is no longer used.
type ManagePlanButtonProps = { returnTo?: "/plans" | "/credits"; className?: string; children?: string; disabled?: boolean };

export function ManagePlanButton({ className, children = "Manage plan", disabled = false }: ManagePlanButtonProps) {
  if (disabled) return <span className={className ?? styles.button} aria-disabled="true">{children}</span>;
  return <Link href="/plans#manage" prefetch={false} className={className ?? styles.button}>{children}</Link>;
}
