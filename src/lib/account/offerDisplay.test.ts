// SPEC-0031: the beta prices people see, and the trial cards. Run: node --test src/lib/account/offerDisplay.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { afterFirstPayment, offerFromCodes, offerPrice } from "./offerDisplay.ts";
import { pickOffer } from "./stripeBillingRules.ts";
import { DAY_MS } from "./plans.ts";
import { dueTrialNudge, trialNudgeStagesNow } from "./trialNudges.ts";

test("first-50 price: 25% off, matching the payment service's whole-cent rounding", () => {
  assert.equal(offerPrice("starter", "month", "first50")?.firstCents, 749);
  assert.equal(offerPrice("creator", "month", "first50")?.firstCents, 1874);
  assert.equal(offerPrice("studio", "month", "first50")?.firstCents, 3749);
  assert.equal(offerPrice("starter", "year", "first50")?.firstCents, 7425);
  assert.equal(offerPrice("starter", "month", "first50")?.then, "For your first 12 months, then $9.99 a month.");
  assert.equal(offerPrice("starter", "year", "first50")?.then, "For your first year, then $99 a year.");
});

test("YouTube = 10% off the first month only; both = 30% first month (25% at checkout + 5% back)", () => {
  assert.equal(offerPrice("starter", "month", "youtube")?.firstCents, 899);
  assert.equal(offerPrice("starter", "year", "youtube"), null);
  const both = offerPrice("starter", "month", "both")!;
  assert.deepEqual([both.checkoutCents, both.bonusBackCents, both.firstCents], [749, 50, 699]);
  assert.equal(offerPrice("starter", "month", null), null);
});

test("the shown offer follows the same rules as the payment (pickOffer)", () => {
  const codes = { first50: "FIRSTDIAMOND", youtube: "DIAMOND10" };
  for (const interval of ["month", "year"] as const) {
    for (const has of [{}, { first50: true }, { youtube: true }, { first50: true, youtube: true }]) {
      const picked = pickOffer({ first50: has.first50 ? "firstdiamond" : "", youtube: has.youtube ? "diamond10" : "" }, codes, interval, { trialRunning: true });
      const shown = offerFromCodes(has, interval);
      assert.equal(picked.ok ? picked.offer : null, shown, JSON.stringify({ interval, has }));
    }
  }
});

test("after the first payment", () => {
  const now = Date.UTC(2026, 10, 26, 12);
  assert.equal(afterFirstPayment("starter", "month", "first50", now), "$7.49 a month until Nov 26, 2027, then $9.99 a month.");
  assert.equal(afterFirstPayment("starter", "month", null, now), "$9.99 every month, next on Dec 26, 2026.");
  assert.equal(afterFirstPayment("starter", "year", "first50", now), "$99 every year, next on Nov 26, 2027.");
});

test("trial cards: the right stage, the most urgent one only, never twice", () => {
  const now = Date.UTC(2026, 11, 1);
  const trial = (daysLeft: number, creditsLeft: number) => ({ plan: "trial" as const, locked: false, creditsLeft, windowEnd: now + daysLeft * DAY_MS });
  assert.deepEqual(trialNudgeStagesNow(trial(10, 150), now), []);
  assert.deepEqual(trialNudgeStagesNow(trial(3, 150), now), ["days3"]);
  assert.deepEqual(trialNudgeStagesNow(trial(0.5, 150), now), ["lastDay", "days3"]);
  assert.deepEqual(trialNudgeStagesNow(trial(10, 16), now), ["creditsLow"]);
  assert.deepEqual(trialNudgeStagesNow(trial(10, 0), now), ["creditsOut"]);
  assert.deepEqual(trialNudgeStagesNow({ ...trial(1, 0), plan: "starter" as never }, now), []);
  assert.deepEqual(trialNudgeStagesNow({ ...trial(-1, 50), locked: true }, now), []);
  assert.deepEqual(dueTrialNudge(trial(0.5, 0), [], now), { show: "creditsOut", markSeen: ["creditsOut", "lastDay", "days3"] });
  assert.equal(dueTrialNudge(trial(0.5, 0), ["creditsOut", "lastDay", "days3"], now), null);
  assert.deepEqual(dueTrialNudge(trial(2, 100), ["days3"], now), null);
});
