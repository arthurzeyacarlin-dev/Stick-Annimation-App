# Decision Log

Status: canonical durable decisions
Format: append new decisions; supersede old decisions explicitly rather than rewriting history

## Accepted Decisions

### D-0001 — One canonical control plane

- Date: 2026-08-09
- Status: accepted for repository operations
- Decision: `docs/` owns current project memory. `AGENTS.md` is the bootloader. `diamond-animator-docs/` is reference/design material unless a file is explicitly provisionally promoted in `docs/specs/README.md`.
- Why: two overlapping, stale documentation trees caused ambiguous authority and failed continuity.
- Consequence: no duplicate current-state, TODO, changelog, roadmap, decision, or handoff files may be introduced elsewhere.

### D-0002 — Evidence labels are mandatory

- Date: 2026-08-09
- Status: accepted
- Decision: distinguish live verified, code verified, check verified, intended, risk, and unknown claims.
- Why: prior docs called UI milestones complete and treated aspiration as implementation.
- Consequence: unverified risk cannot be reported as a confirmed bug; intended product direction cannot be reported as working behavior.

### D-0003 — Non-trivial changes are spec-first

- Date: 2026-08-09
- Status: accepted
- Decision: every non-trivial behavior change or bug fix requires one active spec under `docs/specs/` before implementation.
- Why: regression boundaries and acceptance flows were otherwise lost between tasks.
- Consequence: the spec must identify the real execution path, scope, non-goals, proof, and systems intentionally left unchanged.

### D-0004 — “Training” files are prompt/reference examples

- Date: 2026-08-09
- Status: accepted terminology decision
- Decision: describe current TypeScript example libraries as prompt/reference examples, not a trained Diamond Animator LLM.
- Why: the repository has no fine-tuning, embeddings, vector, training, or model-serving pipeline.
- Consequence: custom-model work requires a separate approved R&D spec and dataset governance.

### D-0005 — Memory maintenance never mutates Git history automatically

- Date: 2026-08-09
- Status: accepted safety decision
- Decision: control-plane helpers may validate and regenerate a sanitized tree, but must not silently stage, commit, push, reset, clean, or restore.
- Why: the initial worktree has a mixed index and almost all implementation files are untracked.
- Consequence: baseline versioning remains an explicit reviewed task.

### D-0007 — Use the integrated working page for the functional baseline

- Date: 2026-08-09
- Status: accepted repository-preservation decision under Arthur's explicit commit/push authorization
- Decision: use working `app/page.tsx` blob `c24392097af8d578fc1f6cc501dad121ce0cb1fc` in the functional baseline. Preserve the older indexed blob `d44892246c4a8933047c028d2508e194e1ec731a` separately in recovery commit `d35e892bdaabbd66ab36eae4cc32144aa620de44` on `codex/pre-baseline-staged-page-2026-08-09`.
- Why: the working version is the coherent current shell and matches the live-verified Open Project, Drawing, Stick, and Creator flows; the index version is an older monolithic home/new/drawing generation.
- Consequence: the recovery branch is historical and intentionally incomplete, receives no implementation pull request, and must remain until baseline acceptance makes deletion an explicit later decision.

### D-0008 — Use progressive elaboration and risk-calibrated task starts

- Date: 2026-08-10
- Status: accepted project-operating decision under Oliver's explicit sponsor instruction; this accepts no SPEC-0001 owner row
- Decision: make a spec decision-complete and safe for the currently authorized phase, move non-blocking later-phase uncertainty into explicit entry gates or follow-ups, consolidate PM findings into one review round, and require a genuine product/safety/current-phase blocker before another correction round. Start each implementation phase in Codex Plan mode. Use Extra High reasoning by default for PM/spec/normal implementation work, High for small mechanical control-plane or Git work, and Ultra only for genuinely high-risk or conflicting evidence.
- Why: repeated attempts to make all later phases perfect before any implementation consumed a full working day without proportionate product-risk reduction.
- Consequence: this standard does not lower acceptance or regression proof. User-outcome changes, owner choices, material security/privacy/cost/data-loss risk, current-phase feasibility or proof gaps, boundary violations, and protected regressions still block; bounded mechanics and later-phase details do not block earlier safe work.

### D-0009 — Approve SPEC-0001 and authorize Phase 1 only

