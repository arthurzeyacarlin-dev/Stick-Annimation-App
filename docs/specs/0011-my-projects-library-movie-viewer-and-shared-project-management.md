# SPEC-0011 — My Projects Library, Movie Viewer, and Shared Project Management

Status: **Approved/active; Phase 1 Verified/published/integrated/synchronized/proof-preserved/cleaned up; Phase 2 Authorized/Not started; Phase 3 Unauthorized/Not started**
Owner: Arthur
Task role: three separately gated implementation phases after later explicit phase authorization
Created: 2026-09-21
Last updated: 2026-09-21
Decision links: [D-0110](../DECISIONS.md), [D-0111](../DECISIONS.md), [D-0112](../DECISIONS.md), [D-0113](../DECISIONS.md), [D-0114](../DECISIONS.md)
TODO IDs: `PLAN-011`, `SPEC-011`, `LIBRARY-001`, `GIT-084`, `GIT-085`, `VIEWER-001`, `PROJECTS-001`
Planning base: canonical `main` commit `788e69826438f56ee648452706ce1f68c07592bc`; detached planning worktree, clean index and worktree before planning edits
Evidence date: 2026-09-21

## 1. Plain-language outcome

Diamond Animator will gain a professional local project library without changing the editor, Save, recovery, or export owners.

- **My Projects** shows real locally saved projects with truthful identity, metadata, poster frames, duration, and failure states.
- Selecting a project in **My Projects** opens a centered playback-only **Movie Viewer**. It never opens the editor or mutates the project.
- **Open Project** remains the edit route and is restyled onto the same project-library shell.
- Rename, Duplicate, Delete, Search, and Sort use one shared command/data owner on both surfaces. They do not create a second repository or a second player.
- All work stays browser-local. No account, cloud, telemetry, AI, provider, upload, deployment, or paid behavior is added.

This is exactly three separately gated phases:

| Phase | User outcome | Current state |
| --- | --- | --- |
| 1 — Project Library / My Projects | The inert Home **My Project** action becomes **My Projects**, opens the professional shared library shell, and selects a real saved project into a centered playback-only modal backed by the accepted saved-project evaluator/player. **Open Project** continues to open the editor. | **Verified/published/integrated/synchronized/proof-preserved/cleaned up** |
| 2 — Movie Viewer | The modal plays the exact saved animation with one authoritative clock, synchronized audio, seek/fullscreen/keyboard/accessible controls, contain geometry, and truthful close behavior. | **Authorized; Not started after GIT-085 synchronization** |
| 3 — Shared Management and Polish | Both My Projects and Open Project gain the same Rename/Duplicate/Delete/Search/Sort owner, cross-surface refresh, overflow/context/keyboard routes, safety/concurrency handling, and final responsive/accessibility polish. | Unauthorized; Not started |

No phase authorizes the next. D-0112 records Arthur's acceptance and technical verification of Phase 1; D-0113/GIT-084 close its publication, preservation and cleanup lifecycle. D-0114/GIT-085 separately authorize exactly one fresh Phase 2 Spec Executor after activation synchronization. Phase 3 remains Unauthorized/Not started and requires separate explicit authorization after complete Phase 2 closeout.

## 2. Verified pre-Phase-1 behavior and execution path

### 2.1 Visible behavior

- Home **My Project** is a rendered button with no action. Clicking it leaves Home unchanged.
- Home **Open Project** opens `OpenProjectBrowser`, a plain full-screen local-only list. Valid entries open the editor; invalid entries remain visible and disabled.
- **Open Project** currently has loading, empty, unavailable, valid, migrated, protected-legacy, and invalid/error classifications, but no poster frame, duration, search, sort, rename, duplicate, or delete.
- Home **Export** opens the accepted SPEC-0009 **Choose and watch** flow. Its saved-project chooser and `AnimationPlayer` already evaluate real saved projects and render real frames, but the player is an export screen rather than a centered modal and its browser audio triggering is not seek/resume synchronized.
- Startup recovery gates Home/New/Open and remains a separate SPEC-0010 owner. Recovery drafts are not project-list entries.

Fresh real-app proof on 2026-09-21 confirmed the inert Home button, the empty local Open Project browser, and the separate empty Export chooser. The proof ran in a disposable clean clone of planning base `788e69826438f56ee648452706ce1f68c07592bc` and made no source-repository changes.

### 2.2 Current project-list and editor-open path

```text
Home → Open Project
  → app/page.tsx sets view = "openProject"
  → OpenProjectBrowser
  → listProjectCollection(createBrowserProjectSourceReader())
  → unified native V2 heads + read-only legacy source leaves
  → deterministic updatedAt/identity ordering and provenance de-duplication
  → select valid ProjectCollectionEntry
  → createUnifiedWorkspaceBootstrap().open(...)
  → prepareCollectionWorkspace(...)
  → source identity/digest revalidation and legacy-to-V2 candidate preparation
  → AnimationWorkspace → sole DrawingWorkspace editor
```

Collection listing and reading do not create or upgrade storage. Native V2 and all legacy readers remain authoritative; invalid or conflicting records remain visible rather than disappearing.

### 2.3 Current saved-project evaluation and playback path

```text
Home/workspace → Export
  → AnimationExportFlow saved-project chooser
  → listProjectCollection(...)
  → loadExportProjectSnapshot(entry)
  → re-list + exact entry/source digest revalidation
  → prepareCollectionWorkspace(...)
  → assert drawing-only UnifiedAnimationProjectV2
  → clone/hash project, resolve frameCount and duration = frameCount / fps
  → AnimationPlayer
  → renderCanonicalExportFrame(...)
  → accepted background/layer/hold/tween/text/symbol/raster compositor
```

That evaluator and compositor are the accepted truth for saved animation playback. SPEC-0011 must factor/reuse them; it must not build a second evaluator, thumbnail-only fake, or playback renderer.

### 2.4 Current repository and mutation path

```text
Save
  → createPersistedProjectSnapshot(...)
  → buildUnifiedProjectSnapshot(...)
  → createUnifiedProjectRepositoryV2().save(...)
  → writeUnifiedProjectV2(candidate, expectedRevision)
  → encode/hash/stage/readback/compare-and-swap head publication

Save As
  → the same preparation/storage owner
  → new UUID, revision 1, copy provenance, rebound auxiliary identities
```

