## How We Work (simple workflow — Arthur, 2026-10-03)

Arthur replaced the old multi-role workflow (Spec Executor → Control Plane Architect → separate publication task, proof-manifest hash seals, ten-part packets) with a short loop:

1. **Short plan.** Before any non-trivial change, write a short plan (about one page): goal, what will change, what will not change, how it will be tested. Arthur says OK before building.
2. **Build.** Make the narrowest change that achieves the goal.
3. **Test.** Run the automated checks and try the real flow in the real app.
4. **Arthur reviews.** Arthur tries the result. If he rejects it, fix it and repeat.
5. **Save.** After Arthur approves, commit and push to GitHub only when Arthur says to.

One person (Claude) owns a task from plan to finish. No separate executor/architect hand-offs, hash-sealed proof manifests, or byte-identity proof scripts are required. Small obvious fixes (typos, one-line bugs) don't need a written plan; just say what changed.

Arthur's latest instruction always wins, including where a task is done (main checkout or a separate worktree).

## Required Working Method

On every implementation task:

1. Understand the exact goal.
2. Read the live code before changing anything, and trace the real execution path.
3. Patch narrowly.
4. Re-read the touched code after patching.
5. Verify in the real app (browser) when the change is visible.
6. Check for regressions in nearby flows.
7. Keep looping (analyze → patch → verify) until the goal is actually achieved — not just "it compiles" or "one check passed".

## Safety Rules (keep these)

- **Protected systems:** don't change login/logout, account ownership, saving/recovery, user projects/data, AI replies/search/dictation, notifications, usage recording, the drawing engine or the export engine unless the current plan says so.
- **Money:** no paid AI/provider calls, purchases, or new paid services without Arthur's OK for that specific thing. Real keys and payment accounts are set up by Arthur's dad, not by Claude.
- **Publishing:** no commit, push, deploy, or public launch unless Arthur says to.
- **Data:** never delete or move user work or accounts without a verified backup and Arthur's OK. Never commit secrets, `.env*` files, account databases, or `.local/` recovery data.
- **Honesty:** say exactly what was tested and what wasn't. Don't call something done or working without trying it.

## Done Report (short)

When a task is finished, give Arthur a short, plain-language report:

1. What changed (and the files touched)
2. What did NOT change
3. How it was tested, and what passed
4. Anything not tested or still risky

Keep it easy to understand. Technical detail can go below the short version.

## Project Memory

`docs/` is the project's memory. Read these at the start of a task: `docs/README.md`, `docs/CURRENT_STATE.md`, `docs/TODO.md`, `docs/SESSION_HANDOFF.md`, and the spec for the current work in `docs/specs/`. Treat docs as context; the live code and real app are the truth.

After a meaningful change, update only what actually changed: the spec's status, `CURRENT_STATE.md`, `TODO.md`, `SESSION_HANDOFF.md` (next starting point), and `DECISIONS.md` for real decisions. Keep entries short. Don't create competing notes files elsewhere.

## Source of Truth

- **What we should build:** Arthur's latest instruction → this file → the approved spec and decisions.
- **What the app actually does:** the live code and real-app behavior → `docs/CURRENT_STATE.md` / `SESSION_HANDOFF.md` (dated snapshots) → older docs and `diamond-animator-docs/` (history/reference only).

If docs and code disagree, say so and check the real app rather than silently picking one.
