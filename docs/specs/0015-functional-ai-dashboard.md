# SPEC-0015 — Functional AI Dashboard, Usage, Accounts and Billing

Status: **Approved staged plan — Phase 1 authorized after this planning publication; Phases 2–6 Unauthorized / Not started**
Owner: Arthur
Planning role: Spec Architect; PM V5 owns review; PM V4 retains paused SPEC-0008
Created / last updated: 2026-09-26
Decision links: D-0144 (historical planning authority); D-0145 (Arthur/PM Phase 1 acceptance and planning-publication authority); P-0005; P-0007; D-0124; D-0093
TODO IDs: PLAN-015; DASH-015-1 through DASH-015-6
Planning baseline: `c682e430e204a7d750654da3f96e36ab4f57e196`, clean dedicated detached `/Users/arthurcarlin/.codex/worktrees/93e8/stick-animation-app`; equal to local canonical `main` and `origin/main` at boot. No fresh remote synchronization is claimed.
Authorization: Arthur accepted the revised Phase 1 TEST PREVIEW outcome and authorized its separate Plan-mode executor **after this planning package is published and synchronized**. Arthur also explicitly authorized publishing only this reviewed docs/tree package from the unchanged base. This task performs planning publication only; it does not implement Phase 1. Phases 2–6, accounts, external service setup, live/paid AI experiments and deployment remain unauthorized. The executor still owns exactly one phase in its dedicated worktree.

## 1. Intended outcome and first useful delivery

Replace the layout-only AI Dashboard with trustworthy usage information for **Project AI / AI Animator**, **Guidance Assistant**, and **Combined**. Existing project conversations count now, although Terra cannot yet create or edit animations. Actual animation jobs get a distinct category only when a separately approved implementation can attest to them. A create-animation intent, readiness reply or notification is not an animation job.

The final dashboard puts a responsive bar chart first; offers 1-minute, 15-minute, hour, day and week views; shows remaining allowance and percentage, refill/reset and billing timing, current plan, usage attribution, model/options explanation, plan changes and optional top-ups. Depletion colors progress blue → yellow → orange → red, with a visible gray 10%-remaining line and a 0%-remaining roof. No horizontal scrolling or fake financial numbers.

A useful first delivery is possible before billing: **Phase 1 shows a clearly named, display-only TEST PREVIEW of 10,000 recorded conversation tokens per Monday-start UTC week**, using retained Project AI and Guidance Assistant browser receipts. It also offers a clearly labeled, off-by-default synthetic Demo so Arthur can see every color, the 90% line, 100% roof and Monday reset without spending money. This preview is neither a real paid plan nor an AI request limit: exhausted preview wording must say AI continues working. Partial receipt coverage remains explicit. Phase 2 adds durable prospective server metering; Phase 4 alone may create authoritative paid allowance, real balance and admission/enforcement after separate decisions. A Phase 1 preview percentage is not a financial balance.

No tutorials, prompts explaining how to animate, model changes, search changes, dictation changes, tool changes, citation changes or SPEC-0008 resumption belong here.

## 2. Fresh evidence and current execution paths

### 2.1 Observed interface

**Live verified, 2026-09-26:** an agent-created background browser tab opened the existing canonical app at `http://localhost:3000/`, dismissed only its welcome overlay, and followed **Open AI dashboard** to `/credits`. The listener was PID `65160`, with cwd `/Users/arthurcarlin/Projects/stick-animation-app`; on-disk canonical main equalled the planning base. No new review server was started. The page showed `1,240`, `Creator`, `5,000 credits / month`, `April 1, 2026`, two plan cards and `500/2000/5000` top-up buttons. There was no chart, surface filter or real account state. The menu exposed Sign in / Log in / Sign out as text.

**Code verified:** `app/credits/page.tsx` renders those constants without a data read or checkout handler. `src/components/chrome/AIcreditspage.tsx` links to `/credits` under the visible AI Dashboard label; its account entries are inert divs. The attempted Buy-button click was blocked by automatic approval review because of its purchase wording and was not executed. Inert purchase behavior is therefore source evidence, not a successful live-click claim. No account or payment action occurred.

### 2.2 Project AI / current AI Animator

```text
New/Open → DrawingWorkspace → DrawingAiPanel
  → POST /api/ai-animator → normalizeAiAnimatorRequest → AiAnimatorJobService.submit
  → generateAiAnimatorReply → shared getOpenAiClient → Responses
  → strict model/reply checks → usage + latency result → terminal job snapshot
  → panel/root terraCompletionObserver → aiAnimatorStorage project ledger
```

Relevant files: `src/components/workspace/ai/DrawingAiPanel.tsx`, `app/api/ai-animator/route.ts`, `src/lib/ai/aiAnimatorContract.ts`, `src/lib/ai/aiAnimatorJobService.ts`, `src/lib/openai/generateAiAnimatorReply.ts`, `src/lib/openai/client.ts`, `src/lib/ai/aiAnimatorStorage.ts`, `src/lib/notifications/terraCompletionObserver.ts`.

- Fixed `gpt-5.6-terra`, four reasoning efforts, bounded conversation/workspace summary, no tools/search, `store:false`. Current successful output is conversation/readiness, not authored animation.
- Snapshot `telemetry.usage` has nullable input/output/total provider tokens and an estimated USD cost. Provider result can include response ID. Cost uses source constants, not a verified invoice or current price lookup.
- LocalStorage prefix `diamond_ai_animator_ledger_v1:` retains at most 40 jobs and 80 messages per workspace identity. It is not an account ledger. Not all keys correspond to saved projects; no global receipt index/cap exists. Scan the prefix, not My Projects.
- `completedAt` is job-terminal time. `ledger.updatedAt` is a write time and cannot timestamp a usage bar. Corrupt reads currently fall back to an empty ledger; the dashboard must distinguish corruption from no data.
- Normalization does not fully validate numeric telemetry or timestamp meaning. The dashboard must validate the fields it consumes itself, without changing the existing validator.
- Model/reply validation can throw before usage is retained. Cancellation can discard a late paid result. An unknown receipt is not zero cost.

### 2.3 Guidance Assistant and dictation

```text
/assistant → useAssistantSessions → beginTurn/requestFor
  → /api/diamond-assistant → DiamondAssistantJobService → assistantProvider
  → local catalog / existing eligible hosted search → validated answer/title/sources/usage
  → job terminal → root assistantCompletionObserver / session owner → finishTurn
  → Assistant-only IndexedDB sessions

explicit microphone Stop → transcription API → AssistantTranscriptionService
  → private transcription provider → transcript + usage receipt → editable composer
```

Relevant files: `src/components/assistant/useAssistantSessions.ts`, `src/components/assistant/AssistantComposer.tsx`, `src/lib/assistant/assistantDictationCapture.ts`, `app/api/diamond-assistant/route.ts`, `app/api/diamond-assistant-transcription/route.ts`, `src/lib/assistant/assistantContracts.ts`, `assistantStorage.ts`, `assistantJobService.ts`, `assistantProvider.ts`, `assistantSearchPolicy.ts`, `assistantTranscriptionService.ts`, `assistantDictationContract.ts`, and `src/lib/notifications/assistantCompletionObserver.ts`.

