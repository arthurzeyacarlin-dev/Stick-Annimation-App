# SPEC-0010 — Project Safety and Recovery

Status: **Verified/published/integrated/synchronized/proof-preserved/cleaned up; all three phases closed**
Owner: Arthur
Task role: three separately gated implementation phases after later explicit phase authorization
Created: 2026-09-21
Last updated: 2026-09-21
Decision links: [D-0102](../DECISIONS.md), [D-0103](../DECISIONS.md), [D-0104](../DECISIONS.md), [D-0105](../DECISIONS.md), [D-0106](../DECISIONS.md), [D-0107](../DECISIONS.md), [D-0108](../DECISIONS.md), [D-0109](../DECISIONS.md)
TODO IDs: `PLAN-010`, `SPEC-010`, `SAFETY-001`–`SAFETY-003`, `PERSIST-001`
Planning base: canonical `main` commit `092a96c6a17db1bbb307d21128bed84377eba3e7`; clean index and worktree before planning edits
Last verified runtime basis: accepted Phase 3 result from exact base/HEAD `337433b37716fdd71ecc2a9d0239e239519ef655`; rebound immutable manifest SHA-256 `5dc275dc6d30da693ab14e861d7f12728038da0f6b3b1f30a66252880fdd23f5`

## 1. Plain-language outcome

Diamond Animator will protect a user's animation without changing what **Save** means.

- **Save**, **Save As**, and **Save and Exit** write an official saved project through the existing V2 repository.
- The emergency recovery draft is a separate, local safety backup. It is not an official save, is not listed as another project, and never silently replaces one.
- If the app closes unexpectedly after an edit, the next startup can say **Unsaved work found** and let the user choose **Recover Work** or **Discard Draft**.
- Recovering opens a validated, isolated working candidate. The official saved project remains unchanged until the user explicitly saves.

This is exactly three separately gated phases:

| Phase | User outcome | Current state |
| --- | --- | --- |
| 1 — Save and Exit | **File → Save and Exit** uses the existing canonical Save path and returns Home only after successful Save. | Verified; published; integrated; synchronized; proof-preserved; cleaned up |
| 2 — Emergency Recovery Draft | Meaningful committed edits create one bounded, separate, local latest-draft backup without changing the official project. | Verified; published; integrated; synchronized; proof-preserved; cleaned up |
| 3 — Recover Work and Final Safety Proof | Startup offers **Recover Work** or **Discard Draft**, opens only validated recovery data, and closes full save/recovery regressions. | Verified; published; integrated; synchronized; proof-preserved; cleaned up |

No phase authorizes the next. A phase requires its own fresh Spec Executor task after its predecessor is accepted, recorded, published, integrated, synchronized, proof-preserved, cleaned up, and Arthur separately authorizes the next phase.

## 2. Verified current behavior

Evidence date: 2026-09-21. Evidence type: fresh code trace against canonical `main` at `092a96c6a17db1bbb307d21128bed84377eba3e7`.

### 2.1 Visible behavior now

- Workspace **File** currently contains **Save**, **Save As**, and **Export…**. There is no **Save and Exit**.
- `app/page.tsx` owns the local `home` and `animationWorkspace` view state, but `AnimationWorkspace` and `DrawingWorkspace` receive no Home/exit callback.
- An official Save snapshots the unified workspace and writes through the canonical V2 repository. Save As creates a separately identified project through that same repository.
- There is no startup recovery check, **Unsaved work found** screen, recovery draft contract, recovery database, durable recovery scheduler, `beforeunload` recovery contract, or explicit recovery discard action.
- The code name `workspace:pointerup-autosave` is not durable project autosave. It moves pending canvas pixels into the in-memory workspace/history owner after pointer-up. A refresh or crash before official Save can still lose those unsaved in-memory changes.

### 2.2 Current official Save path

```text
File → Save
  → DrawingTopBar.runFileAction(onSave)
  → DrawingWorkspace.saveProject()
  → commitCurrentFrameSnapshotWithoutHistory("unified:save")
  → createPersistedProjectSnapshot(...)
  → buildUnifiedProjectSnapshot(...)
  → saveUnifiedProjectV2(candidate)
  → createUnifiedProjectRepositoryV2().save(...)
  → writeUnifiedProjectV2(candidate, expectedRevision)
  → V2 encode/hash/stage/readback/compare-and-swap head publication
  → saved project identity/title/revision becomes current
```

