import type { DrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import { bindDrawingAiProjectMemoryToProject } from "../ai/drawingAiProjectMemory.ts";
import type { StoredDrawingProject, StoredDrawingTimelineFrame, SerializedBitmap } from "../drawingProjectStorage.ts";
import { normalizeDrawingProjectV1Sound, validateDrawingProjectV1 } from "../drawingProjectV1Compatibility.ts";
import { sha256CanonicalJson, sha256Hex, verifyRecordCanonicalFields } from "../drawingProjectV2Canonical.ts";
import {
  parseDrawingProjectHeadV2,
  type DrawingProjectAssetV2,
  type DrawingProjectDocumentV2,
  type DrawingProjectHeadV2,
  type DrawingProjectVersionRecordV2,
} from "../drawingProjectV2Contract.ts";
import {
  parseStickSavedProjectsEnvelope,
  type StickSavedProjectRecordV1,
} from "../stickProjectStorage.ts";
import { canonicalJson } from "../stickfigure/stickProjectContract.ts";
import type { EditableStickProjectDocumentV1, EditableStickProjectViewStateV1 } from "../stickfigure/stickProjectHistory.ts";
import {
  deterministicUnifiedUuidV4,
  digestUnifiedAnimationCandidateV1,
  digestUnifiedAnimationDocumentV1,
  UnifiedAnimationError,
  validateUnifiedAnimationCandidateV1,
  type UnifiedAnimationAssetManifestV1,
  type UnifiedAnimationCellV1,
  type UnifiedAnimationDocumentV1,
  type UnifiedAnimationLayerV1,
  type UnifiedAnimationMigrationCandidateV1,
  type UnifiedAnimationResolvedAssetV1,
  type UnifiedDrawingCellPayloadV1,
  type UnifiedDrawingSoundAttachmentV1,
} from "./unifiedAnimationContract.ts";

type MigrationAssetAccumulator = {
  manifests: Map<string, UnifiedAnimationAssetManifestV1>;
  bytes: Map<string, Uint8Array>;
};

const clonePlain = <T>(value: T): T => JSON.parse(canonicalJson(value)) as T;

const asBytes = (bitmap: SerializedBitmap) => Array.isArray(bitmap.data)
  ? Uint8Array.from(bitmap.data)
  : new Uint8Array(bitmap.data.buffer, bitmap.data.byteOffset, bitmap.data.byteLength).slice();

const decodeAudioDataUrl = (value: string) => {
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match) throw new UnifiedAnimationError("invalid_record", "drawing.sound.audioDataUrl", "Only canonical WAV data URLs are supported.");
  const binary = globalThis.atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes.byteLength === 0) throw new UnifiedAnimationError("invalid_record", "drawing.sound.audioDataUrl", "Audio bytes are empty.");
  return bytes;
};

const addRawRaster = async (assets: MigrationAssetAccumulator, bitmap: SerializedBitmap | null) => {
  if (!bitmap) return null;
  const bytes = asBytes(bitmap);
  if (bytes.byteLength !== bitmap.width * bitmap.height * 4) {
    throw new UnifiedAnimationError("invalid_record", "drawing.bitmap", "Raster dimensions and bytes disagree.");
  }
  const digest = await sha256Hex(bytes);
  const assetId = `raster-rgba-${digest}`;
  if (!assets.manifests.has(assetId)) {
    assets.manifests.set(assetId, {
      assetId,
      kind: "drawing-raster-rgba",
      width: bitmap.width,
      height: bitmap.height,
      byteLength: bytes.byteLength,
      sha256: digest,
      rgbaByteLength: bytes.byteLength,
      rgbaSha256: digest,
    });
    assets.bytes.set(assetId, bytes.slice());
  }
  return assetId;
};

const addAudio = async (assets: MigrationAssetAccumulator, dataUrl: string | null) => {
  if (!dataUrl) return null;
  const bytes = decodeAudioDataUrl(dataUrl);
  const digest = await sha256Hex(bytes);
  const assetId = `audio-${digest}`;
  if (!assets.manifests.has(assetId)) {
    assets.manifests.set(assetId, { assetId, kind: "drawing-audio-wav", mimeType: "audio/wav", byteLength: bytes.byteLength, sha256: digest });
    assets.bytes.set(assetId, bytes.slice());
  }
  return assetId;
};

