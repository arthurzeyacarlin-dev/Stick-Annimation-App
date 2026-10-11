import { publishValidatedNotificationTerminalV1 } from "./notificationStorage.ts";

// SPEC-0020 Phase 6: the owner's bell for new problem reports.
// Notifications live in each account's own storage and are written by that account's browser, so the person who
// sends a report can't put a notification into the owner's account. Instead the owner's browser asks the server
// when the app opens, every 3 minutes while the page is visible, and when the window gets focus. Each new report
// becomes one notification; the server then remembers the owner has been told (so it shows only once, in any browser).
// For everyone else the server answers "not found" on the first ask, and this stops asking.

export const PROBLEM_REPORTS_CHANGED_EVENT = "diamond-problem-reports-changed";
const POLL_MS = 3 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;

type UnseenReport = { id: string; createdAt: number; reporterName: string; excerpt: string };
type SummaryBody = { schema?: string; newCount?: unknown; unseen?: unknown };
export type ProblemReportSummaryStateV1 = { owner: boolean; newCount: number };

let state: ProblemReportSummaryStateV1 = { owner: false, newCount: 0 };
const listeners = new Set<(value: ProblemReportSummaryStateV1) => void>();
let stopCurrent: (() => void) | null = null;

const emit = (next: ProblemReportSummaryStateV1) => {
  state = next;
  for (const listener of listeners) listener(next);
};

/** The side menu's "Problem reports" row: shown only for the owner, with the count of new reports. */
export function subscribeProblemReportSummaryV1(listener: (value: ProblemReportSummaryStateV1) => void) {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}

const isUnseen = (value: unknown): value is UnseenReport => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.createdAt === "number" && typeof row.reporterName === "string" && typeof row.excerpt === "string";
};

/** Starts the owner check for the signed-in account. Returns a stop function. */
export function startProblemReportObserverV1(accountId: string | null) {
  stopCurrent?.();
  emit({ owner: false, newCount: 0 });
  if (!accountId || typeof window === "undefined") return () => undefined;

  let stopped = false;
  let running = false;
  let lastAsk = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener("focus", askSoon);
    window.removeEventListener(PROBLEM_REPORTS_CHANGED_EVENT, askNow);
    if (stopCurrent === stop) stopCurrent = null;
  };

  const ask = async (force: boolean) => {
    if (stopped || running || (!force && Date.now() - lastAsk < MIN_GAP_MS)) return;
    running = true;
    lastAsk = Date.now();
    try {
      const response = await fetch("/api/account/problem-reports?summary=1", { cache: "no-store" });
      if (response.status === 404 || response.status === 401 || response.status === 403) {
        // Not the owner (or signed out): no menu row, no bell, stop asking.
        if (!stopped) emit({ owner: false, newCount: 0 });
        stop();
        return;
      }
      if (!response.ok) return;
      const body = await response.json() as SummaryBody;
      if (stopped || body.schema !== "diamond-problem-report-summary/v1" || typeof body.newCount !== "number") return;
      emit({ owner: true, newCount: body.newCount });
      const unseen = Array.isArray(body.unseen) ? body.unseen.filter(isUnseen) : [];
      const told: string[] = [];
      for (const report of unseen) {
        try {
          await publishValidatedNotificationTerminalV1({
            schema: "problem-report-notification-terminal/v1",
            reportId: report.id,
            reporterName: report.reporterName,
            excerpt: report.excerpt,
            reportedAt: report.createdAt,
          });
          told.push(report.id);
        } catch { /* try again next time */ }
      }
      if (told.length && !stopped) {
        await fetch("/api/account/problem-reports", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seenIds: told }),
        }).catch(() => undefined);
      }
    } catch { /* offline or the server is busy: try again later */ }
    finally { running = false; }
  };
  function askSoon() { if (document.visibilityState === "visible") void ask(false); }
  function askNow() { void ask(true); }

  window.addEventListener("focus", askSoon);
  window.addEventListener(PROBLEM_REPORTS_CHANGED_EVENT, askNow);
  timer = setInterval(askSoon, POLL_MS);
  void ask(true);
  stopCurrent = stop;
  return stop;
}
