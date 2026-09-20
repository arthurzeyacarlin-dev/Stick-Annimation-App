# SPEC-0009 — Animation Export

Status: **Approved; Phase 1 accepted and technically Verified; control-plane propagation complete; publication/integration pending; Phases 2–3 Unauthorized**
Owner: Arthur
Task role: phased implementation; the current Control Plane Architect task records the accepted Phase 1 result without changing its technical bytes
Created: 2026-09-20
Last updated: 2026-09-20
Decision links: [D-0094](../DECISIONS.md), [D-0096](../DECISIONS.md)
TODO IDs: `PLAN-009`, `SPEC-009`, `EXPORT-001`–`EXPORT-003`
Planning base: detached SHA `888aae769e67e08adb1862c81f21bec171fd0592`, contained by `codex/spec0008-phase1-correction-authorization`; index empty before edits
Accepted Phase 1 base/HEAD: `37cdb7203286c2ea333a3766ba2e81bc06830200`; empty index; exact 12-path implementation/proof allowlist
Accepted Phase 1 manifest: `output/spec-0009/phase-1/proof-manifest.json`, 8,688 bytes, SHA-256 `40af1b220958a5d99094a07c763194b4cb6e2338ee6e14f0b2674a671564c2fb`
Visual reference: `/Users/arthurcarlin/Projects/stick-animation-app/diamond-export-flow.html`, used only for product-flow and visual-language guidance, never as runtime or technical authority

## 1. Exact product outcome

Diamond Animator will provide one truthful, local-first animation export flow from both the Home screen and the Animation Workspace. A user will:

1. choose a saved animation from cards that identify the animation by thumbnail, name, last-edited time, and exact saved duration;
2. confirm **Use this animation**;
3. watch the actual selected saved animation with play, pause, and scrub controls, or choose **Change animation**;
4. choose a filename, a 720p or 1080p quality tier, and—after the social catalog exists—a destination preset whose shape and file guidance are explained before export;
5. create a real video containing the saved animation's complete frames, visible layers, authored/generated background, drawings, text, assets/symbols, timing, and authored audio; and
6. choose a macOS Finder save location and receive a validated local file or a truthful cancelled/failed result.

The first release saves to the Mac only. It does not sign in to, upload to, post to, or manage an account on YouTube, TikTok, Instagram, Facebook, Discord, Snapchat, X, Reddit, or any other service. Destination choices are local file-preparation presets, not integrations.

The outcome is exactly three separately authorized implementation phases:

| Phase | Outcome | Authorization state |
| --- | --- | --- |
| 1 — Choose and Watch | Both entry points open the saved-animation chooser and a real selected-animation player. | Accepted; technically Verified; CPA propagation complete; publication/integration pending |
| 2 — Create and Save Video | The selected immutable saved revision becomes a validated local 720p/1080p video through a truthful Finder flow. | Proposed; Unauthorized; Not started |
| 3 — Social Destinations and Final Testing | A versioned destination catalog prepares correctly shaped local files and closes whole-feature proof. | Proposed; Unauthorized; Not started |

No row authorizes the next row. Arthur separately approved the whole spec and authorized Phase 1 before its executor began. Phase 2 still requires Phase 1 to be published, integrated, synchronized, proof-preserved, cleaned up, and separately authorized. Phase 3 requires the same closeout for Phase 2.

## 2. Relationship to SPEC-0008 and permanent boundaries

D-0093 remains fully controlling: SPEC-0008 Phase 1 stays accepted and closed, while its Phases 2–6 stay **Paused; Unauthorized; Not started; not rejected**. SPEC-0009 is an independent manual product capability. It does not revive, copy, dispatch, or complete SPEC-0008 Phase 6. It adds no AI Animator job, reference-video provider, slicer, reconstruction, registered conversational edit, paid operation, asset purchase, or deployment.

The export flow may read an animation that contains content previously authored by any accepted path, including manual work or accepted AI-generated content already saved in the ordinary V2 project. Export itself:

- makes no OpenAI, Terra, video-provider, social-network, analytics, telemetry, or other external request;
- consumes zero AI credits and must prove that the credit state is unchanged;
- does not change the selected project, create a project version, write history, mutate the repository, or silently save unsaved workspace edits;
- does not create a second animation document, persistence owner, renderer truth, or migration engine;
- does not expose direct account login/upload/posting in V1; and
- does not weaken save/open, no-loss raster, drawing-only, undo/redo, timeline, Assets, AI Animator, or credit protections.

## 3. Verified current behavior and execution path

This proposal is based on a fresh 2026-09-20 source trace and real-app browser check against the published runtime lineage. The planning worktree is detached at `888aae769e67e08adb1862c81f21bec171fd0592`; the available running app was from canonical runtime `42bfe1a2607a85a87d486e21d6e573b4e4084d5a`. The commits differ only in control-plane files relevant to the already-published SPEC-0008 closeout, so the checked export/runtime paths are byte-identical for this trace.

### 3.1 What the user can do now

- Home renders an **Export** button and the caption **Export your animation**, but the button has no handler. Activating it leaves Home unchanged.
- In the Animation Workspace, **File** contains **Save** and **Save As** only. There is no Export item.
- The workspace displays and plays a real multi-layer timeline, with the current project defaulting to 12 FPS and the authored stage currently fixed at 1920×1080.
- There is no saved-animation export chooser, selected-animation export player, video encoder, destination catalog, Finder save-location flow, export progress, or export cancellation UI.

### 3.2 Current live code path

