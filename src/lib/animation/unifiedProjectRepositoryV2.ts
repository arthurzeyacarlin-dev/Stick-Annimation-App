import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";
import {
  digestUnifiedProjectV2,
  readUnifiedProjectV2,
  writeUnifiedProjectV2,
} from "./unifiedProjectStorageV2.ts";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import { bindDrawingAiProjectMemoryToProject } from "../ai/drawingAiProjectMemory.ts";

type UnifiedRepositoryStorageV2 = {
  read: (projectId: string) => Promise<UnifiedAnimationProjectV2>;
  write: (project: UnifiedAnimationProjectV2, expectedRevision: number | null) => Promise<UnifiedAnimationProjectV2>;
};

export type UnifiedProjectRepositoryOptionsV2 = {
  now?: () => string;
  createId?: () => string;
  storage?: UnifiedRepositoryStorageV2;
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
  const storage = options.storage ?? { read: readUnifiedProjectV2, write: writeUnifiedProjectV2 };

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

    open: storage.read,
  };
};

const browserRepository = () => createUnifiedProjectRepositoryV2();

export const saveUnifiedProjectV2 = (project: UnifiedAnimationProjectV2) => browserRepository().save(project);
export const saveUnifiedProjectAsV2 = (project: UnifiedAnimationProjectV2, title: string) => browserRepository().saveAs(project, title);
export const openUnifiedProjectV2 = readUnifiedProjectV2;
