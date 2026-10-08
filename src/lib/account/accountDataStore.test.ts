import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { FakePostgresPool, stopFakePostgres, useFakePostgres } from "../server/postgresFake.testkit.ts";
import {
  AccountDataConflictError,
  deleteAccountDataRecord,
  readAccountDataRecord,
  writeAccountDataRecord,
} from "./accountDataStore.ts";

// The local SQLite file is created under <cwd>/.local, so the test runs in a
// throwaway folder and never touches the real app's data.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "diamond-account-data-test-"));
process.chdir(sandbox);
process.env.SPEC0015_ACCOUNT_DATA_DB_NAME = "test-account-data.sqlite";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (payload: Uint8Array) => new TextDecoder().decode(payload);

afterEach(() => stopFakePostgres());

async function exerciseStore(label: string) {
  const ownerA = `${label}-owner-a`;
  const ownerB = `${label}-owner-b`;
  assert.equal(await readAccountDataRecord(ownerA, "notifications", "inbox"), null);

  const first = await writeAccountDataRecord(ownerA, "notifications", "inbox", 0, bytes("hello"));
  assert.equal(first.revision, 1);
  assert.match(first.digest, /^[0-9a-f]{64}$/);
  assert.equal(text(first.payload), "hello");

  // Another account sees nothing and cannot overwrite or delete A's record.
  assert.equal(await readAccountDataRecord(ownerB, "notifications", "inbox"), null);
  assert.equal(await deleteAccountDataRecord(ownerB, "notifications", "inbox", 1), false);
  const bRecord = await writeAccountDataRecord(ownerB, "notifications", "inbox", 0, bytes("bee"));
  assert.equal(bRecord.revision, 1);
  assert.equal(text((await readAccountDataRecord(ownerA, "notifications", "inbox"))!.payload), "hello");

  // Compare-and-swap: a stale revision is a conflict and changes nothing.
  await assert.rejects(writeAccountDataRecord(ownerA, "notifications", "inbox", 0, bytes("stale")), AccountDataConflictError);
  const second = await writeAccountDataRecord(ownerA, "notifications", "inbox", 1, bytes("hello again"));
  assert.equal(second.revision, 2);
  const read = await readAccountDataRecord(ownerA, "notifications", "inbox");
  assert.equal(read?.revision, 2);
  assert.equal(read?.digest, second.digest);
  assert.equal(read?.updatedAt, second.updatedAt);
  assert.equal(text(read!.payload), "hello again");

  // Bad identity / capacity are refused before any storage is touched.
  await assert.rejects(readAccountDataRecord(ownerA, "nope" as never, "inbox"), /account_data_identity_invalid/);
  await assert.rejects(writeAccountDataRecord(ownerA, "preferences", "p", 0, new Uint8Array(64 * 1024 + 1)), /account_data_capacity/);
  await assert.rejects(readAccountDataRecord("", "notifications", "inbox"), /account_data_owner_invalid/);

  // Delete needs the current revision.
  await assert.rejects(deleteAccountDataRecord(ownerA, "notifications", "inbox", 1), AccountDataConflictError);
  assert.equal(await deleteAccountDataRecord(ownerA, "notifications", "inbox", 2), true);
  assert.equal(await readAccountDataRecord(ownerA, "notifications", "inbox"), null);
  assert.equal(text((await readAccountDataRecord(ownerB, "notifications", "inbox"))!.payload), "bee");
}

test("local (no DATABASE_URL): account data still lives in the SQLite file, per account", async () => {
  await exerciseStore("sqlite");
  assert.ok(fs.existsSync(path.join(sandbox, ".local/spec0015-phase3/test-account-data.sqlite")));
});

test("online (DATABASE_URL): the same behaviour runs on Postgres and writes nothing to disk", async () => {
  const pool = new FakePostgresPool();
  useFakePostgres(pool);
  const before = fs.readdirSync(path.join(sandbox, ".local/spec0015-phase3")).sort();
  await exerciseStore("pg");
  assert.deepEqual(fs.readdirSync(path.join(sandbox, ".local/spec0015-phase3")).sort(), before);
  // Every data query is scoped by the owner id as its first parameter.
  for (const query of pool.queries.filter((entry) => entry.text.includes("diamond_account_state_v1") && !entry.text.includes("advisory"))) {
    assert.match(query.text, /owner_id = \$1|VALUES \(\$1/);
    assert.ok(typeof query.params[0] === "string" && query.params[0].startsWith("pg-owner-"));
  }
});

test("online: two simultaneous first writes of one record — exactly one wins, the other is a conflict", async () => {
  useFakePostgres(new FakePostgresPool());
  const results = await Promise.allSettled([
    writeAccountDataRecord("race-owner", "assistant-sessions", "s1", 0, bytes("one")),
    writeAccountDataRecord("race-owner", "assistant-sessions", "s1", 0, bytes("two")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof AccountDataConflictError);
  assert.equal((await readAccountDataRecord("race-owner", "assistant-sessions", "s1"))?.revision, 1);
});

test("online: a failure mid-write rolls back and leaves the old record", async () => {
  const pool = new FakePostgresPool();
  useFakePostgres(pool);
  await writeAccountDataRecord("rollback-owner", "notifications", "inbox", 0, bytes("v1"));
  pool.failNext = /^INSERT INTO public\.diamond_account_state_v1/;
  await assert.rejects(writeAccountDataRecord("rollback-owner", "notifications", "inbox", 1, bytes("v2")), /fake_postgres_failure/);
  const read = await readAccountDataRecord("rollback-owner", "notifications", "inbox");
  assert.equal(read?.revision, 1);
  assert.equal(text(read!.payload), "v1");
  assert.ok(pool.queries.some((query) => query.text === "ROLLBACK"));
});
