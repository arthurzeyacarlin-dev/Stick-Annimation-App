# Online readiness — what exists and what is missing (PM4, 2026-10-13, SPEC-0023 Phase 1)

Read only. Nothing in the app changed.

## What exists: branch `claude/online-beta` (commit `8ef80cd`, 2026-10-08)
Built from `22efcf2` (before SPEC-0020). When `DATABASE_URL` is set the app can run on Vercel + Supabase; with no `DATABASE_URL` everything stays on this computer exactly as today.
- **Login on a real https address** (`BETTER_AUTH_URL`, `APP_ORIGINS`); better-auth tables on Postgres.
- **Account data store** (`accountDataStore.ts`) and **AI usage records** (`accountUsageStore.ts`) on Postgres.
- **Projects** upload/download in signed parts ≤ 5 MiB (under Vercel's body limit) to a private Supabase Storage bucket (`projectStorageCore.ts`).
- **AI jobs** (AI Animator, Assistant, dictation) shared across server copies, kept alive with `after()` (`sharedJobStore.ts`, `postgresSharedJobStore.ts`).
- Migrations in `supabase/migrations/20261008_*` (applied to the Supabase project "Diamond Animator Live"); tests included.

## What is missing (because main moved on after Oct 8)
Main now has stores the branch has never seen. They still use local SQLite files and must get a Postgres version before the app can run online:
1. **Plans, credits, trial, packs, billing state** — `src/lib/account/aiCredits.ts` (tables `account_plan_v1`, `account_credit_use_v1`, Stripe ids, payment grace, refill dates). Biggest gap: without it nobody can have a plan online.
2. **Problem reports** — `src/lib/account/problemReportStore.ts` (and screenshots).
3. **Stripe test-mode billing** needs a public webhook address (`stripeBilling*.ts`): today it relies on a check when the dashboard opens; online it needs real webhooks and the signing secret.
4. **Mail** — `accountMail.ts` writes to a local outbox; online it must send through Resend.
5. **Profile pictures / avatar** storage (check where the image lives; a data URL in the account row is fine for small images, a bucket is better).
6. **Branch merge work:** the branch touches 38 files; `app/api/ai-animator/**` and `src/lib/ai/aiAnimatorJobService.ts` are PM2's area (SPEC-0021 changed them), so the merge must be done with PM2 after the AI Animator lands.

## What Arthur's dad must set up (never typed into chat)
- Supabase project key(s) / `DATABASE_URL` (his account), and the private bucket from the migration.
- Vercel project + the address `app.diamondanimator.com` (domain on Cloudflare), env vars `BETTER_AUTH_URL`, `APP_ORIGINS`, `BETTER_AUTH_SECRET`.
- Resend: verified sending domain + API key (also needed for the website).
- Stripe: live keys + the 6 plan prices + packs (test keys first), and a webhook endpoint to `…/api/billing/webhook` with its signing secret.
- Cloudflare Access on the website's `/admin`.
- A decision on a lawyer for the under-13 flow (his earlier call: no lawyer; flag the risk once more).

## Recommended order for Phase 2
1. Port `aiCredits.ts` to the same store pattern the branch uses (Postgres when `DATABASE_URL`, SQLite locally) + migration + tests.
2. Port `problemReportStore.ts` the same way.
3. Bring the rest of the branch onto current main in a new copy (after PM2's merge for the AI files).
4. Mail via Resend, then webhooks, then the under-13 flow.
