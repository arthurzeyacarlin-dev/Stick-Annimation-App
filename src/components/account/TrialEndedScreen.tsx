"use client";

import Link from "next/link";
import { useState } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import { ProjectLibrary } from "@/src/components/project-library/ProjectLibrary";
import { useAccountSession } from "./AccountSessionProvider";
import styles from "./TrialEndedScreen.module.css";

// SPEC-0020 Phase 2 + 9: after the free trial (or a paid plan) ends, creating is locked (Arthur: no free mode), but
// people can still open, WATCH and EXPORT what they made (dad's decision). This screen replaces Home, so the editor
// can't be reached; Choose a plan, Profile and Log out stay open. Projects are never deleted.

export function TrialEndedScreen({ name, lockReason = "trial_ended", showTestLink = false }: {
  name: string;
  lockReason?: "trial_ended" | "plan_ended" | null;
  /** Development only: a link to the test controls, so a locked test account can be unlocked again. */
  showTestLink?: boolean;
}) {
  const account = useAccountSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planEnded = lockReason === "plan_ended";
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
    <main className={styles.page} aria-labelledby="trial-ended-title">
      <header className={styles.top}>
        <div className={styles.message}>
          <DiamondLogo className={styles.logo} size={36} />
          <div>
            <h1 id="trial-ended-title" className={styles.title}>{planEnded ? "Your plan has ended" : "Your free trial has ended"}</h1>
            <p className={styles.lead}>
              {planEnded ? "Thanks for animating with Diamond Animator" : "Thanks for trying Diamond Animator"}{name ? `, ${name}` : ""}!
              {" "}Choose a plan to keep animating. Your animations are safe: you can still watch and export them below.
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <Link href="/plans" className={`${styles.button} ${styles.primary}`}>Choose a plan</Link>
          <Link href="/account" className={styles.button}>Profile</Link>
          <button type="button" className={styles.button} onClick={() => void logOut()} disabled={busy}>{busy ? "Logging out" : "Log out"}</button>
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {showTestLink && <p className={styles.testLink}>TEST ONLY (developer): <Link href="/dev/plan">open the test controls</Link> to unlock this account again.</p>}
      </header>
      <div className={styles.library}>
        {account?.id ? <ProjectLibrary readOnly surface="combined" ownerId={account.id} />
          : <p className={styles.lead}>Your animations couldn&apos;t be loaded. Refresh the page to try again.</p>}
      </div>
    </main>
  );
}
