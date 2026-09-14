# SPEC-0007 — Manual Editor Completion and AI-Ready Tools

Status: **Approved and active; Phase 1 Authorized; Not started**
Owner: Arthur
Task role: Approved phased implementation contract; no implementation performed by activation/publication
Created: 2026-09-14
Last updated: 2026-09-14
Decision links: [D-0071–D-0073](../DECISIONS.md), [D-0054](../DECISIONS.md), [D-0069–D-0070](../DECISIONS.md)
TODO IDs: `PLAN-007`, `SPEC-007`, `MANUAL-001`–`MANUAL-007`
Planning evidence base: original proposal used local `HEAD`, `main`, and `origin/main` `42640983a4d99aab6cdfacfa869bd9fcc956a01b`; D-0073 correction uses clean canonical base `5e65a3142937734896a3a6cbc3c4f6ff513280ae` and stopped entry manifest SHA-256 `fb019f3f019e5d754dfde0c6189010e935176216d2bbc051a04d74b436e56a80`; index empty before correction edits
Last verified implementation: none; approval/activation changes no runtime behavior

## 1. Exact goal and invariant

Complete the serious manual editing foundation inside the one **Animation Workspace** before the future AI Animator expands. A user can draw reliably, build and edit structured rigs, attach editable shapes to joints, create reusable project symbols deliberately, work with imported still assets, recover work, and refine every result with ordinary selection, Properties, history, timeline, onion skin, Save/Save As/Open, and compact layouts.

The permanent product invariant is:

> Every project/document mutation that may later be available to AI must first be available manually, inspectable in the ordinary editor, deterministic for a fully specified command envelope, undoable/refinable when it changes authored content, and routed through the same validated command capability that a future AI caller would use.

Manual controls and a future AI caller must not become separate mutation implementations. SPEC-0007 creates and uses the shared capability boundary from manual UI only. It adds no AI invocation, provider, model, prompt, motion generation, video, tracking, reconstruction, or paid/external request.

Persistence/identity operations are not authored-content history entries: Save, Save As, Open, and recovery use the same validated capability/service boundary, retain immutable prior versions, and fail without replacing the last good root. View-only operations such as pan, zoom, tab choice, selection highlight, scrub, playback, and a cancelled draft are not document mutations and do not create Undo entries.

## 2. Current behavior and evidence

### 2.1 Fresh real-app evidence — 2026-09-14

At the ordinary local app on `http://127.0.0.1:3000/`, Home → New Project opened **Untitled Project** directly in the unified workspace. The visible right-panel order is **Stick Figure Tools, Properties, Library, Assets**; Drawing tools are **Select, Lasso, Brush, Eraser, Fill, Text, Shape, Knife**.

- **Stick Figure Tools** currently offers **Add Limb**, **Select / Move Joint**, and **Creator**, with joint/segment counts. It does not expose segment selection, whole-rig selection, connection, insertion, deletion, appearance, or structured joint-attached Shape operations.
- **Library** is project-created symbols and **Assets** is imported external files. These are already separate tabs.
- **Stick Figure Creator** is embedded and labelled, but its graph is explicitly local and **Save Stick Figure** is disabled. It has Draw/Select/Insert/Pose/Mirror/Center, local segment styling, and a separate local shape control.
- At a temporary `900×700` viewport, the current Creator's fixed Standard canvas and minimum-width side panel visibly overlap/clip; this is evidence for the compact Phase 5 requirement, not a claim about the accepted SPEC-0006 `390×844` workspace proof.

No project was saved, no file imported, and no external/API request was made during this planning inspection.

### 2.2 Fresh code evidence

- `app/page.tsx` → `AnimationWorkspace.tsx` → `DrawingWorkspace.tsx` is the ordinary one-workspace path. `DrawingWorkspace` owns authored state, global Undo/Redo, timeline, canonical V2 snapshotting, Save/Save As, and the embedded Creator.
- `DrawingCanvas.tsx` is the large transient interaction/algorithm adapter. It owns brush variants, raster Shape, selection sessions, asset preparation/placement, symbol UI, and the current two rig gestures, then calls parent commit callbacks.
- Current rig content is `StickFigureFrameContent`: `figures` plus a `structureGraph` of joints, limbs, and `activeJointId`. The live unified canvas adds or moves joints and commits through `commitUnifiedStickContent`, which records one global history transaction.
- `StickFigureCreatorWorkspace.tsx` has independent local `CreatorJoint`, `CreatorLimb`, and `CreatorShape` state. Pointer cancel currently shares the completion handler, so cancellation can finalize a draft. Save is disabled and no Creator graph enters the project Library.
- `DrawingRightPanel.tsx` still hard-codes the user-facing `Stick Figure Tools` tab and brush variants `Brush`, `Pixelate`, `Sketch`, `Pencil`, `Glow`.
- Pixelate and Glow are imperative Canvas2D branches inside `DrawingCanvas.tsx`. Glow uses blur/gradient work; Pixelate derives squares from sampled pixels. They need bounded, fixture-backed visible/performance proof rather than compile-only acceptance.
- `unifiedAnimationContentV2.ts` owns raster/text/rig/symbol-instance items. `unifiedAnimationContractV2.ts`, `unifiedProjectCatalogV2.ts`, and `unifiedProjectStorageV2.ts` own strict V2 validation, project catalogs, content-addressed bytes, immutable versions, 128 MiB/project, 512 MiB/collection, and 64-project limits.
- Symbols already persist as project definitions and independently transformable instances. Structured symbol payload v1 retains joints/limbs but not rig appearance or joint attachments. Definitions are currently immutable after creation.
- Assets currently classify every `image/*` as a placeable image and every other file as metadata-only, read image data URLs before explicit format/dimension/decoded-memory limits, and accept multi-file batches. This is insufficient for an honest still-media contract.
- `unifiedTimelineReducer.ts` is deterministic proof infrastructure but is not the ordinary runtime mutation dispatcher. Runtime mutations remain distributed among `DrawingCanvas` preparation and `DrawingWorkspace` callbacks/history. The missing foundation is a runtime-used validated command-capability boundary, not a second document root.

### 2.3 Root cause / missing foundation

SPEC-0006 unified document ownership, rendering, current tools, catalogs, history, persistence, source adoption, and the ordinary mount path. It deliberately did not complete manual rig editing or Creator persistence. The remaining gaps are therefore capability and routing gaps:

