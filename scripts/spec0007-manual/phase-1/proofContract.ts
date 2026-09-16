import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const BASE_SHA = "1c5aee42fa87967ad058c00cc3d62b51589b77fa";
export const OUTPUT_ROOT = "output/spec-0007/phase-1";
export const FIXTURE_PATH = "scripts/fixtures/spec0007-manual/phase-1/contract.json";
export const FROZEN_FIXTURE_SHA = "53422413ca54aa8edb2239b0408a01705db486554a145d9f8f3033bcd18b723e";
export const SPEC_PATH = "docs/specs/0007-manual-editor-completion-and-ai-ready-tools.md";
export const SCOPE_PATH = `${OUTPUT_ROOT}/entry-scope.json`;
export const CONTRACT_PATH = "scripts/spec0007-manual/phase-1/proofContract.ts";
export const MANIFEST_PATH = `${OUTPUT_ROOT}/proof-manifest.json`;
export const PHASE5_LEGACY_PATH = "scripts/spec0006-unified/validatePhase5ToolsLibrary.ts";
export const PHASE5_LEGACY_SHA = "4a40a5ea5f58774277cf5768aa192f42f24ea1d683378c3f30e28c9222a5058e";
export const PHASE5_ADAPTER_PATH = `${OUTPUT_ROOT}/phase5-equivalence.mjs`;
export const PHASE5_RETIRED_ASSERTION = String.raw`assert.match(canvas, /drawBufferedBrushStroke\(ctx, !brushDidMoveRef\.current, "final-commit"\)/);`;
export function phase5AdapterSource(source: string): string {
  assert.equal(digest(source), PHASE5_LEGACY_SHA, "exact inherited Phase 5 source");
  assert.equal(source.split(PHASE5_RETIRED_ASSERTION).length, 2, "one exact retired assertion");
  const importText = 'from "./phase5CatalogOracle.ts"';
  assert.equal(source.split(importText).length, 2, "one inherited oracle import");
  return source.replace(PHASE5_RETIRED_ASSERTION, "// Retired renderer spelling: replacement behavior is bound separately.")
    .replace(importText, `from ${JSON.stringify(resolve("scripts/spec0006-unified/phase5CatalogOracle.ts"))}`);
}
export const EXACT_ALLOWLIST = [
  "src/components/workspace/DrawingCanvas.tsx",
  "src/components/workspace/DrawingWorkspace.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/lib/animation/unifiedAnimationContentV2.ts",
  "src/lib/animation/unifiedAnimationContractV2.ts",
  "src/lib/animation/unifiedRasterPaintCoverageV1.ts",
  "src/lib/animation/editorCommands/rasterGesture.ts",
  "src/lib/animation/editorCommands/destructiveRegistry.ts",
  FIXTURE_PATH,
  "scripts/spec0007-manual/phase-1/rasterOracle.ts",
  "scripts/spec0007-manual/phase-1/coveragePersistenceOracle.ts",
  "scripts/spec0007-manual/phase-1/noLossOracle.ts",
  "scripts/spec0007-manual/phase-1/browserProof.ts",
  "scripts/spec0007-manual/phase-1/recordProof.ts",
  "scripts/spec0007-manual/phase-1/validateProof.ts",
  "scripts/spec0007-manual/phase-1/regressions.ts",
  CONTRACT_PATH,
].sort();
export const RUNTIME_PATHS = EXACT_ALLOWLIST.filter(path => path.startsWith("src/"));
export const BUILD_STAMP_PATH = `${OUTPUT_ROOT}/production-build.json`;
export type BuildStamp = { kind: "phase1-production-build"; sourceDigest: string; buildId: string; runtime: Binding[]; files: Binding[] };
export function currentBuildStamp(): BuildStamp {
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
  return { kind: "phase1-production-build", sourceDigest: currentSourceDigest(), buildId: readFileSync(".next/BUILD_ID", "utf8").trim(), runtime: RUNTIME_PATHS.map(bind),
    files: [...files(".next/server"), ...files(".next/static")].sort().map(bind) };
}

export const REGRESSION_COMMANDS: Record<string, string[]> = Object.fromEntries([
  ["phase1-migration", "scripts/spec0006-unified/validatePhase1Migration.ts"],
  ["phase4a-foundation", "scripts/spec0006-unified/validatePhase4aNeutralFoundation.ts"],
  ["phase4b-workspace", "scripts/spec0006-unified/validatePhase4bNeutralWorkspace.ts"],
  ["phase5-tools-library", "scripts/spec0006-unified/validatePhase5ToolsLibrary.ts"],
  ["phase6-persistence", "scripts/spec0006-unified/validatePhase6Persistence.ts"],
  ["phase7-authority", "scripts/spec0006-unified/validatePhase7Authority.ts"],
  ["drawing-v1", "scripts/validateDrawingProjectV1Compatibility.ts"],
  ["drawing-v2-contract", "scripts/validateDrawingProjectV2Contract.ts"],
  ["drawing-v2-repository", "scripts/validateDrawingProjectV2Repository.ts"],
  ["drawing-v2-browser-engine", "scripts/validateDrawingProjectV2BrowserEngine.ts"],
  ["drawing-ai-memory", "scripts/validateDrawingProjectAiMemory.ts"],
  ["drawing-ai-memory-route", "scripts/validateDrawingProjectAiMemoryRouteSafety.ts"],
  ["drawing-ai-preferences", "scripts/validateDrawingAiControlPreferences.ts"],
  ["stick-history", "scripts/validateStickHistoryPersistence.ts"],
  ["stick-transaction", "scripts/validateStickFigureCommandTransaction.ts"],
  ["stick-ai-contracts", "scripts/validateStickFigureAiContracts.ts"],
  ["stick-ai-ui-adapter", "scripts/validateStickFigureAiUiAdapter.ts"],
  ["timeline-playback", "scripts/validateTimelinePlaybackSmoothing.ts"],
].map(([id, path]) => [id, ["node", "--experimental-strip-types", path]]));

export type ReceiptId = "raster" | "coverage-persistence" | "no-loss" | "browser" | "regressions" | "quality";
export const RECEIPT_PRODUCERS: Record<ReceiptId, string> = {
  raster: "scripts/spec0007-manual/phase-1/rasterOracle.ts",
  "coverage-persistence": "scripts/spec0007-manual/phase-1/coveragePersistenceOracle.ts",
  "no-loss": "scripts/spec0007-manual/phase-1/noLossOracle.ts",
  browser: "scripts/spec0007-manual/phase-1/browserProof.ts",
  regressions: "scripts/spec0007-manual/phase-1/regressions.ts",
  quality: "scripts/spec0007-manual/phase-1/recordProof.ts",
};
export const RECEIPT_IDS = Object.keys(RECEIPT_PRODUCERS) as ReceiptId[];
export const BROWSER_MODES = ["flow", "matrix", "transitions", "destructive", "persistence", "retention", "performance", "accessibility", "audio"] as const;
export type BrowserMode = typeof BROWSER_MODES[number];
export const BROWSER_TRAJECTORIES = ["fast-diagonal", "dot", "straight-line", "noisy-line", "circle", "spiral", "tight-s", "figure-eight", "sharp-corner", "boundary-zigzag"];
const protectedCase = "protected-two-layers-three-frames";
export const EXPECTED_BROWSER_CASES: Record<BrowserMode, string[]> = {
  flow: ["brush-preview-release-undo-redo", "escape-cancel", "ten-percent-repeat", "box-selection-retention", "save-retention", "reload-open-repeat", "save-as-original-copy",
    ...["Brush", "Pencil", "Sketch", "Pixelate", "Glow"].flatMap(variant => [10, 50].map(opacity => `same-paint/${variant}/${opacity}`)), "different-color-opacity-variant"],
  matrix: [protectedCase, ...["Brush", "Pencil", "Sketch", "Pixelate", "Glow"].flatMap(variant => [0, 50, 100].flatMap(level => BROWSER_TRAJECTORIES.map(path => `matrix/${variant}/${level}/${path}`)))],
  transitions: [protectedCase, "stationary-sketch", ...["escape", "pointercancel", "lostcapture", "tool", "tab", "frame", "layer", "playback"].map(value => `${value}-cancel`),
    "snapshot-failure-rollback", "viewport-shrink-grow-retention", "outside-release", "leave-return", "pointerup-final-sample-once", "project-close-unpublished-draft", "stale-queued-frame-capture", "stale-queued-layer-capture"],
  destructive: [protectedCase, ...["eraser", "knife", "shape-cutout", "delete-selection", "remove-frame", "delete-layer", "clear-canvas", "delete-instance", "delete-definition"].map(value => `${value}-target`),
    "clear-draw-undo-redo-history-isolation", "referenced-definition-rejected", "clear-confirmation-dismissed", "layer-confirmation-dismissed", "minimum-frame-layer-guards", ...["Pencil", "Sketch"].flatMap(tool => [0, 50].map(transparency => `knife-texture/${tool}/${transparency}`))],
  persistence: [protectedCase, "protected-save-edit-save-open", ...["missing", "corrupt"].map(value => `last-good-${value}-companion`),
    ...["encode", "hash", "decode", "readback", "quota", "publish"].map(value => `save-${value}-failure`), "delayed-save-keeps-newer-edit-dirty", "concurrent-tab-stale-cas", "save-as-failure-retains-unsaved-and-source", "protected-save-as-original-copy"],
  retention: [protectedCase, "shape-draw-retention", "fill-retention", ...["selection", "lasso"].flatMap(tool => ["move", "resize", "duplicate", "flip-x", "flip-y", "rotate"].map(action => `${tool}-${action}-retention`)), "text-edit-retention", "frame-copy-paste-companion", "scrub-retention", "onion-full-playback-retention", "onion-canonical-mask", "onion-canonical-lifecycle"],
  performance: ["representative-two-raster-open-save", ...["Brush", "Pencil", "Sketch", "Pixelate", "Glow"].map(value => `preview/${value}`), "scratch-heap-allocation-release"],
  accessibility: ["keyboard-focus-controls", "zoom-200-controls", "reduced-motion-stationary-cancel-release", "axe-complete"],
  audio: ["remove-attached-sound-target", "removed-sound-save-open-assets-retained"],
};
export function producerCommands(id: ReceiptId, url: string): Record<string, { argv: string[]; resultPath: string }> {
  if (id === "quality" || id === "regressions") return {};
  if (id !== "browser") return { [id]: { argv: ["node", "--experimental-strip-types", RECEIPT_PRODUCERS[id]], resultPath: `${OUTPUT_ROOT}/producer-results/${id}.json` } };
  return Object.fromEntries(["desktop", "compact"].flatMap(profile => BROWSER_MODES.map(mode => [
    `browser-${profile}-${mode}`,
    { argv: ["node", "--experimental-strip-types", RECEIPT_PRODUCERS.browser, ...(profile === "compact" ? ["--compact"] : []), ...(mode === "flow" ? [] : [`--${mode}`]), `--url=${url}`], resultPath: `${OUTPUT_ROOT}/browser/${profile}/${mode}/initial.json` },
  ])));
}
export type ProducerResult = {
  kind: "phase1-producer-result";
  version: 1;
  commandId: string;
  execution: "COMPLETE" | "INCOMPLETE" | "FAILED";
  sourceDigestBefore: string;
  sourceDigestAfter: string;
  producerSha256: string;
  fixtureSha256: string;
  completedCases: Array<{ id: string; assertions: number; evidenceIndex?: number }>;
  failures: unknown[];
  metrics: unknown;
};
export function writeUnitResult(id: "raster" | "coverage-persistence" | "no-loss", before: string, metrics: unknown, assertions: number, failures: unknown[] = []) {
  const result: ProducerResult = {
    kind: "phase1-producer-result", version: 1, commandId: id,
    execution: failures.length || before !== currentSourceDigest() ? "FAILED" : "COMPLETE",
    sourceDigestBefore: before, sourceDigestAfter: currentSourceDigest(), producerSha256: bind(RECEIPT_PRODUCERS[id]).sha256, fixtureSha256: bind(FIXTURE_PATH).sha256,
    completedCases: failures.length ? [] : [{ id: `${id}-executed-oracle`, assertions }], failures, metrics,
  };
  const path = producerCommands(id, "")[id].resultPath;
  mkdirSync(resolve(OUTPUT_ROOT, "producer-results"), { recursive: true }); writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
  return result;
}