The repository currently exposes Save, Save As, and Open. It does not expose rename or delete. IndexedDB uses `projects`, `heads`, `versions`, `assets`, and `assetMetadata`; native versions are immutable and assets are content-addressed. Project bounds remain 64 projects, 128 MiB per project, and 512 MiB for the collection.

### 2.5 Playback-proof observation that Phase 2 must reconcile

A bounded replay check of `scripts/spec0009-export/correctionBrowserProof.ts` was run against the clean planning base in one disposable environment. The initial execution and one immediate same-environment confirmation reached the chooser/player assertions and failed at the same inherited geometry assertion:

```text
export frame 3 x matches workspace stage mapping:
0.749406441925578 vs 0.8215350990452878
```

This planning task did not diagnose or change the failure. It is **not proven to be a current product regression**; it may be an inherited proof/environment mismatch. Phase 2 entry must reproduce and reconcile it before changing playback geometry. Phase 2 proof may fix the product or the test only after tracing which side is stale, and must not weaken or delete the accepted shape-preserving tolerance to obtain green evidence.

## 3. Permanent invariants

1. **One official project repository.** Listing, opening, renaming, duplicating, and deleting route through the existing unified project source/repository/storage boundary. UI state is never authoritative storage.
2. **One saved-project evaluator and player.** My Projects, its poster frames, Movie Viewer, and the Export preview reuse the accepted snapshot evaluator, canonical compositor, and one shared playback owner. No demo data or approximate player is permitted.
3. **Viewer is playback-only.** Opening, playing, pausing, seeking, entering fullscreen, and closing never mutate project bytes, revision, history, updated time, recovery draft, or editor state.
4. **Open Project edits.** My Projects selects into Movie Viewer. Open Project selects into the sole DrawingWorkspace editor. Labels, headings, and focus behavior keep that distinction obvious.
5. **Contain, never distort.** Saved logical stage dimensions determine aspect ratio. Poster and viewer content use uniform contain scaling with centered matte; no crop, non-uniform stretch, or independent X/Y scale is allowed.
6. **Truthful failure.** Loading, empty, unavailable, invalid, corrupt, changed, deleted, protected legacy, unsupported, and decode/audio failures remain visible and actionable. No invalid entry silently vanishes and no failed command reports success.
7. **Legacy leaves stay read-only.** Existing read-only legacy Drawing/Stick/unified V1 sources are never renamed or deleted in place. A valid legacy source may be duplicated by creating a new native V2 project; its source bytes remain unchanged.
8. **Recovery stays separate.** The project library never lists, thumbnails, renames, duplicates, or deletes the SPEC-0010 emergency draft. Delete is blocked when an exact matching recovery draft exists; recovery is never silently discarded.
9. **No hidden destructive action.** Delete requires an explicit accessible confirmation that identifies the exact project. A stale or mismatched target fails closed.
10. **Local only.** All three phases make zero network, AI, Terra, provider, analytics, telemetry, account, cloud, social-service, upload, deployment, or paid requests.
11. **No protected-system drift.** Drawing, timeline, Save/Save As/Save and Exit, recovery, official history, AI/Thinking, notification, export encoding/destinations/Finder, and paused SPEC-0008 behavior remain unchanged except for explicitly named shared preview-player factoring with equivalent Export behavior.

## 4. Scope and non-goals

### 4.1 In scope

- a dark gray/navy professional project-library shell with bright blue/cyan emphasis;
- a shared library presentation used by My Projects and Open Project;
- real saved entries, deterministic poster frames, duration/FPS/dimensions/updated time, and truthful status surfaces;
- a centered playback-only modal and one shared canonical playback owner;
- exact saved background, frames, layers, holds, tweens, text, symbols, raster, effects already handled by the accepted compositor, plus real saved audio;
- play/pause, click-to-toggle, seek, fullscreen, close, keyboard, focus, compact, reduced-motion, and accessibility behavior;
- shared Rename, Duplicate, Delete, Search, Sort, context-menu, overflow, and keyboard command routing;
- local concurrency, recovery conflict, asset-reference safety, fault handling, and proof.

### 4.2 Explicit non-goals

- any SPEC-0008 Phase 2–6 AI Animator work, Terra/model/reasoning/prompt/job changes, web research, reference-video generation, tracking, reconstruction, or paid/external operation;
- AI Dashboard, AI Assistant, AI Project Finalizer, notification system, or credit changes;
- drawing tools, timeline behavior, onion skin, command/history semantics, Save/Save As/Save and Exit, official autosave, or recovery-policy changes;
- a new project schema, player engine, renderer/compositor, repository/database, or source-of-truth cache;
- cloud sync, accounts, collaboration, remote backup, telemetry, deployment, direct social login/upload/posting, or platform APIs;
- export encoding, codec, destination, geometry, Finder, file validation, or download behavior changes;
- trash/restore, folders/tags, batch operations, cloud thumbnails, project import/export, or permanent thumbnail persistence;
- editing inside Movie Viewer;
- changing fixed current V2 logical-stage policy or retroactively rewriting existing project bytes.

An **Export** action inside Movie Viewer is deliberately omitted. Existing Home/workspace Export remains the sole entry to the accepted Export owner; a later separately specified enhancement may add a handoff without changing encoding or destinations.

## 5. Shared visual and information contract

### 5.1 Shell

Both surfaces use the same `ProjectLibrary` shell and these semantic tokens (or byte-equivalent accessible values):

| Role | Target |
| --- | --- |
| App background | deep navy `#0b1220` |
| Primary surface | gray-navy `#111827` |
| Raised/hover surface | `#172033` |
| Border/divider | `#2a3a55` |
| Primary text | near-white `#f8fafc` |
| Secondary text | slate `#94a3b8` or a contrast-safe equivalent |
| Primary accent | cyan `#22d3ee` |
| Strong/action accent | blue `#0ea5e9` |
| Destructive | accessible red, at least `#f87171` on the dark surface |

