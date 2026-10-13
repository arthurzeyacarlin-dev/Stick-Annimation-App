# SPEC-0022 — App polish and launch readiness

Status: Phase 1 PASSED 2026-10-13 (`60a0c27`); Phases 2–10 planned. Written by PM4 from Arthur's list. Each phase = short plan → Arthur OK → build in a NEW app copy → test in the real app → Arthur reviews → "pass" → main.

Arthur's rules that apply to every phase: plain words; only buttons/clickable things and charts get boxes; all colors via `var(--da-…)` tokens; logo solid white; hover = blue `#0066FF`, instant; confirmations are in-app boxes (never `window.confirm`); don't touch `src/lib/animator/**`, `src/components/workspace/ai/**`, `app/api/ai-animator/**` (PM2) without PM2's OK; payments stay fake until the last phase.

## Phases (in order)

### Phase 1 — Quick clean-ups (small, safe)
1. **Remove in-app tutorials.** The "Tutorials" button goes away. Help → opens the AI assistant (Help Assistant) directly.
2. **AI dashboard:** remove the extra Back button (the header already has Home).
3. **AI dashboard:** remove the developer TEST CONTROLS.
4. **Settings:** remove "Appearance" (accent colors + Bright mode). The app stays Dark + the blue.
5. **Export:** move the "Export animation" button right next to "Finish the animation, take it with you" (not far right).
6. **Startup screen:** replace "searching for unsaved work…" with a plain dark navy screen and the Diamond logo, big, centered, solid white or semi-transparent, on any screen size.
7. **Notifications:** slide out from the right as a side panel (like the menu slides from the left), instead of a small pop-up box.

### Phase 2 — AI dashboard bars that really work
- The credits bar fills as credits are used and depends on the plan (the same spend fills Basic more than Creator).
- The red line sits at the plan's limit; buying an extra pack lowers the bar a little.
- Remove "inaccurate" wording; every number must be exact or not shown.
- Test with every plan (Basic / Pro / Creator) and with packs, using the fake-payment mode.

### Phase 3 — One look for all buttons
- All delete/warning buttons look the same everywhere (delete account, delete layer, etc.).
- Normal buttons: same size, radius, hover blue.
- Grouped buttons (the "Group by 1 min / 15 min / Hour…" style from the dashboard) become the standard for tab-like choices.
- Build one shared button set, then replace one-off styles.

### Phase 4 — Right panel: AI Animator as its own tab
- Right panel tabs become one connected group: Properties · Library · Assets · **AI Animator**.
- The AI Animator chat moves out of the bottom-right corner into its own full-height tab. The old corner chat is removed.
- **Needs PM2's OK:** the chat component lives in PM2's area (`src/components/workspace/ai/**`). I only move where it is shown; PM2's code stays.

### Phase 5 — Tool icons, more professional
Redraw: **Select** (a real arrow cursor, not bent), **Lasso** (a real lasso loop, not a gun), **Brush** (a real brush; also update the brush on the Home screen), **Eraser** (more polished), **Fill** (a real paint bucket). All icons use theme colors.

### Phase 6 — First-time guided tour
- On the very first open: "Welcome to Diamond Animator" → "Would you like a guided tour?" with Yes, X, and "Don't show again".
- Yes starts a tour: arrows and short tip boxes pointing at the main parts (tools, canvas, timeline, layers, right panel, AI Animator); hovering or clicking a part shows what it does. Can be skipped any time.
- Replaces the old tutorials (Phase 1 removed them).

### Phase 7 — Layers check
- Add layer, hide/show (visibility), delete layer: test everything with 2+ layers; fix what is broken. (Related open item: timeline overlapping right-panel tabs with 2+ layers.)

### Phase 8 — Report a problem
- Confirm where reports go today: the owner-only Reports page (`/reports`, owner emails only). Real email delivery comes with the online phase.
- Make sure Arthur can read each report there with what the person typed.

### Phase 9 — Phones, tablets and computers
- **Rule change to confirm:** earlier decision was "the app is computers-only". Arthur now wants phones and tablets to work and look professional too. Needs Arthur's yes and a look at what's possible (touch drawing, small screens).
- Plan: responsive layout for the home screen, dashboard, settings, and the workspace (tools as a bottom bar, panels as slide-outs). Test at phone, tablet and desktop widths.

### Phase 10 — Plans that really charge (LAST)
- Real Stripe payments for plans and the extra packs. Only after the app and online parts are finished, and dad signs in and adds the live keys himself.

### After this (not in this spec)
Go online (accounts/projects on a server, Stripe webhooks, real emails) → AI Animator merged by PM2 → full bug sweep → one-click go-live → Mac App Store (after dad's LLC).

## Open questions for Arthur
1. Phase 9: confirm the app is now for phones/tablets too (reverses "computers-only").
2. Phase 1.4: remove Appearance entirely (this removes the 7 accent colors and Bright mode he approved on 2026-10-11) — confirm.
3. Phase 4: OK to ask PM2 to allow moving the chat into the tab.
