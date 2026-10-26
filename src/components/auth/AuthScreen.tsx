"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import styles from "./AuthScreen.module.css";

// The new first screen (redesign Phase 1, Arthur 2026-10-26): a polished welcome with one card for Create account,
// Log in and Forgot password. It uses the same account endpoints as before; only the look is new.
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--auth-display" });

type Mode = "signup" | "login" | "forgot";
const RETURNING_KEY = "diamond.returningUser.v1";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signup");
  // Someone who has logged in on this browser before starts on Log in (quicker); a newcomer starts on Create account.
  useEffect(() => { try { if (window.localStorage.getItem(RETURNING_KEY)) setMode("login"); } catch { /* storage blocked */ } }, []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { firstFieldRef.current?.focus({ preventScroll: true }); }, [mode]);

  const switchMode = (next: Mode) => { setMode(next); setError(null); setResetSent(false); setShowPassword(false); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (mode === "forgot") {
        // Always the same answer, so nobody can find out which emails have accounts.
        const response = await fetch("/api/auth/request-password-reset", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), redirectTo: "/reset-password" }),
        });
        if (!response.ok && response.status !== 400) throw new Error("reset_request_failed");
        setResetSent(true); setBusy(false);
        return;
      }
      const endpoint = mode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const body = mode === "signup" ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password, rememberMe: true };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const code = String(((await response.json().catch(() => null)) as { code?: unknown } | null)?.code ?? "");
        setError(mode === "signup" && code.startsWith("USER_ALREADY_EXISTS") ? "That email already has an account. Log in instead."
          : code === "PASSWORD_TOO_SHORT" ? "Use a password with at least 8 characters."
          : mode === "signup" ? "We couldn't create that account. Check your details or try another email."
          : "That email and password don't match. New here? Create an account first.");
        setBusy(false);
        return;
      }
      try { window.localStorage.setItem(RETURNING_KEY, "1"); } catch { /* storage blocked */ }
      window.location.assign("/");
    } catch {
      setError("We couldn't reach Diamond Animator. Check your connection and try again.");
      setBusy(false);
    }
  };

  const heading = mode === "signup" ? "Create your account" : mode === "login" ? "Welcome back" : "Reset your password";
  const lead = mode === "signup" ? "Free for 14 days. No card needed." : mode === "login" ? "Log in to pick up where you left off." : "We'll email you a link to choose a new password.";
  const action = mode === "signup" ? (busy ? "Creating your account…" : "Create account") : mode === "login" ? (busy ? "Logging in…" : "Log in") : (busy ? "Sending…" : "Send reset link");

  return (
    <main className={`${styles.screen} ${display.variable}`}>
      <div className={styles.lattice} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <section className={styles.hero}>
        <div className={styles.mark}><DiamondLogo size={40} /><span className={styles.markName}>Diamond Animator</span></div>
        <h1 className={styles.title}>Bring your <span className={styles.accent}>stories</span> to life</h1>
        <p className={styles.subtitle}>Version 1 is all about stick figures, one or a whole cast. Draw them frame by frame, or tell the AI Animator what to make.</p>
      </section>

      <section className={styles.card} aria-labelledby="auth-heading">
        {mode !== "forgot" && (
          <div className={styles.switcher} role="tablist" aria-label="Create account or log in" data-mode={mode}>
            <span className={styles.switcherPill} aria-hidden="true" />
            <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => switchMode("signup")}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchMode("login")}>Log in</button>
          </div>
        )}
        <div className={styles.cardHead}>
          <h2 id="auth-heading">{heading}</h2>
          <p>{lead}</p>
        </div>

        {mode === "forgot" && resetSent ? (
          <div className={styles.sent} role="status">
            <strong>Check your email</strong>
            <span>If an account uses {email.trim() || "that email"}, a reset link is on its way.</span>
            <button type="button" className={styles.link} onClick={() => switchMode("login")}>Back to log in</button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit} method="post" action="#" autoComplete="on">
            {mode === "signup" && (
              <label className={styles.field}>
                <span>Name</span>
                <input ref={firstFieldRef} id="auth-name" name="name" required autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label className={styles.field}>
              <span>Email</span>
              <input ref={mode === "signup" ? undefined : firstFieldRef} id="auth-email" name="email" required type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {mode !== "forgot" && (
              <div className={styles.field}>
                <span className={styles.fieldTop}>
                  <label htmlFor="auth-password">Password</label>
                  {mode === "login" && <button type="button" className={styles.link} onClick={() => switchMode("forgot")}>Forgot password?</button>}
                </span>
                <span className={styles.passwordWrap}>
                  <input id="auth-password" name="password" required type={showPassword ? "text" : "password"} minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} value={password} onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" className={styles.eye} onClick={() => setShowPassword((was) => !was)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                    {showPassword
                      ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.6 8 3.4 10 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.5 4.4-1.2" /></svg>
                      : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
                  </button>
                </span>
              </div>
            )}
            {error && <p className={styles.error} role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>{error}</p>}
            <button type="submit" className={styles.primary} disabled={busy}>{action}</button>
          </form>
        )}
        {/* A line pinned to the card's bottom, so the card is one size in every mode and the space looks intended. */}
        <div className={styles.cardFoot}>
          {mode === "signup" && <p className={styles.fine}>By creating an account you agree to the Terms of Service and Privacy Policy.</p>}
          {mode === "login" && <p className={styles.fine}>New to Diamond Animator? <button type="button" className={styles.inlineLink} onClick={() => switchMode("signup")}>Create an account</button></p>}
          {mode === "forgot" && !resetSent && <p className={styles.fine}>Remembered it? <button type="button" className={styles.inlineLink} onClick={() => switchMode("login")}>Back to log in</button></p>}
        </div>
      </section>

      <footer className={styles.footer}>© 2026 Diamond Animator</footer>
    </main>
  );
}
