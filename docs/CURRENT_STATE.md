# Current State

Status: canonical rolling snapshot
Last verified: 2026-08-15 for the clean canonical Git basis, stopped Phase 1.5 failure evidence, and Arthur-approved protected Drawing correction boundary; corrected SPEC-0001 Phase 1 contracts/fixtures/offline proof remain verified from 2026-08-13; no new app/browser pass is claimed by this documentation-only approval propagation
Current Git basis: clean synchronized canonical `main` and `origin/main` at `a35a268764c21eedffcf3d82b59718699b62d4d0`, which published and integrated D-0011 after D-0010 at `2029fd07e14b6f48feb6d04e02dbd52ec683d55d`. Phase 1 remains published in `21a88feb65cf1cc51138c9ad4879b962ee468569`; its implementation base was `832d1f93630d7093514af3e81399077ebed696b4`. No recovery branch was used or changed.
Frozen starting audit: `baselines/2026-08-09-repository-audit.md`

## Executive Summary

Diamond Animator is a substantial local prototype, not an empty starter and not a production-ready product.

The most developed path is the raster Drawing Workspace: it has drawing tools, layers, a long timeline, playback, history, onion skinning, position-only bitmap motion tweens, text objects, inline sound playback, local project save/open, and a hybrid Generate Frames pipeline that can use a deterministic plan directly or convert structured model output into deterministic Canvas2D artwork.

The Stick Figure Workspace and separate Stick Figure Creator are early functional scaffolds. Their UI exists and parts of a live skeleton graph can be edited, but timeline frames do not yet hold independent pose data, projects cannot be saved/opened, and creator Save is disabled.

SPEC-0001 Phase 1 now adds hidden, unwired V1 Stick contracts and deterministic offline proof: one fixed 11-joint/10-segment humanoid, strict project/manual-action/AI-command formats, canonical WebCrypto hashing, a derived horizontal line head, identical manual/AI animation-content goldens, rejection fixtures, and a receipt/closeout proof harness. The 2026-08-13 correction makes timeline building strictly ordered, binds the applied-wave predicate to the exact starter identities/profile/timing, reruns wave-arm safety on correctly hashed commands, executes the complete invalid matrix, and freezes the full later-phase evidence/live-proof shapes. These contracts are not yet connected to the Workspace, so the visible scaffold behavior above remains unchanged.

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
| Drawing editor | Brush, eraser, fill, text, shape, knife, select/lasso, assets/symbols, pan/zoom, layers, history, and timeline logic exist in large coupled components. | Substantial prototype |
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

Checks run against the pre-control-plane application source on 2026-08-09:

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
- canvas loss during resize before reliable redraw
- edit/playback/export divergence in real multi-layer projects
- drawing/stick timeline drift caused by duplicated implementations

These are not authorized fixes. Reproduce each target flow, write a spec, and protect neighboring behavior before repair.

## Current Work State

- Active implementation spec: [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md), **Approved** by Arthur on 2026-08-11
- Active phase status: **Phase 1 — Verified, published, and integrated into canonical `main`. Phase 1.5 — Blocked; stopped Executor result unaccepted/unpublished; protected-Drawing correction Approved and Authorized but Not started/resumed.** Phases 2–7 are **Unauthorized; Not started**. Phase 2 remains blocked until Phase 1.5 is Verified, accepted, propagated, separately published, and integrated.
- Accepted boundary: D-0009 records OD-01–OD-06 and OD-09 exactly as accepted and OD-07/08/10/11 as approved engineering rules/prerequisites. OD-12–OD-14 remain deferred and unaccepted until the Phase 7 Policy Gate.
- Permanent process state: D-0010 strictly separates future Spec Executor implementation/technical proof from Control Plane Architect propagation/final closeout/publication. A Spec Executor cannot edit canonical memory or Git state. After acceptance and complete executor shutdown, the architect may take exclusive ownership of the same worktree, propagate/close out, stop for review, and publish only under another explicit instruction. The roles never edit one worktree concurrently.
- Current task result: the stopped Phase 1.5 Executor's corrected tester failed closed after deterministic red Canvas2D pixels appeared and then disappeared at final AI settlement. Read-only failure SHA-256 is `53d34094cff90d2864dd2e5bfdb09cb887bb60326806e8a048e13072a6d6422b`; 33 of 37 negatives completed before the stop; no valid current Phase 1.5 proof manifest exists. D-0012 approves a diagnostic-first correction ceiling limited to `DrawingWorkspace.tsx` and `DrawingCanvas.tsx`, with a permanent change only in the proven smallest subset and a hard stop if another runtime file, broad rewrite, or unrelated behavior change is required. This Control Plane Architect task changed no runtime or tester bytes and did not mutate the stopped worktree.
- Next operational priority: review and separately publish/integrate D-0012 and this approval-state control plane. Only afterward may a separately authorized Plan-mode Phase 1.5 correction Spec Executor take exclusive ownership of the stopped worktree, diagnose first, patch only the proven subset, and rerun the complete proof from clean owned output. Do not start Phase 2. The Phase 7 Policy Gate, external lookups, and paid/live requests remain forbidden.
- Current roadmap phase: Phase 0 — preservation and stabilization

See `SESSION_HANDOFF.md` for the exact next-session start point.
