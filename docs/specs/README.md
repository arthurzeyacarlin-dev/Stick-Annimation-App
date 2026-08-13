# Specification Index and Lifecycle

Status: canonical spec registry
Last updated: 2026-08-13

## Active Spec

| Spec | Status | Active authorization |
| --- | --- | --- |
| [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](0001-first-reversible-ai-stick-animation.md) | Approved | Phase 1 is **Verified, published, and integrated into canonical `main`**. The browser-harness prerequisite and Phases 2–7 remain unauthorized and not started. |

## Proposed Specs

None.

Exact next step: stop after the completed Phase 1 publication. The browser harness remains a separate, currently unauthorized specification/implementation prerequisite before Phase 2. Phases 2–7 remain Unauthorized/Not started. The Phase 7 Policy Gate, provider choices, external lookups, and paid/live requests remain deferred and unauthorized.

## Provisionally Promoted Legacy References

| Spec | Status | Authority and caveat |
| --- | --- | --- |
| `../../diamond-animator-docs/02_animation_engine/MOTION_TWEEN_SYSTEM.md` | Provisionally promoted legacy V1 intent; implementation present; owner confirmation and current verification pending | Best detailed inherited reference for drawing position-only motion tween, not a newly approved spec. Full acceptance was not rerun on 2026-08-09. Latest user direction and accepted superseding decisions prevail; any code/spec mismatch must be recorded and reconciled before changing either. |

No file under `diamond-animator-docs/` is currently an approved implementation specification. The row above is a mandatory reconciliation reference only.

## File Naming

New specs use:

```text
docs/specs/NNNN-short-kebab-case-title.md
```

Numbers are monotonic and never reused. The first new spec is `0001-...`.

## Lifecycle

| Status | Meaning |
| --- | --- |
| Draft | Being researched; no implementation authorization |
| Proposed | Goal/scope/proof ready for PM decision |
| Approved | Arthur or the current explicit task authorized implementation |
| In progress | Implementation and verification loop is active |
| Implemented | Code is patched, but required verification is not complete |
| Verified | Acceptance and regression gates passed; control plane updated |
| Blocked | Cannot proceed within current authority after the required blocked threshold/process |
| Superseded | Replaced by a named newer spec/decision |
| Abandoned | Deliberately stopped; reason preserved |

Only one spec should be `In progress` unless independent concurrency is documented in both specs and the handoff.

## Phase Execution and Integration

For a phased implementation spec:

1. one implementation task and worktree executes exactly one authorized phase;
2. that task completes the phase stop gate, acceptance and regression proof, required control-plane updates, and full PM Review Packet;
3. the packet is review evidence and does not itself authorize staging, committing, or pushing;
4. Git publication occurs only after an explicit post-packet instruction; and
5. the next phase starts in a new task only after the preceding phase is Verified and durably integrated into canonical `main`.

Every implementation phase starts in Codex Plan mode for evidence refresh, execution-path tracing, and a phase-bounded plan before implementation begins.

## Progressive Elaboration and Review Threshold

Approval requires a safe, decision-complete user outcome and an implementable, verifiable current phase—not perfect foreknowledge of every later mechanic. Later-phase uncertainty should become a named entry gate, prerequisite, or follow-up unless it changes the accepted outcome or blocks the current phase.

A spec returns for another correction round only when a consolidated review finds a genuine blocker: an unresolved owner choice or user-outcome change; material security, privacy, cost, data-loss, or external-service risk; an infeasible or unprovable current phase; an authorization-boundary conflict; or a protected regression. Bounded engineering details may be settled inside the authorized phase only when scope, safety, and acceptance remain unchanged.

## Promotion Rules

A design note becomes an approved spec only when it contains:

- exact user goal and current problem
- evidence from live code/behavior
- explicit scope and non-goals
- real execution path and data/state impact
- exact user action sequence
- measurable acceptance criteria
- protected regression boundaries
- cost/security/privacy/dependency impact
- required verification commands and real-app flows
- status, owner/decision link, and last verified date/commit

Thin architecture prose, chat logs, paste packs, TODO entries, code comments, and test scripts are not specs by themselves.

## Required End-of-Spec Updates

When a spec reaches Verified:

1. add its final evidence and exact files changed
2. update `../CURRENT_STATE.md`
3. close/move its `../TODO.md` IDs
4. append `../changelog.md`
5. record durable choices in `../DECISIONS.md`
6. update this index and `../SESSION_HANDOFF.md`
7. run the control-plane and relevant code gates

Do not mark Verified when any required acceptance flow remains unproven.