- Date: 2026-08-11
- Status: accepted by Arthur for `SPEC-0001`
- Decision: approve [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md). Accept OD-01 through OD-06 and OD-09 exactly as written. Approve OD-07, OD-08, OD-10, and OD-11 as governing engineering rules and prerequisites. Defer OD-12 through OD-14, including exact provider model/reasoning/numeric policy, retention, cost-risk choice, and optional paid proof, until the separate Phase 7 Policy Gate.
- Why: the spec now defines one narrow, reversible, human/AI-equivalent Stick animation outcome and divides the work into independently provable phases with explicit safety and publication boundaries.
- Consequence at decision time: SPEC-0001 became active and Approved. Phase 1 alone was Authorized but Not started; Phases 2–7 and the separate browser-harness prerequisite remained Unauthorized/Not started. No provider integration, external lookup, search, Supabase request, retention choice, paid/live request, Git publication, or implementation work was authorized by this approval record. Phase 1 could begin only after that approval state was separately published and integrated into canonical `main`, in a new Plan-mode implementation task. Historical status note: Phase 1 was later completed, Verified, published, and integrated at `21a88feb65cf1cc51138c9ad4879b962ee468569`; D-0010 preserves that result as the exception under the former workflow.

### D-0010 — Separate phase execution from control-plane propagation and publication

- Date: 2026-08-13
- Status: accepted by Arthur as permanent project process
- Decision: every future implementation phase uses four sequential authorities: (1) a Spec Executor exclusively implements and technically tests one authorized phase, creates validated technical proof, returns an Implementation Review Packet, and stops without editing the canonical control plane or Git state; (2) Arthur and the Project Manager accept or reject the implementation; (3) after acceptance and complete executor shutdown, a Control Plane Architect takes exclusive ownership of the same worktree, propagates the accepted result into the canonical control plane, validates the technical manifest, completes final tracked-state/Git proof, returns a Control Plane Architect PM Review Packet, and stops; (4) only a later explicit publication instruction authorizes that architect to stage, commit, integrate into canonical `main`, push, and verify.
- Why: the former combined lifecycle let one task implement behavior, write the authoritative project record, and prepare publication, blurring independent review and increasing regression, stale-memory, and accidental-Git-mutation risk.
- Consequence: a Spec Executor may change only its phase-authorized implementation/fixture/technical-test files and ignored proof artifacts. It must not edit `AGENTS.md`, canonical `docs/`, or `project/project_structure.txt`, and must not stage, commit, merge, push, publish, or mutate another worktree. A Control Plane Architect may not enter that worktree until the executor is stopped and the implementation is accepted, and may not alter accepted runtime/fixture/test bytes. Rejection returns to a separately authorized executor correction task. The two roles never edit one worktree concurrently. In the later authorized publication task, the architect stages only the accepted implementation/reviewed control-plane paths, commits on the phase branch, fast-forwards a clean canonical `main`, pushes, and verifies clean `0/0` synchronization; an advanced `main` or changed path is a stop condition, not permission to pull, merge, rebase, force-push, rewrite history, or expand scope. D-0010 supersedes only the combined executor/control-plane mechanics previously described by D-0009/OD-10; sequential phases, Plan-mode starts, human review, separate publication authorization, and canonical-main integration remain required. SPEC-0001 Phase 1 remains a completed Verified/published/integrated historical exception and is not repeated, rewritten, or republished.

### D-0011 — Approve and authorize SPEC-0001 Phase 1.5 only

- Date: 2026-08-14
- Status: accepted by Arthur for `SPEC-0001` Phase 1.5
- Decision: approve the **Phase 1.5 — Permanent Automatic Browser Tester** amendment and authorize Phase 1.5 only as **Approved; Authorized; Not started**. The tester is a permanent reusable developer tool that remains invisible and unreachable to website users: it may add no tester route, page, button, API, asset, or production import; it may make no permanent application font, style, source, or behavior change; and every temporary test/font setup must be restored byte-for-byte. OpenAI, search, Supabase, paid services, and deployment remain forbidden.
- Why: repeatable, fail-closed browser proof is a prerequisite for safely changing the real Stick workspace in Phase 2, while a product-visible or product-mutating test surface would create unacceptable regression and shipping risk.
- Consequence: Phase 1.5 may begin only in a new Plan-mode Spec Executor task/worktree after this approval record is separately reviewed, published, and integrated into canonical `main` under D-0010. This decision does not begin implementation, authorize Git publication, authorize dependency or external acquisition, or authorize Phase 2 or Phases 3–7. Phase 1 remains Verified, published, and integrated. Phases 2–7 remain **Unauthorized; Not started**, and Phase 2 stays blocked until Phase 1.5 is Verified, accepted, propagated, separately published, and integrated.

