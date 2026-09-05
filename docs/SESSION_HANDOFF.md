# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-09-05
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md`, `docs/specs/0002-lossless-local-drawing-save-and-reopen.md`, `docs/specs/0003-tutorials-and-cleaner-home-screen.md`, paused `docs/specs/0004-future-real-ai-animator-requirements.md`, and Approved `docs/specs/0005-professional-shared-stick-motion-engine.md`
SPEC-0004 status: **Phases 1, 2, and timing-only Phase 2.5 are Verified, published, and integrated. The unpublished Phase 2.6 result was rejected and is superseded by SPEC-0005; SPEC-0004 is paused before Phase 3.** GIT-033 through GIT-037 remain complete. D-0043 records the rejected-result truth and initial shared-motion direction; D-0046 corrects SPEC-0005 to eight phases. There is no Phase 2.7; Phases 3–8 remain unauthorized.
SPEC-0005 status: **Phase 1 is Verified, published, and integrated under completed GIT-039 at `2436a9414221e8ee7ef40151284cb8f4e069e828`. GIT-040 published D-0045 in `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`. The first former Phase 2 result was technically green but rejected after Arthur's visible review; none of its code/proof was accepted, propagated, committed, published, or integrated, and its disposable app/worktree was removed. D-0046 restructures the spec and authorizes only a fresh technical-only Phase 2 Body Safety Gate/Foundation as Approved; Authorized; Not started, pending D-0046 publication. After all Phase 2 technical gates pass, Arthur requests one ordinary unchanged-source loopback/non-`3000` app instance served directly from the exact unpublished executor worktree solely to smoke-check existing app behavior; it cannot prove Phase 2 safety.** Phases 3–8 remain Unauthorized/Not started and no executor is active.
Current result: the canonical control plane now defines exactly eight SPEC-0005 phases and the non-bypassable movement-goal → candidate enumeration → important-pose safety → mechanics/required insertion → path/timing bake → post-rounding/post-contact safety → final semantic/continuity → Preview pipeline. This task changes documentation only. Published SPEC-0005 Phase 1 and published SPEC-0004 Phases 1, 2, and timing-only 2.5 remain unchanged; both rejected motion attempts remain unpublished/unintegrated, and SPEC-0004 remains paused before Phase 3.
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Accepted SPEC-0005 Phase 1 Result

D-0044 records Arthur's acceptance of the published SPEC-0001 three-pose wave as the historical readability floor. This is an acceptance of the quality harness, not a claim that Phase 1 changed or improved visible motion. The later shared motion engine, mechanics, natural paths, gait, semantic actions, and planner door remain unimplemented.

The stopped Spec Executor started from exact activation/base/HEAD `2b4f00e7a122c196b2c0600144cd638b461bbb2f`, kept an empty index, and added exactly:

- `scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json`
- `scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json`
- `scripts/spec0005-stick/phase1BrowserProof.ts`
- `scripts/spec0005-stick/recordPhase1Proof.ts`
- `scripts/spec0005-stick/validatePhase1Proof.ts`
- `scripts/validateStickMotionQualityBaseline.ts`

The accepted manifest is `output/spec-0005/phase-1/proof-manifest.json`, exactly 10,011 bytes at SHA-256 `af287680b7ae73fd4c543edf8076d9fbb7fb65474a5d4508f8b17dde56174e84`. The preserved successful validator receipt passed 102 checks. The harness rejected all 13 required bad-motion cases and all 11 material manifest mutations. Desktop and compact browser runs each observed `0..11..0` after one Play and before Pause, in 1,262.4 ms and 1,085.0 ms; total evidence is 26 timestamped geometry samples, six landmarks, 260 limb checks, four images, and zero external/API/provider requests or actionable browser errors. TypeScript, scoped lint, exact scope/diff, and the permanent tester passed; the permanent tester recorded 40 operations and 13 screenshots with zero real API/non-loopback/provider traffic.

After Arthur's review, later local GETs appended 200 bytes to the live `review-server.log`, and normal process termination appended a seven-byte terminal-reset sequence, leaving 501 bytes total. Its original 294 manifest-bound bytes remain an exact prefix at SHA-256 `637d481e2da0de2923489e85b4c8cd35db6456360d20e86c275a9aeb67a392ae`; all other 12 artifacts and all six source files match their complete manifest bindings. CPA closeout stopped only PID/PGID `90076`, verified port `58451` closed, removed only `/var/folders/6l/2_fgg86s2h3_y9wg5npsfzyh0000gn/T/diamond-spec0005-phase1-wave-review-GTk0su`, and preserved durable ignored evidence.

GIT-039 is complete in commit `2436a9414221e8ee7ef40151284cb8f4e069e828`, parent `2b4f00e7a122c196b2c0600144cd638b461bbb2f`, message `Publish SPEC-0005 Phase 1 quality gate`, with exactly 20 paths. Local `main`, local `origin/main`, live GitHub `main`, and the clean publication branch matched at `0/0`. The clean permanent tester passed 40 operations, 13 screenshots, four messages, three negative cases, zero non-loopback attempts, zero real API-route requests, zero policy violations, zero production leaks, zero console errors, and cleanup.

GIT-040 is complete in exact 12-document commit `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`, message `Authorize SPEC-0005 Phase 2 whole-body poses`. Its authorized former Phase 2 attempt was later rejected. D-0046 now supersedes that phase structure; the exact next task is GIT-041, separate publication of only the reviewed eight-phase control-plane restructure. No fresh Phase 2 product byte or executor exists yet.

## Accepted SPEC-0004 Phase 1 Result

The accepted engine is the narrow first foundation for future Stick Generate Frames. A strict action-neutral plan uses only ordered `set_timing`, complete independent `create_key_pose`, contiguous bounded `hold_pose`, and terminal `finish` commands. One shared executor materializes fixed checked-in `wave`, `jump`, `bow`, and `dodge` plans without action-name branches. It remains bounded to one figure, one existing layer, the white background, the derived horizontal line head, 8–24 frames, and 12 or 24 FPS.

Preview, Cancel, and every failure leave the document, history, storage, and latch unchanged. Apply publishes exactly one history action and consumes a durable project-bound latch. Undo cannot reopen AI; Redo restores exact accepted bytes; explicit Save/Open preserves the latch; legacy V1 Stick saves remain readable and conservatively consumed; and every generated joint remains normal manually editable data. After Apply, later AI messages return `AI editing comes later; use manual tools.` before executor/provider work.

This phase adds no broad chat understanding, free recipe matcher, Terra/provider/API/key use, paid work, smooth interpolation, multiple figures, layer/background/color changes, working Task/Reasoning controls, user-visible Mode, post-Apply AI editing, Drawing change, dashboard work, deployment, or Phase 2 behavior.

### Exact accepted technical boundary

The accepted technical paths are exactly:

- `scripts/fixtures/spec0004-stick/v1/browser-viewports.json`
- `scripts/fixtures/spec0004-stick/v1/phase1-plan-cases.json`
- `scripts/fixtures/stick-ai/v3/bow.json`
- `scripts/fixtures/stick-ai/v3/dodge.json`
- `scripts/fixtures/stick-ai/v3/jump.json`
- `scripts/fixtures/stick-ai/v3/wave.json`
- `scripts/spec0004-stick/phase1BrowserProof.ts`
- `scripts/spec0004-stick/recordPhase1Proof.ts`
- `scripts/spec0004-stick/validatePhase1Proof.ts`
- `scripts/validateStickFigureAiUiAdapter.ts`
- `src/components/workspace/stickfigure/StickFigureAiPanel.tsx`
- `src/components/workspace/stickfigure/StickFigureWorkspace.tsx`
- `src/lib/ai/stickFigureAiContract.ts`
- `src/lib/ai/stickFigureAiWorkspaceAdapter.ts`
- `src/lib/ai/stickFigureCommandExecutor.ts`
- `src/lib/stickProjectStorage.ts`
- `src/lib/stickfigure/stickProjectHistory.ts`

The technical manifest is `output/spec-0004/phase-1/proof-manifest.json`, 15,683 bytes, SHA-256 `ee3a92edf8f4227dfa91ec3b84de3599fa158d5fb5f3df83155ab5192c076e4a`. Executor-time independent validation passed 126 checks while the private loopback server was live. It binds 14 receipts and 27 artifacts: 707 assertions, four valid fixtures, 26 invalid-plan rejections, 12 browser flows, 11 screenshots at `1440×900` and `1024×768`, TypeScript, focused lint, unchanged full-lint baseline, diff proof, protected Stick/Drawing flows, and zero external/API/provider requests.

The blue `PRIVATE REVIEW` fixture picker was never product UI. The browser-proof script made a temporary isolated copy and injected the proof client/ports only there. The temporary copy/server are removed. Its identifying tokens are absent from `app`, `src`, and `public`; no product route, picker, overlay, public asset, or query-controlled review surface exists. The proof script remains developer-only technical evidence and is never imported by the app.

## Accepted SPEC-0004 Phase 2 Result

Phase 2 adds one hidden local smooth-motion engine for the unchanged fixed wave/jump/bow/dodge plans. It normalizes the current exact 11-joint/10-segment body, creates deterministic cubic-eased shortest-turn in-betweens, and bakes every important, in-between, and repeated-looking slot into its own complete ordinary keyframe before Preview. Current Stick held-frame edits resolve to one owner, so Phase 2 candidates must contain zero holds/tweens and no shared frame/pose/content identity. After Apply, the engine has no control: a manual edit stays, changes only that frame, and may never regenerate or snap back.

Phase 1 default behavior stays byte-compatible. Phase 2 adds a separately named materializer and fail-closed transaction option; omission remains the Phase 1 held-frame default. It adds no matcher, new recipe, Task/Reasoning behavior, Terra/provider/API/paid call, multi-figure/timing-bound expansion, background/layer/Drawing/workspace/dashboard/deployment work, or post-Apply AI editing.

The exact accepted technical boundary is eight paths:

- `src/lib/ai/stickFigureMotionEngine.ts`
- `src/lib/ai/stickFigureCommandExecutor.ts`
- `scripts/fixtures/spec0004-stick/v2/browser-viewports.json`
- `scripts/fixtures/spec0004-stick/v2/phase2-motion-cases.json`
- `scripts/spec0004-stick/phase2BrowserProof.ts`
- `scripts/spec0004-stick/recordPhase2Proof.ts`
- `scripts/spec0004-stick/validatePhase2Proof.ts`
- `scripts/validateStickFigureMotionEngine.ts`

Ignored proof exists only under `output/spec-0004/phase-2/**`. The accepted manifest is 11,493 bytes at SHA-256 `a6e656d930781b589a3350abec62000818fade6553638ada0899ec7183b24d3f`. Its prior live validation passed 210 checks and references 10 technical receipts within 19 unique artifacts, 1,734 assertions, four fixed plans, 20 invalid cases, 40 browser flows, eight screenshots, TypeScript/lint/diff and protected-regression evidence, and zero external/API/provider requests. CPA closeout revalidated all 19 unique durable artifacts after the temporary review servers stopped. All accepted technical hashes remain frozen.

Arthur's visible review used four separate disposable normal-looking loopback copies/links, one preloaded wave/jump/bow/dodge sample each. The normal canvas, timeline, AI Preview/Apply/Cancel area, and manual tools were the only visible controls. The former blue box, any floating tester/picker/button, query flag, route, public asset, or product import is absent and must not be published.

D-0038 also preserves two future notes without authority: use compact Terra key-pose plans/local in-betweens/free recipes first/measured budgets later, and consider a separate future unified Drawing+Stick Animation Workspace spec. Neither note is Phase 2 work.

## Accepted SPEC-0004 Phase 2.5 Timing-Only Result

D-0041 accepts and closes the exact stopped seven-path Phase 2.5 implementation only as the shared **Action Timing and Spacing Engine** primitive. The strict plan-bound `stick.action-timing/v1` sidecar supplies validated local timing profiles, is separately selected through `phase-2.5-timed-motion`, and is discarded after complete independent ordinary Stick keyframes are baked. Phase 1 and Phase 2 entry points remain available; Preview/Cancel/failure remain no-ops; Apply remains one atomic existing-history action; and the implementation adds no language interpretation, route, provider/API call, live tween/controller, shared hold owner, hidden AI state, lock, regeneration, or snap-back.

The exact accepted technical paths are:

- `src/lib/ai/stickFigureMotionEngine.ts`
- `src/lib/ai/stickFigureCommandExecutor.ts`
- `scripts/fixtures/spec0004-stick/v3/phase25-timing-cases.json`
- `scripts/spec0004-stick/phase25BrowserProof.ts`
- `scripts/spec0004-stick/recordPhase25Proof.ts`
- `scripts/spec0004-stick/validatePhase25Proof.ts`
- `scripts/validateStickFigureActionTiming.ts`

The accepted manifest is `output/spec-0004/phase-2.5/proof-manifest.json`, exactly 14,601 bytes at SHA-256 `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1`. It binds 21 artifacts and 12 technical receipts, including 1,609 assertions, five valid fixture plans, 30 invalid timing cases, 20 inherited Phase 2 cases, 40 browser flows, eight screenshots, and zero external/API/provider requests. The independent validator passed 250 checks against the still-live review evidence before cleanup. Every accepted source and manifest byte remains frozen.

Arthur rejected all four old samples as evidence of natural motion: the jump retained a wave-hand pose and floated, the bow was compressed to roughly one third of a second without a readable settle, and the dodge reversed instantly while its feet slid. Those failures do not invalidate the timing math, but they are binding negative evidence. The old wave/jump/bow/dodge sample poses must never be described as accepted natural-action quality. SPEC-0005 now owns the missing pose creation, weight, contact, body mechanics, landing/recovery, direction, allocation, natural path, gait, and action-intent work.

After live validation, the four exact disposable review process groups rooted at PIDs `33585`, `33587`, `33593`, and `33597`, their child processes, ports `52187`, `52204`, `52222`, and `52240`, and their four exact temporary review directories were stopped and removed. Durable ignored proof under `output/spec-0004/phase-2.5/**` remains. GIT-037 published the accepted timing primitive without recreating or publishing any review copy.

## Rejected Motion Evidence and Restructured SPEC-0005 Starting Point

One executor ran former SPEC-0004 Phase 2.6 in `/Users/arthurcarlin/.codex/worktrees/8de8/stick-animation-app` from clean canonical `4c1da7fa4ea14ed82af950f7ed748b86387a7e0a`. It stopped with empty index and the former exact eight dirty paths. Its ignored manifest SHA-256 `900f1faf0fbdddbccd8301a62628cd6889990e1a3c75ca2977fdcd56995a8d5e` was technically green, but Arthur rejected the overall visible motion. Nothing in that worktree is accepted, propagated, published, integrated, or available for a correction executor.

Read-only inspection found the proof gap: action fixtures still supplied full raw joint coordinates; the core was mostly action-specific validation/repair; browser automation clicked Play and immediately Pause without observing a complete cycle; the frozen expected frames were regenerated by the same implementation path; and screenshots were static. Those checks prove deterministic mechanics and transaction properties, not professional motion.

D-0043 activated [`SPEC-0005 — Professional Shared Stick Motion Engine`](specs/0005-professional-shared-stick-motion-engine.md) as the replacement. Phase 1 was accepted and published unchanged. GIT-040 later published D-0045's former Phase 2 authorization at `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`. One dedicated former Phase 2 executor produced technically green evidence, but Arthur rejected its visible motion. That result had no authoritative safe-frame contract, selected fixed-sign IK instead of enumerating branches, allowed recovery to miss rest, left unsolicited W-arms underconstrained, had no final post-interpolation/rounding/contact safety gate, and used an oracle that tolerated unsafe branches, near-locks, unwanted movement, overshoot, unsafe in-betweens, and loop snaps. The result's code/proof was never accepted, propagated, committed, published, or integrated; its disposable app/worktree was removed; and it must not be reused or corrected under the former phase.

D-0046 corrects the architecture to exactly eight sequential phases: (1) accepted reference/full playback, (2) planner-independent Body Safety Gate/Foundation, (3) whole-body poses, (4) mechanics/weight/contact, (5) paths/timing/gravity, (6) walk/run, (7) core actions, and (8) the shared planner door. There are no SPEC-0005 Phases 2.5, 2.6, 2A, or 2B. The exact non-bypassable pipeline is movement goal → enumerate candidates → important-pose safety → mechanics/required insertion → path/timing bake → post-rounding/post-contact safety → final semantic/continuity → Preview. Every accepted SPEC-0004 transaction/manual/protected-system boundary remains preserved.

The docs-only activation was published/integrated in exact commit `2b4f00e7a122c196b2c0600144cd638b461bbb2f`. Phase 1 then completed, was accepted under D-0044, and was published/integrated at `2436a9414221e8ee7ef40151284cb8f4e069e828` with exactly these six technical paths:

- `scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json`
- `scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json`
- `scripts/spec0005-stick/phase1BrowserProof.ts`
- `scripts/spec0005-stick/recordPhase1Proof.ts`
- `scripts/spec0005-stick/validatePhase1Proof.ts`
- `scripts/validateStickMotionQualityBaseline.ts`

Phase 1 changes no runtime and writes ignored artifacts only under `output/spec-0005/phase-1/**`. It protects the published 12-frame wave, proves ordered full playback `0 → … → 11 → 0`, binds independent reference/bad-motion oracles, and passed the permanent-browser and ordinary-review gates. Its publication is complete.

The restructured Phase 2 is technical-only and planner-independent. It may touch exactly the eight tracked paths listed in SPEC-0005 and ignored `output/spec-0005/phase-2/**`. It must prove the safety contract with an independent oracle, at least 10,000 fixed-seed property cases plus mirrored cases, explicit catastrophic negatives, inherited Phase 1 and SPEC-0004 regression gates, and source/AST integration checks that reject bypasses. Only after every technical gate passes may the executor leave one ordinary unchanged-source app instance served directly from its exact unpublished worktree on one loopback-only non-`3000` root URL for Arthur's existing-app smoke check. The manifest binds URL/port, PID/process group, worktree/source identity, logs, non-claims, and cleanup; no special controls, fixture injection, preloaded new action/project, query/hash flag, or UI/product change is permitted. This does not demonstrate safety or review new motion. Arthur first reviews new safety-gated visible output in Phase 3.

## Prior Completed SPEC-0003 Result

The D-0031 permanent-tester prerequisite plus reviewed records are published/integrated in exact canonical-main commit `2cd25fd0bdfb8a775370641ffd65db315cc94532`, parent `57ef6ff5ff9d2da7ca3ab1e154aac9f506cc6b81`, message `Update permanent tester for SPEC-0003`. The corrected clean permanent tester passed before the product executor edited, and that exact commit became the product base.

One dedicated Spec Executor completed the exact ten-path product implementation, proved it, returned its packet, and stopped. Arthur reviewed the local app copy and explicitly accepted it. The Project Manager accepted the recovered technical result and transferred exclusive ownership of `/Users/arthurcarlin/.codex/worktrees/f1a4/stick-animation-app` to the Control Plane Architect. After reviewed propagation and separate publication authorization, the Control Plane Architect published the exact ten technical paths plus ten reviewed control-plane paths in commit `9fa1b819aacc7823711af5838b79e70921469a93`, parent `2cd25fd0bdfb8a775370641ffd65db315cc94532`, message `Implement SPEC-0003 Tutorials screen`.

The accepted visible result is:

- Home Tutorials opens a polished full-screen dark-navy/blue Tutorials page.
- The Home header is absent inside Tutorials.
- The only `h1` is `Welcome to Diamond Animator`.
- One dominant blue-outlined `Start Here` card appears first.
- Three smaller cards follow in exact order: `Create Your First Animation`, `Create with AI`, and `Finalize Your Animation`.
- All four cards say `COMING LATER` and are static/non-interactive.
- Back returns Home and restores focus to the Home Tutorials card.
- The inert Home AI Credits card is removed.

## Prior SPEC-0003 Exact Accepted Technical Boundary

The accepted product/proof paths are exactly:

- `app/page.tsx`
- `src/components/tutorials/TutorialsScreen.tsx`
- `src/components/tutorials/TutorialsScreen.module.css`
- `src/lib/tutorials/tutorialCatalog.ts`
- `scripts/fixtures/spec0003-tutorials/v1/browser-plan.json`
- `scripts/fixtures/spec0003-tutorials/v1/proof-commands.json`
- `scripts/spec0003-tutorials/browserProofContract.ts`
- `scripts/runSpec0003TutorialsBrowserProof.ts`
- `scripts/recordSpec0003TutorialsProof.ts`
- `scripts/validateSpec0003TutorialsProof.ts`

The publication commit contains exactly these 20 paths: the ten accepted paths above, plus `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/SESSION_HANDOFF.md`, `docs/TODO.md`, `docs/architecture.md`, `docs/changelog.md`, `docs/specs/0003-tutorials-and-cleaner-home-screen.md`, `docs/specs/README.md`, `docs/testing_workflow.md`, and `project/project_structure.txt`.

The fresh technical manifest is `output/spec-0003/single-implementation/proof-manifest.json`, 3,084 bytes, SHA-256 `4b63e1dc171cf9536aecbed067f271793dffc17137200afc8d136e1072d04d6d`. Independent validation passes with six receipts and four artifacts. Its browser result covers `1440×900`, `1024×768`, and `390×844`; three screenshots; 14 assertion groups; exact copy/order/geometry/static semantics; Back/focus; no overflow; zero console/page errors; and zero API/external requests. TypeScript, focused lint, and both diff checks pass. Full lint remains the accepted 5-error/72-warning baseline with no accepted changed-path finding.

The original accepted output was erased before recovery. The regenerated screenshots and manifest prove the same exact replayed source result but are not claimed byte-identical to the historical manifest whose SHA-256 began `1059c0…`. The ten accepted product/proof source paths were hash-frozen on takeover and remained unchanged through Control Plane Architect propagation, publication, and final reconciliation.

## Durable Git and Lifecycle Record

Current SPEC-0004 Phase 1 closeout state:

- exact publication commit: `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d`
- exact parent: `9fae072359f3c0d10f1ed2bcee8da9ebc11d54ec`
- exact message: `Implement SPEC-0004 Phase 1 animation builder`
- exact scope: 28 paths, comprising the accepted 17 technical paths plus 11 reviewed control-plane/tree paths
- publication worktree/branch: `/Users/arthurcarlin/.codex/worktrees/b8ad/stick-animation-app`, `codex/spec0004-phase1-publication`
- normal non-force push: complete; publication branch, canonical local `main`, local `origin/main`, live GitHub `main`, and GitHub API were verified equal at `086420e…`
- post-publication repository state: both publication and canonical worktrees clean, empty indexes, canonical synchronization `0/0`
- clean permanent tester: PASS with 40 operations, 13 screenshots, 4 driver messages, all 37 historical negatives, four protected Stick availability GETs, one deterministic mocked Drawing POST, zero real API/nonloopback/provider requests, and complete cleanup
- tester result: 84,209 bytes, SHA-256 `bd037bc7a0ce9e48522ef6e626084ac3e9eaddfaaa475859d6c00e6c1960448e`; browser ledger SHA-256 `de3827a21b0fbb112963a6d273dcb73a9daa78a0e9fd4c72cf66f9c7166755e1`; server ledger SHA-256 `9e70d65d645031c92fd04c41c058cb1e34940efdc20a3a340ff6a9a1f4dd8e34`
- accepted technical manifest remains 15,683 bytes at SHA-256 `ee3a92edf8f4227dfa91ec3b84de3599fa158d5fb5f3df83155ab5192c076e4a`
- blue review tokens/imports are absent from product/deployable paths; the review process, port, and copy are absent
- no provider/API/paid request, deployment, Phase 2 implementation, or next-feature work was performed

Prior SPEC-0003 publication record:

- publication worktree/branch used: `/Users/arthurcarlin/.codex/worktrees/f1a4/stick-animation-app`, `codex/spec0003-publication`
- exact product publication: commit `9fa1b819aacc7823711af5838b79e70921469a93`, parent `2cd25fd0bdfb8a775370641ffd65db315cc94532`, message `Implement SPEC-0003 Tutorials screen`, exactly 20 reviewed paths
- immediately after product publication: publication branch, canonical local `main`, local `origin/main`, and live GitHub `main` matched at `9fa1b819…`; both relevant worktrees were clean; canonical synchronization was `0/0`
- SPEC-0003 implementation: Verified, published, and integrated
- clean committed permanent tester: PASS with 40 operations, 13 screenshots, 4 driver messages, all 37 historical negatives, four ordered Stick GETs, one Drawing POST, zero real-route/non-loopback/provider requests, and cleanup; result SHA-256 `8c3647aecec11f2660c5bc47b2e656da6fc1b19b816c9a317c709d759f661412`; ledger SHA-256 `514d163f272a938a7babb374cda98ea5f362a36f5566ee0e34afbab4db1130ac`
- final record-only closeout: exactly eight canonical documents and no product/proof path; its own commit SHA and present staging/branch/main/origin/live state are deliberately not embedded and must be verified directly from Git
- exact record-only closeout paths: `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, `docs/SESSION_HANDOFF.md`, `docs/TODO.md`, `docs/changelog.md`, `docs/specs/0003-tutorials-and-cleaner-home-screen.md`, `docs/specs/README.md`, and `docs/testing_workflow.md`
- deployment, provider/external/paid work, and next-feature work: not performed

## Stopping Point

SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 are fully closed, published, and integrated. GIT-033 through GIT-037 are complete. Exact GIT-037 publication commit `16799539fb7db31e345a878aa892d4485115188b` contains only the accepted seven technical paths plus 12 reviewed control-plane/tree paths. The later unpublished Phase 2.6 result was rejected and is superseded, not completed. SPEC-0004 is paused before Phase 3.

GIT-040 is complete at `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`. The first former SPEC-0005 Phase 2 attempt is rejected/superseded and its disposable app/worktree is removed. The exact next lifecycle action is GIT-041: separate publication/integration of D-0046 and this reviewed eight-phase control-plane restructure. Until GIT-041 is complete, do not start a fresh executor. After it is complete, the Project Manager may create exactly one new Plan-mode technical-only Phase 2 Spec Executor from the exact GIT-041 publication SHA under the spec's exact eight-path ceiling. After all technical gates pass, leave only one manifest-bound ordinary unchanged-source loopback/non-`3000` app instance from that exact unpublished executor worktree for Arthur's existing-app regression smoke review; it contains no special or preloaded review behavior and proves no Phase 2 safety. Do not reuse either rejected attempt, create a fractional phase, or perform Phase 3–8, SPEC-0004 Phase 3, provider/API/paid, Drawing/workspace-integration, or deployment work.

## Proven and Not Proven

Proven for SPEC-0004 Phase 2.5: exact base `f131e75aafccec0d1b8ecb717e2d95b518355d39`; exclusive transfer from the stopped executor; exact seven-path implementation within exact 19-path publication commit `16799539fb7db31e345a878aa892d4485115188b`; strict bound timing-sidecar validation and separately selected local timing materializer; complete independent ordinary keyframes; transaction and protected regressions; exact 14,601-byte manifest at SHA-256 `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1`; 250-check independent live validation; 21 bound artifacts; 12 technical receipts; 1,609 assertions; five valid plans; 30 timing rejections; 20 inherited Phase 2 cases; 40 browser flows; eight screenshots; zero external/API/provider requests; frozen accepted source hashes; and exact temporary-server/copy cleanup. The clean publication tester passed 40 operations, 13 screenshots, four messages, all 37 negatives, one mocked Drawing POST, zero real API/non-loopback/provider requests, and cleanup. Result SHA-256 is `de043f7b3daa647961b952bc48890c79a8f8a858f6ffc9d9afc52623bdf636b3`; browser-ledger SHA-256 is `683ea5224642a884a94eda5e1a0aaf146d6ebe1bd58787694903789d351e87cf`; server-ledger SHA-256 is `b8f6ad815ef3b6cb95e7ddf7c0115f3db54ed27096a80912a1de6c41111fc50b`.

Proven for SPEC-0005 Phase 1: the exact independent historical-reference catalog, all required bad-motion rejections, complete two-viewport playback capture, timing/landmark/stability/limb checks, TypeScript/scoped-lint/diff/scope, permanent regression, zero-egress evidence, exact source/artifact bindings, Arthur's readability-floor acceptance, and review cleanup. Proven by this control-plane task: GIT-040's publication anchor, the former Phase 2 rejection/non-publication/removal truth, the exact eight-phase restructure, the concrete humanoid-11-v1 safety contract, the exact non-bypassable pipeline, the technical-only Phase 2 allowlist/proof boundary, the one-instance existing-app smoke-review delivery rule, and the GIT-041 → fresh executor handoff. Explicitly not proven or changed: an implemented body-safety gate, improved/new runtime motion, whole-body pose creation, contact/weight/body mechanics, natural path quality, gait, semantic action generation, planner routing, provider behavior, or professional-release quality. The future ordinary regression instance can prove only what Arthur observes in existing app flows, never the safety seam or new motion.

The old SPEC-0004 wave/jump/bow/dodge samples remain rejected natural-action evidence. The later Phase 2.6 executor proved strict technical properties but not accepted visible quality; its bytes remain unpublished/rejected and are not current behavior. Broader natural-language matching, Terra/provider/API/paid work, deployment, unified workspace behavior, and SPEC-0004 Phases 3–8 also remain unperformed.

## Systems Intentionally Left Unchanged

SPEC-0001 Phases 1–6 and the visible Phase 6 wave behavior; SPEC-0002; SPEC-0003; every accepted SPEC-0004 and SPEC-0005 Phase 1 runtime/fixture/test/proof byte; Home/Tutorials/New/Open/My Project/AI Assistant/Export/AI Project Finalizer; Drawing workspace and Drawing AI; Stick manual menus/tools/layout, Play/Pause, onion, Creator presentation, and line-head appearance; provider/API/search/Supabase/model configuration; Terra/Luna/Sol routing; packages/dependencies/configuration/environment/database/public assets; dashboard/auth/billing/deployment; the rejected `/8de8/` worktree; the already removed former SPEC-0005 Phase 2 disposable app/worktree; other worktrees; and recovery material remain unchanged.
