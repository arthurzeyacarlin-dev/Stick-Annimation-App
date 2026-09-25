# SPEC-0014 — Durable In-App Notification Center and Background Completion

Status: **Phase 1 accepted and technically Verified; control-plane propagation/publication pending. Phases 2–4 Unauthorized/Not started.**
Owner: Arthur
Planning role: Specification Architect
Created: 2026-09-24
Last updated: 2026-09-25
Decision link: D-0137; D-0138
TODO IDs: PLAN-014; PM-005; NOTIFY-001; NOTIFY-002; NOTIFY-003; NOTIFY-004; GIT-098
Planning baseline: clean detached checkout of canonical `main` at `acc3204d6c5aa08f1d0d714dcd5a64e8746dcb8d`
Authorization boundary: D-0137 authorized planning only. Arthur subsequently authorized Phase 1 and accepted the corrected implementation under D-0138, with control-plane propagation and exact Git publication separately requested. Phases 2–4, provider/paid activity and deployment remain unauthorized.

## D-0138 accepted Phase 1 correction — authoritative two-bell outcome

Arthur rejected the earlier unpublished review copy, then accepted the fresh correction from canonical `main` `a5ca805b220357b5e8128bb6b76ea408e30fa790`. The stopped Spec Executor transferred the dedicated `codex/spec0014-phase1-notification-correction` worktree exclusively to Control Plane Architect after Arthur/PM acceptance. Its empty-index, exact 19-path technical result is bound by immutable manifest SHA-256 `b1c082c2508b3039fdeacdd65f99ded4a9d49ed7cec99eb9aaff8352be143669`. This paragraph records accepted technical verification; publication is a distinct later Git check, not implied by acceptance.

- Exactly two product bell locations exist: **Home/main interface** (the overall inbox) and **AI Assistant** (only `assistant.reply.completed` and `assistant.reply.failed`). Credits/AI Dashboard, New/Open workspace, Export, Tutorials, Open Project, My Projects and every other surface have no bell. The root provider has no global visible trigger.
- Both views share one durable record and per-record read state. Home includes all supported event kinds. Assistant filters its rows, unread count, blue dot, one-shot green ring, announcements and **Mark all as read** to Assistant events only; it cannot clear other unread events. The dot has no visible number; accessible text supplies the exact count.
- A newly committed eligible unread event rings briefly in green only while its owning bell is mounted. Historical load, opening, navigation, duplicate delivery and cross-tab rereads do not replay the ring. Leaving Home or Assistant closes its local panel. There is no sound, popup or OS notification.
- Phase 1 is foundation-only: no production event producer, origin registration, destination handler, polling loop or injected review fixture is connected. The ordinary app starts with no notification rows. Phase 2 owns actual Assistant/Terra completion/failure across navigation; Phase 3 owns Export; Phase 4 owns offline/reliability. AI-animation, low-usage, updater and unmodeled game notifications remain inactive.
- No AI/search/transcription limit, provider policy, configured/disconnected state, dictation, chat, Terra, export, editor, project or recovery behavior was changed. Existing real failures may not be hidden as success. The proof hashes provide local integrity, not authentication against a malicious writer that can reseal both objects.

Technical proof passed 35 contract, 29 storage and 41 UI assertions; exact Home `1`/Assistant `1`/other surfaces `0` trigger inventory; two-tab/reload/restart/read/capacity/corruption checks; accessibility and protected Assistant/dictation/Terra/export/editor regressions; TypeScript, focused lint and focused Webpack build. Manifest validation rejected 18 mutations, with zero automated provider/external calls. Full lint remains the inherited five errors/81 warnings. The full production Webpack build fails on the identical untouched `app/dev/ai-costs/lifetime/page.tsx` `PageProps` error on base and result; default Turbopack build also failed in this offline environment. Production-build readiness is **not proven**. Native 200% browser zoom, OS-window focus, physical microphone/devices and non-Chromium are unproven. These limits must stay visible in any Phase 2 handoff.

This correction supersedes the older all-surface bell placement and numeric-badge language in §§7 and 14 below. No later phase starts automatically; Phase 2 requires Phase 1's full publication/integration/synchronization/proof preservation/cleanup plus a fresh separate Arthur authorization.

## 1. Exact product outcome

Diamond Animator will replace the inert Home header notification preview with one truthful, durable, local in-app notification center. Long-running supported work will finish independently of the screen that started it for as long as the same app runtime remains alive, and the center will lead the user back to the exact conversation, project/workspace or export result that produced the event.

The first active event set is exactly:

1. a validated local video export completed after the user left Export;
2. a started export failed or timed out after the user left Export;
3. an AI Assistant reply completed after the user left that exact conversation;
4. an AI Assistant reply failed or timed out after the user left that exact conversation;
5. a Terra reply in a New/Open Animation Workspace completed after the user left that exact project/workspace;
6. a Terra reply failed or timed out after the user left that exact project/workspace; and
7. one app-wide offline warning per real browser-declared offline incident, with exact copy **“There is no internet, so no AI will be able to be called.”**

Each supported terminal outcome creates one history record. It is unread only when the exact origin is no longer visibly focused under §6; if the user remains on the exact origin, the same event is stored already read. This preserves a complete local history without showing a false “you missed this” badge.

The following future event contracts are reserved but remain inactive:

- AI Animator finished animating;
- low AI usage at 10% remaining, with a Buy/Refill action only when a future authoritative billing capability exists; and
- update available, only when a real trusted updater reports a newer available version.

SPEC-0014 has exactly four separately authorized implementation phases:

| Phase | Outcome | Authorization state |
| --- | --- | --- |
| 1 — Notification center foundation and durable event contract | Shared local store, two scoped bells, unread/read semantics, target resolution contract and proof-only fixtures; no product producer is connected. | Accepted and technically Verified under D-0138; GIT-099 publication pending |
| 2 — AI reply completion/failure across navigation | App-lifetime observers terminalize and notify for the exact Assistant conversation and exact New/Open Terra project/workspace after in-app navigation. | Unauthorized; Not started |
| 3 — Export completion/failure across navigation | One app-lifetime export coordinator continues a user-started export after in-app navigation and publishes only validated success or truthful failure. | Unauthorized; Not started |
| 4 — Reliability, offline, dormant future contracts and whole-feature proof | Offline incident warning, dedupe, persistence, reload/interruption truth, cross-tab concurrency, accessibility, regression closure and inactive future schemas. | Unauthorized; Not started |

