# SPEC-0002 — Lossless Local Drawing Save and Reopen

Status: Approved
Owner: Arthur
Implementer: Codex
Created: 2026-08-15
Last updated: 2026-08-15
Decision links: D-0013
TODO IDs: SPEC-002, DATA-002 (Phase 1), DATA-001 (narrow Drawing portion), RENDER-001 (save/reopen portion)
Baseline branch/commit: `codex/spec-architect` at `365e68fe98b27e993a1c5645c3e28c7b428c6f33`, matching `origin/main` at research start
Last verified branch/commit: approval and activation-conflict audit at `365e68fe98b27e993a1c5645c3e28c7b428c6f33`; no implementation exists
Lifecycle: Approved and active for bounded work; Phase 1 Authorized/Not started; Phase 2 Unauthorized/Not started

## 1. Exact Goal

Diamond Animator must let a user explicitly save a currently supported Drawing project on this browser, leave or reload the app, reopen it through **Open Project**, and continue editing the same supported project without losing or downscaling its saved raster artwork, tween endpoints, text, layers, timing, motion-tween data, or sound attachment bytes.

The product must say **Saved on this browser** only after the durable local transaction completes. Serialization, validation, capacity, quota, transaction, or read-back failure must preserve the last known good saved record byte-for-byte and show a clear message. This is finite browser storage, not cloud save, autosave, crash recovery, or unlimited capacity.

The recommended V1 outcome for this spec is:

- pixel-exact decoded RGBA dimensions and bytes for every stored raster asset;
- exact structured-data round trip for all fields listed in §4.3;
- explicit Save and Save As only;
- a version-2 IndexedDB record with rollback-safe staging and one atomic active-head publication;
- strict, non-destructive compatibility for existing version-1 localStorage projects;
- a recommended application ceiling of 128 MiB encoded bytes per project, 512 MiB across managed Drawing records, and 64 Drawing projects, subject to an earlier browser quota refusal;
- a separate 512 MiB ceiling for the sum of logical hydrated raster materializations in one project, checked before any raster Blob read or native decode;
- truthful saved/unsaved/saving/too-large/failed presentation; and
- fully offline deterministic and real-browser proof.

Arthur accepted these recommendations exactly through D-0013. This approval authorizes Phase 1 only as Not started; it does not begin implementation or authorize Phase 2.

## 2. Current Behavior and Evidence

### 2.1 Observed / intended / gap / proof

| Area | Observed current behavior | Intended Proposed behavior | Gap | Required proof |
| --- | --- | --- | --- | --- |
| Save destination | `saveStoredDrawingProject` rewrites one JSON array under localStorage key `da_saved_drawing_projects`. | One versioned project record is written transactionally to local IndexedDB. | Whole-array localStorage writes are size-sensitive and cannot give per-project transactional semantics. | Injected transaction/quota failures and raw last-good-record equality. |
| Main frame bitmap | `serializeTimelineFrame` writes `bitmap: null`, then stores a compact preview URL. | Store a lossless raster asset and a strict reference from the frame. | Full authored pixels are deliberately omitted. | Exact width, height, and RGBA SHA-256 before Save and after reopen. |
| Tween-end bitmap | The same serializer writes `tweenEndBitmap: null` and uses a compact preview URL. | Store the tween endpoint as its own lossless raster asset. | Tween endpoint can be downscaled/lossy on reopen. | Exact endpoint RGBA and motion-tween playback checkpoints. |
| Preview encoding | Frame previews use WebP quality candidates, a 1,280-pixel maximum target dimension, and a 72,000-character target. | Project-card previews remain disposable and may be lossy; project content never uses them as authoritative data. | A card preview currently doubles as reopen data. | Delete/omit preview and still reopen exact content. |
| Reopen | Missing full bitmaps are decoded from preview URLs at encoded natural size and centered; the current path gives encoded image bytes to `Image` before it checks decoded dimensions. | Reject an over-limit aggregate hydrated-RGBA footprint before reading raster Blobs, then preflight bounded PNG bytes and dimensions before any native decode/allocation; decode accepted lossless assets at exact saved dimensions and reject mismatch before mounting. | Prior dimensions and pixels cannot be reconstructed from a lossy/downscaled preview, and individually conforming compressed assets can still request an unsafe aggregate allocation. | Browser round trip plus aggregate-limit, repeated-reference, truncated, corrupt, unsupported, oversized-header, and post-decode mismatch rejection with no partial mount and exact Blob-read/preflight/native-decode counts. |
| Structured content | Layers, cells, FPS, selected indices, text, motion-tween metadata, sound attachment metadata/data URL, and tool settings use separate fields in `DrawingProjectData.version: 1`. | A strict version-2 envelope inventories and validates each in-scope field. | Current reader validates only the outer wrapper, not the nested document/version. | Complete valid/invalid fixture matrix and canonical round trips. |
| Motion tween sprite | `serializeStoredMotionTweenData` serializes `spriteBitmap` as raw number data. | Store its pixels in the same lossless asset table and preserve exact origins/stage dimensions. | One bitmap path differs from main-frame storage and has no common integrity rule. | Exact structured and pixel digests. |
| Sound | Each mounted attachment contains exactly `id`, `title`, `description`, `timingFeel`, `intensityFeel`, `audioDataUrl`, `contentType`, `speechText`, `sourceTask`, and `attachedAt`; current synthesis emits canonical `audio/wav` data URLs. | Preserve every structured value exactly. Convert only a supported non-null `audioDataUrl` to lossless Blob bytes plus MIME metadata, reconstruct the identical canonical data URL on reopen, and count the Blob bytes toward capacity. | The earlier proposal incorrectly invented stored option, duration, source, and MIME fields and did not freeze null/unknown-shape behavior. | Exact structured equality, canonical data-URL equality, base64-decoded byte/MIME digest, null-audio preservation, and valid/invalid field matrices. |
| Save success | `persistProject` displays `Project saved` after the synchronous storage call succeeds; failures have no beginner-facing typed state. | Show `Saved on this browser` only after candidate verification and active-head transaction completion; show typed failure otherwise. | No saving/dirty/too-large/corrupt status contract. | UI and accessibility assertions for every state. |
| Quota fallback | On `QuotaExceededError`, current storage retries the whole array after removing project-card previews from every project. | Prepare/validate one candidate; atomically commit it, optionally without its disposable card preview; never alter other projects to rescue the write. | Retry changes unrelated records and still depends on localStorage capacity. | Neighbor-record byte equality through quota/failure fixtures. |
| Invalid storage | Root parse errors return `[]`; invalid wrappers are silently filtered. | Return typed `corrupt`, `unsupported`, or `read-failed` results; never overwrite unreadable bytes as an empty catalog. | A later save can treat unreadable storage as empty. | Seed corrupt/future-version bytes, attempt Open/Save, prove bytes unchanged. |
| Open Project | Live isolated inspection showed Home → Open Project lists the saved Drawing card and clicking it remounts Drawing Workspace. | Preserve that navigation while adding async loading/error/legacy states. | Current list is synchronous/localStorage-only. | Existing navigation plus new IDB and legacy fixtures. |
| AI memory | `aiMemory` is a sibling of `DrawingProjectData`; workspace open also starts a same-origin remote-memory request. | Preserve sanitized local memory as auxiliary local data, outside artwork fidelity digest; do not redesign or call the remote service in default proof. | Migration could otherwise orphan current local memory. | Local companion round trip; all route/Supabase requests fulfilled/denied by the tester. |
| Reusable assets | Imported reusable assets and library symbols are mounted-session collections; placed pixels become raster state. | Continue saving placed pixels, but explicitly exclude reusable source entries from this project envelope. | Current UI can imply more persistence than the schema provides. | Reopen proves placed pixels; fixture proves reusable entries are absent. |

### 2.2 Fresh evidence labels

| Evidence | Result | Label |
| --- | --- | --- |
| `src/lib/drawingProjectStorage.ts` complete trace | Confirms localStorage key, version-1 wrapper/data types, shallow reads, whole-array writes, preview-removal retry, and rename/duplicate/delete paths. | Code verified |
| `DrawingWorkspace.serializeTimelineFrame` and preview helpers | Confirms `bitmap: null`, `tweenEndBitmap: null`, compact/downscaled WebP preview targets, and independent serializers. | Code verified |
| Workspace/stored sound attachment and synthesis | Confirms the exact ten fields in §4.3, current optional V1 hydrate defaults, no stored option/duration/source/MIME field, and `audio/wav` FileReader data-URL output. | Code verified |
| Drawing reopen hydration | Confirms preview images are decoded at encoded natural size and substituted for missing bitmaps. | Code verified |
| Isolated local browser: New → Drawing → Save → reload → Open Project → open | Save produced a version-1 record, reload returned Home, Open listed the project, and reopen mounted the workspace. The memory endpoint was locally intercepted. | Live verified for navigation and empty-project persistence only |
| Stored record inspected in isolated browser | The saved frame held `bitmap:null`, `tweenEndBitmap:null`, `previewUrl:null` for the empty frame, version 1, and a lossy project-card WebP. | Live verified |
| Representative multi-frame raster/text/tween/sound fidelity | Not executed in this research task. | Unproven; Phase 2 acceptance |
| Failure/quota/corruption UI | Not executed. | Unproven; Phase 1/2 acceptance |

The isolated inspection did not submit AI, call OpenAI/search, or contact Supabase. It used a local fixture response for `/api/drawing-project-ai-memory`.

## 3. Root Cause or Missing Foundation

This is not a one-line quality adjustment. The authoritative project format intentionally replaces main and tween-end `ImageData` with small display previews. Reopen can only decode those previews; information already removed by WebP compression and dimension reduction no longer exists. Raising the 72,000-character target would increase localStorage pressure without creating validation, atomic per-project writes, corruption handling, or truthful failures.

The missing foundation has six linked parts:

1. no strict nested Drawing document/envelope validator or compatibility result;
2. no lossless asset contract shared by main frames, tween endpoints, motion-tween sprites, and the real sound attachment shape;
3. no bounded PNG header/chunk safety gate before native image allocation;
4. no transaction-safe finite-capacity repository;
5. no honest authority boundary between IndexedDB deletion and best-effort legacy localStorage maintenance; and
6. no editor publication state that distinguishes unsaved, saving, durable success, stale completion, and failure.

The smallest safe design therefore introduces the format/storage engine before changing the visible Save/Open path.

## 4. Scope

### 4.1 Version-2 record ownership

The recommended repository is browser-local IndexedDB database `diamond-animator-local`, database version 1, with object stores:

- `drawingProjectHeadsV2`, keyed by `projectId`, containing the only active-version pointer and list metadata;
- `drawingProjectVersionsV2`, keyed by `[projectId, storageRevision]`, containing immutable project envelopes;
- `drawingProjectPreviewsV1`, keyed by `projectId`, disposable and never authoritative;
- `drawingProjectAuxiliaryV1`, keyed by `projectId`, for sanitized local Drawing AI memory only; and
- `drawingProjectLegacyDeleteTombstonesV1`, keyed by `projectId`, containing only local same-ID legacy-suppression/cleanup state after an authoritative local Delete of a V2 project or an exactly classified legacy-only project.

The document and every referenced content asset live in one immutable `DrawingProjectVersionRecordV2`. Save first writes a non-active candidate version, strict-reads it back, then uses a separate read-write transaction to compare the expected active head and atomically swap the one head pointer. A failure before head publication leaves the prior head/version authoritative. A candidate is never visible in Open Project. After publication, old/incomplete versions are garbage-collected best-effort; cleanup failure cannot roll back or hide the new head and must be retried before the next write. Preview and auxiliary records are non-authoritative companions and never satisfy content hydration.

Normative stored shapes:

```ts
type DrawingProjectHeadV2 = {
  kind: "diamond-drawing-project-head";
  schemaVersion: 2;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeStorageRevision: number;
  documentDigest: string;
  activeStoredByteLength: number;
};

type DrawingProjectVersionRecordV2 = {
  kind: "diamond-drawing-project";
  schemaVersion: 2;
  projectId: string;
  storageRevision: number;
  storedByteLength: number;
  documentDigest: string;
  document: DrawingProjectDocumentV2;
  assets: DrawingProjectAssetV2[];
};

type DrawingProjectLegacyDeleteTombstoneV1 = {
  kind: "diamond-drawing-legacy-delete-tombstone";
  schemaVersion: 1;
  projectId: string;
  legacyRecordDigest: string | null;
};
```

All objects reject unknown keys. IDs are non-empty NFC strings of at most 128 UTF-8 bytes and unique in their declared collection. Timestamps are UTC ISO-8601 strings. Revisions are safe integers starting at 1. All numeric document fields are finite; indices and dimensions are bounded non-negative safe integers and cross-references must resolve. A tombstoned ID is reserved and cannot be reused until maintenance has verified that no same-ID legacy entry remains and removed the tombstone.

### 4.2 Lossless asset contract

`DrawingProjectAssetV2` is a strict union:

- raster: `assetId`, `kind:"raster-png"`, `width`, `height`, `rgbaByteLength`, lowercase `rgbaSha256`, `encodedByteLength`, lowercase `encodedSha256`, and PNG `Blob` bytes;
- audio: `assetId`, `kind:"audio"`, `mimeType:"audio/wav"`, `byteLength`, lowercase `sha256`, and WAV `Blob` bytes.

Native browser PNG is the recommended compression boundary. Encoder byte identity is not promised across browser versions. Fidelity is defined after decoding: exact saved width, height, `width * height * 4` RGBA length, and RGBA bytes/digest. No WebP/JPEG or preview may satisfy a content reference.

Before any raster Blob is read or decoded, the complete document must pass an aggregate hydration preflight. `projectHydratedRgbaByteLength` is the safe-integer sum of `rgbaByteLength` for every logical main-frame, tween-endpoint, and motion-sprite materialization. Every logical occurrence counts even when two occurrences reference the same asset. Physical immutable sharing/copy-on-write may reduce real allocation as an engineering optimization, but it cannot change this capacity result or admit an over-limit document. The sum must be at most 536,870,912 bytes (512 MiB), or the whole candidate rejects as `project_too_large` with Blob-read, PNG-preflight, and native-decode counts all zero. This is separate from stored-byte capacity.

Every raster then follows this exact bounded order before Save verification or Open hydration:

1. Before reading a Blob into memory, require `Blob.size === encodedByteLength`, `encodedByteLength > 0`, and the encoded asset/candidate to be within the accepted 128 MiB project limit.
2. Read the bounded encoded bytes once, recheck the exact length, compute lowercase SHA-256, and require equality with `encodedSha256`.
3. Run the dependency-free PNG preflight below over those bytes. No `createImageBitmap`, `Image`, canvas dimension assignment/draw, or other allocating native decode path may be invoked before it passes.
4. Invoke the injected browser-native decoder exactly once.
5. Independently require decoded width/height, safe `width * height * 4`, RGBA byte length, and RGBA SHA-256 to equal the strict asset record. An encoder result is not publishable and an opened candidate is not mountable until this second check passes.

The accepted PNG profile is exact and intentionally narrow: the 8-byte PNG signature; first and unique `IHDR` with length 13 and valid CRC-32/IEEE; unsigned big-endian width/height each 1–16,384 and exactly equal to the asset record; bit depth 8; color type 6 (RGBA); compression 0; filter 0; interlace 0; zero or one pre-`IDAT` ancillary chunk of each of `cHRM` (32 bytes), `gAMA` (4), `sRGB` (1), and `pHYs` (9), in any order; one to 4,090 consecutive non-empty `IDAT` chunks; one unique zero-length terminal `IEND`; no trailing bytes; and at most 4,096 chunks total. The bounded scanner validates ASCII chunk-type bytes, checked unsigned lengths/cursor arithmetic, complete framing, and CRC-32/IEEE for every chunk. It rejects `PLTE`, unknown critical or ancillary chunks, duplicate/out-of-order chunks, empty/excessive/nonconsecutive/missing `IDAT`, an excessive total chunk count, truncated data, bad CRC, data after `IEND`, and trailing bytes. It never inflates image data and is not a general PNG library.

Before multiplication, require `width <= Math.floor(268435456 / 4 / height)`; only then compute and require `width * height * 4 === rgbaByteLength <= 268435456`. Zero, overflow, a header/record mismatch, or an impossible decoded length fails before native decode. Error mapping is exact: aggregate hydration-cap rejection is `project_too_large` before Blob read/preflight/decode; Blob/record encoded-length or SHA mismatch is `asset_digest_mismatch` before PNG preflight/decode; signature/IHDR/framing/CRC/dimension/overflow failure is `invalid_png` after one preflight and zero decode; disallowed profile/chunk kind/order/count is `unsupported_png` after one preflight and zero decode; a structurally accepted PNG that fails native decode, canvas allocation/draw, or RGBA read-back is `decode_failed` after one decode invocation; and decoded dimension, RGBA-length, or RGBA-SHA mismatch is `asset_digest_mismatch` after one decode invocation. Encoder failure before a record exists is `encode_failed`. The installed-browser validator must prove that this spec's own `canvas.toBlob("image/png")` output conforms, including non-empty/count-bounded `IDAT`. If the sanctioned browser encoder does not conform, Phase 1 stops and returns the exact blocker rather than widening the profile silently.

Open hydration processes accepted rasters sequentially in descending `rgbaByteLength` order, breaking ties by raw UTF-16 `assetId`. It retains only verified final `ImageData` materializations, holds at most one encoded byte buffer/native decoder result/scratch canvas at a time, closes an `ImageBitmap` and drops scratch references before advancing, and never publishes a partial workspace. The aggregate sum counts logical retained materializations, not merely unique asset blobs. A browser implementation cannot promise the decoder's private allocation size, so the proof asserts this application-owned allocation/release policy and the 512 MiB retained-RGBA ceiling rather than claiming control of browser internals.

For audio, the only current supported MIME is `audio/wav`, matching the traced synthesizer. A non-null input must be exactly canonical `data:audio/wav;base64,<RFC4648 payload>` with standard alphabet/padding, no whitespace or media-type parameters, and at most 44,739,244 base64 characters (32 MiB decoded). The parser validates the prefix/base64 length and form before decoding, decodes once, verifies `byteLength`/SHA-256, and stores the bytes once as the audio asset. Hydration reconstructs the exact same canonical prefix/base64 string and verifies its equality. Any other MIME, URL scheme, malformed/noncanonical base64, dangling reference, or asset MIME/length/digest mismatch fails closed. A null logical `audioDataUrl` creates no audio asset.

Asset IDs may be deterministic content IDs, but deduplication is an engineering optimization, not a required visible outcome. No implementation may weaken decode equality to gain capacity.

### 4.3 In-scope document fields

The strict document preserves:

- `activeTool`, brush size, eraser size, fill color, shape type;
- timeline FPS, active layer ID, current frame index, selected timeline index, onion setting;
- layer IDs, names, order, array order, and every timeline cell;
- frame ID, kind, cell type, state ID, blank flag, tween-end flag;
- references for main raster and tween-end raster;
- position motion-tween mode, stage dimensions, sprite raster reference, start origin, and end origin;
- one sound attachment persistence counterpart with exactly `id`, `title`, `description`, `timingFeel`, `intensityFeel`, `audioDataUrl`, `contentType`, `speechText`, `sourceTask`, and `attachedAt`, as defined below;
- text object ID, text, x/y, width, flip flags, rotation, font family, font size, color, bold, and italic;
- next frame and layer counters.

The exact V2 sound shape is:

```ts
type DrawingSoundAttachmentV2 = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl: { assetId: string } | null;
  contentType: "sfx" | "voice-placeholder";
  speechText: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};
```