The shell has a visible Back action, surface-specific heading and help text, one results region, and a responsive grid/list. Focus indication is at least two CSS pixels and not color-only. Normal text meets WCAG 2.2 AA contrast. Compact layouts never require horizontal page scrolling at 320 CSS px.

### 5.2 Entry identity and metadata

Each entry binds the exact `ProjectCollectionEntry` locator plus source kind, source ID, source digest/candidate digest, provenance key, classification, and last-verified timestamp. The UI may show a shortened stable ID, never substitute array position or title for identity.

For a valid entry, show:

- exact saved title;
- updated time using the current locale plus an accessible full ISO timestamp;
- duration formatted `m:ss` or `h:mm:ss`, with exact seconds in accessible text;
- saved FPS and logical stage dimensions;
- native/local or protected legacy classification when relevant;
- deterministic poster frame from the exact saved snapshot.

The poster frame is the earliest timeline frame with visible canonical content; if none exists, use frame zero with the exact saved background. Audio alone does not invent visual content. The poster is rendered through `renderCanonicalExportFrame`, uses contain geometry, and has descriptive text that does not claim semantic image understanding.

### 5.3 Loading and failure states

- Metadata heads render before heavy snapshot/poster work finishes.
- Each poster/duration cell has its own skeleton, success, unavailable, corrupt/invalid, or changed/deleted state.
- Whole-list failure provides **Try again** and Back; retry re-reads storage rather than replaying cached success.
- Empty state says no saved projects are available locally and offers Back; it does not imply cloud sync.
- Invalid/conflicting entries remain visible with their recorded title/identity where safe, exact truthful category text, and disabled Watch/Edit as appropriate.
- If the source changes between list and selection, opening fails with **Project changed. Refresh and try again** and refreshes the authoritative collection.

## 6. Phase 1 — Project Library / My Projects

### 6.1 Exact user flow

1. Startup recovery completes and Home appears.
2. Home displays **My Projects** (plural) in place of inert **My Project**.
3. Activating it opens the shared project-library shell with heading **My Projects** and help text **Watch saved animations stored in this browser**.
4. The shell reads the real unified collection, renders metadata immediately, and lazily evaluates visible/near-visible valid snapshots for duration and poster frames.
5. Selecting a valid project revalidates the exact entry and opens the centered Movie Viewer dialog over the library. Phase 1 supplies the shared accepted player host with real saved frames, project title, basic play/pause, current/total time, seek, close, and backdrop behavior; Phase 2 completes the full contract in §7.
6. Closing the dialog returns to the same library scroll/search-ready state and restores focus to the invoking entry.
7. Back returns Home and restores focus to **My Projects**.
8. Home **Open Project** still opens the editor-selection surface. Its selection behavior is unchanged in Phase 1.

### 6.2 Shared player factoring

Phase 1 must extract the accepted saved-project player from `AnimationExportFlow` into one shared `CanonicalProjectPlayer` owner used by both Export preview and Movie Viewer. The owner receives only a fully validated saved snapshot plus display mode/callbacks. The accepted evaluator, frame resolver, compositor, FPS/duration calculation, layer/background rendering, and Export selection semantics remain the same.

Export remains visually and behaviorally equivalent: same chooser, range behavior, project selection, destination/export controls, encoder, cancel, Finder, geometry, and validation. This factoring may move code; it may not broaden Export scope or change output bytes by design.

### 6.3 Phase 1 data flow

```text
My Projects mount
  → ProjectLibraryController.list()
  → listProjectCollection(createBrowserProjectSourceReader())
  → render authoritative metadata/classification rows
  → bounded visible/near-visible queue (maximum 4 snapshot evaluations)
  → loadExportProjectSnapshot(exact entry)
  → duration/poster data
  → renderCanonicalExportFrame(posterFrame)

Select valid entry
  → cancel stale poster work for that entry
  → loadExportProjectSnapshot(exact entry) again
  → source locator/digest revalidation
  → open ProjectMovieViewer dialog
  → shared CanonicalProjectPlayer
```

Snapshots used for posters are in-memory derived views, never new saved projects or stored thumbnails. A selection always revalidates; it does not trust a prior poster result.

### 6.4 Phase 1 implementation boundary

Expected authorized runtime families:

- `app/page.tsx` for the My Projects view and modal navigation only;
- `src/components/project-library/**` for the shared shell, entries, status, and styling;
- `src/components/project-player/**` for the shared player component/host;
- `src/components/export/AnimationExportFlow.tsx` only to factor and consume the shared player without changing Export behavior;
- `src/lib/project-library/**` for list/view-model/poster orchestration;
- narrow reusable exports from `src/lib/export/exportPhase1.ts` and `src/lib/export/exportRenderer.ts` only if required, with no evaluator/compositor behavior change;
- `scripts/spec0011-project-library/phase1*` fixtures, tests, proof, and ignored evidence.

No dependency or schema change is expected. A path outside these families, a storage write, or an Export behavior/output change is an entry blocker for PM/spec review.

### 6.5 Phase 1 acceptance

- The former inert action is visibly **My Projects** and opens the shared shell by pointer and keyboard.
- Real native and supported legacy entries appear once, with correct stable identity/classification, title, updated time, dimensions, FPS, exact duration, and canonical poster.
- Loading, empty, unavailable, invalid, corrupt, source-changed, and retry states are truthful and keyboard accessible.
- Selecting a valid entry opens a centered modal backed by the exact accepted snapshot/player/compositor path; no project/recovery/history bytes change.
- Closing restores focus and library state; backdrop closes only when the backdrop itself is activated.
- Open Project still opens the sole editor; My Projects never mounts DrawingWorkspace.
- Export preview behavior and selected-project rendering are equivalent before/after factoring.
- Desktop, compact 390×844, narrow 320×568, keyboard-only, 200% zoom, and reduced-motion layouts pass with no horizontal overflow or obscured primary action.
- Zero external/network/AI/provider/paid requests and zero official/recovery writes occur during list, poster, watch, close, failure, and retry flows.

### 6.6 Phase 1 stop gate

The Spec Executor returns an immutable technical proof manifest and Spec Executor Implementation Review Packet, then stops. No Phase 2/3 work, control-plane edit, staging, commit, integration, push, publication, deployment, or cleanup is authorized in that task.

