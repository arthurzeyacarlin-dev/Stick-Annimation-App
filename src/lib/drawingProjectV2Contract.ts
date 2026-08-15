export const DRAWING_PROJECT_V2_LIMITS = Object.freeze({
  projectStoredBytes: 134_217_728,
  collectionStoredBytes: 536_870_912,
  projectCount: 64,
  projectHydratedRgbaBytes: 536_870_912,
  rasterRgbaBytes: 268_435_456,
  rasterDimension: 16_384,
  audioBytes: 33_554_432,
  audioBase64Characters: 44_739_244,
  idUtf8Bytes: 128,
});

export const DRAWING_PROJECT_V2_ERROR_CODES = Object.freeze([
  "invalid_record",
  "unsupported_version",
  "legacy_corrupt",
  "legacy_read_failed",
  "asset_missing",
  "asset_digest_mismatch",
  "invalid_png",
  "unsupported_png",
  "encode_failed",
  "decode_failed",
  "project_too_large",
  "collection_too_large",
  "project_limit_reached",
  "quota_exceeded",
  "storage_read_failed",
  "storage_write_failed",
  "transaction_aborted",
  "stale_revision",
  "candidate_readback_mismatch",
  "id_collision",
  "project_not_found",
  "maintenance_required",
] as const);

export type DrawingProjectV2ErrorCode = (typeof DRAWING_PROJECT_V2_ERROR_CODES)[number];

const DRAWING_PROJECT_V2_ERROR_CODE_SET = new Set<string>(DRAWING_PROJECT_V2_ERROR_CODES);

export const DRAWING_PROJECT_DELETE_FAILED_CODES = Object.freeze([
  "project_not_found",
  "legacy_corrupt",
  "legacy_read_failed",
  "storage_read_failed",
  "storage_write_failed",
  "transaction_aborted",
  "stale_revision",
] as const);

export type DrawingProjectDeleteFailedCode = (typeof DRAWING_PROJECT_DELETE_FAILED_CODES)[number];

const DRAWING_PROJECT_DELETE_FAILED_CODE_SET = new Set<string>(DRAWING_PROJECT_DELETE_FAILED_CODES);

export class DrawingProjectV2Error extends Error {
  readonly code: DrawingProjectV2ErrorCode;
  readonly stage: string;

  constructor(code: DrawingProjectV2ErrorCode, stage: string, message: string) {
    super(message);
    if (!DRAWING_PROJECT_V2_ERROR_CODE_SET.has(code)) throw new TypeError("Unknown Drawing project error code.");
    this.name = "DrawingProjectV2Error";
    this.code = code;
    this.stage = stage;
  }
}

export const parseDrawingProjectV2ErrorCode = (value: unknown): DrawingProjectV2ErrorCode => {
  if (typeof value === "string" && DRAWING_PROJECT_V2_ERROR_CODE_SET.has(value)) return value as DrawingProjectV2ErrorCode;
  throw new DrawingProjectV2Error("invalid_record", "error.code", "Unknown Drawing project error code.");
};

export const parseDrawingProjectDeleteFailedCode = (value: unknown): DrawingProjectDeleteFailedCode => {
  if (typeof value === "string" && DRAWING_PROJECT_DELETE_FAILED_CODE_SET.has(value)) return value as DrawingProjectDeleteFailedCode;
  throw new DrawingProjectV2Error("invalid_record", "delete.error.code", "Unknown Drawing project Delete error code.");
};

export type DrawingProjectAssetReferenceV2 = { assetId: string };

export type DrawingProjectRasterAssetV2 = {
  assetId: string;
  kind: "raster-png";
  width: number;
  height: number;
  rgbaByteLength: number;
  rgbaSha256: string;
  encodedByteLength: number;
  encodedSha256: string;
  bytes: Blob;
};

export type DrawingProjectAudioAssetV2 = {
  assetId: string;
  kind: "audio";
  mimeType: "audio/wav";
  byteLength: number;
  sha256: string;
  bytes: Blob;
};

export type DrawingProjectAssetV2 = DrawingProjectRasterAssetV2 | DrawingProjectAudioAssetV2;

export type DrawingSoundAttachmentV2 = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl: DrawingProjectAssetReferenceV2 | null;
  contentType: "sfx" | "voice-placeholder";
  speechText: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