```text
Home
  app/page.tsx:1047
    → visible Export button with no onClick

Workspace File menu
  DrawingWorkspace.tsx:8912
    → DrawingTopBar onSave / onSaveAs
    → DrawingTopBar.tsx:67, 130–181
    → Save and Save As only

Saved-project discovery/open
  OpenProjectBrowser.tsx:42
    → listProjectCollection(createBrowserProjectSourceReader())
    → collection bootstrap / read-only legacy normalization where applicable
    → unified V2 repository and storage head/version validation

Playback
  DrawingWorkspace.tsx:4137, 7778–7840
    → getAuthoredPlaybackFrameCount(...)
    → timeline FPS pacing
    → visible-layer bitmap/drawing/text composition
    → frame-bound soundAttachment playback

Only existing export-labelled operation
  AI action export-current-frame
    → DrawingWorkspace.tsx:7962 exportCurrentFrame()
    → current frame only
    → active snapshot plus raster bitmap layers only
    → first bitmap dimensions, white canvas, PNG data URL
    → hidden anchor download: <project>-frame-<n>.png
```

### 3.3 Why the existing helper is not this feature

`exportCurrentFrame()` is a narrow current-frame PNG helper. It refuses while playback is active, composites raster bitmaps at `(0, 0)` onto white, omits text and audio, does not export a timeline, has no stage/output framing contract, and does not use a Finder location picker or validate a written video. It is reachable through the legacy `export-current-frame` AI action contract rather than an ordinary visible export flow. It must not be relabelled or expanded opportunistically into SPEC-0009.

`createProjectPreview()` is currently unused and is also raster/white-background-oriented. It is not an authoritative thumbnail or export compositor and must not become one without satisfying this spec's shared-renderer fidelity gates.

### 3.4 Existing data and system facts to preserve

- `UnifiedAnimationDocumentV2` owns integer FPS in the accepted 1–55 range, ordered layers/cells, raster/text/symbol items, catalogs, and frame sound attachments. Current authored stage geometry is 1920×1080 with top-left origin.
- `getAuthoredPlaybackFrameCount` derives duration from the last non-empty authored cell across layers. The exact saved duration is `authoredFrameCount / fps`; empty projects require an explicit empty-state result rather than a fabricated one-frame video.
- V2 storage heads include project ID, title, created/updated times, active revision, project digest, stored byte length, and provenance. They do not currently contain an authoritative thumbnail or duration.
- V2 repository reads validate and hydrate the selected current/last-good version. Save, Save As, Open, read-only migration, and adoption already have accepted ownership boundaries.
- Current playback composes more content than `exportCurrentFrame()`: visible layer order, raster/drawing sources, text rendering, stage/background presentation, and sound attachments. Even playback is not automatically export truth until one shared deterministic compositor contract is proved.
- One project can have up to 64 layers and 10,000 cells per layer under the current V2 contract. Export must stream bounded work; it may not retain an unbounded array of uncompressed frames.

### 3.5 Accepted Phase 1 implementation and review correction

D-0096 records Arthur's acceptance of the corrected app copy. The accepted implementation:

- connects Home **Export** and workspace **File → Export** to one `AnimationExportFlow`;
- lists through the accepted project collection reader, revalidates entry identity before hydration, clones one saved V2 snapshot, derives authored frame count/duration from saved FPS, and rejects changed/unavailable sources;
- requires an explicit ready card plus **Use this animation**, then renders the saved snapshot with Play/Pause, frame scrubber and **Change animation**;
- keeps the mounted workspace alive while Export is open and truthfully states that unsaved workspace changes are excluded;
- resolves saved owner/hold/tween raster placement through the workspace's centered 4.6× authoring-world transform and saved-FPS accumulator;
- replaces unsupported Save As `window.prompt` with an accessible in-app dialog; and
- gives Terra conversation its own missing-key error without changing its model, reasoning, job, transcript, gradient or mutation boundaries.

The final two bullets are explicitly owner-authorized regression repairs discovered during visible Phase 1 review. They are included in the accepted 12-path boundary even though the original entry-gate prose excluded AI files and treated Save As only as protected behavior. They do not authorize any broader Save/persistence or SPEC-0008 work.

The immutable manifest is PASS and freshly VALID with 16 validation assertions. Bound proof includes 25 oracle assertions, 23 real-app correction assertions, TypeScript, focused lint and a production build. Deterministic browser proof used one no-cost Terra double and zero external/provider calls. After local server-only credential setup, a separate one-message real Terra smoke returned `Hello — connection confirmed.` with zero console errors; no credential value is recorded.

Phase 1 does not claim video encoding, Finder writing, social/destination choices, final export-fidelity background ownership or Phase 2 completion. The player currently supplies a white display matte before saved content; Phase 2's project-owned background and no-export-only-white contract remains an entry gate and may not silently treat that display matte as final exported background truth.

## 4. Product and ownership invariants

### 4.1 One immutable selected source

Export reads one exact saved source snapshot. Confirmation creates an `ExportSelectionV1` bound to source kind, source identity, project ID, resolved revision, project digest, saved update time, document digest, asset/catalog digests, FPS, authored frame count, and duration. It is immutable for the export session.

Before Watch and again before encoding, the flow re-reads and verifies the source. A changed, deleted, corrupt, stale, cross-project, or digest-mismatched source fails closed and asks the user to return to **Change animation**. It never silently switches to the newest revision.

### 4.2 No repository mutation

Listing, thumbnail generation, selection, watching, scrubbing, preparing a request, exporting, cancellation, failure, and success are read-only with respect to authored project data, project heads/versions, catalogs, history, AI memory/jobs, and workspace state. Temporary export records live outside the project repository and are removed or bounded according to Section 12.

