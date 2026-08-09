# Diamond Animator Control Plane

Status: canonical repository memory
Established: 2026-08-09
Last reconciled with live code: 2026-08-09
Snapshot basis: working tree on `rescue-before-restore` at `1691afb`

## Purpose

This directory is the single control plane for Diamond Animator. It exists so a new Codex task can recover the product direction, actual implementation state, current priorities, active specification, decisions, verification baseline, and exact handoff without relying on chat history.

`AGENTS.md` is the automatic bootloader. This file is the navigation and authority layer it loads.

## Required Read Order

Every task begins in this order:

1. `AGENTS.md`
2. This file
3. `00_MASTER_PROJECT.md`
4. `PROJECT_MANAGER_CONTEXT.md`
5. `CURRENT_STATE.md`
6. `TODO.md`
7. `DECISIONS.md`
8. `SESSION_HANDOFF.md`
9. `specs/README.md`
10. The active spec, if one is named in `SESSION_HANDOFF.md`
11. Relevant architecture, testing, AI, and domain reference files
12. The live code and real application path

## Canonical Files

| File | Canonical responsibility | Update trigger |
| --- | --- | --- |
| `00_MASTER_PROJECT.md` | Product charter, intended users, product principles, strategic boundaries | Product direction changes |
| `PROJECT_MANAGER_CONTEXT.md` | Owner context, latest direction, collaboration expectations, unresolved product questions | PM direction or constraints change |
| `CURRENT_STATE.md` | Current evidence-backed implementation and quality state | A task changes or disproves current state |
| `architecture.md` | Runtime path, subsystem ownership, data flow, and protected hotspots | Architecture or ownership changes |
| `AI_SYSTEM.md` | Current AI architecture, task availability, prompt assets, cost and safety gaps | AI behavior or policy changes |
| `ROADMAP.md` | Ordered product and engineering phases | Priorities or phase definitions change |
| `TODO.md` | Actionable work queue with stable IDs and proof conditions | Work is added, blocked, started, or completed |
| `DECISIONS.md` | Accepted and pending durable decisions | A durable decision is made or superseded |
| `TERMINOLOGY.md` | Canonical product, workspace, AI, and animation vocabulary | Terms are added or normalized |
| `testing_workflow.md` | Verification tiers, current gate baseline, and regression matrix | Tooling or required proof changes |
| `specs/README.md` | Spec lifecycle, active-spec index, and promotion rules | A spec is created or changes status |
| `SESSION_HANDOFF.md` | Exact last-known stopping point and next start point | End of every state-changing task |
| `changelog.md` | Append-only record of meaningful changes | Meaningful behavior/control-plane change |
| `baselines/2026-08-09-repository-audit.md` | Frozen initial repository snapshot | Corrections only; never roll forward |
| `archive/README.md` | Classification of legacy, duplicate, and non-normative material | Archival status changes |

## Source-of-Truth Precedence

Use different chains for intent and reality.

For **intended behavior and authorization**:

1. the user's latest explicit instruction
2. `AGENTS.md` for the required working/proof method
3. an approved, non-superseded spec and accepted decision

For **factual current behavior**:

1. fresh real-app observation, executed checks/tests, logs, and directly traced live code, reconciled together
2. `CURRENT_STATE.md` and `SESSION_HANDOFF.md` as dated snapshots
3. `diamond-animator-docs/`, build-book prose, paste packs, spreadsheets, old logs, and old checklists as reference or history unless provisionally promoted by `specs/README.md`

If documentation and code disagree, do not silently rewrite one to match the other. Record the mismatch, prove the real path, and decide separately whether the implementation or the intended behavior should change.

## Evidence Labels

Control-plane claims use these labels:

- **Live verified**: observed in the running app during the dated flow.
- **Code verified**: traced directly through current source.
- **Check verified**: proven by a named deterministic command.
- **Intended**: approved product direction not yet proven in the app.
- **Risk**: evidence-backed concern that still needs a dedicated reproduction.
- **Unknown**: not inspected or not safely testable in the current pass.

Never turn a risk into a confirmed bug or an intention into an implemented feature without proof.

## Documentation Boundaries

`docs/` owns current project memory. `diamond-animator-docs/` remains a domain reference library. Its motion-tween specification is only provisionally promoted in `specs/README.md`; its other files remain non-normative until reconciled.

Do not create another current-state file, TODO, changelog, roadmap, decision log, or handoff under a different directory. Historical notes may be preserved, but they must point back here and carry a clear archival label.

## End-of-Task Memory Contract

For every task that changes code, behavior, architecture, priorities, or proof:

1. Update the active spec with implementation and verification evidence.
2. Update `CURRENT_STATE.md` only where reality changed.
3. Move or close the relevant stable IDs in `TODO.md`.
4. Append a dated entry to `changelog.md`.
5. Record durable decisions in `DECISIONS.md`.
6. Rewrite `SESSION_HANDOFF.md` so the next task can start without chat history.
7. Run `bash scripts/update_memory.sh` to validate memory and regenerate the sanitized tree. Use `--check-only` only for a read-only task with no filesystem changes.
8. Report the exact git state. Never auto-stage or auto-commit.
