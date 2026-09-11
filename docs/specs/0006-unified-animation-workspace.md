# SPEC-0006 — Unified Animation Workspace

Status: **Approved and active; corrected Phase 4 accepted and technically Verified pending publication.** Phases 1–3 are Verified/published/integrated. The former typed-layer Phase 4 remains rejected, unpublished, and non-reusable. The neutral Phase 4 replacement is human-accepted under D-0063 and awaits GIT-056 publication; Phases 5–7 remain not started.
Owner: Arthur
Task role: SPEC-0006 architecture correction owner, explicitly delegated by PM in the stopped rejected `/6e90/` worktree
Created: 2026-09-09
Last updated: 2026-09-12
Decision links: [D-0055–D-0063](../DECISIONS.md)
TODO IDs: `PLAN-006`, `SPEC-006`, `UNIFY-001`–`UNIFY-007`, `GIT-050`–`GIT-056`
Fresh local evidence: accepted Phase 4 worktree `/Users/arthurcarlin/.codex/worktrees/1550/stick-animation-app` is detached at exact published architecture base `e956840001d18757af8f2de5361640ba70d44d68` (GIT-055). The accepted technical manifest is `output/spec-0006/phase-4-neutral/proof-manifest.json`, SHA-256 `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`, with exactly 26 technical paths and an empty index. Canonical `main` and `origin/main` remain clean and synchronized at the same base before publication.

**Authority and sequencing.** Arthur requires neutral layers and a visible corrected Phase 4 in the same app copy. This supersedes D-0056/D-0057's typed-layer design and the former Phase 4 timeline-only boundary, not the three published historical results. SPEC-0006 remains the sole specification and retains **seven numbered phases**. Corrected Phase 4 has exactly **two sequential internal subphases, 4A and 4B**, under its existing correction authorization, ending in one visible human review. A hidden 4A checkpoint is never Phase 4 acceptance. See §12 for why ordinary New requires a minimal safe repository before cutover, the exact 12-path 4A boundary and 24-path 4B boundary.

This architecture task stops after its packet. It performs no runtime/proof/server/Git action. PM coordinates sequential exclusive ownership under Arthur's existing implementation authority without requiring Plan clicks or copied messages. Publication remains separately authorized. The same-copy correction exception and its verified recovery conditions are recorded in §16; rejected bytes are preserved as evidence, then replaced from canonical foundations, not reused.

| Phase | Result and lifecycle | Technical ceiling |
| --- | --- | ---: |
| 1 — V1 contract/read-only migration | Published GIT-051 `804ff39dc73c88d4799570cce2ef18987745a0be`; 11 actual paths | historical 18 |
| 2 — Shell/New/Open | Published GIT-052 `d2096109900cc50a0a4dae2f603bd74b7b4a3427`; 15 actual paths | historical 16 |
| 3 — Typed-layer mixed stage | Published GIT-054 `e11f6c453f13772ee9bd4b172a17bc68e1de65b9`; 16 actual paths | historical 16 |
| 4 — Visible neutral workspace/timeline correction | **Human-accepted and technically Verified pending GIT-056 publication**; 4A + 4B completed in one accepted review copy | **26 actual technical paths** |
| 5 — Complete current tools, project Library/Assets and panels | After corrected Phase 4 publication; not started | 20 |
| 6 — Complete canonical adoption/recovery and persistence proof | After Phase 5 publication; not started | 20 |
| 7 — Retire duplicate ownership and full acceptance | After Phase 6 publication; not started | 18 |

## 1. Plain-language outcome

Diamond Animator has one Animation Workspace, one project/document, stage, neutral layer/frame model, timeline/playback/onion system, current Library/Assets data, selection/tools/panels, Undo/Redo, and Save/Save As/Open/recovery. It combines the existing Drawing and Stick capabilities.

**The same layer and the same owner frame/cell can contain drawn strokes/shapes, editable text, bitmap symbol instances and editable Stick figures/rigs together.** A user can place a drawn or symbol sword at a Stick figure's hand and draw a fireball alongside it without adding a different kind of layer. This means manual placement and ordinary frame editing; it adds no automatic rig attachment, physics, constraint, or motion-following engine.

New Project opens **Untitled Project**, one empty neutral `Layer 1`, and no Drawing/Stick choice. Layers have no kind, default kind, hidden type lane, or type badge. Neither `· Drawing` nor `· Stick` appears in layer names, selectors, tooltips or accessibility labels. Content items remain type-safe; rigs stay structured and drawings retain their current raster/text semantics.

The visible layout preserves one top bar, timeline above the stage, right tabs in order **Stick Figure Tools, Properties, Library, Assets**, existing functional Drawing tools along the bottom including Shape, and AI Animator bottom right. “Share” means these systems use the common project capability layer; no cloud/social Share feature is added.

## 2. Current problem and verified evidence

### 2.1 Baseline ordinary user flow — verified before Phase 2

At the ordinary root app on loopback port `3000`:

1. Home → New Project opens a choice between **Drawing Animation** and **Stick Figure Animation**.
2. Choosing Drawing mounts a workspace titled **Unnamed drawing project** with Drawing's independent timeline, state, history, Save/Save As, and IndexedDB persistence.
3. Choosing Stick mounts a workspace titled **Unnamed stick figure project** with Stick's independent timeline, digest/history root, Save-only UI, and localStorage persistence.
4. Home → Open Project shows separate **Drawing** and **Stick Figure** tabs rather than one collection.
5. The Drawing right panel has Properties, Assets, Library; the Stick panel has Stick Figure Tools, Properties, Library, Assets. Both display AI Animator below the panel content, but they use different adapters and state owners.
6. Neither workspace can place a Drawing layer and an editable Stick layer in the same saved project.

Screens were observed at the ordinary desktop viewport; no review-only source or special route was used.

### 2.2 Baseline code/data path — verified before Phase 2

- `app/page.tsx` owns separate `drawingWorkspace` and `stickFigureWorkspace` views, separate active-project variables, two New Project cards, and two Open callbacks.
- `src/components/open-project/OpenProjectBrowser.tsx` separately listed Drawing IndexedDB/V1-compatibility entries and Stick localStorage entries, then opened them through different functions.
- `src/components/workspace/DrawingWorkspace.tsx` owns Drawing layers, frames, bitmap/text/tween/sound state, playback, two-scope history, persistence, and Drawing AI application. Its initial title is `Unnamed drawing project`.
- `src/components/workspace/DrawingCanvas.tsx` owns a six-canvas authoring surface, Drawing tool sessions, selection, text, imported assets, library symbols, camera state, and panel behavior. Its authoring allocation is based on host size × `4.6` × device-pixel ratio rather than a document-fixed backing size.
- `src/lib/drawingProjectStorage.ts` adapts live `DrawingProjectData.version = 1` to a strict Drawing V2 repository. Drawing V2 stores project heads/version records and PNG/audio assets transactionally in IndexedDB; its accepted limits include 128 MiB per stored project, 512 MiB per collection, 512 MiB referenced hydrated RGBA, 256 MiB per raster, and 64 projects. It also recognizes older localStorage Drawing records without rewriting them on open.
- Drawing cells preserve bitmap, tween-end bitmap, position-only motion-tween data, sound attachment, and text objects. Drawing's reusable imported-asset/library collections remain session-only even though raster/audio bytes already committed into frames persist.
- `src/components/workspace/stickfigure/StickFigureWorkspace.tsx` owns a different digest-gated editor root, publication generation, undo/redo arrays, one-time AI latch, editable Stick timeline, selection, manual joint/limb actions, playback/onion state, and Creator round trip. Its initial title is `Unnamed stick figure project`.
- `src/lib/stickProjectStorage.ts` stores a strict V1/V2 saved-record envelope in localStorage under its own key, with 32-record/4 MiB collection limits, no Save As path in the mounted workspace, and V1 compatibility that does not rewrite on open.
- `src/lib/stickfigure/stickTimeline.ts` resolves Stick keyframe/blank-keyframe/hold ownership and preserves `StickFigureFrameContent` containing figures plus a joint/limb structure graph. The accepted strict Stick contract uses a 1920×1080 top-left/down coordinate space and complete editable poses.
- `StickFigureCanvas.tsx` composites Stick layers only; `DrawingWorkspace.tsx` composites Drawing layers only. Each timeline and onion resolver knows only its own payload type.
- Current Drawing and Stick AI paths have different adapters. This spec does not broaden either path.

### 2.3 Phase 2 implementation boundary — accepted 2026-09-09

Phase 2 replaces the baseline navigation branch: Home New now creates an in-memory Untitled Project through `WorkspaceBootstrap`; Home Open renders one combined `ProjectCollectionEntry` list and maps a selected source through the Phase 1 migration boundary; `AnimationWorkspace` mounts exactly one Drawing or Stick compatibility editor. The accepted correction preserves the inherited Projects screen and editor chrome: no type selector or badges, no new wrapper header/navigation strip/drawer, and the editor begins at viewport pixel 0. Invalid entries are disabled. The source readers/list/open flow remain read-only.

The underlying editors remain architecturally separate. Drawing and Stick still own different compositor, timeline, tools, history, and save systems. Phase 2 does not provide mixed content, canonical persistence, one Save/Save As contract, or a shared editing transaction root.

### 2.4 Original missing foundation / root cause — before Phases 1–3

The split is architectural, not only navigational. There is no canonical project union, no common layer/cell ownership contract, no shared compositor, no one history transaction root, no one save repository, and no lossless migration boundary spanning both current formats. The two large coordinators can each consider themselves authoritative because `app/page.tsx` chooses between them before a project is created or opened.

Simply removing the two cards would hide this conflict. Simply serializing both legacy objects into one JSON blob would preserve neither referential integrity nor a single action order. Simply rasterizing Stick output would destroy editability. SPEC-0006 must replace the ownership seams in an ordered way while keeping both accepted systems usable after every phase.

### 2.5 Accepted Phase 3 boundary — 2026-09-10

`AnimationWorkspace` detects mixed typed layers and supplies a read snapshot of the existing Stick active owner to `UnifiedAnimationStage`. The common resolver and typed adapters render the ordered snapshot on fixed 1920×1080 front/work canvases; completed frames publish atomically and failed/stale renders preserve the last complete frame. The fixed stage uses presentation-only scaling and the existing Stick gesture/history transaction path. No canonical document/history write occurs from rendering.

This is a seeded mixed-stage foundation. Ordinary New/Open still uses the published Phase 2 path and existing source stores. DrawingCanvas, common timeline mutation UI, tool integration, shared history, canonical mixed Save and legacy retirement are not completed here. The scene is manually authored neutral proof content, not AI-generated motion. See §15 for the accepted result and its limits.

### 2.6 Rejection and fresh execution-path trace — 2026-09-11

The published V1 foundation models two kinds of layer. The rejected Phase 4 faithfully extended that restriction and cannot satisfy Arthur's corrected outcome. Its 18 technical paths and `output/spec-0006/phase-4/proof-manifest.json` are preserved as rejection evidence: SHA-256 `e9b7e5949198b5d24e21bddc901738ddafb4b63d978cc8f4002a0ccc0211d81b`, 104,287 bytes. A green typed-layer proof is not neutral-layer acceptance. This task traces code and retained evidence only; it starts no server and makes no fresh browser/visual claim.

