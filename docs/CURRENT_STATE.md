# Current State

Status: canonical rolling snapshot
Last verified: 2026-08-15 for the accepted SPEC-0001 Phase 1.5 implementation, real browser proof, negative/cleanup/production gates, technical-manifest revalidation, and Control Plane Architect propagation/closeout; corrected SPEC-0001 Phase 1 proof remains verified from 2026-08-13
Current Git basis: clean synchronized canonical `main` and `origin/main` remain at `3768226fd3aa3668a6cf7260da8476ceea0a084e`, which published D-0012. The accepted Phase 1.5 implementation and eight-path control-plane propagation are unstaged on dedicated branch `codex/spec-0001-phase-1.5-closeout` at that HEAD; they are not yet committed, pushed, published, or integrated. Phase 1 remains published in `21a88feb65cf1cc51138c9ad4879b962ee468569`; its implementation base was `832d1f93630d7093514af3e81399077ebed696b4`. No recovery branch was used or changed.
Frozen starting audit: `baselines/2026-08-09-repository-audit.md`

## Executive Summary

Diamond Animator is a substantial local prototype, not an empty starter and not a production-ready product.

The most developed path is the raster Drawing Workspace: it has drawing tools, layers, a long timeline, playback, history, onion skinning, position-only bitmap motion tweens, text objects, inline sound playback, local project save/open, and a hybrid Generate Frames pipeline that can use a deterministic plan directly or convert structured model output into deterministic Canvas2D artwork.

The Stick Figure Workspace and separate Stick Figure Creator are early functional scaffolds. Their UI exists and parts of a live skeleton graph can be edited, but timeline frames do not yet hold independent pose data, projects cannot be saved/opened, and creator Save is disabled.

SPEC-0001 Phase 1 now adds hidden, unwired V1 Stick contracts and deterministic offline proof: one fixed 11-joint/10-segment humanoid, strict project/manual-action/AI-command formats, canonical WebCrypto hashing, a derived horizontal line head, identical manual/AI animation-content goldens, rejection fixtures, and a receipt/closeout proof harness. The 2026-08-13 correction makes timeline building strictly ordered, binds the applied-wave predicate to the exact starter identities/profile/timing, reruns wave-arm safety on correctly hashed commands, executes the complete invalid matrix, and freezes the full later-phase evidence/live-proof shapes. These contracts are not yet connected to the Workspace, so the visible scaffold behavior above remains unchanged.

SPEC-0001 Phase 1.5 is now technically Verified, accepted, and propagated in its dedicated worktree, but not yet published/integrated. It adds a permanent developer-only real-browser tester with loopback-only browser/server/child enforcement, isolated storage/profiles, deterministic checked-in font and Drawing fixtures, strict evidence validation, production-exclusion scanning, and complete cleanup. Diagnostics proved `DrawingCanvas.tsx` authoring-canvas width assignment was the first writer clearing generated pixels during settlement/resize; the retained one-file correction skips redundant dimension assignment and preserves/recenters the editable bitmap across an actual resize. Website users have no tester route, page, API, control, asset, warning, or production import.

Only the Drawing AI “Generate Frames” task is enabled. Generate Plans, Generate Sounds, and Other are intentionally disabled even though their prompt/reference and orchestration code exists.

## Preservation Record

At the start of the 2026-08-09 audit:

- Git tracked only 18 files.
- 272 non-ignored files were untracked.
- `rescue-before-restore`, `main`, and `origin/main` pointed to the same scaffold commit.
- `app/page.tsx` was `MM`: one version staged and a different version in the working tree.
- no stash, tag, extra worktree, or recoverable dangling commit preserved the application history.

That mixed state was reconciled on 2026-08-09 before broad staging:

