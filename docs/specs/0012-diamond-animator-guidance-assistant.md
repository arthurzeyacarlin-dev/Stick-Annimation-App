# SPEC-0012 — Diamond Animator Guidance Assistant

Status: **Proposed; owner outcome and six-phase direction accepted; implementation not authorized**

Owner: Arthur

Planning decision: D-0120

Target review date: Tuesday, September 29, 2026

Planning basis: clean canonical checkout, local `main`, local `origin/main`, and live GitHub `main` synchronized at terminal SPEC-0011 closeout successor `f334639f33b7b130a2f9409dcdf146dc2fffb165`, direct parent GIT-088 product commit `d0ec1b23d7e1d9ff13a0779c2758e33e858691f0`; fresh source trace and real-app observation on 2026-09-22

## 1. Exact product outcome

The inert Home card **AI Assistant — Ask questions and get guidance** becomes a dedicated Diamond Animator guidance experience with the familiar information architecture of classic ChatGPT: a session sidebar, one selected conversation, a large responsive message area, a bottom composer, visible model-reasoning control, and a clear **Back to Home** path.

The Assistant answers questions and gives guidance about Diamond Animator. It may explain what the product can do, where a control lives, how to complete a workflow, what a term means, how to troubleshoot a supported local flow, and when a current external fact must be checked. Version 1 may explain navigation but never drives the interface for the user.

This is a guidance-only product surface. It must never create, edit, delete, save, duplicate, rename, recover, export, finalize, upload, or otherwise mutate animation/project content. It does not receive an animation-project object, project identifier, project bytes, active editor callback, manual-command registry handle, repository handle, recovery handle, export handle, or project-management handle. Its request/response contracts contain no command or mutation type.

Production guidance uses only fixed `gpt-5.6-terra`. The visible choices are exactly **Low**, **Medium**, **High**, and **Extra High**, mapped to `low`, `medium`, `high`, and `xhigh`; every blank/new session defaults to **Medium**. There is no model picker, fallback model, silent reasoning downgrade, automatic paid retry, or legacy `/api/ai` routing.

The target is 85–90% local/private-beta readiness within the week ending Tuesday, September 29, 2026 if each phase passes without a major rejection. This is a scheduling target, not a certainty or a public-deployment claim.

## 2. Freshly verified current behavior

### 2.1 Home card and navigation

`app/page.tsx` owns a local `view` union for Home, Tutorials, Open Project, My Projects, Animation Workspace, and Animation Export. `HomeCardId` already includes `assistant`, but the visible AI Assistant button has hover styling only. It has no `onClick`, does not change `view`, and mounts no Assistant component or route.

Fresh real-Chromium observation at `http://127.0.0.1:3000/` on 2026-09-22 confirmed:

1. Home exposes **AI Assistant — Ask questions and get guidance** as an accessible button.
2. Activating it leaves the URL and Home content unchanged.
3. No Assistant shell, session list, composer, storage write, API request, or project mutation follows.

### 2.2 Accepted Terra AI Animator execution path

The accepted SPEC-0008 Phase 1 path is separate and must remain byte-behavior compatible:

```text
DrawingWorkspace
  -> DrawingAiPanel
  -> POST /api/ai-animator
  -> normalizeAiAnimatorRequest
  -> AiAnimatorJobService
  -> generateAiAnimatorReply
  -> OpenAI Responses / fixed gpt-5.6-terra
  -> GET polling or DELETE cancellation
  -> project-scoped aiAnimatorStorage local ledger
  -> unboxed typewriter reply / Thinking activity
```

`AiAnimatorJobService` owns one active job per workspace, at most two active jobs per environment, a 90-second deadline, monotonic job events, cancellation, provider identity validation, and terminal receipts. `generateAiAnimatorReply.ts` sends bounded recent conversation plus minimized workspace metadata, uses strict structured output, disables tools/search, sets `store: false`, and makes no Phase 1 animation mutation. `aiAnimatorStorage.ts` stores at most 80 messages and 40 terminal jobs per project in local storage, outside authored V2 project/history/version bytes.

`DrawingAiPanel` owns the accepted typewriter reveal, two-second minimum Thinking presentation, cancellation/reconnect handling, and paired gradient sweep. That implementation is a protected regression and a visual/interaction reference only. SPEC-0012 does not import or reuse its project-scoped route, request contract, job service, ledger key, workspace metadata, or mutation-adjacent component.

### 2.3 Current project-mutation ownership

Authored animation state belongs to the accepted unified V2 path:

```text
AnimationWorkspace
  -> DrawingWorkspace coordinator
  -> manual capability registry / validated handlers
  -> one global history owner
  -> unifiedProjectRepositoryV2 / unifiedProjectStorageV2
  -> official project heads, immutable versions and assets
```

Recovery, project management, Export, My Projects, timeline, canvas, and the paused later SPEC-0008 mutation plan have their own accepted owners. The Assistant must have no edge into any of them. Guidance may describe those surfaces from a local knowledge catalog; it cannot call them.

## 3. Permanent product and ownership laws

