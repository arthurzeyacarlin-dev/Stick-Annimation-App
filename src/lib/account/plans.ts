// The money rules (pure, no network, no database), used by the server and the screens.
// Arthur's dad's credits plan (Nov 17, PLAN_CREDITS_NOV17.md) and Arthur's Nov 20 words:
//   - 1 credit = 1 cent of real AI cost. Every AI action is priced by what the AI really does and the price is shown first.
//   - "Everything should be in credits. Once you used up all your credits, you cannot use any more AI."
//   - The plan price carries the profit (about 50% after Stripe), not the credits.
// The same numbers as the live website (diamond-website config/pricing.ts). Plan ids stay starter/creator/studio inside;
// their names are Basic / Pro / Creator.
// Plan credits refill every cycle on the day the plan started (yearly plans refill every cycle too), but ONLY once Stripe
// says that cycle is paid. They don't roll over. Pack credits never expire and are used after the plan's credits.

import { creditsText } from "./credits.ts";

export type AccountPlanId = "trial" | "starter" | "creator" | "studio";
/** "month" or "week" = the plan's own cycle (PLAN_CYCLE); "year" = paid a year at a time, still refilled every cycle. */
export type BillingInterval = "month" | "week" | "year";
export type BillingStatus = "none" | "active" | "past_due" | "canceled";

/** THE pay cycle (one setting). Dad's prices and the live website are per month; Arthur also spoke of weekly (Nov 20).
 *  Switching to "week" = this line + the prices below + the website. Everything else follows it. */
export const PLAN_CYCLE = "month" as "month" | "week";
export const CYCLE_WORD = PLAN_CYCLE === "week" ? "week" : "month";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const LOW_CREDITS_SHARE = 0.1;

export type PlanInfo = { label: string; credits: number; price: string; monthlyUsd: number; yearlyUsd: number; about: string };
// Dad, Nov 17 (website live Nov 20). monthlyUsd = the price of one cycle. (Dad, Nov 26: the free trial has 300 credits, was 150.)
export const ACCOUNT_PLANS: Record<AccountPlanId, PlanInfo> = {
  trial: { label: "Free trial", credits: 300, price: "Free for 14 days", monthlyUsd: 0, yearlyUsd: 0, about: "Enough for 4 animations, each 10 seconds long (71 credits each, planning included): 40 seconds of animation in total" },
  starter: { label: "Basic", credits: 470, price: `$9.99 a ${CYCLE_WORD}`, monthlyUsd: 9.99, yearlyUsd: 99, about: "Enough for 6 animations, each 10 seconds long (71 credits each, planning included): 1 minute of animation in total" },
  creator: { label: "Pro", credits: 1200, price: `$24.99 a ${CYCLE_WORD}`, monthlyUsd: 24.99, yearlyUsd: 249, about: "Enough for 16 animations, each 10 seconds long (71 credits each, planning included): 2 minutes 40 seconds of animation in total" },
  studio: { label: "Creator", credits: 2400, price: `$49.99 a ${CYCLE_WORD}`, monthlyUsd: 49.99, yearlyUsd: 499, about: "Enough for 33 animations, each 10 seconds long (71 credits each, planning included): 5 minutes 30 seconds of animation in total" },
};

/** What the AI really costs, in credits (1 credit = 1 cent). One table, so a provider price change is one edit. */
export const CREDIT_RATES = {
  /** H3 Max Turbo, 768P: 4 credits a second of animation it makes. */
  perSecond: 4,
  /** A new animation also makes a 3-second scene clip that is not on the timeline. */
  sceneSeconds: 3,
  /** (Nov 22, measured) the last clip of a new animation or an added part is made 1 s longer than its steps (room to come to rest). */
  endSeconds: 1,
  /** Filling or erasing a thing's look (the selector only): 1 credit a second of the animation. */
  fillPerSecond: 1,
  /** Redrawing or reshaping a thing (H3 edit mode + the selector, about 7.5 c a second): 8 credits a second. */
  redrawPerSecond: 8,
} as const;

/** Fixed-price AI actions. A chat turn with Sonnet averages 15 cents (Claude ledger, Nov 16-17). */
export const AI_ACTION_CREDITS = { chat: 15, assistant: 1, dictation: 1, drawing: 1 } as const;

