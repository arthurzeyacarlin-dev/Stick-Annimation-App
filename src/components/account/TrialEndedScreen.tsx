"use client";

import Link from "next/link";
import { useState } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "./AccountEntry.module.css";

// SPEC-0020 Phase 2: after the 14-day free trial, without a plan, the app is locked (Arthur: no free mode).
// Projects stay safe; Plans, Profile and Log out stay open.

export function TrialEndedScreen({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.assign("/");
    } catch {
      setError("Log out could not be completed. Try again.");
      setBusy(false);
    }
  };
  return (
    <main className={styles.page}>
      <section aria-labelledby="trial-ended-title" className={styles.card}>
        <div className={styles.intro}>
          <DiamondLogo className={styles.logoLarge} size={44} />
          <h1 id="trial-ended-title" className={styles.title}>Your free trial has ended</h1>
          <p className={styles.lead}>Thanks for trying Diamond Animator{name ? `, ${name}` : ""}! Choose a plan to keep animating. Your projects are safe and waiting for you.</p>
        </div>
        <div className={styles.choices}>
          <Link href="/plans" className={`${styles.button} ${styles.primary}`}>Choose a plan</Link>
          <Link href="/account" className={styles.button}>Profile</Link>
          <button type="button" className={styles.button} onClick={() => void logOut()} disabled={busy}>{busy ? "Logging out…" : "Log out"}</button>
        </div>
        {error && <p role="alert" className={`${styles.error} ${styles.entryNote}`}>{error}</p>}
      </section>
    </main>
  );
}
