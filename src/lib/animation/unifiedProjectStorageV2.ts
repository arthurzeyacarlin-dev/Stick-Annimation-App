import { assertUnifiedAnimationProjectV2, type UnifiedAnimationProjectV2 } from "./unifiedAnimationContractV2.ts";
import { assertStructuredSymbolDigestsV2 } from "./unifiedProjectCatalogV2.ts";

const DB_NAME = "diamond-animation-unified-v2";
const DB_VERSION = 2;
const STORES = Object.freeze({ projects: "projects", heads: "heads", versions: "versions", assets: "assets", assetMetadata: "assetMetadata" });
const PROJECT_LIMIT = 64;
const PROJECT_BYTE_LIMIT = 134_217_728;
const COLLECTION_BYTE_LIMIT = 536_870_912;

export type UnifiedEncodedAssetV2 = {
  assetId: string;
  sha256: string;
  byteLength: number;
  encoding: "typed-array" | "data-url";
  bytes: Uint8Array;
};

type UnifiedEncodedAssetMetadataV2 = Omit<UnifiedEncodedAssetV2, "bytes">;

type EncodedAssetReferenceV2 = {
  __unifiedAssetRef: string;
  encoding: UnifiedEncodedAssetV2["encoding"];
  constructorName: "Uint8Array" | "Uint8ClampedArray" | null;
  byteLength: number;
};

export type UnifiedProjectVersionV2 = {
  projectId: string;
  revision: number;
  projectDigest: string;
  metadataByteLength: number;
  storedByteLength: number;
  assetIds: string[];
  encodedProject: unknown;
};

export type UnifiedProjectHeadV2 = {
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeRevision: number;
  projectDigest: string;
  storedByteLength: number;
  provenance: UnifiedAnimationProjectV2["provenance"];
};

export type UnifiedStorageFaultHooksV2 = Partial<Record<"encode" | "hash" | "decode" | "readback" | "beforePublish", () => void>>;

export type UnifiedProjectStorageAdapterV2 = {
  listHeads: () => Promise<UnifiedProjectHeadV2[]>;
  listLegacyProjects: () => Promise<UnifiedAnimationProjectV2[]>;
  readHead: (projectId: string) => Promise<UnifiedProjectHeadV2 | null>;
  readLegacyProject: (projectId: string) => Promise<UnifiedAnimationProjectV2 | null>;
  readVersions: (projectId: string, maximumRevision: number) => Promise<UnifiedProjectVersionV2[]>;
  readVersion: (projectId: string, revision: number, projectDigest: string) => Promise<UnifiedProjectVersionV2 | null>;
  readAssets: (assetIds: readonly string[]) => Promise<UnifiedEncodedAssetV2[]>;
  stage: (input: {
    head: UnifiedProjectHeadV2;
    version: UnifiedProjectVersionV2;
    assets: UnifiedEncodedAssetV2[];
    expectedRevision: number | null;
  }) => Promise<void>;
  publish: (head: UnifiedProjectHeadV2, expectedRevision: number | null) => Promise<void>;
};

const utf8 = (value: string) => new TextEncoder().encode(value);
const text = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isAssetReference = (value: unknown): value is EncodedAssetReferenceV2 => object(value) && typeof value.__unifiedAssetRef === "string";
const fail = (code: string): never => { throw new Error(code); };
const sha256Hex = async (bytes: Uint8Array) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail("storage_read_failed");
  const digest = await subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