The path returns `true` only when the repository write succeeds. It returns `false`, retains the workspace, and sets a truthful failed/too-large state when capture, validation, quota, readback, or publication fails. A concurrent edit can make the UI remain **Unsaved changes** even after the captured revision saved.

### 2.3 Current Save As path

```text
File → Save As
  → accessible in-app name dialog
  → the same snapshot preparation boundary
  → saveUnifiedProjectAsV2(candidate, title)
  → new project ID, revision 1, copy provenance
  → transactional V2 storage publication/readback
```

### 2.4 Current navigation path

```text
app/page.tsx view = "animationWorkspace"
  → AnimationWorkspace(root)
  → DrawingWorkspace(initialProject, unifiedProject)

Home transition
  → only app/page.tsx can set view = "home"
  → no workspace exit callback exists today
```

### 2.5 Missing foundation

The missing foundation is not ordinary Save. It is a second, strictly isolated persistence purpose:

1. a versioned recovery envelope and local storage owner;
2. a reliable signal for meaningful committed edits rather than pointer motion or simple navigation;
3. bounded debounce, latest-write ordering, validation/readback, quota handling, and one-draft retention;
4. a startup decision flow that never mutates the official repository by merely viewing or recovering a draft; and
5. proof that Save/Save As/Save and Exit clear only the exact draft covered by a successful official write.

## 3. Permanent product invariants

1. **Official Save stays explicit.** Recovery never changes the official head, version, title, project identity, history, or project list.
2. **One recovery draft maximum.** There is at most one logically active latest-workspace draft per browser profile. Transactional replacement may temporarily retain the preceding valid generation until the new generation verifies.
3. **Last good before newest.** A failed encode, hash, quota, transaction, readback, validation, or cleanup cannot destroy the prior valid recovery draft.
4. **No silent recovery.** Startup never opens or applies a draft without the user's **Recover Work** choice.
5. **No silent discard.** Invalid, stale, or unreadable recovery data is not quietly deleted. Explicit discard is required.
6. **No official overwrite on recovery.** Recovering mounts an isolated candidate. Official bytes change only after a later explicit Save, Save As, or Save and Exit.
7. **Exact-generation clearing.** A successful official write clears a draft only when that write covers the draft's project/session/generation/digest. If edits occurred while Save was running, the newer draft remains or is rewritten.
8. **One writer per draft.** Cross-tab/session conflict fails closed with a visible local warning. A second tab cannot overwrite another tab's active or recoverable draft.
9. **No unload fiction.** `beforeunload`, `pagehide`, or `visibilitychange` may request a best-effort flush of an already prepared candidate, but asynchronous encoding and IndexedDB completion are not guaranteed after abrupt close, process kill, power loss, browser crash, or OS crash.
10. **No network.** Recovery is browser-local and makes zero AI, Terra, provider, analytics, telemetry, cloud-sync, account, or other external request.

## 4. Scope and non-goals

### 4.1 In scope

- one final **Save and Exit** item in the existing File menu;
- reuse of the exact canonical Save preparation/repository path;
- Home return only after a covered, successful official save;
- a separate versioned IndexedDB recovery store with one logical draft;
- meaningful-edit scheduling, bounded debounce, monotonic sequence/CAS, validation, readback, replacement, and cleanup;
- truthful recovery-protection status when a draft is pending, current, stale, blocked, unavailable, or failed;
- startup discovery and the **Unsaved work found** decision surface;
- valid recovery, explicit discard, stale-source safe-copy handling, and corrupt/unavailable handling;
- deterministic storage/fault/concurrency proof and real-browser user-flow proof.

### 4.2 Explicit non-goals

- My Projects or a project-library redesign;
- AI Dashboard, AI Assistant, AI Project Finalizer, AI Animator Phases 2–6, provider work, or any AI prompt/model/job/gradient change;
- cloud sync, accounts, collaboration, background network activity, remote backup, telemetry, or deployment;
- changing Save into continuous official autosave;
- multiple named drafts, recovery history, version browsing, trash, cross-device recovery, or OS-level files;
- a new project schema, timeline model, renderer, command/history owner, or drawing engine;
- changing Export, social destination preparation, codecs, or Finder export;
- changing New/Open/My Project/Tutorials beyond the narrow startup recovery gate;
- guaranteeing recovery of input that had not reached one completed verified local draft write.