1. **Guidance only.** Assistant output is text plus optional external-source citations. No response can contain an executable editor command, action plan, project patch, storage mutation, navigation command, or automation instruction for the app to perform.
2. **No animation context.** Requests exclude current project ID/title, project generation, layers, frames, tools, canvas pixels, assets, audio, transcript from AI Animator, recovery state, export state, local paths, and project-library data.
3. **No animation imports.** Assistant runtime modules and `/api/diamond-assistant` must not import animation contracts, `DrawingWorkspace`, `DrawingCanvas`, manual capability registry, project repository/storage, recovery, Export, project-management, AI Animator storage, or legacy `/api/ai` executors.
4. **Dedicated ownership.** Assistant route, contracts, job service, knowledge catalog, browser storage, components, fixtures, tests, and proof use Assistant-specific names and versioned schemas. They do not reuse Animator storage keys or jobs.
5. **Fixed Terra.** Production guidance requests exact `gpt-5.6-terra`; requested and returned model identity must match. Mismatch is a terminal honest failure.
6. **No automatic paid retry.** Timeout, provider failure, missing key, offline state, invalid output, interrupted server, search failure, or transcription failure never causes an automatic second paid call. A new attempt requires an explicit user action.
7. **Local-first internal truth.** Questions about Diamond Animator use the versioned local knowledge catalog. Internet search is unavailable for those answers unless the question genuinely asks for a current external fact needed to answer safely.
8. **Truthful activity.** The interface shows only activity proven by the job event stream. It never simulates search, finalization, microphone capture, or transcription.
9. **No silent chat loss.** Storage limits, quota failures, invalid records, write conflicts, and the 50-session ceiling fail visibly. No valid session is silently evicted or overwritten.
10. **Protected product.** The accepted AI Animator, typewriter effect, activity gradients, timeline, canvas, manual tools, V2 persistence, Export, My Projects, recovery, and inert AI Project Finalizer stay unchanged unless a later dedicated spec explicitly says otherwise.

## 4. Dedicated target architecture

```text
Home AI Assistant card
  -> /assistant (dedicated App Router page)
  -> DiamondAssistantScreen
      ├─ AssistantSessionSidebar
      ├─ AssistantConversation
      ├─ AssistantComposer
      └─ assistantStorageV1 (Assistant-only IndexedDB)
  -> POST /api/diamond-assistant
  -> DiamondAssistantJobService
  -> local knowledge retrieval / search-eligibility policy
  -> fixed gpt-5.6-terra Responses call
      ├─ tools: [] for internal/local guidance
      └─ hosted web_search only when Phase 4 policy makes it eligible
  -> polled monotonic Assistant job snapshots/events
  -> validated answer + same-call title candidate + source bindings + cost receipt
  -> Assistant-only session transaction
```

Phase 5 adds a separate transcription door:

```text
microphone button
  -> browser permission and in-memory capture
  -> visible local waveform
  -> Cancel: discard bytes
  -> Stop: explicit transcription request
  -> separately approved /api/diamond-assistant-transcription boundary
  -> editable text in composer
  -> explicit Send required for Terra guidance
```

The guidance and transcription routes remain separate because they have different data, provider, privacy, cost, timeout, and failure contracts. Transcription never automatically sends a guidance message.

## 5. Shared contracts

### 5.1 Assistant session contract

`diamond-assistant-session/v1` contains only:

- opaque Assistant session ID;
- title, title source (`automatic` or `manual`), and manual-title authority revision;
- created/updated timestamps;
- ordered user/assistant messages with stable IDs and terminal turn references;
- reasoning preference, defaulting Medium for each new session;
- bounded job/cost receipts and optional cited-source records;
- schema version, monotonic revision, and content digest.

It contains no animation/project identity or bytes. A blank chat is in-memory only and is not written until the first explicit Send has safely created the first user turn. Leaving a blank chat loses nothing because no authored conversation exists.

### 5.2 Session limits and non-eviction

- Maximum persisted sessions: exactly 50.
- At 50, **New Chat** is disabled and explains: delete a chat before creating another.
- Existing sessions remain selectable, renameable, deletable, and send-capable subject to per-session limits.
- No age-, count-, quota-, or size-based silent eviction exists.
- Maximum persisted messages per session: 200.
- Maximum normalized user message: 12,000 characters.
- Maximum normalized assistant answer: 16,000 characters.
- Maximum persisted session record: 1 MiB UTF-8 encoded.
- Maximum Assistant database payload: 32 MiB. A write that would cross a limit is rejected before publication; the prior valid revision remains authoritative.
- Reaching a per-session message or byte ceiling blocks the next Send with a visible instruction to start a new chat or delete content by deleting the session; it does not truncate stored messages.

### 5.3 First-send and title transaction

The first successful Send creates the persisted session. The same Terra Responses call returns both the guidance answer and a concise title candidate in one strict structured response. No second title call is permitted.

The local transaction order is:

1. persist the first user message and pending job receipt atomically;
2. run the one guidance call;
3. validate terminal answer/title/usage/model data;
4. atomically append the answer, terminal receipt, and automatic title if the title remains automatically owned;
5. reveal the reply with the accepted typewriter behavior.

Manual rename is authoritative. If a user renames while a first call is active, the later automatic title is discarded. Automatic title never overwrites a manual title, including after reload, reconnect, race, retry, or stale completion.

