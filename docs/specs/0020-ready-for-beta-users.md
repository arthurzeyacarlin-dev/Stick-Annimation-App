# SPEC-0020 — Ready for beta users (the app around the AI Animator)

Status: **APPROVED by Arthur 2026-10-11.** Phase 1 PASSED and published 2026-10-11 (D-0185, `0527663`). Phase 2 PASSED and published 2026-10-11 (D-0186, `7049ab3`). Phase 3 PASSED and published 2026-10-11 (D-0187, `9c55342`). **Phase 4 is next.** (Written by PM3.)
Owner: Arthur · Builder: Claude (PM3) · Launch: **Tuesday, October 20, 2026**
Baseline: `main` at `22efcf2`
Not in this spec: the AI Animator engine and Luna (PM2, SPEC-0019), and the website (SPEC-0018).

## 1. Goal

A beta user can sign up, get a 14-day trial with credits, find the AI Animator right away, manage their profile, see their credits, get help, and never hit a button that does nothing or words that are out of date. Beta users will mostly use the AI Animator, not hand-drawing (Arthur, 2026-10-11), so their path comes first and the drawing workspace gets only its small fixes.

## 2. What the app does today (checked in the real app, 2026-10-11)

- **Sign-up** asks new users to "Pick a test plan" (Starter/Creator/Studio Preview) and says "Password recovery isn't available yet."
- **Profile menu** shows only name, email, "Creator Preview — No paid plan or real allowance" and Log out.
- **Side menu:** Description is old text ("Diamond Animator Pro", plugins, overnight processing); "Terms of Policy" (wrong name); Settings says "not available yet"; Report a Problem does nothing when clicked.
- **AI Dashboard** counts tokens with a "weekly preview limit: 10,000 tokens" that charges nothing and stops nothing; "Your plan: No paid plan yet"; "Change plan (not available)", "Top up (not available)"; shows an estimated AI cost in dollars.
- **Home** has no way into the AI Animator. After a reload it says "No recent projects edited" even when a saved project exists (Open Project shows it).
- **Guided setup** (welcome pop-up) lets you pick a goal, then nothing changes.
- **Help:** the Assistant works; Tutorials say "Coming later."
- **Editor:** File menu works; Edit, View, Window and Help menus do nothing. The AI Animator panel says "Creating and editing frames comes later" (PM2's work brings that).
- **Notifications:** the bell opens an empty list ("No unread notifications").
- **Phones:** the app opens on a phone with no "computers only" message.
- **Wording:** several screens say the account and work "stay on this computer."
- **Code check (read-only helper):** the dashboard likely hides "This week" totals after any chat (every AI record is marked "partial"); notifications and errors still say "Terra"; the Assistant's product knowledge is out of date (buttons and model that don't exist); Export shows "Export · Phase 3", says "Finder"/"this Mac", saves MP4 only and only in Chrome; export notifications never fire; the editor's only way out is "Save and Exit" (stuck if a save fails) and closing the tab gives no "unsaved work" warning; `/dev/*` pages show if the beta runs in dev mode.
- **Online:** none of the online work (branch `claude/online-beta`) is on `main`; no trial, no credit limit, no payment link.

## 3. Phases

Each phase is built in its own app copy, Arthur reviews it, and only on his OK: commit, push to `main` on GitHub, and update the docs (CURRENT_STATE, TODO, SESSION_HANDOFF, DECISIONS). The days are a plan, not a promise.

