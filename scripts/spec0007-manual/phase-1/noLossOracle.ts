import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import {
  authorizeDestructiveCommand, DESTRUCTIVE_COMMAND_REGISTRY, isAuthoringSnapshotCurrent,
  type DestructiveCommandId,
} from "../../../src/lib/animation/editorCommands/destructiveRegistry.ts";
import * as coverage from "../../../src/lib/animation/unifiedRasterPaintCoverageV1.ts";
import { MaximumMask, compositeRasterPaint, mergePaintPixel, unionRect, rasterCommandDigest, validateRasterGestureCommand, RASTER_ALGORITHM_VERSION, type RasterGestureCommandV2 } from "../../../src/lib/animation/editorCommands/rasterGesture.ts";
import { bitmapCenterOffset } from "../../../src/lib/animation/unifiedStageGeometry.ts";
import { currentSourceDigest, writeUnitResult } from "./proofContract.ts";
import { cloneDrawingTextObjects } from "../../../src/components/workspace/drawingText.ts";

const sourceDigestBefore = currentSourceDigest();
// Execute the actual private workspace functions, extracted through TypeScript's
// parser. This avoids a duplicate implementation and avoids adding test-only UI.
const sourcePath = "src/components/workspace/DrawingWorkspace.tsx";
const source = readFileSync(sourcePath, "utf8");
const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.Expression>();
const exercisedFunctions = new Set<string>();
const walk = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
  ts.forEachChild(node, walk);
};
walk(parsed);
const initializer = (name: string, callback = false) => {
  const expression = declarations.get(name);
  assert.ok(expression, `missing actual function ${name}`);
  exercisedFunctions.add(name);
  if (callback) {
    assert.ok(ts.isCallExpression(expression));
    return expression.arguments[0].getText(parsed);
  }
  return expression.getText(parsed);
};
class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray | number, width: number, height?: number) {
    if (typeof data === "number") {
      this.width = data; this.height = width; this.data = new Uint8ClampedArray(data * width * 4);
    } else {
      this.data = data; this.width = width; this.height = height!;
    }
    assert.equal(this.data.length, this.width * this.height * 4);
  }
}
const environment = {
  ...coverage, Uint8Array, Uint8ClampedArray, Int32Array, ImageData: TestImageData,
  bitmapCenterOffset,
  MAX_BITMAP_DATA_LENGTH: 256 * 1024 * 1024, SAVE_PATH_ALPHA_THRESHOLD: 0,
};
const loadFunctions = (names: string[], bindings: Record<string, unknown> = {}) => {
  const script = names.map(name => `const ${name} = ${initializer(name)};`).join("\n") + `\n({${names.join(",")}})`;
  return vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, { ...environment, ...bindings }) as Record<string, (...args: unknown[]) => unknown>;
};
const loadCallback = (name: string, bindings: Record<string, unknown>) =>
  vm.runInNewContext(ts.transpileModule(`(${initializer(name, true)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { ...environment, authorizeDestructiveCommand, isAuthoringSnapshotCurrent, validateRasterGestureCommand, ...bindings }) as (...args: unknown[]) => unknown;
let assertions = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); assertions += 1; };
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions += 1; };

const ids = Object.keys(DESTRUCTIVE_COMMAND_REGISTRY) as DestructiveCommandId[];
eq(ids.length, 10, "closed registry includes explicitly authorized existing Shape Cutout");
for (const commandId of ids) {
  const request = { commandId, targetIds: ["target"], availableTargetIds: ["target", "protected"], confirmed: true, remainingCount: 1, referenced: false };
  check(authorizeDestructiveCommand(request).allowed, `${commandId} valid exact target`);
  check(!authorizeDestructiveCommand({ ...request, targetIds: [] }).allowed, `${commandId} empty target rejected`);
  check(!authorizeDestructiveCommand({ ...request, targetIds: ["other"] }).allowed, `${commandId} stale target rejected`);
  check(!authorizeDestructiveCommand({ ...request, targetIds: ["target", "target"] }).allowed, `${commandId} duplicate target rejected`);
  if (DESTRUCTIVE_COMMAND_REGISTRY[commandId].confirmation) {
    check(!authorizeDestructiveCommand({ ...request, confirmed: false }).allowed, `${commandId} confirmation retained`);
  }
}
check(!authorizeDestructiveCommand({ commandId: "draw" as DestructiveCommandId, targetIds: ["target"], availableTargetIds: ["target"] }).allowed, "drawing cannot acquire delete authority");
for (const commandId of ["remove-frame", "delete-layer"] as const) {
  for (const remainingCount of [0, -1, NaN, Infinity, 0.5]) {
    check(!authorizeDestructiveCommand({ commandId, targetIds: ["x"], availableTargetIds: ["x"], confirmed: true, remainingCount }).allowed, `${commandId} minimum ${remainingCount}`);
  }
}
check(!authorizeDestructiveCommand({ commandId: "delete-definition", targetIds: ["x"], availableTargetIds: ["x"], referenced: true }).allowed, "referenced definition protected");
const identity = { generation: 3, contextKey: "layer:2" };
check(isAuthoringSnapshotCurrent(identity, { ...identity }, { ...identity }, "layer:2"), "unchanged snapshot accepted");
for (const invalid of [undefined, { generation: 2, contextKey: "layer:2" }, { generation: 3, contextKey: "other:2" }, { generation: NaN, contextKey: "layer:2" }]) {
  check(!isAuthoringSnapshotCurrent(identity, invalid, identity, "layer:2"), "stale/missing captured identity rejected");
  check(!isAuthoringSnapshotCurrent(identity, identity, invalid, "layer:2"), "changed owner after capture rejected");
}

const opaqueBoundsCache = new WeakMap<TestImageData, { bounds: { left: number; top: number; width: number; height: number } | null; columnOpaqueCounts: Int32Array; rowOpaqueCounts: Int32Array }>();
const functions = loadFunctions([
  "getExpectedBitmapDataLength", "isBitmapDataShapeValid", "createImageDataSafely", "getUsableBitmap", "cloneBitmap",
  "applyBitmapPatch", "captureBitmapPatch", "serializeBitmap", "deserializeBitmap", "hasSnapshotDirtyPatch", "materializeSnapshotBitmap", "materializeBitmapPatch", "normalizeCapturedSnapshotExtent",
  "finalizeOpaqueBoundsFromCounts", "buildOpaqueBoundsCacheEntry", "getOpaqueBoundsCacheEntry", "primeOpaqueBoundsCacheFromDirtyPatch",
], { bitmapOpaqueBoundsCache: opaqueBoundsCache, OPAQUE_PIXEL_ALPHA_THRESHOLD: 8 });
for (const bitmapIsNull of [true, false]) {
  const result = functions.materializeBitmapPatch({ currentBitmap: null, patchBitmap: new TestImageData(8, 8), patchRect: { left: 0, top: 0, width: 8, height: 8 }, bitmapWidth: 8, bitmapHeight: 8, bitmapIsNull }) as TestImageData | null;
  eq(result === null, bitmapIsNull, "local patch history preserves null versus allocated blank bitmap exactly");
  if (result) eq(result.data, new Uint8ClampedArray(8 * 8 * 4), "blank patch retains exact bytes");
}
{
  const historyPatch = new TestImageData(8, 8);
  const restored = functions.materializeBitmapPatch({ currentBitmap: null, patchBitmap: historyPatch, patchRect: { left: 0, top: 0, width: 8, height: 8 }, bitmapWidth: 8, bitmapHeight: 8, bitmapIsNull: false }) as TestImageData;
  restored.data[3] = 255;
  eq(historyPatch.data[3], 0, "later editing cannot mutate a restored full-bitmap history payload");
}
// History restoration must carry exact opacity counts without aliasing the old
// entry. Otherwise the next stroke scans the entire stage on pointer release.
for (const baseKind of ["cached", "cold", "null"]) for (const rect of [
  { left: 0, top: 0, width: 32, height: 32 }, { left: 32, top: 0, width: 33, height: 33 },
  { left: 64, top: 32, width: 1, height: 1 }, { left: 0, top: 0, width: 65, height: 33 },
]) {
  let current: TestImageData | null = baseKind === "null" ? null : new TestImageData(65, 33);
  const alphas = [0, 7, 8, 9, 26, 255];
  if (current) for (let i = 0; i < 65 * 33; i++) current.data[i * 4 + 3] = alphas[i % alphas.length];
  if (baseKind === "cached") functions.getOpaqueBoundsCacheEntry(current);
  for (let pass = 0; pass < 9; pass++) {
    const patch = new TestImageData(rect.width, rect.height);
    for (let i = 0; i < rect.width * rect.height; i++) patch.data[i * 4 + 3] = alphas[(i + pass) % alphas.length];
    const beforeBytes = current?.data.slice(), beforeEntry = current ? opaqueBoundsCache.get(current) : undefined;
    const beforeColumns = beforeEntry?.columnOpaqueCounts.slice(), beforeRows = beforeEntry?.rowOpaqueCounts.slice();
    const restored = functions.materializeBitmapPatch({ currentBitmap: current, patchBitmap: patch, patchRect: rect, bitmapWidth: 65, bitmapHeight: 33, bitmapIsNull: false }) as TestImageData;
    const entry = opaqueBoundsCache.get(restored);
    check(entry, "restored bitmap already owns an opacity cache before the next stroke");
    const columns = new Int32Array(65), rows = new Int32Array(33), occupied: Array<[number, number]> = [];
    for (let y = 0; y < 33; y++) for (let x = 0; x < 65; x++) if (restored.data[(y * 65 + x) * 4 + 3] > 8) { columns[x]++; rows[y]++; occupied.push([x, y]); }
    eq(entry!.columnOpaqueCounts, columns, "restored column counts equal independent alpha scan");
    eq(entry!.rowOpaqueCounts, rows, "restored row counts equal independent alpha scan");
    const xs = occupied.map(point => point[0]), ys = occupied.map(point => point[1]);
    eq(JSON.stringify(entry!.bounds), JSON.stringify(occupied.length ? { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 } : null), "restored bounds equal independent occupied-pixel extent");
    check(restored !== patch && restored !== current, "restored bitmap is isolated from old bitmap and history patch");
    if (current) eq(current.data, beforeBytes, "restoration retains old bitmap bytes");
    if (beforeEntry) {
      eq(beforeEntry.columnOpaqueCounts, beforeColumns, "restoration retains old column counts");
      eq(beforeEntry.rowOpaqueCounts, beforeRows, "restoration retains old row counts");
      check(entry!.columnOpaqueCounts !== beforeEntry.columnOpaqueCounts && entry!.rowOpaqueCounts !== beforeEntry.rowOpaqueCounts, "restored counts do not alias old cache arrays");
    }
    current = restored;
  }
}
const bitmap = new TestImageData(new Uint8ClampedArray(16 * 16 * 4), 16, 16);
const writer = coverage.createPaintCoverageWriter(null, 16, 16);
for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
  bitmap.data.set([x * 8, y * 8, 200, 26], (y * 16 + x) * 4);
  writer.set(x, y, { key: { variant: "Brush", color: "#0080c8", opacityByte: 26 }, base: [0, 0, 0, 0], coverage: 26, pigment: [0, 128, 200] });
}
coverage.attachBitmapPaintCoverage(bitmap, writer.finish());
const frozenPixels = bitmap.data.slice();
const frozenCoverage = coverage.getBitmapPaintCoverage(bitmap);
const historyFunctions = loadFunctions([
  "cloneMotionTweenOrigin", "cloneMotionTweenData", "cloneWorkspaceTextObjects", "cloneWorkspaceTimelineFrameMetadata", "resolveWorkspaceTimelineFrameTargetBitmap", "createLocalDrawingHistoryEntry",
], { ...functions, cloneDrawingTextObjects });
const historyFrame = (target: "bitmap" | "tweenEndBitmap", value: TestImageData | null) => ({
  id: 1, stateId: 1, kind: "keyframe", cellType: "keyframe", isBlank: false, hasTweenEndpoint: false,
  bitmap: null, tweenEndBitmap: null, previewUrl: null, tweenEndPreviewUrl: null, motionTween: null, soundAttachment: null, textObjects: [], [target]: value,
});
type TestHistoryEntry = { beforeBitmap: TestImageData; afterBitmap: TestImageData; beforePatchBitmap: TestImageData; afterPatchBitmap: TestImageData; beforeBitmapNull: boolean; afterBitmapNull: boolean };
for (const target of ["bitmap", "tweenEndBitmap"] as const) {
  const context = { key: "layer:1", layerId: "layer", viewFrameId: 1, targetFrameId: 1, target };
  const before = functions.cloneBitmap(bitmap) as TestImageData, after = functions.cloneBitmap(bitmap) as TestImageData;
  const entry = historyFunctions.createLocalDrawingHistoryEntry({ context, currentFrame: historyFrame(target, before), nextFrame: historyFrame(target, after), snapshot: { bitmap: after } }) as TestHistoryEntry;
  check(entry.beforeBitmap.data !== before.data && entry.afterBitmap.data !== after.data, `${target}: history owns snapshot payloads`);
  before.data.fill(0); after.data.fill(0); coverage.attachBitmapPaintCoverage(before, null); coverage.attachBitmapPaintCoverage(after, null);
  for (const retained of [entry.beforeBitmap, entry.afterBitmap]) { eq(retained.data, frozenPixels, `${target}: retained snapshot survives live edits`); check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(retained), frozenCoverage), `${target}: retained companion survives live edits`); }
  for (const previous of [null, new TestImageData(16, 16), bitmap]) for (const next of [null, new TestImageData(16, 16), bitmap]) {
    const patchRect = { left: 4, top: 5, width: 3, height: 2 }, patch = functions.captureBitmapPatch(next, patchRect) as TestImageData, expected = patch.data.slice();
    const patchEntry = historyFunctions.createLocalDrawingHistoryEntry({ context, currentFrame: historyFrame(target, previous), nextFrame: historyFrame(target, next), snapshot: { bitmap: null, dirtyPatchBitmap: patch, dirtyPatchRect: patchRect, bitmapWidth: 16, bitmapHeight: 16 } }) as TestHistoryEntry;
    eq([patchEntry.beforeBitmapNull, patchEntry.afterBitmapNull], [previous === null, next === null], `${target}: constructor preserves actual nullness`);
    patch.data.fill(0); eq(patchEntry.afterPatchBitmap.data, expected, `${target}: patch payload survives input mutation`);
  }
}
const copy = functions.cloneBitmap(bitmap) as TestImageData;
for (let faultAt = 1; faultAt <= 8; faultAt++) {
  const frames = [historyFrame("bitmap", bitmap)], layers = { current: [{ id: "layer", timelineFrames: frames }] };
  const stick = { current: { "layer:1": { figures: [], structureGraph: {} } } }, instances = { current: { "layer:1": [{ itemId: "old", definitionId: "symbol" }] } };
  const frameId = { current: 2 }, active = { current: "layer" }, current = { current: 0 }, selected = { current: 0 };
  const originalLayers = layers.current, originalStick = stick.current, originalInstances = instances.current;
  let allocations = 0, published = 0;
  const clone = (value: unknown) => { if (++allocations === faultAt) throw new Error("paste_allocation"); return structuredClone(value); };
  const bindings = {
    layersRef: layers, activeLayerIdRef: active, currentFrameIndexRef: current, selectedTimelineIndexRef: selected,
    nextTimelineFrameIdRef: frameId, nextLayerNumberRef: { current: 2 }, stickByCellRef: stick, symbolInstancesByCellRef: instances, unifiedCatalogsRef: { current: { symbols: [], assets: [] } },
    structuredClone: clone, copiedTimelineFrameRef: { current: { cellType: "keyframe", snapshot: { bitmap, previewUrl: null }, textObjects: [], soundAttachment: null, stickContent: originalStick["layer:1"], symbolInstances: originalInstances["layer:1"] } },
    saveCurrentFrameSnapshotRef: { current: () => true }, drawingCanvasRef: { current: { hasPendingAuthoringChanges: () => false } },
    getLayerById: () => layers.current[0], cloneBitmap: (value: unknown) => { if (++allocations === faultAt) throw new Error("paste_allocation"); return functions.cloneBitmap(value); },
    cloneWorkspaceTextObjects: historyFunctions.cloneWorkspaceTextObjects,
    createEmptyTimelineFrame: (id: number) => ({ ...historyFrame("bitmap", null), id, stateId: id, cellType: "empty" }),
    createTimelineFrame: (id: number, _kind: string, cellType: string, stateId: number, snapshot: { bitmap: TestImageData }) => ({ ...historyFrame("bitmap", snapshot.bitmap), id, stateId, cellType }),
    crypto: { randomUUID: () => "fresh-instance" }, recordUndoSnapshot: () => { published++; },
  };
  const createHistoryEntryFromWorkspace = loadCallback("createHistoryEntryFromWorkspace", bindings);
  const paste = loadCallback("pasteTimelineFrame", { ...bindings, createHistoryEntryFromWorkspace });
  assert.throws(() => paste("layer", 3), /paste_allocation/); assertions++;
  check(allocations === faultAt && published === 0, "every paste allocation completes before any history publication");
  check(layers.current === originalLayers && stick.current === originalStick && instances.current === originalInstances, "failed paste retains exact compound document references");
  eq([frameId.current, active.current, current.current, selected.current, frames.length], [2, "layer", 0, 0, 1], "failed extended-frame paste retains frame IDs and navigation");
  eq(bitmap.data, frozenPixels, "failed paste retains source pixel bytes");
  check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(bitmap), frozenCoverage), "failed paste retains source coverage");
}
for (const failClone of [false, true]) {
  const live = functions.cloneBitmap(bitmap) as TestImageData;
  const layers = [{ id: "layer", timelineFrames: [{ id: 1, bitmap: live, tweenEndBitmap: null }, { id: 2, bitmap: null, tweenEndBitmap: live }] }];
  const history = { current: [{ layers }, { layers }, { layers }] }, previous = history.current, stamp = { current: "before" as string | null };
  const detach = loadCallback("ensureDetachedLocalHistoryBitmap", { historyEntriesRef: history, currentHistoryIndexRef: { current: 1 }, historyWorkspaceStampRef: stamp,
    cloneBitmap: (value: unknown) => { if (failClone) throw new Error("allocation"); return functions.cloneBitmap(value); } });
  const context = { layerId: "layer", targetFrameId: 1, target: "bitmap" };
  if (failClone) {
    assert.throws(() => detach(context, live), /allocation/); assertions++;
    check(history.current === previous && stamp.current === "before", "failed history detachment leaves every reference untouched");
  } else {
    check(detach(context, live), "all shared history bitmaps detach");
    live.data.fill(0); coverage.attachBitmapPaintCoverage(live, null);
    for (const entry of history.current) for (const frame of entry.layers[0].timelineFrames) {
      const retained = frame.bitmap ?? frame.tweenEndBitmap!;
      eq(retained.data, frozenPixels, "older/current/future history pixels survive subsequent live mutation");
      check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(retained), frozenCoverage), "all history companions survive subsequent live mutation");
    }
  }
}
eq(copy.data, frozenPixels, "bitmap clone pixels");
check(copy.data !== bitmap.data, "bitmap clone owns independent bytes");
check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(copy), frozenCoverage), "clone retains companion");
const serialized = functions.serializeBitmap(bitmap) as Record<string, unknown>;
check(Boolean(serialized.paintCoverage), "serialized companion explicit");
const restored = functions.deserializeBitmap(serialized) as TestImageData;
eq(restored.data, frozenPixels, "serialization round-trip pixels");
check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(restored), frozenCoverage), "serialization round-trip companion");
const rect = { left: 4, top: 5, width: 3, height: 2 };
const beforePatch = functions.captureBitmapPatch(bitmap, rect) as TestImageData;
const erasedPatch = new TestImageData(new Uint8ClampedArray(rect.width * rect.height * 4), rect.width, rect.height);
functions.applyBitmapPatch(copy, erasedPatch, rect);
for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
  const inside = x >= 4 && x < 7 && y >= 5 && y < 7;
  const offset = (y * 16 + x) * 4;
  eq(copy.data.slice(offset, offset + 4), inside ? new Uint8ClampedArray(4) : frozenPixels.slice(offset, offset + 4), "exact patch retention");
  eq(coverage.getPaintCoverage(coverage.getBitmapPaintCoverage(copy), x, y)?.coverage ?? null, inside ? null : 26, "coverage removed only with target pixels");
}
functions.applyBitmapPatch(copy, beforePatch, rect);
eq(copy.data, frozenPixels, "patch Undo exact pixels");
check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(copy), frozenCoverage), "patch Undo exact coverage");
eq(bitmap.data, frozenPixels, "original bitmap remained immutable");

for (const [width, height] of [[13, 11], [19, 20], [13, 20]]) {
  const view = new TestImageData(width, height);
  const mapped = functions.normalizeCapturedSnapshotExtent({ bitmap: view, identity: { contextKey: "test", generation: 1 } }, bitmap);
  const result = functions.materializeSnapshotBitmap(mapped, bitmap) as TestImageData;
  eq(result.width, Math.max(16, width), "viewport width never crops stored extent"); eq(result.height, Math.max(16, height), "viewport height never crops stored extent");
  const left = bitmapCenterOffset(result.width, width), top = bitmapCenterOffset(result.height, height);
  const oldLeft = bitmapCenterOffset(result.width, 16), oldTop = bitmapCenterOffset(result.height, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + oldLeft, dy = y + oldTop, inside = dx >= left && dy >= top && dx < left + width && dy < top + height;
    if (!inside) {
      eq(result.data.slice((dy * result.width + dx) * 4, (dy * result.width + dx) * 4 + 4), bitmap.data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4), "off-view pixel remains exact");
      eq(coverage.getPaintCoverage(coverage.getBitmapPaintCoverage(result), dx, dy), coverage.getPaintCoverage(frozenCoverage, x, y), "off-view coverage remains exact");
    }
  }
  eq(bitmap.data, frozenPixels, "viewport normalization keeps original pixels immutable");
}

const cloneFailure = loadFunctions(["getExpectedBitmapDataLength", "isBitmapDataShapeValid", "createImageDataSafely", "getUsableBitmap", "cloneBitmap"], {
  ImageData: class { constructor() { throw new Error("injected allocation failure"); } },
});
assert.throws(() => cloneFailure.cloneBitmap(bitmap), /bitmap_clone_failed/); assertions++;
eq(cloneFailure.cloneBitmap(null), null, "only genuinely empty source clones as null");

for (const fault of ["before-write", "after-pixels", "after-history", "after-layers", "commit-mark"]) {
  const target = functions.cloneBitmap(bitmap) as TestImageData;
  const beforeLayers = [{ bitmap: target }], beforeFrames = [{ bitmap: target }], beforeHistory = [{ layers: beforeLayers }];
  const layers = { current: beforeLayers }, frames = { current: beforeFrames }, history = { current: beforeHistory }, index = { current: 2 };
  const local = { current: new Map([["layer:0", { entries: ["before"], position: 0 }]]) }, stamp = { current: "before" }, row = { current: beforeLayers };
  let failed = false;
  const boundsCache = new WeakMap<object, unknown>([[target, { bounds: "before" }]]);
  const transaction = loadCallback("persistSnapshotAtomically", {
    layersRef: layers, timelineFramesRef: frames, historyEntriesRef: history, currentHistoryIndexRef: index,
    localDrawingHistoryRef: local, historyWorkspaceStampRef: stamp, timelineRowLayersSourceRef: row,
    drawingCanvasRef: { current: { markAuthoringChangesCommitted: () => { if (fault === "commit-mark") throw new Error(fault); } } },
    hasSnapshotDirtyPatch: functions.hasSnapshotDirtyPatch, captureBitmapPatch: functions.captureBitmapPatch,
    bitmapOpaqueBoundsCache: boundsCache,
    invalidateBitmapRenderCaches: () => {}, startTransition: (fn: () => void) => fn(), setLayers: () => {}, syncHistoryAvailability: () => {}, setSaveState: () => { failed = true; },
  });
  const proposed = { bitmap: null, bitmapWidth: 16, bitmapHeight: 16, dirtyPatchBitmap: erasedPatch, dirtyPatchRect: rect, captureVersion: 4 };
  eq(transaction(proposed, target, () => {
    if (fault === "before-write") throw new Error(fault);
    functions.applyBitmapPatch(target, erasedPatch, rect);
    boundsCache.set(target, { bounds: "changed" });
    if (fault === "after-pixels") throw new Error(fault);
    history.current = []; index.current = 10; local.current.set("layer:0", { entries: ["corrupt"], position: 8 }); stamp.current = "corrupt";
    if (fault === "after-history") throw new Error(fault);
    layers.current = []; frames.current = []; row.current = [];
    if (fault === "after-layers") throw new Error(fault);
    return { bitmap: target };
  }), null, `${fault}: rejects incomplete transaction`);
  eq(target.data, frozenPixels, `${fault}: exact original raster restored`);
  check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(target), frozenCoverage), `${fault}: exact companion restored`);
  check(layers.current === beforeLayers && frames.current === beforeFrames && history.current === beforeHistory && row.current === beforeLayers, `${fault}: restores document/history references`);
  eq(index.current, 2, `${fault}: history position restored`);
  eq(local.current.get("layer:0")?.entries, ["before"], `${fault}: local history restored`);
  check(failed && stamp.current === "before", `${fault}: visible failure and stamp restored`);
  check(!boundsCache.has(target), `${fault}: mutable opacity cache invalidated after rollback`);
}

const canvasPath = "src/components/workspace/DrawingCanvas.tsx";
const canvasSource = readFileSync(canvasPath, "utf8");
const canvasParsed = ts.createSourceFile(canvasPath, canvasSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let presentExpression = "", sketchAddsExpression = "";
const findPresenter = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(canvasParsed) === "presentRasterDraft" && node.initializer) presentExpression = node.initializer.getText(canvasParsed);
  if (ts.isVariableDeclaration(node) && node.name.getText(canvasParsed) === "sketchDraftAddsPaint" && node.initializer) sketchAddsExpression = node.initializer.getText(canvasParsed);
  ts.forEachChild(node, findPresenter);
};
findPresenter(canvasParsed); check(Boolean(presentExpression), "actual canvas presenter found");
for (const [baseWidth, baseHeight] of [[65, 33], [66, 34], [63, 31]]) for (const erase of [false, true]) {
  const committed = new TestImageData(baseWidth, baseHeight);
  for (let y = 0; y < baseHeight; y++) for (let x = 0; x < baseWidth; x++) committed.data.set([x * 3 % 256, y * 7 % 256, (x + y) % 256, 128], (y * baseWidth + x) * 4);
  const originalBytes = committed.data.slice(), base = new TestImageData(65, 33);
  const ox = bitmapCenterOffset(65, baseWidth), oy = bitmapCenterOffset(33, baseHeight);
  for (let y = 0; y < 33; y++) for (let x = 0; x < 65; x++) {
    const sx = x - ox, sy = y - oy;
    if (sx >= 0 && sy >= 0 && sx < baseWidth && sy < baseHeight) base.data.set(committed.data.subarray((sy * baseWidth + sx) * 4, (sy * baseWidth + sx) * 4 + 4), (y * 65 + x) * 4);
  }
  const paint = { variant: "Glow" as const, color: "#306090", opacityByte: 128 };
  const originalWriter = coverage.createPaintCoverageWriter(null, 65, 33);
  originalWriter.set(64, 1, { key: paint, base: [0, 0, 0, 0], coverage: 50, pigment: [48, 96, 144] });
  const originalCoverage = originalWriter.finish(), originalCoverageBytes = JSON.stringify(originalCoverage);
  const visible = base.data.slice(); let writes = 0;
  const canvas = { width: 65, height: 33, getContext: () => ({
    getImageData: () => { throw new Error("canonical presenter must not read GPU pixels"); },
    putImageData: (image: TestImageData, left: number, top: number) => {
      check(left >= 0 && top >= 0 && left + image.width <= 65 && top + image.height <= 33, "presented tile stays in stage"); writes++;
      for (let y = 0; y < image.height; y++) visible.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((top + y) * 65 + left) * 4);
    },
  }) };
  const writer = coverage.createPaintCoverageWriter(originalCoverage, 65, 33);
  const draft = { engine: { options: { key: paint } }, erase, baseCoverage: originalCoverage, writer, candidateWriter: writer, baseWriter: coverage.createPaintCoverageWriter(originalCoverage, 65, 33), tiles: new Map(), dirty: null, presented: null };
  const present = vm.runInNewContext(ts.transpileModule(`(${presentExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { ...environment, MaximumMask, unionRect, mergePaintPixel, compositeRasterPaint, canvasRef: { current: canvas }, authoringCommittedBitmapRef: { current: committed }, rasterDraftRef: { current: draft } }) as (preview: unknown) => void;
  const stable = new MaximumMask(65, 33), tail = new MaximumMask(65, 33);
  [[64, 0], [64, 1], [64, 31], [0, 32], [32, 32], [64, 32]].forEach(([x, y], i) => tail.set(x, y, 30 + i * 10, i * 12));
  for (const phase of [0, 1, 2, 3]) {
    // Stable content appears in a formerly absent tile while the previous tail
    // disappears, including a point that had original coverage.
    if (phase) stable.set(33, 32, 128, phase >= 2 ? 170 : 90);
    const currentTail = phase ? new MaximumMask(65, 33) : tail;
    const preview = { stable, tail: currentTail, changed: { left: 0, top: 0, width: 65, height: 33 } };
    present(preview);
    for (let y = 0; y < 33; y++) for (let x = 0; x < 65; x++) {
      const offset = (y * 65 + x) * 4, original = coverage.getPaintCoverage(originalCoverage, x, y);
      const [sa, sl] = stable.get(x, y), [ta, tl] = currentTail.get(x, y), alpha = Math.max(sa, ta);
      let expectedPixel = original, expectedBytes = Array.from(base.data.subarray(offset, offset + 4));
      if (alpha && erase) { expectedPixel = null; expectedBytes[3] = Math.round(expectedBytes[3] * (255 - alpha) / 255); if (!expectedBytes[3]) expectedBytes = [0, 0, 0, 0]; }
      else if (alpha) { expectedPixel = mergePaintPixel(original, expectedBytes, paint, alpha, Math.max(sl, tl)); expectedBytes = compositeRasterPaint(expectedPixel); }
      eq(Array.from(visible.subarray(offset, offset + 4)), expectedBytes, "actual presenter matches independent per-pixel mask reads");
      eq(draft.writer.get(x, y), expectedPixel, "actual presenter retains exact original or merged provenance");
    }
    const previousWrites = writes; present(preview); eq(writes, previousWrites, "identical preview object is a no-op");
  }
  draft.writer.finish(); eq(committed.data, originalBytes, "presenter preserves canonical bitmap"); eq(JSON.stringify(originalCoverage), originalCoverageBytes, "presenter preserves original coverage");
}
check(Boolean(sketchAddsExpression), "actual Sketch draft paint predicate found");
{
  const paint = { variant: "Sketch" as const, color: "#306090", opacityByte: 128 };
  const originalWriter = coverage.createPaintCoverageWriter(null, 16, 16);
  const originalPixel = { key: paint, base: [0, 0, 0, 0] as [number, number, number, number], coverage: 128, pigment: [48, 96, 144] as [number, number, number], owners: ["existing-gesture"] };
  originalWriter.set(5, 5, originalPixel);
  const originalCoverage = originalWriter.finish(), originalBytes = JSON.stringify(originalCoverage), committed = new TestImageData(16, 16);
  committed.data.set(compositeRasterPaint(originalPixel), (5 * 16 + 5) * 4);
  const writer = coverage.createPaintCoverageWriter(originalCoverage, 16, 16);
  const draft = { engine: { options: { key: paint } }, erase: false, ownerId: "new-gesture", baseCoverage: originalCoverage, writer, candidateWriter: writer, baseWriter: coverage.createPaintCoverageWriter(originalCoverage, 16, 16), tiles: new Map(), dirty: null, presented: null };
  const canvas = { width: 16, height: 16, getContext: () => ({ putImageData: () => {} }) };
  const sketchDraftAddsPaint = vm.runInNewContext(ts.transpileModule(`(${sketchAddsExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  const present = vm.runInNewContext(ts.transpileModule(`(${presentExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { ...environment, MaximumMask, unionRect, mergePaintPixel, compositeRasterPaint, sketchDraftAddsPaint, canvasRef: { current: canvas }, authoringCommittedBitmapRef: { current: committed }, rasterDraftRef: { current: draft } }) as (preview: unknown) => void;
  for (const addsPaint of [false, true, false]) {
    const tail = new MaximumMask(16, 16); tail.set(5, 5, 128, 0); if (addsPaint) tail.set(6, 5, 128, 0);
    present({ stable: new MaximumMask(16, 16), tail, changed: { left: 0, top: 0, width: 16, height: 16 } });
    check(draft.writer === (addsPaint ? draft.candidateWriter : draft.baseWriter), "preview exposes the candidate only while Sketch adds paint");
    eq(draft.writer.get(5, 5)?.owners, addsPaint ? ["existing-gesture", "new-gesture"] : ["existing-gesture"], "late-added ink owns earlier overlapping pixels; a no-op exposes original ownership");
    const released = draft.writer.finish();
    eq(coverage.getPaintCoverage(released, 5, 5)?.owners, draft.writer.get(5, 5)?.owners, "preview and release expose identical ownership");
    if (!addsPaint) check(coverage.paintCoveragesEqual(released, originalCoverage), "no-op release retains exact original coverage");
    eq(JSON.stringify(originalCoverage), originalBytes, "candidate selection preserves original coverage");
  }
}
let markExpression = "";
const findCanvasMark = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(canvasParsed) === "markAuthoringChangesCommitted" && node.initializer && ts.isCallExpression(node.initializer)) {
    markExpression = node.initializer.arguments[0].getText(canvasParsed);
  }
  ts.forEachChild(node, findCanvasMark);
};
findCanvasMark(canvasParsed); check(Boolean(markExpression), "actual canvas commit marker found");
let endStrokeExpression = "";
const findEndStroke = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(canvasParsed) === "endCanvasStroke" && node.initializer) endStrokeExpression = node.initializer.getText(canvasParsed);
  ts.forEachChild(node, findEndStroke);
};
findEndStroke(canvasParsed); check(Boolean(endStrokeExpression), "actual selection release handler found");
for (const didTransform of [false, true]) {
  const events: string[] = [], interaction = { current: { owner: "knife", didTransform } as { owner: string; didTransform: boolean } | null };
  const end = vm.runInNewContext(ts.transpileModule(`(${endStrokeExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    rasterDraftRef: { current: null }, placedImageInteractionRef: { current: null }, bitmapSelectionInteractionRef: interaction,
    moveCanvasStroke: () => events.push("final-sample"), getBitmapSelectionSessionForOwner: () => ({ owner: "knife", items: [{}] }),
    markAuthoringDirty: () => events.push("dirty"), onAuthoringActionCommitted: () => { check(interaction.current === null, "Knife seals interaction before synchronous publication"); events.push("commit"); },
    scheduleBitmapSelectionBackdropRestore: () => events.push("restore"),
  });
  end({ type: "pointerup", pointerId: 1, currentTarget: { hasPointerCapture: () => false } });
  eq(events, didTransform ? ["final-sample", "dirty", "commit", "restore"] : ["final-sample"], "Knife movement is marked dirty before publication; a click creates no edit");
}
let fillExpression = "";
const findFill = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && node.name.getText(canvasParsed) === "fillConnectedRegion" && node.initializer) fillExpression = node.initializer.getText(canvasParsed);
  ts.forEachChild(node, findFill);
};
findFill(canvasParsed); check(Boolean(fillExpression), "actual Fill function found");
for (const outcome of ["success", "failure", "noop"]) {
  const committed = new TestImageData(8, 8);
  for (let i = 0; i < committed.data.length; i += 4) committed.data.set([37, 92, 141, 1], i);
  for (const y of [3, 4]) for (const x of [3, 4]) committed.data.set([0, 0, 0, 255], (y * 8 + x) * 4);
  let displayed = new TestImageData(committed.data.slice(), 8, 8);
  const original = displayed.data.slice(), pending = { current: false }, prepared = { current: null as TestImageData | null };
  let snapshot: TestImageData | null = null, commits = 0, notices = 0;
  const canvas = { width: 8, height: 8, getContext: () => ({ getImageData: () => new TestImageData(displayed.data.slice(), 8, 8), putImageData: (image: TestImageData) => { displayed = new TestImageData(image.data.slice(), 8, 8); } }) };
  const fill = vm.runInNewContext(ts.transpileModule(`(${fillExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    ...environment, canvasRef: { current: canvas }, hasPendingAuthoringChangesRef: pending, authoringCommittedBitmapRef: { current: committed }, preparedFillSnapshotRef: prepared,
    fillColor: "test", fillTolerance: 0, parseHexColor: () => outcome === "noop" ? { r: 0, g: 0, b: 0, a: 255 } : { r: 0, g: 170, b: 255, a: 255 },
    getCanvasPoint: () => ({ pixelX: 3, pixelY: 3 }), markAuthoringDirty: () => { pending.current = true; }, markAuthoringChangesCommitted: () => { pending.current = false; },
    onAuthoringActionCommitted: (reason: string) => { eq(reason, "fill", "Fill has an explicit commit boundary"); commits++; snapshot = prepared.current; if (outcome === "failure") return false; pending.current = false; return true; },
    window: { alert: () => { notices++; } },
  });
  fill({}); eq(commits, outcome === "noop" ? 0 : 1, `${outcome}: Fill command count`); check(!pending.current && prepared.current === null, `${outcome}: Fill scratch and pending state released`);
  if (outcome === "failure" || outcome === "noop") { eq(displayed.data, original, `${outcome}: prior pixels preserved`); eq(notices, outcome === "failure" ? 1 : 0, `${outcome}: failure notice`); }
  else {
    check(snapshot !== null, "Fill capture uses prepared canonical pixels"); const data = (snapshot as unknown as TestImageData).data;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) eq(data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4), new Uint8ClampedArray(x >= 3 && x <= 4 && y >= 3 && y <= 4 ? [0, 170, 255, 255] : [37, 92, 141, 1]), "Fill changes only its connected target and retains unrelated low-alpha bytes");
  }
}
let incrementalCapture = "";
const findIncrementalCapture = (node: ts.Node) => {
  if (ts.isIfStatement(node) && node.expression.getText(canvasParsed) === "canUseDirtyPatch") incrementalCapture = node.thenStatement.getText(canvasParsed);
  ts.forEachChild(node, findIncrementalCapture);
};
findIncrementalCapture(canvasParsed); check(Boolean(incrementalCapture), "actual incremental capture branch found");
{
  const committedBitmap = new TestImageData(103, 41), canvas = { width: 96, height: 32 };
  for (let i = 0; i < committedBitmap.data.length; i += 4) committedBitmap.data.set([37, 92, 141, 1], i);
  const dirtyRect = { left: 0, top: 0, width: 96, height: 32 };
  const preparedWriter = coverage.createPaintCoverageWriter(null, 96, 32);
  preparedWriter.set(45, 12, { key: { variant: "Brush", color: "#255c8d", opacityByte: 1 }, base: [0, 0, 0, 0], pigment: [37, 92, 141], coverage: 1 });
  const prepared = { preparedCoverage: preparedWriter.finish(), tiles: [0, 64].map(left => ({ left, top: 0, width: 32, height: 32, after: new Uint8ClampedArray(32 * 32 * 4).fill(left ? 128 : 26) })) };
  const capture = vm.runInNewContext(ts.transpileModule(`() => { let bitmapCaptureDurationMs = 0; ${incrementalCapture} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    ...environment, committedBitmap, canvas, dirtyRect, prepared, ENABLE_MOTION_TWEEN_DEBUG: false, captureVersion: 1, identity: { generation: 1, contextKey: "owner" }, performance: { now: () => 0 },
    sourceCtx: { getImageData: () => new TestImageData(new Uint8ClampedArray(96 * 32 * 4).fill(255), 96, 32) },
  });
  const result = capture() as { dirtyPatchBitmap: TestImageData };
  for (let y = 0; y < 32; y++) for (let x = 32; x < 64; x++) eq(result.dirtyPatchBitmap.data.slice((y * 96 + x) * 4, (y * 96 + x) * 4 + 4), new Uint8ClampedArray([37, 92, 141, 1]), "untouched gap uses exact centered authored low-alpha RGB");
  eq(result.dirtyPatchBitmap.data[0], 26, "first command tile overlays canonical base"); eq(result.dirtyPatchBitmap.data[64 * 4], 128, "last command tile overlays canonical base");
  check(coverage.paintCoveragesEqual(coverage.getBitmapPaintCoverage(result.dirtyPatchBitmap), prepared.preparedCoverage), "capture derives companion from validated command");
}
const lifecycle: Record<string, string> = {};
const findLifecycle = (node: ts.Node) => {
  if (ts.isPropertyAssignment(node) && ts.isArrowFunction(node.initializer) && ["prepareUnifiedCommit", "restoreAfterFailedUnifiedCommit", "takePresentedRasterCommit"].includes(node.name.getText(canvasParsed))) lifecycle[node.name.getText(canvasParsed)] = node.initializer.getText(canvasParsed);
  ts.forEachChild(node, findLifecycle);
};
findLifecycle(canvasParsed);
const originalBackdrop = { alpha: 0 }, fullRestoredDocument = { alpha: 128 }, backdropRef = { current: originalBackdrop };
let restoredAlpha = -1;
const lifecycleTest = vm.runInNewContext(ts.transpileModule(`let preparedUnifiedCommit = false; let rollbackBackdrop = null; const session = { floatingAlpha: 128 }; ({ prepare: ${lifecycle.prepareUnifiedCommit}, restore: ${lifecycle.restoreAfterFailedUnifiedCommit} })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
  bitmapSelectionBackdropCanvasRef: backdropRef, flushBitmapSelectionSessionState: () => { backdropRef.current = fullRestoredDocument; },
  scheduleBitmapSelectionBackdropRestore: () => { restoredAlpha = backdropRef.current.alpha; },
});
lifecycleTest.prepare(); backdropRef.current = fullRestoredDocument; lifecycleTest.restore();
check(backdropRef.current === originalBackdrop && restoredAlpha === 0, "failed symbol conversion restores original cut-out backdrop, without duplicating selected pixels");
for (const fault of ["crop", "attach", "none", "floating-selection"]) {
  const targetCanvas = { width: 12, height: 12 }, pending = { current: true }, dirty = { current: rect }, mode = { current: "full" };
  const committed = { current: null as TestImageData | null };
  const mark = vm.runInNewContext(ts.transpileModule(`(${markExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    ...environment, canvasRef: { current: targetCanvas }, authoringChangeVersionRef: { current: 7 }, bitmapSelectionSessionRef: { current: fault === "floating-selection" ? { items: [{}] } : null },
    presentedRasterCommitRef: { current: null }, preparedRasterCommandRef: { current: null }, currentRasterContextRef: { current: "layer:0" },
    hasPendingAuthoringChangesRef: pending, authoringDirtyRectRef: dirty, authoringDirtyCaptureModeRef: mode, authoringCommittedBitmapRef: committed,
    cropPaintCoverage: (...args: Parameters<typeof coverage.cropPaintCoverage>) => { if (fault === "crop") throw new Error(fault); return coverage.cropPaintCoverage(...args); },
    attachBitmapPaintCoverage: (...args: Parameters<typeof coverage.attachBitmapPaintCoverage>) => { if (fault === "attach") throw new Error(fault); return coverage.attachBitmapPaintCoverage(...args); },
  });
  mark(bitmap, 6); check(pending.current && committed.current === null && dirty.current === rect, "stale commit marker cannot publish");
  if (fault === "floating-selection") {
    const backdropCoverage = coverage.createPaintCoverageWriter(null, 12, 12).finish();
    coverage.attachBitmapPaintCoverage(targetCanvas, backdropCoverage);
    mark(bitmap, 7);
    check(coverage.getBitmapPaintCoverage(targetCanvas) === backdropCoverage, "floating selection commit retains the backdrop companion rather than publishing full-document coverage onto it");
    check(!pending.current && committed.current === bitmap, "floating selection publishes the composed snapshot for history without changing backdrop coverage");
  } else if (fault !== "none") {
    assert.throws(() => mark(bitmap, 7)); assertions++;
    check(pending.current && committed.current === null && dirty.current === rect && mode.current === "full", `${fault}: marker prepares before publication`);
    check(coverage.getBitmapPaintCoverage(targetCanvas) === null, `${fault}: canvas companion unchanged`);
  } else {
    mark(bitmap, 7); check(!pending.current && committed.current === bitmap && dirty.current === null && mode.current === "region", "successful marker publishes complete state");
    eq(coverage.getBitmapPaintCoverage(targetCanvas)?.width, 12, "marker maps companion into viewport");
  }
}

for (const mismatch of ["none", "bitmap", "context", "generation", "width", "height", "pending", "selection"]) {
  const ticket = { bitmap, contextKey: "layer:0", generation: 7, width: 12, height: 12 };
  const presented = { current: ticket as typeof ticket | null };
  const take = vm.runInNewContext(ts.transpileModule(`(${lifecycle.takePresentedRasterCommit})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    presentedRasterCommitRef: presented, canvasRef: { current: { width: mismatch === "width" ? 13 : 12, height: mismatch === "height" ? 13 : 12 } },
    currentRasterContextRef: { current: mismatch === "context" ? "other:0" : "layer:0" }, authoringChangeVersionRef: { current: mismatch === "generation" ? 8 : 7 },
    hasPendingAuthoringChangesRef: { current: mismatch === "pending" }, bitmapSelectionSessionRef: { current: { items: mismatch === "selection" ? [{}] : [] } },
  });
  eq(take(mismatch === "bitmap" ? new TestImageData(12, 12) : bitmap), mismatch === "none", `${mismatch}: skip only the exact already-presented commit`);
  eq(presented.current, null, "presentation ticket consumes once"); eq(take(bitmap), false, "later restore cannot reuse a presentation ticket");
}

const currentIdentity = { generation: 5, contextKey: "layer:2" };
for (const fault of ["layer-allocation", "stick-allocation", "catalog-allocation", "instances-allocation", "render", "none"]) {
  const oldLayers = [{ id: "old", timelineFrames: [{ id: 1 }] }], nextLayers = [{ id: "next", timelineFrames: [{ id: 2 }] }];
  const refs = {
    layersRef: { current: oldLayers }, timelineFramesRef: { current: oldLayers[0].timelineFrames }, activeLayerIdRef: { current: "old" },
    currentFrameIndexRef: { current: 0 }, selectedTimelineIndexRef: { current: 0 }, nextTimelineFrameIdRef: { current: 8 }, nextLayerNumberRef: { current: 5 },
    stickByCellRef: { current: { old: "stick" } }, unifiedCatalogsRef: { current: { old: "catalog" } }, symbolInstancesByCellRef: { current: { old: "instances" } },
    localDrawingHistoryRef: { current: new Map([["old:0", { entries: [1], position: 0 }]]) }, historyWorkspaceStampRef: { current: "before" },
    timelineRowLayersSourceRef: { current: oldLayers }, resizeCommitSessionRef: { current: null }, frozenTweenPlaybackCacheRef: { current: new Map() },
    suppressNextWorkspaceAutosaveRef: { current: false }, isTimelinePlayingRef: { current: false },
  };
  const beforeRefs = Object.fromEntries(Object.entries(refs).map(([name, ref]) => [name, ref.current]));
  let cloneNumber = 0, renderNumber = 0;
  const restore = loadCallback("restoreWorkspaceHistoryEntry", {
    ...refs, workspaceLayersStructureEqual: () => false, normalizeLayerOrder: (v: unknown) => v,
    cloneWorkspaceLayers: () => { if (fault === "layer-allocation") throw new Error(fault); return nextLayers; },
    getLayerById: (layers: typeof oldLayers, id: string) => layers.find(layer => layer.id === id),
    getGlobalTimelineFrameCount: () => 1, getMaxTimelineFrameId: () => 2, getNextLayerNumber: () => 2,
    structuredClone: (value: unknown) => {
      cloneNumber++;
      if (cloneNumber === ["stick-allocation", "catalog-allocation", "instances-allocation"].indexOf(fault) + 1) throw new Error(fault);
      return structuredClone(value);
    },
    drawingCanvasRef: { current: { clearTransientEditingState: () => {} } },
    clearLocalDrawingHistory: () => refs.localDrawingHistoryRef.current.clear(), stopTimelinePlaybackAudio: () => {},
    setLayers: () => {}, setActiveLayerId: () => {}, setCurrentFrameIndex: () => {}, setSelectedTimelineIndex: () => {}, setIsTimelinePlaying: () => {},
    setStickByCell: () => {}, setUnifiedCatalogs: () => {}, setSymbolInstancesByCell: () => {},
    renderWorkspaceCanvases: () => { if (fault === "render" && ++renderNumber === 1) throw new Error(fault); },
    updateHistoryWorkspaceStamp: () => {}, syncHistoryAvailability: () => {}, window: { requestAnimationFrame: (fn: () => void) => fn() },
  });
  const entry = { layers: nextLayers, activeLayerId: "next", currentFrameIndex: 0, selectedTimelineIndex: 0, nextTimelineFrameId: 3, nextLayerNumber: 2, stickByCell: { next: "stick" }, unifiedCatalogs: { next: "catalog" }, symbolInstancesByCell: { next: "instances" } };
  if (fault === "none") { eq(restore(entry, "undo"), true, "prepared history restoration succeeds"); check(refs.layersRef.current === nextLayers, "successful history installs target layers"); }
  else {
    assert.throws(() => restore(entry, "undo")); assertions++;
    for (const name of ["layersRef", "timelineFramesRef", "activeLayerIdRef", "currentFrameIndexRef", "selectedTimelineIndexRef", "nextTimelineFrameIdRef", "nextLayerNumberRef", "stickByCellRef", "unifiedCatalogsRef", "symbolInstancesByCellRef", "historyWorkspaceStampRef", "timelineRowLayersSourceRef"] as const) {
      check(refs[name].current === beforeRefs[name], `${fault}: preserves ${name}`);
    }
    check(refs.localDrawingHistoryRef.current.has("old:0") && !refs.suppressNextWorkspaceAutosaveRef.current, `${fault}: preserves local history and autosave guard`);
  }
}
for (const direction of ["undo", "redo"] as const) for (const fault of ["target", "render", "stamp", "availability", "none"]) {
  const layers = [{ id: "owner" }], frames = [{ id: 1 }], stack = { entries: ["first", "second"], position: direction === "undo" ? 1 : 0 };
  const refs = {
    layersRef: { current: layers }, timelineFramesRef: { current: frames }, currentFrameIndexRef: { current: 2 }, selectedTimelineIndexRef: { current: 2 },
    timelineRowLayersSourceRef: { current: layers }, historyWorkspaceStampRef: { current: "original" }, activeLayerIdRef: { current: "owner" },
    localDrawingHistoryRef: { current: new Map([["owner", stack]]) },
  };
  const traverse = loadCallback("applyLocalDrawingHistoryTraversal", {
    ...refs, resolveLocalDrawingHistoryContext: () => ({ key: "owner" }),
    applyLocalDrawingHistoryEntry: () => {
      if (fault === "target") return false;
      refs.layersRef.current = []; refs.timelineFramesRef.current = []; refs.currentFrameIndexRef.current = 9; refs.selectedTimelineIndexRef.current = 9;
      if (fault === "render") throw new Error(fault);
      return true;
    },
    updateHistoryWorkspaceStamp: () => { refs.historyWorkspaceStampRef.current = "changed"; if (fault === "stamp") throw new Error(fault); },
    syncHistoryAvailability: () => { if (fault === "availability") throw new Error(fault); },
    setLayers: () => {}, setCurrentFrameIndex: () => {}, setSelectedTimelineIndex: () => {}, renderWorkspaceCanvases: () => {},
  });
  if (fault === "none") { eq(traverse(direction), true, `${direction}: local history succeeds`); eq(refs.localDrawingHistoryRef.current.get("owner")!.position, direction === "undo" ? 0 : 1, "local history advances once"); }
  else {
    assert.throws(() => traverse(direction)); assertions++;
    check(refs.layersRef.current === layers && refs.timelineFramesRef.current === frames && refs.timelineRowLayersSourceRef.current === layers, `${direction}/${fault}: local history retains original document`);
    check(refs.currentFrameIndexRef.current === 2 && refs.selectedTimelineIndexRef.current === 2 && refs.historyWorkspaceStampRef.current === "original", `${direction}/${fault}: local history retains navigation and stamp`);
    check(refs.localDrawingHistoryRef.current.get("owner") === stack, `${direction}/${fault}: local history retains exact stack and position`);
  }
}
for (const direction of ["undo", "redo"] as const) for (const outcome of ["throws", "rejected", "success"]) {
  const index = { current: 1 }, applying = { current: false }; let failed = false;
  const handler = loadCallback(direction === "undo" ? "handleUndo" : "handleRedo", {
    isTimelinePlayingRef: { current: false }, isApplyingHistoryRef: applying, canUndoHistory: true, canRedoHistory: true,
    commitCurrentFrameSnapshotWithoutHistory: () => true, applyLocalDrawingHistoryTraversal: () => false,
    syncCurrentWorkspaceForHistoryTraversal: () => true, findRelevantHistoryIndexForCurrentContext: () => direction === "undo" ? 0 : 2,
    historyEntriesRef: { current: [{}, {}, {}] }, currentHistoryIndexRef: index, syncHistoryAvailability: () => {}, updateHistoryWorkspaceStamp: () => {},
    restoreWorkspaceHistoryEntry: () => { check(index.current === 1, "history cursor remains old during fallible restoration"); if (outcome === "throws") throw new Error("allocation"); return outcome === "success"; },
    setSaveState: () => { failed = true; }, window: { requestAnimationFrame: (fn: () => void) => fn() },
  });
  handler(); eq(index.current, outcome === "success" ? direction === "undo" ? 0 : 2 : 1, `${direction}/${outcome}: cursor publishes only after success`);
  check(!applying.current && (outcome !== "throws" || failed), `${direction}/${outcome}: traversal guard and failure state`);
}
for (const stamped of [true, false]) {
  const entry = { activeLayerId: "old", currentFrameIndex: 0, selectedTimelineIndex: 0, layers: [bitmap] };
  const history = { current: [entry] };
  const record = loadCallback("recordUndoSnapshot", {
    isApplyingHistoryRef: { current: false }, currentHistoryIndexRef: { current: 0 }, historyEntriesRef: history,
    activeLayerIdRef: { current: "target" }, currentFrameIndexRef: { current: 2 }, selectedTimelineIndexRef: { current: 2 },
    isCurrentWorkspaceStampedInHistory: () => stamped, commitHistoryEntry: () => 0, createHistoryEntryFromWorkspace: () => ({}), updateHistoryWorkspaceStamp: () => {},
  });
  eq(record(), 0, "navigation capture adds no history entry");
  check(history.current.length === 1 && history.current[0].layers === entry.layers && history.current[0].activeLayerId === "target" && history.current[0].currentFrameIndex === 2, "pre-command history retains active target without copying authored pixels");
}
let normalizationFailed = false;
for (const fault of ["after-raster", "after-structured", "history", "rejected"]) {
  const prior = { layers: [{ bitmap }], frames: [{ bitmap }], stick: { original: 1 }, catalogs: { original: 2 }, instances: { original: 3 }, history: ["original"] };
  const refs = {
    layersRef: { current: prior.layers }, timelineFramesRef: { current: prior.frames }, stickByCellRef: { current: prior.stick },
    unifiedCatalogsRef: { current: prior.catalogs }, symbolInstancesByCellRef: { current: prior.instances }, historyEntriesRef: { current: prior.history },
    currentHistoryIndexRef: { current: 3 }, localDrawingHistoryRef: { current: new Map([["owner", "original"]]) },
    historyWorkspaceStampRef: { current: "before" }, timelineRowLayersSourceRef: { current: prior.layers },
    currentFrameIndexRef: { current: 0 }, activeLayerIdRef: { current: "owner" },
  };
  let failed = false;
  const transaction = loadCallback("runCompoundAuthoringAction", {
    ...refs, setLayers: () => {}, setStickByCell: () => {}, setUnifiedCatalogs: () => {}, setSymbolInstancesByCell: () => {},
    drawingCanvasRef: { current: { clearTransientEditingState: () => {} } }, renderWorkspaceCanvases: () => {},
    syncHistoryAvailability: () => {}, setSaveState: () => { failed = true; },
  });
  eq(transaction(() => {
    refs.layersRef.current = []; refs.timelineFramesRef.current = [];
    if (fault === "after-raster") throw new Error(fault);
    refs.stickByCellRef.current = { original: 9 }; refs.unifiedCatalogsRef.current = { original: 9 }; refs.symbolInstancesByCellRef.current = { original: 9 };
    if (fault === "after-structured") throw new Error(fault);
    refs.historyEntriesRef.current = []; refs.currentHistoryIndexRef.current = 10; refs.localDrawingHistoryRef.current.clear();
    if (fault === "history") throw new Error(fault);
    return false;
  }), false, `${fault}: compound mutation rejects`);
  check(refs.layersRef.current === prior.layers && refs.timelineFramesRef.current === prior.frames && refs.stickByCellRef.current === prior.stick && refs.unifiedCatalogsRef.current === prior.catalogs && refs.symbolInstancesByCellRef.current === prior.instances, `${fault}: raster and structured document roll back together`);
  check(refs.historyEntriesRef.current === prior.history && refs.currentHistoryIndexRef.current === 3 && refs.localDrawingHistoryRef.current.get("owner") === "original", `${fault}: compound history remains exact`);
  check(failed && refs.historyWorkspaceStampRef.current === "before", `${fault}: compound failure remains visible`);
}
const safeExtent = loadFunctions(["captureForExtent"], {
  captureOptions: {}, captureCanvasSnapshot: () => ({ bitmap }), normalizeCapturedSnapshotExtent: () => { throw new Error("allocation"); },
  setSaveState: () => { normalizationFailed = true; },
}).captureForExtent;
eq(safeExtent(bitmap), null, "normalization failure returns null to caller guards"); check(normalizationFailed, "normalization failure is visible");
let readback: () => unknown = () => ({ bitmap, identity: { ...currentIdentity } });
const saveStates: string[] = [];
const capture = loadCallback("captureCanvasSnapshot", {
  drawingCanvasRef: { current: { getAuthoringSnapshotIdentity: () => ({ ...currentIdentity }), captureAuthoringSnapshot: () => readback() } },
  activeLayerIdRef: { current: "layer" }, currentFrameIndexRef: { current: 2 }, documentGenerationRef: { current: 0 },
  setSaveState: (state: string) => saveStates.push(state),
  hasSnapshotDirtyPatch: functions.hasSnapshotDirtyPatch, isBitmapDataShapeValid: functions.isBitmapDataShapeValid,
});
check(Boolean(capture()), "actual capture callback accepts complete same-owner readback");
for (const failure of [() => null, () => { throw new Error("readback failed"); },
  () => ({ bitmap, identity: { generation: 4, contextKey: "layer:2" } }),
  () => ({ bitmap: null, identity: { ...currentIdentity } }),
  () => { const identity = { ...currentIdentity }; currentIdentity.generation += 1; return { bitmap, identity }; },
]) {
  readback = failure;
  eq(capture(), null, "actual capture callback fails closed");
}
eq(saveStates.length, 5, "capture failures surface failed state");
eq(bitmap.data, frozenPixels, "failed readbacks cannot alter authored bytes");

const commit = (save: () => unknown) => loadCallback("commitCanvasAuthoringAction", {
  isTimelinePlayingRef: { current: false }, isApplyingHistoryRef: { current: false },
  timelineFramesRef: { current: [{ cellType: "keyframe" }] }, currentFrameIndexRef: { current: 0 }, activeLayerIdRef: { current: "layer" },
  drawingCanvasRef: { current: { hasPendingAuthoringChanges: () => true, getAuthoringSnapshotIdentity: () => ({ contextKey: "layer:0", generation: 1 }) } },
  resolveTimelineSnapshot: () => ({ bitmap: null }), saveCurrentFrameSnapshot: save, setSaveState: () => {},
});
const command: RasterGestureCommandV2 = {
  algorithmVersion: RASTER_ALGORITHM_VERSION, baseCoverage: null, preparedCoverage: null, baseDigest: "", preparedDigest: "",
  commandId: "drawing.raster-gesture.commit/v2", operationId: "test:1", contextKey: "layer:0", baseGeneration: 0, preparedGeneration: 1, erase: false,
  options: { key: { variant: "Brush", color: "#000000", opacityByte: 26 }, size: 4, smoothing: 0, brightness: 0, radius: 0, seed: 173, width: 1, height: 1, scaleX: 1, scaleY: 1 },
  samples: [{ x: .5, y: .5 }], tiles: [{ left: 0, top: 0, width: 1, height: 1, before: new Uint8ClampedArray(4), after: new Uint8ClampedArray([0, 0, 0, 26]) }],
};
const commandCoverage = coverage.createPaintCoverageWriter(null, 1, 1);
commandCoverage.set(0, 0, { key: command.options.key, base: [0, 0, 0, 0], pigment: [0, 0, 0], coverage: 26 });
command.preparedCoverage = commandCoverage.finish();
command.baseDigest = rasterCommandDigest(command.tiles, "before", null);
command.preparedDigest = rasterCommandDigest(command.tiles, "after", command.preparedCoverage);
for (const [pigment, valid] of [[[197, 211, 224], true], [[197, 96, 224], false], [[198, 211, 224], false]] as const) {
  const glow = structuredClone(command); glow.options.key = { variant: "Glow", color: "#306090", opacityByte: 26 }; glow.options.brightness = 100;
  const writer = coverage.createPaintCoverageWriter(null, 1, 1);
  writer.set(0, 0, { key: glow.options.key, base: [0, 0, 0, 0], pigment: [...pigment], coverage: 26 });
  glow.preparedCoverage = writer.finish(); glow.tiles[0].after.set([...pigment, 26]); glow.preparedDigest = rasterCommandDigest(glow.tiles, "after", glow.preparedCoverage);
  eq(validateRasterGestureCommand(glow, { contextKey: "layer:0", generation: 1, bitmap: null }), valid, "Glow channels must share one attainable light intensity");
}
eq(commit(() => null)("stroke", command), false, "commit signals failed capture to canvas rollback");
eq(commit(() => { throw new Error("allocation"); })("stroke", command), false, "commit signals thrown failure to rollback");
eq(commit(() => ({ bitmap }))("stroke", command), true, "commit signals completed snapshot");
eq(commit(() => { throw new Error("must not publish"); })("stroke", { ...command, contextKey: "stale" }), false, "stale command cannot publish");
for (const mutation of [{ samples: null }, { samples: [null] }, { samples: new Array(1) }, { tiles: null }, { tiles: [null] }, { tiles: [{}] }, { options: null }, { options: {} }, { preparedCoverage: { tiles: null } }, { operationId: 1 }, { erase: "false" }]) {
  check(!validateRasterGestureCommand({ ...command, ...mutation } as unknown as RasterGestureCommandV2, { contextKey: "layer:0", generation: 1, bitmap: null }), "malformed command rejects without throwing");
}
for (const mutate of [
  (value: RasterGestureCommandV2) => { value.preparedCoverage = null; value.tiles[0].after.set([0, 255, 0, 255]); },
  (value: RasterGestureCommandV2) => { value.preparedCoverage!.version = 8 as 1; },
  (value: RasterGestureCommandV2) => { value.samples = [{ x: .5001, y: .5 }]; },
  (value: RasterGestureCommandV2) => { value.samples = [{ x: .5, y: .5 }, { x: .51, y: .5 }]; },
  (value: RasterGestureCommandV2) => { value.options.seed = .5; },
]) {
  const invalid = structuredClone(command); mutate(invalid); invalid.preparedDigest = rasterCommandDigest(invalid.tiles, "after", invalid.preparedCoverage);
  check(!validateRasterGestureCommand(invalid, { contextKey: "layer:0", generation: 1, bitmap: null }), "self-consistent digest cannot authorize malformed paint, coverage, or canonical inputs");
}
{
  const invalid = structuredClone(command); invalid.options.width = 64; invalid.options.height = 32;
  invalid.tiles = [{ left: 0, top: 0, width: 32, height: 32, before: new Uint8ClampedArray(4096), after: new Uint8ClampedArray(4096) }]; invalid.tiles[0].after[3] = 26;
  const prepared = coverage.createPaintCoverageWriter(null, 64, 32), paint = { key: command.options.key, base: [0, 0, 0, 0] as [number, number, number, number], pigment: [0, 0, 0] as [number, number, number], coverage: 26 };
  prepared.set(0, 0, paint); prepared.set(40, 1, paint); invalid.preparedCoverage = prepared.finish();
  invalid.baseDigest = rasterCommandDigest(invalid.tiles, "before", null); invalid.preparedDigest = rasterCommandDigest(invalid.tiles, "after", invalid.preparedCoverage);
  check(!validateRasterGestureCommand(invalid, { contextKey: "layer:0", generation: 1, bitmap: null }), "coverage outside declared command tiles rejects even with matching digest");
}

let captureStillPending = true;
const historyApply = { current: false };
const snapshotBeforeSave = loadCallback("commitCurrentFrameSnapshotWithoutHistory", {
  isTimelinePlayingRef: { current: false }, isApplyingHistoryRef: historyApply,
  drawingCanvasRef: { current: { hasPendingAuthoringChanges: () => captureStillPending, cancelPendingAuthoringGesture: () => {} } },
  currentFrameIndexRef: { current: 0 }, activeLayerIdRef: { current: "layer" },
  saveCurrentFrameSnapshot: () => null,
  setSaveState: () => {},
});
eq(snapshotBeforeSave("save"), false, "failed capture blocks Save publication");
eq(historyApply.current, false, "failed Save capture restores history guard");
captureStillPending = false;
eq(snapshotBeforeSave("save"), true, "no pending edit does not require a replacement snapshot");

const report = { status: "PASS", assertions, sourcePath,
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  exercisedActualFunctions: [...exercisedFunctions].sort(),
  limits: "Deterministic source-extracted functions and runtime registry; real UI destructive flows and global Undo/Redo require browser proof." };
writeUnitResult("no-loss", sourceDigestBefore, report, assertions);
console.log(JSON.stringify(report));
