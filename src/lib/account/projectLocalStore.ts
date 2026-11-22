import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import type { UnifiedEncodedAssetV2 } from "../animation/unifiedProjectStorageV2.ts";
import type { AccountProjectAssetEntry } from "./projectBundle.ts";

// (Nov 14, picture-by-picture saving) The browser's own copy of the account's long projects (IndexedDB).
// It does two jobs with the same records:
// 1. SAFETY: a save is written here first. Until the account confirms it holds everything, the project is "pending"
//    here, so a failed or interrupted save, a closed tab or a crash loses nothing: the save is finished later.
// 2. SPEED: every picture is kept by its fingerprint, so the computer that made a long animation opens it without
//    downloading its pictures again, and saves it again without packing them again.

// One project the browser holds: the newest version it saved (small; the description itself is kept beside it).
export type LocalProjectHead = {
  ownerId: string;
  projectId: string;
  state: "pending" | "saved";               // pending = the account has not confirmed this version yet
  expectedRevision: number | null;          // the account's revision this version was made from (null = a new project)
  revision: number;
  projectDigest: string;
  title: string;
  updatedAt: string;
  provenance: UnifiedAnimationProjectV2["provenance"];
  assetIds: string[];
};
export type LocalProject = { head: LocalProjectHead; manifest: Uint8Array };

export type AccountProjectLocalStore = {
  // How every picture held here is stored (no bytes).
  assetEntries: () => Promise<Map<string, AccountProjectAssetEntry>>;
  getAsset: (assetId: string) => Promise<UnifiedEncodedAssetV2 | null>;
  putAsset: (asset: UnifiedEncodedAssetV2) => Promise<void>;
  getProject: (ownerId: string, projectId: string) => Promise<LocalProject | null>;
  putProject: (project: LocalProject) => Promise<void>;
  deleteProject: (ownerId: string, projectId: string) => Promise<void>;
  listHeads: (ownerId: string) => Promise<LocalProjectHead[]>;
  // Drops every picture that no project held here uses any more.
  prune: () => Promise<void>;
};

const entryOf = ({ assetId, sha256, byteLength, encoding, compression, compressedByteLength }: UnifiedEncodedAssetV2): AccountProjectAssetEntry =>
  compression ? { assetId, sha256, byteLength, encoding, compression, compressedByteLength } : { assetId, sha256, byteLength, encoding };

// The same store kept in memory: the fallback when the browser refuses its own storage (private window, full disk),
// and what the tests use.
export const createMemoryProjectStore = (): AccountProjectLocalStore => {
  const assets = new Map<string, UnifiedEncodedAssetV2>();
  const projects = new Map<string, LocalProject>();
  const key = (ownerId: string, projectId: string) => `${ownerId}\n${projectId}`;
  return {
    assetEntries: async () => new Map([...assets.values()].map(asset => [asset.assetId, entryOf(asset)])),
    getAsset: async assetId => assets.get(assetId) ?? null,
    putAsset: async asset => { assets.set(asset.assetId, asset); },
    getProject: async (ownerId, projectId) => projects.get(key(ownerId, projectId)) ?? null,
    putProject: async project => { projects.set(key(project.head.ownerId, project.head.projectId), project); },
    deleteProject: async (ownerId, projectId) => { projects.delete(key(ownerId, projectId)); },
    listHeads: async ownerId => [...projects.values()].map(project => project.head).filter(head => head.ownerId === ownerId),
    prune: async () => {
      const used = new Set([...projects.values()].flatMap(project => project.head.assetIds));
      for (const assetId of [...assets.keys()]) if (!used.has(assetId)) assets.delete(assetId);
    },
  };
};

const DB_NAME = "diamond-account-projects-v1";
const STORES = { assets: "assets", assetEntries: "assetEntries", heads: "heads", manifests: "manifests" } as const;

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error ?? new Error("storage_read_failed"));
});
const completion = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("storage_write_failed"));
});

let opened: Promise<IDBDatabase> | null = null;
const database = () => opened ??= new Promise<IDBDatabase>((resolve, reject) => {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore(STORES.assets, { keyPath: "assetId" });
    db.createObjectStore(STORES.assetEntries, { keyPath: "assetId" });
    db.createObjectStore(STORES.heads, { keyPath: ["ownerId", "projectId"] });
    db.createObjectStore(STORES.manifests, { keyPath: ["ownerId", "projectId"] });
  };
  open.onsuccess = () => {
    open.result.onclose = open.result.onversionchange = () => { open.result.close(); opened = null; };
    // Ask the browser never to clear this storage by itself (it holds saves the account has not confirmed yet).
    void navigator.storage?.persist?.().catch(() => undefined);
    resolve(open.result);
  };
  open.onerror = () => { opened = null; reject(open.error ?? new Error("storage_read_failed")); };
  open.onblocked = () => { opened = null; reject(new Error("storage_read_failed")); };
});

