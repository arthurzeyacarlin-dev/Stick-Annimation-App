// SPEC-0029: testimonials, kept on the server in .local/spec0015-phase3/testimonials.sqlite (next to the problem reports;
// created on first use). The rules (who is asked, the kids rule, what is exported) live in testimonials.ts.
// Server only (it opens a file with node:fs + better-sqlite3, so it can never be bundled for the browser; no "server-only"
// import so the tests can run it with plain node).
// No picture is stored here: the photo is the account's own profile picture, read when the owner exports.
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  canBeFeatured, isTestimonialStatus, isTestimonialWhere, testimonialDisplayName, testimonialRateOk, TESTIMONIAL_CONSENT_WORDS,
  TESTIMONIAL_RATE_WINDOW_MS, type TestimonialAskState, type TestimonialInput, type TestimonialStatus, type TestimonialSummary,
} from "./testimonials.ts";

type Row = {
  id: string; created_at: number; user_id: string; user_name: string; user_email: string; stars: number; text: string;
  feature_ok: number; where_asked: string; status: string; display_name: string; use_photo: number;
};
type AskRow = { skips: number; answered_at: number | null; export_seen: number };
type TestimonialsGlobal = typeof globalThis & { diamondTestimonialsDatabase?: Database.Database };
const owner = globalThis as TestimonialsGlobal;

/** Opens (and creates) the testimonials database. `file` is only passed by the tests. */
export function openTestimonialDatabase(file?: string) {
  const target = file ?? path.join(path.resolve(process.cwd(), ".local/spec0015-phase3"), "testimonials.sqlite");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const db = new Database(target);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS testimonial_v1 (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      stars INTEGER NOT NULL,
      text TEXT NOT NULL,
      feature_ok INTEGER NOT NULL,
      consent_words TEXT,
      where_asked TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      display_name TEXT NOT NULL,
      use_photo INTEGER NOT NULL DEFAULT 1,
      status_changed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS testimonial_v1_created ON testimonial_v1(created_at);
    CREATE INDEX IF NOT EXISTS testimonial_v1_user ON testimonial_v1(user_id);
    -- Per account: how often the ask was skipped, whether it was answered, and whether the export ask was shown.
    CREATE TABLE IF NOT EXISTS testimonial_ask_v1 (
      user_id TEXT PRIMARY KEY,
      skips INTEGER NOT NULL DEFAULT 0,
      answered_at INTEGER,
      export_seen INTEGER NOT NULL DEFAULT 0,
      recent TEXT NOT NULL DEFAULT '[]'
    );
  `);
  if (!file) fs.chmodSync(target, 0o600);
  return db;
}

let testDatabase: Database.Database | null = null;
/** Tests only: use this database instead of the real file. */
export function useTestimonialDatabaseForTests(db: Database.Database | null) { testDatabase = db; }

function database() {
  if (testDatabase) return testDatabase;
  return (owner.diamondTestimonialsDatabase ??= openTestimonialDatabase());
}

const COLUMNS = "id, created_at, user_id, user_name, user_email, stars, text, feature_ok, where_asked, status, display_name, use_photo";
const toSummary = (row: Row): TestimonialSummary => {
  const base = { stars: row.stars, text: row.text, featureOk: row.feature_ok === 1 };
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    ...base,
    where: isTestimonialWhere(row.where_asked) ? row.where_asked : "animation",
    status: isTestimonialStatus(row.status) ? row.status : "new",
    displayName: row.display_name,
    usePhoto: row.use_photo === 1,
    featurable: canBeFeatured(base),
  };
};

function askRow(db: Database.Database, userId: string) {
  return db.prepare("SELECT skips, answered_at, export_seen FROM testimonial_ask_v1 WHERE user_id = ?").get(userId) as AskRow | undefined;
}

/** What the server remembers about asking this account. */
export function readTestimonialAsk(userId: string): TestimonialAskState {
  const row = askRow(database(), userId);
  return { skips: row?.skips ?? 0, answered: row?.answered_at != null, exportSeen: row?.export_seen === 1 };
}

/** Counts one more try for the hourly guard; false = too many in the last hour. */
function takeTry(db: Database.Database, userId: string, now: number) {
  const row = db.prepare("SELECT recent FROM testimonial_ask_v1 WHERE user_id = ?").get(userId) as { recent: string } | undefined;
  let recent: number[] = [];
  try { recent = (JSON.parse(row?.recent ?? "[]") as unknown[]).filter((v): v is number => typeof v === "number"); } catch { recent = []; }
  recent = recent.filter((time) => time > now - TESTIMONIAL_RATE_WINDOW_MS);
  if (!testimonialRateOk(recent, now)) return false;
  db.prepare(`INSERT INTO testimonial_ask_v1 (user_id, recent) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET recent = excluded.recent`).run(userId, JSON.stringify([...recent, now]));
  return true;
}

/** "Not now" or the card closed without an answer. */
export function skipTestimonialAsk(userId: string, where: "animation" | "export", now = Date.now()): { ok: boolean } {
  const db = database();
  return db.transaction(() => {
    if (!takeTry(db, userId, now)) return { ok: false };
    db.prepare(`UPDATE testimonial_ask_v1 SET skips = skips + 1, export_seen = CASE WHEN ? THEN 1 ELSE export_seen END WHERE user_id = ?`)
      .run(where === "export" ? 1 : 0, userId);
    return { ok: true };
  }).immediate();
}

/** The ask was shown after an export: it is never shown at an export again. */
export function markTestimonialExportSeen(userId: string) {
  database().prepare(`INSERT INTO testimonial_ask_v1 (user_id, export_seen) VALUES (?, 1)
    ON CONFLICT(user_id) DO UPDATE SET export_seen = 1`).run(userId);
}

export type SaveTestimonialResult = { ok: true; testimonial: TestimonialSummary } | { ok: false; reason: "answered" | "rate" };

/** Saves the one answer of this account (a second answer is refused: they are never asked again). */
export function saveTestimonial(input: TestimonialInput & { userId: string; userName: string; userEmail: string }, now = Date.now()): SaveTestimonialResult {
  const db = database();
  return db.transaction((): SaveTestimonialResult => {
    if (askRow(db, input.userId)?.answered_at != null) return { ok: false, reason: "answered" };
    if (!takeTry(db, input.userId, now)) return { ok: false, reason: "rate" };
    const id = `tm_${randomUUID().replace(/-/g, "")}`;
    db.prepare(`INSERT INTO testimonial_v1 (id, created_at, user_id, user_name, user_email, stars, text, feature_ok, consent_words, where_asked, status, display_name, use_photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 1)`)
      .run(id, now, input.userId, input.userName, input.userEmail, input.stars, input.text, input.featureOk ? 1 : 0,
        input.featureOk ? TESTIMONIAL_CONSENT_WORDS : null, input.where, testimonialDisplayName(input.userName));
    db.prepare("UPDATE testimonial_ask_v1 SET answered_at = ? WHERE user_id = ?").run(now, input.userId);
    return { ok: true, testimonial: toSummary(db.prepare(`SELECT ${COLUMNS} FROM testimonial_v1 WHERE id = ?`).get(id) as Row) };
  }).immediate();
}

/** The person's own testimonial (for "Your testimonial · Remove" on the Profile page), or null. */
export function readOwnTestimonial(userId: string): TestimonialSummary | null {
  const row = database().prepare(`SELECT ${COLUMNS} FROM testimonial_v1 WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).get(userId) as Row | undefined;
  return row ? toSummary(row) : null;
}