## 5. Phase 1 — File → Save and Exit

### 5.1 Exact user flow

1. The user opens the workspace and makes or opens an animation.
2. The user opens **File**.
3. The menu retains **Save**, **Save As**, and **Export…** and adds **Save and Exit** as the final item.
4. Activating **Save and Exit** closes the menu and begins the same canonical official Save used by **Save**.
5. While saving, duplicate Save/Save As/Save and Exit activation is disabled.
6. If the exact current captured generation saves successfully and the workspace instance is still current, the workspace is released and Home appears.
7. If snapshot capture, validation, quota, transaction, readback, stale revision, or any other official Save step fails, the user remains in the unchanged workspace with a truthful failure state.
8. If an edit happens during the in-flight Save, the app does not exit on the stale success; it remains in the workspace as **Unsaved changes** so the newer edit cannot be lost.

### 5.2 Phase 1 implementation boundary

Phase 1 must reuse `DrawingWorkspace.saveProject()` or a narrowly factored equivalent that remains the sole official Save transaction. It must not create a second Save implementation. A successful result must include both repository success and exact-generation coverage before invoking the Home callback.

Authorized runtime path ceiling:

- `app/page.tsx`
- `src/components/workspace/AnimationWorkspace.tsx`
- `src/components/workspace/DrawingWorkspace.tsx`
- `src/components/workspace/DrawingTopBar.tsx`

Authorized technical proof family:

- `scripts/spec0010-project-safety/phase1*.ts`

Any additional runtime/config/dependency path is an entry blocker requiring PM/spec review. No package or dependency change is expected.

### 5.3 Phase 1 acceptance

- Save and Exit is the final File item and is keyboard/focus accessible.
- It performs exactly one official V2 write and reaches Home only after success covers the current generation.
- Every injected failure remains in the workspace and preserves the exact pre-action official head plus current editable state.
- A concurrent edit during Save prevents exit and remains recoverable by ordinary Save.
- Rapid double activation produces one write and one navigation.
- Save, Save As, Export, Undo/Redo, drawing, timeline, layers, audio, background, onion, playback, Terra, and Home remain behaviorally unchanged.
- Phase 1 creates no recovery draft and makes zero network/provider calls.

### 5.4 Phase 1 stop gate

The Spec Executor returns a complete technical manifest and PM Review Packet, then stops. Arthur/PM review the real app. No Phase 2 work, control-plane mutation, staging, commit, integration, push, cleanup, or publication is allowed in that executor task.

## 6. Phase 2 — One latest emergency recovery draft

### 6.1 Recovery record

Use a separate same-origin IndexedDB database owned only by Project Safety and Recovery. Do not add recovery drafts to official V2 `heads`, `versions`, project collection, or legacy stores.

`ProjectRecoveryEnvelopeV1` must bind at least:

```text
schemaVersion: "project-recovery-envelope/v1"
draftId: fixed logical latest-draft key
draftSequence: monotonic integer
ownerSessionId + workspaceInstanceId
sourceProjectId + sourceRevision + sourceProjectDigest
sourceTitle
workspaceGeneration + candidateDigest
candidateEncodingVersion + asset digests/lengths
createdAt + updatedAt + lastMeaningfulEditAt
storedByteLength
status: staged | current
```

The payload is one strictly validated `UnifiedAnimationProjectV2` candidate encoded with content-addressed binary/data-URL assets. It may reuse narrowly exported pure V2 encode/hydrate validation primitives, but recovery storage and official repository publication must remain different owners. Recovery data must not be readable as an official project head.

### 6.2 Meaningful-edit contract

A recovery write is scheduled only after a successful committed change to data that official Save would preserve and whose loss would matter:

- raster/paint, text, symbols, placed assets, catalog changes;
- layer/cell/frame/hold/tween structure or content;
- FPS, project background, sound attachment, persisted effect/transform data;
- Undo or Redo that changes the current saved candidate; or
- another registered manual/accepted authored mutation entering the canonical workspace/history owner.

