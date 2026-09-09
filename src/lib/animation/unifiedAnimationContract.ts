import { canonicalJsonBytes, sha256CanonicalJson, sha256Hex } from "../drawingProjectV2Canonical.ts";
import type { DrawingTextObjectV2 } from "../drawingProjectV2Contract.ts";
import type { StickFigureFrameContent } from "../../components/workspace/stickfigure/types.ts";
import type { StickAiCreationLatchV1 } from "../stickfigure/stickProjectHistory.ts";

export const UNIFIED_ANIMATION_LIMITS = Object.freeze({
  layers: 64,
  cellsPerLayer: 10_000,
  fps: 55,
  projectStoredBytes: 134_217_728,
  idUtf8Bytes: 128,
  titleUtf8Bytes: 512,
});

export const UNIFIED_ANIMATION_ERROR_CODES = [
  "invalid_record",
  "unsupported_version",
  "asset_missing",
  "asset_digest_mismatch",
  "project_too_large",
  "source_digest_mismatch",
  "invalid_cell_owner",
  "source_space_inconsistent",
] as const;

export type UnifiedAnimationErrorCode = (typeof UNIFIED_ANIMATION_ERROR_CODES)[number];

export class UnifiedAnimationError extends Error {
  readonly code: UnifiedAnimationErrorCode;
  readonly stage: string;

  constructor(code: UnifiedAnimationErrorCode, stage: string, message: string) {
    super(message);
    this.name = "UnifiedAnimationError";
    this.code = code;
    this.stage = stage;
  }
}

export type UnifiedAnimationAssetManifestV1 =
  | {
      assetId: string;
      kind: "drawing-raster-rgba";
      width: number;
      height: number;
      byteLength: number;
      sha256: string;
      rgbaByteLength: number;
      rgbaSha256: string;
    }
  | {
      assetId: string;
      kind: "drawing-raster-png";
      width: number;
      height: number;
      byteLength: number;
      sha256: string;
      rgbaByteLength: number;
      rgbaSha256: string;
    }
  | {
      assetId: string;
      kind: "drawing-audio-wav";
      mimeType: "audio/wav";
      byteLength: number;
      sha256: string;
    };

export type UnifiedAnimationResolvedAssetV1 = {
  assetId: string;
  bytes: Uint8Array;
};

export type UnifiedDrawingMotionTweenV1 = {
  mode: "position";
  stageWidth: number;
  stageHeight: number;
  spriteAssetId: string | null;
  startOrigin: { x: number; y: number } | null;
  endOrigin: { x: number; y: number } | null;
};

export type UnifiedDrawingSoundAttachmentV1 = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioAssetId: string | null;
  contentType: "sfx" | "voice-placeholder";
  speechText: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

export type UnifiedDrawingCellPayloadV1 = {
  bitmapAssetId: string | null;
  tweenEndAssetId: string | null;
  motionTween: UnifiedDrawingMotionTweenV1 | null;
  soundAttachment: UnifiedDrawingSoundAttachmentV1 | null;
  textObjects: DrawingTextObjectV2[];
};

export type UnifiedAnimationCellV1 = {
  cellId: string;
  sourceCellId: string;
  sourceStateId: number;
  kind: "frame" | "keyframe" | "tween";
  cellType: "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";
  ownerCellId: string | null;
  payload: UnifiedDrawingCellPayloadV1 | StickFigureFrameContent | null;
};

export type UnifiedAnimationSourceDisplayTransformV1 = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: 1920;
  targetHeight: 1080;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type UnifiedAnimationLayerV1 = {
  layerId: string;
  sourceLayerId: string;
  sourceOrderIndex: number;
  name: string;
  orderIndex: number;
  visible: boolean;
  locked: boolean;
  contentKind: "drawing/v1" | "stick-rig/v1";
  sourceDisplayTransform: UnifiedAnimationSourceDisplayTransformV1 | null;
  cells: UnifiedAnimationCellV1[];
};

