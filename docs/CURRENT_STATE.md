# Current State

Status: canonical rolling snapshot
Last verified: 2026-08-17 after publication of the urgent SPEC-0002 Save/Save As correction. The original Phase 2 publication remains integrated at `af89b26c89d83eb61f77d91b4a50c105b7c12079`; the realistic-size correction is Verified, published, and integrated in exact 13-path commit `5c36870f7671033e30dc9341ba757e36c6572cc2`, with technical-manifest SHA-256 `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd` and closeout-manifest SHA-256 `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`. SPEC-0002 is complete again. SPEC-0001 compatibility work and SPEC-0003 remain paused/unchanged.
Current Git basis: correction branch `codex/spec-0002-save-crash-correction`, canonical local `main`, local `origin/main`, and live `origin/main` were verified at exact commit `5c36870f7671033e30dc9341ba757e36c6572cc2`, clean and `0/0`. The correction commit has exactly 13 reviewed paths. The protected recovery branch remains unchanged.
Frozen starting audit: `baselines/2026-08-09-repository-audit.md`

## Executive Summary

Diamond Animator is a substantial local prototype, not an empty starter and not a production-ready product.

The most developed path is the raster Drawing Workspace: it has drawing tools, layers, a long timeline, playback, history, onion skinning, position-only bitmap motion tweens, text objects, inline sound playback, local project save/open, and a hybrid Generate Frames pipeline that can use a deterministic plan directly or convert structured model output into deterministic Canvas2D artwork.

The Stick Figure Workspace and separate Stick Figure Creator are early functional scaffolds. Their UI exists and parts of a live skeleton graph can be edited, but timeline frames do not yet hold independent pose data, projects cannot be saved/opened, and creator Save is disabled.

SPEC-0001 Phase 1 now adds hidden, unwired V1 Stick contracts and deterministic offline proof: one fixed 11-joint/10-segment humanoid, strict project/manual-action/AI-command formats, canonical WebCrypto hashing, a derived horizontal line head, identical manual/AI animation-content goldens, rejection fixtures, and a receipt/closeout proof harness. The 2026-08-13 correction makes timeline building strictly ordered, binds the applied-wave predicate to the exact starter identities/profile/timing, reruns wave-arm safety on correctly hashed commands, executes the complete invalid matrix, and freezes the full later-phase evidence/live-proof shapes. These contracts are not yet connected to the Workspace, so the visible scaffold behavior above remains unchanged.

SPEC-0001 Phase 1.5 is now Verified, published, and integrated into canonical `main` at `8df64552e29e4170df8000097fe857b7a31dff69`. It adds a permanent developer-only real-browser tester with loopback-only browser/server/child enforcement, isolated storage/profiles, deterministic checked-in font and Drawing fixtures, strict evidence validation, production-exclusion scanning, and complete cleanup. Diagnostics proved `DrawingCanvas.tsx` authoring-canvas width assignment was the first writer clearing generated pixels during settlement/resize; the retained one-file correction skips redundant dimension assignment and preserves/recenters the editable bitmap across an actual resize. Website users have no tester route, page, API, control, asset, warning, or production import.

Fresh tracing at published Phase 2 activation base `a85690d` found a proof-infrastructure blocker, not a new product defect. `runSpec0001BrowserProof.ts` hard-codes the Phase 1.5 plan and ignores the specified `--plan`; no later-phase registry/action module is loaded; the v1 baseline policy rejects every legitimate Phase 2 dirty set; and the shared SPEC-0001 proof stack hard-codes the historical 6/73 lint tuple while the current base measures 5/73. The current Stick flow also has no built-in figure/independent poses and cannot itself supply Phase 2 manual-wave, gesture, publication, fixture, or checkpoint proof. SPEC-0001 §10.4A defines one exact 23-path, proof-only compatibility correction. PM feasibility review corrected it to use one immutable plan with dirty/clean expectation arrays and Git-derived state, while the catalog pre-authorizes future Phase 2 structure without unknowable hashes. D-0016 records it as Approved/Authorized/Not started and that approval is published/integrated at `6c2973caecb742334fb432bdda8fbc674bb7db42`; implementation has not begun.

