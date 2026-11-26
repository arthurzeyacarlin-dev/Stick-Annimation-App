// SPEC-0031: which "your trial is ending" card is due (pure). Each stage is shown once per account; when several are due at
// once only the most urgent shows and the others count as shown, so nobody ever sees a pile of cards.
import { DAY_MS, SHORT_ANIMATION_CREDITS, type AccountPlanStatus } from "./plans.ts";

export const TRIAL_NUDGE_STAGES = ["creditsOut", "lastDay", "creditsLow", "days3"] as const;   // most urgent first
export type TrialNudgeStage = (typeof TRIAL_NUDGE_STAGES)[number];
export const isTrialNudgeStage = (value: unknown): value is TrialNudgeStage => (TRIAL_NUDGE_STAGES as readonly unknown[]).includes(value);

type NudgeStatus = Pick<AccountPlanStatus, "plan" | "locked" | "creditsLeft" | "windowEnd"> & { emailConfirmNeeded?: boolean };

/** Every stage that is true right now (a running free trial only). */
export function trialNudgeStagesNow(status: NudgeStatus, now = Date.now()): TrialNudgeStage[] {
  if (status.plan !== "trial" || status.locked || status.emailConfirmNeeded) return [];   // (Nov 26) not started yet: no "trial ending" card
  const left = status.windowEnd - now;
  const stages: TrialNudgeStage[] = [];
  if (status.creditsLeft <= 0) stages.push("creditsOut");
  if (left <= DAY_MS) stages.push("lastDay");
  if (status.creditsLeft > 0 && status.creditsLeft < SHORT_ANIMATION_CREDITS) stages.push("creditsLow");
  if (left <= 3 * DAY_MS) stages.push("days3");
  return stages;
}

/** The card to show now (or null) and every stage that counts as shown once it is shown. */
export function dueTrialNudge(status: NudgeStatus, seen: readonly string[], now = Date.now()): { show: TrialNudgeStage; markSeen: TrialNudgeStage[] } | null {
  const fresh = trialNudgeStagesNow(status, now).filter((stage) => !seen.includes(stage));
  return fresh.length ? { show: fresh[0], markSeen: fresh } : null;
}