export type UnifiedAnimationDocumentV1 = {
  kind: "diamond-animation-document";
  schemaVersion: 1;
  projectId: string;
  logicalStage: {
    width: 1920;
    height: 1080;
    origin: "top-left";
    xAxis: "right";
    yAxis: "down";
  };
  fps: number;
  layers: UnifiedAnimationLayerV1[];
  drawingState: null | {
    activeTool: "Select" | "Lasso" | "Brush" | "Eraser" | "Fill" | "Text" | "Shape" | "Knife";
    brushSize: number;
    eraserSize: number;
    fillColor: string;
    shapeType: "Square" | "Triangle" | "Circle";
    nextTimelineFrameId: number;
    nextLayerNumber: number;
  };
  stickState: null | {
    documentRevision: number;
    nextFrameId: number;
    nextStateId: number;
    nextLayerNumber: number;
  };
  reopenState: {
    activeLayerId: string;
    activeCellId: string;
    currentFrameIndex: number;
    selectedTimelineIndex: number;
    onionEnabled: boolean;
    activeTool: string | null;
    activePanel: null;
    camera: null;
  };
};

export type UnifiedAnimationProjectV1 = {
  kind: "diamond-animation-project";
  schemaVersion: 1;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceRevision: number;
  documentDigest: string;
  candidateDigest: string;
  provenance: {
    migrationVersion: 1;
    sourceKind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2";
    sourceProjectId: string;
    sourceRecordDigest: string;
    importedAt: null;
  };
  document: UnifiedAnimationDocumentV1;
  assets: UnifiedAnimationAssetManifestV1[];
  auxiliary: {
    drawingAiMemory: unknown | null;
    stickAiCreationLatch: StickAiCreationLatchV1 | null;
  };
};

export type UnifiedAnimationMigrationCandidateV1 = {
  project: UnifiedAnimationProjectV1;
  resolvedAssets: UnifiedAnimationResolvedAssetV1[];
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const fail = (code: UnifiedAnimationErrorCode, stage: string, message: string): never => {
  throw new UnifiedAnimationError(code, stage, message);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const exact = (value: unknown, keys: readonly string[], stage: string) => {
  if (!isRecord(value)) fail("invalid_record", stage, `${stage} must be a plain object.`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid_record", stage, `${stage} has unknown or missing fields.`);
  }
  return record;
};

const canonicalString = (
  value: unknown,
  stage: string,
  maxBytes: number = UNIFIED_ANIMATION_LIMITS.idUtf8Bytes,
): string => {
  if (typeof value !== "string" || value.normalize("NFC") !== value || new TextEncoder().encode(value).byteLength > maxBytes) {
    fail("invalid_record", stage, `${stage} must be bounded NFC text.`);
  }
  const stringValue = value as string;
  for (let index = 0; index < stringValue.length; index += 1) {
    const code = stringValue.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = stringValue.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail("invalid_record", stage, `${stage} has a lone surrogate.`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) fail("invalid_record", stage, `${stage} has a lone surrogate.`);
  }
  return stringValue;
};

const finite = (value: unknown, stage: string, minimum?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0) || (minimum !== undefined && value < minimum)) {
    fail("invalid_record", stage, `${stage} must be finite and may not be negative zero.`);
  }
  return value as number;
};

const integer = (value: unknown, stage: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) fail("invalid_record", stage, `${stage} must be a safe integer.`);
  return Number(value);
};

const id = (value: unknown, stage: string) => {
  const parsed = canonicalString(value, stage);
  if (!UUID_V4.test(parsed)) fail("invalid_record", stage, `${stage} must be a lowercase UUID v4.`);
  return parsed;
};

const sha = (value: unknown, stage: string) => {
  if (typeof value !== "string" || !SHA256.test(value)) fail("invalid_record", stage, `${stage} must be lowercase SHA-256.`);
  return value;
};

const timestamp = (value: unknown, stage: string) => {
  const parsed = canonicalString(value, stage, 64);
  if (!UTC_ISO.test(parsed) || Number.isNaN(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) {
    fail("invalid_record", stage, `${stage} must be canonical UTC ISO-8601.`);
  }
  return parsed;
};

const assertCanonicalPlainValue = (value: unknown, stage: string, seen = new Set<object>()): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string") canonicalString(value, stage, 4_194_304);
    return;
  }
  if (typeof value === "number") {
    finite(value, stage);
    return;
  }
  if (typeof value !== "object" || value === undefined || value instanceof Blob || value instanceof Date || value instanceof Map || value instanceof Set) {
    fail("invalid_record", stage, `${stage} is not canonical plain data.`);
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) fail("invalid_record", stage, `${stage} is cyclic.`);
  seen.add(objectValue);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCanonicalPlainValue(entry, `${stage}[${index}]`, seen));
  } else {
    if (!isRecord(value)) fail("invalid_record", stage, `${stage} is not a plain object.`);
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      canonicalString(key, `${stage}.key`, 1024);
      if (entry === undefined) fail("invalid_record", `${stage}.${key}`, "Undefined is not canonical.");
      assertCanonicalPlainValue(entry, `${stage}.${key}`, seen);
    });
  }
  seen.delete(objectValue);
};