export type DrawingTextObjectV2 = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  fontFamily: "Arial" | "Verdana" | "Georgia" | "Times New Roman" | "Courier New";
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

export type DrawingMotionTweenV2 = {
  mode: "position";
  stageWidth: number;
  stageHeight: number;
  spriteBitmap: DrawingProjectAssetReferenceV2 | null;
  startOrigin: { x: number; y: number } | null;
  endOrigin: { x: number; y: number } | null;
};

export type DrawingTimelineFrameV2 = {
  id: number;
  kind: "frame" | "keyframe" | "tween";
  cellType: "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";
  stateId: number;
  isBlank: boolean;
  hasTweenEndpoint: boolean;
  bitmap: DrawingProjectAssetReferenceV2 | null;
  tweenEndBitmap: DrawingProjectAssetReferenceV2 | null;
  motionTween: DrawingMotionTweenV2 | null;
  soundAttachment: DrawingSoundAttachmentV2 | null;
  textObjects: DrawingTextObjectV2[];
};

export type DrawingLayerV2 = {
  id: string;
  name: string;
  orderIndex: number;
  timelineFrames: DrawingTimelineFrameV2[];
};

export type DrawingProjectDocumentV2 = {
  kind: "diamond-drawing-document";
  schemaVersion: 2;
  activeTool: "Select" | "Lasso" | "Brush" | "Eraser" | "Fill" | "Text" | "Shape" | "Knife";
  brushSize: number;
  eraserSize: number;
  fillColor: string;
  timelineFps: number;
  shapeType: "Square" | "Triangle" | "Circle";
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  isOnionEnabled: boolean;
  layers: DrawingLayerV2[];
  nextTimelineFrameId: number;
  nextLayerNumber: number;
};

export type DrawingProjectHeadV2 = {
  kind: "diamond-drawing-project-head";
  schemaVersion: 2;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeStorageRevision: number;
  documentDigest: string;
  activeStoredByteLength: number;
};

export type DrawingProjectVersionRecordV2 = {
  kind: "diamond-drawing-project";
  schemaVersion: 2;
  projectId: string;
  storageRevision: number;
  storedByteLength: number;
  documentDigest: string;
  document: DrawingProjectDocumentV2;
  assets: DrawingProjectAssetV2[];
};

export type DrawingProjectLegacyDeleteTombstoneV1 = {
  kind: "diamond-drawing-legacy-delete-tombstone";
  schemaVersion: 1;
  projectId: string;
  legacyRecordDigest: string | null;
};

const TOOL_NAMES = new Set(["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"]);
const SHAPE_TYPES = new Set(["Square", "Triangle", "Circle"]);
const FRAME_KINDS = new Set(["frame", "keyframe", "tween"]);
const CELL_TYPES = new Set(["empty", "keyframe", "blank-keyframe", "hold", "tween"]);
const FONT_FAMILIES = new Set(["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const fail = (stage: string, message: string, code: DrawingProjectV2ErrorCode = "invalid_record"): never => {
  throw new DrawingProjectV2Error(code, stage, message);
};

const hasLoneSurrogate = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
};

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const requireExactKeys = (
  value: unknown,
  expectedKeys: readonly string[],
  stage: string,
): Record<string, unknown> => {
  if (!isPlainRecord(value)) fail(stage, `${stage} must be a plain object.`);
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actualKeys.length !== expected.length || actualKeys.some((key, index) => key !== expected[index])) {
    fail(stage, `${stage} has unknown or missing fields.`);
  }
  return record;
};

export const requireCanonicalString = (value: unknown, stage: string, allowEmpty = true): string => {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) fail(stage, `${stage} must be a string.`);
  const stringValue = value as string;
  if (hasLoneSurrogate(stringValue) || stringValue.normalize("NFC") !== stringValue) fail(stage, `${stage} must be valid NFC Unicode.`);
  return stringValue;
};

export const requireProjectId = (value: unknown, stage: string): string => {
  const id = requireCanonicalString(value, stage, false);
  if (new TextEncoder().encode(id).byteLength > DRAWING_PROJECT_V2_LIMITS.idUtf8Bytes) {
    fail(stage, `${stage} exceeds the UTF-8 byte limit.`);
  }
  return id;
};