The non-null V2 `audioDataUrl` value is the storage representation of that same logical field: an asset reference, not a second product field or a mounted URL string. Snapshotting maps the live `audioDataUrl: string | null` to `{assetId}`/null; the referenced audio asset owns exact `mimeType:"audio/wav"`, length, digest, and Blob bytes; hydration reconstructs the live string. Every other live field round-trips without trimming, default substitution, or semantic rewriting: `contentType` stays exactly `sfx` or `voice-placeholder`; `speechText`, `timingFeel`, and `intensityFeel` retain their exact string/null values; `sourceTask` remains exactly `generate-sounds`; and `attachedAt` retains its exact accepted UTC ISO-8601 string. No cross-field rule forces audio or speech to exist: current SFX synthesis can fail and leave null audio, and voice placeholders can be null.

V2 does not contain `optionId`, `durationSeconds`, a separate `source`, or an attachment-level MIME field. Those are not fields in the live stored/workspace attachment. Any such key, any other unknown key, an unknown `contentType`, or a non-`generate-sounds` `sourceTask` fails as `invalid_record` rather than being dropped. For strict V1 compatibility only, the current hydrate defaults are preserved before constructing V2: absent/null `audioDataUrl` becomes null; absent/null `contentType` becomes `sfx`; absent `speechText`, `timingFeel`, or `intensityFeel` becomes null. All other required V1 fields must be valid, and any future/unknown sound shape fails closed.

Array order is semantic. A `null` bitmap stays null. Blank/empty/hold/keyframe/tween invariants must match the traced editor model. Unknown/unsupported cell, tween, sound, or text variants fail closed.

The selected/current indices needed to resume are preserved. Playback always opens paused. Undo/redo history, camera pan/zoom, current lasso/selection handles, clipboard, gesture/transient canvases, panel tabs, chat transcript, decoded audio/cache objects, and timers are session-only.

### 4.4 Canonical digest and byte accounting

`documentDigest` is lowercase SHA-256 of UTF-8 canonical JSON containing the structured document plus an ordered manifest of every referenced asset's semantic digest and length. Object keys use raw UTF-16 code-unit ascending order; arrays retain schema order; JSON escaping follows `JSON.stringify`; strings are NFC; finite safe integers retain decimal form; `-0`, non-finite numbers, lone surrogates, `undefined`, holes, functions, and non-plain objects reject. Binary bytes are represented in the manifest by type, length, and digest, never by base64.

The version record's `storedByteLength` is computed before opening IndexedDB as:

1. canonical UTF-8 bytes of the complete record with each Blob replaced by its exact byte length/digest descriptor;
2. plus every encoded raster/audio Blob byte length.

Managed collection size separately adds every active head/version size, auxiliary canonical UTF-8 byte length, disposable preview Blob byte length, and legacy-delete tombstone canonical UTF-8 byte length. Inactive candidates are not user capacity, but the repository must remove known orphans before another write; physical browser quota can still fail while both old and candidate versions coexist. A non-null sound contributes its audio Blob bytes exactly once plus canonical attachment/reference/MIME metadata; its transient base64 string is not persisted or double-counted. Null audio contributes no asset bytes. Phase 1 fixtures freeze the exact formulas and boundary values.

Accepted managed limits under D-0013:

- project candidate: at most 134,217,728 bytes (128 MiB);
- all V2 records, selected previews, and auxiliary data: at most 536,870,912 bytes (512 MiB);
- at most 64 Drawing projects;
- project hydrated logical raster materializations: at most 536,870,912 RGBA bytes (512 MiB), computed before any asset read/decode and counting repeated logical references under §4.2;
- each raster: dimensions 1–16,384, division-guarded exact RGBA length, and at most 268,435,456 decoded bytes;
- each audio asset: at most 33,554,432 bytes (32 MiB), MIME exactly `audio/wav`, and included in both project and collection ceilings; and
- every tombstone: counted in managed bytes but not in the 64-project count.

These are application ceilings, not a promise that a browser grants that quota. `navigator.storage.estimate()` is advisory only and cannot produce a success claim. An earlier browser `QuotaExceededError` remains a typed failure.

### 4.5 AI memory, previews, and reusable libraries

- Sanitized `DrawingAiProjectMemory` remains optional local auxiliary data scoped by project ID. It is excluded from `documentDigest`, included in managed byte accounting, copied for Save As/Duplicate, removed inside the authoritative IndexedDB Delete transaction, and updated independently from artwork publication; if it is independently invalid, it is omitted with a local diagnostic rather than repaired silently.
- This spec does not change the remote memory route, prompts, models, search, or retention. Default proof intercepts that route and proves zero Supabase/network activity.
- Project-card previews may remain lossy and may be absent. They are never used to hydrate content and are excluded from fidelity acceptance.
- Reusable imported-asset and symbol-library source entries stay session-only. Raster pixels already placed into frames are preserved. The Phase 2 UI must not claim that the reusable library itself was saved.

### 4.6 Version-1 compatibility and migration

The exact legacy key remains `da_saved_drawing_projects`. A strict compatibility reader returns root status `absent | valid-array | corrupt-root | read-failed`. A valid array preserves order and classifies every entry as `valid-v1 | corrupt-entry | unsupported`; one invalid entry is visible as unavailable and cannot silently remove valid neighbors. A malformed root blocks legacy catalog mutation because no safe rewrite basis exists. The reader never turns malformed storage into `[]` and never silently filters a record.

Valid version-1 projects:

1. remain listed as **Older local project**;
2. open through the existing hydration semantics because pixels already discarded by the old format cannot be recovered;
3. display once per project: **This older project may contain reduced-quality saved artwork. Saving it now will protect its current reopened version in the new local format.**;
4. do not migrate on list or Open;
5. migrate only on the first explicit Save/Save As after the project has fully hydrated;
6. stage and strict-read-back the complete V2 version, then atomically publish its head before any legacy cleanup;
7. prefer the V2 record for listing/opening after success, which hides/deduplicates the same-ID legacy entry while cleanup is pending; and
8. attempt same-ID legacy cleanup only after candidate read-back and active-head transaction completion. Its exact maintenance result is `not-needed | cleaned | pending`; `pending` never retracts the successful V2 Save, exposes a second card, or alarms the user.

Migration and Delete use the same strict same-ID legacy-cleanup helper under the repository-owned same-origin Web Lock `diamond-drawing-legacy-maintenance-v1` acquired with `ifAvailable:true`. Its bounded JSON scanner returns each top-level array entry's exact UTF-8 source slice plus its strictly parsed value. It removes only the slice whose exact legacy `id` matches the requested V2 `projectId` and, when supplied, whose canonical record digest matches the expected digest. The candidate root is `[` plus the untouched raw slices for every unrelated entry joined by one comma plus `]`; therefore each unrelated/neighbor record's complete raw UTF-8 entry bytes and every payload string are copied byte-for-byte even though outer array whitespace/delimiters may change. Immediately before one synchronous Web Storage `setItem`, re-read the raw root and require its SHA-256 to equal the captured root digest; after write, strict-read it and require the candidate root digest, target absence, and every preserved raw entry-slice digest. A missing lock, write/read-back/concurrency/parse mismatch performs no further cleanup and returns `pending`. Successful cleanup intentionally removes the targeted legacy record; it does **not** claim the whole legacy root or removed target stayed byte-identical. Migration needs no tombstone because the published V2 head owns deduplication; Delete uses the tombstone in §4.8 because no V2 head remains to own deduplication.

The detailed maintenance result is exactly `{status:"not-needed", legacyPresence:"absent"}`, `{status:"cleaned", legacyPresence:"absent"}`, or `{status:"pending", legacyPresence:"present" | "unknown", code:"legacy_corrupt" | "legacy_read_failed" | "storage_write_failed" | "maintenance_required"}`. A failure before `setItem` can prove `present` when the target was safely parsed. Once `setItem` returns, a later read-back exception cannot prove whether the atomic write committed, so it must report `unknown`; it must never claim the targeted legacy bytes were preserved. In either case, Web Storage atomicity plus the raw-slice candidate guarantees every unrelated entry is either its exact old slice or its exact copied slice.

A pending migration cleanup needs no separate record: it is deterministically present when a valid V2 head and valid legacy entry share the same ID. The immediate post-Save attempt and the bounded Open Project maintenance pass in §4.8 may retry that inferred ID through the same helper. V2 remains authoritative throughout.

Corrupt, unsupported, or unreadable records remain byte-identical absent an explicit safely targeted action. Unless a same-ID tombstone from a completed authoritative Delete (V2 or exact classified legacy-only) intentionally suppresses the legacy card, the UI keeps the unavailable record visible and says **This project can’t be opened safely. Its saved data was not changed.** It offers Retry. Delete with confirmation is enabled for a readable V2 head through §4.8, or for a separately classified legacy entry only when its exact `id`, record boundary/digest, and neighbor-safe rewrite basis are all known; corrupt-root/read-failed legacy storage cannot be selectively deleted and keeps Delete unavailable. The UI does not auto-save, auto-migrate, rename, duplicate, or overwrite that record. Project-file export/recovery tooling is a later spec.

### 4.7 Save state and atomic semantics

The mounted project exposes `not-saved | saved | unsaved | saving | too-large | failed`. The accessible visible copy is:

| State | Copy |
| --- | --- |
| Fresh | `Not saved on this browser` |
| Opened/clean | `Saved on this browser` |
| Changed | `Unsaved changes` |
| In flight | `Saving…` |
| Success | `Saved on this browser` |
| Capacity | `This project is too large to save on this browser. Your last saved version is still safe.` |
| Other failure | `Couldn’t save on this browser. Your last saved version is still safe.` |

Whenever a project is saved/clean, adjacent persistent helper text says: **Local only — not cloud-synced, cross-device, or automatically recovered.** Open Project must replace the current heuristic `Safe` label with the record's exact encoded-size status relative to the accepted limits; it must not imply browser quota is guaranteed.

