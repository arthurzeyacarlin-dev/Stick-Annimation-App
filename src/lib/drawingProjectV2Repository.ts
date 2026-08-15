import {
  DrawingProjectV2Error,
  parseDrawingProjectHeadV2,
  parseDrawingProjectLegacyDeleteTombstoneV1,
  parseDrawingProjectVersionRecordV2,
  requireCanonicalString,
  requireProjectId,
  requireUtcTimestamp,
  type DrawingProjectAssetV2,
  type DrawingProjectDeleteFailedCode,
  type DrawingProjectDocumentV2,
  type DrawingProjectHeadV2,
  type DrawingProjectLegacyDeleteTombstoneV1,
  type DrawingProjectV2ErrorCode,
  type DrawingProjectVersionRecordV2,
} from "./drawingProjectV2Contract.ts";
import {
  assertCollectionCapacity,
  assertProjectStoredCapacity,
  calculateDocumentDigest,
  calculateStoredByteLength,
  canonicalJsonStringify,
  createStoredRecordDescriptor,
  sha256Hex,
  verifyRecordCanonicalFields,
} from "./drawingProjectV2Canonical.ts";
import type {
  DrawingProjectLegacyMaintenanceResult,
  DrawingProjectV1ClassifiedEntry,
  DrawingProjectV1ReadResult,
} from "./drawingProjectV1Compatibility.ts";

export type DrawingProjectManagedState = {
  heads: DrawingProjectHeadV2[];
  tombstones: DrawingProjectLegacyDeleteTombstoneV1[];
  activeStoredBytes: number;
  companionStoredBytes: number;
  tombstoneStoredBytes: number;
};

export type DrawingProjectIndexedRepositoryAdapter = {
  cleanupOrphanVersions(): Promise<number>;
  stageCandidate(record: DrawingProjectVersionRecordV2): Promise<void>;
  readVersion(projectId: string, storageRevision: number): Promise<unknown | null>;
  removeVersion(projectId: string, storageRevision: number): Promise<void>;
  publishHeadCas(expectedRevision: number | null, head: DrawingProjectHeadV2): Promise<"committed" | "stale">;
  cleanupProjectVersions(projectId: string, activeStorageRevision: number): Promise<number>;
  getManagedState(): Promise<DrawingProjectManagedState>;
  getHead(projectId: string): Promise<unknown | null>;
  listHeads(): Promise<unknown[]>;
  listTombstones(): Promise<unknown[]>;
  deleteAuthoritativeV2(input: {
    projectId: string;
    expectedRevision: number;
    tombstone: DrawingProjectLegacyDeleteTombstoneV1;
  }): Promise<"committed" | "stale" | "not-found">;
  putLegacyOnlyTombstone(input: DrawingProjectLegacyDeleteTombstoneV1): Promise<"committed" | "v2-exists">;
  removeTombstone(projectId: string): Promise<void>;
};

export type DrawingProjectLegacyMaintainer = (
  projectId: string,
  expectedRecordDigest: string | null,
) => Promise<DrawingProjectLegacyMaintenanceResult>;

export type DrawingProjectRepository = ReturnType<typeof createDrawingProjectV2Repository>;

const deepFreeze = <T>(value: T, seen = new Set<object>()): T => {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (value instanceof Blob) return Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  Object.freeze(value);
  return value;
};

const cloneCandidateValue = <T>(value: T, stage: string, clones = new Map<object, unknown>(), active = new Set<object>()): T => {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Blob) return new Blob([value], { type: value.type }) as T;
  if (active.has(value)) throw new DrawingProjectV2Error("invalid_record", stage, "Candidate input cannot contain cycles.");
  const existing = clones.get(value);
  if (existing !== undefined) return existing as T;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new DrawingProjectV2Error("invalid_record", stage, "Candidate arrays must contain only contiguous indexed values.");
      }
      const output: unknown[] = [];
      clones.set(value, output);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new DrawingProjectV2Error("invalid_record", `${stage}[${index}]`, "Candidate arrays cannot contain holes.");
        }
        output.push(cloneCandidateValue(value[index], `${stage}[${index}]`, clones, active));
      }
      return output as T;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new DrawingProjectV2Error("invalid_record", stage, "Candidate input accepts only plain data and Blobs.");
    }
    const output = Object.create(prototype) as Record<string, unknown>;
    clones.set(value, output);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw new DrawingProjectV2Error("invalid_record", `${stage}.${key}`, "Candidate input cannot contain accessors.");
      }
      output[key] = cloneCandidateValue(descriptor.value, `${stage}.${key}`, clones, active);
    }
    return output as T;
  } finally {
    active.delete(value);
  }
};

