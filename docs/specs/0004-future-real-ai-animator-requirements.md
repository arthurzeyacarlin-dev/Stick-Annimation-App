# SPEC-0004 — One-Time Stick Figure AI Animator

Status: **Phases 1 and 2 are Verified, published, and integrated. Phase 2.5 is accepted and technically Verified as the timing/spacing primitive only; its seven paths are uncommitted and pending separate publication/integration. Phase 2.6 is decision-complete and Approved/Authorized/Not started under D-0041, entry-gated on GIT-037 publication/integration.** Phases 3–8 remain unauthorized. No Phase 2.7 exists.

Owner: Arthur
Spec role: Spec Architect
Created: 2026-08-31
Last updated: 2026-09-02
Decision links: [D-0033 through D-0041](../DECISIONS.md)
Control-plane anchors: Phase 1 publication commit `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d`; Phase 2 activation commit and accepted executor base `70bf7b0799bcff8d703525bcb50c378b8a122ebf`; Phase 2.5 accepted base/HEAD `f131e75aafccec0d1b8ecb717e2d95b518355d39`; reviewed Phase 2.6 source SHA-256 before lifecycle reconciliation `dc7f968b0aab4a44bd3f70557a1b0e708a974cd2dd1c9050775ec56cfed83e56`
Related work: [`TODO SPEC-004`](../TODO.md), [`Current State`](../CURRENT_STATE.md), [`Session Handoff`](../SESSION_HANDOFF.md)

> **Lifecycle boundary.** D-0035 authorized **only Phase 1**; D-0036 accepted it, and exact 28-path commit `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d` published/integrated it. D-0037 authorized **only Phase 2**; GIT-034 published that activation at `70bf7b0799bcff8d703525bcb50c378b8a122ebf`; D-0039 accepted the exact eight-path result; and GIT-035 published/integrated it in exact 20-path commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. GIT-036 published the reconciled Phase 2.5 activation at `a755f892d7737c6a10d9c381ec59c1e2fdba4d47`. No Phase 2.5 app code, provider/API/key use, paid request, deployment, Phase 3 work, or work in another worktree was included.
> **Phase 2.5 evidence boundary.** D-0040 authorized **Phase 2.5 — Action Timing and Spacing Engine** and its seven-path executor ran from clean canonical `f131e75aafccec0d1b8ecb717e2d95b518355d39`. The formulas, strict `stick.action-timing/v1` binding, six profiles, independent-frame baking, and technical proof passed. Arthur rejected the human review samples as unnatural because their action plans, key poses, frame allocations, contacts, and weight mechanics were wrong. D-0041 accepts and closes Phase 2.5 narrowly as the timing/spacing primitive it actually proves; its old fixture poses and review samples remain rejected as natural-action evidence. The exact seven accepted paths remain uncommitted and unpublished until GIT-037.
> **Phase 2.6 authorization boundary.** D-0041 makes **Phase 2.6 — Natural Action Planning, Weight, and Intent Guard** decision-complete and Approved/Authorized/Not started. A Phase 2.6 executor must not begin until this combined Phase 2.5 acceptance and Phase 2.6 amendment are reviewed, published, and integrated through GIT-037 in canonical `main`. Phase 2.6 is the final planned shared-motion-foundation correction; there is no Phase 2.7. It connects neither normal chat nor Pretend AI nor Terra and makes no provider/API/paid request.

> **Historical boundary.** SPEC-0001 Phases 1–6, including the accepted deterministic single-stick-figure wave, are completed history and remain unchanged. Old SPEC-0001 Phase 7 is retired under D-0033: it has zero implementation authority. This specification replaces it; it does not revive, import, or approve its old provider policy, costs, commands, proof mechanics, or gates.

## 1. Plain-language outcome

SPEC-0004 is for the **Stick Figure Workspace only**. It will eventually let a person ask for one new stick animation on an eligible fresh Stick project, examine a temporary preview, and either Apply or Cancel it. Applying creates the complete animation as one undoable human-editable change. The person can then use the normal manual tools, Save/Open, Undo, and Redo. The AI does not edit, recolor, or refine that accepted animation later; that is future **SPEC-0005** work.

Arthur's long-term product test is: an AI-assisted animation should be faster and better than his roughly week-long manual process, with a usable result finished in one day or less. This is a product-quality target, not a compilation claim. The release evidence must record a rapid first editable preview, readable smooth motion without broken bodies, a representative prompt set, and Arthur's final side-by-side quality acceptance. No phase may claim a professional result, a one-day result, or a “better than Arthur” result merely because code or a mechanical validator passes.

### Before SPEC-0004 / after SPEC-0004

| Before SPEC-0004 — current verified baseline | After SPEC-0004 — intended result, only after all phases and release gates pass |
| --- | --- |
| The Stick chat can only make the existing deterministic three-pose wave on the exact fresh starter when a hidden development server setting allows its mock path. | A fresh eligible Stick project can receive one complete new animation through a hidden safe route: a $0 local recipe when it fully and confidently matches, otherwise the intended Terra original-creation path only when separately enabled and authorized. |
| The current plan is fixed at one figure, one layer, 12 frames, 12 FPS, and one wave. | The complete product supports the agreed one-layer Stick scene model, multiple figures, bounded variable FPS and duration, editable poses/frames/timing, and original scenes within the later-approved final cap. |
| Preview, Apply, Cancel, one history action, derived line head, manual editing, and local Save/Open already exist for the bounded wave. | Those protections remain: preview never mutates; Cancel and every failure are no-ops; Apply is one undoable creation; Redo restores the accepted bytes; all generated supported content remains manual-editable. |
| There is no final Stick Task/Reasoning product contract, and current hidden server `off`/`mock`/`live` ideas are not user controls. | Stick offers only **Task: Generate Frames**. A visible Reasoning selector may be selected but has no functional effect in this spec. There is no user-visible Mode selector. |

## 2. Current behavior and live-code evidence

This architect pass re-read the control plane, the full SPEC-0001 history, `AI_SYSTEM.md`, `architecture.md`, `testing_workflow.md`, and the live paths below at the recorded basis. They establish current behavior; they do not authorize future behavior.

| Current path | Direct current fact | SPEC-0004 consequence |
| --- | --- | --- |
| `src/components/workspace/stickfigure/StickFigureAiPanel.tsx` | The right panel accepts only a narrow wave prompt, performs local V2 wave matching, asks `/api/ai`, and exposes Preview / Apply / Cancel. It says an ineligible project can still use manual timeline controls. | Preserve the safe transaction affordance, but replace the one-wave-only product contract through later phases. Do not borrow Drawing UI behavior. |
| `src/lib/ai/stickFigureAiContract.ts`, `stickFigureAiMockServer.ts`, `stickFigureCommandExecutor.ts` | The V1/V2 capability is `stick.pose-sequence.create/v1`: one rig/figure/layer, three poses, 12 frames, 12 FPS. The executor builds an isolated candidate and commits it to canonical history only on Apply. | Phase 1 replaces the fixed wave payload with a strict general plan/executor while retaining isolated candidate, stale/idempotency, cancellation, and atomic history safety. |
| `src/lib/stickfigure/stickProjectContract.ts` | The document validator currently requires exactly one layer and derives the head as a horizontal line from the stored `head` joint. | One layer and the derived horizontal line head remain hard boundaries. No stored circle/custom head, background, prop, camera, or layer tool is introduced. |
| `src/lib/stickfigure/stickTimeline.ts`, `stickProjectHistory.ts` | An editable `hold` resolves to its owner keyframe; replacing content while a held frame is selected replaces that owner content. Distinct keyframes own distinct editable content/state IDs. | Phase 2 must bake every generated slot as its own complete keyframe. It may not use a hold/tween owner span for generated in-betweens or visually repeated frames. |
| `src/lib/stickfigure/stickProjectHistory.ts`, `src/lib/stickProjectStorage.ts` | The visible fresh starter and local history/storage are explicit. Current first-wave eligibility is document/history based; Save/Open and Undo/Redo are available. | Phase 1 adds a durable one-time-creation latch that survives Save/Open and does not become undoable, while the animation document itself stays one atomic undoable action. |
| `src/components/workspace/stickfigure/StickFigureWorkspace.tsx`, `stickFigureAiWorkspaceAdapter.ts` | The adapter captures project/revision/digest/workspace binding and rejects stale or playing state; normal human Play/Pause remains workspace-owned. | AI work must not toggle unrelated human view state. Temporary creation preview may render/play only inside its own check flow before Apply. Human onion skin remains unchanged and AI onion control is out of scope. |
| `src/lib/ai/stickFigureAiAvailability.ts` | `DIAMOND_STICK_AI_V1_MODE` is a hidden server/development availability idea (`off`, `mock`, `live`), never a user chooser. | It is not a product Mode and must not be exposed. Future free-versus-Terra routing is internal and policy-gated. |
| `src/components/workspace/ai/*` and Drawing AI paths | Drawing has its own Task and Reasoning UI and provider behavior. | Drawing is expressly out of scope. Its UI, model settings, routing, storage, and behavior must not be copied or changed by this spec. |
| Drawing `motionTween` fields and the legacy motion-tween reference | Drawing tweening persists a position-only owner/span controller in project data. | This is reference evidence only and is deliberately not reused for Phase 2. Interpolation may exist only during candidate formation; the accepted Stick result is independent ordinary frames. |

The currently published Phase 6 wave, including its approved typo behavior, is a protected regression. It remains usable as the baseline deterministic result until a later accepted phase deliberately replaces its internal implementation without changing its accepted visible/manual safety guarantees.

### 2.1 Phase 2.5 read-only root-cause evidence

The stopped Phase 2.5 executor worktree was inspected read-only; no byte there was changed. Its proof manifest records a passing strict timing engine, exact profile math, independent ordinary keyframes, and zero provider/API traffic. The visible samples were nevertheless rejected. The completed RCA establishes:

1. The detailed jump waved before jumping because its `stand` and `recovered_stand` poses copied the wave fixture's raised right hand, then lowered that hand in the crouch and lifted both arms again at launch.
2. The jump floated because its named launch pose was already airborne, its air time was about `0.92s`, and several baked frames remained close to the apex.
3. The bow compressed each half into about `0.33s` and supplied no readable bottom settling beat.
4. The dodge reached one extreme frame and reversed at maximum speed while both feet slid.
5. Phase 2.5's formulas worked as specified. Timing curves cannot invent action knowledge, support/contact, weight, balance, anticipation, landing mechanics, or intent purity when the supplied poses and allocations omit them.

Phase 2.6 owns this missing foundation in one bounded shared contract. The rejected samples are evidence, not accepted product behavior and not a reason to rewrite or falsely publish the Phase 2.5 candidate.

**Recorded documentation conflict.** `architecture.md` and `AI_SYSTEM.md` still describe the Stick AI panel as read-only/no writable executor. The freshly traced Phase 6 source above shows the narrower writable deterministic wave preview/apply path. This specification uses the live-code fact for current behavior and preserves both files as broader historical maps in this docs-only transition; a later accepted control-plane closeout should reconcile their stale wording without treating it as a product change.

## 3. Final product contract

### 3.1 One-time creation and editability

1. A creation may begin only for an **eligible fresh Stick project**: the canonical fresh one-layer white Stick starter, no manual/project history mutation, no prior successful AI creation latch, and a stable current project/revision/digest/workspace binding.
2. Before the first successful Apply, Cancel, refusal, timeout, invalid output, stale state, over-budget result, or any failed local/provider operation leaves project document, history, storage, and one-time latch unchanged. Another valid attempt is allowed.
3. Preview is an isolated temporary candidate; it never mutates canonical project bytes, history, local saved record, or human Play/Pause/onion state.
4. Apply is the only commit point. It commits the whole completed creation as exactly one document/history action. Undo returns to the exact pre-Apply document; Redo returns the exact accepted document bytes. The one-time latch remains consumed even if the person later Undo/Redos, so Undo cannot reopen AI creation.
5. The consumed latch is persistently bound to the project ID and saved/reopened with the Stick project. It is changed only by a successful Apply, never by preview/cancel/failure, manual edits, Undo/Redo, or a request payload. It must be validated rather than trusted from a model/provider response.
6. After Apply, every later Stick AI message receives the short honest result **“AI editing comes later; use manual tools.”** It makes no project/history/storage mutation and no local recipe, fake-provider, Terra, or other provider call. Follow-up editing, recoloring, refinement, continuation, or recreation is reserved for SPEC-0005.
7. Every supported generated frame, key pose, figure, all 11 humanoid joint positions, timing choice, and supported content is represented in the same editable Stick project model used by manual tools. There is no locked AI-only format and no raw executable code.

### 3.2 Scene, timing, and visual boundaries

- The background is white only. No background generation, background layer, background change, prop, camera, or background tool is in scope.
- The project retains one existing animation layer only. Multiple figures may later coexist in that same layer; adding/removing layers belongs to later work and is prohibited here.
- The head stays the current derived horizontal line from the `head` joint. Do not store a circle, custom head, or head asset.
- The creation may select/change FPS or obey an explicit user FPS. When omitted, the recommended default is **one centered figure, 24 FPS, normal speed, and a recipe-specific safe duration**.
- Arthur's examples include smooth original animations around five seconds and an uncertain “not more than 100 frames.” Five seconds at 24 FPS is 120 frames, so this spec deliberately does not pretend those statements are compatible. Phase 3 has the owner entry gate that selects the final maximum duration and frame count together.
- Higher FPS alone does not make animation smooth. Smoothness requires action-appropriate important poses, support/contact and weight mechanics, intent-pure beats, meaningful intermediate poses, intentional timing/spacing/easing/arcs, and visible playback review. Phase 2 supplies the local baked-motion foundation; Phase 2.5 supplies bounded timing profiles; Phase 2.6 supplies the final shared action-planning, weight, and intent-purity guard before later routing/provider phases.
- Existing human Play/Pause controls remain. A pre-Apply creation pipeline may render/play its own temporary preview for checks, but Pretend AI and Terra must not alter unrelated user view state. Human onion skin remains as-is; AI onion-skin control is out of scope.