const parseTransform = (value: unknown, stage: string) => {
  if (value === null) return;
  const record = exact(value, ["sourceWidth", "sourceHeight", "targetWidth", "targetHeight", "scale", "offsetX", "offsetY"], stage);
  integer(record.sourceWidth, `${stage}.sourceWidth`, 1);
  integer(record.sourceHeight, `${stage}.sourceHeight`, 1);
  if (record.targetWidth !== 1920 || record.targetHeight !== 1080) fail("invalid_record", stage, "Display target must be the canonical stage.");
  finite(record.scale, `${stage}.scale`, 0);
  finite(record.offsetX, `${stage}.offsetX`);
  finite(record.offsetY, `${stage}.offsetY`);
};

const recordAssetReference = (references: Map<string, "raster" | "audio">, assetId: string, kind: "raster" | "audio", stage: string) => {
  const previous = references.get(assetId);
  if (previous && previous !== kind) fail("invalid_record", stage, "Asset is referenced with conflicting kinds.");
  references.set(assetId, kind);
};

const parseDrawingPayload = (value: unknown, stage: string, referencedAssets: Map<string, "raster" | "audio">) => {
  const payload = exact(value, ["bitmapAssetId", "tweenEndAssetId", "motionTween", "soundAttachment", "textObjects"], stage);
  for (const name of ["bitmapAssetId", "tweenEndAssetId"] as const) {
    if (payload[name] !== null) recordAssetReference(referencedAssets, canonicalString(payload[name], `${stage}.${name}`), "raster", `${stage}.${name}`);
  }
  if (payload.motionTween !== null) {
    const tween = exact(payload.motionTween, ["mode", "stageWidth", "stageHeight", "spriteAssetId", "startOrigin", "endOrigin"], `${stage}.motionTween`);
    if (tween.mode !== "position") fail("unsupported_version", `${stage}.motionTween.mode`, "Unsupported Drawing tween.");
    integer(tween.stageWidth, `${stage}.motionTween.stageWidth`, 1);
    integer(tween.stageHeight, `${stage}.motionTween.stageHeight`, 1);
    if (tween.spriteAssetId !== null) recordAssetReference(referencedAssets, canonicalString(tween.spriteAssetId, `${stage}.motionTween.spriteAssetId`), "raster", `${stage}.motionTween.spriteAssetId`);
    for (const name of ["startOrigin", "endOrigin"] as const) {
      if (tween[name] === null) continue;
      const origin = exact(tween[name], ["x", "y"], `${stage}.motionTween.${name}`);
      finite(origin.x, `${stage}.motionTween.${name}.x`);
      finite(origin.y, `${stage}.motionTween.${name}.y`);
    }
  }
  if (payload.soundAttachment !== null) {
    const sound = exact(payload.soundAttachment, ["id", "title", "description", "timingFeel", "intensityFeel", "audioAssetId", "contentType", "speechText", "sourceTask", "attachedAt"], `${stage}.soundAttachment`);
    canonicalString(sound.id, `${stage}.soundAttachment.id`);
    canonicalString(sound.title, `${stage}.soundAttachment.title`, 4096);
    canonicalString(sound.description, `${stage}.soundAttachment.description`, 16_384);
    if (sound.audioAssetId !== null) recordAssetReference(referencedAssets, canonicalString(sound.audioAssetId, `${stage}.soundAttachment.audioAssetId`), "audio", `${stage}.soundAttachment.audioAssetId`);
    if (sound.contentType !== "sfx" && sound.contentType !== "voice-placeholder") fail("unsupported_version", `${stage}.soundAttachment.contentType`, "Unsupported sound type.");
    if (sound.sourceTask !== "generate-sounds") fail("unsupported_version", `${stage}.soundAttachment.sourceTask`, "Unsupported sound source.");
    timestamp(sound.attachedAt, `${stage}.soundAttachment.attachedAt`);
  }
  if (!Array.isArray(payload.textObjects)) fail("invalid_record", `${stage}.textObjects`, "Text objects must be an array.");
  assertCanonicalPlainValue(payload.textObjects, `${stage}.textObjects`);
};

