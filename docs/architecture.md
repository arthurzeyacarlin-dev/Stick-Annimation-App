# Architecture and System Map

Status: canonical architecture map, current vs intended distinguished
Last traced: 2026-09-24 through D-0134/GIT-096 publication and closure of Phase 6 local/private-beta offline/recovery hardening.

## SPEC-0012 guidance-Assistant architecture — all six phases published and closed

D-0129 keeps the existing provider/search/job/storage architecture. It adds only provider-consulted metadata recovery when native annotations are wholly absent and a client pending-to-done reveal marker that remounts the existing text reveal for the newly completed turn; persisted history never reanimates.

D-0120 separates the Home guidance Assistant from every animation-capable AI path. Phase 1 provides dedicated `/assistant`. D-0124 accepts combined Phase 2: `DiamondAssistantScreen` and Assistant components own Assistant-only IndexedDB sessions; `/api/diamond-assistant` owns a local-only strict request boundary; `DiamondAssistantJobService` owns identity, dedupe, concurrency, deadline, cancellation and the private final hold; the provider retrieves bounded checked-in knowledge and calls fixed `gpt-5.6-terra` with no tools and `store:false`. No project ID, workspace summary, animation bytes, manual command, repository/recovery/Export/project-management handle or AI Animator ledger enters the path.

```text
Home AI Assistant card
  -> /assistant
  -> DiamondAssistantScreen / Assistant-only IndexedDB
  -> /api/diamond-assistant
  -> DiamondAssistantJobService
  -> local knowledge retrieval and search-eligibility policy
  -> fixed gpt-5.6-terra Responses
      -> no tools for internal guidance
      -> optional hosted web_search only for eligible current external facts
  -> validated answer + same-call title + sources/cost receipt
  -> Assistant session transaction and typewriter reveal
```

Exactly 50 persisted sessions are allowed with no silent eviction; blank chats are ephemeral; manual rename overrides any automatic title; delete is confirmed and Assistant-local. Guidance may explain app navigation but never controls it. The server event stream alone owns truthful Thinking, real Searching the internet, and output-composition Finalizing answer states. GIT-095 adds the separate transcription route: in-memory microphone capture → sampled waveform → Cancel or Stop → editable transcript → explicit Send; raw audio is not deliberately persisted. D-0133 adds one Assistant-local retry owner: offline/failure closes the current job, and only an explicit user Retry moves the original turn to a fresh job identity while preserving bounded failed-attempt receipts.

Combined Phase 2 implements local sessions and the original planned Phase 3 fixed-Terra/local-catalog guidance scope. Cumulative daily/monthly reservation/ledger/lock code is intentionally absent under D-0124; the `$0.15` per-request estimate and all token/output/deadline/concurrency/dedupe/cancel/job-memory/session/usage/local-only protections remain. GIT-091 `fa2ef6c526d04de9c77b356b53b4768890c46e1f` publishes/integrates that result, preserves its proof and completes its review-copy cleanup.

D-0125 accepts Phase 4's search path. `assistantSearchPolicy` runs after local knowledge retrieval and returns either local-only or one sanitized required-search topic. `assistantProvider` exposes only Responses `web_search` for the latter, maps real provider events to Searching/Finalizing, validates completed tool calls/actions, canonical public HTTPS URLs, displayed source titles and citation text ranges, and publishes answer/search/usage atomically through the existing Assistant job/session owners. The search ceiling is two hosted calls, eight processed/six displayed sources, 512 query characters and 45 seconds inside the 90-second job; cost is `$0.01` per hosted call within the existing `$0.15` request ceiling. There is still no arbitrary fetch, custom scraper, media watch/download, image search, social authentication, automatic retry or fallback model.

The accepted corrupt-row storage correction treats unreadable raw rows as occupied for count/byte capacity, preserves their canonical bytes, prevents unsafe overwrite and still lets a healthy independent chat proceed. It does not migrate or delete the corrupt row. Phase 4 changes no project, animation, AI Animator, recovery, Export or project-management owner. Transcription and deployment remain absent. The accepted AI Animator and unified V2 mutation paths remain protected and separate.

D-0127 keeps this architecture but corrects ownership and terminal sequencing. Provider events may move a job only between Thinking and one active Search; duplicate lifecycle events are ignored and excessive/overlapping transitions fail into a reserved terminal slot. After Terra returns, the job validates the complete answer/search/usage result, then alone enters Finalizing for about three seconds before Done. The whole job/search deadlines are 55/30 seconds. Provider source candidates are all canonicalized and validated, then bounded to eight processed/six displayed records; excess candidates no longer fail the user's answer. Presentation normalization removes source syntax and raw URLs from answer prose while retaining verified accessible links in the separate Sources panel. No storage/project/Animator/mutation owner changes.

D-0128/GIT-093 publishes that exact architecture in product commit `99128d70f4320dcfc757d81c7bc146baf3467f86`, activates the canonical port-3000 runtime, preserves the accepted proof and removes the obsolete review runtime/worktree/branch. Phase 5 may add only its separately authorized transcription boundary; it is not started by this closeout.

### D-0131/GIT-095 Phase 5 transcription boundary — published

`AssistantComposer` owns only the visible controls and latest draft insertion. `AssistantDictationCapture` owns each recording identity, local media tracks, `AudioContext`, analyser, worklet, waveform/clock, bounded in-memory PCM, cancellation and the single Stop request. The same-origin `dictation-worklet.js` caps sample and byte production in its audio thread; `assistantDictationContract.ts` validates canonical WAV and transcript bounds. `DiamondAssistantScreen` remounts the composer on New Chat or session change so a late result cannot enter a different draft.

```text
explicit microphone click → browser permission → MediaStream/AudioWorklet/real-sample waveform
  → Cancel: release tracks/context/buffers, suppress late result
  → Stop: close capture, validate WAV, one POST /api/diamond-assistant-transcription
      → local-only AssistantTranscriptionService → fixed gpt-transcribe audio endpoint
      → bounded verified text → current editable draft → ordinary explicit Send
```

The separate Node route shares no guidance job, AI Animator job/ledger, project identifier, workspace summary, manual command or V2 repository owner. Server origin/identity/format/size/duration checks precede provider access; timeout/cancel uses request abort and bounded tombstones. `gpt-transcribe` is fixed in the one request, mismatched returned echoes fail, and absent echoes stay `null`. The provider JSON does not guarantee independent returned-model attestation. Browser buffers are cleared where mutable and resource handles released on terminal paths; immutable request blobs and provider-side memory cannot be proven physically erased. D-0131's sealed 16-source/355-evidence technical manifest verifies this boundary, with Arthur's physical-microphone report recorded separately. GIT-095 `6de47a9dc1d780b63ed355fa5148f87cc5f0b1f2` publishes/integrates it.

