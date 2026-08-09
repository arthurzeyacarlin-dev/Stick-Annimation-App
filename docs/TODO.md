# TODO

Status: canonical actionable queue
Last updated: 2026-08-09

## Queue Rules

- IDs are stable. Do not renumber completed work.
- Only one non-trivial implementation spec should be active unless tasks are proven independent.
- “Done” requires the named proof, not only code completion.
- New discoveries enter the queue; they do not silently expand the active spec.
- Remote writes, paid AI calls, Git history changes, and deployment require explicit task authorization.

## P0 — Preserve the Existing Application

- [x] **CP-001 — Establish the initial canonical control plane.** Proof: `AGENTS.md` boot sequence, canonical `docs/` files, frozen baseline audit, spec template/index, reference classification, safe memory helper, required-file presence check, manually verified links/redirects, and sanitized tree regeneration.
- [x] **GIT-001 — Reconcile the mixed `app/page.tsx` index state.** The three page generations were reviewed. The integrated working blob `c24392097af8d578fc1f6cc501dad121ce0cb1fc` was selected; the older staged blob `d44892246c4a8933047c028d2508e194e1ec731a` is preserved by pushed recovery commit `d35e892bdaabbd66ab36eae4cc32144aa620de44` on `codex/pre-baseline-staged-page-2026-08-09`.
- [ ] **GIT-002 — Create a reviewed durable baseline.** Publication is in progress on `rescue-before-restore`. Scope, ignore boundaries, configured-secret matches, binaries, symlinks, and GitHub size limits passed pre-stage review. Proof still required: functional baseline commit, pushed branch, draft pull request, and explained final Git state.
- [ ] **SPEC-001 — Choose and approve the first implementation spec.** Recommended first candidate: repository quality/regression harness and safe baseline gates before a product feature. Alternative product candidates require Arthur's priority choice. Proof: one file created from `docs/specs/TEMPLATE.md` and marked active in `SESSION_HANDOFF.md`.

## P0 — Reproducibility, Verification, and Deployment Safety

- [ ] **QLT-001 — Resolve the known lint baseline.** Fix or intentionally configure the 6 errors and review the 73 warnings without mixing unrelated behavior changes. Proof: `npm run lint` passes or an approved zero-regression warning baseline is encoded.
- [ ] **QLT-002 — Repair contradictory/compile-failing validators.** Align their TypeScript compilation with the repo config, ensure temp cleanup runs on compile failure, and update the stale expectation that Generate Frames is disabled. Proof: each offline validator reaches and passes intended assertions.
- [ ] **QLT-003 — Add canonical package verification scripts.** Add deterministic `typecheck`, offline test groups, and a composed `check` command; pin supported Node/package-manager versions. Proof: fresh documented invocation succeeds.
- [ ] **QLT-004 — Add automated browser smoke coverage.** Protect home → new project → Drawing Workspace and home → new project → Stick Figure Workspace/Creator, with no paid AI calls. Proof: repeatable local E2E command and captured pass.
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