const parseStickPayload = (value: unknown, stage: string) => {
  const payload = exact(value, ["figures", "structureGraph"], stage);
  if (!Array.isArray(payload.figures)) fail("invalid_record", `${stage}.figures`, "Figures must be an array.");
  const graph = exact(payload.structureGraph, ["activeJointId", "joints", "limbs"], `${stage}.structureGraph`);
  if (!Array.isArray(graph.joints) || !Array.isArray(graph.limbs)) fail("invalid_record", `${stage}.structureGraph`, "Graph arrays are required.");
  assertCanonicalPlainValue(value, stage);
  const figures = payload.figures as unknown[];
  const joints = graph.joints as unknown[];
  const limbs = graph.limbs as unknown[];
  const figureIds = new Set<string>();
  figures.forEach((entry, index) => {
    const figure = exact(entry, ["id", "name", "x", "y", "scale", "rotation"], `${stage}.figures[${index}]`);
    const figureId = canonicalString(figure.id, `${stage}.figures[${index}].id`);
    if (figureIds.has(figureId)) fail("invalid_record", `${stage}.figures`, "Duplicate figure ID.");
    figureIds.add(figureId);
    canonicalString(figure.name, `${stage}.figures[${index}].name`, 4096);
    finite(figure.x, `${stage}.figures[${index}].x`);
    finite(figure.y, `${stage}.figures[${index}].y`);
    finite(figure.scale, `${stage}.figures[${index}].scale`, 0);
    finite(figure.rotation, `${stage}.figures[${index}].rotation`);
  });
  const jointIds = new Set<string>();
  joints.forEach((entry, index) => {
    const joint = exact(entry, ["id", "x", "y"], `${stage}.structureGraph.joints[${index}]`);
    const jointId = canonicalString(joint.id, `${stage}.structureGraph.joints[${index}].id`);
    if (jointIds.has(jointId)) fail("invalid_record", `${stage}.structureGraph.joints`, "Duplicate joint ID.");
    jointIds.add(jointId);
    finite(joint.x, `${stage}.structureGraph.joints[${index}].x`);
    finite(joint.y, `${stage}.structureGraph.joints[${index}].y`);
  });
  limbs.forEach((entry, index) => {
    const limb = exact(entry, ["id", "startJointId", "endJointId"], `${stage}.structureGraph.limbs[${index}]`);
    canonicalString(limb.id, `${stage}.structureGraph.limbs[${index}].id`);
    if (!jointIds.has(String(limb.startJointId)) || !jointIds.has(String(limb.endJointId))) {
      fail("invalid_record", `${stage}.structureGraph.limbs[${index}]`, "Limb endpoint is missing.");
    }
  });
  if (graph.activeJointId !== null && !jointIds.has(String(graph.activeJointId))) fail("invalid_record", `${stage}.structureGraph.activeJointId`, "Active joint is missing.");
};

const parseAsset = (value: unknown, stage: string) => {
  if (!isRecord(value)) fail("invalid_record", stage, "Asset must be an object.");
  const kind = (value as Record<string, unknown>).kind;
  if (kind === "drawing-raster-rgba" || kind === "drawing-raster-png") {
    const asset = exact(value, ["assetId", "kind", "width", "height", "byteLength", "sha256", "rgbaByteLength", "rgbaSha256"], stage);
    canonicalString(asset.assetId, `${stage}.assetId`);
    const width = integer(asset.width, `${stage}.width`, 1);
    const height = integer(asset.height, `${stage}.height`, 1);
    const rgbaByteLength = integer(asset.rgbaByteLength, `${stage}.rgbaByteLength`, 1);
    if (width * height * 4 !== rgbaByteLength) fail("invalid_record", stage, "Raster dimensions and RGBA length disagree.");
    const byteLength = integer(asset.byteLength, `${stage}.byteLength`, 1);
    if (kind === "drawing-raster-rgba" && byteLength !== rgbaByteLength) fail("invalid_record", stage, "Raw RGBA byte length mismatch.");
    sha(asset.sha256, `${stage}.sha256`);
    sha(asset.rgbaSha256, `${stage}.rgbaSha256`);
    if (kind === "drawing-raster-rgba" && asset.sha256 !== asset.rgbaSha256) fail("invalid_record", stage, "Raw RGBA digests must match.");
    const expectedId = kind === "drawing-raster-rgba" ? `raster-rgba-${asset.sha256}` : `raster-png-${asset.sha256}`;
    if (asset.assetId !== expectedId) fail("invalid_record", `${stage}.assetId`, "Raster asset ID is not content-addressed.");
    return;
  }
  if (kind === "drawing-audio-wav") {
    const asset = exact(value, ["assetId", "kind", "mimeType", "byteLength", "sha256"], stage);
    canonicalString(asset.assetId, `${stage}.assetId`);
    if (asset.mimeType !== "audio/wav") fail("unsupported_version", `${stage}.mimeType`, "Unsupported audio MIME.");
    integer(asset.byteLength, `${stage}.byteLength`, 1);
    sha(asset.sha256, `${stage}.sha256`);
    if (asset.assetId !== `audio-${asset.sha256}`) fail("invalid_record", `${stage}.assetId`, "Audio asset ID is not content-addressed.");
    return;
  }
  fail("unsupported_version", `${stage}.kind`, "Unsupported asset kind.");
};