| Published/rejected path | Actual restriction that must be removed from the eventual V2 path |
| --- | --- |
| `src/lib/animation/unifiedAnimationContract.ts` | `UnifiedAnimationLayerV1.contentKind` chooses the sole payload validator; Drawing source transform belongs to a layer; `drawingState`/`stickState` presence depends on layer kinds. |
| `unifiedAnimationMigration.ts` | Each legacy Drawing or Stick layer becomes exclusively typed. Full V1 envelope validation is source-migration-only, not a native saved-project repository. |
| `unifiedWorkspaceBootstrap.ts`, `AnimationWorkspace.tsx` | New constructs a Drawing candidate; mounted compatibility editor is chosen by source kind; mixed detection requires separate layers of both kinds. Native New bypasses full V1 validation and has a null Drawing transform. |
| `unifiedCellResolver.ts`, `unifiedDrawingRenderAdapter.ts`, `unifiedStickRenderAdapter.ts`, `unifiedStageRenderer.ts` | One typed owner/command per layer; tween legality depends on layer kind; rejected `commands.find(layerId)` cannot retain multiple same-layer item commands. |
| Rejected `unifiedTimelineReducer.ts`, `unifiedTimelineAdapter.ts` | Add/blank/copy/paste legality and emptiness use layer kind. The bridge projects Stick layers and inserts a Drawing placeholder; it cannot preserve a mixed cell. |
| Rejected `UnifiedAnimationTimeline.tsx`, `unifiedOnionResolver.ts`, Stick timeline/workspace bridge | Type badges expose real restrictions. Editing is active-Stick-only; onion dispatches by layer kind; structural boundary resets the separate legacy history. |
| `DrawingWorkspace.tsx`, `DrawingCanvas.tsx`, `stickProjectHistory.ts` | Drawing local/global history and Stick digest history remain separate authorities. Drawing brush/shapes are raster commits; text is editable metadata. |
| `DrawingCanvas.tsx`, `StickFigureRightPanel.tsx`, `StickFigureCreatorWorkspace.tsx` | Drawing `LibrarySymbol`/`ImportedAsset` are session-local; placed symbols become pixels. Stick sample grids are placeholders; Creator Save is disabled. |

### 2.7 Complete typed-layer assumption inventory in the superseded specification

These references identify the specification at GIT-054 before this amendment. Historical §§12 Phase 1–3 and §15 remain dated evidence, not current implementation instructions.

| Former location | Assumption | Correction |
| --- | --- | --- |
| Header, phase table, §§11–14 and 16 | Timeline before common history; no neutral-data or safe-New persistence correction | Two bounded internal Phase 4 subphases establish V2 data/repository then shared root/history and visible neutral timeline; seven numbered phases remain. |
| §§1, 7.1–7.3 | Background on Drawing layer, rigs on other Stick layers | Same neutral layer and owner cell accepts both, including sword/fireball. |
| §§3.1–3.2 | New blank Drawing layer; `contentKind`; exclusive payload; layer transform; no cross-kind cells | Neutral layer; ordered typed items; per-item transform; complete mixed owner. |
| §§3.3–3.4, 4.1–4.3, 8, 14 | Permanent V1 envelope and source-kind-derived state; migration preserves typed partition | Explicit V2 native/upgrade envelope, independent tool settings, lossless read adapters; V1 frozen as compatibility history. |
| §5 | Typed owner/render list/onion per layer | Whole mixed owner resolves once, ordered item commands and whole-owner onion. |
| §6 and Phase 5 | Hit-test and AI eligibility from active layer kind; library persistence expressly excluded | Item/subtarget selection; project catalog/bitmap instance persistence included; existing AI isolated by supported item projection only. |
| §9 | Separate Drawing/Stick layers prove “mixed” | Retain historical fixture and add independent same-cell mixed fixtures. Old fixture alone cannot pass. |
| REG-02/03/05 and Phase 1 negatives | Tool tests on exclusive layers; wrong-kind payloads rejected | Item-type safety and malformed union rejection; valid mixed cells and cross-layer mixed paste must pass. Historical V1 tests retain original meaning. |
| Phase 3, §14 render ownership | One typed adapter command per layer | Ordered item commands with layer/owner/item identity; no per-layer truncation. |
| Phase 4 path, acceptance and negatives | Typed reducer, wrong-kind paste/tween rejection, active typed onion | Neutral structural operations copy complete mixed snapshots; tween capability belongs only to eligible items. |
| Phase 5 outcome/flow/negatives | Wrong-kind layer tools disabled; separate Creator target; no persisted library | Existing adapters target items, preserve neighbors, common catalog and transaction order; Creator's disabled Save stays disabled. |
| Phase 6 and final gate | History after authoring; old repositories until late integration | Canonical transactions established before authoring; repository ready before ordinary cutover; no lossy fallback writes. |

Removing visible suffixes alone fixes none of the schema, projection, render, history or persistence restrictions above. The rejected implementation requires **substantial replacement from published canonical bytes**, not a narrow cosmetic transformation or reuse of its dirty files.

## 3. Canonical neutral V2 contract

### 3.1 Versions, identity, native New and validation

The new document and project envelope use `kind: diamond-animation-document` / `diamond-animation-project` with `schemaVersion: 2`. Do not reinterpret or loosen V1, alter its fixtures, or rewrite its historical manifests. Provide independently callable strict document validation, complete candidate validation/digests, native factory, and read-only V1 upgrade. No fake storage envelope or caught validation failure counts as document validation.

Native New creates a new lowercase UUID-v4 project ID, title **Untitled Project**, a new neutral layer `Layer 1`, one empty blank-keyframe owner, index 0 selected, 12 FPS, onion off, and the fixed 1920×1080 top-left/right/down stage. It creates no rig, artwork, catalog entry, source-store record or demo text. Both existing tool settings are available independently of which items currently exist. Tool/view settings and source counters are preserved explicitly but never make a layer typed.

Native provenance is explicitly `native`; migrated provenance records migration version 2, source kind/identity/revision/digest and prior V1 lineage if applicable. Native identity is not derived from a fictitious legacy source. Migration candidate UUIDs are deterministic from the versioned source binding and canonical source paths; repeated mapping of identical source bytes has the same digest. Native first Save retains the UUID allocated by New. First legacy/V1 adoption and Save As allocate a fresh persisted project identity and rebind project-bound auxiliary state once, without changing structured item payload IDs. Persisted V2 reopen retains its identity. Project/storage identity is outside ordinary authored Undo: after Save As, retained history snapshots are rebound to the copy identity; Undo then Save cannot restore or overwrite the old project's head.

Retain 1–64 layers, 1–10,000 cells per layer, 1–55 FPS, Drawing raster/audio and hydrated-memory limits, 128 MiB stored project, 512 MiB collection and 64 canonical records. Strict canonical numbers/strings, duplicate/reference/type/asset validation and bounded allocation remain mandatory. No new small per-item cap may reject supported legacy data. Validate stored byte budget separately from an in-memory read candidate: metadata expansion must not make a valid supported legacy source unreadable. Oversize canonical Save fails before head publication with the source and editable root retained; it may not claim a successful adoption. Phase 4A measures wrapper overhead at source limits; Phase 4A must prove truthful boundary failures and unique-asset accounting.

### 3.2 Layers, cells and ordered typed items

A neutral layer has `layerId`, name, bottom-to-top `orderIndex`, visible/locked flags, preserved source identity/order metadata where migrated, and ordered cells. **No layer `contentKind`, default content type, per-kind child layers, or parallel per-kind timelines are permitted.**

Each cell has stable `cellId`, source cell/state metadata where migrated, index position, and `cellType` (`empty`, `keyframe`, `blank-keyframe`, `hold`, `tween`). Owners point to themselves and own exactly one immutable `content` snapshot `{items, soundAttachment}`. Empty cells have no owner/content. Holds point directly to an earlier owner on the same layer and have no independent payload. Blank owners contain zero active visual items; preserved sound metadata may exist. No chain, forward, missing, cyclic or cross-layer ownership is accepted. Independent owners cannot share mutable arrays, graph objects or asset buffers.

Strict V1 accepts a blank owner with a dormant nonempty payload that its renderer suppresses. Preserve this source data and its exact asset references in optional, source-bound `dormantSourceContent` compatibility metadata rather than discarding it. Native cells set it to null. It is immutable import evidence, covered by digest/storage/asset reachability, never rendered, hit-tested, tweened or used as an editing lane. Normal editing adds active items and never unexpectedly reveals dormant content. Include `V1-BLANK-DORMANT-01` with Drawing and Stick variants in the independent migration/storage fixtures; no additional source writes or altered V1 parser semantics.

`items` is the authoritative bottom-to-top array; each item has a stable item UUID and one strict discriminator/payload. It is not a second layer list. An item remains one contiguous paint unit; raster edits can create additional items when paint must appear above another item.

| Item discriminator | Exact owned data and capability |
| --- | --- |
| `drawing-raster/v1` | Existing bitmap asset, tween-end asset and optional existing position-only tween data, preserving source dimensions/origins/sprite and exact asset bytes. Brush, eraser, fill, shape, knife and bitmap selections edit raster pixels; no vector reconstruction is added. |
| `drawing-text/v1` | One complete current `DrawingTextObjectV2`, retaining original text ID/string/position/width/flip/rotation/font/size/color/style and all strict fields. Text stays separately editable. |
| `stick-rig/v1` | Complete current `StickFigureFrameContent` (figures plus structure graph), with exact figure/joint/limb IDs, transforms, topology and coordinates. Multiple rig items can coexist. Existing internal IDs are namespaced by item identity, not regenerated or globally conflated. |
| `symbol-instance/v1` | Project-local bitmap symbol definition ID and immutable definition digest, plus independent x/y/width/height/rotation/flip transform. It remains an instance after placement and Save/Open; changing its transform does not edit the definition or another instance. |

Drawing source-space display transforms move from V1 layers onto each migrated raster/text item. Native items use identity stage coordinates. Invertible finite positive-scale transforms are validated; resize changes presentation only. Copy/paste across layers preserves source coordinates/transforms. Rig payload coordinates remain unchanged. Symbol instance placement uses the existing bitmap-placement transform semantics; no rig-binding field is added.

For a migrated Drawing owner, emit its raster item first when raster/tween data exists, then editable text items in original array order; preserve its sound attachment once at owner scope. Do not duplicate rasterized legacy text or invent missing symbol associations. For a migrated Stick owner, retain the complete structured payload in one rig item; truly blank content maps to no visual items. Preserve owner/cell maps independently of visible emptiness.

Tween ownership is neutral. A tween span must contain at least one eligible raster item with complete supported position-tween data. That item's current sampling `(index-start+1)/(end-start+2)` and rounded origins are preserved exactly. All other same-owner items hold unchanged. Tween eligibility never types the layer or causes rig interpolation. Item/owner deletion and span changes validate every affected reference atomically.

### 3.3 Project Library/Assets and auxiliary state

The authored document owns project-local symbol definitions and imported-asset catalog entries. Bitmap symbol definitions preserve current ID/name/dimensions and reference immutable content-addressed image bytes; definition digest covers semantic metadata and asset hash. `signature` is a legacy UI dedupe hint, never an integrity proof. Current image asset entries preserve name/kind/dimensions/metadata and real image bytes; existing non-placeable generic file entries remain metadata-only placeholders with no invented file operation. Blob URLs and data URLs are transient handles, never persisted authority. Save persists real referenced raster/audio bytes and catalog metadata together.

Every placed symbol references a definition in the same project. Missing/cross-project/mismatched definitions fail closed. Definition removal is rejected while any live document instance references it; deleting the final instance does not automatically delete its reusable definition. Undo/Redo snapshots retain definition/asset reachability. Definitions are immutable; no linked-definition editor, animation symbol engine, new reusable rig catalog or enabled Creator Save is added. Legacy saved pixels cannot recover lost definitions/instances; legacy imports have empty catalogs unless the source actually carries supported catalog data. Phase 5 captures current session-created definitions directly into the common root going forward.

