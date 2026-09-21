"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectLibrarySnapshot } from "@/src/lib/project-library/projectLibraryModel";
import { renderCanonicalExportFrame } from "@/src/lib/export/exportRenderer";
import styles from "./projectLibrary.module.css";

type Props = { project: ProjectLibrarySnapshot };

const posterCanvasSize = (stageWidth: number, stageHeight: number) => {
  const scale = Math.min(480 / Math.max(1, stageWidth), 270 / Math.max(1, stageHeight), 1);
  return {
    width: Math.max(1, Math.round(stageWidth * scale)),
    height: Math.max(1, Math.round(stageHeight * scale)),
  };
};

export function ProjectPoster({ project }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const stage = project.snapshot.project.document.logicalStage;
  const dimensions = posterCanvasSize(stage.width, stage.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    void renderCanonicalExportFrame(canvas, project.snapshot.project, project.posterFrameIndex)
      .then(() => {
        if (!active) return;
        try {
          setImageUrl(canvas.toDataURL("image/png"));
        } catch {
          setFailed(true);
        }
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [project]);

  if (failed) return <div className={styles.posterStatus}>Poster unavailable</div>;
  if (imageUrl) {
    return (
      // The alt text is intentionally factual and does not infer image semantics.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={`Canonical saved poster for ${project.snapshot.project.title}, frame ${project.posterFrameIndex + 1}`}
        className={styles.posterImage}
      />
    );
  }
  return (
    <>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className={styles.posterCanvas}
        aria-label={`Preparing canonical saved poster for ${project.snapshot.project.title}`}
      />
      <div className={styles.posterStatus}>Preparing exact poster…</div>
    </>
  );
}
