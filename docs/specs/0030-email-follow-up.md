# SPEC-0030 — Email follow-up that runs for months (dad, Nov 26 09:03)

Status: BUILT (Nov 26 10:12, Arthur's "program" via dad's session) — app signals in this worktree (tests pass, not committed);
9 Klaviyo flows / 93 emails as DRAFT; website patch ready, not pushed. Waiting: dad's review (`0030-DAD-BUNDLE.md`) + switch-on yes
Asked by: dad ("the follow-up is where the money is made")
Created: 2026-11-26 · Worktree: claude/exciting-jepsen-d00f62 (from main ed46ea7)
Appendix (the live emails that stay word-for-word the same): `0030-email-follow-up-appendix.md`

## The simple version (for dad)

Today 5 flows (29 emails) are live, but **most people never get most of them**: website sign-ups never reach the email service,
app sign-ups never hear Arthur's story, paying customers get nothing at all, and everything stops after about 4 months.

The new plan gives **every person exactly one path at a time**, for **12 months**, about **every other day at the start and
about once a month later**. Every email gives something useful first (a tip, part of Arthur's story, a plain fact) and asks
for one thing at most. Paying customers get their own welcome, a testimonial ask at the happy moments, and a heads-up when a
payment fails. People who cancel get a kind goodbye and a slow, useful win-back.

**Three things only dad can decide before Dec 1:**
1. **Klaviyo's paid plan: $20 a month** (500 contacts, 5,000 emails a month). The free plan sends 500 emails a month in all;
   50 beta trials alone use about 450 in their first two weeks, so the free plan runs dry in the first week of December.
2. **Who reads the replies.** Many emails say "hit reply". They come from arthur@diamondanimator.com (IONOS inbox). Someone must
   read that inbox (or we set Reply-To: support@diamondanimator.com, the inbox the support session uses).
3. **The words below.** Change anything; I build exactly what you approve.

## The paths (who gets what)

| Path | Starts when | Emails | How often | Stops when |
| --- | --- | --- | --- | --- |
| A. Launch day (website, Resend) | Dec 1, Arthur presses Send | 1 | once | — |
| B. Reservers who haven't started | Dec 3 (imported list) | 3 | days 2, 5, 9 | they start a trial |
| C. Website sign-ups (new) | added to "Email List" | 7 | days 2–16, every other day | they start a trial |
| D. Free trial + Arthur's story | Started Trial | 10 | days 0–14, every other day | they pick a plan |
| E. First video exported | Exported Video | 1 | day 1 after | — |
| F. After the trial, no plan | Started Trial (day 16+) | 5 | days 16–28 | they pick a plan |
| G. Long-term tips (everyone not paying) | at the end of B, C, F and K | 16 | weekly → every 2 weeks → monthly, to month 12 | they pick a plan |
| H. Welcome, members | Started Plan | 6 | days 0–30 | the plan ends |
| I. Members, month 2–12 | Started Plan (day 45+) | 7 | about monthly | the plan ends |
| J. Payment didn't go through | Payment Failed | 3 | days 0, 3, 6 | the payment goes through |
| K. Cancelled, then plan ended | Cancelled Plan / Plan Ended | 1 + 5 | day 0, then days 0–90 | they pick a plan again |

Deleted accounts get nothing (the filter already on the app flows, added to every new flow).

**Most emails one person gets in the first year:** someone who tries and never pays: 10 (trial) + 5 (after) + 16 (tips) = 31.
A paying member: 10 (trial) + 6 + 7 = 23. Never two paths at once (each path stops the others through its filter).

## The gaps, and the fix for each

1. **App sign-ups never get Arthur's story** → the story now lives inside the free trial (path D): the 5 story parts become
   days 1, 3, 5, 7, 9, each with one tip and one thing to try. No extra emails, still every other day. This is Russell Brunson's
   "soap opera" order (who I am → the wall I hit → the moment it changed → what I built → your turn), written the Jim Edwards
   way (a short story, one lesson, one action, a P.S.).
2. **Website sign-ups don't reach Klaviyo** → website change (needs Arthur to name the website + push): the Klaviyo sign-up code
   already written in `diamond-review/website-exact` (`functions/_lib/klaviyo.ts`, 10 lines in `functions/api/lead.ts`,
   `config/tracking.ts`) is put on top of today's live website. That copy also holds old Nov 21 price edits: those are dropped
   (the live site is newer). The website's own welcome email (the cheat sheet, sent by Resend) stays as day 0; Klaviyo's path C
   starts on day 2, so nobody gets two welcomes.
3. **Nothing for paying customers** → paths H, I (welcome + monthly), J (payment), K (cancel + win-back), E and H4 (testimonials).
4. **Follow-up stops at about 4 months** → path G runs to month 12; after that only the occasional news email (a campaign dad sends).
5. **New app signals** (code, after "program"):
   - **Made First Animation**, **Exported Video**, **Cancelled Plan**, **Payment Failed** (asked for), plus two needed to stop
     emails at the right moment: **Plan Ended** (a cancelled plan really ran out: starts the win-back; someone who cancels and
     then changes their mind never gets it) and **Plan Paid** (a month's payment went through: stops "your payment didn't go
     through" the moment it is fixed).
   - **Started Plan** counts once per plan (today: once per account), so someone who comes back stops the win-back emails.
6. **The Dec 1 launch email with FIRSTDIAMOND** → the sender exists and is tested (`functions/api/admin/launch-email.ts`). It needs
   6 settings in Cloudflare Pages that are missing today (see "Website settings" below). **Checked in the code:** without
   `RESEND_API_KEY` + `UNSUBSCRIBE_SECRET` the website sends **no** email at all, not the launch email and not the cheat-sheet
   welcome, so website sign-ups since launch have had no email. Setting them fixes both.
7. **support@diamondanimator.com** → mail servers are IONOS (MX mx00/mx01.ionos.com, checked now). A test email shows
   "Delivered" in Resend (09:21). **Not yet seen in the inbox:** someone with the IONOS login opens it once.
8. **Klaviyo price** → Klaviyo's own pricing page, read today (Nov 26): Free = 250 contacts, 500 emails a month.
   Email plan: **$20/month = 500 contacts, 5,000 emails**; $30 = 1,000 / 10,000; $45 = 1,500 / 15,000; $60 = 2,500 / 25,000;
   $100 = 5,000 / 50,000. A "contact" = anyone you can email. No yearly discount listed. **Recommended: the $20 plan before
   Dec 1**; it moves to $30 at 1,000 contacts. Path G's last email removes people who never open anything for 6 months,
   which keeps the contact count (and the bill) down and keeps us out of spam.

## Never in spam (what is done, what is left)

Done: sending domain send.diamondanimator.com is Klaviyo's (its name servers point to Klaviyo); SPF on diamondanimator.com
(IONOS); DMARC record exists (`p=none`); Klaviyo adds the one-click unsubscribe that Gmail and Yahoo require.
In the plan: every email is mostly text, one link (sometimes two), no big images, no "FREE!!!", from a real person (Arthur);
the same "From" every time; small volume growing slowly (50 beta users is a gentle start); people who never open for 6 months are
removed (path G, email 16). Left for dad: (a) in Klaviyo, check send.diamondanimator.com says "Active" (the checklist said
"Activate left"); (b) in Klaviyo's account settings, the company address is filled in (the law needs it in every footer;
the emails show it automatically); (c) after two clean weeks, DMARC can move from `p=none` to `p=quarantine` (one DNS line).

## Kids (COPPA) — dad decides, not checked by a lawyer
The emails themselves are fine for any age (no data asked, nothing sold to children directly). The testimonial asks (E, H4,
I3) use the same rule as the testimonials plan (SPEC-0029): words, first name or photo are only ever shown if the person says
they are 13 or older and OK to share. Whether under-13 accounts should get marketing emails at all is part of dad's kids
decision on the go-live list.

## What gets built (after dad approves the words and Arthur says "program")

**App code (this worktree; type check + tests must pass):**
- `src/lib/account/emailSignals.ts`: the 6 new signals, each sent once (Klaviyo ignores a repeat of the same id):
  Made First Animation (once per account: the first time a finished new animation is in the credits list, read only);
  Cancelled Plan (once per plan period, when "cancel at period end" is on); Plan Ended (once per plan, when it is locked
  because it ended); Payment Failed (once per period, when a payment problem shows); Plan Paid (once per paid period);
  Exported Video (once per account). Started Plan becomes once per plan.
- A quiet check every 6 hours (read only) of paying accounts, so Payment Failed and Plan Ended reach the email service even
  when the person never opens the app. Started the same way the billing check is started today.
- Exported Video: after an MP4 or GIF really saved, one small "tell the email service" call (`AnimationExportFlow.tsx`,
  after the "Downloaded" message; the export engine itself is not touched) to a new tiny route `app/api/account/email-signal`
  (signed in only; accepts only "Exported Video").
- Tests in `emailSignals.test.ts` for every signal: when it fires, when it doesn't, that it fires once.
- **Does not change:** credits or money code (only read), the AI Animator, the export engine, login, saving.

**Klaviyo (dad's login in Chrome, only after I ask dad's session first):** every new flow built as **DRAFT**; the 5 live flows
stay as they are until dad switches the new ones on (then the old ones are switched off the same minute, so nobody gets both).
Switching anything live = dad's explicit OK.

**Website (only when Arthur names it; push = live):** the Klaviyo sign-up change on top of today's site. **Website settings**
(dad or Arthur pastes them in Cloudflare Pages → Settings → Variables; Claude never sees them): `RESEND_API_KEY`,
`UNSUBSCRIBE_SECRET` (any long random text), `BETA_CODE=FIRSTDIAMOND`, and for the admin page a Cloudflare Access app on
`/admin` plus `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ADMIN_EMAILS`. Nov 30: a dry run (counts + one sample, sends nothing).
Dec 1 after 00:00 US Central: Arthur presses Send. Dec 3: the reservers who haven't started are imported into Klaviyo for path B.

**Tested:** unit tests + type check; then one throwaway test account on the real address (reserved test addresses are never
sent to the email service, so the check uses Klaviyo's own "preview as" and the event log, no email to a real person).

Time: app signals about 1.5 hours with tests; Klaviyo drafts about 2 hours (60 emails); website change about 30 minutes.

---

# THE WORDS

Every email ends with "— Arthur, Diamond Animator" and the footer: "You got this email because you have a Diamond Animator
account [website paths: signed up on diamondanimator.com]. Questions? Email support@diamondanimator.com. · company address ·
Unsubscribe". Links: **app** = https://app.diamondanimator.com, **plans** = https://app.diamondanimator.com/plans.
Numbers come from the app's own plan list (Nov 26): trial = 14 days, 150 credits (2 animations, each 10 seconds long,
67 credits each). Basic $9.99 a month, 470 credits (7 such animations); Pro $24.99, 1,200 credits (17); Creator $49.99,
2,400 credits (35). Yearly $99 / $249 / $499. Credits refill every month on the plan's day; they don't roll over; extra packs
never expire.

## A. Launch day — sent by the website on Dec 1 (exists; words as they are in `functions/_lib/email.ts`)
- **Subject:** Diamond Animator is out! Start your free trial
- **Body:** Diamond Animator is out! Start your 14-day free trial: [app]. No card needed. Type your idea and watch it move. It runs
  in your web browser, on a computer or a phone. *(First 50 only:)* You're one of the first 50: use code FIRSTDIAMOND for 25% off
  your first year.

## B. Reservers who haven't started yet (new, Klaviyo; list "Reservers Dec 1", property `da_first50` yes/no)
Filter: Started Trial zero times. After B3 they move to path G.

**B1 · day 2 · Subject: Your free trial is waiting · Preview: Two minutes, one sentence, your first animation.**
You reserved a spot, and Diamond Animator is open now.
Here's the quickest start: open the app, sign up, and type one sentence, the way you'd tell a friend. "A stick figure does a
backflip and lands on one knee." You see what it will make and how many credits it costs before anything happens.
14 days free. No card needed.
[Start your free trial → app]
*(if da_first50)* P.S. You're one of the first 50. Your code FIRSTDIAMOND gives you 25% off your first year when you pick a plan.

**B2 · day 5 · Subject: Why a 12-year-old built an animation app · Preview: The short version.**
I'm Arthur. I'm 12, and I built Diamond Animator with my dad.
I've made up fights and stories in my head since I was five. I tried every animation app I could find. Every time it took
weeks, and I often didn't even like what I made.
So I built the app I wished I had: you say what happens, it animates it, and then every frame is yours to change.
**One tip you can use anywhere:** start with 3 seconds, not 3 minutes. One move. A finished short animation teaches you more
than a long one you give up on.
[Try it free for 14 days → app]

**B3 · day 9 · Subject: Last note about your spot · Preview: After this I'll just send tips.**
This is the last time I'll mention your free trial. After this I'll only send animation tips, because I'd rather be useful
than annoying.
If you want to try it, it's 14 days free, no card. If you don't, that's completely OK.
[Start your free trial → app]
*(if da_first50)* P.S. FIRSTDIAMOND works for the first 50 people who use it: 25% off your first year.

## C. Website sign-ups, after Dec 1 (rebuilds today's "Welcome series" + "Arthur's story")
Trigger: added to "Email List". Day 0 is the website's own cheat-sheet email (Resend). Filter: Started Trial zero times (anyone
who starts the trial moves to path D, which has the same story). After C7 they move to path G.