const requireFiniteNumber = (value: unknown, stage: string, minimum?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    fail(stage, `${stage} must be a finite non-negative-zero number.`);
  }
  const numberValue = value as number;
  if (minimum !== undefined && numberValue < minimum) fail(stage, `${stage} is below its minimum.`);
  return numberValue;
};

const requireSafeInteger = (value: unknown, stage: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(stage, `${stage} must be a safe integer.`);
  return value as number;
};

const requireBoolean = (value: unknown, stage: string): boolean => {
  if (typeof value !== "boolean") fail(stage, `${stage} must be boolean.`);
  return value as boolean;
};

const requireNullableString = (value: unknown, stage: string): string | null =>
  value === null ? null : requireCanonicalString(value, stage);

export const requireUtcTimestamp = (value: unknown, stage: string): string => {
  const timestamp = requireCanonicalString(value, stage, false);
  if (!UTC_ISO_PATTERN.test(timestamp) || Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    fail(stage, `${stage} must be a canonical UTC ISO-8601 timestamp.`);
  }
  return timestamp;
};

export const requireSha256 = (value: unknown, stage: string): string => {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail(stage, `${stage} must be lowercase SHA-256.`);
  return value as string;
};

const parseReference = (value: unknown, stage: string): DrawingProjectAssetReferenceV2 | null => {
  if (value === null) return null;
  const record = requireExactKeys(value, ["assetId"], stage);
  requireProjectId(record.assetId, `${stage}.assetId`);
  return value as DrawingProjectAssetReferenceV2;
};

const parseOrigin = (value: unknown, stage: string): { x: number; y: number } | null => {
  if (value === null) return null;
  const record = requireExactKeys(value, ["x", "y"], stage);
  requireFiniteNumber(record.x, `${stage}.x`);
  requireFiniteNumber(record.y, `${stage}.y`);
  return value as { x: number; y: number };
};

const parseTextObject = (value: unknown, stage: string): DrawingTextObjectV2 => {
  const record = requireExactKeys(
    value,
    ["id", "text", "x", "y", "width", "flipX", "flipY", "rotation", "fontFamily", "fontSize", "color", "bold", "italic"],
    stage,
  );
  requireProjectId(record.id, `${stage}.id`);
  requireCanonicalString(record.text, `${stage}.text`);
  requireFiniteNumber(record.x, `${stage}.x`);
  requireFiniteNumber(record.y, `${stage}.y`);
  requireFiniteNumber(record.width, `${stage}.width`, 0);
  requireBoolean(record.flipX, `${stage}.flipX`);
  requireBoolean(record.flipY, `${stage}.flipY`);
  requireFiniteNumber(record.rotation, `${stage}.rotation`);
  if (typeof record.fontFamily !== "string" || !FONT_FAMILIES.has(record.fontFamily)) fail(`${stage}.fontFamily`, "Unsupported font family.");
  requireFiniteNumber(record.fontSize, `${stage}.fontSize`, 0);
  requireCanonicalString(record.color, `${stage}.color`);
  requireBoolean(record.bold, `${stage}.bold`);
  requireBoolean(record.italic, `${stage}.italic`);
  return value as DrawingTextObjectV2;
};

export const parseDrawingSoundAttachmentV2 = (value: unknown, stage = "soundAttachment"): DrawingSoundAttachmentV2 => {
  const record = requireExactKeys(
    value,
    ["id", "title", "description", "timingFeel", "intensityFeel", "audioDataUrl", "contentType", "speechText", "sourceTask", "attachedAt"],
    stage,
  );
  requireProjectId(record.id, `${stage}.id`);
  requireCanonicalString(record.title, `${stage}.title`);
  requireCanonicalString(record.description, `${stage}.description`);
  requireNullableString(record.timingFeel, `${stage}.timingFeel`);
  requireNullableString(record.intensityFeel, `${stage}.intensityFeel`);
  parseReference(record.audioDataUrl, `${stage}.audioDataUrl`);
  if (record.contentType !== "sfx" && record.contentType !== "voice-placeholder") fail(`${stage}.contentType`, "Unsupported sound content type.");
  requireNullableString(record.speechText, `${stage}.speechText`);
  if (record.sourceTask !== "generate-sounds") fail(`${stage}.sourceTask`, "Unsupported sound source task.");
  requireUtcTimestamp(record.attachedAt, `${stage}.attachedAt`);
  return value as DrawingSoundAttachmentV2;
};