Pointer movement, hover, panel resize, chat text, playback time, scrubbing without mutation, menu open/close, tool selection alone, current-frame navigation alone, or an unfinished/cancelled/failed gesture must not create a new recovery generation. Reopen-state fields may ride inside the next meaningful snapshot but cannot cause a write by themselves.

### 6.3 Scheduling and durability

- Schedule after the canonical mutation commits, never from transient canvas pixels.
- Debounce bursts for 750 ms after the last meaningful commit, with a three-second maximum wait while the workspace is idle and no gesture/save/playback publication is active.
- Only one preparation/write runs at once. Newer sequences supersede queued older ones; an older completion cannot publish over a newer completed draft.
- Encode/hash outside the IndexedDB read/write transaction. Stage candidate metadata/assets, fully hydrate/read back, validate schema/digests/lengths/project binding, then atomically advance the recovery head.
- Retain the previous valid draft until the replacement head verifies. Garbage-collect unreachable recovery generations/assets after publication, while preserving the current generation if cleanup fails.
- `visibilitychange:hidden` and `pagehide` may attempt to flush a candidate that is already prepared. They must not claim that a new asynchronous encode/write will finish. No busy loop, synchronous giant serialization, beacon, network request, or fake success is allowed.

### 6.4 Bounds, quota, corruption, and concurrency

- One candidate may not exceed the official 128 MiB project bound. Unknown, negative, inconsistent, or oversized lengths fail closed before publication.
- The store has one logical current draft. Old staged/unreachable generations are bounded and cleaned; no unbounded accumulation is allowed.
- `navigator.storage.estimate()` may inform a warning but never proves a write will succeed. The actual transactional result/readback is authoritative.
- Quota/blocked/abort/hash/decode/readback/validation errors preserve the last valid recovery draft and official project exactly. The UI says the safety backup could not be updated and tells the user to use Save.
- Draft writes use session/workspace identity plus transactional sequence/CAS. If another active session owns the draft or a newer sequence exists, this writer stops and warns; it never steals or overwrites the draft.
- If Phase 2 encounters an existing valid draft at mount before Phase 3 provides recovery UI, recovery writing stays disabled and tells the user to use Save. It does not discard or replace the draft.

### 6.5 Clearing

Clear the matching current draft only after:

- an official Save succeeds and covers the same current project/workspace generation/digest;
- Save As succeeds and covers that same generation before identity rebinding;
- Save and Exit succeeds, covers the current generation, and verified draft cleanup completes; or
- Phase 3 performs an explicit, successful **Discard Draft**.

Do not clear on Export, Home display, player use, app startup, failed/stale/concurrent Save, failed Save As, failed Save and Exit, failed recovery, project listing, browser close, or merely opening a project. If official Save succeeds but newer edits exist, the newer recovery work remains protected.

### 6.6 Phase 2 path ceiling

Authorized runtime families:

- `src/components/workspace/DrawingWorkspace.tsx`
- `src/components/workspace/DrawingTopBar.tsx` only for truthful local safety status/failure messaging
- `src/lib/animation/projectRecoveryContractV1.ts` (new)
- `src/lib/animation/projectRecoveryStorageV1.ts` (new)
- `src/lib/animation/unifiedProjectStorageV2.ts` only for a narrowly proved pure codec/validation extraction or export; official write behavior must be byte/behavior protected
- one new pure shared codec module under `src/lib/animation/` only if extracting from `unifiedProjectStorageV2.ts` is necessary and independently proves unchanged official bytes/results
- `scripts/spec0010-project-safety/phase2*.ts`

Changing official V2 schema/version/stores, package dependencies, app navigation, AI code, export code, or any other family is prohibited without spec correction.

### 6.7 Phase 2 acceptance

- Every named meaningful edit yields one latest verified draft after bounded settle; transient/non-meaningful actions do not.
- A realistic large raster/audio/text/layer fixture writes and revalidates while the editor remains responsive.
- Repeated edits collapse to the newest sequence without unbounded records/assets.
- All injected faults preserve official heads/versions and the preceding valid draft.
- Save, Save As, and Save and Exit clear only an exactly covered draft; newer concurrent edits survive.
- Cross-tab/session races cannot replace a foreign/newer draft.
- No recovery payload appears in project lists or Export.
- No network, AI, credit, analytics, account, deployment, or external call occurs.