### D-0133/D-0134/GIT-096 Phase 6 offline/retry boundary — published and closed

`useAssistantSessions` owns offline preflight and explicit retry orchestration. `assistantStorage.retryTurn` atomically reuses only the latest failed/cancelled/interrupted turn after revision/digest revalidation, records the prior failed job identity, assigns a new UUID and retains the original user message/context. `DiamondAssistantJobService` and `assistantProvider` convert provider connection failures into truthful terminal copy. `AssistantConversation` exposes Retry only on terminal non-done turns. There is no background retry, resend timer, second user message, offline fallback answer, project mutation or second provider door. D-0133's sealed 20-source/80-evidence manifest verifies this path; D-0134/GIT-096 `20612c3…` publishes it and closes SPEC-0012.

## SPEC-0011 project-library and playback architecture — all three phases fully closed

D-0112 accepts Phase 1's new My Projects route. `app/page.tsx` replaces the inert singular action with **My Projects**, while **Open Project** continues through `prepareCollectionWorkspace(...)` into the sole `DrawingWorkspace`. `ProjectLibrary` reads `listProjectCollection(createBrowserProjectSourceReader())`, preserves native and all five supported legacy classifications, keeps invalid/protected entries visible, binds exact source locators/digests, and refreshes authoritative local storage. The Phase 1 My Projects surface is watch-only; it creates no official or recovery write.

The accepted SPEC-0009 `loadExportProjectSnapshot(...)` evaluator, frame/timing resolvers and `renderCanonicalExportFrame(...)` compositor feed a new shared `CanonicalProjectPlayer` consumed by Export preview and `ProjectMovieViewer`. Posters use the same evaluator/compositor on the earliest visible canonical frame through a visible/near-visible queue capped at four. Selection revalidates the exact entry before opening. The centered dialog owns Phase 1 play/pause, time, seek, close/backdrop/Escape, focus restoration and scroll preservation; it stops at completion, while Export retains its accepted looping preview. Export encoding, destinations, Finder and validation remain in Export.

Accepted Phase 2 adds one `projectPlayerClock` monotonic media-time owner, sampled by RAF, with frame selection `min(frameCount - 1, floor(mediaTime * savedFps))`. Active scheduled audio anchors to `AudioContext.currentTime`; silent playback anchors to `performance.now()`. `projectPlayerAudio` reuses the saved Export attachment interpretation, bounds unique-asset decoding, schedules offsets/overlaps/trims, and tears down obsolete nodes/contexts on pause, seek, source invalidation and close. `ProjectMovieViewer`/`CanonicalProjectPlayer` own completion/Replay, actual-state fullscreen, Escape order, keyboard/focus/accessibility and control reveal/hide. The control strip participates in layout below the stage; it is not a black gradient over authored pixels.

The inherited SPEC-0009 frame-3 mismatch was stale proof math: its independent X/Y mapping ignored the horizontal matte produced when uniformly containing the saved `4554×3293` authoring reference inside `1280×720`. The corrected proof computes expected X `0.7501221828399292` versus rendered `0.749406441925578`, inside the unchanged `0.025` tolerance. Product geometry, canonical renderer and Export output are unchanged.

The accepted focused-build correction includes both `app/page.tsx` and `app/api/ai-animator/route.ts`, and `DrawingAiPanel` now fails safely when POST/GET/DELETE responses are not JSON. The route, provider service, fixed Terra model, prompts, reasoning, jobs/tools, transcript/mutation behavior and Thinking gradient remain unchanged. This is a reachability/error-boundary correction, not new AI capability.

Accepted Phase 3 adds one `ProjectManagementCommandOwner` above the existing V2 repository/storage transaction boundary. Rename is a same-ID metadata-only next revision. Duplicate is the existing new-ID/copy-provenance Save As path and may hydrate a valid read-only legacy source without mutating it. Delete revalidates one exact native head/revision/digest, blocks active viewer/editor/recovery conflicts, deletes only that project/head/versions, and removes only assets proven unreferenced by every remaining official version. Web Locks plus localStorage heartbeat leases serialize ownership and the editor lease follows Save/Save As identity. `BroadcastChannel` and storage events are invalidation only; authoritative storage re-read plus lock/CAS decides state. Search/sort is a local presentation transform, not persisted project data.

D-0118 accepts and technically verifies Phase 3's exact 14-path implementation from base/HEAD `b57ff995df9bb351dacb9a6a79b8cbd23203e988`. Immutable manifest SHA-256 is `92ae122c227a36fd8a637b1922b1bca139224be4caf0e42d3a147f2a43147aaa`, source digest `05ee661120e7751658b9ea2e5269c7cc1cbc666645568af1db7b1ff1f08074d1`. Both library surfaces use the same authoritative shell and command owner with visible/context/keyboard routes and Watch-versus-Edit distinction. D-0119/GIT-088 publish and integrate that accepted result in exact 28-path commit `d0ec1b23d7e1d9ff13a0779c2758e33e858691f0`, preserve proof, stop the review server, and complete D-0054 cleanup. Player, editor, recovery policy, Save/Save As semantics, Export, and AI/Terra architecture remain unchanged.

## SPEC-0010 Project Safety and Recovery architecture — all three phases closed

D-0104 accepts Phase 1's narrow wiring around the existing unified V2 owner and D-0105/GIT-081 close it. D-0106 accepts Phase 2's separate recovery owner and D-0107/GIT-082 close it: meaningful committed edits schedule a content-addressed V2 candidate into recovery-only IndexedDB, with verified stage/readback/publication, monotonic generation/CAS, previous-valid preservation, one logical latest draft and exact covered-draft clearing. Official V2 heads/versions remain the sole official project owner. Corrected one-click **Save and Exit** coordinates one official Save with the exact pending recovery generation and navigates Home only after safe cleanup; failure/newer edits stay editable.

The three-phase architecture is:

```text
Phase 1: File -> Save and Exit
  -> existing canonical official Save transaction
  -> verify success covers the current workspace generation
  -> Home only on that verified success; otherwise stay in the workspace

Phase 2: committed meaningful edit
  -> bounded debounce / monotonic sequence
  -> encode and validate an isolated V2 candidate
  -> separate recovery-only IndexedDB stage/readback/CAS
  -> one latest verified local emergency draft, never an official project

Phase 3: startup recovery check
  -> Unsaved work found (project name + time)
  -> Recover Work -> isolated validated working candidate, zero official writes
  -> Discard Draft -> confirmed deletion of only the recovery draft
  -> later explicit Save/Save As/Save and Exit remains the sole official publication door
```