Existing Drawing AI memory and Stick one-time creation latch remain separate typed project-bound auxiliary data. Preserve source semantics and rebinding checks. Session chat stays session-only. View/reopen state includes active layer/cell/index, existing tool/tab/camera/onion settings and a valid serializable item selection; missing targets clear selection safely. Authored digest includes document, catalogs and asset manifests; candidate binding also covers identity/title/provenance/auxiliary state. View transitions do not create authored history.

### 3.4 One command, history and pending-operation authority

Phase 4B establishes `UnifiedWorkspaceRootV2`: one document/digest, one project/instance/generation binding, one ordered Undo stack and Redo stack, one saved-baseline/revision binding, and one failure state. Immutable asset references are retained without copying image bytes into every snapshot. Root commands validate base digest/generation/target ownership before committing exactly once. Native no-op, failed, cancelled or stale operations create no history and change no document/latch/catalog/head.

Every later Drawing gesture/text change, rig/joint operation, symbol placement, timeline action and existing accepted AI Apply uses that same dispatcher. Adapters may own transient preview/tool sessions only. No second writable legacy document, history stack, Save door, state overlay, or history reset at structural edits is allowed. Undo restores the preceding global authored digest and Redo the exact next digest, irrespective of item kind. Camera/scrub/play/tabs/selection/AI Preview are view state. Preserve accepted AI latch semantics: Undo does not reopen consumed one-time AI authority.

## 4. Lossless migration, persistence and failure contract

Read supported Drawing V1/V2, Stick V1/V2 and strict unified V1 through their unchanged source parsers. Upgrade V1 into V2 in memory; support native/persisted V2 directly. Invalid sources remain unavailable collection entries with clear errors. Unsupported versions, corrupt references/digests/assets and inconsistent source spaces never partially mount. Listing/Open write zero bytes.

Preserve every source field in this inventory: Drawing tool settings/FPS/layer and cell order/identity ownership, blank flags and dormant payloads, RGBA and encoded hashes, tween endpoints/numbers/sprite, sound metadata/audio, complete editable text, counters/selections/onion/name/timestamps and scoped AI memory; Stick figure/graph IDs and coordinates/transforms, owner spans, revisions/reopen state/title and latch. New item wrappers preserve source-to-canonical identity maps. Raster/audio bytes are not recompressed during migration. Layer order is explicitly normalized to bottom-to-top without reversing historical visible order. A changed legacy source digest remains a different adoption candidate.

The native/legacy/V1/V2 parsers, migration and repository are separate authorities: parsing has no writes, mounting publishes only a fully validated current candidate, and Save is the only explicit write operation. First legacy/V1 adoption creates a new V2 ID, preserves source stores unchanged and records provenance. Save updates only the captured canonical ID/revision. Save As creates a new V2 ID and leaves the old head unchanged; it makes the new identity active only after complete write/readback/head verification. Title equality never defines identity. Collection dedupe collapses only exact source-digest/adoption provenance pairs while retaining source disclosure; changed sources remain separately available.

Reuse proven Drawing V2 PNG/WAV/canonicalization/IndexedDB transaction mechanics where safe, with a distinct unified V2 repository namespace. Do not alter Drawing/Stick source schemas or use a lossy V2-to-legacy projection for saves. One snapshot contains all mixed cells, definitions, instances, catalog metadata, assets, reopen state and auxiliary bindings. Asset preparation/hash/decode/quota/CAS/readback/ID-collision/stale-generation/open-race failures preserve the last complete root, history, old head and source bytes. Save completion for an older captured digest may store that snapshot but cannot mark newer edits saved. Undo during Save and concurrent tabs must be covered explicitly.

Recovery means last-good-head validation and safe retry/Save As/Open after a failed explicit operation. It does not add autosave, project-file export, cloud sync, account sharing or legacy deletion. Unpublished versions/orphans cannot replace a last good head. Asset reclamation must retain every live head, pending operation and retained history reference; destructive collection cleanup is outside this spec.

## 5. Shared rendering, timeline, playback and onion

Resolve the current neutral cell/owner once per visible layer. Emit every visible item in bottom-to-top layer order, then owner `items` order; dispatch by **item discriminator**. Render commands carry project generation/layerId/ownerCellId/itemId and the same source-to-stage transform used by selection. No one-command-per-layer lookup, type bucket regrouping or merged raster cache may erase/interleave neighboring rig/text/symbol data. Fixed 1920×1080 work/front canvases publish a complete current-generation frame atomically. Decode/adapter failure preserves the last complete frame. Edit/playback/onion/thumbnail/proof use the same resolver; export feature expansion is excluded.

One playback clock advances the maximum layer length at document FPS and records every authored index through `0…last→0`; shorter layers are empty outside their defined cells. Scrub/play/resize never mutate authored data/history. Sound is scheduled once per entered owner boundary through the common clock; repeats/holds do not multiply cues, pause stops playback audio, and failed audio does not mutate the project.

Paused onion chooses the nearest distinct previous/next owner on the active neutral layer, stopping at explicit empty or blank boundaries. It skips repeated holds of the current owner and preserves existing Stick visible-content deduplication: skip independently owned snapshots visually equal to the current snapshot and avoid duplicate previous/next ghosts. Compare complete ordered mixed visual signatures through the same adapters, excluding cell/item ownership IDs and nonvisual metadata; identical rig-only poses retain inherited behavior. Render the **entire ordered mixed owner** to one previous-purple/next-green tinted overlay, including all eligible drawing/text/rig/symbol items; do not double-draw individual type layers. Ghosts are behind current content, unselectable, and hidden during playback. Tween samples/end boundaries preserve the current Drawing convention with independent fixture expectations; no new Stick interpolation.

Timeline actions operate on complete neutral ownership, with one transaction for successful structural edits:

| Action | Required semantics |
| --- | --- |
| Add/delete/rename/reorder layer | New neutral blank layer; no kind argument or label. Stable surviving IDs; cannot delete last layer. Rename/reorder preserve all item payloads. |
| Insert independent keyframe | Materialize complete mixed snapshot with new owner/cell/item identities; preserve subtarget payload IDs under new namespaces; no mutable alias to another owner. |
| Insert blank/empty or hold | Blank owns no visible items; empty breaks exposure; hold points to the resolved earlier whole owner. First edit in an empty/blank slot creates content in that same slot as one transaction. |
| Edit at a hold | Edit the whole span's owner, but replace only the targeted item/subtarget. Other independent owners and other item bytes stay identical. UI/receipt identifies the owner. |
| Copy/paste cell | Copy complete mixed owner, cues and dependency references. Paste on any neutral layer is valid, atomically creates independent item ownership and preserves order/transforms; no wrong-layer-kind rejection. Clipboard is project-scoped; Open clears it. |
| Remove owner/cell | Rebind surviving exposure to a materialized independent owner if removal would dangle it, otherwise remove only the selected slot and shift its suffix. Preserve visible surviving snapshots; reject inconsistent tween rewrites. |
| Resize span | Extend through empty positions or existing same-owner holds only; shrinking preserves out-of-span cells, never overwrites occupied independent owners. Recompute references atomically. |
| Tween action | Preserve current position-only Drawing functionality for eligible raster items in a mixed owner; other items hold. Unsupported item/tween combination fails locally without altering neighbors. |

Mutations to locked layers and structural/authoring mutation while playing are disabled/rejected. Selection may change only view state. Timeline menus keep existing supported action semantics; no new multi-cell editor or interpolation feature is implied.

## 6. Shared tools, selection, panels and library

One selection key binds workspace generation/project/layer/resolved owner/item and optional current text/figure/joint/limb subtarget. Hit-test reverse paint order using the render transforms, visibility and existing tool eligibility; hidden/locked items/layers cannot be edited. Select hits the topmost eligible item. Transparent raster pixels do not block lower items; existing text bounds and Stick figure/joint tests stay local to their adapter. The existing 18-unit Stick joint tolerance must be transformed consistently with stage/presentation, not multiplied by DPR. Ghosts and stale overlays cannot become targets.

Brush/Shape start a new raster item at the top of the active neutral owner when no raster item is explicitly targeted, or edit the selected raster item in place. Fill/Eraser/Knife and bitmap Select/Lasso operate only on their selected/hit raster item. They never flatten or erase a neighboring rig/text/symbol. Text creates/edits a text item; Stick tools add/edit structured items in the same cell. Choose the existing tool and target, not a layer type. Pointer previews do not change the document; pointer-up commits once. Layer/project/owner switch, play, escape, lost capture and stale async decode cancel the pending gesture before a mismatched commit.

The seed-free Phase 4 creation flow uses the already working **Stick Figure Tools → Add Limb** drag gesture to build a connected figure/graph, then existing Select joint dragging to edit it. If no rig item is targeted, the first committed segment creates one rig item in the active owner as the same transaction; subsequent segments edit that item. Drawing Brush/Shape/Text then add neighboring items in that very cell. Do not enable the currently placeholder Add Joint/Remove Limb/Connect Limb controls, depend on disabled Creator Save, or auto-seed a demo rig to make the acceptance flow possible.

Library/Assets are one real project catalog. Symbol creation uses existing selection-to-bitmap capture, commits one immutable definition, and symbol drop commits an independently transformed instance. Legacy already-flattened symbols remain raster pixels without fabricated identity. Library/asset references survive copy, Undo/Redo and Save/Open. Static Stick sample cards are not catalog data; no examples enter ordinary projects. Existing placeholders remain clearly inactive. Creator → Back preserves the same project/view/history; Creator Save remains disabled and no new rig-library authoring is promised.

Properties follows the selected item's actual supported fields; no new Stick colors/head/shape/rig capabilities. Keep the established tab/toolbar order and desktop/compact access. Each functional Drawing tool and current Stick selection/joint/structure action receives a capability-to-command test; a union type or painted placeholder is not evidence of a working feature.

AI remains a protected compatibility boundary. Do not edit `src/lib/ai/**`, `src/lib/openai/**`, `app/api/**`, prompt/model/provider/motion-engine code. A workspace adapter may project only an explicitly supported item/owner target into an unchanged accepted AI/manual contract, bind the captured root, and publish the existing result through the common dispatcher without replacing neighboring items. Mixed/unsupported projections reject locally before requests. Preserve prior eligible Drawing/Stick flows, one-time latch and disabled-task exits with deterministic mocks. No generated sword/fireball, new planner, paid request, AI/video/tracking behavior or new AI claim.

## 7. Required ordinary-app acceptance flows (Phase 4 correction and final Phase 7)

1. Home → New opens Untitled Project, one empty **Layer 1**, empty real catalog and no type question/badge. There is no automatically seeded rig, `DRAWING + STICK`, colored block, foreground/background word or proof project.
2. In Layer 1/frame 1, draw a shape/stroke, add editable text, add a current Stick figure, and position a drawn sword/fireball beside it. All remain on the **same layer and owner cell**, with separately targetable data.
3. Create a bitmap sword symbol using the existing selection/library flow, place two instances, move one to the hand, and verify the second instance/definition/rig stay unchanged. No automatic attachment is claimed.
4. Change overlap order and select/edit each eligible item; Properties follows it. Erase part of a raster without harming the rig, text or symbol. Resize/DPR changes do not move authored content.
5. Add an independent mixed keyframe, extend a hold, edit a joint on the hold, copy/paste the mixed cell to another neutral layer, resize its span, scrub, toggle onion, and observe a complete playback loop. Distinct owners remain independent and ghosts contain complete mixed content.
6. Undo the interleaved Drawing → rig → symbol → timeline actions to the exact baseline and Redo to the exact final document, catalogs and auxiliary state allowed by latch semantics. No old stack is cleared at a structural action.
7. Save, edit/Save, Save As, reload and Open both identities. Verify mixed item order/IDs/coordinates/pixels/text/definitions/instances/audio/tweens, title/reopen state and source-safe history baseline. Undo history itself need not survive browser reload.
8. Open supported Drawing V1/V2 and Stick V1/V2, and a strict unified V1 fixture read-only; edit the opposite content type in the **same layer/cell**, first-save adopt, reload/open and compare source byte snapshots. No typed hidden layers appear.
9. Inject invalid/stale/decode/encode/quota/transaction/readback/ID failure and verify last complete root/head/source/history retained, truthful failure, safe retry. No review fixture appears in ordinary New/Open or saved output unless explicitly authored by the test harness inside its isolated storage origin.

