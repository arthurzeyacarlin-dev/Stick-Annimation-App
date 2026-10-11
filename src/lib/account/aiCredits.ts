// SPEC-0020 Phase 2: each account's plan and the AI credits it used, kept on the server in
// .local/spec0015-phase3/account-plans.sqlite (opened on first use). The rules live in plans.ts.
// An account gets its 14-day trial the first time it is seen (so existing accounts start fresh, never locked).
// A credit is spent only when an AI Animator message gets an answer; failed or stopped messages are free.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_PLANS, accountPlanStatus, checkAiCredit, creditWindow, DAY_MS, isAccountPlanId, TRIAL_DAYS,
  type AccountPlanId, type AccountPlanRecord, type AccountPlanStatus,
} from "./plans.ts";

type PlanRow = { plan: string; trial_started_at: number; period_started_at: number; test_used_extra: number };
type CreditsGlobal = typeof globalThis & { diamondAccountPlansDatabase?: Database.Database };

const owner = globalThis as CreditsGlobal;

function database() {
  if (owner.diamondAccountPlansDatabase) return owner.diamondAccountPlansDatabase;
  const root = path.resolve(process.cwd(), ".local/spec0015-phase3");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, "account-plans.sqlite");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_plan_v1 (
      owner_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      trial_started_at INTEGER NOT NULL,
      period_started_at INTEGER NOT NULL,
      test_used_extra INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_credit_use_v1 (
      owner_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      used_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS account_credit_use_v1_owner_time ON account_credit_use_v1(owner_id, used_at);
  `);
  fs.chmodSync(file, 0o600);
  owner.diamondAccountPlansDatabase = db;
  return db;
}

const creditError = (message: string, code: string) => Object.assign(new Error(message), { status: 402, code });

export function readAccountPlanRecord(ownerId: string, now = Date.now()): AccountPlanRecord {
  const db = database();
  db.prepare("INSERT OR IGNORE INTO account_plan_v1 (owner_id, plan, trial_started_at, period_started_at, test_used_extra, updated_at) VALUES (?, 'trial', ?, ?, 0, ?)")
    .run(ownerId, now, now, now);
  const row = db.prepare("SELECT plan, trial_started_at, period_started_at, test_used_extra FROM account_plan_v1 WHERE owner_id = ?").get(ownerId) as PlanRow;
  return {
    plan: isAccountPlanId(row.plan) ? row.plan : "trial",
    trialStartedAt: row.trial_started_at,
    periodStartedAt: row.period_started_at,
    testUsedExtra: row.test_used_extra,
  };
}

export function getAccountPlanStatus(ownerId: string, now = Date.now()): AccountPlanStatus {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  const used = (database().prepare("SELECT COUNT(*) AS used FROM account_credit_use_v1 WHERE owner_id = ? AND used_at >= ? AND used_at < ?")
    .get(ownerId, start, end) as { used: number }).used;
  return accountPlanStatus(record, used, now);
}

/** Throws a friendly 402 error when the AI Animator can't take another message for this account. */
export function assertAiCreditAvailable(ownerId: string, runningMessages: number) {
  const check = checkAiCredit(getAccountPlanStatus(ownerId), runningMessages);
  if (!check.ok) throw creditError(check.message, check.code);
}

/** One answered AI Animator message = one credit. The same job is never counted twice. */
export function spendAiCredit(ownerId: string, jobId: string, now = Date.now()) {
  database().prepare("INSERT OR IGNORE INTO account_credit_use_v1 (owner_id, job_id, used_at) VALUES (?, ?, ?)").run(ownerId, jobId, now);
}

export type AiCreditGate = {
  assertAvailable(ownerId: string, runningMessages: number): void;
  spend(ownerId: string, jobId: string): void;
};

export const accountAiCreditGate: AiCreditGate = { assertAvailable: assertAiCreditAvailable, spend: spendAiCredit };

// ---------- Development-only test switch (the /dev/plan page). Payments come in SPEC-0020 Phase 5. ----------

export const TEST_PLAN_ACTIONS = ["trial_new", "trial_day_13", "trial_ended", "low_credits", "no_credits", "starter", "creator", "studio"] as const;
export type TestPlanAction = (typeof TEST_PLAN_ACTIONS)[number];

export function applyTestPlanAction(ownerId: string, action: TestPlanAction, now = Date.now()) {
  const db = database();
  readAccountPlanRecord(ownerId, now);
  const set = (plan: AccountPlanId, trialStartedAt: number | null, extra: number) => {
    const record = readAccountPlanRecord(ownerId, now);
    db.prepare("UPDATE account_plan_v1 SET plan = ?, trial_started_at = ?, period_started_at = ?, test_used_extra = ?, updated_at = ? WHERE owner_id = ?")
      .run(plan, trialStartedAt ?? record.trialStartedAt, plan === "trial" ? record.periodStartedAt : now, extra, now, ownerId);
  };
  const usedNow = () => { const status = getAccountPlanStatus(ownerId, now); return status.creditsUsed - readAccountPlanRecord(ownerId, now).testUsedExtra; };
  switch (action) {
    case "trial_new": return set("trial", now, 0);
    case "trial_day_13": return set("trial", now - (TRIAL_DAYS - 2) * DAY_MS, 0);
    case "trial_ended": return set("trial", now - (TRIAL_DAYS + 1) * DAY_MS, 0);
    case "low_credits":
    case "no_credits": {
      const record = readAccountPlanRecord(ownerId, now);
      const total = ACCOUNT_PLANS[record.plan].credits;
      const target = action === "no_credits" ? total : total - 5;
      db.prepare("UPDATE account_plan_v1 SET test_used_extra = ?, updated_at = ? WHERE owner_id = ?").run(Math.max(0, target - usedNow()), now, ownerId);
      return;
    }
    default: return set(action, null, 0);
  }
}

/** Delete my account: forget this account's plan and credit history. */
export function deleteAccountPlan(ownerId: string) {
  const db = database();
  db.prepare("DELETE FROM account_credit_use_v1 WHERE owner_id = ?").run(ownerId);
  db.prepare("DELETE FROM account_plan_v1 WHERE owner_id = ?").run(ownerId);
}
