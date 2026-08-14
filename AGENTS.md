## Required Working Method

Always follow this workflow on every implementation task:

1. First understand the exact goal.
2. Re-read the live code deeply before changing anything.
3. Trace the real execution path before coding.
4. Add temporary logs only if needed.
5. Break user actions into exact steps if needed.
6. Go into the real app manually if needed.
7. Use Playwright/browser verification if needed.
8. Patch narrowly.
9. Re-read the touched code after patching.
10. Verify again in the real app after patching.
11. Check for regressions immediately.
12. Keep looping until the goal is actually achieved.

This is a required analyze → patch → verify → re-analyze loop.

Do not stop after one attempt if the result is uncertain.
Do not stop because the code compiles.
Do not stop because one probe passed.
Do not stop because the result seems “close enough.”

Keep repeating:
- analyze
- patch
- verify
- re-analyze
- patch again if needed
- verify again

until you are 99–100% sure the actual goal is achieved and no unrelated regression remains.

## Required Verification Standard

Before finishing, you must verify:
- the exact user-reported issue
- the exact user flow that triggered it
- the final visible behavior in the real app when applicable
- whether anything unrelated broke
- what changed and what did not change

If something leaked into an unrelated system, fix it before finishing.

## Required Final Output

Do not stop to ask for approval before the PM Review Packet.
Do not add an approval gate.
Do not end with “Please review before I finalize.”
Do not pause the workflow unless the user explicitly asks you to stop.

When you are truly done, output a full PM Review Packet directly.

The PM Review Packet must always include:
1. Root cause
2. Exact fix
3. Why it works
4. What was touched
5. What was not touched
6. Verification results
7. Regression check results
8. Risks/watchouts if any remain
9. Exact files changed
10. Exact systems intentionally left unchanged

Be explicit:
- say exactly what you touched
- say exactly what you did not touch
- say exactly what you fixed
- say exactly what you did not fix
- say exactly what you verified
- say exactly what is proven vs not proven

For a phased implementation spec, one **Spec Executor** task may execute exactly one authorized phase. It completes the phase's implementation, technical tests, proof manifest, and Spec Executor Implementation Review Packet, then stops. It must not update the canonical control plane or stage, commit, merge, push, or publish.

After the Spec Executor has completely stopped, Arthur and the Project Manager accept or reject the implementation. Rejected work returns to a separately authorized Spec Executor correction task. Accepted work may transfer to a **Control Plane Architect**, which takes exclusive ownership of the same worktree, verifies the accepted implementation and technical evidence, updates the canonical control plane, runs the final tracked-state closeout and Git checks, returns a Control Plane Architect PM Review Packet, and stops with an empty index.

Neither packet authorizes Git publication. Only a later explicit publication instruction authorizes the Control Plane Architect to stage the exact approved implementation and control-plane paths, commit them, integrate them into canonical `main`, push, and verify synchronization. A later phase starts in a new Spec Executor task only after the preceding phase and its control-plane record are durably integrated into canonical `main`.

## Strict Task Role and Worktree Separation

### Spec Executor

- Starts every implementation phase in Plan mode from the exact authorized canonical-main SHA and uses one dedicated phase worktree.
- Owns that worktree exclusively while active and may change only the phase-authorized runtime, fixture, technical-test, and proof files plus ignored proof artifacts.
- Must not edit `AGENTS.md`, any canonical file under `docs/`, or `project/project_structure.txt`.
- Must not stage, commit, merge, push, publish, deploy, or mutate another worktree.
- Creates and independently validates the technical proof manifest, reports its SHA and exact dirty-path allowlist, returns the Implementation Review Packet, and completely stops.

### Arthur and Project Manager

- Review the implementation packet and accept or reject the technical result.
- Do not treat executor self-reporting as control-plane propagation or publication.
- Authorize correction, ownership transfer, and publication separately.

### Control Plane Architect

- May take over the implementation worktree only after the Spec Executor has completely stopped and Arthur and the Project Manager have accepted the implementation.
- Before editing, verifies the accepted base/branch, empty index, exact implementation allowlist, proof-manifest hash, worktree status, and exclusive ownership.
- Must not change the accepted runtime, fixture, or technical-test implementation. If those bytes need correction, stop and return the work to a Spec Executor.
- Owns canonical spec/status/TODO/decision/changelog/handoff propagation, `bash scripts/update_memory.sh`, technical-manifest revalidation, final tracked-state closeout, and the Control Plane Architect PM Review Packet.
- Stops before staging. A separate explicit publication instruction is always required.
- In the later publication task, stages only the accepted implementation and reviewed control-plane paths, commits on the phase branch, fast-forwards a clean canonical `main`, pushes `origin/main`, and verifies clean `0/0` synchronization. If canonical `main` advanced or any path differs, stop without pull, merge, rebase, force-push, history rewrite, or scope expansion.