Opening export from a workspace does not auto-save. If the mounted workspace has unsaved changes, the chooser identifies that export uses the last saved revision. It may preselect the current project only when its bound saved head/revision/digest can be proven; it still requires **Use this animation**. Never include unsaved bytes without a separate user-initiated ordinary Save followed by a fresh selection.

### 4.3 Reuse the accepted open pipeline

Saved-animation discovery reuses the existing project collection/source reader and bootstrap validation. Native V2 entries resolve directly. Existing legacy source kinds may be displayed and normalized only through the accepted read-only migration/bootstrap path; selection may not write/adopt/migrate them. If a source cannot yield a complete validated normalized snapshot, its card remains visible with an actionable **Open and save as an Animation Project first** or corruption reason. SPEC-0009 must not fork legacy conversion.

### 4.4 One canonical render truth

The selected-animation player, export preflight, thumbnail generation, output-frame generator, and final comparison proof must consume one versioned canonical read-only scene evaluator/compositor. The evaluator resolves the exact saved frame at a timestamp, including holds/tweens, layer order and visibility, raster/drawing content, text, symbols/assets, project stage/background, and any accepted transformations/effects. UI chrome, selection handles, onionskin, guides, cursor, tool overlays, and inactive/dormant source content are excluded.

If implementation analysis finds that current playback contains a visual behavior that cannot be deterministically reconstructed from the saved V2 document and catalogs, that is a phase entry blocker. The executor must stop for a spec correction; it may not approximate, flatten, capture the screen, or omit the content silently.

## 5. User flow and states

### 5.1 Entry points

- Home **Export** opens the full export route at Choose.
- Animation Workspace **File → Export** opens the same route and same state machine. It is not a second dialog or alternate exporter.
- Browser Back or an explicit **Back** returns to the originating surface without changing the project.
- A direct/reloaded export route can recover only non-sensitive selection metadata whose digests still validate; an in-progress encode/write is not claimed to have resumed.

### 5.2 Choose

Cards are sorted by saved `updatedAt` descending, with deterministic title/project-ID tie-breaking. Each usable card shows:

- a thumbnail derived lazily from the exact saved revision through the canonical compositor;
- the saved project name;
- localized **Last edited** time plus a machine-readable exact timestamp for assistive text;
- duration derived from authored frame count and saved FPS; and
- selection/focus state.

Thumbnail caches are derived, versioned, digest-bound, disposable, and outside the authored project/version record. A missing thumbnail shows a neutral placeholder while generation runs. A failed thumbnail does not make a valid project unselectable. Card selection alone does not advance. **Use this animation** is disabled until exactly one valid saved snapshot is selected.

States are Loading, Ready, Empty, Unavailable entry, Collection failed, and Selected. Empty explains how to create and save an animation. Collection failure offers a local Retry. A corrupt/unavailable entry never disappears silently.

### 5.3 Watch and configure

After confirmation, the heading and accessible name say **Selected animation** or **Watch animation**, never **Preview**. “Preview” is reserved for uncommitted candidate semantics elsewhere in Diamond Animator.

The player shows the actual selected snapshot with:

- play/pause;
- scrubber with current time and total duration;
- exact first/last-frame reachability;
- audio synchronized to the same saved frame clock;
- ended/replay state; and
- **Change animation**, which stops media, releases player resources, and returns to Choose.

Player playback does not need to encode a video. It must use the same scene evaluator and timing contract that export will use. Scrubbing cancels scheduled audio, seeks visual state immediately, and restarts only on an explicit play action. Hidden/offscreen pages stop playback.

The configuration panel shows a validated filename, read-only saved FPS, exact duration, selected destination, output dimensions/aspect, container guidance, and 720p/1080p quality. FPS is inherited and cannot be edited. There is no white-background checkbox or separate export-background control.

### 5.4 Create, choose location, write, and finish

The user activates **Export video** and local preflight runs. When preflight succeeds, the primary action becomes **Choose save location**; the user's activation of that control immediately requests a macOS Finder save location with the validated suggested filename and required extension. This explicit second activation preserves browser user-activation requirements instead of relying on an asynchronous preflight to keep permission. Cancelling Finder is a normal **Cancelled** outcome, not an error.

The system then renders, encodes, writes, closes, and validates the selected file. It reports success only after the file is closed and the produced container passes the post-write inspection contract. Success identifies filename, dimensions, duration, FPS, container/codecs, and local completion without retaining or exposing the full filesystem path.

## 6. Core data contracts

All records are schema-versioned, size-bounded, same-origin/local, and rejected on unknown required values.

### 6.1 `ExportSelectionV1`

```text
schemaVersion: "export-selection/v1"
selectionId: random local identifier
sourceKind + sourceIdentity
projectId + title
resolvedRevision + projectDigest + documentDigest
catalog/asset digest set
savedCreatedAt + savedUpdatedAt
logicalStage { width, height, origin, axes }
fps + authoredFrameCount + durationMs
createdAt
```

The record contains no project payload, file path, account token, provider ID, AI prompt, or user analytics identity.

### 6.2 `ExportRequestV1`

```text
schemaVersion: "export-request/v1"
requestId + selectionId
selection/project/document/catalog digest binding
sanitizedBaseFilename
qualityTier: "720p" | "1080p"
destinationPresetId + catalogVersion
framingMode: "contain-complete-animation"
sourceStage + outputCanvas + contentRect + padding description
fps + totalFrames + durationMs
container + videoCodec + audioCodec/none
rendererVersion + encoderVersion
createdAt
```

