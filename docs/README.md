# Diamond Animator Control Plane

Status: canonical repository memory
Established: 2026-08-09
Last reconciled with live code and current records: 2026-09-27 through D-0151 cleanup/publication authority and D-0150 planning. Last accepted SPEC-0015 runtime is Phase 2 under D-0148/GIT-104; GIT-105 `cfcdaf05dfa2faad02a9c291d4a2252ddbee8dfd` published records only. Phase 1 is integrated in GIT-103 `02a80577f562e9524d2e177c222d19f99f517278`; Phase 2 in GIT-104 `5f0fbb673e54d530889113115fba5f9c3c94b55f`. SPEC-0014 Phases 1–2 and 4 remain published/integrated; Phase 3 Export is rejected/unpublished, with no Phase 5.
Snapshot basis: pull request `#1` merged into `main` as `093bbac82fd3b4d97984448b6c6dbd716153354d`; functional anchor `c7de444536f3e0dd578a2063f70b0914e6af60b1`; tag `baseline-2026-08-09-control-plane`; SPEC-0014 Phase 1 GIT-099 `06365eacffe493ea3550de71b3baff0f57bf03b2`; Phase 2 GIT-100 `318566d6d20acec672c3d8c6a0e5620ad70c7d66`; Phase 4 GIT-102 product commit `283c297d1df01371dc599a52719d35dc78e1d2f4` plus this records-only closeout.

## Current planning correction — D-0150 / SPEC-0015 Option B

Arthur product-rejected the unpublished Dashboard-only Alex/Sam/Sign Out Phase 3 review copy: its account labels did not change the browser-local Phase 1 bars. D-0149 verifies GIT-105 records-only publication at clean canonical/local-origin/live GitHub `main` `cfcdaf05dfa2faad02a9c291d4a2252ddbee8dfd`. D-0150 revises [SPEC-0015](specs/0015-functional-ai-dashboard.md) **from Phase 3 onward** to one app-wide account in navigation, then separate account data ownership, account-scoped Dashboard usage, entitlements, sandbox billing and launch proof (Phases 3–8). D-0151 records completed hash-verified rejected-copy D-0054 cleanup and Arthur's separate docs-only publication authority. Accepted/published Phases 1–2 remain unchanged; the 90-day local journal is not an account bill. All revised phases are Unauthorized / Not started. Phase 3 is not implementation-ready until G-AUTH/G-PRIV, an exact selected-stack scope and separate Arthur implementation authorization. This docs-only revision changes no runtime, provider, account, payment, SPEC-0008 or deployment state.

## Historical pre-D-0150 implementation checkpoint

D-0144/D-0145 are the historical research and original planning decisions. D-0146 records Arthur's visible PASS of the final [`SPEC-0015 — Functional AI Dashboard, Usage, Accounts and Billing`](specs/0015-functional-ai-dashboard.md) Phase 1 review copy. GIT-103 published its 10,000 recorded-token UTC-week TEST PREVIEW and left-justified chart as `02a80577f562e9524d2e177c222d19f99f517278`. D-0147 records Arthur's subsequent visible PASS of Phase 2 and PM V5 acceptance of an exact 22-path, local, content-free, 90-day usage journal observing current Project AI, Assistant, hosted search and dictation. D-0148/GIT-104 publishes those 22 paths plus 15 reviewed records/tree paths in `5f0fbb673e54d530889113115fba5f9c3c94b55f`; canonical/local-origin/live GitHub `main` matched clean `0/0`, all 32 ignored proof files were preserved at inventory SHA-256 `dde41452a8d391870ba9fbfd15cf5f3fed7d98dca92f15b34ce5745a40ca1801`, and D-0054 removed only the obsolete review copy/local branch after port 58540 closed. Phase 2's immutable technical manifest SHA-256 remains `4659c66ae6c88c09b962e77abb0b7a70510faa0008677975f4e639026c0a9e72`. Phase 3 is ready for Arthur's separate authorization but **Unauthorized / Not started**; Phases 4–6 likewise remain unauthorized. The Phase 1 Dashboard presentation remains byte-identical. xAI/Grok animation metering is a reserved future integration, not current coverage. No billing, real balance, AI request limit or SPEC-0008 resumption is implied.

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

Canonical memory propagation belongs to the Control Plane Architect, not the Spec Executor. The permanent phase workflow is:

```text
Spec Executor
→ one authorized phase implementation and technical proof
→ Implementation Review Packet
→ stop

Arthur and Project Manager
→ accept or reject

Control Plane Architect, after exclusive worktree transfer
→ canonical memory propagation and final tracked-state proof
→ Control Plane Architect PM Review Packet
→ stop

Separate explicit publication instruction
→ Control Plane Architect stages, commits, integrates into main, pushes, and verifies
```

The Spec Executor may create validated technical proof evidence but must not edit `AGENTS.md`, canonical `docs/` files, or `project/project_structure.txt`, and must never stage, commit, merge, push, or publish. The Control Plane Architect may enter the same worktree only after the executor has completely stopped and the implementation is accepted. The two roles never edit one worktree concurrently.

For every accepted task that changes code, behavior, architecture, priorities, or proof, the Control Plane Architect:

1. Update the active spec with implementation and verification evidence.
2. Update `CURRENT_STATE.md` only where reality changed.
3. Move or close the relevant stable IDs in `TODO.md`.
4. Append a dated entry to `changelog.md`.
5. Record durable decisions in `DECISIONS.md`.
6. Rewrite `SESSION_HANDOFF.md` so the next task can start without chat history.
7. Run `bash scripts/update_memory.sh` to validate memory and regenerate the sanitized tree. Use `--check-only` only for a read-only task with no filesystem changes.
8. Revalidate the executor's technical manifest, complete the final tracked-state closeout, and report the exact Git state with an empty index.

The Control Plane Architect then stops. Staging, committing, integrating, and pushing require a later explicit publication instruction. Rejected implementation returns to a separately authorized Spec Executor correction task without control-plane propagation.

SPEC-0001 Phase 1 remains the completed historical exception under the former combined workflow; its Verified and published record is not changed by this process decision.