Until the first successful terminal answer supplies a valid title, the persisted session is visibly **Untitled chat**. A failed, cancelled, interrupted, or invalid response cannot invent or persist an automatic title. A later successful message may provide the first automatic title only if the session is still automatically owned; it still uses that message's same guidance call and never a title-only call.

### 5.4 Rename and delete

- Rename is local, non-empty after normalization, 1–80 visible characters, and commits one next session revision.
- Delete always requires an accessible confirmation naming the session.
- A session with an active job cannot be deleted; the UI instructs the user to cancel and wait for a terminal state first. Rename remains allowed and retains manual-title authority.
- Delete removes only the exact Assistant session/messages/jobs/sources/receipts. It never touches an animation project, Animator ledger, recovery draft, cost-dashboard history, or another session.
- There is no Duplicate action in V1.

### 5.5 Conversation and provider bounds

Each guidance attempt allows:

- one active job per Assistant session and at most two active Assistant jobs per environment;
- one normalized user turn up to 12,000 characters;
- at most 32 recent persisted messages selected as the newest complete contiguous suffix; no automatic summarization call;
- at most 48,000 normalized conversation characters;
- at most 24,000 estimated input tokens across instructions, catalog excerpts, conversation, and user turn;
- at most 4,000 output tokens including visible output and reasoning where the provider counts both;
- one 90-second overall job deadline;
- no automatic retry and no alternate model.

Server-side token estimation must fail closed above the limit. The system never silently drops the current user turn. If older context is excluded, the request receipt records the included message range/count and the UI makes no claim that every old turn was sent.

### 5.6 Assistant API and job contract

`/api/diamond-assistant` is one Assistant-only App Router job endpoint with three methods:

- `POST` accepts strict `diamond-assistant-request/v1` JSON containing `jobId`, `sessionId`, `turnId`, `message`, `reasoningLevel`, the bounded recent-message suffix, `catalogVersion`, and `clientSessionRevision`. It returns `202` with the first validated job snapshot. The same `jobId` is idempotent; a conflicting body is rejected. A second active job for that session returns `409`, environment capacity returns `429`, and malformed/oversized input returns a specific `4xx` before a provider call.
- `GET` requires the exact `jobId` and `sessionId`, is `no-store`, and returns the current `diamond-assistant-job/v1` snapshot plus the contiguous event suffix after optional `afterSequence`. Unknown/lost jobs return `404`; the client marks a formerly accepted nonterminal job **Interrupted** and never silently resubmits it.
- `DELETE` requires the exact `jobId` and `sessionId`, requests cancellation, and returns the current validated snapshot. It is idempotent for terminal jobs. Cancellation success is not claimed until the service publishes a terminal `cancelled` snapshot.

The job service uses an Assistant-specific global symbol and owns statuses `queued`, `thinking`, `searching`, `finalizing`, `done`, `failed`, and `cancelled`. Every event has a contiguous server-issued sequence number, timestamp, job/session/turn identity, and one truthful transition. Polling may repeat a snapshot but cannot skip or reorder returned events. Only `done` may contain a validated terminal payload: answer, same-call title candidate, bounded sources, catalog version, model identity, reasoning level, and cost/usage receipt. No request, event, snapshot, or terminal payload has a project ID, project bytes, workspace summary, animation command, mutation proposal, import payload, or authored-state revision.

The provider adapter returns one strict structured object for answer and title. Search tool lifecycle events are translated into `searching` only when an actual hosted-search call starts; output generation/validation is translated into `finalizing`. Non-JSON, schema-invalid, wrong-model, stale-identity, non-contiguous, or mutation-shaped output fails closed and is not persisted as an assistant message. POST, polling, cancellation, timeout, and restart behavior are covered by deterministic fixtures before any live provider verification.

## 6. Versioned Diamond Animator knowledge catalog

`diamond-animator-knowledge/v1` is checked-in, local, deterministic product guidance. Each entry has a stable topic ID, user-facing title, supported claims, navigation steps, product-version/date, aliases, source-control references, and an explicit current/limited/unavailable status. The catalog may describe only accepted current behavior or clearly labeled planned/unavailable behavior.

Catalog content covers at least Home, New Project, Open Project, My Projects, Tutorials, Animation Workspace, drawing tools, Draw Rig, layers, timeline, onion skin, playback, Library, Assets, Save, Save As, Save and Exit, recovery, Export, AI Animator Phase 1 limits, AI Assistant limits, and AI Project Finalizer unavailability.

Internal Diamond Animator answers retrieve from this catalog first and send only bounded matched excerpts to Terra. The catalog is not project memory, source code, a vector database, or a mutation registry. Unknown internal facts produce an honest limitation instead of web search or invention.

Every catalog change requires version/date update, validation, proof that planned behavior is not stated as live, and reconciliation with `CURRENT_STATE.md`/accepted specs. Stale catalog detection is a Phase 6 release gate.

## 7. Activity, reveal, scrolling, and accessibility contract

### 7.1 Truthful labels

Only these labels exist:

- **Thinking** — from accepted submission while Terra reasons before a real search tool starts, or while a no-search response is reasoning.
- **Searching the internet** — only between actual hosted-search start and completion/failure/cancel events.
- **Finalizing answer** — only after reasoning/tools are complete and while final answer output is being composed/validated.

