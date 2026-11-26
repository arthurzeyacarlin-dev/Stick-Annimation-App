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

test("dad's prices (website, Nov 20; trial 300 since dad, Nov 26): Basic 470 / Pro 1,200 / Creator 2,400; chat 15; Help 1; voice typing 1; drawing AI 1", () => {
  assert.equal(accountPlanStatus(trial(), 0, start).creditsTotal, 300);
  assert.equal(accountPlanStatus(paid("starter"), 0, start).creditsTotal, 470);
  assert.equal(accountPlanStatus(paid("creator"), 0, start).creditsTotal, 1200);
  assert.equal(accountPlanStatus(paid("studio"), 0, start).creditsTotal, 2400);
  assert.deepEqual([ACCOUNT_PLANS.starter.monthlyUsd, ACCOUNT_PLANS.creator.monthlyUsd, ACCOUNT_PLANS.studio.monthlyUsd], [9.99, 24.99, 49.99]);
  assert.deepEqual([ACCOUNT_PLANS.starter.yearlyUsd, ACCOUNT_PLANS.creator.yearlyUsd, ACCOUNT_PLANS.studio.yearlyUsd], [99, 249, 499]);
  assert.deepEqual(AI_ACTION_CREDITS, { chat: 15, assistant: 1, dictation: 1, drawing: 1 });
});

test("(Nov 26) a new animation's card: 4 a second + the 3-second scene + the 1-second ending (10 s = 56) + its planning (30: 4 free text changes) = 86", async () => {
  assert.equal(newAnimationCredits(10), 56);
  assert.equal(newAnimationCredits(120), 496);
  assert.equal(SHORT_ANIMATION_CREDITS, 86, "dad, Nov 26: planning is included in the price");
  // the SAME number as the AI Animator's own price function (one formula: the texts can never drift from the card again)
  const { priceOf } = await import("../ai/v1Animator/v1Price.ts");
  assert.equal(priceOf({ newSeconds: 10, chat: false }).credits, newAnimationCredits(10));
  assert.equal(priceOf({ newSeconds: 7.3, chat: false }).credits, newAnimationCredits(7.3));
  assert.equal(priceOf({ newSeconds: 10 }).credits, SHORT_ANIMATION_CREDITS, "the card (planning in) = the number every text says");
  // (Nov 26) honest: 86 a 10-second animation, planning included
  assert.deepEqual([approxAnimations(470), approxAnimations(1200), approxAnimations(2400)], [5, 14, 28]);
});

test("a new trial has 300 credits and 14 days (dad, Nov 26; was 150)", () => {
  const status = accountPlanStatus(trial(), 0, start);
  assert.equal(status.creditsLeft, 300);
  assert.equal(status.trialDaysLeft, 14);
  assert.equal(status.locked, false);
  assert.equal(status.waitingForPayment, false);
  assert.deepEqual(checkAiCredit(status), { ok: true });
});

test("an action needs its whole price; credits held by running runs count as used; never 'pay what's left'", () => {
  const status = accountPlanStatus(trial(), 233, start);
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
  assert.equal(accountPlanStatus(trial(), 270, start).low, true);
  assert.equal(accountPlanStatus(trial(), 269, start).low, false);
  assert.equal(accountPlanStatus(trial(), 300, start).low, false);
});

test("the test-only buttons: used-up and extra credits", () => {
  assert.equal(accountPlanStatus(trial({ testUsedExtra: 300 }), 0, start).creditsLeft, 0);
  const plus = accountPlanStatus(trial({ testUsedExtra: -25 }), 0, start);
  assert.equal(plus.creditsLeft, 325);
  assert.equal(plus.creditsUsed, 0);
});

test("the credits ring stays the one blue of the new look (D-0239), full or empty", async () => {
  const { creditMeterColor, colorForPercent } = await import("../ai-dashboard/dashboardAggregation.ts");
  assert.equal(creditMeterColor(0), "#0066ff");
  assert.equal(creditMeterColor(100), "#0066ff");
  assert.equal(colorForPercent(0), "#2563eb");
});

