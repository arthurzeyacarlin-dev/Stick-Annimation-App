# SPEC-0008 — Conversational AI Animator and Editable Video Reconstruction

Status: **Approved/active; Phase 1 Authorized/Not started; Phases 2–6 Unauthorized/Not started**
Owner: Arthur
Task role: planning/control-plane architecture only; this task changes no runtime or technical proof
Created: 2026-09-18
Last updated: 2026-09-18
Decision links: [D-0085, D-0086 and D-0087](../DECISIONS.md)
TODO IDs: `PLAN-008`, `SPEC-008`, `AIANIM-001`–`AIANIM-006`
Planning base: clean detached canonical-main SHA `f923c35aa13cfd476e712f4ead89419263fc0893`; index empty before edits
Planning publication: GIT-067 commit `ba5ecd694df78414240ce83a9140c5196334ebdc`; 15 planning/control-plane/tree paths; no runtime change
Authorization publication: GIT-068 commit `1d80141f2465db6f0e389fb43dc1cdfb8dafbdf8`; 10 control-plane paths; no runtime change
Current runtime: SPEC-0007 is fully closed through GIT-066; the ordinary workspace has one V2 coordinator and a 40-command manual capability registry, while its legacy task-picker AI path is not this specification's end state

## 1. Exact product outcome

Diamond Animator will have one bottom-right **AI Animator** chat inside the Animation Workspace. A user can describe a short bounded scene in ordinary language—including stick action, shurikens, aliens, UFOs, space, backgrounds, and props—and receive a playable animation built as ordinary Diamond Animator frames, layers, rasters, items, assets, and symbols. The user can then:

- inspect and play the animation in the existing timeline;
- edit the same content with ordinary manual tools;
- ask the AI to revise the current animation;
- Preview, Cancel, or atomically Apply AI-authored changes;
- Undo and Redo applied AI work through the same global history as manual work;
- Save, Save As, reopen, and continue editing; and
- download a YouTube-ingestible video export. Direct upload to a YouTube account is not required for V1.

The finished bounded pipeline is:

```text
prompt
  → Terra intent + bounded storyboard/shot plan
  → provider-neutral reference video job
  → verified reference video
  → deterministic ordered frame bundle
  → drawing-only editable reconstruction candidate
  → full validation
  → Preview / Cancel or one atomic Apply
  → manual or conversational edits through the same capabilities
  → Save/Open/playback/export
```

This is a real end-to-end V1, not a demo or prompt-specific recipe. It does **not** promise flawless first-try adherence to every arbitrary long cinematic prompt, perfect object tracking, or perfect semantic layer separation. It promises a bounded, honest workflow that either produces editable ordinary content satisfying the gates below, asks one focused question, or fails without changing the project.

## 2. Permanent laws inherited from SPEC-0007

SPEC-0007's accepted laws are permanent and govern every SPEC-0008 phase.

### 2.1 No silent deletion

No conversation, model response, provider completion, video frame, reconstruction step, retry, cancel, failure, stale completion, project switch, or AI edit may blank, stale-overwrite, partially replace, or make unrelated authored content unreachable. An intentional removal is legal only when the user's request explicitly asks for the exact removal and the operation is already a registered manual destructive capability with its target/reference/confirmation/history/persistence rules intact.

### 2.2 Same-paint correctness

AI-authored raster paint uses the same accepted coverage companion, maximum same-paint coverage rule, raster command validation, preview/final identity, and persistence path as manual paint. AI must not bypass the coverage path by drawing into a hidden or second canvas owner.

### 2.3 Shared manual/AI capability

If a human cannot perform an operation through the registered ordinary editor, AI cannot perform it. AI planning may compose capabilities, but execution must use the same UI-independent schemas, validators, sanctioned handlers, V2 coordinator, global history, persistence projection, and no-loss rules as manual controls. No fake mouse automation and no second mutation engine are allowed.

### 2.4 Isolated staging and atomic Apply

All generated or edited work is prepared in an isolated candidate bound to the exact project ID, project generation, base authored digest, and relevant target IDs. Preview renders that candidate without making it the authored project. Cancel discards it with zero history. Apply revalidates the current base and publishes either the complete candidate as one global history transaction or nothing. Failure, cancellation, timeout, stale completion, quota rejection, decode error, provider mismatch, validation error, reload interruption, or project change leaves authored project bytes and history byte-equivalent to the last good state.

## 3. Bounded V1 promise and explicit limits

The V1 quality target is short-form 16:9 animation:

- duration: 4–12 seconds;
- shots: 1–3;
- target authored cadence: 6–12 distinct frames per second, with higher export cadence allowed only by exact frame duplication/interpolation that preserves timing;
- primary moving subjects: normally 1–2;
- important props: up to 4;
- reconstructed layers: at most 6 per shot unless an executor proves a lower safe project-specific ceiling;
- provider/reference dimensions: at most 1280×720 before deterministic slicing;
- total frame count, encoded assets, and projected V2 project size must pass the existing 128 MiB/project, 512 MiB/collection, 256 MiB/single-raster, and current browser-memory limits before any Apply.

If a prompt exceeds these bounds, the AI asks one focused narrowing question or states the exact unsupported scope. It must not silently shorten, remove subjects, omit shots, lower fidelity, or exceed storage/cost limits.