### Phase 1 — Account and profile (Sun Oct 11) — PASSED, published (`0527663`)
- **Profile circle** (header): your picture, or your first letter; a dim outline that glows #0066FF on hover (Arthur). Its menu: name + email, **Profile**, **Log out** (Arthur removed AI Dashboard, Settings and Help from it: they are already on the main screen).
- **Profile page** (`/account`): add / change / remove a picture (resized in the browser to a small square JPEG, stored with the account); change display name; change password (logs other devices out); **Settings** (for now one switch: show the welcome screen again; saved in the account's preferences); **Delete my account** (password + "I understand"; projects marked deleted like the library's Delete, the account's saved app records removed, then the account).
- **Forgot password?** on Log in → reset link (1 hour, one use, logs out everywhere). Until dad's email service exists, emails go to a local test inbox: `/dev/mail` (development only).
- **Sign-up**: no "Pick a test plan" step (2 steps). New accounts get the old preview plan value until Phase 2 replaces it.
- Side menu: "Terms of Service" (was "Terms of Policy"); Settings opens the Profile page's settings.
- Not in Phase 1 (later phases): Report a problem (Phase 3); the plan line in the profile menu (Phase 2); real emails (Phase 5).

### Phase 2 — Credits, plans and the 14-day trial (Sun Oct 11) — PASSED, published (`7049ab3`)
- **Free trial:** every account gets 14 days and 150 AI credits the first time it is seen (existing accounts start fresh, never locked at once). **1 credit = 1 AI Animator message that gets an answer**; failed or stopped messages are free; the same job never counts twice. The Help Assistant and voice typing are free (Arthur's OK on PM3's recommendation).
- **The AI stops at 0:** the credit check runs before a message starts (it never reaches the AI) and the chat shows a friendly message. Lives in `src/lib/ai/aiAnimatorJobService.ts` (constructor's 3rd argument, default = the real credit store) — **PM2 must keep it when porting the engine.**
- **Credits counter** in the editor's top bar (amber when low, red at 0). Arthur removed the header version (the AI Dashboard link is already there).
- **"Your free trial has ended"** screen: Choose a plan, Profile, Log out. Home, AI Dashboard and Assistant lead there; `/plans` and `/account` stay open. Projects are safe.
- **Plans page** `/plans`: Starter $5.99 / 300, Creator $11.99 / 1,200, Studio $19.99 / 3,000 credits every 30 days. In development "Choose" switches the plan with no payment (labeled Test mode); elsewhere "Payments open soon". Real payments: Phase 5.
- **AI Dashboard** (Arthur's layout): next refill / trial end in big text at the top; plan line + Choose/Change plan; one plain row of numbers (credits left, credits used, tokens, sent/written, estimated cost, web searches); credits meter (Arthur kept it); chart in its card with joined Show / Group by controls; no Refresh button. **Rule (Arthur): only clickable things and the chart get boxes.** Profile page got "Your plan" and lost its boxes.
- Storage: `.local/spec0015-phase3/account-plans.sqlite` (plan + one row per answered message). Development test switch: `/dev/plan`.
- Fixes found on the way: the AI Animator reply checker showed a red error box when a background read failed (now: logged out → stop, else retry in 5 s); `auth.ts` loads server-only helpers inside its hooks so `npm exec -- auth migrate` works again.

### Phase 3 — Home, menus, Settings, notifications (Sun Oct 11) — PASSED, published (`9c55342`)
Arthur replaced the planned list with his own (several review rounds):
- **Home:** empty recent card shows the editor's Brush icon; "+" lifted; Open Project / Help: big icon column on the left, title + subtitle to the right (tuned smaller and further left).
- **Side menu** slides in from the right; its close X has no box; "Diamond Animator Pro" → "Diamond Animator" everywhere.
- **Settings page** `/settings` (separate from Profile and the plan): **Appearance** — Dark / Bright and 7 accent colors (Diamond blue, purple, green, orange, pink, red, teal) that recolor the whole app in both modes; **Notifications** — sound on/off, volume (quiet/normal/loud), ring the bell; **New projects** — frames per second (12/24/30). Arthur rejected "layout-only" settings (reduce motion, show credits, welcome screen): every setting must change something real.
- **Appearance engineering:** the core palette (~1,100 typed-in colors in 35 files) now uses the shared `--da-*` tokens with the old colors as fallbacks, so Dark + Diamond blue is unchanged; `app/themes.css` is generated (script in the PM3 session scratchpad: hue-shifted palettes per accent, light versions for Bright) and set on `<html data-theme data-accent>` from a cookie (no flash). The logo stays solid white: in Bright the top bar is a darker accent shade with white text (hover = bright accent), and on other light backgrounds the logo sits on a small dark tile. The editor and the AI Animator panel follow through `workspaceTheme.ts` (no PM2 files edited). The drawing canvas and drawing colors never change.
- **One global Back control** (an arrow, no box) and **one close X** (no box) on every screen.
- **Profile circle:** no picture → the whole circle turns the accent on hover; with a picture → only the outline glows.
- **Notifications:** the bell rings left-right (the header had a rule blocking every animation); a "ding ding" plays once per notification on every page, the editor too, following Settings; count dots green (good) / red (bad) / blue (update), side by side for two kinds, a triangle for three; opening the bell fades the dots, closing it marks everything read (no "Mark all as read"); "internet lost" stays next to "internet restored"; "Terra" is shown as "AI Animator".
- **Not done (later):** blue "update" notifications need a producer (detect a new version once online — Phase 5); content-policy blocking with a user notification and an email to Arthur; the Phase 3 items Arthur didn't ask for this round (Animate with AI card, Report a problem, Assistant knowledge, export wording, computers-only screen) move to Phase 4's list for his choice.

### Phase 4 — Workspace small fixes (Thu Oct 15 – Fri Oct 16)
- Arthur's list of tiny workspace things (he gives it at the start of the phase).
- Edit / View / Window / Help menus: make the basics work (Undo, Redo, Zoom, Help) or remove the empty ones.
- A way back to Home without saving (with an "unsaved work" warning), and a warning when closing the tab with unsaved work.
- Known bugs: a new project's empty layer disappears after reopening; Undo after Insert Frame goes back past an AI scene. Faster Save only with Arthur's separate OK (saving is protected).

### Phase 5 — Online and launch rehearsal (Sat Oct 17 – Mon Oct 19)
- Bring the online work (`claude/online-beta`) into `main`; the app on app.diamondanimator.com (dad: database key, address).
- Stripe test mode → the app knows who paid and gives them their plan.
- Real emails (welcome, forgot password, trial ending).
- The beta runs as a production build, so developer pages (`/dev/*`) are hidden.
- All "on this computer" wording becomes "your account."
- Full beta-user test on the real address: website → sign up → trial → AI Animator → save → export → pay (test mode). Then the website's trial buttons are switched on (with Arthur's OK).

## 4. Not changing
- The AI Animator engine, Luna, and their files (`src/lib/animator/**`, `src/components/workspace/ai/**`, `app/api/ai-animator/**`) — PM2.
- The drawing and export engines, the saved project file format, and how projects are stored.
- The website (except flipping its trial buttons in Phase 5, with OK).

## 5. Safety
- Login, accounts and usage records are protected systems; this spec is the plan that allows the changes listed above and nothing else.
- No paid AI calls, purchases, deploys, commits or pushes without Arthur's OK. Dad types every password and key.
- Each phase: automated tests + a real-app check in the app copy (heavy jobs through `heavy.sh`, one dev server) before Arthur reviews.

## 6. Decisions Arthur makes along the way
1. OK this spec (Phase 1 starts right after).
2. Guided setup: make it useful or remove it (Phase 3).
3. Tutorials: hide or 3 starter lessons (Phase 3).
4. His button, notification and workspace tweak lists (Phases 3–4).
