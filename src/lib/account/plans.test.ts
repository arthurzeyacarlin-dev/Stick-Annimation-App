// SPEC-0020 Phase 9 (Pricing v1, D-0193): the rules for credits, plans and the 14-day trial.
// Run: node --test src/lib/account/plans.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_PLANS, accountPlanStatus, AI_ACTION_CREDITS, approxAnimations, checkAiCredit, creditWindow, DAY_MS, type AccountPlanRecord } from "./plans.ts";

const start = Date.UTC(2026, 9, 11, 12);
const trial = (overrides: Partial<AccountPlanRecord> = {}): AccountPlanRecord =>
  ({ plan: "trial", trialStartedAt: start, periodStartedAt: start, testUsedExtra: 0, ...overrides });

test("the approved prices: chat/edit 2, simple 25, big 90; plans 180 / 420 / 750; trial 75", () => {
  assert.deepEqual(AI_ACTION_CREDITS, { chat: 2, edit: 2, simple: 25, big: 90 });
  assert.equal(accountPlanStatus(trial(), 0, start).creditsTotal, 75);
  assert.equal(accountPlanStatus(trial({ plan: "starter" }), 0, start).creditsTotal, 180);
  assert.equal(accountPlanStatus(trial({ plan: "creator" }), 0, start).creditsTotal, 420);
  assert.equal(accountPlanStatus(trial({ plan: "studio" }), 0, start).creditsTotal, 750);
  assert.equal(approxAnimations(420), 16);
});

test("a new trial has 75 credits and 14 days", () => {
  const status = accountPlanStatus(trial(), 0, start);
  assert.equal(status.creditsLeft, 75);
  assert.equal(status.trialDaysLeft, 14);
  assert.equal(status.locked, false);
  assert.deepEqual(checkAiCredit(status), { ok: true });
});

test("an action needs its whole cost; running actions reserve theirs", () => {
  const status = accountPlanStatus(trial(), 50, start);
  assert.equal(status.creditsLeft, 25);
  assert.equal(checkAiCredit(status, 0, AI_ACTION_CREDITS.simple).ok, true);
  assert.equal(checkAiCredit(status, 2, AI_ACTION_CREDITS.simple).ok, false);
  const big = checkAiCredit(status, 0, AI_ACTION_CREDITS.big);
  assert.equal(!big.ok && big.code, "no_credits");
  assert.match(!big.ok ? big.message : "", /needs 90 credits/);
});

test("extra (top-up) credits add to what's left", () => {
  const status = accountPlanStatus(trial({ plan: "creator", topUpCredits: 200 }), 420, start);
  assert.equal(status.planCreditsLeft, 0);
  assert.equal(status.creditsLeft, 200);
  assert.equal(checkAiCredit(status, 0, AI_ACTION_CREDITS.big).ok, true);
});

test("the trial locks creating after 14 days, even with credits left", () => {
  const status = accountPlanStatus(trial(), 3, start + 14 * DAY_MS);
  assert.equal(status.locked, true);
  assert.equal(status.lockReason, "trial_ended");
  const check = checkAiCredit(status);
  assert.equal(!check.ok && check.code, "trial_ended");
});

test("an ended plan locks like an ended trial", () => {
  const status = accountPlanStatus(trial({ planEnded: true }), 0, start);
  assert.equal(status.lockReason, "plan_ended");
  assert.equal(checkAiCredit(status).ok, false);
});

test("a failed payment warns first, then waits after 3 days", () => {
  const warned = accountPlanStatus(trial({ plan: "starter", billingStatus: "past_due", pastDueSince: start }), 0, start + DAY_MS);
  assert.equal(warned.paymentProblem, true);
  assert.equal(warned.aiLocked, false);
  assert.equal(checkAiCredit(warned).ok, true);
  const locked = accountPlanStatus(trial({ plan: "starter", billingStatus: "past_due", pastDueSince: start }), 0, start + 3 * DAY_MS);
  assert.equal(locked.aiLocked, true);
  const check = checkAiCredit(locked);
  assert.equal(!check.ok && check.code, "payment_problem");
});

