# SPEC-0007 — Drawing-Only Manual Editor Completion and AI-Ready Tools

Status: **Approved and active; Phases 1–2 closed; Phase 3 ready for separate authorization but Unauthorized/not started; Phases 4–5 Unauthorized**
Owner: Arthur
Task role: Corrected phased implementation contract; this Spec Architect task changes no product runtime
Created: 2026-09-14
Last updated: 2026-09-18
Decision links: [D-0071–D-0078](../DECISIONS.md), [D-0054](../DECISIONS.md), [D-0069–D-0070](../DECISIONS.md)
TODO IDs: `PLAN-007`, `SPEC-007`, `MANUAL-001`–`MANUAL-005`
Corrected planning base: clean detached canonical-main SHA `be41db9e06126ae4e15c162962c6b856cb97660e`; index empty before edits
Current runtime: canonical `main` includes published/closed Phase 2 at GIT-063 `fb10e6239fd4b1edf319b3137a883e1219645ef3`; D-0078 records synchronization, proof preservation and D-0054 cleanup

## 1. Exact outcome and permanent laws

Diamond Animator's ordinary editor becomes drawing-only. By the end of SPEC-0007:

- there is no active structured stick-figure/rig editing system;
- there is no user-facing **Stick Figure Tools**, **Rig Tools**, **Stick Figure Creator**, **Creator**, or **Rig Builder** workspace;
- new ordinary authored content is raster drawing, text, supported still assets, and drawing or mixed drawing symbols;
- old structured rig content and rig-backed symbols open through a safe, non-destructive compatibility migration into ordinary visible/editable drawing content or drawing symbols; and
- any retained structured-rig parser/renderer is a read-only historical adapter reachable only while validating or converting old projects. It cannot create, edit, save, expose, or advertise an active rig model.

The visible product term is exactly **Draw Rig**. Draw Rig is a toggle in **Properties** for the active freehand drawing tool. It is not a joint, bone, limb, graph, topology, constraint, or structured-rig tool. It creates only ordinary raster drawing content that Eraser, Knife, Select, Lasso, Undo/Redo, Save/Open, and future shared drawing commands treat exactly like other paint.

Three permanent laws govern all phases.

### 1.1 No-silent-deletion law

> No non-delete action may remove, blank, replace with stale/partial data, or make unreachable any authored pixel or authored stage item.

Deletion is permitted only through the closed, runtime-used destructive-command registry. Each entry names the visible control, exact target, referenced-item rule, confirmation rule, history behavior, and persistence projection. Phase 1 must cover the currently reachable destructive surfaces proven in the live UI/code:

1. **Eraser**, limited to pixels under its sampled eraser mask;
2. **Knife** cut/removal, limited to the explicitly intersected raster/vector selection result;
3. keyboard/button **Delete selection**, including selected raster/text/symbol-instance content only;
4. timeline **Remove Frame** / semantic Delete frame, limited to the chosen frame and permitted only while the timeline's existing minimum-frame invariant is satisfied;
5. timeline **Delete Layer**, limited to the active/context-targeted layer, permitted only when more than one layer exists, and retaining the current explicit confirmation;
6. Properties **Clear Canvas**, limited to the current canvas/owner cell and retaining the current explicit confirmation;
7. Library **Delete Instance**, limited to the selected symbol instance;
8. Library **Delete definition**, permitted only for an unreferenced symbol definition; a referenced definition is rejected with the current instruction to delete its instances first;
9. timeline **Remove Attached Sound**, limited to the selected frame's sound attachment and not the unrelated asset bytes.

The registry is extended only by an owning approved phase. Phase 4 may add one explicit **Delete unreferenced asset/catalog entry** operation only if the entry has zero live references; referenced entries must be rejected with an actionable message. A future AI phase may expose a destructive command only when the validated command is already in this manual registry and the user's request explicitly asks for that deletion. No current asset-catalog delete control was found at the corrected planning base, so Phase 1 must not invent one. Every destructive control commits through global history and is Undo/Redo-safe. Confirmation is mandatory where the current control already confirms (Clear Canvas and Delete Layer); changing confirmation policy for other destructive controls is outside the owning phase unless a real acceptance defect requires it.

Tool, Properties-tab, frame, layer, selection, playback, modal, project, or viewport changes; pointer leave/cancel/lost capture; drawing; preview replacement; pointer release; smoothing; Save/Open; recovery; stale async completion; and memory/performance fallback are non-delete actions. They may commit the requested addition/transform, cancel with no authored change, or fail visibly while keeping the last good document. They may never publish a blank, stale, partial, or older snapshot over newer content.

Painting, Fill, and an explicit transform may intentionally replace or change pixels inside their validated target region; that is a targeted mutation, not deletion. They may not blank, drop, or change unrelated pixels/items. A broad replacement such as Clear Canvas is destructive regardless of implementation name and is legal only through its explicit registered/confirmed control.

### 1.2 Same-paint maximum-coverage law

For raster paint, the canonical same-paint key is:

```text
{freehand variant, normalized six-digit sRGB color, opacity}
```

Opacity is `1 - transparency / 100`, quantized once to an exact 8-bit coverage ceiling. Size, smoothing, pointer speed, Draw Rig on/off, Glow brightness/radius, and gesture identity change the coverage mask but do not change the same-paint key.

Within one gesture and across later repeated or offset gestures with the same key, each pixel uses:

```text
coverageAfter = max(coverageBeforeForCurrentSamePaintRun, incomingCoverage)
```

The selected paint color is composited over the run's collapsed base exactly once at that maximum coverage. Repeated passes, tight curves, circles, self-crossings, joins, caps, Pencil/Sketch texture marks, Pixelate cells, and Glow core/halo sampling therefore cannot accumulate darker alpha or leave dark beads. At 10% opacity, same-paint coverage stays at exactly 10% (8-bit ceiling 26), never 19%, 27%, or an additive sequence.

Different paint means a different variant, color, or opacity. It may intentionally cover/change the visible pixel. Before the new key begins, the prior visible result becomes the collapsed base for that pixel; the new top same-paint run starts once. This makes alternating colors deterministic without pretending a flat RGBA pixel can infer full paint history.

