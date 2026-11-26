// SPEC-0031 (dad, Nov 26): every sales word on the plans page, the pay dialog, the trial cards and the trial-ended screen,
// in ONE place, so dad's copy changes are one file. Never invented proof or numbers: testimonials come only from the ones
// Arthur approved; every number comes from the plan list. Never the payment or email company's name.
import { ACCOUNT_PLANS, CYCLE_WORD, SHORT_ANIMATION_CREDITS } from "./plans.ts";
import { FIRST50_MONTHS, FIRST50_PERCENT } from "./offerDisplay.ts";
import type { TrialNudgeStage } from "./trialNudges.ts";

// Dad, Nov 26 11:24: there is NO money-back guarantee ("the 14-day free trial is the guarantee"). Never promise a refund here;
// the promises below are risk reversal built only on what is true.

/** Dad's choice B: a code every trial user sees (null = only people who have the code, by link or typed, see a discount). */
export const OPEN_BETA_CODE: string | null = null;

/** Two-part impact bullets: the feature, then what it means for you. */
export const VALUE_BULLETS: { lead: string; text: string }[] = [
  { lead: "Type it, watch it move.", text: "Your idea becomes a real animation in minutes. No drawing skills needed." },
  { lead: "Change one part, keep the rest.", text: "Fix exactly what you want without starting over, and only the change uses credits." },
  { lead: "Make it as long as your story.", text: "Add the next part and it carries on smoothly from where the last one ended." },
  { lead: "Draw on top for free.", text: "Hats, signs, faces: drawing by hand never uses credits." },
  { lead: "Share it the same day.", text: "Export an MP4 video for YouTube, TikTok or your friends." },
];
export const VALUE_TITLE = "What you get with every plan";
export const PROOF_TITLE = "What animators say";

/** The promises under the plans (risk reversal). No renewal reminder email exists, so none is promised. */
export const PROMISES: { title: string; text: string }[] = [
  { title: "Free for 14 days first", text: "Every account starts with a free 14-day trial, so you know exactly what you're getting before you pay." },
  { title: "Cancel any time", text: "Two clicks in Plans, no questions. Your plan runs to the end of what you paid." },
  { title: "No surprise charges", text: "You see today's exact price before you pay, and your next payment date is always on this page." },
  { title: "Your projects are always yours", text: "They stay safe even if you stop. You can still watch and export them." },
  { title: "Secure payment", text: "Your card is encrypted and sent securely. Diamond Animator never sees or stores your card number." },
];

/** The pay dialog's short bullets and "What happens next". */
export const PAY_BULLETS = ["Credits arrive the moment you pay.", "Cancel any time in Plans: two clicks, no questions.", "No surprise charges."];
export const NEXT_STEPS = [
  "Your credits are ready right away.",
  `They refill every ${CYCLE_WORD} on the day you started.`,
  "Change or cancel any time in Plans.",
];

/** What a plan unlocks (the smallest plan, from the plan list). */
export const UNLOCK_LINE = `${ACCOUNT_PLANS.starter.label}: ${ACCOUNT_PLANS.starter.credits.toLocaleString("en-US")} credits every ${CYCLE_WORD}. ${ACCOUNT_PLANS.starter.about.replace(/:.*$/, "")}.`;

const longDay = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const clock = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** The trial card's title and words for a stage. */
export function trialNudgeCopy(stage: TrialNudgeStage, facts: { trialEndsAt: number; creditsLeft: number; daysLeft: number }): { title: string; text: string } {
  const most = ACCOUNT_PLANS.studio.credits.toLocaleString("en-US");
  const least = ACCOUNT_PLANS.starter.credits.toLocaleString("en-US");
  switch (stage) {
    case "days3": return { title: `${facts.daysLeft} day${facts.daysLeft === 1 ? "" : "s"} left on your free trial`,
      text: `Your free trial ends on ${longDay(facts.trialEndsAt)}. Pick a plan now and keep animating without a break. Everything you've made stays safe either way.` };
    case "lastDay": return { title: "Last day of your free trial",
      text: `At ${clock(facts.trialEndsAt)}, making new animations pauses. Your projects stay safe, and you can still watch and export them. Pick a plan to keep going.` };
    case "creditsLow": return { title: `${facts.creditsLeft} credit${facts.creditsLeft === 1 ? "" : "s"} left`,
      text: `A 10-second animation uses ${SHORT_ANIMATION_CREDITS} credits, planning included. A plan gives you ${least} to ${most} fresh credits every ${CYCLE_WORD}, so you never have to stop mid-story.` };
    case "creditsOut": return { title: "You used every free credit!",
      text: "Nice work: you made the most of your trial. Your projects are safe. Pick a plan and your new credits are ready the moment you pay." };
  }
}

export const TRIAL_ENDED_LEAD = "Your animations are safe: you can still watch and export them below. Pick a plan to pick up right where you left off.";

// ---------- The beta price (dad, Nov 26 11:27: bold and upfront, fear of loss, and TRUE) ----------
// Rule (stripeBillingRules.pickOffer): the first-50 code works only while the account's free trial is running, and at most 50
// times in all. These words never say anything else: no invented deadline, no spots-left number.
const dayWords = (at: number, now: number) => {
  const left = at - now;
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  if (left <= 86_400_000) return `${sameDay ? "today" : "tomorrow"} at ${clock(at)}`;
  return `in ${Math.ceil(left / 86_400_000)} days`;
};
export function betaReservedCopy(trialEndsAt: number, now = Date.now()) {
  return {
    title: `Your beta price is reserved: ${FIRST50_PERCENT}% off for a full year.`,
    text: `It disappears when your free trial ends ${dayWords(trialEndsAt, now)}.`,
    button: "Lock it in",
    urgent: trialEndsAt - now <= 3 * 86_400_000,
  };
}
/** Under the plans and in the trial card: "Reserved until your trial ends on Friday, Dec 5. After that it's gone." */
export const betaDeadlineLine = (trialEndsAt: number) => `Reserved until your free trial ends on ${longDay(trialEndsAt)} at ${clock(trialEndsAt)}. After that it's gone.`;
export const betaLockedLine = (yearly: boolean) => (yearly ? "Beta price locked in for your first year" : `Beta price locked in for ${FIRST50_MONTHS} months`);
