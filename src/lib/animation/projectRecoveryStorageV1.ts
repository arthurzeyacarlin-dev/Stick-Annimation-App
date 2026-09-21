import { assertUnifiedAnimationProjectV2, type UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";
import {
  hydrateUnifiedProjectStorageV2,
  prepareUnifiedProjectStorageV2,
  type UnifiedEncodedAssetV2,
  type UnifiedProjectVersionV2,
} from "./unifiedProjectStorageV2.ts";
import {
  assertProjectRecoveryEnvelopeV1,
  PROJECT_RECOVERY_DRAFT_ID_V1,
  projectRecoveryEnvelopeMatchesOwnerV1,
  type ProjectRecoveryEnvelopeV1,
} from "./projectRecoveryContractV1.ts";

const DB_NAME = "diamond-animation-project-recovery-v1";
const DB_VERSION = 1;
const STORES = Object.freeze({
  heads: "heads",
  owners: "owners",
  candidates: "candidates",
  assets: "assets",
  assetMetadata: "assetMetadata",
});
const SESSION_KEY = "diamond-animation-project-recovery-session-v1";

export type ProjectRecoveryOwnerV1 = {
  draftId: typeof PROJECT_RECOVERY_DRAFT_ID_V1;
  ownerSessionId: string;
  workspaceInstanceId: string;
  latestStagedSequence: number;
  updatedAt: string;
};

export type ProjectRecoveryCandidateV1 = {
  draftId: typeof PROJECT_RECOVERY_DRAFT_ID_V1;
  draftSequence: number;
  candidateDigest: string;
  envelope: ProjectRecoveryEnvelopeV1;
  version: UnifiedProjectVersionV2;
};

export type ProjectRecoveryWriteInputV1 = {
  candidate: UnifiedAnimationProjectV2;
  sourceProject: UnifiedAnimationProjectV2;
  ownerSessionId: string;
  workspaceInstanceId: string;
  draftSequence: number;
  workspaceGeneration: number;
  lastMeaningfulEditAt: string;
  now?: string;
};

export type ProjectRecoveryClearInputV1 = {
  ownerSessionId: string;
  workspaceInstanceId: string;
  workspaceGeneration: number;
  candidateDigest: string;
};

export type ProjectRecoveryClaimInputV1 = {
  expectedOwnerSessionId: string;
  expectedWorkspaceInstanceId: string;
  draftSequence: number;
  candidateDigest: string;
  ownerSessionId: string;
  workspaceInstanceId: string;
};

export type ProjectRecoveryDiscardExpectationV1 =
  | {
      kind: "valid";
      ownerSessionId: string;
      workspaceInstanceId: string;
      draftSequence: number;
      candidateDigest: string;
    }
  | { kind: "invalid" };

export type ProjectRecoveryInspectionV1 =
  | { kind: "none" }
  | { kind: "valid"; envelope: ProjectRecoveryEnvelopeV1; project: UnifiedAnimationProjectV2 }
  | { kind: "invalid"; error: string; envelope?: ProjectRecoveryEnvelopeV1 };

export type ProjectRecoveryStorageAdapterV1 = {
  readHead: () => Promise<ProjectRecoveryEnvelopeV1 | null>;
  readCandidate: (draftSequence: number, candidateDigest: string) => Promise<ProjectRecoveryCandidateV1 | null>;
  readAssets: (assetIds: readonly string[]) => Promise<UnifiedEncodedAssetV2[]>;
  stage: (input: {
    owner: ProjectRecoveryOwnerV1;
    candidate: ProjectRecoveryCandidateV1;
    assets: UnifiedEncodedAssetV2[];
  }) => Promise<void>;
  publish: (input: {
    ownerSessionId: string;
    workspaceInstanceId: string;
    draftSequence: number;
    candidateDigest: string;
  }) => Promise<void>;
  abandon: (input: {
    ownerSessionId: string;
    workspaceInstanceId: string;
    draftSequence: number;
    candidateDigest: string;
  }) => Promise<void>;
  clear: (input: ProjectRecoveryClearInputV1) => Promise<"cleared" | "none" | "not-matched" | "newer-draft">;
  claim?: (input: ProjectRecoveryClaimInputV1) => Promise<"claimed" | "none" | "changed">;
  discard?: (expectation: ProjectRecoveryDiscardExpectationV1) => Promise<"discarded" | "none" | "changed">;
};

export type ProjectRecoveryFaultHooksV1 = Partial<Record<"beforeStage" | "afterStage" | "readback" | "beforePublish" | "afterPublish", () => void>>;

const recoveryError = (error: unknown) => error instanceof Error ? error.message : "recovery_storage_failed";
const candidateKey = (envelope: ProjectRecoveryEnvelopeV1): [string, number, string] =>
  [envelope.draftId, envelope.draftSequence, envelope.candidateDigest];

const assertCandidateBinding = (
  candidate: ProjectRecoveryCandidateV1,
  assets: readonly UnifiedEncodedAssetV2[],
) => {
  const envelope = assertProjectRecoveryEnvelopeV1(candidate.envelope);
  if (
    candidate.draftId !== envelope.draftId ||
    candidate.draftSequence !== envelope.draftSequence ||
    candidate.candidateDigest !== envelope.candidateDigest ||
    candidate.version.projectDigest !== envelope.candidateDigest ||
    candidate.version.projectId !== envelope.sourceProjectId ||
    candidate.version.revision !== envelope.sourceRevision ||
    candidate.version.storedByteLength !== envelope.storedByteLength ||
    JSON.stringify(candidate.version.assetIds) !== JSON.stringify(envelope.assetBindings.map(binding => binding.assetId))
  ) throw new Error("recovery_invalid_record");
  const byId = new Map(assets.map(asset => [asset.assetId, asset]));
  for (const binding of envelope.assetBindings) {
    const asset = byId.get(binding.assetId);
    if (!asset || asset.sha256 !== binding.sha256 || asset.byteLength !== binding.byteLength || asset.encoding !== binding.encoding) {
      throw new Error("recovery_asset_mismatch");
    }
  }
  return envelope;
};

export const createProjectRecoveryStorageV1 = (adapter: ProjectRecoveryStorageAdapterV1) => ({
  async readCurrent() {
    const head = adapter.readHead ? await adapter.readHead() : null;
    if (!head) return null;
    const envelope = assertProjectRecoveryEnvelopeV1(head);
    if (envelope.status !== "current") throw new Error("recovery_invalid_record");
    const candidate = await adapter.readCandidate(envelope.draftSequence, envelope.candidateDigest);
    if (!candidate) throw new Error("recovery_candidate_missing");
    const assets = await adapter.readAssets(candidate.version.assetIds);
    assertCandidateBinding(candidate, assets);
    const project = await hydrateUnifiedProjectStorageV2(candidate.version, assets);
    const prepared = await prepareUnifiedProjectStorageV2(project);
    if (prepared.version.projectDigest !== envelope.candidateDigest) throw new Error("recovery_readback_failed");
    return { envelope, project };
  },

  async inspect(): Promise<ProjectRecoveryInspectionV1> {
    let envelope: ProjectRecoveryEnvelopeV1 | undefined;
    try {
      const head = await adapter.readHead();
      if (!head) return { kind: "none" };
      envelope = assertProjectRecoveryEnvelopeV1(head);
      const current = await this.readCurrent();
      return current ? { kind: "valid", ...current } : { kind: "none" };
    } catch (error) {
      return { kind: "invalid", error: recoveryError(error), ...(envelope ? { envelope } : {}) };
    }
  },

  async write(input: ProjectRecoveryWriteInputV1, hooks: ProjectRecoveryFaultHooksV1 = {}) {
    const candidate = structuredClone(assertUnifiedAnimationProjectV2(input.candidate));
    const sourceProject = assertUnifiedAnimationProjectV2(input.sourceProject);
    if (
      candidate.projectId !== sourceProject.projectId || candidate.revision !== sourceProject.revision ||
      !Number.isSafeInteger(input.draftSequence) || input.draftSequence < 1 ||
      !Number.isSafeInteger(input.workspaceGeneration) || input.workspaceGeneration < 1
    ) throw new Error("recovery_invalid_binding");

    const [preparedCandidate, preparedSource] = await Promise.all([
      prepareUnifiedProjectStorageV2(candidate),
      prepareUnifiedProjectStorageV2(sourceProject),
    ]);
    const existingHead = await adapter.readHead();
    const now = input.now ?? new Date().toISOString();
    const envelope: ProjectRecoveryEnvelopeV1 = assertProjectRecoveryEnvelopeV1({
      schemaVersion: "project-recovery-envelope/v1",
      draftId: PROJECT_RECOVERY_DRAFT_ID_V1,
      draftSequence: input.draftSequence,
      ownerSessionId: input.ownerSessionId,
      workspaceInstanceId: input.workspaceInstanceId,
      sourceProjectId: sourceProject.projectId,
      sourceRevision: sourceProject.revision,
      sourceProjectDigest: preparedSource.version.projectDigest,
      sourceTitle: sourceProject.title,
      workspaceGeneration: input.workspaceGeneration,
      candidateDigest: preparedCandidate.version.projectDigest,
      candidateEncodingVersion: "unified-project-storage-v2",
      assetBindings: preparedCandidate.assets.map(({ assetId, sha256, byteLength, encoding }) => ({ assetId, sha256, byteLength, encoding })),
      createdAt: existingHead && projectRecoveryEnvelopeMatchesOwnerV1(existingHead, input.ownerSessionId, input.workspaceInstanceId)
        ? existingHead.createdAt
        : now,
      updatedAt: now,
      lastMeaningfulEditAt: input.lastMeaningfulEditAt,
      storedByteLength: preparedCandidate.version.storedByteLength,
      status: "staged",
    });
    const recoveryCandidate: ProjectRecoveryCandidateV1 = {
      draftId: envelope.draftId,
      draftSequence: envelope.draftSequence,
      candidateDigest: envelope.candidateDigest,
      envelope,
      version: preparedCandidate.version,
    };
    const owner: ProjectRecoveryOwnerV1 = {
      draftId: PROJECT_RECOVERY_DRAFT_ID_V1,
      ownerSessionId: input.ownerSessionId,
      workspaceInstanceId: input.workspaceInstanceId,
      latestStagedSequence: input.draftSequence,
      updatedAt: now,
    };

    const publication = {
      ownerSessionId: input.ownerSessionId,
      workspaceInstanceId: input.workspaceInstanceId,
      draftSequence: input.draftSequence,
      candidateDigest: envelope.candidateDigest,
    };
    let stagedForPublication = false;
    try {
      hooks.beforeStage?.();
      await adapter.stage({ owner, candidate: recoveryCandidate, assets: preparedCandidate.assets });
      stagedForPublication = true;
      hooks.afterStage?.();
      const staged = await adapter.readCandidate(envelope.draftSequence, envelope.candidateDigest);
      if (!staged) throw new Error("recovery_readback_failed");
      const stagedAssets = await adapter.readAssets(staged.version.assetIds);
      assertCandidateBinding(staged, stagedAssets);
      const stagedProject = await hydrateUnifiedProjectStorageV2(staged.version, stagedAssets);
      const stagedDigest = (await prepareUnifiedProjectStorageV2(stagedProject)).version.projectDigest;
      if (stagedDigest !== envelope.candidateDigest) throw new Error("recovery_readback_failed");
      hooks.readback?.();
      hooks.beforePublish?.();
      await adapter.publish(publication);
      stagedForPublication = false;
      hooks.afterPublish?.();
      const current = await this.readCurrent();
      if (!current || current.envelope.draftSequence !== input.draftSequence || current.envelope.candidateDigest !== envelope.candidateDigest) {
        throw new Error("recovery_readback_failed");
      }
      return current;
    } catch (error) {
      if (stagedForPublication) await adapter.abandon(publication).catch(() => undefined);
      throw error;
    }
  },

  async clear(input: ProjectRecoveryClearInputV1) {
    const result = await adapter.clear(input);
    if (result === "cleared" && await adapter.readHead()) throw new Error("recovery_clear_failed");
    return result;
  },

  async claim(input: ProjectRecoveryClaimInputV1) {
    if (!adapter.claim) throw new Error("recovery_claim_unavailable");
    const result = await adapter.claim(input);
    if (result !== "claimed") return result;
    const current = await this.readCurrent();
    if (
      !current ||
      current.envelope.draftSequence !== input.draftSequence ||
      current.envelope.candidateDigest !== input.candidateDigest ||
      current.envelope.ownerSessionId !== input.ownerSessionId ||
      current.envelope.workspaceInstanceId !== input.workspaceInstanceId
    ) throw new Error("recovery_claim_failed");
    return current;
  },

  async discard(expectation: ProjectRecoveryDiscardExpectationV1) {
    if (!adapter.discard) throw new Error("recovery_discard_unavailable");
    const result = await adapter.discard(expectation);
    if (result !== "discarded") return result;
    if (await adapter.readHead()) throw new Error("recovery_discard_failed");
    return result;
  },
});

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error ?? new Error("recovery_storage_failed"));
});
const completion = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("recovery_storage_failed"));
});

