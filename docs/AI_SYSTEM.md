# AI System Snapshot

Status: canonical current AI architecture and gap map
Last traced: 2026-09-23 through D-0129 acceptance/verification of the final SPEC-0012 Phase 4 citation-recovery/reply-reveal correction; GIT-094 publication pending. Phase 5 remains unauthorized/not started. SPEC-0008 Phases 2–6 remain paused. SPEC-0012 transcription/public beta/deployment remain unauthorized.

## SPEC-0012 guidance Assistant — hosted search correction published and active

[`SPEC-0012`](specs/0012-diamond-animator-guidance-assistant.md) defines a separate Home guidance experience, not an extension of the animation-mutating AI plan. Its production brain is fixed `gpt-5.6-terra`; Low/Medium/High/Extra High map to `low`/`medium`/`high`/`xhigh`, with Medium default. Internal product questions retrieve from checked-in `diamond-animator-knowledge/v1`; accepted Phase 4 exposes Responses hosted `web_search` only for genuine external/current facts after its completed dated capability/access/privacy/pricing gate. Deterministic provider/search/transcription doubles remain the default proof path.

Assistant ownership is dedicated: `/assistant`, `/api/diamond-assistant`, Assistant request/job contracts, `DiamondAssistantJobService`, Assistant-only IndexedDB sessions, catalog, receipts, components and proof. The request excludes project/workspace identity and animation bytes; response schemas contain no command/action/patch. The new path may not import or reuse the AI Animator route/job/storage ledger or any unified V2/manual/recovery/Export/project-management mutation owner.

The plan permits at most 50 persisted sessions with no silent eviction; blank chats are not persisted; the same Terra call returns the answer and automatic title; manual rename wins permanently; delete is confirmed. Truthful activity is server-event driven: Thinking, Searching the internet only during a real hosted search, and Finalizing answer only while composing after reasoning/tools. The accepted inherited presentation cycle is exactly one second bright, one second dark and 1.75 seconds paused; reduced motion is static. Phase 5 microphone work is dictation only, with explicit Stop, editable text, explicit Send and no raw-audio retention.

GIT-089 published D-0120; D-0121–D-0123/GIT-090 fully close Phase 1. D-0124 accepts combined Phase 2 with Assistant-only persisted sessions, `/api/diamond-assistant`, strict job/provider contracts, fixed Terra, local knowledge, four reasoning levels, truthful Thinking/private Finalizing/typewriter/cancel/recovery and zero project mutation. GIT-091 `fa2ef6c…` publishes/integrates it, preserves its proof and completes cleanup. Arthur removed cumulative daily/monthly reservation/ledger/lock gating and chooses when to stop local use; the `$0.15` request estimate, 24k/4k tokens, 90s deadline, zero retry/resend, two jobs/one per session, 500 identities, 50 chats, usage reporting, local-only access and `store:false` remain.

D-0125 accepts Phase 4's exact current Responses `web_search` extension. The local catalog and deterministic eligibility policy run first; only genuine external/current questions receive the hosted tool with `tool_choice: required`. Stable animation principles and internal product guidance remain zero-search. The provider permits at most two hosted calls, eight processed sources, six displayed sources, 512 query characters and a 45-second search deadline inside the existing 90-second job, with no retry, arbitrary fetch, scraping, media inspection, image search, social authentication or model fallback. Canonical public HTTPS sources and output-text citation ranges/titles are validated before answer publication and persist in Assistant-only IndexedDB. Search costs `$0.01` per hosted call under the existing `$0.15` total-request ceiling, dated 2026-09-23.

The D-0125 accepted live proof used fixed `gpt-5.6-terra`/Medium, one request and one tool call, processed eight sources, displayed three, persisted citations across reload, left the project sentinel unchanged and produced a `$0.050754` application receipt. D-0126/GIT-092 published that result. D-0127's accepted terminal correction moves Finalizing ownership to the job after complete result validation, holds it for about three seconds, caps whole-job/search work at 55/30 seconds, deduplicates provider search lifecycle events and bounds verified candidate sources after validation instead of exposing the temporary source-overflow failure. The app strips leaked Markdown/raw URL syntax from prose and renders verified sources only in the dedicated Sources panel. Its accepted live local/search replies completed in 8.611/18.850 seconds with zero retries and unchanged project sentinel. D-0128/GIT-093 publishes the exact 29-path product package as `99128d70f4320dcfc757d81c7bc146baf3467f86`, activates canonical port 3000, preserves proof and completes cleanup. Transcription, public beta and deployment remain separate; the protected workspace AI Animator path is unchanged.

## Paused SPEC-0008 transition (D-0085–D-0093)

