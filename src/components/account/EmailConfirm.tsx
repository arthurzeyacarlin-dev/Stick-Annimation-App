"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import styles from "./EmailConfirm.module.css";

// (Dad, Nov 26) "People should have to confirm their email address to sign up for a free trial." The confirm box: the 6-digit code
// from the email (the email's link does the same), "Send the email again" and "Wrong email? Fix it". `place="card"` = the
// waiting screen right after sign-up; `place="float"` = a small card on every page while the email isn't confirmed (looking
// around is open; the AI waits). Nothing about logging in or out changes.

type State = "confirm" | "confirmed" | "no_trial";
const call = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/account/email-confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as { error?: string; state?: State; email?: string; sent?: boolean } | null;
  if (!response.ok) throw new Error(data?.error || "That didn't work. Try again in a minute.");
  return data ?? {};
};

export function EmailConfirmBox({ email: firstEmail, place, onDone, onLater }: {
  email: string; place: "card" | "float"; onDone: (state: State) => void; onLater?: () => void;
}) {
  const [email, setEmail] = useState(firstEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const run = async (body: Record<string, unknown>, good?: string) => {
    if (busy) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const data = await call(body);
      if (data.email) setEmail(data.email);
      if (data.state && data.state !== "confirm") { onDone(data.state); return; }
      if (good) setNote(good);
      setFixing(false); setCode("");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That didn't work. Try again in a minute.");
    } finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.trim().length === 6) void run({ action: "code", code: code.trim() }); };
  const change = (event: FormEvent) => { event.preventDefault(); if (newEmail.trim()) void run({ action: "change", email: newEmail.trim() }, "Done. We sent a new code to your new address."); };
  return (
    <section className={styles.box} data-place={place} aria-labelledby="email-confirm-title">
      <div className={styles.head}>
        <h2 id="email-confirm-title" className={styles.title}>{place === "card" ? "Check your email" : "Confirm your email to start your free trial"}</h2>
        {onLater && <button type="button" className={styles.later} onClick={onLater}>Later</button>}
      </div>
      <p className={styles.text}>
        We sent a 6-digit code to <strong>{email}</strong>. Type it here, or open the link in that email. Your free trial starts the moment you confirm.
      </p>
      {!fixing ? (
        <form className={styles.row} onSubmit={submit}>
          <input className={styles.code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="123456" aria-label="The 6-digit code"
            value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus={place === "card"} />
          <button type="submit" className={styles.primary} disabled={busy || code.length !== 6}>{busy ? "Checking" : "Confirm"}</button>
        </form>
      ) : (
        <form className={styles.row} onSubmit={change}>
          <input className={styles.email} type="email" autoComplete="email" placeholder="your real email" aria-label="Your email address" value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)} autoFocus maxLength={254} />
          <button type="submit" className={styles.primary} disabled={busy || !newEmail.trim()}>{busy ? "Saving" : "Use this email"}</button>
        </form>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {note && <p className={styles.note} role="status">{note}</p>}
      <div className={styles.links}>
        <button type="button" className={styles.link} disabled={busy} onClick={() => void run({ action: "send" }, "Sent! It can take a minute. Check your spam folder too.")}>Send the email again</button>
        <button type="button" className={styles.link} disabled={busy} onClick={() => { setFixing(!fixing); setError(null); setNote(null); }}>{fixing ? "Back to the code" : "Wrong email? Fix it"}</button>
      </div>
    </section>
  );
}

const HIDDEN_ON = ["/status", "/reset-password", "/privacy", "/terms"];

/** The small card on every page while the email isn't confirmed (it reads the account's state once per page). */
export function EmailConfirmFloat() {
  const pathname = usePathname() ?? "/";
  const [account, setAccount] = useState<{ state: State; email: string } | null>(null);
  const [small, setSmall] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/account/email-confirm", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((data: { state?: State; email?: string } | null) => { if (alive && data?.state && data.email) setAccount({ state: data.state, email: data.email }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [pathname]);
  if (!account || account.state !== "confirm" || HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;
  if (done) return <aside className={styles.float} role="status"><p className={styles.text}><strong>Confirmed!</strong> Your free trial has started.</p></aside>;
  if (small) return <button type="button" className={styles.pill} onClick={() => setSmall(false)}>Confirm your email</button>;
  return (
    <aside className={styles.float}>
      <EmailConfirmBox email={account.email} place="float" onLater={() => setSmall(true)}
        onDone={(state) => { if (state === "no_trial") { window.location.assign("/plans"); return; } setDone(true); window.setTimeout(() => window.location.reload(), 1200); }} />
    </aside>
  );
}
