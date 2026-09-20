import type { ExportProjectSnapshot } from "./exportPhase1";
import {
  EXPORT_DESTINATION_CATALOG_VERSION,
  resolveExportDestinationGeometry,
  type ExportDestinationChoice,
  type ExportDestinationPresetId,
} from "./exportDestinationCatalog.ts";

export const EXPORT_RENDERER_VERSION = "diamond-export-renderer/v1" as const;

export type ExportQualityTier = "720p" | "1080p";
export type ExportOutputTier = ExportQualityTier | "custom";

export const resolveUniformContainTransform = (
  outputWidth: number,
  outputHeight: number,
  sourceWidth: number,
  sourceHeight: number,
) => {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const scale = Math.min(outputWidth / safeSourceWidth, outputHeight / safeSourceHeight);
  const contentWidth = safeSourceWidth * scale;
  const contentHeight = safeSourceHeight * scale;
  return {
    offsetX: (outputWidth - contentWidth) / 2,
    offsetY: (outputHeight - contentHeight) / 2,
    scaleX: scale,
    scaleY: scale,
    contentRect: {
      x: (outputWidth - contentWidth) / 2,
      y: (outputHeight - contentHeight) / 2,
      width: contentWidth,
      height: contentHeight,
    },
  };
};

export const resolveExportRasterTransform = (
  outputWidth: number,
  outputHeight: number,
  referenceWidth: number,
  referenceHeight: number,
  authoringWorldScale: number,
) => {
  const safeReferenceWidth = Math.max(1, referenceWidth);
  const safeReferenceHeight = Math.max(1, referenceHeight);
  const safeWorldScale = Math.max(1, authoringWorldScale);
  const visibleStageWidth = safeReferenceWidth / safeWorldScale;
  const visibleStageHeight = safeReferenceHeight / safeWorldScale;
  const fit = resolveUniformContainTransform(outputWidth, outputHeight, visibleStageWidth, visibleStageHeight);
  return {
    ...fit,
    offsetX: outputWidth / 2 - (safeReferenceWidth / 2) * fit.scaleX,
    offsetY: outputHeight / 2 - (safeReferenceHeight / 2) * fit.scaleY,
  };
};

export type ExportSelectionV1 = {
  schemaVersion: "export-selection/v1";
  selectionId: string;
  projectId: string;
  projectDigest: string;
  title: string;
  savedUpdatedAt: string;
  fps: number;
  authoredFrameCount: number;
  durationMs: number;
};

export type ExportRequestV1 = {
  schemaVersion: "export-request/v1";
  requestId: string;
  selectionId: string;
  projectId: string;
  projectDigest: string;
  sanitizedBaseFilename: string;
  qualityTier: ExportOutputTier;
  destinationPresetId: ExportDestinationPresetId;
  catalogVersion: typeof EXPORT_DESTINATION_CATALOG_VERSION;
  framingMode: "contain-complete-animation";
  sourceStage: { width: number; height: number };
  outputCanvas: { width: number; height: number };
  contentRect: { x: number; y: number; width: number; height: number };
  paddingDescription: string;
  fps: number;
  totalFrames: number;
  durationMs: number;
  container: "mp4";
  videoCodec: "avc";
  audioCodec: "aac" | "none";
  rendererVersion: typeof EXPORT_RENDERER_VERSION;
  encoderVersion: "mediabunny/1.58.1";
};

export type ExportJobStage = "preflighting" | "awaiting-location" | "rendering" | "encoding" | "writing" | "validating" | "succeeded" | "cancelling" | "cancelled" | "failed";

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const sanitizeExportFilename = (raw: string, fallback: string) => {
  const normalize = (value: string) => value.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\:]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  let base = normalize(raw).replace(/\.mp4$/i, "") || normalize(fallback).replace(/\.mp4$/i, "") || "Diamond Animation";
  base = Array.from(base).slice(0, 120).join("");
  if (RESERVED_NAMES.test(base)) base = `Diamond ${base}`;
  return `${base}.mp4`;
};

export const outputDimensionsFor = (snapshot: ExportProjectSnapshot, tier: ExportQualityTier) => {
  const maximumWidth = tier === "720p" ? 1280 : 1920;
  const maximumHeight = tier === "720p" ? 720 : 1080;
  const stage = snapshot.project.document.logicalStage;
  const scale = Math.min(maximumWidth / stage.width, maximumHeight / stage.height);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(stage.width * scale), height: even(stage.height * scale) };
};

export const createExportSelection = (snapshot: ExportProjectSnapshot): ExportSelectionV1 => ({
  schemaVersion: "export-selection/v1",
  selectionId: crypto.randomUUID(),
  projectId: snapshot.project.projectId,
  projectDigest: snapshot.projectDigest,
  title: snapshot.project.title,
  savedUpdatedAt: snapshot.project.updatedAt,
  fps: snapshot.project.document.fps,
  authoredFrameCount: snapshot.frameCount,
  durationMs: Math.round(snapshot.durationSeconds * 1000),
});

export const createExportRequest = (
  snapshot: ExportProjectSnapshot,
  selection: ExportSelectionV1,
  qualityTier: ExportOutputTier,
  filename: string,
  hasAudio: boolean,
  destination: ExportDestinationChoice = { presetId: "original" },
): ExportRequestV1 => {
  const geometry = resolveExportDestinationGeometry(snapshot, destination, qualityTier === "custom" ? "1080p" : qualityTier);
  if (qualityTier === "custom" && geometry.shape !== "custom") throw new Error("export_custom_dimensions_missing");
  if (qualityTier !== "custom" && geometry.shape === "custom") throw new Error("export_custom_quality_required");
  return ({
  schemaVersion: "export-request/v1",
  requestId: crypto.randomUUID(),
  selectionId: selection.selectionId,
  projectId: selection.projectId,
  projectDigest: selection.projectDigest,
  sanitizedBaseFilename: sanitizeExportFilename(filename, selection.title),
  qualityTier,
  destinationPresetId: geometry.preset.id,
  catalogVersion: EXPORT_DESTINATION_CATALOG_VERSION,
  framingMode: "contain-complete-animation",
  sourceStage: { ...snapshot.project.document.logicalStage },
  outputCanvas: geometry.outputCanvas,
  contentRect: geometry.contentRect,
  paddingDescription: geometry.paddingDescription,
  fps: selection.fps,
  totalFrames: selection.authoredFrameCount,
  durationMs: selection.durationMs,
  container: "mp4",
  videoCodec: "avc",
  audioCodec: hasAudio ? "aac" : "none",
  rendererVersion: EXPORT_RENDERER_VERSION,
  encoderVersion: "mediabunny/1.58.1",
  });
};

export const snapshotHasAudio = (snapshot: ExportProjectSnapshot) =>
  snapshot.project.document.layers.some(layer => layer.cells.some(cell => Boolean(cell.content?.soundAttachment?.audioDataUrl)));
