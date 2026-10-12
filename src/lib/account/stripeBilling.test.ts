// SPEC-0020 Phase 9: the pure rules behind Stripe billing (test mode). No network, no database.
// Run: node --test src/lib/account/stripeBilling.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertTestStripeKey, BillingError, billingModeForKey, encodeStripeForm, isTestStripeKey, mapSubscriptionStatus, parsePlanLookupKey,
  planLookupKey, STRIPE_CATALOG, stripeFormPairs, subscriptionPeriodStartMs, subscriptionPlan, TEST_MODE_ONLY_MESSAGE,
} from "./stripeBillingRules.ts";

// Fake keys made of words only (never a real key).
const TEST_KEY = "sk_test_fake_for_unit_tests";
const RESTRICTED_TEST_KEY = "rk_test_fake_for_unit_tests";
const LIVE_KEY = "sk_live_fake_for_unit_tests";

test("only Stripe test keys may run: live keys are refused, no key means payments are off", () => {
  assert.equal(isTestStripeKey(TEST_KEY), true);
  assert.equal(isTestStripeKey(RESTRICTED_TEST_KEY), true);
  assert.equal(isTestStripeKey(LIVE_KEY), false);
  assert.equal(isTestStripeKey("rk_live_fake"), false);
  assert.equal(isTestStripeKey(undefined), false);
  assert.equal(assertTestStripeKey(TEST_KEY), TEST_KEY);
  assert.throws(() => assertTestStripeKey(LIVE_KEY), (error: unknown) => error instanceof BillingError && error.message === TEST_MODE_ONLY_MESSAGE);
  assert.throws(() => assertTestStripeKey(" sk_test_with_space"), (error: unknown) => error instanceof BillingError && error.message === TEST_MODE_ONLY_MESSAGE);
  assert.throws(() => assertTestStripeKey(undefined), BillingError);
  assert.throws(() => assertTestStripeKey(""), BillingError);
  assert.equal(TEST_MODE_ONLY_MESSAGE, "Payments are in test mode only right now");
  assert.equal(billingModeForKey(TEST_KEY), "test");
  assert.equal(billingModeForKey(LIVE_KEY), "off");
  assert.equal(billingModeForKey(undefined), "off");
});

test("form encoding uses Stripe's bracket keys", () => {
  assert.deepEqual(stripeFormPairs({
    mode: "subscription",
    line_items: [{ price: "price_1", quantity: 1 }],
    metadata: { owner_id: "user 1", kind: "plan" },
    expand: ["subscription", "customer"],
    allow_promotion_codes: true,
    skipped: undefined,
    alsoSkipped: null,
  }), [
    ["mode", "subscription"],
    ["line_items[0][price]", "price_1"],
    ["line_items[0][quantity]", "1"],
    ["metadata[owner_id]", "user 1"],
    ["metadata[kind]", "plan"],
    ["expand[]", "subscription"],
    ["expand[]", "customer"],
    ["allow_promotion_codes", "true"],
  ]);
  assert.deepEqual(stripeFormPairs({
    features: { subscription_update: { default_allowed_updates: ["price"], products: [{ product: "prod_1", prices: ["price_a", "price_b"] }] } },
  }), [
    ["features[subscription_update][default_allowed_updates][]", "price"],
    ["features[subscription_update][products][0][product]", "prod_1"],
    ["features[subscription_update][products][0][prices][]", "price_a"],
    ["features[subscription_update][products][0][prices][]", "price_b"],
  ]);
  assert.equal(encodeStripeForm({ metadata: { owner_id: "a&b" }, success_url: "http://localhost:3000/plans?checkout=done&session_id={CHECKOUT_SESSION_ID}" }),
    "metadata%5Bowner_id%5D=a%26b&success_url=http%3A%2F%2Flocalhost%3A3000%2Fplans%3Fcheckout%3Ddone%26session_id%3D%7BCHECKOUT_SESSION_ID%7D");
});

test("lookup keys map to plans and intervals both ways", () => {
  assert.equal(planLookupKey("creator", "year"), "creator_year");
  assert.deepEqual(parsePlanLookupKey("starter_month"), { plan: "starter", interval: "month" });
  assert.deepEqual(parsePlanLookupKey("studio_year"), { plan: "studio", interval: "year" });
  assert.equal(parsePlanLookupKey("trial_month"), null);
  assert.equal(parsePlanLookupKey("topup_creator_210"), null);
  assert.equal(parsePlanLookupKey("creator_week"), null);
  assert.equal(parsePlanLookupKey(null), null);
});

test("the catalog has the plan prices and every plan.s 3 packs in cents", () => {
  const byKey = Object.fromEntries(STRIPE_CATALOG.map((entry) => [entry.lookupKey, entry]));
  assert.deepEqual(Object.keys(byKey).sort(), ["creator_month", "creator_year", "starter_month", "starter_year", "studio_month", "studio_year", "topup_creator_140", "topup_creator_210", "topup_creator_70", "topup_starter_30", "topup_starter_60", "topup_starter_90", "topup_studio_125", "topup_studio_250", "topup_studio_375"]);
  assert.equal(byKey.starter_month.unitAmount, 599);
  assert.equal(byKey.creator_month.unitAmount, 1199);
  assert.equal(byKey.studio_month.unitAmount, 1999);
  assert.equal(byKey.starter_year.unitAmount, 5900);
  assert.equal(byKey.creator_year.unitAmount, 11900);
  assert.equal(byKey.studio_year.unitAmount, 19900);
  assert.equal(byKey.topup_starter_30.unitAmount, 149);
  assert.equal(byKey.topup_creator_210.unitAmount, 599);
  assert.equal(byKey.topup_studio_375.unitAmount, 999);
  assert.equal(byKey.creator_month.productName, "Diamond Animator Pro");
  assert.equal(byKey.topup_creator_140.productName, "140 extra AI credits");
  // Month and year of one plan share a product.
  assert.equal(byKey.studio_month.productKey, byKey.studio_year.productKey);
});

test("Stripe subscription statuses map to the app's billing status", () => {
  assert.equal(mapSubscriptionStatus("active"), "active");
  assert.equal(mapSubscriptionStatus("trialing"), "active");
  assert.equal(mapSubscriptionStatus("past_due"), "past_due");
  assert.equal(mapSubscriptionStatus("unpaid"), "past_due");
  assert.equal(mapSubscriptionStatus("incomplete"), "past_due");
  assert.equal(mapSubscriptionStatus("canceled"), "canceled");
  assert.equal(mapSubscriptionStatus("incomplete_expired"), "canceled");
  assert.equal(mapSubscriptionStatus("something_new"), "none");
});

test("period start is read from the subscription or (newer API versions) its first item", () => {
  assert.equal(subscriptionPeriodStartMs({ current_period_start: 1_760_000_000 }, 5), 1_760_000_000_000);
  assert.equal(subscriptionPeriodStartMs({ items: { data: [{ current_period_start: 1_760_000_100 }] } }, 5), 1_760_000_100_000);
  assert.equal(subscriptionPeriodStartMs({}, 5), 5);
});

test("a subscription's plan comes from its price lookup key", () => {
  assert.deepEqual(subscriptionPlan({ items: { data: [{ price: { lookup_key: "creator_year", recurring: { interval: "year" } } }] } }), { plan: "creator", interval: "year" });
  assert.equal(subscriptionPlan({ items: { data: [{ price: { lookup_key: "someone_elses_price" } }] } }), null);
  assert.equal(subscriptionPlan({}), null);
});