The server owns monotonic event sequence. The client cannot infer search from elapsed time or animate Finalizing on a timer. A no-search answer follows Thinking → Finalizing answer → Done. A search answer follows Thinking → Searching the internet → Finalizing answer → Done. A transition may be too fast to remain visually long, but labels may never be extended by lying about the active operation. Cancel/failure ends active labels immediately.

### 7.2 Exact gradient timing

Every label uses length-independent travel based on normalized mask coordinates, not character count or pixel width:

1. one full-label bright-blue sweep in exactly 1,000 ms;
2. one full-label dark-blue sweep in exactly 1,000 ms;
3. the accepted 1,500 ms no-sweep pause;
4. repeat only while the same truthful state remains active.

Reduced motion shows stable readable text with no sweep, shimmer, displacement, or typewriter animation. Screen readers receive one polite state announcement per actual transition, not animation-loop noise.

### 7.3 Reply reveal and long chats

Assistant replies reuse the accepted unboxed typewriter reveal behavior, including immediate full text for reduced motion and a non-duplicated accessible copy. Persisted/reloaded messages do not replay the reveal; only a newly completed reply does.

The conversation pane scrolls independently. While the reader is at the newest message, new content stays pinned. Once the reader moves away from the newest region, auto-follow stops and a keyboard-reachable **Jump to latest** down-arrow appears. Activating it moves to the newest message and restores follow mode. It must not steal focus or force-scroll during selection, reading, rename/delete dialogs, or screen-reader navigation.

## 8. Search and source policy

### 8.1 Eligibility

Search is optional and automatic only for a genuine external/current fact needed for the answer, such as a current browser/platform requirement, current provider behavior, current external standard, or another public fact whose freshness matters. Search is disabled for:

- Diamond Animator navigation, features, limits, or troubleshooting covered by the local catalog;
- greetings, brainstorming, writing help, general animation education that does not need freshness;
- questions answerable from the bounded conversation/catalog;
- private/local/project facts;
- attempts to make the Assistant fetch, watch, download, imitate, or inspect inaccessible media.

The deterministic search-eligibility policy runs after local catalog retrieval. The hosted tool is not offered unless the request is eligible. Terra may choose not to use the offered tool. Search cannot be triggered solely because local catalog retrieval found no match for an internal product question.

### 8.2 Hosted search boundary

Phase 4 may expose only the current official Responses hosted `web_search` tool after a same-day official capability/access/privacy/pricing gate. It adds no legacy `web_search_preview`, `/api/ai` DuckDuckGo reuse, custom scraper, arbitrary URL fetch, login/cookie/private-page access, paywall bypass, social-video download, frame capture, remote-image download, or model/provider fallback.

One attempt allows one Responses request, at most two built-in tool calls, at most eight normalized source records processed, at most six sources retained/displayed, 512 query characters, the shared 24,000-input/4,000-output-token ceilings, a 45-second search-call deadline inside the 90-second job deadline, and no automatic retry.

### 8.3 Source presentation and inaccessible media

Every externally derived current claim has a validated visible source title and canonical HTTPS URL. Source links are keyboard reachable, distinguishable from body text, and associated with the answer/claim they support. Untrusted web text cannot change system instructions, model, limits, catalog, job ownership, storage, or UI behavior.

The Assistant never says it watched, viewed, listened to, or inspected a YouTube, TikTok, Instagram, or other video unless a separately implemented capability actually supplied validated media evidence. In V1 no such media capability exists. For inaccessible video, it may summarize indexed text with attribution and must say the video itself was not watched.

## 9. Microphone dictation contract

The microphone is dictation, not live voice conversation.

1. User activates the microphone.
2. The browser requests permission in direct response to that gesture.
3. While recording, the composer shows a visible waveform/level indication, elapsed duration, **Cancel**, and **Stop**.
4. **Cancel** stops tracks, releases devices, revokes temporary URLs if any, zeroes/discards in-memory audio, and creates no transcript or guidance call.
5. **Stop** stops capture and, only after Phase 5's separate approval gate, submits one bounded transcription request.
6. Successful transcription is placed as editable composer text.
7. Nothing is sent to Terra guidance until the user presses **Send**.

Raw audio is never written to IndexedDB, localStorage, project storage, recovery storage, filesystem proof, analytics, or cost logs. The browser and server may hold only the bytes needed for the active bounded request and must release them on terminal success/failure/cancel/timeout. Maximum recording is 120 seconds and 20 MiB; accepted formats and transcription provider/model remain a Phase 5 entry decision based on fresh official documentation. Missing permission, no device, empty audio, unsupported format, offline state, provider failure, timeout, and cancellation are distinct honest states. Text typing remains fully available.

## 10. Security, privacy, cost, and failure policy

### 10.1 Credentials and request minimization