V1 does not guarantee dialogue lip-sync, crowds, long-form narrative, exact copyrighted-style imitation, physically perfect simulation, arbitrary 3D camera choreography, perfect occlusion recovery, or a perfectly separate semantic layer for every visible object. When reliable separation is not possible, the candidate uses fewer honest raster layers, labels that limitation, and remains ordinarily pixel-editable. A flattened ordinary raster layer is acceptable only when disclosed; hidden video playback masquerading as editable animation is not.

## 4. Current evidence and real seams at `f923c35…`

Fresh code tracing establishes the current ordinary path:

```text
app/page.tsx
  → AnimationWorkspace
  → DrawingWorkspace (sole V2 state/history/repository owner)
      → DrawingCanvas / timeline / Properties / Library / Assets
      → manualCapabilityRegistry (40 enabled manual commands)
      → DrawingAiPanel (legacy task-picker chat)
          → POST /api/ai
          → optional generatedFramePlan / actionPlan
          → local drawingFrameExecutor or three narrow workspace actions
```

Current facts that SPEC-0008 must change or preserve:

- `DrawingAiPanel.tsx` visibly exposes **Generate Plans**, **Generate Frames**, **Generate Sounds**, and **Other**. The first, third, and fourth are temporarily disabled, while persisted controls may reopen on an unavailable choice.
- Visible reasoning choices already read **Low**, **Medium**, **High**, and **Extra High**, mapping to `low`, `medium`, `high`, and `xhigh`, but current model selection can route among `gpt-5.4`, `gpt-5.3-chat-latest`, and `gpt-5.2`.
- `generateAiText.ts` already calls the OpenAI Responses API, but no current invariant locks every AI Animator call to `gpt-5.6-terra` or forbids silent fallback.
- The panel simulates minimum-duration status sequences such as Analyzing, Thinking, Planning animation, Drawing, and Generating frames with timers. The existing gradient status and typewriter/reveal visual language is reusable, but timed labels are not proof of durable job progress.
- Panel transcript and follow-up state are React-session state. Control preferences use one browser-local record. Project AI memory is a separate auxiliary mechanism.
- `DrawingWorkspace` supplies one existing generated-frame apply callback and an action executor that supports only Save Project, current-frame PNG export, and sound attachment. Current PNG export is not a complete animation/video export.
- Published SPEC-0007 provides the accepted V2 coordinator/repository, no-loss raster path, Assets lifecycle, drawing-only historical migration, and a runtime-used manual capability registry. It provides no general AI caller into that registry.
- `/api/ai` and `/api/drawing-project-ai-memory` still have the authentication, ownership, rate-limit, retention, and logging gaps recorded in `AI_SYSTEM.md`. Public beta remains blocked until Phase 6 closes them.

Historical fixed wave/jump/bow/dodge fixtures and prompt/reference example libraries are evidence and regression inputs only. Rejected SPEC-0004/0005 motion implementations are not reusable. No action name, prompt phrase, shuriken, alien, UFO, or acceptance-story token may select a runtime recipe branch.

## 5. One AI Animator surface

### 5.1 Visible panel contract

The Animation Workspace exposes exactly one bottom-right AI Animator chat. Preserve the accepted panel placement, dark visual language, compact composer, gradient status treatment, and typewriter/reveal behavior except where this spec intentionally changes control or job semantics.

Remove the Generate Plans / Generate Frames / Generate Sounds / Other task picker from the rendered UI, keyboard order, accessibility tree, persisted preference schema, request contract, and ordinary runtime decision path. Do not merely hide it with CSS. Old persisted task values may be read only for one safe migration to the new single-chat state, then ignored/removed.

The visible reasoning menu remains:

| Visible choice | Exact Terra effort |
| --- | --- |
| Low | `low` |
| Medium | `medium` |
| High | `high` |
| Extra High | `xhigh` |

V1 does not expose `max`. Every New or Open Workspace starts at **Medium**, regardless of the last workspace's selection. A user may change reasoning for the currently mounted workspace session, but V1 does not carry a non-Medium selection into another New/Open action. The reasoning setting is a request configuration control; it is never displayed as job progress or a status.

### 5.2 Production brain invariant

Every production AI Animator language/vision request uses the OpenAI Responses API with the exact model ID:

```text
gpt-5.6-terra
```

There is no model selector, profile router, escalation model, downgrade model, silent alternate, or compatibility fallback. A request that cannot use Terra fails honestly. An explicit user Retry may repeat Terra only as a new linked job within the phase's retry and cost ceiling; there is no automatic retry. Tests must fail if another model ID is reachable, if an unset model silently resolves to a different constant, or if recovery changes models.

Phase technical proof defaults to a deterministic Responses API test double and zero real provider calls. A real paid Terra smoke requires a separate explicit authorization and must record exact request count, spend/usage, data projection, cleanup, and provider response identity. Source wiring may be accepted without falsely calling the model live-verified.

The Phase 1 production guard permits at most 16,000 input tokens and 4,000 output tokens, one active brain job per workspace, two concurrent brain jobs per user/environment, and a 90-second server deadline. There is no automatic paid retry. Those are technical ceilings, not a cost estimate or authority to call the model. Before any live paid smoke or real-user use, the executor must recheck same-day model access, reasoning support, rate limits, provider terms, and pricing, then obtain Arthur's separate approval for an exact request count and monetary ceiling. Unavailable or changed terms fail closed rather than selecting another model.

Credentials are server-only. Keys/provider secrets never enter client bundles, browser storage, project bytes, logs, screenshots or proof manifests. Search and hosted tools are off. Phase 1 sends only the user turn, a bounded summary and minimal workspace metadata; it does not send raster/assets/full project bytes.

