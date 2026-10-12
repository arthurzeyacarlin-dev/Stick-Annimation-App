// SPEC-0020 Phase 9: the pure rules behind Stripe billing (no network, no database) so they can be tested with
// `node --test src/lib/account/stripeBilling.test.ts`. The server code that talks to Stripe is stripeBilling.ts.
import {
  ACCOUNT_PLANS, isPaidPlanId, PAID_PLAN_IDS, TOP_UP_PACKS,
  type BillingInterval, type BillingStatus, type PaidPlanId, type TopUpPackId,
} from "./plans.ts";

export const TEST_MODE_ONLY_MESSAGE = "Payments are in test mode only right now";
export const BILLING_OFF_MESSAGE = "Payments open soon.";

export type BillingMode = "test" | "off";

/** A friendly error with an HTTP status for the API routes. Its message is safe to show to the person. */
export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingError";
    this.status = status;
  }
}

/** Only Stripe test keys may run in this phase: real money must be impossible. */
export const isTestStripeKey = (key: string | undefined | null): key is string =>
  typeof key === "string" && (key.startsWith("sk_test_") || key.startsWith("rk_test_"));

/** Throws unless the key is a Stripe test key (missing key → payments not open yet; live key → refused). */
export function assertTestStripeKey(key: string | undefined | null): string {
  if (!key) throw new BillingError(BILLING_OFF_MESSAGE, 503);
  if (!isTestStripeKey(key)) throw new BillingError(TEST_MODE_ONLY_MESSAGE, 503);
  return key;
}

/** What the screens may know: "test" with a test key, otherwise "off" (no key, or a key that isn't a test key). */
export const billingModeForKey = (key: string | undefined | null): BillingMode => (isTestStripeKey(key) ? "test" : "off");

// ---------- Form encoding (Stripe's API takes application/x-www-form-urlencoded with bracket keys) ----------

export type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/**
 * Flattens nested params the way Stripe expects:
 * { metadata: { owner_id: "a" } } → metadata[owner_id]=a; { expand: ["x"] } → expand[]=x;
 * { line_items: [{ price: "p" }] } → line_items[0][price]=p. null/undefined are skipped.
 */
export function stripeFormPairs(params: Record<string, FormValue>, prefix = ""): [string, string][] {
  const pairs: [string, string][] = [];
  const add = (key: string, value: FormValue) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") add(`${key}[${index}]`, item);
        else add(`${key}[]`, item);
      });
      return;
    }
    if (typeof value === "object") {
      for (const [child, childValue] of Object.entries(value)) add(`${key}[${child}]`, childValue);
      return;
    }
    pairs.push([key, String(value)]);
  };
  for (const [key, value] of Object.entries(params)) add(prefix ? `${prefix}[${key}]` : key, value);
  return pairs;
}

export const encodeStripeForm = (params: Record<string, FormValue>) => new URLSearchParams(stripeFormPairs(params)).toString();

// ---------- Catalog: lookup keys ↔ plans and packs ----------

export type PlanLookupKey = `${PaidPlanId}_${BillingInterval}`;
export type CatalogEntry =
  | { lookupKey: PlanLookupKey; kind: "plan"; plan: PaidPlanId; interval: BillingInterval; productKey: PaidPlanId; productName: string; unitAmount: number }
  | { lookupKey: TopUpPackId; kind: "topup"; pack: TopUpPackId; credits: number; productKey: TopUpPackId; productName: string; unitAmount: number };

export const toCents = (usd: number) => Math.round(usd * 100);

export const planLookupKey = (plan: PaidPlanId, interval: BillingInterval): PlanLookupKey => `${plan}_${interval}`;

export function parsePlanLookupKey(key: unknown): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (typeof key !== "string") return null;
  const match = /^([a-z]+)_(month|year)$/.exec(key);
  if (!match || !isPaidPlanId(match[1])) return null;
  return { plan: match[1], interval: match[2] as BillingInterval };
}

export const STRIPE_CATALOG: CatalogEntry[] = [
  ...PAID_PLAN_IDS.flatMap((plan) => (["month", "year"] as const).map((interval): CatalogEntry => ({
    lookupKey: planLookupKey(plan, interval), kind: "plan", plan, interval, productKey: plan,
    productName: `Diamond Animator ${ACCOUNT_PLANS[plan].label}`,
    unitAmount: toCents(interval === "month" ? ACCOUNT_PLANS[plan].monthlyUsd : ACCOUNT_PLANS[plan].yearlyUsd),
  }))),
  ...TOP_UP_PACKS.map((pack): CatalogEntry => ({
    lookupKey: pack.id, kind: "topup", pack: pack.id, credits: pack.credits, productKey: pack.id,
    productName: `${pack.credits} extra AI credits`, unitAmount: toCents(pack.usd),
  })),
];

export const isBillingInterval = (value: unknown): value is BillingInterval => value === "month" || value === "year";

// ---------- Subscription status ----------

/** Stripe subscription status → the app's billing status. */
export function mapSubscriptionStatus(status: unknown): BillingStatus {
  switch (status) {
    case "active": case "trialing": return "active";
    case "past_due": case "unpaid": case "incomplete": case "paused": return "past_due";
    case "canceled": case "incomplete_expired": return "canceled";
    default: return "none";
  }
}

type SubscriptionLike = {
  current_period_start?: number | null;
  items?: { data?: { current_period_start?: number | null; price?: { lookup_key?: string | null; recurring?: { interval?: string | null } | null } | null }[] } | null;
};

/** When the current period started, in ms. Newer Stripe API versions keep it on the subscription item. */
export function subscriptionPeriodStartMs(subscription: SubscriptionLike, fallback: number): number {
  const seconds = subscription.current_period_start ?? subscription.items?.data?.[0]?.current_period_start;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback;
}

/** Which plan and interval a subscription is for (from its price's lookup key, falling back to the price's interval). */
export function subscriptionPlan(subscription: SubscriptionLike): { plan: PaidPlanId; interval: BillingInterval } | null {
  const price = subscription.items?.data?.[0]?.price;
  const parsed = parsePlanLookupKey(price?.lookup_key);
  if (!parsed) return null;
  const interval = price?.recurring?.interval;
  return { plan: parsed.plan, interval: isBillingInterval(interval) ? interval : parsed.interval };
}