const drawingTransform = (frames: readonly StoredDrawingTimelineFrame[]) => {
  const tweenSpaces = new Map<string, { width: number; height: number }>();
  const rasterSpaces = new Map<string, { width: number; height: number }>();
  for (const frame of frames) {
    if (frame.motionTween) tweenSpaces.set(`${frame.motionTween.stageWidth}x${frame.motionTween.stageHeight}`, { width: frame.motionTween.stageWidth, height: frame.motionTween.stageHeight });
    for (const bitmap of [frame.bitmap, frame.tweenEndBitmap]) if (bitmap) rasterSpaces.set(`${bitmap.width}x${bitmap.height}`, { width: bitmap.width, height: bitmap.height });
  }
  if (tweenSpaces.size > 1 || (tweenSpaces.size === 0 && rasterSpaces.size > 1)) {
    throw new UnifiedAnimationError("source_space_inconsistent", "drawing.sourceSpace", "Drawing source dimensions are inconsistent.");
  }
  const source = [...tweenSpaces.values()][0] ?? [...rasterSpaces.values()][0] ?? { width: 1920, height: 1080 };
  const scale = Math.min(1920 / source.width, 1080 / source.height);
  const offsetX = (1920 - source.width * scale) / 2;
  const offsetY = (1080 - source.height * scale) / 2;
  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    targetWidth: 1920 as const,
    targetHeight: 1080 as const,
    scale,
    offsetX: Object.is(offsetX, -0) ? 0 : offsetX,
    offsetY: Object.is(offsetY, -0) ? 0 : offsetY,
  };
};

const mapDrawingSoundV1 = async (
  assets: MigrationAssetAccumulator,
  value: StoredDrawingTimelineFrame["soundAttachment"],
): Promise<UnifiedDrawingSoundAttachmentV1 | null> => {
  if (!value) return null;
  const sound = normalizeDrawingProjectV1Sound(value);
  return {
    id: sound.id,
    title: sound.title,
    description: sound.description,
    timingFeel: sound.timingFeel,
    intensityFeel: sound.intensityFeel,
    audioAssetId: await addAudio(assets, sound.audioDataUrl),
    contentType: sound.contentType,
    speechText: sound.speechText,
    sourceTask: sound.sourceTask,
    attachedAt: sound.attachedAt,
  };
};

const mapDrawingV1Payload = async (
  assets: MigrationAssetAccumulator,
  frame: StoredDrawingTimelineFrame,
): Promise<UnifiedDrawingCellPayloadV1> => ({
  bitmapAssetId: await addRawRaster(assets, frame.bitmap),
  tweenEndAssetId: await addRawRaster(assets, frame.tweenEndBitmap),
  motionTween: frame.motionTween ? {
    mode: "position",
    stageWidth: frame.motionTween.stageWidth,
    stageHeight: frame.motionTween.stageHeight,
    spriteAssetId: await addRawRaster(assets, frame.motionTween.spriteBitmap),
    startOrigin: frame.motionTween.startOrigin ? { ...frame.motionTween.startOrigin } : null,
    endOrigin: frame.motionTween.endOrigin ? { ...frame.motionTween.endOrigin } : null,
  } : null,
  soundAttachment: await mapDrawingSoundV1(assets, frame.soundAttachment),
  textObjects: (frame.textObjects ?? []).map((text) => ({
    id: text.id,
    text: text.text,
    x: text.x,
    y: text.y,
    width: text.width,
    flipX: Boolean(text.flipX),
    flipY: Boolean(text.flipY),
    rotation: text.rotation ?? 0,
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    color: text.color,
    bold: text.bold,
    italic: text.italic,
  })),
});

const orderedDrawingLayers = (layers: StoredDrawingProject["data"]["layers"]) => layers
  .map((layer, sourceIndex) => ({ layer, sourceIndex }))
  .sort((left, right) => left.layer.orderIndex - right.layer.orderIndex || left.sourceIndex - right.sourceIndex);

