"use client";

import { DrawingWorkspace } from "./DrawingWorkspace";
import { StickFigureWorkspace } from "./stickfigure/StickFigureWorkspace";
import { UnifiedAnimationStage } from "./UnifiedAnimationStage";
import type { UnifiedAnimationDocumentV1 } from "@/src/lib/animation/unifiedAnimationContract";
import type { StickFigureFrameContent } from "./stickfigure/types";
import type { MountedWorkspace } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import styles from "./AnimationWorkspace.module.css";
import type { DrawingProjectData, DrawingProjectOpenCandidate } from "@/src/lib/drawingProjectStorage";
import type { UnifiedAnimationProjectV2 } from "@/src/lib/animation/unifiedAnimationContractV2";

const hydrateDrawingCompatibility = (project: UnifiedAnimationProjectV2, source: DrawingProjectData) => {
  const drawingData = structuredClone(source);
  drawingData.layers.forEach((layer, layerIndex) => {
    const unifiedLayer = project.document.layers[layerIndex];
    layer.timelineFrames.forEach((frame, frameIndex) => {
      const raster = unifiedLayer?.cells[frameIndex]?.content?.items.find(item => item.kind === "drawing-raster/v1");
      if (raster?.kind === "drawing-raster/v1" && raster.bitmap) {
        const width = raster.bitmap.stageWidth ?? raster.bitmap.width;
        const height = raster.bitmap.stageHeight ?? raster.bitmap.height;
        const data = new Uint8ClampedArray(width * height * 4);
        const x = raster.bitmap.x ?? 0;
        const y = raster.bitmap.y ?? 0;
        for (let row = 0; row < raster.bitmap.height; row += 1) {
          const sourceOffset = row * raster.bitmap.width * 4;
          const targetOffset = ((y + row) * width + x) * 4;
          data.set(raster.bitmap.data.subarray(sourceOffset, sourceOffset + raster.bitmap.width * 4), targetOffset);
        }
        frame.bitmap = {
          width,
          height,
          data,
        };
      }
    });
  });
  return drawingData;
};

export function AnimationWorkspace({ root }: { root: MountedWorkspace }) {
  const editor = root.candidate.editor;
  if (editor.kind === "unified") {
    const compatibilityDrawingData = editor.project.compatibility?.drawingData as DrawingProjectData | undefined;
    const drawingData = compatibilityDrawingData
      ? hydrateDrawingCompatibility(editor.project, compatibilityDrawingData)
      : undefined;
    const initialProject: DrawingProjectOpenCandidate | null = drawingData ? {
      kind: "v2",
      project: { id: editor.project.projectId, name: editor.project.title, data: structuredClone(drawingData), previewDataUrl: null, created_at: editor.project.createdAt, updated_at: editor.project.updatedAt },
      head: null, record: null, legacyRecordDigest: null,
    } : null;
    return <DrawingWorkspace initialProject={initialProject} initialTitle={editor.project.title} deferInitialMemorySync unifiedProject={editor.project} />;
  }
  const document = root.candidate.document;
  const mixed = document.layers.some(layer => layer.contentKind === "drawing/v1") && document.layers.some(layer => layer.contentKind === "stick-rig/v1");
  // A read snapshot at the render seam. Existing Stick gestures still publish
  // through their compatibility owner; this moves no tool/history/save authority.
  const renderStage = mixed && root.candidate.migration ? (index: number, sourceLayerId: string, content: StickFigureFrameContent) => {
    const snapshot: UnifiedAnimationDocumentV1 = { ...document, layers: document.layers.map(layer => {
      if (layer.contentKind !== "stick-rig/v1" || layer.sourceLayerId !== sourceLayerId) return layer;
      const ownerId = layer.cells[index]?.ownerCellId;
      return { ...layer, cells: layer.cells.map(cell => cell.cellId === ownerId ? { ...cell, payload: content } : cell) };
    }) };
    return <UnifiedAnimationStage document={snapshot} index={index} assets={root.candidate.migration!.project.assets} resolvedAssets={root.candidate.migration!.resolvedAssets} />;
  } : undefined;
  return (
    <section className={`${styles.workspace} ${mixed ? styles.mixed : ""}`} aria-label="Animation workspace">
      <div className={styles.editor} data-editor-kind={editor.kind} key={root.generation}>
        {editor.kind === "drawing" ? (
          <DrawingWorkspace
            initialProject={editor.project}
            initialTitle={root.candidate.title}
            deferInitialMemorySync
          />
        ) : (
          <StickFigureWorkspace initialProject={editor.project} onOpenStickFigureCreator={() => {}} renderStage={renderStage} />
        )}
      </div>
    </section>
  );
}
