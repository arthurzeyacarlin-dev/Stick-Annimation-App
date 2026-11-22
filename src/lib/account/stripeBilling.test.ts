// The pure rules behind Stripe billing. No network, no database.
// Run: node --test src/lib/account/stripeBilling.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  assertAllowedStripeKey, BillingError, billingModeForKey, deletionRefund, encodeStripeForm, estimateStripeFeeCents, idempotencyKey,
  isChargingSubscriptionStatus, isLiveSubscriptionStatus, isTestStripeKey, mapSubscriptionStatus, parsePlanLookupKey, pickOffer, planLookupKey,
  STRIPE_CATALOG, stripeFormPairs, subscriptionPeriodEndMs, subscriptionPeriodStartMs, subscriptionPlan, TEST_MODE_ONLY_MESSAGE, verifyStripeSignature,
} from "./stripeBillingRules.ts";

// Fake keys made of words only (never a real key).
const TEST_KEY = "sk_test_fake_for_unit_tests";
const RESTRICTED_TEST_KEY = "rk_test_fake_for_unit_tests";
const LIVE_SECRET = "sk_live_fake_for_unit_tests";
const LIVE_RESTRICTED = "rk_live_fake_for_unit_tests";

test("test keys run test mode; real money needs dad's RESTRICTED live key AND the switch; the all-powerful live key never runs", () => {
  assert.equal(isTestStripeKey(TEST_KEY), true);
  assert.equal(isTestStripeKey(RESTRICTED_TEST_KEY), true);
  assert.equal(billingModeForKey(TEST_KEY), "test");
  assert.equal(billingModeForKey(LIVE_RESTRICTED), "off", "no switch = off");
  assert.equal(billingModeForKey(LIVE_RESTRICTED, true), "live");
  assert.equal(billingModeForKey(LIVE_SECRET, true), "off", "sk_live is never used, even with the switch");
  assert.equal(billingModeForKey(undefined, true), "off");
  assert.equal(assertAllowedStripeKey(TEST_KEY), TEST_KEY);
  assert.equal(assertAllowedStripeKey(LIVE_RESTRICTED, true), LIVE_RESTRICTED);
  assert.throws(() => assertAllowedStripeKey(LIVE_RESTRICTED), (error: unknown) => error instanceof BillingError && error.message === TEST_MODE_ONLY_MESSAGE);
  assert.throws(() => assertAllowedStripeKey(LIVE_SECRET, true), BillingError);
  assert.throws(() => assertAllowedStripeKey(" sk_test_with_space"), BillingError);
  assert.throws(() => assertAllowedStripeKey(undefined), BillingError);
});

test("form encoding uses Stripe's bracket keys", () => {
  assert.deepEqual(stripeFormPairs({
    mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], metadata: { owner_id: "user 1", kind: "plan" },
    expand: ["subscription", "customer"], skipped: undefined, alsoSkipped: null,
  }), [
    ["mode", "subscription"], ["line_items[0][price]", "price_1"], ["line_items[0][quantity]", "1"],
    ["metadata[owner_id]", "user 1"], ["metadata[kind]", "plan"], ["expand[]", "subscription"], ["expand[]", "customer"],
  ]);
  assert.deepEqual(stripeFormPairs({ features: { subscription_update: { schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }] } } } }),
    [["features[subscription_update][schedule_at_period_end][conditions][0][type]", "decreasing_item_amount"]]);
  assert.equal(encodeStripeForm({ metadata: { owner_id: "a&b" } }), "metadata%5Bowner_id%5D=a%26b");
});

test("the same purpose always gives the same idempotency key, a different purpose a different one", () => {
  assert.equal(idempotencyKey("customer", "user_1", "first"), idempotencyKey("customer", "user_1", "first"));
  assert.notEqual(idempotencyKey("customer", "user_1", "first"), idempotencyKey("customer", "user_2", "first"));
  assert.match(idempotencyKey("refund", "pi_1", 730), /^da-[0-9a-f]{40}$/);
});

test("lookup keys map to plans and intervals both ways", () => {
  assert.equal(planLookupKey("creator", "year"), "creator_year");
  assert.deepEqual(parsePlanLookupKey("starter_month"), { plan: "starter", interval: "month" });
  assert.deepEqual(parsePlanLookupKey("studio_year"), { plan: "studio", interval: "year" });
  assert.deepEqual(parsePlanLookupKey("creator_week"), { plan: "creator", interval: "week" });
  assert.equal(parsePlanLookupKey("trial_month"), null);
  assert.equal(parsePlanLookupKey("pack_250"), null);
  assert.equal(parsePlanLookupKey(null), null);
});

