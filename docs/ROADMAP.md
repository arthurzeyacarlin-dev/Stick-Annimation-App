# Roadmap

Status: canonical ordered direction; not a delivery schedule
Last updated: 2026-09-18

## Roadmap Rules

- Phases describe dependency order, not calendar promises.
- Implementation work within a phase begins only after its entry decisions and active spec are approved. Read-only discovery and the initial control-plane bootstrap may establish a phase without authorizing product behavior changes.
- A feature is not complete because code exists; its spec acceptance and regression gates must pass.
- Paid AI calls, remote writes, deployment, and baseline commits require task-specific authorization.
- The roadmap may change when Arthur resolves pending decisions or new evidence changes the risk order.

## Current owner sequence — 2026-09-18 (D-0085/D-0086; SPEC-0008 proposal published)

All seven SPEC-0006 phases are Verified/published/integrated through GIT-061 `185f58752c4f8dd4f5bfea0befe48998e5cd0f04`. The immutable 50,224-byte Phase 7 manifest is PASS/VALID at SHA-256 `c6202f6deab4d3bcc75af3ad6699fc2dc70fc58723eccaa8337b1a2aef74bc51`, with exactly 11 source and 16 evidence bindings.

The corrected order kept seven numbered phases. Minimal neutral data/storage preceded Phase 4 visible ordinary New, common history and timeline; Phase 5 completed current tools/catalogs/panels; Phase 6 completed source adoption/recovery and persistence proof; Phase 7 retired ordinary duplicate ownership and passed the full ordinary acceptance gate. SPEC-0006 is complete.

[`SPEC-0007`](specs/0007-manual-editor-completion-and-ai-ready-tools.md) is Verified, published, integrated, recorded and cleaned up through D-0083/D-0084/GIT-066 `c193b8ba89fa55ead02d84ea10bb81f71b960f8a`. Its completed sequence is:

1. Drawing Engine and No-Loss Stabilization.
2. Draw Rig, as ordinary segmented raster drawing only.
3. Safe Legacy Rig Retirement and Migration into ordinary drawings/drawing symbols.
4. Assets Stabilization.
5. Final Manual Editor Bug Burn and Future-AI Command Registry.

Each phase started only after the prior phase was accepted, propagated, separately published/integrated, synchronized, cleaned up, and separately authorized. The no-silent-deletion, explicit destructive-command registry, same-paint maximum-coverage, shared-capability, and read-only legacy-source laws remain permanent. SPEC-0007 added no AI/provider/model/prompt/video/tracking behavior.

D-0085 creates [`SPEC-0008`](specs/0008-conversational-ai-animator.md) as Proposed/review-ready with no implementation authority, and D-0086/GIT-067 publishes the exact planning-only package at `ba5ecd694df78414240ce83a9140c5196334ebdc`. Its exact next sequence is:

1. Terra brain, conversational intent routing and persistent streamed jobs.
2. Provider-neutral reference video with upload fallback and a separate provider/access/cost/privacy gate.
3. Deterministic cucumber slicing into an isolated ordered timing/shot-bound frame bundle.
4. Honest editable reconstruction into ordinary drawing-only content through registered commands and atomic Preview/Apply.
5. Conversational edits through the same manual command registry.
6. Beta/security/performance closeout and downloadable YouTube-ready video export.

The delivery target is one phase/day plus one correction/publication buffer day. It does not bypass the per-phase Spec Executor → Arthur/PM acceptance → CPA → separate publication/integration → cleanup lifecycle. Phase 1 is the next possible product action only after Arthur separately approves SPEC-0008 and authorizes Phase 1; Phases 2–6 remain gated and unauthorized.

## Phase 0 — Preserve and Stabilize

Status: active

Goals:

- establish one canonical control plane and automatic session boot sequence
- preserve the recovered application baseline safely in reviewed Git history
- keep the reconciled former index generation recoverable without confusing it with the functional branch
- introduce a spec-first lifecycle and exact session handoffs
- establish deterministic type/lint/test/build/browser gates
- classify existing docs, prompts, scripts, spreadsheets, and generated artifacts
- keep the application explicitly local-only until authentication, ownership, rate limiting, and reproducible backend schema have approved implementation specs

Preservation status: the control plane, mixed-index reconciliation, reviewed baseline commit, remote recovery branch, merged pull request #1, and synchronized `main` were completed on 2026-08-09. Phase 0 remains active because repeatable quality gates, CI/browser automation, and deployment-safety foundations are still incomplete.

