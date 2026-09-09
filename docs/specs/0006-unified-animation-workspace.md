# SPEC-0006 — Unified Animation Workspace

Status: SPEC-0006 is **Approved and active** under D-0057. Arthur reviewed and approved the exact seven-phase design and explicitly authorized **Phase 1 only: Authorized; Not started** in a brand-new dedicated review worktree. **Phases 2–7 remain Unauthorized; Not started.** Approval is not an implementation or verification claim; current runtime remains split.
Owner: Arthur
Spec role: Spec Architect
Created: 2026-09-09
Last updated: 2026-09-09
Decision links: [D-0055, D-0056, and D-0057](../DECISIONS.md)
TODO IDs: `PLAN-006`, `SPEC-006`, `UNIFY-001`, `GIT-050`
Baseline branch/commit: canonical `main` at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`, with the reviewed-but-unpublished D-0055 records transition already present as thirteen unstaged Markdown paths
Last verified branch/commit: live code and ordinary loopback app re-traced on 2026-09-09 from that basis; proposed architecture only

> **Lifecycle boundary.** Arthur has approved the seven-phase design and authorized Phase 1 only under D-0057. Execution waits for separate publication of the reviewed activation records and clean canonical-main synchronization; the exact resulting SHA is the Phase 1 implementation base and cannot be named before publication. The fresh Phase 1 Spec Executor starts in Plan mode in one brand-new dedicated review worktree, freezes the exact phase paths, implements/tests only that phase, returns technical proof plus an Implementation Review Packet, and stops. Arthur's review, exclusive CPA propagation, and separate publication are required before any later phase. Phases 2–7 remain Unauthorized; Not started. This turn records approval only and does not create an executor or change product/fixture/proof/dependency/configuration/provider/deployment bytes.
>
> **Current dirty-tree boundary.** The inherited D-0055 transition and SPEC-0006/D-0056 proposal predate this approval and remain preserved. D-0057 records Arthur's subsequent acceptance and Phase 1-only authorization. GIT-050 still requires a separate exact publication instruction for the combined reviewed record set; nothing is staged or published here.
>
> **Exactly seven phases.** This spec has exactly the seven implementation phases in §12. A correction to one phase does not create an eighth phase. Material outcome changes return to Arthur; bounded mechanics may be settled inside the authorized phase only when they preserve the contract, scope, safety, and proof below.
>
> **Sole ownership.** SPEC-0006 alone owns the complete workspace unification through its seven phases. Do not create a spec-helping-spec chain or move its contract, migration, tester, shell, or integration responsibility into another prerequisite spec. Bounded corrections belong in SPEC-0006 under the existing amendment/review rules; material changes return to Arthur without silently expanding a phase.

### Current phase authorization — D-0057

| Phase | Authorization | Implementation |
| --- | --- | --- |
| 1 — Contract and read-only legacy migration | Authorized | Not started; awaits activation publication and existing entry gates |
| 2 — Shell/New/Open | Unauthorized | Not started |
| 3 — Stage/compositing | Unauthorized | Not started |
| 4 — Timeline/playback/onion | Unauthorized | Not started |
| 5 — Existing manual tools/layout | Unauthorized | Not started |
| 6 — History/persistence/recovery | Unauthorized | Not started |
| 7 — Retirement/full acceptance | Unauthorized | Not started |

## 1. Plain-language outcome

Diamond Animator becomes one Animation Workspace. A user creates one neutral **Untitled Project**, opens one project collection, draws a background, adds and edits Stick figures on other layers, controls all of it on one timeline, plays it with one clock, uses onion skin, undoes and redoes actions in order, and saves or reopens the whole animation as one project.

The visible direction is the current Stick workspace layout:

- one top bar with File, Undo, Redo, project title, and save state;
- one timeline across the top of the stage;
- one stage/canvas in the center;
- right-panel tabs in this exact order: **Stick Figure Tools**, **Properties**, **Library**, **Assets**;
- the existing functional Drawing tools along the bottom: Select, Lasso, Brush, Eraser, Fill, Text, Shape, and Knife;
- AI Animator at the bottom right.

Drawing pixels/text/tweens remain Drawing data. Stick rigs/figures/joints/limbs/poses remain Stick data. The unification is a typed shared project and editor, not a conversion of Stick figures into bitmaps or Drawing frames into rigs.

## 2. Current problem and verified evidence

### 2.1 Ordinary user flow — live verified 2026-09-09

At the ordinary root app on loopback port `3000`:

1. Home → New Project opens a choice between **Drawing Animation** and **Stick Figure Animation**.
2. Choosing Drawing mounts a workspace titled **Unnamed drawing project** with Drawing's independent timeline, state, history, Save/Save As, and IndexedDB persistence.
3. Choosing Stick mounts a workspace titled **Unnamed stick figure project** with Stick's independent timeline, digest/history root, Save-only UI, and localStorage persistence.
4. Home → Open Project shows separate **Drawing** and **Stick Figure** tabs rather than one collection.
5. The Drawing right panel has Properties, Assets, Library; the Stick panel has Stick Figure Tools, Properties, Library, Assets. Both display AI Animator below the panel content, but they use different adapters and state owners.
6. Neither workspace can place a Drawing layer and an editable Stick layer in the same saved project.

Screens were observed at the ordinary desktop viewport; no review-only source or special route was used.

### 2.2 Code/data path — code verified 2026-09-09

- `app/page.tsx` owns separate `drawingWorkspace` and `stickFigureWorkspace` views, separate active-project variables, two New Project cards, and two Open callbacks.
- `src/components/OpenProjectBrowser.tsx` separately lists Drawing IndexedDB/V1-compatibility entries and Stick localStorage entries, then opens them through different functions.
- `src/components/workspace/DrawingWorkspace.tsx` owns Drawing layers, frames, bitmap/text/tween/sound state, playback, two-scope history, persistence, and Drawing AI application. Its initial title is `Unnamed drawing project`.
- `src/components/workspace/DrawingCanvas.tsx` owns a six-canvas authoring surface, Drawing tool sessions, selection, text, imported assets, library symbols, camera state, and panel behavior. Its authoring allocation is based on host size × `4.6` × device-pixel ratio rather than a document-fixed backing size.
- `src/lib/drawingProjectStorage.ts` adapts live `DrawingProjectData.version = 1` to a strict Drawing V2 repository. Drawing V2 stores project heads/version records and PNG/audio assets transactionally in IndexedDB; its accepted limits include 128 MiB per stored project, 512 MiB per collection, 512 MiB referenced hydrated RGBA, 256 MiB per raster, and 64 projects. It also recognizes older localStorage Drawing records without rewriting them on open.
- Drawing cells preserve bitmap, tween-end bitmap, position-only motion-tween data, sound attachment, and text objects. Drawing's reusable imported-asset/library collections remain session-only even though raster/audio bytes already committed into frames persist.
- `src/components/workspace/stickfigure/StickFigureWorkspace.tsx` owns a different digest-gated editor root, publication generation, undo/redo arrays, one-time AI latch, editable Stick timeline, selection, manual joint/limb actions, playback/onion state, and Creator round trip. Its initial title is `Unnamed stick figure project`.
- `src/lib/stickProjectStorage.ts` stores a strict V1/V2 saved-record envelope in localStorage under its own key, with 32-record/4 MiB collection limits, no Save As path in the mounted workspace, and V1 compatibility that does not rewrite on open.
- `src/lib/stickfigure/stickTimeline.ts` resolves Stick keyframe/blank-keyframe/hold ownership and preserves `StickFigureFrameContent` containing figures plus a joint/limb structure graph. The accepted strict Stick contract uses a 1920×1080 top-left/down coordinate space and complete editable poses.
- `StickFigureCanvas.tsx` composites Stick layers only; `DrawingWorkspace.tsx` composites Drawing layers only. Each timeline and onion resolver knows only its own payload type.
- Current Drawing and Stick AI paths have different adapters. This spec does not broaden either path.

### 2.3 Missing foundation / root cause

The split is architectural, not only navigational. There is no canonical project union, no common layer/cell ownership contract, no shared compositor, no one history transaction root, no one save repository, and no lossless migration boundary spanning both current formats. The two large coordinators can each consider themselves authoritative because `app/page.tsx` chooses between them before a project is created or opened.

Simply removing the two cards would hide this conflict. Simply serializing both legacy objects into one JSON blob would preserve neither referential integrity nor a single action order. Simply rasterizing Stick output would destroy editability. SPEC-0006 must replace the ownership seams in an ordered way while keeping both accepted systems usable after every phase.

## 3. Canonical unified contract

### 3.1 Identity, naming, stage, and limits

The permanent document is `diamond-animation-document/v1`; its storage record is `diamond-animation-project/v1`. New IDs are lowercase UUID v4. A migrated project gets a new canonical ID; its source identity stays in provenance and is never reused as writable canonical identity.

New Project creates one in-memory document titled exactly **Untitled Project** with one blank Drawing layer named `Layer 1`, frame 1 selected, 12 FPS, onion off, and a `1920×1080` logical stage whose origin is top-left, x increases right, and y increases down. The logical stage is independent of viewport size and device-pixel ratio. The presentation may scale/letterbox it; authored numbers do not change on resize.

The initial bounded contract accepts 1–64 layers, 1–10,000 timeline cells per layer, 1–55 FPS, current Drawing V2 raster/audio/dimension/collection limits, and a maximum 128 MiB canonical stored project. A valid legacy project within its source contract must not become unreadable merely because the other source had a smaller bound. Any future reduction requires a new migration decision and cannot occur inside this spec.

### 3.2 Typed authored data; no flattening

One document contains ordered typed layers. Each layer has stable `layerId`, `name`, `orderIndex`, visibility/lock fields, and exactly one `contentKind`:

- `drawing/v1`: Drawing keyframe/blank/hold/tween cells whose owner payload preserves PNG asset references, tween-end asset, position-only motion-tween stage/origins/sprite reference, sound attachment, and every text-object field;
- `stick-rig/v1`: Stick keyframe/blank/hold cells whose owner payload preserves figure identity/transforms and structure-graph joint/limb identity and coordinates, plus the accepted rig/pose data needed by the existing AI/manual adapters.

Every timeline position has a stable `cellId` and `cellType`. A keyframe or blank keyframe owns one immutable authored payload identity. A hold names exactly one earlier owner cell on the same layer. A Drawing tween names its Drawing start/end ownership and retains the current persistent position-tween payload; it is not baked during migration. A Stick cell never stores a Drawing payload, and a Drawing cell never stores a Stick payload.

Project assets are content-addressed. Existing Drawing raster and audio encoded bytes keep exact SHA-256 and byte length. Asset references are resolved before a candidate can mount. Stick data remains structured JSON and does not acquire a raster asset merely to render.

### 3.3 Document, reopen state, and auxiliary state

The authored document contains only user-owned animation data. One versioned `reopenState` stores active layer/cell, selection when serializable, camera, active tool/tab, and onion preference. View-only transitions do not enter Undo/Redo unless they change authored data.

Existing accepted auxiliary AI state remains typed and project-bound:

- Drawing AI memory stays in its existing semantic format and may be carried into the canonical record's auxiliary namespace only after project-ID rebinding checks pass;
- the Stick one-time creation latch stays project-bound and retains V1/V2 compatibility semantics;
- chat transcript/session-only UI stays session-only exactly as today.

SPEC-0006 adds no AI task, planner, provider, model choice, prompt, reference, motion-video path, token budget, paid request, search, or claim of improved AI output.

### 3.4 One editor root and action order

At completion, `AnimationWorkspace` owns one `UnifiedWorkspaceRoot` containing:

- one current `{document, reopenState, documentDigest}`;
- one monotonically increasing workspace generation;
- one pending-publication slot bound to workspace instance, project ID, base storage revision, document digest, and generation;
- one undo stack and one redo stack of complete atomic document transactions;
- one dirty/saved baseline digest and one visible failure state.

Every Drawing gesture commit, text change, timeline edit, Stick joint/limb edit, Creator apply, existing accepted AI Apply, project rename, layer reorder, and cell mutation enters through the same command dispatcher. A transient pointer preview, scrub, playback tick, camera move, tab change, or AI Preview does not mutate history. A failed, cancelled, stale, or mismatched operation changes neither document nor history. One successful user action creates exactly one undo entry; Undo and Redo restore exact document digests in global action order regardless of content kind.

Old Drawing and Stick coordinators may be used as temporary rendering/tool adapters during authorized phases, but after their responsibility moves they must receive canonical snapshots and emit typed commands. They may not maintain a second writable project/history/save truth. Phase 7 removes them from all normal ownership paths.

## 4. Lossless legacy migration and collection rules

### 4.1 Supported sources

The single collection enumerates, validates, and labels:

1. strict Drawing V2 IndexedDB heads/version records/assets;
2. supported legacy Drawing V1 localStorage records through the existing compatibility parser;
3. Stick saved record V1;
4. Stick saved record V2, including its project-bound AI latch;
5. canonical unified V1 projects.

Invalid, corrupt, incomplete, digest-mismatched, unsupported-version, over-limit, or unavailable records remain visible as unavailable entries with a plain recovery-safe error. They do not silently disappear, partially open, or trigger writes.

### 4.2 Open is read-only; Save performs non-destructive adoption

Opening a legacy entry performs strict source validation, creates an in-memory canonical candidate, independently validates/digests that candidate, and only then atomically replaces the mounted workspace root. Open writes nothing to the source or canonical repository.

The first successful Save of a legacy-opened project creates a new canonical project/version under a new canonical ID. It never overwrites, tombstones, renames, or deletes the Drawing/Stick source. Provenance records source kind, source project ID, source record/version digest, imported timestamp, and migration version. The collection then collapses a source and its exact imported canonical counterpart into one visible card while retaining a disclosure that the protected legacy source still exists. A source whose digest later changes appears separately until deliberately imported again.

Save updates only the active canonical identity at its captured storage revision. Save As always creates a new canonical ID and leaves the source and current canonical head unchanged until the copy's full write/readback/digest verification succeeds. Open and Save As never depend on a matching title.

### 4.3 Exact preservation obligations

For Drawing sources, proof must show exact source-to-canonical equality for every tool setting, FPS, layer order/name/identity mapping, cell kind/type/state ownership, blank flag, bitmap RGBA digest and encoded asset digest, tween-end bitmap, position-tween numeric field and sprite, sound metadata/audio digest, text string/position/width/flip/rotation/font/size/color/style, selection indices, counters, onion preference, timestamps/name where valid, and scoped AI memory. No bitmap may be recompressed as part of migration.

For Stick sources, proof must show exact source-to-canonical equality for FPS, layer/frame order, cell kind/type/state ownership, figure IDs/names/transforms, all structure-graph joint IDs/coordinates, all limb IDs/endpoints, project/reopen selection, title/revision metadata, and V2 AI latch. Rigs/poses stay editable structured data; no rasterization or regenerated IDs are allowed inside their payload.

Legacy Drawing pixels have no durable viewport/DPR coordinate contract. Migration therefore preserves each source raster's exact pixel space and the exact motion-tween stage dimensions as typed source-space metadata, then stores one deterministic source-to-1920×1080 display transform outside the payload. Rendering may transform for display; authored source bytes/numbers are never rescaled or rewritten. If source dimensions cannot be derived consistently, migration fails closed with the source untouched instead of guessing.

### 4.4 Failure and recovery

Encode/decode/hash/quota/transaction/readback/stale-revision/ID-collision/migration failures keep the last mounted document, last saved canonical head, legacy source, undo/redo stacks, and collection stable. The UI states what failed and leaves retry/Save As available when safe. A newly written version is not published until all assets and record bytes read back and revalidate. Orphan cleanup is maintenance after a successful head decision and cannot invalidate the last good head.

No phase deletes legacy stores. Phase 7 retires them only as normal writable paths; read compatibility remains until a later separately approved deprecation proves recovery and owner consent.

## 5. Unified render, timeline, and onion semantics

Layers composite bottom-to-top by `orderIndex`. At timeline index `i`, each visible layer resolves its typed owner at `i`; Drawing tween resolution remains position-only and Stick hold resolution remains pose-owner based. The renderer produces one ordered render list and draws Drawing raster/text, Stick limbs/joints/heads/figures, and any existing sound scheduling without mutating authored data.

Edit view, playback, onion, preview thumbnail, reopen, and proof capture use the same canonical resolver and coordinate transforms. Selection handles may be a separate overlay, but the authored visual list is shared. A paused view must not drop non-active layers or text. A resize changes only presentation transform. One playback clock advances the maximum authored layer length at document FPS and completes `0 → … → last → 0` before a loop is claimed.

Onion is hidden during playback. When paused, it resolves the nearest distinct previous and next owner on the active layer only, honors blank/empty boundaries, tints previous purple and next green using the accepted Stick convention, and renders the active layer's own typed content without changing other layers. Drawing tween endpoints and Stick held owners remain distinguishable in proof; onion must not treat a held repeat as a new distinct pose.

## 6. Visible workspace and tool ownership

The permanent layout uses one `AnimationWorkspace`, one top bar, one timeline, one stage, one right panel, one bottom toolbar, and one AI Animator shell.

- Right tabs are exactly **Stick Figure Tools**, **Properties**, **Library**, **Assets** in that order.
- The right-panel primary content keeps the current approximately 45% upper region with AI Animator below it on desktop. On compact viewports it becomes an accessible overlay/drawer; tab order and AI placement remain logically the same.
- The bottom toolbar uses the existing working Drawing tools, including Shape. It does not carry the inert Stick toolbar placeholders as if they were implemented.
- Select is contextual: it can select the topmost eligible Drawing object/raster or Stick figure/joint/limb and Properties reflects the selected typed target.
- Stick Figure Tools owns the existing Creator entry and existing manual Stick structure actions. Creator returns to the same root/project/history; applying a Creator result is one typed transaction.
- Library and Assets keep only capabilities that exist at the start of the authorized phase. Presentation-only placeholders remain clearly non-interactive. SPEC-0006 does not promote session-only Drawing library/assets into persisted project features.
- AI Animator remains bottom right. Existing accepted Drawing and Stick behavior may be reached only through its current typed adapter for the eligible active layer. Mixed/unsupported targets fail locally and visibly before any request. No new capability is added.

## 7. Canonical user flows

### 7.1 New mixed project

1. User chooses New Project from Home.
2. The app immediately opens one Animation Workspace; no Drawing/Stick question appears.
3. The title is **Untitled Project** and one blank Drawing layer is selected.
4. The user draws a background with existing Drawing tools.
5. The user adds a Stick layer through Stick Figure Tools/Creator and edits its existing joints/limbs/poses.
6. The user adds/extends cells on either typed layer, scrubs, enables onion, and plays the common timeline.
7. Drawing and Stick content composite together on the same stage.
8. Undo/Redo traverses the exact mixed action order.
9. Save creates one canonical project. Reload → Open Project shows one card; open restores the mixed project exactly.

### 7.2 Open and adopt a legacy Drawing project

1. User chooses Open Project and sees one collection, without a type tab.
2. User opens a valid Drawing V2 or supported V1 entry.
3. The app validates and mounts an in-memory canonical candidate without writing.
4. Drawing pixels, text, sound, and persistent position tweens display and remain editable; Stick Figure Tools is also available for adding future typed Stick layers.
5. First Save creates a new canonical project and preserves the source record unchanged.
6. Reload/open resolves to the verified canonical counterpart; source provenance remains inspectable and deduplicated in the collection.

### 7.3 Open and adopt a legacy Stick project

The same sequence applies, but all rig/figure/joint/limb/pose/frame/latch data remains structured and editable. Drawing tools can add a separate Drawing layer. First Save creates a new canonical record and preserves the Stick localStorage source unchanged.

### 7.4 Failure flow

1. User opens or saves a corrupt, unsupported, stale, over-limit, quota-failing, or injected-failure candidate.
2. The candidate never replaces the last good root/head and no source bytes change.
3. The app shows a stable plain-language failure with a machine-readable proof code.
4. User can dismiss, retry when safe, choose another project, or use Save As without losing current unsaved work.

## 8. Data, AI, cost, security, and privacy impact

- **Schema/migration:** material. Adds a unified V1 document/record, provenance, typed content union, shared history root, repository, and deterministic migration adapters.
- **Persistence/backward compatibility:** material. Reads all supported existing formats. Does not delete or rewrite legacy stores. Canonical writes are transactional IndexedDB writes with content-addressed assets and revision/readback checks.
- **Data loss:** highest risk in this spec. Every phase touching data must use frozen valid/corrupt/boundary fixtures, exact digest checks, injected failure/stale races, and non-destructive source snapshots.
- **AI:** no new capability, model, prompt, reference, routing, motion plan, tracking, or provider. Existing behavior is a protected adapter boundary only.
- **Cost/network:** all SPEC-0006 proof is loopback/offline. `/api/ai`, Supabase, provider, search, telemetry, and non-loopback traffic are blocked or deterministically fulfilled. Zero live request, token use, search, retry spend, or paid call is permitted.
- **Authentication/ownership:** unchanged. Projects remain browser-local; no account, cloud sync, sharing, rate-limit, or authorization design is added.
- **Privacy:** no new external transmission. Canonical project bytes remain in local browser storage. Logs/proof must not contain raster/audio bytes, prompts, secrets, or full project documents; record only fixture IDs, counts, sizes, digests, timing, and bounded error codes.
- **Deletion:** none. No legacy store cleanup or automatic destructive migration.
- **Dependencies/config/deployment:** no new package, service, environment key, schema deployment, hosted database, or production deployment. A dependency change requires Arthur/PM amendment before phase execution.

## 9. Representative mixed-project performance and memory contract

`MIXED-REALISTIC-01` is the shared deterministic fixture used from Phase 3 onward:

- 1920×1080 stage, 12 FPS, 48 timeline positions;
- bottom Drawing background layer with two distinct `4563×3302` RGBA sources (60,268,104 bytes each), one hold span, text, and one preserved position-tween payload;
- one editable Stick layer with one complete figure/rig, at least four independent key poses and held cells across the 48 positions;
- one upper Drawing/text layer;
- one small deterministic WAV attachment already inside the accepted Drawing bounds;
- total source and canonical digests frozen independently; no fixture generator may import the migration/renderer under test to compute its oracle.

Required production-build measurements use foreground Chromium, five runs after one warm-up, with machine/browser/version recorded:

| Measure | Desktop `1440×900`, DPR 1 | Compact `390×844`, DPR 2 browser profile |
| --- | ---: | ---: |
| Seeded Open click → interactive stage/timeline | median ≤ 5,000 ms; worst ≤ 7,500 ms | median ≤ 8,000 ms; worst ≤ 12,000 ms |
| 120 alternating timeline selections | p95 visible settle ≤ 100 ms | p95 visible settle ≤ 150 ms |
| Save after one mixed edit | median ≤ 6,000 ms; worst ≤ 10,000 ms | median ≤ 10,000 ms; worst ≤ 15,000 ms |
| Foreground 12-FPS playback | complete `0…47→0`; ≥95% ticks within 0.5×–1.75× of 83.33 ms; zero skipped authored indices | same |
| Long tasks during the 120-selection sample | none > 500 ms; ≤5 > 100 ms | none > 750 ms; ≤8 > 100 ms |

The implementation must expose a proof-only accounting seam, not a production debug UI. Asset bytes are not copied into history snapshots or canonical JSON. No eager full-project decode is allowed. App-owned simultaneous decoded raster/backing-store bytes are bounded to `4 × largest source RGBA asset + 6 × (1920 × 1080 × 4)` = **290,838,816 bytes** for this fixture, with settled idle bounded to `2 × largest source RGBA asset + 4 × stage RGBA` = **153,713,808 bytes**. CDP `JSHeapUsedSize` after explicit proof GC must be ≤320 MiB and peak observed JS heap ≤512 MiB in both profiles. Native/GPU allocation is reported separately when available and is not falsely equated with JS heap.

Compact proof is responsive-browser evidence, not a claim of physical low-end-phone performance. Phase 7 must state that limitation. No horizontal page overflow, unreachable control, stage smaller than 260×146 CSS px, or panel obscuring the only way to close it is allowed at `390×844`.

## 10. Protected regressions

| ID | Protected result | Required proof throughout applicable phases |
| --- | --- | --- |
| REG-01 | Home, welcome, menu, Tutorials, Back/focus, and removed AI Credits card | Existing permanent tester plus focused ordinary-root smoke |
| REG-02 | Drawing brush/eraser/fill/text/shape/knife/select/lasso, camera, selection, clear, and visual output | Existing actions on a Drawing layer; exact pixel/text fixture where deterministic |
| REG-03 | Drawing cell ownership, layers, persistent position tween, playback, onion, sound attachment, and text | Contract tests plus complete timeline traversal and Save/Open digests |
| REG-04 | Accepted Drawing V1 compatibility and V2 transactional storage limits/failure safety | Existing SPEC-0002 validators and new migration cross-checks |
| REG-05 | Stick independent keyframes/holds, manual joint/limb edit, line head, selection, playback/onion, Creator → Back | Existing Stick validators and ordinary UI flow |
| REG-06 | Stick one-time AI transaction/latch and accepted SPEC-0004 Phase 1/2/2.5 compatibility | Existing focused validators; no new visible-motion quality claim |
| REG-07 | Accepted SPEC-0005 Phase 1/2 v1/v2 proof/runtime bytes | Source-diff protection and existing validators; no normal route begins using the safety seam |
| REG-08 | Existing Drawing AI feature gates, memory isolation, disabled-task exits, and server-only credential boundary | Existing deterministic route/memory validators; all real external calls blocked |
| REG-09 | Save/Open failure atomicity, stale completion rejection, ID/digest binding, and dirty-state truth | Inject each named failure/race and compare document/history/head/source digests |
| REG-10 | No review-only UI, proof port, query flag, or fixture picker in product | source scan and ordinary-root screenshots |
| REG-11 | One active review copy under D-0054 | exact process/cwd/port identity, one loopback root, cleanup/ownership record |
| REG-12 | No legacy deletion or rewrite | before/after raw store byte snapshots and IndexedDB record/asset digests |

Systems intentionally outside SPEC-0006: new AI quality, provider/model/video/tracking design, SPEC-0007 manual capability expansion, export redesign, cloud sync/auth/billing, custom model R&D, and deployment. They receive source-diff/no-network protection, not invented acceptance claims.

## 11. Phase-wide execution rules

- Each phase is one executor-sized vertical result and may touch no more than its stated tracked technical path ceiling. The ceiling counts added/modified/deleted runtime, fixture, test, and proof-source paths; ignored proof artifacts and later CPA control-plane paths do not count. Exceeding the ceiling requires a reviewed spec amendment before editing the extra path.
- The executor records the exact base SHA, branch/worktree, index state, pre-existing bytes, exact final dirty allowlist, path hashes/sizes, commands, artifacts, review URL/port, network ledger, and proof-manifest SHA-256.
- Every phase runs TypeScript, focused lint, changed-line/full-lint non-regression, phase contracts, inherited relevant validators, `git diff --check`, empty-index checks, source scans, and one ordinary app-copy human review at one loopback non-`3000` root.
- Review fixtures are seeded through proof storage or test-only source-copy injection. No review-only UI, route, query parameter, global, or fixture selector enters product source.
- Exactly one review app copy may exist. The executor stops after its packet but preserves that copy for Arthur. D-0054 governs acceptance/rejection cleanup and never permits concurrent executor/architect ownership.
- No executor edits `AGENTS.md`, canonical `docs/`, or `project/project_structure.txt`; stages, commits, merges, rebases, pushes, publishes, deploys, or touches another worktree.

## 12. The seven implementation phases

### Phase 1 — Unified contract and lossless legacy migration

**Plain outcome.** The repository has one strict unified project contract and deterministic, read-only adapters for every supported Drawing/Stick source. Nothing is wired into the ordinary UI yet.

**Problem solved.** Later UI work cannot be safe while field preservation, coordinate mapping, ownership, IDs, provenance, limits, and failure codes are implicit.

**Traced execution path.** Frozen legacy fixture/raw store → existing source parser (`drawingProjectStorage`/Drawing V1 compatibility or `stickProjectStorage`) → source-specific mapper → `parseUnifiedAnimationProjectV1` → canonical digest/invariant validator → in-memory candidate or typed rejection. No repository write and no React mount.

**Exact scope and likely path ceiling.** Add unified contract/canonicalization/migration modules under `src/lib/animation/`; add independent fixtures/oracles/validators/recorder under `scripts/spec0006-unified/` and `scripts/fixtures/spec0006-unified/v1/`. Existing source parsers may receive only a narrow exported read adapter if essential. **Ceiling: 18 tracked technical paths.** No component, `app/page.tsx`, existing store write path, package/config, or API route change.

**Non-goals.** No shell, stage, timeline, tool, history, canonical save repository, normal-route behavior, AI work, or legacy cleanup.

**Entry gate.** SPEC-0006 is approved; D-0055/SPEC-0006 records are published; exact canonical main is clean/synchronized; no executor/review copy exists; Phase 1 path list is frozen; migration oracle and `MIXED-REALISTIC-01` source ingredients are independently defined.

**Normal app-copy human review.** Open the ordinary app and confirm Home, current New Project split, Drawing, Stick, and Open tabs still look/work exactly as before. This is regression smoke, not a demonstration of the hidden contract.

**Measurable acceptance.** Every valid frozen Drawing V1/V2 and Stick V1/V2 source returns one deterministic valid canonical candidate; repeated runs produce identical canonical digests; all preservation obligations in §4.3 pass; exact raster/audio hashes match; open mapping performs zero writes; all limits/error codes are stable.

**Negative tests.** Unknown fields/versions, duplicate IDs, corrupt JSON, malformed typed arrays/blobs, missing/mismatched assets, invalid cell owner, tween on Stick, rig payload on Drawing, non-finite/-0 numbers, Unicode/title edge cases, over-limit counts/bytes, inconsistent legacy raster dimensions, source mutation attempt, digest/provenance tamper, generated-oracle self-import.

**Protected regressions.** REG-01, REG-04–REG-08, REG-10–REG-12; exact current runtime component and write-path bytes remain unchanged except an approved read-export seam.

**Technical proof.** Independent fixture oracle; at least 50 named valid/boundary cases and 100 named invalid/tamper cases; byte snapshots before/after; determinism over 1,000 repeated seeded mappings; inherited Drawing/Stick storage/contract/history validators; TypeScript/lint/diff/index/network checks; validated manifest.

**Stop boundary.** Return the Phase 1 Implementation Review Packet and stop. Do not wire UI, create a canonical repository, authorize Phase 2, propagate docs, or publish.

**Recommended effort.** GPT-6 Astra, Ultra reasoning; migration/data-loss architecture.

### Phase 2 — One shell and unified New/Open paths

**Plain outcome.** New Project opens one Animation Workspace titled Untitled Project without asking Drawing vs Stick. Open Project shows one collection and opens any supported project into that shell.

**Problem solved.** `app/page.tsx` and `OpenProjectBrowser` currently branch identity before a workspace mounts.

**Traced execution path.** Home New/Open → one page transition → unified collection/bootstrap controller → Phase 1 mapper/validator → pending mounted-open binding → one `AnimationWorkspace` instance → compatibility editor adapter for the candidate → visible shell. Failed/stale open keeps the previous root.

**Exact scope and likely path ceiling.** `app/page.tsx`, `OpenProjectBrowser.tsx`, new `AnimationWorkspace`/shell/bootstrap/collection modules, focused UI fixtures and proof. Existing workspaces may be wrapped for compatibility but retain their internal editors during this phase; only one is mounted for a candidate. **Ceiling: 16 tracked technical paths.** No unified compositor/timeline/tool merge/save repository.

**Non-goals.** No mixed rendering/authoring, no shared history, no canonical Save, no legacy deletion, no tool capability change, no URL/router redesign.

**Entry gate.** Phase 1 accepted, propagated, published, synchronized; candidate mapper API/hash frozen; exact collection dedupe/invalid-entry fixtures accepted; one review-copy slot free.

**Normal app-copy human review.** At desktop and compact viewports, Home → New goes directly to the one shell/title; reload → Home → Open shows one collection with canonical/legacy/invalid labels and no type toggle; valid Drawing and Stick entries open; Back/focus and ordinary Home remain usable.

**Measurable acceptance.** Zero Drawing/Stick choice controls; exact title Untitled Project; one collection ordering rule (`updatedAt` descending, stable ID tie-break); exactly one mounted `AnimationWorkspace` and never two legacy compatibility editors at once; open writes zero bytes; stale/failed open leaves the current bootstrap/candidate digest unchanged; no page overflow at required viewports.

**Negative tests.** Double-click/racing opens, open during bootstrap, invalid entry, missing asset, source changed after list, duplicate provenance, same title/different ID, empty collection, IndexedDB unavailable, localStorage read error, refresh, compact drawer escape/focus.

**Protected regressions.** REG-01, REG-04–REG-12. Both legacy editor experiences remain usable inside the new shell until their owners move in later phases.

**Technical proof.** Deterministic collection/bootstrap tests, source before/after storage snapshots, race matrix, desktop/compact screenshots and accessibility tree, zero-network ledger, permanent tester update only if the visible flow requires it, inherited validators, manifest.

**Stop boundary.** One shell/navigation result only. Do not implement mixed stage/timeline/tools/history/save, delete old components/routes, authorize Phase 3, propagate, or publish.

**Recommended effort.** GPT-6 Astra, Extra High reasoning.

### Phase 3 — Unified stage, renderer, and mixed compositing

**Plain outcome.** A seeded mixed project visibly renders Drawing background/text/tween content and editable Stick content together on one stable stage at desktop and compact sizes.

**Problem solved.** Current renderers composite only their own layer type and Drawing authoring allocation depends on viewport/DPR.

**Traced execution path.** Canonical root/current index → common cell-owner resolver → typed Drawing/Stick render adapters → ordered render list → one fixed 1920×1080 authored stage/backing contract → scaled/letterboxed presentation → shared thumbnail/proof snapshot. No render step mutates document/history.

**Exact scope and likely path ceiling.** New renderer/resolver/stage modules, narrow extraction/adaptation from `DrawingCanvas.tsx` and `StickFigureCanvas.tsx`, `AnimationWorkspace` stage host, mixed fixture/oracle/browser proof. **Ceiling: 16 tracked technical paths.** No timeline mutation UI, tool integration, history/persistence, or renderer rewrite unrelated to compositing.

**Non-goals.** No new Drawing or Stick visual feature, no export redesign, no GPU/WebGL dependency, no asset-library persistence, no AI-generated output.

**Entry gate.** Phase 2 published; mixed fixture digests and independent reference render/pixel masks approved; coordinate transform and layer order from §§3–5 frozen; phase path extraction plan proves current render parity.

**Normal app-copy human review.** Open seeded `MIXED-REALISTIC-01`; verify background Drawing, Stick figure, upper Drawing/text, and current Drawing tween positions together at `1440×900` and `390×844`; resize without authored drift; compare type-isolated fixtures with current ordinary output.

**Measurable acceptance.** Exact layer order and stable pixel/geometry masks; text present in paused and playback render; exact Stick joint/limb coordinates after inverse transform; zero authored digest change on resize/play/render; stage ≥260×146 compact; performance/memory bounds in §9 pass for open/render portions.

**Negative tests.** Missing asset, decode failure, hidden/locked layer, blank/empty/hold/tween boundaries, extreme aspect ratio, DPR change, zero-size mount, rapid resize, one adapter throw, invalid render command, active layer above/below opposite type, text-only frame.

**Protected regressions.** REG-02–REG-10 and REG-12; accepted Drawing/Stick type-isolated snapshots remain within their frozen masks.

**Technical proof.** Independent render-list oracle; pixel/geometry comparisons; source-to-stage round trips; responsive browser screenshots; resize/DPR/memory accounting; no renderer writes; inherited drawing/stick visual tests; validated manifest.

**Stop boundary.** Mixed render only. Do not add common timeline mutations, merge tools/history/save, retire old paths, authorize Phase 4, propagate, or publish.

**Recommended effort.** GPT-6 Astra, Extra High reasoning.

### Phase 4 — Unified timeline, layers, frame ownership, playback, and onion

**Plain outcome.** The one timeline displays and controls Drawing and Stick layers together; scrub, layer selection, playback, and onion use one clock and ownership model.

**Problem solved.** Two timeline components currently duplicate structural behavior while resolving incompatible payloads and clocks.

**Traced execution path.** Pointer/keyboard timeline action → unified timeline intent → canonical reducer validates typed layer/cell ownership → root publication → common resolver → shared stage render; playback clock advances canonical index without history; onion queries nearest distinct owners on active typed layer.

**Exact scope and likely path ceiling.** New unified timeline reducer/view/row and ownership/playback/onion modules; narrow reuse/removal from `DrawingTimelineRow`, `StickFigureTimelineRow`, and timing helpers; `AnimationWorkspace` wiring; fixtures/proof. **Ceiling: 18 tracked technical paths.** No authoring tool integration, canonical save, broad history, or legacy path deletion.

**Non-goals.** No new tween kind, Stick interpolation, audio editor, multi-cell selection redesign, timeline virtualization beyond what §9 requires, or AI change.

**Entry gate.** Phase 3 published; common ownership truth table and all Drawing-tween/Stick-hold boundary fixtures frozen; shared clock behavior approved; no unresolved semantic conversion.

**Normal app-copy human review.** In seeded mixed project, switch typed layers, add/remove/copy/paste/resize only through already-supported structural actions, scrub every key boundary, toggle onion, and watch a full `0…47→0` loop. Drawing and Stick stay composited throughout.

**Measurable acceptance.** One visible timeline; stable layer/cell IDs; all valid mutations deterministic; invalid cross-kind ownership rejected; complete frame traversal with zero skipped authored indices; onion exact previous/next owner/tint/blank behavior; §9 selection/playback targets pass.

**Negative tests.** Delete last layer, paste wrong payload kind, dangling/cyclic/forward hold, Drawing tween on Stick layer, resize into occupied span, action during playback, stale async publication, rapid play/pause/scrub, onion at ends/blank gaps/repeated holds, unequal layer lengths.

**Protected regressions.** REG-02–REG-10 and REG-12; Drawing position tween and Stick independent-frame guarantees retain exact payloads.

**Technical proof.** Reducer property tests and independent ownership oracle; 10,000 fixed-seed valid/invalid mutations plus mirror/order variations; full-loop browser receipts; onion geometry/pixel evidence; performance/memory receipts; inherited timeline/playback/onion validators; manifest.

**Stop boundary.** Timeline/layers/playback/onion only. Do not integrate all manual tools, unify Undo/Redo or Save, retire legacy normal paths, authorize Phase 5, propagate, or publish.

**Recommended effort.** GPT-6 Astra, Ultra reasoning; ownership and temporal regression risk.

### Phase 5 — Integrate existing manual tools, selection, panels, Creator, and layout

**Plain outcome.** Existing Drawing tools and existing manual Stick tools edit their typed layers in the same project and layout, without pretending that new manual capabilities exist.

**Problem solved.** Current tools/panels/selection/Creator are owned by separate canvases and the Stick bottom bar contains presentation-only placeholders.

**Traced execution path.** Active tool + pointer/keyboard/Creator action → target hit-test by typed layer → existing Drawing or Stick tool adapter → one canonical typed command → Phase 4 reducer/root publication → Phase 3 shared render → contextual Properties. Creator apply returns through the same command door.

**Exact scope and likely path ceiling.** `AnimationWorkspace`, unified bottom toolbar/right panel/selection controller, narrow DrawingCanvas tool-session extraction, StickCanvas/RightPanel/Creator adapters, current AI panel shell placement, UI fixtures/proof. **Ceiling: 18 tracked technical paths.** Existing tool behavior may be moved, not expanded.

**Non-goals.** No Stick colors, new heads/shapes, extra joints/rig templates, Drawing tool redesign, persisted library/assets, new AI task, provider, motion video, or speculative Adobe-class controls. Those manual Stick expansions belong to future SPEC-0007.

**Entry gate.** Phase 4 published; exact existing capability inventory and selection precedence approved; Creator apply/cancel transaction shape frozen; responsive panel/toolbar interaction design approved without changing the layout direction.

**Normal app-copy human review.** Draw/edit text/shapes on Drawing layer; add/select/move current Stick figure/joints and use current limb/Creator flow on Stick layer; switch layers/Properties tabs; verify right-tab order, real bottom Drawing toolbar including Shape, AI bottom right, and compact keyboard/focus access.

**Measurable acceptance.** Every currently functional Drawing tool retains its accepted action; every currently functional Stick selection/joint/limb/Creator action retains its accepted action; placeholder controls stay inert/labeled; wrong-kind actions are disabled or rejected before mutation; one action emits one canonical transaction; exact visible layout/order at desktop and compact.

**Negative tests.** Gesture crosses layer switch/playback/open, hidden/locked/wrong-kind target, selection behind another layer, pointer cancel/lost capture, Creator cancel/remount/resize, unsupported placeholder click, AI mixed target, keyboard escape/focus trap, compact panel obscures stage controls.

**Protected regressions.** REG-01–REG-10 and REG-12; especially Drawing transient sessions/history handoff, Stick projection after Creator resize, and existing AI early exits.

**Technical proof.** Action-by-action capability matrix; typed command receipts; pixel/geometry before/after; cancellation/stale race suite; Creator round trip at both viewports; accessibility checks for names/order/focus/keyboard; source scan for faux enabled controls and review UI; inherited validators; manifest.

**Stop boundary.** Existing manual integration only. Do not add SPEC-0007 capabilities, canonical persistence/history completion, legacy retirement, authorize Phase 6, propagate, or publish.

**Recommended effort.** GPT-6 Astra, Extra High reasoning.

### Phase 6 — Unified Undo/Redo, Save/Save As/Open, naming, persistence, failure recovery, and migration proof

**Plain outcome.** Mixed actions undo/redo in one order and the entire mixed project saves, copies, reloads, opens, and recovers through one canonical repository; legacy adoption is proven non-destructive.

**Problem solved.** Drawing has two-scope history plus V2 IndexedDB; Stick has a digest history plus a localStorage envelope; their names/save menus/failures differ.

**Traced execution path.** Typed action → one transaction candidate/digest → captured root binding → atomic history publication → dirty state; Save/Save As → canonical snapshot/assets/provenance → preflight/encode/hash → IndexedDB transaction → readback validation → revision-bound head swap → saved baseline. Open uses Phase 1 read-only mapping and atomically replaces the root only after validation.

**Exact scope and likely path ceiling.** Unified history/transaction/repository/storage codec, top-bar naming/File behavior, bootstrap/open final wiring, narrow removal of Drawing/Stick write authority, failure UI, migration/performance/browser proof. Existing Drawing V2 storage modules should be extended/reused rather than forked where contract-safe. **Ceiling: 20 tracked technical paths.** No source-store deletion, cloud sync, autosave, export, or new AI behavior.

**Non-goals.** No legacy cleanup, authenticated ownership, collaboration, project-file import/export, automatic background save, AI memory redesign, provider request, or deployment.

**Entry gate.** Phase 5 published; repository transaction/readback design reviewed; canonical limits/provenance/dedupe naming conflicts frozen; independent golden migrations include realistic and maximum-bound sources; storage fault injection available.

**Normal app-copy human review.** Perform interleaved Drawing → Stick → timeline → Creator actions; Undo to baseline and Redo to exact final digest; Save; edit and Save; Save As to another title; reload/open both; open legacy Drawing and Stick, verify source bytes, first-save adoption, reload/open; repeat safe failure cases and confirm unsaved work remains.

**Measurable acceptance.** Exact one-entry action order; Undo/Redo digest round trips; title is Untitled Project until changed; Save As produces distinct ID/digest-correct copy; one collection entry per exact source/canonical provenance pair; every §4 field/digest preserved; all named failures leave source/head/root/history unchanged; §9 open/save/memory targets pass.

**Negative tests.** Quota at every write step, PNG/audio encode/decode/hash failure, abort/readback mismatch, stale revision/generation/instance, concurrent Save/Save As/Open, ID collision, title collision/empty/Unicode, asset missing/orphan, history over bound, Undo during pending save, reload between asset and head transaction, mutated legacy source after listing, migration retry.

**Protected regressions.** REG-01–REG-12. Existing source stores remain byte-for-byte protected; Drawing V2 last-good-head behavior remains at least as strong.

**Technical proof.** Independent migration oracle and raw before/after store snapshots; transactional repository fault matrix at every boundary; history property/state-machine tests; realistic-size browser save/reload/open at both viewports; exact asset and document digests; performance/memory/network receipts; inherited SPEC-0002 and Stick history/storage validators; validated manifest.

**Stop boundary.** One canonical history/persistence result. Do not delete legacy stores/components, claim the whole spec complete, authorize Phase 7, propagate, publish, or begin SPEC-0007.

**Recommended effort.** GPT-6 Astra, Ultra reasoning; highest data-loss/race risk.

### Phase 7 — Retire separate normal paths and run full acceptance, regression, data-loss, performance, and accessibility proof

**Plain outcome.** Users can reach only the one Animation Workspace and one project collection in ordinary product flow; obsolete split ownership paths are unreachable/removed, and the whole SPEC-0006 outcome is independently proven.

**Problem solved.** Transitional adapters and duplicate routes/components can otherwise become competing sources of truth or regress later.

**Traced execution path.** Every ordinary Home New/Open route → one collection/bootstrap → one root/dispatcher/resolver/renderer/timeline/tools/history/repository → one workspace. Legacy parsers are read-only compatibility leaves. Source scan and runtime instrumentation prove no second writable coordinator/store path.

**Exact scope and likely path ceiling.** Remove/unwire obsolete Drawing/Stick normal workspace ownership branches, consolidate tests/permanent browser plan, add final accessibility/performance/data-loss proof/finalizer, and make only the smallest runtime cleanups required to eliminate duplicate authority. **Ceiling: 18 tracked technical paths, including deletions.** No legacy data deletion and no unrelated cleanup.

**Non-goals.** No SPEC-0007 or SPEC-0008 file/implementation, new manual capability, AI/provider/video/tracking, export/cloud/auth/billing, visual redesign, dependency, or deployment.

**Entry gate.** Phase 6 accepted/published/synchronized; all six prior proof manifests and accepted hashes preserved; complete normal-path ownership inventory reviewed; removal list proves no externally used import or recovery parser is being deleted; one review-copy slot free.

**Normal app-copy human review.** Arthur performs the full §7 New/mixed/legacy/failure flows on the ordinary root at desktop and compact sizes, watches one full mixed loop, checks all layout regions/tools/panels, and confirms source legacy projects remain available. Human acceptance is required; technical green alone cannot close the phase.

**Measurable acceptance.** Exactly one normal workspace/project collection/title path; zero normal-route imports or mounts of retired coordinators and zero writes through legacy stores in an instrumented complete flow; all §§3–9 acceptance gates pass; all REG-01–REG-12 pass; exact performance/memory table passes; automated accessibility scan has zero critical/serious violations and manual keyboard flow reaches/closes every interactive region with visible focus; zero data-loss mismatches; zero external/provider requests.

**Negative tests.** Direct stale component invocation, old view enum/string, legacy store write spy, alternate save function import, browser back/refresh, empty/corrupt/max collections, rapid mixed actions/open/save/play, all failure injections, reduced motion, zoom 200%, keyboard-only compact flow, review/debug token scans.

**Protected regressions.** Full REG-01–REG-12 plus every accepted phase manifest/hash. Historical SPEC-0004/0005 rejected motion stays rejected/non-reusable and their superseded phases stay inactive.

**Technical proof.** Final independent manifest binds every changed runtime/test/fixture/proof path and prior accepted phase manifest; permanent tester covers one workspace; full deterministic suites, TypeScript, focused/full lint non-regression, production build, complete browser matrix, storage byte snapshots, ownership instrumentation, source scans, performance/memory/accessibility receipts, process/port cleanup evidence, diff/scope/index/Git checks.

**Stop boundary.** Return the Phase 7 Implementation Review Packet and stop with the one unpublished review app preserved. Do not mark Verified, propagate, stage, commit, merge, push, publish, clean the accepted worktree, create SPEC-0007, or deploy. Arthur/PM acceptance, CPA propagation, and later publication remain separate.

**Recommended effort.** GPT-6 Astra, Ultra reasoning; final system/data/accessibility acceptance.

## 13. Exact completion gate before SPEC-0007

SPEC-0007 may not be created, approved, or executed until all of the following are true:

1. All seven SPEC-0006 phases were separately authorized and executed in order.
2. Arthur visibly accepted each phase result, including Phase 7's full ordinary-app mixed/legacy review.
3. Each executor stopped; each accepted result received exclusive CPA propagation and a separate publication instruction.
4. Canonical `main`, local `origin/main`, live remote `main`, and the final publication branch match the exact final SPEC-0006 commit at `0/0`; index/worktrees are clean as required.
5. D-0054 cleanup is complete: required proof is preserved, final accepted review server/port is stopped/closed after publication, obsolete executor worktree/local branch is removed, and no rejected bytes were reused.
6. The final canonical record marks SPEC-0006 Verified/published/integrated and records all seven proof-manifest hashes, exact final path set, migration/source preservation result, and limitations.
7. New, Drawing legacy, Stick legacy, and saved mixed projects all open in one collection/workspace; Save/Save As/Open/Undo/Redo/playback/onion/layout/tool flows pass.
8. Every valid frozen legacy field/asset digest matches its canonical mapping; every legacy source raw byte snapshot is unchanged; no unsupported record was partially migrated.
9. `MIXED-REALISTIC-01` passes the exact desktop/compact performance and memory gates; the compact result is honestly labeled browser-profile evidence.
10. Accessibility and REG-01–REG-12 pass with zero critical/serious violations, zero external/provider requests, zero review-only product surface, and no second writable coordinator/store path.
11. No unresolved material data-loss, ownership, history, migration, security/privacy, cost, or performance blocker remains.

Only then may Arthur and the PM design future SPEC-0007 for manual Stick capabilities such as colors and head/shape options. SPEC-0007 is not created or implemented here. SPEC-0008 remains a later independent motion-video → tracking → editable-frame design and is not created or implemented here.

## 14. Likely whole-spec touch map

| System | Intended change across the seven phases | Intentionally preserved |
| --- | --- | --- |
| `app/page.tsx`, `OpenProjectBrowser.tsx` | One New/Open/workspace path | Home/Tutorial/menu and inert unrelated cards |
| New `src/lib/animation/**` | Contract, migration, resolver, reducer, history, repository | Typed Drawing and Stick payload semantics |
| New/unified workspace components | One shell/stage/timeline/panels/toolbar | Accepted visual direction and existing real tools |
| Drawing workspace/canvas/timeline/storage | Extract adapters, retire duplicate authority, reuse V2 asset safety | Pixels/text/tween/sound, tool behavior, V1/V2 read compatibility |
| Stick workspace/canvas/timeline/storage/Creator | Extract adapters, retire duplicate authority | Rigs/poses/holds/manual editing/latch/Creator behavior |
| AI panels/adapters | Place one shell and route only existing eligible typed context | No new AI capability, model, prompt, provider, cost, or video |
| `scripts/spec0006-unified/**`, fixtures, permanent tester | Independent phase proof and final regression | Prior accepted proof artifacts/hashes |

This map is not an executor allowlist. Each authorized phase must freeze its exact paths within the phase ceiling before mutation.

## 15. Implementation and verification records

No SPEC-0006 implementation has begun. Phase 1 is Authorized; Not started; Phases 2–7 are Unauthorized; Not started. The Spec Executor records technical truth only in its manifest/packet, never here. After Arthur/PM acceptance and exclusive transfer, the CPA records accepted evidence and publication status. The proposal-time checks below remain historical evidence, not new app/test execution in this approval turn.

Historical proposal verification — before D-0057 approval:

| Gate | Result | Evidence |
| --- | --- | --- |
| Required control-plane boot | Passed | canonical docs/spec/live paths read from current worktree |
| Live code trace | Passed | separate page/open/workspace/history/storage/render/timeline paths enumerated in §2 |
| Ordinary app trace | Passed | Home → New → Drawing, Home → New → Stick, and Home → Open observed on loopback `3000` |
| Runtime/product mutation | None | proposal changes documentation/control plane only |
| External/provider/paid activity | None | ordinary loopback inspection only |
| Implementation authorization | None | status remains Proposed/Unauthorized |

## 16. Final state and handoff

Arthur has approved the exact desired outcome, typed contract, lossless migration, one-root ownership, visible layout, realistic mixed fixture, performance/memory targets, regression boundaries, and seven phases. SPEC-0006 is **Approved and active** under D-0057. Arthur reviewed and approved the exact seven-phase design and explicitly authorized **Phase 1 only: Authorized; Not started** in a brand-new dedicated review worktree. **Phases 2–7 remain Unauthorized; Not started.** Approval is not an implementation or verification claim; current runtime remains split. SPEC-0006 alone owns the complete workspace unification through its seven phases. Do not create a spec-helping-spec chain or move its contract, migration, tester, shell, or integration responsibility into another prerequisite spec. Bounded corrections belong in SPEC-0006 under the existing amendment/review rules; material changes return to Arthur without silently expanding a phase.

Next step: complete this CPA review packet, then obtain the separate publication-only instruction for the exact reviewed combined D-0055/SPEC-0006/D-0057 record set. After those records are published and canonical main is clean/synchronized, one brand-new dedicated SPEC-0006 Phase 1 Spec Executor/review worktree starts in Plan mode from that exact publication SHA under Arthur's existing Phase 1 authorization. Freeze its exact paths within the 18-path ceiling and satisfy the existing Phase 1 entry/one-copy gates. Do not start from this dirty pre-publication checkout or reuse a rejected copy. No executor, review app, or publication is created by this CPA turn.
