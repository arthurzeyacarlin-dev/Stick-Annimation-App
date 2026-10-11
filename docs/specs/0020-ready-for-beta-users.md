# SPEC-0020 — Ready for beta users (the app around the AI Animator)

Status: **APPROVED by Arthur 2026-10-11.** Phase 1 PASSED and published 2026-10-11 (D-0185, `0527663`). Phase 2 PASSED and published 2026-10-11 (D-0186, `7049ab3`). Phase 3 PASSED and published 2026-10-11 (D-0187, `9c55342`). Phase 4 PASSED and published 2026-10-11 (D-0188, `44eae38`). **Re-planned 2026-10-11 after a full check of the app:** Phase 5 (Projects and Export) and Phase 6 (Words, help and menus) are new; going online, payments, the App Store and tutorials wait until the whole app (AI Animator too) is done. Phase 5 PASSED and published 2026-10-11 (D-0189, `9d398e7`). Phase 6 PASSED and published 2026-10-11 (D-0190, `968bd3e`). Phase 7 PASSED and published 2026-10-11 (D-0191, `d316b80`). **Next: Arthur picks — the drawing-lag round or the website.** (Written by PM3.)
Owner: Arthur · Builder: Claude (PM3) · Launch: **only when the whole app is done** (was Tue Oct 20, 2026; Arthur re-planned 2026-10-11)
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

### Phase 4 — Workspace (Sun Oct 11) — PASSED, published (`44eae38`)
Arthur's list, four review rounds:
- **Menus:** Edit / View / Window / Help do real things (Undo/Redo, Insert Frame/Keyframe/Blank, Copy/Paste/Remove Frame, Zoom in/out/reset, Onion Skin, Play, Properties/Library/Assets, New/Delete Layer, Ask the Assistant, Keyboard Shortcuts). File shows its shortcuts. Shortcuts: ⌘S, ⇧⌘S, ⌘E, ⌥⌘S, ⌘Z, ⇧⌘Z/⌘Y, ⌘=, ⌘-, ⌘0, F5, F6, F7, Enter.
- **Top bar:** the "150 credits" badge is gone from the editor.
- **Layers:** Layer and Onion skin are bare symbols (accent on hover) with hover names; every bottom tool shows its name on hover. With 2+ layers each layer has an eye (hide/show; a line through it when hidden; hidden layers leave the canvas and playback; not saved yet) and a trash button; frames move right to make room. Delete Layer opens an in-app "Delete layer?" box (Cancel blue, Delete red on hover), deletes the right-clicked layer, swaps the only layer for a fresh one, Undo brings it back. Other layers show while you edit.
- **Timeline:** no gaps — Insert Frame on an empty cell adds one frame right after the previous span (no "fat frame"), a keyframe goes right after it, a blank keyframe counts as a frame. **Drawing on a cell with no frame** makes a blank keyframe right after the previous frame (or the first frame) and keeps the drawing there (it used to be erased). FPS: plain number, click and type, 1–60 (contract limit 55 → 60).
- **Canvas:** navy around the stage; accent outline on the drawable area, hidden while playing.
- **Fill:** tolerance works on the visible colors; fills under line edges (no white gaps); never floods the world when clicked outside a closed shape.
- **Lag (first step):** the stroke preview only repaints changed tiles; selection debugging only with its flag; a lost pointer capture keeps a resize/move instead of undoing it.
- **Not done (later):** the big-canvas lag round (authoring canvases 4.6× world size); unsaved-work warning on Home / closing the tab; NEW-PROJECT-LAYER and UNDO-AI-SCENE bugs; saving layer visibility; Clear Canvas and stroke-error pop-ups → in-app boxes; the Phase 3 leftovers.

### Re-plan (Arthur, 2026-10-11)
After Phase 4 PM3 clicked through every screen except the AI Animator and a helper read the code (about 35 unfinished or broken things). Arthur's decisions:
- **The App Store, going online and tutorials come only when the whole app is 100% done** (AI Animator included). Tutorials are last; Arthur may record the videos himself.
- A proposed "editor safety" phase (unsaved-work warning, Undo fixes) was dropped: the app already offers "Unsaved work found → Recover Work" after a reload. Its real bugs stay on the later list (TODO EDITOR-BUGS).
- **Guided setup is removed** (maybe in Version 2).
- **Export also makes GIFs and pictures**, not only MP4 video.
- Changing your email: not decided; not in these phases.