- `diamond-assistant-session-v1` / `sessions` owns up to 50 validated local chats. Completed turns retain input/output/total tokens, estimated USD, price date, response ID, model/reasoning, latency and hosted tool-call count. Search cost is already included in that stored cost; never add it twice.
- `Turn.endedAt` is **client persistence time**, not exact provider finish or invoice time. Session `updatedAt` changes on rename/settings and must not move usage between buckets.
- Failed/cancelled/interrupted turns and prior attempts retain no usage. A successful provider result cancelled during Finalizing can also be lost to this history. Deleted chats/old evicted Terra jobs cannot be reconstructed.
- Transcription returns duration/estimated-cost metadata but the composer does not persist a durable receipt. Phase 1 must explicitly exclude dictation. Phase 2 must observe it separately, even when the transcript is never sent as a chat question.
- Guidance requests exclude project identity/content and mutation commands. Do not add project attribution to that request. Analytics ownership is account/surface/session metadata outside the model payload.

### 2.4 Missing foundations and conflicts

| Evidence | Implication / required handling |
| --- | --- |
| No product auth, subscription, checkout, webhook, entitlement or authoritative credit ledger found in the traced app/routes and dependency inventory | Menu labels and existing Supabase dependency prove none of these. No current paid plan or reset can be inferred. |
| `/api/ai-animator` trusts caller project/job identity; its in-process maps are not durable account ownership; Assistant/transcription have local access safeguards, not hosted user auth | Do not expose these existing services publicly. Phase 3 owns security wrappers and durable user binding only after its entry gate. |
| Legacy `/api/ai` and project-memory route remain; project-memory service-role path lacks verified tenant ownership | Public launch must authenticate/authorize or make unreachable **every** legacy provider/service-role door, not only the dashboard. Runtime fixes wait for Phase 3's exact boundary. |
| `src/lib/ai/devAiCostDashboard.ts` / `/dev/ai-costs/**` record legacy model calls and may retain full prompts in ignored local JSONL | Not a complete source for current Terra/Assistant or a customer ledger. Never ingest its prompt log into this dashboard. No legacy log cleanup here. |
| Historical zero-retry prose versus `getOpenAiClient()` constructing `OpenAI({apiKey})` without `maxRetries` | Installed canonical OpenAI 6.32.0 defaults `maxRetries` to 2; Terra has no application resend but may have transport retries. Assistant explicitly disables retries. Preserve current behavior; require attempt visibility/reconciliation before billing. No retry repair is authorized. |
| D-0124 removed cumulative local Assistant spending stops | Phase 1's 10,000-token TEST PREVIEW and Phase 2 metering are display/observation only. AI continues after preview exhaustion. Hosted balance admission is a later owner decision, never a silent reinstatement of local daily/monthly caps. |
| D-0093 pauses SPEC-0008 after completed Phase 1 | Meter current conversation; do not edit its spec, resume its phases or infer animation from intent. PM V4 retains that track. |
| SPEC-0014 reserves dormant low-usage events and permits only Home/Assistant bells | A chart warning is in scope; activating a bell producer is **deferred**, requiring a later explicit integration decision. No bell on the Dashboard, no new notification or Export producer. |
| Inherited full-build dev AI-cost `PageProps` failure and five lint errors recorded in current evidence | Reproduce base/result if needed during implementation; no broad repair in Phase 1. Full production build remains a launch gate. |

These conflicts are recorded here under D-0144's research and D-0145's accepted Phase 1 resolution; older docs are not silently treated as implemented financial behavior. Existing provider prices/model IDs above describe source bytes only. This task did not verify live access, current model pricing or invoice accuracy and made no inference that a provider call is free.

## 3. Owner explanation: four separate things

An **account** identifies a person across sessions/devices. A **plan** defines what the service sells and when it bills. **Credits** are the app's explicitly priced usage unit. **Provider usage** is what the AI supplier measures and charges Diamond Animator. The dashboard must not mix these concepts.

A provider token is a piece of model input/output. Input, cached input, output/reasoning, hosted search and audio need not cost the same. Visible reply length is not total usage. The same user message may incur several cost components. The existing fixed Terra model and reasoning options remain; the plan may offer more allowance, but must not secretly choose a cheaper brain. Explain that higher reasoning may use more time/usage, without promising a fixed multiplier or better result. A model selector is not part of V1.

**Recommendation, not an approved financial term:** call the purchased unit **AI credits**, publish a versioned cost-to-credit schedule, and show provider-token detail separately. Do not sell “50,000 tokens” unless the unit, included token types, model, search/audio handling and conversion are defined. Arthur's smallest ~50k, largest ~230k, three ascending plans, optional ~5k/~10k/~15k top-ups, and $20/month with ~$4–5 margin are illustrations only. No quota, pack, price, cadence or profit is approved by this spec.

### 3.1 The weekly subscription / unused 99% choice

A fixed paid weekly subscription renews at its disclosed fee even when someone uses only 1%. Rollover can preserve the unused 99%; it cannot also make that renewal charge disappear. These are different promises and need Arthur's later choice at **G-ECON**, before Phase 4:

| Option | What happens after 1% use | Tradeoff |
| --- | --- | --- |
| A — Prepaid wallet, buy only when wanted (recommended if avoiding unnecessary new usage charges is the strongest goal) | Remaining 99% stays according to approved expiry terms; no automatic repurchase | This is not a fixed paid weekly usage subscription. A separate optional membership would need its own value/fee terms. |
| B — Fixed weekly subscription with included credits and explicit rollover | Unused credits carry under the approved cap/expiry; weekly fee still renews until cancelled/paused under its terms | Preserves some/all unused usage but does not avoid the recurring fee. “Never lose 99%” requires no silent cap/expiry forfeiture. |
| C — Membership fee plus separate prepaid wallet | Membership renews; unused credits remain; new credits are bought only explicitly | Separates access from usage, but a low-use customer still pays the disclosed membership fee. |

Recommend starting financial design with A, or choosing B only after Arthur explicitly accepts its recurring-fee tradeoff. A weekly reporting chart or weekly refill need not mean weekly charging. Billing cadence, grant cadence, expiry and chart interval are separate configuration fields. A monthly charge with weekly grants requires a defined calendar schedule, including months containing five grant dates; never assume one month is four weeks. No auto top-up, forced upgrade, automatic credit repurchase or undisclosed negative balance.

### 3.2 Economics entry evidence

G-ECON must approve: three plan definitions; currency/taxes; fee/grant cadence; quotas and credit conversion; rollover/expiry/carry cap and treatment on cancellation; top-up sizes/prices/expiry; proration/downgrade policy; customer charge policy for failures/cancellation/unknown usage; refunds/disputes; provider/platform risk caps; and effective/version dates. Compare low, median and heavy use plus output-heavy, high-reasoning, search, audio, failed and retried scenarios.

Net contribution is collected revenue less provider input/cached/output/tool/audio spend, payment fees, applicable taxes, refunds/disputes, hosting/storage and support allowances. Provider tokens are not revenue and markup is not guaranteed profit. A $20 receipt does not establish $4–5 margin. Use current official provider/payment information and account access evidence at that gate; use deterministic scenarios first. A live experiment needs a separate exact request count, token/tool/audio/time limit, spend ceiling, credential/environment, isolated data and stop authority. This planning task authorizes none.

## 4. Chart contract: Phase 1 TEST PREVIEW and later funded mode

The first chart is at the top of `/credits`, titled **AI Dashboard**. Loading, empty, partial, unavailable, stale and ready are separate states. A failure must not briefly flash a confident `0` or `100%`, a paid plan name or a financial refill date. Dates use an explicit clock/timezone; formatting never changes stored events.

### 4.1 Phase 1 weekly recorded-token TEST PREVIEW