### D-0012 — Approve the Phase 1.5 protected-Drawing correction ceiling

- Date: 2026-08-15
- Status: accepted by Arthur for the blocked `SPEC-0001` Phase 1.5 correction
- Decision: approve and authorize the Phase 1.5 correction as **Authorized; Not started/resumed**. Temporary diagnosis may occur only in `src/components/workspace/DrawingWorkspace.tsx` and `src/components/workspace/DrawingCanvas.tsx`. No behavior patch is allowed until diagnostics identify the first clearing writer. Any permanent runtime change is limited to the proven smallest subset of those two files. If diagnosis requires a third runtime file, a broad rewrite, or unrelated behavior change, the correction stops without expanding scope.
- Why: the stopped fail-closed tester proved that deterministic Drawing pixels appeared and then disappeared during final AI settlement, while existing evidence cannot distinguish the first clearing authority between the workspace restore/publication path and the canvas reset path. The two-file ceiling permits evidence collection at both known boundaries without pre-authorizing a guessed fix.
- Consequence: the stopped Phase 1.5 result remains blocked, unaccepted, unpublished, and without a valid proof manifest. A separately authorized Plan-mode correction Spec Executor may resume the stopped worktree only after this approval record is reviewed, separately published, and integrated under D-0010. `app/layout.tsx`, application fonts/styles, Drawing contracts/routes/planner/executor, Stick behavior, external services, Phase 2, and all later phases remain outside scope. OpenAI, search, Supabase, paid services, deployment, Git publication, worktree deletion, and recovery-branch use remain unauthorized.

### D-0013 — Approve SPEC-0002 and authorize Phase 1 only

- Date: 2026-08-15
- Status: accepted by Arthur for `SPEC-0002`
- Decision: Arthur explicitly approved: “I approve SPEC-0002. I accept OD2-01 through OD2-08 as written. I authorize Phase 1 only. SPEC-0002 Phase 2 and SPEC-0001 Phase 2 remain unauthorized.”
- Why: the specification defines a bounded, lossless local Drawing persistence foundation, separates the hidden format/storage engine from later real Save/Open wiring, and includes finite capacity, last-good preservation, strict legacy handling, offline proof, and conflict gates.
- Consequence: [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](specs/0002-lossless-local-drawing-save-and-reopen.md) is Approved and active for this bounded work. OD2-01 through OD2-08 are accepted exactly as written. SPEC-0002 Phase 1 is **Authorized; Not started** and may begin only after this approval record is reviewed, separately published, and integrated into canonical `main`, in one new Plan-mode Spec Executor worktree from the then-current canonical-main SHA. SPEC-0002 Phase 2 and SPEC-0001 Phase 2 and later phases remain **Unauthorized; Not started**. The activation audit at `365e68fe98b27e993a1c5645c3e28c7b428c6f33` found clean synchronized canonical `main`, no active SPEC-0001 executor or architect, and a Phase 1 allowlist consisting only of new files with no overlap in SPEC-0001 runtime files or the shared tester core. Any real future overlap is a hard stop. This decision begins no implementation and authorizes no staging, commit, push, merge, publication, deployment, external request, or paid service.

### D-0014 — Authorize SPEC-0002 Phase 2 only