Phase 1 must persist a bounded, versioned raster-paint coverage companion sufficient to preserve this rule across Save/Open. It is internal raster provenance, not a user-visible vector stroke, rig, joint, or hidden editable object. A legacy raster with no companion is a flattened base with no active same-paint run. Eraser, Knife, selection/lasso move/copy/delete, frame copy/paste, Undo/Redo, Save/Open, and recovery move or clear the companion in exact lockstep with its pixels. Missing/corrupt companion data fails validation or falls back only to the last good version; it never blanks the raster.

### 1.3 Shared capability law

Every project/document mutation that may later be available to AI must first be available manually and route through the same UI-independent validated command capability, canonical V2 coordinator, global history, and repository. A fully specified command plus base digest produces one deterministic result or one deterministic no-op/error. Manual UI code and a future AI caller cannot have separate mutation implementations.

SPEC-0007 adds no AI caller, model, prompt, provider, API, motion generator, video/tracking system, external request, or paid operation. `future-AI eligibility` is registry metadata only.

## 2. Current evidence and real execution path

### 2.1 Canonical runtime at `be41db9…`

The ordinary path is:

```text
app/page.tsx
  → AnimationWorkspace
  → DrawingWorkspace (sole canonical V2 state/history/repository owner)
  → DrawingCanvas (large transient input/raster/text/rig/symbol adapter)
  → onAuthoringActionCommitted / global history
  → V2 snapshot → repository → content-addressed storage/version/head
```

Fresh code tracing establishes:

- `DrawingRightPanel.tsx` exposes freehand variants **Brush, Pixelate, Sketch, Pencil, Glow** and the active **Stick Figure Tools** tab.
- `DrawingCanvas.tsx` owns freehand samples, smoothing, repeated preview restoration, final raster drawing, Pencil/Sketch texture, Pixelate stamping, Glow blur/additive composition, Shape, selection/lasso, Eraser, Knife, symbol/asset interactions, and active structured-rig overlay gestures.
- ordinary smoothing currently special-cases Pencil to at least 10 even when the UI says zero; Sketch/Pixelate scale the chosen value; the buffered moving-average path changes a mutable tail and replays raster preview regions.
- current Glow uses `lighter` composition and blur; current Pencil/Sketch draw multiple alpha-bearing paths. These are direct additive/darkening risks.
- `endCanvasStroke` restores/replays buffered content for final commit, while `cancelCanvasStroke` can also render and publish a stroke. `DrawingWorkspace` independently queues pointer-up/pointer-cancel frame snapshots. Multiple transient and snapshot authorities therefore overlap.
- the current active rig path is a `stick-rig/v1` item containing `structureGraph.joints`, `limbs`, and `activeJointId`; `DrawingCanvas` can add limbs or move joints and `DrawingWorkspace` mounts the embedded Creator modal.
- `AnimationWorkspace.tsx` still projects structured rig items into the compatibility adapter; `unifiedAnimationContractV2.ts` validates rig joint/limb references; symbol contracts can retain structured rig payloads.
- the V2 repository/storage path owns content-addressed typed assets, immutable versions, verified hydration/readback, compare-and-swap heads, last-good recovery, 128 MiB/project, 512 MiB/collection, 64-project, and 256 MiB single-raster ceilings.

This is code evidence, not a claim that the corrected behavior already works.

### 2.2 Rejected dirty Phase 1 result

The prior executor result in `/Users/arthurcarlin/.codex/worktrees/3cd3/stick-animation-app` is **Rejected; unpublished; unaccepted; non-reusable**. It is detached at base/HEAD `be41db9e06126ae4e15c162962c6b856cb97660e`, has an empty index, and has exactly ten dirty tracked paths:

- `scripts/fixtures/spec0007-manual/phase-1/raster-command-cases.json`
- `scripts/spec0007-manual/phase-1/phase1BrowserProof.ts`
- `scripts/spec0007-manual/phase-1/phase1PerformanceProof.ts`
- `scripts/spec0007-manual/phase-1/phase1PersistenceProof.ts`
- `scripts/spec0007-manual/phase-1/recordPhase1Proof.ts`
- `scripts/spec0007-manual/phase-1/validatePhase1Proof.ts`
- `src/components/workspace/DrawingCanvas.tsx`
- `src/lib/animation/editorCommands/drawingRasterCommand.ts`
- `src/lib/animation/unifiedProjectRepositoryV2.ts`
- `src/lib/animation/unifiedProjectStorageV2.ts`

Its ignored 39,787-byte self-reported PASS manifest has SHA-256 `26acbf3e708b85e2269f546c2094e90c4d234d7a59b3568d07b0452623908ea3`, six recorded command receipts, ten source bindings, `humanAcceptance: pending Arthur`, and zero external calls. That technical self-report is not acceptance proof. Arthur's review exposed smoothing that became straight-turn polylines, opacity accumulation/dark dots, live-preview/Sketch instability, weak Glow brightness, and disappearing-content risk. The proof mostly compared hashes, painted counts, maxima, and synthetic gate shapes; it did not enforce the corrected user outcome below.

The result must not be cherry-picked, resumed, corrected in place, or used as an implementation base. Its server PID/cwd/port and worktree/recovery bytes remain subject to later D-0054 cleanup after a verified recovery backup. This Spec Architect task does not stop the server, remove the worktree/branch, create a replacement worktree, or change any rejected byte.

The earlier entry-only `/4bb1/` result remains historical before-evidence, not accepted implementation. Its 14,286-byte entry manifest is preserved in the active PM recovery store at SHA-256 `fb019f3f019e5d754dfde0c6189010e935176216d2bbc051a04d74b436e56a80`.

## 3. Corrected vocabulary and product boundary

- One **Animation Workspace** remains.
- **Drawing tools** are Select, Lasso, Brush, Eraser, Fill, Text, Shape, Knife, and the existing freehand variants.
- **Draw Rig** is the exact visible wording for the Properties toggle described in Phase 2.
- **Drawing Symbol** is a reusable project-created drawing definition. A migrated old rig-backed symbol becomes a Drawing Symbol (or a drawing-only Mixed Symbol when it retains other existing drawing/text/still content).
- **Assets** remains the separate project-local catalog of imported supported external still media.
- **Stick figure**, **structured rig**, **joint**, **limb**, `stick-rig/v1`, `StickFigure*`, and rig-symbol terms are historical compatibility vocabulary after Phase 3, not active authoring concepts.
- There is no **Rig Tools**, **Rig Builder**, **Creator Hub**, joint-attached shape system, bone/constraint system, or active rig symbol lifecycle in the corrected product direction.