[`SPEC-0008`](specs/0008-conversational-ai-animator.md) binds fixed `gpt-5.6-terra` Responses use for conversational intent/planning; Low/Medium/High/Extra High → `low`/`medium`/`high`/`xhigh`; Medium default on new/open; no task/model picker or model fallback; and persistent streamed job state. Phase 1 is closed and non-mutating. D-0091 integrates bounded hosted internet research into existing Phase 2 before its provider-neutral reference video/upload work; later gated phases retain deterministic frame slicing, honest ordinary drawing reconstruction, registered-command edits and beta/export closeout. The spec still has exactly six phases.

D-0093 pauses every unimplemented phase before dispatch. D-0091's published web-research contract and D-0092's current-main automatic-commit contract remain historical planning material only; they authorize no executor, live/paid provider call, asset purchase or replacement architecture. Resumption requires Arthur's explicit direction, fresh evidence and post-Phase-1 architecture/spec reconciliation before any separate phase authorization.

All authored changes remain isolated while an active job builds and validates its candidate. Under D-0092, an unambiguous explicit create/edit message is the authorization for one bounded mutation job: after complete validation and live-base recheck, the registry/V2 owner automatically commits the whole result as one global-history transaction and shows the current project. There is no second Preview/Apply/post-generation Cancel gate; active work remains cancellable before commit, failed/stale/invalid work remains non-mutating, and Undo/Redo corrects successful work. Planning stays non-mutating, material ambiguity asks one focused question, and destructive actions still need explicit exact intent through the registered destructive-command rules. Sora 2/OpenAI Videos is not selected: Arthur's dated planning input records it as deprecated with shutdown scheduled for 2026-09-24, and Phase 2 requires a fresh current-provider/access/cost/privacy decision before live use. D-0089 accepts the corrected Phase 1 implementation: six authorized short text-only Terra requests cost $0.010854 total under the $0.50 ceiling, with search/tools off, no project images/assets/full bytes and no automatic retry. D-0091 does not alter those bytes. It specifies only a future Phase 2 `web_search` extension with a cited `inspiration-brief/v1`, truthful **Searching the internet** lifecycle, no legacy DuckDuckGo/custom scraper, inaccessible-social-link local-upload fallback, and hard request/tool/source/token/time/spend limits. It grants no search/video-provider or real-user authority.

Current official OpenAI documentation retrieved 2026-09-19 identifies `gpt-5.6-terra` Responses web search as supported, `web_search` as the current new-integration tool, visible clickable citations as required for web-derived UI output, `max_tool_calls` as the built-in-tool ceiling, and `max_output_tokens` as including both visible output and reasoning tokens. Phase 2 deterministic proof therefore targets that hosted tool only. Any live search requires a separate dated account-access/privacy/pricing/rate-limit packet and exact request/spend authority; any live video-provider call retains a distinct gate.

### Published SPEC-0008 Phase 1 runtime

The stopped accepted worktree replaces the ordinary panel's task picker with one chat and one `/api/ai-animator` production request door. `generateAiAnimatorReply.ts` calls only `gpt-5.6-terra` through Responses with strict structured intent, bounded recent conversation/workspace metadata, exact reasoning effort, tools/search off and `store: false`. `AiAnimatorJobService` owns one active workspace job/two active environment jobs, 90-second deadline, monotonic status events, explicit cancel and fail-closed model identity. `aiAnimatorStorage.ts` keeps bounded project-scoped transcript/terminal-job state outside authored project/history/version bytes. The accepted panel truthfully holds Thinking for at least two seconds, supports reduced motion, and reveals unboxed assistant text. No Phase 1 request creates or edits animation content.

Arthur's later narrow presentation authority also accepts a 280–520 px resizable right sidebar with 420 px default/snap, fixed centered canvas geometry, toolbar alignment and an expanded timeline overlay. These mechanics preserve project/history/repository/canvas digests and add no AI capability. Immutable technical manifest SHA-256 is `80a5463775f498116389e49cb94d3282023355c6f7dd1bae9cc026a727916313`; browser proof passed 254 assertions with zero external requests/errors; production build passed. GIT-070 publishes these bytes as exact commit `76708645c96b3b0ea95c524f162bb6152d539fcf`; D-0090 records synchronization, proof preservation and cleanup.

## Planning-only transition (D-0055)

SPEC-0004 Phases 1, 2, and timing-only Phase 2.5 remain Verified, published, and integrated. Phase 2.6 remains rejected, unpublished, and superseded historical evidence. Under D-0055, unfinished Phases 3–8 are Superseded by future SPEC-0008, inactive, and must not be implemented.