1. advanced raster variants and current Shape behavior lack a final bounded reliability proof;
2. the rig graph is too small and the ordinary UI cannot address all required subtargets;
3. appearance and joint attachments have no strict persisted representation;
4. Rig Builder state is a second local draft with no deliberate project-symbol transaction;
5. external assets lack a supported-format/size/decode contract; and
6. manual document mutations do not yet publish a complete, runtime-used command registry suitable for later reuse.

## 3. Fixed product vocabulary and boundaries

- There is one **Animation Workspace**. Do not reintroduce a Drawing/Stick chooser or mount the legacy standalone Stick coordinator.
- User-facing **Stick Figure Tools** becomes **Rig Tools**.
- User-facing **Add Limb** becomes **Add Segment**; **limb** may remain in compatibility type/property names and migrations.
- User-facing **Creator** / **Stick Figure Creator** becomes **Rig Builder**.
- **Library** means reusable project-created **Drawing Symbol**, **Rig Symbol**, or **Mixed Symbol** definitions.
- **Assets** means imported external still media in a separate tab.
- Animated symbol timelines and a possible **Creator Hub** are future work, not SPEC-0007 and not a prerequisite for the first AI Animator.
- Existing internal IDs/discriminators such as `stick-figure`, `stick-rig/v1`, `StickFigure*`, and `limbs` remain compatible unless a phase's strict additive migration requires a versioned extension. Cosmetic renaming is not authority for a broad schema migration.

## 4. Shared validated command-capability contract

### 4.1 One runtime path

Every authored mutation in scope follows:

```text
manual control or pointer gesture
  → transient draft/preparation (no authored write)
  → EditorCommandEnvelope {commandId, project/document generation, target IDs,
     explicit allocated IDs/time where needed, canonical payload}
  → capability lookup + schema/limit/reference/base validation
  → one DrawingWorkspace-owned commit/history transaction
  → ordinary render + canonical V2 Save/Open/recovery
```

The command implementation is UI-agnostic and may not import React, browser events, AI modules, providers, prompts, or network clients. The manual adapter may prepare a raster patch, decoded still, hit target, or gesture endpoint, but it cannot mutate the document/catalog before capability validation. A future AI caller may later construct the same envelope; SPEC-0007 provides no such caller.

For an identical validated envelope and base document digest, execution produces the same canonical authored projection and result code. UUIDs, timestamps, and hashes are supplied explicitly by an injected coordinator service before execution and are part of the envelope; hidden `Date.now()`, `Math.random()`, or `crypto.randomUUID()` inside a pure mutation handler is forbidden. Reapplying a consumed operation ID is rejected/no-op and cannot duplicate content.

Success changes the document exactly once and creates one global history entry. Validation failure, stale generation/target, duplicate operation, no-op, pointer cancel, Escape, lost context, decode failure, capacity failure, or user Cancel changes no document, catalog, history, save state, or storage head. Undo restores the exact prior authored digest; Redo restores the exact successful result digest. New authored input after Undo clears Redo.

### 4.2 Required capability families

Phase 7 publishes the exact registry; earlier phases add only their rows. Stable semantic IDs may receive a version suffix when their payload changes. At minimum the matrix contains:

| Family | Required manual-backed capabilities by final gate |
| --- | --- |
| Drawing | tool-option change; raster stroke/erase/fill/shape/knife commit; raster/text selection transform/duplicate/delete; text create/update/delete; clear canvas |
| Rig | add segment; insert joint; move joint/segment/attachment/whole rig; connect joints; delete joint/segment/attachment/rig; set segment/multi/rig appearance; attach/update joint shape |
| Library | create Drawing/Rig/Mixed definition; place/transform/duplicate/delete instance; rename/update/duplicate/delete definition; Make Unique |
| Assets | import supported still; remove unreferenced catalog asset; place/transform/duplicate/delete still instance |
| Timeline/layers | add/rename/reorder/visibility/lock layer; create/blank/copy/paste/delete/hold/tween operations already exposed manually; FPS where persisted |
| Project/history | Undo, Redo, Save, Save As, validated Open/recovery; these retain their existing UI and repository semantics |

The final matrix records for every row: command ID/version, target and payload schema, manual control/gesture, validator, command handler, history class, persistence projection, failure/no-op result, owning phase, and future-AI eligibility. `future-AI eligibility` is metadata only and cannot expose an AI execution route.

### 4.3 Rig extension and migration contract

Preserve existing `stick-rig/v1` items and source records. Add one optional, strictly validated `rigExtensions` object to `StickFigureFrameContent`, with its own `version: 1` and exact fields:

- `defaultSegmentStyle`: canonical `color` plus finite `thickness`;
- `segmentStyleOverrides`: deterministically ordered unique entries keyed by existing limb/segment ID, with explicit color and/or thickness;
- `jointAttachments`: deterministically ordered unique entries with `attachmentId`, existing `jointId`, `shape` (`circle`, `square`, `triangle`), positive `size`, `fillColor`, `outlineColor`, positive `outlineThickness`, and finite `rotation`.

Legacy/extension-absent rigs resolve to current visual defaults (`#10131b`, 8 stage units) without rewriting on Open. Newly attached shapes default to upright `rotation: 0`, black fill `#000000`, black outline `#000000`, and 2-stage-unit outline. New coordinates/sizes use finite canonical numbers, normalize `-0`, clamp to the 1920×1080 stage where the command requires an on-stage target, and round only newly authored values to 0.001 stage unit; imported legacy values remain byte-preserved until edited.

Deleting a joint is rejected while it would leave an implicit ambiguous topology unless the UI shows the exact cascade. The approved manual behavior is explicit cascade: deleting a selected joint deletes its attached shapes and every incident segment in the same atomic command, but never deletes a now-isolated different joint. Deleting a segment leaves both endpoint joints. Connect rejects self-links and duplicate undirected links. Insert replaces one segment with two inheriting its resolved appearance and one new joint/ID in one command.

Phase 4 extends structured Library payloads with a versioned v2 payload that includes resolved rig style and joint attachments; v1 definitions remain readable and digest-stable. Do not reinterpret or rewrite v1 definitions on Open. Saving/updating a v2 definition recomputes preview bytes, asset hash, and semantic definition digest together.

### 4.4 Exact selection and gesture semantics