Phase 1 is fully closed through D-0105/GIT-081. Phase 2's accepted recovery draft is implemented as an emergency local backup, not ordinary Save, project history, cloud sync or a project-list entry. The existing `workspace:pointerup-autosave` still means in-memory canvas capture; only the committed-meaningful-edit scheduler publishes verified recovery generations. D-0108 accepts Phase 3: startup gates Home/New/Open until the recovery head is inspected; recovery revalidates and atomically claims the exact generation; one tab wins; matching-source recovery preserves identity; stale/missing/changed source recovery is rebound as a revision-zero **Recovered copy**; confirmed discard deletes only the recovery draft. Recover writes no official project bytes until explicit Save. D-0109/GIT-083 publish, integrate, synchronize, preserve proof and close cleanup. SPEC-0008 Phases 2–6 remain paused under D-0093.

## SPEC-0009 Animation Export architecture — all three phases closed

Before Phase 1, Home's visible Export button had no handler, workspace `DrawingTopBar` received only Save/Save As callbacks, and `DrawingWorkspace.exportCurrentFrame()` was an inadequate AI-action current-frame PNG helper. D-0096 accepts the Phase 1 replacement seams: Home **Export** and workspace **File → Export** converge on one `AnimationExportFlow`; saved-project discovery revalidates identity before cloning one immutable V2 snapshot; explicit card selection plus **Use this animation** opens Play/Pause, saved-FPS, scrubber and **Change animation** playback; workspace entry excludes unsaved edits.

D-0094 defines one local read-only pipeline. Phase 1 owns entry/selection/playback; accepted Phase 2 implements the shared compositor, audio, encoder, Finder write and inspection steps; accepted Phase 3 inserts one versioned local destination catalog and shape plan before the same encoder:

```text
Home Export or workspace File → Export
  → existing saved-project collection/source reader
  → validated immutable saved snapshot + digest-bound selection
  → shared canonical scene evaluator
      ├─ saved-animation thumbnail/player
      └─ frame-by-frame bounded export compositor
  → versioned local destination catalog + validated contain geometry
      ├─ Original saved-shape bound
      ├─ named 16:9 / 9:16 / 4:5 preparation
      └─ validated 16:9 / 9:16 / 1:1 / 4:5 / even custom 256–1920
  → deterministic saved-audio mix
  → local licensed H.264/AAC MP4 encoder
  → macOS Finder-selected file writer
  → post-write media inspection
```

The selected source remains owned by the accepted V2 repository. Listing, watching, encoding and writing create no project version/history/repository mutation and never include unsaved workspace edits implicitly. FPS and duration come from the saved document. Accepted Phase 2 persists project-owned solid background with absent/new state defaulting to white and routes preview plus output through one uniform centered contain renderer, so asymmetric content keeps its shape without crop or stretch. Local encoding uses pinned Mediabunny `1.58.1` under MPL-2.0 to create selected 720p/1080p H.264 MP4 and AAC when authored audio exists. Finder save, real progress, cancellation, distinct failure, zero-byte partial cleanup and post-write validation share one bounded job path.

Phase 3's catalog contains Original plus 12 named destination labels and Custom / Other. It uses neutral text fallbacks rather than unverified logos, carries dated `2026-09-20` first-party guidance metadata, performs no runtime lookup, and labels every value as local guidance rather than a posting guarantee. Destination selection computes exact canvas/content/padding geometry through centered complete-animation contain framing; padding uses the saved project background and silent crop/fill is absent. These controls prepare a local file only: no account, OAuth, login, upload, post, scheduler or provider is present.

Export makes zero network, AI, Terra, video-provider or paid calls and changes no credits. Terra source and its fixed model/reasoning/instructions/jobs/gradient/transcript/mutation behavior are unchanged; the no-cost regression double and one separate Low live smoke pass through the ignored local environment. Automated file proof uses the real browser encoder plus a local FileSystemFileHandle seam; native Finder remains human-review evidence. Phase 3 adds real five-minute 720p and sixty-second 1080p authored-audio performance proof plus six decoded geometry families. D-0093 still keeps SPEC-0008 Phases 2–6 paused. D-0101/GIT-079 close Phase 3 publication/integration, proof preservation and cleanup.

## Published SPEC-0008 Phase 1 architecture

D-0089 accepts one ordinary AI Animator chat whose sole production request door is `/api/ai-animator`. The route normalizes the bounded request and delegates to `AiAnimatorJobService`, which owns exact `gpt-5.6-terra` provider identity, one active job per workspace, two active jobs per environment, monotonic Thinking/Planning/terminal events, explicit cancellation and a 90-second deadline. `generateAiAnimatorReply.ts` uses Responses strict structured output with the exact visible reasoning effort, no tools/search/store, and only the user turn, bounded recent conversation and minimized workspace metadata. `aiAnimatorStorage.ts` persists a bounded project-scoped transcript/terminal-job ledger outside authored animation/history/version bytes. Create/edit intent remains a non-mutating readiness result in Phase 1.

The accepted visual shell keeps unboxed assistant replies, fast reveal, reduced-motion text and full-label sequential Thinking sweeps. The same accepted package includes Arthur-authorized presentation mechanics: an overlay right sidebar limited to 280–520 px with 420 px default/snap, unchanged centered canvas stage geometry, a toolbar ending at the panel edge, and expanded timeline lanes layered above the canvas/sidebar while ordinary timeline mutations retain their existing owner. GIT-070 publishes this exact architecture; D-0090 records synchronization, proof preservation and cleanup.

## Paused SPEC-0008 Phase 2–6 target architecture — not implemented

D-0085/D-0091/D-0092 define one replaceable, one-way workflow: workspace conversation → optional bounded fixed-Terra hosted `web_search` → cited `inspiration-brief/v1` → Terra intent/shot plan → persistent streamed job ledger → provider-neutral reference-video boundary or validated upload → deterministic frame slicer → editable reconstruction planner → internally validated registered-command candidate → automatic atomic commit after an explicit create/edit request → existing `DrawingWorkspace` V2 coordinator/history/repository → resulting current project → canonical Save/Open → deterministic video exporter.

Phase 2 search uses only the Responses hosted `web_search` tool with exact model `gpt-5.6-terra`; it does not add arbitrary URL fetch, legacy `web_search_preview`, the existing `/api/ai` DuckDuckGo fetch/parser, custom crawling/scraping, social-video download or model/provider fallback. Web results remain untrusted input. Search output is a schema-validated project/job/generation-bound brief with visible clickable citations and observed-versus-inferred high-level inspiration only. Inaccessible YouTube/TikTok/social motion evidence falls back truthfully to validated local MP4/WebM plus ownership/right-to-use acknowledgment.