Internal compatibility identifiers may remain only where deleting/renaming them would break old-project reads, historical proof, or deterministic migration. They cannot be imported by active new-content commands or surfaced in ordinary authoring UI after Phase 3.

## 4. One validated mutation and preview path

Every authored gesture/action in scope follows:

```text
manual control or pointer gesture
  → transient draft over immutable committed base
  → EditorCommandEnvelope {
      commandId/version, operationId, project/document generation,
      target IDs, exact tool/options, canonical points or raster patch,
      base authored digest, explicit IDs/time where applicable
    }
  → schema/limit/reference/base/no-loss validation
  → one DrawingWorkspace-owned commit/history transaction
  → canonical render and V2 Save/Open/recovery
```

Rules:

1. Preview surfaces never become an independent authored source. Clearing/replacing a preview clears only preview pixels.
2. The committed base is immutable for the lifetime of a gesture. Finalization uses the same prepared geometry/mask/paint accumulator displayed in the last settled preview; it does not recalculate a different path from raw events.
3. A valid primary-pointer release consumes the final transformed sample, seals exactly once, then releases capture. A post-release lost-capture callback is idempotent.
4. Escape, pointer cancel, unexpected lost capture, project/frame/layer/tool/tab switch, playback start, modal close, and stale generation cancel the draft with exact committed digest retention and zero history.
5. Pointer leave while capture remains active is neither commit nor deletion; a later outside release may commit once.
6. A command cannot contain an unversioned blank/full-canvas replacement. Raster mutations use bounded patches plus base digest/generation, or an equivalent proven compare-and-swap that rejects stale/partial publication.
7. A non-delete result must prove monotonic authored retention outside its validated mutation target: every pre-command pixel/item not explicitly targeted for paint, Fill, or transform remains reachable and byte/visually identical as applicable. A destructive result must prove that removal is confined to its registered target.
8. UUIDs/timestamps/hashes are coordinator-supplied. Pure command handlers cannot call React, browser events, AI/network modules, `Date.now()`, `Math.random()`, or hidden `crypto.randomUUID()`.
9. One success creates one global history entry; failure/no-op/cancel creates none. Undo restores the exact prior authored and paint-coverage digests; Redo restores the exact result. A new successful edit after Undo clears Redo.
10. Save/Open/recovery are not authored-history entries. A stale save completion cannot mark newer content saved or replace a newer head.

The final Phase 5 registry records, for every enabled mutation control: command ID/version, payload schema, manual control, validator, handler, delete classification, no-loss assertion, history class, persistence projection, no-op/error result, owner phase, and future-AI eligibility.

## 5. Protected systems and non-goals

Protected throughout unless a numbered phase explicitly names a bounded change:

- ordinary Brush, Pencil, Sketch, Pixelate, and Glow texture identities;
- Select, Lasso, Eraser, Knife, Fill, Text, Shape, pan/zoom, layer/frame/timeline, onion, playback, current Drawing/Mixed symbol transforms, Library, Assets, history, Save/Save As/Open, and SPEC-0006 unified workspace/persistence;
- every existing explicit destructive control named in §1.1, with its current target/reference/confirmation behavior, plus one canonical V2 coordinator/history/repository and the accepted version/head/CAS/last-good/source-read-only guarantees;
- Home, Tutorials, AI Dashboard/panel, existing AI task behavior, APIs, models/prompts/providers, motion/video/tracking, export, auth/billing/cloud/deployment, dependencies/configuration, and external/network behavior.

SPEC-0007 does not add animation/video export, project-file interchange, animated symbols, cloud assets, collaboration, durable autosave, new audio behavior, physics, constraints, joint following, motion generation, or an AI execution route. It does not rewrite or delete legacy source stores. It does not claim physical-phone or native/GPU-memory proof.

## 6. Shared phase lifecycle and proof

The corrected sequence has **five phases**, the smallest reliable separation because drawing correctness, Draw Rig segmentation, data-loss-sensitive legacy migration, untrusted still decoding, and final cross-system integration have different proof and rollback boundaries.

Each phase is a separate lifecycle:

1. Arthur authorizes exactly one phase. D-0074 historically authorized corrected Phase 1; D-0077 separately accepts and technically verifies Phase 2, and D-0078/GIT-063 closes its publication/integration/cleanup. Phase 3 does not inherit authorization; it is ready for a separate decision but remains unauthorized/not started. Phases 4–5 remain unauthorized.
2. A fresh dedicated Spec Executor worktree starts in Plan mode from the exact integrated canonical-main SHA. It records HEAD/main/origin, empty index, exclusive ownership, prior D-0054 cleanup, and an exact phase path allowlist before editing.
3. The executor changes only phase-authorized runtime/fixture/technical-test families plus ignored `output/spec-0007/phase-N/**`, creates and independently mutation-validates a technical manifest, returns an Implementation Review Packet, and completely stops. It changes no canonical docs or Git state.
4. Arthur and the Project Manager accept or reject. Rejected bytes are never reused. Unique dirty/proof bytes are inventoried, hashed, backed up, and verified before the exact server/worktree/local branch is removed under D-0054.
5. After acceptance and executor shutdown, a Control Plane Architect takes exclusive ownership of the same worktree, freezes and revalidates the accepted technical bytes, propagates canonical memory, runs closeout/Git checks, returns a CPA PM Review Packet, and stops with an empty index.
6. A later explicit publication task alone may stage the reviewed allowlist, commit on a `codex/` branch, fast-forward a still-clean canonical `main`, push normally, and verify clean local/live `0/0`. No pull, merge, rebase, amend, force-push, history rewrite, or scope expansion.
7. Only after publication/synchronization, proof preservation, server stop/port close, and D-0054 cleanup may the next phase be authorized and start fresh.

