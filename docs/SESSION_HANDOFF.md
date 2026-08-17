# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-17
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Completed correction: SPEC-0002 urgent realistic-size Save/Save As correction — Verified, published, and integrated
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in the Last Task

Arthur's real Drawing project exposed an urgent regression in the previously published SPEC-0002 Phase 2 Save path. At `1440×900`, the authoring world produced `4563×3302` RGBA bitmaps, or 60,268,104 bytes each. `DrawingWorkspace` used `Array.from` to expand those typed bytes into giant boxed number arrays for Save, `drawingProjectStorage` repeated the conversion during V2 Open, and current-frame/snapshot preparation occurred outside `persistProject`'s failure boundary. Save and Save As could therefore throw `RangeError: Invalid array length` into the Next error overlay.

The accepted seven-path implementation/proof correction keeps bitmap bytes compact and owning across the asynchronous Save boundary, consumes typed bytes without boxing during storage encoding, returns typed bytes from V2 hydration, preserves legacy `number[]` and strict V1 JSON validation, and moves current-frame commit, snapshot, and all pre-storage preparation inside truthful `try/catch/finally` handling. V2 PNG/IndexedDB schema, encoded bytes, digests, capacity limits, staged read-back, atomic head swap, race guards, local-only behavior, and Save As behavior are unchanged.

The technical proof contains 12 receipts, 890 assertions, 20 validator mutation classes, and 10 protected regressions. In isolated browser storage at `1440×900`, two `4563×3302` owning keyframes separated by a held frame with Onion Skin enabled passed Save, edit and Save again, injected preparation failure with safe failed UI and no storage publication, Save As, reload, and reopen of original and copy. Frame structure, bitmap dimensions/digests, held frame, Onion state, and overlay pixels matched. Page errors, `RangeError`, `Invalid array length`, Next overlays, external requests, and provider requests were zero.

Arthur and the Project Manager accepted the result after the Spec Executor stopped. The reviewed seven implementation/proof paths and six control-plane paths were committed as exact 13-path commit `5c36870f7671033e30dc9341ba757e36c6572cc2`, parent `92e6143641c5dd2542277052fe21c6bad742139f`, message `Fix realistic Drawing project Save crash`. The clean committed-branch permanent tester passed with 40 operations, 13 screenshots, exactly one deterministic mocked Drawing request, and no real/external request. Canonical `main` was fast-forwarded and normally pushed. The correction branch, local `main`, local `origin/main`, and live `origin/main` were verified at the same SHA, clean, and `0/0`; the recovery branch remained unchanged. DATA-004 and GIT-014 are complete, and SPEC-0002 is complete again.

## Current Git and Proof State

- worktree: `/Users/arthurcarlin/.codex/worktrees/a97d/stick-animation-app`
- correction branch/current commit: `codex/spec-0002-save-crash-correction` at `5c36870f7671033e30dc9341ba757e36c6572cc2`
- synchronized publication state: correction branch, canonical local `main`, local `origin/main`, and live `origin/main` all at `5c36870f7671033e30dc9341ba757e36c6572cc2`, clean and `0/0`
- accepted technical manifest: `output/spec-0002/phase-2/proof-manifest.json`
- accepted technical-manifest SHA-256: `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`
- accepted closeout manifest: `output/spec-0002/phase-2/proof-closeout-manifest.json`
- accepted closeout-manifest SHA-256: `f0f60e9598859d8b356bf24aa802f01a8e75fb8129cc2aa975683b0f626047c0`
- published implementation/proof paths: `src/components/workspace/DrawingWorkspace.tsx`, `src/lib/drawingProjectStorage.ts`, `scripts/runSpec0002BrowserProof.ts`, `scripts/spec0002-browser/browserProofContract.ts`, `scripts/spec0002-browser/validatePhase2.ts`, `scripts/fixtures/spec0002-browser/v1/phase-2-proof-commands.json`, and `scripts/fixtures/spec0002-browser/v1/phase-2-proof-manifest.schema.json`
- published control-plane paths: `docs/specs/0002-lossless-local-drawing-save-and-reopen.md`, `docs/specs/README.md`, `docs/CURRENT_STATE.md`, `docs/TODO.md`, `docs/SESSION_HANDOFF.md`, and `docs/changelog.md`
- this post-publication reconciliation is records-only and must remain unstaged pending separate review/publication

## Exact Next Start Point

Arthur and the Project Manager review this six-document post-publication reconciliation and issue a separate publication-only instruction for it. After that record is integrated, dependency-safe implementation work returns to QLT-006, the D-0016-approved SPEC-0001 Phase 1.5 tester compatibility correction, in one new dedicated Plan-mode Spec Executor from the resulting canonical-main SHA and within SPEC-0001 §10.4A's exact 23-path proof-infrastructure ceiling.

SPEC-0001 Phase 2 remains blocked until that correction completes its full executor, acceptance, propagation, clean-gate, publication, and reactivation lifecycle. SPEC-0003 remains paused/unchanged. No new SPEC-0002 phase is authorized.

## Systems Intentionally Left Unchanged

- original SPEC-0002 Phase 1/Phase 2 publication history, schemas, PNG bytes/digests, IndexedDB limits/atomicity, V1 strict validation, local-only boundary, accepted owner decisions, and technical/closeout manifest hashes
- all 13 bytes published in `5c36870f7671033e30dc9341ba757e36c6572cc2`, including runtime, tests, fixtures, and proof contracts
- SPEC-0001 compatibility-correction implementation/status, SPEC-0001 Phase 2, SPEC-0003, and all later phases
- Drawing tools, timeline/history/playback/Generate Frames behavior outside the accepted proof extension; Home/New Drawing, Home/New Stick, Stick Creator/Back, and all unrelated runtime/UI
- `AGENTS.md`, `docs/DECISIONS.md`, `docs/testing_workflow.md`, `docs/PROJECT_MANAGER_CONTEXT.md`, package/dependencies/configuration/environment, databases/migrations, provider/external services, deployment, other worktrees, and `codex/pre-baseline-staged-page-2026-08-09`

This task authorizes no staging, commit, merge, push, publication, deployment, SPEC-0001 implementation, SPEC-0003 implementation, or external/provider activity. It stops with an empty index.
