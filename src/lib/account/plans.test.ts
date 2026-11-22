// The rules for credits, plans, the 14-day trial and "credits only once this cycle is paid" (Nov 20, the money system).
// Run: node --test src/lib/account/plans.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCOUNT_PLANS, accountPlanStatus, AI_ACTION_CREDITS, approxAnimations, checkAiCredit, checkDailyLimit, creditWindow, DAY_MS, isCyclePaid,
  newAnimationCredits, SHORT_ANIMATION_CREDITS, TOP_UP_PACKS, topUpPacksFor, type AccountPlanRecord,
} from "./plans.ts";

const start = Date.UTC(2026, 10, 9, 12);
const nextMonth = Date.UTC(2026, 11, 9, 12);
const trial = (overrides: Partial<AccountPlanRecord> = {}): AccountPlanRecord =>
  ({ plan: "trial", trialStartedAt: start, periodStartedAt: start, testUsedExtra: 0, ...overrides });
/** A paid plan whose current month (start → next month) is paid. */
const paid = (plan: "starter" | "creator" | "studio", overrides: Partial<AccountPlanRecord> = {}): AccountPlanRecord =>
  trial({ plan, billingStatus: "active", paidPlan: plan, paidFrom: start, paidUntil: nextMonth, ...overrides });

test("dad's prices (website, Nov 20): trial 150; Basic 470 / Pro 1,200 / Creator 2,400; chat 15; Help 1; voice typing 1; drawing AI 1", () => {
  assert.equal(accountPlanStatus(trial(), 0, start).creditsTotal, 150);
  assert.equal(accountPlanStatus(paid("starter"), 0, start).creditsTotal, 470);
  assert.equal(accountPlanStatus(paid("creator"), 0, start).creditsTotal, 1200);
  assert.equal(accountPlanStatus(paid("studio"), 0, start).creditsTotal, 2400);
  assert.deepEqual([ACCOUNT_PLANS.starter.monthlyUsd, ACCOUNT_PLANS.creator.monthlyUsd, ACCOUNT_PLANS.studio.monthlyUsd], [9.99, 24.99, 49.99]);
  assert.deepEqual([ACCOUNT_PLANS.starter.yearlyUsd, ACCOUNT_PLANS.creator.yearlyUsd, ACCOUNT_PLANS.studio.yearlyUsd], [99, 249, 499]);
  assert.deepEqual(AI_ACTION_CREDITS, { chat: 15, assistant: 1, dictation: 1, drawing: 1 });
});

test("a new animation costs 4 a second plus the 3-second scene and one chat turn: 10 s = 67 (the website's number)", () => {
  assert.equal(newAnimationCredits(10), 67);
  assert.equal(newAnimationCredits(120), 507);
  assert.equal(SHORT_ANIMATION_CREDITS, 67);
  assert.deepEqual([approxAnimations(470), approxAnimations(1200), approxAnimations(2400)], [7, 18, 36], "the website's 'about N short animations'");
});

test("a new trial has 150 credits and 14 days", () => {
  const status = accountPlanStatus(trial(), 0, start);
  assert.equal(status.creditsLeft, 150);
  assert.equal(status.trialDaysLeft, 14);
  assert.equal(status.locked, false);
  assert.equal(status.waitingForPayment, false);
  assert.deepEqual(checkAiCredit(status), { ok: true });
});

test("an action needs its whole price; credits held by running runs count as used; never 'pay what's left'", () => {
  const status = accountPlanStatus(trial(), 83, start);
  assert.equal(status.creditsLeft, 67);
  assert.equal(checkAiCredit(status, 0, 67).ok, true);
  assert.equal(checkAiCredit(status, 1, 67).ok, false, "1 credit held elsewhere = this 67 can't start");
  const short = checkAiCredit(status, 0, 507);
  assert.equal(!short.ok && short.code, "no_credits");
  assert.match(!short.ok ? short.message : "", /costs 507 credits and your free trial has 67 credits left/);
});

test("pack credits add to what's left and are spent after the plan's", () => {
  const status = accountPlanStatus(paid("creator", { topUpCredits: 250 }), 1200, start);
  assert.equal(status.planCreditsLeft, 0);
  assert.equal(status.creditsLeft, 250);
  assert.equal(checkAiCredit(status, 0, 67).ok, true);
});

test("the trial locks creating after 14 days, even with credits left; an ended plan locks the same way", () => {
  const ended = accountPlanStatus(trial(), 3, start + 14 * DAY_MS);
  assert.equal(ended.lockReason, "trial_ended");
  assert.equal(!checkAiCredit(ended).ok && (checkAiCredit(ended) as { code: string }).code, "trial_ended");
  const planEnded = accountPlanStatus(paid("starter", { planEnded: true }), 0, start);
  assert.equal(planEnded.lockReason, "plan_ended");
  assert.equal(checkAiCredit(planEnded).ok, false);
});