Every persisted-field mutation increments `documentGeneration`. Save captures `{workspaceInstanceId, projectId, documentGeneration, expectedStorageRevision, preparedRecord}`. Encoding, strict audio conversion, validation, capacity checks, encoded raster length/digest verification, PNG preflight, and raster native-decode/RGBA verification finish before any write. The repository then:

1. removes only hash-identified inactive candidates left by this repository, or fails without changing the head;
2. writes the immutable candidate version without changing the head;
3. strict-reads the candidate and compares its complete record/document/asset digests;
4. starts one head-publication transaction, rechecks expected revision, collection capacity, and project-count limit, then swaps/creates the head; and
5. reports success only after that head transaction completes.

No post-publication read-back is part of the success predicate: the already verified candidate plus IndexedDB transaction completion is the durable boundary. This avoids claiming that a read failure after an irreversible head swap preserved the old active state.

On success, the editor updates the saved baseline to the captured document digest only if the same project instance remains mounted. An intervening edit remains `unsaved`; returning exactly to the captured digest may become `saved`. Project switch/unmount makes the completion a UI no-op. A stale storage revision reports a conflict and does not overwrite newer data.

Any candidate/write/read-back/head-CAS failure leaves the previous active head/version, other projects, legacy bytes, saved baseline, and current editor state unchanged. A failed staged candidate remains invisible and is eligible only for hash-bound cleanup. The UI must never emit success before head-publication `oncomplete`.

The exact stable error codes are `invalid_record`, `unsupported_version`, `legacy_corrupt`, `legacy_read_failed`, `asset_missing`, `asset_digest_mismatch`, `invalid_png`, `unsupported_png`, `encode_failed`, `decode_failed`, `project_too_large`, `collection_too_large`, `project_limit_reached`, `quota_exceeded`, `storage_read_failed`, `storage_write_failed`, `transaction_aborted`, `stale_revision`, `candidate_readback_mismatch`, `id_collision`, `project_not_found`, and `maintenance_required`. Unknown codes reject at the contract boundary. The UI may group Save/Open errors into the two safe messages above, but diagnostic/proof results retain the exact code and never raw project content. `maintenance_required` is internal/retryable evidence; it cannot turn an already committed authoritative Delete into a user-visible Delete failure.

The exact Delete result is either `{ status:"failed", code:"project_not_found" | "legacy_corrupt" | "legacy_read_failed" | "storage_read_failed" | "storage_write_failed" | "transaction_aborted" | "stale_revision" }` before authoritative completion, or `{ status:"deleted", legacyCleanup:"not-needed" | "cleaned" | "pending" }` afterward. `legacy_corrupt`/`legacy_read_failed` are possible only while proving a legacy-only target before its tombstone transaction; `storage_read_failed` refers to authoritative IndexedDB/head/tombstone state. A V2 Delete never depends on a new localStorage read. `pending` is a successful local Delete with hidden maintenance remaining, not an error or a reason to restore the card.

### 4.8 Save As, rename, duplicate, delete, and Open

- **Save** updates the current ID using expected revision.
- **Save As** requires a non-empty title, creates a fresh collision-checked ID/revision 1, preserves the source project, and mounts the new saved project only after candidate read-back and active-head publication.
- **Rename** changes title/updated time/revision in one transaction; content digest is unchanged. Failure preserves old title.
- **Duplicate** creates a new ID/title/timestamps with exact content and auxiliary bytes. It is subject to the same limits.
- **V2 Delete** uses the same-ID legacy digest already supplied by a safely classified catalog snapshot when available; unavailable/failed/corrupt legacy classification supplies null and is post-commit maintenance uncertainty, not a prerequisite or fresh localStorage read. It opens one IndexedDB read-write transaction spanning heads, versions, previews, auxiliary, and legacy-delete tombstones; within that transaction it rechecks the expected V2 revision, deletes the authoritative head plus every same-project V2 version/preview/auxiliary record, and writes the exact tombstone from §4.1. Transaction completion is the only V2 Delete success boundary.
- **Legacy-only Delete** is allowed only for a strict catalog entry with exact `id`, raw entry-slice digest, canonical record digest, and captured root digest. Under the §4.6 lock it re-reads and revalidates that target without mutation; failure returns `legacy_read_failed`/`legacy_corrupt`. It then opens one IndexedDB transaction, rechecks that no V2 head owns the ID, and writes the tombstone containing the expected legacy record digest. That tombstone transaction—not localStorage cleanup—is the authoritative legacy-only Delete boundary and immediately hides the card. `project_not_found` applies only when neither the expected V2 authority nor the exact classified legacy-only target exists.
- Any failure/abort before the applicable authoritative transaction completes returns `failed`, reports **Couldn’t delete this project. It is still saved on this browser.**, and leaves the visible authoritative project and every IndexedDB/legacy/neighbor record unchanged.
- After that transaction commits, the UI may truthfully announce **Project deleted from this browser.** The tombstone makes catalog merge hide/deduplicate every same-ID legacy card before and after reload. Catalog loading fails closed if tombstones cannot be read; it must never fall back to an unfiltered legacy list. Same-ID legacy cleanup then runs separately through §4.6 and returns `not-needed`, `cleaned`, or `pending`. `pending` is recorded as a bounded, non-user-alarming maintenance result; it does not retract Delete or let the card reappear.
- Delete makes one immediate cleanup attempt. A later Open Project mount may attempt at most eight pending IDs from the union of tombstones and inferred V2-head/legacy duplicates, in raw UTF-16 code-unit ascending order and once each for that mount; there is no timer/background loop. Tombstoned maintenance may remove a legacy entry only when the exact ID and captured non-null `legacyRecordDigest` still match. A mismatch/corrupt/read/write/lock failure always leaves the entry hidden; pre-`setItem` failure proves it unchanged, while post-`setItem` read-back failure records presence `unknown` and makes no target-byte claim. If the entry is absent, or cleanup succeeds and strict read-back proves it absent with every unrelated raw record-slice byte-equivalent, a separate IndexedDB transaction removes the tombstone. Tombstone-removal failure leaves harmless pending maintenance. Successful cleanup intentionally removes the target legacy entry, so only unrelated/neighbor legacy record slices—not the removed target or whole root string—must stay byte-identical under §4.6. Existing remote-memory deletion behavior is outside the local success transaction and is not expanded; tests intercept it.
- **Open** strict-reads and validates before mounting. Decode/integrity failure leaves the Open screen and current workspace unchanged. Successful Open mounts paused with empty session history and the persisted current/selected positions.
- **Refresh** returns Home as today; Open Project is the explicit reopen path.

## 5. Non-Goals

- cloud save, sync, collaboration, or cross-device recovery;
- Supabase reads or writes;
- autosave, drafts, crash recovery, or background persistence;
- project-file import/export or recovery export;
- video/GIF/animation export;
- AI behavior, prompts, models, search, memory redesign, or paid requests;
- Stick project persistence;
- reusable source-asset or symbol-library persistence;
- Main Interface, Drawing tool, timeline, or canvas architecture redesign;
- broad `DrawingWorkspace.tsx` refactor;
- authentication, deployment, billing, database migrations, or service workers;
- unlimited frames, projects, or storage;
- retroactively recovering pixels already lost by a version-1 save;
- changing the Phase 1.5 tester core or its accepted proof.

## 6. Canonical User Flow

1. Start in a fresh isolated browser profile with all external traffic denied.
2. Home → New Project → Drawing Animation.
3. Confirm `Not saved on this browser`.
4. Create the checked-in representative project: at least two layers and four non-empty cells including distinct raster artwork, a tween endpoint and position motion tween, text, and sound fixtures that exercise all ten live attachment fields plus canonical WAV bytes and null audio.
5. Set non-default FPS/timing, active layer, current frame, selected frame, onion/tool settings.
6. Choose Save.
7. Observe `Saving…`; while the deferred test write is pending, make one additional edit.
8. Release the transaction. Confirm the last durable snapshot succeeds but the newer edit leaves `Unsaved changes`.
9. Save again and confirm `Saved on this browser` only after candidate verification and durable active-head completion.
10. Reload to Home and choose Open Project.
11. Confirm one Drawing card with the saved title; card preview may be absent without affecting availability.
12. Open it. Confirm playback is paused and every in-scope structured field, all ten sound-field values, reconstructed canonical `audioDataUrl`, audio Blob MIME/bytes, and decoded raster digest matches the saved checkpoint. The proof ledger must show aggregate hydration overflow rejected before any raster Blob read, every PNG preflight-class fixture rejected before native decode, and structurally accepted corrupt/post-decode fixtures mapped to their exact later-stage outcomes.
13. Select and play frames; visibly confirm distinct layers, artwork, text, timing, and motion tween.
14. Edit one raster/text value, save again, reload/open, and confirm the exact change plus unchanged neighbors.
15. Save As under a new title. Confirm two independent records and no shared mutation.
16. Rename the copy, duplicate it, open the duplicate, and confirm exact content.
17. Delete only the V2 copy, then repeat with an exact classified legacy-only fixture. Prove authoritative transaction failure leaves each card/data unchanged; prove authoritative success removes the requested card while `cleaned` or `pending` legacy maintenance cannot affect the original or let a same-ID hidden legacy card reappear.
18. Open a valid version-1 fixture, see the honest legacy warning, Save, and confirm V2 read-back/head publication succeeds before separately reported same-ID legacy cleanup.
19. Exercise corrupt, unsupported, too-large, quota, encode, strict audio, PNG preflight, native decode, validation, stale-revision, read-back, aborted-transaction, storage-read, authoritative Delete, and legacy-maintenance failures.
20. Every Save/migration-before-publication/authoritative-Delete failure displays honest copy, produces no success announcement, and preserves current editor bytes, last-good V2 data, targeted legacy data, and all neighbors. After a successful authoritative Delete, a cleanup failure instead proves V2 absent, tombstone present, target legacy hidden with presence honestly `present` or `unknown`, and neighbors byte-identical; successful cleanup may remove only that target.
21. Run Home/New/Stick, Stick/Creator/Back, Drawing project operations, Drawing timeline/playback, disabled Drawing tasks, and mocked Drawing Generate Frames regressions.
22. Assert zero OpenAI/search/Supabase/remote request and complete tester cleanup.