export const parseUnifiedAnimationProjectV1 = (value: unknown): UnifiedAnimationProjectV1 => {
  assertCanonicalPlainValue(value, "project");
  const project = exact(value, ["kind", "schemaVersion", "projectId", "title", "createdAt", "updatedAt", "sourceRevision", "documentDigest", "candidateDigest", "provenance", "document", "assets", "auxiliary"], "project");
  if (project.kind !== "diamond-animation-project") fail("invalid_record", "project.kind", "Unsupported project kind.");
  if (project.schemaVersion !== 1) fail("unsupported_version", "project.schemaVersion", "Unsupported project version.");
  const projectId = id(project.projectId, "project.projectId");
  canonicalString(project.title, "project.title", UNIFIED_ANIMATION_LIMITS.titleUtf8Bytes);
  timestamp(project.createdAt, "project.createdAt");
  timestamp(project.updatedAt, "project.updatedAt");
  integer(project.sourceRevision, "project.sourceRevision");
  sha(project.documentDigest, "project.documentDigest");
  sha(project.candidateDigest, "project.candidateDigest");
  const provenance = exact(project.provenance, ["migrationVersion", "sourceKind", "sourceProjectId", "sourceRecordDigest", "importedAt"], "project.provenance");
  if (provenance.migrationVersion !== 1 || !["drawing-v1", "drawing-v2", "stick-v1", "stick-v2"].includes(String(provenance.sourceKind))) {
    fail("unsupported_version", "project.provenance", "Unsupported migration provenance.");
  }
  canonicalString(provenance.sourceProjectId, "project.provenance.sourceProjectId");
  sha(provenance.sourceRecordDigest, "project.provenance.sourceRecordDigest");
  if (provenance.importedAt !== null) fail("invalid_record", "project.provenance.importedAt", "Read-only migration candidates are not imported.");

  const document = exact(project.document, ["kind", "schemaVersion", "projectId", "logicalStage", "fps", "layers", "drawingState", "stickState", "reopenState"], "project.document");
  if (document.kind !== "diamond-animation-document" || document.schemaVersion !== 1 || document.projectId !== projectId) {
    fail("invalid_record", "project.document", "Document identity/version mismatch.");
  }
  const stage = exact(document.logicalStage, ["width", "height", "origin", "xAxis", "yAxis"], "project.document.logicalStage");
  if (stage.width !== 1920 || stage.height !== 1080 || stage.origin !== "top-left" || stage.xAxis !== "right" || stage.yAxis !== "down") {
    fail("invalid_record", "project.document.logicalStage", "Canonical stage mismatch.");
  }
  const fps = integer(document.fps, "project.document.fps", 1);
  if (fps > UNIFIED_ANIMATION_LIMITS.fps) fail("project_too_large", "project.document.fps", "FPS exceeds the contract.");
  if (!Array.isArray(document.layers) || document.layers.length < 1 || document.layers.length > UNIFIED_ANIMATION_LIMITS.layers) {
    fail("project_too_large", "project.document.layers", "Layer count is outside the contract.");
  }

  const referencedAssets = new Map<string, "raster" | "audio">();
  const layerIds = new Set<string>();
  const cellIds = new Set<string>();
  const cellLayerIds = new Map<string, string>();
  const orders = new Set<number>();
  (document.layers as unknown[]).forEach((layerValue, layerIndex) => {
    const layerStage = `project.document.layers[${layerIndex}]`;
    const layer = exact(layerValue, ["layerId", "sourceLayerId", "sourceOrderIndex", "name", "orderIndex", "visible", "locked", "contentKind", "sourceDisplayTransform", "cells"], layerStage);
    const layerId = id(layer.layerId, `${layerStage}.layerId`);
    if (layerIds.has(layerId)) fail("invalid_record", `${layerStage}.layerId`, "Duplicate layer ID.");
    layerIds.add(layerId);
    canonicalString(layer.sourceLayerId, `${layerStage}.sourceLayerId`);
    integer(layer.sourceOrderIndex, `${layerStage}.sourceOrderIndex`);
    canonicalString(layer.name, `${layerStage}.name`, 4096);
    const order = integer(layer.orderIndex, `${layerStage}.orderIndex`);
    if (orders.has(order) || order !== layerIndex) fail("invalid_record", `${layerStage}.orderIndex`, "Layer order must be contiguous and unique.");
    orders.add(order);
    if (typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") fail("invalid_record", layerStage, "Layer visibility/lock must be boolean.");
    if (layer.contentKind !== "drawing/v1" && layer.contentKind !== "stick-rig/v1") fail("unsupported_version", `${layerStage}.contentKind`, "Unsupported layer kind.");
    parseTransform(layer.sourceDisplayTransform, `${layerStage}.sourceDisplayTransform`);
    if ((layer.contentKind === "drawing/v1") !== (layer.sourceDisplayTransform !== null)) fail("invalid_record", layerStage, "Only Drawing layers require a source transform.");
    if (!Array.isArray(layer.cells) || layer.cells.length < 1 || layer.cells.length > UNIFIED_ANIMATION_LIMITS.cellsPerLayer) {
      fail("project_too_large", `${layerStage}.cells`, "Cell count is outside the contract.");
    }
    const ownerByState = new Map<number, { cellId: string; index: number }>();
    (layer.cells as unknown[]).forEach((cellValue, cellIndex) => {
      const cellStage = `${layerStage}.cells[${cellIndex}]`;
      const cell = exact(cellValue, ["cellId", "sourceCellId", "sourceStateId", "kind", "cellType", "ownerCellId", "payload"], cellStage);
      const cellId = id(cell.cellId, `${cellStage}.cellId`);
      if (cellIds.has(cellId)) fail("invalid_record", `${cellStage}.cellId`, "Duplicate cell ID.");
      cellIds.add(cellId);
      cellLayerIds.set(cellId, layerId);
      canonicalString(cell.sourceCellId, `${cellStage}.sourceCellId`);
      const sourceStateId = integer(cell.sourceStateId, `${cellStage}.sourceStateId`);
      if (!["frame", "keyframe", "tween"].includes(String(cell.kind)) || !["empty", "keyframe", "blank-keyframe", "hold", "tween"].includes(String(cell.cellType))) {
        fail("unsupported_version", cellStage, "Unsupported cell kind/type.");
      }
      if (cell.cellType === "empty") {
        if (cell.ownerCellId !== null || cell.payload !== null) fail("invalid_cell_owner", cellStage, "Empty cells cannot own payload.");
      } else if (cell.cellType === "hold") {
        const owner = ownerByState.get(sourceStateId);
        if (!owner || owner.index >= cellIndex || cell.ownerCellId !== owner.cellId || cell.payload !== null) {
          fail("invalid_cell_owner", cellStage, "Hold must name its earlier same-state owner.");
        }
      } else {
        if (cell.ownerCellId !== cellId || cell.payload === null) fail("invalid_cell_owner", cellStage, "Owner cells must own their payload.");
        if (ownerByState.has(sourceStateId)) fail("invalid_cell_owner", cellStage, "State has multiple owners.");
        ownerByState.set(sourceStateId, { cellId, index: cellIndex });
        if (layer.contentKind === "drawing/v1") parseDrawingPayload(cell.payload, `${cellStage}.payload`, referencedAssets);
        else parseStickPayload(cell.payload, `${cellStage}.payload`);
      }
    });
  });

  if ((document.drawingState === null) === (document.layers as UnifiedAnimationLayerV1[]).some((layer) => layer.contentKind === "drawing/v1")) {
    fail("invalid_record", "project.document.drawingState", "Drawing state presence mismatch.");
  }
  if ((document.stickState === null) === (document.layers as UnifiedAnimationLayerV1[]).some((layer) => layer.contentKind === "stick-rig/v1")) {
    fail("invalid_record", "project.document.stickState", "Stick state presence mismatch.");
  }
  if (document.drawingState !== null) {
    const state = exact(document.drawingState, ["activeTool", "brushSize", "eraserSize", "fillColor", "shapeType", "nextTimelineFrameId", "nextLayerNumber"], "project.document.drawingState");
    if (!["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"].includes(String(state.activeTool))) fail("unsupported_version", "project.document.drawingState.activeTool", "Unsupported Drawing tool.");
    finite(state.brushSize, "project.document.drawingState.brushSize", 0);
    finite(state.eraserSize, "project.document.drawingState.eraserSize", 0);
    canonicalString(state.fillColor, "project.document.drawingState.fillColor", 4096);
    if (!["Square", "Triangle", "Circle"].includes(String(state.shapeType))) fail("unsupported_version", "project.document.drawingState.shapeType", "Unsupported Drawing shape.");
    integer(state.nextTimelineFrameId, "project.document.drawingState.nextTimelineFrameId", 1);
    integer(state.nextLayerNumber, "project.document.drawingState.nextLayerNumber", 1);
  }
  if (document.stickState !== null) {
    const state = exact(document.stickState, ["documentRevision", "nextFrameId", "nextStateId", "nextLayerNumber"], "project.document.stickState");
    integer(state.documentRevision, "project.document.stickState.documentRevision");
    integer(state.nextFrameId, "project.document.stickState.nextFrameId", 1);
    integer(state.nextStateId, "project.document.stickState.nextStateId", 1);
    integer(state.nextLayerNumber, "project.document.stickState.nextLayerNumber", 1);
  }
  const reopen = exact(document.reopenState, ["activeLayerId", "activeCellId", "currentFrameIndex", "selectedTimelineIndex", "onionEnabled", "activeTool", "activePanel", "camera"], "project.document.reopenState");
  if (!layerIds.has(String(reopen.activeLayerId)) || !cellIds.has(String(reopen.activeCellId)) || cellLayerIds.get(String(reopen.activeCellId)) !== reopen.activeLayerId) fail("invalid_record", "project.document.reopenState", "Reopen selection is dangling or cross-layer.");
  integer(reopen.currentFrameIndex, "project.document.reopenState.currentFrameIndex");
  integer(reopen.selectedTimelineIndex, "project.document.reopenState.selectedTimelineIndex");
  if (typeof reopen.onionEnabled !== "boolean" || reopen.activePanel !== null || reopen.camera !== null) fail("invalid_record", "project.document.reopenState", "Invalid reopen state.");
  if (reopen.activeTool !== null) canonicalString(reopen.activeTool, "project.document.reopenState.activeTool");

  if (!Array.isArray(project.assets)) fail("invalid_record", "project.assets", "Assets must be an array.");
  const assetIds = new Set<string>();
  const assetKinds = new Map<string, "raster" | "audio">();
  (project.assets as unknown[]).forEach((assetValue, assetIndex) => {
    parseAsset(assetValue, `project.assets[${assetIndex}]`);
    const assetId = String((assetValue as { assetId: unknown }).assetId);
    if (assetIds.has(assetId)) fail("invalid_record", "project.assets", "Duplicate asset ID.");
    assetIds.add(assetId);
    assetKinds.set(assetId, (assetValue as { kind: string }).kind === "drawing-audio-wav" ? "audio" : "raster");
  });
  for (const [assetId, kind] of referencedAssets) {
    if (!assetIds.has(assetId)) fail("asset_missing", "project.assets", `Missing asset ${assetId}.`);
    if (assetKinds.get(assetId) !== kind) fail("invalid_record", "project.assets", `Asset ${assetId} has the wrong kind.`);
  }
  for (const assetId of assetIds) if (!referencedAssets.has(assetId)) fail("invalid_record", "project.assets", `Unreferenced asset ${assetId}.`);

  const auxiliary = exact(project.auxiliary, ["drawingAiMemory", "stickAiCreationLatch"], "project.auxiliary");
  assertCanonicalPlainValue(auxiliary.drawingAiMemory, "project.auxiliary.drawingAiMemory");
  if (auxiliary.stickAiCreationLatch !== null) {
    const latch = exact(auxiliary.stickAiCreationLatch, ["latchVersion", "projectId", "status"], "project.auxiliary.stickAiCreationLatch");
    if (latch.latchVersion !== 1 || latch.projectId !== projectId || !["unconsumed", "consumed"].includes(String(latch.status))) {
      fail("invalid_record", "project.auxiliary.stickAiCreationLatch", "Invalid rebound Stick latch.");
    }
  }

  if (canonicalJsonBytes(value).byteLength > UNIFIED_ANIMATION_LIMITS.projectStoredBytes) {
    fail("project_too_large", "project", "Canonical project exceeds the stored-byte limit.");
  }
  return value as UnifiedAnimationProjectV1;
};

export const digestUnifiedAnimationDocumentV1 = (
  document: UnifiedAnimationDocumentV1,
  assets: readonly UnifiedAnimationAssetManifestV1[],
) => sha256CanonicalJson({ document, assets: [...assets].sort((left, right) => left.assetId.localeCompare(right.assetId)) });

export const digestUnifiedAnimationCandidateV1 = (project: Omit<UnifiedAnimationProjectV1, "candidateDigest">) => sha256CanonicalJson({
  projectId: project.projectId,
  title: project.title,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  sourceRevision: project.sourceRevision,
  documentDigest: project.documentDigest,
  provenance: project.provenance,
  auxiliary: project.auxiliary,
});

export const validateUnifiedAnimationCandidateV1 = async (
  candidate: UnifiedAnimationMigrationCandidateV1,
): Promise<UnifiedAnimationMigrationCandidateV1> => {
  const project = parseUnifiedAnimationProjectV1(candidate.project);
  const resolved = new Map<string, Uint8Array>();
  for (const [index, asset] of candidate.resolvedAssets.entries()) {
    const record = exact(asset, ["assetId", "bytes"], `candidate.resolvedAssets[${index}]`);
    const assetId = canonicalString(record.assetId, `candidate.resolvedAssets[${index}].assetId`);
    if (!(record.bytes instanceof Uint8Array)) fail("invalid_record", `candidate.resolvedAssets[${index}].bytes`, "Resolved bytes must be Uint8Array.");
    const bytes = record.bytes as Uint8Array;
    if (resolved.has(assetId)) fail("invalid_record", "candidate.resolvedAssets", "Duplicate resolved asset.");
    resolved.set(assetId, bytes.slice());
  }
  for (const manifest of project.assets) {
    const resolvedBytes = resolved.get(manifest.assetId);
    if (!resolvedBytes) fail("asset_missing", "candidate.resolvedAssets", `Missing resolved asset ${manifest.assetId}.`);
    const bytes = resolvedBytes as Uint8Array;
    if (bytes.byteLength !== manifest.byteLength || await sha256Hex(bytes) !== manifest.sha256) {
      fail("asset_digest_mismatch", `candidate.resolvedAssets.${manifest.assetId}`, "Resolved asset bytes do not match the manifest.");
    }
  }
  if (resolved.size !== project.assets.length) fail("invalid_record", "candidate.resolvedAssets", "Resolved assets include unreferenced bytes.");
  const digest = await digestUnifiedAnimationDocumentV1(project.document, project.assets);
  if (digest !== project.documentDigest) fail("source_digest_mismatch", "project.documentDigest", "Canonical document digest mismatch.");
  const candidateFields: Omit<UnifiedAnimationProjectV1, "candidateDigest"> = {
    kind: project.kind,
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    sourceRevision: project.sourceRevision,
    documentDigest: project.documentDigest,
    provenance: project.provenance,
    document: project.document,
    assets: project.assets,
    auxiliary: project.auxiliary,
  };
  if (await digestUnifiedAnimationCandidateV1(candidateFields) !== project.candidateDigest) {
    fail("source_digest_mismatch", "project.candidateDigest", "Canonical candidate binding mismatch.");
  }
  const expectedProjectId = await deterministicUnifiedUuidV4(`diamond-animation-project/v1:${project.provenance.sourceKind}:${project.provenance.sourceProjectId}:${project.provenance.sourceRecordDigest}`);
  if (expectedProjectId !== project.projectId) fail("source_digest_mismatch", "project.projectId", "Canonical project identity is not bound to its source.");
  return { project, resolvedAssets: candidate.resolvedAssets.map((asset) => ({ assetId: asset.assetId, bytes: asset.bytes.slice() })) };
};

export const deterministicUnifiedUuidV4 = async (label: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(label)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