### 6.7 Accepted Phase 1 implementation record — D-0112

Arthur reviewed the ordinary app and marked Phase 1 PASS. The accepted result starts from exact activation base/HEAD `0169c09cc8dbede616fdf099b31925669ec35f6e`, empty index, and exactly these 15 technical paths:

- `app/page.tsx`;
- `scripts/spec0011-project-library/phase1BrowserProof.ts`;
- `scripts/spec0011-project-library/phase1Fixtures.ts`;
- `scripts/spec0011-project-library/phase1Oracle.ts`;
- `scripts/spec0011-project-library/recordPhase1Proof.ts`;
- `scripts/spec0011-project-library/validatePhase1Proof.ts`;
- `src/components/export/AnimationExportFlow.tsx`;
- `src/components/project-library/ProjectLibrary.tsx`;
- `src/components/project-library/ProjectPoster.tsx`;
- `src/components/project-library/projectLibrary.module.css`;
- `src/components/project-player/CanonicalProjectPlayer.tsx`;
- `src/components/project-player/ProjectMovieViewer.tsx`;
- `src/components/project-player/projectPlayer.module.css`;
- `src/lib/project-library/projectLibraryController.ts`;
- `src/lib/project-library/projectLibraryModel.ts`.

The immutable 28,886-byte manifest `output/spec-0011/phase-1/proof-manifest.json` has SHA-256 `69a169bdd7d7ee96b82d61699b56e1d28f55f4dfeaa0c8614127e4153c0539b6`; the 47,161-byte browser result has SHA-256 `89cc86c8f93638cfbbb11519f345d11a9726de888d62156e88fc4a5a70ae7a81`. Strict pre-propagation validation passed 14 assertions and rejected ten mutation classes. The oracle passed 35 assertions, including native plus all five supported legacy kinds and maximum snapshot concurrency four. Real Chromium passed 60 assertions across eight operations/eight screenshots at desktop, compact reduced-motion, narrow and 200%-zoom-equivalent profiles. TypeScript, focused lint and production build passed; full lint retains the inherited 5-error/81-warning untouched baseline.

Measured first usable list/viewer frame were 101.824875/126.470333 ms; seek acknowledgement/canvas update were 2.672959/123.727459 ms; play acknowledgement was 23.852834 ms; five-cycle settled heap delta was 8,215,763 bytes; maximum long task was 78 ms. Official and recovery storage hashes remained identical before/after desktop library/viewer, Export shared-player and changed-source retry flows. Network/provider/AI/paid requests, credit changes and official/recovery writes were zero.

The accepted implementation delivers the plural Home action, real local library, truthful states, deterministic earliest-visible-frame posters, selection revalidation, centered playback-only modal, shared player owner, focus/scroll restoration and unchanged editor/Export ownership. Phase 1 does not claim fullscreen, synchronized audio or comprehensive Phase 2 accessibility/resource completion; those remain Phase 2. It also does not implement Phase 3 management. Physical-device/non-Chromium behavior and a fully hydrated 64-project collection remain unproven. The inherited SPEC-0009 frame-3 mismatch remains the Phase 2 gate recorded in §2.5.

The Control Plane Architect changed no accepted technical byte, immutable manifest byte, or manifest-bound source/evidence/receipt artifact. D-0113/GIT-084 publish exact 29-path commit `9a3c5733da8080e09ec93129285ec97a7aebc039`, preserve the 22-file proof at relative inventory SHA-256 `e2fc1d2fa98bcae461a59e9750a4eb104436bbbec5c7fb2e56a5fac4d9ba5d47`, stop port 57680 and complete D-0054 worktree/branch cleanup. Phase 1 is fully closed. At that closeout Phases 2–3 remained Unauthorized/Not started; D-0114/GIT-085 now separately authorize Phase 2 only.

## 7. Phase 2 — Movie Viewer (Authorized/Not started)

### 7.0 Activation record — D-0114/GIT-085

Arthur explicitly authorizes publication of this Phase 2 activation and, only after clean canonical/local-origin/live-GitHub synchronization, exactly one fresh dedicated Plan-mode Spec Executor from the exact GIT-085 SHA. The activation commit contains control-plane records only and implements no Phase 2 runtime, fixture, test, proof, dependency, credential, AI/Terra, provider, recovery, storage, Export-output, or deployment byte.

The executor may implement only §7 inside the Phase 2 boundary. It must satisfy every §7.1 entry gate before geometry changes, build and independently validate the §11 immutable manifest, return the full Implementation Review Packet, and stop. Phase 3 remains Unauthorized/Not started.

### 7.1 Phase 2 entry gates

Before implementation, the fresh Spec Executor must:

1. start from the exact published Phase 1 canonical-main SHA in a dedicated worktree;
2. verify the shared evaluator/player has one owner used by My Projects and Export;
3. reproduce the §2.5 SPEC-0009 frame-3 mapping mismatch in the accepted proof environment or document why it does not reproduce;
4. trace workspace stage mapping and canonical export rendering to identify product defect, stale fixture, or harness/environment drift; and
5. preserve accepted contain/shape tolerances. Any product geometry correction that would alter Export output is outside SPEC-0011 Phase 2 and must stop for owner/spec review.

### 7.2 Modal geometry and chrome

- Default is a centered modal dialog over the dimmed My Projects shell, not a route replacement.
- Desktop maximum is the smaller of 1120×760 CSS px or `calc(100vw - 48px)` × `calc(100vh - 48px)`.
- Compact uses `calc(100vw - 16px)` × `calc(100vh - 16px)` with safe-area insets and no clipped close/control target.
- Project title and Close are outside the video hit target. The video region uses a dark matte and exact saved aspect ratio within all remaining space.
- The canvas backing store follows device pixel ratio up to a capped ratio of 2 and must not exceed 4096 px on either axis; CSS geometry remains contain-scaled.
- Modal open traps focus; close restores it to the invoking card. Background content is inert/aria-hidden while open.

### 7.3 One authoritative playback clock

The shared player owns one monotonic media time in seconds. Frame, time label, seek value, and audio schedule derive from that clock.

```text
durationSeconds = frameCount / savedFps
displayFrame = min(frameCount - 1, floor(mediaTime * savedFps))
audioStartSeconds = attachmentFrameIndex / savedFps
```

