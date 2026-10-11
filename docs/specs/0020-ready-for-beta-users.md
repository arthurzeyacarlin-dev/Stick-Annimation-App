# SPEC-0020 — Ready for beta users (the app around the AI Animator)

Status: **APPROVED by Arthur 2026-10-11.** Phase 1 PASSED and published 2026-10-11 (D-0185, product commit `0527663`). **Phase 2 is next.** (Written by PM3.)
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

### Phase 2 — Credits, plans and the 14-day trial (Mon Oct 12 – Tue Oct 13)
- Credits instead of tokens: **1 credit = 1 message to the AI Animator**. Trial 150 credits for 14 days; Starter 300, Creator 1,200, Studio 3,000 a month (the website's numbers).
- A credits counter in the header; the AI stops at 0 with a friendly "You're out of credits" card.
- **Trial clock** and a **"Your trial ended"** screen (projects stay safe; choosing a plan unlocks).
- **AI Dashboard** shows credits (keep its bars, red line and dashed line look); "Your plan" shows the real plan and trial days left; no dollar costs shown to users; fix "This week" totals disappearing after a chat.
- The credit check lives in shared account code. The AI Animator's own server file belongs to PM2, so PM2 adds the one-line call to it (Arthur passes the message).

### Phase 3 — Home, menus, help and notifications (Wed Oct 14)
- **Home:** a big "Animate with AI" card (opens a new project with the AI Animator ready); the recent-projects card shows your last saved projects (today it only remembers this visit).
- **Side menu:** new Description (the AI Animator, stick figures, made by Arthur); "Terms of Service" opening the real terms; **Report a problem** that really sends (saved, and emailed once emails work).
- **Guided setup:** either does something useful (shows the AI Animator first) or is removed — Arthur picks.
- **Tutorials:** hide the card until they exist, or 3 short starter lessons — Arthur picks.
- **Notifications:** Arthur's tweaks, plus useful messages (welcome, credits running low, trial ending in 3 days, export finished); "Terra" becomes "the AI Animator" everywhere users see it.
- **Diamond Assistant:** its product knowledge updated to the real app (it describes buttons and a model that don't exist).
- **Export wording:** remove "Phase 3", no "Finder"/"this Mac"; a clear message on browsers that can't save. (GIF or share link: Arthur decides, later.)
- **Buttons:** Arthur's tweaks list.
- **Phones and tablets:** a friendly "Diamond Animator works on computers" screen.

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