### 5.3 Automatic semantic routing

Terra returns one strict intent envelope:

```text
conversation | create-animation | edit-animation | clarify
```

- Planning, brainstorming, creative discussion, questions, and requests for ideas remain non-mutating conversation unless the user explicitly asks to build, create, animate, generate, or change the animation.
- An explicit build/animate request becomes `create-animation` and enters the generation pipeline when the relevant phases exist.
- A request to change the current animation becomes `edit-animation` and binds to the current project/generation and named or inferred target.
- If two materially different outcomes remain plausible, the target project is unavailable, or a destructive target cannot be identified, the AI asks exactly one focused question at a time.

Routing is semantic structured output from Terra, not a keyword list, action-name branch, prompt recipe, or test-story switch. Hard local guards may reject empty/oversized/malformed input, missing project binding, unsupported attachments, or invalid structured output, but they may not infer a creative action recipe. Evaluation prompts are test data only.

## 6. Persistent jobs, streaming, status, and accessibility

The canonical job record is versioned and project-bound. At minimum it stores:

```text
job ID/version
project ID or unsaved-workspace ID
project generation and base authored digest
conversation turn ID and intent
selected Terra reasoning effort
current status and monotonic event sequence
real progress measurement when available
artifact references/digests, never unbound transient objects
cancellation/failure code
created/updated/completed timestamps
```

The transcript, event log and terminal job summary persist in a project-scoped job store outside authored animation content/history/version bytes. New/Open rebinds the ledger by exact project or unsaved-workspace identity without creating a project version. Browser disconnect never cancels a persistent job; the client reconnects with the last event sequence and hydrates the latest snapshot. A server interruption becomes an honest recoverable **Failed** record unless the downstream provider exposes a verified resumable ID; the UI must not pretend it is still running. One workspace has at most one active mutating job. A new mutating request must wait, explicitly cancel the active job, or be rejected; it cannot overlap Apply.

Status events stream with monotonic sequence IDs. Replayed, missing, duplicated, out-of-order, cross-project, or stale-generation events are ignored or fail the job without mutating content. Cancellation aborts reachable work and records **Cancelled**. Terminal states are immutable.

The finished system uses exactly these user-visible statuses:

| Status | Meaning | Earliest phase |
| --- | --- | --- |
| Thinking | understanding, conversation, intent, or one focused question | 1 |
| Planning | bounded storyboard/shot/edit plan | 1 |
| Making video | submitting/polling/downloading a reference-video job | 2 |
| Animating | deterministically cutting/slicing the verified reference video into the ordered frame bundle | 3 |
| Working | building/reconstructing those frames into ordinary editable Diamond Animator layers/content in Phase 4, or preparing registered conversational edit commands in Phase 5 | 4 |
| Finalizing | validating the isolated reconstruction/edit candidate and preparing Preview readiness; later, validating export readiness | 4 |
| Done | the requested job reached its defined terminal result | 1 |
| Failed | work stopped with a truthful actionable failure and no partial authored mutation | 1 |
| Cancelled | user/system cancellation completed with no partial authored mutation | 1 |

Phase 1 may use Thinking → Planning → Done only for a non-mutating conversation/intent/plan result, and must explicitly say that no animation was created. Later statuses appear only when their real subsystem is executing. **Animating is never reconstruction:** Phase 3 uses it only while deterministic video cutting/slicing is running. **Working is the authored-content stage:** Phase 4 uses it while building ordinary editable layers/content, and Phase 5 uses it while preparing registered edit commands. A job skips any status whose subsystem it does not execute.

Opaque model/provider work is indeterminate. A percentage or determinate bar is allowed only from a real numerator/denominator such as provider-reported frames, downloaded bytes, sliced frames, validated commands, or export frames. No fake percentages, timer-derived progress, or status advancement solely to make the UI look active.

The status container uses a stable accessible name, `role="status"`/polite live announcements for normal updates, and an assertive error announcement only for actionable failure. Cancel is keyboard reachable and labelled with the affected job. Reduced motion removes sweep/typewriter animation without hiding status text. Focus remains in the composer unless a focused control disappears; completion does not steal focus.

## 7. Cross-phase artifact and transaction contracts

Every intermediate artifact is versioned, schema-validated, content-addressed, size-bounded, and bound to the originating job/project/generation.

1. **Intent/plan** — Terra's structured intent plus bounded storyboard, shot timing, subjects, props, background, camera, negative constraints, and V1-bound check.
2. **Reference video** — provider/upload provenance, request/capability snapshot, source digest, duration, dimensions, codec/container metadata, moderation/ownership state, provider job identity, and terminal status.
3. **Frame bundle** — ordered frame manifest with source video digest, decoder/version, shot ID, zero-based frame index, presentation timestamp, duration, dimensions, image digest, and boundary flags.
4. **Editable candidate** — isolated V2 candidate, exact registered command batch/receipts, layer/owner map, confidence/flattening disclosures, authored/catalog/coverage digest, storage preflight, and base binding.
5. **Apply receipt** — base/result digests, project generation, command IDs, target IDs, one history entry, persisted artifact bindings, and Preview identity.

An artifact from another job/project/generation is never adopted by coincidence, filename, index, or timestamp. Each transition revalidates all upstream digests. Temporary video/frame assets remain outside the authored project until Phase 4 Apply. Cancel/failure cleanup revokes URLs, aborts work where supported, deletes disposable unreferenced artifacts, and retains only the bounded diagnostic/job record allowed by the privacy policy.

## 8. Phase lifecycle, schedule target, and completion definition