Exit gates:

- current working tree has been reviewed and durably versioned or archived
- no mixed staged/unstaged version remains unexplained
- every non-trivial change begins from one active spec
- fast verification commands are repeatable and known baseline failures are resolved or explicitly grandfathered
- a browser smoke path protects home, project choice, Drawing Workspace, and Stick Figure Workspace

## Phase 1 — Core Document and Persistence Reliability

Status: planned

Goals:

- define a canonical stage/document coordinate system and resolution
- define a versioned project schema with migrations and validation
- make save/reopen fidelity measurable and lossless within approved bounds
- define durable autosave/recovery behavior
- unify edit, playback, save, reopen, and export compositing expectations
- isolate high-risk canvas/history/timeline logic behind tested boundaries
- reproduce and address memory, resize, layer-compositing, and quota risks
- establish the missing project-memory migration and the authentication/ownership/rate-limit foundation before any public deployment target

Exit gates require dedicated specs and end-to-end fidelity tests; this phase does not authorize a broad rewrite.

## Phase 2 — Drawing-Based Manual Animation Foundation

Status: planned

Goals:

- stabilize ordinary raster tools, preview/final identity, no-loss transaction boundaries, history, and Save/Open
- preserve intentional drawing character from smoothing 0 through 100 without covert segmented/rig behavior
- expose **Draw Rig** only as explicit ordinary segmented raster drawing
- retire active structured-rig/Creator authoring after safe deterministic migration of historical content
- keep drawing/drawing-symbol output editable through ordinary selection, transform, Eraser, Knife, timeline, onion, playback, and persistence
- complete bounded supported still Assets and one runtime-used manual/future-AI command registry

Arthur's latest direction is AI-first at the product level. D-0074's drawing-only SPEC-0007 manual foundation and runtime-used command matrix are complete, and D-0085 now resolves P-0008 for the bounded Proposed SPEC-0008 V1 sequence. This does not authorize an unbounded Adobe-class editor or any implementation phase.

Current retained foundation: SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. Phase 2.6 remains rejected, unpublished, and superseded historical evidence. Under D-0055, unfinished Phases 3–8 are Superseded by future SPEC-0008, inactive, and must not be implemented. SPEC-0005 Phase 1 and Phase 2 v1/v2 remain accepted, Verified, published, and integrated; v2 is complete at GIT-048 `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`. GIT-049 published the later Phase 3 authorization at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`. A Phase 3 executor then ran, but Arthur rejected its visible result: it is unpublished, unaccepted, non-reusable, and not completed. D-0055 supersedes Phase 3 and unfinished Phases 4–8 by future SPEC-0008; they are inactive with no implementation authority.

## Phase 3 — AI-First Drawing-Based Animation

Status: planned

Goals:

- publish the AI command-to-executor support matrix
- define preview, apply, undo, rollback, partial failure, and destructive confirmation semantics
- let AI create and revise real figures, poses, timing, scenes, and continuity through the shared project model
- measure character/scene continuity and temporal quality across multi-turn requests
- introduce explicit cost, latency, model-routing, retry, and credit budgets
- expose honest capability and failure states to beginners

The AI path must manipulate the same state and history as manual tools.

D-0055 closes the former SPEC-0004-after-SPEC-0005 dependency. The unfinished phases are superseded, not queued to resume. No provider, pricing, privacy, motion-video service, or release policy is selected or authorized here.

## Phase 4 — Professional Product Completion

Status: future

Candidate goals:

- production animation export formats and project-file import/export
- sound/voice workflow based on an approved product and licensing policy
- remaining authenticated sync, abuse prevention, and deployment hardening beyond the foundational Phase 1 security gate
- polished onboarding/tutorial/help and project viewing flows
- real credit/billing controls and privacy/retention settings
- performance profiling and accessibility/responsive requirements

Drawing's architectural role is resolved by D-0056: it becomes typed content inside one Animation Workspace. The exact launch scope still depends on SPEC-0006 completion and the remaining first-release definition.

## Phase 5 — Custom Model R&D

Status: future research

Only begin after the product has a stable project/action schema and measurable evaluation set.

Candidate work:

- dataset governance and provenance
- animation-specific planning/continuity evaluations
- retrieval versus fine-tuning experiments
- safety and policy evaluations
- deployment, fallback, rollback, latency, and cost analysis

Current prompt/reference example arrays are not evidence that this phase has begun.