No phase starts automatically. Each phase needs the preceding phase published/integrated/synchronized/cleaned up, a fresh Plan-mode Spec Executor, and separate Arthur authorization.

## 2. Freshly verified current behavior and execution path

### 2.1 Planning identity and evidence labels

- **Git verified:** this planning checkout began clean and detached at `acc3204d6c5aa08f1d0d714dcd5a64e8746dcb8d`, exactly equal to local canonical `main`.
- **Live verified, 2026-09-24:** a temporary local Chromium run used this exact checkout and no provider call. Home, `/assistant`, New Project workspace and workspace-origin Export were exercised.
- **Code verified:** the active header, Assistant job/session, Terra job/ledger, page navigation and Export player paths listed below were traced directly.
- **Intended:** every target behavior after §2.5 is planning authority, not an implementation claim.

### 2.2 Header preview

`src/components/chrome/AIcreditspage.tsx` owns `notificationPreviewOpen` as component-local state and labels it in source as a local preview. The bell's blue dot reflects whether the preview is open, not whether unread work exists. Opening the bell shows **Preview — Notifications will appear here when connected.** No notification storage, event subscription, unread count, read state or click target exists.

`app/page.tsx` mounts this header only on Home. `app/credits/page.tsx` also uses the same chrome. The live Assistant, workspace and Export screens have no notification trigger. `app/layout.tsx` mounts only the global scrollbar activity helper and page children; it has no app-lifetime notification or job coordinator.

### 2.3 AI Assistant

The Assistant is a dedicated `/assistant` route. `useAssistantSessions()` owns client polling while that route is mounted. The server-side `DiamondAssistantJobService` continues its in-process job after a successful POST even if the route unmounts, but no root observer keeps polling while the user is away. A terminal answer or failure becomes durable in Assistant IndexedDB only when a client later calls `finishTurn(...)`.

Returning to `/assistant#chat=<sessionId>` can resume a pending poll. A process restart or missing job can become an interrupted terminal turn. The current hook already preserves exact `sessionId`, `turnId` and `jobId`, distinguishes done/failed/cancelled/interrupted, performs no automatic retry, and persists the successful answer before showing it. These identities and source-of-truth rules must be reused rather than replaced.

### 2.4 New/Open workspace Terra

New and Open both mount the unified `DrawingWorkspace`. `DrawingAiPanel` owns Terra polling only while that panel is mounted. Its project-scoped local ledger uses the prefix `diamond_ai_animator_ledger_v1:` and bounds messages/jobs. The server-side `AiAnimatorJobService` continues after successful submission, but no app-lifetime observer terminalizes the ledger while the workspace is gone.

The panel already has exact `projectId`, `projectGeneration`, `turnId`, `jobId`, terminal sequence and timeout/failure state. It appends one assistant ledger message only after a terminal snapshot. Current Phase 1 Terra chat does not animate or mutate the project; a create/edit request remains a conversational readiness result. SPEC-0008 Phases 2–6 remain paused.

In the normal in-app exit path, **Save and Exit** completes the official Save before unmounting the workspace. Opening Export from the workspace is a special current case: `app/page.tsx` keeps the workspace mounted but hidden behind Export. A hard reload/tab close and an abandoned unsaved browser runtime are not durable project navigation.

### 2.5 Export

`ExportAnimationPlayer` owns the current export state and `AbortController`. Unmounting the player aborts the active job. Success is set only after `exportSnapshotToMp4(...)` returns a post-write validated result. Finder cancellation, explicit cancellation and failure are already distinct. The active UI warns the user to keep the tab open.

The immutable selected saved revision, project/revision/digest identity, request, progress, cleanup and media inspection contracts from SPEC-0009 remain authoritative. The browser does not receive a trustworthy OS path, and the writable file handle is a live capability that must not be placed in notification storage.

### 2.6 Proven gap

The current product has three screen-owned completion loops and no real notification infrastructure. Therefore a correct solution cannot merely change the preview copy or emit a toast from each screen. It needs:

- one app-lifetime notification store and observer boundary;
- terminal source writes before notification publication;
- source-specific deterministic dedupe;
- exact logical navigation targets;
- explicit same-runtime versus reload/tab-close guarantees; and
- producer-independent unread/read and accessibility behavior.

## 3. Product and ownership laws

### 3.1 Notifications observe; they do not own work

The notification system never becomes the source of truth for Assistant sessions, Terra ledgers, export jobs, project state, billing, updater state or network state. A producer must first commit or expose one validated terminal source record. Only then may an observer publish the corresponding notification.

A notification write cannot turn a failed operation into success, retry work, mutate a project, alter chat content, create an export file, charge credits or claim an update. If notification storage is blocked, the terminal source remains authoritative and later reconciliation may publish the missed notification.

### 3.2 Truth before convenience

- Export success means Finder write, finalization and post-write validation all succeeded. The exact body is **“Your animation is done exporting.”**
- AI success means the exact answer/reply is durably written to the correct Assistant session or Terra project ledger.
- Failure means a validated terminal `failed`, `interrupted` or deadline outcome from the exact attempt. A timeout is failure, not success and not an offline claim.
- Explicit user cancellation and Finder cancellation are not failures and create no notification.
- Provider rejection, server restart, invalid terminal data and connection timeout remain producer-specific failures. They do not automatically create the app-wide offline warning.

### 3.3 Navigation is not cancellation

After the relevant phase, moving to another Diamond Animator route or in-page view must not cancel a supported job. Screen components subscribe to app-lifetime work; they do not own it.

This guarantee is limited to the same live browser app runtime:

- Assistant and Terra may reattach after reload only while their server job still exists; a missing/restarted server settles truthfully as interrupted/failed and never resends.
- Export continues across in-app navigation only. Reload, tab close, browser crash or process exit cannot be claimed to continue browser-local encoding/file writing. On a later boot, a durable active export journal becomes an interrupted export failure if completion was not already validated.
- No phase promises background execution after the browser or app runtime is terminated.

