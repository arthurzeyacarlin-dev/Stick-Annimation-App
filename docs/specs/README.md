# Specification Index and Lifecycle

Status: canonical spec registry
Last updated: 2026-08-17

## Active Specs

| Spec | Status | Active authorization |
| --- | --- | --- |
| [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](0001-first-reversible-ai-stick-animation.md) | Approved | Phase 1 and Phase 1.5 are **Verified, published, and integrated**. D-0015 authorizes Phase 2 only as **Authorized; Not started**, pending separate publication/integration of this activation record. Phases 3–7 are **Unauthorized; Not started**. |
| [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](0002-lossless-local-drawing-save-and-reopen.md) | Approved | Phase 1 and Phase 2 are **Verified, published, integrated, and durably complete**. Phase 2 publication commit is `af89b26c89d83eb61f77d91b4a50c105b7c12079`; technical-manifest SHA-256 is `0a5ea38f8146641430d37ddc272fa0b1169181252b596e0ba14886c2bb4f2657`; closeout-manifest SHA-256 is `00f7f07e05b43e685b350e512c152421c51d741297bc55cb4d59e3974e265191`. |

## Proposed Specs

No additional specification is currently Proposed.

SPEC-0002 approves a strict version-2 local Drawing record, lossless raster/audio assets, non-destructive version-1 compatibility, transactional failure safety, finite capacity, and truthful Save/Open presentation. Its corrected Phase 1 implementation remains published/integrated in exact commit `0416fc3828a863a797ee9f1c3daa8508792ac64a`; technical-manifest SHA-256 remains `2d20a4a63103618505b60cf590835191841d1c1968bc2bc14ef2c953253243a1` and closeout-manifest SHA-256 remains `b2d50852cffa40dbf3d7535665a12abe66439cfceeffc61d6eb56195ff947b3c`. Phase 2 began from exact published compatibility-correction base `e85003089e793791f9a191a56b29c1c377ef5d26`, passed the clean pre-edit permanent tester, wired the accepted engine into real Drawing Save/Open/Delete, and passed all 12 receipts, the 22-step two-viewport application proof, REG-01–REG-10, and 20 validator mutation classes. The accepted result was published/integrated in exact 21-path commit `af89b26c89d83eb61f77d91b4a50c105b7c12079`, parent `e85003089e793791f9a191a56b29c1c377ef5d26`, message `Implement SPEC-0002 Phase 2 local persistence`. The integrated-current-head permanent tester passed with 40 operations, 13 screenshots, exactly one deterministic mocked Drawing request, and zero real API/non-loopback requests. Technical-manifest SHA-256 remains `0a5ea38f8146641430d37ddc272fa0b1169181252b596e0ba14886c2bb4f2657`; closeout-manifest SHA-256 is `00f7f07e05b43e685b350e512c152421c51d741297bc55cb4d59e3974e265191`. SPEC-0002 is durably complete.

The active Approved SPEC-0001 contains D-0011's Phase 1.5 tester approval and D-0012's narrow conditional Drawing correction approval. The corrected implementation stayed inside that boundary and was subsequently accepted through D-0010's executor/review/architect lifecycle.

Phase 1.5 was published and integrated in exact canonical-main implementation commit `8df64552e29e4170df8000097fe857b7a31dff69` (parent `3768226fd3aa3668a6cf7260da8476ceea0a084e`) with the reviewed 35-path scope; its six-document control-plane publication record was published in commit `687cbeaf6acbf9625e0d940e78bc600251eb0604`. D-0015 now authorizes SPEC-0001 Phase 2 only as Not started. After this activation record is separately reviewed, published, and integrated, one new Plan-mode Phase 2 Spec Executor task/worktree may begin from that publication SHA after a refreshed conflict audit. Phases 3–7, the Phase 7 Policy Gate, provider choices, external lookups, and paid/live requests remain unauthorized.

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

1. one Spec Executor task and worktree executes and technically tests exactly one authorized phase;
2. the executor creates and validates the technical proof manifest, returns an Implementation Review Packet, and stops without control-plane or Git mutation;
3. Arthur and the Project Manager accept or reject that implementation;
4. only after acceptance and executor shutdown may a Control Plane Architect take exclusive ownership of the same worktree, update the canonical control plane, validate the technical evidence, complete final tracked-state proof, return its own PM Review Packet, and stop;
5. both packets are review evidence and neither authorizes staging, committing, merging, pushing, or publication;
6. only a later explicit publication instruction authorizes the Control Plane Architect to publish and integrate the accepted phase; and
7. the next phase starts in a new Spec Executor task only after the preceding phase is Verified and durably integrated into canonical `main`.

Every implementation phase starts in Codex Plan mode for evidence refresh, execution-path tracing, and a phase-bounded plan before implementation begins.

The Spec Executor may write only the phase-authorized implementation/fixture/technical-test boundary plus ignored proof artifacts. Canonical spec/status/TODO/decision/changelog/handoff propagation belongs only to the Control Plane Architect. The roles never edit the same worktree concurrently; transfer is sequential and recorded after the executor has completely stopped.

SPEC-0001 Phase 1 is the completed historical exception under the previous combined lifecycle. Its Verified, published, and integrated status is preserved.

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

After Arthur and the Project Manager accept a phase implementation, the Control Plane Architect—not the Spec Executor—performs the required end-of-phase updates:

1. add its final evidence and exact files changed
2. update `../CURRENT_STATE.md`
3. close/move its `../TODO.md` IDs
4. append `../changelog.md`
5. record durable choices in `../DECISIONS.md`
6. update this index and `../SESSION_HANDOFF.md`
7. run the control-plane and relevant code gates

Do not mark Verified when any required acceptance flow remains unproven. Stop after the Control Plane Architect PM Review Packet; Git publication remains separately authorized.