- In Rig Tools **Select**, click priority is attachment visual area → joint handle → segment stroke → empty stage. One click selects the topmost eligible target; Shift-click toggles compatible segments/attachments for multi-edit; Escape/empty-stage click clears selection.
- **Select Rig** is an explicit accessible Rig Tools/Properties action that promotes any selected rig subtarget to the whole rig. There is no invisible double-click dependency.
- Drag a joint to move that joint; connected segments and its attachments follow through structure references.
- Drag a segment to translate both endpoints by the same delta; all connected neighboring segments update through their shared joints. Shift-selected segments move the union of their unique endpoint joints once.
- Drag a joint attachment to move its owning joint, so the attachment stays centered. Its size/rotation is changed only through Properties or visible transform handles.
- Drag a selected whole rig to translate all unique joints once. The move is clamped by the union bounds, preserving relative geometry.
- Add Segment begins on empty stage or an existing joint and ends on empty stage or an existing joint. Connect Joints is a two-click accessible alternative with explicit source/target status. Insert Joint clicks a segment away from guarded endpoints. Delete uses the visible action or Delete/Backspace while focus is in the stage, never while typing in a field.
- Pointer move is preview-only. A valid primary-pointer `pointerup` consumes the final transformed sample, seals the draft before releasing capture, and commits once. `pointercancel`, Escape, tool/tab/frame/layer/project change, playback start, modal close, or unexpected lost capture cancels with no partial write. A post-`pointerup` lost-capture callback is idempotent. Blur does not commit an unsealed draft.

## 5. Global non-goals and protected systems

This spec does not:

- add or change AI actions, models, prompts, references, provider routing, costs, search, APIs, motion/video generation, tracking, reconstruction, or natural-motion quality;
- design animated symbol timelines, Creator Hub, cloud/social sharing, project-file import/export, deployment, auth, billing, collaboration, or new audio behavior;
- delete, revive, route through, or migrate ownership back to the legacy standalone Stick workspace;
- redesign Home, Tutorials, AI Dashboard, AI panel, unrelated menu/chrome, or export;
- replace the canonical V2 repository, loosen accepted limits, rewrite source stores, or silently auto-save/autocreate Rig Symbols;
- rasterize structured rigs/attachments into destructive paint, infer attachments from nearby pixels, or add physics/constraints/automatic motion following.

Protected throughout: every accepted SPEC-0006 New/Open/mixed-stage/history/timeline/playback/onion/catalog/storage/recovery/Creator-containment result; Drawing Select/Lasso/Brush/Eraser/Fill/Text/Shape/Knife; existing symbol instance transforms; layer/frame ownership; Save/Save As/Open; accessibility; compact workspace behavior; all legacy read-only source paths; and unchanged AI/API/provider/network behavior.

## 6. Shared phase execution, proof, and review rules

Each numbered phase is a separate lifecycle. No phase overlaps another.

For avoidance of doubt, this section is incorporated into each of Phases 1–7: its entry, proof-manifest, correction, ownership-transfer, publication, and review-copy cleanup rules are phase-local requirements, not whole-spec guidance that an executor may omit.

1. Arthur separately authorizes exactly one phase. D-0072 authorizes Phase 1 only, effective for executor start after this approval/activation package is published and verified synchronized; Phases 2–7 remain unauthorized.
2. A fresh dedicated Spec Executor worktree starts in Plan mode from the exact then-integrated canonical `main` SHA. Its boot receipt records `HEAD`, `main`, `origin/main`, empty index, no other phase owner, and D-0054 cleanup of the prior review copy.
3. The executor changes only that phase's allowed runtime/fixture/technical-test families and ignored `output/spec-0007/phase-N/**` proof, creates and independently mutation-validates the technical manifest, returns its Implementation Review Packet, and completely stops. It does not edit canonical control-plane files or stage/commit/merge/push/publish.
4. Arthur and the Project Manager accept or reject the stopped result. Rejection goes to a separately authorized fresh correction executor. Unique rejected bytes/proof are inventoried, hashed, backed up and verified before server/worktree/local-branch removal; rejected bytes are evidence, never an implementation starting point.
5. After acceptance and executor shutdown, a Control Plane Architect takes exclusive ownership of the same worktree, freezes accepted technical bytes, validates manifest/source evidence, updates the canonical control plane, runs memory/diff/Git closeout, returns a CPA PM Review Packet, and stops with an empty index.
6. A later explicit publication task alone may stage the exact reviewed allowlist, commit on a `codex/` branch, fast-forward a still-clean canonical `main`, push normally, and verify local/remote clean `0/0`. No pull, merge, rebase, force-push, history rewrite, or scope expansion.
7. After synchronized publication, stop the exact review server, verify its port closed, preserve required proof, remove only the obsolete executor worktree and unused local feature branch under D-0054. Only then may the next phase start fresh from the new integrated SHA.

Every phase must pass deterministic tests, full changed-scope type/lint/build gates, focused real-browser desktop `1440×900` DPR1 and compact `390×844` DPR2 flows, keyboard and 200% zoom/reduced-motion checks where touched, zero unexpected console/page errors, zero non-loopback/real API/provider requests, exact dirty-path/scope checks, `git diff --check`, and empty index. Compilation alone, an executor's self-report, or one successful probe is not readiness.

Each technical proof manifest is JSON under `output/spec-0007/phase-N/proof-manifest.json` and binds: exact base/HEAD, phase/spec hash, dirty-path allowlist, source hashes/sizes, fixture/test hashes, command ledger, deterministic receipts, browser operations/screenshots/profile/console/network ledger, performance/memory/size results, inherited regression receipts, external-call count, index state, limitations, and `humanAcceptance: pending Arthur`. Its validator must reject at least one mutation of every material field/binding family and pass only against the stopped executor bytes.

## 7. Phase 1 — Drawing Tool Stabilization

### Goal and visible outcome

Brush, Pencil, Sketch, Pixelate, Glow, Square/Triangle/Circle Shape, and every visible relevant option respond consistently, commit once, Undo/Redo exactly, and survive Save/Open without alignment or appearance changes. Pixelate produces clean, grid-aligned, axis-aligned uniform-alpha squares matching the configured opacity, with no seams, rotation, or antialiased edges. Glow produces an unmistakable bounded halo plus solid readable core without freezing or runaway allocation.

### Current path/evidence

`DrawingToolBar` activates Brush/Shape; `DrawingCanvas` owns variant selection, size/transparency/smoothing/color, Glow brightness/radius, Shape type/mode/fill/outline/thickness/corner radius, pointer samples, dirty-region preview and raster commit; `DrawingWorkspace` snapshots the frame, records global history, and builds/saves the V2 project. Current Pixelate/Glow branches exist but are not covered by a final exact visual/performance matrix.

### Scope, files, and non-scope

