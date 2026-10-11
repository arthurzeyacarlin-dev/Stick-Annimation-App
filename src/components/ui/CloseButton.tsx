"use client";

import { forwardRef } from "react";
import styles from "./CloseButton.module.css";

// SPEC-0020 Phase 3 (Arthur): every "close" in the app is just an X — no box. Hover turns it var(--da-hover, #0066ff) instantly.
export const CloseX = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

type CloseButtonProps = { label: string; onClick: () => void; className?: string };

export const CloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(function CloseButton({ label, onClick, className }, ref) {
  return (
    <button ref={ref} type="button" onClick={onClick} aria-label={label} title={label} className={`${styles.close}${className ? ` ${className}` : ""}`}>
      <CloseX />
    </button>
  );
});

export const CLOSE_BUTTON_CLASS = styles.close;
