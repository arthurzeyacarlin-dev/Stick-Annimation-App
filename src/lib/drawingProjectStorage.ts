import type { TimelineFrameCellType, TimelineFrameKind } from "../components/workspace/DrawingTimelineRow";
import type { DrawingShapeType, DrawingToolName } from "../components/workspace/DrawingToolBar";
import type { DrawingTextFontFamily } from "../components/workspace/drawingText";
import type { DrawingAiProjectMemory } from "./ai/drawingAiContract.ts";
import { sanitizeDrawingAiProjectMemory } from "./ai/drawingAiContract.ts";
import {
  bindDrawingAiProjectMemoryToProject,
  scopeDrawingAiProjectMemoryToProject,
} from "./ai/drawingAiProjectMemory.ts";
import {
  DrawingProjectV2Error,
  parseDrawingProjectDocumentV2,
  parseDrawingProjectHeadV2,
  type DrawingProjectAssetV2,
  type DrawingProjectAudioAssetV2,
  type DrawingProjectDocumentV2,
  type DrawingProjectHeadV2,
  type DrawingProjectVersionRecordV2,
} from "./drawingProjectV2Contract.ts";
import { sha256Hex, verifyRecordCanonicalFields } from "./drawingProjectV2Canonical.ts";
import { createDrawingProjectIndexedDbAdapter, DRAWING_PROJECT_INDEXED_DB } from "./drawingProjectIndexedDb.ts";
import { createDrawingProjectV2Repository, type DrawingProjectDeleteResult } from "./drawingProjectV2Repository.ts";
import {
  attemptDrawingProjectLegacyCleanup,
  DRAWING_PROJECT_LEGACY_MAINTENANCE_LOCK,
  DRAWING_PROJECT_V1_STORAGE_KEY,
  readDrawingProjectV1Storage,
  type DrawingProjectV1ClassifiedEntry,
  type DrawingProjectV1ReadResult,
} from "./drawingProjectV1Compatibility.ts";
import { encodeDrawingRasterAsset, verifyDrawingProjectRasters } from "./drawingProjectRasterCodec.ts";
import { hydrateDrawingSoundAttachment, snapshotDrawingSoundAttachment } from "./drawingProjectAudioCodec.ts";

export type SerializedBitmap = {
  width: number;
  height: number;
  data: number[] | Uint8Array | Uint8ClampedArray;
};

export type StoredMotionTweenData = {
  mode: "position";
  stageWidth: number;
  stageHeight: number;
  spriteBitmap: SerializedBitmap | null;
  startOrigin: { x: number; y: number } | null;
  endOrigin: { x: number; y: number } | null;
};

export type StoredDrawingSoundAttachment = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl?: string | null;
  contentType?: "sfx" | "voice-placeholder" | null;
  speechText?: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

export type StoredDrawingTextObject = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  flipX?: boolean;
  flipY?: boolean;
  rotation?: number;
  fontFamily: DrawingTextFontFamily;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

export type StoredDrawingTimelineFrame = {
  id: number;
  kind: TimelineFrameKind;
  cellType: TimelineFrameCellType;
  stateId: number;
  isBlank?: boolean;
  hasTweenEndpoint?: boolean;
  bitmap: SerializedBitmap | null;
  previewUrl: string | null;
  tweenEndBitmap: SerializedBitmap | null;
  tweenEndPreviewUrl: string | null;
  motionTween: StoredMotionTweenData | null;
  soundAttachment?: StoredDrawingSoundAttachment | null;
  textObjects?: StoredDrawingTextObject[] | null;
};

export type StoredDrawingLayer = {
  id: string;
  name: string;
  orderIndex: number;
  timelineFrames: StoredDrawingTimelineFrame[];
};

export type DrawingProjectData = {
  version: 1;
  activeTool: DrawingToolName;
  brushSize: number;
  eraserSize: number;
  fillColor: string;
  timelineFps: number;
  shapeType: DrawingShapeType;
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  isOnionEnabled: boolean;
  layers: StoredDrawingLayer[];
  nextTimelineFrameId: number;
  nextLayerNumber: number;
};

