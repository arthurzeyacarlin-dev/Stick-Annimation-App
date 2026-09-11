# Roadmap

Status: canonical ordered direction; not a delivery schedule
Last updated: 2026-09-11

## Roadmap Rules

- Phases describe dependency order, not calendar promises.
- Implementation work within a phase begins only after its entry decisions and active spec are approved. Read-only discovery and the initial control-plane bootstrap may establish a phase without authorizing product behavior changes.
- A feature is not complete because code exists; its spec acceptance and regression gates must pass.
- Paid AI calls, remote writes, deployment, and baseline commits require task-specific authorization.
- The roadmap may change when Arthur resolves pending decisions or new evidence changes the risk order.

## Current owner sequence — 2026-09-11 (D-0062)

SPEC-0006 Phases 1–3 are Verified/published/integrated. GIT-055 published the neutral architecture. Corrected Phase 4 is human-accepted under D-0063 and technically Verified pending GIT-056 publication; its exact 26-path manifest SHA-256 is `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`.

The corrected order keeps seven numbered phases. Minimal neutral data/storage precedes Phase 4 visible ordinary New, common history and timeline; this avoids a temporary broken or lossy Save. Phase 5 completes current tools/catalogs/panels; Phase 6 complete source adoption/recovery; Phase 7 retirement/full proof. No invisible 4A checkpoint is the user review.

GIT-056 publication/integration and accepted-copy cleanup are the immediate next steps. After that, SPEC-0006 Phase 5 completes current tools/library/panels, Phase 6 completes all-source adoption/recovery, and Phase 7 retires duplicate ownership and runs full acceptance. Future SPEC-0007/0008 remain gated by SPEC-0006 completion.

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

## Phase 2 — Shared Stick-Figure State and Editing Foundation

Status: planned

Goals:

- approve canonical figure, limb, joint, pose, identity, frame, interpolation, and layer models
- store independent poses per timeline frame
- provide the minimum real state/executor/history operations needed by both AI and direct editing
- define and implement enough direct select/move/rotate/pose editing to inspect, correct, and undo AI-authored changes
- connect the creator and saved figure/library flow to the shared model at the point required by the approved vertical slice
- save, reopen, and recover the shared stick-project state used by that slice
- play a multi-frame stick animation deterministically
- define onion-skin and tween behavior for rigged figures

Arthur's latest direction is AI-first, with advanced direct controls available for inspection and fine-tuning. The exact sequencing is still pending P-0008: Phase 2 and Phase 3 may interleave as a narrow AI-first vertical slice once the shared model, reversible executor, and minimum corrective controls exist. This roadmap does not silently require completing an Adobe-class manual editor before any AI stick workflow.

Current retained foundation: SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. Phase 2.6 remains rejected, unpublished, and superseded historical evidence. Under D-0055, unfinished Phases 3–8 are Superseded by future SPEC-0008, inactive, and must not be implemented. SPEC-0005 Phase 1 and Phase 2 v1/v2 remain accepted, Verified, published, and integrated; v2 is complete at GIT-048 `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`. GIT-049 published the later Phase 3 authorization at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`. A Phase 3 executor then ran, but Arthur rejected its visible result: it is unpublished, unaccepted, non-reusable, and not completed. D-0055 supersedes Phase 3 and unfinished Phases 4–8 by future SPEC-0008; they are inactive with no implementation authority.

## Phase 3 — AI-First Stick Animation

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
