import {
  DrawingProjectV2Error,
  requireCanonicalString,
  requireExactKeys,
  requireProjectId,
  requireUtcTimestamp,
} from "./drawingProjectV2Contract.ts";
import { sha256CanonicalJson, sha256Hex } from "./drawingProjectV2Canonical.ts";

export const DRAWING_PROJECT_V1_STORAGE_KEY = "da_saved_drawing_projects";
export const DRAWING_PROJECT_LEGACY_MAINTENANCE_LOCK = "diamond-drawing-legacy-maintenance-v1";

export type DrawingProjectV1RootStatus = "absent" | "valid-array" | "corrupt-root" | "read-failed";
export type DrawingProjectV1EntryClassification = "valid-v1" | "corrupt-entry" | "unsupported";

export type DrawingProjectV1ClassifiedEntry = {
  index: number;
  classification: DrawingProjectV1EntryClassification;
  projectId: string | null;
  rawSlice: string;
  rawSliceDigest: string;
  canonicalRecordDigest: string | null;
  value: unknown;
  code: "invalid_record" | "unsupported_version" | null;
};

export type DrawingProjectV1ReadResult =
  | { status: "absent"; rawRoot: null; rootDigest: null; entries: [] }
  | { status: "read-failed"; rawRoot: null; rootDigest: null; entries: [] }
  | { status: "corrupt-root"; rawRoot: string; rootDigest: string; entries: [] }
  | { status: "valid-array"; rawRoot: string; rootDigest: string; entries: DrawingProjectV1ClassifiedEntry[] };

export type DrawingProjectLegacyMaintenanceResult =
  | { status: "not-needed"; legacyPresence: "absent" }
  | { status: "cleaned"; legacyPresence: "absent" }
  | {
      status: "pending";
      legacyPresence: "present" | "unknown";
      code: "legacy_corrupt" | "legacy_read_failed" | "storage_write_failed" | "maintenance_required";
    };

export type LegacyStorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LegacyMaintenanceLockAdapter = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T | null>;
};

type RawArrayEntry = { rawSlice: string; value: unknown };

const parseRawTopLevelArray = (raw: string): RawArrayEntry[] => {
  let index = 0;
  const whitespace = /\s/u;
  while (index < raw.length && whitespace.test(raw[index])) index += 1;
  if (raw[index] !== "[") throw new Error("Legacy root is not an array.");
  index += 1;
  const entries: RawArrayEntry[] = [];
  let entryStart = index;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;
  let sawValue = false;

  const pushEntry = (end: number) => {
    const rawSlice = raw.slice(entryStart, end);
    if (rawSlice.trim().length === 0) throw new Error("Legacy array contains an empty entry.");
    entries.push({ rawSlice, value: JSON.parse(rawSlice) });
  };

  for (; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      sawValue = true;
    } else if (character === "{") {
      objectDepth += 1;
      sawValue = true;
    } else if (character === "}") {
      objectDepth -= 1;
      if (objectDepth < 0) throw new Error("Unbalanced legacy object.");
    } else if (character === "[") {
      arrayDepth += 1;
      sawValue = true;
    } else if (character === "]") {
      if (arrayDepth > 0) {
        arrayDepth -= 1;
      } else if (objectDepth === 0) {
        if (sawValue || raw.slice(entryStart, index).trim().length > 0) pushEntry(index);
        else if (entries.length > 0) throw new Error("Legacy array contains a trailing comma.");
        index += 1;
        while (index < raw.length && whitespace.test(raw[index])) index += 1;
        if (index !== raw.length) throw new Error("Trailing legacy root bytes.");
        return entries;
      } else {
        throw new Error("Unbalanced legacy array.");
      }
    } else if (character === "," && objectDepth === 0 && arrayDepth === 0) {
      pushEntry(index);
      entryStart = index + 1;
      sawValue = false;
    } else if (!whitespace.test(character)) {
      sawValue = true;
    }
  }
  throw new Error("Unterminated legacy root.");
};

