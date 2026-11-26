// The pure rules behind Stripe billing (no network, no database), tested with `node --test src/lib/account/stripeBilling.test.ts`.
// The server code that talks to Stripe is stripeBilling.ts.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  ACCOUNT_PLANS, isPaidPlanId, PAID_PLAN_IDS, PLAN_CYCLE, TOP_UP_PACKS,
  type BillingInterval, type BillingStatus, type PaidPlanId, type TopUpPackId,
} from "./plans.ts";
import { creditsText } from "./credits.ts";

export const TEST_MODE_ONLY_MESSAGE = "Payments are in test mode only right now";
export const BILLING_OFF_MESSAGE = "Payments open soon.";

/** "test" = Stripe test mode (fake cards only); "live" = real money (only with dad's restricted key AND STRIPE_LIVE_OK=yes). */
export type BillingMode = "test" | "live" | "off";

/** Every request pins one Stripe API version, so Stripe's objects always have the shape this code reads. */
export const STRIPE_API_VERSION = "2024-12-18.acacia";

/** A friendly error with an HTTP status for the API routes. Its message is safe to show to the person. */
export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingError";
    this.status = status;
  }
}

export const isTestStripeKey = (key: string | undefined | null): key is string =>
  typeof key === "string" && (key.startsWith("sk_test_") || key.startsWith("rk_test_"));
/** Real money only ever runs on a RESTRICTED live key (rk_live_), never the all-powerful secret key. */
export const isLiveStripeKey = (key: string | undefined | null): key is string => typeof key === "string" && key.startsWith("rk_live_");

/** What the key allows: a test key = test mode; a restricted live key = real money only when `liveOk` (STRIPE_LIVE_OK=yes). */
export function billingModeForKey(key: string | undefined | null, liveOk = false): BillingMode {
  if (isTestStripeKey(key)) return "test";
  if (isLiveStripeKey(key) && liveOk) return "live";
  return "off";
}

/** Throws unless payments may run with this key (missing → not open yet; a live key without the switch → refused). */
export function assertAllowedStripeKey(key: string | undefined | null, liveOk = false): string {
  if (!key) throw new BillingError(BILLING_OFF_MESSAGE, 503);
  if (billingModeForKey(key, liveOk) === "off") throw new BillingError(TEST_MODE_ONLY_MESSAGE, 503);
  return key;
}

/** A Stripe idempotency key made from what the request is for: the same purpose twice = the same key = done once. */
export const idempotencyKey = (...parts: (string | number)[]) =>
  `da-${createHash("sha256").update(parts.map(String).join("|")).digest("hex").slice(0, 40)}`;

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

/** The intervals a plan can be bought in: its cycle (a month, or a week) and a whole year. */
export const PLAN_INTERVALS: readonly BillingInterval[] = [PLAN_CYCLE, "year"];
export const isBillingInterval = (value: unknown): value is BillingInterval => (PLAN_INTERVALS as readonly unknown[]).includes(value);

export const planLookupKey = (plan: PaidPlanId, interval: BillingInterval): PlanLookupKey => `${plan}_${interval}`;

export function parsePlanLookupKey(key: unknown): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (typeof key !== "string") return null;
  const match = /^([a-z]+)_(month|week|year)$/.exec(key);
  if (!match || !isPaidPlanId(match[1])) return null;
  return { plan: match[1], interval: match[2] as BillingInterval };
}

export const planUnitAmount = (plan: PaidPlanId, interval: BillingInterval) =>
  toCents(interval === "year" ? ACCOUNT_PLANS[plan].yearlyUsd : ACCOUNT_PLANS[plan].monthlyUsd);

export const STRIPE_CATALOG: CatalogEntry[] = [
  ...PAID_PLAN_IDS.flatMap((plan) => PLAN_INTERVALS.map((interval): CatalogEntry => ({
    lookupKey: planLookupKey(plan, interval), kind: "plan", plan, interval, productKey: plan,
    productName: `Diamond Animator ${ACCOUNT_PLANS[plan].label}`, unitAmount: planUnitAmount(plan, interval),
  }))),
  ...TOP_UP_PACKS.map((pack): CatalogEntry => ({
    lookupKey: pack.id, kind: "topup", pack: pack.id, credits: pack.credits, productKey: pack.id,
    productName: `${creditsText(pack.credits)} pack`, unitAmount: toCents(pack.usd),
  })),
];

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

/** A subscription in one of these is a real plan that can charge the person: there must never be two of them.
 *  ("incomplete" = the first payment never finished; it is not a plan yet and ends by itself within a day.) */
export const CHARGING_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused"] as const;
export const isChargingSubscriptionStatus = (status: unknown) => (CHARGING_SUBSCRIPTION_STATUSES as readonly unknown[]).includes(status);
/** Everything that is not finished yet (also "incomplete"): what deleting an account must stop. */
export const isLiveSubscriptionStatus = (status: unknown) => isChargingSubscriptionStatus(status) || status === "incomplete";