const mapDrawingV1Layers = async (
  sourceKind: "drawing-v1" | "drawing-v2",
  sourceProjectId: string,
  layers: StoredDrawingProject["data"]["layers"],
  assets: MigrationAssetAccumulator,
) => {
  const mapped: UnifiedAnimationLayerV1[] = [];
  const layerIdBySource = new Map<string, string>();
  for (const [orderIndex, { layer }] of orderedDrawingLayers(layers).entries()) {
    const layerId = await deterministicUnifiedUuidV4(`${sourceKind}:${sourceProjectId}:layer:${layer.id}`);
    layerIdBySource.set(layer.id, layerId);
    const ownerByState = new Map<number, string>();
    const cells: UnifiedAnimationCellV1[] = [];
    for (const frame of layer.timelineFrames) {
      const cellId = await deterministicUnifiedUuidV4(`${sourceKind}:${sourceProjectId}:layer:${layer.id}:cell:${frame.id}`);
      let ownerCellId: string | null = null;
      let payload: UnifiedDrawingCellPayloadV1 | null = null;
      if (frame.cellType === "hold") {
        ownerCellId = ownerByState.get(frame.stateId) ?? null;
        if (!ownerCellId) throw new UnifiedAnimationError("invalid_cell_owner", `drawing.layer.${layer.id}.frame.${frame.id}`, "Hold does not resolve an earlier owner.");
      } else if (frame.cellType !== "empty") {
        if (ownerByState.has(frame.stateId)) throw new UnifiedAnimationError("invalid_cell_owner", `drawing.layer.${layer.id}.frame.${frame.id}`, "Drawing state has multiple owners.");
        ownerCellId = cellId;
        ownerByState.set(frame.stateId, cellId);
        payload = await mapDrawingV1Payload(assets, frame);
      }
      cells.push({
        cellId,
        sourceCellId: String(frame.id),
        sourceStateId: frame.stateId,
        kind: frame.kind,
        cellType: frame.cellType,
        ownerCellId,
        payload,
      });
    }
    mapped.push({
      layerId,
      sourceLayerId: layer.id,
      sourceOrderIndex: layer.orderIndex,
      name: layer.name,
      orderIndex,
      visible: true,
      locked: false,
      contentKind: "drawing/v1",
      sourceDisplayTransform: drawingTransform(layer.timelineFrames),
      cells,
    });
  }
  return { layers: mapped, layerIdBySource };
};

const materializedAssets = (assets: MigrationAssetAccumulator) => ({
  manifests: [...assets.manifests.values()].sort((left, right) => left.assetId.localeCompare(right.assetId)),
  resolved: [...assets.bytes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([assetId, bytes]) => ({ assetId, bytes: bytes.slice() })),
});

const createProject = async (input: {
  sourceKind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2";
  sourceProjectId: string;
  sourceRecordDigest: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceRevision: number;
  document: Omit<UnifiedAnimationDocumentV1, "projectId">;
  assets: UnifiedAnimationAssetManifestV1[];
  resolvedAssets: UnifiedAnimationResolvedAssetV1[];
  drawingAiMemory: DrawingAiProjectMemory | null;
  stickLatch: { latchVersion: 1; status: "unconsumed" | "consumed" } | null;
}): Promise<UnifiedAnimationMigrationCandidateV1> => {
  const projectId = await deterministicUnifiedUuidV4(`diamond-animation-project/v1:${input.sourceKind}:${input.sourceProjectId}:${input.sourceRecordDigest}`);
  const document: UnifiedAnimationDocumentV1 = { ...input.document, projectId };
  const documentDigest = await digestUnifiedAnimationDocumentV1(document, input.assets);
  const projectWithoutCandidateDigest = {
    kind: "diamond-animation-project" as const,
    schemaVersion: 1 as const,
    projectId,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    sourceRevision: input.sourceRevision,
    documentDigest,
    provenance: {
      migrationVersion: 1 as const,
      sourceKind: input.sourceKind,
      sourceProjectId: input.sourceProjectId,
      sourceRecordDigest: input.sourceRecordDigest,
      importedAt: null,
    },
    document,
    assets: input.assets,
    auxiliary: {
      drawingAiMemory: bindDrawingAiProjectMemoryToProject(input.drawingAiMemory, projectId),
      stickAiCreationLatch: input.stickLatch ? { ...input.stickLatch, projectId } : null,
    },
  };
  const candidateDigest = await digestUnifiedAnimationCandidateV1(projectWithoutCandidateDigest);
  return validateUnifiedAnimationCandidateV1({
    project: { ...projectWithoutCandidateDigest, candidateDigest },
    resolvedAssets: input.resolvedAssets,
  });
};

