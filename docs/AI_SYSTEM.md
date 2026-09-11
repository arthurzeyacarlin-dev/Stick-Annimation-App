# AI System Snapshot

Status: canonical current AI architecture and gap map
Last traced: published v2 safety evidence retained from 2026-09-08; canonical source seam rechecked read-only on 2026-09-09 at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`. No runtime change. SPEC-0005 Phase 1 and Phase 2 v1/v2 remain accepted, Verified, published, and integrated; v2 is complete at GIT-048 `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`. GIT-049 published the later Phase 3 authorization at `de54aed275c2f6da6e7c3f4a7f65091e8d5370c0`. A Phase 3 executor then ran, but Arthur rejected its visible result: it is unpublished, unaccepted, non-reusable, and not completed. D-0055 supersedes Phase 3 and unfinished Phases 4–8 by future SPEC-0008; they are inactive with no implementation authority.

## Planning-only transition (D-0055)

SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. Phase 2.6 remains rejected, unpublished, and superseded historical evidence. Under D-0055, unfinished Phases 3–8 are Superseded by future SPEC-0008, inactive, and must not be implemented.

Current lifecycle update (D-0062): SPEC-0006 Phases 1–3 are Verified/published/integrated through GIT-054 `e11f6c453f13772ee9bd4b172a17bc68e1de65b9`. Arthur rejected the former Phase 4 typed-layer result; it remains unpublished and non-reusable. D-0062 corrects the same spec to neutral layers with ordered typed items in the same cell. Seven numbered phases remain; corrected Phase 4 has internal 4A (12 paths, model/read migration/minimal repository) then 4B (24 paths, ordinary neutral New/Open, controlled item editing, shared history/render/timeline/playback/onion), ending in one visible Phase 4 review. Correction implementation is not started. No AI model/prompt/provider/generation/motion/video/tracking/API code change or paid/external request is part of this correction. Manually seeded MIXED artwork remains test-only; ordinary New must create no scene. Existing eligible Drawing/Stick AI contracts, project-bound latch and disabled exits stay protected. “Share” adds no cloud/social feature.

## What Exists Today

Diamond Animator currently uses a hybrid drawing-workspace path. Deterministic request analysis can ask for clarification, return a controlled failure, or produce an eligible frame plan directly; requests routed to the structured-model branch use the OpenAI Responses API and recovery paths. Validated plans become deterministic browser-side Canvas2D operations.

The Stick workspace separately has the published deterministic Phase 6 wave chat and published SPEC-0004 Phase 1 engine. Phase 1 adds a strict local action-neutral plan/executor for fixed wave, jump, bow, and dodge fixtures, isolated Preview/Cancel, one atomic Apply, a durable project latch, and continued manual editability. It does not add broad natural-language matching, Terra, a provider/API call, or a user-visible fixture picker.

GIT-035 published D-0039's exact Phase 2 result in commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. Phase 2 normalizes the unchanged fixed plans' important poses, creates deterministic cubic-eased shortest-turn in-betweens, and bakes every output slot into its own ordinary Stick keyframe before Preview. It deliberately adds no natural-language route, recipe catalog, Terra/provider/API call, working Task/Reasoning control, or normal visible UI. Phase 1 remains the default transaction behavior unless the separately named Phase 2 materializer is selected.

D-0041 accepts the exact seven-path Phase 2.5 result as the shared timing/spacing primitive only. Its strict plan-bound sidecar supplies one supported profile for each adjacent important-pose transition: acceleration/ease-in, deceleration/ease-out, natural ease-in-out, explicit-mechanical constant, or paired impact/recovery. The 14,601-byte manifest at SHA-256 `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1` passed 250 independent checks, and GIT-037 published the exact result in `16799539fb7db31e345a878aa892d4485115188b`. The old review samples are not accepted natural-action evidence: their action poses, frame allocations, contact, and weight were wrong even though the timing formulas passed.

The later unpublished SPEC-0004 Phase 2.6 result is rejected and not current runtime truth. It validated action-specific `stick.action-foundation/v1` data around complete raw coordinate recipes; Arthur rejected the visible motion even though the technical manifest was green. D-0043 superseded its intended job with SPEC-0005. D-0044's published Phase 1 adds only the independent proof gate. GIT-040 published D-0045's first former Phase 2 authorization in `b5ddd5e3f4fb3b19e5c7c2be8a1bd35b0f8d6070`, but Arthur rejected that executor's visible result; none of its code/proof was accepted, propagated, committed, published, or integrated, and its disposable app/worktree was removed.

GIT-043 published the exact accepted 21-path Phase 2 v1 package at `e524543…`. Checked immutable important-pose selection receives no final frames/document; final completion recomputes binding/selection and validates every rounded/post-repair frame and semantic continuity; exactly one motion-engine candidate door may expose Preview. That finite numeric contract remains current code, but it does not prove body-local anatomical direction or natural pose quality.

GIT-044 published the former Phase 3 authorization at exact docs-only commit `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`. Arthur rejected its executor result; alternate screen-space IK, broad flexion limits, shallow candidate ranking, key-step stops, raised recovery, and reach-like gesture are binding negative evidence. GIT-045 published D-0050's first Phase 2 v2/Phase 3 correction at exact 13-document commit `a4589664b6857eb10a828189e177e0e7d47e3f69`. D-0051 corrects only its incomplete single-state goal/start gate; v2 is Verified, published, and integrated through GIT-048 at `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`, and SPEC-0005 Phase 3 ran after GIT-049 but was rejected/unpublished; D-0055 supersedes unfinished Phases 3–8 by future SPEC-0008 with no implementation authority. None of the rejected executor's bytes is accepted or reusable.

There is no custom-trained Diamond Animator LLM, fine-tuning pipeline, embeddings system, vector database, or model-serving stack in this repository.

Files named “training” contain hand-authored prompt/reference examples used for selection and in-context guidance. They must not be described as a trained model or dataset without qualification.

## Current Model Profiles

`src/lib/openai/generateAiText.ts` currently defines:

| Profile | Model ID in source | Intended role |
| --- | --- | --- |
| Strong | `gpt-5.4` | Highest-complexity reasoning/output |
| Balanced | `gpt-5.3-chat-latest` | Mid-tier work |
| Economy | `gpt-5.2` | Lower-cost work |

On the structured-model branch, Generate Frames chooses among profiles based on analyzed complexity and can use recovery/escalation paths. There is no approved product budget that defines when escalation is acceptable.

## Contract Taxonomy

Canonical code contract in `src/lib/ai/drawingAiContract.ts`:

- workspace types: `drawing`, `stick-figure`, `other`
- task types: `generate-plans`, `generate-frames`, `generate-sounds`, `other`
- conversation mode: `chat`
- structured response fields for questions, generated-frame plans, sound options, action plans, memory, and commands
- engine command/action types intended to connect AI decisions to real workspace behavior

The contract can describe more actions than the current enabled executor paths support. A future spec must publish an explicit command-to-executor support matrix.

Historical unimplemented Stick contract under superseded SPEC-0005 Phases 3–8 (not current runtime, not implementation authority, and not an approved SPEC-0008 contract):

- `stick.movement-goal/v1` is the only future planner-to-motion-engine object and is one bounded ordered semantic sequence;
- it contains exact project/transaction/base-pose binding, frame/FPS/style limits, one through eight requested parts, two through twelve complete per-landmark facing/support/foot-hand-pelvis contact/root/torso/head/four-limb states, adjacent transitions, active-part overlap, required outcomes, forbidden extras, and exact hold/return/continuation completion;
- it rejects raw joint points, stored angles, executable code, arbitrary curves, unknown fields, and planner-specific animation formats;
- Pretend AI and the provider-free Terra-shaped adapter must canonicalize the same complete bounded sequence to the same digest and may not flatten it or select different engines;
- the local engine alone creates complete ordinary editable keyframes, and all temporary planning/mechanics data is discarded before Preview.
- Phase 2 v2 must qualify action-independent body-local plane/bend/context-transition safety across every facing/contact/base/role context and final rounded frame before exactly one Preview door, with no injury/deformation bypass and zero false accepts/rejects; Phase 3 must enumerate bounded grounded compound whole-body candidates, hard-filter safety first, then rank safe complete sequences by prompt match, comfort, line of action, balance, silhouette, continuity, and minimum unrequested movement; no planner or legacy materializer may bypass those gates.

## Drawing Workspace Task Availability

| Task | Reference/prompt/runtime code | Current execution |
| --- | --- | --- |
| Generate Plans | Present | Temporarily disabled |
| Generate Frames | Present | Enabled |
| Generate Sounds | Present, including synthesis/orchestration | Temporarily disabled; both sound flags false |
| Other | Present, including workspace actions | Temporarily disabled |

The code default is Generate Plans, which conflicts with the enabled matrix; a persisted user selection can override it. A fresh drawing workspace therefore presents a disabled mode first until the user selects Generate Frames.

The Stick Figure Workspace no longer mounts the Drawing panel read-only. Its published Phase 6 panel provides only the bounded deterministic wave flow. The published SPEC-0004 Phase 1 engine sits behind fixed developer-proof fixtures and is not yet normal broad Generate Frames chat; this Drawing availability table still must not be read as a Stick capability matrix.

## Stick One-Time Creation Engine

The accepted SPEC-0004 Phase 1 path is fully local and provider-free:

```text
fixed checked-in wave/jump/bow/dodge plan
  → strict plan validation against the exact fresh Stick starter
  → action-neutral plan executor
  → isolated editable candidate
  → Preview / Cancel or one atomic Apply
  → durable project-bound consumed latch
  → normal manual editing, Undo/Redo, and Save/Open
