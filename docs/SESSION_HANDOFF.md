# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-18
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Current result: SPEC-0001 §10.5A Phase 2 UI Restoration and Editable Timeline Correction — **Approved; Authorized; Not started** through D-0017
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in the Last Task

At exact current-main `d809f733a7fb90037627f3d9df359be95b9dac49`, the Spec Architect verified the clean dedicated worktree, read the canonical boot/control-plane sources, compared exact historical UI base `68338d54542bbfd3fb1f0fab06548f0424871f80` with current runtime, traced current Drawing timeline semantics, and rendered isolated historical/current Home → New → Stick flows.

Arthur's report was reproduced. The current published Phase 2 UI has a 150px timeline, twelve large cells, an automatic built-in figure, changed top-bar/panel layout, restricted frame actions, disabled layer controls, and Creator locking. The historical workspace has one compact empty starting cell, the original menus/fonts/layout, four original right-panel tabs/tools/order, canvas/toolbar behavior, and Creator entry. The exact nine-runtime-file diff is 1,415 insertions and 4,095 deletions.

SPEC-0001 §10.5A defines one correction only. Arthur approved that exact outcome, and the Control Plane Architect recorded D-0017 plus the synchronized approval status across the canonical control plane. No runtime behavior was implemented.

## Current Git and Phase State

- research base/HEAD: `d809f733a7fb90037627f3d9df359be95b9dac49`, detached dedicated Codex worktree
- historical UI/restoration baseline: `68338d54542bbfd3fb1f0fab06548f0424871f80`
- historical Phase 2 runtime publication: `adbda9dd4f42a103c3c5af41ccc19b110b6825c0`
- §10.5A correction: Approved/Authorized/Not started; implementation base intentionally unset until activation publication
- SPEC-0001 Phase 3 and Phases 4–7: Unauthorized/Not started
- SPEC-0002: complete and protected
- SPEC-0003: Proposed/inactive in its separate preserved worktree
- recovery branch `codex/pre-baseline-staged-page-2026-08-09`: untouched

The published Phase 2 commit and proof hashes remain immutable historical records. Arthur's visible rejection prevents treating them as acceptance of §10.5A implementation; D-0017 authorizes the new correction contract only.

## Exact Next Start Point

Do not dispatch an executor yet. A separate publication-only task must first publish/integrate this approval record. That publication commit—not the current detached-worktree base—becomes the exact canonical-main implementation SHA. After that publication, create one new dedicated Plan-mode Spec Executor worktree for this correction only.

That executor may change only the nine runtime paths and bounded correction-proof ceiling in §10.5A, must prove historical layout/pixel restoration plus editable Drawing-style timeline semantics, and must stop with an Implementation Review Packet before any control-plane or Git action. Arthur must review the visible desktop and compact result. Phase 3 cannot start first.

## Proven and Not Proven

Proven for proposal basis:

- exact current/historical nine-file source comparison and 1,415/4,095 diff summary;
- isolated real current and historical Stick renders at `1440×900`;
- historical one-cell/empty-canvas/original-shell baseline;
- current Drawing compact geometry and applicable context-menu/layer semantics;
- no repository runtime mutation and no external/provider request during this task.

Not proven because the authorized correction has not started:

- corrected runtime behavior;
- independent edit isolation under the restored shell;
- desktop/compact pixel/layout equality;
- permanent tester correction plan and protected regressions;
- technical proof manifest;
- Arthur acceptance, propagation, staging, commit, push, or publication.

## Systems Intentionally Left Unchanged

- every runtime, fixture, test, proof script, package, dependency, configuration, environment, database, API, and ignored proof artifact;
- every previously accepted decision; D-0017 is the sole new durable decision record;
- SPEC-0002's complete implementation/proof and all Drawing behavior;
- the separate SPEC-0003 Proposed/inactive worktree;
- recovery material, canonical main worktree, and every other worktree;
- Git history, index, remotes, and publication state.

No staging, commit, push, publication, implementation, propagation, Phase 3 authorization, or external/paid operation occurred.