- `performance.now()` drives silent playback; an active `AudioContext.currentTime` becomes the clock anchor when decodable audio is scheduled.
- `requestAnimationFrame` samples the clock for UI/canvas updates; it does not increment time by assumed frame duration.
- Pausing captures the exact clamped media time and stops/disconnects scheduled audio nodes.
- Seeking cancels prior audio, updates canvas/time immediately, then reschedules only clips intersecting the new time with the correct source offset when playback resumes or remains playing.
- Reaching exact duration stops on the final frame, changes to paused, and does not loop. A later Play restarts at zero.
- Hidden-page time is reconciled from the monotonic clock; rendering does not attempt to replay missed frames.

### 7.4 Exact audio behavior

Use the saved audio attachment schedule already understood by Export. Do not create an alternate timing interpretation.

- Decode each unique saved audio asset once per open viewer, bounded to two concurrent decodes.
- Schedule every attachment at `frameIndex / fps`, trim it at animation duration, and use the saved attachment volume/effect semantics supported by the accepted export audio owner.
- Mid-clip play/seek starts at the correct source offset; overlapping clips mix; pause, seek, close, source invalidation, and viewer teardown while fullscreen stop obsolete nodes. Exiting fullscreen alone does not stop or restart playback.
- First user Play may resume a browser-suspended `AudioContext`. If permission remains blocked, show **Click Play to enable audio** without pretending audio played.
- Missing/corrupt/unsupported audio marks the viewer **Audio unavailable** with accessible detail. Visual playback may continue only after the failure is disclosed; it may never silently omit audio.
- Audio/video drift at sampled steady-state checkpoints must be no more than `max(50 ms, one saved frame)`.

### 7.5 Controls and visibility

Controls overlay the video in a YouTube-like gradient chrome and contain:

- project title;
- truthful current and total time;
- Play/Pause button with stateful accessible name;
- draggable seek slider with current time, total time, and frame in `aria-valuetext`;
- Fullscreen/Exit fullscreen button.

Controls are visible on initial open, pause, pointer hover/move, keyboard focus, seeking, audio warning, or completion. During uninterrupted pointer playback they hide after 2.5 seconds of inactivity. They never hide while any control has focus. Reduced motion removes opacity/slide animation and switches state immediately.

Click/tap on the video surface toggles play/pause. Events from controls, title, warning, or Close must not bubble into that toggle. Dragging seek updates current time continuously and renders the corresponding frame; audio resumes from the released position only if playback was active before the drag.

### 7.6 Fullscreen and close semantics

- Fullscreen is entered only from the explicit button and targets the viewer stage wrapper.
- If the Fullscreen API is unavailable or rejects, keep the modal open and show **Fullscreen unavailable**.
- `fullscreenchange` is authoritative; labels and layout reflect actual browser state, not requested state.
- While fullscreen, Escape exits fullscreen first and leaves the paused/playing modal open. A later Escape outside fullscreen closes the modal.
- Outside fullscreen, Close button, Escape, and an exact backdrop click close only the viewer. They never delete, navigate Home, open the editor, or alter library state.
- Closing exits fullscreen if needed, stops audio, cancels RAF/decode work, releases object URLs/resources, and restores focus.

### 7.7 Keyboard and accessibility contract

When focus is in the viewer and not in another text/slider control:

| Key | Action |
| --- | --- |
| `Space` or `K` | Play/Pause; prevent page scroll |
| `ArrowLeft` / `ArrowRight` | Seek −/+ 5 seconds |
| `Shift+ArrowLeft` / `Shift+ArrowRight` | Seek exactly one saved frame |
| `Home` / `End` | Seek to zero/exact duration |
| `F` | Enter/exit fullscreen |
| `Escape` | Exit fullscreen first; otherwise close viewer |

The slider retains native arrow semantics when it owns focus. Every icon has a text alternative; status changes use a polite live region, except blocking decode/source errors use assertive status. The modal has a programmatic title/description. Focus order is title context → Close → Play/Pause → Seek → Fullscreen, with no focus escape.

### 7.8 Phase 2 implementation boundary

Expected authorized runtime families:

- `src/components/project-player/**` and `src/components/project-library/**` for the modal/player UI;
- `src/lib/project-player/**` for the clock, audio scheduler, and geometry helpers;
- narrow reuse/refactoring in `src/lib/export/exportAudio.ts`, `exportPhase1.ts`, and `exportRenderer.ts` only where pure accepted schedule/render helpers become shared;
- `src/components/export/AnimationExportFlow.tsx` only as required to continue consuming the same player owner with equivalent Export behavior;
- `scripts/spec0011-project-library/phase2*` fixtures, tests, proof, and ignored evidence.

No project/recovery/storage/schema, encoder, destination, package, or dependency change is expected. If correct Phase 2 playback requires changing accepted export geometry/output, stop for owner/spec review.

### 7.9 Phase 2 acceptance

- Exact saved frames/layers/holds/tweens/background/text/symbol/raster/effects render at saved FPS through the accepted compositor.
- The complete animation remains centered and visible at wide, tall, square, desktop, compact, fullscreen, high-DPI, and resize/orientation states without crop or stretch.
- Play, pause, surface click, drag seek, keyboard seek, frame step, Home/End, completion/replay, hidden-page reconciliation, and rapid play/pause/seek races produce one deterministic state.
- Real saved audio starts, pauses, seeks, overlaps, trims, resumes, completes, and closes within the drift bound; corrupt/blocked audio is truthful.
- Hover/focus chrome, inactivity hide, reduced motion, focus trap/return, live announcements, accessible names, and 200% zoom pass.
- Fullscreen enters only explicitly; first Escape exits fullscreen only; closing the modal never deletes or navigates away.
- Opening through My Projects remains playback-only and byte-identical for official projects, recovery, history, and workspace state.
- Export chooser/player, encoded outputs, destination catalog, cancel, Finder, and validation retain their accepted regressions.
- The §2.5 mismatch has a recorded root cause and non-weakened regression result.

### 7.10 Phase 2 stop gate

The Spec Executor returns its immutable manifest and packet, then stops. No Phase 3 work or control-plane/Git/publication action is authorized in that task.