The search tool, provider, decoder/slicer and reconstruction planner never own authored state. Intermediate brief/video/frame/reconstruction artifacts are isolated, content-addressed and project-generation bound. The only authored commit door is an atomic registered-command batch entering the existing V2 owner after the current message unambiguously requests creation or editing and the internal candidate passes every validation. There is no user-facing Preview/Apply/post-generation Cancel gate. The active job can still be cancelled before the final compare-and-swap; cancellation/failure/stale/validation error leaves the original byte-equivalent. Success creates one global history entry, shows the resulting current project and uses Undo/Redo for correction. No structured rig/topology or second mutation engine returns. This later architecture remains unimplemented. D-0091/GIT-072 and D-0092/GIT-073 preserve the research and transaction planning, while D-0093 suspends dispatch. Phases 2–6 are Paused/Unauthorized/Not started/not rejected and require explicit resumption plus fresh architecture/spec reconciliation.

## Published SPEC-0007 Phase 1–5 extension

SPEC-0007 preserves the current one-workspace/V2 ownership path and requires one UI-independent `EditorCommandEnvelope` capability registry between manual interaction adapters and the `DrawingWorkspace` commit/history owner. Phase 1 is published/integrated in GIT-062. D-0077 accepts Phase 2's raster-only Draw Rig adapter: `DrawingCanvas` selects `pathMode: "draw-rig"`, `RasterGestureDraft` delegates only centerline segmentation to `DrawRigCorridor`, and the existing Phase 1 paint/coverage/history/persistence path commits the resulting ordinary raster patch. No joint, bone, topology, hidden selection model, AI caller, provider, prompt, model, API, video or tracking path is added.

D-0075's accepted Phase 1 routes Brush/Pencil/Sketch/Pixelate/Glow through one deterministic transient-draft → prepared raster/coverage delta → validated command → global-history transaction path. Preview and final use the same prepared geometry/mask; cancel/context change preserves the immutable committed base. Same-paint overlaps persist a bounded versioned coverage companion and use per-pixel maximum coverage instead of additive alpha. Sketch contributor ownership lets Knife move detached texture dabs without leaving ghosts; onion display derives canonical purple/green tints from occupancy without rewriting authored pixels. A non-destructive command retains everything outside its validated target; intentional removals are limited to the closed destructive registry. Existing V2 version/readback/CAS/recovery/source-safety limits and performance ceilings remain protected.

Published Phase 2 adds one explicit Properties toggle labelled **Draw Rig**. Its deterministic segment accumulator outputs only ordinary raster paint plus the same coverage companion; it creates no joint, limb, bone, ID, topology, constraint, attachment, hidden rig object, or separate selection model. Published Phase 3 removes every active structured-rig/Creator authoring surface and new-content command. `legacyRigRetirementV3.ts` fully validates and deterministically rasterizes historical `stick-rig/v1` items and rig-backed/mixed symbol definitions into ordinary drawing items or drawing-only symbols before an all-or-none migrated V2 candidate may mount. `unifiedWorkspaceBootstrap.ts` routes native V2 and all upgraded legacy source kinds through that boundary. Source stores and the exact pre-migration version remain read-only/recoverable; compatibility rig parsers/renderers are unreachable outside that boundary. Library remains project-created Drawing/Mixed drawing symbols.

D-0081's accepted Phase 4 keeps Assets as the separate project-local external-still catalog. `staticAssetImport.ts` preflights complete chooser/drop batches before decode or mutation, validates static PNG/JPEG/WebP byte structure/type/dimensions/non-animation/digest and bounds, then decodes through always-revoked object URLs. `DrawingCanvas` supplies truthful previews, project-context cancellation, placement transforms and explicit catalog actions. `DrawingWorkspace` routes unreferenced asset deletion through the destructive registry/global history; the V2 catalog rejects duplicate names/content and the contract enforces bounds. Committed placements remain ordinary raster pixels. D-0082/GIT-065 publishes/integrates this path and completes proof preservation/review-copy cleanup.

D-0083's accepted Phase 5 adds `manualCapabilityRegistry.ts` as the closed runtime-used inventory for 40 enabled manual mutations, including all 11 destructive commands. Existing UI adapters call `requireManualEditorCommand` before entering the existing `DrawingWorkspace` coordinator/history handlers; the registry describes schemas, validators, no-loss rules, history/persistence behavior and future-AI eligibility but creates no AI execution path or second state owner. The failed-publication rollback path now cancels transient editing and restores the exact last-good canvas bitmap before a queued pointer-up autosave can observe stale destructive pixels. Frozen tween cache construction now admits only actual tween owners. D-0084/GIT-066 publishes/integrates this path, preserves proof and completes review-copy cleanup. SPEC-0007 is complete.

Native V2 first Save now materializes the exact old direct project version/assets as the immutable predecessor before publishing the migrated head. A versioned migration receipt binds source kind/project/revision/digest, renderer version, converted item/definition IDs, output digest and recovery identity. Projects with no rig content return unchanged. Failure before complete validation never mounts a partial candidate or changes the current head/source.

## Historical implementation foundation — Phase 7 published and SPEC-0006 complete (D-0069/D-0070)

Every supported local source enters one neutral V2 editor path. `WorkspaceCandidate.editor` has only the `unified` variant; `createUntitledWorkspace` and `prepareCollectionWorkspace` always return a validated V2 project; and `AnimationWorkspace` mounts exactly one `DrawingWorkspace`. There is no ordinary route or discriminator that mounts `StickFigureWorkspace` as a second coordinator.

`DrawingWorkspace` requires the V2 project and owns the ordinary dispatcher, authored history, render/timeline integration, Save, Save As and AI-triggered Save. The retained Drawing-shaped compatibility projection and `DrawingCanvas` are adapters for existing algorithms and transient interaction; they do not own a second persisted project. The legacy Drawing hydration/storage/cloud-sync branch is unreachable and removed from this ordinary coordinator. Manual and AI-triggered Save call the same canonical V2 repository.

Legacy Drawing/Stick parsers and stores remain source-safe read-only leaves for adoption; they are not deleted and receive no V2 projection. The Phase 6 repository still provides content-addressed assets, immutable versions, verified hydration/readback, compare-and-swap head publication, exact-provenance adoption, Save As identity rebinding and last-good recovery. Phase 7 changes the reachable ownership graph, not those storage guarantees.

At the SPEC-0006 Phase 7 milestone, the Stick Creator opened inside the unified workspace root with modal/focus containment and disabled Save. Accepted SPEC-0007 Phase 3 supersedes that active surface: Creator is no longer imported or mounted by the ordinary product path. The historical standalone Stick coordinator remains only as a protected historical/read-compatibility anchor.

Arthur accepted this exact app copy and GIT-061 published it. The final technical proof passed desktop/compact ordinary flows, zero legacy writes or second coordinator mounts, zero Axe critical/serious findings, keyboard/focus/zoom/reduced-motion checks, all protected regressions and retained Phase 6 production stress limits. It made zero external or real API requests. Phase 7 changes no AI model/prompt/provider/API/task behavior, motion/video/tracking, export, dependency, configuration, cloud/social Share, auth/billing or deployment system. D-0070 records proof preservation and D-0054 cleanup.

