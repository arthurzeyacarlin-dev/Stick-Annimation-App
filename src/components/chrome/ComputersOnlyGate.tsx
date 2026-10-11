"use client";

import { useSyncExternalStore } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "./ComputersOnlyGate.module.css";

// SPEC-0020 Phase 6 (Arthur): Diamond Animator is for computers only. Phones and tablets get a friendly
// screen instead of a squished editor. Touch-only screens are detected (no mouse hover, coarse pointer), plus
// phone/tablet browsers and iPads that report themselves as a Mac.
const TOUCH_ONLY_QUERY = "(hover: none) and (pointer: coarse)";

const isPhoneOrTablet = () => {
  if (typeof window === "undefined") return false;
  const agent = navigator.userAgent;
  const iPadAsMac = /Macintosh/.test(agent) && navigator.maxTouchPoints > 1;
  return window.matchMedia(TOUCH_ONLY_QUERY).matches || /iPhone|iPad|iPod|Android|Mobile/i.test(agent) || iPadAsMac;
};

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(TOUCH_ONLY_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export function ComputersOnlyGate() {
  const blocked = useSyncExternalStore(subscribe, isPhoneOrTablet, () => false);
  if (!blocked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="computers-only-title" className={styles.gate} data-computers-only>
      <div className={styles.card}>
        <DiamondLogo className={styles.logo} size={44} />
        <h1 id="computers-only-title" className={styles.title}>Diamond Animator works on computers</h1>
        <p className={styles.text}>Open Diamond Animator on a Mac or Windows computer to start animating. Your projects are saved to your account, so they&apos;ll be waiting there.</p>
      </div>
    </div>
  );
}
