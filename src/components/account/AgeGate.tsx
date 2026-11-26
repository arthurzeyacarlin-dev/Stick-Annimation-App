"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "@/src/components/auth/AuthScreen.module.css";

// SPEC-0031 (dad, Nov 26 - COPPA): an account made before the age rule is asked ONCE "Are you 13 or older?" before the app
// opens. Yes -> the app, unchanged. No -> the parent hand-off (a parent makes their own account). A parent whose child uses
// this account can agree here instead. The answer is saved by /api/account/age and can't be changed afterwards.
// The legal pages, the status page and Reset password stay open.
export type AgeGateState = "ask" | "under13";
const OPEN_PATHS = ["/privacy", "/terms", "/status", "/reset-password"];
const UNDER13_KEY = "diamond.askParent.v1"; // the same key the sign-up uses: after signing out it goes straight to "Ask a parent"

// The OWNER's account (Arthur, the owner, is 12) is never locked: its "No" opens the parent's consent instead, so a parent
// agrees once and every owner page, alert and email keeps working. The server refuses "under13" for the owner too.
export function AgeGate({ gate, owner = false, children }: { gate: AgeGateState | null; owner?: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (!gate || OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return <>{children}</>;
  return <AgeGateScreen gate={owner ? "ask" : gate} owner={owner} />;
}

function AgeGateScreen({ gate, owner }: { gate: AgeGateState; owner: boolean }) {
  const [view, setView] = useState<"ask" | "parent" | "under13">(gate);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (ageGroup: "13plus" | "parent" | "under13") => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/age", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageGroup, parentConsent: ageGroup === "parent" ? agree : undefined }),
      });
      if (!response.ok) throw new Error("age_answer_failed");
      if (ageGroup === "under13") { setView("under13"); setBusy(false); return; }
      window.location.reload();
    } catch {
      setError("We couldn't reach Diamond Animator. Check your connection and try again.");
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try { window.localStorage.setItem(UNDER13_KEY, String(Date.now())); } catch { /* storage blocked */ }
    try { await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* the reload shows the real state */ }
    window.location.assign("/");
  };

  const errorLine = error && <p className={styles.error} role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>{error}</p>;

  return (
    <main className={`${styles.screen} ${styles.screenCenter}`} data-age-gate={view}>
      <section className={`${styles.card} ${styles.cardCompact}`} aria-labelledby="age-gate-title">
        <div className={styles.mark}><DiamondLogo size={30} /><span className={styles.markName}>Diamond Animator</span></div>
        {view === "ask" && (
          <>
            <div className={styles.cardHead}>
              <h2 id="age-gate-title">Are you 13 or older?</h2>
              <p>We ask everyone once.</p>
            </div>
            <div className={styles.form}>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void answer("13plus")}>Yes, I&apos;m 13 or older</button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (owner) setView("parent"); else void answer("under13"); }}>No, I&apos;m under 13</button>
              {errorLine}
            </div>
            <div className={styles.cardFoot}>
              <p className={styles.fine}>Are you a parent, and your child uses this account? <button type="button" className={styles.inlineLink} disabled={busy} onClick={() => setView("parent")}>Parents tap here</button></p>
            </div>
          </>
        )}
        {view === "parent" && (
          <>
            <div className={styles.cardHead}>
              <h2 id="age-gate-title">{owner ? "Ask your parent or guardian" : "Parent or guardian"}</h2>
              {owner && <p>This is the owner&apos;s account, so it stays open: a parent or guardian ticks the box below once.</p>}
              {!owner && <p>This account should use your own email, so our emails reach you. If it uses your child&apos;s email, write to <a className={styles.inlineLink} href="mailto:support@diamondanimator.com">support@diamondanimator.com</a> and we&apos;ll change it.</p>}
            </div>
            <div className={styles.form}>
              <label className={styles.agree}>
                <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
                <span>I&apos;m the parent or guardian and I agree for my child to use Diamond Animator. I agree to the <a className={styles.inlineLink} href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a className={styles.inlineLink} href="/privacy#children" target="_blank" rel="noopener">Privacy Policy</a>.</span>
              </label>
              <button type="button" className={styles.primary} disabled={busy || !agree} onClick={() => void answer("parent")}>Agree and continue</button>
              {errorLine}
            </div>
            <div className={styles.cardFoot}>
              <p className={styles.fine}><button type="button" className={styles.inlineLink} disabled={busy} onClick={() => setView("ask")}>Back</button></p>
            </div>
          </>
        )}
        {view === "under13" && (
          <>
            <div className={styles.cardHead}>
              <h2 id="age-gate-title">Ask a parent to create your account</h2>
              <p>A parent or guardian makes the account with their own email. Then you use it to animate.</p>
              <p>Want the projects from this account moved to it? The parent can write to <a className={styles.inlineLink} href="mailto:support@diamondanimator.com">support@diamondanimator.com</a>.</p>
            </div>
            <div className={styles.form}>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
