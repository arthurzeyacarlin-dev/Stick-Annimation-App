# Architecture and System Map

Status: canonical current architecture map
Last traced: 2026-09-10 accepted Phase 3 source and evidence in c6b0, authorization/HEAD `916a4d913c6fdf8340b67bcc88dcea184d67cd32`, runtime parent `d2096109900cc50a0a4dae2f603bd74b7b4a3427`. Phase 3 is Verified but unpublished/not integrated; canonical main/local origin remain clean at `916a4d913c6fdf8340b67bcc88dcea184d67cd32`, 0/0. No runtime byte changed during CPA tracing/propagation.

## Approved architecture transition (D-0055/D-0056/D-0057/D-0059/D-0060/D-0061)

SPEC-0004 and SPEC-0005 completed phases remain published and protected; their unfinished motion phases remain superseded/inactive under D-0055. [`SPEC-0006`](specs/0006-unified-animation-workspace.md) remains the sole approved seven-phase owner for one typed Drawing/Stick project, root, stage, timeline, tools, history, and persistence.

GIT-051 publishes Phase 1’s contract/read-only migration; GIT-052 `d2096109900cc50a0a4dae2f603bd74b7b4a3427` publishes Phase 2’s direct New, combined Open and compatibility mounting. D-0061 accepts the exact 16-path Phase 3 stage/compositing result from authorization `916a4d913c6fdf8340b67bcc88dcea184d67cd32`. It is Verified in c6b0 with CPA propagation complete, but unpublished/not integrated. Phases 4–7 remain Unauthorized/Not started.

## Accepted SPEC-0006 Phase 1 and Phase 2 architecture

`unifiedAnimationMigration.ts` remains the strict read-only mapper for Drawing V1/V2 and Stick V1/V2. Phase 2 adds `unifiedProjectSourceReader.ts`, `unifiedProjectCollection.ts`, and `unifiedWorkspaceBootstrap.ts` around that boundary. The source reader obtains current browser-local records; the collection normalizes ordering and availability; the bootstrap generation/revision gate rejects stale or failed opens before root replacement.

`app/page.tsx` now owns `home | tutorials | openProject | animationWorkspace`. New builds the canonical Phase 1 candidate in memory. Open renders `OpenProjectBrowser`, whose inherited Projects layout now holds one combined collection without the old type selector or new type badges. `AnimationWorkspace` mounts exactly one compatibility editor based on the candidate source kind. Drawing open plumbing accepts the prepared candidate without adding a new write door.

The compatibility editors remain separate sources of editing truth. Drawing retains DrawingCanvas/timeline/history/Save/Save As; Stick retains its timeline/gestures/history/Save. Accepted Phase 3 adds a conditional mixed render seam described below. No shared clock, unified tool dispatcher/history, canonical repository, or split-owner retirement exists yet.

## Accepted Phase 3 rendering seam — unpublished

`AnimationWorkspace` detects mixed Drawing/Stick layers and builds a read snapshot containing the live active Stick owner from the existing editor. It supplies `UnifiedAnimationStage` through the optional Stick workspace/canvas render callback. `unifiedCellResolver` resolves empty/blank/keyframe/hold/tween ownership and orders visible layers; typed Drawing/Stick adapters create render commands. `UnifiedStageRenderer` paints a private work canvas, checks asset hashes, bounds sequential decoding/cache ownership, and publishes only complete current-generation frames onto the front canvas. Both backing canvases are fixed at 1920×1080. Snapshot consumers use the same front canvas.

`fitAuthoredStage` scales the fixed authored DOM surface for the host; pointer handling maps back through the existing Stick gesture/history owner. The old viewport projection is bypassed only for this mixed authored surface; ordinary Stick projection and AI/motion modules are unchanged. Mixed-only compact CSS stacks existing regions without adding product chrome. The DrawingCanvas allocation/tool system is untouched. Review-only fixture seeding and instrumentation exist only in the ignored source copy, not the production navigation or project stores.

The seeded neutral fixture proves typed composition, text/tween rendering, coordinate preservation and existing manual editability. It does not create one timeline/tools/history/write owner, canonical mixed Save, new AI output, or new motion capability. Phases 4–7 remain unauthorized.

## Runtime Overview

