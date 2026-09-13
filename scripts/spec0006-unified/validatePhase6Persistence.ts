import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { migrateLegacySourceReadOnly } from "../../src/lib/animation/unifiedAnimationMigration.ts";
import { upgradeUnifiedProjectV1ToV2 } from "../../src/lib/animation/unifiedAnimationMigrationV2.ts";
import { assertUnifiedAnimationProjectV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";
import { createUnifiedProjectStorageV2 } from "../../src/lib/animation/unifiedProjectStorageV2.ts";
import { createUnifiedProjectRepositoryV2 } from "../../src/lib/animation/unifiedProjectRepositoryV2.ts";
import type { DrawingProjectData } from "../../src/lib/drawingProjectStorage.ts";
import { orderProjectCollection, type ProjectCollectionEntry } from "../../src/lib/animation/unifiedProjectCollection.ts";
import { WorkspaceBootstrap } from "../../src/lib/animation/unifiedWorkspaceBootstrap.ts";
import { addOrReplaceItem, createUnifiedWorkspaceRootV2, redoUnified, undoUnified } from "../../src/lib/animation/unifiedTimelineReducer.ts";
import { createDrawingV1Fixture, createDrawingV2Fixture, createStickFixture, FIXTURE_TIME, RGBA_BYTES, WAV_BYTES } from "./phase1FixtureFactory.ts";
import { assertPhase6PayloadRetained, independentPhase6Inventory, rawStoreDigest } from "./phase6PersistenceOracle.ts";
import { createLargePhase6Project, createPendingLegacyProject, createPhase6Project, Phase6MemoryStorageAdapter } from "./phase6FixtureFactory.ts";

const cases = JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v2/phase6-adoption-recovery-cases.json", "utf8"));
let assertions = 0;
const check = (value: unknown, message?: string) => { assert.ok(value, message); assertions += 1; };
const equal = (left: unknown, right: unknown, message?: string) => { assert.deepEqual(left, right, message); assertions += 1; };
const rejects = async (operation: () => Promise<unknown>, code: string) => { await assert.rejects(operation, { message: code }); assertions += 1; };
const digestBytes = (value: Uint8Array | Uint8ClampedArray) => createHash("sha256").update(value).digest("hex");

const rawSources: { sourceKind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2"; source: Parameters<typeof migrateLegacySourceReadOnly>[0]; drawingData?: ReturnType<typeof createDrawingV1Fixture>["data"] }[] = [];
const drawingV1 = createDrawingV1Fixture();
rawSources.push({ sourceKind: "drawing-v1", source: { sourceKind: "drawing-v1", project: drawingV1 }, drawingData: drawingV1.data });
const drawingV2 = await createDrawingV2Fixture();
const drawingV2Document = drawingV2.record.document;
const drawingV2Data: DrawingProjectData = {
  version: 1,
  activeTool: drawingV2Document.activeTool,
  brushSize: drawingV2Document.brushSize,
  eraserSize: drawingV2Document.eraserSize,
  fillColor: drawingV2Document.fillColor,
  timelineFps: drawingV2Document.timelineFps,
  shapeType: drawingV2Document.shapeType,
  activeLayerId: drawingV2Document.activeLayerId,
  currentFrameIndex: drawingV2Document.currentFrameIndex,
  selectedTimelineIndex: drawingV2Document.selectedTimelineIndex,
  isOnionEnabled: drawingV2Document.isOnionEnabled,
  nextTimelineFrameId: drawingV2Document.nextTimelineFrameId,
  nextLayerNumber: drawingV2Document.nextLayerNumber,
  layers: drawingV2Document.layers.map(layer => ({
    id: layer.id,
    name: layer.name,
    orderIndex: layer.orderIndex,
    timelineFrames: layer.timelineFrames.map(frame => ({
      id: frame.id,
      kind: frame.kind,
      cellType: frame.cellType,
      stateId: frame.stateId,
      isBlank: frame.isBlank,
      hasTweenEndpoint: frame.hasTweenEndpoint,
      bitmap: frame.bitmap ? { width: 2, height: 2, data: new Uint8ClampedArray(RGBA_BYTES) } : null,
      previewUrl: null,
      tweenEndBitmap: null,
      tweenEndPreviewUrl: null,
      motionTween: null,
      soundAttachment: frame.soundAttachment ? {
        ...frame.soundAttachment,
        audioDataUrl: `data:audio/wav;base64,${Buffer.from(WAV_BYTES).toString("base64")}`,
      } : null,
      textObjects: structuredClone(frame.textObjects),
    })),
  })),
};
rawSources.push({ sourceKind: "drawing-v2", source: { sourceKind: "drawing-v2", ...drawingV2 }, drawingData: drawingV2Data });
rawSources.push({ sourceKind: "stick-v1", source: { sourceKind: "stick-v1", project: createStickFixture(1) } });
rawSources.push({ sourceKind: "stick-v2", source: { sourceKind: "stick-v2", project: createStickFixture(2) } });

for (const fixture of rawSources) {
  const before = rawStoreDigest(JSON.stringify(fixture.source));
  const migrated = await migrateLegacySourceReadOnly(fixture.source);
  check(migrated.ok, `${fixture.sourceKind} V1 migration`);
  if (!migrated.ok) continue;
  const upgraded = assertUnifiedAnimationProjectV2(await upgradeUnifiedProjectV1ToV2(migrated.candidate, { drawingData: fixture.drawingData ?? null }));
  equal(upgraded.provenance?.kind, "legacy-adoption");
  equal(upgraded.provenance?.kind === "legacy-adoption" ? upgraded.provenance.sourceKind : null, fixture.sourceKind);
  equal(rawStoreDigest(JSON.stringify(fixture.source)), before, `${fixture.sourceKind} source bytes`);
  check(upgraded.compatibility?.drawingData);
  if (fixture.drawingData) equal(upgraded.compatibility?.drawingData, fixture.drawingData, `${fixture.sourceKind} complete Drawing fields`);
}

const dormantDrawing = createDrawingV1Fixture();
dormantDrawing.id = "37e0557e-f128-49db-8b8d-92526936d4b8";
const dormantDrawingFrame = dormantDrawing.data.layers[0].timelineFrames[3];
dormantDrawingFrame.bitmap = structuredClone(dormantDrawing.data.layers[0].timelineFrames[0].bitmap);
dormantDrawingFrame.textObjects = structuredClone(dormantDrawing.data.layers[0].timelineFrames[0].textObjects);
dormantDrawingFrame.soundAttachment = structuredClone(dormantDrawing.data.layers[0].timelineFrames[0].soundAttachment);
const dormantDrawingV1 = await migrateLegacySourceReadOnly({ sourceKind: "drawing-v1", project: dormantDrawing });
check(dormantDrawingV1.ok, "V1-BLANK-DORMANT-01 Drawing migration");
if (!dormantDrawingV1.ok) throw new Error("dormant_drawing_failed");
const dormantDrawingV2 = await upgradeUnifiedProjectV1ToV2(dormantDrawingV1.candidate, { drawingData: dormantDrawing.data });
const dormantDrawingOwner = dormantDrawingV2.document.layers[0].cells[3].content!;
equal(dormantDrawingOwner.items, [], "dormant Drawing payload is not active");
equal((dormantDrawingOwner.dormantSourceContent as { items: { kind: string }[] }).items.map(item => item.kind), ["drawing-raster/v1", "drawing-text/v1"]);
check(dormantDrawingOwner.soundAttachment?.audioDataUrl?.startsWith("data:audio/wav;base64,"));

const dormantStick = createStickFixture(2);
dormantStick.projectId = "eea12983-043a-4898-ad8d-69ebd14410b0";
dormantStick.document.projectId = dormantStick.projectId;
if (dormantStick.recordVersion !== 2) throw new Error("dormant_stick_version");
dormantStick.aiCreationLatch.projectId = dormantStick.projectId;
dormantStick.document.layers[0].frames[2].content = structuredClone(dormantStick.document.layers[0].frames[0].content);
const dormantStickV1 = await migrateLegacySourceReadOnly({ sourceKind: "stick-v2", project: dormantStick });
check(dormantStickV1.ok, "V1-BLANK-DORMANT-01 Stick migration");
if (!dormantStickV1.ok) throw new Error("dormant_stick_failed");
const dormantStickV2 = await upgradeUnifiedProjectV1ToV2(dormantStickV1.candidate);
const dormantStickOwner = dormantStickV2.document.layers[0].cells[2].content!;
equal(dormantStickOwner.items, [], "dormant Stick payload is not active");
equal((dormantStickOwner.dormantSourceContent as { items: { kind: string }[] }).items.map(item => item.kind), ["stick-rig/v1"]);
assertUnifiedAnimationProjectV2(dormantDrawingV2); assertions += 1;
assertUnifiedAnimationProjectV2(dormantStickV2); assertions += 1;

const unifiedSeed = await migrateLegacySourceReadOnly({ sourceKind: "drawing-v1", project: drawingV1 });
if (!unifiedSeed.ok) throw new Error("unified_v1_seed_failed");
const strictUnified = await upgradeUnifiedProjectV1ToV2(unifiedSeed.candidate, { drawingData: drawingV1.data, sourceKindOverride: "unified-v1" });
equal(strictUnified.provenance?.kind === "legacy-adoption" ? strictUnified.provenance.sourceKind : null, "unified-v1");
equal(strictUnified.document.layers[0].cells[0].content?.items.map(item => item.kind), ["drawing-raster/v1", "drawing-text/v1"]);
check(strictUnified.document.layers[0].cells[0].content?.soundAttachment?.audioDataUrl?.startsWith("data:audio/wav;base64,"));

const adapter = new Phase6MemoryStorageAdapter();
const storage = createUnifiedProjectStorageV2(adapter);
const generatedIds = [
  "776a3de8-f575-41f3-bbf0-5dce1778012a",
  "176bc2ea-dba4-4d49-9179-3cd02327b482",
  "3ffda1a4-d21b-42ad-aa98-dd3053e358a8",
];
const repository = createUnifiedProjectRepositoryV2({
  now: () => "2026-09-13T01:02:03.000Z",
  createId: () => generatedIds.shift() ?? crypto.randomUUID(),
  storage,
});

const native = await createPhase6Project();
const savedNative = await repository.save(native);
equal(savedNative.projectId, native.projectId, "native first Save retains ID");
equal(savedNative.revision, 1);
assertPhase6PayloadRetained(native, savedNative); assertions += 1;
const oldHeadDigest = adapter.heads.get(savedNative.projectId)!.projectDigest;
const edited = structuredClone(savedNative);
edited.title = "Phase 6 renamed once";
const savedAgain = await repository.save(edited);
equal(savedAgain.revision, 2);
equal(savedAgain.title, "Phase 6 renamed once");
const copy = await repository.saveAs(savedAgain, "Phase 6 Copy");
equal(copy.projectId, "776a3de8-f575-41f3-bbf0-5dce1778012a");
equal(copy.title, "Phase 6 Copy");
equal(copy.provenance?.kind, "copy");
equal(adapter.heads.get(savedAgain.projectId)?.projectDigest !== oldHeadDigest, true);
assertPhase6PayloadRetained(savedAgain, copy, { identityMayChange: true, titleMayChange: true }); assertions += 1;

const largeProfile = cases.largeRasterProfile as {
  width: number;
  height: number;
  byteLength: number;
  firstFill: number;
  firstSha256: string;
  secondFill: number;
  secondSha256: string;
};
const largeProject = await createLargePhase6Project(largeProfile);
const largeRaster = largeProject.document.layers[0].cells[0].content?.items.find(item => item.kind === "drawing-raster/v1");
if (!largeRaster || largeRaster.kind !== "drawing-raster/v1" || !largeRaster.bitmap || !largeRaster.tweenEndBitmap || !largeRaster.motionTween?.spriteBitmap) throw new Error("large_fixture_invalid");
equal(largeRaster.bitmap.data.byteLength, largeProfile.byteLength, "first large raster byte length");
equal(largeRaster.tweenEndBitmap.data.byteLength, largeProfile.byteLength, "second large raster byte length");
equal(digestBytes(largeRaster.bitmap.data), largeProfile.firstSha256, "independent first large raster digest");
equal(digestBytes(largeRaster.tweenEndBitmap.data), largeProfile.secondSha256, "independent second large raster digest");
const largeAdapter = new Phase6MemoryStorageAdapter();
const largeStorage = createUnifiedProjectStorageV2(largeAdapter);
const largeStartedAt = performance.now();
const savedLarge = await largeStorage.write({ ...largeProject, revision: 1 }, null);
const largeRoundTripMs = performance.now() - largeStartedAt;
const savedLargeRaster = savedLarge.document.layers[0].cells[0].content?.items.find(item => item.kind === "drawing-raster/v1");
if (!savedLargeRaster || savedLargeRaster.kind !== "drawing-raster/v1" || !savedLargeRaster.bitmap || !savedLargeRaster.tweenEndBitmap || !savedLargeRaster.motionTween?.spriteBitmap) throw new Error("large_readback_invalid");
equal(digestBytes(savedLargeRaster.bitmap.data), largeProfile.firstSha256, "first large raster survives Save/Open");
equal(digestBytes(savedLargeRaster.tweenEndBitmap.data), largeProfile.secondSha256, "second large raster survives Save/Open");
equal(digestBytes(savedLargeRaster.motionTween.spriteBitmap.data), largeProfile.firstSha256, "tween source survives Save/Open");
equal(savedLargeRaster.motionTween, { ...largeRaster.motionTween, spriteBitmap: savedLargeRaster.motionTween.spriteBitmap }, "large tween metadata survives");
equal(savedLarge.document.catalogs, largeProject.document.catalogs, "large project catalog survives");
equal(savedLarge.document.layers[0].cells[0].content?.soundAttachment, largeProject.document.layers[0].cells[0].content?.soundAttachment, "large project audio survives");
check(largeAdapter.heads.get(savedLarge.projectId)!.storedByteLength < cases.projectByteLimit, "large project remains inside frozen per-project limit");
equal([...largeAdapter.assets.values()].filter(asset => asset.byteLength === largeProfile.byteLength).length, 2, "two distinct large content-addressed assets");

const legacy = await createPendingLegacyProject("drawing-v1");
const legacyIdentity = legacy.projectId;
legacy.auxiliary = {
  drawingAiMemory: {
    version: 1,
    ownerProjectId: legacyIdentity,
    taskType: null,
    interactionMode: "create",
    currentGoal: "Preserve the scene",
    contextSummary: null,
    lastPrompt: null,
    lastUpdatedAt: FIXTURE_TIME,
    recentEdits: [],
    storyState: null,
    generateFramesState: null,
  },
  stickAiCreationLatch: { latchVersion: 1, projectId: legacyIdentity, status: "consumed" },
};
const adopted = await repository.save(legacy);
equal(adopted.projectId, "176bc2ea-dba4-4d49-9179-3cd02327b482");
check(adopted.projectId !== legacyIdentity);
equal(adopted.provenance?.kind === "legacy-adoption" ? adopted.provenance.adoptedAt : null, "2026-09-13T01:02:03.000Z");
equal(adapter.heads.has(legacyIdentity), false);
equal((adopted.auxiliary?.drawingAiMemory as { ownerProjectId: string }).ownerProjectId, adopted.projectId);
equal(adopted.auxiliary?.stickAiCreationLatch?.projectId, adopted.projectId);
assertPhase6PayloadRetained(legacy, adopted, { identityMayChange: true }); assertions += 1;

const legacyEntry = (id: string, sourceKind: ProjectCollectionEntry["sourceKind"], sourceId: string, sourceDigest: string, title: string): ProjectCollectionEntry => ({
  id, locator: id, title, updatedAt: "2026-09-13T00:00:00.000Z", classification: "legacy", sourceKind, sourceId, sourceDigest,
  candidateDigest: "3".repeat(64), error: null, protectedSource: false, provenanceKey: `${sourceKind}:${sourceId}:${sourceDigest}`,
});
const canonical: ProjectCollectionEntry = {
  ...legacyEntry("canonical", "unified-v2", adopted.projectId, adopted.projectId, adopted.title),
  classification: "canonical",
  updatedAt: "2026-09-13T01:02:03.000Z",
  provenanceKey: "drawing-v1:legacy-drawing-v1-project:" + "1".repeat(64),
};
const source = legacyEntry("source", "drawing-v1", "legacy-drawing-v1-project", "1".repeat(64), "Same title");
const differentIdentity = legacyEntry("other", "drawing-v1", "different-id", "1".repeat(64), "Same title");
const ordered = orderProjectCollection([source, differentIdentity, canonical]);
equal(ordered.map(entry => entry.id).sort(), ["canonical", "other"]);
equal(ordered.find(entry => entry.id === "canonical")?.protectedSource, true);

for (const fault of ["encode", "hash", "decode", "readback", "crash-before-head", "quota", "asset", "version", "abort", "cas"] as const) {
  const faultAdapter = new Phase6MemoryStorageAdapter();
  const faultStorage = createUnifiedProjectStorageV2(faultAdapter);
  const baseline = await faultStorage.write({ ...(await createPhase6Project()), revision: 1 }, null);
  const candidate = structuredClone(baseline);
  candidate.revision = 2;
  candidate.title = `fault-${fault}`;
  const faultRaster = candidate.document.layers[0].cells[0].content?.items.find(item => item.kind === "drawing-raster/v1");
  if (faultRaster?.kind === "drawing-raster/v1" && faultRaster.bitmap) faultRaster.bitmap.data[0] = (faultRaster.bitmap.data[0] + 1) % 256;
  const headBefore = structuredClone(faultAdapter.heads.get(candidate.projectId));
  if (["quota", "asset", "version", "abort", "cas"].includes(fault)) faultAdapter.fault = fault as typeof faultAdapter.fault;
  const hooks = ["encode", "hash", "decode", "readback"].includes(fault)
    ? { [fault]: () => { throw new Error(`${fault}_failed`); } }
    : fault === "crash-before-head" ? { beforePublish: () => { throw new Error("crash_before_head"); } } : {};
  await rejects(() => faultStorage.write(candidate, 1, hooks), fault === "quota" ? "collection_too_large" : fault === "cas" ? "stale_revision" : fault === "asset" ? "asset_missing" : fault === "version" ? "readback_failed" : fault === "abort" ? "storage_write_failed" : fault === "crash-before-head" ? "crash_before_head" : `${fault}_failed`);
  equal(faultAdapter.heads.get(candidate.projectId), headBefore, `${fault} preserves head`);
  const recovered = await faultStorage.read(candidate.projectId);
  equal(recovered.title, baseline.title, `${fault} recovers last good head`);
  faultAdapter.fault = null;
  const retried = await faultStorage.write(candidate, 1);
  equal([retried.revision, retried.title], [2, `fault-${fault}`], `${fault} safe retry`);
}

const fallbackAdapter = new Phase6MemoryStorageAdapter();
const fallbackStorage = createUnifiedProjectStorageV2(fallbackAdapter);
const fallbackOne = await fallbackStorage.write({ ...(await createPhase6Project()), revision: 1 }, null);
const fallbackTwoCandidate = structuredClone(fallbackOne);
fallbackTwoCandidate.revision = 2;
fallbackTwoCandidate.title = "published-but-corrupt";
await fallbackStorage.write(fallbackTwoCandidate, 1);
for (const [key, version] of fallbackAdapter.versions) {
  if (version.projectId === fallbackOne.projectId && version.revision === 2) fallbackAdapter.versions.delete(key);
}
const fallbackRecovered = await fallbackStorage.read(fallbackOne.projectId);
equal([fallbackRecovered.revision, fallbackRecovered.title], [1, fallbackOne.title], "corrupt active version falls back to last good retained version");

const raceAdapter = new Phase6MemoryStorageAdapter();
const raceStorage = createUnifiedProjectStorageV2(raceAdapter);
const raceBase = await raceStorage.write({ ...(await createPhase6Project()), revision: 1 }, null);
const raceA = structuredClone(raceBase); raceA.revision = 2; raceA.title = "race-a";
const raceB = structuredClone(raceBase); raceB.revision = 2; raceB.title = "race-b";
await raceStorage.write(raceA, 1);
await rejects(() => raceStorage.write(raceB, 1), "stale_revision");
equal((await raceStorage.read(raceBase.projectId)).title, "race-a");

const duplicateRepository = createUnifiedProjectRepositoryV2({
  now: () => "2026-09-13T01:02:03.000Z",
  createId: () => raceBase.projectId,
  storage: raceStorage,
});
await rejects(() => duplicateRepository.saveAs(raceA, "collision"), "duplicate_identity");

let root = createUnifiedWorkspaceRootV2(savedNative.document);
const rootLayer = root.document.layers[0].layerId;
const textItem = root.document.layers[0].cells[0].content!.items.find(item => item.kind === "drawing-text/v1")!;
for (let index = 0; index < cases.historyOperations; index += 1) {
  const changed = structuredClone(textItem);
  if (changed.kind === "drawing-text/v1") changed.x += index + 1;
  root = addOrReplaceItem(root, rootLayer, 0, changed);
}
const finalDocument = structuredClone(root.document);
for (let index = 0; index < cases.historyOperations; index += 1) root = undoUnified(root);
for (let index = 0; index < cases.historyOperations; index += 1) root = redoUnified(root);
equal(root.document, finalDocument, "full interleaved history");

const bootstrap = new WorkspaceBootstrap();
let releaseFirst!: (value: Awaited<ReturnType<typeof import("../../src/lib/animation/unifiedWorkspaceBootstrap.ts").createUntitledWorkspace>>) => void;
const first = bootstrap.open(() => new Promise(resolve => { releaseFirst = resolve; }));
const secondCandidate = { id: "second", title: "Second", digest: "second", document: native.document as never, migration: null, editor: { kind: "unified" as const, project: native } };
equal((await bootstrap.open(async () => secondCandidate)).status, "opened");
releaseFirst({ ...secondCandidate, id: "first", title: "First" });
equal((await first).status, "stale");
equal(bootstrap.current?.candidate.id, "second");

const deterministicInventory = independentPhase6Inventory(await createPhase6Project());
for (let index = 0; index < cases.deterministicCases; index += 1) {
  equal(independentPhase6Inventory(await createPhase6Project()), deterministicInventory, `deterministic fixture ${index}`);
}

const sourceText = readFileSync("src/components/workspace/DrawingWorkspace.tsx", "utf8");
check(sourceText.includes("documentGenerationRef.current === capturedGeneration"), "stale generation must remain dirty");
check(sourceText.includes("workspaceInstanceIdRef.current !== capturedWorkspaceInstanceId"), "stale instance must not publish UI state");
check(!/autosave.*saveUnifiedProjectV2/i.test(sourceText), "no canonical autosave");
const bootstrapSourceText = readFileSync("src/lib/animation/unifiedWorkspaceBootstrap.ts", "utf8");
check(!bootstrapSourceText.split("export const prepareCollectionWorkspace")[1]?.includes("JSON.stringify(project.document)"), "canonical Open must not expand typed assets into a JSON mount token");

console.log(JSON.stringify({
  status: "PASS",
  assertions,
  sourceKinds: cases.sourceKinds,
  faults: cases.faults,
  deterministicCases: cases.deterministicCases,
  historyOperations: cases.historyOperations,
  payload: independentPhase6Inventory(savedNative),
  largeProfile: {
    width: largeProfile.width,
    height: largeProfile.height,
    sourceBytes: largeProfile.byteLength * 2,
    storedBytes: largeAdapter.heads.get(savedLarge.projectId)!.storedByteLength,
    roundTripMs: Number(largeRoundTripMs.toFixed(1)),
    largeAssetCount: [...largeAdapter.assets.values()].filter(asset => asset.byteLength === largeProfile.byteLength).length,
    firstSha256: largeProfile.firstSha256,
    secondSha256: largeProfile.secondSha256,
  },
  externalRequests: 0,
}));