test("paid plans refill on the same date every month (like Stripe's monthly charge)", () => {
  const creator = trial({ plan: "creator", periodStartedAt: start });
  const nov11 = Date.UTC(2026, 10, 11, 12), dec11 = Date.UTC(2026, 11, 11, 12);
  assert.deepEqual(creditWindow(creator, start + DAY_MS), { start, end: nov11 }, "Oct 11 → Nov 11");
  assert.deepEqual(creditWindow(creator, nov11 + 1000), { start: nov11, end: dec11 });
  const jan31 = Date.UTC(2027, 0, 31, 12);
  assert.equal(creditWindow(trial({ plan: "creator", periodStartedAt: jan31 }), jan31 + DAY_MS).end, Date.UTC(2027, 1, 28, 12), "Jan 31 → Feb 28");
  assert.equal(creditWindow(trial({ plan: "creator", periodStartedAt: jan31 }), Date.UTC(2027, 2, 1)).end, Date.UTC(2027, 2, 31, 12), "then Mar 31");
  const status = accountPlanStatus(creator, 420, start + 5 * DAY_MS);
  const check = checkAiCredit(status);
  assert.equal(!check.ok && check.code, "no_credits");
  assert.match(!check.ok ? check.message : "", /refill on November 11/);
  assert.equal(status.locked, false, "a paid plan is never locked, it only waits for the refill");
});

test("low credits shows when 10% or less is left", () => {
  assert.equal(accountPlanStatus(trial(), 68, start).low, true);
  assert.equal(accountPlanStatus(trial(), 66, start).low, false);
  assert.equal(accountPlanStatus(trial(), 75, start).low, false);
});

test("the test-only buttons: used-up and extra credits", () => {
  assert.equal(accountPlanStatus(trial({ testUsedExtra: 75 }), 0, start).creditsLeft, 0);
  const plus = accountPlanStatus(trial({ testUsedExtra: -25 }), 0, start);
  assert.equal(plus.creditsLeft, 100);
  assert.equal(plus.creditsUsed, 0);
});

test("the credits bar fades blue → green → yellow → amber at 75% used → red at 90% used", async () => {
  const { creditMeterColor, colorForPercent } = await import("../ai-dashboard/dashboardAggregation.ts");
  assert.equal(creditMeterColor(0), "#2563eb");
  assert.equal(creditMeterColor(45), "#22c55e");
  assert.equal(creditMeterColor(75), "#f59e0b");
  assert.equal(creditMeterColor(90), "#ff0000");
  assert.equal(creditMeterColor(100), "#ff0000");
  assert.notEqual(creditMeterColor(82), creditMeterColor(75), "between amber and red it blends smoothly");
  assert.equal(colorForPercent(0), "#2563eb", "the chart's colors stay the same");
  assert.equal(colorForPercent(100), "#ff0000");
});

test("each plan has its own 3 packs (biggest = half the plan) and every pack keeps ≥50% profit after Stripe's fee", async () => {
  const { topUpPacksFor, TOP_UP_PACKS } = await import("./plans.ts");
  assert.deepEqual(topUpPacksFor("trial"), []);
  for (const plan of ["starter", "creator", "studio"] as const) {
    const packs = topUpPacksFor(plan);
    assert.equal(packs.length, 3);
    assert.equal(packs[2].credits, ACCOUNT_PLANS[plan].credits / 2);
  }
  for (const pack of TOP_UP_PACKS) {
    const profit = (pack.usd * 0.971 - 0.30 - pack.credits * 0.01) / pack.usd;
    assert.ok(profit >= 0.5, `${pack.id} keeps ${(profit * 100).toFixed(0)}%`);
  }
});