export const prepareUnifiedProjectStorageV2 = async (project: UnifiedAnimationProjectV2, hooks: UnifiedStorageFaultHooksV2 = {}) => {
  hooks.encode?.();
  const assets = new Map<string, UnifiedEncodedAssetV2>();
  const seen = new Set<object>();
  const visit = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string" && /^data:(?:image|audio)\//.test(value)) {
      const bytes = utf8(value);
      hooks.hash?.();
      const digest = await sha256Hex(bytes);
      const assetId = `sha256:${digest}`;
      assets.set(assetId, { assetId, sha256: digest, byteLength: bytes.byteLength, encoding: "data-url", bytes });
      return { __unifiedAssetRef: assetId, encoding: "data-url", constructorName: null, byteLength: bytes.byteLength } satisfies EncodedAssetReferenceV2;
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as Uint8Array | Uint8ClampedArray;
      if (!(view instanceof Uint8Array) && !(view instanceof Uint8ClampedArray)) fail("encode_failed");
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      hooks.hash?.();
      const digest = await sha256Hex(bytes);
      const assetId = `sha256:${digest}`;
      assets.set(assetId, { assetId, sha256: digest, byteLength: bytes.byteLength, encoding: "typed-array", bytes });
      return {
        __unifiedAssetRef: assetId,
        encoding: "typed-array",
        constructorName: value instanceof Uint8ClampedArray ? "Uint8ClampedArray" : "Uint8Array",
        byteLength: bytes.byteLength,
      } satisfies EncodedAssetReferenceV2;
    }
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (value === undefined || typeof value !== "object") fail("encode_failed");
    const objectValue = value as object;
    if (seen.has(objectValue)) fail("encode_failed");
    seen.add(objectValue);
    let encoded: unknown;
    if (Array.isArray(value)) {
      encoded = await Promise.all(value.map(visit));
    } else {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (entry === undefined) continue;
        result[key] = await visit(entry);
      }
      encoded = result;
    }
    seen.delete(objectValue);
    return encoded;
  };
  const encodedProject = await visit(project);
  const encodedJson = JSON.stringify(encodedProject);
  hooks.hash?.();
  const projectDigest = await sha256Hex(utf8(encodedJson));
  const metadataByteLength = utf8(encodedJson).byteLength;
  const storedByteLength = metadataByteLength + [...assets.values()].reduce((total, asset) => total + asset.byteLength, 0);
  if (storedByteLength > PROJECT_BYTE_LIMIT) fail("project_too_large");
  return {
    assets: [...assets.values()].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    version: {
      projectId: project.projectId,
      revision: project.revision,
      projectDigest,
      metadataByteLength,
      storedByteLength,
      assetIds: [...assets.keys()].sort(),
      encodedProject,
    } satisfies UnifiedProjectVersionV2,
  };
};

export const hydrateUnifiedProjectStorageV2 = async (
  version: UnifiedProjectVersionV2,
  assets: readonly UnifiedEncodedAssetV2[],
  hooks: UnifiedStorageFaultHooksV2 = {},
) => {
  hooks.decode?.();
  const byId = new Map(assets.map(asset => [asset.assetId, asset]));
  const verifiedAssetIds = new Set<string>();
  const hydratedTypedArrays = new Map<string, Uint8Array | Uint8ClampedArray>();
  const visit = async (value: unknown): Promise<unknown> => {
    if (isAssetReference(value)) {
      const asset = byId.get(value.__unifiedAssetRef);
      if (!asset) throw new Error("asset_missing");
      if (asset.encoding !== value.encoding || asset.byteLength !== value.byteLength || asset.bytes.byteLength !== asset.byteLength) fail("asset_missing");
      if (!verifiedAssetIds.has(asset.assetId)) {
        const digest = await sha256Hex(asset.bytes);
        if (digest !== asset.sha256 || asset.assetId !== `sha256:${digest}`) fail("asset_digest_mismatch");
        verifiedAssetIds.add(asset.assetId);
      }
      if (value.encoding === "data-url") return text(asset.bytes);
      const hydratedKey = `${asset.assetId}:${value.constructorName}`;
      const existingHydrated = hydratedTypedArrays.get(hydratedKey);
      if (existingHydrated) return existingHydrated;
      const hydrated = value.constructorName === "Uint8ClampedArray"
        ? new Uint8ClampedArray(asset.bytes.slice().buffer)
        : value.constructorName === "Uint8Array"
          ? asset.bytes.slice()
          : null;
      if (hydrated) {
        hydratedTypedArrays.set(hydratedKey, hydrated);
        return hydrated;
      }
      fail("decode_failed");
    }
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (object(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) result[key] = await visit(entry);
      return result;
    }
    return value;
  };
  const project = assertUnifiedAnimationProjectV2(await visit(version.encodedProject) as UnifiedAnimationProjectV2);
  await assertStructuredSymbolDigestsV2(project.document.catalogs.symbols);
  const prepared = await prepareUnifiedProjectStorageV2(project);
  if (prepared.version.projectDigest !== version.projectDigest || prepared.version.metadataByteLength !== version.metadataByteLength ||
    prepared.version.storedByteLength !== version.storedByteLength || JSON.stringify(prepared.version.assetIds) !== JSON.stringify(version.assetIds)) fail("version_mismatch");
  return project;
};