test("CREDITS ONLY ONCE THE CYCLE IS PAID: a renewal that hasn't gone through gives no new plan credits (packs still work)", () => {
  // Paid for Nov 9 → Dec 9. On Dec 10 the renewal hasn't gone through: the new month's 470 are not there yet.
  const dec10 = nextMonth + DAY_MS;
  const waiting = accountPlanStatus(paid("starter", { billingStatus: "past_due", pastDueSince: nextMonth, topUpCredits: 100 }), 0, dec10);
  assert.equal(waiting.waitingForPayment, true);
  assert.equal(waiting.creditsTotal, 0);
  assert.equal(waiting.creditsLeft, 100, "pack credits were paid already, so they keep working");
  assert.equal(checkAiCredit(waiting, 0, 67).ok, true, "a 67-credit action runs on the pack");
  const big = checkAiCredit(waiting, 0, 507);
  assert.equal(!big.ok && big.code, "waiting_for_payment");
  assert.match(!big.ok ? big.message : "", /didn't go through.*Update your card/);
  // Stripe says the renewal is paid (paid until Jan 9): the 470 arrive.
  const fixed = accountPlanStatus(paid("starter", { paidFrom: nextMonth, paidUntil: Date.UTC(2027, 0, 9, 12) }), 0, dec10);
  assert.equal(fixed.creditsTotal, 470);
  assert.equal(fixed.waitingForPayment, false);
  assert.equal(isCyclePaid(paid("starter"), nextMonth), false, "a paid month never pays for the next one");
});

test("an upgrade's bigger credits come only when its charge is paid (the paid plan, not the asked one, decides)", () => {
  const asked = accountPlanStatus(paid("creator", { paidPlan: "starter" }), 100, start + DAY_MS);
  assert.equal(asked.creditsTotal, 470, "the Pro charge isn't paid yet: still Basic's credits");
  assert.equal(accountPlanStatus(paid("creator"), 100, start + DAY_MS).creditsTotal, 1200);
});

test("a yearly plan refills every month inside its paid year", () => {
  const yearly = paid("creator", { interval: "year", paidUntil: Date.UTC(2027, 10, 9, 12) });
  const march = Date.UTC(2027, 2, 15);
  assert.deepEqual(creditWindow(yearly, march), { start: Date.UTC(2027, 2, 9, 12), end: Date.UTC(2027, 3, 9, 12) });
  assert.equal(accountPlanStatus(yearly, 0, march).creditsTotal, 1200);
});

test("paid plans refill on the same date every month (like Stripe), Jan 31 → Feb 28 → Mar 31", () => {
  assert.deepEqual(creditWindow(paid("creator"), start + DAY_MS), { start, end: nextMonth });
  const jan31 = Date.UTC(2027, 0, 31, 12);
  assert.equal(creditWindow(trial({ plan: "creator", periodStartedAt: jan31 }), jan31 + DAY_MS).end, Date.UTC(2027, 1, 28, 12));
  assert.equal(creditWindow(trial({ plan: "creator", periodStartedAt: jan31 }), Date.UTC(2027, 2, 1)).end, Date.UTC(2027, 2, 31, 12));
  const used = accountPlanStatus(paid("creator"), 1200, start + 5 * DAY_MS);
  const check = checkAiCredit(used);
  assert.equal(!check.ok && check.code, "no_credits");
  assert.match(!check.ok ? check.message : "", /refill on December 9/);
});

test("a disputed payment pauses the AI", () => {
  const status = accountPlanStatus(paid("starter", { disputed: true }), 0, start);
  assert.equal(status.aiLocked, true);
  const check = checkAiCredit(status);
  assert.equal(!check.ok && check.code, "payment_hold");
});

test("the daily limit: at most 1,500 credits in 24 hours", () => {
  assert.equal(checkDailyLimit(1400, 100).ok, true);
  const over = checkDailyLimit(1400, 101);
  assert.equal(!over.ok && over.code, "daily_limit");
  assert.match(!over.ok ? over.message : "", /today's limit of 1,500 credits/);
});

test("low credits shows when 10% or less is left", () => {
  assert.equal(accountPlanStatus(trial(), 135, start).low, true);
  assert.equal(accountPlanStatus(trial(), 134, start).low, false);
  assert.equal(accountPlanStatus(trial(), 150, start).low, false);
});

test("the test-only buttons: used-up and extra credits", () => {
  assert.equal(accountPlanStatus(trial({ testUsedExtra: 150 }), 0, start).creditsLeft, 0);
  const plus = accountPlanStatus(trial({ testUsedExtra: -25 }), 0, start);
  assert.equal(plus.creditsLeft, 175);
  assert.equal(plus.creditsUsed, 0);
});

test("the credits bar fades blue → green → yellow → orange → pure red only at 0 credits left", async () => {
  const { creditMeterColor, colorForPercent } = await import("../ai-dashboard/dashboardAggregation.ts");
  assert.equal(creditMeterColor(0), "#0066ff");
  assert.equal(creditMeterColor(100), "#ff0000");
  assert.equal(colorForPercent(0), "#2563eb");
});

test("the same 3 packs on every paid plan (none on the trial), each about half profit after Stripe's fee", () => {
  assert.deepEqual(topUpPacksFor("trial"), []);
  for (const plan of ["starter", "creator", "studio"] as const) assert.deepEqual(topUpPacksFor(plan).map((pack) => pack.credits), [250, 500, 1000]);
  for (const pack of TOP_UP_PACKS) {
    const profit = (pack.usd * 0.971 - 0.30 - pack.credits * 0.01) / pack.usd;
    assert.ok(profit >= 0.45, `${pack.id} keeps ${(profit * 100).toFixed(0)}%`);
  }
  for (const plan of ["starter", "creator", "studio"] as const) {
    const usd = ACCOUNT_PLANS[plan].monthlyUsd;
    const profit = (usd * 0.971 - 0.30 - ACCOUNT_PLANS[plan].credits * 0.01) / usd;
    assert.ok(profit >= 0.45, `${plan} keeps ${(profit * 100).toFixed(0)}% even if every credit is used`);
  }
});