### Phase 5 — Projects and Export (simple, like a real professional tool) — PASSED, published (`9d398e7`)
- **Export screen redesigned:** simple and professional. Pick a format — **Video (MP4)**, **GIF**, or **Pictures (PNG)** (the current frame, or every frame) — then the size/destination and quality, then Export. No techy lines ("Canvas 1280×720; content at (0, 0)", "Catalog 2026-09-20", "local guidance only"), no "Phase 3", no "Finder" / "this Mac"; the destinations show their names (not "YT", "TT" letter boxes); the back control is the plain arrow.
- **Export preview** shows and plays the real animation (it stayed blank and stuck on frame 1 in the check).
- **Saving the file:** works in Chrome with a save window; other browsers get a normal download instead of an error.
- **Export from the editor** offers to save first, and opens with the project you're working on.
- **Home "recent projects"** shows your last saved projects from your account (today it forgets them on reload and says "No recent projects edited").
- **Open Project:** plain words (no "Preparing exact poster…", "Protected legacy source", "saved in this browser"), no technical ID in the Delete box, real lengths for short animations (not "0:00"), Escape closes its menus.
- The MP4 video engine itself is not changed; GIF and PNG are new outputs built from the same frames.
- **Found in Arthur's review:** the app has no sound yet, so "with sound" was removed; the browser inside the Claude app has a broken save window (it cancels, refuses to write, or hangs), so exports there always download to the Downloads folder; the Video / GIF / Pictures buttons use the app's normal hover (accent fill, white text).

### Phase 6 — Words, help and menus — PASSED, published (`968bd3e`)
- **Report a Problem works:** a short form (what happened, which screen, optional screenshot). Each report is saved to the account server and appears in an owner-only **Problem reports** inbox in the app (only Arthur's account can open it; newest first; mark as done) and rings Arthur's bell. When real emails exist (the "last" step), each report is also emailed to Arthur.
- **Description** rewritten with Arthur (no plugins, packs or "overnight processing").
- **Help Assistant's knowledge** updated to the real app (real buttons and paths; Settings and menus are real; projects save to your account; dictation exists).
- **Wording:** every "this computer / this device / this browser" that is wrong becomes "your account" (sign-in page, Assistant chats, save status tooltip, etc.).
- **Guided setup removed.**
- **Library panel** explains how to make a symbol when it is empty.
- **Help page** back arrow in the normal place; Tutorials card stays "Coming later" until the last step.
- **Phones and tablets:** a friendly "Diamond Animator works on computers" screen.
- **Found in Arthur's review:** reports always stay, even if the sender deletes their account; only the owner's account can read them (checked on the server); a red "ChunkLoadError" after an update now reloads the page once instead; the plain 404 became the app's own "This page isn't here" page. Emailing each report to Arthur waits for real emails (the last step).

### Phase 7 — Editor fixes (Sun Oct 11, ~30 min) — PASSED, published (`d316b80`)
- **Undo:** Insert Frame / Keyframe / Blank Keyframe and New Layer are their own Undo steps (⌘Z removes the new frame or layer and keeps the drawing; ⇧⌘Z brings it back). Strokes made before a timeline change undo together.
- **Hidden layers remembered** after reopening (saved as editor-only data; exports still include every layer).
- **"Empty layer disappears":** the layer was never lost — the reopened timeline started folded to one row. Projects with 2+ layers now open unfolded.
- **In-app boxes:** Clear Canvas asks "Clear this frame?" in the app; stroke/fill/resize problems show a short in-app notice (no browser pop-ups). Danger buttons have red text + red outline and turn fully red on hover (Arthur).
- **Escape** closes the File menu.
- **Not done:** the drawing-lag fix (big canvases; drawing engine) — its own careful round.

### Later list (Arthur picks when)
- **EDITOR-BUGS:** done in Phase 7 except the big-canvas lag fix (drawing engine — its own round).

### Last — only when the whole app is done
- Online: accounts and projects on the server (`claude/online-beta`), app address (dad: database key, address), production build (developer `/dev/*` pages hidden).
- Real emails (welcome, forgot password, trial ending, problem reports to Arthur).
- Payments (Stripe for the website; Apple's rules inside the App Store app — dad decides).
- The Mac App Store (Apple Developer account in dad's name, Apple review).
- The website updated with the finished app; tutorials (Arthur's videos).
- Full new-user test before anything goes public.

## 4. Not changing
- The AI Animator engine, Luna, and their files (`src/lib/animator/**`, `src/components/workspace/ai/**`, `app/api/ai-animator/**`) — PM2.
- The drawing engine, the saved project file format, and how projects are stored. The export engine only gains GIF and PNG outputs (Phase 5, Arthur 2026-10-11); MP4 stays as it is.
- The website (until the last step).

## 5. Safety
- Login, accounts and usage records are protected systems; this spec is the plan that allows the changes listed above and nothing else.
- No paid AI calls, purchases, deploys, commits or pushes without Arthur's OK. Dad types every password and key.
- Each phase: automated tests + a real-app check in the app copy (heavy jobs through `heavy.sh`, one dev server) before Arthur reviews.

## 6. Decisions Arthur makes along the way
1. OK this spec (Phase 1 starts right after).
2. Guided setup: make it useful or remove it (Phase 3).
3. Tutorials: hide or 3 starter lessons (Phase 3).
4. His button, notification and workspace tweak lists (Phases 3–4).
5. Re-plan 2026-10-11: guided setup removed; GIF + pictures export yes; email change undecided; App Store, online and tutorials only when the app is done.