const binaryDigest = async (asset: DrawingProjectAssetV2) => {
  const expectedLength = asset.kind === "raster-png" ? asset.encodedByteLength : asset.byteLength;
  const expectedDigest = asset.kind === "raster-png" ? asset.encodedSha256 : asset.sha256;
  if (asset.bytes.size !== expectedLength) throw new DrawingProjectV2Error("asset_digest_mismatch", "repository.binary-length", "Asset Blob length mismatch.");
  const bytes = new Uint8Array(await asset.bytes.arrayBuffer());
  if (bytes.byteLength !== expectedLength || (await sha256Hex(bytes)) !== expectedDigest) {
    throw new DrawingProjectV2Error("asset_digest_mismatch", "repository.binary-digest", "Asset Blob digest mismatch.");
  }
  return expectedDigest;
};

const verifyCandidateReadBack = async (expected: DrawingProjectVersionRecordV2, actualValue: unknown) => {
  let actual: DrawingProjectVersionRecordV2;
  try {
    actual = await verifyRecordCanonicalFields(actualValue);
  } catch {
    throw new DrawingProjectV2Error("candidate_readback_mismatch", "repository.readback", "Staged candidate failed strict validation.");
  }
  if (canonicalJsonStringify(createStoredRecordDescriptor(actual)) !== canonicalJsonStringify(createStoredRecordDescriptor(expected))) {
    throw new DrawingProjectV2Error("candidate_readback_mismatch", "repository.readback", "Candidate metadata changed during staging.");
  }
  for (let index = 0; index < expected.assets.length; index += 1) {
    let expectedDigest: string;
    let actualDigest: string;
    try {
      [expectedDigest, actualDigest] = await Promise.all([binaryDigest(expected.assets[index]), binaryDigest(actual.assets[index])]);
    } catch {
      throw new DrawingProjectV2Error("candidate_readback_mismatch", "repository.readback", "Candidate binary failed strict validation.");
    }
    if (expectedDigest !== actualDigest) throw new DrawingProjectV2Error("candidate_readback_mismatch", "repository.readback", "Candidate binary changed during staging.");
  }
  return actual;
};

const prepareRecord = async (input: {
  projectId: string;
  storageRevision: number;
  document: DrawingProjectDocumentV2;
  assets: DrawingProjectAssetV2[];
}) => {
  requireProjectId(input.projectId, "save.projectId");
  if (!Number.isSafeInteger(input.storageRevision) || input.storageRevision < 1) throw new DrawingProjectV2Error("invalid_record", "save.storageRevision", "Storage revision is invalid.");
  const clonedInput = cloneCandidateValue({ document: input.document, assets: input.assets }, "save.candidate");
  const documentDigest = await calculateDocumentDigest(clonedInput.document, clonedInput.assets);
  const base = {
    kind: "diamond-drawing-project" as const,
    schemaVersion: 2 as const,
    projectId: input.projectId,
    storageRevision: input.storageRevision,
    documentDigest,
    document: clonedInput.document,
    assets: clonedInput.assets,
  };
  const storedByteLength = calculateStoredByteLength(base);
  assertProjectStoredCapacity(storedByteLength);
  const record: DrawingProjectVersionRecordV2 = { ...base, storedByteLength };
  parseDrawingProjectVersionRecordV2(record);
  await verifyRecordCanonicalFields(record);
  for (const asset of record.assets) await binaryDigest(asset);
  return deepFreeze(record);
};

const cleanupCode = (error: unknown, fallback: DrawingProjectV2ErrorCode): DrawingProjectV2Error => {
  if (error instanceof DrawingProjectV2Error) return error;
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return new DrawingProjectV2Error("quota_exceeded", "repository.storage", "Browser quota rejected the transaction.");
  }
  return new DrawingProjectV2Error(fallback, "repository.storage", error instanceof Error ? error.message : "Storage operation failed.");
};

