# Current State

Status: canonical rolling snapshot
Last verified: 2026-08-19 from exact clean canonical Phase 5 activation commit `245ac7e8bceeca76b522ff21c4327fa0219a3805`, message `Authorize SPEC-0001 Phase 5`. Phase 4 remains **Verified, published, and integrated** in exact 30-path implementation commit `71841e96499f7627139c53d87114bba65e19d29d`, parent `62f046adff7418d2e644365fc04bd5d6312dcca9`. Its exact 22-path technical projection, 12 successful receipts, 61 bound artifacts, and manifest independently revalidate at SHA-256 `d34d589373713ac7930984aeb3ef0640539316c00e1f510cf8d798aee931bf46`; the browser runner is SHA-256 `353f4937972d30b1959f1c7aee3075f5ebafb308d04a778db69372969e7b906f`. D-0024 keeps Phase 5 **Authorized; Not started**; D-0025 corrects only its tester-permission ceiling. Phases 6 and 7 remain **Unauthorized; Not started**. SPEC-0002 remains complete/protected; SPEC-0003 remains separate, Proposed, inactive, and untouched.
Current Git basis: canonical `main` and `origin/main` were clean and equal to `245ac7e8bceeca76b522ff21c4327fa0219a3805` before this documentation-only correction worktree was created. A fresh Phase 5 executor booted from that exact SHA and stopped before edits when it proved the published tester graph could not register/run/record/validate/finalize mandatory `phase-5/v1` evidence. This correction changes canonical documentation only; Phase 5 implementation remains not started. Its replacement executor base is intentionally unset until this correction is separately published and integrated.
Frozen starting audit: `baselines/2026-08-09-repository-audit.md`

## Executive Summary

Diamond Animator is a substantial local prototype, not an empty starter and not a production-ready product.

The most developed path is the raster Drawing Workspace: it has drawing tools, layers, a long timeline, playback, history, onion skinning, position-only bitmap motion tweens, text objects, inline sound playback, local project save/open, and a hybrid Generate Frames pipeline that can use a deterministic plan directly or convert structured model output into deterministic Canvas2D artwork.

The Stick Figure Workspace and separate Stick Figure Creator are early functional scaffolds. The published §10.5A runtime restores the accepted compact workspace/timeline and independently editable keyframe experience. Published Phase 3 adds Stick Undo/Redo, explicit browser-local Save/Open, and paused onion rendering without changing Creator Save, which remains disabled.

SPEC-0001 Phase 1 added hidden V1 Stick contracts and deterministic offline proof: one fixed 11-joint/10-segment humanoid, strict project/manual-action/AI-command formats, canonical WebCrypto hashing, a derived horizontal line head, identical manual/AI animation-content goldens, rejection fixtures, and a receipt/closeout proof harness. The published Phase 2 runtime later connected a bounded subset to the Workspace; §10.5A defines the single correction to that rejected visible realization without rewriting the Phase 1 contracts or history.

SPEC-0001 Phase 1.5 is now Verified, published, and integrated into canonical `main` at `8df64552e29e4170df8000097fe857b7a31dff69`. It adds a permanent developer-only real-browser tester with loopback-only browser/server/child enforcement, isolated storage/profiles, deterministic checked-in font and Drawing fixtures, strict evidence validation, production-exclusion scanning, and complete cleanup. Diagnostics proved `DrawingCanvas.tsx` authoring-canvas width assignment was the first writer clearing generated pixels during settlement/resize; the retained one-file correction skips redundant dimension assignment and preserves/recenters the editable bitmap across an actual resize. Website users have no tester route, page, API, control, asset, warning, or production import.

Fresh tracing at published Phase 2 activation base `a85690d` found a proof-infrastructure blocker, not a new product defect: the runner ignored the specified `--plan`, loaded no later-phase registry/action module, rejected legitimate later-phase dirty sets, and the shared v1 proof stack froze the historical 6/73 lint tuple. The accepted §10.4A correction now preserves the historical no-plan/v1 behavior while adding a fail-closed v2 catalog → plan → registry → declarative-adapter chain, real Git-derived dirty/clean modes, versioned proof receipts/manifests, isolated base/result lint measurement, and exact cleanup/production/network controls. Its dirty proof derives `dirty-executor` from the exact 23-path set and binds immutable dirty-23/clean-empty expectations. This compatibility proof remains infrastructure evidence only.