## Historical current implementation — Phase 6 published and integrated (D-0068/GIT-060)

GIT-060 published the accepted all-source adoption/recovery result as exact 32-path commit `cbe16411a0f83d3b86136f41d0a66d1874d009aa`. `createBrowserProjectSourceReader` lists native unified V2 heads without creating/upgrading storage and reads Drawing V1/V2, Stick V1/V2 and strict unified V1 through their existing read authorities. `listProjectCollection` validates candidates, orders them deterministically, rejects conflicting same-identity records, and collapses only an exact source-kind/source-ID/source-digest pair already represented by an adopted canonical head. `prepareCollectionWorkspace` verifies native V2 heads or upgrades a legacy/V1 candidate without source writes. The immutable Phase 6 manifest remains SHA-256 `5883ea735bd741b2f14e45d2fa84669ea3bb78ad5ed23693011e0280e4070902`.

## Historical current implementation — Phase 5 published, recorded, and cleaned up (D-0065–D-0067)

Phase 5 keeps the accepted neutral V2 root as the sole authored-state, command, history, render, and repository owner while completing the current Drawing/Stick adapters and the four shared tabs. Project catalogs now own reusable Drawing bitmap, structured Stick, and Mixed definitions; instances carry independent transforms and reference immutable digest-bound definitions. Structured Stick geometry is transformed as joints/segments with constant radii/thickness, while a Mixed definition stores its Drawing portion once as a hash-bound PNG.

DrawingCanvas remains the interaction adapter. Select/Lasso project Drawing pixels and structured Stick content into one selection session, update its ref synchronously, then publish one unified selection mutation. Stick and placed-symbol pointer drafts are ref-backed; pointer-up consumes the final sample and seals ownership before capture release/commit, so lost-capture and pointer-autosave paths are idempotent. `DrawingWorkspace` synchronously commits Stick state through the existing global history owner. No timer/retry, double dispatch, new history root, magic coordinate offset, or test-only runtime hook was introduced.

Symbol selection remains owned only by ordinary Select interactions. Empty-canvas pointer-down, Drawing tool activation (including same-tool reactivation), Stick tab/tool activation, playback, and editing-context changes clear its overlay and draft. A symbol's own click/resize/history flow keeps selection so existing Properties actions remain usable.

Unified onion masks resolve raster, text, editable rig, Drawing symbol, Stick symbol, and Mixed symbol from one owner with purple previous/green next tint, copied-owner dedupe, holds, and blank barriers. Shared integer-center bitmap offsets preserve Brush pixels across active-layer commit, timeline scrub, Save/reopen, and onion composition. The compact unified timeline stacks controls over full-width lanes and reserves panel height so ordinary cell pointer clicks are not obscured.

Phase 6 completes exhaustive legacy-source adoption/recovery and persistence fault proof; published Phase 7 completes duplicate-owner retirement and whole-spec acceptance. Phase 5 and Phase 7 record publication and D-0054 review-copy cleanup are complete, with proof preserved outside removed review worktrees. No AI/provider/prompt/motion/video/tracking/API, dependency, export, cloud/social Share, Creator Save, new rig feature, or automatic attachment/following behavior changed.

## Historical current implementation — corrected Phase 4 accepted (D-0063)

SPEC-0006 Phases 1–4 are Verified/published/integrated. The corrected Phase 4 is human-accepted under D-0063 and published at GIT-056 `9c971fa4f7ea0e636ecc6957755552f678f344df`. Its accepted 26-path manifest SHA-256 is `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`.

Accepted V2 uses neutral layers whose owner cells contain ordered raster, text, symbol-instance, and structured-rig items. One neutral reducer owns authored state/history; ordinary New and canonical V2 Open bootstrap that root. Drawing and Stick edits commit through the same root, and shared timeline/playback/onion resolve complete mixed owners. The repository preserves full-document Save/Save As/Open. Published V1 remains a read-compatible historical source path.

## Accepted Phase 4 boundary and remaining work

Neutral V2 layers contain cells owning ordered raster/text/structured-rig/bitmap-symbol items. IDs/selection and Drawing source transforms belong to items; holds/clipboard/onion resolve the complete mixed owner. One command/history root receives controlled item-adapter commits and one renderer emits every item in order. The minimal V2 repository protects complete-root Save/Save As/Open.

Stick Add Limb and Select/Move Joint map through the inverse SVG screen transform, retain gesture ownership against the pan overlay, preview at the pointer, commit once on release, and cancel partial gestures safely. Complete project-owned catalog UI landed in Phase 5; exhaustive all-source adoption/recovery landed in Phase 6; duplicate-owner retirement/full acceptance landed in published Phase 7.

No AI, provider, prompt, motion, video/tracking, cloud/social Share, export, or new manual capability is part of Phase 4. GIT-056 publication/integration and D-0054 accepted-copy cleanup are complete.

## Current ordinary runtime path

## Runtime Overview

```text
app/page.tsx
  └─ local React view state
      ├─ home
      ├─ TutorialsScreen
      ├─ OpenProjectBrowser
      │   └─ createBrowserProjectSourceReader
      │       └─ listProjectCollection (Drawing V1/V2 + Stick V1/V2, read-only)
      └─ AnimationWorkspace
          └─ DrawingWorkspace (sole unified V2 coordinator)
              ├─ DrawingCanvas / DrawingTimelineRow / shared panels
              ├─ one unified dispatcher/history/render/timeline owner
              ├─ canonical V2 Save / Save As / Open / recovery
              ├─ Phase 3 drawing-only legacy-rig migration boundary
              └─ existing Drawing AI UI; save action uses the V2 save door
```

The main product screens are local view states rather than URL routes. URL routes remain for `/credits`, local AI-cost dashboards, `/api/ai`, and `/api/drawing-project-ai-memory`.

## System Ownership Map