test("the catalog = dad's prices (website, Nov 20) and the same 3 packs on every plan, in cents and credits", () => {
  const byKey = Object.fromEntries(STRIPE_CATALOG.map((entry) => [entry.lookupKey, entry]));
  assert.deepEqual(Object.keys(byKey).sort(), ["creator_month", "creator_year", "pack_1000", "pack_250", "pack_500", "starter_month", "starter_year", "studio_month", "studio_year"]);
  assert.equal(byKey.starter_month.unitAmount, 999);
  assert.equal(byKey.creator_month.unitAmount, 2499);
  assert.equal(byKey.studio_month.unitAmount, 4999);
  assert.equal(byKey.starter_year.unitAmount, 9900);
  assert.equal(byKey.creator_year.unitAmount, 24900);
  assert.equal(byKey.studio_year.unitAmount, 49900);
  assert.equal(byKey.pack_250.unitAmount, 549);
  assert.equal(byKey.pack_500.unitAmount, 1099);
  assert.equal(byKey.pack_1000.unitAmount, 2099);
  assert.equal(byKey.creator_month.productName, "Diamond Animator Pro");
  assert.equal(byKey.pack_500.productName, "500 credits pack");
  assert.equal(byKey.studio_month.productKey, byKey.studio_year.productKey, "month and year of one plan share a product");
});

test("Stripe statuses: which can charge (never two of those), and what deleting must stop", () => {
  assert.equal(mapSubscriptionStatus("active"), "active");
  assert.equal(mapSubscriptionStatus("past_due"), "past_due");
  assert.equal(mapSubscriptionStatus("unpaid"), "past_due");
  assert.equal(mapSubscriptionStatus("incomplete"), "past_due");
  assert.equal(mapSubscriptionStatus("canceled"), "canceled");
  assert.equal(mapSubscriptionStatus("incomplete_expired"), "canceled");
  assert.equal(mapSubscriptionStatus("something_new"), "none");
  for (const status of ["active", "trialing", "past_due", "unpaid", "paused"]) assert.equal(isChargingSubscriptionStatus(status), true, status);
  assert.equal(isChargingSubscriptionStatus("incomplete"), false, "a first payment that never finished is not a plan");
  assert.equal(isLiveSubscriptionStatus("incomplete"), true, "but deleting an account stops it too");
  assert.equal(isLiveSubscriptionStatus("canceled"), false);
});

test("period start and end come from the subscription or (newer API versions) its first item", () => {
  assert.equal(subscriptionPeriodStartMs({ current_period_start: 1_760_000_000 }, 5), 1_760_000_000_000);
  assert.equal(subscriptionPeriodStartMs({ items: { data: [{ current_period_start: 1_760_000_100 }] } }, 5), 1_760_000_100_000);
  assert.equal(subscriptionPeriodStartMs({}, 5), 5);
  assert.equal(subscriptionPeriodEndMs({ current_period_end: 1_760_000_000 }), 1_760_000_000_000);
  assert.equal(subscriptionPeriodEndMs({}), null);
});

test("a subscription's plan: from its price's lookup key, or (after a price change moved the key) from the price's own diamond_key", () => {
  assert.deepEqual(subscriptionPlan({ items: { data: [{ price: { lookup_key: "creator_year", recurring: { interval: "year" } } }] } }), { plan: "creator", interval: "year" });
  assert.deepEqual(subscriptionPlan({ items: { data: [{ price: { lookup_key: null, metadata: { diamond_key: "starter_month" }, recurring: { interval: "month" } } }] } }),
    { plan: "starter", interval: "month" }, "an old price still finds its plan");
  assert.equal(subscriptionPlan({ items: { data: [{ price: { lookup_key: "someone_elses_price" } }] } }), null);
  assert.equal(subscriptionPlan({}), null);
});

test("the webhook doorbell: only Stripe's own fresh signature is accepted", () => {
  const secret = "whsec_fake_for_unit_tests", payload = '{"id":"evt_1"}', now = 1_800_000_000_000, t = Math.floor(now / 1000);
  const sign = (body: string, at: number, key = secret) => createHmac("sha256", key).update(`${at}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sign(payload, t)}`, secret, now), true);
  assert.equal(verifyStripeSignature(payload, `t=${t},v0=abc,v1=${sign(payload, t)}`, secret, now), true, "extra parts are fine");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sign(payload, t, "whsec_wrong")}`, secret, now), false, "wrong secret");
  assert.equal(verifyStripeSignature('{"id":"evt_2"}', `t=${t},v1=${sign(payload, t)}`, secret, now), false, "changed body");
  assert.equal(verifyStripeSignature(payload, `t=${t - 600},v1=${sign(payload, t - 600)}`, secret, now), false, "older than 5 minutes");
  assert.equal(verifyStripeSignature(payload, null, secret, now), false, "unsigned");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sign(payload, t)}`, undefined, now), false, "no secret set");
  assert.equal(verifyStripeSignature(payload, "garbage", secret, now), false);
});