/** Arthur, Nov 21 ("as cheap as possible"): a chat answer costs what the AI really cost, 1 credit per started cent, never
 *  less than 1. A Help Assistant or AI Animator answer from Luna is well under a cent, so it costs 1 credit; one that
 *  searched the web costs 2-3. (The 15-credit `chat` above is the new AI Animator's Sonnet reply, not this chat.) */
export const MIN_ANSWER_CREDITS = 1;
export const creditsForCostUsd = (usd: number | null | undefined) =>
  Math.max(MIN_ANSWER_CREDITS, Math.ceil(Math.max(0, Number.isFinite(usd) ? (usd as number) : 0) * 100 - 1e-9));

/** Every kind of AI spend, each with its own line on the AI Dashboard. "simple"/"big" are rows from the old flat prices;
 *  "test" = the development test buttons; "refund" = credits taken back after a refund.
 *  Nov 21 (Arthur: "it makes it sound like I talked to the AI assistant when I did not"): voice typing is counted where it was
 *  used: "dictation" = in the AI Animator's box, "assistant_voice" = in the Help Assistant's box. */
export const AI_ACTION_KINDS = ["animation", "addon", "edit", "look", "chat", "assistant", "dictation", "assistant_voice", "drawing", "simple", "big", "test", "refund"] as const;
export type AiActionKind = (typeof AI_ACTION_KINDS)[number];
export const AI_ACTION_LABELS: Record<AiActionKind, string> = {
  animation: "New animation",
  addon: "Added to an animation",
  edit: "Animation change",
  look: "Look change",
  chat: "AI Animator chat",
  assistant: "Help Assistant answer",
  dictation: "AI Animator voice typing",
  assistant_voice: "Help Assistant voice typing",
  drawing: "AI Animator drawing help",
  simple: "Animation",
  big: "Animation",
  test: "Test",
  refund: "Taken back after a refund",
};
export const isAiActionKind = (value: unknown): value is AiActionKind => (AI_ACTION_KINDS as readonly unknown[]).includes(value);
/** The Help Assistant's kinds. EVERYTHING else (except test and refund rows) is the AI Animator: one rule for the credits bar,
 *  the chart and every list, so they always agree. */
export const ASSISTANT_KINDS: readonly AiActionKind[] = ["assistant", "assistant_voice"];
export const creditSourceOf = (kind: string): "animator" | "assistant" | null =>
  kind === "test" || kind === "refund" ? null : (ASSISTANT_KINDS as readonly string[]).includes(kind) ? "assistant" : "animator";
/** The AI Animator's kinds (the dashboard adds them up as "AI Animator"). */
export const ANIMATOR_KINDS: readonly AiActionKind[] = AI_ACTION_KINDS.filter((kind) => creditSourceOf(kind) === "animator");

/** The ANIMATOR's part of a new animation of `seconds` (the AI Animator's own price, v1Price.ts priceOf, uses this): 4 credits a
 *  second for its steps + the 3-second scene + the 1-second ending. 10 s = 56 credits. */
export const newAnimationCredits = (seconds: number) =>
  Math.ceil(CREDIT_RATES.perSecond * (Math.max(0, Number(seconds) || 0) + CREDIT_RATES.sceneSeconds + CREDIT_RATES.endSeconds));
/** (Dad, Nov 26) PLANNING IS INCLUDED in the animation's price: one flat amount on the Animate (or edit) card covers Sonnet's plan
 *  answers and the first pictures before Animate - the first plan plus FREE_PLAN_CHANGES changes. 15 credits: measured on the Sonnet
 *  ledger (Nov 19-26, 360 answers), a warm answer costs 9 credits on average (median 8, 9 in 10 under 14), so a first plan plus most
 *  of a typical change; the cold load of Sonnet's rulebook is never charged to anyone (we pay it). */
export const PLANNING_CREDITS = AI_ACTION_CREDITS.chat;
export const FREE_PLAN_CHANGES = 3;
/** A change after the free ones is charged its warm real cost, never more than this (shown on the card before it is sent). */
export const PAID_CHANGE_MAX_CREDITS = 20;
/** What a new animation of `seconds` costs on its card, planning included. 10 s = 71 credits. */
export const animationPriceCredits = (seconds: number) => newAnimationCredits(seconds) + PLANNING_CREDITS;
export const SHORT_ANIMATION_CREDITS = animationPriceCredits(10);
/** About how many 10-second animations a number of credits buys (planning included). */
export const approxAnimations = (credits: number) => Math.round(credits / SHORT_ANIMATION_CREDITS);