| System | Primary files | Current responsibility |
| --- | --- | --- |
| App shell/home/New/Open routing | `app/page.tsx`, `src/components/chrome/AIcreditspage.tsx`, `app/ScrollbarActivity.tsx` | Header/menu, welcome, home cards, direct Untitled Project creation, local screen switching, and Home focus return |
| Tutorials showcase | `src/components/tutorials/TutorialsScreen.tsx`, `TutorialsScreen.module.css`, `src/lib/tutorials/tutorialCatalog.ts` | Full-screen local static showcase with one featured and three secondary `COMING LATER` cards; no media, workspace action, API, analytics, or persistence |
| Unified read/collection/bootstrap | `src/lib/animation/unifiedProjectSourceReader.ts`, `unifiedProjectCollection.ts`, `unifiedWorkspaceBootstrap.ts`, `legacyRigRetirementV3.ts`, Phase 1 contract/migration | Read-only source access, deterministic combined ordering/availability, typed mapping, fail-closed rig retirement, and stale-safe drawing-only mounted-root publication |
| Project browser | `src/components/open-project/OpenProjectBrowser.tsx` | Preserves the established Projects presentation; lists all supported local sources together, disables invalid entries, and requests one bootstrap/open without source writes |
| Unified workspace wrapper | `src/components/workspace/AnimationWorkspace.tsx` | Converts V2 content to narrow algorithm adapters and mounts exactly one `DrawingWorkspace`; no alternate ordinary Stick coordinator |
| Unified workspace coordinator | `src/components/workspace/DrawingWorkspace.tsx` | Sole ordinary V2 authored-state/dispatcher/history/timeline/render/repository owner; canonical Save/Save As/AI-save; no active Creator or structured-rig save authority |
| Drawing canvas adapter | `src/components/workspace/DrawingCanvas.tsx`, `drawingText.ts` | Imperative raster/text/drawing-symbol tools and transient interaction projected into the unified root; no independent persisted project owner or active structured-rig editor |
| Drawing timeline | `DrawingTimelineRow.tsx`, `timelineStructure.ts`, `timelinePlayback.ts` | Timeline cells, mutations, playback timing helpers |
| Drawing UI panels | `DrawingTopBar.tsx`, `DrawingToolBar.tsx`, `DrawingRightPanel.tsx` | Menus, tools, properties/assets/library presentation |
| Workspace AI UI | `ai/DrawingAiPanel.tsx`, `ai/WorkspaceAiPanelShell.tsx` | Task/reasoning controls, chat state, request/response handling, workspace action dispatch |
| AI contract and task orchestration | `src/lib/ai/drawingAiContract.ts`, `drawingAiTaskPipeline.ts`, `drawingAiTaskExecution.ts` | Shared request/response, command, action, task, memory, and execution contracts |
| AI prompt/planning | `drawingAiPrompting.ts`, `generateFramesRuntime.ts`, task reference-example files | Task classification, prompt assembly, structured plan analysis, validation/recovery |
| AI frame renderer | `drawingFrameExecutor.ts`, `app/engine/stickRig.ts` | Deterministic Canvas2D rendering and generated-frame payload creation |
| AI server route | `app/api/ai/route.ts`, `src/lib/openai/*` | Request orchestration, model calls, normalization, optional search, cost logging |
| Unified project persistence | `src/lib/animation/unifiedProjectRepositoryV2.ts`, `unifiedProjectStorageV2.ts`; legacy Drawing/Stick readers | Sole ordinary V2 version/head repository with content-addressed assets and recovery; legacy schemas remain read-only adoption sources |
| Drawing AI project memory | `drawingAiProjectMemory.ts`, `drawingProjectAiMemorySync.ts`, memory API route | Per-animation-project semantic memory and optional Supabase sync |
| Historical Stick coordinator/source readers | `src/components/workspace/stickfigure/StickFigureWorkspace.tsx` and legacy Stick contracts/storage | Protected historical/test anchor and read-only adoption source; not imported or mounted by the ordinary workspace |
| Stick animation plan/executor | `src/lib/ai/stickFigureAiContract.ts`, `stickFigureCommandExecutor.ts`, `stickFigureMotionEngine.ts`, `stickFigureAiWorkspaceAdapter.ts` | Published SPEC-0004 Phases 1/2/2.5 and SPEC-0005 accepted safety results; rejected/superseded motion work remains unavailable |
| Historical rig/Creator compatibility | `StickFigureCreatorWorkspace.tsx`, legacy Stick contracts/types, `legacyRigRetirementV3.ts` | Creator and structured-rig authoring are unreachable from the ordinary product. Historical parsers/types remain only for validated read/migration and recovery compatibility. |
| Dev cost visibility | `src/lib/ai/devAiCostDashboard.ts`, `app/dev/ai-costs/**` | Local model-call cost logs and dashboards |

## Drawing Project Data Flow

1. The workspace owns React state for layers, frames, active selection, tools, playback, project identity, AI memory, and history.
2. `DrawingCanvas` exposes a narrow imperative ref for authoring snapshots, transient-state cleanup, playback layout, selection/pending-state checks, committed-state marking, and onion-overlay content. Tools, transforms, and asset placement are internal or prop-driven.
3. Pointer/timeline actions save raster/text snapshots into in-memory timeline frames.
4. Manual Save/Save As and AI-triggered Save snapshot the unified V2 root, encode/deduplicate PNG/audio assets, and transactionally publish one unified V2 version/head in IndexedDB. Supported older Drawing and Stick records are read only through non-destructive adoption layers.
5. Open Project lists all supported sources; every valid selection passes through unified read/migration/bootstrap and mounts the sole `DrawingWorkspace` coordinator only after validation/hydration succeeds.
6. Compact AI semantic memory may also sync to Supabase, but artwork remains browser-local.

`DrawingProjectData.version = 1` remains the live Drawing-algorithm adapter shape and contains tool settings, FPS, layers, timeline frames, text, tween data, optional sound attachments, current/selected positions, and counters. It is not the ordinary persistence authority. The unified V2 contract replaces live bitmap/audio bytes with content-addressed asset references and stores project heads plus immutable version records. Drawing AI memory remains auxiliary/project-scoped rather than authored animation content. `DrawingCanvas` still uses its inherited authoring allocation while publishing accepted mutations into the unified root.

Live frame `ImageData` is encoded losslessly as content-addressed bytes with typed-array/data-URL hydration on open; audio is likewise asset-backed. Project-card preview data is separate. Under published SPEC-0006, `UnifiedAnimationDocumentV2.catalogs` already persists project-created symbol definitions and imported asset entries, and symbol instances remain linked by definition ID/digest. `DrawingProjectData` is only a compatibility/algorithm projection and does not own those catalogs. Corrected SPEC-0007 adds bounded raster-paint coverage provenance, drawing-only symbol migration, and stricter still-import validation in separately gated phases without creating an active rig-symbol lifecycle.

## Timeline and History Model

Drawing timeline positions use `kind` (`frame`, `keyframe`, or `tween`), `cellType` (`empty`, `keyframe`, `blank-keyframe`, `hold`, or `tween`), and `stateId` ownership. Workspace frames extend that metadata with bitmap/tween endpoints, a position-only `motionTween` payload, sound attachment, and text objects.

One unified global history is authoritative for authored project state. Inside `DrawingWorkspace`, context-scoped local drawing entries still support bitmap patches, full snapshots, metadata, and timeline snapshots as controlled algorithm mechanics; structural timeline edits rebase those entries and publish through the global owner. Timeline or history work must trace both levels and prove that no local adapter becomes a second project authority.