### 3.4 No duplicate state owner or project mutation

The notification store is separate from authored project bytes, project versions/history, recovery drafts, Assistant session content, Terra ledger content and export output. Clicking a notification may open an existing source through its accepted read/open pipeline; it may not silently Save, adopt, migrate, retry, regenerate, rename, duplicate or otherwise mutate that source.

### 3.5 No fake or speculative events

Ordinary product startup contains no seeded/sample notifications. Proof-only fixtures may inject isolated records in the test profile; they must never be imported by production runtime code or persist into Arthur's ordinary app profile.

The three future event kinds in §4.2 have no registered producer, no enabled action and no visible sample row. Their contracts exist only so later approved work cannot invent incompatible identity or truth rules.

## 4. Event catalog and exact copy

### 4.1 Active event kinds

| Event type | Exact title | Exact body/template | Terminal source | Click result |
| --- | --- | --- | --- | --- |
| `export.completed` | `Export complete` | `Your animation is done exporting.` | validated `ExportResultReceiptV1` | open the exact export result; expose the exact source project action |
| `export.failed` | `Export failed` | `Your animation couldn't finish exporting.` | terminal export failure/interruption receipt after a file-writing job started | open that export failure/result record with user-initiated retry path |
| `assistant.reply.completed` | `AI Assistant replied` | `AI Assistant finished replying.` | Assistant answer and terminal turn committed to IndexedDB | open exact session and focus exact turn/answer |
| `assistant.reply.failed` | `AI Assistant reply failed` | `AI Assistant couldn't finish replying.` | failed/interrupted/deadline turn committed to IndexedDB | open exact session and focus exact failed turn and Retry control |
| `workspace.terra.reply.completed` | `Terra replied` | `Terra finished replying in “{projectTitle}”.` | terminal snapshot and assistant ledger message committed for exact project/workspace | open exact saved project/workspace and focus exact Terra reply |
| `workspace.terra.reply.failed` | `Terra reply failed` | `Terra couldn't finish replying in “{projectTitle}”.` | terminal failed/deadline snapshot and message committed for exact project/workspace | open exact project/workspace and focus exact failed request |
| `system.internet.offline` | `You're offline` | `There is no internet, so no AI will be able to be called.` | one browser-declared offline incident | keep user in place and focus the app-wide warning/details |

`projectTitle` is the sanitized title captured at the terminal source write. Renaming later does not rewrite historical copy. Target resolution may show the current project title separately.

### 4.2 Dormant future event kinds

| Event type | Reserved exact title/body | Activation truth gate | Future action contract | Current state |
| --- | --- | --- | --- | --- |
| `workspace.ai-animation.completed` | `Animation ready` / `AI Animator finished animating “{projectTitle}”.` | a later approved AI Animator phase has atomically committed validated authored animation through the canonical command/history owner | exact project + exact committed transaction/result | inactive; current Terra chat must never emit it |
| `ai.usage.low` | `AI usage is low` / `You have 10% of your AI usage remaining.` | an authoritative usage service reports remaining allowance `<= 10%` after a downward threshold crossing | exactly one authoritative action label, `Buy AI credits` or `Refill AI usage` | inactive; no local estimate or AI Dashboard placeholder may emit it |
| `app.update.available` | `Update available` / `A new Diamond Animator update is available.` | a real trusted updater verifies a newer applicable release | open the real updater/release action | inactive; no hard-coded version, timer or demo event may emit it |

The schema validator knows these discriminants, but the producer registry rejects them while `enabled` is false. Phase 4 proves zero production emissions for all three.

## 5. `DiamondNotificationV1` durable contract

Every persisted record has exactly this logical shape. Implementation may use equivalent TypeScript organization, but it may not weaken required fields or discriminated targets.

```ts
type DiamondNotificationV1 = {
  schema: "diamond-notification/v1";
  notificationId: string;       // deterministic SHA-256 identity described below
  eventType:
    | "export.completed"
    | "export.failed"
    | "assistant.reply.completed"
    | "assistant.reply.failed"
    | "workspace.terra.reply.completed"
    | "workspace.terra.reply.failed"
    | "system.internet.offline"
    | "workspace.ai-animation.completed"
    | "ai.usage.low"
    | "app.update.available";
  producerVersion: 1;
  outcome: "completed" | "failed" | "warning";
  source: {
    kind:
      | "export"
      | "assistant"
      | "workspace-terra"
      | "connectivity"
      | "workspace-ai-animation"
      | "ai-usage"
      | "updater";
    sourceId: string;
    attemptId: string;
    terminalSequence: number;
    terminalDigest: string;
  };
  origin: NotificationOriginV1;
  target: NotificationTargetV1;
  title: string;
  body: string;
  occurredAt: number;
  createdAt: number;
  readAt: number | null;
  revision: number;
  payloadDigest: string;
};

type NotificationOriginV1 =
  | { kind: "assistant"; sessionId: string; turnId: string; jobId: string }
  | {
      kind: "workspace-terra";
      workspaceIdentity: string;
      projectId: string | null;
      projectGeneration: number;
      jobId: string;
      projectTitle: string;
    }
  | {
      kind: "export";
      exportJobId: string;
      projectId: string;
      projectRevision: number;
      projectDigest: string;
      projectTitle: string;
      filename: string;
      receiptId: string;
    }
  | { kind: "connectivity"; offlineIncidentId: string; offlineSince: number }
  | {
      kind: "workspace-ai-animation";
      projectId: string;
      projectGeneration: number;
      jobId: string;
      transactionId: string;
      projectTitle: string;
    }
  | {
      kind: "ai-usage";
      usageScopeId: string;
      allowancePeriodId: string;
      remainingPercent: 10;
      thresholdEpisodeId: string;
    }
  | { kind: "app-update"; updaterChannel: string; availableVersion: string };

type NotificationTargetV1 =
  | { kind: "assistant-turn"; sessionId: string; turnId: string; jobId: string }
  | {
      kind: "workspace-terra-turn";
      workspaceIdentity: string;
      projectId: string | null;
      projectGeneration: number;
      jobId: string;
      openAiPanel: true;
    }
  | {
      kind: "export-result";
      exportJobId: string;
      projectId: string;
      projectRevision: number;
      projectDigest: string;
      receiptId: string;
    }
  | { kind: "connectivity-warning"; offlineIncidentId: string }
  | {
      kind: "workspace-ai-animation-result";
      projectId: string;
      projectGeneration: number;
      jobId: string;
      transactionId: string;
    }
  | {
      kind: "ai-usage-refill";
      usageScopeId: string;
      allowancePeriodId: string;
      actionLabel: "Buy AI credits" | "Refill AI usage";
    }
  | { kind: "app-update"; updaterChannel: string; availableVersion: string };
```