const drawingDocument = (
  data: StoredDrawingProject["data"],
  layers: UnifiedAnimationLayerV1[],
  layerIdBySource: Map<string, string>,
): Omit<UnifiedAnimationDocumentV1, "projectId"> => {
  const activeLayerId = layerIdBySource.get(data.activeLayerId);
  const activeLayer = layers.find((layer) => layer.layerId === activeLayerId);
  const activeCell = activeLayer?.cells[data.selectedTimelineIndex];
  if (!activeLayerId || !activeCell) throw new UnifiedAnimationError("invalid_record", "drawing.reopenState", "Drawing reopen selection is out of range.");
  return {
    kind: "diamond-animation-document",
    schemaVersion: 1,
    logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" },
    fps: data.timelineFps,
    layers,
    drawingState: {
      activeTool: data.activeTool,
      brushSize: data.brushSize,
      eraserSize: data.eraserSize,
      fillColor: data.fillColor,
      shapeType: data.shapeType,
      nextTimelineFrameId: data.nextTimelineFrameId,
      nextLayerNumber: data.nextLayerNumber,
    },
    stickState: null,
    reopenState: {
      activeLayerId,
      activeCellId: activeCell.cellId,
      currentFrameIndex: data.currentFrameIndex,
      selectedTimelineIndex: data.selectedTimelineIndex,
      onionEnabled: data.isOnionEnabled,
      activeTool: data.activeTool,
      activePanel: null,
      camera: null,
    },
  };
};

export const migrateDrawingProjectV1ReadOnly = async (sourceValue: unknown): Promise<UnifiedAnimationMigrationCandidateV1> => {
  const source = validateDrawingProjectV1(sourceValue) as StoredDrawingProject;
  const sourceRecordDigest = await sha256CanonicalJson(source);
  const assets: MigrationAssetAccumulator = { manifests: new Map(), bytes: new Map() };
  const mapped = await mapDrawingV1Layers("drawing-v1", source.id, source.data.layers, assets);
  const materialized = materializedAssets(assets);
  return createProject({
    sourceKind: "drawing-v1",
    sourceProjectId: source.id,
    sourceRecordDigest,
    title: source.name,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
    sourceRevision: 0,
    document: drawingDocument(source.data, mapped.layers, mapped.layerIdBySource),
    assets: materialized.manifests,
    resolvedAssets: materialized.resolved,
    drawingAiMemory: sanitizeDrawingAiProjectMemory(source.aiMemory) ?? null,
    stickLatch: null,
  });
};

const v2SourceDigest = (head: DrawingProjectHeadV2, record: DrawingProjectVersionRecordV2) => sha256CanonicalJson({
  head,
  record: {
    ...record,
    assets: record.assets.map((asset) => Object.fromEntries(Object.entries(asset).filter(([key]) => key !== "bytes"))),
  },
});

const addDrawingV2Asset = async (assets: MigrationAssetAccumulator, asset: DrawingProjectAssetV2) => {
  const bytes = new Uint8Array(await asset.bytes.arrayBuffer());
  if (asset.kind === "raster-png") {
    const digest = await sha256Hex(bytes);
    if (bytes.byteLength !== asset.encodedByteLength || digest !== asset.encodedSha256) throw new UnifiedAnimationError("asset_digest_mismatch", `drawing-v2.asset.${asset.assetId}`, "PNG bytes do not match their source manifest.");
    const assetId = `raster-png-${asset.encodedSha256}`;
    assets.manifests.set(assetId, {
      assetId,
      kind: "drawing-raster-png",
      width: asset.width,
      height: asset.height,
      byteLength: asset.encodedByteLength,
      sha256: asset.encodedSha256,
      rgbaByteLength: asset.rgbaByteLength,
      rgbaSha256: asset.rgbaSha256,
    });
    assets.bytes.set(assetId, bytes);
    return assetId;
  }
  const digest = await sha256Hex(bytes);
  if (bytes.byteLength !== asset.byteLength || digest !== asset.sha256) throw new UnifiedAnimationError("asset_digest_mismatch", `drawing-v2.asset.${asset.assetId}`, "Audio bytes do not match their source manifest.");
  const assetId = `audio-${asset.sha256}`;
  assets.manifests.set(assetId, { assetId, kind: "drawing-audio-wav", mimeType: "audio/wav", byteLength: asset.byteLength, sha256: asset.sha256 });
  assets.bytes.set(assetId, bytes);
  return assetId;
};

