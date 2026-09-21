import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";
import {
  digestUnifiedProjectV2,
  deleteUnifiedProjectV2,
  readUnifiedProjectV2,
  writeUnifiedProjectV2,
} from "./unifiedProjectStorageV2.ts";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import { bindDrawingAiProjectMemoryToProject } from "../ai/drawingAiProjectMemory.ts";

type UnifiedRepositoryStorageV2 = {
  read: (projectId: string) => Promise<UnifiedAnimationProjectV2>;
  write: (project: UnifiedAnimationProjectV2, expectedRevision: number | null) => Promise<UnifiedAnimationProjectV2>;
  deleteProject?: (projectId: string, expectedRevision: number, expectedDigest: string) => Promise<{ projectId: string; deletedAssetIds: string[] }>;
};

export type UnifiedProjectRepositoryOptionsV2 = {
  now?: () => string;
  createId?: () => string;
  storage?: UnifiedRepositoryStorageV2;
};

export const UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2 = "diamond-animation-project-editor-identity-v2";

const announceEditorProjectIdentity = (project: UnifiedAnimationProjectV2) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UNIFIED_PROJECT_EDITOR_IDENTITY_EVENT_V2, { detail: { projectId: project.projectId } }));
};

const sanitizeTitle = (title: string) => title.trim() || "Untitled Project";

const rebindProject = (project: UnifiedAnimationProjectV2, projectId: string): UnifiedAnimationProjectV2 => {
  const rebound = structuredClone(project);
  rebound.projectId = projectId;
  rebound.document.projectId = projectId;
  if (rebound.auxiliary?.stickAiCreationLatch) rebound.auxiliary.stickAiCreationLatch.projectId = projectId;
  if (rebound.auxiliary?.drawingAiMemory) {
    const drawingMemory = sanitizeDrawingAiProjectMemory(rebound.auxiliary.drawingAiMemory);
    if (!drawingMemory) throw new Error("invalid_record");
    rebound.auxiliary.drawingAiMemory = bindDrawingAiProjectMemoryToProject(drawingMemory, projectId);
  }
  return rebound;
};

export const createUnifiedProjectRepositoryV2 = (options: UnifiedProjectRepositoryOptionsV2 = {}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const storage = options.storage ?? { read: readUnifiedProjectV2, write: writeUnifiedProjectV2, deleteProject: deleteUnifiedProjectV2 };

  return {
    async save(project: UnifiedAnimationProjectV2) {
      const timestamp = now();
      const pendingAdoption = project.provenance?.kind === "legacy-adoption" && project.provenance.adoptedAt === null;
      if (pendingAdoption) {
        const candidate = rebindProject(project, createId());
        candidate.updatedAt = timestamp;
        candidate.revision = 1;
        candidate.title = sanitizeTitle(candidate.title);
        candidate.provenance = { ...candidate.provenance!, adoptedAt: timestamp } as Extract<UnifiedAnimationProjectV2["provenance"], { kind: "legacy-adoption" }>;
        return storage.write(candidate, null);
      }
      const candidate = structuredClone(project);
      candidate.updatedAt = timestamp;
      candidate.revision = project.revision + 1;
      candidate.title = sanitizeTitle(candidate.title);
      if (!candidate.provenance) candidate.provenance = { kind: "native" };
      if (!candidate.auxiliary) candidate.auxiliary = { drawingAiMemory: null, stickAiCreationLatch: null };
      return storage.write(candidate, project.revision === 0 ? null : project.revision);
    },

    async saveAs(project: UnifiedAnimationProjectV2, title: string) {
      const timestamp = now();
      const parentProjectDigest = await digestUnifiedProjectV2(project);
      const candidate = rebindProject(project, createId());
      candidate.title = sanitizeTitle(title);
      candidate.createdAt = timestamp;
      candidate.updatedAt = timestamp;
      candidate.revision = 1;
      candidate.provenance = {
        kind: "copy",
        parentProjectId: project.projectId,
        parentRevision: project.revision,
        parentProjectDigest,
      };
      return storage.write(candidate, null);
    },

    async rename(projectId: string, expectedRevision: number, expectedDigest: string, title: string) {
      const current = await storage.read(projectId);
      if (current.revision !== expectedRevision || await digestUnifiedProjectV2(current) !== expectedDigest) throw new Error("stale_revision");
      const candidate = structuredClone(current);
      candidate.title = title;
      candidate.updatedAt = now();
      candidate.revision = current.revision + 1;
      return storage.write(candidate, expectedRevision);
    },

    async deleteProject(projectId: string, expectedRevision: number, expectedDigest: string) {
      if (!storage.deleteProject) throw new Error("storage_write_failed");
      return storage.deleteProject(projectId, expectedRevision, expectedDigest);
    },

    open: storage.read,
  };
};

const browserRepository = () => createUnifiedProjectRepositoryV2();

export const saveUnifiedProjectV2 = async (project: UnifiedAnimationProjectV2) => {
  const saved = await browserRepository().save(project);
  announceEditorProjectIdentity(saved);
  return saved;
};
export const saveUnifiedProjectAsV2 = async (project: UnifiedAnimationProjectV2, title: string) => {
  const saved = await browserRepository().saveAs(project, title);
  announceEditorProjectIdentity(saved);
  return saved;
};
export const openUnifiedProjectV2 = readUnifiedProjectV2;
