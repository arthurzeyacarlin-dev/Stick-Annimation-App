import "server-only";

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

const LOCAL_ROOT = path.resolve(process.cwd(), ".local/spec0015-phase3");
const databaseName = process.env.SPEC0015_ACCOUNT_DATA_DB_NAME?.trim() || "account-data.sqlite";
if (!/^[a-z0-9-]+\.sqlite$/.test(databaseName)) {
  throw new Error("SPEC0015_ACCOUNT_DATA_DB_NAME must be a simple .sqlite filename.");
}
const databasePath = path.join(LOCAL_ROOT, databaseName);

type AccountDataDatabaseGlobal = typeof globalThis & {
  diamondAccountDataDatabase?: { path: string; database: Database.Database };
};

fs.mkdirSync(LOCAL_ROOT, { recursive: true, mode: 0o700 });
fs.chmodSync(LOCAL_ROOT, 0o700);

const globalOwner = globalThis as AccountDataDatabaseGlobal;
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

export const isAccountDataNamespace = (value: unknown): value is AccountDataNamespace =>
  typeof value === "string" && ACCOUNT_DATA_NAMESPACES.includes(value as AccountDataNamespace);

export const assertAccountDataIdentity = (namespace: unknown, key: unknown) => {
  if (!isAccountDataNamespace(namespace) || typeof key !== "string" || !validKey(key)) {
    throw new Error("account_data_identity_invalid");
  }
  return { namespace, key };
};

type StoredRow = {
  namespace: AccountDataNamespace;
  record_key: string;
  revision: number;
  digest: string;
  updated_at: string;
  payload: Buffer;
};

const toRecord = (row: StoredRow): AccountDataRecord => ({
  namespace: row.namespace,
  key: row.record_key,
  revision: row.revision,
  digest: row.digest,
  updatedAt: row.updated_at,
  payload: new Uint8Array(row.payload),
});

const readStatement = database.prepare(`
  SELECT namespace, record_key, revision, digest, updated_at, payload
  FROM account_state_v1
  WHERE owner_id = ? AND namespace = ? AND record_key = ?
`);

export const readAccountDataRecord = (ownerId: string, namespace: AccountDataNamespace, key: string): AccountDataRecord | null => {
  assertAccountDataIdentity(namespace, key);
  const row = readStatement.get(ownerId, namespace, key) as StoredRow | undefined;
  return row ? toRecord(row) : null;
};

const writeTransaction = database.transaction((
  ownerId: string,
  namespace: AccountDataNamespace,
  key: string,
  expectedRevision: number,
  payload: Uint8Array,
) => {
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

export const writeAccountDataRecord = (
  ownerId: string,
  namespace: AccountDataNamespace,
  key: string,
  expectedRevision: number,
  payload: Uint8Array,
) => {
  assertAccountDataIdentity(namespace, key);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("account_data_revision_invalid");
  if (payload.byteLength > namespaceLimits[namespace]) throw new Error("account_data_capacity");
  return writeTransaction.immediate(ownerId, namespace, key, expectedRevision, payload);
};

const deleteTransaction = database.transaction((ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number) => {
  const existing = readStatement.get(ownerId, namespace, key) as StoredRow | undefined;
  if (!existing) return false;
  if (existing.revision !== expectedRevision) throw new AccountDataConflictError();
  database.prepare("DELETE FROM account_state_v1 WHERE owner_id = ? AND namespace = ? AND record_key = ?")
    .run(ownerId, namespace, key);
  if (readStatement.get(ownerId, namespace, key)) throw new Error("account_data_delete_readback_failed");
  return true;
});

export const deleteAccountDataRecord = (ownerId: string, namespace: AccountDataNamespace, key: string, expectedRevision: number) => {
  assertAccountDataIdentity(namespace, key);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("account_data_revision_invalid");
  return deleteTransaction.immediate(ownerId, namespace, key, expectedRevision);
};

export const accountDataDatabaseInfo = () => ({ path: databasePath, root: LOCAL_ROOT });

export const checkpointAccountDataDatabase = () => {
  database.pragma("wal_checkpoint(TRUNCATE)");
  fs.chmodSync(LOCAL_ROOT, 0o700);
  fs.chmodSync(databasePath, 0o600);
  return databasePath;
};