- Place **Temporary test line based on retained conversation receipts in this browser** next to the chart, with **10,000 recorded conversation tokens per UTC week — TEST PREVIEW** and a plainly labeled **Demo** switch. Real retained receipts are the default; Demo is off by default, uses synthetic fixture receipts and a frozen clock, and never persists or modifies real source data. This is not a paid plan, account balance, provider bill or request limit.
- A UTC week begins Monday 00:00 and ends at the next Monday 00:00. For each visible bucket, sum valid retained Project AI and Assistant receipt totals from that bucket's own UTC-week start through its end (through `now` for the current partial bucket). Half-open event intervals and timestamp ordering avoid double counting. A bucket crossing Monday displays the post-reset week's cumulative value and exposes the prior-week end/reset in its accessible detail; historical bars retain their own 10,000-token denominator. No billing, purchase or actual refill is inferred.
- Combined bars use `min(100%, 100 × combinedWeekTokens / 10000)` for visible height. Project AI and Assistant filters use **that selected source's cumulative contribution / the same 10,000 shared test denominator** for both entire solid bar height and color. They do not stack, dim an unchanged combined bar, or invent private source quotas. The separate Combined weekly total, progress and remaining-preview figure stay pinned above the chart in every filter, with warning state derived from Combined. Tooltips/details show both source amounts, Combined and selected contribution. Over-cap values remain numeric and are visually clamped to the roof.
- The color scale is piecewise blue `#2563eb` at 0%, yellow `#eab308` at 50%, orange `#f97316` at 75%, and pure red `#ff0000` at 100%. Interpolate between stops. A gray line at 90% says **10% remaining — shared TEST PREVIEW**; a solid red roof at 100% says **0% remaining — TEST PREVIEW exhausted**. The exhausted message explicitly says **AI continues working**. A zero-height bar may be invisible; a positive 1% bar is a small blue bar. Text, outlines and accessible details convey status without color.
- Real mode states **This browser only. Older/deleted records, dictation, and some failed/cancelled requests are missing; this may undercount actual provider usage.** Incomplete or unreadable source coverage must be named and must not assert a confident combined percentage or remaining amount. Valid partial receipts may still be inspected, separately labeled as partial. Invalid IDs/timestamps, nonfinite/inconsistent totals, duplicates and unknown usage are excluded/flagged, never assigned zero. Deleting a chat or evicting a job can lower displayed history; no dashboard copy is stored to defeat deletion.
- Recreate the accepted lower dashboard cards **afresh** under the Dashboard allowlist: recorded-token totals by Combined/Project AI/Assistant; input versus output token breakdown; stored estimated provider cost with price provenance/unknown caveat; other activity including known hosted-search calls and excluded dictation/failed/cancelled/unknown attempts; and an unconfigured **real plan/allowance/billing** card. The rejected review archives are recovery evidence only, never implementation source bytes. Cost is an estimate, search already included in a stored Assistant estimate is not charged twice, and missing cost is unknown. Real plan says **No paid plan connected**; real allowance, next real refill/renewal, plan change and top-up are **Not configured**, never the test line. Remove current pretend Creator/1,240/date/purchasable packs. Lower cards remain visible in both real and Demo with unmistakable synthetic labeling in Demo; they must not imply demo purchases or account state.

### 4.2 Time controls, geometry and synthetic review fixture

All bucket boundaries use **UTC**, including midnight days and Monday-start weeks. The chart shows the current partial bucket plus the preceding N−1 buckets, oldest on the left and newest on the right. Use half-open `[start,end)` event membership; an event exactly on a boundary enters the new bucket. Terra `completedAt` and Assistant `endedAt` are receipt times; mutable ledger/session update times never move a receipt. Invalid/future timestamps are reported as unavailable-time records. A client clock change recalculates the view without editing history. Compact visible date range and sparse ticks prevent clutter; exact UTC timestamps, local zone/offset and counts remain in keyboard/tap/focus/hover details and an accessible bucket table. There are **no Previous/Next/Now controls or rotated timestamps**.

| Selector | Bucket duration | Visible buckets / window |
| --- | --- | --- |
| 1 min | 60 seconds | 24 / 24 minutes |
| 15 min (default) | 900 seconds | 24 / 6 hours |
| Hour | 3,600 seconds | 24 / 24 hours |
| Day | 86,400 seconds | 14 / 14 days |
| Week | 7 UTC days, Monday 00:00 start | 8 / 8 weeks |

The plot is 220 CSS px tall at a fixed viewport. Each solid bar grows **from the floor**, uses its slot width with approximately 7 CSS px horizontal gap, and never floats at an arbitrary y position. Bars remain in chronological order. The 24-slot minute/15-minute/hour views have equal widths at the same viewport; day has 14 wider slots and week has 8 wider slots. Do not artificially grow bar height by changing plot height, scrolling horizontally, dropping/merging buckets or rotating timestamps. Narrow bars still have keyboard/text access.

Demo uses exactly these synthetic completed receipts and frozen `2026-09-21T00:30:00Z` (Monday): Sunday `2026-09-20T18:50:00Z` Project AI 1,000; `19:30` Project AI 3,000; `20:00` Assistant 1,000; `21:00` Assistant 2,500; `22:30` Assistant 1,500; `23:45` Assistant 1,000; Monday `00:05` Project AI 80; `00:10` Assistant 20. Previous week is exactly 4,000 Project AI + 6,000 Assistant = 10,000; new week is 80 + 20 = 100. The default six-hour window shows 10% blue → 40% → 50% yellow → 75% orange → 90% warning → 100% red roof → Monday reset to 1% blue. All five views derive from these same receipts and frozen clock, with no extra fabricated events. Demo has no storage writes or provider calls.

Test at 1440×900, 768×900 and 360×800, plus 320 CSS-px reflow and 200% zoom. All Dashboard controls/cards wrap without horizontal overflow or floating buttons. Scope CSS to the new screen; shared header behavior is unchanged. If shared header overflow prevents acceptance, report the blocker rather than widening Phase 1. Focus/hover/tap exposes equivalent details; reduced motion is static; forced colors and text labels retain meaning.

### 4.3 Allowance depletion — Phase 4 onward

The final default for an authenticated funded account is **Allowance depleted at interval end (%)**. It is explicitly **cumulative within the account allowance period**, not spend during the displayed bucket. A separate Recorded activity switch preserves interval usage inspection. The chart range is independent of the allowance/billing period; both are named.

For a server-defined period `p=[periodStart,periodEnd)` and ledger sequence/time `t`:

- `C_p(t)` = net settled **user-credit usage** allocated to p by the immutable reservation/settlement policy; usage reversals subtract from C. Provider costs do not directly enter this sum.
- `R(t)` = posted unspent, unexpired credits usable at t, before temporary reservations; include eligible carried and top-up lots.
- `D_p(t) = C_p(t) + R(t)` = the effective allowance backing this period's usage and remaining balance. Within a period with no cross-period corrections this equals opening eligible balance plus grants/top-ups, less unused expiry/refund/revocation removals. Late settlement/reversal allocated to a prior admission period additionally adjusts the later period's effective carry (negative/positive respectively); it is not later-period consumption. C+R is the normative formula. A same-period usage refund decreases C and restores R without changing D.
- When `D>0`, depletion=`100*C/D`, remaining=`100*R/D`. Use exact integer credit units internally and bounded decimal display. `availableNow = R − activeReservations` is shown separately with **Temporarily reserved**; reservations do not become settled bar consumption.
- `D=0` with no funded allowance is **No allowance**, percentage unavailable. Unknown/stale ledger is **Balance unavailable**. Neither is invented as exhaustion. A funded allowance consumed to `R=0, C>0` is 100% depletion / 0% remaining and pure red. If all credits expire without use, show **Credits expired / no usable allowance**, the expiry event and 0 available without calling it AI consumption.

