// The online SharedJobStore: table public.diamond_ai_jobs
// (migration supabase/migrations/20261008_online_ai_jobs.sql). Server only.
import { postgresPool, postgresConfigured, type PostgresQueryable } from "../server/postgres.ts";
import type { SharedJobInsert, SharedJobKind, SharedJobRow, SharedJobStore } from "./sharedJobStore.ts";

// Finished jobs are kept for a day so a late status check still finds them, then removed.
const KEEP_FINISHED_HOURS = 24;

type DbRow = {
  kind: SharedJobKind; job_id: string; owner_id: string; scope_id: string; fingerprint: string | null;
  active: boolean; cancel_requested: boolean; snapshot: unknown; created_at: Date; updated_at: Date;
};
const fromDb = (row: DbRow): SharedJobRow => ({
  kind: row.kind, jobId: row.job_id, ownerId: row.owner_id, scopeId: row.scope_id, fingerprint: row.fingerprint,
  active: row.active, cancelRequested: row.cancel_requested, snapshot: row.snapshot,
  createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime(),
});

export class PostgresSharedJobStore implements SharedJobStore {
  private readonly db: () => PostgresQueryable;
  constructor(db: () => PostgresQueryable = postgresPool) { this.db = db; }

  async insert(row: SharedJobInsert) {
    const result = await this.db().query(
      `insert into public.diamond_ai_jobs (kind, job_id, owner_id, scope_id, fingerprint, active, cancel_requested, snapshot)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (kind, job_id) do nothing`,
      [row.kind, row.jobId, row.ownerId, row.scopeId, row.fingerprint, row.active, row.cancelRequested ?? false,
        row.snapshot === null || row.snapshot === undefined ? null : JSON.stringify(row.snapshot)],
    );
    // Cheap housekeeping: now and then remove old rows (about 1 insert in 50).
    if (Math.random() < 0.02) {
      void this.db().query(
        `delete from public.diamond_ai_jobs where created_at < now() - make_interval(hours => $1)`, [KEEP_FINISHED_HOURS],
      ).catch(() => {});
    }
    return (result.rowCount ?? 0) === 1;
  }

  async get(kind: SharedJobKind, jobId: string) {
    const result = await this.db().query<DbRow>(
      `select kind, job_id, owner_id, scope_id, fingerprint, active, cancel_requested, snapshot, created_at, updated_at
       from public.diamond_ai_jobs where kind = $1 and job_id = $2`, [kind, jobId],
    );
    return result.rows[0] ? fromDb(result.rows[0]) : null;
  }

  async update(kind: SharedJobKind, jobId: string, next: { snapshot: unknown; active: boolean }) {
    const result = await this.db().query(
      `update public.diamond_ai_jobs set snapshot = $3::jsonb, active = $4, updated_at = now()
       where kind = $1 and job_id = $2 and active`,
      [kind, jobId, JSON.stringify(next.snapshot), next.active],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async listActive(kind: SharedJobKind, ownerId: string, freshMs: number) {
    const result = await this.db().query<{ job_id: string; scope_id: string }>(
      `select job_id, scope_id from public.diamond_ai_jobs
       where kind = $1 and owner_id = $2 and active and created_at > now() - make_interval(secs => $3)`,
      [kind, ownerId, Math.ceil(freshMs / 1000)],
    );
    return result.rows.map((row) => ({ jobId: row.job_id, scopeId: row.scope_id }));
  }

  async requestCancel(kind: SharedJobKind, jobId: string, ownerId: string) {
    const result = await this.db().query(
      `update public.diamond_ai_jobs set cancel_requested = true, updated_at = now()
       where kind = $1 and job_id = $2 and owner_id = $3`, [kind, jobId, ownerId],
    );
    return (result.rowCount ?? 0) === 1;
  }
}

/** The shared store online (DATABASE_URL set); null locally, where every job stays in memory as before. */
export function sharedJobStoreFromEnv(): SharedJobStore | null {
  return postgresConfigured() ? new PostgresSharedJobStore() : null;
}