test("each plan has 3 packs that fit its size (Arthur, Nov 21; none on the trial), each about half profit after Stripe's fee", () => {
  assert.deepEqual(topUpPacksFor("trial"), []);
  assert.deepEqual(topUpPacksFor("starter").map((pack) => pack.credits), [100, 200, 400]);
  assert.deepEqual(topUpPacksFor("creator").map((pack) => pack.credits), [250, 500, 1000]);
  assert.deepEqual(topUpPacksFor("studio").map((pack) => pack.credits), [500, 1000, 2000]);
  for (const pack of TOP_UP_PACKS) assert.ok(pack.usd / pack.credits >= 0.0205 && pack.usd / pack.credits <= 0.0260, `${pack.id} keeps dad's price per credit`);
  assert.ok(topUpPacksFor("starter").every((pack) => pack.credits < ACCOUNT_PLANS.starter.credits), "no Basic pack is bigger than the Basic refill");
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

test("a chat answer costs what the AI really cost: 1 credit per started cent, never less than 1 (Arthur, Nov 21)", async () => {
  const { creditsForCostUsd } = await import("./plans.ts");
  assert.equal(creditsForCostUsd(0.0018), 1);
  assert.equal(creditsForCostUsd(0), 1);
  assert.equal(creditsForCostUsd(null), 1);
  assert.equal(creditsForCostUsd(0.01), 1);
  assert.equal(creditsForCostUsd(0.0101), 2);
  assert.equal(creditsForCostUsd(0.0296), 3);
});

test("the credits circle is full whenever you have at least your plan's credits (Arthur, Nov 21)", async () => {
  const { creditsLeftPercent } = await import("../ai-dashboard/creditMeter.ts");
  assert.equal(creditsLeftPercent(1367, 1200), 100);
  assert.equal(creditsLeftPercent(1200, 1200), 100);
  assert.equal(creditsLeftPercent(600, 1200), 50);
  assert.equal(creditsLeftPercent(0, 470), 0);
});

test("plans say exactly what the credits make: how many, how long each, credits each, total (Arthur, Nov 21)", async () => {
  const { planAnimationsText } = await import("./plans.ts");
  for (const id of ["trial", "starter", "creator", "studio"] as const) assert.equal(ACCOUNT_PLANS[id].about, planAnimationsText(ACCOUNT_PLANS[id].credits));
  assert.equal(planAnimationsText(470), "Enough for 5 animations, each 10 seconds long (86 credits each, planning included): 50 seconds of animation in total");
  for (const id of ["trial", "starter", "creator", "studio"] as const) assert.doesNotMatch(ACCOUNT_PLANS[id].about, /short animations|about \d+ animations/i);
});

test("one rule says AI Animator or Help Assistant, so the credits bar and the chart always agree (Arthur, Nov 21)", async () => {
  const { creditSourceOf } = await import("./plans.ts");
  for (const kind of ["animation", "addon", "edit", "look", "chat", "dictation", "drawing", "simple", "big"]) assert.equal(creditSourceOf(kind), "animator", kind);
  for (const kind of ["assistant", "assistant_voice"]) assert.equal(creditSourceOf(kind), "assistant", kind);
  for (const kind of ["test", "refund"]) assert.equal(creditSourceOf(kind), null, kind);
});

test("(Nov 25, Arthur) a trial that ENDED and then chose a plan, weeks later, is unlocked at once with the plan's full credits", () => {
  // the trial started Nov 9 and ended Nov 23; the plan is paid on Dec 20, long after
  const chosen = Date.UTC(2026, 11, 20, 12), until = Date.UTC(2027, 0, 20, 12);
  const before = accountPlanStatus(trial(), 150, chosen);
  assert.equal(before.locked, true);
  assert.equal(before.lockReason, "trial_ended");
  const after = accountPlanStatus(trial({ plan: "starter", billingStatus: "active", paidPlan: "starter", paidFrom: chosen, paidUntil: until, periodStartedAt: chosen }), 0, chosen);
  assert.equal(after.locked, false);
  assert.equal(after.lockReason, null);
  assert.equal(after.creditsLeft, 470);
  assert.deepEqual(checkAiCredit(after, 0, 67), { ok: true });
});

test("(dad + Arthur, Nov 26) the optional first picture's price comes from the real rates: a 3-second scene (reused by Animate) + a still of later things (extra)", async () => {
  const { gatePictureEstimate, PLANNING_CREDITS, FREE_PLAN_CHANGES } = await import("./plans.ts");
  assert.deepEqual(gatePictureEstimate("first", false), { credits: 12, reused: 12 }, "the scene only: all of it is the start of the animation");
  assert.deepEqual(gatePictureEstimate("first", true), { credits: 24, reused: 12 }, "+ the still of things that come in later");
  assert.deepEqual(gatePictureEstimate("new", true), { credits: 12, reused: 0 }, "an edit's new things: all extra");
  assert.deepEqual([PLANNING_CREDITS, FREE_PLAN_CHANGES], [30, 4]);
});