**C1 · day 2 · Subject: How Diamond Animator works · Preview: Tell it what you want. It animates it. You change anything.**
*(today's welcome-2, the "November" lines gone)* Diamond Animator is an animation app with an AI Animator built in. Here's how it works:
1. Tell the AI Animator what you want, in plain words: a fight, a dance, a whole story.
2. Before anything is made, you see exactly how many credits it costs. Nothing happens until you press Animate.
3. It animates it for you, right on your timeline.
4. Want one part different? Ask, and only that part is made again, so you only use credits for that part.
5. Draw and change anything by hand, then export an MP4 to share.
It works in your web browser on computers and phones: Mac, Windows, Chromebook, iPhone and Android.
[Start your free trial → app] — 14 days free, no card needed.

**C2 · day 4 · Subject: Two ways to save on Diamond Animator · Preview: Up to 30% off your first month.**
*(today's welcome-3, now true after Dec 1)* You can try everything free for 14 days, no card needed. If you then pick a plan, there
are two ways to save:
- Subscribe to Animator Builder on YouTube: 10% off your first month. The code is shared on the channel.
- If you were one of the first 50 who reserved a spot, your 25% code came by email on Dec 1.
Plans start at $9.99 a month with 470 credits. That's enough for 7 animations, each 10 seconds long, 67 credits each:
1 minute 10 seconds of animation in total.
[Start your free trial → app]

**C3–C7 · days 7, 9, 11, 13, 16** = Arthur's story 1–5, **word for word as live today** (appendix, "Arthur's story"), with two
changes: story 4's button becomes "Try it free → app", and story 5's button becomes "Start your free trial → app".

## D. Free trial, with Arthur's story (rebuilds today's "Free trial - 14 days")
Trigger: Started Trial. Filter: Started Plan zero times since starting the flow; not deleted. Every other day. Day 14 is new.

**D1 · day 0 · Subject: Your first animation in 3 minutes · Preview: Start with one sentence.**
**Your free trial has started.** You have 14 days and 150 credits. No card needed.
Here's the fastest way to make your first animation:
1. Open the AI Animator.
2. Write what happens, the way you'd tell a friend. Start small: "A stick figure does a backflip and lands on one knee."
3. You'll see what it will make and how many credits it costs. Nothing is made until you press Animate.
4. Watch it land on your timeline.
That's it. Your first animation, in about 3 minutes.
[Open Diamond Animator → app]
P.S. I'm Arthur. I'm 12, and I built this. Tomorrow I'll tell you why. It started when I was five.

**D2 · day 1 · Subject: I was 5 and I closed my eyes · Preview: Where Diamond Animator really started.**
I was five. I'd just learned how to use the TV remote, and I found a show where Lego characters fought each other. I loved it.
So I did what felt natural. I closed my eyes, put my hands up and made up whole fights in my head. I never stopped. I still do it
almost every day. My parents didn't get it. They just couldn't see what I could see.
That's the thing about an idea in your head: nobody can see it until you show them.
**Today's tip: tell it exactly what's in your head.**
- **Say it in order.** "He runs in, slides under the table, then stands up."
- **Say how, not just what.** "He bends low, then jumps really high with his arms up."
- **Say how he looks, if you care.** A blue stick figure. A hollow head. A red scarf.
Close your eyes for 30 seconds, play one short scene, then type it exactly like that.
P.S. Next time: the wall I hit when I finally tried to show people, and why it almost made me quit.

**D3 · day 3 · Subject: Weeks of work, and I didn't even like it · Preview: The wall every new animator hits.**
When I found animation apps, I thought: finally, I can show my parents.
I really tried. FlipaClip for almost half a year. Stick Nodes for about half a year. Drawing books for almost a year. Every time
it took weeks. And after all that, I often didn't even like what I made.
The worst part was starting over. One bad move and the whole thing felt ruined.
**Today's tip: don't start over. Change one part.** If one part of your animation isn't right, just ask for that part. "Make the
jump higher." "Change the ending so he waves." Only that part is made again, and you only use credits for that part. Every
version is kept, so you can always go back.
Try it: open your animation (or make your first one) and ask for one small change.
P.S. Next time: the day I walked into my dad's room.

**D3b · day 2, its own small flow, only if no animation yet · Subject: Your first animation is one sentence away · Preview: The one I'd start with.**
I noticed you haven't made your first animation yet. That's normal. The blank box is the hardest part.
So here's one you can copy, word for word: "A stick figure walks in, trips over a ball, gets up and kicks it away."
It's short, it has a surprise, and it has an ending. Paste it in, look at what it will make, then press Animate.
[Make it now → app]
If something got in the way, hit reply and tell me. I read every answer.

**D4 · day 5 · Subject: The day I walked into my dad's room · Preview: "Tell me what app you want to make."**
One day I walked into my dad's room and he was programming. He was building his own app.
I'd coded before. I once spent three hours on one tiny block of code. He was building a whole application.
He said: "Tell me what app you want to make, and I'll set you up." First I thought of a video game. Then I thought: what if I make
an app that fixes all my animation problems, so I can finally show my stories? I was 11. That was the moment.
**Today's tip: every frame is yours.** Stop on any frame and draw on it: pencil, eraser, fill, shapes, text, layers, and onion skin
to see the frames around it. Add something the AI didn't make: a sun in the corner, a sign, a hat. Draw it on its own layer.
That's when it stops being "an AI animation" and starts being yours.
P.S. What's the one thing that stops you from making the animation you want? Hit reply. It decides what I build next.

**D5 · day 7 · Subject: Why I didn't let the AI do everything · Preview: Halfway through your trial.**
You're halfway through your free trial: 7 days left.
When I started building, I wanted one thing: to animate faster. So I built the AI Animator. But I'm an animator. I didn't want a
video I can't touch. I wanted control. That's why every frame it makes is yours, and you can change one part while the rest stays.
**Today's tip: make a story, not just a move.** A story is three parts:
1. **Start:** someone wants something. "He sees a ball on a high shelf."
2. **Trouble:** something goes wrong. "He jumps and misses, twice."
3. **Ending:** he gets it, or it gets funnier. "He kicks the shelf and the ball lands on his head."
Make the first part, then ask the AI Animator to add the next part. It carries on from where the last one ended.
P.S. You can see how many credits you have left at the top of the app.

**D6 · day 9 · Subject: Your turn · Preview: Think of an idea. Say it. Watch it move.**
I spent weeks stuck on one animation. I don't want that for you.
Anyone should be able to bring an idea to life. Not after years of practice. Today. That's why I built Diamond Animator.
**Today's tip: use the camera.** You can ask for camera moves in plain words: "Cut to his face." "Zoom in on his feet." "The camera
follows him as he runs." Zoom in when something small matters; stay wide when the whole body moves. One close-up in the right
place makes a scene feel like a real cartoon.
And one thing to do before your trial ends: **finish one animation and export it as an MP4.** A finished video you can share is
worth more than five half-made ones. Open your project and press Export.
[Open Diamond Animator → app]

**D7 · day 11 · Subject: 3 days left in your free trial · Preview: What stops, what stays, no surprises.**
**Your free trial ends in 3 days.** Here's exactly what happens, so nothing surprises you:
- **What stops:** making and changing animations with the AI Animator. Credits you haven't used end with the trial.
- **What stays:** every project you made. You can still open it, watch it and export it.
- **What it costs to keep going:** Basic is $9.99 a month with 470 credits: enough for 7 animations, each 10 seconds long, 67 credits
  each. Cancel any time, in Plans in the app.
You're not charged when the trial ends. We don't have your card.
[See the plans → plans]
P.S. If you have credits left, use them now on the idea you've been saving.

**D8 · day 13 · Subject: Your free trial ends tomorrow · Preview: One thing to do today.**
**Tomorrow is the last day of your free trial.**
After tomorrow, the AI Animator waits until you pick a plan, and the credits left from your trial end. Your projects stay, and you
can always open and export them.
One thing to do today: export anything you want to keep as an MP4, so it's on your own device whatever you decide.
If you want to keep animating, pick a plan in the app. It takes a minute, and your animations carry on exactly where they are.
[Pick a plan → plans]
Thank you for trying what I built. It means a lot.

**D9 · day 14 · Subject: Your free trial ended today · Preview: Your animations are safe.**
Your free trial ended today.
Everything you made is still there. You can open it, watch it and export it any time.
To make new animations or change the ones you have, pick a plan: Basic is $9.99 a month (470 credits), Pro $24.99 (1,200 credits),
Creator $49.99 (2,400 credits). Cancel any time.
[Keep animating → plans]
If it wasn't for you, no problem at all. I'll send you an animation tip now and then, because the tips work in any app.

## E. First video exported (new; trigger Exported Video, once per account)

**E1 · day 1 · Subject: You finished one. That's the hard part. · Preview: Can I ask you something?**
Yesterday you exported your first video. Finishing is the hardest part of animating, and you did it.
Two quick things:
1. **Show someone.** A friend, your family, your class. Watching someone react to your animation is the best part.
2. **Can I ask you one thing?** In one sentence: what do you like about Diamond Animator? Just hit reply.
If it's OK for me to show your words and your first name on our website, add "OK to share" (only if you're 13 or older). If you
don't add it, I'll keep it to myself, and it still helps me a lot.
P.S. Next time, try making it longer: ask the AI Animator to add the next part.

## F. After the trial, no plan yet (today's flow, moved one day later)
Filter: Started Plan zero times. **Days 16, 18, 20, 24, 28** (today 15–28; day 14 is now D9). Words **as live today** (appendix,
"After the trial"), with one P.S. added to F2, F3 and F4: "P.S. When you want to animate again, your projects are waiting. [Pick a
plan → plans]". F5 already has one. After F5 → path G.

