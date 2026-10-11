// SPEC-0020 Phase 2: the rules for credits, plans and the 14-day trial.
// Run: node --test src/lib/account/plans.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountPlanStatus, checkAiCredit, creditWindow, DAY_MS, type AccountPlanRecord } from "./plans.ts";

const start = Date.UTC(2026, 9, 11, 12);
const trial = (overrides: Partial<AccountPlanRecord> = {}): AccountPlanRecord =>
  ({ plan: "trial", trialStartedAt: start, periodStartedAt: start, testUsedExtra: 0, ...overrides });

test("a new trial has 150 credits and 14 days", () => {
  const status = accountPlanStatus(trial(), 0, start);
  assert.equal(status.creditsTotal, 150);
  assert.equal(status.creditsLeft, 150);
  assert.equal(status.trialDaysLeft, 14);
  assert.equal(status.locked, false);
  assert.deepEqual(checkAiCredit(status), { ok: true });
});

test("each answered message uses one credit", () => {
  const status = accountPlanStatus(trial(), 40, start + DAY_MS);
  assert.equal(status.creditsUsed, 40);
  assert.equal(status.creditsLeft, 110);
  assert.equal(status.trialDaysLeft, 13);
});

test("the trial locks the app after 14 days, even with credits left", () => {
  const status = accountPlanStatus(trial(), 3, start + 14 * DAY_MS);
  assert.equal(status.locked, true);
  const check = checkAiCredit(status);
  assert.equal(check.ok, false);
  assert.equal(!check.ok && check.code, "trial_ended");
});

test("at 0 credits the AI stops, and running messages count as reserved", () => {
  assert.equal(checkAiCredit(accountPlanStatus(trial(), 150, start)).ok, false);
  assert.equal(checkAiCredit(accountPlanStatus(trial(), 149, start), 1).ok, false);
  assert.equal(checkAiCredit(accountPlanStatus(trial(), 148, start), 1).ok, true);
  assert.equal(accountPlanStatus(trial(), 400, start).creditsLeft, 0);
});

test("paid plans refill every 30 days from when they started", () => {
  const creator = trial({ plan: "creator", periodStartedAt: start });
  assert.equal(accountPlanStatus(creator, 0, start).creditsTotal, 1200);
  const later = start + 31 * DAY_MS;
  assert.deepEqual(creditWindow(creator, later), { start: start + 30 * DAY_MS, end: start + 60 * DAY_MS });
  const status = accountPlanStatus(creator, 1200, start + 5 * DAY_MS);
  const check = checkAiCredit(status);
  assert.equal(!check.ok && check.code, "no_credits");
  assert.match(!check.ok ? check.message : "", /refill on November 10/);
  assert.equal(status.locked, false, "a paid plan is never locked, it only waits for the refill");
});

test("low credits shows when 10% or less is left", () => {
  assert.equal(accountPlanStatus(trial(), 135, start).low, true);
  assert.equal(accountPlanStatus(trial(), 134, start).low, false);
  assert.equal(accountPlanStatus(trial(), 150, start).low, false);
});

test("the test-only 'use up my credits' counts as used", () => {
  assert.equal(accountPlanStatus(trial({ testUsedExtra: 150 }), 0, start).creditsLeft, 0);
});
