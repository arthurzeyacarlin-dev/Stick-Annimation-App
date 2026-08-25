# Decision Log

Status: canonical durable decisions
Format: append new decisions; supersede old decisions explicitly rather than rewriting history

## Accepted Decisions

### D-0001 — One canonical control plane

- Date: 2026-08-09
- Status: accepted for repository operations
- Decision: `docs/` owns current project memory. `AGENTS.md` is the bootloader. `diamond-animator-docs/` is reference/design material unless a file is explicitly provisionally promoted in `docs/specs/README.md`.
- Why: two overlapping, stale documentation trees caused ambiguous authority and failed continuity.
- Consequence: no duplicate current-state, TODO, changelog, roadmap, decision, or handoff files may be introduced elsewhere.

### D-0002 — Evidence labels are mandatory

- Date: 2026-08-09
- Status: accepted
- Decision: distinguish live verified, code verified, check verified, intended, risk, and unknown claims.
- Why: prior docs called UI milestones complete and treated aspiration as implementation.
- Consequence: unverified risk cannot be reported as a confirmed bug; intended product direction cannot be reported as working behavior.

### D-0003 — Non-trivial changes are spec-first

- Date: 2026-08-09
- Status: accepted
- Decision: every non-trivial behavior change or bug fix requires one active spec under `docs/specs/` before implementation.
- Why: regression boundaries and acceptance flows were otherwise lost between tasks.
- Consequence: the spec must identify the real execution path, scope, non-goals, proof, and systems intentionally left unchanged.

### D-0004 — “Training” files are prompt/reference examples

- Date: 2026-08-09
- Status: accepted terminology decision
- Decision: describe current TypeScript example libraries as prompt/reference examples, not a trained Diamond Animator LLM.
- Why: the repository has no fine-tuning, embeddings, vector, training, or model-serving pipeline.
- Consequence: custom-model work requires a separate approved R&D spec and dataset governance.

### D-0005 — Memory maintenance never mutates Git history automatically

- Date: 2026-08-09
- Status: accepted safety decision
- Decision: control-plane helpers may validate and regenerate a sanitized tree, but must not silently stage, commit, push, reset, clean, or restore.
- Why: the initial worktree has a mixed index and almost all implementation files are untracked.
- Consequence: baseline versioning remains an explicit reviewed task.

### D-0007 — Use the integrated working page for the functional baseline

- Date: 2026-08-09
- Status: accepted repository-preservation decision under Arthur's explicit commit/push authorization
- Decision: use working `app/page.tsx` blob `c24392097af8d578fc1f6cc501dad121ce0cb1fc` in the functional baseline. Preserve the older indexed blob `d44892246c4a8933047c028d2508e194e1ec731a` separately in recovery commit `d35e892bdaabbd66ab36eae4cc32144aa620de44` on `codex/pre-baseline-staged-page-2026-08-09`.
- Why: the working version is the coherent current shell and matches the live-verified Open Project, Drawing, Stick, and Creator flows; the index version is an older monolithic home/new/drawing generation.
- Consequence: the recovery branch is historical and intentionally incomplete, receives no implementation pull request, and must remain until baseline acceptance makes deletion an explicit later decision.

### D-0008 — Use progressive elaboration and risk-calibrated task starts

- Date: 2026-08-10
- Status: accepted project-operating decision under Oliver's explicit sponsor instruction; this accepts no SPEC-0001 owner row
- Decision: make a spec decision-complete and safe for the currently authorized phase, move non-blocking later-phase uncertainty into explicit entry gates or follow-ups, consolidate PM findings into one review round, and require a genuine product/safety/current-phase blocker before another correction round. Start each implementation phase in Codex Plan mode. Use Extra High reasoning by default for PM/spec/normal implementation work, High for small mechanical control-plane or Git work, and Ultra only for genuinely high-risk or conflicting evidence.
- Why: repeated attempts to make all later phases perfect before any implementation consumed a full working day without proportionate product-risk reduction.
- Consequence: this standard does not lower acceptance or regression proof. User-outcome changes, owner choices, material security/privacy/cost/data-loss risk, current-phase feasibility or proof gaps, boundary violations, and protected regressions still block; bounded mechanics and later-phase details do not block earlier safe work.

### D-0009 — Approve SPEC-0001 and authorize Phase 1 only

- Date: 2026-08-11
- Status: accepted by Arthur for `SPEC-0001`
- Decision: approve [`SPEC-0001 — First Reversible AI-Created Stick Animation from Workspace Chat`](specs/0001-first-reversible-ai-stick-animation.md). Accept OD-01 through OD-06 and OD-09 exactly as written. Approve OD-07, OD-08, OD-10, and OD-11 as governing engineering rules and prerequisites. Defer OD-12 through OD-14, including exact provider model/reasoning/numeric policy, retention, cost-risk choice, and optional paid proof, until the separate Phase 7 Policy Gate.
- Why: the spec now defines one narrow, reversible, human/AI-equivalent Stick animation outcome and divides the work into independently provable phases with explicit safety and publication boundaries.
- Consequence at decision time: SPEC-0001 became active and Approved. Phase 1 alone was Authorized but Not started; Phases 2–7 and the separate browser-harness prerequisite remained Unauthorized/Not started. No provider integration, external lookup, search, Supabase request, retention choice, paid/live request, Git publication, or implementation work was authorized by this approval record. Phase 1 could begin only after that approval state was separately published and integrated into canonical `main`, in a new Plan-mode implementation task. Historical status note: Phase 1 was later completed, Verified, published, and integrated at `21a88feb65cf1cc51138c9ad4879b962ee468569`; D-0010 preserves that result as the exception under the former workflow.

### D-0010 — Separate phase execution from control-plane propagation and publication

- Date: 2026-08-13
- Status: accepted by Arthur as permanent project process
- Decision: every future implementation phase uses four sequential authorities: (1) a Spec Executor exclusively implements and technically tests one authorized phase, creates validated technical proof, returns an Implementation Review Packet, and stops without editing the canonical control plane or Git state; (2) Arthur and the Project Manager accept or reject the implementation; (3) after acceptance and complete executor shutdown, a Control Plane Architect takes exclusive ownership of the same worktree, propagates the accepted result into the canonical control plane, validates the technical manifest, completes final tracked-state/Git proof, returns a Control Plane Architect PM Review Packet, and stops; (4) only a later explicit publication instruction authorizes that architect to stage, commit, integrate into canonical `main`, push, and verify.
- Why: the former combined lifecycle let one task implement behavior, write the authoritative project record, and prepare publication, blurring independent review and increasing regression, stale-memory, and accidental-Git-mutation risk.
- Consequence: a Spec Executor may change only its phase-authorized implementation/fixture/technical-test files and ignored proof artifacts. It must not edit `AGENTS.md`, canonical `docs/`, or `project/project_structure.txt`, and must not stage, commit, merge, push, publish, or mutate another worktree. A Control Plane Architect may not enter that worktree until the executor is stopped and the implementation is accepted, and may not alter accepted runtime/fixture/test bytes. Rejection returns to a separately authorized executor correction task. The two roles never edit one worktree concurrently. In the later authorized publication task, the architect stages only the accepted implementation/reviewed control-plane paths, commits on the phase branch, fast-forwards a clean canonical `main`, pushes, and verifies clean `0/0` synchronization; an advanced `main` or changed path is a stop condition, not permission to pull, merge, rebase, force-push, rewrite history, or expand scope. D-0010 supersedes only the combined executor/control-plane mechanics previously described by D-0009/OD-10; sequential phases, Plan-mode starts, human review, separate publication authorization, and canonical-main integration remain required. SPEC-0001 Phase 1 remains a completed Verified/published/integrated historical exception and is not repeated, rewritten, or republished.