Every phase requires deterministic contract/mutation tests; changed-scope TypeScript/lint/build; real-browser desktop `1440×900` DPR1 and compact `390×844` DPR2; relevant keyboard/200%-zoom/reduced-motion/Axe checks; performance/memory receipts; exact Undo/Redo/Save/Open/failure proof; all applicable SPEC-0006 regressions; zero non-loopback/real API/provider requests; exact scope and `git diff --check`; empty index; and a PASS/VALID technical manifest whose validator rejects a mutation in every material binding family.

Each manifest binds base/HEAD, spec hash, dirty allowlist, source/fixture/test hashes, command ledger, deterministic receipts, browser operations/screenshots/console/page/network ledgers, visual metrics, performance/memory samples, inherited regressions, external-call count, limitations, index state, and `humanAcceptance: pending Arthur`.

## 7. Phase 1 — Drawing Engine and No-Loss Stabilization

### 7.1 Authorized outcome

Phase 1 permanently stabilizes Brush, Pencil, Sketch, Pixelate, and Glow plus their shared raster commit path. D-0075/D-0076/GIT-062 close Phase 1. Arthur separately authorized, reviewed and accepted Phase 2; D-0077 records its technical verification and D-0078/GIT-063 records publication/integration/proof preservation/D-0054 cleanup. Phase 3 is ready for separate authorization but remains unauthorized/not started.

The visible outcome is:

- smoothing 0 is intentionally rough/raw and smoothing 100 is visibly smooth;
- ordinary smoothing never turns a curve into straight-turn segments and never behaves like Draw Rig;
- Pencil and Sketch retain their ordinary texture without beads or preview vibration;
- live preview is stable and pixel-identical to the committed release;
- no stroke or prior authored content disappears on release, cancel, tool/frame/layer change, snapshot, Save, Open, or stale completion;
- same-paint overlaps obey the maximum-coverage law, including at 10% opacity;
- Pixelate remains clean, grid-aligned, connected uniform-alpha squares;
- Glow at low/mid/max is measurably and visibly brighter while its core stays readable and its halo stays bounded; and
- each successful command commits once, Undo/Redo exactly, and survives Save/Open with paint-coverage semantics intact.

Phase 1 does not add Draw Rig, remove the legacy rig UI, migrate old projects, or change Assets.

### 7.2 Required implementation contract

The runtime command is `drawing.raster-gesture.commit/v2` (or a semantically equivalent explicitly versioned replacement). It carries the tool variant, canonical paint key, size, smoothing, Glow parameters, canonical input samples, deterministic texture seed/algorithm version, bounded dirty region, base authored/coverage digests, and prepared final raster/coverage delta. Shapes, Fill, Text, selection, Eraser, and Knife may retain current commands but must pass the no-loss regression matrix.

#### Ordinary smoothing

- Input positions are transformed to canonical authoring coordinates, finite-checked, rounded to 0.001 authoring unit, duplicate-coalesced below 0.25 unit, and distance-resampled at `R = clamp(max(0.75, size / 8), 0.75, 6)` units before smoothing.
- Smoothing `0` uses the resampled raw centerline with ordinary round joins/caps. Pencil zero is truly zero; no hidden minimum is allowed.
- Smoothing `1..100` uses one deterministic continuous curve/filter family whose strength increases monotonically. It may stabilize a mutable tail in preview, but settled points cannot move after they become stable and finalization cannot use a different calculation.
- On a fixed noisy-line fixture, heading-jitter energy at 100 must be at most 30% of the value at 0; levels `0,25,50,75,100` must be non-increasing within a 2% measurement tolerance.
- Endpoints remain within 1 authoring unit of the resampled input endpoints. On the fixed circle/spiral/tight-S fixtures, smoothing 100 retains traversal order, has no self-intersection not present in the fixture, and distributes turn continuously: no interior heading jump above 20° between adjacent equal-distance samples and no straight chord longer than 8% of path length unless the input itself is straight over that span.
- At smoothing 0, at least 85% of deliberate direction changes of 8° or more in the raw fixture remain. This is rough freehand, not a segment simplifier.
- Preview and commit use the same centerline, coverage masks, texture seed, and renderer. A stationary pointer produces zero preview digest changes across ten animation frames; Sketch cannot shake or re-randomize.

These are acceptance properties, not permission to copy the rejected implementation's distance resampler or mutable-tail design.

#### Maximum coverage and texture

- Every dab/subpath/texture mark for a gesture accumulates into a gesture-local coverage mask with per-pixel maximum, never `source-over` or `lighter` accumulation against itself.
- Commit merges that mask with the persisted current same-paint run using maximum coverage and composites the selected paint once over the run base.
- At opacity 10%, exact fully covered pixels are alpha/coverage 26; repeated identical passes, three offset passes, a tight circle, figure-eight crossing, 180° join, fast/slow replay, Pencil texture, Sketch texture, Pixelate cells, and Glow core/halo never exceed 26 for that same-paint run.
- There are zero isolated alpha maxima or beads more than 1/255 above both neighboring centerline samples on the fixed constant-speed fixture.
- Different paint is proven to change/cover prior pixels and to begin a new same-paint run without corrupting the collapsed base.
- Save/Open, frame copy/paste, selection/lasso transform/duplicate/delete, Eraser, Knife, Undo/Redo, and last-good recovery preserve exact pixel and coverage-companion digests.

#### Pixelate

Pixelate uses one document-global integer grid per gesture, integer cell size derived from brush size, and a true supercover traversal. Cells are axis-aligned, non-antialiased, share one grid origin, have exact configured coverage, and leave no gap at any slope or speed. Smoothing may stabilize the route but cannot rotate, curve, partially fill, or add alpha to cells.

#### Glow

Glow must be a bounded coverage/luminance renderer, not repeated additive blur. The selected color supplies hue; brightness may add a bounded white-light component while opacity remains governed by maximum coverage.

For the fixed saturated-cyan stroke over dark-neutral and mid-neutral backgrounds, at identical size/color/opacity/radius:

- brightness 0 has a readable core and no halo outside the documented fallback width;
- brightness 50 has a halo-annulus mean linear-luminance lift of at least 0.08 over its local background and core contrast of at least 3:1;
- brightness 100 has a halo-annulus mean lift of at least 0.18, a peak halo lift at least 1.5× the brightness-50 peak, and a core peak linear luminance of at least 0.75 while preserving recognizable hue;
- the low/mid/max ordering must hold by luminance/contrast, not painted-pixel count or radius alone;
- halo extent is capped at `min(128 authoring units, max(8, size * 8))` from the centerline, scratch allocation is bounded to the dirty region, and no full-authoring-canvas clone/blur occurs per pointer sample; and
- opacity 10% still caps same-paint coverage at 26, including Glow core and halo.

Arthur's ordinary-app review decides whether maximum Glow is persuasively bright; numeric proof cannot substitute for that visible acceptance.

### 7.3 No-loss state machine and exact user flow

For each freehand variant at size/opacity/smoothing minimum, middle, and maximum; for Glow brightness/radius low/mid/max:

1. New Project; create two layers and three frames containing protected raster, text, drawing symbol, mixed symbol, and legacy rig content.
2. Draw dot, slow line, fast diagonal, noisy line, tight circle, figure eight, spiral, S curve, sharp intentional corner, and boundary-crossing zigzag.
3. Hold the pointer stationary during Sketch preview; release inside once and outside once; pointer-leave and return once.
4. Cancel separate drafts by Escape, pointercancel, unexpected lost capture, tool switch, Properties-tab switch, frame switch, layer switch, playback start, and project-close attempt. Every cancel retains the exact pre-gesture authored/coverage digest and adds zero history.
5. During a committed gesture, inject a queued stale snapshot, frame/layer transition, and delayed autosave completion. The successful stroke and all earlier content remain; stale/blank/partial publication is rejected.
6. Repeat/offset the same paint at 10% and 50%; then use different color, opacity, and variant. Verify exact maximum-coverage/different-paint semantics.
7. After every success, one Undo removes only that command and one Redo restores exact authored/coverage digests. A new edit after Undo clears Redo.
8. Exercise every currently reachable destructive registry entry from §1.1—Eraser, Knife, Delete selection, Remove Frame, Delete Layer with confirmation, Clear Canvas with confirmation, Delete Instance, unreferenced Delete definition plus referenced-definition rejection, and Remove Attached Sound. Verify exact targets, minimum/reference guards, confirmation where required, and Undo/Redo. Prove Fill, Text, Shape, Select/Lasso transforms, tool/frame/layer changes, drawing, smoothing, preview, release, Save, and Open cannot blank/drop anything outside their exact validated mutation target.
9. Save; add later marks; Save again; reload/Open; Save As; reopen original/copy; inject snapshot/encode/hash/decode/readback/quota/stale-CAS/publish failures. Last-good heads/versions/source bytes and all authored/coverage digests remain correct.
10. Scrub, onion, and full-loop playback; verify preview, paused edit, playback, reopened view, and persisted raster are visually identical for the tested frame.

### 7.4 Scope and allowed families

Allowed runtime families:

- `src/components/workspace/DrawingCanvas.tsx`
- `src/components/workspace/DrawingWorkspace.tsx`
- `src/components/workspace/DrawingRightPanel.tsx`
- `src/components/workspace/DrawingToolBar.tsx`
- new/extended UI-independent commands under `src/lib/animation/editorCommands/**`
- the minimum additive raster-content/coverage companion contract and migration under `src/lib/animation/unifiedAnimationContentV2.ts`, `unifiedAnimationContractV2.ts`, and a narrowly named migration/helper module
- `src/components/workspace/AnimationWorkspace.tsx` only for the existing Drawing compatibility projection/hydration of the new raster companion
- `src/lib/animation/unifiedProjectRepositoryV2.ts`, `unifiedProjectStorageV2.ts`, and `unifiedWorkspaceBootstrap.ts` only for reached snapshot/asset/validation/hydration/performance and rollback mechanics
- phase-owned fixtures/tests under `scripts/fixtures/spec0007-manual/phase-1/**` and `scripts/spec0007-manual/phase-1/**`
- ignored proof under `output/spec-0007/phase-1/**`

The fresh executor freezes the exact subset before editing. No active rig/Creator/symbol/asset UI change, AI path, dependency/configuration, limit reduction, source writer, or other runtime family is authorized. Needing another runtime family is a stop-and-return condition.

The additive coverage companion must remain within the existing 256 MiB single-raster allocation ceiling and 128/512 MiB storage limits. If a truthful format cannot meet those limits without data loss, Phase 1 stops; it does not silently discard provenance, lower fidelity, or raise limits.

### 7.5 Performance and exit gates

- preview p95 ≤16.7 ms desktop and ≤33.4 ms compact over 20 warmed fixed strokes/variant/profile;
- zero pointer-active long tasks >50 ms and zero post-release no-op work >200 ms attributable to a gesture;
- stable preview consumes bounded dirty-region work and does not grow with replay count after the stable prefix;
- Glow scratch/coverage allocation is dirty-region bounded and returns to baseline after 20 draw/undo cycles;
- representative project Open ≤775 ms and Save ≤1,530 ms; settled JS heap <320 MiB; transient/stress JS heap ≤512 MiB; single raster/companion allocation ≤256 MiB;
- no limit, schema validation, failure code, immutable-version retention, CAS, last-good fallback, or source-read-only guarantee is weakened;
- TypeScript/build/focused lint, full-lint changed-line non-regression, exact-scope/diff/index, all applicable SPEC-0006 persistence/history/timeline/onion/selection/symbol/rig/AI-isolation gates, and the new negative-mutation manifest validator pass; and
- Arthur and the PM visibly accept real drawing quality, stable preview, transparency, Glow, and no disappearance. Automated pixel counts/hashes alone are insufficient.

Entry gate: publish/synchronize the corrected D-0074 control plane; under D-0054 inventory/hash/back up the exact rejected `/3cd3/` dirty/proof bytes, verify the backup, stop its exact server/port, remove only that worktree and any now-unused local feature branch, then create one fresh dedicated Plan-mode executor worktree from the exact corrected publication SHA. The prior dirty result and its proof are evidence only.

Exit: the Phase 1 manifest is PASS/VALID against fresh bytes, all user flows and protected regressions pass, the executor stops, and Arthur/PM review occurs. Only accepted, propagated, separately published, synchronized, and cleaned Phase 1 can unlock a separate Phase 2 authorization.

