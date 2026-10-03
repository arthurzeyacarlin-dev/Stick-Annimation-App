"use client";

import { useEffect, useRef } from "react";
import { useInstantHover } from "@/src/components/home/useInstantHover";
import styles from "./HelpHub.module.css";

type HelpHubProps = {
  onBack: () => void;
  onOpenAssistant: () => void;
  onOpenTutorials: () => void;
  initialFocus?: "assistant" | "tutorials" | null;
};

// One Help destination: the existing Assistant route and the placeholder Tutorials screen.
export function HelpHub({ onBack, onOpenAssistant, onOpenTutorials, initialFocus = null }: HelpHubProps) {
  const hover = useInstantHover();
  const assistantRef = useRef<HTMLButtonElement | null>(null);
  const tutorialsRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (initialFocus === "assistant") assistantRef.current?.focus({ preventScroll: true });
    if (initialFocus === "tutorials") tutorialsRef.current?.focus({ preventScroll: true });
  }, [initialFocus]);

  return (
    <main className={styles.screen} data-help-hub {...hover}>
      <div className={styles.frame}>
        <button type="button" className={styles.back} onClick={onBack}>
          <span aria-hidden="true">←</span> Back to Home
        </button>
        <header className={styles.intro}>
          <h1 className={styles.heading}>Help</h1>
          <p className={styles.subheading}>Get answers or learn the basics.</p>
        </header>
        <nav className={styles.choices} aria-label="Help options">
          <button ref={assistantRef} type="button" className={styles.choice} onClick={onOpenAssistant}>
            <svg className={styles.icon} viewBox="0 -2 34 36" fill="none" aria-hidden="true">
              <path d="M17.55 10.2V8.15l-1.8-1.6 1.8-1.5v-2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17.55" cy="1.15" r="2.15" fill="currentColor" />
              <rect x="7.4" y="10.6" width="19.2" height="15.6" rx="4.2" stroke="currentColor" strokeWidth="2.05" />
              <path d="M7.4 16.45H4.45M29.55 16.45H26.6" stroke="currentColor" strokeWidth="2.05" strokeLinecap="round" />
              <ellipse cx="13.5" cy="17.5" rx="1.7" ry="2.05" fill="currentColor" />
              <ellipse cx="20.5" cy="17.5" rx="1.7" ry="2.05" fill="currentColor" />
            </svg>
            <span className={styles.text}>
              <strong>Ask the Assistant</strong>
              <small>Questions about Diamond Animator, answered.</small>
              <em>Your chats are saved</em>
            </span>
          </button>
          <button ref={tutorialsRef} type="button" className={styles.choice} onClick={onOpenTutorials}>
            <svg className={styles.icon} viewBox="0 0 34 34" fill="none" aria-hidden="true">
              <rect x="4" y="7" width="26" height="20" rx="4" stroke="currentColor" strokeWidth="2.05" />
              <path d="M14.5 12.8v8.4l7-4.2-7-4.2Z" fill="currentColor" />
            </svg>
            <span className={styles.text}>
              <strong>Tutorials</strong>
              <small>Step-by-step lessons.</small>
              <em>Coming later</em>
            </span>
          </button>
        </nav>
      </div>
    </main>
  );
}
