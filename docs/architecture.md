# Architecture and System Map

Status: canonical current architecture map
Last traced: 2026-09-04 through published SPEC-0004 Phases 1, 2, and timing-only 2.5, rejected unpublished Phase 2.6 evidence, published proof-only SPEC-0005 Phase 1, and D-0045's not-started Phase 2 authorization

## Runtime Overview

```text
app/page.tsx
  └─ local React view state
      ├─ home
      ├─ TutorialsScreen
      │   └─ fixed static tutorial catalog; Back restores Home Tutorials-card focus
      ├─ OpenProjectBrowser
      │   └─ localStorage drawing project → DrawingWorkspace
      ├─ new-project chooser
      ├─ DrawingWorkspace
      │   ├─ DrawingCanvas
      │   ├─ DrawingTimelineRow
      │   ├─ DrawingTopBar / DrawingToolBar / DrawingRightPanel
      │   └─ DrawingAiPanel
      │       ├─ POST /api/ai
      │       │   └─ analysis → clarification/failure, direct plan, or structured-model/recovery plan
      │       └─ generatedFramePlan
      │           └─ browser drawingFrameExecutor
      │               └─ timeline mutation
      ├─ StickFigureWorkspace
      │   ├─ StickFigureCanvas
      │   ├─ StickFigureTimelineRow
      │   ├─ canonical editable editor/history/storage root
      │   ├─ SPEC-0004 Phase 1 strict plan/executor and durable one-time latch
      │   └─ stick right/top/tool panels, including the published Phase 6 wave chat
      └─ StickFigureCreatorWorkspace
```

The main product screens are not URL routes. `app/page.tsx` owns a `view` union and mounts one surface at a time. URL routes exist for `/credits`, local AI-cost dashboards, `/api/ai`, and `/api/drawing-project-ai-memory`.

## System Ownership Map

| System | Primary files | Current responsibility |
| --- | --- | --- |
| App shell/home/new-project routing | `app/page.tsx`, `src/components/chrome/AIcreditspage.tsx`, `app/ScrollbarActivity.tsx` | Header/menu, welcome flow, home cards, local screen switching, and Tutorials focus return |
| Tutorials showcase | `src/components/tutorials/TutorialsScreen.tsx`, `TutorialsScreen.module.css`, `src/lib/tutorials/tutorialCatalog.ts` | Full-screen local static showcase with one featured and three secondary `COMING LATER` cards; no media, workspace action, API, analytics, or persistence |
| Project browser | `src/components/open-project/OpenProjectBrowser.tsx` | Lists and manages locally saved drawing projects |
| Drawing workspace coordinator | `src/components/workspace/DrawingWorkspace.tsx` | Central drawing/timeline/history/playback/save/AI-apply state and orchestration |
| Drawing canvas/editor | `src/components/workspace/DrawingCanvas.tsx`, `drawingText.ts` | Imperative layered canvas tools, transforms, assets, symbols, text, playback surface |
| Drawing timeline | `DrawingTimelineRow.tsx`, `timelineStructure.ts`, `timelinePlayback.ts` | Timeline cells, mutations, playback timing helpers |
| Drawing UI panels | `DrawingTopBar.tsx`, `DrawingToolBar.tsx`, `DrawingRightPanel.tsx` | Menus, tools, properties/assets/library presentation |
| Workspace AI UI | `ai/DrawingAiPanel.tsx`, `ai/WorkspaceAiPanelShell.tsx` | Task/reasoning controls, chat state, request/response handling, workspace action dispatch |
| AI contract and task orchestration | `src/lib/ai/drawingAiContract.ts`, `drawingAiTaskPipeline.ts`, `drawingAiTaskExecution.ts` | Shared request/response, command, action, task, memory, and execution contracts |
| AI prompt/planning | `drawingAiPrompting.ts`, `generateFramesRuntime.ts`, task reference-example files | Task classification, prompt assembly, structured plan analysis, validation/recovery |
| AI frame renderer | `drawingFrameExecutor.ts`, `app/engine/stickRig.ts` | Deterministic Canvas2D rendering and generated-frame payload creation |
| AI server route | `app/api/ai/route.ts`, `src/lib/openai/*` | Request orchestration, model calls, normalization, optional search, cost logging |
| Drawing project persistence | `src/lib/drawingProjectStorage.ts` | Version-1 localStorage envelope, CRUD, cloning, quota fallback |
| Drawing AI project memory | `drawingAiProjectMemory.ts`, `drawingProjectAiMemorySync.ts`, memory API route | Per-animation-project semantic memory and optional Supabase sync |
| Stick workspace | `src/components/workspace/stickfigure/StickFigureWorkspace.tsx` and siblings, `src/lib/stickfigure/stickTimeline.ts`, `stickProjectContract.ts`, `stickProjectHistory.ts`, `stickProjectStorage.ts` | Canonical editable timeline/history/storage root, independent keyframe poses plus owner-resolved holds, manual joint edits, playback/onion, Creator continuity, and the published SPEC-0004 Phase 1 one-time creation latch/transaction wiring. Editing a held slot currently edits its owner content, so Phase 2 generated output must not use holds. |
| Stick animation plan/executor | `src/lib/ai/stickFigureAiContract.ts`, `stickFigureCommandExecutor.ts`, `stickFigureMotionEngine.ts`, `stickFigureAiWorkspaceAdapter.ts` | Published Phase 6 wave contract plus published SPEC-0004 Phase 1 strict fixed-fixture plan. Published Phase 2 adds a separately selected independent-keyframe materializer. Published timing-only Phase 2.5 adds the strict plan-bound timing sidecar and six bounded profiles while preserving Phase 1/2 defaults. The unpublished Phase 2.6 result was rejected and is not runtime truth. SPEC-0005 Phase 1 adds only a published independent full-playback proof gate. D-0045 authorizes the action-independent whole-body pose foundation but no implementation exists yet; the future movement-goal → pose → mechanics → path → ordinary-keyframe runtime still does not exist. |
| Stick creator | `StickFigureCreatorWorkspace.tsx`, `types.ts` | Standalone local rig-creation experiment; save disconnected |
| Dev cost visibility | `src/lib/ai/devAiCostDashboard.ts`, `app/dev/ai-costs/**` | Local model-call cost logs and dashboards |

