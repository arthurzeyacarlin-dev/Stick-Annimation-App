# SPEC-0031 — Trial nudges, beta price you can see, checkout that sells, emails from Arthur

Status: BUILT + TESTED (Nov 26 11:47) on branch `claude/vibrant-mclean-740c63`; copy approved by dad's session on dad's behalf
(11:34). Website pm merges + deploys. Copy changes = `src/lib/account/salesCopy.ts`.
Asked by: dad, Nov 26 11:20. Arthur's "program" for launch work: Nov 26 09:48.

## The simple version
1. **Trial nudges.** A small friendly card (floating, bottom-left; above the bottom bar on phones; nothing moves) appears **once per
   stage** as the free trial ends: 3 days left · last day · credits running low · credits used up. It says what they keep (projects
   stay safe) and what a plan unlocks, with one button **See plans** and **Later**. Each stage is shown once per account (remembered
   on our server, so a new phone doesn't show it again). The "trial ended" screen gets the same sales words.
2. **Beta price you can see.** A link pre-applies a code: `https://app.diamondanimator.com/plans?code=FIRSTDIAMOND` (also works on
   any page, kept through sign-up). With a valid code, every price shows it: struck-through list price, the beta price, "Beta price"
   badge, and the pay dialog lists: price, discount, today's total, what happens after. The discount line is worked out from what the
   payment service really charges today (never our own guess); the money rules and codes are unchanged.
3. **Checkout that sells.** Plans page + pay dialog get: a value recap (5 two-part bullets), real approved testimonials only (none
   shown until Arthur approves some), risk reversal (no money-back guarantee: dad), and "what happens next".
4. **Emails from Arthur.** Findings + fix plan below. Nothing in Stripe or Klaviyo is changed before dad says so.

## What changes (files)
New: `src/lib/account/offerDisplay.ts` (+ test) — beta-price display math (pure); `src/lib/account/salesCopy.ts` — every sales word in
one place (dad edits one file); `src/components/account/offerCode.ts` — keeps `?code=` in this browser; `src/components/account/
TrialNudge.tsx` (+ css); `src/components/account/SalesRecap.tsx` (+ css); `app/api/account/billing/code/route.ts` (which offer a code
is; signed in; no payment call).
Edited (display only): `PlansScreen.tsx`, `PaymentDialog.tsx`, `AuthScreen.tsx` (step 2 prices + passes the code it already has),
`TrialEndedScreen.tsx`, `app/plans/page.tsx` (signed-out visit keeps `?code=`), `app/layout.tsx` (one line: the nudge),
`app/api/account/testimonials/route.ts` (`?proof=1`: up to 3 approved, featurable quotes, first name + stars, no photos),
`stripeBillingRules.ts` (the 25 / 10 / 12-months numbers become named constants the coupons AND the display read, same values).

**The link for the launch email / website:** `https://app.diamondanimator.com/plans?code=FIRSTDIAMOND` (YouTube:
`?code=DIAMOND10`). Signed out it goes to sign-up with the code kept; signed in it opens Plans with the price applied.

## What does NOT change
Prices, codes, coupons, who may use a code, what is charged, refunds, credits, trial length, sign-in, saving, AI Animator, drawing,
export, the notification bell. No Stripe/Klaviyo setting. The words Stripe and Klaviyo never appear.

## How it is tested
`tsc`, lint, the money/plan tests (`plans`, `stripeBilling`, `stripeMoney`, `credits`) + new `offerDisplay` tests. Then ONE local dev
server (test mode, no real money, no AI): a throwaway trial account moved through each stage with the existing dev plan switch;
`/plans?code=FIRST50TEST` signed out → sign up → step-2 prices + pay dialog lines (test card); phone width.

## Dad's answers (Nov 26, via his session) and the beta-price rule (dad 11:27)
- **A. No money-back guarantee** ("the 14-day free trial is the guarantee"). Promises = risk reversal only; no refund promise.
  "We email you before every renewal" is NOT used: no renewal reminder email exists.
- **B.** FIRSTDIAMOND only for people who have it (link or typed). It's capped at 50 and was promised to the reservers.
- **C.** Keep "Hi there," for now (first names: dad decides at the copy review).
- **THE RULE (money code, one condition, tests):** the first-50 code works ONLY while the account's free trial is running; once
  the trial ends the payment refuses it ("Your beta price was reserved during your free trial, and your trial has ended, so this code
  doesn't work any more."). The 50-use cap is unchanged. DIAMOND10 is not affected. `pickOffer(..., { trialRunning })` in
  `stripeBillingRules.ts`; both payment starts pass the account's trial state; `/api/account/billing/code` says the same.
- **Beta user** = an account that has the code (link or typed); it is kept in the browser AND on the account (preferences
  `offer-code`), so any device shows it. Klaviyo's first-50 flag is not read (the app has no key for it): reservers need the link.
- **Bold and upfront (true):** a bar for trial users with the code: "**Your beta price is reserved: 25% off for a full year.** It
  disappears when your free trial ends in N days. [Lock it in]" (stronger in the last 3 days; "today at 5:40 PM" / "tomorrow at …"
  on the last day; closing hides it for this visit). The trial cards: "Reserved until your free trial ends on {Friday, Dec 5} at {5:40 PM}.
  After that it's gone." + button "Lock in my beta price". Plans: the same deadline under "Beta price applied". Pay dialog:
  "Beta price locked in for 12 months" (yearly: "for your first year"). No spots-left number anywhere.

---

## 4. The "Congratulations, Diamond Animator" email — what I found
- **Not the app.** The app sends only 3 kinds of email (password reset, support replies, owner alerts). None is about payments.
- **Not our Klaviyo words.** None of the 93 v2 emails or the Nov 21 emails contains "Congratulations". The members welcome (H1,
  "Welcome to your plan") went live at 11:13, after dad's payment, and greets nobody by name.
- **Most likely the payment service's own email** (receipt / "new subscription" email), which greets by the *customer name* and
  signs as the *business name* "Diamond Animator". These were set off on Nov 21, so either one is back on, or it was the bank's or
  Apple/Google Pay's own message. **To be sure: dad, forward that email (or tell me its From address and subject).** Nothing changed yet.
- Why the name was wrong: the app gives the payment service the account's Name field; Klaviyo gets only the email address.

**Fix plan (after dad's OK, each a click dad saves):**
1. Payment service: keep **all customer emails OFF** (successful payments, refunds, subscription emails). The person sees the
   app's own "You're on Basic!" message, and the welcome email comes from Arthur (next point).
2. Klaviyo: sender name **"Arthur from Diamond Animator"** (arthur@diamondanimator.com) on every flow email (one setting per
   email; Claude drives Chrome, dad clicks Save). Greeting line on H1 and the trial emails: "Hi {{ first_name|default:'there' }},".
3. App: send `first_name` (first word of the Name field, max 30 letters, only if it looks like a name) with the email facts (dad's
   choice C). Without it every greeting says "Hi there," — never the company name.
4. App mail (password + support): `ACCOUNT_MAIL_FROM` = `Arthur from Diamond Animator <support@diamondanimator.com>` (server
   setting, Website pm). Password email greeting: "Hi {first name}," (the app has the name; one line in `auth.ts`, dad's OK).

---

## THE COPY (all of it lives in `src/lib/account/salesCopy.ts`)

### Trial nudges (one card, once per stage; button "See plans", link "Later")
| Stage | When | Title | Words |
|---|---|---|---|
| 3 days | 3 days or less left | **3 days left on your free trial** | Your free trial ends on {Friday, Dec 5}. Pick a plan now and keep animating without a break. Everything you've made stays safe either way. |
| Last day | less than 1 day left | **Last day of your free trial** | At {5:40 PM} today, making new animations pauses. Your projects stay safe, and you can still watch and export them. Pick a plan to keep going. |
| Running low | under 67 credits left (not enough for a 10-second animation) | **{16} credits left** | A 10-second animation uses 67 credits. A plan gives you 470 to 2,400 fresh credits every month, so you never have to stop mid-story. |
| Used up | 0 credits left, trial still on | **You used every free credit!** | Nice work: you made the most of your trial. Your projects are safe. Pick a plan and your new credits are ready the moment you pay. |
Under every card: **What a plan unlocks:** "Basic: 470 credits every month. Enough for 7 animations, each 10 seconds long."
With a saved code, one more line: **"Your beta code FIRSTDIAMOND is saved: 25% off your first year."** (YouTube code: "10% off your first month.")
If two stages are due at once, only the most urgent shows (used up > last day > running low > 3 days); the others count as shown.

### Trial ended screen (shown whenever the trial is over; not a nag)
Title (same): **Your free trial has ended**. Lead: "Thanks for trying Diamond Animator, {Maya}! Your animations are safe: you can still
watch and export them below. Pick a plan to pick up right where you left off." + the value recap bullets + saved-code line + **Choose a plan**.

### Plans page
- Above the plans, with a code: **Beta price applied: FIRSTDIAMOND · 25% off your first year** (green, with "Change").
- Plan card with a code: ~~$9.99~~ **$7.49** a month · badge **Beta price** · "For your first 12 months, then $9.99 a month."
  Yearly: ~~$99~~ **$74.25** a year · "For your first year, then $99 a year." YouTube: ~~$9.99~~ **$8.99** · "Your first month, then $9.99 a month."
  Both codes: ~~$9.99~~ **$6.99** · "Your first month, then $7.49 a month until month 12, then $9.99."
- Under the plans: the value recap, the proof strip, the promises.

### Value recap — "What you get with every plan" (two-part impact bullets; the 6th became a promise)
1. **Type it, watch it move.** Your idea becomes a real animation in minutes. No drawing skills needed.
2. **Change one part, keep the rest.** Fix exactly what you want without starting over, and only the change uses credits.
3. **Make it as long as your story.** Add the next part and it carries on smoothly from where the last one ended.
4. **Draw on top for free.** Hats, signs, faces: drawing by hand never uses credits.
5. **Share it the same day.** Export an MP4 video for YouTube, TikTok or your friends.

### Proof strip — "What animators say"
Up to 3 real quotes Arthur approved (★★★★★, the words, first name + last initial). **None exist yet, so nothing shows.** Never invented.

### Promises (risk reversal) — replaces today's 3 lines
- **Cancel any time.** Two clicks in Plans, no questions. Your plan runs to the end of what you paid.
- **No surprise charges.** You see today's exact price before you pay, and your next payment date is always on this page.
- **Free for 14 days first.** Every account starts with a free 14-day trial, so you know exactly what you're getting before you pay.
- **Your projects are always yours.** They stay safe even if you stop. You can still watch and export them.
- **Secure payment.** Your card is encrypted and sent securely. Diamond Animator never sees or stores your card number.

### Pay dialog ("Pay for Basic")
Lines: **Basic, monthly** $9.99 · **Beta discount (FIRSTDIAMOND)** −$2.50 · **Today's total** $7.49 · (both codes) **YouTube bonus back
to your card right after** $0.50 · **You get** 470 credits every month · **After that** "$7.49 a month until {Nov 26, 2027}, then $9.99
a month" / no code: "$9.99 every month, next on {Dec 26}".
Three short bullets: "Credits arrive the moment you pay." "Cancel any time in Plans: two clicks." "No surprise charges."
Under the button, **What happens next:** "1. Your credits are ready right away. 2. They refill every month on the day you started.
3. Change or cancel any time in Plans."

## First names in emails (dad, 11:34)
`emailFirstName(name, ageGroup)` in `emailSignals.ts`: the first word of the Name field goes to the email service as `first_name`
ONLY when the user's `ageGroup` is `13plus` or `parent` (the COPPA build stores it on the user); `under13` or unknown = no name,
the emails say "Hi there,". Until the COPPA build is merged no account has an age group, so no name is sent yet (safe default).
The email session sets the greeting `Hi {{ first_name|default:'there' }},` in Klaviyo.

## Real-app test (Nov 26 11:40-11:46, one local dev server 127.0.0.1:58696, throwaway account, no payment/AI keys = $0)
- Signed out, `/plans?code=FIRSTDIAMOND` → welcome screen, address cleaned, code saved; sign-up shows "Your code FIRSTDIAMOND is
  saved"; step 2 shows the beta prices (monthly $7.49 / $18.74 / $37.49, yearly $74.25 / $186.75 / $374.25, list price struck).
- After the trial starts: the beta bar ("ends in 14 days"), Lock it in → Plans with "Beta price applied" + the real deadline, struck
  prices, "Beta price" badges, the value recap, the 5 promises. The code is stored on the account (preferences `offer-code`).
- Trial cards via the app's own dev test switch: 2 days left (shown once; reload = not again, saved on the account; the bar turns
  urgent), credits low ("5 credits left"), used up. Phone size: card + bar clear of the help button and bottom bar; Plans on phone.
- Pay dialog with a FAKED payment-start answer ($7.49; no payment service locally): $9.99 · Beta discount (FIRSTDIAMOND) −$2.50 ·
  Today's total $7.49 · Beta price locked in for 12 months · After that "$7.49 a month until Nov 26, 2027, then $9.99 a month" ·
  bullets · What happens next.
- Trial ended: `/api/account/billing/code` FIRSTDIAMOND → none (DIAMOND10 still valid); trial-ended screen shows the bullets and no
  beta line; Plans shows normal prices.
- Money scenario 35 (dad's session asked for proof): on the real payment path with the pretend payment service, (a) a brand-new
  account that never chose anything pays $7.49 with the code (a new account IS a running trial from its first read), (b) day 13 of
  the trial OK, (c) trial ended → refused (and paying without the code still works), (d) paid, cancelled, plan ended → refused.
- Found + fixed in the test: a `?code=` in the address of a signed-in page made the code saver loop (stack overflow); the address
  is now cleaned first and a save only announces a real change. Re-checked: no error.
- Not tested live: a real card payment with a code (no payment keys locally; the money scenarios cover the code at checkout and the
  new trial-only rule), the "last day" card (no dev switch for <24 h; unit-tested), Klaviyo receiving a first name.
