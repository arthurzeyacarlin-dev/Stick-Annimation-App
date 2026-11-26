# SPEC-0031 — Under 13 uses Diamond Animator through a parent's account (COPPA)

Status: BUILT + TESTED (Nov 26 11:38) in worktree `claude/stoic-varahamihira-000939` (from main da79d16). Type checks, lint and
all 14 account test files (136 tests, 5 new) pass. Real app, one local dev server: 13+ sign-up, under-13 hand-off (stays after
reload), borderline year asks the month, parent sign-up with the tick, old account Yes / No (can't be flipped) / owner (No -> parent
tick, owner pages open), sign-out + sign-in; the server refuses a sign-up with no answer, "under13", or the field written directly.
Owner rule (dad's session): the owner's "No" opens the parent tick instead of locking it; the server refuses "under13" for the owner.
Asked by: dad, Nov 26 11:15 ("yes, build it" 11:17); Arthur's "program" 09:48. Not checked by a lawyer.

## The simple version
Sign-up first asks **"What year were you born?"** (a plain list of years, nothing hints at a "right" answer).
- **13 or older:** the sign-up is exactly as today.
- **Under 13:** no account is made with the kid's email. The screen says **"Ask a parent to create your account."** The parent
  presses "I'm the parent or guardian", signs up with **their own** email and ticks **"I'm the parent or guardian and I agree for
  my child to use Diamond Animator."** The kid then uses that account. Parents can also start there directly
  ("Making an account for your child?").
- **Accounts made before today** are asked once, on their next visit: **"Are you 13 or older?"** Yes → nothing changes. No → the
  same parent hand-off (sign out, a parent makes their own account; support can move the kid's projects over on request).
  A third button covers a parent whose child already uses the parent's account (same consent tick).
- **We keep only one word per account:** `13plus`, `parent` or `under13` (+ when it was answered). The birth year is never stored.
- **Marketing / follow-up emails** (Klaviyo signals) go only to `13plus` and `parent` accounts. Unanswered old accounts get none
  until they answer; an old account that answers "under 13" gets the existing "stop the emails" signal once.

## What changes (files)
1. `src/lib/account/ageCheck.ts` (new, + `ageCheck.test.ts`): the rules — under 13 from the birth year (someone born exactly 13
   years ago is also asked the month, so a 12-year-old is never let through by mistake), who may get emails, answered or not.
2. `src/lib/account/auth.ts` (protected; only this): two new account columns `ageGroup` + `ageCheckedAt` (added by the normal
   `auth migrate` at start; nothing removed). A sign-up must say `13plus` or `parent`, or it is refused (the browser can't set or
   change the word later). Login, logout, passwords, deletion: unchanged.
3. `src/components/auth/AuthScreen.tsx` (+ css): the year question, the "ask a parent" screen, the parent form (same form + the
   consent tick). After an under-13 answer this browser goes straight to the parent screen for a day (no going Back to change it).
4. `app/api/account/age/route.ts` (new): an old account answers once (13plus / parent / under13); an answer can't be changed.
5. `src/components/account/AgeGate.tsx` (new) + `app/layout.tsx`: a signed-in account without an answer (or `under13`) sees the
   question / hand-off instead of the app. Privacy, Terms, Status and Reset password stay open.
6. Email signals: `emailSignals.ts` gets `mayGetEmails()`; the plan route, the export signal route and the 6-hour sweep use it.
7. `app/privacy/page.tsx` + `app/terms/page.tsx`: say exactly this (parent's own email, the consent tick, we keep only an
   age group, no marketing to under-13s, kids never featured). `docs/GO_LIVE_CHECKLIST.md`: **"Lawyer review before ads."**

## What does NOT change
Login/logout, passwords, sessions, account deletion, money/credits/plans, saving, AI Animator, drawing/export, the website.
13+ sign-up is the same form. Testimonials stay 13+ only (the existing tick; no change).

## Test
Type check + all account tests (+ new age tests). On ONE local dev server (dad's session's OK first): new 13+ sign-up; under-13 →
hand-off → parent sign-up; an old account (no answer) gets the question (yes / no / parent); sign out + sign in still fine.

## For dad / Website pm after merge
- Nothing to set on the server: `deploy/start.sh` already runs `auth migrate`, which adds the 2 columns.
- All 49 existing accounts will be asked once on their next visit.
- Lawyer review before ads (on the checklist). COPPA also wants: delete a kid's data if a parent doesn't take over — old
  `under13` accounts can be listed for the owner; deleting them is dad's call (not built).
