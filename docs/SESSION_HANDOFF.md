# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-21
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Current result: SPEC-0001 Phase 6 is **accepted, technically Verified, published, and integrated** in exact 33-path canonical-main commit `caa6c2d946780f384d0a8c58f4ea75a771483bcd`, parent `f19955c336be43b19b2c4cc13d16abcc7ded7247`, message `Implement SPEC-0001 Phase 6 deterministic Stick chat`. Local `main`, local `origin/main`, and live GitHub `main` matched that commit cleanly at `0/0` after publication. Phase 7 remains **Unauthorized; Not started**.
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in This Task

Recorded the completed Phase 6 publication from the accepted implementation package. The exact 25 technical paths and eight canonical records were published together in `caa6c2d946780f384d0a8c58f4ea75a771483bcd`; `WorkspaceAiPanelShell.tsx` remained the permitted but intentionally unchanged 26th ceiling path.

The corrected app preserves `Generate frames • Clean drawings • Animate faster`, `Chat here`, the original white circular checkmark sender, and idle `Ask the assistant for help with your stick figure.` before the user sends. The bounded V2 matcher creates one explicit preview; Cancel is an exact no-op; Apply once installs the canonical 12-frame/12-FPS wave. The full 11-joint/10-limb figure, Frames 1/5/9, holds, and purple/green onion neighbors project responsively. Creator → Back preserves the same project/history/storage/selection/view root and rebinds stage observation; Undo/Redo and manual edit/Save/Open survive the round trip.

The two root causes were canonical `960×594` geometry rendered unscaled into a smaller SVG without a `viewBox`, and a stale `ResizeObserver` left on the pre-Creator detached canvas. The final proof supersedes both rejected review conclusions: 15/15 receipts, 88 artifacts, 338 matcher/UI assertions, 15 accepted visible cases, 36 guarded and 13 visible rejections, dual-viewport geometry/pixel/onion evidence, atomic Undo/Redo, Save/Open, protected Phase 1–5/Drawing behavior, TypeScript, lint non-regression, zero non-loopback traffic, and cleanup pass.

## Exact Git and Phase State

- historical implementation base: `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`
- Phase 6 publication commit / canonical `main` / local `origin/main` / live GitHub `main`: `caa6c2d946780f384d0a8c58f4ea75a771483bcd`, clean `0/0` at publication verification
- publication parent/message: `f19955c336be43b19b2c4cc13d16abcc7ded7247`; `Implement SPEC-0001 Phase 6 deterministic Stick chat`
- index/hidden flags: empty/none
- accepted technical subset: 25 paths; framed aggregate `3bf3290f09f72787fa28db4f1a96003ab5f13e846358361e5805812904078aa2` over 1,065,268 bytes
- technical manifest: `output/spec-0001/phase-6/proof-manifest.json`; SHA-256 `c0d13c9234087855784ad805410667e9d583ac0f03dbe847257db778fea39297`; 48,147 bytes
- browser runner: SHA-256 `b1be9c83951f027687e2b50fa7df702ffa09b2e8213a7c30b6c7b0e9fa6220bd`
- published Phase 6 package: exactly 33 paths — 25 accepted technical paths plus eight canonical records, including deterministic `project/project_structure.txt`
- exact Phase 5 publication commit: `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`
- exact parent: `a2b4f3e0fc492df9cd63bda32554e382a344cdb6`
- Phase 4 implementation publication: `71841e96499f7627139c53d87114bba65e19d29d`
- exact Git-visible technical paths: 22
- exact canonical closeout-record paths: 8
- exact published paths: 30
- Phase 4: **Verified, published, and integrated**
- Phase 5: **Verified, published, and integrated**
- technical proof SHA-256: `f9024a5d86cc1febbac7df3d4219348cd8289d17723406bac5d90929d4cf5c0f`
- executor-reported corrected technical aggregate: `sha256:78e00dd35e1be1bc97ea2498abad6b09042216d57765ff6bbaec0a7e19e7d55c`
- D-0027/GIT-026 activation: published/integrated at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`; D-0028/GIT-027 published at `f19955c336be43b19b2c4cc13d16abcc7ded7247`; D-0029/GIT-028 Phase 6 implementation published/integrated at `caa6c2d946780f384d0a8c58f4ea75a771483bcd`
- Phase 6: **accepted, technically Verified, published, and integrated**
- Phase 7: **Unauthorized; Not started**
- Phase 7 Policy Gate and every live/paid/external request: unauthorized
- SPEC-0002: complete/protected and unchanged
- SPEC-0003: Proposed/inactive in its separate worktree and unchanged
- recovery branch `codex/pre-baseline-staged-page-2026-08-09`: untouched

## Exact Next Start Point

Arthur and the Project Manager must next discuss and explicitly decide the Phase 7 provider policy, cost, privacy/retention, and any later live-proof authorization. Phase 7 implementation does not start automatically and remains unauthorized.

## Proven and Not Proven

Proven:

- D-0027's exact seven-document activation is published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`;
- canonical `main` contains the accepted Phase 6 runtime and records at `caa6c2d946780f384d0a8c58f4ea75a771483bcd`;
- Phase 4 and Phase 5 remain Verified/published/integrated with their accepted hashes unchanged;
- Phase 6 passed 15/15 receipts, 88 bound artifacts, 338 matcher/UI assertions, 15 accepted visible cases, 36 guarded and 13 visible rejections, dual-viewport geometry/pixel/onion evidence, atomic Undo/Redo, Save/Open, inherited regressions, zero egress, and cleanup;
- Arthur reviewed and accepted the corrected unpublished copy before publication;
- canonical source now contains the accepted deterministic pretend-AI Stick chat, the protected helper/placeholder/checkmark presentation, the empty pre-Apply starter, and same-root Creator → Back continuity;
- the clean committed permanent browser plan passed before canonical integration;
- no provider, search, Supabase, paid, deployment, or Phase 7 behavior was added.

Not proven or not performed:

- the production build, which stopped on the untouched pre-existing AI-cost dashboard `PageProps` type error and was not a phase gate;
- any Phase 7 provider integration or live-provider proof;
- any acceptance of the rejected first review copy;
- real OpenAI/provider/search/Supabase/paid traffic, deployment, Phase 7, or broader product completion.

## Systems Intentionally Left Unchanged

All Phase 6 technical/runtime/test/proof bytes; the intentionally unchanged shared shell; `StickFigureCanvas.tsx`; Phase 3 onion resolver/tints; Phase 4 transaction semantics; Phase 5 route/V1 history; Drawing behavior; SPEC-0002; the separate SPEC-0003 worktree; other worktrees; recovery material; packages/configuration/environment/database/deployment; and Phase 7 remain unchanged by this post-publication record reconciliation. Nothing is staged, committed, pushed, deployed, or sent to an external service in this task.
