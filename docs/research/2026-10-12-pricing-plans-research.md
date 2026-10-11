# Diamond Animator — pricing research and recommendation

Research date: **Sunday 2026-10-12** (every price below was seen on this date unless noted).
Method: web search + fetching official pricing pages where possible. Some official pages showed local currency (Adobe in INR, Stripe in Thai baht) or didn't render prices (Hailuo, Kling, Kaiber, Renderforest, Toon Boom main page); for those I used search results / third‑party trackers and say so. Prices change often and many AI tools run "first month" promos — treat every number as "about right on Oct 12, 2026", not a promise.

---

## 0. The short answer (for Arthur)

1. **The current website math loses money.** Today 1 credit = 1 AI message. Starter gives 300 messages for $5.99. If a kid uses them all on animations at ~20¢ each, that costs us **$60** of AI to earn **$5.47**. Creator (1,200) could cost $240, Studio (3,000) $600.
2. **Keep the prices** ($5.99 / $11.99 / $19.99 — dad already picked them and they sit right in the normal range for this audience). **Change what a credit means and how many you get.**
3. **New credit rule (easy to explain):** small edit or chat = **1 credit**, simple animation = **10 credits**, big animation = **30 credits**. You always see the price before it runs.
4. **New credit amounts:** Starter **150** (~10 animations), Creator **350** (~23), Studio **600** (~40) per month. Fresh credits every month; unused ones don't roll over. Extra packs cost 5¢ a credit.
5. **A hidden safety limit** (Starter $3.50, Creator $7.50, Studio $12.50 of real AI cost per month) means **no one can ever cost us more than they pay**, even on the App Store with yearly billing.
6. **Free:** keep the 14‑day trial but give **50 credits, not 150**, and after the trial keep **drawing free forever** (no AI). Every competitor kids already know (Pivot, Krita, FlipaClip, Stick Nodes) is free to draw in; the AI Animator is what people pay for.
7. **Margins:** a normal user keeps about **55–75% of the price as profit after AI + Stripe** today, and **~78–87%** once AI gets down to 8¢ an animation. The worst possible user still leaves **~22–33% profit**.

---

## 1. Competitor pricing

### 1a. Drawing / stick-figure / 2D animation apps (the tools our fans already use)

| Product | Free? | Paid price | What you get | Source (seen 2026‑10‑12) |
|---|---|---|---|---|
| **Pivot Animator** | Yes, freeware (Windows only) | — | Classic stick-figure animator; v5.2.11 (May 2025). Third-party reviews note the installer has opt-out adware. | pivotanimator.net; pivotanimator.net/Download.php; en.wikipedia.org/wiki/Pivot_Animator |
| **Stick Nodes** | Yes (free version, ads, watermark) | **Stick Nodes Pro $3.99 one-time** (App Store; same on Android per trackers) | Pro = no ads, no watermark, MP4 export, sounds, more filters. App Store: 4.8★, 6.6K ratings, age 4+ | apps.apple.com/us/app/stick-nodes-pro-animator/id932128168; apppricinglab.com/app/apple/932128168 |
| **FlipaClip** | Yes (freemium) | **FlipaClip Plus: $5.99 and $29.99** (App Store US IAP list; third parties label these $5.99/month and $29.99/year; a $39.99 option also listed, unlabeled). 7‑day free trial. | Plus = unlimited layers, audio import, more. 268K ratings, 4.6★, age 4+ | apps.apple.com/us/app/flipaclip-create-2d-animation/id1101848914; support.flipaclip.com/article/33 and /36; filmora.wondershare.jp review (third party) |
| **Animation Desk (Kdan)** | Free + paid | Pro **$4.49/mo, $10.99/quarter, $29.99/yr** (App Store list; may be dated); Creativity 365 bundle ~$59.99/yr | Frame-by-frame app | apps.apple.com/app/id946346179; g2.com (third party) |
| **Procreate Dreams** | No | **$12.99 one-time**, no subscription, iPad only | Full 2D animation app | procreate.com/dreams |
| **Krita** | Yes, free & open source | — (donations/shop) | Painting app with animation tools | krita.org |
| **Adobe Animate** | No | ~**$22.99/mo** (annual plan billed monthly; third-party, checked Aug 2026). In **"maintenance mode"** since Feb 2026 — no new features. | Pro 2D animation | techcrunch.com/2026/02/04/after-backlash-adobe-cancels-adobe-animate-shutdown-and-puts-app-on-maintenance-mode; josephnilo.com/blog/adobe-animate-price (third party) |
| **Adobe Express** | Yes (free plan) | Premium ~**$9.99/mo or $99.99/yr** (US price from third-party; Adobe page showed INR ₹797.68/mo); 30‑day trial. Free for K‑12 schools. | **250 generative AI credits/month**; when out, wait for monthly reset or buy more. Firefly Pro ~$19.99/mo = 4,000 credits | adobe.com/express/pricing; capterra.com/p/174232/adobe-express/pricing; helpx.adobe.com Express FAQ |
| **Toon Boom Harmony Essentials** | 21‑day trial | **$30/mo or $252/yr** (official shop via search); Advanced $77/mo, Premium $139/mo | Pro studio tool | shop.toonboom.com/en/products/harmony (via search snippet) |
| **Moho** | Trial | **Debut 14 $59.99**, **Pro 14 $399.99** one-time (Win/Mac) | Bone-rigged 2D animation | moho.lostmarble.com/pages/buy |
| **Plotagon** | Trial (older articles: 1 month) | Standard **$7/mo**; Academic **$3/mo** (official desktop page, undated); older: $99/yr per class | Script-to-3D-cartoon tool | plotagon.com/desktop; techlearning.com |
| **Cascadeur** (AI-assisted 3D posing) | Yes (300 frames, no commercial use) | Indie **$19/mo or $96/yr**; Pro **$49/mo or $396/yr**; Edu $49 | AI AutoPosing | cascadeur.com/plans |

