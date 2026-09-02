# Project Manager Context

Status: canonical owner and collaboration context
Last updated: 2026-09-02

## Ownership, Sponsorship, and PM Collaboration

Arthur is Diamond Animator's day-to-day product owner and primary user. He owns product vision, priority, acceptance, and durable product and business decisions.

Oliver is Arthur's parent and project sponsor and established the current collaboration and process guidance. That sponsor role does not silently authorize a product decision, Git publication, paid or external-service use, privacy or legal commitment, or deployment; the action still requires an explicit instruction that covers it.

The long-lived Codex Project Manager task is advisory and read-only by default. It maintains whole-product and repository context, recommends sequencing, prepares Spec Architect and implementation handoffs, and reviews returned specs and PM Review Packets. It does not implement product behavior or mutate repository or Git state unless explicitly assigned that work.

Arthur is a young, capable product collaborator. Explain recommendations in direct, plain language without talking down to him or hiding important technical tradeoffs.

## Latest Direction

The latest product direction, captured on 2026-08-09, is:

- Diamond Animator should primarily help beginners create professional-grade stick-figure animation through AI conversation.
- AI should integrate with the real editor and manipulate the same advanced capabilities a human animator can use.
- Manual controls comparable in seriousness to established animation tools must remain available for fine-tuning and professional use.
- Long-term project continuity across Codex tasks is mandatory.
- Efficiency and cost matter alongside output quality.
- Development progress may be shared publicly, so every update must distinguish Proposed, Implemented, and Verified work and must not overstate unfinished capability.
- A custom Diamond Animator model may be explored later, but it is not required for the immediate product foundation.
- SPEC-0004 Phase 2 is Verified, published, and integrated in exact 20-path commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. Its eight-path hidden local pose/smooth-motion engine bakes every generated frame into ordinary independently editable Stick data and adds no provider, language matcher, or Drawing/workspace change.
- D-0040 authorizes Phase 2.5 as the next bounded milestone: the shared local timing/spacing engine for both later free/Pretend-AI recipes and future Terra original non-hardcoded plans. Both use key poses → validated timing profile → smooth local in-betweens with acceleration/deceleration and fast/slow spacing → independent editable Stick frames. Phase 2.5 connects neither AI route, adds no visible tester box, and cannot start until GIT-036 publishes this docs-only activation.
- Future Terra economics should prefer compact important-pose/timing plans, local in-betweens, safe $0 recipes first, at most one later bounded pre-Apply repair, measured private-dashboard cost, and monthly budgets/credits rather than unlimited use. Exact provider pricing/policy is a later same-day official-source gate.
- Arthur is interested in a possible later unified Animation Workspace with one project/timeline/canvas/save/history/AI surface and typed Stick/Drawing layers. This is a future separate-spec question, not current authorization. Backgrounds, stick colors, custom stick shapes/rigs, accurate non-humanoid bodies, and layers are also later separate-spec work, not Phase 2.5.

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
- Run each implementation phase through a dedicated **Spec Executor** task and worktree based on current canonical `main`; do not mix later-phase work into it.
- The Spec Executor implements and technically tests exactly one phase, produces validated technical evidence and an Implementation Review Packet, and stops. It never edits the canonical control plane or stages, commits, merges, pushes, or publishes.
- Arthur and the Project Manager accept or reject the executor's implementation. Rejection returns to a separately authorized executor correction task; it does not trigger propagation or publication.
- Only after acceptance and complete executor shutdown may a **Control Plane Architect** take exclusive ownership of that same worktree. The architect verifies the accepted bytes/evidence, updates canonical memory, runs final closeout/Git proof, returns its own PM Review Packet, and stops with an empty index.
- Worktree ownership is sequential. The Spec Executor and Control Plane Architect must never edit the same worktree concurrently.
- Treat both review packets as evidence for human review, not as stage, commit, or push authorization. A separate explicit publication instruction authorizes only the Control Plane Architect to stage the approved implementation/control-plane paths, commit, integrate into canonical `main`, push, and verify before the next phase starts.
- Every implementation handoff should recommend the Codex model and reasoning level appropriate to that phase's risk.
- Use progressive elaboration: make the current authorized phase exact, but turn non-blocking later-phase uncertainty into a named entry gate or follow-up rather than repeatedly rewriting the whole spec.
- Consolidate PM findings into one review round. After one correction round, send a spec back only for a genuine blocker affecting the accepted outcome, an owner choice, material safety/cost/privacy/data risk, current-phase feasibility/proof, an authorized boundary, or a protected regression.
- Start every implementation phase in Codex Plan mode so the new task refreshes evidence and presents its exact phase plan before implementation. Plan mode grants no additional scope or publication authority.
- Default PM discussion, spec architecture, and normal implementation work to Extra High reasoning. Use High for small mechanical control-plane/Git work and straightforward reviews. Reserve Ultra for genuinely high-risk or conflicting work such as foundational state architecture, migration/data-loss risk, security/privacy boundaries, paid-provider authorization, or irreconcilable evidence.

SPEC-0001 Phase 1 is a completed historical exception under the previous combined workflow. It remains Verified, published, and integrated; do not send it back through the new lifecycle or republish it.

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
9. Should a later unified Animation Workspace replace the separate Drawing/Stick project choice, and what project-format/layer migration would keep both systems safe?

Pending decisions and their status live in `DECISIONS.md`.
