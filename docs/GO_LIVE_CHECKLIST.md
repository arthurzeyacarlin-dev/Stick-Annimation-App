# Going online at app.diamondanimator.com — checklist (Nov 25, D-0255)

Nothing is rented, deployed or live yet. Dad's rules: I test everything myself on the real address first; he only does
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

## The order from here
1. **Dad: Supabase paid plan** (about $25/month). Projects must save to the real Supabase online: the app was built and
   proven for it. On this Mac they save into a test stand-in that must never hold customers' work.
2. **Dad: rent the server** — DigitalOcean, Ubuntu 24.04, 4 vCPU / 8 GB (about $48/month), with my ssh key added.
3. **Me:** `deploy/server-setup.sh` on the server, then `deploy/engine-sync.sh root@<server>`, then copy the app (git clone).
4. **Dad: paste the settings** into `/srv/diamond/settings.env` + `/srv/diamond/build.env`, and the fal key file
   `/srv/diamond/engine/diamond-engine/.env.local` (one line `FAL_KEY=...`). Make the Resend key (Sending access).
5. **Me:** build and start (`docker compose --env-file /srv/diamond/build.env -f deploy/docker-compose.yml up -d --build`).
6. **Dad clicks:** Cloudflare record `app` → the server's address (DNS only); Klaviyo Activate.
7. **Me:** payments webhook → `https://app.diamondanimator.com/api/account/billing/webhook` (new signing secret into
   settings); time one real animation on the server (the AI costs about what one animation always costs).
8. **Me, as a stranger, on the real address:** sign up, password email arrives, trial credits, animate, edit, save, reopen,
   delete, phone + computer, the Help assistant. Fix anything found.
9. **Dad:** the real card payment, and a refund check.
10. **Me:** the website's "Open app" button → app.diamondanimator.com, pushed last. Live.

## Known risks (honest)
- The engine has never run on Linux. Its packages exist for Linux, but the first real animation on the server is the proof.
- The engine reaches into several old folders; a real (paid) animation may touch a file the free trace did not. The sync
  copies those four folders whole to cover it; anything missing shows as a clear error on the first test, never to a customer.
- One animation at a time (as today); others wait in line. Enough for the beta; more at once later on a bigger server.
- This Mac has under 1 GB free disk: no production build here. The first production build happens on the server.