### D-0011 — Approve and authorize SPEC-0001 Phase 1.5 only

- Date: 2026-08-14
- Status: accepted by Arthur for `SPEC-0001` Phase 1.5
- Decision: approve the **Phase 1.5 — Permanent Automatic Browser Tester** amendment and authorize Phase 1.5 only as **Approved; Authorized; Not started**. The tester is a permanent reusable developer tool that remains invisible and unreachable to website users: it may add no tester route, page, button, API, asset, or production import; it may make no permanent application font, style, source, or behavior change; and every temporary test/font setup must be restored byte-for-byte. OpenAI, search, Supabase, paid services, and deployment remain forbidden.
- Why: repeatable, fail-closed browser proof is a prerequisite for safely changing the real Stick workspace in Phase 2, while a product-visible or product-mutating test surface would create unacceptable regression and shipping risk.
- Consequence: Phase 1.5 may begin only in a new Plan-mode Spec Executor task/worktree after this approval record is separately reviewed, published, and integrated into canonical `main` under D-0010. This decision does not begin implementation, authorize Git publication, authorize dependency or external acquisition, or authorize Phase 2 or Phases 3–7. Phase 1 remains Verified, published, and integrated. Phases 2–7 remain **Unauthorized; Not started**, and Phase 2 stays blocked until Phase 1.5 is Verified, accepted, propagated, separately published, and integrated.

### D-0012 — Approve the Phase 1.5 protected-Drawing correction ceiling

- Date: 2026-08-15
- Status: accepted by Arthur for the blocked `SPEC-0001` Phase 1.5 correction
- Decision: approve and authorize the Phase 1.5 correction as **Authorized; Not started/resumed**. Temporary diagnosis may occur only in `src/components/workspace/DrawingWorkspace.tsx` and `src/components/workspace/DrawingCanvas.tsx`. No behavior patch is allowed until diagnostics identify the first clearing writer. Any permanent runtime change is limited to the proven smallest subset of those two files. If diagnosis requires a third runtime file, a broad rewrite, or unrelated behavior change, the correction stops without expanding scope.
- Why: the stopped fail-closed tester proved that deterministic Drawing pixels appeared and then disappeared during final AI settlement, while existing evidence cannot distinguish the first clearing authority between the workspace restore/publication path and the canvas reset path. The two-file ceiling permits evidence collection at both known boundaries without pre-authorizing a guessed fix.
- Consequence: the stopped Phase 1.5 result remains blocked, unaccepted, unpublished, and without a valid proof manifest. A separately authorized Plan-mode correction Spec Executor may resume the stopped worktree only after this approval record is reviewed, separately published, and integrated under D-0010. `app/layout.tsx`, application fonts/styles, Drawing contracts/routes/planner/executor, Stick behavior, external services, Phase 2, and all later phases remain outside scope. OpenAI, search, Supabase, paid services, deployment, Git publication, worktree deletion, and recovery-branch use remain unauthorized.

### D-0013 — Approve SPEC-0002 and authorize Phase 1 only

- Date: 2026-08-15
- Status: accepted by Arthur for `SPEC-0002`
- Decision: Arthur explicitly approved: “I approve SPEC-0002. I accept OD2-01 through OD2-08 as written. I authorize Phase 1 only. SPEC-0002 Phase 2 and SPEC-0001 Phase 2 remain unauthorized.”
- Why: the specification defines a bounded, lossless local Drawing persistence foundation, separates the hidden format/storage engine from later real Save/Open wiring, and includes finite capacity, last-good preservation, strict legacy handling, offline proof, and conflict gates.
- Consequence: [`SPEC-0002 — Lossless Local Drawing Save and Reopen`](specs/0002-lossless-local-drawing-save-and-reopen.md) is Approved and active for this bounded work. OD2-01 through OD2-08 are accepted exactly as written. SPEC-0002 Phase 1 is **Authorized; Not started** and may begin only after this approval record is reviewed, separately published, and integrated into canonical `main`, in one new Plan-mode Spec Executor worktree from the then-current canonical-main SHA. SPEC-0002 Phase 2 and SPEC-0001 Phase 2 and later phases remain **Unauthorized; Not started**. The activation audit at `365e68fe98b27e993a1c5645c3e28c7b428c6f33` found clean synchronized canonical `main`, no active SPEC-0001 executor or architect, and a Phase 1 allowlist consisting only of new files with no overlap in SPEC-0001 runtime files or the shared tester core. Any real future overlap is a hard stop. This decision begins no implementation and authorizes no staging, commit, push, merge, publication, deployment, external request, or paid service.

### D-0014 — Authorize SPEC-0002 Phase 2 only

- Date: 2026-08-16
- Status: accepted by Arthur for `SPEC-0002` Phase 2
- Decision: Arthur explicitly authorized SPEC-0002 Phase 2 — Real Save/Open Wiring and Browser Proof as **Authorized; Not started**. This authorization covers only the existing Phase 2 scope and proof boundary in [`SPEC-0002`](specs/0002-lossless-local-drawing-save-and-reopen.md); it does not approve a runtime change in this control-plane task.
- Why: Phase 1 is Verified, published, and integrated, and the fresh audit at canonical `main`/`origin/main` `4835244e522c0f4206af8946a631d9244f2c9945` confirmed clean `0/0` synchronization, an unwired V2 engine, no active Phase 2 executor, no canonical SPEC-0003 file, and no file overlap with SPEC-0001 Phase 2's Stick-only boundary.
- Consequence: SPEC-0002 Phase 2 is **Authorized; Not started**. After this activation packet is reviewed and D-0014 is separately published to canonical `main`, exactly one new exclusive Plan-mode SPEC-0002 Phase 2 Spec Executor task may begin from that published authorization SHA and must refresh the conflict audit before implementation. It must run sequentially: no overlapping executor may touch `app/page.tsx`, Drawing persistence/navigation, or shared browser proof. SPEC-0001 Phase 2 and later phases remain **Unauthorized; Not started**; SPEC-0003 remains absent from canonical `main` and untouched. This decision authorizes no implementation in this task and no staging, commit, push, merge, publication, deployment, external request, paid service, or recovery-branch use.

### D-0015 — Authorize SPEC-0001 Phase 2 only after SPEC-0002 completion

