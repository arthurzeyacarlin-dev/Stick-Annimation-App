"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanonicalProjectPlayer, type CanonicalProjectPlayerHandle } from "../project-player/CanonicalProjectPlayer";
import { listProjectCollection, type ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import { createAccountProjectSourceReader } from "@/src/lib/account/projectClient";
import { useAccountSession } from "@/src/components/account/AccountSessionProvider";
import {
  exportCollectionEntryIdentityMatches,
  formatExportDuration,
  loadExportProjectSnapshot,
  type ExportProjectSnapshot,
} from "@/src/lib/export/exportPhase1";
import { renderCanonicalExportFrame, resolveProjectBackground } from "@/src/lib/export/exportRenderer";
import {
  createExportRequest,
  createExportSelection,
  sanitizeExportFilename,
  snapshotHasAudio,
  type ExportOutputTier,
  type ExportQualityTier,
  type ExportRequestV1,
} from "@/src/lib/export/exportContracts";
import {
  EXPORT_DESTINATION_CATALOG,
  EXPORT_DESTINATION_CATALOG_VERSION,
  resolveExportDestinationGeometry,
  validateCustomDimensions,
  type ExportCanvasShape,
  type ExportDestinationChoice,
  type ExportDestinationPresetId,
} from "@/src/lib/export/exportDestinationCatalog";
import {
  chooseExportFile,
  exportSnapshotToMp4,
  preflightLocalMp4,
  type ExportInspection,
  type ExportProgress,
} from "@/src/lib/export/exportVideo";
import styles from "./animationExport.module.css";

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
  if (snapshot.frameCount === 0 || failed) return <div className={styles.thumbNote}>No thumbnail</div>;
  return <canvas ref={canvasRef} width={240} height={135} aria-label={`${snapshot.project.title} thumbnail`} className={styles.thumbCanvas} />;
}

