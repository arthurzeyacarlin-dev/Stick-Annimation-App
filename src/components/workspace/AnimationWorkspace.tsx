"use client";

import { DrawingWorkspace } from "./DrawingWorkspace";
import { StickFigureWorkspace } from "./stickfigure/StickFigureWorkspace";
import { UnifiedAnimationStage } from "./UnifiedAnimationStage";
import type { UnifiedAnimationDocumentV1 } from "@/src/lib/animation/unifiedAnimationContract";
import type { StickFigureFrameContent } from "./stickfigure/types";
import type { MountedWorkspace } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import styles from "./AnimationWorkspace.module.css";

export function AnimationWorkspace({ root }: { root: MountedWorkspace }) {
  const editor = root.candidate.editor;
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