```

The plan language permits only `set_timing`, complete 11-joint `create_key_pose`, contiguous `hold_pose`, and `finish`, with one figure, one layer, 8–24 frames, and 12 or 24 FPS. The same executor handles all four fixtures without an action-name branch. After Apply, the latch blocks further AI creation even after Undo and the panel returns `AI editing comes later; use manual tools.` without executor or provider work.

The accepted browser proof used a blue fixture picker injected into an isolated temporary app copy. It is technical proof only: no product route, product overlay, public asset, user Mode, API request, provider call, or paid request was added. Broader chat matching in unfinished SPEC-0004 is superseded by future SPEC-0008 under D-0055; no such implementation is authorized.

Phase 2's private review followed the stricter rule: Arthur saw four separate disposable loopback copies/links preloaded with wave, jump, bow, and dodge one at a time and only the ordinary Stick canvas, timeline, AI transaction area, and manual tools. No query-controlled review surface, tester overlay/control, product route, public asset, or review import was added. The temporary review servers are stopped and their isolated copies are removed.

Published Phase 2.5 keeps Phase 1 and Phase 2 behavior as defaults. Rejected SPEC-0004 Phase 2.6 and rejected SPEC-0005 motion results remain unavailable. SPEC-0005 Phase 1 is published proof infrastructure, and Phase 2 v1's numeric safety foundation is published/integrated at `e524543…`; no normal route invokes it and no planner door exists. GIT-045 is published at `a4589664…`; corrected Phase 2 v2 is Verified, published, and integrated through GIT-048 at `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`. SPEC-0005 Phase 3 was implemented in a separate copy after GIT-049 but rejected by Arthur and never accepted/published/integrated. D-0055 supersedes unfinished Phases 3–8 by future SPEC-0008; there is no implementation authority.

## Generate Frames Execution Path

```text
DrawingAiPanel
  → POST /api/ai
    → task/context normalization and deterministic analysis/search decision
      ├─ clarification or controlled failure without a model call
      └─ plan-producing path
          ├─ eligible direct deterministic runtime plan
          └─ reference/model selection → structured OpenAI response/recovery
        → validation/normalization/fallback → generatedFramePlan
  → drawingFrameExecutor in the browser
  → deterministic Canvas2D frame payloads
  → DrawingWorkspace timeline insertion
