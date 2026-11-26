# Going online at app.diamondanimator.com — checklist (Nov 25, D-0255)

## EVERYTHING LEFT BEFORE GOING LIVE (Nov 26 09:15 — show this to dad)
Done today: server rented + app moved (49 accounts), Mac runs nothing; make / edit / Help / save / phone / card form / password
email all pass on the server; live payments; discount codes FIRSTDIAMOND (25% first year) + DIAMOND10 (10% first month) pass;
down alert (DigitalOcean uptime -> Arthur's Gmail); Klaviyo flows skip deleted accounts; nightly + weekly backups.
**Arthur (now):** A) copy the Stripe webhook secret + run the one command (then Claude switches the webhook on and tests it);
B) say "program" for dad's new features; C) say "commit and push" for today's script fixes.
**Dad's new features (dad's session builds, after Arthur's "program"):** 1) support: help bubble bottom-right, ticket queue Arthur
answers, instant alerts, Claude reads tickets, status page + outage banner; 2) testimonials at the happy moment + profile photos +
testimonial wall; 3) emails: months of follow-up, origin story for app sign-ups, paying-customer emails; website sign-ups -> Klaviyo.
**Must-dos found by the business check:** 4) KIDS + LAW (COPPA): under-13 users need parent consent rules; no lawyer has checked
the children's page — dad decides; 5) the launch email that sends FIRSTDIAMOND to the first 50 reservers at Dec 1 (promised on the
website; the website already HAS the sender, functions/api/admin/launch-email.ts, but Cloudflare Pages has NO variables at all:
needs BETA_CODE=FIRSTDIAMOND, RESEND_API_KEY, UNSUBSCRIBE_SECRET + Cloudflare Access for /admin — CF_ACCESS_TEAM_DOMAIN,
CF_ACCESS_AUD, ADMIN_EMAILS; website lead emails likely not sending either); 6) trial promise: the first AI answer after a quiet
hour can cost ~36 credits (cap at 15 = one line, dad's OK); 7) DONE 09:21: 3 strangers pressed Animate at the same moment on the
server, all 3 done (longest 2 min 42 s), each paid only their own credits; 8) DONE 09:21: a test email to
support@diamondanimator.com shows Delivered in Resend (someone with the IONOS login: check it is in the inbox); 9) FAL_ADMIN_KEY so
the app warns before fal money runs out (auto top-up is on).
**Dad's choices:** SERVER SPEED — joint recommendation (09:48, both sessions): launch on the current 4 vCPU server; resize only
when real waits show (5 min, reversible). fal ran all 4 clips at once (not capped at 2); the limit is the server CPU. Option if dad
prefers to be safe on day one: resize the droplet to 8 vCPU / 16 GB (~$96/month, ~5 min, accounts
stay) before Dec 1, then Claude sets DIAMOND_ANIMATIONS_AT_ONCE=4 and re-times it. Measured on the 4 vCPU server: 2 at once ~1.5 min
each (~80 animations/hour); 4 at once all done but CPU load 17, last one 3 min, so no faster; 50 people at the very same second =
~35 min for the last one. Later, with hundreds of users: auto-scaling workers (new code). Klaviyo paid plan (free = 250 contacts / 500 sends a month); off-server backup (~$5/month); may Claude fix the
live app during an outage without asking; Google sign-in; sales tax setting in Stripe.
**Dad's test:** one real payment + refund. **Then:** one final full check on app.diamondanimator.com -> Dec 1 00:00 US Central
the website switches itself -> LIVE.
Nice later: stop many free trials by one person; error tracking.

**(Nov 26 08:44) LIVE ON THE SERVER.** app.diamondanimator.com = DigitalOcean droplet `diamond-app` 45.55.215.235 (NYC3, 4 vCPU /
8 GB / 160 GB, weekly DO backups + the nightly backup cron). Cloudflare `app` = A 45.55.215.235, DNS only (Caddy's own Let's Encrypt
certificate). Arthur's Mac runs NOTHING for the app any more (app, store, tunnel, keep-awake stopped; its data copies are kept untouched
as the fallback). Moved: 49 accounts (6 account files incl. the sign-in secret) + 12 project-store rows / 70 project files. Proven on
the server: a real animation (sign-up, card, first picture, animated in 90 s); over https: sign-up (Secure+HttpOnly cookie), 150
trial credits, password email Delivered (Resend), live payment keys. Steps 4-8 below are DONE. Left: 9 (stranger walk-through by
dad's session), 10 (dad's real payment + refund). Update the server later: `ssh root@45.55.215.235`, `cd /srv/diamond-app && git pull
&& docker compose -f deploy/docker-compose.yml up -d --build`.

(Nov 25 evening) Live from Arthur's Mac through a tunnel; the server is not rented yet. Dad's rules: I test everything myself on the real address first; he only does
what truly needs him, and I open every page in Chrome so he only clicks.

## Done and checked
- **The app knows its public address** (`DIAMOND_PUBLIC_ORIGIN=https://app.diamondanimator.com`): only that https address
  is trusted; unset = this Mac exactly as before. Tests: `src/lib/account/accountConfig.test.ts` 4/4, and every
  account, money and email test passes in both modes.
