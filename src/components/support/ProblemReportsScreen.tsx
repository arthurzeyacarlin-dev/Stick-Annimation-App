"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/src/components/ui/BackButton";
import { CloseButton } from "@/src/components/ui/CloseButton";
import { problemReportScreenLabel, type ProblemReportStatus, type ProblemReportSummary } from "@/src/lib/account/problemReports";
import { PROBLEM_REPORTS_CHANGED_EVENT } from "@/src/lib/notifications/problemReportObserver";
import styles from "./ProblemReportsScreen.module.css";

// SPEC-0020 Phase 6: the owner's inbox of problem reports (newest first). Only buttons get boxes (Arthur);
// the reports themselves are plain text with thin lines between them.
type Filter = ProblemReportStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [{ value: "new", label: "New" }, { value: "done", label: "Done" }, { value: "all", label: "All" }];
const EMPTY: Record<Filter, string> = { new: "No new reports.", done: "No reports marked done yet.", all: "No reports yet." };
const when = (time: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(time);
const screenshotUrl = (id: string) => `/api/account/problem-reports/${encodeURIComponent(id)}/screenshot`;

export function ProblemReportsScreen() {
  const [filter, setFilter] = useState<Filter>("new");
  const [reports, setReports] = useState<ProblemReportSummary[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProblemReportSummary | null>(null);

  const load = useCallback(async (which: Filter) => {
    try {
      const response = await fetch(`/api/account/problem-reports?status=${which}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { schema?: string; reports?: ProblemReportSummary[]; newCount?: number; error?: string } | null;
      if (!response.ok || body?.schema !== "diamond-problem-report-list/v1" || !Array.isArray(body.reports)) {
        throw new Error(typeof body?.error === "string" ? body.error : "Reports couldn't be loaded. Reload the page and try again.");
      }
      setReports(body.reports);
      setNewCount(typeof body.newCount === "number" ? body.newCount : 0);
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "Reports couldn't be loaded. Reload the page and try again.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(filter), 0);
    const onFocus = () => void load(filter);
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(first); window.removeEventListener("focus", onFocus); };
  }, [filter, load]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setViewing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  const setStatus = async (report: ProblemReportSummary, status: ProblemReportStatus) => {
    setBusyId(report.id);
    setError(null);
    try {
      const response = await fetch("/api/account/problem-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, status }),
      });
      const body = await response.json().catch(() => null) as { newCount?: number; error?: string } | null;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "That change couldn't be saved. Try again.");
      if (typeof body?.newCount === "number") setNewCount(body.newCount);
      setReports((current) => (current ?? []).flatMap((row) => row.id !== report.id ? [row] : filter === "all" ? [{ ...row, status }] : []));
      window.dispatchEvent(new Event(PROBLEM_REPORTS_CHANGED_EVENT));
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "That change couldn't be saved. Try again.");
    }
    setBusyId(null);
  };

  return (
    <main className={styles.main}>
      <div className={styles.frame}>
        <BackButton href="/">Back to Home</BackButton>
        <p className={styles.eyebrow}>Diamond Animator</p>
        <h1 className={styles.title}>Problem reports</h1>
        <p className={styles.lead}>{newCount === 0 ? "No new reports." : `${newCount} new report${newCount === 1 ? "" : "s"}.`} Only you can see this page.</p>

        <div className={styles.segmented} role="group" aria-label="Show reports">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => { setFilter(option.value); setReports(null); }}>{option.label}</button>
          ))}
        </div>

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {reports === null && !error && <p className={styles.muted}>Loading reports…</p>}
        {reports && reports.length === 0 && <p className={styles.muted}>{EMPTY[filter]}</p>}

        {reports && reports.length > 0 && (
          <ul className={styles.list}>
            {reports.map((report) => (
              <li key={report.id} className={styles.report}>
                <div className={styles.meta}>
                  <span className={styles.who}><strong>{report.userName || report.userEmail}</strong>{report.userName && <span className={styles.email}>{report.userEmail}</span>}</span>
                  <span className={styles.details}>
                    <time dateTime={new Date(report.createdAt).toISOString()}>{when(report.createdAt)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{problemReportScreenLabel(report.screen)}</span>
                    {report.appVersion && <><span aria-hidden="true">·</span><span>Version {report.appVersion}</span></>}
                    <span aria-hidden="true">·</span>
                    <span className={report.status === "new" ? styles.statusNew : undefined}>{report.status === "new" ? "New" : "Done"}</span>
                  </span>
                </div>
                <p className={styles.text}>{report.text}</p>
                <div className={styles.actions}>
                  {report.hasScreenshot && (
                    <button type="button" className={styles.thumbButton} onClick={() => setViewing(report)} aria-label={`Open the screenshot from ${report.userName || report.userEmail} full size`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- owner-only image from our own API */}
                      <img src={screenshotUrl(report.id)} alt="" className={styles.thumb} loading="lazy" />
                    </button>
                  )}
                  <button type="button" className={styles.button} disabled={busyId === report.id} onClick={() => void setStatus(report, report.status === "new" ? "done" : "new")}>
                    {report.status === "new" ? "Mark done" : "Mark new"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing && (
        <div className={styles.viewerScrim} onClick={() => setViewing(null)}>
          <div role="dialog" aria-modal="true" aria-label="Screenshot" className={styles.viewer} onClick={(event) => event.stopPropagation()}>
            <div className={styles.viewerHead}>
              <span>Screenshot from {viewing.userName || viewing.userEmail}</span>
              <CloseButton label="Close screenshot" onClick={() => setViewing(null)} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- owner-only image from our own API */}
            <img src={screenshotUrl(viewing.id)} alt={`Screenshot from ${viewing.userName || viewing.userEmail}`} className={styles.full} />
          </div>
        </div>
      )}
    </main>
  );
}