### 3.3 Internal routing: Pretend AI first, Terra only under a later gate

**Pretend AI** is a free local, versioned, parameterized recipe system. It is not RAG and must not claim that hardcoded rules think or understand language as a human does.

1. It first checks whether the complete request is a high-confidence safe match to one supported recipe. It may generate the entire result locally for $0 only on that complete match.
2. It accepts broadly tested ordinary wording for its bounded catalog: omitted optional details; known common synonyms; listed ordinary misspellings; abbreviations/slang/filler such as `u`, `pls`, and `idk`; case/punctuation/spacing variation; and wording such as “make him jump.” It must recognize negation and ambiguity: “don’t wave” must not create a wave.
3. It must reject rather than guess when the request is ambiguous, has competing actions, exceeds a safe input bound, includes unsupported/unsafe parameters, or lacks a complete safe match. A finite local matcher must never claim to understand every sentence a human could understand.
4. If no safe full match exists, it may hand the untouched request to Terra **only** if the real path is enabled and all later budget and explicit live-request authorization gates permit it. Otherwise it returns an honest unavailable/needs-real-AI result. A failed local attempt never silently spends money, and it never produces a partial result.
5. The Phase 4 initial catalog is versioned and expandable rather than hundreds of finished animations: **wave, jump, walk, run, punch, kick, turn, crouch, nod**. Each family accepts only its explicitly validated applicable count/direction/speed/FPS/duration parameters. If one-layer or multi-figure limits make a requested parameter unsafe, reject or defer it; do not invent support.

**Terra original creation** is for safe original animations that are not stored recipes. The intended model is GPT-5.6 Terra; this is a product intent, not present provider configuration or authorization. A later paid-provider gate must recheck the exact current official alias, pricing, retention, privacy, budget, and request authorization from official OpenAI sources on the same day. SPEC-0004 neither authorizes that lookup now nor authorizes any paid proof/request now. It must never auto-switch to Luna or Sol.

Terra receives compact, safe project context and returns strict structured plan/tool data for the same local plan/execution engine, never raw executable code or a second locked animation format. It plans important poses and timing. Local validation and the motion engine create safe in-betweens. A later quality step can render selected frames/playback, run mechanical and visual checks, and allow at most one bounded Terra visual-repair round before the first Apply. That repair is one creation transaction, not post-Apply editing. Refusal, timeout, malformed/invalid plan, stale project, over-budget result, or any failed repair is a project/history/storage no-op.

The representative original scene includes two stick figures, one left and one right, with a described fight/punch sequence: readable, non-stiff, within the final approved timing/frame cap, white background, one layer, and fully manual-editable after Apply.

### 3.4 Stick task and reasoning UI

- **Generate Frames** is the only functioning Stick task in this specification.
- **Generate Plans**, **Generate Sounds**, and **Other** remain absent or clearly unavailable. AI-generated sound is out of scope.
- A Reasoning selector may visually select **Low / Medium / High / Extra High** in Phase 5. In SPEC-0004 it is a visible placeholder only: it must not change routing, Terra request settings, quality, cost, retries, or output, and the UI must not say or imply that it changes thinking. Functional reasoning needs a later spec.
- There is no user-visible `off`/`mock`/`live` or other Mode chooser. Free-versus-Terra routing is hidden internal policy.

## 4. Evidence for the product claim

The following is the complete release-evidence shape; it does not declare the claim already proven.

| Evidence item | Required record and pass condition | What it does not prove alone |
| --- | --- | --- |
| Rapid editable first preview | Record start-to-preview-ready elapsed time for each representative successful run, including which route ran and whether it was $0/local or Terra. The preview must be fully manual-editable candidate content, not a video/locked artifact. Arthur confirms the reviewed time target and test environment at the Phase 7 entry gate. | A single fast fixture, a build, or high FPS does not prove a usable one-day workflow. |
| Readable, unbroken animation | Preserve all 11 joints/required segments, bounds, one-layer topology, timing/frame limits, and body/pose rules; visibly review selected frames and playback for readable action, meaningful in-betweens, and no broken body. | Mechanical checks alone do not prove aesthetic quality or “professional” motion. |
| Representative prompt set | Execute and retain outcomes for the Phase 4 recipe matrix and the Phase 7 original-scene matrix, including success, safe rejection, free/local decision, needs-Terra decision, and no-op failures. | Finite fixtures do not prove universal natural-language understanding. |
| Arthur comparison | Arthur reviews side-by-side the same described outcome against his normal manual workflow, records first-preview time and final accepted time, and explicitly accepts or rejects speed and quality. The claim may be made only after his acceptance. | Automation cannot self-certify “faster and better than Arthur.” |

The minimum product-review prompt set contains these named rows: `make one stick figure wave`; `pls make him jump`; `u make a guy walk left`; `make one stick figure run right`; `make her punch`; `make him kick`; `make one stick figure turn`; `idk make him crouch pls`; `make him nod`; “don’t wave” (safe non-wave result); `make him wave then jump` (safe ambiguity/multi-action result); one byte-limit-exceeding input; one unsupported original request that becomes needs-real-AI/unavailable while real is disabled; and the two-figure left/right fight/punch original scene. Phase 4 makes the exact local accepted/rejected fixture rows, including applicable parameter variation and the existing wave typo cases. Phase 7 records the precise original-scene review variants and uses Arthur's entry-gate test target rather than inventing a final latency SLA here.

## 5. Execution path and data/state impact

### 5.1 Intended end-to-end path

1. The person is in the Stick Figure Workspace with an eligible fresh project. The UI captures a fresh workspace/project/revision/digest binding and verifies the durable creation latch is unconsumed. If not eligible or already consumed, it returns the appropriate no-op manual-tools result before routing.
2. The user chooses Generate Frames and submits a request. The visible Reasoning selection, if present, is recorded only as a local inert UI selection; it is not passed into routing or a model setting.
3. The local matcher reads a bounded input. A complete high-confidence recipe becomes a versioned parameterized safe plan and is marked $0. An unsafe/no-match request becomes `needs_real_ai`; it reaches Terra only through the later server-only enabled/budget/explicit-live-authorization gate.
4. Terra, when separately authorized in a later phase, returns only strict plan/tool data. The browser never receives an API key; no raw model code is evaluated. The local contract validator binds the returned plan to the captured project state before execution.
5. The plan executor materializes an isolated candidate using the same project mutation primitives as manual tools. It validates topology, exact requested figure/layer boundaries, 11-joint poses, coordinate/bounds/body/timing rules, final caps, and no hidden project/view mutation.
6. The motion engine adds validated in-betweens. The quality pipeline may render/play the temporary candidate, run checks, and perform at most one bounded pre-Apply Terra visual repair. It must retain the original binding and never change human Play/Pause/onion state.
7. Preview presents the candidate and summary without publication. Cancel discards it. Apply rechecks the binding, commits exactly one history action plus the durable consumed latch, then allows all normal human editing/Save/Open/Undo/Redo.
8. Any subsequent AI submission for that project returns “AI editing comes later; use manual tools.” with zero local/provider route execution and zero mutation.

### 5.2 State and storage invariants

| State | Rule |
| --- | --- |
| Canonical Stick document | Is unchanged until Apply. Generated content uses existing editable figures/rigs/layer cells/poses/joint points/timing representation; it cannot be a hidden AI artifact. |
| Temporary candidate | Is memory-only/isolated, content-addressed to its captured base, and discarded on Cancel, failure, project switch, stale document, or Apply completion. It is never saved or added to Undo before Apply. |
| History | One successful Apply produces exactly one history/document publication. Undo/Redo exactly traverse the document bytes of that publication. Manual edits remain normal independent history actions. |
| One-time creation latch | Project-bound persistent metadata: initially unconsumed only on the true fresh starter; atomically consumed with successful Apply; preserved by Save/Open and not reverted by Undo/Redo. It blocks all later AI creation/edit calls. Storage adds a versioned record-level latch without putting AI-only content into the editable document. Existing V1 saved records remain loadable but default to consumed/not-eligible because they cannot prove a newly created fresh starter; they are never silently upgraded until a normal explicit Save writes the new record form. |
| View state | Normal human Play/Pause and onion-skin state stay user-owned. The creation pipeline cannot toggle them. |
| Provider/route state | No request occurs for a consumed project, unsupported local request with real disabled, cancellation before route entry, or any failed safe preflight. Phase 6 is the earliest server-only Terra route work, and a separately authorized paid call is later still. |

## 6. Scope and non-goals

### In scope across the eight phases

- one-time Stick-only creation with Preview / Apply / Cancel and durable no-later-AI lock;
- strict general plan/execution, then editable smooth motion, then larger one-layer scenes;
- free local recipes and bounded natural wording; a fake end-to-end path before any live provider;
- server-only intended Terra original creation after its policy/official-information/live-authorization gate;
- temporary rendering/checking/one pre-Apply repair; and
- private development/owner cost, privacy, abuse, and release controls.

### Explicit non-goals

- Drawing Workspace or Drawing AI changes; multi-workspace behavior;
- AI editing/recoloring/refining/continuing after Apply (SPEC-0005);
- background, background generation/change/layer, props, camera, non-white background, or a stored/circle/custom head;
- adding/removing animation layers; no layer-management UI;
- AI-generated sound; Generate Plans, Generate Sounds, Other, or a functional reasoning control;
- user-visible `off`/`mock`/`live` Mode; model auto-switching; Luna/Sol routing;
- RAG, web search, arbitrary tools, arbitrary code evaluation, provider tools beyond exact app functions, or a separate locked format;
- changing normal human Play/Pause/onion-skin behavior, unrelated workspace UI, packages, deployment, or Home AI Credits card; and
- claiming the existing private dashboard already accurately tracks Stick/Terra. That claim is a Phase 8 deliverable only.

## 7. Protected regressions

Every phase must retain or reprove the following before it advances:

1. SPEC-0001 Phases 1–6 history and visible Phase 6 deterministic wave/approved typo behavior.
2. Preview never changes canonical project/history/storage; Cancel and all failure types are no-ops.
3. Apply remains atomic and one undoable action; Undo/Redo and Save/Open preserve exact accepted data; manual joint editing remains available.
4. Stale document, project switch, idempotency/concurrency conflict, invalid plan, refusal, timeout, and failed publication do not mutate the project.
5. One layer, white background, derived line head, and no background/camera/prop/layer management remain true.
6. Human Play/Pause and onion skin remain unchanged by AI work; existing Stick manual tools/Creator navigation and all Drawing behavior remain protected.
7. No user-visible Mode; no provider/payment/network call unless the exact later phase and explicit owner authorization permit it; no automatic Luna/Sol fallback.
8. The private development/owner dashboard stays private; the removed Home AI Credits card remains absent.

## 8. Delivery plan — eight numbered phases plus final interstitial Phases 2.5 and 2.6

Each phase is sequential. A later phase cannot start merely because Phase 1 is approved; it needs the lifecycle authorization described above.

### Phase 1 — Safe One-Time Animation Builder

**Purpose.** Replace the one-wave-only giant command with a strict general single-figure, one-layer creation plan and executor. This is the narrow implementation-ready proof for the future system—not the full final product.

**Exact Phase 1 plan language.** A new versioned, strict plan contains only these ordered capabilities:

1. `set_timing`: exactly once, first; `fps` is either 12 or 24 and `totalFrameCount` is an integer from 8 through 24.
2. `create_key_pose`: creates an **independent** complete pose at one exact unique frame index within the total frame count. It names the one existing layer/rig/figure and supplies exactly the built-in 11 joint positions (`head`, `neck`, `hip`, left/right elbow/hand/knee/foot), all safe integers inside the existing stage. It may not copy/reference another pose or omit/add joints.
3. `hold_pose`: holds a named owner pose through an explicit contiguous bounded frame range. It cannot overwrite a distinct key pose, leave a gap, or point outside the configured frame count.
4. `finish`: exactly once, last; validates that the complete bounded timeline resolves safely and that no unrecognized command/field/action name can influence execution.

The Phase 1 proof ceiling is intentionally smaller than the eventual product: 8–24 total frames at 12 or 24 FPS (at most two seconds at 12 FPS or one second at 24 FPS), one figure, one layer, white stage. It is **not** the Phase 3 product duration/frame ceiling and says nothing about Arthur's approximately five-second examples.

**Fixture source and executor rule.** Phase 1 uses fixed checked-in fake plan fixtures, not natural-language understanding, a free matcher, Task/Reasoning UI, a server route, Terra, or a paid request. The executor may branch on the four command types and validation failures only. It must materialize fixture plans for **wave, jump, bow, and dodge** from the same general plan language without an action-name branch in the executor.

**Required implementation boundary.** The later executor may modify only the Phase 1 allowlist after re-reading live code and must stop for a spec correction if another path is necessary:

```text
src/lib/ai/stickFigureAiContract.ts
src/lib/ai/stickFigureCommandExecutor.ts
src/lib/ai/stickFigureAiWorkspaceAdapter.ts
src/lib/ai/stickFigureAiMockServer.ts
src/lib/stickfigure/stickProjectContract.ts
src/lib/stickfigure/stickProjectHistory.ts
src/lib/stickProjectStorage.ts
src/components/workspace/stickfigure/StickFigureAiPanel.tsx
src/components/workspace/stickfigure/StickFigureWorkspace.tsx
scripts/validateStickFigureAiContracts.ts
scripts/validateStickFigureCommandTransaction.ts
scripts/validateStickHistoryPersistence.ts
scripts/validateStickFigureAiUiAdapter.ts
scripts/fixtures/stick-ai/v3/**
scripts/fixtures/spec0004-stick/v1/**
scripts/spec0004-stick/phase1BrowserProof.ts
scripts/spec0004-stick/recordPhase1Proof.ts
scripts/spec0004-stick/validatePhase1Proof.ts
```

The new SPEC-0004-only proof paths and `v3` contract fixtures are not a revival of old SPEC-0001 Phase 7. If the existing tester infrastructure cannot safely accept an independent SPEC-0004 registration within this allowlist, stop rather than modifying an unrelated test harness. No `app/api/ai/route.ts`, availability setting, provider client, Drawing path, package/config/env file, or dashboard is authorized in Phase 1.

**Authorization/entry gate.** D-0035 authorizes Phase 1 only. Before modifying a byte, its one dedicated Spec Executor starts in Plan mode and re-verifies the current clean canonical-main SHA, empty index, exclusive worktree ownership, unchanged retired old Phase 7, and every Phase 1 allowed path. It uses fixed fixtures only and makes no network/provider request.

**Visible review outcome.** On a fresh starter, a fixture-driven real UI flow produces a temporary preview for each named fixture through the real Preview / Apply / Cancel transaction. It does not ship a test-only action picker or interpret arbitrary user language. The normal panel must not claim broad Generate Frames support yet.

**Technical proof.** Exact fixture and browser/unit evidence proves:

- all four fixture plans validate and materialize through one action-name-independent executor;
- exact command rejection: unknown/missing/reordered command, duplicate timing/finish, missing/extra/aliased joint, out-of-bounds/non-integer point, duplicate/out-of-range pose index, overlap/gap/invalid hold, frame/FPS oversize, wrong layer/rig/figure, non-fresh state, and digest/revision mismatch;
- preview/cancel/failure are document/history/storage/latch no-ops; stale/project-switch/idempotency/concurrency guards work;
- Apply creates exactly one history action and durable consumed latch; Undo/Redo preserves exact accepted document bytes; Save/Open preserves the latch and accepted bytes; and manual joint edit remains possible afterward;
- existing V1 saved projects still open without data loss and are never made AI-eligible by an absent latch; a normal explicit Save is the only migration/write path, while a new fresh record persists its unconsumed/consumed latch safely;
- a second AI create attempt after Apply returns the exact honest manual-tools result with zero executor/provider invocation and zero mutation;
- existing wave fixture/typo behavior, human timeline/edit/Play/Pause/onion, Creator, and Drawing protected flows remain unchanged; and
- real browser proof at the repository-required viewports records Preview, Cancel, Apply, manual edit, Undo/Redo, Save/Open, stale rejection, and post-Apply no-op without API/external/provider requests.

**Phase 1 stop condition.** The executor returns a technical proof manifest and Implementation Review Packet, then stops with an empty index. It does not update control-plane docs, stage, commit, publish, or begin Phase 2. Arthur/PM review and a later Control Plane Architect closeout/publication are separate.

**Explicitly excluded.** Terra, free-language matching, smooth interpolation/in-betweens, multiple figures, layer changes, working Task/Reasoning, color/background changes, dashboard work, and post-Apply AI editing.

#### Phase 1 accepted implementation and proof

Arthur reviewed the unpublished private app copy and accepted the Phase 1 engine on 2026-09-01. The accepted result implements the strict action-neutral plan and shared executor for the four fixed fixtures `wave`, `jump`, `bow`, and `dodge`; the one-time project-bound latch; isolated Preview/Cancel; one atomic Apply; post-Apply manual-tools response; exact Undo/Redo; V1-compatible and V2-latch Save/Open; and continued manual joint editing. It does not add natural-language understanding, a provider/API route, smooth interpolation, multiple figures, a user-visible Mode, working Task/Reasoning controls, or Phase 2 behavior.

The exact accepted technical result is 17 paths:

```text
scripts/fixtures/spec0004-stick/v1/browser-viewports.json
scripts/fixtures/spec0004-stick/v1/phase1-plan-cases.json
scripts/fixtures/stick-ai/v3/bow.json
scripts/fixtures/stick-ai/v3/dodge.json
scripts/fixtures/stick-ai/v3/jump.json
scripts/fixtures/stick-ai/v3/wave.json
scripts/spec0004-stick/phase1BrowserProof.ts
scripts/spec0004-stick/recordPhase1Proof.ts
scripts/spec0004-stick/validatePhase1Proof.ts
scripts/validateStickFigureAiUiAdapter.ts
src/components/workspace/stickfigure/StickFigureAiPanel.tsx
src/components/workspace/stickfigure/StickFigureWorkspace.tsx
src/lib/ai/stickFigureAiContract.ts
src/lib/ai/stickFigureAiWorkspaceAdapter.ts
src/lib/ai/stickFigureCommandExecutor.ts
src/lib/stickProjectStorage.ts
src/lib/stickfigure/stickProjectHistory.ts
```

The 15,683-byte technical manifest at `output/spec-0004/phase-1/proof-manifest.json` independently passed 126 checks at SHA-256 `ee3a92edf8f4227dfa91ec3b84de3599fa158d5fb5f3df83155ab5192c076e4a`. It binds 14 receipts and 27 artifacts: 707 deterministic assertions, four valid fixtures, 26 invalid-plan rejections, 12 browser flows, 11 screenshots at `1440×900` and `1024×768`, TypeScript, focused lint, unchanged full-lint baseline, diff proof, protected Stick/Drawing behavior, and zero external/API/provider requests.

The blue `PRIVATE REVIEW` fixture picker was created only inside an isolated temporary copy by `scripts/spec0004-stick/phase1BrowserProof.ts`. It is not imported by product code; the tokens `PRIVATE REVIEW`, `spec0004-phase1-review`, `__spec0004_review`, and `Preview wave` are absent from `app`, `src`, and `public`. The temporary copy and server were removed after Arthur's review. The proof script remains developer-only technical evidence and cannot make the blue box appear in the published app.

Phase 1 is Verified, published, and integrated in exact commit `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d`, parent `9fae072359f3c0d10f1ed2bcee8da9ebc11d54ec`, message `Implement SPEC-0004 Phase 1 animation builder`, with exactly 28 reviewed paths. The required clean permanent tester passed 40 operations, 13 screenshots, 4 driver messages, all 37 historical negatives, four protected Stick GETs, one mocked Drawing POST, zero real API/nonloopback/provider requests, and complete cleanup; result SHA-256 `bd037bc7a0ce9e48522ef6e626084ac3e9eaddfaaa475859d6c00e6c1960448e`. Publication branch, canonical local `main`, local `origin/main`, live GitHub `main`, and GitHub API matched with clean `0/0` synchronization. The blue private review box was not published. Phase 1 remains unchanged; D-0037 later authorized Phase 2 only.

### Phase 2 — Pose and Smooth Motion Engine

**Authorized outcome.** Phase 2 adds one hidden, deterministic local motion engine that turns the important poses and timing in a validated Phase 1 plan into an ordinary frame-by-frame Stick animation. The engine is shared infrastructure for later free Pretend AI recipes and later Terra original plans, but neither system is connected in this phase. The fixed Phase 1 `wave`, `jump`, `bow`, and `dodge` plans are the only accepted inputs and review examples.

The plan supplies the important poses. Diamond Animator locally creates the in-between poses. Interpolation math exists only while building the isolated candidate. Before Preview, every result frame is baked into the same ordinary Stick timeline data used by human tools. There is no persistent motion-tween span, procedural controller, hidden AI owner, green tween range, locked body part, regeneration rule, or AI-only format.

#### Phase 2 current-code finding and safe ownership rule

Fresh tracing at canonical base `b7f9ecbf0a15b6243955bea34d9b9518440bab53` found that the current editable Stick timeline resolves a `hold` cell to its owner keyframe. Editing a held display frame therefore edits the owner's shared content and can change several displayed frames. That behavior is valid for current manual holds, but it would violate Arthur's Phase 2 rule that every generated in-between remains independently editable.

Phase 2 therefore uses this exact materialization rule:

1. Every generated timeline slot—important pose, interpolated pose, and visually repeated/trailing pose—is a complete ordinary `keyframe` with one complete 11-joint pose.
2. A Phase 2 candidate contains zero `hold` cells and zero `tween` cells. Repeated-looking frames are independent deep copies, not references to an owner.
3. Every frame has a unique deterministic frame ID, pose ID, editable state ID after projection, and independently owned joint content. No object/array/pose reference may be shared between frames.
4. Editing frame `N` after Apply changes only frame `N` plus normal revision/history data. Canonical animation-content digests for every other frame remain identical.
5. Apply ends all engine control. A later human joint move may stretch a segment because Phase 2 adds no human constraint tool. The engine may not repair, snap back, regenerate, or undo that edit. Body rules guide candidate generation and validation only.

The existing Drawing motion tween is **not** the implementation model for this phase: Drawing retains a persistent owner/span and a position-only tween payload. No Drawing tween path or behavior changes.

#### Deterministic body, pose, and interpolation contract

The engine uses the current `humanoid-11-v1` topology: exactly the 11 roles `head`, `neck`, `hip`, left/right elbow, left/right hand, left/right knee, and left/right foot, connected by the existing exact 10-segment tree. The fresh built-in starter pose supplies the one canonical reference length for each segment.

For every input important pose, in this order:

1. The pose must contain all 11 roles exactly once, use integer stage coordinates, preserve the exact rig/figure IDs, and have every segment length within **40% through 160% inclusive** of its canonical starter length. A zero-length segment fails.
2. The engine keeps the input hip coordinate and each segment's direction, then rebuilds the body outward with canonical reference lengths in this fixed order: hip → neck → head; neck → left/right elbow → left/right hand; hip → left/right knee → left/right foot.
3. Every rebuilt joint must remain inside `0..1919 × 0..1079`; the derived horizontal line head must retain a 40-pixel stage-edge margin. The engine rejects the whole candidate rather than clamping a joint.
4. Important-pose frame indices remain exact and strictly increase. Adjacent important poses must be at least two frame indices apart, must differ at one or more joints, and may move the hip by at most 480 pixels. Each segment's shortest signed angular change must be at most 170 degrees; an ambiguous flip is rejected.

For an important pose at frame `a` followed by one at frame `b`, every frame `i` from `a` through `b` uses:

```text
u = (i - a) / (b - a)
e = 3u² - 2u³
```

- Hip `x` and `y` move from start to end using `e`.
- Each segment angle moves by its shortest signed turn using `e`.
- The body is rebuilt outward using the fixed canonical segment lengths, creating stable limbs and joint-centered arcs.
- Final coordinates use ECMAScript `Math.round`. Important-pose frames equal their normalized important poses exactly.
- Any frame after the final important pose is an independent complete copy of that final normalized pose.
- No point is clamped. Any generated out-of-bounds point rejects the complete candidate and leaves document, history, storage, latch, and view state unchanged.

A valid output has exactly the input plan's 8–24 frames and exact 12 or 24 FPS, one existing layer, one figure, one rig, white background, and the current derived line head. Every one of its frames is a keyframe containing all 11 joints. After integer rounding, every segment length must be within two pixels of its canonical reference length. Important frames must match their normalized poses; golden in-between coordinates must match exactly; eased hip positions and unwrapped segment angles must be monotonic without overshoot; at least one interior frame in each transition must differ from both endpoints; and the candidate must pass normal canonical document/project validation.

#### Compatibility and runtime entry point

Phase 1 remains byte-compatible and protected. `materializeStickAnimationPlan` and the default `StickFigureCommandTransactionV1` behavior keep producing the accepted Phase 1 held-frame result so its historical proof and current chat behavior do not silently change. Phase 2 adds a separately named motion materializer and a fail-closed transaction option that selects it. The option must survive `fork()` exactly; omission must remain the Phase 1 default. No action-name branch may be added: all four plans pass through the same pose/timing/motion rules.

This new entry point is hidden engine infrastructure only. Normal Stick chat, the existing deterministic Phase 6 wave, current Task/Reasoning presentation, and the Phase 1 transaction continue to use their current routes. A later separately authorized phase must deliberately connect Pretend AI or Terra to the Phase 2 entry point.

#### Exact Phase 2 implementation allowlist

One dedicated Spec Executor may change only these eight tracked paths. The four `v1` Phase 1 plans are read-only inputs and must not change.

```text
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0004-stick/v2/browser-viewports.json
scripts/fixtures/spec0004-stick/v2/phase2-motion-cases.json
scripts/spec0004-stick/phase2BrowserProof.ts
scripts/spec0004-stick/recordPhase2Proof.ts
scripts/spec0004-stick/validatePhase2Proof.ts
scripts/validateStickFigureMotionEngine.ts
```