## 8. Phase 2 — Draw Rig

Status: **Verified, published, integrated, recorded and cleaned up under D-0077/D-0078/GIT-063**

### 8.1 Visible contract

Properties exposes one switch labelled exactly **Draw Rig** while Brush, Pencil, Sketch, Pixelate, or Glow is active. Off means the unchanged Phase 1 ordinary tool behavior. On means the same tool/paint produces a raster polyline with deliberate straight-ish segments and visible corners.

Draw Rig:

- creates no joint IDs, joints, bones, limbs, segments as document objects, graph topology, constraints, attachments, rig item, hidden hit target, or separate selection model;
- outputs an ordinary raster patch plus the same paint-coverage companion as other freehand drawing;
- remains erasable, knifable, selectable/lassoable, transformable, duplicable, deletable by the allowed explicit delete commands, onion-visible, playable, undoable/redoable, and Save/Open-safe;
- preserves a circular gesture as a visible polygonal sequence of line-turn-line-turn, never a smooth circle; and
- does not activate when smoothing is zero unless the Draw Rig switch is explicitly on. Ordinary Pencil at zero remains rough freehand.

### 8.2 Deterministic segmentation

Let `s` be smoothing 0–100, `w` brush size, and use the Phase 1 canonical distance-resampled points.

```text
stabilizer window W(s) = 1 + floor(8s / 100) samples
soft corner angle A(s) = 12° + 0.38°s          // 12° … 50°
minimum vertex distance D(s,w) = clamp(2R + 0.12s, 2, 24) authoring units
maximum chord deviation E(s,w) = clamp(R + 0.06s, 1, 10) authoring units
maximum segment length M(s) = 24 + 0.72s       // 24 … 96 units
```

The online accumulator emits the first vertex; then emits a vertex when the stabilized direction change reaches `A` after `D`, perpendicular chord deviation reaches `E`, or length reaches `M`; and always emits the final point. A deliberate hard corner of at least 70° sustained for two stabilized samples with at least 4 units on each side is preserved within 8 units even at smoothing 100. Duplicate/collinear vertices are removed deterministically. All values are canonical authoring coordinates rounded to 0.001.

Low smoothing must retain more small direction changes; high smoothing must remove hand jitter and yield fewer, longer stable segments. On the fixed noisy-polyline fixtures, vertex count and total absolute turn are non-increasing at `0,25,50,75,100` within one-vertex/2% tolerance; mean segment length is non-decreasing. High smoothing may merge soft bends but cannot remove the hard-corner fixtures.

These rules produce polylines only. No spline, quadratic/cubic curve, round-corner post-process, or hidden rig reconstruction may be used in Draw Rig mode. Round paint caps/joins may cover the polyline raster seam but may not visually curve the centerline.

### 8.3 Preview, history, persistence, AI parity, and proof

Preview and final commit use the same incremental vertex accumulator and same raster/coverage masks. Stable emitted vertices never move; only the unsealed tail may change. Stationary input yields zero digest changes; release adds the exact final sample and produces a pixel/coverage digest identical to the last settled preview. Cancel and every context switch retain the base exactly.

The shared command is the Phase 1 raster gesture command with explicit `pathMode: "draw-rig"`, `segmentationAlgorithmVersion`, threshold inputs/derived values, and final vertices. A future AI caller may later submit the identical validated raster-polyline envelope; it may not submit joints/bones/graphs through this capability. Phase 2 adds registry metadata but no AI route.

Acceptance includes slow/fast lines, noisy line, soft and hard bends, triangle/square, circle/oval/spiral, self-crossing path, boundary path, every freehand variant, smoothing levels, 10% same-paint overlaps, preview/final identity, cancel/terminal races, Undo/Redo, selection/lasso/Eraser/Knife, frame/layer/onion/playback, Save/Open/Save As, desktop/compact/keyboard/zoom, and Phase 1/no-loss regressions. It repeats Phase 1 performance ceilings; 1,000 canonical input points must remain O(n), allocate ≤8 MiB transient segmentation state, and add no pointer-active >50 ms task.

Allowed runtime is the Phase 1 command/drawing/Properties boundary plus phase-owned fixtures/tests. No rig/Creator compatibility, legacy migration, Assets, AI, or unrelated UI change.

## 9. Phase 3 — Safe Legacy Rig Retirement and Migration

Status: **Unauthorized; not started**

### 9.1 End state

Remove every active structured-rig authoring surface and command from the ordinary product:

- no Stick Figure/Rig Tools tab;
- no Add Limb/Segment, joint move/select, topology edit, rig appearance/attachment, rig creation, or active rig symbol creation/update;
- no Creator/Stick Figure Creator/Rig Builder modal or workspace;
- no new-content command can create `stick-rig/v1` or a rig-backed symbol; and
- saved post-migration canonical projects contain no active structured rig item or rig-backed definition.

Historical source parsers, validators, and a deterministic legacy renderer may remain only behind the old-project read/migration boundary. Static/import checks must prove active workspace/new-content/command-registry modules do not import them after migration.

### 9.2 Non-destructive migration

On Open, before publishing a candidate root:

1. validate the complete source and every rig/symbol reference;
2. render each distinct structured rig owner cell once at canonical authoring resolution through a versioned deterministic legacy renderer, respecting item order, visibility, style, transform, holds, copied owners, onion/playback source identity, and existing rig-symbol instance transforms;
3. replace a standalone rig item with an ordinary raster drawing item in the same z-order/owner cell;
4. convert a rig-only definition to a Drawing Symbol and a mixed definition containing rig plus other drawing content to a drawing-only Mixed Symbol, preserving definition/instance IDs where safe, names, transforms, ordering, and linked references;
5. retain all unrelated raster, text, audio, tween, still asset, catalog, auxiliary, project identity, frame/layer, history-baseline, and provenance content; and
6. publish the migrated in-memory candidate only after complete validation, visual comparison, allocation preflight, and digest construction succeeds.

The source store is never modified. For a native V2 source, first successful Save stages a new immutable migrated version and retains the exact pre-migration version as a recovery predecessor. For Drawing/Stick/unified legacy sources, adoption creates/uses the canonical V2 destination while preserving the original source record read-only. A versioned migration receipt records source kind/ID/digest, renderer version, converted item/definition IDs, output digests, and retained recovery version/source identity.