`fps`, `totalFrames`, and `durationMs` are copied from the validated selection and are not client-editable. `contentRect` must preserve source aspect; no transform may crop source pixels.

### 6.3 `ExportJobV1`

```text
schemaVersion: "export-job/v1"
jobId + request digest
state + monotonic event sequence
stage + real completed/total units
bytesWritten when known
startedAt + updatedAt + endedAt
cancellationRequestedAt/none
terminal error code/none
postWriteInspection/none
```

Allowed state transitions are:

```text
preflighting → awaiting-location → rendering → encoding → writing → validating → succeeded
       any non-terminal state → cancelling → cancelled
       any non-terminal state → failed
```

Terminal states are immutable. Reload or worker loss becomes **Failed: interrupted**, never Succeeded or an indefinitely running job.

### 6.4 `ExportDestinationCatalogV1`

```text
schemaVersion + catalogVersion + verifiedAt
entry[] {
  id + displayName + category
  aspectRatio + 720p dimensions + 1080p dimensions
  preferred container/codecs
  local-file guidance + size/duration notes
  framing explanation
  brandAsset { kind, localAssetId, provenance, license, verifiedAt } | textFallback
}
sourceProvenance[]
```

The production catalog is shipped locally and read without runtime network access. Guidance is not a guarantee that a third-party service will accept the file forever.

## 7. Video fidelity and timing contract

### 7.1 Frame range and cadence

- Export uses exactly `authoredFrameCount` source frames, numbered `0…count-1`.
- Source frame `i` is evaluated at exact project time `i / fps`.
- Output duration is exactly `authoredFrameCount / fps`, subject only to a codec/container timestamp tolerance of half one project frame in inspection.
- No frame-rate selector, interpolation, cadence conversion, hidden minimum duration, duplicate tail, or dropped final frame is allowed.
- Holds and tweens resolve by the accepted timeline semantics. An empty project cannot export and receives an actionable **This saved animation has no authored frames** result.

### 7.2 Visual content

Every exported source frame must contain the complete canonical composite of all and only visible saved content:

- ordered visible layers;
- raster bitmap/drawing content through the accepted no-loss path;
- all text with saved font/layout/alignment/color semantics;
- symbols and asset instances using saved catalog references;
- authored/generated stage background as project content;
- accepted transforms, opacity, tween state, and effects that current saved playback can express; and
- exact authored stage bounds.

No export-only white fill is injected. There is no white-background control. If project background ownership is absent, ambiguous, transient-only, or not reproducible after reopen, Phase 2 is blocked until an approved project-owned background contract exists; the exporter cannot guess from CSS or current screen pixels.

### 7.3 Output geometry

For **Original**, output fits the complete logical stage within the chosen tier's bounding box while preserving aspect ratio and using even pixel dimensions. With the current 1920×1080 stage, 720p is exactly 1280×720 and 1080p is exactly 1920×1080.

Destination presets use the exact catalog canvas. The source stage is uniformly scaled into the largest centered `contentRect` that fits. Any remaining canvas area is disclosed as padding. Padding uses the project-owned exported stage background when that background has a defined full-canvas fill; otherwise it uses one fixed neutral matte defined by the catalog renderer and labelled **padding**, not a hidden background replacement. V1 exposes no Fill/Crop mode. The default and only V1 framing mode is **Fit complete animation**.

### 7.4 Audio

Saved sound attachments start at their exact frame timestamp, overlap/mix deterministically, retain the decoded authored audio content, and are trimmed or padded with silence to the exact animation duration. No sound is normalized, regenerated, substituted, delayed, or dropped silently. An animation with no authored audio exports with no audio track. An unreadable, unsupported, missing, or cross-bound sound attachment fails preflight with the affected frame/layer identified; the user must repair/remove it before a faithful export.

Phase 2's target file is MP4 with H.264 video and AAC audio when authored audio exists. The phase entry review must prove a locally executable, redistribution/licensing-compatible encoder for the supported macOS browser/runtime and bind its exact version. If that proof fails, implementation stops for an owner-visible spec amendment. WebM or another container may not be substituted while the UI claims MP4/social compatibility.

## 8. Progress, cancellation, failure, and recovery

Progress is based only on actual work:

- preflight checks completed/total;
- frames rendered/total;
- frames submitted or encoded/total;
- bytes written when available; and
- validation checks completed/total.

The UI labels the current stage and exposes a determinate percentage only when a real numerator and denominator exist. It never advances by timer. Renderer, encoder, writer, and validator failures retain the last real count and show one stable error code plus plain-language recovery.

**Cancel export** is available during rendering, encoding, and writing. Cancellation signals the renderer and worker, stops new frames, flushes no success, closes/releases codecs, revokes object URLs, removes temporary buffers, and terminates in **Cancelled**. If the browser/file API cannot remove an already-created partial file, the writer must truncate it to zero where permitted and tell the user exactly that a partial/empty file may remain; it cannot claim cleanup it did not verify.

Finder cancellation, permission denial, insufficient space, encoder unavailable, worker crash, source changed, corrupt asset, audio decode failure, validation mismatch, and write interruption have distinct error codes. Retry creates a new job from a freshly revalidated selection; it never resumes an unverified partial byte stream.

## 9. Accessibility and interaction requirements