SPEC-0002 Phase 1 and the original Phase 2 result remain Verified, published, and integrated, ending at `af89b26c89d83eb61f77d91b4a50c105b7c12079`. A real `1440×900` Drawing project later exposed that workspace Save and V2 Open boxed 60,268,104 typed RGBA bytes per bitmap through `Array.from`, while Save snapshot preparation occurred outside its failure boundary. The accepted correction uses owning typed-byte Save snapshots, typed storage encoding/hydration with legacy `number[]` compatibility, and safe preparation handling. Its exact keyframe → hold → keyframe, Onion Skin, Save/edit/Save, injected preparation failure, Save As, reload, and original/copy reopen flow is Verified, published, and integrated at `5c36870f7671033e30dc9341ba757e36c6572cc2`.

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
| SPEC-0002 Phase 2 Save/Open/Delete flow | In isolated Chrome at `1440×900` and `1024×768`, a representative V1 project opened, saved/migrated to V2, reopened with exact raster/tween/motion/text/timing/WAV content, exercised Save As/rename/duplicate/Delete/failures, and preserved the current editor/last-good project on rejection | Live verified and published/integrated on 2026-08-17 |
| SPEC-0002 realistic-size Save correction | In isolated Chrome at `1440×900`, two `4563×3302` keyframe bitmaps separated by a held frame and Onion Skin enabled passed Save, edit/Save again, safe injected preparation failure with no storage publication, Save As, reload, and original/copy reopen with matching dimensions/digests and zero page/range/Next-overlay errors | Verified, published, and integrated on 2026-08-17 in `5c36870f7671033e30dc9341ba757e36c6572cc2` |

Not exercised as broader product acceptance: general drawing gestures, the full legacy tween acceptance suite, export download, cloud/autosave, paid AI calls, Supabase, non-Chrome browsers, or deployment. The Phase 2 proof covers only its exact representative content/playback/operations/failure contract.

## Subsystem Status