Each bar samples the authoritative state immediately before the bucket end, or the latest sequence for the current partial bucket. Historical samples keep their time-correct denominators. Do not sum/average percentages across intervals. If a day/week crosses a refill/reset, show a reset marker and tooltip/table entries for each period segment, its last pre-reset state, then the final segment's bucket-end state. The visible bar is that final state, with a boundary hatch so an exhausted earlier segment is not concealed. Do not connect across a reset as if it were a refund.

At a new allowance period C restarts at 0; eligible carry becomes opening R. Preserve prior-period consumption. **Refill** is a posted grant; **renewal** is a bill; **reset** is a reporting-period boundary; **expiry** is removal of an unused lot. They may occur at different times. Show scheduled versus confirmed/pending/failed states and absolute timestamps alongside a countdown derived from server time.

A top-up creates a posted grant only after verified payment settlement. Example, purely arithmetic: C=90, R=10, D=100 → 90% depleted; adding 100 yields C=90, R=110, D=200 → 45%. Earlier bars stay at their original values. Add a labeled grant marker and tooltip explaining the denominator increase; no usage disappeared. Refund/expiry/admin adjustments are separately labeled events, never disguised as negative token use. Late provider reconciliation changes the affected historical ledger projection with an adjustment marker and audit revision.

**Warnings and palette:** piecewise interpolate blue `#2563eb` at 0% depletion → yellow `#eab308` at 50% → orange `#f97316` at 75% → red `#ff0000` at 100%. The 90%-depleted line is visible gray with **10% remaining**; top border/roof is **0% remaining — allowance exhausted**. At 100% use solid pure red. Always include text values and hatch/outline as needed for contrast, including forced-colors mode. Unknown portions are gray/hatched, never presented as known consumption. Exact accessibility contrast may refine surrounding/label colors, not invert warning meaning.

**Filtering keeps one shared denominator.** Combined displays source contributions to C/D; source filters highlight the selected contribution and dim the other rather than rescaling to an invented surface quota. Total outline, total remaining card and warning status remain account-wide. Tooltips show Project AI, Assistant, any separately labeled adjustment/unattributed component and total. Use patterns/labels to distinguish sources; bar depletion color describes combined depletion. No unsupported provider operation may be silently assigned to Assistant/Animator to force totals to match.

## 5. Data ownership and metering target

### 5.1 Phase 1 read projection

A new dashboard-only reader inspects existing browser records and returns a minimal DTO: source, receipt identity, terminal/recorded time, reasoning/model label, known token fields, stored estimated cost/price provenance, search-call count, status, coverage flags. It never returns prompt, answer, title, source URL, raw project/session ID or prompt digest to chart components, logs or external services. Internal dedupe can use exact IDs without displaying them.

Assistant: readonly transaction on the existing sessions store, verify key equals validated session ID and call `validateSession`; derive completed-turn receipts and unknown/prior-attempt counts. Do not call `listSessions()` and claim zero writes: it creates a DB on first use. Open the existing DB with upgrade aborted when absent; never initialize/migrate/delete it for a dashboard visit. Close on versionchange/unmount and report blocked/unavailable/corrupt sources separately.

Terra: enumerate only the canonical exported prefix, decode/re-encode keys, require body project ID match, validate bounded records, terminal state/outcome, UTC timestamps, finite safe nonnegative integer tokens and total equality where all fields exist, and nonnegative finite stored cost. Do not use empty-on-error `readAiAnimatorLedger()` as a validity oracle. Distinct keys, duplicate events and notification copies must not multiply one job receipt. Deduplicate by namespaced surface + workspace-generation/job or session/turn/job identity; conflicting duplicates are excluded with a coverage issue, not last-write-wins sums.

Bound work before rendering: inspect at most 500 prefixed Terra keys, 40 jobs per key, and 50 Assistant sessions within the inherited 32 MiB bound. Limit a Terra raw ledger read to 1 MiB before parsing. Excess/corrupt rows remain untouched and produce a visible incomplete-coverage state; never call a limited scan complete. Process in cancellable chunks, publish only a complete scan generation, and do not let stale async reads overwrite a newer filter/snapshot. These are reader capacity limits, not new AI usage limits. The executor may lower chunk sizes without changing capacity or outcome.

Refresh on entry, explicit Refresh, focus/visibility, existing Assistant subscription and Terra changed/storage events. Coalesce duplicate invalidations. A short visible-page refresh interval may be used (no faster than 5 seconds) solely for local reads if events are unavailable; stop when hidden/unmounted. The new dashboard adapter performs no job polling, server query, background provider work, durable analytics storage or source-store write in Phase 1. Existing root notification observers remain active and unchanged: they may initialize the Assistant DB through listSessions(), poll already-started jobs and commit their completion while /credits is visible. Inventory these existing effects separately; do not suppress them or claim the entire page has zero writes/polls.

### 5.2 Prospective durable meter — Phase 2

A separate, versioned **server-owned, content-free usage journal** begins at an explicit coverage timestamp. It observes both existing conversation providers and transcription. It survives job-map eviction/restart and is independent of chat deletion, notification delivery and visiting the Dashboard. Local instance scope is not a user account and may not be shown as “your usage” in a shared environment. Expose its read API only to the existing private loopback boundary; no deployment or hosted access is unlocked.

Record logical operation, attempt identity, surface (`project_ai`, `guidance_assistant`), operation kind (`conversation`, `hosted_search`, `dictation`; future `animation_job` reserved/inactive), origin reference, environment, requested/returned model, reasoning, accepted/dispatched/finished/recorded times, outcome, usage quality, provider response/request IDs, pricing version, observed token subcounts/tool count/audio seconds, estimated provider cost and reconciliation state. Keep explicit `not_dispatched`, `observed`, `partial`, `unknown`, `reconciled`; store nullable values instead of substituting zero. No raw prompt/reply/audio/transcript/search text/URLs and no account cookies/keys in telemetry.

Observe returned provider usage **before** downstream answer/schema/citation validation can discard it, and at terminal/finally boundaries for failure/cancel. A cancelled user answer and a paid provider operation are independent facts. Preserve SDK transport policy, instructions, search decisions, dictation flow, response schemas, timing, request-count semantics and retries. Do not disable retries to simplify accounting. If transport attempts cannot be individually observed without changing the protected behavior, label coverage unknown and require provider reconciliation; do not declare billing-ready. Tool call events belong to the parent operation with separately priced components, not a second charge of already-inclusive usage.

The meter must never throw into, delay beyond a bounded enqueue, block or retry the AI path. A bounded queue/journal failure changes telemetry health, not the answer. Best-effort pre-billing observation may lose data on a crash and must mark a coverage gap; it cannot claim exactly-once billable accounting. Phase 4 replaces admission with durable reservation/outbox semantics before enabling charges. No serverless ephemeral filesystem can serve as a paid ledger. Phase 2's entry package must choose a reproducible local durable store and retention/backpressure design without an external account.

A reconciliation worker consumes existing authorized provider evidence later; it never replays an AI job to obtain missing usage. Do not automatically import Phase 1 browser receipts into the financial ledger or add them to overlapping Phase 2 totals. Display them as separate coverage eras/scopes, with authoritative server data taking precedence only where exact identity matches. Legacy prompt logs are excluded. Legacy provider routes are disabled or separately attributed before public launch under Phase 3, not silently counted as new animation jobs.

### 5.3 Financial ledger — Phase 4 onward

Use a transactional authoritative server datastore with migrations, backup/restore and unique constraints. Immutable ledger entries link accounts, versioned plans/prices, entitlement periods, credit lots, reservations, settlements, reversals, payments/invoices/refunds/disputes and audit actors. Corrections append compensating entries; never edit historic billed usage in place. Browser caches cannot mint credits or select prices/owners.

