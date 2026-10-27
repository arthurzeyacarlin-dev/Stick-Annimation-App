"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "@/src/components/auth/AuthScreen.module.css";

// SPEC-0020 Phase 1: choose a new password from the emailed link. Arthur (2026-10-27): the same polished look as the
// Create account / Log in card (glow, dots, show-password eyes, bright button). The reset itself is unchanged.
const EyeIcon = ({ open }: { open: boolean }) => open
  ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.6 8 3.4 10 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.5 4.4-1.2" /></svg>
  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;

export function ResetPasswordScreen({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
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
  const heading = done ? "Password changed" : !token ? "This link has expired" : "Choose a new password";
  const lead = done ? "You can log in with your new password now. For safety, you were logged out on every device."
    : !token ? "Reset links work for 1 hour and only once. Ask for a new one from Log in → Forgot password?"
    : "Pick a new password for your Diamond Animator account.";
  return (
    <main className={`${styles.screen} ${styles.screenCenter}`} data-reset-password>
      <div className={styles.lattice} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <section className={`${styles.card} ${styles.cardCompact}`} aria-labelledby="reset-title">
        <div className={styles.mark}><DiamondLogo size={30} /><span className={styles.markName}>Diamond Animator</span></div>
        <div className={styles.cardHead}>
          <h2 id="reset-title">{heading}</h2>
          <p>{lead}</p>
        </div>
        {done || !token ? (
          <Link href="/" className={styles.primary}>{done ? "Go to Log in" : "Back to Log in"}</Link>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            {[["New password", password, setPassword], ["Type it again", confirm, setConfirm]].map(([label, value, set], index) => (
              <label key={label as string} className={styles.field}>
                <span>{label as string}</span>
                <span className={styles.passwordWrap}>
                  <input required type={show ? "text" : "password"} minLength={8} maxLength={128} autoComplete="new-password"
                    placeholder={index === 0 ? "At least 8 characters" : "The same password again"}
                    value={value as string} onChange={(event) => (set as (v: string) => void)(event.target.value)} />
                  <button type="button" className={styles.eye} onClick={() => setShow((was) => !was)} aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show}><EyeIcon open={show} /></button>
                </span>
              </label>
            ))}
            {error && <p className={styles.error} role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>{error}</p>}
            <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