- Provider credentials are server-only and never serialized to client code, IndexedDB, proof, logs, screenshots, or Git.
- Guidance sends only the current user turn, bounded selected Assistant messages, bounded catalog excerpts, reasoning value, and Assistant job/session correlation IDs.
- Search sends a minimal public-information query projection, not the full session unless strictly needed and within the same bound.
- Transcription sends only the active audio payload and transcription settings.
- `store: false` is required where supported; provider retention/data-use terms require a fresh dated gate before any live/beta enablement.
- Logs exclude raw prompts, raw answers, raw web bodies, audio, secrets, headers, cookies, local paths, animation/project data, and hidden instructions. Digests, counts, timings, model identity, usage, bounded error codes, and cost may be logged.

### 10.2 Cost receipts and limits

Every terminal paid-capable attempt records requested/returned model, reasoning effort, search/transcription tool count, input/output/total tokens where available, provider response ID, latency, estimated cost from a dated price table, and outcome. Unknown model identity, usage, price, or remaining budget fails closed for live proof/beta use.

Development live gates are supplemental and separately authorized. Unless Arthur approves a different same-day ceiling, one authorized guidance/search attempt may not exceed estimated `$0.15`, one UTC-day Assistant development ledger may not exceed `$0.60`, and one UTC-month private-development ledger may not exceed `$5.00`. Transcription gets a separate request and spend ceiling at Phase 5 entry. Phase 6 must define per-user/public-beta credits and monthly limits before any public exposure; absence of that decision blocks public deployment, not deterministic local implementation.

### 10.3 Failures and recovery

- Missing key: explain that Terra is not configured; keep input/session safe; no fake answer.
- Offline/network/provider failure: terminal failure with explicit Retry action; Retry is a new user-authorized job and never automatic.
- Timeout/cancel: terminal receipt; no assistant answer or title publication; user message remains visible with failed/cancelled state.
- Invalid/mismatched provider output: discard output, preserve last valid session revision, report a safe failure.
- Server restart/job loss: polling 404 becomes **Interrupted**; no silent resubmission. The user may explicitly retry.
- Storage blocked/quota/corruption: keep the last valid readable revision, block unsafe write, explain local storage failure, and never claim persistence.
- Cross-tab/stale completion: Web Locks where available plus a lease/CAS fallback serialize Assistant session mutations. Broadcast/storage messages are invalidation hints only; authoritative IndexedDB reread and revision/digest comparison decide.
- Search failure: answer without current external claims only when it can do so honestly; otherwise report that current information could not be verified.
- Transcription failure: keep the composer usable, retain no audio, and ask the user to type or retry explicitly.

## 11. Phase 1 — Assistant navigation and responsive shell

### 11.1 Entry gate

The SPEC-0012 planning package must be reviewed and separately published/synchronized. Arthur must then separately authorize Phase 1 from that exact canonical-main SHA. No provider key or paid call is needed.

### 11.2 Scope

- Wire the Home card to dedicated `/assistant`.
- Implement the blue Diamond Animator Assistant shell, branded greeting, Back to Home, empty session sidebar, disabled/placeholder New Chat mechanics, responsive conversation area, composer, microphone visual placeholder, Send, and reasoning selector defaulted Medium.
- Establish Assistant-specific component/style/route boundaries and keyboard/focus/scroll behavior.
- Keep all controls local and deterministic; no API call, storage persistence, microphone permission, search, or animation ownership.

Phase 1 non-goals: real sessions, persistence, Terra, search, transcription, microphone permission, title generation, project-aware guidance, animation mutation, and deployment.

### 11.3 Visible Arthur acceptance flow

Home → AI Assistant → dedicated blue Assistant page → verify greeting/sidebar/composer/reasoning controls at desktop and compact widths → Back to Home restores focus to the AI Assistant card. No project opens, no workspace mounts, and no provider/network request occurs.

### 11.4 Exit proof

Real Chromium at desktop, compact, 200%-zoom equivalent, reduced motion, and forced colors; keyboard traversal and focus restoration; no horizontal page overflow; Axe no serious/critical findings; request ledger proves zero Assistant/provider/search/transcription calls; exact protected Home/Tutorials/New/Open/My Projects/Export routes; zero project/recovery/storage mutation.

Recommended executor: `gpt-6-astra`, Extra High reasoning.

## 12. Phase 2 — Bounded 50-session local persistence

### 12.1 Entry gate

Phase 1 must be accepted, propagated by a Control Plane Architect, separately published/integrated/synchronized, proof-preserved, and cleaned up. Phase 2 then requires separate authorization.

### 12.2 Scope

- Implement `diamond-assistant-session/v1` and Assistant-only IndexedDB storage.
- Implement ephemeral blank chat, first-send persistence, deterministic provider double, same-call title result, typewriter reveal, selection, authoritative manual rename, confirmed delete, 50-session blocking, 200-message/size ceilings, long-chat scroll/down-arrow, restart/reload recovery, and cross-tab stale-write safety.
- No real Terra/search/transcription call. The deterministic double simulates the one terminal answer/title envelope and activity events.

Phase 2 non-goals: real provider guidance, local knowledge authoring beyond fixtures, hosted search, microphone capture/transcription, animation/project context, cloud sync, and public deployment.

### 12.3 Visible Arthur acceptance flow

Create first chat and send → reply types in and title appears → create/select multiple chats → rename one while an automatic-title completion is pending and prove manual title wins → delete with confirmation → reload/restart and recover exact sessions → create 50 and prove New Chat blocks without deleting any → scroll away in a long chat and use Jump to latest.