### 6.8 Phase 2 stop gate

Same role-separated stop as Phase 1. Phase 3 remains Unauthorized/Not started until Phase 2 is accepted, published/integrated, synchronized, proof-preserved, cleaned up, and separately authorized.

## 7. Phase 3 — Recover Work, Discard Draft, and final proof

### 7.1 Startup flow

1. On client startup, before Home/New/Open can create or claim a workspace recovery session, the app checks only the separate recovery store.
2. While checking, show a bounded local loading state; do not flash an editable Home beneath an unresolved valid draft.
3. With no current draft, continue to Home unchanged.
4. With a valid current draft, show **Unsaved work found**, the project name, and a clear local date/time for the last meaningful edit.
5. Offer exactly the primary choices **Recover Work** and **Discard Draft**.
6. **Recover Work** hydrates and validates the candidate again, rechecks source binding, then mounts an isolated working candidate without an official repository write.
7. **Discard Draft** asks for one clear confirmation because it is destructive, atomically removes the recovery head/payload/assets, verifies absence, then continues Home.

### 7.2 Recovery identity rules

- If the official source head still matches the stored source project/revision/digest, mount the recovered candidate against that exact base. A later explicit Save may publish the next official revision through the existing compare-and-swap path.
- If the official source is missing, changed, newer, corrupt, or no longer matches, never merge or overwrite it. Offer recovery as a detached **Recovered copy** with a new transient identity/revision-zero binding. Its later explicit Save creates a separate official project; Save As remains available.
- If the draft itself is corrupt, incomplete, oversized, unknown-version, digest-invalid, cross-project, or asset-invalid, disable **Recover Work**, explain that the safety backup cannot be opened, retain **Discard Draft**, and allow **Continue to Home without deleting** if storage cannot be repaired. Continuing does not claim recovery and may show the same warning next startup.
- Recovering does not clear the draft. It remains until an exact covered official Save/Save As/Save and Exit or explicit discard succeeds.

### 7.3 Recovered workspace fidelity

Recovery must restore all validated persisted candidate data, including project title/base binding, layers/order/visibility, frames/cells/holds/tweens, raster/coverage, text, symbols/assets/catalogs/instances, FPS, background, sound attachments/audio, accepted transforms/effects, auxiliary project-owned state, and safe reopen state. It must not restore transient pointer gestures, open menus/dialogs, hover, playback clock, selection handles, onionskin pixels, provider jobs, secrets, file paths, or browser permissions.

### 7.4 Phase 3 path ceiling

Authorized runtime families:

- `app/page.tsx`
- `src/components/recovery/ProjectRecoveryPrompt.tsx` (new; name may vary only inside this one component family)
- `src/components/workspace/AnimationWorkspace.tsx`
- `src/components/workspace/DrawingWorkspace.tsx`
- Phase 2 recovery contract/storage files
- `src/lib/animation/unifiedWorkspaceBootstrap.ts` and/or `unifiedWorkspaceFactoryV2.ts` only if required to mount the already validated isolated recovery candidate without source mutation
- `scripts/spec0010-project-safety/phase3*.ts`

No package, dependency, AI, export, provider, cloud, account, deployment, or official-storage-schema change is expected. Any such need stops for spec review.

### 7.5 Phase 3 acceptance

- Clean startup with no draft reaches Home unchanged.
- Valid draft startup shows the exact understandable prompt, project name, and time.
- Recover Work opens the exact candidate and writes zero official project bytes until explicit Save.
- Matching-source Save creates the expected next official revision; changed/missing-source recovery saves only as a separate copy.
- Discard requires confirmation, deletes only the exact recovery draft, and never deletes the official project.
- Refresh, browser-tab close, simulated crash/restart, corrupt draft, stale source, blocked storage, quota failure, large draft, multi-tab race, failed official Save, and edit-during-Save paths are proven.
- Full Save/Save As/Save and Exit/Open/Export regressions pass, plus drawing, Fill, Eraser, layers, frames, copy/paste, Undo/Redo, onion, playback, audio, background, Assets, Terra conversation, Home, Tutorials, and keyboard/compact/reduced-motion checks.
- No external request, AI/provider call, credit change, account action, upload, deployment, or secret handling occurs.