Atomic admission: authenticated owner + request fingerprint + unique operation ID → check account/plan/lot availability and per-user/platform risk budgets → reserve the approved maximum credits and provider-risk amount → durable outbox dispatch → provider observation → settle actual approved debit and release remainder. Concurrent tabs, processes and devices share this transaction; one request cannot spend the same last credit twice. A duplicate with same identity and different payload fails; identical retries return the existing operation state. A process crash after dispatch never triggers a blind second provider request.

Reserve from eligible lots in earliest-expiry order, then grant time/ID; hold the exact lots for the operation's bounded deadline. Preserve their eligibility through settlement for the reserved amount; expiry removes only unreserved remainder. Requests are attributed to their **admission period** for usage and conversion; crossing refill or price-version changes does not silently reprice or shift a charge. Provider finish time remains separately visible for activity. Late settlement restates that period with an audit marker and recomputes subsequent effective carry; it must not mint a new-period usage debit as well. Maintain both recorded-at and effective/admission attribution with a ledger revision, so corrected historical views are labeled as revised and an audit can reconstruct the originally reported view. Example: p1 has C=0/R=100 with 80 held; p2 initially opens R=100; the late 80 settles to p1. Corrected p1 becomes C=80/R=20/D=100, while p2 has C=0/R=20/D=20 and a −80 prior-period carry adjustment. A reversal applies the symmetric carry correction. Existing true-time top-up grants still never retroactively change pre-grant denominators. Phase 4 must prove this projection against the independent temporal ledger oracle before enabling balances.

If returned usage exceeds the reserved/approved charge ceiling, stop follow-on work and flag the excess as platform cost pending owner policy; no hidden customer overdraft or automatic purchase. Unknown outcome remains pending/reconciliation with a bounded hold policy chosen at G-ECON; do not grant a potentially spent reservation back and automatically resend. If the provider cannot establish the charge, the approved customer-friendly resolution may release/credit the user while recording platform loss. Numeric caps, resolution deadline and charge/refund policy must be approved, not invented by an executor.

Credits and money use integers (minor currency units and a documented credit subunit), with deterministic rounding once per priced operation, never cumulative floating-point rounding. Retain raw provider units separately. Cached/reasoning subtotals are components of provider totals where documented, not added twice. No 1:1 mapping is assumed. Monetary reconciliation accounts for payment fees/tax independently of credited usage.

## 6. Identity, payment and operating safeguards

### 6.1 Accounts and permissions — Phase 3 gate

Select an auth/database/deployment architecture with Arthur before implementation, including operator/legal account owner. Existing Supabase packages do not select a service or authorize creating one. Prefer a maintained identity provider and server-validated sessions rather than custom passwords. Define sign-up/login/logout/recovery/session expiry, verified email if used, protected admin access/MFA, CSRF/same-origin protection and Secure/HttpOnly/SameSite cookies. Never accept user/account/customer ID from the browser as authority.

Check ownership on every job read/cancel, dashboard query, entitlement and payment action. Account A cannot list/read/guess/cancel B's work, balance, invoice or webhook mapping. Guidance sessions remain free of project payloads; server-side ownership metadata must not enter AI context. Anonymous local history never becomes shared cloud history automatically. First sign-in must explain that local projects/chats remain on this browser; do not claim cross-device project sync. Account switches clear financial caches; local profile privacy and optional import need an explicit reviewed policy before shared-device launch.

Inventory every provider/privileged route, including legacy `/api/ai`, `/api/drawing-project-ai-memory`, `/dev/ai-costs`, Animator, Assistant and transcription. Authenticate/authorize or disable unused routes in the hosted deployment; never leave an unmetered bypass. Preserve private local behavior under D-0124 unless Arthur explicitly supersedes it. The hosted/private-mode distinction must be server-controlled and cannot be selected by request headers/query params supplied by clients. Service-role credentials stay server-only; row policies alone do not protect service-role bypasses. Rate/size/concurrency limits, same-origin/CSRF validation, account/IP risk signals and global spend caps supplement authentication.

Proposed controls align with [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). The implementation must test its selected stack; reading these sources is not security certification.

### 6.2 Payment flow — Phase 5, sandbox first

Recommend a hosted checkout/customer portal integration to avoid handling card numbers. Provider choice, supported merchant/country/currency, fees, taxes, contracts and account eligibility remain G-PAY decisions; Stripe is a researched example, not selected or configured.

1. User selects an approved plan/top-up from server configuration and sees exact price/currency/tax, amount/unit, billing frequency, renewal, rollover/expiry, cancellation/refund and downgrade terms before leaving for checkout.
2. Server creates one pending order tied to authenticated account, immutable product/price version and an idempotency key. Browser cannot supply authoritative amount, granted credits, owner or return URL.
3. Hosted checkout collects payment. Returning to the app shows **Payment confirmation pending** until trusted processing is complete. A success URL, screenshot or client callback cannot grant credits.
4. Verified webhook authenticates the raw body with provider signature/timestamp/replay rules, validates environment/customer/order/product/amount/currency and expected final paid status, durably records the event, and applies exactly one business grant in a transaction. Acknowledge only after durable acceptance; process via bounded retry/outbox where appropriate.
5. Duplicate/reordered events and distinct event IDs about the same invoice/payment are deduplicated by event ID **and business operation key**. A late paid event cannot overwrite a later refunded/disputed/cancelled state. Re-fetch authoritative payment state when ordering is ambiguous, within bounded service policy.
6. UI refreshes the authoritative ledger and shows one receipt, one balance increase and exact terms. Failure/cancelled/abandoned/expired checkout does not charge usage credits or fake a success.