- Date: 2026-08-17
- Status: accepted by Arthur for `SPEC-0001` Phase 2; activation record published in `a85690de9396cf97e3063005cbb6da85f109ae1d`
- Decision: Arthur authorized the dependency-safe sequence **SPEC-0002 Phase 2, then SPEC-0001 Phase 2, then whole SPEC-0003**. SPEC-0002 Phase 2 is now Verified, published, integrated, and durably complete at `af89b26c89d83eb61f77d91b4a50c105b7c12079`. SPEC-0001 Phase 1 and Phase 1.5 remain Verified/published/integrated. SPEC-0001 Phase 2 — Independent per-frame Stick state — is **Authorized; Not started**. Phases 3–7 remain **Unauthorized; Not started**.
- Why: the published SPEC-0002 work completes the earlier Drawing persistence dependency before Stick work begins, while SPEC-0001 Phase 2 is the next bounded foundation required for the human-built three-pose/12-frame wave and later reversible AI execution. The fresh audit found clean synchronized canonical `main` at `af89b26c89d83eb61f77d91b4a50c105b7c12079`, no active executor or dirty worktree owning the exact Phase 2 Stick allowlist, and the separate SPEC-0003 proposal only in its own dirty documentation worktree. SPEC-0002 completed first because it and later SPEC-0003 work both use `app/page.tsx`; no SPEC-0003 byte is copied or activated here.
- Consequence: after this D-0015 activation record is separately reviewed, published, and integrated, exactly one new dedicated Plan-mode SPEC-0001 Phase 2 Spec Executor task/worktree may begin from that activation publication SHA and must repeat the conflict audit. Its scope is exactly SPEC-0001 §10.5: independent per-frame Stick state, the built-in editable figure, the no-AI manual three-pose/12-frame wave, equal manual editability for all 11 joints, the derived line head, and exact transient drag/pointer-up/cancel safety. History, storage, Open Project, AI/chat/API/provider work, SPEC-0003, and later phases remain outside scope. The permanent tester and exact Phase 2 technical-proof contract remain mandatory. This decision authorizes no implementation in this control-plane task, no staging/commit/push/merge/publication, and no external request, OpenAI, search, Supabase, paid service, or deployment.

### D-0016 — Approve and authorize the SPEC-0001 Phase 1.5 proof-compatibility correction

- Date: 2026-08-17
- Status: accepted by Arthur under his explicit autopilot authorization and accepted by the Project Manager
- Decision: approve the exact SPEC-0001 §10.4A **Phase 1.5 Compatibility Correction for Phase 2 Proof** as **Approved; Authorized; Not started**. Its implementation ceiling is exactly the 23 proof-infrastructure paths listed in §10.4A. It changes no user-facing behavior, product outcome, or owner choice. The same immutable version-2 plan must support both dirty-executor and clean-committed proof through exact `dirtyExpectedPaths` and `cleanExpectedPaths`, with state derived from real Git-visible bytes. The correction catalog pre-authorizes only the future Phase 2 paths, schemas, operation families, output root, and §10.5 ceiling; future Phase 2 byte lengths and SHA-256 bindings are established only when Phase 2 creates those files and are not pre-known or pre-recorded by this correction.
- Why: fresh tracing at published activation base `a85690de9396cf97e3063005cbb6da85f109ae1d` proved a genuine proof-infrastructure feasibility blocker: the permanent runner ignores the required plan, loads no later-phase registry/action module, rejects legitimate later-phase dirty sets, and hard-codes a historical lint tuple. The accepted §10.4A correction makes the already-approved Phase 2 proof executable without widening Phase 2 or changing the product.
- Consequence: historical Phase 1 and Phase 1.5 remain Verified, published, and integrated. SPEC-0001 Phase 2 remains **Authorized; Not started; blocked** until this exact correction is implemented by one Plan-mode Spec Executor, technically accepted, propagated under D-0010, separately published/integrated, and followed by a new activation SHA/executor record. Phases 3–7 remain **Unauthorized; Not started**. This control-plane task begins no implementation and authorizes no later phase, external request, OpenAI, search, Supabase, paid service, deployment, staging, commit, merge, push, or publication. The correction itself may begin only after this D-0016 record is separately reviewed, published, and integrated into canonical `main`.

### D-0017 — Approve and authorize SPEC-0001 §10.5A only

- Date: 2026-08-18
- Status: accepted by Arthur for the SPEC-0001 Phase 2 visible-result correction
- Decision: Arthur explicitly rejected the published Phase 2 visible workspace result and approved §10.5A **Phase 2 UI Restoration and Editable Timeline Correction** as **Approved; Authorized; Not started**. The exact accepted outcome is the pre-Phase-2 Stick presentation and prior tools/navigation; one small empty starting keyframe and empty canvas with no automatic figure, wave, or twelve cells; only applicable current Drawing-style frame and layer behavior in the Stick timeline; Insert Frame, Insert Keyframe, Insert Blank Keyframe, copy, paste, remove, held-span, and applicable layer operations; deep-independent editable Stick content per keyframe with holds resolving/editing their owner; unchanged fonts, colors, menus, right panel, toolbar, and canvas presentation; and Creator remaining accessible.
- Why: the published `adbda9dd4f42a103c3c5af41ccc19b110b6825c0` technical result passed its bounded proof but visibly replaced the accepted Stick workspace with a large automatic twelve-cell/figure experience, reduced tools, altered presentation, disabled layer operations, and Creator locking. Fresh historical/current comparison established the exact restoration baseline and the narrow timeline behavior needed without changing the product outside Stick Phase 2.
- Consequence: the original Phase 2 publication remains immutable historical owner-rejected evidence. §10.5A alone is Authorized/Not started and may begin only after this activation record is separately reviewed, published, and integrated; that future publication commit becomes the exact implementation base for one new dedicated Plan-mode Spec Executor worktree. The executor must remain inside §10.5A's exact nine-runtime-file and bounded proof ceiling, stop completely for Arthur's visible desktop/compact review, and perform no control-plane or Git action. Phase 3 and Phases 4–7 remain **Unauthorized; Not started**. SPEC-0002 remains complete/protected; SPEC-0003 remains Proposed/inactive and untouched. No persistence, AI, Drawing change, external request, OpenAI, search, Supabase, paid service, deployment, staging, commit, merge, push, or publication is authorized by this decision-recording task.

### D-0018 — Fix real Stick onion skin inside Phase 3 without authorizing Phase 3

- Date: 2026-08-18
- Status: accepted by Arthur as the exact future SPEC-0001 Phase 3 onion-skin outcome
- Decision: the Onion button restored by §10.5A remains presentation-only in Phase 2 and becomes functional inside Phase 3. While paused and ON, it renders at most one nearest previous distinct visible active-layer Stick state with exact Drawing tint `rgba(92, 63, 158, 0.58)` and at most one nearest next distinct visible active-layer Stick state with exact Drawing tint `rgba(44, 122, 91, 0.56)`. Resolution skips holds/same-visible states, stops at an encountered blank/empty boundary, and suppresses the next overlay when both sides resolve to the same visible state. The current pose stays normal/editable; overlays are transient, non-interactive, suppressed during playback, cleared immediately when OFF, and excluded from canonical project/history/digest/storage/AI bytes. Fresh human-authored, later AI-authored, fixture-mounted, and reopened Stick projects use the same renderer path. Drawing runtime and tint behavior remain byte-for-byte unchanged.
- Why: Arthur explicitly chose Drawing-consistent onion skin for the existing Stick control. It makes frame-to-frame posing readable without introducing tweening, automatic motion, a separate phase, a second renderer, or any new persisted state.
- Consequence: SPEC-0001 Phase 3's authorized-file proposal and proof contract now include only the existing Stick workspace/canvas work necessary for this transient renderer plus deterministic and browser proof of exact count/tints/alpha, neighbor resolution, blank/hold/duplicate/multi-layer boundaries, playback/OFF suppression, non-interactivity, origin independence, zero canonical mutation, and Drawing regression. Onion skin is removed from the later tween/interpolation deferral; tweening, automatic in-betweens, easing, and motion frames remain deferred. Phase 3 remains **Unauthorized; Not started** and may not be planned or implemented until separately authorized after §10.5A closeout/publication. This decision authorizes no runtime/test/proof edit, Drawing change, external request, stage, commit, push, publication, or later phase.

