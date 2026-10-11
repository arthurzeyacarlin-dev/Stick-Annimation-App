import "server-only";

// SPEC-0020 Phase 6: problem reports, kept on the server in .local/spec0015-phase3/problem-reports.sqlite
// (next to the account and plan databases; created on first use). Reports are app-wide — the owner reads them
// all at /reports. A screenshot (already shrunk in the browser, at most ~1 MB) is kept inside its report row.
// The rules (what a report may contain, 5 per hour) live in problemReports.ts.
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  checkProblemReportRateLimit, isProblemReportScreen, isProblemReportStatus, PROBLEM_REPORT_RATE_WINDOW_MS,
  type ProblemReportInput, type ProblemReportRateCheck, type ProblemReportStatus, type ProblemReportSummary,
} from "./problemReports.ts";

type ReportRow = {
  id: string; created_at: number; user_id: string; user_name: string; user_email: string; screen: string; text: string;
  has_screenshot: number; status: string; app_version: string | null;
};
type ReportsGlobal = typeof globalThis & { diamondProblemReportsDatabase?: Database.Database };

const owner = globalThis as ReportsGlobal;

function database() {
  if (owner.diamondProblemReportsDatabase) return owner.diamondProblemReportsDatabase;
  const root = path.resolve(process.cwd(), ".local/spec0015-phase3");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, "problem-reports.sqlite");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS problem_report_v1 (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      screen TEXT NOT NULL,
      text TEXT NOT NULL,
      screenshot TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      status_changed_at INTEGER,
      app_version TEXT
    );
    CREATE INDEX IF NOT EXISTS problem_report_v1_created ON problem_report_v1(created_at);
    CREATE INDEX IF NOT EXISTS problem_report_v1_user_time ON problem_report_v1(user_id, created_at);
    -- Which reports each owner account has already been told about (bell notification).
    CREATE TABLE IF NOT EXISTS problem_report_seen_v1 (
      owner_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, report_id)
    );
  `);
  fs.chmodSync(file, 0o600);
  owner.diamondProblemReportsDatabase = db;
  return db;
}

const SUMMARY_COLUMNS = "id, created_at, user_id, user_name, user_email, screen, text, screenshot IS NOT NULL AS has_screenshot, status, app_version";

const toSummary = (row: ReportRow): ProblemReportSummary => ({
  id: row.id,
  createdAt: row.created_at,
  userId: row.user_id,
  userName: row.user_name,
  userEmail: row.user_email,
  screen: isProblemReportScreen(row.screen) ? row.screen : "other",
  text: row.text,
  hasScreenshot: row.has_screenshot === 1,
  status: isProblemReportStatus(row.status) ? row.status : "new",
  appVersion: row.app_version,
});

export type SaveProblemReportResult = { ok: true; report: ProblemReportSummary } | Extract<ProblemReportRateCheck, { ok: false }>;

/** Saves a checked report, unless this person already sent 5 in the last hour. */
export function saveProblemReport(input: ProblemReportInput & {
  userId: string; userName: string; userEmail: string; appVersion: string | null;
}, now = Date.now()): SaveProblemReportResult {
  const db = database();
  const save = db.transaction((): SaveProblemReportResult => {
    const recent = (db.prepare("SELECT created_at FROM problem_report_v1 WHERE user_id = ? AND created_at > ?")
      .all(input.userId, now - PROBLEM_REPORT_RATE_WINDOW_MS) as { created_at: number }[]).map((row) => row.created_at);
    const rate = checkProblemReportRateLimit(recent, now);
    if (!rate.ok) return rate;
    const id = `pr_${randomUUID().replace(/-/g, "")}`;
    db.prepare(`INSERT INTO problem_report_v1 (id, created_at, user_id, user_name, user_email, screen, text, screenshot, status, app_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`)
      .run(id, now, input.userId, input.userName, input.userEmail, input.screen, input.text, input.screenshot, input.appVersion);
    return { ok: true, report: toSummary(db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 WHERE id = ?`).get(id) as ReportRow) };
  });
  return save.immediate();
}

/** Newest first. `filter` = "new", "done" or "all". */
export function listProblemReports(filter: ProblemReportStatus | "all", limit = 300): ProblemReportSummary[] {
  const rows = filter === "all"
    ? database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit)
    : database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(filter, limit);
  return (rows as ReportRow[]).map(toSummary);
}

export function countNewProblemReports() {
  return (database().prepare("SELECT COUNT(*) AS count FROM problem_report_v1 WHERE status = 'new'").get() as { count: number }).count;
}

/** New reports this owner account hasn't been told about yet (for the bell), oldest first. */
export function listUnseenProblemReports(ownerId: string, limit = 20): ProblemReportSummary[] {
  const rows = database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 r
    WHERE r.status = 'new' AND NOT EXISTS (SELECT 1 FROM problem_report_seen_v1 s WHERE s.owner_id = ? AND s.report_id = r.id)
    ORDER BY r.created_at DESC, r.id DESC LIMIT ?`).all(ownerId, limit) as ReportRow[];
  return rows.map(toSummary).reverse();
}

export function markProblemReportsSeen(ownerId: string, reportIds: readonly string[], now = Date.now()) {
  const db = database();
  const insert = db.prepare("INSERT OR IGNORE INTO problem_report_seen_v1 (owner_id, report_id, seen_at) SELECT ?, id, ? FROM problem_report_v1 WHERE id = ?");
  db.transaction(() => { for (const id of reportIds) insert.run(ownerId, now, id); })();
}

/** "Mark done" / "Mark new". Returns false when there is no such report. */
export function setProblemReportStatus(reportId: string, status: ProblemReportStatus, now = Date.now()) {
  return database().prepare("UPDATE problem_report_v1 SET status = ?, status_changed_at = ? WHERE id = ?").run(status, now, reportId).changes > 0;
}

/** The screenshot as bytes + its picture type, or null when the report has none. */
export function readProblemReportScreenshot(reportId: string): { type: string; bytes: Buffer } | null {
  const row = database().prepare("SELECT screenshot FROM problem_report_v1 WHERE id = ?").get(reportId) as { screenshot: string | null } | undefined;
  const match = row?.screenshot ? /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(row.screenshot) : null;
  return match ? { type: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}