**Lesson:** Drawing tools in our space are **free or very cheap** ($0–$6/mo or $4–$13 once). Nobody will pay a subscription just to draw stick figures. The thing people pay real money for in 2026 is **AI**.

### 1b. Business "make an animated video" tools (template + some AI)

| Product | Free? | Monthly / yearly | Credits / limits | Source |
|---|---|---|---|---|
| **Animaker** | Yes (watermark) + 7‑day trial | Basic $27/mo or $15/mo yearly; Starter $45 / $25; Pro $79 / $43 | 1,500–5,000 "AI video credits"/mo; 90–180 s generative video/mo (page also shows older conflicting prices) | app.animaker.com/pricing |
| **Vyond** | Trial | Starter $99/mo or $699/yr; Professional $199/mo or $1,199/yr | 10,000–20,000 AI credits/user/mo | vyond.com/pricing |
| **Powtoon** | Yes (3‑min, watermark) | Lite $15/mo (yearly); Pro $40/mo (yearly); Advanced $125/mo; **Education $8/mo** | 150–800 AI credits/mo; AI clip 15–40 credits; packs 125 credits $49 → 450 for $149 (page also shows $25/100, $55/500, $95/1,000) | powtoon.com/pricing |
| **Renderforest** | Yes | Lite ~$9/mo, Pro ~$24–39, Business ~$49–59 (third-party, sources disagree) | Lite 400 AI credits/mo, Pro 1,600, Business 3,000 (third-party) | pricingsaas.com/companies/renderforest; toolquestor.com (third party) |
| **Steve.ai** | Yes | Basic $20/mo or $120/yr; Starter $60 / $360; Pro $80 / $480 | Credits **do not roll over**; add-ons need an active plan | app.steve.ai/pricing |
| **Synthesia** (credit-model reference) | Basic free (500 credits/mo, watermark) | Starter $29/mo or $18/mo yearly; Pro $89 / $64 | Starter 1,250 credits/mo (~12 min video) | synthesia.io/pricing |

**Lesson:** These sell to companies at $15–$200/month. Too expensive for kids, but they show the **standard pattern: monthly plan + monthly AI credits + extra packs**, credits reset monthly.

### 1c. AI video / animation generators (how credit systems work)