const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(STORES.heads)) db.createObjectStore(STORES.heads, { keyPath: "draftId" });
    if (!db.objectStoreNames.contains(STORES.owners)) db.createObjectStore(STORES.owners, { keyPath: "draftId" });
    if (!db.objectStoreNames.contains(STORES.candidates)) db.createObjectStore(STORES.candidates, { keyPath: ["draftId", "draftSequence", "candidateDigest"] });
    if (!db.objectStoreNames.contains(STORES.assets)) db.createObjectStore(STORES.assets, { keyPath: "assetId" });
    if (!db.objectStoreNames.contains(STORES.assetMetadata)) db.createObjectStore(STORES.assetMetadata, { keyPath: "assetId" });
  };
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error ?? new Error("recovery_storage_failed"));
  open.onblocked = () => reject(new Error("recovery_storage_blocked"));
});
const existingDatabase = () => new Promise<IDBDatabase | null>((resolve, reject) => {
  const open = indexedDB.open(DB_NAME);
  let absent = false;
  open.onupgradeneeded = () => { absent = true; open.transaction?.abort(); };
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => absent ? resolve(null) : reject(open.error ?? new Error("recovery_storage_failed"));
  open.onblocked = () => reject(new Error("recovery_storage_blocked"));
});
const withDatabase = async <T>(operation: (db: IDBDatabase) => Promise<T>) => {
  const db = await database();
  try { return await operation(db); } finally { db.close(); }
};
const withExistingDatabase = async <T>(operation: (db: IDBDatabase) => Promise<T>, empty: T) => {
  const db = await existingDatabase();
  if (!db) return empty;
  try { return await operation(db); } finally { db.close(); }
};