const parseMotionTween = (value: unknown, stage: string): DrawingMotionTweenV2 | null => {
  if (value === null) return null;
  const record = requireExactKeys(value, ["mode", "stageWidth", "stageHeight", "spriteBitmap", "startOrigin", "endOrigin"], stage);
  if (record.mode !== "position") fail(`${stage}.mode`, "Unsupported motion tween mode.");
  requireSafeInteger(record.stageWidth, `${stage}.stageWidth`, 1);
  requireSafeInteger(record.stageHeight, `${stage}.stageHeight`, 1);
  parseReference(record.spriteBitmap, `${stage}.spriteBitmap`);
  parseOrigin(record.startOrigin, `${stage}.startOrigin`);
  parseOrigin(record.endOrigin, `${stage}.endOrigin`);
  return value as DrawingMotionTweenV2;
};

const parseFrame = (value: unknown, stage: string): DrawingTimelineFrameV2 => {
  const record = requireExactKeys(
    value,
    ["id", "kind", "cellType", "stateId", "isBlank", "hasTweenEndpoint", "bitmap", "tweenEndBitmap", "motionTween", "soundAttachment", "textObjects"],
    stage,
  );
  requireSafeInteger(record.id, `${stage}.id`, 1);
  if (typeof record.kind !== "string" || !FRAME_KINDS.has(record.kind)) fail(`${stage}.kind`, "Unsupported frame kind.");
  if (typeof record.cellType !== "string" || !CELL_TYPES.has(record.cellType)) fail(`${stage}.cellType`, "Unsupported cell type.");
  requireSafeInteger(record.stateId, `${stage}.stateId`, 0);
  const isBlank = requireBoolean(record.isBlank, `${stage}.isBlank`);
  const hasTweenEndpoint = requireBoolean(record.hasTweenEndpoint, `${stage}.hasTweenEndpoint`);
  const bitmap = parseReference(record.bitmap, `${stage}.bitmap`);
  const tweenEndBitmap = parseReference(record.tweenEndBitmap, `${stage}.tweenEndBitmap`);
  const motionTween = parseMotionTween(record.motionTween, `${stage}.motionTween`);
  const soundAttachment = record.soundAttachment === null ? null : parseDrawingSoundAttachmentV2(record.soundAttachment, `${stage}.soundAttachment`);
  if (!Array.isArray(record.textObjects)) fail(`${stage}.textObjects`, "Text objects must be an array.");
  const textObjects = record.textObjects as unknown[];
  const textIds = new Set<string>();
  textObjects.forEach((entry, index) => {
    const text = parseTextObject(entry, `${stage}.textObjects[${index}]`);
    if (textIds.has(text.id)) fail(`${stage}.textObjects`, "Duplicate text object ID.");
    textIds.add(text.id);
  });
  if (record.cellType === "blank-keyframe") {
    if (!isBlank || bitmap || tweenEndBitmap || motionTween || soundAttachment || textObjects.length > 0 || hasTweenEndpoint) {
      fail(stage, "Blank keyframes cannot contain persisted content.");
    }
  } else if (isBlank) {
    fail(stage, "Only blank-keyframe cells may be blank.");
  }
  if (hasTweenEndpoint !== (tweenEndBitmap !== null)) fail(stage, "Tween endpoint flag/reference mismatch.");
  if (record.cellType === "tween" && record.kind !== "tween") fail(stage, "Tween cells require tween kind.");
  if (record.cellType === "keyframe" && record.kind !== "keyframe") fail(stage, "Keyframe cells require keyframe kind.");
  if (record.cellType === "blank-keyframe" && record.kind !== "keyframe") fail(stage, "Blank keyframes require keyframe kind.");
  if (motionTween && record.cellType !== "tween") fail(stage, "Motion tween metadata requires a tween cell.");
  return value as DrawingTimelineFrameV2;
};