| Tool | Free | Plans (monthly → yearly per month) | Credits / month | Cost of one generation | Rollover & top-ups | Source |
|---|---|---|---|---|---|---|
| **Runway** | 125 credits one-time (never expire) | Standard $15 → $12; Pro $35 → $28; Max $95 → $76 | 625 / 2,250 / 9,500 | Gen‑4.5 = 12 credits/second → **60 credits per 5 s** (~$1.44 on Standard, i.e. ~10 clips/mo) | Monthly credits **don't roll over** (Max rolls over 1 month). Top-ups min 1,000 credits, **never expire** | runway.com/pricing |
| **Pika** | Free plan, 0 monthly credits (packs only) | Starter $10 → $8; Creator $35 → $28; Fancy $95+ | 900 / 3,150 / 8,550+ | Seedance 2.5 5 s 720p = 122 credits (~**7 videos/mo on Starter**); Wan 3.0 = 33 credits (~27) | Plan credits **don't roll over**. Top-ups **60 credits per $1** (1,500 for $25 … 66,000 for $1,000); top-ups last **365 days** | pika.art/pricing |
| **Luma (Dream Machine / Ray)** | No free plan listed | Plus $30 → $25; Pro $90 → $75; Ultra $300 → $250 | 10,000 / 40,000 / 150,000 | Ray3.14 720p = 20 credits/s → **100 credits per 5 s** (~100 clips on Plus) | Not stated | lumalabs.ai/pricing |
| **Kling** | Small free daily credits (third-party) | Standard ~$10, Pro ~$37, Premier ~$92 list (big first-month promos: $6.99/$25.99/$64.99); yearly ~34% off | 660 / 3,000 / 8,000 | 5 s 720p = 15–45 credits (≈14–44 clips on Standard) | Subscription credits **expire monthly** | eesel.ai/blog/kling-ai-pricing; costbench.com (third party — official page did not render) |
| **Hailuo (MiniMax)** | Some free credits | Standard $14.99, Pro $54.99, Master $119.99 (promos as low as $7.99) | 1,000 / 4,500 / 10,000–10,500 | ~20–33 six-second videos on Standard (third-party estimate) | — | Hailuo service terms via aiarty.com / magichour.ai (third party; official page did not render) |
| **Viggle** | 5 free videos/day | Pro $7.99 (was $9.99); Live $15.99; Max $63.99; yearly −20% | 80 / 200 / 800 | Varies by model | Monthly credits expire on billing date; bought credits never expire **but only usable while subscribed** | viggle.ai/pricing |
| **Krikey AI** (3D cartoon animation, COPPA-certified) | 20 one-time credits | Pro **$15/mo**; Teams $10/person; yearly "save from 16%" | Pro 165/mo | — | **Passes without subscription:** Day 10 credits $1.50, Week 50 $6, Month 150 $18, Year 1,800 $165. EDU discount | krikey.ai/pricing |
| **DeepMotion Animate 3D** | 60 s/month free (non-commercial) | (prices on separate page, not captured) | 1 credit = 1 second of animation | — | Credits **don't roll over**; no top-ups mentioned — wait or upgrade | deepmotion.com/pricing-animate3d |
| **Kaiber** | Unclear (some sources: $5 5‑day trial) | Creator ~$29/mo (~1,400 credits); Pro $99–$250 (sources conflict, Feb 2026 change) | — | — | Packs ~$5/300 up to $250/20,000 | costbench.com/changelog/kaiber-price-increase-2026-02; eesel.ai (third party) |
| **Meta Animated Drawings** | **Free** web demo + open source | — | — | Upload a drawing, place joints, pick a preset dance/walk | — | sketch.metademolab.com (via gigazine.net, canaltech) ; github.com/facebookresearch/AnimatedDrawings |
| **AI stick-figure tools** | — | — | — | Found no consumer product that makes *editable* stick-figure animation from text. Closest: "Stix" (tiny developer skill → GIF/MP4), Pixa / FlexClip (image → flat AI video), DIY ImageFX + video-AI workflows | — | skills.sh/bassimeledath/stix; pixa.com; flexclip.com/learn/animate-stick-figure.html |

**What the AI tools have in common:**
- Price ladder **~$8–$15 / ~$30–$40 / ~$90–$100** per month; yearly saves **16–34%**.
- **Credits refill monthly and don't roll over** (Runway, Pika, Kling, Viggle, Steve.ai, DeepMotion). Exceptions: Runway's top plan rolls 1 month over.
- **Top-up packs** exist almost everywhere, usually **only for subscribers**, priced at the same or slightly worse rate than plans, and **last 12 months or forever**.
- Customer price for one generation at the entry plan: roughly **$0.15–$1.50 per 5‑second clip**. Entry plans buy only **~7–45 clips a month**. So "~10–40 animations a month" for us is normal, not stingy.
- Cost to the customer is quoted **per second** (video tools) or **per generation**; heavy models cost 3–10× more credits than light ones — the same idea as our "simple = 10, big = 30".