### 7.6 Final honest limit

The feature can recover only the last recovery generation whose local transaction completed and passed readback. It cannot guarantee the final milliseconds of an active gesture, a write still encoding, a browser process killed before IndexedDB commit, a device/power/storage failure, manually cleared site data, private-mode eviction, browser-profile loss, or damage outside the application's origin. The UI and proof must not say “everything is always saved.”

## 8. Protected regression matrix

| ID | Protected system | Required proof in every affected phase |
| --- | --- | --- |
| PSR-REG-01 | Official Save | Same snapshot, validation, version/CAS/readback semantics and failure safety. |
| PSR-REG-02 | Save As | Name dialog, new identity/copy provenance, no original overwrite. |
| PSR-REG-03 | Export | Workspace File → Export and Home Export stay functional; no recovery bytes included implicitly. |
| PSR-REG-04 | Drawing/manual tools | Brush, Pencil, Sketch, Pixelate, Glow, Fill, Eraser, Knife, Select/Lasso, Shapes, Text, Assets and Draw Rig remain registered and editable. |
| PSR-REG-05 | Timeline/history | Frames, layers, copy/paste, holds/tweens, FPS, Undo/Redo, onion and playback keep one owner. |
| PSR-REG-06 | Persistence/Open | Native and accepted legacy-source Open remain read-safe; official heads/versions unchanged by recovery-only actions. |
| PSR-REG-07 | AI/Terra | Fixed Phase 1 conversation, reasoning selector, statuses/gradient, transcript/job isolation and zero animation mutation remain unchanged. Phases 2–6 stay paused under D-0093. |
| PSR-REG-08 | Cost/network/privacy | Zero network/provider/paid/analytics calls and zero credit changes. |
| PSR-REG-09 | Accessibility/layout | Keyboard menu/prompt, focus containment/return, compact viewport, 200% zoom and reduced motion. |
| PSR-REG-10 | Concurrency/failure | No stale completion, duplicate write, cross-tab overwrite, partial official save, or old-draft destruction. |

## 9. Proof manifest contract

Each phase must create an ignored `output/spec-0010/phase-N/proof-manifest.json` and an independent validator. The immutable manifest binds:

- exact authorized canonical-main base SHA, unchanged executor HEAD, empty index, and exact dirty-path allowlist;
- SHA-256/size of every implementation, fixture, test, receipt, screenshot, and evidence artifact;
- exact phase acceptance assertions and protected regressions;
- official-head/version/project/history/recovery-store before/after digests;
- deterministic fault injection for capture, encode, hash, transaction, quota, blocked storage, abort, readback, validation, stale sequence, stale project, edit-during-save, multi-tab/session conflict, cleanup, discard, and navigation as applicable;
- browser request ledger proving zero non-loopback/external/provider requests and zero credit change;
- TypeScript, focused lint with measured unchanged repository baseline, production build, exact diff/scope/index checks, and required deterministic suites;
- real Chrome desktop and compact/reduced-motion flows, accessibility findings, page/console errors, performance samples, and cleanup;
- `humanAcceptance: pending Arthur`, `controlPlaneUpdated: false`, and `gitPublication: false` at executor stop; and
- negative manifest mutations proving the validator rejects altered base, scope, source, artifact, assertion, storage, network, cost, and lifecycle facts.

Phase 2/3 performance proof uses a representative realistic project and the existing accepted memory ceilings: settled JS heap below 320 MiB and transient/stress heap at or below 512 MiB. After an idle meaningful commit, a normal representative draft should become verified current within three seconds plus measured storage time; large-project receipts must report actual preparation/write/readback duration rather than hide it. No main-thread task may exceed 250 ms in the accepted representative browser fixture without an explicit reviewed exception. These targets do not override correctness or permit unverified unload claims.

## 10. Security, privacy, cost, and data lifecycle