```text
app/page.tsx
  └─ local React view state
      ├─ home
      ├─ TutorialsScreen
      ├─ OpenProjectBrowser
      │   └─ createBrowserProjectSourceReader
      │       └─ listProjectCollection (Drawing V1/V2 + Stick V1/V2, read-only)
      └─ AnimationWorkspace
          ├─ WorkspaceBootstrap + Phase 1 mapper/validator
          ├─ DrawingWorkspace compatibility editor
          │   ├─ DrawingCanvas / DrawingTimelineRow / Drawing panels
          │   ├─ Drawing history + IndexedDB/V1-compatible persistence
          │   └─ Drawing AI path
          └─ StickFigureWorkspace compatibility editor
              ├─ Stick canvas/timeline/panels/Creator
              ├─ optional mixed read snapshot → UnifiedAnimationStage → typed compositor
              ├─ Stick history + localStorage persistence
              └─ accepted bounded Stick AI path
```

The main product screens are local view states rather than URL routes. URL routes remain for `/credits`, local AI-cost dashboards, `/api/ai`, and `/api/drawing-project-ai-memory`.

## System Ownership Map

| System | Primary files | Current responsibility |
| --- | --- | --- |
| App shell/home/New/Open routing | `app/page.tsx`, `src/components/chrome/AIcreditspage.tsx`, `app/ScrollbarActivity.tsx` | Header/menu, welcome, home cards, direct Untitled Project creation, local screen switching, and Home focus return |
| Tutorials showcase | `src/components/tutorials/TutorialsScreen.tsx`, `TutorialsScreen.module.css`, `src/lib/tutorials/tutorialCatalog.ts` | Full-screen local static showcase with one featured and three secondary `COMING LATER` cards; no media, workspace action, API, analytics, or persistence |
| Unified read/collection/bootstrap | `src/lib/animation/unifiedProjectSourceReader.ts`, `unifiedProjectCollection.ts`, `unifiedWorkspaceBootstrap.ts`, Phase 1 contract/migration | Read-only source access, deterministic combined ordering/availability, typed mapping, and stale-safe mounted-root publication |
| Project browser | `src/components/open-project/OpenProjectBrowser.tsx` | Preserves the established Projects presentation; lists all supported local sources together, disables invalid entries, and requests one bootstrap/open without source writes |
| Compatibility workspace wrapper | `src/components/workspace/AnimationWorkspace.tsx` | Mounts exactly one Drawing or Stick compatibility editor for the accepted candidate; adds no visible wrapper chrome and owns no shared editor state yet |
| Drawing workspace coordinator | `src/components/workspace/DrawingWorkspace.tsx` | Existing drawing/timeline/history/playback/save/AI-apply orchestration, plus narrow prepared-candidate open input |
| Drawing canvas/editor | `src/components/workspace/DrawingCanvas.tsx`, `drawingText.ts` | Imperative layered canvas tools, transforms, assets, symbols, text, playback surface |
| Drawing timeline | `DrawingTimelineRow.tsx`, `timelineStructure.ts`, `timelinePlayback.ts` | Timeline cells, mutations, playback timing helpers |
| Drawing UI panels | `DrawingTopBar.tsx`, `DrawingToolBar.tsx`, `DrawingRightPanel.tsx` | Menus, tools, properties/assets/library presentation |
| Workspace AI UI | `ai/DrawingAiPanel.tsx`, `ai/WorkspaceAiPanelShell.tsx` | Task/reasoning controls, chat state, request/response handling, workspace action dispatch |
| AI contract and task orchestration | `src/lib/ai/drawingAiContract.ts`, `drawingAiTaskPipeline.ts`, `drawingAiTaskExecution.ts` | Shared request/response, command, action, task, memory, and execution contracts |
| AI prompt/planning | `drawingAiPrompting.ts`, `generateFramesRuntime.ts`, task reference-example files | Task classification, prompt assembly, structured plan analysis, validation/recovery |
| AI frame renderer | `drawingFrameExecutor.ts`, `app/engine/stickRig.ts` | Deterministic Canvas2D rendering and generated-frame payload creation |
| AI server route | `app/api/ai/route.ts`, `src/lib/openai/*` | Request orchestration, model calls, normalization, optional search, cost logging |
| Drawing project persistence | `src/lib/drawingProjectStorage.ts`, `drawingProjectV2Contract.ts`, `drawingProjectV2Repository.ts`, `drawingProjectIndexedDb.ts`, V1 compatibility/PNG/audio codecs | Existing Drawing V2 transactional storage and legacy read compatibility; Phase 2 adds no unified write repository |
| Drawing AI project memory | `drawingAiProjectMemory.ts`, `drawingProjectAiMemorySync.ts`, memory API route | Per-animation-project semantic memory and optional Supabase sync |
| Stick workspace | `src/components/workspace/stickfigure/StickFigureWorkspace.tsx` and siblings, `src/lib/stickfigure/stickTimeline.ts`, `stickProjectContract.ts`, `stickProjectHistory.ts`, `stickProjectStorage.ts` | Existing Stick editor/timeline/history/localStorage owner, manual editing, Creator continuity, playback/onion, and accepted bounded AI behavior |
| Stick animation plan/executor | `src/lib/ai/stickFigureAiContract.ts`, `stickFigureCommandExecutor.ts`, `stickFigureMotionEngine.ts`, `stickFigureAiWorkspaceAdapter.ts` | Published SPEC-0004 Phases 1/2/2.5 and SPEC-0005 accepted safety results; rejected/superseded motion work remains unavailable |
| Stick creator | `StickFigureCreatorWorkspace.tsx`, `types.ts` | Standalone local rig-creation experiment; save remains disconnected |
| Dev cost visibility | `src/lib/ai/devAiCostDashboard.ts`, `app/dev/ai-costs/**` | Local model-call cost logs and dashboards |