const exactAllowedKeys = (value: unknown, required: readonly string[], optional: readonly string[], stage: string) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${stage} is not an object.`);
  const keys = Object.keys(value as object);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error(`${stage} fields are not exact.`);
  }
  return value as Record<string, unknown>;
};

const finite = (value: unknown, stage: string, minimum?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0) || (minimum !== undefined && value < minimum)) throw new Error(`${stage} is invalid.`);
};

const safeInteger = (value: unknown, stage: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`${stage} is invalid.`);
};

const nullableString = (value: unknown, stage: string) => {
  if (value !== null) requireCanonicalString(value, stage);
};

const validateSerializedBitmap = (value: unknown, stage: string) => {
  if (value === null) return;
  const bitmap = requireExactKeys(value, ["width", "height", "data"], stage);
  safeInteger(bitmap.width, `${stage}.width`, 1);
  safeInteger(bitmap.height, `${stage}.height`, 1);
  if (!Array.isArray(bitmap.data) || bitmap.data.length !== (bitmap.width as number) * (bitmap.height as number) * 4) throw new Error(`${stage}.data is invalid.`);
  for (const byte of bitmap.data) if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error(`${stage}.data byte is invalid.`);
};

export type NormalizedDrawingProjectV1Sound = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl: string | null;
  contentType: "sfx" | "voice-placeholder";
  speechText: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

export const normalizeDrawingProjectV1Sound = (value: unknown): NormalizedDrawingProjectV1Sound => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("legacy.sound is not an object.");
  const allowedSoundKeys = ["id", "title", "description", "sourceTask", "attachedAt", "timingFeel", "intensityFeel", "audioDataUrl", "contentType", "speechText"];
  if (Object.keys(value).some((key) => !allowedSoundKeys.includes(key))) {
    throw new DrawingProjectV2Error("unsupported_version", "legacy.sound", "Unsupported future sound shape.");
  }
  const sound = exactAllowedKeys(
    value,
    ["id", "title", "description", "sourceTask", "attachedAt"],
    ["timingFeel", "intensityFeel", "audioDataUrl", "contentType", "speechText"],
    "legacy.sound",
  );
  const id = requireProjectId(sound.id, "legacy.sound.id");
  const title = requireCanonicalString(sound.title, "legacy.sound.title");
  const description = requireCanonicalString(sound.description, "legacy.sound.description");
  const timingFeel = sound.timingFeel === undefined || sound.timingFeel === null ? null : requireCanonicalString(sound.timingFeel, "legacy.sound.timingFeel");
  const intensityFeel = sound.intensityFeel === undefined || sound.intensityFeel === null ? null : requireCanonicalString(sound.intensityFeel, "legacy.sound.intensityFeel");
  const audioDataUrl = sound.audioDataUrl === undefined || sound.audioDataUrl === null ? null : requireCanonicalString(sound.audioDataUrl, "legacy.sound.audioDataUrl");
  const contentType = sound.contentType === undefined || sound.contentType === null || sound.contentType === "sfx" ? "sfx" : sound.contentType;
  if (contentType !== "sfx" && contentType !== "voice-placeholder") throw new DrawingProjectV2Error("unsupported_version", "legacy.sound.contentType", "Unsupported future sound content type.");
  const speechText = sound.speechText === undefined || sound.speechText === null ? null : requireCanonicalString(sound.speechText, "legacy.sound.speechText");
  if (sound.sourceTask !== "generate-sounds") throw new DrawingProjectV2Error("unsupported_version", "legacy.sound.sourceTask", "Unsupported future sound source.");
  const attachedAt = requireUtcTimestamp(sound.attachedAt, "legacy.sound.attachedAt");
  return { id, title, description, timingFeel, intensityFeel, audioDataUrl, contentType, speechText, sourceTask: "generate-sounds", attachedAt };
};

const validateTextObject = (value: unknown, stage: string) => {
  const text = exactAllowedKeys(value, ["id", "text", "x", "y", "width", "fontFamily", "fontSize", "color", "bold", "italic"], ["flipX", "flipY", "rotation"], stage);
  requireProjectId(text.id, `${stage}.id`);
  requireCanonicalString(text.text, `${stage}.text`);
  finite(text.x, `${stage}.x`);
  finite(text.y, `${stage}.y`);
  finite(text.width, `${stage}.width`, 0);
  if (text.flipX !== undefined && typeof text.flipX !== "boolean") throw new Error(`${stage}.flipX invalid.`);
  if (text.flipY !== undefined && typeof text.flipY !== "boolean") throw new Error(`${stage}.flipY invalid.`);
  if (text.rotation !== undefined) finite(text.rotation, `${stage}.rotation`);
  if (!["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New"].includes(String(text.fontFamily))) throw new Error(`${stage}.fontFamily invalid.`);
  finite(text.fontSize, `${stage}.fontSize`, 0);
  requireCanonicalString(text.color, `${stage}.color`);
  if (typeof text.bold !== "boolean" || typeof text.italic !== "boolean") throw new Error(`${stage} style invalid.`);
};

const validateFrame = (value: unknown, stage: string) => {
  const frame = exactAllowedKeys(
    value,
    ["id", "kind", "cellType", "stateId", "bitmap", "previewUrl", "tweenEndBitmap", "tweenEndPreviewUrl", "motionTween"],
    ["isBlank", "hasTweenEndpoint", "soundAttachment", "textObjects"],
    stage,
  );
  safeInteger(frame.id, `${stage}.id`, 1);
  if (!["frame", "keyframe", "tween"].includes(String(frame.kind))) throw new Error(`${stage}.kind invalid.`);
  if (!["empty", "keyframe", "blank-keyframe", "hold", "tween"].includes(String(frame.cellType))) throw new Error(`${stage}.cellType invalid.`);
  safeInteger(frame.stateId, `${stage}.stateId`);
  if (frame.isBlank !== undefined && typeof frame.isBlank !== "boolean") throw new Error(`${stage}.isBlank invalid.`);
  if (frame.hasTweenEndpoint !== undefined && typeof frame.hasTweenEndpoint !== "boolean") throw new Error(`${stage}.hasTweenEndpoint invalid.`);
  validateSerializedBitmap(frame.bitmap, `${stage}.bitmap`);
  nullableString(frame.previewUrl, `${stage}.previewUrl`);
  validateSerializedBitmap(frame.tweenEndBitmap, `${stage}.tweenEndBitmap`);
  nullableString(frame.tweenEndPreviewUrl, `${stage}.tweenEndPreviewUrl`);
  if (frame.motionTween !== null) {
    const tween = requireExactKeys(frame.motionTween, ["mode", "stageWidth", "stageHeight", "spriteBitmap", "startOrigin", "endOrigin"], `${stage}.motionTween`);
    if (tween.mode !== "position") throw new DrawingProjectV2Error("unsupported_version", `${stage}.motionTween.mode`, "Unsupported motion tween.");
    safeInteger(tween.stageWidth, `${stage}.motionTween.stageWidth`, 1);
    safeInteger(tween.stageHeight, `${stage}.motionTween.stageHeight`, 1);
    validateSerializedBitmap(tween.spriteBitmap, `${stage}.motionTween.spriteBitmap`);
    for (const name of ["startOrigin", "endOrigin"] as const) {
      if (tween[name] !== null) {
        const origin = requireExactKeys(tween[name], ["x", "y"], `${stage}.motionTween.${name}`);
        finite(origin.x, `${stage}.motionTween.${name}.x`);
        finite(origin.y, `${stage}.motionTween.${name}.y`);
      }
    }
  }
  if (frame.soundAttachment !== undefined && frame.soundAttachment !== null) normalizeDrawingProjectV1Sound(frame.soundAttachment);
  if (frame.textObjects !== undefined && frame.textObjects !== null) {
    if (!Array.isArray(frame.textObjects)) throw new Error(`${stage}.textObjects invalid.`);
    frame.textObjects.forEach((entry, index) => validateTextObject(entry, `${stage}.textObjects[${index}]`));
  }
};

export const validateDrawingProjectV1 = (value: unknown) => {
  const project = exactAllowedKeys(value, ["id", "name", "data", "created_at", "updated_at"], ["previewDataUrl", "aiMemory"], "legacy.project");
  requireProjectId(project.id, "legacy.project.id");
  requireCanonicalString(project.name, "legacy.project.name");
  if (project.previewDataUrl !== undefined) nullableString(project.previewDataUrl, "legacy.project.previewDataUrl");
  requireUtcTimestamp(project.created_at, "legacy.project.created_at");
  requireUtcTimestamp(project.updated_at, "legacy.project.updated_at");
  const data = requireExactKeys(
    project.data,
    ["version", "activeTool", "brushSize", "eraserSize", "fillColor", "timelineFps", "shapeType", "activeLayerId", "currentFrameIndex", "selectedTimelineIndex", "isOnionEnabled", "layers", "nextTimelineFrameId", "nextLayerNumber"],
    "legacy.data",
  );
  if (data.version !== 1) throw new DrawingProjectV2Error("unsupported_version", "legacy.data.version", "Unsupported legacy version.");
  if (!["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"].includes(String(data.activeTool))) throw new Error("legacy.data.activeTool invalid.");
  finite(data.brushSize, "legacy.data.brushSize", 0);
  finite(data.eraserSize, "legacy.data.eraserSize", 0);
  requireCanonicalString(data.fillColor, "legacy.data.fillColor");
  safeInteger(data.timelineFps, "legacy.data.timelineFps", 1);
  if (!["Square", "Triangle", "Circle"].includes(String(data.shapeType))) throw new Error("legacy.data.shapeType invalid.");
  requireProjectId(data.activeLayerId, "legacy.data.activeLayerId");
  safeInteger(data.currentFrameIndex, "legacy.data.currentFrameIndex");
  safeInteger(data.selectedTimelineIndex, "legacy.data.selectedTimelineIndex");
  if (typeof data.isOnionEnabled !== "boolean") throw new Error("legacy.data.isOnionEnabled invalid.");
  if (!Array.isArray(data.layers) || data.layers.length === 0) throw new Error("legacy.data.layers invalid.");
  const layerIds = new Set<string>();
  for (const [layerIndex, layerValue] of data.layers.entries()) {
    const stage = `legacy.data.layers[${layerIndex}]`;
    const layer = requireExactKeys(layerValue, ["id", "name", "orderIndex", "timelineFrames"], stage);
    const id = requireProjectId(layer.id, `${stage}.id`);
    if (layerIds.has(id)) throw new DrawingProjectV2Error("invalid_record", stage, "Duplicate legacy layer ID.");
    layerIds.add(id);
    requireCanonicalString(layer.name, `${stage}.name`);
    safeInteger(layer.orderIndex, `${stage}.orderIndex`);
    if (!Array.isArray(layer.timelineFrames) || layer.timelineFrames.length === 0) throw new Error(`${stage}.timelineFrames invalid.`);
    layer.timelineFrames.forEach((frame, frameIndex) => validateFrame(frame, `${stage}.timelineFrames[${frameIndex}]`));
  }
  if (!layerIds.has(data.activeLayerId as string)) throw new Error("legacy.data.activeLayerId dangling.");
  safeInteger(data.nextTimelineFrameId, "legacy.data.nextTimelineFrameId", 1);
  safeInteger(data.nextLayerNumber, "legacy.data.nextLayerNumber", 1);
  return value;
};

const classifyEntries = async (rawEntries: RawArrayEntry[]): Promise<DrawingProjectV1ClassifiedEntry[]> => {
  const entries = await Promise.all(
    rawEntries.map(async (entry, index): Promise<DrawingProjectV1ClassifiedEntry> => {
      const rawSliceDigest = await sha256Hex(new TextEncoder().encode(entry.rawSlice));
      try {
        const project = validateDrawingProjectV1(entry.value) as { id: string };
        return {
          index,
          classification: "valid-v1",
          projectId: project.id,
          rawSlice: entry.rawSlice,
          rawSliceDigest,
          canonicalRecordDigest: await sha256CanonicalJson(entry.value),
          value: entry.value,
          code: null,
        };
      } catch (error) {
        const unsupported = error instanceof DrawingProjectV2Error && error.code === "unsupported_version";
        const projectId = entry.value !== null && typeof entry.value === "object" && !Array.isArray(entry.value) && typeof (entry.value as { id?: unknown }).id === "string"
          ? (entry.value as { id: string }).id
          : null;
        return {
          index,
          classification: unsupported ? "unsupported" : "corrupt-entry",
          projectId,
          rawSlice: entry.rawSlice,
          rawSliceDigest,
          canonicalRecordDigest: null,
          value: entry.value,
          code: unsupported ? "unsupported_version" : "invalid_record",
        };
      }
    }),
  );
  const counts = new Map<string, number>();
  for (const entry of entries) if (entry.projectId) counts.set(entry.projectId, (counts.get(entry.projectId) ?? 0) + 1);
  return entries.map((entry) =>
    entry.projectId && (counts.get(entry.projectId) ?? 0) > 1
      ? { ...entry, classification: "corrupt-entry", canonicalRecordDigest: null, code: "invalid_record" }
      : entry,
  );
};

export const classifyDrawingProjectV1RawRoot = async (raw: string): Promise<DrawingProjectV1ReadResult> => {
  const rootDigest = await sha256Hex(new TextEncoder().encode(raw));
  let rawEntries: RawArrayEntry[];
  try {
    rawEntries = parseRawTopLevelArray(raw);
  } catch {
    return { status: "corrupt-root", rawRoot: raw, rootDigest, entries: [] };
  }
  return { status: "valid-array", rawRoot: raw, rootDigest, entries: await classifyEntries(rawEntries) };
};

export const readDrawingProjectV1Storage = async (storage: Pick<LegacyStorageAdapter, "getItem">): Promise<DrawingProjectV1ReadResult> => {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAWING_PROJECT_V1_STORAGE_KEY);
  } catch {
    return { status: "read-failed", rawRoot: null, rootDigest: null, entries: [] };
  }
  if (raw === null) return { status: "absent", rawRoot: null, rootDigest: null, entries: [] };
  return classifyDrawingProjectV1RawRoot(raw);
};

export type DrawingProjectLegacyCleanupCandidate = {
  capturedRootDigest: string;
  candidateRoot: string;
  candidateRootDigest: string;
  projectId: string;
  targetRecordDigest: string;
  preservedEntryDigests: string[];
};

export const buildDrawingProjectLegacyCleanupCandidate = async (
  rawRoot: string,
  projectId: string,
  expectedRecordDigest: string | null,
): Promise<{ status: "candidate"; candidate: DrawingProjectLegacyCleanupCandidate } | { status: "not-needed" } | { status: "pending"; code: "legacy_corrupt" | "maintenance_required" }> => {
  const result = await classifyDrawingProjectV1RawRoot(rawRoot);
  if (result.status !== "valid-array") return { status: "pending", code: "legacy_corrupt" };
  const target = result.entries.find((entry) => entry.projectId === projectId);
  if (!target) return { status: "not-needed" };
  if (target.classification !== "valid-v1" || !target.canonicalRecordDigest) return { status: "pending", code: "legacy_corrupt" };
  if (expectedRecordDigest !== null && target.canonicalRecordDigest !== expectedRecordDigest) return { status: "pending", code: "maintenance_required" };
  const preserved = result.entries.filter((entry) => entry.index !== target.index);
  const candidateRoot = `[${preserved.map((entry) => entry.rawSlice).join(",")}]`;
  return {
    status: "candidate",
    candidate: {
      capturedRootDigest: result.rootDigest,
      candidateRoot,
      candidateRootDigest: await sha256Hex(new TextEncoder().encode(candidateRoot)),
      projectId,
      targetRecordDigest: target.canonicalRecordDigest,
      preservedEntryDigests: preserved.map((entry) => entry.rawSliceDigest),
    },
  };
};

const rawDigest = (raw: string) => sha256Hex(new TextEncoder().encode(raw));

export const attemptDrawingProjectLegacyCleanup = async (
  storage: LegacyStorageAdapter,
  lock: LegacyMaintenanceLockAdapter,
  projectId: string,
  expectedRecordDigest: string | null,
): Promise<DrawingProjectLegacyMaintenanceResult> => {
  let capturedRaw: string | null;
  try {
    capturedRaw = storage.getItem(DRAWING_PROJECT_V1_STORAGE_KEY);
  } catch {
    return { status: "pending", legacyPresence: "unknown", code: "legacy_read_failed" };
  }
  if (capturedRaw === null) return { status: "not-needed", legacyPresence: "absent" };
  const built = await buildDrawingProjectLegacyCleanupCandidate(capturedRaw, projectId, expectedRecordDigest);
  if (built.status === "not-needed") return { status: "not-needed", legacyPresence: "absent" };
  if (built.status === "pending") return { status: "pending", legacyPresence: "present", code: built.code };
  const locked = await lock.request(DRAWING_PROJECT_LEGACY_MAINTENANCE_LOCK, async () => {
    let currentRaw: string | null;
    try {
      currentRaw = storage.getItem(DRAWING_PROJECT_V1_STORAGE_KEY);
    } catch {
      return { status: "pending", legacyPresence: "unknown", code: "legacy_read_failed" } as const;
    }
    if (currentRaw === null || (await rawDigest(currentRaw)) !== built.candidate.capturedRootDigest) {
      return { status: "pending", legacyPresence: "present", code: "maintenance_required" } as const;
    }
    try {
      storage.setItem(DRAWING_PROJECT_V1_STORAGE_KEY, built.candidate.candidateRoot);
    } catch {
      return { status: "pending", legacyPresence: "present", code: "storage_write_failed" } as const;
    }
    let readBack: string | null;
    try {
      readBack = storage.getItem(DRAWING_PROJECT_V1_STORAGE_KEY);
    } catch {
      return { status: "pending", legacyPresence: "unknown", code: "storage_write_failed" } as const;
    }
    if (readBack === null || (await rawDigest(readBack)) !== (await rawDigest(built.candidate.candidateRoot))) {
      return { status: "pending", legacyPresence: "unknown", code: "storage_write_failed" } as const;
    }
    const classified = await classifyDrawingProjectV1RawRoot(readBack);
    if (
      classified.status !== "valid-array" ||
      classified.entries.some((entry) => entry.projectId === projectId) ||
      JSON.stringify(classified.entries.map((entry) => entry.rawSliceDigest)) !== JSON.stringify(built.candidate.preservedEntryDigests)
    ) {
      return { status: "pending", legacyPresence: "unknown", code: "storage_write_failed" } as const;
    }
    return { status: "cleaned", legacyPresence: "absent" } as const;
  });
  return locked ?? { status: "pending", legacyPresence: "present", code: "maintenance_required" };
};
