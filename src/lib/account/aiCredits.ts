// SPEC-0020 Phase 2: each account's plan and the AI credits it used, kept on the server in
// .local/spec0015-phase3/account-plans.sqlite (opened on first use). The rules live in plans.ts.
// An account gets its 14-day trial the first time it is seen (so existing accounts start fresh, never locked).
// Credits are spent only when an AI action succeeds (Pricing v1: chat/edit 2, simple 25, big 90 — plans.ts);
// failed, refused or stopped actions are free. Plan credits are spent first, then extra (top-up) credits.
// SPEC-0020 Phase 9 adds the billing fields (Stripe ids, interval, payment status) and top-up credits.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_PLANS, accountPlanStatus, AI_ACTION_CREDITS, checkAiCredit, creditWindow, DAY_MS, isAccountPlanId, addMonths, topUpPacksFor, TRIAL_DAYS,
  type AccountPlanId, type AccountPlanRecord, type AccountPlanStatus, type AiActionKind, type BillingInterval, type BillingStatus, type PaidPlanId,
} from "./plans.ts";

type PlanRow = {
  plan: string; trial_started_at: number; period_started_at: number; test_used_extra: number;
  top_up_credits: number; billing_interval: string | null; billing_status: string | null; past_due_since: number | null;
  cancel_at_period_end: number; plan_ended: number; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  billing_synced_at: number | null;
};
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
    CREATE TABLE IF NOT EXISTS account_billing_event_v1 (
      event_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      at INTEGER NOT NULL
    );
  `);
  // Phase 9 columns (added in place; old rows keep working: an old answered message counted 1 credit).
  const addColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some(entry => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn("account_plan_v1", "top_up_credits", "INTEGER NOT NULL DEFAULT 0");
  addColumn("account_plan_v1", "billing_interval", "TEXT");
  addColumn("account_plan_v1", "billing_status", "TEXT");
  addColumn("account_plan_v1", "past_due_since", "INTEGER");
  addColumn("account_plan_v1", "cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0");
  addColumn("account_plan_v1", "plan_ended", "INTEGER NOT NULL DEFAULT 0");
  addColumn("account_plan_v1", "stripe_customer_id", "TEXT");
  addColumn("account_plan_v1", "stripe_subscription_id", "TEXT");
  addColumn("account_plan_v1", "billing_synced_at", "INTEGER");
  addColumn("account_credit_use_v1", "credits", "INTEGER NOT NULL DEFAULT 1");
  addColumn("account_credit_use_v1", "kind", "TEXT NOT NULL DEFAULT 'chat'");
  addColumn("account_credit_use_v1", "source", "TEXT NOT NULL DEFAULT 'plan'");
  fs.chmodSync(file, 0o600);
  owner.diamondAccountPlansDatabase = db;
  return db;
}

const creditError = (message: string, code: string) => Object.assign(new Error(message), { status: 402, code });

const toRecord = (row: PlanRow): AccountPlanRecord => ({
  plan: isAccountPlanId(row.plan) ? row.plan : "trial",
  trialStartedAt: row.trial_started_at,
  periodStartedAt: row.period_started_at,
  testUsedExtra: row.test_used_extra,
  topUpCredits: row.top_up_credits ?? 0,
  interval: row.billing_interval === "year" ? "year" : "month",
  billingStatus: (["active", "past_due", "canceled"].includes(row.billing_status ?? "") ? row.billing_status : "none") as BillingStatus,
  pastDueSince: row.past_due_since,
  cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  planEnded: Boolean(row.plan_ended),
});

function readPlanRow(ownerId: string, now: number): PlanRow {
  const db = database();
  db.prepare("INSERT OR IGNORE INTO account_plan_v1 (owner_id, plan, trial_started_at, period_started_at, test_used_extra, updated_at) VALUES (?, 'trial', ?, ?, 0, ?)")
    .run(ownerId, now, now, now);
  return db.prepare("SELECT * FROM account_plan_v1 WHERE owner_id = ?").get(ownerId) as PlanRow;
}

export function readAccountPlanRecord(ownerId: string, now = Date.now()): AccountPlanRecord {
  return toRecord(readPlanRow(ownerId, now));
}

/** Plan credits spent in a window (extra/top-up credits are tracked as a balance instead). */
const planCreditsUsed = (ownerId: string, start: number, end: number) =>
  (database().prepare("SELECT COALESCE(SUM(credits), 0) AS used FROM account_credit_use_v1 WHERE owner_id = ? AND source = 'plan' AND used_at >= ? AND used_at < ?")
    .get(ownerId, start, end) as { used: number }).used;

export function getAccountPlanStatus(ownerId: string, now = Date.now()): AccountPlanStatus {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  return accountPlanStatus(record, planCreditsUsed(ownerId, start, end), now);
}

/** Throws a friendly 402 error when an AI action that costs `cost` credits can't start for this account. */
export function assertAiCreditAvailable(ownerId: string, reservedCredits: number, cost: number = AI_ACTION_CREDITS.chat) {
  const check = checkAiCredit(getAccountPlanStatus(ownerId), reservedCredits, cost);
  if (!check.ok) throw creditError(check.message, check.code);
}

/** Spends an action's credits once (the same job is never counted twice): plan credits first, then extra credits. */
export function spendAiCredit(ownerId: string, jobId: string, credits: number = AI_ACTION_CREDITS.chat, kind: AiActionKind = "chat", now = Date.now()) {
  const db = database();
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM account_credit_use_v1 WHERE owner_id = ? AND job_id = ?").get(ownerId, jobId)) return;
    const status = getAccountPlanStatus(ownerId, now);
    const fromPlan = Math.min(credits, status.planCreditsLeft);
    const fromTopUp = Math.min(credits - fromPlan, status.topUpCredits);
    db.prepare("INSERT INTO account_credit_use_v1 (owner_id, job_id, used_at, credits, kind, source) VALUES (?, ?, ?, ?, ?, 'plan')")
      .run(ownerId, jobId, now, fromPlan, kind);
    if (fromTopUp > 0) {
      db.prepare("INSERT INTO account_credit_use_v1 (owner_id, job_id, used_at, credits, kind, source) VALUES (?, ?, ?, ?, ?, 'topup')")
        .run(ownerId, `${jobId}:topup`, now, fromTopUp, kind);
      db.prepare("UPDATE account_plan_v1 SET top_up_credits = MAX(0, top_up_credits - ?), updated_at = ? WHERE owner_id = ?").run(fromTopUp, now, ownerId);
    }
  })();
}

/** Credits spent per action kind in the current window (for the AI Dashboard). */
/** Every credit spend in this window (time, credits, kind): the dashboard chart reads the same list as the bar. */
export function getCreditUseEvents(ownerId: string, now = Date.now()) {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  // Arthur (2026-10-27): the chart climbs until the refill, then drops to zero — so it also reads last month's uses.
  const from = record.plan === "trial" ? start : addMonths(start, -1);
  return database().prepare("SELECT used_at AS at, credits, kind FROM account_credit_use_v1 WHERE owner_id = ? AND used_at >= ? AND used_at < ? ORDER BY used_at")
    .all(ownerId, from, end) as { at: number; credits: number; kind: string }[];
}

export function getCreditUseByKind(ownerId: string, now = Date.now()) {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  const rows = database().prepare("SELECT kind, COALESCE(SUM(credits), 0) AS credits, COUNT(DISTINCT REPLACE(job_id, ':topup', '')) AS actions FROM account_credit_use_v1 WHERE owner_id = ? AND used_at >= ? AND used_at < ? GROUP BY kind")
    .all(ownerId, start, end) as { kind: string; credits: number; actions: number }[];
  // Development tests only: credits the "− credits" test buttons count as used, so this list matches "credits used".
  if (record.testUsedExtra > 0) rows.push({ kind: "test", credits: record.testUsedExtra, actions: 0 });
  return rows;
}

// ---------- Billing (Stripe test mode in Phase 9; see stripeBilling.ts) ----------

export type AccountBillingIds = { customerId: string | null; subscriptionId: string | null; syncedAt: number | null };

export function readAccountBillingIds(ownerId: string, now = Date.now()): AccountBillingIds {
  const row = readPlanRow(ownerId, now);
  return { customerId: row.stripe_customer_id, subscriptionId: row.stripe_subscription_id, syncedAt: row.billing_synced_at };
}

export function setStripeCustomerId(ownerId: string, customerId: string, now = Date.now()) {
  readPlanRow(ownerId, now);
  database().prepare("UPDATE account_plan_v1 SET stripe_customer_id = ?, updated_at = ? WHERE owner_id = ?").run(customerId, now, ownerId);
}

/** Applies what the payment provider says about this account's subscription. */
export function applySubscriptionState(ownerId: string, state: {
  plan: PaidPlanId; interval: BillingInterval; status: BillingStatus; periodStartedAt: number;
  cancelAtPeriodEnd: boolean; subscriptionId: string; customerId?: string | null;
}, now = Date.now()) {
  const row = readPlanRow(ownerId, now);
  const ended = state.status === "canceled";
  const pastDueSince = state.status === "past_due" ? row.past_due_since ?? now : null;
  database().prepare(`UPDATE account_plan_v1 SET plan = ?, billing_interval = ?, billing_status = ?, period_started_at = ?,
      cancel_at_period_end = ?, plan_ended = ?, past_due_since = ?, stripe_subscription_id = ?, stripe_customer_id = COALESCE(?, stripe_customer_id),
      billing_synced_at = ?, test_used_extra = CASE WHEN plan = ? THEN test_used_extra ELSE 0 END, updated_at = ? WHERE owner_id = ?`)
    .run(ended ? "trial" : state.plan, state.interval, state.status, state.periodStartedAt, state.cancelAtPeriodEnd ? 1 : 0,
      ended ? 1 : 0, pastDueSince, state.subscriptionId, state.customerId ?? null, now, state.plan, now, ownerId);
}

export function markBillingSynced(ownerId: string, now = Date.now()) {
  database().prepare("UPDATE account_plan_v1 SET billing_synced_at = ? WHERE owner_id = ?").run(now, ownerId);
}

/** Records a processed payment event once; returns false if it was already processed. */
export function claimBillingEvent(ownerId: string, eventId: string, kind: string, now = Date.now()) {
  const result = database().prepare("INSERT OR IGNORE INTO account_billing_event_v1 (event_id, owner_id, kind, at) VALUES (?, ?, ?, ?)").run(eventId, ownerId, kind, now);
  return result.changes === 1;
}

/** Adds bought extra credits (once per payment). */
export function addTopUpCredits(ownerId: string, credits: number, eventId: string, now = Date.now()) {
  const db = database();
  return db.transaction(() => {
    if (!claimBillingEvent(ownerId, eventId, "topup", now)) return false;
    readPlanRow(ownerId, now);
    db.prepare("UPDATE account_plan_v1 SET top_up_credits = top_up_credits + ?, updated_at = ? WHERE owner_id = ?").run(Math.max(0, Math.round(credits)), now, ownerId);
    return true;
  })();
}

export type AiCreditGate = {
  assertAvailable(ownerId: string, reservedCredits: number, cost?: number): void;
  spend(ownerId: string, jobId: string, credits?: number, kind?: AiActionKind): void;
};

export const accountAiCreditGate: AiCreditGate = { assertAvailable: assertAiCreditAvailable, spend: spendAiCredit };

// ---------- Development-only test switch (the /dev/plan page and the AI Dashboard's test controls). ----------
// Nothing here is charged and nothing calls the AI: it only changes this account's local plan record.

/** "Pretend AI use": records a FAKE usage entry (job id "test:…") so the dashboard's usage rows can be previewed. No AI runs. */
export const TEST_SPEND_ACTIONS = ["spend_chat", "spend_assistant", "spend_simple", "spend_big"] as const;
export type TestSpendAction = (typeof TEST_SPEND_ACTIONS)[number];
const TEST_SPEND_KIND: Record<TestSpendAction, AiActionKind> = { spend_chat: "chat", spend_assistant: "assistant", spend_simple: "simple", spend_big: "big" };
export const isTestSpendAction = (value: unknown): value is TestSpendAction => (TEST_SPEND_ACTIONS as readonly unknown[]).includes(value);

/** "Pretend buy": adds an extra-credit pack like a finished purchase, with the same members-only rule. No Stripe. */
export const TEST_BUY_ACTIONS = ["buy_small", "buy_medium", "buy_large"] as const;
type TestBuyAction = (typeof TEST_BUY_ACTIONS)[number];
const isTestBuyAction = (value: unknown): value is TestBuyAction => (TEST_BUY_ACTIONS as readonly unknown[]).includes(value);

export const TEST_PLAN_ACTIONS = [
  "trial_new", "trial_day_13", "trial_ended", "low_credits", "no_credits", "starter", "creator", "studio",
  "plus_25", "minus_25", "plus_100", "minus_100", "refill_full", "refill_now", "wait_for_refill", "refill_tomorrow",
  "payment_failed", "payment_failed_locked", "payment_fixed", "plan_ended", "clear_extra",
  ...TEST_SPEND_ACTIONS, ...TEST_BUY_ACTIONS,
] as const;
export type TestPlanAction = (typeof TEST_PLAN_ACTIONS)[number];

export function applyTestPlanAction(ownerId: string, action: TestPlanAction, now = Date.now()) {
  // A test state (payment failed, waiting for refill…) must not be undone a minute later by the Stripe check:
  // pause that check for this account for an hour after any test button.
  database().prepare("UPDATE account_plan_v1 SET billing_synced_at = ? WHERE owner_id = ?").run(now + 60 * 60 * 1000, ownerId);
  applyTestPlanActionNow(ownerId, action, now);
}

function applyTestPlanActionNow(ownerId: string, action: TestPlanAction, now: number) {
  const db = database();
  const record = readAccountPlanRecord(ownerId, now);
  const update = (sql: string, ...values: unknown[]) => db.prepare(`UPDATE account_plan_v1 SET ${sql}, updated_at = ? WHERE owner_id = ?`).run(...values, now, ownerId);
  const set = (plan: AccountPlanId, trialStartedAt: number | null) =>
    update("plan = ?, trial_started_at = ?, period_started_at = ?, test_used_extra = 0, plan_ended = 0, billing_status = ?, past_due_since = NULL, cancel_at_period_end = 0",
      plan, trialStartedAt ?? record.trialStartedAt, plan === "trial" ? record.periodStartedAt : now, plan === "trial" ? "none" : "active");
  const status = () => getAccountPlanStatus(ownerId, now);
  const realUsed = () => { const { start, end } = creditWindow(readAccountPlanRecord(ownerId, now), now); return planCreditsUsed(ownerId, start, end); };
  const total = ACCOUNT_PLANS[record.plan].credits;
  // Arthur (2026-10-27): test buttons that use credits record a real (test) credit use, so the dashboard's line climbs
  // with them and reaches the red ceiling when every credit is used.
  const testUse = (credits: number) => {
    if (credits > 0) db.prepare("INSERT INTO account_credit_use_v1 (owner_id, job_id, used_at, credits, kind, source) VALUES (?, ?, ?, ?, 'test', 'plan')")
      .run(ownerId, `test:use:${now}:${Math.random().toString(36).slice(2, 8)}`, now, credits);
  };
  if (isTestSpendAction(action)) {
    // Like a real AI action that succeeded: the same credit check first (throws the friendly 402), then the spend.
    const kind = TEST_SPEND_KIND[action];
    assertAiCreditAvailable(ownerId, 0, AI_ACTION_CREDITS[kind]);
    return spendAiCredit(ownerId, `test:${Date.now()}`, AI_ACTION_CREDITS[kind], kind, now);
  }
  if (isTestBuyAction(action)) {
    const current = status();
    const pack = topUpPacksFor(current.plan)[TEST_BUY_ACTIONS.indexOf(action)];
    if (!pack || current.locked) throw creditError("Extra credits are for members — choose a plan first.", "members_only");
    if (current.paymentProblem) throw creditError("Your last payment didn't go through. Update your card in Manage plan first.", "payment_problem");
    return addTopUpCredits(ownerId, pack.credits, `test:${action}:${now}`, now);
  }
  switch (action) {
    case "trial_new": return set("trial", now);
    case "trial_day_13": return set("trial", now - (TRIAL_DAYS - 2) * DAY_MS);
    case "trial_ended": return set("trial", now - (TRIAL_DAYS + 1) * DAY_MS);
    case "low_credits": case "no_credits": {
      const target = action === "low_credits" ? total - 5 : total;
      update("test_used_extra = 0, top_up_credits = 0");
      const missing = target - realUsed();
      if (missing < 0) return update("test_used_extra = ?", missing);
      testUse(missing);
      return status();
    }
    case "plus_25": case "plus_100": {
      const amount = action === "plus_25" ? 25 : 100;
      // Give back used plan credits first; past a full plan, the test count goes negative (credits above the plan).
      return update("test_used_extra = test_used_extra - ?", amount);
    }
    case "minus_25": case "minus_100": {
      testUse(Math.min(action === "minus_25" ? 25 : 100, status().planCreditsLeft));
      return status();
    }
    case "refill_full": {
      // A pretend refill also forgets this month's pretend AI use, so "Used this month" matches the meter.
      db.prepare("DELETE FROM account_credit_use_v1 WHERE owner_id = ? AND job_id LIKE 'test:%'").run(ownerId);
      return update("test_used_extra = ?", -realUsed());
    }
    case "wait_for_refill": {
      // A paid plan with every credit used and the refill 3 days away (the trial has no refill: switch to Starter).
      const plan = record.plan === "trial" ? "starter" : record.plan;
      const periodStart = addMonths(now + 3 * DAY_MS, -1);
      update("plan = ?, period_started_at = ?, billing_status = 'active', plan_ended = 0, top_up_credits = 0, test_used_extra = 0", plan, periodStart);
      return update("test_used_extra = ?", ACCOUNT_PLANS[plan].credits - realUsed());
    }
    case "refill_now": {
      // A pretend refill that starts a new month right now (this month's use stays in last month, so the chart drops).
      if (record.plan === "trial") return update("plan = plan");
      return update("period_started_at = ?, test_used_extra = 0, billing_status = 'active', plan_ended = 0", now);
    }
    case "refill_tomorrow": {
      const plan = record.plan === "trial" ? "starter" : record.plan;
      return update("plan = ?, period_started_at = ?, billing_status = 'active', plan_ended = 0", plan, addMonths(now + DAY_MS, -1));
    }
    case "payment_failed": return update("billing_status = 'past_due', past_due_since = ?", now);
    case "payment_failed_locked": return update("billing_status = 'past_due', past_due_since = ?", now - 4 * DAY_MS);
    case "payment_fixed": return update("billing_status = 'active', past_due_since = NULL");
    case "plan_ended": return update("plan = 'trial', plan_ended = 1, billing_status = 'canceled', past_due_since = NULL, cancel_at_period_end = 0");
    case "clear_extra": return update("top_up_credits = 0");
    default: return set(action, null);
  }
}

/** Delete my account: forget this account's plan and credit history. */
export function deleteAccountPlan(ownerId: string) {
  const db = database();
  db.prepare("DELETE FROM account_credit_use_v1 WHERE owner_id = ?").run(ownerId);
  db.prepare("DELETE FROM account_billing_event_v1 WHERE owner_id = ?").run(ownerId);
  db.prepare("DELETE FROM account_plan_v1 WHERE owner_id = ?").run(ownerId);
}