## Drawing Project Data Flow

1. The workspace owns React state for layers, frames, active selection, tools, playback, project identity, AI memory, and history.
2. `DrawingCanvas` exposes a narrow imperative ref for authoring snapshots, transient-state cleanup, playback layout, selection/pending-state checks, committed-state marking, and onion-overlay content. Tools, transforms, and asset placement are internal or prop-driven.
3. Pointer/timeline actions save raster/text snapshots into in-memory timeline frames.
4. Manual Save/Save As snapshots the live V1-shaped data, encodes/deduplicates PNG/audio assets, and transactionally publishes a strict Drawing V2 version/head in IndexedDB. Supported older localStorage records are read through a non-destructive compatibility layer.
5. Open Project lists Drawing sources alongside Stick sources; a selected Drawing entry passes through the unified read/migration/bootstrap path and mounts `DrawingWorkspace` only after validation/hydration succeeds.
6. Compact AI semantic memory may also sync to Supabase, but artwork remains browser-local.

`DrawingProjectData.version = 1` is still the live workspace-shaped object and contains tool settings, FPS, layers, timeline frames, text, tween data, optional sound attachments, current/selected positions, and counters. The V2 persistence contract replaces live bitmap/audio bytes with content-addressed asset references and stores project heads plus immutable version records. `StoredDrawingProject.aiMemory` remains auxiliary/project-scoped rather than authored animation content. The Phase 1 contract exists and accepted Phase 3 supplies a fixed mixed render surface. Ordinary DrawingCanvas still uses its inherited authoring allocation; Phase 3 does not migrate Drawing tools or persistence.

Live frame `ImageData` is encoded losslessly as PNG assets with RGBA/encoded digests and hydrated back to typed bytes on open; audio is likewise asset-backed. Project-card preview data is separate. Imported reusable assets and library symbols remain session-only collections outside `DrawingProjectData`; raster pixels/audio already committed into frames persist, but reusable entries do not become a saved library.

## Timeline and History Model

Drawing timeline positions use `kind` (`frame`, `keyframe`, or `tween`), `cellType` (`empty`, `keyframe`, `blank-keyframe`, `hold`, or `tween`), and `stateId` ownership. Workspace frames extend that metadata with bitmap/tween endpoints, a position-only `motionTween` payload, sound attachment, and text objects.

History is not a single undo stack. `DrawingWorkspace` coordinates global workspace snapshots with context-scoped local drawing entries for bitmap patches, full snapshots, metadata, and timeline snapshots; structural timeline edits rebase those histories. Timeline or history work must trace both global and local ownership paths and prove undo/redo across the structural boundary.

## Current Render and Export Paths

