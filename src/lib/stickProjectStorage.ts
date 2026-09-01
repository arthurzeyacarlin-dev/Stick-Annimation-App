import {canonicalJson} from "./stickfigure/stickProjectContract.ts";
import type {
  EditableStickProjectDocumentV1,
  EditableStickProjectViewStateV1,
} from "./stickfigure/stickProjectHistory.ts";
import {
  createStickAiCreationLatch,
  isValidStickAiCreationLatch,
  type StickAiCreationLatchV1,
} from "./stickfigure/stickProjectHistory.ts";

export const STICK_PROJECT_STORAGE_KEY = "da_saved_stick_projects_v1";
export const STICK_PROJECT_STORAGE_VERSION = 1;
export const STICK_PROJECT_STORAGE_RECORD_LIMIT = 32;
export const STICK_PROJECT_STORAGE_BYTE_LIMIT = 4_194_304;

export type StickStorageErrorCodeV1 =
  | "corrupt_storage"
  | "unsupported_storage_version"
  | "invalid_saved_project"
  | "project_not_found"
  | "storage_read_failed"
  | "storage_limit_exceeded"
  | "quota_exceeded"
  | "storage_write_failed";

export type StickStorageResult<T> = {ok: true; value: T} | {ok: false; error: StickStorageErrorCodeV1};

export type StickSavedProjectRecordLegacyV1 = {
  recordVersion: 1;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  document: EditableStickProjectDocumentV1;
  reopenState: EditableStickProjectViewStateV1;
};

export type StickSavedProjectRecordV2 = {
  recordVersion: 2;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  document: EditableStickProjectDocumentV1;
  reopenState: EditableStickProjectViewStateV1;
  aiCreationLatch: StickAiCreationLatchV1;
};

/** Kept under the historical exported name so existing Open consumers remain source-compatible. */
export type StickSavedProjectRecordV1 = StickSavedProjectRecordLegacyV1 | StickSavedProjectRecordV2;

export type StickSavedProjectsEnvelopeV1 = {
  storageVersion: 1;
  projects: StickSavedProjectRecordV1[];
};

export type StickStorageCommitInputV1 = {
  storageKey: typeof STICK_PROJECT_STORAGE_KEY;
  previousRawBytes: string | null;
  nextRawBytes: string;
};

export type StickStorageCommitPortV1 = {
  commit: (input: StickStorageCommitInputV1) => Promise<StickStorageResult<void>>;
};

export type StickStorageReaderV1 = Pick<Storage, "getItem">;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const isSafeInteger = (value: unknown, min = 0) => Number.isSafeInteger(value) && Number(value) >= min;
const isCanonicalTimestamp = (value: unknown) => {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};

const validatePoint = (value: unknown) => isObject(value) && exactKeys(value, ["id", "x", "y"]) &&
  typeof value.id === "string" && value.id.length > 0 && Number.isFinite(value.x) && Number.isFinite(value.y);

const validateFrameContent = (value: unknown) => {
  if (!isObject(value) || !exactKeys(value, ["figures", "structureGraph"]) || !Array.isArray(value.figures) || !isObject(value.structureGraph)) return false;
  if (!exactKeys(value.structureGraph, ["activeJointId", "joints", "limbs"]) || !Array.isArray(value.structureGraph.joints) || !Array.isArray(value.structureGraph.limbs)) return false;
  if (value.structureGraph.activeJointId !== null && typeof value.structureGraph.activeJointId !== "string") return false;
  if (!value.figures.every((figure) => isObject(figure) && exactKeys(figure, ["id", "name", "rotation", "scale", "x", "y"]) &&
    typeof figure.id === "string" && typeof figure.name === "string" && [figure.x, figure.y, figure.scale, figure.rotation].every(Number.isFinite))) return false;
  if (!value.structureGraph.joints.every(validatePoint)) return false;
  if (!value.structureGraph.limbs.every((limb) => isObject(limb) && exactKeys(limb, ["endJointId", "id", "startJointId"]) &&
    typeof limb.id === "string" && typeof limb.startJointId === "string" && typeof limb.endJointId === "string")) return false;
  const jointIds = new Set(value.structureGraph.joints.map((joint) => (joint as Record<string, unknown>).id));
  return value.structureGraph.limbs.every((limb) => jointIds.has((limb as Record<string, unknown>).startJointId) && jointIds.has((limb as Record<string, unknown>).endJointId));
};