export const parseDrawingProjectDocumentV2 = (value: unknown): DrawingProjectDocumentV2 => {
  const record = requireExactKeys(
    value,
    ["kind", "schemaVersion", "activeTool", "brushSize", "eraserSize", "fillColor", "timelineFps", "shapeType", "activeLayerId", "currentFrameIndex", "selectedTimelineIndex", "isOnionEnabled", "layers", "nextTimelineFrameId", "nextLayerNumber"],
    "document",
  );
  if (record.kind !== "diamond-drawing-document") fail("document.kind", "Unsupported document kind.");
  if (record.schemaVersion !== 2) fail("document.schemaVersion", "Unsupported document version.", "unsupported_version");
  if (typeof record.activeTool !== "string" || !TOOL_NAMES.has(record.activeTool)) fail("document.activeTool", "Unsupported drawing tool.");
  requireFiniteNumber(record.brushSize, "document.brushSize", 0);
  requireFiniteNumber(record.eraserSize, "document.eraserSize", 0);
  requireCanonicalString(record.fillColor, "document.fillColor");
  requireSafeInteger(record.timelineFps, "document.timelineFps", 1);
  if (typeof record.shapeType !== "string" || !SHAPE_TYPES.has(record.shapeType)) fail("document.shapeType", "Unsupported shape type.");
  const activeLayerId = requireProjectId(record.activeLayerId, "document.activeLayerId");
  const currentFrameIndex = requireSafeInteger(record.currentFrameIndex, "document.currentFrameIndex");
  const selectedTimelineIndex = requireSafeInteger(record.selectedTimelineIndex, "document.selectedTimelineIndex");
  requireBoolean(record.isOnionEnabled, "document.isOnionEnabled");
  if (!Array.isArray(record.layers) || record.layers.length === 0) fail("document.layers", "At least one layer is required.");
  const layers = record.layers as unknown[];
  const layerIds = new Set<string>();
  const frameIds = new Set<number>();
  let maximumFrames = 0;
  layers.forEach((layerValue, layerIndex) => {
    const stage = `document.layers[${layerIndex}]`;
    const layer = requireExactKeys(layerValue, ["id", "name", "orderIndex", "timelineFrames"], stage);
    const id = requireProjectId(layer.id, `${stage}.id`);
    if (layerIds.has(id)) fail(stage, "Duplicate layer ID.");
    layerIds.add(id);
    requireCanonicalString(layer.name, `${stage}.name`);
    requireSafeInteger(layer.orderIndex, `${stage}.orderIndex`);
    if (!Array.isArray(layer.timelineFrames) || layer.timelineFrames.length === 0) fail(`${stage}.timelineFrames`, "Each layer requires a timeline.");
    const timelineFrames = layer.timelineFrames as unknown[];
    maximumFrames = Math.max(maximumFrames, timelineFrames.length);
    timelineFrames.forEach((frameValue, frameIndex) => {
      const frame = parseFrame(frameValue, `${stage}.timelineFrames[${frameIndex}]`);
      if (frameIds.has(frame.id)) fail(stage, "Duplicate frame ID.");
      frameIds.add(frame.id);
    });
  });
  if (!layerIds.has(activeLayerId)) fail("document.activeLayerId", "Active layer does not resolve.");
  if (currentFrameIndex >= maximumFrames || selectedTimelineIndex >= maximumFrames) fail("document.indices", "Timeline index is out of range.");
  const nextFrameId = requireSafeInteger(record.nextTimelineFrameId, "document.nextTimelineFrameId", 1);
  if ([...frameIds].some((id) => id >= nextFrameId)) fail("document.nextTimelineFrameId", "Next frame ID must exceed existing IDs.");
  requireSafeInteger(record.nextLayerNumber, "document.nextLayerNumber", 1);
  return value as DrawingProjectDocumentV2;
};

