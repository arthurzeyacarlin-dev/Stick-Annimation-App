# Project Manager Context

Status: canonical owner and collaboration context
Last updated: 2026-09-13

## Ownership, Sponsorship, and PM Collaboration

Arthur is Diamond Animator's day-to-day product owner and primary user. He owns product vision, priority, acceptance, and durable product and business decisions.

Oliver is Arthur's parent and project sponsor and established the current collaboration and process guidance. That sponsor role does not silently authorize a product decision, Git publication, paid or external-service use, privacy or legal commitment, or deployment; the action still requires an explicit instruction that covers it.

The long-lived Codex Project Manager task is advisory and read-only by default. It maintains whole-product and repository context, recommends sequencing, prepares Spec Architect and implementation handoffs, and reviews returned specs and PM Review Packets. It does not implement product behavior or mutate repository or Git state unless explicitly assigned that work.

Arthur is a young, capable product collaborator. Explain recommendations in direct, plain language without talking down to him or hiding important technical tradeoffs.

## Latest Direction

The latest product direction, updated through 2026-09-11, is:

- Diamond Animator should primarily help beginners create professional-grade stick-figure animation through AI conversation.
- AI should integrate with the real editor and manipulate the same advanced capabilities a human animator can use.
- Manual controls comparable in seriousness to established animation tools must remain available for fine-tuning and professional use.
- Long-term project continuity across Codex tasks is mandatory.
- Efficiency and cost matter alongside output quality.
- Development progress may be shared publicly, so every update must distinguish Proposed, Implemented, and Verified work and must not overstate unfinished capability.
- A custom Diamond Animator model may be explored later, but it is not required for the immediate product foundation.
- SPEC-0004 Phase 2 is Verified, published, and integrated in exact 20-path commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. Its eight-path hidden local pose/smooth-motion engine bakes every generated frame into ordinary independently editable Stick data and adds no provider, language matcher, or Drawing/workspace change.
- D-0041 accepts Phase 2.5 as done for its narrow shared timing/spacing purpose. GIT-037 published the exact seven-path result from base `f131e75aafccec0d1b8ecb717e2d95b518355d39` within exact 19-path commit `16799539fb7db31e345a878aa892d4485115188b`; its 250-check 14,601-byte manifest SHA-256 is `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1`. The old wave/jump/bow/dodge review samples remain rejected as natural-action evidence.
- One later SPEC-0004 Phase 2.6 executor produced the former exact eight-path unpublished result in `/Users/arthurcarlin/.codex/worktrees/8de8/stick-animation-app`. Although its manifest was technically green, Arthur rejected the overall motion after visible review. It is not accepted, propagated, published, integrated, or correction-authorized. Its proof did not require a full playback traversal and its exact frozen frames came from the same generation path.
- D-0043 originally made SPEC-0005 the replacement shared-motion foundation. D-0055 now supersedes unfinished SPEC-0004 Phases 3–8 and SPEC-0005 Phases 3–8 by future SPEC-0008; neither old sequence may resume. Published completed results and all rejected-result history are preserved.
- SPEC-0005 Phase 1 and numeric-safety Phase 2 v1 are published/integrated; GIT-043 published the exact accepted Phase 2 v1 package at `e52454354c39b962ac2710a8602a5306ffd62ad5`. GIT-044 is exact docs-only commit `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`. Arthur rejected the Phase 3 executor result authorized from it because technically valid screen-space branches, broad angle bounds, shallow candidates/scoring, key-step stops, raised recovery, and reach-like gesture did not produce natural motion. None of that executor's bytes is accepted or reusable.
- SPEC-0005 Phase 1 and Phase 2 v1/v2 remain accepted, Verified, published, and integrated; v2 is complete at GIT-048 `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`. GIT-049 published the later Phase 3 authorization at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`. A Phase 3 executor then ran, but Arthur rejected its visible result: it is unpublished, unaccepted, non-reusable, and not completed. D-0055 supersedes Phase 3 and unfinished Phases 4–8 by future SPEC-0008; they are inactive with no implementation authority.
- The old eight-phase SPEC-0005 design remains historical reference, not future dispatch authority. Do not reuse rejected implementations, call their motion accepted, or automatically carry the unimplemented contract into a new spec.
- Future Terra economics should prefer compact important-pose/timing plans, local in-betweens, safe $0 recipes first, at most one later bounded pre-Apply repair, measured private-dashboard cost, and monthly budgets/credits rather than unlimited use. Exact provider pricing/policy is a later same-day official-source gate.
- SPEC-0006 corrected Phase 4 is human-accepted under D-0063 and Verified/published/integrated through GIT-056 `9c971fa4f7ea0e636ecc6957755552f678f344df`. The accepted 26-path manifest SHA-256 is `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`; no AI/provider or later-phase feature is included.
- Arthur explicitly accepted SPEC-0006 Phase 5 as acceptable. D-0065 records the exact 17-path PASS/VALID technical result at manifest SHA-256 `6a1c65c967f8f1d87a27e3834677bea84381f0c2577125bebfead6ca77308b6d`; D-0066/GIT-057 records its exact 31-path publication at `a759ae8afbb67e8fb723983851ae36947fd97f17`; GIT-058 records it in exact 13-path commit `41983b0c88e1994675a4901d5814b3d972ad46b4`; and D-0067 records completed D-0054 cleanup with clean pre-GIT-059 local/live GitHub `0/0` synchronization. This exact 11-path D-0067 package is terminal GIT-059; its SHA/status must be read from the canonical commit containing D-0067 and Git refs. Phase 6 remains unauthorized and not started.

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

## Permanent Review-Copy Cleanup (D-0054)

Arthur requires only one active review app copy for the current milestone. This applies to every future Project Manager, including PM V3; the active Project Manager worktree is not a review app copy.

- After acceptance, preserve the accepted worktree until CPA propagation, separate authorized publication/integration, and clean synchronization succeed. Then stop its exact review server, verify its port closed, preserve required proof, and remove the obsolete executor worktree and now-unused local feature branch.
- After rejection, once the correction/replacement path is chosen and the executor is stopped, preserve any unique dirty bytes in a verified recovery backup before removing the rejected server, worktree, and obsolete local branch. Complete that cleanup before starting the next fresh executor; rejected bytes are recovery evidence, not reusable implementation.
- Resolve exact paths, branch refs, process identity/cwd and ownership before cleanup. Hash and inventory recoverable tracked/untracked bytes and required evidence, record the backup location, and verify the backup before removal. Delete only the identified obsolete local branch after confirming integration or recovery preservation; never widen cleanup to remote refs or recovery material.
- Never remove canonical main or the active Project Manager worktree. Never delete a worktree still owned by an active executor/architect. Stop if identity, ownership, unique-byte preservation, or publication is uncertain.
- The PM coordinates sequential handoff/cleanup under Arthur's authority; the authorized cleanup task performs removal. Spec Executors still cannot publish, edit the control plane, or mutate another worktree. This rule grants no implementation, Git publication, provider, or deployment authority.

## Current SPEC-0006 result — Phase 5 published, recorded, and cleaned up

Arthur accepted the Phase 5 app copy after its final gesture-durability correction. GIT-057 published the accepted `/5a2c/` package as exact commit `a759ae8afbb67e8fb723983851ae36947fd97f17`, parent `740eb70d2c713bf6bf8bd08123a0ed5eef3bc34d`, message `Implement SPEC-0006 Phase 5 tools and library`, with exactly 17 accepted technical paths plus 14 reviewed control-plane/tree paths. The immutable manifest remains `output/spec-0006/phase-5/proof-manifest.json`, SHA-256 `6a1c65c967f8f1d87a27e3834677bea84381f0c2577125bebfead6ca77308b6d`, with 17 source and 77 evidence bindings.

The result completes the current Drawing/Stick tools and shared Stick Figure Tools, Properties, Library, and Assets panels. It adds project-owned Drawing, Stick, and Mixed symbol definitions/instances; structured Stick geometry remains crisp through symbol and selection scaling. Add Limb, Move Joint, and all six Select/Lasso content-category cases commit durably on the first gesture. Placed-symbol handles clear on empty-canvas and Drawing/Stick action boundaries. Existing onion, Brush alignment, compact timeline pointer navigation, dialogs, history, Save/reopen, and protected tools remain accepted.

GIT-058 published the 13 reviewed Phase 5 record paths as `41983b0c88e1994675a4901d5814b3d972ad46b4`, parent GIT-057 `a759ae8afbb67e8fb723983851ae36947fd97f17`, with local `main`, local `origin/main`, and live GitHub `main` synchronized at clean `0/0` in the pre-GIT-059 check. D-0054 cleanup is complete: PID 7680 and port 56555 are inactive, `/5a2c/` is absent and unregistered, and local branch `codex/spec0006-phase5-publication` is absent. Canonical main and active PM `/2d14/` remain. The 98-file, approximately 17 MB proof backup is preserved under the active PM output recovery directory with the technical, prior-CPA, and post-publication-CPA manifest hashes recorded in D-0067. This exact 11-path records package is terminal GIT-059; its authoritative SHA/publication status must be read from the canonical commit containing D-0067 and Git refs. Once synchronized, Phase 5 is fully closed with no follow-on record. The next possible product action is Phase 6, but it remains unauthorized and not started.

## Historical SPEC-0006 result — corrected Phase 4 published and integrated

GIT-055 published D-0062's neutral architecture at `e956840001d18757af8f2de5361640ba70d44d68`. Arthur accepted the final visible pointer-corrected 4A/4B result; D-0063 records the exact 26-path PASS manifest at SHA-256 `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`. GIT-056 published the exact accepted implementation/control-plane package at `9c971fa4f7ea0e636ecc6957755552f678f344df`.

GIT-056 publication, clean `0/0` synchronization, and D-0054 accepted-copy cleanup are complete. Phase 5 subsequently completed and is recorded above.

The visible review must start with ordinary empty New and create real Drawing + Stick content in the same layer/frame. Layer badges cannot be hidden over an unchanged typed schema. Minimal mixed persistence precedes cutover; current symbol/library integration completes in Phase 5. No seeded demo substitutes for this result.

The PM-approved same-copy correction was completed without reusing rejected `/6e90/` bytes. The accepted `/1550/` review copy and fully merged local branch were removed after GIT-056 synchronization. See D-0063/D-0064 and SPEC-0006 §17.

No runtime, fixture, technical-test, original proof, AGENTS, generated tree, package/configuration, AI/provider/prompt/motion-engine, source-store, other-worktree, server or Git-ref/index bytes/actions changed in this architecture task. Historical proof remains bound to its original source/spec snapshots; the strict old dirty-path/current-spec validators are not claimed to pass after these docs edits.

## Why This Control Plane Exists

Earlier work accumulated across separate chat sessions without a reliable repository memory system. New sessions could not distinguish current behavior, intended behavior, historical experiments, or protected invariants, which led to regressions and lost context.

The remedy is repository-owned continuity:

- `AGENTS.md` automatically loads the read order and working method.
- `docs/` records current truth, decisions, priorities, active specs, proof, and handoff.
- `diamond-animator-docs/` is labeled reference material rather than silently competing current state.
- every non-trivial change is spec-first and ends with updated memory.

## Product Decisions Still Needed

These are not blockers for preserving the repository, but they must be resolved before relevant implementation:

1. D-0056 resolves Drawing's architectural role: it is typed authored item content alongside Stick items in the same neutral layer/frame inside one Animation Workspace. Launch breadth beyond SPEC-0006 remains a later release decision.
2. Is the official brand “Diamond Animator” or “Diamond Animator Pro”?
3. What measurable gates define “professional-grade” for the first release?
4. When may AI auto-apply changes, and when must it preview or request confirmation?
5. What are the target cost, latency, token, retry, search, and credit budgets?
6. What manual stick-figure editing features are required for the first usable release?
7. What user data may be sent to model/search providers, and how long is memory retained?
8. What minimum shared stick state/executor and corrective manual controls should precede the first AI-led vertical slice, versus the broader manual editor that can follow?
9. SPEC-0006 Phases 1–5 are Verified, published, integrated, recorded through GIT-058 `41983b0c88e1994675a4901d5814b3d972ad46b4`, and cleaned up under D-0067. This exact D-0067 package is terminal GIT-059; its SHA/status comes from the canonical commit containing D-0067 and Git refs, and no follow-on records closeout is required. Phase 6 remains unauthorized and requires Arthur's separate explicit authority.

Pending decisions and their status live in `DECISIONS.md`.