## 8. Data, AI, cost, security, and privacy impact

- **Schema/migration:** material. Adds a neutral V2 document/record and project-owned bitmap catalogs/instances, provenance, typed content union, shared history root, repository, and deterministic migration adapters.
- **Persistence/backward compatibility:** material. Reads all supported existing formats. Does not delete or rewrite legacy stores. Canonical writes are transactional IndexedDB writes with content-addressed assets and revision/readback checks.
- **Data loss:** highest risk in this spec. Every phase touching data must use frozen valid/corrupt/boundary fixtures, exact digest checks, injected failure/stale races, and non-destructive source snapshots.
- **AI:** no new capability, model, prompt, reference, routing, motion plan, tracking, or provider. Existing behavior is a protected adapter boundary only.
- **Cost/network:** all SPEC-0006 proof is loopback/offline. `/api/ai`, Supabase, provider, search, telemetry, and non-loopback traffic are blocked or deterministically fulfilled. Zero live request, token use, search, retry spend, or paid call is permitted.
- **Authentication/ownership:** unchanged. Projects remain browser-local; no account, cloud sync, sharing, rate-limit, or authorization design is added.
- **Privacy:** no new external transmission. Canonical project bytes remain in local browser storage. Logs/proof must not contain raster/audio bytes, prompts, secrets, or full project documents; record only fixture IDs, counts, sizes, digests, timing, and bounded error codes.
- **Deletion:** none. No legacy store cleanup or automatic destructive migration.
- **Dependencies/config/deployment:** no new package, service, environment key, schema deployment, hosted database, or production deployment. A dependency change requires Arthur/PM amendment before phase execution.

## 9. Representative mixed-project performance and memory contract

`MIXED-REALISTIC-01` is the preserved historical typed-layer performance fixture. It is necessary inherited coverage but insufficient for neutral-layer acceptance:

- 1920×1080 stage, 12 FPS, 48 timeline positions;
- bottom Drawing background layer with two distinct `4563×3302` RGBA sources (60,268,104 bytes each), one hold span, text, and one preserved position-tween payload;
- one editable Stick layer with one complete figure/rig, at least four independent key poses and held cells across the 48 positions;
- one upper Drawing/text layer;
- one small deterministic WAV attachment already inside the accepted Drawing bounds;
- total source and canonical digests frozen independently; no fixture generator may import the migration/renderer under test to compute its oracle.

Required production-build measurements use foreground Chromium, five runs after one warm-up, with machine/browser/version recorded:

| Measure | Desktop `1440×900`, DPR 1 | Compact `390×844`, DPR 2 browser profile |
| --- | ---: | ---: |
| Seeded Open click → interactive stage/timeline | median ≤ 5,000 ms; worst ≤ 7,500 ms | median ≤ 8,000 ms; worst ≤ 12,000 ms |
| 120 alternating timeline selections | p95 visible settle ≤ 100 ms | p95 visible settle ≤ 150 ms |
| Save after one mixed edit | median ≤ 6,000 ms; worst ≤ 10,000 ms | median ≤ 10,000 ms; worst ≤ 15,000 ms |
| Foreground 12-FPS playback | complete `0…47→0`; ≥95% ticks within 0.5×–1.75× of 83.33 ms; zero skipped authored indices | same |
| Long tasks during the 120-selection sample | none > 500 ms; ≤5 > 100 ms | none > 750 ms; ≤8 > 100 ms |

The implementation must expose a proof-only accounting seam, not a production debug UI. Asset bytes are not copied into history snapshots or canonical JSON. No eager full-project decode is allowed. App-owned simultaneous decoded raster/backing-store bytes are bounded to `4 × largest source RGBA asset + 6 × (1920 × 1080 × 4)` = **290,838,816 bytes** for this fixture, with settled idle bounded to `2 × largest source RGBA asset + 4 × stage RGBA` = **153,713,808 bytes**. CDP `JSHeapUsedSize` after explicit proof GC must be ≤320 MiB and peak observed JS heap ≤512 MiB in both profiles. Native/GPU allocation is reported separately when available and is not falsely equated with JS heap.

Compact proof is responsive-browser evidence, not a claim of physical low-end-phone performance. Phase 7 must state that limitation. No horizontal page overflow, unreachable control, stage smaller than 260×146 CSS px, or panel obscuring the only way to close it is allowed at `390×844`.


### 9.1 Neutral fixture and seed-isolation additions

Freeze independent `NEUTRAL-CELL-01` and `NEUTRAL-TWEEN-01` fixtures plus a realistic neutral arrangement with the same large-raster/48-frame load. The neutral arrangement must put raster, editable text, structured rig and two symbol instances in **one owner cell on one neutral layer**, then test another neutral layer for compositing/copy. Preserve historical MIXED hashes and masks; never regenerate the old oracle from the new renderer. Manually placed sword/fireball acceptance uses current tools and is not AI motion quality.

`MIXED-REALISTIC-01`, `DRAWING + STICK`, colored blocks, demo rig, foreground/background words and all review-server instrumentation are test-only. Test sources may remain under scripts/ignored output, but no ordinary runtime import, build dependency, public asset, query flag, hidden fixture route, starter project or auto-created library entry may contain them. Normal New/Open runs with empty storage must stay seed-free; normal Save and Save As may contain only user-authorized project content and its real dependencies. Test seeding uses a distinct disposable browser origin/profile and never writes the user's normal stores. Source token scans alone are insufficient: inspect module reachability, catalog/project/asset bytes and ordinary visible output. Later cleanup must prove the exact old review process stopped and port closed.

## 10. Protected regressions

| ID | Protected result | Required proof throughout applicable phases |
| --- | --- | --- |
| REG-01 | Home, welcome, menu, Tutorials, Back/focus, and removed AI Credits card | Existing permanent tester plus focused ordinary-root smoke |
| REG-02 | Drawing brush/eraser/fill/text/shape/knife/select/lasso, camera, selection, clear, and visual output | Existing actions on raster/text items in a neutral mixed cell; exact pixel/text fixture where deterministic |
| REG-03 | Drawing cell ownership, layers, persistent position tween, playback, onion, sound attachment, and text | Contract tests plus complete timeline traversal and Save/Open digests |
| REG-04 | Accepted Drawing V1 compatibility and V2 transactional storage limits/failure safety | Existing SPEC-0002 validators and new migration cross-checks |
| REG-05 | Stick independent keyframes/holds, manual joint/limb edit, line head, selection, playback/onion, Creator → Back | Existing Stick validators and ordinary UI flow |
| REG-06 | Stick one-time AI transaction/latch and accepted SPEC-0004 Phase 1/2/2.5 compatibility | Existing focused validators; no new visible-motion quality claim |
| REG-07 | Accepted SPEC-0005 Phase 1/2 v1/v2 proof/runtime bytes | Source-diff protection and existing validators; no normal route begins using the safety seam |
| REG-08 | Existing Drawing AI feature gates, memory isolation, disabled-task exits, and server-only credential boundary | Existing deterministic route/memory validators; all real external calls blocked |
| REG-09 | Save/Open failure atomicity, stale completion rejection, ID/digest binding, and dirty-state truth | Inject each named failure/race and compare document/history/head/source digests |
| REG-10 | No review-only UI, proof port, query flag, or fixture picker in product | source/build-import scan, ordinary-root screenshots, fresh-store New/Open and saved-project content/asset provenance checks |
| REG-11 | One active review copy under D-0054 | exact process/cwd/port identity, one loopback root, cleanup/ownership record |
| REG-12 | No legacy deletion or rewrite | before/after raw store byte snapshots and IndexedDB record/asset digests |

Systems intentionally outside SPEC-0006: new AI quality, provider/model/video/tracking design, SPEC-0007 manual capability expansion, export redesign, cloud sync/auth/billing, custom model R&D, and deployment. They receive source-diff/no-network protection, not invented acceptance claims.

## 11. Phase-wide execution rules

- Each phase is one executor-sized vertical result and may touch no more than its stated tracked technical path ceiling. The ceiling counts added/modified/deleted runtime, fixture, test, and proof-source paths; ignored proof artifacts and later CPA control-plane paths do not count. Exceeding the ceiling requires a reviewed spec amendment before editing the extra path.
- The executor records the exact base SHA, branch/worktree, index state, pre-existing bytes, exact final dirty allowlist, path hashes/sizes, commands, artifacts, review URL/port, network ledger, and proof-manifest SHA-256.
- Every phase runs TypeScript, focused lint, changed-line/full-lint non-regression, phase contracts, inherited relevant validators, `git diff --check`, empty-index checks, source scans, and ordinary app-copy regression smoke at one loopback non-`3000` root. Phase 4A is a technical checkpoint only; Phase 4B must deliver ordinary neutral New/Open and visible same-cell editing before Phase 4 human review.
- Review fixtures are seeded only into isolated proof storage/source copies under ignored output, never ordinary source stores or product routes. No review-only UI, route, query parameter, global, or fixture selector enters product source.
- Exactly one review app copy may exist. The executor stops after its packet but preserves that copy for Arthur. D-0054 governs acceptance/rejection cleanup and never permits concurrent executor/architect ownership.
- No executor edits `AGENTS.md`, canonical `docs/`, or `project/project_structure.txt`; stages, commits, merges, rebases, pushes, publishes, deploys, or touches another worktree.

## 12. Seven numbered phases; corrected Phase 4 has two internal subphases

The Phase 1–3 mandates below are preserved historical scope descriptions. Their typed-layer assumptions and old phase-number handoffs are superseded for future work by D-0062 and corrected Phases 4–7; do not rerun or republish them.

### Phase 1 — Unified contract and lossless legacy migration

**Plain outcome.** The repository has one strict unified project contract and deterministic, read-only adapters for every supported Drawing/Stick source. Nothing is wired into the ordinary UI yet.

**Problem solved.** Later UI work cannot be safe while field preservation, coordinate mapping, ownership, IDs, provenance, limits, and failure codes are implicit.

**Traced execution path.** Frozen legacy fixture/raw store → existing source parser (`drawingProjectStorage`/Drawing V1 compatibility or `stickProjectStorage`) → source-specific mapper → `parseUnifiedAnimationProjectV1` → canonical digest/invariant validator → in-memory candidate or typed rejection. No repository write and no React mount.

**Exact scope and likely path ceiling.** Add unified contract/canonicalization/migration modules under `src/lib/animation/`; add independent fixtures/oracles/validators/recorder under `scripts/spec0006-unified/` and `scripts/fixtures/spec0006-unified/v1/`. Existing source parsers may receive only a narrow exported read adapter if essential. **Ceiling: 18 tracked technical paths.** No component, `app/page.tsx`, existing store write path, package/config, or API route change.

**Non-goals.** No shell, stage, timeline, tool, history, canonical save repository, normal-route behavior, AI work, or legacy cleanup.

