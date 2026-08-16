# Current State

Status: canonical rolling snapshot
Last verified: 2026-08-16 during the SPEC-0002 Phase 2 proof-contract correction. The hidden V2 contract/storage engine remains Verified, published, and integrated into canonical `main` at exact commit `0416fc3828a863a797ee9f1c3daa8508792ac64a`, parent `82663051b30cdcfd6766cf4714cdeb2306970045`, with message `Implement SPEC-0002 Phase 1 persistence engine` and exactly 42 committed paths. Its accepted technical-manifest SHA-256 remains `2d20a4a63103618505b60cf590835191841d1c1968bc2bc14ef2c953253243a1`, binding 34 implementation paths and 791 assertions; the closeout-manifest SHA-256 remains `b2d50852cffa40dbf3d7535665a12abe66439cfceeffc61d6eb56195ff947b3c`. D-0014 is published/integrated at `8062274a83776e635e8ed81d9cd2c272d068bc56`; Phase 2 remains Authorized/Not started. A stopped Plan-mode executor preflight proved that the former SPEC-0002 §12.8 sent the Phase 2 real-app manifest to the frozen Phase 1-only validator. The corrected proof contract preserves every accepted Phase 1 byte and assigns Phase 2 manifest validation to the already-authorized `scripts/spec0002-browser/validatePhase2.ts`. Visible Drawing Save/Open/Delete behavior remains unchanged because the new engine is still unwired. The accepted SPEC-0001 Phase 1/1.5 implementation, publication, and proof records remain unchanged.
Current Git basis: this correction task started in a clean detached worktree at exact commit `8062274a83776e635e8ed81d9cd2c272d068bc56`; local `main` and local `origin/main` matched that commit at ahead/behind `0/0`, and the index/untracked set were empty. The commit has message `Authorize SPEC-0002 Phase 2` and exactly seven canonical Markdown paths. The frozen Phase 1 validator rejected the former Phase 2 CLI with its Phase 1-only usage contract, and its SHA-256 remained `1b12cdc360f14b3cfb16ff0d8718ec222bcfcd35b9449a87c59506ae371fd1d9`, byte-identical to the accepted Phase 1 publication. This correction is records-only, remains unstaged/unpublished, and must be separately published before Phase 2 execution resumes. The recovery branch was not used or changed.
Frozen starting audit: `baselines/2026-08-09-repository-audit.md`

## Executive Summary

Diamond Animator is a substantial local prototype, not an empty starter and not a production-ready product.

The most developed path is the raster Drawing Workspace: it has drawing tools, layers, a long timeline, playback, history, onion skinning, position-only bitmap motion tweens, text objects, inline sound playback, local project save/open, and a hybrid Generate Frames pipeline that can use a deterministic plan directly or convert structured model output into deterministic Canvas2D artwork.

The Stick Figure Workspace and separate Stick Figure Creator are early functional scaffolds. Their UI exists and parts of a live skeleton graph can be edited, but timeline frames do not yet hold independent pose data, projects cannot be saved/opened, and creator Save is disabled.

SPEC-0001 Phase 1 now adds hidden, unwired V1 Stick contracts and deterministic offline proof: one fixed 11-joint/10-segment humanoid, strict project/manual-action/AI-command formats, canonical WebCrypto hashing, a derived horizontal line head, identical manual/AI animation-content goldens, rejection fixtures, and a receipt/closeout proof harness. The 2026-08-13 correction makes timeline building strictly ordered, binds the applied-wave predicate to the exact starter identities/profile/timing, reruns wave-arm safety on correctly hashed commands, executes the complete invalid matrix, and freezes the full later-phase evidence/live-proof shapes. These contracts are not yet connected to the Workspace, so the visible scaffold behavior above remains unchanged.

SPEC-0001 Phase 1.5 is now Verified, published, and integrated into canonical `main` at `8df64552e29e4170df8000097fe857b7a31dff69`. It adds a permanent developer-only real-browser tester with loopback-only browser/server/child enforcement, isolated storage/profiles, deterministic checked-in font and Drawing fixtures, strict evidence validation, production-exclusion scanning, and complete cleanup. Diagnostics proved `DrawingCanvas.tsx` authoring-canvas width assignment was the first writer clearing generated pixels during settlement/resize; the retained one-file correction skips redundant dimension assignment and preserves/recenters the editable bitmap across an actual resize. Website users have no tester route, page, API, control, asset, warning, or production import.