- Date: 2026-08-16
- Status: accepted by Arthur for `SPEC-0002` Phase 2
- Decision: Arthur explicitly authorized SPEC-0002 Phase 2 — Real Save/Open Wiring and Browser Proof as **Authorized; Not started**. This authorization covers only the existing Phase 2 scope and proof boundary in [`SPEC-0002`](specs/0002-lossless-local-drawing-save-and-reopen.md); it does not approve a runtime change in this control-plane task.
- Why: Phase 1 is Verified, published, and integrated, and the fresh audit at canonical `main`/`origin/main` `4835244e522c0f4206af8946a631d9244f2c9945` confirmed clean `0/0` synchronization, an unwired V2 engine, no active Phase 2 executor, no canonical SPEC-0003 file, and no file overlap with SPEC-0001 Phase 2's Stick-only boundary.
- Consequence: SPEC-0002 Phase 2 is **Authorized; Not started**. After this activation packet is reviewed and D-0014 is separately published to canonical `main`, exactly one new exclusive Plan-mode SPEC-0002 Phase 2 Spec Executor task may begin from that published authorization SHA and must refresh the conflict audit before implementation. It must run sequentially: no overlapping executor may touch `app/page.tsx`, Drawing persistence/navigation, or shared browser proof. SPEC-0001 Phase 2 and later phases remain **Unauthorized; Not started**; SPEC-0003 remains absent from canonical `main` and untouched. This decision authorizes no implementation in this task and no staging, commit, push, merge, publication, deployment, external request, paid service, or recovery-branch use.

### D-0015 — Authorize SPEC-0001 Phase 2 only after SPEC-0002 completion

- Date: 2026-08-17
- Status: accepted by Arthur for `SPEC-0001` Phase 2; activation record published in `a85690de9396cf97e3063005cbb6da85f109ae1d`
- Decision: Arthur authorized the dependency-safe sequence **SPEC-0002 Phase 2, then SPEC-0001 Phase 2, then whole SPEC-0003**. SPEC-0002 Phase 2 is now Verified, published, integrated, and durably complete at `af89b26c89d83eb61f77d91b4a50c105b7c12079`. SPEC-0001 Phase 1 and Phase 1.5 remain Verified/published/integrated. SPEC-0001 Phase 2 — Independent per-frame Stick state — is **Authorized; Not started**. Phases 3–7 remain **Unauthorized; Not started**.
- Why: the published SPEC-0002 work completes the earlier Drawing persistence dependency before Stick work begins, while SPEC-0001 Phase 2 is the next bounded foundation required for the human-built three-pose/12-frame wave and later reversible AI execution. The fresh audit found clean synchronized canonical `main` at `af89b26c89d83eb61f77d91b4a50c105b7c12079`, no active executor or dirty worktree owning the exact Phase 2 Stick allowlist, and the separate SPEC-0003 proposal only in its own dirty documentation worktree. SPEC-0002 completed first because it and later SPEC-0003 work both use `app/page.tsx`; no SPEC-0003 byte is copied or activated here.
- Consequence: after this D-0015 activation record is separately reviewed, published, and integrated, exactly one new dedicated Plan-mode SPEC-0001 Phase 2 Spec Executor task/worktree may begin from that activation publication SHA and must repeat the conflict audit. Its scope is exactly SPEC-0001 §10.5: independent per-frame Stick state, the built-in editable figure, the no-AI manual three-pose/12-frame wave, equal manual editability for all 11 joints, the derived line head, and exact transient drag/pointer-up/cancel safety. History, storage, Open Project, AI/chat/API/provider work, SPEC-0003, and later phases remain outside scope. The permanent tester and exact Phase 2 technical-proof contract remain mandatory. This decision authorizes no implementation in this control-plane task, no staging/commit/push/merge/publication, and no external request, OpenAI, search, Supabase, paid service, or deployment.

### D-0016 — Approve and authorize the SPEC-0001 Phase 1.5 proof-compatibility correction

- Date: 2026-08-17
- Status: accepted by Arthur under his explicit autopilot authorization and accepted by the Project Manager
- Decision: approve the exact SPEC-0001 §10.4A **Phase 1.5 Compatibility Correction for Phase 2 Proof** as **Approved; Authorized; Not started**. Its implementation ceiling is exactly the 23 proof-infrastructure paths listed in §10.4A. It changes no user-facing behavior, product outcome, or owner choice. The same immutable version-2 plan must support both dirty-executor and clean-committed proof through exact `dirtyExpectedPaths` and `cleanExpectedPaths`, with state derived from real Git-visible bytes. The correction catalog pre-authorizes only the future Phase 2 paths, schemas, operation families, output root, and §10.5 ceiling; future Phase 2 byte lengths and SHA-256 bindings are established only when Phase 2 creates those files and are not pre-known or pre-recorded by this correction.
- Why: fresh tracing at published activation base `a85690de9396cf97e3063005cbb6da85f109ae1d` proved a genuine proof-infrastructure feasibility blocker: the permanent runner ignores the required plan, loads no later-phase registry/action module, rejects legitimate later-phase dirty sets, and hard-codes a historical lint tuple. The accepted §10.4A correction makes the already-approved Phase 2 proof executable without widening Phase 2 or changing the product.
- Consequence: historical Phase 1 and Phase 1.5 remain Verified, published, and integrated. SPEC-0001 Phase 2 remains **Authorized; Not started; blocked** until this exact correction is implemented by one Plan-mode Spec Executor, technically accepted, propagated under D-0010, separately published/integrated, and followed by a new activation SHA/executor record. Phases 3–7 remain **Unauthorized; Not started**. This control-plane task begins no implementation and authorizes no later phase, external request, OpenAI, search, Supabase, paid service, deployment, staging, commit, merge, push, or publication. The correction itself may begin only after this D-0016 record is separately reviewed, published, and integrated into canonical `main`.