The original published SPEC-0001 Phase 2 runtime was not the accepted visible destination. Fresh isolated browser inspection reproduced Arthur's report: a 150px timeline with twelve large cells, an automatic built-in figure, reduced/reordered right-panel tools, changed top-bar presentation, restricted frame actions, disabled layer operations, and Creator that locked after editing. Exact historical render/source at `68338d54542bbfd3fb1f0fab06548f0424871f80` established the required compact one-cell empty workspace, original menus/fonts/layout, four original right-panel tabs/tools/order, canvas/toolbar behavior, and Creator access. Arthur visibly accepted the §10.5A result restoring that shell and adding Drawing-style applicable timeline behavior with independently editable Stick keyframes. Its registered plan reports 15/15 actions, two compact screenshots, five protected groups, and revalidated proof-manifest SHA-256 `edda3028b9fbe2759e31059455f16cc3ee02ac9b242149107454071dae62de90`; the exact 29-path correction is published/integrated at `edfb3dea023119b91336e6e5da645d4982a9f068`.

The D-0020 registration/Creator correction and later proof-blocker amendment are integrated into the published Phase 3 result. The exact 30-path technical set proves Stick Undo/Redo, explicit local Save/Open, and D-0018 onion on the §10.5A shell. Its recorder completed all 11 commands, including the awaited async Drawing-memory validator, deterministic history/persistence/onion checks, TypeScript, zero lint regression, Phase 3 registration self-test, inherited tester run, and full Phase 3 browser plan. The browser result passed 71 closed actions, 7 checkpoints, 4 screenshots at `1440×900` and `1024×768`, all five protected groups, zero non-loopback/provider requests, and complete cleanup. Arthur visibly accepted the result. Creator remains usable; no lock field/copy, automatic content, redesign, or Drawing runtime edit was added.

The accepted Phase 4 implementation adds one validated Stick command transaction and deterministic Workspace adapter without adding chat, a provider route, or an AI-only editor. Preview and request states are non-mutating; Apply projects the checked-in canonical wave through the shared editable timeline/history path and publishes one complete root/history entry. Exact duplicates, conflicting redelivery, Cancel/Abort, authored-change and project-switch races, and five injected failures are terminal and fail closed. The permanent runner passed 105 closed actions, 31 checkpoints, 2 screenshots, five protected groups, zero browser/server/child non-loopback attempts, and full source/anchor/process/port cleanup. Arthur then accepted the exact worktree's Play, atomic Undo/Redo, manual joint-drag, and Creator/Back behavior.

Fresh Phase 5 feasibility tracing found an infrastructure authorization gap, not a product defect. Section 10.8 already requires guarded real-route raw HTTP and a registered Phase 5 proof bundle, but the catalog has exactly four entries through `phase-4/v1`; v4 schemas freeze four authorizations; the typed tester contract and runner support only v2-v4 action/adapter graphs; and the recorder, independent validator, and finalizer branch only through Phase 4. The runner's current `/api/ai` proof intercepts Drawing responses and asserts zero real-route requests. D-0025 therefore preserves the original 14 Phase 5 product/fixture/validator paths and adds exactly 10 shared catalog/v5-schema/runner/contract/recorder/validator/finalizer paths. The complete ceiling is exactly 24 tracked paths. Phase 5 is route-only: `stick-ai-raw-route-cases.json` is its v5 registry, raw bytes travel through guarded Node loopback HTTP to the real route, and no action adapter, workspace port, page, route, control, asset, writable chat, or visible UI is added.

