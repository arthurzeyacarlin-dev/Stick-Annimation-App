# AI System Snapshot

Status: canonical current AI architecture and gap map
Last traced: 2026-09-04 through published SPEC-0004 Phases 1, 2, and timing-only 2.5, rejected unpublished Phase 2.6 evidence, and accepted proof-only SPEC-0005 Phase 1

## What Exists Today

Diamond Animator currently uses a hybrid drawing-workspace path. Deterministic request analysis can ask for clarification, return a controlled failure, or produce an eligible frame plan directly; requests routed to the structured-model branch use the OpenAI Responses API and recovery paths. Validated plans become deterministic browser-side Canvas2D operations.

The Stick workspace separately has the published deterministic Phase 6 wave chat and published SPEC-0004 Phase 1 engine. Phase 1 adds a strict local action-neutral plan/executor for fixed wave, jump, bow, and dodge fixtures, isolated Preview/Cancel, one atomic Apply, a durable project latch, and continued manual editability. It does not add broad natural-language matching, Terra, a provider/API call, or a user-visible fixture picker.

GIT-035 published D-0039's exact Phase 2 result in commit `e3ec6a33438c2f3d2e075b6477f18b8eb1b58e24`. Phase 2 normalizes the unchanged fixed plans' important poses, creates deterministic cubic-eased shortest-turn in-betweens, and bakes every output slot into its own ordinary Stick keyframe before Preview. It deliberately adds no natural-language route, recipe catalog, Terra/provider/API call, working Task/Reasoning control, or normal visible UI. Phase 1 remains the default transaction behavior unless the separately named Phase 2 materializer is selected.

D-0041 accepts the exact seven-path Phase 2.5 result as the shared timing/spacing primitive only. Its strict plan-bound sidecar supplies one supported profile for each adjacent important-pose transition: acceleration/ease-in, deceleration/ease-out, natural ease-in-out, explicit-mechanical constant, or paired impact/recovery. The 14,601-byte manifest at SHA-256 `783e6396cf994ce48fb9d7c94dc58674594dd545f888a9c25fe3c1f654a788d1` passed 250 independent checks, and GIT-037 published the exact result in `16799539fb7db31e345a878aa892d4485115188b`. The old review samples are not accepted natural-action evidence: their action poses, frame allocations, contact, and weight were wrong even though the timing formulas passed.

The later unpublished SPEC-0004 Phase 2.6 result is rejected and not current runtime truth. It validated action-specific `stick.action-foundation/v1` data around complete raw coordinate recipes; Arthur rejected the visible motion even though the technical manifest was green. D-0043 supersedes its intended job with SPEC-0005's seven-phase shared engine. Both later free/Pretend-AI recipes and future Terra original plans must emit the same bounded `stick.movement-goal/v1` intent and use one local sequence: whole-body poses → weight/support/ground mechanics → natural timed paths/in-betweens → complete independent editable Stick frames → Preview. D-0044 accepts Phase 1's independent proof gate only; it adds no AI/runtime route, model/API call, provider client, or UI. SPEC-0004 language matching and real Terra/provider work remain in their original later phases; no Phase 2.7 exists.

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

Planned Stick contract under SPEC-0005, not current runtime:

- `stick.movement-goal/v1` is the only future planner-to-motion-engine object;
- it contains bounded project/transaction binding, frame/FPS limits, facing/travel, semantic root/support/posture/limb/energy/path beats, and optional one-cycle walk/run intent;
- it rejects raw joint points, stored angles, executable code, arbitrary curves, unknown fields, and planner-specific animation formats;
- Pretend AI and the provider-free Terra-shaped adapter must canonicalize to the same goal digest and may not select different engines;
- the local engine alone creates complete ordinary editable keyframes, and all temporary planning/mechanics data is discarded before Preview.

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

The accepted browser proof used a blue fixture picker injected into an isolated temporary app copy. It is technical proof only: no product route, product overlay, public asset, user Mode, API request, provider call, or paid request was added. Normal chat matching for the broader engine remains a later SPEC-0004 phase.

Phase 2's private review followed the stricter rule: Arthur saw four separate disposable loopback copies/links preloaded with wave, jump, bow, and dodge one at a time and only the ordinary Stick canvas, timeline, AI transaction area, and manual tools. No query-controlled review surface, tester overlay/control, product route, public asset, or review import was added. The temporary review servers are stopped and their isolated copies are removed.

Published Phase 2.5 keeps Phase 1 and Phase 2 behavior as the defaults and adds only the separately selected `phase-2.5-timed-motion` transaction option. Timing input is strict, cloned/frozen, bound to the canonical plan digest, preserved through transaction forks, used for deterministic baked-frame IDs and interpolation progress, and discarded before the candidate reaches Preview. Its four ordinary review process groups and isolated copies are stopped/removed; their durable proof remains. The later unpublished Phase 2.6 result is rejected/superseded and must not be routed or corrected. SPEC-0005 Phase 1 is accepted proof infrastructure only; no shared motion-engine or planner-door runtime has begun.

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
- SPEC-0005's approved future shared movement engine and planner door remain provider-free through all seven phases; accepted Phase 1 is proof-only, and no phase may contact Terra or another provider
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