/** The person takes it back: their testimonial is deleted (they are still never asked again). */
export function removeOwnTestimonial(userId: string) {
  return database().prepare("DELETE FROM testimonial_v1 WHERE user_id = ?").run(userId).changes > 0;
}

/** The account is being deleted: everything about it goes. */
export function deleteTestimonialsForUser(userId: string) {
  const db = database();
  db.transaction(() => {
    db.prepare("DELETE FROM testimonial_v1 WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM testimonial_ask_v1 WHERE user_id = ?").run(userId);
  })();
}

/** Owner: newest first. */
export function listTestimonials(filter: TestimonialStatus | "all", limit = 500): TestimonialSummary[] {
  const rows = filter === "all"
    ? database().prepare(`SELECT ${COLUMNS} FROM testimonial_v1 ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit)
    : database().prepare(`SELECT ${COLUMNS} FROM testimonial_v1 WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(filter, limit);
  return (rows as Row[]).map(toSummary);
}

export const countNewTestimonials = () =>
  (database().prepare("SELECT COUNT(*) AS count FROM testimonial_v1 WHERE status = 'new'").get() as { count: number }).count;

/** Owner: approve / hide, the shown name, use the photo or not. Returns false when there is no such testimonial. */
export function updateTestimonial(id: string, change: { status?: TestimonialStatus; displayName?: string; usePhoto?: boolean }, now = Date.now()) {
  const db = database();
  return db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM testimonial_v1 WHERE id = ?").get(id)) return false;
    if (change.status) db.prepare("UPDATE testimonial_v1 SET status = ?, status_changed_at = ? WHERE id = ?").run(change.status, now, id);
    if (change.displayName) db.prepare("UPDATE testimonial_v1 SET display_name = ? WHERE id = ?").run(change.displayName, id);
    if (typeof change.usePhoto === "boolean") db.prepare("UPDATE testimonial_v1 SET use_photo = ? WHERE id = ?").run(change.usePhoto ? 1 : 0, id);
    return true;
  })();
}
