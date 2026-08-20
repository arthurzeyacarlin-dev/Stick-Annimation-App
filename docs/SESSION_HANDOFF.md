# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-20
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Current result: From exact clean canonical-main basis `da7c258078a0240da32018b9ecfa7f33ae27d5ac`, Arthur and the Project Manager accepted D-0027's seven-Markdown-path correction making SPEC-0001 Phase 6 typo-friendly, deterministic, testable, and implementation-feasible. Phase 6 is **Approved; Authorized; Not started**, blocked until this activation is separately published/integrated. Published Phase 5 remains **Verified, published, and integrated** in exact 30-path commit `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`; its proof-manifest SHA-256 remains `f9024a5d86cc1febbac7df3d4219348cd8289d17723406bac5d90929d4cf5c0f` and accepted closeout SHA-256 remains `fd71afec8e637bb3736a63dbbe245c6616e14a4330b91f7e354297d96c2c24dd`. Phase 7 remains **Unauthorized; Not started**.
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in This Task

Completed the full repository boot and reread SPEC-0001 plus the live published Phase 5 execution path. The current parser uses exact-sentence V1 semantics in `stickFigureAiContract.ts`; the mock builder calls it, the early server dispatcher calls the mock builder, and the route/raw-reader/availability path does not need a Phase 6 change. The current Phase 6 boundary incorrectly made the required shared contract/mock files read-only. The tester catalog also stops at five authorizations through Phase 5, so the former Phase 6 proof plan was not representable.

The accepted activation defines one canonical V2 intent, exact ASCII normalization/tokenization, two closed grammar productions, safely implied pose/FPS values, singular-only count inference, a fixed audited typo map with token-length distance and correction-budget rules, `122 FPS` as the only accepted numeric typo, ambiguity/semantic rejection, exact A01–A15/R01–R36 fixture set equality, server-authoritative client parity, exact preview copy, additive V1-preserving protocol V2, an exact 26-path Phase 6 implementation/proof ceiling, and additive `phase-6/v1` V6 tester registration. Phase 7 consumes the same canonical intent without changing its separate policy gate. No runtime, test, fixture, script, dependency, config, UI, database, provider, external request, or Git publication action was performed.

## Exact Git and Phase State

- exact Spec Architect base/HEAD: `da7c258078a0240da32018b9ecfa7f33ae27d5ac`
- worktree: `/Users/arthurcarlin/.codex/worktrees/c8dd/stick-animation-app`
- Git branch state: detached `HEAD`; dedicated worktree
- index: empty; seven Markdown paths modified and unstaged
- exact Phase 5 publication commit: `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`
- exact parent: `a2b4f3e0fc492df9cd63bda32554e382a344cdb6`
- accepted implementation worktree: `/Users/arthurcarlin/.codex/worktrees/e271/stick-animation-app`
- Phase 4 implementation publication: `71841e96499f7627139c53d87114bba65e19d29d`
- exact Git-visible technical paths: 22
- exact canonical closeout-record paths: 8
- exact published paths: 30
- Phase 4: **Verified, published, and integrated**
- Phase 5: **Verified, published, and integrated**
- technical proof SHA-256: `f9024a5d86cc1febbac7df3d4219348cd8289d17723406bac5d90929d4cf5c0f`
- executor-reported corrected technical aggregate: `sha256:78e00dd35e1be1bc97ea2498abad6b09042216d57765ff6bbaec0a7e19e7d55c`
- Phase 6: **Approved; Authorized; Not started**, pending activation publication
- Phase 7: **Unauthorized; Not started**
- Phase 7 Policy Gate and every live/paid/external request: unauthorized
- SPEC-0002: complete/protected and unchanged
- SPEC-0003: Proposed/inactive in its separate worktree and unchanged
- recovery branch `codex/pre-baseline-staged-page-2026-08-09`: untouched

## Exact Next Start Point

Under a later explicit publication-only instruction, publish/integrate only the reviewed seven control-plane paths. After that integration, one new Phase 6 Spec Executor starts in a dedicated Plan-mode worktree from the exact resulting canonical-main SHA. Do not implement, stage, commit, or publish Phase 6 from this task.

## Proven and Not Proven

Proven:

- exact 30-path Phase 5 publication `9bbcc1df2fe4c79c0947601d0ea6274a85732d85` was normally pushed and integrated;
- local `main`, local `origin/main`, live GitHub `main`, and the Phase 5 branch matched cleanly at `0/0`;
- Phase 4 remains Verified/published/integrated with its accepted hashes unchanged;
- exact 22-path Phase 5 technical result and unchanged manifest SHA independently validate;
- 362 source assertions, 31 guarded real-route cases, 12 receipts, 53 artifacts, inherited regressions, and zero-egress/cleanup evidence passed;
- Arthur reviewed the exact unpublished copy and found the visible app normal;
- no visible UI/editor/history/storage/provider/external behavior was added.
- the V2 specification is decision-complete and owner/PM accepted for the accepted/rejected language boundary and exact Phase 6 proof/file ceiling;
- current code tracing proves the shared contract/mock and tester-registration corrections are necessary while route/raw-reader/availability changes are not.

Not proven or not performed:

- the production build, which stopped on the untouched pre-existing AI-cost dashboard `PageProps` type error and was not a phase gate;
- any V2 matcher/client/server/UI behavior, because authorized Phase 6 has not started;
- the future A01–A15/R01–R36 runtime/browser proof, V6 tester registration, or exact 26-path implementation;
- real OpenAI/provider/search/Supabase/paid traffic, deployment, Phase 7, or broader product completion.

## Systems Intentionally Left Unchanged

All runtime/TypeScript/TSX/API/UI/test/fixture/script/proof/package/lock/configuration/environment/database/deployment bytes; the published 22 Phase 5 technical bytes and V1 fixtures/proof/history; Phase 1–4 product meanings and proof; Drawing behavior; Stick canonical outcome/editor/history/storage/transaction behavior; Creator; `AGENTS.md`; `docs/PROJECT_MANAGER_CONTEXT.md`; `docs/architecture.md`; `docs/testing_workflow.md`; SPEC-0002; the separate SPEC-0003 worktree; other worktrees; recovery material and `codex/pre-baseline-staged-page-2026-08-09` remain unchanged. Nothing is staged, committed, pushed, deployed, or sent to an external service in this task.