export type StoredDrawingProject = {
  id: string;
  name: string;
  data: DrawingProjectData;
  previewDataUrl: string | null;
  aiMemory?: DrawingAiProjectMemory | null;
  created_at: string;
  updated_at: string;
};

export type DrawingProjectCatalogEntry = {
  id: string;
  projectId: string | null;
  name: string;
  updatedAt: string | null;
  createdAt: string | null;
  storedByteLength: number;
  previewDataUrl: string | null;
} & (
  | { kind: "v2"; head: DrawingProjectHeadV2; legacyRecordDigest: string | null }
  | {
      kind: "legacy";
      entry: DrawingProjectV1ClassifiedEntry;
      capturedRootDigest: string;
      legacyRecordDigest: string;
    }
  | { kind: "unavailable"; code: "invalid_record" | "unsupported_version" | "legacy_read_failed"; detail: string }
);

export type DrawingProjectOpenCandidate = {
  kind: "v2" | "legacy";
  project: StoredDrawingProject;
  head: DrawingProjectHeadV2 | null;
  record: DrawingProjectVersionRecordV2 | null;
  legacyRecordDigest: string | null;
};

export type SaveStoredDrawingProjectInput = {
  id?: string | null;
  name: string;
  data: DrawingProjectData;
  previewDataUrl?: string | null;
  aiMemory?: DrawingAiProjectMemory | null;
  expectedRevision?: number | null;
  createdAt?: string | null;
  legacyRecordDigest?: string | null;
};

export type SaveStoredDrawingProjectResult = {
  status: "saved";
  project: StoredDrawingProject;
  head: DrawingProjectHeadV2;
  record: DrawingProjectVersionRecordV2;
  maintenance: "clean" | "pending";
};