const syntheticLegacyHead = async (project: UnifiedAnimationProjectV2): Promise<UnifiedProjectHeadV2> => {
  const prepared = await prepareUnifiedProjectStorageV2(project);
  return {
    projectId: project.projectId,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activeRevision: project.revision,
    projectDigest: prepared.version.projectDigest,
    storedByteLength: prepared.version.storedByteLength,
    provenance: project.provenance,
  };
};

export const createUnifiedProjectStorageV2 = (adapter: UnifiedProjectStorageAdapterV2) => ({
  async listHeads(): Promise<UnifiedProjectHeadV2[]> {
    const heads = await adapter.listHeads();
    const ids = new Set(heads.map(head => head.projectId));
    for (const project of await adapter.listLegacyProjects()) if (!ids.has(project.projectId)) heads.push(await syntheticLegacyHead(assertUnifiedAnimationProjectV2(project)));
    return heads.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.projectId.localeCompare(right.projectId));
  },

  async read(projectId: string, hooks: UnifiedStorageFaultHooksV2 = {}): Promise<UnifiedAnimationProjectV2> {
    const head = await adapter.readHead(projectId);
    if (!head) {
      const legacy = await adapter.readLegacyProject(projectId);
      if (!legacy) fail("source_changed");
      return structuredClone(assertUnifiedAnimationProjectV2(legacy as UnifiedAnimationProjectV2));
    }
    const versions = (await adapter.readVersions(projectId, head.activeRevision))
      .filter(version => version.revision <= head.activeRevision)
      .sort((left, right) => right.revision - left.revision || (left.projectDigest === head.projectDigest ? -1 : 1));
    const ordered = [
      ...versions.filter(version => version.revision === head.activeRevision && version.projectDigest === head.projectDigest),
      ...versions.filter(version => !(version.revision === head.activeRevision && version.projectDigest === head.projectDigest)),
    ];
    let lastError: unknown = new Error("version_missing");
    for (const version of ordered) {
      try {
        const assets = await adapter.readAssets(version.assetIds);
        return await hydrateUnifiedProjectStorageV2(version, assets, hooks);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  },

  async write(project: UnifiedAnimationProjectV2, expectedRevision: number | null, hooks: UnifiedStorageFaultHooksV2 = {}) {
    const candidate = assertUnifiedAnimationProjectV2(project);
    await assertStructuredSymbolDigestsV2(candidate.document.catalogs.symbols);
    const prepared = await prepareUnifiedProjectStorageV2(candidate, hooks);
    const head: UnifiedProjectHeadV2 = {
      projectId: candidate.projectId,
      title: candidate.title,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      activeRevision: candidate.revision,
      projectDigest: prepared.version.projectDigest,
      storedByteLength: prepared.version.storedByteLength,
      provenance: candidate.provenance,
    };
    await adapter.stage({ head, version: prepared.version, assets: prepared.assets, expectedRevision });
    const staged = await adapter.readVersion(candidate.projectId, candidate.revision, prepared.version.projectDigest);
    if (!staged) fail("readback_failed");
    const verifiedStaged = staged as UnifiedProjectVersionV2;
    const stagedProject = await hydrateUnifiedProjectStorageV2(verifiedStaged, await adapter.readAssets(verifiedStaged.assetIds), hooks);
    hooks.readback?.();
    const stagedDigest = (await prepareUnifiedProjectStorageV2(stagedProject)).version.projectDigest;
    if (stagedDigest !== prepared.version.projectDigest) fail("readback_failed");
    hooks.beforePublish?.();
    await adapter.publish(head, expectedRevision);
    const readback = await this.read(candidate.projectId);
    const readbackDigest = (await prepareUnifiedProjectStorageV2(readback)).version.projectDigest;
    if (readback.revision !== candidate.revision || readbackDigest !== prepared.version.projectDigest) fail("readback_failed");
    return readback;
  },
});

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error ?? new Error("storage_read_failed"));
});

const completion = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("storage_write_failed"));
});