## Drawing Project Data Flow

1. The workspace owns React state for layers, frames, active selection, tools, playback, project identity, AI memory, and history.
2. `DrawingCanvas` exposes a narrow imperative ref for authoring snapshots, transient-state cleanup, playback layout, selection/pending-state checks, committed-state marking, and onion-overlay content. Tools, transforms, and asset placement are internal or prop-driven.
3. Pointer/timeline actions save raster/text snapshots into in-memory timeline frames.
4. Manual Save/Save As serializes a version-1 project through `drawingProjectStorage.ts` into `localStorage` key `da_saved_drawing_projects`.
5. Open Project reads the same collection and remounts `DrawingWorkspace` with the chosen envelope.
6. Compact AI semantic memory may also sync to Supabase, but artwork remains browser-local.

`DrawingProjectData.version = 1` contains tool settings, FPS, layers, timeline frames, text, tween data, optional sound attachments, current/selected positions, and counters. `StoredDrawingProject.aiMemory` is a sibling of `data`, not part of that versioned data envelope. The format lacks a migration framework and a canonical document/stage resolution.

Live frame `ImageData` objects are not serialized: the save path sets bitmap fields to `null` and stores compact WebP preview URLs targeted to at most 1,280 px and 72,000 URL characters. Reopen decodes those images at their encoded dimensions and centers them in the current authoring world. Imported reusable assets and library symbols are session-only collections outside `DrawingProjectData`; raster pixels already committed into frames may persist, but reusable entries do not.

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

D-0043 replaces that approach with SPEC-0005's one strict `stick.movement-goal/v1` boundary and staged local architecture: planner intent → action-independent whole-body pose creation → support/weight/ground mechanics → natural paths/timing/gravity → complete ordinary independent keyframes. Pretend AI and a future Terra adapter must use the same bounded intent and local engine. The planner cannot return raw coordinates/code or select another animation format. D-0044's Phase 1 proof-only independent reference/full-playback gate is published/integrated. D-0045 authorizes only the next whole-body pose layer, pending activation publication; neither decision connects a route, language interpretation, provider/API call, app UI, live tween/controller, or stored AI authority.

Stick saved record version 2 stores that latch beside the editable document/view state. Existing record version 1 remains readable and conservatively defaults to consumed; opening does not rewrite it, while a normal explicit Save writes version 2. After successful Apply, later AI submissions return `AI editing comes later; use manual tools.` before executor/provider work. The normal published chat still recognizes only its prior wave wording; natural-language routing for the broader engine is a later phase.

The blue `PRIVATE REVIEW` fixture controls used for Arthur's acceptance were injected only into a temporary isolated copy by the dedicated browser-proof script. Product source contains no route, picker, overlay, or query-controlled review surface. The workspace keeps an unexported proof-port object for isolated source-copy injection, but product code neither exposes it on `window` nor imports the proof client.

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
- broader Stick scene/language/model behavior beyond published SPEC-0004 Phases 1–2.5; rejected Phase 2.6 is not runtime truth, published SPEC-0005 Phase 1 is proof infrastructure, and authorized/not-started Phase 2 is not current engine implementation
- general AI editing, recoloring, continuation, and multi-step transaction semantics after Apply
- authenticated user/project ownership and rate limiting
- repeatable unit/integration/E2E suite and CI
- production animation export
- modular boundaries around very large coordinator/runtime files

These gaps belong in dedicated specs; this map does not prescribe their implementation.