The older SPEC-0002 browser command is not applicable to this correction because its frozen expected SPEC-0001 runner hash `b15c9024146fa3155d319f67864e618afa72d6567ec62091aa34bd12ea42560d` differs from current `17056ea7b6bedcc297f57f3a7fc3f681a52ace23567921097ddf9bdf82ed97da` and the closeout audit proves zero protected Drawing/SPEC-0002/Open/storage/`app/page.tsx` or relevant shared-dependency runtime-byte change. It is not claimed as passed. Replacement protection is the exact zero-diff audit, published SPEC-0002 proof, Arthur's current human Drawing Save verification, and §10.5A protected groups. The two temporary alternative harness attempts remain diagnostic only and are excluded from accepted proof.

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
| SPEC-0001 Phase 1.5 compatibility proof | The accepted dirty proof executed 27 closed synthetic actions, 4 checkpoints, 1 screenshot, fixture/manual-wave-shaped/drag-cancel/competing-publication operations, and five protected real-app regression groups. Publication then passed the clean no-plan gate with 40 operations, 13 screenshots, 4 tester-driver messages, and exactly one deterministic mocked Drawing POST, plus the clean synthetic gate with observed dirty set `[]`, exact 23-path base projection, and matching catalog/plan/registry/adapter bindings. | Verified, published, and integrated on 2026-08-17 at `e07268cc80751baba99ac6708a1e8a93d4fc4756`; product Phase 2 explicitly not claimed |
| SPEC-0001 Phase 2 no-AI Stick wave | Real Home → New → Stick built the exact three-pose/12-frame wave through visible controls, proved independent keyframe poses and held spans, representative head/body/arm/leg edits including a held-frame edit, line-head rendering, publication/gesture safety, playback, and five protected regression groups in 86 actions with 4 checkpoints and 1 screenshot. | Verified, published, and integrated at `adbda9dd4f42a103c3c5af41ccc19b110b6825c0`; zero real API/non-loopback attempts |
| SPEC-0001 §10.5A UI correction | Isolated current and exact `68338d…` historical renders established the baseline. Arthur visibly accepted the stopped executor result; its registered plan reports 15/15 actions, two compact screenshots, five protected groups, and manifest SHA-256 `edda3028b9fbe2759e31059455f16cc3ee02ac9b242149107454071dae62de90`. The Control Plane Architect revalidated the manifest, accepted hashes, and zero protected-runtime diff. | Verified, published, and integrated at `edfb3dea023119b91336e6e5da645d4982a9f068` |
| SPEC-0001 Phase 3 | Exact 30-path technical result plus eight canonical record paths are published in `3fe3a5487389647b67216e9466121e00f1a73856`. The fresh 11-command manifest passes independent validation at SHA-256 `07bd09c413a28ffcc706be85d00d1d4466cde1e336daceab23d9a1617153b675`; its browser result records 71 actions, 7 checkpoints, 4 screenshots, and five protected groups. Arthur completed visible human review and accepted the result. | Verified, published, and integrated |
| SPEC-0001 Phase 4 | The exact 22-path transaction result passed 138 deterministic Phase 4 assertions, all earlier Stick/Drawing regressions, TypeScript, lint non-regression at `5/72 → 5/72` with zero changed-line/new-file findings, diff proof, and 105 browser actions with 31 checkpoints, 2 screenshots, five protected groups, zero non-loopback traffic, and complete cleanup. Arthur accepted Play, atomic Undo/Redo, manual joint drag, and Creator/Back in the exact pre-publication worktree. The 22 technical and eight reviewed record paths were published together in `71841e96499f7627139c53d87114bba65e19d29d`. | Verified, published, and integrated |