Allowed runtime families: `src/components/workspace/DrawingCanvas.tsx`, `DrawingToolBar.tsx`, `DrawingRightPanel.tsx`, `DrawingWorkspace.tsx`; new/extended UI-independent command modules under `src/lib/animation/editorCommands/**`; and only these existing V2 persistence-path modules reached by the same representative Drawing fixture: `src/components/workspace/AnimationWorkspace.tsx` for its current compatibility hydration/projection helpers, plus `src/lib/animation/unifiedProjectRepositoryV2.ts`, `unifiedProjectStorageV2.ts`, `unifiedWorkspaceBootstrap.ts`, and `unifiedAnimationContractV2.ts` for validation traversal mechanics only. `DrawingWorkspace.tsx` serialization/snapshot helpers are inside its existing authorization. No other component or `src/lib/animation/**` module is authorized by the inherited repair; needing one is a stop-and-return condition. Allowed fixtures/tests/proof: `scripts/fixtures/spec0007-manual/phase-1/**`, `scripts/spec0007-manual/phase-1/**`, and ignored phase proof. Existing unrelated Drawing tools, rig behavior, catalogs, AI, storage schema/limits, Home/Tutorials, dependencies/configuration are protected.

### Exact acceptance flow

1. New Project; create one layer/keyframe; for each Brush/Pencil/Sketch/Pixelate/Glow, set minimum/middle/maximum supported size, opacity/transparency, and smoothing; for Glow also brightness/radius extrema and middle.
2. Draw fixed dot, slow line, fast diagonal, tight curve, and boundary-crossing zigzag fixtures; release outside the canvas once; cancel once with Escape/pointer cancel.
3. For Pixelate, inspect a 1:1 authoring-pixel crop: all painted cells share one integer grid origin/cell size, edges are horizontal/vertical, interior alpha is exact, outside alpha is zero, and a supercover traversal leaves no gap along the gesture.
4. For Glow, compare core/halo samples at 1:1: core remains visible, at least one bounded outside-halo band has nonzero alpha when brightness/radius are nonzero, and brightness zero produces the documented non-halo fallback.
5. Draw Square/Triangle/Circle in Draw and Cutout modes with fill/outline/thickness/corner options, including reverse drag, click-too-small, stage edge, and cancel.
6. After every successful gesture: one Undo removes only it, one Redo restores its exact raster digest, unrelated rig/text/symbol data is unchanged, and cancelled/no-op gestures add no history.
7. Save; make a later mark; Save again; reload/Open; verify raster/tool-option projection, frame/layer, alignment, visual digests, and history baseline remain truthful.

### Failure, performance, and limits

Pixelate cell size is an integer authoring-pixel function of canonical brush size, traverses every crossed cell, uses integer `fillRect`-equivalent coverage with smoothing disabled, and cannot rotate. Glow clamps every parameter to its visible UI range, caps blur/dirty-region expansion, reuses bounded scratch surfaces, and samples incrementally; no full-canvas clone or unbounded gradient/path replay per pointer sample. Phase entry records a clean-base benchmark. A clean-base miss must be preserved as before-evidence and may not be hidden or normalized away, but it is not a mandatory stop when it is confined to inherited Drawing Save/Open/transient-memory mechanics inside the exact allowed Phase 1 families above. In that case Phase 1 may first diagnose and narrowly optimize those inherited mechanics, then implement/prove Drawing stabilization. Exit still requires no regression over SPEC-0006 storage ceilings, no decoded/scratch allocation above the existing 256 MiB single-raster ceiling, settled JS heap below 320 MiB on the representative desktop project, transient/stress JS heap at or below the inherited 512 MiB ceiling, zero `>50 ms` pointer-update long tasks in 20 warmed fixed strokes/profile, p95 preview latency ≤16.7 ms desktop and ≤33.4 ms compact, and Save/Open within the accepted Phase 6 1.53 s/0.775 s upper bounds for its unchanged representative project. None of these ceilings may be weakened, redefined, or bypassed.

### Recorded Phase 1 entry miss and bounded correction authority

The first stopped executor measured exact clean base `5e65a3142937734896a3a6cbc3c4f6ff513280ae` and wrote blocked entry evidence at `output/spec-0007/phase-1/entry/entry-manifest.json`, SHA-256 `fb019f3f019e5d754dfde0c6189010e935176216d2bbc051a04d74b436e56a80`. It made zero tracked runtime changes and kept the index empty. With two warmups then five measured runs per profile on the unchanged two-raster representative project, desktop Open was 809–881 ms and Save 1,538–1,587 ms, failing 5/5 against both ceilings; compact Open was 739–982 ms and Save 1,564–1,781 ms, failing 4/5 Opens and 5/5 Saves. Build/TypeScript and a repeated inherited persistence run passed. The first inherited stress run sampled 556,539,747 bytes on Open and 557,612,900 bytes on reopen, above 536,870,912 bytes; the successful inherited replay settled at 315,897,698 bytes desktop and 301,739,988 bytes compact, below 335,544,320 bytes. A separate repeat driver reported approximately 618.6 MB while the repeated large workspace remained open; because that lifecycle differs from the inherited unload/GC settled measurement, it is diagnostic and cannot replace either exit gate.

Phase 1 may correct only the inherited work proven to cause these misses: redundant project traversal/cloning, typed-byte hashing/encoding/hydration, readback verification, collection accounting, workspace bootstrap, or Drawing snapshot serialization on the ordinary V2 Save/Open path. It must not change visible behavior, schema/version, project/collection/raster limits, asset identities, revision/CAS rules, immutable-version retention, last-good fallback, source-read/write boundaries, Save/Save As/Open truthfulness, or failure codes. Performance work is incomplete unless the Drawing correctness flows in this section also pass.

The technical proof must compare before and after on the same immutable fixture bytes/digests, viewport profiles, browser/build mode, warmup count, measured-run count, operation boundaries, GC/settling method and machine class. It must bind every timing and heap sample, exact source/fixture hashes, and byte/digest equivalence for hydrated rasters, audio, text, rigs, symbols, auxiliary state, versions and heads. It must inject encode/hash/decode/readback/quota/stale-CAS/publish failures and prove the last good head/version/source bytes remain unchanged. A faster result with any content/digest mismatch, missing rollback, weakened validation/limit, altered failure integrity, or failed Drawing tool/history/Save/Open acceptance is a failure.

### Regression/entry/exit