### 5.1 Deterministic identity and terminal winner

`notificationId` is the lowercase SHA-256 hex digest of:

```text
diamond-notification/v1 | source.kind | source.sourceId | source.attemptId
```

Examples:

- Assistant: source ID is `sessionId/turnId`; attempt ID is `jobId`.
- Terra: source ID is stable workspace/project identity plus project generation; attempt ID is `jobId`.
- Export: source ID is exact selected `projectId/revision/projectDigest`; attempt ID is `exportJobId`.
- Offline: source ID is `browser-profile`; attempt ID is the persisted `offlineIncidentId`.
- Dormant AI Animator: source ID is exact project/generation/committed transaction; attempt ID is the future Animator `jobId`.
- Dormant low usage: source ID is authoritative account/usage scope plus allowance period; attempt ID is the persisted downward-threshold episode ID.
- Dormant update: source ID is the trusted updater channel; attempt ID is the verified available version.

Success and failure for the same attempt therefore share one notification ID. The first validated terminal source committed under compare-and-swap wins. A later conflicting terminal event is rejected, recorded as a proof-visible integrity fault and never creates a second row.

`terminalDigest` binds the complete terminal source receipt/snapshot used to publish. `payloadDigest` binds the normalized notification excluding its own digest. The notification store validates both on read and preserves unreadable raw rows without silently rewriting them.

### 5.2 Origin contract

`NotificationOriginV1` is a discriminated union containing only navigation and presentation identity:

- Assistant: `sessionId`, `turnId`, `jobId`.
- Terra: `workspaceIdentity`, optional official `projectId`, `projectGeneration`, `jobId`, captured project title.
- Export: `exportJobId`, `projectId`, resolved saved revision, project digest, captured project title, filename and validated result/failure receipt ID.
- Connectivity: `offlineIncidentId`, `offlineSince` and no project/chat identity.
- Dormant future origins: exact future Animator project/generation/job/transaction, exact authoritative usage scope/period/threshold episode, or exact trusted updater channel/version. These validate structurally but cannot publish while their registry entries are disabled.

Prompts, answers, Terra message bodies, project artwork, audio, file contents, credentials, provider receipts and absolute/user OS paths are forbidden from notification records. Filename is allowed because the Export UI already asks for it; it must be normalized and never expanded into an OS path.

### 5.3 Target contract

`NotificationTargetV1` is exactly one of:

- `assistant-turn`: `/assistant`, exact `sessionId`, `turnId`, `jobId`;
- `workspace-terra-turn`: exact project/workspace locator, `projectGeneration`, `jobId`, and `openAiPanel: true`;
- `export-result`: `exportJobId`, exact saved source identity, and result/failure receipt ID;
- `connectivity-warning`: the current app surface and active warning; or
- `workspace-ai-animation-result`, `ai-usage-refill` or `app-update`: accepted as dormant schema contracts only and rejected by the active producer/action registry.

The target stores logical identity, not arbitrary URLs. One trusted navigation adapter constructs app routes and rejects unrecognized target kinds. Notification data can never supply `javascript:`, external or unchecked URL actions.

### 5.4 Strict normalization and bounds

- The validator rejects unknown schema versions, unknown fields, incompatible event/outcome/origin/target combinations and all inactive future publications.
- Existing session/project/job/digest validators remain authoritative. Every other identity is NFC-normalized, 1–256 UTF-8 bytes and contains no control character.
- `projectGeneration`, project revision, terminal sequence and record revision are non-negative safe integers; terminal sequence and record revision are at least 1.
- `occurredAt`, `createdAt` and non-null `readAt` are finite integer Unix milliseconds. `occurredAt <= createdAt`; `readAt` is null or `>= createdAt`.
- Titles are at most 80 Unicode scalar values; bodies are at most 280; filenames are at most 255 UTF-8 bytes after the existing Export normalization. One complete normalized notification is at most 8 KiB.
- Title/body are generated from the closed §4 catalog, not accepted as producer-authored copy. The only interpolation is a sanitized captured project title, truncated with an ellipsis as needed to keep the full body within 280 scalar values.
- SHA-256 digests are exactly 64 lowercase hexadecimal characters. Validation recomputes the notification ID and payload digest before a row is readable/actionable.

## 6. Origin visibility, unread and read semantics

### 6.1 Exact origin-visible predicate

A supported terminal event is `originVisible` only when all of the following are true at notification publication, after the terminal source has been committed and reread:

1. `document.visibilityState === "visible"`;
2. the Diamond Animator window has focus;
3. the active surface is the producer's exact origin surface;
4. its source identity matches exactly; and
5. its terminal content/status region is mounted and available to assistive technology.

Source-specific identity is:

- Assistant: exact session selected and exact turn present in Conversation;
- Terra: exact workspace/project generation mounted and its AI conversation region present;
- Export: exact export job result/failure screen visible.

Hidden tabs, another chat, another project, Home, Tutorials, My Projects, Open Project, another Export selection or any other surface are not origin-visible.

### 6.2 Initial read state

- If `originVisible` is true, persist the notification as already read with `readAt = createdAt`. It remains in history but does not increment the badge.
- Otherwise persist it unread with `readAt = null` and update the badge once.
- Offline has no originating content surface, so a new offline incident is unread even though its banner is visible.

### 6.3 User actions

