// SPEC-0031 (dad, Nov 26): kids under 13 use Diamond Animator through a PARENT's account (the US law COPPA).
// Sign-up asks the birth year; an under-13 never gets an account from their own email: a parent signs up with their own
// email and agrees. Each account keeps ONE word, never the birth year:
//   "13plus"  - the person said they are 13 or older
//   "parent"  - a parent or guardian made (or took over) the account for their child, and agreed
//   "under13" - an account made before this rule whose user said they are under 13 (they get the parent hand-off)
// No word yet = an account made before this rule: it is asked once ("Are you 13 or older?").

export const AGE_GROUPS = ["13plus", "parent", "under13"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];
/** What a new sign-up may say (an under-13 never signs up themselves). */
export const SIGN_UP_AGE_GROUPS = ["13plus", "parent"] as const;

export const isAgeGroup = (value: unknown): value is AgeGroup => AGE_GROUPS.includes(value as AgeGroup);
export const isSignUpAgeGroup = (value: unknown): value is (typeof SIGN_UP_AGE_GROUPS)[number] =>
  SIGN_UP_AGE_GROUPS.includes(value as (typeof SIGN_UP_AGE_GROUPS)[number]);

/** May this account use the app? (13 or older, or a parent's account.) */
export const ageAllowed = (value: unknown) => value === "13plus" || value === "parent";

/** Follow-up / marketing emails only go to people 13 or older and to parents. Never to an under-13 or an unanswered account. */
export const mayGetEmails = (value: unknown) => ageAllowed(value);

/** The years the sign-up offers, newest first (this year back 100 years). */
export const birthYearChoices = (now = new Date()) => {
  const year = now.getFullYear();
  return Array.from({ length: 101 }, (_, index) => year - index);
};

/** Someone born exactly 13 years ago may still be 12, so only that year also asks the month. */
export const needsBirthMonth = (birthYear: number, now = new Date()) => now.getFullYear() - birthYear === 13;

/** Under 13 today? `birthMonth` is 1-12 and only matters for the borderline year (no month there = treated as under 13).
 *  A birthday later this month counts as not had yet, so a 12-year-old is never let through by mistake. */
export function isUnder13(birthYear: number, birthMonth?: number | null, now = new Date()) {
  const age = now.getFullYear() - birthYear;
  if (age > 13) return false;
  if (age < 13) return true;
  if (!birthMonth || birthMonth < 1 || birthMonth > 12) return true;
  return birthMonth >= now.getMonth() + 1;
}
