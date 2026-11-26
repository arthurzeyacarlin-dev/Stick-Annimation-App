// Each account's plan, its credits, and every payment Stripe confirmed, kept on the server in
// .local/spec0015-phase3/account-plans.sqlite (opened on first use). The pure rules live in plans.ts.
// An account gets its 14-day trial the first time it is seen.
// Credits are spent only when an AI action succeeds (the price shown on its card, never more); failed, refused or stopped
// actions are free. Plan credits are spent first, then pack credits. Nov 20 (the money system):
//   - a cycle's plan credits exist only once Stripe confirmed that cycle's payment (paid_plan / paid_from / paid_until);
//   - every payment is recorded once (account_payment_v1), so refunds, the "last payment" line and deleting an account are exact;
//   - a refund takes that payment's credits back; a disputed payment pauses the AI;
//   - one account can spend at most DAILY_CREDIT_LIMIT credits in 24 hours, and the owner is told when a day's AI spending
//     passes the alarm.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_PLANS, accountPlanStatus, addCycles, AI_ACTION_CREDITS, checkAiCredit, checkDailyLimit, creditWindow, DAILY_CREDIT_LIMIT, DAY_MS,
  isAccountPlanId, isAiActionKind, isTrialGate, PLAN_CYCLE, SHORT_ANIMATION_CREDITS, topUpPacksFor, TRIAL_DAYS,
  type AccountPlanId, type AccountPlanRecord, type AccountPlanStatus, type AiActionKind, type BillingInterval, type BillingStatus, type PaidPlanId, type TrialGate,
} from "./plans.ts";
import { creditsText } from "./credits.ts";
import { ownerAlert } from "./ownerAlerts.ts";
import { billingModeForKey } from "./stripeBillingRules.ts";

/** "live" (real money), "test" (fake cards) or "off", from the server's Stripe settings. Nov 21 (Arthur: "100% NOT test
 *  mode"): in live mode nothing from test mode may count — not a plan, pack or payment made with a test card, and not the
 *  development test buttons. */
export const moneyMode = () => billingModeForKey(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_LIVE_OK?.trim() === "yes");

type PlanRow = {
  plan: string; trial_started_at: number; period_started_at: number; test_used_extra: number;
  top_up_credits: number; billing_interval: string | null; billing_status: string | null; past_due_since: number | null;
  cancel_at_period_end: number; plan_ended: number; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  billing_synced_at: number | null; paid_plan: string | null; paid_from: number | null; paid_until: number | null; disputed: number;
  period_ends_at: number | null; billing_notice: string | null; billing_notice_at: number | null; trial_gate: string | null; free_credits: number;
};
type PaymentRow = {
  stripe_id: string; owner_id: string; kind: string; amount_cents: number; credits: number; plan: string | null;
  period_from: number | null; period_until: number | null; paid_at: number; charge_id: string | null; payment_intent_id: string | null;
  subscription_id: string | null; refunded_cents: number; taken_credits: number; free_refund_cents: number;
};
type CreditsGlobal = typeof globalThis & { diamondAccountPlansDatabase?: Database.Database; diamondAccountPlansSchema?: number; diamondAccountPlansMoneyMode?: string };

const owner = globalThis as CreditsGlobal;

/** A plan set without Stripe (the development test buttons) is "paid" until this far-away time. */
const TEST_PAID_UNTIL = Date.UTC(2100, 0, 1);
/** Raise this whenever a table or column is added: a server that keeps running (or new code dropped into it) adds them at once.
 *  (Nov 20, live: the app copy's running server kept its open database from before the payments table, so every plan read failed.) */
const SCHEMA_VERSION = 6;   // (Nov 26: the money-leaks columns + the testimonial free_credits column, in one combined deploy)

