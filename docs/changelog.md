# Changelog

Status: canonical append-only project change history
Format: newest entries first; describe observed behavior and repository operations precisely

## Unreleased

### 2026-08-10 — First reversible Stick AI specification proposed

- added [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md) as Proposed and awaiting Arthur's review
- traced the current Drawing AI, Stick timeline/canvas, history, persistence/memory, API boundary, and offline verification paths from clean `main` at `87a9afb246d4daf33431e7152c03f46a04e166fb`
- bounded the recommendation to one exact one-figure/three-pose/12 FPS action with independent poses, explicit Preview → Apply, one atomic reversible transaction, one manual joint correction, and strict local save/reopen
- divided possible implementation into six stop-gated phases, each requiring a separate independently verified Codex task
- updated the spec index, TODO, current work state, PM context, and session handoff without activating or approving implementation
- regenerated `project/project_structure.txt` through the canonical memory helper so the Proposed spec appears in the repository snapshot

No runtime source, application behavior, dependency, database, environment value, Git history, GitHub setting, or deployment was changed. No OpenAI model request, application search, Supabase call, paid request, or remote write was made; official OpenAI documentation was read only after Arthur permitted external calls.

### 2026-08-09 — Baseline merged into main

- marked pull request [#1](https://github.com/arthurzeyacarlin-dev/Stick-Annimation-App/pull/1) ready and merged it into `main` with merge commit `093bbac82fd3b4d97984448b6c6dbd716153354d`
- synchronized local `main` with `origin/main` and verified a clean worktree with zero ahead/behind divergence
- retained the recovery branch `codex/pre-baseline-staged-page-2026-08-09` and tag `baseline-2026-08-09-control-plane`
- confirmed the previously displayed `+115,555 / -101` represented the committed branch comparison against scaffold `main`, not uncommitted local changes

No application source behavior, dependency, database, environment value, repository visibility/default-branch setting, or deployment was changed by this merge-state cleanup.

### 2026-08-09 — Git baseline reconciliation and publication

Changed:

- reviewed HEAD, index, and working versions of `app/page.tsx` before altering the mixed index
- selected the integrated working version as the functional application baseline
- preserved the older staged version in recovery commit `d35e892bdaabbd66ab36eae4cc32144aa620de44` on pushed branch `codex/pre-baseline-staged-page-2026-08-09`
- reviewed the complete publish set for configured-secret matches, generated/ignored boundaries, symlinks, binaries, and GitHub size limits; no publication blocker was found
- committed the complete recovered snapshot as `c7de444536f3e0dd578a2063f70b0914e6af60b1` on pushed branch `rescue-before-restore`
- opened draft pull request [#1](https://github.com/arthurzeyacarlin-dev/Stick-Annimation-App/pull/1) into `main` and anchored the final publication state with tag `baseline-2026-08-09-control-plane`
- removed six trailing-whitespace-only findings after the exact-state anchor commit
- excluded generated `next-env.d.ts` and an obsolete empty `app/__dev/ai-costs` path from the reproducible project-tree snapshot

Publication is complete. The recovery branch is an archive, not a buildable product branch, and no pull request was opened for it. No application behavior, dependency, database, environment value, repository visibility, default branch, or deployment setting was intentionally changed.

### 2026-08-09 — Initial control plane and repository baseline

Added:

- automatic control-plane boot sequence and source precedence in `AGENTS.md`
- canonical product charter, PM context, current state, architecture map, AI snapshot, roadmap, TODO, decisions, terminology, verification workflow, spec lifecycle/template, handoff, archive map, and frozen baseline audit under `docs/`
- `.env.example` containing required key names only
- sanitized project-tree regeneration and required-file presence check (semantic continuity validation remains QLT-005)

Changed:

- replaced Create Next App README content with Diamond Animator repository guidance
- designated `docs/` as the only current control plane
- reclassified `diamond-animator-docs/` as reference/design material while provisionally promoting the detailed legacy V1 motion-tween intent for reconciliation, pending owner confirmation/current acceptance
- labeled stale UI-alignment logs, every legacy domain/operational note, and the source-tree paste pack as historical/reference material rather than deleting them
- split intended-behavior authority from factual current-state evidence and added a scoped legacy-reference `AGENTS.md`
- corrected the snapshot to describe the hybrid deterministic/model Generate Frames path and code-verified persistence, compositing, export, session-state, action-executor, and geometry constraints
- expanded ignore rules for browser artifacts, output, doc backups, and Supabase link temp data

Audit findings recorded:

- almost all substantive app work is untracked or modified relative to scaffold history
- Drawing Workspace is a substantial but tightly coupled local prototype
- Stick Figure Workspace/Creator remain incomplete and disconnected from persistence
- Generate Frames is the only enabled AI task; current default selects disabled Generate Plans
- current TypeScript passes, lint fails, several bespoke validators pass, and several validator harnesses fail before assertions
- public deployment is blocked by authentication/ownership/rate-limit and migration gaps

Application behavior intentionally unchanged by this entry. No runtime app code, prompt/runtime logic, database contents, dependency versions, Git index, commits, remotes, or deployment were changed; the only file under `src/` touched was the non-imported historical Markdown paste pack.
