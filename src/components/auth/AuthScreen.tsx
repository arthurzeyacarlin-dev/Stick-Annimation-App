"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DiamondLogo } from "@/src/components/chrome/DiamondLogo";
import { ACCOUNT_PLANS, CYCLE_WORD, NO_TRIAL_MESSAGE, PAID_PLAN_IDS, PLAN_CYCLE, type BillingInterval, type PaidPlanId } from "@/src/lib/account/plans";
import { EmailConfirmBox } from "@/src/components/account/EmailConfirm";
import { PaymentDialog } from "@/src/components/account/PaymentDialog";
import { AuthShowcase } from "./AuthShowcase";
import { creditsText } from "@/src/lib/account/credits";
import { birthYearChoices, isUnder13, needsBirthMonth } from "@/src/lib/account/ageCheck";
import styles from "./AuthScreen.module.css";
import { useSavedOffer } from "@/src/components/account/offerCode";
import { offerFromCodes, offerLine, offerMoney, offerPrice } from "@/src/lib/account/offerDisplay";

// The new first screen (redesign Phase 1, Arthur 2026-10-26): a polished welcome with one card for Create account,
// Log in and Forgot password. It uses the same account endpoints as before; only the look is new.

type Mode = "signup" | "login" | "forgot";
type PlanChoice = "trial" | PaidPlanId;
const PLAN_LINE: Record<PlanChoice, string> = {
  trial: "Try everything for 14 days. No card needed.",
  starter: "For getting started",
  creator: "For regular animators",
  studio: "For big projects",
};
const money = (value: number) => (Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`);
const RETURNING_KEY = "diamond.returningUser.v1";
// SPEC-0031 (COPPA): after an "under 13" answer this browser goes straight to "Ask a parent" for a day, so the answer can't
// just be changed by going back. Only the time is kept (no birth year).
const UNDER13_KEY = "diamond.askParent.v1";
const UNDER13_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type AgeStep = "ask" | "adult" | "kid" | "parent";
const startAgeStep = (): AgeStep => {
  try { if (Date.now() - Number(window.localStorage.getItem(UNDER13_KEY) ?? 0) < UNDER13_MS) return "kid"; } catch { /* storage blocked */ }
  return "ask";
};

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signup");
  // Someone who has logged in on this browser before starts on Log in (quicker); a newcomer starts on Create account.
  useEffect(() => { try { if (window.localStorage.getItem(RETURNING_KEY)) setMode("login"); } catch { /* storage blocked */ } }, []);
  // SPEC-0031 (dad, Nov 26): Create account first asks the birth year (a plain question). 13 or older -> the same form as
  // before; under 13 -> "Ask a parent", and the parent signs up with their own email and agrees.
  const [age, setAge] = useState<AgeStep>("ask");
  useEffect(() => { setAge(startAgeStep()); }, []);
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [parentAgree, setParentAgree] = useState(false);
  const yearRef = useRef<HTMLSelectElement | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  // Arthur (2026-10-27): Create account has two steps — the account, then the plan (free trial or a paid plan), all
  // before the app opens. Paid plans go to Stripe's page (test mode: no real money).
  const [step, setStep] = useState<"account" | "plan" | "confirm">("account");
  // (dad, Nov 26) the free trial starts once the email is confirmed; an inbox that already had a trial gets none (Plans instead)
  const [trialState, setTrialState] = useState<{ state: "confirm" | "confirmed" | "no_trial"; email: string } | null>(null);
  const [plan, setPlan] = useState<PlanChoice>("trial");
  const [interval, setInterval] = useState<BillingInterval>(PLAN_CYCLE);
  // SPEC-0031: a code from a link (?code=FIRSTDIAMOND) is kept through sign-up; at step 2 (signed in) the prices show it.
  const { saved, code: savedCode } = useSavedOffer(step === "plan");
  const savedCodes = saved ? { [saved.offer]: saved.code } as { first50?: string; youtube?: string } : undefined;

  useEffect(() => { (mode === "signup" && age === "ask" ? yearRef : firstFieldRef).current?.focus({ preventScroll: true }); }, [mode, age]);

  const switchMode = (next: Mode) => {
    setMode(next); setError(null); setResetSent(false); setShowPassword(false);
    if (next === "signup") { setAge(startAgeStep()); setBirthYear(""); setBirthMonth(""); setParentAgree(false); }
  };

  const year = Number(birthYear);
  const askMonth = !!birthYear && needsBirthMonth(year);
  const answerAge = (event: FormEvent) => {
    event.preventDefault();
    if (!birthYear || (askMonth && !birthMonth)) return;
    setError(null);
    if (isUnder13(year, Number(birthMonth) || null)) {
      try { window.localStorage.setItem(UNDER13_KEY, String(Date.now())); } catch { /* storage blocked */ }
      setAge("kid");
    } else setAge("adult");
  };

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
      // SPEC-0031: the sign-up says "13plus" or "parent" (never the birth year); the server refuses a sign-up without it.
      if (mode === "signup" && age !== "adult" && age !== "parent") { setBusy(false); return; }
      const body = mode === "signup" ? { name: name.trim(), email: email.trim(), password, ageAnswer: age === "parent" ? "parent" : "13plus" } : { email: email.trim(), password, rememberMe: true };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) {
        const code = String(((await response.json().catch(() => null)) as { code?: unknown } | null)?.code ?? "");
        setError(mode === "signup" && code.startsWith("USER_ALREADY_EXISTS") ? "That email already has an account. Log in instead."
          : code === "PASSWORD_TOO_SHORT" ? "Use a password with at least 8 characters."
          : code === "AGE_CHECK_NEEDED" ? "Please start again and answer the birth year question."
          : code === "DISPOSABLE_EMAIL" ? "Please use your real email address. Throwaway email addresses can't start a free trial."
          : mode === "signup" ? "We couldn't create that account. Check your details or try another email."
          : "That email and password don't match. New here? Create an account first.");
        setBusy(false);
        return;
      }
      try { window.localStorage.setItem(RETURNING_KEY, "1"); } catch { /* storage blocked */ }
      if (mode === "signup") {
        try {
          const confirm = (await (await fetch("/api/account/email-confirm", { cache: "no-store" })).json()) as { state?: "confirm" | "confirmed" | "no_trial"; email?: string };
          if (confirm.state) setTrialState({ state: confirm.state, email: confirm.email ?? email.trim() });
          if (confirm.state === "no_trial") setPlan("starter");
        } catch { /* the app's confirm card asks later */ }
        setStep("plan"); setBusy(false); return;
      }
      window.location.assign("/");
    } catch {
      setError("We couldn't reach Diamond Animator. Check your connection and try again.");
      setBusy(false);
    }
  };

  // Nov 21 (Arthur: "You never see Stripe"): a paid plan is paid right here, in the app's own card dialog.
  const [paying, setPaying] = useState(false);
  const startPlan = () => {
    if (busy) return;
    if (plan === "trial") { if (trialState?.state === "confirm") setStep("confirm"); else window.location.assign("/"); return; }
    setError(null);
    setPaying(true);
  };

  const parentForm = mode === "signup" && age === "parent";
  const heading = parentForm ? "Parent or guardian: create the account" : mode === "signup" ? "Create your account" : mode === "login" ? "Welcome back" : "Reset your password";
  const lead = parentForm ? "Use your own email. Your child then uses this account. Free for 14 days, no card needed."
    : mode === "signup" ? "Free for 14 days. No card needed." : mode === "login" ? "Log in to pick up where you left off." : "We'll email you a link to choose a new password.";
  const action = mode === "signup" ? (busy ? "Creating your account…" : "Create account") : mode === "login" ? (busy ? "Logging in…" : "Log in") : (busy ? "Sending…" : "Send reset link");

  return (
    <main className={styles.screen}>

      <section className={styles.hero}>
        <div className={styles.mark}><DiamondLogo size={30} /><span className={styles.markName}>Diamond Animator</span></div>
        <div className={styles.heroWords}>
          <h1 className={styles.title}>Bring your stories to life.</h1>
          <p className={styles.subtitle}>Type what you want to see and the AI Animator animates it for real. Then fine-tune every frame on your own timeline.</p>
        </div>
        <AuthShowcase />
      </section>

      {step === "confirm" && trialState ? (
      <section className={styles.card} aria-label="Confirm your email">
        <div className={styles.cardHead}><p className={styles.stepTag}>Last step</p></div>
        <EmailConfirmBox email={trialState.email} place="card"
          onDone={(state) => window.location.assign(state === "no_trial" ? "/plans" : "/?confirmed=1")} />
        <div className={styles.cardFoot}>
          <p className={styles.fine}>No email? Check your spam folder. <button type="button" className={styles.inlineLink} onClick={() => window.location.assign("/")}>Look around first</button> (the AI starts once you confirm).</p>
        </div>
      </section>
      ) : step === "plan" ? (
      <section className={styles.card} aria-labelledby="plan-heading">
        <div className={styles.cardHead}>
          <p className={styles.stepTag}>Step 2 of 2</p>
          <h2 id="plan-heading">Choose your plan</h2>
          <p>Start free, or pick a plan now. You can change it any time.</p>
          {saved && <p className={styles.codeSaved}>◆ Your {saved.offer === "first50" ? "beta" : "YouTube"} code <strong>{saved.code}</strong> is saved: {offerLine(saved.offer)}</p>}
        </div>
        <div className={styles.switcher} role="group" aria-label="Pay monthly or yearly" data-mode={interval === "year" ? "login" : "signup"}>
          <span className={styles.switcherPill} aria-hidden="true" />
          <button type="button" aria-pressed={interval === PLAN_CYCLE} onClick={() => setInterval(PLAN_CYCLE)}>{PLAN_CYCLE === "week" ? "Weekly" : "Monthly"}</button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Yearly · 2 months free</button>
        </div>
        <div className={styles.planList} role="radiogroup" aria-label="Plans">
          {trialState?.state === "no_trial" && <p className={styles.codeSaved} role="status">{NO_TRIAL_MESSAGE}</p>}
          {((trialState?.state === "no_trial" ? [] : ["trial"]).concat(PAID_PLAN_IDS) as PlanChoice[]).map((id) => {
            const info = ACCOUNT_PLANS[id];
            const deal = id === "trial" ? null : offerPrice(id, interval, offerFromCodes({ first50: saved?.offer === "first50", youtube: saved?.offer === "youtube" }, interval));
            const price = id === "trial" ? "Free" : deal ? offerMoney(deal.firstCents) : interval === "year" ? money(info.yearlyUsd) : money(info.monthlyUsd);
            const per = id === "trial" ? "14 days" : interval === "year" ? "a year" : `a ${CYCLE_WORD}`;
            return (
              <button key={id} type="button" role="radio" aria-checked={plan === id} className={styles.planRow} data-plan={id} onClick={() => setPlan(id)}>
                <span className={styles.planDot} aria-hidden="true" />
                <span className={styles.planText}>
                  <span className={styles.planName}>{id === "trial" ? "Free trial" : info.label}
                    {id === "trial" && <em className={styles.planBadge}>Start here</em>}
                    {id === "creator" && <em className={styles.planBadge}>Most popular</em>}
                  </span>
                  <span className={styles.planLine}>{creditsText(info.credits)}{id === "trial" ? "" : ` every ${CYCLE_WORD}`} · {PLAN_LINE[id]}</span>
                </span>
                <span className={styles.planPrice}>{deal && <s className={styles.planWas}>{money(interval === "year" ? info.yearlyUsd : info.monthlyUsd)}</s>}<strong>{price}</strong><small>{deal ? `${per} · ${deal.badge}` : per}</small></span>
              </button>
            );
          })}
        </div>
        {error && <p className={styles.error} role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>{error}</p>}
        <div className={styles.cardFoot}>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void startPlan()}>
            {plan === "trial" ? "Start free trial" : busy ? "Opening secure payment…" : `Continue with ${ACCOUNT_PLANS[plan].label}`}
          </button>
          <p className={styles.fine}>{plan === "trial" ? "No card needed. Choose a plan any time in Plans." : "You pay right here, securely. Cancel any time in Plans."}</p>
        </div>
      </section>
      ) : mode === "signup" && age === "ask" ? (
      <section className={styles.card} aria-labelledby="age-heading">
        <div className={styles.cardHead}>
          <h2 id="age-heading">Create your account</h2>
          <p>Free for 14 days. No card needed.</p>
        </div>
        <form className={styles.form} onSubmit={answerAge}>
          <label className={styles.field}>
            <span>What year were you born?</span>
            <select ref={yearRef} name="birth-year" required value={birthYear} onChange={(event) => { setBirthYear(event.target.value); setBirthMonth(""); }}>
              <option value="" disabled>Choose a year</option>
              {birthYearChoices().map((choice) => <option key={choice} value={choice}>{choice}</option>)}
            </select>
          </label>
          {askMonth && (
            <label className={styles.field}>
              <span>And the month?</span>
              <select name="birth-month" required value={birthMonth} onChange={(event) => setBirthMonth(event.target.value)}>
                <option value="" disabled>Choose a month</option>
                {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
            </label>
          )}
          <button type="submit" className={styles.primary} disabled={!birthYear || (askMonth && !birthMonth)}>Continue</button>
        </form>
        <div className={styles.cardFoot}>
          <p className={styles.fine}>Already have an account? <button type="button" className={styles.inlineLink} onClick={() => switchMode("login")}>Log in</button></p>
          <p className={styles.fine}>Making an account for your child? <button type="button" className={styles.inlineLink} onClick={() => setAge("parent")}>Parents start here</button></p>
        </div>
      </section>
      ) : mode === "signup" && age === "kid" ? (
      <section className={styles.card} aria-labelledby="kid-heading">
        <div className={styles.cardHead}>
          <h2 id="kid-heading">Ask a parent to create your account</h2>
          <p>A parent or guardian makes the account with their own email. Then you use it to animate.</p>
        </div>
        <div className={styles.form}>
          <button type="button" className={styles.primary} onClick={() => setAge("parent")}>I&apos;m the parent or guardian</button>
        </div>
        <div className={styles.cardFoot}>
          <p className={styles.fine}>Already have an account? <button type="button" className={styles.inlineLink} onClick={() => switchMode("login")}>Log in</button></p>
          <p className={styles.fine}>Read how we look after children&apos;s information in our <a className={styles.inlineLink} href="/privacy#children" target="_blank" rel="noopener">Privacy Policy</a>.</p>
        </div>
      </section>
      ) : (
      <section className={styles.card} aria-labelledby="auth-heading">
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
                <span>{parentForm ? "Your name (the parent or guardian)" : "Name"}</span>
                <input ref={firstFieldRef} id="auth-name" name="name" required autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label className={styles.field}>
              <span>{parentForm ? "Your email (the parent's own)" : "Email"}</span>
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
            {parentForm && (
              <label className={styles.agree}>
                <input type="checkbox" name="parent-consent" required checked={parentAgree} onChange={(event) => setParentAgree(event.target.checked)} />
                <span>I&apos;m the parent or guardian and I agree for my child to use Diamond Animator. I agree to the <a className={styles.inlineLink} href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a className={styles.inlineLink} href="/privacy#children" target="_blank" rel="noopener">Privacy Policy</a>.</span>
              </label>
            )}
            {error && <p className={styles.error} role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>{error}</p>}
            <button type="submit" className={styles.primary} disabled={busy || (parentForm && !parentAgree)}>{action}</button>
          </form>
        )}
                <div className={styles.cardFoot}>
          {mode === "signup" && <p className={styles.fine}>Already have an account? <button type="button" className={styles.inlineLink} onClick={() => switchMode("login")}>Log in</button></p>}
          {mode === "signup" && !parentForm && <p className={styles.fine}>By creating an account you agree to the <a className={styles.inlineLink} href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a className={styles.inlineLink} href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>}
          {mode === "signup" && <p className={styles.fine}>We&apos;ll email {parentForm ? "you (the parent)" : "you"} tips during your free trial. Unsubscribe any time.</p>}
          {mode === "signup" && savedCode && <p className={styles.codeSaved}>◆ Your code <strong>{savedCode}</strong> is saved for when you choose a plan.</p>}
          {mode === "login" && <p className={styles.fine}>New to Diamond Animator? <button type="button" className={styles.inlineLink} onClick={() => switchMode("signup")}>Create an account</button></p>}
          {mode === "forgot" && !resetSent && <p className={styles.fine}>Remembered it? <button type="button" className={styles.inlineLink} onClick={() => switchMode("login")}>Back to log in</button></p>}
        </div>
      </section>
      )}

      <footer className={styles.footer}>© 2026 Diamond Animator</footer>
      {paying && plan !== "trial" && <PaymentDialog payFor={{ kind: "plan", plan, interval, codes: savedCodes }} onClose={() => setPaying(false)} onDone={() => window.location.assign("/credits")} />}
    </main>
  );
}