## 8. Phase 3 — Shared Management and Polish

### 8.1 One command owner

Both My Projects and Open Project consume one `ProjectManagementCommandOwner`. The owner accepts an exact revalidated collection locator and returns a typed success/failure result. UI menus dispatch commands; they do not write IndexedDB directly.

```text
ProjectLibrary surface
  → exact ProjectCollectionEntry locator
  → ProjectManagementCommandOwner
  → acquire per-project exclusive operation
  → re-list/re-read and verify identity + source digest/head revision
  → canonical V2 repository/storage command
  → readback/absence verification
  → invalidate/reload both surfaces from storage
```

Same-tab success refreshes the mounted surface immediately. Other tabs receive a small `BroadcastChannel` invalidation event containing only command kind, project ID, and new revision/digest or deletion marker. The event is never trusted as project data; recipients re-read authoritative local storage. A storage-backed lease or Web Lock plus CAS prevents overlapping Save/Rename/Duplicate/Delete from publishing stale state.

### 8.2 Search and sort

- Search is local, updates within 100 ms, and matches Unicode-NFC normalized title text case-insensitively using locale-aware comparison. It never searches project content or sends text externally.
- Search does not hide invalid entries whose safe title matches; clearing restores all entries.
- Sort choices are **Last edited — newest**, **Last edited — oldest**, **Name — A to Z**, and **Name — Z to A**.
- Default is Last edited — newest. Date sorts use parsed `updatedAt`; entries with an invalid/unparseable date sort after valid dates in either direction. Name sorts use locale-aware normalized title; exact stable source identity is the final tie-breaker.
- Search/sort state is per mounted surface, not persisted into project data. Commands preserve the current query/sort when possible.

### 8.3 Rename

Rename is allowed only for a current native unified V2 head.

1. Revalidate exact project ID, active revision, project digest, and classification.
2. Show an accessible dialog prefilled with the current title.
3. Normalize input to NFC and trim leading/trailing Unicode whitespace.
4. Require 1–512 UTF-8 bytes; reject line breaks, C0/C1 control characters, bidi override/isolate controls, and invalid Unicode. Duplicate visible titles are allowed because identity is not title.
5. Publish a metadata-only next V2 revision through the repository's existing prepare/hash/stage/readback/CAS path. Preserve project ID, createdAt, provenance, full prior immutable versions/assets, and authoring content. Set only title, updatedAt, and incremented revision as required by the V2 contract.
6. On success refresh both surfaces. On validation, quota, stale revision, write, readback, or broadcast failure, do not report success and preserve the prior head.

Rename is not Save As, does not rebind auxiliary drawing/recovery identity, and does not create a new project.

### 8.4 Duplicate

Duplicate is available for any valid collection entry that can be hydrated through the accepted bootstrap, including protected legacy sources.

1. Revalidate the exact source locator/digest and hydrate the accepted drawing-only V2 candidate without writing the source.
2. Default title is `<source title> copy`; validate through the Rename rules and allow user edit before confirmation.
3. Use the existing Save As/copy path: new UUID, revision 1, new created/updated time, copy provenance with bound parent source/digest, and rebound auxiliary drawing memory/latch identity.
4. Validate and read back the new project before success.
5. The source and copy must open, edit, Save, Undo/Redo, recover, rename, and delete independently. Content-addressed immutable asset bytes may be physically deduplicated, but no mutable head, version history, session ownership, or recovery ownership is shared.

A duplicate never modifies, upgrades, renames, or deletes a protected legacy source.

### 8.5 Delete

Delete is allowed only for an exact native unified V2 project. Protected legacy sources remain visible with disabled Rename/Delete and an explanation: **Open and save a native copy before managing this legacy project**. Invalid legacy entries cannot be deleted here.

1. Revalidate exact ID, revision, digest, and native classification.
2. Check cross-tab open-project leases and the separate recovery-store metadata. If any active editor or viewer lease owns the project, or an exact matching recovery draft exists, block deletion with a truthful action: close the project elsewhere, or recover/discard/save the draft through its existing owner. Movie Viewer is read-only but still counts as currently open; closing it releases its view lease and permits a later delete.
3. Show **Delete project?** naming the full title, updated timestamp, and shortened stable ID. State that deletion removes the saved project and its local history and cannot be undone. **Cancel** is initial focus and default; Delete uses destructive styling.
4. In one bounded storage operation, CAS the expected head, delete only that project’s native head, legacy direct record if it is the exact native predecessor container, and all immutable versions keyed to that project ID.
5. Delete a content-addressed asset/metadata record only if a complete in-transaction scan proves no remaining official version references it. Never open or mutate the recovery database during garbage collection.
6. Verify the exact head/project/versions are absent and every remaining version hydrates its referenced assets before reporting success. A cleanup failure aborts or reports partial-cleanup failure truthfully; it never reports the project gone while its head remains.
7. Broadcast invalidation and refresh. Other projects, recovery drafts, editor sessions, legacy sources, and shared assets remain byte-identical.

Invalid native heads may be deleted only through a separately tested raw-head quarantine path that can still bind one exact project ID/head digest and prove no cross-project asset loss. If exact identity/reference reachability cannot be established, disable Delete and report that the project cannot be safely removed. This phase does not invent “delete everything/reset storage.”

### 8.6 Menus and input routes

- Every entry has a visible labelled overflow button with Rename, Duplicate, and Delete states.
- Right-click opens the same menu at the pointer. `Shift+F10` and the Context Menu key open it at the focused entry. Right-click is never the sole route.
- Keyboard users can Tab to the overflow button, use Arrow keys/Home/End/Escape in the menu, and activate dialogs without pointer use.
- Menu/dialog focus returns to the invoking entry/overflow button after cancel/failure and to the next logical entry after successful delete.
- Clicking the card's main action Watch/Edit remains distinct from the overflow button; menu activation never also opens viewer/editor.
- Touch long-press is optional and must not suppress ordinary scrolling; the visible overflow button is the required compact route.

### 8.7 Open Project polish

