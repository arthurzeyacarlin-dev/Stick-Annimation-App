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
import {
  areaFromScreen, isSetServiceState, isSupportArea, isTicketArea, isTicketMessageKind,
  type RecentTicket, type SetServiceState, type StoredServiceStatus, type SupportArea, type TicketArea, type TicketMessageKind,
} from "../support/supportRules.ts";

type ReportRow = {
  id: string; created_at: number; user_id: string; user_name: string; user_email: string; screen: string; text: string;
  has_screenshot: number; status: string; app_version: string | null; area: string | null; last_activity_at: number | null; user_unread: number | null;
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
    -- SPEC-0027 (Nov 26): the conversation of a ticket (the first message is the report's own text).
    CREATE TABLE IF NOT EXISTS problem_report_message_v1 (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS problem_report_message_v1_report ON problem_report_message_v1(report_id, created_at);
    -- SPEC-0027: the status page (one row per area, set by the owner or the ticket API) and alerts already sent.
    CREATE TABLE IF NOT EXISTS service_status_v1 (
      area TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      message TEXT,
      changed_at INTEGER NOT NULL,
      changed_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS support_alert_v1 (
      key TEXT PRIMARY KEY,
      sent_at INTEGER NOT NULL
    );
  `);
  // SPEC-0027: three new columns on the old reports table (old rows keep working: no area = from "Where were you?").
  const columns = new Set((db.prepare("PRAGMA table_info(problem_report_v1)").all() as { name: string }[]).map((column) => column.name));
  if (!columns.has("area")) db.exec("ALTER TABLE problem_report_v1 ADD COLUMN area TEXT");
  if (!columns.has("last_activity_at")) db.exec("ALTER TABLE problem_report_v1 ADD COLUMN last_activity_at INTEGER");
  if (!columns.has("user_unread")) db.exec("ALTER TABLE problem_report_v1 ADD COLUMN user_unread INTEGER NOT NULL DEFAULT 0");
  fs.chmodSync(file, 0o600);
  owner.diamondProblemReportsDatabase = db;
  return db;
}

const SUMMARY_COLUMNS = "id, created_at, user_id, user_name, user_email, screen, text, screenshot IS NOT NULL AS has_screenshot, status, app_version, area, last_activity_at, user_unread";

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
  area: isTicketArea(row.area) ? row.area : areaFromScreen(row.screen),
  lastActivityAt: row.last_activity_at ?? row.created_at,
  userUnread: row.user_unread === 1,
});

export type SaveProblemReportResult = { ok: true; report: ProblemReportSummary } | Extract<ProblemReportRateCheck, { ok: false }>;

/** Saves a checked report, unless this person already sent 5 in the last hour. */
export function saveProblemReport(input: ProblemReportInput & {
  userId: string; userName: string; userEmail: string; appVersion: string | null; area?: TicketArea;
}, now = Date.now()): SaveProblemReportResult {
  const db = database();
  const save = db.transaction((): SaveProblemReportResult => {
    const recent = (db.prepare("SELECT created_at FROM problem_report_v1 WHERE user_id = ? AND created_at > ?")
      .all(input.userId, now - PROBLEM_REPORT_RATE_WINDOW_MS) as { created_at: number }[]).map((row) => row.created_at);
    const rate = checkProblemReportRateLimit(recent, now);
    if (!rate.ok) return rate;
    const id = `pr_${randomUUID().replace(/-/g, "")}`;
    db.prepare(`INSERT INTO problem_report_v1 (id, created_at, user_id, user_name, user_email, screen, text, screenshot, status, app_version, area, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`)
      .run(id, now, input.userId, input.userName, input.userEmail, input.screen, input.text, input.screenshot, input.appVersion,
        input.area ?? areaFromScreen(input.screen), now);
    return { ok: true, report: toSummary(db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 WHERE id = ?`).get(id) as ReportRow) };
  });
  return save.immediate();
}

/** Newest activity first. `filter` = "new", "working", "done" or "all". */
export function listProblemReports(filter: ProblemReportStatus | "all", limit = 300): ProblemReportSummary[] {
  const order = "ORDER BY COALESCE(last_activity_at, created_at) DESC, id DESC";
  const rows = filter === "all"
    ? database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 ${order} LIMIT ?`).all(limit)
    : database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 WHERE status = ? ${order} LIMIT ?`).all(filter, limit);
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

// ---- SPEC-0027: tickets (a report + its conversation) ---------------------------------------------------------------

export type TicketMessage = { id: string; createdAt: number; kind: TicketMessageKind; author: string; text: string };
export type Ticket = ProblemReportSummary & { messages: TicketMessage[] };
type MessageRow = { id: string; report_id: string; created_at: number; kind: string; author: string; text: string };

const toMessage = (row: MessageRow): TicketMessage => ({
  id: row.id, createdAt: row.created_at, kind: isTicketMessageKind(row.kind) ? row.kind : "note", author: row.author, text: row.text,
});