test("deleting an account: they pay only their AI and Stripe's fee (zero profit, never a loss); unused packs come back", () => {
  // Basic, paid $9.99 this month, Stripe's fee 59¢, 210 credits of AI used: $9.99 − $2.10 − $0.59 = $7.30 back.
  const plan = { stripeId: "in_1", paymentIntentId: "pi_1", kind: "plan" as const, amountCents: 999, refundedCents: 0, feeCents: 59, credits: 470 };
  const back = deletionRefund([plan], 210, [], 0);
  assert.deepEqual({ paid: back.planPaidCents, ai: back.aiCostCents, fee: back.feeCents, refund: back.refundCents }, { paid: 999, ai: 210, fee: 59, refund: 730 });
  assert.deepEqual(back.lines, [{ stripeId: "in_1", paymentIntentId: "pi_1", cents: 730 }]);
  // Used all 470 credits ($4.70 of AI): $9.99 − $4.70 − $0.59 = $4.70 back. More AI than was paid can never become a charge.
  assert.equal(deletionRefund([plan], 470, [], 0).refundCents, 470);
  assert.equal(deletionRefund([plan], 5000, [], 0).refundCents, 0);
  // Already refunded part of it: only the rest can come back.
  assert.equal(deletionRefund([{ ...plan, refundedCents: 730 }], 210, [], 0).refundCents, 0);
  // An upgrade's difference (newest first) is refunded before the cycle's own payment, each at most what was paid.
  const upgrade = { ...plan, stripeId: "in_2", paymentIntentId: "pi_2", amountCents: 1000, feeCents: 59 };
  const both = deletionRefund([upgrade, plan], 300, [], 0);
  assert.equal(both.refundCents, 1999 - 300 - 118);
  assert.deepEqual(both.lines.map((line) => [line.stripeId, line.cents]), [["in_2", 1000], ["in_1", 1999 - 300 - 118 - 1000]]);
  // 150 of a 250-credit $5.49 pack unused: 60% of $5.49 minus 60% of its fee.
  const pack = { stripeId: "cs_1", paymentIntentId: "pi_3", kind: "pack" as const, amountCents: 549, refundedCents: 0, feeCents: 46, credits: 250 };
  assert.equal(deletionRefund([], 0, [pack], 150).packRefundCents, Math.floor(549 * 0.6 - 46 * 0.6));
  assert.equal(deletionRefund([], 0, [pack], 0).refundCents, 0, "a used-up pack gives nothing back");
  assert.equal(deletionRefund([], 0, [], 0).refundCents, 0, "a trial has nothing to refund");
  assert.equal(estimateStripeFeeCents(999), 59);
});

test("the discount codes: first 50, YouTube, both (30% then 25%), wrong codes and the YouTube code on a yearly plan", () => {
  const codes = { first50: "FIRST50TEST", youtube: "YOUTUBETEST" };
  assert.deepEqual(pickOffer({}, codes, "month"), { ok: true, offer: null, apply: null });
  assert.deepEqual(pickOffer({ first50: " first50test " }, codes, "month"), { ok: true, offer: "first50", apply: "first50" });
  assert.deepEqual(pickOffer({ youtube: "YouTubeTest" }, codes, "month"), { ok: true, offer: "youtube", apply: "youtube" });
  assert.deepEqual(pickOffer({ first50: "FIRST50TEST", youtube: "YOUTUBETEST" }, codes, "month"), { ok: true, offer: "both", apply: "first50" });
  assert.deepEqual(pickOffer({ first50: "FIRST50TEST", youtube: "YOUTUBETEST" }, codes, "year"), { ok: true, offer: "first50", apply: "first50" });
  assert.equal(pickOffer({ youtube: "YOUTUBETEST" }, codes, "year").ok, false, "YouTube = monthly plans only");
  assert.equal(pickOffer({ first50: "NOPE" }, codes, "month").ok, false);
  assert.equal(pickOffer({ youtube: "NOPE" }, codes, "month").ok, false);
  assert.equal(pickOffer({ first50: "FIRST50TEST" }, { first50: null, youtube: null }, "month").ok, false, "no code set = refused");
});