- Opening or closing the center does not mark anything read.
- Activating one notification first commits that record read, then resolves its target. Navigation is not falsely described as part of the IndexedDB transaction; a navigation failure leaves the row read and shows the safe unavailable-target message.
- Successfully arriving at an exact target through another app path marks matching notifications read after identity validation.
- **Mark all as read** marks the current validated readable rows in one transaction. It does not delete them and does not dismiss an active offline banner.
- There is no Phase 1 delete/dismiss/history-clear feature.
- If a target has been deleted, renamed beyond resolution, corrupted or otherwise unavailable, activation marks the item read, keeps the user on a safe surface and announces **“This notification's original item is no longer available.”** It never opens a similarly named source.

## 7. Center UI and app-wide warning

### 7.1 Shared foundation

One client-side `NotificationCenterProvider`/coordinator is mounted from the root layout and survives Next route changes. It renders no global bell. Home and Assistant alone mount their page-local triggers, with the view scopes defined in the D-0138 correction above. No other surface receives a trigger.

### 7.2 Trigger and panel

- Accessible name: **Notifications** when closed; **Close notifications** when open.
- `aria-expanded` and `aria-controls` identify the panel.
- Zero unread: no dot/count.
- Any unread count: one blue dot without a visible numeral, with the exact view-scoped count in accessible text, for example **Notifications, 3 unread**.
- The bell animation runs once for a newly committed unread event and respects reduced motion. Opening the panel does not manufacture the dot or replay the animation.
- Desktop uses an anchored, bounded popover that does not expand the header width. Compact uses a bounded sheet/dialog that cannot create horizontal page overflow.
- The panel heading is **Notifications**. Empty copy is **No notifications yet.**
- Rows sort by `occurredAt` descending, then `notificationId` ascending. Each shows title, body, localized relative time with an exact machine-readable timestamp, unread state and one full-row activation target.
- **Mark all as read** is present only when at least one readable row in the current view is unread, and marks only that view's eligible records.
- Escape, outside activation and the close control close the panel and restore focus to the trigger. Tab order is contained only when compact presentation is modal.
- New unread events receive one `aria-live="polite"` announcement of title and body. Historical load, cross-tab reread and duplicate delivery do not repeat the announcement.

### 7.3 Offline warning

Phase 4 adds one root-mounted non-modal warning region on every product surface while an offline incident is active. It uses the exact body:

**There is no internet, so no AI will be able to be called.**

The banner and center row are different views of the same incident ID. Marking the row read does not hide the banner. Only a subsequent browser `online` transition closes the active incident; reconnect creates no separate success notification and starts no automatic retry.

## 8. Persistence, capacity, concurrency and dedupe

### 8.1 Local durable store

Use one versioned IndexedDB database, `diamond-notifications-v1`, with notification, metadata and lease stores. It is local to the same browser profile/device and is not cloud synced. Read/unread state and result summaries survive in-app navigation, reload and browser restart.

Metadata includes schema version, store revision, producer reconciliation cursors, current offline incident identity/state and the last confirmed online transition. A version mismatch fails closed with a visible center-storage state; it does not clear old records automatically.

### 8.2 Capacity and corruption

The supported bound is 500 notification records and 2 MiB of validated notification data. Before a new insert, the store may prune only the oldest read rows until both bounds are satisfied. It never evicts an unread row or an unreadable/corrupt raw row.

If unread/corrupt rows or browser quota block publication:

- the producer terminal source remains intact;
- the center shows a non-notification storage error;
- no success is fabricated and no prior row is cleared;
- after the user marks readable rows read or storage becomes available, explicit **Retry notification recovery** plus startup/focus reconciliation may publish the missing source event with the same deterministic ID.

Corrupt rows count conservatively toward row/byte capacity and their raw bytes remain unchanged.

### 8.3 Cross-tab ownership

Writes use `navigator.locks` when available and a time-bounded lease plus final compare-and-swap when it is not. `BroadcastChannel` is invalidation only; focus/visibility and bounded periodic rereads remain authoritative. Delivery and poll observation may be at least once, but the durable logical row is exactly once by deterministic ID and terminal winner.

Two tabs observing the same Assistant, Terra, Export receipt or offline incident must converge on:

- one notification record;
- one unread count contribution;
- one terminal source outcome;
- monotonically increasing record/store revisions; and
- no repeated live-region announcement after authoritative reread.

## 9. Phase 2 AI completion architecture

### 9.1 Assistant observer

Pending Assistant turns remain in the accepted Assistant IndexedDB contract. A root `AssistantCompletionObserver` subscribes to that store, polls the exact accepted `sessionId/jobId` without resubmission and applies the existing snapshot validation rules. On terminal:

1. commit `finishTurn(...)` to the exact session;
2. reread and verify the exact terminal turn/answer;
3. derive completed versus failed/interrupted/deadline event;
4. evaluate origin visibility; and
5. publish/upsert the notification.

The Assistant screen consumes the same observer state and must not run a second competing poller. Existing reveal/Thinking/Searching/Finalizing presentation remains screen-local and does not delay the durable source or notification. Returning to the exact chat focuses the exact turn; a completed answer is never replayed or duplicated.

### 9.2 Terra observer

Submission creates one bounded pending-Terra descriptor containing exact workspace/project identity, project generation, job/turn identity and captured title. A root `TerraCompletionObserver` polls the current `/api/ai-animator` job without resubmission.

On terminal it must, in order:

1. validate sequence/project/job/generation through the accepted AI Animator contract;
2. upsert the terminal snapshot into the exact project-scoped ledger;
3. append exactly one terminal assistant message for that job;
4. verify the saved ledger; and
5. publish the completed or failed notification.

The workspace panel becomes a subscriber/presenter, not a second terminal writer. Existing minimum Thinking/reveal animation may run when the panel is visible, but it cannot hold the durable terminal result hostage after navigation.

If an untitled New workspace is officially saved before in-app exit, the pending descriptor is transactionally rebound to the new official `projectId` while retaining its stable workspace/job identity. Save and Exit may not leave before this succeeds. An unsupported hard reload/tab close before an official project exists may settle as unavailable/interrupted; its notification must not point at another project.

### 9.3 AI failure and cancellation

Timeout, validated provider failure, server interruption, invalid terminal data that is safely converted to the existing producer failure, or an exhausted reconnect/deadline produces the matching failure notification after the source failure is committed.