export function readProblemReport(reportId: string): ProblemReportSummary | null {
  const row = database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 WHERE id = ?`).get(reportId) as ReportRow | undefined;
  return row ? toSummary(row) : null;
}

/** One ticket with its conversation. `forUser` = only what the person may see (their messages and Arthur's replies). */
export function readTicket(reportId: string, forUser = false): Ticket | null {
  const report = readProblemReport(reportId);
  if (!report) return null;
  const rows = database().prepare("SELECT * FROM problem_report_message_v1 WHERE report_id = ? ORDER BY created_at, id").all(reportId) as MessageRow[];
  const messages = rows.map(toMessage).filter((message) => !forUser || message.kind === "user" || message.kind === "owner");
  return { ...report, messages };
}

/** The person's own tickets, newest activity first, with what they may see of each conversation. */
export function listUserTickets(userId: string, limit = 30): Ticket[] {
  const rows = database().prepare(`SELECT ${SUMMARY_COLUMNS} FROM problem_report_v1 WHERE user_id = ?
    ORDER BY COALESCE(last_activity_at, created_at) DESC, id DESC LIMIT ?`).all(userId, limit) as ReportRow[];
  return rows.flatMap((row) => { const ticket = readTicket(row.id, true); return ticket ? [ticket] : []; });
}

/**
 * Adds a message to a ticket. A reply from the owner marks it unread for the person (and a "new" ticket becomes
 * "working"); a message from the person makes the ticket "new" again (it needs Arthur). A draft or note changes nothing for the person.
 */
export function addTicketMessage(reportId: string, kind: TicketMessageKind, author: string, text: string, now = Date.now()): TicketMessage | null {
  const db = database();
  return db.transaction((): TicketMessage | null => {
    if (!db.prepare("SELECT 1 FROM problem_report_v1 WHERE id = ?").get(reportId)) return null;
    const id = `tm_${randomUUID().replace(/-/g, "")}`;
    db.prepare("INSERT INTO problem_report_message_v1 (id, report_id, created_at, kind, author, text) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, reportId, now, kind, author.slice(0, 80), text);
    if (kind === "owner") {
      db.prepare("UPDATE problem_report_v1 SET user_unread = 1, last_activity_at = ?, status = CASE WHEN status = 'new' THEN 'working' ELSE status END, status_changed_at = ? WHERE id = ?").run(now, now, reportId);
      db.prepare("DELETE FROM problem_report_message_v1 WHERE report_id = ? AND kind = 'draft'").run(reportId);
    } else if (kind === "user") {
      db.prepare("UPDATE problem_report_v1 SET last_activity_at = ?, status = 'new', status_changed_at = ? WHERE id = ?").run(now, now, reportId);
    }
    return { id, createdAt: now, kind, author, text };
  }).immediate();
}

export function deleteTicketDraft(reportId: string, messageId: string) {
  return database().prepare("DELETE FROM problem_report_message_v1 WHERE id = ? AND report_id = ? AND kind = 'draft'").run(messageId, reportId).changes > 0;
}

/** The person opened their messages: Arthur's replies are read. */
export function markUserTicketsRead(userId: string) {
  database().prepare("UPDATE problem_report_v1 SET user_unread = 0 WHERE user_id = ? AND user_unread = 1").run(userId);
}

export function countUserUnread(userId: string) {
  return (database().prepare("SELECT COUNT(*) AS count FROM problem_report_v1 WHERE user_id = ? AND user_unread = 1").get(userId) as { count: number }).count;
}

/** Tickets sent since `since` (for the "3 people in 30 minutes" rule). */
export function listRecentTickets(since: number): RecentTicket[] {
  const rows = database().prepare("SELECT area, screen, user_id, created_at FROM problem_report_v1 WHERE created_at > ?").all(since) as { area: string | null; screen: string; user_id: string; created_at: number }[];
  return rows.map((row) => ({ area: isTicketArea(row.area) ? row.area : areaFromScreen(row.screen), userId: row.user_id, createdAt: row.created_at }));
}

// ---- SPEC-0027: the status page ----------------------------------------------------------------------------------------

export function readServiceStatus(): StoredServiceStatus[] {
  const rows = database().prepare("SELECT area, state, message, changed_at FROM service_status_v1").all() as { area: string; state: string; message: string | null; changed_at: number }[];
  return rows.flatMap((row) => isSupportArea(row.area) && isSetServiceState(row.state)
    ? [{ area: row.area, state: row.state, message: row.message, changedAt: row.changed_at }] : []);
}

export function setServiceStatus(area: SupportArea, state: SetServiceState, message: string | null, changedBy: string, now = Date.now()) {
  database().prepare(`INSERT INTO service_status_v1 (area, state, message, changed_at, changed_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(area) DO UPDATE SET state = excluded.state, message = excluded.message, changed_at = excluded.changed_at, changed_by = excluded.changed_by`)
    .run(area, state, message, now, changedBy.slice(0, 80));
}

/** True (and remembered) when this alert was NOT sent in the last `gapMs`: the caller then sends it. */
export function claimSupportAlert(key: string, gapMs: number, now = Date.now()) {
  const db = database();
  return db.transaction(() => {
    const row = db.prepare("SELECT sent_at FROM support_alert_v1 WHERE key = ?").get(key) as { sent_at: number } | undefined;
    if (row && now - row.sent_at < gapMs) return false;
    db.prepare("INSERT INTO support_alert_v1 (key, sent_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET sent_at = excluded.sent_at").run(key, now);
    return true;
  }).immediate();
}