export type Binding = { path: string; bytes: number; sha256: string };
export type Check = { id: string; actual: unknown; expected: unknown; note?: string };
export type CommandReceipt = {
  id: string;
  argv: string[];
  cwd: string;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  exitCode: number | null;
  stdout: Binding;
  stderr: Binding;
  sourceDigest: string;
  inheritedStructuralFailure?: {
    assertion: string; disposition: "UNRESOLVED" | "REPLACED";
    originalSource?: Binding; adaptedSource?: Binding; adapterCommand?: CommandReceipt; replacementProof?: Binding;
  };
};
export type BrowserProfileMetrics = {
  id: "desktop" | "compact";
  width: number;
  height: number;
  deviceScaleFactor: number;
  operations: string[];
  screenshots: string[];
  previewSamplesMs: Record<string, number[]>;
  pointerActiveLongTasksMs: number[];
  postReleaseNoopSamplesMs: number[];
  openSamplesMs: number[];
  saveSamplesMs: number[];
  settledHeapSamplesBytes: number[];
  transientHeapSamplesBytes: number[];
  maxRasterCompanionAllocationBytes: number;
  stationaryPreviewDigestChanges: number;
  previewCommitPixelMismatches: number;
  previewCommitCoverageMismatches: number;
  unexpectedHistoryEntries: number;
  cancellationDigestMismatches: number;
  noLossMismatches: number;
  drawUndoCycles: number;
  scratchBytesBaseline: number;
  scratchBytesAfterCycles: number;
  axeCritical: number;
  axeSerious: number;
  keyboardFocus: boolean;
  zoomPercent: number;
  reducedMotion: boolean;
  fullPlaybackTraversals: number;
};
export type BrowserMetrics = {
  buildMode: "production";
  browserVersion: string;
  methodology: { warmups: number; operationBoundaries: string; settling: string; fixtureDigest: string };
  profiles: BrowserProfileMetrics[];
  requests: Array<{ method: string; url: string; disposition: "loopback" | "mock-api" | "mock-favicon" | "blocked" }>;
  pageErrors: string[];
  consoleErrors: string[];
  realApiRequests: number;
  externalRequests: number;
  sourceStoreWrites: number;
  visibleInspection: { completed: boolean; notes: string; screenshotPaths: string[] };
};
export type BrowserRunMetrics = {
  profile: { id: "desktop" | "compact"; width: number; height: number; deviceScaleFactor: number };
  mode: BrowserMode; url: string; browserVersion: string;
  operations: Array<{ id: string; completed?: boolean; assertions?: number; [key: string]: unknown }>;
  requests: BrowserMetrics["requests"]; errors: string[];
  consoleMessages: Array<{ type: string; text: string }>;
  sourceStoreWrites: unknown[]; screenshots: Binding[];
  buildStamp: Binding | null; servedAssets: Binding[];
};
type SnapshotEvidence = { authored: string; pixels: string; centeredPixels: string; coveragePixels: string; centeredCoveragePixels: string; protected: string; historyPosition: number; historyLength: number; maximumAlpha: number; [key: string]: unknown };
const evidence = <T>(operation: BrowserRunMetrics["operations"][number], key: string): T => {
  assert.ok(Object.hasOwn(operation, key), `${operation.id}: missing ${key}`); return operation[key] as T;
};
export function assertPlaybackEvidence(operation: BrowserRunMetrics["operations"][number]) {
  assert.deepEqual(evidence<string[]>(operation, "playbackProbeFailures"), []);
  const observations = evidence<Array<{ key: string; at: number; playing: boolean; paintPassIndex: number }>>(operation, "playbackObservations");
  assert.ok(observations.length >= 4);
  const before = evidence<SnapshotEvidence>(operation, "before"), context = String(before.authoringContext), layer = context.slice(0, context.lastIndexOf(":"));
  const layers = before.normalizedLayers as Array<{ id: string; timelineFrames: Array<{ bitmap: { pixels: string } }> }>;
  assert.equal(layers.length, 2); assert.ok(layers.every(value => value.timelineFrames.length === 3));
  const layerOrder = layers.map(value => value.id).reverse();
  const precondition = evidence<{ pending: boolean[]; selections: boolean[]; bitmaps: number; layerOrder: string[] }>(operation, "playbackPrecondition");
  for (const values of [precondition.pending, precondition.selections]) assert.ok(Array.isArray(values) && values.length > 0 && values.every(value => value === false));
  assert.equal(precondition.bitmaps, 6); assert.deepEqual(precondition.layerOrder, layerOrder);
  const passes = evidence<Array<{ at: number; visibleAtClear: boolean; draws: Array<{ source: { layerId: string; frameIndex: number; bitmapHash: string } | null; args: number[] }> }>>(operation, "playbackPaintPasses");
  assert.ok(passes.length >= 4);
  const paintedFrames = passes.map((pass, index) => {
    assert.ok(Number.isFinite(pass.at) && pass.at >= 0 && pass.at < 6000); assert.equal(typeof pass.visibleAtClear, "boolean");
    if (index) assert.ok(pass.at >= passes[index - 1].at);
    assert.equal(pass.draws.length, layerOrder.length, "every playback pass paints both layers");
    const frame = pass.draws[0].source?.frameIndex; assert.ok(Number.isInteger(frame) && frame! >= 0 && frame! < 3);
    pass.draws.forEach((draw, drawIndex) => {
      assert.ok(draw.source); assert.equal(draw.source.layerId, layerOrder[drawIndex]); assert.equal(draw.source.frameIndex, frame);
      assert.match(draw.source.bitmapHash, /^[0-9a-f]{64}$/);
      assert.equal(draw.source.bitmapHash, layers.find(value => value.id === draw.source!.layerId)!.timelineFrames[frame!].bitmap.pixels, "actual paint source binds to the authored bitmap");
      assert.ok(Array.isArray(draw.args) && draw.args.length === 4 && draw.args.every(Number.isFinite)); assert.ok(draw.args[2] > 0 && draw.args[3] > 0);
    });
    if (index) { const previous = passes[index - 1].draws[0].source!.frameIndex; assert.ok(frame === previous || frame === (previous + 1) % 3, "paint passes cannot skip authored frames"); }
    return frame!;
  });
  const frames = observations.map((value, i) => {
    assert.equal(value.playing, true); assert.ok(Number.isFinite(value.at) && value.at >= 0 && value.at < 6000);
    if (i) assert.ok(value.at > observations[i - 1].at);
    const frame = Number(value.key.split(":").at(-1)); assert.ok(Number.isInteger(frame) && frame >= 0 && frame < 3); assert.equal(value.key, `${layer}:${frame}`);
    assert.ok(Number.isInteger(value.paintPassIndex) && value.paintPassIndex >= 0 && value.paintPassIndex < passes.length);
    assert.equal(paintedFrames[value.paintPassIndex], frame); assert.ok(passes[value.paintPassIndex].at <= value.at);
    if (value.paintPassIndex + 1 < passes.length) assert.ok(value.at <= passes[value.paintPassIndex + 1].at, "observation binds the latest started paint pass");
    if (i) assert.ok(value.paintPassIndex > observations[i - 1].paintPassIndex);
    if (i) assert.equal(frame, (Number(observations[i - 1].key.split(":").at(-1)) + 1) % 3, "every observed transition follows the full loop");
    return frame;
  });
  const firstZero = frames.indexOf(0); assert.ok(firstZero >= 0); assert.equal(operation.playbackStartIndex, firstZero);
  assert.equal(observations.length, firstZero + 4); assert.deepEqual(frames.slice(firstZero), [0, 1, 2, 0]);
  assert.deepEqual(evidence<string[]>(operation, "traversed"), observations.slice(firstZero).map(value => value.key));
  assert.equal(observations.at(-1)!.paintPassIndex, passes.length - 1, "terminal observation binds the last completed paint pass");
  const observedPaintFrames = paintedFrames.slice(observations[0].paintPassIndex).filter((frame, index, values) => index === 0 || frame !== values[index - 1]);
  assert.deepEqual(observedPaintFrames, frames, "observations cannot omit a nonduplicate painted frame");
}
const requireSnapshot = (value: unknown, label: string): SnapshotEvidence => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label}: snapshot object`);
  const snapshot = value as SnapshotEvidence;
  for (const key of ["authored", "pixels", "centeredPixels", "coveragePixels", "centeredCoveragePixels", "protected"]) assert.match(snapshot[key] as string, /^[0-9a-f]{64}$/, `${label}/${key}`);
  for (const key of ["width", "height", "historyPosition", "historyLength", "globalHistoryLength", "localHistoryLength", "maximumAlpha", "count"]) assert.ok(Number.isSafeInteger(snapshot[key]) && Number(snapshot[key]) >= 0, `${label}/${key}`);
  assert.ok(Number(snapshot.width) > 0 && Number(snapshot.height) > 0 && snapshot.maximumAlpha <= 255 && Number(snapshot.count) <= Number(snapshot.width) * Number(snapshot.height));
  assert.equal(snapshot.historyLength, Number(snapshot.globalHistoryLength) + Number(snapshot.localHistoryLength)); assert.ok(snapshot.historyPosition <= snapshot.historyLength);
  const layers = snapshot.normalizedLayers as Array<{ id: string; timelineFrames: unknown[] }>, inventory = snapshot.inventory as { layers: number; framesPerLayer: number[] };
  assert.ok(Array.isArray(layers) && layers.length > 0 && layers.every(layer => typeof layer.id === "string" && Array.isArray(layer.timelineFrames)));
  assert.equal(inventory.layers, layers.length); assert.deepEqual(inventory.framesPerLayer, layers.map(layer => layer.timelineFrames.length));
  assert.ok(Array.isArray(snapshot.normalizedProtected));
  assert.equal(snapshot.protected, digest(JSON.stringify(snapshot.normalizedProtected)), `${label}: protected payload hash`);
  assert.equal(snapshot.authored, digest(JSON.stringify([snapshot.normalizedLayers, snapshot.normalizedProtected])), `${label}: authored payload hash`);
  return snapshot;
};
const snapshotField = (operation: BrowserRunMetrics["operations"][number], key: string) => requireSnapshot(evidence(operation, key), `${operation.id}/${key}`);
const sameSnapshot = (a: SnapshotEvidence, b: SnapshotEvidence, keys = ["authored", "pixels", "coveragePixels"]) => {
  for (const key of keys) assert.deepEqual(a[key], b[key], `snapshot ${key}`);
};
const requireStored = (value: unknown) => {
  assert.ok(value && typeof value === "object"); const stores = value as Record<string, unknown[]>;
  for (const key of ["heads", "versions", "assets", "assetMetadata", "projects"]) assert.ok(Array.isArray(stores[key]), `missing store ${key}`);
  return stores;
};
const preservedStores = (before: unknown, after: unknown) => {
  const a = requireStored(before), b = requireStored(after); assert.deepEqual(b.heads, a.heads);
  for (const name of ["versions", "assets", "assetMetadata", "projects"]) for (const value of a[name]) assert.ok(b[name].some(next => JSON.stringify(value) === JSON.stringify(next)), `lost immutable ${name}`);
};
export function assertDestructiveEvidence(operation: BrowserRunMetrics["operations"][number]) {
  const before = snapshotField(operation, "before"), after = snapshotField(operation, "after");
  type Layer = { id: string; timelineFrames: Array<{ stateId: number; bitmap: unknown; [key: string]: unknown }>; [key: string]: unknown };
  const oldLayers = before.normalizedLayers as Layer[], nextLayers = after.normalizedLayers as Layer[];
  const layerId = evidence<string>(operation, "targetLayerId"), index = evidence<number>(operation, "targetFrameIndex");
  const oldLayer = oldLayers.find(layer => layer.id === layerId); assert.ok(oldLayer?.timelineFrames[index]);
  const expectedLayers = structuredClone(oldLayers), expectedLayer = expectedLayers.find(layer => layer.id === layerId)!;
  if (operation.id === "delete-layer-target") assert.deepEqual(nextLayers, oldLayers.filter(layer => layer.id !== layerId));
  else if (operation.id === "remove-frame-target") {
    // The existing timeline collapses the selected cell and appends one empty
    // slot, keeping its visible length. All surviving cells retain their bytes.
    const tail = nextLayers.find(layer => layer.id === layerId)!.timelineFrames.at(-1)!;
    assert.ok(Number.isSafeInteger(tail.id) && !oldLayer.timelineFrames.some(frame => frame.id === tail.id));
    assert.deepEqual(tail, { id: tail.id, stateId: tail.id, kind: "frame", cellType: "empty", bitmap: null, tweenEndBitmap: null, textObjects: [], soundAttachment: null, motionTween: null, hasTweenEndpoint: false, isBlank: false });
    expectedLayer.timelineFrames.splice(index, 1); expectedLayer.timelineFrames.push(tail); assert.deepEqual(nextLayers, expectedLayers);
  } else if (["delete-instance-target", "delete-definition-target"].includes(operation.id)) assert.deepEqual(nextLayers, oldLayers);
  else {
    // These native cases deliberately select only raster artwork. Their exact
    // target bitmap may change; all text, audio and other cells must survive.
    expectedLayer.timelineFrames[index].bitmap = nextLayers.find(layer => layer.id === layerId)!.timelineFrames[index].bitmap;
    assert.deepEqual(nextLayers, expectedLayers);
    const rect = ({ "eraser-target": [900, 320, 900, 530], "knife-target": [790, 290, 1110, 560], "shape-cutout-target": [838, 318, 922, 442], "delete-selection-target": [818, 328, 922, 462] } as Record<string, number[]>)[operation.id];
    if (rect) {
      const a = before.outsideRaster as { authorRect: number[]; rect: number[]; eraser: { size: number; pixelPath: number[][]; scaleX: number; scaleY: number; worldWidth: number; worldHeight: number; canvasWidth: number; canvasHeight: number } | null; pixels: string; coverage: string; pixelCount: number; coverageCount: number }, b = after.outsideRaster;
      assert.ok(a && a.pixelCount > 0 && a.coverageCount > 0); assert.deepEqual(a.authorRect, rect);
      if (operation.id === "eraser-target") {
        const e = a.eraser; assert.ok(e); assert.equal(e.size, 12); assert.equal(e.canvasWidth, before.width); assert.equal(e.canvasHeight, before.height);
        for (const value of [e.worldWidth, e.worldHeight, e.scaleX, e.scaleY]) assert.ok(Number.isFinite(value) && value > 0);
        assert.equal(e.scaleX, e.canvasWidth / e.worldWidth); assert.equal(e.scaleY, e.canvasHeight / e.worldHeight);
        assert.equal(e.pixelPath.length, 2); for (const point of e.pixelPath) { assert.equal(point.length, 2); assert.ok(point.every(Number.isFinite)); }
        const [p, q] = e.pixelPath, radius = e.size / 2 + .5 / Math.max(e.scaleX, e.scaleY) + .001;
        assert.deepEqual(a.rect, [Math.floor(Math.min(p[0], q[0]) - radius * e.scaleX), Math.floor(Math.min(p[1], q[1]) - radius * e.scaleY), Math.ceil(Math.max(p[0], q[0]) + radius * e.scaleX), Math.ceil(Math.max(p[1], q[1]) + radius * e.scaleY)].map(value => value === 0 ? 0 : value));
      }
      assert.match(a.pixels, /^[0-9a-f]{64}$/); assert.match(a.coverage, /^[0-9a-f]{64}$/); assert.deepEqual(b, a, "same-frame artwork outside the selected raster target survives");
    }
  }
  const oldProtected = before.normalizedProtected as Array<Record<string, unknown>>, nextProtected = after.normalizedProtected as typeof oldProtected;
  const expectedProtected = structuredClone(oldProtected);
  if (operation.id === "delete-instance-target") {
    const target = evidence<string>(operation, "targetItemId"), cellKey = `${layerId}:${oldLayer.timelineFrames[index].stateId}`; let removed = 0;
    assert.ok(target);
    for (const record of expectedProtected) if (Array.isArray(record[cellKey])) record[cellKey] = (record[cellKey] as Array<{ itemId: string }>).filter(item => { if (item.itemId === target) { removed++; return false; } return true; });
    assert.ok(removed > 0); assert.deepEqual(nextProtected, expectedProtected);
  } else if (operation.id === "delete-definition-target") {
    const target = evidence<string>(operation, "targetDefinitionId"); let removed = 0; assert.ok(target);
    for (const record of expectedProtected) if (Array.isArray(record.symbols)) record.symbols = (record.symbols as Array<{ definitionId: string }>).filter(item => { if (item.definitionId === target) { removed++; return false; } return true; });
    assert.ok(removed > 0); assert.deepEqual(nextProtected, expectedProtected);
  } else if (["delete-layer-target", "remove-frame-target"].includes(operation.id)) {
    const cellKey = `${layerId}:${oldLayer.timelineFrames[index].stateId}`;
    const outside = (records: typeof oldProtected) => records.map(record => Object.fromEntries(Object.entries(record).filter(([key]) => operation.id === "delete-layer-target" ? !key.startsWith(`${layerId}:`) : key !== cellKey)));
    assert.deepEqual(outside(nextProtected), outside(oldProtected));
  } else assert.deepEqual(nextProtected, oldProtected);
}
export function assertClipboardEvidence(operation: BrowserRunMetrics["operations"][number]) {
  const before = snapshotField(operation, "before"), after = snapshotField(operation, "after"), source = snapshotField(operation, "source");
  type Frame = { id: number; stateId: number; bitmap: unknown; textObjects: unknown[]; soundAttachment: unknown; [key: string]: unknown };
  type Layers = Array<{ id: string; timelineFrames: Frame[] }>;
  const sourceIndex = evidence<number>(operation, "sourceFrameIndex"), targetIndex = evidence<number>(operation, "targetFrameIndex"), layerId = evidence<string>(operation, "targetLayerId");
  assert.equal(sourceIndex, 0); assert.equal(targetIndex, 2); assert.equal(source.authored, before.authored);
  const expected = structuredClone(before.normalizedLayers) as Layers, layer = expected.find(layer => layer.id === layerId)!;
  const sourceFrame = (source.normalizedLayers as Layers).find(layer => layer.id === layerId)!.timelineFrames[sourceIndex], targetFrame = layer.timelineFrames[targetIndex];
  const isBlank = !(sourceFrame.bitmap || sourceFrame.textObjects.length);
  layer.timelineFrames[targetIndex] = { id: targetFrame.id, stateId: targetFrame.id, kind: "keyframe", cellType: isBlank ? "blank-keyframe" : "keyframe", isBlank, hasTweenEndpoint: false,
    bitmap: sourceFrame.bitmap, tweenEndBitmap: null, motionTween: null, soundAttachment: sourceFrame.soundAttachment, textObjects: sourceFrame.textObjects };
  assert.deepEqual(after.normalizedLayers, expected);
  const original = before.normalizedProtected as Array<Record<string, unknown>>, projected = structuredClone(original), actual = after.normalizedProtected as typeof original;
  const sourceKey = `${layerId}:${sourceFrame.stateId}`, targetKey = `${layerId}:${targetFrame.id}`;
  assert.equal(actual.length, projected.length);
  const rigIndex = original.findIndex(record => record[sourceKey] && typeof record[sourceKey] === "object" && "structureGraph" in (record[sourceKey] as object));
  const instanceIndex = original.findIndex(record => Array.isArray(record[sourceKey]));
  assert.ok(rigIndex >= 0 && instanceIndex >= 0 && rigIndex !== instanceIndex);
  projected[rigIndex][targetKey] = structuredClone(projected[rigIndex][sourceKey]);
  type Instance = { itemId: string; [key: string]: unknown };
  const sources = original[instanceIndex][sourceKey] as Instance[], targets = actual[instanceIndex][targetKey] as Instance[];
  assert.ok(Array.isArray(sources) && Array.isArray(targets)); assert.equal(targets.length, sources.length);
  const oldIds = new Set(Object.values(original[instanceIndex]).flatMap(value => (value as Instance[]).map(instance => instance.itemId)));
  assert.equal(new Set(targets.map(instance => instance.itemId)).size, targets.length);
  projected[instanceIndex][targetKey] = targets.map((instance, i) => {
    assert.ok(typeof instance.itemId === "string" && instance.itemId.length > 0 && !oldIds.has(instance.itemId));
    assert.deepEqual({ ...instance, itemId: sources[i].itemId }, sources[i]);
    return { ...sources[i], itemId: instance.itemId };
  });
  assert.deepEqual(actual, projected);
  sameSnapshot(snapshotField(operation, "strokeUndone"), after, ["authored"]); sameSnapshot(snapshotField(operation, "pasteUndoneAfterStroke"), before);
}
export function assertBrowserRun(result: ProducerResult, url: string, readBytes: (path: string) => Uint8Array = readFileSync): asserts result is ProducerResult & { metrics: BrowserRunMetrics } {
  const run = result.metrics as BrowserRunMetrics;
  assert.ok(BROWSER_MODES.includes(run.mode));
  assert.deepEqual(run.profile, readContract().profiles.find(profile => profile.id === run.profile.id));
  assert.equal(run.url, url); assert.equal(result.commandId, `browser-${run.profile.id}-${run.mode}`);
  assert.equal(result.execution, "COMPLETE");
  assert.deepEqual(result.completedCases.map(item => item.id).sort(), EXPECTED_BROWSER_CASES[run.mode].slice().sort());
  for (const completed of result.completedCases) {
    assert.ok(Number.isInteger(completed.evidenceIndex));
    const operation = run.operations[completed.evidenceIndex!];
    assert.equal(run.operations.filter(value => value.id === completed.id).length, 1, `${completed.id}: duplicate evidence`);
    assert.equal(operation.id, completed.id); assert.equal(operation.completed, true);
    assert.equal(operation.assertions, completed.assertions); assert.ok(completed.assertions > 0);
    const before = Object.hasOwn(operation, "before") ? snapshotField(operation, "before") : undefined, after = Object.hasOwn(operation, "after") ? snapshotField(operation, "after") : undefined;
    const undone = Object.hasOwn(operation, "undone") ? snapshotField(operation, "undone") : undefined, redone = Object.hasOwn(operation, "redone") ? snapshotField(operation, "redone") : undefined;
    if (before && undone && !operation.id.startsWith("same-paint/")) sameSnapshot(undone, before);
    if (after && redone) sameSnapshot(redone, after);
    const roundTrip = () => { assert.ok(before && after && undone && redone); assert.notEqual(after.authored, before.authored); };
    const unchanged = () => { assert.ok(before && after); sameSnapshot(after, before, ["authored", "pixels", "coveragePixels", "historyPosition", "historyLength"]); };
    if (operation.id === protectedCase) {
      const fixture = snapshotField(operation, "fixtureSnapshot");
      const inventory = fixture.inventory as { layers: number; framesPerLayer: number[]; rasterCells: number; textObjects: number; definitions: number; mixedDefinitions: number; instances: number; rigCells: number };
      assert.equal(inventory.layers, 2); assert.deepEqual(inventory.framesPerLayer, [3, 3]); assert.equal(inventory.rasterCells, 6); assert.equal(inventory.textObjects, 6);
      assert.ok(inventory.definitions >= 2 && inventory.mixedDefinitions >= 1 && inventory.instances >= 12 && inventory.rigCells >= 6);
    }
    if (operation.id.startsWith("matrix/")) {
      const [, tool, level, trajectory] = operation.id.split("/"); assert.equal(operation.tool, tool); assert.equal(operation.level, Number(level)); assert.equal(operation.trajectory, trajectory);
      assert.ok(before && after);
      const preview = snapshotField(operation, "preview");
      assert.equal(after.pixels, preview.pixels); assert.equal(after.coveragePixels, preview.coveragePixels); assert.equal(after.protected, before.protected);
      if (operation.level === 0) { assert.equal(after.authored, before.authored); assert.equal(after.historyLength, before.historyLength); }
      else { roundTrip(); assert.equal(after.historyPosition, before.historyPosition + 1); assert.equal(operation.redoDisabled, true); }
    }
    if (operation.id.endsWith("-cancel") || operation.id === "snapshot-failure-rollback" || operation.id.startsWith("stale-queued-")) {
      unchanged();
      if (run.mode === "transitions" && !operation.id.startsWith("stale-queued-")) assert.notEqual(snapshotField(operation, "preview").pixels, before!.pixels);
      if (operation.id.startsWith("stale-queued-")) { const ids = evidence<number[]>(operation, "staleIds"); assert.ok(ids.length > 0); assert.equal(operation.invoked, ids.length); assert.ok(Number(operation.cancelled) > 0); }
    }
    if (run.mode === "retention" && operation.id.endsWith("-retention") && !operation.id.startsWith("scrub") && !operation.id.startsWith("onion")) {
      assert.ok(before && after && undone && redone); assert.notEqual(after.authored, before.authored); assert.equal(after.protected, before.protected);
      assert.equal(undone.centeredPixels, before.centeredPixels); assert.equal(redone.centeredPixels, after.centeredPixels);
    }
    if (operation.id === "stationary-sketch") {
      const frames = evidence<string[]>(operation, "frames"), preview = snapshotField(operation, "preview"), coverageFrames = evidence<string[]>(operation, "coverageFrames");
      assert.equal(frames.length, 10); assert.ok(frames.every(value => value === preview.pixels)); assert.equal(coverageFrames.length, 10); assert.ok(coverageFrames.every(value => value === preview.coveragePixels)); unchanged();
    }
    if (run.mode === "destructive" && operation.id.endsWith("-target") || operation.id === "remove-attached-sound-target" || operation.id === "frame-copy-paste-companion") roundTrip();
    if (run.mode === "destructive" && operation.id.endsWith("-target")) assertDestructiveEvidence(operation);
    if (operation.id.startsWith("knife-texture/")) {
      const [, tool, transparency] = operation.id.split("/"); assert.equal(operation.tool, tool); assert.equal(operation.transparency, Number(transparency));
      assert.equal(operation.opacityByte, Math.round(255 * (1 - Number(transparency) / 100)));
      type Surface = { painted: number; wrongOpacity: number; wrongColor: number; mismatch: number; coverageCount: number; pixelHash: string; coverageHash: string };
      type State = { canvas: Surface; originGhostPixels: number; untouchedChanges: number; targetPixelCount: number; detachedPixels: number; wholeStroke: boolean; unrelatedPainted: number; items: Array<{ id: string; x: number; pixels: Surface }> };
      const initial = evidence<State>(operation, "initial"), cut = evidence<State>(operation, "cut"), moved = evidence<State>(operation, "moved"), frames = evidence<State[]>(operation, "settledFrames");
      assert.ok(initial.canvas.painted > 100); assert.equal(cut.items.length, 2); assert.equal(moved.items.length, 2); assert.equal(frames.length, 10);
      assert.notEqual(cut.items[0].x, moved.items[0].x);
      assert.equal(operation.moveCount, tool === "Sketch" ? 2 : 1);
      if (tool === "Sketch") {
        const authored = evidence<State>(operation, "authoredStroke");
        assert.equal(authored.wholeStroke, true); assert.equal(initial.wholeStroke, true); assert.ok(authored.detachedPixels > 0);
        assert.equal(authored.targetPixelCount, authored.canvas.painted); assert.equal(initial.targetPixelCount, authored.canvas.painted);
        assert.ok(initial.unrelatedPainted > 0); assert.equal(initial.canvas.painted, initial.targetPixelCount + initial.unrelatedPainted);
        assert.notEqual(cut.items[1].x, moved.items[1].x);
        for (const state of [cut, moved, ...frames]) { assert.equal(state.unrelatedPainted, initial.unrelatedPainted); assert.equal(state.canvas.painted, initial.unrelatedPainted); }
      }
      assert.deepEqual(cut.items.map(item => [item.id, item.pixels]), moved.items.map(item => [item.id, item.pixels]));
      assert.equal(cut.canvas.pixelHash, moved.canvas.pixelHash); assert.equal(cut.canvas.coverageHash, moved.canvas.coverageHash);
      for (const state of [initial, cut, moved, ...frames, evidence<State>(operation, "saved"), evidence<State>(operation, "reopened")]) for (const surface of [state.canvas, ...state.items.map(item => item.pixels)]) {
        assert.equal(surface.mismatch, 0); assert.equal(surface.wrongOpacity, 0); assert.equal(surface.wrongColor, 0); assert.equal(surface.coverageCount, surface.painted);
        assert.match(surface.pixelHash, /^[a-f0-9]{64}$/); assert.match(surface.coverageHash, /^[a-f0-9]{64}$/);
      }
      for (const state of [cut, moved, ...frames]) { assert.equal(state.originGhostPixels, 0); assert.equal(state.untouchedChanges, 0); }
      const cutSnapshot = snapshotField(operation, "cutSnapshot"), movedSnapshot = snapshotField(operation, "movedSnapshot"), savedSnapshot = snapshotField(operation, "savedSnapshot");
      assert.notEqual(movedSnapshot.authored, cutSnapshot.authored);
      assert.equal(snapshotField(operation, "revertedSnapshot").authored, cutSnapshot.authored);
      assert.equal(snapshotField(operation, "replayedSnapshot").authored, movedSnapshot.authored);
      assert.equal(savedSnapshot.authored, movedSnapshot.authored);
      sameSnapshot(snapshotField(operation, "reopenedSnapshot"), savedSnapshot, ["authored", "centeredPixels", "centeredCoveragePixels"]);
    }
    if (operation.id === "onion-canonical-mask" || operation.id === "onion-canonical-lifecycle") {
      const colors = { previous: "91,64,159,148", next: "45,121,91,143" };
      const histogram = (value: Record<string, number>, directions: Array<keyof typeof colors>) => { assert.deepEqual(Object.keys(value).sort(), directions.map(direction => colors[direction]).sort()); for (const count of Object.values(value)) assert.ok(Number.isInteger(count) && count > 0); };
      assert.ok(before && after); assert.equal(before.authored, after.authored);
      if (operation.id === "onion-canonical-mask") {
        assert.deepEqual(operation.expected, colors); sameSnapshot(before, after, ["authored", "centeredPixels"]);
        const directions = evidence<Array<{ direction: keyof typeof colors; raster: Record<string, number>; rig: Record<string, number>; sourceSamples: number; sourceUnchanged: boolean }>>(operation, "directions");
        assert.deepEqual(directions.map(value => value.direction), ["previous", "next"]);
        for (const value of directions) { assert.equal(value.sourceSamples, 1020); assert.equal(value.sourceUnchanged, true); assert.deepEqual(value.raster, { [colors[value.direction]]: 1020 }); histogram(value.rig, [value.direction]); }
        assert.deepEqual(operation.overlapping, { [colors.next]: 100 }); assert.deepEqual(operation.off, {});
      } else {
        const layers = evidence<string[]>(operation, "layers"); assert.equal(layers.length, 2); assert.equal(new Set(layers).size, 2);
        const sources = evidence<Array<{ layer: string; index: number; variant: string; color: string; transparency: number; before: string; after: string }>>(operation, "authoredSources");
        const variants = ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"], sourceColors = ["#ff0000", "#00ffff", "#ff00ff", "#0000ff", "#ffff00"], transparencies = [0, 50, 90, 75, 10];
        assert.deepEqual(sources.map(({ layer, index, variant, color, transparency }) => [layer, index, variant, color, transparency]), layers.flatMap(layer => [0, 2].flatMap(index => variants.map((variant, i) => [layer, index, variant, sourceColors[i], transparencies[i]]))));
        for (const source of sources) { assert.match(source.before, /^[a-f0-9]{64}$/); assert.match(source.after, /^[a-f0-9]{64}$/); assert.notEqual(source.before, source.after); }
        const views = evidence<Array<{ layer: string; index: number; histogram: Record<string, number>; authored: string }>>(operation, "views");
        assert.deepEqual(views.map(({ layer, index }) => [layer, index]), layers.flatMap(layer => [1, 0, 2, 1].map(index => [layer, index])));
        for (const view of views) { histogram(view.histogram, view.index === 0 ? ["next"] : view.index === 2 ? ["previous"] : ["previous", "next"]); assert.equal(view.authored, before.authored); }
        const enabled = evidence<Record<string, number>>(operation, "enabled"); histogram(enabled, ["previous", "next"]);
        for (const key of ["restored", "afterUndo", "paused"]) assert.deepEqual(operation[key], enabled);
        histogram(evidence<Record<string, number>>(operation, "reopenedOnion"), ["previous", "next"]);
        for (const key of ["off", "playing", "reopenedOff"]) assert.deepEqual(operation[key], {});
        for (const key of ["offSnapshot", "undone", "saved", "reopened"]) assert.equal(snapshotField(operation, key).authored, before.authored);
        assert.notEqual(snapshotField(operation, "edited").authored, before.authored);
        sameSnapshot(snapshotField(operation, "reopened"), snapshotField(operation, "saved"), ["authored", "centeredPixels", "centeredCoveragePixels"]);
      }
    }
    if (operation.id.endsWith("-confirmation-dismissed")) { unchanged(); assert.equal(operation.confirmationDismissed, true); }
    if (operation.id === "minimum-frame-layer-guards") {
      assert.ok(before && after); assert.equal(typeof operation.removeFrameDisabled, "boolean"); assert.equal(operation.deleteLayerDisabled, true);
      const minimum = snapshotField(operation, "minimumResult");
      for (const value of [before, minimum, after]) { assert.equal((value.inventory as { layers: number }).layers, 1); assert.deepEqual((value.inventory as { framesPerLayer: number[] }).framesPerLayer, [1]); }
      if (operation.removeFrameDisabled) { unchanged(); sameSnapshot(minimum, before); }
      else {
        sameSnapshot(after, before, ["authored", "pixels", "coveragePixels", "historyPosition"]);
        assert.notEqual(minimum.authored, before.authored); assert.equal(minimum.historyPosition, before.historyPosition + 1);
        assert.equal(minimum.historyLength, before.historyLength + 1); assert.equal(after.historyLength, minimum.historyLength);
      }
    }
    if (["referenced-definition-rejected", "viewport-shrink-grow-retention", "box-selection-retention", "save-retention"].includes(operation.id)) { assert.ok(before && after); sameSnapshot(after, before); }
    if (operation.id === "clear-draw-undo-redo-history-isolation") { sameSnapshot(snapshotField(operation, "clearedAgain"), snapshotField(operation, "cleared")); assert.notEqual(snapshotField(operation, "beforeClearAgain").authored, snapshotField(operation, "cleared").authored); }
    if (["outside-release", "leave-return"].includes(operation.id)) {
      roundTrip(); const outside = snapshotField(operation, "outside"), preview = snapshotField(operation, "preview");
      sameSnapshot(outside, before!, ["authored", "historyPosition"]); sameSnapshot(preview, after!, ["pixels", "coveragePixels"]); assert.equal(after!.historyPosition, before!.historyPosition + 1);
    }
    if (operation.id === "pointerup-final-sample-once") {
      assert.ok(before && undone); const terminal = snapshotField(operation, "terminalSample"), moved = snapshotField(operation, "movedSample");
      sameSnapshot(terminal, moved, ["pixels", "coveragePixels"]); assert.equal(terminal.historyPosition, before.historyPosition + 1);
    }
    if (operation.id === "project-close-unpublished-draft") {
      const saved = snapshotField(operation, "savedBeforeClose"), pending = snapshotField(operation, "pendingBeforeClose"), reopened = snapshotField(operation, "reopenedAfterClose");
      assert.equal(pending.authored, saved.authored); assert.notEqual(pending.pixels, saved.pixels); sameSnapshot(reopened, saved, ["authored", "centeredPixels", "centeredCoveragePixels"]);
    }
    if (operation.id === "protected-save-edit-save-open") {
      const saved = snapshotField(operation, "saved"), later = snapshotField(operation, "later"), reopened = snapshotField(operation, "reopened");
      assert.notEqual(later.authored, saved.authored); sameSnapshot(reopened, later, ["authored", "centeredPixels", "centeredCoveragePixels"]);
    }
    if (operation.id.startsWith("save-") && operation.id.endsWith("-failure") && !operation.id.startsWith("save-as")) { unchanged(); assert.equal(operation.hit, true); preservedStores(evidence(operation, "beforeStore"), evidence(operation, "afterStore")); }
    if (operation.id.startsWith("last-good-")) {
      assert.equal(operation.hits, 1); for (const [left, right] of [["saved", "recovered"], ["later", "latestAgain"]]) sameSnapshot(snapshotField(operation, left), snapshotField(operation, right), ["authored", "centeredPixels", "centeredCoveragePixels"]);
      assert.deepEqual(requireStored(evidence(operation, "beforeStore")), requireStored(evidence(operation, "afterStore")));
    }
    if (operation.id === "delayed-save-keeps-newer-edit-dirty") { sameSnapshot(snapshotField(operation, "newerEdit"), snapshotField(operation, "delayed")); assert.match(evidence<string>(operation, "dirtyStatus"), /Unsaved changes/); }
    if (operation.id === "concurrent-tab-stale-cas") preservedStores(evidence(operation, "headAfterFirst"), evidence(operation, "headAfterRejected"));
    if (operation.id === "save-as-failure-retains-unsaved-and-source") { sameSnapshot(snapshotField(operation, "unsavedOriginal"), snapshotField(operation, "failedCopy")); preservedStores(evidence(operation, "originalStore"), evidence(operation, "afterStore")); }
    if (operation.id === "protected-save-as-original-copy") {
      for (const [left, right] of [["original", "copy"], ["savedOriginal", "originalAgain"]]) sameSnapshot(snapshotField(operation, left), snapshotField(operation, right), ["centeredPixels", "centeredCoveragePixels"]);
      const original = requireStored(evidence(operation, "originalStore")), copied = requireStored(evidence(operation, "copiedStore")); for (const head of original.heads) assert.ok(copied.heads.some(value => JSON.stringify(value) === JSON.stringify(head)));
    }
    if (operation.id === "removed-sound-save-open-assets-retained") {
      const reopened = snapshotField(operation, "reopened"); assert.ok(after); sameSnapshot(reopened, after, ["authored", "centeredPixels", "centeredCoveragePixels"]);
      const stored = requireStored(evidence(operation, "stored")), next = requireStored(evidence(operation, "afterStore"));
      for (const name of ["assets", "assetMetadata", "versions", "projects"]) for (const value of stored[name]) assert.ok(next[name].some(item => JSON.stringify(value) === JSON.stringify(item)));
    }
    if (operation.id === "brush-preview-release-undo-redo") {
      assert.ok(before && after); sameSnapshot(snapshotField(operation, "undo"), before); sameSnapshot(snapshotField(operation, "redo"), after); sameSnapshot(snapshotField(operation, "preview"), after, ["pixels", "coveragePixels"]); assert.equal(after.historyLength, before.historyLength + 1);
    }
    if (operation.id === "ten-percent-repeat") { const ten = snapshotField(operation, "ten"), repeat = snapshotField(operation, "repeat"); sameSnapshot(ten, repeat); assert.equal(ten.maximumAlpha, 26); assert.equal(repeat.historyLength, ten.historyLength); }
    if (operation.id === "reload-open-repeat") { assert.ok(before && after); const reopened = snapshotField(operation, "reopened"); sameSnapshot(reopened, before); sameSnapshot(after, reopened, ["pixels", "coveragePixels"]); }
    if (operation.id === "save-as-original-copy") for (const key of ["copyOpened", "originalOpened"]) sameSnapshot(snapshotField(operation, key), snapshotField(operation, "saved"), ["pixels", "coveragePixels"]);
    if (operation.id.startsWith("same-paint/")) {
      const [, tool, opacity] = operation.id.split("/"); assert.equal(operation.tool, tool); assert.equal(operation.opacity, Number(opacity)); const ceiling = Math.round(255 * Number(opacity) / 100); assert.equal(operation.ceiling, ceiling);
      const pair = (name: string) => {
        const value = evidence<{ preview: unknown; after: unknown }>(operation, name), preview = requireSnapshot(value.preview, `${name}/preview`), after = requireSnapshot(value.after, `${name}/after`);
        sameSnapshot(after, preview, ["pixels", "coveragePixels"]); return after;
      };
      const first = pair("first"), repeated = pair("repeated"), offset = pair("offset"), afterOpen = pair("afterOpen"), opened = snapshotField(operation, "opened");
      sameSnapshot(first, repeated); assert.equal(first.historyPosition, repeated.historyPosition); assert.ok(first.maximumAlpha <= ceiling && offset.maximumAlpha <= ceiling && Number(first.count) > 0 && Number(offset.count) > Number(first.count));
      assert.ok(undone && redone); sameSnapshot(undone, first); sameSnapshot(redone, offset); sameSnapshot(opened, offset, ["centeredPixels", "centeredCoveragePixels"]); sameSnapshot(afterOpen, opened, ["pixels", "coveragePixels"]);
    }
    if (operation.id === "different-color-opacity-variant") {
      const changes = evidence<Array<{ change: { tool: string; color: string; opacity: number }; before: unknown; painted: { preview: unknown; after: unknown }; previousWitness: { rgba: number[] }; witness: { rgba: number[]; pixel: { key: unknown; base: number[] } }; undone: unknown; redone: unknown }>>(operation, "changes");
      assert.deepEqual(changes.map(value => value.change), [{ tool: "Brush", color: "#c04080", opacity: 50 }, { tool: "Brush", color: "#c04080", opacity: 10 }, { tool: "Pencil", color: "#c04080", opacity: 10 }]);
      for (const value of changes) {
        const a = requireSnapshot(value.before, "different/before"), b = requireSnapshot(value.painted.after, "different/after");
        sameSnapshot(requireSnapshot(value.painted.preview, "different/preview"), b, ["pixels", "coveragePixels"]); sameSnapshot(requireSnapshot(value.undone, "different/undo"), a); sameSnapshot(requireSnapshot(value.redone, "different/redo"), b);
        assert.notEqual(b.authored, a.authored); assert.ok(value.previousWitness.rgba.length === 4 && value.previousWitness.rgba.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255));
        assert.deepEqual(value.witness.pixel.base, value.previousWitness.rgba); assert.deepEqual(value.witness.pixel.key, { variant: value.change.tool, color: value.change.color, opacityByte: Math.round(255 * value.change.opacity / 100) });
      }
    }
    if (operation.id === "remove-attached-sound-target") {
      type Layers = Array<{ id: string; timelineFrames: Array<{ soundAttachment: unknown }> }>;
      const expected = structuredClone(before!.normalizedLayers) as Layers, layer = expected.find(value => value.id === operation.targetLayerId); assert.ok(layer);
      const index = evidence<number>(operation, "targetFrameIndex"); assert.ok(layer.timelineFrames[index]?.soundAttachment); layer.timelineFrames[index].soundAttachment = null;
      assert.deepEqual(after!.normalizedLayers, expected); sameSnapshot(after!, before!, ["protected", "centeredPixels", "centeredCoveragePixels"]);
    }
    if (operation.id === "frame-copy-paste-companion") {
      assertClipboardEvidence(operation);
    }
    if (operation.id === "scrub-retention") {
      assert.ok(before && after); const scrubs = evidence<Array<{ layer: string; index: number; view: unknown }>>(operation, "scrubs");
      const layers = before.normalizedLayers as Array<{ id: string }>; assert.deepEqual(scrubs.map(value => [value.layer, value.index]), layers.flatMap(layer => [0, 1, 2, 1, 0].map(index => [layer.id, index])));
      for (const scrub of scrubs) sameSnapshot(requireSnapshot(scrub.view, "scrub"), before, ["authored"]); sameSnapshot(after, before, ["authored", "centeredPixels", "centeredCoveragePixels"]);
    }
    if (operation.id === "onion-full-playback-retention") { assert.ok(before && after); sameSnapshot(after, before, ["authored"]); const onion = evidence<{ purple: number; green: number }>(operation, "onion"); assert.ok(onion.purple > 0 && onion.green > 0); assertPlaybackEvidence(operation); }
    if (operation.id === "reduced-motion-stationary-cancel-release") {
      assert.equal(operation.reducedMotionMatches, true);
      assert.ok(before && after); sameSnapshot(after, before); const preview = snapshotField(operation, "preview"), frames = evidence<string[]>(operation, "frames");
      assert.equal(frames.length, 10); assert.ok(frames.every(value => value === preview.pixels));
      const release = evidence<{ preview: unknown; after: unknown }>(operation, "release"); sameSnapshot(requireSnapshot(release.preview, "motion/release-preview"), requireSnapshot(release.after, "motion/release-after"), ["pixels", "coveragePixels"]);
    }
  }
  assert.deepEqual(run.errors, []); assert.deepEqual(run.consoleMessages.filter(value => value.type === "error"), []); assert.deepEqual(run.sourceStoreWrites, []);
  assert.ok(run.screenshots.length > 0);
  for (const screenshot of run.screenshots) {
    assert.ok(screenshot.path.startsWith(`${OUTPUT_ROOT}/browser/${run.profile.id}/${run.mode}/`) && screenshot.path.endsWith(".png"));
    const bytes = readBytes(screenshot.path); assert.deepEqual(screenshot, { path: screenshot.path, bytes: bytes.length, sha256: digest(bytes) });
  }
  assert.ok(run.buildStamp); assert.equal(run.buildStamp.path, BUILD_STAMP_PATH);
  const buildBytes = readBytes(BUILD_STAMP_PATH); assert.deepEqual(run.buildStamp, { path: BUILD_STAMP_PATH, bytes: buildBytes.length, sha256: digest(buildBytes) });
  const build = JSON.parse(Buffer.from(buildBytes).toString()) as BuildStamp;
  assert.equal(build.sourceDigest, result.sourceDigestBefore); assert.ok(run.servedAssets.some(value => value.path.endsWith(".js")));
  const requestedAssets = [...new Set(run.requests.filter(request => new URL(request.url).pathname.startsWith("/_next/static/")).map(request => `.next/static/${decodeURIComponent(new URL(request.url).pathname.slice("/_next/static/".length))}`))].sort();
  assert.deepEqual(run.servedAssets.map(asset => asset.path).sort(), requestedAssets, "all requested application assets have response-byte bindings");
  for (const asset of run.servedAssets) assert.deepEqual(asset, build.files.find(value => value.path === asset.path), `served bundle differs: ${asset.path}`);
}
export const VISUAL_INSPECTION_PATH = `${OUTPUT_ROOT}/visual-inspection.json`;
export function aggregateBrowserResults(results: ProducerResult[], url: string, readBytes: (path: string) => Uint8Array = readFileSync): BrowserMetrics {
  assert.deepEqual(results.map(result => result.commandId).sort(), Object.keys(producerCommands("browser", url)).sort());
  for (const result of results) assertBrowserRun(result, url, readBytes);
  const runs = results.map(result => result.metrics as BrowserRunMetrics);
  assert.equal(new Set(runs.map(run => run.browserVersion)).size, 1);
  const profiles = (["desktop", "compact"] as const).map(id => {
    const profileRuns = runs.filter(run => run.profile.id === id);
    const operation = (mode: BrowserMode, operationId: string) => {
      const found = profileRuns.find(run => run.mode === mode)!.operations.find(value => value.id === operationId);
      assert.ok(found?.completed, `missing ${id}/${mode}/${operationId}`); return found;
    };
    const previewSamplesMs: Record<string, number[]> = {}, pointerActiveLongTasksMs: number[] = [], postReleaseNoopSamplesMs: number[] = [];
    const transientMemory: number[] = [];
    for (const variant of readContract().variants) {
      const measured = operation("performance", `preview/${variant}`);
      assert.equal(measured.variant, variant);
      const warmups = evidence<unknown[]>(measured, "warmups"); assert.equal(warmups.length, 3);
      const strokes = evidence<Array<{ samples: number[]; interval: number[]; release: number[]; longTasks: number[][]; memory: number[] }>>(measured, "runs"); assert.equal(strokes.length, 20);
      for (const stroke of strokes) {
        assert.ok(stroke.samples.length >= 16); assert.equal(stroke.interval.length, 2); assert.equal(stroke.release.length, 2);
        assert.ok(stroke.interval[0] < stroke.release[0] && stroke.release[0] <= stroke.release[1] && stroke.release[1] <= stroke.interval[1]);
        assert.ok(stroke.samples.every(value => Number.isFinite(value) && value >= 0));
        pointerActiveLongTasksMs.push(...stroke.longTasks.filter(([start, duration]) => start < stroke.interval[1] && start + duration > stroke.interval[0]).map(([, duration]) => duration));
        postReleaseNoopSamplesMs.push(Math.max(0, ...stroke.longTasks.filter(([start]) => start >= stroke.interval[1]).map(([, duration]) => duration)));
        assert.ok(stroke.memory.length >= 16); transientMemory.push(...stroke.memory);
      }
      previewSamplesMs[variant] = strokes.map(stroke => Math.max(...stroke.samples));
      assert.deepEqual(measured.previewSamplesMs, previewSamplesMs[variant]);
    }
    const resources = operation("performance", "scratch-heap-allocation-release");
    const before = evidence<{ drafts: number; preparedCommands: number; scratchBytes: number; maximumAllocationBytes: number }>(resources, "scratchBaseline");
    const after = evidence<typeof before>(resources, "scratchAfter");
    assert.equal(before.drafts + before.preparedCommands + after.drafts + after.preparedCommands, 0);
    const heapSamples = (key: string) => evidence<Array<{ usedSize: number; backingStorageSize?: number; countedBytes: number }>>(resources, key).map(sample => {
      assert.equal(sample.countedBytes, sample.usedSize + (sample.backingStorageSize ?? 0)); return sample.countedBytes;
    });
    const persistence = operation("performance", "representative-two-raster-open-save");
    const representative = evidence<SnapshotEvidence>(persistence, "representative");
    assert.equal((representative.inventory as { rasterCells: number }).rasterCells, 2);
    const axe = operation("accessibility", "axe-complete");
    const audits = evidence<Array<{ id: string; violations: Array<{ impact: string }> }>>(axe, "audits");
    assert.deepEqual(audits.map(value => value.id).sort(), ["Brush", "Pencil", "Sketch", "Pixelate", "Glow", "open-brush-menu", "zoom-200"].sort());
    const violations = audits.flatMap(audit => audit.violations);
    const keyboard = operation("accessibility", "keyboard-focus-controls"), zoom = operation("accessibility", "zoom-200-controls");
    const focus = evidence<{ tag: string; focusVisible: boolean; outlineStyle: string; outlineWidth: number }>(keyboard, "tabFocus");
    assert.ok(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(focus.tag)); assert.equal(focus.focusVisible, true); assert.notEqual(focus.outlineStyle, "none"); assert.ok(focus.outlineWidth >= 2);
    sameSnapshot(snapshotField(keyboard, "before"), snapshotField(keyboard, "after"));
    const zoomState = evidence<{ scale: string; client: number; scroll: number }>(zoom, "zoom"); assert.equal(Number(zoomState.scale), 2); assert.ok(zoomState.scroll <= zoomState.client + 1);
    const motion = operation("accessibility", "reduced-motion-stationary-cancel-release");
    assert.equal(evidence<string[]>(motion, "frames").length, 10);
    const playback = operation("retention", "onion-full-playback-retention");
    assertPlaybackEvidence(playback);
    // The closed mode/case matrix and raw snapshot comparisons above establish
    // these zero counts; missing execution can never default to a passing zero.
    return { ...profileRuns[0].profile, operations: readContract().requiredBrowserOperations.slice(), screenshots: profileRuns.flatMap(run => run.screenshots.map(value => value.path)),
      previewSamplesMs, pointerActiveLongTasksMs, postReleaseNoopSamplesMs,
      openSamplesMs: evidence<number[]>(persistence, "openSamplesMs"), saveSamplesMs: evidence<number[]>(persistence, "saveSamplesMs"),
      settledHeapSamplesBytes: heapSamples("settledHeaps"), transientHeapSamplesBytes: [...heapSamples("transientHeaps"), ...transientMemory],
      maxRasterCompanionAllocationBytes: Math.max(before.maximumAllocationBytes, after.maximumAllocationBytes),
      stationaryPreviewDigestChanges: 0, previewCommitPixelMismatches: 0, previewCommitCoverageMismatches: 0, unexpectedHistoryEntries: 0, cancellationDigestMismatches: 0, noLossMismatches: 0,
      drawUndoCycles: evidence<number>(resources, "drawUndoCycles"), scratchBytesBaseline: before.scratchBytes, scratchBytesAfterCycles: after.scratchBytes,
      axeCritical: violations.filter(value => value.impact === "critical").length, axeSerious: violations.filter(value => value.impact === "serious").length,
      keyboardFocus: true, zoomPercent: 200, reducedMotion: true, fullPlaybackTraversals: 1,
    };
  });
  const visible = JSON.parse(Buffer.from(readBytes(VISUAL_INSPECTION_PATH)).toString()) as BrowserMetrics["visibleInspection"] & { sourceDigest: string };
  assert.equal(visible.sourceDigest, currentSourceDigest());
  const requests = runs.flatMap(run => run.requests);
  return { buildMode: "production", browserVersion: runs[0].browserVersion,
    methodology: { warmups: 3, operationBoundaries: "Per-stroke maximum synchronous pointermove capture-to-bubble preview; entire pointerdown capture through pointerup bubble for long tasks;250ms post-release observation before Undo. Save starts before File; Open starts at project selection and ends after hydrated canvas plus two animation frames.",
      settling: "Two requestAnimationFrame turns after actions; three warmups and20 measured fixed strokes per variant; no concurrent test process during performance. Settled heap is CDP usedSize plus backingStorageSize after explicit collection; transient includes uncollected CDP and precise performance.memory samples.",
      fixtureDigest: digest(JSON.stringify(runs.filter(run => run.mode === "performance").map(run => run.operations.find(operation => operation.id === "representative-two-raster-open-save")!.representative))) },
    profiles, requests, pageErrors: runs.flatMap(run => run.errors), consoleErrors: runs.flatMap(run => run.consoleMessages.filter(value => value.type === "error").map(value => value.text)),
    realApiRequests: requests.filter(request => new URL(request.url).pathname.startsWith("/api/") && request.disposition !== "mock-api").length,
    externalRequests: requests.filter(request => new URL(request.url).hostname !== "127.0.0.1").length,
    sourceStoreWrites: runs.reduce((count, run) => count + run.sourceStoreWrites.length, 0),
    visibleInspection: { completed: visible.completed, notes: visible.notes, screenshotPaths: visible.screenshotPaths },
  };
}
export type RasterMetrics = {
  tinyTextureDots: Array<{ variant: string; scale: number; opacityByte: number; fx: number; fy: number; paintedPixels: number; wrongOpacityPixels: number }>;
  textureHierarchy: Array<{ size: number; smoothing: number; scale: number; seed: number; alphaThreshold: number; rows: Array<{
    variant: string; edgeSd: number; widthSd: number; detachedFraction: number; centerlineGaps: number; repeatIdentical: boolean; fractionalInkPixels: number; wrongPigmentPixels: number;
  }> }>;
  smoothing: Array<{
    variant: string;
    levels: number[];
    jitterEnergy: number[];
    endpointErrors: number[];
    rawDirectionRetention: number;
    circleMaxHeadingJumpDegrees: number;
    spiralMaxHeadingJumpDegrees: number;
    sMaxHeadingJumpDegrees: number;
    maxCurveChordFraction: number;
    newSelfIntersections: number;
  }>;
  coverage: Array<{ variant: string; scenario: string; opacity: number; maximumCoverage: number; fullCoverage: number; beadExcess: number; partialCoveragePixels: number }>;
  pixelate: { gaps: number; rotatedCells: number; partialCells: number; alphaValues: number[] };
  glow: Array<{
    background: "dark-neutral" | "mid-neutral";
    brightness: number;
    annulusMeanLinearLift: number;
    peakHaloLift: number;
    coreContrast: number;
    corePeakLinearLuminance: number;
    hueRecognizable: boolean;
    haloExtent: number;
    size: number;
    radius: number;
    color: string;
    opacityByte: number;
    annulus: number[];
  }>;
};
export type Receipt = {
  kind: "spec0007-phase1-receipt";
  version: 1;
  id: ReceiptId;
  status: "PASS" | "FAIL";
  createdAt: string;
  baseSha: string;
  headSha: string;
  producer: Binding;
  contract: Binding;
  fixture: Binding;
  runtimeBindings: Binding[];
  checks: Check[];
  artifacts: Binding[];
  commands: CommandReceipt[];
  metrics?: unknown;
  limitations: string[];
};
export type Manifest = {
  kind: "spec0007-phase1-technical-proof";
  version: 1;
  status: "PASS" | "INCOMPLETE";
  integrity: "VALID" | "UNVALIDATED";
  humanAcceptance: "pending Arthur";
  controlPlaneUpdated: false;
  published: false;
  baseSha: string;
  headSha: string;
  worktree: string;
  indexEmpty: boolean;
  exactDirtyPaths: string[];
  allowedPaths: string[];
  spec: Binding;
  scope: Binding;
  sourceBindings: Binding[];
  receiptBindings: Binding[];
  receipts: Receipt[];
  review: { url: string; port: number; listenerPid: number; cwd: string; httpStatus: number; serverPreserved: true };
  limitations: string[];
};

export function digest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function bind(path: string): Binding {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: digest(bytes) };
}
export function git(...args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git_failed:${args.join(" ")}`);
  return result.stdout;
}
export function currentSourceDigest(): string {
  return digest(JSON.stringify(EXACT_ALLOWLIST.map(bind)));
}
export function readContract(): {
  variants: string[];
  receiptChecks: Record<ReceiptId, string[]>;
  requiredBrowserOperations: string[];
  profiles: Array<{ id: string; width: number; height: number; deviceScaleFactor: number }>;
} {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}
export function receiptPath(id: ReceiptId): string { return `${OUTPUT_ROOT}/receipts/${id}.json`; }
function expectedCheck(id: ReceiptId, checkId: string): unknown {
  if (id !== "quality") return true;
  if (checkId === "changed-line-eslint") return [];
  if (checkId === "production-build") return { exitCode: 0, networkDenied: 0 };
  return 0;
}
const acceptedExit = (receiptId: ReceiptId, command: CommandReceipt) =>
  command.exitCode === 0 || receiptId === "quality" && command.id === "full-eslint" && command.exitCode === 1 ||
  receiptId === "regressions" && command.id === "phase5-tools-library" && command.exitCode === 1 && command.inheritedStructuralFailure?.disposition === "REPLACED";
