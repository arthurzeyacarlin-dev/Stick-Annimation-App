import type {
  UnifiedAnimationMigrationCandidateV1,
  UnifiedAnimationResolvedAssetV1,
  UnifiedDrawingCellPayloadV1,
} from "./unifiedAnimationContract";
import type { UnifiedAnimationProjectV2, UnifiedCellV2, UnifiedLayerV2 } from "./unifiedAnimationContractV2";
import type { UnifiedAnimationItemV2, UnifiedRasterBitmapV2 } from "./unifiedAnimationContentV2";
import type {
  DrawingProjectData,
  SerializedBitmap,
  StoredDrawingProject,
  StoredDrawingTimelineFrame,
} from "../drawingProjectStorage";
import type { StickFigureFrameContent } from "../../components/workspace/stickfigure/types";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";

export type UnifiedLegacyUpgradeOptionsV2 = {
  drawingData?: DrawingProjectData | null;
  sourceKindOverride?: "unified-v1";
};

const stableUuid = (key: string) => {
  let a = 0x811c9dc5, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x27d4eb2d);
    c = Math.imul(c ^ code, 0x165667b1);
    d = Math.imul(d ^ code, 0x9e3779b1);
  }
  const hex = [a, b, c, d].map(value => (value >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const cloneBitmap = (bitmap: SerializedBitmap | null | undefined): UnifiedRasterBitmapV2 | null => bitmap ? {
  width: bitmap.width,
  height: bitmap.height,
  data: bitmap.data instanceof Uint8ClampedArray
    ? bitmap.data.slice()
    : bitmap.data instanceof Uint8Array
      ? new Uint8ClampedArray(bitmap.data.slice().buffer)
      : Uint8ClampedArray.from(bitmap.data),
} : null;

const bytesById = (assets: readonly UnifiedAnimationResolvedAssetV1[]) => new Map(assets.map(asset => [asset.assetId, asset.bytes]));

const decodePng = async (bytes: Uint8Array, width: number, height: number): Promise<UnifiedRasterBitmapV2 | null> => {
  if (typeof createImageBitmap !== "function") return null;
  const image = await createImageBitmap(new Blob([bytes.slice()], { type: "image/png" }));
  try {
    const canvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : typeof document !== "undefined"
        ? Object.assign(document.createElement("canvas"), { width, height })
        : null;
    const context = canvas?.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!context) return null;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return { width, height, data: pixels.data.slice() };
  } finally {
    image.close();
  }
};

const candidateBitmap = async (
  candidate: UnifiedAnimationMigrationCandidateV1,
  assetId: string | null,
): Promise<UnifiedRasterBitmapV2 | null> => {
  if (!assetId) return null;
  const manifest = candidate.project.assets.find(asset => asset.assetId === assetId);
  const bytes = bytesById(candidate.resolvedAssets).get(assetId);
  if (!manifest || !bytes || manifest.kind === "drawing-audio-wav") throw new Error("asset_missing");
  if (manifest.kind === "drawing-raster-rgba") {
    return { width: manifest.width, height: manifest.height, data: new Uint8ClampedArray(bytes.slice().buffer) };
  }
  return decodePng(bytes, manifest.width, manifest.height);
};

const audioDataUrl = (candidate: UnifiedAnimationMigrationCandidateV1, assetId: string | null) => {
  if (!assetId) return null;
  const bytes = bytesById(candidate.resolvedAssets).get(assetId);
  if (!bytes) throw new Error("asset_missing");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const emptyFrame = (cell: UnifiedAnimationMigrationCandidateV1["project"]["document"]["layers"][number]["cells"][number]): StoredDrawingTimelineFrame => ({
  id: Number.isSafeInteger(Number(cell.sourceCellId)) && Number(cell.sourceCellId) > 0 ? Number(cell.sourceCellId) : cell.sourceStateId + 1,
  kind: cell.kind,
  cellType: cell.cellType,
  stateId: cell.sourceStateId,
  isBlank: cell.cellType === "blank-keyframe",
  hasTweenEndpoint: false,
  bitmap: null,
  previewUrl: null,
  tweenEndBitmap: null,
  tweenEndPreviewUrl: null,
  motionTween: null,
  soundAttachment: null,
  textObjects: [],
});

const createCompatibilityDrawingData = (
  candidate: UnifiedAnimationMigrationCandidateV1,
  supplied: DrawingProjectData | null | undefined,
) => {
  if (supplied) return structuredClone(supplied);
  const source = candidate.project.document;
  const activeLayer = source.layers.find(layer => layer.layerId === source.reopenState.activeLayerId) ?? source.layers[0];
  return {
    version: 1,
    activeTool: source.drawingState?.activeTool ?? "Select",
    brushSize: source.drawingState?.brushSize ?? 8,
    eraserSize: source.drawingState?.eraserSize ?? 24,
    fillColor: source.drawingState?.fillColor ?? "#111111",
    timelineFps: source.fps,
    shapeType: source.drawingState?.shapeType ?? "Square",
    activeLayerId: activeLayer.sourceLayerId,
    currentFrameIndex: source.reopenState.currentFrameIndex,
    selectedTimelineIndex: source.reopenState.selectedTimelineIndex,
    isOnionEnabled: source.reopenState.onionEnabled,
    layers: source.layers.map(layer => ({ id: layer.sourceLayerId, name: layer.name, orderIndex: layer.orderIndex, timelineFrames: layer.cells.map(emptyFrame) })),
    nextTimelineFrameId: source.drawingState?.nextTimelineFrameId ?? source.stickState?.nextFrameId ?? 1,
    nextLayerNumber: source.drawingState?.nextLayerNumber ?? source.stickState?.nextLayerNumber ?? source.layers.length + 1,
  } satisfies DrawingProjectData;
};

// Read-only compatibility upgrade. Source stores are never passed a write port.
export async function upgradeUnifiedProjectV1ToV2(
  candidate: UnifiedAnimationMigrationCandidateV1,
  options: UnifiedLegacyUpgradeOptionsV2 = {},
): Promise<UnifiedAnimationProjectV2> {
  const drawingData = createCompatibilityDrawingData(candidate, options.drawingData);
  const drawingLayers = new Map(drawingData.layers.map(layer => [layer.id, layer]));
  const stickByCell: Record<string, StickFigureFrameContent> = {};
  const sourceMap: Record<string, { sourceLayerId: string; sourceCellId: string; sourceStateId: number }> = {};
  const layers: UnifiedLayerV2[] = [];

  for (const [orderIndex, layer] of candidate.project.document.layers.entries()) {
    const drawingLayer = drawingLayers.get(layer.sourceLayerId);
    const cells: UnifiedCellV2[] = [];
    for (const [cellIndex, cell] of layer.cells.entries()) {
      sourceMap[cell.cellId] = { sourceLayerId: layer.sourceLayerId, sourceCellId: cell.sourceCellId, sourceStateId: cell.sourceStateId };
      if (cell.cellType === "empty") {
        cells.push({ cellId: cell.cellId, cellType: "empty", ownerCellId: null, content: null });
        continue;
      }
      if (cell.ownerCellId !== cell.cellId) {
        cells.push({ cellId: cell.cellId, cellType: cell.cellType, ownerCellId: cell.ownerCellId, content: null });
        continue;
      }
      const items: UnifiedAnimationItemV2[] = [];
      let soundAttachment = null;
      let dormantSourceContent: unknown | null = null;
      if (layer.contentKind === "drawing/v1" && cell.payload) {
        const payload = cell.payload as UnifiedDrawingCellPayloadV1;
        const drawingFrame = drawingLayer?.timelineFrames.find(frame => String(frame.id) === cell.sourceCellId) ?? drawingLayer?.timelineFrames[cellIndex];
        const bitmap = drawingFrame ? cloneBitmap(drawingFrame.bitmap) : await candidateBitmap(candidate, payload.bitmapAssetId);
        const tweenEndBitmap = drawingFrame ? cloneBitmap(drawingFrame.tweenEndBitmap) : await candidateBitmap(candidate, payload.tweenEndAssetId);
        const spriteBitmap = drawingFrame ? cloneBitmap(drawingFrame.motionTween?.spriteBitmap) : await candidateBitmap(candidate, payload.motionTween?.spriteAssetId ?? null);
        if (bitmap || tweenEndBitmap || payload.motionTween) items.push({
          itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:raster`),
          kind: "drawing-raster/v1",
          strokes: [],
          shapes: [],
          bitmap,
          tweenEndBitmap,
          motionTween: payload.motionTween ? {
            mode: "position",
            stageWidth: payload.motionTween.stageWidth,
            stageHeight: payload.motionTween.stageHeight,
            spriteBitmap,
            startOrigin: structuredClone(payload.motionTween.startOrigin),
            endOrigin: structuredClone(payload.motionTween.endOrigin),
          } : null,
          sourceTransform: structuredClone(layer.sourceDisplayTransform),
        });
        for (const [textIndex, text] of payload.textObjects.entries()) items.push({
          itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:text:${textIndex}`),
          kind: "drawing-text/v1",
          text: text.text,
          x: text.x,
          y: text.y,
          color: text.color,
          fontSize: text.fontSize,
          rotation: text.rotation,
          width: text.width,
          flipX: text.flipX,
          flipY: text.flipY,
          fontFamily: text.fontFamily,
          bold: text.bold,
          italic: text.italic,
        });
        soundAttachment = drawingFrame?.soundAttachment ? structuredClone(drawingFrame.soundAttachment) : payload.soundAttachment ? {
          id: payload.soundAttachment.id,
          title: payload.soundAttachment.title,
          description: payload.soundAttachment.description,
          timingFeel: payload.soundAttachment.timingFeel,
          intensityFeel: payload.soundAttachment.intensityFeel,
          audioDataUrl: audioDataUrl(candidate, payload.soundAttachment.audioAssetId),
          contentType: payload.soundAttachment.contentType,
          speechText: payload.soundAttachment.speechText,
          sourceTask: payload.soundAttachment.sourceTask,
          attachedAt: payload.soundAttachment.attachedAt,
        } : null;
        if (cell.cellType === "blank-keyframe" && items.length > 0) {
          dormantSourceContent = { items: structuredClone(items) };
          items.length = 0;
        }
      } else if (layer.contentKind === "stick-rig/v1" && cell.payload) {
        const content = structuredClone(cell.payload as StickFigureFrameContent);
        if (cell.cellType === "blank-keyframe") {
          if (content.figures.length || content.structureGraph.joints.length || content.structureGraph.limbs.length) {
            dormantSourceContent = { items: [{ itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:stick`), kind: "stick-rig/v1", content }] };
          }
        } else {
          items.push({ itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:stick`), kind: "stick-rig/v1", content });
          stickByCell[`${layer.sourceLayerId}:${cell.sourceStateId}`] = structuredClone(content);
        }
      }
      cells.push({
        cellId: cell.cellId,
        cellType: cell.cellType,
        ownerCellId: cell.cellId,
        content: { items, soundAttachment, dormantSourceContent },
      });
    }
    layers.push({ layerId: layer.layerId, name: layer.name, orderIndex, visible: layer.visible, locked: layer.locked, cells });
  }

  const sourceKind = options.sourceKindOverride ?? candidate.project.provenance.sourceKind;
  return {
    kind: "diamond-animation-project",
    schemaVersion: 2,
    projectId: candidate.project.projectId,
    title: candidate.project.title.trim() || "Untitled Project",
    createdAt: candidate.project.createdAt,
    updatedAt: candidate.project.updatedAt,
    revision: 0,
    provenance: {
      kind: "legacy-adoption",
      migrationVersion: 2,
      sourceKind,
      sourceProjectId: options.sourceKindOverride ? candidate.project.projectId : candidate.project.provenance.sourceProjectId,
      sourceRevision: candidate.project.sourceRevision,
      sourceRecordDigest: options.sourceKindOverride ? candidate.project.candidateDigest : candidate.project.provenance.sourceRecordDigest,
      sourceCandidateDigest: candidate.project.candidateDigest,
      adoptedAt: null,
    },
    auxiliary: structuredClone(candidate.project.auxiliary),
    document: {
      kind: "diamond-animation-document",
      schemaVersion: 2,
      projectId: candidate.project.projectId,
      logicalStage: candidate.project.document.logicalStage,
      fps: candidate.project.document.fps,
      layers,
      catalogs: { symbols: [], assets: [] },
      toolState: { drawingTool: candidate.project.document.drawingState?.activeTool ?? "Select", stickTool: candidate.project.document.reopenState.activeTool ?? "idle" },
      reopenState: {
        activeLayerId: candidate.project.document.reopenState.activeLayerId,
        currentFrameIndex: candidate.project.document.reopenState.currentFrameIndex,
        onionEnabled: candidate.project.document.reopenState.onionEnabled,
      },
    },
    compatibility: {
      drawingData,
      stickByCell,
      symbolInstancesByCell: {},
      sourceIdentityByCell: sourceMap,
    } as UnifiedAnimationProjectV2["compatibility"],
  };
}

export const createLegacyDrawingOpenProjectV2 = (project: UnifiedAnimationProjectV2): StoredDrawingProject => ({
  id: project.projectId,
  name: project.title,
  data: structuredClone(project.compatibility!.drawingData as DrawingProjectData),
  previewDataUrl: null,
  aiMemory: sanitizeDrawingAiProjectMemory(project.auxiliary?.drawingAiMemory) ?? null,
  created_at: project.createdAt,
  updated_at: project.updatedAt,
});