const v2AsStoredProject = async (
  head: DrawingProjectHeadV2,
  record: DrawingProjectVersionRecordV2,
  assets: MigrationAssetAccumulator,
) => {
  const assetIds = new Map<string, string>();
  for (const asset of record.assets) assetIds.set(asset.assetId, await addDrawingV2Asset(assets, asset));
  const data: StoredDrawingProject["data"] = {
    version: 1,
    activeTool: record.document.activeTool,
    brushSize: record.document.brushSize,
    eraserSize: record.document.eraserSize,
    fillColor: record.document.fillColor,
    timelineFps: record.document.timelineFps,
    shapeType: record.document.shapeType,
    activeLayerId: record.document.activeLayerId,
    currentFrameIndex: record.document.currentFrameIndex,
    selectedTimelineIndex: record.document.selectedTimelineIndex,
    isOnionEnabled: record.document.isOnionEnabled,
    nextTimelineFrameId: record.document.nextTimelineFrameId,
    nextLayerNumber: record.document.nextLayerNumber,
    layers: record.document.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      orderIndex: layer.orderIndex,
      timelineFrames: layer.timelineFrames.map((frame) => ({
        id: frame.id,
        kind: frame.kind,
        cellType: frame.cellType,
        stateId: frame.stateId,
        isBlank: frame.isBlank,
        hasTweenEndpoint: frame.hasTweenEndpoint,
        bitmap: null,
        previewUrl: null,
        tweenEndBitmap: null,
        tweenEndPreviewUrl: null,
        motionTween: frame.motionTween ? {
          mode: "position",
          stageWidth: frame.motionTween.stageWidth,
          stageHeight: frame.motionTween.stageHeight,
          spriteBitmap: null,
          startOrigin: frame.motionTween.startOrigin ? { ...frame.motionTween.startOrigin } : null,
          endOrigin: frame.motionTween.endOrigin ? { ...frame.motionTween.endOrigin } : null,
        } : null,
        soundAttachment: frame.soundAttachment ? {
          ...frame.soundAttachment,
          audioDataUrl: null,
        } : null,
        textObjects: frame.textObjects.map((text) => ({ ...text })),
      })),
    })),
  };
  return { data, assetIds };
};