const deleteFailureCode = (error: unknown): DrawingProjectDeleteFailedCode => {
  const code = cleanupCode(error, "transaction_aborted").code;
  switch (code) {
    case "project_not_found":
    case "storage_read_failed":
    case "storage_write_failed":
    case "transaction_aborted":
    case "stale_revision":
      return code;
    case "quota_exceeded":
      return "storage_write_failed";
    default:
      return "transaction_aborted";
  }
};

export type DrawingProjectDeleteResult =
  | { status: "failed"; code: DrawingProjectDeleteFailedCode }
  | { status: "deleted"; legacyCleanup: "not-needed" | "cleaned" | "pending"; maintenance: DrawingProjectLegacyMaintenanceResult };

export const createDrawingProjectV2Repository = (
  adapter: DrawingProjectIndexedRepositoryAdapter,
  options: { legacyMaintainer?: DrawingProjectLegacyMaintainer } = {},
) => {
  const save = async (input: {
    projectId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    expectedRevision: number | null;
    document: DrawingProjectDocumentV2;
    assets: DrawingProjectAssetV2[];
  }) => {
    requireProjectId(input.projectId, "save.projectId");
    requireCanonicalString(input.title, "save.title", false);
    requireUtcTimestamp(input.createdAt, "save.createdAt");
    requireUtcTimestamp(input.updatedAt, "save.updatedAt");
    if (input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)) {
      throw new DrawingProjectV2Error("invalid_record", "save.expectedRevision", "Expected revision is invalid.");
    }
    const storageRevision = (input.expectedRevision ?? 0) + 1;
    const candidate = await prepareRecord({ ...input, storageRevision });
    try {
      await adapter.cleanupOrphanVersions();
      const managed = await adapter.getManagedState();
      const existing = managed.heads.find((head) => head.projectId === input.projectId) ?? null;
      if (!existing && managed.tombstones.some((tombstone) => tombstone.projectId === input.projectId)) {
        throw new DrawingProjectV2Error("maintenance_required", "save.projectId", "A pending legacy-delete tombstone reserves this project ID.");
      }
      const newProjectCount = managed.heads.length + (existing ? 0 : 1);
      assertCollectionCapacity({
        activeProjectCount: newProjectCount,
        activeStoredBytes: managed.activeStoredBytes,
        replacingStoredBytes: existing?.activeStoredByteLength ?? 0,
        candidateStoredBytes: candidate.storedByteLength,
        companionStoredBytes: managed.companionStoredBytes,
        tombstoneStoredBytes: managed.tombstoneStoredBytes,
      });
      await adapter.stageCandidate(candidate);
      const readBack = await adapter.readVersion(candidate.projectId, candidate.storageRevision);
      if (readBack === null) throw new DrawingProjectV2Error("candidate_readback_mismatch", "repository.readback", "Staged candidate is missing.");
      await verifyCandidateReadBack(candidate, readBack);
      const head: DrawingProjectHeadV2 = {
        kind: "diamond-drawing-project-head",
        schemaVersion: 2,
        projectId: candidate.projectId,
        title: input.title,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        activeStorageRevision: candidate.storageRevision,
        documentDigest: candidate.documentDigest,
        activeStoredByteLength: candidate.storedByteLength,
      };
      parseDrawingProjectHeadV2(head);
      const publication = await adapter.publishHeadCas(input.expectedRevision, head);
      if (publication !== "committed") {
        await adapter.removeVersion(candidate.projectId, candidate.storageRevision).catch(() => undefined);
        throw new DrawingProjectV2Error("stale_revision", "repository.head-cas", "The active project revision changed.");
      }
      let maintenance: "clean" | "pending" = "clean";
      try {
        await adapter.cleanupProjectVersions(candidate.projectId, candidate.storageRevision);
      } catch {
        maintenance = "pending";
      }
      return { status: "saved" as const, head, record: candidate, maintenance };
    } catch (error) {
      const current = await adapter.getHead(input.projectId).catch(() => null);
      const parsedCurrent = current === null ? null : parseDrawingProjectHeadV2(current);
      if (parsedCurrent?.activeStorageRevision !== candidate.storageRevision) {
        await adapter.removeVersion(candidate.projectId, candidate.storageRevision).catch(() => undefined);
      }
      throw cleanupCode(error, "storage_write_failed");
    }
  };

  const saveAs = async (input: Omit<Parameters<typeof save>[0], "projectId" | "expectedRevision"> & { createProjectId: () => string }) => {
    const reservedIds = new Set((await adapter.listTombstones()).map(parseDrawingProjectLegacyDeleteTombstoneV1).map((tombstone) => tombstone.projectId));
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const projectId = requireProjectId(input.createProjectId(), "saveAs.projectId");
      if (!reservedIds.has(projectId) && (await adapter.getHead(projectId)) === null) return save({ ...input, projectId, expectedRevision: null });
    }
    throw new DrawingProjectV2Error("id_collision", "saveAs.collision", "Unable to allocate a collision-free project ID.");
  };

  const rename = async (input: {
    projectId: string;
    title: string;
    updatedAt: string;
    expectedRevision: number;
  }) => {
    const headValue = await adapter.getHead(input.projectId);
    if (headValue === null) throw new DrawingProjectV2Error("project_not_found", "rename.read", "Project does not exist.");
    const head = parseDrawingProjectHeadV2(headValue);
    if (head.activeStorageRevision !== input.expectedRevision) throw new DrawingProjectV2Error("stale_revision", "rename.read", "Project revision is stale.");
    const recordValue = await adapter.readVersion(input.projectId, input.expectedRevision);
    if (recordValue === null) throw new DrawingProjectV2Error("storage_read_failed", "rename.read", "Active version is missing.");
    const record = await verifyRecordCanonicalFields(recordValue);
    return save({
      projectId: input.projectId,
      title: input.title,
      createdAt: head.createdAt,
      updatedAt: input.updatedAt,
      expectedRevision: input.expectedRevision,
      document: record.document,
      assets: record.assets,
    });
  };

  const deleteV2 = async (input: { projectId: string; expectedRevision: number; legacyRecordDigest: string | null }): Promise<DrawingProjectDeleteResult> => {
    const tombstone: DrawingProjectLegacyDeleteTombstoneV1 = {
      kind: "diamond-drawing-legacy-delete-tombstone",
      schemaVersion: 1,
      projectId: input.projectId,
      legacyRecordDigest: input.legacyRecordDigest,
    };
    parseDrawingProjectLegacyDeleteTombstoneV1(tombstone);
    let authoritative: "committed" | "stale" | "not-found";
    try {
      authoritative = await adapter.deleteAuthoritativeV2({ projectId: input.projectId, expectedRevision: input.expectedRevision, tombstone });
    } catch (error) {
      return { status: "failed", code: deleteFailureCode(error) };
    }
    if (authoritative !== "committed") return { status: "failed" as const, code: authoritative === "stale" ? "stale_revision" as const : "project_not_found" as const };
    let cleanup: DrawingProjectLegacyMaintenanceResult = { status: "pending", legacyPresence: "unknown", code: "maintenance_required" };
    if (input.legacyRecordDigest !== null && options.legacyMaintainer) {
      try {
        cleanup = await options.legacyMaintainer(input.projectId, input.legacyRecordDigest);
      } catch {
        cleanup = { status: "pending", legacyPresence: "unknown", code: "maintenance_required" };
      }
    }
    if (cleanup.status !== "pending") {
      try {
        await adapter.removeTombstone(input.projectId);
      } catch {
        cleanup = { status: "pending", legacyPresence: "unknown", code: "maintenance_required" };
      }
    }
    return { status: "deleted" as const, legacyCleanup: cleanup.status, maintenance: cleanup };
  };

  const deleteLegacyOnly = async (input: {
    classifiedEntry: DrawingProjectV1ClassifiedEntry;
    capturedRootDigest: string;
    verifyExactTarget: () => Promise<boolean>;
  }): Promise<DrawingProjectDeleteResult> => {
    const entry = input.classifiedEntry;
    if (entry.classification !== "valid-v1" || !entry.projectId || !entry.canonicalRecordDigest || !entry.rawSliceDigest || !input.capturedRootDigest) {
      return { status: "failed" as const, code: "legacy_corrupt" as const };
    }
    let verified: boolean;
    try {
      verified = await input.verifyExactTarget();
    } catch {
      return { status: "failed" as const, code: "legacy_read_failed" as const };
    }
    if (!verified) return { status: "failed" as const, code: "legacy_corrupt" as const };
    const tombstone: DrawingProjectLegacyDeleteTombstoneV1 = {
      kind: "diamond-drawing-legacy-delete-tombstone",
      schemaVersion: 1,
      projectId: entry.projectId,
      legacyRecordDigest: entry.canonicalRecordDigest,
    };
    try {
      const authority = await adapter.putLegacyOnlyTombstone(tombstone);
      if (authority !== "committed") return { status: "failed" as const, code: "stale_revision" as const };
    } catch (error) {
      return { status: "failed", code: deleteFailureCode(error) };
    }
    let cleanup: DrawingProjectLegacyMaintenanceResult = { status: "pending", legacyPresence: "present", code: "maintenance_required" };
    if (options.legacyMaintainer) {
      try {
        cleanup = await options.legacyMaintainer(entry.projectId, entry.canonicalRecordDigest);
      } catch {
        cleanup = { status: "pending", legacyPresence: "unknown", code: "maintenance_required" };
      }
    }
    if (cleanup.status !== "pending") {
      try {
        await adapter.removeTombstone(entry.projectId);
      } catch {
        cleanup = { status: "pending", legacyPresence: "unknown", code: "maintenance_required" };
      }
    }
    return { status: "deleted" as const, legacyCleanup: cleanup.status, maintenance: cleanup };
  };

  const loadCatalog = async (legacy: DrawingProjectV1ReadResult) => {
    let heads: DrawingProjectHeadV2[];
    let tombstones: DrawingProjectLegacyDeleteTombstoneV1[];
    try {
      heads = (await adapter.listHeads()).map(parseDrawingProjectHeadV2);
      tombstones = (await adapter.listTombstones()).map(parseDrawingProjectLegacyDeleteTombstoneV1);
    } catch (error) {
      throw cleanupCode(error, "storage_read_failed");
    }
    const hidden = new Set([...heads.map((head) => head.projectId), ...tombstones.map((tombstone) => tombstone.projectId)]);
    const v2 = [...heads]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.projectId.localeCompare(right.projectId))
      .map((head) => ({ kind: "v2" as const, projectId: head.projectId, title: head.title, head }));
    const legacyEntries = legacy.status === "valid-array"
      ? legacy.entries
          .filter((entry) => !entry.projectId || !hidden.has(entry.projectId))
          .map((entry) => ({ kind: "legacy" as const, projectId: entry.projectId, classification: entry.classification, entry }))
      : [];
    return { status: "loaded" as const, entries: [...v2, ...legacyEntries], tombstones };
  };

  const runBoundedMaintenance = async (legacy: DrawingProjectV1ReadResult) => {
    if (!options.legacyMaintainer || legacy.status !== "valid-array") return [];
    const heads = (await adapter.listHeads()).map(parseDrawingProjectHeadV2);
    const tombstones = (await adapter.listTombstones()).map(parseDrawingProjectLegacyDeleteTombstoneV1);
    const legacyById = new Map(legacy.entries.filter((entry) => entry.classification === "valid-v1" && entry.projectId).map((entry) => [entry.projectId!, entry]));
    const candidates = new Map<string, string | null>();
    for (const head of heads) {
      const entry = legacyById.get(head.projectId);
      if (entry) candidates.set(head.projectId, entry.canonicalRecordDigest);
    }
    for (const tombstone of tombstones) candidates.set(tombstone.projectId, tombstone.legacyRecordDigest);
    const selected = [...candidates.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).slice(0, 8);
    const results = [];
    for (const [projectId, digest] of selected) {
      const maintenance = digest === null
        ? { status: "pending", legacyPresence: "unknown", code: "maintenance_required" } as const
        : await options.legacyMaintainer(projectId, digest);
      if (maintenance.status !== "pending" && tombstones.some((entry) => entry.projectId === projectId)) {
        try {
          await adapter.removeTombstone(projectId);
        } catch {
          results.push({ projectId, maintenance: { status: "pending", legacyPresence: "unknown", code: "maintenance_required" } as const });
          continue;
        }
      }
      results.push({ projectId, maintenance });
    }
    return results;
  };

  return { prepareRecord, save, saveAs, rename, deleteV2, deleteLegacyOnly, loadCatalog, runBoundedMaintenance };
};
