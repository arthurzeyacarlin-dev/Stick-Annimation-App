"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServiceStatus, SetServiceState, SupportArea } from "@/src/lib/support/supportRules";
import { STATUS_CHANGED_EVENT } from "./StatusBanner";
import styles from "./ProblemReportsScreen.module.css";

// SPEC-0027 (Nov 26): the owner's switches for the status page + banner, at the top of /reports.
// "We're fixing it" shows the banner on every page; "Resolved" shows "Resolved" for 2 hours; "Working" clears it.
// "Checking reports" comes by itself when 3+ people report the same part within 30 minutes.
export function ServiceStatusPanel() {
  const [statuses, setStatuses] = useState<ServiceStatus[] | null>(null);
  const [notes, setNotes] = useState<Partial<Record<SupportArea, string>>>({});
  const [busy, setBusy] = useState<SupportArea | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/support/status", { cache: "no-store" });
      const body = await response.json() as { statuses?: ServiceStatus[] };
      if (Array.isArray(body.statuses)) setStatuses(body.statuses);
    } catch { setError("The app status couldn't be loaded."); }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  const set = async (area: SupportArea, state: SetServiceState) => {
    setBusy(area);
    setError(null);
    try {
      const response = await fetch("/api/support/status", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ area, state, message: notes[area] ?? "" }),
      });
      const body = await response.json().catch(() => null) as { statuses?: ServiceStatus[]; error?: string } | null;
      if (!response.ok || !Array.isArray(body?.statuses)) throw new Error(body?.error || "The status couldn't be saved.");
      setStatuses(body.statuses);
      window.dispatchEvent(new Event(STATUS_CHANGED_EVENT));
      setNotes((current) => ({ ...current, [area]: "" }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The status couldn't be saved.");
    }
    setBusy(null);
  };

  return (
    <section className={styles.statusPanel} aria-label="App status">
      <h2 className={styles.sectionTitle}>App status <a href="/status" className={styles.statusLink} target="_blank" rel="noreferrer">Open the status page</a></h2>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!statuses && !error && <p className={styles.muted}>Loading the status</p>}
      {statuses?.map((status) => (
        <div key={status.area} className={styles.statusRow} data-state={status.state}>
          <span className={styles.statusName}>{status.label}</span>
          <span className={styles.statusState}>{status.stateLabel}{status.message ? ` — ${status.message}` : ""}</span>
          <input className={styles.statusNote} value={notes[status.area] ?? ""} maxLength={300} placeholder="Optional words for the banner (e.g. Back in 20 minutes.)"
            aria-label={`Optional words for ${status.label}`} onChange={(event) => setNotes((current) => ({ ...current, [status.area]: event.target.value }))} />
          <span className={styles.actions}>
            <button type="button" className={styles.button} disabled={busy === status.area} onClick={() => void set(status.area, "fixing")}>We&rsquo;re fixing it</button>
            <button type="button" className={styles.button} disabled={busy === status.area} onClick={() => void set(status.area, "resolved")}>Resolved</button>
            <button type="button" className={styles.button} disabled={busy === status.area} onClick={() => void set(status.area, "ok")}>Working</button>
          </span>
        </div>
      ))}
    </section>
  );
}
