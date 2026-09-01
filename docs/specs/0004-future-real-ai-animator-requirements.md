# SPEC-0004 — One-Time Stick Figure AI Animator

Status: **Approved for Phase 1 only — Authorized; Not started.** Phases 2–8 remain unauthorized.

Owner: Arthur
Spec role: Spec Architect
Created: 2026-08-31
Last updated: 2026-09-01
Decision links: [D-0033, D-0034, and D-0035](../DECISIONS.md)
Control-plane anchor: clean canonical-main basis `a853bf96f193b1e4ae297dc8e76c4fceb485612c`
Related work: [`TODO SPEC-004`](../TODO.md), [`Current State`](../CURRENT_STATE.md), [`Session Handoff`](../SESSION_HANDOFF.md)

> **Authorization boundary.** D-0035 approves and authorizes **only Phase 1**. It authorizes one later, separate Phase 1 Spec Executor to implement exactly the Phase 1 scope and allowlist after re-verifying a then-clean canonical-main basis, empty index, and exclusive dedicated worktree. It authorizes no product code in this control-plane task, no provider/API/key use, paid request, deployment, or work in another worktree. Phases 2–8 each need their own separate authorization after the preceding phase is accepted, integrated, and recorded.

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
| `src/lib/stickfigure/stickProjectHistory.ts`, `src/lib/stickProjectStorage.ts` | The visible fresh starter and local history/storage are explicit. Current first-wave eligibility is document/history based; Save/Open and Undo/Redo are available. | Phase 1 adds a durable one-time-creation latch that survives Save/Open and does not become undoable, while the animation document itself stays one atomic undoable action. |
| `src/components/workspace/stickfigure/StickFigureWorkspace.tsx`, `stickFigureAiWorkspaceAdapter.ts` | The adapter captures project/revision/digest/workspace binding and rejects stale or playing state; normal human Play/Pause remains workspace-owned. | AI work must not toggle unrelated human view state. Temporary creation preview may render/play only inside its own check flow before Apply. Human onion skin remains unchanged and AI onion control is out of scope. |
| `src/lib/ai/stickFigureAiAvailability.ts` | `DIAMOND_STICK_AI_V1_MODE` is a hidden server/development availability idea (`off`, `mock`, `live`), never a user chooser. | It is not a product Mode and must not be exposed. Future free-versus-Terra routing is internal and policy-gated. |
| `src/components/workspace/ai/*` and Drawing AI paths | Drawing has its own Task and Reasoning UI and provider behavior. | Drawing is expressly out of scope. Its UI, model settings, routing, storage, and behavior must not be copied or changed by this spec. |

The currently published Phase 6 wave, including its approved typo behavior, is a protected regression. It remains usable as the baseline deterministic result until a later accepted phase deliberately replaces its internal implementation without changing its accepted visible/manual safety guarantees.

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
- Higher FPS alone does not make animation smooth. Smoothness requires meaningful intermediate poses, body-safe motion, timing/easing/arcs, and visible playback review; this begins in Phase 2.
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

## 8. Eight-phase delivery plan

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

### Phase 2 — Pose and Smooth Motion Engine

**Scope.** Add body-length/rig constraints, readable-key-pose rules, safe interpolation/in-betweens, easing, arcs, timing, and smooth playback while keeping key poses and generated content manual-editable. Smoothness is based on meaningful motion between poses, not an FPS increase alone.

**Entry gate.** Phase 1 is Verified, published, and integrated; no Phase 1 fixture/transaction/manual-edit regression is open. The phase defines measurable body/pose/timing validators and deterministic interpolation inputs before implementation.

**Visible review/proof.** Arthur can review the Phase 1 fixture plans played with editable key poses and inspect in-betweens. Deterministic tests cover body lengths, joint/segment topology, bounds, interpolation/easing/arc limits, timing, holds, playback, manual key-pose edits, undo/redo, and no generated locked data. No language/model route is added.

**Stop boundary.** No free matcher, Task/Reasoning UI, Terra, multiple figures, background, layer management, provider/cost work, or AI editing.

### Phase 3 — Larger One-Layer Stick Scenes

**Scope.** Add multiple figures in the single existing layer and safe variable FPS/duration/frame count. Maintain white background, derived line heads, one-layer topology, and complete manual editability.

**Owner entry gate — final timeline cap.** Before implementation Arthur explicitly selects one final compatible maximum duration and frame count (and whether maximum FPS can make that duration exceed 100 frames). The recorded choice must resolve the five-second-at-24-FPS = 120-frame conflict; no engineer may infer “100 frames” as final. It also confirms the safe multi-figure/count/direction limits for the one-layer model.

**Visible review/proof.** A bounded multi-figure one-layer scene plays and remains manually editable; validators prove figure/layer ownership, no cross-figure aliasing, duration/FPS/frame cap, Save/Open, Undo/Redo, and all protected manual controls. No layer creation/removal or background work.

**Stop boundary.** Without the recorded Phase 3 cap/parameter decision, implementation does not start. This phase adds neither natural-language routing, Task/Reasoning UI, provider work, layer operations, nor backgrounds.

### Phase 4 — Free Recipe Understanding

**Scope.** Build the versioned parameterized $0 catalog for wave, jump, walk, run, punch, kick, turn, crouch, and nod; broad tested casual wording, safe defaults, negation, ambiguity handling, confidence decision, and exact free-versus-needs-Terra disposition. Preserve all current Phase 6 wave and approved typo behavior.

**Entry gate.** Phase 3 is integrated; every catalog parameter has an explicit supported range and safe response. Parameters incompatible with the actual one-layer/multi-figure limit are rejected/deferred, not quietly approximated.