SPEC-0008 has **exactly six implementation phases**. The planning target is one phase per day plus one correction/publication buffer day:

| Target day | Work |
| --- | --- |
| 1 | Phase 1 |
| 2 | Phase 2 |
| 3 | Phase 3 |
| 4 | Phase 4 |
| 5 | Phase 5 |
| 6 | Phase 6 |
| 7 | Correction/publication/integration/cleanup buffer |

This is a sequencing target, not permission to lower proof, skip human acceptance, overlap ownership, or claim a calendar guarantee. A missed phase gate moves the schedule; it does not borrow scope from another phase.

Each phase follows the permanent sequence:

1. Arthur separately authorizes exactly one phase after the preceding phase is durably closed.
2. One fresh Plan-mode Spec Executor starts from the exact synchronized canonical-main SHA in one dedicated worktree, freezes its exact allowed path list, implements/tests only that phase, creates and independently validates its technical proof manifest, returns the Implementation Review Packet, and stops. It edits no canonical docs or Git state.
3. Arthur and the Project Manager accept or reject the stopped result. Visible changes require an exact unpublished review copy under D-0021. Rejected bytes are non-reusable and receive verified recovery/cleanup under D-0054.
4. After acceptance and complete executor shutdown, one Control Plane Architect takes exclusive ownership of that same worktree, revalidates the accepted bytes/proof, updates the canonical control plane, completes tracked-state checks, returns its PM Review Packet, and stops with an empty index.
5. A later explicit publication instruction alone authorizes staging the exact reviewed allowlist, committing, fast-forwarding clean canonical `main`, pushing normally, and verifying clean local/origin/live synchronization. No pull, merge, rebase, amend, force-push, history rewrite, or scope expansion.
6. Required proof is preserved; the exact review server is stopped and port closed; the obsolete executor worktree and now-unused merged local branch are removed under D-0054.

A phase is not complete until its implementation is accepted, its control-plane result is recorded, its reviewed bytes are committed/pushed/integrated, local/origin/live Git are synchronized, proof is preserved, and review-copy cleanup is complete. Only then may the next phase be separately authorized.

## 9. Phase 1 — Terra brain, automatic intent routing, and chat/job foundation

Status: **Authorized; Not started under D-0087**

### 9.1 Outcome

Replace the ordinary Animation Workspace's task-picker behavior with the one-chat foundation in §§5–6. Lock the new AI Animator server brain to Terra/Responses API, migrate the reasoning control, add validated semantic intent routing, persistent project-bound transcript/job records, streamed truthful status, cancellation, reconnect/interruption handling, and accessible presentation.

Phase 1 creates no reference video, frame bundle, editor command batch, Preview candidate, project/document mutation, history entry, asset/catalog entry, save version, export, or external search request. `create-animation` and `edit-animation` may produce a bounded non-mutating plan/readiness result only; the visible response must say no animation change occurred because later phases are not present.

### 9.2 Required execution path

The preferred boundary is a new narrowly owned AI Animator contract/job/brain module and route used by the existing panel, leaving the giant legacy `/api/ai` implementation reachable only by historical tests or explicitly protected compatibility paths. The ordinary panel must have exactly one production request door. If the executor instead changes `/api/ai`, it must prove the old task dispatch is unreachable from the ordinary panel and freeze the smallest exact path set before editing.

```text
AI Animator composer
  → create project-bound ai-animator-job/v1
  → server guard + Terra Responses API structured intent/result
  → validated monotonic event stream
  → project-scoped transcript/job persistence
  → conversation / one question / non-mutating create-or-edit plan result
```

The model request projects only the user turn, bounded recent conversation, current project identity/generation, and a minimized workspace summary needed to route the turn. It does not send raster bytes, full project storage, unrelated projects, local secrets, or historical recovery records in Phase 1. The new path disables search/tools. New cost telemetry records model, effort, tokens/usage, latency, outcome, and prompt digest by default—not the raw prompt—until Phase 6 accepts retention policy.

### 9.3 Acceptance and proof

- New and Open Workspace each start on Medium; Low/Medium/High/Extra High produce exact Terra efforts low/medium/high/xhigh.
- Every captured production-shaped request uses `gpt-5.6-terra`; mutation tests for every old model constant, model override, escalation, missing model, and recovery branch fail closed rather than call another model.
- The task picker is absent from DOM, keyboard order, accessibility tree, storage writes, and request payloads. The one chat retains the intended existing visual placement/language.
- A bounded semantic eval corpus covers conversation/brainstorm, explicit create, existing-animation edit, material ambiguity, destructive ambiguity, unrelated help, hostile prompt injection, typos, long-but-in-bounds scenes, and the two later acceptance-story themes. There are no action/theme phrase branches in runtime source.
- Brainstorming and planning remain conversation; explicit build/animate becomes create; revision becomes edit; material ambiguity asks one focused question. Route results are stable across whitespace/case/paraphrase variants without keyword fallthrough.
- All Phase 1 flows preserve exact authored, catalog, coverage, history, repository-head, and saved-version digests. Create/edit-intent jobs explicitly report that no animation was created.
- Status stream replay/out-of-order/duplicate/stale/cross-project events, abort, reload interruption, server failure, malformed structured output, rate failure, and unmount are deterministic and leave no active ghost job.
- Transcript/terminal jobs survive panel remount, Save/Open, and app reload as scoped by the project; one project's history never appears in another.
- Keyboard, screen-reader status, reduced-motion, compact/desktop, 200% zoom, focus, cancel, empty/error states, zero serious Axe findings, zero overflow, and zero page/console errors pass.
- Technical proof uses a deterministic Responses API double and zero live provider/search/video requests by default. Any separately authorized live Terra smoke is isolated, counted, cost-bound, privacy-recorded, and cannot replace offline proof.