```

The renderer uses a finite code-defined vocabulary of subjects, props, actions, poses, effects, and scene composition. Quality depends on deterministic analysis/render coverage and, on the model branch, structured model planning. No paid live request was made during this audit.

AI panel messages and follow-up state exist only in React state for the mounted session. Persisted control preferences and compact animation-project AI memory are separate mechanisms. The Drawing Workspace action-plan executor supports only `save-project`, `export-current-frame`, and `attach-sound-option-to-frame`; other action types in the broader contract currently return `false`.

## Prompt and Reference Assets

Counts observed during the 2026-08-09 audit:

| Asset | Version/content | Current role |
| --- | --- | --- |
| `plansTraining.ts` | v10; 63 examples: 41 active positive, 22 inactive negative | Generate Plans references; optional Supabase retrieval; task disabled |
| `DrawingWorkspaceTask_GenerateFrames.ts` | v2; 68 examples: 47 positive, 21 negative | Imported by the enabled drawing path; code verified, no paid live call run |
| `framesTraining.ts` | v1; 24 examples; no importer found | Stale duplicate candidate; not authoritative |
| `DrawingWorkspaceTask_GenerateSound.ts` | v4; 82 examples plus 6 intent examples | Sound reference library; task disabled |
| `DrawingWorkspaceTask_Other.ts` | v4; 20 examples plus 17 routing examples | Other-task reference library; task disabled |
| `DREAM_100_LIST_FORMATTED.xlsx` | 105 non-empty worksheet rows: 1 header plus 104 research entries; not imported by code | Non-authoritative market-research archive candidate |
| `DREAM_100_LIST_UPDATED.xlsx` | Same normalized non-empty cell content as formatted workbook | Superseded duplicate candidate |

Do not delete duplicate candidates without a separate reviewed cleanup task.

## Animation-Project Memory

`DrawingAiProjectMemory` stores semantic context for one user animation project: goals, story/scene context, continuity, frame state, and related facts. Code can inject it into later prompts and attempt optional sync through `/api/drawing-project-ai-memory`; no live remote synchronization was proven in this audit.

This is runtime user-project memory. It is not repository development memory and does not replace this control plane.

The Supabase table needed by that route has no migration in the repository. Its proposed SQL appears only in a route comment, so a fresh environment cannot reproduce the feature from migrations.

## Cost and Efficiency

Existing mechanisms:

- three model profiles
- complexity-based routing in frame prompting
- maximum output token inputs
- retry/recovery metadata
- local model-call logging and dev dashboards under `/dev/ai-costs`
- the accepted SPEC-0004 Phase 1 Stick fixture engine costs $0 and records zero API/provider requests
- the published Phase 2 motion engine remains fully local/$0/provider-free; it sends no prompt or project data anywhere
- the published Phase 2.5 timing primitive is fully local/$0/provider-free; it sends no prompt or project data anywhere
- the rejected unpublished Phase 2.6 result is not product/runtime truth and cannot be connected to chat, Pretend AI, or Terra
- SPEC-0005 remains provider-free through all eight phases; published Phase 1/Phase 2 v1 and the Verified/published/integrated Phase 2 v2 correction at GIT-048 are local, unfinished SPEC-0005 Phases 3–8 are superseded/inactive under D-0055 after the rejected unpublished Phase 3 attempt, and no phase may contact Terra or another provider
- D-0038 preserves a future cost strategy only: compact Terra key-pose/timing plans, local in-betweens, safe free recipes first, at most one later bounded pre-Apply repair, measured dashboard usage, monthly budgets/credits, and no unlimited Terra. Exact pricing/model/privacy must be freshly checked at the later paid gate.

In local development, the cost log writes the full user prompt along with request/model/usage metadata to `.local/ai-cost-dashboard/requests.jsonl`. That directory is ignored by Git, but no approved redaction or retention policy exists.

Missing product policy:

- target cost per request/project/minute of output
- credit-to-cost mapping
- latency and retry ceilings
- model escalation thresholds
- search-call and token budgets
- logging retention and redaction rules
- explicit opt-in rules for paid regression tests

Until a policy is approved, live AI verification is never part of the default test gate.

## Security and Privacy Gaps

- `/api/ai` has no in-repo authentication or rate limiting.
- `/api/drawing-project-ai-memory` uses a Supabase service-role client but accepts caller-provided project IDs without an ownership check.
- prompt assembly can send workspace/project context to model providers.
- the AI route contains external search integration, but user-facing search/privacy policy is undocumented.
- no retention policy is defined for project memory or local cost logs.

Public deployment is blocked until authentication, ownership, rate limiting, privacy, and schema reproducibility are specified and verified.

## Future Custom-Model Track

A custom model is a separate R&D program, not an incremental rename of prompt arrays. Before starting it, create an approved spec covering:

- exact task and baseline to outperform
- data provenance, consent, licensing, and retention
- canonical schemas and versioning
- train/evaluation split and leakage controls
- offline quality, continuity, safety, latency, and cost metrics
- model/fine-tune hosting and rollback
- comparison against prompt/retrieval improvements on current models

The first product milestones should not depend on a custom model unless evidence shows the existing model-plus-engine architecture cannot meet them.

## Verification Assets

Relevant scripts include Generate Frames quality/gold/stateful/continuation/same-project checks, project-memory isolation/safety checks, task-shutdown checks, sound-profile/disabled checks, and timeline playback smoothing checks under `scripts/`.

They are executable evidence candidates, not automatically trusted tests. `testing_workflow.md` records which currently pass, which fail to compile, which are logically stale, and which may contact paid/external services.