Ignored proof artifacts may exist only under `output/spec-0004/phase-2/**`. If another tracked product/proof path is genuinely necessary, the executor stops for a spec correction. It may not edit the Workspace, panel, timeline/history/storage model, Phase 1 fixtures/proof, Drawing code, package/dependency/configuration/environment files, or canonical control-plane files.

#### Entry gate and executor boundary

D-0037 authorizes Phase 2 only. Implementation may start only after this activation record is reviewed, published, and integrated into clean canonical `main`. One new Spec Executor starts in Plan mode from that exact activation SHA, proves an empty index and exclusive worktree, re-traces the live plan → transaction → canonical candidate → editable timeline/history/storage path, and confirms the eight-path allowlist before editing. Recommended executor: `gpt-5.6-sol`, reasoning `xhigh`, because frame ownership, deterministic geometry, and transaction regression proof are coupled and high risk.

The executor must not create a provider client, make a network/API/paid request, change a normal app control, or begin Phase 3. It produces and independently validates a technical manifest, returns its Implementation Review Packet, and stops with an empty index before any control-plane update, stage, commit, or push.

#### Technical proof and manifest rules

The recorder owns one manifest at `output/spec-0004/phase-2/proof-manifest.json`. The independent validator must recompute every tracked-input/result SHA-256 and byte count, bind exact base/HEAD/branch, bind the exact dirty eight-path ceiling and empty index, verify every receipt/artifact path remains under the authorized roots, reject duplicates/extra/missing/symlink/hidden/untracked tracked-scope data, and fail closed on one-byte, length, count, status, command, base, or path mutation. It must record zero external/API/provider requests.

Required deterministic and browser evidence proves:

- all four unchanged Phase 1 plans validate through one action-neutral Phase 2 engine and exact golden normalized/in-between coordinates;
- exact 11-role/10-segment topology, canonical-length normalization, 40–160% input bounds, two-pixel output tolerance, derived-head margin, important-pose spacing/change/480-pixel hip/170-degree turn limits, bounds rejection, cubic easing, shortest-turn arcs, monotonic no-overshoot motion, exact frame count/FPS, and independent trailing frames;
- invalid/missing/duplicate joints, zero or extreme segments, ambiguous turn, out-of-order/too-close pose indices, out-of-bounds normalization or interpolation, tampered fixture, shared frame/pose/content identity, `hold`, `tween`, or hidden motion payload all fail closed;
- Preview/Cancel/failure change no canonical document/history/storage/latch/view state; Apply is exactly one history change; Undo returns exact pre-Apply bytes; Redo returns exact accepted bytes; Save/Open preserves the accepted independent frames;
- every generated frame is visible in the normal timeline and every normal joint can be moved with existing tools; editing one generated frame persists through selection change, playback, Undo/Redo, and Save/Open without changing any unrelated frame digest or regenerating/snap-backing;
- normal human frame actions, manual joint editing, Play/Pause, onion skin, Creator/Back, Phase 1 fixture transaction/latch/stale/idempotency/concurrency/no-op behavior, the published Phase 6 wave/typos, Drawing protected flows, and the permanent tester remain unchanged; and
- TypeScript, focused lint with zero accepted changed-path findings, measured full-lint non-regression, both diff checks, exact allowlist/index/Git checks, and complete process/port/temp-copy cleanup pass.

#### Arthur's private visible review — no blue box

Arthur must never see the former large blue `PRIVATE REVIEW` box again, including in the unpublished Phase 2 copy. The review proof creates four separate disposable loopback-only app copies/links—one prepared sample each for wave, jump, bow, and dodge. Each opens the ordinary Stick workspace already holding that sample in the normal preview flow. There is no floating overlay, tester button, fixture picker, query flag, product route, public asset, import, or permanent review UI. The normal canvas, timeline, AI Preview/Apply/Cancel area, and manual tools are the only visible controls. The review helper exists only inside disposable copies, is excluded from product bytes and the publication allowlist, and every copy/process/port is destroyed after review.

Arthur reviews this exact checklist in the private copy:

1. Play and scrub all four samples: movement is smooth, readable, and has no teleport/snap, broken limb, or strange backward arc.
2. See one ordinary timeline frame for every in-between; no green tween span or hidden long frame exists.
3. Apply one sample, select an in-between, and move its head/hand/knee with normal tools. The edit stays and unrelated frames do not move.
4. Confirm Preview and Cancel change nothing; Apply is one Undo; Redo returns it; Save/Open returns the same edited animation.
5. Check normal Play/Pause, onion skin, Creator/Back, timeline actions, and the Drawing workspace still work.
6. Fail the review for any blue test box, special visible tester control, locked joint/frame, regeneration/snap-back, shared-frame edit, persistent tween controller, API/provider request, or unrelated visual/product change.

**Stop boundary.** No natural-language/free matcher, new recipe, Task/Reasoning behavior, Terra/provider/API/paid call, multiple figure, duration/frame/FPS expansion, background, layer management, Drawing change, workspace integration, dashboard/cost implementation, deployment, or post-Apply AI editing is included. Phases 3–8 remain unauthorized.

#### Phase 2 accepted implementation and proof

Arthur reviewed the four ordinary unpublished Phase 2 samples and accepted the result on 2026-09-02. The accepted engine uses the unchanged fixed `wave`, `jump`, `bow`, and `dodge` plans, normalizes the built-in 11-joint/10-segment humanoid, creates cubic-smoothstep shortest-turn in-betweens, and bakes every output slot as a complete independent ordinary keyframe. Phase 1 remains the default route unless the separately named `phase-2-baked-motion` option is selected. No normal chat route, visible control, provider, API, paid request, or post-Apply engine ownership was added.

The exact accepted tracked result is eight paths:

```text
scripts/fixtures/spec0004-stick/v2/browser-viewports.json
scripts/fixtures/spec0004-stick/v2/phase2-motion-cases.json
scripts/spec0004-stick/phase2BrowserProof.ts
scripts/spec0004-stick/recordPhase2Proof.ts
scripts/spec0004-stick/validatePhase2Proof.ts
scripts/validateStickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
src/lib/ai/stickFigureMotionEngine.ts
```

The 11,493-byte technical manifest at `output/spec-0004/phase-2/proof-manifest.json` has SHA-256 `a6e656d930781b589a3350abec62000818fade6553638ada0899ec7183b24d3f`. Executor-time independent validation passed 210 checks while all four temporary review servers were live. It references 10 technical receipts within 19 unique artifacts and records 1,734 deterministic assertions, four valid fixed plans, 20 invalid-motion rejections, 40 browser flows, eight screenshots across two viewports, TypeScript, focused lint, full-lint non-regression at the accepted 5-error/72-warning baseline with zero Phase 2 findings, protected Stick/Drawing behavior, and zero external/API/provider requests. The Control Plane Architect later revalidated all 19 unique artifact hashes and sizes offline after the temporary review servers stopped; the accepted manifest and all eight tracked technical hashes remained unchanged.

The four review copies had no blue box, fixture picker, query flag, product route, public asset, visible tester control, or permanent product import. Their loopback processes are stopped and their isolated temporary directories are removed. That cleanup is not a proof failure: the preserved successful live validation receipt proves the server-dependent checks, while closeout separately proves all durable hashes, scope, cleanup, and repository state.