## G. Long-term tips (everyone not paying)
The same 16 emails run at the end of paths B, C, F and K (after B3, C7, F5 or K6), so each person gets them once: a path stops
the moment the person moves to another one (starts a trial, picks a plan). Filter: whatever that path's filter is; not deleted.
**G1–G8 · days 7, 14, 21, 28, 42, 56, 70, 84 after entering** = today's "Keep in touch" tips 1–8, **word for word** (appendix),
except G8's button goes to the app. Then the new monthly ones:

**G9 · day 115 · Subject: The 2-second rule for fight scenes · Preview: Why fast fights look like a blur.**
If a fight looks like a blur, it's usually too fast to read.
**The fix: one hit, one reaction.** Every punch gets a reaction before the next one starts: the head snaps back, he stumbles, he
shakes it off. Give each pair about 2 seconds. It feels slow while you make it. On screen it reads as fast and clear.
Watch a fight in any cartoon and count: hit, reaction, pause. It's almost always there.

**G10 · day 145 · Subject: Steal this from your favourite cartoon · Preview: How animators really learn.**
Here's how most animators learn: they copy.
Pick 5 seconds from a cartoon you love. Watch it 10 times. Then try to make the same 5 seconds yourself, with a stick figure.
You won't get it right. That's the point. Every place yours looks different is something you just learned about timing, poses or
weight. Keep your version for yourself (it's their scene), and use what you learned in your own.

**G11 · day 175 · Subject: What I learned building an app at 12 · Preview: Small steps, every day.**
People ask me how a 12-year-old builds an app. Honestly: one small step at a time, almost every day, and a lot of things that
didn't work first.
It's the same with animating. Nobody makes a great animation at once. You make a bad one, then a less bad one.
**This month's challenge:** one 3-second animation a week. Four weeks, four animations. Don't fix them. Just finish them.

**G12 · day 205 · Subject: Make him look heavy · Preview: Weight is the secret to believable moves.**
A big character and a small character can do the same jump and look completely different. The difference is weight.
Heavy things take longer to start and longer to stop. A heavy character bends lower before the jump, stays in the air shorter, and
lands with a big squash. A light one springs up and floats.
When you describe a move, say how heavy he is: "a huge, heavy robot jumps." The words change the whole animation.

**G13 · day 235 · Subject: The first frame and the last frame · Preview: Where people stop watching.**
Most people decide in the first second whether to keep watching. So the first frame matters.
**Start in the middle of something.** Not "he walks in". Start with him already running, or already falling. And end on a clear
pose that says "the end": a bow, a shrug, a fall flat on his back.
Look at your last animation. Would you keep watching after frame one?

**G14 · day 265 · Subject: What's new in Diamond Animator · Preview: A short, honest update.**
*(dad or Arthur write 3 real lines here when this goes live; it is checked and updated every 2 months)*
A quick, honest update on what's changed in Diamond Animator since you tried it: [3 real changes].
If you want to see it for yourself, your account is still there.
[Open Diamond Animator → app]

**G15 · day 300 · Subject: Almost a year of tips · Preview: Tell me what you're making.**
It's been almost a year since you tried Diamond Animator. I've kept sending you what I know about animating, and I hope some of it
helped.
Reply and tell me what you're making, in any app, on paper, anything. If you got stuck, tell me where. I read every answer.

**G16 · day 330 · Subject: Should I stop sending these? · Preview: One click either way.**
*(sent only to people who haven't opened or clicked any email in 6 months; everyone else skips it)*
I don't want to fill your inbox with emails you don't read.
If you'd still like animation tips now and then, click below and I'll keep sending them. If I don't hear from you, I'll stop
emailing you in a week. No hard feelings.
[Keep the tips coming → diamondanimator.com/free-guide/]
*(Klaviyo: one week later, anyone who didn't click is suppressed. This keeps us out of spam and keeps the contact count down.)*

## H. Welcome, members (new; trigger Started Plan; filter Plan Ended zero times since starting the flow)

**H1 · day 0 · Subject: Welcome to your plan · Preview: What you have now, and what happens each month.**
Thank you. You're now a Diamond Animator member, and that really matters to me.
What you have:
- **Your credits for this month**, at the top of the app. They refill every month on the day your plan started.
- **Credits don't roll over**, so use them. If you run out, extra packs never expire.
- **Cancel or change your plan any time** in Plans. No emails, no calls.
One tip to start: shorter animations cost fewer credits. Make a 5-second version first, then make it longer once you like it.
[Open Diamond Animator → app]

**H2 · day 2 · Subject: Make it a story · Preview: How to make one animation carry on into the next.**
Now that you have more credits, try something bigger: a story in parts.
Make the first part. When you like it, ask the AI Animator to add the next part: "Then he finds a door and opens it slowly." It
carries on from where the last part ended, so it flows like one animation.
Keep each part to one idea. Three short parts make a better story than one long one.

**H3 · day 5 · Subject: Get more out of every credit · Preview: Three habits of people who never run out.**
Three habits that make your credits go further:
1. **Change one part, don't start over.** Only the part you change uses credits.
2. **Get the words right first.** Read what the AI Animator says it will make before you press Animate. Fixing words is free.
3. **Draw the small things yourself.** A hat, a sign, a sun. Drawing by hand never uses credits.

**H4 · day 10 · Subject: Can I ask you a favour? · Preview: One sentence. It helps more than you'd think.**
You've had Diamond Animator for 10 days. Can I ask you a favour?
Hit reply and tell me, in one sentence, what you like about it. Or what you'd change. Both help.
If it's OK for me to show your words and first name on our website, add "OK to share" (only if you're 13 or older). Without it,
your words stay with me.
It's the best way for other animators to find out if Diamond Animator is for them.

**H5 · day 20 · Subject: Change how he looks, keep how he moves · Preview: Colours, sizes, a whole new look.**
You can change how something looks without changing how it moves.
"Make him red." "Give him a hollow head." "Make the ball bigger." Only the look changes; the motion stays exactly the same. It's a
fast way to try three different looks for the same animation.

**H6 · day 30 · Subject: One month in · Preview: Your credits just refilled.**
One month ago you became a member. Your credits have just refilled for the new month.
I'd love to see what you made. If you exported something you're proud of, reply with it, or just tell me about it.
And if there's one thing that would make Diamond Animator better for you, tell me that too. Members' ideas go first.

## I. Members, months 2–12 (new; same trigger and filter as H)

**I1 · day 45 · Subject: The animation principle most people skip · Preview: Anticipation.** Before a big move, go the other way first.
Before a jump, bend down. Before a punch, pull the arm back. Before a run, lean back for a moment. Animators call it anticipation.
Say it in your words: "he crouches, then jumps". It makes every big move look twice as strong.

**I2 · day 60 · Subject: Two months of animating · Preview: Look back at your first one.** Open the first animation you made and
watch it next to your newest one. I bet you can see the difference. That's two months of practice. Keep both; one day the first one
will make you smile.

**I3 · day 90 · Subject: Would you tell other animators? · Preview: Three months in.** You've been animating with Diamond Animator for
three months. If you like it, the best thing you can do for it is tell someone: a friend who draws, your class, your channel.
And if you'd like to be on our website, reply with one sentence about what you make with it and "OK to share" (only if you're 13
or older).

**I4 · day 120 · Subject: Animate to a beat · Preview: Timing made easy.** Clap a steady rhythm: one, two, three, four. Put your moves
on the claps: step, step, jump, land. Fights work this way: hit, hit, pause, big hit. When something feels off, clap it out.
Usually one move lands between the beats.

**I5 · day 180 · Subject: Half a year · Preview: Thank you.** Half a year ago you picked a plan, and you've kept animating since.
Thank you. People like you are why I can keep building this. What should I build next? Reply with one idea.

**I6 · day 270 · Subject: What's new in Diamond Animator · Preview: A short, honest update.** *(dad or Arthur write 3 real lines, checked
every 2 months; same rule as G14)* Here's what's new since you joined: [3 real changes].