**Entry gate.** Satisfied historically by GIT-050 at `3b784cc6a68ff6f10fa390d96b81376b46e54b44`, a clean/synchronized canonical main, one fresh dedicated worktree, the frozen 11-path list, and independent migration fixtures/oracle.

**Normal app-copy human review.** Open the ordinary app and confirm Home, current New Project split, Drawing, Stick, and Open tabs still look/work exactly as before. This is regression smoke, not a demonstration of the hidden contract.

**Measurable acceptance.** Every valid frozen Drawing V1/V2 and Stick V1/V2 source returns one deterministic valid canonical candidate; repeated runs produce identical canonical digests; all preservation obligations in §4.3 pass; exact raster/audio hashes match; open mapping performs zero writes; all limits/error codes are stable.

**Negative tests.** Unknown fields/versions, duplicate IDs, corrupt JSON, malformed typed arrays/blobs, missing/mismatched assets, invalid cell owner, tween on Stick, rig payload on Drawing, non-finite/-0 numbers, Unicode/title edge cases, over-limit counts/bytes, inconsistent legacy raster dimensions, source mutation attempt, digest/provenance tamper, generated-oracle self-import.

**Protected regressions.** REG-01, REG-04–REG-08, REG-10–REG-12; exact current runtime component and write-path bytes remain unchanged except an approved read-export seam.

**Technical proof.** Independent fixture oracle; at least 50 named valid/boundary cases and 100 named invalid/tamper cases; byte snapshots before/after; determinism over 1,000 repeated seeded mappings; inherited Drawing/Stick storage/contract/history validators; TypeScript/lint/diff/index/network checks; validated manifest.

**Stop boundary.** Return the Phase 1 Implementation Review Packet and stop. Do not wire UI, create a canonical repository, authorize Phase 2, propagate docs, or publish.

**Recommended effort.** GPT-6 Astra, Ultra reasoning; migration/data-loss architecture.

### Phase 2 — One shell and unified New/Open paths

**Plain outcome.** New Project opens one Animation Workspace titled Untitled Project without asking Drawing vs Stick. Open Project shows one collection and opens any supported project into that shell.

**Problem solved.** `app/page.tsx` and `OpenProjectBrowser` currently branch identity before a workspace mounts.

**Traced execution path.** Home New/Open → one page transition → unified collection/bootstrap controller → Phase 1 mapper/validator → pending mounted-open binding → one `AnimationWorkspace` instance → compatibility editor adapter for the candidate → visible shell. Failed/stale open keeps the previous root.

**Exact scope and likely path ceiling.** `app/page.tsx`, `OpenProjectBrowser.tsx`, new `AnimationWorkspace`/shell/bootstrap/collection modules, focused UI fixtures and proof. Existing workspaces may be wrapped for compatibility but retain their internal editors during this phase; only one is mounted for a candidate. **Ceiling: 16 tracked technical paths.** No unified compositor/timeline/tool merge/save repository.

**Non-goals.** No mixed rendering/authoring, no shared history, no canonical Save, no legacy deletion, no tool capability change, no URL/router redesign.

**Entry gate.** Phase 1 accepted, propagated, published, synchronized; candidate mapper API/hash frozen; exact collection dedupe/invalid-entry fixtures accepted; one review-copy slot free.

**Normal app-copy human review.** At desktop and compact viewports, Home → New goes directly to Untitled Project with the inherited editor top bar at viewport pixel 0; reload → Home → Open preserves the established dark Projects layout, Back control, centered heading, spacing, and cards while removing the Drawing/Stick selector and showing one collection without type badges; valid Drawing V1/V2 and Stick V1/V2 entries open; invalid entries are disabled; Back/focus and ordinary Home remain usable.

**Measurable acceptance.** Zero Drawing/Stick choice controls; exact title Untitled Project; one collection ordering rule (`updatedAt` descending, stable ID tie-break); exactly one mounted `AnimationWorkspace` and never two legacy compatibility editors at once; open writes zero bytes; stale/failed open leaves the current bootstrap/candidate digest unchanged; no page overflow at required viewports.

**Negative tests.** Double-click/racing opens, open during bootstrap, invalid entry, missing asset, source changed after list, duplicate provenance, same title/different ID, empty collection, IndexedDB unavailable, localStorage read error, reload/refresh, compact Back/focus, accidental type badge/selector, added wrapper chrome, or source-store mutation.

**Protected regressions.** REG-01, REG-04–REG-12. Both legacy editor experiences remain usable inside the new shell until their owners move in later phases.

**Technical proof.** Deterministic collection/bootstrap tests, source before/after storage snapshots, race matrix, desktop/compact screenshots and accessibility tree, zero-network ledger, permanent tester update only if the visible flow requires it, inherited validators, manifest.

**Stop boundary.** One shell/navigation result only. Do not implement mixed stage/timeline/tools/history/save, delete old components/routes, authorize Phase 3, propagate, or publish.

**Recommended effort.** GPT-6 Astra, Extra High reasoning.

### Phase 3 — Unified stage, renderer, and mixed compositing

**Original execution authorization — D-0060 (2026-09-10); completed and accepted under D-0061.** D-0060 authorized one Plan-mode Spec Executor for this stage/compositing phase from exact runtime base `d2096109900cc50a0a4dae2f603bd74b7b4a3427`, binding the later records-only authorization commit/spec, freezing at most 16 technical paths and satisfying the mixed-fixture/reference-render/coordinate-transform/parity entry gate. The accepted recovery binds authorization `916a4d913c6fdf8340b67bcc88dcea184d67cd32` and exactly 16 technical paths. This is the completed mandate, not a new executor dispatch or Phase 4/publication authorization; see §15–16.

**Plain outcome.** A seeded mixed project visibly renders Drawing background/text/tween content and editable Stick content together on one stable stage at desktop and compact sizes.

**Problem solved.** Current renderers composite only their own layer type and Drawing authoring allocation depends on viewport/DPR.

**Traced execution path.** Canonical root/current index → common cell-owner resolver → typed Drawing/Stick render adapters → ordered render list → one fixed 1920×1080 authored stage/backing contract → scaled/letterboxed presentation → shared thumbnail/proof snapshot. No render step mutates document/history.

**Exact scope and likely path ceiling.** New renderer/resolver/stage modules, narrow extraction/adaptation from `DrawingCanvas.tsx` and `StickFigureCanvas.tsx`, `AnimationWorkspace` stage host, mixed fixture/oracle/browser proof. **Ceiling: 16 tracked technical paths.** No timeline mutation UI, tool integration, history/persistence, or renderer rewrite unrelated to compositing.

**Non-goals.** No new Drawing or Stick visual feature, no export redesign, no GPU/WebGL dependency, no asset-library persistence, no AI-generated output.

**Entry gate.** Phase 2 published; mixed fixture digests and independent reference render/pixel masks approved; coordinate transform and layer order from §§3–5 frozen; phase path extraction plan proves current render parity.

**Normal app-copy human review.** Open seeded `MIXED-REALISTIC-01`; verify background Drawing, Stick figure, upper Drawing/text, and current Drawing tween positions together at `1440×900` and `390×844`; resize without authored drift; compare type-isolated fixtures with current ordinary output.

**Measurable acceptance.** Exact layer order and stable pixel/geometry masks; text present in paused and playback render; exact Stick joint/limb coordinates after inverse transform; zero authored digest change on resize/play/render; stage ≥260×146 compact; performance/memory bounds in §9 pass for open/render portions.

**Negative tests.** Missing asset, decode failure, hidden/locked layer, blank/empty/hold/tween boundaries, extreme aspect ratio, DPR change, zero-size mount, rapid resize, one adapter throw, invalid render command, active layer above/below opposite type, text-only frame.

**Protected regressions.** REG-02–REG-10 and REG-12; accepted Drawing/Stick type-isolated snapshots remain within their frozen masks.

**Technical proof.** Independent render-list oracle; pixel/geometry comparisons; source-to-stage round trips; responsive browser screenshots; resize/DPR/memory accounting; no renderer writes; inherited drawing/stick visual tests; validated manifest.

**Stop boundary.** Mixed render only. Do not add common timeline mutations, merge tools/history/save, retire old paths, authorize Phase 4, propagate, or publish.

**Recommended effort.** GPT-6 Astra, Extra High reasoning.

### Phase 4 — Visible neutral workspace, layers, timeline, playback/onion and safe ordinary New

**Phase completion outcome.** Return the current app copy for one visible review with no layer-kind labels, one actual neutral layer/frame containing Drawing and editable Stick items, neutral cell clipboard/timeline/playback/onion and chronological history. Ordinary New creates an empty neutral document; user actions create the mixed content. Save must never discard mixed items. Test-only seed isolation is proven in both ordinary and isolated review flows. This is substantial replacement of the rejected foundation, not a suffix patch.

**Why two internal subphases are the minimum safe split.** There are two distinct proof boundaries: (4A) versioned data/read migration plus durable write/readback failure safety, and (4B) interactive state/history/render/tool/timeline cutover. The old proposal put persistence in Phase 6, but ordinary New currently has working Drawing Save/Save As. Moving New to a neutral mixed root without a safe full-document Save would either disable that existing action or discard neighbors through a legacy projection. Neither is allowed. Therefore minimal V2 repository/Save/Open moves into this correction; full collection adoption/recovery acceptance remains Phase 6. A single roughly 24-path phase cannot credibly cover both strict migration/storage faults and all the live interactive owners. The two bounded subphases share Phase 4 authority and produce **one final visible review**, not two purported product milestones. No ninth phase or helping spec exists.

**Automatic sequential coordination.** PM dispatches 4A after architecture publication and the same-copy recovery gate (§16). The 4A executor performs only its twelve paths, independently validates its checkpoint manifest, returns a technical checkpoint packet explicitly marked `Phase 4 visible acceptance: not ready`, and completely stops. PM verifies that checkpoint and transfers exclusive ownership of the **same retained worktree** to 4B under the already authorized Phase 4 correction. No Arthur invisible-app acceptance, separate feature authorization, intermediate CPA propagation, commit or publication is required between these internal subphases. 4B binds the exact 4A manifest/source hashes and works only its separate 24-path boundary. A material 4A defect returns to a stopped-owner 4A correction; concurrent ownership and quiet edits of frozen checkpoint bytes are forbidden. Final Phase 4 proof validates the complete combined set, including the conditional page path only if changed. Only after 4B's final visible packet and Arthur/PM acceptance does normal CPA propagation and separately authorized Phase 4 publication occur. These explicit internal-checkpoint rules apply only to this correction; normal numbered-phase publication separation remains.

#### Phase 4A — Neutral model, source compatibility and minimal repository foundation

**Path.** Native factory or unchanged source parser → neutral V2 map → strict document/candidate digest validation → in-memory result; explicit test Save → isolated V2 repository preflight/assets/version/readback/CAS head → verified reopen. Normal route/UI stays unchanged in this checkpoint. Repository tests use isolated test stores, never user/legacy stores.

**Exact 12 additive tracked technical paths:**

1. `src/lib/animation/unifiedAnimationContentV2.ts`
2. `src/lib/animation/unifiedAnimationContractV2.ts`
3. `src/lib/animation/unifiedAnimationMigrationV2.ts`
4. `src/lib/animation/unifiedWorkspaceFactoryV2.ts`
5. `src/lib/animation/unifiedProjectRepositoryV2.ts`
6. `src/lib/animation/unifiedProjectStorageV2.ts`
7. `scripts/fixtures/spec0006-unified/v2/phase4a-neutral-storage-cases.json`
8. `scripts/spec0006-unified/phase4aNeutralFixtureFactory.ts`
9. `scripts/spec0006-unified/phase4aNeutralOracle.ts`
10. `scripts/spec0006-unified/validatePhase4aNeutralFoundation.ts`
11. `scripts/spec0006-unified/recordPhase4aNeutralProof.ts`
12. `scripts/spec0006-unified/validatePhase4aNeutralProof.ts`