const mapDrawingV2Layers = async (
  sourceProjectId: string,
  document: DrawingProjectDocumentV2,
  assetIds: Map<string, string>,
) => {
  const layers: UnifiedAnimationLayerV1[] = [];
  const layerIdBySource = new Map<string, string>();
  const ordered = document.layers.map((layer, sourceIndex) => ({ layer, sourceIndex }))
    .sort((left, right) => left.layer.orderIndex - right.layer.orderIndex || left.sourceIndex - right.sourceIndex);
  for (const [orderIndex, { layer }] of ordered.entries()) {
    const layerId = await deterministicUnifiedUuidV4(`drawing-v2:${sourceProjectId}:layer:${layer.id}`);
    layerIdBySource.set(layer.id, layerId);
    const ownerByState = new Map<number, string>();
    const cells: UnifiedAnimationCellV1[] = [];
    for (const frame of layer.timelineFrames) {
      const cellId = await deterministicUnifiedUuidV4(`drawing-v2:${sourceProjectId}:layer:${layer.id}:cell:${frame.id}`);
      let ownerCellId: string | null = null;
      let payload: UnifiedDrawingCellPayloadV1 | null = null;
      if (frame.cellType === "hold") {
        ownerCellId = ownerByState.get(frame.stateId) ?? null;
        if (!ownerCellId) throw new UnifiedAnimationError("invalid_cell_owner", `drawing-v2.layer.${layer.id}.frame.${frame.id}`, "Hold does not resolve an earlier owner.");
      } else if (frame.cellType !== "empty") {
        ownerCellId = cellId;
        ownerByState.set(frame.stateId, cellId);
        payload = {
          bitmapAssetId: frame.bitmap ? assetIds.get(frame.bitmap.assetId) ?? null : null,
          tweenEndAssetId: frame.tweenEndBitmap ? assetIds.get(frame.tweenEndBitmap.assetId) ?? null : null,
          motionTween: frame.motionTween ? {
            mode: "position",
            stageWidth: frame.motionTween.stageWidth,
            stageHeight: frame.motionTween.stageHeight,
            spriteAssetId: frame.motionTween.spriteBitmap ? assetIds.get(frame.motionTween.spriteBitmap.assetId) ?? null : null,
            startOrigin: frame.motionTween.startOrigin ? { ...frame.motionTween.startOrigin } : null,
            endOrigin: frame.motionTween.endOrigin ? { ...frame.motionTween.endOrigin } : null,
          } : null,
          soundAttachment: frame.soundAttachment ? {
            id: frame.soundAttachment.id,
            title: frame.soundAttachment.title,
            description: frame.soundAttachment.description,
            timingFeel: frame.soundAttachment.timingFeel,
            intensityFeel: frame.soundAttachment.intensityFeel,
            audioAssetId: frame.soundAttachment.audioDataUrl ? assetIds.get(frame.soundAttachment.audioDataUrl.assetId) ?? null : null,
            contentType: frame.soundAttachment.contentType,
            speechText: frame.soundAttachment.speechText,
            sourceTask: frame.soundAttachment.sourceTask,
            attachedAt: frame.soundAttachment.attachedAt,
          } : null,
          textObjects: frame.textObjects.map((text) => ({ ...text })),
        };
      }
      cells.push({ cellId, sourceCellId: String(frame.id), sourceStateId: frame.stateId, kind: frame.kind, cellType: frame.cellType, ownerCellId, payload });
    }
    const storedFrames = layer.timelineFrames.map((frame) => ({
      id: frame.id,
      kind: frame.kind,
      cellType: frame.cellType,
      stateId: frame.stateId,
      isBlank: frame.isBlank,
      hasTweenEndpoint: frame.hasTweenEndpoint,
      bitmap: frame.bitmap ? { width: (recordAsset(document, frame.bitmap.assetId)?.width ?? 1), height: (recordAsset(document, frame.bitmap.assetId)?.height ?? 1), data: new Uint8Array(4) } : null,
      previewUrl: null,
      tweenEndBitmap: null,
      tweenEndPreviewUrl: null,
      motionTween: frame.motionTween ? { ...frame.motionTween, spriteBitmap: null } : null,
      soundAttachment: null,
      textObjects: frame.textObjects,
    })) as StoredDrawingTimelineFrame[];
    layers.push({ layerId, sourceLayerId: layer.id, sourceOrderIndex: layer.orderIndex, name: layer.name, orderIndex, visible: true, locked: false, contentKind: "drawing/v1", sourceDisplayTransform: drawingTransform(storedFrames), cells });
  }
  return { layers, layerIdBySource };
};

// V2 transform derivation needs only document asset dimensions; this helper is intentionally metadata-only.
const v2AssetLookup = new WeakMap<DrawingProjectDocumentV2, Map<string, { width: number; height: number }>>();
const recordAsset = (document: DrawingProjectDocumentV2, assetId: string) => v2AssetLookup.get(document)?.get(assetId);

