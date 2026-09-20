"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawScaledDrawingTextObject, type DrawingTextObject } from "../workspace/drawingText";
import { advancePlaybackAccumulator, getClampedPlaybackFrameDurationMs } from "../workspace/timelinePlayback";
import type { UnifiedBitmapSymbolDefinitionV2, UnifiedAnimationProjectV2 } from "@/src/lib/animation/unifiedAnimationContractV2";
import type { UnifiedRasterBitmapV2 } from "@/src/lib/animation/unifiedAnimationContentV2";
import { listProjectCollection, type ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import { createBrowserProjectSourceReader } from "@/src/lib/animation/unifiedProjectSourceReader";
import {
  formatExportDuration,
  loadExportProjectSnapshot,
  resolveExportAuthoringTransform,
  resolveExportOwnerCell,
  resolveExportRasterPlacement,
  type ExportRasterPlacement,
  type ExportProjectSnapshot,
} from "@/src/lib/export/exportPhase1";

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

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const loadImage = (definition: UnifiedBitmapSymbolDefinitionV2) => {
  const cached = imageCache.get(definition.definitionDigest);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("symbol_image_failed"));
    image.src = definition.pngDataUrl;
  });
  imageCache.set(definition.definitionDigest, pending);
  return pending;
};

const createBitmapCanvas = (bitmap: UnifiedRasterBitmapV2) => {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.putImageData(new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height), 0, 0);
  return canvas;
};

const drawBitmap = (
  context: CanvasRenderingContext2D,
  placement: ExportRasterPlacement,
  outputWidth: number,
  outputHeight: number,
) => {
  const source = createBitmapCanvas(placement.bitmap);
  const transform = resolveExportAuthoringTransform(
    outputWidth,
    outputHeight,
    placement.referenceWidth,
    placement.referenceHeight,
  );
  context.drawImage(
    source,
    transform.offsetX + placement.x * transform.scaleX,
    transform.offsetY + placement.y * transform.scaleY,
    placement.bitmap.width * transform.scaleX,
    placement.bitmap.height * transform.scaleY,
  );
};

const asDrawingTextObject = (item: Extract<NonNullable<ReturnType<typeof resolveExportOwnerCell>>["content"], object>["items"][number]): DrawingTextObject | null => {
  if (item.kind !== "drawing-text/v1") return null;
  const supported = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New"] as const;
  return {
    id: item.itemId,
    text: item.text,
    x: item.x,
    y: item.y,
    width: item.width,
    flipX: item.flipX,
    flipY: item.flipY,
    rotation: item.rotation,
    fontFamily: supported.includes(item.fontFamily as typeof supported[number]) ? item.fontFamily as typeof supported[number] : "Arial",
    fontSize: item.fontSize,
    color: item.color,
    bold: item.bold,
    italic: item.italic,
  };
};

const renderExportFrame = async (
  canvas: HTMLCanvasElement,
  project: UnifiedAnimationProjectV2,
  frameIndex: number,
) => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  const stage = project.document.logicalStage;
  const scaleX = canvas.width / stage.width;
  const scaleY = canvas.height / stage.height;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  const definitions = new Map(project.document.catalogs.symbols.map(definition => [definition.definitionId, definition]));
  const layers = [...project.document.layers].filter(layer => layer.visible).sort((left, right) => right.orderIndex - left.orderIndex);
  for (const layer of layers) {
    const frame = layer.cells[frameIndex] ?? null;
    const owner = resolveExportOwnerCell(layer, frameIndex);
    if (!frame || !owner?.content) continue;
    const rasterItem = owner.content.items.find(item => item.kind === "drawing-raster/v1");
    const rasterPlacement = rasterItem?.kind === "drawing-raster/v1"
      ? resolveExportRasterPlacement(layer, frameIndex, rasterItem)
      : null;
    const rasterReference = rasterPlacement ?? (rasterItem?.kind === "drawing-raster/v1" && rasterItem.motionTween
      ? {
          referenceWidth: rasterItem.motionTween.stageWidth,
          referenceHeight: rasterItem.motionTween.stageHeight,
        }
      : rasterItem?.kind === "drawing-raster/v1" && rasterItem.bitmap
        ? {
            referenceWidth: rasterItem.bitmap.stageWidth ?? rasterItem.bitmap.width,
            referenceHeight: rasterItem.bitmap.stageHeight ?? rasterItem.bitmap.height,
          }
        : null);
    for (const item of owner.content.items) {
      if (item.kind === "drawing-raster/v1") {
        const placement = item === rasterItem ? rasterPlacement : resolveExportRasterPlacement(layer, frameIndex, item);
        if (placement) {
          context.imageSmoothingEnabled = false;
          drawBitmap(context, placement, canvas.width, canvas.height);
        }
        continue;
      }
      if (item.kind === "drawing-text/v1") {
        const textObject = asDrawingTextObject(item);
        if (textObject) {
          const transform = rasterReference
            ? resolveExportAuthoringTransform(canvas.width, canvas.height, rasterReference.referenceWidth, rasterReference.referenceHeight)
            : { offsetX: 0, offsetY: 0, scaleX, scaleY };
          drawScaledDrawingTextObject(context, textObject, transform);
        }
        continue;
      }
      if (item.kind === "symbol-instance/v1") {
        const definition = definitions.get(item.definitionId);
        if (!definition || definition.definitionDigest !== item.definitionDigest) throw new Error("symbol_definition_missing");
        const image = await loadImage(definition);
        const width = item.width * scaleX;
        const height = item.height * scaleY;
        const x = (item.flipX ? item.x - item.width : item.x) * scaleX;
        const y = (item.flipY ? item.y - item.height : item.y) * scaleY;
        context.save();
        context.imageSmoothingEnabled = true;
        context.translate(x + width / 2, y + height / 2);
        context.rotate((item.rotation * Math.PI) / 180);
        context.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
        continue;
      }
      throw new Error("unsupported_item");
    }
  }
  context.restore();
};