Candidate allowed families are the AI panel/shell, AI Animator-specific contracts/router/jobs/storage/status modules, the minimum request route and OpenAI Responses wrapper, project-identity rebinding needed for transcript/job reopen without animation-document writes, and phase-owned fixtures/tests/proof. The future executor freezes the exact subset after fresh tracing. DrawingCanvas, authored V2 document/history/version mutation, manual command handlers, video providers, slicer, reconstruction, export, dependencies, and unrelated legacy prompts/examples are outside Phase 1.

## 10. Phase 2 — Provider-neutral reference-video generation and verification

Status: **Unauthorized; Not started**

### 10.1 Entry decision gate

Before any live video-provider use, Arthur must approve a dated provider packet based on same-day official sources and actual account access. It must name the provider/model/endpoint, availability, region/account restrictions, duration/resolution/container limits, moderation, data use/training, retention/deletion, ownership/licensing, watermark, cancellation/refund behavior, latency, per-attempt cost, per-job/project/day/month spend ceilings, and retry count.

Arthur's dated planning input records the OpenAI Sora 2 Videos API as deprecated and scheduled to shut down on 2026-09-24. SPEC-0008 therefore forbids hard-wiring Sora 2 or treating it as a production dependency or fallback. No replacement is assumed. The Phase 2 entry gate must recheck the current official provider state before live use. A provider-neutral implementation and uploaded-video path may be technically completed without a live provider; it must report live generation as unproven until the gate is approved and executed.

### 10.2 Contract

Terra produces a bounded `shot-plan/v1`; provider adapters do not reinterpret the story. Core code depends only on one replaceable interface with capability discovery plus submit, poll/get, cancel, and fetch-result operations. Vendor request/response IDs and raw shapes remain inside the adapter.

Jobs support queued, in-progress, completed, failed, and cancelled provider states mapped honestly to **Making video**. They enforce the approved duration/resolution/bytes/cost ceilings before submit. One provider job has one attempt; **Retry** is an explicit user action that creates a new linked job only after a fresh cost preflight. There is no automatic retry or silent provider/model switch.

Uploaded local video is a first-class test/fallback input. V1 accepts only a locally selected MP4 or WebM no larger than 200 MiB, 12 seconds or 1280×720 after byte signature, container/codec, duration, dimensions, ownership acknowledgment, digest and isolation checks; filename/MIME alone is insufficient. There is no arbitrary URL fetch. Phase 2 stores verified temporary reference artifacts only and never mutates the editor.

Terra checks bounded representative frames plus metadata against the shot plan: opening, each shot boundary/midpoint, and ending, with extra samples for declared key events. The verifier records coverage of subjects, action, props, background, shot order, duration, and prohibited extras. A material mismatch ends **Failed** with the mismatch disclosed and offers **Retry** only when another separately preflighted job is permitted. It never silently retries or accepts the wrong reference.

### 10.3 Exit proof

Contract tests run against at least two fake adapters with incompatible vendor shapes, provider replacement requires no core/job/schema/UI change, and mutation tests catch vendor leakage. Queued/poll/completed/fail/cancel/timeout/retry/duplicate callback/stale project/overspend/malformed download/spoofed upload cases pass. Representative-frame verification catches missing subject, wrong action, missing prop, wrong background, reordered shot, truncated ending, and added unsafe/unrequested content. All flows preserve exact project/history/head bytes and clean temporary artifacts. Live provider proof, if separately authorized, supplements but never replaces deterministic/uploaded-video proof.

## 11. Phase 3 — Deterministic Cucumber Slicer

Status: **Unauthorized; Not started**

Phase 3 converts one verified reference video into an isolated `frame-bundle/v1`; it makes no editor mutation. Its visible active-work label is **Animating**, used only while deterministic cutting/slicing is executing. Planning, reconstruction, and edit-command preparation may not use that label.

The slicer validates source digest/metadata, uses a pinned decoder/runtime, normalizes orientation and color handling, and maps requested cadence to presentation timestamps with one documented deterministic nearest-frame/tie-breaking rule. It streams work so decoded RGBA does not accumulate unboundedly. Default target cadence is 12 FPS, bounded to 6–12 FPS for V1 with at most 144 samples; dimensions are bounded to 1280×720 and may be reduced only by an explicit preflight result recorded in the job.

The output manifest contains consecutive indices `0..N-1`, monotonic source presentation timestamps, exact per-frame duration, shot ID, shot-boundary flags, dimensions, encoded image digest/size, decoder/version, source digest, and aggregate ordered digest. Every requested target timestamp maps exactly once. There are no missing, duplicate, reordered, zero-duration, cross-shot, or silently dropped frames. The last frame/end duration and every shot boundary are explicitly tested.

Proof covers constant/variable frame rate, repeated source frames, irregular timestamps, rotation metadata, color profile, three shots, very short/maximum duration, corrupt/truncated/unsupported inputs, cancellation at each stage, disk/quota failure, process interruption, and repeated identical runs. Same input/config/runtime produces the same manifest and image digests. All outputs remain isolated and disposable; project/catalog/history/head digests remain exact.

## 12. Phase 4 — Editable drawing-only reconstruction

Status: **Unauthorized; Not started**

