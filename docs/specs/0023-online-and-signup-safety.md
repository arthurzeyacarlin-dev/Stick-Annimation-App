# SPEC-0023 — Going online + safe sign-up for kids

Status: PLAN (PM4, 2026-10-13). Nothing built yet. Same workflow as every phase: short plan → Arthur OK → build in an app copy → Arthur reviews → "pass" → main. Nothing goes public and no real payments until Arthur says the whole app is done.

Why: the app only runs on this computer. Before real users and real payments we need accounts and projects on a server, real emails, and a safe sign-up for kids under 13 (the law, COPPA, needs a parent's OK).

## Phase 0 — Two small bugs (quick, no one else needed)
- NEW-PROJECT-LAYER: a new project's empty starting layer is not kept after save + reopen.
- UNDO-AI-SCENE: Undo right after Insert Frame goes back past a whole added AI scene.

## Phase 1 — Look first (read only)
- Read branch `claude/online-beta` (copy `diamond-review/online-beta`, commit `8ef80cd`): what it does, what is missing, how projects upload (≤ 5 MiB parts), what Supabase/Vercel setup it expects.
- Write what dad must set up (keys, addresses) as a short list.

## Phase 2 — Accounts and projects on a server
- Merge the online storage into the app behind a switch (local stays the default). Test sign up, log in, save, reopen, delete account on a fake server first.

## Phase 3 — Real emails
- Resend: welcome, password reset, trial ending (3 days), "your plan renews". Local test inbox stays in development.
- Email verification on sign-up.

## Phase 4 — Under-13 sign-up
- Ask the age first. Under 13: ask for a parent's email; send the parent an approval link; the child's account stays locked (no AI, no marketing, no sharing) until the parent approves. Parent can delete the child's data any time.
- Website legal pages already describe this; the app must do it for real.

## Phase 5 — Payments plumbing (still test mode)
- Stripe webhooks on the server so a paid plan really changes the account; plan change, cancel, failed payment, refund.

## Phase 6 — Problem reports to Arthur
- Every report also emails Arthur (owner address); optional Delete button on the Reports page.

## Phase 7 — Full test + go-live checklist
- Every page, button and purchase on the test site (test mode), written checklist for dad: Stripe live keys, domain, Resend domain, Cloudflare Access. Go live = one switch.

## Dad's list (he does these, never typed into chat)
Database key, `app.diamondanimator.com` address, Stripe live keys + prices, Resend domain, Cloudflare Access on `/admin`, decision on a lawyer for the under-13 flow (risk if skipped), the LLC for the App Store later.
