"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advancePlaybackAccumulator, getClampedPlaybackFrameDurationMs } from "../workspace/timelinePlayback";
import { listProjectCollection, type ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import { createBrowserProjectSourceReader } from "@/src/lib/animation/unifiedProjectSourceReader";
import {
  formatExportDuration,
  loadExportProjectSnapshot,
  type ExportProjectSnapshot,
} from "@/src/lib/export/exportPhase1";
import { renderCanonicalExportFrame, resolveProjectBackground } from "@/src/lib/export/exportRenderer";
import {
  createExportRequest,
  createExportSelection,
  outputDimensionsFor,
  sanitizeExportFilename,
  snapshotHasAudio,
  type ExportQualityTier,
  type ExportRequestV1,
} from "@/src/lib/export/exportContracts";
import {
  chooseExportFile,
  exportSnapshotToMp4,
  preflightLocalMp4,
  type ExportInspection,
  type ExportProgress,
} from "@/src/lib/export/exportVideo";

type Props = { origin: "home" | "workspace"; onBack: () => void };
type SnapshotState = { status: "loading" } | { status: "ready"; snapshot: ExportProjectSnapshot } | { status: "failed"; message: string };

const errorMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : "storage_read_failed";
  if (code === "source_changed") return "This saved animation changed while Export was reading it. Please choose it again.";
  if (code === "rig_migration_incomplete") return "This animation cannot be watched safely yet.";
  return "This saved animation is unavailable. Nothing was changed.";
};

const formatUpdatedAt = (updatedAt: string | null) => {
  if (!updatedAt) return "Saved on this browser";
  const value = new Date(updatedAt);
  return Number.isNaN(value.getTime()) ? "Saved on this browser" : `Edited ${value.toLocaleString()}`;
};

function ExportThumbnail({ snapshot }: { snapshot: ExportProjectSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || snapshot.frameCount === 0) return;
    let active = true;
    void renderCanonicalExportFrame(canvas, snapshot.project, 0).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [snapshot]);
  if (snapshot.frameCount === 0 || failed) return <div style={{ color: "rgba(255,255,255,0.46)", fontSize: 12 }}>No thumbnail</div>;
  return <canvas ref={canvasRef} width={240} height={135} aria-label={`${snapshot.project.title} thumbnail`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
}

