# Going online at app.diamondanimator.com — checklist (Nov 25, D-0255)

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
