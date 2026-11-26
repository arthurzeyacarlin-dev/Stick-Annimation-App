# Dad's one review — the follow-up emails (SPEC-0030, Nov 26)

Everything that needs you, in one place. Everything else is done or waits only on these.

## What is ready
- **Every email's words**: `0030-email-follow-up.md` (the plan + 48 new or changed emails) and `0030-email-follow-up-appendix.md`
  (the 18 live emails that stay word for word). 10 paths, 12 months, about every other day at first, then about monthly.
- **The app now tells the email service 6 more facts** (first animation, video exported, month paid, payment failed, plan
  cancelled, plan ended), each once. Tests: 13/13 signal tests, 37/37 plan/credits/billing tests, type check clean.
  Not yet on the server: it goes up with Arthur's next "commit and push" + the server update.
- **Klaviyo: 9 new flows, 93 emails, ALL DRAFT** (read back one by one: every flow and every email says draft; nothing sent):
  C. Website sign-ups (v2) · D. Free trial + Arthur's story (v2) · D3b. No animation yet, day 2 (v2) · E. First video exported
  (v2) · F. After the trial + long-term tips (v2) · H+I. Members, year one (v2) · J. Payment didn't go through (v2) · K1. Plan
  cancelled (v2) · K. Win-back after the plan ended (v2). The 5 Nov 21 flows are untouched and still live (the builder could
  only create, never change). Path B (reservers, 19 emails) is ready and gets built on Dec 3 when the list exists.
  6 new facts now exist in Klaviyo (made by one setup event each on a no-email profile, so nobody is emailed).
- **Website sign-ups → Klaviyo**: a ready change, tested on a copy of today's live website (73/73 tests, type check clean).
  Not pushed (push = live).

## Your choices (one word each is enough)
1. **The words.** OK as written, or tell me what to change.
2. **Klaviyo plan: $20 a month** (500 contacts, 5,000 emails; read on Klaviyo's pricing page today). The free plan's 500 emails a
   month run out in the first week of December. Click: Klaviyo → Account → Billing → Email, 500 contacts.
3. **Replies.** The emails say "hit reply" and come from arthur@diamondanimator.com. Who reads that inbox? Or should replies go to
   support@diamondanimator.com? (It is one setting on every email; I change it on your word.)
4. **Kids.** Should under-13 accounts get these emails at all? (Part of your kids/COPPA decision on the go-live list.)

## Clicks only you (or Arthur) can do
5. **Cloudflare Pages → diamond-website → Settings → Variables (Production)**, paste: `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET` (any long
   random text), `BETA_CODE` = `FIRSTDIAMOND`; and for the admin page a Cloudflare Access app on `/admin` + `CF_ACCESS_TEAM_DOMAIN`,
   `CF_ACCESS_AUD`, `ADMIN_EMAILS`. Without the first two the website sends no email at all today (not even the cheat sheet).
6. **Klaviyo → Settings → Domains**: send.diamondanimator.com shows "Active" (DNS is already right). **Klaviyo → Settings →
   Account**: the company address is filled in (it goes in every footer; the law needs it).
7. **Inbox check**: someone with the IONOS login opens support@diamondanimator.com once and sees the 09:21 test email.
8. **Arthur**: "push the website" (sign-ups reach Klaviyo) and "commit and push" (app signals).

## Switching on (only with your yes)
9. When you say "switch on": the new flows go live and the 5 old flows go off in the same minute, so nobody gets both.
   Before that, the 3 "What's new" emails (G14, I6, K5) get 3 real lines each from you or Arthur (they are months away, so this
   can wait; they stay draft until filled).
10. **Dec 1**: Nov 30 a dry run of the launch email (counts + one sample, nothing sent); Dec 1 after 00:00 US Central Arthur
    presses Send on the website's admin page. **Dec 3**: the reservers who haven't started go into Klaviyo list "Reservers Dec 1"
    (I prepare the file; making the list is one click in Klaviyo → Lists → Create), then path B is built on it.

## Small honest notes
- People who already pay (very few today) will count as "started a plan" once more when the new app code goes up. Because the
  new members' emails are still drafts then, they get nothing extra.
- The "first animation" fact comes from the credits list (read only): an animation that was charged = made.
- Nothing was sent to any real person. Nothing was committed, pushed or deployed.