- Choose is a labelled collection of keyboard-reachable cards with one selection state. Arrow-key behavior, focus order, and visible focus are deterministic.
- Thumbnail alt text does not attempt to narrate artwork; the card's name/time/duration carries identity.
- **Use this animation**, **Change animation**, **Play/Pause**, scrubber, quality, destination, filename, **Export video**, **Choose save location**, and **Cancel export** have unique accessible names and visible labels.
- The scrubber is a correctly bounded slider with current/total time, keyboard increments of one saved frame, Home/End support, and no audio burst while scrubbing.
- Ordinary progress uses `role="status"`/polite live announcements with throttled meaningful increments; actionable terminal failure uses one assertive announcement. Focus is not stolen on progress or success.
- Error text is adjacent to its field/control and not color-only. Selection, unavailable, and focus states meet accepted contrast rules.
- Reduced motion disables ornamental thumbnail/player/progress animation without hiding state or slowing work.
- At 200% zoom and the accepted minimum viewport, controls remain reachable without two-dimensional page scrolling. The video canvas may scale visually but preserves its aspect and complete content.

## 10. Brand and destination-preset rules

Phase 3 ships a data-driven catalog containing at least:

| Preset | V1 preparation |
| --- | --- |
| Original | Saved stage aspect; 720p/1080p bounding box |
| YouTube | 16:9; 1280×720 or 1920×1080 MP4 |
| YouTube Shorts | 9:16; 720×1280 or 1080×1920 MP4 |
| TikTok | 9:16; 720×1280 or 1080×1920 MP4 |
| Instagram Reels | 9:16; 720×1280 or 1080×1920 MP4 |
| Instagram Stories | 9:16; 720×1280 or 1080×1920 MP4 |
| Instagram Feed | 4:5; 720×900 or 1080×1350 MP4 |
| Facebook Reels | 9:16; 720×1280 or 1080×1920 MP4 |
| Facebook Feed | 4:5; 720×900 or 1080×1350 MP4 |
| Discord | Original shape; MP4 with current verified local-file size guidance |
| Snapchat | 9:16; 720×1280 or 1080×1920 MP4 |
| X | 16:9; 1280×720 or 1920×1080 MP4 |
| Reddit | Original shape; MP4 with current verified local-file guidance |
| Custom / Other | Original, 16:9, 9:16, 1:1, 4:5, or validated custom even-pixel canvas |

For Custom / Other, custom width and height are integers from 256 through 1920 inclusive, must be even, and may not exceed 1920×1920. The quality selector is replaced by the explicit custom dimensions only while Custom dimensions is selected. The source still uses **Fit complete animation**; custom dimensions never imply crop.

Each preset plainly shows why the shape differs from the saved animation, the output canvas, fitted content rectangle, expected padding, container/codecs, and current official file/duration guidance. Selecting a preset updates the player framing overlay before export. It never changes the project or silently crops. Platform limits that cannot be verified are labelled **Check the destination before posting**, not invented.

At Phase 3 entry, the executor refreshes mutable platform facts from official first-party sources, records source URL/title/access date and the exact catalog values, and returns any product-changing conflict for review. The production app performs no runtime lookup. Logos are allowed only from official assets whose terms permit the exact bundled use, with local provenance/license/hash/verification date. Otherwise the UI uses the service name and a neutral local icon. No scraped mark, recreated trademark, misleading endorsement, or remote logo URL is allowed.

## 11. Performance and resource limits

The architecture must stream frames through a worker-capable pipeline. It may hold at most two full uncompressed output frames in application-owned queues at once, plus explicitly bounded codec buffers. It must apply backpressure rather than rendering the complete animation into memory.

Reference-machine proof records hardware, macOS/browser versions, build mode, encoder version, input fixture digest, and measurement method. Minimum gates are:

- 64 saved-project entries: usable chooser content within 1,000 ms; thumbnails remain lazy and cannot block card text/selection.
- Selected 60-second, 24 FPS, eight-visible-layer 1080p fixture: first player frame within 2,000 ms and play/scrub visual response p95 within 250 ms.
- Five-minute, 24 FPS, eight-visible-layer plus text/assets/audio 720p fixture: export completes within 10 minutes.
- Sixty-second version of the same fixture at 1080p: export completes within 4 minutes.
- Peak settled JS heap stays at or below 512 MiB and no more than 256 MiB above the settled selected-project baseline, where the supported browser exposes reliable measurement.
- Cancel acknowledgment stops frame production within 250 ms p95 and reaches terminal Cancelled within 2 seconds after codec/file close, excluding an operating-system permission prompt outside app control.
- Main-thread tasks caused by export remain under 250 ms; any exception is enumerated with trace evidence and must not block the Cancel control.

A missed gate is a failed phase, not a reason to weaken fidelity, drop audio/content, reduce the measured fixture, or invent progress.

## 12. Security, privacy, cost, and local storage

- Export operates entirely on local saved project bytes and bundled code/assets. A network assertion must prove zero non-loopback requests for chooser, watch, export, cancellation, validation, and preset changes.
- No AI/model/provider/social credential is requested or read. AI credits and any account balances are snapshotted before/after relevant proof and must be unchanged.
- File handles are used only for the active explicit export job, are not persisted after terminal state, and are never placed in project bytes, logs, analytics, screenshots, or proof manifests.
- Filenames are Unicode-normalized, control/path separators and reserved names are rejected or replaced, the base is bounded to 120 code points, and the extension is enforced exactly once. A blank name resolves to a sanitized project-title default.
- Project titles, artwork, file paths, audio, exported bytes, and thumbnails are not logged. Proof uses synthetic fixtures only.
- Object URLs, decoded audio, image bitmaps, workers, codec resources, derived thumbnail cache entries, and temporary job records are bounded and released on change/cancel/failure/success/unmount.
- Export never evaluates project text as HTML/code, follows catalog URLs at runtime, fetches arbitrary asset URLs, or trusts MIME/extension without decoding and digest validation.
- New dependencies require exact version, source, license, browser/runtime support, local-only behavior, supply-chain review, and bundle impact in the phase packet. A CDN dependency is forbidden.
- V1 has no paid operation and no variable service cost. Significant local CPU/storage use is disclosed before starting a long export.

