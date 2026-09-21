import type { UnifiedAnimationDocumentV1, UnifiedAnimationMigrationCandidateV1 } from "./unifiedAnimationContract.ts";
import { readCollectionCandidate, type ProjectCollectionEntry } from "./unifiedProjectCollection.ts";
import type { ProjectSourceReader } from "./unifiedProjectSourceReader.ts";
import { hydrateV2Project, type StoredDrawingProject } from "../drawingProjectStorage.ts";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import { bindDrawingAiProjectMemoryToProject } from "../ai/drawingAiProjectMemory.ts";
import type { UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";
import { createNativeUnifiedProjectV2 } from "./unifiedWorkspaceFactoryV2.ts";
import { digestUnifiedProjectV2, readUnifiedProjectV2 } from "./unifiedProjectStorageV2.ts";
import { assertUnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";
import { upgradeUnifiedProjectV1ToV2 } from "./unifiedAnimationMigrationV2.ts";
import { retireLegacyRigsV3 } from "./legacyRigRetirementV3.ts";
import type { ProjectRecoveryEnvelopeV1 } from "./projectRecoveryContractV1.ts";

export type RecoveredWorkspaceClaimV1 = {
  ownerSessionId: string;
  workspaceInstanceId: string;
  draftSequence: number;
  workspaceGeneration: number;
  candidateDigest: string;
};

export type WorkspaceCandidate = {
  id: string;
  title: string;
  digest: string;
  document: UnifiedAnimationDocumentV1;
  migration: UnifiedAnimationMigrationCandidateV1 | null;
  editor: { kind: "unified"; project: UnifiedAnimationProjectV2 };
  recoveryClaim?: RecoveredWorkspaceClaimV1;
};
export type MountedWorkspace = { generation: number; candidate: WorkspaceCandidate };
export type BootstrapResult = { status: "opened"; root: MountedWorkspace } | { status: "stale" } | { status: "failed"; code: string };

export const createUntitledWorkspace = async (): Promise<WorkspaceCandidate> => {
  const project = createNativeUnifiedProjectV2();
  return { id: project.projectId, title: project.title, document: project.document as unknown as UnifiedAnimationDocumentV1, digest: JSON.stringify(project.document), migration: null, editor: { kind: "unified", project } };
};

const recoveredCopyTitle = (title: string) => {
  const normalized = title.trim().normalize("NFC");
  const candidate = normalized && normalized !== "Untitled Project"
    ? `${normalized} — Recovered copy`
    : "Recovered copy";
  return new TextEncoder().encode(candidate).byteLength <= 512 ? candidate : "Recovered copy";
};

const rebindRecoveredCopy = (
  project: UnifiedAnimationProjectV2,
  envelope: ProjectRecoveryEnvelopeV1,
  createId: () => string,
): UnifiedAnimationProjectV2 => {
  const recovered = structuredClone(project);
  const projectId = createId();
  recovered.projectId = projectId;
  recovered.document.projectId = projectId;
  recovered.title = recoveredCopyTitle(envelope.sourceTitle || recovered.title);
  recovered.revision = 0;
  recovered.provenance = {
    kind: "copy",
    parentProjectId: envelope.sourceProjectId,
    parentRevision: envelope.sourceRevision,
    parentProjectDigest: envelope.sourceProjectDigest,
  };
  if (recovered.auxiliary?.stickAiCreationLatch) recovered.auxiliary.stickAiCreationLatch.projectId = projectId;
  if (recovered.auxiliary?.drawingAiMemory) {
    const memory = sanitizeDrawingAiProjectMemory(recovered.auxiliary.drawingAiMemory);
    if (!memory) throw new Error("invalid_record");
    recovered.auxiliary.drawingAiMemory = bindDrawingAiProjectMemoryToProject(memory, projectId);
  }
  return assertUnifiedAnimationProjectV2(recovered);
};

export const prepareRecoveryWorkspace = async (
  project: UnifiedAnimationProjectV2,
  envelope: ProjectRecoveryEnvelopeV1,
  options: {
    readOfficialProject?: (projectId: string) => Promise<UnifiedAnimationProjectV2>;
    createId?: () => string;
  } = {},
): Promise<{ candidate: WorkspaceCandidate; detached: boolean }> => {
  const recovered = assertUnifiedAnimationProjectV2(structuredClone(project));
  const candidateDigest = await digestUnifiedProjectV2(recovered);
  if (
    recovered.projectId !== envelope.sourceProjectId ||
    recovered.revision !== envelope.sourceRevision ||
    candidateDigest !== envelope.candidateDigest
  ) throw new Error("recovery_invalid_binding");

  let sourceMatches = false;
  try {
    const source = await (options.readOfficialProject ?? readUnifiedProjectV2)(envelope.sourceProjectId);
    sourceMatches = source.revision === envelope.sourceRevision &&
      await digestUnifiedProjectV2(source) === envelope.sourceProjectDigest;
  } catch {
    sourceMatches = false;
  }

  const mountedProject = sourceMatches ? recovered : rebindRecoveredCopy(recovered, envelope, options.createId ?? (() => crypto.randomUUID()));
  return {
    detached: !sourceMatches,
    candidate: {
      id: mountedProject.projectId,
      title: mountedProject.title,
      document: mountedProject.document as unknown as UnifiedAnimationDocumentV1,
      digest: await digestUnifiedProjectV2(mountedProject),
      migration: null,
      editor: { kind: "unified", project: mountedProject },
    },
  };
};

export const prepareCollectionWorkspace = async (reader: ProjectSourceReader, entry: ProjectCollectionEntry): Promise<WorkspaceCandidate> => {
  if (entry.sourceKind === "unified-v2") {
    const source = await readUnifiedProjectV2(entry.sourceId);
    const project = await retireLegacyRigsV3(source, {
      sourceKind: "unified-v2",
      sourceDigest: entry.candidateDigest ?? `${source.projectId}:${source.revision}`,
    });
    return {
      id: project.projectId,
      title: project.title,
      document: project.document as unknown as UnifiedAnimationDocumentV1,
      // Canonical storage has already verified the head/version digest. Never
      // expand typed raster arrays into JSON merely to create an unused mount token.
      digest: entry.candidateDigest ?? `${project.projectId}:${project.revision}`,
      migration: null,
      editor: { kind: "unified", project },
    };
  }
  const { candidate, source } = await readCollectionCandidate(reader, entry);
  let drawingData = null;
  if (source.sourceKind === "drawing-v2") {
    drawingData = (await hydrateV2Project(source.head, source.record, sanitizeDrawingAiProjectMemory(source.aiMemory) ?? null)).data;
  } else if (source.sourceKind === "drawing-v1") {
    drawingData = (structuredClone(source.project) as StoredDrawingProject).data;
  }
  const upgraded = assertUnifiedAnimationProjectV2(await upgradeUnifiedProjectV1ToV2(candidate, {
    drawingData,
    ...(source.sourceKind === "unified-v1" ? { sourceKindOverride: "unified-v1" as const } : {}),
  }));
  const project = await retireLegacyRigsV3(upgraded, {
    sourceKind: source.sourceKind,
    sourceDigest: candidate.project.candidateDigest,
  });
  // Hydration can yield to user/storage changes. Verify the source again before
  // the bootstrap's synchronous generation check publishes one complete result.
  await readCollectionCandidate(reader, entry);
  return { id: project.projectId, title: project.title, digest: candidate.project.candidateDigest, document: candidate.project.document, migration: candidate, editor: { kind: "unified", project } };
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
      const allowed = ["source_changed", "duplicate_identity", "invalid_record", "unsupported_version", "asset_missing", "asset_digest_mismatch", "storage_read_failed", "project_too_large", "source_digest_mismatch", "invalid_cell_owner", "source_space_inconsistent", "decode_failed", "version_mismatch", "readback_failed", "rig_migration_renderer_unavailable", "rig_migration_digest_failed", "rig_migration_incomplete"];
      const code = error instanceof Error && allowed.includes(error.message) ? error.message : "invalid_record";
      return { status: "failed", code };
    }
  }
}
