import type { TimelineFrameCellType, TimelineFrameKind } from "../components/workspace/DrawingTimelineRow";
import type { DrawingShapeType, DrawingToolName } from "../components/workspace/DrawingToolBar";
import type { DrawingTextFontFamily } from "../components/workspace/drawingText";
import type { DrawingAiProjectMemory } from "./ai/drawingAiContract.ts";
import { sanitizeDrawingAiProjectMemory } from "./ai/drawingAiContract.ts";
import {
  bindDrawingAiProjectMemoryToProject,
  scopeDrawingAiProjectMemoryToProject,
} from "./ai/drawingAiProjectMemory.ts";

const DRAWING_PROJECTS_STORAGE_KEY = "da_saved_drawing_projects";

export type SerializedBitmap = {
  width: number;
  height: number;
  data: number[];
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

type SaveStoredDrawingProjectInput = {
  id?: string | null;
  name: string;
  data: DrawingProjectData;
  previewDataUrl?: string | null;
  aiMemory?: DrawingAiProjectMemory | null;
};

const isBrowser = () => typeof window !== "undefined";

const createProjectId = () =>
  globalThis.crypto?.randomUUID?.() ?? `drawing-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const sanitizeProjectName = (name: string) => {
  const trimmedName = name.trim();
  return trimmedName.length > 0 ? trimmedName : "Unnamed drawing project";
};

const getSerializedProjectString = (project: StoredDrawingProject) => JSON.stringify(project);

const getSerializedStringByteLength = (value: string) => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  return new Blob([value]).size;
};

const cloneDrawingProjectData = (data: DrawingProjectData): DrawingProjectData => {
  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data)) as DrawingProjectData;
  }
};

const cloneDrawingAiProjectMemory = (memory: DrawingAiProjectMemory | null | undefined): DrawingAiProjectMemory | null => {
  if (!memory) {
    return null;
  }

  try {
    return structuredClone(memory);
  } catch {
    return JSON.parse(JSON.stringify(memory)) as DrawingAiProjectMemory;
  }
};

const readStoredDrawingProjects = (): StoredDrawingProject[] => {
  if (!isBrowser()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(DRAWING_PROJECTS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(
        (project): project is StoredDrawingProject =>
          Boolean(project) &&
          typeof project.id === "string" &&
          typeof project.name === "string" &&
          ("previewDataUrl" in project ? typeof project.previewDataUrl === "string" || project.previewDataUrl === null : true) &&
          ("aiMemory" in project
            ? project.aiMemory === null || project.aiMemory === undefined || sanitizeDrawingAiProjectMemory(project.aiMemory) !== null
            : true) &&
          typeof project.created_at === "string" &&
          typeof project.updated_at === "string" &&
          typeof project.data === "object" &&
          project.data !== null,
      )
      .map((project) => ({
        ...project,
        aiMemory: scopeDrawingAiProjectMemoryToProject(sanitizeDrawingAiProjectMemory(project.aiMemory) ?? null, project.id),
      }));
  } catch {
    return [];
  }
};

const writeStoredDrawingProjects = (projects: StoredDrawingProject[]) => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(DRAWING_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
};

const isQuotaExceededError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");

export const listStoredDrawingProjects = () =>
  readStoredDrawingProjects().sort(
    (leftProject, rightProject) =>
      new Date(rightProject.updated_at).getTime() - new Date(leftProject.updated_at).getTime(),
  );

export const getStoredDrawingProject = (projectId: string) =>
  readStoredDrawingProjects().find((project) => project.id === projectId) ?? null;

export const getStoredDrawingProjectSizeBytes = (project: StoredDrawingProject) =>
  getSerializedStringByteLength(getSerializedProjectString(project));

export const updateStoredDrawingProjectAiMemory = (
  projectId: string,
  aiMemory: DrawingAiProjectMemory | null,
) => {
  const existingProjects = readStoredDrawingProjects();
  const targetProjectIndex = existingProjects.findIndex((project) => project.id === projectId);
  if (targetProjectIndex < 0) {
    return null;
  }

  const scopedAiMemory = scopeDrawingAiProjectMemoryToProject(aiMemory, projectId);
  if (aiMemory != null && scopedAiMemory == null) {
    return null;
  }

  const nextProject: StoredDrawingProject = {
    ...existingProjects[targetProjectIndex],
    aiMemory: cloneDrawingAiProjectMemory(scopedAiMemory),
    updated_at: new Date().toISOString(),
  };
  const nextProjects = existingProjects.map((project, index) => (index === targetProjectIndex ? nextProject : project));
  writeStoredDrawingProjects(nextProjects);
  return nextProject;
};

export const deleteStoredDrawingProject = (projectId: string) => {
  const existingProjects = readStoredDrawingProjects();
  const nextProjects = existingProjects.filter((project) => project.id !== projectId);
  if (nextProjects.length === existingProjects.length) {
    return false;
  }

  writeStoredDrawingProjects(nextProjects);
  return true;
};

export const duplicateStoredDrawingProject = (projectId: string) => {
  const sourceProject = getStoredDrawingProject(projectId);
  if (!sourceProject) {
    return null;
  }

  return saveStoredDrawingProject({
    name: `${sourceProject.name} (Copy)`,
    data: cloneDrawingProjectData(sourceProject.data),
    previewDataUrl: sourceProject.previewDataUrl,
    aiMemory: sourceProject.aiMemory ?? null,
  });
};

export const renameStoredDrawingProject = (projectId: string, nextName: string) => {
  const sourceProject = getStoredDrawingProject(projectId);
  if (!sourceProject) {
    return null;
  }

  return saveStoredDrawingProject({
    id: sourceProject.id,
    name: nextName,
    data: sourceProject.data,
    previewDataUrl: sourceProject.previewDataUrl,
    aiMemory: sourceProject.aiMemory ?? null,
  });
};

export const saveStoredDrawingProject = ({
  id,
  name,
  data,
  previewDataUrl,
  aiMemory,
}: SaveStoredDrawingProjectInput): StoredDrawingProject => {
  const existingProjects = readStoredDrawingProjects();
  const currentTimestamp = new Date().toISOString();
  const resolvedName = sanitizeProjectName(name);
  const resolvedData = cloneDrawingProjectData(data);
  const existingProjectIndex = id ? existingProjects.findIndex((project) => project.id === id) : -1;
  const resolvedProjectId = existingProjectIndex >= 0 ? existingProjects[existingProjectIndex].id : id ?? createProjectId();
  const resolvedAiMemory = bindDrawingAiProjectMemoryToProject(
    aiMemory === undefined ? (existingProjectIndex >= 0 ? existingProjects[existingProjectIndex].aiMemory ?? null : null) : aiMemory,
    resolvedProjectId,
  );

  const savedProject: StoredDrawingProject =
    existingProjectIndex >= 0
      ? {
          ...existingProjects[existingProjectIndex],
          name: resolvedName,
          data: resolvedData,
          previewDataUrl:
            previewDataUrl === undefined
              ? existingProjects[existingProjectIndex].previewDataUrl ?? null
              : previewDataUrl,
          aiMemory: cloneDrawingAiProjectMemory(resolvedAiMemory),
          updated_at: currentTimestamp,
        }
      : {
          id: resolvedProjectId,
          name: resolvedName,
          data: resolvedData,
          previewDataUrl: previewDataUrl ?? null,
          aiMemory: cloneDrawingAiProjectMemory(resolvedAiMemory),
          created_at: currentTimestamp,
          updated_at: currentTimestamp,
        };

  const nextProjects =
    existingProjectIndex >= 0
      ? existingProjects.map((project, index) => (index === existingProjectIndex ? savedProject : project))
      : [savedProject, ...existingProjects];

  try {
    writeStoredDrawingProjects(nextProjects);
    return savedProject;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    const fallbackProjects = nextProjects.map((project) => ({
      ...project,
      previewDataUrl: null,
    }));
    const fallbackProjectIndex = existingProjectIndex >= 0 ? existingProjectIndex : 0;
    const fallbackSavedProject = {
      ...fallbackProjects[fallbackProjectIndex],
      previewDataUrl: null,
    };
    fallbackProjects[fallbackProjectIndex] = fallbackSavedProject;
    writeStoredDrawingProjects(fallbackProjects);
    return fallbackSavedProject;
  }
};
