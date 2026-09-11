import type { UnifiedAnimationDocumentV1, UnifiedAnimationMigrationCandidateV1 } from "./unifiedAnimationContract.ts";
import { readCollectionCandidate, type ProjectCollectionEntry } from "./unifiedProjectCollection.ts";
import type { ProjectSourceReader } from "./unifiedProjectSourceReader.ts";
import { hydrateV2Project, type DrawingProjectOpenCandidate, type StoredDrawingProject } from "../drawingProjectStorage.ts";
import type { StickSavedProjectRecordV1 } from "../stickProjectStorage.ts";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";
import { createNativeUnifiedProjectV2 } from "./unifiedWorkspaceFactoryV2.ts";
import { readUnifiedProjectV2 } from "./unifiedProjectStorageV2.ts";

export type WorkspaceCandidate = {
  id: string;
  title: string;
  digest: string;
  document: UnifiedAnimationDocumentV1;
  migration: UnifiedAnimationMigrationCandidateV1 | null;
  editor: { kind: "drawing"; project: DrawingProjectOpenCandidate | null } | { kind: "stick"; project: StickSavedProjectRecordV1 } | { kind: "unified"; project: UnifiedAnimationProjectV2 };
};
export type MountedWorkspace = { generation: number; candidate: WorkspaceCandidate };
export type BootstrapResult = { status: "opened"; root: MountedWorkspace } | { status: "stale" } | { status: "failed"; code: string };

export const createUntitledWorkspace = async (): Promise<WorkspaceCandidate> => {
  const project = createNativeUnifiedProjectV2();
  return { id: project.projectId, title: project.title, document: project.document as unknown as UnifiedAnimationDocumentV1, digest: JSON.stringify(project.document), migration: null, editor: { kind: "unified", project } };
};

export const prepareCollectionWorkspace = async (reader: ProjectSourceReader, entry: ProjectCollectionEntry): Promise<WorkspaceCandidate> => {
  if (entry.sourceKind === "unified-v2") {
    const project = await readUnifiedProjectV2(entry.sourceId);
    return { id: project.projectId, title: project.title, document: project.document as unknown as UnifiedAnimationDocumentV1, digest: JSON.stringify(project.document), migration: null, editor: { kind: "unified", project } };
  }
  const { candidate, source } = await readCollectionCandidate(reader, entry);
  let editor: WorkspaceCandidate["editor"];
  if (source.sourceKind === "drawing-v2") {
    const project = await hydrateV2Project(source.head, source.record, sanitizeDrawingAiProjectMemory(source.aiMemory) ?? null);
    editor = { kind: "drawing", project: { kind: "v2", project, head: source.head, record: source.record, legacyRecordDigest: null } };
  } else if (source.sourceKind === "drawing-v1") {
    editor = { kind: "drawing", project: { kind: "legacy", project: structuredClone(source.project) as StoredDrawingProject, head: null, record: null, legacyRecordDigest: candidate.project.provenance.sourceRecordDigest } };
  } else {
    editor = { kind: "stick", project: structuredClone(source.project) as StickSavedProjectRecordV1 };
  }
  // Hydration can yield to user/storage changes. Verify the source again before
  // the bootstrap's synchronous generation check publishes one complete result.
  await readCollectionCandidate(reader, entry);
  return { id: candidate.project.projectId, title: candidate.project.title, digest: candidate.project.candidateDigest, document: candidate.project.document, migration: candidate, editor };
};

export class WorkspaceBootstrap {
  private ticket = 0;
  private mounted: MountedWorkspace | null = null;
  get current() { return this.mounted; }
  cancel() { this.ticket += 1; }
  clear() { this.cancel(); this.mounted = null; }
  async open(prepare: () => Promise<WorkspaceCandidate>): Promise<BootstrapResult> {
    const ticket = ++this.ticket;
    try {
      const candidate = await prepare();
      if (ticket !== this.ticket) return { status: "stale" };
      const root = { generation: ticket, candidate };
      this.mounted = root;
      return { status: "opened", root };
    } catch (error) {
      if (ticket !== this.ticket) return { status: "stale" };
      const allowed = ["source_changed", "duplicate_identity", "invalid_record", "unsupported_version", "asset_missing", "asset_digest_mismatch", "storage_read_failed", "project_too_large", "source_digest_mismatch", "invalid_cell_owner", "source_space_inconsistent"];
      const code = error instanceof Error && allowed.includes(error.message) ? error.message : "invalid_record";
      return { status: "failed", code };
    }
  }
}