## 13. Scope and non-goals

In scope:

- two entry points into one export flow;
- saved-animation chooser and exact saved-snapshot player;
- local MP4 creation with faithful video/audio, 720p/1080p, exact project timing/FPS, truthful progress/cancel/failure, and Finder location selection;
- local destination preparation through a versioned preset catalog;
- regression/fidelity/performance/accessibility/security/privacy/cost proof.

Explicitly out of scope:

- direct social login, OAuth, upload, posting, scheduling, publishing, analytics, remote storage, share links, cloud render, or server render;
- AI generation, Terra calls, credits, prompts, AI Animator job/status changes, reference-video generation, reconstruction, or any SPEC-0008 Phase 2–6 work;
- editing, saving, Save As, project migration/adoption, new project versions, history entries, or unsaved-workspace export;
- editable export projects, GIF/image-sequence/audio-only export, alpha video, subtitles/captions, watermarking, crop/fill/reframe controls, FPS changes, codec settings, bitrate controls, or arbitrary resolutions beyond Custom / Other's bounds;
- Windows/Linux/mobile save flows, third-party browser behavior, deployment, or public-beta authorization; and
- redesign of Home, Workspace, timeline, manual tools, AI sidebar, credits, or Save/Open outside the narrow Export entry/control additions.

Direct service integrations require a future separate spec with provider terms, authentication/token ownership, permissions, privacy/retention, upload retry/idempotency, account selection, moderation, cost, and revocation. Nothing in SPEC-0009 pre-approves that work.

## 14. Protected regressions

Every phase re-runs the existing focused and permanent proof relevant to its surface. At minimum, it must prove unchanged:

- V2 Save, Save As, reopen, last-good recovery, exact project/version digests, and all existing project source kinds;
- no-loss raster editing, same-paint coverage, drawing symbols/assets, text, timeline cells/holds/tweens, FPS editing in the authoring workspace, playback, and audio attachment/removal;
- layer order/visibility and project stage geometry;
- Undo/Redo and history ownership, with zero history entry from every export action;
- manual capability registry and future-AI command eligibility;
- accepted AI Animator Phase 1 Terra-only conversation/jobs, sidebar/timeline presentation, failure behavior, and project isolation;
- zero export-triggered AI request and unchanged credits;
- Home New/Open/Tutorials, workspace navigation, and File Save/Save As;
- existing current-frame PNG AI action, which remains behaviorally unchanged unless a later separately scoped decision retires it; and
- no publication/deployment/provider/account/network changes.

## 15. Implementation phases and stop gates

### Phase 1 — Choose and Watch — accepted/technically Verified; publication pending

Accepted outcome:

- wire Home **Export** and workspace **File → Export** to one export route/state machine;
- list existing saved animations through the accepted collection/source reader with valid/unavailable states;
- show lazy digest-bound thumbnail, name, last-edited value, and exact saved duration;
- require explicit card selection and **Use this animation**;
- hydrate and bind the immutable exact saved snapshot;
- show the real selected-animation player with play, pause, scrub, audio, exact timing, and **Change animation**;
- show non-functional downstream configuration as unavailable only if needed for coherent navigation; do not fake video creation.

Historical Phase 1 implementation entry gates:

1. Arthur explicitly approves SPEC-0009 and separately authorizes Phase 1 from an exact synchronized canonical-main SHA.
2. The executor traces all project source kinds and freezes the exact read-only discovery/hydration path.
3. The executor defines the canonical read-only evaluator needed by thumbnail/player without claiming unproved export fidelity.
4. The exact phase allowlist excludes AI/SPEC-0008/control-plane/provider/deployment files.

Phase 1 acceptance flow:

1. From Home, activate Export; choose a saved animation; inspect card name/time/duration; activate **Use this animation**.
2. Verify the exact saved animation appears; play, pause, keyboard-scrub to first/middle/last frames, and hear frame-bound audio in sync.
3. Activate **Change animation**, select a different saved revision, and prove the first snapshot's resources/state do not leak.
4. Repeat from workspace File → Export with unsaved workspace changes; prove the UI says it uses the saved revision and does not save or include unsaved bytes.
5. Exercise empty collection, corrupt/unavailable entry, stale digest after selection, thumbnail failure, reload, reduced motion, keyboard-only, and 200% zoom.

Phase 1 technical proof must bind source/test/fixture hashes; exact collection entries and digests; no repository writes/history changes; player frame/timestamp/audio receipts; thumbnail non-authority; source-kind outcomes; accessibility snapshots; screenshots/video of both entries and Change flow; 64-card and player performance; zero external requests; unchanged AI credits; existing regression results; and an independently mutation-tested manifest.

Phase 1 excludes encoding, Finder writing, progress claims, social presets beyond a disabled/absent placeholder, logos, and every later-phase capability. Its implementation is accepted and propagated but is not durably complete until the later publication/integration/synchronization/proof-preservation/cleanup turn succeeds. It does not authorize Phase 2.

### Phase 2 — Create and Save Video