export function createReceipt(input: {
  id: ReceiptId;
  checks: Check[];
  artifacts?: string[];
  commands?: CommandReceipt[];
  metrics?: unknown;
  limitations?: string[];
}): Receipt {
  const expected = readContract().receiptChecks[input.id];
  let pass = JSON.stringify([...input.checks.map(check => check.id)].sort()) === JSON.stringify([...expected].sort());
  for (const check of input.checks) {
    try { assert.deepEqual(check.expected, expectedCheck(input.id, check.id)); assert.deepEqual(check.actual, check.expected); } catch { pass = false; }
  }
  if (!input.commands?.length || !input.metrics || !(input.artifacts?.length)) pass = false;
  if ((input.commands ?? []).some(command => !acceptedExit(input.id, command) || command.inheritedStructuralFailure?.disposition === "UNRESOLVED")) pass = false;
  return {
    kind: "spec0007-phase1-receipt", version: 1, id: input.id, status: pass ? "PASS" : "FAIL",
    createdAt: new Date().toISOString(), baseSha: BASE_SHA, headSha: git("rev-parse", "HEAD").trim(),
    producer: bind(RECEIPT_PRODUCERS[input.id]), contract: bind(CONTRACT_PATH), fixture: bind(FIXTURE_PATH),
    runtimeBindings: RUNTIME_PATHS.map(bind), checks: input.checks,
    artifacts: (input.artifacts ?? []).map(bind), commands: input.commands ?? [],
    ...(input.metrics === undefined ? {} : { metrics: input.metrics }), limitations: input.limitations ?? [],
  };
}
export function writeReceipt(receipt: Receipt): Binding {
  const path = receiptPath(receipt.id);
  mkdirSync(resolve(OUTPUT_ROOT, "receipts"), { recursive: true });
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  return bind(path);
}
export function liveReview(url: string): Manifest["review"] {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.protocol, "http:");
  assert.equal(parsed.pathname, "/");
  const port = Number(parsed.port);
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536 && port !== 3000);
  const listeners = spawnSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean).map(Number);
  assert.equal(listeners.length, 1, "exactly one identified review listener");
  const listenerPid = listeners[0];
  const cwd = spawnSync("lsof", ["-a", "-p", String(listenerPid), "-d", "cwd", "-Fn"], { encoding: "utf8" }).stdout.split("\n").find(line => line.startsWith("n"))?.slice(1);
  assert.equal(cwd, process.cwd(), "review server belongs to this exact worktree");
  const response = spawnSync("curl", ["--noproxy", "*", "--silent", "--show-error", "--max-time", "15", "--output", "/dev/null", "--write-out", "%{http_code}", url], { encoding: "utf8" });
  assert.equal(response.status, 0, response.stderr);
  assert.equal(Number(response.stdout), 200);
  return { url, port, listenerPid, cwd: cwd!, httpStatus: 200, serverPreserved: true };
}