Entry/restart: after the D-0073 correction records are reviewed, separately published, and verified synchronized, copy the stopped `/4bb1/` entry evidence to `/Users/arthurcarlin/.codex/worktrees/2d14/stick-animation-app/output/recovery/SPEC-0007-phase-1-entry-5e65a31/`, verify its complete inventory and manifest SHA-256 `fb019f3f019e5d754dfde0c6189010e935176216d2bbc051a04d74b436e56a80`, complete `/4bb1/` D-0054 obsolete-copy cleanup, and start one fresh dedicated Plan-mode Phase 1 executor from the exact correction-publication SHA. It records the prior manifest/hash as before-evidence, confirms no other phase owner/review copy, retraces the ordinary path, freezes its exact tracked path allowlist inside the bounded families above, and performs the inherited performance diagnosis before broader Drawing edits. The stopped `/4bb1/` worktree is evidence only and may not be resumed or reused as implementation. Exit: all flows above plus unchanged Eraser/Fill/Text/Knife, Select/Lasso, rig, timeline/onion/playback/catalog/Save/Open and SPEC-0006 suites pass; all unchanged 775 ms Open, 1,530 ms Save, 320 MiB settled-heap, 512 MiB transient/stress and other Phase 1 ceilings pass; Phase 1 manifest PASS/VALID; Arthur/PM review follows the shared lifecycle. Phase 1 does not rename/build rigs or change Assets/Library behavior.

## 8. Phase 2 — Rig Terminology and Selection

### Goal and visible outcome

The ordinary tab is **Rig Tools**, **Add Segment** replaces **Add Limb**, and a user can reliably select and move a joint, segment, joint attachment when one exists in a fixture, or whole rig using §4.4. Names, selection status, keyboard focus and Properties always disclose the real target.

### Current path/evidence

`DrawingRightPanel` and `DrawingCanvas` expose the old labels. The ordinary unified rig overlay hit-tests only joints; selection state is one joint ID. Select/Lasso has structured-rig capture behavior, but ordinary subtarget selection is incomplete. Existing internal `limbs`/`stick-rig/v1` names are compatibility-sensitive.

### Scope and allowed families

Allowed runtime: the Phase 1 command boundary; `DrawingRightPanel.tsx`, `DrawingCanvas.tsx`, `DrawingWorkspace.tsx`; rig selection/geometry modules under `src/lib/animation/**`; minimal `stickfigure/types.ts` additions needed for typed selection and read/render of a strictly validated pre-existing attachment target; accessibility styles/tests. Fixtures/tests/proof use phase-2 paths. Phase 2 may add the additive `rigExtensions` read/validation skeleton and a proof-only loaded fixture so attachment hit/movement is real-browser proven, but it cannot expose attachment creation, appearance editing or structured-symbol v2 writes before Phase 4. No other topology edit beyond existing Add Segment/joint move, Builder save, asset change, internal compatibility rename, AI, persistence rewrite, or standalone coordinator resurrection.

### Exact acceptance flow

1. Open a fixed one-rig/mixed-frame fixture containing one validated pre-existing attachment; verify only user-facing labels changed and extension-absent saved v1 opens unchanged.
2. Click overlapping attachment/joint/segment test points and prove priority; empty click/Escape clears; Shift toggles compatible targets; focus and selection text match.
3. Move one joint, one segment, a Shift-selected segment set, the fixture attachment via owning joint, and the whole rig via **Select Rig**; inspect preview, release, exact IDs/deltas/topology, one history entry, Undo/Redo, scrub/onion/playback, Save/reload/Open.
4. Cancel each drag by Escape, pointer cancel, context switch and playback start; prove exact pre-drag digest and no history.
5. Repeat by keyboard controls and at desktop/compact/200% zoom/reduced motion; selected outlines/handles cannot intercept timeline or Drawing gestures outside Rig Tools.

Performance: 500 hit tests and 200 fixed drags/profile; p95 hit decision ≤8 ms desktop/≤16 ms compact, no long task, selection state O(target count) and no per-move full-document clone. Exit requires exact selection/gesture proof and all Phase 1/SPEC-0006 regressions. Phase 3 cannot start until publication/cleanup.

## 9. Phase 3 — Rig Structure Editing

### Goal and visible outcome

Rig Tools can add segments, insert joints, move the selected target, connect existing joints, and delete joints/segments/whole rigs with exact topology, terminal behavior, atomic history and persistence. No valid action makes geometry disappear, jump to a different coordinate space, or commit twice.

### Current path/evidence

The ordinary canvas currently supports add-segment and one-joint move only. Rig Builder has local insert/remove mechanics but no common command/history/persistence route; pointer cancel can complete its local draft. The canonical graph validator checks joint references but not the new operation invariants.

### Scope and allowed families

Allowed runtime: Phase 1/2 command/selection modules; `DrawingCanvas.tsx`, `DrawingWorkspace.tsx`, `stickfigure/types.ts`; strict rig graph validation/render helpers under `src/lib/animation/**`; Rig Tools/Properties controls. Fixtures/tests/proof use phase-3 paths. No appearance, new attachment, Library/Builder save, asset, AI, timeline schema, or unrelated Drawing redesign.

### Exact acceptance flow

1. On blank and existing rigs, Add Segment empty→empty, joint→empty, joint→joint; reject too-short, duplicate and self links.
2. Insert Joint at 25/50/75% of a segment; verify one new joint, two replacement segments, inherited IDs only where specified, inherited style-ready defaults, and no endpoint-near insertion.
3. Connect two existing joints with the two-click accessible flow; cancel after source selection; reject stale/deleted target, duplicate, self, locked layer and playback.
4. Move joint/segment/multi/whole rig at stage center and every boundary; final pointer sample matches the committed canonical point with no release/lost-capture snap.
5. Delete a segment; delete a leaf/middle/branch joint and inspect the explicit cascade; delete whole rig; confirm Delete does nothing while typing.
6. For every success, verify exactly one Undo/Redo; for every failure/cancel, zero digest/history change. Save, reload/Open, scrub, holds, copied frames, onion and full playback retain exact topology/coordinates.

Limits: 10,000 joints and 10,000 segments remain the hard persisted upper bounds; commands preflight additions/cascades before cloning/commit, run O(joints+segments), and reject capacity/stale-reference errors visibly. Representative 1,000-joint/1,500-segment edit p95 ≤50 ms desktop/≤100 ms compact with no `>200 ms` long task; the 10,000/10,000 boundary is deterministic technical proof, not a required interactive target. Exit requires graph invariant/mutation tests, terminal-race browser proof and protected matrix PASS.