### 12.4 Exit proof

Deterministic oracle and browser proof cover atomic first-send publication, blank non-persistence, title race, exact selection, rename/delete targets, no duplicate action, 49→50→blocked ceiling, quota/write/read/corruption/CAS faults, two-tab races, 200-message/1 MiB/32 MiB bounds, exact reload/restart equality, typewriter/reduced motion, down-arrow behavior, and zero official/recovery/Animator/project storage changes.

Recommended executor: `gpt-6-astra`, Ultra reasoning because silent-loss and concurrency safety are phase-critical.

## 13. Phase 3 — Fixed-Terra Diamond Animator guidance

### 13.1 Entry gate

Phase 2 must be fully closed. Arthur must separately authorize one Phase 3 executor. Deterministic provider doubles remain the default. Any live call requires a separate same-day model/access/privacy/pricing/request/spend approval; implementation authority alone does not authorize it.

### 13.2 Scope

- Add Assistant-specific request/response/job contracts, `/api/diamond-assistant`, `DiamondAssistantJobService`, fixed-Terra provider adapter, strict answer/title schema, versioned local knowledge catalog/retrieval, four reasoning levels, bounded context/output, truthful Thinking/Finalizing events, cancel/poll/reconnect/interruption/error behavior, terminal cost receipts, and accepted typewriter reply.
- Search tools remain off. Microphone remains non-recording.
- Hard structural and runtime proof of zero animation mutation and zero import path into any animation/project owner.

Phase 3 non-goals: hosted search, external citations, microphone recording/transcription, UI control, project-aware answers, animation mutation, model fallback, public deployment, and resumed SPEC-0008 work.

### 13.3 Visible Arthur acceptance flow

Ask how to start a project, use onion skin, recover unsaved work, export an animation, and what AI Animator can currently do; verify catalog-grounded useful guidance. Ask the Assistant to create/delete/save/export a project and verify it explains the steps or limitation without performing an action. Change all four reasoning levels, cancel an active request, simulate offline/missing-key/provider/restart failures, and confirm the session remains usable.

### 13.4 Exit proof

Strict contract/schema negatives; fixed-model and reasoning mapping; request/context/token/output/deadline/concurrency caps; local catalog version and stale/planned-truth checks; title in the same call; cancel-before-terminal; terminal/cancel/404/reconnect races; no retry; input/title persistence; cost receipt; exact before/after digests for unified V2 repository/storage, recovery, Animator ledger, timeline/history/canvas, Export, My Projects and project finalizer; import-graph denial of mutation owners; deterministic proof uses zero provider calls. Any separately approved live smoke is supplemental and never replaces doubles.

Recommended executor: `gpt-6-astra`, Ultra reasoning because provider, privacy, job recovery, and mutation isolation are high-risk boundaries.

## 14. Phase 4 — Optional hosted web search and truthful activity

### 14.1 Entry gate

Phase 3 must be fully closed. Before any live search, refresh official Responses web-search capability, event, citation, price, data-use/retention, rate-limit, and account-access evidence and obtain Arthur's exact live request/spend authorization. If official events cannot prove actual search start/end and final composition, stop rather than fake labels.

### 14.2 Scope

- Implement deterministic search eligibility after local catalog retrieval.
- Expose hosted `web_search` only for eligible external/current questions.
- Validate/canonicalize sources and render accessible citations.
- Emit actual Thinking, Searching the internet, and Finalizing answer events.
- Implement exact length-independent 1s bright sweep + 1s dark sweep + 1.5s pause and reduced motion.
- Enforce tool/source/query/time/token/spend limits and inaccessible-video truthfulness.

Phase 4 non-goals: arbitrary browsing/scraping, media download/watch/frame extraction, image search, social authentication, microphone/transcription, animation mutation, and model/provider fallback.

### 14.3 Visible Arthur acceptance flow

Ask internal navigation questions and prove zero search. Ask a stable animation-principle question and prove zero search. Ask a genuinely current external question and observe Searching only during the actual tool interval, then cited sources. Give a YouTube/TikTok URL that cannot be watched and verify the answer does not claim it watched the video. Cancel/fail search and verify the label stops immediately and no unsupported current claim is shown.

### 14.4 Exit proof

Search trigger/no-trigger matrix; local-catalog precedence; exact provider event mapping; normalized one-second sweep measurement for short and long labels; reduced motion; max two tools/eight processed/six displayed sources; citation URL/title/claim binding; prompt-injection and malicious URL rejection; social/inaccessible-media truth; search timeout/cancel/reconnect; cost ledger limits; zero app scraping/download; zero project mutation. Deterministic hosted-search doubles are mandatory; any live search is separately authorized and supplemental.

Recommended executor: `gpt-6-astra`, Ultra reasoning.

## 15. Phase 5 — Built-in microphone dictation

### 15.1 Entry gate

Phase 4 must be fully closed. The phase activation must select the transcription provider/model or approved local engine from fresh official evidence and approve audio format, request/time/token/spend, retention/data-use, and live-smoke ceilings. No live recording upload is authorized by this planning spec.