Not accepted as broader product completion: Phase 5 server/mock behavior is authorized but not implemented; writable Stick chat, provider behavior, and Phases 6–7 remain absent. General Drawing behavior beyond the five named protected groups, the full legacy tween suite, export download, cloud/autosave, paid AI calls, Supabase, non-Chrome browsers, and deployment remain unproven. Arthur's separate manual verification that Drawing Save works remains human evidence, while the Phase 4 browser plan protects only its five named groups.

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
| Stick Figure Workspace | Canonical `main` contains the published §10.5A compact one-blank-cell/empty-canvas shell, editable Drawing-style Stick timeline, restored controls, usable Creator path, truthful Undo/Redo, explicit browser-local Save/Open, D-0018 onion, and Phase 4's validated command transaction adapter with one atomic wave publication through the shared editor/history path. | Phase 4 Verified/published/integrated; user-facing AI remains unavailable |
| Stick workspace AI | A read-only Drawing AI panel remains visible. The published Phase 4 transaction is available only through the deterministic internal adapter; no writable chat, API/provider route, or visible Preview/Apply UI exists. | Transaction foundation Verified/published/integrated; user-facing AI remains unavailable |
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
| Accepted §10.4A base/result `npm run lint` comparison | Fail: 5 errors, 73 warnings in both measured states, with zero changed-line/new-file findings; this is non-regression evidence, not a clean lint pass |
| `validateDrawingAiControlPreferences.ts` | Pass |
| `validateDrawingProjectAiMemory.ts` | Pass in the accepted Phase 3 proof after the bounded validator-only correction awaited the current async IndexedDB-backed storage contract; Drawing runtime/storage bytes remain unchanged |
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
| SPEC-0001 Phase 1.5 compatibility technical manifest | Pass: 9 ordered receipts, 43 bound artifacts, exact 23-path dirty state, 37 compatibility negatives, 27 synthetic actions, 4 checkpoints, 1 screenshot, 5 protected regression groups, Phase 1's 631 assertions, TypeScript, base/result lint `5/73` with zero changed-line/new-file findings, zero real/non-loopback requests, and complete success/failure/`SIGINT`/`SIGTERM` cleanup; SHA-256 `53202d21ba7248e46a3e3423a623fbc785b5c3beedd6dd4d2a984b37614cffe8`; Verified/published/integrated at `e07268cc80751baba99ac6708a1e8a93d4fc4756` |
| SPEC-0001 §10.4A clean no-plan publication gate | Pass: clean committed branch, 40 ordered operations, 13 screenshots, 4 tester-driver messages, exactly one deterministic mocked Drawing POST, zero real API requests, and zero non-loopback violations; Drawing Save was not exercised |
| SPEC-0001 §10.4A clean synthetic-plan publication gate | Pass: derived `clean-committed`, observed dirty set `[]`, selected `cleanExpectedPaths: []`, exact accepted 23-path base-to-HEAD ceiling projection, and catalog/plan/registry/adapter bindings matching the accepted dirty proof; 27 closed actions, 4 checkpoints, 1 screenshot, and `productPhaseClaimed: false` |
| Historical SPEC-0001 Phase 2 technical proof | Pass for the published bounded-wave implementation only: exact 27-path result, 277 Phase 2 assertions, 631 Phase 1 regressions, TypeScript, measured lint, diff check, 86 browser actions, and zero real API/non-loopback attempts. Arthur's later visible rejection means this is not §10.5A acceptance evidence. |
| SPEC-0001 §10.5A accepted closeout | Pass in the dedicated worktree: exact 20-path accepted implementation/proof result; registered plan 15/15 actions, two compact screenshots, five protected groups; 311 deterministic timeline assertions; 631 Phase 1 regressions; TypeScript pass; focused lint zero; measured lint unchanged at 5 errors/72 warnings with zero changed-line/new-file findings; diff checks pass; manifest SHA-256 `edda3028b9fbe2759e31059455f16cc3ee02ac9b242149107454071dae62de90`. The obsolete SPEC-0002 command is `not-applicable`, not passed, under the exact zero-protected-runtime-diff rule. |
| §10.5A correction-specific tracked-state closeout | Pass | Accepted finalizer source SHA-256 `e6795e9f686117d89824bea4f9de3ed766077ba9a8d00c51c27b074708c396f9` adds only the explicit `--purpose=phase-2-ui-restoration-correction` mode while preserving the historical/default path. The repaired finalizer validates the accepted technical manifest and 20/20 hashes, exact 29-path tracked state, empty index, 16/16 protected zero diffs, sole obsolete SPEC-0002 runner-hash mismatch, 15/15 browser actions, two screenshots, five protected groups, and zero non-loopback attempts. It created and revalidated the ignored `output/spec-0001/phase-2-ui-restoration-correction/proof-closeout-manifest.json`; the historical Phase 2 bundle remains untouched. |
| SPEC-0001 Phase 4 technical manifest | Pass: exact base/HEAD `62f046adff7418d2e644365fc04bd5d6312dcca9`, exact 22-path dirty projection, 12 successful receipts, 61 bound artifacts, 138 Phase 4 transaction assertions, inherited Phase 3/2/1 and Drawing regressions, TypeScript, lint `5/72 → 5/72` with zero changed-line/new-file findings, and diff proof; SHA-256 `d34d589373713ac7930984aeb3ef0640539316c00e1f510cf8d798aee931bf46`. |
| SPEC-0001 Phase 4 browser result | Pass: runner SHA-256 `353f4937972d30b1959f1c7aee3075f5ebafb308d04a778db69372969e7b906f`; 105 closed actions, 31 checkpoints, 2 screenshots, five protected groups, `productPhaseClaimed: true`, zero browser/server/child non-loopback attempts, and exact anchor/source/context/gate/intercept/process/port cleanup. |

