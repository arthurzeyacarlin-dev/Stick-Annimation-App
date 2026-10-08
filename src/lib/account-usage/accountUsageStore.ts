import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { UsageJournalEventInput } from "../usage-journal/usageJournalContract.ts";
import { postgresPool, postgresConfigured } from "../server/postgres.ts";

// Backends: DATABASE_URL set → Postgres tables diamond_account_usage_events_v1
// and diamond_account_usage_gaps_v1 (supabase/migrations/20261008_online_account_stores.sql);
// otherwise the local SQLite file + .coverage-gaps marker, exactly as before.
// Nothing on disk is touched until the SQLite path is actually used.

// Ownership is supplied only after requireAccountRequest verifies the session.
// AsyncLocalStorage also carries it into the detached job started by submit().
const ownerContext = new AsyncLocalStorage<string>();
export const withAccountUsageOwner = <T>(ownerId: string, action: () => T): T => ownerContext.run(ownerId, action);

export type AccountUsageEvent = Pick<UsageJournalEventInput,
  "surface" | "operationKind" | "stage" | "acceptedAt" | "dispatchedAt" | "finishedAt" |
  "outcome" | "usageQuality" | "inputTokens" | "outputTokens" | "totalTokens" |
  "toolCalls" | "audioSeconds" | "estimatedCostUsd" | "pricingVersion" | "requestedModel" |
  "returnedModel" | "reasoning" | "provider" | "transportAttemptCoverage">;
export type AccountUsageRow = { attemptId: string; eventId: string; recordedAt: number; event: AccountUsageEvent };
type Store = { path: string; database: Database.Database };
const globalStore = globalThis as typeof globalThis & { diamondAccountUsageV1?: Store; diamondAccountUsageGapsV1?: Set<string> };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function sqlitePaths() {
  const databaseName = process.env.SPEC0015_ACCOUNT_USAGE_DB_NAME?.trim() || "account-usage.sqlite";
  if (!/^[a-z0-9-]+\.sqlite$/.test(databaseName)) throw new Error("Invalid account usage database name.");
  const databasePath = path.resolve(process.cwd(), ".local/spec0015-phase3", databaseName);
  return { databasePath, gapPath: path.join(path.dirname(databasePath), `${databaseName}.coverage-gaps`) };
}
const gaps = () => globalStore.diamondAccountUsageGapsV1 ??= new Set<string>();
const LOOKBACK_MS = 64 * 86_400_000; // The longest Dashboard window is eight UTC weeks.
const READ_LIMIT = 5_000;

function persistentGap(ownerId: string): boolean {
  try {
    const { gapPath } = sqlitePaths();
    const stats = fs.statSync(gapPath);
    if (stats.size > 1_048_576) return true; // An unreadable/corrupt marker is uncertainty, not zero.
    return fs.readFileSync(gapPath, "utf8").split("\n").includes(ownerId);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    return true;
  }
}

function markGap(ownerId: string): void {
  gaps().add(ownerId);
  if (postgresConfigured()) {
    // Best effort: this instance already reports partial via gaps().
    try {
      trackPending(postgresPool().query(`INSERT INTO public.diamond_account_usage_gaps_v1 (owner_id) VALUES ($1)
        ON CONFLICT (owner_id) DO UPDATE SET last_marked_at = now()`, [ownerId]).then(() => undefined));
    } catch { /* e.g. pool cannot be created; the in-memory gap still reports partial. */ }
    return;
  }
  try {
    const { gapPath } = sqlitePaths();
    fs.appendFileSync(gapPath, `${ownerId}\n`, { mode: 0o600 });
    fs.chmodSync(gapPath, 0o600);
  } catch { /* The current process still reports partial; a total storage outage is unprovable after restart. */ }
}

function database(): Database.Database {
  const { databasePath } = sqlitePaths();
  if (globalStore.diamondAccountUsageV1?.path === databasePath) return globalStore.diamondAccountUsageV1.database;
  globalStore.diamondAccountUsageV1?.database.close();
  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const db = new Database(databasePath);
  db.pragma("journal_mode = DELETE");
  db.pragma("synchronous = FULL");
  db.pragma("busy_timeout = 250");
  db.exec(`CREATE TABLE IF NOT EXISTS account_usage_events_v1 (
    owner_id TEXT NOT NULL, event_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
    recorded_at INTEGER NOT NULL, event_json TEXT NOT NULL,
    PRIMARY KEY(owner_id, event_id)
  ); CREATE INDEX IF NOT EXISTS account_usage_owner_time_v1
    ON account_usage_events_v1(owner_id, recorded_at);`);
  fs.chmodSync(databasePath, 0o600);
  globalStore.diamondAccountUsageV1 = { path: databasePath, database: db };
  return db;
}

// Online writes are asynchronous; they are tracked so a reader (or a route
// that wants its usage stored before it returns) can wait for them.
const pending = () => (globalStore as typeof globalStore & { diamondAccountUsagePendingV1?: Set<Promise<void>> })
  .diamondAccountUsagePendingV1 ??= new Set<Promise<void>>();
