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

For a phased implementation spec, one implementation task may execute exactly one authorized phase. It must complete that phase's stop gate, required acceptance and regression proof, control-plane updates, and full PM Review Packet, then stop before Git publication. The packet is review evidence, not authorization to stage, commit, or push. Those Git actions require an explicit instruction after packet review. A later phase starts in a new task only after the preceding phase is Verified and its explicitly authorized commit and push are durably integrated into canonical `main`.

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

Before finishing a task that changes repository behavior or project state, update the affected control-plane files:

- active spec status and verification evidence
- `docs/CURRENT_STATE.md` when the live system state changed
- `docs/TODO.md` when priorities or completion state changed
- `docs/changelog.md` for a meaningful behavior or control-plane change
- `docs/SESSION_HANDOFF.md` with the exact next starting point
- `docs/DECISIONS.md` when a durable decision was made

Do not create competing current-state, TODO, changelog, or handoff files elsewhere. Do not auto-stage, auto-commit, or overwrite existing work as part of a memory update.
