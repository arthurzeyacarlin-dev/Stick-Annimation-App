import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { FakePostgresPool, stopFakePostgres, useFakePostgres } from "../server/postgresFake.testkit.ts";
import type { UsageJournalEventInput } from "../usage-journal/usageJournalContract.ts";

// Local files land under <cwd>/.local, so run in a throwaway folder.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "diamond-account-usage-test-"));
process.chdir(sandbox);
process.env.SPEC0015_ACCOUNT_USAGE_DB_NAME = "test-account-usage.sqlite";
process.env.DIAMOND_USAGE_JOURNAL_PATH = path.join(sandbox, "journal/v1.ndjson");
const { flushAccountUsageWrites, loadAccountUsageRows, withAccountUsageOwner } = await import("./accountUsageStore.ts");
const { readUsageSummary, recordUsageEvent } = await import("../usage-journal/usageJournalRuntime.ts");

afterEach(() => stopFakePostgres());

const event = (ref: string): UsageJournalEventInput => ({
  eventKey: "accepted", operationRef: ref, attemptRef: ref, originRef: "test",
  surface: "guidance_assistant", operationKind: "conversation", stage: "accepted", environment: "local_instance",
  acceptedAt: Date.now(), inputTokens: 10, outputTokens: 5, totalTokens: 15,
});

test("local (no DATABASE_URL): usage goes to the SQLite file and the local journal, per account", async () => {
  withAccountUsageOwner("local-a", () => recordUsageEvent(event("local-1")));
  withAccountUsageOwner("local-b", () => recordUsageEvent(event("local-2")));
  const a = await loadAccountUsageRows("local-a");
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].event.totalTokens, 15);
  assert.equal(a.gap, false);
  assert.equal((await loadAccountUsageRows("local-b")).rows.length, 1);
  assert.ok(fs.existsSync(path.join(sandbox, ".local/spec0015-phase3/test-account-usage.sqlite")));
  const summary = await readUsageSummary();
  assert.notEqual(summary.health.state, "unavailable");
  assert.ok(fs.existsSync(path.join(sandbox, "journal/v1.ndjson")));
});

test("online (DATABASE_URL): usage goes to Postgres per account; the journal writes nothing to disk", async () => {
  const pool = new FakePostgresPool();
  useFakePostgres(pool);
  const journalBefore = fs.readFileSync(path.join(sandbox, "journal/v1.ndjson"), "utf8");
  const ownerA = "online-a";
  const ownerB = "online-b";
  assert.equal(withAccountUsageOwner(ownerA, () => recordUsageEvent(event("pg-1"))), false); // not journaled online
  withAccountUsageOwner(ownerA, () => recordUsageEvent(event("pg-1"))); // duplicate event is ignored
  withAccountUsageOwner(ownerB, () => recordUsageEvent(event("pg-2")));
  recordUsageEvent(event("pg-3")); // no signed-in owner → no account row
  const a = await loadAccountUsageRows(ownerA);
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].event.inputTokens, 10);
  assert.equal(typeof a.rows[0].recordedAt, "number");
  assert.equal(a.gap, false);
  assert.equal((await loadAccountUsageRows(ownerB)).rows.length, 1);
  assert.equal(pool.tables.usage.size, 2);
  const summary = await readUsageSummary();
  assert.equal(summary.health.state, "unavailable");
  assert.equal(summary.health.lastError, "journal_disabled_online");
  assert.equal(fs.readFileSync(path.join(sandbox, "journal/v1.ndjson"), "utf8"), journalBefore);
});

test("online: a failed usage write never throws into the AI call and shows a gap for that account only", async () => {
  const pool = new FakePostgresPool();
  useFakePostgres(pool);
  pool.failNext = /diamond_account_usage_events_v1/;
  assert.doesNotThrow(() => withAccountUsageOwner("gap-a", () => recordUsageEvent(event("gap-1"))));
  await flushAccountUsageWrites();
  assert.ok(pool.tables.gaps.has("gap-a"));
  assert.equal((await loadAccountUsageRows("gap-a")).gap, true);
  assert.equal((await loadAccountUsageRows("gap-b")).gap, false);
  // A brand-new server instance (empty memory) still sees the stored gap.
  (globalThis as { diamondAccountUsageGapsV1?: Set<string> }).diamondAccountUsageGapsV1 = new Set();
  assert.equal((await loadAccountUsageRows("gap-a")).gap, true);
});

test("online: if Postgres is unreachable the AI call still works and the Dashboard read fails loudly", async () => {
  const pool = new FakePostgresPool();
  useFakePostgres(pool);
  pool.query = async () => { throw new Error("down"); };
  assert.doesNotThrow(() => withAccountUsageOwner("down-a", () => recordUsageEvent(event("down-1"))));
  await flushAccountUsageWrites();
  await assert.rejects(loadAccountUsageRows("down-a"));
});
