"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { advancePlaybackAccumulator, getClampedPlaybackFrameDurationMs } from "../workspace/timelinePlayback";
import { formatExportDuration, type ExportProjectSnapshot } from "@/src/lib/export/exportPhase1";
import { renderCanonicalExportFrame, resolveProjectBackground } from "@/src/lib/export/exportRenderer";
import { formatProjectDuration } from "@/src/lib/project-library/projectLibraryModel";
import styles from "./projectPlayer.module.css";

export type CanonicalProjectPlayerHandle = {
  pause: () => void;
};

type ContentRect = { x: number; y: number; width: number; height: number };

type Props = {
  snapshot: ExportProjectSnapshot;
  mode: "export" | "viewer";
  outputWidth?: number;
  outputHeight?: number;
  contentRect?: ContentRect;
  ariaLabel?: string;
};

const playerButtonStyle = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #4b91e8",
  background: "#2867b2",
  color: "white",
  fontWeight: 750,
  cursor: "pointer",
} as const;

export const CanonicalProjectPlayer = forwardRef<CanonicalProjectPlayerHandle, Props>(function CanonicalProjectPlayer({
  snapshot,
  mode,
  outputWidth,
  outputHeight,
  contentRect,
  ariaLabel = "Selected saved animation",
}, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement[]>([]);
  const frameIndexRef = useRef(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const stage = snapshot.project.document.logicalStage;
  const canvasWidth = outputWidth ?? stage.width;
  const canvasHeight = outputHeight ?? stage.height;
  const playableFrameCount = Math.max(1, snapshot.frameCount);
  const playbackDisabled = mode === "viewer" && snapshot.frameCount <= 1;

  const stopAudio = useCallback(() => {
    for (const audio of activeAudioRef.current) {
      audio.pause();
      audio.currentTime = 0;
    }
    activeAudioRef.current = [];
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
    stopAudio();
  }, [stopAudio]);

  useImperativeHandle(forwardedRef, () => ({ pause }), [pause]);

  const playSoundsAtFrame = useCallback((index: number) => {
    for (const layer of snapshot.project.document.layers) {
      const sound = layer.cells[index]?.content?.soundAttachment;
      if (!sound?.audioDataUrl) continue;
      const audio = new Audio(sound.audioDataUrl);
      const remove = () => {
        activeAudioRef.current = activeAudioRef.current.filter(candidate => candidate !== audio);
      };
      audio.addEventListener("ended", remove, { once: true });
      audio.addEventListener("error", remove, { once: true });
      activeAudioRef.current.push(audio);
      void audio.play().catch(remove);
    }
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    void renderCanonicalExportFrame(canvas, snapshot.project, frameIndex)
      .then(() => { if (active) setRenderError(false); })
      .catch(() => { if (active) setRenderError(true); });
    return () => { active = false; };
  }, [canvasHeight, canvasWidth, frameIndex, snapshot]);

  useEffect(() => {
    if (!playing || snapshot.frameCount <= 1) return;
    let request = 0;
    let lastStepTime = 0;
    let accumulatorMs = 0;
    const frameDurationMs = getClampedPlaybackFrameDurationMs(snapshot.project.document.fps);
    playSoundsAtFrame(frameIndexRef.current);
    const tick = (timestamp: number) => {
      if (lastStepTime === 0) {
        lastStepTime = timestamp;
        request = window.requestAnimationFrame(tick);
        return;
      }
      const advanced = advancePlaybackAccumulator(accumulatorMs, timestamp - lastStepTime, frameDurationMs);
      accumulatorMs = advanced.accumulatorMs;
      lastStepTime = timestamp;
      if (advanced.steps > 0) {
        setFrameIndex(current => {
          if (mode === "viewer" && current >= snapshot.frameCount - 1) {
            setPlaying(false);
            stopAudio();
            return current;
          }
          const next = current >= snapshot.frameCount - 1 ? 0 : current + 1;
          frameIndexRef.current = next;
          playSoundsAtFrame(next);
          return next;
        });
      }
      request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(request);
  }, [mode, playSoundsAtFrame, playing, snapshot, stopAudio]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const togglePlayback = () => {
    if (playing) {
      pause();
      return;
    }
    if (playbackDisabled) return;
    if (frameIndex >= snapshot.frameCount - 1) {
      frameIndexRef.current = 0;
      setFrameIndex(0);
    } else {
      frameIndexRef.current = frameIndex;
    }
    setPlaying(true);
  };

  const currentSeconds = snapshot.frameCount === 0 ? 0 : frameIndex / snapshot.project.document.fps;
  const currentTime = formatProjectDuration(currentSeconds);
  const totalTime = formatProjectDuration(snapshot.durationSeconds);

  return (
    <div className={mode === "export" ? styles.exportPlayer : styles.viewerPlayer} data-canonical-project-player={mode}>
      <div className={mode === "export" ? styles.exportStage : styles.viewerStage}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          aria-label={ariaLabel}
          className={mode === "export" ? styles.exportCanvas : styles.viewerCanvas}
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            background: resolveProjectBackground(snapshot.project),
          }}
        />
        {contentRect ? (
          <div
            data-export-content-rect-overlay="true"
            aria-hidden="true"
            className={styles.contentRect}
            style={{
              left: `${(contentRect.x / canvasWidth) * 100}%`,
              top: `${(contentRect.y / canvasHeight) * 100}%`,
              width: `${(contentRect.width / canvasWidth) * 100}%`,
              height: `${(contentRect.height / canvasHeight) * 100}%`,
            }}
          />
        ) : null}
      </div>
      {renderError ? <div role="alert" className={styles.renderError}>This frame could not be displayed safely.</div> : null}
      <div className={styles.controls} aria-label="Animation playback controls">
        <button
          type="button"
          onClick={togglePlayback}
          disabled={playbackDisabled}
          style={{ ...playerButtonStyle, opacity: playbackDisabled ? 0.5 : 1 }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          aria-label="Animation position"
          type="range"
          min={0}
          max={Math.max(0, snapshot.frameCount - 1)}
          value={Math.min(frameIndex, Math.max(0, snapshot.frameCount - 1))}
          onChange={event => {
            const next = Number(event.target.value);
            pause();
            frameIndexRef.current = next;
            setFrameIndex(next);
          }}
          className={styles.seek}
        />
        <div
          className={styles.time}
          aria-label={`${currentSeconds.toFixed(3)} seconds of ${snapshot.durationSeconds.toFixed(3)} seconds`}
        >
          {mode === "export"
            ? `${currentSeconds.toFixed(1)}s / ${formatExportDuration(snapshot.durationSeconds)} · Frame ${frameIndex + 1}/${snapshot.frameCount}`
            : `${currentTime} / ${totalTime} · Frame ${Math.min(frameIndex + 1, playableFrameCount)}/${playableFrameCount}`}
        </div>
      </div>
    </div>
  );
});
