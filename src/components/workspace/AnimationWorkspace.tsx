"use client";

import { useMemo } from "react";
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
  drawingData.layers.forEach((layer, layerIndex) => {
    const unifiedLayer = project.document.layers[layerIndex];
    layer.timelineFrames.forEach((frame, frameIndex) => {
      const raster = unifiedLayer?.cells[frameIndex]?.content?.items.find(item => item.kind === "drawing-raster/v1");
      if (raster?.kind === "drawing-raster/v1") {
        frame.bitmap = placeBitmap(raster.bitmap);
        frame.tweenEndBitmap = placeBitmap(raster.tweenEndBitmap);
        frame.motionTween = raster.motionTween ? {
          mode: raster.motionTween.mode,
          stageWidth: raster.motionTween.stageWidth,
          stageHeight: raster.motionTween.stageHeight,
          spriteBitmap: placeBitmap(raster.motionTween.spriteBitmap),
          startOrigin: structuredClone(raster.motionTween.startOrigin),
          endOrigin: structuredClone(raster.motionTween.endOrigin),
        } : null;
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
      if (instances.length > 0) symbolInstancesByCell[`${layer.id}:${frame.stateId}`] = structuredClone(instances);
    });
  });
  return { stickByCell: {}, symbolInstancesByCell };
};

export function AnimationWorkspace({ root, onExport, onExit }: { root: MountedWorkspace; onExport?: () => void; onExit?: () => void }) {
  const editor = root.candidate.editor;
  const { initialProject, hydratedUnifiedProject } = useMemo(() => {
    const compatibilityDrawingData = editor.project.compatibility?.drawingData as DrawingProjectData | undefined;
    const compatibilitySource = compatibilityDrawingData ?? createDrawingCompatibilityProjection(editor.project);
    const drawingData = hydrateDrawingCompatibility(editor.project, compatibilitySource);
    const itemCompatibility = hydrateUnifiedItemCompatibility(editor.project, drawingData);
    const nextInitialProject: DrawingProjectOpenCandidate = {
      kind: editor.project.provenance?.kind === "legacy-adoption" && editor.project.provenance.adoptedAt === null ? "legacy" : "v2",
      project: { id: editor.project.projectId, name: editor.project.title, data: drawingData, previewDataUrl: null, aiMemory: sanitizeDrawingAiProjectMemory(editor.project.auxiliary?.drawingAiMemory) ?? null, created_at: editor.project.createdAt, updated_at: editor.project.updatedAt },
      head: null, record: null, legacyRecordDigest: null,
    };
    return {
      initialProject: nextInitialProject,
      hydratedUnifiedProject: {
        ...editor.project,
        compatibility: {
          ...editor.project.compatibility,
          drawingData: compatibilitySource,
          ...itemCompatibility,
        },
      },
    };
  }, [editor.project]);
  return <DrawingWorkspace initialProject={initialProject} initialTitle={editor.project.title} unifiedProject={hydratedUnifiedProject} recoveryClaim={root.candidate.recoveryClaim} onExport={onExport} onExit={onExit} />;
}