export type ValidationOptions = {
  readBytes?: (path: string) => Uint8Array;
  checkLiveReview?: boolean;
};

// This is the sole validator used by final validation AND negative mutation replay.
export function validationErrors(manifest: Manifest, options: ValidationOptions = {}): string[] {
  const errors: string[] = [];
  const readBytes = options.readBytes ?? (path => readFileSync(path));
  const check = (condition: unknown, message: string) => { if (!condition) errors.push(message); };
  const equal = (actual: unknown, expected: unknown, message: string) => {
    try { assert.deepEqual(actual, expected); } catch { errors.push(message); }
  };
  const safeRead = (path: string): Uint8Array | null => {
    try { return readBytes(path); } catch { errors.push(`missing_file:${path}`); return null; }
  };
  const safeJSON = (path: string): unknown => {
    const bytes = safeRead(path);
    if (!bytes) return null;
    try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { errors.push(`invalid_json:${path}`); return null; }
  };
  const validateBinding = (binding: Binding, expectedPath?: string, proofOnly = false) => {
    check(Boolean(binding && typeof binding === "object"), "binding_object_required");
    if (!binding || typeof binding.path !== "string") { errors.push("binding_path_required"); return; }
    if (expectedPath) equal(binding.path, expectedPath, `binding_wrong_path:${expectedPath}`);
    const canonical = relative(process.cwd(), resolve(binding.path));
    equal(canonical, binding.path, `noncanonical_binding_path:${binding.path}`);
    check(!isAbsolute(binding.path) && !binding.path.startsWith("../"), `unsafe_binding_path:${binding.path}`);
    if (proofOnly) check(binding.path.startsWith(`${OUTPUT_ROOT}/`), `artifact_outside_proof_root:${binding.path}`);
    const bytes = safeRead(binding.path);
    if (!bytes) return;
    equal(binding.bytes, bytes.length, `binding_size:${binding.path}`);
    equal(binding.sha256, digest(bytes), `binding_hash:${binding.path}`);
  };
  try {
    equal(digest(readBytes(FIXTURE_PATH)), FROZEN_FIXTURE_SHA, "frozen_fixture_contract");
    equal(manifest.kind, "spec0007-phase1-technical-proof", "manifest_kind");
    equal(manifest.version, 1, "manifest_version");
    equal(manifest.status, "PASS", "manifest_not_complete");
    equal(manifest.integrity, "VALID", "manifest_not_validated");
    equal(manifest.humanAcceptance, "pending Arthur", "human_acceptance_not_executor_owned");
    equal(manifest.controlPlaneUpdated, false, "control_plane_mutated");
    equal(manifest.published, false, "publication_not_authorized");
    equal(manifest.baseSha, BASE_SHA, "base_sha");
    equal(manifest.headSha, BASE_SHA, "head_sha");
    equal(git("rev-parse", "HEAD").trim(), BASE_SHA, "live_head_changed");
    equal(manifest.worktree, process.cwd(), "worktree_identity");
    equal(manifest.allowedPaths, EXACT_ALLOWLIST, "allowlist_changed");
    equal(manifest.indexEmpty, true, "index_claim");
    equal(git("diff", "--cached", "--name-only"), "", "live_index_not_empty");
    const dirty = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean).map(line => line.slice(3)).sort();
    equal(manifest.exactDirtyPaths, dirty, "dirty_paths_changed");
    check(dirty.length > 0, "implementation_missing");
    check(dirty.every(path => EXACT_ALLOWLIST.includes(path)), "unauthorized_dirty_path");
    const diff = spawnSync("git", ["diff", "--check"], { encoding: "utf8" });
    equal(diff.status, 0, "live_diff_check_failed");
    validateBinding(manifest.spec, SPEC_PATH);
    validateBinding(manifest.scope, SCOPE_PATH);
    const scope = safeJSON(SCOPE_PATH) as { base?: string; allowlist?: string[] } | null;
    equal(scope?.base, BASE_SHA, "entry_scope_base");
    equal(scope?.allowlist?.slice().sort(), EXACT_ALLOWLIST, "entry_scope_allowlist");
    const publishedSpec = spawnSync("git", ["show", `${BASE_SHA}:${SPEC_PATH}`], { encoding: "buffer" });
    equal(manifest.spec.sha256, digest(publishedSpec.stdout), "canonical_spec_changed");
    equal(manifest.sourceBindings.map(binding => binding.path).sort(), EXACT_ALLOWLIST, "source_binding_set");
    manifest.sourceBindings.forEach(binding => validateBinding(binding));
    const sourceDigest = digest(JSON.stringify([...manifest.sourceBindings].sort((a, b) => a.path.localeCompare(b.path))));
    equal(manifest.receipts.map(receipt => receipt.id).sort(), RECEIPT_IDS.slice().sort(), "receipt_set_incomplete_or_duplicate");
    equal(manifest.receiptBindings.map(binding => binding.path).sort(), RECEIPT_IDS.map(receiptPath).sort(), "receipt_binding_set");
    manifest.receiptBindings.forEach(binding => validateBinding(binding, undefined, true));
    const contract = safeJSON(FIXTURE_PATH) as ReturnType<typeof readContract> | null;
    check(Boolean(contract), "contract_missing");
    for (const receipt of manifest.receipts) {
      equal(safeJSON(receiptPath(receipt.id)), receipt, `receipt_bytes_differ:${receipt.id}`);
      equal(receipt.kind, "spec0007-phase1-receipt", `receipt_kind:${receipt.id}`);
      equal(receipt.version, 1, `receipt_version:${receipt.id}`);
      equal(receipt.baseSha, BASE_SHA, `receipt_base:${receipt.id}`);
      equal(receipt.headSha, BASE_SHA, `receipt_head:${receipt.id}`);
      equal(receipt.status, "PASS", `receipt_not_passed:${receipt.id}`);
      check(Number.isFinite(Date.parse(receipt.createdAt)), `receipt_timestamp:${receipt.id}`);
      validateBinding(receipt.producer, RECEIPT_PRODUCERS[receipt.id]);
      validateBinding(receipt.contract, CONTRACT_PATH);
      validateBinding(receipt.fixture, FIXTURE_PATH);
      equal(receipt.runtimeBindings.map(binding => binding.path).sort(), RUNTIME_PATHS, `receipt_runtime_binding_set:${receipt.id}`);
      receipt.runtimeBindings.forEach(binding => validateBinding(binding));
      equal(receipt.checks.map(item => item.id).sort(), contract?.receiptChecks[receipt.id]?.slice().sort(), `receipt_check_matrix:${receipt.id}`);
      for (const item of receipt.checks) {
        check(item.actual !== undefined && item.expected !== undefined, `check_values_required:${receipt.id}:${item.id}`);
        equal(item.expected, expectedCheck(receipt.id, item.id), `unfrozen_expectation:${receipt.id}:${item.id}`);
        equal(item.actual, item.expected, `failed_check:${receipt.id}:${item.id}`);
      }
      check(receipt.commands.length > 0 && receipt.artifacts.length > 0 && Boolean(receipt.metrics), `execution_evidence_required:${receipt.id}`);
      receipt.artifacts.forEach(binding => validateBinding(binding, undefined, true));
      for (const command of receipt.commands) {
        equal(command.cwd, process.cwd(), `command_cwd:${command.id}`);
        check(acceptedExit(receipt.id, command), `command_failed:${command.id}`);
        equal(command.sourceDigest, sourceDigest, `command_sources_stale:${command.id}`);
        check(!command.inheritedStructuralFailure || command.inheritedStructuralFailure.disposition === "REPLACED", `unresolved_inherited_regression:${command.id}`);
        check(Number.isFinite(command.elapsedMs) && command.elapsedMs >= 0, `command_duration:${command.id}`);
        check(Number.isFinite(Date.parse(command.startedAt)) && Date.parse(command.endedAt) >= Date.parse(command.startedAt), `command_timestamps:${command.id}`);
        validateBinding(command.stdout, undefined, true);
        validateBinding(command.stderr, undefined, true);
      }
      if (!["quality", "regressions"].includes(receipt.id)) {
        const expectedRuns = producerCommands(receipt.id, manifest.review.url);
        equal(receipt.commands.map(command => command.id).sort(), Object.keys(expectedRuns).sort(), `producer_command_set:${receipt.id}`);
        const rawResults: ProducerResult[] = [];
        for (const command of receipt.commands) {
          const expected = expectedRuns[command.id];
          check(Boolean(expected), `producer_command_unknown:${command.id}`); if (!expected) continue;
          equal(command.argv, expected.argv, `producer_argv:${command.id}`);
          check(receipt.artifacts.some(binding => binding.path === expected.resultPath), `producer_result_unbound:${command.id}`);
          const raw = safeJSON(expected.resultPath) as ProducerResult | null;
          check(Boolean(raw), `producer_result_missing:${command.id}`); if (!raw) continue;
          rawResults.push(raw);
          equal(raw.kind, "phase1-producer-result", `producer_result_kind:${command.id}`); equal(raw.version, 1, `producer_result_version:${command.id}`);
          equal(raw.commandId, command.id, `producer_result_id:${command.id}`); equal(raw.execution, "COMPLETE", `producer_result_incomplete:${command.id}`);
          equal(raw.sourceDigestBefore, sourceDigest, `producer_before_stale:${command.id}`); equal(raw.sourceDigestAfter, sourceDigest, `producer_after_stale:${command.id}`);
          equal(raw.producerSha256, receipt.producer.sha256, `producer_raw_source:${command.id}`); equal(raw.fixtureSha256, FROZEN_FIXTURE_SHA, `producer_raw_fixture:${command.id}`);
          equal(raw.failures, [], `producer_raw_failures:${command.id}`);
          check(raw.completedCases.length > 0 && raw.completedCases.every(item => Number.isInteger(item.assertions) && item.assertions > 0), `producer_completed_cases_required:${command.id}`);
          check(new Set(raw.completedCases.map(item => item.id)).size === raw.completedCases.length, `producer_duplicate_cases:${command.id}`);
          if (receipt.id !== "browser") {
            equal(raw.completedCases.map(item => item.id), [`${receipt.id}-executed-oracle`], `producer_oracle_case:${command.id}`);
            const output = JSON.parse(Buffer.from(readBytes(command.stdout.path)).toString().trim().split("\n").at(-1)!);
            equal(output, raw.metrics, `producer_raw_stdout_disagrees:${command.id}`);
            equal(output.status, "PASS", `producer_raw_stdout_failed:${command.id}`);
            equal(output.assertions, raw.completedCases[0]?.assertions, `producer_assertion_count:${command.id}`);
            if (receipt.id === "coverage-persistence") {
              const cases = output.ownershipCases as Array<{ opacityByte: number; targetPixels: number; unrelatedPixels: number; version: number; persisted: unknown; duplicateDigest: string }> | undefined;
              check(Array.isArray(cases), "sketch_ownership_cases_required");
              equal(cases?.map(value => [value.opacityByte, value.targetPixels, value.unrelatedPixels, value.version]), [[26, 5, 1, 2], [128, 5, 1, 2], [255, 5, 1, 2]], "sketch_ownership_matrix");
              check(cases?.every(value => Boolean(value.persisted) && /^[a-f0-9]{64}$/.test(value.duplicateDigest)), "sketch_ownership_storage");
            }
          } else {
            try { assertBrowserRun(raw, manifest.review.url, readBytes); }
            catch (error) { errors.push(`browser_raw_semantics:${command.id}:${String(error)}`); }
            const output = JSON.parse(Buffer.from(readBytes(command.stdout.path)).toString().trim().split("\n").at(-1)!);
            equal(output.execution, raw.execution, `browser_stdout_execution:${command.id}`);
            const rawBytes = readBytes(expected.resultPath);
            equal(output.result, { path: expected.resultPath, bytes: rawBytes.length, sha256: digest(rawBytes) }, `browser_stdout_result_binding:${command.id}`);
            for (const screenshot of (raw.metrics as BrowserRunMetrics).screenshots) check(receipt.artifacts.some(binding => binding.path === screenshot.path), `browser_screenshot_artifact:${command.id}`);
          }
        }
        if (receipt.id !== "browser") {
          equal(rawResults.length, 1, `producer_oracle_result_count:${receipt.id}`);
          equal(rawResults[0]?.metrics, receipt.metrics, `producer_metrics_differ:${receipt.id}`);
          // UI-dependent checks are validated by the complete browser receipt,
          // whose exact bytes must be included as dependency evidence.
          check(receipt.artifacts.some(binding => binding.path === receiptPath("browser")), `producer_browser_dependency:${receipt.id}`);
          equal((safeJSON(receiptPath("browser")) as Receipt | null)?.status, "PASS", `producer_browser_incomplete:${receipt.id}`);
        } else {
          check(receipt.artifacts.some(binding => binding.path === VISUAL_INSPECTION_PATH), "browser_visual_inspection_unbound");
          check(receipt.artifacts.some(binding => binding.path === BUILD_STAMP_PATH), "browser_build_stamp_unbound");
          try { equal(receipt.metrics, aggregateBrowserResults(rawResults, manifest.review.url, readBytes), "browser_aggregate_disagrees_with_raw"); }
          catch (error) { errors.push(`browser_aggregation_failed:${String(error)}`); }
        }
      }
      if (receipt.id === "regressions") {
        equal(receipt.commands.map(command => command.id).sort(), Object.keys(REGRESSION_COMMANDS).sort(), "regression_command_set");
        receipt.commands.forEach(command => equal(command.argv, REGRESSION_COMMANDS[command.id], `regression_argv:${command.id}`));
        for (const command of receipt.commands.filter(item => item.inheritedStructuralFailure)) {
          const replacement = command.inheritedStructuralFailure!;
          equal(command.id, "phase5-tools-library", "retired_assertion_command");
          equal(command.exitCode, 1, "retired_assertion_original_exit_preserved");
          equal(replacement.assertion, PHASE5_RETIRED_ASSERTION, "retired_assertion_exact_statement");
          check(Buffer.from(readBytes(command.stderr.path)).toString().includes("drawBufferedBrushStroke"), "retired_assertion_actual_failure");
          check(Boolean(replacement.originalSource && replacement.adaptedSource && replacement.adapterCommand && replacement.replacementProof), "retired_assertion_evidence_required");
          if (replacement.originalSource && replacement.adaptedSource && replacement.adapterCommand && replacement.replacementProof) {
            validateBinding(replacement.originalSource, PHASE5_LEGACY_PATH);
            equal(replacement.originalSource.sha256, PHASE5_LEGACY_SHA, "retired_assertion_original_hash");
            validateBinding(replacement.adaptedSource, PHASE5_ADAPTER_PATH, true);
            equal(Buffer.from(readBytes(PHASE5_ADAPTER_PATH)).toString(), phase5AdapterSource(Buffer.from(readBytes(PHASE5_LEGACY_PATH)).toString()), "retired_assertion_only_exact_transform");
            const adapter = replacement.adapterCommand;
            equal(adapter.argv, ["node", "--experimental-strip-types", PHASE5_ADAPTER_PATH], "retired_assertion_adapter_argv");
            equal(adapter.exitCode, 0, "retired_assertion_adapter_exit"); equal(adapter.sourceDigest, sourceDigest, "retired_assertion_adapter_sources");
            equal(adapter.cwd, process.cwd(), "retired_assertion_adapter_cwd");
            validateBinding(adapter.stdout, undefined, true); validateBinding(adapter.stderr, undefined, true);
            const output = Buffer.from(readBytes(adapter.stdout.path)).toString().trim().split("\n").at(-1)!;
            equal(JSON.parse(output).status, "PASS", "retired_assertion_adapter_result");
            validateBinding(replacement.replacementProof, receiptPath("browser"), true);
            equal((safeJSON(replacement.replacementProof.path) as Receipt).status, "PASS", "retired_assertion_replacement_browser_pass");
          }
        }
      }
      if (receipt.id === "quality") validateQuality(receipt, check, equal, safeJSON, path => Buffer.from(readBytes(path)).toString("utf8"));
      if (receipt.id === "raster") validateRasterMetrics(receipt.metrics as RasterMetrics, check, equal);
      if (receipt.id === "browser") validateBrowserMetrics(receipt.metrics as BrowserMetrics, receipt.artifacts, check, equal);
    }
    equal(manifest.review.cwd, process.cwd(), "review_cwd");
    equal(manifest.review.httpStatus, 200, "review_http_status");
    equal(manifest.review.serverPreserved, true, "review_not_preserved");
    check(Number.isInteger(manifest.review.listenerPid) && manifest.review.listenerPid > 0, "review_pid");
    const parsed = new URL(manifest.review.url);
    equal(parsed.origin, `http://127.0.0.1:${manifest.review.port}`, "review_origin");
    equal(parsed.pathname, "/", "review_path");
    check(manifest.review.port !== 3000, "canonical_review_port_forbidden");
    if (options.checkLiveReview !== false) equal(liveReview(manifest.review.url), manifest.review, "review_identity_changed");
    check(manifest.limitations.includes("Human acceptance pending Arthur."), "human_acceptance_limit_missing");
    check(manifest.limitations.includes("Compact is desktop Chromium emulation; physical phone and native/GPU memory are unproven."), "platform_limit_missing");
  } catch (error) {
    errors.push(`malformed_or_unreadable:${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

type CheckFunction = (condition: unknown, message: string) => void;
type EqualFunction = (actual: unknown, expected: unknown, message: string) => void;
const finiteSamples = (values: number[], minimum: number, label: string, check: CheckFunction) => {
  check(Array.isArray(values) && values.length >= minimum && values.every(value => Number.isFinite(value) && value >= 0), label);
};
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

function validateQuality(receipt: Receipt, check: CheckFunction, equal: EqualFunction, safeJSON: (path: string) => unknown, readText: (path: string) => string) {
  check(receipt.artifacts.some(binding => binding.path === BUILD_STAMP_PATH), "production_build_stamp_unbound");
  equal(safeJSON(BUILD_STAMP_PATH), currentBuildStamp(), "production_build_stamp_stale");
  equal(receipt.commands.map(command => command.id).sort(), ["typescript", "focused-eslint", "full-eslint", "production-build", "diff-check", "empty-index"].sort(), "quality_command_set");
  const expectedCommands: Record<string, string[]> = {
    typescript: ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
    "focused-eslint": ["./node_modules/.bin/eslint", ...EXACT_ALLOWLIST.filter(path => /\.[cm]?[jt]sx?$/.test(path))],
    "full-eslint": ["./node_modules/.bin/eslint", ".", "--format", "json"],
    "production-build": ["node", resolve("node_modules/next/dist/bin/next"), "build", "--webpack", "--debug-build-paths", "app/page.tsx"],
    "diff-check": ["git", "diff", "--check"], "empty-index": ["git", "diff", "--cached", "--exit-code"],
  };
  receipt.commands.forEach(command => equal(command.argv, expectedCommands[command.id], `quality_argv:${command.id}`));
  const quality = receipt.metrics as { changedLineFindings: unknown[]; fullLintExitCode: number; buildNetworkLedger: string; rawNetworkLedger: string; buildNetworkDenied: number; typecheckIncremental: boolean };
  equal(quality.changedLineFindings, [], "changed_line_lint_findings");
  equal(quality.buildNetworkDenied, 0, "build_egress_attempt");
  equal(quality.typecheckIncremental, false, "typecheck_must_be_fresh");
  check(receipt.artifacts.some(binding => binding.path === quality.buildNetworkLedger), "build_network_ledger_unbound");
  const network = safeJSON(quality.buildNetworkLedger) as Array<{ result: string; primitive: string; target: string }>;
  check(Array.isArray(network), "build_network_records_required");
  check(receipt.artifacts.some(binding => binding.path === quality.rawNetworkLedger), "raw_build_network_ledger_unbound");
  const rawNetwork = readText(quality.rawNetworkLedger).split("\n").filter(Boolean).map(line => JSON.parse(line));
  equal(network, rawNetwork, "raw_normalized_network_disagreement");
  if (Array.isArray(network)) {
    equal(network.filter(entry => entry.result === "denied").length, 0, "independent_build_network_denied");
    for (const entry of network) check(entry.result === "allowed" &&
      (entry.target === "next-internal-node-child" && entry.primitive.startsWith("child_process.") || /^(?:https?:\/\/)?(?:127(?:\.[0-9]{1,3}){3}|\[?::1\]?)(?::\d+)?$/.test(entry.target)), "build_network_closed_allowlist");
  }
  const lint = receipt.commands.find(command => command.id === "full-eslint");
  check(Boolean(lint), "full_lint_receipt_missing");
  if (lint) {
    const report = safeJSON(lint.stdout.path) as Array<{ filePath: string; messages: Array<{ line: number; endLine?: number; severity: number }> }>;
    check(Array.isArray(report), "full_lint_report_required");
    // Fresh line attribution is independently recomputed; a claimed empty list alone is insufficient.
    const ranges = changedLineRanges();
    const dirtyNew = new Set(git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean));
    const findings = Array.isArray(report) ? report.flatMap(file => {
      const path = relative(process.cwd(), file.filePath);
      if (!EXACT_ALLOWLIST.includes(path)) return [];
      return file.messages.filter(message => dirtyNew.has(path) || (ranges.get(path) ?? []).some(([first, last]) => message.line <= last && (message.endLine ?? message.line) >= first)).map(message => ({ path, ...message }));
    }) : ["invalid-report"];
    equal(findings, [], "independent_changed_line_lint_failed");
  }
}

export function changedLineRanges(): Map<string, Array<[number, number]>> {
  const ranges = new Map<string, Array<[number, number]>>();
  let path = "";
  for (const line of git("diff", "--unified=0", "--", ...EXACT_ALLOWLIST).split("\n")) {
    if (line.startsWith("+++ b/")) path = line.slice(6);
    const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (match && path) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      if (count > 0) (ranges.get(path) ?? ranges.set(path, []).get(path)!).push([start, start + count - 1]);
    }
  }
  return ranges;
}

function validateRasterMetrics(metrics: RasterMetrics, check: CheckFunction, equal: EqualFunction) {
  const variants = readContract().variants;
  equal(metrics.tinyTextureDots?.length, 288, "tiny_texture_matrix");
  equal(new Set(metrics.tinyTextureDots?.map(row => [row.variant, row.scale, row.opacityByte, row.fx, row.fy].join("/"))).size, 288, "tiny_texture_unique");
  for (const row of metrics.tinyTextureDots ?? []) {
    check(["Pencil", "Sketch"].includes(row.variant) && [.5, 1, 2].includes(row.scale) && [26, 128, 255].includes(row.opacityByte) && [0, .25, .5, .75].includes(row.fx) && [0, .25, .5, .75].includes(row.fy), "tiny_texture_fixed_inputs");
    check(Number.isInteger(row.paintedPixels) && row.paintedPixels > 0 && row.wrongOpacityPixels === 0, "tiny_texture_visible_solid");
  }
  equal(metrics.textureHierarchy?.map(row => [row.size, row.smoothing]), [[4, 0], [4, 100], [12, 0], [12, 100], [24, 0], [24, 100]], "texture_matrix");
  for (const sample of metrics.textureHierarchy ?? []) {
    equal([sample.scale, sample.seed, sample.alphaThreshold], [sample.size === 4 ? 4 : 1, 173, 26], "texture_fixed_inputs");
    equal(sample.rows.map(row => row.variant), ["Brush", "Pencil", "Sketch"], "texture_variant_order");
    for (const row of sample.rows) {
      check([row.edgeSd, row.widthSd, row.detachedFraction].every(value => Number.isFinite(value) && value >= 0) && row.detachedFraction <= 1, "texture_finite");
      check(row.centerlineGaps === 0 && row.repeatIdentical === true, "texture_coherent_deterministic");
      if (row.variant !== "Brush") { equal(row.fractionalInkPixels, 0, "texture_opaque_marks"); equal(row.wrongPigmentPixels, 0, "texture_selected_color"); }
    }
    if (sample.rows.length !== 3) continue;
    const [brush, pencil, sketch] = sample.rows;
    check(brush.edgeSd === 0 && brush.widthSd === 0 && brush.detachedFraction === 0, "texture_brush_smooth");
    check(pencil.edgeSd >= sample.size * .025 && pencil.detachedFraction < .02, "texture_pencil_roughness");
    check(sketch.edgeSd >= Math.max(sample.size * .08, pencil.edgeSd * 2) && sketch.widthSd >= pencil.widthSd * 2, "texture_sketch_roughness");
    check(sketch.detachedFraction >= .02 && sketch.detachedFraction >= pencil.detachedFraction + .015, "texture_sketch_scatter");
  }
  equal(metrics.smoothing.map(value => value.variant).sort(), variants.slice().sort(), "smoothing_variant_matrix");
  for (const row of metrics.smoothing) {
    equal(row.levels, [0, 25, 50, 75, 100], `smoothing_levels:${row.variant}`);
    finiteSamples(row.jitterEnergy, 5, `smoothing_raw_jitter:${row.variant}`, check);
    equal(row.jitterEnergy.length, 5, `smoothing_jitter_count:${row.variant}`);
    check(row.jitterEnergy[0] > 0 && row.jitterEnergy[4] <= row.jitterEnergy[0] * 0.3, `smoothing_jitter_ratio:${row.variant}`);
    for (let i = 1; i < row.jitterEnergy.length; i += 1) check(row.jitterEnergy[i] <= row.jitterEnergy[i - 1] * 1.02, `smoothing_monotonic:${row.variant}:${i}`);
    finiteSamples(row.endpointErrors, 5, `smoothing_endpoints:${row.variant}`, check);
    check(row.endpointErrors.every(value => value <= 1), `smoothing_endpoint_error:${row.variant}`);
    check(row.rawDirectionRetention >= 0.85 && row.rawDirectionRetention <= 1, `rough_direction_retention:${row.variant}`);
    for (const angle of [row.circleMaxHeadingJumpDegrees, row.spiralMaxHeadingJumpDegrees, row.sMaxHeadingJumpDegrees]) check(Number.isFinite(angle) && angle >= 0 && angle <= 20, `continuous_curve_heading:${row.variant}`);
    check(Number.isFinite(row.maxCurveChordFraction) && row.maxCurveChordFraction >= 0 && row.maxCurveChordFraction <= 0.08, `curve_chord:${row.variant}`);
    equal(row.newSelfIntersections, 0, `new_self_intersection:${row.variant}`);
  }
  for (const variant of variants) {
    for (const opacity of [0.1, 0.5]) for (const scenario of ["repeat", "offset", "circle", "figure-eight", "reverse-join", "fast-slow", "texture"]) {
      const rows = metrics.coverage.filter(row => row.variant === variant && row.scenario === scenario && row.opacity === opacity);
      equal(rows.length, 1, `coverage_matrix:${variant}:${scenario}:${opacity}`);
      for (const row of rows) {
        equal(row.maximumCoverage, Math.round(opacity * 255), `coverage_ceiling:${variant}:${scenario}:${opacity}`);
        equal(row.fullCoverage, Math.round(opacity * 255), `coverage_full:${variant}:${scenario}:${opacity}`);
        if (variant === "Pencil" || variant === "Sketch") equal(row.partialCoveragePixels, 0, "texture_exact_configured_opacity");
        check(row.beadExcess >= 0 && row.beadExcess <= 1, `coverage_bead:${variant}:${scenario}`);
      }
    }
  }
  equal(metrics.pixelate.gaps, 0, "pixelate_gaps");
  equal(metrics.pixelate.rotatedCells, 0, "pixelate_rotated");
  equal(metrics.pixelate.partialCells, 0, "pixelate_partial");
  equal(metrics.pixelate.alphaValues, [0, 26], "pixelate_alpha");
  equal(metrics.glow.length, 6, "glow_matrix_count");
  for (const background of ["dark-neutral", "mid-neutral"]) {
    const rows = metrics.glow.filter(row => row.background === background).sort((a, b) => a.brightness - b.brightness);
    equal(rows.map(row => row.brightness), [0, 50, 100], `glow_brightness_matrix:${background}`);
    if (rows.length !== 3) continue;
    const [low, mid, high] = rows;
    equal(low.annulusMeanLinearLift, 0, `glow_zero_halo:${background}`);
    check(low.haloExtent <= low.size / 2 + .5, `glow_zero_fallback:${background}`);
    check(low.coreContrast > 1 && low.annulusMeanLinearLift >= 0, `glow_low_readable:${background}`);
    check(mid.annulusMeanLinearLift >= 0.08 && mid.coreContrast >= 3, `glow_mid_luminance:${background}`);
    check(high.annulusMeanLinearLift >= 0.18 && high.peakHaloLift >= mid.peakHaloLift * 1.5 && high.corePeakLinearLuminance >= 0.75, `glow_max_luminance:${background}`);
    check(low.annulusMeanLinearLift < mid.annulusMeanLinearLift && mid.annulusMeanLinearLift < high.annulusMeanLinearLift, `glow_ordering:${background}`);
    for (const row of rows) {
      equal([row.size, row.radius, row.color, row.opacityByte, row.annulus], [8, 50, "#00ffff", 255, [8, 20]], `glow_fixed_inputs:${background}:${row.brightness}`);
      check(row.hueRecognizable, `glow_hue:${background}:${row.brightness}`);
      check(row.haloExtent >= 0 && row.haloExtent <= Math.min(128, Math.max(8, row.size * 8)), `glow_extent:${background}:${row.brightness}`);
      check(row.corePeakLinearLuminance <= 1 && row.peakHaloLift <= 1 && row.annulusMeanLinearLift <= 1, `glow_finite_bound:${background}:${row.brightness}`);
    }
  }
}

function validateBrowserMetrics(metrics: BrowserMetrics, artifacts: Binding[], check: CheckFunction, equal: EqualFunction) {
  equal(metrics.buildMode, "production", "browser_not_production");
  check(typeof metrics.browserVersion === "string" && metrics.browserVersion.length > 0, "browser_version_missing");
  check(metrics.methodology.warmups >= 1, "browser_warmup_missing");
  check(metrics.methodology.operationBoundaries.length > 20 && metrics.methodology.settling.length > 20, "performance_methodology_missing");
  check(/^[a-f0-9]{64}$/.test(metrics.methodology.fixtureDigest), "representative_fixture_digest_missing");
  const contract = readContract();
  equal(metrics.profiles.map(profile => profile.id).sort(), ["compact", "desktop"], "browser_profile_matrix");
  for (const profile of metrics.profiles) {
    const expected = contract.profiles.find(value => value.id === profile.id);
    equal({ width: profile.width, height: profile.height, deviceScaleFactor: profile.deviceScaleFactor }, expected && { width: expected.width, height: expected.height, deviceScaleFactor: expected.deviceScaleFactor }, `browser_profile_dimensions:${profile.id}`);
    equal(profile.operations.slice().sort(), contract.requiredBrowserOperations.slice().sort(), `browser_operation_matrix:${profile.id}`);
    check(profile.screenshots.length >= 1 && profile.screenshots.every(path => artifacts.some(binding => binding.path === path)), `browser_screenshots_unbound:${profile.id}`);
    equal(Object.keys(profile.previewSamplesMs).sort(), contract.variants.slice().sort(), `preview_variant_matrix:${profile.id}`);
    for (const variant of contract.variants) {
      const samples = profile.previewSamplesMs[variant];
      finiteSamples(samples, 20, `preview_samples:${profile.id}:${variant}`, check);
      check(p95(samples) <= (profile.id === "desktop" ? 16.7 : 33.4), `preview_p95:${profile.id}:${variant}`);
    }
    finiteSamples(profile.pointerActiveLongTasksMs, 0, `long_tasks:${profile.id}`, check);
    check(profile.pointerActiveLongTasksMs.every(value => value <= 50), `pointer_active_long_task:${profile.id}`);
    finiteSamples(profile.postReleaseNoopSamplesMs, 20, `release_samples:${profile.id}`, check);
    check(profile.postReleaseNoopSamplesMs.every(value => value <= 200), `post_release_work:${profile.id}`);
    for (const [name, values, limit, exclusive] of [
      ["open", profile.openSamplesMs, 775, false], ["save", profile.saveSamplesMs, 1530, false],
      ["settled-heap", profile.settledHeapSamplesBytes, 335544320, true], ["transient-heap", profile.transientHeapSamplesBytes, 536870912, false],
    ] as const) {
      finiteSamples(values, 1, `${name}_samples:${profile.id}`, check);
      check(values.every(value => value > 0 && (exclusive ? value < limit : value <= limit)), `${name}_ceiling:${profile.id}`);
    }
    check(profile.maxRasterCompanionAllocationBytes > 0 && profile.maxRasterCompanionAllocationBytes <= 268435456, `allocation_ceiling:${profile.id}`);
    for (const field of ["stationaryPreviewDigestChanges", "previewCommitPixelMismatches", "previewCommitCoverageMismatches", "unexpectedHistoryEntries", "cancellationDigestMismatches", "noLossMismatches", "axeCritical", "axeSerious"] as const) equal(profile[field], 0, `${field}:${profile.id}`);
    check(profile.drawUndoCycles >= 20, `resource_cycles:${profile.id}`);
    equal(profile.scratchBytesAfterCycles, profile.scratchBytesBaseline, `scratch_not_released:${profile.id}`);
    check([profile.scratchBytesAfterCycles, profile.scratchBytesBaseline].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0), `scratch_samples_required:${profile.id}`);
    equal(profile.keyboardFocus, true, `keyboard_focus:${profile.id}`);
    equal(profile.zoomPercent, 200, `zoom:${profile.id}`);
    equal(profile.reducedMotion, true, `reduced_motion:${profile.id}`);
    check(profile.fullPlaybackTraversals >= 1, `full_playback_missing:${profile.id}`);
  }
  equal(metrics.pageErrors, [], "page_errors");
  equal(metrics.consoleErrors, [], "console_errors");
  equal(metrics.realApiRequests, 0, "real_api_requests");
  equal(metrics.externalRequests, 0, "external_requests");
  equal(metrics.sourceStoreWrites, 0, "source_store_writes");
  check(metrics.requests.length > 0, "browser_network_ledger_missing");
  for (const request of metrics.requests) {
    const url = new URL(request.url);
    equal(url.hostname, "127.0.0.1", "network_nonloopback");
    check(request.disposition !== "blocked", "network_blocked_attempt");
    if (url.pathname.startsWith("/api/")) check(url.pathname === "/api/ai" && request.method === "GET" && request.disposition === "mock-api", "network_real_api");
    else check(request.disposition === "loopback" || request.disposition === "mock-favicon", "network_disposition");
  }
  equal(metrics.visibleInspection.completed, true, "visible_inspection_missing");
  check(metrics.visibleInspection.notes.length > 40, "visible_inspection_notes_missing");
  check(metrics.visibleInspection.screenshotPaths.length > 0 && metrics.visibleInspection.screenshotPaths.every(path => artifacts.some(binding => binding.path === path)), "visible_inspection_images_unbound");
}

export function browserMetricErrors(metrics: BrowserMetrics, artifacts: Binding[]): string[] {
  const errors: string[] = [];
  validateBrowserMetrics(metrics, artifacts, (condition, message) => { if (!condition) errors.push(message); }, (actual, expected, message) => {
    try { assert.deepEqual(actual, expected); } catch { errors.push(message); }
  });
  return errors;
}

export function proofFilesPresent(): boolean { return EXACT_ALLOWLIST.every(path => existsSync(path)); }