export function ExportAnimationPlayer({ snapshot, onChange, ownerId, changeLabel = "Change animation" }: { snapshot: ExportProjectSnapshot; onChange: () => void; ownerId: string; changeLabel?: string }) {
  const playerRef = useRef<CanonicalProjectPlayerHandle | null>(null);
  const [filename, setFilename] = useState(snapshot.project.title);
  const [quality, setQuality] = useState<ExportQualityTier>("720p");
  const [destinationId, setDestinationId] = useState<ExportDestinationPresetId>("original");
  const [customShape, setCustomShape] = useState<ExportCanvasShape>("original");
  const [customWidth, setCustomWidth] = useState("1080");
  const [customHeight, setCustomHeight] = useState("1080");
  const [request, setRequest] = useState<ExportRequestV1 | null>(null);
  const [exportState, setExportState] = useState<"idle" | "preflighting" | "awaiting-location" | "exporting" | "cancelling" | "cancelled" | "failed" | "succeeded">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [inspection, setInspection] = useState<ExportInspection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selectionRef = useRef(createExportSelection(snapshot));
  const selectedPreset = EXPORT_DESTINATION_CATALOG.find(candidate => candidate.id === destinationId) ?? EXPORT_DESTINATION_CATALOG[0];
  const usingCustomDimensions = destinationId === "custom-other" && customShape === "custom";
  const customDimensionError = usingCustomDimensions ? validateCustomDimensions(Number(customWidth), Number(customHeight)) : null;
  const destinationChoice: ExportDestinationChoice = useMemo(() => ({
    presetId: destinationId,
    customShape,
    customWidth: Number(customWidth),
    customHeight: Number(customHeight),
  }), [customHeight, customShape, customWidth, destinationId]);
  const geometry = useMemo(() => resolveExportDestinationGeometry(
    snapshot,
    customDimensionError ? { ...destinationChoice, customWidth: 1080, customHeight: 1080 } : destinationChoice,
    quality,
  ), [customDimensionError, destinationChoice, quality, snapshot]);
  const dimensions = geometry.outputCanvas;

  useEffect(() => () => {
    abortRef.current?.abort();
    playerRef.current?.pause();
  }, []);
  const changeAnimation = () => { abortRef.current?.abort(); playerRef.current?.pause(); onChange(); };
  const hasAudio = snapshotHasAudio(snapshot);
  const running = exportState === "preflighting" || exportState === "exporting" || exportState === "cancelling";

  const assertSnapshotIsCurrent = async () => {
    const collection = await listProjectCollection(createAccountProjectSourceReader(ownerId));
    const currentEntry = collection.find(entry => entry.id === snapshot.entry.id);
    if (!currentEntry || !exportCollectionEntryIdentityMatches(currentEntry, snapshot.entry)) throw new Error("source_changed");
  };

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
      export_custom_dimensions_invalid: "Custom width and height must be even whole numbers from 256 through 1920.",
    };
    return messages[code] ?? "The MP4 could not be completed. The animation itself was not changed.";
  };

  const prepareExport = async () => {
    if (running) return;
    if (customDimensionError) {
      setExportError(customDimensionError);
      setExportState("failed");
      return;
    }
    setExportState("preflighting");
    setExportError(null);
    setInspection(null);
    setProgress({ stage: "preflighting", completed: 0, total: 3 });
    try {
      await assertSnapshotIsCurrent();
      setProgress({ stage: "preflighting", completed: 1, total: 3 });
      const outputTier: ExportOutputTier = usingCustomDimensions ? "custom" : quality;
      const nextRequest = createExportRequest(snapshot, selectionRef.current, outputTier, filename, hasAudio, destinationChoice);
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
    playerRef.current?.pause();
    try {
      await assertSnapshotIsCurrent();
      const result = await exportSnapshotToMp4({
        snapshot,
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
    <main aria-label="Watch saved animation" className={`${styles.page} ${styles.playerPage}`}>
      <div className={`${styles.column} ${styles.playerColumn}`}>
        <div className={styles.headerRow}>
          <div><div className={styles.eyebrow}>Export video</div><h1 className={styles.title}>{snapshot.project.title}</h1></div>
          <button type="button" onClick={changeAnimation} className={styles.button}>{changeLabel}</button>
        </div>
        <div className={styles.playerPanel}>
          <CanonicalProjectPlayer
            ref={playerRef}
            snapshot={snapshot}
            mode="export"
            outputWidth={dimensions.width}
            outputHeight={dimensions.height}
            contentRect={geometry.contentRect}
          />
        </div>
        <div className={styles.settingsPanel}>
          <div className={styles.settingsTitle}>Create a local MP4</div>
          <label className={styles.field}>File name
            <input aria-label="Video file name" value={filename} disabled={running} onChange={event => { setFilename(event.target.value); resetPreparedExport(); }} className={styles.input} />
          </label>
          <fieldset disabled={running} className={styles.fieldset}>
            <legend className={styles.legend}>Destination</legend>
            <div role="group" aria-label="Video destinations" className={styles.tileGrid}>
              {EXPORT_DESTINATION_CATALOG.map(preset => {
                const active = preset.id === destinationId;
                return <button key={preset.id} type="button" aria-pressed={active} onClick={() => { setDestinationId(preset.id); resetPreparedExport(); }} className={styles.tile}>
                  <span aria-hidden="true" className={styles.tileBadge}>{preset.brandAsset.label}</span>
                  <span><span className={styles.tileName}>{preset.displayName}</span><span className={styles.tileShape}>{preset.shape === "custom-choice" ? "Choose shape" : preset.shape === "original" ? "Saved shape" : preset.shape}</span></span>
                </button>;
              })}
            </div>
          </fieldset>
          {destinationId === "custom-other" ? <div className={styles.customGroup}>
            <label className={styles.field}>Custom canvas shape
              <select aria-label="Custom canvas shape" disabled={running} value={customShape} onChange={event => { setCustomShape(event.target.value as ExportCanvasShape); resetPreparedExport(); }} className={styles.input}>
                <option value="original">Original saved shape</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1 square</option><option value="4:5">4:5 portrait</option><option value="custom">Custom dimensions</option>
              </select>
            </label>
            {usingCustomDimensions ? <div className={styles.twoColumn}>
              <label className={styles.field}>Width
                <input aria-label="Custom video width" aria-invalid={Boolean(customDimensionError)} aria-describedby="custom-dimension-error" type="number" min={256} max={1920} step={2} value={customWidth} onChange={event => { setCustomWidth(event.target.value); resetPreparedExport(); }} className={styles.input} />
              </label>
              <label className={styles.field}>Height
                <input aria-label="Custom video height" aria-invalid={Boolean(customDimensionError)} aria-describedby="custom-dimension-error" type="number" min={256} max={1920} step={2} value={customHeight} onChange={event => { setCustomHeight(event.target.value); resetPreparedExport(); }} className={styles.input} />
              </label>
            </div> : null}
            {usingCustomDimensions ? <div id="custom-dimension-error" role={customDimensionError ? "alert" : undefined} className={customDimensionError ? styles.hintError : styles.hint}>{customDimensionError ?? "Even whole numbers from 256 through 1920 pixels."}</div> : null}
          </div> : null}
          {!usingCustomDimensions ? <fieldset disabled={running} className={styles.qualityFieldset}>
            <legend className={styles.legend}>Video quality</legend>
            {(["720p", "1080p"] as const).map(tier => <label key={tier} className={styles.radioLabel}><input type="radio" name="quality" checked={quality === tier} onChange={() => { setQuality(tier); resetPreparedExport(); }} />{tier}</label>)}
          </fieldset> : null}
          <div aria-label="Destination framing details" className={styles.framing}>
            <strong>{selectedPreset.displayName} · Fit complete animation</strong><br />
            {selectedPreset.shapeExplanation}<br />
            Canvas {dimensions.width}×{dimensions.height}; content {geometry.contentRect.width}×{geometry.contentRect.height} at ({geometry.contentRect.x}, {geometry.contentRect.y}). {geometry.paddingDescription}<br />
            {selectedPreset.guidance} Catalog {EXPORT_DESTINATION_CATALOG_VERSION}; local guidance only, not a posting guarantee.
          </div>
          <div className={styles.summary}>
            {dimensions.width}×{dimensions.height} · {snapshot.project.document.fps} FPS · {formatExportDuration(snapshot.durationSeconds)} · H.264 MP4{hasAudio ? " with AAC audio" : " without audio"}<br />
            Background: <span className={styles.swatch} style={{ background: resolveProjectBackground(snapshot.project) }} /> {resolveProjectBackground(snapshot.project)}. Everything stays on this Mac; exporting uses no AI credits.
          </div>
          {snapshot.durationSeconds >= 60 ? <div role="note" className={`${styles.statusWarning} ${styles.smallNote}`}>Long exports can use significant local CPU, memory, and storage. Keep this tab open until validation finishes.</div> : null}
          {progress ? <div role="status" aria-live="polite" className={styles.progress}>
            <div>{progress.stage === "awaiting-location" ? "Ready for Finder" : progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1)}{percent !== null ? ` · ${percent}%` : progress.bytesWritten ? ` · ${Math.round(progress.bytesWritten / 1024)} KB written` : ""}</div>
            {percent !== null ? <progress aria-label="Export progress" max={100} value={percent} className={styles.progressBar} /> : null}
          </div> : null}
          {exportError ? <div role="alert" className={exportState === "cancelled" ? styles.statusWarning : styles.statusError}>{exportError}</div> : null}
          {inspection ? <div role="status" className={styles.statusSuccess}>Saved and validated <strong>{inspection.filename}</strong> · {inspection.width}×{inspection.height} · {inspection.frameCount} frames · {inspection.durationSeconds.toFixed(2)}s · {(inspection.byteLength / 1024).toFixed(0)} KB</div> : null}
          <div className={styles.actions}>
            {exportState !== "awaiting-location" ? <button type="button" disabled={running || Boolean(customDimensionError)} onClick={() => void prepareExport()} className={styles.primaryButton}>{exportState === "preflighting" ? "Checking this Mac…" : exportState === "succeeded" ? "Export another video" : "Export video"}</button> : null}
            {exportState === "awaiting-location" && request ? <button type="button" onClick={() => void chooseLocationAndExport()} className={styles.primaryButton}>Choose save location…</button> : null}
            {exportState === "exporting" ? <button type="button" onClick={cancelExport} className={styles.button}>Cancel export</button> : null}
            {exportState === "cancelling" ? <button type="button" disabled className={styles.button}>Cancelling…</button> : null}
          </div>
          <div className={styles.finderName}>Suggested Finder name: {sanitizeExportFilename(filename, snapshot.project.title)}</div>
        </div>
      </div>
    </main>
  );
}

export function AnimationExportFlow({ origin, onBack }: Props) {
  const account = useAccountSession();
  const ownerId = account?.id;
  const createReader = useCallback(() => {
    if (!ownerId) throw new Error("account_session_required");
    return createAccountProjectSourceReader(ownerId);
  }, [ownerId]);
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
    void listProjectCollection(createReader()).then(collection => {
      if (collectionGenerationRef.current !== generation) return;
      setEntries(collection); setLoading(false);
      const available = collection.filter(candidate => candidate.classification !== "invalid");
      setSnapshots(Object.fromEntries(available.map(entry => [entry.id, { status: "loading" } satisfies SnapshotState])));
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < available.length) {
          const entry = available[nextIndex++];
          try {
            const snapshot = await loadExportProjectSnapshot(createReader(), entry);
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
  }, [createReader]);

  useEffect(loadCollection, [loadCollection]);
  if (watching && ownerId) return <ExportAnimationPlayer snapshot={watching} ownerId={ownerId} onChange={() => { setWatching(null); setSelectedId(null); setMessage(null); loadCollection(); }} />;
  const selectedState = selectedId ? snapshots[selectedId] : null;

  const openSelectedAnimation = async () => {
    if (!selectedId || selectedState?.status !== "ready" || selectedState.snapshot.frameCount === 0 || busy) return;
    setBusy(true); setMessage("Checking the exact saved animation…");
    try {
      const current = await loadExportProjectSnapshot(createReader(), selectedState.snapshot.entry);
      if (current.projectDigest !== selectedState.snapshot.projectDigest) throw new Error("source_changed");
      setWatching(current); setMessage(null);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };

  return (
    <main data-animation-export="choose" aria-label="Choose a saved animation to export" className={`${styles.page} ${styles.choosePage}`}>
      <div className={`${styles.column} ${styles.chooseColumn}`}>
        <div className={styles.headerRow}>
          <button type="button" onClick={onBack} className={styles.backButton}>← Back</button>
          <div className={styles.headerCenter}><div className={styles.eyebrow}>Export · Phase 3</div><h1 className={styles.chooseTitle}>Choose and watch</h1></div>
          <div className={styles.headerSpacer} />
        </div>
        <div className={styles.intro}>Select a saved animation, then choose <strong>Use this animation</strong> to watch the exact saved frames.</div>
        {origin === "workspace" ? <div role="note" className={styles.statusWarning}>Export uses the last saved version. Unsaved workspace changes are not included.</div> : null}
        {message ? <div role="status" aria-live="polite" className={styles.statusInfo}>{message}</div> : null}
        {loading ? <div className={styles.emptyState}>Loading saved animations…</div> : collectionError ? <div className={styles.errorState}>Saved animations could not be read. Nothing was changed.<div className={styles.errorStateAction}><button type="button" onClick={loadCollection} className={styles.button}>Try again</button></div></div> : entries.length === 0 ? <div className={styles.emptyState}>No saved animations yet. Save an animation first, then return to Export.</div> : (
          <div className={styles.grid}>
            {entries.map(entry => {
              const state = snapshots[entry.id];
              const invalid = entry.classification === "invalid" || state?.status === "failed";
              const selected = selectedId === entry.id;
              const snapshot = state?.status === "ready" ? state.snapshot : null;
              return <button key={entry.id} type="button" aria-pressed={selected} disabled={invalid} onClick={() => { setSelectedId(entry.id); setMessage(null); }} className={styles.card}>
                <div className={styles.cardThumb}>{snapshot ? <ExportThumbnail snapshot={snapshot} /> : state?.status === "loading" ? <span className={styles.thumbNote}>Preparing exact preview…</span> : <span className={styles.thumbNote}>Unavailable</span>}</div>
                <div className={styles.cardBody}><div className={styles.cardTitle}>{entry.title}</div><div className={styles.cardMeta}>{formatUpdatedAt(entry.updatedAt)}</div><div className={snapshot?.frameCount ? styles.cardMetaReady : styles.cardMeta}>{invalid ? state?.status === "failed" ? state.message : "Unavailable" : snapshot ? snapshot.frameCount === 0 ? "No authored frames" : `${formatExportDuration(snapshot.durationSeconds)} · ${snapshot.project.document.fps} FPS` : "Checking saved animation…"}</div></div>
              </button>;
            })}
          </div>
        )}
        <div className={styles.footer}><button type="button" disabled={busy || selectedState?.status !== "ready" || selectedState.snapshot.frameCount === 0} onClick={() => void openSelectedAnimation()} className={`${styles.primaryButton} ${styles.wideButton}`}>{busy ? "Checking…" : "Use this animation"}</button></div>
      </div>
    </main>
  );
}
