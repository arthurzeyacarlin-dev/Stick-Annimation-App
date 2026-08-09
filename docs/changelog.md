# Changelog

Status: canonical append-only project change history
Format: newest entries first; describe observed behavior and repository operations precisely

## Unreleased

### 2026-08-09 — Git baseline reconciliation and publication

Changed:

- reviewed HEAD, index, and working versions of `app/page.tsx` before altering the mixed index
- selected the integrated working version as the functional application baseline
- preserved the older staged version in recovery commit `d35e892bdaabbd66ab36eae4cc32144aa620de44` on pushed branch `codex/pre-baseline-staged-page-2026-08-09`
- reviewed the complete publish set for configured-secret matches, generated/ignored boundaries, symlinks, binaries, and GitHub size limits; no publication blocker was found

The functional baseline commit and draft pull request remain in progress. The recovery branch is an archive, not a buildable product branch, and no pull request will be opened for it.

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