### D-0017 closeout note — §10.5A accepted and technically Verified in its worktree

- Recorded: 2026-08-18
- Result: after the Spec Executor stopped and Arthur plus the Project Manager accepted the visible/technical result, the Control Plane Architect took exclusive ownership of the dedicated correction worktree at exact base/HEAD `1f9746a6188e5e13aca1fbd62bea2e1e27bba627`. The exact 20 accepted implementation/proof paths remain byte-bound to technical-manifest SHA-256 `edda3028b9fbe2759e31059455f16cc3ee02ac9b242149107454071dae62de90`; the index remains empty.
- Proof disposition: the registered correction plan passed 15/15 actions, two compact screenshots, and five protected groups. Deterministic proof records 311 timeline assertions and 631 Phase 1 regressions; TypeScript, focused/measured lint, and diff checks pass. The historical SPEC-0002 command is `not-applicable`, never passed, because its obsolete frozen runner hash differs and the fail-closed audit proves zero protected Drawing/SPEC-0002/Open/storage/`app/page.tsx` or relevant shared-dependency runtime-byte change. The published SPEC-0002 record, Arthur's human Drawing Save verification, and current protected groups remain the replacement protection. Two alternate harness attempts are diagnostics only.
- Finalizer repair: after separate Spec Executor repair and Arthur/Project Manager acceptance, `scripts/finalizeSpec0001ProofBundle.ts` at SHA-256 `e6795e9f686117d89824bea4f9de3ed766077ba9a8d00c51c27b074708c396f9` adds the explicit `--purpose=phase-2-ui-restoration-correction` mode without changing the historical/default mode. The correction mode binds the exact 29-path tracked state, accepted technical manifest and 20/20 hashes, 16/16 protected zero diffs, sole obsolete SPEC-0002 runner-hash mismatch, registered browser evidence, empty index, and correction-specific ignored closeout. Historical SPEC-0002 remains `not-applicable`, never passed.
- Consequence: §10.5A is **Verified and accepted in the dedicated worktree; pending separate publication/integration**. This closeout does not stage, commit, merge, push, publish, authorize Phase 3, or change D-0018. Phase 3 remains **Unauthorized; Not started**.

### D-0019 — Authorize SPEC-0001 Phase 3 after §10.5A integration

- Date: 2026-08-18
- Status: accepted by Arthur for `SPEC-0001` Phase 3
- Decision: Arthur explicitly instructed that onion skin remains inside Phase 3, that the already accepted D-0018 outcome must be included unchanged, and that Phase 3 should be prepared for implementation but not started in this task. The §10.5A correction is now **Verified, published, and integrated** in canonical `main` at `edfb3dea023119b91336e6e5da645d4982a9f068`. SPEC-0001 Phase 3 — **Atomic history and minimal local persistence**, including the exact D-0018 Stick onion-skin contract — is therefore **Authorized; Not started**. The rest of Phase 3's approved scope, proof, non-goals, and protected regressions remain unchanged.
- Why: the sole Phase 3 entry prerequisite is now durably satisfied, and Arthur has explicitly selected Phase 3 as the next bounded implementation phase without splitting onion skin into separate work.
- Consequence: after this authorization record is reviewed, published, and integrated, exactly one new dedicated Plan-mode Phase 3 Spec Executor task may begin from this activation publication's final canonical-main SHA and implement only SPEC-0001 §10.6. This record begins no Phase 3 runtime/test/proof work, authorizes no Phase 4–7 work, and authorizes no external request, OpenAI, search, Supabase, paid service, deployment, or broader product change. Phases 4–7 remain **Unauthorized; Not started**.

### D-0020 — Accept the Phase 3 tester-registration and Creator-preservation correction

- Date: 2026-08-18
- Status: accepted by Arthur as the exact corrected SPEC-0001 Phase 3 implementation and proof boundary
- Decision: keep D-0018 exact and Phase 3 **Authorized; Not started** until this accepted correction record is separately published and integrated. Phase 3 implements only Stick Undo/Redo, local Save/Open, and D-0018 onion on the published §10.5A compact shell/manual timeline. Preserve Stick Figure Creator presence and usability before and after edits, Undo/Redo, Save, Open, reload, fixtures, and terminal failures; add no Creator lock/copy or history/storage/document/digest/request/checkpoint lock field, and do not broaden Creator Save/library behavior. Accept exactly the nine named shared tester paths in corrected §10.6 for an additive, fail-closed `phase-3/v1` registration/port while preserving the legacy no-plan, Phase 1.5 synthetic, and Phase 2 meanings and modes. Add no redesign, fat frames, automatic figure/wave/twelve cells, new colors or bright-green state, animation/glow, font/size/spacing/layout/tab/menu/toolbar/panel change, removed control, or Drawing change.
- Why: the stopped first Phase 3 executor changed no file and proved at exact clean canonical `45504214dffb528e930194b93fc2ab78dc730ebc` that the two-entry tester and its closed schemas/types/runner/recorder/validator cannot register or prove Phase 3. The accepted correction resolves that feasibility blocker without widening the product outcome or weakening protected older tester modes.
- Consequence: GIT-019 must publish/integrate only this reviewed seven-document correction and report the resulting exact clean canonical-main SHA. Only then may one replacement dedicated Plan-mode Phase 3 Spec Executor implement corrected §10.6 and stop after its technical proof/Implementation Review Packet. This decision implements nothing, authorizes no staging/commit/merge/push/publication by itself, and leaves Phases 4–7 **Unauthorized; Not started**.

### D-0019 closeout note — Phase 3 accepted and technically Verified in its worktree

- Recorded: 2026-08-19
- Result: after the proof-only Spec Executor stopped, Arthur completed visible human review and explicitly accepted the Phase 3 result. The Control Plane Architect then took exclusive ownership of `/Users/arthurcarlin/.codex/worktrees/cdb2/stick-animation-app`, verified exact base/HEAD `54234b7c7b95201e274975a804859fa9c36806a1`, an empty index, and the exact 30-path accepted implementation/fixture/test set, and independently revalidated `output/spec-0001/phase-3/proof-manifest.json` at SHA-256 `07bd09c413a28ffcc706be85d00d1d4466cde1e336daceab23d9a1617153b675` without changing accepted bytes.
- Proof disposition: the fresh manifest binds 11 successful receipts and 63 artifacts. It proves the bounded async Drawing-memory validator correction, Stick history/persistence/onion behavior, TypeScript, base/result lint at 5 errors and 72 warnings with zero changed-line/new-file findings, diff checks, registration self-test, inherited tester run, and a 71-action/7-checkpoint/4-screenshot two-viewport browser result with all five protected groups, zero non-loopback/provider requests, and complete cleanup. After the first closeout exposed a missing Phase 3 record-path context, a separately accepted proof-only correction changed exactly `scripts/spec0001-browser/browserTesterExtensionContract.ts` and `scripts/validateSpec0001ProofBundle.ts` to enforce the exact 30-technical-plus-eight-record closeout set; it changed no accepted product outcome or other accepted technical byte. Arthur's human review accepted the visible Undo/Redo, layer, onion, playback, and preserved-shell result.
- Consequence at closeout: Phase 3 was **accepted and technically Verified in its dedicated worktree; pending separate publication/integration**. This note changed no product choice and did not stage, commit, merge, rebase, push, publish, deploy, authorize Phase 4, or change D-0018/D-0019/D-0020. Current superseding status is recorded by D-0022: Phase 3 is published/integrated at `3fe3a5487389647b67216e9466121e00f1a73856`; Phase 4 is Authorized/Not started after D-0022 publication; Phases 5–7 remain Unauthorized/Not started.