const isBrowser = () => typeof window !== "undefined" && typeof indexedDB !== "undefined";
const createProjectId = () => globalThis.crypto?.randomUUID?.() ?? `drawing-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const sanitizeProjectName = (name: string) => name.trim() || "Unnamed drawing project";
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const clone = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

const legacyStorage = () => ({
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
});

const legacyLock = () => ({
  request: async <T>(name: string, callback: () => Promise<T>): Promise<T | null> => {
    if (!navigator.locks) return null;
    return navigator.locks.request(name, { mode: "exclusive", ifAvailable: true }, async (lock) => lock ? callback() : null);
  },
});

let runtime: {
  adapter: ReturnType<typeof createDrawingProjectIndexedDbAdapter>;
  repository: ReturnType<typeof createDrawingProjectV2Repository>;
} | null = null;

const getRuntime = () => {
  if (!isBrowser()) throw new DrawingProjectV2Error("storage_read_failed", "storage.browser", "Drawing project storage requires a browser.");
  if (runtime) return runtime;
  const adapter = createDrawingProjectIndexedDbAdapter({ indexedDB });
  const repository = createDrawingProjectV2Repository(adapter, {
    legacyMaintainer: (projectId, digest) =>
      attemptDrawingProjectLegacyCleanup(legacyStorage(), legacyLock(), projectId, digest),
  });
  runtime = { adapter, repository };
  return runtime;
};

const requestValue = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.addEventListener("complete", () => resolve(), { once: true });
  transaction.addEventListener("abort", () => reject(transaction.error ?? new DOMException("Transaction aborted.", "AbortError")), { once: true });
  transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Transaction failed.")), { once: true });
});

const openCompanionDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DRAWING_PROJECT_INDEXED_DB.name, DRAWING_PROJECT_INDEXED_DB.version);
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB open failed.")), { once: true });
  request.addEventListener("blocked", () => reject(new Error("IndexedDB open blocked.")), { once: true });
});

const readAuxiliaryMemory = async (projectId: string) => {
  const database = await openCompanionDatabase();
  try {
    const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.auxiliary, "readonly");
    const completion = transactionDone(transaction);
    const value = await requestValue(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.auxiliary).get(projectId)) as
      | { projectId: string; aiMemory?: unknown }
      | undefined;
    await completion;
    return scopeDrawingAiProjectMemoryToProject(sanitizeDrawingAiProjectMemory(value?.aiMemory) ?? null, projectId);
  } finally {
    database.close();
  }
};

const writeAuxiliaryMemory = async (projectId: string, aiMemory: DrawingAiProjectMemory | null) => {
  const scoped = scopeDrawingAiProjectMemoryToProject(aiMemory, projectId);
  if (aiMemory !== null && scoped === null) throw new DrawingProjectV2Error("invalid_record", "auxiliary.aiMemory", "AI memory does not match the project.");
  const database = await openCompanionDatabase();
  try {
    const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.auxiliary, "readwrite");
    const completion = transactionDone(transaction);
    transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.auxiliary).put({ projectId, aiMemory: clone(scoped) });
    await completion;
  } finally {
    database.close();
  }
  return scoped;
};

const readLegacy = (): Promise<DrawingProjectV1ReadResult> => readDrawingProjectV1Storage(legacyStorage());

const nativePngEncoder = async ({ width, height, rgba }: { width: number; height: number; rgba: Uint8Array }) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding returned no data.")), "image/png"),
  );
};

const nativePngDecoder = async (bytes: Uint8Array, expected: { width: number; height: number }) => {
  const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/png" }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = expected.width;
    canvas.height = expected.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, expected.width, expected.height);
    return { width: image.width, height: image.height, rgba: new Uint8Array(image.data), release: () => bitmap.close() };
  } catch (error) {
    bitmap.close();
    throw error;
  }
};

const encodeBitmap = async (
  value: SerializedBitmap | null,
  assets: Map<string, DrawingProjectAssetV2>,
) => {
  if (!value) return null;
  const rgba = Array.isArray(value.data)
    ? Uint8Array.from(value.data)
    : new Uint8Array(value.data.buffer, value.data.byteOffset, value.data.byteLength);
  const digest = await sha256Hex(rgba);
  const assetId = `raster-${digest}`;
  if (!assets.has(assetId)) {
    assets.set(assetId, await encodeDrawingRasterAsset({ assetId, width: value.width, height: value.height, rgba }, nativePngEncoder));
  }
  return { assetId };
};

const createV2Document = async (data: DrawingProjectData) => {
  const assets = new Map<string, DrawingProjectAssetV2>();
  const layers = [] as DrawingProjectDocumentV2["layers"];
  for (const layer of data.layers) {
    const timelineFrames = [] as DrawingProjectDocumentV2["layers"][number]["timelineFrames"];
    for (const frame of layer.timelineFrames) {
      const blank = frame.cellType === "blank-keyframe" || frame.isBlank === true;
      const bitmap = blank ? null : await encodeBitmap(frame.bitmap, assets);
      const tweenEndBitmap = blank ? null : await encodeBitmap(frame.tweenEndBitmap, assets);
      const spriteBitmap = blank ? null : await encodeBitmap(frame.motionTween?.spriteBitmap ?? null, assets);
      let soundAttachment = null;
      if (!blank && frame.soundAttachment) {
        const snapshot = await snapshotDrawingSoundAttachment({
          ...frame.soundAttachment,
          timingFeel: frame.soundAttachment.timingFeel ?? null,
          intensityFeel: frame.soundAttachment.intensityFeel ?? null,
          audioDataUrl: frame.soundAttachment.audioDataUrl ?? null,
          contentType: frame.soundAttachment.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
          speechText: frame.soundAttachment.speechText ?? null,
        });
        soundAttachment = snapshot.attachment;
        if (snapshot.asset) assets.set(snapshot.asset.assetId, snapshot.asset);
      }
      timelineFrames.push({
        id: frame.id,
        kind: frame.kind,
        cellType: frame.cellType,
        stateId: frame.stateId,
        isBlank: blank,
        hasTweenEndpoint: tweenEndBitmap !== null,
        bitmap,
        tweenEndBitmap,
        motionTween: blank || !frame.motionTween ? null : {
          mode: "position",
          stageWidth: frame.motionTween.stageWidth,
          stageHeight: frame.motionTween.stageHeight,
          spriteBitmap,
          startOrigin: frame.motionTween.startOrigin ? { ...frame.motionTween.startOrigin } : null,
          endOrigin: frame.motionTween.endOrigin ? { ...frame.motionTween.endOrigin } : null,
        },
        soundAttachment,
        textObjects: blank ? [] : (frame.textObjects ?? []).map((text) => ({
          id: text.id,
          text: text.text,
          x: text.x,
          y: text.y,
          width: text.width,
          flipX: Boolean(text.flipX),
          flipY: Boolean(text.flipY),
          rotation: text.rotation ?? 0,
          fontFamily: text.fontFamily,
          fontSize: text.fontSize,
          color: text.color,
          bold: text.bold,
          italic: text.italic,
        })),
      });
    }
    layers.push({ id: layer.id, name: layer.name, orderIndex: layer.orderIndex, timelineFrames });
  }
  const document: DrawingProjectDocumentV2 = {
    kind: "diamond-drawing-document",
    schemaVersion: 2,
    activeTool: data.activeTool,
    brushSize: data.brushSize,
    eraserSize: data.eraserSize,
    fillColor: data.fillColor,
    timelineFps: data.timelineFps,
    shapeType: data.shapeType,
    activeLayerId: data.activeLayerId,
    currentFrameIndex: data.currentFrameIndex,
    selectedTimelineIndex: data.selectedTimelineIndex,
    isOnionEnabled: data.isOnionEnabled,
    layers,
    nextTimelineFrameId: data.nextTimelineFrameId,
    nextLayerNumber: data.nextLayerNumber,
  };
  parseDrawingProjectDocumentV2(document);
  return { document, assets: [...assets.values()] };
};

const serializedBitmap = (value: { width: number; height: number; rgba: Uint8Array } | undefined): SerializedBitmap | null =>
  value ? { width: value.width, height: value.height, data: value.rgba.slice() } : null;

const hydrateV2Project = async (
  head: DrawingProjectHeadV2,
  record: DrawingProjectVersionRecordV2,
): Promise<StoredDrawingProject> => {
  const verifiedRasters = await verifyDrawingProjectRasters(record.document, record.assets, nativePngDecoder);
  const assets = new Map(record.assets.map((asset) => [asset.assetId, asset]));
  const layers: StoredDrawingLayer[] = [];
  for (const layer of record.document.layers) {
    const timelineFrames: StoredDrawingTimelineFrame[] = [];
    for (const frame of layer.timelineFrames) {
      let soundAttachment: StoredDrawingSoundAttachment | null = null;
      if (frame.soundAttachment) {
        const reference = frame.soundAttachment.audioDataUrl;
        const audio = reference ? assets.get(reference.assetId) : null;
        soundAttachment = await hydrateDrawingSoundAttachment(
          frame.soundAttachment,
          audio?.kind === "audio" ? audio as DrawingProjectAudioAssetV2 : null,
        );
      }
      timelineFrames.push({
        id: frame.id,
        kind: frame.kind,
        cellType: frame.cellType,
        stateId: frame.stateId,
        isBlank: frame.isBlank,
        hasTweenEndpoint: frame.hasTweenEndpoint,
        bitmap: frame.bitmap ? serializedBitmap(verifiedRasters.materializations.get(frame.bitmap.assetId)) : null,
        previewUrl: null,
        tweenEndBitmap: frame.tweenEndBitmap ? serializedBitmap(verifiedRasters.materializations.get(frame.tweenEndBitmap.assetId)) : null,
        tweenEndPreviewUrl: null,
        motionTween: frame.motionTween ? {
          mode: "position",
          stageWidth: frame.motionTween.stageWidth,
          stageHeight: frame.motionTween.stageHeight,
          spriteBitmap: frame.motionTween.spriteBitmap
            ? serializedBitmap(verifiedRasters.materializations.get(frame.motionTween.spriteBitmap.assetId))
            : null,
          startOrigin: frame.motionTween.startOrigin ? { ...frame.motionTween.startOrigin } : null,
          endOrigin: frame.motionTween.endOrigin ? { ...frame.motionTween.endOrigin } : null,
        } : null,
        soundAttachment,
        textObjects: frame.textObjects.map((text) => ({ ...text })),
      });
    }
    layers.push({ id: layer.id, name: layer.name, orderIndex: layer.orderIndex, timelineFrames });
  }
  const document = record.document;
  return {
    id: head.projectId,
    name: head.title,
    previewDataUrl: null,
    aiMemory: await readAuxiliaryMemory(head.projectId).catch(() => null),
    created_at: head.createdAt,
    updated_at: head.updatedAt,
    data: {
      version: 1,
      activeTool: document.activeTool,
      brushSize: document.brushSize,
      eraserSize: document.eraserSize,
      fillColor: document.fillColor,
      timelineFps: document.timelineFps,
      shapeType: document.shapeType,
      activeLayerId: document.activeLayerId,
      currentFrameIndex: document.currentFrameIndex,
      selectedTimelineIndex: document.selectedTimelineIndex,
      isOnionEnabled: document.isOnionEnabled,
      layers,
      nextTimelineFrameId: document.nextTimelineFrameId,
      nextLayerNumber: document.nextLayerNumber,
    },
  };
};

const matchingLegacyEntry = (legacy: DrawingProjectV1ReadResult, projectId: string) =>
  legacy.status === "valid-array" ? legacy.entries.find((entry) => entry.projectId === projectId) ?? null : null;

export const listStoredDrawingProjects = async (): Promise<DrawingProjectCatalogEntry[]> => {
  if (!isBrowser()) return [];
  const { repository } = getRuntime();
  const initialLegacy = await readLegacy();
  await repository.runBoundedMaintenance(initialLegacy).catch(() => []);
  const legacy = await readLegacy();
  const catalog = await repository.loadCatalog(legacy);
  const entries: DrawingProjectCatalogEntry[] = catalog.entries.map((entry) => {
    if (entry.kind === "v2") {
      const legacyEntry = matchingLegacyEntry(legacy, entry.projectId);
      return {
        kind: "v2",
        id: entry.projectId,
        projectId: entry.projectId,
        name: entry.title,
        createdAt: entry.head.createdAt,
        updatedAt: entry.head.updatedAt,
        storedByteLength: entry.head.activeStoredByteLength,
        previewDataUrl: null,
        head: entry.head,
        legacyRecordDigest: legacyEntry?.canonicalRecordDigest ?? null,
      };
    }
    const legacyEntry = entry.entry;
    if (legacyEntry.classification === "valid-v1" && legacyEntry.projectId && legacyEntry.canonicalRecordDigest && legacy.status === "valid-array") {
      const project = legacyEntry.value as StoredDrawingProject;
      return {
        kind: "legacy",
        id: project.id,
        projectId: project.id,
        name: project.name,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        storedByteLength: byteLength(legacyEntry.rawSlice),
        previewDataUrl: project.previewDataUrl ?? null,
        entry: legacyEntry,
        capturedRootDigest: legacy.rootDigest,
        legacyRecordDigest: legacyEntry.canonicalRecordDigest,
      };
    }
    return {
      kind: "unavailable",
      id: `legacy-${legacyEntry.index}-${legacyEntry.rawSliceDigest}`,
      projectId: legacyEntry.projectId,
      name: legacyEntry.projectId ? `Unavailable project ${legacyEntry.projectId}` : "Unavailable local project",
      createdAt: null,
      updatedAt: null,
      storedByteLength: byteLength(legacyEntry.rawSlice),
      previewDataUrl: null,
      code: legacyEntry.classification === "unsupported" ? "unsupported_version" : "invalid_record",
      detail: legacyEntry.classification === "unsupported" ? "This project was saved by a newer unsupported version." : "This project is corrupt and was left unchanged.",
    };
  });
  if (legacy.status === "corrupt-root" || legacy.status === "read-failed") {
    entries.push({
      kind: "unavailable",
      id: "legacy-storage-root",
      projectId: null,
      name: "Legacy local projects unavailable",
      createdAt: null,
      updatedAt: null,
      storedByteLength: legacy.status === "corrupt-root" ? byteLength(legacy.rawRoot) : 0,
      previewDataUrl: null,
      code: legacy.status === "read-failed" ? "legacy_read_failed" : "invalid_record",
      detail: legacy.status === "read-failed" ? "Local project storage could not be read." : "Legacy project storage is corrupt and was left unchanged.",
    });
  }
  return entries.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.id.localeCompare(right.id));
};

export const openStoredDrawingProject = async (entry: DrawingProjectCatalogEntry): Promise<DrawingProjectOpenCandidate> => {
  if (entry.kind === "unavailable") throw new DrawingProjectV2Error(entry.code === "legacy_read_failed" ? "legacy_read_failed" : entry.code, "open.catalog", entry.detail);
  if (entry.kind === "legacy") {
    const current = await readLegacy();
    if (current.status !== "valid-array" || current.rootDigest !== entry.capturedRootDigest) {
      throw new DrawingProjectV2Error("legacy_read_failed", "open.legacy-readback", "The legacy project collection changed. Refresh and try again.");
    }
    const target = current.entries[entry.entry.index];
    if (!target || target.rawSliceDigest !== entry.entry.rawSliceDigest || target.canonicalRecordDigest !== entry.legacyRecordDigest) {
      throw new DrawingProjectV2Error("legacy_corrupt", "open.legacy-readback", "The legacy project changed. Refresh and try again.");
    }
    const project = clone(target.value as StoredDrawingProject);
    project.aiMemory = await readAuxiliaryMemory(project.id).catch(() => project.aiMemory ?? null);
    return { kind: "legacy", project, head: null, record: null, legacyRecordDigest: entry.legacyRecordDigest };
  }
  const { adapter } = getRuntime();
  const headValue = await adapter.getHead(entry.head.projectId);
  if (headValue === null) throw new DrawingProjectV2Error("project_not_found", "open.head", "The project no longer exists.");
  const head = parseDrawingProjectHeadV2(headValue);
  const recordValue = await adapter.readVersion(head.projectId, head.activeStorageRevision);
  if (recordValue === null) throw new DrawingProjectV2Error("storage_read_failed", "open.version", "The active project version is missing.");
  const record = await verifyRecordCanonicalFields(recordValue);
  if (
    record.projectId !== head.projectId ||
    record.storageRevision !== head.activeStorageRevision ||
    record.documentDigest !== head.documentDigest ||
    record.storedByteLength !== head.activeStoredByteLength
  ) {
    throw new DrawingProjectV2Error("candidate_readback_mismatch", "open.head-record", "The project head and active version do not match.");
  }
  return {
    kind: "v2",
    project: await hydrateV2Project(head, record),
    head,
    record,
    legacyRecordDigest: entry.legacyRecordDigest,
  };
};

export const getStoredDrawingProject = async (projectId: string) => {
  const entry = (await listStoredDrawingProjects()).find((candidate) => candidate.projectId === projectId && candidate.kind !== "unavailable");
  return entry ? openStoredDrawingProject(entry) : null;
};

export const getStoredDrawingProjectSizeBytes = (project: StoredDrawingProject) => byteLength(JSON.stringify(project));

export const saveStoredDrawingProject = async (input: SaveStoredDrawingProjectInput): Promise<SaveStoredDrawingProjectResult> => {
  const { repository } = getRuntime();
  const timestamp = new Date().toISOString();
  const title = sanitizeProjectName(input.name);
  const candidate = await createV2Document(input.data);
  const saveInput = {
    title,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
    document: candidate.document,
    assets: candidate.assets,
  };
  const saved = input.id
    ? await repository.save({ ...saveInput, projectId: input.id, expectedRevision: input.expectedRevision ?? null })
    : await repository.saveAs({ ...saveInput, createProjectId });
  const memory = bindDrawingAiProjectMemoryToProject(input.aiMemory ?? null, saved.head.projectId);
  await writeAuxiliaryMemory(saved.head.projectId, memory).catch(() => undefined);
  let maintenance = saved.maintenance;
  if (input.legacyRecordDigest) {
    const cleanup = await attemptDrawingProjectLegacyCleanup(
      legacyStorage(),
      legacyLock(),
      saved.head.projectId,
      input.legacyRecordDigest,
    );
    if (cleanup.status === "pending") maintenance = "pending";
  }
  return {
    status: "saved",
    head: saved.head,
    record: saved.record,
    maintenance,
    project: {
      id: saved.head.projectId,
      name: saved.head.title,
      data: input.data,
      previewDataUrl: input.previewDataUrl ?? null,
      aiMemory: memory,
      created_at: saved.head.createdAt,
      updated_at: saved.head.updatedAt,
    },
  };
};

export const updateStoredDrawingProjectAiMemory = async (projectId: string, aiMemory: DrawingAiProjectMemory | null) => {
  getRuntime();
  return writeAuxiliaryMemory(projectId, aiMemory);
};

export const renameStoredDrawingProject = async (entry: DrawingProjectCatalogEntry, nextName: string) => {
  if (entry.kind !== "v2") throw new DrawingProjectV2Error("unsupported_version", "rename.legacy", "Legacy projects must be opened and saved before rename.");
  return getRuntime().repository.rename({
    projectId: entry.head.projectId,
    title: sanitizeProjectName(nextName),
    updatedAt: new Date().toISOString(),
    expectedRevision: entry.head.activeStorageRevision,
  });
};

export const duplicateStoredDrawingProject = async (entry: DrawingProjectCatalogEntry) => {
  const opened = await openStoredDrawingProject(entry);
  return saveStoredDrawingProject({
    name: `${opened.project.name} (Copy)`,
    data: opened.project.data,
    aiMemory: opened.project.aiMemory ?? null,
  });
};

export const deleteStoredDrawingProject = async (entry: DrawingProjectCatalogEntry): Promise<DrawingProjectDeleteResult> => {
  if (entry.kind === "unavailable") return { status: "failed", code: "legacy_corrupt" };
  const { repository } = getRuntime();
  if (entry.kind === "v2") {
    return repository.deleteV2({
      projectId: entry.head.projectId,
      expectedRevision: entry.head.activeStorageRevision,
      legacyRecordDigest: entry.legacyRecordDigest,
    });
  }
  return repository.deleteLegacyOnly({
    classifiedEntry: entry.entry,
    capturedRootDigest: entry.capturedRootDigest,
    verifyExactTarget: async () => {
      const current = await readLegacy();
      if (current.status !== "valid-array" || current.rootDigest !== entry.capturedRootDigest) return false;
      const target = current.entries[entry.entry.index];
      return Boolean(
        target &&
        target.rawSliceDigest === entry.entry.rawSliceDigest &&
        target.canonicalRecordDigest === entry.legacyRecordDigest,
      );
    },
  });
};

export const runStoredDrawingProjectMaintenance = async () => {
  const legacy = await readLegacy();
  return getRuntime().repository.runBoundedMaintenance(legacy);
};

export const closeDrawingProjectStorage = async () => {
  if (!runtime) return;
  await runtime.adapter.close();
  runtime = null;
};

export { DRAWING_PROJECT_LEGACY_MAINTENANCE_LOCK, DRAWING_PROJECT_V1_STORAGE_KEY };
