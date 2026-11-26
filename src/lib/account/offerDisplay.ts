// SPEC-0031: how a discount code changes the prices people SEE (plan cards, sign-up step 2, the pay dialog). Display only:
// what is really charged is decided by the payment service with the existing coupons, and the pay dialog shows that real
// amount as "Today's total". The percentages are the same constants the coupons are made from.
import { ACCOUNT_PLANS, addMonths, PLAN_CYCLE, type BillingInterval, type PaidPlanId } from "./plans.ts";

/** "Do both → 30% off your first month, then 25% for the rest of your first year": the first-50 code goes on the checkout
 *  (one code per checkout), and right after the first payment 5% of the list price is refunded, once. */
export const BOTH_EXTRA_PERCENT = 5;
/** The two codes' discounts. The coupons (stripeBilling.ts) are made from these same numbers. */
export const FIRST50_PERCENT = 25;
export const FIRST50_MONTHS = 12;
export const YOUTUBE_PERCENT = 10;
export type Offer = "first50" | "youtube" | "both";
export const normalizeCode = (code: unknown) => (typeof code === "string" ? code.trim().toUpperCase().replace(/\s+/g, "") : "");
const toCents = (usd: number) => Math.round(usd * 100);

export type ShownOffer = "first50" | "youtube";
const cycle = PLAN_CYCLE === "week" ? "week" : "month";
const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
const off = (cents: number, percent: number) => Math.round((cents * percent) / 100);

/** Which offer a checkout gets from the codes someone has (the same rules as pickOffer, without checking the code words). */
export function offerFromCodes(has: { first50?: boolean; youtube?: boolean }, interval: BillingInterval): Offer | null {
  if (has.first50 && has.youtube) return interval === "year" ? "first50" : "both";
  if (has.first50) return "first50";
  if (has.youtube) return interval === "year" ? null : "youtube";
  return null;
}

export type OfferPrice = {
  /** The list price of one payment (a cycle, or a year). */
  listCents: number;
  /** The first payment with the discount (for "both": after the 5% that comes back right after paying). */
  firstCents: number;
  /** Paid at checkout (for "both" the 5% bonus comes back afterwards). */
  checkoutCents: number;
  bonusBackCents: number;
  /** Short words under the price: "For your first 12 months, then $9.99 a month." */
  then: string;
  /** The badge: "Beta price" (first-50) or "YouTube price". */
  badge: string;
};

/** The shown price of a plan with an offer, or null when the offer doesn't change this price. */
export function offerPrice(plan: PaidPlanId, interval: BillingInterval, offer: Offer | null): OfferPrice | null {
  if (!offer) return null;
  const info = ACCOUNT_PLANS[plan];
  const listCents = toCents(interval === "year" ? info.yearlyUsd : info.monthlyUsd);
  const unit = interval === "year" ? "year" : cycle;
  const list = money(listCents);
  if (offer === "youtube") {
    if (interval === "year") return null;
    const firstCents = listCents - off(listCents, YOUTUBE_PERCENT);
    return { listCents, firstCents, checkoutCents: firstCents, bonusBackCents: 0, then: `Your first ${unit}, then ${list} a ${unit}.`, badge: "YouTube price" };
  }
  const first50Cents = listCents - off(listCents, FIRST50_PERCENT);
  if (offer === "first50" || interval === "year") {
    return { listCents, firstCents: first50Cents, checkoutCents: first50Cents, bonusBackCents: 0, badge: "Beta price",
      then: interval === "year" ? `For your first year, then ${list} a year.` : `For your first ${FIRST50_MONTHS} ${unit}s, then ${list} a ${unit}.` };
  }
  const bonusBackCents = Math.min(first50Cents, off(listCents, BOTH_EXTRA_PERCENT));
  return { listCents, firstCents: first50Cents - bonusBackCents, checkoutCents: first50Cents, bonusBackCents, badge: "Beta price",
    then: `Your first ${unit}, then ${money(first50Cents)} a ${unit} until ${unit} ${FIRST50_MONTHS}, then ${list}.` };
}

/** "After that" in the pay dialog: what the next payments are, from the day it is paid. */
export function afterFirstPayment(plan: PaidPlanId, interval: BillingInterval, offer: Offer | null, now = Date.now()): string {
  const info = ACCOUNT_PLANS[plan];
  const listCents = toCents(interval === "year" ? info.yearlyUsd : info.monthlyUsd);
  const unit = interval === "year" ? "year" : cycle;
  const day = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const next = interval === "year" ? addMonths(now, 12) : PLAN_CYCLE === "week" ? now + 7 * 86_400_000 : addMonths(now, 1);
  if ((offer === "first50" || offer === "both") && interval !== "year") {
    const discounted = listCents - off(listCents, FIRST50_PERCENT);
    return `${money(discounted)} a ${unit} until ${day(addMonths(now, FIRST50_MONTHS))}, then ${money(listCents)} a ${unit}.`;
  }
  return `${money(listCents)} every ${unit}, next on ${day(next)}.`;
}

/** The short line for a saved code: "25% off your first year." */
export const offerLine = (offer: ShownOffer) =>
  offer === "first50" ? `${FIRST50_PERCENT}% off your first year.` : `${YOUTUBE_PERCENT}% off your first ${cycle} (${cycle}ly plans).`;
export const offerMoney = money;