Ignored proof: `output/spec-0006/phase-4-neutral/4a/**`. Recorder/validator may orchestrate unchanged browser tooling and repository browser fault tests; no additional tracked harness file. No component, ordinary import, V1 source/fixture/test, existing source-store writer or rejected Phase 4 file may change. Independent oracle imports no new mapper/validator/factory/repository under test.

**Acceptance.** Strict native New validates without synthetic legacy provenance; all four item variants coexist in one neutral owner; no hidden typed lanes, layer-kind/default-kind/source transform. Independent tool settings, scoped IDs, per-item transforms/catalog references and whole-cell holds validate. All four legacy sources and strict V1 upgrades preserve exact required fields/assets/source bytes and deterministic identity maps; native V2 save/readback/reopen and Save As preserve all data/IDs. Repository namespace is distinct from legacy stores; only explicit saves publish verified heads. No canonical Save writes a Drawing-only or Stick-only projection.

**Proof.** At least 60 named valid/boundary and 120 invalid/tamper cases, 1,000 deterministic repeated mappings, independent same-cell and realistic-size fixtures, source-limit metadata accounting and raw store snapshots. Exercise native/V1/legacy provenance, all item variants, duplicate/scoped identities, references, blank/empty/hold/tween boundaries, malformed unions/transforms, missing/cross-project definitions, hash/candidate tampering, mutable aliases. Inject every preparation/hash/encode/asset/version/transaction/readback/head/CAS failure, concurrent revision/ID collision, and crash between staging and head publication. Last good head/source stays exact; oversize Save fails truthfully while valid source remains readable. Run unchanged V1/legacy/storage/history/AI validators, TypeScript/lint/diff/index/protected hashes and zero egress. 4A technical green is a foundation checkpoint only; no new visible neutral editing is claimed or shown as final acceptance.

#### Phase 4B — Visible neutral root, item adapters, timeline and ordinary New/Open

**Path.** Home New or canonical Open → V2 factory/repository bootstrap → one canonical root/commands/history → neutral resolver and ordered renderer → fixed stage. Existing Drawing/Stick tool adapters target an item snapshot and emit one checked item command. Neutral timeline/clipboard/playback/sound/onion share that root. Existing legacy Open compatibility remains source-safe; Phase 6 completes canonical adoption of every source route. Ordinary native New and canonical V2 Open must use the real shared root, not a proof-only project.

**Planned 24-path boundary, plus one conditionally authorized page path (maximum 25 for 4B):**

1. `src/lib/animation/unifiedTimelineReducer.ts` — neutral root, commands, history and structural reducer
2. `src/lib/animation/unifiedWorkspaceBootstrap.ts` — native/canonical V2 bootstrap, stale-safe opens
3. `src/components/workspace/AnimationWorkspace.tsx` — one visible root and common File/history wiring
4. `src/components/workspace/AnimationWorkspace.module.css`
5. `src/components/workspace/UnifiedAnimationStage.tsx`
6. `src/lib/animation/unifiedCellResolver.ts` — V2 whole-owner/item resolution, preserve V1 read behavior
7. `src/lib/animation/unifiedStageRenderer.ts` — every item command, item transforms and atomic frame publication
8. `src/lib/animation/unifiedTimelineAdapter.ts` — controlled item adapters, no whole-project legacy projection
9. `src/lib/animation/unifiedTimelinePlayback.ts`
10. `src/lib/animation/unifiedOnionResolver.ts`
11. `src/components/workspace/UnifiedAnimationTimeline.tsx`
12. `src/components/workspace/DrawingCanvas.tsx`
13. `src/components/workspace/DrawingWorkspace.tsx`
14. `src/components/workspace/stickfigure/StickFigureWorkspace.tsx`
15. `src/components/workspace/stickfigure/StickFigureCanvas.tsx`
16. `src/lib/animation/unifiedProjectSourceReader.ts`
17. `src/lib/animation/unifiedProjectCollection.ts`
18. `scripts/fixtures/spec0006-unified/v2/phase4b-neutral-ui-cases.json`
19. `scripts/spec0006-unified/phase4bNeutralOwnershipOracle.ts`
20. `scripts/spec0006-unified/validatePhase4bNeutralWorkspace.ts`
21. `scripts/spec0006-unified/phase4bNeutralBrowserProof.ts`
22. `scripts/spec0006-unified/recordPhase4bNeutralProof.ts`
23. `scripts/spec0006-unified/validatePhase4bNeutralProof.ts`
24. `scripts/runSpec0001BrowserProof.ts`

**Conditional path 25: `app/page.tsx`.** Latest user steering authorizes this path only if tracing the ordinary New/Open cutover proves an actual on-disk interface change is necessary. It is not a required edit. The architecture task freshly confirmed the disk page already uses `OpenProjectBrowser onOpenProject={...}` and both files have no diff. PM attributes the four reported red markers to an unsaved stale VS Code buffer. Do not save, overwrite or “fix” that buffer; do not manufacture a source patch to match it. Preserve the existing disk file when its interface remains compatible. This raises the combined Phase 4 maximum to 37 paths only when this condition is met; otherwise the planned combined set is 36.

Ignored proof: `output/spec-0006/phase-4-neutral/4b/**` and final `output/spec-0006/phase-4-neutral/proof-manifest.json`. `StickFigureTimelineRow.tsx` is restored to its published implementation during authorized recovery and remains outside the final correction diff; the neutral timeline uses its unchanged presentational API or renders the needed neutral controls in its own component. Preserve the OpenProjectBrowser interface; source collection/bootstrap provide its existing opaque entry/open interface. App/page remains unchanged unless conditional path 25 is proven necessary. A proven need to change an extra path requires a consolidated narrow amendment before that edit, not silent ceiling expansion.

**History and adapter safety.** Only the neutral root owns authored state/history/revision. Existing coordinators in controlled adapter mode may retain tool previews, never independent authored/history/Save roots. Item projection is lossless for the selected item's existing algorithm only; it cannot replace the whole project or neighboring item bytes. Complete mixed structural edits and per-item gestures publish atomically through one dispatcher. No “active Stick layer” mode, compatibility Drawing placeholder or reset of prior history at structural boundaries. Native/canonical V2 Save/Save As uses the 4A repository and captures complete root data; existing legacy editor Save behavior is unchanged until source adoption moves in Phase 6.

**Focused New/Open proof.** Run the full TypeScript check and production build, and retain explicit receipts for app/page.tsx → OpenProjectBrowser prop compatibility, ordinary New, combined collection and canonical/legacy Open. Verify the on-disk component usage accepts onOpenProject and no obsolete split callbacks remain. A clean disk/type/build result must not be reported as fixing an unsaved editor buffer. No layer-kind labels, seeded demo artwork in normal routes, or AI/engine code changes are allowed.

**4B controlled-hydration entry gate.** Trace and freeze the DrawingCanvas hydration/commit seam before coding: current handles expose capture/clear/mark-committed methods while DrawingWorkspace directly restores child canvas pixels. The new controlled mode must cancel pending sessions, validate captured generation/owner/item identity, hydrate only the targeted raster/text item and emit no command/history during hydration. Its legacy history/playback/Save ownership is suppressed; ordinary legacy mode stays unchanged. The two Drawing files are already in the 24-path boundary. Proof must cover Save As → Undo → Save and verify the old project head remains untouched.

**Exact visible Phase 4 acceptance.** On the ordinary review root with empty storage, New → Untitled Project → one empty neutral Layer 1, no starter rig/artwork/library/example. Using existing Drawing and Stick controls, create raster strokes/shape/text and an editable figure in that **same Layer 1 and same owner frame**. Place a drawn sword/fireball manually; no new motion/attachment capability. Edit pixels and joints independently. Copy/paste that complete mixed frame to another neutral layer; add/blank/hold/resize/remove, edit held owners, scrub, onion and full `0…47→0` playback all preserve neutral ownership and ordered content. No kind labels anywhere in visible or accessible layer UI. Undo/Redo interleaves Drawing, Stick and timeline actions exactly. Save/Save As/reload/Open the native mixed V2 project with matching data and no source write. Bitmap symbol-definition/instance persistence is contract/repository-tested in 4A; the complete symbol-creation/catalog UI is Phase 5, not falsely claimed here.

**Proof/negatives/regressions.** Independent 10,000 fixed-seed valid/invalid structural mutations plus 1,000 order/namespace variants; every expected accept/reject passes. Same-cell masks for raster below/above rig and editable text, mixed ghost composition, independent owners, cross-neutral-layer paste, tweened raster plus held rig/text. Tests cover wrong item discriminator, hidden typed lanes, namespace collision, stale gesture/base/project, locked/hidden targets, pointer cancel/lost capture, render/decode/adapter failure, empty/blank/tween/unequal lengths, occupied resize, last-layer deletion, rapid play/pause/scrub, Save during newer edits/Undo/Open, storage faults and dirty-state truth. Both viewports/DPRs, §9 stage/performance/memory limits, full history digests and source-store snapshots. Existing functional Drawing tools and Stick manual gestures must remain operational through controlled adapters; unsupported/disabled Creator and AI controls stay unchanged. New shared catalog UI and polish belong to Phase 5.

Ordinary New/Open/store/build-import checks prove no MIXED fixture, DRAWING + STICK words, colored blocks, demo rig, foreground/background labels or instrumentation is automatically included. Dedicated seeded fixtures live only in isolated proof storage/source copies and never establish ordinary New success. Run all applicable REG-01–12/inherited suites, production build, type/lint/diff/index checks, network ledger and independent final manifest revalidation over both 4A and 4B. Keep exactly one visible review app copy, on the resolved existing review port when safe. Final packet states what is visually proven, symbol/legacy-adoption limits, exact combined dirty allowlist and manifest hash. Stop before Phase 5, CPA, Git publication or cleanup.

### Phase 5 — Complete current tools, shared Library/Assets, selection and panels

**Outcome/path.** Complete the current Drawing/Stick capability matrix and shared layout over the accepted neutral Phase 4 root. Selection/property/catalog actions → item adapter → same command/history → shared stage/repository. The user creates a bitmap sword symbol, places two independent instances in the same mixed cell, edits one and saves/reopens both with reusable definitions intact.

**Scope/ceiling: 20 tracked technical paths.** Existing unified workspace/canvas/toolbar/right-panel seams, bounded shared selection/catalog controllers under `src/lib/animation/`, current Creator navigation and UI, V2 library/capability fixtures and proof. Exact paths frozen at entry. Phase 4 runtime and repository may receive only bounded integration changes preserving accepted tests; no second history/save authority.

**Entry.** Corrected Phase 4 accepted/published/integrated with both checkpoint/final manifests; exact action-by-action current capabilities, catalog serialization and selection/cancellation matrix frozen. No new Stick color/head/shape/rig feature or vector drawing engine. Creator Save remains disabled; Back preserves the same project/history/view. No advanced linked symbol editing, automatic sword binding or motion following.

**Acceptance/proof.** Full §§1/6/7 layout, current tools and durable bitmap library/instance flows at desktop/compact. Independently verify each working Drawing tool and current Stick action, topmost eligible item/subtarget hit tests, namespace collision, transparent/locked/hidden content, asset placement/duplicate/delete/reference integrity, cancellation/stale cases and exact interleaved Undo/Redo. Deleting a referenced definition fails safely; placeholders remain inert and never become data. Save/Save As/reload/Open real catalogs and placed instances. AI eligible legacy behavior/latch/disabled exits pass with deterministic mocks and unchanged AI code. Both profiles, accessible tab/toolbar names/order/focus and zero test seeds/external requests. Validated manifest and all applicable regressions. Stop before broader recovery/source-adoption completion or new capabilities.