function AnimationPlayer({ snapshot, onChange }: { snapshot: ExportProjectSnapshot; onChange: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [filename, setFilename] = useState(snapshot.project.title);
  const [quality, setQuality] = useState<ExportQualityTier>("720p");
  const [request, setRequest] = useState<ExportRequestV1 | null>(null);
  const [exportState, setExportState] = useState<"idle" | "preflighting" | "awaiting-location" | "exporting" | "cancelling" | "cancelled" | "failed" | "succeeded">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [inspection, setInspection] = useState<ExportInspection | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement[]>([]);
  const frameIndexRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const selectionRef = useRef(createExportSelection(snapshot));
  const dimensions = outputDimensionsFor(snapshot, quality);

  const stopAudio = useCallback(() => {
    for (const audio of activeAudioRef.current) { audio.pause(); audio.currentTime = 0; }
    activeAudioRef.current = [];
  }, []);

  const playSoundsAtFrame = useCallback((index: number) => {
    for (const layer of snapshot.project.document.layers) {
      const sound = layer.cells[index]?.content?.soundAttachment;
      if (!sound?.audioDataUrl) continue;
      const audio = new Audio(sound.audioDataUrl);
      const remove = () => { activeAudioRef.current = activeAudioRef.current.filter(candidate => candidate !== audio); };
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
  }, [dimensions.height, dimensions.width, frameIndex, snapshot]);

  useEffect(() => {
    if (!playing) return;
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
  }, [playSoundsAtFrame, playing, snapshot]);

  useEffect(() => () => {
    abortRef.current?.abort();
    stopAudio();
  }, [stopAudio]);
  const changeAnimation = () => { abortRef.current?.abort(); setPlaying(false); stopAudio(); onChange(); };
  const currentSeconds = frameIndex / snapshot.project.document.fps;
  const hasAudio = snapshotHasAudio(snapshot);
  const running = exportState === "preflighting" || exportState === "exporting" || exportState === "cancelling";

  const resetPreparedExport = () => {
    if (exportState === "awaiting-location" || exportState === "failed" || exportState === "cancelled" || exportState === "succeeded") {
      setRequest(null);
      setProgress(null);
      setInspection(null);
      setExportError(null);
      setExportState("idle");
    }
  };

  const plainExportError = (error: unknown) => {
    const code = error instanceof Error ? error.message.split(":")[0] : "export_failed";
    const messages: Record<string, string> = {
      source_changed: "The saved animation changed. Choose the animation again before exporting.",
      export_finder_unavailable: "Finder saving is not available in this browser window.",
      export_finder_cancelled: "Finder was cancelled. No video was created.",
      export_permission_denied: "Finder did not allow this file to be saved.",
      export_video_encoder_unavailable: "This Mac browser cannot encode the required H.264 video.",
      export_audio_encoder_unavailable: "This Mac browser cannot encode the required AAC audio.",
      export_audio_missing: "One saved sound is missing. Repair or remove it before exporting.",
      export_audio_decode_failed: "One saved sound could not be decoded. Repair or remove it before exporting.",
      export_symbol_definition_missing: "One saved Library symbol is unavailable or changed.",
      export_cleanup_failed: "The export failed, and the incomplete file could not be cleared. Delete that file before trying again.",
      export_validation_empty: "The video file was empty and was not accepted as successful.",
      export_validation_container: "The saved file was not a valid MP4.",
      export_validation_video_track: "The saved MP4 did not contain exactly one video track.",
      export_validation_video_codec: "The saved file was not H.264 video.",
      export_validation_audio_track: "The saved file did not contain the required AAC audio.",
      export_validation_frame_count: "The saved video did not contain every animation frame.",
      export_validation_dimensions: "The saved video dimensions did not match the chosen quality.",
      export_validation_duration: "The saved video duration did not match the animation.",
      export_validation_fps: "The saved video frame rate did not match the animation.",
    };
    return messages[code] ?? "The MP4 could not be completed. The animation itself was not changed.";
  };

  const prepareExport = async () => {
    if (running) return;
    setExportState("preflighting");
    setExportError(null);
    setInspection(null);
    setProgress({ stage: "preflighting", completed: 0, total: 3 });
    try {
      const current = await loadExportProjectSnapshot(createBrowserProjectSourceReader(), snapshot.entry);
      if (current.projectDigest !== snapshot.projectDigest) throw new Error("source_changed");
      setProgress({ stage: "preflighting", completed: 1, total: 3 });
      const nextRequest = createExportRequest(snapshot, selectionRef.current, quality, filename, hasAudio);
      await preflightLocalMp4(nextRequest);
      setProgress({ stage: "preflighting", completed: 3, total: 3 });
      setRequest(nextRequest);
      setExportState("awaiting-location");
    } catch (error) {
      setExportError(plainExportError(error));
      setExportState("failed");
    }
  };

  const chooseLocationAndExport = async () => {
    if (!request || running) return;
    setExportError(null);
    let handle: FileSystemFileHandle;
    try {
      handle = await chooseExportFile(request);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "export_finder_cancelled") {
        setExportState("cancelled");
        setExportError("Finder was cancelled. No video was created.");
      } else {
        setExportState("failed");
        setExportError(plainExportError(error));
      }
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setExportState("exporting");
    setPlaying(false);
    stopAudio();
    try {
      const current = await loadExportProjectSnapshot(createBrowserProjectSourceReader(), snapshot.entry);
      if (current.projectDigest !== request.projectDigest) throw new Error("source_changed");
      const result = await exportSnapshotToMp4({
        snapshot: current,
        request,
        handle,
        signal: abort.signal,
        onProgress: setProgress,
      });
      setInspection(result);
      setExportState("succeeded");
      setProgress({ stage: "succeeded", completed: 1, total: 1, bytesWritten: result.byteLength });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setExportState("cancelled");
        setExportError("Export was cancelled. Any created file was truncated to zero bytes where Finder allowed it.");
      } else {
        setExportState("failed");
        setExportError(plainExportError(error));
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancelExport = () => {
    if (!abortRef.current || exportState !== "exporting") return;
    setExportState("cancelling");
    setProgress(current => current ? { ...current, stage: "cancelling" } : { stage: "cancelling", completed: 0, total: 1 });
    abortRef.current.abort();
  };

  const showDeterminate = progress && ["preflighting", "rendering", "encoding", "validating", "succeeded"].includes(progress.stage) && progress.total > 0;
  const percent = showDeterminate ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : null;

  return (
    <main aria-label="Watch saved animation" style={{ minHeight: "100vh", background: "#0d121b", color: "white", padding: 24, overflowY: "auto" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 13, color: "#80b8ff", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Export video</div><h1 style={{ margin: "6px 0 0", fontSize: 26 }}>{snapshot.project.title}</h1></div>
          <button type="button" onClick={changeAnimation} style={secondaryButtonStyle}>Change animation</button>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, background: "#171d28", padding: 16 }}>
          <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} aria-label="Selected saved animation" style={{ width: "100%", aspectRatio: `${dimensions.width} / ${dimensions.height}`, display: "block", background: resolveProjectBackground(snapshot.project), borderRadius: 10 }} />
          {renderError ? <div role="alert" style={{ color: "#ffb3b3", marginTop: 10 }}>This frame could not be displayed safely.</div> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { if (playing) { setPlaying(false); stopAudio(); } else { if (frameIndex >= snapshot.frameCount - 1) { frameIndexRef.current = 0; setFrameIndex(0); } else { frameIndexRef.current = frameIndex; } setPlaying(true); } }} style={primaryButtonStyle}>{playing ? "Pause" : "Play"}</button>
            <input aria-label="Animation position" type="range" min={0} max={Math.max(0, snapshot.frameCount - 1)} value={frameIndex} onChange={event => { const next = Number(event.target.value); setPlaying(false); stopAudio(); frameIndexRef.current = next; setFrameIndex(next); }} style={{ flex: "1 1 340px" }} />
            <div style={{ minWidth: 155, textAlign: "right", color: "rgba(255,255,255,.68)", fontVariantNumeric: "tabular-nums" }}>{currentSeconds.toFixed(1)}s / {formatExportDuration(snapshot.durationSeconds)} · Frame {frameIndex + 1}/{snapshot.frameCount}</div>
          </div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18, background: "rgba(255,255,255,.035)", display: "grid", gap: 15 }}>
          <div style={{ fontWeight: 750 }}>Create a local MP4</div>
          <label style={{ display: "grid", gap: 6 }}>File name
            <input aria-label="Video file name" value={filename} disabled={running} onChange={event => { setFilename(event.target.value); resetPreparedExport(); }} style={{ minHeight: 42, borderRadius: 9, border: "1px solid rgba(255,255,255,.16)", background: "#10151e", color: "white", padding: "8px 11px" }} />
          </label>
          <fieldset disabled={running} style={{ border: 0, padding: 0, margin: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <legend style={{ marginBottom: 7 }}>Video quality</legend>
            {(["720p", "1080p"] as const).map(tier => <label key={tier} style={{ display: "flex", gap: 7, alignItems: "center" }}><input type="radio" name="quality" checked={quality === tier} onChange={() => { setQuality(tier); resetPreparedExport(); }} />{tier}</label>)}
          </fieldset>
          <div style={{ color: "rgba(255,255,255,.66)", fontSize: 13, lineHeight: 1.55 }}>
            {dimensions.width}×{dimensions.height} · {snapshot.project.document.fps} FPS · {formatExportDuration(snapshot.durationSeconds)} · H.264 MP4{hasAudio ? " with AAC audio" : " without audio"}<br />
            Background: <span style={{ display: "inline-block", width: 12, height: 12, verticalAlign: "-1px", borderRadius: 2, background: resolveProjectBackground(snapshot.project), border: "1px solid rgba(255,255,255,.35)" }} /> {resolveProjectBackground(snapshot.project)}. Everything stays on this Mac; exporting uses no AI credits.
          </div>
          {progress ? <div role="status" aria-live="polite" style={{ display: "grid", gap: 7 }}>
            <div>{progress.stage === "awaiting-location" ? "Ready for Finder" : progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1)}{percent !== null ? ` · ${percent}%` : progress.bytesWritten ? ` · ${Math.round(progress.bytesWritten / 1024)} KB written` : ""}</div>
            {percent !== null ? <progress aria-label="Export progress" max={100} value={percent} style={{ width: "100%" }} /> : null}
          </div> : null}
          {exportError ? <div role="alert" style={{ color: exportState === "cancelled" ? "#f3d89c" : "#ffb3b3" }}>{exportError}</div> : null}
          {inspection ? <div role="status" style={{ color: "#9fe3b2", lineHeight: 1.5 }}>Saved and validated <strong>{inspection.filename}</strong> · {inspection.width}×{inspection.height} · {inspection.frameCount} frames · {inspection.durationSeconds.toFixed(2)}s · {(inspection.byteLength / 1024).toFixed(0)} KB</div> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {exportState !== "awaiting-location" ? <button type="button" disabled={running} onClick={() => void prepareExport()} style={{ ...primaryButtonStyle, opacity: running ? .5 : 1 }}>{exportState === "preflighting" ? "Checking this Mac…" : exportState === "succeeded" ? "Export another video" : "Export video"}</button> : null}
            {exportState === "awaiting-location" && request ? <button type="button" onClick={() => void chooseLocationAndExport()} style={primaryButtonStyle}>Choose save location…</button> : null}
            {exportState === "exporting" ? <button type="button" onClick={cancelExport} style={secondaryButtonStyle}>Cancel export</button> : null}
            {exportState === "cancelling" ? <button type="button" disabled style={{ ...secondaryButtonStyle, opacity: .55 }}>Cancelling…</button> : null}
          </div>
          <div style={{ color: "rgba(255,255,255,.48)", fontSize: 12 }}>Suggested Finder name: {sanitizeExportFilename(filename, snapshot.project.title)}</div>
        </div>
      </div>
    </main>
  );
}

const primaryButtonStyle = { padding: "10px 16px", borderRadius: 10, border: "1px solid #4b91e8", background: "#2867b2", color: "white", fontWeight: 750, cursor: "pointer" } as const;
const secondaryButtonStyle = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: "white", cursor: "pointer" } as const;

export function AnimationExportFlow({ origin, onBack }: Props) {
  const [entries, setEntries] = useState<ProjectCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionError, setCollectionError] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [watching, setWatching] = useState<ExportProjectSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const collectionGenerationRef = useRef(0);

  const loadCollection = useCallback(() => {
    const generation = collectionGenerationRef.current + 1;
    collectionGenerationRef.current = generation;
    setLoading(true); setCollectionError(false); setMessage(null);
    void listProjectCollection(createBrowserProjectSourceReader()).then(collection => {
      if (collectionGenerationRef.current !== generation) return;
      setEntries(collection); setLoading(false);
      const available = collection.filter(candidate => candidate.classification !== "invalid");
      setSnapshots(Object.fromEntries(available.map(entry => [entry.id, { status: "loading" } satisfies SnapshotState])));
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < available.length) {
          const entry = available[nextIndex++];
          try {
            const snapshot = await loadExportProjectSnapshot(createBrowserProjectSourceReader(), entry);
            if (collectionGenerationRef.current !== generation) return;
            setSnapshots(current => ({ ...current, [entry.id]: { status: "ready", snapshot } }));
          } catch (error) {
            if (collectionGenerationRef.current !== generation) return;
            setSnapshots(current => ({ ...current, [entry.id]: { status: "failed", message: errorMessage(error) } }));
          }
        }
      };
      void Promise.all(Array.from({ length: Math.min(4, available.length) }, worker));
    }).catch(() => { if (collectionGenerationRef.current === generation) { setLoading(false); setCollectionError(true); } });
  }, []);

  useEffect(loadCollection, [loadCollection]);
  if (watching) return <AnimationPlayer snapshot={watching} onChange={() => { setWatching(null); setSelectedId(null); setMessage(null); loadCollection(); }} />;
  const selectedState = selectedId ? snapshots[selectedId] : null;

  const openSelectedAnimation = async () => {
    if (!selectedId || selectedState?.status !== "ready" || selectedState.snapshot.frameCount === 0 || busy) return;
    setBusy(true); setMessage("Checking the exact saved animation…");
    try {
      const current = await loadExportProjectSnapshot(createBrowserProjectSourceReader(), selectedState.snapshot.entry);
      if (current.projectDigest !== selectedState.snapshot.projectDigest) throw new Error("source_changed");
      setWatching(current); setMessage(null);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };

  return (
    <main data-animation-export="choose" aria-label="Choose a saved animation to export" style={{ minHeight: "100vh", background: "#0d121b", color: "white", padding: "22px 22px 60px", overflowY: "auto" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={onBack} style={secondaryButtonStyle}>← Back</button>
          <div style={{ textAlign: "center" }}><div style={{ color: "#80b8ff", fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Export · Phase 2</div><h1 style={{ margin: "5px 0 0", fontSize: 28 }}>Choose and watch</h1></div>
          <div style={{ width: 72 }} />
        </div>
        <div style={{ color: "rgba(255,255,255,.68)", textAlign: "center" }}>Select a saved animation, then choose <strong>Use this animation</strong> to watch the exact saved frames.</div>
        {origin === "workspace" ? <div role="note" style={{ background: "rgba(255,190,65,.09)", border: "1px solid rgba(255,190,65,.25)", borderRadius: 12, padding: 12, color: "#f3d89c" }}>Export uses the last saved version. Unsaved workspace changes are not included.</div> : null}
        {message ? <div role="status" aria-live="polite" style={{ borderRadius: 10, padding: 12, background: "rgba(90,145,220,.1)", color: "#b9d8ff" }}>{message}</div> : null}
        {loading ? <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,.55)" }}>Loading saved animations…</div> : collectionError ? <div style={{ padding: 40, textAlign: "center" }}>Saved animations could not be read. Nothing was changed.<div style={{ marginTop: 14 }}><button type="button" onClick={loadCollection} style={secondaryButtonStyle}>Try again</button></div></div> : entries.length === 0 ? <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,.55)" }}>No saved animations yet. Save an animation first, then return to Export.</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 340px))", justifyContent: "center", gap: 16 }}>
            {entries.map(entry => {
              const state = snapshots[entry.id];
              const invalid = entry.classification === "invalid" || state?.status === "failed";
              const selected = selectedId === entry.id;
              const snapshot = state?.status === "ready" ? state.snapshot : null;
              return <button key={entry.id} type="button" aria-pressed={selected} disabled={invalid} onClick={() => { setSelectedId(entry.id); setMessage(null); }} style={{ padding: 0, overflow: "hidden", borderRadius: 14, border: selected ? "2px solid #5aa2ff" : "1px solid rgba(255,255,255,.12)", background: selected ? "rgba(46,111,190,.16)" : "#171d28", color: "white", cursor: invalid ? "default" : "pointer", opacity: invalid ? .62 : 1, textAlign: "left" }}>
                <div style={{ aspectRatio: "16 / 9", background: "#242b37", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{snapshot ? <ExportThumbnail snapshot={snapshot} /> : state?.status === "loading" ? <span style={{ color: "rgba(255,255,255,.46)", fontSize: 12 }}>Preparing exact preview…</span> : <span style={{ color: "rgba(255,255,255,.46)", fontSize: 12 }}>Unavailable</span>}</div>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 7 }}><div style={{ fontWeight: 780, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</div><div style={{ color: "rgba(255,255,255,.55)", fontSize: 12 }}>{formatUpdatedAt(entry.updatedAt)}</div><div style={{ color: snapshot?.frameCount ? "#9bc7ff" : "rgba(255,255,255,.55)", fontSize: 12 }}>{invalid ? state?.status === "failed" ? state.message : "Unavailable" : snapshot ? snapshot.frameCount === 0 ? "No authored frames" : `${formatExportDuration(snapshot.durationSeconds)} · ${snapshot.project.document.fps} FPS` : "Checking saved animation…"}</div></div>
              </button>;
            })}
          </div>
        )}
        <div style={{ position: "sticky", bottom: 0, padding: "14px 0", background: "linear-gradient(180deg, rgba(13,18,27,0), #0d121b 28%)", display: "flex", justifyContent: "center" }}><button type="button" disabled={busy || selectedState?.status !== "ready" || selectedState.snapshot.frameCount === 0} onClick={() => void openSelectedAnimation()} style={{ ...primaryButtonStyle, minWidth: 190, opacity: busy || selectedState?.status !== "ready" || selectedState.snapshot.frameCount === 0 ? .45 : 1, cursor: busy || selectedState?.status !== "ready" || selectedState.snapshot.frameCount === 0 ? "default" : "pointer" }}>{busy ? "Checking…" : "Use this animation"}</button></div>
      </div>
    </main>
  );
}
