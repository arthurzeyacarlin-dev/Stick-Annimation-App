import { assertDrawingOnlyUnifiedProjectV2, type UnifiedAnimationProjectV2, type UnifiedCellV2, type UnifiedLayerV2 } from "../animation/unifiedAnimationContractV2.ts";
import { listProjectCollection, type ProjectCollectionEntry } from "../animation/unifiedProjectCollection.ts";
import type { ProjectSourceReader } from "../animation/unifiedProjectSourceReader.ts";
import type { UnifiedDrawingRasterItemV2, UnifiedRasterBitmapV2 } from "../animation/unifiedAnimationContentV2.ts";
import { digestUnifiedProjectV2 } from "../animation/unifiedProjectStorageV2.ts";
import { prepareCollectionWorkspace } from "../animation/unifiedWorkspaceBootstrap.ts";

export type ExportProjectSnapshot = {
  entry: ProjectCollectionEntry;
  project: UnifiedAnimationProjectV2;
  projectDigest: string;
  frameCount: number;
  durationSeconds: number;
};

// DrawingWorkspace renders its saved raster canvas as a centered 4.6x authoring
// world behind the visible stage. Saved bitmap x/y values are coordinates in
// that world, not in the document's 1920x1080 logical symbol stage.
export const EXPORT_AUTHORING_WORLD_SCALE = 4.6;

export type ExportRasterPlacement = {
  bitmap: UnifiedRasterBitmapV2;
  x: number;
  y: number;
  referenceWidth: number;
  referenceHeight: number;
};

export const resolveExportAuthoringTransform = (
  outputWidth: number,
  outputHeight: number,
  referenceWidth: number,
  referenceHeight: number,
) => ({
  offsetX: ((1 - EXPORT_AUTHORING_WORLD_SCALE) / 2) * outputWidth,
  offsetY: ((1 - EXPORT_AUTHORING_WORLD_SCALE) / 2) * outputHeight,
  scaleX: (EXPORT_AUTHORING_WORLD_SCALE * outputWidth) / Math.max(1, referenceWidth),
  scaleY: (EXPORT_AUTHORING_WORLD_SCALE * outputHeight) / Math.max(1, referenceHeight),
});

export const getExportAuthoredFrameCount = (project: UnifiedAnimationProjectV2) => {
  let lastAuthoredFrameIndex = -1;
  for (const layer of project.document.layers) {
    for (let index = layer.cells.length - 1; index >= 0; index -= 1) {
      if (layer.cells[index]?.cellType !== "empty") {
        lastAuthoredFrameIndex = Math.max(lastAuthoredFrameIndex, index);
        break;
      }
    }
  }
  return lastAuthoredFrameIndex + 1;
};

export const formatExportDuration = (durationSeconds: number) => {
  const safeDuration = Math.max(0, durationSeconds);
  const minutes = Math.floor(safeDuration / 60);
  const seconds = safeDuration - minutes * 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(1).padStart(4, "0")}` : `${seconds.toFixed(1)}s`;
};

export const exportCollectionEntryIdentityMatches = (left: ProjectCollectionEntry, right: ProjectCollectionEntry) =>
  left.locator === right.locator &&
  left.sourceKind === right.sourceKind &&
  left.sourceId === right.sourceId &&
  left.classification === right.classification &&
  left.sourceDigest === right.sourceDigest &&
  left.candidateDigest === right.candidateDigest &&
  left.updatedAt === right.updatedAt;

export const loadExportProjectSnapshot = async (
  reader: ProjectSourceReader,
  entry: ProjectCollectionEntry,
): Promise<ExportProjectSnapshot> => {
  if (entry.classification === "invalid") throw new Error(entry.error ?? "invalid_record");

  const currentEntry = (await listProjectCollection(reader)).find(candidate => candidate.locator === entry.locator);
  if (!currentEntry || !exportCollectionEntryIdentityMatches(entry, currentEntry)) throw new Error("source_changed");

  const candidate = await prepareCollectionWorkspace(reader, currentEntry);
  const project = assertDrawingOnlyUnifiedProjectV2(candidate.editor.project);
  if (project.projectId !== currentEntry.sourceId && currentEntry.sourceKind === "unified-v2") {
    throw new Error("source_changed");
  }
  if (currentEntry.updatedAt && project.updatedAt !== currentEntry.updatedAt) throw new Error("source_changed");

  const immutableProject = structuredClone(project);
  const projectDigest = await digestUnifiedProjectV2(immutableProject);
  const frameCount = getExportAuthoredFrameCount(immutableProject);
  return {
    entry: { ...currentEntry },
    project: immutableProject,
    projectDigest,
    frameCount,
    durationSeconds: frameCount / immutableProject.document.fps,
  };
};

export const resolveExportOwnerCell = (layer: UnifiedLayerV2, frameIndex: number): UnifiedCellV2 | null => {
  const frame = layer.cells[frameIndex] ?? null;
  if (!frame || frame.cellType === "empty" || !frame.ownerCellId) return null;
  return layer.cells.find(cell => cell.cellId === frame.ownerCellId) ?? null;
};

export const resolveExportTweenProgress = (layer: UnifiedLayerV2, frameIndex: number) => {
  const frame = layer.cells[frameIndex] ?? null;
  if (!frame || frame.cellType !== "tween" || !frame.ownerCellId) return null;
  let start = frameIndex;
  while (start > 0 && layer.cells[start - 1]?.cellType === "tween" && layer.cells[start - 1]?.ownerCellId === frame.ownerCellId) start -= 1;
  let end = frameIndex;
  while (end + 1 < layer.cells.length && layer.cells[end + 1]?.cellType === "tween" && layer.cells[end + 1]?.ownerCellId === frame.ownerCellId) end += 1;
  return (frameIndex - start + 1) / (end - start + 2);
};


export const resolveExportRasterPlacement = (
  layer: UnifiedLayerV2,
  frameIndex: number,
  item: UnifiedDrawingRasterItemV2,
): ExportRasterPlacement | null => {
  const tweenProgress = resolveExportTweenProgress(layer, frameIndex);
  if (tweenProgress !== null) {
    const tween = item.motionTween;
    // Workspace playback deliberately renders an invalid/incomplete tween as
    // blank instead of silently falling back to the owner's starting bitmap.
    if (!item.tweenEndBitmap || !tween?.spriteBitmap || !tween.startOrigin || !tween.endOrigin) return null;
    return {
      bitmap: tween.spriteBitmap,
      x: Math.round(tween.startOrigin.x + (tween.endOrigin.x - tween.startOrigin.x) * tweenProgress),
      y: Math.round(tween.startOrigin.y + (tween.endOrigin.y - tween.startOrigin.y) * tweenProgress),
      referenceWidth: tween.stageWidth,
      referenceHeight: tween.stageHeight,
    };
  }
  if (!item.bitmap) return null;
  return {
    bitmap: item.bitmap,
    x: item.bitmap.x ?? 0,
    y: item.bitmap.y ?? 0,
    referenceWidth: item.bitmap.stageWidth ?? item.bitmap.width,
    referenceHeight: item.bitmap.stageHeight ?? item.bitmap.height,
  };
};
