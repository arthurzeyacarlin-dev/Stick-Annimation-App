# Roadmap

Status: canonical ordered direction; not a delivery schedule
Last updated: 2026-09-05

## Roadmap Rules

- Phases describe dependency order, not calendar promises.
- Implementation work within a phase begins only after its entry decisions and active spec are approved. Read-only discovery and the initial control-plane bootstrap may establish a phase without authorizing product behavior changes.
- A feature is not complete because code exists; its spec acceptance and regression gates must pass.
- Paid AI calls, remote writes, deployment, and baseline commits require task-specific authorization.
- The roadmap may change when Arthur resolves pending decisions or new evidence changes the risk order.

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

Current shared-motion prerequisite: SPEC-0004 Phases 1, 2, and timing-only 2.5 are published/integrated. Its unpublished Phase 2.6 result was rejected and is superseded by SPEC-0005. Phase 1's proof-only historical-wave quality gate remains Verified/published/integrated at `2436a9414221e8ee7ef40151284cb8f4e069e828`; it changes no runtime. GIT-040 published D-0045's first former Phase 2 authorization at `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`, but Arthur rejected that technically green executor result and none of its code/proof was accepted or published. D-0046 now makes SPEC-0005 exactly eight phases: reference/full playback → planner-independent body safety → whole-body pose → mechanics/weight/contact → paths/timing/gravity → walk/run → core actions → provider-free planner door. The restructured technical-only Phase 2 remains Not started pending D-0046 publication. After its technical gates pass, one ordinary unchanged-source loopback/non-`3000` app instance from the exact unpublished executor worktree is allowed solely for Arthur's existing-app regression smoke check; it adds no product behavior and proves no safety or new motion. The remaining phases must still be accepted and published sequentially before broader SPEC-0004 scene/provider work resumes.

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

SPEC-0004 is explicitly paused before its Phase 3 until all eight SPEC-0005 phases are accepted, published, and integrated. This dependency does not authorize the later real Terra/provider phase, move its cost/privacy gates, or connect a live provider during SPEC-0005.

## Phase 4 — Professional Product Completion

Status: future

Candidate goals:

- production animation export formats and project-file import/export
- sound/voice workflow based on an approved product and licensing policy
- remaining authenticated sync, abuse prevention, and deployment hardening beyond the foundational Phase 1 security gate
- polished onboarding/tutorial/help and project viewing flows
- real credit/billing controls and privacy/retention settings
- performance profiling and accessibility/responsive requirements

The exact launch scope depends on pending decisions about the Drawing Workspace and first-release definition.

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
