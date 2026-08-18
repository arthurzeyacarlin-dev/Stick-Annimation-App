# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-18
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Current result: SPEC-0001 §10.5A is **Verified, published, and integrated** at `edfb3dea023119b91336e6e5da645d4982a9f068`; Phase 3 is **Authorized; Not started**
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in This Task

The Control Plane Architect started in a clean dedicated detached worktree at exact canonical-main commit `edfb3dea023119b91336e6e5da645d4982a9f068`. Canonical `main`, local `origin/main`, live remote `main`, and the retained Phase 2 correction branch had already been verified equal and clean at `0/0` at that SHA.

The exact 29-path §10.5A publication at `edfb3dea023119b91336e6e5da645d4982a9f068`, message `Correct SPEC-0001 Phase 2 Stick timeline`, remains the durable correction result. Its accepted technical manifest remains SHA-256 `edda3028b9fbe2759e31059455f16cc3ee02ac9b242149107454071dae62de90`, and its accepted correction finalizer remains SHA-256 `e6795e9f686117d89824bea4f9de3ed766077ba9a8d00c51c27b074708c396f9`.

Arthur explicitly instructed that onion skin belongs inside Phase 3, not a separate phase, and that Phase 3 should be prepared for implementation but not started here. D-0019 records that authorization. SPEC-0001 Phase 3 — Atomic history and minimal local persistence, including the existing D-0018 onion contract — is now **Authorized; Not started**. The rest of §10.6's already approved scope, proof, non-goals, and protected regressions remains unchanged. Phases 4–7 remain **Unauthorized; Not started**.

D-0018 remains the exact accepted onion outcome: only while paused and Onion is ON, render at most one prior distinct active-layer state in `rgba(92, 63, 158, 0.58)` and at most one next distinct active-layer state in `rgba(44, 122, 91, 0.56)`; skip held/same-visible states; stop at blank/empty boundaries; collapse a duplicate next source; leave non-active layers current/normal and the current pose normal/editable; keep overlays non-interactive and outside pointer hit-testing; hide during playback and clear immediately when OFF; exclude onion state from save, history, document/digest/storage/AI state; use one renderer for human, later AI, fixture, and reopened poses; preserve Drawing onion behavior; and defer tweening, interpolation, easing, motion frames, and more than one neighboring state.

This activation is documentation/control-plane work only. No Phase 3 runtime, fixture, test, proof, history, persistence, Open, onion renderer, package, configuration, API, database, environment, external service, paid request, or deployment work began.

## Exact Git and Phase State

- activation worktree: `/Users/arthurcarlin/.codex/worktrees/e7a9/stick-animation-app`
- activation starting base/HEAD: `edfb3dea023119b91336e6e5da645d4982a9f068`
- §10.5A: Verified, published, and integrated at `edfb3dea023119b91336e6e5da645d4982a9f068`
- Phase 3: Authorized; Not started under D-0019, with D-0018 unchanged
- Phases 4–7: Unauthorized; Not started
- SPEC-0002: complete/protected and unchanged
- SPEC-0003: Proposed/inactive in its separate preserved worktree
- recovery branch `codex/pre-baseline-staged-page-2026-08-09`: untouched
- activation publication SHA: the final canonical-main SHA produced by this documentation-only publication task and reported in its final publication report

## Exact Next Start Point

After this activation record is published and integrated, start exactly one new dedicated SPEC-0001 Phase 3 Spec Executor task in Plan mode from the activation publication's final canonical-main SHA. The executor may implement only §10.6, including D-0018 unchanged. It must complete the authorized Phase 3 implementation, technical tests, proof manifest, and Spec Executor Implementation Review Packet, then stop completely.

The Phase 3 executor must not update canonical control-plane files; stage, commit, merge, push, publish, or deploy; begin Phase 4; use external services; or perform paid work. Arthur and the Project Manager must accept or reject the stopped executor result before any later ownership transfer.

## Proven and Not Proven

Proven:

- clean exact activation start from canonical-main commit `edfb3dea023119b91336e6e5da645d4982a9f068`;
- §10.5A Verified/published/integrated at that exact 29-path commit;
- D-0019 owner authorization for Phase 3 as Not started;
- D-0018 preserved as the exact Phase 3 onion contract;
- all current canonical entry points agree that Phases 4–7 remain Unauthorized/Not started;
- documentation-only activation scope with no runtime/test/fixture/proof diff and no external/provider/deployment work.

Not proven or not performed:

- any Phase 3 runtime behavior, history, Undo/Redo, persistence, Save/Open, onion rendering, technical proof, or browser acceptance;
- Phase 4–7 implementation or authorization;
- any external/provider/OpenAI/search/Supabase/paid request or deployment;
- SPEC-0003 implementation or activation.

## Systems Intentionally Left Unchanged

All runtime, fixture, technical-test, browser-plan, proof, package, lockfile, configuration, API, database, migration, environment, and deployment bytes remain unchanged. `AGENTS.md`, `docs/PROJECT_MANAGER_CONTEXT.md`, SPEC-0002, SPEC-0003, Drawing runtime and onion behavior, Open Project runtime, Stick runtime/history/storage/onion behavior, other worktrees, and recovery material remain unchanged. This task does not fix or implement any product behavior; it only records the authorized next phase.