export const migrateDrawingProjectV2ReadOnly = async (input: {
  head: DrawingProjectHeadV2;
  record: DrawingProjectVersionRecordV2;
  aiMemory?: unknown;
}): Promise<UnifiedAnimationMigrationCandidateV1> => {
  const head = parseDrawingProjectHeadV2(input.head);
  const record = await verifyRecordCanonicalFields(input.record);
  if (head.projectId !== record.projectId || head.activeStorageRevision !== record.storageRevision || head.documentDigest !== record.documentDigest || head.activeStoredByteLength !== record.storedByteLength) {
    throw new UnifiedAnimationError("source_digest_mismatch", "drawing-v2.head-record", "Drawing head and record do not match.");
  }
  v2AssetLookup.set(record.document, new Map(record.assets.flatMap((asset) => asset.kind === "raster-png" ? [[asset.assetId, { width: asset.width, height: asset.height }] as const] : [])));
  const assets: MigrationAssetAccumulator = { manifests: new Map(), bytes: new Map() };
  const converted = await v2AsStoredProject(head, record, assets);
  const mapped = await mapDrawingV2Layers(head.projectId, record.document, converted.assetIds);
  const materialized = materializedAssets(assets);
  return createProject({
    sourceKind: "drawing-v2",
    sourceProjectId: head.projectId,
    sourceRecordDigest: await v2SourceDigest(head, record),
    title: head.title,
    createdAt: head.createdAt,
    updatedAt: head.updatedAt,
    sourceRevision: head.activeStorageRevision,
    document: drawingDocument(converted.data, mapped.layers, mapped.layerIdBySource),
    assets: materialized.manifests,
    resolvedAssets: materialized.resolved,
    drawingAiMemory: sanitizeDrawingAiProjectMemory(input.aiMemory) ?? null,
    stickLatch: null,
  });
};

const mapStickLayers = async (sourceKind: "stick-v1" | "stick-v2", document: EditableStickProjectDocumentV1) => {
  const layers: UnifiedAnimationLayerV1[] = [];
  const layerIdBySource = new Map<string, string>();
  for (const [orderIndex, layer] of document.layers.entries()) {
    const layerId = await deterministicUnifiedUuidV4(`${sourceKind}:${document.projectId}:layer:${layer.id}`);
    layerIdBySource.set(layer.id, layerId);
    const ownerByState = new Map<number, string>();
    const cells: UnifiedAnimationCellV1[] = [];
    for (const frame of layer.frames) {
      const cellId = await deterministicUnifiedUuidV4(`${sourceKind}:${document.projectId}:layer:${layer.id}:cell:${frame.id}`);
      let ownerCellId: string | null = null;
      let payload = null;
      if (frame.cellType === "hold") {
        ownerCellId = ownerByState.get(frame.stateId) ?? null;
        if (!ownerCellId) throw new UnifiedAnimationError("invalid_cell_owner", `stick.layer.${layer.id}.frame.${frame.id}`, "Hold does not resolve an earlier owner.");
      } else if (frame.cellType !== "empty") {
        if (!frame.content) throw new UnifiedAnimationError("invalid_record", `stick.layer.${layer.id}.frame.${frame.id}`, "Stick owner payload is missing.");
        ownerCellId = cellId;
        ownerByState.set(frame.stateId, cellId);
        payload = clonePlain(frame.content);
      }
      cells.push({ cellId, sourceCellId: String(frame.id), sourceStateId: frame.stateId, kind: frame.kind, cellType: frame.cellType, ownerCellId, payload });
    }
    layers.push({
      layerId,
      sourceLayerId: layer.id,
      sourceOrderIndex: orderIndex,
      name: layer.name,
      orderIndex,
      visible: true,
      locked: false,
      contentKind: "stick-rig/v1",
      sourceDisplayTransform: null,
      cells,
    });
  }
  return { layers, layerIdBySource };
};

const stickDocument = (
  document: EditableStickProjectDocumentV1,
  reopen: EditableStickProjectViewStateV1,
  layers: UnifiedAnimationLayerV1[],
  layerIdBySource: Map<string, string>,
): Omit<UnifiedAnimationDocumentV1, "projectId"> => {
  const activeLayerId = layerIdBySource.get(reopen.activeLayerId);
  const activeLayer = layers.find((layer) => layer.layerId === activeLayerId);
  const activeCell = activeLayer?.cells[reopen.selectedTimelineIndex];
  if (!activeLayerId || !activeCell) throw new UnifiedAnimationError("invalid_record", "stick.reopenState", "Stick reopen selection is out of range.");
  return {
    kind: "diamond-animation-document",
    schemaVersion: 1,
    logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" },
    fps: document.fps,
    layers,
    drawingState: null,
    stickState: {
      documentRevision: document.documentRevision,
      nextFrameId: document.nextFrameId,
      nextStateId: document.nextStateId,
      nextLayerNumber: document.nextLayerNumber,
    },
    reopenState: {
      activeLayerId,
      activeCellId: activeCell.cellId,
      currentFrameIndex: reopen.currentFrameIndex,
      selectedTimelineIndex: reopen.selectedTimelineIndex,
      onionEnabled: false,
      activeTool: null,
      activePanel: null,
      camera: null,
    },
  };
};

