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
import { renderCanonicalExportFrame } from "@/src/lib/export/exportRenderer";
import {
  createExportRequest,
  createExportSelection,
  sanitizeExportFilename,
  snapshotHasAudio,
  type ExportOutputTier,
  type ExportQualityTier,
} from "@/src/lib/export/exportContracts";
import {
  EXPORT_DESTINATION_CATALOG,
  resolveExportDestinationGeometry,
  validateCustomDimensions,
  type ExportCanvasShape,
  type ExportDestinationChoice,
  type ExportDestinationPresetId,
} from "@/src/lib/export/exportDestinationCatalog";
import {
  exportSnapshotToMp4,
  preflightLocalMp4,
  type ExportProgress,
} from "@/src/lib/export/exportVideo";
import {
  buildGifPalette,
  canvasToPngBytes,
  createGifWriter,
  createStoredZip,
  padFrameNumber,
  pickSaveTarget,
  writeSaveTarget,
} from "@/src/lib/export/exportImages";
import { createMemoryFileHandle, type MemoryFileHandle } from "@/src/lib/export/exportMemoryFile";
import styles from "./animationExport.module.css";
import { BackButton } from "@/src/components/ui/BackButton";

type Props = { origin: "home" | "workspace"; onBack: () => void; /** From the editor: open this project straight away. */ preferredProjectId?: string | null };
type SnapshotState = { status: "loading" } | { status: "ready"; snapshot: ExportProjectSnapshot } | { status: "failed"; message: string };

const errorMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : "storage_read_failed";
  if (code === "source_changed") return "This saved animation changed while Export was reading it. Please choose it again.";
  if (code === "rig_migration_incomplete") return "This animation can't be opened yet.";
  return "This animation can't be opened right now.";
};