### Phase 6 — Complete canonical legacy adoption, recovery, naming and persistence proof

**Outcome/path.** Finish all supported source Open paths through read-only V2 migration and the common editor, safe first-save adoption, provenance dedupe and exhaustive persistence/recovery/performance acceptance. This completes and hardens the 4A/4B native mixed Save foundation rather than introducing a second repository/history.

**Scope/ceiling: 20 tracked technical paths.** Unified migration/repository/storage/bootstrap/collection/source-reader, File/title/error UI and bounded removal of source compatibility write authority, independent storage/migration/browser proof. Existing Drawing PNG/WAV/CAS mechanics may be reused without changing source formats. Exact list frozen before editing.

**Entry.** Phase 5 accepted/published/integrated; complete catalog/item schema and normal tools proven. Native V2 mixed Save remains protected. Freeze source provenance/dedupe rules, source-limit metadata accounting, concurrency/head retention and every storage fault boundary.

**Acceptance/proof.** Full §4 and §7 native, Drawing V1/V2, Stick V1/V2 and unified V1 Open/adoption/Save/Save As/reload cases. Every source field/asset digest preserved, original stores byte-identical, one canonical card per exact provenance pair, no title-based identity and no legacy-only normal writes. Faults at encode/hash/decode/quota/asset/version/abort/readback/CAS/ID/stale instance/revision/generation/Undo/Open/crash boundaries retain complete root/history/head/source and truthful dirty state. Full interleaved history, large raster/audio/catalog retention and §9 Save/Open latency/memory proof in both profiles. REG-01–12, inherited SPEC-0002/Stick/storage/history/AI tests, zero egress, independently validated manifest. Recovery is last-good-head/safe retry, not autosave. Stop before retirement or whole-spec completion claim.

### Phase 7 — Retire duplicate ownership and complete full acceptance

**Outcome/path.** Every ordinary route and user action reaches the sole V2 root/dispatcher/resolver/timeline/tools/history/repository. Legacy parsers remain read-only leaves; retired coordinators cannot become alternate normal Save/edit paths.

**Scope/ceiling: 18 tracked paths including deletions.** Exact unused-owner import/mount/write removal list plus permanent tester/finalizer/full-proof sources. Do not delete shared algorithms, read parsers, source data, historical fixtures/manifests or protected AI contracts. No unrelated cleanup.

**Entry.** Phase 6 accepted/published, preceding manifests preserved; import/route/write inventory proves removals safe. Freeze the complete ordinary capability matrix.

**Acceptance/proof/human review.** Repeat all §7 flows in the ordinary root, including same-layer/same-cell drawn and symbol swords/fireballs, all existing tools/panels/catalogs, full mixed loop/onion/history and storage failures. All REG-01–12 and §9 performance/memory pass; zero critical/serious accessibility findings, keyboard/visible focus, 200% zoom and reduced-motion checks. Instrument zero legacy writes, second coordinator/history authority, seeded product/debug surface or external/provider requests. Independently revalidate every accepted historical/checkpoint/final manifest against its own bound commit/source set. Arthur's visible acceptance is mandatory; a green old typed-layer fixture is insufficient.

**Stop.** Return Implementation Review Packet, empty index, one review copy preserved. CPA acceptance/propagation, separate publication and D-0054 cleanup follow. No future SPEC-0007/0008, deployment or Git action by executor.

## 13. Completion gate before future SPEC-0007/0008

Account for all seven numbered phases: preserve published Phases 1–3, record the former Phase 4 rejection, and separately execute/accept/propagate/publish corrected Phases 4–7, including both internal Phase 4 checkpoint identities and one final visible acceptance. The final ordinary app must pass §§3–10: true same-layer/same-cell mixed items, one timeline/clock/onion, current tools/panels/catalogs, exact global Undo/Redo and complete Save/Save As/Open/recovery. All supported sources remain readable and unmodified; no claim of reconstructed legacy symbols or autosave. Record exact implementation/control-plane paths and every manifest against its proper base.

Arthur accepts the full ordinary result. Separate publication verifies exact final local main/origin/live remote equality and clean 0/0 synchronization. Authorized D-0054 cleanup preserves proof then closes the exact review server/port and removes the obsolete executor worktree/local branch. No material data-loss/ownership/safety/accessibility/performance/regression blocker remains. State physical-phone/native-GPU limitations honestly. Future manual expansion belongs to SPEC-0007 only after this gate; AI/video/tracking belongs to later SPEC-0008. Neither is created or implemented here.

## 14. Whole-spec ownership map and protected boundaries

| System | Intended V2 change | Boundary |
| --- | --- | --- |
| `src/lib/animation/**` | Neutral model/migration, commands/history/render/timeline/catalog/repository | V1 semantics remain readable; no typed layers in V2. |
| AnimationWorkspace/New/Open | Real neutral native/canonical paths in Phase 4B; all legacy adoption by Phase 6 | No interim lossy Save or disabled inherited New Save. |
| Drawing Canvas/workspace/tools/panels | Existing raster/text algorithms become controlled item adapters | No vector reconstruction, lost pixels/text/tween/audio or second final history. |
| Stick Canvas/workspace/panels/Creator | Existing structured editing becomes controlled item adapters | No new heads/colors/rig tools, enabled Creator Save or motion engine. |
| Library/Assets | Project-owned current bitmap definitions, instances/catalog metadata | No sample data, advanced symbol editor or fabricated legacy associations. |
| Drawing/Stick source stores | Read-only migration after adoption cutover | Never delete/rewrite source records or historical schema. |
| `src/lib/ai/**`, `src/lib/openai/**`, `app/api/**`, prompts/providers/motion | Protected bytes and existing behavior | No edits, paid/network requests or new AI/video/tracking work. |
| Proof sources under scripts/ignored output | Independent neutral migration/storage/UI/manifest evidence | Never enter ordinary app/build/public assets/starter projects. |

## 15. Implementation and verification records

**Historical snapshot notice (D-0062, 2026-09-11):** The records below retain their original accepted scope, proof identities and then-current publication/server statements. Phase 3 later published in GIT-054 `e11f6c453f13772ee9bd4b172a17bc68e1de65b9`. Old next-phase authorization/phase-number references are superseded by §§12/16 above/below; no historical server identity is current cleanup authority. No historical manifest is rewritten.

### Phase 1 — published and integrated

Phase 1's exact 11 technical paths plus reviewed records/tree are published in GIT-051 `804ff39dc73c88d4799570cce2ef18987745a0be`, parent `3b784cc6a68ff6f10fa390d96b81376b46e54b44`, message `Implement SPEC-0006 Phase 1 unified contract`, exactly 27 paths. The accepted manifest remains `output/spec-0006/phase-1/proof-manifest.json`, 9,257 bytes at SHA-256 `83614635c02f22d81205c441c46de3bff3a75f1c948661a1670a36eca75dbb29`. The migration suite passed 56 valid, 124 invalid/tamper, 1,000 repeated mappings, 3,516 assertions, all four source kinds, an independent oracle, and zero writes. Frozen library hashes carried into Phase 2 are `249cfd4640b129927fa7206cf3c8b17bb0c98f4ecf46af0adb2d33125fc9168d` for `unifiedAnimationContract.ts` and `093ccf4127bfe66adbf3ae6819c5118389e7e3a70efa53469eb9551065e6c28e` for `unifiedAnimationMigration.ts`.

### Phase 2 — Verified, published, and integrated

The accepted corrected technical boundary from GIT-051 base `804ff39dc73c88d4799570cce2ef18987745a0be`, published in GIT-052 `d2096109900cc50a0a4dae2f603bd74b7b4a3427`, is exactly:

- `app/page.tsx`
- `src/components/open-project/OpenProjectBrowser.tsx`
- `src/components/workspace/AnimationWorkspace.tsx`
- `src/components/workspace/AnimationWorkspace.module.css`
- `src/lib/animation/unifiedProjectCollection.ts`
- `src/lib/animation/unifiedProjectSourceReader.ts`
- `src/lib/animation/unifiedWorkspaceBootstrap.ts`
- `src/components/workspace/DrawingWorkspace.tsx`
- `src/lib/drawingProjectStorage.ts`
- `scripts/fixtures/spec0006-unified/v1/phase2-cases.json`
- `scripts/spec0006-unified/phase2FixtureFactory.ts`
- `scripts/spec0006-unified/validatePhase2Navigation.ts`
- `scripts/spec0006-unified/phase2BrowserProof.ts`
- `scripts/spec0006-unified/recordPhase2Proof.ts`
- `scripts/spec0006-unified/validatePhase2Proof.ts`

The accepted manifest is `output/spec-0006/phase-2/proof-manifest.json`, exactly 16,649 bytes at SHA-256 `ebfeb699c0d9bcedd5b6b7c90d5cb4b71a3fe3ea89326a2820b86882e2c27cb7`. CPA independently replayed the unchanged manifest before control-plane edits: PASS, 15 source bindings, 19 receipts, 38 artifacts, 18 negative mutation cases, exact scope, and empty index. TypeScript, focused lint, unchanged full-lint baseline with zero new/changed-line findings, Drawing V1/V2 and Stick contract/history/storage/timeline/AI validators, production compile/generate, and diff checks pass.

The bound browser result records 40 operations and 13 screenshots across desktop/compact Home/New/collection and Drawing V1/V2/Stick V1/V2 opens. It proves the corrected inherited presentation, invalid/missing/stale/storage failure behavior, zero source writes, zero real API/external requests, zero console/page errors, and no review-only product surface. Arthur accepted this corrected visible result. After GIT-052 publication, the obsolete review process was stopped, port `56362` was closed, and the executor worktree was removed from the registered worktree inventory under D-0054.

Phase 2 did not merge the compatibility editors. Its recorded no-mixed-compositor boundary is historical; the accepted Phase 3 rendering-only result is recorded below. One timeline/tools/history/canonical Save and unified persistence remain later unauthorized work; Phase 6 owns the final repository/write path.

### Phase 3 — accepted and Verified; unpublished/not integrated

D-0061 records Arthur's visible acceptance and PM acceptance/ownership transfer after the recovered executor stopped. Runtime base is `d2096109900cc50a0a4dae2f603bd74b7b4a3427`; authorization and detached HEAD are `916a4d913c6fdf8340b67bcc88dcea184d67cd32`. This exact 16-path technical boundary remains byte-frozen:

- `scripts/fixtures/spec0006-unified/v1/phase3-render-cases.json`
- `scripts/spec0006-unified/phase3BrowserProof.ts`
- `scripts/spec0006-unified/phase3FixtureFactory.ts`
- `scripts/spec0006-unified/phase3RenderOracle.ts`
- `scripts/spec0006-unified/recordPhase3Proof.ts`
- `scripts/spec0006-unified/validatePhase3Proof.ts`
- `src/components/workspace/AnimationWorkspace.module.css`
- `src/components/workspace/AnimationWorkspace.tsx`
- `src/components/workspace/UnifiedAnimationStage.tsx`
- `src/components/workspace/stickfigure/StickFigureCanvas.tsx`
- `src/components/workspace/stickfigure/StickFigureWorkspace.tsx`
- `src/lib/animation/unifiedCellResolver.ts`
- `src/lib/animation/unifiedDrawingRenderAdapter.ts`
- `src/lib/animation/unifiedStageGeometry.ts`
- `src/lib/animation/unifiedStageRenderer.ts`
- `src/lib/animation/unifiedStickRenderAdapter.ts`