### D-0021 — Require a separate review copy before accepting visible implementation changes

- Date: 2026-08-19
- Status: accepted by Arthur as a permanent implementation-review rule
- Decision: for every future implementation that changes visible application behavior, the stopped Spec Executor must leave the exact worktree result available for human review. Before accepting that result or authorizing control-plane propagation/publication, the Project Manager must give Arthur a separate review copy through a current worktree-served loopback app URL, current screenshots from that exact worktree, or both, and explain in plain language what to review. Arthur reviews the unpublished worktree result rather than testing canonical `main`. Publication waits for Arthur's explicit human acceptance. If Arthur rejects the visible result, it returns to a separately authorized Spec Executor correction task; no propagation or publication follows the rejected result.
- Why: Arthur's Phase 2 and Phase 3 reviews proved that automated checks can pass while a visible result is still wrong for the intended product, and that a separate worktree preview lets him evaluate the real change without placing unaccepted bytes on canonical `main`.
- Consequence: this human review copy is an additional product-acceptance gate, not a replacement for deterministic or browser regression proof. It creates no production route, public tester, deployment, external upload, or requirement to copy unpublished bytes into `main`. Invisible implementation changes may use their exact technical evidence when no visible app surface exists. The existing Spec Executor → Arthur/Project Manager → Control Plane Architect → separate publication lifecycle remains unchanged; Phase 3's completed visible acceptance satisfies this rule. Phase 4 was Unauthorized/Not started when D-0021 was recorded; D-0022 later authorizes it without changing this review rule.

### D-0022 — Authorize SPEC-0001 Phase 4 with the exact tester-permission correction

- Date: 2026-08-19
- Status: accepted by Arthur for `SPEC-0001` Phase 4
- Decision: Phase 3 is Verified, published, and integrated in exact 38-path canonical-main commit `3fe3a5487389647b67216e9466121e00f1a73856`, parent `b8d8406ca6b51c3b83adb29fa20f20160c871c54`. Arthur approved Phase 4 — **Validated editor command transaction** — as **Authorized; Not started**, together with the narrow proof-feasibility correction in SPEC-0001 §10.7. That correction authorizes exactly 22 tracked technical paths: the original 12 Phase 4 product/fixture/action paths plus exactly 10 additive catalog/schema/runner/contract/recorder/validator/finalizer paths needed to register, run, record, independently validate, and close out authorization ID `phase-4/v1`. New Phase 4 schemas live under `scripts/fixtures/spec0001-browser/v4/`; accepted v2/v3 schemas and all older tester entries, meanings, modes, hashes, registered paths, source-restoration rules, network denial, cleanup, and production-exclusion behavior remain exact.
- Why: the current permanent tester recognizes only the already integrated Phase 1.5, Phase 2, and Phase 3 modes. The former §10.7 simultaneously required a new Phase 4 plan/registry/action module and prohibited the shared tester from registering, dispatching, recording, validating, or finalizing that new mode. The exact additive ceiling fixes this internal authorization contradiction without changing what Phase 4 does for the user.
- Consequence: this decision changes no product outcome and implements nothing. Phase 4 may begin only after this reviewed record is separately published and integrated into canonical `main`, in one new dedicated Plan-mode Spec Executor worktree from that exact publication SHA. The executor may change only §10.7's 22 technical paths plus ignored Phase 4 proof artifacts, must prove the unchanged older tester modes as well as strict `phase-4/v1`, and must stop after its Implementation Review Packet. It may not edit canonical control-plane files or stage, commit, merge, push, publish, deploy, call an external service, or begin Phase 5. Phases 5–7 remain **Unauthorized; Not started**.

### D-0023 — Accept the exact SPEC-0001 Phase 4 technical result without authorizing Phase 5

- Date: 2026-08-19
- Status: accepted by Arthur for the stopped SPEC-0001 Phase 4 implementation
- Decision: Arthur explicitly accepted the exact unpublished Phase 4 worktree after reviewing Play, atomic Undo/Redo, manual joint drag, and Creator/Back. The accepted result is the exact 22-path technical projection from base/HEAD `62f046adff7418d2e644365fc04bd5d6312dcca9`, bound by technical-manifest SHA-256 `d34d589373713ac7930984aeb3ef0640539316c00e1f510cf8d798aee931bf46` and browser-runner SHA-256 `353f4937972d30b1959f1c7aee3075f5ebafb308d04a778db69372969e7b906f`.
- Why: the implementation satisfies D-0022's validated transaction outcome and the separate D-0021 visible-review gate. Its proof records 12 successful receipts, 61 artifacts, 138 deterministic transaction assertions, inherited Stick/Drawing regressions, TypeScript, zero lint regression, 105 browser actions, 31 checkpoints, 2 screenshots, five protected groups, zero non-loopback traffic, and complete cleanup.
- Consequence at acceptance: Phase 4 was **Verified and accepted in its dedicated worktree; pending separate publication/integration**. The Control Plane Architect could propagate and close out the accepted bytes but could not change them; that acceptance alone did not authorize staging, commit, merge, push, publication, deployment, any external/provider operation, or Phase 5.
- Historical publication note: Arthur later explicitly authorized publication. The exact accepted 22 technical paths and eight reviewed canonical record paths were committed as `71841e96499f7627139c53d87114bba65e19d29d`, parent `62f046adff7418d2e644365fc04bd5d6312dcca9`, message `Implement SPEC-0001 Phase 4 command transaction`, then fast-forwarded and normally pushed to canonical `main`. The Phase 4 branch, local `main`, local `origin/main`, and live GitHub `main` matched cleanly at `0/0`. At that publication point, Phase 4 was **Verified, published, and integrated** while Phases 5–7 remained **Unauthorized; Not started**; D-0024 later supersedes only Phase 5's authorization status.

### D-0024 — Authorize SPEC-0001 Phase 5 server raw-dispatch and deterministic mock boundary only

- Date: 2026-08-19
- Status: Accepted by Arthur.
- Decision: Arthur explicitly authorized SPEC-0001 Phase 5 only. Phase 4 remains **Verified, published, and integrated** in `71841e96499f7627139c53d87114bba65e19d29d`; at this decision's start, clean canonical `main`/`origin/main`/live GitHub `main` were synchronized at post-publication record commit `617aa61a81b9c16b781e6d333255fdd5b65fced2`. Phase 5 becomes **Authorized; Not started** with exactly section 10.8's provider-free server raw-dispatch, strict marked-request parsing, coarse availability, deterministic mock-envelope, Drawing fallthrough, no-egress, and proof boundary. This decision authorizes no writable Stick chat or UI, OpenAI/provider/search/Supabase/paid request, deployment, Phase 6, or Phase 7 work.
- Human review requirement: after the dedicated Phase 5 Spec Executor completes technical proof and stops, the Project Manager must give Arthur the exact unpublished Phase 5 app copy for one review before technical acceptance. Because Phase 5 intentionally adds no visible Stick UI, that review confirms that the existing app still looks and works the same; the hidden mock route is proved by the automated technical evidence, not by a new visible feature.
- Consequence at decision time: implementation could begin only after this reviewed activation record was separately published and integrated into canonical `main`; the executor had to remain inside section 10.8, return its Implementation Review Packet, and stop before control-plane propagation or publication. Phases 6 and 7 remained **Unauthorized; Not started**. This decision authorized no staging, commit, push, publication, external request, or deployment.
- Historical publication note: the exact seven-document activation was later published as canonical-main commit `245ac7e8bceeca76b522ff21c4327fa0219a3805`, message `Authorize SPEC-0001 Phase 5`. The fresh executor booted from that exact SHA and stopped before edits on the separately recorded D-0025 proof-feasibility blocker.