- Recovery stores the user's full unsaved animation content locally in the browser profile. It is not app-encrypted and is accessible to the same local browser profile/origin security boundary as official local projects.
- Store no credentials, environment variables, cookies, auth tokens, filesystem paths, Finder handles, raw provider responses, analytics identity, or unrelated transcript data.
- Validate every record and byte length before allocation/hydration; reject unknown versions and cyclic/unbounded structures.
- Discard deletes only the recovery database records/assets identified by the current bound draft. It never broad-deletes origin storage or official projects.
- There is no network, token, AI, provider, paid-call, account, social, deployment, or recurring background cost.
- Site-data clearing, browser eviction, private-mode behavior, disk failure, and device/profile loss can remove both official local projects and recovery data; the product must state that local-only limitation honestly.

## 11. Phase entry and lifecycle gates

Before each phase:

1. start a fresh dedicated Spec Executor task in Plan mode from the exact clean synchronized canonical-main SHA;
2. refresh the relevant code/storage/browser evidence and return an exact phase plan before mutation;
3. verify there is only one active review app copy and no other owner editing that worktree;
4. stay inside that phase's path ceiling and make no paid/external request;
5. implement, verify, create/validate the technical proof manifest, return the Implementation Review Packet, and stop;
6. wait for Arthur/PM acceptance or rejection;
7. only after acceptance and executor shutdown may a Control Plane Architect propagate records in that same worktree;
8. publication/integration/push and cleanup require a later explicit instruction; and
9. the next phase cannot begin until the prior phase is durably closed and separately authorized.

GIT-080 published this planning package in `cb80f2baf92f812c97ce758067f6ea28b3c6c187`. D-0103 approves the spec and authorizes exactly one fresh Phase 1 Spec Executor after the activation record is published to clean synchronized canonical `main`. Phase 2 recovery storage and Phase 3 startup recovery remain Unauthorized/Not started.

D-0104 records Arthur's acceptance of the completed Phase 1 review copy and authorization for control-plane propagation plus later publication/integration/cleanup. The executor is stopped and the Control Plane Architect owns the exact accepted worktree sequentially. Phase 2 remains Unauthorized/Not started.

D-0105 records GIT-081 `44cdafc534d7ef096cd2e283532a956c4eaa91f6` Phase 1 publication/integration, proof preservation and D-0054 cleanup. D-0106/D-0107/GIT-082 close corrected Phase 2. Arthur later separately authorized Phase 3; D-0108 records his acceptance after automated proof and a real computer-restart review, plus authority for propagation/publication/integration/push/cleanup.

## 12. Implementation and verification record

Arthur accepted the exact ten-path Phase 1 result from unchanged base/HEAD `db0be15decae427e3ca0d696d945a650f363a4aa`, empty index. The 8,302-byte PASS/VALID manifest `output/spec-0010/phase-1/proof-manifest.json` has SHA-256 `b400293271c1ae0cf78007de5024eb616516a6219d3a9965e03a16d8f7890f19` and accepted-source digest `5ff9239626dd05e456e038b821171f093bbc6120e3810d1dff651a7793ba0900`. Fresh pre-propagation validation passed 16 assertions and rejected ten mutations across identity, base, scope, source/artifact binding, checks, storage, network, cost and lifecycle.

The accepted implementation adds **Save and Exit** as the final File item, reuses the single canonical Save transaction, distinguishes official-write success from current-generation coverage, and invokes the existing Home owner only when both are true. Failure stays editable; a newer edit prevents exit; rapid double activation produces one write/navigation. It creates no recovery store or startup recovery path.

Bound proof passed 18 oracle assertions, 17 contract assertions and 29 real-Chrome assertions across six flows, plus TypeScript, focused lint, an unchanged repository-wide lint baseline, focused production build, diff/scope/index checks, desktop/compact/reduced-motion keyboard behavior, and protected Save/Save As/Export/drawing/layer/onion/playback/Terra-panel regressions. Deterministic implementation proof made zero external/provider/AI/paid calls and zero credit changes. The ignored `.env.local` review setup was separately restored byte-identically without exposing or tracking its secret; exactly one authorized live Terra greeting used `gpt-5.6-terra`, returned a natural reply, consumed 407 tokens and an estimated $0.001214, while Thinking presentation and tracked AI source remained unchanged.