## 10. Phase 4 — Rig Appearance and Joint-Attached Shapes

### Goal and visible outcome

A user can set color and thickness for a selected segment, Shift-selected segments, or whole rig. With the existing Shape tool active, beginning on a hit rig joint creates a structured circle/square/triangle attachment centered on that joint; drag distance sets its size. It is upright by default, black fill and outline by default, editable/selectable, follows the joint, persists through symbols/history/Save/Open, and never smears into raster paint.

### Current path/evidence

Ordinary rig rendering uses fixed dark strokes. Rig Builder's local separate Shapes section offsets one fixed-size shape above a joint and has only fill color; it is not persisted. Ordinary Shape currently rasterizes. Structured symbol payload v1 contains only joints/limbs plus optional Drawing PNG.

### Scope and allowed families

Allowed runtime: completion/write paths for the Phase 2 `rigExtensions` skeleton plus structured-symbol v2 contract, validators, migrations and render/catalog geometry under `src/components/workspace/stickfigure/types.ts` and `src/lib/animation/**`; Phase 1–3 command/selection paths; ordinary Shape/Properties integration in `DrawingCanvas`/`DrawingWorkspace`; Builder consumes the same structures but Phase 5 owns saving. Fixtures/tests/proof use phase-4 paths. No new shape kinds, gradients, vector drawing engine, constraint/physics/follow animation, animated symbols, asset behavior or AI.

### Exact acceptance flow

1. Select one segment, a Shift group, then whole rig; set color/thickness by keyboard and pointer. Slider/color input previews are transient and coalesce to one command on commit/change-end; Cancel/Escape restores the old value.
2. Activate Shape Circle/Square/Triangle; drag from a joint 1, middle and maximum supported radius. Hit joint routes to structured attachment; missing a joint uses the unchanged raster Shape path. Too-small drag/cancel creates neither.
3. Verify attachment center equals joint, `size = clamp(hypot(pointer-joint), 4, 512)` stage units, rotation 0, fill/outline black and outline 2; edit size/rotation/fill/outline/thickness in Properties and use visible handles where provided.
4. Select/move the attachment (moving its joint), move the joint/segment/whole rig, duplicate/delete safely, copy/paste frame, onion previous/next, scrub/play, convert/create Rig and Mixed symbols, transform symbol instances non-uniformly, and verify structured geometry/style rather than raster smear.
5. Undo/Redo each appearance/attachment mutation, Save/reload/Open, and validate v1 rigs/symbols retain old digests/default visuals while v2 round-trips exact extension data.

Limits: 0–10,000 attachments per rig, at most one attachment per joint per shape kind, size 4–512, rotation canonicalized to `[-180,180)`, segment thickness 1–64, outline 1–32, normalized six-digit sRGB hex. Renderer remains O(segments+attachments), reuses the existing stage surfaces, and 1,000 attachments must render within the Phase 3 compact/desktop frame budget with no allocation growth across 20 loops. Exit requires strict migration/digest mutation tests, raster/structured routing proof, symbol/onion/save proof, and all prior regressions.

## 11. Phase 5 — Rig Builder and Rig Symbols

### Goal and visible outcome

**Rig Builder** becomes a responsive project draft editor that deliberately saves a named **Rig Symbol** into Library. Users can create, edit, duplicate, rename, update, **Make Unique**, or Cancel with validation, collision handling, persistence and one atomic Undo/Redo transaction. Nothing is silently autosaved or automatically turned into a symbol.

### Current path/evidence

The embedded Creator is local-only, fixed-size, overflows at compact width, and its Save button is deliberately disabled. Its graph/types/history differ from the ordinary rig model. Current project symbol definitions can be created/deleted/placed but are immutable after creation.

### Scope and allowed families

Allowed runtime: `DrawingWorkspace.tsx`, `DrawingCanvas.tsx`, `DrawingRightPanel.tsx`, `stickfigure/StickFigureCreatorWorkspace.tsx`, `stickfigure/types.ts`; Phase 1–4 commands; catalog/contract/storage helpers under `src/lib/animation/**`; focus/responsive CSS. Fixtures/tests/proof use phase-5 paths. No Creator Hub, animated/nested symbol timeline, silent autosave, automatic symbol creation, AI, standalone workspace ownership, Home/Tutorial redesign or new provider/storage service.

### Exact workflow and decisions

- **New Rig Symbol** opens an isolated draft copied from the chosen starter/empty rig. **Save Rig Symbol** stays disabled until the graph is valid and a nonempty name is entered. Save commits definition + preview/hash/digest once to Library; Cancel/Back with a dirty draft shows **Discard / Keep Editing**, never saves.
- Library **Edit** opens a draft of that definition. **Update** explicitly replaces definition content/digest and updates every linked instance to the new digest while preserving instance transforms, atomically. Cancel leaves definition/instances untouched.
- **Make Unique** creates a new definition/ID/name from the draft and retargets only the selected source instance when launched from an instance; other instances stay linked to the old definition. From a Library definition without an instance, it only creates the copy.
- **Duplicate** creates a new definition with deterministic proposed name `Name Copy`, then `Name Copy 2`, etc.; the name remains editable before commit. **Rename** changes metadata/digest and all linked instance digests atomically without changing visual payload. **Delete** remains blocked while referenced and states why.
- Names are NFC, trimmed, 1–120 UTF-8 bytes, comparison uses NFC + locale-independent Unicode case fold. Empty, control-character, slash-only, and duplicate normalized names are rejected inline; no silent overwrite or hidden suffix on ordinary Save/Update.

### Acceptance flow

1. Open Rig Builder from Rig Tools in empty and selected-rig contexts; build using the same Add/Insert/Connect/Move/Delete/appearance/attachment commands as the workspace.
   Builder keeps a draft-local Undo/Redo stack over those same validated capabilities; draft history never mutates project history or storage before Save/Update.
2. Exercise invalid graph/name/collision/capacity, dirty Back Cancel, Discard, valid named Save, Library preview/place, two independent instances, Undo/Redo, Save/reload/Open.
3. Edit and Update; prove both linked instances change definition digest but retain transforms. Undo restores old definition and both links; Redo restores new.
4. Make Unique one instance, edit it, prove the original definition/other instance unchanged; rename, duplicate, collision and referenced-delete flows; reload all.
5. Keyboard/focus trap/return, 200% zoom/reduced motion, desktop and compact `390×844` portrait: Builder uses responsive pan/scroll or fit-to-viewport, no page-axis overflow, no clipped Save/Cancel/tools, and a ≥24 CSS px interactive stage target.