export const migrateStickProjectReadOnly = async (sourceValue: unknown): Promise<UnifiedAnimationMigrationCandidateV1> => {
  const source = clonePlain(sourceValue) as StickSavedProjectRecordV1;
  const parsed = parseStickSavedProjectsEnvelope(JSON.stringify({ storageVersion: 1, projects: [source] }));
  if (!parsed.ok || parsed.value.projects.length !== 1) throw new UnifiedAnimationError("invalid_record", "stick.source", `Stick source rejected: ${parsed.ok ? "missing" : parsed.error}.`);
  const record = parsed.value.projects[0];
  const sourceKind = record.recordVersion === 1 ? "stick-v1" : "stick-v2";
  const sourceRecordDigest = await sha256CanonicalJson(record);
  const mapped = await mapStickLayers(sourceKind, record.document);
  return createProject({
    sourceKind,
    sourceProjectId: record.projectId,
    sourceRecordDigest,
    title: record.document.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceRevision: record.document.documentRevision,
    document: stickDocument(record.document, record.reopenState, mapped.layers, mapped.layerIdBySource),
    assets: [],
    resolvedAssets: [],
    drawingAiMemory: null,
    stickLatch: record.recordVersion === 2
      ? { latchVersion: 1, status: record.aiCreationLatch.status }
      : { latchVersion: 1, status: "consumed" },
  });
};

export type UnifiedLegacyMigrationSourceV1 =
  | { sourceKind: "drawing-v1"; project: unknown }
  | { sourceKind: "drawing-v2"; head: DrawingProjectHeadV2; record: DrawingProjectVersionRecordV2; aiMemory?: unknown }
  | { sourceKind: "stick-v1" | "stick-v2"; project: unknown };

export type UnifiedLegacyMigrationResultV1 =
  | { ok: true; candidate: UnifiedAnimationMigrationCandidateV1 }
  | { ok: false; error: { code: UnifiedAnimationError["code"]; stage: string } };

const stableFailure = (error: unknown) => {
  if (error instanceof UnifiedAnimationError) return { code: error.code, stage: error.stage };
  if (error && typeof error === "object") {
    const code = String((error as { code?: unknown }).code ?? "invalid_record");
    const stage = String((error as { stage?: unknown }).stage ?? "source");
    if (code === "unsupported_version") return { code: "unsupported_version" as const, stage };
    if (code === "asset_missing") return { code: "asset_missing" as const, stage };
    if (code === "asset_digest_mismatch") return { code: "asset_digest_mismatch" as const, stage };
    if (code === "project_too_large" || code === "storage_limit_exceeded") return { code: "project_too_large" as const, stage };
  }
  return { code: "invalid_record" as const, stage: "source" };
};

export const migrateLegacySourceReadOnly = async (
  source: UnifiedLegacyMigrationSourceV1,
): Promise<UnifiedLegacyMigrationResultV1> => {
  try {
    const candidate = source.sourceKind === "drawing-v1"
      ? await migrateDrawingProjectV1ReadOnly(source.project)
      : source.sourceKind === "drawing-v2"
        ? await migrateDrawingProjectV2ReadOnly(source)
        : await migrateStickProjectReadOnly(source.project);
    if (candidate.project.provenance.sourceKind !== source.sourceKind) {
      throw new UnifiedAnimationError("unsupported_version", "source.sourceKind", "Source kind does not match the parsed record.");
    }
    return { ok: true, candidate };
  } catch (error) {
    return { ok: false, error: stableFailure(error) };
  }
};