### D-0025 — Correct SPEC-0001 Phase 5 permanent-tester permission without changing the product phase

- Date: 2026-08-19
- Status: accepted control-plane correction; pending separate publication/integration
- Evidence: D-0024's exact seven-document activation is published in canonical-main commit `245ac7e8bceeca76b522ff21c4327fa0219a3805`. A fresh dedicated Phase 5 Spec Executor completed the required boot from that exact clean SHA and stopped before edits. Live tracing proved §10.8 requires registered `phase-5/v1` real-route proof and a Phase 5 proof bundle, while `tester-extension-authorizations.json` contains exactly four entries through `phase-4/v1`; the v4 schemas require exactly four; `browserTesterExtensionContract.ts`, `runSpec0001BrowserProof.ts`, `recordSpec0001ProofBundle.ts`, `validateSpec0001ProofBundle.ts`, and `finalizeSpec0001ProofBundle.ts` accept/derive/close only the earlier modes. The runner's current `/api/ai` behavior is intercepted Drawing proof and explicitly asserts zero real-route requests. The stopped executor changed nothing.
- Decision: preserve D-0024's exact Phase 5 product outcome and original 14 product/fixture/validator paths, and authorize exactly 10 additive shared tester paths: `scripts/fixtures/spec0001-browser/v2/tester-extension-authorizations.json`; four new v5 authorization/plan/registry/result schemas under `scripts/fixtures/spec0001-browser/v5/`; `scripts/runSpec0001BrowserProof.ts`; `scripts/spec0001-browser/browserTesterExtensionContract.ts`; `scripts/recordSpec0001ProofBundle.ts`; `scripts/validateSpec0001ProofBundle.ts`; and `scripts/finalizeSpec0001ProofBundle.ts`. The complete Phase 5 technical ceiling is therefore exactly 24 tracked paths. No other tester, runtime, fixture, proof, package, dependency, environment, application, or control-plane path is authorized for Phase 5 implementation.
- Route-only tester contract: append exactly one deferred `phase-5/v1` catalog entry after the byte/meaning-preserved first four. It binds the authorized v5 plan, uses the already-authorized `stick-ai-raw-route-cases.json` as its v5 registry, returns route-only v5 evidence, and has only `guarded-http` and `runner-environment` operation families. The permanent runner sends exact fixture bytes through guarded Node loopback HTTP to the real `/api/ai` route and records exact status/header/body/log/network/cleanup evidence for marked availability GET, marked raw Stick POST, and marker-free Drawing-fallthrough POST. Phase 5 has no action-adapter file, workspace port, in-page driver operation, pointer target, visible role/test ID, screenshot requirement, route/page/control/asset, browser-mocked route response, or writable Stick surface.
- Compatibility and closeout rule: the no-plan Phase 1.5 v1 mode and Phase 1.5 synthetic/Phase 2/Phase 3/Phase 4 v2-v4 meanings, entries, schemas, bindings, hashes where materialized, Git-state behavior, source restoration, egress denial, cleanup, and production exclusion remain exact. Phase 5 dirty mode requires exact base HEAD, empty index/no hidden flags, and an observed set equal to the canonical technical projection; clean mode requires a strict descendant and exact base-to-HEAD projection. The two existing contracts in the 24-path ceiling may be dirty only when a Phase 5 fixture proves a required strict-validation correction; all 22 other technical paths are mandatory. Closeout permits only that exact technical projection plus the eight established canonical record paths.
- Consequence: Phase 5 remains **Authorized; Not started**. The no-edit executor from base `245ac7e8bceeca76b522ff21c4327fa0219a3805` is superseded only as a stopped feasibility attempt. A replacement Phase 5 Spec Executor may begin only after this correction is separately reviewed, published, and integrated, from that correction-publication SHA, and may implement only corrected §10.8. Phases 6 and 7 remain **Unauthorized; Not started**. This correction changes no product outcome, raw-byte/parser rule, availability/mock behavior, Drawing fallthrough, no-editor/history/storage/UI rule, no-egress rule, or external/live prohibition; it authorizes no implementation in this task and no staging, commit, merge, push, publication, deployment, provider, OpenAI, search, Supabase, or paid request.

### D-0026 — Accept SPEC-0001 Phase 5 provider-free server/mock implementation

- Date: 2026-08-20
- Status: Accepted by Arthur; Verified, published, and integrated.
- Decision: Arthur reviewed the exact unpublished Phase 5 app copy, reported that everything looked normal, and explicitly approved Phase 5. The accepted implementation stays at exact base/HEAD `a2b4f3e0fc492df9cd63bda32554e382a344cdb6` with exactly 22 Git-visible technical paths from D-0025. It implements only §10.8's hidden first-operation raw Stick dispatch, strict captured-input rejection, safe coarse availability, deterministic provider-free mock, and original unread Drawing fallthrough. It adds no visible UI, workspace/editor/history/storage mutation, provider call, search, Supabase, paid request, or deployment.
- Proof and packaging correction: initial publication preflight exposed one extra terminal LF in each of four new v5 schemas, `stick-ai-availability-cases.json`, and `stickFigureAiMockServer.ts`. A stopped correction executor removed exactly those six bytes, changed no logic, left the other 16 technical and eight inherited record files byte-identical, and reran the complete isolated proof. The corrected 22-path technical projection has executor-reported aggregate `sha256:78e00dd35e1be1bc97ea2498abad6b09042216d57765ff6bbaec0a7e19e7d55c`; its 12-receipt/53-artifact manifest independently binds the corrected bytes at SHA-256 `f9024a5d86cc1febbac7df3d4219348cd8289d17723406bac5d90929d4cf5c0f`. Source-direct proof passed 362 assertions over 31 exact raw cases; registered guarded-loopback proof executed 31 real-route requests; all named Phase 1–4 and Drawing regressions, TypeScript, measured lint non-regression, diff, registration, EOF/UTF-8/whitespace, zero-egress, and cleanup gates passed. Browser/server/child/runner non-loopback attempts and provider/editor/history/storage calls were zero. Arthur's visible review is separate human evidence. A production build attempt was not a Phase 5 gate and did not pass: it stopped on the pre-existing untouched AI-cost dashboard `PageProps` type error.
- Consequence: Phase 5 is **Verified, published, and integrated** in exact 30-path commit `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`, parent `a2b4f3e0fc492df9cd63bda32554e382a344cdb6`, message `Implement SPEC-0001 Phase 5 raw Stick dispatch`. The Phase 5 branch, local `main`, local `origin/main`, and live GitHub `main` matched cleanly at `0/0` after a normal non-force push. Phases 6 and 7 remain **Unauthorized; Not started**. This publication does not authorize Phase 6, a real OpenAI/provider/search/Supabase/paid request, or deployment.