function trackPending(write: Promise<void>): void {
  const tracked = write.catch(() => {}).finally(() => pending().delete(tracked));
  pending().add(tracked);
}
/** Waits for this instance's in-flight online usage writes. Never throws. */
export async function flushAccountUsageWrites(): Promise<void> {
  while (pending().size) await Promise.allSettled([...pending()]);
}

const nonnegative = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function recordAccountUsageEvent(event: UsageJournalEventInput): void {
  const ownerId = ownerContext.getStore();
  if (!ownerId) return; // The Phase 2 local-instance journal remains independent.
  try {
    const attemptId = hash(`${ownerId}\0${event.attemptRef}`);
    const eventId = hash(`${attemptId}\0${event.eventKey}`);
    const safe: AccountUsageEvent = {
      surface: event.surface, operationKind: event.operationKind, stage: event.stage,
      acceptedAt: nonnegative(event.acceptedAt), dispatchedAt: nonnegative(event.dispatchedAt),
      finishedAt: nonnegative(event.finishedAt), outcome: event.outcome ?? null,
      usageQuality: event.usageQuality ?? null, inputTokens: nonnegative(event.inputTokens),
      outputTokens: nonnegative(event.outputTokens), totalTokens: nonnegative(event.totalTokens),
      toolCalls: nonnegative(event.toolCalls), audioSeconds: nonnegative(event.audioSeconds),
      estimatedCostUsd: nonnegative(event.estimatedCostUsd), pricingVersion: event.pricingVersion ?? null,
      requestedModel: event.requestedModel ?? null, returnedModel: event.returnedModel ?? null,
      reasoning: event.reasoning ?? null, provider: event.provider ?? null,
      transportAttemptCoverage: event.transportAttemptCoverage ?? null,
    };
    if (postgresConfigured()) {
      trackPending(postgresPool().query(`INSERT INTO public.diamond_account_usage_events_v1
        (owner_id, event_id, attempt_id, recorded_at, event_json) VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (owner_id, event_id) DO NOTHING`, [ownerId, eventId, attemptId, Date.now(), JSON.stringify(safe)])
        .then(() => undefined, () => markGap(ownerId)));
      return;
    }
    database().prepare(`INSERT OR IGNORE INTO account_usage_events_v1
      (owner_id, event_id, attempt_id, recorded_at, event_json) VALUES (?, ?, ?, ?, ?)`).run(
      ownerId, eventId, attemptId, Date.now(), JSON.stringify(safe));
  } catch {
    // Metering must never interrupt an AI reply. The Dashboard will report a gap.
    markGap(ownerId);
  }
}

/** Local SQLite read (synchronous; kept for the Phase 5 proof scripts). */
export function readAccountUsageRows(ownerId: string): { rows: AccountUsageRow[]; gap: boolean; readAt: number } {
  const readAt = Date.now();
  const rows = database().prepare(`SELECT event_id, attempt_id, recorded_at, event_json
    FROM account_usage_events_v1 WHERE owner_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC LIMIT 5001`).all(ownerId,
      readAt - LOOKBACK_MS) as
    { event_id: string; attempt_id: string; recorded_at: number; event_json: string }[];
  const overflow = rows.length > READ_LIMIT;
  return {
    rows: rows.slice(0, READ_LIMIT).map((row) => ({
      eventId: row.event_id, attemptId: row.attempt_id, recordedAt: row.recorded_at,
      event: JSON.parse(row.event_json) as AccountUsageEvent,
    })),
    gap: overflow || gaps().has(ownerId) || persistentGap(ownerId), readAt,
  };
}

type UsageRowsResult = { rows: AccountUsageRow[]; gap: boolean; readAt: number };

async function readPostgresUsageRows(ownerId: string): Promise<UsageRowsResult> {
  await flushAccountUsageWrites();
  const readAt = Date.now();
  const pool = postgresPool();
  const [result, gapResult] = await Promise.all([
    pool.query(`SELECT event_id, attempt_id, recorded_at, event_json
      FROM public.diamond_account_usage_events_v1 WHERE owner_id = $1 AND recorded_at >= $2
      ORDER BY recorded_at DESC LIMIT ${READ_LIMIT + 1}`, [ownerId, readAt - LOOKBACK_MS]),
    pool.query("SELECT 1 FROM public.diamond_account_usage_gaps_v1 WHERE owner_id = $1 LIMIT 1", [ownerId]),
  ]);
  const rows = result.rows as { event_id: string; attempt_id: string; recorded_at: string | number; event_json: unknown }[];
  return {
    rows: rows.slice(0, READ_LIMIT).map((row) => ({
      eventId: row.event_id, attemptId: row.attempt_id, recordedAt: Number(row.recorded_at),
      event: (typeof row.event_json === "string" ? JSON.parse(row.event_json) : row.event_json) as AccountUsageEvent,
    })),
    gap: rows.length > READ_LIMIT || gaps().has(ownerId) || gapResult.rows.length > 0, readAt,
  };
}

/** The Dashboard read: Postgres online, local SQLite otherwise. */
export async function loadAccountUsageRows(ownerId: string): Promise<UsageRowsResult> {
  return postgresConfigured() ? readPostgresUsageRows(ownerId) : readAccountUsageRows(ownerId);
}
