"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ProjectLibrarySnapshot } from "@/src/lib/project-library/projectLibraryModel";
import { formatProjectDuration } from "@/src/lib/project-library/projectLibraryModel";
import { CanonicalProjectPlayer, type CanonicalProjectPlayerHandle } from "./CanonicalProjectPlayer";
import styles from "./projectPlayer.module.css";

type Props = {
  project: ProjectLibrarySnapshot;
  onClose: () => void;
};

export function ProjectMovieViewer({ project, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleContextRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const playerRef = useRef<CanonicalProjectPlayerHandle | null>(null);
  const snapshot = project.snapshot;
  const stage = snapshot.project.document.logicalStage;

  const requestClose = useCallback(async () => {
    playerRef.current?.pause();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const library = document.querySelector<HTMLElement>('[data-project-library="my-projects"]');
    const previousAriaHidden = library?.getAttribute("aria-hidden") ?? null;
    const previousInert = library?.inert ?? false;
    if (library) {
      library.inert = true;
      library.setAttribute("aria-hidden", "true");
    }
    titleContextRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        void requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? []).filter(element => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (library) {
        library.inert = previousInert;
        if (previousAriaHidden === null) library.removeAttribute("aria-hidden");
        else library.setAttribute("aria-hidden", previousAriaHidden);
      }
    };
  }, [requestClose]);

  return (
    <div
      className={styles.viewerBackdrop}
      data-project-movie-viewer-backdrop="true"
      onClick={event => {
        if (event.target === event.currentTarget) void requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-movie-viewer-title"
        aria-describedby="project-movie-viewer-description"
        className={styles.viewerDialog}
        data-project-movie-viewer="true"
      >
        <div className={styles.viewerHeader}>
          <div ref={titleContextRef} tabIndex={0} className={styles.viewerHeadingGroup}>
            <div className={styles.viewerEyebrow}>Playback only</div>
            <h2 id="project-movie-viewer-title" className={styles.viewerTitle}>{snapshot.project.title}</h2>
            <p id="project-movie-viewer-description" className={styles.viewerDescription}>
              Saved animation · {stage.width}×{stage.height} · {snapshot.project.document.fps} FPS · {formatProjectDuration(snapshot.durationSeconds)}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={() => void requestClose()} className={styles.viewerClose}>Close</button>
        </div>
        <CanonicalProjectPlayer
          ref={playerRef}
          snapshot={snapshot}
          mode="viewer"
          ariaLabel={`${snapshot.project.title} saved animation`}
        />
      </div>
    </div>
  );
}
