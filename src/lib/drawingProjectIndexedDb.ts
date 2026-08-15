import {
  DrawingProjectV2Error,
  parseDrawingProjectHeadV2,
  parseDrawingProjectLegacyDeleteTombstoneV1,
} from "./drawingProjectV2Contract.ts";
import { canonicalJsonBytes } from "./drawingProjectV2Canonical.ts";
import type {
  DrawingProjectIndexedRepositoryAdapter,
  DrawingProjectManagedState,
} from "./drawingProjectV2Repository.ts";

export const DRAWING_PROJECT_INDEXED_DB = Object.freeze({
  name: "diamond-animator-local",
  version: 1,
  stores: {
    heads: "drawingProjectHeadsV2",
    versions: "drawingProjectVersionsV2",
    previews: "drawingProjectPreviewsV1",
    auxiliary: "drawingProjectAuxiliaryV1",
    tombstones: "drawingProjectLegacyDeleteTombstonesV1",
  },
});

type IndexedDbFactory = Pick<IDBFactory, "open">;

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
  });

const transactionCompletion = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new DOMException("IndexedDB transaction aborted.", "AbortError")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")), { once: true });
  });

const mapStorageError = (error: unknown, stage: string): never => {
  if (error instanceof DrawingProjectV2Error) throw error;
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    throw new DrawingProjectV2Error("quota_exceeded", stage, "IndexedDB quota exceeded.");
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    throw new DrawingProjectV2Error("transaction_aborted", stage, "IndexedDB transaction aborted.");
  }
  throw new DrawingProjectV2Error("storage_write_failed", stage, error instanceof Error ? error.message : "IndexedDB operation failed.");
};

const cursorDeleteProjectVersions = (store: IDBObjectStore, projectId: string, keepRevision?: number) =>
  new Promise<number>((resolve, reject) => {
    let deleted = 0;
    const request = store.openCursor();
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB cursor failed.")), { once: true });
    request.addEventListener("success", () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(deleted);
        return;
      }
      const value = cursor.value as { projectId?: unknown; storageRevision?: unknown };
      if (value.projectId === projectId && value.storageRevision !== keepRevision) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    });
  });

const estimateCompanionBytes = (value: unknown): number => {
  let blobBytes = 0;
  const visit = (entry: unknown): unknown => {
    if (entry instanceof Blob) {
      blobBytes += entry.size;
      return { byteLength: entry.size, type: entry.type };
    }
    if (Array.isArray(entry)) return entry.map(visit);
    if (entry !== null && typeof entry === "object") return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, visit(child)]));
    return entry;
  };
  return canonicalJsonBytes(visit(value)).byteLength + blobBytes;
};