const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(STORES.projects)) db.createObjectStore(STORES.projects, { keyPath: "projectId" });
    if (!db.objectStoreNames.contains(STORES.heads)) db.createObjectStore(STORES.heads, { keyPath: "projectId" });
    if (!db.objectStoreNames.contains(STORES.versions)) db.createObjectStore(STORES.versions, { keyPath: ["projectId", "revision", "projectDigest"] });
    if (!db.objectStoreNames.contains(STORES.assets)) db.createObjectStore(STORES.assets, { keyPath: "assetId" });
    if (!db.objectStoreNames.contains(STORES.assetMetadata)) db.createObjectStore(STORES.assetMetadata, { keyPath: "assetId" });
  };
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => reject(open.error ?? new Error("storage_read_failed"));
  open.onblocked = () => reject(new Error("storage_read_failed"));
});

// Collection listing and Open must not create or upgrade storage. Explicit Save
// is the only path that calls database() with the current schema version.
const existingDatabase = () => new Promise<IDBDatabase | null>((resolve, reject) => {
  const open = indexedDB.open(DB_NAME);
  let absent = false;
  open.onupgradeneeded = () => { absent = true; open.transaction?.abort(); };
  open.onsuccess = () => resolve(open.result);
  open.onerror = () => absent ? resolve(null) : reject(open.error ?? new Error("storage_read_failed"));
  open.onblocked = () => reject(new Error("storage_read_failed"));
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

type LegacyStorageAccountingV2 = {
  projectIds: string[];
  revisionStamps: string[];
  storedByteLength: number;
};

const legacyStorageAccounting = () => withExistingDatabase(async db => {
  if (!db.objectStoreNames.contains(STORES.projects)) return { projectIds: [], revisionStamps: [], storedByteLength: 0 };
  const projects = await request(db.transaction(STORES.projects, "readonly").objectStore(STORES.projects).getAll()) as UnifiedAnimationProjectV2[];
  const projectIds = projects.map(project => project.projectId).sort();
  const revisionStamps = projects
    .map(project => `${project.projectId}:${project.revision}:${project.updatedAt}`)
    .sort();
  let storedByteLength = 0;
  for (const project of projects) storedByteLength += (await prepareUnifiedProjectStorageV2(assertUnifiedAnimationProjectV2(project))).version.storedByteLength;
  return { projectIds, revisionStamps, storedByteLength };
}, { projectIds: [], revisionStamps: [], storedByteLength: 0 } satisfies LegacyStorageAccountingV2);

const browserAdapter: UnifiedProjectStorageAdapterV2 = {
  listHeads: () => withExistingDatabase(async db => db.objectStoreNames.contains(STORES.heads) ? request(db.transaction(STORES.heads, "readonly").objectStore(STORES.heads).getAll()) : [], []),
  listLegacyProjects: () => withExistingDatabase(async db => {
    if (!db.objectStoreNames.contains(STORES.projects)) return [];
    const names = db.objectStoreNames.contains(STORES.heads) ? [STORES.projects, STORES.heads] : [STORES.projects];
    const transaction = db.transaction(names, "readonly");
    const projects = transaction.objectStore(STORES.projects);
    const [projectKeys, heads] = await Promise.all([
      request(projects.getAllKeys()),
      db.objectStoreNames.contains(STORES.heads) ? request(transaction.objectStore(STORES.heads).getAll()) as Promise<UnifiedProjectHeadV2[]> : Promise.resolve([]),
    ]);
    const headed = new Set(heads.map(head => head.projectId));
    return Promise.all(projectKeys.filter(key => typeof key === "string" && !headed.has(key)).map(key => request(projects.get(key)))) as Promise<UnifiedAnimationProjectV2[]>;
  }, []),
  readHead: projectId => withExistingDatabase(async db => db.objectStoreNames.contains(STORES.heads) ? (await request(db.transaction(STORES.heads, "readonly").objectStore(STORES.heads).get(projectId))) ?? null : null, null),
  readLegacyProject: projectId => withExistingDatabase(async db => db.objectStoreNames.contains(STORES.projects) ? (await request(db.transaction(STORES.projects, "readonly").objectStore(STORES.projects).get(projectId))) ?? null : null, null),
  readVersions: (projectId, maximumRevision) => withExistingDatabase(async db => {
    if (!db.objectStoreNames.contains(STORES.versions)) return [];
    const lower: [string, number, string] = [projectId, 0, ""];
    const upper: [string, number, string] = [projectId, maximumRevision, "\uffff"];
    return request(db.transaction(STORES.versions, "readonly").objectStore(STORES.versions).getAll(IDBKeyRange.bound(lower, upper)));
  }, []),
  readVersion: (projectId, revision, projectDigest) => withExistingDatabase(async db => db.objectStoreNames.contains(STORES.versions)
    ? (await request(db.transaction(STORES.versions, "readonly").objectStore(STORES.versions).get([projectId, revision, projectDigest]))) ?? null
    : null, null),
  readAssets: assetIds => withExistingDatabase(async db => {
    if (!db.objectStoreNames.contains(STORES.assets)) fail("asset_missing");
    const store = db.transaction(STORES.assets, "readonly").objectStore(STORES.assets);
    return Promise.all(assetIds.map(async assetId => {
      const asset = await request(store.get(assetId));
      if (!asset) fail("asset_missing");
      return asset as UnifiedEncodedAssetV2;
    }));
  }, []),
  stage: async input => {
    // Old direct-project records can be large. Encode them before opening the
    // read/write transaction so asynchronous hashing cannot make it inactive.
    const legacyAccounting = await legacyStorageAccounting();
    const legacyRecoveryProject = await withExistingDatabase(async db => db.objectStoreNames.contains(STORES.projects)
      ? (await request(db.transaction(STORES.projects, "readonly").objectStore(STORES.projects).get(input.head.projectId))) ?? null
      : null, null) as UnifiedAnimationProjectV2 | null;
    const legacyRecovery = legacyRecoveryProject
      ? await prepareUnifiedProjectStorageV2(assertUnifiedAnimationProjectV2(legacyRecoveryProject))
      : null;
    return withDatabase(async db => {
      const transaction = db.transaction([STORES.projects, STORES.heads, STORES.versions, STORES.assets, STORES.assetMetadata], "readwrite");
      const completionPromise = completion(transaction);
      const heads = transaction.objectStore(STORES.heads);
      const projects = transaction.objectStore(STORES.projects);
      const versions = transaction.objectStore(STORES.versions);
      const assets = transaction.objectStore(STORES.assets);
      const assetMetadata = transaction.objectStore(STORES.assetMetadata);
      try {
        const versionKey: [string, number, string] = [input.version.projectId, input.version.revision, input.version.projectDigest];
        const [currentHead, legacyProject, existingVersion, allHeads, legacyProjects, allVersions, allAssetMetadata] = await Promise.all([
          request(heads.get(input.head.projectId)) as Promise<UnifiedProjectHeadV2 | undefined>,
          request(projects.get(input.head.projectId)) as Promise<UnifiedAnimationProjectV2 | undefined>,
          request(versions.get(versionKey)) as Promise<UnifiedProjectVersionV2 | undefined>,
          request(heads.getAll()) as Promise<UnifiedProjectHeadV2[]>,
          request(projects.getAll()) as Promise<UnifiedAnimationProjectV2[]>,
          request(versions.getAll()) as Promise<UnifiedProjectVersionV2[]>,
          request(assetMetadata.getAll()) as Promise<UnifiedEncodedAssetMetadataV2[]>,
        ]);
        const legacyProjectIds = legacyProjects.map(project => project.projectId).sort();
        const legacyRevisionStamps = legacyProjects.map(project => `${project.projectId}:${project.revision}:${project.updatedAt}`).sort();
        if (JSON.stringify(legacyProjectIds) !== JSON.stringify(legacyAccounting.projectIds) ||
          JSON.stringify(legacyRevisionStamps) !== JSON.stringify(legacyAccounting.revisionStamps)) fail("stale_revision");
        const currentRevision = currentHead?.activeRevision ?? legacyProject?.revision ?? null;
        if (input.expectedRevision === null ? currentRevision !== null : currentRevision !== input.expectedRevision) fail(input.expectedRevision === null ? "duplicate_identity" : "stale_revision");
        const projectIds = new Set([...allHeads.map(head => head.projectId), ...legacyProjectIds]);
        if (!projectIds.has(input.head.projectId) && projectIds.size >= PROJECT_LIMIT) fail("project_limit_reached");
        const existingAssets = new Map(allAssetMetadata.map(asset => [asset.assetId, asset]));
        let collectionBytes = legacyAccounting.storedByteLength + allVersions.reduce((total, version) => total + version.metadataByteLength, 0) + allAssetMetadata.reduce((total, asset) => total + asset.byteLength, 0);
        if (!existingVersion) collectionBytes += input.version.metadataByteLength;
        for (const asset of input.assets) if (!existingAssets.has(asset.assetId)) collectionBytes += asset.byteLength;
        if (collectionBytes > COLLECTION_BYTE_LIMIT) fail("collection_too_large");
        for (const asset of input.assets) {
          const existing = existingAssets.get(asset.assetId);
          if (existing && (existing.sha256 !== asset.sha256 || existing.byteLength !== asset.byteLength || existing.encoding !== asset.encoding)) fail("asset_digest_mismatch");
          if (!existing) {
            assets.put(asset);
            assetMetadata.put({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding } satisfies UnifiedEncodedAssetMetadataV2);
          }
        }
        // A direct V2 record predates immutable version storage. Preserve its
        // exact bytes as the recovery predecessor before the migrated head can
        // replace that direct record. Publication deletes only the old direct
        // container; this immutable version and its assets remain addressable.
        if (legacyProject && legacyRecovery) {
          const recoveryKey: [string, number, string] = [legacyRecovery.version.projectId, legacyRecovery.version.revision, legacyRecovery.version.projectDigest];
          if (!allVersions.some(version => version.projectId === recoveryKey[0] && version.revision === recoveryKey[1] && version.projectDigest === recoveryKey[2])) {
            versions.add(legacyRecovery.version);
          }
          for (const asset of legacyRecovery.assets) {
            const existing = existingAssets.get(asset.assetId);
            if (existing && (existing.sha256 !== asset.sha256 || existing.byteLength !== asset.byteLength || existing.encoding !== asset.encoding)) fail("asset_digest_mismatch");
            if (!existing) {
              assets.put(asset);
              assetMetadata.put({ assetId: asset.assetId, sha256: asset.sha256, byteLength: asset.byteLength, encoding: asset.encoding } satisfies UnifiedEncodedAssetMetadataV2);
              existingAssets.set(asset.assetId, asset);
            }
          }
        }
        if (!existingVersion) versions.add(input.version);
      } catch (error) {
        transaction.abort();
        await completionPromise.catch(() => undefined);
        throw error;
      }
      await completionPromise;
    });
  },
  publish: (head, expectedRevision) => withDatabase(async db => {
    const transaction = db.transaction([STORES.projects, STORES.heads], "readwrite");
    const completionPromise = completion(transaction);
    const heads = transaction.objectStore(STORES.heads);
    const projects = transaction.objectStore(STORES.projects);
    try {
      const [currentHead, legacyProject] = await Promise.all([
        request(heads.get(head.projectId)) as Promise<UnifiedProjectHeadV2 | undefined>,
        request(projects.get(head.projectId)) as Promise<UnifiedAnimationProjectV2 | undefined>,
      ]);
      const currentRevision = currentHead?.activeRevision ?? legacyProject?.revision ?? null;
      if (expectedRevision === null ? currentRevision !== null : currentRevision !== expectedRevision) fail(expectedRevision === null ? "duplicate_identity" : "stale_revision");
      heads.put(head);
      if (legacyProject) projects.delete(head.projectId);
    } catch (error) {
      transaction.abort();
      await completionPromise.catch(() => undefined);
      throw error;
    }
    await completionPromise;
  }),
};

const browserStorage = () => createUnifiedProjectStorageV2(browserAdapter);

export const digestUnifiedProjectV2 = async (project: UnifiedAnimationProjectV2) =>
  (await prepareUnifiedProjectStorageV2(assertUnifiedAnimationProjectV2(project))).version.projectDigest;
export const listUnifiedProjectHeadsV2 = () => browserStorage().listHeads();
export const listUnifiedProjectsV2 = async () => Promise.all((await listUnifiedProjectHeadsV2()).map(head => readUnifiedProjectV2(head.projectId)));
export const readUnifiedProjectV2 = (projectId: string) => browserStorage().read(projectId);
export const writeUnifiedProjectV2 = (project: UnifiedAnimationProjectV2, expectedRevision: number | null) => browserStorage().write(project, expectedRevision);

export { DB_NAME as UNIFIED_PROJECT_DATABASE_V2, STORES as UNIFIED_PROJECT_STORES_V2 };