## 7. Current and Proposed Execution Paths

### 7.1 Current

```text
File → Save / Save As
  → DrawingTopBar callback
  → DrawingWorkspace.persistProject
  → saveCurrentFrameSnapshot
  → createPersistedProjectSnapshot
  → serializeTimelineFrame
       bitmap/tweenEndBitmap = null
       content fallback = compact WebP preview URL
  → saveStoredDrawingProject
  → read/replace whole localStorage array
  → optional retry after clearing all card previews
  → “Project saved” toast

Home → Open Project
  → OpenProjectBrowser.readStoredDrawingProjects
  → app/page.tsx activeDrawingProject
  → DrawingWorkspace initial state
  → async preview URL decode/hydration
  → centered/downscaled decoded raster may become editable state
```

### 7.2 Proposed

```text
File → Save / Save As
  → capture immutable document generation
  → exact structured snapshot
  → preflight aggregate logical hydrated RGBA ceiling
  → validate exact sound fields
       null audio → null reference
       canonical WAV data URL → Blob + MIME/reference
  → encode each authoritative raster as lossless PNG
  → verify encoded length/SHA-256
  → dependency-free PNG signature/IHDR/chunk/CRC preflight
  → native decode and compare width/height/RGBA digest
  → build strict record + semantic digest + byte count
  → stage immutable version without changing active head
  → strict candidate read-back + digest equality
  → atomic active-head CAS transaction
       compare storage revision / collection limits
       publish exactly one active version pointer
  → head transaction complete
  → publish saved baseline and “Saved on this browser”

Home → Open Project
  → async repository list + strict legacy classification
  → strict record read
  → preflight aggregate logical hydrated RGBA ceiling
  → verify encoded bytes + PNG preflight before native decode
  → decode exact RGBA + reconstruct canonical sound data URL
  → build complete workspace candidate
  → one mount, paused, empty session history

Delete V2 or exact classified legacy-only project
  → V2: use catalog legacy digest/null; no fresh localStorage dependency
  → legacy-only: lock + revalidate exact target/root without mutation
  → one IndexedDB transaction
       V2: recheck/remove head/versions/preview/auxiliary
       legacy-only: recheck no V2 head
       write same-ID legacy tombstone
  → transaction complete → truthful local Delete success
  → separately attempt same-ID legacy cleanup
       not-needed/cleaned → remove tombstone in later transaction
       pending → keep tombstone; legacy stays hidden; retry later
```

## 8. Data, AI, Cost, Security, and Privacy Impact

| Topic | Proposed disposition |
| --- | --- |
| Local schema | New strict version-2 Drawing record in IndexedDB; version-1 localStorage remains read-only compatibility input until an explicit successful migration Save. |
| Fidelity | Pixel-exact decoded RGBA; exact structured sound-field values; exact supported audio Blob bytes/MIME and reconstructed canonical data URL; exact structured-data round trip for §4.3. Encoded PNG byte equality across browsers is not promised. |
| Capacity | Recommended 128 MiB stored/project, 512 MiB managed total, 64 projects, and 512 MiB logical hydrated RGBA/project; audio Blob and tombstone bytes are counted; browser quota may fail earlier. |
| AI | No task, prompt, model, executor, search, or provider change. Local sanitized memory is auxiliary only. |
| External requests | Zero in default/required proof. Remote memory requests are intercepted locally. |
| Cost | $0; no model, search, package download, service, or paid request. |
| Privacy | Project raster, text, audio, metadata, and optional sanitized memory stay in that browser profile. UI states that there is no cloud/cross-device recovery. |
| Logs | No raw project/raster/audio content in persistent application logs. Proof uses fixed-fixture IDs, hashes, counts, and screenshots only. |
| Corruption | Fail closed. Aggregate hydration overflow rejects before raster reads; PNG framing/profile/dimension hazards reject before native decode; unknown sound shapes reject rather than drop. Authoritative Delete (V2 or exact classified legacy-only) completes only in IndexedDB, while same-ID legacy cleanup is tombstoned best-effort maintenance. |
| Concurrency | Expected storage revision prevents two mounted writers from silently overwriting one another. |

## 9. Touch Matrix

| System/file | Intended change | Phase | Protected behavior |
| --- | --- | --- | --- |
| `src/lib/drawingProjectV2Contract.ts` (new) | Strict record/document/asset/result types and parsers. | 1 | No runtime wiring. |
| `src/lib/drawingProjectV2Canonical.ts` (new) | Canonical bytes, hashing, byte accounting. | 1 | No Stick/SPEC-0001 helper change. |
| `src/lib/drawingProjectV2Repository.ts` (new) | Result-based staged-version/head-publication plus authoritative Delete/tombstone/maintenance semantics over injected adapters. | 1 | Existing localStorage path remains active. |
| `src/lib/drawingProjectIndexedDb.ts` (new) | Browser IndexedDB adapter with transaction completion/abort/read-back and the exact tombstone store. | 1 | No visible Save/Open wiring. |
| `src/lib/drawingProjectV1Compatibility.ts` (new) | Strict legacy classification/migration preparation plus raw-slice-preserving same-ID cleanup candidate construction over injected bytes. | 1 | No implicit write; existing key is untouched until an explicit Phase 2 operation invokes the accepted adapter. |
| `src/lib/drawingProjectRasterCodec.ts` (new) | Bounded dependency-free PNG preflight plus browser-native encode/decode and semantic digest interface. | 1 | Current preview helpers unchanged. |
| `src/lib/drawingProjectAudioCodec.ts` (new) | Exact canonical WAV data-URL ↔ Blob/MIME/reference conversion with bounded validation. | 1 | No sound generation/playback change. |
| `src/lib/drawingProjectStorage.ts` | Preserve exported legacy types while delegating list/operations and same-ID cleanup during Phase 2. | 2 | Version-1 projects remain accessible; no silent filtering or cross-storage atomicity claim. |
| `src/components/workspace/DrawingWorkspace.tsx` | Async Save/Save As, V2 snapshot/hydration, state/copy, migration. | 2 | Drawing tools, canvas, timeline, history, AI executor behavior. |
| `src/components/workspace/DrawingTopBar.tsx` | Accessible save-state presentation; pending button behavior. | 2 | Existing menus/title and non-save controls. |
| `src/components/open-project/OpenProjectBrowser.tsx` | Async V2/legacy/tombstone list, typed failures, safe operations, and truthful Delete/maintenance presentation. | 2 | Drawing/Stick tabs and current navigation. |
| `app/page.tsx` | Pass validated V2/legacy open candidates through existing view switch. | 2 | Home/New/Stick/Creator and non-project screens. |
| `src/lib/ai/drawingProjectAiMemorySync.ts` | Intentionally unchanged. | — | Remote boundary unchanged; proof intercepts it. |
| `src/components/workspace/DrawingCanvas.tsx` | Intentionally unchanged. | — | Phase 1.5 protected pixel/resize behavior. |
| `scripts/spec0001-browser/**` and `scripts/runSpec0001BrowserProof.ts` | Intentionally unchanged/frozen. | — | Accepted Phase 1.5 tester and evidence. |

## 10. Phase and Authorization Model

### 10.1 Activation and concurrency gate

SPEC-0002 is Approved and active for this bounded work. Phase 1 is Authorized but Not started; Phase 2 remains Unauthorized/Not started. The 2026-08-15 activation audit recorded:

1. canonical `main` and local `origin/main` both at `365e68fe98b27e993a1c5645c3e28c7b428c6f33`, ahead/behind `0/0`, with a clean canonical worktree and index;
2. SPEC-0001 has no active executor or architect, while its Phase 2 and later phases remain Unauthorized/Not started;
3. every Phase 1 implementation path in §11.2 is new and does not overlap SPEC-0001 runtime files, the shared tester core, this approval worktree, or current control-plane ownership;
4. implementation, after separate publication/integration of this approval, must use one new exclusive worktree and one Plan-mode Spec Executor from the then-current canonical-main SHA; and
5. any future runtime, tester-core, worktree, or control-plane overlap is a hard stop until a fresh Project Manager conflict decision.

Phase 1 may proceed only after the approval record is published/integrated and its new task refreshes this audit. Phase 2 must not overlap any task touching shared app navigation, Drawing regressions, or browser proof infrastructure.

### 10.2 Universal lifecycle

Each phase uses:

```text
fresh Plan-mode Spec Executor task/worktree at integrated canonical-main SHA
→ implement only one authorized phase
→ deterministic proof + technical proof manifest
→ Implementation Review Packet and complete stop
→ Arthur/PM accept or reject
→ accepted worktree transfers exclusively to Control Plane Architect
→ canonical control-plane evidence + final closeout
→ Control Plane Architect packet and stop with empty index
→ separate explicit Git-publication instruction
→ integration into canonical main
→ only then may the next phase be separately authorized
```

Neither packet authorizes staging, commit, merge, push, or publication. The Spec Executor never edits canonical docs. The Control Plane Architect never changes accepted runtime/test bytes. SPEC-0001 lifecycle/status is not changed by SPEC-0002 work.

### 10.3 Phase table