Authorized outcome, if separately approved after Phase 1 closure:

- implement the versioned selection/request/job contracts;
- make the canonical evaluator/export compositor cover all saved visual content and project-owned background;
- deterministically mix saved audio;
- export exact saved frames/timing to licensed local H.264/AAC MP4 at Original 720p or 1080p;
- select a location through the supported macOS Finder flow;
- show real progress, responsive cancellation, distinct truthful failures, and post-write validation;
- keep all work local with zero AI credits/network/provider calls.

Phase 2 implementation entry gates:

1. Phase 1 is fully closed and Arthur separately authorizes Phase 2 from the resulting synchronized SHA.
2. A saved/reopened project-owned background contract is proved. Ambiguous CSS/transient background ownership blocks implementation.
3. The shared evaluator proves parity for raster, text, symbols/assets, visibility/order, holds/tweens, transforms/effects, and audio inputs.
4. Exact H.264/AAC encoder choice, license, redistribution, supported-browser behavior, worker model, memory bounds, and macOS file-picker behavior are documented and accepted. No codec/provider download is needed at runtime.
5. Synthetic fidelity fixtures cover every supported content kind, overlap/mix audio, empty/corrupt content, maximum safe boundaries, and long duration.

Phase 2 acceptance flow:

1. Select a saved mixed-content/audio animation and compare the player against its reopened workspace playback.
2. Export 720p, choose a Finder location, inspect the written MP4, and verify exact dimensions/FPS/frame count/duration/content/audio synchronization.
3. Repeat at 1080p and verify the selected filename/extension and overwrite/permission behavior.
4. Cancel in rendering, encoding, writing, and Finder; prove terminal state, bounded cleanup, no success, and truthful partial-file outcome.
5. Trigger source-change, corrupt asset, audio decode, encoder, insufficient-space/permission, interrupted-worker, and validation failures; prove no project/history/version/credit/network mutation.
6. Run the long/performance, save/open, timeline/drawing, AI Animator/Terra, and credits regressions.

Phase 2 proof must include:

- canonical pre-encode frame manifest for all fixture frames and per-content-kind ownership;
- decoded output metadata for every produced file;
- source-vs-decoded frame comparison using recorded codec-aware thresholds, with no missing/reordered/cropped frames;
- pre-encode mixed PCM binding plus decoded audio duration/start/sync/RMS/spectral tolerance evidence;
- actual Finder interaction screenshots/video with paths/redacted user data excluded;
- progress numerator/denominator event receipts and cancellation latency traces;
- output hash/size/container/codec/dimensions/FPS/frame count/duration;
- memory/backpressure/main-thread/long-animation measurements;
- dependency/license/security inventory, zero external request assertion, and unchanged credit snapshot;
- negative/mutation tests that fail on white injection, text/asset/audio omission, crop, wrong FPS, fake progress, false success, partial project write, network call, or credit change; and
- independently validated technical proof manifest.

Phase 2 excludes social catalog behavior other than Original, direct uploads, crop/fill, and Custom dimensions. Completion stops; it does not authorize Phase 3.

### Phase 3 — Social Destinations and Final Testing

Authorized outcome, if separately approved after Phase 2 closure:

- add the local versioned destination catalog and every Section 10 entry;
- show data-driven destination cards/labels using licensed official brand assets or safe text/neutral fallbacks;
- explain each differing shape before export with canvas/content/padding preview;
- prepare 720p/1080p files using complete-animation contain framing and current official local-file guidance;
- support validated Custom / Other dimensions;
- execute the complete cross-feature fidelity, long-animation, performance, accessibility, security/privacy/cost, cancellation/failure, and protected-regression closeout.

Phase 3 implementation entry gates:

1. Phase 2 is fully closed and Arthur separately authorizes Phase 3 from the resulting synchronized SHA.
2. Official first-party platform evidence is refreshed for every mutable catalog fact. Conflicts that change a preset's product outcome return for decision.
3. Every logo has accepted provenance/license/hash or is replaced by the neutral fallback before coding.
4. Fixture and expected-geometry manifests cover Original, 16:9, 9:16, 1:1, 4:5, valid custom, and invalid custom cases.

Phase 3 acceptance flow:

1. For every named destination, select the preset, read its shape/file explanation, inspect the complete-animation framing overlay, export both applicable quality tiers, and validate output geometry/container/timing.
2. Prove the current wide authored stage converted to vertical, square, and 4:5 canvases retains every source pixel inside the centered content rectangle with disclosed padding and no crop.
3. Exercise Custom / Other presets and boundary/odd/out-of-range dimensions.
4. Prove the production catalog uses no network and that stale/unknown guidance is labelled rather than guessed.
5. Repeat cancellation and representative truthful failures with presets active.
6. Complete final proof for five-minute animation, all fidelity content, 720p/1080p, all presets, Finder flow, performance, Save/Open, timeline/drawing, AI Animator/Terra, and credits.

Phase 3 proof must bind official-source provenance/access dates, catalog/brand-asset hashes and licenses/fallback decisions, all preset geometry receipts, decoded-media inspections, no-crop pixel-bound checks, long/performance receipts, accessibility results, zero network/AI/credit evidence, protected regressions, and independently mutation-tested final manifest.

V1 is complete only after Phase 3 is accepted, published, integrated, recorded, synchronized, proof-preserved, and cleaned up. This still does not authorize direct social integration or deployment.

## 16. Test matrix and proof manifest standard

