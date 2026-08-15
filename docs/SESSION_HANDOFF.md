# Session Handoff

Status: canonical last-known stopping point
Last updated: 2026-08-15
Active spec: `docs/specs/0001-first-reversible-ai-stick-animation.md` — Approved
Active phase state: Phase 1 — Verified, published, and integrated; Phase 1.5 — Blocked, stopped Executor result unaccepted/unpublished, protected-Drawing correction Approved/Authorized but Not started/resumed; no implementation phase is active
Current roadmap phase: Phase 0 — Preserve and Stabilize

## Completed in the Last Task

The Phase 1.5 Executor stopped correctly when the corrected fail-closed tester exposed a protected Drawing Generate Frames settlement regression outside its runtime allowlist. The deterministic mock reached at least 100 red Canvas2D pixels after Apply, but those pixels disappeared as the AI UI settled. This reproduced with empty and explicit tester-only success output. The stopped run completed 33 of 37 negative cases before the blocker; the golden result and four post-success checks are unproven. Failure artifact SHA-256 is `53d34094cff90d2864dd2e5bfdb09cb887bb60326806e8a048e13072a6d6422b`; there is no valid current Phase 1.5 proof-manifest SHA.

The stopped worktree `/Users/arthurcarlin/.codex/worktrees/feba/stick-animation-app` remains read-only evidence at base `a35a268764c21eedffcf3d82b59718699b62d4d0`, with exactly 26 authorized dirty implementation paths plus ignored failure evidence. Its implementation is unaccepted and unpublished.

Fresh canonical tracing confirms the real path is `DrawingAiPanel.revealAssistantMessage` → `DrawingWorkspace.applyGeneratedFrameToWorkspace` → real timeline replacement → scheduled render/restore. The existing evidence cannot tell whether the first later clearing write comes from `DrawingWorkspace` bitmap resolution/restore or `DrawingCanvas` authoring-surface reset. D-0012 approves a diagnostic-first correction ceiling limited to those two files, followed by a permanent diff only in the proven smallest subset. No behavior patch is allowed until the first clearing writer is proven, and a required third runtime file, broad rewrite, or unrelated behavior change is a hard stop.

The approved tester font boundary is unchanged and stricter than a product workaround: `app/layout.tsx`, application fonts, styles, and unrelated visible website behavior may not change. Offline font handling is tester-only temporary setup, restored byte-for-byte, and must prove the normal published application unchanged. If an offline run requires changing the product, the correction stops and reports the blocker.

Phase 1 remains Verified, published, and integrated at `21a88feb65cf1cc51138c9ad4879b962ee468569`, with official proof-manifest SHA-256 `fe1d69c9d0fcc8e7131d064b6a8ee4c0bd99aea21b8a0f399840b4c2311937d7`. D-0010 remains the required Executor → human review → Control Plane Architect → separate publication lifecycle.

## Current Git State

- control-plane worktree: `/Users/arthurcarlin/Projects/stick-animation-app`
- branch/base: clean synchronized `main` began at `a35a268764c21eedffcf3d82b59718699b62d4d0`, zero ahead/behind `origin/main`
- current work: six unstaged authorized documentation/control-plane changes for the protected-Drawing blocker amendment only; no runtime, tester, fixture, dependency, configuration, migration, environment, or database path changed
- index and untracked set: empty
- Phase 1 status: Verified, committed, pushed, and integrated; unchanged by this amendment
- Phase 1.5 status: Blocked; stopped result unaccepted/unpublished; correction Approved/Authorized but Not started/resumed
- stopped Phase 1.5 worktree: read-only and untouched by this task
- prohibited recovery branch: untouched and not used
- no tester implementation, commit, merge, push, external request, or publication occurred in this task

## Exact Next Start Point

1. Review this Control Plane Architect packet and the exact unstaged D-0012 approval-record diff.
2. If accepted, use a separate explicit publication instruction to publish/integrate only the reviewed control-plane paths. The stopped implementation worktree remains untouched during publication.
3. Only after D-0012 publication/integration may a separately authorized Plan-mode Phase 1.5 correction Spec Executor take exclusive ownership of the stopped worktree.
4. The correction diagnoses first. If it cannot identify the first clearing writer inside the two-file ceiling, it stops without a behavior patch. If it can, it patches only the proven subset and reruns from clean runner-owned proof output.
5. Completion requires final success/input usability/settled pixels, both viewports, exactly one mock and zero real route/provider/search/Supabase calls, all 37 negatives, network/WebSocket denial, production exclusion, all cleanup paths, strict 49-artifact proof validation, Phase 1's 631 assertions, TypeScript, and honest lint.
6. The correction Executor returns its packet and stops. Acceptance, Control Plane Architect propagation, and Git publication remain separate later authorities.
7. Phase 2 remains Unauthorized/Not started until Phase 1.5 is Verified, accepted, propagated, published, and integrated. Phases 3–7 also remain Unauthorized/Not started.

## Systems Intentionally Left Unchanged

- all `app/**` UI and API behavior
- all `src/components/**` editor behavior in this documentation task
- every existing Drawing AI/runtime/storage path in this documentation task; D-0012 limits a future correction to the diagnostic-proven subset of `DrawingWorkspace.tsx`/`DrawingCanvas.tsx`
- Stick Workspace state, timeline UI, Canvas interaction, playback, Undo/Redo, Save/Open, Creator, and chat UI
- permanent automatic browser tester implementation and stopped evidence artifacts
- OpenAI, search, Supabase, provider logging, dependencies, package scripts, lockfiles, config, environment, migrations, database, deployment, and remote Git state

The Phase 1 contract modules are deliberately unwired. Visible Stick behavior remains the pre-Phase-1 scaffold until later separately authorized phases.