Current lifecycle update: all seven SPEC-0006 phases are Verified, published and integrated through GIT-061 `185f58752c4f8dd4f5bfea0befe48998e5cd0f04`; all five SPEC-0007 phases are closed through GIT-066; and SPEC-0008 Phase 1 is fully closed through D-0089/D-0090/GIT-070. D-0091's research contract is preserved in GIT-072 `9b4b116d24b076b1c05d91a02fd7318ae5a44148`, and D-0092's transaction contract is preserved in GIT-073 `42bfe1a2607a85a87d486e21d6e573b4e4084d5a`. D-0093 pauses Phases 2–6 as Unauthorized/Not started/not rejected. D-0094's standalone [`SPEC-0009`](specs/0009-animation-export.md) is Approved; D-0096/GIT-076 close Phase 1; D-0097/D-0098/D-0099/GIT-078 close Phase 2; D-0100/D-0101/GIT-079 close Phase 3.

## SPEC-0009 Phase 1–3 AI boundary — accepted narrow Phase 1 repair; export isolation preserved

SPEC-0009 remains an independent local manual export feature. Published Phase 1 reads one immutable validated saved revision and creates no authored project version/history/repository mutation. Arthur's visible Phase 1 review explicitly added one narrow AI regression repair: Terra conversation requests its own missing-key message so a greeting cannot leak Generate Frames wording. The fixed `gpt-5.6-terra` model, reasoning mapping/default, prompt/instructions, tools/search/store policy, job/status UI, Thinking gradient, transcript storage, no-animation-mutation rule and credit design are unchanged.

Accepted Phase 2 export makes zero OpenAI, Terra, provider, search, social, analytics or other network calls; consumes zero AI credits; and leaves all Terra source bytes unchanged. Deterministic regression used a no-cost double. Exactly one separate short Low-reasoning live Terra smoke passed after restoring the ignored local `.env.local`; the credential was not read into proof, hashed, recorded or made publishable. The export implementation adds no video provider or per-export charge.

Published Phase 3 adds only local destination labels, dated guidance, validated output geometry and final export proof. It makes zero runtime platform lookup, external request, OpenAI/Terra/provider/paid call, credit change, upload or deployment. Terra source remains byte-unchanged; the no-cost double passed, and one separate Low live smoke returned `Terra connected.` after the ignored server-only environment was restored. Original preserves the saved shape; the other destination buttons prepare local shapes only and never communicate with a social service. D-0101/GIT-079 record final synchronization, proof preservation and cleanup.

## SPEC-0011 Phase 1–3 AI boundary — all three product phases fully closed

D-0112 accepts the local Project Library / My Projects result; D-0113/GIT-084 publish and close it. The exact Phase 1 implementation factors the deterministic saved-project evaluator/compositor/player into shared library and Export consumers without AI/Terra behavior change.

D-0115 accepts Phase 2. Its viewer implementation remains local and deterministic. The only AI-adjacent correction fixes the proof-discovered focused-production reachability/error boundary: the focused build now contains the real `/api/ai-animator` route, and `DrawingAiPanel` checks content type and handles non-JSON/invalid JSON safely for POST, polling GET and DELETE. Terra prompts, exact `gpt-5.6-terra` model, reasoning mapping/default, request normalization, job/service/provider implementation, tools/search/store policy, transcript, animation mutation boundary, credits and Thinking gradient are unchanged. A deterministic route 404 is structured JSON; deterministic natural and HTML-failure flows prove the client never exposes parser text or response markup. Those tests invoke no provider and cost zero.

One separately authorized live `hi` used `gpt-5.6-terra` with Medium reasoning, returned JSON `202` followed by terminal JSON `200`, displayed `Hi! What would you like to make or explore?`, changed no animation, took 3,831 ms, used 367 input/42 output/409 total tokens and had estimated cost `$0.001238`. It must not be repeated for this phase. The ignored `.env.local` is excluded from proof/publication, its contents were not recorded and byte identity is not claimed. D-0116/GIT-086 publish and integrate the accepted correction without changing any further AI/provider byte. D-0118 accepts Phase 3's local management result; D-0119/GIT-088 publish, integrate, preserve, and clean it up. Phase 3 proof and publication made zero external/provider/AI/paid requests and changed no AI/Terra source or behavior.

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

This table now describes only the preserved legacy `/api/ai` profile route, not the ordinary AI Animator conversation door. Published GIT-070 routes ordinary workspace conversation through exact `gpt-5.6-terra`, no alternate/fallback model and the four approved reasoning efforts. The legacy route remains only for historical/protected compatibility paths.

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
- D-0038 preserves a future cost strategy only: compact Terra key-pose/timing plans, local in-betweens, safe free recipes first, at most one later bounded pre-commit repair inside the isolated candidate, measured dashboard usage, monthly budgets/credits, and no unlimited Terra. Exact pricing/model/privacy must be freshly checked at the later paid gate.

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