## Provisional Legacy Classifications

### D-0006 — Preserve the V1 motion-tween specification for reconciliation

- Date: 2026-08-09
- Status: provisionally promoted legacy intent; Arthur confirmation and current acceptance rerun pending
- Decision: `diamond-animator-docs/02_animation_engine/MOTION_TWEEN_SYSTEM.md` remains the best detailed legacy description of intended V1 drawing motion-tween behavior and must be read before related work. This audit does not retroactively claim owner approval, and the latest user instruction or an accepted superseding decision prevails.
- Why: it is the only existing subsystem document with detailed scope, data model, debug path, and acceptance suite.
- Consequence: motion-tween tasks must read it, rerun/reconcile its acceptance flow, and record any code/spec mismatch before changing either. A mismatch is evidence to resolve, not automatic proof that live code or the document wins.

## Pending Product Decisions

### P-0001 — Launch role of the Drawing Workspace

- Status: pending Arthur
- Question: equal launch pillar, supporting renderer/tooling surface, or later phase?
- Needed before: committing to launch scope or large drawing-only feature work.

### P-0002 — Official product name

- Status: pending Arthur
- Question: “Diamond Animator” or “Diamond Animator Pro”?
- Needed before: brand/UI/documentation normalization.

### P-0003 — Definition of professional-grade

- Status: pending product spec
- Question: which measurable gates cover visual clarity, motion continuity, timing, editability, fidelity, export, latency, and failure rate?
- Needed before: accepting AI or manual animation milestones.

### P-0004 — AI transaction semantics

- Status: pending product/architecture spec
- Question: which commands preview, auto-apply, request confirmation, or require reversible transactions?
- Needed before: enabling broad Other/actions or stick-workspace AI control.
- Narrow SPEC-0001 resolution: D-0009 accepts Preview → explicit Apply and one atomic reversible transaction for the single approved Stick action only; the product-wide question remains pending.

### P-0005 — Cost and latency policy

- Status: pending Arthur/product economics
- Question: target cost, latency, token, retry, search, and model-escalation ceilings; mapping to credits.
- Needed before: production AI defaults and paid regression gates.
- SPEC-0001 status: OD-12 is explicitly deferred to the separate Phase 7 Policy Gate; D-0009 accepts no model, price, token, latency, or paid-request value.

### P-0006 — First usable manual stick feature set

- Status: pending product spec
- Question: minimum creator, rig, pose, timeline, tween, history, library, persistence, and export controls for a usable release.
- Needed before: Phase 2 implementation.

### P-0007 — Data/search/privacy policy

- Status: pending product/legal/security decision
- Question: what workspace/project data can be sent to model/search providers, retained remotely, and logged locally?
- Needed before: public deployment.
- Narrow SPEC-0001 resolution: D-0009 accepts session-only transcript, minimized provider projection, search/tools off, and zero application-persistent Stick AI logs for this slice; provider retention and product-wide policy remain pending through OD-13/P-0007.

### P-0008 — AI-first stick vertical-slice sequencing

- Status: pending Arthur/product architecture
- Question: what minimum shared stick state model, reversible executor, persistence, and human corrective controls must exist before the first AI-led stick-animation slice, and which broader manual-editor controls can follow it?
- Needed before: committing Phase 2/Phase 3 implementation order.
- Narrow SPEC-0001 resolution: D-0009 accepts the seven-phase sequence, shared manual/AI mutation authority, bounded human safety floor, and separate browser-harness prerequisite for this slice; broader release sequencing remains pending.
