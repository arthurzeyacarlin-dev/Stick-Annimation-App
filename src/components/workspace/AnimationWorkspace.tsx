"use client";

import { useMemo } from "react";
import { compactRaster, compactRasterFromCrop, fullRasterInSpace, getRasterReferenceSize, motionTweenInSpace } from "@/src/lib/animation/compactRasterBitmap";
import { samePixelSpace, STAGE_PIXEL_SPACE } from "@/src/lib/animation/unifiedStageGeometry";
import { savedPictureInFrame } from "@/src/lib/animation/rasterCropV1";
import { DrawingWorkspace } from "./DrawingWorkspace";
import type { MountedWorkspace } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import type { DrawingProjectData, DrawingProjectOpenCandidate, StoredDrawingTextObject } from "@/src/lib/drawingProjectStorage";
import type { UnifiedAnimationProjectV2 } from "@/src/lib/animation/unifiedAnimationContractV2";
import type { UnifiedRasterBitmapV2 } from "@/src/lib/animation/unifiedAnimationContentV2";
import { sanitizeDrawingAiProjectMemory } from "@/src/lib/ai/drawingAiContract";
import type { UnifiedRasterPaintCoverageV1 } from "@/src/lib/animation/unifiedRasterPaintCoverageV1";

const drawingFontFamily = (value: string): StoredDrawingTextObject["fontFamily"] =>
  value === "Verdana" || value === "Georgia" || value === "Times New Roman" || value === "Courier New" ? value : "Arial";

const hydrateDrawingCompatibility = (project: UnifiedAnimationProjectV2, source: DrawingProjectData) => {
  const drawingData: DrawingProjectData = {
    ...source,
    layers: source.layers.map(layer => ({
      ...layer,
      timelineFrames: layer.timelineFrames.map(frame => ({
        ...frame,
        bitmap: null,
        tweenEndBitmap: null,
        motionTween: frame.motionTween ? { ...frame.motionTween, spriteBitmap: null } : null,
        soundAttachment: frame.soundAttachment ? { ...frame.soundAttachment, audioDataUrl: null } : null,
        textObjects: structuredClone(frame.textObjects ?? []),
      })),
    })),
  };
  const placeBitmap = (bitmap: UnifiedRasterBitmapV2 | null | undefined): ({ width: number; height: number; data: Uint8ClampedArray; paintCoverage?: UnifiedRasterPaintCoverageV1 }) | null => {
    if (!bitmap) return null;
    const width = bitmap.stageWidth ?? bitmap.width;
    const height = bitmap.stageHeight ?? bitmap.height;
    if ((bitmap.x ?? 0) === 0 && (bitmap.y ?? 0) === 0 && bitmap.width === width && bitmap.height === height) {
      return { width, height, data: bitmap.data, ...(bitmap.paintCoverage ? { paintCoverage: bitmap.paintCoverage } : {}) };
    }
    const data = new Uint8ClampedArray(width * height * 4);
    const x = bitmap.x ?? 0;
    const y = bitmap.y ?? 0;
    for (let row = 0; row < bitmap.height; row += 1) {
      const sourceOffset = row * bitmap.width * 4;
      const targetOffset = ((y + row) * width + x) * 4;
      data.set(bitmap.data.subarray(sourceOffset, sourceOffset + bitmap.width * 4), targetOffset);
    }
    return { width, height, data, ...(bitmap.paintCoverage ? { paintCoverage: bitmap.paintCoverage } : {}) };
  };
  // SPEC-0017 compact frames: a plain drawing comes back as a small centered picture that remembers
  // its full size, instead of a full-size picture that is mostly empty. Tween pictures stay full size.
  const placeCompactBitmap = (bitmap: UnifiedRasterBitmapV2 | null | undefined) => {
    if (!bitmap) return null;
    const reference = { width: bitmap.stageWidth ?? bitmap.width, height: bitmap.stageHeight ?? bitmap.height };
    const placed = compactRasterFromCrop({ width: bitmap.width, height: bitmap.height, data: bitmap.data, x: bitmap.x ?? 0, y: bitmap.y ?? 0, reference, paintCoverage: bitmap.paintCoverage ?? null });
    // (Nov 23, one pixel space) A compact picture remembers the pixel space it was saved in, and is shown and edited at
    // its own stage size from there (compactRasterBitmap.ts). The rare picture that fills its whole old space cannot
    // remember it, so it is drawn in the stage pixel space right here.
    if (getRasterReferenceSize(placed) || samePixelSpace(placed, STAGE_PIXEL_SPACE)) return placed;
    const full = fullRasterInSpace(placed, STAGE_PIXEL_SPACE);
    return compactRaster(new ImageData(new Uint8ClampedArray(full.data), full.width, full.height));
  };
  // A motion tween's pictures stay full size (as before); saved on an older screen, they are drawn in the stage pixel
  // space once, here, so a tween is always measured in one space.
  const placeTweenBitmap = (bitmap: UnifiedRasterBitmapV2 | null | undefined) => {
    const placed = placeBitmap(bitmap);
    if (!placed || !bitmap || bitmap.stageWidth === undefined || bitmap.stageHeight === undefined) return placed;
    const full = fullRasterInSpace({ width: placed.width, height: placed.height, data: placed.data }, STAGE_PIXEL_SPACE);
    return full === placed || (full.width === placed.width && full.height === placed.height && full.data === placed.data) ? placed : { width: full.width, height: full.height, data: full.data };
  };
  drawingData.layers.forEach((layer, layerIndex) => {
    const unifiedLayer = project.document.layers[layerIndex];
    layer.timelineFrames.forEach((frame, frameIndex) => {
      const raster = unifiedLayer?.cells[frameIndex]?.content?.items.find(item => item.kind === "drawing-raster/v1");
      if (raster?.kind === "drawing-raster/v1") {
        if (raster.motionTween || raster.tweenEndBitmap) frame.bitmap = placeTweenBitmap(raster.bitmap);
        else {
          const placed = placeCompactBitmap(raster.bitmap);
          frame.bitmap = placed;
          // (Nov 14) ONE copy of the pictures while a project opens: now that this frame picture exists, the opened
          // saved picture is let go (it becomes the same box read from the frame picture, rasterCropV1.ts).
          if (placed && raster.bitmap) raster.bitmap = savedPictureInFrame(raster.bitmap, placed) ?? raster.bitmap;
        }
        frame.tweenEndBitmap = placeTweenBitmap(raster.tweenEndBitmap);
        frame.motionTween = raster.motionTween ? motionTweenInSpace({
          mode: raster.motionTween.mode,
          stageWidth: raster.motionTween.stageWidth,
          stageHeight: raster.motionTween.stageHeight,
          spriteBitmap: placeBitmap(raster.motionTween.spriteBitmap),
          startOrigin: structuredClone(raster.motionTween.startOrigin),
          endOrigin: structuredClone(raster.motionTween.endOrigin),
        }, STAGE_PIXEL_SPACE) : null;
      }
      if (unifiedLayer?.cells[frameIndex]?.content) frame.soundAttachment = structuredClone(unifiedLayer.cells[frameIndex].content!.soundAttachment);
    });
  });
  return drawingData;
};

