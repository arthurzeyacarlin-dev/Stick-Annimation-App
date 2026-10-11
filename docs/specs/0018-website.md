# SPEC-0018 — The Diamond Animator website (diamondanimator.com)

Status: **APPROVED by Arthur 2026-10-08 — building.** Nothing is changed in Cloudflare/Stripe or published until Arthur/dad say so.

## Arthur's decisions (2026-10-08, override anything below)

- **Beta deadline: October 20, 2026** (not November 30) — with a live countdown timer.
- **Weekly plans, 3 to choose from** (Arthur likes weekly). Draft prices: his own idea of **$10 / $15 / $20 a week** — easy to change in one file until dad confirms. (Claude's research note stays below: no other desktop/web tool sells weekly.)
- **After the 14-day free trial: locked out** unless they subscribe (no free mode).
- **Look: exactly the app's colors** — navy backgrounds, the dark-blue outlines, the bright blue; buttons turn the cool blue `#0066FF` with white text instantly on hover, no fading. Same for funnels and every page.
- Build everything dad asked for (pages, lead-magnet funnel, tracking, admin reports, legal, beta offer) and show Arthur all of it when done.

## Why (the message, in Arthur's words)

- **Built by an animator, for animators.** Arthur struggled with animation for years — he'd start excited, spend weeks to make something he didn't like, and it took years to get good. He realized there had to be a better way, but there wasn't — only complicated tools. So he built the AI Animator to do it fast, for them: think of an idea, say it, watch it come to life.
- **This is just the beginning.** Version 1 is stick figures; versions 2, 3 and 4 bring more complicated, better scenes and more than stick figures.
- He's 12 and has been building it for about a year (the origin story).
- Keep from today's site: "Animate your ideas faster with AI", "Create. Animate. Dominate.", the pains (too slow, too confusing, too hard to finish), the YouTube channel "Animator Builder", the beta date (November 30, 2026 — confirm).

## Look (Arthur's rules)

- The app's own colors: page `#030914`, panels `#071120`, borders `#244267`, selected `#0f2a52`, text `#f6f9ff` / `#c9d6ea` / muted `#8fabd0`, labels `#7895bc`, accent `#8cbbf3`; the app's font (system UI stack, Geist available); the Diamond logo from the app.
- **Every button turns bright blue `#0066FF` with white text INSTANTLY on hover and back instantly — no fade, ever** (the app's rule).
- Real visuals: screenshots of the app, and **real animations made by the engine turned into short looping clips** (no fake mock-ups).

## Pages

1. **Home** — headline + the pain → the promise; a live demo clip ("type it → watch it"); how it works (3 steps); what it makes (moves, powers, effects, backgrounds); origin story teaser; "just the beginning" roadmap; beta spots bar; pricing teaser; FAQ; final call to action.
2. **How it works / Features** — the AI Animator chat, key poses and the 12 principles done for you (anticipation, ease, follow-through, weight), editing ("make it slower"), drawing tools, export.
3. **Pricing + comparison** — 3 plans, a full comparison table, AI credits, 14-day free trial, the beta offer; every bullet a benefit/pain-solving point-of-sale bullet.
4. **Beta** — first 50 users: 40% off the first year; live "spots left" bar (real count, never faked).
5. **Our story** — Arthur's origin story (built by an animator, for animators), dad's role, the YouTube channel.
6. **Roadmap** — V1 stick figures → V2/V3/V4 (honest, no dates promised that we can't keep).
7. **FAQ**, **Contact**.
8. **Legal** — Terms of Service, Privacy Policy, Cookie Policy, Refund & Cancellation, Acceptable Use (incl. AI use), Children's privacy (COPPA — users may be under 13; parents pay), DMCA/Copyright, AI-credits terms. **Drafts until a lawyer checks them.**

## Funnel and tracking

- **Lead magnet pop-up** (exit-intent / timed, easy to close, never on legal pages) → email → the free trial → paid.
- **Every step tracked:** ad click (UTM, Facebook `fbclid`, Google `gclid`) → visit → pop-up shown → email given → trial started → paid → plan; CTR and drop-off per step; ROAS per campaign (ad spend from Facebook/Google). Meta Pixel + Conversions API and the Google Ads tag, **only after cookie consent**.
- **Admin reports** at `admin.diamondanimator.com` (Arthur and dad only, behind Cloudflare Access): funnel per step, campaigns, ROAS, beta spots, trials, revenue.

## How it's built (recommended)

- A separate website project (not inside the desktop app's code), hosted on **Cloudflare Pages**; forms, events and reports on **Cloudflare Workers + D1**; spam protection with **Turnstile**; payments with **Stripe** (Checkout, customer portal, webhooks); an email service for the lead magnet (dad picks).
- Accounts (Cloudflare, Stripe, email, ads) are in **dad's name**; Claude never types passwords or card details — dad signs in.
- Claude asks before every change people outside can see (DNS records, going live, Stripe settings).

## Pricing

Research (2026-10-08, ~20 tools, sources and dates in `docs/research/2026-10-08-website-pricing-research.md`; every price to be re-checked on the live sites before it goes on our website):

- **No web/desktop animation tool sells weekly plans** — only phone apps do, and weekly subscribers rarely stay (5.5% after a year vs 19.9% yearly). $10 / $15 / $20 a week = about $43 / $65 / $87 a month ($520–$1,040 a year): more than Adobe Animate ($264/yr), close to Vyond, a business tool. **Recommendation: monthly + yearly.**
- What people pay today: kids/teens — Pivot free, Stick Nodes Pro $3.99 once, FlipaClip Plus $5.99/mo or $29.99/yr; creators — Adobe Animate $22.99/mo, Toon Boom from $31/mo, Moho $59.99 once; business AI-video — $15–$200/mo. AI is sold as monthly credits plus top-up packs.

**Recommended plans (Arthur's and dad's decision):**

| Plan | Monthly | Yearly | AI credits / month | Worst-case AI cost to us |
|---|---|---|---|---|
| Starter | $5.99 | $49 | 300 | $0.75 |
| **Creator** (most popular) | $11.99 | $99 | 1,200 | $3.00 |
| Studio | $19.99 | $169 | 3,000 | $7.50 |

- 1 credit = 1 message to Luna (~$0.0025 each). All paid plans: no watermark, post anywhere (incl. monetised YouTube). Creator adds all effects + unlimited projects; Studio adds 4K, client-work licence, early access beyond stick figures.
- Credit packs: 500 for $4.99, 1,200 for $9.99, 3,500 for $24.99 (12 months; the paying parent buys).
- **14-day free trial:** Creator features, 150 credits (≤ ~$0.38 to us), no card needed, "Ask a parent" checkout at the end. To decide: a free mode after the trial (keep projects, watermarked exports, ~20 credits/month) instead of locking kids out of their work.
- **Beta — first 50 paying users, 40% off year one:** yearly $29.40 / $59.40 / $101.40, monthly $3.59 / $7.19 / $11.99 for 12 months; a spot counts only when someone pays; the renewal price is shown clearly, with a reminder email 7 days before.
- Show yearly first ("save ~30%"), the middle plan marked "Most popular"; prices sit next to ones parents know (Roblox Premium $4.99/$9.99/$19.99).
- Before launch: the lawyer checks sign-up for under-13s (COPPA as updated 2026-04-22: a parent's consent; a parent's card payment is one accepted way).

## Order of work

1. Arthur/dad OK this plan → 2. Cloudflare: DNS moved, Pages project, `admin` subdomain → 3. site pages + copy + real clips → 4. funnel + tracking + admin reports → 5. Stripe plans + trial + beta offer → 6. legal drafts → 7. review → 8. go live (OK first).