### D-0027 — Accept typo-friendly deterministic intent for SPEC-0001 Phase 6

- Date: 2026-08-20
- Status: Accepted by Arthur and the Project Manager; published at `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`. Historical activation status was **Approved; Authorized; Not started**. D-0028 supersedes the current Phase 6 lifecycle/presentation after Arthur's rejected first review.
- Decision: Phase 6 must not require the exact canonical sentence. It accepts only SPEC-0001 section 4.3's versioned closed V2 grammar: bounded meaning-equivalent phrasing, safely implied three poses and 12 FPS, grammatically singular one-figure wording, an audited unique typo map including `wwave`, `animaton`, and `onne`, and Arthur's exact `122 FPS` repeated-second-digit correction as the only accepted numeric typo. Every accepted form resolves to one canonical server-authoritative intent: one stick figure, one safe three-pose wave, 12 displayed frames at 12 FPS. Preview must plainly state that interpretation and that no change has been made before explicit Apply.
- Safety boundary: There is no general fuzzy matching. Exact accepted vocabulary wins first; only the fixed typo-map sources correct, with validated token-length distance limits, at most two corrected tokens, total distance at most two, and ambiguity rejection. Digit runs never enter letter correction. Explicit `13`, `24`, `30`, other FPS/counts/poses, multiple figures, different real nouns/actions such as clown/fish/jump/fight/walk, props, backgrounds, clauses, Unicode/confusables, excessive input, or unconsumed content reject before mock/provider work, preview, or mutation. Missing values default only after a complete supported singular-wave parse.
- Version/lifecycle boundary: Published Phase 5 `promptIntentVersion: 1` exact-sentence behavior, fixtures, proof, history, and exact publication `9bbcc1df2fe4c79c0947601d0ea6274a85732d85` remain immutable. Phase 6 may add request/manifest/envelope/intent V2 beside V1 in the exact 26-path technical ceiling recorded in §10.9, including the live-code-required shared contract/mock changes and additive `phase-6/v1` V6 tester registration. The real route/raw-reader/classifier/availability path stays read-only. Phase 7 later consumes the same canonical server intent and still requires its separate owner policy gate; raw user wording/correction metadata is never sent to the provider.
- Consequence at activation: Phase 6 alone became **Approved; Authorized; Not started** after separate publication. The activation changed no runtime, UI, test, fixture, script, package, dependency, configuration, environment, database, provider, or deployment state. Its later publication allowed one dedicated Plan-mode Phase 6 Spec Executor to start from `f46ed3b…`; D-0028 now records rejection/correction of that first unpublished result. Phase 7, an external lookup, OpenAI/search/Supabase, a paid request, and deployment remained unauthorized.

### D-0028 — Reject the first Phase 6 review copy and correct its visible outcome

- Date: 2026-08-21
- Status: Accepted directly by Arthur and accepted by the Project Manager as the corrected Phase 6 owner outcome; published in exact seven-document canonical-main commit `f19955c336be43b19b2c4cc13d16abcc7ded7247`, parent `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`, message `Record D-0028 Phase 6 correction`. D-0029 records the later accepted corrected implementation.
- Rejection: D-0027's seven-document activation was published at exact canonical-main commit `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`. Arthur then rejected the first unpublished Phase 6 implementation review copy. It showed timeline creation without the required visible built-in figure and changed the initial Stick AI panel away from the original presentation by exposing pre-action eligibility/guidance, a suggestion shortcut, and a visibly text-labeled Preview control. That separate worktree result is not accepted, Verified, published, or present on canonical `main`.
- Corrected visible result: before the user sends, retain the original bottom-right AI Animator helper/header style and source-authored `Generate frames • Clean drawings • Animate faster`, exact placeholder `Chat here`, and original white 28×28 circular checkmark send button. Show only transparent/unboxed muted text exactly `Ask the assistant for help with your stick figure.` Show no readiness/eligibility warning, suggestion chip, shortcut explanation, preview, Apply, or Cancel. The user acts first; sending requests the preview. Reasoning/Task controls are deferred and may remain absent.
- Apply/Cancel/onion result: the visible §10.5A starter remains one blank cell/empty canvas. Preview says exactly what the server understood and mutates nothing. Cancel remains an exact no-op and creates no figure. Apply uses the unchanged Phase 4 atomic transaction and must visibly render the real approved built-in figure through the existing editable `structureGraph` on Frames 1/5/9 and all held frames. Paused Onion on Frame 5 must visibly show the previous complete figure in exact purple `rgba(92, 63, 158, 0.58)` and the next complete figure in exact green `rgba(44, 122, 91, 0.56)`.
- Proof/boundary: real-browser acceptance must bind canonical/render-input digests to live SVG geometry and clipped-stage pixels, including zero pre-Apply/Cancel figure geometry, three distinct key poses, hold equality, exact onion sides/tints/neighbor geometry/color pixels, and Onion OFF cleanup. Exact-base/result evidence at `1440×900` and `1024×768` rejects any unrelated font/color/size/spacing/layout/panel dimension/button size/timeline/canvas shell/right-panel/workspace/navigation or fat-frame change. The existing 26-path Phase 6 authorization ceiling remains sufficient; its exact final dirty subset is bound. `StickFigureCanvas.tsx`, the Phase 3 onion resolver/tints, Phase 4 transaction semantics, Phase 5 V1/history/proof, Drawing, Creator, dependencies, config, environment, database, and Phase 7 policy remain unchanged.
- Consequence: this is a correction inside Phase 6, not a new phase. The first review copy returns to a separately authorized Spec Executor correction task only after this accepted record is separately published/integrated under the existing lifecycle. Phase 5 remains **Verified, published, and integrated** at `9bbcc1df2fe4c79c0947601d0ea6274a85732d85`; Phase 7 remains **Unauthorized; Not started**. This documentation closeout performs no runtime/test/fixture/script/proof/package/config/environment/database/external/Git publication action and does not inspect or modify the rejected executor worktree.

### D-0029 — Accept the corrected SPEC-0001 Phase 6 implementation and same-root Creator continuity