function ExportThumbnail({ snapshot }: { snapshot: ExportProjectSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || snapshot.frameCount === 0) return;
    let active = true;
    void renderExportFrame(canvas, snapshot.project, 0).catch(() => { if (active) setFailed(true); });
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
  const activeAudioRef = useRef<HTMLAudioElement[]>([]);
  const frameIndexRef = useRef(0);

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
    void renderExportFrame(canvas, snapshot.project, frameIndex)
      .then(() => { if (active) setRenderError(false); })
      .catch(() => { if (active) setRenderError(true); });
    return () => { active = false; };
  }, [frameIndex, snapshot]);

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

  useEffect(() => () => stopAudio(), [stopAudio]);
  const changeAnimation = () => { setPlaying(false); stopAudio(); onChange(); };
  const currentSeconds = frameIndex / snapshot.project.document.fps;

  return (
    <main aria-label="Watch saved animation" style={{ minHeight: "100vh", background: "#0d121b", color: "white", padding: 24, overflowY: "auto" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 13, color: "#80b8ff", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Export · Phase 1</div><h1 style={{ margin: "6px 0 0", fontSize: 26 }}>{snapshot.project.title}</h1></div>
          <button type="button" onClick={changeAnimation} style={secondaryButtonStyle}>Change animation</button>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, background: "#171d28", padding: 16 }}>
          <canvas ref={canvasRef} width={960} height={540} aria-label="Selected saved animation" style={{ width: "100%", aspectRatio: "16 / 9", display: "block", background: "white", borderRadius: 10 }} />
          {renderError ? <div role="alert" style={{ color: "#ffb3b3", marginTop: 10 }}>This frame could not be displayed safely.</div> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { if (playing) { setPlaying(false); stopAudio(); } else { if (frameIndex >= snapshot.frameCount - 1) { frameIndexRef.current = 0; setFrameIndex(0); } else { frameIndexRef.current = frameIndex; } setPlaying(true); } }} style={primaryButtonStyle}>{playing ? "Pause" : "Play"}</button>
            <input aria-label="Animation position" type="range" min={0} max={Math.max(0, snapshot.frameCount - 1)} value={frameIndex} onChange={event => { const next = Number(event.target.value); setPlaying(false); stopAudio(); frameIndexRef.current = next; setFrameIndex(next); }} style={{ flex: "1 1 340px" }} />
            <div style={{ minWidth: 155, textAlign: "right", color: "rgba(255,255,255,.68)", fontVariantNumeric: "tabular-nums" }}>{currentSeconds.toFixed(1)}s / {formatExportDuration(snapshot.durationSeconds)} · Frame {frameIndex + 1}/{snapshot.frameCount}</div>
          </div>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 16, background: "rgba(255,255,255,.035)" }}>
          <div style={{ fontWeight: 750 }}>This is the exact saved animation.</div>
          <div style={{ marginTop: 6, color: "rgba(255,255,255,.62)", fontSize: 13 }}>Video file creation, Finder saving, and social-media choices arrive in the next phases.</div>
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
          <div style={{ textAlign: "center" }}><div style={{ color: "#80b8ff", fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Export · Phase 1</div><h1 style={{ margin: "5px 0 0", fontSize: 28 }}>Choose and watch</h1></div>
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
