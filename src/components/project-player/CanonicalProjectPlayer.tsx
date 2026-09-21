"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { formatExportDuration, type ExportProjectSnapshot } from "@/src/lib/export/exportPhase1";
import { renderCanonicalExportFrame, resolveProjectBackground } from "@/src/lib/export/exportRenderer";
import { formatProjectDuration } from "@/src/lib/project-library/projectLibraryModel";
import { ProjectPlayerAudioController } from "@/src/lib/project-player/projectPlayerAudio";
import {
  clampProjectPlayerTime,
  projectPlayerFrameAtTime,
  sampleProjectPlayerClock,
  type ProjectPlayerClockAnchor,
} from "@/src/lib/project-player/projectPlayerClock";
import {
  resolveProjectPlayerCanvasGeometry,
  type ProjectPlayerCanvasGeometry,
} from "@/src/lib/project-player/projectPlayerGeometry";
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

type AudioUiState =
  | { status: "silent" | "preparing" | "ready" }
  | { status: "blocked"; message: string }
  | { status: "unavailable"; message: string };

const playerButtonStyle = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #4b91e8",
  background: "#2867b2",
  color: "white",
  fontWeight: 750,
  cursor: "pointer",
} as const;

const performanceSeconds = () => performance.now() / 1000;

export const CanonicalProjectPlayer = forwardRef<CanonicalProjectPlayerHandle, Props>(function CanonicalProjectPlayer({
  snapshot,
  mode,
  outputWidth,
  outputHeight,
  contentRect,
  ariaLabel = "Selected saved animation",
}, forwardedRef) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoSurfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ProjectPlayerAudioController | null>(null);
  const anchorRef = useRef<ProjectPlayerClockAnchor | null>(null);
  const mediaTimeRef = useRef(0);
  const playingRef = useRef(false);
  const operationRef = useRef(0);
  const controlsTimerRef = useRef<number | null>(null);
  const controlsFocusedRef = useRef(false);
  const seekingRef = useRef(false);
  const resumeAfterSeekRef = useRef(false);
  const [mediaTimeSeconds, setMediaTimeSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [renderedFrame, setRenderedFrame] = useState(0);
  const [audioUi, setAudioUi] = useState<AudioUiState>({ status: "silent" });
  const [announcement, setAnnouncement] = useState("Paused");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const [canvasGeometry, setCanvasGeometry] = useState<ProjectPlayerCanvasGeometry | null>(null);
  const stage = snapshot.project.document.logicalStage;
  const fps = Math.max(1, snapshot.project.document.fps);
  const durationSeconds = Math.max(0, snapshot.durationSeconds);
  const playableFrameCount = Math.max(1, snapshot.frameCount);
  const playbackDisabled = snapshot.frameCount <= 1 || durationSeconds <= 0;
  const displayFrame = projectPlayerFrameAtTime(mediaTimeSeconds, fps, snapshot.frameCount);
  const canvasWidth = mode === "export"
    ? outputWidth ?? stage.width
    : canvasGeometry?.backingWidth ?? stage.width;
  const canvasHeight = mode === "export"
    ? outputHeight ?? stage.height
    : canvasGeometry?.backingHeight ?? stage.height;
  const warningVisible = audioUi.status === "blocked" || audioUi.status === "unavailable" || fullscreenError;

  const publishMediaTime = useCallback((value: number) => {
    const next = clampProjectPlayerTime(value, durationSeconds);
    mediaTimeRef.current = next;
    setMediaTimeSeconds(next);
    return next;
  }, [durationSeconds]);

  const publishPlaying = useCallback((value: boolean) => {
    playingRef.current = value;
    setPlaying(value);
  }, []);

  const sampleCurrentTime = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return mediaTimeRef.current;
    const monotonicTimeSeconds = anchor.source === "audio"
      ? audioRef.current?.clockSeconds ?? anchor.monotonicTimeSeconds
      : performanceSeconds();
    return sampleProjectPlayerClock(anchor, monotonicTimeSeconds, durationSeconds);
  }, [durationSeconds]);

  const stopAtCurrentTime = useCallback((announce = true) => {
    operationRef.current += 1;
    const next = playingRef.current ? sampleCurrentTime() : mediaTimeRef.current;
    audioRef.current?.stop();
    anchorRef.current = null;
    publishPlaying(false);
    publishMediaTime(next);
    if (announce) setAnnouncement(next >= durationSeconds && durationSeconds > 0 ? "Playback complete" : "Paused");
    return next;
  }, [durationSeconds, publishMediaTime, publishPlaying, sampleCurrentTime]);

  const startPlayback = useCallback(async (requestedTime?: number) => {
    if (playbackDisabled) return false;
    const current = requestedTime ?? mediaTimeRef.current;
    const startTime = current >= durationSeconds ? 0 : clampProjectPlayerTime(current, durationSeconds);
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    audioRef.current?.stop();
    anchorRef.current = null;
    publishPlaying(false);
    publishMediaTime(startTime);

    let source: ProjectPlayerClockAnchor["source"] = "performance";
    let monotonicTimeSeconds = performanceSeconds();
    const audio = audioRef.current;
    if (audio?.hasAuthoredAudio) {
      const result = await audio.start(startTime, durationSeconds);
      if (operationRef.current !== operation) return false;
      if (result.status === "blocked") {
        setAudioUi({ status: "blocked", message: "Click Play to enable audio" });
        setAnnouncement("Click Play to enable audio");
        setControlsVisible(true);
        return false;
      }
      if (result.status === "unavailable") {
        setAudioUi({ status: "unavailable", message: result.detail });
        setAnnouncement("Audio unavailable. Visual playback is available.");
      } else if (result.status === "scheduled") {
        setAudioUi({ status: "ready" });
        source = "audio";
        monotonicTimeSeconds = result.clockSeconds;
      }
    }
    if (operationRef.current !== operation) return false;
    anchorRef.current = { mediaTimeSeconds: startTime, monotonicTimeSeconds, source };
    publishPlaying(true);
    setAnnouncement("Playing");
    return true;
  }, [durationSeconds, playbackDisabled, publishMediaTime, publishPlaying]);

  const pause = useCallback(() => {
    stopAtCurrentTime(true);
  }, [stopAtCurrentTime]);

  useImperativeHandle(forwardedRef, () => ({ pause }), [pause]);

  const seekTo = useCallback((value: number, resume: boolean) => {
    operationRef.current += 1;
    audioRef.current?.stop();
    anchorRef.current = null;
    publishPlaying(false);
    const next = publishMediaTime(value);
    setAnnouncement(`Position ${formatProjectDuration(next)} of ${formatProjectDuration(durationSeconds)}`);
    if (resume && next < durationSeconds) void startPlayback(next);
  }, [durationSeconds, publishMediaTime, publishPlaying, startPlayback]);

  const togglePlayback = useCallback(() => {
    if (playingRef.current) pause();
    else void startPlayback();
  }, [pause, startPlayback]);

  const showControls = useCallback(() => {
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;
    setControlsVisible(true);
    if (!playingRef.current || controlsFocusedRef.current || seekingRef.current || warningVisible) return;
    controlsTimerRef.current = window.setTimeout(() => {
      controlsTimerRef.current = null;
      if (playingRef.current && !controlsFocusedRef.current && !seekingRef.current) setControlsVisible(false);
    }, 2_500);
  }, [warningVisible]);

  const requestFullscreenToggle = useCallback(async () => {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (stageRef.current?.requestFullscreen) {
        await stageRef.current.requestFullscreen();
      } else {
        throw new Error("fullscreen_unavailable");
      }
    } catch {
      setFullscreenError(true);
      setAnnouncement("Fullscreen unavailable");
      setControlsVisible(true);
    }
  }, []);

  useEffect(() => {
    const controller = new ProjectPlayerAudioController(snapshot.project);
    audioRef.current = controller;
    setAudioUi(controller.hasAuthoredAudio ? { status: "preparing" } : { status: "silent" });
    void controller.prepare().then(result => {
      if (audioRef.current !== controller) return;
      if (result.status === "ready") setAudioUi({ status: "ready" });
      else if (result.status === "unavailable") {
        setAudioUi({ status: "unavailable", message: result.detail });
        setAnnouncement("Audio unavailable. Visual playback is available.");
      } else setAudioUi({ status: "silent" });
    });
    return () => {
      operationRef.current += 1;
      if (audioRef.current === controller) audioRef.current = null;
      void controller.close();
    };
  }, [snapshot.project]);

  useLayoutEffect(() => {
    if (mode !== "viewer") return;
    const surface = videoSurfaceRef.current;
    if (!surface) return;
    const measure = () => {
      const rect = surface.getBoundingClientRect();
      setCanvasGeometry(resolveProjectPlayerCanvasGeometry(
        rect.width,
        rect.height,
        stage.width,
        stage.height,
        window.devicePixelRatio,
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [mode, stage.height, stage.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    const nextFrame = document.createElement("canvas");
    nextFrame.width = canvasWidth;
    nextFrame.height = canvasHeight;
    void renderCanonicalExportFrame(nextFrame, snapshot.project, displayFrame)
      .then(() => {
        if (!active) return;
        const target = canvasRef.current;
        const context = target?.getContext("2d");
        if (!target || !context || target.width !== nextFrame.width || target.height !== nextFrame.height) return;
        context.clearRect(0, 0, target.width, target.height);
        context.drawImage(nextFrame, 0, 0);
        setRenderedFrame(displayFrame);
        setRenderError(false);
      })
      .catch(() => { if (active) setRenderError(true); });
    return () => { active = false; };
  }, [canvasHeight, canvasWidth, displayFrame, snapshot.project]);

  useEffect(() => {
    if (!playing) return;
    let request = 0;
    const tick = () => {
      const next = sampleCurrentTime();
      publishMediaTime(next);
      if (next >= durationSeconds) {
        audioRef.current?.stop();
        anchorRef.current = null;
        publishPlaying(false);
        if (mode === "export") {
          publishMediaTime(0);
          void startPlayback(0);
        } else {
          setAnnouncement("Playback complete");
          setControlsVisible(true);
        }
        return;
      }
      request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(request);
  }, [durationSeconds, mode, playing, publishMediaTime, publishPlaying, sampleCurrentTime, startPlayback]);

  useEffect(() => {
    if (!playing) {
      if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
      setControlsVisible(true);
      return;
    }
    showControls();
  }, [playing, showControls]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && playingRef.current) publishMediaTime(sampleCurrentTime());
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [publishMediaTime, sampleCurrentTime]);

  useEffect(() => {
    if (mode !== "viewer") return;
    const handleFullscreen = () => {
      const actualFullscreen = document.fullscreenElement === stageRef.current;
      setFullscreen(actualFullscreen);
      setFullscreenError(false);
      setAnnouncement(actualFullscreen ? "Fullscreen" : "Exited fullscreen");
      setControlsVisible(true);
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, [mode]);

  useEffect(() => {
    if (mode !== "viewer") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = rootRef.current?.closest<HTMLElement>('[data-project-movie-viewer="true"]');
      if (!dialog || !dialog.contains(document.activeElement)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button") || target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space" || key === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        const delta = event.shiftKey ? 1 / fps : 5;
        seekTo(mediaTimeRef.current + (key === "arrowleft" ? -delta : delta), playingRef.current);
      } else if (key === "home" || key === "end") {
        event.preventDefault();
        seekTo(key === "home" ? 0 : durationSeconds, false);
      } else if (key === "f") {
        event.preventDefault();
        void requestFullscreenToggle();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [durationSeconds, fps, mode, requestFullscreenToggle, seekTo, togglePlayback]);

  useEffect(() => () => {
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
  }, []);

  const currentTime = formatProjectDuration(mediaTimeSeconds);
  const totalTime = formatProjectDuration(durationSeconds);
  const visibleFrameNumber = Math.min(displayFrame + 1, playableFrameCount);
  const playbackComplete = durationSeconds > 0 && mediaTimeSeconds >= durationSeconds;
  const playbackLabel = playing ? "Pause" : playbackComplete ? "Replay" : "Play";
  const audioWarning = audioUi.status === "blocked" || audioUi.status === "unavailable" ? audioUi.message : null;
  const beginSeek = () => {
    if (seekingRef.current) return;
    seekingRef.current = true;
    resumeAfterSeekRef.current = playingRef.current;
    stopAtCurrentTime(false);
    setControlsVisible(true);
  };
  const finishSeek = () => {
    if (!seekingRef.current) return;
    seekingRef.current = false;
    const resume = resumeAfterSeekRef.current;
    resumeAfterSeekRef.current = false;
    if (resume && mediaTimeRef.current < durationSeconds) void startPlayback(mediaTimeRef.current);
    else setAnnouncement(`Position ${formatProjectDuration(mediaTimeRef.current)} of ${totalTime}`);
  };

  const canvas = (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      aria-label={ariaLabel}
      data-project-player-rendered-frame={renderedFrame}
      className={mode === "export" ? styles.exportCanvas : styles.viewerCanvas}
      style={mode === "export" ? {
        aspectRatio: `${canvasWidth} / ${canvasHeight}`,
        background: resolveProjectBackground(snapshot.project),
      } : {
        width: canvasGeometry ? `${canvasGeometry.cssWidth}px` : "100%",
        height: canvasGeometry ? `${canvasGeometry.cssHeight}px` : "100%",
        aspectRatio: `${stage.width} / ${stage.height}`,
        background: resolveProjectBackground(snapshot.project),
      }}
    />
  );

  if (mode === "export") {
    const exportFrameMaximum = Math.max(0, snapshot.frameCount - 1);
    return (
      <div ref={rootRef} className={styles.exportPlayer} data-canonical-project-player="export">
        <div className={styles.exportStage}>
          {canvas}
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
            max={exportFrameMaximum}
            value={Math.min(displayFrame, exportFrameMaximum)}
            onChange={event => seekTo(Number(event.target.value) / fps, false)}
            className={styles.seek}
          />
          <div className={styles.time} aria-label={`${mediaTimeSeconds.toFixed(3)} seconds of ${durationSeconds.toFixed(3)} seconds`}>
            {`${mediaTimeSeconds.toFixed(1)}s / ${formatExportDuration(durationSeconds)} · Frame ${visibleFrameNumber}/${snapshot.frameCount}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={styles.viewerPlayer} data-canonical-project-player="viewer">
      <div
        ref={stageRef}
        className={styles.viewerStage}
        data-project-player-fullscreen={fullscreen ? "true" : "false"}
        onPointerMove={showControls}
        onPointerEnter={showControls}
      >
        <div
          ref={videoSurfaceRef}
          className={styles.viewerVideoSurface}
          data-project-player-video-surface="true"
          onClick={togglePlayback}
          aria-label="Video surface. Activate to play or pause."
        >
          {canvas}
        </div>
        <div
          className={`${styles.viewerChrome} ${controlsVisible ? styles.viewerChromeVisible : styles.viewerChromeHidden}`}
          data-player-controls-visible={controlsVisible ? "true" : "false"}
          onClick={event => event.stopPropagation()}
          onFocusCapture={() => {
            controlsFocusedRef.current = true;
            showControls();
          }}
          onBlurCapture={event => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            controlsFocusedRef.current = false;
            showControls();
          }}
        >
          <div className={styles.viewerChromeTitle}>{snapshot.project.title}</div>
          {audioWarning ? (
            <div className={styles.audioWarning} role={audioUi.status === "unavailable" ? "alert" : "status"}>
              <strong>{audioUi.status === "unavailable" ? "Audio unavailable" : "Audio paused"}</strong>
              <span>{audioWarning}</span>
            </div>
          ) : null}
          {fullscreenError ? <div className={styles.fullscreenWarning} role="status">Fullscreen unavailable</div> : null}
          {renderError ? <div role="alert" className={styles.renderError}>This frame could not be displayed safely.</div> : null}
          <div className={styles.viewerControlRow} aria-label="Animation playback controls">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={playbackDisabled}
              className={styles.viewerControlButton}
              aria-label={`${playbackLabel} animation`}
            >
              {playbackLabel}
            </button>
            <input
              aria-label="Animation position"
              aria-valuetext={`${currentTime} of ${totalTime}, frame ${visibleFrameNumber} of ${playableFrameCount}`}
              type="range"
              min={0}
              max={snapshot.frameCount}
              step={1}
              value={mediaTimeSeconds * fps}
              onPointerDown={beginSeek}
              onPointerUp={finishSeek}
              onPointerCancel={finishSeek}
              onChange={event => {
                const next = Number(event.target.value) / fps;
                if (seekingRef.current) publishMediaTime(next);
                else seekTo(next, playingRef.current);
              }}
              onBlur={finishSeek}
              className={styles.viewerSeek}
            />
            <div className={styles.viewerTime} aria-label={`${mediaTimeSeconds.toFixed(3)} seconds of ${durationSeconds.toFixed(3)} seconds`}>
              <span>{currentTime} / {totalTime}</span>
              <span>Frame {visibleFrameNumber}/{playableFrameCount}</span>
            </div>
            <button
              type="button"
              onClick={() => void requestFullscreenToggle()}
              className={styles.viewerControlButton}
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
          </div>
        </div>
      </div>
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  );
});