type PriceLike = { lookup_key?: string | null; metadata?: Record<string, string> | null; recurring?: { interval?: string | null } | null } | null;
type SubscriptionLike = {
  current_period_start?: number | null;
  current_period_end?: number | null;
  items?: { data?: { current_period_start?: number | null; current_period_end?: number | null; price?: PriceLike }[] } | null;
};

/** When the current period started / ends, in ms. Newer Stripe API versions keep these on the subscription item. */
export function subscriptionPeriodStartMs(subscription: SubscriptionLike, fallback: number): number {
  const seconds = subscription.current_period_start ?? subscription.items?.data?.[0]?.current_period_start;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback;
}
export function subscriptionPeriodEndMs(subscription: SubscriptionLike): number | null {
  const seconds = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** Which plan and interval a subscription is for. The price's lookup key moves to a NEW price when a price changes, so the
 *  key the app wrote into the price itself (metadata diamond_key) keeps old subscribers recognised after any price change. */
export function subscriptionPlan(subscription: SubscriptionLike): { plan: PaidPlanId; interval: BillingInterval } | null {
  const price = subscription.items?.data?.[0]?.price;
  const parsed = parsePlanLookupKey(price?.lookup_key) ?? parsePlanLookupKey(price?.metadata?.diamond_key);
  if (!parsed) return null;
  const interval = price?.recurring?.interval;
  return { plan: parsed.plan, interval: interval === "month" || interval === "week" || interval === "year" ? interval : parsed.interval };
}

// ---------- The webhook doorbell's signature ----------

/** Checks Stripe's `Stripe-Signature` header (HMAC-SHA256 of "timestamp.payload" with the endpoint's secret), at most
 *  `toleranceSeconds` old. Anything unsigned, wrongly signed or too old is refused. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string | undefined, nowMs = Date.now(), toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([name]) => name === "t")?.[1]);
  const signatures = parts.filter(([name]) => name === "v1").map(([, value]) => value ?? "");
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex"), "utf8");
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// ---------- Deleting an account: they pay only what their AI really cost (Arthur, Nov 20) ----------

/** Stripe's fee when Stripe doesn't say it (US cards): 2.9% + 30¢. */
export const estimateStripeFeeCents = (amountCents: number) => (amountCents > 0 ? Math.round(amountCents * 0.029 + 30) : 0);

export type RefundablePayment = { stripeId: string; paymentIntentId: string | null; kind: "plan" | "pack"; amountCents: number; refundedCents: number; feeCents: number; credits: number };
export type DeletionRefundLine = { stripeId: string; paymentIntentId: string; cents: number };
export type DeletionRefund = {
  /** What was paid for this cycle's plan, its AI use (1 credit = 1 cent) and Stripe's fee on it. */
  planPaidCents: number; aiCostCents: number; feeCents: number;
  planRefundCents: number; packRefundCents: number; refundCents: number; lines: DeletionRefundLine[];
};

/** Arthur, Nov 20: "If they're gonna delete their account, I make zero profit... they pay for all the AI usage they used."
 *  The plan payments of the current cycle: the person keeps paying only the AI they used this cycle (1 credit = 1 cent) and
 *  Stripe's own fee on those payments (so it is zero profit, never a loss); the rest comes back. Unused pack credits come back
 *  at the price paid for them, minus that share of Stripe's fee. Never more than was paid. */
export function deletionRefund(planPayments: RefundablePayment[], planCreditsUsed: number, packPayments: RefundablePayment[], unusedPackCredits: number): DeletionRefund {
  const lines: DeletionRefundLine[] = [];
  const left = (payment: RefundablePayment) => Math.max(0, payment.amountCents - payment.refundedCents);
  const planPaidCents = planPayments.reduce((sum, payment) => sum + left(payment), 0);
  const feeCents = planPayments.reduce((sum, payment) => sum + payment.feeCents, 0);
  const aiCostCents = Math.max(0, Math.round(planCreditsUsed));
  // Plan payments come newest first (an upgrade's difference before the cycle's own payment); each refunds at most what is left of it.
  let planBack = Math.max(0, planPaidCents - aiCostCents - feeCents);
  let planRefundCents = 0;
  for (const payment of planPayments) {
    if (planBack <= 0 || !payment.paymentIntentId) continue;
    const cents = Math.min(planBack, left(payment));
    if (cents > 0) { lines.push({ stripeId: payment.stripeId, paymentIntentId: payment.paymentIntentId, cents }); planBack -= cents; planRefundCents += cents; }
  }
  // Pack payments come newest first: the credits still unused were bought last (packs are spent after the plan, oldest money first).
  let unused = Math.max(0, Math.round(unusedPackCredits));
  let packRefundCents = 0;
  for (const payment of packPayments) {
    if (unused <= 0 || !payment.paymentIntentId || payment.credits <= 0) continue;
    const credits = Math.min(unused, payment.credits);
    const share = credits / payment.credits;
    const cents = Math.min(left(payment), Math.max(0, Math.floor(payment.amountCents * share - payment.feeCents * share)));
    unused -= credits;
    if (cents > 0) { lines.push({ stripeId: payment.stripeId, paymentIntentId: payment.paymentIntentId, cents }); packRefundCents += cents; }
  }
  return { planPaidCents, aiCostCents, feeCents, planRefundCents, packRefundCents, refundCents: planRefundCents + packRefundCents, lines };
}

// ---------- Switching plans: only the UNUSED part comes back (dad, Nov 26) ----------

export type SwitchRefund = {
  /** What was paid for the plan's paid time (a month, or a yearly plan's year) and Stripe's fee on it. */
  planPaidCents: number; feeCents: number;
  /** The plan credits that payment bought (a yearly plan: every month of its year), and how many are gone (used, or in a
   *  month that already ended). */
  creditsPaidFor: number; creditsGone: number; unusedCredits: number;
  refundCents: number; lines: DeletionRefundLine[];
};

/** Dad, Nov 26: a switch is not a deletion. The deletion rule (paid - AI at cost - fee) sold the used credits at cost, so a
 *  switch gives back only the UNUSED share: paid x unused credits / credits paid for, minus that share of Stripe's fee,
 *  never more than was paid. Each payment gives back its own share (newest first). */
export function switchRefund(planPayments: RefundablePayment[], creditsPaidFor: number, creditsGone: number): SwitchRefund {
  const left = (payment: RefundablePayment) => Math.max(0, payment.amountCents - payment.refundedCents);
  const paidFor = Math.max(0, Math.round(creditsPaidFor));
  const gone = Math.min(paidFor, Math.max(0, Math.round(creditsGone)));
  const unusedCredits = paidFor - gone;
  const lines: DeletionRefundLine[] = [];
  for (const payment of planPayments) {
    if (!payment.paymentIntentId || paidFor <= 0) continue;
    // Whole cents, worked out in whole numbers (no rounding drift): (paid - fee) x unused / paid for, rounded down.
    const cents = Math.min(left(payment), Math.max(0, Math.floor(((payment.amountCents - payment.feeCents) * unusedCredits) / paidFor)));
    if (cents > 0) lines.push({ stripeId: payment.stripeId, paymentIntentId: payment.paymentIntentId, cents });
  }
  return {
    planPaidCents: planPayments.reduce((sum, payment) => sum + left(payment), 0),
    feeCents: planPayments.reduce((sum, payment) => sum + payment.feeCents, 0),
    creditsPaidFor: paidFor, creditsGone: gone, unusedCredits,
    refundCents: lines.reduce((sum, line) => sum + line.cents, 0), lines,
  };
}

// ---------- The two discount codes (website: first 50 = 25% off the first year; YouTube = 10% off the first month) ----------

// "Do both" = 30% off the first month (25% code at checkout + 5% of the list price refunded once). The numbers (5% extra, 25% for 12 months, 10%) live in offerDisplay.ts (browser-safe), so the coupons and every price shown
// read the same numbers.
import { normalizeCode } from "./offerDisplay.ts";
export { BOTH_EXTRA_PERCENT, FIRST50_MONTHS, FIRST50_PERCENT, normalizeCode, YOUTUBE_PERCENT } from "./offerDisplay.ts";
export type Offer = "first50" | "youtube" | "both";

/** Dad, Nov 26: the beta price is reserved only while the account's free trial is running; once the trial ends it is gone. */
export const BETA_PRICE_ENDED_MESSAGE = "Your beta price was reserved during your free trial, and your trial has ended, so this code doesn't work any more.";

/** Which offer a checkout gets from the codes the person typed. `codes` = the real codes (settings). `account.trialRunning` =
 *  this account's free trial is still on (dad, Nov 26: the first-50 code can be claimed only then; plus its 50-use cap). */
export function pickOffer(typed: { first50?: unknown; youtube?: unknown }, codes: { first50: string | null; youtube: string | null }, interval: BillingInterval,
  account: { trialRunning: boolean }):
  { ok: true; offer: Offer | null; apply: "first50" | "youtube" | null } | { ok: false; message: string } {
  const first50 = normalizeCode(typed.first50), youtube = normalizeCode(typed.youtube);
  if (first50 && (!codes.first50 || first50 !== normalizeCode(codes.first50))) return { ok: false, message: "That first-50 code isn't right. Check the email we sent you." };
  if (first50 && !account.trialRunning) return { ok: false, message: BETA_PRICE_ENDED_MESSAGE };
  if (youtube && (!codes.youtube || youtube !== normalizeCode(codes.youtube))) return { ok: false, message: "That YouTube code isn't right. Check the code on the channel." };
  if (youtube && interval === "year") {
    if (!first50) return { ok: false, message: `The YouTube code works on ${PLAN_CYCLE === "week" ? "weekly" : "monthly"} plans only.` };
    return { ok: true, offer: "first50", apply: "first50" };
  }
  if (first50 && youtube) return { ok: true, offer: "both", apply: "first50" };
  if (first50) return { ok: true, offer: "first50", apply: "first50" };
  if (youtube) return { ok: true, offer: "youtube", apply: "youtube" };
  return { ok: true, offer: null, apply: null };
}
