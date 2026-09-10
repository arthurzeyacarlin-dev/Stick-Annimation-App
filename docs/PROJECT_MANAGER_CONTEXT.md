# Project Manager Context

Status: canonical owner and collaboration context
Last updated: 2026-09-10

## Ownership, Sponsorship, and PM Collaboration

Arthur is Diamond Animator's day-to-day product owner and primary user. He owns product vision, priority, acceptance, and durable product and business decisions.

Oliver is Arthur's parent and project sponsor and established the current collaboration and process guidance. That sponsor role does not silently authorize a product decision, Git publication, paid or external-service use, privacy or legal commitment, or deployment; the action still requires an explicit instruction that covers it.

The long-lived Codex Project Manager task is advisory and read-only by default. It maintains whole-product and repository context, recommends sequencing, prepares Spec Architect and implementation handoffs, and reviews returned specs and PM Review Packets. It does not implement product behavior or mutate repository or Git state unless explicitly assigned that work.

Arthur is a young, capable product collaborator. Explain recommendations in direct, plain language without talking down to him or hiding important technical tradeoffs.

## Latest Direction

The latest product direction, updated through 2026-09-10, is:

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
- D-0056 records Arthur’s one-workspace outcome and D-0057 approves SPEC-0006. Phases 1–2 are published through GIT-052 `d2096109900cc50a0a4dae2f603bd74b7b4a3427`. D-0061 accepts the recovered exact 16-path Phase 3 mixed stage/compositing result after Arthur’s visible review and executor stop. CPA propagation is complete in c6b0 at authorization `916a4d913c6fdf8340b67bcc88dcea184d67cd32`, but Phase 3 is unpublished/not integrated. Its neutral scene is manually seeded proof content with no AI/motion change. **Phases 4–7 remain Unauthorized/Not started.** Future SPEC-0007/0008 remain absent and unauthorized.

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

## Current SPEC-0006 result — Phase 3 accepted; publication pending

Phases 1–2 remain published/integrated through GIT-052 `d2096109900cc50a0a4dae2f603bd74b7b4a3427`. GIT-053 `916a4d913c6fdf8340b67bcc88dcea184d67cd32` is the records-only authorization parent/HEAD of c6b0. D-0061 records Arthur’s acceptance of the recovered normal review app and the PM’s accepted sequential transfer after the executor completed. CPA propagation is complete with all 16 technical files frozen and exactly 14 reviewed canonical records/tree paths added; index empty. Canonical main/local origin remain clean at `916a4d913c6fdf8340b67bcc88dcea184d67cd32`, 0/0, without a live-remote refresh in CPA.

The accepted technical manifest is `output/spec-0006/phase-3/proof-manifest.json`, exactly 22,897 bytes at SHA-256 `207aea2a7d664e49d28dd6b8c4704e50da9fae8d5197d9164ccbac871db4fcc0`: 16 source bindings, 20 receipts, and 60 artifacts. CPA reran the unchanged validator before propagation: PASS, 3,725 assertions and 18 negative manifest cases. All accepted technical and proof bytes remain unchanged.

Every visible element in `MIXED-REALISTIC-01` is manually seeded review content, not AI output. Its four independently owned Stick keyframes at indices 0/12/24/36 have identical neutral geometry and 44 holds; only the existing Drawing position tween moves. No AI model, prompt, generation, pose/motion engine, video, tracking/reconstruction, provider, or API behavior changed.

The review server/worktree remains preserved at `http://127.0.0.1:56463/`. Physical-phone performance and native/GPU memory remain unproven; the compact result is a desktop Chrome browser profile. Existing compact title clipping remains. No unified timeline/playback/onion owner (Phase 4), tools/panels integration (Phase 5), shared history/canonical Save/Open/recovery (Phase 6), or legacy retirement (Phase 7) is implemented or authorized by this acceptance. The accepted full-loop evidence exercises composition through the existing Stick clock; it does not complete Phase 4. No natural-motion or AI-output quality claim is made.

Next step: a separate explicitly authorized CPA publication turn may verify the unchanged accepted 16 technical paths plus the 14 reviewed control-plane/tree paths, create the phase publication branch from detached `916a4d913c6fdf8340b67bcc88dcea184d67cd32`, stage only that exact set, commit, fast-forward clean unchanged canonical `main`, push normally, and verify clean 0/0 synchronization. If canonical main advanced or any reviewed path differs, stop without pull, merge, rebase, force-push, history rewrite, or scope expansion. This CPA propagation turn stages, commits, integrates, and pushes nothing. Preserve the accepted review server/worktree/proof until publication, integration, and synchronization succeed; D-0054 cleanup follows only in an authorized cleanup step. No Phase 4 executor starts without separate authorization and durable Phase 3 integration.

## Why This Control Plane Exists

Earlier work accumulated across separate chat sessions without a reliable repository memory system. New sessions could not distinguish current behavior, intended behavior, historical experiments, or protected invariants, which led to regressions and lost context.

The remedy is repository-owned continuity:

- `AGENTS.md` automatically loads the read order and working method.
- `docs/` records current truth, decisions, priorities, active specs, proof, and handoff.
- `diamond-animator-docs/` is labeled reference material rather than silently competing current state.
- every non-trivial change is spec-first and ends with updated memory.

## Product Decisions Still Needed

These are not blockers for preserving the repository, but they must be resolved before relevant implementation:

1. D-0056 resolves Drawing's architectural role: it is typed authored content inside one Animation Workspace. Launch breadth beyond SPEC-0006 remains a later release decision.
2. Is the official brand “Diamond Animator” or “Diamond Animator Pro”?
3. What measurable gates define “professional-grade” for the first release?
4. When may AI auto-apply changes, and when must it preview or request confirmation?
5. What are the target cost, latency, token, retry, search, and credit budgets?
6. What manual stick-figure editing features are required for the first usable release?
7. What user data may be sent to model/search providers, and how long is memory retained?
8. What minimum shared stick state/executor and corrective manual controls should precede the first AI-led vertical slice, versus the broader manual editor that can follow?
9. SPEC-0006’s seven-phase preservation/migration design is approved. Phases 1–2 are published/integrated; Phase 3 stage/compositing is accepted/Verified but unpublished/not integrated under D-0061. Resolve later entry gates only under separate authorization after prior-phase publication; Phases 4–7 remain unauthorized.

Pending decisions and their status live in `DECISIONS.md`.
