// SPEC-0020 Phase 2: plans, credits and the 14-day free trial (pure rules, used by the server and the screens).
// 1 credit = 1 message to the AI Animator that gets an answer. The Help Assistant and voice typing are free.
// Numbers match the website (diamond-website/config/pricing.ts): trial 150 credits for 14 days; Starter 300,
// Creator 1,200 and Studio 3,000 credits every 30 days.

export type AccountPlanId = "trial" | "starter" | "creator" | "studio";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const PLAN_PERIOD_DAYS = 30;
export const LOW_CREDITS_SHARE = 0.1;

export const ACCOUNT_PLANS: Record<AccountPlanId, { label: string; credits: number; price: string }> = {
  trial: { label: "Free trial", credits: 150, price: "Free for 14 days" },
  starter: { label: "Starter", credits: 300, price: "$5.99 a month" },
  creator: { label: "Creator", credits: 1200, price: "$11.99 a month" },
  studio: { label: "Studio", credits: 3000, price: "$19.99 a month" },
};

/** The plans someone can choose (the trial is automatic). */
export const PAID_PLAN_IDS = ["starter", "creator", "studio"] as const;

export const isAccountPlanId = (value: unknown): value is AccountPlanId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_PLANS, value);

/** What the server stores per account. Times are milliseconds since 1970. */
export type AccountPlanRecord = {
  plan: AccountPlanId;
  trialStartedAt: number;
  /** When the current paid plan started; its credits refill every 30 days from here. */
  periodStartedAt: number;
  /** Development tests only ("use up my credits"): extra credits counted as used in the current window. */
  testUsedExtra: number;
};

export type AccountPlanStatus = {
  plan: AccountPlanId;
  label: string;
  creditsTotal: number;
  creditsUsed: number;
  creditsLeft: number;
  /** True when the free trial is over and no plan was chosen: only Profile and Log out stay open. */
  locked: boolean;
  low: boolean;
  windowStart: number;
  windowEnd: number;
  trialEndsAt: number | null;
  trialDaysLeft: number | null;
  refillsAt: number | null;
};

/** The time window whose credits count now: the 14 trial days, or the current 30-day period of a paid plan. */
export function creditWindow(record: AccountPlanRecord, now: number) {
  if (record.plan === "trial") return { start: record.trialStartedAt, end: record.trialStartedAt + TRIAL_DAYS * DAY_MS };
  const period = PLAN_PERIOD_DAYS * DAY_MS;
  const elapsed = Math.max(0, now - record.periodStartedAt);
  const start = record.periodStartedAt + Math.floor(elapsed / period) * period;
  return { start, end: start + period };
}

export function accountPlanStatus(record: AccountPlanRecord, usedInWindow: number, now: number): AccountPlanStatus {
  const { start, end } = creditWindow(record, now);
  const plan = ACCOUNT_PLANS[record.plan];
  const creditsUsed = Math.max(0, usedInWindow + record.testUsedExtra);
  const creditsLeft = Math.max(0, plan.credits - creditsUsed);
  const trial = record.plan === "trial";
  return {
    plan: record.plan,
    label: plan.label,
    creditsTotal: plan.credits,
    creditsUsed: Math.min(creditsUsed, plan.credits),
    creditsLeft,
    locked: trial && now >= end,
    low: creditsLeft > 0 && creditsLeft <= Math.ceil(plan.credits * LOW_CREDITS_SHARE),
    windowStart: start,
    windowEnd: end,
    trialEndsAt: trial ? end : null,
    trialDaysLeft: trial ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null,
    refillsAt: trial ? null : end,
  };
}

export type CreditCheck = { ok: true } | { ok: false; code: "trial_ended" | "no_credits"; message: string };

const refillDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric" });

/** Can one more AI Animator message start? Messages already running count as reserved. */
export function checkAiCredit(status: AccountPlanStatus, runningMessages = 0): CreditCheck {
  if (status.locked) {
    return { ok: false, code: "trial_ended", message: "Your free trial has ended. Choose a plan to keep animating. Your projects are safe." };
  }
  if (status.creditsLeft - Math.max(0, runningMessages) > 0) return { ok: true };
  return {
    ok: false,
    code: "no_credits",
    message: status.plan === "trial"
      ? "You've used all your free trial credits. Choose a plan to keep animating. Your projects are safe."
      : `You're out of AI credits for now. They refill on ${refillDay(status.refillsAt ?? status.windowEnd)}. No animation changed.`,
  };
}