const parseAsset = (value: unknown, stage: string): DrawingProjectAssetV2 => {
  if (!isPlainRecord(value)) fail(stage, "Asset must be a plain object.");
  const assetRecord = value as Record<string, unknown>;
  if (assetRecord.kind === "raster-png") {
    const record = requireExactKeys(value, ["assetId", "kind", "width", "height", "rgbaByteLength", "rgbaSha256", "encodedByteLength", "encodedSha256", "bytes"], stage);
    requireProjectId(record.assetId, `${stage}.assetId`);
    const width = requireSafeInteger(record.width, `${stage}.width`, 1);
    const height = requireSafeInteger(record.height, `${stage}.height`, 1);
    if (width > DRAWING_PROJECT_V2_LIMITS.rasterDimension || height > DRAWING_PROJECT_V2_LIMITS.rasterDimension) fail(stage, "Raster dimensions exceed the limit.");
    const rgbaByteLength = requireSafeInteger(record.rgbaByteLength, `${stage}.rgbaByteLength`, 1);
    if (width > Math.floor(DRAWING_PROJECT_V2_LIMITS.rasterRgbaBytes / 4 / height)) fail(stage, "Raster multiplication exceeds the limit.");
    if (width * height * 4 !== rgbaByteLength || rgbaByteLength > DRAWING_PROJECT_V2_LIMITS.rasterRgbaBytes) fail(stage, "Raster RGBA length is inconsistent.");
    requireSha256(record.rgbaSha256, `${stage}.rgbaSha256`);
    requireSafeInteger(record.encodedByteLength, `${stage}.encodedByteLength`, 1);
    requireSha256(record.encodedSha256, `${stage}.encodedSha256`);
    if (!(record.bytes instanceof Blob)) fail(`${stage}.bytes`, "Raster bytes must be a Blob.");
    return value as DrawingProjectRasterAssetV2;
  }
  if (assetRecord.kind === "audio") {
    const record = requireExactKeys(value, ["assetId", "kind", "mimeType", "byteLength", "sha256", "bytes"], stage);
    requireProjectId(record.assetId, `${stage}.assetId`);
    if (record.mimeType !== "audio/wav") fail(`${stage}.mimeType`, "Unsupported audio MIME.", "unsupported_version");
    const byteLength = requireSafeInteger(record.byteLength, `${stage}.byteLength`, 1);
    if (byteLength > DRAWING_PROJECT_V2_LIMITS.audioBytes) fail(stage, "Audio exceeds the limit.", "project_too_large");
    requireSha256(record.sha256, `${stage}.sha256`);
    if (!(record.bytes instanceof Blob)) fail(`${stage}.bytes`, "Audio bytes must be a Blob.");
    return value as DrawingProjectAudioAssetV2;
  }
  return fail(`${stage}.kind`, "Unsupported asset kind.");
};

const collectReferences = (document: DrawingProjectDocumentV2) => {
  const rasterReferences: string[] = [];
  const audioReferences: string[] = [];
  for (const layer of document.layers) {
    for (const frame of layer.timelineFrames) {
      if (frame.bitmap) rasterReferences.push(frame.bitmap.assetId);
      if (frame.tweenEndBitmap) rasterReferences.push(frame.tweenEndBitmap.assetId);
      if (frame.motionTween?.spriteBitmap) rasterReferences.push(frame.motionTween.spriteBitmap.assetId);
      if (frame.soundAttachment?.audioDataUrl) audioReferences.push(frame.soundAttachment.audioDataUrl.assetId);
    }
  }
  return { rasterReferences, audioReferences };
};

export const calculateProjectHydratedRgbaByteLength = (
  document: DrawingProjectDocumentV2,
  assets: readonly DrawingProjectAssetV2[],
): number => {
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const { rasterReferences } = collectReferences(document);
  let total = 0;
  for (const assetId of rasterReferences) {
    const asset = byId.get(assetId);
    if (!asset || asset.kind !== "raster-png") fail("document.assets", `Raster reference ${assetId} does not resolve.`, "asset_missing");
    const raster = asset as DrawingProjectRasterAssetV2;
    if (total > Number.MAX_SAFE_INTEGER - raster.rgbaByteLength) fail("document.hydratedRgba", "Hydrated RGBA sum overflow.", "project_too_large");
    total += raster.rgbaByteLength;
  }
  return total;
};

export const assertProjectHydrationCapacity = (
  document: DrawingProjectDocumentV2,
  assets: readonly DrawingProjectAssetV2[],
) => {
  const total = calculateProjectHydratedRgbaByteLength(document, assets);
  if (total > DRAWING_PROJECT_V2_LIMITS.projectHydratedRgbaBytes) {
    fail("project.hydration-preflight", "Project hydrated RGBA limit exceeded.", "project_too_large");
  }
  return total;
};

export const assertHydratedRgbaCapacityTotal = (total: number) => {
  if (!Number.isSafeInteger(total) || total < 0 || total > DRAWING_PROJECT_V2_LIMITS.projectHydratedRgbaBytes) {
    fail("project.hydration-preflight", "Project hydrated RGBA limit exceeded.", "project_too_large");
  }
  return total;
};