Migration is deterministic and idempotent. Opening/retrying the same source digest yields the same migrated authored projection and does not duplicate pixels, items, definitions, instances, or storage assets. Failure, quota, corrupt reference, unsupported legacy shape, renderer error, hash/decode/readback failure, stale CAS, or app interruption keeps the current workspace/head and the source/pre-migration version intact and shows a precise recovery-safe error. Partial migration never mounts or saves.

### 9.3 Appearance, editability, and recovery proof

- For every supported historical rig/rig-symbol fixture, before/after 1:1 composites must have identical occupied bounds and alpha mass; max channel difference ≤2/255 and changed visible pixels ≤0.1% solely for documented rasterization antialiasing. Any larger difference is failure and requires renderer correction, not tolerance expansion.
- Arthur visually reviews representative line heads, round heads, branches, overlapping rigs, transforms, onion, full playback, and rig-backed/mixed symbols.
- Migrated raster items are immediately editable by Brush/Select/Lasso/Eraser/Knife and explicit Delete selection/frame. Migrated Drawing Symbols retain ordinary place/move/resize/rotate/duplicate/delete behavior; no rig semantics survive.
- Save/reload/Open and Save As preserve exact migrated pixel/catalog/instance/provenance digests. Recovery can reopen the exact pre-migration immutable version/source read-only and retry migration; recovery cannot expose an active rig editor.
- Complete projects with zero rigs are byte/digest unchanged by the migration reader.

Allowed runtime covers the ordinary rig/Creator UI removal, new-content command retirement, V2/source-read migration/contract/render/catalog/repository/bootstrap paths, and phase-owned fixtures/tests. It may not delete historical source bytes, weaken V2 safety, change Drawing/Draw Rig semantics, add Assets formats, touch AI/provider/motion/video, or revive the standalone Stick coordinator.

Exit requires all six supported legacy source kinds, structured rig items, rig/mixed symbols, holds/onion/playback/history/Save/Open/recovery, no-loss, Phase 1/2, and SPEC-0006 non-rig regressions. Static/import/runtime ledgers prove zero active structured-rig authoring reachability.

## 10. Phase 4 — Assets Stabilization

Status: **Unauthorized; not started**

Assets remains the separate external-still tab. Supported inputs are static PNG (`image/png`), JPEG (`image/jpeg`), and WebP (`image/webp`) whose signature, decoded type, dimensions, MIME, and non-animation status agree. Reject GIF, SVG, AVIF, HEIC, PDF, PSD, audio, video, unknown/generic files, spoofed extensions/MIME, animated WebP, zero dimension, corrupt/truncated data, and metadata-only placeholders.

Per file: encoded bytes `1..16,777,216`, width/height `1..8192`, decoded pixels ≤33,554,432, decoded RGBA estimate ≤134,217,728 bytes. A batch has ≤32 files, stable chooser order, full preflight before decode, and all-or-none default commit. Existing 128 MiB/project, 512 MiB/collection, 64-project, and 256 MiB single-raster limits remain authoritative.

User flow: import valid boundary/representative PNG/JPEG/WebP; truthful preview/metadata; reject duplicate bytes/name collisions and every invalid fixture atomically; place/move/eight-handle resize with aspect lock/explicit unlock/rotate/duplicate/Delete selection; Undo/Redo; delete only an unreferenced catalog entry through its explicit catalog action; Save/edit/Save As/reload/Open original/copy; inject decode/hash/quota/readback/CAS failures; repeat desktop/compact/keyboard/zoom and 20 import/preview/remove cycles with resource revocation/no settled growth.

No URL fetch, video-to-animation, cloud assets, new dependency, project-file import, export, AI, or legacy rig behavior. Exit includes no-loss, same-paint companion preservation, Phase 1–3, history/timeline/onion/playback/symbol/persistence, and zero-network regressions. Representative import p95 ≤1 s desktop/≤2 s compact and settled heap remains <320 MiB.

## 11. Phase 5 — Final Manual Editor Bug Burn and Future-AI Command Registry

Status: **Unauthorized; not started**

Phase 5 repeats the complete ordinary editor matrix and publishes the exact runtime-used shared command registry. Exit means zero known reproducible bug in the defined matrix, no serious unresolved editor issue, no silent data loss, and no protected regression. It is a bounded release gate, not a claim that all software is bug-free.

A semantic defect found in a prior phase returns to a fresh separately authorized correction executor for that owning phase. Phase 5 may make only narrow integration/testability/accessibility corrections and registry/exporter work; it cannot absorb broad drawing, Draw Rig, migration, asset, persistence, or history rewrites.

The matrix covers:

1. Brush/Pencil/Sketch/Pixelate/Glow at all exact smoothing/opacity/Glow fixtures; stable preview/final identity; same-paint maximum coverage; Draw Rig on/off and polygons/corners.
2. Select/Lasso, Eraser, Knife, Fill, Text, Shape, pan/zoom, drawing/mixed symbols, every registered destructive action with its exact target/reference/confirmation rule, and proof that every non-delete action preserves everything outside its validated mutation target.
3. Layers/frames/timeline/onion/full-loop playback, at least 160 interleaved authored operations through the history cap, full available Undo/Redo, new-edit-after-Undo, terminal races, and no adapter-local divergence.
4. New/Save/later Save/Save As/Open/reload/original/copy; stale concurrent save; injected encode/hash/decode/quota/readback/CAS failures; last-good recovery; all six legacy source kinds; complete rig retirement/migration; zero source writes.
5. Assets supported/unsupported lifecycle and all instance/catalog behavior.
6. Desktop/compact/keyboard/focus/status/error/Axe/200%-zoom/reduced-motion; no page overflow or obstructed stage/timeline action.
7. Isolation: zero change/request under AI/provider/model/prompt/API/motion/video/tracking, Home/Tutorials, dependencies/configuration, deployment, legacy source writers, or external network.

