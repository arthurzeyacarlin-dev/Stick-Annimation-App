# Message for Codex (from PM4, 2026-10-13) — copy and paste this whole file to Codex

You are working on **Diamond Animator**, Arthur's animation app (Next.js 16, repo `/Users/arthurcarlin/Projects/stick-animation-app`, GitHub `main`). Arthur is 12, the owner; talk to him in plain, short words and end every report with exactly what he should click to review.

## Read first (in this order)
`AGENTS.md`, `CLAUDE.md`, `docs/SESSION_HANDOFF.md` (top section), `docs/CURRENT_STATE.md` (top entry), `docs/TODO.md`, `docs/specs/0022-app-polish-and-launch-readiness.md`, `docs/specs/0023-online-and-signup-safety.md`.

## State today
- SPEC-0022 (app polish) is done: tutorials removed, learn mode, new tool icons, consistent buttons, AI Animator right-panel tab, dashboard bar/chart from one credit list, phones/tablets (≤ 900 px) layout, Plans screen. Main is clean and pushed (`5ff62c4`).
- The app is NOT live. Payments are fake (Stripe TEST mode). Going online comes later (SPEC-0023).

## Rules you must follow (from AGENTS.md / CLAUDE.md)
- Never build in the main folder. Make a new git worktree under `/Users/arthurcarlin/Projects/diamond-review/<name>` from `main`, symlink `node_modules`, ask Arthur to copy `.env.local` and `.local/` (never read or commit them), add the copy's port to `src/lib/account/accountConfig.ts`, run ONE dev server at a time (8 GB Mac).
- Heavy jobs only through `/Users/arthurcarlin/Projects/diamond-review/harness-phase4/heavy.sh <command>`.
- Do NOT edit PM2's areas: `src/lib/animator/**`, `src/components/workspace/ai/**`, `app/api/ai-animator/**`.
- Do NOT change login/logout, account ownership, saving, user data, usage recording, or the drawing/export engines unless Arthur approves that exact change in chat. If you find a problem there: STOP and report cause + proposed fix + risk.
- No commits to `main`, pushes, deploys, paid AI calls or purchases without Arthur's OK. Work on a branch; tell Arthur what to review; on his "pass" the PM merges and updates `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/TODO.md`.
- Colors: only `var(--da-*)` tokens. Logo stays solid white. Buttons turn `#0066FF` instantly on hover. No "…" in labels. No `window.confirm`. Red/danger buttons: any button class with "danger"/"delete" gets the shared look automatically.
- Arthur hates half-finished reports: every fix must be finished and checked in the real app before you tell him to review.

## Your tasks (in order)
1. **Stress test** the app like a rough beta user: many layers, long timeline (100+ frames), messy huge drawings, Save → Save and Exit → reopen, Undo/Redo spam, tablet and phone widths (Chrome device mode at `localhost:<port>`). Write every problem: what you did, what went wrong, how bad. Fix the small safe ones (layout, wording, a button that does nothing). Report the rest.
2. **Canvas memory plan (plan only, do not build):** the editor keeps 6 canvases each = drawing area × 4.6 × devicePixelRatio (`AUTHORING_WORLD_SCALE` in `src/components/workspace/DrawingCanvas.tsx`); on a retina laptop that is ~1 GB. Saved drawings are stored centered in device pixels, so lowering the size changes how old projects look. Write a short plan: a per-canvas size budget, how old projects keep the same look, and a before/after test on a big saved project. Wait for Arthur's OK before touching code.
3. Known small items: `UNDO-AI-SCENE` waits for the AI Animator merge (do not touch).

## Report format
Start with the answer in one or two plain sentences. Then: what you did, what you checked, what is not done yet (be honest), and the exact clicks Arthur should do to review.
