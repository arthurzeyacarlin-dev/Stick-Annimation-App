# Project Manager Context

Status: canonical owner and collaboration context
Last updated: 2026-08-09

## Product Owner

Arthur owns product vision, priorities, acceptance judgment, and final business decisions for Diamond Animator.

Codex can inspect, plan, implement, test, and maintain the repository directly in the current task. A separate ChatGPT-to-Codex handoff is not required unless Arthur explicitly chooses to split work across tasks.

## Latest Direction

The latest product direction, captured on 2026-08-09, is:

- Diamond Animator should primarily help beginners create professional-grade stick-figure animation through AI conversation.
- AI should integrate with the real editor and manipulate the same advanced capabilities a human animator can use.
- Manual controls comparable in seriousness to established animation tools must remain available for fine-tuning and professional use.
- Long-term project continuity across Codex tasks is mandatory.
- Efficiency and cost matter alongside output quality.
- A custom Diamond Animator model may be explored later, but it is not required for the immediate product foundation.

This direction supersedes older prose that framed AI only as a passive helper or described the workspaces as complete.

## Collaboration Expectations

- Understand and trace the exact live path before editing.
- Prefer narrow, evidence-backed patches over speculative rewrites.
- Preserve unrelated working systems and the user's dirty worktree.
- Use the real app and browser verification whenever visible behavior is involved.
- State what is proven, failed, skipped, or still unknown.
- Do not stop at compile success.
- Do not create an approval gate before the required PM Review Packet.
- Do not stage, commit, push, deploy, seed remote data, or spend live AI credits unless the task authorizes it.

## Why This Control Plane Exists

Earlier work accumulated across separate chat sessions without a reliable repository memory system. New sessions could not distinguish current behavior, intended behavior, historical experiments, or protected invariants, which led to regressions and lost context.

The remedy is repository-owned continuity:

- `AGENTS.md` automatically loads the read order and working method.
- `docs/` records current truth, decisions, priorities, active specs, proof, and handoff.
- `diamond-animator-docs/` is labeled reference material rather than silently competing current state.
- every non-trivial change is spec-first and ends with updated memory.

## Product Decisions Still Needed

These are not blockers for preserving the repository, but they must be resolved before relevant implementation:

1. Is the Drawing Workspace an equal launch product, a supporting system, or a later phase?
2. Is the official brand “Diamond Animator” or “Diamond Animator Pro”?
3. What measurable gates define “professional-grade” for the first release?
4. When may AI auto-apply changes, and when must it preview or request confirmation?
5. What are the target cost, latency, token, retry, search, and credit budgets?
6. What manual stick-figure editing features are required for the first usable release?
7. What user data may be sent to model/search providers, and how long is memory retained?
8. What minimum shared stick state/executor and corrective manual controls should precede the first AI-led vertical slice, versus the broader manual editor that can follow?

Pending decisions and their status live in `DECISIONS.md`.