## Current Render and Export Paths

- Playback reverses/composites all layers and renders text on a separate playback surface.
- Paused editing clears the background and foreground compositing canvases and restores only the active-layer raster to the authoring canvas.
- Project preview generation composites raster bitmaps but not text.
- Current-frame PNG export composites raster bitmaps only at full authoring-world dimensions; it does not include text or crop to the camera stage.

These are code-verified path differences. Their visual severity in realistic projects remains untested.

Proposed SPEC-0008 Phase 6 owns a new canonical-project animation export boundary and independent container/codec/playback validation for the then-approved YouTube-ingestible format; it is not present today. Direct YouTube account upload remains outside V1.

## AI Generate Frames Flow

1. `DrawingAiPanel` collects task controls, user text, workspace context, project memory, and available actions.
2. It posts to `/api/ai` using the shared contract.
3. The server normalizes and analyzes the request, including any search decision and deterministic runtime planning.
4. Deterministic early outcomes can request clarification, return a controlled failure, or return an eligible direct plan without a model call. Requests routed to the structured-model branch select references/model strength and use the OpenAI Responses API with validation, retry, recovery, and deterministic fallback paths.
5. The response returns a generated-frame plan rather than a finished image.
6. `drawingFrameExecutor.ts` renders the plan locally with hardcoded Canvas2D scene/subject/action vocabulary, using the supplied full authoring-canvas dimensions rather than a canonical camera-stage coordinate system.
7. `DrawingWorkspace` applies the returned frame payload to the real timeline.

This is a hybrid deterministic/model-planned procedural renderer, not image generation and not a custom-trained LLM. AI panel messages and follow-ups live only in React session state. The workspace action-plan executor currently implements only `save-project`, `export-current-frame`, and `attach-sound-option-to-frame`; every other contract action returns `false`.

Proposed SPEC-0008 Phase 1 replaces the task/model routing surface with fixed Terra intent/planning and a durable streamed job ledger but deliberately performs no project/video mutation. Later phases replace direct AI project writes with the isolated registered-command boundary described above.

## Historical standalone Stick Figure data flow

The path below remains protected historical/test context and legacy read-source behavior. It is not imported or mounted as the ordinary Phase 7 workspace coordinator.

The published SPEC-0001 sequence now provides one canonical editable editor root with complete poses on controlling keyframes, held cells that resolve their owner pose, history, browser-local Save/Open, onion skin, Creator → Back root continuity, and the writable deterministic Phase 6 wave chat. `StickFigureCanvas` renders canonical 1920×1080 coordinates through a letterboxed viewport and derives the fixed horizontal line head from the editable `head` joint. Pointer movement is transient. A valid release hashes and publishes one candidate document/revision/generation; cancellation, stale instance/generation, remount, and competing completion cases are no-ops.

Published SPEC-0004 Phase 1 extends that same root rather than adding a locked AI format. A strict action-neutral plan supports only ordered `set_timing`, complete independent `create_key_pose`, bounded contiguous `hold_pose`, and terminal `finish` commands. The shared executor materializes wave, jump, bow, and dodge fixtures without action-name branches, validates one figure/one layer/11 joints/8–24 frames/12 or 24 FPS, and holds the result in an isolated candidate. Preview/Cancel/failure do not mutate canonical state. Apply rechecks the captured binding, publishes exactly one history action, and atomically consumes a project-bound latch outside Undo/Redo.

D-0039's published Phase 2 architecture treats the plan's key poses as input only. The hidden local motion engine normalizes the 11-joint body against starter segment lengths, eases hip and shortest-turn segment angles with deterministic cubic smoothstep, rebuilds the 10-segment tree, and materializes every important/in-between/repeated slot as a complete unique keyframe before Preview. Interpolation state is temporary and discarded; there is no hold/tween owner span, motion payload/controller, hidden AI ownership, lock, or post-Apply regeneration. This is intentionally different from Drawing's persistent position-only motion tween. Phase 1's existing materializer remains the default; the separately named Phase 2 option must be selected explicitly.

D-0041 accepts Phase 2.5's exact seven-path result as the timing/spacing primitive only. Its strict `stick.action-timing/v1` sidecar binds to the exact plan and selects one of `ease_in`, `ease_out`, `ease_in_out`, explicit-mechanical `constant`, or paired `impact`/`recovery` for every adjacent important-pose transition. The transaction accepts timing only with the separately named `phase-2.5-timed-motion` materializer, clones/freezes it across `fork()`, rejects missing/cross-materializer timing, hashes the accepted timing into deterministic frame/pose IDs, applies its progress to the unchanged Phase 2 hip/shortest-turn rebuild, and discards the sidecar when complete independent frames are baked. Phase 1 and Phase 2 entry points remain behaviorally protected.

The human review boundary is equally architectural: Phase 2.5 proves timing math, not natural action planning. Its old jump inherited a wave hand and floated, its bow was too compressed, and its dodge reversed while both feet slid. A later unpublished Phase 2.6 attempted an action-specific `stick.action-foundation/v1` validator around full coordinate recipes. Its technical manifest was green, but Arthur rejected the visible motion; its browser proof did not observe a full playback cycle and its frozen expected frames were regenerated through the same implementation path. Those bytes are not accepted or published.

D-0043 replaced that approach with SPEC-0005's strict `stick.movement-goal/v1` boundary. D-0044's Phase 1 proof-only independent reference/full-playback gate is published/integrated. GIT-040 published D-0045's former whole-body-pose authorization, but that executor's technically green result was rejected after visible review and never accepted, propagated, committed, published, or integrated; its disposable app/worktree was removed.

D-0046's exact eight-phase architecture is published at `46b97556…`. D-0047 makes its safety ordering implementable without circularity: selection accepts bound important-pose candidates and no final frames/document, returns checked immutable selected poses, and only the final completion operation accepts rounded/post-repair frames/document and recomputes binding/selection plus all final/semantic rules. The motion engine has exactly one final SPEC-0005 candidate door; movement-goal callers cannot select a legacy materializer or assert trust/skip/action/fixture state. Phase 4's exact twelve-path ceiling includes the safety module and both current validators so mechanics-qualified `grounded anticipation → takeoff → airborne → contact → compression → recovery` can be checked at important-sequence selection and full-baked completion. Phase 2 still rejects airborne; every phase keeps the same bend/continuity/manual-ownership rules. Pretend AI and future Terra use the same safety regardless of 2D direction.