export const createDrawingProjectIndexedDbAdapter = (options: {
  indexedDB: IndexedDbFactory;
  databaseName?: string;
}): DrawingProjectIndexedRepositoryAdapter & { close(): Promise<void>; deleteDatabase(): Promise<void> } => {
  const databaseName = options.databaseName ?? DRAWING_PROJECT_INDEXED_DB.name;
  let databasePromise: Promise<IDBDatabase> | null = null;

  const getDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = options.indexedDB.open(databaseName, DRAWING_PROJECT_INDEXED_DB.version);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        const stores = DRAWING_PROJECT_INDEXED_DB.stores;
        if (!database.objectStoreNames.contains(stores.heads)) database.createObjectStore(stores.heads, { keyPath: "projectId" });
        if (!database.objectStoreNames.contains(stores.versions)) database.createObjectStore(stores.versions, { keyPath: ["projectId", "storageRevision"] });
        if (!database.objectStoreNames.contains(stores.previews)) database.createObjectStore(stores.previews, { keyPath: "projectId" });
        if (!database.objectStoreNames.contains(stores.auxiliary)) database.createObjectStore(stores.auxiliary, { keyPath: "projectId" });
        if (!database.objectStoreNames.contains(stores.tombstones)) database.createObjectStore(stores.tombstones, { keyPath: "projectId" });
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB open failed.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("IndexedDB open was blocked.")), { once: true });
    });
    return databasePromise;
  };

  const readAll = async (storeName: string) => {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readonly");
    const completion = transactionCompletion(transaction);
    const values = await requestResult(transaction.objectStore(storeName).getAll());
    await completion;
    return values as unknown[];
  };

  const adapter: DrawingProjectIndexedRepositoryAdapter & { close(): Promise<void>; deleteDatabase(): Promise<void> } = {
    async stageCandidate(record) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.versions, "readwrite");
        const completion = transactionCompletion(transaction);
        await requestResult(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.versions).add(record));
        await completion;
      } catch (error) {
        mapStorageError(error, "indexeddb.stage");
      }
    },

    async readVersion(projectId, storageRevision) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.versions, "readonly");
        const completion = transactionCompletion(transaction);
        const value = await requestResult(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.versions).get([projectId, storageRevision]));
        await completion;
        return value ?? null;
      } catch (error) {
        throw new DrawingProjectV2Error("storage_read_failed", "indexeddb.read-version", error instanceof Error ? error.message : "Version read failed.");
      }
    },

    async removeVersion(projectId, storageRevision) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.versions, "readwrite");
        const completion = transactionCompletion(transaction);
        transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.versions).delete([projectId, storageRevision]);
        await completion;
      } catch (error) {
        mapStorageError(error, "indexeddb.remove-version");
      }
    },

    async publishHeadCas(expectedRevision, head) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.heads, "readwrite");
        const completion = transactionCompletion(transaction);
        const store = transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.heads);
        const current = await requestResult(store.get(head.projectId));
        const currentRevision = current ? parseDrawingProjectHeadV2(current).activeStorageRevision : null;
        if (currentRevision !== expectedRevision) {
          await completion;
          return "stale";
        }
        store.put(head);
        await completion;
        return "committed";
      } catch (error) {
        return mapStorageError(error, "indexeddb.publish-head");
      }
    },

    async cleanupProjectVersions(projectId, activeStorageRevision) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.versions, "readwrite");
        const completion = transactionCompletion(transaction);
        const count = await cursorDeleteProjectVersions(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.versions), projectId, activeStorageRevision);
        await completion;
        return count;
      } catch (error) {
        return mapStorageError(error, "indexeddb.cleanup-project");
      }
    },

    async cleanupOrphanVersions() {
      const heads = (await adapter.listHeads()).map(parseDrawingProjectHeadV2);
      const active = new Set(heads.map((head) => `${head.projectId}\u0000${head.activeStorageRevision}`));
      const versions = await readAll(DRAWING_PROJECT_INDEXED_DB.stores.versions) as Array<{ projectId: string; storageRevision: number }>;
      const orphans = versions.filter((record) => !active.has(`${record.projectId}\u0000${record.storageRevision}`));
      if (orphans.length === 0) return 0;
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.versions, "readwrite");
        const completion = transactionCompletion(transaction);
        const store = transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.versions);
        for (const orphan of orphans) store.delete([orphan.projectId, orphan.storageRevision]);
        await completion;
        return orphans.length;
      } catch (error) {
        return mapStorageError(error, "indexeddb.cleanup-orphans");
      }
    },

    async getManagedState(): Promise<DrawingProjectManagedState> {
      try {
        const [headValues, previewValues, auxiliaryValues, tombstoneValues] = await Promise.all([
          adapter.listHeads(),
          readAll(DRAWING_PROJECT_INDEXED_DB.stores.previews),
          readAll(DRAWING_PROJECT_INDEXED_DB.stores.auxiliary),
          adapter.listTombstones(),
        ]);
        const heads = headValues.map(parseDrawingProjectHeadV2);
        return {
          heads,
          tombstones: tombstoneValues.map(parseDrawingProjectLegacyDeleteTombstoneV1),
          activeStoredBytes: heads.reduce((sum, head) => sum + head.activeStoredByteLength, 0),
          companionStoredBytes: [...previewValues, ...auxiliaryValues].reduce<number>((sum, value) => sum + estimateCompanionBytes(value), 0),
          tombstoneStoredBytes: tombstoneValues.reduce<number>((sum, value) => sum + canonicalJsonBytes(value).byteLength, 0),
        };
      } catch (error) {
        throw new DrawingProjectV2Error("storage_read_failed", "indexeddb.managed-state", error instanceof Error ? error.message : "Managed state read failed.");
      }
    },

    async getHead(projectId) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.heads, "readonly");
        const completion = transactionCompletion(transaction);
        const value = await requestResult(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.heads).get(projectId));
        await completion;
        return value ?? null;
      } catch (error) {
        throw new DrawingProjectV2Error("storage_read_failed", "indexeddb.read-head", error instanceof Error ? error.message : "Head read failed.");
      }
    },

    listHeads: () => readAll(DRAWING_PROJECT_INDEXED_DB.stores.heads),
    listTombstones: () => readAll(DRAWING_PROJECT_INDEXED_DB.stores.tombstones),

    async deleteAuthoritativeV2(input) {
      try {
        const database = await getDatabase();
        const names = Object.values(DRAWING_PROJECT_INDEXED_DB.stores);
        const transaction = database.transaction(names, "readwrite");
        const completion = transactionCompletion(transaction);
        const heads = transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.heads);
        const currentValue = await requestResult(heads.get(input.projectId));
        if (!currentValue) {
          await completion;
          return "not-found";
        }
        const current = parseDrawingProjectHeadV2(currentValue);
        if (current.activeStorageRevision !== input.expectedRevision) {
          await completion;
          return "stale";
        }
        heads.delete(input.projectId);
        await cursorDeleteProjectVersions(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.versions), input.projectId);
        transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.previews).delete(input.projectId);
        transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.auxiliary).delete(input.projectId);
        transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.tombstones).put(input.tombstone);
        await completion;
        return "committed";
      } catch (error) {
        return mapStorageError(error, "indexeddb.delete-v2");
      }
    },

    async putLegacyOnlyTombstone(tombstone) {
      parseDrawingProjectLegacyDeleteTombstoneV1(tombstone);
      try {
        const database = await getDatabase();
        const transaction = database.transaction([DRAWING_PROJECT_INDEXED_DB.stores.heads, DRAWING_PROJECT_INDEXED_DB.stores.tombstones], "readwrite");
        const completion = transactionCompletion(transaction);
        const head = await requestResult(transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.heads).get(tombstone.projectId));
        if (head) {
          await completion;
          return "v2-exists";
        }
        transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.tombstones).put(tombstone);
        await completion;
        return "committed";
      } catch (error) {
        return mapStorageError(error, "indexeddb.legacy-tombstone");
      }
    },

    async removeTombstone(projectId) {
      try {
        const database = await getDatabase();
        const transaction = database.transaction(DRAWING_PROJECT_INDEXED_DB.stores.tombstones, "readwrite");
        const completion = transactionCompletion(transaction);
        transaction.objectStore(DRAWING_PROJECT_INDEXED_DB.stores.tombstones).delete(projectId);
        await completion;
      } catch (error) {
        mapStorageError(error, "indexeddb.remove-tombstone");
      }
    },

    async close() {
      if (databasePromise) (await databasePromise).close();
      databasePromise = null;
    },

    async deleteDatabase() {
      await adapter.close();
      await new Promise<void>((resolve, reject) => {
        const request = (options.indexedDB as IDBFactory).deleteDatabase(databaseName);
        request.addEventListener("success", () => resolve(), { once: true });
        request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB delete failed.")), { once: true });
        request.addEventListener("blocked", () => reject(new Error("IndexedDB delete was blocked.")), { once: true });
      });
    },
  };
  return adapter;
};