`testing_workflow.md` retains the accepted historical proof detail and now records the Verified/published/integrated version-2 comparison/extension contract and both clean publication gates. The current repository lint remains 5 errors/73 warnings; the accepted correction proves only no worsening and zero changed-line/new-file findings, not a clean repository lint run.

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
- Active SPEC-0001 status: the D-0017 §10.5A correction remains **Verified, published, and integrated** at `edfb3dea023119b91336e6e5da645d4982a9f068`; Phase 3 remains published/integrated at `3fe3a5487389647b67216e9466121e00f1a73856`; D-0022's Phase 4 activation is published/integrated at `62f046adff7418d2e644365fc04bd5d6312dcca9`; and the exact Phase 4 implementation/control-plane result is **Verified, published, and integrated** at `71841e96499f7627139c53d87114bba65e19d29d`, with technical-manifest SHA-256 `d34d589373713ac7930984aeb3ef0640539316c00e1f510cf8d798aee931bf46`. D-0024's Phase 5 activation is published at `245ac7e8bceeca76b522ff21c4327fa0219a3805`; D-0025 keeps Phase 5 **Authorized; Not started** and defines the exact 24-path corrected ceiling. Replacement execution waits for this correction's separate publication SHA. Phases 6 and 7 remain **Unauthorized; Not started**. SPEC-0002 remains complete/protected; SPEC-0003 remains separate Proposed/inactive and untouched.
- Accepted boundary: D-0009 records OD-01–OD-06 and OD-09 exactly as accepted and OD-07/08/10/11 as approved engineering rules/prerequisites. OD-12–OD-14 remain deferred and unaccepted until the Phase 7 Policy Gate.
- Permanent process state: D-0010 strictly separates future Spec Executor implementation/technical proof from Control Plane Architect propagation/final closeout/publication. A Spec Executor cannot edit canonical memory or Git state. After acceptance and complete executor shutdown, the architect may take exclusive ownership of the same worktree, propagate/close out, stop for review, and publish only under another explicit instruction. The roles never edit one worktree concurrently.
- Publication result: the urgent SPEC-0002 correction was committed as `5c36870f7671033e30dc9341ba757e36c6572cc2`, parent `92e6143641c5dd2542277052fe21c6bad742139f`, message `Fix realistic Drawing project Save crash`, with exactly 13 reviewed paths. The clean permanent tester passed with 40 operations, 13 screenshots, one deterministic mocked Drawing request, and no real/external request. The correction branch, local `main`, local `origin/main`, and live remote `main` matched cleanly at `0/0`; both correction and canonical worktrees were clean.
- Phase 2 activation publication: exact seven-path canonical-main commit `68338d54542bbfd3fb1f0fab06548f0424871f80`, parent `e07268cc80751baba99ac6708a1e8a93d4fc4756`, message `Activate SPEC-0001 Phase 2 after tester compatibility`; GIT-016 is complete and this is the accepted implementation base.
- Accepted compatibility evidence: exact implementation base `8b663d2b80144e9aeba9ea0ecf0f78ccefa78926`; exact verified technical/publication prerequisite and tested runtime/proof foundation `e07268cc80751baba99ac6708a1e8a93d4fc4756`; 23 implementation paths; manifest SHA-256 `53202d21ba7248e46a3e3423a623fbc785b5c3beedd6dd4d2a984b37614cffe8`; closeout SHA-256 `8972c63420728183ad27454cb5484ab0859361b8fd92797f0531bdc79a773b30`; both clean committed publication gates passed; package/lock/product bytes unchanged.
- Accepted Phase 2 evidence: exact 27 technical paths, prior-definition aggregate SHA-256 `d5526fcba1e0480a20164ab73d8391f49edf6fc66378d641e8b2c0c951fcabd2` over the 4,351-byte canonical binding input, and 33,410-byte technical-manifest SHA-256 `87a24054299da3037e6682bc50595fd8be3c7004222287c3433156264b322212`. An executor packet's alternative stable-JSON digest beginning `1dd18` used the wrong reporting definition; its addendum confirmed no technical-byte or proof error. Drawing Save is not automated coverage; Arthur's manual verification remains separate.
- Phase 2 publication result: exact commit `adbda9dd4f42a103c3c5af41ccc19b110b6825c0`, parent `68338d54542bbfd3fb1f0fab06548f0424871f80`, message `Implement SPEC-0001 Phase 2 independent Stick poses`, and exactly 36 reviewed paths.
- §10.5A publication result: exact commit `edfb3dea023119b91336e6e5da645d4982a9f068`, message `Correct SPEC-0001 Phase 2 Stick timeline`, and exactly 29 reviewed paths. D-0019 activation is published at `45504214dffb528e930194b93fc2ab78dc730ebc`; D-0020 at `54234b7c7b95201e274975a804859fa9c36806a1`; Phase 3 at `3fe3a5487389647b67216e9466121e00f1a73856`; D-0022's seven-path Phase 4 activation at `62f046adff7418d2e644365fc04bd5d6312dcca9`; and Phase 4's exact 30-path implementation/control-plane result at `71841e96499f7627139c53d87114bba65e19d29d`.
- Current roadmap phase: Phase 0 — preservation and stabilization

See `SESSION_HANDOFF.md` for the exact next-session start point.