SPEC-0002 Phase 1 is now Verified, published, and integrated into canonical `main` at `0416fc3828a863a797ee9f1c3daa8508792ac64a`. Its hidden modules define strict V2 records, canonical complete-record byte accounting, exact raster/audio codecs, V1 classification and neighbor-safe cleanup, an injected rollback-safe repository, real IndexedDB transactions/tombstones, and deterministic proof. The five PM-rejected defects were corrected: the exact closed error/Delete contract, fixed-point `storedByteLength`, strict trailing-comma root rejection, over-limit Blob rejection before read/decode, and fresh caller-independent immutable candidates. Nothing imports these modules into the app yet, so website users still see the existing V1 localStorage Save/Open/Delete behavior.

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
| Drawing persistence | Visible Manual Save/Save As still writes the version-1 `localStorage` envelope and replaces live bitmaps with compact previews. Published SPEC-0002 Phase 1 adds an unwired strict V2 IndexedDB engine with lossless semantic assets, safe capacity/preflight, transactional heads, tombstones, and V1 compatibility. | Visible path remains local-only/lossy; hidden V2 engine Verified/published/integrated; Phase 2 wiring unauthorized |
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
| Phase 1.5 tracked-state closeout | Pass: independently validated; SHA-256 `d7d74d9a48e31f997ed772625cc75be53a7d408b96fe093023b50c793c421423` |
| SPEC-0002 Phase 1 technical manifest | Pass: 9 ordered receipts, 34 artifacts, 791 assertions, 12 independent self-tests, TypeScript, exact 6/73 lint baseline with zero Phase 1 findings, and isolated Chrome/IndexedDB proof; SHA-256 `2d20a4a63103618505b60cf590835191841d1c1968bc2bc14ef2c953253243a1` |

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

- Approved active specifications: [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md), approved by Arthur on 2026-08-11; and [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](specs/0002-lossless-local-drawing-save-and-reopen.md), approved by Arthur through D-0013 with Phase 2 separately authorized by D-0014 on 2026-08-16.
- SPEC-0002 evidence: the accepted Phase 1 technical manifest at `output/spec-0002/phase-1/proof-manifest.json` has SHA-256 `2d20a4a63103618505b60cf590835191841d1c1968bc2bc14ef2c953253243a1`, and the tracked-state closeout manifest has SHA-256 `b2d50852cffa40dbf3d7535665a12abe66439cfceeffc61d6eb56195ff947b3c`. The technical manifest independently binds 182 V2 contract, 506 repository, 80 V1 compatibility, and 23 isolated Chrome/IndexedDB assertions; TypeScript passes; lint remains exactly 6 errors/73 warnings with zero Phase 1 findings; all 12 proof-validator self-tests pass. Real app/UI fidelity and failure copy remain unproven because Phase 1 is intentionally unwired.
- Active phase status: **SPEC-0001 Phase 1 and Phase 1.5 — Verified, published, and integrated; SPEC-0002 Phase 1 — Verified, published, and integrated; SPEC-0002 Phase 2 — Authorized; Not started.** D-0014 is published at `8062274a83776e635e8ed81d9cd2c272d068bc56`; the proof-contract correction must be reviewed and separately published before execution resumes. SPEC-0001 Phase 2 and later phases remain **Unauthorized; Not started**. No Phase 2 Spec Executor is active.
- Accepted boundary: D-0009 records OD-01–OD-06 and OD-09 exactly as accepted and OD-07/08/10/11 as approved engineering rules/prerequisites. OD-12–OD-14 remain deferred and unaccepted until the Phase 7 Policy Gate.
- Permanent process state: D-0010 strictly separates future Spec Executor implementation/technical proof from Control Plane Architect propagation/final closeout/publication. A Spec Executor cannot edit canonical memory or Git state. After acceptance and complete executor shutdown, the architect may take exclusive ownership of the same worktree, propagate/close out, stop for review, and publish only under another explicit instruction. The roles never edit one worktree concurrently.
- Publication result: the accepted 34-path implementation plus eight reviewed control-plane paths were committed once as `0416fc3828a863a797ee9f1c3daa8508792ac64a` with parent `82663051b30cdcfd6766cf4714cdeb2306970045` and message `Implement SPEC-0002 Phase 1 persistence engine`, fast-forwarded into clean canonical `main`, and normally pushed. The phase branch, local `main`, local `origin/main`, and live GitHub `main` matched the publication commit; canonical `main` was clean at `0/0`. Ignored proof output was not committed.
- SPEC-0002 activation/conflict result: the executor began from exact canonical base `82663051b30cdcfd6766cf4714cdeb2306970045` in one dedicated worktree, refreshed the conflict audit, and created only the 34 authorized new paths. No SPEC-0001 runtime/tester-core or existing Drawing runtime file overlaps the accepted implementation.
- Publication state: D-0013, the accepted SPEC-0002 Phase 1 implementation, and its reviewed closeout record are published and integrated in canonical `main` at `0416fc3828a863a797ee9f1c3daa8508792ac64a`. GIT-010 is complete.
- Next operational priority: review and separately publish the SPEC-0002 Phase 2 proof-contract correction, then start one new exclusive Plan-mode Phase 2 Spec Executor from the correction publication SHA and refresh its conflict audit. No concurrent executor may touch `app/page.tsx`, Drawing persistence/navigation, or shared browser proof. SPEC-0001 Phase 2 and later phases, the Phase 7 Policy Gate, external lookups, and paid/live requests remain forbidden.
- Current roadmap phase: Phase 0 — preservation and stabilization

See `SESSION_HANDOFF.md` for the exact next-session start point.
