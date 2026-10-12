// SPEC-0020 Phase 9 (Pricing v1, D-0193, approved by Arthur's dad 2026-10-12): plans, credits and the 14-day
// free trial — pure rules, used by the server and the screens.
// 1 credit = about 1¢ of AI cost. Every AI action is priced at its WORST-CASE cost and shown before it runs;
// a refused or failed animation is free. The Help Assistant and voice typing are free.
// Plan credits refill on the same date every month, from the day the plan started (yearly plans refill monthly too) and don't
// roll over. Extra credits (top-up packs) are kept until used. Numbers must match the website's pricing.

export type AccountPlanId = "trial" | "starter" | "creator" | "studio";
export type BillingInterval = "month" | "year";
export type BillingStatus = "none" | "active" | "past_due" | "canceled";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const PLAN_PERIOD_DAYS = 30;
export const LOW_CREDITS_SHARE = 0.1;
/** A failed renewal payment: the AI Animator keeps working for this many days, then waits until it's fixed. */
export const PAYMENT_GRACE_DAYS = 3;

export const ACCOUNT_PLANS: Record<AccountPlanId, { label: string; credits: number; price: string; monthlyUsd: number; yearlyUsd: number }> = {
  trial: { label: "Free trial", credits: 75, price: "Free for 14 days", monthlyUsd: 0, yearlyUsd: 0 },
  starter: { label: "Basic", credits: 180, price: "$5.99 a month", monthlyUsd: 5.99, yearlyUsd: 59 },
  creator: { label: "Pro", credits: 420, price: "$11.99 a month", monthlyUsd: 11.99, yearlyUsd: 119 },
  studio: { label: "Creator", credits: 750, price: "$19.99 a month", monthlyUsd: 19.99, yearlyUsd: 199 },
};

/** What each AI action costs, in credits (its worst-case AI cost). Shown on the button before it runs. */
export const AI_ACTION_CREDITS = { chat: 2, edit: 2, simple: 25, big: 90 } as const;
export type AiActionKind = keyof typeof AI_ACTION_CREDITS;
export const AI_ACTION_LABELS: Record<AiActionKind, string> = {
  chat: "Chat message",
  edit: "Small edit (like “make him green”)",
  simple: "Simple animation",
  big: "Big animation",
};
export const isAiActionKind = (value: unknown): value is AiActionKind =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(AI_ACTION_CREDITS, value);

/** Extra credit packs (Arthur, Phase 9 review): each plan has its own three packs, the biggest = half the plan's
 *  monthly credits. Priced near the plan's own price per credit and checked to keep ≥50% profit at worst-case AI
 *  cost after Stripe's fee (2.9% + 30¢). Plan ids stay starter/creator/studio; their names are Basic/Pro/Creator. */
export const TOP_UP_PACKS = [
  { id: "topup_starter_30", plan: "starter", credits: 30, usd: 1.49, price: "$1.49" },
  { id: "topup_starter_60", plan: "starter", credits: 60, usd: 1.99, price: "$1.99" },
  { id: "topup_starter_90", plan: "starter", credits: 90, usd: 2.99, price: "$2.99" },
  { id: "topup_creator_70", plan: "creator", credits: 70, usd: 2.49, price: "$2.49" },
  { id: "topup_creator_140", plan: "creator", credits: 140, usd: 3.99, price: "$3.99" },
  { id: "topup_creator_210", plan: "creator", credits: 210, usd: 5.99, price: "$5.99" },
  { id: "topup_studio_125", plan: "studio", credits: 125, usd: 3.49, price: "$3.49" },
  { id: "topup_studio_250", plan: "studio", credits: 250, usd: 6.99, price: "$6.99" },
  { id: "topup_studio_375", plan: "studio", credits: 375, usd: 9.99, price: "$9.99" },
] as const;
export type TopUpPackId = (typeof TOP_UP_PACKS)[number]["id"];
export const isTopUpPackId = (value: unknown): value is TopUpPackId => TOP_UP_PACKS.some(pack => pack.id === value);
/** The three packs a plan can buy (none on the trial). */
export const topUpPacksFor = (plan: AccountPlanId) => TOP_UP_PACKS.filter(pack => pack.plan === plan);

/** The plans someone can choose (the trial is automatic). */
export const PAID_PLAN_IDS = ["starter", "creator", "studio"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export const isPaidPlanId = (value: unknown): value is PaidPlanId => (PAID_PLAN_IDS as readonly unknown[]).includes(value);

export const isAccountPlanId = (value: unknown): value is AccountPlanId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_PLANS, value);

/** About how many simple animations a number of credits buys (for the plan cards). */
export const approxAnimations = (credits: number) => Math.floor(credits / AI_ACTION_CREDITS.simple);

/** What the server stores per account. Times are milliseconds since 1970. */
export type AccountPlanRecord = {
  plan: AccountPlanId;
  trialStartedAt: number;
  /** When the current paid plan started (or last renewed); its credits refill every 30 days from here. */
  periodStartedAt: number;
  /** Development tests only: extra credits counted as used in the current window (negative = extra given). */
  testUsedExtra: number;
  /** Extra credits bought as top-up packs, still unused. */
  topUpCredits?: number;
  interval?: BillingInterval;
  billingStatus?: BillingStatus;
  /** When a renewal payment first failed (past_due), else null. */
  pastDueSince?: number | null;
  cancelAtPeriodEnd?: boolean;
  /** True once a paid plan ended (canceled): the app locks like an ended trial. */
  planEnded?: boolean;
};