const browserStore: AccountProjectLocalStore = {
  assetEntries: async () => {
    const db = await database();
    const entries = await request(db.transaction(STORES.assetEntries, "readonly").objectStore(STORES.assetEntries).getAll()) as AccountProjectAssetEntry[];
    return new Map(entries.map(entry => [entry.assetId, entry]));
  },
  getAsset: async assetId => {
    const db = await database();
    return (await request(db.transaction(STORES.assets, "readonly").objectStore(STORES.assets).get(assetId)) as UnifiedEncodedAssetV2 | undefined) ?? null;
  },
  putAsset: async asset => {
    const db = await database();
    const transaction = db.transaction([STORES.assets, STORES.assetEntries], "readwrite");
    transaction.objectStore(STORES.assets).put(asset);
    transaction.objectStore(STORES.assetEntries).put(entryOf(asset));
    await completion(transaction);
  },
  getProject: async (ownerId, projectId) => {
    const db = await database();
    const transaction = db.transaction([STORES.heads, STORES.manifests], "readonly");
    const [head, manifest] = await Promise.all([
      request(transaction.objectStore(STORES.heads).get([ownerId, projectId])) as Promise<LocalProjectHead | undefined>,
      request(transaction.objectStore(STORES.manifests).get([ownerId, projectId])) as Promise<{ manifest: Uint8Array } | undefined>,
    ]);
    return head && manifest ? { head, manifest: manifest.manifest } : null;
  },
  putProject: async ({ head, manifest }) => {
    const db = await database();
    const transaction = db.transaction([STORES.heads, STORES.manifests], "readwrite");
    transaction.objectStore(STORES.heads).put(head);
    transaction.objectStore(STORES.manifests).put({ ownerId: head.ownerId, projectId: head.projectId, manifest });
    await completion(transaction);
  },
  deleteProject: async (ownerId, projectId) => {
    const db = await database();
    const transaction = db.transaction([STORES.heads, STORES.manifests], "readwrite");
    transaction.objectStore(STORES.heads).delete([ownerId, projectId]);
    transaction.objectStore(STORES.manifests).delete([ownerId, projectId]);
    await completion(transaction);
  },
  listHeads: async ownerId => {
    const db = await database();
    const heads = await request(db.transaction(STORES.heads, "readonly").objectStore(STORES.heads).getAll()) as LocalProjectHead[];
    return heads.filter(head => head.ownerId === ownerId);
  },
  prune: async () => {
    const db = await database();
    const transaction = db.transaction([STORES.heads, STORES.assets, STORES.assetEntries], "readwrite");
    const done = completion(transaction);
    const [heads, assetIds] = await Promise.all([
      request(transaction.objectStore(STORES.heads).getAll()) as Promise<LocalProjectHead[]>,
      request(transaction.objectStore(STORES.assetEntries).getAllKeys()),
    ]);
    const used = new Set(heads.flatMap(head => head.assetIds));
    for (const assetId of assetIds) if (typeof assetId === "string" && !used.has(assetId)) {
      transaction.objectStore(STORES.assets).delete(assetId);
      transaction.objectStore(STORES.assetEntries).delete(assetId);
    }
    await done;
  },
};

// The browser's store. Whatever it refuses (no storage, full disk) is kept in memory instead, so a save still goes
// through to the account; only the "finish it later" safety is then missing for that picture or project.
export const createBrowserProjectStore = (): AccountProjectLocalStore => {
  const memory = createMemoryProjectStore();
  return {
    assetEntries: async () => new Map([...await browserStore.assetEntries().catch(() => new Map<string, AccountProjectAssetEntry>()), ...await memory.assetEntries()]),
    getAsset: async assetId => await memory.getAsset(assetId) ?? await browserStore.getAsset(assetId).catch(() => null),
    putAsset: asset => browserStore.putAsset(asset).catch(() => memory.putAsset(asset)),
    getProject: async (ownerId, projectId) => await memory.getProject(ownerId, projectId) ?? await browserStore.getProject(ownerId, projectId).catch(() => null),
    putProject: project => browserStore.putProject(project).then(() => memory.deleteProject(project.head.ownerId, project.head.projectId), () => memory.putProject(project)),
    deleteProject: async (ownerId, projectId) => { await memory.deleteProject(ownerId, projectId); await browserStore.deleteProject(ownerId, projectId).catch(() => undefined); },
    listHeads: async ownerId => {
      const held = await memory.listHeads(ownerId);
      const stored = await browserStore.listHeads(ownerId).catch(() => [] as LocalProjectHead[]);
      return [...held, ...stored.filter(head => !held.some(other => other.projectId === head.projectId))];
    },
    prune: async () => { await browserStore.prune().catch(() => undefined); },
  };
};