### 15.2 Scope

- Implement user-gesture permission, recording waveform/elapsed state, 120-second/20 MiB bounds, Cancel/Stop, one separate transcription route/provider boundary, editable transcript insertion, explicit Send, track/resource cleanup, and zero raw-audio retention.
- Do not implement live voice, voice playback, automatic Send, wake word, background capture, or continuous listening.

Phase 5 non-goals: voice conversation, spoken Assistant replies, persistent audio, speaker identification, translation/dubbing, search-policy changes, animation mutation, and public deployment.

### 15.3 Visible Arthur acceptance flow

Allow permission and record while waveform responds → Cancel and verify no text/audio/request remains → record again → Stop → receive editable text → correct it → explicit Send → receive normal guidance. Deny permission, unplug/no-device, cancel during transcription, go offline, hit size/time limits, and verify typing remains available.

### 15.4 Exit proof

Permission and device matrices; waveform driven by actual local input samples rather than a decorative timer; Cancel/Stop races; exact recording caps; accepted-format validation; transcription output bounds; no automatic guidance call; resource/track/AudioContext/object-URL cleanup; storage/filesystem/request-log scan proving no raw audio retention; provider failure/cancel/timeout; accessibility; zero animation mutation. Deterministic transcription double by default; any live transcription separately authorized and supplemental.

Recommended executor: `gpt-6-astra`, Ultra reasoning.

## 16. Phase 6 — Beta hardening and complete regression protection

### 16.1 Entry gate

Phases 1–5 must each be accepted, propagated, separately published/integrated/synchronized, proof-preserved, and cleaned up. Arthur must define whether the target is local/private beta or public beta. Public exposure additionally requires accepted authentication, ownership, rate limiting, abuse controls, provider retention/privacy terms, per-user credits, monthly budget, incident logging/redaction, and deployment approval.

### 16.2 Scope

- Final storage/context/output/search/transcription/cost-limit enforcement.
- Security/privacy boundary audit, server-only credential proof, log redaction, rate/abuse behavior appropriate to the approved beta class.
- Desktop/compact/narrow/200%-zoom/reduced-motion/forced-colors/keyboard/screen-reader proof.
- Long-chat, 50-session, restart/server interruption, offline, corruption/quota, two-tab and resource/performance proof.
- Exact AI Animator, Home, project library, recovery, Export, editor, timeline, canvas, tools, persistence and finalizer regressions.
- User-facing limitations/help copy and release evidence.

Phase 6 non-goals: adding new product capability, weakening earlier limits, declaring production readiness, expanding to project mutation/UI control/live voice/cloud sync, or deploying without a separate explicit instruction.

### 16.3 Visible Arthur acceptance flow

Run the complete new-user Assistant journey; maintain multiple chats; long-scroll; rename/delete; internal guidance; current external search with sources; microphone dictation; offline/restart recovery; all four reasoning levels; cancellation/failure; then execute protected Home/New/Open/My Projects/Tutorials/AI Animator/manual editing/Save/Save As/Save and Exit/recovery/Export flows and confirm no unrelated change.

### 16.4 Exit definition

Phase 6 may claim 85–90% beta readiness only for the explicitly approved beta class and only if all required evidence passes. It may not claim production readiness, public safety, physical-device coverage, every browser, perfect answer accuracy, unlimited storage, watched video, live voice, UI control, or animation mutation.

Recommended executor: `gpt-6-astra`, Ultra reasoning.

## 17. Common technical proof manifest

Every phase creates one ignored immutable `output/spec-0012/phase-N/proof-manifest.json` and an independent validator. The manifest binds:

- exact canonical activation base/HEAD and branch/worktree identity;
- empty index and exact dirty-path allowlist;
- phase authorization decision and spec hash;
- source, fixture, test, receipt, screenshot, trace, and result path hashes/sizes;
- deterministic oracle/browser/build/type/lint/scope/diff results;
- exact request ledger including zero-call claims and authorized live-call receipts;
- official/recovery/Animator/Assistant/project storage before/after digests as applicable;
- context/output/tool/source/audio/storage/cost/performance ceilings;
- model/reasoning/provider identity evidence;
- mutation-boundary/import-graph proof;
- desktop/compact/accessibility/reduced-motion evidence;
- protected regression results;
- cleanup plan and historical lifecycle flags (`humanAcceptance: pending Arthur`, `controlPlaneUpdated: false`, `gitPublication: false`).

The independent validator must reject material mutations to base, path set, source/artifact bindings, limits, request counts, cost receipts, storage digests, accessibility/performance claims, acceptance state, or lifecycle flags. A green self-generated manifest does not substitute for Arthur's visible review.

## 18. Protected regression matrix

Every phase proves its exact new flow and the applicable inherited matrix:

- Home recovery startup gate and welcome behavior;
- Home New Project, Open Project, My Projects, Tutorials, Export, and inert AI Project Finalizer;
- AI Animator fixed Terra model, four reasoning levels/Medium default, typewriter, Thinking gradient, cancel/reconnect/failure, project-scoped ledger, and exact zero Phase 1 animation mutation;
- unified V2 New/Open/Save/Save As/Save and Exit, recovery, leases/CAS, and project management;
- Drawing tools, Draw Rig, layers, timeline, onion, playback, Undo/Redo, Library, Assets, canvas geometry, and manual capability registry;
- My Projects viewer, audio/fullscreen where applicable, Rename/Duplicate/Delete/Search/Sort;
- Export chooser, renderer, audio, encoder, Finder flow, destinations, progress/cancel/failure;
- no AI Project Finalizer behavior added;
- no SPEC-0008 Phase 2–6 resumption, animation mutation, provider/video work, deployment, or direct social integration.

Historical validators with frozen dirty-path assumptions may fail closed after legitimate SPEC-0012 additions. The executor must run current relevant oracles and write phase-owned compatibility proof rather than weakening historical evidence.

## 19. Schedule target and stop gates

The preferred no-major-rejection sequence is:

| Target date | Phase target | Gate |
| --- | --- | --- |
| Sep 23 | Phase 1 shell | no paid call |
| Sep 24 | Phase 2 sessions | deterministic double only |
| Sep 25 | Phase 3 Terra guidance | live smoke only if separately authorized |
| Sep 26 | Phase 4 search | live search only if separately authorized |
| Sep 27 | Phase 5 dictation | transcription gate required |
| Sep 28 | Phase 6 hardening | approved beta class only |
| Sep 29 | review/correction buffer | no certainty claim |

These dates do not combine phases or bypass review. Each numbered phase stops after its Spec Executor packet. A rejected phase returns to a separately authorized correction executor and shifts the target rather than lowering acceptance.

## 20. Sequential phase lifecycle

For each phase:

1. Arthur separately authorizes exactly that phase after the prior phase is durably integrated.
2. One fresh dedicated worktree starts from the exact synchronized canonical-main SHA.
3. One Spec Executor starts in Plan mode, refreshes evidence, traces the live path, implements only that phase, creates/validates the immutable technical proof manifest, returns a full Implementation Review Packet, and completely stops.
4. The executor never edits `AGENTS.md`, canonical `docs/`, or `project/project_structure.txt`; never stages, commits, merges, pushes, publishes, deploys, cleans another worktree, or begins another phase.
5. Arthur and the Project Manager accept or reject the stopped result.
6. Only after acceptance and explicit exclusive ownership transfer may a Control Plane Architect enter the same worktree, verify unchanged accepted bytes/evidence, update canonical control-plane records, run `bash scripts/update_memory.sh`, perform final tracked-state closeout, return a Control Plane Architect PM Review Packet, and stop with an empty index.
7. Neither packet authorizes Git publication.
8. A later explicit publication instruction authorizes only the Control Plane Architect to stage the exact accepted implementation plus reviewed control-plane paths, commit on a `codex/` branch, fast-forward a still-clean unchanged canonical `main`, push normally, verify clean local/origin/live synchronization, preserve proof, stop the exact review server, and complete D-0054 cleanup.
9. The next phase starts only after the preceding phase is Verified, published, integrated, synchronized, proof-preserved, and cleaned up.

## 21. Scope and non-goals

In scope: the six numbered phases, local/private-beta quality target, Assistant-only sessions/jobs/storage/catalog, Terra guidance, optional hosted search, citations, dictation, responsive/accessibility/recovery/security/cost proof, and exact protected regressions.

Explicit non-goals:

- creating or editing animation/project content;
- UI control, click automation, deep-link command execution, or autonomous navigation;
- sharing AI Animator transcript/memory/jobs/storage;
- AI Project Finalizer;
- live voice conversation, voice response, wake word, or background listening;
- arbitrary browsing, URL fetching, scraping, video watching/downloading, image search, social login/upload/posting;
- custom model, fine-tuning, embeddings/vector database;
- cloud chat sync, accounts, collaboration, cross-device retention;
- automatic session eviction, duplicate session action, export/import of chats;
- deployment or public-beta release without Phase 6's named gates;
- resuming paused SPEC-0008 Phases 2–6.

## 22. Planning verification, blockers, and Phase 1 readiness

Planning verification completed on 2026-09-22:

- clean canonical checkout, local `main`, local `origin/main`, and live GitHub `main` synchronized at planning parent `f334639f33b7b130a2f9409dcdf146dc2fffb165` before edits, with direct parent GIT-088 product commit `d0ec1b23d7e1d9ff13a0779c2758e33e858691f0`;
- complete control-plane boot sequence;
- direct trace of Home card state/navigation;
- fresh real-Chromium proof that the AI Assistant card is inert;
- direct trace and real-app observation of the accepted AI Animator shell;
- direct trace of `/api/ai-animator`, `AiAnimatorJobService`, fixed-Terra provider, contract bounds, project-scoped ledger, typewriter/activity behavior, and V2 mutation ownership;
- no live OpenAI/search/transcription call, credit spend, credential read, runtime change, server start/stop, deployment, worktree creation, staging, commit, merge, push, or publication.

No blocker prevents Phase 1 implementation after this planning package is reviewed, separately published/synchronized, and Arthur gives a separate exact Phase 1 authorization. Phase 3 live Terra, Phase 4 live search, Phase 5 transcription choice/live use, and Phase 6 public-beta policy retain their named future gates; they do not block Phase 1.