- Playback reverses/composites all layers and renders text on a separate playback surface.
- Paused editing clears the background and foreground compositing canvases and restores only the active-layer raster to the authoring canvas.
- Project preview generation composites raster bitmaps but not text.
- Current-frame PNG export composites raster bitmaps only at full authoring-world dimensions; it does not include text or crop to the camera stage.

These are code-verified path differences. Their visual severity in realistic projects remains untested.

## AI Generate Frames Flow

1. `DrawingAiPanel` collects task controls, user text, workspace context, project memory, and available actions.
2. It posts to `/api/ai` using the shared contract.
3. The server normalizes and analyzes the request, including any search decision and deterministic runtime planning.
4. Deterministic early outcomes can request clarification, return a controlled failure, or return an eligible direct plan without a model call. Requests routed to the structured-model branch select references/model strength and use the OpenAI Responses API with validation, retry, recovery, and deterministic fallback paths.
5. The response returns a generated-frame plan rather than a finished image.
6. `drawingFrameExecutor.ts` renders the plan locally with hardcoded Canvas2D scene/subject/action vocabulary, using the supplied full authoring-canvas dimensions rather than a canonical camera-stage coordinate system.
7. `DrawingWorkspace` applies the returned frame payload to the real timeline.

This is a hybrid deterministic/model-planned procedural renderer, not image generation and not a custom-trained LLM. AI panel messages and follow-ups live only in React session state. The workspace action-plan executor currently implements only `save-project`, `export-current-frame`, and `attach-sound-option-to-frame`; every other contract action returns `false`.

## Stick Figure Data Flow

The published SPEC-0001 sequence now provides one canonical editable editor root with complete poses on controlling keyframes, held cells that resolve their owner pose, history, browser-local Save/Open, onion skin, Creator → Back root continuity, and the writable deterministic Phase 6 wave chat. `StickFigureCanvas` renders canonical 1920×1080 coordinates through a letterboxed viewport and derives the fixed horizontal line head from the editable `head` joint. Pointer movement is transient. A valid release hashes and publishes one candidate document/revision/generation; cancellation, stale instance/generation, remount, and competing completion cases are no-ops.

Published SPEC-0004 Phase 1 extends that same root rather than adding a locked AI format. A strict action-neutral plan supports only ordered `set_timing`, complete independent `create_key_pose`, bounded contiguous `hold_pose`, and terminal `finish` commands. The shared executor materializes wave, jump, bow, and dodge fixtures without action-name branches, validates one figure/one layer/11 joints/8–24 frames/12 or 24 FPS, and holds the result in an isolated candidate. Preview/Cancel/failure do not mutate canonical state. Apply rechecks the captured binding, publishes exactly one history action, and atomically consumes a project-bound latch outside Undo/Redo.

D-0039's published Phase 2 architecture treats the plan's key poses as input only. The hidden local motion engine normalizes the 11-joint body against starter segment lengths, eases hip and shortest-turn segment angles with deterministic cubic smoothstep, rebuilds the 10-segment tree, and materializes every important/in-between/repeated slot as a complete unique keyframe before Preview. Interpolation state is temporary and discarded; there is no hold/tween owner span, motion payload/controller, hidden AI ownership, lock, or post-Apply regeneration. This is intentionally different from Drawing's persistent position-only motion tween. Phase 1's existing materializer remains the default; the separately named Phase 2 option must be selected explicitly.

D-0041 accepts Phase 2.5's exact seven-path result as the timing/spacing primitive only. Its strict `stick.action-timing/v1` sidecar binds to the exact plan and selects one of `ease_in`, `ease_out`, `ease_in_out`, explicit-mechanical `constant`, or paired `impact`/`recovery` for every adjacent important-pose transition. The transaction accepts timing only with the separately named `phase-2.5-timed-motion` materializer, clones/freezes it across `fork()`, rejects missing/cross-materializer timing, hashes the accepted timing into deterministic frame/pose IDs, applies its progress to the unchanged Phase 2 hip/shortest-turn rebuild, and discards the sidecar when complete independent frames are baked. Phase 1 and Phase 2 entry points remain behaviorally protected.