GIT-043 publishes the implemented D-0047/D-0048 route at `e524543…`. Its independent oracle imports no runtime safety/engine/executor module; the bounded evidence covers normal and mirrored elbow/knee bends, torso faults, branch flips, intersections, unsafe rounded/post-repair output, and all declared bypasses. This proves the accepted finite Phase 2 v1 numeric safety contract, not body-local anatomical direction or motion quality.

GIT-044 is exact docs-only commit `269ac82335ee4576cb471bd9dffc8f7ce9bdec0f`. Arthur rejected the Phase 3 executor result authorized from it: an alternate valid IK branch could still yield a visibly backward elbow, a roughly 57-degree elbow passed broad angle limits, candidate enumeration and scoring were too shallow to choose natural whole-body poses, key-step easing created visible stops, neutral recovery kept the arm raised, and a requested wave read as a reach. None of that executor's bytes is accepted or reusable.

D-0050 preserves exactly eight phases while reopening the future Preview dependency as a formal Phase 2 v2 correction. GIT-045 published it at exact commit `a4589664…`. D-0051 closes the remaining architecture gap by making `stick.movement-goal/v1` one bounded ordered semantic sequence: exact non-neutral-capable base binding, requested parts, complete per-landmark facing/support/contact/four-limb/active-part states, adjacent transitions, and exact hold/return/continuation. Phase 2 owns action-independent safety classification for every bounded context and final frame; Phase 3 grounded compound poses; Phase 4 foot/hand/pelvis contact and airborne mechanics; Phase 5 permanent motion law; Phase 6 gait/turns; Phase 7 complete actions/compositions; and Phase 8 the identical provider-free planner door. GIT-046 is published at `55b05e2daad649ac1e0027722a75762a9714d281`. D-0052 §3.2.1 defines front knee flexion as a role-local outward projection, perpendicular to the hip–foot chord, with separate wrong-side, clearance, singularity, and ambiguity failures. GIT-047 supplied the accepted v2 implementation basis; D-0053's accepted technical result is Verified, published, and integrated through GIT-048 at `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`, without changing any phase owner.

Stick saved record version 2 stores that latch beside the editable document/view state. Existing record version 1 remains readable and conservatively defaults to consumed; opening does not rewrite it, while a normal explicit Save writes version 2. After successful Apply, later AI submissions return `AI editing comes later; use manual tools.` before executor/provider work. The normal published chat still recognizes only its prior wave wording; natural-language routing for the broader engine is a later phase.

The blue `PRIVATE REVIEW` fixture controls used for Arthur's acceptance were injected only into a temporary isolated copy by the dedicated browser-proof script. Product source contains no route, picker, overlay, or query-controlled review surface. The workspace keeps an unexported proof-port object for isolated source-copy injection, but product code neither exposes it on `window` nor imports the proof client.

## Final neutral ownership path — intended

```text
Home New/Open → source reader / V2 factory / repository
  → one validated neutral document and command/history root
  → complete mixed cell owner → ordered typed item render/tool adapters
  → one fixed stage, neutral timeline, playback/onion and selection
  → current tools/panels/project catalog → full V2 Save/Save As/recovery
```

No layer has a content kind. Drawing raster/text/symbol and structured Stick items coexist in the same layer/frame. Current ordinary runtime reached the neutral-root/current-tools/all-source-adoption/duplicate-owner-retirement target through published GIT-061 Phase 7. AI code/envelopes/providers/prompts/motion remain protected, with no new AI/manual future-spec capability.

## Protected Architectural Invariants

Until superseded by an approved spec:

- Existing dirty work belongs to the user and must be preserved.
- Drawing and stick workspace IDs remain `drawing` and `stick-figure` in AI contracts.
- Motion-tween V1 remains position-only. Its legacy spec is provisionally promoted as reconciliation guidance pending owner confirmation and a current acceptance rerun.
- A task described as disabled must exit before paid/output-generating execution.
- AI-produced changes must enter the same timeline/project state a human edits.
- Live AI tests are opt-in because they can spend money and contact external systems.
- Supabase service-role credentials remain server-only.
- `docs/` is current memory; domain-reference prose cannot override verified code by accident.

## Navigation and Coordinate Boundaries

`DrawingWorkspace` now receives the accepted SPEC-0010 Save-and-Exit/Home path. Home Tutorials opens a local full-screen showcase and returns with focus restored; the Home header is not mounted inside Tutorials. Home AI Credits was removed. Accepted SPEC-0012 Phase 1 gives only AI Assistant a dedicated `/assistant` local shell and focus-restoring Back; AI Project Finalizer remains inert. Export opens the accepted SPEC-0009 flow. Refresh from Tutorials returns Home.

`DrawingCanvas` computes an authoring-world scale of 4.6 from camera limits. Six authoring canvases allocate `hostWidth × 4.6 × DPR` by `hostHeight × 4.6 × DPR`, or 21.16 times host pixel area per canvas at DPR 1 and 84.64 times at DPR 2, before the separate playback surface and history snapshots. A stable document/stage coordinate contract is therefore a prerequisite for treating viewport, memory, AI placement, persistence, and export independently.

## Regression Hotspots

The following surfaces require a dedicated spec and targeted regression matrix for structural changes:

- `DrawingWorkspace.tsx`: central state, mirrored refs, history rebasing, playback, persistence, and AI insertion
- `DrawingCanvas.tsx`: imperative multi-canvas editor and transient interaction sessions
- `app/api/ai/route.ts`: classification, routing, prompting, search, response normalization, disabled-task exits, cost logging
- `drawingAiPrompting.ts` and `generateFramesRuntime.ts`: output quality and stateful reasoning
- `drawingFrameExecutor.ts`: visual vocabulary and deterministic rendering
- drawing and stick timeline row components: duplicated structural behavior with different content models

Incidental cleanup inside these files is prohibited unless the active spec includes it and verification covers the affected systems.

## Known Architectural Gaps

- stable document/stage coordinate system and resolution
- complete, versioned project schema and migrations
- durable autosave/recovery and project-file import/export
- unified render/composite contract across edit, playback, save, reopen, and export
- broader Stick scene/language/model behavior beyond published SPEC-0004 Phases 1–2.5; rejected motion attempts are not runtime truth, SPEC-0005 Phase 2 v1 is only the published numeric-safety foundation, corrected Phase 2 v2 is Verified, published, and integrated through GIT-048 at `05faa59195c6d5f2d8a11ebcc9ab77fe1b6fdf14`, and SPEC-0005 Phase 3's later visible result is rejected/unpublished and unfinished Phases 3–8 are superseded/inactive under D-0055
- general AI editing, recoloring, continuation, and multi-step transaction semantics after Apply
- authenticated user/project ownership and rate limiting
- repeatable unit/integration/E2E suite and CI
- production animation export
- modular boundaries around very large coordinator/runtime files

These gaps belong in dedicated specs; this map does not prescribe their implementation.
