"use client";

import { useState, type FormEvent } from "react";
import { ACCOUNT_PREVIEW_PLANS, type AccountPreviewPlan } from "@/src/lib/account/accountConfig";

type EntryMode = "signup" | "login" | null;

const fieldStyle = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: "10px",
  border: "1px solid rgba(121,150,190,0.38)",
  background: "rgba(7,15,27,0.86)",
  color: "#f4f7ff",
  fontSize: "14px",
  boxSizing: "border-box" as const,
};

export function AccountEntry() {
  const [mode, setMode] = useState<EntryMode>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [previewPlan, setPreviewPlan] = useState<AccountPreviewPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!mode || busy || (mode === "signup" && !previewPlan)) return;
    setBusy(true);
    setError(null);
    try {
      const endpoint = mode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const body = mode === "signup"
        ? { name: name.trim(), email: email.trim(), password, previewPlan }
        : { email: email.trim(), password, rememberMe: true };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("auth-failed");
      window.location.assign("/");
    } catch {
      setError(mode === "signup"
        ? "That local account could not be created. Check the fields or use a different email."
        : "The email or password was not accepted.");
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 0%, #102844 0%, #081321 42%, #050b13 100%)", color: "#f4f7ff", display: "grid", placeItems: "center", padding: "28px" }}>
      <section aria-labelledby="account-entry-title" style={{ width: "min(720px, 100%)", border: "1px solid rgba(93,159,255,0.32)", borderRadius: "18px", background: "rgba(10,19,32,0.97)", boxShadow: "0 28px 80px rgba(0,0,0,0.48)", padding: "30px" }}>
        <div style={{ color: "#76b7ff", fontSize: "12px", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>Local account review</div>
        <h1 id="account-entry-title" style={{ margin: "8px 0 6px", fontSize: "30px" }}>Diamond Animator</h1>
        <p style={{ margin: 0, color: "rgba(222,232,246,0.78)", lineHeight: 1.55 }}>
          Account credentials are saved only in this local app copy. Projects, chats, notifications, and Dashboard usage remain browser-local and may be visible to anyone who uses this browser.
        </p>

        {mode === null ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px", marginTop: "26px" }}>
            <button type="button" onClick={() => setMode("signup")} style={{ padding: "16px", borderRadius: "12px", border: "1px solid #4594ff", background: "linear-gradient(180deg,#1768d3,#0f4fa8)", color: "white", fontSize: "16px", fontWeight: 800, cursor: "pointer" }}>Sign in</button>
            <button type="button" onClick={() => setMode("login")} style={{ padding: "16px", borderRadius: "12px", border: "1px solid rgba(121,150,190,0.48)", background: "rgba(18,31,50,0.94)", color: "white", fontSize: "16px", fontWeight: 800, cursor: "pointer" }}>Log in</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ fontWeight: 850, fontSize: "20px" }}>{mode === "signup" ? "Create a local test account" : "Log in to your local account"}</div>
              <div style={{ color: "rgba(208,220,238,0.7)", fontSize: "13px", marginTop: "5px" }}>
                {mode === "signup" ? "Email ownership and password recovery are not available in this local review." : "Returning accounts use the preview selected during account creation."}
              </div>
            </div>

            {mode === "signup" && <div style={{ color: "#8fc5ff", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Step 1 · Enter your local account details</div>}
            {mode === "signup" && <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>Display name<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} style={fieldStyle} /></label>}
            <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>Login email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} style={fieldStyle} /></label>
            <label style={{ display: "grid", gap: "6px", fontSize: "13px" }}>Password<input required type="password" minLength={8} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} style={fieldStyle} /></label>

            {mode === "signup" && (
              <fieldset style={{ border: 0, padding: 0, margin: "4px 0 0" }}>
                <legend style={{ fontWeight: 800, marginBottom: "9px" }}>Step 2 · Choose one local test preview</legend>
                <div style={{ color: "#ffd58a", fontSize: "12px", lineHeight: 1.5, marginBottom: "10px" }}>LOCAL TEST PREVIEW — no real charge, subscription, allowance, or provider limit is created. This choice does not change AI access or model behavior.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "9px" }}>
                  {ACCOUNT_PREVIEW_PLANS.map((plan) => {
                    const selected = previewPlan === plan.id;
                    return <button key={plan.id} type="button" aria-pressed={selected} onClick={() => setPreviewPlan(plan.id)} style={{ minHeight: "88px", padding: "12px 8px", borderRadius: "11px", border: selected ? "2px solid #57a2ff" : "1px solid rgba(121,150,190,0.38)", background: selected ? "rgba(31,100,188,0.35)" : "rgba(13,25,42,0.86)", color: "white", cursor: "pointer", fontWeight: 800 }}><span style={{ display: "block", color: "#8fc5ff", fontSize: "10px", letterSpacing: "0.1em", marginBottom: "7px" }}>TEST PREVIEW</span>{plan.label}<span style={{ display: "block", color: "rgba(223,232,246,0.68)", fontSize: "11px", fontWeight: 500, marginTop: "6px" }}>No real charge</span></button>;
                  })}
                </div>
              </fieldset>
            )}

            {mode === "login" && <div style={{ color: "rgba(208,220,238,0.68)", fontSize: "12px" }}>Password recovery is not available in this local review.</div>}
            {error && <div role="alert" style={{ color: "#ffb0aa", fontSize: "13px" }}>{error}</div>}
            {mode === "signup" && <div style={{ color: "#8fc5ff", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Step 3 · Create the account</div>}
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button type="submit" disabled={busy || (mode === "signup" && !previewPlan)} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "1px solid #4594ff", background: busy || (mode === "signup" && !previewPlan) ? "rgba(54,78,109,0.7)" : "#1768d3", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>{busy ? "Working…" : mode === "signup" ? "Create account and continue" : "Log in"}</button>
              <button type="button" disabled={busy} onClick={() => { setMode(null); setError(null); }} style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(121,150,190,0.38)", background: "transparent", color: "rgba(231,238,248,0.84)", cursor: "pointer" }}>Back</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