- **The server kit** (`deploy/`): Dockerfile (app + the engine's Python 3.9 with the Mac's exact packages), docker-compose
  (app + Caddy), Caddyfile (https), server-setup.sh (Docker, firewall, nightly account backups), engine-sync.sh (copies the
  engine code ~810 MB straight to the server; no secret files, no old animations), server-settings.example (names only),
  `/api/health`. Not yet run on a real server.
- **Emails:** Resend verified (diamondanimator.com, us-east-1); Klaviyo send.diamondanimator.com verified (Activate left).
- DMARC fixed; fal automatic top-up on.
- **The final version builds** (`next build --webpack`, Nov 25 13:24) and runs in online mode: a brand-new stranger signs up,
  gets the free trial (150 credits), the sign-in cookie is Secure + HttpOnly, a wrong site / wrong password / wrong address is
  refused. Found and fixed by the build: a fresh server had no sign-in secret file, so the app could not build or start;
  `deploy/start.sh` now runs the project's own setup step (secret made once, never replaced) and creates the sign-in tables.

## The order from here (rewritten Nov 25 21:45 — the whole path, nothing else)
Today the app is LIVE on app.diamondanimator.com but SERVED FROM ARTHUR'S MAC through the Cloudflare tunnel. The server replaces the Mac.
1. ✅ The free project store (`deploy/project-store.mjs`; no paid Supabase until the app earns).
2. ✅ Many people at once (Nov 25): nobody is told "another animation is being made"; up to `DIAMOND_ANIMATIONS_AT_ONCE` are
   made side by side, the rest start by themselves. Two engine money fixes (fal ledger written whole; a first picture counts only
   its own cost) live OUTSIDE this public repo in `diamond-review/engine-fixes/` and reach the server through `engine-sync.sh`.
3. ✅ Keys without pasting: `deploy/send-keys.sh` (run by Arthur on the Mac; Claude never sees a key). The 15 switches that are not
   secret are written by `server-setup.sh` itself. Was missing until today: OPENAI_API_KEY (Help assistant + dictation).
4. **Dad (10 min): rent the server** — DigitalOcean, Ubuntu 24.04, 4 vCPU / 8 GB (about $48/month), Arthur's Mac ssh key
   (`~/.ssh/id_ed25519.pub`) added. Tell Claude the server's address.
5. **Claude:** `git clone` main on the server + `bash deploy/server-setup.sh`; on the Mac `deploy/engine-sync.sh root@<server>`.
6. **Arthur (1 command):** `deploy/send-keys.sh root@<server>`.
7. **Claude:** build + start (`docker compose -f deploy/docker-compose.yml up -d --build`); one real animation timed on the server
   (`https://<server address>` test first, ~$0.30 of AI).
8. **Moving day (~5 min offline):** Claude stops the Mac's live app, `deploy/move-accounts.sh root@<server>` (every account,
   credit and project), restarts the server app. **Dad clicks:** Cloudflare DNS record `app` → the server's address (the tunnel
   record is replaced). Claude stops the Mac tunnel. From here the Mac runs nothing.
9. **Claude, as a stranger, on the real address:** sign up, password email, trial credits, animate, 2 people at once, edit, save,
   reopen, delete, phone + computer, Help assistant. Fix anything found.
10. **Dad:** the real card payment + a refund check (money proof). Optional: Stripe webhook secret (payments work without it).
11. ✅ The website switches itself to "Start your free trial" → app.diamondanimator.com at Dec 1, 00:00 US Central.

## Live from this Mac first (Nov 25, Arthur's OK) — so I can test on the REAL address before the server is rented
- `diamond-review/backups/start-live-mac.sh store|app`: main's production build with main's own private settings (never read by
  Claude), the AI Animator switches Arthur passed, the free project store (`diamond-review/live-store`), the public address.
- `diamond-review/backups/start-live-tunnel.sh`: Cloudflare's free tunnel "diamond-app" -> app.diamondanimator.com (Arthur
  authorized it in his Cloudflare account). Only port 3000 is reachable; the Mac must stay on and awake while people use it.
- Password emails: the Resend key goes in `diamond-review/live-store/.resend-key` (Arthur pastes it; Claude never reads it).
- Moving to the DigitalOcean server later = copy `.local/spec0015-phase3` + `live-store` to /srv/diamond, point the DNS record
  at the server; nobody's account or project changes.
- Main's type check skips the Mac-only test folders (review-videos*, output, .local-plan, .local): one of them held an old
  test file pointing at an old copy, which stopped main's build on this Mac (the server package never had them).

## Known risks (honest)
- The engine has never run on Linux. Its packages exist for Linux, but the first real animation on the server is the proof.
- The engine reaches into several old folders; a real (paid) animation may touch a file the free trace did not. The sync
  copies those four folders whole to cover it; anything missing shows as a clear error on the first test, never to a customer.
- 2 animations at the same time on the 4 vCPU / 8 GB server (fal's own limit is 2 at once today, rising with spend to 40): about
  4 animations a minute. More people simply wait a little, with the normal card. A bigger server = raise one setting.
- This Mac has under 1 GB free disk: no production build here. The first production build happens on the server.