**I7 · day 365 · Subject: One year of animating · Preview: Look how far you've come.** One year ago you became a Diamond Animator
member. Open your first animation and your newest. That difference is a year of practice, and it's all yours. Thank you for
animating with me.

## J. Payment didn't go through (new; trigger Payment Failed; filter Plan Paid zero times since starting the flow)

**J1 · day 0 · Subject: Your payment didn't go through · Preview: Your animations are safe. One quick fix.**
Your monthly payment for Diamond Animator didn't go through. This happens a lot: a card expires, or a bank says no once.
Your animations are safe. Your new month's credits are waiting and come the moment the payment goes through.
To fix it: open the app, go to Plans, and change your card. It takes a minute.
[Change my card → plans]

**J2 · day 3 · Subject: Still waiting on your payment · Preview: Your new credits are on hold.**
Just a reminder: your payment still hasn't gone through, so your new month's credits are on hold.
Go to Plans in the app and change your card. If something looks wrong, reply and we'll sort it out.
[Change my card → plans]

**J3 · day 6 · Subject: Your plan may stop soon · Preview: Last reminder about your payment.**
This is the last reminder: if the payment doesn't go through, your plan can stop. Your projects stay, and you can always open and
export them.
[Change my card → plans]

## K. Cancelled, then the plan ended (new)

