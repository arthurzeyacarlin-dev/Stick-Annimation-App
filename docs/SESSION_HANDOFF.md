# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-19
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Current result: SPEC-0001 Phase 3 is Verified, published, and integrated at `3fe3a5487389647b67216e9466121e00f1a73856`. Arthur approved D-0022's narrow Phase 4 tester-permission correction. Phase 4 is **Authorized; Not started; awaiting publication/integration of this record**.
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in This Task

This documentation-only Spec Architect task started in a new dedicated worktree from exact clean canonical `main`/`origin/main` SHA `3fe3a5487389647b67216e9466121e00f1a73856`.

The current repository and tester were traced before editing. Phase 3 is already durably published in exact 38-path commit `3fe3a5487389647b67216e9466121e00f1a73856`, parent `b8d8406ca6b51c3b83adb29fa20f20160c871c54`, message `Implement SPEC-0001 Phase 3 history persistence and onion`. Technical-manifest SHA-256 remains `07bd09c413a28ffcc706be85d00d1d4466cde1e336daceab23d9a1617153b675`; accepted browser-result SHA-256 remains `880daaa01c45356e9ae6c1fd652be90bbdf4070bd4e97ea62fb8412c4762fcc3`.

The trace confirmed one narrow specification contradiction. Phase 4 required a new browser plan, action registry, action module, strict recorder, validator, and final closeout, while §10.7 permitted only the two new action files and prohibited the existing tester from being changed to recognize them. The current catalog and code support Phase 1.5, Phase 2, and Phase 3 only; they cannot register or prove Phase 4 without an additive extension.

Arthur approved the correction. D-0022 now authorizes Phase 4 as Not started and freezes an exact 22-path technical ceiling: the original 12 Phase 4 product/fixture/action paths plus 10 additive catalog/schema/runner/contract/recorder/validator/finalizer paths. The new authorization ID is `phase-4/v1`. New schemas are versioned under `scripts/fixtures/spec0001-browser/v4/`. Accepted v2/v3 schemas and every older tester entry, meaning, mode, hash, registered path, source-restoration rule, network denial, cleanup, and production-exclusion rule remain exact.

No Phase 4 implementation, runtime code, tester code, package, configuration, route, provider, storage, Drawing, Creator, external request, staging, commit, push, merge, deployment, or other-worktree mutation occurred.

## Exact Git and Phase State

- canonical starting `main`/`origin/main`: `3fe3a5487389647b67216e9466121e00f1a73856`, synchronized at `0/0`
- Phase 3: **Verified, published, and integrated** in exact 38-path commit `3fe3a5487389647b67216e9466121e00f1a73856`
- Phase 3 technical manifest: SHA-256 `07bd09c413a28ffcc706be85d00d1d4466cde1e336daceab23d9a1617153b675`
- Phase 4: **Authorized; Not started; awaiting D-0022 publication/integration**
- Phase 5–7: **Unauthorized; Not started**
- Phase 7 Policy Gate and every live/paid/external request: unauthorized
- SPEC-0002: complete/protected and unchanged
- SPEC-0003: Proposed/inactive in its separate worktree and unchanged
- recovery branch `codex/pre-baseline-staged-page-2026-08-09`: untouched

## Exact Phase 4 Technical Ceiling

After this record is separately published/integrated, one new Plan-mode Phase 4 Spec Executor may change only the 22 tracked technical paths listed in SPEC-0001 §10.7 plus ignored Phase 4 proof artifacts. The ceiling consists of the original five product files, one deterministic validator, six Phase 4 fixtures/action files, the existing tester catalog, four new v4 schemas, and the existing runner/contract/recorder/validator/finalizer required for strict `phase-4/v1` registration and closeout.

`src/lib/stickfigure/stickTimeline.ts` is read-only. Phase 4 may not add chat, API/provider behavior, temporary/public tester UI, production tester imports/assets/routes, new dependencies, persistence changes, Drawing changes, Creator changes, or Phase 5 work.

## Exact Next Start Point

The next task is a publication-only Control Plane Architect task. It must start from current clean canonical `main`, verify the reviewed documentation-only scope, stage and publish only this correction's reviewed canonical paths, verify clean local/remote synchronization at `0/0`, and stop without beginning Phase 4.

Only after that publication is integrated may one new dedicated Plan-mode Phase 4 Spec Executor begin from the exact publication SHA. It must implement only §10.7, create and independently validate its ignored technical proof manifest, return its Implementation Review Packet, and stop without control-plane or Git mutation. Phase 5 must not begin.

## Proven and Not Proven

Proven:

- exact clean `3fe3a5487389647b67216e9466121e00f1a73856` starting basis and Phase 3 publication fact;
- the current tester supports earlier registered modes but has no Phase 4 registration/record/validation/closeout path;
- the former two-file-only wording made Phase 4 proof infeasible;
- the exact 22-path additive ceiling makes Phase 4 implementable and independently provable without changing its product outcome;
- the updated canonical files agree that Phase 4 is Authorized/Not started only after this record is published/integrated, while Phase 5–7 remain unauthorized.

Not proven or not performed:

- any Phase 4 implementation or browser/product proof;
- any runtime/tester/package/configuration edit;
- any external/provider/OpenAI/search/Supabase/paid request, deployment, remote mutation, stage, commit, push, or publication.

## Systems Intentionally Left Unchanged

All runtime TypeScript/TSX, application UI, Stick/Drawing/Creator behavior, accepted Phase 3 implementation and proof bytes, tester implementation and fixtures, SPEC-0002, SPEC-0003, APIs/routes, storage schemas, packages/lockfiles, database/migrations, environment/configuration, deployment, external services, other worktrees, recovery material, and Git history remain unchanged. Phase 4 was not started.
