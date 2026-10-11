"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "./AccountEntry.module.css";

// SPEC-0020 Phase 1: choose a new password from the emailed link. Uses the sign-in screen's look.
export function ResetPasswordScreen({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !token) return;
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      if (!response.ok) {
        const code = String(((await response.json().catch(() => null)) as { code?: unknown } | null)?.code ?? "");
        setError(code === "PASSWORD_TOO_SHORT" ? "Use a password with at least 8 characters."
          : code === "INVALID_TOKEN" ? "This link has expired or was already used. Ask for a new one from Log in → Forgot password?"
          : "We couldn't change your password. Please try again.");
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't reach Diamond Animator. Please try again.");
    }
    setBusy(false);
  };

  return (
    <main className={styles.page}>
      <section aria-labelledby="reset-title" className={styles.card}>
        <div className={styles.brand}><DiamondLogo className={styles.logo} size={24} />Diamond Animator</div>
        <h1 id="reset-title" className={`${styles.title} ${styles.formTitle}`}>{done ? "Password changed" : "Choose a new password"}</h1>
        {done ? (
          <>
            <p className={styles.lead}>You can log in with your new password now. For safety, you were logged out on every device.</p>
            <div className={`${styles.actions} ${styles.sentActions}`}>
              <Link href="/" className={`${styles.button} ${styles.primary}`}>Go to Log in</Link>
            </div>
          </>
        ) : !token ? (
          <>
            <p className={styles.lead}>This link has expired or was already used. Links work for 1 hour and only once.</p>
            <div className={`${styles.actions} ${styles.sentActions}`}>
              <Link href="/" className={`${styles.button} ${styles.primary}`}>Back to Log in</Link>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <div className={styles.fields}>
              <label className={styles.label}>New password<input className={styles.input} required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <label className={styles.label}>Type it again<input className={styles.input} required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
            </div>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <button type="submit" className={`${styles.button} ${styles.primary}${busy ? ` ${styles.busy}` : ""}`} disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