/** Arthur, Nov 21: never just "about 60 animations". Always say how many, how long each one is, what each costs in credits,
 *  and how long that is in total, counting only WHOLE animations the credits really pay for. */
export const EXAMPLE_ANIMATION_SECONDS = 10;
const durationText = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const minuteWords = minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "";
  const secondWords = rest ? `${rest} second${rest === 1 ? "" : "s"}` : "";
  return [minuteWords, secondWords].filter(Boolean).join(" ") || "0 seconds";
};
export const planAnimationsText = (credits: number) => {
  const count = Math.floor(Math.max(0, credits) / SHORT_ANIMATION_CREDITS);
  return `Enough for ${count} animation${count === 1 ? "" : "s"}, each ${EXAMPLE_ANIMATION_SECONDS} seconds long (${SHORT_ANIMATION_CREDITS} credits each, planning included): ${durationText(count * EXAMPLE_ANIMATION_SECONDS)} of animation in total`;
};

/** Extra credit packs (they never expire; members only, not the trial). Arthur, Nov 21: each plan gets packs that fit its
 *  size: small ones on Basic, middle ones on Pro, big ones on Creator. Every pack keeps dad's price per credit (about
 *  2.1-2.2 cents, Nov 17) and Pro keeps dad's exact three packs. Each keeps about half profit after Stripe's fee. */
export const TOP_UP_PACKS = [
  { id: "pack_100", credits: 100, usd: 2.59, price: "$2.59", plans: ["starter"] },
  { id: "pack_200", credits: 200, usd: 4.49, price: "$4.49", plans: ["starter"] },
  { id: "pack_400", credits: 400, usd: 8.79, price: "$8.79", plans: ["starter"] },
  { id: "pack_250", credits: 250, usd: 5.49, price: "$5.49", plans: ["creator"] },
  { id: "pack_500", credits: 500, usd: 10.99, price: "$10.99", plans: ["creator", "studio"] },
  { id: "pack_1000", credits: 1000, usd: 20.99, price: "$20.99", plans: ["creator", "studio"] },
  { id: "pack_2000", credits: 2000, usd: 41.99, price: "$41.99", plans: ["studio"] },
] as const;
export type TopUpPackId = (typeof TOP_UP_PACKS)[number]["id"];
export type TopUpPack = (typeof TOP_UP_PACKS)[number];
export const isTopUpPackId = (value: unknown): value is TopUpPackId => TOP_UP_PACKS.some(pack => pack.id === value);
/** The packs a plan can buy (smallest first): three that fit the plan, none on the trial. */
export const topUpPacksFor = (plan: AccountPlanId): TopUpPack[] =>
  TOP_UP_PACKS.filter((pack) => (pack.plans as readonly string[]).includes(plan));

/** The plans someone can choose (the trial is automatic). */
export const PAID_PLAN_IDS = ["starter", "creator", "studio"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export const isPaidPlanId = (value: unknown): value is PaidPlanId => (PAID_PLAN_IDS as readonly unknown[]).includes(value);
export const isAccountPlanId = (value: unknown): value is AccountPlanId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_PLANS, value);

/** Safety (dad's plan, Nov 17): one account can spend at most this many credits in 24 hours. Dad picks the number. */
export const DAILY_CREDIT_LIMIT = 1500;

/** What the server stores per account. Times are milliseconds since 1970. */
export type AccountPlanRecord = {
  plan: AccountPlanId;
  trialStartedAt: number;
  /** When the current paid period started (Stripe's current_period_start); credits refill every cycle from here. */
  periodStartedAt: number;
  /** Development tests only: extra credits counted as used in the current window (negative = extra given). */
  testUsedExtra: number;
  /** Extra credits bought as packs, still unused. */
  topUpCredits?: number;
  interval?: BillingInterval;
  billingStatus?: BillingStatus;
  /** When a renewal payment first failed (past_due), else null. */
  pastDueSince?: number | null;
  cancelAtPeriodEnd?: boolean;
  /** True once a paid plan ended (canceled): the app locks like an ended trial. */
  planEnded?: boolean;
  /** The plan whose payment Stripe confirmed, and the time it pays for. Plan credits exist only inside that time. */
  paidPlan?: AccountPlanId | null;
  paidFrom?: number | null;
  paidUntil?: number | null;
  /** A payment on this account is disputed with the bank: the AI waits until it is settled. */
  disputed?: boolean;
  /** (dad, Nov 26) the free trial's email rule: "confirm" = a new account; its 14 days start when the email is confirmed.
   *  "confirm_legacy" = an account from before the rule with no AI use yet: it confirms on its next animation (its dates stay).
   *  "no_trial" = this inbox already had a free trial: no trial credits, a plan instead. null = confirmed (or from before the rule). */
  trialGate?: TrialGate | null;
};
export type TrialGate = "confirm" | "confirm_legacy" | "no_trial";
export const isTrialGate = (value: unknown): value is TrialGate => value === "confirm" || value === "confirm_legacy" || value === "no_trial";