**K1 · trigger Cancelled Plan · day 0 · Subject: Your plan is cancelled · Preview: You can keep animating until it ends.**
Your plan is cancelled, and it stays on until the end of the month you've paid for. Use your credits until then.
After it ends, your projects stay: you can open them, watch them and export them any time.
Changed your mind? Go to Plans and turn it back on. Nothing is lost.
Can I ask why you cancelled? One word is fine. Just hit reply.

**Win-back: trigger Plan Ended; filter Started Plan zero times since starting the flow. After K6 → path G.**

**K2 · day 0 · Subject: Your plan has ended · Preview: Your animations are still there.** Your plan ended today. Everything you made
is still in your account: open it, watch it, export it any time. If you want to animate again, your plan is one click away in Plans.
[Open Diamond Animator → app]

**K3 · day 7 · Subject: The one thing that makes animation look real · Preview: It isn't drawing.** Most people think good animation
is good drawing. It's timing. Things start slowly, speed up, then slow down before they stop. Heavy things are slow; light things
are fast. Next time you watch a cartoon, count how long a character holds still before a big move. That pause does most of the work.

**K4 · day 21 · Subject: 5 ideas for your next animation · Preview: Steal any of these.** A stick figure tries to sit on a chair that
keeps moving. Someone opens a box and what's inside scares them. A robot learns to dance, badly, then well. A chase that ends because
the one in front stops to tie a shoe. Someone throws a ball up and it never comes down. All five share one thing: a small surprise.

**K5 · day 45 · Subject: What's changed since you left · Preview: A short, honest update.** *(3 real lines, same rule as G14)*
Here's what's new in Diamond Animator since your plan ended: [3 real changes]. Your projects are still there.
[Pick a plan → plans]

**K6 · day 90 · Subject: Still animating? · Preview: I'd love to know.** It's been three months. Are you still animating, in any app?
Reply and tell me what you're making. If Diamond Animator wasn't right for you, tell me why. It's how I make it better.
