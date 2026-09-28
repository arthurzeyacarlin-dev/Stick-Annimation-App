# Diamond Animator Control Plane

Status: canonical repository memory
Established: 2026-08-09
Last reconciled with live code and current records: 2026-09-28 through D-0156's planning-only SPEC-0015 Phase 4 milestone split and Arthur's G-LOCAL-PROJECT-ACCESS resolution. Exact clean planning base is `07040d4710be6601fc846d381d07a981decee8dc`; Phase 3 product commit `b3607ae7ed1e88294bf61bb514d6acc39fe62ba0` remains published/integrated and locally active. Phase 4A review is owner-authorized after amendment publication only on a fresh zero-legacy origin; implementation publication/activation on an origin with unowned local projects remains blocked on G-LEGACY-LOCAL-PRESERVATION. 4B–4E and Phases 5–8 remain unauthorized. SPEC-0014 Phases 1–2 and 4 remain published/integrated; Phase 3 Export is rejected/unpublished, with no Phase 5.
Snapshot basis: pull request `#1` merged into `main` as `093bbac82fd3b4d97984448b6c6dbd716153354d`; functional anchor `c7de444536f3e0dd578a2063f70b0914e6af60b1`; tag `baseline-2026-08-09-control-plane`; SPEC-0014 Phase 1 GIT-099 `06365eacffe493ea3550de71b3baff0f57bf03b2`; Phase 2 GIT-100 `318566d6d20acec672c3d8c6a0e5620ad70c7d66`; Phase 4 GIT-102 product commit `283c297d1df01371dc599a52719d35dc78e1d2f4` plus this records-only closeout.

## D-0156 Phase 4A amendment — planning only

Arthur selected **Amend then new executor**. [SPEC-0015 §14.3](specs/0015-functional-ai-dashboard.md) replaces the old broad Phase 4 with 4A account-saved projects, 4B hosted Better Auth identity/recovery, 4C account chats/jobs/notifications/recovery/preferences, 4D required private MP4 account archive and 4E closure. Live types prove legacy local projects have no durable account owner. Arthur forbids moving/importing them—or one account's project—into another account. Phase 4A therefore reviews only new account projects on a fresh browser origin with zero legacy projects. A separate preservation decision is required before implementation rollout on any legacy-bearing origin; no full-main/no-regression claim is made. No runtime, Supabase, Git index or remote was changed by this planning task.

## D-0155 published local closeout — SPEC-0015 Phase 3

D-0154's accepted 28-path technical result and 15 reviewed control-plane/tree paths were committed, integrated and pushed as `b3607ae7ed1e88294bf61bb514d6acc39fe62ba0`. Pinned dependencies and a fresh, separate ignored main-local account store were installed; it began with zero users/sessions and 0700/0600 permissions. The canonical port-3000 Home/auth checks returned 200, unauthenticated usage returned 401, wrong-Host usage returned 403, and the 27-check local-origin oracle passed. Review accounts were not imported. D-0054 then stopped the 58580 review server, archived its worktree, removed the merged local publication branch and preserved its two-account store in restricted ignored recovery (see `SESSION_HANDOFF.md`). Phase 3 is Verified, published and integrated locally; D-0155 itself did not authorize public deployment, account-owned content, billing or Phase 4. D-0156 later supplies only the separately gated 4A authority above. The D-0154 paragraph below is its prepublication checkpoint.

## D-0154 accepted technical result — SPEC-0015 Phase 3 (historical prepublication checkpoint)

Arthur passed the corrected Sign in / Log in review copy and PM accepted its exact 28-path technical result from detached base `c53ed494d55f8314ed9d07783fbb1765615c01e6`. The current ignored manifest is SHA-256 `fd6a82ee6716469f5da0257dfbea12491c8f56252dfd74a11b0b36640e6f5648`; the original pre-correction manifest is preserved at SHA-256 `3b60c3a7b028e49c98db2578502587e65478ff2fcc65562028f87da2dfa803d9`. In the review app, real local sessions reach the existing full app, while projects/chats/notifications/Dashboard receipts remain shared browser-local data. The local-origin correction supports configured loopback ports 3000 and 58580. Canonical main needs its own fresh ignored account store/secret and safe port-3000 server cutover before activation; no review account is imported. This control-plane result is **accepted/technically Verified, unpublished**. Phases 4–8 remain unauthorized; publication and canonical runtime verification are separate.

## D-0153 correction — SPEC-0015 Phase 3

Arthur rejected the unpublished signed-in placeholder review copy. [SPEC-0015 §14.2](specs/0015-functional-ai-dashboard.md) now supersedes its old three-choice/guest-only outcome: Sign in and Log in alone lead to the existing full Diamond Animator; new-account Sign in alone selects one inert, clearly marked local test preview. Browser-local projects/chats/notifications/usage remain shared on that browser and are not account-owned until later phases; no public/multi-user deployment or account-privacy claim is authorized. D-0054 preserves/retires the rejected copy before one fresh Plan-mode executor starts from the separately published exact main SHA. The following D-0152 text is historical where it conflicts with D-0153.

## D-0152 activation record — SPEC-0015 Phase 3

Arthur selected real, file-backed local review accounts and separately authorized **Phase 3 implementation only** after this exact activation amendment is reviewed and published. [SPEC-0015 §14.2](specs/0015-functional-ai-dashboard.md) pins Better Auth/SQLite, the app entry's **Sign in / Log in / Continue privately** choices, the signed-in Menu avatar and one-click **Log out → entry** flow, server-verified guest/account isolation, the route/path/command ceiling and two-hour executor stop. Email is unverified and self-service recovery is deferred until hosted delivery is separately chosen. The ignored review database and secret must be restricted, hash-inventoried, preserved and restore-tested before D-0054 retirement. The accepted Phase 1–2 runtime is unchanged; Phases 4–8 remain unauthorized. This activation record itself does not publish or implement the app; a separately verified publication is required before Phase 3 execution.

## Historical planning correction — D-0150 / SPEC-0015 Option B

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
