// Test-only, in-memory stand-in for the pg Pool used by the online stores.
// It understands exactly the SQL those stores send (matched by table and verb),
// keeps a per-transaction undo log for ROLLBACK, and models pg_advisory_xact_lock as a real
// per-key mutex so concurrent compare-and-swap writes can be tested.

type StateRow = { owner_id: string; namespace: string; record_key: string; revision: number; digest: string; updated_at: Date; payload: Buffer };
type UsageRow = { owner_id: string; event_id: string; attempt_id: string; recorded_at: string; event_json: unknown };
type Tables = { state: Map<string, StateRow>; usage: Map<string, UsageRow>; gaps: Set<string> };
type Result = { rows: Record<string, unknown>[] };

type Session = { undo: (() => void)[]; releases: (() => void)[] };

export class FakePostgresPool {
  tables: Tables = { state: new Map(), usage: new Map(), gaps: new Set() };
  failNext: RegExp | null = null;
  queries: { text: string; params: unknown[] }[] = [];
  private locks = new Map<string, Promise<void>>();

  async query(text: string, params: unknown[] = []): Promise<Result> {
    return this.run(text, params, null);
  }

  async connect() {
    const session: Session = { undo: [], releases: [] };
    return {
      query: (text: string, params: unknown[] = []) => this.run(text, params, session),
      release: () => { session.releases.splice(0).forEach((release) => release()); },
    };
  }

  private async run(text: string, params: unknown[], session: Session | null): Promise<Result> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.queries.push({ text: sql, params });
    if (this.failNext?.test(sql)) { this.failNext = null; throw new Error("fake_postgres_failure"); }
    await Promise.resolve();
    if (sql === "BEGIN") { session!.undo = []; return { rows: [] }; }
    if (sql === "COMMIT") { session!.undo = []; session!.releases.splice(0).forEach((release) => release()); return { rows: [] }; }
    if (sql === "ROLLBACK") {
      session!.undo.splice(0).reverse().forEach((undo) => undo());
      session!.releases.splice(0).forEach((release) => release()); return { rows: [] };
    }
    if (sql.includes("pg_advisory_xact_lock")) {
      const key = String(params[0]);
      while (this.locks.has(key)) await this.locks.get(key);
      let release!: () => void;
      this.locks.set(key, new Promise<void>((resolve) => { release = () => { this.locks.delete(key); resolve(); }; }));
      session!.releases.push(release);
      return { rows: [{}] };
    }
    const t = this.tables;
    const remember = (key: string) => {
      const previous = t.state.get(key);
      session?.undo.push(() => { if (previous) t.state.set(key, previous); else t.state.delete(key); });
    };
    const stateKey = (owner: unknown, namespace: unknown, key: unknown) => `${owner}\0${namespace}\0${key}`;
    if (sql.includes("diamond_account_state_v1")) {
      if (sql.startsWith("SELECT namespace, record_key")) {
        const row = t.state.get(stateKey(params[0], params[1], params[2]));
        return { rows: row ? [{ ...row, payload: Buffer.from(row.payload) }] : [] };
      }
      if (sql.startsWith("SELECT COALESCE(SUM(octet_length(payload))")) {
        let bytes = 0;
        for (const row of t.state.values()) if (row.owner_id === params[0] && !(row.namespace === params[1] && row.record_key === params[2])) bytes += row.payload.byteLength;
        return { rows: [{ bytes: String(bytes) }] }; // pg returns bigint as a string
      }
      if (sql.startsWith("INSERT INTO")) {
        const [owner_id, namespace, record_key, revision, digest, updated_at, payload] = params as [string, string, string, number, string, string, Buffer];
        remember(stateKey(owner_id, namespace, record_key));
        t.state.set(stateKey(owner_id, namespace, record_key), { owner_id, namespace, record_key, revision, digest, updated_at: new Date(updated_at), payload: Buffer.from(payload) });
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM")) { remember(stateKey(params[0], params[1], params[2])); t.state.delete(stateKey(params[0], params[1], params[2])); return { rows: [] }; }
    }
    if (sql.includes("diamond_account_usage_events_v1")) {
      if (sql.startsWith("INSERT INTO")) {
        const [owner_id, event_id, attempt_id, recorded_at, json] = params as [string, string, string, number, string];
        const key = `${owner_id}\0${event_id}`;
        if (!t.usage.has(key)) t.usage.set(key, { owner_id, event_id, attempt_id, recorded_at: String(recorded_at), event_json: JSON.parse(json) });
        return { rows: [] };
      }
      if (sql.startsWith("SELECT event_id")) {
        const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 1e9);
        const rows = [...t.usage.values()].filter((row) => row.owner_id === params[0] && Number(row.recorded_at) >= Number(params[1]))
          .sort((a, b) => Number(b.recorded_at) - Number(a.recorded_at)).slice(0, limit);
        return { rows: rows.map(({ event_id, attempt_id, recorded_at, event_json }) => ({ event_id, attempt_id, recorded_at, event_json })) };
      }
    }
    if (sql.includes("diamond_account_usage_gaps_v1")) {
      if (sql.startsWith("INSERT INTO")) { t.gaps.add(String(params[0])); return { rows: [] }; }
      if (sql.startsWith("SELECT 1")) return { rows: t.gaps.has(String(params[0])) ? [{ "?column?": 1 }] : [] };
    }
    throw new Error(`fake_postgres_unhandled: ${sql.slice(0, 80)}`);
  }
}

/** Points the online stores at `pool` (DATABASE_URL set → Postgres path). */
export function useFakePostgres(pool: FakePostgresPool) {
  process.env.DATABASE_URL = "postgres://fake.invalid/postgres";
  (globalThis as { diamondPostgresPool?: unknown }).diamondPostgresPool = pool;
}

export function stopFakePostgres() {
  delete process.env.DATABASE_URL;
  delete (globalThis as { diamondPostgresPool?: unknown }).diamondPostgresPool;
}