const createDrawingCompatibilityProjection = (project: UnifiedAnimationProjectV2): DrawingProjectData => {
  let nextFrameId = 1;
  const stateIds = new Map<string, number>();
  for (const layer of project.document.layers) {
    for (const cell of layer.cells) {
      if (cell.content) stateIds.set(cell.cellId, nextFrameId);
      nextFrameId += 1;
    }
  }
  nextFrameId = 1;
  const layers = project.document.layers.map(layer => ({
    id: layer.layerId,
    name: layer.name,
    orderIndex: layer.orderIndex,
    timelineFrames: layer.cells.map(cell => {
      const id = nextFrameId++;
      const content = cell.content;
      const raster = content?.items.find(item => item.kind === "drawing-raster/v1");
      return {
        id,
        kind: cell.cellType === "tween" ? "tween" as const : cell.cellType === "keyframe" || cell.cellType === "blank-keyframe" ? "keyframe" as const : "frame" as const,
        cellType: cell.cellType,
        stateId: cell.ownerCellId ? stateIds.get(cell.ownerCellId) ?? id : id,
        isBlank: cell.cellType === "blank-keyframe",
        hasTweenEndpoint: Boolean(raster?.kind === "drawing-raster/v1" && raster.tweenEndBitmap && raster.motionTween),
        bitmap: null,
        previewUrl: null,
        tweenEndBitmap: null,
        tweenEndPreviewUrl: null,
        motionTween: null,
        soundAttachment: content?.soundAttachment ? structuredClone(content.soundAttachment) : null,
        textObjects: (content?.items.filter(item => item.kind === "drawing-text/v1") ?? []).map(item => {
          if (item.kind !== "drawing-text/v1") throw new Error("invalid_record");
          return {
            id: item.itemId,
            text: item.text,
            x: item.x,
            y: item.y,
            width: item.width,
            flipX: item.flipX,
            flipY: item.flipY,
            rotation: item.rotation,
            fontFamily: drawingFontFamily(item.fontFamily),
            fontSize: item.fontSize,
            color: item.color,
            bold: item.bold,
            italic: item.italic,
          };
        }),
      };
    }),
  }));
  return {
    version: 1,
    activeTool: project.document.toolState.drawingTool as DrawingProjectData["activeTool"],
    brushSize: 4,
    eraserSize: 12,
    fillColor: "#000000",
    timelineFps: project.document.fps,
    shapeType: "Square",
    activeLayerId: project.document.reopenState.activeLayerId,
    currentFrameIndex: project.document.reopenState.currentFrameIndex,
    selectedTimelineIndex: project.document.reopenState.currentFrameIndex,
    isOnionEnabled: project.document.reopenState.onionEnabled,
    layers,
    nextTimelineFrameId: nextFrameId,
    nextLayerNumber: layers.length + 1,
  };
};