**Exact fixture matrix.** Checked-in accepted/rejected cases cover each family; omission defaults (one centered figure, 24 FPS, normal speed, recipe-safe duration); direction/speed/FPS/duration/count where supported; synonyms; case/punctuation/spacing; common misspellings; `u`/`pls`/`idk`; “make him jump”; negated action such as “don’t wave”; collision/ambiguous wording; multi-action requests; oversize/malformed input; unsafe parameter; current Phase 6 wave typo fixtures; full local $0 success; no-safe-match/needs-Terra; and no-real-enabled unavailable. Each row states expected plan/disposition and asserts no partial output or accidental provider call.

**Visible review/proof.** The user sees a truthful complete local result or an honest unsupported/needs-real-AI result—never a claim that rules understand every human sentence. No paid/provider request or Terra connection occurs in this phase.

**Stop boundary.** The matcher may not silently loosen confidence, partial-match, or provider-hand-off behavior to improve apparent coverage. Terra remains unavailable unless its distinct Phase 6 gate is later satisfied.

### Phase 5 — Stick Generate Frames UI and Fake End-to-End Provider

**Scope.** Make **Task: Generate Frames** work through the full free/fake-Terra safe routing and one-time Preview / Apply / Cancel path. Add selectable Low/Medium/High/Extra High Reasoning UI that is explicitly inert. Keep Generate Plans/Sounds/Other absent or unavailable and expose no Mode chooser.

**Entry gate.** Phase 4 routing/fixture matrix is integrated; product copy, accessibility labels, fake response schema, and fake-route network ledger are exact. The Fake Terra path cannot make a real network/provider request.

**Visible review/proof.** Real browser flows exercise free recipe, fake original-needed result, Preview/Cancel/Apply, error/no-op, consumed-project manual-tools response, all Reasoning selections producing byte-identical routing/settings/output, and unavailable non-Generate-Frames tasks. The proof asserts no visible Mode and no paid/provider request.

**Stop boundary.** The fake end-to-end path has no credential, real model client, or production behavior. It may not make Reasoning functional, expose a Mode, or add post-Apply AI editing.

### Phase 6 — Terra Original-Creation Connection

**Scope.** Connect intended GPT-5.6 Terra behind server-only, off-by-default policy. Accept only strict structured plan/tool data and compact validated project context. Disable search/RAG and all tools except the exact app plan functions. Bound request/output bytes, deadline, concurrency, retries, and no-post-Apply behavior. Never auto-switch to Luna or Sol.

**Paid-provider entry gate.** Before any configuration or live request, the owner/PM records fresh same-day official OpenAI-source verification of the exact available Terra alias, pricing, retention/privacy terms, budget/cost basis, and explicit live-request authorization. It defines server credential custody, request caps, expected failure/no-op behavior, and the separate proof authorization. Without every item, retain fake/unavailable behavior and do not instantiate a provider client.

**Visible review/proof.** Offline structured-output, redaction, invalid/refusal/timeout/stale/over-budget/no-op, route isolation, and network-denial proof pass first. A paid real call, if later explicitly authorized, is separate from this phase's ordinary offline proof and must obey the recorded one-use/budget policy. No follow-up AI editing.

**Stop boundary.** No request may be rerouted to Luna/Sol or retried outside the approved policy. No production rollout, cost-dashboard claim, image-review repair, or post-Apply edit is included.

### Phase 7 — Render, Check, and One Pre-Apply Repair

**Scope.** Render/play a temporary candidate, run mechanical and visual quality checks, and allow at most one bounded Terra image-review correction before first Apply. The correction remains inside the original one-time transaction.

**Owner entry gate.** Arthur confirms the benchmark test environment, first-preview time measurement target, exact original representative scene variants, final quality rubric, and the side-by-side comparison method. The gate explicitly distinguishes mechanical pass from Arthur's aesthetic acceptance and defines the maximum one repair call within the approved Phase 6/8 budget policy.

**Visible review/proof.** Representative original and multi-figure animations show selected rendered frames and playback: readable action, no broken body, smooth meaningful in-betweens, white/one-layer constraints, bound timing, one repair maximum, no human view-state toggles, and manual editability after Apply. Arthur records accept/reject of the quality/speed comparison; a rejection returns to a separately authorized correction phase.

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
- Phase ordering, exact Phase 1 language/bounds/fixtures/proof/allowlist, Phase 4 catalog families/routing rules, UI behavior, Terra intended role/no auto-switch, quality evidence shape, and private dashboard boundary.
- The old Phase 7 retirement and Phase 6 wave protection.

### Deliberately later, named owner gates

- Phase 3: compatible final duration/frame/FPS ceiling and bounded multi-figure parameter support.
- Phase 6: same-day official Terra alias/pricing/retention/privacy facts, budget/caps, credential custody, and explicit paid/live request authorization.
- Phase 7: quantitative first-preview benchmark/test environment, final original-scene review matrix, quality rubric, comparison protocol, and single-repair budget consent.
- Phase 8: final cost/credit/auth/rate-limit/privacy/retention/logging/release policy and dashboard access terms.

These gates do not block the complete Phase 1 proof because it is local, fixed-fixture, single-figure, small-bound, and provider-free. They do block the affected later phase; no implementation task may fill them in by assumption.

## 11. Handoff

Status is **Approved for Phase 1 only — Authorized; Not started.** Phases 2–8 remain unauthorized.

The next work is one separate Phase 1 Spec Executor task, starting in Plan mode from a freshly verified clean canonical-main SHA, empty index, exclusive dedicated worktree, and this unchanged Phase 1 boundary. It may implement only Phase 1; it must not start Phases 2–8. No provider, API key, paid proof, deployment, staging, commit, push, merge, or publication is authorized for that executor.