The human review boundary is equally architectural: Phase 2.5 proves timing math, not natural action planning. Its old jump inherited a wave hand and floated, its bow was too compressed, and its dodge reversed while both feet slid. A later unpublished Phase 2.6 attempted an action-specific `stick.action-foundation/v1` validator around full coordinate recipes. Its technical manifest was green, but Arthur rejected the visible motion; its browser proof did not observe a full playback cycle and its frozen expected frames were regenerated through the same implementation path. Those bytes are not accepted or published.

D-0043 replaced that approach with SPEC-0005's strict `stick.movement-goal/v1` boundary. D-0044's Phase 1 proof-only independent reference/full-playback gate is published/integrated. GIT-040 published D-0045's former whole-body-pose authorization, but that executor's technically green result was rejected after visible review and never accepted, propagated, committed, published, or integrated; its disposable app/worktree was removed.

D-0046's exact eight-phase architecture is published at `46b97556…`. D-0047 makes its safety ordering implementable without circularity: selection accepts bound important-pose candidates and no final frames/document, returns checked immutable selected poses, and only the final completion operation accepts rounded/post-repair frames/document and recomputes binding/selection plus all final/semantic rules. The motion engine has exactly one final SPEC-0005 candidate door; movement-goal callers cannot select a legacy materializer or assert trust/skip/action/fixture state. Phase 4's exact twelve-path ceiling includes the safety module and both current validators so mechanics-qualified `grounded anticipation → takeoff → airborne → contact → compression → recovery` can be checked at important-sequence selection and full-baked completion. Phase 2 still rejects airborne; every phase keeps the same bend/continuity/manual-ownership rules. Pretend AI and future Terra use the same safety regardless of 2D direction.

GIT-043 publishes the implemented D-0047/D-0048 route at `e524543…`. Its independent oracle imports no runtime safety/engine/executor module; the bounded evidence covers normal and mirrored elbow/knee bends, torso faults, branch flips, intersections, unsafe rounded/post-repair output, and all declared bypasses. This proves the accepted finite Phase 2 v1 numeric safety contract, not body-local anatomical direction or motion quality.

GIT-044 is exact docs-only commit `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`. Arthur rejected the Phase 3 executor result authorized from it: an alternate valid IK branch could still yield a visibly backward elbow, a roughly 57-degree elbow passed broad angle limits, candidate enumeration and scoring were too shallow to choose natural whole-body poses, key-step easing created visible stops, neutral recovery kept the arm raised, and a requested wave read as a reach. None of that executor's bytes is accepted or reusable.

D-0050 preserves exactly eight phases while reopening the future Preview dependency as a formal Phase 2 v2 correction. GIT-045 published it at exact commit `a4589664…`. D-0051 closes the remaining architecture gap by making `stick.movement-goal/v1` one bounded ordered semantic sequence: exact non-neutral-capable base binding, requested parts, complete per-landmark facing/support/contact/four-limb/active-part states, adjacent transitions, and exact hold/return/continuation. Phase 2 owns action-independent safety classification for every bounded context and final frame; Phase 3 grounded compound poses; Phase 4 foot/hand/pelvis contact and airborne mechanics; Phase 5 permanent motion law; Phase 6 gait/turns; Phase 7 complete actions/compositions; and Phase 8 the identical provider-free planner door. GIT-046 is published at `55b05e2daad649ac1e0027722a75762a9714d281`. D-0052 §3.2.1 defines front knee flexion as a role-local outward projection, perpendicular to the hip–foot chord, with separate wrong-side, clearance, singularity, and ambiguity failures. GIT-047 supplied the accepted v2 implementation basis; D-0053's accepted technical result is Verified, published, and integrated through GIT-048 at `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`, without changing any phase owner.

Stick saved record version 2 stores that latch beside the editable document/view state. Existing record version 1 remains readable and conservatively defaults to consumed; opening does not rewrite it, while a normal explicit Save writes version 2. After successful Apply, later AI submissions return `AI editing comes later; use manual tools.` before executor/provider work. The normal published chat still recognizes only its prior wave wording; natural-language routing for the broader engine is a later phase.

The blue `PRIVATE REVIEW` fixture controls used for Arthur's acceptance were injected only into a temporary isolated copy by the dedicated browser-proof script. Product source contains no route, picker, overlay, or query-controlled review surface. The workspace keeps an unexported proof-port object for isolated source-copy injection, but product code neither exposes it on `window` nor imports the proof client.

