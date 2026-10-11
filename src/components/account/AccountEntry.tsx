"use client";

import { useState, type FormEvent } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "./AccountEntry.module.css";

type EntryMode = "signup" | "login" | "forgot" | null;

export function AccountEntry() {
  const [mode, setMode] = useState<EntryMode>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // SPEC-0020 Phase 1: "Forgot password?" — always the same answer, so nobody can find out which emails have accounts.
  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), redirectTo: "/reset-password" }),
      });
      if (!response.ok && response.status !== 400) throw new Error("reset_request_failed");
      setResetSent(true);
    } catch {
      setError("We couldn't reach Diamond Animator. Please try again.");
    }
    setBusy(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!mode || mode === "forgot" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const body = mode === "signup"
        ? { name: name.trim(), email: email.trim(), password }
        : { email: email.trim(), password, rememberMe: true };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Say what actually went wrong when we know (e.g. the email already has an account).
        const code = String(((await response.json().catch(() => null)) as { code?: unknown } | null)?.code ?? "");
        setError(mode === "signup" && code.startsWith("USER_ALREADY_EXISTS")
          ? "That email already has an account. Press Back, then Log in."
          : code === "PASSWORD_TOO_SHORT" ? "Use a password with at least 8 characters."
          : mode === "signup" ? "We couldn't create that account. Check your details or try a different email."
          : "That email and password didn't match. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setError("We couldn't reach Diamond Animator. Please try again.");
      setBusy(false);
    }
  };

  const switchMode = (next: EntryMode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const submitDisabled = busy;
  const emailField = (
    <label className={styles.label}>Email<input className={styles.input} required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
  );
  const passwordField = (
    <label className={styles.label}>Password<input className={styles.input} required type="password" minLength={8} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
  );
  const backButton = (
    <button type="button" className={styles.button} disabled={busy} onClick={() => switchMode(null)}>Back</button>
  );

  if (mode === null) {
    return (
      <main className={styles.page}>
        <section aria-labelledby="account-entry-title" className={styles.card}>
          <div className={styles.intro}>
            <DiamondLogo className={styles.logoLarge} size={44} />
            <h1 id="account-entry-title" className={styles.title}>Welcome to Diamond Animator</h1>
            <p className={styles.lead}>Draw, animate and bring your ideas to life.</p>
          </div>
          <div className={styles.choices}>
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => switchMode("signup")}>Create account</button>
            <button type="button" className={styles.button} onClick={() => switchMode("login")}>Log in</button>
          </div>
          <p className={`${styles.muted} ${styles.entryNote}`}>Your account and work stay on this computer.</p>
        </section>
      </main>
    );
  }

  if (mode === "login") {
    return (
      <main className={styles.page}>
        <section aria-labelledby="account-entry-title" className={styles.card}>
          <div className={styles.brand}><DiamondLogo className={styles.logo} size={24} />Diamond Animator</div>
          <h1 id="account-entry-title" className={`${styles.title} ${styles.formTitle}`}>Log in</h1>
          <p className={styles.lead}>Welcome back. Pick up where you left off.</p>
          <form onSubmit={submit} className={styles.form}>
            <div className={styles.fields}>
              {emailField}
              {passwordField}
            </div>
            <p className={styles.forgotRow}><button type="button" className={styles.switch} disabled={busy} onClick={() => switchMode("forgot")}>Forgot password?</button></p>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <button type="submit" className={`${styles.button} ${styles.primary}${busy ? ` ${styles.busy}` : ""}`} disabled={submitDisabled}>{busy ? "Logging in…" : "Log in"}</button>
              {backButton}
            </div>
            <p className={styles.switchRow}>New here?<button type="button" className={styles.switch} disabled={busy} onClick={() => switchMode("signup")}>Create account</button></p>
          </form>
        </section>
      </main>
    );
  }

  if (mode === "forgot") {
    return (
      <main className={styles.page}>
        <section aria-labelledby="account-entry-title" className={styles.card}>
          <div className={styles.brand}><DiamondLogo className={styles.logo} size={24} />Diamond Animator</div>
          <h1 id="account-entry-title" className={`${styles.title} ${styles.formTitle}`}>Forgot password</h1>
          {resetSent ? (
            <>
              <p className={styles.lead}>If an account uses <strong>{email.trim()}</strong>, we sent it a link to choose a new password. The link works for 1 hour.</p>
              <div className={`${styles.actions} ${styles.sentActions}`}>
                <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => switchMode("login")}>Back to Log in</button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.lead}>Type the email you signed up with. We&apos;ll send you a link to choose a new password.</p>
              <form onSubmit={requestReset} className={styles.form}>
                <div className={styles.fields}>{emailField}</div>
                {error && <p role="alert" className={styles.error}>{error}</p>}
                <div className={styles.actions}>
                  <button type="submit" className={`${styles.button} ${styles.primary}${busy ? ` ${styles.busy}` : ""}`} disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
                  <button type="button" className={styles.button} disabled={busy} onClick={() => switchMode("login")}>Back</button>
                </div>
              </form>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section aria-labelledby="account-entry-title" className={`${styles.card} ${styles.cardWide}`}>
        <div className={styles.brand}><DiamondLogo className={styles.logo} size={24} />Diamond Animator</div>
        <h1 id="account-entry-title" className={styles.title}>Create account</h1>
        <p className={styles.lead}>Two quick steps and you&apos;re ready to create.</p>
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.step}>
            <h2 className={styles.stepHead}><span className={styles.stepNumber} aria-hidden="true">1</span>Your details</h2>
            <div className={styles.fields}>
              <label className={styles.label}>Display name<input className={styles.input} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
              <div className={styles.fieldRow}>
                {emailField}
                {passwordField}
              </div>
            </div>
          </div>

          <div className={`${styles.step} ${styles.stepDivider}`}>
            <h2 className={styles.stepHead}><span className={styles.stepNumber} aria-hidden="true">2</span>Create your account</h2>
            <p className={`${styles.muted} ${styles.stepHint}`}>Your account lives on this computer.</p>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <button type="submit" className={`${styles.button} ${styles.primary}${busy ? ` ${styles.busy}` : ""}`} disabled={submitDisabled}>{busy ? "Creating account…" : "Create account"}</button>
              {backButton}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