Explicit Cancel produces no center notification. No retry is automatic. Activating a failure notification reveals the existing explicit Retry/resend affordance only where that producer already permits it.

## 10. Phase 3 export completion architecture

### 10.1 App-lifetime export coordinator

After preflight succeeds and the user grants a Finder file handle, one root `ExportJobCoordinator` owns the exact immutable `ExportSelectionV1`, `ExportRequestV1`, live file handle, `AbortController`, progress and terminal inspection. `ExportAnimationPlayer` subscribes to it. Unmounting the player no longer aborts the job.

The live file handle and absolute OS location are never placed in notification storage. The coordinator keeps the handle only in memory for the current runtime. A small durable export journal contains exact source/request/job identity, normalized filename, stage, timestamps and terminal receipt identity/digest.

Export execution is pinned to the initiating tab because only that runtime owns the live file handle and encoder. Another tab may observe the journal, render the eventual result/failure summary and converge on the same notification, but it may not take over file writing. Closing the initiating tab follows §10.3 rather than transferring the capability.

### 10.2 Navigation and result

While a file-writing job is active, Export provides **Continue in background**. It returns to the exact originating Home or still-mounted workspace without cancelling. Other in-app navigation also leaves the coordinator alive. **Cancel export** remains explicit and keeps current cleanup guarantees.

On validated success:

1. persist `ExportResultReceiptV1` with filename, selected destination/preset, dimensions, frame count, duration, byte length, validation summary, exact source revision/digest and completion time;
2. verify the receipt;
3. publish `export.completed` with exact body **“Your animation is done exporting.”**; and
4. expose an exact project action and result view. The action never claims it can reveal an unavailable OS path or reopen the file itself.

On failure after the file-writing job started:

1. perform current best-effort zero-byte partial cleanup;
2. persist a sanitized terminal failure/interruption receipt;
3. publish `export.failed`; and
4. expose the exact source selection and user-initiated retry path. Retry requires a new explicit Finder gesture/handle and never overwrites or resumes silently.

Preflight errors before a file-writing job exists remain visible in Export and do not create a center event. Finder cancellation and explicit Cancel remain cancellation, not failure.

### 10.3 Reload/tab-close honesty

At startup, an export journal still marked active with no validated terminal receipt becomes one interrupted failure record. The app may report that the export was interrupted and that an incomplete file might require user inspection, but it cannot claim cleanup that was impossible after process death. It never publishes `export.completed` from progress, byte count or an unvalidated file.

## 11. Phase 4 offline and future-contract rules

### 11.1 One real offline incident

The app starts an offline incident only when the browser reports `navigator.onLine === false` at initial hydration or dispatches an `offline` event. Provider timeouts, HTTP 4xx/5xx, rate limits, model errors, server restarts and one failed fetch do not prove app-wide internet loss and must not trigger this event.

Under the shared store lock, the first observation creates and persists one `offlineIncidentId`, shows the warning and publishes one notification. Rerenders, route changes, multiple AI attempts, focus changes, multiple tabs and repeat `offline` events reuse that active incident and create no spam. If startup is offline and an active persisted incident exists, it is reused. If startup is online, any stale active incident is closed without a success notification. A later offline transition creates a new incident.

`navigator.onLine === true` is not proof that any particular provider works. Reconnect removes only the app-wide offline state; producer-specific errors remain until their own user-driven recovery.

### 11.2 Dormant contracts

Phase 4 defines and validates the three future types in §4.2 but leaves them disabled:

- AI-animation completion identity is the exact future Animator job plus the validated committed V2 history transaction; a chat reply alone can never satisfy it.
- Low-usage identity is authoritative account/allowance period plus one downward `>10%` to `<=10%` threshold episode. It may re-arm only after an authoritative refill/new period raises remaining usage above 10%. Buy/Refill remains disabled until a real billing action exists.
- Update identity is updater channel plus available release/version. One version produces at most one logical record and becomes unavailable/read-only when the updater withdraws it or the installed version reaches it.

No billing dashboard, Buy/Refill workflow, AI Animator authored-animation producer, version polling, release download, updater service, external request, OS notification or email system may be added.

## 12. Security, privacy, cost and accessibility

### 12.1 Security and privacy

- Notification data is local-only and does not create telemetry, analytics or remote synchronization.
- No notification may embed arbitrary HTML, markdown execution, external URL or user-supplied action.
- Titles/filenames are rendered as text and bounded before storage.
- Notification and reconciliation logs redact prompts, responses, project content, file contents, credentials, provider payloads and OS paths.
- Clicking a project target reuses the accepted collection/bootstrap validation and exact identity checks. Clicking an Assistant target reuses Assistant session validation.
- The root observer cannot import server credentials into the browser or widen local-only API exposure.

### 12.2 Cost

The notification center and its polling/reconciliation make zero new provider, search, transcription, social, billing or updater calls. They observe jobs the user already started. They cannot retry or submit a job. Deterministic doubles are the default proof path; any later live/paid provider smoke needs separate exact authority.

### 12.3 Accessibility

Each phase proves keyboard-only trigger/panel/row/Mark-all operation, correct focus return, semantic name/state/count, non-color unread indication, readable exact timestamps, one polite terminal announcement, no repeated historical announcement, reduced motion, zoom through 200%, compact reflow without horizontal overflow, contrast, and zero serious/critical Axe findings on changed surfaces.

The offline warning is a status region, not an interruptive alert loop. Failure rows communicate failure in text, not color alone. Dynamic counts and new rows do not steal focus.

## 13. Scope and explicit non-goals

### 13.1 In scope

- replacement of the existing header preview with the shared real center;
- local durable event/read state and app-lifetime coordinators/observers;
- exact supported completion/failure/offline events;
- exact source navigation and unavailable-target behavior;
- bounded persistence, cross-tab dedupe, recovery and accessibility;
- narrow controls needed to continue Export across in-app navigation; and
- dormant future discriminants and validation only.

### 13.2 Not in scope