Limits inherit 10,000 joints/segments/attachments and 128 MiB project. Preview generation is bounded to max 512×512 PNG and revoked when replaced/unmounted. Twenty open/cancel cycles and twenty update cycles show no monotonic blob URL/listener/heap growth after GC settling; p95 Builder open/update ≤250/500 ms desktop and ≤500/1,000 ms compact on the representative rig. Exit requires deliberate-action/no-autosave proof, exact link/digest/history/storage proof, responsive proof, and prior regressions.

## 12. Phase 6 — Assets Stabilization

### Goal and visible outcome

Assets remains the separate external-still tab. A user can import a supported still, see a truthful preview, drag/place it, move/resize/rotate/duplicate/delete the placed instance, remove an unreferenced catalog asset, and Save/Open without freezes or data loss. Unsupported, corrupt, duplicate, oversized, or over-capacity files are rejected visibly and atomically. No video becomes animation.

### Supported contract

Supported inputs are static PNG (`image/png`), JPEG (`image/jpeg`), and WebP (`image/webp`) whose signature, decoded type, dimensions and MIME agree. Reject GIF (including static GIF), SVG, AVIF, HEIC, PDF, PSD, audio, video, unknown/generic files, renamed extensions, animated WebP, zero dimension, corrupt/truncated data and metadata-only placeholders. The file chooser advertises only supported MIME/extensions; validation never trusts name/MIME alone.

Per file: encoded bytes `1..16,777,216`, width/height `1..8192`, decoded pixels ≤33,554,432 and decoded RGBA estimate ≤134,217,728 bytes. A batch contains ≤32 selected files and is preflighted in stable chooser order. Each valid file may commit as its own explicit result only after the UI shows per-file status; default batch action is all-or-none so one invalid file changes no catalog. Existing 128 MiB project/512 MiB collection/64 project limits remain authoritative and may reject an otherwise supported still before commit.

### Current path/evidence and allowed families

Current `DrawingCanvas.handleAssetImport` reads every `image/*` to a data URL and accepts other files as non-placeable metadata, with no explicit size/dimension/signature/animation bound. Phase 6 may change `DrawingCanvas.tsx`, `DrawingWorkspace.tsx`, `DrawingRightPanel.tsx`, the shared command boundary, V2 catalog/contract/storage helpers under `src/lib/animation/**`, and phase-6 fixtures/tests/proof. It may not add video/audio/vector import, URL fetching, cloud assets, project-file import, dependencies, AI or export changes.

### Exact acceptance flow

1. Import one valid PNG/JPEG/WebP at small, boundary and representative sizes; inspect thumbnail, name/type/dimensions/bytes and stable Library separation.
2. Import duplicate bytes under another name and duplicate normalized name with different bytes; show distinct documented collision errors and do not duplicate storage.
3. Attempt every unsupported/corrupt/spoofed/animated/zero/oversized/batch/collection-capacity fixture; prove precise per-file reason, no catalog/history/storage mutation, input can retry.
4. Drag valid asset to stage; place then move, eight-handle resize with aspect lock default and explicit unlock, rotate, duplicate, delete instance; Undo/Redo every command. Instance references immutable project asset bytes; deleting instance does not delete catalog asset.
5. Remove unreferenced catalog asset; referenced removal is blocked with instance count. Delete instances then remove; Undo restores catalog/instances as applicable.
6. Save, edit, Save As, reload/Open original/copy; verify byte hash, dimensions, transforms, catalog/instance refs and last-good recovery after injected decode/hash/quota/readback failures.
7. Repeat desktop/compact/keyboard/200% zoom. Twenty import/preview/remove cycles revoke decode/blob resources; representative settled heap remains below 320 MiB, no native/GPU claim, p95 representative import ≤1 s desktop/≤2 s compact, transform preview stays within Phase 2 frame budget, and no external/network request occurs.

Exit requires magic-byte/animation/dimension/allocation tests before full decode, storage failure tests, real-browser visual/transform/reload proof and the complete prior protected matrix.

## 13. Phase 7 — Final Manual Editor Bug Burn and AI-Readiness Proof

### Goal and gate meaning

Repeat the complete manual matrix, fix newly found defects in the phase that owns them, and publish the exact runtime-used shared command-capability matrix. The exit gate is **zero known reproducible bugs in the defined matrix, no serious unresolved editor issue, no silent data loss, and no protected SPEC-0006 regression**. This is a bounded release criterion, not a mathematical claim that all software has zero bugs.

Any reproducible failure discovered before Phase 7 is fixed and re-proved in its owning phase before that phase can publish. A Phase 7-discovered defect is classified to Phases 1–6 and returned to a fresh separately authorized correction executor; Phase 7 does not absorb broad cross-phase repairs or reuse rejected bytes.

### Scope and allowed families

Allowed implementation is only narrow integration/testability/accessibility corrections demonstrably needed to make already published Phase 1–6 behavior pass together, plus the UI-independent final command registry/matrix exporter and phase-7 fixtures/tests/proof. Any semantic Drawing, rig, Builder, symbol, asset, storage, history or timeline correction returns to its owning phase. No AI/provider/prompt/model/API/video/tracking/motion work, redesign, new feature, dependency/deployment or standalone workspace change.

### Exact final matrix

Run at desktop `1440×900` DPR1 and compact `390×844` DPR2, plus 200% zoom and reduced motion where layout/animation applies:

1. Drawing: Select/Lasso; Brush/Pencil/Sketch/Pixelate/Glow settings and fixed strokes; Eraser/Fill/Text; every Shape/routing mode; Knife; clear/cancel; exact Undo/Redo.
2. Rig Tools: terminology; select/multi/whole rig; Add/Insert/Connect/Move/Delete; boundary and terminal races; appearance; every joint attachment; mixed Drawing+rig frames.
3. Properties, Library and Assets: every enabled control, error/empty/disabled state, Drawing/Rig/Mixed definition create/place/transform/edit/rename/update/duplicate/Make Unique/delete, supported/unsupported still lifecycle.
4. Layers/frames/timeline: add/rename/reorder/lock/visibility; keyframe/blank/hold/copy/paste/delete/tween-eligible operations; scrub, full-loop playback and pause; previous/next onion across raster/text/rig/attachment/all symbol categories.
5. History: at least 160 interleaved authored operations through the existing cap; full available Undo then Redo digest ledger; new edit after Undo clears Redo; failed/cancelled/no-op commands add none; no adapter-local divergence.
6. Persistence: New, Save, later Save, Save As, Open/reload original/copy, stale concurrent save, injected encode/hash/decode/quota/readback/CAS failures, last-good recovery, legacy all-source Open with zero source writes, and representative maximum assets/rig extension data.
7. Rig Builder: empty/create/Cancel/discard/save/edit/update/rename/duplicate/Make Unique/referenced delete, ordinary workspace round trip and compact access.
8. Accessibility/responsiveness: keyboard-only complete command path, focus/labels/status/errors, modal containment/return, Axe zero critical/serious, no page-axis overflow or obstructed stage/timeline action.
9. Protected SPEC-0006: ordinary one coordinator/V2 write authority, all six source kinds, mixed stage, selection/lasso, symbol/onion/timeline/history/persistence performance fixtures and zero legacy writes.
10. Isolation: diff/hash audit proves zero change under `src/lib/ai/**`, `app/api/**`, prompt/reference/model/provider modules, legacy source writers, Home/Tutorials and deployment/configuration; browser and server ledgers prove zero non-loopback/real API/provider requests.

Performance repeats the strictest prior phase bounds and the accepted SPEC-0006 representative large-project thresholds. Five warmed full playback loops/profile have zero missed document writes, zero render-triggered history writes, zero `>200 ms` long tasks, and no monotonic settled-heap growth. Any cleaner measured bound may be recorded but cannot silently replace an earlier stricter requirement.

### Final command-capability proof

The manifest binds a machine-readable registry and human-readable table with every §4.2 row. Static/import graph checks prove every enabled manual mutation control resolves a registered capability and no enabled control directly calls a document/catalog/history setter outside the coordinator's sanctioned commit adapter. Mutation tests remove/rename a command, bypass validation/history, alter a manual mapping, add an unregistered setter, or import AI/network code and must fail. Pure replay tests execute each envelope twice from identical bases and compare result/error/digest. This proves manual readiness for future reuse; it does not prove or expose AI control.

Phase 7 exits only after its technical manifest is PASS/VALID, Arthur and the PM accept the exact ordinary app, CPA propagation completes, separate publication is authorized/completed, clean local/remote synchronization is verified, and D-0054 cleanup completes. Only then may SPEC-0007 become Verified. SPEC-0008 remains a separate future proposed specification and receives no authority automatically.

## 14. Phase summary, entry gates, and review status

| Phase | TODO | Entry gate | Exit result | Status |
| --- | --- | --- | --- | --- |
| 1 — Drawing Tool Stabilization | `MANUAL-001` | D-0073 correction published/synchronized; `/4bb1/` evidence preserved and D-0054 cleanup complete; fresh clean worktree | Unchanged Drawing visual/perf/history/save proof, including inherited repair | Authorized; not started after valid entry stop |
| 2 — Rig Terminology/Selection | `MANUAL-002` | Phase 1 accepted/published/cleaned | Exact subtarget/whole-rig selection and movement | Not started; unauthorized |
| 3 — Rig Structure Editing | `MANUAL-003` | Phase 2 accepted/published/cleaned | Atomic topology editing/persistence | Not started; unauthorized |
| 4 — Rig Appearance/Joint-Attached Shapes | `MANUAL-004` | Phase 3 accepted/published/cleaned | Styled rigs and structured attachments | Not started; unauthorized |
| 5 — Rig Builder/Rig Symbols | `MANUAL-005` | Phase 4 accepted/published/cleaned | Deliberate persisted Rig Symbol lifecycle | Not started; unauthorized |
| 6 — Assets Stabilization | `MANUAL-006` | Phase 5 accepted/published/cleaned | Bounded honest still-media lifecycle | Not started; unauthorized |
| 7 — Final Bug Burn/AI-Readiness Proof | `MANUAL-007` | Phase 6 accepted/published/cleaned; no known prior-phase repro | Complete matrix and command registry proof | Not started; unauthorized |

There are no unresolved owner-choice blockers in the approved contract. Phase 1's clean-base performance receipt is mandatory before-evidence and bounded repair authority, not permission to weaken the owner outcome or any exit gate. Material changes to visible semantics, supported formats/limits, cascade behavior, symbol update linkage, or the shared-command invariant return to Arthur/Spec Architect. Bounded implementation mechanics may be resolved inside a phase when they preserve this contract and proof.

## 15. Planning verification record

| Gate | Result | Evidence |
| --- | --- | --- |
| Required control-plane boot | PASS | clean detached HEAD; required canonical docs/spec/references read before editing |
| Current code execution path | PASS | one workspace/coordinator, canvas adapter, graph/catalog/storage/history/Creator paths traced |
| Ordinary desktop live flow | PASS | Home → New → tabs/tools/Library/Assets → Creator inspected at loopback |
| Compact planning observation | PASS with limitation | temporary 900×700 Creator inspection exposed overflow; not a product fix or physical-device claim |
| First Phase 1 entry evidence | VALID STOP | exact clean base; zero tracked/index changes; 13 source/42 artifact bindings; 22 negative mutations; manifest SHA-256 `fb019f3f019e5d754dfde0c6189010e935176216d2bbc051a04d74b436e56a80` |
| Entry correction | PASS | clean-base miss remains before-evidence; exact exit ceilings unchanged; inherited repair bounded to the reached Drawing/V2 persistence path and complete correctness proof |
| Runtime/AI/provider changes | PASS (zero) | planning-only diff must contain documentation/tree files only |
| Implementation readiness | PHASE 1 AUTHORIZED, NOT STARTED AFTER VALID ENTRY STOP | fresh executor remains gated on D-0073 publication/synchronization, `/4bb1/` evidence preservation/D-0054 cleanup, and a new Plan-mode worktree |

## 16. Final planning state and handoff

Status is **Approved and active; Phase 1 Authorized; Not started after a valid clean-base entry stop** under D-0072/D-0073. After this correction package is reviewed, separately published/synchronized and the `/4bb1/` evidence is preserved/cleaned up under D-0054, the next task is one fresh Plan-mode Phase 1 Spec Executor worktree from that exact correction-publication SHA. Phases 2–7 remain unauthorized and cannot start automatically.

Recommended Phase 1 executor: **`gpt-6-astra` with `ultra` reasoning**. Phase 1 spans a 12k-line Canvas interaction surface, raster fidelity, gesture races, memory/performance, global history and lossless persistence; the high-risk cross-cutting evidence justifies Ultra. The executor must still patch narrowly and may not treat the model choice as expanded authority.