---

## 2. Pricing psychology for this audience

- **Normal subscription price bands (all apps, RevenueCat 2026 data via SaaStr):** $7.99–$9.99/month, $29.99–$39.99/year; median yearly price **$34.80**. Source: saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps (secondary summary of the gated report).
- **Kids/teen creative apps sit lower:** FlipaClip $5.99/mo or $29.99/yr; Animation Desk $4.49/mo or $29.99/yr; Stick Nodes $3.99 once. **$5.99 Starter is right in this zone.** $11.99 and $19.99 are only for kids who are really into it (or parents/hobbyists) — that's fine as long as they have clear extra value.
- **Who pays:** for kids, the **parent** pays and the kid uses it. Parents care most about **trust: one clear price, no surprise charges, no ad tricks** (RevenueCat interview with kids-app makers: revenuecat.com/blog/growth/whats-the-best-way-to-monetize-kids-apps). → Show credits in plain numbers, never auto-buy packs, send a "running low" note.
- **Trials:** RevenueCat 2026 — trials of **17–32 days convert ~42.5%** vs ~25.5% for trials under 4 days. **Our 14‑day trial is good.** Most conversions happen in the first week. (revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- **Hard paywall vs free plan:** in mobile apps, hard paywalls convert ~5× better (10.7% vs 2.1%) — but our competitors are free to draw in, and kids can't pay on their own, so a free drawing plan is the "front door" that brings kids (and their parents) in. Honest trade-off: fewer % convert, many more people try it.
- **AI apps:** earn ~41% more per user in year 1 but **monthly AI subscribers quit faster** (same RevenueCat article). → Push yearly plans and make the first week great.
- **Yearly discount:** "2 months free" (~17% off) is standard and easy to explain. AI tools go up to 20–34% off.
- **Family / education:** Apple lets you turn on **Family Sharing** for subscriptions (up to 6 people share one). If we enable it on the Mac App Store, credits must be a **shared pool**, and once switched on it can't be switched off — so leave it off at launch. Schools: Powtoon EDU $8/mo, Plotagon Academic $3/mo, Adobe Express free for K‑12, Krikey EDU discount → a classroom plan is a good "later" idea, not for launch.
- **"Unlimited drawing + limited AI credits"** is common: Adobe Express (free editor + 250 AI credits on Premium), FlipaClip-style freemium, Krikey (free app + credit passes), Viggle/Pika free tier + packs.
- **Kids and no credit card:** Krikey sells one-time "passes" (no subscription) — a good idea later for kids who get gift money.
- **Under‑13 users (not a price, but important):** the updated COPPA rule's main requirements apply from **April 22, 2026** — a site aimed at kids under 13 needs verifiable **parent consent** before collecting their data (jonesday.com/en/insights/2025/05/ftc-finalizes-amendments-to-coppa--rule). → Checkout should be "a parent pays" and the trial sign-up needs a parent step for under‑13s. Dad should check this with someone who knows the law.

### Fees we pay
- **Stripe (US):** **2.9% + 30¢** per card payment; +1.5% for cards from other countries; +1% if currency conversion; **Stripe Billing (subscriptions) ~0.7%** of billed amount (stripe.com/pricing via search; support.stripe.com). The 30¢ is why small payments lose more %.
- **Apple Mac App Store:** **Small Business Program = 15%** (if under $1M a year); subscriptions after a subscriber's first year can drop to 10% under some terms (developer.apple.com/app-store/small-business-program). Apple prices can be set from $0.29 up, in 10¢ steps under $10.

---

## 3. Our selling point (USP) — honest version

**Strong:**
- **Only tool found that turns plain words into an *editable* stick-figure animation.** AI video tools (Runway, Pika, Kling, Hailuo, Viggle) give you a flat video you can't fix frame by frame; if one thing is wrong you pay to regenerate the whole clip. We give real layers and frames you can redraw.
- **Edit by talking, and only that part changes** ("make him green") — and those edits are **nearly free for us**, so we can charge just 1 credit. AI video tools charge full price again.
- **Built for stick-animation fans** (the Pivot / Stick Nodes / FlipaClip / YouTube stick-fight crowd) — figures, fights, effects, camera cuts, plus a full drawing studio.
- **Cheaper per result than AI video**: entry AI-video plans get ~7–45 clips/month for $8–$15; we give ~10 animations + lots of edits for $5.99.
- **Physics/motion engine** = consistent bodies, no melting AI-video limbs.
- **Kid-founder story** — great for YouTube and parents.

**Weaker (be honest):**
- **Brand new**, no reviews, no community yet (Stick Nodes 6.6K ratings, FlipaClip 268K).
- **Stick figures only** — no "real" characters or video look.
- **Computers only** — most kid animators use phones/tablets (FlipaClip, Stick Nodes).
- **AI cost is real and varies** (5¢–86¢), so we can't offer "unlimited AI".
- Free drawing competitors are excellent, so drawing alone won't sell.

---

## 4. Recommendation

### 4a. What a credit means (new)

| What you ask for | Credits | Our AI cost today | Max cost per credit |
|---|---|---|---|
| Chat message or small edit (recolor, rename, "make the jump shorter") | **1** | ~0–2¢ | ~2¢ |
| Simple animation (1–2 figures, simple moves) | **10** | 5–25¢ | 2.5¢ |
| Big animation (fight, many figures, effects, camera cuts) | **30** | 40–86¢ | 2.9¢ |

- The AI tells you **before** it starts: "This is a big animation — 30 credits. OK?" No surprises (important for parents).
- Average animation ≈ **15 credits** (about 3 simple for every 1 big) ≈ **20¢** of AI → **1 credit ≈ 1.3¢ of AI cost on average, 2.9¢ at worst.**
- Kid version: *"A credit is like a token. A small change is 1 token, a normal animation is 10, a huge one is 30."*
- Engine side: if a job runs far over its band (e.g., a "simple" one going past 40¢), stop and ask instead of quietly burning money.
- The free **Help Assistant stays free** (it's not the AI Animator).

### 4b. The plans

| Plan | Monthly | Yearly ("2 months free") | Credits every month | About how many animations | Hidden safety limit (real AI cost / month) |
|---|---|---|---|---|---|
| **Free (after trial)** | $0 | $0 | 0 (drawing only) | — | $0 |
| **14‑day trial** | $0, no card | — | **50 credits** once | ~3 animations + edits | ~$1.43 max |
| **Starter** | **$5.99** | **$59** | **150** | ~10 | $3.50 |
| **Creator** | **$11.99** | **$119** | **350** | ~23 | $7.50 |
| **Studio** | **$19.99** | **$199** | **600** | ~40 | $12.50 |

- **Prices stay the same as the website now** (dad's choice). Only the credits change.
- **Refill:** on each monthly billing date (yearly plans also refill monthly, not all at once).
- **Rollover:** **none** for plan credits (industry normal and simplest). Optional kinder rule later: roll over up to one month's worth, max.
- **Bigger plans = better deal:** Starter 4.0¢/credit, Creator 3.4¢, Studio 3.3¢.
- **Extra features can also separate plans** (cheap for us): e.g., Studio gets longer animations / more figures per scene / first in line.
- **Trial:** drop from 150 to **50 credits**. Under the new credit rule, 150 credits would cost up to ~$4.30 per trial user, and most trial users won't pay.
- **Free drawing forever:** all drawing tools and exports, no AI. Keeps kids around until they (or a parent) buy. Costs us only hosting/storage (not measured here).

### 4c. Top-up packs (subscribers only, last 12 months)

| Pack | Price | Per credit | Profit at worst cost (Stripe / Apple) |
|---|---|---|---|
| 100 credits | $4.99 | 5¢ | $1.68 / $1.37 |
| 200 credits | $9.99 | 5¢ | ~$3.67 / ~$2.75 |
| 400 credits | $19.99 | 5¢ | ~$7.64 / ~$5.51 |

Packs cost a bit more per credit than plans so upgrading is the better deal (same as Pika, Runway, Viggle). Pack credits are not counted in the monthly safety limit (they're paid for separately and always profitable).

### 4d. Profit math (per subscriber per month)

Assumptions: Stripe 2.9% + 30¢ + 0.7% Billing; Apple 15%. Average AI cost 1.33¢ per credit now (20¢ per 15‑credit animation) and 0.53¢ later (8¢ per animation). Worst case = every credit at 2.9¢ (stopped by the safety limit). "Half use" = uses half the credits (a guess — real usage is unknown until launch). Not counted: hosting, storage, email, sales tax, refunds, our time.

**Starter $5.99** (we keep $5.47 via Stripe, $5.09 via Apple)

| Case | AI cost | Profit (Stripe) | Profit (Apple 15%) |
|---|---|---|---|
| Half use, 20¢ animations | $1.00 | $4.47 (75%) | $4.09 (68%) |
| Full use, 20¢ | $2.00 | $3.47 (58%) | $3.09 (52%) |
| Full use, 8¢ (later) | $0.80 | $4.67 (78%) | $4.29 (72%) |
| Worst, stopped by $3.50 limit | $3.50 | $1.97 (33%) | $1.59 (27%) |

**Creator $11.99** (keep $11.26 Stripe / $10.19 Apple)

| Case | AI cost | Profit (Stripe) | Profit (Apple) |
|---|---|---|---|
| Half use, 20¢ | $2.33 | $8.93 (74%) | $7.86 (66%) |
| Full use, 20¢ | $4.67 | $6.59 (55%) | $5.52 (46%) |
| Full use, 8¢ | $1.87 | $9.39 (78%) | $8.32 (69%) |
| Worst, $7.50 limit | $7.50 | $3.76 (31%) | $2.69 (22%) |

**Studio $19.99** (keep $18.97 Stripe / $16.99 Apple)

| Case | AI cost | Profit (Stripe) | Profit (Apple) |
|---|---|---|---|
| Half use, 20¢ | $4.00 | $14.97 (75%) | $12.99 (65%) |
| Full use, 20¢ | $8.00 | $10.97 (55%) | $8.99 (45%) |
| Full use, 8¢ | $3.20 | $15.77 (79%) | $13.79 (69%) |
| Worst, $12.50 limit | $12.50 | $6.47 (32%) | $4.49 (22%) |

**Yearly plans** (per month): Starter yearly keeps $4.71 (Stripe) / $4.18 (Apple); Creator $9.53 / $8.43; Studio $15.96 / $14.10. With the safety limits, the worst user still leaves **+$0.68 to +$3.46** a month. **Without the limits, worst-case yearly Creator/Studio users would lose $0.50–$3.10 a month** — that's why the limit matters.

**Launch deals still work:** first‑50 25% off ($4.49 / $8.99 / $14.99) keeps $4.03 / $8.37 / $14.15 after Stripe — all above the safety limits. YouTube + first‑50 combined (30% off Starter first month = $4.19) keeps $3.74 — barely above the $3.50 limit, OK for one month.

**Why the old plan fails (for comparison):** full use of the current plans at 20¢ per message = Starter $60, Creator $240, Studio $600 of AI cost vs. $5.47 / $11.26 / $18.97 earned.

### 4e. Things to decide (for Arthur + dad)
1. OK to change "1 credit = 1 message" to "1 / 10 / 30 credits by size"? (Website text needs updating before the Oct 20 trial opens.)
2. Free drawing forever after the trial, or trial-only (current site)? Recommendation: free drawing.
3. Trial credits 150 → 50?
4. Same prices on the Mac App Store later? Apple keeps 15%, still profitable with the limits; or set App Store prices ~$1 higher (allowed, common).
5. Parent-consent step for under‑13 sign-ups (legal check).

### 4f. Uncertain things (honest list)
- Real usage is unknown: how many animations a typical kid makes, the simple/big mix, and how often they hit "redo". Check after 2–4 weeks of real data and adjust credits (adding credits later is easy and feels nice; taking them away makes people angry — so start a bit careful).
- AI costs are from our own tests (5¢–86¢), not long-term averages.
- Several competitor prices are from third-party trackers (Kling, Hailuo, Kaiber, Renderforest, FlipaClip labels, Adobe US prices, Toon Boom) and many AI tools show promo prices.
- Stripe's exact Billing % (0.67–0.7%) and international fees vary.

---

## Sources (all seen 2026‑10‑12)

Official pages
- Runway — https://runway.com/pricing
- Pika — https://pika.art/pricing
- Luma — https://lumalabs.ai/pricing
- Viggle — https://viggle.ai/pricing
- Krikey AI — https://www.krikey.ai/pricing
- Cascadeur — https://cascadeur.com/plans
- DeepMotion — https://www.deepmotion.com/pricing-animate3d
- Synthesia — https://www.synthesia.io/pricing
- Vyond — https://www.vyond.com/pricing/
- Animaker — https://app.animaker.com/pricing
- Powtoon — https://www.powtoon.com/pricing/
- Steve.ai — https://app.steve.ai/pricing
- Adobe Express — https://www.adobe.com/express/pricing (shown in INR)
- Procreate Dreams — https://procreate.com/dreams
- Moho — https://moho.lostmarble.com/pages/buy
- Krita — https://krita.org/en/
- Pivot Animator — https://pivotanimator.net/ and https://pivotanimator.net/Download.php
- Stick Nodes Pro (App Store) — https://apps.apple.com/us/app/stick-nodes-pro-animator/id932128168
- FlipaClip (App Store) — https://apps.apple.com/us/app/flipaclip-create-2d-animation/id1101848914
- FlipaClip support — https://support.flipaclip.com/article/33-what-is-the-cost-for-flipaclip-plus ; https://support.flipaclip.com/article/36-free-trials-for-flipaclip-plus
- Animation Desk (App Store) — https://apps.apple.com/app/id946346179
- Plotagon — https://plotagon.com/desktop/
- Toon Boom shop — https://shop.toonboom.com/en/products/harmony (via search snippet)
- Apple Small Business Program — https://developer.apple.com/app-store/small-business-program/
- Apple Family Sharing for IAP — https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/turn-on-family-sharing-for-in-app-purchases
- Stripe pricing — https://stripe.com/pricing ; https://stripe.com/billing/pricing (US figures via search results; fetched page showed THB)
- RevenueCat 2026 benchmarks — https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026
- RevenueCat kids apps — https://www.revenuecat.com/blog/growth/whats-the-best-way-to-monetize-kids-apps/
- Diamond Animator current site — https://diamondanimator.com/

Third-party (less certain)
- Stick Nodes price tracker — https://www.apppricinglab.com/app/apple/932128168
- FlipaClip prices — https://filmora.wondershare.jp/video-editor-review/flipaclip-review.html
- Kling — https://www.eesel.ai/blog/kling-ai-pricing ; https://costbench.com/compare/hailuo-ai-vs-kling/
- Hailuo — https://www.aiarty.com/ai-video-generator/hailuo-ai-pricing.htm ; https://magichour.ai/blog/hailuo-23-pricing
- Kaiber — https://costbench.com/changelog/kaiber-price-increase-2026-02/ ; https://www.eesel.ai/blog/kaiber-pricing
- Renderforest — https://pricingsaas.com/companies/renderforest ; https://toolquestor.com/vs/renderforest-vs-powtoon
- Adobe Animate status — https://techcrunch.com/2026/02/04/after-backlash-adobe-cancels-adobe-animate-shutdown-and-puts-app-on-maintenance-mode ; price: https://josephnilo.com/blog/adobe-animate-price/
- Adobe Express US price — https://www.capterra.com/p/174232/adobe-express/pricing/
- Pivot Animator — https://en.wikipedia.org/wiki/Pivot_Animator
- Meta Animated Drawings — https://gigazine.net/gsc_news/en/20230414-meta-animated-drawings ; https://github.com/facebookresearch/AnimatedDrawings
- AI stick-figure tools — https://www.skills.sh/bassimeledath/stix/stix ; https://www.pixa.com/create/stick-figure-animation-generator ; https://www.flexclip.com/learn/animate-stick-figure.html
- RevenueCat summary — https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/
- Credit-pricing practice — https://schematichq.com/blog/ai-credits ; https://www.lava.so/blog/credit-based-pricing-ai
- COPPA 2025 amendments — https://jonesday.com/en/insights/2025/05/ftc-finalizes-amendments-to-coppa--rule
- Plotagon education (older) — https://www.techlearning.com/how-to/what-is-plotagon-and-how-can-it-be-used-to-teach-tips-and-tricks