| Phase | Status | Exact observable outcome | Dependencies | Hard stop |
| --- | --- | --- | --- | --- |
| 1 — Safe save format and storage engine | Authorized; Not started | Strict V2 records/assets/sounds, pre-decode PNG safety, legacy classification, tombstoned Delete maintenance, capacity math, and injected transaction engine round-trip fixtures exactly and preserve the applicable last-good/neighbor bytes under every failure. Existing UI remains unchanged. | D-0013 accepted owner outcomes; activation record is published/integrated; the implementation task refreshes the conflict audit. | Stop after offline/browser-engine proof manifest and packet; no UI wiring or native decode after a failed preflight. |
| 2 — Real Save/Open wiring and browser proof | Unauthorized; Not started | Real Drawing Save/Open/Delete uses the accepted engine, shows truthful state, reopens representative content exactly, migrates valid legacy only on Save, never resurfaces a tombstoned legacy card, and passes protected flows offline. | Phase 1 accepted, Verified, published/integrated; new conflict audit; accepted Phase 2 tester plan. | Stop after full real-browser manifest and packet; no autosave/cloud/export/Stick work. |

### 10.4 Control-plane closeout paths, separate from implementation

After an accepted phase and exclusive worktree transfer, only the Control Plane Architect may update the following, and only where that phase's accepted evidence changes the record:

- `docs/specs/0002-lossless-local-drawing-save-and-reopen.md`;
- `docs/specs/README.md`;
- `docs/TODO.md`;
- `docs/CURRENT_STATE.md`;
- `docs/SESSION_HANDOFF.md`;
- `docs/changelog.md`;
- `docs/DECISIONS.md` only for a decision Arthur explicitly accepted; and
- `project/project_structure.txt` only through `bash scripts/update_memory.sh`.

These paths are not Spec Executor permissions. The architect must also run `bash scripts/update_memory.sh`, `bash scripts/update_memory.sh --check-only`, both diff checks, the technical-manifest validator, a changed-path allowlist, and final status/index checks. No phase may change SPEC-0001 lifecycle text except to preserve an independently published fact from canonical main; any conflict stops the phase.

## 11. Phase 1 — Safe Save Format and Storage Engine

### 11.1 Status and outcome

Authorized; Not started. The exact result is a hidden, unwired V2 contract/repository whose checked-in fixtures prove semantic fidelity and failure safety. No visible application behavior changes. Implementation may begin only after D-0013 and this approval record are separately published/integrated, in a new Plan-mode Spec Executor worktree from the then-current canonical-main SHA.

### 11.2 Exact authorized implementation files

- `src/lib/drawingProjectV2Contract.ts` (new)
- `src/lib/drawingProjectV2Canonical.ts` (new)
- `src/lib/drawingProjectV2Repository.ts` (new)
- `src/lib/drawingProjectIndexedDb.ts` (new)
- `src/lib/drawingProjectV1Compatibility.ts` (new)
- `src/lib/drawingProjectRasterCodec.ts` (new)
- `src/lib/drawingProjectAudioCodec.ts` (new)
- `scripts/fixtures/drawing-persistence/v2/**` (new fixed, non-user fixtures)
- `scripts/validateDrawingProjectV2Contract.ts` (new)
- `scripts/validateDrawingProjectV2Repository.ts` (new)
- `scripts/validateDrawingProjectV1Compatibility.ts` (new)
- `scripts/validateDrawingProjectV2BrowserEngine.ts` (new; installed local Chrome/Playwright only, no app mount)
- `scripts/recordSpec0002Phase1Proof.ts` (new)
- `scripts/validateSpec0002Proof.ts` (new and frozen for Phase 2 consumption)
- `scripts/finalizeSpec0002Closeout.ts` (new; Control Plane Architect use only)
- ignored `output/spec-0002/phase-1/**`

No existing runtime file is authorized. No package/dependency/config change is authorized.

### 11.3 Implementation steps

1. Freeze strict types, invariants, stable error codes, canonical bytes, hashes, and capacity formula.
2. Implement browser-safe async SHA-256 with `globalThis.crypto.subtle`; Node validator independently cross-checks with `node:crypto` only inside scripts.
3. Implement the aggregate hydrated-RGBA preflight and the exact encoded-length/digest → PNG signature/IHDR/bounded-chunk/CRC preflight → injected native decode → RGBA equality pipeline in the raster codec. Aggregate overflow performs no Blob read; no canvas/native decode call is allowed on a failed PNG preflight; and no save wiring is added.
4. Implement strict canonical WAV data-URL ↔ Blob/MIME/reference conversion and exact ten-field sound materialization. No generator/playback change.
5. Implement strict legacy reader/cleanup candidate builder over supplied raw bytes; reads never write, and cleanup uses the exact lock/digest/neighbor rules in §4.6.
6. Implement repository over injected IndexedDB/Web Storage adapters with prepared candidate, strict staging read-back, active-head CAS, authoritative Delete+tombstone transaction, and explicit completion/abort/maintenance states.
7. Implement IndexedDB adapter without opening the DB at import time.
8. Add a local-browser engine validator that exercises the accepted native PNG encoder/decoder, decode-call counters, real ephemeral IndexedDB, tombstone catalog merge, and injected localStorage maintenance adapter without mounting Diamond Animator or contacting a remote host.
9. Add exact fixtures and negative matrix.
10. Record/validate proof, return packet, and stop.

### 11.4 Deterministic fixtures

- empty, representative, maximum-boundary, and non-wave/non-AI Drawing documents;
- multi-layer/four-cell document with main rasters, tween endpoint, motion sprite, text, and exact valid sound cases: SFX+canonical WAV, SFX+null audio, voice-placeholder+null audio, nullable/non-null `timingFeel`/`intensityFeel`/`speechText`, and V1 optional-field defaults;
- exact raw RGBA/PNG/WAV bytes, reconstructed canonical data URL, MIME, all ten logical sound fields, and golden digests;
- invalid sound cases: `optionId`, `durationSeconds`, `source`, attachment `mimeType`, or another unknown key; missing/wrong `sourceTask`; unknown `contentType`; malformed/noncanonical/oversized base64; HTTP(S), blob, image, or unsupported-MIME URL; missing/dangling asset; audio MIME/length/digest/reconstruction mismatch; and an unknown future attachment shape;
- PNG cases: valid native-browser RGBA8/non-interlaced transparent/opaque output; project hydrated-RGBA total at 512 MiB/+1 and repeated-reference counting; encoded length/digest mismatch; truncated/bad signature; missing/truncated/non-13-byte/bad-CRC `IHDR`; zero/over-limit/header-record mismatch; huge/overflow/decompression-bomb-style dimensions; unsupported bit depth/color/compression/filter/interlace/chunk; 4,090/4,091 IDAT and 4,096/4,097 total chunks; empty/nonconsecutive IDAT; malformed/duplicate/out-of-order chunk structure; bad chunk CRC/trailing bytes; recomputed-CRC corrupt `IDAT`; injected native/canvas/read-back failure; and injected post-decode dimension/RGBA-length/RGBA-digest mismatch. Every case freezes its exact error code plus Blob-read/preflight/native-decode counts;
- canonical byte vectors including Unicode, key order, negative zero, non-finite, lone surrogate, holes, and unknown keys;
- project size at limit and limit + 1; collection count 64/65 and byte cap/cap + 1;
- valid legacy V1, malformed JSON, wrong root, duplicate project ID, invalid nested data, unsupported version, read failure;
- stage abort, stage put throw, quota abort, candidate read-back mismatch, head-CAS abort, stale revision, orphan cleanup, neighbor record, and auxiliary/preview omission;
- Save As collision and rename/duplicate; V2 and exact legacy-only authoritative Delete failure at every preflight/store/tombstone/abort point; V2 Delete with failed/unavailable fresh legacy access still committing with `pending`; successful Delete with `not-needed`, `cleaned`, and `pending`; post-commit legacy read/corrupt/lock/write/pre-write mismatch/post-`setItem` read exception/digest mismatch with exact `present | unknown`; reload catalog deduplication; same-ID-only retry; tombstone byte accounting/ID reservation/removal failure; migration cleanup success/failure; and unrelated V2/legacy neighbors;
- mutation attempts against deep-frozen inputs.

### 11.5 Acceptance criteria

- Valid parse → canonicalize → store → read → parse yields exact structured equality and semantic digest equality.
- Every accepted PNG returns exact dimensions/RGBA bytes after one native decode. Aggregate hydration-cap and encoded-length/digest rejection occurs before the exact later stages; every PNG preflight rejection records native-decode count zero; structurally accepted corrupt-deflate/native-canvas failure and post-decode mismatch cases record one decode and no write/mount. Error codes/counts match §4.2 exactly in Node and bundled-browser validators.
- Every sound returns all ten live logical field values exactly; non-null audio returns exact `audio/wav` Blob bytes and the identical reconstructed canonical `audioDataUrl`; null audio remains null with no asset. Unknown fields/shapes never round-trip silently.
- Unknown/malformed/oversized/dangling/duplicate/unsupported input returns a stable typed error without writes.
- Save, migration-before-publication, and authoritative-Delete failures leave the target last-good record, current editor input, neighbor records, and legacy records byte-equivalent.
- After authoritative Delete commits, cleanup failure leaves V2 absent, tombstone present, same-ID legacy hidden with honestly recorded `present | unknown`, and every neighbor byte-equivalent; successful cleanup removes only the target and proves every unrelated legacy record's raw UTF-8 entry slice unchanged.
- Catalog merge cannot expose a tombstoned same-ID legacy card, including after reload or maintenance failure; tombstone-read failure fails the catalog closed.
- A successful Save is not reported before strict candidate read-back and active-head transaction completion.
- Legacy parsing never maps corrupt storage to an empty catalog.
- No import opens IndexedDB, localStorage, network, Supabase, or provider code.
- Existing UI and storage path remain byte-identical.

### 11.6 Verification commands

The checked-in `scripts/fixtures/drawing-persistence/v2/phase-1-proof-commands.json` contains this exact ordered workload. The proof recorder executes it with scrubbed OpenAI/Supabase environment values and `NEXT_TELEMETRY_DISABLED=1`, records argv/cwd/env allowlist/exit/stdout/stderr hashes, and rejects missing, reordered, reconstructed, or extra receipts:

```bash
node --experimental-strip-types scripts/validateDrawingProjectV2Contract.ts
node --experimental-strip-types scripts/validateDrawingProjectV2Repository.ts
node --experimental-strip-types scripts/validateDrawingProjectV1Compatibility.ts
node --experimental-strip-types scripts/validateDrawingProjectV2BrowserEngine.ts
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
git diff --check
git diff --cached --check
git status --short --branch
```

The executor invokes the orchestrator and independent validator exactly once each:

```bash
node --experimental-strip-types scripts/recordSpec0002Phase1Proof.ts --commands=scripts/fixtures/drawing-persistence/v2/phase-1-proof-commands.json --output=output/spec-0002/phase-1/proof-manifest.json
node --experimental-strip-types scripts/validateSpec0002Proof.ts output/spec-0002/phase-1/proof-manifest.json
```

Full lint must stay at or improve the accepted baseline of 6 errors/73 warnings and contain zero Phase 1 findings; it is not mislabeled as a repository pass.

### 11.7 Protected regressions and unchanged systems

Source-diff/static proof confirms no existing runtime, Drawing UI, localStorage key, Stick file, AI route, memory route, Phase 1.5 tester core, package, dependency, configuration, migration, or environment file changed. The Phase 1 local-browser check validates only the hidden codec/IndexedDB engine in an isolated loopback page; real-app behavior is deliberately not a Phase 1 claim.

### 11.8 Stop and handoff

Stop unless every deterministic gate passes, including exact sound fields, aggregate hydration reject-before-read proof, PNG reject-before-decode counts, authoritative Delete/tombstone maintenance, and neighbor-safe cleanup. Return the Spec Executor packet with exact base, changed allowlist, proof SHA, assertion counts, lint baseline, and zero external activity. Future forbidden work: wiring Save/Open/Delete UI, changing UI copy, migrating real storage, full-app browser proof, autosave, cloud, export, AI, Stick, and Phase 2.

## 12. Phase 2 — Real Save/Open Wiring and Browser Proof

### 12.1 Status, dependencies, and outcome

Unauthorized; Not started. It may begin only after Phase 1 is accepted, Verified, published, and integrated, plus a fresh SPEC-0001/file conflict audit. The observable result is the complete §6 flow in the real app, offline.

### 12.2 Exact authorized implementation files

- `src/lib/drawingProjectStorage.ts`
- `src/components/workspace/DrawingWorkspace.tsx`
- `src/components/workspace/DrawingTopBar.tsx`
- `src/components/open-project/OpenProjectBrowser.tsx`
- `app/page.tsx`
- `scripts/fixtures/spec0002-browser/v1/**` (new)
- `scripts/spec0002-browser/browserProofContract.ts` (new)
- `scripts/spec0002-browser/validatePhase2.ts` (new)
- `scripts/runSpec0002BrowserProof.ts` (new)
- `scripts/recordSpec0002Phase2Proof.ts` (new)
- ignored `output/spec-0002/phase-2/**`

Every accepted Phase 1 module/fixture/proof byte is read-only in Phase 2, as are `scripts/runSpec0001BrowserProof.ts`, `scripts/spec0001-browser/**`, `DrawingCanvas.tsx`, package files, and dependencies. The Phase 2 extension must bind the accepted Phase 1.5 core/hash and may invoke `npm run test:spec0001-browser` as a protected gate; it must not edit or overload that core. If real wiring exposes a Phase 1 semantic/engine defect or the new plan cannot run without changing the frozen core, stop and return the exact blocker for a separately authorized correction task.

### 12.3 Implementation steps

1. Add async repository list/open plumbing while preserving current view navigation.
2. Capture exact workspace content, preflight the aggregate logical hydrated-RGBA ceiling, convert the exact ten-field sound attachment through the accepted audio codec, and run encoded digest + PNG preflight + native decode/RGBA validation before write.
3. Add save-generation/revision race handling and accessible state copy.
4. Reject aggregate hydration overflow before any raster Blob read, preflight every remaining PNG before any native decode/canvas allocation, decode/verify all assets, reconstruct exact canonical sound data URLs, and only then perform one workspace mount.
5. Implement explicit legacy warning and Save-time migration.
6. Route Save As/rename/duplicate through typed transactional results; route Delete through the authoritative IndexedDB transaction and separately present/record `not-needed | cleaned | pending` legacy maintenance without a false failure or resurfaced card.
7. Add the separate versioned tester contract/plan with isolated IndexedDB/localStorage and strict fixture hooks.
8. Run deterministic predecessors, full visible flow, protected regressions, cleanup, proof recording, and stop.

### 12.4 Browser proof contract

The new tester extension uses installed pinned `playwright-core`/local Chrome, two isolated contexts/viewports (`1440×900`, `1024×768`), fail-closed browser/server/child network denial, mocked same-origin memory responses, and exact IndexedDB/localStorage fixture seeds. It records:

- visible actions and accessible status/copy;
- canonical document/asset/storage digests, not user raw bytes;
- IDB transaction begin/put/delete/tombstone/abort/complete/read-back counts;
- aggregate hydrated-RGBA arithmetic/repeated-reference count, sequential scratch lifecycle, PNG preflight/native-decode call counts, exact error code, and rejection stage;
- exact sound-field/data-URL/MIME/Blob digests;
- legacy raw-root digest plus every exact raw legacy-entry-slice digest before/after, tombstone state, catalog visibility, and maintenance result;
- generation/revision and stale-completion outcomes;
- HTTP/WebSocket/network ledger with zero remote traffic;
- screenshots at save state, open list, reopened content, failures, and final regressions;
- cleanup of contexts, profiles, servers, intercepts, temporary instrumentation, and output collisions.

Any temporary proof anchor must follow the Phase 1.5 byte-restoration standard: verified preimage, exact anchor only, `finally`/signal restoration, zero instrumentation-attributable final diff, and manifest evidence. No routable page/API or production import is allowed.

### 12.5 Deterministic and failure fixtures

Phase 2 consumes every Phase 1 fixture and adds UI scenarios for encoding delay/failure, edit-during-save, project-switch-during-save, quota/abort/read-back failure, corrupt/unsupported Open, legacy migration/cleanup failure, missing preview, aggregate hydrated-RGBA limit/+1 and repeated-reference rejection, encoded raster mismatch, PNG preflight rejection before native decode, structurally valid/native-decode failure, post-decode mismatch, invalid/unsupported sound data URL, missing/digest/MIME/reconstruction-mismatched audio asset, stale revision, concurrent tab conflict, Save As collision, V2 and exact legacy-only authoritative Delete failure/success, V2 Delete with unavailable legacy classification, post-Delete pending cleanup, hidden-card reload, bounded cleanup retry, and truthful operation messages.

### 12.6 Acceptance criteria

- The 22-step flow passes at both viewports from fresh isolated storage.
- Main/tween/motion rasters reopen with exact dimensions/RGBA digests. All ten logical sound fields, supported WAV Blob bytes/MIME, reconstructed canonical data URL, and null audio are exact.
- Aggregate hydrated-RGBA overflow rejects the whole candidate before any Blob read/native decode; preflight-class PNG failures invoke no native decoder or canvas allocation; accepted-but-corrupt decode/post-decode mismatches also leave the Open screen/current workspace unchanged. No case partially mounts, and the sequential scratch lifecycle matches §4.2.
- Visible playback and frame/layer/text/tween behavior correspond to distinct saved fixtures.
- `Saved on this browser` occurs only after candidate verification and active-head completion; dirty/save races remain honest.
- Every Save/migration-before-publication/authoritative-Delete failure shows typed beginner copy and preserves last-good/neighbor/legacy/editor bytes. A post-commit legacy cleanup failure truthfully remains a successful Delete, keeps the tombstone/hidden target, records target presence as `present` or `unknown` according to §4.6, preserves all neighbors, and shows no alarming failure.
- Valid V1 opens with warning and migrates only after explicit successful Save.
- Corrupt/future storage is not repaired, filtered, or overwritten and remains visible as unavailable, except that a completed authoritative Delete (V2 or exact classified legacy-only) deliberately suppresses its exact same-ID legacy card through a tombstone.
- Save As, rename, duplicate, authoritative Delete, legacy maintenance, refresh/open, and edit/save-again all satisfy §4.8.
- Preview omission has no content effect.
- No frozen Phase 1.5 core or `DrawingCanvas.tsx` byte changes.
- Zero provider/search/Supabase/remote request.

### 12.7 Protected regressions

| ID | Protected flow | Required proof |
| --- | --- | --- |
| REG-01 | Home → New → Drawing and Home → New → Stick | Visible two-viewport navigation. |
| REG-02 | Stick → Creator → Back | Visible two-viewport flow. |
| REG-03 | Drawing tools/timeline/layers/history | Representative brush/text, add/select layer/cell, Undo/Redo, Play/Pause. |
| REG-04 | Phase 1.5 generated-pixel settlement/resize | Unmodified `npm run test:spec0001-browser` accepted proof gate. |
| REG-05 | Drawing Generate Frames | Exactly one mocked POST; settled pixels and input usability; no real route. |
| REG-06 | Disabled Generate Plans/Sounds/Other | Availability remains disabled. |
| REG-07 | Current project operations | Save As/rename/duplicate plus authoritative V2 and exact legacy-only Delete, hidden pending legacy cleanup, same-ID retry, and failure truthfulness. |
| REG-08 | AI memory boundary | Local sanitized companion preserved; same-origin route mocked; no Supabase. |
| REG-09 | Version-1 compatibility | Open/migrate non-destructively; invalid raw bytes retained; successful targeted cleanup may remove only the same-ID legacy record and preserves every neighbor's raw UTF-8 entry slice. |
| REG-10 | Stick persistence | No Stick project appears; SPEC-0001 state unchanged. |

Systems not retested as product acceptance: export, cloud, authentication, billing, deployment, remote database, and provider behavior; they are outside the execution path and remain unchanged.

