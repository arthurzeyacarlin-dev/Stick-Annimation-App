# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-17
Active specs: `docs/specs/0001-first-reversible-ai-stick-animation.md` and `docs/specs/0002-lossless-local-drawing-save-and-reopen.md` — Approved
Active correction state: SPEC-0002 urgent realistic-size Save/Save As correction — technically Verified and accepted; publication/integration pending
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in the Last Task

Arthur's real Drawing project exposed an urgent regression in the previously published SPEC-0002 Phase 2 Save path. At `1440×900`, the authoring world produced `4563×3302` RGBA bitmaps, or 60,268,104 bytes each. `DrawingWorkspace` used `Array.from` to expand those typed bytes into giant boxed number arrays for Save, `drawingProjectStorage` repeated the conversion during V2 Open, and current-frame/snapshot preparation occurred outside `persistProject`'s failure boundary. Save and Save As could therefore throw `RangeError: Invalid array length` into the Next error overlay.

The accepted seven-path correction keeps bitmap bytes compact and owning across the asynchronous Save boundary, consumes typed bytes without boxing during storage encoding, returns typed bytes from V2 hydration, preserves legacy `number[]` and strict V1 JSON validation, and moves current-frame commit, snapshot, and all pre-storage preparation inside truthful `try/catch/finally` handling. V2 PNG/IndexedDB schema, encoded bytes, digests, capacity limits, staged read-back, atomic head swap, race guards, local-only behavior, and Save As behavior are unchanged.

The stopped Spec Executor proved the exact realistic flow in isolated browser storage: two `4563×3302` owning keyframes separated by a held frame, Onion Skin enabled, Save, edit and Save again, injected preparation failure with safe failed UI and no storage publication, Save As, reload, and reopen original and copy. Frame structure, bitmap dimensions/digests, held frame, Onion state, and overlay pixels matched. Page errors, `RangeError`, `Invalid array length`, Next overlays, external requests, and provider requests were zero. The technical proof contains 12 receipts, 890 assertions, 20 validator mutation classes, and 10 protected regressions. TypeScript passed; focused lint had zero errors; full lint remained 5 errors/73 warnings with zero changed-line findings.

Arthur and the Project Manager accepted the result after the executor stopped. This Control Plane Architect took exclusive ownership, independently revalidated the technical manifest, preserved every accepted implementation/proof byte, and propagated the accepted facts through the canonical control plane. SPEC-0002 remains Approved and implemented; the urgent correction is technically Verified/accepted but not yet published/integrated.

## Current Git and Proof State

- worktree: `/Users/arthurcarlin/.codex/worktrees/a97d/stick-animation-app`
- detached base/HEAD: `92e6143641c5dd2542277052fe21c6bad742139f`
- accepted technical manifest: `output/spec-0002/phase-2/proof-manifest.json`
- accepted technical-manifest SHA-256: `9d6c2bd8bc607c947265b72b3b0387909065f6b1305baa7e49a6f51e991c54fd`
- accepted implementation/proof paths: `src/components/workspace/DrawingWorkspace.tsx`, `src/lib/drawingProjectStorage.ts`, `scripts/runSpec0002BrowserProof.ts`, `scripts/spec0002-browser/browserProofContract.ts`, `scripts/spec0002-browser/validatePhase2.ts`, `scripts/fixtures/spec0002-browser/v1/phase-2-proof-commands.json`, and `scripts/fixtures/spec0002-browser/v1/phase-2-proof-manifest.schema.json`
- reviewed control-plane paths: `docs/specs/0002-lossless-local-drawing-save-and-reopen.md`, `docs/specs/README.md`, `docs/CURRENT_STATE.md`, `docs/TODO.md`, `docs/SESSION_HANDOFF.md`, and `docs/changelog.md`; `project/project_structure.txt` may appear only if deterministic memory regeneration changes it
- `docs/DECISIONS.md`, `docs/testing_workflow.md`, accepted runtime/test/fixture/proof bytes, package/dependency/configuration, and all other paths remain unchanged
- index must remain empty; proof output is ignored and must contain no raw pixel content

## Exact Next Start Point

Arthur and the Project Manager review the Control Plane Architect packet, then issue one separate explicit publication-only instruction for this reviewed combined correction/control-plane set.

That publication task must verify the exact base, accepted seven-file hashes, reviewed control-plane allowlist, accepted technical-manifest SHA, closeout SHA, empty index, and no unexpected/untracked paths before staging. It stages only the reviewed paths, commits on the correction branch, and runs the clean-only permanent `npm run test:spec0001-browser` on the clean committed branch. Only after that gate passes may it fast-forward a clean canonical `main`, push normally, and prove local/remote `0/0` synchronization. If canonical `main` advanced or any reviewed byte differs, stop without pull, merge, rebase, force-push, history rewrite, or scope expansion.

SPEC-0001 tester compatibility work and SPEC-0003 remain paused and unchanged. No later phase begins before this urgent correction is published and integrated.

## Systems Intentionally Left Unchanged

- original SPEC-0002 Phase 1/Phase 2 publication history, schemas, PNG bytes/digests, IndexedDB limits/atomicity, V1 strict validation, local-only boundary, and accepted owner decisions
- frozen SPEC-0001 permanent tester core and its historical proof; the clean post-correction run remains a publication gate because the tester requires a clean committed branch
- SPEC-0001 compatibility-correction implementation/status, SPEC-0001 Phase 2, SPEC-0003, and all later phases
- Drawing tools, timeline/history/playback/Generate Frames behavior outside the accepted proof extension; Home/New Drawing, Home/New Stick, Stick Creator/Back, and all unrelated runtime/UI
- `AGENTS.md`, `docs/DECISIONS.md`, `docs/testing_workflow.md`, `docs/PROJECT_MANAGER_CONTEXT.md`, package/dependencies/configuration/environment, databases/migrations, provider/external services, deployment, remotes, other worktrees, and `codex/pre-baseline-staged-page-2026-08-09`

This task authorizes no staging, commit, merge, push, publication, deployment, or external/provider activity. It stops with an empty index.
