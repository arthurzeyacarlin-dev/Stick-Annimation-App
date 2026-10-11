"use client";

import Link from "next/link";
import { forwardRef } from "react";
import styles from "./BackButton.module.css";

// SPEC-0020 Phase 3 (Arthur): ONE Back control used on every screen — just a back-arrow symbol, no box.
// The words ("Back to Home", "Back to Help"…) are its name for screen readers and its hover tooltip.
type BackButtonProps = { children?: string; className?: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

export const BackArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 12H5M11 5.5 4.5 12l6.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BackButton = forwardRef<HTMLButtonElement & HTMLAnchorElement, BackButtonProps>(function BackButton({ children = "Back", className, href, onClick }, ref) {
  const classes = `${styles.back}${className ? ` ${className}` : ""}`;
  return href
    ? <Link ref={ref} href={href} prefetch={false} className={classes} aria-label={children} title={children}><BackArrow /></Link>
    : <button ref={ref} type="button" onClick={onClick} className={classes} aria-label={children} title={children}><BackArrow /></button>;
});

/** For screens that need their own element (e.g. a focus ref): the same look as <BackButton>. */
export const BACK_BUTTON_CLASS = styles.back;
export { BackArrow as BackChevron };