const browserAdapter: ProjectRecoveryStorageAdapterV1 = {
  readHead: () => withExistingDatabase(async db => {
    if (!db.objectStoreNames.contains(STORES.heads)) return null;
    return (await request(db.transaction(STORES.heads, "readonly").objectStore(STORES.heads).get(PROJECT_RECOVERY_DRAFT_ID_V1))) ?? null;
  }, null),
  readCandidate: (draftSequence, candidateDigest) => withExistingDatabase(async db => {
    if (!db.objectStoreNames.contains(STORES.candidates)) return null;
    return (await request(db.transaction(STORES.candidates, "readonly").objectStore(STORES.candidates)
      .get([PROJECT_RECOVERY_DRAFT_ID_V1, draftSequence, candidateDigest]))) ?? null;
  }, null),
  readAssets: assetIds => withExistingDatabase(async db => {
    if (!db.objectStoreNames.contains(STORES.assets)) throw new Error("recovery_asset_missing");
    const store = db.transaction(STORES.assets, "readonly").objectStore(STORES.assets);
    return Promise.all(assetIds.map(async assetId => {
      const asset = await request(store.get(assetId));
      if (!asset) throw new Error("recovery_asset_missing");
      return asset as UnifiedEncodedAssetV2;
    }));
  }, []),
  stage: input => withDatabase(async db => {
    const transaction = db.transaction(Object.values(STORES), "readwrite");
    const done = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    const owners = transaction.objectStore(STORES.owners);
    const candidates = transaction.objectStore(STORES.candidates);
    const assets = transaction.objectStore(STORES.assets);
    const assetMetadata = transaction.objectStore(STORES.assetMetadata);
    try {
      const [owner, head, existingCandidates, metadata] = await Promise.all([
        request(owners.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryOwnerV1 | undefined>,
        request(heads.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryEnvelopeV1 | undefined>,
        request(candidates.getAll()) as Promise<ProjectRecoveryCandidateV1[]>,
        request(assetMetadata.getAll()) as Promise<Array<Omit<UnifiedEncodedAssetV2, "bytes">>>,
      ]);
      if (owner && (owner.ownerSessionId !== input.owner.ownerSessionId || owner.workspaceInstanceId !== input.owner.workspaceInstanceId)) {
        throw new Error("recovery_conflict");
      }
      if (owner && input.owner.latestStagedSequence <= owner.latestStagedSequence) throw new Error("recovery_stale_sequence");
      if (head) {
        const validHead = assertProjectRecoveryEnvelopeV1(head);
        if (!projectRecoveryEnvelopeMatchesOwnerV1(validHead, input.owner.ownerSessionId, input.owner.workspaceInstanceId)) throw new Error("recovery_conflict");
        if (input.candidate.draftSequence <= validHead.draftSequence) throw new Error("recovery_stale_sequence");
      }
      const currentKey = head ? candidateKey(assertProjectRecoveryEnvelopeV1(head)).join("\n") : null;
      for (const candidate of existingCandidates) {
        const key = [candidate.draftId, candidate.draftSequence, candidate.candidateDigest].join("\n");
        if (key !== currentKey) candidates.delete([candidate.draftId, candidate.draftSequence, candidate.candidateDigest]);
      }
      const keepAssets = new Set([
        ...(head ? assertProjectRecoveryEnvelopeV1(head).assetBindings.map(binding => binding.assetId) : []),
        ...input.assets.map(asset => asset.assetId),
      ]);
      for (const asset of metadata) {
        if (!keepAssets.has(asset.assetId)) { assets.delete(asset.assetId); assetMetadata.delete(asset.assetId); }
      }
      const metadataById = new Map(metadata.map(asset => [asset.assetId, asset]));
      for (const asset of input.assets) {
        const existing = metadataById.get(asset.assetId);
        if (existing && (existing.sha256 !== asset.sha256 || existing.byteLength !== asset.byteLength || existing.encoding !== asset.encoding)) {
          throw new Error("recovery_asset_mismatch");
        }
        if (!existing) {
          assets.put(asset);
          assetMetadata.put({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding });
        }
      }
      owners.put(input.owner);
      candidates.put(input.candidate);
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }),
  publish: input => withDatabase(async db => {
    const transaction = db.transaction(Object.values(STORES), "readwrite");
    const done = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    const owners = transaction.objectStore(STORES.owners);
    const candidates = transaction.objectStore(STORES.candidates);
    const assets = transaction.objectStore(STORES.assets);
    const assetMetadata = transaction.objectStore(STORES.assetMetadata);
    try {
      const [owner, head, candidate, allCandidates, metadata] = await Promise.all([
        request(owners.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryOwnerV1 | undefined>,
        request(heads.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryEnvelopeV1 | undefined>,
        request(candidates.get([PROJECT_RECOVERY_DRAFT_ID_V1, input.draftSequence, input.candidateDigest])) as Promise<ProjectRecoveryCandidateV1 | undefined>,
        request(candidates.getAll()) as Promise<ProjectRecoveryCandidateV1[]>,
        request(assetMetadata.getAll()) as Promise<Array<Omit<UnifiedEncodedAssetV2, "bytes">>>,
      ]);
      if (!owner || owner.ownerSessionId !== input.ownerSessionId || owner.workspaceInstanceId !== input.workspaceInstanceId || owner.latestStagedSequence !== input.draftSequence) {
        throw new Error("recovery_conflict");
      }
      if (!candidate) throw new Error("recovery_candidate_missing");
      const staged = assertProjectRecoveryEnvelopeV1(candidate.envelope);
      if (staged.status !== "staged" || staged.candidateDigest !== input.candidateDigest) throw new Error("recovery_invalid_record");
      if (head) {
        const validHead = assertProjectRecoveryEnvelopeV1(head);
        if (!projectRecoveryEnvelopeMatchesOwnerV1(validHead, input.ownerSessionId, input.workspaceInstanceId) || validHead.draftSequence >= input.draftSequence) {
          throw new Error("recovery_conflict");
        }
      }
      const current = assertProjectRecoveryEnvelopeV1({ ...staged, status: "current" });
      candidates.put({ ...candidate, envelope: current });
      heads.put(current);
      for (const other of allCandidates) {
        if (other.draftSequence !== input.draftSequence || other.candidateDigest !== input.candidateDigest) {
          candidates.delete([other.draftId, other.draftSequence, other.candidateDigest]);
        }
      }
      const keepAssets = new Set(current.assetBindings.map(binding => binding.assetId));
      for (const asset of metadata) if (!keepAssets.has(asset.assetId)) { assets.delete(asset.assetId); assetMetadata.delete(asset.assetId); }
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }),
  abandon: input => withExistingDatabase(async db => {
    if (!Object.values(STORES).every(name => db.objectStoreNames.contains(name))) return;
    const transaction = db.transaction(Object.values(STORES), "readwrite");
    const done = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    const owners = transaction.objectStore(STORES.owners);
    const candidates = transaction.objectStore(STORES.candidates);
    const assets = transaction.objectStore(STORES.assets);
    const assetMetadata = transaction.objectStore(STORES.assetMetadata);
    try {
      const [owner, head, metadata] = await Promise.all([
        request(owners.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryOwnerV1 | undefined>,
        request(heads.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryEnvelopeV1 | undefined>,
        request(assetMetadata.getAll()) as Promise<Array<Omit<UnifiedEncodedAssetV2, "bytes">>>,
      ]);
      if (!owner || owner.ownerSessionId !== input.ownerSessionId || owner.workspaceInstanceId !== input.workspaceInstanceId || owner.latestStagedSequence !== input.draftSequence) {
        transaction.abort(); await done.catch(() => undefined); return;
      }
      candidates.delete([PROJECT_RECOVERY_DRAFT_ID_V1, input.draftSequence, input.candidateDigest]);
      const current = head ? assertProjectRecoveryEnvelopeV1(head) : null;
      if (current) owners.put({ ...owner, latestStagedSequence: current.draftSequence, updatedAt: new Date().toISOString() });
      else owners.delete(PROJECT_RECOVERY_DRAFT_ID_V1);
      const keepAssets = new Set(current?.assetBindings.map(binding => binding.assetId) ?? []);
      for (const asset of metadata) if (!keepAssets.has(asset.assetId)) { assets.delete(asset.assetId); assetMetadata.delete(asset.assetId); }
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
  }, undefined),
  clear: input => withExistingDatabase(async db => {
    if (!Object.values(STORES).every(name => db.objectStoreNames.contains(name))) return "none" as const;
    const transaction = db.transaction(Object.values(STORES), "readwrite");
    const done = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    const owners = transaction.objectStore(STORES.owners);
    try {
      const [owner, head] = await Promise.all([
        request(owners.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryOwnerV1 | undefined>,
        request(heads.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as Promise<ProjectRecoveryEnvelopeV1 | undefined>,
      ]);
      if (!head) { await done; return "none" as const; }
      const envelope = assertProjectRecoveryEnvelopeV1(head);
      if (!owner || !projectRecoveryEnvelopeMatchesOwnerV1(envelope, input.ownerSessionId, input.workspaceInstanceId)) {
        transaction.abort(); await done.catch(() => undefined); return "not-matched" as const;
      }
      if (owner.latestStagedSequence !== envelope.draftSequence) {
        transaction.abort(); await done.catch(() => undefined); return "newer-draft" as const;
      }
      if (envelope.workspaceGeneration !== input.workspaceGeneration || envelope.candidateDigest !== input.candidateDigest) {
        transaction.abort(); await done.catch(() => undefined); return "not-matched" as const;
      }
      for (const name of Object.values(STORES)) transaction.objectStore(name).clear();
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    return "cleared" as const;
  }, "none" as const),
  claim: input => withExistingDatabase(async db => {
    if (![STORES.heads, STORES.owners, STORES.candidates].every(name => db.objectStoreNames.contains(name))) {
      return "none" as const;
    }
    const transaction = db.transaction([STORES.heads, STORES.owners, STORES.candidates], "readwrite");
    const done = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    const owners = transaction.objectStore(STORES.owners);
    const candidates = transaction.objectStore(STORES.candidates);
    try {
      const head = await request(heads.get(PROJECT_RECOVERY_DRAFT_ID_V1)) as ProjectRecoveryEnvelopeV1 | undefined;
      if (!head) { await done; return "none" as const; }
      const envelope = assertProjectRecoveryEnvelopeV1(head);
      if (
        envelope.status !== "current" ||
        envelope.ownerSessionId !== input.expectedOwnerSessionId ||
        envelope.workspaceInstanceId !== input.expectedWorkspaceInstanceId ||
        envelope.draftSequence !== input.draftSequence ||
        envelope.candidateDigest !== input.candidateDigest
      ) {
        transaction.abort();
        await done.catch(() => undefined);
        return "changed" as const;
      }
      const key: [string, number, string] = [PROJECT_RECOVERY_DRAFT_ID_V1, input.draftSequence, input.candidateDigest];
      const candidate = await request(candidates.get(key)) as ProjectRecoveryCandidateV1 | undefined;
      if (!candidate) throw new Error("recovery_candidate_missing");
      const claimedEnvelope = assertProjectRecoveryEnvelopeV1({
        ...envelope,
        ownerSessionId: input.ownerSessionId,
        workspaceInstanceId: input.workspaceInstanceId,
      });
      candidates.put({ ...candidate, envelope: claimedEnvelope });
      heads.put(claimedEnvelope);
      owners.put({
        draftId: PROJECT_RECOVERY_DRAFT_ID_V1,
        ownerSessionId: input.ownerSessionId,
        workspaceInstanceId: input.workspaceInstanceId,
        latestStagedSequence: input.draftSequence,
        updatedAt: new Date().toISOString(),
      } satisfies ProjectRecoveryOwnerV1);
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    return "claimed" as const;
  }, "none" as const),
  discard: expectation => withExistingDatabase(async db => {
    const storeNames = Object.values(STORES).filter(name => db.objectStoreNames.contains(name));
    if (!storeNames.includes(STORES.heads)) return "none" as const;
    const transaction = db.transaction(storeNames, "readwrite");
    const done = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    try {
      const rawHead = await request(heads.get(PROJECT_RECOVERY_DRAFT_ID_V1));
      if (!rawHead) { await done; return "none" as const; }
      let validHead: ProjectRecoveryEnvelopeV1 | null = null;
      try { validHead = assertProjectRecoveryEnvelopeV1(rawHead); } catch { validHead = null; }
      const matches = expectation.kind === "invalid"
        ? validHead === null
        : Boolean(
            validHead &&
            validHead.ownerSessionId === expectation.ownerSessionId &&
            validHead.workspaceInstanceId === expectation.workspaceInstanceId &&
            validHead.draftSequence === expectation.draftSequence &&
            validHead.candidateDigest === expectation.candidateDigest
          );
      if (!matches) {
        transaction.abort();
        await done.catch(() => undefined);
        return "changed" as const;
      }
      for (const storeName of storeNames) transaction.objectStore(storeName).clear();
    } catch (error) {
      transaction.abort();
      await done.catch(() => undefined);
      throw error;
    }
    await done;
    return "discarded" as const;
  }, "none" as const),
};

const browserStorage = () => createProjectRecoveryStorageV1(browserAdapter);

export const getOrCreateProjectRecoverySessionIdV1 = () => {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.() ?? `recovery-session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
};

export const inspectProjectRecoveryDraftV1 = () => browserStorage().inspect();
export const writeProjectRecoveryDraftV1 = (input: ProjectRecoveryWriteInputV1, hooks: ProjectRecoveryFaultHooksV1 = {}) =>
  browserStorage().write(input, hooks);
export const clearProjectRecoveryDraftV1 = (input: ProjectRecoveryClearInputV1) => browserStorage().clear(input);
export const claimProjectRecoveryDraftV1 = (input: ProjectRecoveryClaimInputV1) => browserStorage().claim(input);
export const discardProjectRecoveryDraftV1 = (expectation: ProjectRecoveryDiscardExpectationV1) => browserStorage().discard(expectation);

export { DB_NAME as PROJECT_RECOVERY_DATABASE_V1, STORES as PROJECT_RECOVERY_STORES_V1 };
