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

### P-0005 — Cost and latency policy

- Status: pending Arthur/product economics
- Question: target cost, latency, token, retry, search, and model-escalation ceilings; mapping to credits.
- Needed before: production AI defaults and paid regression gates.

### P-0006 — First usable manual stick feature set

- Status: pending product spec
- Question: minimum creator, rig, pose, timeline, tween, history, library, persistence, and export controls for a usable release.
- Needed before: Phase 2 implementation.

### P-0007 — Data/search/privacy policy

- Status: pending product/legal/security decision
- Question: what workspace/project data can be sent to model/search providers, retained remotely, and logged locally?
- Needed before: public deployment.

### P-0008 — AI-first stick vertical-slice sequencing

- Status: pending Arthur/product architecture
- Question: what minimum shared stick state model, reversible executor, persistence, and human corrective controls must exist before the first AI-led stick-animation slice, and which broader manual-editor controls can follow it?
- Needed before: committing Phase 2/Phase 3 implementation order.