This is the hardest phase. It converts a validated frame bundle into ordinary drawing-only Diamond Animator content without a second editor or hidden video layer. Its active build label is **Working**; reconstruction may not be labelled Animating. **Finalizing** begins only when the isolated reconstruction candidate is undergoing full validation and Preview-readiness checks.

### 12.1 Reconstruction outcome

- Backgrounds, primary moving subjects, important props, and effects/foreground use separate bounded layers only when masks/tracks are reliable across the relevant shot.
- Curves, texture, soft detail, and uncertain geometry remain ordinary raster content. **Draw Rig** may be used only for clearly segmented straight-ish geometry and always produces ordinary raster paint/coverage, never joints/bones/topology.
- Existing project Assets and Drawing/Mixed drawing symbols may be reused when their exact digest/definition is deliberately selected and validated. Generated image bytes enter through the same bounded asset validation/catalog path as manual stills.
- Every frame/cell/item is inspectable by the existing timeline and editable by the ordinary manual tools. No embedded reference-video playback, opaque generated-animation blob, active legacy rig, or AI-only object type is allowed.
- If semantic separation is unreliable, the candidate uses an honest `Reference Composite` raster layer or fewer coarse layers and tells the user what is flattened. It must not hallucinate precise editability.

Terra may inspect representative source/reconstructed frames and metadata to assess story/action/subject continuity, but pixel masks, temporal tracks, frame order, and command results must pass deterministic validation. Model confidence alone cannot authorize Apply.

### 12.2 Shared capability and atomic transaction

The reconstructor composes only registered `futureAiEligible` manual capabilities against an isolated V2 candidate reducer. It never dispatches DOM/pointer events or writes canvas/history/repository state directly. If reconstruction needs a capability not manually available and registered, Phase 4 stops. That capability requires a separately reviewed manual-first scope and proof before a later authorized reconstruction attempt may use it; the Phase 4 executor cannot silently broaden its own authority.

The command batch creates no more than the V1-bounded layers/frames/assets, carries exact base/project/generation/target/digest bindings, and preflights V2/project/collection/raster/browser-memory limits. The candidate receives full schema/reference/no-loss/coverage/renderer/playback/storage validation. Preview displays the exact candidate and its flattening/layer disclosures. Cancel changes nothing. Apply revalidates the live base and publishes one complete V2 root plus one global history entry. Undo restores the exact pre-Apply project; Redo restores the exact candidate.

Error, cancel, stale model/provider/slicer completion, stale base, manual edit during generation, quota, decode, mask, tracking, command, render, persistence, or readback failure leaves project bytes/history/head exactly unchanged and no partial authored data.

### 12.3 Exit proof

Proof includes static background plus one moving subject; two crossing subjects; occlusion; curved alien/UFO detail; straight segmented prop geometry; shuriken-like small moving props; camera-still and bounded pan; unreliable separation fallback; copied/held frames; layer/frame/onion/playback; manual Brush/Eraser/Knife/Select/Lasso edit after Preview/Apply; exact Undo/Redo; Save/Open/Save As; cancellation and every injected failure. Pixel/reference/command/coverage/catalog/project digests bind Preview, Apply, Undo, Redo, and reopen. No SPEC-0007 drawing/manual regression, source writer, or external request outside the separately approved Terra/video gates is allowed.

## 13. Phase 5 — Conversational editing through the manual registry

Status: **Unauthorized; Not started**

Follow-up requests operate on the current canonical project, including manual changes made after the original generation. Terra produces a bounded edit plan using only registered manual capabilities. The job uses **Working** while it prepares and evaluates registered edit commands, then **Finalizing** while validating the isolated candidate for Preview. It skips Making video and Animating unless the request truly invokes those earlier subsystems. Supported V1 edit classes are recolor, reposition/transform, retime within the existing bounded timeline, add supported ordinary content, remove an explicitly requested exact target, and adjust an already supported property or scene element.

If the human editor cannot perform an operation, AI cannot perform it. A request outside the registry returns the limitation or one focused alternative question; it cannot invent a hidden command. Destruction requires explicit removal intent and a registered destructive command. Ambiguous `remove it`/`delete that` requests ask one focused target question and perform no mutation.

Every edit binds the exact project generation/base digest and target IDs. The isolated edit candidate uses the same Preview/Cancel/Apply contract as Phase 4. A manual edit made while planning invalidates the candidate; the AI must re-read/replan rather than overwrite it. One Apply creates one global history entry, and exact Undo/Redo/Save/Open/project-generation binding are mandatory. Conversation history or old artifact references never override the current project.

Proof covers each edit class on AI-created and manually modified content, multiple turns, pronoun/target ambiguity, explicit and implicit destructive language, stale target IDs, project switch, concurrent manual edit, Cancel, failure, Undo/Redo, Save/reopen, and cross-project memory isolation. Runtime-source mutation tests prove no direct document/catalog/history setters, fake pointer path, unregistered handler, non-Terra model, or theme/action recipe branch.

## 14. Phase 6 — Beta-quality closeout and downloadable video export

Status: **Unauthorized; Not started**

Phase 6 completes the bounded V1 rather than adding a seventh feature phase.

### 14.1 Product closeout

