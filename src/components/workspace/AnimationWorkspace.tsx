"use client";

import { DrawingWorkspace } from "./DrawingWorkspace";
import { StickFigureWorkspace } from "./stickfigure/StickFigureWorkspace";
import type { MountedWorkspace } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import styles from "./AnimationWorkspace.module.css";

export function AnimationWorkspace({ root }: { root: MountedWorkspace }) {
  const editor = root.candidate.editor;
  return (
    <section className={styles.workspace} aria-label="Animation workspace">
      <div className={styles.editor} data-editor-kind={editor.kind} key={root.generation}>
        {editor.kind === "drawing" ? (
          <DrawingWorkspace
            initialProject={editor.project}
            initialTitle={root.candidate.title}
            deferInitialMemorySync
          />
        ) : (
          <StickFigureWorkspace initialProject={editor.project} onOpenStickFigureCreator={() => {}} />
        )}
      </div>
    </section>
  );
}