- billing, checkout, subscription, dashboard metering changes, Buy/Refill implementation or credit policy;
- resuming or implementing paused SPEC-0008 AI Animator Phases 2–6;
- AI-generated animation, animation mutation, new prompt/model/reasoning/search/transcription behavior or automatic retry;
- a real updater, update polling, download/install/restart workflow or release service;
- OS/browser push notifications, Notification API permission, service workers, background sync, email, SMS, Slack or other external delivery;
- direct social upload/posting or Export format/render/fidelity changes;
- cloud sync, accounts, auth, collaboration, analytics or telemetry;
- arbitrary deep-link/router redesign or unrelated Home/Assistant/workspace/Export visual redesign;
- project repository/history/recovery schema changes except exact read-only locator use; or
- deployment, public-beta policy or dependency upgrades not separately approved.

## 14. Four implementation phases and stop gates

### 14.1 Mandatory owner gate before Phase 1

Phase 1 is blocked until all of the following are true:

1. Arthur creates **Project Manager Version 5** as the new primary Diamond Animator Project Manager.
2. The current Project Manager explicitly transitions to **AI Animator/Dad support** and no longer owns ordinary SPEC-0014 phase management.
3. The new PM V5 reads the canonical control plane, this exact published spec and current runtime evidence.
4. This planning package is reviewed, separately published and synchronized to canonical `main`.
5. Arthur separately authorizes Phase 1 from that exact planning SHA.
6. One fresh dedicated Phase 1 Spec Executor starts in Plan mode and refreshes the exact code/conflict audit.

This specification records the gate; it does not create PM V5 or perform the role transition.

### 14.2 Phase 1 — Notification center foundation and durable event contract

Scope:

- root app-lifetime provider/store/navigation adapter;
- validated `DiamondNotificationV1` contract and active/dormant registry;
- deterministic identity/digest/read-state operations;
- shared bell, unread badge, center panel, empty/error states and target-resolution seams;
- production UI contains no injected event;
- isolated proof fixtures cover every active row type and dormant rejection.

Acceptance flow:

1. Open Home with an empty store: the existing preview is gone, the shared bell has no badge and the panel says **No notifications yet.**
2. Visit Assistant, Credits/AI Dashboard, New/Open workspace, Export, Tutorials, Open Project and My Projects: exactly one Assistant-only trigger exists on Assistant, exactly one all-events trigger exists on Home, and every other surface has zero triggers without breaking existing controls/layout.
3. In an isolated proof profile, insert valid unread/read records through the real store API; verify ordering, badge, full copy, Mark all, keyboard/focus, compact presentation and exact target dispatch.
4. Attempt duplicate, conflicting, corrupt, over-capacity and dormant events; verify fail-closed behavior and unchanged source fixtures.

Exit proof:

- store/contract oracle and mutation rejection;
- real Chromium desktop/compact screenshots and interaction receipts;
- IndexedDB reload/restart/two-tab/read-state/corrupt-row/capacity proof;
- accessibility proof;
- zero producer connections, zero provider calls and zero project/session/export mutation; and
- immutable manifest for the exact Phase 1 allowlist/evidence.

Stop after the Implementation Review Packet. Phase 2 remains unauthorized.

### 14.3 Phase 2 — AI Assistant and Terra reply completion/failure across navigation

Entry gate: Phase 1 accepted, propagated, separately published/integrated/synchronized/proof-preserved/cleaned up; Arthur separately authorizes Phase 2; fresh Plan-mode executor confirms current Assistant/Terra contracts.

Scope:

- one root Assistant observer and one root Terra observer;
- shared terminalization helpers with screen UI as subscribers;
- exact completion/failure/timeout events, visibility/read logic and click navigation;
- pending Terra locator/rebind for New/Open workspaces;
- no animation mutation and no producer-policy change.

Acceptance flow:

1. Start an Assistant answer in chat A, leave for Home or another surface before terminal, allow deterministic completion, observe one unread event, activate it and land on exact chat A/turn/answer.
2. Repeat with validated failure and deadline; land on exact failed turn and explicit Retry control. Explicit Cancel creates no event.
3. Start Terra in a New workspace, use successful Save and Exit before terminal, allow completion, activate one unread notification and reopen the exact saved project with exact reply focused.
4. Repeat from an opened project, including failure/deadline and navigation to another project; never open the wrong project. Explicit Cancel creates no event.
5. Stay focused on each exact origin through terminal; the history row exists already read and badge does not increment.
6. Exercise two tabs and reload reattachment without duplicate answer, ledger message, terminal result, provider request or notification.

Exit proof includes deterministic success/failure/deadline/cancel/navigation/reload/server-restart/two-tab matrices, exact source-before-notification receipts, zero automatic resend, exact project/session identity, no animation/project mutation, protected SPEC-0008/SPEC-0012 behavior and immutable manifest.

Stop after the Implementation Review Packet. Phase 3 remains unauthorized.

### 14.4 Phase 3 — Export completion/failure across navigation

Entry gate: Phase 2 fully closed/published/cleaned up; Arthur separately authorizes Phase 3; fresh Plan-mode executor refreshes current SPEC-0009/export proof and File System Access constraints.

Scope:

- one same-runtime export coordinator and durable journal/result/failure receipts;
- `Continue in background`, screen subscription and explicit cancellation;
- exact completed/failed notifications and exact result/source navigation;
- reload/tab-close interrupted truth and best-effort cleanup reporting;
- no encoder/render/fidelity/destination catalog redesign.

Acceptance flow:

1. Start a real deterministic fixture export, choose a writable handle, choose **Continue in background**, navigate to Home/workspace and receive exactly one unread **Your animation is done exporting.** event only after media validation.
2. Activate it; open exact export result metadata and exact source project action. Do not show or claim an OS path.
3. Stay on the exact result screen through completion; persist one read history row and no badge increase.
4. Inject encoder/write/validation/deadline failures after job start; receive one failure event linked to the exact selection/error and explicit retry path.
5. Prove explicit Cancel and Finder cancel produce no notification and keep cleanup semantics.
6. Prove in-app route changes do not abort; reload/tab termination never claims continued success and later reconciles an active journal to one interrupted failure.

Exit proof includes actual encoded/decoded fixture output, result receipt/digest, failure/cancel/cleanup/navigation/reload matrices, cross-tab ownership, unchanged project/history/credits, zero network/provider/social calls, all SPEC-0009 fidelity regressions and immutable manifest.