- All exact statuses in §6 are driven by real subsystem events with retry/cancel/recovery and truthful interruption behavior.
- New → prompt → plan → reference video → slice → editable reconstruction → Preview/Apply → playback → manual edit → AI follow-up → Undo/Redo → Save/Open passes without partial authored data.
- Playback, onion, timeline, Properties, Library, Assets, drawing tools, manual command registry, history, migration, and V2 persistence retain their accepted behavior.
- Export renders the canonical complete animation—not the current-frame PNG path—at 16:9 up to 1920×1080, preserves exact project timing, and downloads a video container/codec confirmed by a same-day YouTube ingest/support check. If authored FPS differs from export FPS, frames are duplicated or deterministically interpolated with an exact timing map; duration may not drift by more than one export frame.
- The export includes all visible layers/items/text/backgrounds/props/effects in canonical order and never exports preview/onion/selection/UI overlays. No audio is invented. When supported attached audio exists, inclusion requires exact sync and licensing proof; otherwise the file is explicitly silent.
- Direct YouTube account upload, OAuth/channel management, publishing metadata, thumbnails, monetization, and analytics may remain later work.

Exact container/codec and encoder dependency are a named Phase 6 entry gate because browser/platform support can change. Arthur approves the reviewed choice after a local encode/playback/file-inspection proof and same-day YouTube support check. The implementation must provide an actionable fallback/error when the current browser cannot encode; it must not relabel a PNG sequence as a video.

### 14.2 Public-beta gates

Before public beta or any public deployment, Phase 6 must close:

- authenticated user/session access for AI and video routes;
- project ownership and cross-project denial;
- request/body/upload bounds, rate limits, concurrency limits, abuse controls, and idempotency;
- explicit provider data projection, consent where required, retention/deletion, training-use policy, moderation, and ownership/licensing disclosure;
- raw prompt/project/frame/video/log redaction and retention policy;
- exact Terra/video/egress retry, request, project/day/month spend ceilings and kill switch;
- secret placement and environment validation;
- provider failure/revocation/replacement behavior; and
- truthful user-visible disclosure of reference-video use and V1 reconstruction/editability limits.

No public beta claim is allowed while these are unproven. Local private development may remain available under explicit access/cost authorization.

### 14.3 Required end-to-end stories

Two non-hardcoded acceptance stories plus one follow-up edit must pass in ordinary product UI:

1. **Bounded black-vs-red action:** two differently colored stick-style subjects, a readable shuriken action/dodge, and a simple background over a short bounded timeline.
2. **Bounded alien/UFO scene:** one alien, one UFO, a readable space/night environment, and at least one important prop/effect over a short bounded timeline.
3. **Follow-up edit:** a natural-language recolor, reposition, or retime request applied to one of those current projects after one manual edit.

The story text, nouns, colors, and actions appear only in evaluation fixtures. Static/import tests fail if they appear in runtime routing, provider selection, reconstruction selection, or command-dispatch source. The accepted result must show ordinary frames/layers/items, manual editability, Preview/Cancel/Apply, full-loop playback, Undo/Redo, Save/Open fidelity, and a playable inspected downloadable video. The two projects must not share baked story-specific bytes except generic product assets.

First-try universal cinematic fidelity is not the gate. The bounded stories may use one explicit user Retry as a new cost-preflighted job; there is no automatic retry. Out-of-bound prompts must narrow or fail honestly. Quality review covers subject/action readability, continuity, timing, layer honesty, background/prop presence, lack of unexplained content, and visible editability—not only hashes or model self-scoring.

## 15. Phase ownership, non-goals, and mandatory stop conditions

| Phase | Executor-owned scope | Phase non-goals | Mandatory stop conditions |
| --- | --- | --- | --- |
| 1 | one-chat panel/contract, Terra gateway, intent envelope, external project-scoped job/transcript ledger, event stream, cancellation/reconnect and Phase 1 proof | no reference video, frame bundle, editor command, project/history/version write, export, search, deployment or public-beta claim | any alternate/fallback model path; client-visible credential; cap bypass; job-order/persistence ambiguity; task picker still reachable; any authored/project digest change; any unauthorized live/paid call |
| 2 | shot-plan continuation, provider-neutral adapter/coordinator, validated upload fallback, isolated video artifact/review, representative-frame/metadata verification and Phase 2 proof | no slicing, reconstruction, canvas/timeline/history mutation, export or provider assumption beyond the approved packet | missing/changed provider/access/cost/privacy approval for live use; vendor leakage; automatic retry/switch; cap/retention unknown; corrupt/mismatched reference; late cancelled completion advancing state; any project mutation |
| 3 | pinned deterministic decode/sample/bundle pipeline, timing/shot manifest, isolated bundle review and Phase 3 proof | no semantic reconstruction, object tracking claim, editor command, canvas mutation or export | nondeterministic bytes/order; missing/reordered frame; shifted/lost shot boundary; unbounded decoded memory; absent digest/metadata; limit overflow; any project mutation |
| 4 | reconstruction analysis, honest separation/flattening disclosure, registered-command candidate reducer, Preview/Cancel/atomic Apply and Phase 4 proof | no hidden rig/topology, AI-only item/command, embedded reference-video project, follow-up conversation system or final export | direct document write; unregistered/unavailable-manually command; false editability; identity/action/shot loss; stale Apply; Preview/Apply mismatch; non-atomic failure; storage/readback failure; partial history/data |
| 5 | current-project target resolution, registered edit-plan compilation, focused ambiguity handling, Preview/Cancel/Apply and Phase 5 proof | no hidden editor capability, target guessing, implicit provider regeneration, arbitrary code or export | operation unavailable manually; ambiguous target guessed; implicit deletion; unregistered destructive path; stale generation/target accepted; unrelated content changed; partial history or save/reopen mismatch |
| 6 | truthful recovery/failure UX, full regression/evaluation, security/ownership/rate/privacy/retention/spend enforcement, canonical animation export and Phase 6 proof | no direct YouTube OAuth/account upload, long-form/unbounded cinema, collaboration, custom-model training or new mutation engine | any public-beta gate open; cross-user access; rate/spend/secret/log-retention bypass; partial project data; canonical playback/export mismatch; invalid/unproven download format; hidden provider call; unbounded performance; protected regression |

