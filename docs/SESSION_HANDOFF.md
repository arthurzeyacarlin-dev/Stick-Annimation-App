# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-21
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Current result: D-0028 is published in exact seven-document canonical-main commit `f19955c336be43b19b2c4cc13d16abcc7ded7247`, parent `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`. Arthur reviewed and accepted the corrected unpublished Phase 6 app. The stopped executor's exact 25-path technical subset inside the 26-path ceiling independently validates, and the Control Plane Architect has propagated the accepted result for final closeout. Phase 6 is **accepted and technically Verified; pending separate publication/integration**. Canonical `main` does not contain Phase 6 runtime until that publication. Phase 7 remains **Unauthorized; Not started**.
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in This Task

Completed the full boot and exclusive ownership transfer into `/Users/arthurcarlin/.codex/worktrees/11f7/stick-animation-app`. The persistent review service was stopped and port `3016` is closed. The accepted 25 technical paths were hash-frozen before record edits; `WorkspaceAiPanelShell.tsx` is the permitted but intentionally unchanged 26th ceiling path.

The corrected app preserves `Generate frames • Clean drawings • Animate faster`, `Chat here`, the original white circular checkmark sender, and idle `Ask the assistant for help with your stick figure.` before the user sends. The bounded V2 matcher creates one explicit preview; Cancel is an exact no-op; Apply once installs the canonical 12-frame/12-FPS wave. The full 11-joint/10-limb figure, Frames 1/5/9, holds, and purple/green onion neighbors project responsively. Creator → Back preserves the same project/history/storage/selection/view root and rebinds stage observation; Undo/Redo and manual edit/Save/Open survive the round trip.

The two root causes were canonical `960×594` geometry rendered unscaled into a smaller SVG without a `viewBox`, and a stale `ResizeObserver` left on the pre-Creator detached canvas. The final proof supersedes both rejected review conclusions: 15/15 receipts, 88 artifacts, 338 matcher/UI assertions, 15 accepted visible cases, 36 guarded and 13 visible rejections, dual-viewport geometry/pixel/onion evidence, atomic Undo/Redo, Save/Open, protected Phase 1–5/Drawing behavior, TypeScript, lint non-regression, zero non-loopback traffic, and cleanup pass.

## Exact Git and Phase State

- implementation base/HEAD: `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`
- canonical `main` / local `origin/main`: clean `f19955c336be43b19b2c4cc13d16abcc7ded7247`, `0/0`
- worktree: `/Users/arthurcarlin/.codex/worktrees/11f7/stick-animation-app`; detached HEAD; exclusive Control Plane Architect ownership after executor shutdown and Arthur acceptance
- index/hidden flags: empty/none
- accepted technical subset: 25 paths; framed aggregate `3bf3290f09f72787fa28db4f1a96003ab5f13e846358361e5805812904078aa2` over 1,065,268 bytes
- technical manifest: `output/spec-0001/phase-6/proof-manifest.json`; SHA-256 `c0d13c9234087855784ad805410667e9d583ac0f03dbe847257db778fea39297`; 48,147 bytes
- browser runner: SHA-256 `b1be9c83951f027687e2b50fa7df702ffa09b2e8213a7c30b6c7b0e9fa6220bd`
- canonical closeout records: eight paths, including deterministic `project/project_structure.txt`
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
- D-0027/GIT-026 activation: published/integrated at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`; D-0028/GIT-027 published at `f19955c336be43b19b2c4cc13d16abcc7ded7247`
- Phase 6: **accepted and technically Verified; pending publication/integration**; no runtime in canonical `main` yet
- Phase 7: **Unauthorized; Not started**
- Phase 7 Policy Gate and every live/paid/external request: unauthorized
- SPEC-0002: complete/protected and unchanged
- SPEC-0003: Proposed/inactive in its separate worktree and unchanged
- recovery branch `codex/pre-baseline-staged-page-2026-08-09`: untouched

## Exact Next Start Point

Under Arthur's later explicit publication-only instruction, revalidate and publish exactly the manifest-bound 25 technical paths plus the eight reviewed canonical records. Publication must start from unchanged base/canonical refs, use no force/merge/rebase/pull, and stop on any byte/path/ref drift. Do not begin or authorize Phase 7.

## Proven and Not Proven

Proven:

- D-0027's exact seven-document activation is published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`;
- canonical `main` contains no Phase 6 runtime before the separate publication;
- Phase 4 remains Verified/published/integrated with its accepted hashes unchanged;
- exact 22-path Phase 5 technical result and unchanged manifest SHA independently validate;
- 362 source assertions, 31 guarded real-route cases, 12 receipts, 53 artifacts, inherited regressions, and zero-egress/cleanup evidence passed;
- Arthur reviewed the exact unpublished copy and found the visible app normal;
- no visible UI/editor/history/storage/provider/external behavior was added.
- canonical source contains the protected helper/placeholder/checkmark presentation and the published empty Stick starter;
- the existing Phase 4 projection, Workspace render source, Canvas SVG path, and Phase 3 onion constants/attributes make the corrected visible result and geometry/pixel proof feasible inside the unchanged maximum 26-path ceiling;
- D-0028 is decision-complete for initial panel sequencing, Apply/Cancel/onion visible outcome, strict visual boundary, future proof, lifecycle, and handoff.

Not proven or not performed:

- the production build, which stopped on the untouched pre-existing AI-cost dashboard `PageProps` type error and was not a phase gate;
- publication/integration of the accepted corrected Phase 6 runtime;
- the future A01–A15/R01–R36, initial-panel, Cancel-empty, applied geometry/pixel, onion color/figure, strict visual, V6 registration, Drawing/Creator/fat-frame, or zero-egress implementation proof;
- any acceptance of the rejected first review copy;
- real OpenAI/provider/search/Supabase/paid traffic, deployment, Phase 7, or broader product completion.

## Systems Intentionally Left Unchanged

All 25 accepted technical bytes after hash-freeze; the intentionally unchanged shared shell; `StickFigureCanvas.tsx`; Phase 3 onion resolver/tints; Phase 4 transaction semantics; Phase 5 route/V1 history; Drawing behavior; SPEC-0002; the separate SPEC-0003 worktree; other worktrees; recovery material; packages/configuration/environment/database/deployment; and Phase 7 remain unchanged by the Control Plane Architect. Nothing is staged, committed, pushed, deployed, or sent to an external service in this task.