Open Project consumes the same `ProjectLibrary` shell, cards/status components, metadata, Search, Sort, and management menus. Its heading/help text is **Open Project** / **Choose a saved project to edit**. Its primary action is **Edit**, and selecting it continues through `createUnifiedWorkspaceBootstrap().open(...)` into the sole DrawingWorkspace. No viewer is inserted into that path.

My Projects uses heading/help text **My Projects** / **Watch saved animations stored in this browser** and primary action **Watch**. Visual parity must not blur the functional difference.

### 8.8 Phase 3 implementation boundary

Expected authorized runtime families:

- `src/components/project-library/**` and the narrow My Projects/Open Project wiring in `app/page.tsx` and `src/components/open-project/OpenProjectBrowser.tsx`;
- `src/lib/project-library/**` and/or `src/lib/animation/unifiedProjectManagementV2.ts` for one command owner;
- narrow extensions to `unifiedProjectRepositoryV2.ts`, `unifiedProjectStorageV2.ts`, `unifiedProjectCollection.ts`, and related exported types for tested rename/delete/list invalidation operations;
- read-only recovery metadata query only through the existing recovery owner; no recovery delete/write change;
- `scripts/spec0011-project-library/phase3*` fixtures, tests, proof, and ignored evidence.

No package/dependency, schema migration, editor/timeline, Save/recovery-policy, player, or Export change is expected. A need to mutate legacy source stores, recovery bytes, export output, or the editor is an entry blocker.

### 8.9 Phase 3 acceptance

- My Projects and Open Project show the same authoritative entries/status/metadata and immediate command results while keeping Watch versus Edit semantics.
- Search, all four sorts, stable ties, invalid entries, keyboard navigation, compact layout, reduced motion, and 200% zoom pass on both surfaces.
- Rename preserves ID/provenance/content/history, creates exactly one valid next revision, rejects unsafe names, and handles stale/concurrent writes without lost update.
- Duplicate produces one independent native V2 project from native or valid legacy source, with correct copy provenance/rebinding and independent edit/save/history/recovery/delete behavior.
- Delete confirmation identifies the exact target, defaults to Cancel, removes only that native project/history, blocks active/recovery conflicts, retains shared assets, and never changes another project or recovery draft.
- Visible overflow, pointer context menu, `Shift+F10`/Context Menu key, dialogs, focus return, and non-bubbling card/menu actions pass.
- Two-tab rename/delete/save races have one deterministic winner; stale tabs refresh from storage and do not resurrect deleted/old heads.
- Save/Open/Save As/Save and Exit/recovery/editor/history/Export/player/Terra regressions pass unchanged.

### 8.10 Phase 3 stop gate

The Spec Executor returns its immutable manifest and packet, then stops. Final acceptance, control-plane propagation, publication, synchronization, proof preservation, and D-0054 cleanup remain separate sequential tasks.

## 9. Failure, concurrency, and local-security policy

### 9.1 Failure matrix

| Failure | Required result |
| --- | --- |
| IndexedDB absent/blocked/read failure | Whole-list unavailable state, Retry/Back, no writes or false empty state |
| Invalid/corrupt/missing asset | Entry remains visible and disabled or viewer shows exact error; other entries continue |
| Source changes after listing | Action aborts, says project changed, refreshes authoritative list |
| Poster/render failure | Metadata/card remains; poster says unavailable; selection performs a fresh validation |
| Audio decode/permission failure | Visible audio warning; no silent claim of synchronized audio |
| Fullscreen rejection | Modal remains, error is announced, playback state stays valid |
| Rename/duplicate quota or readback failure | Prior source/head preserved; no success toast or partial visible project |
| Delete stale head/open lease/recovery conflict | Delete blocked before mutation with truthful remediation |
| Broadcast unavailable | Same-tab authoritative refresh succeeds; other tabs converge on focus/visibility/storage re-read; no correctness depends on broadcast |
| Tab/process crash during command | Transaction/CAS leaves either verified predecessor or verified successor, never a half-published head |

### 9.2 Local security and privacy

- Titles are rendered as text, never HTML. No SVG/URL/data content from a project is inserted into executable markup.
- Project IDs/digests are validated before storage key/range use. No user title becomes a database key, file path, selector, or log instruction.
- Image/audio data URLs are decoded only through existing bounded project validation. Object URLs are revoked on replacement/close.
- Fullscreen is user-gesture-only; no viewer auto-enters fullscreen or starts audio before user action when browser policy forbids it.
- Proof fixtures contain synthetic local data only. No production/private project bytes, secret, `.env.local`, account data, or provider credential enters tracked proof.
- Console/error evidence may record error codes and shortened IDs, not full raster/audio data URLs or secret project payloads.

## 10. Performance and resource ceilings

Measured in production mode on the accepted desktop Chromium profile with synthetic representative and accepted-large fixtures:

| Operation | Ceiling |
| --- | --- |
| Library metadata shell with up to current 64-project bound | first usable list ≤1.5 s desktop, ≤2.0 s compact; must not wait for posters |
| Search/sort/menu feedback after metadata loaded | ≤100 ms p95 |
| Snapshot/poster evaluation | maximum 4 concurrent; visible/near-visible first; stale/offscreen work cancellable |
| Viewer validated first frame | ≤1.0 s representative, ≤2.0 s accepted-large after selection |
| Play/pause/keyboard/seek UI acknowledgement | ≤100 ms p95 |
| Canvas update after released seek | ≤250 ms p95 |
| Audio/video steady-state drift | ≤`max(50 ms, one saved frame)` |
| Rename/Duplicate/Delete completion | ≤3.0 s representative; large-fixture actual reported without false universal promise |

No single intentional main-thread task may exceed 250 ms. At most two full-resolution viewer/poster canvases may be live at once; offscreen poster canvases are released after bitmap capture. After five open/play/seek/close cycles and forced test-only GC where available, settled JS heap must return within 32 MiB of baseline. Representative settled heap must stay ≤320 MiB and transient peak ≤512 MiB; if `performance.memory` is unavailable, record the limitation and use browser process/resource evidence without inventing a pass.

## 11. Required phase proof and immutable manifest

Every phase requires one ignored immutable JSON proof manifest binding:

- exact authorized base SHA, phase, dirty-path allowlist, empty-index status, and executor ownership;
- SHA-256 and byte length for every authorized source/fixture/test/evidence artifact;
- before/after official repository, project-head/version/asset, recovery-store, workspace/history, and relevant Export-output digests;
- exact list/classification/metadata/poster/frame/audio expected values for deterministic fixtures;
- deterministic fault and two-tab concurrency injection;
- all network requests, provider/AI requests, credit/cost changes, and external writes—expected zero;
- real-browser desktop/compact/narrow/200%-zoom/reduced-motion/keyboard/accessibility/fullscreen results required by that phase;
- focused TypeScript/lint/build/test results, repository baseline comparison, diff/scope/index checks, and protected regression results;
- performance/resource measurements with environment metadata;
- `humanAcceptance: "pending Arthur"`, `controlPlaneUpdated: false`, `gitPublication: false`, proven/not-proven fields, and open risks;
- validator negative tests that reject altered base, path set, source hash, artifact hash, project/recovery digest, request ledger, performance result, or acceptance flags.

The executor independently re-reads the manifest and validates every binding before its packet. It then completely stops. It must not update this spec/docs/tree, stage, commit, merge, push, publish, deploy, or clean another worktree.

## 12. Required fixture and acceptance matrix

### 12.1 Deterministic fixtures

At minimum:

1. empty repository;
2. one simple native project;
3. multi-layer/hold/tween/background project with wide stage;
4. tall and square stage compatibility fixtures where accepted readers permit them;
5. text, symbol, raster, transform/effect, and hidden-layer project;
6. silent project and overlapping/mid-clip audio project;
7. current 64-head collection bound with mixed valid/invalid entries;
8. corrupt head, corrupt current version with valid fallback, missing asset, bad digest, invalid title/date/FPS, and identity conflict;
9. protected Drawing V1/V2, Stick V1/V2, and unified V1 legacy entries;
10. shared-asset native projects proving deletion reference safety;
11. matching recovery draft and active cross-tab editor lease;
12. representative and accepted-large performance projects.

### 12.2 Protected regression matrix

Each affected phase reruns, in proportion to its scope:

- Home recovery gate and Recover/Discard/Save and Exit flows;
- New/Open, native/legacy Open, Save, Save As, Save and Exit, official revision/CAS/fallback, and recovery separation;
- Drawing tools, layers, frames/cells, Undo/Redo, onion, workspace playback, background, audio, and catalog behavior;
- Export Choose and watch, selected preview, range, 720p/1080p encoding, audio, contain geometry, Original/custom/preset destinations, cancel, Finder seam, output validation, and zero-byte cleanup;
- accepted SPEC-0009 geometry tests, including the reconciled §2.5 frame-3 assertion;
- Terra/chat/Thinking source hashes and no-cost deterministic regression only—no live/paid call;
- zero external request and unchanged dependency/lockfile checks.

### 12.3 Accessibility and visual proof

Use real Chromium screenshots and DOM/accessibility assertions for desktop 1440×900, compact 390×844, narrow 320×568, 200% zoom, reduced motion, dark/high-contrast system preferences, and fullscreen where supported. Run axe (or the accepted equivalent) with zero critical/serious violations in the affected surface. Human review must inspect real poster/frame fidelity, modal hierarchy, control reveal/hide, destructive confirmation, focus visibility, and Watch-versus-Edit clarity.

## 13. Phase lifecycle and authorization gates

For each phase:

1. Arthur explicitly authorizes that phase after its activation record is durably on canonical `main`.
2. A fresh Spec Executor starts in Plan mode from the exact authorized canonical-main SHA and obtains exclusive ownership of one dedicated worktree.
3. The executor traces current code/real behavior, publishes an exact implementation plan, and changes only phase-authorized runtime/fixture/test/proof paths.
4. The executor completes technical proof, manifest, independent validation, and its Implementation Review Packet, then stops.
5. Arthur and the Project Manager accept or reject. Rejection returns to a separately authorized fresh correction executor; rejected bytes are preserved/cleaned under D-0054 and are not reused.
6. Only after acceptance may a Control Plane Architect take exclusive ownership, revalidate unchanged accepted bytes, update this control plane, run `bash scripts/update_memory.sh`, complete final tracked-state checks, return its packet, and stop with an empty index.
7. Only a later explicit publication instruction permits exact staging, commit, clean fast-forward integration to canonical `main`, normal push, clean `0/0` synchronization, proof preservation, server stop, and D-0054 worktree/branch cleanup.
8. The next phase requires separate authorization after all prior closeout steps complete.

The Phase 1 lifecycle is fully closed under D-0113/GIT-084. D-0114/GIT-085 authorize exactly one fresh Phase 2 executor after activation synchronization. No Phase 3 implementation, external/paid operation, provider call, deployment, or Phase 2 publication is authorized by that activation.

## 14. Decision-completeness record

Resolved by D-0110 and this spec:

- My Projects watches; Open Project edits.
- One shared professional local library shell serves both surfaces.
- Real collection/evaluator/compositor/player data is reused; no fake list or second playback engine.
- Phase 1 introduces the real library and shared player host; Phase 2 completes exact movie-viewer behavior; Phase 3 owns shared management/polish.
- Viewer defaults to centered modal, uses contain geometry, stops at duration without looping, and closes without deletion/navigation.
- Fullscreen is explicit; Escape exits fullscreen before closing the modal.
- Real audio follows the saved frame/FPS schedule with one shared clock and bounded drift.
- Export action inside Movie Viewer is omitted; accepted Export remains unchanged.
- Rename is same-identity next revision; Duplicate is new-identity copy; Delete is exact native-project/history removal with recovery/open-session/reference safety.
- Protected legacy sources are not renamed/deleted in place; valid legacy entries may be duplicated into native V2.
- Search/sort, overflow/context/keyboard, concurrency, local-only/security, performance, proof, and lifecycle gates are fixed.
- The observed SPEC-0009 replay mismatch is an unresolved Phase 2 entry/proof gate, not a claimed product regression.

Phase 1 is Verified, published, integrated, synchronized, proof-preserved and cleaned up. Phase 2 is Authorized/Not started after GIT-085 synchronization. Phase 3 still requires its own explicit authorization after complete Phase 2 closeout.