export const validateEditableStickProjectDocument = (value: unknown): value is EditableStickProjectDocumentV1 => {
  if (!isObject(value) || !exactKeys(value, [
    "documentRevision", "fps", "layers", "nextFrameId", "nextLayerNumber", "nextStateId",
    "projectId", "projectType", "schemaVersion", "title",
  ])) return false;
  if (value.schemaVersion !== 1 || value.projectType !== "stick-figure" || typeof value.projectId !== "string" || !UUID_V4.test(value.projectId)) return false;
  if (!isSafeInteger(value.documentRevision) || typeof value.title !== "string" || value.title.length < 1 || value.title.length > 100) return false;
  if (!isSafeInteger(value.fps, 1) || Number(value.fps) > 55 || !isSafeInteger(value.nextFrameId, 1) || !isSafeInteger(value.nextStateId, 1) || !isSafeInteger(value.nextLayerNumber, 1)) return false;
  if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > 64) return false;
  const layerIds = new Set<string>();
  for (const layer of value.layers) {
    if (!isObject(layer) || !exactKeys(layer, ["frames", "id", "name"]) || typeof layer.id !== "string" || layer.id.length < 1 || layerIds.has(layer.id) || typeof layer.name !== "string" || !Array.isArray(layer.frames) || layer.frames.length < 1 || layer.frames.length > 4096) return false;
    layerIds.add(layer.id);
    const frameIds = new Set<number>();
    for (const frame of layer.frames) {
      if (!isObject(frame)) return false;
      const keys = frame.content === undefined ? ["cellType", "hasTweenEndpoint", "id", "isBlank", "kind", "stateId"] : ["cellType", "content", "hasTweenEndpoint", "id", "isBlank", "kind", "stateId"];
      if (!exactKeys(frame, keys) || !isSafeInteger(frame.id, 1) || frameIds.has(Number(frame.id)) || !isSafeInteger(frame.stateId, 1)) return false;
      frameIds.add(Number(frame.id));
      if (!["frame", "keyframe", "tween"].includes(String(frame.kind)) || !["empty", "keyframe", "blank-keyframe", "hold", "tween"].includes(String(frame.cellType)) || frame.hasTweenEndpoint !== false || typeof frame.isBlank !== "boolean") return false;
      const needsContent = frame.cellType === "keyframe" || frame.cellType === "blank-keyframe";
      if (needsContent !== (frame.content !== undefined) || (needsContent && !validateFrameContent(frame.content))) return false;
    }
  }
  return true;
};

export const validateEditableStickProjectViewState = (
  value: unknown,
  document: EditableStickProjectDocumentV1,
): value is EditableStickProjectViewStateV1 => {
  if (!isObject(value) || !exactKeys(value, ["activeLayerId", "currentFrameIndex", "selectedTimelineIndex"]) ||
    typeof value.activeLayerId !== "string" || !isSafeInteger(value.currentFrameIndex) || !isSafeInteger(value.selectedTimelineIndex)) return false;
  const layer = document.layers.find((candidate) => candidate.id === value.activeLayerId);
  if (!layer) return false;
  const maxIndex = Math.max(...document.layers.map((candidate) => candidate.frames.length)) - 1;
  return Number(value.currentFrameIndex) <= maxIndex && Number(value.selectedTimelineIndex) <= maxIndex;
};

const validateRecord = (value: unknown): value is StickSavedProjectRecordV1 => {
  if (!isObject(value) || typeof value.projectId !== "string" ||
    !isCanonicalTimestamp(value.createdAt) || !isCanonicalTimestamp(value.updatedAt) ||
    !validateEditableStickProjectDocument(value.document)) return false;
  const commonValid = value.projectId === value.document.projectId &&
    validateEditableStickProjectViewState(value.reopenState, value.document);
  if (!commonValid) return false;
  if (value.recordVersion === 1) {
    return exactKeys(value, ["createdAt", "document", "projectId", "recordVersion", "reopenState", "updatedAt"]);
  }
  if (value.recordVersion === 2) {
    return exactKeys(value, ["aiCreationLatch", "createdAt", "document", "projectId", "recordVersion", "reopenState", "updatedAt"]) &&
      isValidStickAiCreationLatch(value.aiCreationLatch, value.projectId);
  }
  return false;
};

export const parseStickSavedProjectsEnvelope = (raw: string | null): StickStorageResult<StickSavedProjectsEnvelopeV1> => {
  if (raw === null) return {ok: true, value: {storageVersion: 1, projects: []}};
  if (raw.length === 0) return {ok: false, error: "corrupt_storage"};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {ok: false, error: "corrupt_storage"}; }
  if (!isObject(parsed) || !exactKeys(parsed, ["projects", "storageVersion"])) return {ok: false, error: "corrupt_storage"};
  if (parsed.storageVersion !== 1) return {ok: false, error: "unsupported_storage_version"};
  const projects = parsed.projects;
  if (!Array.isArray(projects) || projects.length > STICK_PROJECT_STORAGE_RECORD_LIMIT || !projects.every(validateRecord)) return {ok: false, error: "invalid_saved_project"};
  const projectIds = new Set(projects.map((project) => project.projectId));
  if (projectIds.size !== projects.length) return {ok: false, error: "invalid_saved_project"};
  const expected = [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.projectId.localeCompare(right.projectId));
  if (expected.some((record, index) => record.projectId !== projects[index].projectId)) return {ok: false, error: "invalid_saved_project"};
  if (new TextEncoder().encode(canonicalJson(parsed)).byteLength > STICK_PROJECT_STORAGE_BYTE_LIMIT) return {ok: false, error: "storage_limit_exceeded"};
  return {ok: true, value: parsed as StickSavedProjectsEnvelopeV1};
};