### 12.8 Exact commands and stop gate

The checked-in `scripts/fixtures/spec0002-browser/v1/phase-2-proof-commands.json` is the exact ordered workload owned by the Phase 2 recorder:

```bash
node --experimental-strip-types scripts/validateDrawingProjectV2Contract.ts
node --experimental-strip-types scripts/validateDrawingProjectV2Repository.ts
node --experimental-strip-types scripts/validateDrawingProjectV1Compatibility.ts
node --experimental-strip-types scripts/validateDrawingProjectV2BrowserEngine.ts
node --experimental-strip-types scripts/spec0002-browser/validatePhase2.ts
node --experimental-strip-types scripts/runSpec0002BrowserProof.ts
npm run test:spec0001-browser
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
git diff --check
git diff --cached --check
git status --short --branch
```

The executor invokes the recorder and validator externally as:

```bash
node --experimental-strip-types scripts/recordSpec0002Phase2Proof.ts --commands=scripts/fixtures/spec0002-browser/v1/phase-2-proof-commands.json --output=output/spec-0002/phase-2/proof-manifest.json
node --experimental-strip-types scripts/validateSpec0002Proof.ts output/spec-0002/phase-2/proof-manifest.json
```

Stop if any fidelity, aggregate reject-before-read, PNG preflight-before-native-decode, sound-field/data-URL, last-good preservation, authoritative-Delete/tombstone/deduplication, neighbor-safe cleanup, network denial, tester-core hash, regression, cleanup, TypeScript, or phase-file allowlist gate fails. Return the packet and do not begin autosave/cloud/export/Stick work or any later task.

## 13. Acceptance Criteria Summary

- AC-01: A supported V2 project round-trips with pixel-exact decoded raster, all ten exact sound-field values, exact supported WAV Blob bytes/MIME and reconstructed canonical data URL, and exact remaining structured data.
- AC-02: Main frame, tween endpoint, and motion sprite use authoritative lossless assets, never previews. Aggregate hydrated RGBA is within 512 MiB before any raster Blob read; encoded bytes/digest and the exact PNG profile pass before native decode; every aggregate rejection has zero Blob reads/preflights/decodes and every PNG-preflight rejection has zero native decodes.
- AC-03: All Save/migration-before-publication/authoritative-Delete failure classes preserve applicable last-good, editor, legacy-target, and neighbor records and emit no success.
- AC-04: Successful Save is acknowledged only after strict staged-version read-back and atomic active-head transaction completion.
- AC-05: Capacity is measurable and bounded; actual earlier browser quota failure is honest.
- AC-06: Save races, stale revision, unmount, and project switch cannot produce a false clean state or overwrite.
- AC-07: Valid V1 opens at its already-available fidelity, applies only the traced optional sound defaults, warns honestly, and migrates only on explicit successful Save; unknown sound shapes fail closed.
- AC-08: Corrupt/future/unreadable storage stays byte-identical and visible as unavailable unless a completed authoritative Delete (V2 or exact classified legacy-only) deliberately suppresses its exact same-ID legacy card through a tombstone or an explicit, safely targeted cleanup successfully removes only the intended legacy entry.
- AC-09: Save As, rename, duplicate, authoritative V2 and exact legacy-only Delete, tombstone deduplication, bounded same-ID legacy maintenance, refresh/open, and edit/save-again are safe and deterministic. V2 Delete never depends on a fresh localStorage read; cleanup failure after committed Delete does not undo truthful deletion; cleanup success preserves every unrelated legacy record byte-for-byte.
- AC-10: UI says `saved on this browser`; no cloud/cross-device/autorecovery claim appears.
- AC-11: AI behavior and remote memory boundary are unchanged; proof has zero external traffic.
- AC-12: Phase 1.5 tester core and generated-frame regression remain exact.
- AC-13: SPEC-0001 status/authorization and all Stick behavior remain unchanged.
- AC-14: No phase begins before its separate activation/approval and conflict audit.

## 14. Verification and Evidence Rules

Proof output is ignored and collision-refusing under `output/spec-0002/phase-N/`. A technical manifest binds base SHA, phase, exact dirty allowlist, fixture/code hashes, command receipts, runtime versions, assertion totals, browser plan/result where applicable, network policy, screenshots, and cleanup. It never stores user content or reusable service credentials.

The Spec Executor produces/validates the technical manifest and stops. After acceptance, the Control Plane Architect revalidates it, updates tracked evidence/control plane, runs `bash scripts/update_memory.sh` and `--check-only`, and creates a non-self-referential final closeout manifest over the reviewed tracked state. Publication remains separate.

No default command may contact OpenAI, search, Supabase, telemetry, font/CDN, package registry, or another remote endpoint. A local browser/server must run with server-child and browser egress denial, not only credential scrubbing. No live external proof exists or is needed.

## 15. Implementation Record

Not started. No runtime, fixture, test, dependency, configuration, migration, environment, database, or service behavior changed while drafting this proposal.

## 16. Verification Record

| Gate/flow | Result | Evidence |
| --- | --- | --- |
| Source execution-path audit | Pass | Files and functions summarized in §§2 and 7. |
| Isolated empty-project Save/reload/list/open | Pass for current navigation only | Local app at research basis; AI-memory request locally intercepted. |
| Current stored version-1 shape | Pass | Isolated browser localStorage record showed version 1 and absent full frame/tween bitmaps. |
| Representative fidelity | Unproven | Must be Phase 2 proof. |
| Failure/quota/migration UI | Unproven | Must be Phase 1/2 proof. |
| TypeScript/lint/build | Not rerun | Documentation-only proposal. |
| Provider/Supabase/search | Not run | Forbidden and unnecessary. |

## 17. Owner Decisions Accepted by Arthur

Arthur accepted OD2-01 through OD2-08 exactly as written in D-0013 and authorized Phase 1 only. SPEC-0002 Phase 2 and SPEC-0001 Phase 2 remain Unauthorized/Not started; this acceptance does not authorize concurrent implementation.

| ID | Plain-language choice | Recommendation | Alternative/tradeoff | Status |
| --- | --- | --- | --- | --- |
| OD2-01 | How much local content will the app support? | 128 MiB stored/project, 512 MiB managed total, 64 projects, and no more than 512 MiB of logical hydrated raster materializations in one opened project; fail honestly if the browser quota is lower or the hydration ceiling is exceeded. | Smaller limits reduce storage and browser-memory failures but constrain normal animation; larger limits increase memory, decode time, and quota risk. | Accepted |
| OD2-02 | What does “lossless” mean? | Exact decoded RGBA dimensions/bytes after bounded PNG preflight, exact structured fields, and exact supported WAV Blob bytes/MIME plus reconstructed canonical data URL; PNG file bytes may vary by browser. | Visual-only equality is cheaper but cannot prove no artwork or attachment data was lost. | Accepted |
| OD2-03 | What happens to old version-1 projects? | Open with an honest quality warning; migrate only on explicit Save; publish verified V2 first, then clean the same-ID legacy entry best-effort while the V2 head keeps it hidden. | Auto-migration is simpler visually but risks destructive work during Open; treating two storage systems as one transaction would be false. | Accepted |
| OD2-04 | Does attached sound count toward the project limit? | Yes. Non-null canonical WAV audio preserves/counts its exact Blob bytes once; null audio stays null and counts zero asset bytes; all real attachment fields remain exact. | Excluding audio would make capacity dishonest or silently drop content. | Accepted |
| OD2-05 | What is saved outside artwork? | Preserve sanitized local AI memory as auxiliary data; do not persist transcript or reusable asset/library entries. | Putting all session state into the document greatly widens AI/library scope. | Accepted |
| OD2-06 | What should failure say and preserve? | Use the beginner copy in §§4.7–4.8: never say saved/deleted before the authoritative transaction; keep last-good/current state on authoritative failure; after committed Delete, report deletion truthfully while a tombstone hides any legacy backup pending quiet cleanup. | Treating post-Delete legacy maintenance as a failed Delete would falsely imply the visible project still exists; omitting the tombstone could make a deleted card reappear. | Accepted |
| OD2-07 | Can SPEC-0002 implementation overlap SPEC-0001? | Wait behind any active executor/architect unless a fresh PM conflict audit proves exact file/system/worktree independence. | Concurrent work may be faster but risks shared navigation/tester/control-plane conflicts. | Accepted |
| OD2-08 | Should authoritative V2 projects move from localStorage to IndexedDB? | Yes: use immutable staged versions and one atomic active-head swap. | Continuing localStorage is simpler but cannot credibly carry normal lossless raster/audio capacity or the required rollback boundary; choosing it would require reducing the accepted outcome. | Accepted |

Engineering defaults that do not change the accepted outcome—internal helper decomposition, content-ID deduplication, cursor/index choice, and bounded batch sizes—may be adjusted within a phase if all schema, capacity, atomicity, fidelity, proof, and file-boundary requirements remain exact. IndexedDB rather than localStorage, explicit Save rather than autosave, and lossless semantic fidelity are outcome/risk choices, not replaceable mechanics.

## 18. Final State and Handoff

Final status for this task: **Approved and active for bounded work**. OD2-01 through OD2-08 are accepted exactly as written. SPEC-0002 Phase 1 is **Authorized; Not started**. SPEC-0002 Phase 2 is **Unauthorized; Not started**. SPEC-0001 remains Approved with Phase 1 and Phase 1.5 Verified/published/integrated and Phase 2 and later phases Unauthorized/Not started.

Next step: the Project Manager reviews this Control Plane Architect approval packet, followed only by a separate publication instruction if accepted. After D-0013 and this activation record are published/integrated, a new Plan-mode SPEC-0002 Phase 1 Spec Executor task may start in one separate worktree from the exact then-current canonical-main SHA after refreshing the activation conflict audit.

This PM Review Packet does not authorize staging, commit, push, merge, publication, implementation, external activity, SPEC-0002 Phase 2, or SPEC-0001 Phase 2.