const hydrateUnifiedItemCompatibility = (project: UnifiedAnimationProjectV2, drawingData: DrawingProjectData) => {
  const symbolInstancesByCell: NonNullable<UnifiedAnimationProjectV2["compatibility"]>["symbolInstancesByCell"] = structuredClone(project.compatibility?.symbolInstancesByCell ?? {});
  drawingData.layers.forEach((layer, layerIndex) => {
    const unifiedLayer = project.document.layers[layerIndex];
    layer.timelineFrames.forEach((frame, frameIndex) => {
      const items = unifiedLayer?.cells[frameIndex]?.content?.items ?? [];
      const instances = items.filter(item => item.kind === "symbol-instance/v1");
      if (instances.length === 0) return;
      // (Nov 23, one pixel space) A Library symbol sitting on a drawing was lined up with that drawing on the page of
      // the screen it was saved on. It now remembers that drawing canvas (as AI-placed symbols always did), so it keeps
      // its size and place next to the drawing on every screen, and when the drawing is edited. Export reads the same
      // canvas from the drawing today, so the exported picture does not change.
      const raster = items.find(item => item.kind === "drawing-raster/v1");
      const saved = raster?.kind === "drawing-raster/v1" ? raster.bitmap : null;
      const canvas = saved && saved.stageWidth !== undefined && saved.stageHeight !== undefined ? { width: saved.stageWidth, height: saved.stageHeight } : null;
      symbolInstancesByCell[`${layer.id}:${frame.stateId}`] = structuredClone(instances).map(instance =>
        instance.kind === "symbol-instance/v1" && !instance.drawingCanvas && canvas && !samePixelSpace(canvas, STAGE_PIXEL_SPACE) ? { ...instance, drawingCanvas: canvas } : instance);
    });
  });
  return { stickByCell: {}, symbolInstancesByCell };
};

// The editor's frame pictures for an opened project. Built ONCE for a project (the page asks twice while it draws, and a
// long animation built twice does not fit in memory), and built before the editor is shown when the project is opened
// from Home or the project list (ExistingHome.openProject), so an animation too big for this computer's memory ends
// as a plain "couldn't be opened" message there instead of breaking the page.
type AnimationWorkspaceEditor = { initialProject: DrawingProjectOpenCandidate; hydratedUnifiedProject: UnifiedAnimationProjectV2 };
const builtEditors = new WeakMap<UnifiedAnimationProjectV2, AnimationWorkspaceEditor>();
export const prepareAnimationWorkspaceEditor = (project: UnifiedAnimationProjectV2): AnimationWorkspaceEditor => {
  const built = builtEditors.get(project);
  if (built) return built;
  const compatibilityDrawingData = project.compatibility?.drawingData as DrawingProjectData | undefined;
  const compatibilitySource = compatibilityDrawingData ?? createDrawingCompatibilityProjection(project);
  const drawingData = hydrateDrawingCompatibility(project, compatibilitySource);
  const itemCompatibility = hydrateUnifiedItemCompatibility(project, drawingData);
  const initialProject: DrawingProjectOpenCandidate = {
    kind: project.provenance?.kind === "legacy-adoption" && project.provenance.adoptedAt === null ? "legacy" : "v2",
    project: { id: project.projectId, name: project.title, data: drawingData, previewDataUrl: null, aiMemory: sanitizeDrawingAiProjectMemory(project.auxiliary?.drawingAiMemory) ?? null, created_at: project.createdAt, updated_at: project.updatedAt },
    head: null, record: null, legacyRecordDigest: null,
  };
  const editor = { initialProject, hydratedUnifiedProject: { ...project, compatibility: { ...project.compatibility, drawingData: compatibilitySource, ...itemCompatibility } } };
  builtEditors.set(project, editor);
  return editor;
};

export function AnimationWorkspace({ root, onExport, onExit }: { root: MountedWorkspace; onExport?: (savedProjectId: string | null) => void; onExit?: () => void }) {
  const editor = root.candidate.editor;
  const { initialProject, hydratedUnifiedProject } = useMemo(() => prepareAnimationWorkspaceEditor(editor.project), [editor.project]);
  return <DrawingWorkspace initialProject={initialProject} initialTitle={editor.project.title} unifiedProject={hydratedUnifiedProject} recoveryClaim={root.candidate.recoveryClaim} onExport={onExport} onExit={onExit} />;
}
