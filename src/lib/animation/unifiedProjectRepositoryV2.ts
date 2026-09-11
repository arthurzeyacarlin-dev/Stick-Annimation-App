import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2";
import { readUnifiedProjectV2, writeUnifiedProjectV2 } from "./unifiedProjectStorageV2";

export const saveUnifiedProjectV2 = async (project: UnifiedAnimationProjectV2) => {
  const now = new Date().toISOString();
  const candidate = { ...structuredClone(project), updatedAt: now, revision: project.revision + 1 };
  return writeUnifiedProjectV2(candidate, project.revision === 0 ? null : project.revision);
};

export const saveUnifiedProjectAsV2 = async (project: UnifiedAnimationProjectV2, title: string) => {
  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const candidate: UnifiedAnimationProjectV2 = {
    ...structuredClone(project), projectId, title, createdAt: now, updatedAt: now, revision: 1,
    document: { ...structuredClone(project.document), projectId },
  };
  return writeUnifiedProjectV2(candidate, null);
};

export const openUnifiedProjectV2 = readUnifiedProjectV2;