const formatUpdatedAt = (updatedAt: string | null) => {
  if (!updatedAt) return "Saved";
  const value = new Date(updatedAt);
  return Number.isNaN(value.getTime()) ? "Saved" : `Edited ${value.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
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
  if (snapshot.frameCount === 0 || failed) return <div className={styles.thumbNote}>No preview</div>;
  return <canvas ref={canvasRef} width={240} height={135} aria-label={`${snapshot.project.title} thumbnail`} className={styles.thumbCanvas} />;
}

type ExportFormat = "video" | "gif" | "pictures";
type ExportRunState = "idle" | "working" | "cancelling" | "done" | "failed" | "cancelled";
type ExportRunProgress = { label: string; percent: number | null };

// SPEC-0020 Phase 5 (Arthur): one simple export screen, like a real professional tool.
const FORMATS: { id: ExportFormat; name: string; detail: string }[] = [
  { id: "video", name: "Video", detail: "MP4 video" },
  { id: "gif", name: "GIF", detail: "Loops · no sound" },
  { id: "pictures", name: "Pictures", detail: "PNG images" },
];

const GIF_SIZES = { small: 480, medium: 720, large: 1080 } as const;
const PICTURE_SIZES = { "720p": 1280, "1080p": 1920 } as const;

const shapeLabel = (shape: string) =>
  shape === "16:9" ? "Wide 16:9" : shape === "9:16" ? "Tall 9:16" : shape === "4:5" ? "Portrait 4:5" : shape === "1:1" ? "Square" : "Same shape as your stage";

/** Fits the stage inside a box whose long side is `longSide` (even numbers, as video and GIF tools expect). */
const fitStage = (stageWidth: number, stageHeight: number, longSide: number) => {
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return stageWidth >= stageHeight
    ? { width: even(longSide), height: even((longSide * stageHeight) / stageWidth) }
    : { width: even((longSide * stageWidth) / stageHeight), height: even(longSide) };
};

const baseName = (filename: string, title: string) => sanitizeExportFilename(filename, title).replace(/\.mp4$/i, "");
const nextTick = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

function FormatIcon({ format }: { format: ExportFormat }) {
  if (format === "video") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" /></svg>;
  if (format === "gif") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M20.5 5.5V11h-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="9.5" r="1.8" fill="currentColor" /><path d="m4 18 5.5-5.5 3.5 3.5 2.5-2.5L20 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}

export function ExportAnimationPlayer({ snapshot, onChange, ownerId, changeLabel = "Back" }: { snapshot: ExportProjectSnapshot; onChange: () => void; ownerId: string; changeLabel?: string }) {
  const playerRef = useRef<CanonicalProjectPlayerHandle | null>(null);
  const [format, setFormat] = useState<ExportFormat>("video");
  const [filename, setFilename] = useState(snapshot.project.title);
  const [quality, setQuality] = useState<ExportQualityTier>("1080p");
  const [destinationId, setDestinationId] = useState<ExportDestinationPresetId>("original");
  const [customShape, setCustomShape] = useState<ExportCanvasShape>("original");
  const [customWidth, setCustomWidth] = useState("1080");
  const [customHeight, setCustomHeight] = useState("1080");
  const [gifSize, setGifSize] = useState<keyof typeof GIF_SIZES>("medium");
  const [gifLoop, setGifLoop] = useState(true);
  const [pictureFrames, setPictureFrames] = useState<"this" | "all">("all");
  const [pictureSize, setPictureSize] = useState<keyof typeof PICTURE_SIZES>("1080p");
  const [runState, setRunState] = useState<ExportRunState>("idle");
  const [progress, setProgress] = useState<ExportRunProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const downloadedRef = useRef(false);
  const selectionRef = useRef(createExportSelection(snapshot));
  const stage = snapshot.project.document.logicalStage;
  const fps = snapshot.project.document.fps;
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
  const hasAudio = snapshotHasAudio(snapshot);
  const running = runState === "working" || runState === "cancelling";

  // What the file will look like, for the preview and the one-line summary.
  const output = format === "video"
    ? geometry.outputCanvas
    : fitStage(stage.width, stage.height, format === "gif" ? GIF_SIZES[gifSize] : PICTURE_SIZES[pictureSize]);
  const previewRect = format === "video" ? geometry.contentRect : { x: 0, y: 0, width: output.width, height: output.height };

  useEffect(() => () => {
    abortRef.current?.abort();
    playerRef.current?.pause();
  }, []);

  const changeAnimation = () => { abortRef.current?.abort(); playerRef.current?.pause(); onChange(); };
  const resetResult = () => { if (!running) { setRunState("idle"); setMessage(null); setProgress(null); } };

  const assertSnapshotIsCurrent = async () => {
    const collection = await listProjectCollection(createAccountProjectSourceReader(ownerId));
    const currentEntry = collection.find(entry => entry.id === snapshot.entry.id);
    if (!currentEntry || !exportCollectionEntryIdentityMatches(currentEntry, snapshot.entry)) throw new Error("source_changed");
  };

  const plainError = (error: unknown) => {
    const code = error instanceof Error ? error.message.split(":")[0] : "export_failed";
    const messages: Record<string, string> = {
      source_changed: "This animation was changed somewhere else while you were exporting. Go back and choose it again.",
      export_finder_unavailable: "This browser window can't save files. Open Diamond Animator in Chrome and try again.",
      export_permission_denied: "Your computer didn't allow saving there. Try another folder.",
      export_video_encoder_unavailable: "This browser can't make MP4 videos. Try Chrome, or export a GIF.",
      export_audio_encoder_unavailable: "This browser can't add sound to videos. Try Chrome, or export a GIF.",
      export_audio_missing: "One of the sounds in this animation is missing. Remove it or add it again, then export.",
      export_audio_decode_failed: "One of the sounds in this animation can't be read. Remove it or add it again, then export.",
      export_symbol_definition_missing: "One of the Library symbols in this animation is missing.",
      export_cleanup_failed: "The export failed and left an unfinished file. Delete that file, then try again.",
      export_custom_dimensions_invalid: "Width and height must be even numbers from 256 to 1920.",
    };
    if (code.startsWith("export_validation")) return "The video didn't come out right, so it wasn't kept. Please try again.";
    return messages[code] ?? "The export didn't finish. Your animation was not changed.";
  };

  /** Renders every frame needed into one reusable canvas, one at a time (keeps memory low). */
  const renderFrame = async (canvas: HTMLCanvasElement, frameIndex: number, signal: AbortSignal) => {
    await renderCanonicalExportFrame(canvas, snapshot.project, frameIndex, signal);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("export_canvas_unavailable");
    return context;
  };

  const exportVideo = async (signal: AbortSignal) => {
    const outputTier: ExportOutputTier = usingCustomDimensions ? "custom" : quality;
    const request = createExportRequest(snapshot, selectionRef.current, outputTier, filename, hasAudio, destinationChoice);
    // The save window must open right after the click, before any waiting.
    let handle: FileSystemFileHandle;
    let memory: MemoryFileHandle | null = null;
    // One rule for every format (pickSaveTarget): only a real "Cancel" stops; a window that can't save gets a download.
    const target = await pickSaveTarget(request.sanitizedBaseFilename, "mp4");
    if (!target) return "cancelled" as const;
    if (target.type === "file") {
      handle = target.handle;
      // Make sure the chosen file can really be written (the browser inside the Claude app sometimes refuses).
      try {
        const probe = await handle.createWritable({ keepExistingData: false });
        await probe.close();
      } catch {
        memory = createMemoryFileHandle(request.sanitizedBaseFilename, "video/mp4");
        handle = memory;
      }
    } else {
      memory = createMemoryFileHandle(request.sanitizedBaseFilename, "video/mp4");
      handle = memory;
    }
    setProgress({ label: "Getting ready", percent: null });
    try {
      await assertSnapshotIsCurrent();
      await preflightLocalMp4(request);
    } catch (error) {
      if (!memory) await (handle as FileSystemFileHandle & { remove?: () => Promise<void> }).remove?.().catch(() => undefined);
      throw error;
    }
    await exportSnapshotToMp4({
      snapshot,
      request,
      handle,
      signal,
      onProgress: (next: ExportProgress) => {
        if (next.stage === "rendering" || next.stage === "encoding") setProgress({ label: "Making your video", percent: Math.round((next.completed / Math.max(1, next.total)) * 100) });
        else if (next.stage === "validating") setProgress({ label: "Checking the video", percent: 100 });
      },
    });
    if (memory) downloadedRef.current = (await writeSaveTarget({ type: "download" }, memory.toBlob(), request.sanitizedBaseFilename, "mp4")) === "downloaded";
    return request.sanitizedBaseFilename;
  };

  const exportGif = async (signal: AbortSignal) => {
    const name = `${baseName(filename, snapshot.project.title)}.gif`;
    const target = await pickSaveTarget(name, "gif");
    if (!target) return "cancelled" as const;
    setProgress({ label: "Getting ready", percent: null });
    await assertSnapshotIsCurrent();
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const total = snapshot.frameCount;
    // The colors come from a few frames spread across the animation.
    const sampleCount = Math.min(10, total);
    const samples: ImageData[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const frameIndex = Math.round((index * (total - 1)) / Math.max(1, sampleCount - 1));
      samples.push((await renderFrame(canvas, frameIndex, signal)).getImageData(0, 0, canvas.width, canvas.height));
    }
    const writer = createGifWriter({
      width: canvas.width,
      height: canvas.height,
      palette: buildGifPalette(samples),
      delayCentiseconds: Math.max(2, Math.round(100 / Math.max(1, fps))),
      loop: gifLoop,
    });
    samples.length = 0;
    for (let frameIndex = 0; frameIndex < total; frameIndex += 1) {
      const context = await renderFrame(canvas, frameIndex, signal);
      writer.addFrame(context.getImageData(0, 0, canvas.width, canvas.height));
      setProgress({ label: "Making your GIF", percent: Math.round(((frameIndex + 1) / total) * 100) });
      await nextTick();
    }
    if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
    downloadedRef.current = (await writeSaveTarget(target, writer.finish(), name, "gif")) === "downloaded";
    return name;
  };

  const exportPictures = async (signal: AbortSignal) => {
    const base = baseName(filename, snapshot.project.title);
    const total = snapshot.frameCount;
    const single = pictureFrames === "this";
    const frameIndex = Math.max(0, Math.min(total - 1, playerRef.current?.currentFrame() ?? 0));
    const name = single ? `${base} ${padFrameNumber(frameIndex, total)}.png` : `${base} frames.zip`;
    const target = await pickSaveTarget(name, single ? "png" : "zip");
    if (!target) return "cancelled" as const;
    setProgress({ label: "Getting ready", percent: null });
    await assertSnapshotIsCurrent();
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    if (single) {
      await renderFrame(canvas, frameIndex, signal);
      downloadedRef.current = (await writeSaveTarget(target, await canvasToPngBytes(canvas), name, "png")) === "downloaded";
      return name;
    }
    const files: { name: string; data: Uint8Array }[] = [];
    for (let index = 0; index < total; index += 1) {
      await renderFrame(canvas, index, signal);
      files.push({ name: `${base} ${padFrameNumber(index, total)}.png`, data: await canvasToPngBytes(canvas) });
      setProgress({ label: "Making your pictures", percent: Math.round(((index + 1) / total) * 100) });
      await nextTick();
    }
    if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
    downloadedRef.current = (await writeSaveTarget(target, createStoredZip(files), name, "zip")) === "downloaded";
    return name;
  };

  const runExport = async () => {
    if (running || customDimensionError) return;
    playerRef.current?.pause();
    const abort = new AbortController();
    abortRef.current = abort;
    downloadedRef.current = false;
    setRunState("working");
    setMessage(null);
    setProgress(null);
    try {
      const result = format === "video" ? await exportVideo(abort.signal) : format === "gif" ? await exportGif(abort.signal) : await exportPictures(abort.signal);
      if (result === "cancelled") { setRunState("idle"); setProgress(null); return; }
      setRunState("done");
      setProgress(null);
      setMessage(downloadedRef.current ? `Downloaded “${result}” — it's in your Downloads folder.` : `Saved “${result}”.`);
    } catch (error) {
      setProgress(null);
      if (isAbort(error)) { setRunState("cancelled"); setMessage("Export stopped. Nothing was saved."); }
      else { console.warn("[export] failed", error); setRunState("failed"); setMessage(plainError(error)); }
    } finally {
      abortRef.current = null;
    }
  };

  const cancelExport = () => {
    if (!abortRef.current || runState !== "working") return;
    setRunState("cancelling");
    abortRef.current.abort();
  };

  const frameCountLabel = `${snapshot.frameCount} ${snapshot.frameCount === 1 ? "frame" : "frames"}`;
  const summary = format === "video"
    ? `${output.width} × ${output.height} · ${fps} fps · ${formatExportDuration(snapshot.durationSeconds)}${hasAudio ? " · with sound" : ""}`
    : format === "gif"
      ? `${output.width} × ${output.height} · ${fps} fps · ${formatExportDuration(snapshot.durationSeconds)} · ${gifLoop ? "loops" : "plays once"}`
      : pictureFrames === "this" ? `${output.width} × ${output.height} · 1 picture (the frame in the preview)` : `${output.width} × ${output.height} · ${frameCountLabel} in one ZIP file`;
  const exportLabel = format === "video" ? "Export video" : format === "gif" ? "Export GIF" : pictureFrames === "this" ? "Export picture" : "Export pictures";

  return (
    <main aria-label={`Export ${snapshot.project.title}`} className={`${styles.page} ${styles.playerPage}`}>
      <div className={`${styles.column} ${styles.playerColumn}`}>
        <div className={styles.exportHeader}>
          <BackButton onClick={changeAnimation}>{changeLabel.replace(/^←\s*/, "")}</BackButton>
          <div><div className={styles.eyebrow}>Export</div><h1 className={styles.title}>{snapshot.project.title}</h1></div>
        </div>
        <div className={styles.exportLayout}>
          <div className={styles.previewColumn}>
            <div className={styles.playerFrame}>
              <CanonicalProjectPlayer
                ref={playerRef}
                snapshot={snapshot}
                mode="export"
                outputWidth={output.width}
                outputHeight={output.height}
                contentRect={previewRect}
              />
            </div>
          </div>
          <div className={styles.settingsColumn}>
            <div role="radiogroup" aria-label="Format" className={styles.formatRow}>
              {FORMATS.map(option => (
                <button key={option.id} type="button" role="radio" aria-checked={format === option.id} disabled={running}
                  onClick={() => { setFormat(option.id); resetResult(); }} className={styles.formatButton}>
                  <FormatIcon format={option.id} />
                  <span className={styles.formatName}>{option.name}</span>
                  <span className={styles.formatDetail}>{option.detail}</span>
                </button>
              ))}
            </div>

            <label className={styles.field}>File name
              <input aria-label="File name" value={filename} disabled={running} onChange={event => { setFilename(event.target.value); resetResult(); }} className={styles.input} />
            </label>

            {format === "video" ? <>
              <label className={styles.field}>Made for
                <select aria-label="Made for" value={destinationId} disabled={running} onChange={event => { setDestinationId(event.target.value as ExportDestinationPresetId); resetResult(); }} className={styles.input}>
                  {EXPORT_DESTINATION_CATALOG.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.id === "original" ? "Anything (same shape as your stage)" : preset.id === "custom-other" ? "Custom size" : `${preset.displayName} — ${shapeLabel(preset.shape)}`}
                    </option>
                  ))}
                </select>
              </label>
              {destinationId === "custom-other" ? <>
                <label className={styles.field}>Shape
                  <select aria-label="Shape" disabled={running} value={customShape} onChange={event => { setCustomShape(event.target.value as ExportCanvasShape); resetResult(); }} className={styles.input}>
                    <option value="original">Same shape as your stage</option><option value="16:9">Wide 16:9</option><option value="9:16">Tall 9:16</option><option value="1:1">Square</option><option value="4:5">Portrait 4:5</option><option value="custom">Exact width and height</option>
                  </select>
                </label>
                {usingCustomDimensions ? <div className={styles.twoColumn}>
                  <label className={styles.field}>Width
                    <input aria-label="Width" aria-invalid={Boolean(customDimensionError)} type="number" min={256} max={1920} step={2} value={customWidth} disabled={running} onChange={event => { setCustomWidth(event.target.value); resetResult(); }} className={styles.input} />
                  </label>
                  <label className={styles.field}>Height
                    <input aria-label="Height" aria-invalid={Boolean(customDimensionError)} type="number" min={256} max={1920} step={2} value={customHeight} disabled={running} onChange={event => { setCustomHeight(event.target.value); resetResult(); }} className={styles.input} />
                  </label>
                </div> : null}
                {customDimensionError ? <div role="alert" className={styles.hintError}>{plainError(new Error("export_custom_dimensions_invalid"))}</div> : null}
              </> : null}
              {!usingCustomDimensions ? <label className={styles.field}>Quality
                <select aria-label="Quality" value={quality} disabled={running} onChange={event => { setQuality(event.target.value as ExportQualityTier); resetResult(); }} className={styles.input}>
                  <option value="1080p">Full HD (1080p)</option>
                  <option value="720p">HD (720p) — smaller file</option>
                </select>
              </label> : null}
            </> : null}

            {format === "gif" ? <>
              <label className={styles.field}>Size
                <select aria-label="GIF size" value={gifSize} disabled={running} onChange={event => { setGifSize(event.target.value as keyof typeof GIF_SIZES); resetResult(); }} className={styles.input}>
                  <option value="small">Small — best for chats</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={gifLoop} disabled={running} onChange={event => { setGifLoop(event.target.checked); resetResult(); }} />
                Loop forever
              </label>
            </> : null}

            {format === "pictures" ? <>
              <label className={styles.field}>Frames
                <select aria-label="Frames" value={pictureFrames} disabled={running} onChange={event => { setPictureFrames(event.target.value as "this" | "all"); resetResult(); }} className={styles.input}>
                  <option value="all">Every frame ({frameCountLabel}, in a ZIP file)</option>
                  <option value="this">Only the frame in the preview</option>
                </select>
              </label>
              <label className={styles.field}>Size
                <select aria-label="Picture size" value={pictureSize} disabled={running} onChange={event => { setPictureSize(event.target.value as keyof typeof PICTURE_SIZES); resetResult(); }} className={styles.input}>
                  <option value="1080p">Full HD (1080p)</option>
                  <option value="720p">HD (720p)</option>
                </select>
              </label>
            </> : null}

            <div className={styles.summaryLine}>{summary}</div>

            {progress ? <div role="status" aria-live="polite" className={styles.progress}>
              <div className={styles.progressTop}><span>{progress.label === "Getting ready" ? "Getting your export ready…" : progress.label}</span>{progress.percent !== null && <strong>{progress.percent}%</strong>}</div>
              {/* Arthur (2026-10-27): a glowing blue bar instead of the grey browser bar; it sweeps while the percent is unknown. */}
              <div role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent ?? undefined} className={styles.progressBar} data-waiting={progress.percent === null ? "true" : undefined}>
                <i style={progress.percent === null ? undefined : { width: `${progress.percent}%` }} />
              </div>
            </div> : null}
            {message ? <div role={runState === "failed" ? "alert" : "status"} className={runState === "done" ? styles.resultSuccess : runState === "failed" ? styles.resultError : styles.resultNote}>{message}</div> : null}

            <div className={styles.actions}>
              {runState === "working" || runState === "cancelling"
                ? <button type="button" onClick={cancelExport} disabled={runState === "cancelling"} className={styles.button}>{runState === "cancelling" ? "Stopping" : "Stop"}</button>
                : <button type="button" disabled={Boolean(customDimensionError) || snapshot.frameCount === 0} onClick={() => void runExport()} className={`${styles.primaryButton} ${styles.exportButton}`}>{exportLabel}</button>}
            </div>
            <div className={styles.footnote}>Exporting doesn&apos;t use AI credits.</div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function AnimationExportFlow({ origin, onBack, preferredProjectId = null }: Props) {
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
  const [query, setQuery] = useState("");
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

  // From the editor (SPEC-0020 Phase 5): skip the list and open the project you were working on.
  const autoOpenedRef = useRef(false);
  const preferredEntryId = preferredProjectId
    ? entries.find(entry => entry.id === preferredProjectId || entry.sourceId === preferredProjectId || entry.locator === preferredProjectId)?.id ?? null
    : null;
  const preferredState = preferredEntryId ? snapshots[preferredEntryId] : null;
  useEffect(() => {
    if (autoOpenedRef.current || !preferredEntryId || preferredState?.status !== "ready" || preferredState.snapshot.frameCount === 0) return;
    autoOpenedRef.current = true;
    setSelectedId(preferredEntryId);
    setWatching(preferredState.snapshot);
  }, [preferredEntryId, preferredState]);
  if (watching && ownerId) {
    const backToEditor = origin === "workspace" && autoOpenedRef.current;
    return <ExportAnimationPlayer snapshot={watching} ownerId={ownerId} changeLabel={backToEditor ? "Back to your animation" : "Choose another animation"} onChange={() => {
      if (backToEditor) { onBack(); return; }
      setWatching(null); setSelectedId(null); setMessage(null); loadCollection();
    }} />;
  }

  const visibleEntries = query.trim() ? entries.filter((entry) => entry.title.toLowerCase().includes(query.trim().toLowerCase())) : entries;
  // Click an animation and it opens for export right away, like Open Project (Arthur 2026-10-25: no Next button).
  const openAnimation = async (entryId: string) => {
    const state = snapshots[entryId];
    if (state?.status !== "ready" || state.snapshot.frameCount === 0 || busy) return;
    setSelectedId(entryId); setBusy(true); setMessage(null);
    try {
      const current = await loadExportProjectSnapshot(createReader(), state.snapshot.entry);
      if (current.projectDigest !== state.snapshot.projectDigest) throw new Error("source_changed");
      setWatching(current); setMessage(null);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  };

  return (
    <main data-animation-export="choose" aria-label="Choose a saved animation to export" className={`${styles.page} ${styles.choosePage}`}>
      <div className={`${styles.column} ${styles.chooseColumn}`}>
        {/* Library-style page (Arthur 2026-10-25: "looks empty"): title on the left, search + count, a grid that fills the
            width, and a plain column on the right that says what you can export. Phones stack it. */}
        <div className={styles.chooseHeader}>
          <BackButton onClick={onBack}>Back</BackButton>
          <div className={styles.chooseHeading}><div className={styles.eyebrow}>Export</div><h1 className={styles.chooseTitle}>Choose an animation</h1><p className={styles.chooseLead}>Click an animation to preview it and pick a format.</p></div>
        </div>
        {origin === "workspace" && preferredProjectId === null ? <div role="note" className={styles.statusWarning}>Your latest changes couldn&apos;t be saved, so Export uses your last save.</div> : null}
        {message ? <div role="status" aria-live="polite" className={styles.statusInfo}>{message}</div> : null}
        <div className={styles.chooseLayout}>
        <section className={styles.chooseMain} aria-label="Your animations">
          <div className={styles.chooseToolbar}>
            <input type="search" className={styles.chooseSearch} placeholder="Search animations" aria-label="Search animations" value={query} onChange={(event) => setQuery(event.target.value)} />
            <span className={styles.chooseCount}>{loading ? "" : `${visibleEntries.length} ${visibleEntries.length === 1 ? "animation" : "animations"}`}</span>
          </div>
        {loading ? <div className={styles.emptyState}>Loading your animations</div> : collectionError ? <div className={styles.errorState}>Your animations couldn&apos;t be loaded.<div className={styles.errorStateAction}><button type="button" onClick={loadCollection} className={styles.button}>Try again</button></div></div> : entries.length === 0 ? <div className={styles.emptyState}>No saved animations yet. Save one first, then come back to Export.</div> : visibleEntries.length === 0 ? <div className={styles.emptyState}>No animation matches “{query.trim()}”.</div> : (
          <div className={styles.grid}>
            {visibleEntries.map(entry => {
              const state = snapshots[entry.id];
              const invalid = entry.classification === "invalid" || state?.status === "failed";
              const selected = selectedId === entry.id;
              const snapshot = state?.status === "ready" ? state.snapshot : null;
              return <button key={entry.id} type="button" aria-busy={selected && busy} disabled={invalid || !snapshot?.frameCount || busy} onClick={() => void openAnimation(entry.id)} className={styles.card} aria-label={`Export ${entry.title}`}>
                <div className={styles.cardThumb}>{snapshot ? <ExportThumbnail snapshot={snapshot} /> : state?.status === "loading" ? <span className={styles.thumbNote}>Loading preview</span> : <span className={styles.thumbNote}>Unavailable</span>}</div>
                <div className={styles.cardBody}><div className={styles.cardTitle}>{entry.title}</div><div className={styles.cardMeta}>{formatUpdatedAt(entry.updatedAt)}</div><div className={snapshot?.frameCount ? styles.cardMetaReady : styles.cardMeta}>{invalid ? state?.status === "failed" ? state.message : "Unavailable" : snapshot ? snapshot.frameCount === 0 ? "Nothing drawn yet" : `${formatExportDuration(snapshot.durationSeconds)} · ${snapshot.project.document.fps} fps` : "Loading"}</div></div>
              </button>;
            })}
          </div>
        )}
        </section>
        <aside className={styles.chooseAside} aria-label="What you can export">
          <h2 className={styles.chooseAsideTitle}>What you can export</h2>
          <ul className={styles.chooseFormats}>
            {FORMATS.map((format) => <li key={format.id}><span className={styles.chooseFormatName}>{format.name}</span><span className={styles.chooseFormatDetail}>{format.detail}</span></li>)}
          </ul>
          <p className={styles.chooseAsideNote}>Up to 1080p. You choose the format and size on the next screen.</p>
        </aside>
        </div>
      </div>
    </main>
  );
}
