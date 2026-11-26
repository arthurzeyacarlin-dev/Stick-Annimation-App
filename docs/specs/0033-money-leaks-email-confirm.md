# SPEC-0033 — The 4 money leaks + email confirm (dad, Nov 26)

Status: BUILT + TESTED in the copy `.claude/worktrees/money-leaks-nov26` (branch `claude/money-leaks-nov26`, from main 9c6a7fd).
NOT committed, NOT live. Website pm commits + deploys after dad says his walkthrough is finished.
Asked by: dad, Nov 26 14:31-14:32 ("we need to fix the 4 leaks once I finish my walkthrough"; "people should have to confirm their
email address to sign up for a free trial, and they can't create free email addresses like using the + sign").

## The simple version
1. **Switching plans gives back only the unused part.** Before: a switch gave back "paid - AI used at cost - card fee" (the delete
   rule), so used credits were sold at cost. Now: paid x unused plan credits / credits paid for, minus that share of the fee, never
   more than was paid. A yearly plan counts every month of its year; a month that already ended counts as used. Deleting an account
   keeps its own zero-profit rule, unchanged. The switch preview says it in words.
2. **A waiting first picture is no longer free.** Its real cost now holds credits like a running animation (so opening new projects
   doesn't give endless free pictures) and counts toward the daily limit and the free trials' hourly limit. When it is animated or
   charged it stops waiting. HOW pictures and animations are made, and what Animate does with the picture, did not change.
3. **A stopped or failed run is still free for the person**, but its real AI money (what fal and Claude booked during the run, never
   more than its card's price) counts toward the daily limit and the trials' hourly limit.
4. **Confirm the email; one free trial per real inbox.** Sign-up and looking around work at once; the trial's credits start when the
   email is confirmed (one email: a link AND a 6-digit code). The waiting screen: code box, "Send the email again", "Wrong email? Fix
   it". A parent account confirms the parent's email. One trial per real inbox (lowercase, nothing after +, Gmail dots don't count,
   googlemail = gmail); a salted fingerprint (never the address) of each inbox that used a trial is kept, also after deletion. A second
   account on the same inbox signs up but gets no trial and is sent to Plans with a kind line. Throwaway email domains can't sign up.
   The owner's test addresses are exempt (server setting). Many trials from one internet address in a day = one owner alert, no block.
5. **Honest 10-second price.** The app said "67 credits"; the card really charges 56 (4 x (10 + 3 scene + 1 ending)) and each chat
   reply is paid on its own at what it really cost (usually 4 to 36). One function now (`newAnimationCredits`, used by the AI
   Animator's own `priceOf`); plan texts count 56 + about 15 for replies (Basic: 6 animations, was 7).

## Old accounts (decided)
Once, when this arrives: an account with a plan, a payment, an ended plan or any real AI use counts as confirmed. A trial account with
none of those confirms its email on its next animation (its trial dates stay). An old account that never opened the app (no plan row)
is treated the same. Their inboxes count for "one trial per inbox" when they used the trial.

## Server settings (Website pm, on the server's private settings; never in the code)
- `DIAMOND_TRIAL_EXEMPT_EMAILS` = dad's and Arthur's family addresses, comma separated (each +tag of them gets its own trial).
- Optional `DIAMOND_DISPOSABLE_DOMAINS` = extra throwaway domains, comma separated.
- Real email needs `RESEND_API_KEY` + `ACCOUNT_MAIL_FROM` (already set for password reset). Without them the email goes to /dev/mail.
- New file on the server: `.local/spec0015-phase3/email-confirm.sqlite` + `trial-inbox-salt` (made by themselves; back them up with
  auth.sqlite; losing the salt only means old fingerprints stop matching). `account-plans.sqlite` gets 1 column + 2 small tables.

## Files
New: `src/lib/account/inbox.ts` (+ test), `disposableEmailDomains.ts`, `emailConfirm.ts` (+ test),
`app/api/account/email-confirm/route.ts`, `app/api/account/email-confirm/link/route.ts`, `src/components/account/EmailConfirm.tsx` (+ css).
Changed: `stripeBillingRules.ts` (`switchRefund`), `stripeBilling.ts` (switch quote; shared payments reader), `aiCredits.ts` (uncharged
AI cost table, limits, trial gate), `plans.ts` (trial gate in the status, `newAnimationCredits`, texts), `v1UsageMeter.ts`,
`v1AnimatorCore.ts` (money bookkeeping lines only), `v1AnimatorServer.ts` (fal ledger path), `v1Price.ts` (uses the one formula, same
numbers), `auth.ts` (sign-up hooks + deletion keeps the fingerprint; login/logout untouched), `AuthScreen.tsx`, `PlansScreen.tsx`,
`TrialNudge.tsx`, `trialNudges.ts`, `emailSignals.ts` ("Started Trial" only after confirm), `salesCopy.ts`, `V1AnimatorChat.tsx`,
`app/page.tsx`, `app/layout.tsx`, `app/api/account/plan/route.ts`, `app/privacy/page.tsx` (one line).

## Not changed
How animations and pictures are made, edited or placed; prices; plans; codes; trial length; login/logout; deleting (its refund rule);
the website (its "67 credits" / "7 animations" wording is the website's own: Website pm/Arthur's call).

## Batch 2 (dad, Nov 26 14:39-15:07: "Yes, all 3", "Yes, do that", "Yes, add both", free-fix line; 15:07 "Yes, put them live")
6. **Free trial 300 credits** (was 150). Running trials get 300 at once (the trial total is read from the plan list; credits already
   used stay used); ended trials stay ended. Texts: "Enough for 4 animations, each 10 seconds long (71 credits each, planning included)".
7. **Planning is in the price.** Every Animate/edit card adds a flat 15 credits (plans.ts PLANNING_CREDITS; ledger Nov 19-26: a warm
   answer averages 9 credits, median 8). The plan answers and replaced pictures before Animate are not charged one by one: the first
   plan + 3 changes per animation are free (the card counts down "3 changes left"). A further change costs its warm real cost, never
   more than 20 credits (the card says so before it is sent). Free planning HOLDS its real cost in the balance until that project's
   Animate (so opening project after project is never free planning without end) and always counts toward the daily + trial limits.
   One price: the card's header and the Animate button show the same total (planning + any picture still) = exactly what is charged.
   Edits: the same (planning in the edit price; 3 free refinements). No answer is charged twice (card prices use the planning amount;
   free answers are never charged; paid changes are charged once, as "chat").
8. **The cold rulebook load is never charged to a user** (a charged answer = its warm cost; the rest counts toward the limits only).
9. **Keep-warm + one cold load at a time** (generateV1SonnetTurn.ts): one ~$0.017 call about every 55 minutes when nobody used the
   cache, built by the same request builder as real turns (same cached bytes), booked as "keep-warm", budget refusal respected, one
   log line per check. On by itself only when DIAMOND_PUBLIC_ORIGIN is set; DIAMOND_SONNET_KEEP_WARM=off turns it off. Cold loads:
   the first call loads, calls starting at the same moment wait up to 8 s and then read it.
10. **Out-of-credits card** while an animation is being made: "Your animation will finish. To make the next one, choose a plan." A
    trial with the beta code sees "Your beta price is reserved: 25% off for a full year..." + "Lock it in" -> /plans?code=...
11. **Edit card line** (always on edit cards): "Small fix? Click the frame on the timeline and erase or draw it yourself: it's free."

Not changed: how Sonnet plans, what it says, how pictures/animations are made, what Animate does.

## Option (d) (dad's condition 14:46: "no leaks where we're losing money secretly"; choice left to his session, 15:39)
Of (a) 1 free + 15, (b) 3 free + 20, (c) 1 free + 20, (d) 3 free TEXT changes + 15 with a replaced first picture charged its real
cost, (e) 1 free + 15 + pictures charged: only (d) and (e) keep heavy planners profitable (heavy beta >= $0, heavy full >= 30%,
typical full >= 45%). (d) is the smaller change: chosen. The card says before a change is sent: "A change draws a new first
picture: this one costs N credits." Free plan answers still hold their real cost until that project's Animate.

## TEXT PLAN -> FIRST PICTURE -> ANIMATE (dad + Arthur 15:54, dad 15:57) — branch claude/optional-preview-nov26, on main 895d8f0
- Step 1, the text plan: no picture is made. The card shows the FULL price up front (planning + any still of later / new things) and one
  button "Looks right: show me the first picture" + "Change it". Line: "The first picture is the start of your animation: it's included
  in the price above" (+ how much of it draws later things, when there are any). The first plan + 4 text changes are free, then warm
  cost (max 20), said first. Planning amount 30 (10-second animation = 86): 4 + 30 keeps heavy planners above $0 at the beta price even
  if every answer were as slow as the slowest 1 in 10 (5 + 25 did not).
- Step 2, the first picture: the same engine run as before (H3_GATE_PICTURE), reused by Animate. Then "Animate · N credits" and "Change
  the plan". A change now throws the picture away (charged its real cost, said first) and goes back to step 1; nothing is redrawn until
  the new text is approved. The server refuses Animate before the picture (confirm). A plan with nothing to picture animates at once.
- Verified: the picture runner only runs when the app asks (sitecustomize.py, H3_GATE_PICTURE); the animation run is unchanged and its
  scene is cached by its words, so Animate reuses the picture's scene; the still of later / new things is never used by Animate.

## Editing an animation that exists: two ways (dad + Arthur 16:07, OK 16:09) — same branch
- A change of the moves: the edit card shows "Two ways to make this change": **Fix it yourself, free** (where, from the plan's own step
  timings: "Step 6: about 10.5-13 s, frames about 253-312", how: Take me there opens that frame with the Eraser and Onion skin on; Eraser /
  Brush, frame by frame) and **Remake ...: N credits** saying exactly what is made ("the whole 15-second animation again", or "steps 4-6
  again, the rest stays") from the real price. Recommended: remake (the moves change). The main button reads "Remake · N credits".
- A look the AI can't change (it is refused as before): the reply comes with the same "Fix it yourself, free" card (recommended).
- Adding at the end ("what happens next") is unchanged: no hand fix, priced by the new seconds only.
- Not changed: how edits are made (short animations are still remade whole, longer ones only the changed steps), Sonnet's words/book.
- The frame numbers come from the plan's step seconds at the timeline's fps; H3 follows them closely but not to the picture: said "about".