| Subsystem | Current reality | Status |
| --- | --- | --- |
| App shell/navigation | Main screens are switched by local React `view` state in `app/page.tsx`, not URL routes. New and Open are wired. My Project, Tutorials, AI Assistant, Export, AI Project Finalizer, and AI Credits cards are inert. Drawing Workspace has no in-app exit callback. | Partial |
| Drawing editor | Brush, eraser, fill, text, shape, knife, select/lasso, assets/symbols, pan/zoom, layers, history, and timeline logic exist in large coupled components. The Phase 1.5 narrow `DrawingCanvas` correction preserves the editable bitmap through the proven Generate Frames settlement/viewport-resize path. | Substantial prototype; protected Phase 1.5 path verified |
| Drawing timeline/playback | Frame/keyframe/blank/hold/tween cells, FPS, playback, layer operations, copy/paste, onion skin, and sound attachments exist. | Code-present and regression-sensitive; full acceptance untested |
| Motion tween | V1 supports whole-bitmap X/Y translation with explicit start/end data. A detailed legacy V1 spec is provisionally promoted for reconciliation, not newly owner-approved. | Implemented; full acceptance suite not rerun in this audit |
| Drawing persistence | Manual Save/Save As writes strict V2 IndexedDB records with lossless raster/audio assets, transactional heads, capacity/preflight checks, truthful save states, and explicit V1 migration after durable publication. A realistic-size boxed-byte crash is corrected with compact owning typed bytes and safe preparation handling. | Original path and urgent correction Verified/published/integrated; local-only by design |
| Drawing autosave | Pointer-up queues an in-memory current-frame snapshot. It does not durably persist the project without explicit Save. | Not durable autosave |
| Export | Home Export is inert. An AI action can export current raster layers as a full authoring-world PNG, but omits text and camera-stage cropping; Other is disabled. Project previews also omit text. No animation/video/native project export exists. | Code path exists; not a usable or fidelity-complete product flow |
| AI Generate Frames | Server performs deterministic analysis and may return clarification/controlled failure, a direct runtime plan, or structured OpenAI generation/recovery; browser code renders successful plans as Canvas2D frames and applies them to the timeline. | Enabled hybrid prototype |
| AI Generate Plans | Prompt/reference and route code exist. Execution is explicitly disabled. | Disabled |
| AI Generate Sounds | Planning/synthesis/reference code exists; both sound flags and task execution are disabled. | Disabled |
| AI Other/actions | Command/action code exists. Execution is explicitly disabled. | Disabled |
| Stick Figure Workspace | UI, timeline metadata, live graph/canvas, some limb-building behavior, and creator entry exist. Timeline frames do not store distinct pose graphs. | Early scaffold |
| Stick workspace AI | A read-only Drawing AI panel is visible, but no stick pose/frame apply executor is wired. | Not usable |
| Stick Figure Creator | Local rig editing UI exists. Save is intentionally disabled and it is not connected to a persisted library. | Incomplete |
| Open Project | Phase 2 asynchronously classifies V2, V1, corrupt, and future Drawing entries; fully validates before mount; and routes rename/duplicate/authoritative Delete through V2 semantics. Stick-project tab still has no persistence path. | Drawing V2 Verified/published/integrated; Stick unchanged |
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
| Historical Phase 1/Phase 1.5 `npm run lint` | Fail: 6 errors, 73 warnings; valid for those accepted proof commits |
| Current canonical `a85690d` `npm run lint` | Fail: 5 errors, 73 warnings; freshly measured in the clean canonical worktree |
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
| SPEC-0002 Phase 2 technical manifest | Pass: 12 ordered receipts, 14 artifacts, 889 assertions, 20 independent negative classes, both browser modes at both viewports, TypeScript, 5-error/73-warning lint result with zero changed-line findings, exact path/index/diff checks, zero real/external requests, and cleanup; SHA-256 `0a5ea38f8146641430d37ddc272fa0b1169181252b596e0ba14886c2bb4f2657` |
| SPEC-0002 urgent Save correction technical manifest | Pass: 12 receipts, 890 assertions, 20 validator mutation classes, 10 protected regressions, exact realistic-size browser flow, TypeScript, focused lint zero, full lint 5 errors/73 warnings with zero changed-line findings, safe preparation failure, zero page/range/overlay errors, and zero external/provider requests; SHA-256 `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd` |
| SPEC-0001 Phase 2 proof compatibility | Blocked by code-observed runner/allowlist/extension/lint-contract mismatch; §10.4A correction Approved/Authorized/Not started under D-0016 published at `6c2973caecb742334fb432bdda8fbc674bb7db42`; no correction or Phase 2 byte changed |

`testing_workflow.md` retains the accepted historical proof detail. The current 5/73 measurement and proposed version-2 comparison gate are recorded in SPEC-0001 §10.4A until that correction is separately accepted and implemented.

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
- valid V1 projects may already contain reduced-quality preview-backed artwork that cannot be retroactively recovered; accepted Phase 2 preserves that reopened fidelity when explicitly migrating to V2 and makes authoritative V2 content independent of card previews
- playback composites all layers in reverse order and draws text; paused editing clears background/foreground surfaces and restores only the active-layer raster
- current-frame PNG export composites raster bitmaps only, uses the full authoring-world bitmap dimensions, omits text, and does not crop to the camera stage; project preview generation also uses raster bitmaps only
- AI panel messages and follow-up state are React-session state; control preferences persist separately, and compact animation-project AI memory is a different store
- imported reusable assets and library symbols are session-only collections; committed raster pixels may persist in frames, but the reusable entries are absent from `DrawingProjectData`
- the workspace action-plan executor implements only `save-project`, `export-current-frame`, and `attach-sound-option-to-frame`; other contract actions return `false`
- AI frame placement receives the full current authoring-canvas dimensions, not a canonical camera-stage coordinate system
- canonical `main` contains the published Phase 2 bounded V2 IndexedDB Save/Open/Delete authority; the older pre-Phase-2 localStorage-only claim is historical