Each executor owns only the exact runtime/fixture/technical-test/proof subset frozen after fresh tracing. It cannot edit canonical docs, Git state or another phase/worktree. A stop condition ends implementation without scope expansion; resolution requires the owning gate or a separately authorized correction task.

## 16. Protected regressions and common proof contract

Every phase proves its exact trigger plus all reached protected systems:

- SPEC-0007 no-loss, same-paint, Draw Rig, rig-retirement/migration, Assets, 40-command registry, history, persistence, and playback gates;
- SPEC-0006 one-workspace/one-V2-coordinator, all-source read/adoption/recovery, Save/Save As/Open, and no legacy source writes;
- one AI Animator panel only; no hidden task picker, second chat, second editor, active rig/Creator, or theme-specific generation surface;
- exact model/effort, zero silent provider/model fallback, zero unauthorized external/search/paid calls, and bounded logs;
- desktop `1440×900` DPR1 and compact `390×844` DPR2, keyboard, focus, screen reader/status, 200% zoom, reduced motion, Axe, no overflow, no page/console errors;
- deterministic contract/oracle tests, negative/mutation tests, changed-scope TypeScript/lint/build, exact dirty-path/index/diff checks, browser proof, resource cleanup, and a PASS/VALID manifest whose validator rejects mutations in every material binding family.

Phase manifests bind base/HEAD, spec hash, exact dirty allowlist, source/fixture/test hashes, model/provider/decoder/encoder identities as applicable, artifact digests, command/event/job ledgers, browser operations/screenshots/console/page/network ledgers, cost/usage/egress counts, performance/memory samples, protected regressions, limitations, empty index, and `humanAcceptance: pending Arthur`.

Existing strict historical validators may legitimately reject a newer spec/control-plane or runtime projection. The executor must add a phase-owned validator rather than weakening or rewriting accepted historical proof.

## 17. Phase summary and authorization

| Phase | TODO | Entry gate | Exit result | Status |
| --- | --- | --- | --- | --- |
| 1 — Terra brain, routing, chat/jobs | `AIANIM-001` | SPEC-0008 approved/published under D-0087; fresh Plan-mode worktree | one-chat Terra-only non-mutating brain, routing, persistence, streaming, accessibility | **Authorized; Not started** |
| 2 — Provider-neutral reference video | `AIANIM-002` | Phase 1 fully closed; separate authorization; provider/access/cost/privacy gate before live use | replaceable provider contract, verified video, upload fallback, zero canvas mutation | **Unauthorized; Not started** |
| 3 — Deterministic Cucumber Slicer | `AIANIM-003` | Phase 2 fully closed; separate authorization; pinned decoder/input contract | exact ordered isolated frame bundle, zero editor mutation | **Unauthorized; Not started** |
| 4 — Editable reconstruction | `AIANIM-004` | Phase 3 fully closed; separate authorization; frame bundle/project preflight | validated drawing-only candidate, honest layers, Preview/Cancel/atomic Apply | **Unauthorized; Not started** |
| 5 — Conversational editing | `AIANIM-005` | Phase 4 fully closed; separate authorization; AI-eligible registry audit | current-project edits through shared manual commands with atomic history | **Unauthorized; Not started** |
| 6 — Beta closeout/export | `AIANIM-006` | Phase 5 fully closed; separate authorization; security/cost/privacy/export-format gates | bounded end-to-end beta workflow and inspected YouTube-ingestible download | **Unauthorized; Not started** |

D-0087 approves this specification and authorizes Phase 1 only. Later phases always require their own separate authorization after the preceding phase is accepted, recorded, published/integrated, synchronized, proof-preserved, and cleaned up.

## 18. Planning verification, blockers, and handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Required boot/base/index | PASS | dedicated `/563e/` worktree; clean detached `f923c35aa13cfd476e712f4ead89419263fc0893`; empty index before edits |
| Live execution path | CODE VERIFIED | one V2 coordinator/manual registry; legacy task picker/session chat; Responses API with three current model profiles; current-frame-only PNG export |
| Six-phase design | PASS | exactly six sequential implementation phases plus one non-phase correction/publication buffer day |
| Runtime/provider/paid/Git changes in the D-0085 planning task | ZERO | planning/control-plane/tree records only; no app, test, provider, API, dependency, server, staging, commit, push, or deployment action |
| Phase 1 product blockers | NONE; D-0087 owner approval/authorization recorded | Terra model/effort and non-mutating Phase 1 outcome are fixed; real paid smoke remains separately authorized evidence, not an implementation prerequisite |
| Later named gates | OPEN by design | current video provider/access/cost/privacy; decoder/encoder choice; public-beta security/retention/spend policy |

The planning package was reviewed and published under D-0086/GIT-067, and Arthur approved it with Phase 1-only authorization under D-0087. After that authorization record is published, one fresh Phase 1 Spec Executor may start in Plan mode from the exact synchronized SHA. Phase 1 still has no accepted implementation, technical proof or review app; no provider/API call, paid usage or deployment is authorized.