GIT-035 published Phase 2 in exact commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`, parent `70bf7b0799bcff8d703525bcb50c378b8a122ebf`, message `Implement SPEC-0004 Phase 2 motion engine`. The clean tester passed 40 operations, 13 screenshots, four driver messages, all 37 historical negatives, one deterministic mocked Drawing POST, zero real-route/non-loopback/provider requests, and complete cleanup. Arthur's accepted review identified the next bounded gap: one fixed cubic curve cannot express action-specific acceleration, deceleration, impact, recovery, or deliberately mechanical constant motion. D-0040 authorizes Phase 2.5 to close that gap, and GIT-036 published its activation at `a755f892d7737c6a10d9c381ec59c1e2fdba4d47`. Phase 3 remains unauthorized.

### Phase 2.5 — Action Timing and Spacing Engine

**Authorized outcome.** Add one hidden, deterministic local timing layer on top of the exact published Phase 2 motion engine. The important poses still decide **what** the body does. The Phase 2.5 timing contract decides **how quickly each transition travels at each baked frame**. Natural/organic motion must not accidentally move at one constant pace. Constant/mechanical motion is allowed only through an explicit structured choice.

This engine contract is shared infrastructure for later free Pretend-AI recipes and later **Terra** original plans. Phase 2.5 connects neither route, interprets no user sentence, and makes no provider/API request. The provider-planner name is always spelled **Terra**.

#### Exact structured timing contract

The local timing sidecar is a strict plain JSON object with these exact fields and no extras:

```text
contractVersion: "stick.action-timing/v1"
projectId: exact plan projectId
transactionId: exact plan transactionId
planSha256: lowercase 64-character SHA-256 of the canonical parsed animation plan
motionIntent: "natural" | "mechanical_explicit"
transitions: one ordered entry for every adjacent important-pose pair
```

Each transition has exactly:

```text
fromPoseName: exact earlier pose name
fromFrameIndex: exact earlier important-pose frame index
toPoseName: exact next pose name
toFrameIndex: exact next important-pose frame index
profile: "ease_in" | "ease_out" | "ease_in_out" | "constant" | "impact" | "recovery"
```

Validation is fail-closed:

1. The sidecar must bind to the exact parsed plan through project ID, transaction ID, and canonical plan SHA-256.
2. `transitions` must have exactly `importantPoseCount - 1` entries in the same order as the plan. Every entry must name the exact adjacent pose names and frame indices. Missing, extra, duplicate, reordered, overlapping, non-adjacent, or unknown data rejects the whole candidate.
3. A natural transition must have an explicit supported profile. When no action-specific profile is justified, later planners must emit `ease_in_out`; this is the safe natural default policy. The engine still rejects a missing profile rather than guessing.
4. `constant` is valid only when `motionIntent` is exactly `mechanical_explicit`. It is forbidden under `natural`. Phase 2.5 does not decide whether words such as “robot,” “mechanical,” or “constant pace” were intended; that language decision belongs to Phase 4 for free recipes and Phase 6 for Terra.
5. `impact` must be immediately followed by `recovery`, and `recovery` must be immediately preceded by `impact`, sharing their middle important pose. An unpaired or reordered impact/recovery rejects the candidate.
6. The sidecar contains no custom curve points, arbitrary numbers, code, provider text, hidden hold/controller data, or fields that can change FPS, total frames, key-pose indices, topology, layer, figure, background, or project binding.

#### Exact timing math and spacing meaning

For adjacent important poses at frames `a` and `b`, with `n = b - a` and frame `i` from `a` through `b`:

```text
u = (i - a) / n
```

The selected profile produces progress `e`:

| Profile | Exact progress function | Motion meaning |
| --- | --- | --- |
| `ease_in` | `e = u²` | acceleration: tight spacing first, wider spacing later |
| `ease_out` | `e = 1 - (1 - u)²` | deceleration: wider spacing first, tight spacing later |
| `ease_in_out` | `e = 3u² - 2u³` | safe natural default: slow start, faster middle, slow finish |
| `constant` | `e = u` | equal parameter spacing for an explicitly mechanical transition only |
| `impact` | `e = u³` | strong acceleration into the impact pose |
| `recovery` | `e = 1 - (1 - u)³` | quick movement away from impact that settles into recovery |

`e` replaces Phase 2's fixed smoothstep progress for that one transition. The engine applies it to hip position and every shortest-turn segment angle, then uses the unchanged Phase 2 canonical-length rebuild order, integer rounding, stage/head bounds, two-pixel output tolerance, and fail-closed candidate validation.

The animation meaning is exact: wider position gaps between consecutive baked frames mean faster visible travel; tighter gaps mean slower travel. Proof must check the unrounded progress gaps and exact golden baked coordinates. For each golden moving transition it also checks a deterministic motion probe chosen in this fixed order—hip `x`, hip `y`, then segment angles in the Phase 2 rebuild order—using the first scalar whose endpoint change is non-zero. `ease_in`/`impact` gaps increase, `ease_out`/`recovery` gaps decrease, `ease_in_out` grows then shrinks without overshoot, and `constant` gaps are equal within deterministic floating-point tolerance. Rounding may produce a repeated visible coordinate but may not change the mathematical profile, endpoint, frame ownership, or exact golden output.

#### Baked ownership and transaction rule

The pipeline stays:

```text
important key poses
→ one validated timing choice per adjacent transition
→ local hip/shortest-turn in-betweens
→ complete independent ordinary Stick keyframes
→ isolated Preview
→ Cancel or one atomic Apply
```

Before Preview, every important, in-between, repeated-looking, landing, and recovery slot is a complete independent ordinary keyframe using the normal editable Stick project model. Timing data is temporary input only and is discarded after baking. The applied document contains no live tween, long/green tween span, timing controller, shared hold owner, shared pose/content identity, lock, AI-only format, regeneration rule, snap-back rule, or hidden future overwrite. A person may edit every joint in every applied frame; that edit stays and changes only the selected frame plus normal revision/history data. Undo/Redo and Save/Open preserve exact accepted human-editable bytes.

Preview, Cancel, validation failure, stale/project-switch/concurrency/idempotency failure, and injected failure remain document/history/storage/latch/view-state no-ops. Apply remains one history action. Human Play/Pause and onion skin remain user-owned; the engine never toggles them.

#### Exact fixed timing examples

The Phase 2.5 fixture file must contain explicit sidecars for all four unchanged Phase 1/2 plans plus one technical-only detailed jump plan. None is connected to normal chat or becomes a new product recipe in this phase.

1. **Wave:** both arm-direction transitions use `ease_in_out`, so the hand slows near each important extreme instead of moving at a constant pace.
2. **Existing 12-frame jump:** launch-to-peak uses `ease_out`; peak-to-landing uses `ease_in`; trailing landing slots stay independent baked copies. This retains the exact published plan and adds readable slow-near-peak/accelerating-fall timing.
3. **Bow:** the move into the bow and the return use deliberately different safe profiles (`ease_out` into the bowed pose, then `ease_in_out` back), with exact golden spacing proof. The two halves may not use the same accidental pace.
4. **Dodge:** the move into the dodge uses `impact` and the return uses its immediately paired `recovery`, producing a sharp avoid-and-settle action without a live controller.
5. **Detailed technical jump review:** one test-only 24-frame/12-FPS plan uses seven important poses—stand at frame 0, crouch at 3, launch extension at 6, peak at 10, landing contact at 15, knee-bend compression at 17, recovered stand at 23—and the exact profiles `ease_in`, `ease_out`, `ease_out`, `ease_in`, `impact`, `recovery`. It must visibly read as stand → crouch → fast launch → slow near peak → accelerating fall → landing/knee-bend impact → recovery → stand. It stays inside the existing 8–24-frame and 12/24-FPS proof bound and is not the later Phase 3 duration/frame-cap decision.

A deterministic explicit-mechanical negative/positive pair also proves that `constant` fails under `natural`, succeeds only under `mechanical_explicit`, and creates equal progress gaps. It is proof data, not a user-facing Mode or recipe.

Arthur's example “run from the left side to the right side in three seconds” is not silently added here. Variable duration/FPS/final frame caps and multiple figures remain Phase 3; free-language recipe selection remains Phase 4; original Terra planning remains Phase 6.

#### Exact Phase 2.5 implementation ceiling

After every entry gate is satisfied, one dedicated Plan-mode Spec Executor may change only these seven tracked paths:

```text
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0004-stick/v3/phase25-timing-cases.json
scripts/spec0004-stick/phase25BrowserProof.ts
scripts/spec0004-stick/recordPhase25Proof.ts
scripts/spec0004-stick/validatePhase25Proof.ts
scripts/validateStickFigureActionTiming.ts
```

Ignored proof artifacts may exist only under `output/spec-0004/phase-2.5/**`. The executor must treat every Phase 1 and Phase 2 runtime, fixture, test, proof, manifest, and control-plane path outside that seven-path list as read-only. If another tracked path is genuinely needed, it stops for a spec correction. Recommended executor: `gpt-5.6-sol` at `xhigh` reasoning because deterministic timing math, transaction options, frame ownership, and visible motion proof are coupled.

The executor starts only from the exact final clean canonical-main record SHA after GIT-036, which contains both the accepted/published Phase 2 result and published Phase 2.5 activation. It must first re-run the full boot, prove an empty index and exclusive worktree, revalidate the accepted Phase 2 manifest/bytes, trace the live plan → timing sidecar → motion engine → transaction → independent frames path, and confirm the exact ceiling. It must not edit app UI, connect a route, create a provider client, contact an external service, or begin another phase.

#### Technical proof and manifest

The recorder writes one manifest at `output/spec-0004/phase-2.5/proof-manifest.json`. Independent validation must recompute the manifest hash/size and every receipt/artifact hash/size; bind exact base/HEAD/branch, the seven-path dirty ceiling, and empty index; reject missing/extra/duplicate/hidden/symlink/out-of-root paths; and fail on one-byte, count, path, status, command, base, profile, formula, fixture, or network-ledger mutation.

The exact commands are:

```bash
node --experimental-strip-types scripts/spec0004-stick/recordPhase25Proof.ts
node --experimental-strip-types scripts/spec0004-stick/validatePhase25Proof.ts --manifest output/spec-0004/phase-2.5/proof-manifest.json
```

Required evidence proves:

- exact schema/plan binding, complete adjacent-transition coverage, natural default policy, explicit-only constant motion, impact/recovery pairing, all six formulas, progress-gap ordering, exact golden coordinates, endpoints, monotonicity, no overshoot, and stable Phase 2 body lengths/arcs/bounds;
- wave, existing jump, bow, dodge, the detailed 24-frame jump, and explicit mechanical constant cases through one action-name-neutral engine;
- rejection of missing/extra/unknown fields, wrong version/plan digest/project/transaction, missing/extra/duplicate/reordered/non-adjacent transition, wrong pose name/index, unknown profile, constant under natural, unpaired impact/recovery, arbitrary curve data, NaN/non-finite/tampered data, and every inherited Phase 2 geometry/ownership failure;
- every output cell is an independent ordinary keyframe with zero hold/tween/controller/timing payload/shared identity, and a manual one-frame edit never changes another frame or regenerates/snap-backs;
- Preview/Cancel/failure no-op, one Apply, exact Undo/Redo, Save/Open, selection/playback/onion/Creator continuity, Phase 1 default compatibility, the accepted Phase 2 result, published Phase 6 wave/typos, Drawing/SPEC-0002/SPEC-0003 protections, and the permanent tester;
- TypeScript, focused lint with zero changed-path findings, measured full-lint non-regression, both diff checks, exact scope/index/Git checks, proof-validator mutation tests, zero external/API/provider requests, and complete process/port/temp-copy cleanup.

#### Arthur's private review — ordinary app only

The stopped executor provided four separate disposable non-3000 loopback links: timed wave, detailed timed jump, timed bow, and timed dodge. Each was an isolated unpublished copy based on the accepted Phase 2 result and opened the ordinary Stick workspace with that one sample in the normal Preview flow. There was no blue box, fixture picker, overlay, query flag, special button, product route, public asset, product import, or permanent review code.

Arthur reviewed these original Phase 2.5 criteria. Timing behavior passed, but the overall motion failed naturalness for the action-plan reasons recorded in the RCA and disposition below:

1. Wave slows at its extremes; jump launches fast, slows near the peak, falls faster, bends on landing, and recovers; bow clearly changes pace; dodge is sharp then settles.
2. Play/scrub and optional human onion skin show wider frame spacing where movement is faster and tighter spacing where it is slower.
3. Every displayed slot is a normal separate timeline keyframe. Apply, edit one joint/frame, switch frames, Play/Pause, Undo/Redo, Save/Open, and confirm no other frame changes or snaps back.
4. Preview and Cancel change nothing; Apply is one Undo; Creator/Back and Drawing still work; there is no API/provider request or unrelated visual change.
5. Fail for constant-looking natural motion, a missing beat in the detailed jump, equal-paced bow, a locked/shared frame, live tween/controller, regeneration, any blue/special tester UI, or an unrelated change.

Phase 2.5 closeout must verify that every disposable copy/process/port was destroyed after review and excluded from publication.

#### Later-phase contract links

- **Phase 4:** every accepted free recipe must emit complete important poses inside the shared Phase 2.6 `stick.action-foundation/v1` contract, including one complete validated `stick.action-timing/v1` sidecar. It may interpret natural wording such as “robotic” or “constant pace” and emit `mechanical_explicit`; Phase 2.5/2.6 never interpret language.
- **Phase 6:** every accepted Terra original plan must emit that same strict Phase 2.6 action-foundation contract. Terra may create original poses but may not bypass action purity, contacts, weight, timing, local validation/baking, or ordinary editable output; it may not return raw code, arbitrary curves, a second format, or unbounded timing.
- **Phase 7:** mechanical and Arthur-visible quality review must check action purity, support/weight/body mechanics, realistic intentional timing/spacing, and complete action beats—not only intact limbs, FPS, and basic smoothness.

**Stop boundary.** Phase 2.5 does not connect Pretend AI, Terra, natural-language recognition, Task/Reasoning UI, fake/live provider, API/key/paid call, post-Apply AI edit, a new product recipe, multiple figures, variable FPS/duration/final frame cap, layer/background/camera/prop/color/custom rig/body shape, accurate dolphin/dinosaur body, Drawing/workspace integration, dashboard, deployment, or Phase 3–8 implementation. Backgrounds, stick color, and custom stick shapes/rigs belong to future separate specifications.

#### Phase 2.5 accepted timing-only disposition

The executor completed the exact seven-path technical result from base/HEAD `f131e75aafccec0d1b8ecb717e2d95b518355d39`. The strict timing schema and all six formulas passed deterministic, browser, TypeScript, lint-non-regression, permanent-browser-regression, no-egress, and independent-manifest validation. The accepted manifest is 14,601 bytes with SHA-256 `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1`; the Control Plane Architect revalidated it at 250 checks before stopping the exact four recorded review process groups and removing only their four isolated temporary copies.

Arthur rejected the wave/jump/bow/dodge samples as natural motion. That rejection is binding for visible quality and does not invalidate the narrow timing math. D-0041 accepts and closes Phase 2.5 only as the timing/spacing primitive it actually proves; the old fixture poses and human-review quality claims are not promoted as natural-action evidence. The seven accepted technical paths are frozen, uncommitted, and unpublished pending GIT-037. Phase 2.6 cannot start until GIT-037 publishes/integrates those exact bytes and this reviewed amendment into canonical `main`.

### Phase 2.6 — Natural Action Planning, Weight, and Intent Guard

**Approved/Authorized outcome; implementation not started.** Add the final shared motion-foundation layer before Preview. One strict action-foundation contract binds the requested action, action-pure ordered beats, complete important poses, ground/contact/support/weight facts, the accepted Phase 2.5 timing sidecar, and the exact animation plan. The engine validates the contract before baking and validates the baked candidate again before Preview. Any missing, malformed, unrelated, mechanically inconsistent, or unexplained motion fails closed with no candidate shown and no canonical mutation.

This one phase owns natural action planning, weight, contact, body mechanics, landing/recovery, direction, frame allocation, and action purity for the bounded samples below. It is deliberately not split again; there is no Phase 2.7. Later free/Pretend-AI recipes and future **Terra** original planners must emit the same contract and use the same validator/motion engine. Phase 2.6 itself does not read or interpret user text, connect normal chat, choose a recipe, call Terra, instantiate a provider/API client, or incur cost.

#### One exact shared structured contract

The input is one strict plain JSON object with no accessors, sparse arrays, symbols, aliases, duplicate keys, non-finite values, or extra fields:

```text
contractVersion: "stick.action-foundation/v1"
projectId: exact parsed animation-plan projectId
transactionId: exact parsed animation-plan transactionId
planSha256: lowercase 64-character SHA-256 of the canonical parsed animation plan
intent: exact intent object below
ground: exact ground object below
poses: one ordered pose annotation for every create_key_pose command
timing: the complete strict accepted stick.action-timing/v1 sidecar
```

`intent` has exactly:

```text
requestedAction: 1..48 character lowercase ASCII slug, /^[a-z][a-z0-9_-]{0,47}$/
actionClass: "wave" | "jump" | "bow" | "dodge" | "walk" | "run" | "original"
direction: "left" | "right" | "in_place"
pace: "normal" | "slow_motion_explicit"
activeSide: "left" | "right" | "both" | "none"
startState: "neutral" | "request_defined"
endState: "neutral" | "request_defined"
allowsFullBodyRotation: false
allowedBeatKinds: ordered unique non-empty subset of the closed beat-kind list
allowedMajorEvents: ordered unique array of at most four lowercase ASCII slugs
```

For `actionClass: "jump"`, `requestedAction` is exactly `jump` or `hop`. For each other named class it equals the class. `original` accepts another safe slug and is the extensibility case; it does not waive any structural, contact, balance, timing, purity, or no-op rule. Wave requires `activeSide` left or right. Jump/bow/walk/run require `both`; dodge requires `both`; original declares the applicable value. Wave/jump/bow are `in_place`; dodge/walk/run must declare left or right. `allowsFullBodyRotation` is fixed `false` in version 1: a backflip/full-body rotation is unsupported and fails even if tagged. Slow motion is valid only when a later structured planner explicitly emits `slow_motion_explicit`; Phase 2.6 never infers it from text, and a normal-paced contract may not use slow-motion allocations.

`ground` has exactly these fields and values; a caller cannot widen them:

```text
lineY: integer inside 1..1078 and equal to both neutral planted-foot Y coordinates within 2 px
contactTolerancePx: 2
plantedSlideTolerancePx: 2
swingClearancePx: 8
airborneClearancePx: 12
```

Each `poses` entry has exactly:

```text
poseName: exact create_key_pose poseName
frameIndex: exact create_key_pose frameIndex
beatKind: one closed value listed below
beatRole: "neutral" | "requested_action" | "balance" | "recovery"
actionTag: "none" or exact intent.requestedAction
jointMotion: ordered array of exact joint-motion entries described below
majorEvents: ordered unique subset of intent.allowedMajorEvents
leftFoot: "planted" | "contact" | "swing" | "airborne"
rightFoot: "planted" | "contact" | "swing" | "airborne"
support: "left" | "right" | "both" | "airborne"
weightBias: "left" | "right" | "center" | "airborne"
landingPhase: "none" | "contact" | "compression" | "recovery"
```

Each `jointMotion` entry has exactly `joints`, `motionRole`, and `mechanicalTie`. `joints` is a non-empty unique subset in canonical `STICK_JOINT_ROLES` order; `motionRole` is `requested_action`, `balance`, or `recovery`; and `mechanicalTie` is `null`, `counterbalance`, `takeoff_assist`, `landing_absorption`, or `gait_arm_swing`. A `balance` entry requires a non-null tie; `requested_action` and `recovery` require `null`. Entries follow motion-role order as listed, a joint may occur in only one entry per pose, and an unknown/out-of-order/duplicate role or joint is malformed. A neutral pose has an empty array; every non-neutral pose has at least one entry. The union of `jointMotion[].joints` is that pose's exact participating-joint set.

The closed `beatKind` values are `neutral`, `arm_raise`, `wave_extreme`, `anticipation`, `takeoff`, `ascent`, `apex`, `descent`, `landing_contact`, `compression`, `hip_hinge`, `bow_bottom`, `settle`, `weight_shift`, `push_off`, `dodge_extreme`, `contact`, `down`, `passing`, `up`, `airborne`, `recovery`, and `action_extreme`. `poses` has 3..12 entries, matches all important-pose commands one-for-one and in exact order, begins at frame `0`, ends at `totalFrameCount - 1`, and uses strictly increasing indexes at least two frames apart. `allowedBeatKinds` must equal the ordered first-occurrence list derived from `poses`; it is not a second loose allowlist.

The nested `timing` object must independently pass the accepted `stick.action-timing/v1` validator. Its project ID, transaction ID, and plan SHA must equal the root and parsed plan; it must contain exactly one profile for every adjacent pose pair in the same order. Phase 2.6 accepts only the six Phase 2.5 profiles and does not add or reinterpret a curve. Every Phase 2.6 positive sample, including the explicit slow-motion hop and general case, uses `motionIntent: natural` and never uses `constant`; later Phase 4/6 planners may emit Phase 2.5's already-guarded `mechanical_explicit` only when their structured request interpretation explicitly requires mechanical motion. A canonical SHA-256 of the complete action-foundation object is included in deterministic frame/pose ID derivation so a stale, mixed, or substituted action/timing plan cannot reuse another candidate identity. Timing metadata and the action-foundation object are discarded after baking and never enter the applied Stick document.

Only after the pre-bake contract passes may the shared engine materialize frames. Every displayed slot is then one complete, independent, ordinary editable Stick keyframe and the engine reruns intent, contact, support, weight, geometry, timing-spacing, and ownership checks over the baked result before Preview. There is no hold, tween, runtime interpolation, hidden controller, shared frame/pose/content owner, lock, regeneration, snap-back, or AI-only document format. Failure at either validation boundary destroys the isolated candidate and leaves document, history, storage, one-time latch, selection, Play/Pause, and onion state byte-identical.

#### Action-purity and no-unrequested-prelude/extra-action rule

Action purity is mandatory, not advisory:

1. The first and last important poses must satisfy `startState` and `endState`. `neutral` means the accepted built-in neutral pose after Phase 2 normalization within 4 px per joint and 3 degrees per segment, with both feet planted. A non-neutral boundary is allowed only when its state is explicitly `request_defined`; it still carries the requested action tag and must pass all mechanics. Wave, jump/hop, bow, and dodge use neutral boundaries; walk and run use request-defined first/next-contact boundaries.
2. Every non-neutral beat has `actionTag` equal to `requestedAction`. A neutral beat uses `none`. A pose-level `balance` role requires at least one `jointMotion` balance entry and an adjacent requested-action/recovery beat that it mechanically supports. Every balance joint entry requires its exact non-null mechanical tie and requested-action tag; no independent gesture may be relabeled balance. Recovery entries are allowed only at action-specific settle/recovery beats.
3. Before the first requested-action beat, only neutral and its action-specific anticipation/balance beats may appear. After the last requested-action beat, only its recovery/settle and final boundary may appear. A clap, hop, nod, head shake, wave, kick, flip, explosion, prop/environment event, or any other independent pre-roll, simultaneous, or post-roll action fails before Preview unless it is the exact requested action and allowed by the named action-class rules.
4. `majorEvents` must be a subset of the intent list and mechanically possible for the action class. Known wave/bow/dodge/walk/run samples require `allowedMajorEvents: []` and no pose event. Jump/hop requires `allowedMajorEvents: ["takeoff","landing"]`, with `takeoff` exactly once on the `takeoff` pose and `landing` exactly once on `landing_contact`; absence, duplication, or another placement fails. An unlisted `explosion`, `backflip`, or other event fails. Version 1 never permits full-body rotation.
5. For each transition, any joint omitted from the union of the source and destination annotations' `jointMotion` arrays must keep its parent-relative vector within 4 px and 3 degrees of the source important pose at every baked interior sample and destination; the hip, which has no parent, uses absolute X/Y displacement within 4 px. A planted foot uses the stricter 2 px plant anchor. A changed joint that is undeclared, a declared joint not permitted for that beat/action class, or an unexplained excursion beyond either tolerance fails the whole candidate.
6. Wave may move only the chosen active elbow/hand beyond the 4 px/3 degree tolerance. Its head, neck, hip, knees, feet, and non-active arm remain stable; both feet remain planted; the active hand alternates across natural extremes and returns to neutral. Bringing both hands together within 80 px after starting at least 160 px apart is a clap and fails. Any hip rise over 12 px or loss of ground contact is an unrequested hop and fails.
7. Jump/hop may use symmetric arm motion only in `jointMotion` balance entries tied to `takeoff_assist` or `landing_absorption`. At poses containing those entries, left/right elbow and hand Y values differ by at most 24 px, their pair midpoints stay within 24 px of the neck/hip center line, and mean hand-Y movement has the same sign as hip-Y movement outside a 4 px deadband. The arms may reverse direction at most once across ascent/landing. A unilateral hand sweep over 48 px, repeated lateral reversal, or asymmetric pair error over 24 px is a wave and fails. The neck-to-head angle stays within 8 degrees of its neutral direction with no alternating sign reversal; a nod or head shake fails.
8. Bow/dodge/walk/run and the generic original case use the same declaration rule. Their action-class-specific participating-joint sets and mechanical ties are exact fixture data and validator constants. No caller can silence an excursion merely by listing every joint: the named-class rules reject joints/roles not mechanically allowed, and `original` still requires a finite declared set, generic beat order, contacts, balance, non-rotation, timing, and all excursion checks.

The known-class joint allowlists are exact. Wave permits requested-action motion only on the active-side elbow and hand. Jump/hop permits requested-action motion on `hip,leftKnee,leftFoot,rightKnee,rightFoot` and balance motion on `leftElbow,leftHand,rightElbow,rightHand` only with `takeoff_assist` or `landing_absorption`. Bow permits requested-action motion on `head,neck,hip,leftKnee,rightKnee` and optional arm balance only with `counterbalance`. Dodge permits requested-action motion on `head,neck,hip,leftKnee,leftFoot,rightKnee,rightFoot` and optional arm balance only with `counterbalance`. Walk/run permit requested-action motion on `hip,leftKnee,leftFoot,rightKnee,rightFoot` and arm balance only with `gait_arm_swing`; their head-to-neck and neck-to-hip vectors remain inside the non-participating tolerance. A recovery entry may contain only joints from that class's requested-action or balance allowlist. Within each comma-separated set, emitted joints retain canonical `STICK_JOINT_ROLES` order. Wave uses `neutral` then requested-action roles then `neutral`; jump uses a recovery role only on its final `recovery` beat; bow uses recovery only on its `recovery` beat; dodge uses recovery on `settle` and `recovery`; walk/run use requested-action roles throughout their request-defined cycle boundaries.

Positive proof includes a jump with symmetric tagged `takeoff_assist` and `landing_absorption` arm motion. Required negative fixtures include `wave-with-clap`, `wave-with-hop`, `jump-with-wave`, `hop-with-head-nod`, and `hop-with-head-shake`, plus unrelated action/event tags and unexplained pre-roll/post-roll joint excursions. These failures occur before Preview and preserve document/history/storage/latch/view-state digests exactly.

#### Contact, support, weight, and body-mechanics checks

All checks run on normalized important poses and again across every baked frame:

- A `planted` or `contact` foot has `abs(foot.y - lineY) <= 2`. An `airborne` foot has `foot.y <= lineY - 12`; a `swing` foot has `foot.y <= lineY - 8`. A declared airborne pose with a foot at ground, or a declared planted/contact pose away from ground, is false contact and fails.
- A continuous planted interval owns one anchor from first contact through the last planted baked frame. Maximum Euclidean displacement from that anchor is 2 px, not 2 px per frame; cumulative sliding therefore cannot pass. A contact may establish the next plant anchor but cannot silently move an existing one.
- Contact state between important poses is derived, never guessed: planted/contact at both ends means that foot remains on one anchor for every interior frame; planted/contact to swing/airborne permits contact only at the start and every interior foot must clear the ground monotonically; swing/airborne to contact/planted permits contact only at the end and every prior interior foot must remain clear; airborne-to-airborne remains at least 12 px clear throughout. Any other state transition must be named by the action-class beat table or it fails. Interior support is recomputed from those two foot states, and the balance proxy must pass for that derived support on every baked frame.
- `support: both` requires both feet planted/contact; `left` or `right` requires that foot planted/contact and the other swing/airborne; `airborne` requires both feet airborne. `weightBias` must be center/left/right/airborne consistently.
- The balance proxy is `balanceX = (2*hip.x + neck.x + head.x) / 4`. Under double support it stays between the two foot anchors plus/minus 48 px. Under single support it stays within 96 px of the support foot. A left/right weight bias must put the proxy at least 24 px to that side of the foot midpoint; `center` stays within 24 px; airborne uses `airborne` only.
- Crouch/compression requires both feet fixed, hip Y at least 24 and at most 100 px lower than its comparison pose, and average straight hip-to-foot distance at least 24 px shorter. Extended takeoff increases that distance by at least 30 px from crouch before the feet release.
- Landing contact precedes compression. Compression begins 2..3 frames after contact, keeps both plant anchors within 2 px, lowers the hip 24..80 px, and bends both knees. Recovery ends within 4 px/3 degrees of the declared neutral/request-defined end.
- For known non-rotational actions, the unwrapped hip-to-neck segment may deviate at most 60 degrees from start and accumulate at most 90 degrees of total turn. This plus `allowsFullBodyRotation: false` rejects an undeclared flip even if action/event tags are falsified.

#### Exact 12-FPS sample allocations and action rules

Every required positive sample uses exactly 12 FPS, stays at or below the existing 24-frame cap, and ends on its last important pose. These indexes and profile lists are exact; changing one requires a spec correction, not a fixture-only judgment.

| Sample | Total frames; exact important-pose indexes | Exact ordered beats | Exact Phase 2.5 profiles |
| --- | --- | --- | --- |
| Wave, right arm | 18; `0,3,6,9,12,17` | `neutral, arm_raise, wave_extreme, wave_extreme, wave_extreme, neutral` | `ease_out, ease_in_out, ease_in_out, ease_in_out, ease_in_out` |
| Jump/hop | 18; `0,2,4,6,8,10,12,14,17` | `neutral, anticipation, takeoff, ascent, apex, descent, landing_contact, compression, recovery` | `ease_out, ease_in, ease_out, ease_out, ease_in, ease_in, impact, recovery` |
| Bow | 16; `0,3,6,8,12,15` | `neutral, hip_hinge, bow_bottom, settle, recovery, neutral` | `ease_in_out, ease_out, ease_in_out, ease_out, ease_in_out` |
| Dodge left | 15; `0,2,4,6,8,11,14` | `neutral, anticipation, push_off, dodge_extreme, settle, recovery, neutral` | `ease_out, ease_in, ease_in, ease_in_out, ease_out, ease_in_out` |
| Walk right | 24; `0,3,6,9,12,15,18,21,23` | `contact, down, passing, up, contact, down, passing, up, contact` | `ease_out, ease_in_out, ease_in, ease_out, ease_out, ease_in_out, ease_in, ease_out` |
| Run right | 19; `0,2,4,6,8,10,12,15,18` | `contact, compression, push_off, airborne, contact, compression, push_off, airborne, contact` | `ease_out, ease_in, ease_out, ease_in, ease_out, ease_in, ease_out, ease_in` |

The per-pose contact tuples are also exact. Tuple syntax is `leftFoot/rightFoot/support/weightBias/landingPhase`, in the same pose order as the table above:

| Sample | Exact ordered contact tuples |
| --- | --- |
| Wave | six times `planted/planted/both/center/none` |
| Jump/hop | `planted/planted/both/center/none`; `planted/planted/both/center/none`; `planted/planted/both/center/none`; `airborne/airborne/airborne/airborne/none`; `airborne/airborne/airborne/airborne/none`; `airborne/airborne/airborne/airborne/none`; `contact/contact/both/center/contact`; `planted/planted/both/center/compression`; `planted/planted/both/center/recovery` |
| Bow | six times `planted/planted/both/center/none` |
| Dodge left | `planted/planted/both/center/none`; `planted/planted/both/right/none`; `swing/planted/right/right/none`; `contact/swing/left/left/none`; `planted/contact/both/left/none`; `planted/planted/both/center/none`; `planted/planted/both/center/none` |
| Walk right | `contact/planted/both/right/none`; `planted/swing/left/left/none`; `planted/swing/left/left/none`; `planted/swing/left/left/none`; `planted/contact/both/left/none`; `swing/planted/right/right/none`; `swing/planted/right/right/none`; `swing/planted/right/right/none`; `contact/planted/both/right/none` |
| Run right | `contact/airborne/left/left/none`; `planted/swing/left/left/none`; `planted/airborne/left/left/none`; `airborne/airborne/airborne/airborne/none`; `airborne/contact/right/right/none`; `swing/planted/right/right/none`; `airborne/planted/right/right/none`; `airborne/airborne/airborne/airborne/none`; `contact/airborne/left/left/none` |

Right/left directions mirror X travel, dodge support sides, and gait lead/support sides without changing frame indexes, beat kinds, or profiles. An `in_place` action may translate the hip horizontally at most 12 px from its start except for the specified bow counter-shift; its final hip returns within 4 px. A named sample whose annotation differs from any exact tuple fails before baking.

Additional exact action checks:

- **Wave:** both feet/hip/knees and the non-active arm/head/neck stay within the purity tolerances; active-hand extreme-to-extreme horizontal travel is 80..280 px; three extremes alternate direction; start/end match neutral; there is no clap, hop, nod, shake, or extra action.
- **Jump/hop:** the first important pose is neutral, both feet remain planted through extended takeoff, ascent/descent are truly airborne, apex is the unique minimum hip Y, at most two consecutive baked frames are within 4 px of apex, and no more than seven consecutive baked frames are airborne. Landing/contact/compression/recovery follow in order. At normal pace, `takeoff.frameIndex - anticipation.frameIndex <= 2` and `landing_contact.frameIndex - ascent.frameIndex <= 6`. No arm wave, hover, long crouch, foot slide, nod, head shake, or unexplained action is allowed.
- **Bow:** both feet are planted for every frame. At bottom, torso lean is 25..60 degrees from upward vertical and the hip counter-shifts at least 20 px opposite the torso lean relative to the support midpoint. Bottom-to-settle lasts exactly two frames, changes torso angle by no more than 8 degrees and hip position by no more than 12 px, and return to neutral takes at least seven frames. There is no old 0.33-second half-compression.
- **Dodge:** anticipation shifts 12..48 px opposite the requested direction; the extreme moves the hip 120..280 px in the requested direction; the declared support transfers without plant slide. The first outbound hip gap after the maximum extreme is at most 50% of the largest inbound gap, the body stays within 32 px of maximum displacement through the settle beat, and final neutral is within 4 px/3 degrees. Reversal at maximum speed or after only one extreme frame fails.
- **Walk:** contact/down/passing/up/next-contact order is exact, contact sides alternate left/right/left, at least one foot supports every baked frame, planted contacts never slide beyond 2 px, and swing clearance is at least 8 px. For right travel, baked hip X may backtrack at most 2 px and net travel is 240..480 px; left mirrors the rule. Contact lead-foot order and single-support weight biases alternate with the legs.
- **Run:** contact/compression/push/airborne/next-contact order is exact, contact sides alternate, every airborne beat has both feet at least 12 px above ground, and each contact establishes the next plant without slide. Direction/net-travel rules match walk. Compression and push show visible weight before each flight; run cannot degrade to sliding walk.
- **Normal versus slow motion:** the six fixed samples above are `pace: normal` and must match their exact indexes. One technical-only 24-frame slow-motion hop uses `pace: slow_motion_explicit`, important frames `0,3,7,9,12,15,17,20,23`, the same jump/hop beat/contact order, and profiles `ease_out, ease_in, ease_out, ease_out, ease_in, ease_in, impact, recovery`; it limits airborne frames to ten and apex-near frames to three and passes. The byte-identical allocation relabeled `normal`, any normal sample stretched beyond its table, or any missing explicit slow-motion field fails.

#### General/original-plan structural case and honesty boundary

One technical-only `original` positive case uses `requestedAction: reach_up`, 13 frames at 12 FPS, important frames `0,3,7,10,12`, beats `neutral → anticipation → action_extreme → recovery → neutral`, profiles `ease_out, ease_in, ease_out, ease_in_out`, both planted feet, center support, no major event, no full-body rotation, and a finite declared arm/torso `jointMotion` set. It is not a hardcoded user recipe and never reaches chat or Terra. Mutating its action tag, beat order, contact, support, direction, timing, participation, or plan binding fails through the same validator used by the six named actions.

This case proves only that the shared contract/engine can accept a structurally valid non-catalog action without an executor branch for every possible verb. Later Terra or other planners create the original important poses and assert their structured intent/action tags. The local engine can validate digest binding, declared action purity, beat order, contacts, weight, balance, non-rotation, timing, geometry, and unexplained excursions; it does **not** semantically understand every possible original user request or guarantee that a dishonest original planner chose artistically correct poses. Phase 6/7 retain planner-quality, semantic, rendered-review, and Arthur-acceptance ownership.

#### Exact Phase 2.6 implementation ceiling

Only after every entry gate passes, one dedicated Plan-mode Spec Executor may change exactly these eight tracked paths:

```text
src/lib/ai/stickFigureActionFoundation.ts
src/lib/ai/stickFigureMotionEngine.ts
src/lib/ai/stickFigureCommandExecutor.ts
scripts/fixtures/spec0004-stick/v4/phase26-action-foundation-cases.json
scripts/spec0004-stick/phase26BrowserProof.ts
scripts/spec0004-stick/recordPhase26Proof.ts
scripts/spec0004-stick/validatePhase26Proof.ts
scripts/validateStickFigureActionFoundation.ts
```

Ignored proof artifacts may exist only under `output/spec-0004/phase-2.6/**`. The final accepted/published Phase 2.5 seven paths and manifest are read-only inputs except for the two runtime files explicitly shared above. Phase 1/2 fixtures, older proof, workspace/panel/UI, timeline/history/storage, Drawing, `app/api/ai/route.ts`, packages, lockfile, config, environment, public assets, canonical docs, and `project/project_structure.txt` are read-only. If a ninth tracked path is required, the executor stops for a spec correction. Recommended executor: `gpt-5.6-sol` at `xhigh`.

The new runtime module owns strict schema parsing and action/body validators. The motion engine may add only the contact-aware planted-foot/balance mechanics and post-bake validation needed by this contract while preserving Phase 2 and accepted Phase 2.5 entry points byte-for-byte in behavior. The transaction adds one separately named `phase-2.6-natural-action-foundation` materializer option that requires this complete contract, clones/freezes it before async work, preserves it through `fork()`, and rejects use with any older materializer. No action name may select an alternate executor; named-class rules are data/validation rules within the one shared engine.

#### Entry gate, proof manifest, and required command order

Phase 2.6 cannot start from current clean canonical `f131e75…` or directly from this dirty Phase 2.5 closeout worktree. Before any Phase 2.6 edit:

1. **Satisfied by D-0041:** Arthur/PM accept Phase 2.5 as the narrow timing/spacing primitive despite rejecting its natural-action samples.
2. **Satisfied by this closeout:** the Phase 2.5 Spec Executor is completely stopped; the Control Plane Architect took exclusive ownership, preserved every accepted technical byte, revalidated the manifest, completed control-plane/technical closeout, and stopped before publication.
3. **Still required:** GIT-037 publishes/integrates exactly the accepted Phase 2.5 seven paths plus the reviewed control-plane/tree paths, and records the final canonical-main commit with the accepted manifest SHA/size.
4. **Satisfied by D-0041, pending durable publication:** Arthur/PM approved and authorized this reviewed Phase 2.6 amendment. The current Control Plane Architect task does not start a Phase 2.6 executor.
5. Only after GIT-037, one fresh dedicated worktree starts in Plan mode from the then-current clean canonical `main`, with an empty index and no overlap with any other executor. The Phase 2.6 executor revalidates the accepted Phase 2.5 manifest and hashes, traces plan → action foundation → timing → contact-aware bake → transaction → ordinary editable frames, and confirms the eight-path ceiling.

The recorder writes `output/spec-0004/phase-2.6/proof-manifest.json`; the independent validator command is:

```bash
node --experimental-strip-types scripts/spec0004-stick/recordPhase26Proof.ts
node --experimental-strip-types scripts/spec0004-stick/validatePhase26Proof.ts --manifest output/spec-0004/phase-2.6/proof-manifest.json
```

The manifest must bind the exact accepted Phase 2.5 publication SHA and manifest SHA/size; exact Phase 2.6 base/HEAD/branch; empty index; exact eight dirty paths; every source/fixture/receipt/artifact SHA-256 and byte size; dense UTF-8/no-BOM/LF files; no symlink/hidden/duplicate/extra/missing/out-of-root path; both diff checks; and mutation self-tests that reject one-byte, status, base, command, count, field, tolerance, beat, contact, timing, digest, action-tag, network-ledger, or path changes.

Required evidence, in order, is:

1. Focused action-foundation validator: all named positive samples, tagged jump balance motion, the slow-motion hop, and the general original case; exact geometry/contact/weight/timing goldens; and every named negative below.
2. Accepted Phase 2.5 timing validator/manifest, Phase 2 motion validator, Phase 1 contract/transaction/UI/history/timeline/storage, published Phase 6 wave/typo behavior, SPEC-0002, SPEC-0003, and relevant Drawing protected checks.
3. Phase 2.6 browser automation for all six samples at required desktop/compact viewports; Preview/Cancel/failure no-op; one Apply; manual one-frame edit; Undo/Redo; Save/Open; Play/Pause; onion; Creator/Back; Drawing; no snap-back; no console/page error; zero provider/API/external request.
4. TypeScript; focused lint with zero findings in changed paths; measured full-lint base/result non-regression; `git diff --check`; `git diff --cached --check`; exact allowlist/index/Git checks; cleanup and manifest mutation tests.
5. Near the end, after the current Phase 2.6 runtime/browser proof is green, run the permanent `npm run test:spec0001-browser`. It must pass before any human review link is sent to Arthur. Then rerun the independent Phase 2.6 manifest validator against the still-live review evidence.

Required negative cases include missing/extra/reordered pose annotation; wrong version/project/transaction/plan/timing digest; malformed/duplicate/aliased/sparse/non-finite payload; unknown action/beat/contact/support/weight/mechanical-tie/profile; non-final last pose; wrong FPS/frame allocation; normal mislabeled slow timing; long crouch; more than allowed airborne/apex dwell; missing/reordered takeoff/contact/compression/recovery; false airborne or false planted contact; cumulative planted-foot slide; bad support/weight/balance; hip/torso/knee/landing failure; wrong direction/backtracking; non-alternating walk/run legs; run without flight; walk with flight; instant dodge reversal; bow without settle/counterbalance; unrequested `backflip`/`explosion`/event/action tag; pre-roll/post-roll extra action; undeclared joint excursion; `wave-with-clap`; `wave-with-hop`; `jump-with-wave`; `hop-with-head-nod`; `hop-with-head-shake`; and a mutated general-original contract. Every rejection must occur before Preview and prove byte-identical document/history/storage/latch/view state.

#### Arthur's required ordinary-app review

Only after all automated gates above pass, the executor provides six separate ordinary unpublished non-3000 loopback links: wave, jump/hop, bow, dodge, walk, and run. Each link is an isolated app copy showing only the normal Stick workspace, canvas, timeline, Preview/Cancel/Apply, and existing manual controls. There is no blue box, fixture picker, query/hash flag, overlay, special button/control, product route/import/asset, or permanent review code. Copies use isolated storage and never touch Arthur's normal port-3000 app or saved projects.

Arthur reviews exactly:

1. **Action purity:** wave begins/ends neutral and contains only the chosen arm wave—no clap, hop, nod, head shake, or pre/post gesture. Jump/hop begins neutral and has anticipation, grounded extension, brief flight/apex, contact, compression, and recovery—no wave/nod/shake. Natural symmetric arm motion supporting balance is acceptable.
2. **Weight/contact:** planted feet visibly stay planted; weight shifts over the declared support; bow hinges/counterbalances and settles at bottom; dodge anticipates, reaches a readable extreme without instant maximum-speed reversal, transfers support, and recovers; walk/run contacts alternate and run visibly leaves the ground.
3. **Timing/direction:** all six play naturally at 12 FPS with the exact beat allocation; no hover, long crouch, foot slide, wrong-way travel, backflip, explosion, or unexplained action appears.
4. **Human ownership:** Preview and Cancel change nothing. Apply one sample, edit one ordinary frame/joint, switch frames, Play/Pause, onion, Undo/Redo, Save/Open, Creator/Back, and confirm the edit persists while every unrelated frame stays unchanged and nothing regenerates/snaps back.
5. **Unrelated systems:** normal Home/New/Open, Stick shell/tools/timeline, Drawing, and the original deterministic wave presentation remain unchanged; no provider/API/external request or test UI appears.

Human review fails for any missing/reordered beat, action impurity, unexplained joint excursion, unstable non-participating joint, planted-foot drift over 2 px, false contact/airborne state, unsupported weight, long hover/crouch, weak landing compression, floating bow, instant dodge reversal, sliding gait, wrong direction, locked/shared/AI-only frame, tween/controller, snap-back/regeneration, malformed review copy, special tester UI, unrelated regression, or any external/provider/API request. Review servers remain live until Arthur accepts/rejects, then every copy/process/port is destroyed and excluded from publication.

**Stop boundary.** Phase 2.6 ends after one executor implements the exact eight paths, validates the manifest, provides the six review links, returns its Implementation Review Packet, and stops with an empty index. It performs no control-plane update, stage, commit, merge, push, publication, provider/API call, or later phase. No Phase 2.7 exists.

**Explicit non-goals.** No provider/Terra call; normal-chat or Pretend-AI routing; user-text interpretation; Task/Reasoning UI; background; layers; colors; custom rigs/shapes; multiple figures; variable FPS/duration/final-cap controls; sound; Drawing AI; post-Apply AI editing; dashboard/auth/billing/deployment; or publication. Phase 3 retains its published-spec ownership of broader variable FPS/duration/frame-cap and multiple-figure work.

### Phase 3 — Larger One-Layer Stick Scenes

**Scope.** Add multiple figures in the single existing layer and safe variable FPS/duration/frame count. Maintain white background, derived line heads, one-layer topology, and complete manual editability.

**Foundation entry gate.** The accepted Phase 2.5 timing primitive and Phase 2.6 action foundation must both be closed, published, and integrated first. Phase 3 may expand figure/count/FPS/duration bounds but may not weaken or fork their shared pose/timing/contact/weight/purity engine.

**Owner entry gate — final timeline cap.** Before implementation Arthur explicitly selects one final compatible maximum duration and frame count (and whether maximum FPS can make that duration exceed 100 frames). The recorded choice must resolve the five-second-at-24-FPS = 120-frame conflict; no engineer may infer “100 frames” as final. It also confirms the safe multi-figure/count/direction limits for the one-layer model.

**Visible review/proof.** A bounded multi-figure one-layer scene plays and remains manually editable; validators prove figure/layer ownership, no cross-figure aliasing, duration/FPS/frame cap, Save/Open, Undo/Redo, and all protected manual controls. No layer creation/removal or background work.

**Stop boundary.** Without the recorded Phase 3 cap/parameter decision, implementation does not start. This phase adds neither natural-language routing, Task/Reasoning UI, provider work, layer operations, nor backgrounds.

### Phase 4 — Free Recipe Understanding

**Scope.** Build the versioned parameterized $0 catalog for wave, jump, walk, run, punch, kick, turn, crouch, and nod; broad tested casual wording, safe defaults, negation, ambiguity handling, confidence decision, and exact free-versus-needs-Terra disposition. Every accepted complete recipe must emit one complete `stick.action-foundation/v1` object containing its important-pose annotations and nested accepted `stick.action-timing/v1` sidecar before local materialization. Preserve all current Phase 6 wave and approved typo behavior.

**Entry gate.** Phases 2.5, 2.6, and 3 are integrated; every catalog parameter, action beat, contact/weight declaration, purity tag, and timing-profile choice has an explicit supported range and safe response. Parameters incompatible with the actual one-layer/multi-figure limit are rejected/deferred, not quietly approximated. Recognition of “robotic,” “mechanical,” “constant pace,” or equivalent wording belongs here, not Phase 2.5/2.6, and may emit `mechanical_explicit` only on a complete safe match. Free recipes may not bypass the Phase 2.6 action-purity guard with recipe-specific executors.

**Exact fixture matrix.** Checked-in accepted/rejected cases cover each family; omission defaults (one centered figure, 24 FPS, normal speed, recipe-safe duration); direction/speed/FPS/duration/count where supported; synonyms; case/punctuation/spacing; common misspellings; `u`/`pls`/`idk`; “make him jump”; negated action such as “don’t wave”; collision/ambiguous wording; multi-action requests; oversize/malformed input; unsafe parameter; current Phase 6 wave typo fixtures; full local $0 success; no-safe-match/needs-Terra; and no-real-enabled unavailable. Each row states expected plan/disposition and asserts no partial output or accidental provider call.

**Visible review/proof.** The user sees a truthful complete local result or an honest unsupported/needs-real-AI result—never a claim that rules understand every human sentence. Fixtures prove the selected timing profile and baked spacing as well as the pose result. No paid/provider request or Terra connection occurs in this phase.

**Stop boundary.** The matcher may not silently loosen confidence, partial-match, or provider-hand-off behavior to improve apparent coverage. Terra remains unavailable unless its distinct Phase 6 gate is later satisfied.

### Phase 5 — Stick Generate Frames UI and Fake End-to-End Provider

**Scope.** Make **Task: Generate Frames** work through the full free/fake-Terra safe routing and one-time Preview / Apply / Cancel path. Add selectable Low/Medium/High/Extra High Reasoning UI that is explicitly inert. Keep Generate Plans/Sounds/Other absent or unavailable and expose no Mode chooser.

**Entry gate.** Phase 4 routing/fixture matrix is integrated; product copy, accessibility labels, fake response schema, and fake-route network ledger are exact. The Fake Terra path cannot make a real network/provider request.

**Visible review/proof.** Real browser flows exercise free recipe, fake original-needed result, Preview/Cancel/Apply, error/no-op, consumed-project manual-tools response, all Reasoning selections producing byte-identical routing/settings/output, and unavailable non-Generate-Frames tasks. The proof asserts no visible Mode and no paid/provider request.

**Stop boundary.** The fake end-to-end path has no credential, real model client, or production behavior. It may not make Reasoning functional, expose a Mode, or add post-Apply AI editing.

### Phase 6 — Terra Original-Creation Connection

**Scope.** Connect intended GPT-5.6 Terra behind server-only, off-by-default policy. Accept only strict structured plan/tool data and compact validated project context. Every accepted original plan must emit the same complete `stick.action-foundation/v1` object, including its nested accepted `stick.action-timing/v1` sidecar, used by free recipes and Phase 2.6 before local baking. Terra may create original important poses, but it may not bypass local intent-purity/contact/weight/timing validation, return raw executable code, use a separate animation format, or supply an unbounded curve. Disable search/RAG and all tools except the exact app plan functions. Bound request/output bytes, deadline, concurrency, retries, and no-post-Apply behavior. Never auto-switch to Luna or Sol.

**Paid-provider entry gate.** Before any configuration or live request, the owner/PM records fresh same-day official OpenAI-source verification of the exact available Terra alias, pricing, retention/privacy terms, budget/cost basis, and explicit live-request authorization. It defines server credential custody, request caps, expected failure/no-op behavior, and the separate proof authorization. Without every item, retain fake/unavailable behavior and do not instantiate a provider client.

**Visible review/proof.** Offline structured-output, timing-contract validation, redaction, invalid/refusal/timeout/stale/over-budget/no-op, route isolation, and network-denial proof pass first. Natural-language recognition of a request for robotic/constant pace belongs to this Terra phase and must emit only the explicit bounded `mechanical_explicit` contract. A paid real call, if later explicitly authorized, is separate from this phase's ordinary offline proof and must obey the recorded one-use/budget policy. No follow-up AI editing.

**Stop boundary.** No request may be rerouted to Luna/Sol or retried outside the approved policy. No production rollout, cost-dashboard claim, image-review repair, or post-Apply edit is included.

### Phase 7 — Render, Check, and One Pre-Apply Repair

**Scope.** Render/play a temporary candidate, run mechanical and visual quality checks, and allow at most one bounded Terra image-review correction before first Apply. The correction remains inside the original one-time transaction.

**Owner entry gate.** Arthur confirms the benchmark test environment, first-preview time measurement target, exact original representative scene variants, final quality rubric, and the side-by-side comparison method. The gate explicitly distinguishes mechanical pass from Arthur's aesthetic acceptance and defines the maximum one repair call within the approved Phase 6/8 budget policy.

**Visible review/proof.** Representative original and multi-figure animations show selected rendered frames and playback: readable action, no unrequested prelude/extra/postlude action, declared support and visible weight, no planted-foot slide, no broken body, smooth meaningful in-betweens, realistic intentional timing/spacing rather than accidental constant pace, white/one-layer constraints, bound timing, one repair maximum, no human view-state toggles, and manual editability after Apply. Arthur records accept/reject of the quality/speed comparison; a rejection returns to a separately authorized correction phase.

**Stop boundary.** A second repair, an unchecked rendered result, a claim of professional/faster quality without Arthur's acceptance, or any post-Apply AI refinement fails this phase.

### Phase 8 — Cost, Privacy, Abuse Protection, and Release

**Scope.** Make the existing development/owner-only AI-cost dashboard accurately track Stick/Terra actual and estimated usage plus $0 free recipes; add Terra pricing only after same-day official verification; enforce daily/request/token/call caps, auth/rate-limit/credits policy as required; adopt safe non-raw logs and retention/privacy decisions; and complete production release gates.

**Entry gate.** Arthur/PM accepts exact current price source/date, cost/caps/credit policy, privacy/retention/logging/data-minimization policy, auth/rate-limit/abuse controls, dashboard access restriction, and production criteria. Existing dashboard values are not presumed correct for Stick/Terra.

**Visible review/proof.** The private dashboard truthfully distinguishes actual from estimate and $0 from paid use, shows no raw secrets/prompts/plan bodies beyond approved redaction, and remains inaccessible as a public/Home product feature. Cap/refusal/abuse/privacy tests pass; production release requires Arthur's final quality/speed acceptance and all earlier regression/evidence gates. The removed Home AI Credits card stays removed.

**Stop boundary.** Do not release, expose the dashboard, set price/caps from stale information, or represent estimated usage as actual until every Phase 8 owner/release gate is accepted and verified.

## 9. Cross-phase verification and lifecycle

Every implementation phase begins in Plan mode, re-runs the repository boot sequence, traces the live path, uses a dedicated exclusive worktree, and creates independently validated technical proof. It must run the phase-specific contract/unit/fixture checks, relevant existing Stick regressions, real-browser flows at required viewports, network/provider denial where applicable, lint/type/diff checks, manifest validation, and final scope/index/Git checks.

The Spec Executor stops after its Implementation Review Packet with no control-plane docs or Git publication. After Arthur/PM acceptance and executor shutdown, a Control Plane Architect separately takes ownership, verifies exact evidence and allowlist, updates the canonical records, and stops before publication. A later explicit publication task alone may stage the reviewed paths, commit, integrate, push, and verify synchronization.

## 10. Decision-complete now vs later gates

### Decision-complete now

- Stick-only scope; one-time eligible-fresh creation; durable post-Apply no-AI lock; Preview/Apply/Cancel/history/storage/manual-edit guarantees.
- White background, one existing layer, derived horizontal line head, human Play/Pause/onion protection, and all listed non-goals.
- Phase ordering; exact Phase 1 language/bounds/fixtures/proof/allowlist; exact Phase 2 baked independent-frame ownership/body normalization/local smoothstep foundation; exact Phase 2.5 timing schema and narrow primitive; and exact Phase 2.6 `stick.action-foundation/v1` schema, action-purity/contact/weight/body/timing rules, fixed wave/jump/bow/dodge/walk/run allocations, original structural case, proof matrix, eight-path ceiling, six-link ordinary-app review, and no-provider/non-goals boundary. Phase 4 catalog families/routing rules, UI behavior, Terra intended role/no auto-switch, quality evidence shape, and private dashboard boundary remain recorded.
- The old Phase 7 retirement and Phase 6 wave protection.

### Deliberately later, named owner gates

- Phase 2.5 publication: GIT-037 must publish/integrate the exact accepted timing-only bytes and manifest together with this reviewed control-plane amendment. Its rejected sample-naturalness claims remain rejected.
- Phase 2.6 execution: D-0041 supplies the explicit authorization, but no executor may start until GIT-037 durably publishes/integrates the accepted Phase 2.5 result and this amendment into clean canonical `main`.
- Phase 3: compatible final duration/frame/FPS ceiling and bounded multi-figure parameter support.
- Phase 6: same-day official Terra alias/pricing/retention/privacy facts, budget/caps, credential custody, and explicit paid/live request authorization.
- Phase 7: quantitative first-preview benchmark/test environment, final original-scene review matrix, quality rubric, comparison protocol, and single-repair budget consent.
- Phase 8: final cost/credit/auth/rate-limit/privacy/retention/logging/release policy and dashboard access terms.

These gates block only their affected later phase; no implementation task may fill them in by assumption. Phase 2.5's exact result is accepted and technically Verified but not published. Phase 2.6 is Approved/Authorized/Not started and remains entry-gated until GIT-037 satisfies every remaining prerequisite in its section.

## 11. Handoff

Phase 1 is Verified, published, and integrated in exact 28-path commit `086420e6b0cbe683adbb8f0024e65a2fc1d68d6d`. Phase 2 is Verified, published, and integrated in exact 20-path commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. GIT-033 through GIT-036 are complete. D-0040's Phase 2.5 activation is published in exact 11-document commit `a755f892d7737c6a10d9c381ec59c1e2fdba4d47`. D-0041 accepts the later seven-path result at base/HEAD `f131e75aafccec0d1b8ecb717e2d95b518355d39` narrowly as the timing/spacing primitive; its 14,601-byte manifest SHA-256 is `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1`. The old samples remain rejected as natural-action evidence. Phase 2.6 is decision-complete and Approved/Authorized/Not started under D-0041. Phases 3–8 remain unauthorized, and no Phase 2.7 exists.

The exact next lifecycle action is GIT-037: separately publish/integrate the frozen seven accepted Phase 2.5 technical paths plus the reviewed control-plane/tree paths from this CPA packet. Only after GIT-037 may one fresh Plan-mode Phase 2.6 Spec Executor start from the then-current clean canonical `main` under D-0041 and change only its exact eight-path ceiling. No Phase 2.6 implementation starts in this closeout. No provider/API/paid work, deployment, Phase 3 work, Phase 2.7, or blue/special review UI is authorized.
