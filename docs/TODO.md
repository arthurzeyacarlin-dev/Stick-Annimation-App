# TODO

Status: canonical actionable queue
Last updated: 2026-08-15

## Queue Rules

- IDs are stable. Do not renumber completed work.
- Only one non-trivial implementation spec should be active unless tasks are proven independent.
- “Done” requires the named proof, not only code completion.
- New discoveries enter the queue; they do not silently expand the active spec.
- Remote writes, paid AI calls, Git history changes, and deployment require explicit task authorization.

## P0 — Preserve the Existing Application

- [x] **CP-001 — Establish the initial canonical control plane.** Proof: `AGENTS.md` boot sequence, canonical `docs/` files, frozen baseline audit, spec template/index, reference classification, safe memory helper, required-file presence check, manually verified links/redirects, and sanitized tree regeneration.
- [x] **GIT-001 — Reconcile the mixed `app/page.tsx` index state.** The three page generations were reviewed. The integrated working blob `c24392097af8d578fc1f6cc501dad121ce0cb1fc` was selected; the older staged blob `d44892246c4a8933047c028d2508e194e1ec731a` is preserved by pushed recovery commit `d35e892bdaabbd66ab36eae4cc32144aa620de44` on `codex/pre-baseline-staged-page-2026-08-09`.
- [x] **GIT-002 — Create a reviewed durable baseline.** Proof: complete snapshot anchor `c7de444536f3e0dd578a2063f70b0914e6af60b1`, merged pull request [#1](https://github.com/arthurzeyacarlin-dev/Stick-Annimation-App/pull/1) at `093bbac82fd3b4d97984448b6c6dbd716153354d`, synchronized clean `main`, tag `baseline-2026-08-09-control-plane`, clean configured-secret/size/generated-boundary audits, and an explained recovery branch for the old index.
- [x] **SPEC-001 — Review and decide the first implementation spec.** Arthur approved [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md) on 2026-08-11. Decision D-0009 records OD-01–OD-06 and OD-09 as accepted exactly, OD-07/08/10/11 as approved engineering rules/prerequisites, and OD-12–OD-14 as deferred.
- [x] **GIT-003 — Publish and integrate the SPEC-0001 approval record.** Proof: canonical `main`/`origin/main` at Phase 1 handoff contained the approval as `832d1f93630d7093514af3e81399077ebed696b4`, with zero ahead/behind and consistent Approved/active/Phase-1-authorized state.
- [x] **STICK-006 — Complete and correct SPEC-0001 Phase 1 contracts, fixtures, and focused proof.** Proof: 631 contract assertions pass, including exact ordered manual progression, exact starter-bound applied-wave identity/profile/timing, correctly rehashed unsafe-command rejection, and every required invalid category; the replacement seven-command proof bundle independently validates at `output/spec-0001/phase-1/proof-manifest.json`; TypeScript passes; full lint remains exactly 6 errors/73 warnings with zero Phase 1 findings; the corrected proof schema freezes later source/fixture/schema/state/storage/request/network/screenshot/cleanup/live evidence. Status: Verified, published, and integrated into canonical `main` after Arthur and Project Manager review.
- [x] **GIT-004 — Review, publish, and integrate SPEC-0001 Phase 1.** Arthur and the Project Manager passed the corrected PM Review Packet. The exact 34 approved Phase 1 paths were committed, local `main` was fast-forwarded, canonical `main` was pushed, and local/remote synchronization and clean worktrees were verified. Phase 1.5 was authorized later by D-0011; Phase 2 remains unauthorized and not started.
- [x] **CP-002 — Establish strict Spec Executor / Control Plane Architect separation.** D-0010 and the canonical workflow now reserve implementation/technical proof for a stopped-before-Git Spec Executor, human acceptance/rejection for Arthur and the Project Manager, final memory/closeout for an exclusively owning Control Plane Architect, and publication for a later explicitly authorized architect task. SPEC-0001 Phase 1 remains the historical completed exception.
- [x] **GIT-005 — Publish the D-0010 role-separation control plane.** Proof: the reviewed control-plane changes were committed, pushed, and integrated into canonical `main` at `2029fd07e14b6f48feb6d04e02dbd52ec683d55d`; local `main` and `origin/main` were clean and synchronized at the start of the Phase 1.5 amendment.
- [x] **GIT-006 — Publish and integrate the D-0011 Phase 1.5 approval record.** Proof: D-0011 and the reviewed Phase 1.5 approval record are published in clean synchronized canonical `main`/`origin/main` commit `a35a268764c21eedffcf3d82b59718699b62d4d0` with zero ahead/behind at the protected-Drawing amendment start.
- [x] **GIT-007 — Publish and integrate the D-0012 protected-Drawing correction approval.** Proof: D-0012 and its exact reviewed seven-path control-plane record are published in clean synchronized canonical `main`/`origin/main` commit `3768226fd3aa3668a6cf7260da8476ceea0a084e`.
- [x] **GIT-008 — Publish and integrate accepted SPEC-0001 Phase 1.5.** Proof: exact commit `8df64552e29e4170df8000097fe857b7a31dff69`, parent `3768226fd3aa3668a6cf7260da8476ceea0a084e`, message `Implement SPEC-0001 Phase 1.5 browser tester`, and exactly the reviewed 35 paths. Canonical `main`, `origin/main`, live remote `main`, and retained branch `codex/spec-0001-phase-1.5-closeout` all matched the publication commit at `0/0`; canonical and retained worktrees were clean. Technical proof SHA-256 remains `da2dd8cff32367a548a2e7d2e4e789fcf1a4dd129e9dc6200e25650f586f9fc9`, and closeout SHA-256 remains `d7d74d9a48e31f997ed772625cc75be53a7d408b96fe093023b50c793c421423`.
- [x] **SPEC-002 — Review and decide lossless local Drawing Save/Reopen.** D-0013 records Arthur's exact approval of [`SPEC-0002`](specs/0002-lossless-local-drawing-save-and-reopen.md), acceptance of OD2-01 through OD2-08 exactly as written, and authorization of Phase 1 only as Not started at decision time. SPEC-0002 Phase 2 and SPEC-0001 Phase 2 remain Unauthorized/Not started.
- [x] **GIT-009 — Publish and integrate the D-0013 SPEC-0002 approval record.** Proof: commit `8a2d4cd0e27e5299cd413146124b74e2dcf31844` (`Approve SPEC-0002 Phase 1`) published exactly the reviewed eight proposal/control-plane paths. The phase branch, canonical `main`, local `origin/main`, and live remote `main` matched that commit; canonical main was clean and synchronized at `0/0`. No implementation was part of this publication.
- [x] **DATA-002 — Implement SPEC-0002 Phase 1 safe save format and storage engine.** Status: **Verified, accepted, pre-publication.** The corrected 34-path hidden implementation from base `82663051b30cdcfd6766cf4714cdeb2306970045` passed 791 assertions, TypeScript, the exact 6-error/73-warning lint baseline with zero Phase 1 findings, isolated Chrome/IndexedDB proof, and 12 independent manifest self-tests. Accepted technical-manifest SHA-256: `2d20a4a63103618505b60cf590835191841d1c1968bc2bc14ef2c953253243a1`. No existing runtime/UI or visible Save/Open/Delete behavior changed.
- [ ] **GIT-010 — Publish and integrate accepted SPEC-0002 Phase 1.** After Arthur/Project Manager review of the Control Plane Architect packet, separately authorize publication of exactly the accepted 34 implementation paths plus reviewed control-plane paths. Proof: one reviewed commit/integration into then-current clean canonical `main`, pushed `origin/main`, clean synchronized `0/0`, and unchanged technical/closeout manifests. Phase 2 remains Unauthorized/Not started throughout publication.

## P0 — Reproducibility, Verification, and Deployment Safety

- [ ] **QLT-001 — Resolve the known lint baseline.** Fix or intentionally configure the 6 errors and review the 73 warnings without mixing unrelated behavior changes. Proof: `npm run lint` passes or an approved zero-regression warning baseline is encoded.
- [ ] **QLT-002 — Repair contradictory/compile-failing validators.** Align their TypeScript compilation with the repo config, ensure temp cleanup runs on compile failure, and update the stale expectation that Generate Frames is disabled. Proof: each offline validator reaches and passes intended assertions.
- [ ] **QLT-003 — Add canonical package verification scripts.** Add deterministic `typecheck`, offline test groups, and a composed `check` command; pin supported Node/package-manager versions. Proof: fresh documented invocation succeeds.
- [x] **QLT-004 — Implement SPEC-0001 Phase 1.5 permanent automatic browser tester.** Status: **Verified, published, and integrated into canonical `main` at `8df64552e29e4170df8000097fe857b7a31dff69`.** D-0012 diagnostics uniquely identified `DrawingCanvas.tsx` authoring-canvas width assignment as the first clearing writer; all temporary diagnostics were removed and the permanent correction stays in that one file. `npm run test:spec0001-browser` now provides the permanent reusable developer-only tester with pinned `playwright-core`, installed local Chrome, isolated storage/profile, hash-bound tester fonts, byte-restored anchor setup, and fail-closed browser/server/child egress denial. The accepted proof uses exactly one mocked Drawing POST in one context across both viewports, proves final success/usable input/settled pixels plus protected Home/Stick/Creator/Drawing/Undo/Redo/Play/Pause behavior, passes all 37 negatives, production exclusion, success/failure/`SIGINT`/`SIGTERM` cleanup, Phase 1's 631 assertions, TypeScript, and exact 6/73 lint baseline with zero Phase 1.5 findings. The independently valid 7-receipt/49-artifact proof SHA-256 is `da2dd8cff32367a548a2e7d2e4e789fcf1a4dd129e9dc6200e25650f586f9fc9`; closeout SHA-256 is `d7d74d9a48e31f997ed772625cc75be53a7d408b96fe093023b50c793c421423`. Website users cannot see or reach the tester; no real route/provider/OpenAI/search/Supabase/paid/external request occurred. Phase 2 prerequisites are satisfied, but Phase 2 remains Unauthorized/Not started pending separate authorization and a new Plan-mode Spec Executor after this reconciliation is published.
- [ ] **QLT-005 — Add semantic control-plane validation.** Check active-spec/handoff agreement, local links, required legacy banners, source-claim dates, and project-tree freshness rather than only file presence. Proof: a deterministic offline command fails on seeded continuity errors and passes the canonical tree.
- [ ] **DB-001 — Add the missing `drawing_project_ai_memory` migration and local Supabase configuration.** Proof: fresh local/test database can be created from repository migrations.
- [ ] **SEC-001 — Specify and implement API authentication, project ownership, and rate limiting.** Cover both `/api/ai` and `/api/drawing-project-ai-memory`. Proof: unauthorized/cross-project requests fail in integration tests. Blocks public deployment.
- [ ] **ENV-001 — Validate environment configuration at startup/build boundaries.** Proof: missing or server/client-misplaced keys fail with safe actionable messages; `.env.example` stays current.

## P1 — Resolve Product and Architecture Foundations

- [ ] **PROD-001 — Decide the launch role of the Drawing Workspace.** Resolve pending decision P-0001.
- [ ] **PROD-002 — Define measurable “professional-grade” acceptance.** Cover visual clarity, temporal continuity, editability, save/reopen fidelity, export, latency, cost, and failure behavior.
- [ ] **ARCH-001 — Specify the canonical document/stage coordinate system.** Include resolution, DPR independence, camera, viewport, resize, import, AI placement, playback, save/reopen, and export.
- [ ] **DATA-001 — Specify a versioned project schema and migration strategy.** Include drawing/stick data, assets, symbols, text, sound, AI memory, validation, and forward/backward compatibility.
- [ ] **PERSIST-001 — Specify durable autosave and recovery.** Distinguish in-memory frame capture from project persistence and define recovery after refresh/crash/quota failure.
- [ ] **RENDER-001 — Specify one fidelity contract across edit, playback, save, reopen, and export.** Reproduce current suspected compositing/downscale/resize gaps before patching.

## P1 — Current AI Consistency

- [ ] **AI-001 — Align the default AI task with the enabled matrix.** Decide whether to default to Generate Frames or re-enable a fully tested Generate Plans path. Proof: first-use UI and server behavior agree.
- [ ] **AI-002 — Publish the command-to-executor support matrix.** Mark supported, partial, disabled, destructive, previewable, and reversible commands.
- [ ] **AI-003 — Define AI transaction semantics.** Specify preview/apply/undo/rollback/confirmation and partial-failure behavior before enabling Other or broad stick actions.
- [ ] **AI-004 — Approve cost/latency/privacy policy.** Resolve P-0005 and P-0007 before production AI or search exposure.
- [ ] **AI-005 — Review duplicate prompt/research assets.** Confirm import graph and provenance before archiving `framesTraining.ts`, one DREAM workbook, or other duplicates.

## P2 — Usable Stick-Figure Animation

- [ ] **STICK-001 — Specify rig, pose, identity, frame, tween, and layer data models.** Must precede expanding UI behavior.
- [ ] **STICK-002 — Persist independent poses per timeline frame and prove playback.** Depends on STICK-001 and DATA-001.
- [ ] **STICK-003 — Connect creator Save to a real figure library/project flow.** Include validation, naming, duplication, update, and undo expectations.
- [ ] **STICK-004 — Implement the approved minimum manual editing tool set.** Resolve P-0006 first.
- [ ] **STICK-005 — Add stick-project save/open/recovery/export foundations.** Must use the approved versioned schema.

## Deferred Until Explicitly Prioritized

- production animation/video export formats
- Generate Sounds and voice workflows
- general AI Assistant and AI Project Finalizer product surfaces
- billing/credits enforcement
- cloud sync/collaboration
- custom model/fine-tuning R&D

Deferral means “not currently authorized,” not “rejected.”