function database() {
  const cached = owner.diamondAccountPlansDatabase;
  if (cached && owner.diamondAccountPlansSchema === SCHEMA_VERSION) {
    // The Stripe settings changed while the server kept running (test → live): clear test money before anything is read.
    if (owner.diamondAccountPlansMoneyMode !== moneyMode()) forgetTestMoney(cached);
    return cached;
  }
  const root = path.resolve(process.cwd(), ".local/spec0015-phase3");
  const file = path.join(root, "account-plans.sqlite");
  const db: Database.Database = cached ?? (() => {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const opened = new Database(file);
    opened.pragma("journal_mode = WAL");
    opened.pragma("busy_timeout = 5000");
    return opened;
  })();
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
    CREATE TABLE IF NOT EXISTS account_payment_v1 (
      stripe_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      plan TEXT,
      period_from INTEGER,
      period_until INTEGER,
      paid_at INTEGER NOT NULL,
      charge_id TEXT,
      payment_intent_id TEXT,
      subscription_id TEXT,
      refunded_cents INTEGER NOT NULL DEFAULT 0,
      taken_credits INTEGER NOT NULL DEFAULT 0,
      free_refund_cents INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS account_payment_v1_owner ON account_payment_v1(owner_id, paid_at);
    -- (dad, Nov 26) real AI money spent for an account that was NOT charged as credits: a gate picture still waiting
    -- (why 'waiting_picture'; removed once it is animated or charged) and a run stopped or failed after the AI started ('stopped_run')
    CREATE TABLE IF NOT EXISTS account_ai_cost_v1 (
      owner_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      why TEXT NOT NULL,
      PRIMARY KEY (owner_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS account_ai_cost_v1_time ON account_ai_cost_v1(at);
  `);
  // Columns added in place over time; old rows keep working.
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
  addColumn("account_plan_v1", "paid_plan", "TEXT");
  addColumn("account_plan_v1", "paid_from", "INTEGER");
  addColumn("account_plan_v1", "paid_until", "INTEGER");
  addColumn("account_plan_v1", "disputed", "INTEGER NOT NULL DEFAULT 0");
  addColumn("account_plan_v1", "period_ends_at", "INTEGER");
  addColumn("account_plan_v1", "billing_notice", "TEXT");
  addColumn("account_plan_v1", "billing_notice_at", "INTEGER");
  // Which money a row's Stripe facts belong to ("test" or "live"); rows from before Nov 21 are all test mode (NULL).
  addColumn("account_plan_v1", "money_mode", "TEXT");
  addColumn("account_payment_v1", "money_mode", "TEXT");
  // Nov 26: how many of the extra credits were given free (the testimonial thank-you), so they never come back as money.
  addColumn("account_plan_v1", "free_credits", "INTEGER NOT NULL DEFAULT 0");
  addColumn("account_credit_use_v1", "credits", "INTEGER NOT NULL DEFAULT 1");
  addColumn("account_credit_use_v1", "kind", "TEXT NOT NULL DEFAULT 'chat'");
  addColumn("account_credit_use_v1", "source", "TEXT NOT NULL DEFAULT 'plan'");
  addColumn("account_plan_v1", "trial_gate", "TEXT");
  // (dad, Nov 26) ONCE, when the email rule arrives: an account from before it that has no plan, no payment and no AI use yet
  // confirms its email on its next animation (its trial dates stay). Accounts with a plan or real activity count as confirmed.
  db.exec("CREATE TABLE IF NOT EXISTS account_meta_v1 (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  if (!db.prepare("SELECT 1 FROM account_meta_v1 WHERE key = 'trial-gate-legacy'").get()) {
    db.transaction(() => {
      db.prepare(`UPDATE account_plan_v1 SET trial_gate = 'confirm_legacy' WHERE trial_gate IS NULL AND plan = 'trial' AND plan_ended = 0
        AND stripe_customer_id IS NULL AND NOT EXISTS (SELECT 1 FROM account_credit_use_v1 u WHERE u.owner_id = account_plan_v1.owner_id AND u.kind NOT IN ('test', 'refund'))`).run();
      db.prepare("INSERT INTO account_meta_v1 (key, value) VALUES ('trial-gate-legacy', ?)").run(String(Date.now()));
    })();
  }
  db.exec("CREATE INDEX IF NOT EXISTS account_plan_v1_customer ON account_plan_v1(stripe_customer_id)");
  // A paid plan from before Nov 20 set without Stripe (test buttons) has no paid time yet: it stays usable as before.
  db.exec(`UPDATE account_plan_v1 SET paid_plan = plan, paid_from = 0, paid_until = ${TEST_PAID_UNTIL}
    WHERE plan != 'trial' AND paid_until IS NULL AND stripe_subscription_id IS NULL`);
  try { fs.chmodSync(file, 0o600); } catch { /* the file is already private */ }
  owner.diamondAccountPlansDatabase = db;
  owner.diamondAccountPlansSchema = SCHEMA_VERSION;
  forgetTestMoney(db);
  return db;
}

/** Nov 21 (Arthur: "100% NOT test mode"). When the server runs on real money, everything paid with a test card is wiped:
 *  test plans, test packs, test payments, test Stripe customers, and plans set by the development test buttons. The account
 *  goes back to its free trial clock (over = locked until a real payment). Its AI use history stays (that AI really ran).
 *  Real-money rows are marked "live" when written, so they are never touched. In test mode nothing is wiped. */
export function forgetTestMoney(db: Database.Database = database(), now = Date.now()) {
  const mode = moneyMode();
  owner.diamondAccountPlansMoneyMode = mode;
  if (mode !== "live") return { accounts: 0, payments: 0 };
  return db.transaction(() => {
    const accounts = db.prepare(`UPDATE account_plan_v1 SET plan = 'trial', paid_plan = NULL, paid_from = NULL, paid_until = NULL,
        billing_interval = NULL, billing_status = NULL, past_due_since = NULL, cancel_at_period_end = 0, plan_ended = 0,
        stripe_customer_id = NULL, stripe_subscription_id = NULL, billing_synced_at = NULL, disputed = 0, period_ends_at = NULL,
        billing_notice = NULL, billing_notice_at = NULL, top_up_credits = 0, free_credits = 0, test_used_extra = 0, money_mode = 'live', updated_at = ?
      WHERE COALESCE(money_mode, 'test') != 'live' AND (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
        OR paid_plan IS NOT NULL OR plan != 'trial' OR top_up_credits != 0 OR test_used_extra != 0 OR plan_ended != 0
        OR billing_status IS NOT NULL OR disputed != 0)`).run(now).changes;
    const payments = db.prepare("DELETE FROM account_payment_v1 WHERE COALESCE(money_mode, 'test') != 'live'").run().changes;
    if (accounts || payments) console.warn(`[billing] real money is on: cleared test-mode plans/packs on ${accounts} account(s) and ${payments} test payment(s).`);
    return { accounts, payments };
  }).immediate();
}

const creditError = (message: string, code: string) => Object.assign(new Error(message), { status: 402, code });

const toRecord = (row: PlanRow): AccountPlanRecord => ({
  plan: isAccountPlanId(row.plan) ? row.plan : "trial",
  trialStartedAt: row.trial_started_at,
  periodStartedAt: row.period_started_at,
  testUsedExtra: row.test_used_extra,
  topUpCredits: row.top_up_credits ?? 0,
  interval: row.billing_interval === "year" ? "year" : row.billing_interval === "week" ? "week" : "month",
  billingStatus: (["active", "past_due", "canceled"].includes(row.billing_status ?? "") ? row.billing_status : "none") as BillingStatus,
  pastDueSince: row.past_due_since,
  cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  planEnded: Boolean(row.plan_ended),
  paidPlan: isAccountPlanId(row.paid_plan) ? row.paid_plan : null,
  paidFrom: row.paid_from,
  paidUntil: row.paid_until,
  disputed: Boolean(row.disputed),
  trialGate: isTrialGate(row.trial_gate) ? row.trial_gate : null,
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

// ---------- (dad, Nov 26) the free trial's email rule (the confirm step itself lives in emailConfirm.ts) ----------

/** A NEW sign-up: its free trial waits for the email ("confirm"), or it gets none because the inbox already had one ("no_trial"). */
export function setTrialGate(ownerId: string, gate: TrialGate | null, now = Date.now()) {
  readPlanRow(ownerId, now);
  database().prepare("UPDATE account_plan_v1 SET trial_gate = ?, updated_at = ? WHERE owner_id = ?").run(gate, now, ownerId);
}

/** An account from before the rule that never had a plan row (it never opened the app after signing up): it confirms too.
 *  Its trial counts from when it was made. Accounts that have a row already are left exactly as they are. */
export function ensureLegacyTrialGate(ownerId: string, createdAt: number, now = Date.now()) {
  const at = Number.isFinite(createdAt) && createdAt > 0 && createdAt <= now ? createdAt : now;
  database().prepare("INSERT OR IGNORE INTO account_plan_v1 (owner_id, plan, trial_started_at, period_started_at, test_used_extra, updated_at, trial_gate) VALUES (?, 'trial', ?, ?, 0, ?, 'confirm_legacy')")
    .run(ownerId, at, at, now);
}

/** The email is confirmed: a new sign-up's 14 days start NOW; an older account keeps its dates. True when a trial started. */
export function startTrialAfterConfirm(ownerId: string, now = Date.now()): boolean {
  const record = readAccountPlanRecord(ownerId, now);
  if (record.trialGate === "confirm") {
    database().prepare("UPDATE account_plan_v1 SET trial_gate = NULL, trial_started_at = ?, period_started_at = CASE WHEN plan = 'trial' THEN ? ELSE period_started_at END, updated_at = ? WHERE owner_id = ?")
      .run(now, now, now, ownerId);
    return record.plan === "trial";
  }
  if (record.trialGate === "confirm_legacy") {
    database().prepare("UPDATE account_plan_v1 SET trial_gate = NULL, updated_at = ? WHERE owner_id = ?").run(now, ownerId);
    return record.plan === "trial";
  }
  return false;
}

/** Has this account used (or paid past) its free trial? (A confirmed trial, a plan, a payment or real AI use.) */
export function accountUsedTrial(ownerId: string): boolean {
  const row = database().prepare("SELECT plan, trial_gate, stripe_customer_id, plan_ended FROM account_plan_v1 WHERE owner_id = ?").get(ownerId) as
    { plan: string; trial_gate: string | null; stripe_customer_id: string | null; plan_ended: number } | undefined;
  if (!row) return false;
  if (row.trial_gate === null) return true;
  return row.plan !== "trial" || Boolean(row.stripe_customer_id) || Boolean(row.plan_ended);
}

/** Plan credits spent in a window (pack credits are tracked as a balance instead). */
const planCreditsUsed = (ownerId: string, start: number, end: number) =>
  (database().prepare("SELECT COALESCE(SUM(credits), 0) AS used FROM account_credit_use_v1 WHERE owner_id = ? AND source = 'plan' AND used_at >= ? AND used_at < ?")
    .get(ownerId, start, end) as { used: number }).used;

export function getAccountPlanStatus(ownerId: string, now = Date.now()): AccountPlanStatus {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  return accountPlanStatus(record, planCreditsUsed(ownerId, start, end), now);
}

/** Credits this account spent in the last 24 hours (the daily limit). Test rows and refunds don't count. (Dad, Nov 26) the real
 *  AI money of its waiting gate pictures and of runs stopped or failed after the AI started counts too, though it was never charged. */
const creditsUsedLastDay = (ownerId: string, now: number) =>
  (database().prepare("SELECT COALESCE(SUM(credits), 0) AS used FROM account_credit_use_v1 WHERE owner_id = ? AND used_at >= ? AND kind NOT IN ('test', 'refund')")
    .get(ownerId, now - DAY_MS) as { used: number }).used
  + (database().prepare("SELECT COALESCE(SUM(credits), 0) AS used FROM account_ai_cost_v1 WHERE owner_id = ? AND at >= ?").get(ownerId, now - DAY_MS) as { used: number }).used;

/** Why real AI money was not charged (dad, Nov 26): a gate picture still waiting; a run stopped or failed after the AI started; a plan
 *  answer or a replaced picture that the card's planning amount covers; the cold load of Sonnet's rulebook (we pay it). */
export type UnchargedWhy = "waiting_picture" | "stopped_run" | "free_plan" | "cold_load" | "pending_plan";
/** (Dad, Nov 26) Real AI money spent for this account that was NOT charged: a gate picture still waiting at its card
 *  ('waiting_picture'), or a run stopped or failed after the AI started ('stopped_run'). It is never taken from the balance; it
 *  counts toward the daily limit and the free trials' hourly limit, and a waiting picture holds its credits until it is animated or
 *  charged. `credits` 0 = settled (the row goes). */
export function noteUnchargedAiCost(ownerId: string, jobId: string, credits: number, why: UnchargedWhy, now = Date.now()) {
  const amount = Math.max(0, Math.ceil(Number(credits) || 0));
  if (amount <= 0) database().prepare("DELETE FROM account_ai_cost_v1 WHERE owner_id = ? AND job_id = ?").run(ownerId, jobId);
  else database().prepare("INSERT OR REPLACE INTO account_ai_cost_v1 (owner_id, job_id, at, credits, why) VALUES (?, ?, ?, ?, ?)").run(ownerId, jobId, now, amount, why);
}

/** (dad, Nov 26) Animate was pressed in this project: its free planning is now covered by the card's planning amount (it stops holding
 *  credits; it still counts toward the limits). */
export function settlePlanning(ownerId: string, projectId: string) {
  database().prepare("UPDATE account_ai_cost_v1 SET why = 'free_plan' WHERE owner_id = ? AND why = 'pending_plan' AND job_id LIKE ?")
    .run(ownerId, `plan:${projectId.replace(/[%_]/g, "")}:%`);
}

/** The credits this account's waiting gate pictures hold (only those made in the current credit window, so a picture from an
 *  earlier month never holds the new month's credits). `except` = the picture being animated right now (its price includes it). */
// (dad, Nov 26) also the free planning of a project that has not been animated yet ("pending_plan": its free plan answers):
// it holds credits until that project's Animate, so opening project after project can never be free planning without end.
const waitingPictureCredits = (ownerId: string, since: number, except: string | null, exceptProject: string | null = null) =>
  (database().prepare("SELECT COALESCE(SUM(credits), 0) AS n FROM account_ai_cost_v1 WHERE owner_id = ? AND why IN ('waiting_picture', 'pending_plan') AND at >= ? AND job_id != ? AND job_id NOT LIKE ?")
    .get(ownerId, since, except ?? "", exceptProject ? `plan:${exceptProject.replace(/[%_]/g, "")}:%` : "\u0000") as { n: number }).n;

/** (Nov 12 security, Nov 20 in credits) the trial fuse: ALL free-trial accounts together spend at most this many credits an
 *  hour, so a flood of fake accounts cannot burn the AI money; paid plans are never limited by it. */
export const TRIAL_HOUR_CREDITS = 4000;
const HOUR_MS = 60 * 60 * 1000;
const dailyLimit = () => {
  const value = Number(process.env.DIAMOND_DAILY_CREDIT_LIMIT);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : DAILY_CREDIT_LIMIT;
};

/** Throws a friendly 402 error when an AI action that costs `cost` credits can't start for this account.
 *  `reservedCredits` = what this account's running and waiting actions already hold. */
export function assertAiCreditAvailable(ownerId: string, reservedCredits: number, cost: number = AI_ACTION_CREDITS.chat, now = Date.now(),
  options: { exceptPicture?: string | null; exceptProject?: string | null } = {}) {
  const status = getAccountPlanStatus(ownerId, now);
  // (dad, Nov 26) a gate picture waiting at its card holds its real cost, like a running job (opening new projects is never free pictures)
  const pictures = waitingPictureCredits(ownerId, status.windowStart, options.exceptPicture ?? null, options.exceptProject ?? null);
  const check = checkAiCredit(status, reservedCredits + pictures, cost);
  if (!check.ok) throw creditError(check.message, check.code);
  const daily = checkDailyLimit(creditsUsedLastDay(ownerId, now) + Math.max(0, reservedCredits), cost, dailyLimit());
  if (!daily.ok) throw creditError(daily.message, daily.code);
  if (status.plan === "trial") {
    const hour = (database().prepare("SELECT COALESCE(SUM(u.credits), 0) AS n FROM account_credit_use_v1 u JOIN account_plan_v1 p ON p.owner_id = u.owner_id WHERE p.plan = 'trial' AND u.used_at >= ? AND u.kind NOT IN ('test', 'refund')")
      .get(now - HOUR_MS) as { n: number }).n
      // (dad, Nov 26) plus the real AI money the trials spent that was never charged (waiting pictures, stopped runs)
      + (database().prepare("SELECT COALESCE(SUM(c.credits), 0) AS n FROM account_ai_cost_v1 c LEFT JOIN account_plan_v1 p ON p.owner_id = c.owner_id WHERE COALESCE(p.plan, 'trial') = 'trial' AND c.at >= ?")
        .get(now - HOUR_MS) as { n: number }).n;
    if (hour + cost > TRIAL_HOUR_CREDITS) throw creditError("Busy hour for free trials - try again in a few minutes. Nothing was charged.", "busy_hour");
  }
}

/** The owner is told once a day when all accounts together spend more than this (dad's number; 2,500 credits = $25). */
const spendAlarm = () => {
  const value = Number(process.env.DIAMOND_SPEND_ALARM_CREDITS);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 2500;
};

/** Spends an action's credits once (the same job is never counted twice): plan credits first, then pack credits.
 *  Never more than `credits` (the price on its card); if less is left (a rare race), only what is left. */
export function spendAiCredit(ownerId: string, jobId: string, credits: number = AI_ACTION_CREDITS.chat, kind: AiActionKind = "chat", now = Date.now()) {
  const db = database();
  const amount = Math.max(0, Math.round(credits));
  const rowKind = isAiActionKind(kind) ? kind : "chat";
  const spent = db.transaction(() => {
    if (db.prepare("SELECT 1 FROM account_credit_use_v1 WHERE owner_id = ? AND job_id = ?").get(ownerId, jobId)) return false;
    const status = getAccountPlanStatus(ownerId, now);
    const fromPlan = Math.min(amount, status.planCreditsLeft);
    const fromTopUp = Math.min(amount - fromPlan, status.topUpCredits);
    db.prepare("INSERT INTO account_credit_use_v1 (owner_id, job_id, used_at, credits, kind, source) VALUES (?, ?, ?, ?, ?, 'plan')")
      .run(ownerId, jobId, now, fromPlan, rowKind);
    if (fromTopUp > 0) {
      db.prepare("INSERT INTO account_credit_use_v1 (owner_id, job_id, used_at, credits, kind, source) VALUES (?, ?, ?, ?, ?, 'topup')")
        .run(ownerId, `${jobId}:topup`, now, fromTopUp, rowKind);
      db.prepare("UPDATE account_plan_v1 SET top_up_credits = MAX(0, top_up_credits - ?), updated_at = ? WHERE owner_id = ?").run(fromTopUp, now, ownerId);
    }
    return true;
  }).immediate();
  if (spent) checkSpendAlarm(now);
}

function checkSpendAlarm(now: number) {
  try {
    const day = new Date(now).toISOString().slice(0, 10);
    const dayStart = Date.parse(`${day}T00:00:00Z`);
    const total = (database().prepare("SELECT COALESCE(SUM(credits), 0) AS n FROM account_credit_use_v1 WHERE used_at >= ? AND kind NOT IN ('test', 'refund')")
      .get(dayStart) as { n: number }).n;
    if (total >= spendAlarm() && claimBillingEvent("system", `alarm:${day}`, "alarm", now)) {
      ownerAlert(`alarm:${day}`, `Today's AI spending passed ${creditsText(spendAlarm())} (about $${(spendAlarm() / 100).toFixed(2)}). Now: ${creditsText(total)}. Check the fal and Anthropic dashboards.`, now);
    }
  } catch { /* the alarm must never break a charge */ }
}

/** Every credit spend in this window (time, credits, kind): the dashboard chart reads the same list as the bar. */
export function getCreditUseEvents(ownerId: string, now = Date.now()) {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  // Arthur (2026-10-27): the chart climbs until the refill, then drops to zero — so it also reads last cycle's uses.
  const from = record.plan === "trial" ? start : addCycles(start, -1);
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

/** Follow-up emails (read only): whether this account was ever charged for a new animation (its first one landed). */
export function hasMadeAnimation(ownerId: string): boolean {
  return Boolean(database().prepare("SELECT 1 FROM account_credit_use_v1 WHERE owner_id = ? AND kind IN ('animation', 'simple', 'big') LIMIT 1").get(ownerId));
}

/** Plan credits used in the current window (deleting an account refunds the rest of what was paid). */
export function planCreditsUsedNow(ownerId: string, now = Date.now()) {
  const record = readAccountPlanRecord(ownerId, now);
  const { start, end } = creditWindow(record, now);
  return planCreditsUsed(ownerId, start, end) + Math.max(0, record.testUsedExtra);
}

// ---------- Billing (what Stripe says; see stripeBilling.ts) ----------

export type AccountBillingIds = { customerId: string | null; subscriptionId: string | null; syncedAt: number | null };

export function readAccountBillingIds(ownerId: string, now = Date.now()): AccountBillingIds {
  const row = readPlanRow(ownerId, now);
  return { customerId: row.stripe_customer_id, subscriptionId: row.stripe_subscription_id, syncedAt: row.billing_synced_at };
}

export function setStripeCustomerId(ownerId: string, customerId: string, now = Date.now()) {
  readPlanRow(ownerId, now);
  database().prepare("UPDATE account_plan_v1 SET stripe_customer_id = ?, money_mode = ?, updated_at = ? WHERE owner_id = ?").run(customerId, moneyMode(), now, ownerId);
}

/** The account a Stripe customer belongs to (the webhook doorbell). */
export function findOwnerByStripeCustomer(customerId: string): string | null {
  const row = database().prepare("SELECT owner_id FROM account_plan_v1 WHERE stripe_customer_id = ?").get(customerId) as { owner_id: string } | undefined;
  return row?.owner_id ?? null;
}

/** Every account that has a Stripe customer (the daily match check). */
export function listBillingOwners(): string[] {
  return (database().prepare("SELECT owner_id FROM account_plan_v1 WHERE stripe_customer_id IS NOT NULL ORDER BY owner_id").all() as { owner_id: string }[])
    .map((row) => row.owner_id);
}

export type SubscriptionState = {
  plan: PaidPlanId; interval: BillingInterval; status: BillingStatus; periodStartedAt: number; periodEndsAt: number | null;
  cancelAtPeriodEnd: boolean; subscriptionId: string; customerId?: string | null;
  /** The plan and the time the last PAID invoice pays for; null = keep what was saved (nothing new is paid). */
  paid: { plan: PaidPlanId; from: number; until: number } | null;
};

/** Applies what Stripe says about this account's subscription. Returns true when anything that matters changed. */
export function applySubscriptionState(ownerId: string, state: SubscriptionState, now = Date.now()): boolean {
  const db = database();
  return db.transaction(() => {
    const row = readPlanRow(ownerId, now);
    const ended = state.status === "canceled";
    const pastDueSince = state.status === "past_due" ? row.past_due_since ?? now : null;
    const paidPlan = state.paid ? state.paid.plan : row.paid_plan;
    const paidFrom = state.paid ? state.paid.from : row.paid_from;
    const paidUntil = state.paid ? state.paid.until : row.paid_until;
    const nextPlan = ended ? "trial" : state.plan;
    const changed = row.plan !== nextPlan || row.billing_interval !== state.interval || row.billing_status !== state.status ||
      row.period_started_at !== state.periodStartedAt || row.cancel_at_period_end !== (state.cancelAtPeriodEnd ? 1 : 0) ||
      row.plan_ended !== (ended ? 1 : 0) || row.stripe_subscription_id !== state.subscriptionId || row.paid_plan !== paidPlan ||
      row.paid_from !== paidFrom || row.paid_until !== paidUntil;
    db.prepare(`UPDATE account_plan_v1 SET plan = ?, billing_interval = ?, billing_status = ?, period_started_at = ?,
        cancel_at_period_end = ?, plan_ended = ?, past_due_since = ?, stripe_subscription_id = ?, stripe_customer_id = COALESCE(?, stripe_customer_id),
        paid_plan = ?, paid_from = ?, paid_until = ?, period_ends_at = ?, money_mode = ?,
        billing_synced_at = ?, test_used_extra = CASE WHEN plan = ? THEN test_used_extra ELSE 0 END, updated_at = ? WHERE owner_id = ?`)
      .run(nextPlan, state.interval, state.status, state.periodStartedAt, state.cancelAtPeriodEnd ? 1 : 0, ended ? 1 : 0, pastDueSince,
        state.subscriptionId, state.customerId ?? null, paidPlan, paidFrom, paidUntil, state.periodEndsAt, moneyMode(), now, state.plan, now, ownerId);
    return changed;
  }).immediate();
}

export function markBillingSynced(ownerId: string, now = Date.now()) {
  database().prepare("UPDATE account_plan_v1 SET billing_synced_at = ? WHERE owner_id = ?").run(now, ownerId);
}

/** Records a processed payment event once; returns false if it was already processed. */
export function claimBillingEvent(ownerId: string, eventId: string, kind: string, now = Date.now()) {
  const result = database().prepare("INSERT OR IGNORE INTO account_billing_event_v1 (event_id, owner_id, kind, at) VALUES (?, ?, ?, ?)").run(eventId, ownerId, kind, now);
  return result.changes === 1;
}

/** Forgets a claim whose work could not finish (so the next check tries again). */
export function releaseBillingEvent(eventId: string) {
  database().prepare("DELETE FROM account_billing_event_v1 WHERE event_id = ?").run(eventId);
}

/** Adds bought pack credits (once per payment). */
export function addTopUpCredits(ownerId: string, credits: number, eventId: string, now = Date.now()) {
  const db = database();
  return db.transaction(() => {
    if (!claimBillingEvent(ownerId, eventId, "topup", now)) return false;
    readPlanRow(ownerId, now);
    db.prepare("UPDATE account_plan_v1 SET top_up_credits = top_up_credits + ?, money_mode = ?, updated_at = ? WHERE owner_id = ?").run(Math.max(0, Math.round(credits)), moneyMode(), now, ownerId);
    return true;
  }).immediate();
}

/** Nov 26 (dad: "30 free credits is fine"): free credits given as a thank-you (for a testimonial). They go into the same extra
 *  balance as pack credits (kept at a refill, spent after plan credits) and are given at most once per `eventId` (the same
 *  one-time record a pack uses, so a retry or double click can never give them twice). Never money: there is no payment, so
 *  nothing is ever refunded for them. The row is marked with today's money mode like a pack, so a live server keeps them after
 *  a restart. Deleting the account deletes them with everything else. True when the account has them (now or already before). */
export function giveGiftCreditsOnce(ownerId: string, credits: number, eventId: string, now = Date.now()) {
  const db = database();
  return db.transaction(() => {
    if (!claimBillingEvent(ownerId, eventId, "gift", now)) {
      return Boolean(db.prepare("SELECT 1 FROM account_billing_event_v1 WHERE event_id = ? AND owner_id = ?").get(eventId, ownerId));
    }
    readPlanRow(ownerId, now);
    const amount = Math.max(0, Math.round(credits));
    db.prepare("UPDATE account_plan_v1 SET top_up_credits = top_up_credits + ?, free_credits = free_credits + ?, money_mode = ?, updated_at = ? WHERE owner_id = ?")
      .run(amount, amount, moneyMode(), now, ownerId);
    return true;
  }).immediate();
}

/** The extra credits still unused that were PAID for (what deleting the account may give back as money). Free credits are
 *  counted as the last ones left (spent last), so they never turn into money: the paid ones are the balance above them. */
export function paidExtraCreditsLeft(ownerId: string, now = Date.now()) {
  const row = readPlanRow(ownerId, now);
  return Math.max(0, (row.top_up_credits ?? 0) - Math.max(0, row.free_credits ?? 0));
}

export type PaymentRecord = {
  stripeId: string; ownerId: string; kind: "plan" | "pack"; amountCents: number; credits: number; plan: string | null;
  periodFrom: number | null; periodUntil: number | null; paidAt: number; chargeId: string | null; paymentIntentId: string | null;
  subscriptionId: string | null; refundedCents: number; takenCredits: number; freeRefundCents: number;
};
const toPayment = (row: PaymentRow): PaymentRecord => ({
  stripeId: row.stripe_id, ownerId: row.owner_id, kind: row.kind === "pack" ? "pack" : "plan", amountCents: row.amount_cents, credits: row.credits,
  plan: row.plan, periodFrom: row.period_from, periodUntil: row.period_until, paidAt: row.paid_at, chargeId: row.charge_id,
  paymentIntentId: row.payment_intent_id, subscriptionId: row.subscription_id, refundedCents: row.refunded_cents,
  takenCredits: row.taken_credits, freeRefundCents: row.free_refund_cents,
});

/** Saves a payment Stripe confirmed (once per Stripe id). Returns true the first time. */
export function recordPayment(payment: Omit<PaymentRecord, "refundedCents" | "takenCredits" | "freeRefundCents">): boolean {
  const db = database();
  const result = db.prepare(`INSERT OR IGNORE INTO account_payment_v1 (stripe_id, owner_id, kind, amount_cents, credits, plan, period_from, period_until,
      paid_at, charge_id, payment_intent_id, subscription_id, money_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(payment.stripeId, payment.ownerId, payment.kind, Math.max(0, Math.round(payment.amountCents)), Math.max(0, Math.round(payment.credits)),
      payment.plan, payment.periodFrom, payment.periodUntil, payment.paidAt, payment.chargeId, payment.paymentIntentId, payment.subscriptionId, moneyMode());
  if (result.changes === 0 && (payment.chargeId || payment.paymentIntentId)) {
    db.prepare("UPDATE account_payment_v1 SET charge_id = COALESCE(charge_id, ?), payment_intent_id = COALESCE(payment_intent_id, ?) WHERE stripe_id = ?")
      .run(payment.chargeId, payment.paymentIntentId, payment.stripeId);
  }
  return result.changes === 1;
}

/** This account's payments, newest first. */
export function listPayments(ownerId: string, limit = 50): PaymentRecord[] {
  return (database().prepare("SELECT * FROM account_payment_v1 WHERE owner_id = ? ORDER BY paid_at DESC LIMIT ?").all(ownerId, limit) as PaymentRow[]).map(toPayment);
}

/** Notes a refund that must NOT take credits back (the both-codes 5%, an account being deleted). Called before the refund is made. */
export function addFreeRefund(stripeId: string, cents: number) {
  database().prepare("UPDATE account_payment_v1 SET free_refund_cents = MAX(0, free_refund_cents + ?) WHERE stripe_id = ?").run(Math.round(cents), stripeId);
}

/** The payment a Stripe charge belongs to (by its charge or its payment intent). */
export function findPaymentByCharge(chargeId: string | null, paymentIntentId: string | null): PaymentRecord | null {
  const row = database().prepare("SELECT * FROM account_payment_v1 WHERE (charge_id IS NOT NULL AND charge_id = ?) OR (payment_intent_id IS NOT NULL AND payment_intent_id = ?) LIMIT 1")
    .get(chargeId, paymentIntentId) as PaymentRow | undefined;
  return row ? toPayment(row) : null;
}

/** Plan credits used since a time (deleting a yearly plan counts all of its year so far). */
export function planCreditsUsedSince(ownerId: string, from: number, now = Date.now()) {
  return (database().prepare("SELECT COALESCE(SUM(credits), 0) AS used FROM account_credit_use_v1 WHERE owner_id = ? AND source = 'plan' AND kind != 'refund' AND used_at >= ? AND used_at <= ?")
    .get(ownerId, from, now) as { used: number }).used;
}

/** Stripe says this payment has `totalRefundedCents` refunded in all: takes back that share of its credits, once.
 *  Returns how many credits were taken back now. */
export function applyRefundTotal(stripeId: string, totalRefundedCents: number, now = Date.now()): number {
  const db = database();
  return db.transaction(() => {
    const row = db.prepare("SELECT * FROM account_payment_v1 WHERE stripe_id = ?").get(stripeId) as PaymentRow | undefined;
    if (!row || totalRefundedCents <= row.refunded_cents || row.amount_cents <= 0) return 0;
    const counted = Math.max(0, Math.min(row.amount_cents, totalRefundedCents - row.free_refund_cents));
    const takeTotal = Math.min(row.credits, Math.ceil((row.credits * counted) / row.amount_cents));
    const take = Math.max(0, takeTotal - row.taken_credits);
    db.prepare("UPDATE account_payment_v1 SET refunded_cents = ?, taken_credits = ? WHERE stripe_id = ?").run(totalRefundedCents, Math.max(row.taken_credits, takeTotal), stripeId);
    if (take > 0) {
      const source = row.kind === "pack" ? "topup" : "plan";
      db.prepare("INSERT OR IGNORE INTO account_credit_use_v1 (owner_id, job_id, used_at, credits, kind, source) VALUES (?, ?, ?, ?, 'refund', ?)")
        .run(row.owner_id, `refund:${stripeId}:${totalRefundedCents}`, now, take, source);
      if (source === "topup") db.prepare("UPDATE account_plan_v1 SET top_up_credits = MAX(0, top_up_credits - ?), updated_at = ? WHERE owner_id = ?").run(take, now, row.owner_id);
    }
    return take;
  }).immediate();
}

/** A disputed payment pauses the AI; a won or closed dispute lets it run again. Returns true when it changed. */
export function setDisputed(ownerId: string, disputed: boolean, now = Date.now()) {
  const row = readPlanRow(ownerId, now);
  if (Boolean(row.disputed) === disputed) return false;
  database().prepare("UPDATE account_plan_v1 SET disputed = ?, updated_at = ? WHERE owner_id = ?").run(disputed ? 1 : 0, now, ownerId);
  return true;
}

/** One plain sentence about a payment, shown on the Plans screen for 14 days ("We refunded your second payment"). */
export function setBillingNotice(ownerId: string, notice: string, now = Date.now()) {
  readPlanRow(ownerId, now);
  database().prepare("UPDATE account_plan_v1 SET billing_notice = ?, billing_notice_at = ?, updated_at = ? WHERE owner_id = ?").run(notice, now, now, ownerId);
}

export type BillingFacts = { lastPayment: { cents: number; at: number; kind: "plan" | "pack" } | null; nextPaymentAt: number | null; notice: string | null };

/** What the Plans screen shows from Stripe's own facts: the last payment, the next one, and any notice. */
export function readBillingFacts(ownerId: string, now = Date.now()): BillingFacts {
  const row = readPlanRow(ownerId, now);
  const last = listPayments(ownerId, 1)[0] ?? null;
  // (while a bill is unpaid, "next payment" would be wrong: the unpaid one comes first, and the screen says so)
  const renews = row.plan !== "trial" && !row.cancel_at_period_end && !row.plan_ended && row.billing_status === "active" && Boolean(row.stripe_subscription_id);
  return {
    lastPayment: last ? { cents: Math.max(0, last.amountCents - last.refundedCents), at: last.paidAt, kind: last.kind } : null,
    nextPaymentAt: renews ? row.period_ends_at : null,
    notice: row.billing_notice && row.billing_notice_at && now - row.billing_notice_at < 14 * DAY_MS ? row.billing_notice : null,
  };
}

export type AiCreditGate = {
  assertAvailable(ownerId: string, reservedCredits: number, cost?: number, options?: { exceptPicture?: string | null; exceptProject?: string | null }): void;
  spend(ownerId: string, jobId: string, credits?: number, kind?: AiActionKind): void;
  /** (dad, Nov 26) real AI money that is not charged (see noteUnchargedAiCost). */
  noteCost?(ownerId: string, jobId: string, credits: number, why: UnchargedWhy): void;
  /** (dad, Nov 26) Animate: the project's free planning is covered by the card's price. */
  settlePlanning?(ownerId: string, projectId: string): void;
};

export const accountAiCreditGate: AiCreditGate = {
  assertAvailable: (ownerId, reserved, cost, options) => assertAiCreditAvailable(ownerId, reserved, cost, Date.now(), options),
  spend: spendAiCredit,
  noteCost: (ownerId, jobId, credits, why) => noteUnchargedAiCost(ownerId, jobId, credits, why),
  settlePlanning,
};

// ---------- Development-only test switch (the /dev/plan page and the AI Dashboard's test controls). ----------
// Nothing here is charged and nothing calls the AI or Stripe: it only changes this account's local plan record.

/** "Pretend AI use": records a FAKE usage entry (job id "test:…") so the dashboard's usage rows can be previewed. No AI runs. */
export const TEST_SPEND_ACTIONS = ["spend_chat", "spend_assistant", "spend_simple", "spend_big"] as const;
export type TestSpendAction = (typeof TEST_SPEND_ACTIONS)[number];
const TEST_SPEND: Record<TestSpendAction, { kind: AiActionKind; credits: number }> = {
  spend_chat: { kind: "chat", credits: AI_ACTION_CREDITS.chat }, spend_assistant: { kind: "assistant", credits: AI_ACTION_CREDITS.assistant },
  spend_simple: { kind: "animation", credits: SHORT_ANIMATION_CREDITS }, spend_big: { kind: "animation", credits: 507 },
};
export const isTestSpendAction = (value: unknown): value is TestSpendAction => (TEST_SPEND_ACTIONS as readonly unknown[]).includes(value);

/** "Pretend buy": adds a pack like a finished purchase, with the same members-only rule. No Stripe. */
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
  // Real money: the test buttons can never give a plan, credits or a pack for free (Nov 21, "100% NOT test mode").
  if (moneyMode() === "live") throw Object.assign(new Error("The test buttons are off while real money is on."), { status: 404 });
  // A test state (payment failed, waiting for refill…) must not be undone a minute later by the Stripe check:
  // pause that check for this account for an hour after any test button.
  readPlanRow(ownerId, now);
  database().prepare("UPDATE account_plan_v1 SET billing_synced_at = ? WHERE owner_id = ?").run(now + 60 * 60 * 1000, ownerId);
  return applyTestPlanActionNow(ownerId, action, now);
}

function applyTestPlanActionNow(ownerId: string, action: TestPlanAction, now: number) {
  const db = database();
  const record = readAccountPlanRecord(ownerId, now);
  const update = (sql: string, ...values: unknown[]) => db.prepare(`UPDATE account_plan_v1 SET ${sql}, updated_at = ? WHERE owner_id = ?`).run(...values, now, ownerId);
  const set = (plan: AccountPlanId, trialStartedAt: number | null) =>
    update("plan = ?, trial_started_at = ?, period_started_at = ?, test_used_extra = 0, plan_ended = 0, billing_status = ?, past_due_since = NULL, cancel_at_period_end = 0, paid_plan = ?, paid_from = 0, paid_until = ?, disputed = 0",
      plan, trialStartedAt ?? record.trialStartedAt, plan === "trial" ? record.periodStartedAt : now, plan === "trial" ? "none" : "active",
      plan === "trial" ? null : plan, plan === "trial" ? null : TEST_PAID_UNTIL);
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
    const spend = TEST_SPEND[action];
    assertAiCreditAvailable(ownerId, 0, spend.credits);
    return spendAiCredit(ownerId, `test:${Date.now()}`, spend.credits, spend.kind, now);
  }
  if (isTestBuyAction(action)) {
    const current = status();
    const pack = topUpPacksFor(current.plan)[TEST_BUY_ACTIONS.indexOf(action)];
    if (!pack || current.plan === "trial" || current.locked) throw creditError("Extra packs are for members — choose a plan first.", "members_only");
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
      // A pretend refill also forgets this cycle's pretend AI use, so "Used this month" matches the meter.
      db.prepare("DELETE FROM account_credit_use_v1 WHERE owner_id = ? AND job_id LIKE 'test:%'").run(ownerId);
      return update("test_used_extra = ?", -realUsed());
    }
    case "wait_for_refill": {
      // A paid plan with every credit used and the refill 3 days away (the trial has no refill: switch to Basic).
      const plan = record.plan === "trial" ? "starter" : record.plan;
      const periodStart = addCycles(now + 3 * DAY_MS, -1);
      update("plan = ?, period_started_at = ?, billing_status = 'active', plan_ended = 0, top_up_credits = 0, test_used_extra = 0, paid_plan = ?, paid_from = 0, paid_until = ?",
        plan, periodStart, plan, TEST_PAID_UNTIL);
      return update("test_used_extra = ?", ACCOUNT_PLANS[plan].credits - realUsed());
    }
    case "refill_now": {
      // A pretend refill that starts a new cycle right now (this cycle's use stays in the last one, so the chart drops).
      if (record.plan === "trial") return update("plan = plan");
      return update("period_started_at = ?, test_used_extra = 0, billing_status = 'active', plan_ended = 0", now);
    }
    case "refill_tomorrow": {
      const plan = record.plan === "trial" ? "starter" : record.plan;
      return update("plan = ?, period_started_at = ?, billing_status = 'active', plan_ended = 0, paid_plan = ?, paid_from = 0, paid_until = ?",
        plan, addCycles(now + DAY_MS, -1), plan, TEST_PAID_UNTIL);
    }
    case "payment_failed": case "payment_failed_locked": {
      // The renewal didn't go through: this cycle isn't paid, so its plan credits wait (packs still work).
      const { start } = creditWindow(record, now);
      return update("billing_status = 'past_due', past_due_since = ?, paid_until = ?", now, start);
    }
    case "payment_fixed": return update("billing_status = 'active', past_due_since = NULL, paid_from = 0, paid_until = ?", TEST_PAID_UNTIL);
    case "plan_ended": return update("plan = 'trial', plan_ended = 1, billing_status = 'canceled', past_due_since = NULL, cancel_at_period_end = 0");
    case "clear_extra": return update("top_up_credits = 0");
    default: return set(action, null);
  }
}

/** Delete my account: forget this account's plan, credit history and payment records (after Stripe was closed). */
export function deleteAccountPlan(ownerId: string) {
  const db = database();
  db.transaction(() => {
    db.prepare("DELETE FROM account_credit_use_v1 WHERE owner_id = ?").run(ownerId);
    db.prepare("DELETE FROM account_ai_cost_v1 WHERE owner_id = ?").run(ownerId);
    db.prepare("DELETE FROM account_billing_event_v1 WHERE owner_id = ?").run(ownerId);
    db.prepare("DELETE FROM account_payment_v1 WHERE owner_id = ?").run(ownerId);
    db.prepare("DELETE FROM account_plan_v1 WHERE owner_id = ?").run(ownerId);
  })();
}

/** The interval the plan screens default to. */
export const DEFAULT_INTERVAL: BillingInterval = PLAN_CYCLE;