export const readStickSavedProjects = (storage: StickStorageReaderV1): StickStorageResult<{raw: string | null; envelope: StickSavedProjectsEnvelopeV1}> => {
  let raw: string | null;
  try { raw = storage.getItem(STICK_PROJECT_STORAGE_KEY); } catch { return {ok: false, error: "storage_read_failed"}; }
  const parsed = parseStickSavedProjectsEnvelope(raw);
  return parsed.ok ? {ok: true, value: {raw, envelope: parsed.value}} : parsed;
};

export const listStickSavedProjects = (storage: StickStorageReaderV1): StickStorageResult<StickSavedProjectRecordV1[]> => {
  const read = readStickSavedProjects(storage);
  return read.ok ? {ok: true, value: read.value.envelope.projects} : read;
};

export const openStickSavedProject = (storage: StickStorageReaderV1, projectId: string): StickStorageResult<StickSavedProjectRecordV1> => {
  const listed = listStickSavedProjects(storage);
  if (!listed.ok) return listed;
  const project = listed.value.find((candidate) => candidate.projectId === projectId);
  return project ? {ok: true, value: project} : {ok: false, error: "project_not_found"};
};

export const prepareStickProjectSave = (
  previousRawBytes: string | null,
  document: EditableStickProjectDocumentV1,
  reopenState: EditableStickProjectViewStateV1,
  now: () => string,
  aiCreationLatch?: StickAiCreationLatchV1,
): StickStorageResult<StickStorageCommitInputV1> => {
  const parsed = parseStickSavedProjectsEnvelope(previousRawBytes);
  if (!parsed.ok) return parsed;
  if (!validateEditableStickProjectDocument(document) || !validateEditableStickProjectViewState(reopenState, document)) return {ok: false, error: "invalid_saved_project"};
  const timestamp = now();
  if (!isCanonicalTimestamp(timestamp)) return {ok: false, error: "invalid_saved_project"};
  const existing = parsed.value.projects.find((project) => project.projectId === document.projectId);
  const latch = aiCreationLatch ??
    (existing?.recordVersion === 2 ? existing.aiCreationLatch : createStickAiCreationLatch(document.projectId, "consumed"));
  if (!isValidStickAiCreationLatch(latch, document.projectId)) return {ok: false, error: "invalid_saved_project"};
  const record: StickSavedProjectRecordV2 = {
    recordVersion: 2,
    projectId: document.projectId,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    document: JSON.parse(canonicalJson(document)) as EditableStickProjectDocumentV1,
    reopenState: JSON.parse(canonicalJson(reopenState)) as EditableStickProjectViewStateV1,
    aiCreationLatch: JSON.parse(canonicalJson(latch)) as StickAiCreationLatchV1,
  };
  const projects = parsed.value.projects.filter((project) => project.projectId !== record.projectId).concat(record)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.projectId.localeCompare(right.projectId));
  if (projects.length > STICK_PROJECT_STORAGE_RECORD_LIMIT) return {ok: false, error: "storage_limit_exceeded"};
  const nextRawBytes = canonicalJson({storageVersion: 1, projects});
  if (new TextEncoder().encode(nextRawBytes).byteLength > STICK_PROJECT_STORAGE_BYTE_LIMIT) return {ok: false, error: "storage_limit_exceeded"};
  return {ok: true, value: {storageKey: STICK_PROJECT_STORAGE_KEY, previousRawBytes, nextRawBytes}};
};

export const createBrowserStickStorageCommitPort = (storage: Pick<Storage, "setItem">): StickStorageCommitPortV1 => ({
  commit: async ({storageKey, nextRawBytes}) => {
    try {
      storage.setItem(storageKey, nextRawBytes);
      return {ok: true, value: undefined};
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      return {ok: false, error: name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ? "quota_exceeded" : "storage_write_failed"};
    }
  },
});

export const saveStickProject = async (
  storage: Storage,
  document: EditableStickProjectDocumentV1,
  reopenState: EditableStickProjectViewStateV1,
  options: {now?: () => string; commitPort?: StickStorageCommitPortV1; aiCreationLatch?: StickAiCreationLatchV1} = {},
): Promise<StickStorageResult<void>> => {
  const read = readStickSavedProjects(storage);
  if (!read.ok) return read;
  const prepared = prepareStickProjectSave(
    read.value.raw,
    document,
    reopenState,
    options.now ?? (() => new Date().toISOString()),
    options.aiCreationLatch,
  );
  if (!prepared.ok) return prepared;
  return (options.commitPort ?? createBrowserStickStorageCommitPort(storage)).commit(prepared.value);
};

export const stickStorageErrorMessage = (error: StickStorageErrorCodeV1) => {
  if (error === "storage_read_failed") return "Saved projects could not be read in this browser. No project data changed.";
  if (error === "project_not_found") return "That saved Stick project is no longer available. No project data changed.";
  if (error === "quota_exceeded" || error === "storage_limit_exceeded") return "Save failed — this browser does not have enough local storage. Your changes are still unsaved.";
  if (error === "corrupt_storage" || error === "unsupported_storage_version" || error === "invalid_saved_project") return "Saved Stick projects are invalid or unsupported. No project data changed.";
  return "Save failed — your changes are still unsaved.";
};