No Spec Executor and Control Plane Architect may edit the same worktree at the same time. Worktree ownership transfer is sequential, explicit, and recorded in the returned packets.

SPEC-0001 Phase 1 is a completed historical exception under the former combined workflow. It remains Verified, published, and integrated; do not repeat, rewrite, or republish it.

## Progressive Specification and Review Standard

Specifications must be safe and decision-complete for the work they authorize; they do not need to predict every later implementation detail perfectly.

- Make the currently authorized phase exact enough to implement and verify safely.
- Record a later-phase uncertainty as a named entry gate, prerequisite, or follow-up decision when it does not change the accepted user outcome or the current phase.
- Treat an issue as an approval blocker only when it changes the user outcome or an owner choice; creates material security, privacy, cost, data-loss, or external-service risk; makes the current phase infeasible or unprovable; breaks an authorized file/system boundary; or weakens a protected regression.
- Allow bounded engineering mechanics to be resolved during the authorized phase when they preserve the accepted outcome, scope, safety boundaries, and proof. Material changes return to the owner or Spec Architect.
- Consolidate PM review findings into one review packet. After one correction round, return a spec again only for a genuine blocker under the rule above; record non-blocking refinements for the relevant phase instead of chasing speculative completeness.
- Start every implementation-phase task in Codex Plan mode for boot, evidence refresh, execution-path tracing, and an exact phase plan. Plan mode does not authorize repository mutation, later phases, Git publication, or external/paid operations; implementation begins only after leaving Plan mode under the phase's existing authorization.

## Required Control-Plane Boot Sequence

`AGENTS.md` is the automatic bootloader for repository continuity. At the start of every task, before planning or editing:

1. Run `git status --short --branch` and preserve all existing work.
2. Read `docs/README.md` for source-of-truth precedence and the canonical file map.
3. Read `docs/00_MASTER_PROJECT.md`, `docs/PROJECT_MANAGER_CONTEXT.md`, `docs/CURRENT_STATE.md`, `docs/TODO.md`, `docs/DECISIONS.md`, and `docs/SESSION_HANDOFF.md`.
4. Read `docs/specs/README.md`, then the active spec named in `docs/SESSION_HANDOFF.md`, if one exists.
5. Read the relevant system references named by the active spec or `docs/architecture.md`.
6. Re-check the live code and real behavior. Documentation is context, not a substitute for tracing the current execution path.

Do not skip this sequence because a task looks small or because a previous chat supplied context.

## Source-of-Truth Precedence

Use two separate authority chains. Do not let intended behavior masquerade as
implemented behavior, or stale implementation evidence override a product decision.

For **intended behavior and work authorization**:

1. The user's latest explicit instruction.
2. This `AGENTS.md` working method.
3. An approved, non-superseded feature spec and accepted entries in `docs/DECISIONS.md`.

For **what the repository and application actually do now**:

1. Newly verified real-app behavior, executed checks/tests, logs, and directly traced live code. Reconcile disagreements among these forms of evidence rather than choosing whichever is convenient.
2. `docs/CURRENT_STATE.md` and `docs/SESSION_HANDOFF.md` as dated last-recorded snapshots.
3. `diamond-animator-docs/` and archived material as design intent or history only, unless a file is explicitly and provisionally promoted in `docs/specs/README.md`.

Never silently choose one side of a conflict. Record the conflict in the active spec or `docs/DECISIONS.md`, then resolve intended behavior with user direction and current behavior with fresh evidence.

## Required Spec and Memory Updates

Every non-trivial behavior change or bug fix must have one active spec under `docs/specs/`. The spec must define the exact goal, current behavior, execution path, scope, non-goals, acceptance flow, regression boundaries, and proof required before implementation begins.

The Spec Executor never performs the updates below. After an accepted implementation and exclusive worktree transfer, the Control Plane Architect updates the affected control-plane files before its final packet:

- active spec status and verification evidence
- `docs/CURRENT_STATE.md` when the live system state changed
- `docs/TODO.md` when priorities or completion state changed
- `docs/changelog.md` for a meaningful behavior or control-plane change
- `docs/SESSION_HANDOFF.md` with the exact next starting point
- `docs/DECISIONS.md` when a durable decision was made

Do not create competing current-state, TODO, changelog, or handoff files elsewhere. Control-plane propagation never auto-stages or auto-commits. Publication is a later Control Plane Architect task under separate explicit authorization.