Each phase owns focused unit/contract/integration/browser tests plus real-app proof. Tests may not substitute snapshots of mocked cards or synthetic progress for the acceptance flow. Deterministic test doubles are allowed only at explicit operating-system/codec seams; at least one real supported-browser encode/write/inspect path is required in Phase 2 and every preset family is exercised through that path in Phase 3.

Minimum fixture family:

- saved empty project;
- raster/drawing-only project with transparency and same-paint overlaps;
- multi-layer visibility/order project;
- text project covering line breaks, alignment, color, and supported fonts;
- symbols/assets project with repeated/catalog instances;
- holds/tweens/transform/effect project;
- generated/authored-background project;
- no-audio, single-audio, overlapping-audio, and corrupt/missing-audio projects;
- 60-second 1080p mixed-content project;
- five-minute 720p 24 FPS mixed-content project;
- changed/deleted/corrupt/stale saved revisions;
- the current wide authored source rendered into vertical, square, and 4:5 destination canvases, plus future source geometries only when a separately accepted project contract can validly represent them; and
- 64-entry saved collection with unavailable and thumbnail-failure entries.

Every technical manifest is immutable, machine-readable, independently validated, and binds:

- exact base/HEAD, branch/worktree identity, empty index, allowed dirty-path list, and file hashes;
- spec version/hash and separately authorized phase;
- source, fixture, test, dependency, catalog, and proof-artifact inventory/digests;
- command/test/build/lint/typecheck results and assertion totals;
- real-app route, browser/macOS/build identity, screenshots/videos, console/network errors;
- project-before/project-after/repository/history/credit digests;
- frame/audio/container/file inspection evidence required by that phase;
- performance/accessibility/security/privacy/cost receipts;
- zero external request/provider/account/deployment assertion;
- protected-regression outcomes;
- negative and mutation-test inventory with expected rejection reason; and
- validator version/hash, PASS/FAIL state, byte length, and SHA-256.

The manifest must reject at least wrong project/revision/digest, omitted source/test/fixture/proof file, stale evidence, wrong frame count/FPS/duration/dimensions, cropped content, missing content class, missing/shifted audio, false progress/success/cancel, unexpected repository/history/credit mutation, network request, unlicensed/missing brand provenance, altered platform value, and mismatched output hash.

## 17. Proven now versus deferred decisions

Proven now:

- Home Export is visibly present and inert.
- Workspace File has Save and Save As only.
- The existing current-frame export is a raster-only white-background PNG helper, not animation video export.
- Saved-project collection and V2 repository validation already exist, but storage heads have no authoritative thumbnail/duration.
- Saved V2 documents carry FPS, stage/layer/cell/content/catalog/sound data needed to define a faithful read-only source.
- Current playback, thumbnail helper, and PNG export do not yet share one proved deterministic export compositor.
- Current authored stage is 1920×1080, while the contract permits long timelines that require bounded streaming.
- No current destination catalog, encoder, Finder write/validation, progress, or cancellation system exists.

Decision-complete product choices in this proposal:

- saved immutable source only; never unsaved implicit export;
- actual selected-animation player, not “Preview”;
- exact saved FPS, non-editable in export;
- complete-animation contain framing, never silent crop;
- project-owned background and no export-only white control;
- local MP4 target with 720p/1080p, truthful Finder save, progress/cancel/failure;
- local data-driven presets and no direct account integration;
- zero AI/provider calls and zero credits;
- exactly three separately gated phases.

Implementation-entry decisions intentionally deferred, with owners and stop conditions:

| Decision | Owner/gate | Required result |
| --- | --- | --- |
| Exact shared evaluator extraction and allowed code paths | Phase 1 executor plan + Arthur scope review | One read-only truth without a second document/persistence owner |
| Project-owned background persistence/reopen semantics | Phase 2 entry review; owner decision if absent | Exact saved background truth or phase stops for spec amendment |
| Local H.264/AAC encoder/dependency | Phase 2 entry review | Supported, licensed, version-pinned, local-only implementation or phase stops |
| macOS browser/file-picker support details | Phase 2 entry review | Proven Finder location flow and partial-file semantics or phase stops |
| Codec-aware visual/audio comparison thresholds | Phase 2 test-plan review | Numerically bounded thresholds that still detect each required omission/misalignment |
| Current third-party platform limits/guidance | Phase 3 official-source freshness gate | Versioned values with provenance, dates, and truthful stale handling |
| Logo rights and asset choice | Phase 3 legal/brand gate | Permitted local asset or neutral fallback, never an unverified mark |

These are bounded engineering/freshness gates, not permission to alter the accepted outcome. A conflict that would change local-only behavior, complete-animation framing, fidelity, MP4 target, Finder choice, quality tiers, destination set, cost/privacy, or protected regressions returns to Arthur and the Spec Architect.

## 18. Definition of completion

SPEC-0009 is not complete when the UI appears, when a sample downloads, or when tests compile. Completion requires all three phases to pass their exact user flows, technical proof and real-app review; every accepted result to complete sequential executor/architect/publication/integration/synchronization/proof-preservation/cleanup; and the final product to prove faithful local export across long animations, all supported content/audio, both quality tiers, every destination family, cancellation/failures, performance, accessibility, Save/Open, timeline/drawing, AI Animator/Terra, and credits.

As of D-0096, SPEC-0009 is Approved and Phase 1's accepted exact 12-path implementation/proof result is technically Verified with Control Plane Architect propagation complete. It is not yet published, integrated, synchronized, proof-preserved or cleaned up. Phases 2 and 3 remain Unauthorized/Not started, and no video encoder, Finder writer, destination catalog, direct social integration or deployment has been implemented.