Phase 1 is fully closed through D-0105/GIT-081. Arthur accepted Phase 2's corrected exact eleven-path result from unchanged base/HEAD `44cdafc534d7ef096cd2e283532a956c4eaa91f6`, empty index. The 8,685-byte PASS/VALID manifest `output/spec-0010/phase-2/proof-manifest.json` has SHA-256 `444cf4695574a6d7653a628e4a3a2035db3305054d2a76905e73cd3fa0ccc2e2` and source digest `b11323e481074e18683bd838f48df0f664ca83365874716af9e39aeba898318d`; fresh validation passed 19 assertions and rejected thirteen mutation classes.

The accepted recovery system owns a separate IndexedDB database, captures only committed meaningful edits after bounded debounce, verifies content-addressed candidate bytes before publication, retains the previous valid generation on failure, rejects foreign/newer writers and never changes official heads/versions or project/export listings. Save and Save As clear only an exact covered draft. Corrected one-click Save and Exit performs exactly one official Save, coordinates/publishes the exact pending recovery generation when necessary, clears it and returns Home automatically; actual failure or a newer edit remains editable.

Bound proof passed 27 Phase 2 Chrome assertions across eight scenarios, 27 oracle assertions, 18 Phase 2 contract assertions, 17 inherited Phase 1 contract assertions and 29 inherited Phase 1 Chrome assertions, plus TypeScript, focused lint, production build, diff/scope/index and protected workspace regressions. Deterministic proof recorded zero external/provider/AI/paid calls or credit changes. The ignored `.env.local` review correction is excluded from Git; exactly one separately authorized live Terra POST returned naturally with zero console errors and no tracked Terra/Thinking change.

Control-plane propagation changed none of the accepted eleven Phase 2 technical bytes. D-0107/GIT-082 `7e7063eaab3c486278355559c490611e3ca590ea` close exact 24-path publication/integration, synchronization, twelve-file proof preservation at relative checksum-inventory SHA-256 `b5717d6e803df1b2d96741128fd5428b6e6bbd95debc8494841afb375ef84ee7`, review-server shutdown and D-0054 cleanup.

Arthur accepted Phase 3's exact twelve-path result from unchanged base/HEAD `337433b37716fdd71ecc2a9d0239e239519ef655`, empty index. The rebound 9,898-byte PASS/VALID manifest `output/spec-0010/phase-3/proof-manifest.json` has SHA-256 `5dc275dc6d30da693ab14e861d7f12728038da0f6b3b1f30a66252880fdd23f5` and source digest `48ec146163f03d21015771597b1d31fd043f6aac35cf2c4f9c5abca37a548d60`; fresh validation passed 21 assertions and rejected fourteen mutation classes.

Startup now checks the separate recovery owner before Home/New/Open, shows **Unsaved work found** with project/time, revalidates at click time and atomically claims the exact generation. Only one tab can recover. A matching official source preserves its binding; missing, changed, newer, corrupt or unreadable official sources open as a new revision-zero **Recovered copy** so later Save cannot overwrite the source. Invalid recovery disables Recover but retains confirmed Discard, and verified deletion failure truthfully permits Home continuation without claiming removal. Recover performs zero official writes; exact Save, Save As, Save and Exit or confirmed Discard remains the cleanup door.

Bound proof passed 45 source-oracle assertions, 27 contract assertions and 55 real-Chromium assertions across nine scenarios, plus inherited Phase 1 browser and Phase 1/2 contract/oracle regressions, focused lint/build, exact scope, keyboard/compact/reduced-motion, startup/fault/concurrency and zero external/provider/AI/paid requests. Arthur then performed a real computer restart. The review-only ignored `.env.local` was restored byte-identically and one Low live `gpt-5.6-terra` greeting returned naturally using 388 tokens and estimated `$0.001196`; tracked Terra/Thinking source remained unchanged. D-0108 records acceptance. D-0109/GIT-083 `da348337d9329044937b2d27cb76498b743e778f` close the exact 25-path publication/integration, synchronization, thirteen-file/794,137-byte proof preservation at relative checksum-inventory SHA-256 `b1c42860225724bf29a4cc02aea45ad6315f73da66052d652a8c5b2a1ccd8ab5`, server shutdown and D-0054 cleanup.

## 13. Final planning handoff

SPEC-0010 and all three phases are fully closed through D-0109/GIT-083. No later implementation phase exists. Arthur may select the next feature/spec; SPEC-0008 Phases 2–6 remain paused under D-0093 and must not resume automatically.