The machine-readable registry and human table cover every enabled manual mutation. Static/import tests prove each enabled control resolves one registered capability and no enabled control directly sets document/catalog/history state outside the sanctioned coordinator adapter. Mutation tests remove/rename a command, misclassify deletion, bypass no-loss/base validation/history, alter a manual mapping, introduce an unregistered setter, or import AI/network/active-rig code and must fail. Pure replay executes every envelope twice from identical bases and compares result/error/authored/coverage digests.

Five warmed full-playback loops/profile have zero missed document writes, zero render-triggered history writes, zero >200 ms long tasks, and no monotonic settled-heap growth. The strictest Phase 1–4 and SPEC-0006 ceilings remain; a new measurement cannot silently weaken them.

Only after Phase 5 technical PASS/VALID, Arthur/PM ordinary-app acceptance, CPA propagation, separate publication, clean local/live synchronization, proof preservation, and D-0054 cleanup may SPEC-0007 become Verified. SPEC-0008 remains separate and unauthorized.

## 12. Phase summary and authorization

| Phase | TODO | Entry gate | Exit result | Status |
| --- | --- | --- | --- | --- |
| 1 — Drawing Engine and No-Loss Stabilization | `MANUAL-001` | D-0074/spec package published and synchronized; rejected `/3cd3/` proof backed up and D-0054 cleanup complete; fresh Plan-mode worktree | Stable ordinary drawing, max coverage, real smoothing/Glow, preview identity, no disappearance, history/persistence/performance proof | **Verified/published/integrated/recorded/cleaned up** |
| 2 — Draw Rig | `MANUAL-002` | Phase 1 accepted/published/synchronized/cleaned; separate authorization | Toggleable raster-only segmented drawing with deterministic thresholds and shared command | **Verified/published/integrated/recorded/cleaned up under D-0077/D-0078/GIT-063** |
| 3 — Safe Legacy Rig Retirement and Migration | `MANUAL-003` | Phase 2 accepted/published/synchronized/cleaned; separate authorization | No active rig/Creator system; old projects/symbols migrate visibly and recoverably | Unauthorized; not started |
| 4 — Assets Stabilization | `MANUAL-004` | Phase 3 accepted/published/synchronized/cleaned; separate authorization | Bounded truthful still-media lifecycle | Unauthorized; not started |
| 5 — Final Bug Burn/Future-AI Registry | `MANUAL-005` | Phase 4 accepted/published/synchronized/cleaned; no known prior-phase repro; separate authorization | Complete manual matrix and runtime-used command registry | Unauthorized; not started |

Durable owner decisions are complete for the corrected Phase 1 outcome and five-phase direction. Material changes to the no-silent-deletion law, same-paint maximum coverage, Draw Rig visible semantics/thresholds, active rig retirement, legacy recovery, supported asset formats/limits, or shared-command law return to Arthur/Spec Architect. Bounded engineering mechanics may be resolved inside the authorized phase only when they preserve these outcomes, limits, and proof.

## 13. Corrected planning verification and handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Required boot/base/index | PASS | clean detached `be41db9e06126ae4e15c162962c6b856cb97660e`; empty index before edits; canonical docs/spec/references read |
| Live execution path | CODE VERIFIED | one V2 coordinator; DrawingCanvas transient/preview/raster/rig adapter; pointer autosave; V2 snapshot/repository/storage/bootstrap traced |
| Rejected Phase 1 result | REJECTED/UNPUBLISHED/NON-REUSABLE | exact ten dirty paths; 39,787-byte manifest SHA-256 `26acbf…`; Arthur-visible smoothing/transparency/preview/Glow/disappearance failures supersede self-reported PASS |
| Corrected phase design | PASS | five sequential phases; only corrected Phase 1 ready next; Draw Rig and legacy retirement separately gated |
| Runtime/fixture/test/Git changes in this task | ZERO | control-plane/tree only; no review app created or run |
| Owner blockers | NONE for corrected Phase 1 | publication/synchronization and D-0054 cleanup are lifecycle entry gates, not unresolved product choices |

The fresh corrected Phase 1 executor started from exact D-0074 publication SHA `1c5aee42fa87967ad058c00cc3d62b51589b77fa`, completed the exact 17-path implementation, and stopped. Arthur accepted its ordinary app on 2026-09-16. Technical manifest `output/spec-0007/phase-1/proof-manifest.json` is PASS/VALID at SHA-256 `511c778e83741b7dde420863769f68132146934f072c6203289bcbf0ea05d689`; independent validation is PASS at SHA-256 `61514dcb59275292b8f2d9e3b345552b3c8de5128290dde6ff9627b30dba7186`, including 99 rejected negative mutations. GIT-062 published the exact accepted package and D-0076 records synchronization/proof preservation/D-0054 cleanup.

D-0077 accepts the stopped exact ten-path Phase 2 result from unchanged GIT-062 base/HEAD `88721481a345d6dda3f17b5620111a9cda2ab799`, empty index. Draw Rig uses `causal-fixed-corridor/v3` with tolerance `11`, minimum sample distance `0.75`, and direction-settle distance `12`, preserving immutable committed history and an unsealed live tail with no timer, replay, post-release refit or smoothing dependency. The immutable PASS manifest SHA-256 is `21db2d920831240be7eeb18fb2ca37126197d762f7ff9a432a3912a0da5809bd`; source digest is `f8d80225c16449afb0a20c6eff88197ec2d2bdf27349e3240211725ee459e8dc`. Proof passed 801 geometry assertions, 195 browser assertions, a 20-case style/transparency matrix, 37 independent manifest checks, exact protected Phase 1 hashes, Save/Open/Export, timeline/onion/playback/history, and 32 draw/undo cycles. Arthur accepted the stronger-stick result on 2026-09-18.

D-0078/GIT-063 publishes the exact accepted ten technical paths plus 13 reviewed records/tree paths at `fb10e6239fd4b1edf319b3137a883e1219645ef3`, verifies clean local/live synchronization, preserves all 37 proof files at aggregate SHA-256 `3f21db115795431a6564a1dc5833cccad5bd92c27cf240ae3f7e4e95ea982dc2`, and completes D-0054 Phase 2 review-copy cleanup. Exact next step: Arthur may separately authorize one fresh Plan-mode Phase 3 executor from the then-current clean canonical-main SHA. Phase 3 has not started.