## Risks Requiring Dedicated Reproduction and Specs

- save/reopen behavior outside the exact accepted representative V2 fixture, especially already-lossy V1 source content and broader viewport/document-geometry combinations
- memory pressure from the authoring-world/DPR canvas model and snapshot history
- canvas loss during resize outside the exact Phase 1.5 generated-frame settlement path; that one protected path is now proven fixed, but broad document-resolution/resize fidelity remains unproven
- edit/playback/export divergence in real multi-layer projects
- drawing/stick timeline drift caused by duplicated implementations

These are not authorized fixes. Reproduce each target flow, write a spec, and protect neighboring behavior before repair.

## Current Work State

- Approved active specifications: [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md), approved by Arthur on 2026-08-11; and [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](specs/0002-lossless-local-drawing-save-and-reopen.md), approved by Arthur through D-0013 with Phase 2 separately authorized by D-0014 on 2026-08-16.
- SPEC-0002 evidence: the original phases remain bound by their published manifests and closeouts. The urgent correction is bound by exact base `92e6143641c5dd2542277052fe21c6bad742139f`, exactly seven implementation/proof paths within exact 13-path publication commit `5c36870f7671033e30dc9341ba757e36c6572cc2`, 12 receipts, 890 assertions, 20 validator mutations, 10 protected regressions, technical-manifest SHA-256 `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`, and closeout-manifest SHA-256 `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`.
- Active phase status: **SPEC-0002 remains Approved and implemented; its urgent Save correction is Verified, published, integrated, and complete.** No new SPEC-0002 phase is authorized. SPEC-0001 compatibility work is the next dependency-safe implementation after this record reconciliation is reviewed/published; SPEC-0003 remains paused/unchanged. No implementation executor is active in this worktree.
- Accepted boundary: D-0009 records OD-01–OD-06 and OD-09 exactly as accepted and OD-07/08/10/11 as approved engineering rules/prerequisites. OD-12–OD-14 remain deferred and unaccepted until the Phase 7 Policy Gate.
- Permanent process state: D-0010 strictly separates future Spec Executor implementation/technical proof from Control Plane Architect propagation/final closeout/publication. A Spec Executor cannot edit canonical memory or Git state. After acceptance and complete executor shutdown, the architect may take exclusive ownership of the same worktree, propagate/close out, stop for review, and publish only under another explicit instruction. The roles never edit one worktree concurrently.
- Publication result: the urgent SPEC-0002 correction was committed as `5c36870f7671033e30dc9341ba757e36c6572cc2`, parent `92e6143641c5dd2542277052fe21c6bad742139f`, message `Fix realistic Drawing project Save crash`, with exactly 13 reviewed paths. The clean permanent tester passed with 40 operations, 13 screenshots, one deterministic mocked Drawing request, and no real/external request. The correction branch, local `main`, local `origin/main`, and live remote `main` matched cleanly at `0/0`; both correction and canonical worktrees were clean.
- D-0015 publication state: exact eight-path activation commit `a85690de9396cf97e3063005cbb6da85f109ae1d`, parent `af89b26c89d83eb61f77d91b4a50c105b7c12079`, message `Authorize SPEC-0001 Phase 2`; GIT-012 is complete. The stopped Phase 2 worktree at that SHA is clean and changed nothing.
- Paused work: the SPEC-0001 tester compatibility correction and SPEC-0003 remained unchanged throughout the urgent SPEC-0002 correction; neither was resumed, copied, merged, or touched.
- Next operational priority: review and separately publish this post-publication records reconciliation, then return dependency-safe implementation work to the D-0016-approved SPEC-0001 Phase 1.5 tester compatibility correction in a new dedicated Plan-mode Spec Executor. SPEC-0003 remains paused/unchanged.
- Current roadmap phase: Phase 0 — preservation and stabilization

See `SESSION_HANDOFF.md` for the exact next-session start point.