export const parseDrawingProjectVersionRecordV2 = (value: unknown): DrawingProjectVersionRecordV2 => {
  const record = requireExactKeys(value, ["kind", "schemaVersion", "projectId", "storageRevision", "storedByteLength", "documentDigest", "document", "assets"], "record");
  if (record.kind !== "diamond-drawing-project") fail("record.kind", "Unsupported record kind.");
  if (record.schemaVersion !== 2) fail("record.schemaVersion", "Unsupported record version.", "unsupported_version");
  requireProjectId(record.projectId, "record.projectId");
  requireSafeInteger(record.storageRevision, "record.storageRevision", 1);
  requireSafeInteger(record.storedByteLength, "record.storedByteLength", 1);
  requireSha256(record.documentDigest, "record.documentDigest");
  const document = parseDrawingProjectDocumentV2(record.document);
  if (!Array.isArray(record.assets)) fail("record.assets", "Assets must be an array.");
  const assetValues = record.assets as unknown[];
  const assetIds = new Set<string>();
  const assets = assetValues.map((assetValue, index) => {
    const asset = parseAsset(assetValue, `record.assets[${index}]`);
    if (assetIds.has(asset.assetId)) fail("record.assets", "Duplicate asset ID.");
    assetIds.add(asset.assetId);
    return asset;
  });
  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const references = collectReferences(document);
  for (const assetId of references.rasterReferences) {
    if (byId.get(assetId)?.kind !== "raster-png") fail("document.assets", "Missing raster asset.", "asset_missing");
  }
  for (const assetId of references.audioReferences) {
    if (byId.get(assetId)?.kind !== "audio") fail("document.assets", "Missing audio asset.", "asset_missing");
  }
  const referenced = new Set([...references.rasterReferences, ...references.audioReferences]);
  if (assets.some((asset) => !referenced.has(asset.assetId))) fail("record.assets", "Unreferenced authoritative asset.");
  assertProjectHydrationCapacity(document, assets);
  return value as DrawingProjectVersionRecordV2;
};

export const parseDrawingProjectHeadV2 = (value: unknown): DrawingProjectHeadV2 => {
  const record = requireExactKeys(value, ["kind", "schemaVersion", "projectId", "title", "createdAt", "updatedAt", "activeStorageRevision", "documentDigest", "activeStoredByteLength"], "head");
  if (record.kind !== "diamond-drawing-project-head") fail("head.kind", "Unsupported head kind.");
  if (record.schemaVersion !== 2) fail("head.schemaVersion", "Unsupported head version.", "unsupported_version");
  requireProjectId(record.projectId, "head.projectId");
  requireCanonicalString(record.title, "head.title", false);
  requireUtcTimestamp(record.createdAt, "head.createdAt");
  requireUtcTimestamp(record.updatedAt, "head.updatedAt");
  requireSafeInteger(record.activeStorageRevision, "head.activeStorageRevision", 1);
  requireSha256(record.documentDigest, "head.documentDigest");
  requireSafeInteger(record.activeStoredByteLength, "head.activeStoredByteLength", 1);
  return value as DrawingProjectHeadV2;
};

export const parseDrawingProjectLegacyDeleteTombstoneV1 = (value: unknown): DrawingProjectLegacyDeleteTombstoneV1 => {
  const record = requireExactKeys(value, ["kind", "schemaVersion", "projectId", "legacyRecordDigest"], "tombstone");
  if (record.kind !== "diamond-drawing-legacy-delete-tombstone" || record.schemaVersion !== 1) fail("tombstone", "Unsupported tombstone.", "unsupported_version");
  requireProjectId(record.projectId, "tombstone.projectId");
  if (record.legacyRecordDigest !== null) requireSha256(record.legacyRecordDigest, "tombstone.legacyRecordDigest");
  return value as DrawingProjectLegacyDeleteTombstoneV1;
};

export const parseDrawingProjectV2Result = <T>(operation: () => T): { ok: true; value: T } | { ok: false; error: DrawingProjectV2Error } => {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    if (error instanceof DrawingProjectV2Error) return { ok: false, error };
    throw error;
  }
};