export type AccountPlanStatus = {
  plan: AccountPlanId;
  label: string;
  /** Plan credits for this month (or the trial). */
  creditsTotal: number;
  /** Plan credits used this month. */
  creditsUsed: number;
  /** Everything that can still be spent: plan credits left + extra credits. */
  creditsLeft: number;
  planCreditsLeft: number;
  topUpCredits: number;
  /** True when the free trial (or a canceled plan) is over: creating is locked; watching and exporting stay open. */
  locked: boolean;
  lockReason: "trial_ended" | "plan_ended" | null;
  /** A failed payment past the grace days: the AI Animator waits until the card is fixed. */
  aiLocked: boolean;
  low: boolean;
  windowStart: number;
  windowEnd: number;
  trialEndsAt: number | null;
  trialDaysLeft: number | null;
  refillsAt: number | null;
  interval: BillingInterval | null;
  billingStatus: BillingStatus;
  paymentProblem: boolean;
  cancelAtPeriodEnd: boolean;
};

/** Adds calendar months like Stripe's monthly billing: the same day of the month, or the month's last day when it
 *  is shorter (Jan 31 → Feb 28 → Mar 31). UTC, keeping the time of day. */
export function addMonths(at: number, months: number) {
  const date = new Date(at);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/** The time window whose credits count now: the 14 trial days, or the current month of a paid plan. Arthur (Phase 9
 *  review): plan credits refill on the same date every month — the day Stripe charges a monthly plan — not every
 *  30 days. Yearly plans refill on that date every month too. */
export function creditWindow(record: AccountPlanRecord, now: number) {
  if (record.plan === "trial") return { start: record.trialStartedAt, end: record.trialStartedAt + TRIAL_DAYS * DAY_MS };
  let months = Math.max(0, Math.floor((now - record.periodStartedAt) / (PLAN_PERIOD_DAYS * DAY_MS)) - 1);
  while (addMonths(record.periodStartedAt, months + 1) <= now) months++;
  return { start: addMonths(record.periodStartedAt, months), end: addMonths(record.periodStartedAt, months + 1) };
}

export function accountPlanStatus(record: AccountPlanRecord, usedInWindow: number, now: number): AccountPlanStatus {
  const { start, end } = creditWindow(record, now);
  const plan = ACCOUNT_PLANS[record.plan];
  const used = usedInWindow + record.testUsedExtra;
  const creditsUsed = Math.min(plan.credits, Math.max(0, used));
  // A negative test count gives extra credits above the plan (the test "+ credits" button).
  const planCreditsLeft = Math.max(0, plan.credits - used);
  const topUpCredits = Math.max(0, record.topUpCredits ?? 0);
  const creditsLeft = planCreditsLeft + topUpCredits;
  const trial = record.plan === "trial";
  const lockReason = record.planEnded ? "plan_ended" as const : trial && now >= end ? "trial_ended" as const : null;
  const billingStatus = record.billingStatus ?? "none";
  const paymentProblem = billingStatus === "past_due";
  const aiLocked = paymentProblem && record.pastDueSince != null && now - record.pastDueSince >= PAYMENT_GRACE_DAYS * DAY_MS;
  return {
    plan: record.plan,
    label: plan.label,
    creditsTotal: plan.credits,
    creditsUsed,
    creditsLeft,
    planCreditsLeft,
    topUpCredits,
    locked: lockReason !== null,
    lockReason,
    aiLocked,
    low: creditsLeft > 0 && creditsLeft <= Math.ceil(plan.credits * LOW_CREDITS_SHARE),
    windowStart: start,
    windowEnd: end,
    trialEndsAt: trial ? end : null,
    trialDaysLeft: trial ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null,
    refillsAt: trial ? null : end,
    interval: trial ? null : record.interval ?? "month",
    billingStatus,
    paymentProblem,
    cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
  };
}

export type CreditCheck = { ok: true } | { ok: false; code: "trial_ended" | "plan_ended" | "payment_problem" | "no_credits"; message: string };

const refillDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric" });

/** Can an AI action that costs `cost` credits start? Credits of actions already running count as reserved. */
export function checkAiCredit(status: AccountPlanStatus, reservedCredits = 0, cost: number = AI_ACTION_CREDITS.chat): CreditCheck {
  if (status.lockReason === "trial_ended") {
    return { ok: false, code: "trial_ended", message: "Your free trial has ended. Choose a plan to keep animating. Your projects are safe." };
  }
  if (status.lockReason === "plan_ended") {
    return { ok: false, code: "plan_ended", message: "Your plan has ended. Choose a plan to keep animating. Your projects are safe." };
  }
  if (status.aiLocked) {
    return { ok: false, code: "payment_problem", message: "Your last payment didn't go through. Update your card in Manage plan to keep animating. Your projects are safe." };
  }
  if (status.creditsLeft - Math.max(0, reservedCredits) >= Math.max(1, cost)) return { ok: true };
  return {
    ok: false,
    code: "no_credits",
    message: status.plan === "trial"
      ? `This needs ${cost} credits and your free trial has ${status.creditsLeft} left. Choose a plan to keep animating. Your projects are safe.`
      : `This needs ${cost} credits and you have ${status.creditsLeft}. Your credits refill on ${refillDay(status.refillsAt ?? status.windowEnd)}, or buy extra credits. No animation changed.`,
  };
}
