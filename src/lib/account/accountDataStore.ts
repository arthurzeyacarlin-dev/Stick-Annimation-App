import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { postgresConfigured, postgresPool, withPostgresTransaction, type PostgresClient } from "../server/postgres.ts";

// Server-only logic behind /api/account/data. App code imports it through
// accountDataServer.ts (which carries the "server-only" guard); this file
// stays importable by node --test.
//
// Backends: DATABASE_URL set → Postgres table diamond_account_state_v1
// (supabase/migrations/20261008_online_account_stores.sql); otherwise the
// local SQLite file under .local/spec0015-phase3, exactly as before. The
// SQLite file is opened lazily so an online (read-only) server never touches it.

export const ACCOUNT_DATA_NAMESPACES = [
  "assistant-sessions",
  "notifications",
  "terra-ledger",
  "terra-pending",
  "recovery",
  "preferences",
] as const;

export type AccountDataNamespace = typeof ACCOUNT_DATA_NAMESPACES[number];

export type AccountDataRecord = {
  namespace: AccountDataNamespace;
  key: string;
  revision: number;
  digest: string;
  updatedAt: string;
  payload: Uint8Array;
};

export class AccountDataConflictError extends Error {
  constructor() {
    super("account_data_conflict");
  }
}

const namespaceLimits: Record<AccountDataNamespace, number> = {
  "assistant-sessions": 34 * 1024 * 1024,
  notifications: 2 * 1024 * 1024,
  "terra-ledger": 8 * 1024 * 1024,
  "terra-pending": 1024 * 1024,
  recovery: 140 * 1024 * 1024,
  preferences: 64 * 1024,
};
const OWNER_TOTAL_LIMIT = 256 * 1024 * 1024;

const digestBytes = (payload: Uint8Array) => createHash("sha256").update(payload).digest("hex");
const validKey = (value: string) => value === value.normalize("NFC") && /^[A-Za-z0-9._~%-]{1,512}$/.test(value);
const validOwner = (value: unknown): value is string => typeof value === "string" && value.length >= 1 && value.length <= 256;

export const isAccountDataNamespace = (value: unknown): value is AccountDataNamespace =>
  typeof value === "string" && ACCOUNT_DATA_NAMESPACES.includes(value as AccountDataNamespace);

export const assertAccountDataIdentity = (namespace: unknown, key: unknown) => {
  if (!isAccountDataNamespace(namespace) || typeof key !== "string" || !validKey(key)) {
    throw new Error("account_data_identity_invalid");
  }
  return { namespace, key };
};

const assertOwner = (ownerId: unknown) => {
  if (!validOwner(ownerId)) throw new Error("account_data_owner_invalid");
};

type StoredRow = {
  namespace: AccountDataNamespace;
  record_key: string;
  revision: number;
  digest: string;
  updated_at: string | Date;
  payload: Buffer;
};

const toRecord = (row: StoredRow): AccountDataRecord => ({
  namespace: row.namespace,
  key: row.record_key,
  revision: Number(row.revision),
  digest: row.digest,
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  payload: new Uint8Array(row.payload),
});

// ---------------------------------------------------------------- SQLite (local)

type WriteFn = (ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number, payload: Uint8Array) => AccountDataRecord;
type DeleteFn = (ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number) => boolean;
type SqliteStore = {
  path: string;
  root: string;
  database: Database.Database;
  readStatement: Database.Statement;
  writeTransaction: Database.Transaction<WriteFn>;
  deleteTransaction: Database.Transaction<DeleteFn>;
};

type AccountDataDatabaseGlobal = typeof globalThis & {
  diamondAccountDataDatabase?: { path: string; database: Database.Database };
  diamondAccountDataSqliteStore?: SqliteStore;
};
const globalOwner = globalThis as AccountDataDatabaseGlobal;