[Stripe's webhook guidance](https://docs.stripe.com/webhooks) documents duplicate and unordered deliveries and signature verification. Its [idempotency guidance](https://docs.stripe.com/api/idempotent_requests) permits key pruning after at least 24 hours; the app needs longer-lived business dedupe. Revalidate the selected provider at G-PAY.

Renewal: a confirmed paid invoice may grant that period once; failed payment becomes past-due with approved grace/retry policy and truthful next-action state, not an automatic fresh grant. Cancellation at period end, immediate cancellation, pause and resume need distinct supported terms. Default recommendation is next-period plan changes with no proration; immediate upgrades/proration require an explicit quote and acceptance. Downgrades must not silently destroy bought/rolled credits. Portal changes also flow through verified server reconciliation.

Refunds/disputes: preserve original payment, grant and usage. Reverse only eligible unused credit lots via linked entries, record partial refunds, and freeze affected unspent disputed credit pending resolution under approved policy. Already-used disputed credits are platform exposure/review, not fabricated negative user tokens or project deletion. Resolve chargeback wins/losses idempotently. Customer support/admin adjustments require narrow permissions, reason, audit record and two-party review above an owner-defined threshold. No money is returned by merely changing the dashboard balance.

### 6.3 Cost, abuse, privacy and failure

- Keep existing per-request model/input/output/time/tool/audio/concurrency/cancel safeguards. Later hosted per-user daily/monthly provider-risk and platform caps require G-CAPS approval and do not change how admitted AI work thinks or uses tools. Reject new admission clearly when known funds/risk authority is unavailable; never switch models or degrade replies silently.
- Version prices with effective dates and source evidence. Unknown/new model/tool price blocks new **paid** admission until reviewed; it does not rewrite old costs or private Phase 1–2 behavior. Supply emergency pause/kill switches and operator budget alerts before launch. No unlimited usage claim.
- New telemetry contains no conversation text, raw audio, search query/URL, payment instrument or secret. Choose retention/deletion windows at G-PRIV before Phase 2 persistent telemetry and before hosted accounts. Keep financial retention legally/operationally separate from chat deletion; explain it to users before collection. Apply minimal-access logs, encryption, tenant isolation, access auditing and safe export/delete paths. Never make a low-entropy prompt hash a public identifier.
- Handle clock skew, offline UI, database outage, disk/full retention limit, queue overflow, partial provider responses, restarts, duplicate webhooks, expired sessions and payment outages. Preserve confirmed records and label stale/unknown; never overwrite a last good balance with zero. Reconciliation has bounded retries, an alertable dead-letter state and no duplicate grants/debits.
- Accounting is a separate control boundary around provider admission/settlement. No canvas, timeline, project-save, recovery, Export, tutorial, notification or AI content owner is repurposed as a ledger.

## 7. Phase map and authority

Each row is independently reviewed; no phase starts automatically. Later rows are bounded proposals with named entry gates, **not** detailed dispatch permission. Before each later authorization, refresh current main/evidence and record the exact path ceiling and deterministic command list in this spec; no executor resolves an unresolved product/security/economic choice by guessing.

| Phase | Reviewable outcome | Required entry / exit proof | Protected boundary |
| --- | --- | --- | --- |
| 1 — Weekly TEST PREVIEW dashboard | Read-only retained receipts; shared 10,000 recorded-token UTC-week display line; cumulative floor bars and source filters; clearly labeled synthetic Demo; lower analytics/unconfigured-real-plan cards | Arthur/PM accepted this outcome and authorized a separate executor after this planning publication. §8 exact scope and §9 proof; no commercial price needed. Exit: actual receipts and Demo visibly obey every filter/time view/reset and both existing chat sources update through ordinary mocked flows with zero dashboard source writes. | No AI/API/provider/storage-owner edits, enforced cap/accounts/notifications/checkout. Preview exhaustion never blocks AI. |
| 2 — Durable observational metering | Content-free prospective server journal and coverage-aware activity for chat/search/dictation; no bill | Phase 1 integrated; G-METER/G-PRIV approved; exact additive seams/store/API paths locked. Exit: before-validation receipts, cancel/unknown/crash/restart/dedupe/retention/fault tests and unchanged provider payload/timing/request counts. | No model/tool/retry/reply/citation/dictation change; telemetry failure never blocks AI; no cumulative enforcement. |
| 3 — Identity and ownership foundation | Local/emulated account/session flow, authoritative tenant binding, protected read/cancel/usage and privileged route inventory | Phase 2 integrated; G-AUTH approved; exact migration/route/config paths locked. Exit: two-user/session/account-switch/CSRF/cross-tenant/access-bypass tests and backup/restore; zero live account setup. | No cloud project/chat sync, payments, economic grants or SPEC-0008 changes. Hosted provider activation remains off. |
| 4 — Entitlements and funded depletion dashboard | Versioned credit lots, atomic reservations/settlements, authoritative allowance/refill/plan read model, final chart math and warnings | Phase 3 integrated; G-ECON/G-CAPS/G-PRIV approved and D-0124 hosted reconciliation explicit; exact ledger/admission/dashboard paths locked. Exit: contention/crash/unknown/expiry/rollover/refill/topup/refund arithmetic with fixture funding, no real money. | No change to AI payload/brain; approved hosted admission only. Private local mode unchanged. No fake ordinary paid plan. |
| 5 — Payment lifecycle in sandbox | Hosted checkout/portal adapter, verified webhook/reconciliation, renew/change/topup/cancel/refund/dispute | Phase 4 integrated; G-PAY approved; test-mode account/service interactions separately authorized. Exit: duplicate/reordered/forged/missed events and all purchase/renewal flows through test mode with exact receipts/balance proof. | No live charge, merchant account creation, tax/legal commitment or deployment implied. Offline doubles remain default gate. |
| 6 — Reconciliation, operating proof and launch readiness | Full accounting/usage/customer-flow proof, privacy/security/retention/backup, cost envelope and launch runbook | Phase 5 integrated; G-LAUNCH evidence; exact proof/hardening paths locked. Exit: no unexplained balance/provider/payment discrepancy, production build/abuse/a11y/load/recovery acceptance and owner economics/terms decision. | No automatic live activation/deployment/provider or payment experiment. Any narrowly bounded live proof needs its own instruction and ceiling. |

Recommended executor models under D-0132: `gpt-6-sol` High for Phase 1; `gpt-6-sol` Extra High for bounded instrumentation; `gpt-6-astra` Extra High for consequential identity/accounting/payment architecture review when warranted. These are planning recommendations, not a task/model dispatch.

The complete final V1 is **not authorized as one task**. Arthur approved the revised Phase 1 outcome and its separate executor, effective only after this docs publication/synchronization and exact-base Plan-mode boot. Later phases must pass their gates; financial uncertainty does not block the display-only Phase 1 or authorize invented financial promises.

## 8. Phase 1 exact implementation contract

### 8.1 Entry, scope and ceiling

Entry: Arthur/PM have accepted the revised Phase 1 outcome and Arthur authorized a separate executor after planning publication. Publish/synchronize this exact planning package first; the executor uses its dedicated clean phase worktree from the then-canonical-main planning SHA, starts in Plan mode, verifies the exact base, empty index, exclusive ownership and live paths, then implements only Phase 1 under that authorization. The older research baseline above is not a dispatch SHA. An executor already booted at the prior base must update to the newly published planning SHA before implementation, without borrowing this architect worktree. No other worktree is edited here. Allow no more than 120 minutes of programming including verification/proof before reporting status rather than silently expanding scope.

Allowed tracked paths (maximum 14; unused paths need not be created):

| Path | Purpose |
| --- | --- |
| `app/credits/page.tsx` | Replace static financial cards with dashboard screen entry, preserve route/chrome |
| `src/components/ai-dashboard/AiDashboardScreen.tsx` | Real/Demo, filter/refresh/coverage/pinned shared preview and lower cards/disabled real financial actions |
| `src/components/ai-dashboard/AiUsageChart.tsx` | Responsive cumulative weekly preview chart, warning line/roof, keyboard/table access |
| `src/components/ai-dashboard/AiDashboard.module.css` | Scoped layout and responsive/accessibility styling |
| `src/lib/ai-dashboard/dashboardContract.ts` | Minimal read-only DTO, units, states, bounds |
| `src/lib/ai-dashboard/dashboardSources.ts` | Non-mutating existing-store adapters and subscription cleanup |
| `src/lib/ai-dashboard/dashboardAggregation.ts` | UTC buckets, per-week cumulative arithmetic, dedupe, selected-source shared-denominator math |
| `scripts/fixtures/spec0015-dashboard/phase1.json` | Independent expected receipts/time/corruption cases |
| `scripts/spec0015-dashboard/phase1Oracle.ts` | Pure adapter/math/bounds negative proof |
| `scripts/spec0015-dashboard/phase1BrowserProof.ts` | Ordinary flows with no-cost transport doubles and isolated storage |
| `scripts/spec0015-dashboard/phase1ProtectedRegressions.ts` | Source-byte/payload/state and neighboring-flow proof |
| `scripts/spec0015-dashboard/phase1BuildProof.ts` | Focused production reachability and measured base/result gate |
| `scripts/spec0015-dashboard/recordPhase1Proof.ts` | Seal exact source/fixture/receipt/artifact evidence |
| `scripts/spec0015-dashboard/validatePhase1Proof.ts` | Independent hash/allowlist/required-evidence validator |

Ignored evidence only: `output/spec0015/phase1/**`. No package/lock/config/.env/AGENTS/docs/tree/provider/AI-owner/notification file changes by the executor. Import existing types/validators as read-only dependencies. No edits to `assistantStorage.ts`, `aiAnimatorStorage.ts`, `DrawingWorkspace`, shared header, or their contracts. No new API route, database migration, persistent preference, dependency or global CSS. An exact conflict requiring those files returns to PM; do not widen the allowlist silently.

### 8.2 User acceptance flows

1. **Fresh browser:** Home → AI Dashboard. Chart first, real mode default, **10,000 recorded conversation tokens per UTC week — TEST PREVIEW** visibly distinguished from the unconfigured real plan. No receipts gives **No recorded conversation usage in this view** and a truthful 0 recorded-so-far preview only when both sources are readable; unavailable coverage never asserts a complete zero. Five selectors, three surface filters, Demo off by default, accessible empty table, lower cards, Refresh and Home navigation work. No fake Creator/real balance/date or implied free allowance. The new adapter creates/changes no Assistant/AI/project/notification store; unchanged root observer DB initialization is inventoried separately.
2. **Existing project conversation:** in an isolated review browser use ordinary New/Open and a deterministic provider double to complete a normal greeting. Save/Exit when required by current app. Home → Dashboard shows that Project AI receipt in its recorded completion bucket. A create-animation request that returns the existing readiness answer also counts as conversation, with **Animation jobs: not available yet**, no project mutation.
3. **Guidance conversation:** Home → Assistant → ordinary Send through its existing double. Return to Dashboard; Assistant and Combined reflect exactly one receipt. Exercise one current hosted-search-shaped double; recorded tokens/cost and separate tool count match the stored receipt without double charging. No real search/provider call.
4. **Preview time and attribution:** switch all five views and Combined/Project AI/Assistant. Independent sums match selected-source cumulative height/color using the same shared 10,000 denominator; pinned Combined total/remaining and warnings do not change with filter. Verify 220px floor-anchored solid bars, approximately 7px gaps, no horizontal scroll, Previous/Next/Now or rotated timestamps, and chronological 24/24/24/14/8 buckets. Midnight/Monday/boundary events, sparse windows, invalid/future times and browser zones/offsets are covered. Renaming a chat cannot move its receipt.
5. **Synthetic Demo:** toggle clearly labeled Demo on; the frozen eight receipts in §4.2 show 10/50/75/90/100% states, gray shared warning line, pure-red roof, Monday reset to 1% blue and source-specific whole-bar height/color in the default 15-minute view. Switch every view without new events, toggle off to restore unchanged real receipts. At 100%, text explicitly says **TEST PREVIEW exhausted; AI continues working**. The preview never changes AI admission or a stored plan.
6. **Navigation/reload/concurrency:** finish an existing pending mocked job after leaving its origin via accepted notification observer; Dashboard reread eventually shows one retained receipt, never sends a job itself. Reload, back/focus, second-tab invalidation and repeated notifications cannot double count. Read-only scans racing a chat update publish a coherent generation and refresh, not duplicate results.
7. **Partial and failure:** absent DB, denied/blocked storage, corrupt row, excessive capacity, conflicting duplicate, unknown usage, failed/cancelled/prior-attempt, deleted chat and evicted Terra job all retain truthful coverage. Corrupt bytes remain intact. Valid accessible receipts can render as explicitly partial; an unavailable whole source is not a zero contribution or confident combined percentage. Dictation remains explicitly excluded.
8. **Protected app:** leave Dashboard and verify normal Home two-bell inventory, Assistant send/cancel/retry/search/citations/dictation-draft behavior with doubles, Project AI reply/pending observer, New/Open/drawing/edit/Undo/Redo/Save/reopen and ordinary local Export. No floating dashboard buttons leak onto other screens. No tutorials are added or modified; tutorial navigation remains unchanged.

### 8.3 Pass/fail performance and privacy

With the bounded fixture corpus, a populated first Dashboard view must settle within 2 seconds on the named review machine after cached app assets load; filter/bucket changes within 200 ms, no dashboard-caused task longer than 100 ms during interaction. Capture measured evidence and fixture size; one tiny fast probe is insufficient. Reads yield/cancel; if browser storage is slow, preserve responsive Loading and do not freeze the editor on return. No new Dashboard/analytics log or network payload contains prompt/reply/audio/session title/project content. Existing AI transports retain their authorized content byte-for-byte. Proof artifacts may contain clearly synthetic fixture content from isolated test flows, but never real user content or secrets; neither is copied into analytics. DOM/chart DTO contains only approved metadata. No fixture/test hook appears in the ordinary production bundle.

## 9. Verification and proof plan

### 9.1 Phase 1 exact command contract

The new scripts are future implementation outputs, not scripts created/run by this planning task. They must support these commands without hidden live credentials or external fetches:

```sh
node --experimental-strip-types scripts/spec0015-dashboard/phase1Oracle.ts
node --experimental-strip-types scripts/spec0015-dashboard/phase1BrowserProof.ts
node --experimental-strip-types scripts/spec0015-dashboard/phase1ProtectedRegressions.ts
node --experimental-strip-types scripts/spec0015-dashboard/phase1BuildProof.ts
npx --no-install tsc --noEmit
npx --no-install eslint app/credits/page.tsx src/components/ai-dashboard src/lib/ai-dashboard scripts/spec0015-dashboard
npm run lint
node --experimental-strip-types scripts/spec0015-dashboard/recordPhase1Proof.ts
node --experimental-strip-types scripts/spec0015-dashboard/validatePhase1Proof.ts
node --experimental-strip-types scripts/spec0015-dashboard/validatePhase1Proof.ts --self-test
git diff --check
```

The implementation may use the repo's installed TypeScript compiler to compile test-only imports in ignored scratch space when strip-types cannot resolve aliases, without adding dependencies or changing protected runner code. Each script owns deterministic setup/cleanup and writes its named receipts into the ignored proof directory. `recordPhase1Proof` runs only after all gate receipts exist; validation independently checks paths/hashes/bytes/base and required outcomes, and negative mutation cases reject missing screenshots, forged zero calls, altered source/fixtures and unlisted paths. No self-generated fixture may be the sole oracle.

The browser proof uses installed local Chromium/Playwright, fresh storage and deterministic provider/HTTP doubles with egress blocked at browser **and server** boundaries. For the isolated review server only, an already authorized ignored local `.env.local` may be copied byte-for-byte from canonical main, with hash comparison and no secret printed or sealed into evidence; no new credential or provider call is authorized. Identify its exact loopback server PID/cwd/port and leave it for Arthur's review until the later D-0054 lifecycle. Never copy real chats/keys/projects into proof. Synthetic microphone capture requires no physical device. Record calls attempted and rejected, exact approved mock requests, response identity and byte-identical protected provider payloads; assert zero external/provider/paid calls, zero source-store writes caused by Dashboard, no added cumulative limit, no AI content change. Seal `output/spec0015/phase1/proof-manifest.json` only after all independent receipts and screenshots exist.

The focused build must include ordinary `/credits`, Home, Assistant and actual Animator/Assistant/transcription route reachability with proof hooks excluded. Also measure the untouched full `next build --webpack` baseline versus result in isolated scratch output, preserve an inherited failure as failure, and never call the full build green because a focused build passes. Do not repair the existing dev cost page in Phase 1. Full lint may retain only freshly measured byte-identical baseline findings; zero new/changed-line findings. Package scripts/dependencies and permanent historical tester registration remain unchanged.

### 9.2 Regression/proof matrix

| ID | Required evidence | Failure meaning |
| --- | --- | --- |
| D15-MATH | Independent exact receipt sums; partial/null/corrupt/duplicate; 10,000 shared denominator; all five UTC views/boundaries; 90/100/overcap/reset; selected-source height/color, pinned Combined; 24/24/24/14/8 widths, 220px floor and ~7px gaps | Chart is misleading, miscolors attribution or drops records silently |
| D15-SOURCE | Adapter-attributed readonly DB/localStorage instrumentation; absent-DB upgrade abort in isolated adapter harness; live root-observer effects match unchanged baseline; deletion/eviction/rename behavior | Dashboard changes or misrepresents source history |
| D15-AI | Same request fields/model/reasoning/default/prompt/tool/search/store/retry/cancel and reply/citation/dictation behavior with doubles | Protected AI behavior regressed |
| D15-NAV | Home → Dashboard → Home → Assistant/Workspace; two bells only; existing completion/unread/offline semantics | Dashboard leaks into navigation/notifications |
| D15-PROJECT | New/Open/draw/Undo/Redo/Save/reopen plus digest/history/recovery sentinels | Analytics touched authored project authority |
| D15-EXPORT | Ordinary saved animation produces validated local MP4; no usage receipt/charge/Export alert | Local export became paid or changed |
| D15-UX | Demo's exact eight receipts/frozen clock/color sequence; warning line/roof; lower cards and unconfigured real plan; 1440×900, 768×900, 360×800, 320px reflow, 200% zoom, keyboard/table/screen-reader labels/reduced-motion/loading/error + performance corpus; no floating buttons | Visible feature unusable despite compile success |
| D15-NET | Explicit mock inventory, zero real provider/payment/external requests, proof hooks excluded | Unauthorized spend/privacy or test leakage |
| D15-IDENTITY | Exact base, empty index, 14-path ceiling, immutable proof hash, cleanup ownership | Invalid evidence or scope leak |

Do not rerun all historical motion/legacy migration suites when their source/import graph is byte-identical and ordinary project sentinel flows pass; record that boundary. A newly observed regression expands relevant verification, not implementation authority. Native physical devices, untested browsers and real-provider quality must be labeled unproven.

### 9.3 Later financial proof, before launch

Phase-specific packets must add: two authenticated users; forged/cross-user job/read/cancel; race for last credits across processes; same/different payload idempotency; provider timeout and unknown paid result; retry visibility; crash at every reserve/dispatch/settle boundary; grant versus consumption races; expiry during reservation; reset/renewal/timezone and leap/calendar boundaries; top-up after 90% and at exhaustion; unchanged historical denominators; cancellation without free-cost assumption; ledger rebuild equality; backup/restore; deleted chat unchanged financial balance; refund/dispute/reordered/duplicate/missed/forged webhook; stale price; account switch/cache leak; quota/DB outage; overload/abuse caps; dead-letter reconciliation; and 1%-used/99%-unused renewal under the **approved** commercial policy.

Arithmetic fixtures must include account C=90/R=10 plus 100-credit top-up → 45% depletion, 10%-remaining line, full red exhaustion, zero-denominator/unfunded, holds distinct from consumption, source contributions with one denominator, refill boundary inside week, refunded usage versus refund of unused credits, and late settlement into a closed admission period and the explicit p1/p2 80-credit carry example plus its reversal. Screenshots plus a machine-readable independent ledger oracle are required; screenshots alone do not prove money.

## 10. Named later gates and owner decisions

| Gate | Resolve before | Concrete evidence / decision |
| --- | --- | --- |
| G-METER | Phase 2 | Exact content-free schema, durable local store/retention, coverage start, failure backpressure, attempt observation limitations, no-behavior-change seam and file/command ceiling |
| G-PRIV | Phase 2 local retention; refreshed before Phase 3/launch | Exact retention/deletion and access policy for usage/account/finance versus local chat, no raw content, operator responsibilities and data locality |
| G-AUTH | Phase 3 | Identity/database/session stack, account/operator ownership, hosted versus private mode, route inventory, emulated test setup, ownership/access policies and security review |
| G-ECON | Phase 4 | Arthur chooses A/B/C and all §3.2 terms; dated provider/tool/audio prices, unit mapping and break-even scenarios; no arbitrary numbers adopted |
| G-CAPS | Phase 4 | Per-user/platform/provider budgets, reservation/unknown timeout/failed/cancelled charge rules, kill switch, explicit D-0124 reconciliation limited to hosted paid service |
| G-PAY | Phase 5 | Merchant/provider/country/currency/taxes/terms/account eligibility, sandbox authority, webhook and renewal semantics, price config, customer portal and refunds/disputes policy |
| G-LAUNCH | Phase 6 / subsequent live enablement | Full build, fresh security/privacy/legal/payment review, meter/payment reconciliation, backup/restore, risk ceiling, alerts/support, rollback/runbook and separate explicit live-service/deployment authority |
| G-ANIMATION | Future, outside this implementation | PM V4/Arthur resume/reconcile SPEC-0008 and supply real animation-job/attempt completion identity; receipt adapter must not implement animation |
| G-NOTIFY | Future, outside six phases | Separate approval to activate reserved low-usage producer with authoritative balance; preserve SPEC-0014's two-bell semantics |

Missing later economic decisions are not optional clarification pauses in this task. This approved staged plan makes recommendations for later phases without resolving their gates. No account is created and no plan sold to force a decision.

## 11. Planning verification record and untouched systems

**Planning proof, not implementation proof:** clean base/index and local-main equality; canonical boot and relevant spec/architecture/AI/testing/decision reads; current Dashboard live navigation/render; direct route/provider/store trace; read-only metering/security/chart/economics review; public official payment/security documentation review; source-only verification of inert purchase/account wiring; PM review of the revised executor Plan-mode contract; and Arthur's explicit approval of that Phase 1 outcome and docs publication. No live AI, dictation, search, checkout or payment test occurred.

Docs validation/allowlist/hash results and final Git state are recorded in the returned Spec Architect PM Review Packet. `scripts/update_memory.sh` validates required file presence and regenerates the sanitized tree; it does not semantically validate every claim, so local links, acceptance/authorization consistency, phase boundaries and diff scope also require explicit checks. There is no executor technical proof manifest yet because Phase 1 has not been implemented.

Exact runtime systems intentionally unchanged by this planning publication: both AI brains/models/options/prompts/replies/search/tools/citations/dictation/retries/limits; routes/job services and local receipts; legacy provider/client and prompt logs; auth/Supabase/payment/credit behavior; canvas/timeline/history/tools/Save/Open/recovery/project library/Export/tutorials; notifications/bells/offline behavior; package/lock/config/environment/credentials; all existing specs including SPEC-0008 and SPEC-0014; other worktrees/servers and deployment. Only the reviewed planning branch and canonical/local/remote main refs may change under Arthur's explicit publication authority. This work defines the Phase 1 fix; it does **not** itself fix the current static dashboard, missing billing/auth, lost receipts, retry discrepancy or inherited build failure.

## 12. Final state and next start

Status is **Approved staged plan; Phase 1 authorized / Not started, effective after this planning package is published and synchronized**. Arthur and PM V5 accepted the revised weekly TEST PREVIEW contract and authorized a separate Phase 1 executor. Phase 2–6 remain Unauthorized / Not started with material entry gates. This planning publication is separately authorized; the document itself grants no runtime mutation in this Spec Architect task and no later financial/provider/deployment authority.

The Spec Architect publishes only this reviewed 11-path docs/tree package from unchanged `c682e430e204a7d750654da3f96e36ab4f57e196`, verifies clean canonical/local/remote synchronization, returns its packet and stops. The Phase 1 executor must refresh its base to the resulting canonical planning SHA before implementing in its separate copy. PM V5 reviews the executor result; PM V4's paused Animator work remains independent. Follow the permanent executor → stop → Arthur/PM acceptance → sequential CPA → stop → separate publication → synchronized main → D-0054 cleanup lifecycle for that implementation.