- the older staged page blob `d44892246c4a8933047c028d2508e194e1ec731a` was preserved in commit `d35e892bdaabbd66ab36eae4cc32144aa620de44`
- recovery branch `codex/pre-baseline-staged-page-2026-08-09` was pushed to `origin`; it is an archive of the old index tree, not the functional baseline and not expected to build independently
- the working page blob `c24392097af8d578fc1f6cc501dad121ce0cb1fc` was selected for the functional baseline because it contains the current Open Project, Drawing Workspace, Stick Figure Workspace, Stick Figure Creator, stored-project, and shared-chrome integration that was live verified in this audit
- the configured values in `.env.local` had no literal matches in the publishable set; ignored build, browser, local-log, output, backup, and Supabase temp paths remained excluded
- the complete reviewed snapshot was committed as functional anchor `c7de444536f3e0dd578a2063f70b0914e6af60b1`, pushed on `rescue-before-restore`, and merged into `main` through pull request [#1](https://github.com/arthurzeyacarlin-dev/Stick-Annimation-App/pull/1) as merge commit `093bbac82fd3b4d97984448b6c6dbd716153354d`
- the publication follow-up removed six trailing-whitespace defects without changing runtime semantics and is anchored by tag `baseline-2026-08-09-control-plane`
- local `main` and `origin/main` were synchronized with a clean worktree and zero ahead/behind divergence after the merge

The baseline is canonical on `main` and durable locally and remotely. Do not delete the recovery branch, move the baseline tag, or rewrite published history without an explicit reviewed decision.

## Live-Verified User Flows

Verified in the running local app at `http://127.0.0.1:3000` on 2026-08-09:

| Flow | Result | Evidence status |
| --- | --- | --- |
| Load home | Diamond Animator shell, welcome dialog, workspace cards, learn/tools cards, menu, and AI Dashboard link render | Live verified |
| Home → New Project | Drawing Animation and Stick Figure Animation choices render with Back navigation | Live verified |
| New Project → Drawing Animation | Drawing workspace mounts with menus, timeline/FPS/playback controls, right panel, AI panel, and drawing toolbar | Live verified |
| Drawing AI task selection | Fresh audit state showed the code-default Generate Plans; Generate Frames could be selected, persisted across a later reload, and left chat input enabled | Live verified |
| New Project → Stick Figure Animation | Stick workspace mounts with timeline, placeholder toolbar items, and a read-only AI panel; no usable stick-frame AI executor is wired | Live mount verified; executor status code verified |
| Stick Figure Tools → Create New Stick Figure | Creator opens; Back, drawing/select/size/reset controls render; Save is disabled | Live verified |
| Browser console during the above | No warning or error entries were captured by the in-app browser | Live verified |

Not exercised in this baseline: drawing gestures, save/reopen fidelity, tween acceptance suite, playback fidelity, paid AI calls, Supabase calls, sound playback, export download, responsive layouts, or destructive editor actions.

## Subsystem Status

| Subsystem | Current reality | Status |
| --- | --- | --- |
| App shell/navigation | Main screens are switched by local React `view` state in `app/page.tsx`, not URL routes. New and Open are wired. My Project, Tutorials, AI Assistant, Export, AI Project Finalizer, and AI Credits cards are inert. Drawing Workspace has no in-app exit callback. | Partial |
| Drawing editor | Brush, eraser, fill, text, shape, knife, select/lasso, assets/symbols, pan/zoom, layers, history, and timeline logic exist in large coupled components. The Phase 1.5 narrow `DrawingCanvas` correction preserves the editable bitmap through the proven Generate Frames settlement/viewport-resize path. | Substantial prototype; protected Phase 1.5 path verified |
| Drawing timeline/playback | Frame/keyframe/blank/hold/tween cells, FPS, playback, layer operations, copy/paste, onion skin, and sound attachments exist. | Code-present and regression-sensitive; full acceptance untested |
| Motion tween | V1 supports whole-bitmap X/Y translation with explicit start/end data. A detailed legacy V1 spec is provisionally promoted for reconciliation, not newly owner-approved. | Implemented; full acceptance suite not rerun in this audit |
| Drawing persistence | Manual Save/Save As writes a version-1 envelope to one browser `localStorage` array. Live bitmap objects are replaced by compact frame preview URLs; AI memory sits outside `DrawingProjectData`. | Local-only; raster-frame persistence is lossy and may downscale, while other envelope data follows separate paths; visual impact untested |
| Drawing autosave | Pointer-up queues an in-memory current-frame snapshot. It does not durably persist the project without explicit Save. | Not durable autosave |
| Export | Home Export is inert. An AI action can export current raster layers as a full authoring-world PNG, but omits text and camera-stage cropping; Other is disabled. Project previews also omit text. No animation/video/native project export exists. | Code path exists; not a usable or fidelity-complete product flow |
| AI Generate Frames | Server performs deterministic analysis and may return clarification/controlled failure, a direct runtime plan, or structured OpenAI generation/recovery; browser code renders successful plans as Canvas2D frames and applies them to the timeline. | Enabled hybrid prototype |
| AI Generate Plans | Prompt/reference and route code exist. Execution is explicitly disabled. | Disabled |
| AI Generate Sounds | Planning/synthesis/reference code exists; both sound flags and task execution are disabled. | Disabled |
| AI Other/actions | Command/action code exists. Execution is explicitly disabled. | Disabled |
| Stick Figure Workspace | UI, timeline metadata, live graph/canvas, some limb-building behavior, and creator entry exist. Timeline frames do not store distinct pose graphs. | Early scaffold |
| Stick workspace AI | A read-only Drawing AI panel is visible, but no stick pose/frame apply executor is wired. | Not usable |
| Stick Figure Creator | Local rig editing UI exists. Save is intentionally disabled and it is not connected to a persisted library. | Incomplete |
| Open Project | Drawing projects can be listed/opened/renamed/duplicated/deleted locally. Stick-project tab has no persistence path. | Drawing-only |
| Credits/cost surfaces | `/credits` is a prototype. Local dev cost dashboards exist under `/dev/ai-costs`. Billing/credit enforcement is not connected. | Prototype/dev-only |
| Backend data | Code paths exist for optional Supabase-backed Generate Plans references and remote drawing-project AI memory. Only the plans table migration exists; no live remote deployment proof was run. | Incomplete and unproven reproducibility |
| Authentication/security | No in-repo authentication/rate limiting was found on `/api/ai`; project-memory route uses a service-role client with caller-provided project IDs and no ownership check. | Public deployment blocked |
| Product metadata | README is normalized, but `app/layout.tsx` still advertises Create Next App and `package.json` remains `stick-animation-app`. | Scaffold residue; brand decision pending |

## AI Availability Matrix

Code-verified in `src/lib/ai/drawingAiTaskAvailability.ts` and `src/lib/ai/drawingSoundAvailability.ts`:

| Task | UI/code assets | Execution |
| --- | --- | --- |
| `generate-plans` | Present and default-selected | Temporarily disabled |
| `generate-frames` | Present | Enabled |
| `generate-sounds` | Present | Temporarily disabled; sound flags false |
| `other` | Present | Temporarily disabled |

The default preference is therefore inconsistent with the enabled-task matrix.

## Quality Baseline

The historical 2026-08-09 baseline is retained below, followed by the accepted Phase 1.5 focused proof:

| Check | Result |
| --- | --- |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Pass |
| `npm run lint` | Fail: 6 errors, 73 warnings |
| `validateDrawingAiControlPreferences.ts` | Pass |
| `validateDrawingProjectAiMemory.ts` | Pass |
| `validateDrawingProjectAiMemoryRouteSafety.ts` | Pass |
| `validateTimelinePlaybackSmoothing.ts` | Pass |
| Final Git diff whitespace checks | Pass after six whitespace-only findings were removed following the exact-state anchor commit |
| Three compile-based sound/shutdown validators | Fail before assertions due divergent TypeScript compilation settings |
| Current production build | Unproven; existing `.next` output predates current source |
| Conventional unit/E2E test suite | Absent |
| CI/pre-commit gate | Absent |
| `npm run test:spec0001-browser` | Pass: real app, one mocked Drawing POST across `1440x900` then `1024x768`, 40 operations, 13 screenshots, 37 negative cases, browser/server/WebSocket denial, 152-file production scan, and all cleanup paths |
| Phase 1.5 technical manifest | Pass: 7 receipts and 49 artifacts independently validated; SHA-256 `da2dd8cff32367a548a2e7d2e4e789fcf1a4dd129e9dc6200e25650f586f9fc9` |

The exact lint failures, validator caveats, and required gates are in `testing_workflow.md`.

## Highest-Risk Surfaces

- `src/lib/ai/generateFramesRuntime.ts` — 15,269 lines
- `src/components/workspace/DrawingCanvas.tsx` — 10,262 lines
- `src/lib/ai/plansTraining.ts` — 9,650 lines
- `src/components/workspace/DrawingWorkspace.tsx` — 8,629 lines
- `src/lib/ai/drawingFrameExecutor.ts` — 6,458 lines
- `app/api/ai/route.ts` — 6,174 lines
- `src/lib/ai/drawingAiPrompting.ts` — 6,160 lines

These files combine multiple responsibilities and must not be casually refactored while making an unrelated change.

## Code-Verified Constraints and Limitations

The source establishes the following facts. Their user-visible severity was not reproduced in this audit unless stated above:

- canvas/project geometry is derived from host viewport size, a 4.6× authoring world, and device-pixel ratio rather than a stable document resolution; six authoring canvases each allocate `host × 4.6 × DPR` dimensions, plus a separate playback canvas
- saved frames set live `bitmap` and `tweenEndBitmap` fields to `null` and rely on compact WebP preview URLs targeted to at most 1,280 px and 72,000 URL characters; reload decodes at the encoded natural size and centers the result
- playback composites all layers in reverse order and draws text; paused editing clears background/foreground surfaces and restores only the active-layer raster
- current-frame PNG export composites raster bitmaps only, uses the full authoring-world bitmap dimensions, omits text, and does not crop to the camera stage; project preview generation also uses raster bitmaps only
- AI panel messages and follow-up state are React-session state; control preferences persist separately, and compact animation-project AI memory is a different store
- imported reusable assets and library symbols are session-only collections; committed raster pixels may persist in frames, but the reusable entries are absent from `DrawingProjectData`
- the workspace action-plan executor implements only `save-project`, `export-current-frame`, and `attach-sound-option-to-frame`; other contract actions return `false`
- AI frame placement receives the full current authoring-canvas dimensions, not a canonical camera-stage coordinate system
- localStorage quota fallback removes project thumbnails but does not remove the largest inline frame, audio, or tween payloads

## Risks Requiring Dedicated Reproduction and Specs

- visible save/reopen downscaling, geometry shifts, or text/raster fidelity loss
- memory pressure from the authoring-world/DPR canvas model and snapshot history
- canvas loss during resize outside the exact Phase 1.5 generated-frame settlement path; that one protected path is now proven fixed, but broad document-resolution/resize fidelity remains unproven
- edit/playback/export divergence in real multi-layer projects
- drawing/stick timeline drift caused by duplicated implementations

These are not authorized fixes. Reproduce each target flow, write a spec, and protect neighboring behavior before repair.

## Current Work State

- Active implementation spec: [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md), **Approved** by Arthur on 2026-08-11
- Active phase status: **Phase 1 — Verified, published, and integrated into canonical `main`. Phase 1.5 — Verified, accepted, and propagated in the dedicated worktree; awaiting separate publication/integration.** Phases 2–7 are **Unauthorized; Not started**. Phase 2 remains blocked until Phase 1.5 is published/integrated and Arthur separately authorizes Phase 2.
- Accepted boundary: D-0009 records OD-01–OD-06 and OD-09 exactly as accepted and OD-07/08/10/11 as approved engineering rules/prerequisites. OD-12–OD-14 remain deferred and unaccepted until the Phase 7 Policy Gate.
- Permanent process state: D-0010 strictly separates future Spec Executor implementation/technical proof from Control Plane Architect propagation/final closeout/publication. A Spec Executor cannot edit canonical memory or Git state. After acceptance and complete executor shutdown, the architect may take exclusive ownership of the same worktree, propagate/close out, stop for review, and publish only under another explicit instruction. The roles never edit one worktree concurrently.
- Current task result: the accepted 27-path implementation binds to aggregate SHA-256 `5976fb700175a3cf5a381bd5a89f9fb0e6a2f124a35490a3e9027e0ad0e083a4`. D-0012 diagnostics uniquely identified `DrawingCanvas.tsx` width assignment as the first clearing writer; all diagnostics were removed and the permanent runtime diff remains one file. Technical proof-manifest SHA-256 is `da2dd8cff32367a548a2e7d2e4e789fcf1a4dd129e9dc6200e25650f586f9fc9`; independent validation passes 49 artifacts, 37 negatives, exact one-mock/two-viewport browser proof, production exclusion, network denial, cleanup, Phase 1's 631 assertions, TypeScript, and honest lint. The Control Plane Architect preserved all accepted implementation bytes and propagated only the exact eight canonical paths.
- Next operational priority: Arthur and the Project Manager review the Control Plane Architect packet. A later explicit publication task may then stage and publish only the exact reviewed 35-path boundary. Do not start Phase 2 before Phase 1.5 is durably integrated and Arthur separately authorizes it. The Phase 7 Policy Gate, external lookups, and paid/live requests remain forbidden.
- Current roadmap phase: Phase 0 — preservation and stabilization

See `SESSION_HANDOFF.md` for the exact next-session start point.