function sqliteStore(): SqliteStore {
  const root = path.resolve(process.cwd(), ".local/spec0015-phase3");
  const databaseName = process.env.SPEC0015_ACCOUNT_DATA_DB_NAME?.trim() || "account-data.sqlite";
  if (!/^[a-z0-9-]+\.sqlite$/.test(databaseName)) {
    throw new Error("SPEC0015_ACCOUNT_DATA_DB_NAME must be a simple .sqlite filename.");
  }
  const databasePath = path.join(root, databaseName);
  const cached = globalOwner.diamondAccountDataSqliteStore;
  if (cached?.path === databasePath && globalOwner.diamondAccountDataDatabase?.database === cached.database) return cached;

  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  if (globalOwner.diamondAccountDataDatabase && globalOwner.diamondAccountDataDatabase.path !== databasePath) {
    globalOwner.diamondAccountDataDatabase.database.close();
    globalOwner.diamondAccountDataDatabase = undefined;
  }
  const database = globalOwner.diamondAccountDataDatabase?.database ?? new Database(databasePath);
  if (!globalOwner.diamondAccountDataDatabase) {
    database.pragma("journal_mode = DELETE");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    database.pragma("synchronous = FULL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS account_state_v1 (
        owner_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        record_key TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 1),
        digest TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload BLOB NOT NULL,
        PRIMARY KEY (owner_id, namespace, record_key)
      );
      CREATE INDEX IF NOT EXISTS account_state_v1_owner_updated
        ON account_state_v1(owner_id, updated_at);
    `);
    fs.chmodSync(databasePath, 0o600);
    globalOwner.diamondAccountDataDatabase = { path: databasePath, database };
  }

  const readStatement = database.prepare(`
    SELECT namespace, record_key, revision, digest, updated_at, payload
    FROM account_state_v1
    WHERE owner_id = ? AND namespace = ? AND record_key = ?
  `);

  const writeTransaction = database.transaction<WriteFn>((ownerId, namespace, key, expectedRevision, payload) => {
    const existing = readStatement.get(ownerId, namespace, key) as StoredRow | undefined;
    if ((existing?.revision ?? 0) !== expectedRevision) throw new AccountDataConflictError();
    const otherBytes = database.prepare(`
      SELECT COALESCE(SUM(length(payload)), 0) AS bytes
      FROM account_state_v1
      WHERE owner_id = ? AND NOT (namespace = ? AND record_key = ?)
    `).get(ownerId, namespace, key) as { bytes: number };
    if (otherBytes.bytes + payload.byteLength > OWNER_TOTAL_LIMIT) throw new Error("account_data_owner_capacity");
    const revision = expectedRevision + 1;
    const digest = digestBytes(payload);
    const updatedAt = new Date().toISOString();
    database.prepare(`
      INSERT INTO account_state_v1(owner_id, namespace, record_key, revision, digest, updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, namespace, record_key) DO UPDATE SET
        revision = excluded.revision,
        digest = excluded.digest,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `).run(ownerId, namespace, key, revision, digest, updatedAt, Buffer.from(payload));
    const readback = readStatement.get(ownerId, namespace, key) as StoredRow | undefined;
    if (!readback || readback.revision !== revision || readback.digest !== digest || readback.payload.byteLength !== payload.byteLength) {
      throw new Error("account_data_readback_failed");
    }
    return toRecord(readback);
  });

  const deleteTransaction = database.transaction<DeleteFn>((ownerId, namespace, key, expectedRevision) => {
    const existing = readStatement.get(ownerId, namespace, key) as StoredRow | undefined;
    if (!existing) return false;
    if (existing.revision !== expectedRevision) throw new AccountDataConflictError();
    database.prepare("DELETE FROM account_state_v1 WHERE owner_id = ? AND namespace = ? AND record_key = ?")
      .run(ownerId, namespace, key);
    if (readStatement.get(ownerId, namespace, key)) throw new Error("account_data_delete_readback_failed");
    return true;
  });

  const store: SqliteStore = { path: databasePath, root, database, readStatement, writeTransaction, deleteTransaction };
  globalOwner.diamondAccountDataSqliteStore = store;
  return store;
}

// ---------------------------------------------------------------- Postgres (online)

const PG_READ = `SELECT namespace, record_key, revision, digest, updated_at, payload
  FROM public.diamond_account_state_v1
  WHERE owner_id = $1 AND namespace = $2 AND record_key = $3`;
// Serialises every write/delete of one owner (compare-and-swap + owner
// capacity) across all server instances. The lock is released at
// COMMIT/ROLLBACK, so it is safe behind Supabase's transaction-mode pooler.
const PG_OWNER_LOCK = "SELECT pg_advisory_xact_lock(hashtext('diamond_account_state_v1'), hashtext($1))";

const pgRead = async (client: Pick<PostgresClient, "query">, ownerId: string, namespace: string, key: string) =>
  (await client.query(PG_READ, [ownerId, namespace, key])).rows[0] as StoredRow | undefined;

async function pgWrite(ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number, payload: Uint8Array) {
  return withPostgresTransaction(async (client) => {
    await client.query(PG_OWNER_LOCK, [ownerId]);
    const existing = await pgRead(client, ownerId, namespace, key);
    if (Number(existing?.revision ?? 0) !== expectedRevision) throw new AccountDataConflictError();
    const other = (await client.query(`SELECT COALESCE(SUM(octet_length(payload)), 0)::bigint AS bytes
      FROM public.diamond_account_state_v1
      WHERE owner_id = $1 AND NOT (namespace = $2 AND record_key = $3)`, [ownerId, namespace, key])).rows[0] as { bytes: string | number } | undefined;
    if (Number(other?.bytes ?? 0) + payload.byteLength > OWNER_TOTAL_LIMIT) throw new Error("account_data_owner_capacity");
    const revision = expectedRevision + 1;
    const digest = digestBytes(payload);
    const updatedAt = new Date().toISOString();
    await client.query(`INSERT INTO public.diamond_account_state_v1
        (owner_id, namespace, record_key, revision, digest, updated_at, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (owner_id, namespace, record_key) DO UPDATE SET
        revision = excluded.revision,
        digest = excluded.digest,
        updated_at = excluded.updated_at,
        payload = excluded.payload`, [ownerId, namespace, key, revision, digest, updatedAt, Buffer.from(payload)]);
    const readback = await pgRead(client, ownerId, namespace, key);
    if (!readback || Number(readback.revision) !== revision || readback.digest !== digest || readback.payload.byteLength !== payload.byteLength) {
      throw new Error("account_data_readback_failed");
    }
    return toRecord(readback);
  });
}

async function pgDelete(ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number) {
  return withPostgresTransaction(async (client) => {
    await client.query(PG_OWNER_LOCK, [ownerId]);
    const existing = await pgRead(client, ownerId, namespace, key);
    if (!existing) return false;
    if (Number(existing.revision) !== expectedRevision) throw new AccountDataConflictError();
    await client.query("DELETE FROM public.diamond_account_state_v1 WHERE owner_id = $1 AND namespace = $2 AND record_key = $3",
      [ownerId, namespace, key]);
    if (await pgRead(client, ownerId, namespace, key)) throw new Error("account_data_delete_readback_failed");
    return true;
  });
}

// ---------------------------------------------------------------- Public API

export const readAccountDataRecord = async (ownerId: string, namespace: AccountDataNamespace, key: string): Promise<AccountDataRecord | null> => {
  assertOwner(ownerId);
  assertAccountDataIdentity(namespace, key);
  const row = postgresConfigured()
    ? await pgRead(postgresPool(), ownerId, namespace, key)
    : sqliteStore().readStatement.get(ownerId, namespace, key) as StoredRow | undefined;
  return row ? toRecord(row) : null;
};

export const writeAccountDataRecord = async (
  ownerId: string,
  namespace: AccountDataNamespace,
  key: string,
  expectedRevision: number,
  payload: Uint8Array,
): Promise<AccountDataRecord> => {
  assertOwner(ownerId);
  assertAccountDataIdentity(namespace, key);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("account_data_revision_invalid");
  if (payload.byteLength > namespaceLimits[namespace]) throw new Error("account_data_capacity");
  if (postgresConfigured()) return pgWrite(ownerId, namespace, key, expectedRevision, payload);
  return sqliteStore().writeTransaction.immediate(ownerId, namespace, key, expectedRevision, payload);
};

export const deleteAccountDataRecord = async (ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number): Promise<boolean> => {
  assertOwner(ownerId);
  assertAccountDataIdentity(namespace, key);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("account_data_revision_invalid");
  if (postgresConfigured()) return pgDelete(ownerId, namespace, key, expectedRevision);
  return sqliteStore().deleteTransaction.immediate(ownerId, namespace, key, expectedRevision);
};

/** Local SQLite only. */
export const accountDataDatabaseInfo = () => {
  const store = sqliteStore();
  return { path: store.path, root: store.root };
};

/** Local SQLite only. */
export const checkpointAccountDataDatabase = () => {
  const store = sqliteStore();
  store.database.pragma("wal_checkpoint(TRUNCATE)");
  fs.chmodSync(store.root, 0o700);
  fs.chmodSync(store.path, 0o600);
  return store.path;
};