The accepted technical manifest is `output/spec-0006/phase-3/proof-manifest.json`, exactly 22,897 bytes at SHA-256 `207aea2a7d664e49d28dd6b8c4704e50da9fae8d5197d9164ccbac871db4fcc0`: 16 source bindings, 20 receipts, and 60 artifacts. CPA reran the unchanged validator before propagation: PASS, 3,725 assertions and 18 negative manifest cases. All accepted technical and proof bytes remain unchanged.

Every visible element in `MIXED-REALISTIC-01` is manually seeded review content, not AI output. Its four independently owned Stick keyframes at indices 0/12/24/36 have identical neutral geometry and 44 holds; only the existing Drawing position tween moves. No AI model, prompt, generation, pose/motion engine, video, tracking/reconstruction, provider, or API behavior changed.

The original patch history, including the final neutral fixture, was replayed after loss of the former uncommitted review worktree. Recovered fixture source SHA-256 is `2998338cdf8c3ec5e912d541c63ff224858667b45cdbc5ff9737d9ada872708f`; document SHA-256 is `7fecc265857a0c99a552cb72fee6f714fc0a1b286f40d2920b2e277104186d1d`; neutral geometry SHA-256 is `9885a9f46b4d34f2da833b2332555275904656defdac0b1f539023cd6c7f4987`. The regenerated proof is fresh, not byte-identical to erased historical proof.

The accepted proof passed 9,145 contract assertions; desktop 1440×900 DPR 1 and compact 390×844 DPR 2 rendering; eight mixed and four type-isolated pixel comparisons per profile with zero differences; five measured full 0…47→0 playback loops per profile after warmup; joint drag, held-owner editing, independent-owner preservation and exact Undo/Redo; resize/DPR/zero-size/failure recovery; and the stage performance/memory bounds. Compact stage is 352×198 with no page overflow. Production compile/generate, TypeScript, focused lint, all 16 inherited validators, and the inherited 40-operation/13-screenshot New/Open/Drawing/Stick browser suite passed. Full lint remains the exact inherited 5-error/72-warning baseline, with zero new findings. Real API/external requests, source-store writes, and render-triggered document/history writes were zero.

Measured open medians were 191 ms desktop and 199 ms compact; worst selection/render p95 was 13.9 ms and 10.4 ms respectively. The minimum timely playback fraction was 97.9167%, with complete ordered traversal and no skipped authored index in every measured loop. Peak renderer-owned decoded/backing allocation was 145,419,408 bytes against the 290,838,816-byte peak limit; idle stayed within 153,713,808 bytes. These are the bound recovery run measurements, not newly rerun browser benchmarks during CPA.

The shared front/work backing, sequential hash-checked asset decode, bounded cache, generation guard, and complete-frame publication preserve typed order and failure safety. Manual pointer transforms use the fixed authored stage while the existing Stick command owner retains history. The render callback bypasses only the old viewport projection when the mixed authored surface is active; ordinary Stick projection and all AI/motion source modules are unchanged. All protected runtime/test bytes match authorization-base bytes. Of the original 157 protected bindings, 156 files remain byte-identical; the original AI overview is resolved at the authorization commit because CPA updates only its current lifecycle paragraph.

Physical-phone performance and native/GPU memory remain unproven; the compact result is a desktop Chrome browser profile. Existing compact title clipping remains. No unified timeline/playback/onion owner (Phase 4), tools/panels integration (Phase 5), shared history/canonical Save/Open/recovery (Phase 6), or legacy retirement (Phase 7) is implemented or authorized by this acceptance. The accepted full-loop evidence exercises composition through the existing Stick clock; it does not complete Phase 4. No natural-motion or AI-output quality claim is made.

CPA closeout is preserved under `output/spec-0006/phase-3/cpa/`: `takeover.json`, `ownership-transfer.json`, `pre-propagation-validation.log`, and `closeout-manifest.json`. The strict executor validator was run before records changed. After propagation, independently revalidate all accepted source/receipt/artifact hashes and sizes, the 157 original protected bindings, and all five frozen bindings. Resolve the original spec and original `docs/AI_SYSTEM.md` snapshot at the bound authorization commit; the other 156 protected files remain byte-identical, and no protected runtime/test byte changes. Do not rewrite the accepted manifest or claim its strict live 16-dirty-path/current-spec CLI passes after CPA records are added. Its historical pending-Arthur/executor-ownership/publication fields describe the stopped executor snapshot; D-0061 records subsequent acceptance and sequential CPA ownership.

CPA changed exactly these 14 canonical records/tree paths; no accepted implementation, fixture, technical test, original proof, `AGENTS.md`, package, config, or other worktree byte changed:

- `docs/00_MASTER_PROJECT.md`
- `docs/AI_SYSTEM.md`
- `docs/CURRENT_STATE.md`
- `docs/DECISIONS.md`
- `docs/PROJECT_MANAGER_CONTEXT.md`
- `docs/ROADMAP.md`
- `docs/SESSION_HANDOFF.md`
- `docs/TODO.md`
- `docs/architecture.md`
- `docs/changelog.md`
- `docs/specs/0006-unified-animation-workspace.md`
- `docs/specs/README.md`
- `docs/testing_workflow.md`
- `project/project_structure.txt`

The review server at `http://127.0.0.1:56463/` remains preserved (listener PID 331, ignored `output/spec-0006/phase-3/review-app` cwd). Open Project → MIXED-REALISTIC-01 shows the accepted neutral review fixture. No product route, seed, review button, or debug control is added. The executor's optional CDP inspection was declined and skipped; no further approval-gated browser call was required for CPA evidence validation. Canonical main/local origin remain `916a4d913c6fdf8340b67bcc88dcea184d67cd32`, clean at 0/0; no live-remote refresh or Git publication occurred.

## 16. Current handoff, same-copy exception and one visible Phase 4 review

Fresh local Git reconciles stale Phase 3 publication-pending records: GIT-054 `e11f6c453f13772ee9bd4b172a17bc68e1de65b9` contains the published accepted Phase 3 result; local HEAD/main/origin match, index empty. Its D-0061/§15 proof remains historical and accepted. The former Phase 4 is rejected/unpublished/non-reusable and unchanged by this docs-only architecture task. Remote synchronization is not newly verified here.

The stopped executor's worktree is `/Users/arthurcarlin/.codex/worktrees/6e90/stick-animation-app`, detached at e11f6c, with 18 pre-existing rejected technical paths and the immutable manifest hash in §2.6. PM explicitly assigned this architecture owner there and subsequently instructed correction/visible review in the **same app copy**. This narrow same-copy reuse supersedes D-0054's remove-before-fresh-executor step for this Phase 4 replacement only; it does not accept/reuse rejected bytes, permit two servers, bypass backup, authorize Git publication or allow concurrent owners.

Before implementation, after this architecture owner completely stops, PM coordinates separately authorized records publication of only the reviewed docs. Preserve those docs with exact hashes and bind the actual correction publication SHA; do not stage the rejected technical paths. The correction executor's canonical starting basis must contain this published architecture and published Phases 1–3. No invented activation SHA, dirty-spec-only dispatch or new implementation permission request to Arthur is needed. If publication is not authorized, PM obtains that separate authority; implementation authorization does not imply Git permission.

An authorized recovery/ownership step must resolve exact worktree/ref/process/cwd/port, hash and inventory all unique rejected tracked/untracked bytes and required ignored proof into a verified recovery backup, and preserve this architecture record/publication identity. Only after verifying that backup may the identified rejected technical paths be replaced with published canonical bytes (untracked rejected additions removed from the active implementation set). Keep the recovery material immutable and outside the correction source. Stop the exact old review server and verify its port closed before one replacement server starts; prefer its resolved port so Arthur returns to the same app address. No unrelated process/worktree/ref may change, and canonical main/active PM/recovery material stay protected. This architecture task performs none of those actions. Existing process IDs in old packets are historical, not fresh cleanup authority.

Then PM dispatches **4A (12 additive paths)** in Plan mode for boot and source/storage tracing, leaves Plan mode under existing authority, and completes its technical checkpoint. Executor stops; PM verifies its exact manifest/hash/empty index/allowlist and transfers the retained worktree exclusively to **4B (24 paths)**. 4B inherits frozen 4A bytes and runs the visible ordinary New/same-cell/timeline/Save correction. Both are internal subphases of the same Phase 4 correction, with no intermediate Arthur review, CPA propagation, Git publication or competing app copy. Final combined ceiling is 37 distinct technical paths including the conditional page path. Any checkpoint defect follows a separately scoped correction with sequential ownership and renewed hashes.

**Final Phase 4 human checklist:** ordinary New has neutral Layer 1 and no artwork/demo data; manually add Drawing and editable Stick content in the same frame; no layer-kind labels in UI/accessibility; edit each independently, copy/paste the whole cell to another neutral layer, create/edit holds/independent owners, scrub/onion/full playback loop; Undo/Redo exact mixed action order; Save/Save As/reload/Open native mixed V2 intact; source legacy projects still work; no seed/instrumentation in ordinary New/Open/build/stores. Complete shared symbol-creation/library/panel acceptance is Phase 5, and exhaustive all-source adoption/recovery is Phase 6; those are explicit remaining work, not Phase 4 claims.

The architecture owner now returns a PM Review Packet and completely stops. No runtime/proof/server/Git change, implementation acceptance, publication or cleanup is claimed. After 4B visible acceptance, CPA and later separately authorized publication occur as usual; after clean integration/synchronization, D-0054's normal final cleanup applies. Future phases/specs are not started here.

## 17. Corrected Phase 4 accepted result — D-0063 (2026-09-12)

Arthur completed the ordinary app-copy review and explicitly accepted the corrected Phase 4 result. The stopped Spec Executor used the published GIT-055 base `e956840001d18757af8f2de5361640ba70d44d68` in `/Users/arthurcarlin/.codex/worktrees/1550/stick-animation-app`. Its final immutable technical manifest is `output/spec-0006/phase-4-neutral/proof-manifest.json`, SHA-256 `9d2d18871981db2e499c689723730ada4690dd5cb94ab620a038e45557f298de`, status PASS, exact 26-path dirty allowlist, and empty index.

The accepted result provides one ordinary neutral Animation Workspace root for native New, neutral layers without Drawing/Stick kind labels, ordered Drawing and editable structured-rig items in the same layer/frame, shared neutral timeline/history/playback/onion ownership, lossless V2 project Save/Save As/Open, and deterministic collection/bootstrap adoption. Stick Add Limb and Select/Move Joint use inverse SVG screen transforms, retain pointer ownership against the pan overlay, show the live endpoint at the cursor, commit once on release, and cancel without partial edits.

Technical verification passed Phase 4A foundation with 364 assertions, Phase 4B workspace with six flows/four tabs/eight tools, the 16-flow browser proof, the 12-binding Phase 4A proof validator, the 26-binding Phase 4B proof validator, focused lint with zero errors and seven inherited warnings, production HTTP 200, browser console zero errors/warnings, `git diff --check`, and empty-index proof. Arthur additionally accepted the visible review at `http://127.0.0.1:56544/?pm_review=pointer_correction` after verifying exact pointer tracking and preserved mixed content.

This acceptance does not add or improve AI, motion generation, providers, prompts, video/tracking, cloud/social Share, export, advanced symbol/library creation, exhaustive legacy recovery, or duplicate-owner retirement. Phase 5 remains the next product phase only after GIT-056 publishes this exact accepted implementation and reviewed records, canonical `main` is clean/synchronized, and the accepted review copy is safely cleaned up under D-0054.
