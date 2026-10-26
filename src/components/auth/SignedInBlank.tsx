"use client";

import { useState } from "react";
import styles from "./AuthScreen.module.css";

// Redesign Phase 1: after logging in there is nothing yet (Phase 2 builds the main interface). A quiet Log out lets
// the sign-in screens be tried again. Logging out uses the same endpoint as before.
export function SignedInBlank() {
  const [busy, setBusy] = useState(false);
  const logOut = async () => {
    if (busy) return;
    setBusy(true);
    try { await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* the reload below shows the real state */ }
    window.location.assign("/");
  };
  return (
    <main className={styles.blank}>
      <button type="button" className={styles.blankLogout} onClick={() => void logOut()} disabled={busy}>{busy ? "Logging out…" : "Log out"}</button>
    </main>
  );
}
