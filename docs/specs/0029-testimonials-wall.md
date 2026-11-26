# SPEC-0029 — Testimonials at the happy moment, with faces, for the Wall of Love

Status: BUILT + TESTED in the worktree (Nov 26 10:11) — type check, lint, 6 new tests pass; tested in the real app on one local
dev server (computer + phone width). Not committed. Kids rule = 13+ only (dad's session, Nov 26: ads come after go-live).
Asked by: dad, Nov 26 09:03 ("testimonials are a huge part of the success of this company")
Created: 2026-11-26 · Worktree: claude/dreamy-mendeleev-250f48 (from main ed46ea7)

## The simple version
After someone's first animations land (and after their first video export) the "It's yours" card asks **one tiny question:
5 stars, one sentence, and a box "OK to feature me"**. It takes 5 seconds, can be skipped, and never comes back once answered
(or after being closed twice). A happy person with no profile photo gets a one-tap "Add a photo" so their quote has a face.
Everything is saved on our server. Arthur (the owner) sees a **Testimonials** page: approve or hide each one, then press
**Export** to get a zip (quotes + photos) for the website's Wall of Love and for ads. **Only people who say they are 13 or older
can ever be featured** (the law about kids, COPPA). Nothing about making, editing, saving, login or money changes.

## What gets built (after "program")
1. **The ask** (inside the existing "It's yours" card, `src/components/workspace/ai/aiDock.tsx`; same look, one extra row):
   "Loving it? ★★★★★". Tapping a star opens: one line "What do you like?" (max 280 letters, optional) and one box:
   ☐ **"I'm 13 or older, and Diamond Animator may show my words, first name and photo on its website and ads."**
   Then **Send** (or "Not now"). Shown after the first 3 animations (as today) and once after the first finished **video or GIF
   export** (the export window's "Downloaded" message gets the same small row; `AnimationExportFlow.tsx`, display only — the
   export engine is not touched). Watch it / Change it / Export keep working exactly as now.
   **Never asked again** when: they sent stars once, or they closed/skipped the ask twice. This is remembered **on the server per
   account** (not per browser), so a new phone doesn't ask again.
2. **The photo nudge:** after Send with 4–5 stars + the box ticked + no profile photo: "Add a photo so people see who said it"
   → **Add a photo** (the same picture picker, shrinking and save as the Profile page — moved into one shared helper, same
   behaviour) or "No thanks". The photo is the account's normal profile picture (better-auth `image`); nothing new is stored.
3. **Server storage** — new `src/lib/account/testimonialStore.ts` + `testimonials.ts` (rules) + `testimonials.test.ts`, same style
   as `problemReportStore.ts`: file `.local/spec0015-phase3/testimonials.sqlite`, two tables:
   `testimonial_v1` (id, created_at, user_id, stars 1–5, text, feature_ok 0/1, where = "animation" | "export",
   status new|approved|hidden, display_name) and `testimonial_ask_v1` (user_id, skips, answered_at).
   API `app/api/account/testimonials/route.ts`: POST (signed in; one answer per account; max 5 tries an hour), GET ?ask=1 (should
   I ask?), owner-only GET list / PATCH approve·hide·display name / GET ?export=1. Others get "not found" (like /reports).
4. **Owner page `/testimonials`** (owner = `owner.ts`, linked next to "Problem reports" in the owner menu): newest first, stars,
   words, photo, featured-OK yes/no, Approve / Hide, edit the shown name (default **first name + last initial**, e.g. "Maya R.").
   **Export** downloads `wall-of-love.zip` = `testimonials.json` (name, stars, words, date, photo file) + `photos/*.jpg`.
   Only **approved + 13-or-older + featured-OK** ones are exported. Photo and name are read **at export time**, so a person who
   removes their photo or deletes their account disappears from the next export.
5. **Deleting an account deletes its testimonials** — one line in the existing "delete my account" step (`auth.ts` beforeDelete,
   next to the other account data). This is the only touch near account code; it is needed because the privacy page promises it.

## THE KIDS RULE (dad, please confirm the exact wording)
- A testimonial can be **featured only if** the person ticked the box saying **"I'm 13 or older"** + OK to feature, gave 4–5 stars,
  and **Arthur approved it**. Nobody else is ever exported, shown or used in an ad.
- **No tick = private:** the stars and sentence are kept for Arthur to read (like a problem report), never shown publicly,
  never exported, deleted with the account. No name or photo is ever used.
- We never ask anyone's age or birthday (asking would itself collect data about children); the tick is the only signal.
- When approving, Arthur also checks the **photo is not a young child** (a parent's account may be used by a kid) — if in doubt,
  export it without the photo (a "no photo" switch on the owner page).
- No reward (no credits) for a testimonial and no changing their words (US FTC rule on reviews); spelling-only fixes are OK.
- Someone can take it back: Profile page shows "Your testimonial · Remove" (removes it everywhere at the next export).
- **Choice for dad:** this rule uses **13+** (the COPPA line). Stricter option: **18+** for ads only (some ad networks and parents
  prefer it). Recommended: 13+ for the website wall, 18+ for paid ads — the owner page marks which is which only if dad picks this.
- Not checked by a lawyer (same as the children's page — still on dad's must-do list).

## Plan only — NOT built in this task
- **"Made First Animation" signal to Klaviyo** (`emailSignals.ts`): one more signal, sent once per account when the first animation
  lands (server side, where the credits for a finished animation are recorded — read only, no money change). Klaviyo then sends a
  testimonial email 2–3 days later to people who skipped the in-app ask. Needs a Klaviyo flow + dad's OK; the email-sequences
  session can own the flow.
- **Google sign-in** (fills the profile photo automatically for most people): login is protected, so after launch week, decision
  is dad's/Arthur's. Note: Google photos of under-13 users must follow the same kids rule.
- **Wall of Love page on the website** (separate repo, needs Arthur's OK): a grid of cards (photo or initial circle, name, 5
  stars, quote) fed by the exported `testimonials.json`; re-export + push = updated wall. Same JSON works for ad creatives.

## As built (Nov 26)
- Files: `src/lib/account/testimonials.ts` (rules), `testimonialStore.ts` (sqlite), `testimonials.test.ts` (6 tests),
  `profilePicture.ts` (the Profile page's picture shrink, moved, same behaviour), `app/api/account/testimonials/route.ts`,
  `app/testimonials/page.tsx`, `src/components/testimonials/` (TestimonialAsk, TestimonialsScreen, OwnTestimonial + css).
- Touched: `aiDock.tsx` (the ask on the card; phones get a small card only when the ask is due), `AnimationExportFlow.tsx`
  (the ask under "Downloaded" after a video/GIF), `AccountProfileScreen.tsx` (helper import + "Your testimonial · Remove"),
  `AppHeader.tsx` (owner link "Testimonials" next to Problem reports, 2 lines), `auth.ts` (1 line in delete-my-account).
- A skip = "Not now" or the card's X. Pressing Watch it / Change it / Export just closes the card (not a skip), so they are
  asked again at the next of their first 3 animations. The export ask is shown once ever. 1-3 stars: no consent box (private
  feedback). Featuring also needs words to quote.

## Real-app test (Nov 26 10:05-10:11, local dev server, throwaway accounts, no AI keys = $0)
Card ask on the computer layout and the phone card; 5 stars + words + box -> saved -> "Add a photo" -> photo saved (also on
Profile); never asked again; X twice = never again, "Change it" is not a skip; no-tick (kid) answer private, no Approve, not
exported; a non-owner gets 404 for the owner list; owner page approve -> Export = wall-of-love.zip (testimonials.json +
1 photo, "Maya R."); ask after a real MP4 export, once ever; Profile "Remove" deletes it. Not tested live: account deletion
removing the testimonial (needs Stripe; covered by the store test).

## What does NOT change
Making/editing animations, the AI, drawing, the export engine, saving, login/sign-up, credits/money, the website.

## How it will be tested
Unit tests for the rules (who is asked, the kids rule, what is exported) + `tsc` + the existing account tests. Then on ONE local dev
server (asked first): a test account gets the "It's yours" card from the app's own "animation landed" signal (no paid AI call)
plus one real video export, sees the ask, sends, gets the photo
nudge, adds a photo; skip-twice never asks again; owner approves; export zip opened and checked; under-13 (no tick) never exported.
Phone width checked. Time: about 2–2.5 hours of building + testing.