- Date: 2026-08-21
- Status: Accepted directly by Arthur after reviewing the corrected app; **Verified, published, and integrated** in exact 33-path canonical-main commit `caa6c2d946780f384d0a8c58f4ea75a771483bcd`, parent `f19955c336be43b19b2c4cc13d16abcc7ded7247`, message `Implement SPEC-0001 Phase 6 deterministic Stick chat`.
- Decision: Arthur accepted the corrected Phase 6 result in the exact stopped executor worktree at base/HEAD `f46ed3b13e6bca3a09c9b2926c972bea8c331f2c`. The original Stick AI presentation is preserved until the user sends: `Generate frames • Clean drawings • Animate faster`, placeholder `Chat here`, the original white circular checkmark sender, and idle copy `Ask the assistant for help with your stick figure.` The bounded V2 grammar produces one non-mutating preview; Cancel is a no-op; one explicit Apply installs the canonical one-figure, three-pose, 12-frame, 12-FPS wave as one atomic transaction. The complete 11-joint/10-limb figure, Frames 1/5/9, held frames, and exact purple/green onion neighbors must remain visibly projected into the current responsive stage.
- Creator continuity: Creator remains a separate screen, but Creator → Back returns to the same mounted Stick project/history/storage/selection/view root rather than creating a fresh workspace. The remounted stage observer must bind to the current canvas so a viewport change cannot clip still-present content. After Back, Undo removes the complete AI wave and Redo restores it; manual-edit history and Save/Open continue to work.
- Evidence: the accepted exact dirty subset is 25 paths inside D-0028's maximum 26-path ceiling; `WorkspaceAiPanelShell.tsx` is the intentionally unchanged 26th path. Technical-manifest SHA-256 is `c0d13c9234087855784ad805410667e9d583ac0f03dbe847257db778fea39297` (48,147 bytes), browser-runner SHA-256 is `b1be9c83951f027687e2b50fa7df702ffa09b2e8213a7c30b6c7b0e9fa6220bd`, and the framed 25-path aggregate is `3bf3290f09f72787fa28db4f1a96003ab5f13e846358361e5805812904078aa2` over 1,065,268 bytes. All 15 receipts and 88 artifacts validate; 338 matcher/UI assertions, 15 accepted visible cases, 36 guarded rejections, 13 visible rejections, exact geometry/pixel/onion checks, Creator → Back at `1440×900 → 1024×768`, atomic Undo/Redo, Save/Open, TypeScript, lint non-regression, protected Phase 1–5/Drawing behavior, zero non-loopback traffic, and cleanup pass. The final proof-only correction makes closeout use the manifest-bound 25-path subset while retaining the strict 26-path maximum ceiling.
- Root causes: the first corrected review's missing figure/onion came from drawing canonical `960×594` rig coordinates 1:1 into a smaller responsive SVG without a `viewBox`, clipping the figure. The later Creator → Back disappearance came from the stage `ResizeObserver` remaining attached to the pre-Creator detached canvas, so the remounted canvas kept stale dimensions after viewport change and clipped the still-present figure/history.
- Consequence: the corrected Phase 6 result is accepted, technically Verified, published, and integrated. Canonical `main`, local `origin/main`, live GitHub `main`, and the publication branch matched the exact commit cleanly at `0/0`. Phase 7 and its Policy Gate remain **Unauthorized; Not started**. Arthur and the Project Manager must separately discuss and explicitly accept the deferred model, cost, retention, and optional paid-proof decisions before any Phase 7 implementation; no OpenAI/provider/search/Supabase/paid request or deployment occurred.

### D-0030 — Approve SPEC-0003 Tutorials and Cleaner Home Screen and authorize its one implementation

- Date: 2026-08-25
- Status: Accepted directly by Arthur; SPEC-0003 is **Approved and active** and its one implementation is **Authorized; Not started**. This activation record is not yet published or integrated.
- Decision: implement exactly one polished full-screen Tutorials page opened from the existing Home Tutorials card. The Home header is absent inside Tutorials. One Back control returns to Home and restores focus to the Tutorials card. The only `h1` is exactly `Welcome to Diamond Animator`. One large dominant blue-outlined static `Start Here` placeholder appears above exactly three smaller static placeholders in this order: `Create Your First Animation`, `Create with AI`, and `Finalize Your Animation`. All four show exactly `COMING LATER` and are non-interactive. Remove the inert Home `AI Credits` card.
- Boundaries: no Quick Help, Jump In, workspace selector, real tutorial media/player/delivery, unrelated font/Home/New/Open/Drawing/Stick/Creator/timeline/AI-panel/menu/notification/Dashboard behavior, provider/service/deployment work, or change to SPEC-0001/SPEC-0002. The implementation ceiling is the exact ten runtime/style/fixture/proof paths in SPEC-0003. The permanent SPEC-0001 tester remains byte-identical.
- Consequence: one new dedicated Plan-mode Spec Executor may begin only after this approval/activation is separately reviewed, published, and integrated. Its exact base will be that future activation-publication SHA, not the current proposal basis. The executor implements and proves the one authorized SPEC-0003 result, leaves the exact unpublished app available for Arthur's review, returns its packet, and stops. This control-plane task authorizes no implementation, staging, commit, push, deployment, external request, or later product work.

## Provisional Legacy Classifications

### D-0006 — Preserve the V1 motion-tween specification for reconciliation

- Date: 2026-08-09
- Status: provisionally promoted legacy intent; Arthur confirmation and current acceptance rerun pending
- Decision: `diamond-animator-docs/02_animation_engine/MOTION_TWEEN_SYSTEM.md` remains the best detailed legacy description of intended V1 drawing motion-tween behavior and must be read before related work. This audit does not retroactively claim owner approval, and the latest user instruction or an accepted superseding decision prevails.
- Why: it is the only existing subsystem document with detailed scope, data model, debug path, and acceptance suite.
- Consequence: motion-tween tasks must read it, rerun/reconcile its acceptance flow, and record any code/spec mismatch before changing either. A mismatch is evidence to resolve, not automatic proof that live code or the document wins.

## Pending Product Decisions

### P-0001 — Launch role of the Drawing Workspace

- Status: pending Arthur
- Question: equal launch pillar, supporting renderer/tooling surface, or later phase?
- Needed before: committing to launch scope or large drawing-only feature work.

### P-0002 — Official product name

- Status: pending Arthur
- Question: “Diamond Animator” or “Diamond Animator Pro”?
- Needed before: brand/UI/documentation normalization.

### P-0003 — Definition of professional-grade

- Status: pending product spec
- Question: which measurable gates cover visual clarity, motion continuity, timing, editability, fidelity, export, latency, and failure rate?
- Needed before: accepting AI or manual animation milestones.

### P-0004 — AI transaction semantics

- Status: pending product/architecture spec
- Question: which commands preview, auto-apply, request confirmation, or require reversible transactions?
- Needed before: enabling broad Other/actions or stick-workspace AI control.
- Narrow SPEC-0001 resolution: D-0009 accepts Preview → explicit Apply and one atomic reversible transaction for the single approved Stick action only; the product-wide question remains pending.

### P-0005 — Cost and latency policy

- Status: pending Arthur/product economics
- Question: target cost, latency, token, retry, search, and model-escalation ceilings; mapping to credits.
- Needed before: production AI defaults and paid regression gates.
- SPEC-0001 status: OD-12 is explicitly deferred to the separate Phase 7 Policy Gate; D-0009 accepts no model, price, token, latency, or paid-request value.

### P-0006 — First usable manual stick feature set

- Status: pending product spec
- Question: minimum creator, rig, pose, timeline, tween, history, library, persistence, and export controls for a usable release.
- Needed before: Phase 2 implementation.

### P-0007 — Data/search/privacy policy

- Status: pending product/legal/security decision
- Question: what workspace/project data can be sent to model/search providers, retained remotely, and logged locally?
- Needed before: public deployment.
- Narrow SPEC-0001 resolution: D-0009 accepts session-only transcript, minimized provider projection, search/tools off, and zero application-persistent Stick AI logs for this slice; provider retention and product-wide policy remain pending through OD-13/P-0007.

### P-0008 — AI-first stick vertical-slice sequencing

- Status: pending Arthur/product architecture
- Question: what minimum shared stick state model, reversible executor, persistence, and human corrective controls must exist before the first AI-led stick-animation slice, and which broader manual-editor controls can follow it?
- Needed before: committing Phase 2/Phase 3 implementation order.
- Narrow SPEC-0001 resolution: D-0009 accepts the seven-phase sequence, shared manual/AI mutation authority, bounded human safety floor, and separate browser-harness prerequisite for this slice; broader release sequencing remains pending.