## Approved SPEC-0006 final target — not current runtime

If Arthur/PM approve and all seven phases are separately executed, accepted, propagated, and published, the normal path becomes:

```text
Home New/Open
  → one collection/bootstrap controller
  → read-only Drawing V1/V2, Stick V1/V2, or canonical V1 candidate
  → one UnifiedWorkspaceRoot and typed command dispatcher
  → one common cell-owner resolver
  → typed Drawing/Stick render adapters
  → one 1920×1080 logical stage and playback/onion clock
  → one contextual tool/panel surface
  → one atomic history and revision-bound IndexedDB repository
```

Drawing and Stick remain typed layer payloads; neither is flattened into the other. Phases 1–2 are published; accepted Phase 3 adds the seeded mixed stage but remains unpublished/not integrated. The unified timeline/clock, tools, history/repository, canonical Save identity, and split-owner retirement remain unimplemented. Phases 4–7 remain unauthorized.

## Protected Architectural Invariants

Until superseded by an approved spec:

- Existing dirty work belongs to the user and must be preserved.
- Drawing and stick workspace IDs remain `drawing` and `stick-figure` in AI contracts.
- Motion-tween V1 remains position-only. Its legacy spec is provisionally promoted as reconciliation guidance pending owner confirmation and a current acceptance rerun.
- A task described as disabled must exit before paid/output-generating execution.
- AI-produced changes must enter the same timeline/project state a human edits.
- Live AI tests are opt-in because they can spend money and contact external systems.
- Supabase service-role credentials remain server-only.
- `docs/` is current memory; domain-reference prose cannot override verified code by accident.

## Navigation and Coordinate Boundaries

`DrawingWorkspace` accepts an initial project but no exit callback, so the current mounted drawing flow has no in-app Back/Exit path. Home Tutorials now opens a local full-screen showcase and returns with focus restored; the Home header is not mounted inside Tutorials. Home AI Credits was removed. My Project, AI Assistant, Export, and AI Project Finalizer remain inert. These are local shell choices, not URL-routing commitments; refresh from Tutorials returns Home.

`DrawingCanvas` computes an authoring-world scale of 4.6 from camera limits. Six authoring canvases allocate `hostWidth × 4.6 × DPR` by `hostHeight × 4.6 × DPR`, or 21.16 times host pixel area per canvas at DPR 1 and 84.64 times at DPR 2, before the separate playback surface and history snapshots. A stable document/stage coordinate contract is therefore a prerequisite for treating viewport, memory, AI placement, persistence, and export independently.

## Regression Hotspots

The following surfaces require a dedicated spec and targeted regression matrix for structural changes:

- `DrawingWorkspace.tsx`: central state, mirrored refs, history rebasing, playback, persistence, and AI insertion
- `DrawingCanvas.tsx`: imperative multi-canvas editor and transient interaction sessions
- `app/api/ai/route.ts`: classification, routing, prompting, search, response normalization, disabled-task exits, cost logging
- `drawingAiPrompting.ts` and `generateFramesRuntime.ts`: output quality and stateful reasoning
- `drawingFrameExecutor.ts`: visual vocabulary and deterministic rendering
- drawing and stick timeline row components: duplicated structural behavior with different content models

Incidental cleanup inside these files is prohibited unless the active spec includes it and verification covers the affected systems.

## Known Architectural Gaps

- stable document/stage coordinate system and resolution
- complete, versioned project schema and migrations
- durable autosave/recovery and project-file import/export
- unified render/composite contract across edit, playback, save, reopen, and export
- broader Stick scene/language/model behavior beyond published SPEC-0004 Phases 1–2.5; rejected motion attempts are not runtime truth, SPEC-0005 Phase 2 v1 is only the published numeric-safety foundation, corrected Phase 2 v2 is Verified, published, and integrated through GIT-048 at `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`, and SPEC-0005 Phase 3's later visible result is rejected/unpublished and unfinished Phases 3–8 are superseded/inactive under D-0055
- general AI editing, recoloring, continuation, and multi-step transaction semantics after Apply
- authenticated user/project ownership and rate limiting
- repeatable unit/integration/E2E suite and CI
- production animation export
- modular boundaries around very large coordinator/runtime files

These gaps belong in dedicated specs; this map does not prescribe their implementation.