Stop after the Implementation Review Packet. Phase 4 remains unauthorized.

### 14.5 Phase 4 — Reliability, offline, concurrency, dedupe, persistence, navigation, accessibility and regression proof

Entry gate: Phase 3 fully closed/published/cleaned up; Arthur separately authorizes Phase 4; fresh Plan-mode executor audits all active producers and dormant boundaries.

Scope:

- app-wide offline incident state/banner/notification with exact copy and dedupe;
- whole-feature persistence/capacity/corruption/quota/reconciliation proof;
- multi-tab/visibility/focus/navigation/deleted-target/reload/restart races;
- final accessibility/performance/protected regression closure;
- dormant future schema/action guards with zero emission.

Acceptance flow:

1. Start online, simulate one browser offline transition and navigate throughout the app: exact warning remains visible, one unread row exists and repeated AI attempts/routes/tabs create no spam.
2. Mark the row read while offline: badge clears as applicable but banner remains. Simulate online: banner closes, no success notification and no automatic retry. Simulate a later offline transition: exactly one new incident/row.
3. Cause provider-specific timeout/HTTP failure while `navigator.onLine` remains true: only the producer failure appears; no global offline warning.
4. Repeat active producer outcomes under two tabs, focus/visibility transitions, store lock takeover, BroadcastChannel loss, corrupt rows, quota recovery, target deletion and restart; prove convergence and no false navigation.
5. Attempt to emit AI-animation, low-usage and update-available events from current runtime paths; all are rejected and no row/action appears.
6. Run full desktop/compact/zoom/reduced-motion/keyboard/screen-reader and protected product regression matrix.

Exit proof closes the complete spec only after every active event, copy, identity, click, unread/read, persistence, offline and failure rule passes. Stop for acceptance/CPA/publication lifecycle; no deployment follows automatically.

## 15. Protected regression matrix

Every phase proves its changed paths plus these unaffected systems in proportion to risk:

| Protected system | Required invariant |
| --- | --- |
| Home/credits chrome | brand/menu/Home/AI Dashboard actions and accepted Home scroll/Finalizer removal remain intact |
| Assistant | fixed Terra model/reasoning/search/dictation/session/reveal/retry/cost and zero project mutation remain unchanged except Phase 2 completion ownership |
| Workspace Terra | accepted Phase 1 chat/Thinking/reply/cancel/ledger and no animation mutation remain unchanged except Phase 2 completion ownership |
| Paused AI Animator | SPEC-0008 Phases 2–6 stay Paused/Unauthorized/Not started; no generated-animation event |
| Unified editor | one V2 state/history/repository owner; drawing/tools/timeline/layers/onion/playback/assets/Save/Open/Save As/Save and Exit unchanged |
| Project safety/library | recovery, leases/CAS, source validation, rename/duplicate/delete, My Projects/Open Project and Movie Viewer invariants remain |
| Export | immutable saved source, render/timing/audio/geometry, Finder permission, cancellation, cleanup and validation unchanged except Phase 3 lifecycle ownership |
| Persistence | no notification bytes inside project versions/history, Assistant message bodies or authored content |
| Credits/billing | no metering, billing, Buy/Refill or dashboard behavior change; low-usage contract inactive |
| Updater/deployment | no updater, version polling, release download, deployment or public-beta change |
| External delivery | no OS push, service worker, email, social or other remote notification |
| Cost/privacy | no automatic submit/retry, no added live provider calls, no sensitive payload/path in notifications |

## 16. Common technical proof manifest

Each phase produces an immutable manifest and independent validator that bind:

- exact canonical base/HEAD and branch/worktree identity;
- empty index;
- exact phase-authorized dirty path allowlist;
- SHA-256/byte length for every source, fixture, test and evidence file;
- exact required/forbidden strings and imports;
- deterministic event/source/target/digest fixtures;
- command, browser/profile/viewport and assertion counts;
- network/provider request counts and any separately authorized cost;
- IndexedDB/localStorage/project/export before/after digests where relevant;
- proof that no inactive future producer emitted;
- focused TypeScript/lint/build plus known inherited failures separately identified;
- protected regression results;
- mutation tests that prove the validator rejects wrong ID, conflicting terminal outcome, bad digest, wrong project/chat/export target, duplicate, unread eviction, false offline, fake future event and scope expansion; and
- honest proven/not-proven limits.

The Spec Executor validates the manifest, reports its SHA and exact dirty allowlist, returns the Implementation Review Packet and stops. After acceptance, only the Control Plane Architect may propagate records in the same transferred worktree. Publication remains a later explicit task.

## 17. Historical D-0137 planning result, blockers and handoff — superseded by D-0138 above

### 17.1 Proven now

- The planning checkout is exact clean canonical `main` at `acc3204d6c5aa08f1d0d714dcd5a64e8746dcb8d`.
- The Home bell is a local preview with no data/read state.
- Assistant and Terra terminalization are mounted-screen polling responsibilities today, although their server jobs may continue in-process.
- Export lifecycle and abort are screen-owned today; success already requires post-write validation.
- Exact source identities exist for Assistant, Terra and Export and can support deterministic notification identities without putting notification state into authored content.
- The four phases, event copy, schema, identity, read state, visibility, clicks, persistence, offline semantics, failures, proof and protected boundaries are decision-complete for staged implementation.

### 17.2 Intentionally not proven or implemented

- No notification center, root observer, background export continuation, offline incident banner or future producer exists yet.
- Same-runtime continuity after navigation is not continuity after tab/browser/app termination.
- Physical devices and non-Chromium behavior are not claimed by this planning task.
- No live AI/provider request, paid operation, OS Finder export or notification fixture was executed during planning.
- No Phase 1 implementation readiness is claimed until PM V5 exists, the current PM transitions to AI Animator/Dad support, this package is published, and Arthur separately authorizes Phase 1.

### 17.3 Next exact task

Review this docs-only planning package. If accepted, separately authorize publication of only its reviewed control-plane paths. After clean canonical synchronization, Arthur creates Project Manager Version 5 and records the current PM's transition to AI Animator/Dad support. Only then may Arthur separately authorize a fresh Plan-mode Phase 1 Spec Executor from the exact published planning SHA.