export type AccountPlanStatus = {
  plan: AccountPlanId;
  label: string;
  /** Plan credits for this cycle (or the trial); 0 while this cycle's payment hasn't gone through yet. */
  creditsTotal: number;
  /** Plan credits used this cycle. */
  creditsUsed: number;
  /** Everything that can still be spent: plan credits left + pack credits. */
  creditsLeft: number;
  planCreditsLeft: number;
  topUpCredits: number;
  /** True when the free trial (or a canceled plan) is over: creating is locked; watching and exporting stay open. */
  locked: boolean;
  /** (dad, Nov 26) "no_trial" = this inbox already had its free trial: the account is sent to Plans. */
  lockReason: "trial_ended" | "plan_ended" | "no_trial" | null;
  /** (dad, Nov 26) the free trial waits for the email to be confirmed: no trial credits until then (looking around is open). */
  emailConfirmNeeded: boolean;
  /** A disputed payment: the AI waits until it is settled. */
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
  /** A paid plan whose current cycle isn't paid yet: its new credits come the moment the payment goes through. */
  waitingForPayment: boolean;
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

/** One or more plan cycles later (a week, or a calendar month like Stripe). */
export const addCycles = (at: number, cycles: number) => (PLAN_CYCLE === "week" ? at + cycles * 7 * DAY_MS : addMonths(at, cycles));
const CYCLE_DAYS = PLAN_CYCLE === "week" ? 7 : 30;

/** The time window whose credits count now: the 14 trial days, or the current cycle of a paid plan (yearly plans too). */
export function creditWindow(record: AccountPlanRecord, now: number) {
  if (record.plan === "trial") return { start: record.trialStartedAt, end: record.trialStartedAt + TRIAL_DAYS * DAY_MS };
  let cycles = Math.max(0, Math.floor((now - record.periodStartedAt) / (CYCLE_DAYS * DAY_MS)) - 1);
  while (addCycles(record.periodStartedAt, cycles + 1) <= now) cycles++;
  return { start: addCycles(record.periodStartedAt, cycles), end: addCycles(record.periodStartedAt, cycles + 1) };
}

/** Stripe's times and ours can differ by a few seconds; a minute of slack never gives or takes a whole cycle. */
const PAID_SLACK_MS = 60_000;

/** Is the cycle that starts at `windowStart` paid? Plans set without Stripe (development test buttons) carry their own paid time. */
export function isCyclePaid(record: AccountPlanRecord, windowStart: number) {
  if (record.plan === "trial") return true;
  if (record.paidFrom == null || record.paidUntil == null) return false;
  return windowStart >= record.paidFrom - PAID_SLACK_MS && windowStart < record.paidUntil - PAID_SLACK_MS;
}

export function accountPlanStatus(record: AccountPlanRecord, usedInWindow: number, now: number): AccountPlanStatus {
  const { start, end } = creditWindow(record, now);
  const trial = record.plan === "trial";
  const paid = isCyclePaid(record, start);
  const paidPlan = !trial && record.paidPlan && isAccountPlanId(record.paidPlan) && record.paidPlan !== "trial" ? record.paidPlan : record.plan;
  // (dad, Nov 26) a free trial gives its credits only once the email is confirmed, and only to an inbox that never had one
  const gate = trial ? record.trialGate ?? null : null;
  const emailConfirmNeeded = gate === "confirm" || gate === "confirm_legacy";
  const total = paid && !emailConfirmNeeded && gate !== "no_trial" ? ACCOUNT_PLANS[paidPlan].credits : 0;
  const used = usedInWindow + record.testUsedExtra;
  const creditsUsed = Math.min(total, Math.max(0, used));
  // A negative test count gives extra credits above the plan (the test "+ credits" button).
  const planCreditsLeft = Math.max(0, total - used);
  const topUpCredits = Math.max(0, record.topUpCredits ?? 0);
  const creditsLeft = planCreditsLeft + topUpCredits;
  const lockReason = record.planEnded ? "plan_ended" as const : gate === "no_trial" ? "no_trial" as const : trial && now >= end ? "trial_ended" as const : null;
  const billingStatus = record.billingStatus ?? "none";
  return {
    plan: record.plan,
    label: ACCOUNT_PLANS[record.plan].label,
    creditsTotal: total,
    creditsUsed,
    creditsLeft,
    planCreditsLeft,
    topUpCredits,
    locked: lockReason !== null,
    lockReason,
    emailConfirmNeeded: emailConfirmNeeded && lockReason === null,
    aiLocked: Boolean(record.disputed),
    low: creditsLeft > 0 && total > 0 && creditsLeft <= Math.ceil(total * LOW_CREDITS_SHARE),
    windowStart: start,
    windowEnd: end,
    trialEndsAt: trial ? end : null,
    trialDaysLeft: trial ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null,
    refillsAt: trial ? null : end,
    interval: trial ? null : record.interval ?? PLAN_CYCLE,
    billingStatus,
    paymentProblem: billingStatus === "past_due",
    waitingForPayment: !trial && !paid && !record.planEnded,
    cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
  };
}

export type CreditCheck =
  | { ok: true }
  | { ok: false; code: "trial_ended" | "plan_ended" | "no_trial" | "confirm_email" | "payment_hold" | "waiting_for_payment" | "no_credits" | "daily_limit"; message: string };

/** (dad, Nov 26) the kind words for a second account on an inbox that already had its free trial. */
export const NO_TRIAL_MESSAGE = "This email address already had its free trial, so this account starts without one. Pick a plan to start animating: everything you make stays yours.";
export const CONFIRM_EMAIL_MESSAGE = "Confirm your email address to start your free trial: open the link in the email we sent you, or type its 6-digit code in the \"Confirm your email\" box on Home. Nothing was charged.";

export const refillDay = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

/** Can an AI action that costs `cost` credits start? Credits held by actions already running count as used. */
export function checkAiCredit(status: AccountPlanStatus, reservedCredits = 0, cost: number = AI_ACTION_CREDITS.chat): CreditCheck {
  if (status.lockReason === "trial_ended") {
    return { ok: false, code: "trial_ended", message: "Your free trial has ended. Choose a plan to keep animating. Your projects are safe." };
  }
  if (status.lockReason === "plan_ended") {
    return { ok: false, code: "plan_ended", message: "Your plan has ended. Choose a plan to keep animating. Your projects are safe." };
  }
  if (status.lockReason === "no_trial") return { ok: false, code: "no_trial", message: NO_TRIAL_MESSAGE };
  if (status.emailConfirmNeeded) return { ok: false, code: "confirm_email", message: CONFIRM_EMAIL_MESSAGE };
  if (status.aiLocked) {
    return { ok: false, code: "payment_hold", message: "A payment on your account is being checked by your bank, so the AI waits until that's settled. Your projects are safe. Questions: support@diamondanimator.com" };
  }
  const need = Math.max(1, Math.ceil(cost));
  if (status.creditsLeft - Math.max(0, reservedCredits) >= need) return { ok: true };
  if (status.waitingForPayment) {
    return {
      ok: false,
      code: "waiting_for_payment",
      message: status.paymentProblem
        ? `Your last payment didn't go through, so this ${CYCLE_WORD}'s credits are waiting. Update your card in Manage plan and they come right away. Your projects are safe.`
        : `This ${CYCLE_WORD}'s credits come the moment your payment goes through (usually within an hour). Your projects are safe.`,
    };
  }
  return {
    ok: false,
    code: "no_credits",
    message: status.plan === "trial"
      ? `This costs ${creditsText(need)} and your free trial has ${creditsText(status.creditsLeft)} left. Choose a plan to keep animating. Your projects are safe.`
      : `This costs ${creditsText(need)} and you have ${creditsText(status.creditsLeft)} left. Your credits refill on ${refillDay(status.refillsAt ?? status.windowEnd)}, or buy an extra pack. Nothing was changed.`,
  };
}

/** The daily safety limit, checked on top of the credits. */
export function checkDailyLimit(usedLast24h: number, cost: number, limit = DAILY_CREDIT_LIMIT): CreditCheck {
  if (usedLast24h + Math.max(0, cost) <= limit) return { ok: true };
  return { ok: false, code: "daily_limit", message: `You've reached today's limit of ${creditsText(limit)}. More tomorrow. Nothing was charged.` };
}
